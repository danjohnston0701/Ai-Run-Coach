
package live.airuncoach.airuncoach.viewmodel

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import androidx.activity.result.contract.ActivityResultContract
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.HealthConnectRepository
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.*
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.service.RunTrackingService
import live.airuncoach.airuncoach.utils.SpeechRecognizerHelper
import live.airuncoach.airuncoach.utils.SpeechState
import live.airuncoach.airuncoach.utils.TextToSpeechHelper
import javax.inject.Inject

data class RunState(
    val time: String = "00:00",
    val distance: String = "0.00",
    val pace: String = "0:00",
    val cadence: String = "0",
    val heartRate: String = "0",
    val isRunning: Boolean = false,
    val isPaused: Boolean = false,
    val isCoachEnabled: Boolean = true,
    val isMuted: Boolean = false,
    val coachText: String = "GPS locked! Tap 'Start Run' when you're ready.",
    val speechState: SpeechState = SpeechState(),
    val wellnessContext: WellnessContext? = null
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

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private var user: User? = null

    init {
        loadUser()
        viewModelScope.launch {
            runSession.collect { session ->
                session?.let { 
                    _runState.update {
                        it.copy(
                            time = session.getFormattedDuration(),
                            distance = String.format("%.2f", session.getDistanceInKm()),
                            pace = session.averagePace,
                            cadence = session.cadence.toString(),
                            heartRate = session.heartRate.toString(),
                            isRunning = session.isActive && !it.isPaused
                        )
                    }
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

    fun getHealthConnectPermissionsContract(): ActivityResultContract<Set<String>, Set<String>> {
        return healthConnectRepository.getPermissionsRequestContract()
    }

    fun fetchWellnessData() {
        viewModelScope.launch {
            val wellness = healthConnectRepository.getWellnessContext()
            _runState.update { it.copy(wellnessContext = wellness) }
        }
    }

    fun prepareRun() {
        // TODO: Prepare run by getting pre-run briefing
    }

    fun startRun() {
        val intent = Intent(context, RunTrackingService::class.java).apply {
            action = RunTrackingService.ACTION_START_TRACKING
        }
        context.startService(intent)
        _runState.update { it.copy(isRunning = true, isPaused = false) }
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
        _runState.update { it.copy(isRunning = false, isPaused = false) }
    }

    fun startListening() {
        speechRecognizerHelper.startListening()
    }

    fun toggleCoach() {
        _runState.update { it.copy(isCoachEnabled = !it.isCoachEnabled) }
    }

    fun toggleMute() {
        _runState.update { it.copy(isMuted = !it.isMuted) }
    }
}