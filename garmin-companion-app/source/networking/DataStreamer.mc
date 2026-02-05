// Data Streamer - Sends realtime data to backend

using Toybox.Communications as Comm;
using Toybox.System as Sys;
using Toybox.Application as App;
using Toybox.Lang as Lang;

class DataStreamer {
    
    private var _sessionId = null;
    private var _authToken = null;
    private var _baseUrl = "https://airuncoach.live";  // Your backend URL
    private var _latitude = null;
    private var _longitude = null;
    private var _altitude = null;
    private var _pendingRequests = 0;
    
    function initialize() {
        // Load auth token from storage
        _authToken = App.Storage.getValue("authToken");
        _sessionId = App.Storage.getValue("sessionId");
        
        // If no session, create one
        if (_sessionId == null) {
            _sessionId = generateSessionId();
            App.Storage.setValue("sessionId", _sessionId);
            
            // Start session on backend
            startSession();
        }
        
        Sys.println("DataStreamer initialized with session: " + _sessionId);
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
        
        // Build data payload
        var payload = {
            "sessionId" => _sessionId,
            "timestamp" => Sys.getTimer(),
            "heartRate" => data.get("heartRate"),
            "heartRateZone" => data.get("heartRateZone"),
            "cadence" => data.get("cadence"),
            "pace" => data.get("pace"),
            "cumulativeDistance" => data.get("distance"),
            "altitude" => _altitude,
            "elapsedTime" => data.get("elapsedTime"),
            "isMoving" => true,
            "isPaused" => false
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
        
        Comm.makeWebRequest(
            url,
            payload,
            options,
            method(:onDataSent)
        );
    }
    
    // Callback when data is sent
    function onDataSent(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        _pendingRequests--;
        
        if (responseCode == 200) {
            Sys.println("Data sent successfully");
            
            // Check if coaching response included
            if (data != null && data.get("coaching") != null) {
                // TODO: Display coaching on watch
                var coachingText = data.get("coaching");
                Sys.println("Coaching: " + coachingText);
            }
        } else {
            Sys.println("Data send failed: " + responseCode);
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
        
        Comm.makeWebRequest(
            url,
            payload,
            options,
            method(:onSessionStarted)
        );
    }
    
    private function onSessionStarted(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        if (responseCode == 200) {
            Sys.println("Session started on backend");
        } else {
            Sys.println("Session start failed: " + responseCode);
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
