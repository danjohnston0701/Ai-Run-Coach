// RunView.mc — Elite Diamond Grid Dashboard
// Redesign: 4 coloured metric rings in a diamond layout.
//   TOP    = Time/Duration  (Green Ring)
//   LEFT   = Pace           (Blue/Cyan Ring, 5-sec smoothed, 1 decimal)
//   RIGHT  = Heart Rate     (Red/Orange Ring)
//   BOTTOM = Cadence        (Yellow Ring)
// Light grey background, black text.
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
using Toybox.Activity;
using Toybox.Application as App;
using Toybox.Communications as Comm;

(:gui)
class RunView extends Ui.View {

    // Overlay / prompt state
    enum { OVERLAY_NONE, OVERLAY_WAITING, OVERLAY_GPS_WAIT, OVERLAY_READY, OVERLAY_COACHED }

    // Auth & app state
    private var _isAuthenticated = false;
    private var _isConnected     = false;
    private var _overlayState    = OVERLAY_READY;
    private var _dotCount        = 0;
    // Personalised max HR from phone (Tanaka formula). Default 185 until auth received.
    private var _maxHr           = 185;
    // Grace period before showing "OFFLINE" label (lets auth message arrive first)
    private var _connectWaitTicks = 0;
    private const CONNECT_WAIT_MAX = 32; // 32 x 250ms = 8 seconds

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

    // Coaching / status
    private var _isCoached          = false;
    private var _coachTargetPace    = "";
    private var _coachTargetPaceSec = 0.0;
    private var _statusMessage      = "";
    private var _statusTicks        = 0;

    // Infrastructure
    private var _timer        = null;
    private var _dataStreamer = null;
    private var _phoneLink    = null;
    private var _session      = null;

    // Tracks whether we've already sent sessionReady to the phone this session
    private var _sessionReadySent = false;

    // Watch GPS cache
    private var _lastGpsLat    = null;
    private var _lastGpsLng    = null;
    private var _lastGpsAlt    = null;
    private var _baroAlt        = null;   // Barometric altitude from Sensor.SensorInfo (continuous)
    private var _lastGpsSpeed  = 0.0;
    private var _gpsStreamTick = 0;

    // GPS distance accumulation
    private var _prevGpsLat = null;
    private var _prevGpsLng = null;

    // GPS acquisition state
    private var _gpsReady     = false;
    private var _gpsQuality   = 0;
    private var _gpsListening = false;
    // GPS signal-lost indicator during a run: counts ticks with quality < 2
    private var _gpsLostTicks = 0;
    private const GPS_LOST_THRESHOLD = 8; // 8 x 250ms = 2 s before warning shown

    // Smoothed display values
    private var _elapsedMs     = 0;
    private var _tickMs        = 250;
    private var _streamAccumMs = 0;
    private var _dispPace      = 0.0;
    private var _dispDistance  = 0.0;
    private var _dispHR        = 0;
    private var _dispCadence   = 0;

    // Running dynamics (read from Activity.Info each tick)
    private var _gct   = 0.0;   // Ground contact time (ms)
    private var _gcb   = 0.0;   // Ground contact balance (%, 50 = perfect)
    private var _vo    = 0.0;   // Vertical oscillation (mm)
    private var _vr    = 0.0;   // Vertical ratio (%)
    private var _sl    = 0.0;   // Stride length (m)
    private var _power = 0;     // Running power (watts, device-dependent)
    private var _respRate = 0.0; // Respiration rate (breaths/min, Fenix 7+)
    private var _ate   = 0.0;   // Aerobic training effect (0-5)
    private var _anate = 0.0;   // Anaerobic training effect (0-5)

    // 8-second pace smoothing buffer (circular, 1 sample per tick = 1 per second).
    // Shorter than the old 20-sample window so pace changes register in ~8 s,
    // while still smoothing single-tick GPS jitter.  Upper-bound speed rejection
    // (see onTick) stops spikes ever entering the buffer.
    private var _paceHistory    = [];
    private var _paceHistoryMax = 8;
    private var _paceHistoryIdx = 0;   // write head for circular buffer
    // Consecutive ticks with no valid speed reading — used to decide when to snap to "--"
    private var _stoppedTicks   = 0;

    // ── Run summary accumulators (for endSession summary sent to backend) ──────
    private var _sumHR      = 0;     // Heart rate sum
    private var _maxHR      = 0;     // Peak heart rate
    private var _sumCadence = 0;     // Cadence sum
    private var _sumPace    = 0.0;   // Pace sum (sec/km)
    private var _sumGct     = 0.0;   // GCT sum (ms)
    private var _sumVo      = 0.0;   // Vertical oscillation sum
    private var _sumVr      = 0.0;   // Vertical ratio sum
    private var _sumSl      = 0.0;   // Stride length sum
    private var _sumGcb     = 0.0;   // Ground contact balance sum
    private var _sumPower   = 0;     // Power sum (watts)
    private var _sumResp    = 0.0;   // Respiration rate sum
    private var _sampleN    = 0;     // Number of samples accumulated
    private var _totalAscent  = 0.0; // Elevation gain (m)
    private var _totalDescent = 0.0; // Elevation loss (m)
    private var _lastAlt      = null; // Last altitude for delta calc

    // ── Offline buffer (standalone runs — no phone) ───────────────────────────
    // Samples every 15 s (OFFLINE_TICK_INTERVAL x 250ms tick = 15 s).
    // Capped at 360 points = 90 minutes of coverage.
    // Each point is a compact 7-element Array to minimise heap use:
    //   [elapsed_s, lat_e5, lng_e5, alt_dm, hr, cadence, pace_ds]
    //   lat_e5  = latitude  x 100000 (integer)
    //   lng_e5  = longitude x 100000 (integer)
    //   alt_dm  = altitude  x 10     (integer, decimetres)
    //   pace_ds = pace      x 10     (integer, deciseconds/km)
    private var _offlineBuffer          = [];
    private var _offlineTicks           = 0;
    private var _offlineBufferFull      = false;
    private const OFFLINE_TICK_INTERVAL = 60;   // 60 x 250ms = 15 s
    private const OFFLINE_MAX_POINTS    = 360;  // 360 x 15s  = 90 min

    // ── HTTP health tracking (offline-buffer activation) ─────────────────────
    // If 5 consecutive HTTP sends fail (relay unavailable = no phone), switch to
    // offline buffer mode. Reset to 0 on every successful HTTP response.
    private var _httpConsecutiveFails   = 0;
    private const HTTP_FAIL_THRESHOLD   = 5;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    function initialize() {
        View.initialize();
        _phoneLink    = new PhoneLink();
        _dataStreamer = new DataStreamer();
        var tok = App.Storage.getValue("authToken");
        _isAuthenticated = (tok != null && tok.length() > 0);
        _overlayState = _isAuthenticated ? OVERLAY_GPS_WAIT : OVERLAY_WAITING;
        _paceHistory = [];
        _initSimulatorMode();   // no-op in release, seeds preview data in simulator
    }

    // ── Simulator preview mode ────────────────────────────────────────────────
    // (:debug) version: skip phone auth + GPS wait, seed metrics for UI preview.
    // (:release) version: empty — stripped entirely by monkeyc when building .iq

