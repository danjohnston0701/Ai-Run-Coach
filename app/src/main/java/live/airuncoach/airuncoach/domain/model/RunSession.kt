package live.airuncoach.airuncoach.domain.model

import com.google.gson.annotations.SerializedName
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
    val terrainType: TerrainType? = null, // flat, hilly, mountainous — nullable for old runs
    
    // Route identification for comparison
    val routeHash: String?, // Hash of route coordinates for similarity matching
    val routeName: String?, // User-defined or auto-generated route name
    
    // External sync source (e.g., "garmin", "strava", null for native runs)
    val externalSource: String? = null,
    val externalId: String? = null,
    
    // Garmin upload tracking (for AI Run Coach runs uploaded TO Garmin)
    val uploadedToGarmin: Boolean? = null,
    val garminActivityId: String? = null,
    
    // TRUE if run was enriched with Garmin data (HR, cadence, elevation, etc.)
    val hasGarminData: Boolean = false,

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
    val wasTargetAchieved: Boolean? = null,

    // Extended metrics (from server)
    val avgSpeed: Float? = null, // m/s - override for avg moving speed
    val movingTime: Long? = null, // seconds
    val elapsedTime: Long? = null, // seconds (includes pauses)
    val maxCadence: Int? = null, // spm
    val avgStrideLength: Float? = null, // meters
    val minElevation: Double? = null, // meters
    val maxElevation: Double? = null, // meters
    val steepestIncline: Float? = null, // percent
    val steepestDecline: Float? = null, // percent
    val totalSteps: Int? = null, // total steps taken during the run (from step counter)
    val activeCalories: Int? = null, // kcal
    val restingCalories: Int? = null, // kcal
    val estSweatLoss: Float? = null, // liters
    val minHeartRate: Int? = null // bpm
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
        // Use elevation gain per km as the primary metric - this reflects the
        // actual climbing effort regardless of route shape (out-and-back vs loop)
        if (distance <= 0 || totalElevationGain <= 0) {
            return "flat"
        }

        // totalElevationGain is in metres, distance is in metres
        // elevationPerKm = metres gained per km of running
        val elevationPerKm = totalElevationGain / (distance / 1000.0)

        return when {
            elevationPerKm < 8.0 -> "flat"         // < 8 m/km  - essentially flat
            elevationPerKm < 18.0 -> "rolling"     // 8–18 m/km - gentle undulations
            elevationPerKm < 30.0 -> "hilly"       // 18–30 m/km - noticeable hills
            elevationPerKm < 45.0 -> "steep"       // 30–45 m/km - challenging terrain
            else -> "extreme"                      // > 45 m/km  - very steep
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
    @SerializedName("FLAT", alternate = ["flat", "Flat"])
    FLAT,           // < 2% average gradient
    @SerializedName("ROLLING", alternate = ["rolling", "Rolling"])
    ROLLING,        // 2-5% average gradient
    @SerializedName("HILLY", alternate = ["hilly", "Hilly"])
    HILLY,          // 5-10% average gradient
    @SerializedName("MOUNTAINOUS", alternate = ["mountainous", "Mountainous"])
    MOUNTAINOUS     // > 10% average gradient
}
