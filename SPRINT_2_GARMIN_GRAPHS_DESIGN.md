# Sprint 2: Garmin Watch Graphs & Insights — Design Document

## Overview

Build **elite-level data visualizations** for 23+ Garmin watch metrics that:
- Apply proven axis margin rules (prevent visual distortion of consistent data)
- Transform raw metrics into actionable insights
- Display running dynamics in context of runner's personal baselines
- Tell the story of HOW the run actually went

---

## Axis Margin Philosophy

### ❌ Problem: Aggressive Spikes
When HR data varies 140-146 bpm (6 bpm spread):
- **Without margin**: Y-axis goes 140→146 → graph looks erratic
- **Visual lie**: Appears the runner had unstable effort when they were perfectly consistent

### ✅ Solution: Smart Margin Rules
```
Actual Data Range: [min, max]
Spread: max - min
Minimum Spread Threshold: 10% of typical value range

If Spread < Threshold:
    Visual Range = [min - buffer, max + buffer]
    Buffer = Threshold / 2
Else:
    Visual Range = [min, max]

Result: Consistent data looks consistent
        Variable data shows actual variation
```

### Examples

**Example 1: HR 140-146 bpm**
- Spread: 6 bpm (too small)
- Typical HR range: 140-180 bpm = 40 bpm range
- Threshold: 40 × 10% = 4 bpm
- 6 > 4, so use actual range
- **But**: Add 5% margin on top/bottom
- Visual range: 135-151 bpm (shows consistency!)

**Example 2: GCT 245-250 ms**
- Spread: 5 ms (very small)
- Typical GCT range: 200-280 ms = 80 ms range
- Threshold: 80 × 10% = 8 ms
- 5 < 8, so add buffer
- Buffer: 8 / 2 = 4 ms
- Visual range: 241-254 ms (small but honest!)

**Example 3: Pace 4:40-5:20 /km**
- Spread: 40 seconds (large)
- No buffer needed
- Visual range: 4:40-5:20 (shows real variation)

---

## Graph Library Utility

First, create reusable axis margin logic:

```kotlin
data class AxisConfig(
    val min: Float,
    val max: Float,
    val visualMin: Float,
    val visualMax: Float,
    val range: Float,
    val hasMargin: Boolean
)

fun calculateAxisConfig(
    values: List<Float>,
    typicalMin: Float,
    typicalMax: Float,
    minSpreadPercentage: Float = 0.1f
): AxisConfig {
    val min = values.minOrNull() ?: 0f
    val max = values.maxOrNull() ?: 0f
    val spread = max - min
    
    val typicalRange = typicalMax - typicalMin
    val threshold = typicalRange * minSpreadPercentage
    
    val (visualMin, visualMax, hasMargin) = if (spread < threshold) {
        // Data is very consistent - add margin
        val buffer = (threshold - spread) / 2
        Triple(
            min - buffer,
            max + buffer,
            true
        )
    } else {
        // Data has good spread - show it
        val margin = spread * 0.05f  // 5% margin
        Triple(
            min - margin,
            max + margin,
            false
        )
    }
    
    return AxisConfig(
        min = min,
        max = max,
        visualMin = visualMin,
        visualMax = visualMax,
        range = visualMax - visualMin,
        hasMargin = hasMargin
    )
}
```

---

## 5 New Graph Designs

### 1. **Heart Rate Zone Over Pace** ⭐ (Priority)

**What It Shows**: How HR effort aligns with pace targets (efficiency)

**Data Points**: 
- X-axis: Pace (min/km) — with 5-10s margin
- Y-axis: Heart Rate (bpm) — with smart margin
- Color: Zone (Z1=blue, Z2=green, Z3=yellow, Z4=orange, Z5=red)
- Size: Training effect (bigger = higher load)

**Design**:
```
┌─────────────────────────────────┐
│   Heart Rate Zone vs Pace       │
├─────────────────────────────────┤
│                                 │
│     Z5 (>85%)  ●  ○             │
│     Z4 (75-85%) ●●●●●○○         │  Red dots = Z5
│     Z3 (60-75%) ●●●●●●●●●●      │  Orange = Z4
│     Z2 (50-60%) ●●●●             │  Yellow = Z3
│     Z1 (<50%)                    │  Green = Z2
│     ┼────────────────────────────┤
│     4:30   5:00   5:30   6:00   │
│           Pace (min/km)         │
└─────────────────────────────────┘

Insight: "You stayed in Z3 for entire run - 
perfect pacing consistency for steady state"
```

**Axis Rules**:
- Pace X-axis: Use actual range + 5% margin
- HR Y-axis: Smart margin (HR varies 140-160 → show 135-165)
- Zone background: Subtle color bands (Z1-Z5)

**Insight Card**:
- Percentage time in each zone
- Zone drift (did you creep up as run progressed?)
- Efficiency score: "Perfect pace-effort match"

---

### 2. **Running Dynamics Evolution** (Form Over Time)

**What It Shows**: How form degrades or improves as run progresses

