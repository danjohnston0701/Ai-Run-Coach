# Quick Reference: Garmin Watch Integration

## What's Done ✅

```
✅ DATA CAPTURE
   • Watch: 23+ metrics every 2s
   • Phone: Real-time stream
   • Backend: Stores in runs + watch_biometric_samples
   • Database: Migration SQL ready

✅ WATCH APP (RunView.mc)
   • All 17 biomechanical fields added
   • Activity.getActivityInfo() integration
   • Personal HR zones (UserProfile.maxHeartRate)
   • GPS bearing + accuracy captured
   • All 23+ metrics streamed via PhoneLink

✅ ANDROID APP
   • WatchBiometricFrame data class
   • GarminWatchManager parsing complete
   • RunTrackingService integration
   • UploadRunRequest with all fields

✅ UI UPDATES
   • Connected Devices screen: Elite features listed
   • Garmin IQ tag logo displayed
   • "PREMIUM" badge (not "FEATURED")

✅ DOCUMENTATION
   • 9 comprehensive guides created
   • Code templates provided
   • Timeline and roadmap set
```

## What's Next ⏳

```
⏳ PHASE 1: AI ANALYSIS (Sprint 1 — 2 weeks)
   1. Write enhanced Claude prompts
   2. Create analysis data models
   3. Parse Claude response
   4. Display in AI Insights tab
   5. Add Garmin attribution

⏳ PHASE 2: GRAPHS (Sprint 2 — 3 weeks)
   1. Integrate Vico charting
   2. HR over distance graph
   3. Zone distribution graph
   4. HR vs elevation graph
   5. Add to Graphs tab

⏳ PHASE 3: DATA DISPLAY (Sprint 3 — 2 weeks)
   1. Biomechanical metrics section
   2. Benchmarks and assessments
   3. Color-coded status
   4. Full Garmin attribution
   5. Performance testing
```

---

## Key Files

### Documents (Read These)
| File | Purpose | Read First? |
|------|---------|-----------|
| `COMPLETE_GARMIN_VISION.md` | Full overview | ✅ YES |
| `GARMIN_DATA_INSIGHTS_AND_GRAPHS.md` | What users see | YES |
| `POST_RUN_ANALYSIS_ROADMAP.md` | Timeline | YES |
| `GARMIN_AI_ANALYSIS_IMPLEMENTATION.md` | Code templates | For devs |
| `QUICK_REFERENCE_GARMIN.md` | This file | ✅ Now |

### Code (Modify These)
| File | Change | Status |
|------|--------|--------|
| `garmin-companion-app/source/views/RunView.mc` | All 23+ metrics + streaming | ✅ DONE |
| `app/.../GarminWatchManager.kt` | Parsing + callbacks | ✅ DONE |
| `app/.../RunTrackingService.kt` | Storage + upload | ✅ DONE |
| `app/.../ConnectedDevicesScreen.kt` | UI updates | ✅ DONE |
| `shared/schema.ts` | Database fields | ✅ DONE |

### Database
| File | Status |
|------|--------|
| `GARMIN_WATCH_BIOMETRICS_MIGRATION.sql` | ✅ Ready to run |

---

## 23+ Metrics Captured

### GPS (6)
```
latitude, longitude, altitude, speed, bearing, gps_accuracy
```

### Biometrics (3)
```
heart_rate, heart_rate_zone, cadence
```

### Running Dynamics (5)
```
ground_contact_time, ground_contact_balance,
vertical_oscillation, vertical_ratio, stride_length
```

### Training Effect (4)
```
aerobic_training_effect, anaerobic_training_effect,
recovery_time_minutes, vo2_max_estimate
```

### Environmental (2)
```
ambient_pressure, elapsed_time
```

**Total: 20+ per 2-second frame + aggregates**

---

## Garmin Attribution

### Required Text
```
ℹ️ "Insights derived in part from Garmin device-sourced data."
```

### Placement
```
AI Insights    → Bottom of each analysis (italicized)
Graphs         → Bottom corner (small, gray)
Data Metrics   → Below metric group (caption)
```

### When to Use
```
✅ AI analyses using watch data
✅ Graphs using time-series data
✅ Biomechanical metric displays
✅ Zone distribution insights
✅ Training load analysis

❌ NOT NEEDED on basic stats (distance, time, pace) from phone GPS
```

---

## AI Insights Template

```
FORM & EFFICIENCY
[Compare GCT, VO, stride, balance to user baseline]
→ [Specific recommendation]

TRAINING LOAD
[Interpret TE 0-5, recovery time, VO2 trend]
→ [Next session recommendation]

PACE vs EFFORT
[Analyze pace, HR zones, cadence, TE alignment]
→ [User's sweet spot pace identified]

ELEVATION RESPONSE
[Climbing pace, descent control, HR sensitivity]
→ [Strength/improvement area highlighted]

ℹ️ Insights derived in part from Garmin device-sourced data.
```

