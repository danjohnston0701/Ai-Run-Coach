package live.airuncoach.airuncoach.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.RegularSession
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.GeneratePlanRequest
import live.airuncoach.airuncoach.network.model.RegularSessionRequest
import javax.inject.Inject

sealed class GeneratePlanState {
    object Idle : GeneratePlanState()
    object Generating : GeneratePlanState()
    data class Success(val planId: String) : GeneratePlanState()
    data class Error(val message: String) : GeneratePlanState()
}

@HiltViewModel
class GeneratePlanViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    // Wizard state — step 1 of 3
    private val _step = MutableStateFlow(0) // 0=configure, 1=generating, 2=done
    val step: StateFlow<Int> = _step.asStateFlow()

    // Form fields
    private val _goalType = MutableStateFlow("5k")
    val goalType: StateFlow<String> = _goalType.asStateFlow()

    private val _targetDistance = MutableStateFlow("5.0")
    val targetDistance: StateFlow<String> = _targetDistance.asStateFlow()

    // Target time entered as MM:SS
    private val _targetMinutes = MutableStateFlow("20")
    val targetMinutes: StateFlow<String> = _targetMinutes.asStateFlow()

    private val _targetSeconds = MutableStateFlow("00")
    val targetSeconds: StateFlow<String> = _targetSeconds.asStateFlow()

    private val _hasTimeGoal = MutableStateFlow(false)
    val hasTimeGoal: StateFlow<Boolean> = _hasTimeGoal.asStateFlow()

    private val _daysPerWeek = MutableStateFlow(4)
    val daysPerWeek: StateFlow<Int> = _daysPerWeek.asStateFlow()

    private val _durationWeeks = MutableStateFlow(4)
    val durationWeeks: StateFlow<Int> = _durationWeeks.asStateFlow()

    private val _experienceLevel = MutableStateFlow("intermediate")
    val experienceLevel: StateFlow<String> = _experienceLevel.asStateFlow()

    // "today" | "tomorrow" | "flexible"
    private val _firstSessionStart = MutableStateFlow("flexible")
    val firstSessionStart: StateFlow<String> = _firstSessionStart.asStateFlow()

    // Regular sessions the user does each week (e.g. Parkrun, running club)
    private val _regularSessions = MutableStateFlow<List<RegularSession>>(emptyList())
    val regularSessions: StateFlow<List<RegularSession>> = _regularSessions.asStateFlow()

    // Linked goal (optional — pre-fills the form)
    private val _linkedGoal = MutableStateFlow<Goal?>(null)
    val linkedGoal: StateFlow<Goal?> = _linkedGoal.asStateFlow()

    private val _generateState = MutableStateFlow<GeneratePlanState>(GeneratePlanState.Idle)
    val generateState: StateFlow<GeneratePlanState> = _generateState.asStateFlow()

    fun prefillFromGoal(goal: Goal) {
        _linkedGoal.value = goal
        // Map goal distance to goalType
        when (goal.distanceTarget) {
            "5K" -> { _goalType.value = "5k"; _targetDistance.value = "5.0" }
            "10K" -> { _goalType.value = "10k"; _targetDistance.value = "10.0" }
            "Half Marathon" -> { _goalType.value = "half_marathon"; _targetDistance.value = "21.1" }
            "Marathon" -> { _goalType.value = "marathon"; _targetDistance.value = "42.2" }
            "Ultra Marathon" -> { _goalType.value = "ultra"; _targetDistance.value = "50.0" }
            else -> {
                _goalType.value = "custom"
                val km = goal.distanceTarget?.replace("km", "")?.trim()?.toDoubleOrNull()
                if (km != null) _targetDistance.value = km.toString()
            }
        }
        // Pre-fill time target
        goal.timeTargetSeconds?.let { secs ->
            if (secs > 0) {
                _hasTimeGoal.value = true
                _targetMinutes.value = (secs / 60).toString()
                _targetSeconds.value = (secs % 60).toString().padStart(2, '0')
            }
        }
    }

    fun setGoalType(type: String) { _goalType.value = type }
    fun setTargetDistance(dist: String) { _targetDistance.value = dist }
    fun setTargetMinutes(m: String) { _targetMinutes.value = m }
    fun setTargetSeconds(s: String) { _targetSeconds.value = s }
    fun setHasTimeGoal(has: Boolean) { _hasTimeGoal.value = has }
    fun setDaysPerWeek(days: Int) { _daysPerWeek.value = days }
    fun setDurationWeeks(weeks: Int) { _durationWeeks.value = weeks }
    fun setExperienceLevel(level: String) { _experienceLevel.value = level }
    fun setFirstSessionStart(value: String) { _firstSessionStart.value = value }

    // ── Regular sessions ──────────────────────────────────────────────────────
    fun addRegularSession(session: RegularSession) {
        _regularSessions.value = _regularSessions.value + session
    }

    fun removeRegularSession(sessionId: String) {
        _regularSessions.value = _regularSessions.value.filter { it.id != sessionId }
    }

    fun toggleSessionCountsTowardTotal(sessionId: String) {
        _regularSessions.value = _regularSessions.value.map { s ->
            if (s.id == sessionId) s.copy(countsTowardWeeklyTotal = !s.countsTowardWeeklyTotal)
            else s
        }
    }

    fun generatePlan() {
        val distKm = _targetDistance.value.toDoubleOrNull() ?: 5.0
        val targetTimeSecs: Int? = if (_hasTimeGoal.value) {
            val mins = _targetMinutes.value.toIntOrNull() ?: 0
            val secs = _targetSeconds.value.toIntOrNull() ?: 0
            (mins * 60 + secs).takeIf { it > 0 }
        } else null

        viewModelScope.launch {
            _generateState.value = GeneratePlanState.Generating
            try {
                val request = GeneratePlanRequest(
                    goalType = _goalType.value,
                    targetDistance = distKm,
                    targetTime = targetTimeSecs,
                    targetDate = null, // Could be wired from goal.targetDate
                    experienceLevel = _experienceLevel.value,
                    daysPerWeek = _daysPerWeek.value,
                    goalId = _linkedGoal.value?.id,
                    firstSessionStart = _firstSessionStart.value,
                    regularSessions = _regularSessions.value.map { s ->
                        RegularSessionRequest(
                            name = s.name,
                            dayOfWeek = s.dayOfWeek,
                            timeHour = s.timeHour,
                            timeMinute = s.timeMinute,
                            distanceKm = s.distanceKm,
                            countsTowardWeeklyTotal = s.countsTowardWeeklyTotal
                        )
                    }
                )
                val response = apiService.generateTrainingPlan(request)
                _generateState.value = GeneratePlanState.Success(response.planId)
            } catch (e: Exception) {
                Log.e("GeneratePlanVM", "Failed to generate plan: ${e.message}", e)
                _generateState.value = GeneratePlanState.Error(e.message ?: "Failed to generate plan")
            }
        }
    }

    fun resetState() {
        _generateState.value = GeneratePlanState.Idle
    }
}
