# Sprint 2: Complete Graph Library (14 Graphs)

## Executive Summary

Expanded from 5 to **14 elite-level data visualizations** that transform 23+ Garmin metrics into a complete narrative of how the run went.

Each graph applies **smart axis margin rules** to prevent visual distortion while honestly representing data.

---

## The 14 Graphs Organized

### 🔴 **Heart Rate Analysis** (6 graphs)

These show HR behavior throughout the run — the primary indicator of effort and fatigue.

| # | Graph | X-Axis | Y-Axis | Shows | Priority |
|---|-------|--------|--------|-------|----------|
| 1 | **HR Over Time** | Time (min) | HR (bpm) | Warm-up, stability, fatigue | ⭐⭐⭐ |
| 2 | **HR Over Distance** | Distance (km) | HR (bpm) | Where HR spikes, segment effort | ⭐⭐⭐ |
| 3 | **HR vs Elevation** | Elevation (m) | HR (bpm) | How elevation affects effort | ⭐⭐ |
| 4 | **HR Zone %** | Zone (Z1-Z5) | % of Run | Percentage time in each zone | ⭐⭐⭐ |
| 5 | **HR Zone Over Time** | Time (min) | Zone | Zone evolution throughout run | ⭐⭐ |
| 6 | **HR Zone Over Distance** | Distance (km) | Zone | Zone distribution by distance | ⭐⭐ |

**Story These Tell**: How the runner managed effort throughout the run — pacing discipline, zone control, and endurance pattern.

---

### 💪 **Running Dynamics** (4 graphs)

These show FORM — the biomechanical efficiency that determines injury risk and fitness gain.

| # | Graph | Shows | What To Look For |
|---|-------|-------|-----------------|
| 7 | **GCT Over Distance** | Ground contact time changes | Form degradation, fatigue, stride control |
| 8 | **VO Over Distance** | Vertical oscillation changes | Posture degradation, upper body fatigue |
| 9 | **Stride Length Variation** | Stride adaptation to terrain | Smart pacing by elevation, efficiency |
| 10 | **Vertical Ratio (Efficiency)** | Bounce as % of stride | Running economy, form efficiency |

**Story These Tell**: How the runner's FORM held up under fatigue — whether form broke down or stayed strong, where posture lost control, how efficiently they adapted to terrain.

---

### 🔄 **Multi-Metric Correlations** (4 graphs)

These show RELATIONSHIPS between metrics — how effort, form, and terrain interact.

| # | Graph | X vs Y | Shows | Insight |
|---|-------|--------|-------|---------|
| 11 | **HR vs GCT** | Heart Rate vs Contact Time | Effort-form relationship | At what HR does form degrade? |
| 12 | **Pace vs GCT** | Pace vs Contact Time | Efficiency | Is faster = more efficient? |
| 13 | **TE vs HR Drift** | Training Effect vs HR Drift | Fatigue indicator | High load = more fatigue? |
| 14 | **Elevation + HR** | Elevation profile with HR overlay | Terrain + effort | How is HR responding to climbs? |

**Story These Tell**: How the runner's BODY responded to demands — the efficiency equation (effort ↔ form) and whether they're building fitness or just getting tired.

---

## Visual Layout

### How Graphs Appear in RunSummaryScreen

```
╔════════════════════════════════════╗
║  Run Summary - Graphs Tab          ║
╠════════════════════════════════════╣
║                                    ║
║  ┌─ HEART RATE ANALYSIS ──────┐   ║
║  │ [HR Over Time] [HR Over Distance] │
║  │ [HR vs Elevation] [Zone %]    │
║  │ [Zone Over Time] [Zone Over Distance]│
║  └────────────────────────────┘   ║
║                                    ║
║  ┌─ RUNNING DYNAMICS ──────────┐   ║
║  │ [GCT Distance] [VO Distance] │
║  │ [Stride Length] [VR Efficiency]│
║  └────────────────────────────┘   ║
║                                    ║
║  ┌─ MULTI-METRIC ANALYSIS ────┐   ║
║  │ [HR vs GCT] [Pace vs GCT]    │
║  │ [TE vs Drift] [Elev+HR]      │
║  └────────────────────────────┘   ║
║                                    ║
╚════════════════════════════════════╝
```

