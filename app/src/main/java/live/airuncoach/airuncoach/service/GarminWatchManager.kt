package live.airuncoach.airuncoach.service

import android.content.Context
import android.util.Log
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
class GarminWatchManager(private val context: Context) {

    companion object {
        private const val TAG = "GarminWatchManager"
        // Must match the UUID in garmin-companion-app/manifest.xml
        const val APP_ID = "691e015cecad4dcf8c940228b7acdeca"
    }

    // ── Public state ──────────────────────────────────────────────────────────
    private val _isWatchConnected = MutableStateFlow(false)
    val isWatchConnected: StateFlow<Boolean> = _isWatchConnected

    /** Invoked when a command message arrives from the watch. */
    var onWatchCommand: ((action: String) -> Unit)? = null

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
                            Log.d(TAG, "Watch app resolved: ${app.getDisplayName()}")
                            registerForMessages(device, app)
                        }
                    }

                    override fun onApplicationNotInstalled(appId: String?) {
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
                "command" -> {
                    val action = map["action"] as? String ?: return
                    Log.d(TAG, "Watch command: $action")
                    onWatchCommand?.invoke(action)
                }
                "watchData" -> Log.d(TAG, "Watch sensor data: $map")
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
                            if (connected) resolveApp(device) else iqApp = null
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
        }
    }
}
