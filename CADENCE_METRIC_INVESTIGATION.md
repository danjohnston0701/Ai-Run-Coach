# 🔍 Cadence Metric Investigation - Wayne's Low Cadence Reading

## Summary
Wayne reported cadence of **90-130 steps per minute** during a recent run, while his normal cadence is **160-170 SPM**.

**Status**: **Likely NOT a systematic bug** — more likely a **device-specific or session-specific issue**.

---

## Cadence Data Sources & Priority

The phone app receives cadence from **TWO sources** with this priority:

### 1. **Garmin Watch (if paired and running) — HIGHEST PRIORITY**
   - Location: `RunTrackingService.updateWatchSensorData()` (line 1792-1797)
   - Data comes from: `frame.cadence` from watch biometric frame
   - This **OVERRIDES** phone cadence when present
   - Used in lines 1837 and throughout the run

### 2. **Phone Sensors (fallback) — LOWER PRIORITY**
   - Location: `onSensorChanged()` method (line 4599+)
   - Two sensor options:
     - `TYPE_STEP_COUNTER`: Accumulates total steps (line 4601-4617)
     - `TYPE_STEP_DETECTOR`: Detects individual steps (line 4619-4646)

---

## Most Likely Cause: **Watch Cadence Data**

### ✅ Evidence

**If Wayne was running with a Garmin watch paired:**

1. **Watch overrides phone cadence** (line 1792-1797):
   ```kotlin
   if (frame.cadence > 0) {
       currentCadence = frame.cadence  // ← Replaces phone sensor reading
       cadenceSum += frame.cadence
       cadenceCount++
   }
   ```

2. **The watch might have:**
   - **Miscalibrated its cadence sensor** (drift over time)
   - **Poor stride detection** (affected by running surface, shoe type, etc.)
   - **Hardware issue** (sensor malfunction)
   - **Software bug** in watch app's cadence calculation

### 🔧 The Watch Cadence Calculation Issue

Looking at the Garmin watch app code we fixed earlier (`RunView.mc`):
- The watch measures cadence from its built-in accelerometer
- **But there's NO filtering for low-cadence noise**
- If the watch detected slow/irregular steps, it could report low values

---

## Secondary Issue: **Phone Cadence Can Be Unreliable**

### Phone Step Counter Issues

**Location**: `RunTrackingService.onSensorChanged()` (lines 4599-4662)

```kotlin
Sensor.TYPE_STEP_COUNTER -> {
    val steps = event.values[0].toInt()
    if (initialStepCount == -1) initialStepCount = steps
    val sD = steps-initialStepCount
    val tD = System.currentTimeMillis()-lastStepTimestamp
    if (tD > 2000) {  // ← Only recalculates every 2+ seconds
        currentCadence = (sD*60000/tD).toInt()
        initialStepCount = steps
        lastStepTimestamp = System.currentTimeMillis()
    }
}
```

**Potential Problems**:
1. **Only updates every 2+ seconds** - granular cadence data is lost
2. **Affected by phone orientation** - step counter accuracy varies with how phone is held
3. **Hardware-dependent** - different phones have different sensors
4. **Can drift on certain surfaces** - concrete vs. treadmill vs. grass

**Fallback Issue - Step Detector**:
```kotlin
Sensor.TYPE_STEP_DETECTOR -> {
    // Recalculates every 10 steps or 3 seconds
    if (stepCountFromDetector >= 10 || timeSinceLastCadenceCalc > 3000) {
        currentCadence = ((stepCountFromDetector * 60000) / timeSinceLastCadenceCalc).toInt()
```

This is **VERY coarse** - can only detect cadence changes in 3+ second intervals.

---

## Isolation Questions

**To determine if this is systemic vs. isolated:**

### Was Wayne running with a Garmin watch?
- ✅ **YES (likely)**: The low reading is from the watch, not the phone
  - **Fix**: Watch calibration or hardware check
  
- ❌ **NO (phone only)**: Low reading from phone sensors
  - **Possible causes**: 
    - Phone in unusual position (back pocket, armband upside down)
    - Phone step counter drift on specific surface
    - Sensor hardware issue on that phone

### Has this happened to other users with the same watch model?
- ✅ **YES (multiple reports)**: This is a watch app bug
  - **Fix**: Update watch cadence calculation
  
- ❌ **NO (only Wayne)**: Likely isolated to Wayne's device/session
  - **Possible causes**:
    - Watch needs recalibration
    - Phone needs sensor reset
    - One-off sensor glitch

---

## Code Analysis: Where Cadence Gets Reported

The cadence value shown to Wayne in the summary came from:

**1. During the run** (`RunSessionViewModel.kt` line 378):
```kotlin
cadence = session.cadence.toString()  // ← Displayed in real-time
```

