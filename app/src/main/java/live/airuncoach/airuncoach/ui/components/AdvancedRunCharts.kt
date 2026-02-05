package live.airuncoach.airuncoach.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.patrykandpatrick.vico.compose.axis.horizontal.rememberBottomAxis
import com.patrykandpatrick.vico.compose.axis.vertical.rememberStartAxis
import com.patrykandpatrick.vico.compose.chart.Chart
import com.patrykandpatrick.vico.compose.chart.line.lineChart
import com.patrykandpatrick.vico.compose.style.ProvideChartStyle
import com.patrykandpatrick.vico.core.entry.ChartEntryModelProducer
import com.patrykandpatrick.vico.core.entry.FloatEntry
import live.airuncoach.airuncoach.R
import live.airuncoach.airuncoach.domain.model.KmSplit
import live.airuncoach.airuncoach.domain.model.LocationPoint
import live.airuncoach.airuncoach.domain.model.RunSession
import live.airuncoach.airuncoach.ui.theme.*
import kotlin.math.abs

/**
 * 1. HEART RATE vs PACE CORRELATION
 * Shows efficiency - are you working harder for the same pace?
 * Elite runners have flat HR/pace ratio
 */
@Composable
fun HeartRatePaceCorrelationChart(
    routePoints: List<LocationPoint>,
    modifier: Modifier = Modifier
) {
    if (routePoints.isEmpty()) {
        EmptyChartPlaceholder("Heart rate data not available", modifier)
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painterResource(id = R.drawable.icon_timer_vector),
                    contentDescription = null,
                    tint = Colors.error,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    "Heart Rate Efficiency",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "How hard you're working for your pace",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            // Create scatter plot: X = pace, Y = heart rate
            val chartEntries = remember(routePoints) {
                routePoints.mapIndexedNotNull { index, point ->
                    val hr = 150 // TODO: Get actual HR from point
                    val pace = point.speed ?: return@mapIndexedNotNull null
                    FloatEntry(x = pace, y = hr.toFloat())
                }
            }

            if (chartEntries.isNotEmpty()) {
                val chartEntryModelProducer = remember { ChartEntryModelProducer(chartEntries) }
                val model = chartEntryModelProducer.getModel()
                
                if (model != null) {
                    ProvideChartStyle {
                        Chart(
                            chart = lineChart(),
                            model = model,
                            startAxis = rememberStartAxis(),
                            bottomAxis = rememberBottomAxis(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp)
                        )
                    }
                } else {
                    EmptyChartPlaceholder("No pace data available")
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            EfficiencyInsightCard(calculateEfficiencyScore(routePoints))
        }
    }
}

/**
 * 2. CADENCE ANALYSIS
 * Optimal cadence is ~180 spm for most runners
 */
@Composable
fun CadenceAnalysisChart(
    routePoints: List<LocationPoint>,
    avgCadence: Int,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painterResource(id = R.drawable.icon_trending_vector),
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    "Cadence Analysis",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "Steps per minute - optimal is 170-180",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            // Cadence gauge
            CadenceGauge(avgCadence)
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Cadence insights
            val optimalRange = 170..180
            val insight = when {
                avgCadence in optimalRange -> "Perfect! You're in the optimal cadence zone."
                avgCadence < 170 -> "Try increasing your step rate. Quick, light steps reduce injury risk."
                else -> "Good turnover! Make sure you're not overstriding."
            }
            
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(BorderRadius.sm))
                    .background(Colors.primary.copy(alpha = 0.1f))
                    .padding(Spacing.md)
            ) {
                Text(
                    insight,
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

/**
 * 3. NEGATIVE/POSITIVE SPLIT ANALYSIS
 * Did you start too fast or finish strong?
 */
@Composable
fun SplitAnalysisChart(
    kmSplits: List<KmSplit>,
    modifier: Modifier = Modifier
) {
    if (kmSplits.isEmpty()) {
        EmptyChartPlaceholder("Split data not available", modifier)
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painterResource(id = R.drawable.icon_chart_vector),
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    "Split Strategy Analysis",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }
            Spacer(modifier = Modifier.height(Spacing.md))

            val splitAnalysis = analyzeSplits(kmSplits)
            
            // Visual split comparison
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                SplitHalfCard("First Half", splitAnalysis.firstHalfAvg, Colors.primary)
                SplitHalfCard("Second Half", splitAnalysis.secondHalfAvg, Colors.error)
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Split verdict
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(BorderRadius.sm))
                    .background(
                        when (splitAnalysis.type) {
                            SplitType.NEGATIVE -> Colors.primary.copy(alpha = 0.1f)
                            SplitType.POSITIVE -> Colors.error.copy(alpha = 0.1f)
                            SplitType.EVEN -> Colors.textMuted.copy(alpha = 0.1f)
                        }
                    )
                    .padding(Spacing.md)
            ) {
                Column {
                    Text(
                        splitAnalysis.verdict,
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Spacer(modifier = Modifier.height(Spacing.xs))
                    Text(
                        splitAnalysis.recommendation,
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }
        }
    }
}

/**
 * 4. FATIGUE INDEX
 * How much you slowed down - lower is better
 */
@Composable
fun FatigueIndexChart(
    kmSplits: List<KmSplit>,
    modifier: Modifier = Modifier
) {
    if (kmSplits.size < 2) {
        EmptyChartPlaceholder("Insufficient data for fatigue analysis", modifier)
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painterResource(id = R.drawable.icon_trending_vector),
                    contentDescription = null,
                    tint = Colors.error,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    "Fatigue Index",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "How much you slowed down over the run",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            val fatigueIndex = calculateFatigueIndex(kmSplits)
            
            // Fatigue gauge
            FatigueGauge(fatigueIndex)
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            val assessment = when {
                fatigueIndex < 5 -> "Excellent! Minimal slowdown shows great endurance."
                fatigueIndex < 10 -> "Good pacing. You managed fatigue well."
                fatigueIndex < 15 -> "Moderate fatigue. Consider pacing strategy."
                else -> "High fatigue. You may have started too fast."
            }
            
            Text(
                assessment,
                style = AppTextStyles.body,
                color = Colors.textSecondary
            )
        }
    }
}

