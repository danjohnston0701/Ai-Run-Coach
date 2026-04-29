# Sprint 2: Visual Architecture - Complete System

## Data Flow: Watch → Phone → Backend → Claude → UI

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         GARMIN WATCH (IQ App)                            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Every 2 seconds during run:                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ _captureRunningDynamics()                                       │   │
│  │ ├─ Activity.getActivityInfo()  → GCT, VO, VR, stride, TE      │   │
│  │ ├─ Sensor.onSensor()            → Heart Rate, Cadence         │   │
│  │ └─ Position.onPosition()        → GPS, bearing, accuracy      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                       ↓                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PhoneLink.sendRunData()                                         │   │
│  │ {                                                               │   │
│  │   "lat": 37.7749, "lng": -122.4194,  "alt": 15,  "speed": 3.5 │   │
│  │   "hr": 142, "hrz": 3, "cad": 168,                            │   │
│  │   "gct": 247, "gcb": 51, "vo": 8.2, "vr": 5.8,                │   │
│  │   "stride": 1.42, "te": 2.1, "vo2": 45.3,                     │   │
│  │   "pressure": 101325, "bearing": 45                            │   │
│  │ }                                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                       ↓ (BLE stream)                                    │
└──────────────────────────────────────────────────────────────────────────┘
                             │
                             ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                       ANDROID APP (Phone)                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ GarminWatchManager.handleWatchMessage()                          │  │
│  │ ├─ Parse all 23+ fields from BLE message                        │  │
│  │ ├─ Create WatchBiometricFrame                                   │  │
│  │ └─ Emit onWatchSensorData callback                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ RunTrackingService.updateWatchSensorData(frame)                 │  │
│  │ ├─ Accumulate HR samples  (for accurate average)                │  │
│  │ ├─ Track max HR, cadence                                        │  │
│  │ ├─ Accumulate GCT, VO, VR, stride  (for phase 2)               │  │
│  │ └─ Update _currentRunSession with latest metrics                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓ (every 2s - live coaching ready)                │
│                                                                          │
│  During Run: Metrics available for LIVE COACHING                        │
│  ├─ currentHeartRate (updated every 2s)                                 │
│  ├─ currentCadence                                                      │
│  ├─ avgGroundContactTime, maxVerticalOscillation                        │
│  ├─ estimatedFatigue (0-100)                                            │
│  └─ trainingEffect (real-time accumulation)                             │
│                       ↓ (at run end)                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ RunTrackingService.uploadRunToBackend()                          │  │
│  │ ├─ Finalize all metrics (averages, totals)                      │  │
│  │ ├─ Set hasGarminData = true (if watch connected)                │  │
│  │ ├─ Set garminDeviceName = watch.getDisplayName()                │  │
│  │ └─ Send UploadRunRequest with ALL 25+ fields                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓ POST /api/runs/{id}/upload                      │
└──────────────────────────────────────────────────────────────────────────┘
                             │
                             ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js)                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ POST /api/runs/{id}/upload (routes.ts)                           │  │
