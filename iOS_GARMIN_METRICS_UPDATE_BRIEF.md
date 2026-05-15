# 📱 iOS App Update Brief: Comprehensive Garmin Metrics Pipeline

## Overview
The Android app now captures, streams, and analyzes **50+ Garmin Activity.Info metrics** end-to-end. iOS needs to replicate this complete implementation.

---

## 🎯 High-Level Changes Required

### 1. **Garmin Watch Companion App Communication**
**What Changed:** Watch now streams 50+ metrics (up from ~15 basic metrics)

**iOS Must Do:**
- Update `GarminWatchManager.swift` to parse and handle all new biometric fields from `PhoneLink.sendRunData()`
- Create/extend model: `WatchBiometricFrame` to include:
  - Running dynamics: `groundContactTime`, `groundContactBalance`, `verticalOscillation`, `verticalRatio`, `strideLength`
  - Power: `runningPower`, `powerToPaceRatio`
  - Respiration: `respirationRate`, `respirationZone`
  - Training effects: `aerobicTrainingEffectCurrent`, `anaerobicTrainingEffectCurrent`
  - Environmental: `temperature`, `weatherCondition`, `altitudeGainSoFar`, `altitudeLossSoFar`
  - Contextual: `stepCountIncremental`, `estimatedFatigue`, `timeSinceLastCoachingCue`

**Reference:** `app/src/main/java/live/airuncoach/airuncoach/service/GarminWatchManager.kt` (Android implementation)

---

### 2. **Run Session Accumulation & Storage**
**What Changed:** Now accumulating min/max/avg + time-series JSONB for all 50+ metrics

**iOS Must Do:**
- Update `RunSession` model with:
  - **New aggregate fields**: `totalSteps`, `totalEnergy`, `minCadence`, `minPace`, `maxPace`, `avgRunningPower`, `maxRunningPower`, `minRunningPower`, `powerToPaceRatio`, `avgRespirationRate`, `minRespirationRate`, `maxRespirationRate`, `avgTemperature`, `minTemperature`, `maxTemperature`, `avgGpsAccuracy`, `worstGpsAccuracy`, `minVerticalOscillation`, `maxVerticalRatio`, `minVerticalRatio`, `avgGroundContactBalanceLeft`, `avgGroundContactBalanceRight`, `maxTrainingEffect`, `maxAnaerobicTrainingEffect`, `fitnessLevelAfter`, `activityType`, `sportName`, `subSportName`, `dataQualityScore`
  - **Heart rate zones**: `avgHeartRateZone`, `timeInZone1`, `timeInZone2`, `timeInZone3`, `timeInZone4`, `timeInZone5`
  - **Time-series JSONB arrays**: `stepsData`, `trainingEffectData`, `anaerobicEffectData`, `temperatureData`, `powerToPaceRatioData`

- Update `RunTrackingService` (or equivalent) to accumulate during the run:
  - Sum/avg/min/max for each metric
  - Build JSONB arrays for time-series graphs
  - Compute derived metrics: HR zones, power-to-pace ratio, estimated fatigue

