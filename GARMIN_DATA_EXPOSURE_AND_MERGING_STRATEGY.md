# Garmin Data Exposure & Activity Merging Strategy

## 🎯 Overview

This document outlines how to expose all 11+ Garmin webhook data streams to users through the AiRunCoach app, and critically, how to intelligently merge Garmin activity data with existing AiRunCoach run sessions to avoid duplicates while enriching run data.

---

## 📱 **User-Facing Data Exposure**

### **1. Dashboard Home Screen**

```
┌─────────────────────────────────────────┐
│         WELLNESS SNAPSHOT               │
├─────────────────────────────────────────┤
│ ❤️ HRV Status: BALANCED (67 ms)         │
│ 😰 Today's Stress: 48/100 (MODERATE)   │
│ 🔋 Body Battery: 65/100 (GOOD)         │
│ 😴 Sleep Score: 74/100 (EXCELLENT)     │
│ 🫁 SpO2: 98% (OPTIMAL)                 │
│ 🌡️ Skin Temp: -1.5°C (STABLE)          │
│ 🏃 Fitness Level: VO2Max 46 (EXCELLENT)│
│ 📅 Fitness Age: 21 years (9y younger)  │
└─────────────────────────────────────────┘
```

**Data Sources**:
- HRV: `garminWellnessMetrics.lastNightAvg`
- Stress: `garminWellnessMetrics.averageStressLevel`
- Body Battery: `garminWellnessMetrics.averageBodyBattery`
- Sleep: `garminWellnessMetrics.sleepScore`
- SpO2: `garminWellnessMetrics.avgSpO2`
- Skin Temp: `garminSkinTemperature.avgTemperature`
- VO2Max: `garminWellnessMetrics.vo2Max`
- Fitness Age: `garminWellnessMetrics.fitnessAge`

---

### **2. Run History Screen** (Enhanced with Garmin Data)

```
┌──────────────────────────────────────────┐
│ Morning Run - March 12, 2026             │
│ 🏃 5 km | 30:45 | 6:09/km               │
├──────────────────────────────────────────┤
│ METRICS                                  │
│ ❤️ Avg HR: 145 bpm | Max: 182 bpm       │
│ 💨 Avg Pace: 6:09/km                    │
│ ⛰️ Elevation: 45m gain                  │
│ 🔥 Calories: 425 kcal                   │
├──────────────────────────────────────────┤
│ GARMIN ENRICHMENT                        │
│ 🎯 Activity Type: Running (MoveIQ)      │
│ 🏅 Activity Sub-Type: Tempo Run         │
│ 📊 Intensity Distribution:               │
│    Sedentary: 2% | Active: 65%          │
│    Highly Active: 33%                   │
│ 💪 MET Values: Avg 14.2                 │
│ ❤️ HR Zones:                            │
│    Z1: 5% | Z2: 25% | Z3: 40%          │
│    Z4: 20% | Z5: 10%                   │
│ 📈 Pace Graph (time series)              │
│ 📊 HR Zones Distribution Chart           │
└──────────────────────────────────────────┘
```

**Merged Data**:
- Activity details: `garminActivities.*`
- GPS/samples: `garminActivities.samples`
- MoveIQ classification: `garminMoveIQ.activitySubType`
- Intensity breakdown: `garminEpochsAggregate.*`
- HR zones: Calculated from time-series data

---

### **3. Daily Wellness Tab**

