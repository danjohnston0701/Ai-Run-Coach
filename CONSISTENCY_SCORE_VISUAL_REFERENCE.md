# Consistency Score — Visual Reference & Examples

## Formula Visualization

```
Raw Split Times (seconds)
    ↓
    320, 325, 318, 330, 322
    ↓
Calculate Mean
    ↓
    (320+325+318+330+322) / 5 = 323 seconds
    ↓
Calculate Standard Deviation
    ↓
    sqrt(avg of squared differences) = 4.19 seconds
    ↓
Calculate Coefficient of Variation
    ↓
    StdDev / Mean = 4.19 / 323 = 0.01296
    ↓
Apply Formula: (1 - CV × 5) × 100%
    ↓
    (1 - 0.01296 × 5) × 100 = 93.52%
    ↓
Round & Clamp: [0.0, 1.0]
    ↓
RESULT: 94% → "Excellent" ✅
```

## The 3 Circle Metrics in Context

```
╔════════════════════════════════════════════════════════════╗
║                     RUN SCORE (Graphs Tab)                 ║
║                  3 Metric Circles Display                   ║
╠════════════════════════════════════════════════════════════╣
║                                                             ║
║   ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐
║   │     EFFORT      │  │   HR ZONE       │  │  CONSISTENCY │
║   │                 │  │ (or CADENCE)    │  │              │
║   │ ┌─────────────┐ │  │ ┌─────────────┐│  │ ┌──────────┐ │
║   │ │   ◉◉◉◉◉◉   │ │  │ │  ◉◉◉◉◉◉◉  ││  │ │ ◉◉◉◉◉◉  │ │
║   │ │  85% GOOD   │ │  │ │ 78% GOOD   ││  │ │ 94% EXCL. │ │
║   │ └─────────────┘ │  │ └─────────────┘│  │ └──────────┘ │
║   │                 │  │                 │  │              │
║   │ Multi-factor    │  │ HR Zone or      │  │ Pace         │
║   │ effort score    │  │ Cadence quality │  │ consistency  │
║   │                 │  │                 │  │ (Coefficient │
║   └─────────────────┘  │                 │  │ of Variation)│
║                        └─────────────────┘  └──────────────┘
║                                                             ║
║  ← Ring colors vary by quality (Green→Red gradient) →      ║
╚════════════════════════════════════════════════════════════╝
```

## Quality Color Coding

```
Score    Fraction   Label           Color    Meaning
────────────────────────────────��────────────────────────────
90-100%  ≥ 0.90    Excellent       🟢 Green  Outstanding consistency
75-89%   0.75-0.89 Solid           🟢 LtGrn  Very good consistency
55-74%   0.55-0.74 Variable        🟡 Yellow Moderate variation
35-54%   0.35-0.54 Uneven          🟠 Orange Significant variation
0-34%    < 0.35    Uneven          🔴 Red    Poor consistency
(null)   —         No data         ⚪ Muted  Insufficient data
```

## Real-World Examples

### Example 1: Marathon Pace (Excellent)
```
Km Splits:     5:28, 5:26, 5:27, 5:29, 5:28
In Seconds:   328, 326, 327, 329, 328

Mean:        327.6 seconds
StdDev:      1.14 seconds
CV:          0.0035
Fraction:    (1 - 0.0035×5) = 0.9825
Score:       ✅ 98% EXCELLENT
Message:     "Very even"

Visual Ring:  ████████████████████ (nearly full)
```

**Why it scores high**: All splits within 3 seconds of each other. Paced like clockwork.

---

### Example 2: Road Race (Good)
```
Km Splits:     5:15, 5:23, 5:18, 5:25, 5:20
In Seconds:   315, 323, 318, 325, 320

Mean:        320.2 seconds
StdDev:      4.27 seconds
CV:          0.0133
Fraction:    (1 - 0.0133×5) = 0.9335
Score:       ✅ 93% EXCELLENT → displayed as "SOLID" (≥0.75)
Message:     "Steady pace"

Visual Ring:  ████████████████████ (mostly full)
```

**Why it scores high**: Variation of ~8 seconds spread over a 5:20 average is very consistent.

---

### Example 3: Hill Workout (Variable)
```
Km Splits:     5:10, 6:05, 5:15, 6:10, 5:20
In Seconds:   310, 365, 315, 370, 320

Mean:        336 seconds
StdDev:      28.9 seconds
CV:          0.0861
Fraction:    (1 - 0.0861×5) = 0.5695
Score:       🟡 57% VARIABLE
Message:     "Variable"

Visual Ring:  ███████████░░░░░░░░ (just over half)
```

**Why it scores medium**: Intentional variation (hills). Mathematically consistent variance is "variable" per formula.

---

### Example 4: Long Run - Starting Fresh, Fading (Poor)
```
Km Splits:     5:10, 5:15, 5:20, 5:50, 6:30
In Seconds:   310, 315, 320, 350, 390

Mean:        337 seconds
StdDev:      35.6 seconds
CV:          0.1057
Fraction:    (1 - 0.1057×5) = 0.4715
Score:       🟠 47% UNEVEN
Message:     "Uneven splits"

Visual Ring:  ██████████░░░░░░░░░░ (less than half)
```

