# Android 3 Circle Metrics - Visual Reference Guide

## Location in App
```
Run Summary Screen
├── Summary Tab (Overview)
│   └── Effort Score Card
├── Graphs Tab ← YOU ARE HERE
│   ├── Run Score Card ← Contains 3 Circles
│   │   ├── Circle 1: EFFORT
│   │   ├── Circle 2: HR ZONE / CADENCE  
│   │   └── Circle 3: CONSISTENCY
│   ├── Charts Section (Pace, Elevation, Cadence, HR)
│   ├── Heart Rate Analysis (if HR data available)
│   └── Multi-Metric Analysis (if Garmin data available)
└── [Other Tabs...]
```

---

## Circle Ring Visual Layout

```
┌─────────────────────────────────────────────────────┐
│                  Run Score                           │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  │    Circle    │  │    Circle    │  │    Circle    │
│  │      #1      │  │      #2      │  │      #3      │
│  │              │  │              │  │              │
│  │   ┌────┐     │  │   ┌────┐     │  │   ┌────┐     │
│  │  ╱       ╲    │  │  ╱       ╲    │  │  ╱       ╲    │
│  │ │  87%   │   │  │ │  72%   │   │  │ │  64%   │   │
│  │  ╲       ╱    │  │  ╲       ��    │  │  ╲       ╱    │
│  │   └────┘     │  │   └────┘     │  │   └────┘     │
│  │              │  │              │  │              │
│  │    EFFORT    │  │   HR ZONE    │  │ CONSISTENCY  │
│  │              │  │              │  │              │
│  │ Hard Effort  │  │  Zone 3      │  │ Solid Pace   │
│  │   target     │  │   164 bpm    │  │ Variable     │
│  │              │  │   max 185    │  │              │
│  │              │  │              │  │              │
│  │  [Hard]      │  │  [Tempo]     │  │  [Solid]     │
│  │              │  │              │  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘
│                                                      │
│  (1/3 width)      (1/3 width)       (1/3 width)    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Individual Circle Component Details

```
Ring Size: 86 dp diameter
Stroke: 9 dp (donut style)

    Ring Label (Top)
         ↓
        EFFORT
         ▲
    ┏━━━━┳━━━━┓
    ┃ 87%┃    ┃  ← Center Value (percentage)
    ┗━━━━┻━━━━┛
         ▼
    Actual Value (Sub-label)
    e.g., "41 min" or "164 bpm"
         
    Target Label (Optional)
    e.g., "max 185 bpm"
         
    Quality Badge
    e.g., "Hard" or "Zone 3"
    (Pill-shaped with matching color)
```

---

## Ring Colors by Quality Level

### Color Spectrum (Consistent Across All 3 Circles)
```
Worst ◄─────────────────────► Best

