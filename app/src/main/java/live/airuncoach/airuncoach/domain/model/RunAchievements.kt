package live.airuncoach.airuncoach.domain.model

/**
 * Run Achievement - represents a personal best or milestone achieved during a run
 */
data class RunAchievement(
    val type: String, // Achievement type ID
    val title: String,
    val description: String,
    val icon: String, // emoji icon
    val backgroundColor: String, // hex color for the badge
    val category: String, // Distance category: "1K", "1 Mile", "5K", "10K", "Half Marathon", "Marathon"
    val previousBestPaceMinPerKm: Double? = null, // previous best pace for this distance
    val improvementPercent: Float? = null, // % improvement over previous best
)


