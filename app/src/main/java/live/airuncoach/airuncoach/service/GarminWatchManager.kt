package live.airuncoach.airuncoach.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * GarminWatchManager
 *
 * Bridges the Android app ↔ Garmin watch app using the Garmin ConnectIQ SDK.
 * Supports Scenario 2: Phone + Watch where the phone is the session owner
 * and the watch is a mirrored control surface + display.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  HOW TO ACTIVATE                                                        │
 * │  1. Download the ConnectIQ Android SDK AAR from:                       │
 * │     https://developer.garmin.com/connect-iq/core-topics/               │
 * │  2. Place connectiq.aar in app/libs/                                   │
 * │  3. In app/build.gradle.kts uncomment:                                 │
 * │         implementation(files("libs/connectiq.aar"))                    │
 * │  4. In this file, replace the stub body below with the FULL SDK        │
 * │     implementation that follows in the comments at the bottom.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Phone → Watch messages                                                 │
 * │    "auth"        — push auth token + runner name on connect             │
 * │    "runUpdate"   — live pace / distance / HR / elapsed / pause state    │
 * │    "startRun"    — phone-initiated run start (watch shows RunView)      │
 * │    "sessionEnded"— run finished, watch pops back to StartView           │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Watch → Phone commands (via onWatchCommand callback)                  │
 * │    "start" | "pause" | "resume" | "stop" | "watchReady"                │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
@Suppress("UNUSED_PARAMETER", "UnusedPrivateProperty", "unused")
class GarminWatchManager(private val context: Context) {

    companion object {
        private const val TAG = "GarminWatchManager"
        // Must match the UUID in garmin-companion-app/manifest.xml
        const val APP_ID = "691e015cecad4dcf8c940228b7acdeca"
    }

    // ── Public state ──────────────────────────────────────────────────────────
    private val _isWatchConnected = MutableStateFlow(false)
    val isWatchConnected: StateFlow<Boolean> = _isWatchConnected

    /** Invoked on the calling thread when a command arrives from the watch. */
    var onWatchCommand: ((action: String) -> Unit)? = null

    // ─────────────────────────────────────────────────────────────────────────
    // NO-OP STUB — compiles without the ConnectIQ AAR.
    // Replace this entire section with the SDK implementation once the AAR
    // is in app/libs/ (see full implementation in the comments below).
    // ─────────────────────────────────────────────────────────────────────────

    fun initialize() {
        Log.d(TAG, "GarminWatchManager stub — ConnectIQ SDK not yet wired. " +
                "Add connectiq.aar to app/libs/ to activate watch bridge.")
    }

    fun shutdown() {
        _isWatchConnected.value = false
    }

    fun sendAuth(authToken: String, runnerName: String) {
        Log.d(TAG, "sendAuth stub — watch not connected")
    }

    fun sendRunUpdate(
        paceSecPerKm: Double,
        distanceMetres: Double,
        heartRate: Int,
        elapsedSeconds: Long,
        cadence: Int,
        isRunning: Boolean,
        isPaused: Boolean
    ) { /* no-op until SDK is wired */ }

    fun sendStartRun() { Log.d(TAG, "sendStartRun stub") }

    fun sendSessionEnded() { Log.d(TAG, "sendSessionEnded stub") }
}

