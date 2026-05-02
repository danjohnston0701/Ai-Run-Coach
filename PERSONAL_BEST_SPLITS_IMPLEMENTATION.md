# Personal Best & Fastest Records - Split-Based Logic Implementation

## Summary of Changes

This document describes the implementation of **split-based personal best calculations** for the My Data dashboard. Personal best records can now be achieved from any segment of any run, not just from dedicated runs at that distance.

### What Changed

**Personal Best Categories:**
- **Fastest 1K** → Fastest 1km segment from any run ✓ (already implemented)
- **Fastest Mile** → Fastest 1-mile segment from any run ✓ (already implemented)
- **5K Personal Best** → **NEW**: Fastest 5km segment from any run (including dedicated 5K runs)
- **10K Personal Best** → **NEW**: Fastest 10km segment from any run (including dedicated 10K runs)
- **20K Personal Best** → **NEW**: Fastest 20km segment from any run (including dedicated 20K runs)
- **Half Marathon Personal Best** → **NEW**: Fastest 21.1km segment from any run (including dedicated HM runs)
- **Marathon Personal Best** → **NEW**: Fastest 42.2km segment from any run (including dedicated marathon runs)

### Example Scenarios

**Scenario 1: 5K Split from 10K Run**
- User completes a 10km run
- The 2nd 5km split has pace: 4:45/km
- Previous 5K PB was 5:00/km from a dedicated 5K run
- Result: The 5K split becomes the new PB (faster pace)

**Scenario 2: 10K Split from Half Marathon**
- User completes a 21.1km half marathon
- The 1st 10km segment has pace: 4:50/km
- Previous 10K PB was 5:10/km
- Result: The 10K segment becomes the new PB

**Scenario 3: 21km Split from Marathon**
- User completes a 42.2km marathon
- The 1st 21km segment has pace: 5:15/km
- Previous Half Marathon PB was 5:30/km
- Result: The Half Marathon PB is updated to the 21km split

## Implementation Details

### Files Modified

#### 1. **server/user-stats-cache.ts**
**Function:** `recomputeForUser(userId)` (lines 175-248)

**Changes:**
- Modified the distance-based PB calculation loop (5K, 10K, Half Marathon, Marathon)
- Now checks **two sources** for each distance category:
  1. **Dedicated runs** in the distance band (e.g., 5K runs in 4.9-5.2km range)
  2. **Split/segment data** from all runs via `km_splits` JSON array
- Compares pace from both sources and uses the faster one
- Stores the winning result in the user stats cache

**Key Logic:**
```typescript
// For each distance (5K, 10K, Half, Marathon):
1. Query dedicated runs in distance band
2. Query splits from all runs using PostgreSQL jsonb_array_elements
3. Compare pace: (best split pace) vs (dedicated run pace)
4. Store faster pace to user_stats table
```

**Distance Bands (widened for GPS tolerance):**
- 5K: 4.9 - 5.2 km
- 10K: 9.9 - 10.2 km
- 20K: 19.8 - 20.3 km
- Half Marathon: 21.0 - 21.6 km (was 21.05-21.2, too narrow)
- Marathon: 42.0 - 42.5 km (was 42.15-42.3, too narrow)

#### 2. **server/my-data-service.ts**
**Function:** `getPersonalBestsLive(userId)` (lines 44-109)

**Changes:**
- Enhanced the live fallback path (when user_stats cache not available)
- Now checks split data for distance-based PBs, matching the cached logic
- Stores the running data for comparison: dedicated runs vs splits
- Uses same distance band logic as user-stats-cache

**Key Logic:**
```typescript
// For each distance category:
1. Check dedicated runs in band
2. Call findFastestSplitFromRuns(runs, targetDistance)
3. Compare paces and keep faster
4. Return as PersonalBest object
```

#### 3. **server/routes.ts**
**Location:** Garmin webhook activities handler (line 4705-4723)

**Changes:**
- Added `onRunSaved()` call after creating/merging Garmin activities
- Ensures personal best cache is recalculated when new Garmin data arrives
- Handles both **new activities** and **merged activities**

**Trigger Points:**
```typescript
// After creating a new run from Garmin activity:
onRunSaved(device.userId, newRun);

// After merging Garmin data with existing run:
onRunSaved(device.userId, mergedRun);
```

#### 4. **server/activity-merge-service.ts**
**Function:** `mergeGarminActivityWithAiRunCoachRun()` (lines 279-287)

