# Garmin Watch Data — Insights & Graphs Implementation Plan

## Overview

We're creating an **elite post-run analysis system** that transforms 23+ watch metrics into **actionable insights** with **professional-grade visualizations**.

**Key Principle**: Data alone is useless. Users need context, comparisons, and insights derived from that data.

---

## Phase 1: Enhanced AI Analysis (Post-Run)

### Current State ❌
- AI insights use basic metrics (pace, distance, HR)
- Watch data (GCT, VO, stride, TE) **captured but not analyzed**
- No biomechanical form analysis
- No training effect interpretation

### New State ✅
AI analysis will now include:

#### 1. **Form & Efficiency Analysis**
Uses: GCT, vertical oscillation, stride length, ground contact balance, vertical ratio

```
Input from watch (per-run averages):
  • avg_ground_contact_time: 245 ms
  • avg_vertical_oscillation: 8.2 cm
  • avg_stride_length: 1.14 m
  • avg_ground_contact_balance: 51%
  • avg_vertical_ratio: 9.1%

Claude AI Analysis:
  "Ground contact time of 245ms is solid (200-300 range).
   Vertical oscillation at 8.2cm shows efficient form for a steady run.
   Your 51% ground contact balance indicates perfect symmetry — no asymmetry detected.
   
   Recommendation: Maintain current cadence and form, both are optimal."

Output: FormAnalysis {
  groundContactTimeAssessment: "solid",
  verticalOscillationAssessment: "efficient",
  groundContactBalanceAssessment: "perfectly_balanced",
  recommendation: "maintain_current_form"
}
```

#### 2. **Training Load Interpretation**
Uses: aerobic_training_effect, anaerobic_training_effect, recovery_time_minutes, vo2_max_estimate

```
Input:
  • aerobic_training_effect: 3.2
  • anaerobic_training_effect: 0.4
  • recovery_time_minutes: 38
  • vo2_max_estimate: 58 ml/kg/min

Claude Analysis:
  "Aerobic training effect of 3.2 indicates a productive aerobic session.
   Your anaerobic component (0.4) was minimal — this was a steady-state run.
   Recovery time of 38 hours suggests moderate intensity.
   
   This is ideal for base-building runs. Your VO2 max estimate remains at 58."

Output: TrainingLoadAnalysis {
  aerobicLoad: "productive",
  anaerobicLoad: "minimal",
  sessionType: "aerobic_steady_state",
  recoveryRecommendation: "easy_run_next",
  vo2MaxTrend: "stable"
}
```

#### 3. **Pace vs Effort Analysis**
Uses: pace, heart_rate_zone, training_effect, terrain_grade, cadence

```
Input:
  • pace: 5:45 min/km average
  • avg_heart_rate_zone: 3 (steady)
  • avg_cadence: 172 spm
  • terrain_grade: mixed (+150m elevation)
  • training_effect: 3.2

Claude Analysis:
  "You ran at 5:45/km pace while maintaining Zone 3 (70-80% max HR).
   For mixed terrain with 150m elevation gain, this pace required good effort.
   Your cadence of 172 was comfortable for the gradient.
   
   Efficiency: Your HR stayed controlled at this pace — good aerobic fitness."

Output: PaceEffortAnalysis {
  paceZoneAlignment: "well_controlled",
  effortLevel: "moderate",
  cadenfeAssessment: "optimal_for_terrain",
  aerobicEfficiency: "good"
}
```

#### 4. **Elevation Impact Analysis**
Uses: elevation_gain, elevation_loss, pace_by_section, hr_by_elevation, terrain_grade

```
Input:
  • elevation_gain: 180m
  • elevation_loss: 180m
  • pace_on_climbs: 6:30 min/km
  • pace_on_flats: 5:30 min/km
  • pace_on_descents: 5:10 min/km
  • avg_hr_on_climbs: 165 bpm
  • avg_hr_on_flats: 150 bpm

Claude Analysis:
  "Your uphill pace of 6:30/km at 165 bpm shows strong climbing strength.
   Downhill pace of 5:10/km was controlled — good braking discipline.
   The 1:20 difference between uphill and downhill is healthy.
   
   You handled the elevation well. Consider: Climbs felt harder because effort was higher,
   not because of poor form."

Output: ElevationAnalysis {
  climbingStrength: "strong",
  descentControl: "excellent",
  elevationAdaptation: "well_handled",
  insight: "elevation_difficulty_normal"
}
```

