package live.airuncoach.airuncoach.domain.model

data class RunSession(
    val id: String,
    val startTime: Long,
    val endTime: Long?,
    val duration: Long, // milliseconds
    val distance: Double, // meters
    val averageSpeed: Float, // m/s
    val maxSpeed: Float, // m/s
    val averagePace: String, // min/km format
    val calories: Int,
    val routePoints: List<LocationPoint>,
    
    // Weather data captured at run start - CRITICAL for weather impact analysis
    val weatherAtStart: WeatherData?,
    val weatherAtEnd: WeatherData?,
    
    // Terrain analysis data - for route similarity comparison
    val totalElevationGain: Double, // meters climbed
    val totalElevationLoss: Double, // meters descended
    val averageGradient: Float, // percentage
    val maxGradient: Float, // percentage
    val terrainType: TerrainType, // flat, hilly, mountainous
    
    // Route identification for comparison
    val routeHash: String?, // Hash of route coordinates for similarity matching
    val routeName: String?, // User-defined or auto-generated route name
    
    val isActive: Boolean = false
) {
    fun getDistanceInKm(): Double = distance / 1000.0
    
    fun getFormattedDuration(): String {
        val seconds = (duration / 1000) % 60
        val minutes = (duration / (1000 * 60)) % 60
        val hours = (duration / (1000 * 60 * 60))
        
        return if (hours > 0) {
            String.format("%02d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format("%02d:%02d", minutes, seconds)
        }
    }
    
    /**
     * Calculates route similarity score with another run (0.0 to 1.0)
     * Used for weather impact analysis - compare similar routes with different weather
     */
    fun calculateRouteSimilarity(other: RunSession): Float {
        // Route hash exact match
        if (routeHash != null && routeHash == other.routeHash) {
            return 1.0f
        }
        
        var similarityScore = 0f
        var factors = 0
        
        // Distance similarity (within 10%)
        val distanceDiff = kotlin.math.abs(distance - other.distance) / distance
        if (distanceDiff < 0.1) {
            similarityScore += (1 - distanceDiff * 10).toFloat()
            factors++
        }
        
        // Elevation gain similarity (within 20%)
        if (totalElevationGain > 0 && other.totalElevationGain > 0) {
            val elevationDiff = kotlin.math.abs(totalElevationGain - other.totalElevationGain) / totalElevationGain
            if (elevationDiff < 0.2) {
                similarityScore += (1 - elevationDiff * 5).toFloat()
                factors++
            }
        }
        
        // Terrain type match
        if (terrainType == other.terrainType) {
            similarityScore += 1.0f
            factors++
        }
        
        return if (factors > 0) similarityScore / factors else 0f
    }
}

enum class TerrainType {
    FLAT,           // < 2% average gradient
    ROLLING,        // 2-5% average gradient
    HILLY,          // 5-10% average gradient
    MOUNTAINOUS     // > 10% average gradient
}