**Why it scores low**: Fade pattern (negative split). Last 2 km are 80 seconds slower than first 2 km.

---

### Example 5: Chaotic Run (Very Poor)
```
Km Splits:     5:00, 5:45, 5:10, 6:30, 5:20
In Seconds:   300, 345, 310, 390, 320

Mean:        333 seconds
StdDev:      40.3 seconds
CV:          0.121
Fraction:    (1 - 0.121×5) = 0.395
Score:       🔴 40% UNEVEN
Message:     "Uneven splits"

Visual Ring:  ████████░░░░░░░░░░░░ (40% fill)
```

**Why it scores low**: All over the place — no pacing rhythm.

---

### Example 6: Insufficient Data
```
Km Splits:     Only 1 (< 2 needed)
paceData:      Empty or < 10 samples

Fraction:      null
Score:         ⚪ — (no data)
Message:       "No data"
Color:         Muted gray
Ring Display:  Empty ring, disabled
```

**Why no score**: Can't calculate consistency from single data point.

## Step-by-Step Worked Example

Let's calculate a real run:

```
USER'S RUN:
Distance:     5 km
Km 1:         5:32 (332 sec)
Km 2:         5:28 (328 sec)
Km 3:         5:35 (335 sec)
Km 4:         5:30 (330 sec)
Km 5:         5:29 (329 sec)

STEP 1: Collect samples
samples = [332, 328, 335, 330, 329]

STEP 2: Calculate mean
mean = (332 + 328 + 335 + 330 + 329) / 5
     = 1654 / 5
     = 330.8 seconds

STEP 3: Calculate deviations from mean
km1: 332 - 330.8 = 1.2,   squared = 1.44
km2: 328 - 330.8 = -2.8,  squared = 7.84
km3: 335 - 330.8 = 4.2,   squared = 17.64
km4: 330 - 330.8 = -0.8,  squared = 0.64
km5: 329 - 330.8 = -1.8,  squared = 3.24

STEP 4: Calculate variance
variance = (1.44 + 7.84 + 17.64 + 0.64 + 3.24) / 5
         = 30.8 / 5
         = 6.16

STEP 5: Calculate standard deviation
stdDev = sqrt(6.16)
       = 2.48 seconds

STEP 6: Calculate coefficient of variation
CV = stdDev / mean
   = 2.48 / 330.8
   = 0.00749

STEP 7: Apply consistency formula
fraction = 1 - (CV × 5)
         = 1 - (0.00749 × 5)
         = 1 - 0.03745
         = 0.96255

STEP 8: Clamp to [0.0, 1.0]
clamped = 0.96255 ✅ (already in range)

STEP 9: Convert to percentage
score = 0.96255 × 100
      = 96.255%

STEP 10: Round to integer
display = 96%

STEP 11: Assign quality tier
96% ≥ 0.90 → "Excellent" + Green + "Very even"

FINAL DISPLAY:
┌──────────────────┐
│   CONSISTENCY    │
│                  │
│  ◉◉◉◉◉◉◉◉◉◉    │
│   96% EXCELLENT  │
│   Very even      │
└──────────────────┘
```

## Code Structure (Swift Pseudo-Code)

```swift
func calculateConsistencyScore(run: Run) -> ConsistencyResult {
    // 1. Get samples
    let samples: [Double]
    if run.kmSplits.count >= 2 {
        samples = run.kmSplits.map { Double($0.time) }
    } else if let paceData = run.paceData?.filter({ $0 > 0 }), paceData.count >= 10 {
        samples = paceData.map { Double($0) }
    } else {
        return ConsistencyResult(score: nil, label: "No data")
    }
    
    // 2. Calculate statistics
    let mean = samples.average()
    let variance = samples.map { pow($0 - mean, 2) }.average()
    let stdDev = sqrt(variance)
    
    // 3. Calculate CV and fraction
    let cv = mean > 0 ? stdDev / mean : 0.0
    let fraction = max(0.0, min(1.0, 1.0 - (cv * 5.0)))
    
    // 4. Convert to score and label
    let score = Int(round(fraction * 100))
    let label: String
    let color: UIColor
    let subLabel: String
    
    switch fraction {
    case 0.9...:
        label = "Excellent"
        subLabel = "Very even"
        color = .green
    case 0.75..<0.9:
        label = "Solid"
        subLabel = "Steady pace"
        color = .lightGreen
    case 0.55..<0.75:
        label = "Variable"
        subLabel = "Variable"
        color = .yellow
    default:
        label = "Uneven"
        subLabel = "Uneven splits"
        color = .orange
    }
    
    return ConsistencyResult(
        score: score,
        fraction: Float(fraction),
        label: label,
        subLabel: subLabel,
        color: color
    )
}
```

---

**Visual Notes**:
- Ring fills from **left to right** based on fraction (0.0 = empty, 1.0 = full)
- Ring stroke width: **9 dp** (doughnut style)
- Ring diameter: **86 dp**
- Animation duration: **1200 ms** with ease-out curve
- All 3 rings update simultaneously when run data loads

