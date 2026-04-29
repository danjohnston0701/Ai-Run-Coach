@file:Suppress("UNUSED")

package live.airuncoach.airuncoach.ui.extensions

import live.airuncoach.airuncoach.domain.model.RunSession
import kotlin.math.pow

/**
 * Extension functions to extract data series from RunSession for graph rendering.
 * These helpers safely handle null data and provide formatted pairs for visualization.
 * 
 * Note: All functions will be used by graph implementations in Phase 1-3 of Sprint 2.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// HEART RATE DATA EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get heart rate data points over time.
 * @return List of (timeSeconds, heartRate) pairs, empty if no data
 */
fun RunSession.getHeartRateOverTime(): List<Pair<Int, Int>> {
    if (heartRateData == null || heartRateData.isEmpty()) {
        return emptyList()
    }
    
    val totalSeconds = elapsedTime ?: return emptyList()
    val timePerSample = (totalSeconds / heartRateData.size).toInt()
    
    return heartRateData.mapIndexed { index, hr ->
        val timeSeconds = index * timePerSample
        Pair(timeSeconds.toInt(), hr)
    }
}

/**
 * Get heart rate data points over distance.
 * @return List of (distanceKm, heartRate) pairs, empty if no GPS data
 */
fun RunSession.getHeartRateOverDistance(): List<Pair<Double, Int>> {
    if (heartRateData == null || heartRateData.isEmpty()) {
        return emptyList()
    }
    
    val distanceKm = (distance / 1000.0)
    val distancePerSample = distanceKm / heartRateData.size
    
    return heartRateData.mapIndexed { index, hr ->
        val currentDistanceKm = index * distancePerSample
        Pair(currentDistanceKm, hr)
    }
}

/**
 * Get heart rate zone distribution as percentages.
 * Uses user's max heart rate to compute zones.
 * @return Map of zone labels to percentage time (Z1, Z2, Z3, Z4, Z5)
 */
fun RunSession.getHeartRateZoneDistribution(): Map<String, Float> {
    if (heartRateData == null || heartRateData.isEmpty()) {
        return mapOf("Z1" to 0f, "Z2" to 0f, "Z3" to 0f, "Z4" to 0f, "Z5" to 0f)
    }
    
    // Get max heart rate from run (or estimate)
    val maxHr = heartRateData.maxOrNull() ?: 180
    val minHr = heartRateData.minOrNull() ?: 120
    
    // Standard zone percentages of max
    val z1Max = maxHr * 0.50f
    val z2Max = maxHr * 0.60f
    val z3Max = maxHr * 0.75f
    val z4Max = maxHr * 0.85f
    
    val zoneCounts = mutableMapOf(
        "Z1" to 0, "Z2" to 0, "Z3" to 0, "Z4" to 0, "Z5" to 0
    )
    
    heartRateData.forEach { hr ->
        val zone = when {
            hr <= z1Max -> "Z1"
            hr <= z2Max -> "Z2"
            hr <= z3Max -> "Z3"
            hr <= z4Max -> "Z4"
            else -> "Z5"
        }
        zoneCounts[zone] = (zoneCounts[zone] ?: 0) + 1
    }
    
    val total = heartRateData.size.toFloat()
    return zoneCounts.mapValues { (_, count) -> (count / total) * 100f }
}

/**
 * Get heart rate data points vs elevation.
 * @return List of (elevationM, heartRate, grade%) triples
 */