🔴 Red (#FF5252)         - Bad / Needs Improvement
🟠 Orange (#FF9800)      - Caution / Low 
🟡 Yellow (#FFEE58)      - Average / Variable
🟢 Light Green (#69F0AE) - Good / Solid
🟢 Bright Green (#00E676)- Excellent / Very Good
⚫ Gray                   - No Data
```

---

## Circle #1: EFFORT Ring

### Example Displays

**Low Effort (Easy Run)**
```
  ┌────────────┐
 ╱          ╲
│    22%    │  ← Low fill (easy pace)
 ╲          ╱
  └────────┘
   EFFORT
   20 min
   target
   [Recovery]   ← Badge: Green
```

**Moderate Effort (Tempo Run)**
```
  ┌────────────┐
 ╱          ╲
│    56%    │  ← Medium fill (tempo pace)
 ╲          ╱
  └────────┘
   EFFORT
   35 min
   target
   [Moderate]   ← Badge: Yellow
```

**High Effort (Hard Run)**
```
  ┌────────────┐
 ╱          ╲
│    82%    │  ← High fill (fast pace, long duration)
 ╲          ╱
  └────────┘
   EFFORT
   52 min
   target
   [Maximum Effort]   ← Badge: Red
```

### Effort Calculation Factors
```
Duration (0-20 pts)  [30 min = 10, 60 min = 18, 90+ min = 20]
  +
Distance (0-20 pts)  [0 km = 0, 20 km = 20]
  +
Pace Intensity (0-25 pts)  [3:00/km = 25, 7:00/km = 5]
  +
Elevation (0-15 pts)  [500m = 15]
  +
Heart Rate (0-20 pts)  [depends on age and max HR]
  ═══════════════════════════════════════
  = Total (0-100%)
```

---

## Circle #2a: HR ZONE Ring (When HR Data Available)

### Example Displays

**Zone 2 (Aerobic/Endurance)**
```
  ┌────────────┐
 ╱          ╲
│    65%    │  ← Ring fill = HR% of maxHR
 ╲          ╱
  └────────┘
   HR ZONE
   158 bpm
   max 185 bpm
   [Zone 2]   ← Badge: Bright Green = Excellent
```

**Zone 3 (Tempo)**
```
  ┌────────────┐
 ╱          ╲
│    72%    │  ← HR% of maxHR
 ╲          ╱
  └────────┘
   HR ZONE
   164 bpm
   max 185 bpm
   [Zone 3]   ← Badge: Light Green = Good
```

**Zone 5 (Anaerobic)**
```
  ┌────────────┐
 ╱          ╲
│    95%    │  ← Ring nearly full
 ╲          ╱
  └────────┘
   HR ZONE
   182 bpm
   max 185 bpm
   [Zone 5]   ← Badge: Red = Bad
```

### Heart Rate Zone Quality Mapping
```
Zone Quality Ranking:

Zone 2 (60-70% maxHR) → 🟢 Excellent (Aerobic sweet spot)
Zone 3 (70-80% maxHR) → 🟢 Good (Tempo training)
Zone 1 (50-60% maxHR) → 🟡 Average (Very easy recovery)
Zone 4 (80-90% maxHR) → 🟠 Caution (VO₂ Max overload)
Zone 5 (90-100% maxHR)→ 🔴 Bad (Anaerobic sprint/max)
```

---

## Circle #2b: CADENCE Ring (When NO HR Data)

### Example Displays

**Good Cadence (90% of target)**
```
  ┌────────────┐
 ╱          ╲
│    90%    │  ← Cadence % of target
 ╲          ╱
  └────────┘
   CADENCE
   162 spm
   target 180 spm
   [Good]   ← Badge: Light Green
```

**Excellent Cadence (100% of target)**
```
  ┌────────────┐
 ╱          ╲
│    100%   │  ← At target
 ╲          ╱
  └────────┘
   CADENCE
   176 spm
   target 176 spm
   [Excellent]   ← Badge: Bright Green
```

**Low Cadence (65% of target)**
```
  ┌────────────┐
 ╱          ╲
│    65%    │  ← Below target
 ╲          ╱
  └────────┘
   CADENCE
   156 spm
   target 174 spm
   [Low]   ← Badge: Orange
```

### Target Cadence Calculation Example
```
Base (from running speed + height):  172 spm

Adjustments:
  - Age >50?        Minus up to 6 spm
  - Weight >70kg?   Plus 0-4 spm
  - Uphill run?     Plus 0-10 spm
  - Downhill run?   Plus 0-6 spm

Final Target:       174 spm
```

---

## Circle #3: CONSISTENCY Ring

### Example Displays

**Excellent Consistency (Even pace throughout)**
```
  ┌────────────┐
 ╱          ╲
│    92%    │  ← Splits very consistent
 ╲          ╱
  └────────┘
   CONSISTENCY
   Very even
   Variable
   [Excellent]   ← Badge: Bright Green (CV < 0.02)
```

**Good Consistency (Steady pace with minor variations)**
```
  ┌────────────┐
 ╱          ╲
│    78%    │  ← Splits mostly consistent
 ╲          ╱
  └────────┘
   CONSISTENCY
   Steady pace
   Variable
   [Solid]   ← Badge: Light Green (CV = 0.02-0.05)
```

**Poor Consistency (Highly variable splits)**
```
  ┌────────────┐
 ╱          ╲
│    48%    │  ← Splits all over the place
 ╲          ╱
  └────────┘
   CONSISTENCY
   Uneven splits
   Variable
   [Uneven]   ← Badge: Orange (CV > 0.09)
```

### Consistency Calculation Example
```
KM Split Times:  [4:25, 4:28, 4:32, 4:15, 4:38, 4:21]

Step 1: Calculate mean
        (265 + 268 + 272 + 255 + 278 + 261) / 6 = 267 sec

Step 2: Calculate coefficient of variation (CV)
        stdDev = √(avg squared deviations) = 9.8
        CV = stdDev / mean = 9.8 / 267 = 0.0367

Step 3: Convert to ring score
        score = (1 - CV×5) × 100%
             = (1 - 0.0367×5) × 100%
             = (1 - 0.1835) × 100%
             = 81.6% → 82% (rounded)
```

---

## Data Dependencies

### What Each Circle Needs

**EFFORT Circle**
```
REQUIRED:
  ✓ run.distance (meters)
  ✓ run.duration (milliseconds)

OPTIONAL (for better scoring):
  ✓ run.heartRate (bpm) [+20pts if available]
  ✓ run.totalElevationGain (meters)
  ✓ userAge [for max HR calculation]

FALLBACK:
  If heartRate not available: Neutral 10 pts assigned
```

**HR ZONE Circle**
```
REQUIRED:
  ✓ run.heartRate > 0 (bpm average)
  
OPTIONAL (for accuracy):
  ✓ run.heartRateData (array of HR samples)
  ✓ userAge [for Tanaka max HR formula]

FALLBACK:
  If no HR data: SWITCHES TO CADENCE CIRCLE
  If userAge missing: Uses default max HR = 185
```

**CADENCE Circle** (Fallback only)
```
REQUIRED (if HR unavailable):
  ✓ run.cadence > 0 (spm)
  
OPTIONAL (for personalization):
  ✓ userHeightCm
  ✓ userAge
  ✓ userWeightKg
  ✓ run.totalElevationGain
  ✓ run.totalElevationLoss

FALLBACK:
  If cadence = 0: Shows "--" in value
  If user height/age missing: Uses average values
```

**CONSISTENCY Circle**
```
REQUIRED (one of):
  ✓ run.kmSplits (array, size >= 2)
  OR
  ✓ run.paceData (array, size >= 10)

FALLBACK:
  If neither available: Shows "--" and gray ring
```

---

## Color Animation

All three rings animate on load:
```
Duration: 1200 ms
Easing: FastOutSlowInEasing (ease-out)
Direction: Clockwise from -90° (top)

Progress: 0% ──[smooth curve]──> Final %
          (gray ring)              (colored ring)
```

---

## Responsive Design

```
Portrait (default):
  ┌─────────────────────┐
  │  [CIRCLE 1]         │
  │  [CIRCLE 2]         │
  │  [CIRCLE 3]         │
  │  (stacked row)      │
  │  Each = 1/3 width   │
  └─────────────────────┘

Landscape (device rotated):
  ┌─────────────────────────────────┐
  │ [CIRCLE 1] [CIRCLE 2] [CIRCLE 3]│
  │ (same horizontal layout)        │
  │ Each = 1/3 width still          │
  └─────────────────────────────────┘

Mobile (< 300dp):
  May need to adjust styling
  (check responsive behavior)
```

---

## Key Numbers at a Glance

| Component | Value | Notes |
|-----------|-------|-------|
| Ring Diameter | 86 dp | Fixed size |
| Ring Stroke | 9 dp | Donut thickness |
| Center Text Size | 14 sp | Bold percentage |
| Animation Duration | 1200 ms | Smooth ease-out |
| Glow Opacity | 18% | Subtle highlight |
| Max HR Formula | 208 - (0.7 × age) | Tanaka method |
| Consistency CV × | 5 | Sensitivity factor |
| Cadence Cap | 120% | Above target capped |
| Zone 2 Quality | Excellent | Best for aerobic training |

---

## Known States & Edge Cases

### No Data Scenarios
```
EFFORT:        Always shows (never missing)
HR ZONE:       Shows only if run.heartRate > 0
CADENCE:       Shows only if no HR AND run.cadence > 0
CONSISTENCY:   Shows only if splits/pace data available
```

### Special Cases
```
Walking Run:   Cadence badge shows "Walking pace" (overrides quality)
No Data:       Ring shows "--" and appears gray
Device Rotation: All circles reflow without data loss
Memory Pressure: Uses remember{} to avoid recalculation
```

