# Garmin Data AI Analysis — Implementation Guide

## 1. Enhanced Claude Prompt System

### Current Prompt (Basic)
```
Analyze this run: 10km in 48 minutes. Average pace 4:48. HR 148.
```

### New Prompt (Elite)
```
You are an elite running coach analyzing a detailed run with 23+ biomechanical metrics.

## Run Summary
- Distance: 10km
- Duration: 48 min (780s net running time)
- Pace: 4:48 min/km average
- Elevation: +150m, -150m (rolling terrain)
- Device: Garmin VivoActive 4
- Date: [date]

## Biomechanical Metrics (from watch)
- Heart Rate: avg 148 bpm, max 165 bpm, min 110 bpm
- Cadence: avg 172 spm (steps per minute)
- Ground Contact Time: avg 245ms, range 220-280ms
- Ground Contact Balance: avg 51% (left/right symmetry)
- Vertical Oscillation: avg 8.2cm, range 7.0-9.5cm
- Vertical Ratio: avg 9.1% (oscillation ÷ stride)
- Stride Length: avg 1.14m, range 1.05-1.25m
- Training Effect: Aerobic 3.2, Anaerobic 0.4
- Recovery Time: 38 hours recommended
- VO2 Max Estimate: 58 ml/kg/min (stable)

## Runner's Baseline (4-week average)
- Normal cadence: 170-175 spm
- Normal GCT: 240-250ms
- Normal VO: 8.0-8.5cm
- Normal VR: 9.0-9.5%
- Normal stride: 1.12-1.16m
- Recent VO2 Max: 57-58 ml/kg/min
- Typical Zone 3 pace: 5:20-5:40 min/km

## Terrain Context
- Climb 1: +80m over 2km (4% avg grade) at km 2-4
- Flat: km 0-2, 4-7 (rolling, ±2%)
- Descent: -80m over 2km (4% downgrade) at km 7-9
- Final 1km: flat finish

## Heart Rate Zone Distribution
- Zone 1 (<60%): 5min (cool down)
- Zone 2 (60-70%): 18min (easy)
- Zone 3 (70-80%): 22min (steady — climbs here)
- Zone 4 (80-90%): 8min (climbs and acceleration)
- Zone 5 (>90%): 1min (descent braking)

## Analysis Request
Provide insights on:
1. **Form & Efficiency**: Is the biomechanical profile healthy? Compared to baseline?
2. **Training Load**: What type of session was this? Recovery appropriate?
3. **Pace vs Effort**: How well did the runner manage effort relative to pace/terrain?
4. **Elevation Handling**: How did the runner respond to the terrain?
5. **Overall Assessment**: What's the key takeaway? Next session recommendation?

## Response Format
Provide 5 distinct analyses. Each should:
- Reference specific metrics (e.g., "GCT of 245ms is 2ms above your baseline")
- Compare to baseline when relevant
- Explain implications (efficiency, form, fatigue)
- Provide one actionable recommendation

Include at the bottom:
"Insights derived in part from Garmin device-sourced data."
```

### Implementation in Code

**File**: `RunSummaryViewModel.kt` or new `AICoachingService.kt`