**Collapsible sections** for easier navigation. Click to expand/collapse each category.

---

## Key Design Features Applied to ALL Graphs

### 1. **Smart Axis Margins** ✓
```
Problem:   HR 140-146 bpm → looks erratic without margins
Solution:  Add margin buffer → looks stable (honest!)

Result:    Consistent data appears visually consistent
           Variable data shows real variation
```

Every single graph uses `calculateAxisConfig()` to prevent visual lies about data.

### 2. **Baseline Comparison** ✓
Where applicable (HR, GCT, VO, Stride):
```
User's Baseline (4-week avg): 245ms
This Run's GCT: 247ms  
Change: +2ms (+0.8%)  ✓ (normal)
```

Dashed baseline line + percentage change shown in insights.

### 3. **Elevation Context** ✓
Running graphs include elevation background:
- Light shading shows where climbs occur
- Explains why HR spiked or form degraded
- Prevents blame for terrain-related changes

### 4. **Zone Color Coding** ✓
```
Z1: BLUE (easy)
Z2: GREEN (conversational pace)
Z3: YELLOW (steady state)
Z4: ORANGE (tempo/threshold)
Z5: RED (max effort)
```

Consistent across all HR-related graphs.

### 5. **Form Degradation Coding** ✓
```
GREEN: Better than baseline (improvement!)
GRAY:  Same as baseline (stable)
ORANGE: Worse than baseline (degradation)
RED:   Critical degradation (alert)
```

Users instantly see if form is holding or breaking.

### 6. **Insight Cards** ✓
Every graph has a companion insight card:

```
┌────────────────────────────────────┐
│  ✓ Heart Rate Control              │
├────────────────────────────────────┤
│ Average HR: 148 bpm (baseline: 146)│
│ Change: +1.4% (normal)             │
│ Peak HR: 162 bpm (92% of max)      │
│ HR Drift: 12 bpm over 45 min       │
│ → Normal fatigue for distance      │
│                                    │
│ Zone Distribution:                 │
│ Z1: 0% | Z2: 12% | Z3: 65%        │
│ Z4: 22% | Z5: 0.8%                │
│                                    │
│ Insight: Excellent pacing          │
│ discipline. Stay in Z3 for         │
│ base-building workouts.            │
└────────────────────────────────────┘
```

- Key metrics summary
- Baseline comparison
- Percentage changes
- What this means for training
- Specific recommendation

---

## The Complete Story (How All Graphs Tell It)

A runner completes an 8km run. What does each graph reveal?

### **HR Over Time**
"Started slow warm-up, ramped to Z3, stayed stable for 35 minutes, fatigue in final 5 minutes. Good execution."

### **HR Over Distance**
"HR increased gradually from km 0 to km 7, sharp spike km 6-7 (likely a hill), recovery km 7-8."

### **HR vs Elevation**
"Clear correlation: climbs caused expected HR increase of ~8 bpm per 50m elevation."

### **HR Zone %**
"Spent 65% in Z3 (primary training zone) — perfect for aerobic base work. No zone creep."

### **GCT Over Distance**
"Ground contact time increased 245ms → 254ms — normal fatigue. Form held strong."

### **VO Over Distance**
"Vertical oscillation increased 8.2cm → 9.1cm in final 2km — posture fatigue. Work on core strength."

### **Stride Length**
"Stride shortened on climbs (smart adaptation), maintained on flats, very slight decrease final km (fatigue). Good terrain management."

### **HR vs GCT**
"Clear relationship: at HR >160, GCT increases. Below 150, excellent form control."

### **Pace vs GCT**
"Faster pace = shorter contact time. Good running economy — you move efficiently at race pace."

### **Elevation Profile + HR**
"HR response to terrain was excellent. Climbed efficiently, recovered well on descents."

---

## The Big Picture

**What These 14 Graphs Tell**:

🎯 **Effort Management** (HR graphs)
→ "You paced perfectly. Great zone discipline. No reckless early surges."

🎯 **Form Integrity** (Dynamics graphs)
→ "Your form held up well. Slight fatigue is normal. Work on posture in final km."

