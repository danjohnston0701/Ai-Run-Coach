package live.airuncoach.airuncoach.util

import live.airuncoach.airuncoach.network.model.WorkoutDetails

/**
 * Plan-level context to accompany a WorkoutDetails when navigating to WorkoutDetailScreen.
 * Lets the run session know which plan + week it belongs to so the AI coach
 * can give plan-aware coaching during the run.
 */
data class WorkoutPlanContext(
    val planId: String,
    val goalType: String,       // e.g. "10k", "half_marathon"
    val weekNumber: Int,
    val totalWeeks: Int
)

/**
 * Static holder for passing WorkoutDetails (+ plan context) through navigation.
 * Set before navigating to WorkoutDetailScreen, cleared after use.
 */
object WorkoutHolder {
    var currentWorkout: WorkoutDetails? = null
    var planContext: WorkoutPlanContext? = null

    fun clear() {
        currentWorkout = null
        planContext = null
    }
}
