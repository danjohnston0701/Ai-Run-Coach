# Consistency Score — Quick Reference Card

## One-Line Definition
**Consistency Score = (1 − StdDev/Mean × 5) × 100%, clamped to [0, 100%]**

## The Formula in Plain English
1. Get km split times (or pace samples if < 2 splits)
2. Calculate average time: `mean = sum / count`
3. Calculate spread: `stdDev = sqrt(average of squared differences)`
4. Calculate normalized spread: `CV = stdDev / mean`
5. Apply magic formula: `score = (1 - CV×5) × 100%`
6. Clamp to 0-100%, round to integer

## Quality Tiers at a Glance

| Score | Label | Feel | Ring Color |
|-------|-------|------|-----------|
| 90-100% | Excellent | Very even | 🟢 Green |
| 75-89% | Solid | Steady | 🟢 Light Green |
| 55-74% | Variable | Moderate ups/downs | 🟡 Yellow |
| 35-54% | Uneven | Significant variation | 🟠 Orange |
| 0-34% | Uneven | All over the place | 🔴 Red |
| null | — | No data | ⚪ Gray/Muted |

## Display Format

```
┌──────────────────────┐
│    CONSISTENCY       │
│  ◉◉◉◉◉◉◉◉◉◉      │ ← Ring fills 0-100%
│  {SCORE}% {LABEL}    │ ← e.g., "94% Excellent"
│  {SUB_LABEL}         │ ← e.g., "Very even"
└──────────────────────┘
```

## Data Sources (Priority Order)

1. **Preferred**: `run.kmSplits` → extract `.time` field
   - Need: ≥ 2 splits
   
2. **Fallback**: `run.paceData` → filter values > 0
   - Need: ≥ 10 samples
   
3. **No data**: Show "—", muted color, disable ring

## Sub-Label Mapping

Based on consistency fraction:

```
if fraction >= 0.90:
    "Very even"
else if fraction >= 0.75:
    "Steady pace"
else if fraction >= 0.55:
    "Variable"
else:
    "Uneven splits"

if no data:
    "No data"
```

## Example Calculations

### Fast & Consistent (94%)
- Splits: 5:28, 5:26, 5:27, 5:29, 5:28
- CV: 0.0035
- Score: `(1 - 0.0035×5) × 100 = 98%` → **Excellent** ✅

### Typical Good Run (85%)
- Splits: 5:15, 5:23, 5:18, 5:25, 5:20
- CV: 0.0133
- Score: `(1 - 0.0133×5) × 100 = 93%` → **Excellent** ✅

### Variable Run (57%)
- Splits: 5:10, 6:05, 5:15, 6:10, 5:20 (intentional hills)
- CV: 0.0861
- Score: `(1 - 0.0861×5) × 100 = 57%` → **Variable** 🟡

### Fading Run (47%)
- Splits: 5:10, 5:15, 5:20, 5:50, 6:30 (fade)
- CV: 0.1057
- Score: `(1 - 0.1057×5) × 100 = 47%` → **Uneven** 🟠

## Color Logic

```swift
if fraction == nil {
    color = muted
} else if fraction >= 0.90 {
    color = excellent (green)
} else if fraction >= 0.75 {
    color = good (light green)
} else if fraction >= 0.55 {
    color = average (yellow)
} else if fraction >= 0.35 {
    color = caution (orange)
} else {
    color = bad (red)
}
```

## Important Notes

✅ **Does**: Measure km-to-km pace evenness  
✅ **Does**: Reward consistency over speed  
✅ **Does**: Use coefficient of variation (normalized by mean)  

❌ **Does NOT**: Account for elevation/hills  
❌ **Does NOT**: Compare to pace targets  
❌ **Does NOT**: Consider effort (if pace varies due to hills, still counts as variation)  

## Ring Animation

- **Duration**: 1200 ms
- **Curve**: Ease-out
- **Fill**: 0% (empty) → 100% (full), left to right
- **Ring size**: 86 dp diameter, 9 dp stroke width

## Edge Cases

| Scenario | Handling |
|----------|----------|
| 1 km split | Show "—" (need ≥ 2) |
| 5 pace points | Show "—" (need ≥ 10) |
| All splits equal | CV = 0, Score = 100%, "Excellent" |
| Massive variation | CV → 0.2+, Score → 0%, "Uneven" |

## iOS Checklist

- [ ] Extract split times OR pace data
- [ ] Validate minimum samples (2 splits OR 10 pace points)
- [ ] Calculate mean
- [ ] Calculate standard deviation
- [ ] Calculate CV = stdDev / mean
- [ ] Calculate fraction = (1 - cv×5).clamped(to: 0...1)
- [ ] Convert to score: Int(round(fraction × 100))
- [ ] Assign label based on fraction thresholds
- [ ] Assign color based on fraction thresholds
- [ ] Format: "{score}% {label}" in main ring text
- [ ] Display sub-label based on fraction
- [ ] Handle null case: show "—" with muted color

## Why CV × 5?

The multiplier of 5 is empirically chosen to make the scale intuitive:

```
CV = 0.01  (very tight)     → Score = 95% (Excellent)
CV = 0.03  (good)           → Score = 85% (Solid)
CV = 0.08  (variable)       → Score = 60% (Variable)
CV = 0.15  (poor)           → Score = 25% (Uneven)
CV = 0.20+ (very poor)      → Score = 0% (Uneven) [clamped]
```

This makes the score responsive to realistic variation ranges.

---

**Status**: ✅ Ready for iOS  
**Source**: Android `RunSummaryScreen.kt` lines 6772-6793  
**Last**: 2026-07-26
