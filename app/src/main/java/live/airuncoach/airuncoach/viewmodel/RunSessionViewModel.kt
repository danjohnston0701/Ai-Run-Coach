
package live.airuncoach.airuncoach.viewmodel

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.activity.result.contract.ActivityResultContract
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import live.airuncoach.airuncoach.data.HealthConnectRepository
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.data.WeatherRepository
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.PreRunBriefingRequest
import live.airuncoach.airuncoach.network.model.StartLocation
import live.airuncoach.airuncoach.network.model.TalkToCoachRequest
import live.airuncoach.airuncoach.network.model.WellnessPayload
import live.airuncoach.airuncoach.network.model.WeatherPayload
import live.airuncoach.airuncoach.network.model.IntervalCoachingRequest
import live.airuncoach.airuncoach.network.model.IntervalCoachingResponse
import live.airuncoach.airuncoach.network.model.PreRunBriefingResponse
import live.airuncoach.airuncoach.network.model.SessionInstructionsResponse
import live.airuncoach.airuncoach.service.GarminWatchManager
import live.airuncoach.airuncoach.service.SessionCoachingHelper
import live.airuncoach.airuncoach.service.RunTrackingService
import live.airuncoach.airuncoach.utils.AudioPlayerHelper
import live.airuncoach.airuncoach.utils.CoachingAudioQueue
import live.airuncoach.airuncoach.data.SyncQueue
import live.airuncoach.airuncoach.utils.SpeechRecognizerHelper
import live.airuncoach.airuncoach.utils.SpeechState
import live.airuncoach.airuncoach.utils.SpeechStatus
import live.airuncoach.airuncoach.utils.WakeWordDetector
import live.airuncoach.airuncoach.util.NavigationRouteHolder
import live.airuncoach.airuncoach.utils.TextToSpeechHelper
import java.util.Locale
import javax.inject.Inject

/**
 * Tracks position within an interval (work phase vs recovery phase)
 */
data class IntervalPhase(
    val currentInterval: Int = 1,           // Which rep are we on (1-indexed)
    val isWorkPhase: Boolean = true,        // true = interval work, false = recovery
    val distanceInCurrentPhase: String = "0.00", // km
    val timeInCurrentPhase: String = "00:00",    // mm:ss
    val phaseDurationTarget: Float? = null, // km or seconds depending on phase
    val targetPace: String? = null,         // mm:ss/km for this phase
    val targetHeartRateMin: Int? = null,
    val targetHeartRateMax: Int? = null
)

data class RunState(
    val time: String = "00:00",
    val distance: String = "0.00",
    val pace: String = "0:00", // Average pace for the run
    val currentPace: String = "0:00", // Real-time/instant pace from recent GPS
    val cadence: String = "0",
    val heartRate: String = "0",
    val isRunning: Boolean = false,
    val isPaused: Boolean = false,
    val isCoachEnabled: Boolean = true,
    val isMuted: Boolean = false,
    val coachText: String = "GPS locked! Tap 'Start Run' when you're ready.",
    val speechState: SpeechState = SpeechState(),
    val wellnessContext: WellnessContext? = null,
    val isLoadingBriefing: Boolean = false,
    val latestCoachMessage: String? = null,
    val briefingResponse: PreRunBriefingResponse? = null,  // Full structured response
    val isStopping: Boolean = false,
    val backendRunId: String? = null,
    // Interval training state
    val isIntervalWorkout: Boolean = false,
    val intervalPhase: IntervalPhase? = null
)

