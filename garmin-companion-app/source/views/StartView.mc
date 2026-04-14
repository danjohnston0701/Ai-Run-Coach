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

class StartView extends Ui.View {

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

        Comm.registerForPhoneAppMessages(method(:onPhoneMessage));

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
    function onPhoneMessage(msg as Comm.PhoneAppMessage) as Void {
        if (msg == null) { return; }
        var data = msg.data;
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

        // Outer accent ring
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, (width / 2) - 4);

        // App title
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, height * 0.14, Gfx.FONT_TINY,
            "AI RUN COACH", Gfx.TEXT_JUSTIFY_CENTER);

        // Divider
        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawLine(width * 0.2, height * 0.26, width * 0.8, height * 0.26);

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
        // Breathing pulse ring
        var pulseR = 38 + (_pulseScale / 5);
        dc.setColor(0x004466, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, pulseR);

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, centerY - 14, Gfx.FONT_MEDIUM,
            "Ready", Gfx.TEXT_JUSTIFY_CENTER);

        if (_runnerName.length() > 0) {
            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, centerY + 10, Gfx.FONT_TINY,
                _runnerName, Gfx.TEXT_JUSTIFY_CENTER);
        }

        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, height * 0.74, Gfx.FONT_SMALL,
            "Press START", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // -- COACHED mode (prepared run received) --------------------------------
    private function _drawCoachedMode(dc, width, height, centerX, centerY) {
        // Mode label
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, height * 0.28, Gfx.FONT_TINY,
            "COACHED RUN", Gfx.TEXT_JUSTIFY_CENTER);

        // Workout type / run type
        var typeLabel = _formatRunTypeLabel();
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, height * 0.38, Gfx.FONT_MEDIUM,
            typeLabel, Gfx.TEXT_JUSTIFY_CENTER);

        // Workout description (if available)
        if (_prepWorkoutDesc.length() > 0) {
            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, height * 0.50, Gfx.FONT_TINY,
                _prepWorkoutDesc, Gfx.TEXT_JUSTIFY_CENTER);
        }

        // Target pace badge (if available)
        var infoY = height * 0.58;
        if (_prepTargetPace.length() > 0) {
            dc.setColor(0x003A4F, Gfx.COLOR_TRANSPARENT);
            dc.fillRectangle(centerX - 50, infoY - 2, 100, 22);
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            dc.drawRectangle(centerX - 50, infoY - 2, 100, 22);
            dc.drawText(centerX, infoY, Gfx.FONT_TINY,
                _prepTargetPace + " /km", Gfx.TEXT_JUSTIFY_CENTER);
        }

        // Distance target
        var distY = height * 0.68;
        if (_prepRunDist > 0.0) {
            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, distY, Gfx.FONT_TINY,
                _prepRunDist.format("%.1f") + " km", Gfx.TEXT_JUSTIFY_CENTER);
        }

        // CTA
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, height * 0.78, Gfx.FONT_SMALL,
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
