# Aerobic Decoupling — Visual Examples & Diagrams

## 1. Card Rendering Example

### Screen Layout

```
┌────────────────────────────────────────────────────┐
│                  RUN SUMMARY SCREEN                │
│                   GRAPHS TAB                       │
├────────────────────────────────────────────────────┤
│                                                    │
│  ▐▌▌▌  HR Zone (140/185 bpm)  75%  [ Zone 3 ]    │
│  ▐▌▌▌  Consistency  (88%)           [ Solid ]    │
│  ▐▌▌▌  Effort Score  (62%)          [ Moderate]  │
│                                                    │
├────────────────────────────────────────────────────┤
│                  FATIGUE ANALYSIS                  │
│  ████ ████ █ ░░ ░░░ ░░░  ░░░ ░��░░ ░░░░ █████    │
│  Km 1                                      Km 12   │
│                                                    │
│  Mid Avg: 4:45/km  │  Decay: +5.3%  │  Last: 5:01│
│                    [Moderate Fatigue]             │
├────────────────────────────────────────────────────┤
│           🔬  AEROBIC DECOUPLING                  │
│              Heart rate vs pace drift analysis    │
│                                                    │
│  HR Drift   │  Pace Drift  │  Decoupling         │
│   +4.2%     │    +2.1%     │    +6.3%            │
│                                                    │
│        ┌─────────────────┐                        │
│        │    MODERATE     │                        │
│        └─────────────────┘                        │
│                                                    │
│  "Some HR-pace decoupling detected. More          │
│   aerobic base work (easy runs) would help."      │
│                                                    │
├────────────────────────────────────────────────────┤
│           RUNNING ECONOMY (Pace vs HR)             │
│  [Chart showing relationship between pace & HR]  │
└────────────────────────────────────────────────────┘
```

---

## 2. Color Coding by Threshold

### Visual Spectrum

```
Decoupling Score     Color              Status          Emoji
─────────────────────────────────────────────────────────────
0.0 – 3.0%          🟢 Bright Green    EXCELLENT        ⭐⭐⭐
3.0 – 5.0%          🟢 Light Green     GOOD             ⭐⭐
5.0 – 8.0%          🟡 Yellow          MODERATE         ⭐
8.0 – 12.0%         🟠 Orange          HIGH             ⚠️
12.0%+              🔴 Red             CRITICAL         ❌
```

### Card Example: Each Rating

#### ✅ Excellent (< 3%)

```
┌─────────────────────────────────────────┐
│ 🔬  Aerobic Decoupling                  │
│     Heart rate vs pace drift analysis   │
├─────────────────────────────────────────┤
│  HR Drift  │  Pace Drift  │ Decoupling  │
│  +1.8%     │    +0.9%     │   +2.7%     │
│ [Green]    │ [Green]      │   [Green]   │
├─────────────────────────────────────────┤
│   🟢 EXCELLENT 🟢                       │
├─────────────────────────────────────────┤
│ "Your aerobic system handled this       │
│  effort efficiently. Strong fitness     │
│  indicator."                            │
└─────────────────────────────────────────┘
```

#### 👍 Good (3–5%)

```
┌─────────────────────────────────────────┐
│ 🔬  Aerobic Decoupling                  │
│     Heart rate vs pace drift analysis   │
├─────────────────────────────────────────┤
│  HR Drift  │  Pace Drift  │ Decoupling  │
│  +2.5%     │    +1.8%     │   +4.3%     │
│ [Green]    │ [Green]      │  [Green]    │
├─────────────────────────────────────────┤
│   🟢 GOOD 🟢                            │
├─────────────────────────────────────────┤
│ "Minimal cardiac drift — your aerobic   │
│  base is solid for this pace."          │
└─────────────────────────────────────────┘
```

#### ⚠️ Moderate (5–8%)

```
┌─────────────────────────────────────────┐
│ 🔬  Aerobic Decoupling                  │
│     Heart rate vs pace drift analysis   │
├─────────────────────────────────────────┤
│  HR Drift  │  Pace Drift  │ Decoupling  │
│  +3.2%     │    +3.5%     │   +6.7%     │
│ [Orange]   │ [Orange]     │ [Yellow]    │
├─────────────────────────────────────────┤
│   🟡 MODERATE 🟡                        │
├─────────────────────────────────────────┤
│ "Some HR-pace decoupling detected.      │
│  More aerobic base work (easy runs)     │
│  would help."                           │
└─────────────────────────────────────────┘
```

#### 🔴 High (≥ 8%)

