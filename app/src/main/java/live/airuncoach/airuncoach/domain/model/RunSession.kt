package live.airuncoach.airuncoach.domain.model

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

data class RunSession(
    val id: String,
    val startTime: Long,
    val endTime: Long?,
    val duration: Long, // milliseconds
    val distance: Double, // meters
    val averageSpeed: Float, // m/s
    val maxSpeed: Float, // m/s
    val averagePace: String?, // min/km format - nullable as API may not always provide
    val currentPace: String? = null, // Real-time/instant pace from recent GPS data
    val calories: Int,
    val cadence: Int, // steps per minute
    val heartRate: Int, // beats per minute
    val routePoints: List<LocationPoint>,
    val kmSplits: List<KmSplit>,
    val isStruggling: Boolean = false,
    val phase: CoachingPhase = CoachingPhase.GENERIC,
    
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
    
    // External sync source (e.g., "garmin", "strava", null for native runs)
    val externalSource: String? = null,
    val externalId: String? = null,
    
    // Garmin upload tracking (for AI Run Coach runs uploaded TO Garmin)
    val uploadedToGarmin: Boolean? = null,
    val garminActivityId: String? = null,

    val isActive: Boolean = false,

    // Post-run UX + analysis context
    val name: String? = null, // user-facing run name (editable)
    val difficulty: String? = null, // backend-provided difficulty (easy/moderate/hard)
    val userComments: String? = null, // user's self-assessment / notes
    val strugglePoints: List<StrugglePoint> = emptyList(), // detected pace-drop events

    // Optional time-series data (present for some sources like Garmin)
    // Keep nullable to avoid Gson setting non-null lists to null when fields are absent.
    val heartRateData: List<Int>? = null,
    val paceData: List<Double>? = null,

    // AI coaching notes captured during the run (optional)
    val aiCoachingNotes: List<AiCoachingNote> = emptyList(),

    // Run goals for target tracking (optional)
    val targetDistance: Double? = null, // kilometers
    val targetTime: Long? = null, // milliseconds
    val wasTargetAchieved: Boolean? = null
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
    
    fun getDifficultyLevel(): String {
        // Calculate difficulty based on pace (min/km)
        val pace = averagePace ?: return "unknown"
        
        // Check if pace has the expected format before splitting
        if (!pace.contains("'") && !pace.contains("/")) {
            return "unknown"
        }
        
        val paceComponents = pace.split("'")
        if (paceComponents.size >= 2) {
            val minutes = paceComponents[0].toIntOrNull() ?: 0
            val seconds = paceComponents[1].replace("\"", "").replace("/km", "").trim().toIntOrNull() ?: 0
            val totalSeconds = minutes * 60 + seconds
            
            return when {
                totalSeconds < 300 -> "easy"      // < 5:00/km
                totalSeconds < 360 -> "moderate"  // 5:00-6:00/km
                else -> "hard"                    // > 6:00/km
            }
        } else {
            return "unknown"
        }
    }
    
    fun getFormattedDate(): String {
        val date = Date(startTime)
        val format = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        return format.format(date)
    }
    
    // @Serializable data class below
    
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
        val distanceDiff = abs(distance - other.distance) / distance
        if (distanceDiff < 0.1) {
            similarityScore += (1 - distanceDiff * 10).toFloat()
            factors++
        }
        
        // Elevation gain similarity (within 20%)
        if (totalElevationGain > 0 && other.totalElevationGain > 0) {
            val elevationDiff = abs(totalElevationGain - other.totalElevationGain) / totalElevationGain
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
