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

    function initialize() {}

    // ── Register ──────────────────────────────────────────────────────────────
    // Call this once from RunView.onShow() (and StartView.onShow()).
    function register(callback) {
        _onMessage = callback;
        Comm.registerForPhoneAppMessages(method(:_onRawMessage));
        Sys.println("PhoneLink registered");
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

    // ── Send run data to phone (Scenario 3 — optional confirmation) ───────────
    // Not required in Scenario 2 (phone already has the data).
    function sendRunData(data) {
        var msg = data;
        msg.put("type", "watchData");
        _transmit(msg);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _transmit(payload) {
        Comm.transmit(payload, null, new TransmitListener(method(:_onTransmitDone)));
    }

    // Raw message from Comm — forward to registered callback
    function _onRawMessage(msg) {
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
