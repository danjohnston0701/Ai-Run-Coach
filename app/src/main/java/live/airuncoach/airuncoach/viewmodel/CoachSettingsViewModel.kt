
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import live.airuncoach.airuncoach.data.CoachingFeaturePreferences
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.UpdateCoachSettingsRequest

data class CoachingTone(val name: String, val description: String)

class CoachSettingsViewModel(private val context: Context) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val sessionManager = SessionManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance
    private val featurePrefs = CoachingFeaturePreferences(context)

    private val _coachName = MutableStateFlow("AI Coach")
    val coachName: StateFlow<String> = _coachName.asStateFlow()

    private val _voiceGender = MutableStateFlow("male")
    val voiceGender: StateFlow<String> = _voiceGender.asStateFlow()

    private val _accent = MutableStateFlow("british")
    val accent: StateFlow<String> = _accent.asStateFlow()

    private val _coachingTone = MutableStateFlow("energetic")
    val coachingTone: StateFlow<String> = _coachingTone.asStateFlow()

    private val _nicknameStyle = MutableStateFlow("occasional")
    val nicknameStyle: StateFlow<String> = _nicknameStyle.asStateFlow()

    // In-Run AI Coaching feature toggles (all default to enabled)
    private val _paceCoachingEnabled = MutableStateFlow(true)
    val paceCoachingEnabled: StateFlow<Boolean> = _paceCoachingEnabled.asStateFlow()

    private val _routeNavigationEnabled = MutableStateFlow(true)
    val routeNavigationEnabled: StateFlow<Boolean> = _routeNavigationEnabled.asStateFlow()

    private val _elevationCoachingEnabled = MutableStateFlow(true)
    val elevationCoachingEnabled: StateFlow<Boolean> = _elevationCoachingEnabled.asStateFlow()

    private val _heartRateCoachingEnabled = MutableStateFlow(true)
    val heartRateCoachingEnabled: StateFlow<Boolean> = _heartRateCoachingEnabled.asStateFlow()

    private val _cadenceStrideEnabled = MutableStateFlow(true)
    val cadenceStrideEnabled: StateFlow<Boolean> = _cadenceStrideEnabled.asStateFlow()

    private val _kmSplitsEnabled = MutableStateFlow(true)
    val kmSplitsEnabled: StateFlow<Boolean> = _kmSplitsEnabled.asStateFlow()

    private val _struggleDetectionEnabled = MutableStateFlow(true)
    val struggleDetectionEnabled: StateFlow<Boolean> = _struggleDetectionEnabled.asStateFlow()

    private val _motivationalCoachingEnabled = MutableStateFlow(true)
    val motivationalCoachingEnabled: StateFlow<Boolean> = _motivationalCoachingEnabled.asStateFlow()

    private val _halfKmCheckInEnabled = MutableStateFlow(true)
    val halfKmCheckInEnabled: StateFlow<Boolean> = _halfKmCheckInEnabled.asStateFlow()

    private val _kmSplitIntervalKm = MutableStateFlow(1)
    val kmSplitIntervalKm: StateFlow<Int> = _kmSplitIntervalKm.asStateFlow()

    val availableKmSplitIntervals = listOf(1, 2, 3, 5, 10)

    val availableAccents = listOf(
        "British", "American", "Australian", "Irish", "Scottish", "New Zealand",
        "South African", "Canadian", "Welsh", "Indian", "Caribbean", "Scandinavian"
    )
    val availableTones = listOf(
        CoachingTone("Energetic", "High energy, upbeat encouragement"),
        CoachingTone("Motivational", "Inspiring and supportive coaching"),
        CoachingTone("Friendly", "Like running with your best mate"),
        CoachingTone("Instructive", "Clear, detailed guidance and tips"),
        CoachingTone("Tough Love", "Firm but caring — pushes you because they believe in you"),
        CoachingTone("Analytical", "Deep stats nerd, data-driven insights"),
        CoachingTone("Zen", "Calm, mindful, breathing-focused"),
        CoachingTone("Playful", "Witty, light-hearted, uses humour"),
        CoachingTone("Factual", "Straightforward stats and information"),
        CoachingTone("Abrupt", "Short, direct commands")
    )

    init {
        loadUserSettings()
    }

    private fun loadUserSettings() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            val user = gson.fromJson(userJson, User::class.java)
            _coachName.value = user.coachName
            _voiceGender.value = user.coachGender
            _accent.value = user.coachAccent
            _coachingTone.value = user.coachTone
            _nicknameStyle.value = user.nicknameStyle
            // Sync coaching feature prefs from server-stored User model to local prefs
            featurePrefs.loadFromUser(user)
        }
        // Load coaching feature toggles (now reflects server data if User was loaded)
        _paceCoachingEnabled.value = featurePrefs.paceCoachingEnabled
        _routeNavigationEnabled.value = featurePrefs.routeNavigationEnabled
        _elevationCoachingEnabled.value = featurePrefs.elevationCoachingEnabled
        _heartRateCoachingEnabled.value = featurePrefs.heartRateCoachingEnabled
        _cadenceStrideEnabled.value = featurePrefs.cadenceStrideEnabled
        _kmSplitsEnabled.value = featurePrefs.kmSplitsEnabled
        _struggleDetectionEnabled.value = featurePrefs.struggleDetectionEnabled
        _motivationalCoachingEnabled.value = featurePrefs.motivationalCoachingEnabled
        _halfKmCheckInEnabled.value = featurePrefs.halfKmCheckInEnabled
        _kmSplitIntervalKm.value = featurePrefs.kmSplitIntervalKm
    }

    fun onCoachNameChanged(name: String) {
        _coachName.value = name
    }

    fun onVoiceGenderChanged(gender: String) {
        _voiceGender.value = gender
    }

    fun onAccentChanged(accent: String) {
        _accent.value = accent
    }

    fun onCoachingToneChanged(tone: String) {
        _coachingTone.value = tone
    }

    fun onNicknameStyleChanged(style: String) {
        _nicknameStyle.value = style
    }

    // Coaching feature toggle handlers — save immediately to SharedPreferences
    fun onPaceCoachingToggled(enabled: Boolean) {
        _paceCoachingEnabled.value = enabled
        featurePrefs.paceCoachingEnabled = enabled
    }

    fun onRouteNavigationToggled(enabled: Boolean) {
        _routeNavigationEnabled.value = enabled
        featurePrefs.routeNavigationEnabled = enabled
    }

    fun onElevationCoachingToggled(enabled: Boolean) {
        _elevationCoachingEnabled.value = enabled
        featurePrefs.elevationCoachingEnabled = enabled
    }

    fun onHeartRateCoachingToggled(enabled: Boolean) {
        _heartRateCoachingEnabled.value = enabled
        featurePrefs.heartRateCoachingEnabled = enabled
    }

    fun onCadenceStrideToggled(enabled: Boolean) {
        _cadenceStrideEnabled.value = enabled
        featurePrefs.cadenceStrideEnabled = enabled
    }

    fun onKmSplitsToggled(enabled: Boolean) {
        _kmSplitsEnabled.value = enabled
        featurePrefs.kmSplitsEnabled = enabled
    }

    fun onStruggleDetectionToggled(enabled: Boolean) {
        _struggleDetectionEnabled.value = enabled
        featurePrefs.struggleDetectionEnabled = enabled
    }

    fun onMotivationalCoachingToggled(enabled: Boolean) {
        _motivationalCoachingEnabled.value = enabled
        featurePrefs.motivationalCoachingEnabled = enabled
    }

    fun onHalfKmCheckInToggled(enabled: Boolean) {
        _halfKmCheckInEnabled.value = enabled
        featurePrefs.halfKmCheckInEnabled = enabled
    }

    fun onKmSplitIntervalChanged(intervalKm: Int) {
        _kmSplitIntervalKm.value = intervalKm
        featurePrefs.kmSplitIntervalKm = intervalKm
    }

    suspend fun saveSettings() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            val user = gson.fromJson(userJson, User::class.java)
            val request = UpdateCoachSettingsRequest(
                coachName = _coachName.value,
                coachGender = _voiceGender.value,
                coachAccent = _accent.value,
                coachTone = _coachingTone.value,
                nicknameStyle = _nicknameStyle.value,
                // Include all coaching feature preferences so they persist to server
                coachPaceEnabled = _paceCoachingEnabled.value,
                coachNavigationEnabled = _routeNavigationEnabled.value,
                coachElevationEnabled = _elevationCoachingEnabled.value,
                coachHeartRateEnabled = _heartRateCoachingEnabled.value,
                coachCadenceStrideEnabled = _cadenceStrideEnabled.value,
                coachKmSplitsEnabled = _kmSplitsEnabled.value,
                coachStruggleEnabled = _struggleDetectionEnabled.value,
                coachMotivationalEnabled = _motivationalCoachingEnabled.value,
                coachHalfKmCheckInEnabled = _halfKmCheckInEnabled.value,
                coachKmSplitIntervalKm = _kmSplitIntervalKm.value
            )
            try {
                val updatedUser = apiService.updateCoachSettings(user.id, request)
                val updatedUserJson = gson.toJson(updatedUser)
                sharedPrefs.edit().putString("user", updatedUserJson).apply()
                // Also sync local prefs from server response
                featurePrefs.loadFromUser(updatedUser)
            } catch (e: Exception) {
                Log.e("CoachSettingsViewModel", "Failed to save settings", e)
            }
        }
    }
}

class CoachSettingsViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(CoachSettingsViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return CoachSettingsViewModel(context) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