---

## Phase 2: Graphs & Visualizations

### A. Heart Rate Over Time & Distance

**Location**: `RunSummaryScreen.kt` → Graphs Tab → New section

```
┌─────────────────────────────────────┐
│  Heart Rate Profile                 │
├─────────────────────────────────────┤
│                                      │
│  155 │     ╱╲    ╱╲╱╲               │
│      │    ╱  ╲  ╱    ╲              │
│  145 │───╱────╲╱──────╲──────       │
│      │                              │
│  135 │                              │
│      │  0km        5km       10km    │
│      │                              │
│  Legend:                            │
│  ─ HR Trend (3-point moving avg)   │
│  ▄ Zone distribution (colors)      │
│  △ Climb markers (+10m)            │
│                                      │
│  Stats:                             │
│  Avg HR: 148 bpm                   │
│  Max HR: 165 bpm (climb at 7.2km)  │
│  Time in Z3: 42% (6:18)            │
│                                      │
│  ℹ️ Data from Garmin watch          │
│                                      │
└─────────────────────────────────────┘
```

**Implementation**:
```kotlin
data class HeartRateGraphData(
    val distanceKm: List<Double>,           // x-axis: distance in km
    val heartRateValues: List<Int>,         // HR at each point
    val heartRateSmoothed: List<Int>,       // 3-point moving average
    val zoneColors: List<Color>,            // Z1-Z5 colors per point
    val elevationMarkers: List<Pair<Double, Int>>,  // (distKm, elevationGain)
    val maxHr: Int,
    val avgHr: Int,
    val timeInZones: Map<Int, Long>        // (zone, seconds)
)
```

**Data Source**: 
- `watch_biometric_samples` table: `(distance_so_far, heart_rate, heart_rate_zone, altitude)`

**Key Features**:
- ✅ HR line chart with trend smoothing
- ✅ Zone coloring (Z1=blue, Z2=green, Z3=yellow, Z4=orange, Z5=red)
- ✅ Elevation gain markers for context
- ✅ Max HR point highlighted (showing km where it occurred)
- ✅ Garmin attribution: "Data from Garmin watch"

---

### B. Pace vs Heart Rate Zone Comparison

**Location**: `RunSummaryScreen.kt` → Graphs Tab → New section

```
┌──────────────────────────────────────┐
│  Pace vs Effort Zones                │
├──────────────────────────────────────┤
│                                       │
│  Zone Distribution:                  │
│  Z5 █ 2%  (max effort)               │
│  Z4 ████████ 18% (threshold)         │
│  Z3 ██████████████ 42% (steady)      │
│  Z2 ███████████ 32% (easy)           │
│  Z1 █ 6% (warm-up)                   │
│                                       │
│  Pace by Zone:                       │
│  ┌─────────────────────────────────┐ │
│  │ Z1 │ 6:15-6:45 min/km  (easy)   │ │
│  │ Z2 │ 5:45-6:10 min/km  (easy)   │ │
│  │ Z3 │ 5:15-5:45 min/km  (steady) │ │
│  │ Z4 │ 4:45-5:15 min/km  (hard)   │ │
│  │ Z5 │ 4:00-4:45 min/km  (max)    │ │
│  └─────────────────────────────────┘ │
│                                       │
│  Insights:                           │
│  • Zone 3 pace of 5:30 is your      │
│    "sweet spot" for steady runs     │
│  • You maintained Z3 consistently   │
│    for 42% of the run (good focus) │
│  • Z4 threshold work was effective  │
│    (only 18%, preventing burnout)  │
│                                       │
│  ℹ️ Insights derived in part from    │
│     Garmin device-sourced data      │
│                                       │
└──────────────────────────────────────┘
```

**Implementation**:
```kotlin
data class ZoneAnalysisData(
    val zoneDistribution: Map<Int, Int>,      // (zone, percentage)
    val timeInZones: Map<Int, Long>,          // (zone, seconds)
    val paceByZone: Map<Int, Pair<String, String>>,  // (zone, min_pace, max_pace)
    val avgPaceByZone: Map<Int, String>,      // (zone, avg_pace)
    val insights: List<ZoneInsight>           // AI-generated insights
)

data class ZoneInsight(
    val zone: Int,
    val insight: String,                      // "Zone 3 pace of 5:30 is your sweet spot"
    val quality: String                       // "consistent" | "good_focus" | "needs_work"
)
```

