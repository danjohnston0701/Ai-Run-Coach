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
        private const val NOTIF_ID_WATCH_RUN = 9001
    }

    // ── Scenario 3: passive notification for watch-initiated runs ────────────

    /**
     * Show a persistent notification when the watch starts a run without the
     * phone app being in the foreground (Scenario 3). The watch is already
     * streaming full data to the backend via the Garmin Connect relay — this
     * notification just lets the user know so they can open the app after their
     * run to see their summary.
     */
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

    fun sendAuth(authToken: String, runnerName: String) {
        sendToWatch(mapOf(
            "type"       to "auth",
            "authToken"  to authToken,
            "runnerName" to runnerName
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
        sendToWatch(payload)
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
            // Watch app is now resolved and listening — notify so caller can push auth
            Log.d(TAG, "Watch app ready — firing onWatchAppReady")
            onWatchAppReady?.invoke()
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
                    // If no ViewModel has registered a handler (user is not on the Run screen)
                    // show a passive notification so the user knows a watch run is in progress.
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
                    val pres  = (map["pres"]  as? Number)?.toFloat() ?: 0f
                    val elap  = (map["elap"]  as? Number)?.toInt() ?: 0

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