**4-Panel Small Multiples**:
```
┌─────────────────────────┐
│ Ground Contact Time     │  
│     Time →              │
│ 250ms ┌──────────────┐  │
│ 245ms │●●●●●●●●●●●● │  │  Line chart with
│ 240ms │    ↗ (fatigue)  │  smart margins
│ ─────┘               │  │
└─────────────────────────┘

┌─────────────────────────┐
│ Vertical Oscillation    │
│     Time →              │
│ 9cm  ┌──────────────┐   │
│ 8cm  │●●●●●●●●●●●● │   │
│ 7cm  │              │   │
│ ─────┘               │   │
└─────────────────────────┘

┌─────────────────────────┐
│ Stride Length           │
│     Time →              │
│ 1.45m┌──────────────┐   │
│ 1.42m│●●●●●●●●●●●● │   │
│ 1.40m│    ↘ (fatigue)  │
│ ─────┘               │   │
└─────────────────────────┘

┌─────────────────────────┐
│ Vertical Ratio          │
│     Time →              │
│ 10% ┌──────────────┐    │
│  9% │●●●●●●●●●●●● │    │
│  8% │              │    │
│ ─────┘               │    │
└─────────────────────────┘
```

**Design Features**:
- 4-panel grid (2×2)
- Time-series line chart for each metric
- Baseline as dashed line
- Color: Green (better than baseline) / Red (worse)
- Sparkline trend arrow (↗ improving, ↘ degrading)

**Axis Rules**:
- Each metric gets own axis config
- GCT: typical 240-260 range
- VO: typical 7-9cm range
- Stride: typical 1.40-1.45m
- VR: typical 8-10%
- All with smart margin logic

**Insight Card**:
```
Form Over Distance:
✓ GCT Stable: 247ms avg (±2ms) 
✓ Stride Consistent: 1.42m (no degradation)
✗ VO Increasing: +1.1cm by km 8 (fatigue)
⚠ VR Rising: 8.5% → 9.2% (form break)

Recommendation: Work on upper body tension 
in long runs - oscillation starting earlier 
than baseline
```

---

### 3. **Training Effect & Recovery Snapshot**

**What It Shows**: Aerobic/Anaerobic load vs recovery needed

**Design**:
```
┌────────────────────────────────────┐
│    Training Load Assessment        │
├────────────────────────────────────┤
│                                    │
│  Aerobic Effect:  3.8/5.0  ████░   │
│  Anaerobic:       1.2/5.0  ██░░░   │
│                                    │
│  Recovery Time:   2.5 hours        │
│                                    │
│  Your Baseline VO2 Max: 55 ml/kg   │
│  This Run Estimate:     56 ml/kg   │  +1.2 improvement!
│                                    │
│  Training Load Type:               │
│  ✓ Aerobic Building (Z2-Z3 focus)  │
│  ✓ Steady State Session            │
│  ✓ Moderate Intensity              │
│                                    │
│  Recovery Advice:                  │
│  → Easy 5km tomorrow or rest day   │
│  → Next hard session in 3 days     │
│  → Good progression for base phase │
│                                    │
└────────────────────────────────────┘
```

**Insight Logic**:
- TE bars with zone coloring
- Recovery time contextual (easy = 1h, moderate = 2h, hard = 4h)
- VO2 Max change only if significant (±1%)
- Training type inferred from TE + zone mix
- Recovery advice based on TE + last 7 days history

---

### 4. **Ground Contact Balance & Asymmetry Alert**

**What It Shows**: Left-right symmetry (injury risk indicator)

**Design**:
```
┌────────────────────────────────────┐
│  Ground Contact Balance            │
├────────────────────────────────────┤
│                                    │
│           LEFT  │  RIGHT           │
│            48%  │  52%             │
│  ←┴────────┴→   ←┴────────┴→      │
│        BALANCED (±2%)              │
│                                    │
│  Balance Over Run:                 │
│  Start: 49% | L        Mid: 48%L   │
│  End: 52% R   (drifting R)         │
│                                    │
│  ⚠ Alert: Right-loading trend      │
│  → Check right hip flexibility     │
│  → Assess right glute activation   │
│  → Consider 1-leg drills next week │
│                                    │
│  Note: ±3% variation is normal     │
│        >5% difference = asymmetry  │
│                                    │
└────────────────────────────────────┘
```

**Alert Logic**:
- ±2%: Perfectly balanced (✓)
- ±3-5%: Minor asymmetry (→)
- >±5%: Significant asymmetry (⚠)
- Trend detection: Check if drifting L or R
- Corrective advice: Specific to which side

---

### 5. **Pace vs Ground Contact Time** (Efficiency Indicator)

**What It Shows**: Form efficiency at different paces

**Design**:
```
┌──────────────────────────────────┐
│   Pace vs Form Efficiency       │
├──────────────────────────────────┤
│                                  │
│ GCT (ms)                         │
│ 270 │                       ●●●  │ Slow = longer contact
│ 260 │                 ●●●●●●    │
│ 250 │         ●●●●●●●●          │
│ 240 │     ●●●●                   │
│ 230 │ ●●                          │
│ ────┼────────────────────────────│
│    6:00   5:30   5:00   4:30    │
│           Pace (min/km)          │
│                                  │
│ Efficiency: 
│ ✓ Faster pace = shorter contact │
│ ✓ Good neuromuscular development│
│                                  │
│ Expected: GCT decreases ↓ as pace ↑
│ Actual: Perfect linear correlation
│                                  │
└──────────────────────────────────┘
```