/**
 * 5. TRAINING LOAD / STRESS SCORE
 * Garmin/Strava-style training stress
 */
@Composable
fun TrainingLoadCard(
    runSession: RunSession,
    modifier: Modifier = Modifier
) {
    val trainingLoad = calculateTrainingLoad(runSession)
    
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = when {
                trainingLoad < 150 -> Colors.primary.copy(alpha = 0.1f)
                trainingLoad < 300 -> Color(0xFFFFA726).copy(alpha = 0.1f)
                else -> Colors.error.copy(alpha = 0.1f)
            }
        )
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Training Load",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "Workout intensity score",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
                
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(Colors.primary.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        trainingLoad.toString(),
                        style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Recovery recommendation
            val recoveryHours = when {
                trainingLoad < 150 -> 24
                trainingLoad < 300 -> 48
                else -> 72
            }
            
            Text(
                "Recommended recovery: $recoveryHours hours",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
        }
    }
}

/**
 * 6. VO2 MAX ESTIMATION
 * Fitness level indicator
 */
@Composable
fun VO2MaxEstimationCard(
    runSession: RunSession,
    userAge: Int?,
    modifier: Modifier = Modifier
) {
    val vo2Max = estimateVO2Max(runSession, userAge ?: 30)
    
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painterResource(id = R.drawable.icon_chart_vector),
                    contentDescription = null,
                    tint = Colors.primary,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(Spacing.sm))
                Text(
                    "VO2 Max Estimate",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textPrimary
                )
            }
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "Your aerobic fitness level",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        String.format("%.1f", vo2Max),
                        style = AppTextStyles.h1.copy(fontWeight = FontWeight.Bold),
                        color = Colors.primary
                    )
                    Text(
                        "ml/kg/min",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
                
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        getFitnessLevel(vo2Max, userAge ?: 30),
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "Fitness Level",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }
        }
    }
}

/**
 * 7. POWER/EFFORT HEATMAP
 * Visual representation of where you worked hardest
 */
@Composable
fun EffortHeatmapCard(
    routePoints: List<LocationPoint>,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(
                "Effort Distribution",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.sm))
            Text(
                "Where you pushed hardest",
                style = AppTextStyles.caption,
                color = Colors.textSecondary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            // Effort zones visualization
            val effortZones = calculateEffortZones(routePoints)
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                effortZones.forEach { (zone, percentage) ->
                    EffortZoneIndicator(zone, percentage)
                }
            }
        }
    }
}

/**
 * 8. WEATHER IMPACT VISUALIZATION
 * How conditions changed during run
 */
