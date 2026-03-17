# AI Coaching Plan Feature - Complete Summary for iOS Implementation

**Status**: ✅ Fully implemented and production-ready on Android  
**Last Updated**: March 17, 2026  
**For**: iOS Development Team

---

## Executive Summary

The **AI Coaching Plan** feature generates personalized, adaptive training plans using GPT-4 AI. Plans automatically adjust based on actual run performance, creating a dynamic coaching experience that learns and improves over time. The AI Coach is deeply integrated — it knows which week of which plan the runner is on, and tailors all coaching (pre-run briefings, in-run guidance, post-run analysis) accordingly.

### Key Differentiators
- 🤖 **AI-Powered**: OpenAI GPT-4 generates plans tailored to each runner's actual run history
- 📊 **Adaptive**: Plans automatically adjust based on performance
- 💪 **Intelligent**: Detects over-training, under-training, and progress
- 📱 **Device-Aware**: Integrates with Garmin/connected devices for personalized HR zones
- 🎯 **Goal-Oriented**: Supports 5K, 10K, half-marathon, marathon, ultra
- 📈 **Progressive**: Gradually increases volume and intensity
- 🌍 **Timezone-Aware**: Scheduled dates and "today" detection use the user's local timezone
- 🌤 **Weather-Aware**: Pre-run briefings and post-run analysis incorporate current weather conditions

---

## Feature Overview

### What Users Can Do

1. **Generate Plans**
   - Select goal (5K, 10K, half-marathon, marathon, ultra)
   - Set target date and experience level (see fitness levels below)
   - Choose training frequency (3-7 days/week) and duration (up to 12 weeks)
   - Customize regular sessions (commute runs, etc.)
   - Get instant AI-generated plan tailored to their actual run history

2. **Follow Plans**
   - View weekly breakdown with focus areas
   - See daily workouts with target pace/HR zones (personalised BPM ranges)
   - Get coaching hints for each session
   - Start a coached workout directly from the plan
   - Log completed runs to link with plan workouts

3. **Monitor Progress**
   - Track plan completion rate
   - See planned vs actual metrics
   - View "About You" section with real performance baseline
   - Get AI insights on performance in plan context

4. **Experience Adaptation**
   - Plan automatically adjusts when user falls behind
   - Intensity reduced if over-training detected
   - Increased challenge if ahead of schedule
   - Recovery weeks added proactively

---

## Fitness / Experience Levels

The app uses detailed fitness levels (not just beginner/intermediate/advanced). These are sent **raw** to the AI so it understands the runner's specific profile:

| App Label | Mapped Category | Description |
|-----------|----------------|-------------|
| Newcomer | beginner | Just starting out |
| Beginner | beginner | Some running experience |
| Casual | beginner | Irregular running |
| Regular | intermediate | Consistent runner |
| Committed | intermediate | Training regularly |
| Competitive | advanced | Race-focused |
| Advanced | advanced | High training load |
| Elite | advanced | Near-professional |
| Professional | advanced | Full-time athlete |

> **iOS Note**: Send the exact label string (e.g. `"Regular"`) — the backend normalises it internally for duration calculations while passing it raw to the AI prompt for richer context.

---

## Technical Architecture

### Database Schema

#### 1. **trainingPlans** (Main Plan Record)
```sql
id: UUID (Primary Key)
userId: UUID (Foreign Key → users)
goalType: TEXT ('5k' | '10k' | 'half_marathon' | 'marathon' | 'ultra')
targetDistance: REAL (km)
targetTime: INTEGER (seconds) — Optional, for time-based goals
targetDate: TIMESTAMP
currentWeek: INTEGER (1-12, tracks progress)
totalWeeks: INTEGER (user-selected, up to 12 weeks)
experienceLevel: TEXT (raw label from app, e.g. "Regular", "Competitive")
weeklyMileageBase: REAL (km) — Baseline from recent runs
daysPerWeek: INTEGER (3-7)
includeSpeedWork: BOOLEAN
includeHillWork: BOOLEAN
includeLongRuns: BOOLEAN
status: TEXT ('active' | 'completed' | 'paused')
aiGenerated: BOOLEAN (always true)
createdAt: TIMESTAMP
completedAt: TIMESTAMP (when plan finishes or is abandoned)
```

