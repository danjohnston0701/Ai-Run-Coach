package live.airuncoach.airuncoach.viewmodel

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import live.airuncoach.airuncoach.domain.model.Goal
import live.airuncoach.airuncoach.domain.model.RegularSession
import live.airuncoach.airuncoach.domain.model.User
import live.airuncoach.airuncoach.network.ApiService
import live.airuncoach.airuncoach.network.model.GeneratePlanRequest
import live.airuncoach.airuncoach.network.model.RegularSessionRequest
import live.airuncoach.airuncoach.network.model.UpdateUserRequest
import javax.inject.Inject

sealed class GeneratePlanState {
    object Idle : GeneratePlanState()
    object Generating : GeneratePlanState()
    data class Success(val planId: String) : GeneratePlanState()
    data class Error(val message: String) : GeneratePlanState()
}

/** Canonical fitness levels — matches the user profile exactly */
val FITNESS_LEVELS = listOf(
    "Newcomer",
    "Beginner",
    "Casual",
    "Regular",
    "Committed",
    "Competitive",
    "Advanced",
    "Elite",
    "Professional"
)

val FITNESS_LEVEL_DESCRIPTIONS = mapOf(
    "Newcomer"     to "Just getting started with running — every step counts",
    "Beginner"     to "Building a running habit, can run 1–3 km comfortably",
    "Casual"       to "Running a few times a month for fun and fitness",
    "Regular"      to "Running 2–3 times a week, comfortable at 5–10 km",
    "Committed"    to "Consistent training schedule, running 10–20 km per week",
    "Competitive"  to "Racing regularly, training with structure and goals",
    "Advanced"     to "High-mileage runner, comfortable at half marathon+",
    "Elite"        to "Sub-elite performance, racing at a high level",
    "Professional" to "Competing or coaching at a professional level"
)

