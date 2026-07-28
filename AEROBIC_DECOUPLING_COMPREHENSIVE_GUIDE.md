# Aerobic Decoupling in AiRunCoach — Complete Technical Reference

## 📋 Executive Summary

**Aerobic Decoupling** is a performance metric that measures how well a runner's **heart rate (HR) and pace stayed aligned** throughout a run. It quantifies whether the runner was able to maintain their target pace without increasing heart rate (i.e., no physiological "drift"), which is a strong indicator of aerobic fitness.

**Key Insight**: Lower decoupling = better aerobic efficiency. A decoupled run means the heart had to work progressively harder to maintain the same pace, indicating fatigue or suboptimal aerobic fitness.

---

## 1️⃣ Definition & Calculation

### Formula

```kotlin
hrDrift = ((secondHalfHr - firstHalfHr) / firstHalfHr) × 100%
paceDrift = ((secondHalfPace - firstHalfPace) / firstHalfPace) × 100%
decoupling = hrDrift + paceDrift  // Combined drift percentage
```

### What It Measures

| Component | Meaning |
|-----------|---------|
| **HR Drift** | Percentage increase in heart rate from first half to second half of run |
| **Pace Drift** | Percentage *increase* in pace time (slower = higher value) from first half to second half |
| **Combined Decoupling** | Sum of both drifts — total physiological + performance drift |

### Data Sources

```
heartRateData      List<Int>       Time-series HR samples throughout run
kmSplits           List<KmSplit>   Per-kilometer pace data
```

**Validation Conditions**:
- `run.heartRateData` must have ≥10 samples
- `run.kmSplits` must have ≥2 splits
- Both pace values must be > 0

---

## 2️⃣ The Composable(s) — Full Source

### Location in Code

**File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt`

**Function**: `AerobicDecouplingCard()` (private composable)

**Line Range**: 7363–7477

### Complete Source Code

```7363:7477:app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt
private fun AerobicDecouplingCard(run: RunSession) {
    val hr = run.heartRateData?.filter { it > 0 }.orEmpty()
    if (hr.size < 10 || run.kmSplits.size < 2) return

    val paces = run.kmSplits.map { parsePaceToSeconds(it.pace).toDouble() }.filter { it > 0 }
    if (paces.size < 2) return

    // Split HR and pace into halves
    val hrMid = hr.size / 2
    val paceMid = paces.size / 2

    val firstHalfHr = hr.subList(0, hrMid).average()
    val secondHalfHr = hr.subList(hrMid, hr.size).average()
    val firstHalfPace = paces.subList(0, paceMid).average()
    val secondHalfPace = paces.subList(paceMid, paces.size).average()

    val hrDrift = ((secondHalfHr - firstHalfHr) / firstHalfHr) * 100
    val paceDrift = ((secondHalfPace - firstHalfPace) / firstHalfPace) * 100
    val decoupling = hrDrift + paceDrift // combined drift percentage

    val (rating, color, advice) = when {
        decoupling < 3.0 -> Triple(
            "Excellent",
            Color(0xFF4CAF50),
            "Your aerobic system handled this effort efficiently. Strong fitness indicator."
        )
        decoupling < 5.0 -> Triple(
            "Good",
            Color(0xFF8BC34A),
            "Minimal cardiac drift — your aerobic base is solid for this pace."
        )
        decoupling < 8.0 -> Triple(
            "Moderate",
            Color(0xFFFFC107),
            "Some HR-pace decoupling detected. More aerobic base work (easy runs) would help."
        )
        else -> Triple(
            "High",
            Colors.error,
            "Significant decoupling — either the effort was above threshold or aerobic fitness needs development."
        )
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🔬", style = AppTextStyles.h3)
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        "Aerobic Decoupling",
                        style = AppTextStyles.body.copy(fontWeight = FontWeight.ExtraBold),
                        color = Colors.textPrimary
                    )
                    Text(
                        "Heart rate vs pace drift analysis",
                        style = AppTextStyles.caption,
                        color = Colors.textSecondary
                    )
                }
            }

            // Decoupling percentage with gauge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("HR Drift", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        "${if (hrDrift >= 0) "+" else ""}${String.format(Locale.US, "%.1f", hrDrift)}%",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = if (hrDrift > 5) Colors.error else Colors.textPrimary
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Pace Drift", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        "${if (paceDrift >= 0) "+" else ""}${String.format(Locale.US, "%.1f", paceDrift)}%",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                        color = if (paceDrift > 3) Color(0xFFFF9800) else Colors.textPrimary
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Decoupling", style = AppTextStyles.caption, color = Colors.textMuted)
                    Text(
                        "${String.format(Locale.US, "%.1f", decoupling)}%",
                        style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
                        color = color
                    )
                }
            }

            Box(
                modifier = Modifier
                    .background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
                    .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(rating, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = color)
            }

            Text(advice, style = AppTextStyles.small, color = Colors.textSecondary)
        }
    }
}
```

---

## 3️⃣ Where It Appears in the UI

### Screen & Tab Location

| Component | Location |
|-----------|----------|
| **Screen** | `RunSummaryScreen` (post-run analysis) |
| **Tab** | "Graphs" tab (accessed after completing a run) |
| **Card Order** | Displayed after "Fatigue Curve" analysis |

### Layout Hierarchy

```
RunSummaryScreen
  └─ GraphsTabContent()
      └─ LazyColumn
          ├─ FatigueCurveCard()           [shows pace decay]
          ├─ AerobicDecouplingCard()      [← THIS CARD]
          ├─ RunningEconomyCard()         [pace vs HR efficiency]
          ├─ RaceTimePredictorCard()
          └─ WeatherPerformanceCard()
