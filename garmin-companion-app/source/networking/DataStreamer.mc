// Data Streamer - Sends realtime data to backend

using Toybox.Communications as Comm;
using Toybox.System as Sys;
using Toybox.Application as App;
using Toybox.Lang as Lang;

(:gui)
class DataStreamer {
    
    private var _sessionId = null;
    private var _authToken = null;
    private var _baseUrl = "https://airuncoach.live";  // Your backend URL
    private var _latitude = null;
    private var _longitude = null;
    private var _altitude = null;
    private var _pendingRequests = 0;
    private var _pendingBatchSessionId = null;  // set when uploadOfflineBatch() starts
    
    function initialize() {
        // Load auth token from storage — do NOT make any Comm.makeWebRequest calls here.
        // Calling Comm during the initialize() / constructor phase (before getInitialView
        // returns) is a known ConnectIQ crash trigger (IQ error icon on watch face).
        // Session creation is deferred to prepareSession(), called explicitly by RunView
        // just before a run starts, when the Comm subsystem is fully initialised.
        _authToken = App.Storage.getValue("authToken");
        _sessionId = null;  // Always start fresh — do not re-use stale session IDs from storage
        App.Storage.deleteValue("sessionId");  // Clean up any leftover from a previous run
        Sys.println("DataStreamer initialised (auth=" + (_authToken != null ? "yes" : "no") + ")");
    }

    // Prepare a new session — call this just before the run starts (from RunView.startRun).
    // Safe to call at run-time; Comm subsystem is guaranteed ready by this point.
    function prepareSession() {
        _sessionId = generateSessionId();
        App.Storage.setValue("sessionId", _sessionId);
        startSession();
        Sys.println("DataStreamer: session prepared — " + _sessionId);
    }
    
    // Refresh the auth token — called by RunView when a new "auth" message arrives.
    // Handles the case where the token expired mid-session and the phone re-authenticated.
    function setAuthToken(token) {
        if (token != null && token.length() > 0) {
            _authToken = token;
            Sys.println("DataStreamer: auth token refreshed");
        }
    }

    // Update GPS coordinates
    function updateGPS(lat, lon, alt) {
        _latitude = lat;
        _longitude = lon;
        _altitude = alt;
    }
    
    // Send data point to backend
    function sendData(data) {
        if (_authToken == null || _sessionId == null) {
            Sys.println("No auth token or session ID");
            return;
        }
        
        // Don't send if too many pending requests
        if (_pendingRequests > 5) {
            Sys.println("Too many pending requests, skipping");
            return;
        }
        
        // Build data payload — all available Garmin sensor metrics
        var payload = {
            "sessionId"            => _sessionId,
            "timestamp"            => Sys.getTimer(),
            // Core metrics
            "heartRate"            => data.get("heartRate"),
            "heartRateZone"        => data.get("heartRateZone"),
            "cadence"              => data.get("cadence"),
            "pace"                 => data.get("pace"),
            "cumulativeDistance"   => data.get("distance"),
            "elapsedTime"          => data.get("elapsedTime"),
            "altitude"             => _altitude,
            "isMoving"             => true,
            "isPaused"             => false,
            // Running dynamics (null on unsupported devices, filtered server-side)
            "groundContactTime"    => data.get("groundContactTime"),
            "groundContactBalance" => data.get("groundContactBalance"),
            "verticalOscillation"  => data.get("verticalOscillation"),
            "verticalRatio"        => data.get("verticalRatio"),
            "strideLength"         => data.get("strideLength"),
            // Power & respiration
            "runningPower"         => data.get("runningPower"),
            "respirationRate"      => data.get("respirationRate"),
            // Training effect (firmware-computed, updates periodically)
            "aerobicTrainingEffect"    => data.get("aerobicTE"),
            "anaerobicTrainingEffect"  => data.get("anaerobicTE"),
            // Cumulative elevation — watch computes these accurately via barometric/GPS
            // fusion.  Sending every second ensures the backend fallback path always has
            // valid ascent/descent totals even if the endSession summary call fails.
            "cumulativeAscent"         => data.get("cumulativeAscent"),
            "cumulativeDescent"        => data.get("cumulativeDescent")
        };
        
        // Add GPS if available
        if (_latitude != null && _longitude != null) {
            payload.put("latitude", _latitude);
            payload.put("longitude", _longitude);
        }
        
        // Send to backend
        var url = _baseUrl + "/api/garmin-companion/data";
        var options = {
            :method => Comm.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Comm.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + _authToken
            },
            :responseType => Comm.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        
        _pendingRequests++;
        
        try {
            Comm.makeWebRequest(url, payload, options, method(:onDataSent));
        } catch (e) {
            _pendingRequests--;
            Sys.println("DataStreamer.sendData: makeWebRequest threw — " + e.toString());
        }
    }
    
