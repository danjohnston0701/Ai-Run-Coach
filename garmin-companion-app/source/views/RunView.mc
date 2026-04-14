// RunView.mc
// Main activity view — now the default/primary screen.
//
// Displays live run metrics (pace, HR, distance, time, cadence) with an
// overlay messaging system to guide the user through the auth flow and
// workout states:
//
//   OVERLAY_NONE       — Running (metrics visible, no message)
//   OVERLAY_WAITING    — "Waiting for phone..." + "Open AI Run Coach"
//   OVERLAY_READY      — "Ready to run" (authenticated, no run active)
//   OVERLAY_PREPARE    — "Prepare run on watch" button preview
//   OVERLAY_COACHED    — "Coached run ready" (prepared run received)

using Toybox.Attention;
using Toybox.Math;
using Toybox.WatchUi as Ui;
using Toybox.Graphics as Gfx;
using Toybox.Position as Pos;
using Toybox.Sensor as Sensor;
using Toybox.System as Sys;
using Toybox.Timer as Timer;
using Toybox.ActivityRecording as Record;
using Toybox.Application as App;
using Toybox.Communications as Comm;

class RunView extends Ui.View {

    // -- Overlay states --
    enum {
        OVERLAY_NONE,
        OVERLAY_WAITING,
        OVERLAY_READY,
        OVERLAY_COACHED
    }

    // -- Auth & app state --
    private var _isAuthenticated = false;
    private var _isConnected     = false;
    private var _runnerName      = "";
    private var _overlayState    = OVERLAY_WAITING;
    private var _dotCount        = 0;

    // -- Prepared-run (coached) state --
    private var _isPreparedRun   = false;
    private var _prepRunType     = "";
    private var _prepRunDist     = 0.0;
    private var _prepWorkoutType = "";
    private var _prepTargetPace  = "";
    private var _prepWorkoutDesc = "";
    private var _prepIntervalCnt = 0;
    private var _prepIntervalDist = 0.0;
    private var _prepIntervalDur  = 0;

    // -- Run metrics --
    private var _heartRate       = 0;
    private var _heartRateZone   = 1;
    private var _distance        = 0.0;
    private var _pace            = 0.0;
    private var _elapsedTime     = 0;
    private var _cadence         = 0;

    // -- State --
    private var _isRunning       = false;
    private var _isPaused        = false;
    private var _phoneControlled = false;

    // -- Coaching state --
    private var _isCoached          = false;
    private var _coachRunType       = "";
    private var _coachTargetPace    = "";
    private var _coachTargetPaceSec = 0.0;
    private var _coachingCue        = "";
    private var _coachingCueTicks   = 0;

    // -- Infrastructure --
    private var _timer        = null;
    private var _dataStreamer = null;
    private var _phoneLink    = null;
    private var _session      = null;

    // -- UI animation --
    private var _elapsedMs      = 0;
    private var _tickMs         = 250;
    private var _streamAccumMs  = 0;

    private var _dispPace       = 0.0;
    private var _dispDistance   = 0.0;
    private var _dispHeartRate  = 0;
    private var _dispCadence    = 0;

    private var _ringPhase      = 0.0;
    private var _ringPulseBoost = 0.0;

    function initialize() {
        View.initialize();
        _phoneLink    = new PhoneLink();
        _dataStreamer = new DataStreamer();

        // Check persisted auth state
        var token = App.Storage.getValue("authToken");
        _isAuthenticated = (token != null && token.length() > 0);
        var name = App.Storage.getValue("runnerName");
        _runnerName = (name != null) ? name : "";

        // Always start in READY — users can run without the phone.
        // Coaching activates automatically when phone connects and sends auth.
        // OVERLAY_WAITING is no longer a blocking screen.
        _overlayState = OVERLAY_READY;
    }

    function setPhoneControlled(val) {
        _phoneControlled = val;
    }

    function setCoachingMode(data) {
        _isCoached = true;
        _overlayState = OVERLAY_COACHED;
        var rt = data.get("runType");
        var tp = data.get("targetPace");
        var wt = data.get("workoutType");
        var wd = data.get("workoutDesc");
        var dd = data.get("distance");
        var ic = data.get("intervalCount");
        var id = data.get("intervalDistKm");
        var ir = data.get("intervalDurSecs");

        if (rt != null) { _coachRunType      = rt; }
        if (tp != null) { _coachTargetPace   = tp; _coachTargetPaceSec = _parsePaceString(tp); }
        if (wt != null) { _prepWorkoutType  = wt; }
        if (wd != null) { _prepWorkoutDesc  = wd; }
        if (dd != null) { _prepRunDist      = dd.toFloat(); }
        if (ic != null) { _prepIntervalCnt  = ic.toNumber(); }
        if (id != null) { _prepIntervalDist = id.toFloat(); }
        if (ir != null) { _prepIntervalDur  = ir.toNumber(); }
    }

