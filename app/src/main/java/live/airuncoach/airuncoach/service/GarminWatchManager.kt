package live.airuncoach.airuncoach.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQApp
import com.garmin.android.connectiq.IQDevice
import com.garmin.android.connectiq.exception.InvalidStateException
import com.garmin.android.connectiq.exception.ServiceUnavailableException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * GarminWatchManager
 *
 * Bridges the Android app ↔ Garmin watch app via the ConnectIQ SDK
 * (com.garmin.connectiq:ciq-companion-app-sdk:2.3.0).
 *
 * Supports Scenario 2: Phone + Watch — phone owns the run session,
 * watch mirrors live metrics and sends back control commands over BT.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Phone → Watch                                                          │
 * │    "auth"         — push auth token + runner name on connect            │
 * │    "runUpdate"    — live pace / distance / HR / elapsed / pause state   │
 * │    "startRun"     — phone-initiated run (watch navigates to RunView)    │
 * │    "sessionEnded" — run finished (watch pops to StartView)              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Watch → Phone (via onWatchCommand callback)                            │
 * │    "start" | "pause" | "resume" | "stop" | "watchReady"                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Prerequisite: user's phone must have Garmin Connect app installed.
 */
/**
 * A single ~2-second biometric frame streamed from the Garmin companion watch.
 * Every field maps directly to a key in the "watchData" ConnectIQ message.
 * Fields are nullable — older watch models may not provide all of them.
 */
data class WatchBiometricFrame(
    val elapsedSeconds: Int,

    // GPS
    val lat: Double?,
    val lng: Double?,
    val altMetres: Double?,
    val speedMs: Float?,
    val bearingDeg: Float?,           // 0-360, 0 = North
    val gpsAccuracy: Float?,          // Garmin Pos.Quality 0-4 (4 = best)

    // Biometrics
    val heartRate: Int,               // bpm
    val heartRateZone: Int,           // 1-5
    val cadence: Int,                 // steps per minute

    // Running Dynamics (from Activity.Info — may be 0.0 if unsupported)
    val groundContactTime: Float,     // ms   (200-300 ms normal)
    val groundContactBalance: Float,  // %    (50 = perfect symmetry)
    val verticalOscillation: Float,   // cm   (6-8 cm efficient)
    val verticalRatio: Float,         // %    (8-10 % efficient)
    val strideLength: Float,          // m    per stride

    // Training Effect (updated periodically by watch firmware)
    val aerobicTrainingEffect: Float, // 0-5
    val anaerobicTrainingEffect: Float, // 0-5
    val recoveryTimeMinutes: Int,     // minutes until fully recovered
    val vo2MaxEstimate: Float,        // ml/kg/min

    // Power & Respiration (device-dependent — 0 if unsupported)
    val runningPower: Int,            // watts (Fenix 7/FR965 with Running Power app)
    val respirationRate: Float,       // breaths/min (Fenix 7 series)

    // Environmental
    val ambientPressure: Float,       // Pa (~101325 at sea level)

    // Barometric altitude — Activity.Info.altitude on Fenix/fēnix models uses the pressure
    // altimeter (more accurate than GPS altitude for elevation graphs).  Sent as "baroAlt" key.
    // Falls back to GPS altMetres when not available (0f = not present).
    val baroAltitude: Float = 0f,     // metres, barometric
)

class GarminWatchManager(private val context: Context) {

    companion object {
        private const val TAG = "GarminWatchManager"
        // Must match the UUID in garmin-companion-app/manifest.xml (production)
        const val APP_ID = "C7BF12555C184F9FB1F82B49E72E20A2"
        /** SharedPreferences key — the watch app version last reported via the "hello" message. */
        const val PREF_WATCH_APP_VERSION = "garmin_watch_installed_version"
        private const val PREFS_NAME = "garmin_watch_prefs"
        // Notification IDs / channel for watch-initiated (Scenario 3) passive monitoring
        private const val NOTIF_CHANNEL_ID  = "garmin_watch_run"
        private const val NOTIF_ID_WATCH_RUN    = 9001
        private const val NOTIF_ID_SYNC_COMPLETE = 9002
        private const val NOTIF_ID_PENDING_SYNC  = 9003   // "open watch app to sync" prompt
    }