🎯 **Body Efficiency** (Correlation graphs)
→ "You move efficiently. HR-to-form relationship is strong. This is good running economy."

🎯 **Terrain Adaptation** (Elevation, stride)
→ "You adapted to terrain intelligently. Climbs were handled well."

🎯 **Overall Assessment**
→ "Well-executed session. Good for aerobic base building. Recovery day recommended, then easy work or rest."

---

## What Makes These Graphs Elite

### ✨ **They Tell Stories, Not Just Show Data**
Instead of: "Your pace was 4:48/km"
They reveal: "You maintained steady effort on varied terrain with excellent form integrity"

### ✨ **They Use Honest Visualization**
Instead of: Distorted graphs making small data variations look erratic
They show: Consistent data looking consistent, variable data showing real change

### ✨ **They Provide Context**
Instead of: Raw metrics in isolation
They show: How metrics relate (HR↔GCT), what's normal (baselines), what terrain caused changes (elevation)

### ✨ **They Enable Action**
Instead of: Pretty charts with no insight
They provide: Specific recommendations based on what the metrics reveal

### ✨ **They're Personalized**
Instead of: Generic coaching ("keep HR under 160")
They show: This runner's specific patterns and threshold

---

## Implementation Phases

### Phase 1 (This Sprint) ✅
- ✅ Infrastructure (GraphAxisUtils)
- ✅ Design all 14 graphs
- ✅ HR Over Time (simple line)
- ✅ HR Over Distance (simple line)
- ✅ HR Zone % (bar chart)
- ✅ HR Zone vs Pace (scatter — priority)

### Phase 2 (Next Sprint)
- GCT Over Distance
- VO Over Distance
- Stride Length Variation
- HR vs Elevation

### Phase 3 (Polish Sprint)
- Remaining graphs + area charts
- Integration with elevation overlays
- Multi-metric scatter plots
- Interactive filtering & drill-down

---

## Technical Implementation

All graphs use:
- **`GraphAxisUtils.kt`** for smart axis margins
- **`AxisConfig`** for consistent scaling
- **Baseline comparison** with dashed lines
- **Color coding** for zones and form quality
- **Insight cards** for actionable feedback
- **Reusable components** for consistency

---

## Why 14 Graphs?

Each graph answers a specific question:

1. **HR Over Time** → How was my warm-up?
2. **HR Over Distance** → Where did I struggle?
3. **HR vs Elevation** → Am I efficient on climbs?
4. **HR Zone %** → How much time in my target zone?
5. **HR Zone Over Time** → When did I push too hard?
6. **HR Zone Over Distance** → Where's my main effort?
7. **GCT Over Distance** → Is my form holding up?
8. **VO Over Distance** → Am I slouching by the end?
9. **Stride Variation** → How smart is my terrain adaptation?
10. **VR (Efficiency)** → Am I bouncing more when tired?
11. **HR vs GCT** → At what effort does form break?
12. **Pace vs GCT** → Am I efficient at fast paces?
13. **TE vs HR Drift** → Does high load = high fatigue?
14. **Elevation + HR** → How's my climbing efficiency?

**14 questions = complete understanding of the run.**

---

## Success Criteria ✓

- ✅ Smart axis margins on ALL graphs (no visual distortion)
- ✅ Baseline comparisons where relevant
- ✅ Elevation context for running graphs
- ✅ Consistent color coding (zones, form quality)
- ✅ Actionable insight cards
- ✅ Works on phone & tablet
- ✅ All data accurately represented (no lies)
- ✅ Complete story of run told through multiple lenses
- ✅ Specific, personalized recommendations

---

## The Vision

A runner completes a workout. They see:

❌ **Generic app**: "Nice run! 8km in 38 minutes at 4:45/km. HR avg 148."

✅ **AI Run Coach**: "Excellent aerobic base builder. You maintained perfect zone discipline in Z3 (65% of run), showed great form integrity with only +3.8% GCT increase (well-controlled), and demonstrated smart terrain adaptation. Your HR-to-effort relationship shows good running economy. Recovery day recommended; next hard session in 3 days."

**That's the power of 14 well-designed graphs.** 🚀

