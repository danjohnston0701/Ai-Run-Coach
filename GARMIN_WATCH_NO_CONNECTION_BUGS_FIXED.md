# Bug Fixes: Saving Runs Without Garmin Watch Connected

## Overview
Fixed multiple race conditions and crash scenarios that could occur when saving a run session without a Garmin watch connected to the phone, or when a watch disconnects mid-session.

---

## Bugs Found and Fixed

### 1. **Auth Token Validation Crash (RunSessionScreen.kt)** ✅ FIXED
**Location**: `RunSessionScreen.kt`, lines 175-199

**Issue**: When auth validation failed (HTTP 404 on `/api/users/me`), the screen would call `onCancel()` but pending `prepareRun()` coroutines would continue executing, attempting to update UI state on a disposed screen.

**Scenario**: 
- User taps "Start Run"
- No Garmin watch is connected
- Auth token validation fails
- Screen attempts to navigate back
- `prepareRun()` coroutines still running in background → crash

**Fix Applied**:
- Added `viewModel.cancelRunSetup()` call BEFORE `onCancel()` navigation
- This sets a flag (`isSetupCancelled = true`) that prevents pending coroutines from updating UI state
- Protects against "Update UI on disposed screen" crashes

---

### 2. **Race Condition: Watch Disconnection During Run Save** ⚠️ CRITICAL ✅ FIXED
**Location**: `RunTrackingService.kt`, lines 2545-2554

**Issue**: TOCTOU (Time-of-Check-Time-of-Use) race condition where the watch could disconnect between checking `isWatchConnected` and calling `getConnectedDeviceName()`.

```kotlin
// BEFORE (BUGGY):
val isWatchRun = garminWatchManager?.isWatchConnected?.value == true
val deviceName = if (isWatchRun) garminWatchManager?.getConnectedDeviceName() else null
// ↑ Watch could disconnect here!
```

**Scenario**:
- Run is being saved
- Watch connection status is checked (true)
- Watch disconnects
- `getConnectedDeviceName()` called on disconnected device → potential crash/null

**Fix Applied**:
```kotlin
// AFTER (SAFE):
val isWatchRun = garminWatchManager?.isWatchConnected?.value == true
val deviceName = if (isWatchRun) {
    try {
        garminWatchManager?.getConnectedDeviceName()
    } catch (e: Exception) {
        Log.w("RunTrackingService", "Failed to get connected device name (watch may have disconnected): ${e.message}")
        null
    }
} else null
```

---

### 3. **SDK Callback Race: Handlers Assigned After Initialization** ⚠️ CRITICAL ✅ FIXED
**Location**: `RunTrackingService.kt`, lines 539-576

**Issue**: ConnectIQ SDK callbacks could fire before handler functions were assigned, causing NullPointerException.

```kotlin
// BEFORE (BUGGY):
garminWatchManager = GarminWatchManager(this)
garminWatchManager?.initialize()  // ← SDK may fire callbacks immediately!
garminWatchManager?.onWatchCommand = { action -> ... }  // ← Handlers set AFTER
garminWatchManager?.onWatchGpsUpdate = { ... }
garminWatchManager?.onWatchSensorData = { ... }
```

**Scenario**:
- Run starts
- Watch connects and sends GPS/sensor data immediately
- SDK fires callbacks before handlers are assigned
- `onWatchGpsUpdate` callback is null → NullPointerException

**Fix Applied**:
```kotlin
// AFTER (SAFE):
garminWatchManager = GarminWatchManager(this)
garminWatchManager?.let { manager ->
    manager.onWatchCommand = { action -> ... }      // ← Set handlers FIRST
    manager.onWatchGpsUpdate = { lat, lng, altM, speedMs -> ... }
    manager.onWatchSensorData = { frame -> ... }
    manager.initialize()  // ← Then initialize
}
```

---

### 4. **Watch Data Injection Without Active Session** ✅ FIXED
**Location**: `RunTrackingService.kt`, lines 1730 & 1756

**Issue**: Watch GPS and sensor data could be injected even after the run session was ended or null, causing potential NullPointerException.

**Scenario**:
- Run is stopped/saved
- Watch sends GPS or sensor data (with 2-second delay)
- `_currentRunSession.value` is already null
- Attempt to update null session → crash

**Fix Applied**:
Added null checks in both functions:
```kotlin
fun injectWatchLocation(...) {
    if (!isTracking || _currentRunSession.value == null) {
        Log.d("RunTrackingService", "Ignoring watch GPS injection: isTracking=$isTracking, sessionExists=${_currentRunSession.value != null}")
        return
    }
    // ... safe to inject
}

private fun updateWatchSensorData(frame: WatchBiometricFrame) {
    if (!isTracking || _currentRunSession.value == null) {
        Log.d("RunTrackingService", "Ignoring watch sensor data: isTracking=$isTracking, sessionExists=${_currentRunSession.value != null}")
        return
    }
    // ... safe to update
}
```

---

### 5. **Watch Teardown vs Upload Race** ✅ HARDENED
**Location**: `RunTrackingService.kt`, lines 2777-2784

**Issue**: While `uploadRunToBackend()` is running (10+ seconds), `onDestroy()` could be called and shutdown the Garmin manager, potentially interrupting the notification to the watch.

