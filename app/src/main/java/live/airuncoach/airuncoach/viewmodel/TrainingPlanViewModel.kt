package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.data.SessionManager
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.CompleteWorkoutRequest
import live.airuncoach.airuncoach.network.model.TrainingPlanDetails
import live.airuncoach.airuncoach.network.model.TrainingPlanProgress
import live.airuncoach.airuncoach.network.model.TrainingPlanSummary
import live.airuncoach.airuncoach.network.model.TodayWorkoutResponse
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

    fun loadPlanDetail(planId: String) {
        viewModelScope.launch {
            _planDetailState.value = PlanDetailState.Loading
            try {
                val details = apiService.getTrainingPlanDetails(planId)
                val progress = apiService.getTrainingPlanProgress(planId)
                val today = try { apiService.getTodayWorkout(planId) } catch (_: Exception) { null }
                _planDetailState.value = PlanDetailState.Success(details, progress, today)
            } catch (e: Exception) {
                Log.e("TrainingPlanVM", "Error loading plan detail: ${e.message}", e)
                _planDetailState.value = PlanDetailState.Error(e.message ?: "Failed to load plan")
            }
        }
    }

    fun completeWorkout(workoutId: String, runId: String? = null, planId: String) {
        viewModelScope.launch {
            _actionLoading.value = true
            try {
                apiService.completeWorkout(workoutId, CompleteWorkoutRequest(runId))
                // Reload plan detail to reflect updated state
                loadPlanDetail(planId)
            } catch (e: Exception) {
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

    fun clearActionError() { _actionError.value = null }
}
