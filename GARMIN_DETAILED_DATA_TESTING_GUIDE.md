# Testing Garmin Detailed Data Integration

## Quick Start

Your Saturday March 20th run has already synced with the new enhanced processor! Here's how to verify it's working:

## Step 1: Check the Database

### View the Garmin Activity Record
```sql
SELECT 
  garmin_activity_id,
  activity_name,
  duration_in_seconds,
  distance_in_meters,
  average_heart_rate,
  max_heart_rate,
  elevation_gain,
  elevation_loss,
  heart_rate_zones,
  splits,
  samples,
  created_at
FROM garmin_activities
WHERE user_id = (SELECT id FROM users WHERE email = 'danjohnston0701@gmail.com')
ORDER BY created_at DESC
LIMIT 1;
```

**What to look for:**
- ✅ `heart_rate_zones` should have zone1-zone5 breakdown
- ✅ `splits` should be an array of per-km metrics
- ✅ `samples` should have hundreds of GPS/HR samples
- ✅ `elevation_gain` and `elevation_loss` should be populated

### View the Runs Record with Enhanced Data
```sql
SELECT 
  id,
  external_id,
  external_source,
  distance,
  duration,
  avg_heart_rate,
  max_heart_rate,
  min_heart_rate,
  elevation_gain,
  elevation_loss,
  heart_rate_data,
  pace_data,
  gps_track,
  km_splits,
  has_garmin_data,
  created_at
FROM runs
WHERE user_id = (SELECT id FROM users WHERE email = 'danjohnston0701@gmail.com')
  AND external_source = 'garmin'
ORDER BY completed_at DESC
LIMIT 1;
```

**What to look for:**
- ✅ `has_garmin_data` = `true`
- ✅ `heart_rate_data` JSON contains:
  - `min`, `max`, `avg` values
  - `samples` array with HR samples over time
  - `zones` object with zone breakdown
- ✅ `pace_data` JSON contains:
  - `avg` pace
  - `samples` array showing pace variation
- ✅ `gps_track` JSON contains:
  - `samples` array with lat/lng/altitude/HR/pace for each point
- ✅ `km_splits` array with per-split breakdown

## Step 2: Verify App Display

### In the App (RunSummaryScreen)
1. Open the March 20th run in your app
2. Scroll through the summary - you should see:
   - ✅ **Heart Rate Chart** with zone visualization
   - ✅ **Elevation Profile** showing the terrain
   - ✅ **Pace Distribution** chart or graph
   - ✅ **Kilometer Splits** table
   - ✅ **Running Dynamics** (if watch recorded them)

3. Check the **AI Insights** section - should include specific analysis like:
   - "You spent 18 minutes in Zone 3 (Tempo)"
   - "Average elevation gain of 8.5% at km 3-5"
   - "Your pace was consistent (±30 sec variation)"

## Step 3: Test with a New Activity

Once you complete another run on your Garmin watch:

1. **Sync the activity** to your phone
2. **Wait 1-2 minutes** for the webhook to process
3. **Open the app** - new run should appear
4. **Check the data**:
   - Should see detailed charts/graphs immediately
   - AI insights should reference specific zones, pace, elevation
   - Run should be marked with `hasGarminData: true`

## Step 4: Test Different Run Types

Test with different scenarios to ensure robustness:

### ✅ Road Run (Outdoor, GPS)
- Should capture: Full GPS track, elevation, pace variation
- Expected: Complete data with all metrics

### ✅ Trail Run (Hilly)
- Should capture: Elevation profile, pace per segment
- Expected: High elevation gain/loss values

### ✅ Treadmill Run (Indoor, No GPS)
- Should capture: HR data, cadence, distance (from treadmill)
- Expected: No GPS, but all biomechanics data

### ✅ Group Run (Variable Pace)
- Should capture: Pace variation per split
- Expected: Large pace range, zone transitions

## Debugging

### If data is missing:

**Missing heart rate zones:**
- Check: Did the watch record HR during the run?
- Solution: Ensure HR monitoring is enabled on your Garmin

**Missing GPS samples:**
- Check: Did you run outdoors with GPS enabled?
- Solution: Outdoor runs only have GPS; treadmill runs won't have GPS

**Missing elevation:**
- Check: Is the route hilly or flat?
- Solution: Flat courses will show 0 elevation gain (this is correct)

**Missing splits:**
- Check: Are splits in the Garmin API response?
- Solution: Most activities have splits; check Garmin Connect web

### If the run isn't syncing at all:

**Check server logs:**
```bash
# Look for activity processing logs
grep "Processing ACTIVITY push" server-logs.txt
grep "Fetching detailed activity" server-logs.txt
grep "Successfully saved detailed Garmin activity" server-logs.txt
```

**Check webhook delivery:**
```sql
-- Verify webhook was received
SELECT * FROM webhook_failure_queue
WHERE webhook_type = 'activities'
ORDER BY created_at DESC
LIMIT 5;
```

**Manual re-trigger:**
```bash
# Use your Garmin reconnect flow to request a backfill
# This will re-push recent activities to the webhook
```

## Performance Considerations

The detailed data processing should take:
- **1-3 seconds** to fetch from Garmin API
- **1-2 seconds** to process and save to database
- **Total**: Less than 5 seconds from webhook receipt to data available

If it's taking longer:
- Check database connection/performance
- Verify network connectivity to Garmin API
- Check server logs for timeout errors

## Data Validation

To verify all fields are correct:

```sql
-- Check min/max values make sense
SELECT 
  external_id,
  distance,
  duration,
  avg_heart_rate,
  max_heart_rate,
  min_heart_rate,
  elevation_gain,
  cadence
FROM runs
WHERE external_source = 'garmin'
  AND has_garmin_data = true
ORDER BY completed_at DESC
LIMIT 5;

-- Verify: min_heart_rate <= avg_heart_rate <= max_heart_rate
-- Verify: cadence > 0 (usually 160-180 for running)
-- Verify: distance > 0 and duration > 0
```

## Next Steps

Once data is verified:

1. **Use detailed metrics in AI coaching** (next phase)
2. **Build visualization UI** for charts and graphs
3. **Add analytics/trends** across multiple runs
4. **Implement training plan adaptation** based on zone time
5. **Create segment/split analysis** features

## Questions?

Check the detailed documentation in `GARMIN_DETAILED_DATA_INTEGRATION.md` for comprehensive information about:
- What data is captured
- How it's stored
- How AI Coach uses it
- Future enhancement possibilities
