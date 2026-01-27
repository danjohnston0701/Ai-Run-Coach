package live.airuncoach.airuncoach.domain.model

import java.time.LocalDate

/**
 * TRAINING PLANS
 * AI-generated structured workout schedules
 */

/**
 * Complete training plan
 */
data class TrainingPlan(
    val id: String,
    val name: String,
    val description: String,
    val goal: TrainingGoal,
    val duration: Int,                // weeks
    val startDate: LocalDate,
    val endDate: LocalDate,
    val weeklyWorkouts: List<WeeklyPlan>,
    val peakWeek: Int,               // Which week has highest volume
    val taperWeeks: Int,             // How many weeks to taper
    val difficulty: PlanDifficulty,
    val createdBy: String,           // "AI" or user ID if custom
    val completionRate: Float        // 0.0 to 1.0
)

enum class PlanDifficulty {
    BEGINNER,
    INTERMEDIATE,
    ADVANCED,
    ELITE
}

/**
 * Training goal for plan
 */
data class TrainingGoal(
    val type: GoalType,
    val targetDistance: Double?,     // meters
    val targetTime: Long?,           // milliseconds
    val targetPace: String?,         // min/km
    val raceDate: LocalDate?
)

enum class GoalType {
    DISTANCE_5K,
    DISTANCE_10K,
    DISTANCE_HALF_MARATHON,
    DISTANCE_MARATHON,
    DISTANCE_ULTRA,
    IMPROVE_SPEED,
    BUILD_ENDURANCE,
    LOSE_WEIGHT,
    MAINTAIN_FITNESS,
    COMEBACK_FROM_INJURY
}

/**
 * Weekly training plan
 */
data class WeeklyPlan(
    val weekNumber: Int,
    val weekOf: LocalDate,
    val theme: String,               // "Base Building", "Speed Work", "Taper"
    val totalDistance: Double,       // meters
    val totalDuration: Long,         // milliseconds
    val workouts: List<PlannedWorkout>,
    val isRecoveryWeek: Boolean,
    val completed: Boolean = false,
    val completionPercent: Float = 0f
)

/**
 * Individual planned workout
 */
data class PlannedWorkout(
    val id: String,
    val date: LocalDate,
    val type: WorkoutType,
    val name: String,
    val description: String,
    val targetDistance: Double?,      // meters
    val targetDuration: Long?,        // milliseconds
    val targetPace: String?,
    val intervals: List<Interval>?,
    val warmup: Interval?,
    val cooldown: Interval?,
    val intensity: WorkoutIntensity,
    val completed: Boolean = false,
    val actualRunId: String? = null,
    val completionScore: Float? = null // How well you executed (0-100)
)

enum class WorkoutType {
    EASY_RUN,
    LONG_RUN,
    TEMPO_RUN,
    INTERVAL_TRAINING,
    HILL_REPEATS,
    FARTLEK,
    RECOVERY_RUN,
    REST_DAY,
    CROSS_TRAINING,
    RACE_PACE,
    PROGRESSION_RUN
}

enum class WorkoutIntensity {
    VERY_EASY,       // Zone 1
    EASY,            // Zone 2
    MODERATE,        // Zone 3
    HARD,            // Zone 4
    VERY_HARD,       // Zone 5
    MAX_EFFORT       // Zone 5+
}

/**
 * Interval within a workout
 */
data class Interval(
    val type: IntervalType,
    val distance: Double?,           // meters
    val duration: Long?,             // milliseconds
    val pace: String?,
    val heartRateZone: Int?,         // 1-5
    val recovery: Interval?          // Recovery interval after this
)

enum class IntervalType {
    WARMUP,
    WORK,
    RECOVERY,
    COOLDOWN
}

/**
 * Training plan progress
 */
data class PlanProgress(
    val plan: TrainingPlan,
    val completedWorkouts: Int,
    val totalWorkouts: Int,
    val currentWeek: Int,
    val weeklyCompliance: List<Float>, // Completion rate per week
    val onTrack: Boolean,
    val projectedCompletion: LocalDate,
    val adaptations: List<PlanAdaptation>
)

/**
 * AI-suggested adaptations to plan
 */
data class PlanAdaptation(
    val date: LocalDate,
    val reason: String,
    val change: String,
    val applied: Boolean
)

/**
 * Workout execution analysis
 */
data class WorkoutAnalysis(
    val planned: PlannedWorkout,
    val actual: RunSession,
    val score: Float,                // 0-100
    val paceAccuracy: Float,         // How close to target
    val durationAccuracy: Float,
    val intensityAccuracy: Float,
    val strengths: List<String>,
    val improvements: List<String>,
    val adjustments: List<String>    // Suggested changes to future workouts
)
