package live.airuncoach.airuncoach.domain.model

/**
 * Analyzes user's actual running history to detect their personal Zone 2 pace
 * instead of relying solely on theoretical calculations
 */
object Zone2PaceDetector {
    
    /**
     * Calculate Zone 2 pace from completed runs
     * Analyzes slower/easier runs (identified by lower average pace) to detect Zone 2
     */
    fun detectZone2PaceFromRuns(
        completedRuns: List<RunSession>,
        userAge: Int,
        fitnessLevel: String
    ): Double? {
        // Filter runs with valid distance and duration data
        val runsWithData = completedRuns.filter { run ->
            run.distance > 0 && run.duration > 0
        }
        
        if (runsWithData.isEmpty()) {
            // No valid runs found, return null to fall back to theoretical calculation
            return null
        }
        
        // Calculate pace (min/km) for each run
        val paces = runsWithData.mapNotNull { run ->
            if (run.distance > 0) {
                val durationMinutes = run.duration / (1000.0 * 60.0)
                durationMinutes / (run.distance / 1000.0)  // convert distance from meters to km
            } else null
        }.sorted()
        
        // Zone 2 is the easy/sustainable pace
        // Take the average of the slowest 30% of runs (these are likely easy runs)
        return if (paces.isNotEmpty()) {
            val easyRunsCount = (paces.size * 0.3).toInt().coerceAtLeast(1)
            val slowestPaces = paces.takeLast(easyRunsCount)
            slowestPaces.average()
        } else null
    }
    
    /**
     * Analyze all runs to understand user's fitness level and capabilities
     * Returns estimated max heart rate based on running data
     */
    fun estimateMaxHeartRateFromRunData(
        completedRuns: List<RunSession>
    ): Int? {
        // Look for the fastest pace (likely in an interval or tempo run)
        // Faster pace = higher heart rate
        val runsWithData = completedRuns.filter { run ->
            run.distance > 0 && run.duration > 0
        }
        
        if (runsWithData.isEmpty()) return null
        
        // Calculate pace for each run
        val paces = runsWithData.mapNotNull { run ->
            if (run.distance > 0) {
                val durationMinutes = run.duration / (1000.0 * 60.0)
                durationMinutes / (run.distance / 1000.0)  // convert meters to km
            } else null
        }
        
        val fastestPace = paces.minOrNull() ?: return null
        
        // Use a rough correlation: faster pace = higher intensity = higher HR
        // This is a heuristic - ideally we'd have actual HR data
        // For each minute/km faster than 6:00 pace, assume +5 bpm from base
        val baseMaxHR = 190 // Conservative estimate
        val paceDecrement = (6.0 - fastestPace).coerceAtLeast(0.0)
        val adjustedMaxHR = (baseMaxHR + (paceDecrement * 5)).toInt().coerceIn(160, 220)
        
        return adjustedMaxHR
    }
    
    /**
     * Get personalized Zone 2 pace range with confidence level
     */
    fun getPersonalizedZone2Range(
        completedRuns: List<RunSession>,
        userAge: Int,
        fitnessLevel: String
    ): Zone2PaceRange {
        val detectedPace = detectZone2PaceFromRuns(completedRuns, userAge, fitnessLevel)
        
        return if (detectedPace != null) {
            // We have real data - high confidence
            Zone2PaceRange(
                minPace = detectedPace - 0.3,  // 18 seconds slower per km
                maxPace = detectedPace + 0.3,  // 18 seconds faster per km
                recommendedPace = detectedPace,
                confidence = "High",
                basedOn = "Your actual easy run data (${completedRuns.size} runs analyzed)",
                description = "This is based on your actual running history. Zone 2 should feel conversational and sustainable."
            )
        } else {
            // Fall back to theoretical calculation
            val theoreticalPace = HeartRateZones.estimateZone2Pace(220 - userAge, userAge, fitnessLevel)
            Zone2PaceRange(
                minPace = theoreticalPace - 0.5,
                maxPace = theoreticalPace + 0.5,
                recommendedPace = theoreticalPace,
                confidence = "Medium",
                basedOn = "Your profile (age: $userAge, fitness level: $fitnessLevel)",
                description = "This is an estimate based on your profile. As you complete more easy runs, we'll learn your actual Zone 2 pace."
            )
        }
    }
}

/**
 * Represents a Zone 2 pace range with confidence information
 */
data class Zone2PaceRange(
    val minPace: Double,          // min/km
    val maxPace: Double,          // min/km
    val recommendedPace: Double,  // min/km
    val confidence: String,       // "High", "Medium", "Low"
    val basedOn: String,          // "Your actual data" or "Profile estimate"
    val description: String       // User-friendly explanation
)
