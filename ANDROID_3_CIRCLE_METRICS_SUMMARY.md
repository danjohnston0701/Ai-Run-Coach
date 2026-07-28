# Android App: 3 Circle Metrics in Run Summary Graphs Tab

## Overview
The Android app displays **three circular progress metric rings** in the Graphs tab of the Run Summary screen. These rings visualize the quality of three key running performance dimensions:

1. **EFFORT** - Multi-factor effort score (0-100%)
2. **HR ZONE** or **CADENCE** - Heart rate zone quality (when HR available) or cadence quality (fallback)
3. **CONSISTENCY** - Pace consistency score

All three metrics are displayed side-by-side in a horizontal row within a card titled "Run Score".

---

## File Locations

### Main UI Components
- **Screen Composable**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt`
- **ViewModel**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSummaryViewModel.kt`

### Key Functions
- **Main Layout** (line 1538): `GraphsTabContent()`
  - Renders the Graphs tab with all charts
  - Line 1568: Calls `RunMetricRingsRow()`

- **Ring Row Container** (line 6676): `RunMetricRingsRow()`
  - Computes all three metrics
  - Displays the 3 circular progress indicators

- **Individual Ring** (line 6879): `MetricRing()`
  - Composable for a single metric ring
  - Handles drawing the circular progress indicator with glow effect

---

## Ring #1: EFFORT Score

### Visual Display
- **Label**: "EFFORT"
- **Value**: Percentage (0-100%)
- **Badge**: Quality label (Recovery, Easy, Moderate, Hard, Maximum Effort)
- **Color Code**:
  - Green (`#4CAF50`): Recovery (0-19%)
  - Light Green (`#8BC34A`): Easy (20-39%)
  - Yellow (`#FFC107`): Moderate (40-59%)
  - Orange (`#FF9800`): Hard (60-79%)
  - Red (`#FF5252`): Maximum Effort (80-100%)

### Calculation (Lines 5973-6032: `calculateEffortScore()`)

Multi-factor effort calculation combining:

1. **Duration Score** (0-20 pts)
   - 30 min = 10 pts
   - 60 min = 18 pts
   - 90+ min = 20 pts

2. **Distance Score** (0-20 pts)
   - Linear scale: 0 km → 0 pts, 20 km → 20 pts

3. **Pace Intensity Score** (0-25 pts)
   - 3:00/km = 25 pts (elite)
   - 7:00/km = 5 pts (easy jog)
   - Formula: `((420 - paceSec) / 240) × 25`

4. **Elevation Score** (0-15 pts)
   - Linear: 500m elevation gain = 15 pts

5. **Heart Rate Score** (0-20 pts, or 10 if no HR)
   - Uses **Tanaka max HR formula**: `208 - (0.7 × age)`
   - Falls back to 185 bpm if age unknown
   - HR Percent = `(avgHR / maxHR) × 100`
   - Score: `((hrPercent - 50) / 50) × 20`

**Total**: Sum of all factors, clamped to 0-100 and rounded to nearest integer

**Data Sources**:
- `run.duration` (milliseconds)
- `run.distance` (meters)
- `run.totalElevationGain` (meters)
- `run.heartRate` (bpm, average)
- `userAge` (from SharedPreferences user profile)

---

## Ring #2: HR ZONE or CADENCE

### When HR Data is Available: HR ZONE Quality

**Triggers**: `run.heartRate > 0`

**Visual Display**:
- **Label**: "HR ZONE"
- **Value**: `(avgHR / maxHR) × 100%`
- **Sub-Label**: `"{avgHR} bpm"`
- **Target Label**: `"max {maxHR} bpm"`
- **Badge**: Zone designation (Zone 1-5)

