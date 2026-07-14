# Heart Rate to Pace Efficiency Graphs Brief

**Status**: Ready for Implementation (Both iOS & Android)  
**Scope**: Add HR-to-Pace efficiency visualization to run summary + My Data tab  
**Context**: Key performance indicator for aerobic base building and training efficiency  
**Timeline**: 2-3 days (both platforms)

---

## 📋 Executive Summary

**Heart Rate to Pace Efficiency** (also called "Cardiac Efficiency" or "HR Economy") is a crucial metric that shows how efficiently a runner uses their cardiovascular effort to maintain pace. Lower heart rate at the same pace = better aerobic fitness and economy.

**New visualizations**:
- ✅ **Run Summary**: Single-run efficiency chart (HR vs pace throughout the run)
- ✅ **My Data Trends**: Historical efficiency trends (weekly/monthly progression)
- ✅ **Zone-based efficiency**: Show efficiency by HR zone
- ✅ **Trending indicator**: Is efficiency improving or declining?

**Why it matters**:
- Runners see **quantified evidence** of aerobic fitness improvement
- Shows **impact of training zones** (Zone 2 builds efficiency)
- Identifies **breakthrough moments** (sudden efficiency jumps)
- Motivates continued **consistent easy running**

---

## 🎯 What is HR-to-Pace Efficiency?

### Definition

**HR-to-Pace Ratio** = Heart Rate (bpm) ÷ Pace (min/km)

Or inversely, **Pace-to-HR Ratio** = Pace per bpm (lower = more efficient)

**Example:**
```
Run A: 150 BPM at 5:30 min/km  → Ratio = 150 / 5.5 = 27.3 (less efficient)
Run B: 140 BPM at 5:30 min/km  → Ratio = 140 / 5.5 = 25.5 (more efficient ✓)

Lower ratio = more efficient (same pace with lower heart rate)
```

### What Drives Efficiency?

1. **Aerobic Base Training** (Zone 2) — builds mitochondrial density
2. **Reduced Strain Injury** — mechanical efficiency improves
3. **Hydration & Nutrition** — impacts HR variability
4. **Environmental Factors** — temperature, humidity, elevation
5. **Recovery & Adaptation** — time between hard efforts
6. **Individual Fitness Progression** — weeks of consistent training

### Interpretation

| Efficiency Change | Meaning | User Action |
|---|---|---|
| **Improving (down)** ✓ | Aerobic fitness is building | Keep doing Zone 2 easy runs |
| **Declining (up)** ⚠ | Fatigue or insufficient recovery | Take a rest day, easy week |
| **Stable** | Fitness plateau | Consider a tempo or threshold run |
| **High variance** | HR data unreliable (chest strap issues) | Check HR monitor calibration |

---

## 📱 Run Summary — Single Run Efficiency Chart

### UI Placement

Add a new **Efficiency Card** in the run summary screen, positioned **below the route map and above the detailed stats**:

```
┌───────────────────���─────────────────────┐
│ [Route Map with pace coloring]          │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 💚 HR-TO-PACE EFFICIENCY          │  │ ← Card title (green accent)
│ │                                   │  │
│ │  Efficiency Score: 24.5           │  │ ← Primary metric (large)
│ │  (lower = more efficient)         │  │ ← Help text
│ │                                   │  │
│ │  [Dual-axis line chart]           │  │ ← HR (left axis, red)
│ │   HR (bpm)        Pace (min/km)   │  │    Pace (right axis, green)
│ │   160 ─────────────────     6:00  │  │
│ │   150 ╱──╲      ╱───╲─    5:30    │  │
│ │   140 ╱    ╲    ╱     ╲   5:00    │  │
│ │   130 ╱      ╲╱        ╲  4:30    │  │
│ │   120 ─────────────────   4:00    │  │
│ │        0:00  10:00  20:00 30:00   │  │
│ │                                   │  │
│ │ 🔍 Peak HR Efficiency: 4:45/km    │  │ ← Best pace at lowest HR
│ │    at 135 BPM (around 15:30)      │  │
│ │                                   │  │
│ │ 📊 Zone 2 Efficiency: 26.1        │  │ ← Zone-specific efficiency
│ │ 📊 Zone 3 Efficiency: 23.5        │  │
│ │                                   │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [Detailed stats below]                  │
└─────────────────────────────────────────┘
```

### Card Components

