# Post-Run Analysis Roadmap — From Data to Insights

## Executive Summary

You've built an incredible **data capture system** (23+ metrics from Garmin watch). Now we're building the **insights & visualization layer** that turns raw numbers into **elite coaching**.

**Key Principle**: Data without context is noise. Context without visualization is hard to understand.

---

## The Full Flow

```
DURING RUN:
Watch captures 23+ metrics every 2 seconds
  ↓
Phone receives real-time stream
  ↓
Backend stores in watch_biometric_samples (time-series)
  ↓

RUN ENDS:
Backend computes aggregates (averages, min/max)
  ↓
Stores in runs table (summary)
  ↓
Upload complete with all data
  ↓

ANALYSIS PHASE (NEW):
Backend queries all metrics + time-series
  ↓
Claude AI receives comprehensive prompt with:
  • All biomechanical metrics
  • User's 4-week baseline
  • Terrain context (computed from altitude deltas)
  • Heart rate zone distribution
  ↓
Claude generates 4+ detailed analyses:
  • Form & Efficiency (GCT, VO, stride, balance)
  • Training Load (TE, recovery, VO2 trends)
  • Pace vs Effort (HR zones, speed matching)
  • Elevation Response (climbing/descent handling)
  ↓
Structured response parsed into RunAnalysis object
  ↓

GRAPH GENERATION (NEW):
Time-series data processed into visual formats:
  • HR over distance (line chart with zone colors)
  • Pace vs HR zone (distribution pie + metrics)
  • HR vs elevation (scatter plot with terrain overlay)
  ↓

UI RENDERING (NEW):
RunSummaryScreen displays:
  • AI Insights tab: 4 detailed analyses
  • Graphs tab: 3 professional visualizations
  • Data tab: Biomechanical metrics with assessment
  • All with Garmin attribution
  ↓
User understands: Not just WHAT they did, but HOW WELL and WHY
```

---

## Three Components to Build

### A. Enhanced AI Analysis

**What It Is**: Claude AI analyzing all 23+ metrics through the lens of biomechanical coaching

**Current State**: 
- Basic analysis (distance, time, pace, avg HR)
- Missing: running dynamics, training load, efficiency

**New State**:
- Form assessment (GCT, VO, stride balance)
- Training load interpretation (TE 0-5 scale)
- Pace-effort alignment (is HR zone matching pace?)
- Terrain adaptation (climbing/descent efficiency)
- VO2 Max trends (improving or declining?)

**Effort**: 200 lines of code + 500 lines of Claude prompt engineering

**Integration Point**: `RunSummaryViewModel.generateDetailedAnalysis()` (new method)

---

### B. Professional Graphs

**What It Is**: Time-series visualizations of key metrics

**New Graphs**:
1. **Heart Rate Over Distance**
   - Line chart of HR across the run
   - Zone coloring (Z1-Z5)
   - Elevation gain markers
   - Max HR point highlighted
   
2. **Pace vs Heart Rate Zone Distribution**
   - % time in each zone (pie or bars)
   - Pace ranges for each zone
   - User's "sweet spot" identified
   - Zone balance insights
   
3. **Heart Rate Response to Terrain**
   - HR vs elevation overlay
   - Climb vs flat vs descent HR averages
   - Efficiency assessment
   - Terrain sensitivity (how reactive user is)

**Effort**: 400 lines of Compose UI + Vico charting library integration

**Integration Point**: `RunSummaryScreen.kt` → Graphs tab

---

### C. Biomechanical Data Presentation

**What It Is**: Clear display of running dynamics with benchmarks

