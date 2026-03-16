# iOS Coaching Plan Context Implementation Guide

## Overview
This document describes the complete flow of **coaching plan context** through the iOS app, from plan selection through run session tracking to post-run AI analysis. The Android app has been updated to properly persist and utilize this context at every stage.

---

## 1. Data Structures

### RunSession Model (Core)
The `RunSession` object carries coaching context throughout the run lifecycle:

```swift
struct RunSession {
    // Core run metrics
    var id: String
    var startTime: Date
    var endTime: Date?
    var duration: TimeInterval  // seconds
    var distance: Double  // kilometers
    var averagePace: String
    var averageSpeed: Float
    var maxSpeed: Float
    var heartRate: Int
    var calories: Int
    var cadence: Int
    
    // ── COACHING PLAN CONTEXT (NEW) ────────────────────────
    // Populated when user starts a run from a scheduled workout
    var linkedWorkoutId: String?          // ID of the plan workout
    var linkedPlanId: String?             // ID of the training plan
    var planProgressWeek: Int?            // Current week (1–12)
    var planProgressWeeks: Int?           // Total weeks
    var workoutType: String?              // easy|tempo|intervals|long_run|etc
    var workoutIntensity: String?         // z1|z2|z3|z4|z5
    var workoutDescription: String?       // "Zone 2 aerobic building", etc
    
    // Other fields...
    var aiCoachingNotes: [AiCoachingNote]
    var struggglePoints: [StrugglePoint]
    // ...
}
```

### TrainingPlan & Workout Models
```swift
struct TrainingPlan {
    var id: String
    var goalType: String              // 5k|10k|half_marathon|marathon
    var targetDistance: Double?       // km
    var targetTime: Int?              // seconds
    var targetDate: Date?
    var currentWeek: Int
    var totalWeeks: Int
    var status: String                // active|completed|paused
    var experienceLevel: String       // beginner|intermediate|advanced|etc
    var daysPerWeek: Int
}

struct WorkoutDetails {
    var id: String
    var dayOfWeek: Int
    var workoutType: String           // easy|tempo|intervals|long_run|etc
    var distance: Double?             // km
    var duration: Int?                // seconds
    var targetPace: String?           // HH:MM/km
    var intensity: String?            // z1–z5
    var description: String?
    var instructions: String?
}
```

---

## 2. User Flow: Plan → Run → Analysis

### Phase 1: User Views Coaching Plan
1. **Get plan details**: `GET /api/training-plans/details/:planId`
   - Returns full plan with weeks and workouts
   - Each workout contains `intensity`, `distance`, `workoutType`, `description`

2. **Get today's workout** (optional): `GET /api/training-plans/:planId/today`
   - Returns the scheduled workout for today if one exists

### Phase 2: User Starts a Coached Run
**Key:** When user taps "Start" on a scheduled workout, that workout's metadata must be attached to the run session.

1. **Store workout context in RunSession**:
   ```swift
   let runSession = RunSession(
       linkedWorkoutId: workout.id,
       linkedPlanId: planId,
       planProgressWeek: currentWeek,
       planProgressWeeks: totalWeeks,
       workoutType: workout.workoutType,      // "tempo"
       workoutIntensity: workout.intensity,   // "z3"
       workoutDescription: workout.description // "Tempo run at lactate threshold"
       // ... other metrics populated during tracking
   )
   ```

2. **Pass to tracking service** (or equivalent):
   - All fields from `runSession` should be available to the run tracking logic

### Phase 3: Pre-Run Briefing
**Endpoint**: `POST /api/coaching/pre-run-briefing`

**Request body includes**:
```json
{
    "distance": 7.0,
    "targetTime": 2400,
    "targetPace": "5:30/km",
    "weather": { ... },
    "wellness": { ... },
    
    "trainingPlanId": "plan_abc123",
    "planGoalType": "10k",
    "planWeekNumber": 3,
    "planTotalWeeks": 8,
    "workoutType": "tempo",
    "workoutIntensity": "z3",
    "workoutDescription": "Tempo run at lactate threshold"
}
```

**Response**: AI-generated briefing that includes:
- Week context: _"This is week 3 of your 8-week 10K plan."_
- Zone focus: _"Today's Zone 3 tempo session builds lactate threshold capacity."_
- Plan-aware advice: _"Maintain consistent effort; this is a key quality session in your build phase."_

### Phase 4: In-Run Coaching
**Endpoints triggered during run**:

#### A. Elite Coaching (General/Technique/Pacing)
`POST /api/coaching/elite-coaching`

**Request includes** (all from RunSession):
```json
{
    "coachingType": "technique_form",
    "distance": 3.2,
    "targetDistance": 7.0,
    "currentPace": "5:35/km",
    "averagePace": "5:32/km",
    "elapsedTime": 1920,
    
    "trainingPlanId": "plan_abc123",
    "workoutId": "workout_tempo_001",
    "workoutType": "tempo",
    "workoutDescription": "Tempo run at lactate threshold",
    "planGoalType": "10k",
    "planWeekNumber": 3,
    "planTotalWeeks": 8
}
```

**Backend uses context to**:
- Reference the plan goal: _"You're on track for your 10K goal."_
- Zone-aware coaching: _"Maintain Zone 3 effort — you're doing great on this tempo session."_
- Week-aware motivation: _"This quality work in week 3 is crucial for building fitness."_

#### B. Heart Rate Coaching
`POST /api/coaching/heart-rate-coaching`

**Request includes** (NEW):
```json
{
    "currentHR": 165,
    "avgHR": 162,
    "maxHR": 185,
    "targetZone": 3,                 // Derived from "z3"
    "elapsedMinutes": 32,
    
    "workoutIntensity": "z3",        // NEW: from plan
    "workoutType": "tempo"           // NEW: from plan
}
```

**Backend can now**:
- Tell runner if they're in the target zone: _"Perfect — you're holding Zone 3. Stay here."_
- Zone-specific advice: _"You're running Zone 2 (easy); this tempo demands Zone 3. Pick it up slightly."_

#### C. Cadence/Stride Coaching
`POST /api/coaching/cadence-coaching`

- Similar pattern: receive full context, provide zone-aware feedback

### Phase 5: Post-Run Summary
**Endpoint**: `POST /api/runs` (upload completed run)

**Request includes ALL coaching context**:
```json
{
    "distance": 7.05,
    "duration": 2410,
    "avgPace": "5:32/km",
    "avgHeartRate": 162,
    "completedAt": 1710700000000,
    
    // ── NEW: Coaching context persisted to Neon ────
    "linkedWorkoutId": "workout_tempo_001",
    "linkedPlanId": "plan_abc123",
    "planProgressWeek": 3,
    "planProgressWeeks": 8,
    "workoutType": "tempo",
    "workoutIntensity": "z3",
    "workoutDescription": "Tempo run at lactate threshold",
    
    "aiCoachingNotes": [ ... ],
    "gpsTrack": [ ... ]
}
```

**What happens in backend**:
- All coaching context **saved to `runs` table in Neon**
- Run record now carries full plan metadata permanently

### Phase 6: Run Summary / Comprehensive Analysis
**Endpoint**: `POST /api/runs/:id/comprehensive-analysis`

**Backend calls AI with**:
```
## TRAINING PLAN CONTEXT:
- Week 3 of 8 in the training plan
- Workout Type: tempo (Tempo run at lactate threshold)
- Heart Rate Zone Target: z3
- This run is part of a structured 8-week 10K training plan.
  - Tailor your feedback to whether this run achieved its specific goal
    (e.g., "maintaining tempo pace").
  - Reference the week number and progression ("Week 3 of 8").
  - If it's an easy/recovery workout, praise consistency. If it's a tempo
    or interval session, emphasize quality and progression.
```

**AI Analysis includes**:
- Plan-aware interpretation: _"Excellent tempo work. You held Z3 pace consistently — exactly what this week demands."_
- Progression context: _"Week 3 focuses on building lactate threshold; this run delivered that perfectly."_
- Plan-specific insights: _"Your consistency this week suggests you're tracking well for your 10K target."_

---

## 3. API Endpoints Summary

| Endpoint | Method | Context Used |
|----------|--------|--------------|
| `/api/training-plans/details/:planId` | GET | Plan details with all workouts |
| `/api/training-plans/:planId/today` | GET | Today's scheduled workout |
| `/api/coaching/pre-run-briefing` | POST | Plan/week/zone context → AI briefing |
| `/api/coaching/elite-coaching` | POST | Running plan context → in-run coaching |
| `/api/coaching/heart-rate-coaching` | POST | Target zone from plan → HR coaching |
| `/api/coaching/cadence-coaching` | POST | Plan context available if needed |
| `/api/runs` | POST | **SAVE all coaching context to Neon** |
| `/api/runs/:id/comprehensive-analysis` | POST | Use saved context → plan-aware analysis |