#### 2. **weeklyPlans** (Weekly Breakdown)
```sql
id: UUID
trainingPlanId: UUID (Foreign Key)
weekNumber: INTEGER (1-12)
weekDescription: TEXT (e.g., "Base Building - Aerobic Foundation")
totalDistance: REAL (km for entire week)
focusArea: TEXT ('endurance' | 'speed' | 'recovery' | 'race_prep')
intensityLevel: TEXT ('easy' | 'moderate' | 'hard')
createdAt: TIMESTAMP
```

#### 3. **plannedWorkouts** (Individual Sessions)
```sql
id: UUID
weeklyPlanId: UUID (Foreign Key)
trainingPlanId: UUID (Foreign Key)
dayOfWeek: INTEGER (0=Sunday, 6=Saturday)
scheduledDate: TIMESTAMP (user's local date when this workout is due)
workoutType: TEXT (see enum below)
distance: REAL (km target)
duration: INTEGER (seconds target)
targetPace: TEXT (e.g., "5:30/km")
intensity: TEXT ('z1' | 'z2' | 'z3' | 'z4' | 'z5') — Heart Rate Zone
hrZoneNumber: INTEGER (1-5)
hrZoneMinBpm: INTEGER (calculated from age + device)
hrZoneMaxBpm: INTEGER
hrZoneScenario: TEXT ('device' | 'history' | 'effort')
effortDescription: TEXT (for effort-based: "easy jog", "hold convo", etc.)
description: TEXT (AI-generated workout description)
instructions: TEXT (detailed coaching tips)
isCompleted: BOOLEAN
completedRunId: UUID (Foreign Key → runs, when user links a run)
createdAt: TIMESTAMP
```

#### 4. **runs** — Coaching Context Fields (new as of March 17, 2026)
```sql
-- These fields are now saved on runs that are started from a coaching plan:
linkedWorkoutId: TEXT        -- which planned workout this run executes
linkedPlanId: TEXT           -- which training plan
planProgressWeek: INTEGER    -- e.g., 3
planProgressWeeks: INTEGER   -- total plan weeks, e.g., 8
workoutType: TEXT            -- "easy", "tempo", "intervals", "long_run"
workoutIntensity: TEXT       -- "z1", "z2", "z3", "z4", "z5"
workoutDescription: TEXT     -- AI workout description
```

> **Migration Required**: Run `ADD_COACHING_CONTEXT_TO_RUNS.sql` in Neon.

### Workout Types

| Type | Purpose | HR Zone | Effort |
|------|---------|---------|--------|
| **easy** | Recovery, aerobic base | Z1-Z2 | Comfortable, easy to talk |
| **tempo** | Threshold work, lactate clearance | Z3 | Uncomfortable, short phrases |
| **intervals** | VO2 Max, speed | Z4-Z5 | Hard, can't talk |
| **long_run** | Endurance, aerobic capacity | Z2-Z3 | Steady, conversational |
| **hill_repeats** | Strength, power | Z4-Z5 | Hard uphill efforts |
| **recovery** | Active recovery | Z1 | Very easy, feels effortless |
| **rest** | Complete rest day | — | No running |

---

## API Endpoints

### ⚠️ Critical: Two-Step Generation Flow

`POST /api/training-plans/generate` returns **only** `planId` + `message`.  
You **must** then call `GET /api/training-plans/details/:planId` to get the full plan.

---