**Insight Card**:
- Efficiency ratio: How much does GCT change per 30s pace improvement?
- Comparison to baseline: Is this normal for you?
- Form quality at race pace: If you race Z4, what's your GCT?

---

## Supporting Components

### Insight Cards (Reusable Template)

```kotlin
@Composable
fun GarminInsightCard(
    title: String,
    metrics: List<MetricDisplay>,
    alert: AlertLevel = AlertLevel.NONE,
    advice: String = "",
    comparison: String? = null
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = when(alert) {
                AlertLevel.NONE -> Colors.backgroundSecondary
                AlertLevel.WARNING -> Colors.warningBackground
                AlertLevel.CRITICAL -> Colors.errorBackground
            }
        )
    ) {
        Column(Modifier.padding(Spacing.lg)) {
            // Title with alert icon
            Row(verticalAlignment = Alignment.CenterVertically) {
                when(alert) {
                    AlertLevel.NONE -> {
                        Icon(Icons.Default.CheckCircle, "Good", tint = Colors.success)
                    }
                    AlertLevel.WARNING -> {
                        Icon(Icons.Default.Warning, "Warning", tint = Colors.warning)
                    }
                    AlertLevel.CRITICAL -> {
                        Icon(Icons.Default.Error, "Alert", tint = Colors.error)
                    }
                }
                Spacer(Modifier.width(Spacing.sm))
                Text(title, style = AppTextStyles.h4)
            }
            
            Spacer(Modifier.height(Spacing.md))
            
            // Metrics
            metrics.forEach { metric ->
                MetricRow(metric)
            }
            
            // Comparison
            if (comparison != null) {
                Spacer(Modifier.height(Spacing.sm))
                Text(comparison, style = AppTextStyles.caption, color = Colors.textSecondary)
            }
            
            // Advice
            if (advice.isNotEmpty()) {
                Spacer(Modifier.height(Spacing.md))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Colors.primaryContainer, RoundedCornerShape(8.dp))
                        .padding(Spacing.md)
                ) {
                    Text(advice, style = AppTextStyles.body, color = Colors.onPrimaryContainer)
                }
            }
        }
    }
}
```

### Metric Row Display

```kotlin
@Composable
fun MetricRow(metric: MetricDisplay) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(metric.icon, null, tint = metric.color, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(Spacing.sm))
            Text(metric.label, style = AppTextStyles.body)
        }
        
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(metric.value, style = AppTextStyles.bodyBold, color = metric.color)
            if (metric.change != null) {
                Spacer(Modifier.width(Spacing.xs))
                Badge(
                    text = metric.change,
                    color = if(metric.isBetter) Colors.success else Colors.warning
                )
            }
        }
    }
}

data class MetricDisplay(
    val label: String,
    val value: String,
    val icon: Int,
    val color: Color,
    val change: String? = null,  // "+1.2%", "-5ms"
    val isBetter: Boolean = true
)
```

---

## Implementation Order

### Phase 1 (This Sprint)
1. ✅ Create `GraphAxisConfig` utility (reusable margin logic)
2. ✅ Build `HeartRateZonePaceChart` (priority graph)
3. ✅ Build `RunningDynamicsPanel` (4-panel form visualization)
4. ✅ Build `TrainingEffectCard` (load assessment)

### Phase 2 (Next Sprint)
5. Build `GroundContactBalanceChart` (asymmetry detection)
6. Build `PaceFormEfficiencyChart` (GCT vs pace)
7. Integrate all 5 graphs into `RunSummaryScreen`
8. Add filter toggles (show/hide by type)

### Phase 3 (Polish)
9. Add comparative overlays (this run vs baseline)
10. Implement swipe-through view (one graph at a time)
11. Add export capability (PNG/PDF for sharing)

---

## Color Coding Standards

```
Heart Rate Zones:
  Z1 (<50%):    BLUE     #4A90E2
  Z2 (50-60%):  GREEN    #7ED321
  Z3 (60-75%):  YELLOW   #F5A623
  Z4 (75-85%):  ORANGE   #FF6B35
  Z5 (>85%):    RED      #D0021B

Form Quality:
  Better/Improving:  GREEN    #7ED321
  Same/Stable:       GRAY     #999999
  Worse/Degrading:   ORANGE   #F5A623
  Alert:             RED      #D0021B

Data States:
  Available:         FULL opacity
  Baseline:          DASHED line
  Threshold:         LIGHT background band
```

---

## Success Criteria

✅ No graph shows artificial spikes from tiny data ranges
✅ Consistent data (140-146 HR) looks visually consistent
✅ Variable data (pace 4:40-5:20) shows real variation
✅ All axes have sensible margins (5-10%)
✅ Insight cards provide actionable recommendations
✅ Color coding matches zone/status standards
✅ Readable on both phone and tablet screens
✅ No data distortion or misrepresentation

