// PairingCodeManager.mc
// Self-configured pairing-code fallback — does NOT depend on Garmin's ConnectIQ
// device-selection UI at all. That hand-off (phone's showDeviceSelection() → Garmin
// Connect Mobile) is confirmed unreliable: it fails silently on-device with no error
// surfaced to the phone app (see GarminWatchManager.swift / garmin_pairing_diagnostics
// on the backend). This path instead has the watch request a short-lived numeric code
// directly from the backend over HTTP (same Comm.makeWebRequest channel DataStreamer
// already uses), display it, and poll until the user types it into the already-logged-in
// iOS app. No dependency on ConnectIQ pairing having succeeded at all.
//
// Runs in parallel with the existing BLE "auth" path (PhoneLink) — whichever succeeds
// first wins; RunView._applyAuthToken() is idempotent and cancels this manager once
// authenticated via either route.

using Toybox.Communications as Comm;
using Toybox.System as Sys;
using Toybox.Application as App;
using Toybox.Lang as Lang;
using Toybox.Timer as Timer;

(:gui)
class PairingCodeManager {

    private var _baseUrl = "https://airuncoach.live";
    private var _code = null;
    private var _pollTimer = null;
    private var _startInFlight = false;
    private var _pollInFlight = false;
    private var _cancelled = false;
    // Comm.makeWebRequest's callback is confirmed (via garmin_pairing_diagnostics: every
    // real watch that ever requested a code got one server-side, but not one of them ever
    // reached "confirmed" — the code never even showed for some) to sometimes just never
    // fire on real hardware — no exception, no error callback, nothing. Without a watchdog,
    // that permanently wedges _startInFlight/_pollInFlight true, and start()/_pollStatus()'s
    // own in-flight guards then silently block every future attempt forever, even though
    // the repeating poll Timer keeps firing. These two timers force a reset+retry instead.
    private var _requestTimeoutTimer = null;
    private var _pollTimeoutTimer = null;

    // Set by RunView. onCodeReceived: function(code as String) — display it.
    // onConfirmed: function(token as String) — hand off to _applyAuthToken.
    private var _onCodeReceived = null;
    private var _onConfirmed = null;

    private const POLL_INTERVAL_MS = 4000;
    // Retry a failed /start (e.g. no network yet) rather than leaving the watch stuck
    // with no code and no explanation — mirrors DataStreamer's startSession retry pattern.
    private const START_RETRY_MS = 5000;
    private const REQUEST_TIMEOUT_MS = 10000;
    private const POLL_TIMEOUT_MS    = 10000;

    function initialize() {}

    function setCallbacks(onCodeReceived, onConfirmed) {
        _onCodeReceived = onCodeReceived;
        _onConfirmed    = onConfirmed;
    }

    function currentCode() { return _code; }

    // Stop polling — called once the watch is authenticated via either this path or BLE.
    function cancel() {
        _cancelled = true;
        if (_pollTimer != null) { _pollTimer.stop(); _pollTimer = null; }
        if (_requestTimeoutTimer != null) { _requestTimeoutTimer.stop(); _requestTimeoutTimer = null; }
        if (_pollTimeoutTimer != null) { _pollTimeoutTimer.stop(); _pollTimeoutTimer = null; }
    }

    // Kick off the flow. Safe to call multiple times (e.g. RunView.onShow() re-entry) —
    // no-ops if a code is already active or a request is already in flight.
    function start() {
        if (_cancelled || _code != null || _startInFlight) { return; }
        _requestCode();
    }