```

### Rendering Condition

The card is **always attempted to render**, but only displays if:
- `run.heartRateData` has ≥10 valid samples
- `run.kmSplits` has ≥2 splits

If conditions aren't met, the composable early-returns and nothing is drawn.

---

## 4️⃣ Exact Data Used from Run Session

### Primary Data Fields

```kotlin
run.heartRateData     // List<Int> — time-series HR samples (bpm)
run.kmSplits          // List<KmSplit> — per-km pace data
```

### RunSession Data Model (Relevant Fields)

```kotlin
val heartRateData: List<Int>? = null        // HR per ~2 second sample (from Garmin)
val kmSplits: List<KmSplit> = emptyList()   // Each element has: distance, time, pace

// KmSplit structure (from gradle schema):
data class KmSplit(
    val pace: String          // Format: "M:SS/km" or "M:SS"
    // ... other fields ...
)
```

### Data Processing Steps

1. **Filter HR**: Remove zero/invalid values → `run.heartRateData?.filter { it > 0 }.orEmpty()`
2. **Parse Pace**: Convert "M:SS" string to seconds
   ```kotlin
   fun parsePaceToSeconds(pace: String): Int {
       val cleaned = pace.replace("/km", "").trim()
       val parts = cleaned.split(":")
       if (parts.size == 2) {
           val min = parts[0].toIntOrNull() ?: return 0
           val sec = parts[1].toIntOrNull() ?: return 0
           return min * 60 + sec
       }
       return cleaned.toIntOrNull() ?: 0
   }
   ```
3. **Convert to Double**: For averaging precision
4. **Split in Half**: Divide both arrays at midpoint
5. **Average Each Half**: Compute mean HR and mean pace for first vs second half
6. **Calculate Drifts**: Apply percentage change formulas

---

## 5️⃣ Color Rules & Design System

### Color Palette

| Rating | Threshold | Color | Hex Code | Usage |
|--------|-----------|-------|----------|-------|
| **Excellent** | < 3.0% | Bright Green | `#FF4CAF50` | Best aerobic fitness |
| **Good** | 3.0–5.0% | Light Green | `#FF8BC34A` | Solid base building |
| **Moderate** | 5.0–8.0% | Yellow | `#FFFFC107` | Room for improvement |
| **High** | ≥ 8.0% | Error Red | `Colors.error` | Significant drift |

### Visual Hierarchy