**Scenario**:
- Run being saved
- Upload to backend in progress (slow network)
- App destroyed (rotation, memory pressure, etc.)
- `onDestroy()` calls `garminWatchManager?.shutdown()`
- Watch doesn't receive "session ended" message → inconsistent state

**Fix Applied**:
```kotlin
override fun onDestroy() {
    // ... cleanup ...
    try {
        if (garminWatchManager?.isWatchConnected?.value == true) {
            Log.d("RunTrackingService", "Notifying watch of session end...")
            garminWatchManager?.sendSessionEnded()
        }
        garminWatchManager?.shutdown()
        Log.d("RunTrackingService", "GarminWatchManager shutdown complete")
    } catch (e: Exception) {
        Log.w("RunTrackingService", "GarminWatchManager shutdown error (non-fatal): ${e.message}")
    }
}
```

**Note**: 
- `sendSessionEnded()` is now only called if watch is actually connected
- Better logging for debugging
- Try-catch ensures shutdown errors don't cause secondary crashes
- Upload happens in `finally` block before `stopSelf()`, so teardown happens naturally

---

## Related Fix in RunSessionViewModel

### Added Cancellation Safety for Run Setup ✅ FIXED
**Location**: `RunSessionViewModel.kt`, lines 356, 366-369, 380-385, etc.

Added `isSetupCancelled` flag to prevent state updates from pending coroutines after setup cancellation:
- Flags are checked at multiple points to exit gracefully
- Prevents UI updates on disposed screens
- Handles both successful and failed auth validation

---

## Testing Recommendations

### Test Case 1: No Watch Connected
```
1. Open app without Garmin watch connected
2. Attempt to prepare a run
3. Expected: Screen loads without auth errors (or auth fails gracefully)
4. Expected: No crashes
```

### Test Case 2: Watch Disconnects During Run Save
```
1. Start a run with watch connected
2. During the run, disconnect the watch
3. Stop the run and save
4. Expected: No crash when getting device name
5. Expected: hasGarminData = false in uploaded run
6. Expected: Clear logs about watch disconnection
```

### Test Case 3: Watch Disconnects During Setup
```
1. Open run prep screen with watch connected
2. Watch disconnects while briefing loads
3. Expected: No NullPointerException from SDK callbacks
4. Expected: Coaching audio/briefing continues normally
```

### Test Case 4: Watch Sends Data After Run Stopped
```
1. Start and complete a run
2. Stop the run immediately
3. Watch still sends GPS/sensor data for 2-3 seconds
4. Expected: No crash from null session
5. Expected: Graceful logging: "Ignoring watch sensor data: session already ended"
```

### Test Case 5: App Destroyed During Upload
```
1. Start a run and save it
2. During upload (watch it in Network tab), rotate device
3. Expected: App survives rotation
4. Expected: Watch receives "session ended" notification
5. Expected: Upload completes successfully
```

---

## Summary of All Changes

| File | Lines | Change | Type |
|------|-------|--------|------|
| `RunSessionScreen.kt` | 184-198 | Added `cancelRunSetup()` before navigation | Crash Fix |
| `RunSessionViewModel.kt` | 356 | Added `isSetupCancelled` flag | Crash Prevention |
| `RunSessionViewModel.kt` | 366-369, 380-385 | Guard checks against cancelled setup | Crash Prevention |
| `RunSessionViewModel.kt` | 573-603, 606-628 | Prevent UI updates when cancelled | Crash Prevention |
| `RunSessionViewModel.kt` | 605 | Reset cancellation flag on new config | Safety |
| `RunSessionViewModel.kt` | 1070-1084 | Enhanced `cancelRunSetup()` | Robustness |
| `RunTrackingService.kt` | 539-576 | Move handler assignment before SDK init | Race Condition Fix |
| `RunTrackingService.kt` | 1730-1740 | Add null session check in GPS injection | Crash Prevention |
| `RunTrackingService.kt` | 1756-1766 | Add null session check in sensor update | Crash Prevention |
| `RunTrackingService.kt` | 2545-2554 | Add try-catch around device name fetch | Race Condition Fix |
| `RunTrackingService.kt` | 2777-2787 | Improve watch shutdown logging | Robustness |

---

## Impact Assessment

**Severity of Bugs Fixed**:
- 🔴 **CRITICAL**: 2 bugs (SDK callback race, watch disconnect during save)
- 🟠 **HIGH**: 2 bugs (null session crashes, auth validation crash)
- 🟡 **MEDIUM**: 1 bug (watch teardown race)

**Affected Scenarios**:
- ✅ Runs without Garmin watch connected
- ✅ Watch disconnection during runs
- ✅ Watch disconnection during run save
- ✅ Fast SDK callbacks after initialization
- ✅ App destruction during upload

**No Behavior Changes**:
- Upload logic unchanged
- Run data structure unchanged
- API compatibility unchanged
- Watch messaging protocol unchanged

**All Fixes Are Defensive**:
- No breaking changes to existing code
- All fixes use safe calls (`?.`), null checks, try-catch
- Graceful degradation when watch is unavailable
- Better logging for debugging
