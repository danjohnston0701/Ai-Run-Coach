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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import live.airuncoach.airuncoach.wear.BuildConfig
import live.airuncoach.airuncoach.wear.data.DirectHttpApiClient
import live.airuncoach.airuncoach.wear.data.RetryLoop
import live.airuncoach.airuncoach.wear.data.RunSyncer
import live.airuncoach.airuncoach.wear.data.SessionDataRequest
import live.airuncoach.airuncoach.wear.data.SessionStartRequest
import live.airuncoach.airuncoach.wear.data.WearDataLayerClient
import live.airuncoach.airuncoach.wear.sensors.HealthServicesManager
import live.airuncoach.airuncoach.wear.sensors.resolveGpsQuality
import live.airuncoach.airuncoach.wear.storage.CrashBreadcrumb
import live.airuncoach.airuncoach.wear.storage.GpsPoint
import live.airuncoach.airuncoach.wear.storage.OfflineGpsBuffer
import live.airuncoach.airuncoach.wear.storage.PendingRunStore
import live.airuncoach.airuncoach.wear.storage.RunRecord
import live.airuncoach.airuncoach.wear.storage.SaveTier
import live.airuncoach.airuncoach.wear.storage.WearPreferences
import live.airuncoach.airuncoach.wear.sync.SyncWorker
import org.json.JSONObject
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
    private val offlineBuffer: OfflineGpsBuffer,
    private val store: PendingRunStore,
    private val syncer: RunSyncer
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
        private const val WATCH_DATA_INTERVAL_MS = 2000L
        private const val HTTP_DATA_INTERVAL_MS = 1000L
        /** How much of a run a flat battery or a killed app can cost. */
        private const val CHECKPOINT_INTERVAL_MS = 30_000L
        // DataStreamer.mc: 5 retries 2 s apart, waiting for the token if it hasn't arrived.
        private const val SESSION_START_ATTEMPTS = 6
        private const val SESSION_START_RETRY_MS = 5_000L
        /** What the server's watchDeviceLabel()/watchExternalSource() key Galaxy runs on. */
        const val DEVICE_MODEL = "Samsung Galaxy Watch (Wear OS)"
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
    private var lastCheckpointMs = 0L
    private var statusClearJob: kotlinx.coroutines.Job? = null

    /** Moving time of the current watch-owned run (pauses excluded). */
    private val clock = ActiveClock()
    private var startedAtEpochSec = 0L
    /** session/start reached the server for [sessionId]. */
    @Volatile private var sessionStarted = false
    /** Distance already covered before a relaunch — Health Services reports 0 until its first
     * update after reattaching, which must not wipe the distance off the screen/checkpoint. */
    private var distanceFloorM = 0.0
    private val checkpointMutex = Mutex()

    /** Crash breadcrumb from the previous app run, forwarded with the first watchReady that
     * actually reaches the phone. */
    private var pendingCrashForPhone: String? = null
    /** The server rejected our token mid-run; drop back to pairing once the run is over. */
    private var authExpiredPending = false

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
        connectStartMs = System.currentTimeMillis()
        pendingCrashForPhone = CrashBreadcrumb.consumePending(context)
        pendingCrashForPhone?.let { showStatus("Last crash: $it", 15_000L) }

        // The Data Layer's view of the phone is the connection state. Every time the phone
        // (re)appears: say hello (the phone answers with auth, any prepared run and the session
        // type — it can't before it knows the watch is there; a watchReady sent at launch was
        // dropped because no phone node was known yet), report runs that synced while it was
        // away, and try the queue again since the watch may now have the phone's internet.
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
                if (connected && !s.isPhoneConnected) onPhoneReachable()
            }
        }

        dataLayer.onMessage = { type, payload -> handleMessage(type, payload) }
        dataLayer.start()
        startLocationUpdates()

        scope.launch {
            val token = prefs.getAuthTokenOnce()
            val storedMaxHr = prefs.getMaxHrOnce()
            val storedType = prefs.getSessionTypeOnce()
            _state.update { it.copy(isAuthenticated = !token.isNullOrBlank(), overlay = if (!token.isNullOrBlank()) Overlay.GPS_WAIT else Overlay.WAITING,
                maxHr = storedMaxHr, sessionType = storedType ?: it.sessionType) }
            // A prepared session survives the app restarting before the run starts.
            prefs.getPreparedRunOnce()?.let { json ->
                runCatching { dataLayer.jsonToMap(JSONObject(json)) }.getOrNull()?.let {
                    applyPreparedRun(it, persist = false)
                }
            }

            recoverInterruptedRun()
            if (!_state.value.isRunning) RunTrackingService.stop(context)

            sendWatchReady()
            if (store.hasPending()) requestSync()
            tickLoop()
        }
    }

    /**
     * A checkpoint on launch means the last run never reached FINISH. If Health Services is
     * still recording it, the app was killed or crashed mid-run: carry on with the same run.
     * Otherwise (battery died, watch restarted) save what the checkpoint holds as a finished
     * run so it syncs — losing at most the last [CHECKPOINT_INTERVAL_MS].
     */
    private suspend fun recoverInterruptedRun() {
        val cp = store.loadCheckpoint()
        val exerciseRunning = health.isOwnExerciseInProgress()
        if (cp == null || cp.sessionId.isBlank()) {
            // A workout left running with nothing to attach it to (killed before the first
            // checkpoint): stop it rather than leave GPS and HR on until the battery dies.
            if (exerciseRunning == true) health.endExercise()
            return
        }
        if (exerciseRunning == true && cp.clock != null) {
            resumeFromCheckpoint(cp)
            return
        }
        if (exerciseRunning == true) health.endExercise()
        store.clearCheckpoint()
        if (cp.sampleCount > 0) {
            val tier = store.enqueue(cp.copy(recovered = true, clock = null))
            Log.d(TAG, "Unfinished run ${cp.sessionId} saved from checkpoint: $tier")
            showStatus("Unfinished run saved", 6000L)
        }
    }

    private fun resumeFromCheckpoint(cp: RunRecord) {
        Log.d(TAG, "Reattaching to run ${cp.sessionId} after a relaunch")
        phoneControlled = false
        isFinishing = false
        sessionId = cp.sessionId
        plannedWorkoutId = cp.plannedWorkoutId
        startedAtEpochSec = cp.startedAtEpochSec
        sessionStarted = cp.sessionStarted
        cp.clock?.let { clock.restore(it) }
        sampleN = cp.sampleCount
        sumHr = cp.sumHeartRate; maxHr = cp.maxHeartRate ?: 0; sumCadence = cp.sumCadence
        sumPace = cp.sumPace; sumAscent = cp.totalAscentM; sumDescent = cp.totalDescentM
        lastAlt = cp.lastAltM
        offlineBuffer.restore(cp.points)
        distanceFloorM = cp.distanceM
        lastOfflineCaptureMs = 0L
        lastCheckpointMs = System.currentTimeMillis()
        val now = System.currentTimeMillis()
        _state.update {
            it.copy(isRunning = true, isPaused = cp.isPaused, isFinished = false, overlay = Overlay.NONE,
                sessionType = cp.sessionType, distanceM = cp.distanceM, elapsedMs = clock.elapsedMs(now),
                avgPaceSecPerKm = cp.avgPaceSecPerKm ?: 0.0)
        }
        health.reattach()
        RunTrackingService.start(context)
        if (!sessionStarted) startSessionWithRetry(cp.sessionId, cp.sessionType)
        showStatus("Run recovered", 5000L)
        vibeShort()
    }

    /** WearMainActivity.onResume — the one moment a foreground service can always be started. */
    fun onUiVisible() {
        if (_state.value.isRunning && !phoneControlled && !videoDemo) RunTrackingService.start(context)
    }

    private fun onPhoneReachable() {
        sendWatchReady()
        store.takeUnnotified().forEach { notifySyncComplete(it.sessionId, it.runId) }
        if (store.hasPending()) requestSync()
    }

    private fun sendWatchReady() {
        val crash = pendingCrashForPhone
        val sent = dataLayer.sendCommand("watchReady", buildMap {
            put("hasPendingSync", store.hasPending())
            if (crash != null) put("lastCrash", crash)
        })
        if (sent) pendingCrashForPhone = null
    }

    // ── Sync of queued runs ───────────────────────────────────────────────────

    /** Try the queue now, and leave a network-gated background retry behind if anything's left. */
    fun requestSync() {
        scope.launch(Dispatchers.IO) {
            val result = syncer.syncAll()
            Log.d(TAG, "Sync: $result")
            if (result.remaining > 0 && !result.authBlocked) SyncWorker.schedule(context)
        }
    }

    /** RunSyncer's notifyPhone: false when the phone isn't there to hear it. */
    internal fun notifySyncComplete(sid: String, runId: String?): Boolean {
        if (!_state.value.isPhoneConnected) return false
        return dataLayer.sendCommand("syncComplete", buildMap {
            put("sessionId", sid)
            if (runId != null) put("runId", runId)
        })
    }

    // ── Expired sign-in (DataStreamer.mc's _markAuthExpired) ──────────────────

    /** DirectHttpApiClient's 401 callback (any thread). */
    fun onAuthRejected(token: String) {
        scope.launch {
            prefs.rejectAuth(token)
            if (_state.value.isRunning) {
                // Keep recording — the run is saved on the watch and syncs once re-paired.
                authExpiredPending = true
            } else {
                applyAuthExpired()
            }
        }
    }

    private fun applyAuthExpired() {
        authExpiredPending = false
        _state.update { it.copy(isAuthenticated = false, overlay = Overlay.WAITING) }
        // The phone answers watchReady with its current token — a fresh one if it has signed in
        // again since; the same dead one is ignored in "auth" below.
        sendWatchReady()
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
        distanceFloorM = 0.0
        sessionStarted = false
        val now = System.currentTimeMillis()
        clock.start(now)
        startedAtEpochSec = now / 1000
        lastCheckpointMs = now
        val sid = UUID.randomUUID().toString()
        sessionId = sid

        _state.update {
            it.copy(isRunning = true, isPaused = false, isFinished = false, overlay = Overlay.NONE,
                elapsedMs = 0, distanceM = 0.0, paceSecPerKm = 0.0, avgPaceSecPerKm = 0.0)
        }

        if (videoDemo) {
            vibeShort()
            showStatus("Back button pauses", 4000L)
            return
        }

        health.startExercise(isWalk = s.isWalk)
        health.setCallbackActive(true)
        RunTrackingService.start(context)

        if (!phoneControlled) {
            startSessionWithRetry(sid, s.sessionType)
            writeCheckpoint()
        }

        dataLayer.sendHello(APP_VERSION)
        startRetry.start()
        vibeShort()
        // The one control mid-run is the bottom button, which nothing on screen points at.
        showStatus("Back button pauses", 4000L)
    }

    /**
     * POST session/start, retried like DataStreamer.mc — including waiting for a token that
     * hasn't arrived yet. The run is recorded either way; this only decides whether the server
     * sees it live (coaching, the phone's reattach recovery) or just when it syncs.
     */
    private fun startSessionWithRetry(sid: String, sessionType: String) {
        scope.launch(Dispatchers.IO) {
            repeat(SESSION_START_ATTEMPTS) { attempt ->
                if (sessionId != sid || !_state.value.isRunning) return@launch
                if (!prefs.getAuthTokenOnce().isNullOrBlank()) {
                    val result = httpApi.startSession(
                        SessionStartRequest(
                            sessionId = sid,
                            deviceId = Build.MODEL,
                            deviceModel = DEVICE_MODEL,
                            activityType = if (sessionType == "walk") "walking" else "running",
                            sessionType = sessionType,
                            plannedWorkoutId = plannedWorkoutId
                        )
                    )
                    if (result.ok) {
                        sessionStarted = true
                        return@launch
                    }
                    if (result.unauthorized) return@launch
                }
                if (attempt < SESSION_START_ATTEMPTS - 1) delay(SESSION_START_RETRY_MS)
            }
            Log.w(TAG, "session/start never reached the server for $sid — the run syncs at the finish")
        }
    }

    fun pauseRun() {
        val s = _state.value
        if (!s.isRunning || s.isPaused) return
        clock.pause(System.currentTimeMillis())
        _state.update { it.copy(isPaused = true, elapsedMs = clock.elapsedMs(System.currentTimeMillis())) }
        resumeRetry.cancel() // only one of pause/resume should ever be retrying at once
        pauseRetry.start()
        if (!videoDemo) {
            health.pauseExercise()
            if (!phoneControlled) writeCheckpoint()
        }
        vibeShort()
    }

    fun resumeRun() {
        val s = _state.value
        if (!s.isPaused) return
        clock.resume(System.currentTimeMillis())
        _state.update { it.copy(isPaused = false) }
        pauseRetry.cancel()
        resumeRetry.start()
        if (!videoDemo) {
            health.resumeExercise()
            if (!phoneControlled) writeCheckpoint()
        }
        vibeShort()
    }

    fun finishRun() {
        isFinishing = true
        val now = System.currentTimeMillis()
        if (!phoneControlled && clock.isStarted) {
            _state.update { it.copy(elapsedMs = clock.elapsedMs(now)) }
        }
        val s = _state.value
        val record = if (!phoneControlled && !videoDemo) buildRecord(now, s) else null
        _state.update { it.copy(isRunning = false, isPaused = false, isFinished = true, overlay = Overlay.NONE,
                isPrepared = false, prepareGateDismissed = false, preparedDistanceKm = null,
                preparedTargetPace = null, statusMessage = null, screenPage = 0) }
        statusClearJob?.cancel()
        startRetry.cancel()
        pauseRetry.cancel()
        resumeRetry.cancel()
        sessionReadySent = false
        clock.reset()
        if (videoDemo) {
            vibeLong()
            return
        }

        dataLayer.sendCommand("stop")
        stopRetry.start()

        health.endExercise()
        health.setCallbackActive(false)
        RunTrackingService.stop(context)

        // Queue first, then try to sync: the run is only ever removed from the watch once the
        // server has confirmed it (RunSyncer). It used to upload once from here and delete its
        // copy whatever the outcome, so a run finished without a connection was simply lost.
        if (record != null && record.sampleCount > 0) {
            scope.launch(Dispatchers.IO) {
                checkpointMutex.withLock {
                    val tier = store.enqueue(record)
                    Log.d(TAG, "Run ${record.sessionId} queued: $tier (${record.points.size} pts)")
                    if (tier != SaveTier.FAILED) store.clearCheckpoint()
                }
                dataLayer.sendCommand("pendingSync")
                requestSync()
            }
        } else {
            scope.launch(Dispatchers.IO) { checkpointMutex.withLock { store.clearCheckpoint() } }
        }

        // This run's prepared session is used up — the next run asks again (and must not be
        // linked to the same plan workout).
        plannedWorkoutId = null
        coachTargetPace = null
        coachWorkoutDesc = null
        scope.launch {
            prefs.setPlannedWorkoutId(null)
            prefs.setPreparedRun(null)
        }

        // Ported from the Garmin side (2026-09): phoneControlled was previously only ever reset
        // by the phone's "sessionEnded" message — stopping a phone-controlled run from the
        // watch's own button (this function) never reached that message, so the flag stayed
        // stuck true and the very next session (even one started fresh from the watch) was
        // wrongly treated as phone-controlled: no fresh standalone session ID, no offline
        // backup, no standalone session/end. Reset here, after the !phoneControlled-gated
        // logic above has already run for THIS session using its correct value.
        phoneControlled = false
        if (authExpiredPending) applyAuthExpired()

        vibeLong()
    }

    /** The run so far, as saved to the checkpoint / queue. */
    private fun buildRecord(now: Long, s: RunScreenState): RunRecord? {
        val sid = sessionId ?: return null
        val n = sampleN.toDouble()
        return RunRecord(
            sessionId = sid,
            sessionType = s.sessionType,
            plannedWorkoutId = plannedWorkoutId,
            startedAtEpochSec = startedAtEpochSec,
            finishedAtMs = now,
            distanceM = s.distanceM,
            durationSec = (clock.elapsedMs(now) / 1000).toInt(),
            totalAscentM = sumAscent,
            totalDescentM = sumDescent,
            avgHeartRate = if (sumHr > 0) (sumHr / n).toInt() else null,
            maxHeartRate = if (maxHr > 0) maxHr else null,
            avgCadence = if (sumCadence > 0) (sumCadence / n).toInt() else null,
            avgPaceSecPerKm = if (sumPace > 0) sumPace / n else null,
            points = offlineBuffer.compact(),
            sessionStarted = sessionStarted,
            clock = clock.snapshot(),
            isPaused = s.isPaused,
            sampleCount = sampleN,
            sumHeartRate = sumHr,
            sumCadence = sumCadence,
            sumPace = sumPace,
            lastAltM = lastAlt
        )
    }

    private fun writeCheckpoint() {
        val now = System.currentTimeMillis()
        lastCheckpointMs = now
        val record = buildRecord(now, _state.value) ?: return
        scope.launch(Dispatchers.IO) {
            checkpointMutex.withLock {
                // A checkpoint landing after FINISH would resurrect the run on the next launch.
                if (_state.value.isRunning && sessionId == record.sessionId) store.saveCheckpoint(record)
            }
        }
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
                    scope.launch { acceptAuth(token, runnerName, maxHrValue) }
                }
            }
            "startAck" -> startRetry.cancel()
            "startRun" -> {
                phoneControlled = true
                _state.update { it.copy(isRunning = true, isPaused = false, overlay = Overlay.NONE) }
            }
            "preparedRun" -> applyPreparedRun(payload, persist = true)
            "preparedRunCancelled" -> {
                // Runner backed out of the prepared session on the phone — back to the
                // prepare-on-phone screen. Ignored mid-run.
                if (!_state.value.isRunning && !_state.value.isPaused) {
                    coachTargetPace = null
                    coachWorkoutDesc = null
                    plannedWorkoutId = null
                    scope.launch {
                        prefs.setPlannedWorkoutId(null)
                        prefs.setPreparedRun(null)
                    }
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
                RunTrackingService.stop(context)
                vibeLong()
                isFinishing = false
            }
        }
    }

    private suspend fun acceptAuth(token: String, runnerName: String, maxHrValue: Int?) {
        // The server already said no to this exact token — adopting it again would just fail
        // every call (and loop: 401 → watchReady → same token). Wait for the phone to sign in.
        if (token == prefs.getRejectedTokenOnce()) {
            Log.w(TAG, "Phone sent the token the server rejected — staying unpaired")
            if (!_state.value.isRunning) showStatus("Sign in on your phone", 6000L)
            return
        }
        prefs.setAuth(token, runnerName, maxHrValue)
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
        // A new token may be what the queue was waiting for (DataStreamer.mc uploads its
        // pending batch on auth too).
        if (store.hasPending()) requestSync()
    }

    /**
     * Leaves the prepare-on-phone screen for the ready screen, which shows what was prepared.
     * A new preparedRun replaces the last one entirely (Garmin 3.4.9). [persist]: also saved,
     * so it survives the app restarting before the run (false when restoring that copy).
     */
    private fun applyPreparedRun(payload: Map<String, Any?>, persist: Boolean) {
        if (_state.value.isRunning) return
        val sType = payload["sessionType"] as? String
        if (sType != null) {
            _state.update { it.copy(sessionType = sType) }
            if (persist) {
                scope.launch { prefs.setSessionType(sType) }
                dataLayer.sendCommand("sessionTypeAck")
            }
        }
        coachTargetPace = (payload["targetPace"] as? String)?.takeIf { it.isNotBlank() }
        coachWorkoutDesc = payload["workoutDesc"] as? String
        plannedWorkoutId = (payload["plannedWorkoutId"] as? String)?.takeIf { it.isNotBlank() }
        if (persist) {
            val json = runCatching { JSONObject(payload.filterValues { it != null }).toString() }.getOrNull()
            scope.launch {
                prefs.setPlannedWorkoutId(plannedWorkoutId)
                prefs.setPreparedRun(json)
            }
        }
        val dist = (payload["distance"] as? Number)?.toDouble()?.takeIf { it > 0 }
        _state.update {
            it.copy(isPrepared = true, isFinished = false, preparedDistanceKm = dist,
                preparedTargetPace = coachTargetPace)
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

        // A phone-started run is mirrored from the phone's runUpdate messages; the watch's own
        // (idle) sensors must not overwrite those numbers, feed the summary, or stream under
        // the previous watch run's session ID — RunView.mc gates all of this on !_phoneControlled.
        if (s.isRunning && !s.isPaused && !phoneControlled) {
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

            // Moving time from the pause-aware clock (Health Services' own figure isn't used:
            // it was wall-clock since START, pauses included).
            val elapsedMs = if (videoDemo) m.elapsedMs else clock.elapsedMs(now)
            val distanceM = maxOf(m.distanceM, distanceFloorM)
            _state.update {
                it.copy(
                    elapsedMs = elapsedMs,
                    distanceM = distanceM,
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
                maybeCaptureOfflinePoint(now, m, elapsedMs)
                maybeSendWatchData(now, m, elapsedMs, distanceM)
                maybeSendHttpData(now, m, elapsedMs, distanceM)
                if (!phoneControlled && now - lastCheckpointMs >= CHECKPOINT_INTERVAL_MS) writeCheckpoint()
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

    private fun maybeCaptureOfflinePoint(now: Long, m: live.airuncoach.airuncoach.wear.sensors.ExerciseMetrics, elapsedMs: Long) {
        if (phoneControlled) return
        if (now - lastOfflineCaptureMs < OfflineGpsBuffer.CAPTURE_INTERVAL_MS) return
        lastOfflineCaptureMs = now
        val lat = m.lat ?: return
        val lng = m.lng ?: return
        val wasFull = offlineBuffer.isFull
        offlineBuffer.addPoint(
            GpsPoint(
                elapsedS = (elapsedMs / 1000).toInt(),
                latE5 = (lat * 100000).toInt(),
                lngE5 = (lng * 100000).toInt(),
                altDm = ((m.altM ?: 0.0) * 10).toInt(),
                hr = m.heartRate,
                cadence = m.cadenceSpm,
                paceDs = (_state.value.paceSecPerKm * 10).toInt()
            )
        )
        if (offlineBuffer.isFull && !wasFull) showStatus("Route full - 6h", 5000L)
    }

    private fun maybeSendWatchData(now: Long, m: live.airuncoach.airuncoach.wear.sensors.ExerciseMetrics, elapsedMs: Long, distanceM: Double) {
        if (!_state.value.isPhoneConnected) return
        if (now - lastWatchDataSentMs < WATCH_DATA_INTERVAL_MS) return
        lastWatchDataSentMs = now
        dataLayer.sendWatchData(
            mapOf(
                "lat" to m.lat, "lng" to m.lng, "alt" to m.altM, "speed" to m.speedMs,
                "bear" to m.bearingDeg, "acc" to lastGpsAccuracyM,
                "hr" to m.heartRate, "hrz" to _state.value.hrZone, "cad" to m.cadenceSpm,
                "elap" to (elapsedMs / 1000).toInt(), "dist" to distanceM.toFloat()
            )
        )
    }

    private fun maybeSendHttpData(now: Long, m: live.airuncoach.airuncoach.wear.sensors.ExerciseMetrics, elapsedMs: Long, distanceM: Double) {
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
                    heartRateZone = _state.value.hrZone,
                    cadence = m.cadenceSpm.takeIf { it > 0 },
                    pace = _state.value.paceSecPerKm.takeIf { it > 0 },
                    cumulativeDistance = distanceM,
                    elapsedTime = elapsedMs / 1000,
                    altitude = m.altM,
                    isMoving = true,
                    isPaused = _state.value.isPaused,
                    latitude = m.lat,
                    longitude = m.lng,
                    // Sent every second (like Garmin) so the server's fallback path always has
                    // the climb even if session/end never arrives.
                    cumulativeAscent = sumAscent,
                    cumulativeDescent = sumDescent
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
