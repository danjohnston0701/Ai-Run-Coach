package live.airuncoach.airuncoach.domain.model

data class Goal(
    val id: String? = null,
    val userId: String,
    val type: String, // EVENT, DISTANCE_TIME, HEALTH_WELLBEING, CONSISTENCY
    val title: String,
    val description: String? = null,
    val notes: String? = null,
    val targetDate: String? = null, // ISO format date
    
    // Event-specific fields
    val eventName: String? = null,
    val eventLocation: String? = null,
    
    // Distance/Time fields
    val distanceTarget: String? = null, // "5K", "10K", "Half Marathon", "Marathon", "Ultra Marathon", or custom
    val timeTargetSeconds: Int? = null, // Total seconds for time target
    
    // Health & Wellbeing fields
    val healthTarget: String? = null, // "Improve fitness", "Improve endurance", etc.
    val targetWeightKg: Double? = null, // Target weight for "Lose weight" goal
    val startingWeightKg: Double? = null, // Starting weight for "Lose weight" goal
    
    // Consistency fields
    val weeklyRunTarget: Int? = null, // Number of runs per week
    
    // Progress tracking
    val currentProgress: Float = 0f,
    val isActive: Boolean = true,
    val isCompleted: Boolean = false,
    
    // Related run sessions (multiple runs can be linked to a goal)
    val relatedRunSessionIds: List<String> = emptyList(),
    
    // Related training plan (if a plan was generated for this goal)
    val linkedTrainingPlanId: String? = null,
    
    // Badge awarded when goal is completed
    val badge: String? = null,
    
    // Metadata
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val completedAt: String? = null
) {
    /**
     * Get the distance target in meters for comparison with run distances
     */
    fun getDistanceTargetInMeters(): Double? {
        return when (distanceTarget) {
            "5K" -> 5000.0
            "10K" -> 10000.0
            "Half Marathon" -> 21097.5
            "Marathon" -> 42195.0
            "Ultra Marathon" -> 50000.0 // Conservative default for ultra
            else -> distanceTarget?.toDoubleOrNull()
        }
    }
    
    /**
     * Check if a run session meets the goal criteria
     * Both distance and time must meet or exceed the goal targets
     * 
     * Distance: run must be >= target AND <= target * 1.05 (within 5% above target)
     * Time: run duration must be <= target time (faster or equal)
     */
    fun isGoalMetByRun(runDistanceMeters: Double, runDurationSeconds: Long): Boolean {
        val targetMeters = getDistanceTargetInMeters() ?: return false

        // Check distance: run must be at least the target distance but not more than 5% above
        if (runDistanceMeters < targetMeters) return false
        if (runDistanceMeters > targetMeters * 1.05) return false

        // Check time: if there's a time target, run must be <= target time (faster or equal)
        val targetSeconds = timeTargetSeconds
        if (targetSeconds != null && runDurationSeconds > targetSeconds) return false

        return true
    }
}
