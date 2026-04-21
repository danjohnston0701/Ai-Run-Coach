// AI Run Coach - Start / Landing Screen
// Shown when the app is first opened on the watch.
// Two modes:
//   Connected  — phone app is open and has sent an auth token via PhoneLink
//   Standalone — no phone link; user must open the phone app first

using Toybox.Application as App;
using Toybox.Graphics as Gfx;
using Toybox.Timer as Timer;
using Toybox.WatchUi as Ui;
using Toybox.System as Sys;
using Toybox.Communications as Comm;

// ─────────────────────────────────────────────────────────────────────────────
// StartView
// ─────────────────────────────────────────────────────────────────────────────
class StartView extends Ui.View {

    // State
    private var _isAuthenticated = false;
    private var _isConnected     = false;   // Phone app is active over BT
    private var _runnerName      = "";

    // Animation
    private var _timer      = null;
    private var _dotCount   = 0;
    private var _pulseScale = 0;
    private var _tickCount  = 0;

    function initialize() {
        View.initialize();
        // Check persisted auth token — valid from a previous phone session
        var token = App.Storage.getValue("authToken");
        _isAuthenticated = (token != null && token.length() > 0);
        var name = App.Storage.getValue("runnerName");
        _runnerName = (name != null) ? name : "";
    }

    function onShow() {
        // Refresh auth from storage each time screen becomes visible
        var token = App.Storage.getValue("authToken");
        _isAuthenticated = (token != null && token.length() > 0);
        var name = App.Storage.getValue("runnerName");
        _runnerName = (name != null) ? name : "";

        // Register for messages from phone app
        Comm.registerForPhoneAppMessages(method(:onPhoneMessage));

        // Start animation timer (500 ms ticks)
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 500, true);

        Ui.requestUpdate();
    }

    function onHide() {
        if (_timer != null) {
            _timer.stop();
            _timer = null;
        }
    }

    // ── Phone message handler ─────────────────────────────────────────────────
    // The Android app sends an "auth" message with the user's token when the
    // phone app is opened and the watch is connected.
    function onPhoneMessage(msg as Comm.PhoneAppMessage) as Void {
        if (msg == null) { return; }
        
        var data = msg.data;
        if (data == null) { return; }

        var msgType = data["type"];

        if (msgType != null && msgType.equals("auth")) {
            var token = data["authToken"];
            var name  = data["runnerName"];

            if (token != null && token.length() > 0) {
                App.Storage.setValue("authToken", token);
                _isAuthenticated = true;
                _isConnected     = true;
            }

            if (name != null) {
                App.Storage.setValue("runnerName", name);
                _runnerName = name;
            }

            Ui.requestUpdate();

        } else if (msgType != null && msgType.equals("startRun")) {
            // Phone app is commanding the watch to launch the run screen
            // (used in Scenario 2 — phone initiates, watch mirrors)
            _launchRunView(true);

        } else if (msgType != null && msgType.equals("disconnect")) {
            _isConnected = false;
            Ui.requestUpdate();
        }
    }

    // ── Animation tick ────────────────────────────────────────────────────────
    function onTick() as Void {
        _dotCount   = (_dotCount + 1) % 4;
        _pulseScale = (_pulseScale + 1) % 20;
        _tickCount  = _tickCount + 1;
        Ui.requestUpdate();
    }

    // ── Drawing ───────────────────────────────────────────────────────────────
    function onUpdate(dc) {
        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
        dc.clear();

        var width   = dc.getWidth();
        var height  = dc.getHeight();
        var centerX = width / 2;
        var centerY = height / 2;

        // ── Outer accent ring ──────────────────────────────────────────────
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, (width / 2) - 4);

        // ── App title ──────────────────────────────────────────────────────
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            centerX,
            height * 0.14,
            Gfx.FONT_TINY,
            "AI RUN COACH",
            Gfx.TEXT_JUSTIFY_CENTER
        );

        // Divider
        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawLine(width * 0.2, height * 0.26, width * 0.8, height * 0.26);

        // ── Center content ─────────────────────────────────────────────────
        if (_isAuthenticated) {
            // Breathing pulse ring
            var pulseR = 38 + (_pulseScale / 5);
            dc.setColor(0x004466, Gfx.COLOR_TRANSPARENT);
            dc.drawCircle(centerX, centerY, pulseR);

            // "Ready" label
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(
                centerX,
                centerY - 14,
                Gfx.FONT_MEDIUM,
                "Ready",
                Gfx.TEXT_JUSTIFY_CENTER
            );

            // Runner name (if available)
            if (_runnerName.length() > 0) {
                dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
                dc.drawText(
                    centerX,
                    centerY + 10,
                    Gfx.FONT_TINY,
                    _runnerName,
                    Gfx.TEXT_JUSTIFY_CENTER
                );
            }

            // Connection status dot
            if (_isConnected) {
                dc.setColor(Gfx.COLOR_GREEN, Gfx.COLOR_TRANSPARENT);
                dc.fillCircle(width - 22, 22, 5);
            }

            // Hint
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            dc.drawText(
                centerX,
                height * 0.74,
                Gfx.FONT_SMALL,
                "Press START",
                Gfx.TEXT_JUSTIFY_CENTER
            );

        } else {
            // Not authenticated — ask user to open phone app
            var dots = "";
            for (var i = 0; i < _dotCount; i++) { dots = dots + "."; }

            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(
                centerX,
                centerY - 20,
                Gfx.FONT_SMALL,
                "Waiting for phone" + dots,
                Gfx.TEXT_JUSTIFY_CENTER
            );

            dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(
                centerX,
                centerY + 10,
                Gfx.FONT_TINY,
                "Open AI Run Coach",
                Gfx.TEXT_JUSTIFY_CENTER
            );

            dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(
                centerX,
                height * 0.74,
                Gfx.FONT_TINY,
                "on your phone",
                Gfx.TEXT_JUSTIFY_CENTER
            );
        }
    }

    // ── Internal navigation ───────────────────────────────────────────────────
    function _launchRunView(phoneControlled) {
        var view     = new RunView();
        var delegate = new RunDelegate();
        delegate.setView(view);

        if (phoneControlled) {
            view.setPhoneControlled(true);
        }

        Ui.switchToView(view, delegate, Ui.SLIDE_LEFT);
    }

    // ── Expose for delegate ───────────────────────────────────────────────────
    function isAuthenticated() { return _isAuthenticated; }
    function launchRunView()   { _launchRunView(false); }
}

// ─────────────────────────────────────────────────────────────────────────────
// StartDelegate — button handling on the start screen
// ─────────────────────────────────────────────────────────────────────────────
class StartDelegate extends Ui.BehaviorDelegate {

    private var _view;

    function initialize(view) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    // START / GPS button → launch run (only if authenticated)
    function onKey(keyEvent) {
        if (keyEvent.getKey() == Ui.KEY_START) {
            if (_view.isAuthenticated()) {
                _view.launchRunView();
            }
            return true;
        }
        return false;
    }

    // Enter key (digital crown on round watches) — same as START
    function onEnterKey() {
        if (_view.isAuthenticated()) {
            _view.launchRunView();
        }
        return true;
    }
}