### 1. Generate Training Plan
```
POST /api/training-plans/generate
Content-Type: application/json
Authorization: Bearer {token}

{
  "goalType": "10k",                            // Required: 5k, 10k, half_marathon, marathon, ultra
  "targetDistance": 10.0,                       // Required: km
  "targetTime": 3600,                           // Optional: seconds
  "targetDate": "2026-06-15",                   // Required: ISO date
  "experienceLevel": "Regular",                 // Required: use exact app label (see Fitness Levels above)
  "daysPerWeek": 4,                             // Optional, default: 4
  "durationWeeks": 8,                           // IMPORTANT: user-selected plan duration (takes priority over targetDate)
  "userTimezone": "Pacific/Auckland",           // IMPORTANT: IANA timezone string for correct date scheduling
  "includeSpeedWork": true,
  "includeHillWork": false,
  "includeLongRuns": true,
  "regularSessions": [                          // Optional: recurring training
    {
      "name": "Commute Run",
      "dayOfWeek": 2,                           // Tuesday
      "timeHour": 7,
      "timeMinute": 0,
      "distanceKm": 5.5,
      "countsTowardWeeklyTotal": true
    }
  ],
  "firstSessionStart": "tomorrow",              // Optional: today | tomorrow | flexible
  "goalId": "goal-uuid"                         // Optional: links plan to a goal
}

// ⚠️ Response returns ONLY planId + message — not the full plan:
Response (201): {
  "planId": "plan-uuid",
  "message": "Training plan generated successfully"
}
```

> After receiving `planId`, immediately call `GET /api/training-plans/details/:planId`.

---

### 2. Get Full Plan Details (use after generate)
```
GET /api/training-plans/details/:planId
Authorization: Bearer {token}

Response: {
  "plan": {
    "id": "plan-uuid",
    "goalType": "10k",
    "targetDistance": 10.0,
    "targetDate": "2026-06-15T00:00:00.000Z",
    "currentWeek": 1,
    "totalWeeks": 8,         // reflects user-selected durationWeeks
    "experienceLevel": "Regular",
    "daysPerWeek": 4,
    "status": "active",
    "weeklyMileageBase": 24.5,
    "completedWorkouts": 0,
    "totalWorkouts": 32,
    "createdAt": "2026-03-17T09:00:00.000Z"
  },
  "weeks": [
    {
      "id": "week-uuid",
      "weekNumber": 1,
      "weekDescription": "Base Building - Aerobic Foundation",
      "totalDistance": 22.0,
      "focusArea": "endurance",
      "intensityLevel": "easy",
      "workouts": [
        {
          "id": "workout-uuid",
          "dayOfWeek": 1,                        // 0=Sun, 1=Mon, … 6=Sat
          "scheduledDate": "2026-03-18T07:00:00.000Z",   // in user's local timezone
          "workoutType": "easy",
          "distance": 5.0,
          "duration": 1800,
          "targetPace": "6:00/km",
          "intensity": "z2",
          "hrZoneNumber": 2,
          "hrZoneMinBpm": 120,
          "hrZoneMaxBpm": 140,
          "hrZoneScenario": "history",
          "effortDescription": "Comfortable, conversational pace",
          "description": "Easy aerobic run to build your base.",
          "instructions": "Keep effort conversational. Relax shoulders.",
          "isCompleted": false,
          "completedRunId": null
        }
      ]
    }
  ],
  "performanceBaseline": {            // User's actual run history (from last 30 days)
    "hasHistory": true,
    "runsRecorded": 9,
    "runsPerWeek": "3 runs/week",
    "avgDistance": "5.73 km",
    "avgPace": "5:45/km",
    "longestRun": 11.2,
    "weeklyFrequency": 2.5
  }
}
```

> **performanceBaseline** — Use this to populate the "About You" section in the plan summary UI. If `hasHistory: false` the user has no run history yet — show a first-run encouragement message instead.

---

### 3. Get User's Plan List
```
GET /api/training-plans/:userId
Authorization: Bearer {token}

Response: [
  {
    "id": "plan-uuid",
    "goalType": "10k",
    "currentWeek": 3,
    "totalWeeks": 8,
    "status": "active",
    "completedWorkouts": 11,
    "totalWorkouts": 32,
    ...
  }
]
```

---

### 4. Get Today's Workout
```
GET /api/training-plans/:planId/today?timezone=Pacific%2FAuckland
Authorization: Bearer {token}

// ⚠️ Always pass timezone query param so isToday is evaluated in user's local time

Response: {
  "workout": { ... PlannedWorkout object ... },
  "isToday": true     // ← Check this before displaying! If false = no workout today (rest day)
}

// When no workout is scheduled today:
Response: {
  "workout": null,    // next upcoming workout
  "isToday": false    // ← This is a rest/recovery day, not a completed day
}
```

