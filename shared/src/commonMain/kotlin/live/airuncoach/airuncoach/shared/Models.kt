package live.airuncoach.airuncoach.shared

import kotlinx.serialization.Serializable

/**
 * Core location point for GPS tracking
 */
@Serializable
data class LocationPoint(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double = 0.0,
    val timestamp: Long = 0L,
    val speed: Float = 0f,
    val bearing: Float = 0f
)

/**
 * Kilometer split timing data
 */
@Serializable
data class KmSplit(
    val kilometer: Int,
    val time: Long, // milliseconds
    val pace: String? = null, // "mm:ss" format
    val elevationGain: Double = 0.0,
    val elevationLoss: Double = 0.0
)

/**
 * Weather data captured during run
 */
@Serializable
data class WeatherData(
    val temperature: Double, // Celsius
    val humidity: Int, // percentage
    val windSpeed: Double, // m/s
    val windDirection: String? = null,
    val condition: String? = null, // "clear", "cloudy", "rain", etc.
    val timestamp: Long = 0L
)

/**
 * AI coaching note generated during a run
 */
@Serializable
data class AiCoachingNote(
    val timestamp: Long,
    val message: String,
    val phase: String, // "warmup", "steady", "push", "cool down"
    val type: String // "pace", "heart_rate", "elevation", "motivation", "struggle"
)

/**
 * Struggle point - detected pace drop during run
 */
@Serializable
data class StrugglePoint(
    val kilometer: Int,
    val startTime: Long,
    val duration: Long, // how long the struggle lasted
    val heartRateAtStart: Int? = null,
    val paceBefore: String? = null,
    val paceDuring: String? = null,
    val message: String? = null
)

/**
 * Coaching phase during run
 */
@Serializable
enum class CoachingPhase {
    WARMUP,
    STEADY,
    PUSH,
    COOLDOWN,
    GENERIC
}

enum class TerrainType {
    FLAT,           // < 2% average gradient
    ROLLING,        // 2-5% average gradient
    HILLY,          // 5-10% average gradient
    MOUNTAINOUS     // > 10% average gradient
}

/**
 * Core Run Session model - shared between Android and iOS
 */
@Serializable
data class RunSession(
    val id: String = "",
    val startTime: Long = 0L,
    val endTime: Long? = null,
    val duration: Long = 0L, // milliseconds
    val distance: Double = 0.0, // meters
    val averageSpeed: Float = 0f, // m/s
    val maxSpeed: Float = 0f, // m/s
    val averagePace: String? = null, // min/km format
    val currentPace: String? = null,
    val calories: Int = 0,
    val cadence: Int = 0,
    val heartRate: Int = 0,
    val routePoints: List<LocationPoint> = emptyList(),
    val kmSplits: List<KmSplit> = emptyList(),
    val isStruggling: Boolean = false,
    val phase: CoachingPhase = CoachingPhase.GENERIC,

    // Weather data
    val weatherAtStart: WeatherData? = null,
    val weatherAtEnd: WeatherData? = null,

    // Terrain analysis
    val totalElevationGain: Double = 0.0,
    val totalElevationLoss: Double = 0.0,
    val averageGradient: Float = 0f,
    val maxGradient: Float = 0f,
    val terrainType: TerrainType = TerrainType.FLAT,

    // Route identification
    val routeHash: String? = null,
    val routeName: String? = null,

    // External sync
    val externalSource: String? = null,
    val externalId: String? = null,
    val uploadedToGarmin: Boolean? = null,
    val garminActivityId: String? = null,

    val isActive: Boolean = false,

    // Post-run data
    val name: String? = null,
    val difficulty: String? = null,
    val userComments: String? = null,
    val strugglePoints: List<StrugglePoint> = emptyList(),

    // Time-series data
    val heartRateData: List<Int>? = null,
    val paceData: List<Double>? = null,

    // AI coaching
    val aiCoachingNotes: List<AiCoachingNote> = emptyList(),

    // Run goals
    val targetDistance: Double? = null,
    val targetTime: Long? = null,
    val wasTargetAchieved: Boolean? = null,

    // Extended metrics
    val avgSpeed: Float? = null,
    val movingTime: Long? = null,
    val elapsedTime: Long? = null,
    val maxCadence: Int? = null,
    val avgStrideLength: Float? = null,
    val minElevation: Double? = null,
    val maxElevation: Double? = null,
    val steepestIncline: Float? = null,
    val steepestDecline: Float? = null,
    val activeCalories: Int? = null,
    val restingCalories: Int? = null,
    val estSweatLoss: Float? = null,
    val minHeartRate: Int? = null
) {
    fun getDistanceInKm(): Double = distance / 1000.0

    fun getFormattedDuration(): String {
        val seconds = (duration / 1000) % 60
        val minutes = (duration / (1000 * 60)) % 60
        val hours = (duration / (1000 * 60 * 60))

        return if (hours > 0) {
            "${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}"
        } else {
            "${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}"
        }
    }

    fun getDifficultyLevel(): String {
        val pace = averagePace ?: return "unknown"

        if (!pace.contains("'") && !pace.contains("/")) {
            return "unknown"
        }

        val paceComponents = pace.split("'")
        if (paceComponents.size >= 2) {
            val minutes = paceComponents[0].toIntOrNull() ?: 0
            val seconds = paceComponents[1].replace("\"", "").replace("/km", "").trim().toIntOrNull() ?: 0
            val totalSeconds = minutes * 60 + seconds

            return when {
                totalSeconds < 300 -> "easy"
                totalSeconds < 360 -> "moderate"
                else -> "hard"
            }
        } else {
            return "unknown"
        }
    }

    /**
     * Calculates route similarity score with another run (0.0 to 1.0)
     */
    fun calculateRouteSimilarity(other: RunSession): Float {
        if (routeHash != null && routeHash == other.routeHash) {
            return 1.0f
        }

        var similarityScore = 0f
        var factors = 0

        val distanceDiff = kotlin.math.abs(distance - other.distance) / distance
        if (distanceDiff < 0.1) {
            similarityScore += (1 - distanceDiff * 10).toFloat()
            factors++
        }

        if (totalElevationGain > 0 && other.totalElevationGain > 0) {
            val elevationDiff = kotlin.math.abs(totalElevationGain - other.totalElevationGain) / totalElevationGain
            if (elevationDiff < 0.2) {
                similarityScore += (1 - elevationDiff * 5).toFloat()
                factors++
            }
        }

        if (terrainType == other.terrainType) {
            similarityScore += 1.0f
            factors++
        }

        return if (factors > 0) similarityScore / factors else 0f
    }
}