```
┌──────────────────────────────────────────┐
│ MARCH 12, 2026 - WELLNESS OVERVIEW       │
├──────────────────────────────────────────┤
│ SLEEP (Last Night)                       │
│ ⏱️ Duration: 9h 16m (GOOD)               │
│ 😴 Deep: 7.6% (POOR)                    │
│ 💤 Light: 71.4% (EXCELLENT)             │
│ 🌙 REM: 21.0% (GOOD)                    │
│ ⚠️ Awakenings: 2 times                  │
│ 😰 Stress During Sleep: FAIR             │
│ 🧊 SpO2 During Sleep: 97-98%            │
│ Score: 32/100 (FAIR)                    │
│                                         │
│ DAILY ACTIVITY                           │
│ 🏃 Activities: 2 runs                   │
│ ���️ Total Time: 1h 15m                    │
│ 📏 Distance: 9.2 km                     │
│ 🔥 Calories: 789 kcal                   │
│                                         │
│ DAILY STRESS                             │
│ 😰 Avg Stress: 48/100 (MODERATE)        │
│ 📈 Peak: 77/100 (High spike 2:30 PM)    │
│ 🔋 Battery Impact:                      │
│    Sleep: +13% | Naps: +18%            │
│    Activity: -23%                       │
│ Current Battery: HIGH ✅                 │
│                                         │
│ EPOCHS BREAKDOWN (Minute-by-minute)     │
│ 🚶 Sedentary: 14h 22m (64%)             │
│ 🏃 Active: 8h 15m (36%)                 │
│                                         │
│ HEALTH SNAPSHOTS (5-sec intervals)      │
│ ❤️ HR Range: 58-102 bpm                 │
│ 😰 Stress: 8-44 (avg 24)                │
│ 🫁 SpO2: 97.6-98.7%                     │
│ 🌬️ Respiration: 11-14 bpm               │
└──────────────────────────────────────────┘
```

**Data Sources**:
- Sleep: `garminWellnessMetrics` (sleep scores, stages)
- Activities: `garminActivities` + `runs`
- Stress: `garminWellnessMetrics.stressReadings`
- Body Battery: `garminWellnessMetrics.bodyBatteryReadings`
- Epochs: `garminEpochsAggregate` (aggregated) + `garminEpochsRaw` (7-day)
- Health Snapshots: `garminHealthSnapshots` (30-day)

---

### **4. Health Metrics Tab**

```
┌──────────────────────────────────────────┐
│ FITNESS & HEALTH METRICS                 │
├──────────────────────────────────────────┤
│ CARDIOVASCULAR HEALTH                    │
│ VO2 Max: 46.0 mL/kg/min (EXCELLENT) 🏆  │
│   Status: Elite aerobic fitness          │
│   Trend: ↗ +2.3 this month               │
│                                         │
│ BIOLOGICAL AGE                           │
│ Fitness Age: 21 years (EXCELLENT) 🎯    │
│ Chronological Age: 30 years              │
│ Difference: 9 years younger! ✅         │
│   Meaning: Your fitness exceeds your age │
│                                         │
│ HEART RATE VARIABILITY                   │
│ Last Night HRV: 67 ms (BALANCED)        │
│ 7-Day Avg: 71 ms                        │
│ Status: Excellent recovery               │
│ Trend: Stable                           │
│                                         │
│ BLOOD PRESSURE                           │
│ Latest: 124/65 mmHg (ELEVATED) ⚠️       │
│ Classification: Elevated but not high    │
│ 7-Day Avg: 118/62 mmHg                  │
│                                         │
│ MENSTRUAL/REPRODUCTIVE                   │
│ Status: PREGNANT - 2nd Trimester 🤰     │
│ Weeks: 20 weeks                         │
│ Due Date: Dec 10, 2026                  │
│ Babies: Single                          │
│ Gestational Health: Normal ✅            │
│ Blood Glucose: 87 mg/dL (normal)       │
│                                         │
│ SKIN TEMPERATURE                         │
│ Current: 31.95°C (-1.55°C deviation)    │
│ Trend: STABLE (cooling)                 │
│ 7-Day Avg: 33.2°C                       │
│                                         │
│ RESPIRATION                              │
│ Today's Avg: 11-15 bpm (normal)        │
│ Sleep Avg: 12 bpm                       │
│ Waking Avg: 14 bpm                      │
└──────────────────────────────────────────┘
```

**Data Sources**:
- VO2Max: `garminWellnessMetrics.vo2Max`
- Fitness Age: `garminWellnessMetrics.fitnessAge`
- HRV: `garminWellnessMetrics.lastNightAvg` (time series)
- Blood Pressure: `garminBloodPressure.*`
- Menstrual/Pregnancy: `garminWellnessMetrics` (cycle fields)
- Skin Temp: `garminSkinTemperature.*`
- Respiration: `garminWellnessMetrics.avgWakingRespirationValue`

---

### **5. Training Insights Tab**

Based on all Garmin data to provide personalized guidance:

