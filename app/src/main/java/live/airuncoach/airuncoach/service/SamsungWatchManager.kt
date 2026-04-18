package live.airuncoach.airuncoach.service

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * Samsung Watch Manager — Communication bridge between phone and Samsung Galaxy Watch.
 *
 * STATUS: Phase 2 stub — compiles cleanly but Samsung SDK is not yet integrated.
 *
 * When implementing, replace the internal message-sending stubs with the real
 * Galaxy Watch Plugin SDK:
 *   implementation("com.samsung.android.sdk.accessory:accessory:1.0.0")
 *
 * The real SDK uses ChannelClient / MessageClient (SAAgent / SAPeerAgent pattern),
 * NOT the fake McfDeviceManager that was here previously.
 *
 * All public methods and the WatchConnectedListener interface are stable —
 * callers (e.g. AppModule, ConnectedDevicesScreen) do not need to change.
 */
class SamsungWatchManager(private val context: Context) {

    private val scope = CoroutineScope(Dispatchers.Main + Job())
    private var listener: WatchConnectedListener? = null

    companion object {
        private const val TAG = "SamsungWatchManager"
        private const val WATCH_PACKAGE_ID = "com.airuncoach.watch"
    }

    // ── Public interface ──────────────────────────────────────────────────────

    interface WatchConnectedListener {
        fun onWatchConnected(watchName: String)
        fun onWatchDisconnected()
        fun onMessageReceived(message: String)
        fun onError(error: String)
    }

    fun setListener(listener: WatchConnectedListener) {
        this.listener = listener
    }

    /**
     * Initialize Samsung watch connection.
     * Phase 2: wire up SAAgent / SAPeerAgent here using the Galaxy Watch Plugin SDK.
     */
    fun initialize() {
        if (!isSamsungDevice()) {
            Log.w(TAG, "Not a Samsung device — Samsung watch manager inactive")
            return
        }
        Log.i(TAG, "SamsungWatchManager initialized (SDK integration pending — Phase 2)")
        // TODO Phase 2: instantiate SAAgent, discover SAPeerAgent, open channel
    }

    /**
     * Send authentication token to watch.
     */
    fun sendAuthToken(authToken: String, runnerName: String) {
        sendToWatch(JSONObject().apply {
            put("type", "auth")
            put("data", JSONObject().apply {
                put("authToken", authToken)
                put("runnerName", runnerName)
            })
        }.toString())
    }

    /**
     * Send prepared run (coaching session) to watch.
     */
    fun sendPreparedRun(
        runType: String,
        targetPace: String,
        workoutType: String,
        workoutDesc: String,
        distance: Double
    ) {
        sendToWatch(JSONObject().apply {
            put("type", "preparedRun")
            put("data", JSONObject().apply {
                put("runType", runType)
                put("targetPace", targetPace)
                put("workoutType", workoutType)
                put("workoutDesc", workoutDesc)
                put("distance", distance)
            })
        }.toString())
    }

    /**
     * Send real-time run metrics to watch.
     */
    fun sendRunUpdate(
        pace: Double,
        distance: Double,
        hr: Int,
        elapsedTime: Long,
        cadence: Int,
        isRunning: Boolean,
        isPaused: Boolean
    ) {
        sendToWatch(JSONObject().apply {
            put("type", "runUpdate")
            put("data", JSONObject().apply {
                put("pace", pace)
                put("distance", distance)
                put("hr", hr)
                put("elapsedTime", elapsedTime)
                put("cadence", cadence)
                put("isRunning", isRunning)
                put("isPaused", isPaused)
            })
        }.toString())
    }

    /**
     * Send AI coaching cue to watch.
     */
    fun sendCoachingCue(cue: String, audioUrl: String? = null) {
        sendToWatch(JSONObject().apply {
            put("type", "coachingCue")
            put("data", JSONObject().apply {
                put("cue", cue)
                if (audioUrl != null) put("audioUrl", audioUrl)
            })
        }.toString())
    }

    /**
     * Notify watch that the run session has ended.
     */
    fun sendSessionEnded() {
        sendToWatch(JSONObject().apply {
            put("type", "sessionEnded")
        }.toString())
    }

    /**
     * Gracefully disconnect from watch.
     */
    fun disconnect() {
        sendToWatch(JSONObject().apply {
            put("type", "disconnect")
        }.toString())
    }

    /**
     * Returns true if the Samsung Galaxy Watch app is installed on the paired watch.
     */
    fun isWatchAppInstalled(): Boolean {
        return try {
            context.packageManager.getPackageInfo(WATCH_PACKAGE_ID, PackageManager.GET_META_DATA)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    /**
     * Deep-links to Galaxy Store so the user can install the watch app.
     */
    fun openGalaxyStoreForWatchApp() {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = android.net.Uri.parse("samsungapps://ProductDetail/$WATCH_PACKAGE_ID")
                setPackage("com.sec.android.app.samsungapps")
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open Galaxy Store: ${e.message}")
            listener?.onError("Failed to open Galaxy Store")
        }
    }

    /**
     * Release coroutine scope and any SDK resources.
     */
    fun destroy() {
        scope.cancel()
        // TODO Phase 2: close SAAgent channel here
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Dispatch a JSON payload to the connected watch.
     * Phase 2: replace this stub with a real SAAgent channel send.
     */
    private fun sendToWatch(payload: String) {
        scope.launch {
            // TODO Phase 2: send via SAAgent / SAPeerAgent channel
            Log.d(TAG, "[stub] sendToWatch: $payload")
        }
    }

    /**
     * Returns true if this phone is manufactured by Samsung.
     * Used to skip SDK init on non-Samsung devices (e.g. emulators, Pixels).
     */
    private fun isSamsungDevice(): Boolean {
        return android.os.Build.MANUFACTURER.equals("samsung", ignoreCase = true)
    }
}
