# Neon Database & Plan Reassessment FAQs

## 1. Do I Need to Update Neon?

### ✅ SHORT ANSWER: **NO - ZERO DATABASE CHANGES NEEDED**

The orientation session implementation uses **existing columns** in the current schema:

```sql
-- plannedWorkouts table (ALREADY EXISTS)
workoutType: TEXT           -- "orientation" fits here
sessionGoal: TEXT           -- "assess_fitness" 
sessionIntent: TEXT         -- "orientation_run"
intensity: TEXT             -- "z2" (Zone 2)
effortDescription: TEXT     -- "Conversational effort"
description: TEXT           -- Orientation brief
instructions: TEXT          -- Detailed guidance
hrZoneNumber: INTEGER       -- Zone 2 = 2
hrZoneMinBpm: INTEGER       -- Calculated from age
hrZoneMaxBpm: INTEGER       -- Calculated from age
scheduledDate: TIMESTAMP    -- Week 1, Day 1
distance: REAL              -- Recommended km
targetPace: TEXT            -- Recommended pace
```

**All these columns already exist in your Neon database** - fully backward compatible!

### No Migrations Required ✅

- No schema changes
- No new tables
- No ALTER statements
- No data cleanup

**Just deploy the code and it works!**

---

## 2. Will the Training Plan Reassess After Orientation?

### ✅ YES - AUTOMATIC REASSESSMENT INCLUDED

The system has two reassessment triggers:

### Trigger 1: Orientation Session Completion
**What happens:**
1. User completes orientation run
2. Run is logged with `workoutType = "orientation"`
3. System automatically calls `reassessTrainingPlansWithRunData()`
4. AI analyzes orientation metrics:
   - Actual pace vs recommended
   - Heart rate response
   - Perceived exertion
   - Completion quality

**AI Decision Logic:**
```
IF orientation_pace < estimated_pace + 15 seconds
  → "Runner is stronger than expected"
  → Increase tempo/interval intensity
  
IF orientation_pace > estimated_pace - 15 seconds
  → "Runner needs more base building"
  → Reduce intensity initially
  
IF heart_rate_response indicates
  → "Good aerobic condition"
  → Increase VO2 work
  → "High aerobic demand"
  → More recovery emphasis
```

### Trigger 2: Any Completed Workout
The plan reassesses after **every** completed workout:
```
1. Run completed (orientation or any workout)
2. Coaching events analyzed (HR zone adherence, pace compliance)
3. All active plans reassessed
4. Suggested adjustments made if:
   - Runner consistently exceeding/under pace
   - HR zone violations detected
   - Overtraining signals
   - Ahead/behind schedule
```

---

## 3. Reassessment Flow Diagram

```
USER COMPLETES ORIENTATION RUN
        ↓
Run saved to database
workoutType = "orientation"
        ↓
Route handler calls:
reassessTrainingPlansWithRunData(userId, runId)
        ↓
System fetches:
├─ The completed run data
├─ All active training plans
├─ Coaching events from the run
├─ User profile & fitness metrics
└─ Recent run history (last 10 runs)
        ↓
AI Analysis:
├─ Pace vs target (±5s/km tolerance)
├─ HR zone adherence (< 3 violations OK)
├─ Interval success rate
├─ Session compliance (good/moderate/poor)
└─ Fitness progression
        ↓
For EACH active plan:
├─ Generate AI reassessment prompt
├─ Include orientation metrics
├─ Ask: Should we adjust the plan?
└─ Possible suggestions:
   ├─ Increase tempo pace
   ├─ Add VO2 max work
   ├─ Shift to more speed work
   ├─ Add more recovery days
   └─ No change needed
        ↓
Adaptation Decision:
├─ IF change beneficial → Create planAdaptation record
├─ Suggest to user with reasoning
└─ Wait for user acceptance
        ↓
User sees notification:
"Your fitness is stronger than expected!
 We've adjusted your intensity. Accept? [Yes] [No]"
```

---

## 4. Code Flow: Where Reassessment Happens

### After Run Completion
**File:** `server/routes.ts`

```typescript
// Line ~1416 (After run logged)
if (run) {
  try {
    // This triggers reassessment!
    await reassessTrainingPlansWithRunData(userId, run.id);
  } catch (err) {
    console.error(`Plan reassessment failed`, err);
  }
}
```

**Multiple entry points:**
1. Line 1416: Run sync completion
2. Line 1711: Manual run logging
3. Line 3865: Post-run analysis upload
4. Line 4730: Garmin push webhook

### Reassessment Function
**File:** `server/training-plan-service.ts`  
**Function:** `reassessTrainingPlansWithRunData(userId, runId)`