```kotlin
suspend fun generateDetailedRunAnalysis(run: RunSession, watchSamples: List<WatchBiometricFrame>?): RunAnalysis {
    if (watchSamples == null || watchSamples.isEmpty()) {
        // Fallback: basic analysis without watch data
        return generateBasicAnalysis(run)
    }
    
    // Build comprehensive Claude prompt
    val prompt = buildGarminAnalysisPrompt(
        run = run,
        watchSamples = watchSamples,
        userBaseline = getUserBaseline(run.userId),
        terrainContext = computeTerrainContext(watchSamples)
    )
    
    // Call Claude API
    val response = anthropic.messages.create(
        model = "claude-3-5-sonnet-20241022",
        maxTokens = 1500,
        messages = listOf(
            Message(
                role = "user",
                content = prompt
            )
        ),
        system = """
You are an elite running coach analyzing runs with detailed biomechanical data from Garmin watches.
Provide actionable, specific insights that help runners understand their performance.
Reference specific metrics and compare to baselines when relevant.
Always include Garmin attribution in your response.
""".trimIndent()
    )
    
    // Parse response into structured format
    return parseAnalysisResponse(response.content[0].text, run.hasGarminData)
}

// Build the comprehensive prompt
private fun buildGarminAnalysisPrompt(
    run: RunSession,
    watchSamples: List<WatchBiometricFrame>,
    userBaseline: RunnerBaseline,
    terrainContext: TerrainContext
): String {
    return """
## Run Summary
Distance: ${String.format("%.2f", run.distance / 1000.0)}km
Duration: ${run.movingTime?.let { it / 60 } ?: 0} min
Pace: ${formatPace(run.avgPace)} min/km average
Elevation: +${run.elevationGain}m, -${run.elevationLoss}m
Device: ${run.garminDeviceName ?: "Unknown"}

## Biomechanical Metrics
Heart Rate: avg ${run.heartRate} bpm, max ${run.maxHeartRate} bpm
Cadence: avg ${run.cadence} spm
Ground Contact Time: avg ${String.format("%.0f", run.avgGroundContactTime ?: 0)}ms
Ground Contact Balance: ${String.format("%.1f", run.avgGroundContactBalance ?: 50)}%
Vertical Oscillation: avg ${String.format("%.1f", run.avgVerticalOscillation ?: 0)}cm
Vertical Ratio: ${String.format("%.1f", run.avgVerticalRatio ?: 0)}%
Stride Length: avg ${String.format("%.2f", run.avgStrideLength ?: 0)}m
Training Effect: Aerobic ${String.format("%.1f", run.aerobicTrainingEffect ?: 0)}, Anaerobic ${String.format("%.1f", run.anaerobicTrainingEffect ?: 0)}
Recovery Time: ${run.recoveryTimeMinutes ?: 0} hours
VO2 Max: ${String.format("%.0f", run.vo2MaxEstimate ?: 0)} ml/kg/min

## Runner's Baseline (4-week average)
Normal cadence: ${userBaseline.normalCadence.min}-${userBaseline.normalCadence.max} spm
Normal GCT: ${String.format("%.0f", userBaseline.normalGroundContactTime.avg)}ms
Normal VO: ${String.format("%.1f", userBaseline.normalVerticalOscillation.avg)}cm
Normal stride: ${String.format("%.2f", userBaseline.normalStrideLength.avg)}m

## Terrain Context
${terrainContext.description}

## Heart Rate Zones
${computeZoneDistribution(watchSamples)}

Provide analysis on form, training load, pace/effort, elevation handling, and overall assessment.
Include Garmin attribution.
"""
}
```

---

## 2. Data Models for Insights

```kotlin
// File: domain/model/RunAnalysis.kt

data class RunAnalysis(
    val runId: String,
    val hasGarminData: Boolean,
    val formAnalysis: FormAnalysis,
    val trainingLoadAnalysis: TrainingLoadAnalysis,
    val paceEffortAnalysis: PaceEffortAnalysis,
    val elevationAnalysis: ElevationAnalysis,
    val overallAssessment: String,
    val nextSessionRecommendation: String,
    val garminAttribution: String = "Insights derived in part from Garmin device-sourced data."
)

data class FormAnalysis(
    val groundContactTimeAssessment: String,  // "excellent" | "good" | "could_improve"
    val groundContactBalanceAssessment: String, // "perfectly_balanced" | "slight_asymmetry" | "asymmetry_detected"
    val verticalOscillationAssessment: String, // "efficient" | "acceptable" | "inefficient"
    val verticalRatioAssessment: String,
    val overallFormScore: Int,  // 1-10
    val recommendations: List<String>
)

data class TrainingLoadAnalysis(
    val sessionType: String,  // "recovery" | "easy" | "tempo" | "threshold" | "VO2_max" | "interval"
    val aerobicLoad: String,  // "light" | "productive" | "high"
    val anaerobicLoad: String,
    val recoveryRecommendation: String,
    val vo2MaxTrend: String,  // "improving" | "stable" | "declining"
    val nextSessions: List<String>
)

data class PaceEffortAnalysis(
    val paceZoneAlignment: String,  // "well_controlled" | "pushed_too_hard" | "too_easy"
    val effortLevel: String,  // "low" | "moderate" | "high"
    val cadenceAssessment: String,
    val aerobicEfficiency: String,
    val cadeneSweetSpot: String  // "168-172 spm"
)

data class ElevationAnalysis(
    val climbingStrength: String,  // "strong" | "average" | "weak"
    val descentControl: String,
    val elevationAdaptation: String,
    val hrSensitivityToGrade: String,  // "high" | "normal" | "low"
    val terrainInsight: String
)
```

---

## 3. Graph Data Models

