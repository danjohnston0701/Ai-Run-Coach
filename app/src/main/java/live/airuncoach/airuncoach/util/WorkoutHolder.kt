package live.airuncoach.airuncoach.util

import live.airuncoach.airuncoach.network.model.WorkoutDetails

/**
 * Static holder for passing WorkoutDetails through navigation.
 * Set before navigating to WorkoutDetailScreen, cleared after use.
 */
object WorkoutHolder {
    var currentWorkout: WorkoutDetails? = null
}