> **isToday Logic**: A `null` workout or `isToday: false` means today is a **rest day**. Do not show "Today's workout is done!" — show a rest/recovery message instead.

---

### 5. Get Plan Progress
```
GET /api/training-plans/:planId/progress
Authorization: Bearer {token}

Response: {
  "planId": "plan-uuid",
  "currentWeek": 3,
  "totalWeeks": 8,
  "goalType": "10k",
  "status": "active",
  "completedWorkouts": 11,
  "totalWorkouts": 32,
  "overallCompletion": 34.4,   // percentage
  "weeks": [
    {
      "weekNumber": 1,
      "weekDescription": "...",
      "totalDistance": 22,
      "focusArea": "endurance",
      "intensityLevel": "easy",
      "totalWorkouts": 4,
      "completedWorkouts": 4,
      "completionRate": 100
    }
  ]
}
```

---

### 6. Mark Workout Complete
```
POST /api/training-plans/complete-workout
Content-Type: application/json
Authorization: Bearer {token}

{
  "workoutId": "workout-uuid",
  "runId": "run-uuid"         // The run session that completed this workout
}

Response: {
  "success": true,
  "workout": { ... updated PlannedWorkout with isCompleted: true ... }
}
```

> After completing a coached run, call this endpoint to mark the planned workout as done and trigger automatic plan reassessment.

---

### 7. Adapt / Reassess Plan
```
POST /api/training-plans/:planId/adapt
Content-Type: application/json
Authorization: Bearer {token}

{
  "reason": "missed_workout"   // missed_workout | injury | over_training | ahead_of_schedule | user_request
}

Response: {
  "planId": "plan-uuid",
  "adaptationsMade": true,
  "changes": { ... }
}
```

---

### 8. Delete Plan
```
DELETE /api/training-plans/:planId
Authorization: Bearer {token}

Response: { "success": true }
```

---

## "About You" Section — Performance Baseline

The plan summary screen has an "About You" section. Display it from `performanceBaseline` in the plan details response:

**If `hasHistory: true`:**
```
"Your Baseline"
• [runs icon]  X runs recorded in the last 30 days
• [clock icon] Running Y days/week on average
• [distance icon] Average distance: Z km per run
• [pace icon]  Current average pace: P min/km
• [medal icon] Longest recent run: L km

"Plan Setup"
• Goal: 10K in 8 weeks
• X days/week training
• Fitness level: Regular
```

**If `hasHistory: false`:**
```
"You don't have any run history yet. This plan will be your starting point.
Let's get started and see what you've got!"

"Plan Setup"
• [same as above]
```

---

## Starting a Coached Workout — Full Flow

This is the complete flow from "Start Workout" button to post-run analysis:

### Step 1: Capture Workout Context
When user taps "Start This Workout", capture from the `PlannedWorkout`:
```swift
struct WorkoutRunContext {
    let linkedWorkoutId: String
    let linkedPlanId: String
    let planProgressWeek: Int      // e.g., 3
    let planProgressWeeks: Int     // total weeks, e.g., 8
    let workoutType: String        // "easy", "tempo", "intervals", etc.
    let workoutIntensity: String   // "z1", "z2", "z3", "z4", "z5"
    let workoutDescription: String
    let targetDistance: Double?    // km — nil if no specific distance
    let targetPace: String?        // "6:00/km"
}
```

### Step 2: Pre-Run Briefing (with coaching context)
```
POST /api/coaching/pre-run-briefing
{
  "startLocation": "...",
  "distance": 5.0,             // from workout.distance — DO NOT default to 5.0 if null
  "weather": { ... },
  "wellnessData": { ... },
  
  // ── Coaching Plan Context ────────────────────────────────
  "trainingPlanGoalType": "10k",
  "trainingPlanWeek": 3,
  "trainingPlanTotalWeeks": 8,
  "workoutType": "tempo",
  "workoutIntensity": "z3",
  "workoutDescription": "Steady tempo run to build threshold pace",
  "planGoalDescription": "Week 3 of 8 - 10K Plan"
}
```

