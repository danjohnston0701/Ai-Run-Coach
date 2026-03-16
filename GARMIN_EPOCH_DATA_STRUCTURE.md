# Garmin Epoch Data Structure - Reference for iOS Implementation

## Overview
Garmin provides minute-by-minute activity data called "epochs". This document describes the data structure and how to integrate it into the iOS app.

## Epoch Data Types

### Raw Epochs (1-minute granularity)
**Database Table:** `garmin_epochs_raw`

Each epoch represents 1 minute of activity data.

```typescript
{
  id: string (UUID)
  userId: string
  
  // Time tracking
  epochDate: string           // YYYY-MM-DD
  startTimeInSeconds: integer // Unix timestamp for epoch start
  durationInSeconds: integer  // Usually 60 (1 minute)
  
  // Activity classification
  activityType: string        // WALKING | RUNNING | WHEELCHAIR_PUSHING | SEDENTARY
  intensity: string           // SEDENTARY | ACTIVE | HIGHLY_ACTIVE
  
  // Intensity metrics
  met: number                 // Metabolic equivalent (1.0 = resting, 50+ = max)
  meanMotionIntensity: number
  maxMotionIntensity: number
  
  // Activity details
  activeKilocalories: number
  activeTimeInSeconds: integer // ⭐ CRITICAL: Time spent in activity (NEW)
  steps: integer
  pushes: integer             // Wheelchair metric
  distanceInMeters: number
  pushDistanceInMeters: number // Wheelchair metric
  
  // Metadata
  summaryId: string
  startTimeOffsetInSeconds: integer // Timezone offset
  
  // Storage management
  createdAt: timestamp
  expiresAt: timestamp        // Auto-delete after 7 days
}
```

### Aggregated Epochs (daily summary)
**Database Table:** `garmin_epochs_aggregate`

Each record represents a full day of aggregated epoch data.

```typescript
{
  id: string (UUID)
  userId: string
  epochDate: string           // YYYY-MM-DD
  
  // Activity duration breakdown (seconds)
  sedentaryDurationSeconds: integer
  activeDurationSeconds: integer
  highlyActiveDurationSeconds: integer
  
  // Intensity distribution (seconds per intensity level)
  sedentaryIntensitySeconds: integer
  activeIntensitySeconds: integer
  highlyActiveIntensitySeconds: integer
  
  // Activity type breakdown (seconds per type)
  walkingSeconds: integer
  runningSeconds: integer
  wheelchairPushingSeconds: integer
  
  // Aggregated metrics
  totalMet: number
  averageMet: number
  peakMet: number
  
  averageMotionIntensity: number
  maxMotionIntensity: number
  
  // Totals for the day
  totalActiveKilocalories: number
  totalSteps: integer
  totalPushes: integer
  totalDistance: number
  totalPushDistance: number
  totalActiveTimeInSeconds: integer  // ⭐ CRITICAL: Total active time (NEW)
  
  // Epoch count (how many 1-min epochs in the day)
  totalEpochs: integer
  
  // Compressed storage
  compressedData: string      // gzip compressed JSON of all epochs
  
  createdAt: timestamp
  compressedAt: timestamp     // When data was compressed
}
```

## Key Fields for iOS Implementation

### Critical Fields (must handle)
- **`activeTimeInSeconds`**: Time spent in activity, excluding pauses
- **`activeKilocalories`**: Calories burned during activity
- **`steps`**: Step count for the epoch/day
- **`intensity`**: Activity intensity level (SEDENTARY/ACTIVE/HIGHLY_ACTIVE)
- **`activityType`**: Type of activity being tracked

### Data Aggregation Pattern
To calculate daily stats from raw epochs:

```swift
// From garmin_epochs_raw (1-minute data points):
let dailyStats = (
  totalActiveTime: rawEpochs.map(\.activeTimeInSeconds).reduce(0, +),
  totalSteps: rawEpochs.map(\.steps).reduce(0, +),
  totalActiveCalories: rawEpochs.map(\.activeKilocalories).reduce(0, +),
  activeMinutes: rawEpochs.filter({ $0.intensity != "SEDENTARY" }).count
)
```