@Composable
fun WeatherProgressionChart(
    weatherAtStart: live.airuncoach.airuncoach.domain.model.WeatherData?,
    weatherAtEnd: live.airuncoach.airuncoach.domain.model.WeatherData?,
    modifier: Modifier = Modifier
) {
    if (weatherAtStart == null || weatherAtEnd == null) {
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            Text(
                "Weather Progression",
                style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                color = Colors.textPrimary
            )
            Spacer(modifier = Modifier.height(Spacing.md))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                WeatherSnapshot("Start", weatherAtStart)
                Icon(
                    painterResource(id = R.drawable.icon_play_vector),
                    contentDescription = null,
                    tint = Colors.textMuted,
                    modifier = Modifier
                        .align(Alignment.CenterVertically)
                        .size(24.dp)
                )
                WeatherSnapshot("End", weatherAtEnd)
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Temperature change impact
            val tempChange = weatherAtEnd.temperature - weatherAtStart.temperature
            if (abs(tempChange) > 2) {
                val impact = if (tempChange > 0) "Temperature rose" else "Temperature dropped"
                Text(
                    "$impact ${String.format("%.1f", abs(tempChange))}°C during your run",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

// Helper Composables

@Composable
private fun CadenceGauge(cadence: Int) {
    val optimalRange = 170..180
    val fillPercentage = (cadence.toFloat() / 200f).coerceIn(0f, 1f)
    
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(40.dp)
                .clip(RoundedCornerShape(BorderRadius.full))
                .background(Colors.textMuted.copy(alpha = 0.2f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(fillPercentage)
                    .clip(RoundedCornerShape(BorderRadius.full))
                    .background(
                        if (cadence in optimalRange) Colors.primary
                        else Color(0xFFFFA726)
                    )
            )
            
            // Optimal zone indicator
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .fillMaxHeight()
                    .fillMaxWidth(170f / 200f)
                    .padding(end = ((1f - 180f / 200f) * 100).dp)
            ) {
                Box(
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .width(2.dp)
                        .fillMaxHeight()
                        .background(Color.White.copy(alpha = 0.5f))
                )
            }
        }
        
        Spacer(modifier = Modifier.height(Spacing.sm))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("0", style = AppTextStyles.caption, color = Colors.textMuted)
            Text("$cadence spm", style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold), color = Colors.textPrimary)
            Text("200", style = AppTextStyles.caption, color = Colors.textMuted)
        }
    }
}

@Composable
private fun FatigueGauge(fatigueIndex: Float) {
    val color = when {
        fatigueIndex < 5 -> Colors.primary
        fatigueIndex < 10 -> Color(0xFF66BB6A)
        fatigueIndex < 15 -> Color(0xFFFFA726)
        else -> Colors.error
    }
    
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(120.dp)
                .clip(CircleShape)
                .background(color.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    String.format("%.1f%%", fatigueIndex),
                    style = AppTextStyles.h2.copy(fontWeight = FontWeight.Bold),
                    color = color
                )
                Text(
                    "slowdown",
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
        }
    }
}

@Composable
private fun SplitHalfCard(label: String, avgPace: String, color: Color) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(BorderRadius.md))
            .background(color.copy(alpha = 0.1f))
            .padding(Spacing.lg)
    ) {
        Text(
            label,
            style = AppTextStyles.caption,
            color = Colors.textSecondary
        )
        Spacer(modifier = Modifier.height(Spacing.xs))
        Text(
            avgPace,
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = color
        )
        Text(
            "/km",
            style = AppTextStyles.caption,
            color = Colors.textMuted
        )
    }
}

@Composable
private fun EffortZoneIndicator(zone: String, percentage: Float) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.width(60.dp)
    ) {
        Box(
            modifier = Modifier
                .size(50.dp)
                .clip(CircleShape)
                .background(getEffortColor(zone).copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                String.format("%.0f%%", percentage * 100),
                style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                color = getEffortColor(zone)
            )
        }
        Spacer(modifier = Modifier.height(Spacing.xs))
        Text(
            zone,
            style = AppTextStyles.caption,
            color = Colors.textSecondary
        )
    }
}

@Composable
private fun WeatherSnapshot(
    label: String,
    weather: live.airuncoach.airuncoach.domain.model.WeatherData
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            label,
            style = AppTextStyles.caption,
            color = Colors.textSecondary
        )
        Spacer(modifier = Modifier.height(Spacing.xs))
        Text(
            String.format("%.0f°C", weather.temperature),
            style = AppTextStyles.h3.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Text(
            weather.description,
            style = AppTextStyles.caption,
            color = Colors.textSecondary
        )
    }
}

