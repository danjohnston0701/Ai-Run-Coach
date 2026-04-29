# Sprint 2: Next Steps Implementation Guide

## Current Status

✅ **Completed**:
- GraphAxisUtils.kt (reusable axis logic)
- HeartRateZonePaceChart.kt (priority graph)
- SPRINT_2_GARMIN_GRAPHS_DESIGN.md (5 key graphs)
- SPRINT_2_EXPANDED_GRAPHS.md (14-graph complete library)
- SPRINT_2_COMPLETE_GRAPH_LIBRARY.md (full vision)

---

## Immediate Next Steps (This Sprint)

### Task 1: Integrate HeartRateZonePaceChart into RunSummaryScreen
Add the chart to the Graphs tab with real data from RunSession.

```kotlin
// In RunSummaryScreen.kt, Graphs tab section:

item {
    HeartRateZonePaceChart(
        run = run,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
    )
}
```

**Data needed from RunSession**:
- `heartRateData` (list of HR values by time)
- `paceData` (list of pace values by time or distance)
- `heartRate` (average HR)
- `pace` (average pace)
- `maxHeartRate` (computed from data)

---

### Task 2: Create 4 Priority Graphs (Phase 1b)

Build these next graphs in order:

#### **Graph 1: HR Over Time**
```kotlin
@Composable
fun HeartRateOverTimeChart(
    run: RunSession,
    modifier: Modifier = Modifier
) {
    // X-axis: Time (0 to elapsed minutes)
    // Y-axis: Heart Rate
    // Line chart: simple time-series
    // Insight card: warm-up speed, stability, drift
}
```

**Data from RunSession**:
- `heartRateData` — the array of HR values
- `elapsedTimeMs` — total duration
- `heartRate` — average for baseline

---

#### **Graph 2: HR Over Distance**
```kotlin
@Composable
fun HeartRateOverDistanceChart(
    run: RunSession,
    modifier: Modifier = Modifier
) {
    // X-axis: Distance (0 to totalDistance)
    // Y-axis: Heart Rate
    // Line chart: HR by km
    // Insight card: segment analysis, spikes
}
```

**Data from RunSession**:
- `heartRateData` + segment by distance
- `totalDistance`
- Elevation data for spike context

---

#### **Graph 3: HR Zone Distribution (%)**
```kotlin
@Composable
fun HeartRateZoneDistributionChart(
    run: RunSession,
    modifier: Modifier = Modifier
) {
    // Bar chart: Z1-Z5 percentages
    // Stacked horizontal bar showing % time
    // Insight card: zone breakdown, discipline
}
```

**Data from RunSession**:
- `heartRateData` with zone calculations
- Zone thresholds (from user profile)
- Time duration in each

---

#### **Graph 4: HR vs Elevation (Scatter)**
```kotlin
@Composable
fun HeartRateVsElevationChart(
    run: RunSession,
    modifier: Modifier = Modifier
) {
    // Scatter plot: Elevation (X) vs HR (Y)
    // Point size: by training effect
    // Point color: by grade (green=flat, orange=climb)
    // Insight card: elevation sensitivity
}
```

**Data from RunSession**:
- `heartRateData`
- `altitudeData`
- Computed grades at each point

---

### Task 3: Data Extraction Helpers

Create extension functions to extract data series from RunSession:

```kotlin
// In RunSummaryViewModel.kt or new AnalysisExtensions.kt

fun RunSession.getHeartRateOverTime(): List<Pair<Int, Int>> {
    // Returns pairs of (timeSeconds, heartRate)
    // Handles null heartRateData gracefully
}

fun RunSession.getHeartRateOverDistance(): List<Pair<Double, Int>> {
    // Returns pairs of (distanceKm, heartRate)
    // Requires GPS data to compute distance at each HR point
}

fun RunSession.getHeartRateZoneDistribution(): Map<String, Float> {
    // Returns Z1-Z5 percentages
    // Uses zone thresholds from user profile
}

fun RunSession.getHeartRateVsElevation(): List<Triple<Double, Int, Double>> {
    // Returns triples of (elevationM, heartRate, grade%)
    // Grade computed from elevation at each point
}
```

---

### Task 4: Add Insight Card Templates

For each graph, create corresponding insight composable:

```kotlin
@Composable
private fun HeartRateOverTimeInsight(run: RunSession) {
    // Shows:
    // - Warm-up time to target HR
    // - HR stability (variance)
    // - HR drift over time
    // - Recommendation based on pattern
}

@Composable
private fun HeartRateOverDistanceInsight(run: RunSession) {
    // Shows:
    // - Segment analysis (first 2km, middle, final km)
    // - Where HR spikes occurred
    // - Pacing consistency by distance
    // - Correlation with terrain
}

@Composable
private fun HeartRateZoneInsight(run: RunSession) {
    // Shows:
    // - Zone percentages
    // - Total time in each zone
    // - Primary training zone
    // - Zone discipline score
}

@Composable
private fun HeartRateVsElevationInsight(run: RunSession) {
    // Shows:
    // - HR sensitivity to elevation
    // - Climb efficiency
    // - Recovery on descents
    // - Elevation tolerance assessment
}
```

---

### Task 5: Organize in Graphs Tab

Structure the RunSummaryScreen Graphs tab with collapsible sections:

