# Dynamic Session-Specific Coaching System

## Overview

This system generates **dynamic, session-specific coaching instructions** for every workout in a training plan. The AI determines the optimal coaching tone, style, and guidance based on:

- **User's athletic level** and experience (beginner, intermediate, advanced, elite)
- **Session type and goal** (intervals, zone 2, recovery, tempo, etc.)
- **Workout characteristics** (intensity, duration, distance)
- **Historical performance** and run data
- **Session purpose** within the overall training plan

The key insight: **Zone 2 conditioning runs should be light and fun** for advanced athletes, while **interval/speed sessions should be direct and instructive** to build tolerance and endurance.

---

## Architecture

### New Database Tables

#### `session_instructions`
Stores AI-generated coaching plan for each workout:

```sql
- id: UUID (primary key)
- planned_workout_id: UUID (foreign key → planned_workouts)
- pre_run_brief: TEXT (pre-run briefing)
- session_structure: JSONB (phases, triggers, guidance points)
- ai_determined_tone: TEXT (light_fun, direct, motivational, calm, serious, playful)
- ai_determined_intensity: TEXT (relaxed, moderate, intense)
- tone_reasoning: TEXT (why AI chose this tone)
- coaching_style: JSONB (encouragementLevel, detailDepth, technicalDepth)
- insight_filters: JSONB (include[], exclude[] — what metrics to focus on)
- generated_at: TIMESTAMP
- generated_version: TEXT
```

#### `coaching_session_events`
Logs coaching events delivered during an active run:

```sql
- id: UUID
- run_id: UUID (foreign key → runs)
- planned_workout_id: UUID (optional)
- event_type: TEXT (interval_start, pace_coaching, recovery_guidance, etc)
- event_phase: TEXT (warmup, interval_2_of_6, recovery, etc)
- coaching_message: TEXT (what was said)
- coaching_audio_url: TEXT (TTS audio)
- user_metrics: JSONB (pace, HR, distance at time of coaching)
- tone_used: TEXT (actual tone delivered)
- user_engagement: TEXT (positive, neutral, struggled)
- triggered_at: TIMESTAMP
```

### New Columns in Existing Tables

#### `users` table
```sql
- athletic_grade: TEXT (beginner, intermediate, advanced, elite)
- previous_runs_count: INTEGER
- average_weekly_mileage: REAL
- prior_race_experience: TEXT (none, local, national, elite)
- injury_history: JSONB (tracking past injuries)
- allow_ai_tone_adaptation: BOOLEAN (let AI override user preference per session)
```

#### `planned_workouts` table
```sql
- session_instructions_id: VARCHAR (foreign key → session_instructions)
- session_goal: TEXT (build_fitness, develop_speed, active_recovery, endurance)
- session_intent: TEXT (what this session achieves within the plan)
```

---

## Core Services

### `session-coaching-service.ts`

**Key Functions:**

#### `determineSessonCoachingTone(request: SessionToneRequest): Promise<DeterminedTone>`
Uses GPT-4o-mini to determine optimal tone based on user profile and session characteristics.

```typescript
Request:
{
  userId: string,
  plannedWorkoutId: string,
  workoutType: "easy" | "tempo" | "intervals" | "long_run" | "hill_repeats" | "recovery",
  intensity: "z1" | "z2" | "z3" | "z4" | "z5",
  sessionGoal?: string,
  sessionIntent?: string,
  intervalCount?: number,
  distance?: number,
  duration?: number
}

Response:
{
  tone: "light_fun" | "direct" | "motivational" | "calm" | "serious" | "playful",
  intensity: "relaxed" | "moderate" | "intense",
  coachingStyle: {
    tone: string,
    encouragementLevel: "low" | "moderate" | "high",
    detailDepth: "minimal" | "moderate" | "detailed",
    technicalDepth: "simple" | "moderate" | "advanced"
  },
  insightFilters: {
    include: string[], // ["pace_deviation", "effort_level", "recovery_quality"]
    exclude: string[]  // ["km_splits", "500m_summary"]
  },
  toneReasoning: string // Why this tone was chosen
}
```

#### `generateSessionInstructions(...): Promise<SessionInstructions>`
Creates complete session instructions including:
- Pre-run brief
- Session structure with phases and triggers
- Coaching style and tone
- Insight filters for during-run coaching

---

## Integration Points

### 1. Training Plan Generation
When `generateTrainingPlan()` creates workouts, it now:
1. Inserts the `planned_workout`
2. Calls `generateSessionInstructions()` for that workout
3. Stores result in `session_instructions` table
4. Links them back via `session_instructions_id`

**File:** `server/training-plan-service.ts`

### 2. Pre-Run Preparation (Android)
When user taps "Start Run" on a plan workout:

```kotlin
// 1. Fetch session instructions
val instructions = apiService.getSessionInstructions(workoutId)

// 2. Display pre-run brief with tone context
showPreRunBriefing(instructions.preRunBrief)

// 3. Store coaching context for during-run coaching
runSessionViewModel.setSessionCoachingContext(
  tone = instructions.aiDeterminedTone,
  insightFilters = instructions.insightFilters,
  sessionStructure = instructions.sessionStructure
)
```

### 3. During-Run Coaching
Every coaching call now includes session context:

```kotlin
val coachingRequest = StruggleUpdate(
  runId = runId,
  message = userMessage,
  linkedWorkoutId = workoutId,
  sessionInstructions = instructions,
  currentPhase = "interval_2_of_6",
  targetPaceKmh = 13.33,
  // ... other metrics
)
```

Server receives this and:
1. Uses `sessionInstructions.coachingStyle` to set system prompt
2. Filters metrics based on `insightFilters`
3. References session structure when generating coaching

### 4. Coaching Event Logging
Android logs what coaching was delivered:

```kotlin
apiService.logCoachingEvent(
  CoachingSessionEvent(
    runId = runId,
    plannedWorkoutId = workoutId,
    eventType = "pace_coaching",
    eventPhase = "interval_3_of_6",
    coachingMessage = "Pick up the pace, you've got this",
    toneUsed = "direct",
    userMetrics = currentMetrics
  )
)
```

---

## API Endpoints

### New Endpoints

#### `GET /api/workouts/:workoutId/session-instructions`
Fetch pre-generated session coaching plan for a workout.

**Response:**
```json
{
  "workoutId": "...",
  "preRunBrief": "Today's session: 6x400m intervals...",
  "sessionStructure": { ... },
  "coachingStyle": {
    "tone": "direct",
    "encouragementLevel": "high",
    "detailDepth": "detailed",
    "technicalDepth": "moderate"
  },
  "insightFilters": {
    "include": ["pace_deviation", "effort_level"],
    "exclude": ["500m_summary", "km_splits"]
  },
  "aiDeterminedTone": "direct",
  "aiDeterminedIntensity": "intense",
  "toneReasoning": "Interval session building speed tolerance requires direct, instructive coaching"
}
```

#### `POST /api/workouts/:workoutId/regenerate-session-instructions`
Force regenerate session instructions (useful if user profile changes).

**Response:**
```json
{
  "success": true,
  "message": "Session instructions regenerated",
  "coachingStyle": { ... },
  "tone": "direct",
  "reasoning": "..."
}
```

#### `POST /api/coaching/session-events`
Log a coaching event during an active run.

**Request:**
```json
{
  "runId": "...",
  "plannedWorkoutId": "...",
  "eventType": "pace_coaching",
  "eventPhase": "interval_2_of_6",
  "coachingMessage": "Pick it up",
  "coachingAudioUrl": "...",
  "userMetrics": { "pace": "4:30/km", "hr": 175 },
  "toneUsed": "direct",
  "userEngagement": "positive"
}
```

#### `GET /api/coaching/session-events/:runId`
Fetch all coaching events from a completed run.

**Response:**
```json
{
  "runId": "...",
  "count": 12,
  "events": [
    {
      "eventType": "interval_start",
      "eventPhase": "interval_1_of_6",
      "coachingMessage": "Starting rep 1, hit your pace...",
      "toneUsed": "direct",
      "triggeredAt": "2026-03-20T10:15:30Z"
    }
  ]
}
```

---

## AI Tone Determination Logic

The `determineSessonCoachingTone()` function considers:

### User Profile Factors
- **Athletic grade**: Elite athletes get different tone than beginners
- **Previous runs**: More experienced users can handle direct instruction
- **Weekly mileage**: High-mileage runners need different encouragement
- **Race experience**: Athletes with race experience respond to competitive tone
- **User preference**: Baseline tone from settings, but can be overridden

### Session Factors