#### 1. **Efficiency Score (Header)**
```
💚 HR-TO-PACE EFFICIENCY

Efficiency Score: 24.5
(lower is more efficient)
```
- **Title**: Green accent, pill-shaped header
- **Score**: Large primary metric (decimal to 1 place)
- **Range indicator**: Show "Good" / "Average" / "Needs work" based on user's historical average
  - Green (< 20): Excellent efficiency
  - Teal (20-25): Good
  - Yellow (25-30): Average
  - Orange (> 30): Building efficiency

#### 2. **Dual-Axis Time Series Chart**

Chart showing HR and pace over the run duration:

**Left Y-axis**: Heart Rate (bpm)
- Range: 100-180 bpm (auto-scaled to min/max)
- Red/orange line color
- 20 bpm gridlines

**Right Y-axis**: Pace (min/km or min/mile)
- Range: Auto-scaled to run's pace ±30 seconds
- Green line color
- Gridlines every 30 seconds

**X-axis**: Elapsed time (HH:MM format)
- Show 0 to total duration
- Gridlines every 5-10 minutes (depending on run length)

**Hover/Tap interactions** (optional):
- Hover over point → show (time, HR, pace) tooltip
- Long-press → highlight that time point on map

#### 3. **Peak Efficiency Indicator**

```
🔍 Peak HR Efficiency: 4:45/km at 135 BPM (around 15:30)
```

This shows the **fastest pace at the lowest heart rate** — the "sweet spot" of efficiency for that run.

**Calculation**: Find the point with the highest `pace / HR` ratio (or lowest `HR / pace`)

#### 4. **Zone-based Efficiency**

```
📊 Zone 2 Efficiency: 26.1
📊 Zone 3 Efficiency: 23.5
📊 Threshold Efficiency: 21.8
```

For each HR zone the runner spent time in:
- Calculate average HR-to-pace ratio during that zone
- Display for comparison
- Lower zone (Zone 2) should typically have higher ratio (less efficient by design — lower intensity)
- Higher zones should have lower ratio (more economical at faster paces)

---

## 📊 My Data Tab — Historical Efficiency Trends

### UI Placement

Add **Efficiency Trend** as a new section in `PerformanceTrendsSection` (between pace trends and HR trends):

```
┌─────────────────────────────────────────────┐
│ 📈 PERFORMANCE TRENDS (Last 4 Weeks)         │
├─────────────────────────────────────────────┤
│                                             │
│ [Pace Trend Chart]                          │
│                                             │
│ [HR Trend Chart]                            │
│                                             │
│ 💚 HR-TO-PACE EFFICIENCY (NEW)               │ ← New section
│ ┌─────────────────────────────────────────┐ │
│ │ Trend: IMPROVING ✓  -2.1 pts/week       │ │ ← Direction + slope
│ │                                         │ │
│ │ [Line chart: Efficiency over time]      │ │
│ │  Ratio                                  │ │
│ │  30  ╲╲                                 │ │
│ │  28   ╲╲╲      ╲                        │ │
│ │  26    ╲╲╲╲╲╲╲╲ ╲╲╲                    │ │
│ │  24     ╲╲╲╲��╲  ╲ ╲ ╲                  │ │
│ │  22      ═══════════                   │ │
│ │       W1  W2  W3  W4                    │ │ ← Weekly aggregates
│ │                                         │ │
│ │ Baseline (Week 1): 27.8                 │ │
│ │ Current (Week 4):  25.2                 │ │
│ │ Total Improvement: -2.6 pts (9.4%) ✓   │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [More sections below]                       │
└─────────────────────────────────────────────┘
```

### Trends Section Details

#### 1. **Efficiency Direction Badge**

```
Trend: IMPROVING ✓  -2.1 pts/week
```

- **Color**: Green if improving, Red if declining, Grey if stable
- **Icon**: ✓ (improving), ⚠ (declining), = (stable)
- **Rate**: Points per week change (regression slope)

#### 2. **Historical Efficiency Chart**

Shows aggregated efficiency over selected time period (4 weeks, 3 months, 1 year, all-time).

**Data points**: 
- Weekly aggregates: Calculate average efficiency for all runs in that week
- Monthly aggregates: Calculate average efficiency for all runs in that month
- Connect with line (trend line visible)

**Chart styling**:
- **Line color**: Green if improving trend, orange if declining
- **Shading**: Area under curve, 20% opacity
- **Annotations**: Highlight weeks with major breakthroughs (> -1 point drop in a week)

#### 3. **Improvement Summary**

```
Baseline (Week 1): 27.8
Current (Week 4):  25.2
Total Improvement: -2.6 pts (9.4%) ✓
```

Or for months:

```
Baseline (January):     28.2
Current (April):        25.8
Total Improvement:      -2.4 pts (8.5%) ✓
Average improvement:    -0.6 pts/month
```

---

## 🏗️ Data Calculation & Storage

### What Data We Need

For each run:
1. **Heart rate data points**: Array of `(timestamp, bpm)` pairs
2. **GPS pace data points**: Array of `(timestamp, pace_min_per_km)` pairs
3. **HR zone mapping**: Which HR zones was the runner in at each timestamp

### Calculation Pipeline

#### Step 1: Align HR and Pace Data

Both HR and pace come from different sources (chest strap vs. GPS):
- HR updates: ~1 Hz (every 1 second) from heart rate monitor
- GPS pace: Calculated from coordinates, often sampled less frequently

**Synchronization**:
- Use timestamps to align both datasets
- Interpolate missing values (linear interpolation between adjacent points)
- Filter out noisy spikes (outliers > 2 std dev)

#### Step 2: Calculate Per-Run Efficiency

```swift
// Pseudocode
func calculateRunEfficiency(
    hrPoints: [(timestamp, bpm)],
    pacePoints: [(timestamp, minPerKm)]
) -> Double {
    var totalRatio = 0.0
    var validPoints = 0
    
    for timestamp in allTimestamps {
        let hr = interpolate(hrPoints, at: timestamp)
        let pace = interpolate(pacePoints, at: timestamp)
        
        // Skip anomalies
        if hr < 90 || hr > 200 || pace < 3.0 || pace > 15.0 {
            continue
        }
        
        let ratio = hr / pace  // BPM per min/km
        totalRatio += ratio
        validPoints += 1
    }
    
    return validPoints > 0 ? totalRatio / validPoints : 0.0
}
```

**Output**: Single `averageEfficiency` value per run (e.g., 24.5)

#### Step 3: Calculate Zone-Specific Efficiency

```swift
func calculateZoneEfficiency(
    hrPoints: [(timestamp, bpm)],
    pacePoints: [(timestamp, minPerKm)],
    zone: HRZone  // Zone 2, Zone 3, etc.
) -> Double {
    // Filter points where HR is in zone range
    let zonePoints = hrPoints.filter { 
        $0.bpm >= zone.minBpm && $0.bpm <= zone.maxBpm 
    }
    
    // Calculate average HR/pace ratio for those points
    // Same calculation as above, but only for zone-specific points
    ...
}
```

**Output**: Efficiency values for each zone the runner used in that run

#### Step 4: Aggregate for Trends

```swift
func aggregateEfficiencyTrend(
    runs: [Run],
    period: TimePeriod  // .lastWeek, .lastMonth, etc.
) -> [TrendDataPoint] {
    // Group runs by week (or month)
    let grouped = runs.grouped(by: { run.completedAt.weekOf() })
    
    return grouped.map { week, runsInWeek in
        TrendDataPoint(
            label: "Week \(week)",
            value: runsInWeek.map { $0.efficiency }.average()
        )
    }
}
```

**Output**: Array of trend points for charting

---

## 📊 Visual Design

### Colors

| Element | Color | Usage |
|---------|-------|-------|
| **HR line** | `#FF5252` (red) | Heart rate data |
| **Pace line** | `#66BB6A` (green) | Running pace data |
| **Efficiency (good)** | `#4CAF50` (green) | Score improving |
| **Efficiency (neutral)** | `#FFC107` (amber) | Score stable/average |
| **Efficiency (poor)** | `#FF9800` (orange) | Score declining |
| **Trend area** | Primary (20% opacity) | Area under trend line |

### Typography

- **Efficiency Score**: 48pt, bold, primary colour
- **Zone labels**: 14pt, regular, secondary colour
- **Metric labels**: 12pt, caption style
- **Trend badge**: 14pt, bold, coloured (green/orange/grey)

### Chart Styling

- **Line width**: 2.5 dp
- **Point radius**: 3 dp (tappable)
- **Grid lines**: Light grey, 40% opacity
- **Background**: Transparent (inherit card background)
- **Padding**: 16 dp around chart area

---

## 🔧 Implementation Details

### Android (Jetpack Compose)

#### 1. Data Model