**Data Source**:
- `watch_biometric_samples`: `(heart_rate_zone, pace, elapsed_ms)`
- Calculate duration per zone
- Group pace ranges by zone

**Key Features**:
- ✅ Visual zone distribution (% time in each zone)
- ✅ Pace ranges for each zone (helps user calibrate)
- ✅ AI insights about zone balance
- ✅ Identifies "sweet spot" pace for each user
- ✅ Garmin attribution message

---

### C. Heart Rate & Elevation Relationship

**Location**: `RunSummaryScreen.kt` → Graphs Tab → New section

```
┌──────────────────────────────────────┐
│  HR Response to Terrain              │
├──────────────────────────────────────┤
│                                       │
│  Heart Rate vs Elevation:            │
│                                       │
│  160 │              ╱╲    ╱╲         │
│      │             ╱  ╲  ╱  ╲       │
│  150 │────╱────────     ╲╱────╲─    │
│      │   ╱                      ╲   │
│  140 │──╱─────────────────────────   │
│      │                              │
│      │ 0      5km    10km    15km    │
│                                       │
│  Elevation Impact:                   │
│  • +50m grade → HR +12 bpm          │
│  • -50m grade → HR -8 bpm           │
│  • Flat sections → HR stable        │
│                                       │
│  Efficiency Assessment:              │
│  You show good HR control on        │
│  climbs. 12 bpm increase for 50m    │
│  elevation is expected and healthy. │
│                                       │
│  ℹ️ Data from Garmin watch          │
│                                       │
└──────────────────────────────────────┘
```

**Implementation**:
```kotlin
data class TerrainHeartRateData(
    val terrainGrades: List<Float>,         // % grade per sample
    val heartRates: List<Int>,              // HR per sample
    val elevationGain: Int,
    val elevationLoss: Int,
    val avgHrOnClimbs: Int,
    val avgHrOnFlats: Int,
    val avgHrOnDescents: Int,
    val hrSensitivity: String,              // "high" | "normal" | "low"
    val insights: List<String>
)
```

**Data Source**:
- `watch_biometric_samples`: compute `terrain_grade` from altitude deltas
- Segment data: climbs (+grade), flats (±1%), descents (-grade)
- Group HR by terrain type

**Key Features**:
- ✅ HR vs elevation visualization
- ✅ Terrain-specific HR averages
- ✅ HR sensitivity assessment (how responsive user is)
- ✅ Context: "12 bpm increase is normal for this grade"
- ✅ Garmin attribution

---

## Phase 3: Integration Points

### Updated RunSummaryViewModel
```kotlin
data class RunAnalysisState(
    // ... existing fields ...
    
    // NEW: Biomechanical insights
    formAnalysis: FormAnalysis?,
    trainingLoadAnalysis: TrainingLoadAnalysis?,
    paceEffortAnalysis: PaceEffortAnalysis?,
    elevationAnalysis: ElevationAnalysis?,
    
    // NEW: Graph data
    heartRateGraphData: HeartRateGraphData?,
    zoneAnalysisData: ZoneAnalysisData?,
    terrainHeartRateData: TerrainHeartRateData?,
    
    // NEW: Garmin flag
    hasGarminWatchData: Boolean
)
```

### Updated Claude AI Prompts

**New System Prompt Section**:
```
You now have access to detailed Garmin watch metrics. Use them to provide:

1. FORM ANALYSIS
   - Evaluate ground contact time, vertical oscillation, stride balance
   - Compare to user's baseline (4-week average)
   - Suggest improvements

2. TRAINING LOAD
   - Interpret training effects (0-5 scale)
   - Recommend recovery based on anaerobic load
   - Track VO2 max trends

3. TERRAIN ADAPTATION
   - Analyze pace/HR changes with elevation
   - Identify hill climbing strength
   - Evaluate descent control

4. ZONE EFFICIENCY
   - Compare pace to HR zones
   - Identify user's "sweet spot" pace
   - Assess overall zone balance

Always include Garmin attribution when using watch data:
"Insights derived in part from Garmin device-sourced data."
```

### Updated RunSummaryScreen

