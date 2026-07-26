# KM Split Breakdown Chart — Color Coding & Zone Rules

## Overview
The KM Split Breakdown chart displays each kilometer's pace relative to the **average pace** of the entire run, using a color-coded bar system. This allows users to quickly identify pace consistency patterns.

---

## Color Coding System

### Deviation-Based Coloring
Colors are determined by comparing each split's pace to the **average pace** of the run:

```
Deviation = (split_pace - average_pace) / average_pace
```

### Color Zones

| Deviation Range | Color | Hex Code | Label | Meaning |
|---|---|---|---|---|
| **Fastest split** (any %) | 🟢 **Green** | `#4CAF50` | "On pace" | Personal best km |
| **≤ 5% slower** | 🟢 **Green** | `#4CAF50` | "On pace" | Within acceptable range |
| **5% – 12% slower** | 🟡 **Yellow** | `#FFC107` | "Slightly slower" | Minor pace drop |
| **12% – 20% slower** | 🟠 **Orange** | `#FF9800` | (warning) | Significant slowdown |
| **> 20% slower** | 🔴 **Red** | `Colors.error` | "Notably slow" | Major pace drop |

### Special Rules
1. **Fastest split is always green** — even if objectively slow by other metrics
2. **Slowest split gets special treatment** — red only if deviation > 12% (otherwise normal color logic applies)
3. **Philosophy**: Reward consistency, not just speed

---

## Visual Elements

### Bar Length
The bar width represents **relative pace** on a normalized axis:

```
Bar Axis:
  Min (shortest bar) = Average Pace × 0.85  (15% faster than avg)
  Max (longest bar)  = Average Pace × 1.25  (25% slower than avg)
  
Bar Calculation:
  normalized = (split_pace - axis_min) / (axis_max - axis_min)
  bar_fill = clamp(normalized, 0.15, 1.0)  // constrain to 15–100%
```

**Visual Rule**: 
- **Slower pace** = longer bar (takes more time)
- **Faster pace** = shorter bar (more efficient)
- All bars shown at 15–100% to avoid invisible bars

### Text Display
- Split number: "Km 1", "Km 2", etc.
- Pace value: Formatted as "M:SS" (e.g., "5:44/km")
- **Fastest & slowest splits**: Bold/extra bold text with color highlighting
- **All others**: Regular weight

### Pace Text Colors
- **Fastest split**: Green text
- **Slowest split** (if > 12% deviation): Red text  
- **All others**: Primary text color

---

## Legend

Display three legend items below the chart:

```
🟢 On pace           (Green dots)
🟡 Slightly slower   (Yellow dots)
🔴 Notably slow      (Red dots)
```

---

## Parsing Pace Data

### Pace Format
Input format: `"M:SS/km"` (e.g., `"5:44/km"`)

### Parsing Algorithm
```
1. Remove "/km" suffix and trim whitespace
2. Split on ":" to get [minutes, seconds]
3. Calculate total seconds = minutes × 60 + seconds
4. Handle invalid/missing data as 0 (displayed as "—")
```

### Edge Cases
- Missing pace data: Display as "—"
- Invalid format: Treat as 0 seconds (show "—")
- Zero pace: Skip in average calculation, use 0 for bar display

---

## Average Pace Calculation

```
1. Parse all split paces to seconds
2. Filter out invalid (zero) paces
3. average_pace = sum(valid_paces) / count(valid_paces)
4. Calculate min_pace and max_pace for fastest/slowest identification
```

**Important**: Average is calculated only from **valid paces** (non-zero), but the chart displays **all splits** including those with missing pace data.

---

## Implementation Checklist

- [ ] Parse pace strings correctly (handle "M:SS/km" format)
- [ ] Calculate average pace from valid splits only
- [ ] Implement deviation calculation: `(pace - avg) / avg`
- [ ] Apply color logic based on deviation thresholds
- [ ] Render bars with normalized fill width (15–100%)
- [ ] Highlight fastest split in green (always)
- [ ] Highlight slowest split in red (if > 12% deviation)
- [ ] Display legend with three color zones
- [ ] Format pace as "M:SS" in text display
- [ ] Handle missing/invalid pace data as "—"
- [ ] Bold text for fastest/slowest splits

---

## Example

For a 5km run with splits: 5:40, 5:44, 5:50, 6:10, 5:55

```
Average pace = (340 + 344 + 350 + 370 + 355) / 5 = 351.8 seconds ≈ 5:51

Km 1: 5:40 (340s)  → -3.4% → GREEN (on pace)
Km 2: 5:44 (344s)  → -2.2% → GREEN (on pace)
Km 3: 5:50 (350s)  → -0.5% → GREEN (on pace)
Km 4: 6:10 (370s)  → +5.2% → YELLOW (slightly slower)
Km 5: 5:55 (355s)  → +1.0% → GREEN (on pace)

Visual:
  Fastest: Km 1 (bold, green text)
  Slowest: Km 4 (bold, yellow text because < 12% deviation)
```

---

## Notes for iOS Implementation

- This approach **rewards consistency** over raw speed — a consistent 6:00/km run shows all green, not a mix of colors
- The **±25% axis range** ensures bars are visible and useful even for highly variable paces
- **Fastest split is always highlighted** to celebrate the runner's best effort
- The color scheme matches the app's overall theme (green=good, yellow=caution, orange/red=warning)
