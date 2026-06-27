# Android App Graph Specifications for Replit Server Sync

## Overview
The Android app uses sophisticated chart rendering with intelligent axis configuration to prevent visual distortion of consistent data. The Replit server's share image generator should match these principles.

---

## 1. Core Axis Philosophy: `GraphAxisUtils.kt`

### Key Principle
**Consistent data should look consistent (not erratic); Variable data should show real variation.**

### Smart Margin Algorithm
```kotlin
fun calculateAxisConfig(
    values: List<Float>,
    typicalMin: Float,
    typicalMax: Float,
    minSpreadPercentage: Float = 0.10f,  // 10% of typical range
    baseMargin: Float = 0.05f             // 5% margin on data range
): AxisConfig
```

**Logic:**
1. Calculate actual data spread: `spread = max - min`
2. Calculate threshold: `threshold = (typicalMax - typicalMin) × 0.10`
3. **If spread < threshold** (very consistent data):
   - Add margin buffer: `buffer = (threshold - spread) / 2`
   - Visual range: `[min - buffer, max + buffer]`
   - Flag: `hasMargin = true`
4. **If spread ≥ threshold** (good spread):
   - Add standard margin: `margin = spread × 0.05`
   - Visual range: `[min - margin, max + margin]`
   - Flag: `hasMargin = false`

### Data Consistency Levels
| Level | Condition | Margin Added |
|-------|-----------|--------------|
| `VERY_CONSISTENT` | spread < 50% of threshold | Yes (full buffer) |
| `CONSISTENT` | spread < threshold | Yes (threshold-based) |
| `VARIABLE` | threshold ≤ spread < 3× threshold | Yes (5% of range) |
| `HIGHLY_VARIABLE` | spread ≥ 3× threshold | Yes (5% of range) |

---

## 2. Metric-Specific Axis Ranges

### Heart Rate (HR)
- **Typical Range:** 140–180 bpm
- **Min Spread %:** 10% = 4 bpm threshold
- **Formula:** `visualMin = min - buffer`, `visualMax = max + buffer`
- **Example:** HR data 142–146 bpm
  - Spread: 4 bpm (= threshold, borderline)
  - Buffer: (4 - 4) / 2 = 0
  - Visual: 142–146 with 5% margin = 140.8–147.2 bpm
  - Result: Stable HR looks stable, not erratic

### Pace (min/km)
- **Typical Range:** 4:00–7:00 (4–7 min/km)
- **Min Spread %:** 10% = 0.3 min/km threshold

### Cadence (spm)
- **Typical Range:** 160–190 spm
- **Min Spread %:** 10% = 3 spm threshold

### Ground Contact Time (GCT)
- **Typical Range:** 200–280 ms
- **Min Spread %:** 10% = 8 ms threshold

### Vertical Oscillation (VO)
- **Typical Range:** 6–10 cm
- **Min Spread %:** 10% = 0.4 cm threshold

### Stride Length
- **Typical Range:** 1.35–1.50 m
- **Min Spread %:** 10% = 0.015 m threshold

---

## 3. Elevation Graph Rules (Special Case)

### Elevation Data Sources (Priority Order)
1. **GPS Track Elevation:** `run.gpsTrack[].elevation` (preferred, highest accuracy)
2. **Altitude Array:** `run.altitudeData[]` (fallback, 2-second samples)
3. **Simulated from Pace Splits:** If no elevation data, derive from pace variation

### Elevation Axis Calculation
```typescript
// Server-side (TypeScript)
const rawGps = run.gpsTrack as any[];
const gpsElevData = rawGps?.length >= 2
  ? rawGps.map((p: any) => p.elevation ?? p.alt ?? p.altitude ?? null)
    .filter((v: any) => v !== null)
  : [];

if (gpsElevData.length >= 2) {
  // Use GPS elevation (most accurate)
  const min = Math.min(...gpsElevData);
  const max = Math.max(...gpsElevData);
  const range = max - min;
  
  // Normalize points to chart height
  const chartH = 140 * scale;  // e.g., 140px for 1.0 scale
  const points = gpsElevData.map(elev => 
    chartY + chartH - ((elev - min) / range) * chartH
  );
}
```

### Elevation Gain (Display)
- **Definition:** `elevationGain = max(altitudes) - min(altitudes)`
- **Use:** For the "Elevation Gain" metric card (not range, but actual climb)
- **Note:** Range-based visualization (min→max altitude) is different from cumulative gain