```
┌──────────────────────────────────────────┐
│ PERSONALIZED TRAINING RECOMMENDATIONS    │
├──────────────────────────────────────────┤
│ TODAY'S STATUS                           │
│ 🟢 Ready for Training                    │
│                                         │
│ REASONING:                               │
│ ✅ Sleep quality: 74/100 (EXCELLENT)   │
│ ✅ HRV status: BALANCED (good recovery) │
│ ✅ Body battery: 65/100 (GOOD)          │
│ ✅ Stress level: 48/100 (manageable)   │
│ ⚠️ Pregnancy: 2nd trimester (modify)   │
│                                         │
│ RECOMMENDED WORKOUT                      │
│ Type: MODERATE CARDIO                   │
│ Duration: 30-45 minutes                 │
│ Intensity: Zone 2-3 (moderate)          │
│ Why: Good recovery, avoid high intensity│
│       during pregnancy                  │
│                                         │
│ AVOID:                                   │
│ ❌ High-intensity intervals              │
│ ❌ Contact sports                        │
│ ❌ Extreme heat/cold                     │
│                                         │
│ THIS WEEK'S TREND                        │
│ Mon: Intensity too high (-23% battery)  │
│ Tue: Good balance (+8% battery)         │
│ Wed: Excellent recovery (+16% battery)  │
│ Thu: Moderate activity ✅               │
│                                         │
│ FOCUS AREAS                              │
│ 1. Maintain moderate fitness (VO2Max OK)│
│ 2. Prioritize sleep (deep sleep low)    │
│ 3. Manage stress (spike at 2:30 PM)    │
│ 4. Prepare for 3rd trimester            │
└──────────────────────────────────────────┘
```

---

## 🔄 **Activity Merging Strategy**

### **The Problem**

User starts AiRunCoach app for a run session, completes run, and has Garmin watch also tracking the same run. Without merging:
- **Problem**: Two duplicate run records created
- **Impact**: Confused history, conflicting data, poor analytics
- **Solution**: Intelligent fuzzy matching and data merging

### **The Solution: Fuzzy Matching Algorithm**

```typescript
interface ActivityMergeCandidate {
  aiRunCoachRunId: string;
  garminActivityId: string;
  matchScore: number; // 0-100
  matchReasons: string[];
}

function fuzzyMatchGarminToAiRunCoachRun(
  garminActivity: GarminActivity
): ActivityMergeCandidate | null {
  // Score matches on multiple criteria
  
  const candidates = db.query.runs.findMany({
    where: and(
      eq(runs.userId, garminActivity.userId),
      // Within 24-hour window of Garmin activity
      gte(runs.startTime, new Date(garminActivity.startTimeInSeconds * 1000 - 24 * 60 * 60 * 1000)),
      lte(runs.startTime, new Date(garminActivity.startTimeInSeconds * 1000 + 24 * 60 * 60 * 1000)),
    )
  });

  let bestMatch: ActivityMergeCandidate | null = null;

  for (const aiRunCoachRun of candidates) {
    let matchScore = 0;
    const matchReasons: string[] = [];

    // 1. TIME MATCHING (Weight: 30 points)
    const timeDiffSeconds = Math.abs(
      aiRunCoachRun.startTime.getTime() / 1000 - garminActivity.startTimeInSeconds
    );
    
    if (timeDiffSeconds < 60) {
      matchScore += 30;
      matchReasons.push("Exact time match (<1 min diff)");
    } else if (timeDiffSeconds < 300) {
      matchScore += 25;
      matchReasons.push("Close time match (<5 min diff)");
    } else if (timeDiffSeconds < 900) {
      matchScore += 15;
      matchReasons.push("Reasonable time match (<15 min diff)");
    } else if (timeDiffSeconds < 3600) {
      matchScore += 5;
      matchReasons.push("Same hour");
    }

    // 2. DISTANCE MATCHING (Weight: 30 points)
    const distanceDiffPercent = Math.abs(
      (aiRunCoachRun.distance - garminActivity.distanceInMeters / 1000) / 
      aiRunCoachRun.distance * 100
    );
    
    if (distanceDiffPercent < 5) {
      matchScore += 30;
      matchReasons.push("Exact distance match (<5% diff)");
    } else if (distanceDiffPercent < 15) {
      matchScore += 20;
      matchReasons.push("Very close distance (<15% diff)");
    } else if (distanceDiffPercent < 30) {
      matchScore += 10;
      matchReasons.push("Close distance (<30% diff)");
    }

    // 3. DURATION MATCHING (Weight: 20 points)
    const durationDiffPercent = Math.abs(
      (aiRunCoachRun.duration - garminActivity.durationInSeconds) / 
      aiRunCoachRun.duration * 100
    );
    
    if (durationDiffPercent < 5) {
      matchScore += 20;
      matchReasons.push("Exact duration match (<5% diff)");
    } else if (durationDiffPercent < 15) {
      matchScore += 15;
      matchReasons.push("Very close duration (<15% diff)");
    } else if (durationDiffPercent < 30) {
      matchScore += 8;
      matchReasons.push("Close duration (<30% diff)");
    }

    // 4. ACTIVITY TYPE MATCHING (Weight: 10 points)
    const isRunningActivity = [
      'RUNNING', 'TRAIL_RUNNING', 'TRACK_RUNNING',
      'WHEELCHAIR_PUSH_RUN', 'HURDLES', 'INTERVAL', 'TEMPO'
    ].includes(garminActivity.activityType);
    
    if (isRunningActivity && aiRunCoachRun.type === 'RUN') {
      matchScore += 10;
      matchReasons.push("Activity type matches (running)");
    }

    // 5. NO EXISTING GARMIN DATA (Weight: 10 points)
    if (!aiRunCoachRun.garminActivityId) {
      matchScore += 10;
      matchReasons.push("No existing Garmin data linked");
    } else {
      // If already has Garmin data, don't match again
      matchScore = 0;
      continue;
    }

    // Check if this is best match and meets threshold
    if (matchScore > 50 && matchScore > (bestMatch?.matchScore || 0)) {
      bestMatch = {
        aiRunCoachRunId: aiRunCoachRun.id,
        garminActivityId: garminActivity.id,
        matchScore,
        matchReasons
      };
    }
  }

  return bestMatch;
}
```

