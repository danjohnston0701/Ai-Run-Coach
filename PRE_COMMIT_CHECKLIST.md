# Pre-Commit Checklist — Watch Biometrics Integration

## Status Summary
✅ **WATCH DATA COLLECTION**: 100% complete  
✅ **PHONE STREAMING**: 100% complete  
✅ **ANDROID APP INTEGRATION**: 100% complete  
✅ **DATABASE SCHEMA**: Ready (migration SQL written)  
⚠️ **CRITICAL ISSUES FOUND**: 3 issues must be fixed before commit

---

## 🚨 CRITICAL ISSUES

### 1. **Watch HR Zone Calculation — HARDCODED MAX HR 185 BPM**

**Problem:**
- `RunView.mc` line 1076: `var pct = (hr.toFloat() / 185.0) * 100.0;`
- Uses arbitrary constant instead of user's actual max HR
- Will give wrong zone colors on watch for any user not with ~185 max HR
- User with 160 max HR will see zones 30-50% off

**Impact:**
- 🔴 RED — Watch display will mislead user about effort zone
- 🔴 RED — AI coaching may respond to wrong zone assumptions
- 🟡 YELLOW — Misaligns with Android app zone calculations

**Fix Required:**
Get actual user max HR from `UserProfile.getProfile()` — Garmin SDK provides:
- `maxHeartRate` (measured if available)
- `restingHeartRate` (for Karvonen formula if needed)

**Lines to Fix:**
```monkeyc
// CURRENT (BROKEN)
private function _hrZone(hr) {
    var pct = (hr.toFloat() / 185.0) * 100.0;  // ❌ HARDCODED
    if (pct < 60) { return 1; }
    ...
}

// SHOULD BE
private function _hrZone(hr) {
    var profile = UserProfile.getProfile();
    var maxHr = profile != null && profile.maxHeartRate != null 
        ? profile.maxHeartRate 
        : 185;  // fallback only
    var pct = (hr.toFloat() / maxHr) * 100.0;  // ✅ PERSONAL
    ...
}
```

---

### 2. **Watch Biometric Frame Missing Heart Rate Zone in PhoneLink**

**Problem:**
- `PhoneLink.sendRunData()` sends `"hr"` but not `"hrz"` (heart rate zone)
- `GarminWatchManager.handleWatchMessage()` tries to parse `"hrz"` but watch never sends it
- `WatchBiometricFrame.heartRateZone` will always be 1 (default)

**Impact:**
- 🟡 YELLOW — Zone field ignored in real-time; only raw HR used
- 🟡 YELLOW — Watch zone calculation never transmitted to phone

**Fix Required:**
Add zone calculation to watch stream:

```monkeyc
// In RunView.mc onTick() where we send data:
_phoneLink.sendRunData({
    "hr"    => _heartRate,
    "hrz"   => _heartRateZone,  // ← ADD THIS
    "cad"   => _cadence,
    // ... other fields ...
});

// Also in DataStreamer path (standalone mode):
_dataStreamer.sendData({
    "heartRate"     => _heartRate,
    "heartRateZone" => _heartRateZone,  // ← Already included, good
    ...
});
```

Currently in code (line ~425):
```monkeyc
"hr"    => _heartRate,
"cad"   => _cadence,
// ❌ Missing: "hrz" => _heartRateZone,
```

---

### 3. **Backend AI Coaching Not Integrated with Watch Data Yet**

**Problem:**
- `real-time-biomechanical-coach.ts` is **complete and sophisticated**
- But **NOT WIRED** to the phone app yet — no endpoint to call it
- Watch sends all 23+ metrics but there's no API endpoint that:
  1. Receives the biometric frame
  2. Fetches runner baseline
  3. Calls the coach AI
  4. Returns coaching cue

**Impact:**
- 🟡 YELLOW — All watch data captured but **not used for live coaching yet**
- 🟡 YELLOW — AI insights still rely on pre-recorded coaching, not real-time

**Status:**
- ✅ Coach engine built (`real-time-biomechanical-coach.ts`)
- ✅ Runner baseline queries ready
- ❌ Endpoint `/api/coaching/biometric-frame` not implemented
- ❌ Phone app not calling the endpoint
- ❌ Watch not receiving coaching responses yet

**To Fix Before First Real-Time Coaching:**
Need to implement the **real-time coaching integration layer** (separate task):
1. Add `POST /api/coaching/biometric-frame` endpoint (receives `WatchBiometricFrame`)
2. Add endpoint to fetch runner baseline + terrain context
3. Call Claude via `real-time-biomechanical-coach.ts`
4. Return coaching cue
5. Hook into RunTrackingService to invoke endpoint every 2 s
6. Display cue on watch via PhoneLink

---

## ✅ What IS Ready