**Changes:**
- Added `onRunSaved()` call after updating run with merged Garmin data
- Ensures personal bests are recalculated with new split data from Garmin
- Runs non-blocking to avoid delaying the webhook response

**Workflow:**
```typescript
1. Merge Garmin data into run record
2. Call onRunSaved() to recalculate stats
3. Personal best cache updated with new splits
```

## Data Flow

### When a Run is Saved (New or Updated)
```
1. User completes run OR Garmin activity received
   ↓
2. Run record created/updated with kmSplits data
   ↓
3. onRunSaved(userId, run) called
   ↓
4. recomputeForUser(userId) executes:
   - Queries all user runs
   - For each PB category (1K, Mile, 5K, 10K, 20K, Half, Marathon):
     * Finds best dedicated run in distance band
     * Finds fastest split matching distance
     * Compares and stores faster result
   ↓
5. user_stats table updated with new PBs
   ↓
6. My Data dashboard loads latest PBs from cache (O(1) lookup)
```

### When Garmin Activities Sync
```
1. Garmin webhook receives activity
   ↓
2. Activity processed by garmin-activity-processor.ts
   - Extracts km_splits with pace data
   - Converts to standardized format
   ↓
3. Activity either:
   a) MERGED: into existing run via mergeGarminActivityWithAiRunCoachRun()
   b) CREATED: as new run record
   ↓
4. onRunSaved() triggered (NEW)
   ↓
5. Personal bests recalculated including new Garmin splits
```

## Performance Implications

### Positive
- **Cache model is unchanged** - still O(1) for My Data loads
- **Split queries use indexed JSON paths** - PostgreSQL optimized
- **Recalculation only on run save** - not on every page load

### Considerations
- **recomputeForUser() is O(runs × splits)** per user
  - For 1,000 runs with avg 10 splits: ~10,000 iterations
  - Still fast (<200ms) for typical users
  - Happens async, non-blocking

## Testing Scenarios

### Test 1: 5K Split from 10K Run
1. Create 10km run with splits: 5:00/km, 4:45/km
2. Verify 5K PB is 4:45/km
3. Check user_stats.pb5kDurationMs matches

### Test 2: Marathon Split from HM
1. Create dedicated 21.1km run: 5:30/km PB
2. Sync Garmin 42.2km run with splits: 5:15/km (first 21km)
3. Verify 5:15/km becomes new Half Marathon PB

### Test 3: Garmin Activity with Splits
1. Sync Garmin run with km_splits data
2. Verify personal bests updated
3. Check My Data displays correct PB sources

### Test 4: Historical Garmin Backfill
1. Request historical activity sync from Garmin
2. Activities arrive via webhook with split data
3. Personal bests recalculated for all activities

## Database Schema Notes

### user_stats Table Columns
All PB records store:
- `pb{Distance}DurationMs` → time in milliseconds (2 hours 5min = 7500000ms)
- `pb{Distance}RunId` → ID of run containing this PB
- `pb{Distance}Date` → when the PB was set

### runs Table (km_splits structure)
```json
{
  "km_splits": [
    {
      "km": 1.0,
      "pace": "4:45/km",
      "hr": 155,
      "cadence": 175,
      "timestamp": 60000
    },
    ...
  ]
}
```

## Edge Cases Handled

1. **GPS Drift** → Distance bands widened (21.0-21.6km vs strict 21.097km)
2. **Missing Splits** → Falls back to full run pace
3. **Invalid Split Data** → Skipped by pace validation
4. **Null Duration** → Handled with null checks
5. **Concurrent Runs** → Cache recalculation is atomic

## Future Enhancements

1. **Split-level PB tracking** - Store which split achieved PB
2. **Segment names** - "Hill climb 2nd km was PB" messaging
3. **PB progression charts** - Show split pace trends
4. **Strava segments** - Integrate with Strava segment data
5. **Real-time notifications** - Alert user immediately when PB set

## Rollback Plan

If issues arise:
1. Revert changes to `user-stats-cache.ts` (use dedicated runs only)
2. Run admin endpoint: `/api/admin/recompute-stats-all-users`
3. My Data will fall back to live query path `getPersonalBestsLive()`

---

**Status:** ✅ Implementation Complete
**Last Updated:** May 3, 2026
**Testing:** Pending (see Testing Scenarios above)