```kotlin
data class RunEfficiencyData(
    val runId: String,
    val completedAt: LocalDateTime,
    val averageEfficiency: Double,  // HR / Pace ratio
    val peakEfficiency: Double,      // Best efficiency point
    val peakEfficiencyPace: Double,  // Pace at peak efficiency
    val peakEfficiencyHr: Int,       // HR at peak efficiency
    val peakEfficiencyTime: Duration, // Time when peak occurred
    val zoneEfficiencies: Map<HRZone, Double>,  // Per-zone efficiency
    val hrDataPoints: List<HRDataPoint>,
    val paceDataPoints: List<PaceDataPoint>
)

data class HRDataPoint(
    val timestamp: Duration,  // Time since run start
    val bpm: Int
)

data class PaceDataPoint(
    val timestamp: Duration,
    val minPerKm: Double
)

data class EfficiencyTrendPoint(
    val period: String,  // "Week 1", "Jan", etc.
    val efficiency: Double,
    val runCount: Int
)
```

#### 2. Run Summary Component

```kotlin
@Composable
fun RunEfficiencyCard(
    efficiency: RunEfficiencyData,
    isPeak: Boolean = false
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "💚 HR-TO-PACE EFFICIENCY",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Efficiency Score
            Text(
                text = String.format("%.1f", efficiency.averageEfficiency),
                style = AppTextStyles.h1.copy(fontSize = 48.sp),
                color = Colors.textPrimary
            )
            Text(
                text = "(lower is more efficient)",
                style = AppTextStyles.caption,
                color = Colors.textMuted
            )
            
            Spacer(modifier = Modifier.height(Spacing.lg))
            
            // Dual-axis chart
            DualAxisLineChart(
                hrDataPoints = efficiency.hrDataPoints,
                paceDataPoints = efficiency.paceDataPoints,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(250.dp)
            )
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Peak efficiency indicator
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(BorderRadius.sm))
                    .background(Colors.backgroundTertiary.copy(alpha = 0.5f))
                    .padding(Spacing.md),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "🔍",
                    style = AppTextStyles.h4,
                    modifier = Modifier.padding(end = Spacing.sm)
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Peak HR Efficiency",
                        style = AppTextStyles.caption.copy(fontWeight = FontWeight.SemiBold),
                        color = Colors.textSecondary
                    )
                    Text(
                        text = String.format(
                            "%.2f min/km at %d BPM (around %s)",
                            efficiency.peakEfficiencyPace,
                            efficiency.peakEfficiencyHr,
                            formatDuration(efficiency.peakEfficiencyTime)
                        ),
                        style = AppTextStyles.body,
                        color = Colors.textPrimary
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Zone-specific efficiency
            if (efficiency.zoneEfficiencies.isNotEmpty()) {
                Text(
                    text = "Zone Breakdown",
                    style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
                    color = Colors.textSecondary,
                    modifier = Modifier.padding(bottom = Spacing.sm)
                )
                
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    efficiency.zoneEfficiencies.forEach { (zone, eff) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = Spacing.sm),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "📊 ${zone.name} Efficiency",
                                style = AppTextStyles.small,
                                color = Colors.textSecondary
                            )
                            Text(
                                text = String.format("%.1f", eff),
                                style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
                                color = Colors.primary
                            )
                        }
                    }
                }
            }
        }
    }
}
```

#### 3. Dual-Axis Chart Component

```kotlin
@Composable
fun DualAxisLineChart(
    hrDataPoints: List<HRDataPoint>,
    paceDataPoints: List<PaceDataPoint>,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val chartPadding = 48.dp.toPx()
        val chartWidth = size.width - 2 * chartPadding
        val chartHeight = size.height - 2 * chartPadding
        
        // Calculate scales
        val hrMin = hrDataPoints.minOf { it.bpm }.toFloat() - 10
        val hrMax = hrDataPoints.maxOf { it.bpm }.toFloat() + 10
        val paceMin = paceDataPoints.minOf { it.minPerKm }.toFloat() - 0.5f
        val paceMax = paceDataPoints.maxOf { it.minPerKm }.toFloat() + 0.5f
        val timeMax = maxOf(
            hrDataPoints.maxOf { it.timestamp.inWholeSeconds },
            paceDataPoints.maxOf { it.timestamp.inWholeSeconds }
        ).toFloat()
        
        // Helper functions for coordinate transformation
        fun timeToX(time: Duration): Float {
            return chartPadding + (time.inWholeSeconds / timeMax) * chartWidth
        }
        
        fun hrToY(hr: Int): Float {
            return chartPadding + chartHeight - ((hr - hrMin) / (hrMax - hrMin) * chartHeight).toFloat()
        }
        
        fun paceToY(pace: Double): Float {
            return chartPadding + chartHeight - ((pace - paceMin) / (paceMax - paceMin) * chartHeight).toFloat()
        }
        
        // Draw grid
        drawGridLines(chartPadding, chartWidth, chartHeight)
        
        // Draw HR line (red)
        drawLine(
            color = Color(0xFFFF5252),
            start = Offset(timeToX(hrDataPoints[0].timestamp), hrToY(hrDataPoints[0].bpm)),
            end = Offset(timeToX(hrDataPoints.last().timestamp), hrToY(hrDataPoints.last().bpm)),
            strokeWidth = 2.5.dp.toPx()
        )
        hrDataPoints.forEachIndexed { i, point ->
            if (i < hrDataPoints.size - 1) {
                val next = hrDataPoints[i + 1]
                drawLine(
                    color = Color(0xFFFF5252),
                    start = Offset(timeToX(point.timestamp), hrToY(point.bpm)),
                    end = Offset(timeToX(next.timestamp), hrToY(next.bpm)),
                    strokeWidth = 2.5.dp.toPx()
                )
            }
        }
        
        // Draw pace line (green)
        paceDataPoints.forEachIndexed { i, point ->
            if (i < paceDataPoints.size - 1) {
                val next = paceDataPoints[i + 1]
                drawLine(
                    color = Color(0xFF66BB6A),
                    start = Offset(timeToX(point.timestamp), paceToY(point.minPerKm)),
                    end = Offset(timeToX(next.timestamp), paceToY(next.minPerKm)),
                    strokeWidth = 2.5.dp.toPx()
                )
            }
        }
        
        // Draw axes labels (left: HR, right: Pace)
        // ... (implement axis label rendering)
    }
}
```