### Watch App (`RunView.mc`)
- ✅ All 17 biomechanical fields captured (`_groundContactTime`, `_verticalOscillation`, etc.)
- ✅ `Activity.getActivityInfo()` integration for dynamics + training effect
- ✅ GPS bearing & accuracy captured
- ✅ All 23+ metrics streamed via `PhoneLink.sendRunData()` every 2 s
- ✅ Imports updated (`using Toybox.Activity`, `UserProfile`)
- ⚠️ HR zone calculation needs fix (issue #1)

### Android App
- ✅ `WatchBiometricFrame` data class (contains all 23+ fields)
- ✅ `GarminWatchManager.handleWatchMessage()` parses all fields
- ✅ `RunTrackingService.updateWatchSensorData(frame)` stores metrics
- ✅ All metrics accumulated for averages at run end
- ✅ `uploadRunToBackend()` sends all fields in request

### Neon Database
- ✅ Migration SQL written (`GARMIN_WATCH_BIOMETRICS_MIGRATION.sql`)
- ✅ `runs` table: 25 new columns (dynamics, training effect, environmental)
- ✅ `watch_biometric_samples` table: full schema for time-series storage
- ✅ All indexes defined

### Run Summary UI
- ✅ Garmin tag logo displayed as sticky header
- ✅ Device name shown
- ✅ Garmin data disclosure messages added to Graphs, AI Insights, Data tabs
- ✅ Time-series graphs ready (infrastructure in place)

---

## 📋 Action Items Before Commit

### Priority 1 — MUST FIX (Blocks Correct Functionality)
- [ ] **Fix #1**: Replace hardcoded 185 with `UserProfile.maxHeartRate`
- [ ] **Fix #2**: Add `"hrz" => _heartRateZone` to PhoneLink payload
- [ ] **Test**: Verify watch zones match Android zones after fix

### Priority 2 — Should Do (Improves Data Quality)
- [ ] **Enhancement**: Store user's actual max HR in Neon (from user profile) for better retrospective zone analysis
- [ ] **Enhancement**: Send `restingHeartRate` from watch for Karvonen-based zones (if desired)
- [ ] **Test**: Verify all 23+ metrics flow through to database

### Priority 3 — Future (Not Blocking Release)
- [ ] **Implement Real-Time Coaching Endpoint** (separate task, not critical for data capture)
- [ ] **Add watch_biometric_samples storage** to backend (captures all 2-second frames for drill-down)
- [ ] **Build fine-grained graphs** (time-series VO, GCT trends, fatigue curve)

---

## Testing Checklist

### Before IQ File Build
- [ ] Run Android linter: `./gradlew lintDebug` (check for any errors)
- [ ] Verify `RunView.mc` syntax (will be caught during build, but check for logic errors)
- [ ] Confirm all 6 tasks completed:
  - [ ] Watch fields added
  - [ ] `_captureRunningDynamics()` implemented
  - [ ] GPS bearing + accuracy captured
  - [ ] PhoneLink sends 23+ metrics (after fixing #2)
  - [ ] GarminWatchManager parses all fields
  - [ ] RunTrackingService stores all fields

### After IQ File Build
- [ ] Build new IQ file: `cd garmin-companion-app && ./build.sh` (or monkeyc command)
- [ ] Deploy to watch
- [ ] Run a test session (15-20 min run on varied terrain):
  - [ ] Watch displays correct zone color (after fix #1)
  - [ ] No crashes when capture large number of metrics
  - [ ] PhoneLink transmit succeeds (no drops)
  - [ ] Android app receives all metrics
  - [ ] RunSession populated with watch data
  - [ ] HR zone test: have a known max HR user verify zones are correct

### After Neon Migration
- [ ] Run migration SQL on Neon
- [ ] Verify columns exist: `SELECT avg_ground_contact_time, avgVerticalOscillation FROM runs LIMIT 1;`
- [ ] Verify `watch_biometric_samples` table created
- [ ] Upload test run → verify metrics stored in all fields

---

## Summary: Ready for Commit?

| Component | Status | Issues |
|-----------|--------|--------|
| Watch data capture | ✅ Ready | Fix #1, #2 |
| Phone streaming | ✅ Ready | Fix #2 |
| Android app | ✅ Ready | None |
| Database schema | ✅ Ready | None |
| UI (displays) | ✅ Ready | None |
| Real-time coaching | ⏳ Not yet | Separate task |

**Recommendation:**
1. **Fix #1 and #2 before commit** (5 min each, critical correctness)
2. **Build IQ file and test** (1-2 runs to verify no crashes)
3. **Commit to GitHub** once testing passes
4. **Schedule real-time coaching integration** as follow-up sprint

This ensures you have **100% correct data capture and storage** from day 1, with the coaching integration coming later when ready.