**2. In the run summary** (`RunTrackingService.kt` line 2273):
```kotlin
cadence = if (cadenceCount > 0) (cadenceSum / cadenceCount).toInt() else currentCadence
```

**This is an AVERAGE**, so:
- If cadence was low for most of the run: Low average
- If cadence was low only sometimes: Mixed results

---

## Recommendations

### Immediate Actions

**1. Ask Wayne:**
   - [ ] Was your Garmin watch paired during this run?
   - [ ] Is this the first time seeing low cadence, or has it happened before?
   - [ ] Do other Garmin metrics look normal (pace, distance, HR)?
   - [ ] What watch model do you have? (Fenix 7, Forerunner 945, etc.)

**2. Test the hypothesis:**
   - [ ] Wayne runs again with watch **OFF** (phone only)
   - [ ] Compare cadence readings
   - [ ] If phone cadence is normal: **Watch is the culprit**
   - [ ] If phone cadence is also low: **Phone sensor issue**

### If Watch Cadence is the Problem

**The watch app code is correctly receiving cadence** (line 1792), but:
- ✅ Code correctly handles the value
- ❌ Watch's cadence **calculation** might be wrong

**Possible watch firmware issues:**
- Watch accelerometer miscalibration
- Watch step detection algorithm has a bug
- Surface conditions affecting sensor reading

**Solution**:
1. Restart watch (power cycle)
2. Recalibrate sensors in watch settings
3. Try on different surfaces (track vs. road vs. treadmill)
4. Update watch firmware if available

### If Phone Cadence is the Problem

The phone sensor code has some limitations but should work:

**Potential fixes**:
1. **Improve step counter granularity** (update every 1 second instead of 2+)
2. **Add anomaly detection** (flag readings that differ >20% from average)
3. **Prefer step detector over step counter** (if available)
4. **Add phone orientation compensation** (adjust for how phone is held)

---

## Code Improvements (Optional)

### Option 1: Add Cadence Smoothing (like pace)
```kotlin
// Prevent sudden cadence spikes/drops
private fun smoothCadence(newCadence: Int): Int {
    if (lastValidCadence == 0) return newCadence
    // Don't jump by more than ±15% 
    val minAccepted = (lastValidCadence * 0.85).toInt()
    val maxAccepted = (lastValidCadence * 1.15).toInt()
    return newCadence.coerceIn(minAccepted, maxAccepted)
}
```

### Option 2: Flag Invalid Cadence Ranges
```kotlin
// Human running cadence: 140-180 SPM is typical
// 90-130 SPM is VERY slow (walking pace)
if (currentCadence < 120 && isRunning) {
    Log.w("RunTrackingService", "Unusually low cadence: $currentCadence SPM")
    // Could trigger a UI warning or log this as anomalous
}
```

### Option 3: Watch Cadence Override Protection
```kotlin
// Don't trust watch cadence if it's unreasonably low
if (frame.cadence > 0 && frame.cadence >= 100) {  // Min threshold
    currentCadence = frame.cadence
} else if (frame.cadence > 0) {
    Log.w("RunTrackingService", "Watch cadence too low (${frame.cadence}), using phone sensor")
    // Fall back to phone sensor if watch reading is suspicious
}
```

---

## Verdict

### Is This a Bug in the Phone App?
**❌ Unlikely** — The code correctly:
- ✅ Reads from watch cadence (priority 1)
- ✅ Falls back to phone sensors (priority 2)
- ✅ Averages cadence values properly
- ✅ Reports to summary correctly

### Is This a Bug in the Watch App?
**🟡 Possibly** — The watch app code correctly **receives** cadence, but:
- Watch hardware might have calibration issues
- Watch step detection algorithm might be buggy
- Watch firmware might have a drift issue

### Most Likely Cause
**🎯 Isolated device/session issue** — One of these scenarios:
1. **Watch cadence sensor miscalibration** (most likely if watch was paired)
2. **Phone sensor in unusual orientation** (if phone only)
3. **One-off sensor glitch** (hardware reset would fix)

---

## What to Do

1. **Confirm if watch was paired** during Wayne's run
2. **If YES**: Ask Wayne to recalibrate his watch sensors
3. **If NO**: Ask Wayne to run again to confirm phone sensor works
4. **Add logging** to see which sensor is reporting the low value
5. **Consider adding anomaly detection** to flag suspicious readings

---

## Reference Code Locations

- **Watch cadence injection**: Line 1792 in `RunTrackingService.kt`
- **Phone cadence from step counter**: Line 4608 in `RunTrackingService.kt`
- **Phone cadence from step detector**: Line 4633 in `RunTrackingService.kt`
- **Cadence display**: Line 378 in `RunSessionViewModel.kt`
- **Cadence average for summary**: Line 2273 in `RunTrackingService.kt`

