package live.airuncoach.airuncoach.domain.model

/**
 * Represents a struggle point detected during a run
 * Users can annotate these with comments and flag as irrelevant
 */
data class StrugglePoint(
    val id: String,
    val timestamp: Long,                    // When the struggle occurred
    val distanceMeters: Double,            // Distance at which struggle occurred
    val paceAtStruggle: String,            // Pace during struggle (e.g., "6:30/km")
    val baselinePace: String,              // Baseline pace for comparison
    val paceDropPercent: Double,           // How much pace dropped
    val currentGrade: Double?,             // Terrain gradient at this point
    val heartRate: Int?,                   // Heart rate at struggle point
    val location: LocationPoint?,          // GPS coordinates
    
    // User annotations
    var userComment: String? = null,       // User's explanation (e.g., "traffic light")
    var isRelevant: Boolean = true,        // False if should be excluded from AI analysis
    var dismissReason: DismissReason? = null
)

enum class DismissReason {
    TRAFFIC_LIGHT,
    BATHROOM_BREAK,
    STOPPED_FOR_PHOTO,
    TIED_SHOE,
    WATER_BREAK,
    CROSSING_ROAD,
    OTHER
}

/**
 * Extension function to get user-friendly description of dismiss reason
 */
fun DismissReason.getDisplayText(): String {
    return when (this) {
        DismissReason.TRAFFIC_LIGHT -> "Traffic Light"
        DismissReason.BATHROOM_BREAK -> "Bathroom Break"
        DismissReason.STOPPED_FOR_PHOTO -> "Stopped for Photo"
        DismissReason.TIED_SHOE -> "Tied Shoe"
        DismissReason.WATER_BREAK -> "Water Break"
        DismissReason.CROSSING_ROAD -> "Crossing Road"
        DismissReason.OTHER -> "Other"
    }
}