## Storage Optimization Strategy

### Short-term (7 days): Keep raw data
- Store individual 1-minute epochs in `garmin_epochs_raw`
- Enables detailed visualization and analysis
- Automatically deleted after 7 days

### Long-term (forever): Keep aggregates
- Store daily summaries in `garmin_epochs_aggregate`
- Much smaller storage footprint
- Sufficient for long-term trend analysis
- Optionally compress using gzip (stored in `compressedData`)

## API Endpoints for iOS

### Fetch daily epoch summary
```
GET /api/users/{userId}/epochs/summary?date={YYYY-MM-DD}
```

**Response:**
```json
{
  "epochDate": "2026-03-16",
  "totalActiveTime": 45,
  "totalSteps": 8234,
  "totalActiveCalories": 450,
  "activeMinutes": 45,
  "intensity": {
    "sedentary": 840,
    "active": 180,
    "highlyActive": 120
  }
}
```

### Fetch 7-day epoch summary
```
GET /api/users/{userId}/epochs/summary?days=7
```

## Database Query Examples

### Get today's active time
```sql
SELECT SUM(active_time_in_seconds) as total_active_seconds
FROM garmin_epochs_raw
WHERE user_id = $1 
  AND epoch_date = TODAY()
  AND intensity != 'SEDENTARY';
```

### Get weekly active minutes
```sql
SELECT 
  DATE(created_at) as date,
  SUM(active_time_in_seconds) / 60 as active_minutes,
  SUM(steps) as total_steps
FROM garmin_epochs_raw
WHERE user_id = $1
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Get intensity distribution for a day
```sql
SELECT
  SUM(CASE WHEN intensity = 'SEDENTARY' THEN duration_in_seconds ELSE 0 END) as sedentary_seconds,
  SUM(CASE WHEN intensity = 'ACTIVE' THEN duration_in_seconds ELSE 0 END) as active_seconds,
  SUM(CASE WHEN intensity = 'HIGHLY_ACTIVE' THEN duration_in_seconds ELSE 0 END) as highly_active_seconds
FROM garmin_epochs_raw
WHERE user_id = $1 AND epoch_date = $2;
```

## Critical Implementation Notes for iOS

1. **activeTimeInSeconds is NEW**: This column was added in March 2026. Existing epochs may have 0 or NULL values
2. **Handle timezone offsets**: Use `startTimeOffsetInSeconds` to convert to local time
3. **Cache aggregated data**: Don't recalculate daily summaries from raw epochs; use `garmin_epochs_aggregate`
4. **Respect expiration**: Raw epochs expire after 7 days; plan accordingly
5. **Compressed data**: If using `compressedData`, decompress with gzip before parsing JSON

## Example iOS Model

```swift
struct EpochData {
  let id: String
  let epochDate: String  // YYYY-MM-DD
  let startTime: Int     // Unix timestamp
  
  let activityType: String  // WALKING, RUNNING, SEDENTARY
  let intensity: String     // SEDENTARY, ACTIVE, HIGHLY_ACTIVE
  
  let activeTimeSeconds: Int  // ⭐ Time spent in activity
  let steps: Int
  let caloriesBurned: Int
  let distance: Double
  
  var activeTimeMinutes: Int {
    activeTimeSeconds / 60
  }
  
  var isActiveMinute: Bool {
    intensity != "SEDENTARY"
  }
}

struct DailySummary {
  let date: String        // YYYY-MM-DD
  let totalActiveSeconds: Int
  let totalSteps: Int
  let totalCalories: Int
  
  var activeMinutes: Int {
    totalActiveSeconds / 60
  }
}
```

## Troubleshooting

### Missing activeTimeInSeconds values
- Check database migration was applied
- Run: `ADD_ACTIVE_TIME_TO_EPOCHS.sql`
- See: `GARMIN_SYNC_FIX_GUIDE.md`

### 0 values for newly synced epochs
- Normal for first 24 hours while data is being processed
- Garmin doesn't always include this field for all epochs
- Fall back to calculating from `durationInSeconds` if available

### Time zone issues
- Always use `startTimeOffsetInSeconds` when displaying times
- Store times in UTC in database, convert to local for display