fun RunSession.getHeartRateVsElevation(): List<Triple<Double, Int, Double>> {
    if (heartRateData == null || heartRateData.isEmpty() || altitudeData == null) {
        return emptyList()
    }
    
    if (altitudeData.isEmpty()) {
        return heartRateData.mapIndexed { index, hr ->
            Triple(0.0, hr, 0.0)
        }
    }
    
    val minAltitude = altitudeData.minOrNull()?.toDouble() ?: 0.0
    val distanceKm = (distance / 1000.0)
    val distancePerSample = distanceKm / heartRateData.size
    
    return heartRateData.mapIndexed { index, hr ->
        val altitude = if (index < altitudeData.size) altitudeData[index].toDouble() else minAltitude
        val grade = if (index > 0 && index < altitudeData.size) {
            val prevAltitude = altitudeData[index - 1].toDouble()
            val altDiff = altitude - prevAltitude
            val distanceM = distancePerSample * 1000
            if (distanceM > 0) (altDiff / distanceM) * 100 else 0.0
        } else {
            0.0
        }
        
        Triple(altitude, hr, grade)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUNNING DYNAMICS DATA EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get ground contact time data over distance.
 * @return List of (distanceKm, gctMs) pairs
 */
fun RunSession.getGroundContactTimeOverDistance(): List<Pair<Double, Int>> {
    // Note: This requires GCT time-series data from watch
    // Until implemented in RunSession, return empty
    return emptyList()
}

/**
 * Get vertical oscillation data over distance.
 * @return List of (distanceKm, voCm) pairs
 */
fun RunSession.getVerticalOscillationOverDistance(): List<Pair<Double, Double>> {
    // Note: This requires VO time-series data from watch
    return emptyList()
}

/**
 * Get stride length data over distance.
 * @return List of (distanceKm, strideM) pairs
 */
fun RunSession.getStrideLengthOverDistance(): List<Pair<Double, Double>> {
    // Note: This requires stride time-series data from watch
    return emptyList()
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get average heart rate by km segment.
 * @return List of (kmNumber, avgHr) pairs
 */
fun RunSession.getHeartRateByKmSegment(): List<Pair<Int, Int>> {
    if (heartRateData == null || heartRateData.isEmpty()) {
        return emptyList()
    }
    
    val distanceKm = (distance / 1000.0).toInt().coerceAtLeast(1)
    val samplesPerKm = heartRateData.size / distanceKm
    
    return (0 until distanceKm).map { km ->
        val startIndex = (km * samplesPerKm).toInt()
        val endIndex = ((km + 1) * samplesPerKm).toInt().coerceAtMost(heartRateData.size - 1)
        
        if (startIndex < heartRateData.size && endIndex >= startIndex) {
            val avgHr = heartRateData.subList(startIndex, endIndex + 1).average().toInt()
            Pair(km, avgHr)
        } else {
            Pair(km, 0)
        }
    }
}

/**
 * Get average heart rate by time segment (5-minute intervals).
 * @return List of (minuteNumber, avgHr) pairs
 */
fun RunSession.getHeartRateBy5MinSegment(): List<Pair<Int, Int>> {
    if (heartRateData == null || heartRateData.isEmpty()) {
        return emptyList()
    }
    
    val totalMinutes = (elapsedTime ?: 0L) / 60
    val segmentSize = (heartRateData.size / ((totalMinutes / 5f) + 1)).toInt().coerceAtLeast(1)
    
    return (0..totalMinutes.toInt() step 5).map { minute ->
        val startIndex = ((minute / 5) * segmentSize)
        val endIndex = (((minute + 5) / 5) * segmentSize).coerceAtMost(heartRateData.size - 1)
        
        if (startIndex < heartRateData.size && endIndex >= startIndex) {
            val avgHr = heartRateData.subList(startIndex, endIndex + 1).average().toInt()
            Pair(minute, avgHr)
        } else {
            Pair(minute, 0)
        }
    }
}

/**
 * Detect heart rate drift (increase over time).
 * @return Pair of (initialAvgHr, finalAvgHr)
 */
fun RunSession.getHeartRateDrift(): Pair<Int, Int>? {
    if (heartRateData == null || heartRateData.isEmpty()) {
        return null
    }
    
    val quarterPoint = heartRateData.size / 4
    val initialAvg = heartRateData.take(quarterPoint).average().toInt()
    val finalAvg = heartRateData.drop(heartRateData.size - quarterPoint).average().toInt()
    
    return Pair(initialAvg, finalAvg)
}

/**
 * Get heart rate variability (standard deviation).
 * @return Standard deviation in bpm
 */
fun RunSession.getHeartRateVariability(): Double {
    if (heartRateData == null || heartRateData.isEmpty()) {
        return 0.0
    }
    
    val avg = heartRateData.average()
    val variance = heartRateData.map { (it - avg).pow(2) }.average()
    return kotlin.math.sqrt(variance)
}

/**
 * Check if heart rate data is stable (low variance).
 * @return true if variance is within normal range
 */
fun RunSession.isHeartRateStable(): Boolean {
    val variability = getHeartRateVariability()
    return variability < 10.0 // Less than 10 bpm standard deviation = stable
}

/**
 * Get warm-up efficiency (time to reach target HR).
 * @return Seconds to reach 80% of average HR
 */
fun RunSession.getWarmupTime(): Int {
    if (heartRateData == null || heartRateData.isEmpty()) {
        return 0
    }
    
    val avgHr = heartRateData.average()
    val targetHr = avgHr * 0.80
    
    val totalSeconds = elapsedTime ?: return 0
    val timePerSample = (totalSeconds / heartRateData.size).toInt()
    val reachedIndex = heartRateData.indexOfFirst { it >= targetHr }
    
    return if (reachedIndex >= 0) {
        reachedIndex * timePerSample
    } else {
        totalSeconds.toInt()
    }
}
