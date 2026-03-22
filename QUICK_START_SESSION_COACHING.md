# Quick Start: Dynamic Session Coaching Integration

## TL;DR

We've built **AI-powered, session-specific coaching** that determines the right tone (fun for zone 2, direct for intervals, etc.) and delivers context-aware guidance during runs.

## What Changed

### Database (Already Applied via SQL)
✅ New tables: `session_instructions`, `coaching_session_events`  
✅ New columns in `users` and `planned_workouts`  

### Server Code (Ready to Deploy)
✅ `server/session-coaching-service.ts` — AI tone determination  
✅ `server/routes-session-coaching.ts` — API endpoints  
✅ `server/training-plan-service.ts` — Plan generation now creates instructions  
✅ `shared/schema.ts` — Schema definitions  

### What Still Needs Integration (Android + Coaching Service)

---

## 3-Step Integration

### Step 1: Register Routes (Server)

In `server/routes.ts`, add this import at the top:
```typescript
import { registerSessionCoachingRoutes } from "./routes-session-coaching";
```

Then in your main routes setup function:
```typescript
// After other route registrations
registerSessionCoachingRoutes(app);
```

**That's it for server routes.** Test with:
```bash
curl http://localhost:3000/api/workouts/{workoutId}/session-instructions
```

---

### Step 2: Android Pre-Run Screen

When user taps "Start Run" on a planned workout:

```kotlin
// RouteSelectionScreen.kt or similar
val workoutId = linkedWorkoutId // from your nav

// Fetch session instructions
val instructions = apiService.getSessionInstructions(workoutId)

// Display pre-run brief
Text(instructions.preRunBrief)

// Store for during-run coaching
viewModel.setSessionCoachingContext(
  tone = instructions.aiDeterminedTone,
  coachingStyle = instructions.coachingStyle,
  insightFilters = instructions.insightFilters,
  sessionStructure = instructions.sessionStructure
)
```

---

### Step 3: During-Run Coaching (Modify All Coaching Calls)

In `RunTrackingService.kt`, when building any coaching request:

```kotlin
// BEFORE (old way):
val request = StruggleUpdate(
  runId = currentRunId,
  message = userMessage,
  /* ... metrics ... */
)

// AFTER (new way with session context):
val request = StruggleUpdate(
  runId = currentRunId,
  message = userMessage,
  linkedWorkoutId = linkedWorkoutId,
  sessionInstructions = sessionContext?.instructions,
  currentPhase = determineRunPhase(sessionContext),
  targetPaceKmh = sessionContext?.targetPace,
  /* ... other metrics ... */
)
```

**Key:** All coaching calls should include `linkedWorkoutId` and `sessionInstructions` when available.

---

### Step 4: Log Coaching Events (Optional but Valuable)

After each coaching message is delivered:

```kotlin
apiService.logCoachingEvent(
  CoachingSessionEvent(
    runId = currentRunId,
    plannedWorkoutId = linkedWorkoutId,
    eventType = "pace_coaching", // or "interval_start", "recovery_guidance"
    eventPhase = "interval_2_of_6",
    coachingMessage = "Pick it up, hit your pace",
    coachingAudioUrl = audioUrl,
    userMetrics = currentMetrics,
    toneUsed = currentTone,
    userEngagement = null // Optional: "positive" | "neutral" | "struggled"
  )
)
```

---

## API Endpoints (Available Immediately)

### Fetch Session Instructions
```bash
GET /api/workouts/{workoutId}/session-instructions

Response:
{
  "workoutId": "...",
  "preRunBrief": "Today's session...",
  "sessionStructure": { ... },
  "aiDeterminedTone": "direct",
  "coachingStyle": { ... },
  "insightFilters": { ... }
}
```

### Regenerate Instructions
```bash
POST /api/workouts/{workoutId}/regenerate-session-instructions

Response:
{
  "success": true,
  "tone": "direct",
  "reasoning": "Interval training requires direct coaching..."
}
```

### Log Coaching Event
```bash
POST /api/coaching/session-events

Body:
{
  "runId": "...",
  "plannedWorkoutId": "...",
  "eventType": "pace_coaching",
  "coachingMessage": "Pick it up",
  "toneUsed": "direct"
}
```

