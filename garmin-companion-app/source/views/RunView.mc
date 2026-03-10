// RunView.mc
// Main activity view while the user is running.
//
// Supports two modes:
//
//  ┌─────────────────────────────────────────────────────────────────┐
//  │ SCENARIO 2 — Phone + Watch (phoneControlled = true)            │
//  │  • All run data (pace, HR, distance, time) comes from the phone │
//  │    via PhoneLink "runUpdate" messages.                          │
//  │  • START / PAUSE / RESUME / STOP commands are sent TO the phone.│
//  │  • Watch does NOT start its own ActivityRecording session —     │
//  │    Garmin records independently via sensor fusion; phone owns   │
//  │    the session.                                                 │
//  └─────────────────────────────────────────────────────────────────┘
//  ┌─────────────────────────────────────────────────────────────────┐
//  │ SCENARIO 3 — Standalone (phoneControlled = false)              │
//  │  • Watch records its own ActivityRecording session.             │
//  │  • GPS + HR pulled from watch sensors directly.                 │
//  │  • DataStreamer sends metrics to server every second.           │
//  └─────────────────────────────────────────────────────────────────┘

using Toybox.Attention;
using Toybox.Math;
using Toybox.WatchUi as Ui;
using Toybox.Graphics as Gfx;
using Toybox.Position as Pos;
using Toybox.Sensor as Sensor;
using Toybox.System as Sys;
using Toybox.Timer as Timer;
using Toybox.ActivityRecording as Record;

class RunView extends Ui.View {

    // ── Run metrics ───────────────────────────────────────────────────────────
    private var _heartRate    = 0;
    private var _heartRateZone = 1;
    private var _distance     = 0.0;   // metres
    private var _pace         = 0.0;   // sec/km
    private var _elapsedTime  = 0;     // seconds
    private var _cadence      = 0;

    // ── State ─────────────────────────────────────────────────────────────────
    private var _isRunning        = false;
    private var _isPaused         = false;
    private var _phoneControlled  = false;  // Scenario 2 vs 3

    // ── Infrastructure ────────────────────────────────────────────────────────
    private var _timer        = null;
    private var _dataStreamer = null;
    private var _phoneLink    = null;
    private var _session      = null;   // ActivityRecording session (Scenario 3 only)

    // ── UI animation ──────────────────────────────────────────────────────────
    private var _elapsedMs        = 0;
    private var _tickMs           = 250;
    private var _streamAccumMs    = 0;

    private var _dispPace         = 0.0;
    private var _dispDistance     = 0.0;
    private var _dispHeartRate    = 0;
    private var _dispCadence      = 0;

    private var _ringPhase        = 0.0;
    private var _ringPulseBoost   = 0.0;

    // ─────────────────────────────────────────────────────────────────────────
    function initialize() {
        View.initialize();
        _phoneLink    = new PhoneLink();
        _dataStreamer = new DataStreamer();
    }

    // Called by StartView / StartDelegate before the view is shown
    function setPhoneControlled(val) {
        _phoneControlled = val;
    }

    // State accessors used by delegates
    function isPaused()   { return _isPaused; }
    function isRunning()  { return _isRunning; }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    function onShow() {
        // Register for phone messages (both scenarios — harmless in Scenario 3)
        _phoneLink.register(method(:onPhoneMessage));

        if (!_phoneControlled) {
            // ── Scenario 3: start watch-owned recording immediately ────────
            _startWatchSession();
            _isRunning = true;
            _isPaused  = false;

            // GPS
            Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
            // HR + cadence
            Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
            Sensor.enableSensorEvents(method(:onSensor));
        } else {
            // ── Scenario 2: send "ready" to phone so it knows watch is live ─
            _phoneLink.sendCommand("watchReady");
            // We don't start our own session — phone drives everything
        }

        // UI refresh timer
        _timer = new Timer.Timer();
        _timer.start(method(:onTimer), _tickMs, true);

        Sys.println("RunView shown — phoneControlled=" + _phoneControlled);
    }

