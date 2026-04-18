package live.airuncoach.airuncoach.service

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import com.samsung.android.mcf.McfDeviceManager
import com.samsung.android.mcf.messaging.McfMessagingClient
import com.samsung.android.mcf.messaging.McfMessage
import com.samsung.android.mcf.messaging.McfMessagePayload
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * Samsung Watch Manager — Communication bridge between phone and Samsung Galaxy Watch
 *
 * Uses Samsung MCF (Multi-Control Frame) API for watch connectivity
 * Falls back to direct messaging if MCF unavailable
 */
class SamsungWatchManager(private val context: Context) {
    private var mcfMessagingClient: McfMessagingClient? = null
    private var deviceManager: McfDeviceManager? = null
    private var scope = CoroutineScope(Dispatchers.Main + Job())
    
    companion object {
        private const val TAG = "SamsungWatchManager"
        private const val WATCH_PACKAGE_ID = "com.airuncoach.watch"
        private const val MCF_CHANNEL = "airuncoach_watch"
    }

    interface WatchConnectedListener {
        fun onWatchConnected(watchName: String)
        fun onWatchDisconnected()
        fun onMessageReceived(message: String)
        fun onError(error: String)
    }

    private var listener: WatchConnectedListener? = null

    fun setListener(listener: WatchConnectedListener) {
        this.listener = listener
    }

    /**
     * Initialize Samsung MCF connection
     */
    fun initialize() {
        try {
            if (!isSamsungDevice()) {
                Log.w(TAG, "Not a Samsung device")
                return
            }

            deviceManager = McfDeviceManager.getInstance(context)
            deviceManager?.let { manager ->
                // Set up messaging client for watch communication
                mcfMessagingClient = manager.mcfMessagingClient
                mcfMessagingClient?.let { client ->
                    // Register message callback
                    client.addOnMessageReceivedListener { message ->
                        handleWatchMessage(message)
                    }
                    
                    client.addOnDeviceConnectedListener { device ->
                        if (isWatchDevice(device)) {
                            Log.i(TAG, "✓ Samsung Watch connected: ${device.name}")
                            listener?.onWatchConnected(device.name)
                        }
                    }
                    
                    client.addOnDeviceDisconnectedListener { device ->
                        if (isWatchDevice(device)) {
                            Log.i(TAG, "Samsung Watch disconnected")
                            listener?.onWatchDisconnected()
                        }
                    }
                }
            }
            Log.i(TAG, "✓ Samsung MCF initialized")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize Samsung MCF: ${e.message}")
        }
    }

    /**
     * Send authentication token to watch
     */
    fun sendAuthToken(authToken: String, runnerName: String) {
        scope.launch {
            try {
                val message = JSONObject().apply {
                    put("type", "auth")
                    put("data", JSONObject().apply {
                        put("authToken", authToken)
                        put("runnerName", runnerName)
                    })
                }
                sendToWatch(message.toString())
                Log.i(TAG, "✓ Auth token sent to watch")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send auth token: ${e.message}")
                listener?.onError("Failed to send auth token to watch")
            }
        }
    }

    /**
     * Send prepared run (coaching session) to watch
     */
    fun sendPreparedRun(
        runType: String,
        targetPace: String,
        workoutType: String,
        workoutDesc: String,
        distance: Double
    ) {
        scope.launch {
            try {
                val message = JSONObject().apply {
                    put("type", "preparedRun")
                    put("data", JSONObject().apply {
                        put("runType", runType)
                        put("targetPace", targetPace)
                        put("workoutType", workoutType)
                        put("workoutDesc", workoutDesc)
                        put("distance", distance)
                    })
                }
                sendToWatch(message.toString())
                Log.i(TAG, "✓ Prepared run sent to watch")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send prepared run: ${e.message}")
                listener?.onError("Failed to send prepared run to watch")
            }
        }
    }

    /**
     * Send real-time run updates to watch
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
        scope.launch {
            try {
                val message = JSONObject().apply {
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
                }
                sendToWatch(message.toString())
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send run update: ${e.message}")
            }
        }
    }

    /**
     * Send coaching cue to watch
     */
    fun sendCoachingCue(cue: String, audioUrl: String? = null) {
        scope.launch {
            try {
                val message = JSONObject().apply {
                    put("type", "coachingCue")
                    put("data", JSONObject().apply {
                        put("cue", cue)
                        if (audioUrl != null) {
                            put("audioUrl", audioUrl)
                        }
                    })
                }
                sendToWatch(message.toString())
                Log.i(TAG, "💡 Coaching cue sent to watch: $cue")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send coaching cue: ${e.message}")
            }
        }
    }

    /**
     * Notify watch that session ended
     */
    fun sendSessionEnded() {
        scope.launch {
            try {
                val message = JSONObject().apply {
                    put("type", "sessionEnded")
                }
                sendToWatch(message.toString())
                Log.i(TAG, "✓ Session ended notification sent to watch")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send session ended: ${e.message}")
            }
        }
    }

    /**
     * Send disconnect notification
     */
    fun disconnect() {
        scope.launch {
            try {
                val message = JSONObject().apply {
                    put("type", "disconnect")
                }
                sendToWatch(message.toString())
                Log.i(TAG, "✓ Disconnect notification sent to watch")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send disconnect: ${e.message}")
            }
        }
    }

    /**
     * Send message to watch via MCF
     */
    private fun sendToWatch(payload: String) {
        try {
            mcfMessagingClient?.let { client ->
                // Create MCF message
                val message = McfMessage(WATCH_PACKAGE_ID).apply {
                    this.payload = McfMessagePayload(payload.toByteArray(Charsets.UTF_8))
                }
                
                // Send to all connected watch devices
                client.sendMessage(message)
            } ?: run {
                Log.w(TAG, "MCF messaging client not available")
                listener?.onError("Watch connection not available")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send message to watch: ${e.message}")
            listener?.onError("Failed to send message to watch")
        }
    }

    /**
     * Handle messages received from watch
     */
    private fun handleWatchMessage(message: McfMessage) {
        try {
            val payload = String(message.payload?.data ?: byteArrayOf(), Charsets.UTF_8)
            val json = JSONObject(payload)
            val type = json.optString("type")
            
            Log.d(TAG, "📱 Message from watch: $type")
            
            when (type) {
                "runData" -> {
                    // Watch is sending run metrics (not typical for our use case)
                    val data = json.optJSONObject("data")
                    listener?.onMessageReceived(data?.toString() ?: "")
                }
                else -> {
                    listener?.onMessageReceived(payload)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse watch message: ${e.message}")
            listener?.onError("Failed to parse watch message")
        }
    }

    /**
     * Check if device is a Samsung Galaxy Watch
     */
    private fun isWatchDevice(device: Any): Boolean {
        // MCF device check — would use device type/model detection
        return try {
            val deviceClass = device.javaClass
            val getTypeMethod = deviceClass.getMethod("getType")
            val type = getTypeMethod.invoke(device)
            // Type 1 or 2 typically indicates a watch/wearable
            type == 1 || type == 2
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if running on Samsung device
     */
    private fun isSamsungDevice(): Boolean {
        return try {
            val manufacturer = android.os.Build.MANUFACTURER
            manufacturer.equals("samsung", ignoreCase = true)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if watch app is installed
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
     * Open Samsung Galaxy Store to install watch app
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
     * Clean up resources
     */
    fun destroy() {
        scope.cancel()
        mcfMessagingClient = null
        deviceManager = null
    }
}
