
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
import live.airuncoach.airuncoach.service.RunTrackingService
import live.airuncoach.airuncoach.utils.AudioPlayerHelper
import live.airuncoach.airuncoach.utils.SpeechRecognizerHelper
import live.airuncoach.airuncoach.utils.SpeechState
import live.airuncoach.airuncoach.utils.SpeechStatus
import live.airuncoach.airuncoach.utils.TextToSpeechHelper
import java.util.Locale
import javax.inject.Inject

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
    val isStopping: Boolean = false,
    val backendRunId: String? = null
)

@HiltViewModel
@SuppressLint("StaticFieldLeak")
class RunSessionViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager,
    private val healthConnectRepository: HealthConnectRepository,
) : ViewModel() {

    private val _runState = MutableStateFlow(RunState())
    val runState: StateFlow<RunState> = _runState.asStateFlow()

    val runSession = RunTrackingService.currentRunSession

    private val speechRecognizerHelper = SpeechRecognizerHelper(context)
    private val textToSpeechHelper = TextToSpeechHelper(context)
    private val audioPlayerHelper = AudioPlayerHelper(context)
    private val weatherRepository = WeatherRepository(context)

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private var user: User? = null
    private var runConfig: RunSetupConfig? = null
    private var isBriefingAudioPlaying = false // Guard against duplicate audio playback

    init {
        loadUser()
        loadAiCoachPreference()
        viewModelScope.launch {
            runSession.collect { session ->
                session?.let { 
                    _runState.update {
                        it.copy(
                            time = session.getFormattedDuration(),
                            distance = String.format("%.2f", session.getDistanceInKm()),
                            pace = session.averagePace ?: "0:00",
                            currentPace = session.currentPace ?: "0:00",
                            cadence = session.cadence.toString(),
                            heartRate = session.heartRate.toString(),
                            isRunning = session.isActive && !it.isPaused
                        )
                    }
                }
            }
        }
        
        // Listen for upload completion
        viewModelScope.launch {
            RunTrackingService.uploadComplete.collect { backendRunId ->
                backendRunId?.let {
                    Log.d("RunSessionViewModel", "Upload complete with backend ID: $it")
                    _runState.update { state -> state.copy(backendRunId = it, isStopping = false) }
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

    fun prepareRun() {
        // Prevent multiple simultaneous calls
        if (isPrepareRunInProgress) {
            Log.d("RunSessionViewModel", "prepareRun already in progress, skipping duplicate call")
            return
        }
        
        isPrepareRunInProgress = true
        viewModelScope.launch {
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
                withTimeout(15000) { // 15 second timeout
                    
                    // Get route data from runConfig if available
                    val route = runConfig?.route
                    // Explicitly determine hasRoute - must be false if no route
                    val hasRoute = route != null && route.distance > 0
                    val distance = route?.distance ?: runConfig?.targetDistance?.toDouble() ?: 5.0
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
                    val targetPace = if (targetTimeSeconds != null && distance > 0) {
                        val paceSeconds = (targetTimeSeconds / distance).toInt()
                        val minutes = paceSeconds / 60
                        val seconds = paceSeconds % 60
                        String.format(Locale.getDefault(), "%d:%02d", minutes, seconds)
                    } else null
                    
                    Log.d("RunSessionViewModel", "Preparing briefing: distance=$distance km, elevation=$elevationGain m, maxGradient=$maxGradientDegrees°")
                    
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
                        wellness = wellnessPayload
                    )
                    
                    val briefing = apiService.getPreRunBriefing(request)
                    
                    // Debug: Log what we received from the API
                    Log.d("RunSessionViewModel", "Pre-run briefing response - audio: ${briefing.audio?.take(50)}, format: ${briefing.format}, text: ${briefing.text?.take(100)}")
                    
                    // Update UI with briefing text (use empty string if null)
                    val briefingText = briefing.text ?: ""
                    _runState.update { it.copy(
                        coachText = briefingText,
                        latestCoachMessage = briefingText,
                        isLoadingBriefing = false
                    )}
                    
                    // Play OpenAI TTS audio if available and not muted - with guard against duplicates
                    if (!isBriefingAudioPlaying && !_runState.value.isMuted) {
                        isBriefingAudioPlaying = true
                        if (briefing.audio != null && briefing.format != null) {
                            Log.d("RunSessionViewModel", "Playing OpenAI TTS audio (${briefing.format})")
                            audioPlayerHelper.playAudio(briefing.audio, briefing.format) {
                                isBriefingAudioPlaying = false
                                // Clear coach text after audio completes, ready for next prompt
                                _runState.update { it.copy(coachText = "") }
                            }
                        } else {
                            Log.d("RunSessionViewModel", "Falling back to Android TTS")
                            textToSpeechHelper.speak(briefing.text)
                            isBriefingAudioPlaying = false
                            // Clear coach text after TTS completes (immediate in this case)
                            _runState.update { it.copy(coachText = "") }
                        }
                    } else if (_runState.value.isMuted) {
                        Log.d("RunSessionViewModel", "Audio muted - skipping playback")
                    }
                    
                    // Reset the flag to allow re-triggering if needed
                    isPrepareRunInProgress = false
                } // End of withTimeout
            } catch (e: TimeoutCancellationException) {
                Log.w("RunSessionViewModel", "Pre-run briefing timed out")
                isBriefingAudioPlaying = false
                _runState.update { 
                    it.copy(
                        coachText = "Ready to run! Tap Start when you're ready.",
                        isLoadingBriefing = false
                    )
                }
            } catch (e: Exception) {
                Log.e("RunSessionViewModel", "Failed to get pre-run briefing", e)
                isBriefingAudioPlaying = false
                _runState.update { 
                    it.copy(
                        coachText = "Ready to run! Tap Start when you're ready.",
                        isLoadingBriefing = false
                    )
                }
            }
        }
    }

    fun setRunConfig(config: RunSetupConfig) {
        runConfig = config
        // Only update coachText if we don't already have a briefing loaded
        // This prevents overwriting the AI briefing when config is set
        if (_runState.value.coachText.isEmpty() || 
            _runState.value.coachText.contains("Ready to run")) {
            if (config.hasTargetTime) {
                val targetTimeStr = config.getFormattedTargetTime()
                _runState.update { it.copy(
                    coachText = "Target: ${config.targetDistance} km in $targetTimeStr. Ready to start!"
                )}
            } else {
                _runState.update { it.copy(
                    coachText = "Target: ${config.targetDistance} km. Ready to start!"
                )}
            }
        }
    }

    fun startRun() {
        // Clear any coach text and audio state to prevent any coaching audio when starting the run
        // The pre-run briefing already played when the screen loaded
        isBriefingAudioPlaying = false
        isPrepareRunInProgress = false
        _runState.update { it.copy(
            coachText = "",
            latestCoachMessage = ""
        )}
        
        try {
            val intent = Intent(context, RunTrackingService::class.java).apply {
                action = RunTrackingService.ACTION_START_TRACKING
                // Pass target distance and time to service if configured
                runConfig?.let {
                    putExtra(RunTrackingService.EXTRA_TARGET_DISTANCE, it.targetDistance.toDouble())
                    // Calculate target time in milliseconds if set
                    if (it.hasTargetTime) {
                        val targetTimeMs = (it.targetHours * 3600000L) + (it.targetMinutes * 60000L)
                        putExtra(RunTrackingService.EXTRA_TARGET_TIME, targetTimeMs)
                    }
                    putExtra(RunTrackingService.EXTRA_HAS_ROUTE, it.route != null)
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

    fun startListening() {
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
                            sendMessageToCoach(speechState.text)
                        }
                    }
                    SpeechStatus.ERROR -> {
                        _runState.update { 
                            it.copy(coachText = "Sorry, I couldn't hear you. Try again!") 
                        }
                    }
                }
            }
        }
    }
    
    private fun sendMessageToCoach(message: String) {
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
                        coachTone = user?.coachTone,
                        coachAccent = null,
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
                            // Clear coach text after audio completes
                            _runState.update { it.copy(coachText = "") }
                        }
                    } else {
                        textToSpeechHelper.speak(response.message)
                        isBriefingAudioPlaying = false
                        // Clear coach text after TTS completes
                        _runState.update { it.copy(coachText = "") }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                _runState.update { 
                    it.copy(coachText = "Sorry, I couldn't process that. Keep going!") 
                }
            }
        }
    }

    fun toggleCoach() {
        _runState.update { it.copy(isCoachEnabled = !it.isCoachEnabled) }
    }

    fun toggleMute() {
        _runState.update { it.copy(isMuted = !it.isMuted) }
    }
    
    override fun onCleared() {
        super.onCleared()
        textToSpeechHelper.destroy()
    }
}