**New Section in Data Tab**:
- Ground Contact Time (benchmark: 200-300ms, user's avg with assessment)
- Ground Contact Balance (benchmark: 50%, user's with asymmetry check)
- Vertical Oscillation (benchmark: 6-8cm efficient, user's with detail)
- Vertical Ratio (benchmark: 8-10%, user's for efficiency)
- Stride Length (min/max/avg, no universal benchmark)

**Each metric includes**:
- Current value
- Benchmark
- Assessment (excellent/good/caution)
- Brief explanation

**Effort**: 150 lines of Compose UI

**Integration Point**: `RunSummaryScreen.kt` → Data tab → New section

---

## Implementation Timeline

### Sprint 1: AI Analysis (1-2 weeks)
**Goal**: Turn raw metrics into intelligent insights

1. **Update Claude Prompt System** (2-3 hours)
   - Create comprehensive prompt template with all 23+ metrics
   - Define 4 analysis types (form, training, pace, elevation)
   - Include runner baseline and terrain context
   - Specify response format

2. **Implement Analysis Parsing** (3-4 hours)
   - Create `RunAnalysis` data model
   - Parse Claude response into structured objects
   - Handle Garmin vs non-Garmin runs

3. **Integrate into ViewModel** (2-3 hours)
   - Add `generateDetailedAnalysis()` to `RunSummaryViewModel`
   - Query database for metrics + time-series
   - Compute baselines and terrain context
   - Cache results

4. **Update AI Insights Tab** (2-3 hours)
   - Display 4 analyses (form, training, pace, elevation)
   - Add Garmin attribution
   - Format for readability

### Sprint 2: Graphs & Visualization (2-3 weeks)
**Goal**: Make metrics visual and understandable

1. **Integrate Vico Charting** (2-3 hours)
   - Add dependency
   - Create custom composables for chart types

2. **Implement HR Over Distance Graph** (4-5 hours)
   - Transform time-series to distance-based data
   - Add zone coloring
   - Add elevation markers
   - Stats display

3. **Implement Zone Distribution Graph** (3-4 hours)
   - Calculate % time in each zone
   - Create zone bars or pie chart
   - Add pace ranges per zone
   - AI insights per zone

4. **Implement HR vs Elevation Graph** (3-4 hours)
   - Compute terrain grades
   - Segment data by terrain type (climb/flat/descent)
   - Create overlay visualization
   - HR sensitivity assessment

5. **Add to Graphs Tab** (2-3 hours)
   - Reorganize Graphs tab layout
   - Add new sections
   - Ensure scrolling works well

### Sprint 3: Data Presentation & Polish (1-2 weeks)
**Goal**: Make biomechanical data accessible

1. **Add Data Tab Section** (3-4 hours)
   - Create metric rows with benchmarks
   - Add assessment colors
   - Detailed explanations

2. **Garmin Attribution** (1 hour)
   - Create reusable `GarminAttribution()` component
   - Add to all Garmin data sections

3. **Performance Optimization** (2-3 hours)
   - Ensure graphs load <500ms
   - Cache computed data
   - Lazy load tabs

4. **Testing & Polish** (3-4 hours)
   - Test with various run types
   - Verify graphs are readable on small screens
   - Check accessibility

---

## Success Criteria

✅ **Data Completeness**
- All 23+ watch metrics used in at least one analysis or graph
- No "unused data" in the database

✅ **AI Quality**
- 4+ distinct analysis types (form, training, pace, elevation)
- Analyses reference specific metrics and baselines
- Recommendations are actionable
- Garmin attribution present on all analyses

✅ **Visualization Quality**
- Graphs are readable on 5-6" phones
- Zone colors match app theme
- Time-series renders smoothly
- Legends and stats clear

✅ **User Understanding**
- Average user can understand what their metrics mean
- Benchmarks provided for context
- Insights explain "why" not just "what"
- Actionable recommendations included

✅ **Brand Consistency**
- Every Garmin data point has attribution
- Consistent styling with existing UI
- Premium feel (not generic)

✅ **Performance**
- Graphs load in <500ms
- No jank when scrolling
- Data computed efficiently

---

## Specific Metrics to Show

### AI Insights (4 analyses)

| Analysis | Input Metrics | Output |
|----------|---------------|--------|
| **Form & Efficiency** | GCT, VO, VR, stride, GCB | Assessment + recommendations |
| **Training Load** | TE (aerobic/anaerobic), recovery, VO2 | Session type + next steps |
| **Pace vs Effort** | Pace, HR zones, cadence, TE | Alignment score + insight |
| **Elevation Response** | Elevation, grade, HR by section, pace split | Climbing/descent assessment |

### Graphs (3 main)

| Graph | X-Axis | Y-Axis | Context |
|-------|--------|--------|---------|
| **HR Over Distance** | Distance (km) | Heart Rate (bpm) | Zone colors, elevation marks |
| **Zone Distribution** | Zones (1-5) | % Time or Minutes | Pace ranges, insights |
| **HR vs Terrain** | Distance (km) | HR + Grade overlay | Terrain-specific HR avg |

### Data Tab Display (5 metrics)

| Metric | Unit | Benchmark | Assessment |
|--------|------|-----------|------------|
| **GCT** | ms | 200-300 | Excellent/Good/Caution |
| **GCB** | % | 50 | Balanced/Slight/Asymmetry |
| **VO** | cm | 6-8 | Efficient/Acceptable/Inefficient |
| **VR** | % | 8-10 | Efficient/Acceptable/Inefficient |
| **Stride** | m | Height-adjusted | Min/Avg/Max |

---

## Sample Output: Complete Run

**User completes 10km run on Garmin watch:**

### AI Insights Tab
```
═══════════════════════════════════════════════════════════════
FORM & EFFICIENCY
Ground contact time of 245ms is solid. Your vertical oscillation
at 8.2cm shows efficient form for a steady run. Ground contact
balance of 51% indicates perfect symmetry — no asymmetry detected.
→ Maintain current form

TRAINING LOAD
Aerobic training effect of 3.2 indicates productive aerobic work.
Minimal anaerobic component (0.4). Recovery time of 38 hours.
→ Great for base-building. Take an easy run next.

PACE vs EFFORT
You ran at 5:30/km pace in Zone 3. Your heart rate stayed
controlled — good aerobic fitness. Cadence of 172 spm was optimal
for your stride.
→ Your Zone 3 "sweet spot" is 5:25-5:35/km

ELEVATION RESPONSE
Handled the 150m elevation well. Climbing pace of 6:30/km was
strong. Descent of 5:10/km was controlled — excellent braking.
→ You're a strong climber. Push harder on hills.

ℹ️ Insights derived in part from Garmin device-sourced data.
═══════════════════════════════════════════════════════════════
```

### Graphs Tab
```
[HR Over Distance chart - line with zone colors]
Avg: 148 bpm | Max: 165 bpm (at 7.2km) | Min: 110 bpm

[Zone Distribution bars]
Z1: 5% | Z2: 18% | Z3: 42% ← Longest | Z4: 32% | Z5: 3%

[HR vs Elevation chart]
Climbs: 158 avg | Flats: 147 avg | Descents: 142 avg

ℹ️ Data from Garmin watch
```

### Data Tab
```
RUNNING DYNAMICS (Garmin Data)

Ground Contact Time: 245 ms ✓ Excellent
Benchmark: 200-300ms | Efficient foot contact

Ground Contact Balance: 51% ✓ Excellent  
Benchmark: 50% | Perfectly balanced L/R

Vertical Oscillation: 8.2 cm ✓ Excellent
Benchmark: 6-8cm | Efficient torso movement

Vertical Ratio: 9.1% ✓ Good
Benchmark: 8-10% | Good running economy

Stride Length: 1.14m (Min: 1.05m, Max: 1.25m)
Range shows adaptation to terrain

ℹ️ Insights derived in part from Garmin device-sourced data.
```

---

## Garmin Attribution Placement

**Every Garmin-sourced insight/graph must include:**

```
ℹ️ "Insights derived in part from Garmin device-sourced data."
```

Or for data:
```
ℹ️ "Data from Garmin watch"
```

**Placement**:
- Insights: Bottom of section, italicized
- Graphs: Bottom corner, small gray text
- Data metrics: Below metrics group, italicized caption
- Never buried or hidden

---

## Next Steps

1. **Start Sprint 1**: Update Claude prompts with all metrics
2. **Build RunAnalysis models**: Data structures for parsed insights
3. **Integrate into ViewModel**: Make analysis available to UI
4. **Display insights**: Update AI Insights tab
5. **Build graphs incrementally**: HR distance → zones → terrain
6. **Add data metrics section**: Running dynamics display
7. **Test with real Garmin runs**: Verify data and insights quality

---

## What This Achieves

✅ **Elite Positioning**: "We analyze 23+ metrics, not 3"
✅ **User Understanding**: Clear insights, not raw numbers
✅ **Actionable Coaching**: "Here's what to do next"
✅ **Visual Appeal**: Professional graphs, premium UI
✅ **Brand Trust**: Transparent Garmin attribution
✅ **Competitive Advantage**: No other running app does this depth

**This transforms your app from "captures watch data" to "understands running biomechanics at an elite level".**

