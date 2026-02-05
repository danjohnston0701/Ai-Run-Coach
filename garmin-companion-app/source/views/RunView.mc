// Run View - Main activity view during run

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
    
    function initialize() {
        View.initialize();
        
        // Initialize data streamer
        _dataStreamer = new DataStreamer();
        
        // Start timer for updates
        _timer = new Timer.Timer();
        _timer.start(method(:onTimer), 1000, true);  // Update every second
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
        
        var width = dc.getWidth();
        var height = dc.getHeight();
        var yOffset = height / 6;
        
        // Draw heart rate (large, top center)
        dc.setColor(getHeartRateZoneColor(_heartRateZone), Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            width / 2,
            yOffset,
            Gfx.FONT_NUMBER_HOT,
            _heartRate.format("%d"),
            Gfx.TEXT_JUSTIFY_CENTER
        );
        dc.drawText(
            width / 2,
            yOffset + 50,
            Gfx.FONT_TINY,
            "BPM (Z" + _heartRateZone + ")",
            Gfx.TEXT_JUSTIFY_CENTER
        );
        
        // Draw distance and pace (side by side)
        yOffset += 90;
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            width / 4,
            yOffset,
            Gfx.FONT_MEDIUM,
            formatDistance(_distance),
            Gfx.TEXT_JUSTIFY_CENTER
        );
        dc.drawText(
            width * 3 / 4,
            yOffset,
            Gfx.FONT_MEDIUM,
            formatPace(_pace),
            Gfx.TEXT_JUSTIFY_CENTER
        );
        
        // Draw time and cadence
        yOffset += 35;
        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            width / 4,
            yOffset,
            Gfx.FONT_TINY,
            formatTime(_elapsedTime),
            Gfx.TEXT_JUSTIFY_CENTER
        );
        dc.drawText(
            width * 3 / 4,
            yOffset,
            Gfx.FONT_TINY,
            _cadence + " SPM",
            Gfx.TEXT_JUSTIFY_CENTER
        );
        
        // Draw coaching text (bottom, wrapped)
        if (_coachingText.length() > 0) {
            yOffset += 50;
            dc.setColor(Gfx.COLOR_YELLOW, Gfx.COLOR_TRANSPARENT);
            drawWrappedText(dc, _coachingText, width / 2, yOffset, Gfx.FONT_TINY, width - 20);
        }
    }
    
    // Timer callback - update elapsed time
    function onTimer() as Void {
        _elapsedTime += 1;
        
        // Stream data to backend every second
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
        
        // Vibrate to alert user
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(50, 200)]);
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
        var minutes = secondsPerKm / 60;
        var seconds = secondsPerKm % 60;
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