```kotlin
// In RunSummaryScreen.kt

LazyColumn {
    // ═══ Heart Rate Analysis ═══
    stickyHeader {
        SectionHeader("Heart Rate Analysis", expanded = hrExpanded)
    }
    
    if (hrExpanded) {
        item { HeartRateOverTimeChart(run) }
        item { HeartRateOverDistanceChart(run) }
        item { HeartRateVsElevationChart(run) }
        item { HeartRateZoneDistributionChart(run) }
    }
    
    // ═══ Running Dynamics ═══
    stickyHeader {
        SectionHeader("Running Dynamics", expanded = dynamicsExpanded)
    }
    
    if (dynamicsExpanded) {
        // ⏳ Phase 2: Add 4 running dynamics graphs
    }
    
    // ═══ Multi-Metric Analysis ═══
    stickyHeader {
        SectionHeader("Multi-Metric Analysis", expanded = multiExpanded)
    }
    
    if (multiExpanded) {
        // ⏳ Phase 3: Add 4 correlation graphs
    }
}
```

---

## Implementation Details by Task

### Priority Order
1. **HR Over Time** (simplest, most informative)
2. **HR Over Distance** (shows segment patterns)
3. **HR Zone %** (bar chart, shows discipline)
4. **HR vs Elevation** (scatter, shows efficiency)

---

## Data Flow

```
RunSession (from backend)
    ├─ heartRateData: Int[] (one value per 2 seconds)
    ├─ elapsedTimeMs: Long
    ├─ totalDistance: Double
    ├─ altitudeData: Double[]
    ├─ pace: Double
    └─ heartRate: Int

    ↓ (extract via helpers)

Graph Data Series
    ├─ Pairs<Time, HR>
    ├─ Pairs<Distance, HR>
    ├─ Pairs<Elevation, HR>
    └─ Zone percentages

    ↓ (render via Canvas/Chart)

Visualizations
    ├─ Line charts (HR over time/distance)
    ├─ Scatter plot (HR vs elevation)
    └─ Bar chart (zone distribution)

    ↓ (compute via analytics)

Insight Cards
    ├─ Key metrics
    ├─ Baseline comparisons
    ├─ Alerts/improvements
    └─ Recommendations
```

---

## Testing Strategy

### Unit Tests
- Extract helper functions
- Test data series generation
- Test insight computations

### Visual Tests
```kotlin
@Preview
@Composable
fun HeartRateOverTimeChartPreview() {
    val mockRun = RunSession(
        heartRateData = intArrayOf(130, 140, 145, 150, ...).toList(),
        elapsedTimeMs = 2400000, // 40 minutes
        heartRate = 145
    )
    
    HeartRateOverTimeChart(run = mockRun)
}
```

### Live Tests
1. Run app on device
2. Complete a real run with watch
3. Verify graphs display correctly
4. Check axis margins (should look honest)
5. Verify insight cards are accurate

---

## Edge Cases to Handle

### Graph Rendering
- [ ] No heart rate data (non-Garmin run)
- [ ] Very inconsistent HR (high variance)
- [ ] Very consistent HR (low variance)
- [ ] Short runs (<5 minutes)
- [ ] Very long runs (>120 minutes)
- [ ] Extreme HR values (very high/low)

### Data Series
- [ ] Null values in data arrays
- [ ] Mismatched array lengths
- [ ] Missing elevation data
- [ ] GPS dropouts causing distance gaps

### Axis Scaling
- [ ] Single data point
- [ ] All points identical
- [ ] Outliers that distort scale
- [ ] Negative values (shouldn't happen but handle gracefully)

---

## Code Organization

```
app/src/main/java/live/airuncoach/airuncoach/ui/
├── components/
│   ├── GraphAxisUtils.kt ✅ (already created)
│   ├── GarminGraphs.kt ✅ (partial - has HR Zone vs Pace)
│   ├── HeartRateGraphs.kt (new - 4 HR graphs)
│   ├── DynamicsGraphs.kt (phase 2)
│   └── CorrelationGraphs.kt (phase 3)
│
├── screens/
│   └── RunSummaryScreen.kt (integrate graphs)
│
└── extensions/
    └── RunSessionGraphHelpers.kt (new - data extraction)
```

---

## Time Estimates

| Task | Time | Notes |
|------|------|-------|
| HR Over Time | 1-2h | Simple line chart |
| HR Over Distance | 1-2h | Similar to above |
| HR Zone % | 1-2h | Bar chart logic |
| HR vs Elevation | 2-3h | Scatter plot, color coding |
| Data extraction helpers | 1-2h | Reusable functions |
| Insight cards (all 4) | 2-3h | Logic + UI |
| Integration in RunSummaryScreen | 1-2h | Tab organization |
| Testing & polish | 2-3h | Edge cases, previews |

**Total Phase 1b: ~11-17 hours** (1.5-2 days of focused work)

---

## Success Criteria

- ✅ All 4 graphs render correctly with real data
- ✅ Smart axis margins prevent visual distortion
- ✅ Insight cards show accurate analytics
- ✅ No crashes with edge case data
- ✅ Works on phone (375dp) and tablet (900dp)
- ✅ Graphs are responsive (smooth, not laggy)
- ✅ All baseline comparisons are accurate
- ✅ Color coding is consistent
- ✅ Tests cover edge cases
- ✅ Code is well-documented

---

## Next Sprint (Phase 2)

When Phase 1 is complete:
- Build 4 Running Dynamics graphs
- Add elevation context overlays
- Implement area charts for zone distribution
- Add interactive filtering (by zone, by pace)

---

## Questions to Answer During Implementation

1. **Data Availability**: Are all required fields populated in RunSession?
2. **Null Handling**: What happens if heartRateData is null/empty?
3. **Granularity**: Is HR data at 2-second intervals or variable?
4. **Zone Thresholds**: Where are user's zone thresholds stored/calculated?
5. **Performance**: Will large data arrays (120+ points) render smoothly?
6. **Accessibility**: Do color-blind users see all distinctions?

---

## Ready to Build! 🚀

Everything is planned. Time to build these elite graphs.

Start with **HeartRateOverTimeChart** — it's the simplest and most informative.