```kotlin
// File: domain/model/GraphData.kt

data class HeartRateGraphData(
    val distancePoints: List<Double>,      // km
    val heartRateValues: List<Int>,        // bpm
    val heartRateSmoothed: List<Int>,      // 3-point moving average
    val zoneColors: List<Color>,           // Z1-Z5 colors
    val elevationMarkers: List<ElevationMarker>,
    val maxHr: Int,
    val avgHr: Int,
    val minHr: Int,
    val maxHrKm: Double  // distance at which max HR occurred
)

data class ElevationMarker(
    val distanceKm: Double,
    val elevationGain: Int,
    val terrainType: String  // "climb" | "flat" | "descent"
)

data class ZoneAnalysisData(
    val zoneDistribution: Map<Int, Int>,  // (zone, percentage)
    val timeInZones: Map<Int, Long>,      // (zone, seconds)
    val paceByZone: Map<Int, PaceRange>,
    val zoneInsights: List<ZoneInsight>
)

data class PaceRange(
    val min: String,  // "5:30"
    val max: String,
    val avg: String
)

data class ZoneInsight(
    val zone: Int,
    val text: String,  // "Zone 3 pace of 5:30 is your sweet spot"
    val quality: String
)

data class TerrainHeartRateData(
    val distancePoints: List<Double>,
    val heartRates: List<Int>,
    val grades: List<Float>,  // % grade
    val avgHrOnClimbs: Int,
    val avgHrOnFlats: Int,
    val avgHrOnDescents: Int,
    val hrSensitivity: String,  // "high" | "normal" | "low"
    val insights: List<String>
)
```

---

## 4. Updated RunSummaryScreen Tabs

### Data Tab — Running Dynamics Section

```kotlin
// NEW SECTION in RunSummaryScreen Data Tab

@Composable
private fun RunningDynamicsSection(run: RunSession) {
    if (!run.hasGarminData) {
        Text("Running dynamics data requires Garmin watch.", color = Colors.textSecondary)
        return
    }
    
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // Garmin disclosure
        GarminAttribution()
        
        // Ground Contact Time
        MetricRow(
            label = "Ground Contact Time",
            value = "${String.format("%.0f", run.avgGroundContactTime ?: 0)} ms",
            benchmark = "200-300ms",
            status = assessGCT(run.avgGroundContactTime ?: 0f),
            detail = "Time your foot spends on the ground per step"
        )
        
        // Ground Contact Balance
        MetricRow(
            label = "Ground Contact Balance",
            value = "${String.format("%.1f", run.avgGroundContactBalance ?: 50)}%",
            benchmark = "50% (perfectly balanced)",
            status = assessBalance(run.avgGroundContactBalance ?: 50f),
            detail = "Left/right symmetry. <48% or >52% may indicate asymmetry."
        )
        
        // Vertical Oscillation
        MetricRow(
            label = "Vertical Oscillation",
            value = "${String.format("%.1f", run.avgVerticalOscillation ?: 0)} cm",
            benchmark = "6-8cm (efficient)",
            status = assessVO(run.avgVerticalOscillation ?: 0f),
            detail = "Torso bounce per step. Higher = wasted upward energy."
        )
        
        // Vertical Ratio
        MetricRow(
            label = "Vertical Ratio",
            value = "${String.format("%.1f", run.avgVerticalRatio ?: 0)}%",
            benchmark = "8-10%",
            status = assessVR(run.avgVerticalRatio ?: 0f),
            detail = "Oscillation ÷ Stride. Efficiency metric."
        )
        
        // Stride Length
        MetricRow(
            label = "Avg Stride Length",
            value = "${String.format("%.2f", run.avgStrideLength ?: 0)} m",
            benchmark = "Height-dependent",
            status = "info",
            detail = "Min: ${String.format("%.2f", run.minStrideLength ?: 0)}m, Max: ${String.format("%.2f", run.maxStrideLength ?: 0)}m"
        )
    }
}

@Composable
private fun MetricRow(
    label: String,
    value: String,
    benchmark: String,
    status: String,  // "excellent" | "good" | "caution" | "info"
    detail: String
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, style = AppTextStyles.body, color = Colors.textPrimary)
            Text(
                value,
                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                color = statusColor(status)
            )
        }
        Text(
            "Benchmark: $benchmark • $detail",
            style = AppTextStyles.caption,
            color = Colors.textMuted
        )
    }
}

@Composable
private fun GarminAttribution() {
    Text(
        "ℹ️ Insights derived in part from Garmin device-sourced data.",
        style = AppTextStyles.caption.copy(
            fontStyle = FontStyle.Italic,
            fontSize = 10.sp
        ),
        color = Colors.textMuted,
        modifier = Modifier.padding(bottom = 8.dp)
    )
}

private fun statusColor(status: String): Color = when (status) {
    "excellent" -> Color(0xFF4CAF50)  // green
    "good" -> Color(0xFF2196F3)       // blue
    "caution" -> Color(0xFFFF9800)    // orange
    else -> Color.Unspecified
}

private fun assessGCT(gct: Float): String = when {
    gct < 200 -> "caution"  // understriding
    gct in 200f..300f -> "excellent"
    else -> "caution"  // overstriding
}

private fun assessBalance(balance: Float): String = when {
    balance in 48f..52f -> "excellent"
    balance in 45f..55f -> "good"
    else -> "caution"
}

private fun assessVO(vo: Float): String = when {
    vo < 6 -> "excellent"
    vo in 6f..8f -> "excellent"
    vo in 8f..10f -> "good"
    else -> "caution"
}

private fun assessVR(vr: Float): String = when {
    vr in 8f..10f -> "excellent"
    vr in 7f..11f -> "good"
    else -> "caution"
}
```

