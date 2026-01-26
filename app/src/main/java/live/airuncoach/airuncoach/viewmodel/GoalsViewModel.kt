
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

    fun loadGoals() {
        viewModelScope.launch {
            try {
                _goalsState.value = GoalsUiState.Loading
                val userId = _user.value?.id
                if (userId != null) {
                    val goals = apiService.getGoals(userId)
                    _allGoals.value = goals
                } else {
                    _goalsState.value = GoalsUiState.Error("User not logged in")
                }
            } catch (e: Exception) {
                _goalsState.value = GoalsUiState.Error(e.message ?: "Failed to load goals")
                android.util.Log.e("GoalsViewModel", "Failed to load goals: ${e.message}", e)
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
        weeklyRunTarget: Int?
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
                    weeklyRunTarget = weeklyRunTarget
                )

                val createdGoal = apiService.createGoal(request)
                _createGoalState.value = CreateGoalState.Success
                
                // Reload goals to update the list
                loadGoals()
            } catch (e: Exception) {
                _createGoalState.value = CreateGoalState.Error(e.message ?: "Failed to create goal")
                android.util.Log.e("GoalsViewModel", "Failed to create goal: ${e.message}", e)
            }
        }
    }

    fun deleteGoal(goalId: Long) {
        viewModelScope.launch {
            try {
                apiService.deleteGoal(goalId)
                loadGoals() // Reload goals after deletion
            } catch (e: Exception) {
                android.util.Log.e("GoalsViewModel", "Failed to delete goal: ${e.message}", e)
            }
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