### **Match Scoring Breakdown**

| Criterion | Max Points | Threshold | Why |
|-----------|-----------|-----------|-----|
| Time matching | 30 | <15 min diff | Start times should align closely |
| Distance matching | 30 | <30% diff | Routes may vary slightly |
| Duration matching | 20 | <30% diff | Pace variations are normal |
| Activity type | 10 | Must be running | Ensures we're matching right activity |
| No existing data | 10 | Required | Prevent duplicate merging |
| **TOTAL** | **100** | **>50 required** | Safe margin for confidence |

### **Merge Score Examples**

```
PERFECT MATCH (95 points):
- AiRunCoach: 14:30:15 start, 5.2 km, 31:45 duration
- Garmin: 14:30:20 start, 5.1 km, 31:52 duration
- Time: 25 points (5 sec diff)
- Distance: 30 points (<2% diff)
- Duration: 20 points (2% diff)
- Type: 10 points (running)
- No existing: 10 points
- ✅ MERGE RECOMMENDED

GOOD MATCH (72 points):
- AiRunCoach: 14:30:00 start, 5 km, 31 min duration
- Garmin: 14:35:00 start, 5.2 km, 33 min duration
- Time: 15 points (5 min diff)
- Distance: 20 points (4% diff)
- Duration: 15 points (6% diff)
- Type: 10 points (running)
- No existing: 12 points (50% confidence)
- ✅ MERGE RECOMMENDED

POOR MATCH (38 points):
- AiRunCoach: 14:30:00 start, 5 km, 31 min duration
- Garmin: 16:00:00 start, 8 km, 55 min duration
- Time: 0 points (90 min diff)
- Distance: 5 points (60% diff)
- Duration: 3 points (77% diff)
- Type: 10 points (running)
- No existing: 20 points
- ❌ DON'T MERGE - Likely different runs
```

---

### **Data Merge Process**

When a match is found with score >50:

```typescript
async function mergeGarminActivityWithAiRunCoachRun(
  aiRunCoachRunId: string,
  garminActivity: GarminActivity
): Promise<void> {
  
  // 1. Use Garmin data as primary source for metrics
  const enhancedData = {
    garminActivityId: garminActivity.id,
    
    // Use Garmin metrics (more accurate due to wearable)
    distance: garminActivity.distanceInMeters / 1000,
    duration: garminActivity.durationInSeconds,
    avgHeartRate: garminActivity.averageHeartRateInBeatsPerMinute,
    maxHeartRate: garminActivity.maxHeartRateInBeatsPerMinute,
    calories: garminActivity.activeKilocalories,
    
    // Add enriched data
    elevationGain: garminActivity.totalElevationGainInMeters,
    avgPace: garminActivity.averagePaceInMinutesPerKilometer,
    avgSpeed: garminActivity.averageSpeedInMetersPerSecond,
    activityType: garminActivity.activityType,
    deviceName: garminActivity.deviceName,
    
    // Store references for later queries
    hasGarminData: true,
    garminSummaryId: garminActivity.summaryId,
    
    // Preserve AiRunCoach data if enriching
    // (keep notes, custom goals, user edits)
  };

  // 2. Store samples/detailed data separately
  if (garminActivity.samples) {
    await db.insert(garminActivitySamples).values({
      runId: aiRunCoachRunId,
      samples: garminActivity.samples,
      createdAt: new Date(),
    });
  }

  // 3. Store MoveIQ data (activity sub-type)
  if (garminActivity.activitySubType) {
    await db.update(runs)
      .set({
        activitySubType: garminActivity.activitySubType
      })
      .where(eq(runs.id, aiRunCoachRunId));
  }

  // 4. Link data and update run record
  await db.update(runs)
    .set(enhancedData)
    .where(eq(runs.id, aiRunCoachRunId));

  // 5. Log merge for audit trail
  await db.insert(activityMergeLog).values({
    aiRunCoachRunId,
    garminActivityId: garminActivity.id,
    mergeScore: matchScore,
    mergedAt: new Date(),
    userId: garminActivity.userId,
  });
}
```

---

## 📊 **Display Merged Data in Run Details**

```
┌────────────────────────────────────────────────────┐
│ Morning Run - March 12, 2026                       │
│ 🏃 Merged with Garmin Data ✓                       │
├────────────────────────────────────────────────────┤
│ SOURCE DATA INDICATORS                              │
│ 🔷 AiRunCoach: User input, GPS tracking            │
│ 🔶 Garmin: Wearable device metrics                 │
│                                         │
│ CORE METRICS                                       │
│ Distance: 5.2 km 🔶                                │
│ Duration: 31:45 🔶                                 │
│ Avg Pace: 6:05/km 🔶                              │
│ Avg Speed: 9.85 km/h 🔶                            │
│ Elevation Gain: 45 m 🔶                            │
│                                                    │
│ HEART RATE DATA (Garmin Watch)                     │
│ Avg HR: 145 bpm 🔶                                 │
│ Max HR: 182 bpm 🔶                                 │
│ HR Zones:                                         │
│   Zone 1: 2% | Zone 2: 15%                        │
│   Zone 3: 38% | Zone 4: 35%                       │
│   Zone 5: 10%                                     │
│                                                    │
│ ENERGY EXPENDITURE                                 │
│ Active Calories: 425 kcal 🔶                       │
│ Total Calories: 455 kcal 🔶                        │
│                                                    │
│ ACTIVITY CLASSIFICATION (MoveIQ)                   │
│ Type: Running 🔶                                   │
│ Sub-Type: Tempo Run 🔶                             │
│ Intensity Distribution:                            │
│   Sedentary: 2% | Active: 65% | Very Active: 33%│
│                                                    │
│ TRAINING METRICS                                   │
│ Training Stress Score (TSS): 87 pts                │
│ Intensity Factor: 1.08                             │
│ Recommendations: Good workout, monitor recovery   │
│                                                    │
│ GPS MAP (from Garmin)                              │
│ [Interactive map with route visualization]         │
│                                                    │
│ PACE GRAPH (time series from Garmin)               │
│ [Graph showing pace changes throughout run]       │
│                                                    │
│ HEART RATE GRAPH (time series from Garmin)         │
│ [Graph showing HR changes throughout run]         │
│                                                    │
│ PERSONAL NOTES 🔷                                  │
│ "Felt strong today, good tempo work"              │
│                                                    │
│ MERGE DETAILS                                      │
│ Merged with Garmin activity ID: ...               │
│ Merge confidence: 95%                             │
│ Last updated: Today at 14:45                      │
└────────────────────────────────────────────────────┘
```

---

## 🏗️ **Implementation Architecture**

### **New Database Tables**