```
┌─────────────────────────────────────┐
│ 🔬 Aerobic Decoupling               │
│    Heart rate vs pace drift analysis│
├─────────────────────────────────────┤
│  HR Drift    │  Pace Drift  │ Decoupling
│   +2.3%      │    +1.8%     │    +4.1%
│              │              │  (combined)
├─────────────────────────────────────┤
│        [ GOOD ]   ← Rating badge    │
├─────────────────────────────────────┤
│ "Minimal cardiac drift — your       │
│  aerobic base is solid for this     │
│  pace."                             │
└─────────────────────────────────────┘
```

### Card Design Elements

```kotlin
Card(
    colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary),
    shape = RoundedCornerShape(18.dp),        // Rounded corners
    modifier = Modifier.fillMaxWidth(),
    border = BorderStroke(1.dp, Colors.border.copy(alpha = 0.6f))  // Subtle border
)
```

- **Background**: Secondary theme color (typically dark/light surface)
- **Corner Radius**: 18dp (smooth, modern)
- **Border**: 1dp light gray, 60% opacity
- **Spacing**: 16dp internal padding, 10dp gaps between elements

### Individual Metric Styling

```kotlin
// HR Drift & Pace Drift display
Text(
    "${if (hrDrift >= 0) "+" else ""}${String.format(Locale.US, "%.1f", hrDrift)}%",
    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
    color = if (hrDrift > 5) Colors.error else Colors.textPrimary
)

// Decoupling value — bold & uses threshold color
Text(
    "${String.format(Locale.US, "%.1f", decoupling)}%",
    style = AppTextStyles.h4.copy(fontWeight = FontWeight.ExtraBold),
    color = color  // Threshold-based (green → red)
)
```

### Rating Badge

```kotlin
Box(
    modifier = Modifier
        .background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
        .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
        .padding(horizontal = 12.dp, vertical = 4.dp)
) {
    Text(rating, style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold), color = color)
}
```

- **Background**: Color at 12% opacity (soft tint)
- **Border**: Color at 30% opacity (subtle outline)
- **Shape**: Pill-shaped (999dp radius = fully rounded)
- **Text**: Bold, matches color, same hue

---

## 6️⃣ Thresholds & Reference Values

### Quality Thresholds (% Decoupling)

```kotlin
val (rating, color, advice) = when {
    decoupling < 3.0 -> Triple(
        "Excellent",
        Color(0xFF4CAF50),
        "Your aerobic system handled this effort efficiently. Strong fitness indicator."
    )
    decoupling < 5.0 -> Triple(
        "Good",
        Color(0xFF8BC34A),
        "Minimal cardiac drift — your aerobic base is solid for this pace."
    )
    decoupling < 8.0 -> Triple(
        "Moderate",
        Color(0xFFFFC107),
        "Some HR-pace decoupling detected. More aerobic base work (easy runs) would help."
    )
    else -> Triple(
        "High",
        Colors.error,
        "Significant decoupling — either the effort was above threshold or aerobic fitness needs development."
    )
}
```

### Individual Component Thresholds

| Metric | Threshold | Status |
|--------|-----------|--------|
| **HR Drift** | > 5% | Highlighted in red |
| **Pace Drift** | > 3% | Highlighted in orange |
| **Decoupling** | < 3% | Excellent aerobic efficiency |
| **Decoupling** | 3–5% | Good base fitness |
| **Decoupling** | 5–8% | Moderate, improvement opportunity |
| **Decoupling** | ≥ 8% | High — needs more aerobic work |

### Interpretation Guide

| Decoupling Range | Meaning | Recommendation |
|------------------|---------|-----------------|
| **0–3%** | Strong aerobic efficiency | Maintain current training; ready for higher intensity |
| **3–5%** | Solid aerobic base | Continue base-building with Zone 2 work |
| **5–8%** | Adequate fitness | Increase easy running volume (Zone 1–2) |
| **8–15%** | Some fatigue evident | Focus on aerobic capacity building; reduce high-intensity |
| **15%+** | Significant breakdown | Rest or extended recovery; address fatigue |

---

## 7️⃣ Early vs Late Pace/HR Computation