#### Zone 2 Conditioning (easy HR runs)
- **Tone:** `light_fun` or `playful`
- **Intensity:** `relaxed`
- **Reasoning:** Keep it conversational, meditative, fun. Let aerobic work happen naturally.
- **Encouragement:** Low-to-moderate (they don't need pushing)
- **Detail depth:** Minimal (focus on experience, not metrics)

#### Interval/Speed Work
- **Tone:** `direct` or `serious`
- **Intensity:** `intense`
- **Reasoning:** Clear cues, effort focus, push tolerance building.
- **Encouragement:** High (intervals are hard, support needed)
- **Detail depth:** Detailed (pacing, form, effort levels matter)

#### Long Runs
- **Tone:** `motivational` or `calm`
- **Intensity:** `moderate`
- **Reasoning:** Mental game support, milestone celebrations, steady pacing.
- **Encouragement:** Moderate-to-high (building confidence over distance)
- **Detail depth:** Moderate (strategy and pacing guidance)

#### Recovery Runs
- **Tone:** `calm` or `friendly`
- **Intensity:** `relaxed`
- **Reasoning:** Easy, restorative, enjoyable.
- **Encouragement:** Low (just enjoy the easy pace)
- **Detail depth:** Minimal (don't overthink it)

---

## Example Coaching Flows

### Example 1: Elite Runner, Zone 2 Session

```
User Profile: Elite, 120 km/week average, multiple marathons
Session: 10km easy run (Zone 2)
Goal: Build aerobic base

AI Decision:
  Tone: "playful"
  Intensity: "relaxed"
  Reasoning: "Elite athlete doing conditioning work. Keep it light and fun. 
             Let the aerobic work happen in the background. No pressure."
  
  Insight Filters:
    Include: ["pace_deviation"]
    Exclude: ["500m_summary", "km_splits", "effort_coaching"]
    
  Coaching Messages:
    - "Heads up, we're cruising today. Enjoy it."
    - "Sweet pace. Perfect zone 2 work."
    - "This is where the magic happens — just keep it easy."
```

### Example 2: Beginner, First Interval Session

```
User Profile: Beginner, 15 runs total, no race experience
Session: 6x400m intervals @ 5:00/km pace
Goal: Develop speed

AI Decision:
  Tone: "motivational"
  Intensity: "intense"
  Reasoning: "First timer doing intervals. Needs encouragement and clear guidance. 
             Make them feel supported but also challenged."
  
  Insight Filters:
    Include: ["pace_deviation", "effort_level", "rep_progress", "recovery_quality"]
    Exclude: ["advanced_metrics", "technical_analysis"]
    
  Coaching Messages:
    - "Warmup done! You've got this. Remember: hard effort, controlled breathing."
    - "Rep 1 starting NOW. Hit that pace target."
    - "Excellent work! Recovery coming up. Breathe and recover."
    - "2 more reps. You're stronger than you think!"
```

### Example 3: Intermediate Runner, Tempo Run

```
User Profile: Intermediate, 50 km/week, some local race experience
Session: 20 min tempo @ 4:20/km
Goal: Build threshold

AI Decision:
  Tone: "direct"
  Intensity: "intense"
  Reasoning: "Intermediate athlete, experienced enough for direct instruction. 
             Focus on pacing and effort. Minimal hand-holding."
  
  Insight Filters:
    Include: ["pace_deviation", "hr_drift", "effort_level"]
    Exclude: ["500m_splits", "generic_motivation"]
    
  Coaching Messages:
    - "Tempo phase starting. Hold 4:20/km, keep HR under 175."
    - "Pace is 0:15 off target. Tighten it up."
    - "Good. Maintain this."
```

---

## Integration Checklist

- [ ] Database migration applied (SQL schema updated in Neon)
- [ ] `shared/schema.ts` updated with new tables and columns
- [ ] `server/session-coaching-service.ts` deployed
- [ ] `server/training-plan-service.ts` updated to generate instructions
- [ ] `server/routes-session-coaching.ts` endpoints registered in main `routes.ts`
- [ ] Android app updated to fetch and use session instructions
  - [ ] Pre-run screen displays pre-run brief with tone context
  - [ ] RunTrackingService includes sessionInstructions in coaching requests
  - [ ] Coaching events logged to `/api/coaching/session-events`
- [ ] Coaching AI service updated to accept and use session context
  - [ ] System prompts reference `coachingStyle` and `insightFilters`
  - [ ] Metrics filtered based on `insightFilters.exclude`
- [ ] Testing: Generate plan, start run, verify session-specific coaching delivered
- [ ] Post-run analysis: Fetch coaching events via `/api/coaching/session-events/:runId`

---

## Performance Considerations

1. **Session instruction generation** happens at plan creation time (async, not critical path)
2. **Tone determination** uses GPT-4o-mini (fast, ~1 second)
3. **Coaching session events** are logged asynchronously (fire-and-forget from Android)
4. **Indexes** on `session_instructions.planned_workout_id` and `coaching_session_events.run_id` ensure fast lookups

---

## Future Enhancements

1. **Adaptive tone during run** — Adjust tone mid-session based on user engagement
2. **Coaching effectiveness tracking** — Analyze which tones/styles work best per user
3. **ML-driven tone selection** — Learn user preferences over time
4. **Session-specific widgets** — Android UI components that reflect session tone
5. **Coaching replay** — Post-run review of all coaching delivered with user's performance

---

## Support & Debugging

### Check if session instructions exist for a workout
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.airuncoach.com/api/workouts/{workoutId}/session-instructions
```

### Regenerate instructions
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://api.airuncoach.com/api/workouts/{workoutId}/regenerate-session-instructions
```

### View coaching events from a run
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.airuncoach.com/api/coaching/session-events/{runId}
```

---

**Last Updated:** March 20, 2026  
**Status:** Ready for deployment