**Reference:** `app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Android)

---

### 3. **Dynamic Baselines (No Hardcoded Thresholds)**
**What Changed:** Efficiency classification is now user-specific and adaptive

**iOS Must Do:**
- Create `RunningMetricsConfig.swift` that:
  - Reads user's last 4 weeks of runs from local database
  - Calculates personalized baselines for: GCT, VO, stride length, power-to-pace ratio
  - Implements 80/20 exponential moving average for baseline updates
  - Classifies efficiency as "efficient" | "moderate" | "taxing" based on user baseline (not fixed thresholds)
  - Updates baselines after each run completes

- Remove any hardcoded ranges like "200-300ms GCT" or "6-8cm VO"

**Reference:** `app/src/main/java/live/airuncoach/airuncoach/config/RunningMetricsConfig.kt` (Android)

---

### 4. **Live Coaching: Elite Coaching Request**
**What Changed:** All 50+ metrics now sent to OpenAI per coaching prompt

**iOS Must Do:**
- Update `EliteCoachingRequest` model to include ALL new metrics:
  - Running dynamics: GCT, VO, stride, balance, ratio (current + aggregate)
  - Power: watts, power-to-pace ratio
  - Respiration: breaths/min, zone
  - Training effects: live aerobic/anaerobic ATE
  - Environmental: temperature, pressure, altitude gain/loss
  - HR zones: current zone, time in each zone
  - Efficiency classification: "efficient" | "moderate" | "taxing"
  - Fatigue estimate: 0-100

- When triggering coaching cue during run, populate request with ALL available metrics from current sample + aggregates

**Reference:** `app/src/main/java/live/airuncoach/airuncoach/network/model/EliteCoachingRequest.kt` (Android)

---

### 5. **Post-Run Analysis Request**
**What Changed:** Complete biometric profile now sent to OpenAI for analysis

**iOS Must Do:**
- Update `ComprehensiveAnalysisRequest` model:
  - Include entire `GarminDataSummary` with all 50+ fields
  - All time-series data (JSONB arrays as JSON)
  - Training effects, recovery time, VO2 max progression
  - Device metadata: `garminDeviceName`, `activityType`, `sportName`, `dataQualityScore`

**Reference:** `app/src/main/java/live/airuncoach/airuncoach/network/model/ComprehensiveAnalysisRequest.kt` (Android)

---

### 6. **TTS Abbreviation Expansion**
**What Changed:** No more acronyms in voice coaching

**iOS Must Do:**
- Create `AbbreviationExpander.swift` that converts running acronyms to spoken words:
  - `bpm` → "beats per minute"
  - `GCT` → "ground contact time"
  - `VO` → "vertical oscillation"
  - `VR` → "vertical ratio"
  - `RR` → "respiration rate"
  - `z1-z5` → "zone 1-5" (e.g., "zone 2")
  - `ATE` → "aerobic training effect"
  - `VO2` → "V O 2 max"
  - `HR` → "heart rate"
  - Plus 50+ more mappings

- Integrate into `CoachingAudioService` (or equivalent):
  - Before passing text to TextToSpeech, expand abbreviations
  - Example: "Your bpm is 145, GCT 245ms" → "Your beats per minute is 145, ground contact time 245 milliseconds"

**Reference:** `app/src/main/java/live/airuncoach/airuncoach/util/AbbreviationExpander.kt` (Android)

---

### 7. **Post-Run Visualization (UI)**
**What Changed:** New metrics now available for post-run graphs

**iOS Must Do:**
- Update `RunSummaryViewController` to display:
  - **New metric cards**: Running power (avg/max), respiration rate, efficiency ratio, data quality score
  - **Extended cards**: GCT min/max, VO min/max, stride length min/max, pace min/max, HR zones breakdown
  - **New graphs**:
    - Ground Contact Time trend over distance
    - Vertical Oscillation trend (fatigue indicator)
    - Stride Length decay (fatigue indicator)
    - Running Power profile (watts over distance)
    - HR Zone distribution (pie chart: % time in Z1-Z5)
    - Respiration Rate response to intensity
    - Training Effect accumulation curve
    - Power-to-Pace Ratio efficiency trend

- Leverage time-series JSONB arrays for rendering x-y graphs (distance vs. metric)

**Reference:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt` (Android)

---

### 8. **Data Models Update**
**iOS Must Create/Update:**

```swift
// WatchBiometricFrame (incoming 2-second samples)
struct WatchBiometricFrame {
  // Existing (keep)
  var heartRate: Int?
  var cadence: Int?
  var pace: Double?
  var speed: Double?
  var latitude: Double?
  var longitude: Double?
  var altitude: Double?
  
  // NEW - Running Dynamics
  var groundContactTime: Double?
  var groundContactBalance: Double?
  var groundContactBalanceLeft: Double?
  var groundContactBalanceRight: Double?
  var verticalOscillation: Double?
  var verticalRatio: Double?
  
  // NEW - Power
  var runningPower: Int?
  var powerToPaceRatio: Double?
  
  // NEW - Respiration
  var respirationRate: Double?
  var respirationZone: Int?
  
  // NEW - Training Effects (live updates)
  var aerobicTrainingEffectCurrent: Double?
  var anaerobicTrainingEffectCurrent: Double?
  
  // NEW - Environmental
  var temperature: Double?
  var weatherCondition: String?
  var altitudeGainSoFar: Double?
  var altitudeLossSoFar: Double?
  
  // NEW - Contextual
  var stepCountIncremental: Int?
  var estimatedFatigue: Int? // 0-100
  var timeSinceLastCoachingCue: Int? // seconds
}

// RunSession (aggregates)
struct RunSession {
  // Keep existing fields, ADD:
  var totalSteps: Int?
  var totalEnergy: Int?
  var minCadence: Int?
  var minPace: Double?
  var maxPace: Double?
  var avgHeartRateZone: Int?
  var timeInZone1: Int? // seconds
  var timeInZone2: Int?
  var timeInZone3: Int?
  var timeInZone4: Int?
  var timeInZone5: Int?
  
  // Running Dynamics
  var minVerticalOscillation: Double?
  var maxVerticalRatio: Double?
  var minVerticalRatio: Double?
  var avgGroundContactBalanceLeft: Double?
  var avgGroundContactBalanceRight: Double?
  
  // Power
  var minRunningPower: Int?
  var powerToPaceRatio: Double?
  
  // Respiration
  var minRespirationRate: Double?
  var maxRespirationRate: Double?
  
  // Training
  var maxTrainingEffect: Double?
  var maxAnaerobicTrainingEffect: Double?
  var fitnessLevelAfter: Double?
  
  // Environment
  var minTemperature: Double?
  var maxTemperature: Double?
  var avgGpsAccuracy: Double?
  var worstGpsAccuracy: Double?
  
  // Time-series (JSON arrays)
  var stepsData: [Int]?
  var trainingEffectData: [Double]?
  var anaerobicEffectData: [Double]?
  var temperatureData: [Double]?
  var powerToPaceRatioData: [Double]?
  
  // Metadata
  var activityType: String?
  var sportName: String?
  var subSportName: String?
  var dataQualityScore: Double?
}
```

