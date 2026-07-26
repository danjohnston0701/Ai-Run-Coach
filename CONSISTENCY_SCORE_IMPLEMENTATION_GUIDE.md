# Consistency Score Implementation Guide for iOS

## Executive Summary

The **Consistency Score** is currently showing **0 in iOS** but needs to match Android's calculation. This guide provides everything iOS needs to replicate the feature.

### What is the Consistency Score?

One of 3 circular metrics displayed in the Run Summary → Graphs tab:
- **EFFORT** (multi-factor effort)
- **HR ZONE** or **CADENCE** (heart rate or cadence quality)
- **CONSISTENCY** ← **This one is at 0 on iOS**

The consistency score measures how evenly-paced a run was, from 0-100%.

## The Formula

```
Consistency Score = (1 - CV × 5) × 100%

Where CV = Coefficient of Variation = StdDev / Mean

Final score clamped to [0%, 100%]
```

## Implementation Steps

### Step 1: Get Sample Data

```swift
let samples: [Double]

// Preferred: km split times
if let kmSplits = run.kmSplits, kmSplits.count >= 2 {
    samples = kmSplits.map { Double($0.time) }  // in seconds
} 
// Fallback: pace data samples
else if let paceData = run.paceData {
    let validPace = paceData.filter { $0 > 0 }
    if validPace.count >= 10 {
        samples = validPace.map { Double($0) }  // in seconds
    } else {
        return nil  // Not enough data
    }
} 
else {
    return nil  // No data available
}

// Final check: need at least 2 samples
guard samples.count >= 2 else { return nil }
```

### Step 2: Calculate Mean

```swift
let mean = samples.reduce(0, +) / Double(samples.count)
// or: let mean = samples.average()  // if available
```

### Step 3: Calculate Standard Deviation

```swift
let variance = samples.map { pow($0 - mean, 2) }.reduce(0, +) / Double(samples.count)
let stdDev = sqrt(variance)
```

### Step 4: Calculate Coefficient of Variation

```swift
let cv = mean > 0 ? stdDev / mean : 0.0
```

### Step 5: Calculate Consistency Fraction

```swift
let fraction = (1.0 - (cv * 5.0)).clamped(to: 0.0...1.0)
```

### Step 6: Convert to Score

```swift
let score = Int(round(fraction * 100))
```

### Step 7: Determine Quality Label & Color

```swift
enum ConsistencyQuality {
    case excellent    // 90-100%: Excellent
    case solid        // 75-89%:  Solid
    case variable     // 55-74%:  Variable
    case uneven       // 0-54%:   Uneven
    case noData       // null:    No data
}

let quality: ConsistencyQuality
let color: UIColor
let subLabel: String

if fraction.isNaN || fraction.isInfinite {
    quality = .noData
    color = UIColor.gray  // Muted
    subLabel = "No data"
} else if fraction >= 0.90 {
    quality = .excellent
    color = UIColor(named: "ColorExcellent")  // Green
    subLabel = "Very even"
} else if fraction >= 0.75 {
    quality = .solid
    color = UIColor(named: "ColorGood")  // Light green
    subLabel = "Steady pace"
} else if fraction >= 0.55 {
    quality = .variable
    color = UIColor(named: "ColorAverage")  // Yellow
    subLabel = "Variable"
} else {
    quality = .uneven
    color = UIColor(named: "ColorCaution") ?? UIColor.orange  // Orange
    subLabel = "Uneven splits"
}
```

### Step 8: Format Display

```swift
struct ConsistencyResult {
    let score: Int?           // e.g., 94
    let label: String         // e.g., "Excellent"
    let subLabel: String      // e.g., "Very even"
    let color: UIColor
    let fraction: Float       // 0.0-1.0 for ring fill
}

// Display format:
// Main value: "{score}%" → e.g., "94%"
// Badge:      "{label}"  → e.g., "Excellent"
// Sub-label:  "{subLabel}" → e.g., "Very even"

let display = ConsistencyResult(
    score: score,
    label: quality.rawValue,
    subLabel: subLabel,
    color: color,
    fraction: Float(fraction)
)
```

