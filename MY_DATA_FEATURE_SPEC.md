# My Data Feature - Product Specification

## Overview

**My Data** is a comprehensive analytics and performance insights tab that displays personalized running metrics and trends. It allows users to view personal bests, period statistics, performance trends, and all-time achievements across multiple time periods (1 month, 3 months, 6 months, 1 year).

This feature provides market-leading running analytics with modern UI/UX patterns matching the Run Summary screen design.

## Key Features

### 1. Personal Records Section
Displays the user's fastest times for standard running distances:
- **1 Kilometer** - Fastest 1K time
- **5 Kilometer** - Fastest 5K time
- **10 Kilometer** - Fastest 10K time
- **Half Marathon (21.1km)** - Fastest HM time
- **Marathon (42.2km)** - Fastest marathon time

**Display Format:**
- Distance category label (e.g., "5K")
- Current personal best pace (mm:ss/km format)
- Distance of the run (e.g., "5.2 km")
- Date the PB was achieved (ISO format)

### 2. Period Statistics
Aggregated metrics for a selected time period (1 month, 3 months, 6 months, 1 year):

**Top Row - Key Totals:**
- Total Runs (count)
- Total Distance (km)
- Total Elevation Gain (meters)

**Second Row - Averages:**
- Average Pace (mm:ss/km)
- Average Heart Rate (bpm)
- Average Cadence (steps per minute)

**Third Row - Extremes:**
- Longest Run (km)
- Total Calories Burned (kcal)
- Consistency Score (0-100%, based on run frequency)

### 3. Time Period Selector
Horizontal scrollable pill buttons to switch between:
- **1 Month** (30 days) - Default selection
- **3 Months** (90 days)
- **6 Months** (180 days)
- **1 Year** (365 days)

The Period Statistics section updates dynamically when the user selects a different period.

### 4. Performance Trends
Visual trends for key metrics across all four time periods:

**Pace Trend** (⚡)
- Shows average pace progression across 1M, 3M, 6M, 1Y
- Direction indicator: ↑ (improving/faster), ↓ (declining/slower), → (stable)
- Lower pace = better performance

**Heart Rate Trend** (❤️)
- Shows average heart rate across time periods
- Direction indicator: ↓ (improving/lower), ↑ (declining/higher), → (stable)
- Lower HR = better fitness (more efficient running)

**Elevation Trend** (⛰️)
- Shows total elevation gain across time periods
- Direction indicator: ↑ (more elevation), ↓ (less elevation), → (stable)

**Cadence Trend** (👟)
- Shows average cadence (steps/min) across time periods
- Direction indicator: ↑ (increasing), ↓ (decreasing), → (stable)

### 5. All-Time Achievements
Lifetime statistics showcasing overall running history:
- **Total Runs** (count)
- **Total Distance** (km)
- **Total Time Running** (hours)
- **Total Calories Burned** (kcal)

## Data Requirements

### Backend API Endpoints

All endpoints require authentication (Bearer token in Authorization header).

#### GET `/api/my-data/personal-bests`
Returns array of personal best records.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "category": "5K",
      "pace": "4:30/km",
      "distance": 5.2,
      "duration": 1380000,
      "date": "2026-03-20",
      "runId": "run-uuid"
    }
  ]
}
```

#### GET `/api/my-data/statistics?days=30`
Returns aggregated statistics for specified day range.

**Query Parameters:**
- `days` (integer) - Number of days to look back (default: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRuns": 12,
    "totalDistance": 65.5,
    "totalDuration": 234000000,
    "totalElevationGain": 450.0,
    "averagePace": "4:35/km",
    "averageHeartRate": 155,
    "averageCadence": 175,
    "averageRunDuration": 19500000,
    "fastestRun": 4.2,
    "slowestRun": 8.5,
    "longestRun": 21.3,
    "totalCalories": 4200,
    "averageCalories": 350,
    "consistencyScore": 85.0
  }
}
```

#### GET `/api/my-data/trends`
Returns performance trends across all time periods.

**Response:**
```json
{
  "success": true,
  "data": {
    "paceTrend": [
      {
        "period": "MONTH",
        "value": 4.35,
        "trend": "↑"
      },
      {
        "period": "QUARTER",
        "value": 4.42,
        "trend": "↑"
      },
      {
        "period": "HALF_YEAR",
        "value": 4.50,
        "trend": "↑"
      },
      {
        "period": "YEAR",
        "value": 4.58,
        "trend": "↑"
      }
    ],
    "hrTrend": [...],
    "elevationTrend": [...],
    "cadenceTrend": [...]
  }
}
```

