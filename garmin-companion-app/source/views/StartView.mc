// AI Run Coach - Start / Landing Screen
// Two-mode UI:
//   Coached  - phone has sent a preparedRun message (route/training/free coached)
//   Basic    - authenticated but no prepared run; plain free-run
// Also:
//   Waiting  - not yet authenticated (no auth token)

using Toybox.Application as App;
using Toybox.Graphics as Gfx;
using Toybox.Timer as Timer;
using Toybox.WatchUi as Ui;
using Toybox.System as Sys;
using Toybox.Communications as Comm;
using Toybox.Attention as Attention;

class StartView extends Ui.View {

    // Phone link
    private var _phoneLink = null;

    // Auth state
    private var _isAuthenticated = false;
    private var _isConnected     = false;
    private var _runnerName      = "";

    // Prepared-run (coached) state
    private var _isPreparedRun   = false;
    private var _prepRunType     = "";
    private var _prepRunDist     = 0.0;
    private var _prepWorkoutType = "";
    private var _prepTargetPace  = "";
    private var _prepWorkoutDesc = "";
    private var _prepIntervalCnt = 0;
    private var _prepIntervalDist = 0.0;
    private var _prepIntervalDur  = 0;

    // Animation
    private var _timer      = null;
    private var _dotCount   = 0;
    private var _pulseScale = 0;
    private var _tickCount  = 0;

    function initialize() {
        View.initialize();
        _phoneLink = new PhoneLink();
        var token = App.Storage.getValue("authToken");
        _isAuthenticated = (token != null && token.length() > 0);
        var name = App.Storage.getValue("runnerName");
        _runnerName = (name != null) ? name : "";
    }