    function isPaused()  { return _isPaused; }
    function isRunning() { return _isRunning; }

    // -- Lifecycle --

    function onShow() {
        _phoneLink.register(method(:onPhoneMessage));
        Comm.registerForPhoneAppMessages(method(:onPhoneAppMessage));

        if (!_phoneControlled && _isRunning) {
            _startWatchSession();
            Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
            Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
            Sensor.enableSensorEvents(method(:onSensor));
        }

        _timer = new Timer.Timer();
        _timer.start(method(:onTimer), _tickMs, true);

        Sys.println("RunView shown — auth=" + _isAuthenticated + " coached=" + _isCoached);
    }

    function onHide() {
        if (_timer != null) { _timer.stop(); _timer = null; }
        if (!_phoneControlled && _isRunning) {
            Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
            Sensor.enableSensorEvents(null);
        }
    }

    // -- Phone App Message (auth token, prepared run, etc.) --
    function onPhoneAppMessage(msg as Comm.PhoneAppMessage) as Void {
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
                _overlayState = OVERLAY_READY;
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
            if (dist != null) { _prepRunDist     = dist.toFloat(); }
            if (rt   != null) { _prepRunType     = rt; }
            if (wt   != null) { _prepWorkoutType = wt; }
            if (tp   != null) { _prepTargetPace  = tp; }
            if (wd   != null) { _prepWorkoutDesc = wd; }
            _overlayState = OVERLAY_COACHED;
            Ui.requestUpdate();

        } else if (msgType != null && msgType.equals("disconnect")) {
            _isConnected = false;
            Ui.requestUpdate();
        }
    }

    // -- PhoneLink message handler (run updates, coaching cues) --
    function onPhoneMessage(data) {
        if (data == null) { return; }
        var msgType = data.get("type");
        if (msgType == null) { return; }

        if (msgType.equals("runUpdate")) {
            var paceVal = data.get("pace");
            var distVal = data.get("distance");
            var hrVal   = data.get("hr");
            var timeVal = data.get("elapsedTime");
            var cadVal  = data.get("cadence");

            if (paceVal != null) { _pace        = paceVal.toFloat(); }
            if (distVal != null) { _distance    = distVal.toFloat(); }
            if (hrVal   != null) { _heartRate   = hrVal.toNumber(); _heartRateZone = _calcHrZone(_heartRate); }
            if (timeVal != null) { _elapsedTime = timeVal.toNumber(); _elapsedMs = _elapsedTime * 1000; }
            if (cadVal  != null) { _cadence     = cadVal.toNumber(); }

            var runningVal = data.get("isRunning");
            var pausedVal  = data.get("isPaused");
            if (runningVal != null) { _isRunning = runningVal; }
            if (pausedVal  != null) { _isPaused  = pausedVal; }

            if (_isRunning && _overlayState != OVERLAY_COACHED) {
                _overlayState = OVERLAY_NONE;
            }
            Ui.requestUpdate();

        } else if (msgType.equals("coachingCue")) {
            var cue = data.get("cue");
            if (cue != null) {
                _coachingCue = cue;
                _coachingCueTicks = 20;
                Ui.requestUpdate();
                _vibrateShort();
            }

        } else if (msgType.equals("sessionEnded")) {
            _isRunning = false;
            _isPaused = false;
            _overlayState = OVERLAY_READY;
            Ui.requestUpdate();
        }
    }

    // -- Timer tick (250 ms) --
    function onTimer() as Void {
        // Animation for waiting state
        if (_overlayState == OVERLAY_WAITING) {
            _dotCount = (_dotCount + 1) % 4;
        }

        // Increment watch-side time if standalone and running
        if (!_phoneControlled && _isRunning && !_isPaused) {
            _elapsedMs  += _tickMs;
            _elapsedTime = _elapsedMs / 1000;
        }

        // Smooth display values
        var ease = 0.18;
        if (_pace > 0 && _pace < 1200) {
            _dispPace = _dispPace + ((_pace - _dispPace) * ease);
        } else {
            _dispPace = _dispPace + ((0.0 - _dispPace) * 0.10);
        }
        _dispDistance  = _dispDistance  + ((_distance  - _dispDistance)  * ease);
        _dispHeartRate = (_dispHeartRate + ((_heartRate - _dispHeartRate) * 0.25)).toNumber();
        _dispCadence   = (_dispCadence   + ((_cadence   - _dispCadence)   * 0.25)).toNumber();

        // Breathing ring
        _ringPhase += 0.18;
        if (_ringPhase > 6.283) { _ringPhase -= 6.283; }
        _ringPulseBoost *= 0.85;
        if (_ringPulseBoost < 0.01) { _ringPulseBoost = 0.0; }

        // Coaching cue countdown
        if (_coachingCueTicks > 0) {
            _coachingCueTicks -= 1;
            if (_coachingCueTicks <= 0) { _coachingCue = ""; }
        }

        // Standalone streaming
        if (!_phoneControlled && _isRunning && !_isPaused) {
            _streamAccumMs += _tickMs;
            if (_streamAccumMs >= 1000) {
                _streamAccumMs = 0;
                if (_dataStreamer != null) {
                    _dataStreamer.sendData({
                        "heartRate"     => _heartRate,
                        "heartRateZone" => _heartRateZone,
                        "distance"      => _distance,
                        "pace"          => _pace,
                        "cadence"       => _cadence,
                        "elapsedTime"   => _elapsedTime
                    });
                }
            }
        }

        Ui.requestUpdate();
    }

    // -- GPS (Scenario 3) --
    function onPosition(info as Pos.Info) as Void {
        if (info.position != null) {
            var lat = info.position.toDegrees()[0];
            var lon = info.position.toDegrees()[1];
            if (info.altitude != null && _dataStreamer != null) {
                _dataStreamer.updateGPS(lat, lon, info.altitude);
            }
            if (info.speed != null && info.speed > 0.1) {
                _pace = 1000.0 / (info.speed * 60.0);
            }
        }
    }

    // -- Sensors (Scenario 3) --
    function onSensor(info as Sensor.Info) as Void {
        if (info.heartRate != null) {
            _heartRate     = info.heartRate;
            _heartRateZone = _calcHrZone(_heartRate);
        }
        if (info.cadence != null) { _cadence = info.cadence; }
    }

    // -- Pause / Resume --

    function pauseRun() {
        if (_isPaused || !_isRunning) { return; }
        _isPaused = true;
        if (_phoneControlled) {
            _phoneLink.sendCommand("pause");
        } else if (_session != null && _session.isRecording()) {
            _session.stop();
        }
        _vibrateShort();
        Ui.requestUpdate();
    }

    function resumeRun() {
        if (!_isPaused) { return; }
        _isPaused = false;
        if (_phoneControlled) {
            _phoneLink.sendCommand("resume");
        } else if (_session != null && !_session.isRecording()) {
            _session.start();
        }
        _vibrateShort();
        Ui.requestUpdate();
    }

    // -- Finish run --

    function finishRun() {
        _isRunning = false;
        _isPaused  = false;
        if (_phoneControlled) {
            _phoneLink.sendCommand("stop");
        } else {
            _stopWatchSession();
        }
        _overlayState = OVERLAY_READY;
        _vibrateLong();
        Ui.requestUpdate();
    }

    // -- Drawing --

    function onUpdate(dc) {
        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
        dc.clear();

        var width   = dc.getWidth();
        var height  = dc.getHeight();
        var centerX = width / 2;
        var centerY = height / 2;
        var isSmall = (height <= 240 || width <= 240);

        // Vertical anchors
        var paceY      = isSmall ? (height * 0.42).toNumber() : (height * 0.40).toNumber();
        var unitY      = paceY + (isSmall ? 28 : 34);
        var secondaryY = isSmall ? (height * 0.70).toNumber() : (height * 0.72).toNumber();
        var tertiaryY  = isSmall ? (height * 0.82).toNumber() : (height * 0.84).toNumber();

        // Breathing ring
        var s          = ((Math.sin(_ringPhase) + 1.0) * 0.5).toFloat();
        var baseRadius = (width / 2) - (isSmall ? 6 : 4);
        var breathe    = s * (isSmall ? 3.0 : 4.0);
        var pulse      = _ringPulseBoost * (isSmall ? 4.0 : 6.0);
        var ringRadius = (baseRadius - 2 + breathe + pulse).toNumber();

        dc.setColor(0x003A4F, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, baseRadius);

        if (_isPaused) {
            dc.setColor(Gfx.COLOR_ORANGE, Gfx.COLOR_TRANSPARENT);
        } else {
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        }
        dc.drawCircle(centerX, centerY, ringRadius);

        // Paused banner
        if (_isPaused) {
            dc.setColor(Gfx.COLOR_ORANGE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, height * 0.06, Gfx.FONT_TINY,
                "PAUSED", Gfx.TEXT_JUSTIFY_CENTER);
        }

        // Coaching cue banner
        if (_isCoached && _coachingCue.length() > 0) {
            dc.setColor(0x002A1A, Gfx.COLOR_TRANSPARENT);
            dc.fillRectangle(0, 0, width, 28);
            dc.setColor(Gfx.COLOR_GREEN, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, 4, Gfx.FONT_TINY,
                _coachingCue, Gfx.TEXT_JUSTIFY_CENTER);
        }

        // HR Zone bar
        _drawHrZoneBar(dc, centerX, (isSmall ? height * 0.16 : height * 0.18).toNumber(), width, _heartRateZone);

        // Primary: PACE
        var paceText  = _formatPace(_dispPace);
        var paceFonts = [Gfx.FONT_LARGE, Gfx.FONT_MEDIUM];
        var paceFont  = _pickFont(dc, paceText, paceFonts, width - 24);

        if (_isCoached && _coachTargetPaceSec > 0 && _dispPace > 0) {
            dc.setColor(_getPaceDeviationColor(), Gfx.COLOR_TRANSPARENT);
        } else {
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        }
        dc.drawText(centerX, paceY, paceFont, paceText, Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, unitY, Gfx.FONT_TINY, "min/km", Gfx.TEXT_JUSTIFY_CENTER);

        // Secondary: Distance & Time
        var distText = _formatDistance(_dispDistance);
        var timeText = _formatTime(_elapsedTime);
        var secFont  = isSmall ? Gfx.FONT_TINY : Gfx.FONT_SMALL;

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText((width * 0.25).toNumber(), secondaryY, secFont, distText, Gfx.TEXT_JUSTIFY_CENTER);
        dc.drawText((width * 0.75).toNumber(), secondaryY, secFont, timeText, Gfx.TEXT_JUSTIFY_CENTER);

        // Tertiary: HR + Cadence
        var hrColor = _getHrZoneColor(_heartRateZone);
        dc.setColor(hrColor, Gfx.COLOR_TRANSPARENT);
        dc.drawText((width * 0.25).toNumber(), tertiaryY, Gfx.FONT_TINY,
            _dispHeartRate.format("%d") + " bpm", Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText((width * 0.75).toNumber(), tertiaryY, Gfx.FONT_TINY,
            _dispCadence.format("%d") + " spm", Gfx.TEXT_JUSTIFY_CENTER);

        // -- Overlay messaging --
        _drawOverlay(dc, width, height, centerX, centerY);
    }

    // -- Overlay drawing --
    private function _drawOverlay(dc, width, height, centerX, centerY) {
        if (_overlayState == OVERLAY_WAITING) {
            _drawWaitingOverlay(dc, width, height, centerX, centerY);
        } else if (_overlayState == OVERLAY_READY) {
            _drawReadyOverlay(dc, width, height, centerX, centerY);
        } else if (_overlayState == OVERLAY_COACHED) {
            _drawCoachedOverlay(dc, width, height, centerX, centerY);
        }
    }

    private function _drawWaitingOverlay(dc, width, height, centerX, centerY) {
        // No longer used as a blocking screen.
        // Phone-not-connected is shown as a subtle hint on the READY overlay instead.
    }

    private function _drawReadyOverlay(dc, width, height, centerX, centerY) {
        // Semi-transparent dark overlay
        dc.setColor(0x000000, Gfx.COLOR_TRANSPARENT);
        dc.fillRectangle(0, 0, width, height);

        // Main title
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, centerY - 25, Gfx.FONT_MEDIUM,
            "Ready to Run", Gfx.TEXT_JUSTIFY_CENTER);

        // Show name if logged in, otherwise show uncoached hint
        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        if (_runnerName.length() > 0) {
            dc.drawText(centerX, centerY + 8, Gfx.FONT_SMALL,
                _runnerName, Gfx.TEXT_JUSTIFY_CENTER);
        } else {
            // Phone not connected — show subtle coaching hint (not a blocker)
            dc.setColor(0x555555, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, centerY + 8, Gfx.FONT_TINY,
                "Open phone app for AI coaching", Gfx.TEXT_JUSTIFY_CENTER);
        }

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, centerY + 38, Gfx.FONT_SMALL,
            "Press START to begin", Gfx.TEXT_JUSTIFY_CENTER);
    }

    private function _drawCoachedOverlay(dc, width, height, centerX, centerY) {
        // Semi-transparent dark overlay
        dc.setColor(0x000000, Gfx.COLOR_TRANSPARENT);
        dc.fillRectangle(0, 0, width, height);

        // Text
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, centerY - 40, Gfx.FONT_MEDIUM,
            "Coached Run Ready", Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        var typeLabel = _formatRunTypeLabel();
        dc.drawText(centerX, centerY - 10, Gfx.FONT_SMALL,
            typeLabel, Gfx.TEXT_JUSTIFY_CENTER);

        if (_prepWorkoutDesc.length() > 0) {
            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, centerY + 20, Gfx.FONT_TINY,
                _prepWorkoutDesc, Gfx.TEXT_JUSTIFY_CENTER);
        }

        if (_prepTargetPace.length() > 0) {
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, centerY + 45, Gfx.FONT_SMALL,
                "Target: " + _prepTargetPace + "/km", Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    // -- Helper methods --

    private function _formatRunTypeLabel() {
        if (_prepWorkoutType.length() > 0) {
            var first = _prepWorkoutType.substring(0, 1).toUpper();
            var rest  = _prepWorkoutType.substring(1, _prepWorkoutType.length());
            return first + rest + " Run";
        }
        if (_prepRunType.equals("route"))    { return "Route Run"; }
        if (_prepRunType.equals("training")) { return "Training"; }
        return "Coached Run";
    }

    private function _startWatchSession() {
        _session = Record.createSession({
            :name  => "AI Run Coach",
            :sport => Record.SPORT_RUNNING
        });
        _session.start();
    }

    private function _stopWatchSession() {
        if (_session != null) {
            if (_session.isRecording()) { _session.stop(); }
            _session.save();
            _session = null;
        }
    }

    private function _vibrateShort() {
        if (Toybox.Attention has :vibrate) {
            Toybox.Attention.vibrate([new Toybox.Attention.VibeProfile(50, 100)]);
        }
    }

    private function _vibrateLong() {
        if (Toybox.Attention has :vibrate) {
            Toybox.Attention.vibrate([
                new Toybox.Attention.VibeProfile(80, 200),
                new Toybox.Attention.VibeProfile(0,  100),
                new Toybox.Attention.VibeProfile(80, 200)
            ]);
        }
    }

    private function _parsePaceString(paceStr) {
        var colonIdx = paceStr.find(":");
        if (colonIdx == null || colonIdx < 0) { return 0.0; }
        var minPart = paceStr.substring(0, colonIdx);
        var secPart = paceStr.substring(colonIdx + 1, paceStr.length());
        var mins = minPart.toNumber();
        var secs = secPart.toNumber();
        if (mins == null) { mins = 0; }
        if (secs == null) { secs = 0; }
        return (mins * 60 + secs).toFloat();
    }

    private function _formatDistance(meters) {
        var km = meters / 1000.0;
        return km.format("%.2f") + "km";
    }

    private function _formatPace(secondsPerKm) {
        if (secondsPerKm <= 0 || secondsPerKm > 1200) { return "--:--"; }
        var total   = secondsPerKm.toNumber();
        var minutes = (total / 60).toNumber();
        var seconds = (total % 60).toNumber();
        return minutes.format("%d") + ":" + seconds.format("%02d");
    }

    private function _formatTime(seconds) {
        var hours = (seconds / 3600).toNumber();
        var mins  = ((seconds % 3600) / 60).toNumber();
        var secs  = (seconds % 60).toNumber();
        if (hours > 0) {
            return hours.format("%d") + ":" + mins.format("%02d") + ":" + secs.format("%02d");
        }
        return mins.format("%d") + ":" + secs.format("%02d");
    }

    private function _calcHrZone(hr) {
        var maxHR = 185;
        var pct = (hr.toFloat() / maxHR) * 100.0;
        if (pct < 60.0) { return 1; }
        if (pct < 70.0) { return 2; }
        if (pct < 80.0) { return 3; }
        if (pct < 90.0) { return 4; }
        return 5;
    }

    private function _getHrZoneColor(zone) {
        if (zone == 1) { return Gfx.COLOR_BLUE; }
        if (zone == 2) { return Gfx.COLOR_GREEN; }
        if (zone == 3) { return Gfx.COLOR_YELLOW; }
        if (zone == 4) { return Gfx.COLOR_ORANGE; }
        return Gfx.COLOR_RED;
    }

    private function _getPaceDeviationColor() {
        if (_coachTargetPaceSec <= 0 || _dispPace <= 0) { return Gfx.COLOR_WHITE; }
        var diff = _dispPace - _coachTargetPaceSec;
        var absDiff = diff;
        if (absDiff < 0) { absDiff = -absDiff; }
        var pct = (absDiff / _coachTargetPaceSec) * 100.0;
        if (pct <= 5.0) { return Gfx.COLOR_GREEN; }
        if (pct <= 12.0) { return Gfx.COLOR_YELLOW; }
        return Gfx.COLOR_RED;
    }

    private function _drawHrZoneBar(dc, cx, y, width, zone) {
        var barW = (width * 0.62).toNumber();
        var barH = 6;
        var x0   = (cx - (barW / 2)).toNumber();
        var cols = [Gfx.COLOR_BLUE, Gfx.COLOR_GREEN, Gfx.COLOR_YELLOW, Gfx.COLOR_ORANGE, Gfx.COLOR_RED];

        dc.setColor(0x1A1A1A, Gfx.COLOR_TRANSPARENT);
        dc.fillRectangle(x0, y, barW, barH);

        var segW = (barW / 5).toNumber();
        for (var i = 0; i < 5; i++) {
            var segX = (x0 + (segW * i)).toNumber();
            if ((i + 1) != zone) {
                dc.setColor(0x2A2A2A, Gfx.COLOR_TRANSPARENT);
            } else {
                dc.setColor(cols[i], Gfx.COLOR_TRANSPARENT);
                dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
                dc.fillRectangle(segX, y - 2, segW - 1, 1);
                dc.setColor(cols[i], Gfx.COLOR_TRANSPARENT);
            }
            dc.fillRectangle(segX, y, segW - 1, barH);
        }
    }

    private function _pickFont(dc, text, fonts, maxWidth) {
        for (var i = 0; i < fonts.size(); i++) {
            if (dc.getTextWidthInPixels(text, fonts[i]) <= maxWidth) {
                return fonts[i];
            }
        }
        return fonts[fonts.size() - 1];
    }
}

