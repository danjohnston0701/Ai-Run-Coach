package live.airuncoach.airuncoach.util

import live.airuncoach.airuncoach.network.model.WorkoutDetails

/**
 * Plan-level context to accompany a WorkoutDetails when navigating to WorkoutDetailScreen.
 * Lets the run session know which plan + week it belongs to so the AI coach
 * can give plan-aware coaching during the run.
 */
/** goalType of the hidden plan a one-off AI session lives under (server SINGLE_SESSION_STATUS). */
const val SINGLE_SESSION_GOAL_TYPE = "single_session"

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
    /** Set to true before navigating to run_session via "Prepare for Watch" so the
     *  run screen waits in standby instead of auto-starting GPS tracking. */
    var isWatchMode: Boolean = false
    /** Live Tracking observer invite selections made on WorkoutDetailScreen, carried
     *  through to the RunSetupConfig built when the workout is actually started. */
    var liveTrackingEnabled: Boolean = false
    var liveTrackingObservers: List<String> = emptyList()
    /** One-off AI session started on a day with an open plan session: "count" / "leave_open". */
    var planSessionChoice: String? = null

    fun clear() {
        currentWorkout = null
        planContext = null
        planSessionChoice = null
        isWatchMode = false
        liveTrackingEnabled = false
        liveTrackingObservers = emptyList()
    }
}