    function onShow() {
        var token = App.Storage.getValue("authToken");
        _isAuthenticated = (token != null && token.length() > 0);
        var name = App.Storage.getValue("runnerName");
        _runnerName = (name != null) ? name : "";

        // Register and immediately announce we are open so the phone can
        // push back any pending prepared run regardless of order.
        _phoneLink.register(method(:onPhoneMessage));
        _phoneLink.sendCommand("watchReady");

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

    // -- Phone message handler -----------------------------------------------
    // PhoneLink passes msg.data directly as a Dictionary.
    function onPhoneMessage(data) as Void {
        if (data == null) { return; }
        var msgType = data["type"];

        if (msgType != null && msgType.equals("auth")) {
            var token = data["authToken"];
            var rname = data["runnerName"];
            if (token != null && token.length() > 0) {
                App.Storage.setValue("authToken", token);
                _isAuthenticated = true;
                _isConnected     = true;
            }
            if (rname != null) {
                App.Storage.setValue("runnerName", rname);
                _runnerName = rname;
            }
            Ui.requestUpdate();

        } else if (msgType != null && msgType.equals("preparedRun")) {
            _isPreparedRun = true;
            var dist = data["distance"];
            var rt   = data["runType"];
            var wt   = data["workoutType"];
            var tp   = data["targetPace"];
            var wd   = data["workoutDesc"];
            var ic   = data["intervalCount"];
            var id   = data["intervalDistKm"];
            var idr  = data["intervalDurSecs"];
            if (dist != null) { _prepRunDist     = dist.toFloat(); }
            if (rt   != null) { _prepRunType     = rt; }
            if (wt   != null) { _prepWorkoutType = wt; }
            if (tp   != null) { _prepTargetPace  = tp; }
            if (wd   != null) { _prepWorkoutDesc = wd; }
            if (ic   != null) { _prepIntervalCnt  = ic.toNumber(); }
            if (id   != null) { _prepIntervalDist = id.toFloat(); }
            if (idr  != null) { _prepIntervalDur  = idr.toNumber(); }
            Sys.println("preparedRun received: " + _prepRunType);
            // Two-pulse haptic so user knows the run is ready on their wrist
            _vibePrepared();
            Ui.requestUpdate();

        } else if (msgType != null && msgType.equals("startRun")) {
            _launchRunView(true);

        } else if (msgType != null && msgType.equals("disconnect")) {
            _isConnected = false;
            Ui.requestUpdate();
        }
    }

    // -- Animation tick ------------------------------------------------------
    function onTick() as Void {
        _dotCount   = (_dotCount + 1) % 4;
        _pulseScale = (_pulseScale + 1) % 20;
        _tickCount  = _tickCount + 1;
        Ui.requestUpdate();
    }

    // -- Drawing -------------------------------------------------------------
    function onUpdate(dc) {
        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
        dc.clear();

        var width   = dc.getWidth();
        var height  = dc.getHeight();
        var centerX = width / 2;
        var centerY = height / 2;

        // Outer gold bezel ring (double-stroke for depth)
        dc.setColor(0xB8960C, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, (width / 2) - 4);
        dc.setColor(0x3A2E00, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, (width / 2) - 6);

        // App wordmark in champagne gold
        dc.setColor(0xD4AF37, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, (height * 0.14).toNumber(), Gfx.FONT_TINY,
            "AI RUN COACH", Gfx.TEXT_JUSTIFY_CENTER);

        // Gold divider
        dc.setColor(0x3A2E00, Gfx.COLOR_TRANSPARENT);
        dc.drawLine((width * 0.2).toNumber(), (height * 0.26).toNumber(),
                    (width * 0.8).toNumber(), (height * 0.26).toNumber());

        // Connection dot (top-right)
        if (_isConnected) {
            dc.setColor(Gfx.COLOR_GREEN, Gfx.COLOR_TRANSPARENT);
            dc.fillCircle(width - 22, 22, 5);
        }

        if (!_isAuthenticated) {
            _drawWaitingMode(dc, width, height, centerX, centerY);
        } else if (_isPreparedRun) {
            _drawCoachedMode(dc, width, height, centerX, centerY);
        } else {
            _drawBasicMode(dc, width, height, centerX, centerY);
        }
    }

    // -- WAITING mode (not authenticated) ------------------------------------
    private function _drawWaitingMode(dc, width, height, centerX, centerY) {
        var dots = "";
        for (var i = 0; i < _dotCount; i++) { dots = dots + "."; }

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, centerY - 20, Gfx.FONT_SMALL,
            "Waiting for phone" + dots, Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, centerY + 10, Gfx.FONT_TINY,
            "Open AI Run Coach", Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, height * 0.74, Gfx.FONT_TINY,
            "on your phone", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // -- BASIC mode (authenticated, no prepared run) -------------------------
    private function _drawBasicMode(dc, width, height, centerX, centerY) {
        // Gold breathing pulse ring
        var pulseR = 38 + (_pulseScale / 5);
        dc.setColor(0x3A2E00, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, pulseR + 1);
        dc.setColor(0x7A6400, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, pulseR);
        if (_pulseScale > 14) {
            dc.setColor(0xB8960C, Gfx.COLOR_TRANSPARENT);
            dc.drawCircle(centerX, centerY, pulseR - 2);
        }

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, centerY - 14, Gfx.FONT_MEDIUM,
            "READY", Gfx.TEXT_JUSTIFY_CENTER);

        if (_runnerName.length() > 0) {
            dc.setColor(0xD4AF37, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, centerY + 12, Gfx.FONT_TINY,
                _runnerName, Gfx.TEXT_JUSTIFY_CENTER);
        }

        dc.setColor(0xFFD700, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, (height * 0.74).toNumber(), Gfx.FONT_SMALL,
            "Press START", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // -- COACHED mode (prepared run received) --------------------------------
    private function _drawCoachedMode(dc, width, height, centerX, centerY) {
        // "COACHED RUN" gold pill badge
        var badgeY = (height * 0.28).toNumber();
        dc.setColor(0x1A1200, Gfx.COLOR_TRANSPARENT);
        dc.fillRectangle(width / 2 - 46, badgeY - 2, 92, 16);
        dc.setColor(0xB8960C, Gfx.COLOR_TRANSPARENT);
        dc.drawRectangle(width / 2 - 46, badgeY - 2, 92, 16);
        dc.setColor(0xD4AF37, Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, badgeY, Gfx.FONT_XTINY,
            "COACHED RUN", Gfx.TEXT_JUSTIFY_CENTER);

        // Workout type — white, primary
        var typeLabel = _formatRunTypeLabel();
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, (height * 0.38).toNumber(), Gfx.FONT_MEDIUM,
            typeLabel, Gfx.TEXT_JUSTIFY_CENTER);

        // Workout description — mid-gold secondary
        if (_prepWorkoutDesc.length() > 0) {
            dc.setColor(0x7A6400, Gfx.COLOR_TRANSPARENT);
            dc.drawText(width / 2, (height * 0.50).toNumber(), Gfx.FONT_TINY,
                _prepWorkoutDesc, Gfx.TEXT_JUSTIFY_CENTER);
        }

        // Target pace badge — gold border
        var infoY = (height * 0.58).toNumber();
        if (_prepTargetPace.length() > 0) {
            dc.setColor(0x1A1200, Gfx.COLOR_TRANSPARENT);
            dc.fillRectangle(width / 2 - 52, infoY - 2, 104, 22);
            dc.setColor(0xD4AF37, Gfx.COLOR_TRANSPARENT);
            dc.drawRectangle(width / 2 - 52, infoY - 2, 104, 22);
            dc.drawText(width / 2, infoY, Gfx.FONT_TINY,
                _prepTargetPace + " /km", Gfx.TEXT_JUSTIFY_CENTER);
        }

        // Distance — mid-gold
        if (_prepRunDist > 0.0) {
            dc.setColor(0x7A6400, Gfx.COLOR_TRANSPARENT);
            dc.drawText(width / 2, (height * 0.68).toNumber(), Gfx.FONT_TINY,
                _prepRunDist.format("%.1f") + " km", Gfx.TEXT_JUSTIFY_CENTER);
        }

        // CTA — bright gold
        dc.setColor(0xFFD700, Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, (height * 0.78).toNumber(), Gfx.FONT_SMALL,
            "Press START", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // Format a human-readable label from run type + workout type
    private function _formatRunTypeLabel() {
        if (_prepWorkoutType.length() > 0) {
            // Capitalise first letter
            var first = _prepWorkoutType.substring(0, 1).toUpper();
            var rest  = _prepWorkoutType.substring(1, _prepWorkoutType.length());
            return first + rest + " Run";
        }
        if (_prepRunType.equals("route"))    { return "Route Run"; }
        if (_prepRunType.equals("training")) { return "Training"; }
        return "Coached Run";
    }

    // -- Navigation ----------------------------------------------------------
    function _launchRunView(phoneControlled) {
        var view     = new RunView();
        var delegate = new RunDelegate();
        delegate.setView(view);

        if (phoneControlled) {
            view.setPhoneControlled(true);
        }

        if (_isPreparedRun) {
            view.setCoachingMode({
                "runType"      => _prepRunType,
                "distance"     => _prepRunDist,
                "workoutType"  => _prepWorkoutType,
                "targetPace"   => _prepTargetPace,
                "workoutDesc"  => _prepWorkoutDesc,
                "intervalCount"    => _prepIntervalCnt,
                "intervalDistKm"   => _prepIntervalDist,
                "intervalDurSecs"  => _prepIntervalDur
            });
        }

        Ui.switchToView(view, delegate, Ui.SLIDE_LEFT);
    }

    // -- Public accessors for delegate ---------------------------------------
    function isAuthenticated() { return _isAuthenticated; }
    function launchRunView()   { _launchRunView(false); }


    // Two short pulses: distinct "run ready" haptic cue
    private function _vibePrepared() {
        if (Toybox.Attention has :vibrate) {
            Toybox.Attention.vibrate([
                new Toybox.Attention.VibeProfile(70, 150),
                new Toybox.Attention.VibeProfile(0,  80),
                new Toybox.Attention.VibeProfile(70, 150)
            ]);
        }
    }

    // Clear prepared run (e.g. after finishing a coached run)
    function clearPreparedRun() {
        _isPreparedRun    = false;
        _prepRunType      = "";
        _prepRunDist      = 0.0;
        _prepWorkoutType  = "";
        _prepTargetPace   = "";
        _prepWorkoutDesc  = "";
        _prepIntervalCnt  = 0;
        _prepIntervalDist = 0.0;
        _prepIntervalDur  = 0;
    }
}

// StartDelegate -- button handling on the start screen
class StartDelegate extends Ui.BehaviorDelegate {

    private var _view;

    function initialize(view) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onKey(keyEvent) {
        if (keyEvent.getKey() == Ui.KEY_START) {
            if (_view.isAuthenticated()) {
                _view.launchRunView();
            }
            return true;
        }
        return false;
    }

    function onEnterKey() {
        if (_view.isAuthenticated()) {
            _view.launchRunView();
        }
        return true;
    }
}
