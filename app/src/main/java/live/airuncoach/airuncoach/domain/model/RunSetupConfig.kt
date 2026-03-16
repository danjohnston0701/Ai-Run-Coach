package live.airuncoach.airuncoach.domain.model

/**
 * Configuration for setting up a run session
 * Includes distance, target time, live tracking, group run settings, and route
 */
data class RunSetupConfig(
    val activityType: PhysicalActivityType = PhysicalActivityType.RUN,
    val targetDistance: Float,          // In kilometers
    val hasTargetTime: Boolean = false,
    val targetHours: Int = 0,
    val targetMinutes: Int = 0,
    val targetSeconds: Int = 0,
    val liveTrackingEnabled: Boolean = false,
    val liveTrackingObservers: List<String> = emptyList(), // User IDs
    val isGroupRun: Boolean = false,
    val groupRunParticipants: List<String> = emptyList(),   // User IDs
    val route: GeneratedRoute? = null,  // Generated route with polyline and turn instructions

    // ── Coaching Programme context ────────────────────────────────────────────
    // Populated when this run is part of an AI coaching plan workout.
    // Passed through to the in-run AI coach so it can give plan-aware insights.
    val trainingPlanId: String? = null,
    val workoutId: String? = null,
    val workoutType: String? = null,      // "easy" | "tempo" | "intervals" | "long_run" | etc.
    val workoutIntensity: String? = null, // "z1" | "z2" | "z3" | "z4" | "z5" (heart rate zone)
    val workoutDescription: String? = null,
    val planGoalType: String? = null,     // "5k" | "10k" | "half_marathon" | "marathon"
    val planWeekNumber: Int? = null,
    val planTotalWeeks: Int? = null
) {
    /**
     * Get formatted target time string
     */
    fun getFormattedTargetTime(): String {
        if (!hasTargetTime) return "No time goal"
        val parts = mutableListOf<String>()
        if (targetHours > 0) parts.add("${targetHours}h")
        if (targetMinutes > 0) parts.add("${targetMinutes}m")
        if (targetSeconds > 0) parts.add("${targetSeconds}s")
        return parts.joinToString(" ")
    }
    
    /**
     * Get target time in total seconds
     */
    fun getTotalTargetSeconds(): Int {
        return targetHours * 3600 + targetMinutes * 60 + targetSeconds
    }
}

enum class PhysicalActivityType {
    RUN,
    WALK
}