> **Distance note**: Only send `distance` if `workout.distance != null`. Do not default to 5.0km — it causes incorrect briefings.

### Step 3: Store Coaching Context with Run
All 7 coaching context fields must be saved with the uploaded run:
```swift
// In your run upload request:
uploadRunRequest.linkedWorkoutId = workoutContext.linkedWorkoutId
uploadRunRequest.linkedPlanId = workoutContext.linkedPlanId
uploadRunRequest.planProgressWeek = workoutContext.planProgressWeek
uploadRunRequest.planProgressWeeks = workoutContext.planProgressWeeks
uploadRunRequest.workoutType = workoutContext.workoutType
uploadRunRequest.workoutIntensity = workoutContext.workoutIntensity
uploadRunRequest.workoutDescription = workoutContext.workoutDescription
```

### Step 4: Upload Run (POST /api/runs)
Weather data must also be uploaded:
```swift
// IMPORTANT: Include weather in the upload
uploadRunRequest.weatherData = currentWeatherData  // captured at run start
```

### Step 5: Mark Workout Complete (POST /api/training-plans/complete-workout)
After run is uploaded and you have the `runId`:
```swift
POST /api/training-plans/complete-workout
{ "workoutId": workoutContext.linkedWorkoutId, "runId": uploadedRunId }
```

### Step 6: Post-Run Analysis (with coaching context)
```
POST /api/runs/:runId/comprehensive-analysis
```
The backend automatically uses the stored `workoutType`, `workoutIntensity`, and plan week to provide coaching-context-aware analysis:
- "You hit your Zone 2 target for 87% of this run — great aerobic base work"
- "This tempo session aligns perfectly with Week 3's threshold-building focus"

---

## In-Run Coaching — All Routes Pass Plan Context

All in-run coaching endpoints now receive coaching plan context so the AI can give zone-specific guidance.

### HR Zone Coaching
```
POST /api/coaching/heart-rate
{
  "currentHR": 155,
  "targetZone": 2,              // derived from workoutIntensity: z2 → 2
  "workoutType": "easy",
  "workoutIntensity": "z2",
  "trainingPlanGoalType": "10k",
  "trainingPlanWeek": 3,
  "trainingPlanTotalWeeks": 8,
  ...
}
```

### Elite Coaching
```
POST /api/coaching/elite-coaching
{
  "trainingPlanGoalType": "10k",
  "trainingPlanWeek": 3,
  "trainingPlanTotalWeeks": 8,
  "workoutType": "tempo",
  "workoutIntensity": "z3",
  "workoutDescription": "...",
  ...
}
```

> **Target zone derivation**: Parse the last character of `workoutIntensity` as integer: `"z2"` → `2`, `"z4"` → `4`. Use this as `targetZone` in HR coaching requests.

---

## HR Zone Display in Workouts

Each planned workout includes `hrZoneNumber`, `hrZoneMinBpm`, `hrZoneMaxBpm`. Display them prominently:

```
Zone 2 • Aerobic Base
Keep your heart rate between 120 and 140 beats per minute
```

If BPM values are null (no connected device / no history), calculate them from age using the 220−age Karvonen formula or show effort-level description from `effortDescription`.

---

## Data Models (Swift)