#### 4. My Data Trends Section

```kotlin
@Composable
fun EfficiencyTrendSection(
    viewModel: MyDataViewModel,
    timePeriod: TimePeriod
) {
    val efficiencyTrend by viewModel.getEfficiencyTrend(timePeriod).collectAsState(emptyList())
    val trendDirection by viewModel.getEfficiencyTrendDirection(timePeriod).collectAsState(TrendDirection.STABLE)
    val improvementRate by viewModel.getEfficiencyImprovementRate(timePeriod).collectAsState(0.0)
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.lg),
        shape = RoundedCornerShape(BorderRadius.md),
        colors = CardDefaults.cardColors(containerColor = Colors.backgroundSecondary)
    ) {
        Column(modifier = Modifier.padding(Spacing.lg)) {
            // Header with trend badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "💚 HR-TO-PACE EFFICIENCY",
                    style = AppTextStyles.h4.copy(fontWeight = FontWeight.Bold),
                    color = Colors.primary
                )
                
                // Trend badge
                TrendBadge(
                    direction = trendDirection,
                    rate = improvementRate
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Historical trend chart
            LineChart(
                data = efficiencyTrend,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
                lineColor = when (trendDirection) {
                    TrendDirection.IMPROVING -> Colors.success
                    TrendDirection.DECLINING -> Colors.warning
                    TrendDirection.STABLE -> Colors.textMuted
                }
            )
            
            Spacer(modifier = Modifier.height(Spacing.md))
            
            // Summary stats
            val firstPoint = efficiencyTrend.firstOrNull()
            val lastPoint = efficiencyTrend.lastOrNull()
            
            if (firstPoint != null && lastPoint != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(BorderRadius.sm))
                        .background(Colors.backgroundTertiary.copy(alpha = 0.5f))
                        .padding(Spacing.md),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    StatBlock(
                        label = "Baseline",
                        value = String.format("%.1f", firstPoint.value)
                    )
                    StatBlock(
                        label = "Current",
                        value = String.format("%.1f", lastPoint.value)
                    )
                    StatBlock(
                        label = "Improvement",
                        value = String.format("%.1f pts (%.1f%%)",
                            firstPoint.value - lastPoint.value,
                            ((firstPoint.value - lastPoint.value) / firstPoint.value * 100)
                        ),
                        color = Colors.success
                    )
                }
            }
        }
    }
}

@Composable
private fun TrendBadge(
    direction: TrendDirection,
    rate: Double
) {
    val (color, icon, text) = when (direction) {
        TrendDirection.IMPROVING -> Triple(Colors.success, "✓", "Improving")
        TrendDirection.DECLINING -> Triple(Colors.warning, "⚠", "Declining")
        TrendDirection.STABLE -> Triple(Colors.textMuted, "=", "Stable")
    }
    
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(BorderRadius.full))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = Spacing.sm, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
    ) {
        Text(
            text = icon,
            style = AppTextStyles.small,
            color = color
        )
        Text(
            text = "$text ${if (rate > 0) "-" else "+"}${String.format("%.1f", kotlin.math.abs(rate))} pts/week",
            style = AppTextStyles.caption.copy(fontWeight = FontWeight.Bold),
            color = color
        )
    }
}

@Composable
private fun StatBlock(
    label: String,
    value: String,
    color: Color = Colors.textPrimary
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            style = AppTextStyles.caption,
            color = Colors.textMuted
        )
        Text(
            text = value,
            style = AppTextStyles.body.copy(fontWeight = FontWeight.Bold),
            color = color
        )
    }
}

enum class TrendDirection {
    IMPROVING, DECLINING, STABLE
}
```