    function onHide() {
        if (_timer != null) {
            _timer.stop();
            _timer = null;
        }
        if (!_phoneControlled) {
            Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
            Sensor.enableSensorEvents(null);
        }
    }

    // ── Phone message handler (Scenario 2) ───────────────────────────────────
    function onPhoneMessage(data) {
        if (data == null) { return; }

        var msgType = data.get("type");
        if (msgType == null) { return; }

        if (msgType.equals("runUpdate")) {
            // Receive live metrics from the phone
            var paceVal = data.get("pace");
            var distVal = data.get("distance");
            var hrVal   = data.get("hr");
            var timeVal = data.get("elapsedTime");
            var cadVal  = data.get("cadence");

            if (paceVal   != null) { _pace        = paceVal.toFloat(); }
            if (distVal   != null) { _distance    = distVal.toFloat(); }
            if (hrVal     != null) { _heartRate   = hrVal.toNumber(); _heartRateZone = calculateHeartRateZone(_heartRate); }
            if (timeVal   != null) { _elapsedTime = timeVal.toNumber(); _elapsedMs = _elapsedTime * 1000; }
            if (cadVal    != null) { _cadence     = cadVal.toNumber(); }

            var runningVal = data.get("isRunning");
            var pausedVal  = data.get("isPaused");
            if (runningVal != null) { _isRunning = runningVal; }
            if (pausedVal  != null) { _isPaused  = pausedVal; }

            Ui.requestUpdate();

        } else if (msgType.equals("sessionEnded")) {
            // Phone has ended the run — pop back to start
            Ui.popView(Ui.SLIDE_RIGHT);
        }
    }

    // ── Timer tick (250 ms) ───────────────────────────────────────────────────
    function onTimer() as Void {
        // Only increment watch-side elapsed time in standalone mode
        if (!_phoneControlled && _isRunning && !_isPaused) {
            _elapsedMs  += _tickMs;
            _elapsedTime = _elapsedMs / 1000;
        }

        // ── Smooth display values ──────────────────────────────────────────
        var ease = 0.18;

        if (_pace > 0 && _pace < 1200) {
            _dispPace = _dispPace + ((_pace - _dispPace) * ease);
        } else {
            _dispPace = _dispPace + ((0.0 - _dispPace) * 0.10);
        }

        _dispDistance  = _dispDistance  + ((_distance  - _dispDistance)  * ease);
        _dispHeartRate = (_dispHeartRate + ((_heartRate - _dispHeartRate) * 0.25)).toNumber();
        _dispCadence   = (_dispCadence   + ((_cadence   - _dispCadence)   * 0.25)).toNumber();

        // ── Breathing ring animation ───────────────────────────────────────
        _ringPhase += 0.18;
        if (_ringPhase > 6.283) { _ringPhase -= 6.283; }

        _ringPulseBoost *= 0.85;
        if (_ringPulseBoost < 0.01) { _ringPulseBoost = 0.0; }

        // ── Standalone: stream to backend every 1 s ────────────────────────
        if (!_phoneControlled) {
            _streamAccumMs += _tickMs;
            if (_streamAccumMs >= 1000) {
                _streamAccumMs = 0;
                if (_dataStreamer != null && _isRunning && !_isPaused) {
                    _dataStreamer.sendData({
                        "heartRate"    => _heartRate,
                        "heartRateZone"=> _heartRateZone,
                        "distance"     => _distance,
                        "pace"         => _pace,
                        "cadence"      => _cadence,
                        "elapsedTime"  => _elapsedTime
                    });
                }
            }
        }

        Ui.requestUpdate();
    }

    // ── GPS (Scenario 3 only) ─────────────────────────────────────────────────
    function onPosition(info as Pos.Info) as Void {
        if (info.position != null) {
            var lat = info.position.toDegrees()[0];
            var lon = info.position.toDegrees()[1];

            if (info.altitude != null) {
                if (_dataStreamer != null) {
                    _dataStreamer.updateGPS(lat, lon, info.altitude);
                }
            }

            if (info.speed != null && info.speed > 0.1) {
                _pace = 1000.0 / (info.speed * 60.0);
            }
        }
    }