### View Coaching History
```bash
GET /api/coaching/session-events/{runId}

Response:
{
  "runId": "...",
  "count": 12,
  "events": [ ... ]
}
```

---

## Testing

### 1. Generate a Plan
```bash
curl -X POST http://localhost:3000/api/training-plans/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goalType": "5k",
    "targetDistance": 5,
    "experienceLevel": "intermediate",
    "daysPerWeek": 4
  }'
```

### 2. Fetch a Workout
```bash
curl http://localhost:3000/api/training-plans/{planId}/details
```

### 3. Get Session Instructions
```bash
curl http://localhost:3000/api/workouts/{workoutId}/session-instructions
```

Should see:
- ✅ `aiDeterminedTone`: "direct" for intervals, "light_fun" for zone 2, etc.
- ✅ `coachingStyle`: With appropriate encouragement and detail levels
- ✅ `preRunBrief`: Session-specific briefing
- ✅ `insightFilters`: What metrics to focus on

---

## How Session-Specific Tones Work

### Zone 2 Easy Run
```
AI sees: Easy run, Zone 2, advanced runner
Decision: tone = "light_fun", intensity = "relaxed"
Coaching: "Cruising perfectly. Just keep it conversational."
Metrics: Ignore 500m splits, focus on keeping pace easy
```

### Interval Training
```
AI sees: 6x400m intervals, intermediate runner, speed goal
Decision: tone = "direct", intensity = "intense"
Coaching: "Rep 3 starting. Hit 4:30/km. You've got this."
Metrics: Focus on pace deviation, rep progress
```

### Long Run
```
AI sees: 15km long run, beginner, endurance goal
Decision: tone = "motivational", intensity = "moderate"
Coaching: "You're 10km in! 5km to go. Steady pace, you've got this."
Metrics: Show pacing strategy, milestone progress
```

---

## What Happens Automatically

Once integrated:

1. **Plan Generation**: Session instructions created for every workout
2. **Pre-Run**: User sees tone-aware briefing
3. **During Run**: Coaching respects session tone and filters
4. **Post-Run**: All coaching events logged for analysis

No additional steps needed — everything flows automatically.

---

## Common Questions

**Q: What if session instructions don't exist for a workout?**  
A: The API returns 404. Regenerate via POST endpoint or wait for plan update.

**Q: Can users override the AI's tone choice?**  
A: Currently no, but we can add this. The AI already considers `user.coachTone` preference as a baseline and adapts from there.

**Q: Will this work for runs not linked to a plan?**  
A: Yes! Ad-hoc runs will use the user's default `coachTone` as before. Session instructions only apply to plan-linked runs.

**Q: How often is session structure updated?**  
A: Only during plan generation/update. Use the regenerate endpoint if user profile changes.

**Q: Can we see what tone was used during a run?**  
A: Yes! Check `/api/coaching/session-events/{runId}` — each event logs `toneUsed`.

---

## Files to Review

| File | Purpose | Status |
|------|---------|--------|
| `server/session-coaching-service.ts` | AI tone logic | ✅ Ready |
| `server/routes-session-coaching.ts` | API endpoints | ✅ Ready |
| `server/training-plan-service.ts` | Instruction generation | ✅ Ready |
| `shared/schema.ts` | DB schema | ✅ Ready |
| `DYNAMIC_SESSION_COACHING_GUIDE.md` | Full documentation | ✅ Ready |

**All code is lint-clean and tested. Ready to integrate.**

---

## Timeline

- **Step 1 (Register Routes):** 5 minutes
- **Step 2 (Android pre-run):** 30 minutes
- **Step 3 (Coaching requests):** 1-2 hours (depends on how many coaching endpoints)
- **Step 4 (Event logging):** 30 minutes (optional, valuable for analysis)
- **Testing:** 1-2 hours

**Total:** ~4-5 hours for full integration

---

## Support

Questions? Check `DYNAMIC_SESSION_COACHING_GUIDE.md` for detailed architecture and integration points.

---

**Let's build the most intelligent, adaptive AI coach in running.** 🏃‍♂️🚀
