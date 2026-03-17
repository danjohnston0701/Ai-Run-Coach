# Coaching Plan Run Completion & Summary Enrichment

## Overview
When a runner completes a coached workout, the system:
1. **Links the run to the coaching plan** for tracking progress
2. **Marks the workout as completed** in the plan
3. **Enriches the run summary** with coaching context and performance metrics
4. **Updates plan progress** and adjusts upcoming workouts if needed

---

## Data Flow: Run Completion

### Step 1: Run Session Completes
When the runner finishes a coached run (from `RunTrackingService.kt`):
- Run includes `linkedWorkoutId` (the specific planned workout)
- Run includes `linkedPlanId` (the overall training plan)
- Run includes `planProgressWeek` & `planProgressWeeks` (week context)
- Run includes `workoutType`, `workoutIntensity`, `workoutDescription`
- All metadata captured in `UploadRunRequest`

### Step 2: Backend Receives Run Upload
**Endpoint:** `POST /api/runs`

The run record is created with:
```typescript
{
  id: string;
  userId: string;
  distance: number;              // meters
  duration: number;              // seconds
  averagePace: string;           // "5:30" format
  avgHeartRate: number;          // bpm (from Apple Watch, Garmin, etc.)
  avgCadence: number;            // steps/min
  completedAt: Date;
  
  // Coaching plan linkage
  linkedWorkoutId: string;       // planned_workouts.id
  linkedPlanId: string;          // training_plans.id
  planProgressWeek: number;      // 1-12
  planProgressWeeks: number;     // total weeks
  workoutType: string;           // "easy", "tempo", "long_run"
  workoutIntensity: string;      // "z2", "z3", etc.
  workoutDescription: string;    // "Build aerobic base"
  
  // Weather at time of run
  weatherData: {
    temperature: number;
    humidity: number;
    condition: string;
  };
  
  // Garmin/wearable data (if available)
  garminActivityId: string;      // for enrichment lookup
  avgHeartRate: number;          // from wearable
  maxHeartRate: number;
  estCalories: number;
}
```

### Step 3: Mark Planned Workout Complete
**Endpoint:** `POST /api/training-plans/complete-workout`

**Request:**
```json
{
  "workoutId": "planned_workouts.id",
  "runId": "runs.id"
}
```

**Action:** Updates the `planned_workouts` record:
```typescript
{
  isCompleted: true,
  completedRunId: runId,
  completedAt: new Date()
}
```

### Step 4: Reassess Training Plan (Automatic)
**Function:** `reassessTrainingPlansWithRunData(userId, runId)`

This function:
- Fetches all active training plans for the user
- Gets the completed run with performance metrics
- Calculates current fitness level
- May adjust upcoming workouts based on:
  - Whether the runner hit their zone targets
  - Pace improvements/regressions
  - Overall fitness trajectory
  - Weather impact on performance

---

## Run Summary Display with Coaching Context

### Current Data Captured
The run summary already includes all necessary metrics:

```typescript
interface RunSummary {
  // Basic metrics
  distance: number;           // km
  duration: number;           // seconds
  averagePace: string;        // "5:30/km"
  
  // Heart rate / effort
  avgHeartRate: number;       // bpm
  maxHeartRate: number;       // bpm
  avgCadence: number;         // steps/min
  
  // Elevation (if GPS)
  elevationGain: number;      // meters
  elevationLoss: number;      // meters
  
  // Coaching context
  linkedWorkoutId: string;
  linkedPlanId: string;
  planProgressWeek: number;
  planProgressWeeks: number;
  workoutType: string;        // "easy", "tempo", etc.
  workoutIntensity: string;   // "z2", "z3", etc.
  workoutDescription: string;
  
  // AI coaching notes
  aiCoachingNotes: string[];  // captured during run
  aiAnalysis: RunAnalysis;    // post-run comprehensive analysis
}
```

### What to Display on iOS

**1. Coaching Plan Header**
```
Week 3 of 8 • 10K Goal
┌─────────────────────┐
│ Zone 2 Aerobic Base │
│ Build aerobic fitness│
└─────────────────────┘
```

**2. Performance Metrics Card**
```
Distance    5.73 km
Duration    34:22
Pace        6:00/km
HR          135 bpm avg / 152 bpm max
Cadence     172 spm avg
Elevation   +145m / -145m
```

**3. Zone Target Card** (if HR data available)
```
Target Zone: Z2 (130-150 bpm)
Actual HR:   135 avg ✓ Hit target
Zone Time:   28:15 (82% of run)
```

**4. AI Coaching Summary**
- Pre-run briefing used
- In-run coaching notes (if any)
- Post-run analysis (temperature impact, pace vs plan, etc.)

---

## Data Highlights on Coaching Plan Record

### Currently Saved Per Workout
```typescript
interface PlannedWorkout {
  // ...base fields...
  
  // After completion, these are populated
  isCompleted: boolean;
  completedRunId: string;
  completedAt: Date;
}
```

### Recommended Enrichment (NEW)

When a workout is marked complete, we should **aggregate and cache** run statistics on the `planned_workouts` or training_plan records:

**Option A: Add to `planned_workouts` table**
```typescript
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS
  completedDistance REAL,           // actual distance run (km)
  completedPace VARCHAR,            // actual pace achieved
  completedDuration INTEGER,        // seconds
  completedAvgHR INTEGER,           // bpm
  completedWeatherCondition VARCHAR;
```

**Option B: Add to `training_plans` table (cumulative stats)**
```typescript
ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS
  totalDistanceCompleted REAL,      // km
  completedWorkoutCount INTEGER,
  avgPaceCompleted VARCHAR,
  avgHRCompleted INTEGER,
  lastCompletedAt TIMESTAMP;
```

