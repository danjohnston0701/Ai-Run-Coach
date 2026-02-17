package live.airuncoach.airuncoach.analytics

import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.domain.model.RunSession
import kotlin.math.abs

/* ------------------------------------------------------------ */
/* Efficiency Score */
/* ------------------------------------------------------------ */

fun calculateEfficiencyScore(routePoints: List<LocationPoint>): Float {
    if (routePoints.isEmpty()) return 0f

    // Placeholder logic until HR integration exists
    return 0.75f
}

/* ------------------------------------------------------------ */
/* Split Analysis */
/* ------------------------------------------------------------ */

data class SplitAnalysisResult(
    val firstHalfAvg: String,
    val secondHalfAvg: String,
    val type: SplitType,
    val verdict: String,
    val recommendation: String
)

enum class SplitType {
    NEGATIVE, POSITIVE, EVEN
}

fun analyzeSplits(kmSplits: List<KmSplit>): SplitAnalysisResult {
    if (kmSplits.size < 2) {
        return SplitAnalysisResult(
            firstHalfAvg = "--",
            secondHalfAvg = "--",
            type = SplitType.EVEN,
            verdict = "Insufficient data",
            recommendation = ""
        )
    }

    val midpoint = kmSplits.size / 2
    val firstHalf = kmSplits.take(midpoint)
    val secondHalf = kmSplits.drop(midpoint)

    val firstAvg = firstHalf.map { it.time }.average()
    val secondAvg = secondHalf.map { it.time }.average()

    val diffPercent = ((secondAvg - firstAvg) / firstAvg * 100).toFloat()

    val type = when {
        diffPercent < -2 -> SplitType.NEGATIVE
        diffPercent > 2 -> SplitType.POSITIVE
        else -> SplitType.EVEN
    }

    val verdict = when (type) {
        SplitType.NEGATIVE -> "Negative Split 🎉"
        SplitType.POSITIVE -> "Positive Split"
        SplitType.EVEN -> "Even Pacing"
    }

    val recommendation = when (type) {
        SplitType.NEGATIVE -> "Excellent pacing — strong finish."
        SplitType.POSITIVE -> "Consider starting slightly slower."
        SplitType.EVEN -> "Very consistent effort."
    }

    return SplitAnalysisResult(
        firstHalfAvg = formatTime(firstAvg.toLong()),
        secondHalfAvg = formatTime(secondAvg.toLong()),
        type = type,
        verdict = verdict,
        recommendation = recommendation
    )
}

/* ------------------------------------------------------------ */
/* Fatigue Index */
/* ------------------------------------------------------------ */

fun calculateFatigueIndex(kmSplits: List<KmSplit>): Float {
    if (kmSplits.size < 2) return 0f

    val fastest = kmSplits.minOf { it.time }
    val slowest = kmSplits.maxOf { it.time }

    return ((slowest - fastest) / fastest.toFloat() * 100)
}

/* ------------------------------------------------------------ */
/* Training Load */
/* ------------------------------------------------------------ */

fun calculateTrainingLoad(runSession: RunSession): Int {
    val durationMinutes = runSession.duration / 1000 / 60
    val distanceKm = runSession.distance / 1000

    val intensity = when {
        runSession.heartRate > 170 -> 1.5f
        runSession.heartRate > 150 -> 1.2f
        else -> 1.0f
    }

    return (durationMinutes * intensity * distanceKm).toInt()
}

/* ------------------------------------------------------------ */
/* VO2 Max */
/* ------------------------------------------------------------ */

fun estimateVO2Max(runSession: RunSession, age: Int): Float {
    val hours = runSession.duration / 1000.0 / 3600.0
    if (hours <= 0.0) return 0f

    val speedKmh = (runSession.distance / 1000) / hours
    return (speedKmh * 3.5f + 15f).toFloat()
}

fun getFitnessLevel(vo2Max: Float, age: Int): String {
    return when {
        vo2Max > 50 -> "Excellent"
        vo2Max > 40 -> "Good"
        vo2Max > 35 -> "Average"
        else -> "Below Average"
    }
}

/* ------------------------------------------------------------ */
/* Effort Zones */
/* ------------------------------------------------------------ */

fun calculateEffortZones(routePoints: List<LocationPoint>): List<Pair<String, Float>> {
    // Placeholder until HR zones implemented
    return listOf(
        "Easy" to 0.3f,
        "Moderate" to 0.5f,
        "Hard" to 0.15f,
        "Max" to 0.05f
    )
}

/* ------------------------------------------------------------ */
/* Utilities */
/* ------------------------------------------------------------ */

private fun formatTime(millis: Long): String {
    val totalSeconds = millis / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format("%d:%02d", minutes, seconds)
}
