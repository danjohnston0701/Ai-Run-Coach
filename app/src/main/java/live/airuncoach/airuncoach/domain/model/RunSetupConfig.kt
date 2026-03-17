package live.airuncoach.airuncoach.domain.model

/**
 * Configuration for setting up a run session
 * Includes distance, target time, live tracking, group run settings, and route
 */
data class RunSetupConfig(
    val activityType: PhysicalActivityType = PhysicalActivityType.RUN,
    val targetDistance: Float? = null,  // In kilometers (null = no fixed distance target)
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
    val planTotalWeeks: Int? = null,

    // ── Interval training metadata ─────────────────────────────────────────────
    // Populated for interval/repeat workouts (e.g., "6x400m" or "5x2min hard / 2min easy")
    val isIntervalWorkout: Boolean = false,
    val intervalCount: Int? = null,        // Number of repetitions (e.g., 6 for 6x400m)
    val intervalDistanceKm: Float? = null, // Distance of each interval (e.g., 0.4 for 400m)
    val intervalDurationSecs: Int? = null, // Duration if time-based (e.g., 120 for 2min intervals)
    val restDistanceKm: Float? = null,     // Rest/recovery distance between intervals
    val restDurationSecs: Int? = null,     // Rest/recovery duration between intervals
    val intervalTargetPace: String? = null,// Target pace for work phase (mm:ss/km)
    val restTargetPace: String? = null,    // Target pace for recovery phase (mm:ss/km)
    val intervalHeartRateMin: Int? = null, // Min HR for work phase
    val intervalHeartRateMax: Int? = null, // Max HR for work phase
    val restHeartRateMax: Int? = null      // Max HR for recovery phase
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