**New Sections in Data Tab**:
```
1. Form & Efficiency (uses GCT, VO, stride data)
2. Training Load (uses TE, recovery, VO2 data)
3. Pace & Effort (uses pace/zone alignment)

Tab Graphs:
1. Heart Rate Over Distance
2. Pace vs Zone Distribution
3. HR Response to Terrain

Tab AI Insights:
[All analyses above, AI-generated, with Garmin attribution]
```

---

## Implementation Priority

### Sprint 1 (Critical Path)
1. ✅ Update Claude prompts to use all 23+ watch metrics
2. ✅ Add form/training/elevation analyses to AI insights
3. ✅ Implement heart rate over distance graph
4. ✅ Implement pace vs zone comparison section

### Sprint 2
1. ⏳ Implement HR vs elevation graph
2. ⏳ Add zone balance insights
3. ⏳ Terrain-specific coaching

### Sprint 3
1. ⏳ Multi-run trends (4-week form improvement, VO2 tracking)
2. ⏳ Comparison: "This run vs your average"
3. ⏳ Predictive coaching ("Based on your trend, you're ready for...")

---

## Garmin Attribution Requirements

**Every insight/graph using watch data must include**:

```
ℹ️ "Insights derived in part from Garmin device-sourced data."
```

**Placement**:
- Graphs: Bottom corner, small gray text
- AI Insights: Below analysis, italicized
- Data tabs: Under each Garmin-sourced metric

**Implementation**:
```kotlin
@Composable
fun GarminAttribution() {
    Text(
        "ℹ️ Insights derived in part from Garmin device-sourced data.",
        style = AppTextStyles.caption.copy(
            fontStyle = FontStyle.Italic,
            fontSize = 10.sp
        ),
        color = Colors.textMuted,
        modifier = Modifier.padding(top = 8.dp)
    )
}
```

---

## Data Architecture

### Query: Get all metrics for a run
```sql
SELECT 
    r.id, r.distance, r.duration,
    r.avg_pace, r.avg_heart_rate, r.max_heart_rate,
    r.avg_ground_contact_time, r.avg_vertical_oscillation,
    r.aerobic_training_effect, r.anaerobic_training_effect,
    r.recovery_time_minutes, r.vo2_max_estimate,
    r.elevation_gain, r.elevation_loss,
    r.has_garmin_data, r.garmin_device_name
FROM runs r
WHERE r.id = $1;

-- Get time-series for graphs
SELECT 
    elapsed_ms, distance_so_far,
    heart_rate, heart_rate_zone,
    pace, cadence,
    ground_contact_time, vertical_oscillation,
    altitude, bearing,
    terrain_grade, estimated_fatigue
FROM watch_biometric_samples
WHERE run_id = $1
ORDER BY elapsed_ms ASC;
```

---

## Success Metrics

✅ **Data Completeness**: All 23+ metrics used in at least one insight
✅ **Visualization Quality**: Graphs are readable on 5-6" screens
✅ **AI Insights**: 4+ distinct analysis types (form, training, pace, terrain)
✅ **User Understanding**: Insights explain "why" and suggest next steps
✅ **Attribution**: Every Garmin graph/insight includes disclosure
✅ **Performance**: Graphs load in <500ms

---

## Example: Complete Post-Run Flow

**User completes 10km run on Garmin watch:**

1. **Upload**: All 23+ metrics + time-series sent to backend
2. **Analysis**: Claude AI receives:
   - Run summary (10km, 48min, 4:48 pace, avg 148 HR)
   - All biomechanical metrics (GCT, VO, stride, etc.)
   - User's baseline (4-week average)
   - Terrain context (150m elevation)
3. **AI Generates**:
   - ✅ Form Analysis: "Ground contact time is excellent"
   - ✅ Training Load: "Good aerobic session, 3.2 TE"
   - ✅ Pace/Effort: "HR well-controlled for pace"
   - ✅ Elevation: "Strong climbing performance"
4. **Graphs Rendered**:
   - ✅ HR over distance chart
   - ✅ Zone distribution pie chart
   - ✅ HR vs elevation overlay
5. **User Sees**:
   - Premium AI insights (4 detailed analyses)
   - Professional graphs with zone overlays
   - Garmin attribution on each item
   - Actionable recommendations

**Result**: User understands not just WHAT they did, but HOW WELL they did it and WHY.

