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
    // True only once the phone has actually sent a real personalised maxHr (i.e. the
    // user has a known age/DOB). Stays false for users who never set one — in that case
    // _maxHr above is just a placeholder and must NOT be used to compute a shown HR zone.
    private var _maxHrKnown      = false;
    // Grace period before showing "OFFLINE" label (lets auth message arrive first)
    private var _connectWaitTicks = 0;
    private const CONNECT_WAIT_MAX = 32; // 32 x 250ms = 8 seconds

    // Wall-clock start of the current session, epoch seconds. The offline batch's GPS points
    // carry ELAPSED seconds only, so without this the backend has no absolute time for a
    // phone-less run and stamps it with the moment the batch arrived — a run done at 7am and
    // synced at 6pm was filed at 6pm, wrong date and wrong slot in trends.
    private var _sessionStartEpoch = 0;
    // True once the phone has sent a prepared run for this session. Drives the status hint so
    // a connected-but-unprepared user is told to prepare on the phone rather than just
    // "PRESS START", which gives away nothing about the better experience available.
    private var _isPrepared        = false;
    // Set when the runner chooses "Continue without coaching" on the prepare-on-phone screen
    // (see isPrepareGateActive()). Reset whenever _isPrepared is, so every new session asks again.
    private var _prepareGateDismissed = false;

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
    private var _isFinished      = false;  // true after run ends — keeps duration visible until next run starts
    private var _phoneControlled = false;

    // Coaching / status
    private var _isCoached          = false;
    private var _coachTargetPace    = "";
    private var _coachTargetPaceSec = 0.0;
    private var _statusMessage      = "";
    private var _statusTicks        = 0;
    // Breadcrumb from _recordCrash() on the PREVIOUS app run, shown once on next open.
    private var _pendingCrashMsg    = null;

    // Infrastructure
    private var _timer        = null;
    private var _dataStreamer = null;
    private var _phoneLink    = null;
    private var _session      = null;
    // Pairing-code fallback (does not depend on ConnectIQ device pairing) — see
    // PairingCodeManager.mc. Null until a code has been requested from the backend.
    private var _pairingCodeManager = null;
    private var _pairingCode        = null;

    // Tracks whether we've already sent sessionReady to the phone this session
    private var _sessionReadySent = false;
    // Set when finishRun() is called — prevents a stale runUpdate from the phone
    // (in-flight before the service stops) restoring _isRunning=true on the watch.
    private var _isFinishing = false;

    // ── Start-command retry ───────────────────────────────────────────────────
    // After the watch sends "command:start" to the phone, it retries if no
    // confirmation arrives. This recovers from BT message drops (fire-and-forget
    // transmit), especially on FR55 where the BT stack is more constrained.
    // Retry is cancelled when the phone sends startAck, startRun, or runUpdate.
    private var _startRetryCount    = 0;
    private var _startRetryTick     = 0;
    private const START_RETRY_MAX      = 3;   // max 3 retries
    private const START_RETRY_INTERVAL = 20;  // 20 x 250ms = 5s between retries

    // ── Stop-command retry ───────────��────────────────────────────────────────
    // After the watch sends "command:stop" to the phone, it retries if no
    // confirmation arrives (stopAck or sessionEnded). This is the primary fix for
    // the "run not completing on phone when finished on watch" bug — ConnectIQ
    // transmit is fire-and-forget; if the single "stop" packet is dropped the
    // phone service keeps running forever and the run is never saved.
    // Retry is cancelled when the phone sends stopAck or sessionEnded.
    private var _stopRetryCount     = 0;
    private var _stopRetryTick      = 0;
    private const STOP_RETRY_MAX      = 6;   // max 6 retries (30s total)
    private const STOP_RETRY_INTERVAL = 20;  // 20 x 250ms = 5s between retries

    // ── Pause/Resume-command retry ──────────────────────────────────────────────
    // pauseRun()/resumeRun() previously sent a single fire-and-forget "pause"/"resume"
    // transmit with no retry, unlike start/stop above. A dropped pause packet leaves the
    // phone's timer and GPS running indefinitely while the watch is genuinely paused —
    // the phone never learns to stop, producing a growing distance/duration gap between
    // the watch and the phone for the rest of the session (reported 2026-09 — Nino, walk
    // session: watch paused correctly, phone app didn't sync and kept the timer running).
    // Mirrors the stop-retry pattern. Only one of pause/resume can be pending at a time;
    // requesting the other one simply overwrites which action gets retried.
    // Retry is cancelled when the phone sends pauseAck / resumeAck.
    private var _pauseResumeRetryCount    = 0;
    private var _pauseResumeRetryTick     = 0;
    private var _pendingPauseResumeAction = null;  // "pause" | "resume" | null
    private const PAUSE_RESUME_RETRY_MAX      = 6;   // max 6 retries (30s total)
    private const PAUSE_RESUME_RETRY_INTERVAL = 20;  // 20 x 250ms = 5s between retries

    // Watch GPS cache
    private var _lastGpsLat    = null;
    private var _lastGpsLng    = null;
    private var _lastGpsAlt    = null;
    private var _baroAlt        = null;   // Barometric altitude from Sensor.SensorInfo (continuous)
    private var _lastGpsSpeed   = 0.0;
    private var _lastGpsBearing = null;   // Degrees 0-360 (converted from Pos.Info.heading radians)
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

    // Screen layout: 0=Diamond, 1=Grid (data-dense/FR55)
    private var _screenPage    = 0;
    private var _isSmallScreen = false;

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
    private var _lastAltIsBaro = false; // Which sensor _lastAlt came from (see elevation block)

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

    // Set to true when App.Storage.setValue("offlineBatchPoints") fails due to
    // storage full.  The buffer is kept in memory so it can be uploaded via BT
    // the moment the phone reconnects, without needing persistent storage at all.
    private var _storageWriteFailed = false;

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
        // DataStreamer flags this (App.Storage, not in-memory) the moment a request comes
        // back 401 mid-run — see DataStreamer._markAuthExpired(). Previously nothing ever
        // consumed that flag, so a stale/invalidated token left the watch stuck forever:
        // _isAuthenticated stayed true, the pairing-code screen (OVERLAY_WAITING) never
        // showed again, and there was no way back in short of uninstalling the app to wipe
        // App.Storage. Consuming it here means the very next app open drops back to
        // OVERLAY_WAITING and re-requests a pairing code automatically.
        if (App.Storage.getValue("authTokenExpired") == true) {
            App.Storage.deleteValue("authToken");
            App.Storage.deleteValue("authTokenExpired");
            tok = null;
        }
        _isAuthenticated = (tok != null && tok.length() > 0);
        _overlayState = _isAuthenticated ? OVERLAY_GPS_WAIT : OVERLAY_WAITING;
        // Constructed here (no Comm calls yet — see DataStreamer.initialize()'s comment on
        // why Comm.makeWebRequest during View construction crashes the app); actually
        // started from onShow() once the Comm subsystem is guaranteed ready.
        _pairingCodeManager = new PairingCodeManager();
        _pairingCodeManager.setCallbacks(method(:_onPairingCodeReceived), method(:_onPairingCodeConfirmed));
        _paceHistory = [];
        // Detect small/MIP screens (FR55=208px) and default to grid
        var ds = Sys.getDeviceSettings();
        _isSmallScreen = (ds.screenWidth <= 218);
        if (_isSmallScreen) { _screenPage = 1; }
        _initSimulatorMode();   // no-op in release, seeds preview data in simulator
        _videoInit();           // no-op outside the (:video) recording build

        // Real Garmin hardware exposes no crash log to sideloaded/dev-mode apps —
        // Sys.println only reaches a USB/simulator console. Surface any breadcrumb
        // left by _recordCrash() on the PREVIOUS run as an on-screen status message
        // so a crash can be diagnosed without a cable. Cleared immediately so it
        // only ever shows once.
        var lastCrash = App.Storage.getValue("lastCrashInfo");
        if (lastCrash != null) {
            App.Storage.deleteValue("lastCrashInfo");
            _pendingCrashMsg = lastCrash;
        }
    }

    // Persist a compact breadcrumb describing an exception so it survives an app
    // crash/relaunch. Called from catch blocks around code paths that were
    // previously unguarded (e.g. onPhoneMessage) — the whole point is to catch
    // and log rather than let the exception propagate and take the app down.
    private function _recordCrash(context, e) {
        _recordBreadcrumb(context + ": " + e.toString());
    }

    // Persist a compact diagnostic breadcrumb — crash OR notable lifecycle event — so it
    // survives an app crash/relaunch. Shares the same storage key/display path as
    // _recordCrash() (see onShow()'s _pendingCrashMsg handling): real hardware exposes no
    // crash log to sideloaded apps, so this is the only way to see what happened without a
    // USB/simulator console.
    private function _recordBreadcrumb(msg) {
        if (msg.length() > 120) { msg = msg.substring(0, 120); }
        Sys.println("CRASH-GUARD " + msg);
        App.Storage.setValue("lastCrashInfo", msg);
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

    // ── Video recording mode ──────────────────────────────────────────────────
    // Built only by monkey_video.jungle (every other jungle excludes :video), for recording
    // the Garmin + iPhone how-to video in the simulator (marketing/how-to-videos).
    // The simulator has no phone and no Activity data, so this plays the real screens in
    // sequence on a timer: pairing code (a real one, from the server) → linked, prepare on
    // phone → session prepared from the phone → GPS lock → START → a 5 km run fed by the
    // same deterministic formula as the iOS app's VideoDemoMode.swift, so the watch and the
    // phone show identical numbers at the same elapsed second → FINISHED.

    private var _videoOn      = false;
    private var _videoStep    = 0;
    private var _videoDueMs   = -1;     // next scripted step (Sys.getTimer ms); -1 = none. Driven
                                        // from onTick — the app is already at the device's timer limit.
    private var _videoStartMs = 0;
    private var _videoSec     = 0;
    private var _videoDist    = 0.0;
    // Seconds to fast-forward the scripted run at START (0 = real time from 00:00). Set to e.g.
    // 1590 to record the finish without a 27-minute take — the numbers are deterministic, so
    // the FINISHED screen is identical either way.
    private const VIDEO_SKIP_SEC = 0;

    (:video)
    private function _videoInit() {
        _videoOn = true;
        App.Storage.deleteValue("authToken");
        _isAuthenticated = false;
        _isRunning       = false;
        _overlayState    = OVERLAY_WAITING;
    }

    // Shows a fixed code instead of requesting one: Comm.makeWebRequest intermittently hangs
    // the whole simulator VM (white screen, never draws) and the video only needs a code the
    // phone recording then types in. Returns true so onShow() skips the real request.
    (:video)
    private function _videoFakeCode() {
        _onPairingCodeReceived("482913");
        return true;
    }

    (:video)
    private function _videoOnCode() {
        if (_videoStep != 0 || _videoDueMs >= 0) { return; }
        Sys.println("VIDEO: code shown, scheduling link");
        _videoSchedule(20000);   // hold on the pairing code while the phone types it in
    }

    (:video)
    private function _videoSchedule(ms) {
        _videoDueMs = Sys.getTimer() + ms;
    }

    (:video)
    private function _videoAdvance() {
        _videoDueMs = -1;
        Sys.println("VIDEO: step " + _videoStep);
        if (_videoStep == 0) {
            // Phone confirmed the code → linked, waiting for a prepare.
            _isAuthenticated  = true;
            _isConnected      = true;
            _connectWaitTicks = CONNECT_WAIT_MAX;
            // The phone's auth carries the runner's max HR (208 − 0.7 × age); without it the
            // HR ring stays neutral with no zone. Same value the phone sends for a 36-year-old.
            _maxHr            = 183;
            _maxHrKnown       = true;
            _pairingCode      = null;
            if (_pairingCodeManager != null) { _pairingCodeManager.cancel(); }
            _overlayState     = OVERLAY_GPS_WAIT;
            _videoStep = 1;
            _videoSchedule(14000);
        } else if (_videoStep == 1) {
            // "Prepare for Watch" tapped on the phone — the real message path.
            _onPhoneMessageInner({ "type" => "preparedRun", "distance" => 5.0, "runType" => "free",
                                   "targetPace" => "5:20", "sessionType" => "run" });
            _videoStep = 2;
            _videoSchedule(7000);
        } else if (_videoStep == 2) {
            _gpsReady   = true;
            _gpsQuality = 4;
            _overlayState = OVERLAY_COACHED;
            _videoStep = 3;
            _videoSchedule(8000);
        } else if (_videoStep == 3) {
            _videoStartMs = Sys.getTimer() - VIDEO_SKIP_SEC * 1000;
            _videoSec  = 0;
            _videoDist = 0.0;
            _videoStep = 4;
            startRun();
        }
        Ui.requestUpdate();
    }

    (:video)
    private function _videoTick() {
        if (!_videoOn) { return; }
        if (_videoDueMs >= 0 && Sys.getTimer() >= _videoDueMs) { _videoAdvance(); }
        if (!_isRunning || _isPaused) { return; }
        var sec = (Sys.getTimer() - _videoStartMs) / 1000;
        var n = 0;   // bounded per tick so a fast-forward catches up over a few ticks (watchdog)
        while (_videoSec < sec && n < 200) {
            _videoSec += 1;
            _videoDist += _videoSpeed(_videoSec);
            n += 1;
        }
        var t = _videoSec.toFloat();
        var spd = _videoSpeed(_videoSec);
        _distance      = _videoDist;
        _pace          = 1000.0 / spd;
        _elapsedTime   = _videoSec;
        _elapsedMs     = _videoSec * 1000;
        var ramp  = (t / 240.0 < 1.0) ? t / 240.0 : 1.0;
        var drift = (t / 1800.0 < 1.0) ? t / 1800.0 : 1.0;
        _heartRate     = (128 + 30 * ramp + 6 * drift + 1.5 * Math.sin(t * 0.37)).toNumber();
        _heartRateZone = _hrZone(_heartRate);
        _cadence       = 170 + Math.round(2 * Math.sin(t * 0.9)).toNumber();
        _gpsLostTicks  = 0;
        _isConnected   = true;
        if (_videoDist >= 5000.0 && !_isFinished) { Sys.println("VIDEO: finished"); finishRun(); }
    }

    // Show exactly what the phone shows at the same elapsed second, instead of the watch's
    // eased display values: distance and HR/cadence unsmoothed, pace = 1000 / mean of the last
    // five 1 Hz speeds (the phone's recentSpeeds window). Lets side-by-side shots match.
    (:video)
    private function _videoDisplay() {
        if (!_videoOn || !_isRunning || _videoSec < 1) { return; }
        _dispDistance = _videoDist;
        _dispHR       = _heartRate;
        _dispCadence  = _cadence;
        var n = (_videoSec < 5) ? _videoSec : 5;
        var sum = 0.0;
        for (var i = 0; i < n; i++) { sum += _videoSpeed(_videoSec - i); }
        _dispPace = 1000.0 / (sum / n);
    }

    // Shared with VideoDemoMode.swift — change both together.
    (:video)
    private function _videoSpeed(sec) {
        var t = sec.toFloat();
        return 3.12 + 0.09 * Math.sin(t / 55.0) + 0.03 * Math.sin(t * 1.7);
    }

    (:novideo) private function _videoInit() {}
    (:novideo) private function _videoFakeCode() { return false; }
    (:novideo) private function _videoOnCode() {}
    (:novideo) private function _videoTick() {}
    (:novideo) private function _videoDisplay() {}

    function setPhoneControlled(v) { _phoneControlled = v; }

    function toggleScreen() {
        _screenPage = (_screenPage == 0) ? 1 : 0;
        Ui.requestUpdate();
    }

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

        // Session type from phone — "walk" or "run". Propagate to DataStreamer so that
        // both the session/start and session/end API calls carry the correct type.
        var st = data.get("sessionType");
        if (st != null && _dataStreamer != null) {
            _dataStreamer.setActivityType(st);
        }
        if (st != null) {
            App.Storage.setValue("sessionType", st);
        }

        // Store plannedWorkoutId so DataStreamer can include it in the session/start payload
        // This is the critical link that lets the backend auto-complete the planned workout
        // when the Garmin activity webhook arrives after the run.
        var pwid = data.get("plannedWorkoutId");
        if (pwid != null) {
            App.Storage.setValue("plannedWorkoutId", pwid);
            Sys.println("setCoachingMode: plannedWorkoutId stored = " + pwid);
        } else {
            App.Storage.deleteValue("plannedWorkoutId");
        }
    }

    function isPaused()  { return _isPaused; }
    function isRunning() { return _isRunning; }

    // ── Prepare-on-phone screen ───────────────────────────────────────────────
    // Shown in place of the start screen while the watch is paired but the phone hasn't sent
    // a prepared session, so it's unmistakable that live AI coaching needs the phone-side
    // prepare. The runner either prepares on the phone (a "preparedRun" message flips
    // _isPrepared and the coached start screen takes over) or explicitly continues without
    // coaching. Hidden on the post-run screen so the final stats stay visible; START from
    // there brings it back rather than silently starting an uncoached run.
    function isPrepareGateActive() {
        return _isAuthenticated && !_isRunning && !_isPaused && !_isPrepared
            && !_prepareGateDismissed && !_isFinished;
    }

    // START (or a tap) on the prepare-on-phone screen.
    function continueWithoutCoaching() {
        _prepareGateDismissed = true;
        // Straight through to the run screen. The GPS-wait screen only advances on the
        // not-ready → ready edge in onPosition(); if GPS locked while this screen was up, that
        // edge has already passed and the runner would sit on "START disabled" with good GPS.
        if (_overlayState == OVERLAY_GPS_WAIT && _gpsReady) {
            _overlayState = (_isCoached || _prepRunType.length() > 0) ? OVERLAY_COACHED : OVERLAY_READY;
        }
        _vibeShort();
        Ui.requestUpdate();
    }

    // START pressed while idle. Returns true if it was consumed by the prepare-on-phone
    // screen (shown or dismissed) instead of starting a run.
    function handleIdleStart() {
        if (isPrepareGateActive()) { continueWithoutCoaching(); return true; }
        if (_isFinished && _isAuthenticated && !_isPrepared && !_prepareGateDismissed) {
            _isFinished = false;    // leave the post-run screen for the prepare screen
            Ui.requestUpdate();
            return true;
        }
        return false;
    }

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
        App.Storage.deleteValue("offlineBatchStartedAt");
    }

    function startRun() {
        Sys.println(">>> startRun() entry — connected=" + _isConnected + " gpsQ=" + _gpsQuality + " auth=" + _isAuthenticated);
        if (_isRunning) { return; }
        _isFinishing = false;  // Ensure clean state at the start of every new run
        // GPS quality gate: require "Usable" (>=3) for standalone, but allow "Last known"
        // (>=2) when phone is connected since phone GPS will be authoritative for the run.
        var minGpsQ = _isConnected ? 2 : 3;
        if (_gpsQuality < minGpsQ) { _vibeShort(); Sys.println(">>> startRun() blocked — gps too low (" + _gpsQuality + " < " + minGpsQ + ")"); return; }
        _isRunning     = true;
        _isPaused      = false;
        _isFinished    = false;  // Clear finished state — new run starting
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
        _totalAscent = 0.0; _totalDescent = 0.0; _lastAlt = null; _lastAltIsBaro = false; _baroAlt = null;

        // Reset offline buffer and HTTP health counter
        _offlineBuffer          = [];
        _offlineTicks           = 0;
        _offlineBufferFull      = false;
        _storageWriteFailed     = false;
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
        _sessionStartEpoch = Time.now().value();
        _startSession();
        Sys.println(">>> startRun() — about to sendCommand start");
        _phoneLink.sendCommand("start");
        // Arm retry: if the phone doesn't acknowledge within START_RETRY_INTERVAL ticks,
        // re-send the command. This recovers from BT message drops on constrained devices
        // (e.g. FR55) where Comm.transmit() is fire-and-forget with no delivery guarantee.
        _startRetryCount = START_RETRY_MAX;
        _startRetryTick  = 0;
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
        // Arm retry: see _pauseResumeRetryCount declaration above.
        _pendingPauseResumeAction = "pause";
        _pauseResumeRetryCount    = PAUSE_RESUME_RETRY_MAX;
        _pauseResumeRetryTick     = 0;
        if (_session != null && _session.isRecording()) { _session.stop(); }
        _vibeShort();
        Ui.requestUpdate();
    }

    function resumeRun() {
        if (!_isPaused) { return; }
        _isPaused = false;
        // Always notify phone, always restart local recording
        _phoneLink.sendCommand("resume");
        // Arm retry: see _pauseResumeRetryCount declaration above. Overwrites any still-
        // pending "pause" retry — resume is now the action that matters.
        _pendingPauseResumeAction = "resume";
        _pauseResumeRetryCount    = PAUSE_RESUME_RETRY_MAX;
        _pauseResumeRetryTick     = 0;
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

    // Wrapped in try/catch (like onTick()/onPhoneMessage() already are) so an unhandled
    // exception anywhere in here can't freeze the watch on the Connect IQ crash screen —
    // this is the "user taps stop/finish" path, so a crash here is exactly what would
    // produce "watch froze while trying to complete the session" with no trace to go on
    // (reported 2026-09 — Nino). _recordCrash() persists a breadcrumb so the next app open
    // surfaces what actually threw, instead of the watch just freezing silently as before.
    function finishRun() {
        try {
            _finishRunInner();
        } catch (e) {
            _recordCrash("finishRun", e);
        }
    }

    private function _finishRunInner() {
        _isFinishing      = true;   // Block stale runUpdates from phone during shutdown
        _isRunning        = false;
        _isPaused         = false;
        _isFinished       = true;   // Keep duration visible after run ends
        _startRetryCount  = 0;      // Cancel any pending start-command retry
        _pauseResumeRetryCount    = 0;   // Cancel any pending pause/resume-command retry
        _pendingPauseResumeAction = null;
        _sessionReadySent = false;  // Reset so next session notifies phone again
        _isPrepared       = false;  // Next session is unprepared until the phone says otherwise
        _prepareGateDismissed = false;
        _overlayState = OVERLAY_READY;
        Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
        _gpsListening = false;
        Sensor.enableSensorEvents(null);
        // Always notify phone, always stop local recording
        _phoneLink.sendCommand("stop");
        // Arm stop-command retry: resend "stop" every STOP_RETRY_INTERVAL ticks
        // until the phone confirms with "sessionEnded" or "stopAck". Recovers from
        // BT delivery failures (ConnectIQ transmit is fire-and-forget).
        _stopRetryCount = STOP_RETRY_MAX;
        _stopRetryTick  = 0;
        _stopSession();

        // ── Save offline buffer so it uploads when phone reconnects ──────────
        // Read sessionId BEFORE endSession() clears it from App.Storage.
        // Guard is now !_phoneControlled (not !_isConnected) because _isConnected stays
        // TRUE after any auth.  We save the batch for ALL non-phone-controlled runs as a
        // backup — the backend upload-batch endpoint deduplicates against phone runs.
        //
        // STORAGE-FULL RESILIENCE — 4-tier cascade, never crashes the app:
        //   Tier 1: save full buffer (up to 360 pts, ~10 KB)
        //   Tier 2: clear old batch to free space, retry full buffer
        //   Tier 3: save compact buffer (every 2nd point = ~5 KB, ~45 min)
        //   Tier 4: save metadata only (no GPS pts, 4 small values)
        //   Fallback: keep in-memory — uploaded via BT on next phone reconnect
        //   All tiers: app continues running, user sees a status message not a crash.
        if (!_phoneControlled && _offlineBuffer.size() > 0) {
            var sid = App.Storage.getValue("sessionId");
            if (sid != null) {
                _storageWriteFailed = false;

                // Write the session ID + scalar metadata first (tiny, almost always fits).
                _safeStorageSet("offlineBatchSessionId", sid);
                _safeStorageSet("offlineBatchDistance",  _distance);
                _safeStorageSet("offlineBatchDuration",  _elapsedTime);
                _safeStorageSet("offlineBatchAscent",    _totalAscent);
                _safeStorageSet("offlineBatchStartedAt",  _sessionStartEpoch);

                // Tier 1: try the full GPS point array.
                var ptsSaved = _safeStorageSet("offlineBatchPoints", _offlineBuffer);

                if (!ptsSaved) {
                    // Tier 2: clear any stale previous batch to free quota, then retry.
                    Sys.println("Storage full (tier1) — clearing old batch, retrying");
                    App.Storage.deleteValue("offlineBatchPoints");
                    ptsSaved = _safeStorageSet("offlineBatchPoints", _offlineBuffer);
                }

                if (!ptsSaved) {
                    // Tier 3: compact — keep only every 2nd point (halves storage cost).
                    Sys.println("Storage full (tier2) — saving compact buffer");
                    var compact = [];
                    for (var i = 0; i < _offlineBuffer.size(); i += 2) {
                        compact.add(_offlineBuffer[i]);
                    }
                    ptsSaved = _safeStorageSet("offlineBatchPoints", compact);
                }

                if (!ptsSaved) {
                    // Tier 4: metadata only — user keeps their stats even without GPS.
                    Sys.println("Storage full (tier3) — GPS points lost, metadata only");
                    App.Storage.deleteValue("offlineBatchPoints");
                    _storageWriteFailed = true;
                    setStatusMessage("Storage full - sync now");
                } else {
                    Sys.println("Offline batch saved: " + _offlineBuffer.size() + " pts, session=" + sid);
                }

                // Notify phone immediately so the sync banner appears without waiting
                // for the 20-minute background service retry.
                try { _phoneLink.sendPendingSync(); } catch (ex) {}
            }
        }

        // Only call DataStreamer.endSession() for STANDALONE watch runs (no phone connection).
        // Call endSession() for ALL watch-initiated runs (!_phoneControlled), regardless of
        // whether auth was received (_isConnected). Previously guarded by !_isConnected, which
        // was wrong: _isConnected stays true after ANY auth, so a watch-started run where the phone
        // "start" command was dropped (BT failure) would silently skip endSession and lose the run.
        // The backend deduplicates against any phone-side record — this is always safe to call.
        if (!_phoneControlled && _dataStreamer != null && _sampleN > 0) {
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
        // Reset AFTER the !_phoneControlled-gated logic above (offline-buffer save,
        // DataStreamer.endSession()) has already run for THIS session using its correct
        // value. _phoneControlled is otherwise only ever written by two phone messages
        // ("startRun" sets true, "sessionEnded" sets false) — stopping a phone-controlled
        // run from the WATCH's own button never reaches "sessionEnded", so without this
        // reset the flag stays stuck true and the very next session (even one started
        // entirely fresh from the watch) is wrongly treated as phone-controlled: no fresh
        // DataStreamer session ID gets generated for it (prepareSession() is skipped), so
        // its data can end up posted under the PREVIOUS session's ID instead of a new one.
        // Confirmed via GarminWatchManager.kt/routes.ts's session/start endpoint, which
        // trusts whatever sessionId the watch sends with no server-side staleness check.
        _phoneControlled = false;
        Ui.requestUpdate();
    }

    function onShow() {
        Sys.println(">>> onShow() — isRunning=" + _isRunning + " phoneControlled=" + _phoneControlled
            + " session=" + (_session != null) + " timerAlreadyAlive=" + (_timer != null));
        _phoneLink.register(method(:onPhoneMessage));
        // Include hasPendingSync so phone dashboard shows a sync indicator, and forward
        // any crash breadcrumb from the previous run so it lands in the phone's logcat.
        _phoneLink.sendWatchReady(_hasPendingOfflineBatch(), _pendingCrashMsg);
        // Also surface it on screen — real hardware has no accessible crash log for
        // sideloaded apps, so this is the only way to see what went wrong without
        // either a USB/simulator console or the phone nearby.
        if (_pendingCrashMsg != null) {
            setStatusMessage("Last crash: " + _pendingCrashMsg);
            _statusTicks = 60; // ~15s — long enough to read/screenshot
            _pendingCrashMsg = null;
        }
        // Kick off the pairing-code fallback in parallel with the BLE "auth" path —
        // whichever completes first wins (see _applyAuthToken). No-ops if already
        // authenticated or already started. Comm subsystem is guaranteed ready here.
        if (!_isAuthenticated && _pairingCodeManager != null && !_videoFakeCode()) {
            _pairingCodeManager.start();
        }
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
        // Guard against a duplicate/overlapping Timer: onHide() no longer stops the
        // timer while a run is active (see below), so if we're re-shown mid-run the
        // existing timer is still alive and must not be replaced.
        if (_timer == null) {
            _timer = new Timer.Timer();
            _timer.start(method(:onTick), _tickMs, true);
        }
    }

    function onHide() {
        Sys.println(">>> onHide() — isRunning=" + _isRunning + " session=" + (_session != null)
            + " gpsListening=" + _gpsListening);
        // Do NOT tear down the timer, GPS, or sensors when a run is active — view may be
        // temporarily hidden by system menu/glance/a Garmin "Move!" alert.  Previously the
        // timer was stopped here UNCONDITIONALLY, contradicting the very next lines' intent:
        // it silently halted onTick() — and therefore all elapsed/distance tracking, phone
        // streaming, and offline-buffer sampling — for the whole duration of any such
        // interruption. Suspected root cause of watch-initiated runs appearing to "freeze".
        // Only clean up when genuinely idle.
        if (!_isRunning) {
            if (_timer != null) { _timer.stop(); _timer = null; }
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

    // PhoneLink routes every BLE message from the phone here with no try/catch of
    // its own — an unhandled exception in _onPhoneMessageInner() used to be a silent
    // IQ crash with zero trace on real hardware. Wrap it and persist a breadcrumb via
    // _recordCrash() so the next app open can show what happened (see onShow()).
    function onPhoneMessage(data) {
        try {
            _onPhoneMessageInner(data);
        } catch (e) {
            var t = (data != null) ? data.get("type") : null;
            _recordCrash("onPhoneMessage:" + ((t != null) ? t.toString() : "?"), e);
        }
    }

    function _onPhoneMessageInner(data) {
        if (data == null) { return; }
        var t = data.get("type");
        if (t == null) { return; }

        if (t.equals("auth")) {
            var tok   = data.get("authToken");
            var rname = data.get("runnerName");
            var mhr   = data.get("maxHr");
            _applyAuthToken(tok, rname, (mhr != null && mhr > 0) ? mhr.toNumber() : null, "ble");
            Ui.requestUpdate();

        } else if (t.equals("startAck")) {
            // Phone confirmed it received the watch's "start" command — cancel retry.
            _startRetryCount = 0;
            Sys.println("Phone startAck received — retry cancelled");

        } else if (t.equals("startRun")) {
            // Scenario A: phone initiates the run — watch acts as companion display.
            // Phone owns the backend session + GPS; watch just mirrors the metrics.
            _startRetryCount = 0;      // Cancel any start-retry (phone confirmed)
            _isFinishing     = false;  // Clean slate for the new session
            _isFinished      = false;  // Clear finished state — new run starting
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
            // A new prepare REPLACES the previous one, it doesn't layer on top. The user can
            // prepare, back out on the phone, change the setup (drop the target time, pick a
            // free run instead of a workout) and prepare again — fields the second prepare
            // leaves out must not keep the first one's values, or the watch coaches to a
            // target pace the runner removed. Only reset while idle, so a stray prepare
            // landing mid-run can't clear the workout link of the session in progress.
            if (!_isRunning) {
                _prepRunDist        = 0.0;
                _prepRunType        = "";
                _prepWorkoutType    = "";
                _prepTargetPace     = "";
                _prepWorkoutDesc    = "";
                _coachTargetPace    = "";
                _coachTargetPaceSec = 0.0;
                _isCoached          = false;
                // Read by DataStreamer's session/start + session/end to link the workout.
                var pwid = data.get("plannedWorkoutId");
                if (pwid != null) {
                    App.Storage.setValue("plannedWorkoutId", pwid);
                } else {
                    App.Storage.deleteValue("plannedWorkoutId");
                }
            }
            if (dist != null) { _prepRunDist     = dist.toFloat(); }
            if (rt   != null) { _prepRunType     = rt; }
            if (wt   != null) { _prepWorkoutType = wt; }
            if (tp   != null) { _prepTargetPace  = tp; _coachTargetPace = tp; _coachTargetPaceSec = _parsePace(tp); _isCoached = true; }
            if (wd   != null) { _prepWorkoutDesc = wd; }

            // Session type from phone — "walk" or "run". Propagate to DataStreamer so that
            // session/start, session/end, and the FIT recording's sport type all match what
            // the user actually selected. This is the live path (setCoachingMode is dead code —
            // only ever called from the unused StartView), so it MUST be handled here.
            var st = data.get("sessionType");
            if (st != null) {
                App.Storage.setValue("sessionType", st);
                if (_dataStreamer != null) { _dataStreamer.setActivityType(st); }
                // Ack so the phone's retry loop (GarminWatchManager.sendSessionType) stops —
                // Comm.transmit() is fire-and-forget with no delivery guarantee otherwise.
                _phoneLink.sendCommand("sessionTypeAck");
            }

            _isPrepared = true;
            if (!_isRunning) {
                _overlayState = _gpsReady ? OVERLAY_COACHED : OVERLAY_GPS_WAIT;
            }
            Ui.requestUpdate();

        } else if (t.equals("preparedRunCancelled")) {
            // The runner backed out of the prepared session on the phone before starting it.
            // Drop it so the prepare-on-phone screen comes back instead of a coached start
            // screen for a session that no longer exists. Ignored mid-run.
            if (!_isRunning && !_isPaused) {
                _isPrepared         = false;
                _prepareGateDismissed = false;
                _prepRunDist        = 0.0;
                _prepRunType        = "";
                _prepWorkoutType    = "";
                _prepTargetPace     = "";
                _prepWorkoutDesc    = "";
                _coachTargetPace    = "";
                _coachTargetPaceSec = 0.0;
                _isCoached          = false;
                App.Storage.deleteValue("plannedWorkoutId");
                if (_overlayState == OVERLAY_COACHED) {
                    _overlayState = _gpsReady ? OVERLAY_READY : OVERLAY_GPS_WAIT;
                }
                Ui.requestUpdate();
            }

        } else if (t.equals("sessionType")) {
            // Lightweight companion to "preparedRun" above — sent as soon as the phone's
            // session-setup screen knows its activity type, NOT gated behind the user
            // explicitly tapping "Prepare Run on Watch". Needed because _startSession()
            // (below) reads "sessionType" from storage synchronously the instant the
            // watch's own physical START button is pressed — if the user never used the
            // explicit prepare-for-watch flow, this is the only message that would have
            // set it, and without it the watch's native Garmin Connect activity silently
            // defaults to Running even when the phone side is correctly showing Walk.
            var sType = data.get("sessionType");
            if (sType != null) {
                App.Storage.setValue("sessionType", sType);
                if (_dataStreamer != null) { _dataStreamer.setActivityType(sType); }
                _phoneLink.sendCommand("sessionTypeAck");
            }

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
            // If the user has already called finishRun(), ignore any in-flight state
            // updates from the phone — they would restore _isRunning=true and trap the
            // watch in a pause/start loop.
            if (_isFinishing) { return; }
            // Phone is active — cancel any pending start-command retry
            if (_startRetryCount > 0) {
                _startRetryCount = 0;
                Sys.println("runUpdate received — start retry cancelled");
            }
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

        } else if (t.equals("pauseAck")) {
            // Phone confirmed it received the "pause" command — cancel retry. Guarded on
            // the pending action still being "pause" so a late ack arriving after the user
            // already resumed doesn't cancel the (now more important) resume retry.
            if (_pendingPauseResumeAction != null && _pendingPauseResumeAction.equals("pause")) {
                _pauseResumeRetryCount    = 0;
                _pendingPauseResumeAction = null;
            }
            Sys.println("Phone pauseAck received — retry cancelled");

        } else if (t.equals("resumeAck")) {
            // Phone confirmed it received the "resume" command — cancel retry (see pauseAck).
            if (_pendingPauseResumeAction != null && _pendingPauseResumeAction.equals("resume")) {
                _pauseResumeRetryCount    = 0;
                _pendingPauseResumeAction = null;
            }
            Sys.println("Phone resumeAck received — retry cancelled");

        } else if (t.equals("stopAck")) {
            // Phone confirmed it received the "stop" command — cancel retry immediately.
            // The full sessionEnded message will follow once the upload completes.
            _stopRetryCount = 0;
            _stopRetryTick  = 0;
            Sys.println("Phone stopAck received — stop retry cancelled");

        } else if (t.equals("sessionEnded")) {
            // Phone ended the session (Scenario A) - clean up all watch resources.
            _stopRetryCount   = 0;      // Phone confirmed session ended — cancel stop retry
            _stopRetryTick    = 0;
            _pauseResumeRetryCount    = 0;   // Session is over — cancel any pause/resume retry too
            _pendingPauseResumeAction = null;
            _isRunning        = false;
            _isPaused         = false;
            _isFinished       = true;   // Keep duration visible after run ends
            _phoneControlled  = false;
            // CRITICAL: set _isFinishing = true FIRST so any runUpdate messages
            // already queued are blocked by the guard at the top of the runUpdate handler.
            // Without this, a late runUpdate arriving after cleanup can restore
            // _isRunning = true, causing onTick() to call Activity.getActivityInfo()
            // on a stopped session — which is a Connect IQ runtime crash.
            _isFinishing      = true;   // Block in-flight runUpdates during cleanup
            _sessionReadySent = false;  // Allow next session to send sessionReady again
            _isPrepared       = false;  // Next session is unprepared until the phone says otherwise
            _prepareGateDismissed = false;
            _overlayState     = OVERLAY_READY;
            if (_gpsListening) {
                Pos.enableLocationEvents(Pos.LOCATION_DISABLE, method(:onPosition));
                _gpsListening = false;
            }
            Sensor.enableSensorEvents(null);
            _stopSession();
            _vibeLong();
            Ui.requestUpdate();
            _isFinishing = false;  // Reset AFTER cleanup — unblocks the next run
        }
    }

    // ── Shared auth-success path ──────────────────────────────────────────────
    // Called from BOTH the BLE "auth" message (ConnectIQ phone pairing, the original
    // path) and PairingCodeManager's confirmed-code callback (the fallback path that
    // doesn't depend on ConnectIQ's device-selection UI at all — see PairingCodeManager.mc
    // for why that hand-off is unreliable). Whichever arrives first wins; calling this
    // twice (e.g. BLE auth arrives after a code was already confirmed) is harmless — every
    // step below is itself idempotent (guarded by _gpsListening / _isRunning checks).
    private function _applyAuthToken(tok, rname, maxHr, source) {
        if (tok == null || tok.length() == 0) { return; }
        App.Storage.setValue("authToken", tok);
        _isAuthenticated  = true;
        _isConnected      = true;
        _connectWaitTicks = CONNECT_WAIT_MAX; // Mark grace period done
        if (maxHr != null && maxHr > 0) { _maxHr = maxHr; _maxHrKnown = true; }
        // Refresh DataStreamer token in case the old one expired mid-session
        if (_dataStreamer != null) { _dataStreamer.setAuthToken(tok); }
        // No further need to poll the backend for a pairing-code confirmation once
        // authenticated via either path — avoid pointless HTTP traffic afterwards.
        if (_pairingCodeManager != null) { _pairingCodeManager.cancel(); }
        if (!_isRunning) {
            if (!_gpsListening) {
                Pos.enableLocationEvents(Pos.LOCATION_CONTINUOUS, method(:onPosition));
                _gpsListening = true;
            }
            _overlayState = _gpsReady ? OVERLAY_READY : OVERLAY_GPS_WAIT;
        }
        Sys.println("Auth received (source=" + source + ") — overlayState=" + _overlayState);
        // Tell the phone which watch app version is installed so the
        // "Watch App Update" notification screen can show the diff.
        _phoneLink.sendHello("3.4.9"); // keep in sync with manifest.xml's iq:application version
        // If GPS was already locked before auth arrived, notify phone now
        if (_gpsReady && !_isRunning && !_sessionReadySent) {
            _phoneLink.sendCommand("sessionReady");
            _sessionReadySent = true;
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
            var pendingStart = App.Storage.getValue("offlineBatchStartedAt");
            _dataStreamer.uploadOfflineBatch(pendingSid, pendingPts, pendingDist, pendingDur, pendingAsc,
                                             pendingStart, _isConnected);
        } else if (pendingSid != null) {
            Sys.println("Discarded corrupt offline batch (wrong type) — keys cleared");
            _clearOfflineBatchStorage();
        }

        // ── In-memory fallback: storage-full runs ────────────────────
        // If the batch save in finishRun() hit the storage quota, the GPS
        // points were kept in _offlineBuffer (in memory) rather than being
        // written to App.Storage.  The phone is now connected, so we upload
        // the buffer via BT immediately — no persistent storage required.
        // This covers the common pattern: run finishes → watch stays on →
        // user walks to phone → reconnects within a few minutes.
        if (_storageWriteFailed && !_isRunning && _offlineBuffer.size() > 0) {
            var memSid = App.Storage.getValue("offlineBatchSessionId");
            if (memSid != null) {
                Sys.println("Storage-full fallback: uploading " + _offlineBuffer.size() + " pts from memory");
                var memDist = App.Storage.getValue("offlineBatchDistance");
                var memDur  = App.Storage.getValue("offlineBatchDuration");
                var memAsc  = App.Storage.getValue("offlineBatchAscent");
                var memStart = App.Storage.getValue("offlineBatchStartedAt");
                _dataStreamer.uploadOfflineBatch(memSid, _offlineBuffer, memDist, memDur, memAsc,
                                                 memStart, _isConnected);
                _storageWriteFailed = false;
            }
        }
    }

    // ── PairingCodeManager callbacks ──────────────────────────────────────────
    // NOT private: passed to PairingCodeManager.setCallbacks() via method(:...),
    // which cannot resolve a private member (same constraint DataStreamer documents
    // for its own Comm.makeWebRequest callbacks).

    function _onPairingCodeReceived(code) {
        _pairingCode = code;
        Sys.println("RunView: pairing code displayed — " + code);
        Ui.requestUpdate();
        _videoOnCode();
    }

    function _onPairingCodeConfirmed(token) {
        // No runnerName/maxHr on this path — the phone already knows who the user is;
        // it isn't sent back over this unauthenticated channel. Both arrive (or get
        // refreshed) via the normal BLE "auth" message once ConnectIQ registers app
        // messages against this now-linked device, same as any other reconnect.
        _applyAuthToken(token, null, null, "pairingCode");
        _pairingCode = null;
        Ui.requestUpdate();
    }

    // ── Timer tick (250 ms) ───────────────────────────────────────────────────

    function onTick() as Void {
        try {
        _dotCount = (_dotCount + 1) % 4;
        // Grace period: count up for first 8s so UI does not flash OFFLINE before auth arrives
        if (_connectWaitTicks < CONNECT_WAIT_MAX) { _connectWaitTicks += 1; }

        // ── Start-command retry (BT drop recovery) ─────────────────────────────
        // If the watch-issued "start" command was dropped (common on FR55 when the
        // phone screen is locked), retry every START_RETRY_INTERVAL ticks.
        // Cancelled by startAck / startRun / runUpdate from the phone.
        if (_isRunning && !_phoneControlled && _startRetryCount > 0) {
            _startRetryTick += 1;
            if (_startRetryTick >= START_RETRY_INTERVAL) {
                _startRetryTick  = 0;
                _startRetryCount -= 1;
                _phoneLink.sendCommand("start");
                Sys.println(">>> startRun retry — " + _startRetryCount + " remaining");
            }
        }

        // ── Stop-command retry (BT drop recovery) ──────────────────────────────
        // If the watch-issued "stop" command was dropped, the phone session stays
        // open indefinitely and the run is never saved. Retry every
        // STOP_RETRY_INTERVAL ticks until the phone acks with stopAck or
        // sessionEnded. Applies for BOTH phone-controlled and standalone runs.
        if (_isFinished && _stopRetryCount > 0) {
            _stopRetryTick += 1;
            if (_stopRetryTick >= STOP_RETRY_INTERVAL) {
                _stopRetryTick  = 0;
                _stopRetryCount -= 1;
                _phoneLink.sendCommand("stop");
                Sys.println(">>> finishRun retry — " + _stopRetryCount + " remaining");
            }
        }

        // ── Pause/Resume-command retry (BT drop recovery) ──────────────────────
        // See _pauseResumeRetryCount declaration above. Cancelled by pauseAck / resumeAck.
        if (_pauseResumeRetryCount > 0 && _pendingPauseResumeAction != null) {
            _pauseResumeRetryTick += 1;
            if (_pauseResumeRetryTick >= PAUSE_RESUME_RETRY_INTERVAL) {
                _pauseResumeRetryTick  = 0;
                _pauseResumeRetryCount -= 1;
                _phoneLink.sendCommand(_pendingPauseResumeAction);
                Sys.println(">>> " + _pendingPauseResumeAction + " retry — " + _pauseResumeRetryCount + " remaining");
            }
        }

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

        _videoTick();

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
        _videoDisplay();

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
            //
            // _lastAlt is an ANCHOR, not "the previous sample". It moves only when the
            // threshold is actually cleared. That distinction is the whole fix: this block
            // used to reassign _lastAlt on EVERY sample, which turned the threshold into a
            // per-sample FILTER instead of a quantiser. A runner climbs roughly 0.1 m per
            // second on a normal gradient, so a 5.0 m per-sample gate demanded a ~5 m jump
            // between two consecutive 1 Hz readings -- physically impossible on foot -- and
            // every genuine climb was therefore discarded, one sub-threshold delta at a time.
            // Real case (2026-09-14): a 13 km run on a watch with no barometer (so the 5.0 m
            // GPS gate applied) saved 9.18 m of total ascent, when its own altitude series
            // spans 16.2 m and its per-km splits sum to far more. Same bug the phone side
            // already documents: "a 2.0m threshold requires a ~66% gradient -- impossible
            // running incline -- so ALL climbing was discarded."
            //
            // Holding the anchor lets a slow, real climb accumulate against it until it clears
            // the gate, bank the whole delta at once, and re-anchor there. Noise still cannot
            // accumulate: it oscillates around the anchor without ever clearing it. Thresholds
            // are unchanged -- they were never the problem, the anchor handling was.
            //
            // The anchor must come from the SAME sensor as the sample it's compared with.
            // _baroAlt is reset to null at session start, so the first ticks anchor on GPS
            // altitude and the source flips to the barometer when its first reading lands.
            // GPS and barometric altitude routinely disagree by tens of metres, and that gap
            // was banked as real climb/descent in one step. Real case (2026-09-29, Forerunner
            // 965): two stationary sessions, 51 s and 0 s, each saved ~42.4 m of descent.
            // A source change now just re-anchors.
            var altIsBaro    = (_baroAlt != null);
            var altSrc       = altIsBaro ? _baroAlt : _lastGpsAlt;
            var altThreshold = altIsBaro ? 1.5 : 5.0;
            if (altSrc != null) {
                if (_lastAlt == null || _lastAltIsBaro != altIsBaro) {
                    _lastAlt = altSrc;
                    _lastAltIsBaro = altIsBaro;
                } else {
                    var altDelta = altSrc - _lastAlt;
                    if (altDelta > altThreshold) {
                        _totalAscent += altDelta;
                        _lastAlt = altSrc;          // re-anchor only on a confirmed climb
                    } else if (altDelta < -altThreshold) {
                        _totalDescent -= altDelta;
                        _lastAlt = altSrc;          // re-anchor only on a confirmed descent
                    }
                    // Otherwise hold the anchor so a gradual change keeps building against it.
                }
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

            // HTTP stream ALWAYS runs for a watch-initiated session, connected or not.
            // Previously gated behind !_isConnected on the assumption that a connected
            // phone already relays everything it needs over BT — but that left the
            // backend (garminRealtimeData, used by RunTrackingService's OS-kill reattach
            // recovery AND by every server-side coaching trigger) with ZERO live data for
            // the common phone-connected case, silently defeating both. The watch is the
            // authoritative data source for a watch-initiated run either way, so it always
            // streams directly — this is what makes the backend, the phone app, and the
            // watch itself consistent, and gives coaching prompts/triggers the full
            // enriched watch dataset (running dynamics, training effect, etc.) regardless
            // of whether BT happens to be connected at any given moment.
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
                        "cumulativeDescent"     => _totalDescent,
                        "isPaused"              => _isPaused
                    });
                }
            }
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
                    "bear"  => _lastGpsBearing,
                    "acc"   => _gpsQuality,
                    // Authoritative session totals from Garmin firmware.
                    // "dist" is Activity.Info.elapsedDistance (metres, Kalman-filtered GPS).
                    // "elap" is Activity.Info.timerTime / 1000 (seconds, pauses with session).
                    // The phone uses these as the source of truth for distance + duration on
                    // watch-initiated runs, eliminating dual-GPS distance divergence.
                    "dist"  => _distance,
                    "elap"  => _elapsedTime,
                    // Core biometrics
                    "hr"    => _heartRate,
                    "hrz"   => _heartRateZone,
                    "cad"   => _cadence,
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
            // Previously logged via Sys.println only, which is unrecoverable on a sideloaded
            // build with no cable attached — a real onTick crash (this is the most likely site
            // for "watch froze/crashed while finishing a session": target-reached, split, and
            // stop-retry logic above all run here every 250ms) left zero trace to investigate
            // (reported 2026-09 — Nino: watch froze on an IQ error screen mid-session, cause
            // unknown). _recordCrash() persists it so the next app open surfaces it on-screen
            // AND forwards it to the phone's Crashlytics via sendWatchReady's lastCrash field.
            _recordCrash("onTick", e);
        }
    }

    private function _smoothedPace() {
        if (_paceHistory.size() == 0) { return 0.0; }
        var sum = 0.0;
        for (var i = 0; i < _paceHistory.size(); i++) { sum += _paceHistory[i]; }
        return sum / _paceHistory.size();
    }

    // ── Sensors / GPS ─────────────────────────────────────────────────────────

    // Registered via method(:onPosition) (Pos.enableLocationEvents) — must stay non-private
    // for Monkey C's indirect symbol lookup to resolve it (same constraint documented on
    // onPhoneMessage/_onStartResponse elsewhere in this codebase). Wrapped in try/catch, like
    // onTick()/onPhoneMessage()/finishRun() already are, so an unhandled exception here can't
    // freeze the watch — this callback fires continuously throughout a run (not just at
    // start/stop), so it's a plausible site for a mid-run freeze with no trace (reported
    // 2026-09 — Nino: watch froze mid-walk, well before any stop was attempted).
    function onPosition(info as Pos.Info) as Void {
        try {
            _onPositionInner(info);
        } catch (e) {
            _recordCrash("onPosition", e);
        }
    }

    private function _onPositionInner(info as Pos.Info) as Void {
        // CRITICAL: Guard against null info on GPS cold start.
        // Garmin fires the callback immediately after Pos.enableLocationEvents() on a cold
        // boot with info = null because no satellite data exists yet.  Accessing info.accuracy
        // on null throws a NullReferenceException -> IQ crash icon.  On a warm GPS (second open)
        // the callback fires with a valid Pos.Info object (quality >= 1 "Last Known"), so the
        // null path is never hit -- explaining the consistent first-open / second-open pattern.
        if (info == null) { return; }
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
            // Heading: Pos.Info.heading is radians (0 = North, clockwise). Convert to degrees 0-360.
            if (info has :heading && info.heading != null) {
                var hdgDeg = info.heading * 180.0 / Math.PI;
                if (hdgDeg < 0) { hdgDeg = hdgDeg + 360.0; }
                _lastGpsBearing = hdgDeg;
            }
            if (!_phoneControlled && info.altitude != null && _dataStreamer != null) {
                _dataStreamer.updateGPS(_lastGpsLat, _lastGpsLng, info.altitude);
            }
        }
    }

    // Registered via method(:onSensor) (Sensor.enableSensorEvents) — must stay non-private
    // for indirect symbol lookup (see onPosition above). Wrapped the same way for the same
    // reason: this fires continuously throughout a run, so it's a plausible mid-run freeze site.
    function onSensor(info as Sensor.Info) as Void {
        try {
            _onSensorInner(info);
        } catch (e) {
            _recordCrash("onSensor", e);
        }
    }

    private function _onSensorInner(info as Sensor.Info) as Void {
        // Activity.getActivityInfo() is the primary source for HR and cadence
        // in standalone mode.  onSensor provides a fallback for older devices
        // or when Activity.Info fields are null.
        //
        // The pause/finish guards matter: onSensor keeps firing whatever the session is
        // doing, and this block used to be gated on !_phoneControlled alone. onTick's
        // Activity.Info read, by contrast, is gated on (!_phoneControlled && _isRunning). So
        // once a run was paused or finished, every metric on the ring screen froze EXCEPT
        // heart rate and cadence, which carried on updating live off the sensor — reported by
        // a beta tester as "the data (HR, pace) started moving on its own, without
        // corresponding to any real movement". Paused means paused: freeze them with
        // everything else.
        //
        // Deliberately NOT gated on _isRunning: before a run starts there is no session to
        // read Activity.Info from, and a live heart rate on the idle screen is genuinely
        // useful (Garmin's own native run app shows one too). The bug was never the idle
        // case — it was metrics moving after the user had stopped them.
        if (!_phoneControlled && !_isPaused && !_isFinished && !_isFinishing) {
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

    // Toybox.WatchUi.View lifecycle override, called by the framework every render — not an
    // indirect method(:...) reference, but wrapped the same way as onPosition/onSensor above
    // for the same reason: it runs continuously throughout a run and is arguably the single
    // most plausible mid-run freeze site (most branching logic of any per-tick callback here).
    function onUpdate(dc) {
        try {
            _onUpdateInner(dc);
        } catch (e) {
            _recordCrash("onUpdate", e);
        }
    }

    private function _onUpdateInner(dc) {
        var w  = dc.getWidth();
        var h  = dc.getHeight();
        var cx = w / 2;
        var cy = h / 2;

        // ── Light grey background ──────────────────────────────────────────────
        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
        dc.clear();
        // Smooth anti-aliased rendering (SDK 3.2+, supported on Fenix 7)
        if (dc has :setAntiAlias) { dc.setAntiAlias(true); }

        if (_overlayState == OVERLAY_WAITING)  { _drawWaiting(dc, cx, cy, w, h); return; }
        if (isPrepareGateActive())             { _drawPrepareGate(dc, cx, cy, w, h); return; }
        if (_overlayState == OVERLAY_GPS_WAIT) { _drawGpsWait(dc, cx, cy, w, h); return; }

        // Route to the correct screen layout
        if (_screenPage == 1) {
            _drawGridScreen(dc, cx, cy, w, h);
        } else {
            if (!_isRunning && !_isPaused) { _drawStartHint(dc, cx, cy, w); }
            _drawTimeTop(dc, cx, w, h);
            var ringR = (w * 0.255).toNumber();
            var circR = (w * 0.168).toNumber();
            _drawRing(dc, cx - ringR, cy, circR, 0x00BFA8, "KM",   (_dispDistance / 1000.0).format("%.2f"));
            _drawRing(dc, cx + ringR, cy, circR, 0xFFDD00, "PACE", _fmtPace(_dispPace));
            // Only show a zone number / zone-coloured ring once we have BOTH a real
            // personalised max HR (user has a known age/DOB) AND a live HR reading —
            // without either, a shown zone would just be a guess dressed up as fact.
            // The HR ring is always the app's heart-rate red; the zone shows as a number only.
            var hrLabel = "HR";
            if (_maxHrKnown && _dispHR > 0) { hrLabel = "HR " + _hrZone(_dispHR); }
            _drawRing(dc, cx, cy + ringR, circR, 0xFF3355, hrLabel, _dispHR > 0 ? _dispHR.format("%d") : "--");
            _drawBattery(dc, cx, cy, ringR, circR);
            _drawStatusBar(dc, cx, w, h, cy + ringR + circR);
        }

        // Paused banner (both screens)
        if (_isPaused) {
            dc.setColor(0xFF6600, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.04).toNumber(), Gfx.FONT_TINY,
                "PAUSED", Gfx.TEXT_JUSTIFY_CENTER);
        }

        // Page indicator dots (shown while running or paused)
        if (_isRunning || _isPaused) { _drawPageDots(dc, cx, w, h); }
    }

    private function _drawTimeTop(dc, cx, w, h) {
        // Timer uses the primary device font. Cadence is a secondary metric drawn
        // immediately below the timer — using FONT_SMALL on all screen sizes so it
        // is clearly subordinate to the elapsed time without competing with the rings.
        //
        // Spacing is tuned to match the label→value gap used inside the run rings
        // (14px between label top and value top in _drawRing), keeping the cadence
        // block visually consistent with the KM / PACE / HR ring metrics.
        var timerFont = _isSmallScreen ? Gfx.FONT_MEDIUM : Gfx.FONT_LARGE;

        // cadY sits ~6px below the timer baseline; spmY is 14px below cadence baseline
        // (ring-equivalent spacing), keeping value above and label below.
        var cadY = (h * 0.26).toNumber();
        var spmY = _isSmallScreen ? (h * 0.38).toNumber() : (h * 0.37).toNumber();

        if (_isRunning || _isPaused) {
            // Active run: show DURATION label + elapsed time
            dc.setColor(0x00CC66, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.08).toNumber(), Gfx.FONT_XTINY, "DURATION", Gfx.TEXT_JUSTIFY_CENTER);
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.14).toNumber(), timerFont, _fmtTime(_elapsedTime), Gfx.TEXT_JUSTIFY_CENTER);
        } else if (_isFinished) {
            // Run just ended — keep duration visible in dimmed green until next run starts
            dc.setColor(0x007744, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.08).toNumber(), Gfx.FONT_XTINY, "FINISHED", Gfx.TEXT_JUSTIFY_CENTER);
            dc.setColor(0xAAAAAA, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.14).toNumber(), timerFont, _fmtTime(_elapsedTime), Gfx.TEXT_JUSTIFY_CENTER);
        } else {
            // Idle: show current clock time (24h), no label
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.09).toNumber(), timerFont, _fmtClock(), Gfx.TEXT_JUSTIFY_CENTER);
        }
        // Cadence metric (value) above SPM label — FONT_SMALL on all device sizes.
        // Shows "--" until cadence sensor data arrives. Before a run the prepare hint uses
        // this slot instead (see _drawStatusBar).
        if (_showPrepareHint()) { return; }
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        var cadStr = _dispCadence > 0 ? _dispCadence.format("%d") : "--";
        dc.drawText(cx, cadY, Gfx.FONT_SMALL, cadStr, Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, spmY, Gfx.FONT_XTINY, "SPM", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // =========================================================================
    // GRID SCREEN — data-dense layout (also default for FR55)
    // Layout: Duration|Pace / Distance|Cadence / HR|Avg Pace
    // =========================================================================
    private function _drawGridScreen(dc, cx, cy, w, h) {
        var metricFont = _isSmallScreen ? Gfx.FONT_SMALL  : Gfx.FONT_MEDIUM;
        var timerFont  = _isSmallScreen ? Gfx.FONT_MEDIUM : Gfx.FONT_LARGE;
        var lx = (w * 0.27).toNumber();   // left column centre
        var rx = (w * 0.73).toNumber();   // right column centre

        // -- Top row: Duration (left) | Pace (right) --
        if (_isRunning || _isPaused) {
            dc.setColor(0x00CC66, Gfx.COLOR_TRANSPARENT);
            dc.drawText(lx, (h * 0.17).toNumber(), Gfx.FONT_XTINY, "DURATION", Gfx.TEXT_JUSTIFY_CENTER);
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(lx, (h * 0.23).toNumber(), timerFont, _fmtTime(_elapsedTime), Gfx.TEXT_JUSTIFY_CENTER);
        } else if (_isFinished) {
            // Run just ended — keep duration visible in dimmed green until next run starts
            dc.setColor(0x007744, Gfx.COLOR_TRANSPARENT);
            dc.drawText(lx, (h * 0.17).toNumber(), Gfx.FONT_XTINY, "FINISHED", Gfx.TEXT_JUSTIFY_CENTER);
            dc.setColor(0xAAAAAA, Gfx.COLOR_TRANSPARENT);
            dc.drawText(lx, (h * 0.23).toNumber(), timerFont, _fmtTime(_elapsedTime), Gfx.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(lx, (h * 0.20).toNumber(), timerFont, _fmtClock(), Gfx.TEXT_JUSTIFY_CENTER);
        }

        dc.setColor(0xFFDD00, Gfx.COLOR_TRANSPARENT);
        dc.drawText(rx, (h * 0.17).toNumber(), Gfx.FONT_XTINY, "PACE", Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(rx, (h * 0.23).toNumber(), metricFont, _fmtPace(_dispPace), Gfx.TEXT_JUSTIFY_CENTER);

        // Vertical divider top row
        dc.setColor(0x444444, Gfx.COLOR_TRANSPARENT);
        dc.drawLine(cx, (h * 0.14).toNumber(), cx, (h * 0.37).toNumber());

        // -- Divider 1 --
        dc.setColor(0x444444, Gfx.COLOR_TRANSPARENT);
        dc.drawLine((w * 0.08).toNumber(), (h * 0.38).toNumber(), (w * 0.92).toNumber(), (h * 0.38).toNumber());

        // -- Middle row: Distance (left) | Cadence (right) --
        dc.setColor(0x00BFA8, Gfx.COLOR_TRANSPARENT);
        dc.drawText(lx, (h * 0.41).toNumber(), Gfx.FONT_XTINY, "KM", Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(lx, (h * 0.50).toNumber(), metricFont, (_dispDistance / 1000.0).format("%.2f"), Gfx.TEXT_JUSTIFY_CENTER);

        dc.setColor(0xFF8800, Gfx.COLOR_TRANSPARENT);
        dc.drawText(rx, (h * 0.41).toNumber(), Gfx.FONT_XTINY, "SPM", Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(rx, (h * 0.50).toNumber(), metricFont, _dispCadence > 0 ? _dispCadence.format("%d") : "--", Gfx.TEXT_JUSTIFY_CENTER);

        // Vertical divider
        dc.setColor(0x444444, Gfx.COLOR_TRANSPARENT);
        dc.drawLine(cx, (h * 0.39).toNumber(), cx, (h * 0.62).toNumber());

        // -- Divider 2 --
        dc.setColor(0x444444, Gfx.COLOR_TRANSPARENT);
        dc.drawLine((w * 0.08).toNumber(), (h * 0.63).toNumber(), (w * 0.92).toNumber(), (h * 0.63).toNumber());

        // -- Bottom row: HR (left) | Average pace (right) --
        // Same as the rings page: heart-rate red, zone number only with a personalised max HR.
        var gridHrLabel = "HR";
        if (_maxHrKnown && _dispHR > 0) { gridHrLabel = "HR " + _hrZone(_dispHR); }
        dc.setColor(0xFF3355, Gfx.COLOR_TRANSPARENT);
        dc.drawText(lx, (h * 0.66).toNumber(), Gfx.FONT_XTINY, gridHrLabel, Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(lx, (h * 0.74).toNumber(), metricFont, _dispHR > 0 ? _dispHR.format("%d") : "--", Gfx.TEXT_JUSTIFY_CENTER);

        var avgPace = (_sampleN > 0 && _sumPace > 0.0) ? _sumPace / _sampleN.toFloat() : 0.0;
        dc.setColor(0xFFDD00, Gfx.COLOR_TRANSPARENT);
        dc.drawText(rx, (h * 0.66).toNumber(), Gfx.FONT_XTINY, "AVG PACE", Gfx.TEXT_JUSTIFY_CENTER);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(rx, (h * 0.74).toNumber(), metricFont, _fmtPace(avgPace), Gfx.TEXT_JUSTIFY_CENTER);

        // Vertical divider row 2
        dc.setColor(0x444444, Gfx.COLOR_TRANSPARENT);
        dc.drawLine(cx, (h * 0.64).toNumber(), cx, (h * 0.79).toNumber());

        // Battery icon removed from grid screen — grid shifted down so top row clears the bezel

        _drawStatusBar(dc, cx, w, h, -1);
    }

    // Two small dots at the bottom showing which screen is active
    private function _drawPageDots(dc, cx, w, h) {
        var dotY = (h * 0.91).toNumber();
        var r    = 3;
        // Page 0 dot (left)
        if (_screenPage == 0) {
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.fillCircle(cx - 9, dotY, r);
        } else {
            dc.setColor(0x555555, Gfx.COLOR_TRANSPARENT);
            dc.drawCircle(cx - 9, dotY, r);
        }
        // Page 1 dot (right)
        if (_screenPage == 1) {
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.fillCircle(cx + 9, dotY, r);
        } else {
            dc.setColor(0x555555, Gfx.COLOR_TRANSPARENT);
            dc.drawCircle(cx + 9, dotY, r);
        }
    }

    private function _drawRing(dc, x, y, r, color, label, value) {
        dc.setColor(color, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(x, y, r - 1);
        dc.drawCircle(x, y, r);
        dc.drawCircle(x, y, r + 1);
        // Label above value, stacked by measured font heights and centred on the ring. The old
        // fixed y-21 / y-7 offsets were tuned on small screens; on large ones (454 px FR965)
        // the value's taller font overlapped its label. Fonts carry internal top/bottom
        // padding, so the two lines are pulled together by a fraction of the label height.
        var hLabel  = Gfx.getFontHeight(Gfx.FONT_XTINY);
        var hValue  = Gfx.getFontHeight(Gfx.FONT_MEDIUM);
        var overlap = (hLabel * 0.25).toNumber();
        var top     = y - ((hLabel + hValue - overlap) / 2).toNumber();
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(x, top, Gfx.FONT_XTINY, label, Gfx.TEXT_JUSTIFY_CENTER);
        dc.drawText(x, top + hLabel - overlap, Gfx.FONT_MEDIUM, value, Gfx.TEXT_JUSTIFY_CENTER);
    }

    // Rings screen battery: a compact icon over its percentage, in the empty pocket at the
    // lower right between the PACE and HR rings, scaled to the screen. It used to sit at a
    // fixed cx+circR+8 offset with a fixed 22x12 px icon, which on large screens (454 px
    // FR965) put the percentage on top of the HR ring.
    private function _drawBattery(dc, cx, cy, ringR, circR) {
        if (!(Sys has :getSystemStats)) { return; }
        var stats = Sys.getSystemStats();
        if (stats == null || stats.battery == null) { return; }
        var bat = stats.battery.toNumber();
        if (bat < 0)   { bat = 0; }
        if (bat > 100) { bat = 100; }

        var w  = dc.getWidth();
        var bw = (w * 0.062).toNumber();
        if (bw < 18) { bw = 18; }
        var bh = (bw * 0.52).toNumber();
        var tw = (bw * 0.10).toNumber(); if (tw < 2) { tw = 2; }
        var th = (bh * 0.45).toNumber();
        var hTiny = Gfx.getFontHeight(Gfx.FONT_XTINY);

        // Pocket centre: on the diagonal between the PACE ring (cx+ringR, cy) and the HR
        // ring (cx, cy+ringR), pushed out towards the bezel until it clears both.
        var px = cx + (w * 0.305).toNumber();
        var py = cy + (w * 0.290).toNumber();
        var bx = px - (bw + tw) / 2;
        var by = py - (bh + hTiny) / 2;

        var col = 0x00CC66;
        if (bat < 50) { col = 0xFFAA00; }
        if (bat < 20) { col = 0xFF4444; }
        var r = (bh / 4).toNumber();

        dc.setColor(0x777777, Gfx.COLOR_TRANSPARENT);
        if (dc has :drawRoundedRectangle) {
            dc.drawRoundedRectangle(bx, by, bw, bh, r);
        } else {
            dc.drawRectangle(bx, by, bw, bh);
        }
        dc.fillRectangle(bx + bw, by + (bh - th) / 2, tw, th);
        var inset = (bh / 6).toNumber(); if (inset < 2) { inset = 2; }
        var fillW = ((bw - 2 * inset) * bat / 100).toNumber();
        if (fillW > 0) {
            dc.setColor(col, Gfx.COLOR_TRANSPARENT);
            if (dc has :fillRoundedRectangle) {
                dc.fillRoundedRectangle(bx + inset, by + inset, fillW, bh - 2 * inset, (r / 2).toNumber());
            } else {
                dc.fillRectangle(bx + inset, by + inset, fillW, bh - 2 * inset);
            }
        }
        dc.setColor(0x999999, Gfx.COLOR_TRANSPARENT);
        dc.drawText(px, by + bh + 1, Gfx.FONT_XTINY, bat.format("%d") + "%", Gfx.TEXT_JUSTIFY_CENTER);
    }

    // Draw just the battery icon outline+fill, no percentage text.
    // Used in the grid screen so the right column doesn't appear visually heavier
    // than the left column (which has no sub-metric below HR).
    private function _drawBatteryIcon(dc, bx, by) {
        if (!(Sys has :getSystemStats)) { return; }
        var stats = Sys.getSystemStats();
        if (stats == null)         { return; }
        if (stats.battery == null) { return; }
        var bat = stats.battery.toNumber();
        if (bat < 0)   { bat = 0; }
        if (bat > 100) { bat = 100; }

        var bw  = 22;
        var bh  = 12;
        var tw  = 3;
        var th  = 6;

        var col = 0x00CC66;
        if (bat < 50) { col = 0xFFAA00; }
        if (bat < 20) { col = 0xFF4444; }

        dc.setColor(0x888888, Gfx.COLOR_TRANSPARENT);
        dc.drawRectangle(bx, by, bw, bh);
        dc.setColor(0x888888, Gfx.COLOR_TRANSPARENT);
        dc.fillRectangle(bx + bw, by + (bh - th) / 2, tw, th);

        var fillW = ((bw - 2) * bat / 100).toNumber();
        if (fillW > 0) {
            dc.setColor(col, Gfx.COLOR_TRANSPARENT);
            dc.fillRectangle(bx + 1, by + 1, fillW, bh - 2);
        }
    }

    // "Prepare on Phone" nudge: connected, nothing prepared, before a run (not after one —
    // finishRun() clears _isPrepared, and the nudge used to land on the FINISHED screen).
    private function _showPrepareHint() {
        return !_isRunning && !_isPaused && !_isFinished && _isConnected && _isAuthenticated
            && !_isPrepared && !_prepareGateDismissed;
    }

    // ringBottom: the HR ring's bottom edge on the rings page (-1 on the grid page). A fixed
    // 0.82h lands inside the HR ring there (it spans ~0.59h–0.92h on every size), so short
    // messages go in the band under the ring and the long prepare hint takes the cadence slot,
    // which is empty before a run (_drawTimeTop skips it then).
    private function _drawStatusBar(dc, cx, w, h, ringBottom) {
        // The FINISHED screen is the runner's result — no prompts or nudges on it ("PRESS
        // START", "OFFLINE", "Prepare on Phone", a late coaching line). The next press of START
        // still leaves it for the prepare screen (see handleIdleStart).
        if (_isFinished && !_isRunning && !_isPaused) { return; }
        var y = (ringBottom > 0) ? ringBottom + 2 : (h * 0.82).toNumber();
        if (_statusMessage.length() > 0) {
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            // Arbitrary text: under the ring if it fits the round face there, else the old spot.
            var sy = (ringBottom > 0 && !_fitsRoundBand(dc, _statusMessage, y, w, h)) ? (h * 0.82).toNumber() : y;
            dc.drawText(cx, sy, Gfx.FONT_XTINY, _statusMessage, Gfx.TEXT_JUSTIFY_CENTER);
        } else if (_isRunning && _gpsLostTicks >= GPS_LOST_THRESHOLD) {
            // GPS signal lost during an active run — amber warning
            dc.setColor(0xFFAA00, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, "GPS LOST", Gfx.TEXT_JUSTIFY_CENTER);
        } else if (!_isRunning && !_isConnected && _isAuthenticated && _connectWaitTicks >= CONNECT_WAIT_MAX) {
            // Offline mode: amber notice so user knows charts are limited
            // Guard with grace period so the label does not flash before auth arrives
            dc.setColor(0xFFAA00, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, "OFFLINE", Gfx.TEXT_JUSTIFY_CENTER);
        } else if (_showPrepareHint()) {
            // Connected to the phone but nothing prepared. "PRESS START" here is a dead end:
            // it works, but it silently gives up coaching, the session target and the richer
            // charts the phone adds. Point at the better path instead.
            //
            // Measured rather than assumed: this string is far too long for FONT_XTINY on a
            // single line on most of the supported fleet (an FR55 is 208 px wide), and the app
            // ships to 163 devices from 208 px up. Draw it on one line where it genuinely fits
            // and wrap to two where it doesn't, growing UPWARD into empty space — a second line
            // below y would run off the narrow bottom of a round face.
            dc.setColor(0x00BFA8, Gfx.COLOR_TRANSPARENT);
            var hint  = "Prepare on Phone for AI coaching";
            var maxW  = (w * 0.88).toNumber();
            if (ringBottom > 0) {
                var lh2 = Gfx.getFontHeight(Gfx.FONT_XTINY);
                var cy2 = (h * 0.26).toNumber();
                dc.drawText(cx, cy2,       Gfx.FONT_XTINY, "Prepare on Phone", Gfx.TEXT_JUSTIFY_CENTER);
                dc.drawText(cx, cy2 + lh2, Gfx.FONT_XTINY, "for AI coaching",  Gfx.TEXT_JUSTIFY_CENTER);
            } else if (dc.getTextWidthInPixels(hint, Gfx.FONT_XTINY) <= maxW) {
                dc.drawText(cx, y, Gfx.FONT_XTINY, hint, Gfx.TEXT_JUSTIFY_CENTER);
            } else {
                var lh = Gfx.getFontHeight(Gfx.FONT_XTINY);
                dc.drawText(cx, y - lh, Gfx.FONT_XTINY, "Prepare on Phone", Gfx.TEXT_JUSTIFY_CENTER);
                dc.drawText(cx, y,      Gfx.FONT_XTINY, "for AI coaching",  Gfx.TEXT_JUSTIFY_CENTER);
            }
        } else if (!_isRunning) {
            dc.setColor(0x555555, Gfx.COLOR_TRANSPARENT);
            var ps = "PRESS START";
            if (ringBottom > 0 && !_fitsRoundBand(dc, ps, y, w, h)) { ps = "START"; }
            dc.drawText(cx, y, Gfx.FONT_XTINY, ps, Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    // True if `text` (FONT_XTINY, top at y) fits inside the round face with a small margin.
    private function _fitsRoundBand(dc, text, y, w, h) {
        var r   = w / 2.0 - 6;
        var dy  = (y + Gfx.getFontHeight(Gfx.FONT_XTINY) * 0.6) - h / 2.0;
        if (dy >= r) { return false; }
        var half = Math.sqrt(r * r - dy * dy);
        return dc.getTextWidthInPixels(text, Gfx.FONT_XTINY) <= 2 * half;
    }

    // ── Prepare-on-phone Screen ──────────────────────────────────────────────
    // Deliberately plain — no run instruments — so the one thing to do is obvious.
    private function _drawPrepareGate(dc, cx, cy, w, h) {
        dc.setColor(0x00BFA8, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, (w / 2) - 4);
        dc.drawCircle(cx, cy, (w / 2) - 5);

        // Laid out from both ends — font sizes vary hugely across the fleet (FONT_TINY on a
        // 454 px Forerunner 965 is taller than FONT_SMALL on a 208 px Forerunner 55), so fixed
        // fractions overlap on one device or waste space on another.
        //   bottom-up: START hint, then the button above it, kept clear of the narrowing rim
        //   top-down:  the message; the phone-status line only if there's room left for it
        var isTouch = Sys.getDeviceSettings().isTouchScreen;
        var fh      = Gfx.getFontHeight(Gfx.FONT_XTINY);
        var btnW    = (w * 0.72).toNumber();
        var btnText = "Continue without coaching";
        var oneLine = dc.getTextWidthInPixels(btnText, Gfx.FONT_XTINY) <= btnW - 12;
        var btnH    = (oneLine ? fh : fh * 2) + 10;
        var hintY   = (h * 0.84).toNumber() - fh;
        var btnY    = hintY - 3 - btnH;

        // The message must clear the button; the "AI RUN COACH" title is the first thing to go
        // when it wouldn't (Forerunner 55-size screens).
        var msgH = _wrappedHeight(dc, (w * 0.78).toNumber(), Gfx.FONT_XTINY, "Prepare on your phone")
            + _wrappedHeight(dc, (w * 0.84).toNumber(), Gfx.FONT_XTINY, "for live AI coaching");
        var y = (h * 0.09).toNumber();
        if (y + fh + 6 + msgH <= btnY - 4) {
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, "AI RUN COACH", Gfx.TEXT_JUSTIFY_CENTER);
            y += fh + 6;
        }
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        y = _drawWrapped(dc, cx, y, (w * 0.78).toNumber(), Gfx.FONT_XTINY, "Prepare on your phone");
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        y = _drawWrapped(dc, cx, y, (w * 0.84).toNumber(), Gfx.FONT_XTINY, "for live AI coaching");

        if (y + 2 + fh <= btnY - 4) {
            var dots = ""; for (var i = 0; i < _dotCount; i++) { dots = dots + "."; }
            var statusY = y + ((btnY - 4 - y - fh) / 2);   // centred in the gap
            if (_isConnected) {
                dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
                dc.drawText(cx, statusY, Gfx.FONT_XTINY, "Waiting for phone" + dots, Gfx.TEXT_JUSTIFY_CENTER);
            } else {
                dc.setColor(0xFFAA00, Gfx.COLOR_TRANSPARENT);
                dc.drawText(cx, statusY, Gfx.FONT_XTINY, "Phone not connected", Gfx.TEXT_JUSTIFY_CENTER);
            }
        }

        // "Continue without coaching" — tappable on touch watches; START works everywhere
        // (and is the only way on button-only models), so the hint says which.
        // Solid teal (the app's accent) with black text. Teal survives the 8/64-colour MIP
        // palettes (Forerunner 55 etc.) as cyan, where a custom dark grey rounds to black.
        dc.setColor(0x00BFA8, Gfx.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - btnW / 2, btnY, btnW, btnH, 10);
        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_TRANSPARENT);
        if (oneLine) {
            dc.drawText(cx, btnY + 5, Gfx.FONT_XTINY, btnText, Gfx.TEXT_JUSTIFY_CENTER);
        } else {
            dc.drawText(cx, btnY + 5,      Gfx.FONT_XTINY, "Continue without", Gfx.TEXT_JUSTIFY_CENTER);
            dc.drawText(cx, btnY + 5 + fh, Gfx.FONT_XTINY, "coaching",         Gfx.TEXT_JUSTIFY_CENTER);
        }
        dc.setColor(0x888888, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, hintY, Gfx.FONT_XTINY, isTouch ? "Tap or press START" : "Press START",
            Gfx.TEXT_JUSTIFY_CENTER);
    }

    // Height _drawWrapped() would use for this text, without drawing it.
    private function _wrappedHeight(dc, maxW, font, text) {
        var lines = 0;
        var line = "";
        var rest = text;
        while (rest.length() > 0) {
            var sp = rest.find(" ");
            var word = (sp == null) ? rest : rest.substring(0, sp);
            rest = (sp == null) ? "" : rest.substring(sp + 1, rest.length());
            var trial = (line.length() == 0) ? word : line + " " + word;
            if (line.length() > 0 && dc.getTextWidthInPixels(trial, font) > maxW) {
                lines += 1;
                line = word;
            } else {
                line = trial;
            }
        }
        if (line.length() > 0) { lines += 1; }
        return lines * Gfx.getFontHeight(font);
    }

    // Word-wraps text into centred lines no wider than maxW. Returns the y below the last line.
    private function _drawWrapped(dc, cx, y, maxW, font, text) {
        var lh = Gfx.getFontHeight(font);
        var line = "";
        var rest = text;
        while (rest.length() > 0) {
            var sp = rest.find(" ");
            var word = (sp == null) ? rest : rest.substring(0, sp);
            rest = (sp == null) ? "" : rest.substring(sp + 1, rest.length());
            var trial = (line.length() == 0) ? word : line + " " + word;
            if (line.length() > 0 && dc.getTextWidthInPixels(trial, font) > maxW) {
                dc.drawText(cx, y, font, line, Gfx.TEXT_JUSTIFY_CENTER);
                y += lh;
                line = word;
            } else {
                line = trial;
            }
        }
        if (line.length() > 0) {
            dc.drawText(cx, y, font, line, Gfx.TEXT_JUSTIFY_CENTER);
            y += lh;
        }
        return y;
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
        dc.drawText(cx, (h * 0.57).toNumber(), Gfx.FONT_XTINY, (_gpsQuality >= 0 && _gpsQuality <= 4) ? qLabels[_gpsQuality] : "Searching", Gfx.TEXT_JUSTIFY_CENTER);

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

        // Stacked by measured font heights, not fixed offsets: the old cy±N pixel positions
        // were tuned on ~240 px screens and overlapped badly on large ones (on a 454 px
        // Forerunner 965 "Waiting" sat on the instructions and the footer ran through the
        // pairing code). The block is centred in the space below the divider; if it can't fit
        // (small screens with a big number font) the "Waiting" line is dropped first.
        var dots = ""; for (var i = 0; i < _dotCount; i++) { dots = dots + "."; }
        var hSmall = Gfx.getFontHeight(Gfx.FONT_SMALL);
        var hTiny  = Gfx.getFontHeight(Gfx.FONT_XTINY);
        var gap    = (hTiny / 3).toNumber();
        var top    = (h * 0.24).toNumber();
        var bottom = (h * 0.84).toNumber();   // lower than this the round bezel clips the footer

        // Code font: the big number font where it fits the width (large screens), stepping
        // down on small ones (208 px FR55), where NUMBER_MEDIUM ran off both sides.
        var codeFont = Gfx.FONT_NUMBER_MEDIUM;
        if (_pairingCode != null) {
            var codeText = _formatPairingCode(_pairingCode);
            if (dc.getTextWidthInPixels(codeText, codeFont) > (w * 0.78).toNumber()) {
                codeFont = Gfx.FONT_NUMBER_MILD;
                if (dc.getTextWidthInPixels(codeText, codeFont) > (w * 0.78).toNumber()) {
                    codeFont = Gfx.FONT_MEDIUM;
                }
            }
        }
        var hCode = Gfx.getFontHeight(codeFont);

        // The footer sits low on a round face where the usable width shrinks — wrap it to two
        // lines unless it comfortably fits (it doesn't on the 454 px FR965's larger fonts).
        var footer    = "You only need to do this once.";
        var footerTwo = dc.getTextWidthInPixels(footer, Gfx.FONT_XTINY) > (w * 0.66).toNumber();
        var hFooter   = footerTwo ? 2 * hTiny : hTiny;

        // Drop the least important lines until the block fits: "Waiting" first, then the footer.
        var body   = (_pairingCode != null) ? (2 * hTiny + hCode) : (2 * hTiny);
        var showWaiting = true;
        var showFooter  = true;
        var total  = hSmall + gap + body + gap + hFooter;
        if (total > bottom - top) { showWaiting = false; total = body + gap + hFooter; }
        if (total > bottom - top) { showFooter  = false; total = body; }
        var y = top + ((bottom - top - total) / 2).toNumber();
        if (y < top) { y = top; }

        if (showWaiting) {
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_SMALL, "Waiting" + dots, Gfx.TEXT_JUSTIFY_CENTER);
            y += hSmall + gap;
        }

        if (_pairingCode != null) {
            // Pairing-code fallback got a code before the ConnectIQ BLE auth arrived —
            // show it so the user can type it into the phone app directly instead of
            // waiting on a device pairing hand-off that may never complete.
            // Shorter wording where the full line would run off a small round face (FR55).
            var l1 = "Or enter this code in";
            var l2 = "Ai Run Coach on your phone:";
            if (dc.getTextWidthInPixels(l2, Gfx.FONT_XTINY) > (w * 0.80).toNumber()) {
                l1 = "Or enter this code";
                l2 = "in the phone app:";
            }
            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, l1, Gfx.TEXT_JUSTIFY_CENTER);
            y += hTiny;
            dc.drawText(cx, y, Gfx.FONT_XTINY, l2, Gfx.TEXT_JUSTIFY_CENTER);
            y += hTiny;
            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, codeFont, _formatPairingCode(_pairingCode), Gfx.TEXT_JUSTIFY_CENTER);
            y += hCode;
        } else {
            dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
            dc.drawText(cx, y, Gfx.FONT_XTINY, "Open Ai Run Coach on your", Gfx.TEXT_JUSTIFY_CENTER);
            y += hTiny;
            dc.drawText(cx, y, Gfx.FONT_XTINY, "phone to connect.", Gfx.TEXT_JUSTIFY_CENTER);
            y += hTiny;
        }
        if (!showFooter) { return; }
        dc.setColor(0x00AA55, Gfx.COLOR_TRANSPARENT);
        if (footerTwo) {
            dc.drawText(cx, y + gap,         Gfx.FONT_XTINY, "You only need to", Gfx.TEXT_JUSTIFY_CENTER);
            dc.drawText(cx, y + gap + hTiny, Gfx.FONT_XTINY, "do this once.",    Gfx.TEXT_JUSTIFY_CENTER);
        } else {
            dc.drawText(cx, y + gap, Gfx.FONT_XTINY, footer, Gfx.TEXT_JUSTIFY_CENTER);
        }
    }

    // "482913" -> "482 913" — easier to read/type accurately on a small round screen.
    private function _formatPairingCode(code) {
        if (code == null || code.length() != 6) { return code; }
        return code.substring(0, 3) + " " + code.substring(3, 6);
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

    // ── Safe storage write helper ─────────────────────────────────────────────
    // App.Storage.setValue() throws Lang.StorageFullException (and on some
    // older SDK builds a generic Lang.Exception) when the device storage quota is
    // exhausted.  Every persistent write goes through this helper so that a full
    // device NEVER crashes the app.  Returns true on success, false on failure.
    private function _safeStorageSet(key, value) {
        try {
            App.Storage.setValue(key, value);
            return true;
        } catch (ex) {
            Sys.println("WARN: Storage full — could not write key='" + key + "': " + ex.getErrorMessage());
            return false;
        }
    }

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
    // Minutes:seconds per km ("5:17"), the way runners — and the phone app — read pace. This
    // used to print decimal minutes ("5.29" for 5:17), which reads as 5:29 and disagreed with
    // the phone showing the same run. Seconds truncate, matching the phone's formatting.
    private function _fmtPace(secPerKm) {
        if (secPerKm <= 0 || secPerKm > 1200) { return "--" ; }
        var total = secPerKm.toNumber();
        return (total / 60).format("%d") + ":" + (total % 60).format("%02d");
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
        Sys.println(">>> _startSession() — isRunning=" + _isRunning + " existingSession=" + (_session != null)
            + " storedType=" + App.Storage.getValue("sessionType"));
        // Defensive: ensure no stale session is left open before creating a new one.
        // A double-open can cause an IQ error on some devices.
        if (_session != null) {
            // Being called with a session already open while a run is genuinely still in
            // progress means something re-triggered _startSession() mid-run — this is
            // exactly what splits one continuous Garmin Connect activity into several
            // short ones. Persist a breadcrumb so a real on-device repro can confirm this
            // path is (or isn't) what's happening — see the open Garmin walk-freeze report.
            if (_isRunning) {
                _recordBreadcrumb("startSession:recreateWhileRunning storedType=" + App.Storage.getValue("sessionType"));
            }
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
            // Use the correct sport type — walk sessions get SPORT_WALKING for correct FIT file classification.
            var sport = Record.SPORT_RUNNING;
            var storedType = App.Storage.getValue("sessionType");
            if (storedType != null && storedType.equals("walk")) {
                sport = Record.SPORT_WALKING;
            }
            _session = Record.createSession({ :name => "AI Run Coach", :sport => sport });
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
    // Double-tap detection: first tap records time, second tap within 400ms triggers Talk to Coach.
    // CRITICAL: Sys.getTimer() returns Long on CIQ 4.x+. Use Long literals throughout so that
    // Long-Long arithmetic never throws "Symbol Not Found / Failed invoking <symbol>" on CIQ 6.0.
    private var _lastTapTimeMs = 0l;
    private const DOUBLE_TAP_WINDOW_MS = 400l;
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
            if (!_view.isRunning())     { if (!_view.handleIdleStart()) { _view.startRun(); } }
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
        // Double-tap required to trigger Talk to Coach — single tap does nothing.
        // CIQ type safety: all timer values are Long (toLong() + 0l/400l literals) so
        // Long-Long arithmetic is always safe across every CIQ version.
        try {
            // Prepare-on-phone screen: a tap on (or below) its button continues without
            // coaching. Upper part of the screen is text only, so ignore taps there.
            if (_view != null && _view.isPrepareGateActive()) {
                var coords = clickEvent.getCoordinates();
                var sh = Sys.getDeviceSettings().screenHeight;
                if (coords[1] >= (sh * 0.60).toNumber()) { _view.continueWithoutCoaching(); }
                return true;
            }
            if (_view != null && _view.isRunning() && !_view.isPaused()) {
                var now = Sys.getTimer().toLong();  // toLong() ensures Long on ALL CIQ versions
                var elapsed = now - _lastTapTimeMs; // Long - Long = Long ✓
                if (_lastTapTimeMs > 0l && elapsed <= DOUBLE_TAP_WINDOW_MS) {
                    // Second tap within window → Talk to Coach
                    Sys.println(">>> onTap: DOUBLE-TAP (" + elapsed + "ms) — Talk to Coach");
                    _view.requestTalkToCoach();
                    _lastTapTimeMs = 0l;  // reset so triple-tap doesn't fire again
                } else {
                    // First tap — record time, wait for second
                    Sys.println(">>> onTap: first tap — waiting for second tap");
                    _lastTapTimeMs = now;
                }
            }
        } catch (e) {
            // Belt-and-suspenders: if timer arithmetic ever fails on an unexpected
            // firmware, reset and log rather than crashing the entire app.
            Sys.println(">>> onTap: timer error — " + e.toString());
            _lastTapTimeMs = 0l;
        }
        return true; // always consume — screen touches must NEVER start/pause a run
    }

    function onHold(clickEvent) {
        return true; // consume — do nothing
    }

    // ── Swipe ─────────────────────────────────────────────────────────────────
    // Left/right swipe toggles between Diamond and Grid screens.
    // onNextPage/onPreviousPage catch firmware-level page-swipe gestures (Vivoactive 4 etc)
    // so they never fall through to onBack() and accidentally pause the run.
    function onSwipe(swipeEvent) {
        if (_view != null) {
            var dir = swipeEvent.getDirection();
            if (dir == Ui.SWIPE_LEFT || dir == Ui.SWIPE_RIGHT) {
                _view.toggleScreen();
            }
        }
        return true;
    }

    function onNextPage() {
        if (_view != null) { _view.toggleScreen(); }
        return true;
    }

    function onPreviousPage() {
        if (_view != null) { _view.toggleScreen(); }
        return true;
    }

    // ── BACK button (bottom-right) / left-to-right swipe back gesture ─────────
    // Rules:
    //   Running (not paused) → toggle screen only (safe for accidental swipe/button)
    //   Paused               → show "Finish run?" (user paused intentionally via START)
    //   Idle                 → show "Exit app?" confirmation (never instant-exit)
    function onBack() {
        if (_view == null) { return true; }
        if (_view.isRunning() && !_view.isPaused()) {
            // Just flip the screen — never pause or finish from a back gesture during a run
            _view.toggleScreen();
        } else if (_view.isPaused()) {
            var storedType = App.Storage.getValue("sessionType");
            var finishPrompt = (storedType != null && storedType.equals("walk")) ? "Finish walk?" : "Finish run?";
            Ui.pushView(
                new Ui.Confirmation(finishPrompt),
                new FinishConfirmDelegate(_view),
                Ui.SLIDE_IMMEDIATE
            );
        } else {
            // Idle: confirm before exiting so no accidental app close
            Ui.pushView(
                new Ui.Confirmation("Exit app?"),
                new ExitConfirmDelegate(),
                Ui.SLIDE_IMMEDIATE
            );
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

(:gui)
class ExitConfirmDelegate extends Ui.ConfirmationDelegate {
    function initialize() { ConfirmationDelegate.initialize(); }
    function onResponse(r) {
        if (r == Ui.CONFIRM_YES) { Sys.exit(); }
        return true;
    }
}
