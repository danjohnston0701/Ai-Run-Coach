package live.airuncoach.airuncoach.shared

/**
 * FITNESS & FRESHNESS (Strava's PMC - Performance Management Chart)
 * The gold standard for training load visualization
 */

private const val CTL_DAYS = 42f  // Fitness time constant
private const val ATL_DAYS = 7f   // Fatigue time constant

/**
 * Calculate exponential moving average
 */
private fun calculateEMA(previousEMA: Float, todayTSS: Int, timeConstant: Float): Float {
    return previousEMA + (todayTSS - previousEMA) * (1 / timeConstant)
}

/**
 * Build fitness trend from historical runs
 */
fun calculateFitnessTrend(runs: List<RunWithTSS>): FitnessTrend {
    if (runs.isEmpty()) {
        return FitnessTrend(
            dailyMetrics = emptyList(),
            currentFitness = 0f,
            currentFatigue = 0f,
            currentForm = 0f,
            trainingStatus = TrainingStatus.DETRAINING,
            recommendations = listOf("Start building fitness with consistent runs")
        )
    }

    val dailyMetrics = mutableListOf<DailyFitness>()
    var ctl = 0f // Chronic Training Load (Fitness)
    var atl = 0f // Acute Training Load (Fatigue)

    // Sort runs by date
    val sortedRuns = runs.sortedBy { it.date }
    val firstDate = sortedRuns.first().date
    val lastDate = sortedRuns.last().date

    // Iterate through each day
    var currentDate = firstDate
    while (currentDate <= lastDate) {
        val todayRuns = sortedRuns.filter { it.date == currentDate }
        val todayTSS = todayRuns.sumOf { it.tss }

        // Update CTL and ATL
        ctl = calculateEMA(ctl, todayTSS, CTL_DAYS)
        atl = calculateEMA(atl, todayTSS, ATL_DAYS)
        val tsb = ctl - atl

        // Calculate ramp rate (safe is < 5)
        val rampRate = if (ctl > 0) todayTSS / ctl else 0f

        dailyMetrics.add(
            DailyFitness(
                date = currentDate,
                fitness = ctl,
                fatigue = atl,
                form = tsb,
                trainingLoad = todayTSS,
                rampRate = rampRate
            )
        )

        // Move to next day (simple increment for ISO date string)
        val parts = currentDate.split("-")
        val year = parts[0].toInt()
        val month = parts[1].toInt()
        val day = parts[2].toInt()

        currentDate = if (day < 28) {
            "$year-${month.toString().padStart(2, '0')}-${(day + 1).toString().padStart(2, '0')}"
        } else if (month < 12) {
            "$year-${(month + 1).toString().padStart(2, '0')}-01"
        } else {
            "${year + 1}-01-01"
        }
    }

    val current = dailyMetrics.last()
    val status = determineTrainingStatus(current.form)
    val recommendations = generateRecommendations(current, status)

    return FitnessTrend(
        dailyMetrics = dailyMetrics,
        currentFitness = current.fitness,
        currentFatigue = current.fatigue,
        currentForm = current.form,
        trainingStatus = status,
        recommendations = recommendations
    )
}

/**
 * Determine training status from form (TSB)
 */
private fun determineTrainingStatus(form: Float): TrainingStatus {
    return when {
        form < -30 -> TrainingStatus.OVERTRAINED
        form < -10 -> TrainingStatus.STRAINED
        form < 5 -> TrainingStatus.OPTIMAL
        form < 25 -> TrainingStatus.FRESH
        else -> TrainingStatus.DETRAINING
    }
}

/**
 * Generate training recommendations
 */
private fun generateRecommendations(
    current: DailyFitness,
    status: TrainingStatus
): List<String> {
    val recommendations = mutableListOf<String>()

    when (status) {
        TrainingStatus.OVERTRAINED -> {
            recommendations.add("⚠️ You're overtrained. Take 2-3 rest days immediately.")
            recommendations.add("Risk of injury is HIGH. Prioritize recovery.")
        }
        TrainingStatus.STRAINED -> {
            recommendations.add("Heavy training load. Schedule a rest day within 2 days.")
            recommendations.add("Consider an easy recovery run instead of hard workout.")
        }
        TrainingStatus.OPTIMAL -> {
            recommendations.add("Perfect form for a race or hard workout!")
            recommendations.add("Your fitness and freshness are balanced ideally.")
        }
        TrainingStatus.FRESH -> {
            recommendations.add("Well rested! Good time for a breakthrough workout.")
            recommendations.add("Consider a tempo run or intervals.")
        }
        TrainingStatus.DETRAINING -> {
            recommendations.add("You're losing fitness. Time to train!")
            recommendations.add("Add 2-3 runs this week to rebuild.")
        }
    }

    // Ramp rate warning
    if (current.rampRate > 5) {
        recommendations.add("⚠️ Training load increased too quickly. Reduce volume 20%.")
    }

    return recommendations
}

/**
 * Calculate injury risk
 */
fun calculateInjuryRisk(trend: FitnessTrend): InjuryRisk {
    val recentMetrics = trend.dailyMetrics.takeLast(7)

    // High ramp rate = injury risk
    val avgRampRate = recentMetrics.map { it.rampRate }.average()

    // Overtrained status
    val isOvertrained = trend.trainingStatus == TrainingStatus.OVERTRAINED

    return when {
        isOvertrained || avgRampRate > 8 -> InjuryRisk.CRITICAL
        avgRampRate > 6 -> InjuryRisk.HIGH
        avgRampRate > 4 -> InjuryRisk.MODERATE
        else -> InjuryRisk.LOW
    }
}

/**
 * Calculate Training Stress Score (TSS) for a single run
 *
 * TSS = (Duration in seconds × Normalized Power × Intensity Factor) / (FTP × 3600) × 100
 *
 * Simplified version using HR as intensity proxy
 */
fun calculateTSS(
    durationMinutes: Int,
    averageHeartRate: Int,
    maxHeartRate: Int,
    distanceKm: Double
): Int {
    if (maxHeartRate <= 0 || durationMinutes <= 0) return 0

    // Intensity Factor based on HR
    val intensityFactor = averageHeartRate.toFloat() / maxHeartRate

    // Duration in hours
    val durationHours = durationMinutes / 60.0

    // Simplified TSS calculation
    val tss = (durationHours * intensityFactor * 100).toInt()

    // Adjust for distance (longer runs at lower intensity also accumulate stress)
    val distanceFactor = if (distanceKm > 10) 1.1 else 1.0

    return (tss * distanceFactor).toInt()
}

/**
 * Get training status description
 */
fun getTrainingStatusDescription(status: TrainingStatus): String {
    return when (status) {
        TrainingStatus.OVERTRAINED -> "Your fatigue exceeds your fitness. Rest and recover."
        TrainingStatus.STRAINED -> "High training load. Consider an easy day soon."
        TrainingStatus.OPTIMAL -> "Perfect balance. Race or push hard!"
        TrainingStatus.FRESH -> "Well rested. Ready for a tough workout."
        TrainingStatus.DETRAINING -> "Detected loss of fitness. Get back to training."
    }
}

/**
 * Calculate weekly TSS target based on fitness level
 */
fun getWeeklyTSSTarget(currentFitness: Float): Int {
    return when {
        currentFitness < 50 -> 200  // Beginner
        currentFitness < 100 -> 400 // Intermediate
        currentFitness < 150 -> 600 // Advanced
        else -> 800                  // Elite
    }
}