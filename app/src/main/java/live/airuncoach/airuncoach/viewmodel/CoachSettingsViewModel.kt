
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
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

    private val _coachName = MutableStateFlow("AI Coach")
    val coachName: StateFlow<String> = _coachName.asStateFlow()

    private val _voiceGender = MutableStateFlow("male")
    val voiceGender: StateFlow<String> = _voiceGender.asStateFlow()

    private val _accent = MutableStateFlow("british")
    val accent: StateFlow<String> = _accent.asStateFlow()

    private val _coachingTone = MutableStateFlow("energetic")
    val coachingTone: StateFlow<String> = _coachingTone.asStateFlow()

    val availableAccents = listOf("British", "American", "Australian", "Irish", "Scottish", "New Zealand")
    val availableTones = listOf(
        CoachingTone("Energetic", "High energy, upbeat encouragement"),
        CoachingTone("Motivational", "Inspiring and supportive coaching"),
        CoachingTone("Instructive", "Clear, detailed guidance and tips"),
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
        }
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

    fun saveSettings() {
        viewModelScope.launch {
            val userJson = sharedPrefs.getString("user", null)
            if (userJson != null) {
                val user = gson.fromJson(userJson, User::class.java)
                val request = UpdateCoachSettingsRequest(
                    coachName = _coachName.value,
                    coachGender = _voiceGender.value,
                    coachAccent = _accent.value,
                    coachTone = _coachingTone.value
                )
                try {
                    val updatedUser = apiService.updateCoachSettings(user.id, request)
                    val updatedUserJson = gson.toJson(updatedUser)
                    sharedPrefs.edit().putString("user", updatedUserJson).apply()
                } catch (e: Exception) {
                    // Handle error
                }
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