    function _requestCode() as Void {
        if (_startInFlight) { return; }
        _startInFlight = true;
        var deviceInfo = Sys.getDeviceSettings();
        var payload = {
            "deviceId"        => deviceInfo.uniqueIdentifier,
            "deviceModel"     => deviceInfo.partNumber,
            "watchAppVersion" => "3.4.3"
        };
        var url = _baseUrl + "/api/garmin-companion/pairing/start";
        var options = {
            :method => Comm.HTTP_REQUEST_METHOD_POST,
            :headers => { "Content-Type" => Comm.REQUEST_CONTENT_TYPE_JSON },
            :responseType => Comm.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Sys.println("PairingCodeManager: requesting code — device=" + deviceInfo.uniqueIdentifier);
        try {
            Comm.makeWebRequest(url, payload, options, method(:_onStartResponse));
            if (_requestTimeoutTimer != null) { _requestTimeoutTimer.stop(); }
            _requestTimeoutTimer = new Timer.Timer();
            _requestTimeoutTimer.start(method(:_onRequestTimeout), REQUEST_TIMEOUT_MS, false);
        } catch (e) {
            _startInFlight = false;
            Sys.println("PairingCodeManager._requestCode: makeWebRequest threw — " + e.toString());
            _scheduleStartRetry();
        }
    }

    // NOT private — Timer callback. Fires if _onStartResponse never arrives at all.
    function _onRequestTimeout() as Void {
        _requestTimeoutTimer = null;
        if (_cancelled || !_startInFlight) { return; } // response (or its own retry) already handled it
        Sys.println("PairingCodeManager: /pairing/start timed out with no response — retrying");
        _startInFlight = false;
        _scheduleStartRetry();
    }

    // NOT private: referenced via method(:_onStartResponse) — Monkey C's indirect symbol
    // lookup cannot resolve a private member (same constraint DataStreamer documents above
    // its onSessionStarted/startSession pair).
    function _onStartResponse(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        if (_requestTimeoutTimer != null) { _requestTimeoutTimer.stop(); _requestTimeoutTimer = null; }
        _startInFlight = false;
        if (_cancelled) { return; }
        if (responseCode == 200 && data != null && (data instanceof Lang.Dictionary)) {
            var code = data.get("code");
            if (code != null) {
                _code = code;
                Sys.println("PairingCodeManager: code received — " + _code);
                if (_onCodeReceived != null) { _onCodeReceived.invoke(_code); }
                _startPolling();
                return;
            }
        }
        Sys.println("PairingCodeManager: /pairing/start failed — responseCode=" + responseCode);
        _scheduleStartRetry();
    }

    function _scheduleStartRetry() {
        if (_cancelled) { return; }
        if (_pollTimer != null) { _pollTimer.stop(); }
        _pollTimer = new Timer.Timer();
        _pollTimer.start(method(:_requestCode), START_RETRY_MS, false);
    }

    function _startPolling() {
        if (_cancelled) { return; }
        if (_pollTimer != null) { _pollTimer.stop(); }
        _pollTimer = new Timer.Timer();
        _pollTimer.start(method(:_pollStatus), POLL_INTERVAL_MS, true);
    }

    // NOT private — Timer callback, same indirect-lookup constraint as above.
    function _pollStatus() as Void {
        if (_cancelled || _code == null || _pollInFlight) { return; }
        _pollInFlight = true;
        var url = _baseUrl + "/api/garmin-companion/pairing/status?code=" + _code;
        var options = {
            :method => Comm.HTTP_REQUEST_METHOD_GET,
            :responseType => Comm.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        try {
            Comm.makeWebRequest(url, null, options, method(:_onStatusResponse));
            if (_pollTimeoutTimer != null) { _pollTimeoutTimer.stop(); }
            _pollTimeoutTimer = new Timer.Timer();
            _pollTimeoutTimer.start(method(:_onPollTimeout), POLL_TIMEOUT_MS, false);
        } catch (e) {
            _pollInFlight = false;
            Sys.println("PairingCodeManager._pollStatus: makeWebRequest threw — " + e.toString());
            // Transient — next timer tick tries again. No retry budget needed since the
            // repeating poll timer itself is the retry mechanism.
        }
    }

    // NOT private — Timer callback. Fires if _onStatusResponse never arrives at all; without
    // this, one dropped response permanently wedges _pollInFlight true and every subsequent
    // repeating-timer tick silently no-ops forever (confirmed: no watch in garmin_pairing_codes
    // has ever reached status="confirmed", even ones that plainly got a code from the server).
    function _onPollTimeout() as Void {
        _pollTimeoutTimer = null;
        if (_cancelled) { return; }
        Sys.println("PairingCodeManager: status poll timed out with no response — next tick will retry");
        _pollInFlight = false;
    }

    // NOT private — Comm.makeWebRequest callback.
    function _onStatusResponse(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        if (_pollTimeoutTimer != null) { _pollTimeoutTimer.stop(); _pollTimeoutTimer = null; }
        _pollInFlight = false;
        if (_cancelled) { return; }

        if (responseCode == 404) {
            Sys.println("PairingCodeManager: code not found (expired off the server) — requesting a new one");
            _resetAndRestart();
            return;
        }
        if (responseCode != 200 || data == null || !(data instanceof Lang.Dictionary)) {
            Sys.println("PairingCodeManager: status poll failed — responseCode=" + responseCode);
            return; // transient — repeating timer will try again
        }

        var status = data.get("status");
        if (status == null) { return; }

        if (status.equals("confirmed")) {
            var token = data.get("token");
            if (token != null && (token instanceof Lang.String) && token.length() > 0) {
                Sys.println("PairingCodeManager: code confirmed — applying token");
                if (_pollTimer != null) { _pollTimer.stop(); _pollTimer = null; }
                if (_onConfirmed != null) { _onConfirmed.invoke(token); }
            }
        } else if (status.equals("expired") || status.equals("invalidated")) {
            Sys.println("PairingCodeManager: code " + status + " — requesting a new one");
            _resetAndRestart();
        }
        // status == "pending" — nothing to do, next timer tick polls again.
    }

    private function _resetAndRestart() {
        _code = null;
        if (_pollTimer != null) { _pollTimer.stop(); _pollTimer = null; }
        _requestCode();
    }
}