// =============================================================================
// FULL SDK IMPLEMENTATION (paste this in to replace the stub above once the
// ConnectIQ AAR is in app/libs/ and the dependency is uncommented):
// =============================================================================
//
// import com.garmin.android.connectiq.ConnectIQ
// import com.garmin.android.connectiq.IQApp
// import com.garmin.android.connectiq.IQDevice
// import com.garmin.android.connectiq.exception.InvalidStateException
// import com.garmin.android.connectiq.exception.ServiceUnavailableException
//
// private var connectIQ: ConnectIQ? = null
// private var connectedDevice: IQDevice? = null
// private var iqApp: IQApp? = null
//
// fun initialize() {
//     try {
//         connectIQ = ConnectIQ.getInstance(context, ConnectIQ.IQConnectType.WIRELESS)
//         connectIQ?.initialize(context, false, object : ConnectIQ.ConnectIQListener {
//
//             override fun onSdkReady() {
//                 Log.d(TAG, "ConnectIQ SDK ready")
//                 try {
//                     val devices = connectIQ?.connectedDevices
//                     if (devices.isNullOrEmpty()) { Log.d(TAG, "No Garmin devices connected"); return }
//                     val device = devices.first()
//                     connectedDevice = device
//                     connectIQ?.registerForDeviceEvents(device) { _, status ->
//                         val connected = status == IQDevice.IQDeviceStatus.CONNECTED
//                         _isWatchConnected.value = connected
//                         if (connected) resolveApp(device) else iqApp = null
//                     }
//                     if (connectIQ?.getDeviceStatus(device) == IQDevice.IQDeviceStatus.CONNECTED) {
//                         _isWatchConnected.value = true
//                         resolveApp(device)
//                     }
//                 } catch (e: Exception) { Log.e(TAG, "onSdkReady: ${e.message}") }
//             }
//
//             override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus?) {
//                 Log.e(TAG, "ConnectIQ init error: $status")
//             }
//
//             override fun onSdkShutDown() {
//                 Log.d(TAG, "ConnectIQ shut down")
//                 _isWatchConnected.value = false
//             }
//         })
//     } catch (e: Exception) { Log.e(TAG, "ConnectIQ init failed: ${e.message}") }
// }
//
// fun shutdown() {
//     try {
//         connectedDevice?.let { connectIQ?.unregisterForDeviceEvents(it) }
//         connectIQ?.shutdown(context)
//     } catch (e: Exception) { Log.w(TAG, "shutdown: ${e.message}") }
//     _isWatchConnected.value = false; connectedDevice = null; iqApp = null
// }
//
// private fun resolveApp(device: IQDevice) {
//     try {
//         connectIQ?.getApplicationInfo(APP_ID, device) { _, app, status ->
//             if (status == IQApp.IQAppStatus.INSTALLED) {
//                 iqApp = app
//                 Log.d(TAG, "Watch app found")
//                 connectIQ?.registerForAppEvents(device, app) { _, _, msgData, _ ->
//                     handleWatchMessage(msgData)
//                 }
//             } else { Log.w(TAG, "Watch app not installed: $status") }
//         }
//     } catch (e: InvalidStateException) { Log.w(TAG, "resolveApp: ${e.message}") }
// }
//
// private fun sendToWatch(payload: Map<String, Any>) {
//     val device = connectedDevice ?: return
//     val app    = iqApp           ?: return
//     try {
//         connectIQ?.sendMessage(device, app, payload) { _, _, status ->
//             Log.d(TAG, "sendToWatch: $status")
//         }
//     } catch (e: Exception) { Log.w(TAG, "sendToWatch failed: ${e.message}") }
// }
//
// fun sendAuth(authToken: String, runnerName: String) {
//     sendToWatch(mapOf("type" to "auth", "authToken" to authToken, "runnerName" to runnerName))
// }
//
// fun sendRunUpdate(paceSecPerKm: Double, distanceMetres: Double, heartRate: Int,
//                   elapsedSeconds: Long, cadence: Int, isRunning: Boolean, isPaused: Boolean) {
//     sendToWatch(mapOf("type" to "runUpdate", "pace" to paceSecPerKm,
//         "distance" to distanceMetres, "hr" to heartRate, "elapsedTime" to elapsedSeconds,
//         "cadence" to cadence, "isRunning" to isRunning, "isPaused" to isPaused))
// }
//
// fun sendStartRun()    { sendToWatch(mapOf("type" to "startRun")) }
// fun sendSessionEnded(){ sendToWatch(mapOf("type" to "sessionEnded")) }
//
// @Suppress("UNCHECKED_CAST")
// private fun handleWatchMessage(data: Any?) {
//     val map    = (data as? List<*>)?.firstOrNull() as? Map<String, Any> ?: return
//     val type   = map["type"] as? String ?: return
//     if (type == "command") {
//         val action = map["action"] as? String ?: return
//         Log.d(TAG, "Watch command: $action")
//         onWatchCommand?.invoke(action)
//     }
// }
// =============================================================================
