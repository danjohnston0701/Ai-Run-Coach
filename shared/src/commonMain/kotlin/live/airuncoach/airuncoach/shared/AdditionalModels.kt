package live.airuncoach.airuncoach.shared

import kotlinx.serialization.Serializable

/**
 * User model
 */
@Serializable
data class User(
    val id: String = "",
    val email: String = "",
    val name: String = "",
    val dob: String? = null,
    val gender: String? = null,
    val height: String? = null,
    val weight: String? = null,
    val fitnessLevel: String? = null,
    val desiredFitnessLevel: String? = null,
    val coachName: String = "AI Coach",
    val profilePic: String? = null,
    val coachGender: String = "male",
    val coachAccent: String = "british",
    val coachTone: String = "energetic",
    val distanceMinKm: Double = 0.0,
    val distanceMaxKm: Double = 50.0,
    val distanceDecimalsEnabled: Boolean = false,
    val userCode: String? = null
)

/**
 * Generated route model
 */
@Serializable
data class GeneratedRoute(
    val id: String = "",
    val name: String? = null,
    val distance: Double, // meters
    val difficulty: RouteDifficulty = RouteDifficulty.MODERATE,
    val startLat: Double,
    val startLng: Double,
    val endLat: Double? = null,
    val endLng: Double? = null,
    val waypoints: List<RouteWaypoint> = emptyList(),
    val elevation: Double = 0.0,
    val estimatedTime: Int = 0, // seconds
    val terrainType: String = "mixed",
    val polyline: String? = null,
    val elevationGain: Double = 0.0,
    val elevationLoss: Double = 0.0,
    val elevationProfile: List<ElevationPoint> = emptyList(),
    val startLocationLabel: String? = null,
    val isFavorite: Boolean = false,
    val lastStartedAt: Long? = null,
    val maxInclinePercent: Double = 0.0,
    val maxInclineDegrees: Double = 0.0,
    val maxDeclinePercent: Double = 0.0,
    val maxDeclineDegrees: Double = 0.0,
    val turnInstructions: List<TurnInstruction> = emptyList(),
    val source: String = "ai"
)

@Serializable
data class RouteWaypoint(
    val lat: Double,
    val lng: Double,
    val type: String = "point" // "start", "end", "waypoint", "turn"
)

@Serializable
data class ElevationPoint(
    val distance: Double, // cumulative distance in meters
    val elevation: Double // elevation in meters
)

@Serializable
enum class RouteDifficulty {
    EASY,
    MODERATE,
    HARD,
    EXTREME
}

/**
 * Turn-by-turn instruction
 */
@Serializable
data class TurnInstruction(
    val instruction: String, // "Turn left", "Continue straight", etc.
    val distance: Double, // distance from previous point in meters
    val type: String // "turn-left", "turn-right", "straight", "arrive"
)

/**
 * Goal model
 */
@Serializable
data class Goal(
    val id: String = "",
    val userId: String = "",
    val type: GoalType = GoalType.DISTANCE,
    val title: String = "",
    val description: String? = null,
    val status: GoalStatus = GoalStatus.ACTIVE,
    val priority: Int = 1,
    val targetDate: Long? = null,
    val distanceTarget: Double? = null, // km
    val durationTarget: Long? = null, // milliseconds
    val paceTarget: String? = null, // "mm:ss"
    val currentProgress: Double = 0.0,
    val completedAt: Long? = null,
    val createdAt: Long = 0L
)

@Serializable
enum class GoalStatus {
    ACTIVE,
    COMPLETED,
    CANCELLED
}

/**
 * Connected device model
 */
@Serializable
data class ConnectedDevice(
    val id: String = "",
    val name: String = "",
    val deviceType: DeviceType = DeviceType.OTHER,
    val isActive: Boolean = true,
    val lastSyncedAt: Long? = null,
    val batteryLevel: Int? = null,
    val firmwareVersion: String? = null
)

@Serializable
enum class DeviceType {
    GARMIN,
    COROS,
    APPLE_WATCH,
    FITBIT,
    SAMSUNG_WATCH,
    OTHER
}

/**
 * Fitness metrics data
 */
@Serializable
data class FitnessMetrics(
    val vo2Max: Float = 0f,
    val fitnessLevel: String = "average",
    val trainingLoad: Int = 0,
    val ctl: Float = 0f, // Chronic Training Load
    val atl: Float = 0f, // Acute Training Load
    val tsb: Float = 0f  // Training Stress Balance
)

/**
 * Run with TSS for fitness calculations
 */
@Serializable
data class RunWithTSS(
    val date: String, // ISO date string "yyyy-MM-dd"
    val tss: Int,
    val duration: Long,
    val distance: Double
)

/**
 * Daily fitness data point
 */
@Serializable
data class DailyFitness(
    val date: String,
    val fitness: Float,        // CTL
    val fatigue: Float,        // ATL
    val form: Float,           // TSB
    val trainingLoad: Int,     // TSS for this day
    val rampRate: Float
)

/**
 * Fitness trend result
 */
@Serializable
data class FitnessTrend(
    val dailyMetrics: List<DailyFitness> = emptyList(),
    val currentFitness: Float = 0f,
    val currentFatigue: Float = 0f,
    val currentForm: Float = 0f,
    val trainingStatus: TrainingStatus = TrainingStatus.DETRAINING,
    val recommendations: List<String> = emptyList()
)

@Serializable
enum class TrainingStatus {
    OVERTRAINED,
    STRAINED,
    OPTIMAL,
    FRESH,
    DETRAINING
}

@Serializable
enum class InjuryRisk {
    LOW,
    MODERATE,
    HIGH,
    CRITICAL
}