package live.airuncoach.airuncoach.wear.session

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.wear.BuildConfig
import live.airuncoach.airuncoach.wear.data.DirectHttpApiClient
import live.airuncoach.airuncoach.wear.data.RetryLoop
import live.airuncoach.airuncoach.wear.data.SessionDataRequest
import live.airuncoach.airuncoach.wear.data.SessionEndRequest
import live.airuncoach.airuncoach.wear.data.SessionStartRequest
import live.airuncoach.airuncoach.wear.data.SessionSummary
import live.airuncoach.airuncoach.wear.data.UploadBatchRequest
import live.airuncoach.airuncoach.wear.data.WearDataLayerClient
import live.airuncoach.airuncoach.wear.sensors.HealthServicesManager
import live.airuncoach.airuncoach.wear.sensors.resolveGpsQuality
import live.airuncoach.airuncoach.wear.storage.CrashBreadcrumb
import live.airuncoach.airuncoach.wear.storage.GpsPoint
import live.airuncoach.airuncoach.wear.storage.OfflineGpsBuffer
import live.airuncoach.airuncoach.wear.storage.SaveTier
import live.airuncoach.airuncoach.wear.storage.WearPreferences
import live.airuncoach.airuncoach.wear.ui.Overlay
import live.airuncoach.airuncoach.wear.ui.RunScreenState
import java.util.UUID

/**
 * The full run lifecycle — startRun()/pauseRun()/resumeRun()/finishRun() plus the message
 * dispatch and periodic tick — mirroring the Garmin Connect IQ watch app's RunView.mc as
 * closely as the platform allows. Deliberately owned by [live.airuncoach.airuncoach.wear.WearApplication]
 * rather than any Activity/ViewModel: a run in progress must survive the screen being
 * backgrounded, exactly the bug the Garmin app's `onHide()` fix addressed this session — by
 * living in an Application-scoped singleton with its own long-lived [scope], there is no
 * Activity lifecycle event that can tear tracking down here at all.
 *
 * Also doubles as the "ViewModel" for Compose — screens observe [state] directly via
 * `collectAsState()`. A separate ViewModel wrapper would only forward the same StateFlow, so
 * it's omitted (this module has no Hilt/DI framework — see wear/build.gradle.kts).
 */
