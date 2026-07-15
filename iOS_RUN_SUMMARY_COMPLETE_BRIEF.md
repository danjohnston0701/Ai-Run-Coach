# iOS Run Summary Screen Complete Technical Brief

## Document Purpose
This document provides iOS development team with **complete specifications** for replicating the Android Run Summary Screen with 100% feature parity, including all tabs, graphs, data mappings, padding rules, graph rendering logic, and conditional display rules.

**Status**: Use Android as source of truth for all features. iOS has cleaner card design — retain that. **iOS maps are currently broken — fix with this spec.**

---

## Table of Contents
1. [Screen Architecture](#screen-architecture)
2. [Tab Structure & Navigation](#tab-structure--navigation)
3. [AI Insights Tab (Tab 0)](#ai-insights-tab-tab-0)
4. [Group Run Tab (Tab 1 - Conditional)](#group-run-tab-tab-1--conditional)
5. [Summary Tab](#summary-tab)
6. [Graphs Tab](#graphs-tab)
7. [Dynamics Tab (Conditional)](#dynamics-tab-conditional)
8. [Data Tab](#data-tab)
9. [Badges Tab (Excluded)](#badges-tab-excluded)
10. [Graph Rendering Rules & Padding](#graph-rendering-rules--padding)
11. [Data Mapping & Calculations](#data-mapping--calculations)
12. [Map Implementation](#map-implementation)
13. [Conditional Display Logic](#conditional-display-logic)

---

## Screen Architecture

### Overall Structure
```
RunSummaryScreenFlagship (Main Container)
├── Top Bar (RunSummaryTopBar)
├── Tab Navigation (RunTabsFlagship)
└── Dynamic Tab Content (selected via state)
    ├── AiInsightsTabContent
    ├── GroupRunLeaderboardTab (if hasGroupRun)
    ├── SummaryTabContent
    ├── GraphsTabContent
    ├── DynamicsTabContent (if hasDynamicsTab)
    ├── DataTabFlagship
    └── AchievementsTabFlagship (Badges)
```

### Dynamic Tab Offset Calculation
```
Tab Indices:
- Tab 0: Always "AI Insights"
- Tab 1: "Group Run" (if hasGroupRun) → groupRunTabOffset = 1, else 0
- Tab 1+groupRunTabOffset: "Summary"
- Tab 2+groupRunTabOffset: "Graphs"
- Tab 3+groupRunTabOffset: "Dynamics" (if hasDynamicsTab) → dynamicsTabOffset = 1, else 0
- Tab 3+groupRunTabOffset+dynamicsTabOffset: "Data"
- Tab 4+groupRunTabOffset+dynamicsTabOffset: "Badges"
```

### Conditional Tabs
**hasDynamicsTab**: True when ANY of these Garmin running dynamics data exists:
- groundContactTimeData is not empty
- verticalOscillationData is not empty
- verticalRatioData is not empty
- strideLengthData is not empty

**hasGroupRun**: True when linkedGroupRunId != null

---

## Tab Structure & Navigation

### ScrollableTabRow Component
- **Container Color**: Colors.backgroundRoot
- **Content Color**: Colors.primary
- **Edge Padding**: Spacing.lg
- **Text Style**: AppTextStyles.caption
  - **Selected**: FontWeight.Bold
  - **Unselected**: FontWeight.Medium
- **Content Color**:
  - Selected: Colors.primary
  - Unselected: Colors.textMuted

### Tab Labels (Dynamic)
Built from list:
```kotlin
labels = listOf(
    "AI Insights",
    if (hasGroupRun) "Group Run" else null,
    "Summary",
    "Graphs",
    if (hasDynamicsTab) "Dynamics" else null,
    "Data",
    "Badges"
).filterNotNull()
```

---

## AI Insights Tab (Tab 0)

### Content Order
1. **Tab Navigation Bar** (sticky)
2. **Strava Attribution Banner** (if run.externalSource == "strava" && run.externalId exists)
3. **Run Completed Banner** with optional difficulty pill
4. **Personal Best Banner** (if personalBests.isNotEmpty())
5. **Garmin Enrich CTA Card** (conditional)
6. **Shareable Summary Card**
7. **Coaching Plan Badge** (if run.linkedPlanId != null)
8. **Create Share Image Button**
9. **Share Run Video Button**
10. **Struggle Point Analysis Section** (if strugglePoints.isNotEmpty())
    - OR **No Struggle Points Banner** (if empty)
11. **AI Analysis Section Header** (sticky)
12. **Garmin Data Disclosure** (if run.hasGarminData && aiConsentGranted)
13. **AI Consent Check**:
    - If NOT granted: Show "AI Analysis Disabled" card with enable button
    - If Garmin sync origin: Show "AI Analysis Unavailable" (runs from Garmin Connect cannot be analyzed)
    - Otherwise: Show AI Analysis expandable section
14. **Pace Consistency Card**
15. **Coaching During Run Section** (if coachingNotes.isNotEmpty(), filtered)
16. **Delete Run Button**
17. **Bottom Spacer** (Spacing.sm)

### Filtering Rules for Coaching Notes
Show coaching notes ONLY if:
- Message length >= 30 characters, OR
- Message does NOT contain GPS navigation keywords:
  - "turn", "left", "right", "hill", "ahead", "speed", "slow", "meter", "metre"

### Spacing Rules (AI Insights)
- **LazyColumn vertical spacing**: Spacing.lg
- **Horizontal padding**: Spacing.lg
- **Content padding (bottom)**: Spacing.md

---

## Group Run Tab (Tab 1 - Conditional)

### Appears Only When
`linkedGroupRunId != null`

### Content Structure
1. **Tab Navigation Bar** (sticky)
2. **Group Run Header**
   - Title: groupRunName or "Group Run"
   - Subtitle: "Results"
   - Refresh icon button
3. **AI Debrief Card** (3 states):
   - **Has debrief**: Show debrief text + rank info (e.g., "Finished #3 of 12")
   - **Loading debrief**: Show loading spinner + "Generating AI debrief…"
   - **No debrief**: Show "Get AI Group Debrief" button
4. **Metric Tab Switcher**:
   - Pills: Summary, Pace, SPM, Elevation, HR
   - Selected: Colors.primary background
   - Unselected: Colors.backgroundSecondary background
   - Border radius: 999.dp
5. **Results Table** (scrolls horizontally)
   - Content varies by selected metric tab:
     - **Summary**: Name/Time, Avg Pace, Avg HR, Cadence, Elevation Gain
     - **Pace**: Name/Time, Avg Pace, Distance, Calories
     - **SPM**: Name/Time, Avg SPM, Max SPM, Avg Pace
     - **Elevation**: Name/Time, Elevation Gain, Max Elevation, Avg Pace
     - **HR**: Name/Time, Avg HR, Max HR, Avg Pace

### Spacing Rules (Group Run)
- **LazyColumn vertical spacing**: Spacing.md
- **Horizontal padding**: Spacing.lg
- **Content padding (bottom)**: Spacing.xl
- **Metric tab arrangement**: Arrangement.spacedBy(Spacing.sm)

---

## Summary Tab

### Content Order
1. **Tab Navigation Bar** (sticky)
2. **Personal Best Banner** (if personalBests.isNotEmpty())
3. **Route Map Card**
   - Only shown if run.routePoints.isNotEmpty()
   - Includes: route polyline, struggle points markers, coaching note markers
4. **Header Distance Block**
   - Large distance display with unit
5. **Main Stats Grid**
   - Shows delta vs lastRunForDelta when available
   - Metrics: Time, Distance, Avg Pace, Avg HR, Cadence, Elevation Gain
6. **Km Splits Card**
   - Only shown if run.kmSplits.isNotEmpty()
   - Horizontal scrollable list of splits with pace
7. **Split Analysis Card**
   - Shows pacing analysis (even/negative/positive splits)
8. **Km Splits Visual Chart**
   - Bar chart showing pace per km
   - Only shown if run.kmSplits.size >= 2
9. **Effort Score / Training Load Card**
   - Calculated from duration, distance, avg HR, user age
10. **Delete Run Button**
11. **Bottom Spacer**

### Spacing Rules (Summary)
- **LazyColumn vertical spacing**: Spacing.lg
- **Horizontal padding**: Spacing.lg
- **Content padding (bottom)**: Spacing.md

---

## Graphs Tab

### Content Structure
1. **Tab Navigation Bar** (sticky)

### Section 1: Run Score Rings
2. **RunMetricRingsRow**
   - Three concentric rings showing:
     - Effort Score (0-100%)
     - Cadence Consistency (0-100%)
     - Pace Consistency (0-100%)
   - User age, height, weight passed for personalized calculations

### Section 2: Core Charts
3. **Charts Section Header**: "Charts"
4. **Chart Mode Toggle**
   - Two pills: "Time" (default) and "Distance"
   - Controls X-axis for all charts below
5. **Charts** (each only shows if data >= 2 points):

#### Chart 1: Pace Chart
- **Condition**: paceSeries.y.size >= 2
- **Title**: "Pace"
- **Subtitles**:
  - Left: "Avg: {run.averagePace}"
  - Right: "Best: {bestPaceDisplay}" (fastest instantaneous pace from route)
- **Accent Color**: Colors.primary
- **X-Axis**: Time (min) or Distance (km)
- **Y-Axis**: Pace (min/km), inverted (fastest at top)
- **Y-Formatter**: formatPaceSeconds (e.g., "4:32")
- **Y-Unit Hint**: "min/km"
- **Key Setting**: invertY = true

#### Chart 2: Elevation Chart
- **Condition**: elevationSeries.y.size >= 2 AND (max - min) >= 0.5m
- **Title**: "Elevation"
- **Subtitles**:
  - Left: "Gain: {elevGainDisplay} m"
  - Right: "Max: {maxAlt} m"
- **Accent Color**: Colors.success
- **X-Axis**: Time (min) or Distance (km)
- **Y-Axis**: Elevation (m)
- **Y-Formatter**: "%.0f" format
- **Y-Unit Hint**: "m"
- **Key Setting**: isElevation = true
- **Elevation Gain Calculation**:
  - Primary: Use run.maxElevation - run.minElevation
  - Fallback: Use run.totalElevationGain
  - These are computed from raw GPS points at run-end

#### Chart 3: Heart Rate Chart
- **Condition**: hrSeries.y.size >= 2
- **Title**: "Heart Rate"
- **Subtitles**:
  - Left: "Avg: {avgHr} bpm"
  - Right: "Max: {maxHr} bpm"
- **Accent Color**: Colors.error
- **X-Axis**: Time (min) or Distance (km)
- **Y-Axis**: HR (bpm)
- **Y-Formatter**: Integer format
- **Y-Unit Hint**: "bpm"

#### Chart 4: Cadence Chart
- **Condition**: cadenceSeries.y.size >= 2
- **Title**: "Cadence"
- **Subtitles**:
  - Left: "Avg: {avgCad} spm"
  - Right: "Max: {maxCad} spm"
- **Accent Color**: #9C27B0 (purple)
- **X-Axis**: Time (min) or Distance (km)
- **Y-Axis**: Cadence (steps per minute)
- **Y-Formatter**: Integer format
- **Y-Unit Hint**: "spm"
- **Key Setting**: isCadence = true
- **Time Anchor**: Uses first valid GPS point timestamp to sync with elevation/HR

#### Chart 5: Pace vs Elevation (Dual-Axis)
- **Condition**: paceY.size >= 2 AND elevY.size >= 2
- **Title**: "Pace vs Elevation"
- **Subtitles**:
  - Left: "Pace: {run.averagePace}"
  - Right: "Gain: {elevGainDisplay} m"
- **Accent Color**: Colors.primary
- **Primary (left) Y-Axis**: Pace (min/km), inverted
  - Color: Colors.primary
  - Label: "Pace"
  - Formatter: formatPaceSeconds
- **Secondary (right) Y-Axis**: Elevation (m)
  - Color: Colors.success
  - Label: "Elevation"
  - Formatter: "%.0f"
- **X-Axis**: Distance (km)
- **Key Settings**:
  - invertPrimary = true
  - fillSecondary = true
  - isPaceElevation = true

#### Chart 6: Cadence vs Elevation (Dual-Axis)
- **Condition**: cadencY.size >= 2 AND elevY.size >= 2
- **Title**: "Cadence vs Elevation"
- **Subtitles**:
  - Left: "Avg: {avgCadElev} spm"
  - Right: "Gain: {elevGainDisplay} m"
- **Accent Color**: #8B5CF6 (purple variant)
- **Primary (left) Y-Axis**: Cadence (spm)
  - Color: #8B5CF6
  - Label: "spm"
  - Formatter: Integer format
- **Secondary (right) Y-Axis**: Elevation (m)
  - Color: Colors.success
  - Label: "m"
  - Formatter: "%.0f"
- **X-Axis**: Distance (km)
- **Key Settings**:
  - fillSecondary = true
  - isCadenceElevation = true

### Section 3: Heart Rate Analysis
6. **Section Header** (sticky): "Heart Rate Analysis"
   - Only shown if run.heartRateData != null && not empty
7. **Garmin Data Disclosure** (if run.hasGarminData)
8. **Heart Rate Zones Visual Card**
9. **HR vs Pace Scatter Chart**
   - Shows cardiac cost curve
10. **Intensity Distribution Donut Chart**

### Section 4: Multi-Metric Analysis
11. **Section Header** (sticky): "Multi-Metric Analysis"
    - Only shown if run.hasGarminData
12. **Fatigue Curve Card** (Pace Decay)
13. **Aerobic Decoupling Card**
14. **Running Economy Card** (Pace vs HR)
15. **Race Time Predictor Card**
16. **Weather Performance Card** (if run.weatherAtStart != null)

### Spacing Rules (Graphs)
- **LazyColumn vertical spacing**: Spacing.lg
- **Horizontal padding**: Spacing.lg
- **Content padding (bottom)**: Spacing.md
- **Chart section internal spacing**: Spacing.md

---

## Dynamics Tab (Conditional)

### Appears Only When
ANY of these Garmin running dynamics data exists:
- groundContactTimeData is not empty
- verticalOscillationData is not empty
- verticalRatioData is not empty
- strideLengthData is not empty

### Content Structure
1. **Tab Navigation Bar** (sticky)

### Section 1: Running Dynamics Stats
2. **Section Header**: "Running Dynamics"
3. **RunningDynamicsStatsRow**
   - Grid of 4 stats: Avg VO, Avg GCT, Avg Stride, Avg Cadence (scalar values)

### Section 2: Biometric Charts
4. **Section Header**: "Biometric Charts"
5. **Chart Mode Toggle** (Time / Distance)

#### Chart 1: Vertical Oscillation
- **Data Source**: run.verticalOscillationData
- **Condition**: voSeries.y.size >= 2
  - If yes: Show line chart
  - If no but run.avgVerticalOscillation exists: Show stat card
  - If neither: Don't show
- **Title**: "Vertical Oscillation"
- **Subtitles**:
  - Left: "Avg: {avgVo} cm"
  - Right: "Max: {maxVo} cm"
- **Accent Color**: #06B6D4 (cyan)
- **X-Axis**: Time (min) or Distance (km)
- **Y-Axis**: Oscillation (cm)
- **Y-Formatter**: "%.1f" format
- **Y-Unit Hint**: "cm"
- **Stat Card Hint**: "Ideal: 6–8 cm for efficient running"

#### Chart 2: Ground Contact Time
- **Data Source**: run.groundContactTimeData
- **Condition**: gctSeries.y.size >= 2
  - If yes: Show line chart
  - If no but run.avgGroundContactTime exists: Show stat card
  - If neither: Don't show
- **Title**: "Ground Contact Time"
- **Subtitles**:
  - Left: "Avg: {avgGct} ms"
  - Right: "Best: {minGct} ms"
- **Accent Color**: #F97316 (orange)
- **X-Axis**: Time (min) or Distance (km)
- **Y-Axis**: Time (ms)
- **Y-Formatter**: Integer format
- **Y-Unit Hint**: "ms"
- **Stat Card Hint**: "Ideal: 200–270 ms. Lower = faster turnover"

#### Chart 3: Stride Length
- **Data Source**: run.strideLengthData
- **Condition**: strideSeries.y.size >= 2
  - If yes: Show line chart
  - If no but run.avgStrideLength exists: Show stat card
  - If neither: Don't show
- **Title**: "Stride Length"
- **Subtitles**:
  - Left: "Avg: {avgStride} m"
  - Right: "Max: {maxStride} m"
- **Accent Color**: #10B981 (emerald)
- **X-Axis**: Time (min) or Distance (km)
- **Y-Axis**: Length (m)
- **Y-Formatter**: "%.2f" format
- **Y-Unit Hint**: "m"

#### Chart 4: L/R Ground Contact Balance
- **Condition**: run.avgGroundContactBalance != null
- **Data Source**: run.avgGroundContactBalance (float 0-100)
- **Display**: 
  - Visual balance bar (left percentage fills bar)
  - Left/Right percentages displayed
  - Color-coded status:
    - ✅ **deviation <= 1%**: Colors.success ("Excellent symmetry")
    - ⚠️ **deviation 1-3%**: #F97316 ("Minor imbalance")
    - ❗ **deviation > 3%**: Colors.error ("Notable imbalance — may indicate fatigue or injury risk")

### Spacing Rules (Dynamics)
- **LazyColumn vertical spacing**: Spacing.lg
- **Horizontal padding**: Spacing.lg
- **Content padding (bottom)**: Spacing.md

---

## Data Tab

### Content Structure
1. **Tab Navigation Bar** (sticky)

### Pace Section
2. **DataSectionCard**: "Pace" (⏱️)
   - Metrics:
     - **Avg Pace**: run.averagePace (min/km)
     - **Current Pace**: run.currentPace (if available)
     - **Best Km Pace**: Best from run.kmSplits (by parse pace to seconds)
     - **Slowest Km Pace**: Worst from run.kmSplits

### Training Load Section
3. **TrainingLoadCard** (calculated metric)

### Speed Section
4. **DataSectionCard**: "Speed" (⚡)
   - **Avg Speed**: Converted to km/h with smart detection:
     - If rawSpeed == 0: Skip
     - If rawSpeed > 50: Invalid (skip)
     - If rawSpeed > 30: Already km/h, use as-is
     - Else: Convert from m/s (multiply by 3.6)
   - **Fastest Speed**: Calculated from best pace split (60 / (paceSeconds/60))
   - **Slowest Speed**: Calculated from worst pace split
   - **Max Speed**: run.maxSpeed (with same conversion logic)
   - **Format**: "%.1f km/h"

### Time Section
5. **DataSectionCard**: "Time" (🕐)
   - **Total Time**: run.getFormattedDuration()
   - **Moving Time**: formatSecondsToHMS(run.movingTime) if available
   - **Elapsed Time**: formatMillisToHMS(run.elapsedTime) if available

### Running Dynamics Section
6. **Garmin Data Disclosure** (if run.hasGarminData && has cadence/stride data)
7. **DataSectionCard**: "Running Dynamics" (👟)
   - **Avg Cadence**: run.cadence spm (if > 0)
   - **Max Cadence**: run.maxCadence spm (if available)
   - **Avg Stride Length**: run.avgStrideLength (convert m to cm: * 100)

### Heart Rate Section
8. **Garmin Data Disclosure** (if run.hasGarminData && has HR data)
9. **DataSectionCard**: "Heart Rate" (❤️)
   - **Avg Heart Rate**: run.heartRate bpm (if > 0)
   - **Min Heart Rate**: run.minHeartRate bpm (if available)

### Elevation Section
10. **Garmin Data Disclosure** (if run.hasGarminData && has elevation data)
11. **DataSectionCard**: "Elevation" (⛰️)
    - **Total Ascent**: run.totalElevationGain.roundToInt() m
    - **Total Descent**: run.totalElevationLoss.roundToInt() m
    - **Min Elevation**: run.minElevation m
    - **Max Elevation**: run.maxElevation m
    - **Steepest Incline**: Convert gradient % to degrees: atan(gradient/100) → degrees
    - **Steepest Decline**: Same conversion (fallback: use run.steepestDecline if available)

### Distance Section
12. **DataSectionCard**: "Distance" (📏)
    - **Total Distance**: run.distance / 1000 (format: "%.2f km")

### Steps Section
13. **DataSectionCard**: "Steps" (👟)
    - **Total Steps**: 
      - Prefer run.totalSteps if > 0
      - Else calculate: run.cadence * (run.duration / 60_000)
      - If 0: Show nothing
    - **Est. Calories**: totalSteps * 0.04
    - **Avg Stride**: run.avgStrideLength (format: "%.2f m") if available and > 0

### Weather Section
14. **DataSectionCard**: "Weather" (☀️) (if run.weatherAtStart != null)
    - **Temperature**: run.weatherAtStart.temperature °C
    - **Conditions**: run.weatherAtStart.conditions
    - **Humidity**: run.weatherAtStart.humidity %
    - **Wind Speed**: run.weatherAtStart.windSpeed km/h
    - **Visibility**: run.weatherAtStart.visibility km

### Calories Section
15. **DataSectionCard**: "Calories" (🔥) (if run.calories > 0)
    - **Total Calories**: run.calories kcal
    - **Avg per Km**: run.calories / (run.distance / 1000) kcal/km

### Delete Run Button
16. **Delete Run Button**
17. **Bottom Spacer**

### Spacing Rules (Data)
- **LazyColumn vertical spacing**: Spacing.md
- **Horizontal padding**: Spacing.md
- **Content padding (bottom)**: Spacing.md

---

## Badges Tab (Excluded)

**Per user request**: Keep iOS Badges as-is. Do not replicate Android version.

---

## Graph Rendering Rules & Padding

### Line Chart Canvas (`RunLineChartCanvas`)

#### Padding Rules
```kotlin
val canvasHeight = 300.dp (fixed height, unless fullscreen mode)
val canvasPadding = PaddingValues(
    start = 40.dp,     // Left margin for Y-axis labels
    end = 20.dp,       // Right margin
    top = 20.dp,       // Top margin
    bottom = 40.dp     // Bottom margin for X-axis labels
)
```

#### Data Preprocessing
1. **Filter invalid points**:
   - Remove points where y < 0 (invalid)
   - Remove points where y > reasonable max:
     - Pace: Max 30 min/km (very slow)
     - HR: Max 220 (physiological limit)
     - Cadence: Max 250 spm
     - Elevation: Max 10,000 m
     - Speed: Max 50 km/h
2. **Interpolate missing data**: Linear interpolation between points
3. **Smooth data** (optional): Use moving average filter for noisy cadence

#### Scaling Logic
```
- Find min/max of Y values
- Add 10% padding to top and bottom (unless inverted)
- For inverted charts (pace): Put fastest (lowest) values at TOP
- X-axis: Scale evenly from 0 to max distance or max time
```

#### Grid & Labels
- **Grid lines**: Every 20 units (or smart intervals based on range)
- **X-axis labels**: Every 1 km or 5 minutes
- **Y-axis labels**: 4-5 labels, formatted per chart type
- **Zero line**: Show if range includes 0 (e.g., elevation)

#### Stroke Properties
```kotlin
val lineStroke = Stroke(
    width = 2.5.dp,
    cap = StrokeCap.Round,
    join = StrokeJoin.Round
)
```

#### Conditional Styling
- **isElevation = true**: Fill area under line with gradient
- **isCadence = true**: Display with purple accent
- **isPaceElevation = true**: Dual-axis rendering with separate scales
- **invertY = true**: Reverse Y-axis (faster at top)

### Dual-Axis Chart Canvas (`DualAxisChartCanvas`)

#### Layout
```
┌─────────────────────────────────────┐
│  Primary Y-Axis      │ Secondary Y- │
│   (left color)       │   (right)    │
│                      │              │
│   Line 1 (primary)   │              │
│   Line 2 (secondary) │              │
│                      │              │
│  0────────────────────────────────X │
│     Primary X-Axis (shared)         │
└─────────────────────────────────────┘
```

#### Rendering Rules
1. **Primary Y-axis**:
   - Left side, range from min to max of primaryY data
   - If invertPrimary = true: Reverse scale
2. **Secondary Y-axis**:
   - Right side, independent scale from min to max of secondaryY data
3. **Secondary Fill**:
   - If fillSecondary = true: Fill area under secondary line with semi-transparent color
4. **X-axis**: Shared across both (distance or time)

#### Scaling Calculation
```
primaryRange = max(primaryY) - min(primaryY)
secondaryRange = max(secondaryY) - min(secondaryY)

primaryLabel = primaryRange / 4 (ideal label spacing)
secondaryLabel = secondaryRange / 4

primaryCanvasHeight = 70% of total height
secondaryCanvasHeight = 70% of total height (overlapped for visual layering)
```

### Card Container (`LineChartCardFlagship`)

#### Structure
```
┌─ Card Container ────────────────────────────┐
│                                             │
│  Title (h4, bold)                          │
│  Subtitle Left | Subtitle Right            │
│  ──────────────────────────────────────��──  │
│                                             │
│  [Chart Canvas Area]                        │
│  {RunLineChartCanvas / DualAxisChartCanvas} │
│                                             │
│  [Toggle to Fullscreen] (tap to expand)    │
│                                             │
└─────────────────────────────────────────────┘
```

#### Padding Rules
```kotlin
Card(
    modifier = Modifier
        .fillMaxWidth()
        .padding(vertical = Spacing.sm, horizontal = 0.dp),
    shape = RoundedCornerShape(16.dp),
    colors = CardDefaults.cardColors(
        containerColor = Colors.backgroundSecondary
    ),
    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
)

Column(
    modifier = Modifier.padding(Spacing.md),
    verticalArrangement = Arrangement.spacedBy(Spacing.sm)
)
```

#### Header Layout
```kotlin
Row(
    modifier = Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically
) {
    Column(modifier = Modifier.weight(1f)) {
        Text(title, style = AppTextStyles.h4, fontWeight = FontWeight.Bold)
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(subtitleLeft, style = AppTextStyles.caption, color = Colors.textSecondary)
            Text(subtitleRight, style = AppTextStyles.caption, color = Colors.textSecondary)
        }
    }
    Icon(
        imageVector = Icons.Default.ExpandLess, // or ExpandMore
        contentDescription = "Fullscreen",
        tint = Colors.textMuted,
        modifier = Modifier
            .size(24.dp)
            .clickable { showFullscreen = true }
    )
}
```

### Km Splits Bar Chart (`KmSplitsVisualChart`)

#### Structure
```
Bar Chart (horizontal bars, one per km)
- X-axis: Pace (min/km), scaled from slowest to fastest
- Y-axis: Each km labeled (Km 1, Km 2, etc.)
- Bar Color: Green (fast) → Yellow (medium) → Red (slow)
- Value Labels: On each bar (e.g., "4:32")
```

#### Styling
```kotlin
Bar(
    height = 40.dp,
    shape = RoundedCornerShape(4.dp),
    colors = when (pace) {
        in 0..300 -> Colors.error        // > 5:00/km (slow)
        in 300..360 -> Colors.warning    // 5:00-6:00/km
        in 360..480 -> Colors.success    // < 8:00/km (fast)
        else -> Colors.primary
    }
)
```

#### Sorting
- Sort by: Km index (ascending)
- Bar width: Proportional to pace value (fastest = widest)

### Heart Rate Zones Visualization

#### Ring Display
```
Inner Ring: Zone 1 (Z1, gray)
Ring 2: Zone 2 (Z2, blue)
Ring 3: Zone 3 (Z3, green)
Ring 4: Zone 4 (Z4, orange)
Outer Ring: Zone 5 (Z5, red)

Center: Zone name + % time
```

#### Colors
```
Z1 (Recovery): #9CA3AF
Z2 (Easy): #3B82F6
Z3 (Threshold): #10B981
Z4 (Hard): #F97316
Z5 (Max): #EF4444
```

#### Zones Calculation (Tanaka Formula)
```
Max HR = 220 - age
Z1 (Recovery): 50-60% of max
Z2 (Easy): 60-70% of max
Z3 (Threshold): 70-80% of max
Z4 (Hard): 80-90% of max
Z5 (Max): 90-100% of max
```

---

## Data Mapping & Calculations

### Pace Formatting
```kotlin
fun formatPaceSeconds(seconds: Long): String {
    val minutes = seconds / 60
    val secs = seconds % 60
    return String.format("%d:%02d", minutes, secs)
}

// Example: 272 seconds = 4:32
```

### Elevation Gain Calculation
**Primary**: Use run.maxElevation - run.minElevation (if both available)
**Fallback**: Use run.totalElevationGain

These values are computed from raw GPS points at run-end, reflecting true altitude spread.

### Heart Rate Zones Calculation (Tanaka)
```kotlin
fun calculateHRZones(age: Int?): HRZones {
    val maxHr = (220 - (age ?: 30)).toInt()
    return HRZones(
        z1Max = (maxHr * 0.60).toInt(),     // 50-60%
        z2Max = (maxHr * 0.70).toInt(),     // 60-70%
        z3Max = (maxHr * 0.80).toInt(),     // 70-80%
        z4Max = (maxHr * 0.90).toInt(),     // 80-90%
        z5Max = maxHr                        // 90-100%
    )
}
```

### Training Load Calculation
```kotlin
fun calculateTrainingLoad(run: RunSession): Double {
    // Formula: (duration in minutes × avg HR × body weight) / 60
    val durationMin = run.duration / 60_000.0
    val avgHr = run.heartRate.takeIf { it > 0 } ?: 140  // Default if no HR
    val bodyWeight = run.userWeightKg ?: 70.0  // Default if not set
    return (durationMin * avgHr * bodyWeight) / 60.0
}
```

### Speed Conversion
```kotlin
// From m/s to km/h
fun speedMsToKmh(speedMs: Float): Float = speedMs * 3.6f

// Detection logic:
when {
    rawSpeed <= 0 -> 0f                          // Invalid
    rawSpeed > 50 -> 0f                          // Impossible (max ~45 km/h)
    rawSpeed > 30 -> rawSpeed                    // Already km/h
    else -> rawSpeed * 3.6f                      // Convert from m/s
}
```

### Steps Calculation
```kotlin
// Prefer stored value, else calculate from cadence
val totalSteps = if (run.totalSteps != null && run.totalSteps > 0) {
    run.totalSteps
} else if (run.cadence > 0) {
    val durationMinutes = run.duration / 60_000.0
    (run.cadence * durationMinutes).toInt()
} else {
    0
}

// Est. calories = steps × 0.04
val estimatedCalories = (totalSteps * 0.04).toInt()
```

### Stride Length Display
- **Storage**: Meters (m)
- **Display**: Centimeters (cm) by multiplying × 100
- Format: "%.0f cm" or "%.2f m" depending on context

### Cadence Time-Series Anchoring
- **Anchor**: Use first valid GPS point timestamp (latitude != 0 && longitude != 0)
- **Purpose**: Ensure cadence chart X-axis is synchronized with elevation/HR/pace charts
- **Fallback**: If no GPS points, use run start timestamp

---

## Map Implementation

### Route Map Card (`RouteMapCardFlagship`)

#### Purpose
Display the run's route with:
- **Polyline** of GPS route points
- **Struggle points** markers (where runner struggled)
- **Coaching note** markers (where AI coaching was delivered)

#### Data Structure
```
run.routePoints: List<LocationPoint>
  - latitude: Double
  - longitude: Double
  - timestamp: Long
  - altitude: Double (optional)

run.strugglePoints: List<StrugglePoint>
  - latitude: Double
  - longitude: Double
  - intensity: 1-5
  - timestamp: Long

run.aiCoachingNotes: List<AiCoachingNote>
  - latitude: Double
  - longitude: Double
  - message: String
  - timestamp: Long
```

#### Map Setup
```swift
// iOS (SwiftUI + MapKit)
struct RouteMapCard: View {
    @State private var region: MKCoordinateRegion
    
    var body: some View {
        Map(position: $region) {
            // Polyline of route
            MapPolyline(
                coordinates: routePoints.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
            )
            .stroke(.blue, lineWidth: 3)
            
            // Struggle point markers
            ForEach(strugglePoints, id: \.id) { point in
                Marker("", coordinate: CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude))
                    .tint(intensityColor(point.intensity))
            }
            
            // Coaching note markers
            ForEach(coachingNotes, id: \.id) { note in
                Marker("💬", coordinate: CLLocationCoordinate2D(latitude: note.latitude, longitude: note.longitude))
                    .tint(.orange)
            }
        }
        .frame(height: 300)
        .onAppear {
            fitMapToRoute()
        }
    }
    
    private func fitMapToRoute() {
        let bounds = calculateBounds(routePoints)
        region = MKCoordinateRegion(
            center: bounds.center,
            span: MKCoordinateSpan(
                latitudeDelta: bounds.latitudeDelta * 1.2,
                longitudeDelta: bounds.longitudeDelta * 1.2
            )
        )
    }
}
```

#### Marker Colors
```
Struggle Point Intensity:
- 1 (Minor): Yellow (#FCD34D)
- 2 (Mild): Orange (#FB923C)
- 3 (Moderate): Dark Orange (#F97316)
- 4 (Severe): Red-Orange (#EA580C)
- 5 (Critical): Red (#DC2626)

Coaching Note: Always Orange/Gold (#FCD34D)
```

#### Camera Fit Logic
1. Calculate bounding box of all route points
2. Add 20% padding around bounds
3. Animate camera to fit entire route with padding
4. Min zoom: Ensure whole route is visible
5. Max zoom: Limit to avoid zooming too far

#### Card Structure
```
Card Container (rounded 16.dp)
├── Header:
│   ├── Title: "Route"
│   └── Distance: "{distance} km"
├── Map Container
│   └── [MapKit/Google Maps Component]
└── Footer (if applicable):
    └── [Route stats or expand button]
```

#### Current iOS Issue
**Problem**: Maps currently render poorly (likely off-screen or incorrect region)
**Solution**: 
- Verify routePoints data is not empty before rendering
- Ensure coordinate conversion is correct (lat/long order)
- Test with a real run that has > 100 route points
- Check that fitMapToRoute() is called after map initialization
- Verify MapKit permissions are granted

---

## Conditional Display Logic

### Graphs Shown Based On Data Availability

| Graph | Condition | Data Source |
|-------|-----------|-------------|
| Pace | paceSeries.y.size >= 2 | routePoints + kmSplits |
| Elevation | elevSeries.y.size >= 2 AND (max-min) >= 0.5m | altitudeData / routePoints |
| Heart Rate | hrSeries.y.size >= 2 | heartRateData |
| Cadence | cadenceSeries.y.size >= 2 | routePoints (GPS speed) |
| Pace vs Elev | Both series >= 2 points | Pace + Elevation |
| Cadence vs Elev | Both series >= 2 points | Cadence + Elevation |
| Vertical Oscillation | voSeries.y.size >= 2 OR avgVO exists | verticalOscillationData |
| Ground Contact Time | gctSeries.y.size >= 2 OR avgGCT exists | groundContactTimeData |
| Stride Length | strideSeries.y.size >= 2 OR avgStride exists | strideLengthData |
| Heart Rate Zones | heartRateData exists | heartRateData |
| HR vs Pace | heartRateData exists | heartRateData + routePoints |
| Intensity Distribution | heartRateData exists | heartRateData |

### Data Tab Sections Shown

| Section | Condition |
|---------|-----------|
| Pace | Always shown |
| Training Load | Always shown |
| Speed | Always shown (but individual metrics only if > 0) |
| Time | Always shown |
| Running Dynamics | Always shown (Garmin disclosure + cadence/stride if > 0) |
| Heart Rate | Always shown (Garmin disclosure + HR if > 0) |
| Elevation | Always shown (Garmin disclosure + data if > 0) |
| Distance | Always shown |
| Steps | Only if totalSteps > 0 |
| Weather | Only if run.weatherAtStart != null |
| Calories | Only if run.calories > 0 |

### Dynamics Tab Visibility
```kotlin
hasDynamicsTab = (
    !run.groundContactTimeData.isNullOrEmpty() ||
    !run.verticalOscillationData.isNullOrEmpty() ||
    !run.verticalRatioData.isNullOrEmpty() ||
    !run.strideLengthData.isNullOrEmpty()
)
```

### Multi-Metric Analysis Section
Only shown if `run.hasGarminData == true`

Includes:
- Fatigue Curve (Pace decay over time)
- Aerobic Decoupling (HR drift)
- Running Economy (Pace vs HR correlation)
- Race Time Predictor
- Weather Performance Index

---

## Special UI Components

### Garmin Data Disclosure Badge
Shown in multiple locations when Garmin data is present:
```
"This data comes from your Garmin device"
[Learn More] [Dismiss]
```

Appears before:
- Heart Rate Analysis section (Graphs tab)
- Multi-Metric Analysis section (Graphs tab)
- Running Dynamics section (Data tab)
- Elevation section (Data tab)
- AI Insights header (if run.hasGarminData && aiConsentGranted)

### Personal Best Banner
```
┌─────────────────────────────────────┐
│ 🏆 New Personal Best!              │
│                                     │
│ [Category 1] [Category 2] [...]    │
└─────────────────────────────────────┘
```

Categories: "5K PR", "10K PR", "Longest Run", "Fastest Pace", "Most Elevation", etc.

### Run Completed Banner
```
┌─────────────────────────────────────┐
│ ✅ Run Completed                    │
│                                     │
│ Difficulty: [Pill] (if terrain      │
│ terrain difficulty available)       │
└─────────────────────────────────────┘
```

Difficulty levels: "Easy", "Moderate", "Difficult" (terrain-based)

### Pace Consistency Card
```
Title: "Pace Consistency"

Visual: Consistency % (0-100%)
- 95-100%: "Perfect consistency" (green)
- 85-95%: "Excellent" (blue)
- 75-85%: "Good" (yellow)
- < 75%: "Variable" (orange)

Formula: 
  Standard deviation of split paces / average pace
  Inverted: (1 - SD/Avg) * 100
```

### Effort Score Ring
```
Concentric Ring showing:
- Effort Score (0-100%)
- Based on: Normalized duration, distance, avg HR, user age

Display:
┌──────────────┐
│     85%      │
│   Effort     │
│              │
│   (visual    │
│    ring)     │
└──────────────┘
```

### Coaching Plan Badge
```
"Part of Coaching Plan"
Week [X] of [Total Weeks]
Workout Type: [Type]
```

---

## Implementation Checklist for iOS

### Phase 1: Core Structure
- [ ] Set up tab navigation with dynamic offset calculation
- [ ] Implement RunTabsFlagship component
- [ ] Create base container with proper spacing
- [ ] Wire up tab selection state management

### Phase 2: AI Insights Tab
- [ ] Implement all conditional sections in order
- [ ] Add Struggle Point Analysis filtering
- [ ] Garmin consent gating
- [ ] Coaching notes filtering logic

### Phase 3: Summary Tab
- [ ] Route Map (CRITICAL FIX)
  - [ ] Verify MapKit initialization
  - [ ] Implement fit-to-bounds camera logic
  - [ ] Test with real route data
- [ ] MainStatsGrid with delta calculations
- [ ] Km Splits display and card
- [ ] Km Splits bar chart

### Phase 4: Graphs Tab
- [ ] Run Score Rings (effort, cadence, consistency)
- [ ] Line chart canvas with proper padding rules
- [ ] All 6 core charts:
  - [ ] Pace
  - [ ] Elevation
  - [ ] Heart Rate
  - [ ] Cadence
  - [ ] Pace vs Elevation (dual-axis)
  - [ ] Cadence vs Elevation (dual-axis)
- [ ] Chart mode toggle (Time/Distance)
- [ ] Heart Rate Analysis section
  - [ ] HR Zones visual
  - [ ] HR vs Pace scatter
  - [ ] Intensity distribution donut
- [ ] Multi-Metric Analysis section (when Garmin)
  - [ ] Fatigue curve
  - [ ] Aerobic decoupling
  - [ ] Running economy
  - [ ] Race time predictor
  - [ ] Weather performance

### Phase 5: Dynamics Tab
- [ ] Conditional visibility logic
- [ ] Running Dynamics stats grid
- [ ] All 4 chart types:
  - [ ] Vertical Oscillation (chart + stat fallback)
  - [ ] Ground Contact Time (chart + stat fallback)
  - [ ] Stride Length (chart + stat fallback)
  - [ ] L/R Ground Contact Balance (color-coded)

### Phase 6: Data Tab
- [ ] All 11 data sections with proper conditions
- [ ] Pace, Speed, Time, Running Dynamics, HR, Elevation, Distance, Steps, Weather, Calories calculations
- [ ] Garmin disclosure badges

### Phase 7: Group Run Tab (if applicable)
- [ ] Conditional tab visibility (hasGroupRun)
- [ ] Metric tab switcher
- [ ] All 5 results tables with proper column sorting

### Phase 8: Polish & Testing
- [ ] Verify all conditional display logic
- [ ] Test with runs of varying data completeness
- [ ] Test with Garmin-enriched vs phone-only runs
- [ ] Map rendering stress test
- [ ] Chart performance optimization
- [ ] Verify all formatting matches Android

---

## Color Palette Reference

### Primary Colors
- **Primary**: Colors.primary (brand blue)
- **Success**: Colors.success (green)
- **Error**: Colors.error (red)
- **Warning**: #F97316 (orange)

### Chart-Specific Colors
- **Pace**: Colors.primary (blue)
- **Elevation**: Colors.success (green)
- **HR**: Colors.error (red)
- **Cadence**: #9C27B0 (purple)
- **Vertical Oscillation**: #06B6D4 (cyan)
- **Ground Contact Time**: #F97316 (orange)
- **Stride Length**: #10B981 (emerald)

### Zones (HR)
- **Z1**: #9CA3AF (gray)
- **Z2**: #3B82F6 (blue)
- **Z3**: #10B981 (green)
- **Z4**: #F97316 (orange)
- **Z5**: #EF4444 (red)

---

## Testing Scenarios

### Test Case 1: Phone-Only Run (No Garmin)
```
Expected:
- Dynamics tab: NOT shown
- Multi-Metric Analysis: NOT shown
- Garmin disclosure: NOT shown anywhere
- Graphs: Pace, Elevation, Cadence shown (if GPS + data)
- HR graphs: NOT shown (no HR data)
```

### Test Case 2: Garmin-Enriched Run
```
Expected:
- Dynamics tab: Shown (if VO/GCT/stride data exists)
- Multi-Metric Analysis: Shown with all cards
- Garmin disclosure: Shown before HR/Elev sections
- All graphs available
- Running economy + aerobic decoupling: Calculated
```

### Test Case 3: Short Run (< 1 km)
```
Expected:
- Map: Shown (if points exist)
- Graphs: Minimal (may not have 2+ points)
- Km Splits: NOT shown (< 2 km)
- Km Splits chart: NOT shown
```

### Test Case 4: Struggle Points
```
Expected:
- Struggle Point Analysis card: Shown above map
- Markers on map: Visible with intensity colors
- Comments section: Editable
```

### Test Case 5: Group Run Linked
```
Expected:
- Tab 1: "Group Run" between "AI Insights" and "Summary"
- All other tabs shifted by 1 index
- Group Run leaderboard: Shown with results
```

---

## Notes for iOS Dev Team

### Known Differences from Android
1. **Card Design**: iOS version is cleaner — keep this approach
2. **Map Implementation**: Currently broken — use MapKit 2.0+ (not deprecated MKMapView)
3. **Graph Library**: Consider SwiftUI Charts or similar (avoid UIKit charting libraries)
4. **Text Styling**: iOS uses SF Pro Display — follow existing text style guide

### Performance Considerations
- **Large route points**: > 5000 points may cause lag. Consider decimating to every 5-10 points for map display
- **Chart rendering**: Pre-calculate Y ranges to avoid recalculation on every frame
- **Memory**: Store time-series data (graphs) separately from run metadata

### Accessibility
- Ensure all graph axis labels are readable (min 12pt)
- Add VoiceOver labels to all interactive elements
- Support dynamic type scaling

---

## Appendix: Data Structure Reference

### RunSession Model
```kotlin
data class RunSession(
    val id: String,
    val distance: Double,              // meters
    val duration: Long,                // milliseconds
    val movingTime: Long?,             // milliseconds
    val elapsedTime: Long?,            // milliseconds
    val averagePace: String?,          // "4:32/km"
    val currentPace: String?,          // "4:32/km"
    val heartRate: Int,                // bpm (average)
    val minHeartRate: Int?,            // bpm
    val maxHeartRate: Int?,            // bpm
    val heartRateData: List<Double>?,  // List of bpm values
    val cadence: Int,                  // steps per minute (average)
    val maxCadence: Int?,              // spm
    val avgStrideLength: Double?,      // meters
    val avgVerticalOscillation: Double?, // cm
    val avgGroundContactTime: Double?, // milliseconds
    val avgGroundContactBalance: Float?, // 0-100, % left
    val totalElevationGain: Double,    // meters
    val totalElevationLoss: Double,    // meters
    val minElevation: Double?,         // meters
    val maxElevation: Double?,         // meters
    val steepestIncline: Double?,      // degrees
    val steepestDecline: Double?,      // degrees
    val maxGradient: Double,           // % (fallback for incline)
    val totalSteps: Int?,              // step count
    val calories: Int,                 // kcal
    val avgSpeed: Float?,              // m/s or km/h
    val maxSpeed: Float,               // m/s or km/h
    val routePoints: List<LocationPoint>, // GPS points
    val altitudeData: List<Double>,    // elevation points
    val kmSplits: List<KmSplit>,       // per-km pace breakdown
    val groundContactTimeData: List<Double>?, // milliseconds
    val verticalOscillationData: List<Double>?, // cm
    val verticalRatioData: List<Double>?, // %
    val strideLengthData: List<Double>?, // meters
    val struggglePoints: List<StrugglePoint>, // effort markers
    val aiCoachingNotes: List<AiCoachingNote>, // coaching messages
    val hasGarminData: Boolean,        // true if enriched from Garmin
    val externalSource: String?,       // "garmin", "strava", etc.
    val linkedGroupRunId: String?,     // Group run association
    val linkedPlanId: String?,         // Coaching plan association
    val workoutType: String?,          // "Easy", "Tempo", etc.
    val weatherAtStart: WeatherData?,  // Conditions at run start
    val userAge: Int?,                 // For HR zone calculations
)

data class LocationPoint(
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long,               // milliseconds
    val altitude: Double,              // meters
)

data class KmSplit(
    val kmIndex: Int,                  // 1-based (Km 1, Km 2, etc.)
    val pace: String,                  // "4:32/km"
    val distance: Double,              // meters (usually ~1000)
    val elevationGain: Double?,        // meters
)

data class StrugglePoint(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    val intensity: Int,                // 1-5
    val timestamp: Long,
    val reason: String?,               // "hills", "fatigue", etc.
)

data class AiCoachingNote(
    val id: String,
    val message: String,
    val latitude: Double?,
    val longitude: Double?,
    val timestamp: Long,
    val type: String?,                 // "encouragement", "pace", etc.
)

data class WeatherData(
    val temperature: Double,           // Celsius
    val conditions: String,            // "Clear", "Rainy", etc.
    val humidity: Int,                 // 0-100 %
    val windSpeed: Double,             // km/h
    val visibility: Double,            // km
)
```

---

**Document Version**: 1.0
**Last Updated**: July 2026
**Status**: Complete & Ready for iOS Implementation

