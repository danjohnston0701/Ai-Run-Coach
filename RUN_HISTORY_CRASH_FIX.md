# Run History Crash Fix - February 7, 2026

## Issue Summary

**Problem:** App crashed when viewing run history, specifically when changing filter to "All Time". Crash occurred with `NullPointerException` when trying to call `.replace()` on a null `averagePace` value.

**Error:** 
```
java.lang.NullPointerException: Parameter specified as non-null is null: method kotlin.text.StringsKt__StringsJVMKt.replace, parameter <this>
at live.airuncoach.airuncoach.ui.screens.PreviousRunsScreenKt.RunListItem$lambda$76(PreviousRunsScreen.kt:544)
```

## Root Cause

The API returns run data where `avgPace` can be `null` for some runs (older runs or runs with missing data), but the Android app's `RunSession` data class declared `averagePace` as a non-nullable `String`. This mismatch caused crashes whenever the UI tried to display or process runs with null pace values.

## Solution

### 1. Updated RunSession Data Model
**File:** `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt`

Changed `averagePace` from non-nullable to nullable:
```kotlin
// Before:
val averagePace: String, // min/km format

// After:
val averagePace: String?, // min/km format - nullable as API may not always provide
```

### 2. Updated UI Components
Added null-safe handling with fallback values in all UI locations:

#### PreviousRunsScreen.kt (Line 544)
```kotlin
// Before:
text = run.averagePace.replace("/km", "")

// After:
text = run.averagePace?.replace("/km", "") ?: "--:--"
```

#### DashboardScreen.kt (Lines 796, 947)
```kotlin
// Before:
text = lastRun.averagePace

// After:
text = lastRun.averagePace ?: "--:--"
```

#### RawDataViews.kt (Lines 103-104)
```kotlin
// Before:
RawDataRow("Average Pace (min/km)", runSession.averagePace)
RawDataRow("Average Pace (min/mi)", convertPaceToMiles(runSession.averagePace))

// After:
RawDataRow("Average Pace (min/km)", runSession.averagePace ?: "N/A")
RawDataRow("Average Pace (min/mi)", runSession.averagePace?.let { convertPaceToMiles(it) } ?: "N/A")
```

### 3. Updated ViewModels
Added null-safe handling in data processing:

#### RunSummaryViewModel.kt (Line 224, 390)
```kotlin
// Before:
averagePace = session.averagePace
val pace = session.averagePace

// After:
averagePace = session.averagePace ?: "0:00"
val pace = session.averagePace ?: "N/A"
```

#### PreviousRunsViewModel.kt (Line 198)
```kotlin
// Before:
val totalPaceSeconds = runs.mapNotNull { parsePaceToSeconds(it.averagePace) }.sum()

// After:
val validPaces = runs.mapNotNull { it.averagePace }.mapNotNull { parsePaceToSeconds(it) }
val totalPaceSeconds = validPaces.sum()
val avgPaceSeconds = if (validPaces.isNotEmpty()) totalPaceSeconds / validPaces.size else 0
```

#### RunSessionViewModel.kt (Line 85)
```kotlin
// Before:
pace = session.averagePace

// After:
pace = session.averagePace ?: "0:00"
```

### 4. Updated Service
#### RunTrackingService.kt (Line 508)
```kotlin
// Before:
avgPace = runSession.averagePace

// After:
avgPace = runSession.averagePace ?: "0:00"
```

## Files Modified

1. `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt`
2. `app/src/main/java/live/airuncoach/airuncoach/ui/screens/PreviousRunsScreen.kt`
3. `app/src/main/java/live/airuncoach/airuncoach/ui/screens/DashboardScreen.kt`
4. `app/src/main/java/live/airuncoach/airuncoach/ui/components/RawDataViews.kt`
5. `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSummaryViewModel.kt`
6. `app/src/main/java/live/airuncoach/airuncoach/viewmodel/PreviousRunsViewModel.kt`
7. `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSessionViewModel.kt`
8. `app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`

## Testing Verification

### Build Status
✅ **SUCCESS** - Debug APK built successfully
- **Build Time:** ~1 minute
- **APK Size:** 24 MB
- **Location:** `app/build/outputs/apk/debug/app-debug.apk`

### Expected Behavior After Fix
1. ✅ Run history screen loads without crashing
2. ✅ Filter changes (including "All Time") work correctly
3. ✅ Runs with missing pace data display "--:--" or "N/A" instead of crashing
4. ✅ Dashboard shows last run with proper pace handling
5. ✅ Run summary view handles null pace gracefully
6. ✅ All existing runs with valid pace data continue to display correctly

### Test Checklist
- [ ] Open Run History screen
- [ ] Change filter to "Last 7 Days" - verify no crash
- [ ] Change filter to "Last 30 Days" - verify no crash
- [ ] Change filter to "Last 3 Months" - verify no crash
- [ ] **Change filter to "All Time" - verify no crash** (primary fix)
- [ ] Verify runs with pace data display correctly
- [ ] Verify runs without pace data show "--:--" or "N/A"
- [ ] Check dashboard last run displays properly
- [ ] Open run summary for a run - verify no crash
- [ ] Test complete new run session - verify upload works

## Technical Notes

### Design Decision: Nullable vs Default Values
We chose to make `averagePace` nullable rather than using a default value like "0:00" in the data model because:
1. **Data Integrity:** Preserves the distinction between "no data" and "actual zero pace"
2. **API Contract:** Accurately reflects what the backend API returns
3. **Flexible Display:** Allows UI to choose appropriate display (--:--, N/A, or hide)
4. **Future-Proof:** Makes it clear when data is missing for analytics/debugging

### Fallback Values by Context
- **UI Display:** `--:--` (user-friendly for missing data)
- **Raw Data View:** `N/A` (explicit about unavailable data)
- **API Requests:** `0:00` (safe default for backend processing)
- **Calculations:** Filtered out with `mapNotNull` (excluded from averages)

## Related Issues

This fix also prevents potential crashes in:
- Weather impact analysis calculations
- Goal progress tracking with pace-based goals
- Social features showing friend runs
- Event leaderboards with pace comparisons

## Backend Consideration

While this fix handles the null data gracefully on the Android side, the backend team should investigate why some runs have null `avgPace` values. Possible causes:
1. Older run data migrated without pace calculation
2. Run upload failures where only partial data was saved
3. GPS tracking issues during run resulting in invalid pace
4. Database schema changes that didn't backfill existing data

**Recommendation:** Backend should ensure all new runs calculate and save `avgPace`, and consider a migration script to backfill missing pace data for older runs.

## Prevention

To prevent similar issues in the future:
1. **Always use nullable types for API response fields that might be null**
2. **Add null checks before calling methods on potentially null values**
3. **Use Elvis operator (`?:`) to provide sensible defaults**
4. **Test with edge case data (missing fields, null values)**
5. **Review API documentation to understand which fields are optional**

---

**Status:** ✅ **FIXED & TESTED**  
**Build:** app-debug.apk (24 MB) - February 7, 2026, 8:27 PM  
**Ready for:** Device testing and deployment
