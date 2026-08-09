# Pre-Run Brief Quick Reference Guide

## 🎯 What is a Pre-Run Brief?
A **2-4 sentence AI-generated coaching message** that tells the runner:
1. **What** they're doing today (session type, distance)
2. **How** to approach it (intensity, focus areas)
3. **Why** it matters (training purpose)

Example:
> "Today is your 5km tempo run building threshold pace. Push hard but controlled through the main effort, focusing on steady breathing and rhythm. This speed work prepares you for race-pace efforts."

---

## 📱 WHERE TO FIND PRE-RUN BRIEFS

### For Free Runs
**Path**: Home → "Start Session" → Pre-Run Modal
- Currently shows **run setup** (distance, time, AI coach toggle)
- Brief display: **Not currently implemented for free runs**

### For Mapped Routes (Map My Run)
**Path**: Home → "Map My Run" → Route Preview → Start Run
- Shows route map and details
- Brief display: **Not currently implemented**

### For Training Plan Workouts
**Path**: Training Plans → Select Workout → Prepare Run
- **Should display** preRunBrief from session instructions
- API called: `GET /api/workouts/:workoutId/session-instructions`
- Display location: **TBD in Training Plans UI**

### For Events
**Path**: Events → Select Event → Pre-Event Screen
- Shows event details, route, AI coach toggle
- Brief display: **Not currently implemented**

---

## 🔧 GENERATING A PRE-RUN BRIEF

### Generation Trigger
```
When: User taps "Prepare Run" or starts a training plan workout
Where: `server/session-coaching-service.ts::generateSessionInstructions()`
```

### Generation Process
```
1. Fetch runner profile
   - Athletic grade, fitness level, race history
   - Weekly mileage, prior preferences

2. Fetch session context
   - Workout type (intervals, tempo, easy, etc.)
   - HR zone (z1-z5)
   - Session goal (speed, endurance, recovery)
   - Duration, distance, intervals

3. Fetch last run assessment
   - Previous coaching feedback
   - Adjustment recommendations

4. Run tone determination AI
   - Returns: optimal tone, intensity, encouragement level
   - Can override user preference per session

5. Run brief + structure generation AI
   - Returns: preRunBrief (2-4 sentences)
   - Returns: sessionStructure (phases, coaching triggers)
   - Returns: coaching style preferences

6. Cache result
   - Stored in sessionInstructions table
   - Linked to plannedWorkout
```

### API Endpoint
```
GET /api/workouts/:workoutId/session-instructions

Response includes:
{
  preRunBrief: string,          // ← The brief
  sessionStructure: {...},      // Phases & triggers
  aiDeterminedTone: string,     // Tone selection
  coachingStyle: {...},         // Encouragement, detail depth
  insightFilters: {...}         // What to include/exclude
}
```

---

## 🧠 HOW THE AI DECIDES TONE

### Input Data
- **Runner Profile**: Grade, fitness, experience, preferences
- **Session Type**: Easy, intervals, tempo, long run, recovery
- **Session Goal**: Speed, endurance, recovery, threshold
- **Last Run Feedback**: What happened, coach recommendations

### AI Decision
The AI asks: "What coaching approach will this runner respond to **right now, for this specific session**?"

Examples:
| Session | Runner | AI Decision | Why |
|---------|--------|-------------|-----|
| Easy recovery | Elite athlete | Light, playful | They don't need intensity cues |
| Hard intervals | Beginner | Motivational, detailed | They need encouragement & guidance |
| Long run | Intermediate | Motivational, steady | Mental game is key |
| Tempo (threshold) | All levels | Direct, technical | Focus & precision matter |

### Output
```json
{
  "tone": "light_fun|direct|motivational|calm|serious|playful|instructive",
  "intensity": "relaxed|moderate|intense",
  "coachingStyle": {
    "encouragementLevel": "low|moderate|high",
    "detailDepth": "minimal|moderate|detailed",
    "technicalDepth": "simple|moderate|advanced"
  }
}
```

---

## 📊 DATA MODELS

