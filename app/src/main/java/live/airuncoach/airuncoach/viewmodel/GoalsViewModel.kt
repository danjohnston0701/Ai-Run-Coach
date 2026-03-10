
package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.RetrofitClient
import live.airuncoach.airuncoach.network.model.CreateGoalRequest
import live.airuncoach.airuncoach.network.model.UpdateGoalRequest

sealed class GoalsUiState {
    object Loading : GoalsUiState()
    data class Success(val goals: List<Goal>) : GoalsUiState()
    data class Error(val message: String) : GoalsUiState()
}

sealed class CreateGoalState {
    object Idle : CreateGoalState()
    object Loading : CreateGoalState()
    object Success : CreateGoalState()
    data class Error(val message: String) : CreateGoalState()
}

class GoalsViewModel(private val context: Context) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    
    private val sessionManager = SessionManager(context)
    private val apiService = RetrofitClient(context, sessionManager).instance

    private val _allGoals = MutableStateFlow<List<Goal>>(emptyList())
    private val _selectedTab = MutableStateFlow(0) // 0: Active, 1: Completed, 2: Abandoned

    private val _goalsState = MutableStateFlow<GoalsUiState>(GoalsUiState.Loading)
    val goalsState: StateFlow<GoalsUiState> = _goalsState.asStateFlow()

    val selectedTab: StateFlow<Int> = _selectedTab.asStateFlow()

    // Track if initial load has completed to avoid redundant API calls
    private var hasLoadedGoals = false

    private val _createGoalState = MutableStateFlow<CreateGoalState>(CreateGoalState.Idle)
    val createGoalState: StateFlow<CreateGoalState> = _createGoalState.asStateFlow()

    private val _user = MutableStateFlow<User?>(null)

    init {
        loadUser()
        viewModelScope.launch {
            combine(_allGoals, _selectedTab) { goals, tab ->
                val filteredGoals = when (tab) {
                    0 -> goals.filter { it.isActive && !it.isCompleted }
                    1 -> goals.filter { it.isCompleted }
                    else -> goals.filter { !it.isActive && !it.isCompleted } // Abandoned
                }
                _goalsState.value = GoalsUiState.Success(filteredGoals)
            }.collect {}
        }
    }

    private fun loadUser() {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson != null) {
            _user.value = gson.fromJson(userJson, User::class.java)
            loadGoals()
        }
    }

    fun loadGoals(forceRefresh: Boolean = false) {
        viewModelScope.launch {
            // Skip API call if already loaded and not forcing refresh
            if (hasLoadedGoals && !forceRefresh && _allGoals.value.isNotEmpty()) {
                android.util.Log.d("GoalsViewModel", "📱 Goals already loaded, skipping API call")
                return@launch
            }
            
            try {
                _goalsState.value = GoalsUiState.Loading
                val userId = _user.value?.id
                if (userId != null) {
                    android.util.Log.d("GoalsViewModel", "📡 Fetching goals for user: $userId")
                    val goals = apiService.getGoals(userId)
                    _allGoals.value = goals
                    hasLoadedGoals = true
                    android.util.Log.d("GoalsViewModel", "✅ Successfully loaded ${goals.size} goals")
                } else {
                    _goalsState.value = GoalsUiState.Error("User not logged in")
                }
            } catch (e: retrofit2.HttpException) {
                val errorBody = try {
                    e.response()?.errorBody()?.string() ?: "No error body"
                } catch (ex: Exception) {
                    "Could not read error body"
                }
                android.util.Log.e("GoalsViewModel", "❌ HTTP ${e.code()} error loading goals: $errorBody", e)
                
                val userMessage = when (e.code()) {
                    404 -> "🔧 Goals feature not available. The backend needs to be updated. Please contact support."
                    401, 403 -> "Authentication expired. Please log in again."
                    500 -> "Server error. Please try again later."
                    else -> "Failed to load goals (HTTP ${e.code()}). Please check your connection."
                }
                _goalsState.value = GoalsUiState.Error(userMessage)
            } catch (e: java.net.UnknownHostException) {
                android.util.Log.e("GoalsViewModel", "❌ Network error: Cannot reach server", e)
                _goalsState.value = GoalsUiState.Error("Cannot reach server. Please check your internet connection.")
            } catch (e: Exception) {
                _goalsState.value = GoalsUiState.Error(e.message ?: "Failed to load goals")
                android.util.Log.e("GoalsViewModel", "❌ Failed to load goals: ${e.javaClass.simpleName} - ${e.message}", e)
            }
        }
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
    }

    fun createGoal(
        type: String,
        title: String,
        description: String?,
        notes: String?,
        targetDate: String?,
        eventName: String?,
        eventLocation: String?,
        distanceTarget: String?,
        timeTargetSeconds: Int?,
        healthTarget: String?,
        weeklyRunTarget: Int?,
        targetWeightKg: Double? = null,
        startingWeightKg: Double? = null
    ) {
        viewModelScope.launch {
            try {
                _createGoalState.value = CreateGoalState.Loading

                val userId = _user.value?.id
                if (userId == null) {
                    _createGoalState.value = CreateGoalState.Error("User not logged in")
                    return@launch
                }

                val request = CreateGoalRequest(
                    userId = userId,
                    type = type,
                    title = title,
                    description = description,
                    notes = notes,
                    targetDate = targetDate,
                    eventName = eventName,
                    eventLocation = eventLocation,
                    distanceTarget = distanceTarget,
                    timeTargetSeconds = timeTargetSeconds,
                    healthTarget = healthTarget,
                    weeklyRunTarget = weeklyRunTarget,
                    targetWeightKg = targetWeightKg,
                    startingWeightKg = startingWeightKg
                )

                val createdGoal = apiService.createGoal(request)
                _createGoalState.value = CreateGoalState.Success
                
                // Reset cache to ensure fresh data on next load
                hasLoadedGoals = false
                // Reload goals to update the list
                loadGoals(forceRefresh = true)
            } catch (e: Exception) {
                _createGoalState.value = CreateGoalState.Error(e.message ?: "Failed to create goal")
                android.util.Log.e("GoalsViewModel", "Failed to create goal: ${e.message}", e)
            }
        }
    }

    fun deleteGoal(goalId: String) {
        viewModelScope.launch {
            try {
                apiService.deleteGoal(goalId)
                // Reset cache and reload goals after deletion
                hasLoadedGoals = false
                loadGoals(forceRefresh = true)
            } catch (e: Exception) {
                android.util.Log.e("GoalsViewModel", "Failed to delete goal: ${e.message}", e)
            }
        }
    }

    fun editGoal(
        goalId: String,
        title: String,
        description: String?,
        notes: String?,
        targetDate: String?,
        eventName: String?,
        eventLocation: String?,
        distanceTarget: String?,
        timeTargetSeconds: Int?,
        healthTarget: String?,
        weeklyRunTarget: Int?
    ) {
        viewModelScope.launch {
            try {
                _createGoalState.value = CreateGoalState.Loading
                
                val request = UpdateGoalRequest(
                    title = title,
                    description = description,
                    notes = notes,
                    targetDate = targetDate,
                    eventName = eventName,
                    eventLocation = eventLocation,
                    distanceTarget = distanceTarget,
                    timeTargetSeconds = timeTargetSeconds,
                    healthTarget = healthTarget,
                    weeklyRunTarget = weeklyRunTarget
                )

                apiService.updateGoal(goalId, request)
                _createGoalState.value = CreateGoalState.Success
                
                // Reset cache to ensure fresh data on next load
                hasLoadedGoals = false
                // Reload goals to update the list
                loadGoals(forceRefresh = true)
            } catch (e: Exception) {
                _createGoalState.value = CreateGoalState.Error(e.message ?: "Failed to update goal")
                android.util.Log.e("GoalsViewModel", "Failed to update goal: ${e.message}", e)
            }
        }
    }

    /**
     * Mark a goal as complete and link it to a run session
     * @param goalId The goal to complete
     * @param runSessionId The run session to link to the goal
     * @param keepActive If true, keeps the goal active but links the run session
     */
    fun completeGoal(goalId: String, runSessionId: String, keepActive: Boolean = false) {
        viewModelScope.launch {
            try {
                val currentGoal = _allGoals.value.find { it.id == goalId }
                if (currentGoal == null) {
                    android.util.Log.e("GoalsViewModel", "Goal not found: $goalId")
                    return@launch
                }

                // Safely handle relatedRunSessionIds - handle null case
                val currentSessions: List<String> = currentGoal.relatedRunSessionIds?.toList() ?: emptyList()
                val updatedRelatedSessions: List<String> = if (!runSessionId.isNullOrEmpty()) {
                    currentSessions + runSessionId
                } else {
                    currentSessions
                }

                val completedAt = if (!keepActive) {
                    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.getDefault())
                    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                    sdf.format(java.util.Date())
                } else null

                val request = UpdateGoalRequest(
                    title = currentGoal.title,
                    description = currentGoal.description,
                    notes = currentGoal.notes,
                    targetDate = currentGoal.targetDate,
                    eventName = currentGoal.eventName,
                    eventLocation = currentGoal.eventLocation,
                    distanceTarget = currentGoal.distanceTarget,
                    timeTargetSeconds = currentGoal.timeTargetSeconds,
                    healthTarget = currentGoal.healthTarget,
                    weeklyRunTarget = currentGoal.weeklyRunTarget,
                    isActive = keepActive,
                    isCompleted = !keepActive,
                    currentProgress = if (!keepActive) 100f else currentGoal.currentProgress,
                    completedAt = completedAt,
                    relatedRunSessionIds = updatedRelatedSessions
                )

                // Make the API call and wait for response to ensure it succeeded
                val response = apiService.updateGoal(goalId, request)
                android.util.Log.d("GoalsViewModel", "Goal update response: $response")
                
                // Reload goals to get updated status
                hasLoadedGoals = false
                loadGoals(forceRefresh = true)
                android.util.Log.d("GoalsViewModel", "Goal $goalId completed, linked to run $runSessionId")
            } catch (e: Exception) {
                android.util.Log.e("GoalsViewModel", "Failed to complete goal: ${e.message}", e)
            }
        }
    }

    /**
     * Link a run session to a goal without completing it
     */
    fun linkRunSessionToGoal(goalId: String, runSessionId: String) {
        viewModelScope.launch {
            try {
                val currentGoal = _allGoals.value.find { it.id == goalId }
                if (currentGoal == null) {
                    android.util.Log.e("GoalsViewModel", "Goal not found: $goalId")
                    return@launch
                }

                // Safely handle relatedRunSessionIds - handle null case
                val currentSessions: List<String> = currentGoal.relatedRunSessionIds?.toList() ?: emptyList()
                val updatedRelatedSessions: List<String> = if (!runSessionId.isNullOrEmpty()) {
                    currentSessions + runSessionId
                } else {
                    currentSessions
                }

                val request = UpdateGoalRequest(
                    title = currentGoal.title,
                    description = currentGoal.description,
                    notes = currentGoal.notes,
                    targetDate = currentGoal.targetDate,
                    eventName = currentGoal.eventName,
                    eventLocation = currentGoal.eventLocation,
                    distanceTarget = currentGoal.distanceTarget,
                    timeTargetSeconds = currentGoal.timeTargetSeconds,
                    healthTarget = currentGoal.healthTarget,
                    weeklyRunTarget = currentGoal.weeklyRunTarget,
                    relatedRunSessionIds = updatedRelatedSessions
                )

                // Make the API call and wait for response
                val response = apiService.updateGoal(goalId, request)
                android.util.Log.d("GoalsViewModel", "Goal link update response: $response")
                
                // Reload goals to get updated status
                hasLoadedGoals = false
                loadGoals(forceRefresh = true)
                android.util.Log.d("GoalsViewModel", "Linked run $runSessionId to goal $goalId")
            } catch (e: Exception) {
                android.util.Log.e("GoalsViewModel", "Failed to link run to goal: ${e.message}", e)
            }
        }
    }

    /**
     * Check if any active goals are met by the given run session.
     * Only goals with a distance target are checked — the run distance must
     * meet the goal criteria (≥ 90 % of target).  Goals without a distance
     * target (e.g. health / consistency / date-only events) are never
     * auto-celebrated because there is no objective run-level criterion to
     * evaluate.
     */
    fun checkGoalsMetByRun(runDistanceMeters: Double, runDate: Long): List<Goal> {
        val activeGoals = _allGoals.value.filter { it.isActive && !it.isCompleted }

        return activeGoals.filter { goal ->
            // Only celebrate goals that have a concrete distance target
            goal.getDistanceTargetInMeters() ?: return@filter false

            // Check if run distance meets the goal criteria
            goal.isGoalMetByRun(runDistanceMeters)
        }
    }

    /**
     * Get formatted distance string for display
     */
    fun getFormattedDistance(meters: Double): String {
        return if (meters >= 1000) {
            String.format("%.2f km", meters / 1000)
        } else {
            String.format("%.0f m", meters)
        }
    }

    fun resetCreateGoalState() {
        _createGoalState.value = CreateGoalState.Idle
    }
}

class GoalsViewModelFactory(
    private val context: Context
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(GoalsViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return GoalsViewModel(context) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