#### GET `/api/my-data/all-time-stats`
Returns lifetime achievement statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRuns": 187,
    "totalDistanceKm": 1245.8,
    "totalHours": 184.5,
    "totalCalories": 92400,
    "totalElevationGainM": 12500,
    "personalRecords": 6,
    "longestRunKm": 42.2,
    "fastestPaceMinPerKm": "3:45/km",
    "averagePaceMinPerKm": "4:52/km",
    "totalActiveCalories": 85200
  }
}
```

## UI/UX Design Specifications

### Layout & Navigation

**Screen Structure:**
- **Top Bar:** "My Data" title with standard app navigation
- **Time Period Selector:** Horizontal scrollable pills at top of content
- **Content:** Vertical scrolling LazyColumn containing sections below
- **Bottom Navigation:** Part of app's 6-tab navigation bar

### Section Styling

**Visual Hierarchy:**
1. **Section Headers** - Large, bold text with emoji icon (e.g., "🏆 Personal Records")
2. **Cards** - Background color `backgroundSecondary` with `16dp` border radius
3. **Dividers** - Light gray horizontal lines (`backgroundTertiary` color) between items
4. **Text Colors:**
   - Primary values: Primary accent color (bold, larger font)
   - Labels: Text muted color (smaller, lighter)
   - Secondary info: Text secondary color

### Component Spacing

- **Section vertical spacing:** `lg` (16dp)
- **Card padding:** `md` (12dp) internal, `md` external
- **Item padding:** `md` (12dp)
- **Divider margins:** `md` (12dp) horizontal padding
- **Row gaps:** `sm` (8dp)

### Color Palette

Use the app's standard Colors object:
- `Colors.primary` - Accent/highlight color for metrics
- `Colors.backgroundRoot` - Main screen background
- `Colors.backgroundSecondary` - Card backgrounds
- `Colors.backgroundTertiary` - Dividers, secondary backgrounds
- `Colors.textPrimary` - Main text
- `Colors.textSecondary` - Secondary text
- `Colors.textMuted` - Subtle text

### States & Interactions

**Loading State:**
- Show centered circular progress indicator
- Maintain background color consistency

**Empty State:**
- Show "No personal records yet. Keep running!" message
- Centered, compassionate messaging

**Error State:**
- Display user-friendly error message
- "Unable to load your data. Please check your connection."
- Maintain cached data if available (graceful degradation)

**Pull-to-Refresh:**
- Support swipe-down to refresh functionality
- Show refresh indicator at top
- Persist data while loading new data in background

### Typography

Use app's standard typography styles:
- **Headers:** `AppTextStyles.h2` / `AppTextStyles.h3` with bold weight
- **Body:** `AppTextStyles.body` for standard text
- **Captions:** `AppTextStyles.caption` for labels and subtle text
- **Font sizes:**
  - Stat values: 16sp, bold
  - Stat labels: 11sp, regular
  - Section headers: h3, bold

### Animation & Polish

- **Section appearances:** Smooth fade-in from LazyColumn scrolling
- **Dividers:** Simple horizontal lines, no animation
- **Transitions:** Smooth when switching time periods
- **Pull-to-refresh:** Standard Material Design animation

## Performance Considerations

### Caching Strategy

- **Cache TTL:** 5 minutes
- Only fetch new data if cache is older than TTL
- When switching time periods, always fetch new statistics
- Keep historical personal bests cached (rarely change)
- Keep all-time stats cached (append-only data)

### Data Loading

- Fetch all 4 data types in parallel:
  1. Personal bests
  2. Period statistics
  3. Performance trends
  4. All-time stats
- Wait for all to complete before showing UI
- Handle partial failures gracefully (show what you have, note missing sections)

### Network Optimization

- All metrics are calculated server-side
- Use `Locale.getDefault()` for number formatting
- Format strings once during rendering, not in loops
- Lazy load trend charts only when section is visible

## Data Models (iOS)

```swift
// MARK: - My Data Models

struct PersonalBest: Codable {
    let category: String         // "1K", "5K", "10K", "Half Marathon", "Marathon"
    let pace: String             // "mm:ss/km"
    let distance: Double         // km
    let duration: Long           // milliseconds
    let date: String             // ISO format date
    let runId: String            // reference to run
}

struct PeriodStatistics: Codable {
    let totalRuns: Int
    let totalDistance: Double    // km
    let totalDuration: Long      // ms
    let totalElevationGain: Double  // meters
    let averagePace: String      // "mm:ss/km"
    let averageHeartRate: Int    // bpm
    let averageCadence: Int      // steps/min
    let averageRunDuration: Long // ms
    let fastestRun: Double       // km
    let slowestRun: Double       // km
    let longestRun: Double       // km
    let totalCalories: Int
    let averageCalories: Int
    let consistencyScore: Float  // 0-100
}

