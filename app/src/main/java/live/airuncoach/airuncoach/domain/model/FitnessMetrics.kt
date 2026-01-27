package live.airuncoach.airuncoach.domain.model

import java.time.LocalDate

/**
 * FITNESS & FRESHNESS (Strava's PMC - Performance Management Chart)
 * The gold standard for training load visualization
 */

/**
 * Daily fitness snapshot
 */
data class DailyFitness(
    val date: LocalDate,
    val fitness: Float,        // CTL - Chronic Training Load (42-day exponential moving avg)
    val fatigue: Float,        // ATL - Acute Training Load (7-day exponential moving avg)
    val form: Float,           // TSB - Training Stress Balance (Fitness - Fatigue)
    val trainingLoad: Int,     // TSS for this day
    val rampRate: Float        // How quickly fitness is building (TSS/CTL ratio)
)

/**
 * Fitness trend over time
 */
data class FitnessTrend(
    val dailyMetrics: List<DailyFitness>,
    val currentFitness: Float,
    val currentFatigue: Float,
    val currentForm: Float,
    val trainingStatus: TrainingStatus,
    val recommendations: List<String>
)

/**
 * Training status based on form
 */
enum class TrainingStatus {
    OVERTRAINED,        // Form < -30: Very fatigued, risk of injury
    STRAINED,           // Form -30 to -10: Heavy training, need recovery
    OPTIMAL,            // Form -10 to 5: Perfect for racing
    FRESH,              // Form 5 to 25: Well rested, ready for hard workout
    DETRAINING          // Form > 25: Too much rest, losing fitness
}

/**
 * Fitness zones for visualization
 */
data class FitnessZone(
    val name: String,
    val range: IntRange,
    val description: String,
    val color: Long
)

/**
 * Fitness insights and predictions
 */
data class FitnessInsights(
    val peakFitnessDate: LocalDate?,
    val projectedFitness: Float,
    val daysToRace: Int?,
    val taperAdvice: String?,
    val injuryRisk: InjuryRisk
)

enum class InjuryRisk {
    LOW,
    MODERATE,
    HIGH,
    CRITICAL
}

/**
 * Training load builder for calculating CTL/ATL/TSB
 */
class FitnessCalculator {
    
    companion object {
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
            while (!currentDate.isAfter(lastDate)) {
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
                
                currentDate = currentDate.plusDays(1)
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
    }
}

/**
 * Run with calculated TSS
 */
data class RunWithTSS(
    val date: LocalDate,
    val tss: Int,
    val duration: Long,
    val distance: Double
)
