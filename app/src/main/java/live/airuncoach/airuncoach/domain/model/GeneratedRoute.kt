package live.airuncoach.airuncoach.domain.model

/**
 * Complete representation of a generated running route
 */
data class GeneratedRoute(
    val id: String,
    val name: String,                       // "North Loop Route"
    val distance: Double,                   // Distance in kilometers (e.g., 5.23)
    val duration: Double,                    // Duration in minutes (can be decimal)
    val polyline: String,                   // Google encoded polyline
    val waypoints: List<LatLng>,            // Waypoints used for generation
    val difficulty: RouteDifficulty,        // EASY, MODERATE, HARD
    val elevationGain: Double,                // Total elevation gain in meters (can be decimal)
    val elevationLoss: Double,              // Total elevation loss in meters (can be decimal)
    val maxGradientPercent: Double,         // Steepest gradient percentage (e.g., 8.5)
    val maxGradientDegrees: Double,         // Steepest gradient in degrees (e.g., 4.9)
    val instructions: List<String>,         // Turn-by-turn text instructions
    val turnInstructions: List<TurnInstruction>, // Detailed turn instructions with coordinates
    val backtrackRatio: Double,             // How much the route backtracks (0.0 - 1.0)
    val angularSpread: Double,              // Compass coverage in degrees (0° - 360°)
    val templateName: String,               // Name of template used (e.g., "North Loop")
    val hasMajorRoads: Boolean = false      // Whether route includes major roads
) {
    /**
     * Returns formatted distance with unit
     */
    fun getFormattedDistance(): String = String.format("%.1f km", distance)
    
    /**
     * Returns formatted duration
     */
    fun getFormattedDuration(): String {
        val hours = (duration / 60).toInt()
        val minutes = (duration % 60).toInt()
        return if (hours > 0) {
            "${hours}h ${minutes}m"
        } else {
            "${minutes}m"
        }
    }
    
    /**
     * Returns difficulty color code
     */
    fun getDifficultyColor(): String = when (difficulty) {
        RouteDifficulty.EASY -> "#10B981"      // Green
        RouteDifficulty.MODERATE -> "#F59E0B"  // Orange/Yellow
        RouteDifficulty.HARD -> "#EF4444"      // Red
    }
    
    /**
     * Returns difficulty label
     */
    fun getDifficultyLabel(): String = when (difficulty) {
        RouteDifficulty.EASY -> "EASY"
        RouteDifficulty.MODERATE -> "MODERATE"
        RouteDifficulty.HARD -> "HARD"
    }
}