### Algorithm

```kotlin
// Split into two equal halves

// HEART RATE
val hrMid = hr.size / 2
val firstHalfHr = hr.subList(0, hrMid).average()           // First 50% of samples
val secondHalfHr = hr.subList(hrMid, hr.size).average()    // Last 50% of samples

// PACE (from km splits)
val paceMid = paces.size / 2
val firstHalfPace = paces.subList(0, paceMid).average()    // First 50% of splits
val secondHalfPace = paces.subList(paceMid, paces.size).average()  // Last 50% of splits
```

### Key Details

**Splitting Method**: **Chronological middle** (not distance-based)
- HR: Divides time-series data at temporal midpoint
- Pace: Divides km split list at index midpoint

**Why This Approach**:
- Simple and deterministic
- Works regardless of run distance
- Captures early vs late effort without weighting by distance

**Example (8 km run with HR data every ~2 seconds)**:
```
Samples: [72, 75, 78, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93]  (16 samples)
        └──────────────────┬──────────────────────────────────────────┘
        First half: avg 79.25 bpm        Last half: avg 88.5 bpm
        
HR Drift = (88.5 - 79.25) / 79.25 × 100 = +11.6%
```

---

## 📊 Related Metrics & Components

### In Same Card Row (Multi-Metric Analysis)

All these appear in the **Graphs Tab → Multi-Metric Analysis section** (Garmin data only):

1. **Fatigue Curve Card** (before decoupling)
   - Shows pace decay across thirds of run
   - Formula: `(lastThird - middleThird) / middleThird × 100%`
   - Thresholds: 0% (negative split) → 10%+ (significant fatigue)

2. **Aerobic Decoupling Card** (this document)
   - HR + pace drift combined
   - Thresholds: < 3% (excellent) → ≥ 8% (high)

3. **Running Economy Card** (after decoupling)
   - Pace per heartbeat: `(speedMs / heartRate) × 1000`
   - Thresholds: > 7.0 (elite) → < 4.0 (developing)

4. **Race Time Predictor** (below economy)
   - Estimates performance at different distances

5. **Weather Performance Card** (bottom)
   - Impact of temperature, humidity, pressure on pace

### Related Metrics in Server/Request Models

```kotlin
// From ComprehensiveAnalysisRequest.kt
val aerobicTrainingEffect: Float? = null      // 0-5 scale (Garmin metric)
val anaerobicTrainingEffect: Float? = null    // 0-5 scale (Garmin metric)

// From RunSession.kt
val aerobicTrainingEffect: Float? = null      // Training load from device
val anaerobicTrainingEffect: Float? = null    // Sprint/threshold load
```

---

## 🔗 Data Flow

```
Garmin Watch/Device
        ↓
heartRateData (time-series)  +  kmSplits (pace per km)
        ↓
RunSession model
        ↓
GraphsTabContent() [RunSummaryScreen]
        ↓
AerobicDecouplingCard()
  ├─ Filter HR > 0
  ├─ Parse pace strings to seconds
  ├─ Split both arrays at midpoint
  ├─ Average first half vs second half
  ├─ Calculate hrDrift & paceDrift
  ├─ Apply threshold logic
  └─ Render card with color/rating
```

---

## 🧪 Testing Scenarios

### Test Case 1: Perfect Aerobic Efficiency (Excellent)

```
Input:
  Heart Rate: [70, 71, 71, 72, 72] (first) → [72, 73, 73, 73, 74] (last)  avg drift: +2.5%
  Pace (sec): [360, 361, 361, 362] (first) → [362, 362, 363, 363] (last)   avg drift: +0.3%
  
Calculation:
  firstHalfHr  = 71.2 bpm
  secondHalfHr = 73.0 bpm
  hrDrift      = (73-71.2)/71.2 × 100 = +2.5%
  
  firstHalfPace = 361 sec
  secondHalfPace = 362.5 sec
  paceDrift     = (362.5-361)/361 × 100 = +0.4%
  
  decoupling    = 2.5 + 0.4 = 2.9% < 3.0
  
Output: "Excellent" ✅ Green card
```

