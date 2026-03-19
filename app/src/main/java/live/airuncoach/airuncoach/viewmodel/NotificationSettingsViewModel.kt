package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.ApiService
import javax.inject.Inject

data class NotificationPreferencesState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val friendRequest: Boolean = true,
    val friendAccepted: Boolean = true,
    val groupRunInvite: Boolean = true,
    val groupRunStarting: Boolean = true,
    val runCompleted: Boolean = false,
    val weeklyProgress: Boolean = false,
    val liveRunInvite: Boolean = true,
    val liveObserverJoined: Boolean = true,
    val coachingPlanReminder: Boolean = true,
)

@HiltViewModel
class NotificationSettingsViewModel @Inject constructor(
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationPreferencesState())
    val state: StateFlow<NotificationPreferencesState> = _state

    init {
        loadPreferences()
    }

    private fun loadPreferences() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val userId = sessionManager.getUserId() ?: return@launch
                val prefs = apiService.getNotificationPreferences(userId)
                
                _state.value = NotificationPreferencesState(
                    isLoading = false,
                    friendRequest = prefs.friendRequest,
                    friendAccepted = prefs.friendAccepted,
                    groupRunInvite = prefs.groupRunInvite,
                    groupRunStarting = prefs.groupRunStarting,
                    runCompleted = prefs.runCompleted,
                    weeklyProgress = prefs.weeklyProgress,
                    liveRunInvite = prefs.liveRunInvite,
                    liveObserverJoined = prefs.liveObserverJoined,
                    coachingPlanReminder = prefs.coachingPlanReminder,
                )
                Log.d("NotificationSettingsVM", "✅ Preferences loaded")
            } catch (e: Exception) {
                Log.e("NotificationSettingsVM", "Error loading preferences: ${e.message}")
                _state.value = _state.value.copy(isLoading = false, error = "Failed to load preferences")
            }
        }
    }

    fun updatePreference(key: String, value: Boolean) {
        viewModelScope.launch {
            try {
                val userId = sessionManager.getUserId() ?: return@launch
                val currentState = _state.value
                
                // Optimistically update UI
                when (key) {
                    "friendRequest" -> _state.value = currentState.copy(friendRequest = value)
                    "friendAccepted" -> _state.value = currentState.copy(friendAccepted = value)
                    "groupRunInvite" -> _state.value = currentState.copy(groupRunInvite = value)
                    "groupRunStarting" -> _state.value = currentState.copy(groupRunStarting = value)
                    "runCompleted" -> _state.value = currentState.copy(runCompleted = value)
                    "weeklyProgress" -> _state.value = currentState.copy(weeklyProgress = value)
                    "liveRunInvite" -> _state.value = currentState.copy(liveRunInvite = value)
                    "liveObserverJoined" -> _state.value = currentState.copy(liveObserverJoined = value)
                    "coachingPlanReminder" -> _state.value = currentState.copy(coachingPlanReminder = value)
                }
                
                // Send to backend
                apiService.updateNotificationPreferences(userId, mapOf(key to value))
                Log.d("NotificationSettingsVM", "✅ Updated $key = $value")
            } catch (e: Exception) {
                Log.e("NotificationSettingsVM", "Error updating preference: ${e.message}")
                _state.value = _state.value.copy(error = "Failed to update preference")
                loadPreferences() // Reload on error
            }
        }
    }

    fun updateAllNotifications(enabled: Boolean) {
        viewModelScope.launch {
            try {
                val userId = sessionManager.getUserId() ?: return@launch
                
                val updates = mapOf(
                    "friendRequest" to enabled,
                    "friendAccepted" to enabled,
                    "groupRunInvite" to enabled,
                    "groupRunStarting" to enabled,
                    "runCompleted" to enabled,
                    "weeklyProgress" to enabled,
                    "liveRunInvite" to enabled,
                    "liveObserverJoined" to enabled,
                    "coachingPlanReminder" to enabled,
                )
                
                // Optimistically update UI
                _state.value = NotificationPreferencesState(
                    friendRequest = enabled,
                    friendAccepted = enabled,
                    groupRunInvite = enabled,
                    groupRunStarting = enabled,
                    runCompleted = enabled,
                    weeklyProgress = enabled,
                    liveRunInvite = enabled,
                    liveObserverJoined = enabled,
                    coachingPlanReminder = enabled,
                )
                
                // Send to backend
                apiService.updateNotificationPreferences(userId, updates)
                Log.d("NotificationSettingsVM", "✅ Updated all notifications to $enabled")
            } catch (e: Exception) {
                Log.e("NotificationSettingsVM", "Error updating all notifications: ${e.message}")
                _state.value = _state.value.copy(error = "Failed to update notifications")
                loadPreferences() // Reload on error
            }
        }
    }
}
