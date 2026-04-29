# Sprint 2: Expanded Graph Library

## Overview

Building a **comprehensive suite of 12+ elite-level data visualizations** that turn 23+ Garmin metrics into actionable coaching insights.

---

## Graph Categories

### A. HEART RATE GRAPHS (6 graphs)

#### 1. **Heart Rate Over Distance** ⭐
```
┌──────────────────────────────────┐
│   Heart Rate Over Distance       │
├──────────────────────────────────┤
│ HR (bpm)                         │
│ 170│                        ▲    │
│ 160│                  ▲▲▲▲▲▲    │
│ 150│        ▲▲▲▲▲▲▲▲           │
│ 140│    ▲▲▲                      │
│ 130├────────────────────────────│
│    0km   2km   4km   6km   8km  │
│           Distance              │
│                                  │
│ Data: HR on Y-axis, distance on X
│ Shows: HR change across route    │
│ Insights:                        │
│ • HR creep (drift upward)        │
│ • HR spikes at hills             │
│ • HR recovery on flats           │
│ • Pacing consistency by distance │
└──────────────────────────────────┘
```

**What It Shows**:
- HR variation across the run distance
- Where HR spikes occur (hills vs effort)
- HR drift/creep (increasing over time)
- Pace discipline by segment

**Axis Rules**:
- X-axis: Distance (0 to run distance in km)
- Y-axis: HR with smart margins (smart margin if HR very stable)
- Baseline: Dashed line showing baseline HR for runner
- Hill zones: Subtle background shading for elevation changes

**Insight Card**:
- Average HR by distance segment (first 2km, miles 3-5, final km)
- HR drift detection: "HR increased 12 bpm over run (normal fatigue)"
- Spike analysis: "3 HR spikes detected — 2 on climbs, 1 on effort increase"
- Recovery zones: "Heart rate recovered smoothly on flats"

**Implementation Notes**:
- Simple line chart (time-series)
- Easy to spot HR creep trends
- Segment-based breakdown
- Elevation overlay as background

---

#### 2. **Heart Rate Over Time** ⭐
```
┌──────────────────────────────────┐
│      Heart Rate Over Time        │
├──────────────────────────────────┤
│ HR (bpm)                         │
│ 170│                        ▲    │
│ 160│                  ▲▲▲▲▲▲    │
│ 150│        ▲▲▲▲▲▲▲▲           │
│ 140│    ▲▲▲                      │
│ 130├────────────────────────────│
│    00:00  15:00  30:00  45:00  │
│           Time (minutes)         │
│                                  │
│ Data: HR on Y-axis, time on X   │
│ Shows: HR behavior throughout run
│ Insights:                        │
│ • Warm-up pattern                │
│ • Stability in middle            │
│ • End-of-run fatigue             │
│ • HR volatility                  │
└──────────────────────────────────┘
```

**What It Shows**:
- HR pattern from start to finish
- Warm-up efficiency
- HR stability during main effort
- End-of-run fatigue patterns

**Axis Rules**:
- X-axis: Time (0 to elapsed time in minutes)
- Y-axis: HR with smart margins
- Segments: 5-min warm-up markers
- Zones: Background color bands (Z1-Z5)

**Insight Card**:
- Warm-up analysis: "Reached target HR in 4 minutes (efficient)"
- Stability: "HR drift only 8 bpm over 45 minutes (excellent control)"
- Fatigue: "Clear HR increase in final 5 minutes (expected end-of-run)"
- Zone distribution: How long in each zone

---

#### 3. **Heart Rate Over Elevation** ⭐
```
┌──────────────────────────────────┐
│    Heart Rate vs Elevation       │
├──────────────────────────────────┤
│ HR (bpm)                         │
│ 180│                 ●●●●       │ High elevation = high HR
│ 170│            ●●●●●●         │
│ 160│        ●●●●●                │
│ 150│    ●●●●                     │
│ 140│●●●                          │
│ 130├────────────────────────────│
│    100m  150m  200m  250m 300m  │
│           Elevation             │
│                                  │
│ Data: Scatter plot of HR vs elev │
│ Shows: Elevation impact on HR   │
│ Insights:                        │
│ • Expected HR increase on climbs │
│ • HR recovery on descents        │
│ • Elevation tolerance           │
│ • Pacing strategy by grade      │
└──────────────────────────────────┘
```

**What It Shows**:
- How elevation affects heart rate
- Whether HR response is appropriate for grade
- How runner handles climbs vs descents
- Elevation tolerance pattern

**Axis Rules**:
- X-axis: Elevation (min to max in meters)
- Y-axis: HR with smart margins
- Points: Colored by grade (green=flat, orange=climb, red=steep)
- Size: By training effect at that point