### iOS (SwiftUI)

#### 1. Data Model

```swift
struct RunEfficiencyData: Codable {
    let runId: String
    let completedAt: Date
    let averageEfficiency: Double
    let peakEfficiency: Double
    let peakEfficiencyPace: Double
    let peakEfficiencyHr: Int
    let peakEfficiencyTime: TimeInterval
    let zoneEfficiencies: [String: Double]  // Zone name → efficiency
    let hrDataPoints: [HRDataPoint]
    let paceDataPoints: [PaceDataPoint]
}

struct HRDataPoint: Codable {
    let timestamp: TimeInterval  // Seconds since run start
    let bpm: Int
}

struct PaceDataPoint: Codable {
    let timestamp: TimeInterval
    let minPerKm: Double
}

struct EfficiencyTrendPoint: Codable {
    let period: String
    let efficiency: Double
    let runCount: Int
}

enum TrendDirection {
    case improving
    case declining
    case stable
    
    var color: Color {
        switch self {
        case .improving:
            return .green
        case .declining:
            return .orange
        case .stable:
            return .gray
        }
    }
    
    var icon: String {
        switch self {
        case .improving:
            return "✓"
        case .declining:
            return "⚠"
        case .stable:
            return "="
        }
    }
}
```

#### 2. Run Summary View

```swift
struct RunEfficiencyCardView: View {
    let efficiency: RunEfficiencyData
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("💚 HR-TO-PACE EFFICIENCY")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.teal)
                Spacer()
            }
            
            // Efficiency Score
            VStack(alignment: .leading, spacing: 4) {
                Text(String(format: "%.1f", efficiency.averageEfficiency))
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(.primary)
                
                Text("(lower is more efficient)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            // Dual-axis chart
            DualAxisChartView(
                hrDataPoints: efficiency.hrDataPoints,
                paceDataPoints: efficiency.paceDataPoints
            )
            .frame(height: 250)
            
            // Peak efficiency indicator
            HStack(spacing: 12) {
                Text("🔍")
                    .font(.system(size: 18))
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Peak HR Efficiency")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.secondary)
                    
                    Text(String(format: "%.2f min/km at %d BPM", 
                                 efficiency.peakEfficiencyPace, 
                                 efficiency.peakEfficiencyHr))
                        .font(.body)
                        .foregroundColor(.primary)
                }
                
                Spacer()
            }
            .padding(.all, 12)
            .background(Color(.systemGray6))
            .cornerRadius(8)
            
            // Zone breakdown
            if !efficiency.zoneEfficiencies.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Zone Breakdown")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.secondary)
                    
                    ForEach(efficiency.zoneEfficiencies.sorted(by: { $0.key < $1.key }), id: \.key) { zone, eff in
                        HStack {
                            Text("📊 \(zone) Efficiency")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            
                            Spacer()
                            
                            Text(String(format: "%.1f", eff))
                                .font(.body)
                                .fontWeight(.bold)
                                .foregroundColor(.teal)
                        }
                    }
                }
            }
        }
        .padding(.all, 16)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}
```

#### 3. Dual-Axis Chart (iOS)

