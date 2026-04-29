package live.airuncoach.airuncoach.viewmodel

import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.network.model.GarminDataSummary
import live.airuncoach.airuncoach.network.model.UserProfileForAI
import live.airuncoach.airuncoach.service.BaselineComputationService
import kotlin.math.roundToInt

/**
 * Helper functions for building AI analysis requests with Garmin data.
 * Ensures null safety: only non-null data is included in prompts.
 * Includes 4-week baseline computation for personalized coaching.
 */

/**
 * Build a Garmin data summary for a run session.
 * Returns null if the run has no Garmin data to prevent null values
 * from being sent to the AI prompt.
 */
fun RunSession.buildGarminDataSummary(terrainSummary: String): GarminDataSummary? {
    // Only create summary if run has Garmin data
    if (!hasGarminData) return null
    
    return GarminDataSummary(
        hasGarminData = true,
        deviceName = garminDeviceName,
        
        // Running Dynamics — only include non-null values
        avgGroundContactTime = avgGroundContactTime,
        minGroundContactTime = minGroundContactTime,
        maxGroundContactTime = maxGroundContactTime,
        avgGroundContactBalance = avgGroundContactBalance,
        avgVerticalOscillation = avgVerticalOscillation,
        maxVerticalOscillation = maxVerticalOscillation,
        avgVerticalRatio = avgVerticalRatio,
        avgStrideLength = avgStrideLength,
        minStrideLength = minStrideLength,
        maxStrideLength = maxStrideLength,
        
        // Training metrics
        aerobicTrainingEffect = aerobicTrainingEffect,
        anaerobicTrainingEffect = anaerobicTrainingEffect,
        recoveryTimeMinutes = recoveryTimeMinutes,
        vo2MaxEstimate = vo2MaxEstimate,
        
        // Environmental
        avgAmbientPressure = avgAmbientPressure,
        avgBearing = if (bearingData?.isNotEmpty() == true) bearingData.average().toFloat() else null,
        
        // Summaries
        terrainSummary = terrainSummary,
        estimatedFatigue = estimateFatigue(this)
    )
}

/**
 * Compute a human-readable terrain summary from elevation data.
 * Returns description like "flat terrain" or "rolling with 150m elevation gain".
 */
fun computeTerrainSummary(session: RunSession): String {
    val gain = session.totalElevationGain
    val loss = session.totalElevationLoss
    
    return when {
        gain == 0.0 && loss == 0.0 -> "flat terrain"
        gain > 0.0 && loss == 0.0 -> "with ${gain.toInt()}m elevation gain"
        gain == 0.0 && loss > 0.0 -> "with ${loss.toInt()}m elevation loss"
        else -> "rolling with ${gain.toInt()}m gain and ${loss.toInt()}m loss"
    }
}

/**
 * Estimate fatigue level (0-100) from multiple biometric signals.
 * Uses:
 * - HR drift (increase over time)
 * - Vertical oscillation increase (form breakdown)
 * - Stride length decrease (energy depletion)
 * - Ground contact time increase (heavy legs)
 * - Time in zone (cumulative effort)
 */
