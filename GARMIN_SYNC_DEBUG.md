# Garmin Activity Sync Issue - Debug Guide

## The Problem

You have:
1. **Garmin Activity** in DB: `d32d5569-63d7-4c73-93f4-557c3a69f226`
2. **Run from AI App**: `b6821cd2-bf6e-402b-97f8-2e4904622bba`
3. **Duplicate Run**: `c347eb24-454a-41c9-ba75-912ec275c82d`
4. **Run in History**: Yet another record

This suggests the Garmin activity is not properly linked to the AI Run Coach runs.

## Root Causes

1. **Timing Mismatch** — The AI app created the run at one time, but the Garmin activity has a different start time (possibly due to timezone issues with NZST)
2. **Multiple Run Records** — Multiple runs may have been created from the same activity
3. **Missing Link** — The `garmin_activities.run_id` field may be null for your activity

## Debug SQL Queries

### 1. Check the Garmin Activity

```sql
SELECT 
  id, 
  run_id, 
  garmin_activity_id,
  user_id,
  activity_name,
  start_time_in_seconds,
  duration_in_seconds,
  distance_in_meters,
  created_at,
  updated_at
FROM garmin_activities
WHERE id = 'd32d5569-63d7-4c73-93f4-557c3a69f226';
```

**Expected:** See the `run_id` field - is it NULL or does it reference one of your run IDs?

### 2. Check All Related Runs

```sql
SELECT 
  id,
  user_id,
  distance,
  duration,
  avg_pace,
  created_at,
  completed_at,
  garmin_activity_id,
  has_garmin_data,
  external_id,
  external_source
FROM runs
WHERE id IN ('b6821cd2-bf6e-402b-97f8-2e4904622bba', 'c347eb24-454a-41c9-ba75-912ec275c82d')
ORDER BY created_at DESC;
```

**Expected:** See what `garmin_activity_id` each run has (may be NULL or could already be set)

### 3. Check Garmin Activity Time Range

```sql
SELECT 
  id,
  start_time_in_seconds,
  TO_TIMESTAMP(start_time_in_seconds) as start_time_utc,
  duration_in_seconds,
  TO_TIMESTAMP(start_time_in_seconds + duration_in_seconds) as end_time_utc,
  distance_in_meters,
  run_id
FROM garmin_activities
WHERE id = 'd32d5569-63d7-4c73-93f4-557c3a69f226';
```

### 4. Check AI Run Coach Created Times

```sql
SELECT 
  id,
  created_at,
  completed_at,
  duration,
  distance,
  garmin_activity_id
FROM runs
WHERE user_id = (SELECT user_id FROM garmin_activities WHERE id = 'd32d5569-63d7-4c73-93f4-557c3a69f226')
  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY created_at DESC
LIMIT 10;
```

## The Timeline Issue (NZST)

You mentioned:
- **Run started:** Yesterday at 7am NZST
- **Current time:** Likely UTC or another timezone

NZST is UTC+13 (daylight saving) or UTC+12 (standard). This means:
- 7am NZST yesterday = 6pm UTC day-before (or similar)

If the Garmin activity timestamp doesn't match within the ±20 minute window that the sync endpoint uses, it won't be matched!

### Specific Fix

The sync endpoint in routes.ts (line 2972) searches with:
```typescript
const searchStartSec = Math.floor(runStartTime.getTime() / 1000) - TWENTY_MINS_S;
const searchEndSec   = Math.floor(runEndTime.getTime()   / 1000) + TWENTY_MINS_S;
```

If your Garmin activity's `start_time_in_seconds` falls outside this ±20 minute window, it won't match.

## Solution Steps

### Immediate Fix (Manual Database Update)

Once you've run the debug queries and identified the issue:

```sql
-- If the Garmin activity's run_id is NULL, link it to the correct run:
UPDATE garmin_activities
SET run_id = 'b6821cd2-bf6e-402b-97f8-2e4904622bba'
WHERE id = 'd32d5569-63d7-4c73-93f4-557c3a69f226';

-- Verify the update
SELECT * FROM garmin_activities
WHERE id = 'd32d5569-63d7-4c73-93f4-557c3a69f226';
```

### If Timestamps Don't Match

If the times are off by more than 20 minutes:

```sql
-- Option 1: Update the run's created_at to match Garmin's start time
UPDATE runs
SET created_at = TO_TIMESTAMP(
  (SELECT start_time_in_seconds FROM garmin_activities WHERE id = 'd32d5569-63d7-4c73-93f4-557c3a69f226')
)
WHERE id = 'b6821cd2-bf6e-402b-97f8-2e4904622bba';

-- Option 2: Or update the run's garmin_activity_id directly
UPDATE runs
SET garmin_activity_id = 'd32d5569-63d7-4c73-93f4-557c3a69f226'
WHERE id = 'b6821cd2-bf6e-402b-97f8-2e4904622bba';

-- AND set the enrichment flags
UPDATE runs
SET has_garmin_data = true,
    external_id = 'd32d5569-63d7-4c73-93f4-557c3a69f226',
    external_source = 'garmin'
WHERE id = 'b6821cd2-bf6e-402b-97f8-2e4904622bba';
```

### Handling Duplicate Runs

If you have 3 run records from the same activity:

```sql
-- Find the best one (most complete)
SELECT id, distance, duration, created_at, garmin_activity_id
FROM runs
WHERE id IN ('b6821cd2-bf6e-402b-97f8-2e4904622bba', 'c347eb24-454a-41c9-ba75-912ec275c82d')
ORDER BY distance DESC, duration DESC;

-- Keep the one with most data, link Garmin activity to it
UPDATE garmin_activities
SET run_id = 'b6821cd2-bf6e-402b-97f8-2e4904622bba'
WHERE id = 'd32d5569-63d7-4c73-93f4-557c3a69f226';

-- Delete the duplicates (be careful!)
-- DELETE FROM runs WHERE id IN ('c347eb24-454a-41c9-ba75-912ec275c82d');
```

## Why This Happened

1. **Timezone Confusion** — The AI app may be creating runs in local time (NZST) but storing in UTC inconsistently
2. **Webhook Delay** — Garmin activity arrived via webhook after the sync was attempted
3. **Multiple Uploads** — The run may have been uploaded multiple times, creating duplicate records

## Prevention

1. **Fix Timezone Handling** — Ensure all timestamps use UTC consistently
2. **Upsert Pattern** — Use database UPSERT to merge duplicate runs from the same activity
3. **Broader Time Window** — Increase the ±20 minute sync window in the endpoint (currently hardcoded)
4. **Activity De-duplication** — Check for existing runs before creating new ones

## Code Changes Needed

### server/routes.ts (line 3057)

```typescript
// Current: 20 minutes
const TWENTY_MINS_S = 20 * 60;

// Change to: 2 hours (more forgiving)
const TWO_HOURS_S = 2 * 60 * 60;
const searchStartSec = Math.floor(runStartTime.getTime() / 1000) - TWO_HOURS_S;
const searchEndSec   = Math.floor(runEndTime.getTime()   / 1000) + TWO_HOURS_S;
```

This would help catch activities that have significant timing variations.

## Next Steps

1. **Run the debug queries above** to understand your specific data state
2. **Report back** with the results
3. **Apply the appropriate fix** based on what we find
4. **Implement prevention** in the code to avoid future duplicates