---

## 4. Database Schema: Runs Table

The `runs` table now includes these columns (added via migration `ADD_COACHING_CONTEXT_TO_RUNS.sql`):

```sql
ALTER TABLE runs ADD COLUMN IF NOT EXISTS linked_workout_id VARCHAR;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS linked_plan_id VARCHAR;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS plan_progress_week INTEGER;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS plan_progress_weeks INTEGER;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS workout_type VARCHAR;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS workout_intensity VARCHAR;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS workout_description TEXT;
```

---

## 5. Implementation Checklist for iOS

### Data Models
- [ ] Add coaching context fields to `RunSession` model
- [ ] Add `workoutIntensity` field to HR coaching request model
- [ ] Add `workoutType` field to HR coaching request model

### Pre-Run Flow
- [ ] When user taps "Start" on a workout, capture all workout metadata (type, intensity, description, distance, etc.)
- [ ] Pass to `PreRunBriefingRequest`: include `trainingPlanId`, `planGoalType`, `planWeekNumber`, `planTotalWeeks`, `workoutType`, `workoutIntensity`, `workoutDescription`
- [ ] Display briefing that now includes plan context

### In-Run Tracking
- [ ] Store all coaching context in active `RunSession` throughout tracking
- [ ] When calling elite coaching: include `trainingPlanId`, `workoutType`, `workoutDescription`, `planGoalType`, `planWeekNumber`, `planTotalWeeks`
- [ ] When calling HR coaching: calculate target zone from `workoutIntensity` ("z3" → 3) and pass both `workoutIntensity` and `workoutType`

### Run Upload
- [ ] When uploading completed run via `POST /api/runs`:
  - Include all 7 coaching context fields: `linkedWorkoutId`, `linkedPlanId`, `planProgressWeek`, `planProgressWeeks`, `workoutType`, `workoutIntensity`, `workoutDescription`
  - These fields will be persisted to Neon so post-run analysis can access them

### Post-Run Analysis
- [ ] When displaying run summary, coaching context from saved run automatically flows to AI analysis
- [ ] No extra work needed — backend handles it
- [ ] Analysis will reference plan week, goal, and zone when generating summary

---

## 6. Critical Points

1. **Everything flows through RunSession**: If you populate RunSession fields during tracking, they're available to all coaching endpoints and when uploading.

2. **Target Zone Derivation**: Heart rate zone from `workoutIntensity` ("z2" → 2, "z4" → 4, etc.) should be sent as `targetZone` in HR coaching request.

3. **Neon Migration Required**: Before iOS users start uploading coached runs, run `ADD_COACHING_CONTEXT_TO_RUNS.sql` in the Neon database to create the 7 new columns.

4. **Pre-Run Briefing is the Entry Point**: If coaching context is missing here, it won't flow downstream. Always populate all fields in `PreRunBriefingRequest`.

5. **Post-Run Analysis is Automatic**: No special logic needed — saved context automatically used by comprehensive-analysis endpoint.

---

## 7. Example User Journey

```
1. User views "Week 3 of 8 → 10K Plan"
2. Today's workout: "Tempo run at lactate threshold (7km, Z3)"
3. Taps "Start" → RunSession initialized with:
   - workoutType: "tempo"
   - workoutIntensity: "z3"
   - workoutDescription: "Tempo run at lactate threshold"
   - planProgressWeek: 3, planProgressWeeks: 8
   - linkedPlanId: "plan_abc123"

4. Pre-run briefing API called:
   - Returns: "Week 3 of your 8-week 10K plan. Today's Zone 3 tempo session..."

5. During run:
   - Elite coaching: "Hold that Zone 3 effort — you're building lactate threshold."
   - HR coaching: "Your HR is 165; perfect for Zone 3. Stay here."

6. Run completed, uploaded with all context fields

7. Run summary shows:
   - "Excellent tempo work. Zone 3 maintained — exactly what week 3 demands."
   - "Your 10K plan is tracking perfectly."
```

---

## 8. Synchronization Notes

- **Android**: Already updated with all context fields and wired throughout
- **iOS**: Use this guide to implement the same structure
- **Backend**: Already handles context at all stages — no changes needed
- **Database**: Run `ADD_COACHING_CONTEXT_TO_RUNS.sql` migration in Neon once