│  │ ├─ Receive RunUploadRequest with 25+ metrics                    │  │
│  │ ├─ hasGarminData = true, garminDeviceName = "VivoActive 4"      │  │
│  │ ├─ Store in database (runs table + watch_biometric_samples)     │  │
│  │ └─ Enrich with computed fields (terrain, fatigue)               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ POST /api/runs/{id}/comprehensive-analysis                       │  │
│  │                                                                  │  │
│  │ Request:                                                        │  │
│  │ {                                                               │  │
│  │   runId, garminDataSummary: {                                   │  │
│  │     deviceName, avgGCT, avgVO, stride, TE, VO2Max,             │  │
│  │     recoveryTime, aerobicTE, anaerobicTE, estimatedFatigue      │  │
│  │   },                                                            │  │
│  │   userProfile: {                                                │  │
│  │     whatIKnowAboutYou,                                           │  │
│  │     baselineGCT, baselineVO, baselineVR,                         │  │
│  │     baselineStride, baselineCadence,                             │  │
│  │     baselineMaxHR, baselineRestingHR                             │  │
│  │   }                                                             │  │
│  │ }                                                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ai-service.ts → generateComprehensiveRunAnalysis()              │  │
│  │                                                                  │  │
│  │ Builds SMART PROMPT:                                            │  │
│  │                                                                  │  │
│  │ "## ABOUT THIS RUNNER                                           │  │
│  │  Sarah is a distance runner, prefers Z3 steady-state runs..."   │  │
│  │                                                                  │  │
│  │  ## GARMIN WATCH METRICS (Device: VivoActive 4)                │  │
│  │  GCT: 247ms — baseline: 245ms (+0.8%)                          │  │
│  │  VO: 8.4cm — baseline: 8.2cm (+2.4%)                           │  │
│  │  Stride: 1.42m (perfect for height)                             │  │
│  │  TE: 3.8/5.0 aerobic                                            │  │
│  │  VO2 Max: 52.1 ml/kg/min (excellent)                            │  │
│  │  Recovery: 1.5 hours                                            │  │
│  │  Fatigue: 48% (moderate)"                                       │  │
│  │                                                                  │  │
│  │  [NO GARMIN SECTION IF run.hasGarminData == false]              │  │
│  │                                                                  │  │
│  │  ## ANALYSIS FOCUS                                              │  │
│  │  [Terrain context]                                              │  │
│  │  [Fatigue-aware expectations]                                   │  │
│  │  [Personalized coaching]"                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Call Claude API with RICH CONTEXT                               │  │
│  │ Claude understands:                                             │  │
│  │ ├─ This runner's individual metrics & baselines                 │  │
│  │ ├─ Terrain challenges encountered                               │  │
│  │ ├─ Fatigue level (48% = moderate effort)                        │  │
│  │ ├─ Form quality (GCT, VO within normal range)                   │  │
│  │ ├─ Training effect & recovery needs                             │  │
│  │ └─ Historical context & progress                                │  │
│  │                                                                  │  │
│  │ Generates response like:                                        │  │
│  │ "Excellent session Sarah! GCT +0.8%, VO +2.4%, stride perfect  │  │
│  │  Form held beautifully through 48% fatigue. TE 3.8 is strong   │  │
│  │  for base building. Recovery in 1.5h, easy run recommended      │  │
│  │  tomorrow. This pace mix is building excellent aerobic base."   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓ ComprehensiveRunAnalysis response              │
└──────────────────────────────────────────────────────────────────────────┘
                             │
                             ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                   DATABASE (Neon PostgreSQL)                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ runs table — 25+ new columns for Garmin metrics                 │  │
│  │ ├─ avgGroundContactTime, min/maxGCT                             │  │
│  │ ├─ avgVerticalOscillation, min/maxVO                            │  │
│  │ ├─ minStrideLength, maxStrideLength, avgStride                  │  │
│  │ ├─ avgVerticalRatio, aerobicTE, anaerobicTE                     │  │
│  │ ├─ recoveryTimeMinutes, vo2MaxEstimate                          │  │
│  │ ├─ avgAmbientPressure, avgBearing                               │  │
│  │ ├─ garminDeviceName                                             │  │
│  │ └─ Time-series JSONB arrays (groundContactTimeData, etc.)       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ watch_biometric_samples table — Every 2-second frame            │  │
│  │ ├─ run_id, sampled_at, elapsed_ms                               │  │
│  │ ├─ latitude, longitude, altitude_m, speed_ms, bearing_deg       │  │
│  │ ├─ heart_rate, cadence, heart_rate_zone                         │  │
│  │ ├─ gct_ms, gcb_pct, vo_cm, vr_pct, stride_m                     │  │
│  │ ├─ ae_training_effect, an_training_effect, vo2_max             │  │
│  │ ├─ ambient_pressure_pa, terrain_grade_pct                       │  │
│  │ ├─ estimated_fatigue_pct                                        │  │
│  │ └─ coaching_cue (for live coaching replay)                      │  │
│  │ Indexes: (run_id, elapsed_ms), (user_id, sampled_at)            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                       ↓                                                 │
└──────────────────────────────────────────────────────────────────────────┘
                             │
                             ↓ Return data to app
