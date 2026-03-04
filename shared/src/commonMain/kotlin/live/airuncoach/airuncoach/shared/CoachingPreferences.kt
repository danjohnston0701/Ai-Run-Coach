package live.airuncoach.airuncoach.shared

import kotlinx.serialization.Serializable

/**
 * Coach settings and preferences - shared between platforms
 */
@Serializable
data class CoachSettings(
    val coachName: String = "AI Coach",
    val coachGender: CoachGender = CoachGender.MALE,
    val coachAccent: CoachAccent = CoachAccent.BRITISH,
    val coachTone: CoachTone = CoachTone.ENERGETIC,
    val distanceMinKm: Double = 0.0,
    val distanceMaxKm: Double = 50.0,
    val distanceDecimalsEnabled: Boolean = false
)

@Serializable
enum class CoachGender {
    MALE, FEMALE, NEUTRAL
}

@Serializable
enum class CoachAccent {
    AMERICAN, BRITISH, AUSTRALIAN, IRISH
}

@Serializable
enum class CoachTone {
    ENERGETIC, CALM, HUMOROUS, PROFESSIONAL
}

/**
 * In-run AI coaching feature preferences
 */
@Serializable
data class CoachingFeaturePreferences(
    val coachPaceEnabled: Boolean = true,
    val coachNavigationEnabled: Boolean = true,
    val coachElevationEnabled: Boolean = true,
    val coachHeartRateEnabled: Boolean = true,
    val coachCadenceStrideEnabled: Boolean = true,
    val coachKmSplitsEnabled: Boolean = true,
    val coachStruggleEnabled: Boolean = true,
    val coachMotivationalEnabled: Boolean = true,
    val coachHalfKmCheckInEnabled: Boolean = true,
    val coachKmSplitIntervalKm: Int = 1
) {
    fun isAnyEnabled(): Boolean {
        return coachPaceEnabled || coachNavigationEnabled || coachElevationEnabled ||
                coachHeartRateEnabled || coachCadenceStrideEnabled || coachKmSplitsEnabled ||
                coachStruggleEnabled || coachMotivationalEnabled || coachHalfKmCheckInEnabled
    }

    fun getEnabledFeatures(): List<String> {
        val features = mutableListOf<String>()
        if (coachPaceEnabled) features.add("Pace")
        if (coachNavigationEnabled) features.add("Navigation")
        if (coachElevationEnabled) features.add("Elevation")
        if (coachHeartRateEnabled) features.add("Heart Rate")
        if (coachCadenceStrideEnabled) features.add("Cadence")
        if (coachKmSplitsEnabled) features.add("Splits")
        if (coachStruggleEnabled) features.add("Struggle Detection")
        if (coachMotivationalEnabled) features.add("Motivation")
        if (coachHalfKmCheckInEnabled) features.add("Check-ins")
        return features
    }
}

/**
 * Run setup configuration
 */
@Serializable
data class RunSetupConfig(
    val goalType: GoalType = GoalType.FREE_RUN,
    val targetDistanceKm: Double? = null,
    val targetDurationMs: Long? = null,
    val targetPace: String? = null, // "mm:ss"
    val useGeneratedRoute: Boolean = false,
    val routeId: String? = null,
    val useCurrentLocation: Boolean = true,
    val startLat: Double? = null,
    val startLng: Double? = null,
    val enableAutoPause: Boolean = true,
    val enableAudioCoaching: Boolean = true,
    val coachingPreferences: CoachingFeaturePreferences = CoachingFeaturePreferences()
)

@Serializable
enum class GoalType {
    FREE_RUN,
    DISTANCE,
    TIME,
    PACE,
    RACE
}

/**
 * Real-time run state for sharing between UI and service
 */