**Zone Thresholds** (computed from user's personalized max HR):
- Zone 1: < 60% maxHR (Recovery)
- Zone 2: 60-70% maxHR (Aerobic/Endurance - **Excellent**)
- Zone 3: 70-80% maxHR (Tempo - **Good**)
- Zone 4: 80-90% maxHR (VO₂ Max/Threshold - **Caution**)
- Zone 5: 90-100% maxHR (Anaerobic/Maximum - **Bad**)

**Color Logic** (Lines 6726-6734):
- Zone 2 → Bright Green (`#00E676`) - Excellent
- Zone 3 → Light Green (`#69F0AE`) - Good
- Zone 1 → Yellow (`#FFEE58`) - Average
- Zone 4 → Orange (`#FF9800`) - Caution
- Zone 5 → Red (`#FF5252`) - Bad
- No HR → Muted Gray

**Ring Progress Value**:
```kotlin
hrFraction = (displayedAvgHr.toFloat() / maxHr.toFloat()).coerceIn(0f, 1f)
```

**Data Sources**:
- `run.heartRate` (overall average, bpm)
- `run.heartRateData` (optional: array of per-sample HR values)
  - If available, computed average is used instead of overall average for accuracy
- `userAge` (for Tanaka formula max HR calculation)

---

### When No HR Data: CADENCE Fallback

**Triggers**: `run.heartRate <= 0` (no heart rate data available)

**Visual Display**:
- **Label**: "CADENCE"
- **Value**: `(cadenceScore × 100)%` (percentage of target)
- **Sub-Label**: `"{actual} spm"`
- **Target Label**: `"target {targetCadence} spm"`
- **Badge**: Quality assessment

**Cadence Quality Scoring** (Lines 6664-6673: `cadenceQualityScore()`)

```kotlin
percentage = (actual / targetCadence).coerceIn(0f, 1.2f)
score = (percentage / 1.2f).coerceIn(0f, 1f)
```

- At target = 100% ring fill
- 20% above target = 100% ring fill (capped)
- Below target = proportional fill

**Badge Logic** (Lines 6761-6769):
- 95%+ of target → "Excellent"
- 85-94% → "Good"
- 75-84% → "Solid"
- 60-74% → "Low"
- <60% → "Very low"
- Walking pace → "Walking pace" (overrides numeric badge)

**Color Logic** (Lines 6753-6760):
- 95%+ → Bright Green (`#00E676`)
- 85-94% → Light Green (`#69F0AE`)
- 75-84% → Yellow (`#FFEE58`)
- 60-74% → Orange (`#FF9800`)
- <60% → Red (`#FF5252`)
- No data or no cadence → Muted Gray

### Target Cadence Calculation (Lines 6585-6646: `computeOptimalCadence()`)

Personalized optimal cadence based on:

1. **Speed-based cadence** (biomechanical formula):
   - Step length ratio interpolated based on running speed
   - At 6:00/km: ratio = 0.58
   - At 4:00/km: ratio = 0.80
   - Linear interpolation between speeds

2. **Height Adjustment**:
   - Formula: `stepLength = stepLengthRatio × (heightM)`
   - Taller runners naturally have longer steps

3. **Age Adjustment** (Lines 6615-6618):
   - Runners >50 years old: reduced lower-limb reactivity
   - Adjustment: `−(up to 6 spm)` based on `(age - 50) / 5`
   - Minimum: 150 spm

4. **Weight Adjustment** (Lines 6620-6627):
   - Heavier runners encouraged toward higher cadence for reduced impact
   - Baseline: 70 kg
   - Maximum adjustment: +4 spm at ~135 kg

5. **Incline Adjustment** (Lines 6629-6643):
   - Net uphill: +0.8 spm per % gradient (max +10)
   - Net downhill: +0.4 spm per % gradient (max +6)
   - Gradient = `(totalElevationGain - totalElevationLoss) / distance × 100`

**Data Sources**:
- `run.cadence` (actual average cadence, spm)
- `run.distance` (meters)
- `run.duration` (milliseconds)
- `run.averageSpeed` (m/s)
- `run.totalElevationGain` (meters)
- `run.totalElevationLoss` (meters)
- `userHeightCm` (from SharedPreferences user profile)
- `userAge` (from SharedPreferences user profile)
- `userWeightKg` (from SharedPreferences user profile)

---

## Ring #3: CONSISTENCY Score

### Visual Display
- **Label**: "CONSISTENCY"
- **Value**: Percentage (0-100%)
- **Sub-Label**: Quality description (No data, Very even, Steady pace, Variable, Uneven splits)
- **Badge**: Quality label (Excellent, Solid, Variable, Uneven)
- **Color Code**:
  - Bright Green (`#00E676`): Excellent (90%+)
  - Light Green (`#69F0AE`): Solid (75-89%)
  - Yellow (`#FFEE58`): Variable (55-74%)
  - Orange (`#FF9800`): Uneven (35-54%)
  - Red (`#FF5252`): Erratic (<35%)

### Calculation (Lines 6772-6800)

**Coefficient of Variation** approach:

1. **Data Sources** (in priority order):
   - If `kmSplits.size >= 2`: Use km split times
   - Otherwise if `paceData.size >= 10`: Use pace time-series
   - Otherwise: No data available

2. **Consistency Formula**:
   ```kotlin
   mean = average(samples)
   stdDev = sqrt(average((sample - mean)²))
   cv = stdDev / mean  // Coefficient of Variation
   consistency = max(0, min(1, 1 - (cv × 5)))
   ```

3. **Interpretation**:
   - CV near 0 → Very consistent → Score near 1.0 (100%)
   - CV increasing → More variable → Score decreases
   - Multiplier of 5 means CV of 0.20 → 0% score

**Badge Logic** (Lines 6794-6800):
- 90%+ → "Excellent" (CV < 0.02)
- 75-89% → "Solid" (CV = 0.02-0.05)
- 55-74% → "Variable" (CV = 0.05-0.09)
- <55% → "Uneven" (CV > 0.09)

**Data Sources**:
- `run.kmSplits` (list of per-kilometer splits with time data)
- `run.paceData` (optional: array of pace time-series values)

---

## MetricRing Composable Component

### Rendering Details (Lines 6879-7008)

**Ring Canvas Drawing** (Canvas-based):
- Inner radius calculated from 86dp size with 9dp stroke
- Background track color: `Colors.backgroundTertiary`
- Glow layer (20% opacity): subtly highlights the colored arc
- Main arc: draws progress from -90° (top) clockwise

**Center Text**:
- Large percentage value
- Bold, 14sp font
- Color matches ring color if progress > 0, else muted gray

**Labels**:
- **Top**: Ring label (EFFORT, HR ZONE, CADENCE, CONSISTENCY)
- **Middle**: Sub-label with actual value (e.g., "158 bpm")
- **Bottom**: Optional target label (e.g., "target 164-174 spm") for cadence
- **Badge**: Quality pill with background color matching ring

**Animation**:
- Animated progress over 1200ms with `FastOutSlowInEasing`
- Smooth fill from 0 to target percentage on ring load

**Styling**:
- Card background: `Colors.backgroundSecondary`
- Card border: 1dp, `Colors.border` at 60% opacity
- Three rings in a weighted horizontal row (1/3 width each)

---

## Data Flow & Updates

### Loading Path
1. **RunSummaryScreen.kt** → `GraphsTabContent()` (line 1538)
2. Receives `RunSession` and user profile data (`userAge`, `userHeightCm`, `userWeightKg`)
3. Calls `RunMetricRingsRow()` (line 1568)
4. Metrics computed in `remember {}` blocks to recalculate only when dependencies change

### User Profile Data Sources
- **Age**: `SharedPreferences["user"].age`
- **Height**: `SharedPreferences["user"].height` (in cm)
- **Weight**: `SharedPreferences["user"].weight` (in kg)
- Fallback values if not available in profile

### RunSession Data Refresh
- Loaded from backend API via `RunSummaryViewModel.loadRunById(runId)`
- Cached in `RunRepository` (shared across screens)
- Can be refreshed manually or auto-updated when Garmin data arrives

---

## Color Palette

```kotlin
val colorExcellent = Color(0xFF00E676)   // Bright Green
val colorGood      = Color(0xFF69F0AE)   // Light Green
val colorAverage   = Color(0xFFFFEE58)   // Yellow
val colorCaution   = Color(0xFFFF9800)   // Orange
val colorBad       = Color(0xFFFF5252)   // Red
```

These colors are used consistently across all three rings based on quality thresholds.

---

## Key Implementation Notes

1. **Personalization**: All metrics are personalized based on user profile (age, height, weight)
2. **Fallback Behavior**: HR Zone → Cadence fallback when HR data unavailable
3. **Data Validation**: 
   - HR Zone shown only if `run.heartRate > 0`
   - Cadence shown only if `run.cadence > 0` (and no HR)
   - Consistency shown if `kmSplits >= 2` or `paceData >= 10`
4. **Performance**: All calculations use `remember {}` blocks to avoid recalculation
5. **Responsive Design**: Three rings scale proportionally in a weighted row layout

---

## Related UI Components

### In Graphs Tab
- **Summary Card** (above metrics): Distance, duration, pace, cadence at a glance
- **Core Charts** (below metrics): Pace, elevation, cadence, heart rate graphs
- **Heart Rate Analysis**: Zones visualization, HR vs Pace scatter chart
- **Multi-Metric Analysis** (Garmin only): Fatigue curve, aerobic decoupling, running economy, race predictor

### In Summary Tab
- **Effort Score Card**: Detailed breakdown of effort factors
- **Pace Consistency Result**: Alternative consistency visualization

---

## Testing & Debugging

### Verify Ring Display
- Check `RunSession` has valid data for each metric
- Verify user profile loaded from SharedPreferences
- Check `remember {}` blocks update when data changes

### Debug Calculations
- Log effort score factors in `calculateEffortScore()`
- Log HR zone thresholds and actual HR in `RunMetricRingsRow()`
- Log cadence target and quality score in `computeOptimalCadence()` and `cadenceQualityScore()`
- Log consistency coefficient of variation in consistency calculation

### UI Issues
- Ring colors set in `MetricRing()` composable (lines 6958, 6996)
- Check `Colors.*` values in app theme/colors file
- Verify canvas stroke width (9dp) and ring size (86dp)