### Graphs Tab — New Heart Rate Graphs

```kotlin
@Composable
private fun HeartRateOverDistanceGraph(data: HeartRateGraphData) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "Heart Rate Over Distance",
            style = AppTextStyles.h3,
            color = Colors.textPrimary
        )
        
        // Placeholder: Use a charting library (Vico, AAChart, or custom Canvas)
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp)
                .background(Colors.backgroundSecondary, RoundedCornerShape(8.dp))
        ) {
            // Draw line chart with zone coloring
            // Implementation uses Vico library or custom Canvas drawing
        }
        
        // Stats row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StatBox("Avg HR", "${data.avgHr} bpm")
            StatBox("Max HR", "${data.maxHr} bpm at ${String.format("%.1f", data.maxHrKm)}km")
            StatBox("Min HR", "${data.minHr} bpm")
        }
        
        GarminAttribution()
    }
}

@Composable
private fun ZoneDistributionGraph(data: ZoneAnalysisData) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "Heart Rate Zone Distribution",
            style = AppTextStyles.h3,
            color = Colors.textPrimary
        )
        
        // Zone breakdown bars
        (1..5).forEach { zone ->
            ZoneBar(
                zone = zone,
                percentage = data.zoneDistribution[zone] ?: 0,
                timeSeconds = data.timeInZones[zone] ?: 0,
                insight = data.zoneInsights.firstOrNull { it.zone == zone }?.text ?: ""
            )
        }
        
        GarminAttribution()
    }
}

@Composable
private fun ZoneBar(zone: Int, percentage: Int, timeSeconds: Long, insight: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Zone $zone", style = AppTextStyles.caption, color = Colors.textPrimary)
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(8.dp)
                        .background(zoneColor(zone), RoundedCornerShape(4.dp))
                )
                Text("$percentage%", style = AppTextStyles.caption)
                Text(
                    formatSecondsToHMS(timeSeconds),
                    style = AppTextStyles.caption,
                    color = Colors.textSecondary
                )
            }
        }
        if (insight.isNotEmpty()) {
            Text(
                insight,
                style = AppTextStyles.caption.copy(fontSize = 9.sp),
                color = Colors.textMuted
            )
        }
    }
}

private fun zoneColor(zone: Int): Color = when (zone) {
    1 -> Color(0xFF42A5F5)  // blue
    2 -> Color(0xFF4CAF50)  // green
    3 -> Color(0xFFFFC107)  // yellow
    4 -> Color(0xFFFF9800)  // orange
    5 -> Color(0xFFF44336)  // red
    else -> Color.Gray
}
```

---

## 5. Garmin Attribution Component (Reusable)

```kotlin
// File: ui/components/GarminAttribution.kt

@Composable
fun GarminAttribution(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            painter = painterResource(id = R.drawable.ic_garmin_connect_logo),
            contentDescription = "Garmin",
            tint = Color(0xFF8E9BAE),
            modifier = Modifier.size(12.dp)
        )
        Text(
            "Insights derived in part from Garmin device-sourced data.",
            style = AppTextStyles.caption.copy(
                fontStyle = FontStyle.Italic,
                fontSize = 10.sp
            ),
            color = Colors.textMuted
        )
    }
}
```

---

## 6. Charting Library Recommendation

For graphs, recommend **Vico** (Jetpack Compose charting library):

```kotlin
// build.gradle.kts
dependencies {
    implementation("com.patrykandpatrick.vico:compose:1.10.0")
}

// Usage example:
@Composable
fun LineChartExample(data: HeartRateGraphData) {
    val chartEntryModel = entryModelOf(
        data.distancePoints.mapIndexed { index, km ->
            entryOf(
                x = km.toFloat(),
                y = data.heartRateValues[index].toFloat()
            )
        }
    )
    
    LineChart(
        model = chartEntryModel,
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
    )
}
```

---

## Implementation Checklist

- [ ] Update Claude prompts with all 23+ metrics
- [ ] Create RunAnalysis data models
- [ ] Implement formattedAnalysisResponse parsing
- [ ] Add GarminAttribution composable
- [ ] Update RunSummaryViewModel.getRunAnalysis()
- [ ] Add Data Tab — Running Dynamics section
- [ ] Add Graphs Tab — HR over distance
- [ ] Add Graphs Tab — Zone distribution
- [ ] Integrate Vico charting library
- [ ] Add HR vs elevation graph
- [ ] Test with sample Garmin run data
- [ ] Verify Garmin attribution appears on all graphs/insights
- [ ] Performance testing (ensure graphs load <500ms)

