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
(:gui)
class PhoneLink {

    // Callback invoked when a message arrives from the phone.
    // Signature:  function onPhoneMessage(data as Dictionary) as Void
    private var _onMessage = null;

    // Whether the last transmit succeeded (for optional UI indicator)
    private var _lastSendOk = true;

    // Guard against re-registering the BT listener on every onShow() call.
    // Comm.registerForPhoneAppMessages() only needs to be called once.
    private var _registered = false;

    // Pending transmit counter — tracks how many Comm.transmit() calls have been
    // issued but not yet acknowledged (onComplete / onError not yet called).
    // Used to prevent BT queue + heap exhaustion on low-memory devices (FR55).
    // High-frequency GPS frames (sendRunData) are dropped when this exceeds the
    // cap; control commands (start/stop/pause) always go through.
    private var _pendingTransmits = 0;
    private const MAX_DATA_PENDING = 2;   // max queued watchData frames

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
    // Control commands always bypass the pending-transmit cap so they are never dropped.
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
    // lastCrash: optional breadcrumb (see RunView._recordCrash) from a caught
    // exception on the PREVIOUS app run. Forwarded so it lands in the phone's
    // logcat even without a USB cable to the watch — the watch itself has no
    // retrievable crash log for a sideloaded/dev build.
    function sendWatchReady(hasPendingSync, lastCrash) {
        var msg = {
            "type"           => "command",
            "action"         => "watchReady",
            "hasPendingSync" => hasPendingSync
        };
        if (lastCrash != null) { msg["lastCrash"] = lastCrash; }
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
    //
    // CRASH GUARD (FR55 / low-memory devices):
    // If too many watchData frames are already in the BT queue (phone not reading,
    // screen locked, Doze mode), each pending Comm.transmit() holds heap-allocated
    // objects (msg Dictionary + TransmitListener). On FR55 (~64 KB heap) these
    // accumulate rapidly at 1 frame / 2 s, causing OOM after ~5-10 min.
    // Drop this frame silently if the pending count is over the cap.
    // Control commands (sendCommand, sendWatchReady, etc.) always go through.
    function sendRunData(data) {
        if (_pendingTransmits >= MAX_DATA_PENDING) {
            // Phone isn't draining the queue — skip this high-frequency frame.
            // Control messages are unaffected (they call _transmit() directly).
            Sys.println("PhoneLink.sendRunData: dropped (pending=" + _pendingTransmits + ")");
            return;
        }
        var msg = { "type" => "watchData" };
        var keys = data.keys();
        for (var i = 0; i < keys.size(); i++) {
            var k = keys[i];
            msg.put(k, data.get(k));
        }
        _transmit(msg);
    }

    // ── Internal ──────────────────────────────────────────��───────────────────

    function _transmit(payload) {
        // Comm.transmit() throws (e.g. BLE_ERROR, CONNECTION_UNAVAILABLE) when the
        // companion phone app is not running — catch so the watch never crashes.
        _pendingTransmits += 1;
        try {
            Comm.transmit(payload, null, new TransmitListener(method(:_onTransmitDone)));
        } catch (e) {
            _pendingTransmits -= 1;
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
        if (_pendingTransmits > 0) { _pendingTransmits -= 1; }
        _lastSendOk = success;
        if (!success) {
            Sys.println("PhoneLink: transmit failed");
        }
    }

    function lastSendOk() { return _lastSendOk; }
    function pendingTransmits() { return _pendingTransmits; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal transmit-result listener
// ─────────────────────────────────────────────────────────────────────────────
(:gui)
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
