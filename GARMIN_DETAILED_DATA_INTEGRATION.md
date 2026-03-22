# Garmin Detailed Data Integration

## Overview

The Garmin integration has been enhanced to capture **comprehensive run session insights** instead of just basic summary data. This allows the AI Coach to provide detailed analysis and insights based on the complete run profile.

## What Changed

### Before
When a Garmin activity was synced, only **high-level summary data** was captured:
- Total distance
- Total duration
- Average heart rate
- Maximum heart rate
- Basic calories

**Result**: No pace charts, elevation profiles, HR zone data, or detailed coaching insights available.

### After
Now when a Garmin activity syncs, we capture **full session detail** including:

#### 📊 **Heart Rate Data**
- Minute-by-minute HR samples throughout the run
- Heart rate zones breakdown (zone 1-5)
- HR min/max/avg with temporal distribution
- Enables HR zone analysis and training intensity tracking

#### 🗺️ **GPS & Route Data**
- Complete GPS track with latitude/longitude samples
- Elevation profile (min/max/gain/loss per segment)
- Route polyline for map visualization
- Enables route analysis and elevation-based coaching

#### ⏱️ **Pace & Speed Data**
- Second-by-second pace samples
- Min/max/average pace metrics
- Enables pace distribution analysis and effort progression tracking

#### 📍 **Kilometer/Mile Splits**
- Per-split metrics:
  - Duration, distance, pace
  - Heart rate (min/max/avg)
  - Elevation gain/loss
  - Speed metrics
- Enables split analysis and consistency coaching

#### 🏃 **Running Dynamics**
- Vertical oscillation (body bounce)
- Ground contact time (GCT)
- Ground contact balance (asymmetry)
- Stride length trends
- Vertical ratio
- Enables form analysis and injury risk assessment

#### 💪 **Training Metrics**
- VO2 Max estimate
- Training effect score (aerobic/anaerobic)
- Recovery time recommendation
- Lactate threshold data (if available)
- Enables periodization and training load tracking

## Implementation Details

### New Files

**`server/garmin-activity-processor.ts`**
- Fetches complete activity details from Garmin API
- Converts Garmin data formats to AI Run Coach formats
- Stores detailed metrics in both:
  - `garminActivities` table (raw Garmin data with all fields)
  - `runs` table (normalized AI Run Coach format)

### Modified Files

**`server/garmin-push-service.ts`**
- Enhanced `processActivityPush()` to call detailed processor
- Now fetches full activity data instead of basic summary
- Saves all metrics to database for AI analysis

### Database Schema

#### `garminActivities` Table
Stores **raw Garmin API responses** with full detail:
```
- Heart rate zones (zone1-zone5 breakdown)
- GPS samples (timestamp, lat, lng, altitude, pace, HR)
- Splits array (per km/mile metrics)
- Power metrics (if available)
- Running dynamics (oscillation, GCT, etc)
- Raw data JSON (full API response)
```

#### `runs` Table
Stores **AI Run Coach normalized format**:
```
- heartRateData: { min, max, avg, samples[], zones }
- paceData: { avg, samples[] }
- gpsTrack: { samples[] with lat/lng/altitude }
- kmSplits: { splitNumber, distance, pace, HR, elevation }
- elevationGain, elevationLoss, minElevation, maxElevation
- cadence, maxCadence, avgStrideLength
- hasGarminData: true (flag for AI analysis)
```

## Data Flow

```
Garmin Watch Activity Complete
         ↓
Garmin Webhook Push
         ↓
POST /api/garmin/webhooks/activities
         ↓
processActivityPush()
         ↓
fetchCompleteGarminActivityDetail()
         ↓
Save to garminActivities table (raw data)
         ↓
Save to runs table (normalized data)
         ↓
AI Analysis reads runs.heartRateData, runs.kmSplits, etc.
         ↓
Generate detailed coaching insights
```

## AI Coach Benefits

With this data, the AI Coach can now:

### ❤️ **Heart Rate Analysis**
- "You spent 18min in zone 3 (tempo), which is excellent for building aerobic capacity"
- "Your HR recovered quickly from surges, showing good cardiovascular fitness"
- "Watch your HR spikes on those uphills - consider pacing the elevation"

### 🗺️ **Route & Elevation Analysis**
- "The 2km hill from 3-5km was your hardest effort - average pace dropped to 6:20/km"
- "Overall elevation gain of 185m - you tackled some significant terrain"
- "Your downhill running was controlled - nice form management"

