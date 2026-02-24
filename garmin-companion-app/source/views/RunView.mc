// Run View - Main activity view during run

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
    
    private var _heartRate = 0;
    private var _heartRateZone = 1;
    private var _distance = 0.0;
    private var _pace = 0.0;
    private var _elapsedTime = 0;
    private var _cadence = 0;
    private var _altitude = 0.0;
    
    private var _coachingText = "";
    private var _timer = null;
    private var _dataStreamer = null;
    private var _session = null;

        // ---------------------------
        // UI Animation / Display State
        // ---------------------------
        private var _elapsedMs = 0;
        private var _tickMs = 250;                 // UI refresh interval
        private var _streamAccumMs = 0;            // stream every 1000ms

        private var _dispPace = 0.0;               // smoothed pace (sec/km)
        private var _dispDistance = 0.0;           // smoothed distance (m)
        private var _dispHeartRate = 0;            // smoothed HR
        private var _dispCadence = 0;              // smoothed cadence

        private var _ringPhase = 0.0;              // breathing animation phase
        private var _ringPulseBoost = 0.0;         // brief pulse when coaching arrives

        private var _lastCoachingText = "";
        private var _coachingActive = false;
    
    function initialize() {
        View.initialize();

        _dataStreamer = new DataStreamer();

        // Initialize smoothed values
        _dispPace = _pace;
        _dispDistance = _distance;
        _dispHeartRate = _heartRate;
        _dispCadence = _cadence;

        _timer = new Timer.Timer();
        _timer.start(method(:onTimer), _tickMs, true); // 250ms refresh for smooth UI
    }

    function onLayout(dc) {
        // Don't use layout, draw directly in onUpdate
    }

    function onShow() {
        // Start activity recording
        _session = Record.createSession({
            :name => "AI Run Coach",
            :sport => Record.SPORT_RUNNING
        });
        _session.start();
        
        // Start position tracking
        Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
        
        // Start sensor tracking
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
        Sensor.enableSensorEvents(method(:onSensor));
        
        Sys.println("Run session started");
    }

    function onHide() {
        // Stop everything
        if (_timer != null) {
            _timer.stop();
            _timer = null;
        }
        
        Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
        Sensor.enableSensorEvents(null);
        
        if (_session != null && _session.isRecording()) {
            _session.stop();
            _session.save();
            _session = null;
        }
        
        Sys.println("Run session stopped");
    }

    function onUpdate(dc) {

        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
        dc.clear();

        var width  = dc.getWidth();
        var height = dc.getHeight();
        var centerX = width / 2;
        var centerY = height / 2;

        // ---------------------------
        // Intelligent layout (small screens)
        // ---------------------------
        var isSmall = (height <= 240 || width <= 240);

        // vertical anchors (tuned for round/small screens)
        var paceY     = isSmall ? (height * 0.42) : (height * 0.40);
        var unitY     = paceY + (isSmall ? 28 : 34);

        var secondaryY = isSmall ? (height * 0.70) : (height * 0.72);
        var tertiaryY  = isSmall ? (height * 0.82) : (height * 0.84);

        var coachingY  = isSmall ? (height * 0.58) : (height * 0.60);

        // ---------------------------
        // Breathing ring effect
        // ---------------------------
        // sin wave 0..1
        var s = (Math.sin(_ringPhase) + 1.0) * 0.5;

        // radius breath + coaching pulse
        var baseRadius = (width / 2) - (isSmall ? 6 : 4);
        var breathe = s * (isSmall ? 3 : 4));
        var pulse = _ringPulseBoost * (isSmall ? 4 : 6);

        var ringRadius = baseRadius - 2 + breathe + pulse;

        // subtle ring base
        dc.setColor(0x003A4F, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, baseRadius);

        // accent ring during coaching / pulse
        if (_coachingActive || _ringPulseBoost > 0.0) {
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            dc.drawCircle(centerX, centerY, ringRadius);
        }

        // ---------------------------
        // Primary Metric — PACE
        // Adaptive font scaling: choose largest font that fits
        // ---------------------------
        var paceText = formatPace(_dispPace);

        var paceFonts = isSmall
            ? [Gfx.FONT_LARGE, Gfx.FONT_MEDIUM]
            : [Gfx.FONT_LARGE, Gfx.FONT_MEDIUM];

        var paceFont = pickLargestFontThatFits(dc, paceText, paceFonts, width - 24);

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, paceY, paceFont, paceText, Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(centerX, unitY, Gfx.FONT_TINY, "min/km", Gfx.TEXT_JUSTIFY_CENTER);

        // ---------------------------
        // Dynamic HR Zone bar (premium)
        // ---------------------------
        drawHrZoneBar(dc, centerX, isSmall ? (height * 0.16) : (height * 0.18), width, _heartRateZone);

        // ---------------------------
        // Secondary Row — Distance & Time
        // ---------------------------
        var distText = formatDistance(_dispDistance);
        var timeText = formatTime(_elapsedTime);

        var secondaryFont = isSmall ? Gfx.FONT_TINY : Gfx.FONT_SMALL;

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(width * 0.25), secondaryY, secondaryFont, distText, Gfx.TEXT_JUSTIFY_CENTER);
        dc.drawText(width * 0.75), secondaryY, secondaryFont, timeText, Gfx.TEXT_JUSTIFY_CENTER);

        // ---------------------------
        // Auto-hide tertiary row during coaching
        // ---------------------------
        if (!_coachingActive) {

            // HR + cadence row
            var hrColor = getHeartRateZoneColor(_heartRateZone);
            dc.setColor(hrColor, Gfx.COLOR_TRANSPARENT);
            dc.drawText(width * 0.25, tertiaryY, Gfx.FONT_TINY, _dispHeartRate.format("%d") + " bpm", Gfx.TEXT_JUSTIFY_CENTER);

            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(width * 0.75, tertiaryY, Gfx.FONT_TINY, _dispCadence + " spm", Gfx.TEXT_JUSTIFY_CENTER);
        }

        // ---------------------------
        // Coaching text block (if active)
        // ---------------------------
        if (_coachingActive) {
            dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
            drawWrappedText(dc, _coachingText, centerX, coachingY, (isSmall ? Gfx.FONT_TINY : Gfx.FONT_SMALL), width - 36);
        }
    }
    
    // Timer callback - update elapsed time
    function onTimer() as Void {

        _elapsedMs += _tickMs;
        _elapsedTime = _elapsedMs / 1000;

        // ---------------------------
        // Smooth number transitions
        // ---------------------------
        // Easing factor: smaller = smoother, larger = snappier
        var ease = 0.18;

        // Pace smoothing: ignore nonsense pace spikes
        if (_pace > 0 && _pace < 1200) {
            _dispPace = _dispPace + ((_pace - _dispPace) * ease);
        } else {
            // if pace invalid, softly drift to 0
            _dispPace = _dispPace + ((0.0 - _dispPace) * 0.10);
        }

        _dispDistance = _dispDistance + ((_distance - _dispDistance) * ease);

        _dispHeartRate = (_dispHeartRate + ((_heartRate - _dispHeartRate) * 0.25)).toNumber();
        _dispCadence = (_dispCadence + ((_cadence - _dispCadence) * 0.25)).toNumber();

        // ---------------------------
        // Breathing ring animation
        // ---------------------------
        _ringPhase += 0.18; // speed of breathing
        if (_ringPhase > 6.283) { _ringPhase -= 6.283; }

        // decay pulse boost
        _ringPulseBoost *= 0.85;
        if (_ringPulseBoost < 0.01) _ringPulseBoost = 0.0;

        // coaching state
        _coachingActive = (_coachingText != null && _coachingText.length() > 0);

        // ---------------------------
        // Stream to backend (every 1000ms)
        // ---------------------------
        _streamAccumMs += _tickMs;
        if (_streamAccumMs >= 1000) {
            _streamAccumMs = 0;

            if (_dataStreamer != null) {
                _dataStreamer.sendData({
                    "heartRate" => _heartRate,
                    "heartRateZone" => _heartRateZone,
                    "distance" => _distance,
                    "pace" => _pace,
                    "cadence" => _cadence,
                    "altitude" => _altitude,
                    "elapsedTime" => _elapsedTime
                });
            }
        }

        Ui.requestUpdate();
    }
    
    // Position callback
    function onPosition(info as Pos.Info) as Void {
        if (info.position != null) {
            var lat = info.position.toDegrees()[0];
            var lon = info.position.toDegrees()[1];
            
            if (info.altitude != null) {
                _altitude = info.altitude;
            }
            
            if (info.speed != null) {
                // Calculate pace from speed (m/s to min/km)
                if (info.speed > 0.1) {
                    _pace = 1000.0 / (info.speed * 60.0);
                }
            }
            
            // Update data streamer with GPS
            if (_dataStreamer != null) {
                _dataStreamer.updateGPS(lat, lon, _altitude);
            }
        }
    }
    
    // Sensor callback
    function onSensor(info as Sensor.Info) as Void {
        if (info.heartRate != null) {
            _heartRate = info.heartRate;
            _heartRateZone = calculateHeartRateZone(_heartRate);
        }
        
        if (info.cadence != null) {
            _cadence = info.cadence;
        }
    }
    
    // Set coaching text from backend
    function setCoachingText(text) {

        _coachingText = text;
        Ui.requestUpdate();

        // Pulse ring when coaching changes
        if (text != null && text.length() > 0 && !text.equals(_lastCoachingText)) {
            _ringPulseBoost = 1.0;
            _lastCoachingText = text;

            // Vibrate alert (safe call)
            if (Toybox.Attention has :vibrate) {
                Toybox.Attention.vibrate([ new Toybox.Attention.VibeProfile(60, 120) ]);
            }
        }
    }
    
    // Helper functions
    private function formatDistance(meters) {
        var km = meters / 1000.0;
        return km.format("%.2f") + " km";
    }
    
    private function formatPace(secondsPerKm) {

        if (secondsPerKm <= 0 || secondsPerKm > 1200) {
            return "--:--";
        }

        var total = secondsPerKm.toNumber();
        var minutes = (total / 60).toNumber();
        var seconds = (total % 60).toNumber();

        return minutes.format("%d") + ":" + seconds.format("%02d");
    }
    
    private function formatTime(seconds) {
        var hours = seconds / 3600;
        var mins = (seconds % 3600) / 60;
        var secs = seconds % 60;
        
        if (hours > 0) {
            return hours.format("%d") + ":" + mins.format("%02d") + ":" + secs.format("%02d");
        } else {
            return mins.format("%d") + ":" + secs.format("%02d");
        }
    }
    
    private function calculateHeartRateZone(hr) {
        // Simple zone calculation (should use user's max HR from settings)
        var maxHR = 185;  // Default, should be configurable
        var percent = (hr.toFloat() / maxHR) * 100;
        
        if (percent < 60) {
            return 1;
        } else if (percent < 70) {
            return 2;
        } else if (percent < 80) {
            return 3;
        } else if (percent < 90) {
            return 4;
        } else {
            return 5;
        }
    }
    
    private function getHeartRateZoneColor(zone) {
        if (zone == 1) {
            return Gfx.COLOR_BLUE;
        } else if (zone == 2) {
            return Gfx.COLOR_GREEN;
        } else if (zone == 3) {
            return Gfx.COLOR_YELLOW;
        } else if (zone == 4) {
            return Gfx.COLOR_ORANGE;
        } else {
            return Gfx.COLOR_RED;
        }
    }
    
    private function drawWrappedText(dc, text, x, y, font, maxWidth) {
        var words = splitString(text, " ");
        var line = "";
        var lineHeight = dc.getFontHeight(font);
        
        for (var i = 0; i < words.size(); i++) {
            var testLine = line + words[i] + " ";
            var testWidth = dc.getTextWidthInPixels(testLine, font);
            
            if (testWidth > maxWidth && line.length() > 0) {
                dc.drawText(x, y, font, line, Gfx.TEXT_JUSTIFY_CENTER);
                line = words[i] + " ";
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        
        if (line.length() > 0) {
            dc.drawText(x, y, font, line, Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    private function pickLargestFontThatFits(dc, text, fonts, maxWidth) {

        for (var i = 0; i < fonts.size(); i++) {
            var f = fonts[i];
            var w = dc.getTextWidthInPixels(text, f);
            if (w <= maxWidth) {
                return f; // first one that fits (largest first)
            }
        }

        // fallback: smallest
        return fonts[fonts.size() - 1];
    }

    private function drawHrZoneBar(dc, cx, y, width, zone) {

        var barW = (width * 0.62).toNumber();
        var barH = 6;
        var x0 = (cx - (barW / 2)).toNumber();

        // segment colors (premium but subtle)
        var z1 = Gfx.COLOR_BLUE;
        var z2 = Gfx.COLOR_GREEN;
        var z3 = Gfx.COLOR_YELLOW;
        var z4 = Gfx.COLOR_ORANGE;
        var z5 = Gfx.COLOR_RED;

        var cols = [z1, z2, z3, z4, z5];

        // background track
        dc.setColor(0x1A1A1A, Gfx.COLOR_TRANSPARENT);
        dc.fillRectangle(x0, y, barW, barH);

        var segW = (barW / 5).toNumber();

        for (var i = 0; i < 5; i++) {
            var segX = (x0 + (segW * i)).toNumber();

            // subtle unselected
            if ((i + 1) != zone) {
                dc.setColor(0x2A2A2A, Gfx.COLOR_TRANSPARENT);
                dc.fillRectangle(segX, y, segW - 1, barH);
            } else {
                // selected zone bright
                dc.setColor(cols[i], Gfx.COLOR_TRANSPARENT);
                dc.fillRectangle(segX, y, segW - 1, barH);

                // tiny “glow” line above active zone
                dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
                dc.fillRectangle(segX, y - 2, segW - 1, 1);
            }
        }
    }
    
    private function splitString(str, delimiter) {
        var words = [];
        var word = "";
        
        for (var i = 0; i < str.length(); i++) {
            var char = str.substring(i, i + 1);
            if (char.equals(delimiter)) {
                if (word.length() > 0) {
                    words.add(word);
                    word = "";
                }
            } else {
                word += char;
            }
        }
        
        if (word.length() > 0) {
            words.add(word);
        }
        
        return words;
    }
}

class RunDelegate extends Ui.BehaviorDelegate {
    
    private var _view;
    
    function initialize() {
        BehaviorDelegate.initialize();
    }
    
    function setView(view) {
        _view = view;
    }

    // Handle LAP button (show menu)
    function onMenu() {
        Ui.pushView(
            new Rez.Menus.RunMenu(),
            new RunMenuDelegate(_view),
            Ui.SLIDE_IMMEDIATE
        );
        return true;
    }
    
    // Handle BACK button (pause/resume)
    function onBack() {
        // Show pause confirmation
        Ui.pushView(
            new Ui.Confirmation("Pause run?"),
            new PauseDelegate(),
            Ui.SLIDE_IMMEDIATE
        );
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
            // Show finish confirmation
            Ui.pushView(
                new Ui.Confirmation("Finish run?"),
                new FinishDelegate(),
                Ui.SLIDE_IMMEDIATE
            );
        }
    }
}

class PauseDelegate extends Ui.ConfirmationDelegate {
    function initialize() {
        ConfirmationDelegate.initialize();
    }
    
    function onResponse(response) {
        if (response == Ui.CONFIRM_YES) {
            // TODO: Pause session
            Sys.println("Run paused");
            return true;
        }
        return false;
    }
}

class FinishDelegate extends Ui.ConfirmationDelegate {
    function initialize() {
        ConfirmationDelegate.initialize();
    }
    
    function onResponse(response) {
        if (response == Ui.CONFIRM_YES) {
            // Pop back to start view
            Ui.popView(Ui.SLIDE_IMMEDIATE);
            Sys.println("Run finished");
            return true;
        }
        return false;
    }
}