struct PeriodData: Codable {
    let period: TimePeriod       // "MONTH", "QUARTER", "HALF_YEAR", "YEAR"
    let value: Double
    let trend: String            // "↑", "↓", "→"
}

struct PerformanceTrends: Codable {
    let paceTrend: [PeriodData]
    let hrTrend: [PeriodData]
    let elevationTrend: [PeriodData]
    let cadenceTrend: [PeriodData]
}

struct AllTimeStats: Codable {
    let totalRuns: Int
    let totalDistanceKm: Double
    let totalHours: Double
    let totalCalories: Int
    let totalElevationGainM: Double
    let personalRecords: Int
    let longestRunKm: Double
    let fastestPaceMinPerKm: String
    let averagePaceMinPerKm: String
    let totalActiveCalories: Int
}

enum TimePeriod: String, Codable {
    case month = "MONTH"
    case quarter = "QUARTER"
    case halfYear = "HALF_YEAR"
    case year = "YEAR"
    
    var label: String {
        switch self {
        case .month: return "1 Month"
        case .quarter: return "3 Months"
        case .halfYear: return "6 Months"
        case .year: return "1 Year"
        }
    }
    
    var days: Int {
        switch self {
        case .month: return 30
        case .quarter: return 90
        case .halfYear: return 180
        case .year: return 365
        }
    }
}
```

## ViewModel/State Management Pattern

**Observable State Properties:**
- `selectedTimePeriod` - Currently selected time period (default: 1 Month)
- `isLoading` - Boolean loading indicator
- `error` - Optional error message string
- `personalBests` - Array of PersonalBest
- `currentPeriodStats` - Optional PeriodStatistics
- `pacesTrend` - Array of PeriodData
- `hrTrend` - Array of PeriodData
- `elevationTrend` - Array of PeriodData
- `cadenceTrend` - Array of PeriodData
- `allTimeStats` - Dictionary of all-time statistics

**Observable Methods:**
- `selectTimePeriod(_ period: TimePeriod)` - Change time period and reload stats
- `refreshData()` - Manual refresh via pull-to-refresh

## Integration Checklist for iOS

- [ ] Create My Data tab in main navigation (appears in 6-tab bottom bar)
- [ ] Create MyDataScreen view with all 5 sections
- [ ] Implement TimePeriodSelector with pill buttons
- [ ] Create PersonalRecordsSection with dividers between items
- [ ] Create PeriodStatisticsSection with 3-row grid layout
- [ ] Create PerformanceTrendsSection with 4 metric cards
- [ ] Create AllTimeAchievementsSection with stacked items
- [ ] Implement EmptyStateCard for no data scenarios
- [ ] Add pull-to-refresh capability
- [ ] Integrate API endpoints in network layer
- [ ] Implement ViewModel with state management
- [ ] Add error handling and graceful degradation
- [ ] Add 5-minute cache for data freshness
- [ ] Test with various data scenarios (no data, one run, many runs)
- [ ] Match Android design aesthetic and spacing
- [ ] Verify date formatting across regions
- [ ] Test number formatting (pace, pace, elevation, etc.)

## Navigation

**Tab Title:** "My Data"
**Icon:** Chart/graph icon (same as Android)
**Position:** Third tab in bottom navigation bar
**Route:** `/my-data`

## Success Metrics

- Users can view personal bests for all 5 distance categories
- Period statistics update when selecting different time periods
- Trends show clear improvement/decline indicators
- All-time stats accurately reflect lifetime running history
- UI loads within 2 seconds on average network
- Data refreshes silently in background via caching strategy
- Error states don't crash or show blank screens

## Notes for iOS Developer

1. **Design Parity:** Match the Android implementation as closely as possible for consistent user experience across platforms
2. **Spacing:** Use safe area insets for notch handling
3. **Dark Mode:** Ensure colors adapt properly for dark/light mode
4. **Accessibility:** Add proper accessibility labels for VoiceOver
5. **Performance:** Lazy load trend charts if they impact initial render time
6. **Formatting:** Use locale-aware formatters for dates, numbers, and distances
7. **Caching:** Implement smart caching to avoid unnecessary API calls
8. **Testing:** Create mock data for various scenarios (new user, consistent runner, athlete with PBs)

## Future Enhancements (Post-MVP)

- Detailed pace progression chart (line graph over time)
- Elevation gain leaderboard across friends
- Running streaks and consistency badges
- Monthly/yearly comparison views
- Exportable running reports
- Integration with health insights (weather impact, recovery)
- Social sharing of achievements
- Predictive pace improvements based on trends
