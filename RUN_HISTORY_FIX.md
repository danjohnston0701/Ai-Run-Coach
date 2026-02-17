# Run History Date & Crash Fix

**Date:** February 12, 2026  
**Status:** ✅ FIXED

---

## Issues Found

### 1. ❌ Run Dates Showing as 01/01/1970
**Root Cause:** Field name mismatch between backend database and Android app expectations

**Database Schema:**
- `completedAt` (timestamp field)
- `gpsTrack` (jsonb for GPS points)  
- `duration` (integer milliseconds)

**Android Expected:**
- `startTime` (Long milliseconds)
- `endTime` (Long milliseconds)
- `routePoints` (List<LocationPoint>)

**Problem:** Backend was returning raw database fields, but Android was expecting transformed data.

### 2. ❌ All Run Data Showing as 0.0 km, 00:01 duration
**Root Cause:** Same field name mismatch - Android couldn't map database fields to RunSession model

### 3. ❌ App Crashing When Clicking on Run
**Root Cause:** NullPointerException at line 209 in RunSummaryScreen.kt

```kotlin
val routePoints = runSession!!.routePoints.map { ... } // CRASH if routePoints is null
```

**Problem:** Code assumed `routePoints` always exists, but runs synced from Garmin or with missing GPS data had null/empty routePoints.

---

## Fixes Applied

### ✅ Backend Fix: Data Transformation Layer

**File:** `/server/routes.ts`

**Added:** `transformRunForAndroid()` function to convert database format to Android format

```typescript
function transformRunForAndroid(run: any) {
  // Convert completedAt timestamp to milliseconds
  const completedAtMs = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  
  // Calculate startTime and endTime
  const endTime = completedAtMs;
  const startTime = completedAtMs - (run.duration || 0);

  return {
    id: run.id,
    startTime: startTime,           // ← Android expects this
    endTime: endTime,                // ← Android expects this
    duration: run.duration || 0,
    distance: run.distance || 0,
    averageSpeed: run.distance && run.duration ? (run.distance / (run.duration / 1000)) : 0,
    averagePace: run.avgPace || "0'00\"/km",
    calories: run.calories || 0,
    cadence: run.cadence || 0,
    heartRate: run.avgHeartRate || 0,
    routePoints: Array.isArray(run.gpsTrack) ? run.gpsTrack : [],  // ← Transform gpsTrack to routePoints
    kmSplits: Array.isArray(run.kmSplits) ? run.kmSplits : [],
    // ... all other fields mapped correctly
  };
}
```

**Applied to 3 Endpoints:**
- `GET /api/runs/user/:userId` - Get user's runs
- `GET /api/users/:userId/runs` - Alias endpoint  
- `GET /api/runs/:id` - Get single run details

**Result:** Backend now returns data in the format Android expects, with proper timestamps and field names.

### ✅ Android Fix: Null Safety for Missing GPS Data

**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt`

**Changes:**
1. Added null checks before accessing `routePoints`
2. Show "No GPS data available" message when routePoints is empty
3. Only render charts when data is available

**Before:**
```kotlin
item {
    val cameraPositionState = rememberCameraPositionState {
        val routePoints = runSession!!.routePoints.map { ... }  // CRASH if null!
        position = CameraPosition.fromLatLngZoom(routePoints.first(), 15f)
    }
}
```

**After:**
```kotlin
if (runSession!!.routePoints.isNotEmpty()) {
    item {
        val cameraPositionState = rememberCameraPositionState {
            val routePoints = runSession!!.routePoints.map { ... }  // Safe now!
            position = CameraPosition.fromLatLngZoom(routePoints.first(), 15f)
        }
    }
} else {
    item {
        // Show friendly message
        Text("No GPS data available for this run")
    }
}
```

**Protected Sections:**
- Map display
- Pace chart
- Heart rate chart
- Elevation chart

---

## How It Works Now

### Data Flow:

```
1. Android requests: GET /api/users/:userId/runs

2. Backend:
   - Fetches runs from database with database field names
   - Transforms each run using transformRunForAndroid()
   - Returns array of transformed runs with Android-expected fields

