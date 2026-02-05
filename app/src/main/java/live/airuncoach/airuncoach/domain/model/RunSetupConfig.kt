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
    val route: GeneratedRoute? = null   // Generated route with polyline and turn instructions
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