    // ── Sensors (Scenario 3 only) ─────────────────────────────────────────────
    function onSensor(info as Sensor.Info) as Void {
        if (info.heartRate != null) {
            _heartRate     = info.heartRate;
            _heartRateZone = calculateHeartRateZone(_heartRate);
        }
        if (info.cadence != null) { _cadence = info.cadence; }
    }

    // ── Pause / Resume ────────────────────────────────────────────────────────

    function pauseRun() {
        if (_isPaused || !_isRunning) { return; }
        _isPaused = true;

        if (_phoneControlled) {
            _phoneLink.sendCommand("pause");
        } else {
            // Scenario 3: pause ActivityRecording
            if (_session != null && _session.isRecording()) {
                _session.stop();
            }
        }

        _vibrateShort();
        Sys.println("Run paused");
        Ui.requestUpdate();
    }

    function resumeRun() {
        if (!_isPaused) { return; }
        _isPaused = false;

        if (_phoneControlled) {
            _phoneLink.sendCommand("resume");
        } else {
            // Scenario 3: resume ActivityRecording
            if (_session != null && !_session.isRecording()) {
                _session.start();
            }
        }

        _vibrateShort();
        Sys.println("Run resumed");
        Ui.requestUpdate();
    }

    // ── Finish run ────────────────────────────────────────────────────────────

    function finishRun() {
        _isRunning = false;
        _isPaused  = false;

        if (_phoneControlled) {
            _phoneLink.sendCommand("stop");
        } else {
            // Scenario 3: stop + save ActivityRecording
            _stopWatchSession();
        }

        _vibrateLong();
        Sys.println("Run finished — distance=" + _distance + "m  time=" + _elapsedTime + "s");
        Ui.popView(Ui.SLIDE_RIGHT);
    }

    // ── Drawing ──────────────────────────────��────────────────────────────────

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

        // ── Breathing ring ─────────────────────────────────────────────────
        var s          = ((Math.sin(_ringPhase) + 1.0) * 0.5).toFloat();
        var baseRadius = (width / 2) - (isSmall ? 6 : 4);
        var breathe    = s * (isSmall ? 3.0 : 4.0);
        var pulse      = _ringPulseBoost * (isSmall ? 4.0 : 6.0);
        var ringRadius = (baseRadius - 2 + breathe + pulse).toNumber();

        dc.setColor(0x003A4F, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, baseRadius);

        // Accent ring colour: cyan normally, orange when paused
        if (_isPaused) {
            dc.setColor(Gfx.COLOR_ORANGE, Gfx.COLOR_TRANSPARENT);
            dc.drawCircle(centerX, centerY, ringRadius);
        } else {
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            dc.drawCircle(centerX, centerY, ringRadius);
        }

        // ── Paused banner ──────────────────────────────────────────────────
        if (_isPaused) {
            dc.setColor(Gfx.COLOR_ORANGE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(centerX, height * 0.20, Gfx.FONT_TINY, "PAUSED", Gfx.TEXT_JUSTIFY_CENTER);
        }

        // ── HR Zone bar ───────────────────────────────────────��────────────
        drawHrZoneBar(dc, centerX, (isSmall ? height * 0.16 : height * 0.18).toNumber(), width, _heartRateZone);

        // ── Primary: PACE ──────────────────────────────────────────────────
        var paceText = formatPace(_dispPace);
        var paceFonts = [Gfx.FONT_LARGE, Gfx.FONT_MEDIUM];
        var paceFont  = pickLargestFontThatFits(dc, paceText, paceFonts, width - 24);

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, paceY, paceFont, paceText, Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, unitY, Gfx.FONT_TINY, "min/km", Gfx.TEXT_JUSTIFY_CENTER);