```swift
struct DualAxisChartView: View {
    let hrDataPoints: [HRDataPoint]
    let paceDataPoints: [PaceDataPoint]
    
    var body: some View {
        Canvas { context in
            let chartPadding: CGFloat = 48
            let chartWidth = context.size.width - 2 * chartPadding
            let chartHeight = context.size.height - 2 * chartPadding
            
            // Calculate scales
            let hrMin = CGFloat(hrDataPoints.map { $0.bpm }.min() ?? 100) - 10
            let hrMax = CGFloat(hrDataPoints.map { $0.bpm }.max() ?? 160) + 10
            let paceMin = CGFloat(paceDataPoints.map { $0.minPerKm }.min() ?? 4) - 0.5
            let paceMax = CGFloat(paceDataPoints.map { $0.minPerKm }.max() ?? 8) + 0.5
            let timeMax = CGFloat(max(
                hrDataPoints.map { $0.timestamp }.max() ?? 0,
                paceDataPoints.map { $0.timestamp }.max() ?? 0
            ))
            
            // Helper functions
            func timeToX(_ time: TimeInterval) -> CGFloat {
                chartPadding + (CGFloat(time) / timeMax) * chartWidth
            }
            
            func hrToY(_ hr: Int) -> CGFloat {
                chartPadding + chartHeight - ((CGFloat(hr) - hrMin) / (hrMax - hrMin) * chartHeight)
            }
            
            func paceToY(_ pace: Double) -> CGFloat {
                chartPadding + chartHeight - ((CGFloat(pace) - paceMin) / (paceMax - paceMin) * chartHeight)
            }
            
            // Draw HR line
            for i in 0..<(hrDataPoints.count - 1) {
                let p1 = hrDataPoints[i]
                let p2 = hrDataPoints[i + 1]
                
                context.stroke(
                    Path(CGPath(lineFrom: CGPoint(x: timeToX(p1.timestamp), y: hrToY(p1.bpm)),
                                              to: CGPoint(x: timeToX(p2.timestamp), y: hrToY(p2.bpm)))),
                    with: .color(.red),
                    lineWidth: 2.5
                )
            }
            
            // Draw pace line
            for i in 0..<(paceDataPoints.count - 1) {
                let p1 = paceDataPoints[i]
                let p2 = paceDataPoints[i + 1]
                
                context.stroke(
                    Path(CGPath(lineFrom: CGPoint(x: timeToX(p1.timestamp), y: paceToY(p1.minPerKm)),
                                              to: CGPoint(x: timeToX(p2.timestamp), y: paceToY(p2.minPerKm)))),
                    with: .color(.green),
                    lineWidth: 2.5
                )
            }
        }
    }
}
```

#### 4. My Data Trends View

```swift
struct EfficiencyTrendView: View {
    @StateObject var viewModel: MyDataViewModel
    let timePeriod: TimePeriod
    
    @State private var efficiencyTrend: [EfficiencyTrendPoint] = []
    @State private var trendDirection: TrendDirection = .stable
    @State private var improvementRate: Double = 0.0
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header with trend badge
            HStack {
                Text("💚 HR-TO-PACE EFFICIENCY")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.teal)
                
                Spacer()
                
                // Trend badge
                HStack(spacing: 4) {
                    Text(trendDirection.icon)
                    Text("\(trendDirection == .improving ? "Improving" : trendDirection == .declining ? "Declining" : "Stable") \(improvementRate > 0 ? "-" : "+")​\(String(format: "%.1f", abs(improvementRate))) pts/week")
                        .font(.caption)
                        .fontWeight(.bold)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(trendDirection.color.opacity(0.15))
                .foregroundColor(trendDirection.color)
                .cornerRadius(12)
            }
            
            // Line chart
            LineChartView(data: efficiencyTrend, lineColor: trendDirection.color)
                .frame(height: 200)
            
            // Summary stats
            if let first = efficiencyTrend.first, let last = efficiencyTrend.last {
                HStack(spacing: 12) {
                    StatBlockView(label: "Baseline", value: String(format: "%.1f", first.efficiency))
                    StatBlockView(label: "Current", value: String(format: "%.1f", last.efficiency))
                    StatBlockView(
                        label: "Improvement",
                        value: String(format: "%.1f pts", first.efficiency - last.efficiency),
                        color: .green
                    )
                }
                .padding(.all, 12)
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }
        }
        .padding(.all, 16)
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .onAppear {
            loadTrendData()
        }
    }
    
    private func loadTrendData() {
        // Load efficiency trend from viewModel
        // Update state variables
    }
}

struct StatBlockView: View {
    let label: String
    let value: String
    let color: Color = .primary
    
    var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            
            Text(value)
                .font(.body)
                .fontWeight(.bold)
                .foregroundColor(color)
        }
    }
}
```

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Efficiency calculation: HR / pace gives correct ratio
- [ ] Zone-specific filtering: Correctly identifies HR zone ranges
- [ ] Peak efficiency detection: Finds the point with best ratio
- [ ] Trend calculation: Weekly aggregates are averaged correctly
- [ ] Improvement rate: Regression slope calculation is accurate
- [ ] Data interpolation: Missing data points are filled correctly

### Integration Tests
- [ ] Run with complete HR + pace data → shows efficiency card
- [ ] Run with partial HR data → still calculates (skips bad points)
- [ ] Run with no HR data → shows error/placeholder ("HR data unavailable")
- [ ] Zone-specific efficiency displays for each zone used in run
- [ ] Peak efficiency point is highlighted correctly on chart
- [ ] My Data trends load for different time periods (4w, 12w, 1y, all-time)
- [ ] Trend direction updates correctly as new runs are added