    // Callback when data is sent
    function onDataSent(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        _pendingRequests--;

        if (responseCode == 200) {
            // Notify RunView: HTTP is reachable — reset failure counter so offline
            // buffer stays dormant in Scenario 3 (phone nearby, app not open).
            var app = App.getApp();
            if (app != null && (app has :onHttpSuccess)) { app.onHttpSuccess(); }

            // Deliver coaching cue to the active RunView if one was piggybacked on the response
            if (data != null && data.get("coaching") != null) {
                var coachingText = data.get("coaching");
                Sys.println("Coaching cue received: " + coachingText);
                if (app has :onCoachingCue) { app.onCoachingCue(coachingText); }
            }
        } else if (responseCode == 401) {
            // Token expired or invalid.
            // IMPORTANT: do NOT delete the stored token during a run. If we clear it
            // mid-run the user is locked out until they reconnect their phone — exactly
            // the situation we want to avoid.  Instead, flag it as expired so the NEXT
            // app open will prompt re-auth, while this run can continue in offline mode.
            Sys.println("DataStreamer: 401 Unauthorized — token may be expired, switching to offline buffer");
            _authToken = null;  // Stop sending HTTP requests for this session
            // (App.Storage token is intentionally kept so the next open can show a proper
            //  "reconnect needed" prompt rather than a generic "waiting for phone" screen)
            var app = App.getApp();
            if (app != null && (app has :onHttpFailure)) { app.onHttpFailure(); }
        } else {
            // Notify RunView: HTTP failed — increment failure counter
            Sys.println("Data send failed: " + responseCode);
            var app = App.getApp();
            if (app != null && (app has :onHttpFailure)) { app.onHttpFailure(); }
        }
    }
    
    // Start session on backend
    private function startSession() {
        if (_authToken == null) {
            return;
        }
        
        var deviceInfo = Sys.getDeviceSettings();
        var payload = {
            "sessionId" => _sessionId,
            "deviceId" => deviceInfo.uniqueIdentifier,
            "deviceModel" => deviceInfo.partNumber,
            "activityType" => "running"
        };
        
        var url = _baseUrl + "/api/garmin-companion/session/start";
        var options = {
            :method => Comm.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Comm.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + _authToken
            },
            :responseType => Comm.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        
        try {
            Comm.makeWebRequest(url, payload, options, method(:onSessionStarted));
        } catch (e) {
            Sys.println("DataStreamer.startSession: makeWebRequest threw — " + e.toString());
        }
    }
    
    function onSessionStarted(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        if (responseCode == 200) {
            Sys.println("Session started on backend");
        } else {
            Sys.println("Session start failed: " + responseCode);
        }
    }
    