class RunSessionController(
    private val context: Context,
    private val scope: CoroutineScope,
    private val dataLayer: WearDataLayerClient,
    private val httpApi: DirectHttpApiClient,
    private val health: HealthServicesManager,
    private val prefs: WearPreferences,
    private val offlineBuffer: OfflineGpsBuffer
) {
    companion object {
        private const val TAG = "RunSessionController"
        /** Elevation quantiser threshold for GPS altitude — see the elevation block in the tick. */
        private const val GPS_ALT_THRESHOLD_M = 5.0
        private val APP_VERSION = BuildConfig.VERSION_NAME
        private const val START_RETRY_MAX = 3
        private const val START_RETRY_INTERVAL_MS = 5000L
        private const val STOP_RETRY_MAX = 6
        private const val STOP_RETRY_INTERVAL_MS = 5000L
        private const val PAUSE_RESUME_RETRY_MAX = 6
        private const val PAUSE_RESUME_RETRY_INTERVAL_MS = 5000L
        private const val GPS_LOST_THRESHOLD_MS = 2000L
        private const val CONNECT_WAIT_GRACE_MS = 8000L
        private const val OFFLINE_CAPTURE_INTERVAL_MS = 15_000L
        private const val WATCH_DATA_INTERVAL_MS = 2000L
        private const val HTTP_DATA_INTERVAL_MS = 1000L
        private const val MIN_SAVE_DISTANCE_M = 100.0
        private const val MIN_SAVE_DURATION_S = 30
    }

    private val _state = MutableStateFlow(RunScreenState())
    val state: StateFlow<RunScreenState> = _state

    /** Set whenever [onBackPressed] resolves to a confirmation prompt — single source of truth
     * so both the system back-gesture (BackHandler) and the physical bottom/BACK button
     * (WearMainActivity.onKeyDown) drive the exact same dialog. */
    private val _pendingConfirm = MutableStateFlow<live.airuncoach.airuncoach.wear.ui.BackAction?>(null)
    val pendingConfirm: StateFlow<live.airuncoach.airuncoach.wear.ui.BackAction?> = _pendingConfirm

    fun clearPendingConfirm() {
        _pendingConfirm.value = null
    }

    /**
     * Debug-only: injects an auth token exactly as the "auth" phone message would (see
     * [handleMessage]'s "auth" branch), for testing when the real phone<->watch Data Layer
     * capability sync isn't available (e.g. flaky emulator-to-emulator pairing). Never invoked
     * from any production code path — only from WearMainActivity behind BuildConfig.DEBUG.
     */
    fun debugInjectAuth(token: String, runnerName: String) {
        if (!BuildConfig.DEBUG) return
        scope.launch { prefs.setAuth(token, runnerName, null) }
        _state.update { it.copy(isAuthenticated = true, overlay = overlayAfterAuth(it)) }
    }

    /**
     * Linked: leave the "open the phone app" screen for GPS wait — or straight past it if GPS is
     * already good (RunView.mc's _applyAuthToken). This used to move on only when the GPS
     * quality happened to be above zero at that instant, so pairing indoors or before the first
     * fix left an authenticated watch stuck on the pairing screen.
     */
    private fun overlayAfterAuth(s: RunScreenState): Overlay = when {
        s.isRunning || s.overlay != Overlay.WAITING -> s.overlay
        s.gpsQuality >= (if (s.isPhoneConnected) 2 else 3) -> Overlay.NONE
        else -> Overlay.GPS_WAIT
    }

    private val startRetry = RetryLoop(scope, START_RETRY_MAX, START_RETRY_INTERVAL_MS) {
        dataLayer.sendCommand("start")
    }
    private val stopRetry = RetryLoop(scope, STOP_RETRY_MAX, STOP_RETRY_INTERVAL_MS) {
        dataLayer.sendCommand("stop")
    }
    // Ported from the Garmin side (2026-09): pause/resume previously had no retry at all, unlike
    // start/stop above — a dropped Data Layer message left the phone never finding out the watch
    // paused, silently diverging the phone's timer/distance from the watch's for the rest of the
    // session. Two separate loops (rather than one shared "which action" tracker, as the Garmin
    // Monkey C side needed) since Kotlin already has RetryLoop as a clean reusable primitive.
    private val pauseRetry = RetryLoop(scope, PAUSE_RESUME_RETRY_MAX, PAUSE_RESUME_RETRY_INTERVAL_MS) {
        dataLayer.sendCommand("pause")
    }
    private val resumeRetry = RetryLoop(scope, PAUSE_RESUME_RETRY_MAX, PAUSE_RESUME_RETRY_INTERVAL_MS) {
        dataLayer.sendCommand("resume")
    }

    private var phoneControlled = false
    private var isFinishing = false
    private var sessionId: String? = null
    private var plannedWorkoutId: String? = null
    private var sessionReadySent = false
    private var connectStartMs = 0L
    private var lastGpsFixMs: Long? = null
    private var lastGpsAccuracyM: Float? = null
    private var lastGpsLostMs: Long = 0L
    private var lastWatchDataSentMs = 0L
    private var lastHttpDataSentMs = 0L
    private var lastOfflineCaptureMs = 0L
    private var statusClearJob: kotlinx.coroutines.Job? = null

    // Run summary accumulators (for endSession)
    private var sumHr = 0.0; private var maxHr = 0; private var sumCadence = 0.0
    private var sumPace = 0.0; private var sumAscent = 0.0; private var sumDescent = 0.0
    private var sampleN = 0
    private var lastAlt: Double? = null

    // Coached-run metadata — stored for backend payloads, matching Garmin's "never rendered"
    // quirk exactly (see plan doc); intentionally not exposed in RunScreenState.
    private var coachTargetPace: String? = null
    private var coachWorkoutDesc: String? = null

    private val fusedLocationClient: FusedLocationProviderClient by lazy {
        LocationServices.getFusedLocationProviderClient(context)
    }
    private var locationUpdatesActive = false

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            lastGpsFixMs = System.currentTimeMillis()
            lastGpsAccuracyM = loc.accuracy
        }
    }

    fun start() {
        scope.launch {
            val token = prefs.getAuthTokenOnce()
            val storedMaxHr = prefs.getMaxHrOnce()
            _state.update { it.copy(isAuthenticated = !token.isNullOrBlank(), overlay = if (!token.isNullOrBlank()) Overlay.GPS_WAIT else Overlay.WAITING,
                maxHr = storedMaxHr) }
        }
        connectStartMs = System.currentTimeMillis()

        // The Data Layer's view of the phone is the connection state. This was never wired up,
        // so isPhoneConnected stayed false forever: the prepare screen always read "Phone not
        // connected", idle showed OFFLINE, and watch data was never streamed to the phone.
        scope.launch {
            dataLayer.isPhoneConnected.collect { connected ->
                val s = _state.value
                if (connected && !s.isPhoneConnected && s.isRunning && !phoneControlled) {
                    showStatus("Connected - streaming live", 4000L)
                }
                if (!connected && s.isPhoneConnected && s.isRunning && !phoneControlled) {
                    showStatus("Phone lost - saving offline", 5000L)
                }
                _state.update { it.copy(isPhoneConnected = connected) }
            }
        }

        val pendingCrash = CrashBreadcrumb.consumePending(context)
        dataLayer.onMessage = { type, payload -> handleMessage(type, payload) }
        dataLayer.start()
        dataLayer.sendCommand("watchReady", buildMap {
            put("hasPendingSync", false) // set true below if a persisted batch is found
            if (pendingCrash != null) put("lastCrash", pendingCrash)
        })
        if (pendingCrash != null) {
            showStatus("Last crash: $pendingCrash", 15_000L)
        }

        startLocationUpdates()
        scope.launch { tickLoop() }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /** "Continue without coaching" on the prepare-on-phone screen. */
    fun continueWithoutCoaching() {
        _state.update { it.copy(prepareGateDismissed = true) }
        vibeShort()
    }

    /**
     * Top button while idle. On the prepare-on-phone screen it continues without coaching; on
     * the post-run screen of an unprepared session it brings that screen back rather than
     * silently starting an uncoached run; otherwise it starts the run.
     */
    fun onIdleStartPressed() {
        val s = _state.value
        when {
            s.showPrepareGate -> continueWithoutCoaching()
            s.isFinished -> dismissFinished()
            else -> startRun()
        }
    }

    /** "Done" on the post-run screen: back to the prepare screen (or the ready screen). */
    fun dismissFinished() {
        _state.update { it.copy(isFinished = false, elapsedMs = 0, distanceM = 0.0, paceSecPerKm = 0.0,
            heartRate = 0, cadence = 0, avgPaceSecPerKm = 0.0, screenPage = 0) }
    }

    fun startRun() {
        val s = _state.value
        if (s.isRunning) return
        val minQuality = if (s.isPhoneConnected) 2 else 3
        if (s.gpsQuality < minQuality) {
            vibeShort()
            Log.d(TAG, "startRun blocked — gpsQuality=${s.gpsQuality} < $minQuality")
            return
        }

        isFinishing = false
        sumHr = 0.0; maxHr = 0; sumCadence = 0.0; sumPace = 0.0; sumAscent = 0.0; sumDescent = 0.0
        sampleN = 0; lastAlt = null
        offlineBuffer.reset()
        lastOfflineCaptureMs = 0L
        sessionId = UUID.randomUUID().toString()

        _state.update {
            it.copy(isRunning = true, isPaused = false, isFinished = false, overlay = Overlay.NONE)
        }

        if (videoDemo) {
            vibeShort()
            showStatus("Back button pauses", 4000L)
            return
        }

        health.startExercise(isWalk = s.isWalk)
        health.setCallbackActive(true)

        if (!phoneControlled) {
            scope.launch {
                httpApi.startSession(
                    SessionStartRequest(
                        sessionId = sessionId!!,
                        deviceId = Build.MODEL,
                        deviceModel = "Samsung Galaxy Watch (Wear OS)",
                        activityType = if (s.isWalk) "walking" else "running",
                        sessionType = s.sessionType,
                        plannedWorkoutId = plannedWorkoutId
                    )
                )
            }
        }

        dataLayer.sendHello(APP_VERSION)
        startRetry.start()
        vibeShort()
        // The one control mid-run is the bottom button, which nothing on screen points at.
        showStatus("Back button pauses", 4000L)
    }

    fun pauseRun() {
        val s = _state.value
        if (!s.isRunning || s.isPaused) return
        _state.update { it.copy(isPaused = true) }
        resumeRetry.cancel() // only one of pause/resume should ever be retrying at once
        pauseRetry.start()
        if (!videoDemo) health.pauseExercise()
        vibeShort()
    }

    fun resumeRun() {
        val s = _state.value
        if (!s.isPaused) return
        _state.update { it.copy(isPaused = false) }
        pauseRetry.cancel()
        resumeRetry.start()
        if (!videoDemo) health.resumeExercise()
        vibeShort()
    }

    fun finishRun() {
        isFinishing = true
        val s = _state.value
        _state.update { it.copy(isRunning = false, isPaused = false, isFinished = true, overlay = Overlay.NONE,
                isPrepared = false, prepareGateDismissed = false, preparedDistanceKm = null,
                preparedTargetPace = null, statusMessage = null, screenPage = 0) }
        statusClearJob?.cancel()
        startRetry.cancel()
        pauseRetry.cancel()
        resumeRetry.cancel()
        sessionReadySent = false
        if (videoDemo) {
            vibeLong()
            return
        }

        dataLayer.sendCommand("stop")
        stopRetry.start()

        health.endExercise()
        health.setCallbackActive(false)

        if (!phoneControlled && offlineBuffer.points.isNotEmpty()) {
            val sid = sessionId
            if (sid != null) {
                val tier = offlineBuffer.save(sid, s.distanceM.toFloat(), (s.elapsedMs / 1000).toInt(), sumAscent.toFloat())
                Log.d(TAG, "Offline buffer saved: $tier (${offlineBuffer.points.size} pts)")
                dataLayer.sendCommand("pendingSync")
            }
        }

        if (!phoneControlled && sampleN > 0 && sessionId != null &&
            s.distanceM >= MIN_SAVE_DISTANCE_M && s.elapsedMs / 1000 >= MIN_SAVE_DURATION_S
        ) {
            val n = sampleN.toDouble()
            scope.launch {
                httpApi.endSession(
                    SessionEndRequest(
                        sessionId = sessionId!!,
                        sessionType = s.sessionType,
                        summary = SessionSummary(
                            totalDistance = s.distanceM,
                            totalDuration = s.elapsedMs / 1000,
                            avgHeartRate = if (sumHr > 0) (sumHr / n).toInt() else null,
                            maxHeartRate = if (maxHr > 0) maxHr else null,
                            avgCadence = if (sumCadence > 0) (sumCadence / n).toInt() else null,
                            avgPace = if (sumPace > 0) sumPace / n else null,
                            totalAscent = sumAscent.takeIf { it > 0 },
                            totalDescent = sumDescent.takeIf { it > 0 }
                        ),
                        plannedWorkoutId = plannedWorkoutId
                    )
                )
                // If the buffer was persisted above, flush it too (upload-batch enriches the
                // just-created run with full GPS/HR/pace series — see server/routes.ts).
                val sid = sessionId
                if (sid != null && offlineBuffer.points.isNotEmpty()) {
                    val runId = httpApi.uploadBatch(
                        sid,
                        UploadBatchRequest(
                            sessionId = sid,
                            sessionType = s.sessionType,
                            points = offlineBuffer.points.map {
                                listOf(it.elapsedS, it.latE5, it.lngE5, it.altDm, it.hr, it.cadence, it.paceDs)
                            },
                            distanceM = s.distanceM.toFloat(),
                            durationSec = (s.elapsedMs / 1000).toInt(),
                            totalAscent = sumAscent.toFloat(),
                            plannedWorkoutId = plannedWorkoutId
                        )
                    )
                    offlineBuffer.clearPersisted()
                    dataLayer.sendCommand("syncComplete", buildMap {
                        put("sessionId", sid)
                        if (runId != null) put("runId", runId)
                    })
                }
            }
        }

        // Ported from the Garmin side (2026-09): phoneControlled was previously only ever reset
        // by the phone's "sessionEnded" message — stopping a phone-controlled run from the
        // watch's own button (this function) never reached that message, so the flag stayed
        // stuck true and the very next session (even one started fresh from the watch) was
        // wrongly treated as phone-controlled: no fresh standalone session ID, no offline
        // backup, no standalone endSession() call. Reset here, after the !phoneControlled-gated
        // logic above has already run for THIS session using its correct value.
        phoneControlled = false

        vibeLong()
    }

    fun toggleScreen() {
        _state.update { it.copy(screenPage = if (it.screenPage == 0) 1 else 0) }
    }

    fun requestTalkToCoach() {
        dataLayer.sendCommand("talkToCoach")
        vibeShort()
        showStatus("Asking coach...", 2000L)
    }

    /** FINISH on the paused screen — the same confirmation the bottom button opens. */
    fun requestFinish() {
        _pendingConfirm.value = live.airuncoach.airuncoach.wear.ui.BackAction.ConfirmFinish
    }

    fun onBackPressed(): live.airuncoach.airuncoach.wear.ui.BackAction {
        val s = _state.value
        val action = when {
            s.isRunning && !s.isPaused -> {
                pauseRun()
                live.airuncoach.airuncoach.wear.ui.BackAction.Pause
            }
            s.isPaused -> live.airuncoach.airuncoach.wear.ui.BackAction.ConfirmFinish
            else -> live.airuncoach.airuncoach.wear.ui.BackAction.ConfirmExit
        }
        if (action == live.airuncoach.airuncoach.wear.ui.BackAction.ConfirmFinish ||
            action == live.airuncoach.airuncoach.wear.ui.BackAction.ConfirmExit
        ) {
            _pendingConfirm.value = action
        }
        return action
    }

    // ── Phone message dispatch (mirrors RunView.mc's _onPhoneMessageInner) ─────

    private fun handleMessage(type: String, payload: Map<String, Any?>) {
        when (type) {
            "auth" -> {
                val token = payload["authToken"] as? String
                val runnerName = payload["runnerName"] as? String ?: ""
                // Absent unless the phone knows the runner's age — then no zone is shown.
                val maxHrValue = (payload["maxHr"] as? Number)?.toInt()?.takeIf { it > 0 }
                if (!token.isNullOrBlank()) {
                    scope.launch { prefs.setAuth(token, runnerName, maxHrValue) }
                    _state.update {
                        it.copy(
                            isAuthenticated = true,
                            maxHr = maxHrValue ?: it.maxHr,
                            overlay = overlayAfterAuth(it)
                        )
                    }
                    dataLayer.sendHello(APP_VERSION)
                    if (_state.value.gpsQuality >= 3 && !_state.value.isRunning && !sessionReadySent) {
                        dataLayer.sendCommand("sessionReady")
                        sessionReadySent = true
                    }
                }
            }
            "startAck" -> startRetry.cancel()
            "startRun" -> {
                phoneControlled = true
                _state.update { it.copy(isRunning = true, isPaused = false, overlay = Overlay.NONE) }
            }
            "preparedRun" -> {
                val sType = payload["sessionType"] as? String
                if (sType != null) {
                    scope.launch { prefs.setSessionType(sType) }
                    _state.update { it.copy(sessionType = sType) }
                    dataLayer.sendCommand("sessionTypeAck")
                }
                coachTargetPace = (payload["targetPace"] as? String)?.takeIf { it.isNotBlank() }
                coachWorkoutDesc = payload["workoutDesc"] as? String
                plannedWorkoutId = payload["plannedWorkoutId"] as? String
                scope.launch { prefs.setPlannedWorkoutId(plannedWorkoutId) }
                // Leaves the prepare-on-phone screen for the ready screen, which shows what was
                // prepared. A new preparedRun replaces the last one entirely (Garmin 3.4.9).
                val dist = (payload["distance"] as? Number)?.toDouble()?.takeIf { it > 0 }
                if (!_state.value.isRunning) _state.update {
                    it.copy(isPrepared = true, isFinished = false, preparedDistanceKm = dist,
                        preparedTargetPace = coachTargetPace)
                }
            }
            "preparedRunCancelled" -> {
                // Runner backed out of the prepared session on the phone — back to the
                // prepare-on-phone screen. Ignored mid-run.
                if (!_state.value.isRunning && !_state.value.isPaused) {
                    coachTargetPace = null
                    coachWorkoutDesc = null
                    plannedWorkoutId = null
                    scope.launch { prefs.setPlannedWorkoutId(null) }
                    _state.update { it.copy(isPrepared = false, prepareGateDismissed = false,
                        preparedDistanceKm = null, preparedTargetPace = null) }
                }
            }
            "sessionType" -> {
                val sType = payload["sessionType"] as? String
                if (sType != null) {
                    scope.launch { prefs.setSessionType(sType) }
                    _state.update { it.copy(sessionType = sType) }
                    dataLayer.sendCommand("sessionTypeAck")
                }
            }
            "disconnect" -> {
                val midRun = _state.value.isPhoneConnected && _state.value.isRunning && !phoneControlled
                _state.update { it.copy(isPhoneConnected = false) }
                if (midRun) showStatus("Phone lost - saving offline", 5000L)
            }
            "runUpdate" -> {
                if (isFinishing) return
                startRetry.cancel()
                if (phoneControlled) {
                    val pace = (payload["pace"] as? Number)?.toDouble()
                    val dist = (payload["distance"] as? Number)?.toDouble()
                    val hr = (payload["hr"] as? Number)?.toInt()
                    val elapsed = (payload["elapsedTime"] as? Number)?.toLong()
                    val cad = (payload["cadence"] as? Number)?.toInt()
                    _state.update {
                        it.copy(
                            paceSecPerKm = pace ?: it.paceSecPerKm,
                            distanceM = dist ?: it.distanceM,
                            heartRate = hr ?: it.heartRate,
                            elapsedMs = (elapsed ?: (it.elapsedMs / 1000)) * 1000,
                            cadence = cad ?: it.cadence
                        )
                    }
                }
                val running = payload["isRunning"] as? Boolean
                val paused = payload["isPaused"] as? Boolean
                _state.update {
                    it.copy(
                        isRunning = running ?: it.isRunning,
                        isPaused = paused ?: it.isPaused,
                        overlay = if (running == true) Overlay.NONE else it.overlay
                    )
                }
            }
            "statusMessage" -> {
                val msg = payload["message"] as? String
                if (msg != null) { showStatus(msg, 5000L); vibeShort() }
            }
            "coachingCue" -> vibeShort()
            "pauseAck" -> pauseRetry.cancel()
            "resumeAck" -> resumeRetry.cancel()
            "stopAck" -> stopRetry.cancel()
            "sessionEnded" -> {
                stopRetry.cancel()
                pauseRetry.cancel()
                resumeRetry.cancel()
                isFinishing = true
                _state.update { it.copy(isRunning = false, isPaused = false, isFinished = true, overlay = Overlay.NONE,
                isPrepared = false, prepareGateDismissed = false, preparedDistanceKm = null,
                preparedTargetPace = null, screenPage = 0) }
                phoneControlled = false
                sessionReadySent = false
                health.endExercise()
                health.setCallbackActive(false)
                vibeLong()
                isFinishing = false
            }
        }
    }

    // ── Periodic tick (250ms) — mirrors RunView.mc's onTick() ──────────────────

    @SuppressLint("MissingPermission")
    private suspend fun tickLoop() {
        while (true) {
            delay(250L)
            tick()
        }
    }

    private fun tick() {
        val now = System.currentTimeMillis()
        val s = _state.value

        // GPS quality from the FusedLocationProviderClient listener.
        val fixAge = lastGpsFixMs?.let { now - it }
        val quality = if (videoDemo) demoGpsQuality else resolveGpsQuality(lastGpsAccuracyM, fixAge)
        val gpsLost = s.isRunning && !s.isPaused && quality < 2 &&
            (now - lastGpsLostMs).let { it > GPS_LOST_THRESHOLD_MS }
        if (quality >= 2) lastGpsLostMs = now

        val offlineGraceElapsed = (now - connectStartMs) >= CONNECT_WAIT_GRACE_MS

        if (s.isRunning && !s.isPaused) {
            val m = if (videoDemo) videoDemoMetrics(now) else health.metrics.value
            val pace = if (m.speedMs != null && m.speedMs > 0.3 && m.speedMs <= 5.5) 1000.0 / m.speedMs else s.paceSecPerKm
            if (m.heartRate > 0) { sumHr += m.heartRate; if (m.heartRate > maxHr) maxHr = m.heartRate }
            if (m.cadenceSpm > 0) sumCadence += m.cadenceSpm
            if (pace > 0) sumPace += pace
            sampleN++

            // lastAlt is an ANCHOR, not the previous sample: it only moves once a change clears
            // the threshold. Re-anchoring on every sample turned the threshold into a per-sample
            // filter — a runner climbs ~0.1 m/s, so a real climb never cleared it one second at
            // a time and was discarded, while single-sample GPS spikes still got counted. Same
            // fix as the Garmin app (RunView.mc). 5 m because altM is GPS altitude (Health
            // Services LOCATION), whose noise is several metres; noise oscillates around the
            // anchor without ever clearing it, a genuine climb builds until it does.
            m.altM?.let { alt ->
                val anchor = lastAlt
                if (anchor == null) {
                    lastAlt = alt
                } else {
                    val delta = alt - anchor
                    if (delta > GPS_ALT_THRESHOLD_M) { sumAscent += delta; lastAlt = alt }
                    else if (delta < -GPS_ALT_THRESHOLD_M) { sumDescent += -delta; lastAlt = alt }
                }
            }

            _state.update {
                it.copy(
                    elapsedMs = m.elapsedMs,
                    distanceM = m.distanceM,
                    paceSecPerKm = pace,
                    heartRate = m.heartRate,
                    cadence = m.cadenceSpm,
                    avgPaceSecPerKm = if (sampleN > 0) sumPace / sampleN else 0.0,
                    gpsQuality = quality,
                    gpsLost = gpsLost,
                    offlineGraceElapsed = offlineGraceElapsed
                )
            }

            if (videoDemo) {
                if (m.distanceM >= 5000.0) finishRun()
            } else {
                maybeCaptureOfflinePoint(now, m)
                maybeSendWatchData(now, m)
                maybeSendHttpData(now, m)
            }
        } else {
            // Mirrors RunView.mc: once GPS becomes ready while idle+authenticated, the watch
            // moves off the GPS_WAIT overlay into the normal idle dashboard (StartHintArc +
            // "PRESS START") on its own — it does not wait for the user to press start first.
            val minQuality = if (s.isPhoneConnected) 2 else 3
            val readyToTransition = s.overlay == Overlay.GPS_WAIT && s.isAuthenticated && quality >= minQuality
            _state.update {
                it.copy(
                    gpsQuality = quality,
                    gpsLost = false,
                    offlineGraceElapsed = offlineGraceElapsed,
                    overlay = if (readyToTransition) Overlay.NONE else it.overlay
                )
            }
        }
    }

    private fun maybeCaptureOfflinePoint(now: Long, m: live.airuncoach.airuncoach.wear.sensors.ExerciseMetrics) {
        if (phoneControlled) return
        if (now - lastOfflineCaptureMs < OFFLINE_CAPTURE_INTERVAL_MS) return
        lastOfflineCaptureMs = now
        val lat = m.lat ?: return
        val lng = m.lng ?: return
        offlineBuffer.addPoint(
            GpsPoint(
                elapsedS = (m.elapsedMs / 1000).toInt(),
                latE5 = (lat * 100000).toInt(),
                lngE5 = (lng * 100000).toInt(),
                altDm = ((m.altM ?: 0.0) * 10).toInt(),
                hr = m.heartRate,
                cadence = m.cadenceSpm,
                paceDs = (_state.value.paceSecPerKm * 10).toInt()
            )
        )
    }

    private fun maybeSendWatchData(now: Long, m: live.airuncoach.airuncoach.wear.sensors.ExerciseMetrics) {
        if (!_state.value.isPhoneConnected) return
        if (now - lastWatchDataSentMs < WATCH_DATA_INTERVAL_MS) return
        lastWatchDataSentMs = now
        dataLayer.sendWatchData(
            mapOf(
                "lat" to m.lat, "lng" to m.lng, "alt" to m.altM, "speed" to m.speedMs,
                "bear" to m.bearingDeg, "acc" to lastGpsAccuracyM,
                "hr" to m.heartRate, "hrz" to 1, "cad" to m.cadenceSpm,
                "elap" to (m.elapsedMs / 1000).toInt(), "dist" to m.distanceM.toFloat()
            )
        )
    }

    private fun maybeSendHttpData(now: Long, m: live.airuncoach.airuncoach.wear.sensors.ExerciseMetrics) {
        // Always streams now, connected or not — previously gated to standalone-only
        // (mirroring Garmin's old !_isConnected gate), which left the backend with zero
        // live data for the common phone-connected case. That's the only source
        // RunTrackingService's OS-kill reattach recovery and server-side coaching
        // enrichment read from, so gating it defeated both for the common case. See
        // garmin-companion-app's RunView.mc for the equivalent fix and full rationale.
        if (now - lastHttpDataSentMs < HTTP_DATA_INTERVAL_MS) return
        lastHttpDataSentMs = now
        val sid = sessionId ?: return
        scope.launch {
            httpApi.sendData(
                SessionDataRequest(
                    sessionId = sid,
                    timestamp = now,
                    heartRate = m.heartRate.takeIf { it > 0 },
                    heartRateZone = null,
                    cadence = m.cadenceSpm.takeIf { it > 0 },
                    pace = _state.value.paceSecPerKm.takeIf { it > 0 },
                    cumulativeDistance = m.distanceM,
                    elapsedTime = m.elapsedMs / 1000,
                    altitude = m.altM,
                    isMoving = true,
                    isPaused = _state.value.isPaused,
                    latitude = m.lat,
                    longitude = m.lng
                )
            )
        }
    }

    // ── Video recording mode (debug builds only) — see WearVideoDemoMode.kt ─────

    private var videoDemo = false
    private var demoGpsQuality = 0
    private var demoStartMs = 0L
    private var demoSec = 0
    private var demoDistanceM = 0.0

    /** Back to a fresh, unpaired watch: the pairing screen. */
    internal fun videoDemoEnable() {
        if (!BuildConfig.DEBUG) return
        videoDemo = true
        demoGpsQuality = 0
        phoneControlled = false
        isFinishing = false
        _pendingConfirm.value = null
        _state.value = RunScreenState(overlay = Overlay.WAITING)
    }

    /** The phone app pushed its token: linked, prepare-on-phone screen, "Waiting for phone…"
     * ([phone] false: paired earlier, phone not around — "Phone not connected"). */
    internal fun videoDemoLink(phone: Boolean) {
        if (!videoDemo) return
        // maxHr: what the phone sends for a 36-year-old (208 − 0.7 × 36), so the HR label shows a zone.
        _state.update { it.copy(isAuthenticated = true, isPhoneConnected = phone, offlineGraceElapsed = true,
            maxHr = 183, overlay = overlayAfterAuth(it)) }
    }

    /** "Prepare for Watch" on the phone, then GPS locking over ~8 s into the ready screen. */
    internal fun videoDemoPrepare() {
        if (!videoDemo) return
        handleMessage("preparedRun", mapOf("type" to "preparedRun", "distance" to 5.0, "runType" to "free",
            "targetPace" to "5:20", "sessionType" to "run"))
        videoDemoGpsLock()
    }

    internal fun videoDemoGpsLock() {
        if (!videoDemo) return
        scope.launch {
            for ((delayMs, q) in listOf(1500L to 1, 3500L to 2, 2000L to 3, 2000L to 4)) {
                delay(delayMs)
                demoGpsQuality = q
            }
        }
    }

    /** Watch START. [skipSec] starts the run that far in, for re-takes of the finish. */
    internal fun videoDemoStart(skipSec: Int) {
        if (!videoDemo) return
        demoStartMs = System.currentTimeMillis() - skipSec * 1000L
        demoSec = 0
        demoDistanceM = 0.0
        startRun()
    }

    /** Paced by the wall clock; missed seconds are caught up in one go, as on the phone. */
    private fun videoDemoMetrics(now: Long): live.airuncoach.airuncoach.wear.sensors.ExerciseMetrics {
        val due = ((now - demoStartMs) / 1000).toInt()
        while (demoSec < due && demoDistanceM < 5000.0) {
            demoSec += 1
            demoDistanceM += WearVideoDemoMode.speed(demoSec)
        }
        return WearVideoDemoMode.metrics(demoSec, demoDistanceM)
    }

    // ── GPS ───────────────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        if (locationUpdatesActive) return
        try {
            val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L).build()
            fusedLocationClient.requestLocationUpdates(request, locationCallback, context.mainLooper)
            locationUpdatesActive = true
        } catch (e: SecurityException) {
            Log.w(TAG, "startLocationUpdates: location permission not granted")
        }
    }

    // ── Status message (ephemeral, auto-clears) ─────────────────────────────────

    private fun showStatus(message: String, durationMs: Long) {
        statusClearJob?.cancel()
        _state.update { it.copy(statusMessage = message) }
        statusClearJob = scope.launch {
            delay(durationMs)
            _state.update { it.copy(statusMessage = null) }
        }
    }

    // ── Haptics ───────────────────────────────────────────────────────────────

    private fun vibeShort() = vibrate(longArrayOf(0, 100))
    private fun vibeLong() = vibrate(longArrayOf(0, 200, 100, 200))

    private fun vibrate(pattern: LongArray) {
        try {
            val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } catch (e: Exception) {
            Log.w(TAG, "vibrate failed: ${e.message}")
        }
    }
}