    // ── Scenario 3: passive notification for watch-initiated runs ────────────

    /**
     * Show a persistent notification when the watch starts a run without the
     * phone app being in the foreground (Scenario 3). The watch is already
     * streaming full data to the backend via the Garmin Connect relay — this
     * notification just lets the user know so they can open the app after their
     * run to see their summary.
     */
    /**
     * Show a notification when an offline Garmin run batch has been synced to the server.
     * Tapping the notification navigates directly to that run's summary screen via the
     * existing [deeplink_run_id] Intent extra mechanism in MainActivity.
     */
    private fun showOfflineSyncNotification(runId: String?) {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    NOTIF_CHANNEL_ID,
                    "Watch Run",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply { description = "Garmin watch run notifications" }
                nm.createNotificationChannel(channel)
            }

            val mainClass = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent()
            mainClass.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (runId != null) {
                mainClass.putExtra("deeplink_run_id", runId)
            }
            val tapIntent = PendingIntent.getActivity(
                context, NOTIF_ID_SYNC_COMPLETE,
                mainClass,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val notif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setContentTitle("Garmin run synced!")
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
            Log.d(TAG, "Offline sync notification shown (runId=$runId)")
        } catch (e: Exception) {
            Log.w(TAG, "showOfflineSyncNotification failed: ${e.message}")
        }
    }

    /**
     * Shows a high-priority heads-up notification when the watch reports that an offline
     * run is waiting to be synced. Tapping opens the AI Run Coach app so the user can
     * open the watch app from there to trigger the sync.
     *
     * Uses [NotificationCompat.FLAG_ONLY_ALERT_ONCE] so repeated `pendingSync` messages
     * from the background-service retry loop don't keep buzzing the user — the notification
     * updates silently after the first delivery.
     */
    private fun showPendingSyncNotification() {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    NOTIF_CHANNEL_ID,
                    "Watch Run",
                    NotificationManager.IMPORTANCE_HIGH       // heads-up on first delivery
                ).apply { description = "Garmin watch run notifications" }
                nm.createNotificationChannel(channel)
            }

            // Tapping opens the main app — user can then open the watch app from the dashboard
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent()
            launchIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            val tapIntent = PendingIntent.getActivity(
                context, NOTIF_ID_PENDING_SYNC,
                launchIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val notif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setContentTitle("Offline run detected from your watch")
                .setContentText("Open the AI Run Coach watch app to sync your run")
                .setStyle(NotificationCompat.BigTextStyle()
                    .bigText("You completed a run on your Garmin watch. Open the AI Run Coach watch app to sync it to your history."))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(false)          // stays until the sync completes
                .setOnlyAlertOnce(true)        // silent update on background-service retries
                .setContentIntent(tapIntent)
                .build()

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(context).notify(NOTIF_ID_PENDING_SYNC, notif)
            }
            Log.d(TAG, "Pending sync notification shown")
        } catch (e: Exception) {
            Log.w(TAG, "showPendingSyncNotification failed: ${e.message}")
        }
    }

    /** Dismiss the pending-sync notification once the run has been successfully uploaded. */
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
            // Create channel (no-op on API < 26)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    NOTIF_CHANNEL_ID,
                    "Watch Run",
                    NotificationManager.IMPORTANCE_LOW
                ).apply { description = "Shows when a Garmin watch run is in progress" }
                nm.createNotificationChannel(channel)
            }
            // Tap notification → open app
            val mainClass = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val tapIntent = PendingIntent.getActivity(
                context, 0,
                mainClass ?: Intent(),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val notif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("Garmin Watch Run in Progress")
                .setContentText("Your run is being recorded. Open Ai Run Coach to see your summary when you're done.")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(tapIntent)
                .build()
            // POST_NOTIFICATIONS requires explicit grant on Android 13+. The SecurityException
            // is caught below so a missing permission is non-fatal (notification just won't show).
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(context).notify(NOTIF_ID_WATCH_RUN, notif)
            }
            Log.d(TAG, "Watch-initiated run notification shown (Scenario 3)")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to show watch run notification: ${e.message}")
        }
    }

    private fun cancelWatchRunNotification() {
        NotificationManagerCompat.from(context).cancel(NOTIF_ID_WATCH_RUN)
        Log.d(TAG, "Watch-initiated run notification dismissed")
    }

    // ── Public state ──────────────────────────────────────────────────────────
    private val _isWatchConnected = MutableStateFlow(false)
    val isWatchConnected: StateFlow<Boolean> = _isWatchConnected

    /**
     * True once [getApplicationInfo] confirms the AI Run Coach companion app
     * is installed on the paired watch.  Stays false if:
     *   - No watch is paired / connected
     *   - Garmin Connect app is not installed on the phone
     *   - The companion app has not been installed on the watch
     *
     * Use this to conditionally show "Prepare Run on Watch" in the UI.
     */
    private val _isCompanionAppInstalled = MutableStateFlow(false)
    val isCompanionAppInstalled: StateFlow<Boolean> = _isCompanionAppInstalled

    /**
     * True from the moment the watch reports a pending offline run batch (via
     * [hasPendingSync] in the "watchReady" message) until the watch confirms the
     * upload completed (via "syncComplete").  Used to show a brief indicator on
     * the dashboard — clears itself automatically, never shown unless relevant.
     */
    private val _hasPendingWatchSync = MutableStateFlow(false)
    val hasPendingWatchSync: StateFlow<Boolean> = _hasPendingWatchSync

    /** Invoked when a command message arrives from the watch. */
    var onWatchCommand: ((action: String) -> Unit)? = null

    /** Returns the last version string received from the watch, or null if never connected. */
    fun getInstalledWatchVersion(): String? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_WATCH_APP_VERSION, null)

    /**
     * Invoked when the watch sends a GPS fix during a phone-controlled run.
     * The watch enables its own GPS and streams coordinates every ~2 s so the
     * phone can use the superior Garmin multi-band antenna for distance tracking.
     * Callback args: (latDeg, lngDeg, altMetres?, speedMetresPerSec?)
     */
    var onWatchGpsUpdate: ((Double, Double, Double?, Float?) -> Unit)? = null

    /**
     * Invoked when the watch sends the full biometric + dynamics frame (~2 s).
     * Contains all 23+ metrics from the watch sensors, Activity.Info, and GPS.
     */
    var onWatchSensorData: ((WatchBiometricFrame) -> Unit)? = null

    /**
     * Invoked when the watch companion app is resolved and ready to receive messages.
     * Use this to proactively push an auth token as soon as the watch connects —
     * even before a run has started.
     */
    var onWatchAppReady: (() -> Unit)? = null

    // ── Cached auth credentials ───────────────────────────────────────────────
    // Stored whenever sendAuth() is called so we can auto-respond to "watchReady"
    // messages that arrive when no ViewModel has registered an onWatchCommand handler
    // (e.g. the user opens the watch app while the phone app is idle on the home screen).
    private var cachedAuthToken: String? = null
    private var cachedRunnerName: String = ""
    private var cachedUserMaxHr: Int = 185  // Default; updated from user profile on sendAuth

    // ── Cached prepared-run payload ───────────────────────────────────────────
    // Set by sendPreparedRun(); cleared by clearPendingPreparedRun() when the
    // run starts or is cancelled. Resent automatically whenever "watchReady"
    // arrives so the user can open phone/watch in any order.
    private var cachedPreparedRunPayload: Map<String, Any>? = null

    // ── Private SDK handles ───────────────────────────────────────────────────
    private var connectIQ: ConnectIQ? = null
    private var connectedDevice: IQDevice? = null
    private var iqApp: IQApp? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    fun initialize() {
        try {
            connectIQ = ConnectIQ.getInstance(context, ConnectIQ.IQConnectType.WIRELESS)
            connectIQ?.initialize(context, false, sdkListener)
            Log.d(TAG, "ConnectIQ SDK initialised")
        } catch (e: Exception) {
            Log.e(TAG, "ConnectIQ init failed: ${e.message}")
        }
    }

    fun shutdown() {
        try {
            connectedDevice?.let {
                connectIQ?.unregisterForDeviceEvents(it)
            }
            connectIQ?.shutdown(context)
        } catch (e: Exception) {
            Log.w(TAG, "shutdown: ${e.message}")
        }
        _isWatchConnected.value = false
        connectedDevice = null
        iqApp = null
    }

    /**
     * Get the display name of the currently connected Garmin device
     * @return Device name (e.g., "VivoActive 4") or null if no device connected
     */
    fun getConnectedDeviceName(): String? {
        return try {
            connectedDevice?.friendlyName
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get device name: ${e.message}")
            null
        }
    }

    // ── Phone → Watch ─────────────────────────────────────────────────────────

    /**
     * Sends authentication and user profile to the watch.
     * @param userAge Optional user age — used to compute personalised max HR for on-watch
     *                HR zone display using the Tanaka formula (208 − 0.7 × age).
     *                Defaults to 185 bpm if not provided.
     */
    fun sendAuth(authToken: String, runnerName: String, userAge: Int? = null) {
        // Cache credentials so we can auto-respond to future "watchReady" messages
        // without requiring a ViewModel to be active.
        cachedAuthToken = authToken
        cachedRunnerName = runnerName
        // Tanaka formula for max HR: more accurate than 220-age for active adults
        if (userAge != null && userAge > 0) {
            cachedUserMaxHr = (208 - (0.7 * userAge).toInt()).coerceIn(155, 210)
        }
        sendToWatch(mapOf(
            "type"       to "auth",
            "authToken"  to authToken,
            "runnerName" to runnerName,
            "maxHr"      to cachedUserMaxHr
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
            "type"        to "runUpdate",
            "pace"        to paceSecPerKm,
            "distance"    to distanceMetres,
            "hr"          to heartRate,
            "elapsedTime" to elapsedSeconds,
            "cadence"     to cadence,
            "isRunning"   to isRunning,
            "isPaused"    to isPaused
        ))
    }

    fun sendStartRun() {
        sendToWatch(mapOf("type" to "startRun"))
    }

    /**
     * Push a prepared run configuration to the watch.
     *
     * The watch StartView receives this as a "preparedRun" message and switches
     * from the default idle state to "Coached Run Ready ▶" mode.
     *
     * @param distanceKm       Target distance in km (0.0 = open-ended)
     * @param runType          "route" | "free" | "training"
     * @param workoutType      e.g. "easy", "tempo", "intervals" (nullable)
     * @param workoutIntensity e.g. "z2", "z4" (nullable)
     * @param workoutDesc      Short description shown on watch (nullable)
     * @param routePolyline    Encoded polyline string for navigation (nullable)
     * @param targetPace       Target pace string e.g. "5:30" (nullable)
     * @param intervalCount    Number of intervals for interval workouts (nullable)
     * @param intervalDistKm   Distance per interval in km (nullable)
     * @param intervalDurSecs  Duration per interval in seconds (nullable)
     */
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
        intervalDurSecs: Int? = null
    ) {
        val payload = mutableMapOf<String, Any>(
            "type"     to "preparedRun",
            "distance" to distanceKm,
            "runType"  to runType
        )
        workoutType?.let      { payload["workoutType"]      = it }
        workoutIntensity?.let { payload["workoutIntensity"] = it }
        workoutDesc?.let      { payload["workoutDesc"]      = it }
        routePolyline?.let    { payload["routePolyline"]    = it }
        targetPace?.let       { payload["targetPace"]       = it }
        intervalCount?.let    { payload["intervalCount"]    = it }
        intervalDistKm?.let   { payload["intervalDistKm"]  = it }
        intervalDurSecs?.let  { payload["intervalDurSecs"] = it }

        Log.d(TAG, "Sending preparedRun to watch: type=$runType dist=${distanceKm}km workout=$workoutType")
        cachedPreparedRunPayload = payload
        sendToWatch(payload)
    }

    /**
     * Clears the cached prepared-run so it is not re-pushed after the run has
     * started or been cancelled.  Call from the ViewModel on startRun() and cancelRunSetup().
     */
    fun clearPendingPreparedRun() {
        cachedPreparedRunPayload = null
        Log.d(TAG, "Pending prepared-run cache cleared")
    }

    fun sendSessionEnded() {
        sendToWatch(mapOf("type" to "sessionEnded"))
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private fun sendToWatch(payload: Map<String, Any>) {
        val device = connectedDevice ?: return
        val app    = iqApp           ?: return
        try {
            connectIQ?.sendMessage(device, app, payload,
                object : ConnectIQ.IQSendMessageListener {
                    override fun onMessageStatus(
                        d: IQDevice?,
                        a: IQApp?,
                        status: ConnectIQ.IQMessageStatus?
                    ) {
                        Log.d(TAG, "sendToWatch status: $status")
                    }
                }
            )
        } catch (e: InvalidStateException) {
            Log.w(TAG, "sendToWatch — invalid state: ${e.message}")
        } catch (e: ServiceUnavailableException) {
            Log.w(TAG, "sendToWatch — service unavailable: ${e.message}")
        }
    }

    private fun resolveApp(device: IQDevice) {
        try {
            connectIQ?.getApplicationInfo(APP_ID, device,
                object : ConnectIQ.IQApplicationInfoListener {
                    override fun onApplicationInfoReceived(app: IQApp?) {
                        if (app != null) {
                            iqApp = app
                            _isCompanionAppInstalled.value = true
                            Log.d(TAG, "Watch app resolved: ${app.getDisplayName()}")
                            registerForMessages(device, app)
                        }
                    }

                    override fun onApplicationNotInstalled(appId: String?) {
                        _isCompanionAppInstalled.value = false
                        Log.w(TAG, "Watch app not installed on device (appId=$appId)")
                    }
                }
            )
        } catch (e: InvalidStateException) {
            Log.w(TAG, "resolveApp: ${e.message}")
        } catch (e: ServiceUnavailableException) {
            Log.w(TAG, "resolveApp: ${e.message}")
        }
    }

    private fun registerForMessages(device: IQDevice, app: IQApp) {
        try {
            connectIQ?.registerForAppEvents(device, app,
                object : ConnectIQ.IQApplicationEventListener {
                    override fun onMessageReceived(
                        d: IQDevice?,
                        a: IQApp?,
                        messageData: List<Any>?,
                        status: ConnectIQ.IQMessageStatus?
                    ) {
                        handleWatchMessage(messageData)
                    }
                }
            )
            // Watch app is now resolved and listening.
            // Proactively push cached auth so the watch can trigger an offline sync
            // immediately — even if the user hasn't opened the watch app manually.
            // If the watch app IS already open on the start screen, it will receive
            // this auth message and fire the offline batch upload automatically.
            val token = cachedAuthToken
            if (token != null) {
                Log.d(TAG, "Watch reconnected — auto-pushing cached auth to wake offline sync")
                sendAuth(token, cachedRunnerName)
                // Also resend any pending prepared run in case they were mid-setup
                cachedPreparedRunPayload?.let { sendToWatch(it) }
            } else {
                // No cached credentials yet — fall back to external handler
                Log.d(TAG, "Watch app ready — firing onWatchAppReady (no cached auth)")
                onWatchAppReady?.invoke()
            }
        } catch (e: InvalidStateException) {
            Log.w(TAG, "registerForMessages: ${e.message}")
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun handleWatchMessage(data: List<Any>?) {
        try {
            val map    = data?.firstOrNull() as? Map<String, Any> ?: return
            val type   = map["type"] as? String ?: return
            when (type) {
                "hello" -> {
                    // Watch reports its installed app version on first connect.
                    // Persisted so GarminWatchUpdateScreen can show "Installed vs New".
                    val watchVersion = map["appVersion"] as? String
                    if (!watchVersion.isNullOrBlank()) {
                        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                            .edit().putString(PREF_WATCH_APP_VERSION, watchVersion).apply()
                        Log.d(TAG, "Watch app version reported: $watchVersion")
                    }
                }
                "command" -> {
                    val action = map["action"] as? String ?: return
                    Log.d(TAG, "Watch command: $action")

                    // "watchReady" means the user just opened the watch app.
                    // Immediately send auth so the watch shows "Connected" instead of the
                    // "OFFLINE - 90min charts" warning — this must happen regardless of
                    // whether a ViewModel has registered onWatchCommand.
                    if (action == "syncComplete") {
                        val runId    = map["runId"]?.toString()
                        val session  = map["sessionId"] as? String
                        Log.d(TAG, "syncComplete received — runId=$runId session=$session")
                        _hasPendingWatchSync.value = false   // clear dashboard banner
                        dismissPendingSyncNotification()     // replace prompt with success notif
                        showOfflineSyncNotification(runId)
                        return
                    }

                    // Watch notifies phone immediately after saving an offline run batch,
                    // and also when the background service fails to upload (retry signal).
                    // Shows dashboard banner + heads-up push notification.
                    if (action == "pendingSync") {
                        Log.d(TAG, "pendingSync received — watch has an offline run ready to upload")
                        _hasPendingWatchSync.value = true
                        showPendingSyncNotification()
                        return
                    }

                    if (action == "watchReady") {
                        // Read the hasPendingSync flag the watch now includes
                        val hasPending = map["hasPendingSync"] as? Boolean ?: false
                        if (hasPending) {
                            Log.d(TAG, "watchReady: watch has pending offline run — showing sync indicator")
                            _hasPendingWatchSync.value = true
                        }
                        val token = cachedAuthToken
                        if (token != null) {
                            Log.d(TAG, "watchReady received — auto-sending cached auth to watch")
                            sendAuth(token, cachedRunnerName)
                        } else {
                            // No cached credentials yet — fall back to external handler
                            Log.d(TAG, "watchReady received — no cached auth, firing onWatchAppReady")
                            onWatchAppReady?.invoke()
                        }
                        // Resend any pending prepared-run so the watch coached screen
                        // appears regardless of which was opened first (phone or watch).
                        cachedPreparedRunPayload?.let { payload ->
                            Log.d(TAG, "watchReady received — resending cached preparedRun to watch")
                            sendToWatch(payload)
                        }
                        // Also notify any active ViewModel so it can react
                        onWatchCommand?.invoke(action)
                        return
                    }

                    // When the watch starts a run, clear the cached prepared-run payload
                    // so it isn't re-sent to the watch on the NEXT watchReady / reconnect.
                    if (action == "start") {
                        cachedPreparedRunPayload = null
                        Log.d(TAG, "Watch START received — cleared cached preparedRun payload")
                    }

                    // For all other commands: if no ViewModel is listening, show a passive
                    // notification when a watch-initiated run starts/stops.
                    if (onWatchCommand == null) {
                        when (action) {
                            "start" -> showWatchRunNotification()
                            "stop"  -> cancelWatchRunNotification()
                        }
                    } else {
                        onWatchCommand?.invoke(action)
                    }
                }
                "watchData" -> {
                    // Full biometric frame streamed from the watch every ~2 s.
                    // GPS fields
                    val lat   = (map["lat"]   as? Number)?.toDouble()
                    val lng   = (map["lng"]   as? Number)?.toDouble()
                    val altM  = (map["alt"]   as? Number)?.toDouble()
                    val speed = (map["speed"] as? Number)?.toFloat()
                    val bear  = (map["bear"]  as? Number)?.toFloat()
                    val acc   = (map["acc"]   as? Number)?.toFloat()
                    // Biometrics
                    val hr    = (map["hr"]    as? Number)?.toInt() ?: 0
                    val hrz   = (map["hrz"]   as? Number)?.toInt() ?: 1
                    val cad   = (map["cad"]   as? Number)?.toInt() ?: 0
                    // Running Dynamics
                    val gct   = (map["gct"]   as? Number)?.toFloat() ?: 0f
                    val gcb   = (map["gcb"]   as? Number)?.toFloat() ?: 50f
                    val vo    = (map["vo"]    as? Number)?.toFloat() ?: 0f
                    val vr    = (map["vr"]    as? Number)?.toFloat() ?: 0f
                    val sl    = (map["sl"]    as? Number)?.toFloat() ?: 0f
                    // Training Effect
                    val te    = (map["te"]    as? Number)?.toFloat() ?: 0f
                    val ate   = (map["ate"]   as? Number)?.toFloat() ?: 0f
                    val rt    = (map["rt"]    as? Number)?.toInt() ?: 0
                    val vo2   = (map["vo2"]   as? Number)?.toFloat() ?: 0f
                    // Power & Respiration (device-dependent)
                    val pwr   = (map["pwr"]   as? Number)?.toInt() ?: 0
                    val resp  = (map["resp"]  as? Number)?.toFloat() ?: 0f
                    // Environmental
                    val pres    = (map["pres"]    as? Number)?.toFloat() ?: 0f
                    val elap    = (map["elap"]    as? Number)?.toInt() ?: 0
                    // Barometric altitude (Activity.Info.altitude on Fenix — more accurate than GPS)
                    val baroAlt = (map["baroAlt"] as? Number)?.toFloat() ?: 0f

                    Log.d(TAG, "Watch frame: hr=$hr cad=$cad gct=$gct vo=$vo stride=$sl te=$te pwr=$pwr resp=$resp")

                    val frame = WatchBiometricFrame(
                        elapsedSeconds          = elap,
                        lat                     = lat,
                        lng                     = lng,
                        altMetres               = altM,
                        speedMs                 = speed,
                        bearingDeg              = bear,
                        gpsAccuracy             = acc,
                        heartRate               = hr,
                        heartRateZone           = hrz,
                        cadence                 = cad,
                        groundContactTime       = gct,
                        groundContactBalance    = gcb,
                        verticalOscillation     = vo,
                        verticalRatio           = vr,
                        strideLength            = sl,
                        aerobicTrainingEffect   = te,
                        anaerobicTrainingEffect = ate,
                        recoveryTimeMinutes     = rt,
                        vo2MaxEstimate          = vo2,
                        runningPower            = pwr,
                        respirationRate         = resp,
                        ambientPressure         = pres,
                        baroAltitude            = baroAlt,
                    )

                    // GPS callback for location tracking
                    if (lat != null && lng != null) {
                        onWatchGpsUpdate?.invoke(lat, lng, altM, speed)
                    }

                    // Full biometric frame for coaching & storage
                    onWatchSensorData?.invoke(frame)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "handleWatchMessage: ${e.message}")
        }
    }

    // ── ConnectIQ SDK listener ────────────────────────────────────────────────

    private val sdkListener = object : ConnectIQ.ConnectIQListener {

        override fun onSdkReady() {
            Log.d(TAG, "ConnectIQ SDK ready")
            try {
                val devices = connectIQ?.getConnectedDevices()
                if (devices.isNullOrEmpty()) {
                    Log.d(TAG, "No Garmin devices connected")
                    return
                }
                val device = devices.first()
                connectedDevice = device

                connectIQ?.registerForDeviceEvents(device,
                    object : ConnectIQ.IQDeviceEventListener {
                        override fun onDeviceStatusChanged(
                            d: IQDevice?,
                            status: IQDevice.IQDeviceStatus?
                        ) {
                            val connected = status == IQDevice.IQDeviceStatus.CONNECTED
                            Log.d(TAG, "Device status: $status")
                            _isWatchConnected.value = connected
                            if (connected) {
                                resolveApp(device)
                            } else {
                                iqApp = null
                                _isCompanionAppInstalled.value = false
                            }
                        }
                    }
                )

                // Handle already-connected device at startup
                val currentStatus = connectIQ?.getDeviceStatus(device)
                if (currentStatus == IQDevice.IQDeviceStatus.CONNECTED) {
                    _isWatchConnected.value = true
                    resolveApp(device)
                }

            } catch (e: Exception) {
                Log.e(TAG, "onSdkReady error: ${e.message}")
            }
        }

        override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus?) {
            Log.e(TAG, "ConnectIQ init error: $status")
        }

        override fun onSdkShutDown() {
            Log.d(TAG, "ConnectIQ SDK shut down")
            _isWatchConnected.value = false
            _isCompanionAppInstalled.value = false
        }
    }
}