**Insight Card**:
- Elevation sensitivity: "HR increases ~8 bpm per 50m elevation (typical)"
- Climb handling: "Strong effort on climbs — HR well-controlled"
- Recovery: "HR recovered 15 bpm on descent (excellent control)"
- Grade impact: "3% grade correlates with +12 bpm (normal effort increase)"

---

#### 4. **Heart Rate Zone Utilization** (Percentage Bar)
```
┌────────────────────────────────────┐
│   Heart Rate Zone Utilization      │
├────────────────────────────────────┤
│                                    │
│  Z1 (<50%)     0.2%    ░           │ 
│  Z2 (50-60%)   12%     ██░░░░░░░░  │
│  Z3 (60-75%)   65%     ███████████ │ 65% of run in Z3
│  Z4 (75-85%)   22%     ████░░░░░░  │ (primary training zone)
│  Z5 (>85%)      0.8%   ░           │
│                                    │
│  Total Time: 48 minutes            │
│  Focus Zone: Z3 (Steady State)     │
│                                    │
│  Analysis:                         │
│  ✓ Excellent zone discipline       │
│  ✓ Minimal zone drift              │
│  ✓ Proper steady-state emphasis    │
│  → Keep this pacing for base work  │
│                                    │
└────────────────────────────────────┘
```

**What It Shows**:
- Percentage of run spent in each zone
- Primary training zone emphasis
- Zone discipline and control
- Pacing strategy effectiveness

**Design**:
- Stacked bar chart (100% = full run)
- Color-coded by zone
- Time duration in each zone
- Percentage labels

**Insight Card**:
- Zone breakdown (Z1-Z5 with percentages and durations)
- Primary zone: "65% in Z3 — perfect for steady-state aerobic work"
- Zone drift: "No zone creep — excellent pacing discipline"
- Intensity assessment: "Moderate intensity session — good for base building"
- Recommendation: "This zone mix is ideal for 2-3 times per week"

---

#### 5. **HR Zone Over Distance**
```
┌──────────────────────────────────┐
│      HR Zone Over Distance       │
├──────────────────────────────────┤
│ Zone  Z5(red)                    │
│       Z4(orange)  ██████          │
│       Z3(yellow) ███████████      │
│       Z2(green) ████████████████  │
│       Z1(blue)                    │
│       ┼────────────────────────────│
│       0km   2km   4km   6km  8km  │
│              Distance             │
│                                  │
│ Shows: Which zones appear where  │
│ Insights:                        │
│ • Z2 warm-up: first 2km         │
│ • Z3 main effort: km 2-7         │
│ • Z4 surge: km 6-7.5             │
│ • Recovery: final km in Z2       │
└──────────────────────────────────┘
```

**What It Shows**:
- Which zones occurred at which distances
- Run structure and pacing pattern
- Effort distribution across route

**Design**:
- Stacked area chart (zones over distance)
- Each zone as a different color band
- Shows structure of the run
- Easy to spot surges and recoveries

**Insight Card**:
- Run structure: "Great structure: warm-up → steady → surge → recovery"
- Zone transitions: "Smooth zone transitions at km 2 and 6"
- Pacing: "Well-executed negative split strategy"

---

#### 6. **HR Zone Over Time**
```
┌──────────────────────────────────┐
│       HR Zone Over Time          │
├──────────────────────────────────┤
│ Zone  Z5(red)                    │
│       Z4(orange)  ██████          │
│       Z3(yellow) ███████████      │
│       Z2(green) ████████████████  │
│       Z1(blue)                    │
│       ┼────────────────────────────│
│       0:00   15:00   30:00   45:00│
│              Time (minutes)       │
│                                  │
│ Shows: Zone evolution over time  │
│ Insights:                        │
│ • Quick warm-up (0-5 min)        │
│ • Sustained Z3 effort (5-40 min) │
│ • Final surge (40-45 min)        │
└──────────────────────────────────┘
```

**Similar to HR Zone Over Distance but with time axis instead of distance.**

---

### B. RUNNING DYNAMICS GRAPHS (4 graphs)

#### 7. **Ground Contact Time Over Distance**
```
┌──────────────────────────────────┐
│   Ground Contact Time Distance   │
├──────────────────────────────────┤
│ GCT (ms)                         │
│ 260│                     ▲▲▲▲    │ Increasing GCT
│ 250│            ▲▲▲▲▲▲▲▲        │ = Fatigue
│ 245│      ▲▲▲▲▲            baseline
│ 240│  ▲▲▲                        │
│ 235├────────────────────────────│
│    0km   2km   4km   6km   8km  │
│           Distance              │
│                                  │
│ Shows: Form degradation pattern  │
│ Insights:                        │
│ • GCT baseline: 245ms            │
│ • Final km GCT: 254ms (+3.7%)    │
│ • Form held well (fatigue norm)  │
└──────────────────────────────────┘
```

