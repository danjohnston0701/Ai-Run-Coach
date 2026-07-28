# Android 3 Circle Metrics Documentation - Quick Index

## 📋 Documentation Files

This research provides comprehensive documentation about the **3 Circle Metrics** displayed in the Android app's Run Summary "Graphs" tab.

### Files Created

1. **ANDROID_3_CIRCLE_METRICS_SUMMARY.md** (364 lines)
   - Complete technical documentation
   - All calculation formulas
   - Data sources and dependencies
   - Testing & debugging guidance
   - **START HERE for detailed information**

2. **ANDROID_CIRCLE_METRICS_VISUAL_REFERENCE.md** (471 lines)
   - Visual diagrams and ASCII layouts
   - Color palette reference
   - Example displays for each circle
   - Calculation examples with numbers
   - Edge cases and special states
   - **START HERE for visual understanding**

---

## 🎯 Quick Facts

### The 3 Circles (Left to Right)

| Circle | Metric | Shows When | Range | Color Gradient |
|--------|--------|-----------|-------|-----------------|
| 1️⃣ | **EFFORT** | Always | 0-100% | Green → Red |
| 2️⃣ | **HR ZONE** | HR data available | 0-100% | Gray → Green → Red |
| 2️⃣ | **CADENCE** | NO HR data | 0-120% | Gray → Green → Red |
| 3️⃣ | **CONSISTENCY** | Split data | 0-100% | Gray → Green → Red |

### Location in Code

```
File: app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt

Key Components:
├─ GraphsTabContent()          (line 1538) - Main Graphs tab
├─ RunMetricRingsRow()         (line 6676) - Container for 3 circles
├─ MetricRing()               (line 6879) - Individual ring component
├─ calculateEffortScore()      (line 5973) - Effort calculation
├─ computeOptimalCadence()     (line 6585) - Target cadence calculation
├─ cadenceQualityScore()       (line 6664) - Cadence quality scoring
└─ [Consistency calculation]   (line 6772) - Built-in to RunMetricRingsRow()
```

---

## 📊 What Each Circle Shows

### Circle #1: EFFORT
**Multi-factor effort score combining:**
- Duration (0-20 pts)
- Distance (0-20 pts)
- Pace intensity (0-25 pts)
- Elevation gain (0-15 pts)
- Heart rate (0-20 pts, fallback 10)
- **Total: 0-100%**

**Data needed:** `distance`, `duration`, `heartRate`, `elevationGain`, `userAge`

---

### Circle #2: HR ZONE or CADENCE

#### When HR Available (Preferred)
**Heart Rate Zone Quality** based on:
- User's max HR (via Tanaka formula: 208 - 0.7×age)
- Zone 2 (60-70% maxHR) = Excellent ✅
- Zone 3 (70-80% maxHR) = Good ✅
- Other zones = Less ideal for aerobic training

**Data needed:** `heartRate`, `heartRateData`, `userAge`

#### When NO HR Available (Fallback)
**Cadence Quality** based on:
- Actual cadence vs. personalized target
- Target = speed × height × age × weight × incline
- Displayed as % of target
- 100% = at target, capped at 120%

**Data needed:** `cadence`, `userHeightCm`, `userAge`, `userWeightKg`

---

### Circle #3: CONSISTENCY
**Pace consistency via Coefficient of Variation:**
- Measures variation in km split times or pace samples
- CV near 0 = perfectly even = 100% score
- Higher CV = more variable = lower score
- Formula: `score = (1 - CV×5) × 100%`

**Data needed:** `kmSplits` (size ≥ 2) OR `paceData` (size ≥ 10)

---

## 🎨 Color System (All 3 Circles Use Same Colors)

```
Metric    Threshold      Color              Label
─────────────────────────────────────────────────────
          90%+           🟢 Bright Green    Excellent
          75-89%         🟢 Light Green     Good/Solid
          55-74%         🟡 Yellow          Average/Variable
          35-54%         🟠 Orange          Caution/Low
          <35%           🔴 Red             Bad/Uneven
          No Data        ⚫ Gray             No Data
```

---

## 📈 Ring Visual Properties

```
Size:          86 dp diameter
Stroke:        9 dp (donut style)
Animation:     1200 ms, FastOutSlowInEasing
Glow:          18% opacity subtle highlight
Layout:        3 equal-width rings in horizontal row
Progress:      Clockwise from -90° (top)
Center Text:   Bold 14sp, percentage value
```

