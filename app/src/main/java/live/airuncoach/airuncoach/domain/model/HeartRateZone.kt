package live.airuncoach.airuncoach.domain.model

/**
 * Heart Rate Training Zones with descriptions, pace guidance, and effort levels
 */
data class HeartRateZoneInfo(
    val zone: Int,              // 1-5
    val name: String,           // Zone 1, Zone 2, etc
    val hrPercentMin: Int,      // % of max HR
    val hrPercentMax: Int,
    val description: String,    // What it feels like
    val paceGuidance: String,   // e.g., "Very easy pace - brisk walk to easy jog"
    val benefits: String,       // What you build in this zone
    val effort: String          // Easy, Moderate, Hard, etc
)

object HeartRateZones {
    fun getMaxHeartRate(age: Int): Int {
        // More accurate Karvonen formula would use resting HR
        // For now, use standard 220 - age as fallback
        return 220 - age
    }

    fun getZoneInfo(zone: Int): HeartRateZoneInfo {
        return when (zone) {
            1 -> HeartRateZoneInfo(
                zone = 1,
                name = "Zone 1: Active Recovery",
                hrPercentMin = 50,
                hrPercentMax = 60,
                description = "Very easy, restorative running. Perfect for recovery days and easy warm-ups.",
                paceGuidance = "Very easy pace - brisk walk to light jog. You should feel relaxed and energized.",
                benefits = "Promotes blood flow, aids recovery, builds aerobic base without stress",
                effort = "Very Easy"
            )
            2 -> HeartRateZoneInfo(
                zone = 2,
                name = "Zone 2: Endurance/Aerobic",
                hrPercentMin = 60,
                hrPercentMax = 70,
                description = "Comfortable, sustainable pace. The \"talk test\" zone - you can hold a conversation.",
                paceGuidance = "Gentle jog - easy conversational pace. Could hold a full conversation without gasping.",
                benefits = "Builds aerobic base, improves fat burning, increases capillary density, foundation for all running",
                effort = "Easy"
            )
            3 -> HeartRateZoneInfo(
                zone = 3,
                name = "Zone 3: Tempo/Threshold",
                hrPercentMin = 70,
                hrPercentMax = 80,
                description = "Challenging but sustainable. Can speak in short sentences only.",
                paceGuidance = "Steady tempo - moderate pace. Can speak but feel effort. Breathy but controlled.",
                benefits = "Increases lactate threshold, improves running economy, builds mental toughness",
                effort = "Moderate to Hard"
            )
            4 -> HeartRateZoneInfo(
                zone = 4,
                name = "Zone 4: VO2 Max",
                hrPercentMin = 80,
                hrPercentMax = 90,
                description = "Hard effort, near race pace. Speaking only in single words.",
                paceGuidance = "Fast pace - race effort. Can only say single words. Breathing is heavy and controlled.",
                benefits = "Increases VO2 max, improves aerobic capacity, builds speed and power",
                effort = "Hard"
            )
            5 -> HeartRateZoneInfo(
                zone = 5,
                name = "Zone 5: Maximum Effort",
                hrPercentMin = 90,
                hrPercentMax = 100,
                description = "Maximum intensity, all-out sprint effort. No talking.",
                paceGuidance = "Sprint pace - maximal effort. Breathing maximal, cannot speak at all.",
                benefits = "Peak performance, builds top-end speed, high intensity interval training",
                effort = "Maximum"
            )
            else -> getZoneInfo(2) // Default to Zone 2
        }
    }

    fun getAllZones(): List<HeartRateZoneInfo> {
        return (1..5).map { getZoneInfo(it) }
    }

    /**
     * Calculate target HR zone range for a given zone
     */
    fun getTargetHRRange(zone: Int, maxHR: Int): IntRange {
        val zoneInfo = getZoneInfo(zone)
        val minHR = (maxHR * zoneInfo.hrPercentMin / 100.0).toInt()
        val maxHRZone = (maxHR * zoneInfo.hrPercentMax / 100.0).toInt()
        return minHR..maxHRZone
    }

    /**
     * Estimate zone 2 pace based on user's fitness level and max heart rate
     * Returns pace in min/km
     */
    fun estimateZone2Pace(
        maxHeartRate: Int,
        age: Int,
        fitnessLevel: String // "beginner", "intermediate", "advanced"
    ): Double {
        // Zone 2 is 60-70% of max HR
        val zone2HR = maxHeartRate * 0.65 // midpoint of zone 2

        // Base pace multiplier varies by fitness
        val paceMultiplier = when (fitnessLevel.lowercase()) {
            "beginner" -> 1.3    // 10-11 min/km
            "intermediate" -> 1.0 // 7-8 min/km
            "advanced" -> 0.85   // 5.5-6.5 min/km
            else -> 1.0
        }

        // Rough estimate: younger/fitter = faster zone 2
        val ageFactor = (40.0 / age) * 0.5 + 0.75
        return paceMultiplier * ageFactor
    }
}