    (:debug)
    private function _initSimulatorMode() {
        _isAuthenticated = true;
        _gpsReady        = true;
        _isRunning       = true;
        _overlayState    = OVERLAY_NONE;
        // Seed realistic running metrics for visual preview
        _heartRate       = 158;
        _heartRateZone   = 3;
        _cadence         = 172;
        _distance        = 3420.0;   // 3.42 km
        _elapsedTime     = 1523;     // 25:23
        _pace            = 335.0;    // ~5.6 min/km
        _dispHR          = 158;
        _dispCadence     = 172;
        _dispDistance    = 3420.0;
        _dispPace        = 335.0;
        // Seed pace history so smoothed pace shows correctly
        for (var i = 0; i < 20; i++) { _paceHistory.add(335.0); }
    }

    (:release)
    private function _initSimulatorMode() {
        // Stripped from production build — do not add code here
    }

    function setPhoneControlled(v) { _phoneControlled = v; }

    function setStatusMessage(msg) {
        _statusMessage = msg;
        _statusTicks   = 20;
    }

    // Keep setCoachingCue for backward compat — coaching audio plays on phone/headphones only.
    // No text is shown on the watch screen; a single haptic pulse confirms delivery.
    function setCoachingCue(cueText) {
        _vibeShort();
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

    // ── HTTP health callbacks (called by AiRunCoachApp from DataStreamer) ──────

    // HTTP POST succeeded — phone relay (Garmin Connect) is reachable.
    // Reset failure counter so offline buffer stays dormant (Scenario 3).
    function onHttpSuccess() {
        if (_httpConsecutiveFails > 0) {
            _httpConsecutiveFails = 0;
            // If we were in offline mode, show a brief "Phone reconnected" note
            if (_isRunning) {
                setStatusMessage("Connected - streaming live");
            }
        }
    }

    // HTTP POST failed — increment failure counter.
    // Once we hit the threshold we know the phone relay is genuinely unavailable
    // and activate the offline buffer.
    function onHttpFailure() {
        _httpConsecutiveFails += 1;
        if (_httpConsecutiveFails == HTTP_FAIL_THRESHOLD && _isRunning) {
            setStatusMessage("No relay: offline buffer active");
        }
    }
    // Called by AiRunCoachApp when DataStreamer finishes uploading an offline batch.
    // Notifies the phone so it can show a push notification with a deep link to the run.
    function onBatchUploaded(sessionId, runId) {
        Sys.println("RunView: offline batch synced — notifying phone (runId=" + runId + ")");
        // Upload confirmed (HTTP 200) -- safe to clear the buffered batch now.
        // Until this point the batch stays in storage so a failed upload can be
        // retried by the 20-min BackgroundService instead of being lost forever.
        _clearOfflineBatchStorage();
        _phoneLink.sendSyncComplete(sessionId, runId);
    }

    // Clears the buffered offline-run batch from persistent storage. Called only
    // after a confirmed successful upload, or when stored data is detected corrupt.
    private function _clearOfflineBatchStorage() {
        App.Storage.deleteValue("offlineBatchSessionId");
        App.Storage.deleteValue("offlineBatchPoints");
        App.Storage.deleteValue("offlineBatchDistance");
        App.Storage.deleteValue("offlineBatchDuration");
        App.Storage.deleteValue("offlineBatchAscent");
    }

    function startRun() {
        Sys.println(">>> startRun() entry — connected=" + _isConnected + " gpsQ=" + _gpsQuality + " auth=" + _isAuthenticated);
        if (_isRunning) { return; }
        // GPS quality gate: require "Usable" (>=3) for standalone, but allow "Last known"
        // (>=2) when phone is connected since phone GPS will be authoritative for the run.
        var minGpsQ = _isConnected ? 2 : 3;
        if (_gpsQuality < minGpsQ) { _vibeShort(); Sys.println(">>> startRun() blocked — gps too low (" + _gpsQuality + " < " + minGpsQ + ")"); return; }
        _isRunning     = true;
        _isPaused      = false;
        _elapsedMs     = 0;
        _elapsedTime   = 0;
        _overlayState  = OVERLAY_NONE;
        _gpsStreamTick = 0;
        _distance = 0.0;
        _dispDistance = 0.0;
        _prevGpsLat = null;
        _prevGpsLng = null;
        _pace = 0.0;
        _dispPace = 0.0;
        _paceHistory = [];    // Clear history so stale readings do not bias the new run
        _paceHistoryIdx = 0;  // Reset circular buffer write head
        _stoppedTicks   = 0;  // Reset stopped-tick counter

        // Only register GPS if not already listening — avoids duplicate registration
        // which can cause IQ errors on some Garmin devices.
        if (!_gpsListening) {
            Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
            _gpsListening = true;
        }
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
        Sensor.enableSensorEvents(method(:onSensor));

        // Reset run summary accumulators
        _sumHR = 0; _maxHR = 0; _sumCadence = 0; _sumPace = 0.0;
        _sumGct = 0.0; _sumVo = 0.0; _sumVr = 0.0; _sumSl = 0.0;
        _sumGcb = 0.0; _sumPower = 0; _sumResp = 0.0; _sampleN = 0;
        _totalAscent = 0.0; _totalDescent = 0.0; _lastAlt = null; _baroAlt = null;

        // Reset offline buffer and HTTP health counter
        _offlineBuffer          = [];
        _offlineTicks           = 0;
        _offlineBufferFull      = false;
        _httpConsecutiveFails   = 0;
        // Don't show "No phone" at start — HTTP may still work via Garmin Connect
        // relay even when the phone app hasn't opened. We show the notice only once
        // HTTP has actually failed enough times to confirm the relay is unavailable.

        // ALWAYS prepare a backend session for any non-phone-controlled run.
        //
        // The old !_isConnected guard was broken: _isConnected stays TRUE forever once auth
        // arrives — the phone never sends a BT disconnect message.  So any standalone run
        // after the user had EVER opened the phone app would skip prepareSession(), skip the
        // offline buffer, and silently lose the run.
        //
        // Now we always call prepareSession() for non-phone-controlled runs.
        // If the phone is ALSO tracking (Scenario 2 success), upload-batch dedup logic
        // links the watch batch to the phone run instead of creating a duplicate.
        Sys.println(">>> startRun() — prepareSession (connected=" + _isConnected + ")");
        if (!_phoneControlled && _dataStreamer != null) { _dataStreamer.prepareSession(); }

        // Always start local Garmin session AND notify phone (phone must activate its run session for coaching)
        Sys.println(">>> startRun() — about to _startSession()");
        _startSession();
        Sys.println(">>> startRun() — about to sendCommand start");
        _phoneLink.sendCommand("start");
        Sys.println(">>> startRun() — complete, session live");
        _vibeShort();
        Ui.requestUpdate();
    }

    function pauseRun() {
        if (_isPaused || !_isRunning) { return; }
        _isPaused = true;
        _prevGpsLat = null;
        _prevGpsLng = null;
        // Always notify phone, always stop local recording
        _phoneLink.sendCommand("pause");
        if (_session != null && _session.isRecording()) { _session.stop(); }
        _vibeShort();
        Ui.requestUpdate();
    }

    function resumeRun() {
        if (!_isPaused) { return; }
        _isPaused = false;
        // Always notify phone, always restart local recording
        _phoneLink.sendCommand("resume");
        if (_session != null && !_session.isRecording()) { _session.start(); }
        _vibeShort();
        Ui.requestUpdate();
    }

    // ── Talk to Coach ─────────────────────────────────────────────────────────

    function requestTalkToCoach() {
        // Send a command to the phone to open the talk-to-coach listening window
        _phoneLink.sendCommand("talkToCoach");
        // Haptic confirmation so the user knows the tap registered
        _vibeShort();
        // Show a brief prompt on screen
        _statusMessage = "Asking coach...";
        _statusTicks = 8; // ~2 seconds at 250ms tick
        Ui.requestUpdate();
    }

    function finishRun() {
        _isRunning       = false;
        _isPaused        = false;
        _sessionReadySent = false;  // Reset so next session notifies phone again
        _overlayState = OVERLAY_READY;
        Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
        _gpsListening = false;
        Sensor.enableSensorEvents(null);
        // Always notify phone, always stop local recording
        _phoneLink.sendCommand("stop");
        _stopSession();

        // ── Save offline buffer so it uploads when phone reconnects ──────────
        // Read sessionId BEFORE endSession() clears it from App.Storage.
        // Guard is now !_phoneControlled (not !_isConnected) because _isConnected stays
        // TRUE after any auth.  We save the batch for ALL non-phone-controlled runs as a
        // backup — the backend upload-batch endpoint deduplicates against phone runs.
        if (!_phoneControlled && _offlineBuffer.size() > 0) {
            var sid = App.Storage.getValue("sessionId");
            if (sid != null) {
                App.Storage.setValue("offlineBatchSessionId", sid);
                App.Storage.setValue("offlineBatchPoints",    _offlineBuffer);
                App.Storage.setValue("offlineBatchDistance",  _distance);
                App.Storage.setValue("offlineBatchDuration",  _elapsedTime);
                App.Storage.setValue("offlineBatchAscent",    _totalAscent);
                Sys.println("Offline batch saved: " + _offlineBuffer.size() + " pts, session=" + sid);
                // Notify phone immediately — even with no active relay the Garmin
                // Connect BT stack may deliver this, letting the phone banner show
                // without waiting for the 20-minute background service trigger.
                try { _phoneLink.sendPendingSync(); } catch (ex) {}
            }
        }

        // Only call DataStreamer.endSession() for STANDALONE watch runs (no phone connection).
        // When the phone is connected (_isConnected), the phone owns the run session and saves
        // it to the backend itself.  Calling endSession() here would create a duplicate run record
        // AND can crash the watch app (IQ error) if ConnectIQ was already shut down on the phone side.
        if (!_isConnected && _dataStreamer != null && _sampleN > 0) {
            var n = _sampleN.toFloat();
            _dataStreamer.endSession({
                "distance"    => _distance,
                "elapsedTime" => _elapsedTime,
                "avgHR"       => (_sumHR   > 0) ? (_sumHR   / n).toNumber() : null,
                "maxHR"       => (_maxHR   > 0) ? _maxHR : null,
                "avgCadence"  => (_sumCadence > 0) ? (_sumCadence / n).toNumber() : null,
                "avgPace"     => (_sumPace > 0.0) ? _sumPace / n : null,
                "totalAscent" => (_totalAscent  > 0.0) ? _totalAscent  : null,
                "totalDescent"=> (_totalDescent > 0.0) ? _totalDescent : null,
                "avgGct"      => (_sumGct   > 0.0) ? _sumGct   / n : null,
                "avgVo"       => (_sumVo    > 0.0) ? _sumVo    / n : null,
                "avgVr"       => (_sumVr    > 0.0) ? _sumVr    / n : null,
                "avgSl"       => (_sumSl    > 0.0) ? _sumSl    / n : null,
                "avgGcb"      => (_sumGcb   > 0.0) ? _sumGcb   / n : null,
                "avgPower"    => (_sumPower  > 0)   ? (_sumPower / n).toNumber() : null,
                "avgResp"     => (_sumResp  > 0.0) ? _sumResp  / n : null,
                "ate"         => (_ate  > 0.0) ? _ate  : null,
                "anate"       => (_anate > 0.0) ? _anate : null
            });
        }
        _vibeLong();
        // Re-enable GPS for idle monitoring so the user can see GPS quality
        // before starting the next run, and so _gpsReady stays accurate.
        if (_isAuthenticated && !_gpsListening) {
            Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
            _gpsListening = true;
        }
        Ui.requestUpdate();
    }

    function onShow() {
        _phoneLink.register(method(:onPhoneMessage));
        // Include hasPendingSync so phone dashboard shows a sync indicator
        _phoneLink.sendWatchReady(_hasPendingOfflineBatch());
        if (!_phoneControlled && _isRunning) {
            // Restore after view was hidden (system menu etc).
            // Guard against session re-creation which would split the Garmin activity.
            if (_session == null) { _startSession(); }
            if (!_gpsListening) {
                Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
                _gpsListening = true;
            }
            Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
            Sensor.enableSensorEvents(method(:onSensor));
        } else if (_isAuthenticated && !_gpsListening) {
            Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
            _gpsListening = true;
        }
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), _tickMs, true);
    }

    function onHide() {
        if (_timer != null) { _timer.stop(); _timer = null; }
        // Do NOT disable GPS or sensors when a run is active — view may be
        // temporarily hidden by system menu/glance.  Only clean up when idle.
        if (!_isRunning) {
            if (_gpsListening) {
                Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
                _gpsListening = false;
            }
            Sensor.enableSensorEvents(null);
        }
    }

    // ── Phone messages ────────────────────────────────────────────────────────
    // Single unified handler — PhoneLink routes all messages here via onPhoneMessage.
    // onPhoneAppMessage was the old direct-callback style; it is NOT called by PhoneLink.

    function onPhoneMessage(data) {
        if (data == null) { return; }
        var t = data.get("type");
        if (t == null) { return; }

        if (t.equals("auth")) {
            var tok   = data.get("authToken");
            var rname = data.get("runnerName");
            if (tok != null && tok.length() > 0) {
                App.Storage.setValue("authToken", tok);
                _isAuthenticated  = true;
                _isConnected      = true;
                _connectWaitTicks = CONNECT_WAIT_MAX; // Mark grace period done
                // Update personalised max HR for on-watch zone display
                var mhr = data.get("maxHr");
                if (mhr != null && mhr > 0) { _maxHr = mhr.toNumber(); }
                // Refresh DataStreamer token in case the old one expired mid-session
                if (_dataStreamer != null) { _dataStreamer.setAuthToken(tok); }
                if (!_isRunning) {
                    if (!_gpsListening) {
                        Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
                        _gpsListening = true;
                    }
                    _overlayState = _gpsReady ? OVERLAY_READY : OVERLAY_GPS_WAIT;
                }
                Sys.println("Auth received — overlayState=" + _overlayState);
                // Tell the phone which watch app version is installed so the
                // "Watch App Update" notification screen can show the diff.
                _phoneLink.sendHello("3.0.0");
                // If GPS was already locked before auth arrived, notify phone now
                if (_gpsReady && !_isRunning && !_sessionReadySent) {
                    _phoneLink.sendCommand("sessionReady");
                    _sessionReadySent = true;
                }
            }
            if (rname != null) { App.Storage.setValue("runnerName", rname); }

                // ── Upload any pending offline batch from a previous phone-less run ──
                // DEFENSIVE: pendingPts MUST be a Lang.Array — stale data from an old
                // store version may have been serialised as another type.  Calling
                // .size() on a non-Array raises "Failed invoking <symbol>" (IQ crash).
                // CRITICAL: do NOT clear the batch before the upload confirms success.
                // The upload is async and often fails on the first reconnect (relay
                // settling, token just refreshed). Clearing up-front would lose the run
                // with no chance for the 20-min BackgroundService retry. Storage is now
                // cleared only after a confirmed 200 (see onBatchUploaded()).
                var pendingSid = App.Storage.getValue("offlineBatchSessionId");
                var pendingPts = App.Storage.getValue("offlineBatchPoints");
                if (pendingSid != null && (pendingPts instanceof Lang.Array) && pendingPts.size() > 0) {
                    Sys.println("Pending offline batch: " + pendingPts.size() + " pts for " + pendingSid);
                    var pendingDist = App.Storage.getValue("offlineBatchDistance");
                    var pendingDur  = App.Storage.getValue("offlineBatchDuration");
                    var pendingAsc  = App.Storage.getValue("offlineBatchAscent");
                    _dataStreamer.uploadOfflineBatch(pendingSid, pendingPts, pendingDist, pendingDur, pendingAsc);
                } else if (pendingSid != null) {
                    Sys.println("Discarded corrupt offline batch (wrong type) — keys cleared");
                    _clearOfflineBatchStorage();
                }
            Ui.requestUpdate();

        } else if (t.equals("startRun")) {
            // Scenario A: phone initiates the run — watch acts as companion display.
            // Phone owns the backend session + GPS; watch just mirrors the metrics.
            _phoneControlled = true;
            _isRunning       = true;
            _isPaused        = false;
            _overlayState    = OVERLAY_NONE;
            _elapsedMs       = 0; _elapsedTime = 0;
            _distance        = 0.0; _dispDistance = 0.0;
            _pace            = 0.0; _dispPace    = 0.0;
            _gpsStreamTick   = 0;
            _vibeShort();
            Ui.requestUpdate();

        } else if (t.equals("preparedRun")) {
            var dist = data.get("distance");
            var rt   = data.get("runType");
            var wt   = data.get("workoutType");
            var tp   = data.get("targetPace");
            var wd   = data.get("workoutDesc");
            if (dist != null) { _prepRunDist     = dist.toFloat(); }
            if (rt   != null) { _prepRunType     = rt; }
            if (wt   != null) { _prepWorkoutType = wt; }
            if (tp   != null) { _prepTargetPace  = tp; _coachTargetPace = tp; _coachTargetPaceSec = _parsePace(tp); _isCoached = true; }
            if (wd   != null) { _prepWorkoutDesc = wd; }
            if (!_isRunning) {
                _overlayState = _gpsReady ? OVERLAY_COACHED : OVERLAY_GPS_WAIT;
            }
            Ui.requestUpdate();

        } else if (t.equals("disconnect")) {
            // Mid-run disconnect (Scenario B -> C): start standalone session so data is not lost.
            var midRun = _isConnected && _isRunning && !_phoneControlled;
            _isConnected = false;
            if (midRun && _dataStreamer != null) {
                _dataStreamer.prepareSession();
                setStatusMessage("Phone lost - saving offline");
            }
            Ui.requestUpdate();

        } else if (t.equals("runUpdate")) {
            // When the PHONE started the run (_phoneControlled), mirror all phone metrics.
            // When the WATCH started the run (!_phoneControlled), the watch own Activity.Info
            // data (actInfo.timerTime, actInfo.elapsedDistance, etc.) is authoritative — do NOT
            // overwrite those with phone-calculated values which run on a different clock and
            // may include early phone-GPS noise.  Only sync run-state flags so the watch stays
            // in step if the phone pauses or stops the session.
            if (_phoneControlled) {
                var pv = data.get("pace");        if (pv != null) { _pace        = pv.toFloat(); }
                var dv = data.get("distance");    if (dv != null) { _distance    = dv.toFloat(); }
                var hv = data.get("hr");          if (hv != null) { _heartRate   = hv.toNumber(); _heartRateZone = _hrZone(_heartRate); }
                var tv = data.get("elapsedTime"); if (tv != null) { _elapsedTime = tv.toNumber(); _elapsedMs = _elapsedTime * 1000; }
                var cv = data.get("cadence");     if (cv != null) { _cadence     = cv.toNumber(); }
            }
            // State flags always honoured — phone can pause/stop regardless of who started
            var rv = data.get("isRunning");   if (rv != null) { _isRunning   = rv; }
            var uv = data.get("isPaused");    if (uv != null) { _isPaused    = uv; }
            if (_isRunning) { _overlayState = OVERLAY_NONE; }
            Ui.requestUpdate();

        } else if (t.equals("statusMessage")) {
            var msg = data.get("message");
            if (msg != null) { setStatusMessage(msg); _vibeShort(); Ui.requestUpdate(); }

        } else if (t.equals("coachingCue")) {
            // Coaching audio plays through phone/headphones only — no text on watch.
            // Single haptic pulse so the runner knows a cue was delivered.
            _vibeShort();

        } else if (t.equals("sessionEnded")) {
            // Phone ended the session (Scenario A) - clean up all watch resources.
            _isRunning        = false;
            _isPaused         = false;
            _phoneControlled  = false;
            _sessionReadySent = false;  // Allow next session to send sessionReady again
            _overlayState     = OVERLAY_READY;
            if (_gpsListening) {
                Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
                _gpsListening = false;
            }
            Sensor.enableSensorEvents(null);
            _stopSession();
            _vibeLong();
            Ui.requestUpdate();
        }
    }

    // ── Timer tick (250 ms) ───────────────────────────────────────────────────

    function onTick() as Void {
        try {
        _dotCount = (_dotCount + 1) % 4;
        // Grace period: count up for first 8s so UI does not flash OFFLINE before auth arrives
        if (_connectWaitTicks < CONNECT_WAIT_MAX) { _connectWaitTicks += 1; }

        // ── Read native Garmin Activity metrics (standalone mode) ──────────────
        // Activity.getActivityInfo() returns the same values the Garmin native Run
        // app shows — Kalman-filtered GPS distance, smoothed speed→pace, cadence,
        // and HR straight from the firmware.  Only use when we own the session.
        if (!_phoneControlled && _isRunning) {
            var actInfo = Activity.getActivityInfo();
            if (actInfo != null) {
                // Distance (meters) — Garmin's filtered GPS accumulation
                if (actInfo.elapsedDistance != null) {
                    _distance = actInfo.elapsedDistance.toFloat();
                }
                // Pace (sec/km) — derived from Garmin's Kalman-filtered speed.
                // Lower bound  0.3 m/s (~1 km/h)  rejects near-stationary GPS noise.
                // Upper bound  5.5 m/s (~3:02/km) rejects spike artefacts at startup
                // and during GPS re-acquisition that would otherwise bias the buffer.
                if (actInfo.currentSpeed != null
                        && actInfo.currentSpeed > 0.3
                        && actInfo.currentSpeed <= 5.5) {
                    _pace = 1000.0 / actInfo.currentSpeed.toFloat();
                } else if (!_isPaused) {
                    _pace = 0.0;
                }
                // Heart rate
                if (actInfo.currentHeartRate != null && actInfo.currentHeartRate > 0) {
                    _heartRate     = actInfo.currentHeartRate.toNumber();
                    _heartRateZone = _hrZone(_heartRate);
                }
                // Cadence (steps per minute)
                if (actInfo.currentCadence != null) {
                    _cadence = actInfo.currentCadence.toNumber();
                }
                // Elapsed timer (ms → seconds, pauses when session is paused)
                if (actInfo.timerTime != null) {
                    _elapsedTime = (actInfo.timerTime / 1000).toNumber();
                    _elapsedMs   = actInfo.timerTime.toNumber();
                }
                // ── Running Dynamics (Fenix 6+/FR945+ only, null on unsupported devices) ──
                if (actInfo has :currentGroundContactTime && actInfo.currentGroundContactTime != null) {
                    _gct = actInfo.currentGroundContactTime.toFloat();
                }
                if (actInfo has :currentGroundContactBalance && actInfo.currentGroundContactBalance != null) {
                    _gcb = actInfo.currentGroundContactBalance.toFloat();
                }
                if (actInfo has :currentVerticalOscillation && actInfo.currentVerticalOscillation != null) {
                    _vo = actInfo.currentVerticalOscillation.toFloat();  // millimetres
                }
                if (actInfo has :currentVerticalRatio && actInfo.currentVerticalRatio != null) {
                    _vr = actInfo.currentVerticalRatio.toFloat();
                }
                if (actInfo has :currentStrideLength && actInfo.currentStrideLength != null && actInfo.currentStrideLength > 0) {
                    _sl = actInfo.currentStrideLength.toFloat();
                }
                // ── Running Power (device-dependent) ──────────────────────────
                if (actInfo has :currentPower && actInfo.currentPower != null && actInfo.currentPower > 0) {
                    _power = actInfo.currentPower.toNumber();
                }
                // ── Respiration Rate (Fenix 7 / FR965 series) ─────────────────
                if (actInfo has :currentRespirationRate && actInfo.currentRespirationRate != null && actInfo.currentRespirationRate > 0) {
                    _respRate = actInfo.currentRespirationRate.toFloat();
                }
                // ── Training Effect (updated periodically by firmware) ─────────
                if (actInfo has :trainingEffect && actInfo.trainingEffect != null && actInfo.trainingEffect > 0) {
                    _ate = actInfo.trainingEffect.toFloat();
                }
                if (actInfo has :anaerobicTrainingEffect && actInfo.anaerobicTrainingEffect != null && actInfo.anaerobicTrainingEffect > 0) {
                    _anate = actInfo.anaerobicTrainingEffect.toFloat();
                }
            }
        }

        // ── Smoothed display values ────────────────────────────────────────────
        // Pace uses the 5-second rolling history buffer to suppress GPS jitter
        // spikes.  Previously _dispPace was set directly from raw _pace which
        // allowed brief noise readings (e.g. actInfo.currentSpeed = 8 m/s when
        // near-stationary) to show as absurdly fast pace like "2.04 min/km".
        if (_pace > 0.0) {
            // Resuming after a stop: flush stale buffer entries so old pre-stop
            // readings don't bias the average for the new effort.
            if (_stoppedTicks >= 3) {
                _paceHistory = [];
                _paceHistoryIdx = 0;
            }
            _stoppedTicks = 0;
            // Circular buffer: avoid Array.slice() allocation every tick
            if (_paceHistory.size() < _paceHistoryMax) {
                _paceHistory.add(_pace);
            } else {
                _paceHistory[_paceHistoryIdx] = _pace;
                _paceHistoryIdx = (_paceHistoryIdx + 1) % _paceHistoryMax;
            }
            _dispPace = _smoothedPace();
        } else {
            // Stopped / GPS lost.
            // Hold the last displayed pace for 2 ticks (brief natural fade),
            // then snap to 0.0 so the display shows "--" instead of counting
            // down through decreasing pace values towards zero.
            _stoppedTicks += 1;
            if (_stoppedTicks > 2) {
                _dispPace = 0.0;
            }
            // else: _dispPace is held unchanged — shows last valid reading briefly
        }
        _dispDistance = _dispDistance + (_distance - _dispDistance) * 0.20;
        _dispHR       = (_dispHR + (_heartRate - _dispHR) * 0.30).toNumber();
        _dispCadence  = (_dispCadence + (_cadence  - _dispCadence) * 0.30).toNumber();

        if (_statusTicks > 0) {
            _statusTicks -= 1;
            if (_statusTicks <= 0) { _statusMessage = ""; }
        }

        // Accumulate stats + offline buffer for ALL non-phone-controlled runs.
        //
        // Previously guarded by !_isConnected — which was wrong. _isConnected stays
        // TRUE after any auth, so standalone runs were silently dropped.  We now ALWAYS
        // accumulate stats and fill the offline buffer when the watch owns the run.
        // HTTP streaming to backend only happens when offline (!_isConnected), so there
        // is no double-reporting when the phone is also tracking via BT.
        if (!_phoneControlled && _isRunning && !_isPaused) {
            _sampleN += 1;
            if (_heartRate > 0) {
                _sumHR += _heartRate;
                if (_heartRate > _maxHR) { _maxHR = _heartRate; }
            }
            if (_cadence > 0)   { _sumCadence += _cadence; }
            if (_pace > 0.0)    { _sumPace    += _pace; }
            if (_gct > 0.0)     { _sumGct     += _gct; }
            if (_vo > 0.0)      { _sumVo      += _vo; }
            if (_vr > 0.0)      { _sumVr      += _vr; }
            if (_sl > 0.0)      { _sumSl      += _sl; }
            if (_gcb > 0.0)     { _sumGcb     += _gcb; }
            if (_power > 0)     { _sumPower   += _power; }
            if (_respRate > 0.0){ _sumResp    += _respRate; }
            // Elevation gain/loss tracking.
            // Prefer barometric altitude (_baroAlt) over GPS altitude (_lastGpsAlt):
            //   - GPS altitude accuracy is typically +/-5-10 m -- tiny positive spikes
            //     accumulate into massive false elevation gain over a run.
            //   - Barometric altimeter (if present) is accurate to ~1 m and uses
            //     sensor fusion, giving far more reliable cumulative ascent figures.
            // Noise thresholds:
            //   - Baro: 1.5 m  -- filters sensor noise while capturing real hills.
            //   - GPS fallback: 5.0 m -- filters GPS altitude noise.
            var altSrc       = (_baroAlt != null) ? _baroAlt : _lastGpsAlt;
            var altThreshold = (_baroAlt != null) ? 1.5 : 5.0;
            if (altSrc != null) {
                if (_lastAlt != null) {
                    var altDelta = altSrc - _lastAlt;
                    if (altDelta >  altThreshold) { _totalAscent  += altDelta; }
                    if (altDelta < -altThreshold) { _totalDescent -= altDelta; }
                }
                _lastAlt = altSrc;
            }

            // ── Offline buffer capture (every 15 s, ALL non-phone-controlled runs) ──
            // Buffer unconditionally — regardless of _isConnected.  This is a safety
            // net: if the phone's RunTrackingService failed to start (Android 12+ bg
            // restriction) or BT dropped during the run, the offline batch is the only
            // record.  The backend's upload-batch endpoint is find-or-create and has
            // phone-run dedup logic, so this NEVER creates a duplicate when the phone
            // also tracked the run successfully.
            // Cost: 1 compact Array per 15 s, max 360 pts = ~10 KB heap. Negligible.
            if (!_isPaused) {
                _offlineTicks += 1;
                if (_offlineTicks >= OFFLINE_TICK_INTERVAL) {
                    _offlineTicks = 0;
                    if (_offlineBuffer.size() < OFFLINE_MAX_POINTS) {
                        // Encode to compact integers to minimise heap
                        var latE5  = (_lastGpsLat != null) ? (_lastGpsLat * 100000.0).toNumber() : 0;
                        var lngE5  = (_lastGpsLng != null) ? (_lastGpsLng * 100000.0).toNumber() : 0;
                        var altDm  = (_lastGpsAlt != null) ? (_lastGpsAlt * 10.0).toNumber()     : 0;
                        var paceDs = (_pace > 0.0)          ? (_pace * 10.0).toNumber()           : 0;
                        _offlineBuffer.add([_elapsedTime, latE5, lngE5, altDm, _heartRate, _cadence, paceDs]);
                    } else if (!_offlineBufferFull) {
                        _offlineBufferFull = true;
                        setStatusMessage("Offline buffer full - 90min");
                    }
                }
            }

            // HTTP stream ONLY when offline. When phone is connected, it receives data
            // via BT watchData messages — no need to double-report via HTTP relay.
            if (!_isConnected) {
            _streamAccumMs += _tickMs;
            if (_streamAccumMs >= 1000) {
                _streamAccumMs = 0;
                if (_dataStreamer != null) {
                    _dataStreamer.sendData({
                        // Core metrics
                        "heartRate"             => _heartRate,
                        "heartRateZone"         => _heartRateZone,
                        "distance"              => _distance,
                        "pace"                  => _pace,
                        "cadence"               => _cadence,
                        "elapsedTime"           => _elapsedTime,
                        // Running dynamics
                        "groundContactTime"     => _gct,
                        "groundContactBalance"  => _gcb,
                        "verticalOscillation"   => _vo,
                        "verticalRatio"         => _vr,
                        "strideLength"          => _sl,
                        // Power & respiration
                        "runningPower"          => _power,
                        "respirationRate"       => _respRate,
                        // Training effect
                        "aerobicTE"             => _ate,
                        "anaerobicTE"           => _anate,
                        // Cumulative elevation (sent every second so backend fallback
                        // path always has ascent/descent even if endSession is missed)
                        "cumulativeAscent"      => _totalAscent,
                        "cumulativeDescent"     => _totalDescent
                    });
                }
            }
            } // end !_isConnected HTTP stream
        }

        if (_isConnected && _isRunning && !_isPaused) { // Stream GPS to phone only when connected (saves BT in Scenario C)
            _gpsStreamTick += 1;
            if (_gpsStreamTick >= 8 && _lastGpsLat != null && _lastGpsLng != null) {
                _gpsStreamTick = 0;
                _phoneLink.sendRunData({
                    // GPS
                    "lat"   => _lastGpsLat,
                    "lng"   => _lastGpsLng,
                    "alt"   => _lastGpsAlt,
                    "baroAlt" => _baroAlt,
                    "speed" => _lastGpsSpeed,
                    "bear"  => _lastGpsSpeed > 0 ? _lastGpsSpeed : null,
                    "acc"   => _gpsQuality,
                    // Core biometrics
                    "hr"    => _heartRate,
                    "hrz"   => _heartRateZone,
                    "cad"   => _cadence,
                    "elap"  => _elapsedTime,
                    // Running dynamics
                    "gct"   => _gct,
                    "gcb"   => _gcb,
                    "vo"    => _vo,
                    "vr"    => _vr,
                    "sl"    => _sl,
                    // Power & respiration
                    "pwr"   => _power,
                    "resp"  => _respRate,
                    // Training effect
                    "te"    => _ate,
                    "ate"   => _anate
                });
            }
        }

        Ui.requestUpdate();
        } catch (e) {
            Sys.println("onTick ERR: " + e.toString());
        }
    }

    private function _smoothedPace() {
        if (_paceHistory.size() == 0) { return 0.0; }
        var sum = 0.0;
        for (var i = 0; i < _paceHistory.size(); i++) { sum += _paceHistory[i]; }
        return sum / _paceHistory.size();
    }

    // ── Sensors / GPS ─────────────────────────────────────────────────────────

    function onPosition(info as Pos.Info) as Void {
        // Track GPS quality for the GPS-wait overlay
        if (info.accuracy != null) {
            _gpsQuality = info.accuracy;
            var wasReady = _gpsReady;
            // "Ready" for standalone = quality 3+ (Usable); connected = 2+ (Last known)
            _gpsReady = (_gpsQuality >= (_isConnected ? 2 : 3));
            if (_gpsReady && !wasReady && !_isRunning) {
                if (_overlayState == OVERLAY_GPS_WAIT) {
                    _overlayState = (_isCoached || _prepRunType.length() > 0)
                        ? OVERLAY_COACHED : OVERLAY_READY;
                }
                _vibeShort();
                // Notify phone that the watch session is fully ready
                // (authenticated + GPS locked) — phone will fire a push notification
                if (_isAuthenticated && !_sessionReadySent) {
                    _phoneLink.sendCommand("sessionReady");
                    _sessionReadySent = true;
                }
            }
        }
        // Update GPS-lost counter during a run so the status bar can warn the user
        if (_isRunning && !_isPaused) {
            if (_gpsQuality < 2) {
                if (_gpsLostTicks < GPS_LOST_THRESHOLD + 1) { _gpsLostTicks += 1; }
            } else {
                if (_gpsLostTicks > 0) { _gpsLostTicks = 0; }
            }
        } else {
            _gpsLostTicks = 0;
        }

        // Cache raw GPS coordinates for phone streaming only.
        // Metrics (distance, pace) come from Activity.getActivityInfo() in onTick.
        if (info.position != null) {
            var deg = info.position.toDegrees();
            _lastGpsLat = deg[0];
            _lastGpsLng = deg[1];
            _lastGpsAlt = info.altitude;
            if (info.speed != null) { _lastGpsSpeed = info.speed; }
            if (!_phoneControlled && info.altitude != null && _dataStreamer != null) {
                _dataStreamer.updateGPS(_lastGpsLat, _lastGpsLng, info.altitude);
            }
        }
    }

    function onSensor(info as Sensor.Info) as Void {
        // Activity.getActivityInfo() is the primary source for HR and cadence
        // in standalone mode.  onSensor provides a fallback for older devices
        // or when Activity.Info fields are null.
        if (!_phoneControlled) {
            // Values will be overwritten by Activity.Info in onTick if available
            if (info.heartRate != null && info.heartRate > 0) {
                _heartRate     = info.heartRate;
                _heartRateZone = _hrZone(_heartRate);
            }
            if (info.cadence != null) { _cadence = info.cadence; }
        }
        // Barometric altimeter — available on Fenix/FR965 even without GPS lock
        if (info has :altitude && info.altitude != null) {
            _baroAlt = info.altitude;
        }
    }

    // ==========================================================================
    // DRAWING — Elite Diamond Grid
    // ==========================================================================

    function onUpdate(dc) {
        var w  = dc.getWidth();
        var h  = dc.getHeight();
        var cx = w / 2;
        var cy = h / 2;

        // ── Light grey background ──────────────────────────────────────────────
        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
        dc.clear();
        // Smooth anti-aliased rendering (SDK 3.2+, supported on Fenix 7)
        if (dc has :setAntiAlias) { dc.setAntiAlias(true); }

        if (_overlayState == OVERLAY_GPS_WAIT) { _drawGpsWait(dc, cx, cy, w, h); return; }
        if (_overlayState == OVERLAY_WAITING)  { _drawWaiting(dc, cx, cy, w, h); return; }

        if (!_isRunning && !_isPaused) { _drawStartHint(dc, cx, cy, w); }
        _drawTimeTop(dc, cx, w, h);
        var ringR = (w * 0.255).toNumber();
        var circR = (w * 0.168).toNumber();
        _drawRing(dc, cx - ringR, cy, circR, 0x00BFA8, "KM",   (_dispDistance / 1000.0).format("%.2f"));
        _drawRing(dc, cx + ringR, cy, circR, 0xFFDD00, "PACE", _fmtPaceDec(_dispPace));
        _drawRing(dc, cx, cy + ringR, circR, 0xFF3355, "HR",   _dispHR > 0 ? _dispHR.format("%d") : "--");
        _drawBattery(dc, cx, cy, ringR, circR);
        _drawStatusBar(dc, cx, w, h);

        // ── Paused banner ──────────────────────────────────────────────────────
        if (_isPaused) {
            dc.setColor(0xFF6600, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.04).toNumber(), Gfx.FONT_TINY,
                "PAUSED", Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    private function _drawTimeTop(dc, cx, w, h) {
        if (_isRunning || _isPaused) {
            // Active run: show DURATION label + elapsed time
            dc.setColor(0x00CC66, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.08).toNumber(), Gfx.FONT_XTINY, "DURATION", Gfx.TEXT_JUSTIFY_CENTER);
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.14).toNumber(), Gfx.FONT_LARGE, _fmtTime(_elapsedTime), Gfx.TEXT_JUSTIFY_CENTER);
        } else {
            // Idle: show current clock time (24h), no label
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.09).toNumber(), Gfx.FONT_LARGE, _fmtClock(), Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    private function _drawRing(dc, x, y, r, color, label, value) {
        dc.setColor(color, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(x, y, r - 1);
        dc.drawCircle(x, y, r);
        dc.drawCircle(x, y, r + 1);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(x, y - 21, Gfx.FONT_XTINY, label, Gfx.TEXT_JUSTIFY_CENTER);
        dc.drawText(x, y - 7,  Gfx.FONT_MEDIUM, value, Gfx.TEXT_JUSTIFY_CENTER);
    }

    private function _drawBattery(dc, cx, cy, ringR, circR) {
        if (!(Sys has :getSystemStats)) { return; }
        var stats = Sys.getSystemStats();
        if (stats == null)         { return; }
        if (stats.battery == null) { return; }  // Some firmware returns non-null stats but null battery
        var bat = stats.battery.toNumber();
        if (bat < 0)   { bat = 0; }
        if (bat > 100) { bat = 100; }

        // Position: right of bottom HR ring
        var bx  = (cx + circR + 8).toNumber();
        var by  = (cy + ringR - 6).toNumber();
        var bw  = 22;   // body width
        var bh  = 12;   // body height
        var tw  = 3;    // terminal width
        var th  = 6;    // terminal height

        // Colour: green normal, amber <50%, red <20%
        var col = 0x00CC66;
        if (bat < 50) { col = 0xFFAA00; }
        if (bat < 20) { col = 0xFF4444; }

        // Battery body outline
        dc.setColor(0x888888, Gfx.COLOR_TRANSPARENT);
        dc.drawRectangle(bx, by, bw, bh);

        // Terminal nub (right side, centred vertically)
        dc.setColor(0x888888, Gfx.COLOR_TRANSPARENT);
        dc.fillRectangle(bx + bw, by + (bh - th) / 2, tw, th);

        // Charge fill
        var fillW = ((bw - 2) * bat / 100).toNumber();
        if (fillW > 0) {
            dc.setColor(col, Gfx.COLOR_TRANSPARENT);
            dc.fillRectangle(bx + 1, by + 1, fillW, bh - 2);
        }
        // Percentage text below icon
        dc.setColor(0x888888, Gfx.COLOR_TRANSPARENT);
        dc.drawText(bx + bw / 2, by + bh + 2, Gfx.FONT_XTINY, bat.format("%d") + "%", Gfx.TEXT_JUSTIFY_CENTER);
    }


    private function _drawStatusBar(dc, cx, w, h) {
        var y = (h * 0.82).toNumber();
        if (_statusMessage.length() > 0) {
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, _statusMessage, Gfx.TEXT_JUSTIFY_CENTER);
        } else if (_isRunning && _gpsLostTicks >= GPS_LOST_THRESHOLD) {
            // GPS signal lost during an active run — amber warning
            dc.setColor(0xFFAA00, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, "GPS LOST", Gfx.TEXT_JUSTIFY_CENTER);
        } else if (!_isRunning && !_isConnected && _isAuthenticated && _connectWaitTicks >= CONNECT_WAIT_MAX) {
            // Offline mode: amber notice so user knows charts are limited
            // Guard with grace period so the label does not flash before auth arrives
            dc.setColor(0xFFAA00, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, "OFFLINE", Gfx.TEXT_JUSTIFY_CENTER);
        } else if (!_isRunning) {
            dc.setColor(0x555555, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, "PRESS START", Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    // ── GPS Wait Screen ──────────────────────────────────────────────────────
    private function _drawGpsWait(dc, cx, cy, w, h) {
        // Green outer ring
        dc.setColor(0x00AA55, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, (w / 2) - 4);
        dc.drawCircle(cx, cy, (w / 2) - 5);

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.10).toNumber(), Gfx.FONT_TINY, "AI RUN COACH", Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawLine((w * 0.2).toNumber(), (h * 0.22).toNumber(), (w * 0.8).toNumber(), (h * 0.22).toNumber());

        dc.setColor(0x0088CC, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.27).toNumber(), Gfx.FONT_MEDIUM, "GPS", Gfx.TEXT_JUSTIFY_CENTER);

        // Signal bars
        var barW = 10; var barGap = 5;
        var bx0 = cx - (4 * barW + 3 * barGap) / 2;
        var baseY = (h * 0.52).toNumber();
        var barCols = [0xF44336, 0xFFD740, 0x00E676, 0x00E676];
        for (var b = 0; b < 4; b++) {
            var barH = 6 + b * 6;
            var bx = bx0 + b * (barW + barGap);
            var lit = (_gpsQuality > b);
            dc.setColor(lit ? barCols[b] : 0xBBBBBB, Gfx.COLOR_TRANSPARENT);
            dc.fillRectangle(bx, baseY - barH, barW, barH);
            if (lit) { dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT); dc.drawRectangle(bx, baseY - barH, barW, barH); }
        }

        var qLabels = ["No signal", "Last known", "Poor", "Usable", "Good"];
        dc.setColor(_gpsQuality >= 3 ? 0x00AA55 : Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.57).toNumber(), Gfx.FONT_XTINY, (_gpsQuality <= 4) ? qLabels[_gpsQuality] : "Searching", Gfx.TEXT_JUSTIFY_CENTER);

        var dots = ""; for (var i = 0; i < _dotCount; i++) { dots = dots + "."; }
        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.66).toNumber(), Gfx.FONT_TINY, "Acquiring" + dots, Gfx.TEXT_JUSTIFY_CENTER);
        dc.drawText(cx, (h * 0.75).toNumber(), Gfx.FONT_XTINY, "Stand still outdoors", Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(0xFF6600, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.84).toNumber(), Gfx.FONT_XTINY, "START disabled", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ── Waiting for Phone Screen ──────────────────────────────────────────────
    private function _drawWaiting(dc, cx, cy, w, h) {
        dc.setColor(0x00AA55, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, (w / 2) - 4);
        dc.drawCircle(cx, cy, (w / 2) - 5);

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.10).toNumber(), Gfx.FONT_TINY, "AI RUN COACH", Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawLine((w * 0.2).toNumber(), (h * 0.22).toNumber(), (w * 0.8).toNumber(), (h * 0.22).toNumber());

        var dots = ""; for (var i = 0; i < _dotCount; i++) { dots = dots + "."; }
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - 22, Gfx.FONT_SMALL, "Waiting" + dots, Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 8,  Gfx.FONT_XTINY, "Open Ai Run Coach on your", Gfx.TEXT_JUSTIFY_CENTER);
        dc.drawText(cx, cy + 22, Gfx.FONT_XTINY, "phone to connect.", Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(0x00AA55, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 40, Gfx.FONT_XTINY, "You only need to do this once.", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // ── Start hint: green half-moon at top-right button + play icon ──────────
    // Button is at ~1 o'clock position (Garmin angle ~60°, counter-clockwise from 3 o'clock)
    private function _drawStartHint(dc, cx, cy, w) {
        var rimR = (w / 2 - 1).toNumber();

        // Thick green crescent arc from 32° to 88° (upper-right, around the START button)
        dc.setColor(0x00E676, Gfx.COLOR_TRANSPARENT);
        for (var i = 0; i < 6; i++) {
            dc.drawArc(cx, cy, rimR - i, Gfx.ARC_COUNTER_CLOCKWISE, 32, 88);
        }

        // Play triangle inset from the arc midpoint (60°)
        var ang  = 60.0 * Math.PI / 180.0;
        var inR  = (rimR - 16).toNumber();
        var px   = cx + (inR.toFloat() * Math.cos(ang)).toNumber();
        var py   = cy - (inR.toFloat() * Math.sin(ang)).toNumber();
        var ts   = 7;
        // Right-pointing triangle: tip at (px+ts, py), base on left
        dc.setColor(0x00E676, Gfx.COLOR_TRANSPARENT);
        dc.fillPolygon([[px - ts/2, py - ts], [px + ts, py], [px - ts/2, py + ts]]);
    }

    // ==========================================================================
    // HELPERS
    // ==========================================================================

    // Returns true when App.Storage contains a buffered offline run batch.
    // Used by sendWatchReady() so the phone can show a sync indicator.
    private function _hasPendingOfflineBatch() {
        var sid = App.Storage.getValue("offlineBatchSessionId");
        var pts = App.Storage.getValue("offlineBatchPoints");
        return (sid != null && (pts instanceof Lang.Array) && pts.size() > 0);
    }

    private function _fmtClock() {
        var ct = Sys.getClockTime();
        return ct.hour.format("%02d") + ":" + ct.min.format("%02d");
    }

    private function _fmtTime(secs) {
        var hh = (secs / 3600).toNumber();
        var mm = ((secs % 3600) / 60).toNumber();
        var ss = (secs % 60).toNumber();
        if (hh > 0) { return hh.format("%d") + ":" + mm.format("%02d") + ":" + ss.format("%02d"); }
        return mm.format("%02d") + ":" + ss.format("%02d");
    }

    // Format pace as M.D min/km (1 decimal place)
    private function _fmtPaceDec(secPerKm) {
        if (secPerKm <= 0 || secPerKm > 1200) { return "--" ; }
        return (secPerKm / 60.0).format("%.2f");
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

    // HR zone using personalised max HR (standard 5-zone model matching Garmin/Polar):
    //   Zone 1 <60%, Zone 2 60-70%, Zone 3 70-80%, Zone 4 80-90%, Zone 5 >=90%
    private function _hrZone(hr) {
        if (_maxHr <= 0 || hr <= 0) { return 1; }
        var pct = (hr.toFloat() / _maxHr.toFloat()) * 100.0;
        if (pct < 60) { return 1; }
        if (pct < 70) { return 2; }
        if (pct < 80) { return 3; }
        if (pct < 90) { return 4; }
        return 5;
    }

    private function _haversineMeters(lat1, lon1, lat2, lon2) {
        var R = 6371000.0;
        var dLat = (lat2 - lat1) * Math.PI / 180.0;
        var dLon = (lon2 - lon1) * Math.PI / 180.0;
        var lat1R = lat1 * Math.PI / 180.0;
        var lat2R = lat2 * Math.PI / 180.0;
        var sinDLat = Math.sin(dLat / 2.0);
        var sinDLon = Math.sin(dLon / 2.0);
        var a = sinDLat * sinDLat + Math.cos(lat1R) * Math.cos(lat2R) * sinDLon * sinDLon;
        if (a < 0.0) { a = 0.0; }
        if (a > 1.0) { a = 1.0; }
        var c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
        return R * c;
    }

    private function _startSession() {
        // Defensive: ensure no stale session is left open before creating a new one.
        // A double-open can cause an IQ error on some devices.
        if (_session != null) {
            try {
                if (_session.isRecording()) { _session.stop(); }
                _session.save();
            } catch (e) {
                Sys.println("_startSession: stale session close error");
            }
            _session = null;
        }
        // createSession() can return null on some devices/firmware (another activity already open,
        // low memory, etc.). Guard against null to prevent an unhandled exception / IQ crash.
        try {
            _session = Record.createSession({ :name => "AI Run Coach", :sport => Record.SPORT_RUNNING });
            if (_session == null) {
                Sys.println("_startSession: createSession() returned null — running without FIT recording");
                return;
            }
            _session.start();
        } catch (e) {
            Sys.println("_startSession: createSession/start failed");
            _session = null;
        }
    }

    private function _stopSession() {
        if (_session != null) {
            try {
                if (_session.isRecording()) { _session.stop(); }
                _session.save();
            } catch (e) {
                Sys.println("_stopSession: save failed — " + e.toString());
            }
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
// KEY DESIGN:
//   Physical START button (top-right) → onKey(KEY_ENTER / KEY_START) → start / pause / resume
//   Screen tap                        → onTap()  → "Talk to Coach" during active run, ignored otherwise
//   Screen hold                       → onHold() → always consumed (no action)
//   BACK button                       → onBack() → exit / pause / finish-confirm
//
// We deliberately do NOT override onSelect() because on touchscreen Garmin
// watches (Fenix 7, Venu, etc.) the firmware routes BOTH physical-button AND
// screen-tap events through onSelect(), making it impossible to distinguish
// between them.  Using onKey() + onTap() gives us clean separation.

(:gui)
class RunDelegate extends Ui.BehaviorDelegate {
    private var _view;
    function initialize()      { BehaviorDelegate.initialize(); }
    function setView(v)        { _view = v; }

    // ── Physical START button (top-right) ─────────────────────────────────────
    // onKey() fires ONLY for physical hardware buttons — never for screen taps.
    // KEY_ENTER is the standard mapping for the START/STOP button on all Garmin
    // devices.  We also check KEY_START for older firmware revisions.
    function onKey(keyEvent) {
        var key = keyEvent.getKey();
        if (key == Ui.KEY_ENTER || key == Ui.KEY_START) {
            if (_view == null) { return true; }
            Sys.println(">>> onKey: START button pressed, isRunning=" + _view.isRunning() + " isPaused=" + _view.isPaused());
            if (!_view.isRunning())     { _view.startRun();  }
            else if (_view.isPaused())  { _view.resumeRun(); }
            else                        { _view.pauseRun();  }
            return true;
        }
        return false; // let other keys propagate (e.g. BACK handled by onBack)
    }

    // ── Screen touch ──────────────────────────────────────────────────────────
    // Single tap during an active run = "Talk to Coach" request.
    // Tap before or after a run (ready/finished screens) = ignored.
    // ALWAYS returns true so the tap is consumed and never falls through to
    // onSelect() which would incorrectly start/pause the run.
    function onTap(clickEvent) {
        Sys.println(">>> onTap: screen touched, consuming event (no start/pause)");
        if (_view != null && _view.isRunning() && !_view.isPaused()) {
            _view.requestTalkToCoach();
        }
        return true; // always consume — screen touches must NEVER start/pause a run
    }

    function onHold(clickEvent) {
        return true; // consume — do nothing
    }

    // ── Swipe ─────────────────────────────────────────────────────────────────
    // Consume swipes so they don't accidentally trigger any behavior.
    function onSwipe(swipeEvent) {
        return true;
    }

    // ── BACK button ───────────────────────────────────────────────────────────
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

(:gui)
class FinishConfirmDelegate extends Ui.ConfirmationDelegate {
    private var _view;
    function initialize(v) { ConfirmationDelegate.initialize(); _view = v; }
    function onResponse(r) {
        if (r == Ui.CONFIRM_YES && _view != null) { _view.finishRun(); }
        return true;
    }
}