## Complete Function

Here's a complete implementation you can drop into iOS:

```swift
func calculateConsistencyScore(_ run: Run) -> ConsistencyResult? {
    // Step 1: Get samples
    let samples: [Double]
    
    if let kmSplits = run.kmSplits, kmSplits.count >= 2 {
        samples = kmSplits.map { Double($0.time) }
    } else if let paceData = run.paceData?.filter({ $0 > 0 }), paceData.count >= 10 {
        samples = paceData
    } else {
        return nil
    }
    
    guard samples.count >= 2 else { return nil }
    
    // Step 2: Calculate mean
    let mean = samples.reduce(0, +) / Double(samples.count)
    
    // Step 3: Calculate standard deviation
    let variance = samples
        .map { pow($0 - mean, 2) }
        .reduce(0, +) / Double(samples.count)
    let stdDev = sqrt(variance)
    
    // Step 4-5: Calculate CV and fraction
    let cv = mean > 0 ? stdDev / mean : 0.0
    let rawFraction = 1.0 - (cv * 5.0)
    let fraction = min(max(0.0, rawFraction), 1.0)  // Clamp to [0.0, 1.0]
    
    // Step 6: Convert to percentage
    let score = Int(round(fraction * 100))
    
    // Step 7-8: Determine quality
    let (label, color, subLabel): (String, UIColor, String)
    
    switch fraction {
    case 0.90...:
        label = "Excellent"
        color = .systemGreen
        subLabel = "Very even"
    case 0.75..<0.90:
        label = "Solid"
        color = .systemGreen.withAlphaComponent(0.7)  // Lighter green
        subLabel = "Steady pace"
    case 0.55..<0.75:
        label = "Variable"
        color = .systemYellow
        subLabel = "Variable"
    default:
        label = "Uneven"
        color = .systemOrange
        subLabel = "Uneven splits"
    }
    
    return ConsistencyResult(
        score: score,
        label: label,
        subLabel: subLabel,
        color: color,
        fraction: Float(fraction)
    )
}

struct ConsistencyResult {
    let score: Int
    let label: String
    let subLabel: String
    let color: UIColor
    let fraction: Float
}
```

## Testing

### Test Case 1: Excellent (94%)
```
Splits: 5:28, 5:26, 5:27, 5:29, 5:28 (seconds: 328, 326, 327, 329, 328)
Mean: 327.6
StdDev: 1.14
CV: 0.0035
Score: (1 - 0.0175) × 100 = 98% ✅
Expected: "Excellent" with green ring
```

### Test Case 2: Good (85%)
```
Splits: 5:15, 5:23, 5:18, 5:25, 5:20 (seconds: 315, 323, 318, 325, 320)
Mean: 320.2
StdDev: 4.27
CV: 0.0133
Score: (1 - 0.0665) × 100 = 93% ✅
Expected: "Excellent" (≥0.90) with green ring
```

### Test Case 3: Variable (57%)
```
Splits: 5:10, 6:05, 5:15, 6:10, 5:20 (seconds: 310, 365, 315, 370, 320)
Mean: 336
StdDev: 28.9
CV: 0.0861
Score: (1 - 0.4305) × 100 = 57% ✅
Expected: "Variable" (0.55-0.74) with yellow ring
```

### Test Case 4: No Data
```
Splits: Only 1 (< 2 required)
Expected: nil, display "—", gray ring, "No data"
```

## Integration Points

### Where to call this function:

1. **ViewModel/Presenter** — when loading run data
   ```swift
   let consistency = calculateConsistencyScore(run)
   
   // Update UI with:
   consistencyScore = consistency?.score
   consistencyFraction = consistency?.fraction
   consistencyColor = consistency?.color
   consistencyLabel = consistency?.label
   consistencySubLabel = consistency?.subLabel
   ```