### Simulated Elevation (Fallback)
```typescript
// If no GPS elevation data but pace splits available
if (run.paceData && run.paceData.length >= 2) {
  const totalElevGain = run.elevationGain || run.elevation || 30;
  const paceVals = run.paceData.map((p) => p.paceSeconds);
  const minPace = Math.min(...paceVals);
  const maxPace = Math.max(...paceVals);
  const range = maxPace - minPace || 1;
  
  // Slower pace = uphill assumption
  const simElev = paceVals.map((p) => 
    ((p - minPace) / range) * totalElevGain
  );
}
```

### "No Data" Placeholder
If no elevation data available:
- Show placeholder card with message: "No data for this run"
- Do NOT force-render an empty chart

---

## 4. Chart Canvas Setup

### Canvas Dimensions (in Pixels)
- **Padding:** 40px on all sides
- **Chart Width:** `size.width - 80`
- **Chart Height:** `size.height - 80`

### Axis Positioning
```
┌──────────────────────────────────────┐
│  40px top padding                    │
│  ┌─────────────────────────────────┐ │
│  │ (40, 40) — axis start (top-left)│ │
│  │ Y-axis: vertical line from      │ │
│  │   (40, 40) to (40, H-40)        │ │
│  │ X-axis: horizontal line from    │ │
│  │   (40, H-40) to (W-40, H-40)    │ │
│  │                                  │ │
│  │ Data points scaled to:           │ │
│  │   x = padding + ((v - min) / r) × w │
│  │   y = H - p - ((v - min) / r) × h   │ │
│  └─────────────────────────────────┘ │
│  40px bottom padding                 │
└──────────────────────────────────────┘
```

### SVG Transform (for Stickers)
```xml
<!-- For mini charts inside sticker cards -->
<g transform="translate(px,py)">
  <g clip-path="url(#chartClip_...)">
    <polyline points="..." stroke="color" .../>
    <polygon points="..." fill="color" opacity="0.08"/>
  </g>
</g>
```

---

## 5. Android App Charts Available

### A. Heart Rate Zone vs Pace Chart (`HeartRateZonePaceChart`)
- **Type:** Scatter plot
- **X-axis:** Pace (min/km)
- **Y-axis:** Heart Rate (bpm)
- **Color:** Zone (Z1=blue, Z2=green, Z3=yellow, Z4=orange, Z5=red)
- **Size:** Training effect magnitude
- **Zones Formula:**
  ```kotlin
  val maxHr = (hrList.maxOrNull() ?: 185).coerceAtLeast(185)
  Z1: hr < 60% maxHr
  Z2: 60–70% maxHr
  Z3: 70–80% maxHr
  Z4: 80–90% maxHr
  Z5: ≥90% maxHr
  ```

### B. Heart Rate Efficiency (Correlation)
- **Type:** Scatter plot
- **X-axis:** Pace
- **Y-axis:** Heart Rate
- **Insight:** Are you working harder for the same pace? Elite runners have flat HR/pace ratio

### C. Cadence Analysis
- **Type:** Gauge + insights
- **Optimal Range:** 170–180 spm
- **Insights:**
  - <170: "Try increasing step rate"
  - 170–180: "Perfect zone"
  - >180: "Make sure you're not overstriding"

### D. Split Analysis
- **Type:** Bar comparison (first half vs second half)
- **Metrics:** Pace, HR, cadence per split
- **Verdict:** Negative split (strong finish) vs positive split (started too fast)

### E. Elevation Chart (from RunSummaryScreen)
- **Type:** Line chart
- **X-axis:** Time (min) or Distance (km)
- **Y-axis:** Altitude (m)
- **Formula:**
  ```kotlin
  val elevationSeries = buildSeries(run.routePoints, run.altitudeData)
  val minAlt = elevationSeries.y.minOrNull() ?: 0.0
  val maxAlt = elevationSeries.y.maxOrNull() ?: 0.0
  val range = maxAlt - minAlt  // For axis scaling
  ```

### F. Heart Rate Chart (from RunSummaryScreen)
- **Type:** Line chart
- **X-axis:** Time (min) or Distance (km)
- **Y-axis:** Heart Rate (bpm)
- **Axis:** Uses `calculateAxisConfig(hrValues, typicalMin=140, typicalMax=180, minSpreadPercentage=0.10)`

### G. Cadence Chart
- **Type:** Line chart
- **X-axis:** Time (min) or Distance (km)
- **Y-axis:** Cadence (spm)
- **Axis:** Uses `calculateAxisConfig(cadenceValues, typicalMin=160, typicalMax=190, minSpreadPercentage=0.10)`

### H. Pace Chart
- **Type:** Line chart
- **X-axis:** Time (min) or Distance (km)
- **Y-axis:** Pace (min/km)
- **Axis:** Uses `calculateAxisConfig(paceValues, typicalMin=4, typicalMax=7, minSpreadPercentage=0.10)`

---

