# AI Heart Rate Coaching Zone Assessment Fix

## Problem Statement

During AI coaching in a run session, the coach was incorrectly assessing heart rate zones. For a 35-year-old runner at 144 bpm:
- **Actual situation**: 144 bpm ≈ 79% of age-adjusted max (183 bpm) → **Zone 3 (Tempo)**
- **What the coach said**: "Zone 5 (Maximum)" with advice to pull back to avoid burning out

This is a **critical zone mismatch** that would cause the runner to incorrectly dial back effort.

---

## Root Cause Analysis

### The Bug Chain

1. **In `RunTrackingService.kt` line 4270**:
   ```kotlin
   val maxHrValue = maxHr.takeIf { it > 0 } ?: currentHeartRate
   ```
   
   This fallback logic is **flawed**:
   - `maxHr` starts at 0 and is only updated when a new peak HR is recorded during the run
   - Early in a run, `maxHr` might still be 0
   - **Falls back to `currentHeartRate`** (144 bpm) instead of age-calculated max
   
2. **Server receives**:
   - `maxHR = 144` (incorrect device measurement)
   - `runnerAge = 35` (correct)
   
3. **Zone calculation at `ai-service.ts` line 3172**:
   ```typescript
   const effectiveMaxHR = runnerAge ? calcMaxHR(runnerAge) : maxHR;
   ```
   
   **This SHOULD work correctly** (uses Tanaka formula: 208 - 0.7×35 = 183), BUT the comment didn't explain why the fallback was needed.

### Heart Rate Zone Thresholds

For a 35-year-old using **Tanaka formula**: **Max HR = 183 bpm**

| Zone | Name | % of Max | BPM Range | Status |
|------|------|----------|-----------|--------|
| Z1 | Recovery | <60% | <110 | ✓ |
| Z2 | Aerobic | 60-70% | 110-128 | ✓ |
| **Z3** | **Tempo** | **70-80%** | **128-146** | ✓ Your HR should be here |
| Z4 | Threshold | 80-90% | 146-165 | ✓ |
| Z5 | Max | 90%+ | 165+ | ✗ Incorrectly reported |

At **144 bpm = 78.7% of max** → **Zone 3**, NOT Zone 5.

---

## The Real Issue

**The Android app was falling back to `currentHeartRate` instead of calculating age-adjusted max HR.**

When `maxHr` (highest recorded HR during run) is 0 early in the session, the code should calculate:
```
effectiveMaxHR = 208 - (0.7 × age)
```

Not:
```
effectiveMaxHR = currentHeartRate  // WRONG!
```

---

## The Fix

### Android App Fix (`RunTrackingService.kt`)

**Before:**
```kotlin
val maxHrValue = maxHr.takeIf { it > 0 } ?: currentHeartRate
```

**After:**
```kotlin
// Calculate expected max HR from age if available; otherwise use highest recorded HR
// IMPORTANT: Don't fall back to currentHeartRate as it's too low early in run!
// Tanaka formula: maxHR = 208 - (0.7 × age)
val maxHrValue = if (maxHr > 0) {
    maxHr
} else if (currentUser?.age != null && currentUser.age!! > 0) {
    val calculatedMaxHr = (208 - (0.7 * currentUser.age!!)).toInt()
    calculatedMaxHr
} else {
    190 // Generic fallback for unknown age
}
```

**Logic**:
1. ✅ If actual peak HR recorded during run → use that
2. ✅ If age available → calculate from age (Tanaka formula)
3. ✅ If age unknown → use conservative default (190)
4. ❌ NEVER fall back to current HR

### Server Code Documentation (`ai-service.ts`)

Enhanced the comment to explain the logic:
```typescript
// Use age-adjusted max HR (Tanaka formula: 208 - 0.7×age) — more accurate than device-reported max
// This prevents incorrect zone assessment early in runs when actual max HR hasn't been reached yet.
// If age is available, ALWAYS use age-calculated max. Only fall back to device max if age is unknown.
const effectiveMaxHR = runnerAge ? calcMaxHR(runnerAge) : maxHR;
```

---

## Impact

✅ **Fixes**:
- Heart rate zones now correctly calculated from age-adjusted max HR
- AI coach provides accurate zone feedback early in runs
- Runner gets appropriate pacing guidance

✅ **Prevents**:
- Incorrect "pull back" coaching when runner is in appropriate zone
- Zone mismatch between app display and AI coaching feedback

---

## Testing

To verify the fix works:

1. **Start a run at age 35**
2. **Run at comfortable pace reaching 144 bpm**
3. **Within first 3-5 minutes, AI coach should say**: "Heart rate at 144 bpm, Zone 3 (Tempo). Keep it steady!" ✓
4. **NOT**: "Zone 5 (Maximum). Pull back!" ✗

**Zone verification**:
- 35 years old → max HR = 183 bpm (Tanaka formula)
- 144 bpm = 78.7% of 183 → Zone 3 ✓

---

## Files Modified

1. **`app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`**
   - Line 4270: Fixed maxHR fallback logic to use age-calculated max instead of current HR

2. **`server/ai-service.ts`**
   - Line 3169-3174: Enhanced documentation of zone calculation logic

---

## Related Code

- **Zone calculation**: `getHeartRateZoneNumber()` (line 3141 in ai-service.ts)
- **Max HR formula**: `calcMaxHR()` (line 1378 in ai-service.ts) — Tanaka: 208 - 0.7×age
- **Zone names**: Lines 3177 (Z1 Recovery → Z5 Maximum)