```typescript
export async function reassessTrainingPlansWithRunData(
  userId: string,
  runId: string
): Promise<void> {
  // 1. Fetch the completed run
  const run = await db.select().from(runs)...
  
  // 2. Get all active plans for user
  const activePlans = await db.select().from(trainingPlans)...
  
  // 3. Fetch coaching events (HR violations, pace deviations)
  const sessionEvents = await db.select()
    .from(coachingSessionEvents)
    .where(eq(runId, runId))
  
  // 4. Calculate compliance metrics
  const hrZoneHighAlerts = sessionEvents.filter(
    e => e.eventType === "hr_zone_high"
  ).length
  
  const paceDeviations = sessionEvents.filter(
    e => e.eventType === "pace_too_fast" 
      || e.eventType === "pace_too_slow"
  ).length
  
  const overallAdherence = totalDeviations >= 6 ? "poor" :
                           totalDeviations >= 3 ? "moderate" : "good"
  
  // 5. For EACH plan: Build reassessment prompt
  const prompt = `As expert coach, reassess plan given:
    - Run pace vs target: ${run.avgPace} vs ${plan.targetPace}
    - HR adherence: ${overallAdherence}
    - Coaching compliance: ${sessionCompliance}
    - Fitness level: ${fitness.status}
    
    Should we adjust intensity, pacing, or structure?
    Respond with JSON: { shouldAdjust, reason, adjustments }
  `
  
  // 6. Call GPT-4 for assessment
  const assessment = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: prompt }],
  })
  
  // 7. If adjustment needed, call adaptTrainingPlan()
  if (assessment.shouldAdjust) {
    await adaptTrainingPlan(plan.id, assessment)
  }
}
```

---

## 5. What Actually Changes in the Plan?

### Possible Adjustments After Orientation

**Scenario 1: Runner Faster Than Expected**
```
Orientation result: 5km @ 4:45/km
Expected: 5:00/km
Gap: -15 seconds/km (15% faster!)

→ Adjustment:
  ├─ Increase tempo pace from 5:20 to 5:05
  ├─ Add VO2 max intervals Week 3
  ├─ Shift long runs faster (5:45 → 5:30)
  └─ Keep easy runs conservative (recovery focus)
```

**Scenario 2: Runner Slower Than Expected**
```
Orientation result: 5km @ 5:15/km
Expected: 5:00/km
Gap: +15 seconds/km (15% slower)

→ Adjustment:
  ├─ Focus on base building Weeks 1-3
  ├─ Delay speed work to Week 4
  ├─ Easy runs stay at estimated pace
  ├─ Add 1 extra recovery day
  └─ Gradually introduce tempo Week 4-5
```

**Scenario 3: Runner At Expected Pace**
```
Orientation result: 5km @ 5:02/km
Expected: 5:00/km
Gap: +2 seconds/km (negligible difference)

→ Adjustment:
  ├─ No changes needed
  ├─ "Your pace estimate was spot-on!"
  ├─ Proceed with planned intensity
  └─ Continue as designed
```

**Scenario 4: HR Zone Issues**
```
Orientation HR data:
  - Target Zone 2: 110-130 bpm
  - Actual: Ran at 135-145 bpm
  - HR drifted 10+ bpm over last km

→ Adjustment:
  ├─ Runner is pushing too hard
  ├─ Adjust all easy run paces +0:15/km
  ├─ Add more recovery emphasis
  ├─ Consider fitness level may be lower
  └─ Reduce intensity across plan
```

---

## 6. Plan Adaptation Tracking

### Adaptation History
**File:** `shared/schema.ts` - `planAdaptations` table

```sql
CREATE TABLE plan_adaptations (
  id UUID PRIMARY KEY,
  trainingPlanId UUID NOT NULL,
  adaptationDate TIMESTAMP DEFAULT NOW(),
  reason TEXT,                    -- "orientation_assessment"
  changes JSONB,                  -- What changed
  aiSuggestion TEXT,              -- Reasoning
  userAccepted BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT NOW()
)
```

**After orientation reassessment:**
```json
{
  "trainingPlanId": "plan-123",
  "adaptationDate": "2026-05-05T10:30:00Z",
  "reason": "orientation_assessment",
  "changes": {
    "tempoTargetPace": {
      "from": "5:20/km",
      "to": "5:05/km"
    },
    "vo2MaxIntroduction": {
      "from": "Week 4",
      "to": "Week 3"
    },
    "longRunPace": {
      "from": "5:45/km",
      "to": "5:30/km"
    }
  },
  "aiSuggestion": "Orientation run showed the runner is 15s/km faster than estimated. Increasing intensity starting Week 2 while keeping easy runs conservative.",
  "userAccepted": null  -- Waiting for user response
}
```

---

## 7. Timeline: Orientation → Reassessment

### Week 1
**Day 1 (Today):**
```
User gets plan with orientation in Week 1, Day 1
System: "Let's assess your fitness first"
User: "OK, running tomorrow"
```