## 6. Shared Image Creator Chart Stickers (Current)

### Available Sticker Types
| Widget ID | Type | Data Source | Axis Config |
|-----------|------|-------------|------------|
| `stat-distance` | Metric card | `run.distance` | N/A |
| `stat-duration` | Metric card | `run.duration` | N/A |
| `stat-pace` | Metric card | `run.avgPace` | N/A |
| `stat-heartrate` | Metric card | `run.avgHeartRate` | N/A |
| `stat-calories` | Metric card | `run.calories` | N/A |
| `stat-elevation` | Metric card | `run.elevationGain` | N/A |
| `chart-elevation` | **Mini chart** | GPS elevation or pace-derived | Smart margins (see below) |
| `chart-pace` | **Mini chart** | `run.paceData` | Smart margins |
| `chart-heartrate` | **Mini chart** | `run.heartRateData` | Smart margins |

### Mini Chart Dimensions (Server-Side)
```typescript
const chartW = Math.round(280 * scale);  // Width pixels
const chartH = Math.round(140 * scale);  // Height pixels
const paddingTop = 28;
const paddingBottom = 10;
const actualChartH = chartH - paddingTop - paddingBottom;
```

### Clipping
All mini charts have SVG `<clipPath>` to prevent overflow:
```xml
<defs>
  <clipPath id="chartClip_${x}_${y}_${w}_${h}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}"/>
  </clipPath>
</defs>
<g clip-path="url(#chartClip_...)">
  <polygon points="..."/>  <!-- Filled area -->
  <polyline points="..."/> <!-- Line -->
</g>
```

---

## 7. Implementation Checklist for Replit Server

- [ ] **Elevation Chart**
  - [ ] Try GPS track elevation first (`p.elevation ?? p.alt`)
  - [ ] Fall back to altitude array
  - [ ] Fall back to pace-derived simulation if no elevation data
  - [ ] Use smart margin algorithm with adjusted thresholds for vertical range
  - [ ] Ensure min/max elevation are correctly computed from data
  - [ ] Add SVG clipPath to prevent line/area overflow

- [ ] **Pace Chart**
  - [ ] Extract pace data from `run.paceData`
  - [ ] Apply smart margin axis config: `typicalMin=4, typicalMax=7, minSpreadPercentage=0.10`
  - [ ] Scale points correctly to chart space
  - [ ] Add SVG clipPath

- [ ] **Heart Rate Chart**
  - [ ] Extract HR data from `run.heartRateData`
  - [ ] Apply smart margin axis config: `typicalMin=140, typicalMax=180, minSpreadPercentage=0.10`
  - [ ] Handle max HR floor of 185 bpm
  - [ ] Scale points correctly
  - [ ] Add SVG clipPath

- [ ] **Visual Consistency**
  - [ ] Line width: 2.5px (stroke-width)
  - [ ] Line cap: round (stroke-linecap)
  - [ ] Line join: round (stroke-linejoin)
  - [ ] Filled area opacity: 0.08
  - [ ] Padding: top=28px, bottom=10px (inside chart bounds)
  - [ ] Color codes match Android theme

---

## 8. Coordinate Alignment (Native App Fix)

### Server Rendering
- Sticker x/y are **normalized coordinates** (0→1)
- Actual position: `px = x × 1080`, `py = y × 1920`
- Sticker placed at **top-left corner** `(px, py)`

### Android Overlay
- Must use **same normalized coordinates** for drag handle
- Do NOT center-offset the overlay
- Drag handle top-left should align with server's top-left

---

## 9. Transparent Background Toggle

### Model Update
```kotlin
data class PlacedSticker(
    val widgetId: String,
    val x: Float,
    val y: Float,
    val scale: Float = 1.0f,
    val transparentBackground: Boolean = false  // NEW
)
```

### Server Rendering
```typescript
const transBg = sticker.transparentBackground === true;
const bgRect = transBg ? "" : `<rect x="..." fill="${C.bgCard}" .../>`; 
const borderRect = transBg ? "" : `<rect x="..." fill="none" stroke="${C.border}" .../>`;
// Return only the chart line/area, no background
```

### Android UI
- Add toggle button to sticker overlay
- Icon: `Icons.Default.InvertColors`
- Highlighted when transparent = true
- Flips the flag and re-requests preview

---

## Files to Reference

- **Android Axis Logic:** `ui/components/GraphAxisUtils.kt`
- **Android Charts:** `ui/components/GarminGraphs.kt`, `ui/components/AdvancedRunCharts.kt`
- **Data Extraction:** `ui/extensions/RunSessionGraphHelpers.kt`
- **Share Image Server:** `server/share-image-service.ts` (buildMiniChart, buildStickerSvg)

