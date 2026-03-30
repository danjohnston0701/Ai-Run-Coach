# iOS My Data Screen Implementation Brief

## Overview
Build a comprehensive analytics dashboard that displays personal running records, achievements, and performance trends over selectable time periods (1 Month, 3 Months, 6 Months, 1 Year).

---

## Screen Structure & Sections

### 1. **Header**
- Title: "My Data"
- Pull-to-refresh functionality to reload all data
- Show loading spinner during initial load

### 2. **Personal Records Section** 🏆
Display 6 standard race categories with personal best times:
- **1K** → personal best time
- **Mile** (1.609 km) → personal best time
- **5K** → personal best time
- **10K** → personal best time
- **Half Marathon** (21.1 km) → personal best time
- **Marathon** (42.2 km) → personal best time

**Each PB Row displays:**
- Category label (left)
- Best time (right, in primary color, bold) → Duration format: `HH:MM:SS` (hide HH if 0) or `MM:SS`
- Achievement date (right, below time, smaller, muted) → Format: `DD/MM/YYYY`
- If no PB exists: Show "Not set" (muted)
- Dividers between each row

**Design:**
- Cards with horizontal dividers
- Background secondary color
- Responsive 1-column layout

### 3. **All-Time Achievements Section** ⭐
Display 5 key achievement metrics:

| Icon | Metric | Value | Format |
|------|--------|-------|--------|
| 🔥 | Most Consecutive Runs | `mostConsecutiveRuns` | Integer (e.g., "42") |
| 📏 | Longest Run | `longestRunKm` | Decimal with 1 place (e.g., "21.5 km") |
| ⏱️ | Longest Run Time | `longestRunTimeSec` | Duration format: `HH:MM:SS` |
| ⛰️ | Highest Elevation | `highestElevationM` | Integer (e.g., "850 m") |
| 🎯 | Goals Achieved | `goalsAchieved` | Integer (e.g., "12") |

**Design:**
- Card with vertical dividers between items
- Icon + title (left) | Value (right, primary color, bold)
- Show "0" or "-" if no data

### 4. **Time Period Selector** 📈
Horizontal scrollable row of period buttons:
- **1M** (1 Month / 30 days)
- **3M** (3 Months / 90 days)
- **6M** (6 Months / 180 days)
- **1Y** (1 Year / 365 days)

**Design:**
- Selected button: Primary color background, white text
- Unselected: Tertiary background, secondary text
- Pill-shaped (rounded corners)
- Tappable, updates all trends/stats below

### 5. **Performance Trends Charts** 📊
Show up to 4 native bar charts (if data exists):

#### a) **⚡ Avg Pace (min/km)**
- Bars show progression of pace
- Lower values = better = GREEN to RED gradient (inverted)
- Red = slower pace (bad), Green = faster pace (good)

#### b) **❤️ Avg Heart Rate (bpm)**
- Red = lower HR (good), Green = higher HR (less efficient)
- Display unit: `bpm` (beats per minute)

#### c) **⛰️ Elevation Gain (m)**
- Green = more elevation (good), Red = less elevation
- Display unit: `m` (meters)

#### d) **👟 Avg Cadence (spm)**
- Red = lower cadence (bad), Green = higher cadence (good)
- Display unit: `spm` (steps per minute)