fun estimateFatigue(session: RunSession): Int {
    if (!session.hasGarminData) return -1  // No data
    
    var fatigueScore = 0.0
    var factorCount = 0
    
    // HR drift — compute from heartRateData if available
    session.heartRateData?.let { hrData ->
        if (hrData.size >= 2) {
            val firstHalf = hrData.take(hrData.size / 2).average()
            val secondHalf = hrData.drop(hrData.size / 2).average()
            val drift = ((secondHalf - firstHalf) / firstHalf) * 100
            when {
                drift < 5 -> fatigueScore += 10
                drift < 15 -> fatigueScore += 30
                drift < 25 -> fatigueScore += 60
                else -> fatigueScore += 85
            }
            factorCount++
        }
    }
    
    // Vertical oscillation increase — form breakdown indicator
    session.avgVerticalOscillation?.let { avgVo ->
        session.maxVerticalOscillation?.let { maxVo ->
            if (avgVo == 0f) return@let
            val voIncrease = ((maxVo - avgVo) / avgVo) * 100
            when {
                voIncrease < 10 -> fatigueScore += 15
                voIncrease < 25 -> fatigueScore += 40
                else -> fatigueScore += 70
            }
            factorCount++
        }
    }
    
    // Ground contact time increase — heavy legs indicator
    session.avgGroundContactTime?.let { avgGct ->
        session.maxGroundContactTime?.let { maxGct ->
            if (avgGct == 0f) return@let
            val gctIncrease = ((maxGct - avgGct) / avgGct) * 100
            when {
                gctIncrease < 10 -> fatigueScore += 20
                gctIncrease < 20 -> fatigueScore += 45
                else -> fatigueScore += 75
            }
            factorCount++
        }
    }
    
    // Stride length decrease — energy depletion
    session.avgStrideLength?.let { avgStride ->
        session.minStrideLength?.let { minStride ->
            if (avgStride == 0f) return@let
            val strideDecrease = ((avgStride - minStride) / avgStride) * 100
            when {
                strideDecrease < 5 -> fatigueScore += 15
                strideDecrease < 15 -> fatigueScore += 40
                else -> fatigueScore += 70
            }
            factorCount++
        }
    }
    
    // Duration-based fatigue — longer runs = more fatigue
    val durationMinutes = (session.duration / 60000).toInt()
    when {
        durationMinutes < 30 -> fatigueScore += 10
        durationMinutes < 60 -> fatigueScore += 30
        durationMinutes < 90 -> fatigueScore += 50
        durationMinutes < 120 -> fatigueScore += 70
        else -> fatigueScore += 85
    }
    factorCount++
    
    // Average the scores (0-100)
    val finalScore = if (factorCount > 0) {
        (fatigueScore / factorCount).roundToInt()
    } else {
        0
    }
    
    return finalScore.coerceIn(0, 100)
}

/**
 * Extract key Garmin insights from an AI response for appending to user profile.
 * Looks for sentences about form, efficiency, training load, etc.
 *
 * Example input: "Your ground contact time of 245ms is excellent, showing efficient running form..."
 * Example output: "Ground contact time around 245ms, showing excellent form. Training load moderate."
 */
fun extractGarminInsights(aiResponse: String, hasGarminData: Boolean): String {
    if (!hasGarminData || aiResponse.isBlank()) return ""
    
    val insights = mutableListOf<String>()
    
    // Extract GCT insight
    if (aiResponse.contains("ground contact", ignoreCase = true)) {
        val gctMatch = Regex(
            "ground contact time[^.]*?(\\d{2,3})\\s*m?s",
            RegexOption.IGNORE_CASE
        ).find(aiResponse)
        if (gctMatch != null) {
            val gctValue = gctMatch.groupValues[1]
            insights.add("Ground contact time around ${gctValue}ms")
        }
    }
    
    // Extract vertical oscillation insight
    if (aiResponse.contains("vertical oscillation", ignoreCase = true)) {
        val voMatch = Regex(
            "vertical oscillation[^.]*?(\\d+\\.?\\d*)\\s*c?m",
            RegexOption.IGNORE_CASE
        ).find(aiResponse)
        if (voMatch != null) {
            val voValue = voMatch.groupValues[1]
            insights.add("Vertical oscillation around ${voValue}cm")
        }
    }
    
    // Extract stride insight
    if (aiResponse.contains("stride length", ignoreCase = true)) {
        val strideMatch = Regex(
            "stride length[^.]*?(\\d+\\.?\\d*)\\s*m",
            RegexOption.IGNORE_CASE
        ).find(aiResponse)
        if (strideMatch != null) {
            val strideValue = strideMatch.groupValues[1]
            insights.add("Stride length typically ${strideValue}m")
        }
    }
    
    // Extract VO2 Max insight
    if (aiResponse.contains("VO2 Max", ignoreCase = true)) {
        val vo2Match = Regex(
            "VO2\\s*Max[^.]*?(\\d{2})\\s*ml",
            RegexOption.IGNORE_CASE
        ).find(aiResponse)
        if (vo2Match != null) {
            val vo2Value = vo2Match.groupValues[1]
            insights.add("Recent VO2 Max estimate: ${vo2Value}ml/kg/min")
        }
    }
    
    // Extract training effect insight
    if (aiResponse.contains("training effect", ignoreCase = true) ||
        aiResponse.contains("training load", ignoreCase = true)
    ) {
        val teMatch = Regex(
            "(?:training effect|training load)[^.]*?(\\w+)\\s*(?:training effect|load)",
            RegexOption.IGNORE_CASE
        ).find(aiResponse)
        if (teMatch != null) {
            val loadLevel = when (teMatch.groupValues[1].lowercase()) {
                "high" -> "strong"
                "moderate" -> "moderate"
                "low" -> "light"
                else -> "solid"
            }
            insights.add("Training load $loadLevel")
        }
    }
    
    // Join unique insights
    return insights.distinct().take(3).joinToString(". ") + if (insights.isNotEmpty()) "." else ""
}