@HiltViewModel
class GeneratePlanViewModel @Inject constructor(
    private val apiService: ApiService,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val sharedPrefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    // Wizard state
    private val _step = MutableStateFlow(0)
    val step: StateFlow<Int> = _step.asStateFlow()

    // Form fields
    private val _goalType = MutableStateFlow("5k")
    val goalType: StateFlow<String> = _goalType.asStateFlow()

    private val _targetDistance = MutableStateFlow("5.0")
    val targetDistance: StateFlow<String> = _targetDistance.asStateFlow()

    // Target time entered as HH:MM:SS — all default to "00"
    private val _targetHours = MutableStateFlow("00")
    val targetHours: StateFlow<String> = _targetHours.asStateFlow()

    private val _targetMinutes = MutableStateFlow("00")
    val targetMinutes: StateFlow<String> = _targetMinutes.asStateFlow()

    private val _targetSeconds = MutableStateFlow("00")
    val targetSeconds: StateFlow<String> = _targetSeconds.asStateFlow()

    private val _hasTimeGoal = MutableStateFlow(false)
    val hasTimeGoal: StateFlow<Boolean> = _hasTimeGoal.asStateFlow()

    private val _daysPerWeek = MutableStateFlow(4)
    val daysPerWeek: StateFlow<Int> = _daysPerWeek.asStateFlow()

    private val _durationWeeks = MutableStateFlow(4)
    val durationWeeks: StateFlow<Int> = _durationWeeks.asStateFlow()

    // Loaded from the user's profile on init
    private val _experienceLevel = MutableStateFlow("Regular")
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

    init {
        loadFitnessLevelFromProfile()
    }

    /**
     * Reads the user's profile fitness level from SharedPreferences and pre-selects it.
     * Falls back to "Regular" if not set.
     */
    private fun loadFitnessLevelFromProfile() {
        val userJson = sharedPrefs.getString("user", null) ?: return
        try {
            val user = gson.fromJson(userJson, User::class.java)
            val profileLevel = user.fitnessLevel
            if (!profileLevel.isNullOrBlank()) {
                // Normalise: the profile stores title-case ("Regular"), the plan uses same values
                _experienceLevel.value = profileLevel
            }
        } catch (e: Exception) {
            Log.w("GeneratePlanVM", "Could not read profile fitness level", e)
        }
    }

    fun prefillFromGoal(goal: Goal) {
        _linkedGoal.value = goal
        when (goal.distanceTarget) {
            "5K"           -> { _goalType.value = "5k";            _targetDistance.value = "5.0"  }
            "10K"          -> { _goalType.value = "10k";           _targetDistance.value = "10.0" }
            "Half Marathon"-> { _goalType.value = "half_marathon"; _targetDistance.value = "21.1" }
            "Marathon"     -> { _goalType.value = "marathon";      _targetDistance.value = "42.2" }
            "Ultra Marathon"->{ _goalType.value = "ultra";         _targetDistance.value = "50.0" }
            else -> {
                _goalType.value = "custom"
                val km = goal.distanceTarget?.replace("km", "")?.trim()?.toDoubleOrNull()
                if (km != null) _targetDistance.value = km.toString()
            }
        }
        goal.timeTargetSeconds?.let { secs ->
            if (secs > 0) {
                _hasTimeGoal.value = true
                _targetHours.value   = (secs / 3600).toString().padStart(2, '0')
                _targetMinutes.value = ((secs % 3600) / 60).toString().padStart(2, '0')
                _targetSeconds.value = (secs % 60).toString().padStart(2, '0')
            }
        }
    }

    fun setGoalType(type: String) { _goalType.value = type }
    fun setTargetDistance(dist: String) { _targetDistance.value = dist }
    fun setTargetHours(h: String) { _targetHours.value = h }
    fun setTargetMinutes(m: String) { _targetMinutes.value = m }
    fun setTargetSeconds(s: String) { _targetSeconds.value = s }
    fun setHasTimeGoal(has: Boolean) { _hasTimeGoal.value = has }
    fun setDaysPerWeek(days: Int) { _daysPerWeek.value = days }
    fun setDurationWeeks(weeks: Int) { _durationWeeks.value = weeks }
    fun setFirstSessionStart(value: String) { _firstSessionStart.value = value }

    /**
     * Sets the experience level locally and immediately saves it back to the user profile in Neon.
     */
    fun setExperienceLevel(level: String) {
        _experienceLevel.value = level
        saveExperienceLevelToProfile(level)
    }

    private fun saveExperienceLevelToProfile(level: String) {
        viewModelScope.launch {
            try {
                val userJson = sharedPrefs.getString("user", null) ?: return@launch
                val user = gson.fromJson(userJson, User::class.java)
                val request = UpdateUserRequest(
                    name = null,
                    email = null,
                    dob = null,
                    gender = null,
                    weight = null,
                    height = null,
                    fitnessLevel = level,
                    distanceScale = null
                )
                val updatedUser = apiService.updateUser(user.id, request)
                // Keep SharedPreferences in sync
                sharedPrefs.edit().putString("user", gson.toJson(updatedUser)).apply()
            } catch (e: Exception) {
                Log.e("GeneratePlanVM", "Failed to save fitness level to profile", e)
            }
        }
    }

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
            val hours = _targetHours.value.toIntOrNull() ?: 0
            val mins  = _targetMinutes.value.toIntOrNull() ?: 0
            val secs  = _targetSeconds.value.toIntOrNull() ?: 0
            (hours * 3600 + mins * 60 + secs).takeIf { it > 0 }
        } else null

        viewModelScope.launch {
            _generateState.value = GeneratePlanState.Generating
            try {
                // Get user demographics for AI to use in plan calculation
                val demographics = getUserDemographics()
                
                val request = GeneratePlanRequest(
                    goalType = _goalType.value,
                    targetDistance = distKm,
                    targetTime = targetTimeSecs,
                    targetDate = null,
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
                    },
                    // User demographics for AI to calculate BMI, fitness level, health metrics
                    age = demographics.age,
                    gender = demographics.gender,
                    height = demographics.height,
                    weight = demographics.weight
                )
                val response = apiService.generateTrainingPlan(request)
                _generateState.value = GeneratePlanState.Success(response.planId)
            } catch (e: Exception) {
                Log.e("GeneratePlanVM", "Failed to generate plan: ${e.message}", e)
                _generateState.value = GeneratePlanState.Error(e.message ?: "Failed to generate plan")
            }
        }
    }

    /**
     * Get user demographics from SharedPreferences for AI to use in plan calculation.
     * Returns age, gender, height (cm), and weight (kg) for BMI and fitness calculations.
     */
    private fun getUserDemographics(): UserDemographics {
        val userJson = sharedPrefs.getString("user", null)
        if (userJson == null) {
            return UserDemographics(null, null, null, null)
        }
        return try {
            val user = gson.fromJson(userJson, User::class.java)
            UserDemographics(user.age, user.gender, user.height, user.weight)
        } catch (e: Exception) {
            Log.w("GeneratePlanVM", "Could not read user demographics", e)
            UserDemographics(null, null, null, null)
        }
    }

    /** Simple data class to hold user demographics */
    private data class UserDemographics(
        val age: Int?,
        val gender: String?,
        val height: Double?,  // cm
        val weight: Double?   // kg
    )

    fun resetState() {
        _generateState.value = GeneratePlanState.Idle
    }
}
