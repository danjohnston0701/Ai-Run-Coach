# 📋 Cadence Metric Troubleshooting Guide

## Quick Diagnosis: Why is cadence showing 90-130 SPM instead of 160-170?

---

## Step 1: Identify the Source 🔍

### First Question: **Was a Garmin watch paired during the run?**

**If YES → Watch is the likely source**
- Garmin watch data takes priority over phone sensors
- Watch cadence sensor may need calibration

**If NO → Phone sensor is the source**
- Phone step counter may be malfunctioning or misoriented
- Surface/movement pattern may affect phone sensor

---

## Step 2: Test Each Source Independently

### Test A: Phone-Only Cadence
```
1. Disable or unpair Garmin watch
2. Start a normal run with phone only
3. Check the displayed cadence
4. Does it show normal values (160-170)?
   YES → Problem is with watch
   NO → Problem is with phone sensor
```

### Test B: Watch-Only Cadence
```
1. If possible, run with watch while phone stays indoors
2. Check cadence on watch display
3. Does it match expected 160-170?
   YES → Watch is fine, something else caused Wayne's reading
   NO → Watch sensor needs calibration
```

---

## Step 3: Fix Based on Diagnosis

### If Problem is **WATCH CADENCE**

**Do this on the watch:**
1. **Settings → Sensors → Calibrate**
2. **Run through full calibration process**
3. **Try again on next run**

**If that doesn't work:**
1. **Power cycle watch** (turn off completely, wait 30s, turn on)
2. **Check firmware version** - update if available
3. **Hard reset watch** (as last resort, backs up data first)

### If Problem is **PHONE CADENCE**

**Option A: Check phone orientation**
1. **Wear phone in normal position** (pocket, armband, etc.)
2. **Avoid upside-down or rotated positions**
3. **Phone step sensors are very orientation-sensitive**

**Option B: Reset phone sensors**
1. **Settings → Apps → [Your step counter/health app]**
2. **Storage → Clear Cache (NOT data)**
3. **Reboot phone**
4. **Try again**

**Option C: Check phone capabilities**
1. **Settings → About Phone → Sensors**
2. **Verify "Step Counter" sensor exists**
3. **Some phones lack this hardware**
4. **If missing, can't calculate cadence without watch**

### If Problem is **BOTH** (watch AND phone)

This would be **very unusual**. More likely a:
- One-time sensor glitch (fixed by restart)
- Running on very unusual surface
- Wearing clothes/gear that interferes with sensors
- Recent software update that broke something

**Try:**
1. **Power cycle both watch and phone**
2. **Run a short test run (1 mile)**
3. **Check cadence again**

---

## Step 4: Identify if It's One-Time or Persistent

### Was this a one-time event?

**If YES:**
- Likely a temporary glitch
- Probably won't happen again
- Action: Monitor and report if it happens again

**If NO (happening multiple times):**
- Likely a systematic issue
- Needs investigation/fix
- Action: Follow diagnosis steps above

---

## Understanding Why Cadence Matters

### Why 160-170 SPM is Wayne's "Normal"
- Elite runners typically: 170-180 SPM
- Good recreational runners: 160-170 SPM
- Average runners: 150-165 SPM
- **90-130 SPM = walking pace, not running**

### What Would Cause Abnormally Low Reading
- ❌ Watch/phone thinks Wayne is **walking, not running**
- ❌ Sensor **not detecting steps** properly
- ❌ Sensor **overcounting time** window (thinks more time passed)
- ❌ **Formula error**: cadence = (steps × 60000) / time_ms

---

## Diagnostic Checklist

```
For Wayne's Next Run:
─────────────────────────────────────────────
☐ Watch paired or phone-only?
☐ Watch cadence displayed on watch itself? (check what watch shows)
☐ Phone in normal position?
☐ Phone brand/model? (some lack step counter)
☐ Surface? (treadmill, track, road, trail?)
☐ Pace similar to normal run?
☐ Distance similar to normal run?
☐ Heart rate normal?
☐ Garmin watch firmware version?
☐ Android version on phone?
```

---

## Common Causes & Fixes

| Cause | Symptom | Fix |
|-------|---------|-----|
| Watch miscalibrated | Only when watch paired | Recalibrate watch sensors |
| Phone upside down | Phone running with watch off | Wear phone normally |
| Old watch firmware | Low cadence every run | Update watch firmware |
| Phone lacks step counter | No cadence without watch | Upgrade phone or use watch |
| One-time glitch | Low cadence one run, then normal | Restart watch/phone |
| Surface interference | Low cadence on specific surface | Try different surface |
| Watch needs restart | Low cadence for several runs | Power cycle watch |

---

## Data to Collect from Wayne

Send Wayne this list to help diagnose:

```
Wayne, to help troubleshoot your cadence reading, please provide:

1. Hardware
   - What Garmin watch model? (Fenix 7? Forerunner 955? etc.)
   - What phone brand/model?
   
2. Run Details
   - Date/time of the run
   - Distance
   - Duration
   - Pace (fast, slow, recovery?)
   - Surface (road, track, treadmill, trail?)
   
3. Settings
   - Was watch connected during run? (Bluetooth on?)
   - Did watch show cadence on its display?
   - What was the cadence on watch display?
   
4. Before/After
   - This is a one-time issue or happening repeatedly?
   - Previous run had normal cadence?
   - Run after this one back to normal?
```

---

## Code-Level Investigation

If you need to investigate in code, check:

1. **Where watch cadence is injected:**
   - File: `RunTrackingService.kt`
   - Method: `updateWatchSensorData()`
   - Line: 1792

2. **Where phone cadence is calculated:**
   - File: `RunTrackingService.kt`
   - Method: `onSensorChanged()`
   - Lines: 4608 (step counter) or 4633 (step detector)

3. **Add logging to see which is being used:**
   ```kotlin
   Log.d("Cadence", "Using WATCH cadence: $watchCadence SPM")
   // OR
   Log.d("Cadence", "Using PHONE cadence: $phoneCadence SPM")
   ```

---

## Bottom Line

**Is this a bug in our code?**
- Unlikely. The code correctly reads and averages both sources.

**Is this a hardware/firmware issue?**
- Likely if watch was paired.

**Should we add protection?**
- Yes - could add:
  - Minimum cadence threshold (flag anything below 100 SPM)
  - Anomaly detection (flag readings that jump >20% suddenly)
  - Sensor source logging (log which sensor was used)

---

## Next Steps

1. **Confirm watch was/wasn't paired**
2. **Ask Wayne to run again and compare**
3. **Add logging to see which sensor reported low value**
4. **Consider adding safeguards** to catch anomalies