/**
 * Update user's "What I know about you" with new Garmin insights.
 * Replaces old Garmin insights (if any) with new ones.
 *
 * Example:
 * Before: "John is a morning runner. [From Garmin] Ground contact time 240ms..."
 * After: "John is a morning runner. [From Garmin] Ground contact time 245ms..."
 */
fun updateWhatIKnowAboutYou(
    existingProfile: String,
    newGarminInsights: String,
    previousGarminInsights: String?
): String {
    // If we have old Garmin insights, remove them
    val baseProfile = if (previousGarminInsights != null && previousGarminInsights.isNotEmpty()) {
        val escapedInsights = Regex.escape(previousGarminInsights)
        val pattern = Regex(
            "\\[From Garmin\\]\\s*$escapedInsights\\s*",
            RegexOption.IGNORE_CASE
        )
        existingProfile.replace(pattern, "").trim()
    } else {
        existingProfile.trim()
    }
    
    // Append new Garmin insights if we have them
    return if (newGarminInsights.isNotEmpty()) {
        val separator = if (baseProfile.isNotEmpty()) "\n\n" else ""
        "$baseProfile$separator[From Garmin Watch Data] $newGarminInsights"
    } else {
        baseProfile
    }
}

/**
 * Build user profile context with 4-week baselines for elite personalized coaching.
 * 
 * This ensures AI coaching is personalized to THIS runner's patterns, not generic.
 * Each runner has unique metrics - what's "normal" for one isn't for another.
 */
fun buildUserProfileContextWithBaselines(
    userId: String,
    whatIKnowAboutYou: String,
    recentRuns: List<RunSession>
): UserProfileForAI {
    // Compute 4-week rolling baselines
    val baseline = BaselineComputationService.computeBaseline(recentRuns)
    
    // Build context string with baseline info and delta comparisons
    val baselineContext = if (baseline.sampleCount > 0) {
        """
        
        ## RUNNER'S 4-WEEK BASELINES (from ${baseline.sampleCount} runs)
        ${BaselineComputationService.generateBaselineContext(baseline)}
        
        These are this runner's typical metrics. Use these as reference points.
        Deviations from these baselines indicate real changes in performance.
        """.trimIndent()
    } else {
        "\n\n## NO BASELINE AVAILABLE\nThis is the runner's early running data. No 4-week average yet."
    }
    
    // Return populated profile with real baselines
    return UserProfileForAI(
        userId = userId,
        whatIKnowAboutYou = whatIKnowAboutYou + baselineContext,
        garminInsights = "",
        baselineGCT = baseline.groundContactTime?.toFloat(),
        baselineVO = baseline.verticalOscillation?.toFloat(),
        baselineStride = baseline.strideLength?.toFloat(),
        baselineCadence = baseline.cadence
    )
}