```
┌─────────────────────────────────────────┐
│ 🔬  Aerobic Decoupling                  │
│     Heart rate vs pace drift analysis   │
├─────────────────────────────────────────┤
│  HR Drift  │  Pace Drift  │ Decoupling  │
│  +7.4%     │    +4.8%     │  +12.2%     │
│ [Red]      │ [Orange]     │   [Red]     │
├─────────────────────────────────────────┤
│   🔴 HIGH 🔴                            │
├─────────────────────────────────────────┤
│ "Significant decoupling — either the    │
│  effort was above threshold or aerobic  │
│  fitness needs development."            │
└─────────────────────────────────────────┘
```

---

## 3. Data Processing Flow Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   RunSession Object                      │
│  ┌────────────────────┐  ┌────────────────────────────┐ │
│  │  heartRateData     │  │  kmSplits                  │ │
│  │  [72, 75, 78...120]│  │  [4:32/km, 4:45/km, ...]  │ │
│  │  (time-series)     │  │  (per-km pace)             │ │
│  └────────────────────┘  └────────────────────────────┘ │
└────────────────────┬─────────────────────┬───────────────┘
                     │                     │
                     ↓                     ↓
        ┌────────────────────┐  ┌──────────────────────┐
        │  Filter HR > 0     │  │ Parse "M:SS" to sec  │
        │  hr.filter {it > 0}│  │ "4:32/km" → 272 sec  │
        └────────────┬───────┘  └──────────┬───────────┘
                     │                     │
                     ↓                     ↓
        ┌────────────────────┐  ┌──────────────────────┐
        │  Validate Size     │  │  Filter paces > 0    │
        │  size >= 10 ✓      │  │  paces.filter {>0}   │
        └────────────┬───────┘  └──────────┬───────────┘
                     │                     │
                     └──────────┬──────────┘
                                │
                ┌───────────────┴───────────────┐
                │   SPLIT AT MIDPOINT           │
                │                               │
                ├─────────────────────────────┤
                │  HR Array Division            │
                │  hrMid = hr.size / 2          │
                │  firstHalfHr  = [0..mid)     │
                │  secondHalfHr = [mid..end)   │
                ├─────────────────────────────┤
                │  Pace Array Division          │
                │  paceMid = paces.size / 2     │
                │  firstHalfPace  = [0..mid)   │
                │  secondHalfPace = [mid..end) │
                └────────────────┬─────────────┘
                                │
                ┌───────────────┴───────────────┐
                │  COMPUTE AVERAGES             │
                │                               │
                │  firstHalfHr.average()   → 75 │
                │  secondHalfHr.average()  → 83 │
                │  firstHalfPace.average() → 270│
                │  secondHalfPace.average()→ 285│
                └────────────────┬─────────────┘
                                │
                ┌───────────────┴──────────────────────┐
                │  CALCULATE PERCENTAGE DRIFTS        │
                │                                      │
                │  hrDrift = (83-75)/75 × 100 = +10.7%│
                │  paceDrift = (285-270)/270 × 100    │
                │           = +5.6%                   │
                │  decoupling = 10.7 + 5.6 = 16.3%    │
                └────────────────┬────────────────────┘
                                │
                ┌───────────────┴──────────────────────┐
                │  APPLY THRESHOLD LOGIC              │
                │                                      │
                │  16.3% >= 8.0%  ?                   │
                │  → "HIGH"  (🔴 Red)                 │
                │  → Colors.error                      │
                │  → Red advice text                  │
                └────────────────┬────────────────────┘
                                │
                ┌───────────────┴──────────────────────┐
                │  RENDER CARD                        │
                │  ├─ Title & subtitle                │
                │  ├─ 3 metric columns                │
                │  ├─ Rating badge                    │
                │  └─ Contextual advice               │
                └──────────────────────────────────────┘
```

---

## 4. Early vs Late Split Examples

### 8 km Run with 16 HR Samples

```
Time-series HR data (every ~2 seconds):
┌─────────────────────────────────────────────────────┐
│ Sample: [72, 75, 78, 81, 84, 86, 88, 90, 92, 94,   │
│          96, 97, 98, 99, 100, 102]                 │
│         └────────────────────┬──────────────────┘   │
│         EARLY HALF           LATE HALF              │
│         avg = 81.625         avg = 97.625           │
│         ←─────────────────────────────────────→     │
│                      hrDrift = +19.6%               │
└─────────────────────────────────────────────────────┘

Kilometer splits (8 km run):
┌──────────────────────────────────────────────────────┐
│ Pace (sec): [270, 272, 271, 275, 280, 285, 288, 295]│
│            └──────────────┬─────────┬────────────┘   │
│            EARLY (1-4km)  │  LATE (5-8km)            │
│            avg = 272      avg = 287                  │
│            ←──────────────────────────────────────→  │
│                    paceDrift = +5.5%                 │
└──────────────────────────────────────────────────────┘