### ⏱️ **Pace & Effort Analysis**
- "Positive split detected: you started at 5:45/km and finished at 6:12/km"
- "Excellent negative split! 6:10/km first half, 5:55/km second half - shows great pacing"
- "Your splits were very consistent (±4sec) - excellent race discipline"

### 📊 **Training Load & Recovery**
- "Training effect of 3.2 - moderate aerobic benefit"
- "Recovery time: 36 hours - take it easy tomorrow"
- "Estimated VO2 Max: 52 ml/kg/min - maintain your fitness with consistent runs"

### 🏃 **Form & Biomechanics**
- "Ground contact time increased slightly near the end - watch fatigue in your form"
- "Vertical oscillation stable throughout - good running economy"
- "Stride length variations suggest fatigue in the final km"

## Example Output

When a user views a Garmin-synced run, they now see:

```
📊 RUN SUMMARY
Distance: 10.5 km | Duration: 58:42 | Pace: 5:35/km
Heart Rate: 152 ± 18 bpm | Elevation: +185m | Calories: 742

📈 DETAILED METRICS
- Zone 1 (Easy): 5 min (8%)
- Zone 2 (Aerobic): 22 min (38%)
- Zone 3 (Tempo): 18 min (31%)
- Zone 4 (Threshold): 12 min (20%)
- Zone 5 (Max): 2 min (3%)

🏔️ ELEVATION PROFILE
[Graph showing elevation over distance]

💨 PACE ANALYSIS
Split 1 (1km): 5:45/km | HR: 142
Split 2 (1km): 5:41/km | HR: 151
Split 3 (1km): 5:48/km | HR: 158 [Hill]
... [all splits shown]

🎯 AI INSIGHTS
"Great aerobic work today! You spent most time in Zone 2-3, which builds 
endurance fitness. That hill at km 3-5 was challenging but you maintained 
consistent effort. Your pace stabilized in the final km despite fatigue, 
showing good mental strength. Recovery: take it easy tomorrow."
```

## API Integration

The Garmin API endpoints being leveraged:

**Activity Detail Endpoint**
```
GET ${GARMIN_CONNECT_API}/activity-service/activity/{activityId}
```

Returns comprehensive activity data including:
- All metrics mentioned above
- Lap/split breakdown
- GPS sample data (if available)
- Running dynamics
- Training effect scores

## Testing

To test with your existing Garmin activity:

1. **Check the run in your app** - Should now show detailed metrics
2. **Verify database** - Query `garminActivities` and `runs` tables for the activity
3. **Check run summary screen** - New charts and analytics should be visible
4. **Review AI coaching** - Should now include specific HR zone, pace, and elevation analysis

Example queries:
```sql
-- View stored Garmin activity detail
SELECT garmin_activity_id, splits, samples, heart_rate_zones 
FROM garmin_activities 
WHERE user_id = 'your-user-id' 
ORDER BY created_at DESC LIMIT 1;

-- View runs record with detailed data
SELECT id, heart_rate_data, pace_data, km_splits, elevation_gain, elevation_loss 
FROM runs 
WHERE external_source = 'garmin' 
ORDER BY completed_at DESC LIMIT 1;
```

## Future Enhancements

This foundation enables:

1. **Advanced Analytics Dashboard**
   - HR zone distribution charts
   - Pace progression graphs
   - Elevation profile visualization
   - Running dynamics trends over time

2. **Predictive Coaching**
   - Fatigue indicators based on HR variability
   - Injury risk assessment from running dynamics
   - Pacing recommendations based on terrain

3. **Training Plan Optimization**
   - Auto-adjust future workouts based on zone time
   - Recovery recommendations based on training effect
   - Periodization guidance from VO2 max estimates

4. **Social Features**
   - Detailed run comparisons with friends
   - Segment-based competitions
   - Form analysis sharing

5. **Wearable Integration**
   - Sync with other smartwatches (Apple Watch, Samsung, etc.)
   - Merge multiple data sources for comprehensive view
   - Cross-device consistency

## Troubleshooting

**Issue**: Run imported but with minimal data
- **Cause**: Garmin API didn't return detailed data
- **Solution**: Ensure activity has GPS track and was synced from watch

**Issue**: No heart rate zones showing
- **Cause**: Watch didn't calculate zones or missing HR data
- **Solution**: Verify run was completed with HR monitoring enabled

**Issue**: Missing elevation data
- **Cause**: Route didn't have elevation (flat course or indoor treadmill)
- **Solution**: This is expected for indoor runs

## References

- Garmin Connect API Docs: https://developer.garmin.com/
- Running Dynamics: https://www.garmin.com/en-US/insights/
- Heart Rate Zones: https://en.wikipedia.org/wiki/Heart_rate_zone