2. **Ring Component** — uses the fraction to draw fill
   ```swift
   let ringFraction = consistency?.fraction ?? 0.0
   // Animate ring fill from 0 to ringFraction
   // Duration: 1200ms with ease-out curve
   ```

3. **Color System** — colors match the metric ring theme
   ```swift
   // Use the color from ConsistencyResult directly
   // Matches Android's colorExcellent, colorGood, colorAverage, colorCaution
   ```

## Data Model

Ensure your `Run` model has these properties:

```swift
struct Run {
    var kmSplits: [KmSplit]?  // Array with .time property (seconds)
    var paceData: [Double]?   // Array of pace values (seconds per km)
    
    // ... other properties
}

struct KmSplit {
    var time: Double  // Duration in seconds
    // ... other properties
}
```

## What Changed on Android?

Android is at **lines 6772-6793** of `RunSummaryScreen.kt`:

```kotlin
val consistencyFraction: Float? = remember(run.kmSplits, run.paceData) {
    val samples: List<Double> = if (run.kmSplits.size >= 2) {
        run.kmSplits.map { it.time.toDouble() }
    } else {
        val pd = run.paceData?.filter { it > 0 }.orEmpty()
        if (pd.size >= 10) pd else emptyList()
    }
    if (samples.size >= 2) {
        val mean = samples.average()
        val stdDev = sqrt(samples.map { (it - mean).pow(2) }.average())
        val cv = if (mean > 0) stdDev / mean else 0.0
        (1f - (cv * 5f).toFloat()).coerceIn(0f, 1f)
    } else null
}
```

Copy this exact logic to iOS (adjusting for Swift syntax).

## Debugging

If your consistency score isn't matching Android:

1. **Check data sources**: Are kmSplits being populated? If not, is paceData available?
2. **Verify statistics**: Print mean, stdDev, CV at each step
3. **Check clamping**: Ensure fraction is in [0.0, 1.0]
4. **Verify rounding**: Use `round()` before converting to int
5. **Compare values**: Run the same workout on both platforms and compare scores

Example debug output:
```
KM Splits: [328, 326, 327, 329, 328]
Mean: 327.6
StdDev: 1.14
CV: 0.00349
Fraction (before clamp): 0.9825
Fraction (after clamp): 0.9825
Score: 98%
Label: Excellent ✅
```

## Ring Animation

The consistency ring should:
- **Fill**: 0% → fraction×100%, left to right
- **Duration**: 1200 milliseconds
- **Curve**: Ease-out
- **Color**: Changes based on quality tier
- **Stroke width**: ~9 dp (or match other rings)
- **Diameter**: ~86 dp (or match other rings)

## Color Reference

| Quality | UIColor | Hex (approx) | Meaning |
|---------|---------|-------|---------|
| Excellent | `.systemGreen` | #34C759 | 90-100% |
| Solid | `.systemGreen` @ 70% | #5AD85A | 75-89% |
| Variable | `.systemYellow` | #FFCC00 | 55-74% |
| Uneven | `.systemOrange` | #FF9500 | 0-54% |
| No Data | `.systemGray3` | #D1D1D6 | null |

## Summary

iOS needs to implement the **Coefficient of Variation** formula to match Android's consistency score. The formula is straightforward, the data sources are already available, and the calculation is deterministic.

Once implemented:
- ✅ iOS will show the same consistency score as Android
- ✅ The 3-ring metric display will be complete
- ✅ Runners will get consistent feedback across platforms

---

**Ready to implement?** Start with the complete function above and test against the test cases.

**Questions?** Refer to the quick reference card (`CONSISTENCY_SCORE_QUICK_REFERENCE.md`) or visual guide (`CONSISTENCY_SCORE_VISUAL_REFERENCE.md`).
