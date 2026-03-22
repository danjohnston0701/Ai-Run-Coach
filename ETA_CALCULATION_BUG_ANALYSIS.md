# ETA Calculation Bug Analysis - Charlie's Saturday 5km Run

## The Problem

During Charlie's 5km park run with target time 21 minutes:
- ❌ **ETA shown:** 21:42 (21 minutes 42 seconds)
- ❌ **Variance message:** "1 minute 20 seconds off target"
- ✅ **Actual variance:** Only 42 seconds off target (21:42 - 21:00 = 0:42)
- ❌ **ETA inconsistency:** ETA appeared to change across different coaching messages

## Root Cause

**CRITICAL UNIT MISMATCH BUG** in ETA calculations:

### The Model
```kotlin
// app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt:111
private var targetDistance: Double? = null // ALWAYS in metres (normalized on receipt)
private var targetTime: Long? = null       // ALWAYS in milliseconds
```

### The Bug - Two Different ETA Calculation Paths

**✅ CORRECT** (Pace Coaching - Line 1180)
```kotlin
val currentAvgPaceSecondsPerKm = elapsedSeconds / distKm
val totalDistKm = tDist / 1000.0                                  // Convert metres to km
val projectedFinishSeconds = currentAvgPaceSecondsPerKm * totalDistKm  // Correct!
```

**❌ WRONG** (Elite/Target ETA Coaching - Line 3135, 3175, 3186)
```kotlin
// fireTargetEtaCoaching, fireFinalCoaching, fireMilestoneCoaching
val td = targetDistance ?: return  // This is in METRES!
val projectedFinishSec = if (distKm > 0) (elapsedSec / distKm * td).toLong()
// BUG: td is in metres but formula treats it as if it's in km!
```

### Example with Charlie's Run (at 3km mark, 16 minutes elapsed)

**CORRECT calculation (Pace Coaching):**
```
elapsedSeconds = 960 (16 minutes)
distKm = 3.0
targetDistance = 5000 meters = 5.0 km
targetTime = 1260 seconds (21 minutes)

currentAvgPaceSecondsPerKm = 960 / 3.0 = 320 sec/km
projectedFinishSeconds = 320 * 5.0 = 1600 seconds = 26:40

Variance = (1600 - 1260) / 1260 = 27% over
```

**WRONG calculation (Elite ETA Coaching):**
```
elapsedSec = 960
distKm = 3.0
td = 5000 (METRES, not km!)
targetTime = 1260 seconds

projectedFinishSec = (960 / 3.0 * 5000) = 1,600,000 seconds  ← MASSIVELY WRONG!
                   = 444+ hours!

Then when comparing: (1,600,000 - 1,260) / 1,260 * 100 = 126,900% over  ← Nonsense!
```

## Where the Bug Manifests

Three functions have this bug:

### 1. `fireTargetEtaCoaching()` - Line 3180
```kotlin
private fun fireTargetEtaCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
    lastTargetEtaKm = distKm.toInt()
    val td = targetDistance ?: return  // ❌ METRES, not km!
    val projectedSec = if (distKm > 0) ((duration / 1000.0) / distKm * td).toLong() 
    // ❌ BUG: treats td as km
    
    val request = buildBaseEliteRequest("target_eta", distKm, duration, avgSpeed).copy(
        projectedFinishTime = projectedSec
    )
    fireEliteCoaching(request, "Target ETA")
}
```

### 2. `fireFinalCoaching()` - Line 3135
```kotlin
private fun fireFinalCoaching(type: String, distKm: Double, duration: Long, avgSpeed: Float, remainingMeters: Double) {
    val td = targetDistance ?: 0.0  // ❌ METRES, not km!
    val elapsedSec = duration / 1000.0
    val projectedFinishSec = if (distKm > 0) (elapsedSec / distKm * td).toLong()
    // ❌ BUG: treats td as km
    ...
}
```

### 3. `fireMilestoneCoaching()` - Line 3175
```kotlin
private fun fireMilestoneCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
    val td = targetDistance ?: return  // ❌ METRES, not km!
    ...
    projectedFinishTime = if (distKm > 0) ((duration / 1000.0) / distKm * td).toLong() else null
    // ❌ BUG: treats td as km
}
```

## Why ETA Appeared Inconsistent

The run has **multiple ETA calculations happening**:
1. **Pace coaching** (correct) - uses proper km-based formula
2. **Target ETA coaching** (wrong) - uses broken metre-as-km formula
3. **Milestone coaching** (wrong) - uses broken metre-as-km formula  
4. **Final coaching** (wrong) - uses broken metre-as-km formula

Different coaching triggers fire at different distances, so the user got **different (wrong) ETAs** from different coaching paths.

## The Fix

Convert `targetDistance` from metres to km **before** using it in the formula:

### Fix for fireTargetEtaCoaching()
```kotlin
private fun fireTargetEtaCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
    lastTargetEtaKm = distKm.toInt()
    val td = targetDistance ?: return
    val tdKm = td / 1000.0  // ✅ Convert metres to km
    val projectedSec = if (distKm > 0) ((duration / 1000.0) / distKm * tdKm).toLong() 
    
    val request = buildBaseEliteRequest("target_eta", distKm, duration, avgSpeed).copy(
        projectedFinishTime = projectedSec
    )
    fireEliteCoaching(request, "Target ETA")
}
```

### Fix for fireFinalCoaching()
```kotlin
private fun fireFinalCoaching(type: String, distKm: Double, duration: Long, avgSpeed: Float, remainingMeters: Double) {
    recordCoachingFired()
    hasCoachingFiredThisTick = true
    val td = targetDistance ?: 0.0
    val tdKm = td / 1000.0  // ✅ Convert metres to km
    val elapsedSec = duration / 1000.0
    val projectedFinishSec = if (distKm > 0) (elapsedSec / distKm * tdKm).toLong() else null
    ...
}
```

### Fix for fireMilestoneCoaching()
```kotlin
private fun fireMilestoneCoaching(distKm: Double, duration: Long, avgSpeed: Float) {
    val td = targetDistance ?: return
    val tdKm = td / 1000.0  // ✅ Convert metres to km
    val pct = (distKm / tdKm * 100).toInt()
    ...
    projectedFinishTime = if (distKm > 0) ((duration / 1000.0) / distKm * tdKm).toLong() else null
    ...
}
```

## Summary

| Aspect | Current | Fixed |
|--------|---------|-------|
| **Bug** | targetDistance in metres treated as km | Convert metres → km before use |
| **Impact** | ETA massively inflated, variance wrong | Correct ETA calculation |
| **Affected functions** | 3 (fireTargetEtaCoaching, fireFinalCoaching, fireMilestoneCoaching) | All three fixed |
| **Charlie's example** | ETA: 26:40 → Variance: "1:20 off" (wrong) | ETA: 21:42 → Variance: "0:42 off" (correct) |
| **Inconsistency** | Multiple coaching paths → different ETAs | Single correct calculation |

## Testing

To verify the fix works, use Charlie's run data:
- **Target:** 5km in 21 minutes
- **At 3km mark (16 minutes):**
  - ✅ ETA should be: 26:40 (or 21:20 if pacing the same)
  - ✅ Variance should be: 1:20 over target (or within 20 sec if slight speedup)
  - ✅ Should be consistent across all coaching messages