```swift
// MARK: - Training Plan Models

struct GeneratePlanRequest: Encodable {
    let goalType: String
    let targetDistance: Double
    let targetDate: String           // ISO date "2026-06-15"
    let experienceLevel: String      // raw app label, e.g. "Regular"
    let targetTime: Int?
    let daysPerWeek: Int
    let durationWeeks: Int?          // user-selected duration (IMPORTANT)
    let userTimezone: String         // IANA timezone, e.g. "Pacific/Auckland"
    let includeSpeedWork: Bool
    let includeHillWork: Bool
    let includeLongRuns: Bool
    let regularSessions: [RegularSession]?
    let firstSessionStart: String?   // "today" | "tomorrow" | "flexible"
    let goalId: String?
    let userInjuries: String?
    
    // Fetch user's timezone: TimeZone.current.identifier
}

struct TrainingPlanSummary: Codable, Identifiable {
    let id: String
    let goalType: String
    let targetDistance: Double?
    let targetTime: Int?
    let targetDate: String?
    let currentWeek: Int
    let totalWeeks: Int
    let experienceLevel: String?
    let daysPerWeek: Int?
    let status: String              // "active" | "completed" | "paused"
    let aiGenerated: Bool?
    let createdAt: String
    let weeklyMileageBase: Double?
    let completedWorkouts: Int?
    let totalWorkouts: Int?
}

struct TrainingPlanDetails: Codable {
    let plan: TrainingPlanSummary
    let weeks: [WeeklyPlan]
    let performanceBaseline: PerformanceBaseline?
}

struct PerformanceBaseline: Codable {
    let hasHistory: Bool
    let runsRecorded: Int?
    let runsPerWeek: String?
    let avgDistance: String?
    let avgPace: String?
    let longestRun: Double?     // km
    let weeklyFrequency: Double?
}

struct WeeklyPlan: Codable, Identifiable {
    let id: String
    let weekNumber: Int
    let weekDescription: String
    let totalDistance: Double
    let focusArea: String
    let intensityLevel: String
    let workouts: [WorkoutDetails]
}

struct WorkoutDetails: Codable, Identifiable {
    let id: String
    let dayOfWeek: Int           // 0=Sun … 6=Sat — always validate with % 7
    let scheduledDate: String    // ISO timestamp in user's local timezone
    let workoutType: String      // "easy", "tempo", "intervals", "long_run", "hill_repeats", "recovery", "rest"
    let distance: Double?        // km — may be nil for time-based workouts
    let duration: Int?           // seconds
    let targetPace: String?
    let intensity: String?       // "z1" … "z5"
    let hrZoneNumber: Int?
    let hrZoneMinBpm: Int?
    let hrZoneMaxBpm: Int?
    let hrZoneScenario: String?
    let effortDescription: String?
    let description: String
    let instructions: String
    let isCompleted: Bool
    let completedRunId: String?
}

struct TodayWorkoutResponse: Codable {
    let workout: WorkoutDetails?
    let isToday: Bool            // ← Always check this. false = rest day
}

struct TrainingPlanProgress: Codable {
    let planId: String
    let currentWeek: Int
    let totalWeeks: Int
    let goalType: String
    let status: String
    let completedWorkouts: Int
    let totalWorkouts: Int
    let overallCompletion: Double
    let weeks: [WeekProgressSummary]
}

struct WeekProgressSummary: Codable {
    let weekNumber: Int
    let weekDescription: String
    let totalDistance: Double
    let focusArea: String
    let intensityLevel: String
    let totalWorkouts: Int
    let completedWorkouts: Int
    let completionRate: Double
}
```

---

## Today Tile — Correct Display Logic

```swift
func todayTileContent(response: TodayWorkoutResponse?) -> TodayTileState {
    guard let response = response else {
        return .loading
    }

    // isToday = false means no workout scheduled today → rest day
    guard response.isToday == true, let workout = response.workout else {
        return .restDay   // "Today is a rest & recovery day 🌙"
    }

    if workout.isCompleted {
        return .completed(workout)  // "Great work! Today's workout is done ✅"
    }

    return .scheduled(workout)     // Show workout card with Start button
}
```

---

## How AI Adaptation Works

### The Reassessment Process

After every completed run that is linked to a plan workout, the backend automatically:

1. **Collects Data** — User profile, plan details, recent runs, new completed run data
2. **Evaluates Performance** — Ahead/behind schedule, over-training signals, under-training signals
3. **AI Decision (GPT-4)** — Analyses performance, determines if adjustments needed, generates changes
4. **Updates Plan** — Upcoming workout weeks are modified accordingly

### Example Adaptation Scenarios