---

## Graph Specs

### 1. HR Over Distance
```
X-Axis:  Distance (km)
Y-Axis:  Heart Rate (bpm)
Colors:  Zone 1-5 (blue → green → yellow → orange → red)
Markers: Elevation gain points
Stats:   Avg HR, Max HR (with km), Min HR
```

### 2. Zone Distribution
```
Format:  Horizontal bars or pie chart
Data:    % time in each zone (Z1-Z5)
Details: Pace range per zone, time in seconds
Insights: Zone balance assessment
```

### 3. HR vs Elevation
```
X-Axis:  Distance (km)
Y-Axis:  Heart Rate (bpm) + Grade overlay
Segments: Climb avg HR | Flat avg HR | Descent avg HR
Assessment: HR sensitivity ("high" | "normal" | "low")
```

---

## Database Queries

### Insert Time-Series
```sql
INSERT INTO watch_biometric_samples (...)
SELECT * FROM temp_sample
WHERE run_id = $1
```

### Get Metrics for Run
```sql
SELECT * FROM runs WHERE id = $1;
SELECT * FROM watch_biometric_samples 
WHERE run_id = $1 
ORDER BY elapsed_ms;
```

### Compute Baselines
```sql
SELECT AVG(avg_ground_contact_time) as normal_gct
FROM runs
WHERE user_id = $1 
  AND completed_at >= NOW() - INTERVAL '4 weeks'
  AND has_garmin_data = true;
```

---

## Code Integration Points

### 1. Claude Prompt
```kotlin
val prompt = buildGarminAnalysisPrompt(
    run = run,
    watchSamples = watchSamples,
    userBaseline = getUserBaseline(run.userId),
    terrainContext = computeTerrainContext(watchSamples)
)
```

### 2. Analysis Parsing
```kotlin
val analysis = parseAnalysisResponse(
    claudeResponse = response.content[0].text,
    hasGarminData = run.hasGarminData
)
```

### 3. Graph Data Preparation
```kotlin
val hrGraphData = prepareHeartRateGraphData(
    watchSamples = watchSamples,
    maxHr = run.maxHeartRate ?: 160
)
```

### 4. UI Rendering
```kotlin
HeartRateOverDistanceGraph(hrGraphData)
GarminAttribution()
```

---

## Garmin API Compliance

✅ **Required**:
- Transparent attribution on all Garmin-sourced data
- Clear disclosure to users
- Proper data handling

✅ **Provided**:
- Attribution message template
- Placement guidance
- Component ready to use

---

## Timeline Summary

```
THIS WEEK
  └─ Commit code + build IQ file

WEEK 1-2 (Sprint 1)
  └─ AI Analysis complete

WEEK 3-5 (Sprint 2)
  └─ Graphs complete

WEEK 6-7 (Sprint 3)
  └─ Data display + launch

TOTAL: 7 weeks to full elite system
```

---

## Testing Checklist

### Data Layer
- [ ] Watch streams 23+ metrics every 2s
- [ ] Phone receives all fields
- [ ] Database stores everything
- [ ] No data loss on network interruption

### Analysis Layer
- [ ] Claude receives all metrics
- [ ] Response parses correctly
- [ ] Analyses are sensible
- [ ] Garmin attribution present

### Visualization Layer
- [ ] Graphs render <500ms
- [ ] Readable on 5-6" screens
- [ ] Zone colors correct
- [ ] Scrolling smooth

### User Experience
- [ ] Users understand insights
- [ ] Benchmarks make sense
- [ ] Recommendations actionable
- [ ] Garmin attribution clear

---

## Files to Keep

```
✅ GARMIN_WATCH_BIOMETRICS_MIGRATION.sql
   → Run on Neon after merge

✅ COMPLETE_GARMIN_VISION.md
   → Team reference

✅ POST_RUN_ANALYSIS_ROADMAP.md
   → Project timeline

✅ GARMIN_AI_ANALYSIS_IMPLEMENTATION.md
   → Code templates for devs

✅ QUICK_REFERENCE_GARMIN.md
   → This file (daily reference)
```

---

## Success Definition

```
✅ All 23+ metrics flowing to database
✅ 4+ AI analyses generated per run
✅ 3 professional graphs displaying
✅ Biomechanical metrics with benchmarks
✅ Garmin attribution on every item
✅ <5 second load time
✅ Users feel like they have a personal coach
```

**WHEN ALL ABOVE = ELITE RUNNING APP ✨**