        // ── Secondary: Distance & Time ─────────────────────────────────────
        var distText = formatDistance(_dispDistance);
        var timeText = formatTime(_elapsedTime);
        var secFont  = isSmall ? Gfx.FONT_TINY : Gfx.FONT_SMALL;

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText((width * 0.25).toNumber(), secondaryY, secFont, distText, Gfx.TEXT_JUSTIFY_CENTER);
        dc.drawText((width * 0.75).toNumber(), secondaryY, secFont, timeText, Gfx.TEXT_JUSTIFY_CENTER);

        // ── Tertiary: HR + Cadence ─────────────────────────────────────────
        var hrColor = getHeartRateZoneColor(_heartRateZone);
        dc.setColor(hrColor, Gfx.COLOR_TRANSPARENT);
        dc.drawText((width * 0.25).toNumber(), tertiaryY, Gfx.FONT_TINY,
            _dispHeartRate.format("%d") + " bpm", Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText((width * 0.75).toNumber(), tertiaryY, Gfx.FONT_TINY,
            _dispCadence.format("%d") + " spm", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

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
            Sys.println("ActivityRecording saved");
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

    private function formatDistance(meters) {
        var km = meters / 1000.0;
        return km.format("%.2f") + "km";
    }

    private function formatPace(secondsPerKm) {
        if (secondsPerKm <= 0 || secondsPerKm > 1200) { return "--:--"; }
        var total   = secondsPerKm.toNumber();
        var minutes = (total / 60).toNumber();
        var seconds = (total % 60).toNumber();
        return minutes.format("%d") + ":" + seconds.format("%02d");
    }

    private function formatTime(seconds) {
        var hours = (seconds / 3600).toNumber();
        var mins  = ((seconds % 3600) / 60).toNumber();
        var secs  = (seconds % 60).toNumber();
        if (hours > 0) {
            return hours.format("%d") + ":" + mins.format("%02d") + ":" + secs.format("%02d");
        }
        return mins.format("%d") + ":" + secs.format("%02d");
    }

    private function calculateHeartRateZone(hr) {
        var maxHR   = App.Storage.getValue("maxHR");
        if (maxHR == null) { maxHR = 185; }
        var percent = (hr.toFloat() / maxHR) * 100;
        if (percent < 60) { return 1; }
        if (percent < 70) { return 2; }
        if (percent < 80) { return 3; }
        if (percent < 90) { return 4; }
        return 5;
    }

    private function getHeartRateZoneColor(zone) {
        if (zone == 1) { return Gfx.COLOR_BLUE;   }
        if (zone == 2) { return Gfx.COLOR_GREEN;  }
        if (zone == 3) { return Gfx.COLOR_YELLOW; }
        if (zone == 4) { return Gfx.COLOR_ORANGE; }
        return Gfx.COLOR_RED;
    }

    private function drawHrZoneBar(dc, cx, y, width, zone) {
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

    private function pickLargestFontThatFits(dc, text, fonts, maxWidth) {
        for (var i = 0; i < fonts.size(); i++) {
            if (dc.getTextWidthInPixels(text, fonts[i]) <= maxWidth) {
                return fonts[i];
            }
        }
        return fonts[fonts.size() - 1];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RunDelegate — button handling during an active run
// ─────────────────────────────────────────────────────────────────────────────
class RunDelegate extends Ui.BehaviorDelegate {

    private var _view;

    function initialize() {
        BehaviorDelegate.initialize();
    }

    function setView(view) {
        _view = view;
    }

    // BACK / DOWN button → pause or resume
    function onBack() {
        if (_view != null) {
            if (_view.isPaused()) {
                _view.resumeRun();
            } else {
                Ui.pushView(
                    new Ui.Confirmation("Pause run?"),
                    new PauseConfirmDelegate(_view),
                    Ui.SLIDE_IMMEDIATE
                );
            }
        }
        return true;
    }

    // LAP button → show finish menu
    function onMenu() {
        Ui.pushView(
            new Rez.Menus.RunMenu(),
            new RunMenuDelegate(_view),
            Ui.SLIDE_IMMEDIATE
        );
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pause confirmation dialog
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Run menu delegate (LAP button menu)
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Finish confirmation dialog
// ─────────────────────────────────────────────────────────────────────────────
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