Combined: 19.6% + 5.5% = 25.1% decoupling
Rating: HIGH (🔴 Red) — Significant fatigue
```

### Negative Split Run (Better Late Performance)

```
Time-series HR data:
┌────────────────────────────────────────────────────┐
│ [95, 96, 96, 97, 95, 94, 93, 92, 91, 90, 89, 88]  │
│ EARLY avg = 96.0                LATE avg = 88.5    │
│                  hrDrift = -7.8% (IMPROVED!)       │
└────────────────────────────────────────────────────┘

Pace split:
┌────────────────────────────────────────────────────┐
│ [340, 335, 330, 328, 310, 305, 300, 295, 290, 285]│
│ EARLY avg = 333 sec            LATE avg = 293 sec  │
│                  paceDrift = -12.0% (FASTER!)     │
└────────────────────────────────────────────────────┘

Combined: -7.8% + (-12.0%) = -19.8% decoupling
Rating: EXCELLENT (🟢 Green) — Strong negative split!
```

---

## 5. Threshold & Color Mapping Logic

### Decision Tree

```
START: decoupling = hrDrift + paceDrift
       │
       ├─ decoupling < 3.0%
       │  │
       │  └─→ rating = "EXCELLENT"
       │      color = #FF4CAF50 (Bright Green)
       │      advice = "Your aerobic system handled..."
       │      render = ✅ Full card
       │
       ├─ decoupling < 5.0%
       │  │
       │  └─→ rating = "GOOD"
       │      color = #FF8BC34A (Light Green)
       │      advice = "Minimal cardiac drift..."
       │      render = ✅ Full card
       │
       ├─ decoupling < 8.0%
       │  │
       │  └─→ rating = "MODERATE"
       │      color = #FFFFC107 (Yellow)
       │      advice = "Some HR-pace decoupling..."
       │      render = ✅ Full card
       │
       └─ decoupling >= 8.0%
          │
          └─→ rating = "HIGH"
             color = Colors.error (🔴 Red)
             advice = "Significant decoupling..."
             render = ✅ Full card (alert state)
```

### Individual Metric Highlight Logic

```
HR Drift Value               Display Color
────────────────────────────────────────
<= 5.0%                     Colors.textPrimary (normal)
> 5.0%                      Colors.error (🔴 Red highlight)

Pace Drift Value            Display Color
────────────────────────────────────────
<= 3.0%                     Colors.textPrimary (normal)
> 3.0%                      #FF9800 (🟠 Orange highlight)

Decoupling Value            Display Color
────────────────────────────────────────
Uses threshold-based color from decision tree above
Always shown in ExtraBold weight
```

---

## 6. Rendering State Diagram

```
┌─────────────────────────────────────────────────────┐
│  AerobicDecouplingCard() called                     │
└────────────────────┬────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
    ┌─────────┐            ┌──────────┐
    │ Data    │            │ Data     │
    │ Valid?  │            │ Invalid? │
    └────┬────┘            └────┬─────┘
         │                      │
    YES  │                      │  NO
         │                      │
         ▼                      ▼
    ┌──────────────┐      ┌──────────────────┐
    │ Compute      │      │ Early return     │
    │ metrics      │      │ (composable      │
    │              │      │  renders nothing)│
    └────┬─────────┘      └──────────────────┘
         │
         ▼
    ┌──────────────────────────┐
    │ Apply threshold logic     │
    │ Determine color & rating  │
    └────┬─────────────────────┘
         │
         ▼
    ┌──────────────────────────────────┐
    │ Render Card                      │
    │ ├─ Header (icon + title)         │
    │ ├─ 3 columns (HR/Pace/Combined)  │
    │ ├─ Rating badge (colored pill)   │
    │ └─ Advice text                   │
    └───────────────────────���──────────┘
```

---

## 7. Real-World Example: 10 km Tempo Run

### Run Details

```
Distance:  10.0 km
Duration:  50:00 (5:00/km average)
HR Range:  138–158 bpm
```

### Data Snapshot

```
KM Splits:
┌────┬────────┬─────────┐
│ KM │  Time  │  Pace   │
├────┼────────┼─────────┤
│ 1  │ 4:58   │ 4:58/km │
│ 2  │ 5:01   │ 5:01/km │
│ 3  │ 5:04   │ 5:04/km │
│ 4  │ 5:08   │ 5:08/km │
│ 5  │ 5:12   │ 5:12/km │  ← Midpoint (50%)
│ 6  │ 5:16   │ 5:16/km │
│ 7  │ 5:19   │ 5:19/km │
│ 8  │ 5:22   │ 5:22/km │
│ 9  │ 5:26   │ 5:26/km │
│10  │ 5:30   │ 5:30/km │
└────┴────────┴─────────┘