**Chart Features:**
- Native bar chart (no third-party libraries)
- Horizontal bars or vertical bars (artist's choice)
- **Y-axis labels:** Numeric scale (0, step, 2×step, 3×step, 4×step)
- **X-axis labels:** 
  - **1M/3M periods:** Week labels in format `DD/MM/YY` (e.g., "16/03/26", "23/03/26")
  - **6M/1Y periods:** Month labels in format `Mon YY` (e.g., "Oct 25", "Nov 25", "Dec 25")
- **Grouping:**
  - 1M & 3M: Average values grouped by **week**
  - 6M & 1Y: Average values grouped by **month**
- **Summary line at bottom:** `Min: X.X unit | N periods | Max: X.X unit`
- Color gradient (red to green) based on value range

### 6. **Period Statistics Section** 📈
Display statistics for the selected time period in 3 rows × 3 columns:

**Row 1: Key Metrics**
| Label | Value | Format |
|-------|-------|--------|
| Runs | `totalRuns` | Integer |
| Distance | `totalDistance` | Decimal 1 place + " km" |
| Elevation | `totalElevationGain` | Decimal 0 places + " m" |

**Row 2: Averages**
| Label | Value | Format |
|-------|-------|--------|
| Avg Pace | `averagePace` | String (e.g., "6:32/km") |
| Avg HR | `averageHeartRate` | Integer + " bpm" |
| Avg Cadence | `averageCadence` | Integer + " spm" |

**Row 3: Extremes**
| Label | Value | Format |
|-------|-------|--------|
| Longest | `longestRun` | Decimal 1 place + " km" |
| Total Calories | `totalCalories` | Integer |
| Consistency | `consistencyScore` | Decimal 0 places + "%" |

**Design:**
- 3×3 grid of stat cards
- Each card: Tertiary background, rounded corners
- Title (caption, muted) | Value (primary color, bold, large)
- Horizontal dividers between rows

---

## API Endpoints

### GET `/api/my-data/personal-bests`
**Response:**
```json
{
  "personalBests": [
    {
      "category": "1K",
      "duration": 300000,  // milliseconds
      "pace": "5:00",      // string, can be ignored
      "date": "2025-10-15"
    },
    // ... 6 categories total
  ]
}
```

### GET `/api/my-data/all-time-stats`
**Response:**
```json
{
  "totalRuns": 145,
  "totalDistanceKm": 892.5,
  "longestRunKm": 21.5,
  "longestRunTimeSec": 7890,
  "highestElevationM": 850,
  "mostConsecutiveRuns": 42,
  "goalsAchieved": 12
}
```

### GET `/api/my-data/period-stats?period=1M`
**Query Params:**
- `period`: `1M`, `3M`, `6M`, `1Y`

**Response:**
```json
{
  "totalRuns": 12,
  "totalDistance": 95.3,
  "totalElevationGain": 450.2,
  "averagePace": "6:32/km",
  "averageHeartRate": 165,
  "averageCadence": 182,
  "longestRun": 18.5,
  "totalCalories": 1250,
  "consistencyScore": 87.5
}
```

### GET `/api/my-data/trends?period=1M`
**Query Params:**
- `period`: `1M`, `3M`, `6M`, `1Y`

**Response:**
```json
{
  "pacesTrend": [
    { "date": "2025-03-16", "value": 6.42 },
    { "date": "2025-03-17", "value": 6.38 },
    // ... ordered by date
  ],
  "hrTrend": [
    { "date": "2025-03-16", "value": 168 },
    // ...
  ],
  "elevationTrend": [
    { "date": "2025-03-16", "value": 120 },
    // ...
  ],
  "cadenceTrend": [
    { "date": "2025-03-16", "value": 183 },
    // ...
  ]
}
```

---

## Data Structures

### PersonalBest
```
- category: String (e.g., "1K", "Mile", "5K", etc.)
- duration: Long (milliseconds)
- date: String (ISO format: yyyy-MM-dd)
- pace: String (optional, can ignore)
```

### TrendDataPoint
```
- date: String (ISO format: yyyy-MM-dd)
- value: Double
```

### GroupedTrendDataPoint
```
- label: String (week date or month name)
- value: Double (average of points in that period)
```

### TimePeriod
```
- 1M: 30 days
- 3M: 90 days
- 6M: 180 days
- 1Y: 365 days
```

---

## Key Formatting Rules

### Duration Formatting
- Input: milliseconds (for PBs) or seconds (for longest run time)
- Output: 
  - If hours > 0: `HH:MM:SS` (e.g., "2:34:15")
  - If hours = 0: `MM:SS` (e.g., "20:50")
  - For seconds only: `S s` (e.g., "45 s")

### Date Formatting
- Input: ISO format `yyyy-MM-dd`
- Output: `DD/MM/YYYY` (e.g., "15/10/2025")

### Week Labels (1M/3M periods)
- Format: `DD/MM/YY` for the Monday of that week
- Example: "16/03/26" (March 16, 2026 is a Monday)

### Month Labels (6M/1Y periods)
- Format: `Mon YY` using 3-letter month abbreviation
- Example: "Oct 25", "Nov 25", "Dec 25", "Jan 26"

---

## UI/UX Considerations

1. **Empty States:**
   - If no PBs: Show "Not set" for each category
   - If no achievements: Show "No achievements yet. Start running!"
   - If no trends for period: Show "No run data for this period. Complete a run to see your trends!"

2. **Color Scheme:**
   - Primary: CTA buttons, achieved values
   - Secondary: Card backgrounds
   - Tertiary: Stat card backgrounds
   - Muted: Secondary text, labels
   - Error (Red) & Success (Green): For trend gradients

3. **Responsive Design:**
   - Single column layout (scrollable)
   - Stat cards: 3-column grid on tablets, responsive
   - Charts: Full-width, vertically stacked

4. **Loading:**
   - Initial load: Show spinner in center
   - Pull-to-refresh: Show indicator at top
   - Partial loads (trend changes): Optional loading state

5. **Accessibility:**
   - All values have semantic labels
   - Color alone doesn't convey data (use text + numbers)
   - Proper text sizing for readability

---

## Implementation Checklist

- [ ] Pull-to-refresh functionality
- [ ] Time period selector buttons
- [ ] Personal Records section with 6 categories
- [ ] All-Time Achievements section with 5 metrics
- [ ] Period Statistics 3×3 grid
- [ ] 4 trend charts with grouping logic
- [ ] Y-axis labels with numeric scale
- [ ] X-axis labels (weeks for short periods, months for long)
- [ ] Color gradient calculations for bars
- [ ] Date/duration formatting utilities
- [ ] API integration for all 4 endpoints
- [ ] Error handling & empty states
- [ ] Loading states
- [ ] Responsive layout

---

## Notes for Developer

- The backend **automatically handles data aggregation and grouping**
- Your job is primarily **UI layout, formatting, and visualization**
- Charts are intentionally simple (native bars, no 3rd party) for performance
- All timestamps from backend are ISO format (`yyyy-MM-dd`)
- All distances in database are meters, but APIs return kilometers
- Duration values vary by endpoint (ms vs seconds) — see formatting rules above