---

## 🔄 Data Flow

```
RunSummaryScreen.kt
    ↓
GraphsTabContent()
    ↓
RunMetricRingsRow()
    ├─ calculateEffortScore() → Ring #1
    ├─ HR Zone calculation → Ring #2a (if HR available)
    │  OR computeOptimalCadence() → Ring #2b (if NO HR)
    └─ Consistency calc → Ring #3
    ↓
MetricRing() × 3 (render all circles)
```

---

## ✅ Data Validation

| Circle | Condition | Behavior |
|--------|-----------|----------|
| EFFORT | Always | Always shows (never missing) |
| HR ZONE | `heartRate > 0` | Shows HR zone ring |
| CADENCE | `heartRate <= 0` + `cadence > 0` | Shows cadence ring (fallback) |
| CONSISTENCY | `kmSplits ≥ 2` OR `paceData ≥ 10` | Shows ring with data |

If no data: Ring shows "--" text and appears gray.

---

## 🧮 Key Formulas Quick Reference

### Tanaka Max HR
```kotlin
maxHr = 208 - (0.7 × age)
// Falls back to 185 if age unknown
```

### HR Zone Progress
```kotlin
hrFraction = avgHr / maxHr  // Range: 0.0 to 1.0
ringFill = hrFraction × 360°
```

### Cadence Quality
```kotlin
cadenceScore = (actualCadence / targetCadence).coerceIn(0f, 1.2f)
ringFill = (cadenceScore / 1.2f) × 360°  // Capped at 100%
```

### Consistency (CV)
```kotlin
mean = average(splits)
stdDev = sqrt(avg((split - mean)²))
cv = stdDev / mean
consistency = (1 - cv×5).coerceIn(0, 1)  // Range: 0.0 to 1.0
```

---

## 🐛 Debugging Checklist

- [ ] User profile loaded from SharedPreferences (age, height, weight)
- [ ] RunSession has valid data (distance, duration, heartRate, etc.)
- [ ] Circle colors match quality thresholds
- [ ] Rings animate smoothly on load (1200ms)
- [ ] Fallback from HR Zone to Cadence when HR missing
- [ ] "No Data" state shows gray ring with "--"
- [ ] Responsive layout maintains 1/3 width per circle
- [ ] Canvas stroke and glow render correctly

---

## 📱 Device Compatibility

- ✅ Portrait orientation
- ✅ Landscape orientation (same layout)
- ✅ Small phones (responsive)
- ✅ Tablets (responsive)
- ⚠️ Very small screens (<300dp) may need adjustment

---

## 🔗 Related Components

**Same Screen (Graphs Tab):**
- Charts Section (pace, elevation, cadence, HR graphs)
- Heart Rate Analysis (zones visualization, HR vs pace scatter)
- Multi-Metric Analysis (Garmin only: fatigue curve, running economy, etc.)

**Other Tabs:**
- Summary Tab: Effort Score Card (similar but more detailed)
- Summary Tab: Pace Consistency Result (alternative consistency viz)

---

## 📚 For More Details

See the full documentation files:

1. **ANDROID_3_CIRCLE_METRICS_SUMMARY.md**
   - Complete formulas and calculations
   - All data sources and dependencies
   - Testing and debugging guidance
   - Color palette hex codes

2. **ANDROID_CIRCLE_METRICS_VISUAL_REFERENCE.md**
   - ASCII diagrams and layouts
   - Visual examples for each circle
   - Calculation walkthroughs with numbers
   - Edge cases and special states
   - Responsive design behavior

---

## 📝 Notes

- All three rings use the same 5-color quality palette
- User profile personalization critical for accuracy (age, height, weight)
- HR Zone is preferred over Cadence when HR data available
- Consistency score uses CV (statistical measure) for fairness
- All calculations cached with `remember {}` for performance
- Rings animate independently but start together

---

## 🎓 Key Takeaways

1. **3 Circles = 3 Metrics**: Effort, HR/Cadence, Consistency
2. **Personalized Scoring**: Age, height, weight all matter
3. **Visual Consistency**: Same color scheme across all rings
4. **Smart Fallbacks**: HR Zone → Cadence when HR unavailable
5. **Real-Time Data**: Uses actual run data from RunSession
6. **Responsive Design**: Adapts to all screen sizes
7. **Animated Display**: Smooth 1200ms ease-out on load

