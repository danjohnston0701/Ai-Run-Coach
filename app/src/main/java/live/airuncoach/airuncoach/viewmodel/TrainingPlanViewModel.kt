package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.CompleteWorkoutRequest
import live.airuncoach.airuncoach.network.model.TrainingPlanDetails
import live.airuncoach.airuncoach.network.model.TrainingPlanProgress
import live.airuncoach.airuncoach.network.model.TrainingPlanSummary
import live.airuncoach.airuncoach.network.model.TodayWorkoutResponse
import live.airuncoach.airuncoach.network.model.WeekProgress
import retrofit2.HttpException
import javax.inject.Inject

sealed class PlansListState {
    object Loading : PlansListState()
    data class Success(val plans: List<TrainingPlanSummary>) : PlansListState()
    data class Error(val message: String) : PlansListState()
    object Empty : PlansListState()
}

sealed class PlanDetailState {
    object Loading : PlanDetailState()
    data class Success(
        val details: TrainingPlanDetails,
        val progress: TrainingPlanProgress,
        val todayWorkout: TodayWorkoutResponse?
    ) : PlanDetailState()
    data class Error(val message: String) : PlanDetailState()
}

@HiltViewModel
class TrainingPlanViewModel @Inject constructor(
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _plansListState = MutableStateFlow<PlansListState>(PlansListState.Loading)
    val plansListState: StateFlow<PlansListState> = _plansListState.asStateFlow()

    private val _planDetailState = MutableStateFlow<PlanDetailState>(PlanDetailState.Loading)
    val planDetailState: StateFlow<PlanDetailState> = _planDetailState.asStateFlow()

    private val _actionLoading = MutableStateFlow(false)
    val actionLoading: StateFlow<Boolean> = _actionLoading.asStateFlow()

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    // Emits true when a delete/abandon completes successfully — the screen observes
    // this to trigger onNavigateBack() only after the list has been refreshed.
    private val _planActionSuccess = MutableStateFlow(false)
    val planActionSuccess: StateFlow<Boolean> = _planActionSuccess.asStateFlow()

    fun clearPlanActionSuccess() { _planActionSuccess.value = false }

    // Tab selection: 0=Active, 1=Completed, 2=Abandoned
    // Tab selection: 0=Active, 1=Completed, 2=Abandoned
    private val _selectedTab = MutableStateFlow(0)
    val selectedTab: StateFlow<Int> = _selectedTab.asStateFlow()

    // Pending adaptations count for current plan
    private val _pendingAdaptationsCount = MutableStateFlow(0)
    val pendingAdaptationsCount: StateFlow<Int> = _pendingAdaptationsCount.asStateFlow()

    init {
        loadUserPlans("active")
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
        val statusMap = mapOf(0 to "active", 1 to "completed", 2 to "abandoned")
        loadUserPlans(statusMap[index] ?: "active")
    }

    fun loadUserPlans(status: String = "active") {
        viewModelScope.launch {
            _plansListState.value = PlansListState.Loading
            try {
                val userId = sessionManager.getUserId() ?: return@launch
                val plans = apiService.getUserTrainingPlans(userId, status)
                _plansListState.value = if (plans.isEmpty()) PlansListState.Empty
                else PlansListState.Success(plans)
            } catch (e: HttpException) {
                _plansListState.value = PlansListState.Error("Failed to load plans (${e.code()})")
            } catch (e: Exception) {
                Log.e("TrainingPlanVM", "Error loading plans: ${e.message}", e)
                _plansListState.value = PlansListState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun loadPendingAdaptationsCount(planId: String) {
        viewModelScope.launch {
            try {
                val response = apiService.getPendingAdaptations(planId)
                _pendingAdaptationsCount.value = response.adaptations.size
            } catch (e: Exception) {
                Log.w("TrainingPlanVM", "Failed to load pending adaptations count: ${e.message}")
                _pendingAdaptationsCount.value = 0
            }
        }
    }

    fun loadPlanDetail(planId: String) {
        viewModelScope.launch {
            Log.d("TrainingPlanVM", "📋 Loading plan detail for planId=$planId...")
            _planDetailState.value = PlanDetailState.Loading
            try {
                // Wrap each async block in its own try-catch to prevent structured
                // concurrency from propagating the exception past the outer try-catch.
                val detailsDeferred = async {
                    Log.d("TrainingPlanVM", "📋 Fetching plan details...")
                    try {
                        apiService.getTrainingPlanDetails(planId)
                    } catch (e: Exception) {
                        Log.e("TrainingPlanVM", "Details fetch failed: ${e.message}")
                        throw e  // rethrow so await() delivers it to the outer catch
                    }
                }
                val progressDeferred = async {
                    // Give progress a 10s window — it can be slow on new plans.
                    // If it times out or errors we synthesize it from the details.
                    Log.d("TrainingPlanVM", "📊 Fetching plan progress...")
                    withTimeoutOrNull(10_000L) {
                        try {
                            val prog = apiService.getTrainingPlanProgress(planId)
                            Log.d("TrainingPlanVM", "📊 Progress fetched: ${prog.currentWeek}/${prog.totalWeeks} weeks")
                            prog
                        } catch (e: Exception) {
                            Log.w("TrainingPlanVM", "Progress fetch failed (${e.message}), will synthesize")
                            null
                        }
                    }
                }

                // Await details first — if this throws, cancel progress too
                val details = try {
                    detailsDeferred.await()
                } catch (e: Exception) {
                    progressDeferred.cancel()
                    Log.e("TrainingPlanVM", "Error loading plan detail: ${e.message}", e)
                    _planDetailState.value = PlanDetailState.Error("Unable to load plan. Please try again.")
                    return@launch
                }

                Log.d("TrainingPlanVM", "✅ Details loaded: ${details.weeks.size} weeks, ${details.weeks.sumOf { it.workouts.size }} workouts")
                val progress = progressDeferred.await() ?: synthesizeProgress(details)
                Log.d("TrainingPlanVM", "✅ Progress: ${progress.completedWorkouts}/${progress.totalWorkouts} workouts done")
                val userTimezone = java.util.TimeZone.getDefault().id
                val today = try { apiService.getTodayWorkout(planId, userTimezone) } catch (_: Exception) { null }
                Log.d("TrainingPlanVM", "✅ Today workout: ${today?.workout?.description ?: "None"}")
                _planDetailState.value = PlanDetailState.Success(details, progress, today)
                Log.d("TrainingPlanVM", "✅ Plan detail state updated")
                
                // Load pending adaptations count
                loadPendingAdaptationsCount(planId)
            } catch (e: Exception) {
                Log.e("TrainingPlanVM", "Unexpected error loading plan detail: ${e.message}", e)
                _planDetailState.value = PlanDetailState.Error("Something went wrong. Please try again.")
            }
        }
    }

    /**
     * Builds a [TrainingPlanProgress] directly from the plan details when the
     * /progress endpoint is unavailable or too slow. Counts completed workouts
     * by reading the isCompleted flag already present in the details response.
     */
    private fun synthesizeProgress(details: TrainingPlanDetails): TrainingPlanProgress {
        val totalWorkouts = details.weeks.sumOf { it.workouts.size }
        val completedWorkouts = details.weeks.sumOf { week -> week.workouts.count { it.isCompleted } }
        return TrainingPlanProgress(
            planId = details.plan.id,
            currentWeek = details.plan.currentWeek,
            totalWeeks = details.plan.totalWeeks,
            goalType = details.plan.goalType,
            targetDistance = details.plan.targetDistance,
            targetTime = details.plan.targetTime,
            status = details.plan.status,
            completedWorkouts = completedWorkouts,
            totalWorkouts = totalWorkouts,
            overallCompletion = if (totalWorkouts > 0) completedWorkouts.toDouble() / totalWorkouts else 0.0,
            weeks = details.weeks.map { week ->
                val weekCompleted = week.workouts.count { it.isCompleted }
                WeekProgress(
                    weekNumber = week.weekNumber,
                    weekDescription = week.weekDescription,
                    totalDistance = week.totalDistance,
                    focusArea = week.focusArea,
                    intensityLevel = week.intensityLevel,
                    totalWorkouts = week.workouts.size,
                    completedWorkouts = weekCompleted,
                    completionRate = if (week.workouts.isNotEmpty()) weekCompleted.toDouble() / week.workouts.size else 0.0
                )
            }
        )
    }

    fun completeWorkout(workoutId: String, runId: String? = null, planId: String) {
        viewModelScope.launch {
            _actionLoading.value = true
            try {
                Log.d("TrainingPlanVM", "Marking workout $workoutId as complete...")
                val response = apiService.completeWorkout(workoutId, CompleteWorkoutRequest(runId))
                
                if (!response.isSuccessful) {
                    Log.e("TrainingPlanVM", "❌ Completion failed: ${response.code()} ${response.message()}")
                    val errorBody = response.errorBody()?.string()
                    Log.e("TrainingPlanVM", "Error body: $errorBody")
                    _actionError.value = "Failed to complete: HTTP ${response.code()}"
                    return@launch
                }
                
                val body = response.body()
                Log.d("TrainingPlanVM", "✅ Workout marked complete — isCompleted=${body?.isCompleted}, progress=${body?.planProgress?.completedWorkouts}/${body?.planProgress?.totalWorkouts}")
                // Reload plan detail to reflect updated state
                Log.d("TrainingPlanVM", "✅ Reloading plan details for planId=$planId...")
                loadPlanDetail(planId)
            } catch (e: Exception) {
                Log.e("TrainingPlanVM", "Error completing workout: ${e.message}", e)
                _actionError.value = "Could not mark workout complete: ${e.message}"
            } finally {
                _actionLoading.value = false
            }
        }
    }

    fun skipWorkout(workoutId: String, planId: String) {
        viewModelScope.launch {
            _actionLoading.value = true
            try {
                apiService.skipWorkout(workoutId)
                loadPlanDetail(planId)
            } catch (e: Exception) {
                _actionError.value = "Could not skip workout: ${e.message}"
            } finally {
                _actionLoading.value = false
            }
        }
    }

    fun pausePlan(planId: String) {
        viewModelScope.launch {
            try {
                apiService.updatePlanStatus(planId, mapOf("status" to "paused"))
                loadUserPlans()
            } catch (e: Exception) {
                _actionError.value = "Failed to pause plan: ${e.message}"
            }
        }
    }

    fun abandonPlan(planId: String) {
        viewModelScope.launch {
            _actionLoading.value = true
            try {
                apiService.updatePlanStatus(planId, mapOf("status" to "abandoned"))
                // Reload the active-plans list so the caller navigates back to a fresh list
                loadUserPlansSync("active")
                _planActionSuccess.value = true
            } catch (e: Exception) {
                _actionError.value = "Failed to abandon plan: ${e.message}"
            } finally {
                _actionLoading.value = false
            }
        }
    }

    fun deletePlan(planId: String) {
        viewModelScope.launch {
            _actionLoading.value = true
            try {
                apiService.deleteTrainingPlan(planId)
                // Reload the active-plans list so the caller navigates back to a fresh list
                loadUserPlansSync("active")
                _planActionSuccess.value = true
            } catch (e: Exception) {
                _actionError.value = "Failed to delete plan: ${e.message}"
            } finally {
                _actionLoading.value = false
            }
        }
    }

    /** Loads plans and suspends until the result is stored — used internally so callers
     *  can `await` the refresh before signalling success. */
    private suspend fun loadUserPlansSync(status: String) {
        try {
            val userId = sessionManager.getUserId() ?: return
            val plans = apiService.getUserTrainingPlans(userId, status)
            _plansListState.value = if (plans.isEmpty()) PlansListState.Empty
                                    else PlansListState.Success(plans)
        } catch (e: Exception) {
            Log.e("TrainingPlanVM", "Error reloading plans: ${e.message}", e)
        }
    }

    fun clearActionError() { _actionError.value = null }
}