### E2E Tests

**Scenario 1: View Single Run Efficiency**
1. [ ] Complete a run with HR monitor
2. [ ] Open run summary
3. [ ] Scroll to efficiency card
4. [ ] See HR-to-pace chart
5. [ ] See efficiency score (e.g., 24.5)
6. [ ] See peak efficiency indicator
7. [ ] See zone-specific efficiency

**Scenario 2: Track Efficiency Over Time**
1. [ ] Complete 4+ runs over 4 weeks
2. [ ] Open My Data tab
3. [ ] Scroll to "HR-to-Pace Efficiency" section
4. [ ] See weekly trend line (should improve if training Zone 2)
5. [ ] See "Improving ✓" badge if trend is down
6. [ ] See summary: "Baseline 27.8 → Current 25.2 (-2.6 pts, 9.4%)"

**Scenario 3: Declining Efficiency**
1. [ ] Run many hard workouts in short time (no recovery)
2. [ ] Efficiency worsens (higher ratio, red trend)
3. [ ] See "Declining ⚠" badge
4. [ ] Get coach message: "Your HR efficiency has declined. Consider taking an easy week to recover."

**Scenario 4: Stable Efficiency**
1. [ ] Run consistently for 8 weeks with similar pace/HR
2. [ ] Trend shows flat line
3. [ ] See "Stable =" badge
4. [ ] Coach message: "You've plateaued. Time for a tempo session or speed work."

---

## 📊 Coach Messaging Integration

When efficiency changes, the AI coach can reference this metric:

### Improving Efficiency (Green ✓)
```
"Your aerobic fitness is building beautifully! 
Over the last 4 weeks, your HR-to-pace efficiency improved by 9.4%. 
You're running faster with lower heart rate — exactly what Zone 2 easy runs do. 
Keep going! 🎉"
```

### Declining Efficiency (Orange ⚠)
```
"Your aerobic efficiency has declined this week (from 25.2 to 27.1). 
This might signal fatigue or insufficient recovery. 
Consider taking an easy day or complete rest day before your next hard workout."
```

### Plateau (Grey =)
```
"Your efficiency has been stable for 3 weeks now. 
You've adapted to your current training load. 
Time to introduce some tempo runs or threshold work to drive new fitness gains!"
```

---

## 🚀 Implementation Order

### Phase 1: Data Collection & Calculation (1 day)
1. Ensure HR and pace data are captured from all runs
2. Create `RunEfficiencyData` model
3. Implement efficiency calculation (HR / pace)
4. Implement zone-specific efficiency filtering
5. Cache efficiency values on backend

### Phase 2: Run Summary UI (1 day)
1. Create efficiency card component
2. Implement dual-axis chart (HR + pace)
3. Display peak efficiency indicator
4. Display zone-specific efficiency
5. Style with correct colours and typography

### Phase 3: My Data Trends (1 day)
1. Create efficiency trend aggregation logic
2. Implement trend line chart
3. Create trend direction badge
4. Display improvement/decline rate
5. Show baseline vs. current summary

### Phase 4: Coach Messaging (1/2 day)
1. Add efficiency metric to coach prompt
2. Create response templates for trending insights
3. Trigger coach messages on significant changes
4. Test messaging tone and accuracy

### Phase 5: Polish & Testing (1/2 day)
1. Refine chart interactions (hover, tap)
2. Add loading states
3. Comprehensive device testing
4. Error handling (missing data, invalid values)
5. Accessibility review (colour contrast, descriptions)

---

## Summary

**HR-to-Pace Efficiency** is a **market-leading** performance indicator that shows aerobic fitness progression through a single metric: **how much heart rate per unit of pace**.

**Key insights**:
- ✅ Runners see quantified proof of aerobic base building
- ✅ Identifies training zones that work (Zone 2 → efficiency ↓)
- ✅ Detects fatigue and need for recovery
- ✅ Motivates consistent easy running
- ✅ Integrates with AI coach for personalized messaging

**Technical implementation**:
- **Calculation**: HR ÷ Pace (lower is better)
- **Display**: Dual-axis charts (run summary), trend lines (My Data)
- **Integration**: Zone-specific analysis, trend direction badges, coach messaging

**Timeline**: 2-3 days total (both iOS & Android)  
**Complexity**: Medium (data processing + chart rendering)  
**User Impact**: High (visible fitness progress = engagement + motivation)

