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
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQApp
import com.garmin.android.connectiq.IQDevice
import com.garmin.android.connectiq.exception.InvalidStateException
import com.garmin.android.connectiq.exception.ServiceUnavailableException
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.data.repository.RunRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

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
 *
 * See [WatchBiometricFrame] (extracted to its own file) for the "watchData" payload shape —
 * shared with [SamsungWatchManager]'s Wear OS equivalent.
 */
class GarminWatchManager(
    private val context: Context,
    /**
     * Shared run cache.  Injected so that when the watch reports a freshly-synced
     * offline run we can drop the stale (≤5-minute) cached run list — otherwise the
     * newly uploaded run would not show in run history until the cache expired.
     * Nullable so the manager still constructs if no repository is wired (tests).
     */
    private val runRepository: RunRepository? = null,
    private val apiService: live.airuncoach.airuncoach.network.ApiService? = null
) {
    /**
     * Companion session ID fetched when the watch starts a run. Sent with the phone's own
     * run upload so the backend can deterministically link/enrich from the companion batch
     * instead of relying on a fuzzy distance-tolerance match. Mirrors iOS's
     * `activeCompanionSessionId` in GarminWatchManager.swift.
     */
    var activeCompanionSessionId: String? = null
        private set

    /**
     * Restores [activeCompanionSessionId] after an OS-kill respawn, where the normal
     * "start" → [fetchAndCacheCompanionSession] flow never ran on this fresh instance because
     * the watch's "start" command was never re-delivered (the watch was never actually
     * interrupted — see RunTrackingService.reattachToWatchSession). The ID here comes from
     * GET /api/garmin-companion/session/recoverable, not a fresh fetch.
     */
    fun restoreActiveCompanionSession(sessionId: String) {
        companionSessionFetchJob?.cancel()
        activeCompanionSessionId = sessionId
    }

    /** The in-flight companion-session fetch, if any — cancelled before starting a new one so a
     * quick stop/start/stop cycle can't leave two overlapping retry loops racing to set
     * [activeCompanionSessionId], where a slow, stale response from the FIRST (superseded) fetch
     * could overwrite the correct ID set by the second, current one. */
    private var companionSessionFetchJob: kotlinx.coroutines.Job? = null

    /**
     * Re-sent on retry since the session row may not exist server-side the instant "start" fires.
     *
     * Clears [activeCompanionSessionId] synchronously up front (rather than nulling it when
     * "stop" is received) so the stop/finalize path — which reads this field asynchronously to
     * build the run upload payload — always sees the just-finished run's real session ID instead
     * of racing a premature null-out. The ID is only ever stale (pointing at the previous run)
     * for the brief window between a new "start" and this fetch resolving, never permanently gone.
     */
    private fun fetchAndCacheCompanionSession(retries: Int = 5) {
        val api = apiService ?: return
        companionSessionFetchJob?.cancel()
        activeCompanionSessionId = null
        // Video recording mode has no real watch, so no companion session is started for this
        // run — the server would hand back whatever stale "active" session the account has, and
        // the phone's upload would then be merged into that session's old run (it happened on
        // 2026-10-01: demo running-dynamics data landed in a real half marathon).
        if (videoDemoDeviceName != null) return
        companionSessionFetchJob = CoroutineScope(Dispatchers.IO).launch {
            for (attempt in 1..retries) {
                try {
                    val response = api.getGarminCompanionSession()
                    val sessionId = response.session?.sessionId
                    if (sessionId != null) {
                        activeCompanionSessionId = sessionId
                        android.util.Log.d("GarminWatchManager", "cached companion session $sessionId")
                        return@launch
                    }
                } catch (e: Exception) {
                    android.util.Log.w("GarminWatchManager", "could not fetch companion session (attempt $attempt) — ${e.message}")
                }
                if (attempt < retries) delay(1000)
            }
        }
    }

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
                .setSmallIcon(R.drawable.notification_icon)
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
                .setSmallIcon(R.drawable.notification_icon)
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
                    "Watch Session",
                    NotificationManager.IMPORTANCE_LOW
                ).apply { description = "Shows when a Garmin watch session is in progress" }
                nm.createNotificationChannel(channel)
            }
            // Tap notification → open app
            val mainClass = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val tapIntent = PendingIntent.getActivity(
                context, 0,
                mainClass ?: Intent(),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            // This is the watch-only bootstrap path (bare "start" with no phone-side ViewModel
            // listening) — the activity type isn't reliably present on this message, so the text
            // stays activity-neutral rather than guess and risk saying "run" for a walk session.
            val notif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(R.drawable.notification_icon)
                .setContentTitle("Garmin Watch Session in Progress")
                .setContentText("Your session is being recorded. Open Ai Run Coach to see your summary when you're done.")
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

    /**
     * Emits the timestamp of the most recent watch run sync (via "syncComplete").
     * Starts at 0L (no sync yet).  ViewModels observe this to force-refresh their
     * run lists the moment an offline watch run lands on the backend, so the user
     * sees it in history without waiting for the 5-minute run cache to expire.
     */
    private val _runSyncedEvent = MutableStateFlow(0L)
    val runSyncedEvent: StateFlow<Long> = _runSyncedEvent

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

    // ── Watch-only run tracking ───────────────────────────────────────────────
    // Set to true when a "start" command arrives with onWatchCommand == null, meaning
    // GarminWatchManager bootstrapped RunTrackingService itself (ACTION_START_TRACKING_FROM_WATCH).
    // Cleared when "stop" is received or when the watchReady+hasPendingSync recovery fires.
    // Used to safely auto-stop the service if the "stop" BT message was silently dropped.
    private var watchOnlyRunActive = false

    // ── Cached auth credentials ───────────────────────────────────────────────
    // Stored whenever sendAuth() is called so we can auto-respond to "watchReady"
    // messages that arrive when no ViewModel has registered an onWatchCommand handler
    // (e.g. the user opens the watch app while the phone app is idle on the home screen).
    private var cachedAuthToken: String? = null
    private var cachedRunnerName: String = ""
    // Null until the user's real age is known — the watch treats a missing/absent
    // "maxHr" field as "can't personalise HR zones" rather than silently trusting
    // a guessed fallback number as if it were the user's real max HR.
    private var cachedUserMaxHr: Int? = null

    // ── Cached prepared-run payload ───────────────────────────────────────────
    // Set by sendPreparedRun(); cleared by clearPendingPreparedRun() when the
    // run starts or is cancelled. Resent automatically whenever "watchReady"
    // arrives so the user can open phone/watch in any order.
    private var cachedPreparedRunPayload: Map<String, Any>? = null

    // ── Cached session type ("run" | "walk") ──────────────────────────────────
    // Set by sendSessionType(), called as soon as the phone-side session-setup
    // screen knows its activity type (setRunConfig()) — NOT gated behind the
    // user explicitly tapping "Prepare Run on Watch". The watch's own native
    // Record.createSession() call (its independently-synced Garmin Connect
    // activity, separate from our backend) reads this from its own storage the
    // instant its physical START button is pressed, which can happen before any
    // BLE round-trip completes — so it must already be current by then, not just
    // eventually. Resent on "watchReady" for the same open-in-any-order reason
    // as cachedPreparedRunPayload above.
    private var cachedSessionType: String? = null

    // ── sessionType delivery retry ────────────────────────────────────────────
    // ConnectIQ.sendMessage() is fire-and-forget — no delivery guarantee, and this
    // codebase already has multiple confirmed cases of it silently dropping on
    // constrained BT stacks (FR55 in particular; see the watch-side "start" command
    // retry in RunView.mc for the mirror-image problem). A dropped sessionType
    // message is exactly what would let a correctly-prepared walk still upload to
    // Garmin Connect as a Run — the watch has no way to notice it never arrived. So
    // this resends up to SESSION_TYPE_RETRY_MAX times until the watch acks receipt
    // (see "sessionTypeAck" below), same pattern as the watch's own start/stop retry.
    private val sessionTypeRetryHandler = Handler(Looper.getMainLooper())
    private var sessionTypeRetryRunnable: Runnable? = null
    private var sessionTypeAcked = true
    private var pendingSessionType: String? = null
    private var sessionTypeRetryCount = 0
    private val SESSION_TYPE_RETRY_MAX = 3
    private val SESSION_TYPE_RETRY_DELAY_MS = 1500L

    // ── Private SDK handles ───────────────────────────────────────────────────
    private var connectIQ: ConnectIQ? = null
    private var connectedDevice: IQDevice? = null
    private var iqApp: IQApp? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * TETHERED vs WIRELESS is driven by BuildConfig.USE_TETHERED_GARMIN_SIM (app/build.gradle.kts),
     * which only exists as `true` when a debug build was explicitly assembled with
     * `-PtetheredGarminSim=true` — see launch-garmin-simulator-tethered.sh. That's what lets this
     * app connect to the desktop Connect IQ Simulator over `adb forward tcp:7381 tcp:7381`
     * (Garmin's documented TETHERED workflow) instead of real BLE — and it works identically
     * against an Android emulator or a real USB-connected phone, since `adb forward` is just an
     * ADB target either way. Always WIRELESS in a normal build/release, with no flag to flip.
     */
    fun initialize() {
        try {
            val connectType = if (live.airuncoach.airuncoach.BuildConfig.USE_TETHERED_GARMIN_SIM) {
                ConnectIQ.IQConnectType.TETHERED
            } else {
                ConnectIQ.IQConnectType.WIRELESS
            }
            connectIQ = ConnectIQ.getInstance(context, connectType)
            connectIQ?.initialize(context, false, sdkListener)
            Log.d(TAG, "ConnectIQ SDK initialised (connectType=$connectType)")
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
        videoDemoDeviceName?.let { return it }
        return try {
            connectedDevice?.friendlyName
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get device name: ${e.message}")
            null
        }
    }

    // ── Video recording mode (debug builds only) — see VideoDemoMode.kt ───────
    internal var videoDemoDeviceName: String? = null
    internal fun videoDemoSetLinked(linked: Boolean) {
        if (_isWatchConnected.value != linked) _isWatchConnected.value = linked
        if (_isCompanionAppInstalled.value != linked) _isCompanionAppInstalled.value = linked
    }
    /** Feeds a scripted message through the real watch → phone handler. */
    internal fun videoDemoDeliver(message: Map<String, Any>) = handleWatchMessage(listOf(message))

    // ── Phone → Watch ─────────────────────────────────────────────────────────

    /**
     * Sends authentication and user profile to the watch.
     * @param userAge Optional user age — used to compute personalised max HR for on-watch
     *                HR zone display using the Tanaka formula (208 − 0.7 × age).
     *                If null/unknown, no "maxHr" is sent at all — the watch shows an
     *                unpersonalised HR ring rather than guessing a fallback max HR.
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
        val payload = mutableMapOf<String, Any>(
            "type"       to "auth",
            "authToken"  to authToken,
            "runnerName" to runnerName
        )
        cachedUserMaxHr?.let { payload["maxHr"] = it }
        sendToWatch(payload)
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
     * Send a lightweight acknowledgment back to the watch when a "start" command is received.
     * This cancels the watch's start-command retry timer (FR55 BT-drop recovery).
     * Called immediately from handleWatchMessage() before onWatchCommand is invoked,
     * so the ack is always sent regardless of whether a ViewModel or Service is listening.
     */
    fun sendStartAck() {
        sendToWatch(mapOf("type" to "startAck"))
        Log.d(TAG, "Sent startAck to watch")
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
     * @param plannedWorkoutId The planned_workout DB id — stored on the watch and sent with the
     *                         companion session/start call so the backend can auto-complete the
     *                         workout when the Garmin activity webhook arrives.
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
        intervalDurSecs: Int? = null,
        plannedWorkoutId: String? = null,
        sessionType: String = "run"    // "run" | "walk" — used by watch to classify FIT file and notify backend
    ) {
        val payload = mutableMapOf<String, Any>(
            "type"        to "preparedRun",
            "distance"    to distanceKm,
            "runType"     to runType,
            "sessionType" to sessionType   // passed to DataStreamer.setActivityType()
        )
        workoutType?.let      { payload["workoutType"]      = it }
        workoutIntensity?.let { payload["workoutIntensity"] = it }
        workoutDesc?.let      { payload["workoutDesc"]      = it }
        routePolyline?.let    { payload["routePolyline"]    = it }
        targetPace?.let       { payload["targetPace"]       = it }
        intervalCount?.let    { payload["intervalCount"]    = it }
        intervalDistKm?.let   { payload["intervalDistKm"]  = it }
        intervalDurSecs?.let  { payload["intervalDurSecs"] = it }
        plannedWorkoutId?.let { payload["plannedWorkoutId"] = it }

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

    /**
     * Push the current activity type ("run" | "walk") to the watch as early as the phone
     * knows it — i.e. from setRunConfig(), not only from the explicit "Prepare Run on Watch"
     * flow (sendPreparedRun). Without this, a user who configures a walk on the phone but
     * presses the watch's own physical START button (never having tapped "send to watch")
     * gets a watch-recorded Garmin Connect activity that's still classified as a Run: the
     * watch creates its native ActivityRecording session synchronously on that button press,
     * before there's any chance for a BLE round-trip, so whatever sessionType is already in
     * the watch's storage at that instant is what sticks for the whole activity.
     */
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

    /**
     * Immediately acknowledge the watch "stop" command so the watch can cancel
     * its stop-command retry before the upload finishes (which can take several
     * seconds). The full "sessionEnded" message is sent later once the run is
     * saved; this interim ack prevents unnecessary re-transmissions.
     */
    fun sendStopAck() {
        sendToWatch(mapOf("type" to "stopAck"))
        Log.d(TAG, "Sent stopAck to watch")
    }

    /**
     * Acknowledge a watch "pause"/"resume" command so the watch can cancel its
     * pause/resume-command retry (see RunView.mc's _pauseResumeRetryCount). Unlike
     * start/stop, these commands previously had no ack at all — a dropped BLE transmit
     * left the watch paused with the phone never finding out, silently diverging the
     * phone's timer/distance from the watch's for the rest of the session (reported
     * 2026-09 — Nino, walk session).
     */
    fun sendPauseAck() {
        sendToWatch(mapOf("type" to "pauseAck"))
        Log.d(TAG, "Sent pauseAck to watch")
    }

    fun sendResumeAck() {
        sendToWatch(mapOf("type" to "resumeAck"))
        Log.d(TAG, "Sent resumeAck to watch")
    }

    // ── Private ───────────────────────────────────────────────────────────────

    // Persists watch-reported crash breadcrumbs to a small rolling file in app storage
    // so they're retrievable after the fact (e.g. via `adb shell run-as ... cat files/...`)
    // rather than only living in logcat's ring buffer until it scrolls away.
    private fun logWatchCrash(message: String) {
        try {
            val file = java.io.File(context.filesDir, "garmin_watch_crashes.log")
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
                        val companionRunId = map["runId"]?.toString()
                        val session  = map["sessionId"] as? String
                        Log.d(TAG, "syncComplete received — runId=$companionRunId session=$session")
                        _hasPendingWatchSync.value = false   // clear dashboard banner
                        dismissPendingSyncNotification()     // replace prompt with success notif
                        // Drop the stale cached run list so the newly-uploaded run is
                        // re-fetched from the backend instead of served from the ≤5-min cache,
                        // then signal observers (dashboard / run history) to refresh now.
                        runRepository?.clearAllCaches()
                        _runSyncedEvent.value = System.currentTimeMillis()
                        // Prefer the phone's uploaded run ID over the companion run ID from
                        // the watch.  When the phone also tracked this run (live session with
                        // BT connected), the phone's run record has coaching-plan context
                        // (linkedWorkoutId) that the watch-created companion record may not
                        // have yet.  Using the phone's run ID ensures any notification
                        // tap deep-links to the correct, plan-linked run rather than the
                        // unlinked companion record.
                        val phoneUploadId = RunTrackingService.uploadComplete.value
                        val notifRunId = if (!phoneUploadId.isNullOrBlank()) phoneUploadId else companionRunId
                        if (!phoneUploadId.isNullOrBlank() && phoneUploadId != companionRunId) {
                            Log.d(TAG, "syncComplete: preferring phone run ID $phoneUploadId over companion ID $companionRunId for notification")
                        }
                        showOfflineSyncNotification(notifRunId)
                        return
                    }

                    // Watch confirms it stored a "sessionType"/"preparedRun" message — cancels
                    // the resend loop in sendSessionType(). See that function's retry comment.
                    if (action == "sessionTypeAck") {
                        onSessionTypeAcked()
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
                        // The watch has no retrievable crash log of its own for a sideloaded/dev
                        // build — it persists a one-line breadcrumb across its own relaunch and
                        // forwards it here on next connect. Log it and persist it phone-side so
                        // it survives beyond logcat's ring buffer.
                        val lastCrash = map["lastCrash"] as? String
                        if (lastCrash != null) {
                            Log.e(TAG, "Garmin watch reported a crash from its previous run: $lastCrash")
                            logWatchCrash(lastCrash)
                        }
                        // Read the hasPendingSync flag the watch now includes
                        val hasPending = map["hasPendingSync"] as? Boolean ?: false
                        if (hasPending) {
                            Log.d(TAG, "watchReady: watch has pending offline run — showing sync indicator")
                            _hasPendingWatchSync.value = true
                            // ── Dropped-stop recovery ─────────────────────────────────────────
                            // hasPendingSync=true means the watch finished a run.  If the watch's
                            // "stop" BT message was silently dropped (ConnectIQ is fire-and-forget),
                            // RunTrackingService may still be running with wasRunStartedByWatch=true.
                            // Send ACTION_WATCH_RUN_FINISHED so the service stops itself safely
                            // (it only stops if wasRunStartedByWatch && isTracking, so phone-initiated
                            // runs are never accidentally aborted).
                            // Always attempt recovery — the service only stops if
                            // wasRunStartedByWatch && isTracking, so phone-initiated runs
                            // are never accidentally aborted.
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
                        // Resend the current session type too — a watch that reconnects
                        // (e.g. after a BT drop) must have this before its next physical
                        // START press, same reasoning as sendSessionType() above.
                        cachedSessionType?.let { type ->
                            Log.d(TAG, "watchReady received — resending cached sessionType to watch: $type")
                            sendToWatch(mapOf("type" to "sessionType", "sessionType" to type))
                        }
                        // Also notify any active ViewModel so it can react
                        onWatchCommand?.invoke(action)
                        return
                    }

                    // When the watch starts a run, clear the cached prepared-run payload
                    // so it isn't re-sent to the watch on the NEXT watchReady / reconnect.
                    // Also clear any stale hasPendingWatchSync flag — the run that was pending
                    // was either the one that just started (not really offline) or has already
                    // been handled.  If a genuine offline batch still exists, the watch will
                    // re-signal via "pendingSync" once the run ends and it tries to upload.
                    if (action == "start") {
                        cachedPreparedRunPayload = null
                        if (_hasPendingWatchSync.value) {
                            Log.d(TAG, "Watch START received — clearing stale hasPendingWatchSync flag")
                            _hasPendingWatchSync.value = false
                            dismissPendingSyncNotification()
                        }
                        Log.d(TAG, "Watch START received — cleared cached preparedRun payload")
                        // Immediately ack the start so the watch cancels its retry timer.
                        // This prevents duplicate start commands from FR55 (BT-drop recovery).
                        sendStartAck()
                        // Fetch the active companion session ID so it can be linked at upload time
                        fetchAndCacheCompanionSession()
                    }

                    // Immediately ack the "stop" command so the watch cancels its stop-retry
                    // counter before the upload finishes. The full "sessionEnded" message is
                    // sent by RunTrackingService once the run is saved (may take several seconds).
                    // Without this early ack the watch would keep retrying and the phone could
                    // receive duplicate "stop" signals — stopTracking() is idempotent so this is
                    // safe, but the ack eliminates the unnecessary noise.
                    if (action == "stop") {
                        sendStopAck()
                        Log.d(TAG, "Watch STOP received — sent stopAck immediately")
                        // Deliberately NOT clearing activeCompanionSessionId here — the stop/finalize
                        // path (RunTrackingService) reads it asynchronously afterward to build the
                        // run upload payload. It's cleared instead at the START of the *next*
                        // fetchAndCacheCompanionSession() call, so this run's ID survives until the
                        // next run actually begins fetching its own.
                    }

                    // Immediately ack "pause"/"resume" so the watch cancels its retry timer
                    // before whatever onWatchCommand does downstream (pauseTracking() /
                    // resumeTracking()) even runs — same reasoning as the start/stop acks
                    // above. Previously these had no ack at all (see sendPauseAck() doc).
                    if (action == "pause") {
                        sendPauseAck()
                        Log.d(TAG, "Watch PAUSE received — sent pauseAck immediately")
                    } else if (action == "resume") {
                        sendResumeAck()
                        Log.d(TAG, "Watch RESUME received — sent resumeAck immediately")
                    }

                    // For all other commands: if no ViewModel or service is listening,
                    // we need to bootstrap RunTrackingService ourselves so the watch run
                    // is actually tracked and can be saved when the watch sends "stop".
                    if (onWatchCommand == null) {
                        when (action) {
                            "start" -> {
                                // Show the "run in progress" notification so the user sees feedback.
                                showWatchRunNotification()
                                watchOnlyRunActive = true
                                // Also start RunTrackingService so it registers onWatchCommand and
                                // can receive the eventual "stop" command to save the run.
                                // This handles the case where the user starts a run on the watch
                                // without first preparing it on the phone (no ViewModel active,
                                // no service pre-started).  Requires the app to be in the foreground
                                // (Android 12+ blocks startForegroundService() from background).
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
                            "stop"  -> {
                                cancelWatchRunNotification()
                                watchOnlyRunActive = false
                                // Forward stop to RunTrackingService in case the service is still
                                // running but its onWatchCommand listener was cleared (e.g. the
                                // Activity/ViewModel that overwrote onWatchCommand was destroyed).
                                // stopTracking() is a safe no-op if no run is currently active.
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
                            // Pause/resume had NO no-listener path at all until 2026-09-14: they
                            // fell straight through to the null onWatchCommand below and were
                            // silently dropped, while start and stop both had a fallback. The
                            // watch can't tell — sendPauseAck()/sendResumeAck() fire further up
                            // this same handler, before any of this, so the watch cancels its
                            // retry and believes the phone paused. The phone kept recording.
                            // Reported by a beta tester on an Oppo device ("pausing from the
                            // watch didn't pause the phone, which kept recording"), where
                            // aggressive process management is exactly what leaves this listener
                            // unregistered mid-session. Both are safe no-ops on the service side
                            // if no run is active, and pauseTracking()/resumeTracking() each
                            // guard against redundant delivery.
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
                    // Authoritative cumulative distance from watch firmware (Activity.Info.elapsedDistance)
                    // Null when sent by an older watch build that predates this field.
                    val dist    = (map["dist"]    as? Number)?.toFloat()

                    Log.d(TAG, "Watch frame: hr=$hr cad=$cad gct=$gct vo=$vo stride=$sl te=$te pwr=$pwr resp=$resp dist=${dist}m elap=${elap}s")

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
                        cumulativeDistanceM     = dist,
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
            // This swallows anything thrown while processing an incoming watch message —
            // including the synchronous call into onWatchCommand (start/pause/resume/stop) and
            // the GPS/biometric frame callbacks into RunTrackingService. Record it as a
            // non-fatal rather than only a logcat line the device owner will never see.
            com.google.firebase.crashlytics.FirebaseCrashlytics.getInstance().recordException(e)
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