// RunDelegate -- button handling
class RunDelegate extends Ui.BehaviorDelegate {

    private var _view;

    function initialize() {
        BehaviorDelegate.initialize();
    }

    function setView(view) {
        _view = view;
    }

    function onBack() {
        if (_view != null) {
            if (_view.isPaused()) {
                _view.resumeRun();
            } else if (_view.isRunning()) {
                Ui.pushView(
                    new Ui.Confirmation("Pause run?"),
                    new PauseConfirmDelegate(_view),
                    Ui.SLIDE_IMMEDIATE
                );
            }
        }
        return true;
    }

    function onMenu() {
        if (_view != null && _view.isRunning()) {
            Ui.pushView(
                new Rez.Menus.RunMenu(),
                new RunMenuDelegate(_view),
                Ui.SLIDE_IMMEDIATE
            );
        }
        return true;
    }
}

class PauseConfirmDelegate extends Ui.ConfirmationDelegate {
    private var _view;
    function initialize(view) {
        ConfirmationDelegate.initialize();
        _view = view;
    }
    function onResponse(response) {
        if (response == Ui.CONFIRM_YES && _view != null) {
            _view.pauseRun();
        }
        return true;
    }
}

class RunMenuDelegate extends Ui.MenuInputDelegate {
    private var _view;
    function initialize(view) {
        MenuInputDelegate.initialize();
        _view = view;
    }
    function onMenuItem(item) {
        if (item == :finish) {
            Ui.pushView(
                new Ui.Confirmation("Finish run?"),
                new FinishConfirmDelegate(_view),
                Ui.SLIDE_IMMEDIATE
            );
        }
    }
}

class FinishConfirmDelegate extends Ui.ConfirmationDelegate {
    private var _view;
    function initialize(view) {
        ConfirmationDelegate.initialize();
        _view = view;
    }
    function onResponse(response) {
        if (response == Ui.CONFIRM_YES && _view != null) {
            _view.finishRun();
        }
        return true;
    }
}