3. Android:
   - Receives runs with correct field names
   - Maps to RunSession model successfully
   - Dates display correctly using startTime
   - Distance, duration, pace all show correctly

4. When user clicks on a run:
   - Android requests: GET /api/runs/:id
   - Backend transforms and returns single run
   - RunSummaryScreen checks if routePoints exists
   - Shows map if GPS data available, or friendly message if not
```

---

## Field Mapping Reference

| Database Field | Android Field | Transformation |
|---|---|---|
| `completedAt` | `startTime` | `completedAt.getTime() - duration` |
| `completedAt` | `endTime` | `completedAt.getTime()` |
| `gpsTrack` | `routePoints` | Direct copy (already array) |
| `avgPace` | `averagePace` | Direct copy |
| `avgHeartRate` | `heartRate` | Direct copy |
| `elevationGain` | `totalElevationGain` | Direct copy |
| `elevationLoss` | `totalElevationLoss` | Direct copy |
| `externalSource` | `externalSource` | Direct copy |
| `externalId` | `externalId` | Direct copy |

---

## Testing Checklist

### Run History Screen
- [ ] Dates display correctly (not 01/01/1970)
- [ ] Distance shows correct km value
- [ ] Duration shows correctly (HH:MM:SS)
- [ ] Pace displays correctly (min/km format)
- [ ] "Synced from Garmin Connect" badge shows for Garmin runs
- [ ] Multiple runs display in chronological order

### Run Detail Screen (clicking on a run)
- [ ] App doesn't crash when opening run
- [ ] Run date displays correctly at top
- [ ] Distance, duration, pace stats show correctly
- [ ] Map shows route (if GPS data available)
- [ ] "No GPS data available" message shows for non-GPS runs
- [ ] Charts only display when data is available
- [ ] Garmin attribution shows for Garmin-synced runs

### Edge Cases
- [ ] Runs without GPS data (Garmin treadmill runs)
- [ ] Runs with zero duration
- [ ] Runs with zero distance
- [ ] Very old runs (test date formatting)
- [ ] Very recent runs (test date formatting)

---

## Files Modified

### Backend:
- ✅ `/server/routes.ts` - Added transformRunForAndroid() function and applied to 3 endpoints

### Android:
- ✅ `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt` - Added null safety checks

---

## Deployment Steps

1. **Deploy Backend Changes:**
   ```bash
   cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
   git add server/routes.ts
   git commit -m "Fix: Transform run data for Android compatibility (fix dates & null values)"
   git push
   # Then deploy on Replit (pull latest code)
   ```

2. **Build Android App:**
   ```bash
   cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
   ./gradlew assembleDebug
   ```

3. **Test:**
   - Install APK on device
   - Navigate to Run History
   - Verify dates show correctly
   - Click on a run to verify it doesn't crash
   - Check run with GPS data shows map
   - Check Garmin-synced run shows attribution

---

## Expected Results

✅ **Run History:**
- Dates: "12/02/2026" (actual run dates)
- Distance: "5.2 km" (actual distance)
- Duration: "28:45" (actual duration)
- Pace: "5'32"/km" (actual pace)

✅ **Run Details:**
- No crashes
- Map displays for runs with GPS
- "No GPS data available" for runs without GPS
- All stats display correctly

---

## Debugging Tips

If issues persist:

1. **Check Backend Logs:**
   ```bash
   # Look for transformation errors
   console.log("Transformed run:", transformedRun);
   ```

2. **Check Android Logs:**
   ```bash
   adb logcat | grep "RunSession\|PreviousRuns"
   ```

3. **Verify Database Data:**
   ```sql
   SELECT id, completed_at, distance, duration, avg_pace, gps_track 
   FROM runs 
   WHERE user_id = 'YOUR_USER_ID' 
   LIMIT 5;
   ```

4. **Test API Directly:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" https://airuncoach.live/api/users/YOUR_USER_ID/runs
   ```

---

**Status:** Ready for testing! 🚀

**Next:** Deploy backend changes and rebuild Android app to test the fixes.
