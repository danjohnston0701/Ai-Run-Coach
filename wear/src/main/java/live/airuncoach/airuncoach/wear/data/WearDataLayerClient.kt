package live.airuncoach.airuncoach.wear.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Must match SamsungWatchManager.CAPABILITY_WEAR_APP on the phone side. */
const val CAPABILITY_WEAR_APP = "airuncoach_wear_app"
private const val MESSAGE_PATH = "/airuncoach/message"

// ── Pure payload builders — unit-testable without a device, mirroring the exact message
// shapes SamsungWatchManager.kt (phone side) sends/expects. ─────────────────────────────

fun buildCommandPayload(action: String, extra: Map<String, Any?> = emptyMap()): Map<String, Any?> =
    mapOf("type" to "command", "action" to action) + extra

fun buildHelloPayload(appVersion: String): Map<String, Any?> =
    mapOf("type" to "hello", "appVersion" to appVersion)

fun buildWatchDataPayload(frame: Map<String, Any?>): Map<String, Any?> =
    mapOf("type" to "watchData") + frame

/**
 * Wear OS Data Layer (MessageClient/CapabilityClient) bridge to the phone — the watch-side
 * counterpart to the phone's `SamsungWatchManager`. Transport-only: message dispatch/business
 * logic lives in [live.airuncoach.airuncoach.wear.session.RunSessionController], mirroring how
 * RunView.mc keeps PhoneLink.mc as a thin transport wrapper around the real dispatch in
 * `_onPhoneMessageInner()`.
 */
class WearDataLayerClient(private val context: Context, private val scope: CoroutineScope) {

    companion object {
        private const val TAG = "WearDataLayerClient"
    }

    private val messageClient: MessageClient by lazy { Wearable.getMessageClient(context) }
    private val capabilityClient: CapabilityClient by lazy { Wearable.getCapabilityClient(context) }

    private val _isPhoneConnected = MutableStateFlow(false)
    val isPhoneConnected: StateFlow<Boolean> = _isPhoneConnected

    private var connectedNodeId: String? = null

    /** type -> raw JSON payload map, mirroring RunView.mc's single onPhoneMessage dispatch point. */
    var onMessage: ((type: String, payload: Map<String, Any?>) -> Unit)? = null

    private val messageListener = MessageClient.OnMessageReceivedListener { event: MessageEvent ->
        if (event.path == MESSAGE_PATH) {
            handleIncoming(event.data)
        }
    }

    private val capabilityListener = CapabilityClient.OnCapabilityChangedListener { info: CapabilityInfo ->
        updateFromCapability(info)
    }

    fun start() {
        try {
            messageClient.addListener(messageListener)
            capabilityClient.addListener(capabilityListener, CAPABILITY_PHONE_APP)
            scope.launch {
                try {
                    val info = com.google.android.gms.tasks.Tasks.await(
                        capabilityClient.getCapability(CAPABILITY_PHONE_APP, CapabilityClient.FILTER_REACHABLE)
                    )
                    updateFromCapability(info)
                } catch (e: Exception) {
                    Log.d(TAG, "start: no reachable phone yet (${e.message})")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "start failed: ${e.message}")
        }
    }

    fun stop() {
        try {
            messageClient.removeListener(messageListener)
            capabilityClient.removeListener(capabilityListener)
        } catch (e: Exception) {
            Log.w(TAG, "stop: ${e.message}")
        }
        _isPhoneConnected.value = false
        connectedNodeId = null
    }

    private fun updateFromCapability(info: CapabilityInfo) {
        val node: Node? = info.nodes.firstOrNull { it.isNearby } ?: info.nodes.firstOrNull()
        connectedNodeId = node?.id
        _isPhoneConnected.value = node != null
    }

    fun send(payload: Map<String, Any?>) {
        val nodeId = connectedNodeId ?: return
        try {
            val json = JSONObject(payload).toString()
            messageClient.sendMessage(nodeId, MESSAGE_PATH, json.toByteArray(Charsets.UTF_8))
                .addOnFailureListener { e -> Log.w(TAG, "send failed: ${e.message}") }
        } catch (e: Exception) {
            Log.w(TAG, "send error: ${e.message}")
        }
    }

    fun sendCommand(action: String, extra: Map<String, Any?> = emptyMap()) = send(buildCommandPayload(action, extra))
    fun sendHello(appVersion: String) = send(buildHelloPayload(appVersion))
    fun sendWatchData(frame: Map<String, Any?>) = send(buildWatchDataPayload(frame))

    private fun handleIncoming(data: ByteArray?) {
        try {
            if (data == null) return
            val json = JSONObject(String(data, Charsets.UTF_8))
            val map = jsonToMap(json)
            val type = map["type"] as? String ?: return
            onMessage?.invoke(type, map)
        } catch (e: Exception) {
            Log.w(TAG, "handleIncoming: ${e.message}")
        }
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
}

/** CAPABILITY_PHONE_APP — declared as a Wear OS "companion" capability the phone app advertises. */
const val CAPABILITY_PHONE_APP = "airuncoach_phone_app"