┌──────────────────────────────────────────────────────────────────────────┐
│                 RunSummaryScreen (Android App)                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ╔═══════════════════════════════════════════════════════════════════╗  │
│  ║        🏃 RUN SUMMARY - Garmin VivoActive 4                      ║  │
│  ║        8km in 38:45  |  4:50/km avg  |  23°C, 60% humidity      ║  │
│  ╠═══════════════════════════════════════════════════════════════════╣  │
│  │                                                                   │  │
│  │ 📍 GARMIN ATTRIBUTION HEADER (Pinned)                            │  │
│  │ ┌────────────────────────────────────────────────────────────┐   │  │
│  │ │ [GARMIN tag logo]  VivoActive 4                           │   │  │
│  │ └────────────────────────────────────────────────────────────┘   │  │
│  │                                                                   │  │
│  │ === AI INSIGHTS TAB ============================================  │  │
│  │ ✨ AI Analysis                                                   │  │
│  │ "Excellent aerobic base builder. Your GCT held stable at 247ms   │  │
│  │  (+0.8% from baseline), VO increased 2.4% — normal fatigue       │  │
│  │  form degradation. Stride length perfect for your height at       │  │
│  │  1.42m. You maintained Z3 discipline (65% of run) with excellent │  │
│  │  pacing. TE score 3.8/5 is strong for base work. Recovery in     │  │
│  │  1.5 hours. Recommendation: Easy run tomorrow, hard session in    │  │
│  │  2 days."                                                         │  │
│  │                                                                   │  │
│  │ === SUMMARY TAB ===============================================  │  │
│  │ Heart Rate: 148 bpm avg (baseline: 146, +1.4%)                   │  │
│  │ Max HR: 162 bpm (89% of max)                                     │  │
│  │ HR Drift: +14 bpm (normal for distance)                          │  │
│  │ Elevation: +480m gain                                            │  │
│  │ Temperature: 23°C (ideal conditions)                             │  │
│  │ Pace Distribution: 70% Z3, 22% Z4, 8% Z2                        │  │
│  │                                                                   │  │
│  │ === GRAPHS TAB ===============================================  │  │
│  │                                                                   │  │
│  │ 🔴 Heart Rate Analysis [expand ↓]                               │  │
│  │ ├─ [HR Over Time chart]                                          │  │
│  │ ├─ [HR Over Distance chart]                                      │  │
│  │ ├─ [HR Zone Distribution %]                                      │  │
│  │ └─ [HR vs Elevation scatter]                                     │  │
│  │                                                                   │  │
│  │ 💪 Running Dynamics [expand ↓]  (Garmin data)                    │  │
│  │ ├─ [GCT Over Distance chart]                                     │  │
│  │ ├─ [VO Over Distance chart]                                      │  │
│  │ ├─ [Stride Length Variation]                                     │  │
│  │ └─ [Vertical Ratio (Efficiency)]                                 │  │
│  │                                                                   │  │
│  │ 🔄 Multi-Metric Analysis [expand ↓]                             │  │
│  │ ├─ [HR vs GCT scatter]                                           │  │
│  │ ├─ [Pace vs GCT scatter]                                         │  │
│  │ ├─ [TE vs HR Drift]                                              │  │
│  │ └─ [Elevation Profile + HR]                                      │  │
│  │                                                                   │  │
│  │ === DATA TAB ================================================  │  │
│  │ Heart Rate                                                       │  │
│  │ • Average: 148 bpm                                               │  │
│  │ • Max: 162 bpm                                                   │  │
│  │ • Min: 118 bpm                                                   │  │
│  │ • Drift: +14 bpm (+9.5%)                                         │  │
│  │                                                                   │  │
│  │ ℹ️  "This data derived in part from Garmin device data"           │  │
│  │                                                                   │  │
│  │ Running Dynamics (from Garmin)                                   │  │
│  │ • Avg GCT: 247ms  (baseline: 245ms, +0.8%)                       │  │
│  │ • Avg VO: 8.4cm   (baseline: 8.2cm, +2.4%)                       │  │
│  │ • Avg Stride: 1.42m  (perfect)                                   │  │
│  │ • Avg Cadence: 168 spm                                           │  │
│  │ • TE Score: 3.8/5.0 aerobic                                      │  │
│  │ • VO2 Max: 52.1 ml/kg/min                                        │  │
│  │ • Recovery: 1.5 hours                                            │  │
│  │                                                                   │  │
│  │ ℹ️  "Ground contact, oscillation, and other running metrics       │  │
│  │      derived from Garmin VivoActive 4 watch"                     │  │
│  │                                                                   │  │
│  ╚═══════════════════════════════════════════════════════════════════╝  │
│                                                                          │
│  All graphs use:                                                        │
│  ✓ Smart axis margins (no distortion)                                  │
│  ✓ Baseline comparison lines                                            │
│  ✓ Elevation context shading                                            │
│  ✓ Zone color coding (Z1-Z5)                                            │
│  ✓ Actionable insight cards                                             │
│  ✓ Responsive design (phone & tablet)                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
RunSummaryScreen
├── GarminAttributionHeader (pinned)
│   └─ Garmin tag logo + device name
│
├── Scaffold(topBar = RunSummaryTopBarFlagship)
│   └─ Navigation tabs
│
├── Column (main content)
│
    ├── Tab 0: AiInsightsTabContent
    │   └─ Claude-generated insights
    │
    ├── Tab 1: SummaryTabFlagship
    │   ├─ Key statistics cards
    │   ├─ KM splits
    │   ├─ Achievement badges
    │   └─ Struggle points
    │
    ├── Tab 2: GraphsTabContent ✨ NEW
    │   │
    │   ├─ GraphSectionHeader("Heart Rate Analysis")
    │   │  └─ [When expanded] 4 HR graphs
    │   │     ├─ HR Over Time
    │   │     ├─ HR Over Distance
    │   │     ├─ HR Zone Distribution
    │   │     └─ HR vs Elevation
    │   │
    │   ├─ GraphSectionHeader("Running Dynamics")  [Garmin only]
    │   │  └─ [When expanded] 4 dynamics graphs (Phase 2)
    │   │
    │   └─ GraphSectionHeader("Multi-Metric Analysis")
    │      └─ [When expanded] 4 correlation graphs (Phase 3)
    │
    ├── Tab 3: DataTabFlagship
    │   ├─ Raw metrics cards
    │   ├─ Heart rate data
    │   ├─ Running dynamics
    │   ├─ Elevation profile
    │   └─ Garmin disclosure
    │
    └── Tab 4: AchievementsTabFlagship
        └─ Badges & records