### Benefits
- **Quick plan summary** without querying all linked runs
- **Progress visualization** — show cumulative distance, pace trends
- **Plan adaption intelligence** — AI can see if pace is trending up/down across workouts

---

## Garmin/Wearable Data Enrichment

### Current Flow
1. **Native app captures HR** from Apple Watch/Garmin Band during run
2. **Saved in `avgHeartRate`, `maxHeartRate`** in run record
3. **Available for display** in run summary

### Proposed Garmin Connect Enrichment

**When:** Run completes with `garminActivityId` attached

**What to fetch from Garmin:**
```typescript
interface GarminEnrichment {
  // Biometrics (already have)
  avgHeartRate: number;
  maxHeartRate: number;
  
  // NEW: Garmin-specific metrics
  trainingEffect: number;        // 0-5 scale
  recoveryTime: number;          // minutes needed
  vo2MaxEstimate: number;        // ml/kg/min
  aerobicTrainingEffect: number; // 0-5
  anaerobicTrainingEffect: number; // 0-5
  
  // Garmins's zone assessment
  timeInZone: {
    zone1: number;  // seconds
    zone2: number;
    zone3: number;
    zone4: number;
    zone5: number;
  };
  
  // Dynamic stats
  avgRunCadence: number;
  avgGroundContactTime: number;
  avgVerticalOscillation: number;
  avgStrideLength: number;
  
  // Weather (to verify/supplement)
  weatherCondition: string;
  temperature: number;
}
```

**Implementation:**
1. After run upload, if `garminActivityId` present, call Garmin API
2. Fetch detailed metrics and zone breakdown
3. Store in run record or new `garmin_run_enrichment` table
4. Display on run summary: training effect, recovery time, zone breakdown

**Display on iOS:**
```
Training Effect: 3.2 (Good)
Recovery Time: 16 hours
Zone 2 Time: 28m 45s ✓ All in Z2

VO2 Max: 52 ml/kg/min (Excellent)
Aerobic Training Effect: 2.8
```

---

## API Endpoints for iOS

### Get Training Plan with Progress
**`GET /api/training-plans/details/:planId`**
- Returns: Plan structure + cumulative stats (once added)

### Get Run with Coaching Context
**`GET /api/runs/:runId`**
- Returns: Full run record including `linkedPlanId`, `workoutType`, etc.

### Mark Workout Complete
**`POST /api/training-plans/complete-workout`**
- Body: `{ workoutId, runId }`
- Returns: Success + updated plan progress

### Get Plan Progress
**`GET /api/training-plans/:planId/progress`**
- Returns: Week-by-week completion status + stats

### Get Garmin Activity Details (future)
**`GET /api/runs/:runId/garmin-enrichment`**
- Returns: Garmin training effect, zone breakdown, etc.

---

## Implementation Checklist for iOS

### Immediate (Already Available)
- [ ] Display `linkedPlanId` on run summary
- [ ] Show `planProgressWeek` / `planProgressWeeks`
- [ ] Display `workoutType` and `workoutIntensity`
- [ ] Show HR metrics if `avgHeartRate` is present
- [ ] Display `aiCoachingNotes` and `aiAnalysis`

### Phase 2 (Add to Backend, then iOS)
- [ ] Add cumulative stats columns to `training_plans` or `planned_workouts`
- [ ] Update `completeWorkout()` to aggregate stats
- [ ] Display plan-level stats on coaching plan screen
- [ ] Show "Week 3 of 8" header on run summary

### Phase 3 (Garmin Integration)
- [ ] Set up Garmin API client on backend
- [ ] On run completion, fetch Garmin activity details
- [ ] Store `garmin_run_enrichment` records
- [ ] Display training effect, zone breakdown, recovery time on iOS

---

## Database Migrations Needed

```sql
-- Add coaching context columns to runs (already done)
-- See: ADD_COACHING_CONTEXT_TO_RUNS.sql

-- NEW: Add completed workout stats
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS
  completed_distance REAL,
  completed_pace VARCHAR(10),
  completed_duration INTEGER,
  completed_avg_hr INTEGER,
  completed_weather_condition VARCHAR(50);

-- NEW: Add cumulative plan stats
ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS
  total_distance_completed REAL,
  completed_workout_count INTEGER,
  avg_pace_completed VARCHAR(10),
  avg_hr_completed INTEGER,
  last_completed_at TIMESTAMP;

-- NEW: Store Garmin enrichment (optional)
CREATE TABLE IF NOT EXISTS garmin_run_enrichment (
  id VARCHAR PRIMARY KEY,
  run_id VARCHAR UNIQUE,
  garmin_activity_id VARCHAR,
  training_effect REAL,
  recovery_time_minutes INTEGER,
  vo2_max_estimate REAL,
  aerobic_training_effect REAL,
  anaerobic_training_effect REAL,
  time_in_zone_1 INTEGER,
  time_in_zone_2 INTEGER,
  time_in_zone_3 INTEGER,
  time_in_zone_4 INTEGER,
  time_in_zone_5 INTEGER,
  avg_cadence INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Summary

**Current State:**
- ✅ Runs are linked to coaching plans via `linkedWorkoutId` and `linkedPlanId`
- ✅ HR, pace, cadence all captured
- ✅ Workouts marked complete with `completeWorkout()` endpoint
- ✅ Plan reassessment happens automatically

**Gaps Identified:**
- ❌ No cumulative stats aggregation on plan/workout records (adds quick access)
- ❌ No Garmin Connect enrichment (training effect, zone breakdown, recovery time)

**iOS Should:**
1. Display all available run metrics and coaching context
2. Call `/api/training-plans/complete-workout` to mark workout done
3. Show plan progress (week X of Y, completion percentage)
4. Once backend adds cumulative stats, display them on plan screen