    // End session on backend — creates a permanent run record in AI Run Coach
    function endSession(summary) {
        if (_authToken == null || _sessionId == null) {
            Sys.println("DataStreamer.endSession: no auth or session");
            return;
        }

        var payload = {
            "sessionId"              => _sessionId,
            "summary" => {
                "totalDistance"          => summary.get("distance"),
                "totalDuration"          => summary.get("elapsedTime"),
                "avgHeartRate"           => summary.get("avgHR"),
                "maxHeartRate"           => summary.get("maxHR"),
                "avgCadence"             => summary.get("avgCadence"),
                "avgPace"                => summary.get("avgPace"),
                "totalAscent"            => summary.get("totalAscent"),
                "totalDescent"           => summary.get("totalDescent"),
                // Running dynamics
                "avgGroundContactTime"   => summary.get("avgGct"),
                "avgVerticalOscillation" => summary.get("avgVo"),
                "avgVerticalRatio"       => summary.get("avgVr"),
                "avgStrideLength"        => summary.get("avgSl"),
                "avgGroundContactBalance"=> summary.get("avgGcb"),
                // Power & respiration
                "avgRunningPower"        => summary.get("avgPower"),
                "avgRespirationRate"     => summary.get("avgResp"),
                // Training effect
                "aerobicTrainingEffect"   => summary.get("ate"),
                "anaerobicTrainingEffect" => summary.get("anate"),
                "recoveryTime"           => summary.get("recoveryTime"),
                "vo2MaxEstimate"         => summary.get("vo2Max")
            }
        };

        var url = _baseUrl + "/api/garmin-companion/session/end";
        var options = {
            :method => Comm.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Comm.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + _authToken
            },
            :responseType => Comm.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        try {
            Comm.makeWebRequest(url, payload, options, method(:onSessionEnded));
        } catch (e) {
            Sys.println("DataStreamer.endSession: makeWebRequest threw — " + e.toString());
        }

        // Clear session so next run gets a fresh session
        App.Storage.deleteValue("sessionId");
        _sessionId = null;
    }

    function onSessionEnded(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        if (responseCode == 200) {
            Sys.println("DataStreamer: session ended and run saved to AI Run Coach");
        } else {
            Sys.println("DataStreamer: session end failed: " + responseCode);
        }
    }

    // Upload buffered data from a standalone (phone-less) run.
    // Called automatically when the phone app reconnects after the run.
    // sessionId    : the session ID from that run (read from App.Storage)
    // points       : Array of compact Arrays [elapsed_s, lat_e5, lng_e5, alt_dm, hr, cad, pace_ds]
    // distanceM    : total distance in metres
    // durationSec  : total elapsed time in seconds
    // totalAscent  : total ascent in metres
    function uploadOfflineBatch(sessionId, points, distanceM, durationSec, totalAscent) {
        _pendingBatchSessionId = sessionId;
        if (_authToken == null) {
            Sys.println("DataStreamer.uploadOfflineBatch: no auth token");
            return;
        }
        if (points == null || points.size() == 0) {
            Sys.println("DataStreamer.uploadOfflineBatch: no points to upload");
            return;
        }
        var payload = {
            "sessionId"   => sessionId,
            "points"      => points,
            "distanceM"   => (distanceM   != null) ? distanceM   : 0.0,
            "durationSec" => (durationSec != null) ? durationSec : 0,
            "totalAscent" => (totalAscent != null) ? totalAscent : 0.0
        };
        var url = _baseUrl + "/api/garmin-companion/session/" + sessionId + "/upload-batch";
        var options = {
            :method => Comm.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Comm.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + _authToken
            },
            :responseType => Comm.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        try {
            Comm.makeWebRequest(url, payload, options, method(:onBatchUploaded));
        } catch (e) {
            Sys.println("DataStreamer.uploadOfflineBatch: makeWebRequest threw — " + e.toString());
        }
        Sys.println("DataStreamer: uploading offline batch (" + points.size() + " pts, session=" + sessionId + ")");
    }

    function onBatchUploaded(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        if (responseCode == 200) {
            Sys.println("DataStreamer: offline batch upload success");
            // Notify the app so it can tell the phone to show a sync notification.
            // The server returns { success: true, runId: <int>, ... } so we can deep-link.
            var runId = (data != null && data instanceof Lang.Dictionary) ? data.get("runId") : null;
            var app = App.getApp();
            if (app != null && (app has :onBatchUploaded)) {
                app.onBatchUploaded(_pendingBatchSessionId, runId);
            }
            _pendingBatchSessionId = null;
        } else {
            Sys.println("DataStreamer: offline batch upload failed: " + responseCode);
        }
    }

    // Generate random session ID
    private function generateSessionId() {
        var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        var id = "";
        
        for (var i = 0; i < 16; i++) {
            var randomIndex = Math.rand() % chars.length();
            id += chars.substring(randomIndex, randomIndex + 1);
        }
        
        return id;
    }
}
