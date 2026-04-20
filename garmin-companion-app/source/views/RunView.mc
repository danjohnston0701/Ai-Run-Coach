// RunView.mc — Arc Dashboard
// Premium redesign: coloured zone arc, large pace, clean data hierarchy.
//
// Zone arc spans 240° over the watch top (12 o'clock).
// Segment map (CCW from lower-right through top to lower-left):
//   Z5 red    336°→ 20°   (lower-right)
//   Z4 orange  22°→ 66°
//   Z3 amber   68°→112°   (centred on 90° = 12 o'clock)
//   Z2 green  114°→158°
//   Z1 blue   160°→204°   (lower-left)
//
// Button mapping:
//   START / SELECT  → start run | pause | resume
//   BACK            → exit app (idle) | pause (running) | finish confirm (paused)

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

    // Overlay / prompt state
    enum { OVERLAY_NONE, OVERLAY_WAITING, OVERLAY_GPS_WAIT, OVERLAY_READY, OVERLAY_COACHED }

    // Auth & app state
    private var _isAuthenticated = false;
    private var _isConnected     = false;
    private var _runnerName      = "";
    private var _overlayState    = OVERLAY_READY;
    private var _dotCount        = 0;

    // Prepared-run data
    private var _prepRunType      = "";
    private var _prepRunDist      = 0.0;
    private var _prepWorkoutType  = "";
    private var _prepTargetPace   = "";
    private var _prepWorkoutDesc  = "";

    // Live metrics
    private var _heartRate     = 0;
    private var _heartRateZone = 1;
    private var _distance      = 0.0;
    private var _pace          = 0.0;
    private var _elapsedTime   = 0;
    private var _cadence       = 0;

    // Run state
    private var _isRunning       = false;
    private var _isPaused        = false;
    private var _phoneControlled = false;

    // Coaching
    private var _isCoached          = false;
    private var _coachTargetPace    = "";
    private var _coachTargetPaceSec = 0.0;
    private var _coachingCue        = "";
    private var _coachingCueTicks   = 0;

    // Infrastructure
    private var _timer        = null;
    private var _dataStreamer = null;
    private var _phoneLink    = null;
    private var _session      = null;

    // Watch GPS cache — populated by onPosition(), streamed to phone every 2 s
    // in phone-controlled mode so the phone can use the superior Garmin GPS.
    private var _lastGpsLat    = null;
    private var _lastGpsLng    = null;
    private var _lastGpsAlt    = null;
    private var _lastGpsSpeed  = 0.0;
    private var _gpsStreamTick = 0;   // increments every 250 ms tick; flush at 8 (= 2 s)

    // GPS acquisition state
    private var _gpsReady     = false;   // true once quality >= QUALITY_USABLE (3)
    private var _gpsQuality   = 0;       // last Pos.Quality value (0-4)
    private var _gpsListening = false;   // true while location events are active

    // Animation
    private var _elapsedMs     = 0;
    private var _tickMs        = 250;
    private var _streamAccumMs = 0;
    private var _dispPace      = 0.0;
    private var _dispDistance  = 0.0;
    private var _dispHR        = 0;
    private var _dispCadence   = 0;
    private var _ringPhase     = 0.0;
    private var _pulseBoost    = 0.0;

    // ── Zone colour palette ────────────────────────────────────────────────────
    // Index 0 = Z1 (lowest), index 4 = Z5 (highest)
    private var _zoneColors    = [0x2979FF, 0x00E676, 0xFFD740, 0xFF6D00, 0xF44336];
    // Dim tints for inactive segments while running
    private var _zoneDimColors = [0x0A1628, 0x00200E, 0x201800, 0x1A0800, 0x1A0404];

    // ── Segment start/end angles (CCW = Gfx.ARC_COUNTER_CLOCKWISE) ────────────
    // Z5 straddles 0°; drawn in two parts.  All others are contiguous.
    // segA[z][0] = startAngle, segA[z][1] = endAngle (CCW direction)
    // z index:  0=Z5(red)  1=Z4(orange)  2=Z3(amber)  3=Z2(green)  4=Z1(blue)
    private var _segStart = [336, 22, 68, 114, 160];
    private var _segEnd   = [ 20, 66,112, 158, 204];

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    function initialize() {
        View.initialize();
        _phoneLink    = new PhoneLink();
        _dataStreamer = new DataStreamer();
        var tok = App.Storage.getValue("authToken");
        _isAuthenticated = (tok != null && tok.length() > 0);
        var nm  = App.Storage.getValue("runnerName");
        _runnerName = (nm != null) ? nm : "";
        // If already authenticated, show GPS wait; else wait for phone auth
        _overlayState = _isAuthenticated ? OVERLAY_GPS_WAIT : OVERLAY_WAITING;
    }

    function setPhoneControlled(v) { _phoneControlled = v; }

    // Called by AiRunCoachApp.onCoachingCue when a cue arrives from the backend response
    function setCoachingCue(cueText) {
        _coachingCue      = cueText;
        _coachingCueTicks = 20;   // ~5 seconds at 250 ms ticks
    }

    function setCoachingMode(data) {
        _isCoached    = true;
        _overlayState = OVERLAY_COACHED;
        var rt = data.get("runType");
        var tp = data.get("targetPace");
        var wt = data.get("workoutType");
        var wd = data.get("workoutDesc");
        var dd = data.get("distance");
        if (rt != null) { _prepRunType     = rt; }
        if (tp != null) { _coachTargetPace = tp; _coachTargetPaceSec = _parsePace(tp); }
        if (wt != null) { _prepWorkoutType = wt; }
        if (wd != null) { _prepWorkoutDesc = wd; }
        if (dd != null) { _prepRunDist     = dd.toFloat(); }
    }

    function isPaused()  { return _isPaused; }
    function isRunning() { return _isRunning; }

    function startRun() {
        if (_isRunning) { return; }
        // Block start until we have at least a usable GPS fix
        if (!_gpsReady) {
            _vibeShort();   // haptic cue: "not ready yet"
            return;
        }
        _isRunning     = true;
        _isPaused      = false;
        _elapsedMs     = 0;
        _elapsedTime   = 0;
        _overlayState  = OVERLAY_NONE;
        _gpsStreamTick = 0;

        // Always enable watch GPS and HR sensor regardless of mode.
        // In phone-controlled mode coordinates are streamed back every 2 s so
        // the phone can use the superior Garmin multi-band GPS for tracking.
        Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
        _gpsListening = true;
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
        Sensor.enableSensorEvents(method(:onSensor));

        if (!_phoneControlled) {
            _startSession();
        } else {
            _phoneLink.sendCommand("start");
        }
        _pulseBoost = 1.0;
        _vibeShort();
        Ui.requestUpdate();
    }

    function pauseRun() {
        if (_isPaused || !_isRunning) { return; }
        _isPaused = true;
        if (_phoneControlled) { _phoneLink.sendCommand("pause"); }
        else if (_session != null && _session.isRecording()) { _session.stop(); }
        _vibeShort();
        Ui.requestUpdate();
    }

    function resumeRun() {
        if (!_isPaused) { return; }
        _isPaused = false;
        if (_phoneControlled) { _phoneLink.sendCommand("resume"); }
        else if (_session != null && !_session.isRecording()) { _session.start(); }
        _vibeShort();
        Ui.requestUpdate();
    }

    function finishRun() {
        _isRunning    = false;
        _isPaused     = false;
        _overlayState = OVERLAY_READY;
        // Disable GPS and sensors for all modes
        Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
        _gpsListening = false;
        // _gpsReady remains true — the satellite fix was valid during the run
        // so the user can start another run immediately without re-acquiring.
        Sensor.enableSensorEvents(null);
        if (_phoneControlled) { _phoneLink.sendCommand("stop"); }
        else { _stopSession(); }
        _vibeLong();
        Ui.requestUpdate();
    }

    function onShow() {
        _phoneLink.register(method(:onPhoneMessage));
        Comm.registerForPhoneAppMessages(method(:onPhoneAppMessage));
        if (!_phoneControlled && _isRunning) {
            _startSession();
            Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
            Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
            Sensor.enableSensorEvents(method(:onSensor));
            _gpsListening = true;
        } else if (_isAuthenticated && !_gpsListening) {
            // Start GPS pre-acquisition so the user can see signal strength
            // and the START button is gated until a usable fix is obtained.
            Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
            _gpsListening = true;
        }
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), _tickMs, true);
    }

    function onHide() {
        if (_timer != null) { _timer.stop(); _timer = null; }
        // Disable GPS if we started it (running OR pre-run acquisition)
        if (_gpsListening) {
            Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
            _gpsListening = false;
        }
        if (_isRunning) {
            Sensor.enableSensorEvents(null);
        }
    }

    // ── Phone messages ────────────────────────────────────────────────────────

    function onPhoneAppMessage(msg as Comm.PhoneAppMessage) as Void {
        if (msg == null || msg.data == null) { return; }
        var d = msg.data;
        var t = d["type"];
        if (t == null) { return; }

        if (t.equals("auth")) {
            var tok = d["authToken"];
            var nm  = d["runnerName"];
            if (tok != null && tok.length() > 0) {
                App.Storage.setValue("authToken", tok);
                _isAuthenticated = true;
                _isConnected     = true;
                if (!_isRunning) {
                    // Begin GPS acquisition and show the GPS wait screen
                    if (!_gpsListening) {
                        Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
                        _gpsListening = true;
                    }
                    _overlayState = _gpsReady ? OVERLAY_READY : OVERLAY_GPS_WAIT;
                }
            }
            if (nm != null) { App.Storage.setValue("runnerName", nm); _runnerName = nm; }
            Ui.requestUpdate();

        } else if (t.equals("preparedRun")) {
            var dist = d["distance"];
            var rt   = d["runType"];
            var wt   = d["workoutType"];
            var tp   = d["targetPace"];
            var wd   = d["workoutDesc"];
            if (dist != null) { _prepRunDist     = dist.toFloat(); }
            if (rt   != null) { _prepRunType     = rt; }
            if (wt   != null) { _prepWorkoutType = wt; }
            if (tp   != null) { _prepTargetPace  = tp; _coachTargetPace = tp; _coachTargetPaceSec = _parsePace(tp); _isCoached = true; }
            if (wd   != null) { _prepWorkoutDesc = wd; }
            if (!_isRunning)  { _overlayState = OVERLAY_COACHED; }
            Ui.requestUpdate();

        } else if (t.equals("disconnect")) {
            _isConnected = false;
            Ui.requestUpdate();
        }
    }

    function onPhoneMessage(data) {
        if (data == null) { return; }
        var t = data.get("type");
        if (t == null) { return; }

        if (t.equals("runUpdate")) {
            var pv = data.get("pace");       if (pv != null) { _pace        = pv.toFloat(); }
            var dv = data.get("distance");   if (dv != null) { _distance    = dv.toFloat(); }
            var hv = data.get("hr");         if (hv != null) { _heartRate   = hv.toNumber(); _heartRateZone = _hrZone(_heartRate); }
            var tv = data.get("elapsedTime"); if (tv != null) { _elapsedTime = tv.toNumber(); _elapsedMs = _elapsedTime * 1000; }
            var cv = data.get("cadence");    if (cv != null) { _cadence     = cv.toNumber(); }
            var rv = data.get("isRunning");  if (rv != null) { _isRunning   = rv; }
            var uv = data.get("isPaused");   if (uv != null) { _isPaused    = uv; }
            if (_isRunning) { _overlayState = OVERLAY_NONE; }
            Ui.requestUpdate();

        } else if (t.equals("coachingCue")) {
            var cue = data.get("cue");
            if (cue != null) { _coachingCue = cue; _coachingCueTicks = 20; _vibeShort(); Ui.requestUpdate(); }

        } else if (t.equals("sessionEnded")) {
            _isRunning = false; _isPaused = false; _overlayState = OVERLAY_READY;
            Ui.requestUpdate();
        }
    }

    // ── Timer tick (250 ms) ───────────────────────────────────────────────────

    function onTick() as Void {
        _dotCount = (_dotCount + 1) % 4;

        if (!_phoneControlled && _isRunning && !_isPaused) {
            _elapsedMs  += _tickMs;
            _elapsedTime = _elapsedMs / 1000;
        }

        var e = 0.15;
        _dispPace     = _pace > 0 && _pace < 1200
            ? _dispPace + (_pace - _dispPace) * e
            : _dispPace + (0.0 - _dispPace) * 0.08;
        _dispDistance = _dispDistance + (_distance  - _dispDistance) * e;
        _dispHR       = (_dispHR + (_heartRate - _dispHR) * 0.30).toNumber();
        _dispCadence  = (_dispCadence + (_cadence  - _dispCadence) * 0.30).toNumber();

        _ringPhase += 0.10;   // ~0.6 rad/s = ~10-second breath cycle
        if (_ringPhase > 6.283) { _ringPhase -= 6.283; }
        _pulseBoost  *= 0.82;
        if (_pulseBoost < 0.01) { _pulseBoost = 0.0; }

        if (_coachingCueTicks > 0) {
            _coachingCueTicks -= 1;
            if (_coachingCueTicks <= 0) { _coachingCue = ""; }
        }

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

        // Phone-controlled mode: stream watch GPS to phone every 2 s (8 × 250 ms ticks).
        // The phone will prefer these higher-accuracy Garmin coordinates over its own GPS.
        if (_phoneControlled && _isRunning && !_isPaused) {
            _gpsStreamTick += 1;
            if (_gpsStreamTick >= 8 && _lastGpsLat != null && _lastGpsLng != null) {
                _gpsStreamTick = 0;
                _phoneLink.sendRunData({
                    "lat"   => _lastGpsLat,
                    "lng"   => _lastGpsLng,
                    "alt"   => _lastGpsAlt,
                    "speed" => _lastGpsSpeed,
                    "hr"    => _heartRate,
                    "cad"   => _cadence
                });
            }
        }

        Ui.requestUpdate();
    }

    // ── Sensors / GPS ─────────────────────────────────────────────────────────

    function onPosition(info as Pos.Info) as Void {
        // Track GPS quality for the pre-run acquisition gate
        // Pos.Quality values: 0=NOT_AVAILABLE, 1=LAST_KNOWN, 2=POOR, 3=USABLE, 4=GOOD
        if (info.accuracy != null) {
            _gpsQuality = info.accuracy;
            var wasReady = _gpsReady;
            _gpsReady = (_gpsQuality >= 3);   // QUALITY_USABLE or better
            // Transition overlay from GPS_WAIT → READY / COACHED once lock acquired
            if (_gpsReady && !wasReady && !_isRunning) {
                if (_overlayState == OVERLAY_GPS_WAIT) {
                    _overlayState = (_isCoached || _prepRunType.length() > 0)
                        ? OVERLAY_COACHED
                        : OVERLAY_READY;
                }
                _vibeShort();   // haptic confirmation of GPS lock
            }
        }

        if (info.position != null) {
            var deg = info.position.toDegrees();
            // Always cache the latest fix — used for phone streaming in phone-controlled mode
            _lastGpsLat = deg[0];
            _lastGpsLng = deg[1];
            _lastGpsAlt = info.altitude;
            if (info.speed != null && info.speed > 0.1) {
                _lastGpsSpeed = info.speed;
                if (_isRunning) {
                    _pace = 1000.0 / (info.speed * 60.0);
                }
            }
            // Standalone mode: also push to DataStreamer for backend HTTP stream
            if (!_phoneControlled && info.altitude != null && _dataStreamer != null) {
                _dataStreamer.updateGPS(deg[0], deg[1], info.altitude);
            }
        }
    }

    function onSensor(info as Sensor.Info) as Void {
        if (info.heartRate != null) { _heartRate = info.heartRate; _heartRateZone = _hrZone(_heartRate); }
        if (info.cadence   != null) { _cadence   = info.cadence; }
    }

    // ==========================================================================
    // DRAWING — Arc Dashboard
    // ==========================================================================

    function onUpdate(dc) {
        var w  = dc.getWidth();
        var h  = dc.getHeight();
        var cx = w / 2;
        var cy = h / 2;

        // ── Background ────────────────────────────────────────────────────────
        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
        dc.clear();

        // ── GPS acquisition screen (blocks dashboard until fix obtained) ───────
        if (_overlayState == OVERLAY_GPS_WAIT) {
            _drawGpsWaitScreen(dc, cx, cy, w, h);
            return;
        }

        // ── Waiting-for-phone screen ───────────────────────────────────────────
        if (_overlayState == OVERLAY_WAITING) {
            _drawWaitingForPhoneScreen(dc, cx, cy, w, h);
            return;
        }

        // ── Zone arc ──────────────────────────────────────────────────────────
        _drawZoneArc(dc, cx, cy, w, h);

        // ── Top: time / elapsed ───────────────────────────────────────────────
        _drawTimeRow(dc, cx, h);

        // ── Zone + HR badge (running only) ────────────────────────────────────
        // Zone badge removed — HR already shown in secondary row

        // ── Primary metric: PACE ──────────────────────────────────────────────
        _drawPace(dc, cx, w, h);

        // ── Secondary row: Distance | HR ─────────────────────────────────────
        _drawSecondary(dc, cx, w, h);

        // ── Cadence ───────────────────────────────────────────────────────────
        _drawCadence(dc, cx, h);

        // ── Status / prompt ───────────────────────────────────────────────────
        _drawStatus(dc, cx, h);

        // ── Coaching cue (top overlay, always on top) ─────────────────────────
        if (_coachingCue.length() > 0) {
            _drawCoachingCue(dc, cx, w);
        }

        // ── Paused banner ─────────────────────────────────────────────────────
        if (_isPaused) {
            dc.setColor(Gfx.COLOR_ORANGE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.03).toNumber(), Gfx.FONT_TINY,
                "— PAUSED —", Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    // ── GPS Acquisition Screen ────────────────────────────────────────────────
    //
    // Shown from app launch until Pos.Quality >= QUALITY_USABLE (3).
    // Draws a full-screen UI so the user clearly understands they must wait.
    //   Top area   : app title + thin accent ring
    //   Centre     : large "GPS" label with signal-bar indicator
    //   Lower half : animated "Acquiring..." text + quality description
    //   Bottom     : "Cannot start until GPS ready"
    //
    private function _drawGpsWaitScreen(dc, cx, cy, w, h) {
        // Outer accent ring
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, (w / 2) - 4);

        // App title
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.10).toNumber(), Gfx.FONT_TINY,
            "AI RUN COACH", Gfx.TEXT_JUSTIFY_CENTER);

        // Thin divider
        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawLine((w * 0.2).toNumber(), (h * 0.22).toNumber(),
                    (w * 0.8).toNumber(), (h * 0.22).toNumber());

        // Large GPS label
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.27).toNumber(), Gfx.FONT_MEDIUM,
            "GPS", Gfx.TEXT_JUSTIFY_CENTER);

        // Signal-bar indicator (4 bars, coloured by quality 0-4)
        // Bars grow left-to-right; lit bars use a colour ramp (grey→green)
        var barColors = [0x333333, 0xF44336, 0xFFD740, 0x00E676, 0x00E676];
        var barW = 10;
        var barGap = 5;
        var totalW = 4 * barW + 3 * barGap;
        var bx0 = cx - totalW / 2;
        var baseY = (h * 0.52).toNumber();
        for (var b = 0; b < 4; b++) {
            var barH = 6 + b * 6;           // bars get taller left→right
            var bx   = bx0 + b * (barW + barGap);
            var by   = baseY - barH;
            // Lit if quality > b  (quality 0 = no bars, quality 4 = all bars)
            var lit  = (_gpsQuality > b);
            var col  = lit ? barColors[b + 1] : 0x222222;
            dc.setColor(col, Gfx.COLOR_TRANSPARENT);
            dc.fillRectangle(bx, by, barW, barH);
            // Outline on lit bars
            if (lit) {
                dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
                dc.drawRectangle(bx, by, barW, barH);
            }
        }

        // Quality label
        var qualLabels = ["No signal", "Last known", "Poor", "Usable", "Good"];
        var qLabel = (_gpsQuality >= 0 && _gpsQuality <= 4)
            ? qualLabels[_gpsQuality]
            : "Searching";
        var qColor = (_gpsQuality >= 3) ? 0x00E676 : Gfx.COLOR_LT_GRAY;
        dc.setColor(qColor, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.57).toNumber(), Gfx.FONT_XTINY,
            qLabel, Gfx.TEXT_JUSTIFY_CENTER);

        // Animated "Acquiring..." text
        var dots = "";
        for (var i = 0; i < _dotCount; i++) { dots = dots + "."; }
        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.66).toNumber(), Gfx.FONT_TINY,
            "Acquiring" + dots, Gfx.TEXT_JUSTIFY_CENTER);

        // "Stand still outdoors" hint
        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.75).toNumber(), Gfx.FONT_XTINY,
            "Stand still outdoors", Gfx.TEXT_JUSTIFY_CENTER);

        // Cannot-start warning at bottom
        dc.setColor(Gfx.COLOR_ORANGE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.84).toNumber(), Gfx.FONT_XTINY,
            "START disabled", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ── Waiting-for-phone screen ──────────────────────────────────────────────
    //
    // Shown when the auth token has not yet arrived from the phone app.
    //
    private function _drawWaitingForPhoneScreen(dc, cx, cy, w, h) {
        var dots = "";
        for (var i = 0; i < _dotCount; i++) { dots = dots + "."; }

        // Outer accent ring
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, (w / 2) - 4);

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.10).toNumber(), Gfx.FONT_TINY,
            "AI RUN COACH", Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawLine((w * 0.2).toNumber(), (h * 0.22).toNumber(),
                    (w * 0.8).toNumber(), (h * 0.22).toNumber());

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - 20, Gfx.FONT_SMALL,
            "Waiting" + dots, Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 10, Gfx.FONT_TINY,
            "Open AI Run Coach", Gfx.TEXT_JUSTIFY_CENTER);
        dc.drawText(cx, (h * 0.74).toNumber(), Gfx.FONT_TINY,
            "on your phone", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ── Zone Arc ──────────────────────────────────────────────────────────────
    //
    // 11-pixel-thick arc of 5 coloured segments, 240° over the watch top.
    // CCW angles: 0°=right(3-o'clock), 90°=top(12-o'clock), 180°=left, 270°=bottom.
    // Arc goes CCW from 330° (lower-right) → 90° (top) → 210° (lower-left).
    //
    private function _drawZoneArc(dc, cx, cy, w, h) {
        var outerR = (w / 2 - 6).toNumber();
        var innerR = outerR - 11;

        var breath = ((Math.sin(_ringPhase) + 1.0) * 0.5).toFloat();
        var pulse  = _pulseBoost;

        // ── Background: dark ring ─────────────────────────────────────────────
        dc.setColor(0x141414, Gfx.COLOR_TRANSPARENT);
        for (var r = innerR; r <= outerR; r++) {
            dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, 330, 210);
        }

        // ── Five zone segments ─────────────────────────────────────────────────
        // z index 0 = Z5 (red, lower-right)  …  z index 4 = Z1 (blue, lower-left)
        // zone number 1-5:  _heartRateZone == 1 → z index 4, etc.
        for (var z = 0; z < 5; z++) {
            var zoneNum = 5 - z;   // z=0 → zone5, z=4 → zone1
            var isActive = (_heartRateZone == zoneNum);
            var sa = _segStart[z];
            var ea = _segEnd[z];
            var crossesZero = (sa > ea);   // only Z5 (z=0) wraps through 0°

            var color;
            var rInner;
            var rOuter;

            if (isActive && _isRunning) {
                // ── ACTIVE (running): full brightness + glow ─────────────────
                color  = _zoneColors[zoneNum - 1];
                rInner = innerR - 1;
                var glow = (breath * 2.5 + pulse * 3.0).toNumber();
                rOuter = outerR + 1 + glow;

                dc.setColor(color, Gfx.COLOR_TRANSPARENT);
                for (var r = rInner; r <= rOuter; r++) {
                    if (crossesZero) {
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, sa, 359);
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, 1, ea);
                    } else {
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, sa, ea);
                    }
                }

            } else if (_isRunning) {
                // ── INACTIVE (running): dim tint ─────────────────────────────
                color = _zoneDimColors[zoneNum - 1];
                dc.setColor(color, Gfx.COLOR_TRANSPARENT);
                for (var r = innerR; r <= outerR; r++) {
                    if (crossesZero) {
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, sa, 359);
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, 1, ea);
                    } else {
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, sa, ea);
                    }
                }

            } else {
                // ── IDLE (pre-run): dim tint, Z3 centre pulses cyan ──────────
                color = _zoneDimColors[zoneNum - 1];
                dc.setColor(color, Gfx.COLOR_TRANSPARENT);
                for (var r = innerR; r <= outerR; r++) {
                    if (crossesZero) {
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, sa, 359);
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, 1, ea);
                    } else {
                        dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, sa, ea);
                    }
                }
                // Z3 centre segment (z==2): cyan breath pulse — brand signature
                if (z == 2) {
                    var cyanA = (0x003344 + (breath * 0x006699).toNumber()).toNumber();
                    // cheap two-level approach: pulse inner band in brand cyan
                    if (breath > 0.55) {
                        dc.setColor(0x005566, Gfx.COLOR_TRANSPARENT);
                        for (var r = innerR + 2; r <= outerR - 2; r++) {
                            dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, sa, ea);
                        }
                    }
                    if (breath > 0.85) {
                        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
                        for (var r = innerR + 4; r <= outerR - 4; r++) {
                            dc.drawArc(cx, cy, r, Gfx.ARC_COUNTER_CLOCKWISE, sa, ea);
                        }
                    }
                }
            }
        }

        // ── Thin inner separator ring (brand cyan, very subtle) ───────────────
        dc.setColor(0x002233, Gfx.COLOR_TRANSPARENT);
        dc.drawArc(cx, cy, innerR - 2, Gfx.ARC_COUNTER_CLOCKWISE, 330, 210);
        dc.drawArc(cx, cy, innerR - 3, Gfx.ARC_COUNTER_CLOCKWISE, 330, 210);
    }

    // ── Time row ──────────────────────────────────────────────────────────────

    private function _drawTimeRow(dc, cx, h) {
        if (_isRunning) {
            // Elapsed time — no label, slightly larger font so it reads at a glance
            var y = (h * 0.13).toNumber();
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_MEDIUM, _fmtTime(_elapsedTime), Gfx.TEXT_JUSTIFY_CENTER);
        } else {
            // Local clock — white, centred top
            var y = (h * 0.10).toNumber();
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_SMALL, _fmtClock(), Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    // ── Zone + HR badge (only while running) ──────────────────────────────────

    private function _drawZoneBadge(dc, cx, h) {
        if (!_isRunning) { return; }
        var y  = (h * 0.23).toNumber();
        var zn = _heartRateZone;
        var zc = _zoneColors[zn - 1];

        // "Z3  •  148 bpm"
        var hrStr = _dispHR > 0 ? _dispHR.format("%d") : "--";
        dc.setColor(zc, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, y, Gfx.FONT_XTINY,
            "Z" + zn.format("%d") + "  \u2022  " + hrStr + " bpm",
            Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ── Primary metric: PACE ──────────────────────────────────────────────────
    //
    // Layout (label ABOVE value — standard data-field convention):
    //   h*0.27  "MIN / KM"  (XTINY, dim)
    //   h*0.31  PACE value  (NUMBER_MILD — smaller than HOT, leaves room below)
    //   h*0.52  TARGET badge (coached only)

    private function _drawPace(dc, cx, w, h) {
        var paceStr = _fmtPace(_dispPace);
        var lblY    = (h * 0.26).toNumber();
        var y       = (h * 0.32).toNumber();

        // Pace colour
        var paceColor;
        if (_isCoached && _coachTargetPaceSec > 0 && _dispPace > 0) {
            paceColor = _paceDeviationColor();
        } else if (_isRunning && _dispPace > 0) {
            paceColor = Gfx.COLOR_WHITE;
        } else {
            paceColor = 0x404040;   // dim grey pre-run
        }

        // Font: NUMBER_MILD as primary (smaller than HOT — leaves room for 3 metrics below)
        var font = Gfx.FONT_NUMBER_MILD;
        if (dc.getTextWidthInPixels(paceStr, font) > w - 36) {
            font = Gfx.FONT_LARGE;
        }

        // "MIN / KM" label — drawn ABOVE the value
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, lblY, Gfx.FONT_XTINY, "MIN / KM", Gfx.TEXT_JUSTIFY_CENTER);

        // Pace value
        dc.setColor(paceColor, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, y, font, paceStr, Gfx.TEXT_JUSTIFY_CENTER);

        // Coached target badge — sits just below the pace value
        if (_isCoached && _coachTargetPace.length() > 0) {
            var tY = (h * 0.535).toNumber();
            dc.setColor(0x00263A, Gfx.COLOR_TRANSPARENT);
            dc.fillRectangle(cx - 50, tY - 1, 100, 15);
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, tY, Gfx.FONT_XTINY,
                "TARGET  " + _coachTargetPace + " /KM",
                Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    // ── Secondary row: Distance | HR ──────────────────────────────────────────
    //
    // Layout (label ABOVE value):
    //   h*0.575  "KM"  (left)  |  "BPM" (right)   — XTINY dim labels
    //   h*0.615  value          |  value            — FONT_SMALL
    //   Divider: thin vertical line between the two columns

    private function _drawSecondary(dc, cx, w, h) {
        var lblY  = (h * 0.555).toNumber();
        var y     = (h * 0.625).toNumber();
        var lx    = (w * 0.27).toNumber();
        var rx    = (w * 0.73).toNumber();

        // Thin vertical divider
        dc.setColor(0x242424, Gfx.COLOR_TRANSPARENT);
        dc.drawLine(cx, lblY - 2, cx, y + 20);

        // Distance (left) — label above, value below
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(lx, lblY, Gfx.FONT_XTINY, "KM", Gfx.TEXT_JUSTIFY_CENTER);
        var distStr = (_dispDistance / 1000.0).format("%.2f");
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(lx, y, Gfx.FONT_SMALL, distStr, Gfx.TEXT_JUSTIFY_CENTER);

        // Heart rate (right) — label above, value below
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(rx, lblY, Gfx.FONT_XTINY, "BPM", Gfx.TEXT_JUSTIFY_CENTER);
        var hrStr = _dispHR > 0 ? _dispHR.format("%d") : "--";
        var hrCol = _isRunning ? _zoneColors[_heartRateZone - 1] : 0x383838;
        dc.setColor(hrCol, Gfx.COLOR_TRANSPARENT);
        dc.drawText(rx, y, Gfx.FONT_SMALL, hrStr, Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ── Cadence ───────────────────────────────────────────────────────────────

    private function _drawCadence(dc, cx, h) {
        var y   = (h * 0.765).toNumber();
        var str = _dispCadence > 0 ? _dispCadence.format("%d") + " spm" : "-- spm";
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, y, Gfx.FONT_XTINY, str, Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ── Status / prompt ───────────────────────────────────────────────────────
    //
    // Two lines at h*0.840 and h*0.878 — both safely inside the circular safe zone
    // (for a 260px fenix7 that's ~218px and ~228px; bezel intrudes at ~240px).

    private function _drawStatus(dc, cx, h) {
        if (_overlayState == OVERLAY_NONE) {
            // Running — small COACHED badge
            if (_isCoached) {
                var y = (h * 0.855).toNumber();
                dc.setColor(0x003344, Gfx.COLOR_TRANSPARENT);
                dc.fillRectangle(cx - 32, y, 64, 13);
                dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
                dc.drawText(cx, y + 1, Gfx.FONT_XTINY, "COACHED", Gfx.TEXT_JUSTIFY_CENTER);
            }
            return;
        }

        var y1 = (h * 0.840).toNumber();
        var y2 = (h * 0.878).toNumber();

        if (_overlayState == OVERLAY_READY) {
            if (_runnerName.length() > 0) {
                dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
                dc.drawText(cx, y1, Gfx.FONT_XTINY, _runnerName, Gfx.TEXT_JUSTIFY_CENTER);
            }
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y2, Gfx.FONT_XTINY, "START to run", Gfx.TEXT_JUSTIFY_CENTER);

        } else if (_overlayState == OVERLAY_COACHED) {
            var lbl = _runTypeLabel();
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y1, Gfx.FONT_XTINY, lbl, Gfx.TEXT_JUSTIFY_CENTER);
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y2, Gfx.FONT_XTINY, "START to run", Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    // ── Coaching cue overlay ──────────────────────────────────────────────────

    private function _drawCoachingCue(dc, cx, w) {
        dc.setColor(0x001A0D, Gfx.COLOR_TRANSPARENT);
        dc.fillRectangle(0, 0, w, 24);
        dc.setColor(0x00E676, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, 3, Gfx.FONT_TINY, _coachingCue, Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ==========================================================================
    // HELPERS
    // ==========================================================================

    private function _fmtClock() {
        var ct = Sys.getClockTime();
        return ct.hour.format("%02d") + ":" + ct.min.format("%02d");
    }

    private function _fmtTime(secs) {
        var h = (secs / 3600).toNumber();
        var m = ((secs % 3600) / 60).toNumber();
        var s = (secs % 60).toNumber();
        if (h > 0) { return h.format("%d") + ":" + m.format("%02d") + ":" + s.format("%02d"); }
        return m.format("%02d") + ":" + s.format("%02d");
    }

    private function _fmtPace(secPerKm) {
        if (secPerKm <= 0 || secPerKm > 1200) { return "--:--"; }
        var total = secPerKm.toNumber();
        return (total / 60).toNumber().format("%d") + ":" + (total % 60).toNumber().format("%02d");
    }

    private function _parsePace(str) {
        var ci = str.find(":");
        if (ci == null || ci < 0) { return 0.0; }
        var mn = str.substring(0, ci).toNumber();
        var sc = str.substring(ci + 1, str.length()).toNumber();
        if (mn == null) { mn = 0; }
        if (sc == null) { sc = 0; }
        return (mn * 60 + sc).toFloat();
    }

    private function _hrZone(hr) {
        var pct = (hr.toFloat() / 185.0) * 100.0;
        if (pct < 60) { return 1; }
        if (pct < 70) { return 2; }
        if (pct < 80) { return 3; }
        if (pct < 90) { return 4; }
        return 5;
    }

    private function _paceDeviationColor() {
        if (_coachTargetPaceSec <= 0 || _dispPace <= 0) { return Gfx.COLOR_WHITE; }
        var diff = _dispPace - _coachTargetPaceSec;
        if (diff < 0) { diff = -diff; }
        var pct  = (diff / _coachTargetPaceSec) * 100.0;
        if (pct <= 5.0)  { return 0x00E676; }   // bright green — on target
        if (pct <= 12.0) { return 0xFFD740; }   // amber — slightly off
        return 0xF44336;                          // red — significantly off
    }

    private function _runTypeLabel() {
        if (_prepWorkoutType.length() > 0) {
            var f = _prepWorkoutType.substring(0, 1).toUpper();
            var r = _prepWorkoutType.substring(1, _prepWorkoutType.length());
            return f + r + " Run";
        }
        if (_prepRunType.equals("route"))    { return "Route Run"; }
        if (_prepRunType.equals("training")) { return "Training Session"; }
        return "Coached Run";
    }

    private function _startSession() {
        _session = Record.createSession({ :name => "AI Run Coach", :sport => Record.SPORT_RUNNING });
        _session.start();
    }

    private function _stopSession() {
        if (_session != null) {
            if (_session.isRecording()) { _session.stop(); }
            _session.save();
            _session = null;
        }
    }

    private function _vibeShort() {
        if (Toybox.Attention has :vibrate) {
            Toybox.Attention.vibrate([new Toybox.Attention.VibeProfile(50, 100)]);
        }
    }

    private function _vibeLong() {
        if (Toybox.Attention has :vibrate) {
            Toybox.Attention.vibrate([
                new Toybox.Attention.VibeProfile(80, 200),
                new Toybox.Attention.VibeProfile(0,  100),
                new Toybox.Attention.VibeProfile(80, 200)
            ]);
        }
    }
}

// =============================================================================
// RunDelegate — button handling
// =============================================================================

class RunDelegate extends Ui.BehaviorDelegate {
    private var _view;
    function initialize()      { BehaviorDelegate.initialize(); }
    function setView(v)        { _view = v; }

    // START / SELECT → start | pause | resume
    function onSelect() {
        if (_view == null) { return true; }
        if (!_view.isRunning())      { _view.startRun();  }
        else if (_view.isPaused())   { _view.resumeRun(); }
        else                         { _view.pauseRun();  }
        return true;
    }

    // BACK → exit (idle) | pause (running) | finish confirm (paused)
    function onBack() {
        if (_view == null) { return true; }
        if (!_view.isRunning()) {
            Sys.exit();
        } else if (_view.isPaused()) {
            Ui.pushView(
                new Ui.Confirmation("Finish run?"),
                new FinishConfirmDelegate(_view),
                Ui.SLIDE_IMMEDIATE
            );
        } else {
            _view.pauseRun();
        }
        return true;
    }
}

class FinishConfirmDelegate extends Ui.ConfirmationDelegate {
    private var _view;
    function initialize(v)  { ConfirmationDelegate.initialize(); _view = v; }
    function onResponse(r)  {
        if (r == Ui.CONFIRM_YES && _view != null) { _view.finishRun(); }
        return true;
    }
}