**What It Shows**:
- How ground contact time changes with distance
- Form degradation due to fatigue
- If form breaks down or holds strong

**Axis Rules**:
- X-axis: Distance
- Y-axis: GCT with smart margins (usually very consistent)
- Baseline: Dashed line showing user's baseline GCT
- Fatigue zone: Light shading in final km

**Insight Card**:
- GCT trend: "Increased from 245ms to 254ms (+3.7%) — normal fatigue"
- Degradation: "Form breakdown within expected range for 8km run"
- Consistency: "Excellent — stayed within ±5ms of baseline"
- Recommendation: "This consistency shows good running economy"

---

#### 8. **Vertical Oscillation Over Distance**
```
┌──────────────────────────────────┐
│ Vertical Oscillation Distance    │
├──────────────────────────────────┤
│ VO (cm)                          │
│ 9.5│                     ▲▲▲    │ Form breaking
│ 9.0│            ▲▲▲▲▲▲▲▲        │ down (bouncing more)
│ 8.5│      ▲▲▲▲▲                  │
│ 8.0│  ▲▲▲        (baseline)      │
│ 7.5├────────────────────────────│
│    0km   2km   4km   6km   8km  │
│           Distance              │
│                                  │
│ Shows: Posture degradation       │
│ Insights:                        │
│ • VO baseline: 8.2cm             │
│ • Final km VO: 9.1cm (+11%)      │
│ • Posture slump in final 2km     │
└──────────────────────────────────┘
```

**What It Shows**:
- How posture (bounce) changes with distance
- Upper body fatigue and slouching
- Form efficiency degradation

**Axis Rules**:
- X-axis: Distance
- Y-axis: VO with smart margins (usually 0.5-1cm variation)
- Baseline: Dashed line
- Alert zones: If >1cm increase from baseline

**Insight Card**:
- VO increase: "+11% bounce in final 2km (posture fatigue)"
- Form quality: "Focus on posture in final km — shoulders dropping"
- Solution: "Practice core strength — better posture control will reduce VO"

---

#### 9. **Stride Length Variation**
```
┌──────────────────────────────────┐
│    Stride Length Over Distance   │
├──────────────────────────────────┤
│ Stride (m)                       │
│ 1.48│    ▲       ▲       ▲ ▲▲   │ Longer on flats
│ 1.45│  ▲   ▲   ▲   ▲   ▲   baseline
│ 1.42│▲   ▲   ▲   ▲   ▲ ▲       │
│ 1.40├────────────────────────────│
│ 1.35│ (Hills)  (Flat)   (Hills) │
│    0km   2km   4km   6km   8km  │
│           Distance              │
│                                  │
│ Shows: Stride adaptation to terrain
│ Insights:                        │
│ • Longer stride on flat sections │
│ • Shorter stride on hills (smart)│
│ • Good terrain adaptation        │
└──────────────────────────────────┘
```

**What It Shows**:
- How stride adapts to terrain
- Smart pacing by elevation
- Efficiency of terrain adaptation

**Design**:
- Line chart with elevation background
- Shows stride matching terrain

---

#### 10. **Vertical Ratio (Efficiency) Over Distance**
```
Shows oscillation as percentage of stride.
VR = (Vertical Oscillation / Stride Length) × 100

Lower VR = better efficiency
VR increasing = form breaking down
```

---

### C. MULTI-METRIC GRAPHS (4 graphs)

#### 11. **Pace vs Ground Contact Time** (Scatter)
Already designed (see original graph 5).

---

#### 12. **Heart Rate vs Ground Contact Time**
```
┌──────────────────────────────────┐
│    HR vs Ground Contact Time     │
├──────────────────────────────────┤
│ GCT (ms)                         │
│ 270│                    ●●●●    │ High effort
│ 260│               ●●●●●●      │ = higher HR
│ 250│          ●●●●●●           │ = higher GCT
│ 240│      ●●●●                  │
│ 230├────────────────────────────│
│    130  140  150  160  170  180 │
│           Heart Rate (bpm)      │
│                                  │
│ Shows: Effort vs form           │
│ Insights:                        │
│ • Clear correlation: HR↑→GCT↑    │
│ • At high HR: form degrades      │
│ • Fatigue starts at HR ~160      │
└──────────────────────────────────┘
```

**What It Shows**:
- Relationship between effort and form
- At what HR effort starts affecting form
- Form stability at high intensities

