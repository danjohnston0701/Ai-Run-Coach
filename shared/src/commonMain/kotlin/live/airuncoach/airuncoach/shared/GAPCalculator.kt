package live.airuncoach.airuncoach.shared

import kotlin.math.abs
import kotlin.math.pow

/**
 * GAP - GRADE ADJUSTED PACE
 * Critical for trail runners - adjusts pace based on elevation
 *
 * Running uphill is harder than flat pace suggests
 * Running downhill is easier than flat pace suggests
 * GAP normalizes this for accurate effort comparison
 */
object GAPCalculator {

    /**
     * Calculate Grade Adjusted Pace for a run
     *
     * @param distance Total distance in meters
     * @param duration Total duration in milliseconds
     * @param elevationGain Total elevation gain in meters
     * @param elevationLoss Total elevation loss in meters
     * @return GAP in format "mm:ss" per km
     */
    fun calculateGAP(
        distance: Double,
        duration: Long,
        elevationGain: Double,
        elevationLoss: Double
    ): String {
        if (distance <= 0 || duration <= 0) return "0:00"

        // Calculate actual pace (seconds per km)
        val actualPaceSecondsPerKm = (duration / 1000.0) / (distance / 1000.0)

        // Calculate average gradient
        val avgGradient = ((elevationGain - elevationLoss) / distance) * 100

        // Apply grade adjustment
        val adjustmentFactor = getGradeAdjustmentFactor(avgGradient.toFloat())
        val gapSecondsPerKm = actualPaceSecondsPerKm / adjustmentFactor

        // Format as mm:ss
        val minutes = (gapSecondsPerKm / 60).toInt()
        val seconds = (gapSecondsPerKm % 60).toInt()

        return "${minutes}:${seconds.toString().padStart(2, '0')}"
    }

    /**
     * Calculate GAP for a specific point/segment
     */
    fun calculateGAPForSegment(
        distanceMeters: Double,
        durationMs: Long,
        gradient: Float
    ): String {
        if (distanceMeters <= 0 || durationMs <= 0) return "0:00"

        val actualPaceSecondsPerKm = (durationMs / 1000.0) / (distanceMeters / 1000.0)
        val adjustmentFactor = getGradeAdjustmentFactor(gradient)
        val gapSecondsPerKm = actualPaceSecondsPerKm / adjustmentFactor

        val minutes = (gapSecondsPerKm / 60).toInt()
        val seconds = (gapSecondsPerKm % 60).toInt()

        return "${minutes}:${seconds.toString().padStart(2, '0')}"
    }

    /**
     * Get pace adjustment factor based on grade
     *
     * Formula based on Minetti et al. (2002) - energy cost of running on different grades
     *
     * @param gradient Grade as percentage (positive = uphill, negative = downhill)
     * @return Adjustment factor (multiply pace by this)
     */
    private fun getGradeAdjustmentFactor(gradient: Float): Double {
        val g = gradient / 100.0 // Convert percentage to decimal

        val energyCost = (155.4 * g.pow(5.0)) -
                        (30.4 * g.pow(4.0)) -
                        (43.3 * g.pow(3.0)) +
                        (46.3 * g.pow(2.0)) +
                        (19.5 * g) +
                        3.6

        // Baseline flat running energy cost
        val flatCost = 3.6

        // Adjustment factor
        return energyCost / flatCost
    }

    /**
     * Get simple grade adjustment (simplified version)
     * Rule of thumb: +10 sec/km per 1% uphill, -5 sec/km per 1% downhill
     */
    fun getSimpleGradeAdjustment(gradient: Float): Int {
        return when {
            gradient > 0 -> (gradient * 10).toInt()
            gradient < 0 -> (abs(gradient) * 5).toInt()
            else -> 0
        }
    }

    /**
     * Calculate equivalent flat pace
     * "Your uphill pace of 6:00/km is equivalent to 5:20/km on flat ground"
     */
    fun getEquivalentFlatPace(
        actualPace: String,
        gradient: Float
    ): String {
        try {
            val parts = actualPace.split(":")
            if (parts.size != 2) return actualPace

            val minutes = parts[0].toInt()
            val seconds = parts[1].toInt()
            val totalSeconds = minutes * 60 + seconds

            val adjustmentFactor = getGradeAdjustmentFactor(gradient)
            val equivalentSeconds = totalSeconds / adjustmentFactor

            val newMinutes = (equivalentSeconds / 60).toInt()
            val newSeconds = (equivalentSeconds % 60).toInt()

            return "${newMinutes}:${newSeconds.toString().padStart(2, '0')}"
        } catch (e: Exception) {
            return actualPace
        }
    }

    /**
     * Determine effort level based on gradient
     */
    fun getEffortLevel(gradient: Float): EffortLevel {
        return when {
            gradient > 15 -> EffortLevel.EXTREME
            gradient > 10 -> EffortLevel.VERY_HARD
            gradient > 5 -> EffortLevel.HARD
            gradient > 2 -> EffortLevel.MODERATE
            gradient > -2 -> EffortLevel.EASY
            gradient > -5 -> EffortLevel.DOWNHILL_RECOVERY
            else -> EffortLevel.STEEP_DOWNHILL
        }
    }

    enum class EffortLevel(val description: String) {
        EXTREME("Extreme climb - walking expected"),
        VERY_HARD("Very hard climb"),
        HARD("Hard climb"),
        MODERATE("Moderate uphill"),
        EASY("Flat/rolling"),
        DOWNHILL_RECOVERY("Easy downhill"),
        STEEP_DOWNHILL("Steep downhill - quad burner")
    }

    /**
     * Calculate pace impact description
     */
    fun getPaceImpactDescription(gradient: Float): String {
        val adjustment = getSimpleGradeAdjustment(gradient)
        return when {
            gradient > 5 -> "This climb adds ~${adjustment}s/km to your pace"
            gradient > 2 -> "This uphill adds ~${adjustment}s/km"
            gradient < -5 -> "This downhill makes pace ${adjustment}s/km faster"
            gradient < -2 -> "Slight downhill advantage"
            else -> "Relatively flat terrain"
        }
    }
}