package live.airuncoach.airuncoach.network.model

import com.google.gson.annotations.SerializedName

/**
 * A regular run the user attends each week that the AI should factor into the plan
 * (e.g. Parkrun every Saturday, running club on Tuesday evenings).
 */
data class RegularSessionRequest(
    @SerializedName("name") val name: String,
    @SerializedName("dayOfWeek") val dayOfWeek: Int,               // 0=Sun … 6=Sat
    @SerializedName("timeHour") val timeHour: Int,
    @SerializedName("timeMinute") val timeMinute: Int,
    @SerializedName("distanceKm") val distanceKm: Double,
    @SerializedName("countsTowardWeeklyTotal") val countsTowardWeeklyTotal: Boolean
)

/** POST /api/training-plans/generate */
data class GeneratePlanRequest(
    @SerializedName("goalType") val goalType: String,       // "5k","10k","half_marathon","marathon","custom"
    @SerializedName("targetDistance") val targetDistance: Double, // km
    @SerializedName("targetTime") val targetTime: Int?,     // seconds
    @SerializedName("targetDate") val targetDate: String?,  // ISO
    @SerializedName("experienceLevel") val experienceLevel: String, // beginner/intermediate/advanced
    @SerializedName("daysPerWeek") val daysPerWeek: Int = 4,
    @SerializedName("goalId") val goalId: String? = null,   // optionally link to a Goal
    @SerializedName("firstSessionStart") val firstSessionStart: String = "flexible", // "today" | "tomorrow" | "flexible"
    @SerializedName("regularSessions") val regularSessions: List<RegularSessionRequest> = emptyList()
)

/** Response from generate */
data class GeneratePlanResponse(
    @SerializedName("planId") val planId: String,
    @SerializedName("message") val message: String? = null
)

/** Flat plan row returned from GET /api/training-plans/:userId */
data class TrainingPlanSummary(
    @SerializedName("id") val id: String,
    @SerializedName("goalType") val goalType: String,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("targetTime") val targetTime: Int?,
    @SerializedName("targetDate") val targetDate: String?,
    @SerializedName("currentWeek") val currentWeek: Int = 1,
    @SerializedName("totalWeeks") val totalWeeks: Int,
    @SerializedName("experienceLevel") val experienceLevel: String,
    @SerializedName("daysPerWeek") val daysPerWeek: Int,
    @SerializedName("status") val status: String,           // active/paused/completed/cancelled
    @SerializedName("aiGenerated") val aiGenerated: Boolean,
    @SerializedName("createdAt") val createdAt: String?,
    @SerializedName("weeklyMileageBase") val weeklyMileageBase: Double? = null,
    @SerializedName("completedWorkouts") val completedWorkouts: Int = 0,
    @SerializedName("totalWorkouts") val totalWorkouts: Int = 0
)

/** Full plan returned from GET /api/training-plans/details/:planId */
data class TrainingPlanDetails(
    @SerializedName("plan") val plan: TrainingPlanSummary,
    @SerializedName("weeks") val weeks: List<WeekDetails>
)

data class WeekDetails(
    @SerializedName("id") val id: String,
    @SerializedName("weekNumber") val weekNumber: Int,
    @SerializedName("weekDescription") val weekDescription: String?,
    @SerializedName("totalDistance") val totalDistance: Double?,
    @SerializedName("focusArea") val focusArea: String?,    // endurance/speed/recovery/race_prep
    @SerializedName("intensityLevel") val intensityLevel: String?,
    @SerializedName("workouts") val workouts: List<WorkoutDetails>
)

data class WorkoutDetails(
    @SerializedName("id") val id: String,
    @SerializedName("dayOfWeek") val dayOfWeek: Int,        // 0=Sun, 1=Mon…
    @SerializedName("scheduledDate") val scheduledDate: String?,
    @SerializedName("workoutType") val workoutType: String, // easy/tempo/intervals/long_run/hill_repeats/recovery/rest
    @SerializedName("distance") val distance: Double?,
    @SerializedName("duration") val duration: Int?,         // seconds
    @SerializedName("targetPace") val targetPace: String?,
    @SerializedName("intensity") val intensity: String?,    // z1-z5
    @SerializedName("description") val description: String?,
    @SerializedName("instructions") val instructions: String?,
    @SerializedName("isCompleted") val isCompleted: Boolean = false,
    @SerializedName("completedRunId") val completedRunId: String? = null
)

/** GET /api/training-plans/:planId/today */
data class TodayWorkoutResponse(
    @SerializedName("workout") val workout: WorkoutDetails?,
    @SerializedName("isToday") val isToday: Boolean
)

/** GET /api/training-plans/:planId/progress */
data class TrainingPlanProgress(
    @SerializedName("planId") val planId: String,
    @SerializedName("currentWeek") val currentWeek: Int,
    @SerializedName("totalWeeks") val totalWeeks: Int,
    @SerializedName("goalType") val goalType: String,
    @SerializedName("targetDistance") val targetDistance: Double?,
    @SerializedName("targetTime") val targetTime: Int?,
    @SerializedName("status") val status: String,
    @SerializedName("completedWorkouts") val completedWorkouts: Int,
    @SerializedName("totalWorkouts") val totalWorkouts: Int,
    @SerializedName("overallCompletion") val overallCompletion: Double,
    @SerializedName("weeks") val weeks: List<WeekProgress>
)

data class WeekProgress(
    @SerializedName("weekNumber") val weekNumber: Int,
    @SerializedName("weekDescription") val weekDescription: String?,
    @SerializedName("totalDistance") val totalDistance: Double?,
    @SerializedName("focusArea") val focusArea: String?,
    @SerializedName("intensityLevel") val intensityLevel: String?,
    @SerializedName("totalWorkouts") val totalWorkouts: Int,
    @SerializedName("completedWorkouts") val completedWorkouts: Int,
    @SerializedName("completionRate") val completionRate: Double
)

/** PUT /api/training-plans/workouts/:id/complete */
data class CompleteWorkoutRequest(
    @SerializedName("runId") val runId: String? = null
)