### SessionInstructions (Database)
```typescript
{
  id: string;
  plannedWorkoutId: string;
  preRunBrief: string;              // ← The brief
  sessionStructure: {
    type: string;                    // "intervals", "tempo", etc.
    goal: string;                    // "speed", "endurance", "recovery"
    phases: Array<{
      name: string;                  // "warmup", "main_set", "cooldown"
      durationKm: number;
      targetIntensity: string;       // "z1-z2", "z3-z4"
      description: string;
    }>;
    coachingTriggers: Array<{
      phase: string;
      trigger: string;               // "at_start", "at_end", "rep_start"
      message: string;               // Coaching cue (20 words max)
    }>;
  };
  aiDeterminedTone: string;
  aiDeterminedIntensity: string;
  coachingStyle: {...};
  toneReasoning: string;
  insightFilters: {...};
}
```

---

## 🔌 CLIENT INTEGRATION CHECKLIST

### For Free Runs (Home.tsx)
- [ ] Fetch preRunBrief after user confirms settings
- [ ] Display brief in modal or new screen
- [ ] Show brief before "Start Run" button

### For Events (PreEvent.tsx)
- [ ] Fetch session instructions before run
- [ ] Display preRunBrief + sessionStructure
- [ ] Show coaching style info (tone, encouragement level)

### For Training Plans (TBD)
- [ ] Fetch `/api/workouts/:workoutId/session-instructions`
- [ ] Display in pre-run screen
- [ ] Show phases, targets, and coaching triggers

---

## 🔄 REAL-TIME VS PRE-RUN COACHING

### Pre-Run Brief (Before Run)
- ✅ Generated **before** user starts
- ✅ 2-4 sentence overview
- ✅ Session-specific & personalized
- ✅ Stored & reusable

### Real-Time Coaching (During Run)
- Starts **when** user begins running
- Phase-based coaching statements
- Triggered by: km splits, pace, HR, effort
- Uses cooldown system (90s between non-milestones)

---

## 🐛 FALLBACK BEHAVIOR

If AI fails to generate brief, fallback system creates basic message:

```typescript
function buildFallbackBrief(workout: SessionToneRequest): string {
  if (workout.intervalCount) {
    return `Today is ${distance}km ${type} with ${intervals} repetitions. 
            Hit each rep hard and recover well between them. 
            This session builds your speed and fitness — trust the process.`;
  }
  
  return `Today's ${distance}km ${type} session focuses on ${goal}. 
          Run at a controlled effort and stay consistent throughout.`;
}
```

---

## 🎨 COACHING COOLDOWN

Prevents coaching from firing too frequently:

```
Milestones (Always Fire):
  - Km splits (every 1km, 2km, 5km per user setting)
  - 500m check-in (first 500m)
  - Final 500m, Final 100m
  - Interval transitions
  - Navigation turns

Non-Milestones (Subject to Cooldown):
  - Phase coaching
  - Effort coaching
  - Pace deviation
  - HR coaching

Cooldown Times:
  - 90 seconds between non-milestone cues
  - 45 seconds of silence after any milestone
```

---

## 📂 KEY FILES

| File | Purpose |
|------|---------|
| `server/session-coaching-service.ts` | Brief generation logic |
| `server/routes-session-coaching.ts` | API endpoint definitions |
| `server/coaching-cooldown.ts` | Message throttling |
| `client/src/pages/Home.tsx` | Free run pre-run modal |
| `client/src/pages/PreEvent.tsx` | Event pre-run screen |
| `client/src/lib/coachSettings.ts` | Coach voice & tone settings |

---

## 🚀 NEXT STEPS TO DISPLAY BRIEFS

1. **Free Runs**: Add brief fetch + display to Home pre-run modal
2. **Events**: Add brief fetch + display to PreEvent screen
3. **Training Plans**: Create pre-run screen that displays brief + phases
4. **iOS**: Create native SwiftUI component for brief display

---

## 🧪 TESTING THE SYSTEM

```bash
# Test endpoint directly
curl http://localhost:3000/api/workouts/{workoutId}/session-instructions \
  -H "Authorization: Bearer {token}"

# Should return:
{
  "preRunBrief": "Your 2-4 sentence brief here...",
  "sessionStructure": {...},
  "aiDeterminedTone": "motivational",
  ...
}
```

---

## 📞 SUPPORT

For questions about:
- **Brief generation**: See `session-coaching-service.ts::generateAiSessionDesign()`
- **Tone selection**: See `session-coaching-service.ts::determineSessonCoachingTone()`
- **API usage**: See `routes-session-coaching.ts`
- **Client display**: Check `Home.tsx` or `PreEvent.tsx`

