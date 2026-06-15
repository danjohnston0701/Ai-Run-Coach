// PhoneLink.mc
// Bidirectional BT messaging between the watch app and the Android phone app.
//
// Scenario 2 (Phone + Watch):
//   • Phone → Watch: "runUpdate" messages carry live pace/distance/HR/elapsed
//   • Watch → Phone: "command" messages for start / pause / resume / stop
//
// Scenario 3 (Standalone):
//   • PhoneLink is still registered but receives nothing meaningful.
//   • RunView falls back to its own GPS + DataStreamer HTTP path.

using Toybox.Communications as Comm;
using Toybox.System as Sys;
using Toybox.WatchUi as Ui;

// ─────────────────────────────────────────────────────────────────────────────
class PhoneLink {

    // Callback invoked when a message arrives from the phone.
    // Signature:  function onPhoneMessage(data as Dictionary) as Void
    private var _onMessage = null;

    // Whether the last transmit succeeded (for optional UI indicator)
    private var _lastSendOk = true;

    // Guard against re-registering the BT listener on every onShow() call.
    // Comm.registerForPhoneAppMessages() only needs to be called once.
    private var _registered = false;

    function initialize() {}

    // ── Register ──────────────────────────────────────────────────────────────
    // Call this once from RunView.onShow() (and StartView.onShow()).
    function register(callback) {
        _onMessage = callback;
        // Only register the BT listener once — calling it on every onShow() is
        // wasteful and on some firmware versions creates duplicate message deliveries.
        if (!_registered) {
            Comm.registerForPhoneAppMessages(method(:_onRawMessage));
            _registered = true;
            Sys.println("PhoneLink registered");
        } else {
            Sys.println("PhoneLink: re-using existing BT registration");
        }
    }

    // ── Send command to phone ─────────────────────────────────────────────────
    // action: "start" | "pause" | "resume" | "stop"
    function sendCommand(action) {
        var msg = {
            "type"   => "command",
            "action" => action
        };
        _transmit(msg);
        Sys.println("PhoneLink tx command: " + action);
    }

    // ── Notify phone that an offline run batch is waiting in watch storage ────────
    // Sent immediately after the offline batch is written so the phone can show a
    // "Open the watch app to sync" prompt without waiting for the next temporal event.
    // Also sent by BackgroundService when an HTTP upload attempt fails (retry signal).
    function sendPendingSync() {
        _transmit({ "type" => "command", "action" => "pendingSync" });
        Sys.println("PhoneLink tx pendingSync");
    }

    // ── Send watchReady with pending-sync flag ─────────────────────────────────
    // hasPendingSync: true when App.Storage contains a buffered offline run batch.
    // Phone uses this to show a subtle "syncing your offline run" indicator on
    // the dashboard — it's already handled automatically but the user gets feedback.
    function sendWatchReady(hasPendingSync) {
        var msg = {
            "type"           => "command",
            "action"         => "watchReady",
            "hasPendingSync" => hasPendingSync
        };
        _transmit(msg);
        Sys.println("PhoneLink tx watchReady (hasPendingSync=" + hasPendingSync + ")");
    }

    // ── Send app version to phone on first connect ────────────────────────────
    // The phone stores this so the Watch Update notification screen can show
    // "Installed: X.Y.Z → New: A.B.C" to the user.
    function sendHello(appVersion) {
        _transmit({
            "type"       => "hello",
            "appVersion" => appVersion
        });
        Sys.println("PhoneLink tx hello: v" + appVersion);
    }

    // ── Notify phone that an offline run batch has been synced to the server ──
    // runId: the backend run record ID returned by the upload-batch endpoint.
    // The phone uses this to show a notification that deep-links to that run.
    function sendSyncComplete(sessionId, runId) {
        var msg = {
            "type"      => "command",
            "action"    => "syncComplete",
            "sessionId" => sessionId
        };
        if (runId != null) { msg.put("runId", runId); }
        _transmit(msg);
        Sys.println("PhoneLink tx syncComplete: session=" + sessionId + " runId=" + runId);
    }

    // ── Send run data to phone (Scenario B — watch streams GPS + biometrics) ──
    // Builds a new dictionary so the caller's data dict is never mutated.
    function sendRunData(data) {
        var msg = { "type" => "watchData" };
        var keys = data.keys();
        for (var i = 0; i < keys.size(); i++) {
            var k = keys[i];
            msg.put(k, data.get(k));
        }
        _transmit(msg);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _transmit(payload) {
        // Comm.transmit() throws (e.g. BLE_ERROR, CONNECTION_UNAVAILABLE) when the
        // companion phone app is not running — catch so the watch never crashes.
        try {
            Comm.transmit(payload, null, new TransmitListener(method(:_onTransmitDone)));
        } catch (e) {
            _lastSendOk = false;
            Sys.println("PhoneLink: transmit exception (no phone?) — " + e.toString());
        }
    }

    // Raw message from Comm — forward to registered callback
    function _onRawMessage(msg as Comm.PhoneAppMessage) as Void {
        if (msg == null || msg.data == null) { return; }
        if (_onMessage != null) {
            _onMessage.invoke(msg.data);
        }
    }

    function _onTransmitDone(success) {
        _lastSendOk = success;
        if (!success) {
            Sys.println("PhoneLink: transmit failed");
        }
    }

    function lastSendOk() { return _lastSendOk; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal transmit-result listener
// ─────────────────────────────────────────────────────────────────────────────
class TransmitListener extends Comm.ConnectionListener {

    private var _callback;

    function initialize(callback) {
        ConnectionListener.initialize();
        _callback = callback;
    }

    function onComplete() {
        if (_callback != null) { _callback.invoke(true); }
    }

    function onError() {
        if (_callback != null) { _callback.invoke(false); }
    }
}