**Day 2:**
```
User runs orientation 5km @ 5:02/km
App logs run
Route handler triggers reassessTrainingPlansWithRunData()
↓
AI analyzes:
  ✓ Pace: 5:02 vs expected 5:00 (✓ PERFECT)
  ✓ HR: 112-128 bpm (✓ Zone 2 PERFECT)
  ✓ Effort: "Felt conversational" (✓ ASSESSMENT SUCCESS)
↓
Result: "No changes needed - your pace estimate was spot-on!"
Plan proceeds as designed
```

### Week 2-12
```
User follows personalized 12-week plan
- Paces validated by orientation
- Intensity calibrated to actual fitness
- All future workouts use orientation data
```

---

## 8. Orientation Reassessment Specifics

### What Makes Orientation Special?

**Standard Run Reassessment:**
```
Look for: Pace/HR deviations
Reason: Did they follow the workout?
Action: Minor adjustments if needed
```

**Orientation Reassessment:**
```
Look for: Actual vs predicted fitness
Reason: Is our baseline estimate correct?
Action: Major plan recalibration if needed
Decisions:
  ├─ Is experience level accurate?
  ├─ Is pace prediction valid?
  ├─ Any safety concerns?
  ├─ Should we increase/decrease intensity?
  └─ Do we need to add/remove workouts?
```

### Special Metrics for Orientation

The reassessment prompt includes:

```python
orientation_data = {
  "was_orientation": True,
  "estimated_pace_per_km": 300,           # seconds (5:00)
  "actual_pace_per_km": 302,              # seconds (5:02)
  "pace_difference": 2,                   # seconds (negligible)
  "pace_percentage_diff": 0.67,           # % (< 5% = accurate)
  "heart_rate_avg": 120,
  "heart_rate_max": 128,
  "hr_zone_target_min": 110,
  "hr_zone_target_max": 130,
  "hr_in_zone_percentage": 95,            # % of run
  "perceived_effort": "conversational",
  "form_notes": "smooth, no issues",
  "overall_assessment": "confident",
}
```

---

## 9. FAQ

### Q: What if the user doesn't complete the orientation?
**A:** The plan just sits there with orientation in Week 1, Day 1. It won't auto-delete. User can:
- Complete it later
- Delete it and skip to Week 2
- Request plan restart

### Q: What if reassessment suggests conflicting changes?
**A:** The AI evaluates holistically:
- Pace suggests increase intensity
- HR suggests add recovery
- Result: "Increase tempo/intervals, add recovery day"

### Q: Can the user reject a reassessment adjustment?
**A:** Yes! The `planAdaptations.userAccepted` tracks this:
- Suggestion shown to user
- User accepts or declines
- Only accepted changes apply

### Q: How often does reassessment happen?
**A:** After every completed run:
- Orientation: Major reassessment
- Regular workouts: Minor adjustments if needed
- Skipped workouts: Recovery/catch-up suggestions

### Q: What if user has no active plans?
**A:** Reassessment skips gracefully:
```
[Plan Reassessment] No active plans for user XYZ
```

### Q: Can reassessment happen mid-run?
**A:** No. Only after run completion:
1. Run saved to database
2. Route handler calls reassessment
3. AI analyzes final data

---

## 10. Summary

### Neon Database Updates
✅ **ZERO CHANGES REQUIRED**
- Uses existing `plannedWorkouts` columns
- Uses existing `sessionInstructions` columns
- Uses existing `planAdaptations` table
- Fully backward compatible
- **Just deploy!**

### Plan Reassessment After Orientation
✅ **AUTOMATIC & IMMEDIATE**
1. User completes orientation
2. `reassessTrainingPlansWithRunData()` triggers
3. AI analyzes orientation metrics
4. Plan adjustments suggested
5. User accepts/rejects changes

### What Gets Adjusted
- ✅ Easy run pace (if fitness level off)
- ✅ Tempo pace (if stronger/weaker than expected)
- ✅ VO2 work timing (if ready for intensity)
- ✅ Recovery emphasis (if HR data indicates)
- ✅ Week structure (if behind/ahead)

### Timeline
- **Week 1, Day 1**: Orientation session
- **Week 1, Day 2-3**: User completes orientation
- **Within seconds**: Reassessment analysis
- **Within minutes**: Adjustment suggestions shown
- **Week 2+**: Plan proceeds with personalized pacing

---

## Code References

**Orientation Service:**
- `server/orientation-session-service.ts`
- Functions: `assessOrientationNeed()`, `calculateOrientationTargets()`

**Plan Reassessment:**
- `server/training-plan-service.ts`
- Function: `reassessTrainingPlansWithRunData()` (line 1355)
- Function: `adaptTrainingPlan()` (line 1168)

**Route Triggers:**
- `server/routes.ts`
- Lines 1416, 1711, 3865, 4730
- Each route calls reassessment after run save

**Database Schema:**
- `shared/schema.ts`
- `plannedWorkouts` table (line 1167)
- `planAdaptations` table (line 1209)

---

**Conclusion:** No Neon changes needed. Reassessment is automatic. Deploy with confidence!
