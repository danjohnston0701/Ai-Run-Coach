# Consistency Score Calculation — Brief for iOS Implementation

## Overview

The **Consistency Score** is one of 3 circle metrics displayed in the Run Summary → Graphs tab. It measures how evenly-paced a run was (0-100%).

## The Formula

**Consistency Score = (1 − CV × 5) × 100%**

Where:
- **CV** = Coefficient of Variation = Standard Deviation / Mean
- Clamped to **0-100%** range (never negative, never exceeds 100%)

## Step-by-Step Calculation

### 1. **Get the sample data** (in seconds)
```
Samples = km split times (preferred) OR pace data points (fallback)

Preferred: run.kmSplits.map { it.time }
  - Example: [320, 325, 318, 330, 322] seconds

Fallback: run.paceData (filtered to values > 0)
  - Use if less than 2 km splits
  - Need at least 10 pace samples to use this data
```

### 2. **Calculate the mean (average)**
```
Mean = sum(samples) / count(samples)

Example: (320 + 325 + 318 + 330 + 322) / 5 = 323 seconds
```

### 3. **Calculate standard deviation**
```
StdDev = sqrt(average of squared differences from mean)

Step 1: (320-323)² = 9,    (325-323)² = 4,    (318-323)² = 25,    (330-323)² = 49,    (322-323)² = 1
Step 2: Average = (9+4+25+49+1) / 5 = 17.6
Step 3: StdDev = sqrt(17.6) = 4.19 seconds
```

### 4. **Calculate Coefficient of Variation**
```
CV = StdDev / Mean (if mean > 0, else CV = 0)

Example: 4.19 / 323 = 0.01296
```

### 5. **Calculate the fraction**
```
Fraction = (1 − CV × 5) clamped to [0.0, 1.0]

Example: (1 - 0.01296 × 5) = (1 - 0.0648) = 0.9352 = 93.52%
```

### 6. **Convert to display**
```
Score = Fraction × 100, rounded to nearest integer
Display as: "{score}%"

Example: 93%
```

## Quality Tiers

Based on the consistency fraction:

| Fraction | Score | Label | Color |
|----------|-------|-------|-------|
| ≥ 0.90 | 90-100% | "Excellent" | Green |
| 0.75-0.89 | 75-89% | "Solid" | Light Green |
| 0.55-0.74 | 55-74% | "Variable" | Yellow |
| 0.35-0.54 | 35-54% | "Uneven" | Orange |
| < 0.35 | 0-34% | "Uneven" | Red |

## Display Format

### Ring Label
```
"CONSISTENCY"
```

### Main Value
```
"{score}%"
e.g., "88%"
```

### Sub-Label (description)
```
Based on fraction:
- ≥ 0.90: "Very even"
- ≥ 0.75: "Steady pace"
- ≥ 0.55: "Variable"
- < 0.55: "Uneven splits"

(When no data: "No data")
```

### Badge Text
```
Same as Label in quality tiers above
```

## Edge Cases

| Condition | Handling |
|-----------|----------|
| Less than 2 km splits AND less than 10 pace samples | Show "—" (no data), disable ring, show color = textMuted |
| All splits have same time | CV = 0, Score = 100%, Label = "Excellent" |
| No data available | Fraction = null, display "—", show "No data" subLabel |

## Data Sources

The consistency score uses **ONE** of these sources (in priority order):

1. **Preferred**: `run.kmSplits` 
   - Array of split objects
   - Extract: `split.time` (duration in seconds)
   - Need: ≥ 2 splits

2. **Fallback**: `run.paceData`
   - Array of pace values (in seconds per km)
   - Filter out values ≤ 0
   - Need: ≥ 10 valid pace samples

If neither source has enough data, show "—" and disable the ring.

## Why This Formula?

- **Coefficient of Variation**: Normalizes the standard deviation by the mean, so a 5-second variation in a 5-minute km is treated the same as a 5-second variation in a 6-minute km
- **CV × 5 multiplier**: Scales the sensitivity so:
  - Very tight runs (CV ~0.01) = ~95% score
  - Loose runs (CV ~0.15) = ~25% score
  - Typical good run (CV ~0.03) = ~85% score
- **Clamped to [0, 1]**: Prevents negative scores or scores above 100%

## Implementation Checklist

- [ ] Extract km split times OR pace data samples
- [ ] Validate: at least 2 splits OR at least 10 pace samples
- [ ] Calculate mean of samples
- [ ] Calculate standard deviation
- [ ] Calculate CV (stdDev / mean)
- [ ] Calculate fraction: (1 - cv×5).coerceIn(0.0, 1.0)
- [ ] Convert to percentage: fraction × 100, rounded
- [ ] Assign quality label based on fraction
- [ ] Assign quality color based on fraction
- [ ] Format display text: "{score}% {label}"
- [ ] Handle null case: show "—" with muted color

## Testing Examples

### Example 1: Excellent Consistency
```
Data: [320, 322, 321, 319, 323] seconds (perfect for 5:20-5:23 min)
Mean: 321 seconds
StdDev: 1.41 seconds
CV: 0.0044
Fraction: 1 - (0.0044 × 5) = 0.978 = 97.8%
Display: "98% Excellent"
Color: Green
```

### Example 2: Poor Consistency
```
Data: [300, 380, 310, 350, 330] seconds (highly variable)
Mean: 334 seconds
StdDev: 32.9 seconds
CV: 0.0985
Fraction: 1 - (0.0985 × 5) = 0.507 = 50.7%
Display: "51% Uneven"
Color: Orange
```

### Example 3: No Data
```
Data: Only 1 km split (< 2 required)
paceData: Empty or < 10 samples
Display: "— No data"
Color: Muted gray
```

## Key Differences from Other Metrics

- **Does NOT** consider elevation, terrain, or pace targets
- **Purely statistical**: measures variance in split times
- **Rewards consistency**, not speed
- A very slow but even-paced run scores higher than a fast but uneven run

---

**Status**: ✅ Ready for iOS implementation  
**Android Source**: `RunSummaryScreen.kt` lines 6772-6793  
**Last Updated**: 2026-07-26