---

### 9. **Backend API Update**
**What Changed:** New fields in request/response models

**iOS Must Do:**
- Update `UploadRunRequest` codable to include all 50+ fields (same as Android)
- Update response parsing to handle all new fields from `/api/runs` endpoints
- No backend changes needed (backend already supports these fields)

---

## 🚀 Implementation Priority

**PHASE 1 (Core):**
1. Update `WatchBiometricFrame` model
2. Update `RunSession` model with all new fields
3. Update `GarminWatchManager` to parse new fields
4. Update `RunTrackingService` accumulation logic

**PHASE 2 (AI Coaching):**
5. Update `EliteCoachingRequest` with new metrics
6. Update `ComprehensiveAnalysisRequest` with full biometric data
7. Add `AbbreviationExpander` for TTS

**PHASE 3 (UI):**
8. Update post-run summary screen with new metric cards
9. Add new graphs for trending metrics
10. Display efficiency classification

---

## 📊 Device Compatibility

All new metrics should be **optional** (nullable):
- ✅ All devices support: HR, pace, cadence, distance, elevation
- ✅ Running Dynamics devices (Fenix 7+, FR965): GCT, VO, stride, balance
- ✅ Power devices (Fenix 7+, FR965): Running power
- ✅ Advanced devices (Fenix 7X+, FR965+): Respiration, temperature

Use nil-coalescing and conditional rendering for device compatibility.

---

## 📝 Key Files to Reference

**Android Implementation (Use as Template):**
- `GarminWatchManager.kt` — Watch data parsing
- `RunTrackingService.kt` — Accumulation logic
- `RunSession.kt` — Data model
- `EliteCoachingRequest.kt` — Live coaching payload
- `ComprehensiveAnalysisRequest.kt` — Post-run analysis payload
- `AbbreviationExpander.kt` — TTS expansion
- `RunningMetricsConfig.kt` — Dynamic baselines
- `RunSummaryScreen.kt` — Post-run UI (graphs)

**Documentation:**
- `NEON_ALL_GARMIN_DATA_POINTS_REFERENCE.md` — Complete metric reference
- `COMPLETE_GARMIN_DATA_CAPTURE_SUMMARY.md` — End-to-end flow

---

## ✅ Testing Checklist

- [ ] All 50+ metrics parsing correctly from watch
- [ ] Time-series arrays building correctly during run
- [ ] No hardcoded efficiency thresholds (using dynamic baselines)
- [ ] All metrics included in EliteCoachingRequest
- [ ] All metrics included in ComprehensiveAnalysisRequest
- [ ] TTS doesn't read acronyms (uses expanded forms)
- [ ] Post-run graphs render all new metrics
- [ ] Device compatibility: graceful handling of null metrics
- [ ] Backward compatibility: existing runs still work

---

## 🎯 Success Criteria

iOS app will have **full feature parity with Android:**
- ✅ Capture all 50+ Garmin metrics
- ✅ Send to OpenAI for real-time + post-run coaching
- ✅ Store time-series data for graphs
- ✅ Dynamic efficiency baselines per user
- ✅ TTS without acronyms
- ✅ Comprehensive post-run visualization