@HiltViewModel
@SuppressLint("StaticFieldLeak")
class RunSessionViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager,
    private val healthConnectRepository: HealthConnectRepository,
    private val syncQueue: SyncQueue,
    private val garminWatchManager: GarminWatchManager,
) : ViewModel() {

    private val _runState = MutableStateFlow(RunState())
    val runState: StateFlow<RunState> = _runState.asStateFlow()

    // ── Route Memory Engine ───────────────────────────────────────────────────
    /**
     * Populated asynchronously when the first GPS fix is obtained at run start
     * and the backend returns a match with confidence ≥ 40%.
     * Observed by RunSessionScreen to show the route recognition banner and drive
     * richer split coaching via [routeIntelligenceContext].
     */
    private val _knownRouteMatch =
        MutableStateFlow<live.airuncoach.airuncoach.network.model.RouteRecognitionResponse?>(null)
    val knownRouteMatch: StateFlow<live.airuncoach.airuncoach.network.model.RouteRecognitionResponse?> =
        _knownRouteMatch.asStateFlow()

    /**
     * Distilled context for injection into every PaceUpdate API call once a known route is matched.
     * Built once from [knownRouteMatch] and carried for the duration of the run.
     */
    var routeIntelligenceContext: live.airuncoach.airuncoach.network.model.RouteIntelligenceContext? = null
        private set

    /** Intended distance for the upcoming run — used as a hint for route recognition. */
    var intendedDistanceKm: Double? = null

    init {
        // Observe the first GPS fix from RunTrackingService and trigger route recognition
        viewModelScope.launch {
            RunTrackingService.firstGpsPoint.collect { gpsPoint ->
                if (gpsPoint != null && _knownRouteMatch.value == null) {
                    checkForKnownRoute(gpsPoint.first, gpsPoint.second)
                }
            }
        }
    }

    /**
     * Called when the first GPS fix arrives during an active run.
     * Calls the backend asynchronously — never blocks the run start.
     * On match, populates [knownRouteMatch] and [routeIntelligenceContext].
     */
    private fun checkForKnownRoute(lat: Double, lng: Double) {
        viewModelScope.launch {
            try {
                Log.d("RouteMemory", "Checking route recognition at ($lat, $lng)...")
                val response = apiService.recognizeRoute(
                    live.airuncoach.airuncoach.network.model.RouteRecognitionRequest(
                        latitude = lat,
                        longitude = lng,
                        timestamp = System.currentTimeMillis(),
                        intendedDistanceKm = intendedDistanceKm
                    )
                )
                if (response.matched) {
                    _knownRouteMatch.value = response
                    // Build the route intelligence context for injection into pace updates
                    routeIntelligenceContext = buildRouteIntelligenceContext(response)
                    // Push into Service companion so km-split coaching can use it immediately
                    RunTrackingService.routeIntelligenceContext = routeIntelligenceContext
                    Log.d("RouteMemory", "Route matched: ${response.knownRoute?.name} (${(response.confidence * 100).toInt()}%)")
                } else {
                    Log.d("RouteMemory", "No route match (confidence ${(response.confidence * 100).toInt()}%)")
                }
            } catch (e: Exception) {
                // Intentionally silent — route recognition failure never affects the run
                Log.w("RouteMemory", "Route recognition failed (non-fatal): ${e.message}")
            }
        }
    }

    private fun buildRouteIntelligenceContext(
        response: live.airuncoach.airuncoach.network.model.RouteRecognitionResponse
    ): live.airuncoach.airuncoach.network.model.RouteIntelligenceContext? {
        val route = response.knownRoute ?: return null
        val intel = response.routeIntelligence ?: return null
        return live.airuncoach.airuncoach.network.model.RouteIntelligenceContext(
            routeName = route.name,
            confidence = response.confidence,
            personalBestFormatted = intel.personalBest?.formatted,
            lastRunFormatted = intel.lastRunStats?.formatted,
            lastRunDate = intel.lastRunStats?.date,
            splitComparisons = intel.averageSplits.map { cmp ->
                live.airuncoach.airuncoach.network.model.SplitComparisonContext(
                    km = cmp.km,
                    lastRunSecPerKm = cmp.lastRunSecPerKm,
                    avgSecPerKm = cmp.avgSecPerKm
                )
            },
            notableSegments = route.notableSegments,
            typicalDistanceKm = route.typicalDistanceKm
        )
    }

    // ── Garmin watch companion ────────────────────────────────────────────────
    /** True when the AI Run Coach app is confirmed installed on the paired watch. */
    val isWatchCompanionInstalled: StateFlow<Boolean> =
        garminWatchManager.isCompanionAppInstalled

    // ── Watch send state (for PrepareRunOnWatchButton UI) ────────────────────
    private val _watchSendState = MutableStateFlow(live.airuncoach.airuncoach.ui.components.WatchSendState.IDLE)
    val watchSendState: StateFlow<live.airuncoach.airuncoach.ui.components.WatchSendState> =
        _watchSendState.asStateFlow()

    // ── AI Coaching generation state ─────────────────────────────────────────
    /** Tracks the state of AI coaching plan generation for the current workout preview. */
    enum class CoachingGenerationState {
        IDLE,        // Not started yet
        GENERATING,  // API call in progress
        READY,       // Plan generated successfully — run can start
        FAILED       // Generation failed — run can still start (coaching best-effort)
    }

    private val _coachingGenerationState = MutableStateFlow(CoachingGenerationState.IDLE)
    val coachingGenerationState: StateFlow<CoachingGenerationState> = _coachingGenerationState.asStateFlow()

    /** ID of the workout whose coaching plan is currently cached. */
    private var coachingGeneratedForWorkoutId: String? = null

    /**
     * Generate the bespoke AI coaching plan for a workout when the user opens the detail screen.
     * Called via LaunchedEffect in WorkoutDetailScreen — runs once per workout (cached).
     *
     * Sets [coachingGenerationState] to GENERATING → READY or FAILED.
     * Stores the plan in [activeSessionCoachingPlan] for use at run time.
     *
     * If coaching for this workoutId was already generated in this session, skips silently.
     */
    fun generateCoachingForWorkout(workoutId: String) {
        // Skip if already generated for this workout
        if (coachingGeneratedForWorkoutId == workoutId &&
            _coachingGenerationState.value == CoachingGenerationState.READY) {
            Log.d("RunSessionViewModel", "Coaching already generated for $workoutId — skipping")
            return
        }

        viewModelScope.launch {
            _coachingGenerationState.value = CoachingGenerationState.GENERATING
            Log.d("RunSessionViewModel", "Generating AI coaching for workout $workoutId...")

            try {
                val response = apiService.prepareSessionCoaching(workoutId)
                if (response.isSuccessful) {
                    val body = response.body()
                    activeSessionCoachingPlan = body?.plan
                    coachingGeneratedForWorkoutId = workoutId
                    _coachingGenerationState.value = CoachingGenerationState.READY
                    Log.d("RunSessionViewModel",
                        "AI coaching ready for $workoutId: ${body?.phasesCount} phases, " +
                        "strategy=${body?.cueingStrategy}, tone=${body?.coachingTone}"
                    )
                } else {
                    Log.w("RunSessionViewModel", "Coaching API returned ${response.code()} — marking FAILED")
                    _coachingGenerationState.value = CoachingGenerationState.FAILED
                }
            } catch (e: Exception) {
                Log.w("RunSessionViewModel", "Coaching generation failed: ${e.message}")
                _coachingGenerationState.value = CoachingGenerationState.FAILED
            }
        }
    }

    /** Reset coaching state when navigating away from a workout detail screen. */
    fun resetCoachingState() {
        _coachingGenerationState.value = CoachingGenerationState.IDLE
        coachingGeneratedForWorkoutId = null
    }

    /**
     * Send the prepared run configuration to the watch over ConnectIQ BT.
     * The watch will switch from idle to "Coached Run Ready ▶" mode.
     */
    fun prepareRunOnWatch(
        distanceKm: Float,
        runType: String,                    // "route" | "free" | "training"
        workoutType: String?      = null,
        workoutIntensity: String? = null,
        workoutDesc: String?      = null,
        routePolyline: String?    = null,
        targetPace: String?       = null,
        intervalCount: Int?       = null,
        intervalDistKm: Float?    = null,
        intervalDurSecs: Int?     = null
    ) {
        garminWatchManager.sendPreparedRun(
            distanceKm        = distanceKm,
            runType           = runType,
            workoutType       = workoutType,
            workoutIntensity  = workoutIntensity,
            workoutDesc       = workoutDesc,
            routePolyline     = routePolyline,
            targetPace        = targetPace,
            intervalCount     = intervalCount,
            intervalDistKm    = intervalDistKm,
            intervalDurSecs   = intervalDurSecs
        )
        Log.d("RunSessionViewModel", "prepareRunOnWatch sent: type=$runType dist=${distanceKm}km")
    }

    /**
     * Send the prepared run to the watch using the already-generated coaching plan.
     *
     * Coaching generation happens at screen-open time via [generateCoachingForWorkout].
     * By the time the user taps "Prepare Run on Watch", the plan should already be READY.
     * If not (e.g., failed), falls back gracefully — the run still proceeds.
     */
    fun prepareRunOnWatchWithCoaching(
        workoutId: String,
        distanceKm: Float,
        workoutType: String,
        workoutIntensity: String? = null,
        targetPace: String?       = null,
        intervalCount: Int?       = null,
        intervalDistKm: Float?    = null,
        intervalDurSecs: Int?     = null
    ) {
        _watchSendState.value = live.airuncoach.airuncoach.ui.components.WatchSendState.SENDING

        // Use the pre-generated coaching brief if available
        val preRunBrief = activeSessionCoachingPlan?.preRunBrief

        garminWatchManager.sendPreparedRun(
            distanceKm       = distanceKm,
            runType          = "training",
            workoutType      = workoutType,
            workoutIntensity = workoutIntensity,
            workoutDesc      = preRunBrief ?: "Coached ${workoutType.replace("_", " ")} session",
            targetPace       = targetPace,
            intervalCount    = intervalCount,
            intervalDistKm   = intervalDistKm,
            intervalDurSecs  = intervalDurSecs
        )

        _watchSendState.value = live.airuncoach.airuncoach.ui.components.WatchSendState.SENT
        Log.d("RunSessionViewModel", "prepareRunOnWatchWithCoaching sent: workout=$workoutId type=$workoutType, coachingReady=${activeSessionCoachingPlan != null}")
    }

    /** The active dynamic coaching plan, set when prepareRunOnWatchWithCoaching() succeeds. */
    var activeSessionCoachingPlan: live.airuncoach.airuncoach.network.model.DynamicSessionCoachingPlan? = null
        private set

    val runSession = RunTrackingService.currentRunSession
    
    // Observe pending syncs for UI display
    val pendingSyncCount = syncQueue.observePendingSyncCount().stateIn(
        viewModelScope, 
        SharingStarted.Lazily, 
        0
    )

    private val speechRecognizerHelper = SpeechRecognizerHelper(context)
    private val textToSpeechHelper = TextToSpeechHelper(context)
    private val audioPlayerHelper = AudioPlayerHelper(context)

    // ── Wake word detection ("hey coach") ────────────────────────────────────
    private val wakeWordDetector = WakeWordDetector(context) {
        // Fires on main thread when "hey coach" is detected
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            onWakeWordDetected()
        }
    }
    /** True while the user-preference "voice activation" is enabled */
    private var voiceActivationEnabled: Boolean = true

    /**
     * Pre-warmed "Yes?" audio bytes from AWS Polly.
     * Generated once when wake word detection starts so there's zero network
     * latency when the wake word fires — we just play the cached bytes instantly.
     * Falls back to device TTS if the API call fails.
     */
    private var yesAudioBytes: ByteArray? = null
    private var yesAudioFormat: String = "mp3"

    /** Expose wake word detector state to the UI */
    val wakeWordState: StateFlow<WakeWordDetector.State> = wakeWordDetector.state

    // Observe watch-initiated talk-to-coach requests
    init {
        viewModelScope.launch {
            RunTrackingService.watchTalkToCoachRequest.collect { requested ->
                if (requested) {
                    RunTrackingService.clearWatchTalkToCoachRequest()
                    Log.d("RunSessionViewModel", "⌚ Watch tap → triggering talk-to-coach")
                    onWakeWordDetected() // reuses the same flow as the phone wake word
                }
            }
        }

        // ── Watch command handler ─────────────────────────────────────────────
        // The DI singleton GarminWatchManager is alive as soon as the ViewModel
        // is created (i.e. the user has opened the Run screen).  If the user
        // presses START on the watch *before* tapping Start on the phone, the
        // RunTrackingService doesn't exist yet — so this handler bridges the gap.
        garminWatchManager.onWatchCommand = { action ->
            Log.d("RunSessionViewModel", "⌚ Watch command received in ViewModel: $action")
            when (action) {
                "start" -> {
                    Log.d("RunSessionViewModel", "⌚ Watch START → calling startRun() from ViewModel")
                    startRun()
                }
                "pause" -> {
                    Log.d("RunSessionViewModel", "⌚ Watch PAUSE")
                    val intent = android.content.Intent(context, RunTrackingService::class.java).apply {
                        this.action = RunTrackingService.ACTION_PAUSE_TRACKING
                    }
                    try { context.startService(intent) } catch (e: Exception) {
                        Log.w("RunSessionViewModel", "pause intent failed: ${e.message}")
                    }
                }
                "resume" -> {
                    Log.d("RunSessionViewModel", "⌚ Watch RESUME")
                    val intent = android.content.Intent(context, RunTrackingService::class.java).apply {
                        this.action = RunTrackingService.ACTION_RESUME_TRACKING
                    }
                    try { context.startService(intent) } catch (e: Exception) {
                        Log.w("RunSessionViewModel", "resume intent failed: ${e.message}")
                    }
                }
                "stop" -> {
                    Log.d("RunSessionViewModel", "⌚ Watch STOP")
                    val intent = android.content.Intent(context, RunTrackingService::class.java).apply {
                        this.action = RunTrackingService.ACTION_STOP_TRACKING
                    }
                    try { context.startService(intent) } catch (e: Exception) {
                        Log.w("RunSessionViewModel", "stop intent failed: ${e.message}")
                    }
                }
                "watchReady" -> {
                    Log.d("RunSessionViewModel", "⌚ Watch ready — pushing auth token")
                    viewModelScope.launch {
                        val token = sessionManager.getAuthToken()
                        val name = user?.name ?: ""
                        if (token != null) garminWatchManager.sendAuth(token, name)
                    }
                }
                "sessionReady" -> {
                    Log.d("RunSessionViewModel", "⌚ Watch session ready (GPS locked)")
                }
                "talkToCoach" -> {
                    // Intentionally NOT handled here. When the service is running it routes
                    // talkToCoach through triggerWatchTalkToCoach() → watchTalkToCoachRequest
                    // StateFlow → the collector below. Handling it here too would cause a
                    // double "hello" because both this handler and the service's handler can
                    // fire for the same ConnectIQ message.
                    Log.d("RunSessionViewModel", "⌚ talkToCoach in ViewModel handler — ignored (service path handles it)")
                }
            }
        }
    }
    private val weatherRepository = WeatherRepository(context)
    private val sessionCoachingHelper = SessionCoachingHelper(apiService)  // NEW: Session coaching

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private var user: User? = null
    private var runConfig: RunSetupConfig? = null
    private var isBriefingAudioPlaying = false // Guard against duplicate audio playback
    // Debounce guard: ignore duplicate talk-to-coach triggers within 3 seconds.
    // Protects against the watch + service both firing onWakeWordDetected() for one tap.
    private var lastWakeWordTriggerMs: Long = 0L
    private val WAKE_WORD_DEBOUNCE_MS = 3_000L
    private var sessionInstructions: SessionInstructionsResponse? = null  // NEW: Store session context

    // ── Interval Training State ──────────────────────────────────────────────
    // Tracks the current interval phase (work vs recovery) and position within it
    private var intervalDataLoaded = false

    init {
        loadUser()
        loadAiCoachPreference()
        viewModelScope.launch {
            runSession.collect { session ->
                session?.let {
                    // Update interval tracking if this is an interval workout
                    val updatedIntervalPhase = if (_runState.value.isIntervalWorkout) {
                        updateIntervalTracking(session)
                    } else null

                    // Detect when the service transitions the session to inactive (isActive→false).
                    // This happens when the watch sends "stop" and stopTracking() finalises the session.
                    // In that case the service handler calls stopTracking() directly without going through
                    // the ViewModel's stopRun() — so isStopping is never set via the normal path.
                    // Setting it here ensures the RunSessionScreen navigation guard fires correctly.
                    val wasRunning = _runState.value.isRunning
                    val sessionJustEnded = wasRunning && !session.isActive

                    val updatedState = _runState.value.copy(
                        time = session.getFormattedDuration(),
                        distance = String.format("%.2f", session.getDistanceInKm()),
                        pace = session.averagePace ?: "0:00",
                        currentPace = session.currentPace ?: "0:00",
                        cadence = session.cadence.toString(),
                        heartRate = session.heartRate.toString(),
                        intervalPhase = updatedIntervalPhase ?: _runState.value.intervalPhase,
                        isRunning = session.isActive && !_runState.value.isPaused,
                        // Automatically set isStopping when the service ends the session
                        // (covers watch-initiated stop where ViewModel.stopRun() is not called)
                        isStopping = if (sessionJustEnded) true else _runState.value.isStopping
                    )

                    _runState.update { updatedState }
                }
            }
        }
        
        // Listen for upload completion
        viewModelScope.launch {
            RunTrackingService.uploadComplete.collect { backendRunId ->
                backendRunId?.let {
                    Log.d("RunSessionViewModel", "Upload complete with backend ID: $it")
                    // Keep isStopping = true so the navigation guard knows this is from the CURRENT run
                    // isStopping will be cleared after navigation happens
                    _runState.update { state -> state.copy(backendRunId = it) }
                }
            }
        }

        // Listen for coaching text updates from the service (for on-screen display)
        viewModelScope.launch {
            RunTrackingService.latestCoachingText.collect { text ->
                if (text != null) {
                    _runState.update { it.copy(latestCoachMessage = text) }
                } else if (_runState.value.isRunning) {
                    // Clear coaching text when audio finishes (but only during run)
                    _runState.update { it.copy(latestCoachMessage = "") }
                }
            }
        }
    }

    private fun loadUser() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            user = gson.fromJson(userJson, User::class.java)
        }
    }
    
    private fun loadAiCoachPreference() {
        val isEnabled = sharedPrefs.getBoolean("ai_coach_enabled", true)
        _runState.update { it.copy(isCoachEnabled = isEnabled) }
        Log.d("RunSessionViewModel", "AI Coach ${if (isEnabled) "enabled" else "disabled (navigation only)"}")
        
        /*
         * AI Coach Toggle Behavior:
         * - ENABLED: Full AI coaching (pre-run briefing, realtime insights, generic coaching, navigation)
         * - DISABLED with Route: Navigation instructions only, no coaching insights
         * - DISABLED without Route: No AI prompts at all
         */
    }

    fun getHealthConnectPermissionsContract(): ActivityResultContract<Set<String>, Set<String>> {
        return healthConnectRepository.getPermissionsRequestContract()
    }

    fun fetchWellnessData() {
        viewModelScope.launch {
            val wellness = healthConnectRepository.getWellnessContext()
            _runState.update { it.copy(wellnessContext = wellness) }
        }
    }

    private var isPrepareRunInProgress = false // Guard against multiple prepareRun calls
    private var isSetupCancelled = false       // Flag to prevent state updates after cancel

    fun prepareRun() {
        // Prevent multiple simultaneous calls
        if (isPrepareRunInProgress) {
            Log.d("RunSessionViewModel", "prepareRun already in progress, skipping duplicate call")
            return
        }
        
        // Prevent prepareRun if already cancelled
        if (runConfig == null || isSetupCancelled) {
            Log.d("RunSessionViewModel", "prepareRun called but run setup was cancelled - aborting")
            return
        }
        
        // Fully reset run state to prevent stale data from previous run showing
        // This resets all metrics to zeros and clears navigation/stopping flags
        _runState.value = RunState(
            isCoachEnabled = _runState.value.isCoachEnabled,
            isMuted = _runState.value.isMuted
        )
        
        isPrepareRunInProgress = true
        viewModelScope.launch {
            // Check if setup was cancelled before proceeding
            if (isSetupCancelled) {
                Log.d("RunSessionViewModel", "prepareRun coroutine: setup was cancelled, aborting")
                isPrepareRunInProgress = false
                return@launch
            }
            
            // Skip AI coaching if disabled
            if (!_runState.value.isCoachEnabled) {
                _runState.update {
                    it.copy(coachText = "Ready to run! Tap Start when you're ready.")
                }
                isPrepareRunInProgress = false
                return@launch
            }

            try {
                _runState.update { it.copy(
                    coachText = "Getting your personalized briefing...",
                    isLoadingBriefing = true
                )}
                
                // Add timeout to prevent hanging
                withTimeout(30000) { // 30 second timeout (audio endpoint generates LLM text + OpenAI TTS)
                    
                    // ========== NEW: Fetch session instructions pre-run ==========
                    if (runConfig?.workoutId != null) {
                        try {
                            Log.d("RunSessionViewModel", "Fetching session instructions for workout: ${runConfig?.workoutId}")
                            sessionInstructions = sessionCoachingHelper.fetchSessionInstructions(runConfig!!.workoutId!!)
                            
                            if (sessionInstructions != null) {
                                Log.d("RunSessionViewModel", "Session instructions fetched - tone: ${sessionInstructions?.aiDeterminedTone}")
                                // Update the stored config with session context
                                runConfig = runConfig?.copy(
                                    sessionInstructions = sessionInstructions,
                                    sessionCoachingTone = sessionInstructions?.aiDeterminedTone,
                                    sessionCoachingIntensity = sessionInstructions?.aiDeterminedIntensity
                                )
                            } else {
                                Log.d("RunSessionViewModel", "Session instructions returned null - continuing without context")
                            }
                        } catch (e: Exception) {
                            Log.w("RunSessionViewModel", "Failed to fetch session instructions: ${e.message}")
                            // Continue without session context - graceful degradation
                        }
                    }
                    // ========== END: Session instructions fetching ==========
                    
                    // Get route data from runConfig if available
                    val route = runConfig?.route
                    // Explicitly determine hasRoute - must be false if no route
                    val hasRoute = route != null && route.distance > 0
                    val distance = route?.distance ?: runConfig?.targetDistance?.toDouble()
                    val elevationGain = route?.elevationGain?.toInt() ?: 0
                    val elevationLoss = route?.elevationLoss?.toInt() ?: 0
                    val maxGradientDegrees = route?.maxGradientDegrees ?: 0.0
                    val difficulty = if (hasRoute) {
                        route?.difficulty?.name?.lowercase() ?: "moderate"
                    } else {
                        "unknown"
                    }
                    
                    // Get first turn instruction if available
                    val firstTurnInstruction = route?.turnInstructions?.firstOrNull()?.instruction
                    
                    // Get start location from route waypoints, fallback to current GPS
                    var startLat = route?.waypoints?.firstOrNull()?.latitude
                    var startLng = route?.waypoints?.firstOrNull()?.longitude
                    if (startLat == null || startLng == null) {
                        val currentLocation = weatherRepository.getCurrentLocation()
                        startLat = currentLocation?.latitude
                        startLng = currentLocation?.longitude
                    }
                    val startLocation = StartLocation(startLat ?: 0.0, startLng ?: 0.0)
                    
                    // Calculate target time in seconds if set
                    val targetTimeSeconds = if (runConfig?.hasTargetTime == true) {
                        runConfig?.getTotalTargetSeconds()
                    } else null
                    val targetPace = if (targetTimeSeconds != null && distance != null && distance > 0) {
                        val paceSeconds = (targetTimeSeconds / distance).toInt()
                        val minutes = paceSeconds / 60
                        val seconds = paceSeconds % 60
                        String.format(Locale.getDefault(), "%d:%02d", minutes, seconds)
                    } else null
                    
                    Log.d("RunSessionViewModel", "Preparing briefing: distance=${distance ?: "not set"} km, elevation=$elevationGain m, maxGradient=$maxGradientDegrees°")
                    
                    val weather = weatherRepository.getCurrentWeather()
                    val weatherPayload = weather?.let {
                        WeatherPayload(
                            temp = it.temperature.toInt(),
                            condition = it.description,
                            windSpeed = it.windSpeed.toInt()
                        )
                    }
                    val wellnessPayload = _runState.value.wellnessContext?.let {
                        WellnessPayload(
                            sleepHours = it.sleepHours,
                            sleepQuality = it.sleepQuality,
                            sleepScore = it.sleepScore,
                            bodyBattery = it.bodyBattery,
                            stressLevel = it.stressLevel,
                            stressQualifier = it.stressQualifier,
                            hrvStatus = it.hrvStatus,
                            hrvFeedback = it.hrvFeedback,
                            restingHeartRate = it.restingHeartRate,
                            readinessScore = it.readinessScore,
                            readinessRecommendation = it.readinessRecommendation
                        )
                    }

                    val request = PreRunBriefingRequest(
                        startLocation = startLocation,
                        distance = distance,
                        elevationGain = elevationGain,
                        elevationLoss = elevationLoss,
                        maxGradientDegrees = maxGradientDegrees,
                        difficulty = difficulty,
                        hasRoute = hasRoute,
                        activityType = runConfig?.activityType?.name?.lowercase() ?: "run",
                        targetTime = targetTimeSeconds,
                        targetPace = targetPace,
                        firstTurnInstruction = firstTurnInstruction,
                        weather = weatherPayload,
                        wellness = wellnessPayload,
                        coachName = user?.coachName,
                        coachGender = user?.coachGender,
                        coachAccent = user?.coachAccent,
                        coachTone = user?.coachTone,
                        // Training plan context
                        trainingPlanId = runConfig?.trainingPlanId,
                        planGoalType = runConfig?.planGoalType,
                        planWeekNumber = runConfig?.planWeekNumber,
                        planTotalWeeks = runConfig?.planTotalWeeks,
                        workoutType = runConfig?.workoutType,
                        workoutIntensity = runConfig?.workoutIntensity,
                        workoutDescription = runConfig?.workoutDescription
                    )
                    
                    val briefing = apiService.getPreRunBriefing(request)
                    
                    // Debug: Log what we received from the API
                    Log.d("RunSessionViewModel", "Pre-run briefing response - audio: ${briefing.audio?.take(50)}, format: ${briefing.format}, briefing: ${briefing.briefing?.take(100)}")
                    
                    // Build full display text from structured AI response
                    val displayText = briefing.getFullBriefingText()
                    val speechText = briefing.getSpeechText()

                    _runState.update { it.copy(
                        coachText = displayText,
                        latestCoachMessage = displayText,
                        briefingResponse = briefing,
                        isLoadingBriefing = false
                    )}
                    
                    // Enqueue pre-run briefing audio via shared queue (prevents overlap)
                    if (!isBriefingAudioPlaying && !_runState.value.isMuted) {
                        isBriefingAudioPlaying = true
                        CoachingAudioQueue.enqueue(
                            context = context,
                            base64Audio = briefing.audio,
                            format = briefing.format,
                            fallbackText = speechText,
                            accent = user?.coachAccent,
                            onComplete = {
                                isBriefingAudioPlaying = false
                                _runState.update { it.copy(coachText = "") }
                            }
                        )
                    } else if (_runState.value.isMuted) {
                        Log.d("RunSessionViewModel", "Audio muted - skipping playback")
                    }
                    
                    // Reset the flag to allow re-triggering if needed
                    isPrepareRunInProgress = false
                } // End of withTimeout
            } catch (e: TimeoutCancellationException) {
                Log.w("RunSessionViewModel", "Pre-run briefing timed out")
                isBriefingAudioPlaying = false
                isPrepareRunInProgress = false
                // Only update UI if the run was not cancelled
                if (!isSetupCancelled) {
                    _runState.update { 
                        it.copy(
                            coachText = "Ready to run! Tap Start when you're ready.",
                            isLoadingBriefing = false
                        )
                    }
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                // Screen was popped or ViewModel was cleared - don't log as error
                Log.d("RunSessionViewModel", "Pre-run briefing was cancelled (screen navigation)")
                isBriefingAudioPlaying = false
                isPrepareRunInProgress = false
                // Don't update UI state - screen is already gone
                throw e  // Re-throw to propagate cancellation
            } catch (e: Exception) {
                Log.e("RunSessionViewModel", "Failed to get pre-run briefing: ${e.message}", e)
                isBriefingAudioPlaying = false
                isPrepareRunInProgress = false
                // Only update UI if the run was not cancelled
                if (!isSetupCancelled && runConfig != null) {
                    _runState.update { 
                        it.copy(
                            coachText = "Ready to run! Tap Start when you're ready.",
                            isLoadingBriefing = false
                        )
                    }
                }
            }
        }
    }

    fun setRunConfig(config: RunSetupConfig) {
        // Reset the cancelled flag when setting a new config - allows a new run attempt
        isSetupCancelled = false
        runConfig = config
        // Only update coachText if we don't already have a briefing loaded
        // This prevents overwriting the AI briefing when config is set
        if (_runState.value.coachText.isEmpty() || 
            _runState.value.coachText.contains("Ready to run")) {
            if (config.hasTargetTime) {
                val targetTimeStr = config.getFormattedTargetTime()
                val distStr = config.targetDistance?.let { "${it} km" } ?: "your workout"
                _runState.update { it.copy(
                    coachText = "Target: $distStr in $targetTimeStr. Ready to start!"
                )}
            } else if (config.targetDistance != null) {
                _runState.update { it.copy(
                    coachText = "Target: ${config.targetDistance} km. Ready to start!"
                )}
            } else {
                _runState.update { it.copy(
                    coachText = "Ready to start your ${config.workoutType?.replace("_", " ") ?: "run"}!"
                )}
            }
        }

        // Initialize interval tracking if this is an interval workout
        if (config.isIntervalWorkout && config.intervalCount != null) {
            initializeIntervalTracking(config)
        }
    }

    /**
     * Initialize interval tracking for interval/repeat workouts.
     * Sets up the initial interval phase and prepares coaching event tracking.
     */
    private fun initializeIntervalTracking(config: RunSetupConfig) {
        if (!config.isIntervalWorkout || config.intervalCount == null) return

        intervalDataLoaded = true
        
        // Initialize with first interval's work phase
        val initialPhase = IntervalPhase(
            currentInterval = 1,
            isWorkPhase = true,
            targetPace = config.intervalTargetPace,
            targetHeartRateMin = config.intervalHeartRateMin,
            targetHeartRateMax = config.intervalHeartRateMax,
            phaseDurationTarget = config.intervalDistanceKm
        )
        
        _runState.update { it.copy(
            isIntervalWorkout = true,
            intervalPhase = initialPhase
        )}

        Log.d("RunSessionViewModel", "Initialized interval tracking: ${config.intervalCount}x ${config.intervalDistanceKm}km")
    }

    /**
     * Update interval tracking based on current run session distance.
     * Detects transitions between work and recovery phases, and triggers coaching events.
     */
    private fun updateIntervalTracking(session: RunSession): IntervalPhase? {
        val config = runConfig ?: return null
        if (!config.isIntervalWorkout || config.intervalCount == null) return null
        
        // Distance-based intervals only (simpler implementation)
        val intervalDistanceKm = config.intervalDistanceKm ?: return null
        val restDistanceKm = config.restDistanceKm ?: (intervalDistanceKm * 0.5f)  // Default: rest = 50% of interval
        
        val currentDistanceKm = session.getDistanceInKm()
        val cycleDistanceKm = intervalDistanceKm + restDistanceKm
        
        // Position within the current cycle (work + rest)
        val positionInCycleKm = currentDistanceKm % cycleDistanceKm
        val isWorkPhase = positionInCycleKm < intervalDistanceKm
        
        // Which interval are we on? (1-indexed)
        val cyclesCompleted = (currentDistanceKm / cycleDistanceKm).toInt()
        val currentInterval = cyclesCompleted + 1
        
        // Distance into current phase
        val distanceInPhaseKm = if (isWorkPhase) {
            positionInCycleKm
        } else {
            positionInCycleKm - intervalDistanceKm
        }
        
        // Determine target paces and HR zones
        val targetPace = if (isWorkPhase) config.intervalTargetPace else config.restTargetPace
        val hrMin = if (isWorkPhase) config.intervalHeartRateMin else null
        val hrMax = if (isWorkPhase) config.intervalHeartRateMax else config.restHeartRateMax
        
        // Trigger coaching events at phase boundaries
        if (isWorkPhase && distanceInPhaseKm < 0.05f) {
            triggerIntervalCoachingEvent(currentInterval, true, "start")
        } else if (!isWorkPhase && distanceInPhaseKm < 0.05f) {
            triggerIntervalCoachingEvent(currentInterval, false, "recovery_start")
        }
        
        return IntervalPhase(
            currentInterval = minOf(currentInterval, config.intervalCount ?: 1),
            isWorkPhase = isWorkPhase,
            distanceInCurrentPhase = String.format("%.2f", distanceInPhaseKm),
            timeInCurrentPhase = "00:00",  // Can be populated if time data is available
            phaseDurationTarget = if (isWorkPhase) intervalDistanceKm else restDistanceKm,
            targetPace = targetPace,
            targetHeartRateMin = hrMin,
            targetHeartRateMax = hrMax
        )
    }

    /**
     * Trigger coaching message for interval event (start, recovery start, etc.)
     */
    private fun triggerIntervalCoachingEvent(
        intervalNumber: Int,
        isWorkPhase: Boolean,
        eventType: String
    ) {
        viewModelScope.launch {
            try {
                val session = runSession.value ?: return@launch
                val config = runConfig ?: return@launch
                val currentRunState = _runState.value
                
                // Build interval coaching request
                val coachingRequest = IntervalCoachingRequest(
                    runId = currentRunState.backendRunId ?: "local",
                    currentInterval = intervalNumber,
                    totalIntervals = config.intervalCount ?: 1,
                    isWorkPhase = isWorkPhase,
                    currentPace = currentRunState.currentPace,
                    targetPace = if (isWorkPhase) config.intervalTargetPace else config.restTargetPace,
                    distanceInPhase = session.getDistanceInKm(),
                    phaseDurationTarget = if (isWorkPhase) config.intervalDistanceKm?.toDouble() else config.restDistanceKm?.toDouble(),
                    heartRate = currentRunState.heartRate.toIntOrNull(),
                    targetHRMin = if (isWorkPhase) config.intervalHeartRateMin else null,
                    targetHRMax = if (isWorkPhase) config.intervalHeartRateMax else config.restHeartRateMax,
                    cadence = currentRunState.cadence.toIntOrNull(),
                    fatigueLevel = determineFatigueLevel(currentRunState),
                    trainingPlanId = config.trainingPlanId,
                    workoutType = config.workoutType,
                    elevationGain = null,
                    wellnessContext = currentRunState.wellnessContext?.let {
                        WellnessPayload(
                            sleepHours = null,
                            sleepQuality = it.sleepQuality,
                            sleepScore = it.sleepScore,
                            bodyBattery = it.bodyBattery,
                            stressLevel = it.stressLevel,
                            stressQualifier = it.stressQualifier,
                            hrvStatus = it.hrvStatus,
                            hrvFeedback = it.hrvFeedback,
                            restingHeartRate = it.restingHeartRate,
                            readinessScore = it.readinessScore,
                            readinessRecommendation = it.readinessRecommendation
                        )
                    }
                )
                
                // Call the API
                val response = apiService.getIntervalCoaching(coachingRequest)
                
                // Update UI with coaching message
                _runState.update { state ->
                    state.copy(
                        latestCoachMessage = response.message,
                        coachText = response.message
                    )
                }
                
                // Play audio if available
                if (response.audioUrl != null && !_runState.value.isMuted) {
                    audioPlayerHelper.playAudio(response.audioUrl)
                }
                
                Log.d("RunSessionViewModel", "Interval $intervalNumber ($eventType): ${response.message}")
                
            } catch (e: Exception) {
                Log.e("RunSessionViewModel", "Error triggering interval coaching", e)
            }
        }
    }
    
    /**
     * Determine fatigue level based on current pace vs target
     */
    private fun determineFatigueLevel(runState: RunState): String {
        // Parse pace strings (mm:ss/km) and compare
        val currentPaceSeconds = runState.currentPace.split(":").let {
            if (it.size >= 2) (it[0].toIntOrNull() ?: 0) * 60 + (it[1].toIntOrNull() ?: 0) else 0
        }
        val targetPaceSeconds = runState.pace.split(":").let {
            if (it.size >= 2) (it[0].toIntOrNull() ?: 0) * 60 + (it[1].toIntOrNull() ?: 0) else 0
        }
        
        return when {
            currentPaceSeconds > (targetPaceSeconds * 1.15) -> "high"  // >15% slower
            currentPaceSeconds > (targetPaceSeconds * 1.05) -> "moderate"  // 5-15% slower
            else -> "fresh"
        }
    }

    /**
     * Start a simulated 5km run for testing all AI coaching features.
     * Triggers the real coaching pipeline with fake GPS/HR/cadence data.
     * Only available in debug builds.
     */
    fun startSimulatedRun() {
        // Let the pre-run briefing continue playing
        _runState.update { it.copy(isRunning = true) }

        try {
            val intent = Intent(context, RunTrackingService::class.java).apply {
                action = RunTrackingService.ACTION_START_SIMULATION
                putExtra(RunTrackingService.EXTRA_TARGET_DISTANCE, 5.0) // 5 km (not meters!)
                putExtra(RunTrackingService.EXTRA_TARGET_TIME, 22 * 60 * 1000L) // 22 min
            }
            context.startForegroundService(intent)
        } catch (e: Exception) {
            Log.e("RunSessionViewModel", "Failed to start simulation", e)
        }
    }

    /**
     * Start a simulated navigation run using the ACTUAL generated route.
     * If a route is loaded (from Map My Run), uses its polyline and turn instructions.
     * Falls back to a Belfast test route if no route is configured.
     *
     * The simulation:
     * - Follows the route polyline points sequentially
     * - Triggers all navigation TTS (upcoming turns, reached waypoints, missed waypoint skip)
     * - Shows the runner moving on the map in real time
     */
    fun startNavigationSimulatedRun() {
        _runState.update { it.copy(isRunning = true) }

        try {
            val route = runConfig?.route
            val distance = route?.distance ?: 3.0
            
            // Pass route data to the service via NavigationRouteHolder
            if (route != null && route.polyline.isNotEmpty()) {
                NavigationRouteHolder.set(route.polyline, route.turnInstructions)
                Log.d("RunSessionViewModel", "Nav simulation using ACTUAL route: ${route.name}, " +
                        "${route.turnInstructions.size} instructions, ${distance}km")
            } else {
                Log.d("RunSessionViewModel", "Nav simulation: no route configured, using Belfast test route")
            }
            
            val intent = Intent(context, RunTrackingService::class.java).apply {
                action = RunTrackingService.ACTION_START_NAV_SIMULATION
                putExtra(RunTrackingService.EXTRA_TARGET_DISTANCE, distance)
                putExtra(RunTrackingService.EXTRA_HAS_ROUTE, true)
                // Pass polyline so the service can build the simulator from it
                if (route != null && route.polyline.isNotEmpty()) {
                    putExtra("EXTRA_ROUTE_POLYLINE", route.polyline)
                }
            }
            context.startForegroundService(intent)
            Log.d("RunSessionViewModel", "Started navigation simulation")
        } catch (e: Exception) {
            Log.e("RunSessionViewModel", "Failed to start navigation simulation", e)
        }
    }

    fun startRun() {
        // Reset route recognition state for this new run
        _knownRouteMatch.value = null
        routeIntelligenceContext = null
        RunTrackingService.routeIntelligenceContext = null

        // Only clear coach state if no briefing audio is currently playing
        // This allows the pre-run briefing to finish naturally if still playing
        // But prevents any new coaching triggers when starting the run
        if (!isBriefingAudioPlaying) {
            isPrepareRunInProgress = false
            _runState.update { it.copy(
                coachText = "",
                latestCoachMessage = ""
            )}
        }
        
        try {
            // Pass route navigation data to the service via static holder
            // (Intent extras can't reliably carry large lists)
            runConfig?.route?.let { route ->
                NavigationRouteHolder.set(route.polyline, route.turnInstructions)
                Log.d("RunSessionViewModel", "Set navigation data: ${route.turnInstructions.size} turn instructions")
            }
            
            val intent = Intent(context, RunTrackingService::class.java).apply {
                action = RunTrackingService.ACTION_START_TRACKING
                // Pass target distance and time to service if configured
                runConfig?.let {
                    it.targetDistance?.let { dist -> putExtra(RunTrackingService.EXTRA_TARGET_DISTANCE, dist.toDouble()) }
                    // Calculate target time in milliseconds if set
                    if (it.hasTargetTime) {
                        val targetTimeMs = (it.targetHours * 3600000L) + (it.targetMinutes * 60000L) + (it.targetSeconds * 1000L)
                        putExtra(RunTrackingService.EXTRA_TARGET_TIME, targetTimeMs)
                    }
                    putExtra(RunTrackingService.EXTRA_HAS_ROUTE, it.route != null)
                    // Coaching programme context
                    it.trainingPlanId?.let { id -> putExtra(RunTrackingService.EXTRA_TRAINING_PLAN_ID, id) }
                    it.workoutId?.let { id -> putExtra(RunTrackingService.EXTRA_WORKOUT_ID, id) }
                    it.workoutType?.let { t -> putExtra(RunTrackingService.EXTRA_WORKOUT_TYPE, t) }
                    it.workoutIntensity?.let { i -> putExtra(RunTrackingService.EXTRA_WORKOUT_INTENSITY, i) }
                    it.workoutDescription?.let { d -> putExtra(RunTrackingService.EXTRA_WORKOUT_DESCRIPTION, d) }
                    it.planGoalType?.let { g -> putExtra(RunTrackingService.EXTRA_PLAN_GOAL_TYPE, g) }
                    it.planWeekNumber?.let { w -> putExtra(RunTrackingService.EXTRA_PLAN_WEEK_NUMBER, w) }
                    it.planTotalWeeks?.let { total -> putExtra(RunTrackingService.EXTRA_PLAN_TOTAL_WEEKS, total) }
                }
                // Pass AI session instructions as JSON so RunTrackingService can use them (legacy plan)
                sessionInstructions?.let { instructions ->
                    try {
                        val instructionsJson = gson.toJson(instructions)
                        putExtra(RunTrackingService.EXTRA_SESSION_INSTRUCTIONS_JSON, instructionsJson)
                        Log.d("RunSessionViewModel", "Passed session instructions to service (tone=${instructions.aiDeterminedTone})")
                    } catch (e: Exception) {
                        Log.w("RunSessionViewModel", "Failed to serialize session instructions: ${e.message}")
                    }
                }
                // Pass rich dynamic coaching plan (prepare-coaching) — enables reactive trigger evaluation
                activeSessionCoachingPlan?.let { plan ->
                    try {
                        val planJson = gson.toJson(plan)
                        putExtra(RunTrackingService.EXTRA_DYNAMIC_COACHING_PLAN_JSON, planJson)
                        Log.d("RunSessionViewModel", "Passed dynamic coaching plan to service (strategy=${plan.cueingStrategy}, triggers=${plan.triggers.size})")
                    } catch (e: Exception) {
                        Log.w("RunSessionViewModel", "Failed to serialize dynamic coaching plan: ${e.message}")
                    }
                }
            }
            
            // Start service in foreground mode (Android O+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            
            _runState.update { it.copy(isRunning = true, isPaused = false) }
            Log.d("RunSessionViewModel", "Run tracking service started")
        } catch (e: Exception) {
            Log.e("RunSessionViewModel", "Failed to start run tracking service", e)
            _runState.update { it.copy(
                coachText = "Failed to start run. Please try again."
            )}
        }
    }

    fun pauseRun() {
        val intent = Intent(context, RunTrackingService::class.java).apply {
            action = RunTrackingService.ACTION_PAUSE_TRACKING
        }
        context.startService(intent)
        _runState.update { it.copy(isRunning = false, isPaused = true) }
    }

    fun resumeRun() {
        val intent = Intent(context, RunTrackingService::class.java).apply {
            action = RunTrackingService.ACTION_RESUME_TRACKING
        }
        context.startService(intent)
        _runState.update { it.copy(isRunning = true, isPaused = false) }
    }

    fun stopRun() {
        val intent = Intent(context, RunTrackingService::class.java).apply {
            action = RunTrackingService.ACTION_STOP_TRACKING
        }
        context.startService(intent)
        _runState.update { it.copy(isRunning = false, isPaused = false, isStopping = true) }
    }

    // ── Wake word ─────────────────────────────────────────────────────────────

    /**
     * Called by [WakeWordDetector] when "hey coach" is heard.
     *
     * Plays the pre-warmed Polly "Yes?" audio (cached at run start) so there's
     * zero network latency. Falls back to device TTS if audio wasn't pre-warmed.
     * After playback completes the query listening window opens.
     */
    private fun onWakeWordDetected() {
        // Debounce: reject duplicate triggers within 3 seconds (guards against ConnectIQ
        // delivering the same talkToCoach message to both the service and ViewModel handlers)
        val now = System.currentTimeMillis()
        if (now - lastWakeWordTriggerMs < WAKE_WORD_DEBOUNCE_MS) {
            Log.d("RunSessionViewModel", "🎤 Wake word debounced (${now - lastWakeWordTriggerMs}ms since last trigger)")
            return
        }
        lastWakeWordTriggerMs = now
        Log.d("RunSessionViewModel", "🎤 Wake word detected — opening query window")
        val cachedBytes = yesAudioBytes
        if (cachedBytes != null) {
            // Play pre-warmed Polly audio — instant, no network call
            Log.d("RunSessionViewModel", "Playing pre-warmed Polly 'Yes?' audio")
            val base64 = android.util.Base64.encodeToString(cachedBytes, android.util.Base64.NO_WRAP)
            audioPlayerHelper.playAudio(base64, yesAudioFormat) {
                startListening(fromWakeWord = true)
            }
        } else {
            // Fallback to device TTS if pre-warm failed (offline, cold start, etc.)
            Log.w("RunSessionViewModel", "Polly 'Yes?' not pre-warmed — falling back to device TTS")
            textToSpeechHelper.speak("Yes?", accent = user?.coachAccent)
            startListening(fromWakeWord = true)
        }
    }

    /**
     * Pre-warm "Yes?" audio from AWS Polly so it plays instantly when the
     * wake word fires. Called once per run — the audio is cached for the duration.
     */
    private fun preWarmYesAudio() {
        viewModelScope.launch {
            try {
                val response = apiService.generateTts(
                    live.airuncoach.airuncoach.network.model.GenerateTtsRequest("Yes?")
                )
                val bytes = android.util.Base64.decode(response.audio, android.util.Base64.DEFAULT)
                yesAudioBytes = bytes
                yesAudioFormat = response.format
                Log.d("RunSessionViewModel", "✅ Pre-warmed Polly 'Yes?' audio (${bytes.size} bytes)")
            } catch (e: Exception) {
                Log.w("RunSessionViewModel", "Could not pre-warm Polly 'Yes?' audio: ${e.message} — device TTS will be used as fallback")
                yesAudioBytes = null
            }
        }
    }

    /** Start/stop wake word detection in sync with run active state. */
    fun startWakeWordDetection() {
        if (voiceActivationEnabled) {
            wakeWordDetector.startWatching()
            // Pre-warm "Yes?" via Polly so playback is instant when wake word fires
            preWarmYesAudio()
            Log.d("RunSessionViewModel", "Wake word detection started")
        }
    }

    fun stopWakeWordDetection() {
        wakeWordDetector.stopWatching()
        yesAudioBytes = null  // Free the cached bytes
        Log.d("RunSessionViewModel", "Wake word detection stopped")
    }

    fun setVoiceActivationEnabled(enabled: Boolean) {
        voiceActivationEnabled = enabled
        if (!enabled) {
            wakeWordDetector.stopWatching()
        } else if (_runState.value.isRunning) {
            wakeWordDetector.startWatching()
        }
    }

    // ── Talk to Coach ─────────────────────────────────────────────────────────

    /**
     * Begin a talk-to-coach session (5-second silence timeout).
     * [fromWakeWord] = true means this was triggered by "hey coach" — the wake
     * detector is already paused and will be resumed after the exchange.
     */
    fun startListening(fromWakeWord: Boolean = false) {
        // Pause the wake word detector while we handle the full query
        if (!fromWakeWord) wakeWordDetector.pauseListening()

        speechRecognizerHelper.startListening()
        _runState.update { it.copy(coachText = "Listening...") }

        // Collect speech recognition results
        viewModelScope.launch {
            speechRecognizerHelper.speechState.collect { speechState ->
                when (speechState.status) {
                    SpeechStatus.LISTENING -> {
                        _runState.update { it.copy(coachText = "Listening...") }
                    }
                    SpeechStatus.IDLE -> {
                        if (speechState.text.isNotEmpty()) {
                            _runState.update { it.copy(coachText = "You said: ${speechState.text}") }
                            sendMessageToCoach(speechState.text, onComplete = {
                                wakeWordDetector.resumeListening()
                            })
                        }
                    }
                    SpeechStatus.TIMED_OUT -> {
                        // User didn't speak within 5 seconds — cancel quietly
                        Log.d("RunSessionViewModel", "Speech timeout — no query received")
                        _runState.update { it.copy(coachText = "") }
                        wakeWordDetector.resumeListening()
                        return@collect
                    }
                    SpeechStatus.ERROR -> {
                        _runState.update {
                            it.copy(coachText = "Sorry, I couldn't hear you. Try again!")
                        }
                        viewModelScope.launch {
                            kotlinx.coroutines.delay(2000)
                            _runState.update { it.copy(coachText = "") }
                        }
                        wakeWordDetector.resumeListening()
                        return@collect
                    }
                }
            }
        }
    }
    
    private fun sendMessageToCoach(message: String, onComplete: (() -> Unit)? = null) {
        viewModelScope.launch {
            try {
                _runState.update { it.copy(coachText = "Thinking...") }
                
                val request = TalkToCoachRequest(
                    message = message,
                    context = CoachingContext(
                        distance = runSession.value?.getDistanceInKm(),
                        duration = (runSession.value?.duration?.div(1000))?.toInt(),
                        pace = runSession.value?.averagePace,
                        totalDistance = runSession.value?.getDistanceInKm(),
                        heartRate = runSession.value?.heartRate?.takeIf { it > 0 },
                        cadence = runSession.value?.cadence?.takeIf { it > 0 },
                        elevation = runSession.value?.totalElevationGain,
                        elevationChange = null,
                        currentGrade = null,
                        totalElevationGain = runSession.value?.totalElevationGain,
                        weather = runSession.value?.weatherAtStart,
                        phase = runSession.value?.phase,
                        isStruggling = runSession.value?.isStruggling,
                        activityType = "run",
                        userFitnessLevel = null,
                        coachName = user?.coachName,
                        coachTone = user?.coachTone,
                        coachGender = user?.coachGender,
                        coachAccent = user?.coachAccent,
                        wellness = _runState.value.wellnessContext
                    )
                )
                
                val response = apiService.talkToCoach(request)
                
                // Update UI with response
                _runState.update { it.copy(
                    coachText = response.message,
                    latestCoachMessage = response.message
                )}
                
                // Play OpenAI TTS audio if available, otherwise fall back to Android TTS - with guard against duplicates
                if (!isBriefingAudioPlaying && !_runState.value.isMuted) {
                    isBriefingAudioPlaying = true
                    if (response.audio != null && response.format != null) {
                        audioPlayerHelper.playAudio(response.audio!!, response.format!!) {
                            isBriefingAudioPlaying = false
                            _runState.update { it.copy(coachText = "") }
                            onComplete?.invoke()
                        }
                    } else {
                        textToSpeechHelper.speak(response.message, accent = user?.coachAccent)
                        isBriefingAudioPlaying = false
                        _runState.update { it.copy(coachText = "") }
                        onComplete?.invoke()
                    }
                } else {
                    onComplete?.invoke()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                _runState.update {
                    it.copy(coachText = "Sorry, I couldn't process that. Keep going!")
                }
                onComplete?.invoke()
            }
        }
    }

    fun toggleCoach() {
        _runState.update { it.copy(isCoachEnabled = !it.isCoachEnabled) }
    }

    fun toggleMute() {
        _runState.update { it.copy(isMuted = !it.isMuted) }
    }

    /**
     * Cancel the run setup. Stops all AI audio, clears the coaching message,
     * resets state ready for a new run, and cancels any ongoing prepareRun operations.
     * Called when user taps Cancel before starting a run, or when auth validation fails.
     */
    fun cancelRunSetup() {
        Log.d("RunSessionViewModel", "Cancelling run setup - stopping all audio and clearing pending operations")
        // Set flag FIRST to prevent any pending coroutines from updating UI
        isSetupCancelled = true
        // Stop all AI audio playback
        CoachingAudioQueue.stopAll()
        // Clear the coach message so UI hides the panel
        _runState.update { it.copy(latestCoachMessage = null, coachText = "") }
        // Reset briefing audio flag
        isBriefingAudioPlaying = false
        // Reset the prepare run flag to allow cleanup
        isPrepareRunInProgress = false
        // Clear any pending run configuration
        runConfig = null
    }

    /**
     * Validate the current auth token by calling a protected API endpoint.
     * Uses GET /api/users/{id} (which is known-good) rather than /api/users/me
     * which has a backend bug returning 404 for valid users.
     *
     * Throws an exception if the token is expired/invalid (401/403).
     */
    suspend fun validateAuthToken() {
        Log.d("RunSessionViewModel", "Validating auth token before run start...")
        val userId = sessionManager.getUserId()
        if (userId.isNullOrBlank()) {
            Log.e("RunSessionViewModel", "❌ No user ID in session — cannot validate token")
            throw IllegalStateException("No user ID in session")
        }
        try {
            apiService.getUser(userId)
            Log.d("RunSessionViewModel", "✅ Auth token validated successfully")
        } catch (e: Exception) {
            Log.e("RunSessionViewModel", "❌ Auth token validation failed: ${e.message}")
            throw e
        }
    }

    override fun onCleared() {
        super.onCleared()
        textToSpeechHelper.destroy()
        wakeWordDetector.stopWatching()
        speechRecognizerHelper.destroy()
    }
}