**Design**:
- Scatter plot: HR on X, GCT on Y
- Size: By elevation grade
- Color: By time in run (blue early, red late)
- Trend line: Shows correlation

**Insight Card**:
- Correlation: "Strong positive correlation — form degrades with effort"
- Threshold: "Form starts degrading at HR >160 bpm"
- Efficiency: "Below 150 bpm: excellent form control"
- Recommendation: "Keep tempo efforts below 160 bpm for form integrity"

---

#### 13. **Training Effect vs Heart Rate Drift**
```
Shows relationship between training load
and HR drift (how much HR increased over run).

High TE + high HR drift = fatigue
High TE + low HR drift = efficiency
```

---

#### 14. **Elevation Profile with Heart Rate Overlay**
```
┌──────────────────────────────────┐
│   Elevation & HR Over Distance   │
├──────────────────────────────────┤
│ Elev(m)  HR(bpm)                │
│ 300m┐     180│                   │
│     │  ▲▲▲  │      ▲▲▲▲▲▲        │
│ 250m│▲     │        ▲▲▲         │
│     │      │    ▲▲▲              │
│ 200m└──────┴────────────────────│
│    0km   2km   4km   6km   8km  │
│           Distance              │
│                                  │
│ Gray area = Elevation profile    │
│ Red line = Heart Rate            │
│                                  │
│ Shows: HR response to elevation  │
│ Insights:                        │
│ • HR spikes align with climbs    │
│ • HR recovery on descents        │
│ • Efficient climbing              │
└──────────────────────────────────┘
```

**What It Shows**:
- How terrain affects effort
- HR management on elevation
- Recovery between climbs

---

## Graph Organization by Tab

### **Graphs Tab** (in RunSummaryScreen)

**Organize into logical sections**:

```
Heart Rate Analysis (6 graphs)
├─ Heart Rate Over Time
├─ Heart Rate Over Distance  
├─ Heart Rate Over Elevation
├─ HR Zone Utilization (%)
├─ HR Zone Over Time
└─ HR Zone Over Distance

Running Dynamics (4 graphs)
├─ Ground Contact Time Over Distance
├─ Vertical Oscillation Over Distance
├─ Stride Length Variation
└─ Vertical Ratio (Efficiency)

Multi-Metric Analysis (4 graphs)
├─ Heart Rate vs Ground Contact Time
├─ Pace vs Ground Contact Time
├─ Training Effect vs HR Drift
└─ Elevation Profile with HR Overlay
```

**Total: 14 graphs** showing complete run story from 23+ metrics.

---

## Design Principles Applied to ALL Graphs

### 1. **Smart Axis Margins**
Every graph uses `calculateAxisConfig()` to prevent distortion:
- Consistent data looks consistent
- Variable data shows real variation
- Standard 5-10% margins applied

### 2. **Baseline Comparison**
Where applicable (HR, GCT, VO, stride):
- Dashed baseline line from user's 4-week average
- Percentage change shown
- Color coding: Green (improvement), Red (degradation)

### 3. **Elevation Context**
Running graphs include elevation background:
- Light shading for climbs
- Shows why HR spiked or form degraded
- Provides terrain context

### 4. **Consistent Color Coding**
```
HR Zones:
  Z1: BLUE, Z2: GREEN, Z3: YELLOW, Z4: ORANGE, Z5: RED

Form Quality:
  Better/Improving: GREEN
  Stable: GRAY  
  Degrading: ORANGE
  Alert: RED
```

### 5. **Actionable Insight Cards**
Every graph has companion insight card:
- Key metrics summary
- Baseline comparison
- Alert if needed
- Specific recommendation
- What this means for training

---

## Implementation Priority

### Phase 1 (Current Sprint) ✅
- ✅ Heart Rate Over Time (simple line)
- ✅ Heart Rate Over Distance (simple line)
- ✅ HR Zone Utilization (bar chart)
- ✅ Heart Rate Zone vs Pace (scatter — priority)

### Phase 2 (Next Sprint)
- Ground Contact Time Over Distance
- Vertical Oscillation Over Distance
- Stride Length Variation
- Heart Rate Over Elevation

### Phase 3 (Polish Sprint)
- HR Zone Over Distance (area chart)
- HR Zone Over Time (area chart)
- Multi-metric scatter plots
- Elevation profile with HR overlay

---

## Success Criteria

✅ All 14 graphs use smart axis margins
✅ No artificial visual distortion
✅ Consistent data looks consistent
✅ Variable data shows real variation
✅ Baseline comparisons present
✅ Elevation context where relevant
✅ Color coding is consistent
✅ Insight cards are actionable
✅ Graphs work on phone & tablet
✅ All data accurately represented