```sql
-- Store references between AiRunCoach and Garmin
CREATE TABLE activity_merge_log (
  id UUID PRIMARY KEY,
  ai_run_coach_run_id UUID REFERENCES runs(id),
  garmin_activity_id VARCHAR(255),
  merge_score INT (0-100),
  merge_reasons JSONB,
  merged_at TIMESTAMP,
  user_id UUID,
  UNIQUE(ai_run_coach_run_id, garmin_activity_id)
);

-- Store detailed Garmin samples linked to runs
CREATE TABLE garmin_activity_samples (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES runs(id),
  samples JSONB, -- Time-series data
  created_at TIMESTAMP,
  INDEX ON run_id
);
```

### **Updated runs Table**

```sql
ALTER TABLE runs ADD COLUMN (
  garmin_activity_id VARCHAR(255),
  garmin_summary_id VARCHAR(255),
  activity_sub_type VARCHAR(255), -- MoveIQ classification
  has_garmin_data BOOLEAN DEFAULT false,
  device_name VARCHAR(255),
  
  -- Garmin-provided metrics (override AiRunCoach if present)
  distance_garmin DECIMAL(10,2),
  duration_garmin INT,
  elevation_gain_garmin INT,
  
  -- New calculated fields
  merge_score INT,
  merge_confidence DECIMAL(3,2),
  
  INDEX ON garmin_activity_id,
  INDEX ON garmin_summary_id
);
```

---

## 🔄 **Webhook Processing Flow - Updated**

```
Garmin Activity Webhook
  ↓
1. Parse activity data
  ↓
2. Find user by Garmin token / recent activities
  ↓
3. TRY FUZZY MATCH to existing AiRunCoach runs
  ↓
  ├─ Match found (score >50)
  │   ↓
  │   → MERGE: Enhance existing run with Garmin data
  │   → Log merge with score and reasons
  │   → Link samples/GPS data
  │   → Add MoveIQ classification
  │   ↓
  │   Run record now has complete data from both sources
  │
  └─ No match or low confidence (score <50)
      ↓
      → CREATE: New run record from Garmin data
      → Mark as "Garmin-only" run
      → Store all samples and details
      ↓
      New standalone run record created

Activity-Details Webhook (GPS samples arrive 30-60 sec later)
  ↓
1. Find linked run record (by summaryId or Garmin activity ID)
  ↓
2. ADD samples/splits to existing record
  ↓
3. Update route map, pace graph, elevation profile
```

---

## 🎯 **User Experience Benefits**

### **Before Merging**
```
Problem: Duplicate Runs
Run List:
1. Morning Run (AiRunCoach)    - 5.0 km, 31:30
2. Morning Run (Garmin import) - 5.2 km, 31:45

→ Confusing, inflated run count
→ Conflicting stats
→ No enriched insights
```

### **After Merging**
```
Unified Run Record:
Morning Run - March 12, 2026
✓ Distance: 5.2 km (Garmin - more accurate)
✓ Duration: 31:45 (Garmin - more accurate)
✓ Avg HR: 145 bpm (Garmin wearable data)
✓ HR Zones: Detailed breakdown
✓ GPS Map: From Garmin
✓ Pace Graph: Time-series
✓ MoveIQ: Tempo Run classification
✓ User Notes: "Felt strong today"
✓ Merge Confidence: 95%

→ Single authoritative record
→ All metrics available
→ Rich insights and visualizations
→ Accurate training analytics
```

---

## 📋 **Implementation Checklist**

- [ ] Create `activity_merge_log` table
- [ ] Update `runs` table with Garmin fields
- [ ] Implement `fuzzyMatchGarminToAiRunCoachRun()` function
- [ ] Implement `mergeGarminActivityWithAiRunCoachRun()` function
- [ ] Update activities webhook handler to fuzzy match before creating
- [ ] Create dashboard components for wellness data
- [ ] Create run detail component to display merged data
- [ ] Create health metrics tab with all Garmin data
- [ ] Create training insights/recommendations engine
- [ ] Add merge confidence indicator to run details
- [ ] Create activity merge audit log viewer
- [ ] Add unit tests for fuzzy matching algorithm
- [ ] Document merge score thresholds and tuning

---

**Status: ✅ Ready for implementation - comprehensive data exposure and intelligent merging strategy defined!**