First half avg:  5:03/km = 303 seconds
Last half avg:   5:21/km = 321 seconds
Pace drift:      (321–303)/303 × 100 = +5.9%

HR Data (sampled every ~2 seconds, ~150 samples):
[138, 140, 142, 144, 145, 146, 148, 150, 150, 151...]
[...152, 154, 155, 156, 157, 157, 158, 158, 158, 155]
                                             ↑ Midpoint

First 75 samples avg:  147.2 bpm
Last 75 samples avg:   155.3 bpm
HR drift:              (155.3–147.2)/147.2 × 100 = +5.5%

TOTAL DECOUPLING = 5.9% + 5.5% = 11.4%
```

### Card Display

```
┌────────────────────────────────────────┐
│ 🔬  Aerobic Decoupling                 │
│     Heart rate vs pace drift analysis  │
├────────────────────────────────────────┤
│  HR Drift   │  Pace Drift  │ Decoupling│
│   +5.5%     │    +5.9%     │  +11.4%   │
│ [Warn]      │ [Warn]       │  [ERROR]  │
├────────────────────────────────────────┤
│         🔴 HIGH 🔴                     │
├────────────────────────────────────────┤
│ "Significant decoupling — either the   │
│  effort was above threshold or aerobic │
│  fitness needs development."           │
└────────────────────────────────────────┘
```

### Interpretation

- ✅ **Expected**: This is a tempo run (threshold pace), so decoupling is normal
- ✅ **Not Concerning**: The runner sustained 5:00/km pace for 10 km at 90%+ max HR
- 💡 **Coaching**: "Good effort! For easier runs, aim for <5% decoupling to build aerobic base"

---

## 8. Component Hierarchy & Nesting

```
AerobicDecouplingCard()  [Private Composable]
│
├─ Card() [Material Design]
│  └─ Column(padding=16dp, gap=10dp)
│      │
│      ├─ Row(verticalAlignment=CenterVertically)  [Header]
│      │  ├─ Text("🔬", h3 style)
│      │  ├─ Spacer(8dp)
│      │  └─ Column
│      │     ├─ Text("Aerobic Decoupling", bold)
│      │     └─ Text("Heart rate vs pace drift analysis", caption)
│      │
│      ├─ Row(SpaceEvenly, CenterVertically)  [Metrics Row]
│      │  ├─ Column [HR Drift]
│      │  │  ├─ Text("HR Drift", caption, muted)
│      │  │  └─ Text("+X.X%", h4 bold, color-conditional)
│      │  ├─ Column [Pace Drift]
│      │  │  ├─ Text("Pace Drift", caption, muted)
│      │  │  └─ Text("+X.X%", h4 bold, color-conditional)
│      │  └─ Column [Combined]
│      │     ├─ Text("Decoupling", caption, muted)
│      │     └─ Text("X.X%", h4 extrabold, threshold-color)
│      │
│      ├─ Box [Rating Badge]
│      │  └─ Text("EXCELLENT", caption bold, threshold-color)
│      │
│      └─ Text(advice, small, textSecondary)
│
└─ Returns immediately if data insufficient
```

---

## 9. Color Hex Codes Reference

```kotlin
Colors Used in AerobicDecouplingCard:

val colorExcellent = Color(0xFF4CAF50)   // Bright Green    (#4CAF50)
val colorGood      = Color(0xFF8BC34A)   // Light Green     (#8BC34A)
val colorWarning   = Color(0xFFFFC107)   // Yellow          (#FFC107)
val colorAlert     = Color(0xFFFF9800)   // Orange          (#FF9800)
val colorError     = Colors.error        // Red             (#F44336 or app theme)

Text Colors:
val textPrimary    = Colors.textPrimary      // Main text (light/dark adaptive)
val textSecondary  = Colors.textSecondary    // Secondary text
val textMuted      = Colors.textMuted        // Labels, captions

Background:
val backgroundSecondary = Colors.backgroundSecondary  // Card surface
val borderColor    = Colors.border           // Card border
```

---

## 10. Animation & Transition Notes

The card is **static** (no animations). However, when the RunSummaryScreen first loads:

```
Timeline:
T+0ms     → Card renders with all values
T+500ms   → Card visible in list
T+1000ms  → User can read full analysis

No animations on:
- Ring progress
- Color transitions
- Text appearance

(Unlike the 3 metric rings in Graphs tab which use 1200ms ease-in animations)
```

---

**Visual Examples Created**: 10 diagrams covering real-world scenarios, color logic, data flow, and rendering hierarchy