@Composable
private fun EfficiencyInsightCard(score: Float) {
    val color = when {
        score > 0.8f -> Colors.primary
        score > 0.6f -> Color(0xFFFFA726)
        else -> Colors.error
    }
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(BorderRadius.sm))
            .background(color.copy(alpha = 0.1f))
            .padding(Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            "Efficiency Score",
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
            color = Colors.textPrimary
        )
        Text(
            String.format("%.1f/10", score * 10),
            style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
            color = color
        )
    }
}

// Calculation Functions

private fun calculateEfficiencyScore(routePoints: List<LocationPoint>): Float {
    // TODO: Actual calculation based on HR/pace correlation
    return 0.75f
}

private data class SplitAnalysisResult(
    val firstHalfAvg: String,
    val secondHalfAvg: String,
    val type: SplitType,
    val verdict: String,
    val recommendation: String
)

private enum class SplitType {
    NEGATIVE, POSITIVE, EVEN
}

private fun analyzeSplits(kmSplits: List<KmSplit>): SplitAnalysisResult {
    val midpoint = kmSplits.size / 2
    val firstHalf = kmSplits.take(midpoint)
    val secondHalf = kmSplits.drop(midpoint)
    
    val firstAvg = firstHalf.map { it.time }.average()
    val secondAvg = secondHalf.map { it.time }.average()
    
    val diff = ((secondAvg - firstAvg) / firstAvg * 100).toFloat()
    
    val type = when {
        diff < -2 -> SplitType.NEGATIVE
        diff > 2 -> SplitType.POSITIVE
        else -> SplitType.EVEN
    }
    
    val verdict = when (type) {
        SplitType.NEGATIVE -> "Negative Split! 🎉"
        SplitType.POSITIVE -> "Positive Split"
        SplitType.EVEN -> "Even Pacing"
    }
    
    val recommendation = when (type) {
        SplitType.NEGATIVE -> "Excellent! You finished strong and managed your energy well."
        SplitType.POSITIVE -> "Consider starting slower to conserve energy for the finish."
        SplitType.EVEN -> "Good pacing strategy. Very consistent throughout."
    }
    
    return SplitAnalysisResult(
        firstHalfAvg = formatTime(firstAvg.toLong()),
        secondHalfAvg = formatTime(secondAvg.toLong()),
        type = type,
        verdict = verdict,
        recommendation = recommendation
    )
}

private fun calculateFatigueIndex(kmSplits: List<KmSplit>): Float {
    if (kmSplits.size < 2) return 0f
    
    val fastestTime = kmSplits.minOf { it.time }
    val slowestTime = kmSplits.maxOf { it.time }
    
    return ((slowestTime - fastestTime) / fastestTime.toFloat() * 100)
}

private fun calculateTrainingLoad(runSession: RunSession): Int {
    // Simplified TSS calculation
    val duration = runSession.duration / 1000 / 60 // minutes
    val intensity = when {
        runSession.heartRate > 170 -> 1.5f
        runSession.heartRate > 150 -> 1.2f
        else -> 1.0f
    }
    
    return (duration * intensity * (runSession.distance / 1000)).toInt()
}

private fun estimateVO2Max(runSession: RunSession, age: Int): Float {
    // Simplified VO2 Max estimation from pace
    val avgSpeedKmh = (runSession.distance / 1000) / (runSession.duration / 1000.0 / 3600.0)
    val vo2Max = (avgSpeedKmh * 3.5f) + 15f // Simplified formula
    
    return vo2Max.toFloat()
}

private fun getFitnessLevel(vo2Max: Float, age: Int): String {
    // Simplified fitness classification
    return when {
        vo2Max > 50 -> "Excellent"
        vo2Max > 40 -> "Good"
        vo2Max > 35 -> "Average"
        else -> "Below Average"
    }
}

private fun calculateEffortZones(routePoints: List<LocationPoint>): List<Pair<String, Float>> {
    // TODO: Calculate actual effort distribution
    return listOf(
        "Easy" to 0.3f,
        "Moderate" to 0.5f,
        "Hard" to 0.15f,
        "Max" to 0.05f
    )
}

private fun getEffortColor(zone: String): Color {
    return when (zone) {
        "Easy" -> Color(0xFF66BB6A)
        "Moderate" -> Color(0xFFFFEB3B)
        "Hard" -> Color(0xFFFFA726)
        "Max" -> Colors.error
        else -> Colors.textMuted
    }
}

private fun formatTime(millis: Long): String {
    val totalSeconds = millis / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format("%d:%02d", minutes, seconds)
}
