package live.airuncoach.airuncoach.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.repository.RunRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject

/**
 * SamsungWatchManager
 *
 * Bridges the Android app ↔ the Wear OS (Samsung Galaxy Watch) companion app via Google's
 * Wear OS Data Layer API (MessageClient/CapabilityClient) — the real, only transport for a
 * Wear OS watch, replacing the earlier Tizen/Samsung-Accessory-SDK-shaped stub this class
 * used to be.
 *
 * Deliberately structured to mirror [GarminWatchManager]'s public surface 1:1 (same callback
 * properties, same message vocabulary/field names) so the two managers can be wired into the
 * same call sites with near-identical code — see RunTrackingService.kt / RunSessionViewModel.kt.
 * There is no shared interface between them (matches the existing GarminWatchManager pattern
 * of a standalone concrete class); [WatchBiometricFrame] is the one type genuinely shared.
 *
 * Note: a Wear OS watch pairs with any Android phone, not only Samsung ones — this class no
 * longer gates on `Build.MANUFACTURER` (that was a leftover Samsung-Accessory-SDK assumption
 * that doesn't apply to Wear OS's Data Layer API).
 */
class SamsungWatchManager(
    private val context: Context,
    private val runRepository: RunRepository? = null,
    private val apiService: live.airuncoach.airuncoach.network.ApiService? = null
) {

    companion object {
        private const val TAG = "SamsungWatchManager"
        // Must match the capability declared in wear/src/main/res/values/wear.xml
        const val CAPABILITY_WEAR_APP = "airuncoach_wear_app"
        // Single message path — mirrors ConnectIQ's flexible payload-with-"type"-key design
        // rather than one Data Layer path per message type, so the dispatch shape stays a
        // straight port of GarminWatchManager.handleWatchMessage()'s `when (type)` switch.
        private const val MESSAGE_PATH = "/airuncoach/message"
        const val PREF_WATCH_APP_VERSION = "wear_watch_installed_version"
        private const val PREFS_NAME = "wear_watch_prefs"
        private const val NOTIF_CHANNEL_ID = "wear_watch_run"
        private const val NOTIF_ID_WATCH_RUN = 9101
        private const val NOTIF_ID_SYNC_COMPLETE = 9102
        private const val NOTIF_ID_PENDING_SYNC = 9103

        private const val SESSION_TYPE_RETRY_MAX = 3
        private const val SESSION_TYPE_RETRY_DELAY_MS = 1500L
    }

    private val scope = CoroutineScope(Dispatchers.Main + Job())

    // ── Public state ──────────────────────────────────────────────────────────
    private val _isWatchConnected = MutableStateFlow(false)
    val isWatchConnected: StateFlow<Boolean> = _isWatchConnected

    /** True once a node advertising [CAPABILITY_WEAR_APP] is found — i.e. the watch app is installed. */
    private val _isCompanionAppInstalled = MutableStateFlow(false)
    val isCompanionAppInstalled: StateFlow<Boolean> = _isCompanionAppInstalled

    private val _hasPendingWatchSync = MutableStateFlow(false)
    val hasPendingWatchSync: StateFlow<Boolean> = _hasPendingWatchSync

    private val _runSyncedEvent = MutableStateFlow(0L)
    val runSyncedEvent: StateFlow<Long> = _runSyncedEvent

    /**
     * Companion session ID fetched when the watch starts a run. Sent with the phone's own
     * run upload so the backend can deterministically link/enrich from the companion batch
     * instead of relying on a fuzzy distance-tolerance match. Mirrors
     * [GarminWatchManager.activeCompanionSessionId] exactly — see that property's doc comment
     * for the full rationale; the Wear OS watch app's DirectHttpApiClient posts to the exact
     * same garmin-companion endpoint family (shared table, brand-agnostic).
     */
    var activeCompanionSessionId: String? = null
        private set

    private var companionSessionFetchJob: kotlinx.coroutines.Job? = null

    /** Re-sent on retry since the session row may not exist server-side the instant "start" fires. */
    private fun fetchAndCacheCompanionSession(retries: Int = 5) {
        val api = apiService ?: return
        companionSessionFetchJob?.cancel()
        activeCompanionSessionId = null
        companionSessionFetchJob = CoroutineScope(Dispatchers.IO).launch {
            for (attempt in 1..retries) {
                try {
                    val response = api.getGarminCompanionSession()
                    val sessionId = response.session?.sessionId
                    if (sessionId != null) {
                        activeCompanionSessionId = sessionId
                        Log.d(TAG, "cached companion session $sessionId")
                        return@launch
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "could not fetch companion session (attempt $attempt) — ${e.message}")
                }
                if (attempt < retries) kotlinx.coroutines.delay(1000)
            }
        }
    }

    /**
     * Restores [activeCompanionSessionId] after an OS-kill respawn — see
     * RunTrackingService.reattachToWatchSession. The ID here comes from
     * GET /api/garmin-companion/session/recoverable, not a fresh fetch.
     */
    fun restoreActiveCompanionSession(sessionId: String) {
        companionSessionFetchJob?.cancel()
        activeCompanionSessionId = sessionId
    }

    /** Invoked when a command message arrives from the watch. */
    var onWatchCommand: ((action: String) -> Unit)? = null

    /** Invoked when the watch sends a GPS fix during a phone-controlled run. */
    var onWatchGpsUpdate: ((Double, Double, Double?, Float?) -> Unit)? = null

    /** Invoked when the watch sends the full biometric + dynamics frame (~2 s). */
    var onWatchSensorData: ((WatchBiometricFrame) -> Unit)? = null

    /** Invoked when the watch companion app is resolved and ready to receive messages. */
    var onWatchAppReady: (() -> Unit)? = null

    fun getInstalledWatchVersion(): String? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_WATCH_APP_VERSION, null)

    // ── Watch-only run tracking (mirrors GarminWatchManager's Scenario 3 bootstrap) ────
    private var watchOnlyRunActive = false

    // ── Cached auth / prepared-run / session-type state (resent on "watchReady") ───────
    private var cachedAuthToken: String? = null
    private var cachedRunnerName: String = ""
    private var cachedUserMaxHr: Int = 185
    private var cachedPreparedRunPayload: Map<String, Any>? = null
    private var cachedSessionType: String? = null

    // ── sessionType delivery retry (Data Layer MessageClient is also fire-and-forget) ──
    private val sessionTypeRetryHandler = Handler(Looper.getMainLooper())
    private var sessionTypeRetryRunnable: Runnable? = null
    private var sessionTypeAcked = true
    private var pendingSessionType: String? = null
    private var sessionTypeRetryCount = 0

    // ── Data Layer handles ───────────────────────────────────────────────────
    private var connectedNodeId: String? = null

    private val messageClient: MessageClient by lazy { Wearable.getMessageClient(context) }
    private val capabilityClient: CapabilityClient by lazy { Wearable.getCapabilityClient(context) }

    private val messageListener = MessageClient.OnMessageReceivedListener { event: MessageEvent ->
        if (event.path == MESSAGE_PATH) {
            handleWatchMessage(event.data)
        }
    }

    private val capabilityListener = CapabilityClient.OnCapabilityChangedListener { info: CapabilityInfo ->
        updateFromCapability(info)
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    fun initialize() {
        try {
            messageClient.addListener(messageListener)
            capabilityClient.addListener(capabilityListener, CAPABILITY_WEAR_APP)
            scope.launch {
                try {
                    val info = withContext(Dispatchers.IO) {
                        Tasks.await(capabilityClient.getCapability(CAPABILITY_WEAR_APP, CapabilityClient.FILTER_REACHABLE))
                    }
                    updateFromCapability(info)
                } catch (e: Exception) {
                    Log.d(TAG, "initialize: no reachable wear app yet (${e.message})")
                }
            }
            Log.d(TAG, "Wear OS Data Layer listeners registered")
        } catch (e: Exception) {
            Log.e(TAG, "SamsungWatchManager init failed: ${e.message}")
        }
    }

    fun shutdown() {
        try {
            messageClient.removeListener(messageListener)
            capabilityClient.removeListener(capabilityListener)
        } catch (e: Exception) {
            Log.w(TAG, "shutdown: ${e.message}")
        }
        _isWatchConnected.value = false
        _isCompanionAppInstalled.value = false
        connectedNodeId = null
    }

    private fun updateFromCapability(info: CapabilityInfo) {
        val node: Node? = info.nodes.firstOrNull { it.isNearby } ?: info.nodes.firstOrNull()
        connectedNodeId = node?.id
        _isCompanionAppInstalled.value = info.nodes.isNotEmpty()
        _isWatchConnected.value = node != null
        if (node != null) {
            Log.d(TAG, "Wear app resolved on node: ${node.displayName}")
            onWatchAppReady?.invoke()
        }
    }

    fun getConnectedDeviceName(): String? =
        connectedNodeId?.let { id ->
            try {
                Tasks.await(Wearable.getNodeClient(context).connectedNodes)
                    .firstOrNull { it.id == id }?.displayName
            } catch (e: Exception) {
                null
            }
        }

    // ── Outbound messages (mirror GarminWatchManager's method surface) ─────────

    fun sendAuth(authToken: String, runnerName: String, userAge: Int? = null) {
        cachedAuthToken = authToken
        cachedRunnerName = runnerName
        if (userAge != null && userAge > 0) {
            cachedUserMaxHr = (208 - (0.7 * userAge).toInt()).coerceIn(155, 210)
        }
        sendToWatch(mapOf(
            "type" to "auth",
            "authToken" to authToken,
            "runnerName" to runnerName,
            "maxHr" to cachedUserMaxHr
        ))
    }

    fun sendRunUpdate(
        paceSecPerKm: Double,
        distanceMetres: Double,
        heartRate: Int,
        elapsedSeconds: Long,
        cadence: Int,
        isRunning: Boolean,
        isPaused: Boolean
    ) {
        sendToWatch(mapOf(
            "type" to "runUpdate",
            "pace" to paceSecPerKm,
            "distance" to distanceMetres,
            "hr" to heartRate,
            "elapsedTime" to elapsedSeconds,
            "cadence" to cadence,
            "isRunning" to isRunning,
            "isPaused" to isPaused
        ))
    }

    fun sendStartRun() {
        sendToWatch(mapOf("type" to "startRun"))
    }

    fun sendStartAck() {
        sendToWatch(mapOf("type" to "startAck"))
        Log.d(TAG, "Sent startAck to watch")
    }

    fun sendPreparedRun(
        distanceKm: Float,
        runType: String,
        workoutType: String? = null,
        workoutIntensity: String? = null,
        workoutDesc: String? = null,
        routePolyline: String? = null,
        targetPace: String? = null,
        intervalCount: Int? = null,
        intervalDistKm: Float? = null,
        intervalDurSecs: Int? = null,
        plannedWorkoutId: String? = null,
        sessionType: String = "run"
    ) {
        val payload = mutableMapOf<String, Any>(
            "type" to "preparedRun",
            "distance" to distanceKm,
            "runType" to runType,
            "sessionType" to sessionType
        )
        workoutType?.let { payload["workoutType"] = it }
        workoutIntensity?.let { payload["workoutIntensity"] = it }
        workoutDesc?.let { payload["workoutDesc"] = it }
        routePolyline?.let { payload["routePolyline"] = it }
        targetPace?.let { payload["targetPace"] = it }
        intervalCount?.let { payload["intervalCount"] = it }
        intervalDistKm?.let { payload["intervalDistKm"] = it }
        intervalDurSecs?.let { payload["intervalDurSecs"] = it }
        plannedWorkoutId?.let { payload["plannedWorkoutId"] = it }

        Log.d(TAG, "Sending preparedRun to watch: type=$runType dist=${distanceKm}km workout=$workoutType")
        cachedPreparedRunPayload = payload
        sendToWatch(payload)
    }

    fun clearPendingPreparedRun() {
        cachedPreparedRunPayload = null
        Log.d(TAG, "Pending prepared-run cache cleared")
    }

    /**
     * The runner backed out of a prepared session on the phone before starting it: tell the
     * watch, so it drops the coached start screen and returns to prepare-on-phone rather than
     * offering a session that no longer exists. No-op if nothing was prepared.
     */
    fun cancelPreparedRun() {
        if (cachedPreparedRunPayload == null) return
        cachedPreparedRunPayload = null
        sendToWatch(mapOf("type" to "preparedRunCancelled"))
        Log.d(TAG, "preparedRunCancelled sent to watch")
    }

    fun sendSessionType(sessionType: String) {
        cachedSessionType = sessionType
        pendingSessionType = sessionType
        sessionTypeAcked = false
        sessionTypeRetryCount = 0
        sessionTypeRetryRunnable?.let { sessionTypeRetryHandler.removeCallbacks(it) }
        transmitSessionTypeAttempt()
    }

    private fun transmitSessionTypeAttempt() {
        val sessionType = pendingSessionType ?: return
        sendToWatch(mapOf("type" to "sessionType", "sessionType" to sessionType))
        Log.d(TAG, "Sent sessionType to watch: $sessionType (attempt ${sessionTypeRetryCount + 1}/$SESSION_TYPE_RETRY_MAX)")

        if (sessionTypeRetryCount >= SESSION_TYPE_RETRY_MAX - 1) { return }
        sessionTypeRetryCount++
        val runnable = Runnable {
            if (!sessionTypeAcked && pendingSessionType == sessionType) {
                transmitSessionTypeAttempt()
            }
        }
        sessionTypeRetryRunnable = runnable
        sessionTypeRetryHandler.postDelayed(runnable, SESSION_TYPE_RETRY_DELAY_MS)
    }

    private fun onSessionTypeAcked() {
        sessionTypeAcked = true
        pendingSessionType = null
        sessionTypeRetryRunnable?.let { sessionTypeRetryHandler.removeCallbacks(it) }
        sessionTypeRetryRunnable = null
        Log.d(TAG, "Watch acked sessionType receipt")
    }

    fun sendSessionEnded() {
        sendToWatch(mapOf("type" to "sessionEnded"))
    }

    fun sendStopAck() {
        sendToWatch(mapOf("type" to "stopAck"))
        Log.d(TAG, "Sent stopAck to watch")
    }

    /**
     * Acknowledge a watch "pause"/"resume" command so the watch can cancel its pause/resume
     * retry loop (see RunSessionController.kt's pauseRetry/resumeRetry). Ported from the same
     * fix on the Garmin side (2026-09): pause/resume previously had no ack at all, unlike
     * start/stop — a dropped Data Layer message left the watch paused with the phone never
     * finding out, silently diverging the phone's timer/distance from the watch's.
     */
    fun sendPauseAck() {
        sendToWatch(mapOf("type" to "pauseAck"))
        Log.d(TAG, "Sent pauseAck to watch")
    }

    fun sendResumeAck() {
        sendToWatch(mapOf("type" to "resumeAck"))
        Log.d(TAG, "Sent resumeAck to watch")
    }

    fun disconnect() {
        sendToWatch(mapOf("type" to "disconnect"))
    }

    /** Returns true once a reachable node advertises the wear-app capability. */
    fun isWatchAppInstalled(): Boolean = _isCompanionAppInstalled.value

    /**
     * Deep-links to the Play Store listing for the Wear OS app — Wear OS apps distribute via
     * Play Store even on Samsung hardware (this replaces the old Galaxy Store deep link, which
     * was a Tizen-era assumption that doesn't apply here).
     */
    fun openPlayStoreForWatchApp() {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = android.net.Uri.parse("market://details?id=airuncoach.live.samsung_watch_app")
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open Play Store: ${e.message}")
        }
    }

    fun destroy() {
        scope.cancel()
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun logWatchCrash(message: String) {
        try {
            val file = java.io.File(context.filesDir, "wear_watch_crashes.log")
            file.appendText("${java.time.Instant.now()} $message\n")
            val lines = file.readLines()
            if (lines.size > 200) {
                file.writeText(lines.takeLast(200).joinToString("\n") + "\n")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to persist watch crash log: ${e.message}")
        }
    }

    private fun sendToWatch(payload: Map<String, Any>) {
        val nodeId = connectedNodeId ?: return
        try {
            val json = JSONObject(payload).toString()
            messageClient.sendMessage(nodeId, MESSAGE_PATH, json.toByteArray(Charsets.UTF_8))
                .addOnFailureListener { e -> Log.w(TAG, "sendToWatch failed: ${e.message}") }
        } catch (e: Exception) {
            Log.w(TAG, "sendToWatch error: ${e.message}")
        }
    }

    private fun handleWatchMessage(data: ByteArray?) {
        try {
            if (data == null) return
            val map = jsonToMap(JSONObject(String(data, Charsets.UTF_8)))
            val type = map["type"] as? String ?: return
            when (type) {
                "hello" -> {
                    val watchVersion = map["appVersion"] as? String
                    if (!watchVersion.isNullOrBlank()) {
                        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                            .edit().putString(PREF_WATCH_APP_VERSION, watchVersion).apply()
                        Log.d(TAG, "Watch app version reported: $watchVersion")
                    }
                }
                "command" -> handleCommand(map)
                "watchData" -> handleWatchData(map)
            }
        } catch (e: Exception) {
            Log.w(TAG, "handleWatchMessage: ${e.message}")
        }
    }

    private fun handleCommand(map: Map<String, Any?>) {
        val action = map["action"] as? String ?: return
        Log.d(TAG, "Watch command: $action")

        if (action == "syncComplete") {
            val companionRunId = map["runId"]?.toString()
            val session = map["sessionId"] as? String
            Log.d(TAG, "syncComplete received — runId=$companionRunId session=$session")
            _hasPendingWatchSync.value = false
            dismissPendingSyncNotification()
            runRepository?.clearAllCaches()
            _runSyncedEvent.value = System.currentTimeMillis()
            val phoneUploadId = RunTrackingService.uploadComplete.value
            val notifRunId = if (!phoneUploadId.isNullOrBlank()) phoneUploadId else companionRunId
            showOfflineSyncNotification(notifRunId)
            return
        }

        if (action == "sessionTypeAck") {
            onSessionTypeAcked()
            return
        }

        if (action == "pendingSync") {
            Log.d(TAG, "pendingSync received — watch has an offline run ready to upload")
            _hasPendingWatchSync.value = true
            showPendingSyncNotification()
            return
        }

        if (action == "watchReady") {
            val lastCrash = map["lastCrash"] as? String
            if (lastCrash != null) {
                Log.e(TAG, "Wear watch reported a crash from its previous run: $lastCrash")
                logWatchCrash(lastCrash)
            }
            val hasPending = map["hasPendingSync"] as? Boolean ?: false
            if (hasPending) {
                Log.d(TAG, "watchReady: watch has pending offline run — showing sync indicator")
                _hasPendingWatchSync.value = true
                watchOnlyRunActive = false
                Log.d(TAG, "watchReady+hasPendingSync: forwarding WATCH_RUN_FINISHED (dropped-stop recovery)")
                try {
                    val finishIntent = Intent(context, RunTrackingService::class.java).apply {
                        this.action = RunTrackingService.ACTION_WATCH_RUN_FINISHED
                    }
                    context.startService(finishIntent)
                } catch (e: Exception) {
                    Log.w(TAG, "watchReady+hasPendingSync: could not forward WATCH_RUN_FINISHED: ${e.message}")
                }
            }
            val token = cachedAuthToken
            if (token != null) {
                Log.d(TAG, "watchReady received — auto-sending cached auth to watch")
                sendAuth(token, cachedRunnerName)
            } else {
                Log.d(TAG, "watchReady received — no cached auth, firing onWatchAppReady")
                onWatchAppReady?.invoke()
            }
            cachedPreparedRunPayload?.let { payload ->
                Log.d(TAG, "watchReady received — resending cached preparedRun to watch")
                sendToWatch(payload)
            }
            cachedSessionType?.let { sType ->
                Log.d(TAG, "watchReady received — resending cached sessionType to watch: $sType")
                sendToWatch(mapOf("type" to "sessionType", "sessionType" to sType))
            }
            onWatchCommand?.invoke(action)
            return
        }

        if (action == "start") {
            cachedPreparedRunPayload = null
            if (_hasPendingWatchSync.value) {
                Log.d(TAG, "Watch START received — clearing stale hasPendingWatchSync flag")
                _hasPendingWatchSync.value = false
                dismissPendingSyncNotification()
            }
            sendStartAck()
            // Fetch the active companion session ID so it can be linked at upload time
            fetchAndCacheCompanionSession()
        }

        if (action == "stop") {
            sendStopAck()
            Log.d(TAG, "Watch STOP received — sent stopAck immediately")
        }

        if (action == "pause") {
            sendPauseAck()
            Log.d(TAG, "Watch PAUSE received — sent pauseAck immediately")
        } else if (action == "resume") {
            sendResumeAck()
            Log.d(TAG, "Watch RESUME received — sent resumeAck immediately")
        }

        if (onWatchCommand == null) {
            when (action) {
                "start" -> {
                    showWatchRunNotification()
                    watchOnlyRunActive = true
                    try {
                        val intent = Intent(context, RunTrackingService::class.java).apply {
                            this.action = RunTrackingService.ACTION_START_TRACKING_FROM_WATCH
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            context.startForegroundService(intent)
                        } else {
                            context.startService(intent)
                        }
                        Log.d(TAG, "⌚ Watch-only run started — bootstrapped RunTrackingService (ACTION_START_TRACKING_FROM_WATCH)")
                    } catch (e: Exception) {
                        Log.w(TAG, "⌚ Could not start RunTrackingService for watch-only run: ${e.message}")
                    }
                }
                "stop" -> {
                    cancelWatchRunNotification()
                    watchOnlyRunActive = false
                    try {
                        val stopIntent = Intent(context, RunTrackingService::class.java).apply {
                            this.action = RunTrackingService.ACTION_STOP_TRACKING
                        }
                        context.startService(stopIntent)
                        Log.d(TAG, "⌚ Watch STOP (no listener) — forwarded ACTION_STOP_TRACKING to RunTrackingService")
                    } catch (e: Exception) {
                        Log.w(TAG, "⌚ Could not forward stop to RunTrackingService: ${e.message}")
                    }
                }
                // Same gap GarminWatchManager had: pause/resume fell through to the null
                // onWatchCommand below and were silently dropped while start/stop had a
                // fallback — and sendPauseAck()/sendResumeAck() above have already told the
                // watch the phone got it, so the watch cancels its retry and the phone keeps
                // recording. Fixed on both managers together on 2026-09-14; the Wear path was
                // never reported broken only because it has had far less on-device use.
                "pause", "resume" -> {
                    val serviceAction = if (action == "pause") {
                        RunTrackingService.ACTION_PAUSE_TRACKING
                    } else {
                        RunTrackingService.ACTION_RESUME_TRACKING
                    }
                    try {
                        context.startService(
                            Intent(context, RunTrackingService::class.java).apply {
                                this.action = serviceAction
                            }
                        )
                        Log.d(TAG, "⌚ Watch ${action.uppercase()} (no listener) — forwarded $serviceAction to RunTrackingService")
                    } catch (e: Exception) {
                        Log.w(TAG, "⌚ Could not forward $action to RunTrackingService: ${e.message}")
                    }
                }
            }
        } else {
            onWatchCommand?.invoke(action)
        }
    }

    private fun handleWatchData(map: Map<String, Any?>) {
        fun num(key: String) = map[key] as? Number
        val lat = num("lat")?.toDouble()
        val lng = num("lng")?.toDouble()
        val altM = num("alt")?.toDouble()
        val speed = num("speed")?.toFloat()
        val bear = num("bear")?.toFloat()
        val acc = num("acc")?.toFloat()
        val hr = num("hr")?.toInt() ?: 0
        val hrz = num("hrz")?.toInt() ?: 1
        val cad = num("cad")?.toInt() ?: 0
        val gct = num("gct")?.toFloat() ?: 0f
        val gcb = num("gcb")?.toFloat() ?: 50f
        val vo = num("vo")?.toFloat() ?: 0f
        val vr = num("vr")?.toFloat() ?: 0f
        val sl = num("sl")?.toFloat() ?: 0f
        val te = num("te")?.toFloat() ?: 0f
        val ate = num("ate")?.toFloat() ?: 0f
        val rt = num("rt")?.toInt() ?: 0
        val vo2 = num("vo2")?.toFloat() ?: 0f
        val pwr = num("pwr")?.toInt() ?: 0
        val resp = num("resp")?.toFloat() ?: 0f
        val pres = num("pres")?.toFloat() ?: 0f
        val elap = num("elap")?.toInt() ?: 0
        val baroAlt = num("baroAlt")?.toFloat() ?: 0f
        val dist = num("dist")?.toFloat()

        val frame = WatchBiometricFrame(
            elapsedSeconds = elap,
            lat = lat,
            lng = lng,
            altMetres = altM,
            speedMs = speed,
            bearingDeg = bear,
            gpsAccuracy = acc,
            heartRate = hr,
            heartRateZone = hrz,
            cadence = cad,
            groundContactTime = gct,
            groundContactBalance = gcb,
            verticalOscillation = vo,
            verticalRatio = vr,
            strideLength = sl,
            aerobicTrainingEffect = te,
            anaerobicTrainingEffect = ate,
            recoveryTimeMinutes = rt,
            vo2MaxEstimate = vo2,
            runningPower = pwr,
            respirationRate = resp,
            ambientPressure = pres,
            baroAltitude = baroAlt,
            cumulativeDistanceM = dist,
        )

        if (lat != null && lng != null) {
            onWatchGpsUpdate?.invoke(lat, lng, altM, speed)
        }
        onWatchSensorData?.invoke(frame)
    }

    private fun jsonToMap(json: JSONObject): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            map[key] = json.opt(key)
        }
        return map
    }

    // ── Notifications (parallel to GarminWatchManager's, Samsung-worded, distinct IDs) ──

    private fun showOfflineSyncNotification(runId: String?) {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    NOTIF_CHANNEL_ID, "Watch Run", NotificationManager.IMPORTANCE_DEFAULT
                ).apply { description = "Samsung/Wear OS watch run notifications" }
                nm.createNotificationChannel(channel)
            }
            val mainClass = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
            mainClass.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (runId != null) mainClass.putExtra("deeplink_run_id", runId)
            val tapIntent = PendingIntent.getActivity(
                context, NOTIF_ID_SYNC_COMPLETE, mainClass,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val notif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(R.drawable.notification_icon)
                .setContentTitle("Watch run synced!")
                .setContentText("Your offline run has been saved. Tap to view your summary.")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(tapIntent)
                .build()
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(context).notify(NOTIF_ID_SYNC_COMPLETE, notif)
            }
        } catch (e: Exception) {
            Log.w(TAG, "showOfflineSyncNotification failed: ${e.message}")
        }
    }

    private fun showPendingSyncNotification() {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    NOTIF_CHANNEL_ID, "Watch Run", NotificationManager.IMPORTANCE_HIGH
                ).apply { description = "Samsung/Wear OS watch run notifications" }
                nm.createNotificationChannel(channel)
            }
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
            launchIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            val tapIntent = PendingIntent.getActivity(
                context, NOTIF_ID_PENDING_SYNC, launchIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val notif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(R.drawable.notification_icon)
                .setContentTitle("Offline run detected from your watch")
                .setContentText("Open the AI Run Coach watch app to sync your run")
                .setStyle(NotificationCompat.BigTextStyle()
                    .bigText("You completed a run on your watch. Open the AI Run Coach watch app to sync it to your history."))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setContentIntent(tapIntent)
                .build()
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(context).notify(NOTIF_ID_PENDING_SYNC, notif)
            }
        } catch (e: Exception) {
            Log.w(TAG, "showPendingSyncNotification failed: ${e.message}")
        }
    }

    private fun dismissPendingSyncNotification() {
        try {
            NotificationManagerCompat.from(context).cancel(NOTIF_ID_PENDING_SYNC)
        } catch (e: Exception) {
            Log.w(TAG, "dismissPendingSyncNotification failed: ${e.message}")
        }
    }

    private fun showWatchRunNotification() {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    NOTIF_CHANNEL_ID, "Watch Session", NotificationManager.IMPORTANCE_LOW
                ).apply { description = "Shows when a Samsung/Wear OS watch session is in progress" }
                nm.createNotificationChannel(channel)
            }
            val mainClass = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val tapIntent = PendingIntent.getActivity(
                context, 0, mainClass ?: Intent(),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val notif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(R.drawable.notification_icon)
                .setContentTitle("Watch Session in Progress")
                .setContentText("Your session is being recorded. Open Ai Run Coach to see your summary when you're done.")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(tapIntent)
                .build()
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(context).notify(NOTIF_ID_WATCH_RUN, notif)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to show watch run notification: ${e.message}")
        }
    }

    private fun cancelWatchRunNotification() {
        NotificationManagerCompat.from(context).cancel(NOTIF_ID_WATCH_RUN)
    }
}