**Over-Training Detection:**
- Elevated HR, slow recovery → reduce next week volume 20%, add recovery day

**Ahead of Schedule:**
- Consistently faster than planned → increase volume 15%, progress intensity

**Missed Workouts:**
- Multiple skipped sessions → extend plan 1 week, refocus on consistency

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Plan shows wrong number of weeks | `durationWeeks` not sent or ignored | Send `durationWeeks` in generate request |
| Workout dates off by 1+ days | Missing `userTimezone` | Always send `userTimezone` (IANA string) |
| "Today's done" shown on rest days | `isToday` flag not checked | Always check `isToday` before displaying workout |
| Day name shows "Day" | `dayOfWeek` out of range from AI | Apply `% 7` before using as list index |
| Plan generate returns blank | Decoding generate response as full plan | Two-step: generate → details endpoint |
| "About You" shows generic text | `performanceBaseline` is null | Check `hasHistory` field before rendering |
| Distance says 5.0km when not set | iOS defaulting to 5km fallback | Use `workout.distance` — send `null` if absent |
| Blank screen on Start Workout | View lifecycle issue | Don't clear run config on first read — clear only on cancel |

---

## Key Neon Migrations Required

Run these SQL files in Neon (in any order, each is idempotent):

| File | Purpose |
|------|---------|
| `ADD_COACHING_CONTEXT_TO_RUNS.sql` | Adds 7 coaching plan context columns to runs table |
| `FIX_PLANNED_WORKOUT_HR_ZONE_COLUMNS.sql` | Adds HR zone columns to planned_workouts |
| `ADD_LINKED_TRAINING_PLAN_TO_GOALS.sql` | Adds `linked_training_plan_id` to goals table |

---

## Integration Points with Other Features

### Runs Integration
- Users link completed runs to plan workouts via `complete-workout` endpoint
- Run metrics compared against plan targets in post-run analysis
- Run data used for automatic plan reassessment
- All 7 coaching context fields stored on the run record

### Weather Integration
- Pre-run briefing uses current weather + coaching plan context together
- Weather data saved with each run (`weatherData` in upload request)
- Weather impact analysis uses coached runs alongside free runs

### AI Coaching — Full Context Chain
- **Pre-run**: AI knows your goal, week, and workout type → personalised briefing
- **During run**: HR and elite coaching is zone-aware (z2 vs z4 guidance differs significantly)
- **Post-run**: Analysis evaluates whether you hit your zone targets, references plan progression

### Garmin Integration
- HR zones automatically calculated from Garmin device data when available
- `hrZoneScenario: "device"` indicates personalised zones from connected device
- Training effect score enriches post-workout analysis

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|-----------|
| `400 Bad Goal Date` | Target date is in past | Show date picker validation |
| `400 Invalid Experience` | Unknown experience level | Validate against accepted label list |
| `500 AI Generation Failed` | GPT-4 API error or JSON parse issue | Show error + retry button |
| `404 Plan Not Found` | Plan ID invalid/deleted | Show error, reload plans list |

---

## Performance Considerations

1. **Two-step generate** — Call generate, store `planId`, then immediately fetch details
2. **Cache weekly plans** — Store downloaded weekly plans locally, refresh on week advance
3. **Today endpoint is cheap** — Safe to call on every app foreground
4. **Progress endpoint** — Cache for 5 minutes, refresh after completing a workout
5. **Timezone param** — Always send on today and generate endpoints

---

## All Related Documentation in Repo

| File | Contents |
|------|---------|
| `AI_COACHING_PLAN_SUMMARY.md` | This file — full feature overview |
| `IOS_COACHING_CONTEXT_IMPLEMENTATION_GUIDE.md` | Deep-dive on coaching context in run sessions |
| `COACHING_PLAN_RUN_COMPLETION_FLOW.md` | Run completion flow and data enrichment |
| `TRAINING_PLAN_SAMPLE_RESPONSES.json` | Sample JSON for all endpoints |
| `GARMIN_INTEGRATION_SUMMARY.md` | Garmin device integration |
| `server/training-plan-service.ts` | Backend plan generation service |