```

---

## Data Extraction Helpers (RunSessionGraphHelpers.kt)

```
RunSession
    │
    ├─ getHeartRateOverTime()
    │  └─ Returns: [(timeSecond, HR), ...]
    │     Usage: LineChart X=time, Y=HR
    │
    ├─ getHeartRateOverDistance()
    │  └─ Returns: [(distanceKm, HR), ...]
    │     Usage: LineChart X=distance, Y=HR
    │
    ├─ getHeartRateZoneDistribution()
    │  └─ Returns: {Z1: 0.5%, Z2: 12.3%, Z3: 65.2%, Z4: 22.0%, Z5: 0%}
    │     Usage: StackedBarChart
    │
    ├─ getHeartRateVsElevation()
    │  └─ Returns: [(elevationM, HR, grade%), ...]
    │     Usage: ScatterChart (colored by grade)
    │
    ├─ getHeartRateDrift()
    │  └─ Returns: (initialHR, finalHR)
    │     Usage: Insight - "HR increased X bpm"
    │
    ├─ getHeartRateVariability()
    │  └─ Returns: 4.2 (std deviation in bpm)
    │     Usage: Insight - "Very stable HR" or "Variable effort"
    │
    ├─ getWarmupTime()
    │  └─ Returns: 240 (seconds to reach target)
    │     Usage: Insight - "Reached target in 4 minutes"
    │
    └─ [Phase 2/3 helpers for GCT, VO, stride]
```

---

## The Complete Workflow

```
1. PREPARATION (Android App)
   └─ User starts run with Garmin watch connected
      └─ GarminWatchManager ready to receive updates

2. DURING RUN (Watch → Phone, every 2 seconds)
   ├─ Watch: _captureRunningDynamics() → 23+ metrics
   ├─ Watch: PhoneLink.sendRunData() → BLE stream
   ├─ Phone: GarminWatchManager.handleWatchMessage()
   ├─ Phone: RunTrackingService.updateWatchSensorData()
   └─ Phone: _currentRunSession updated with live metrics
      └─ LIVE COACHING READY (next sprint)

3. RUN COMPLETION (Android App)
   ├─ Finalize all metrics
   ├─ Build UploadRunRequest with 25+ fields
   ├─ Set hasGarminData = true
   ├─ Set garminDeviceName = "VivoActive 4"
   └─ POST /api/runs/{id}/upload → Backend

4. BACKEND PROCESSING
   ├─ Store run in database (runs table)
   ├─ Store biometric samples (watch_biometric_samples table)
   ├─ Compute baselines from 4-week history
   ├─ Build smart Claude prompt with Garmin context
   ├─ Call Claude API
   └─ Return ComprehensiveRunAnalysis

5. UI DISPLAY
   ├─ Download run data + analysis
   ├─ RunSummaryScreen displays:
   │  ├─ Pinned Garmin attribution header
   │  ├─ AI Insights tab (Claude analysis)
   │  ├─ Summary tab (key metrics)
   │  ├─ Graphs tab (14 visualizations)
   │  ├─ Data tab (raw metrics)
   │  └─ Achievements tab (badges)
   │
   └─ User sees complete run story:
      ├─ What happened (graphs)
      ├─ Why it happened (AI analysis with context)
      └─ What to do next (personalized recommendations)
```

---

## Ready to Build! 🚀

**All infrastructure is in place.**

Next phase: **Build the 14 graphs using these helpers and visualizations will come alive.** ✨