### Test Case 2: Moderate Decoupling

```
Input:
  Heart Rate: [140, 142, 144, 145] (first) → [152, 154, 156, 158] (last)   ~+9% drift
  Pace (sec): [300, 302, 301, 300] (first) → [310, 312, 315, 318] (last)   ~+5% slower
  
Calculation:
  firstHalfHr  = 142.75 bpm
  secondHalfHr = 155 bpm
  hrDrift      = (155-142.75)/142.75 × 100 = +8.5%
  
  firstHalfPace = 300.75 sec
  secondHalfPace = 313.75 sec
  paceDrift     = (313.75-300.75)/300.75 × 100 = +4.3%
  
  decoupling    = 8.5 + 4.3 = 12.8% > 8.0
  
Output: "High" 🔴 Red card — "Significant decoupling..."
```

### Validation Checks

```kotlin
// Early return if data insufficient
if (hr.size < 10 || run.kmSplits.size < 2) return  // No card shown
if (paces.size < 2) return                          // No card shown
```

---

## 🎯 Coach Integration & Messaging

### Contextual Advice by Rating

| Rating | Key Message | Coach Action |
|--------|-------------|--------------|
| Excellent | "Strong fitness indicator" | Praise & suggest race readiness |
| Good | "Aerobic base is solid" | Recommend maintaining Zone 2 volume |
| Moderate | "More aerobic base work" | Suggest +1–2 easy runs per week |
| High | "Effort was above threshold" | Check if workout was intentionally hard, or recommend recovery |

### Integration Points

- **AI Coach Analysis** (`session-coaching-service.ts` on server) can reference decoupling when creating post-run feedback
- **Training Plan Adaptation** can use decoupling trend to auto-adjust zone distribution
- **Athlete Education** can highlight that "low decoupling" is result of consistent Zone 2 training

---

## ❓ FAQ

**Q: Why combine HR drift + pace drift instead of just looking at HR drift?**
A: Combined metric is more holistic — it captures both cardiovascular fatigue (HR) and performance breakdown (pace). A runner who holds pace at cost of extreme HR effort (high HR drift, zero pace drift) still has poor aerobic efficiency.

**Q: What if a runner intentionally did a hard workout?**
A: High decoupling is expected in threshold/VO2 Max workouts. The card's advice acknowledges this: "either the effort was above threshold or aerobic fitness needs development." Coach should contextualize the workout type.

**Q: Can decoupling be negative?**
A: Technically yes, if the runner *improved* from first to second half (negative split with lower HR). This would show as negative decoupling and would be "Excellent" since it's even better than zero drift.

**Q: How does this compare to industry standards?**
A: Elite runners often show <3% decoupling in aerobic runs. Recreational runners typically 5–10%. The thresholds in the app (3%, 5%, 8%) align with modern running science, though some sources use 5% as the "good" threshold.

---

## 📚 Related Documentation Files

- **ANDROID_3_CIRCLE_METRICS_SUMMARY.md** — Three metric rings (Effort, HR Zone, Consistency)
- **ANDROID_CIRCLE_METRICS_VISUAL_REFERENCE.md** — Visual diagrams and examples
- **HR_TO_PACE_EFFICIENCY_GRAPHS_BRIEF.md** — Running economy and efficiency tracking
- **RUNNING_DYNAMICS_POST_RUN_VISUALIZATION.md** — Garmin biomechanics (GCT, VO, etc.)

---

## 🔍 Code References

| Location | Purpose |
|----------|---------|
| `RunSummaryScreen.kt:7363–7477` | AerobicDecouplingCard composable |
| `RunSummaryScreen.kt:5335–5346` | `parsePaceToSeconds()` helper |
| `RunSummaryScreen.kt:1640` | Composable call in GraphsTabContent |
| `RunSummaryScreen.kt:7229–7358` | FatigueCurveCard (related metric) |
| `RunSession.kt:69` | `heartRateData` field definition |
| `RunSession.kt:23` | `kmSplits` field definition |

---

**Last Updated**: July 2026
**Status**: Complete reference for production