@Serializable
data class RunState(
    val isActive: Boolean = false,
    val isPaused: Boolean = false,
    val currentDistanceMeters: Double = 0.0,
    val currentDurationMs: Long = 0L,
    val currentPaceSecondsPerKm: Int = 0,
    val currentHeartRate: Int = 0,
    val currentCadence: Int = 0,
    val currentElevation: Double = 0.0,
    val currentGradient: Float = 0f,
    val currentKm: Int = 0,
    val currentPhase: CoachingPhase = CoachingPhase.WARMUP,
    val isStruggling: Boolean = false,
    val nextSplitDistanceKm: Double = 1.0,
    val upcomingTurn: TurnInstruction? = null,
    val weatherCondition: String? = null,
    val temperature: Double? = null
)

/**
 * Pace zone for target-based runs
 */
@Serializable
data class PaceZone(
    val name: String,
    val minPaceSeconds: Int, // seconds per km
    val maxPaceSeconds: Int,
    val description: String
) {
    fun getPaceRangeString(): String {
        val minMin = minPaceSeconds / 60
        val minSec = minPaceSeconds % 60
        val maxMin = maxPaceSeconds / 60
        val maxSec = maxPaceSeconds % 60
        return "${minMin}:${minSec.toString().padStart(2, '0')}-${maxMin}:${maxSec.toString().padStart(2, '0')}/km"
    }
}

/**
 * Standard pace zones
 */
object PaceZones {
    val RECOVERY = PaceZone("Recovery", 420, 600, "Very easy, conversational pace")
    val EASY = PaceZone("Easy", 360, 420, "Comfortable, can hold conversation")
    val MARATHON = PaceZone("Marathon", 300, 360, "Hard but sustainable for hours")
    val THRESHOLD = PaceZone("Threshold", 270, 300, "Comfortably hard, can speak in sentences")
    val INTERVAL = PaceZone("Interval", 240, 270, "Hard effort, can speak a few words")
    val REPETITION = PaceZone("Repetition", 180, 240, "Very hard, speaking is difficult")
    val MAX = PaceZone("Max", 0, 180, "Maximum effort, cannot speak")

    fun getZoneForPace(paceSecondsPerKm: Int): PaceZone {
        return when {
            paceSecondsPerKm >= 420 -> RECOVERY
            paceSecondsPerKm >= 360 -> EASY
            paceSecondsPerKm >= 300 -> MARATHON
            paceSecondsPerKm >= 270 -> THRESHOLD
            paceSecondsPerKm >= 240 -> INTERVAL
            paceSecondsPerKm >= 180 -> REPETITION
            else -> MAX
        }
    }
}

/**
 * Convert pace string "mm:ss" to seconds
 */
fun paceToSeconds(pace: String): Int {
    return try {
        val parts = pace.split(":")
        if (parts.size == 2) {
            parts[0].toInt() * 60 + parts[1].toInt()
        } else 0
    } catch (e: Exception) {
        0
    }
}

/**
 * Convert seconds to pace string "mm:ss"
 */
fun secondsToPace(seconds: Int): String {
    val min = seconds / 60
    val sec = seconds % 60
    return "${min}:${sec.toString().padStart(2, '0')}"
}

/**
 * Convert meters per second to pace string
 */
fun speedToPace(metersPerSecond: Float): String {
    if (metersPerSecond <= 0) return "--:--"
    val secondsPerKm = (1000 / metersPerSecond).toInt()
    return secondsToPace(secondsPerKm)
}

/**
 * Calculate split time prediction
 */
fun predictSplitTime(
    targetPaceSecondsPerKm: Int,
    splitNumber: Int
): Long {
    return targetPaceSecondsPerKm * 1000L // milliseconds for 1km
}

/**
 * Check if runner is on track for target
 */
fun isOnTrack(
    currentDistanceKm: Double,
    currentDurationMs: Long,
    targetDistanceKm: Double,
    targetTimeMs: Long
): Boolean {
    if (targetDistanceKm <= 0 || targetTimeMs <= 0 || currentDistanceKm <= 0) return true

    val expectedTimeForDistance = (currentDistanceKm / targetDistanceKm) * targetTimeMs
    val buffer = expectedTimeForDistance * 0.1 // 10% buffer

    return currentDurationMs <= (expectedTimeForDistance + buffer)
}