# Plan Adaptation & Session Coaching Regeneration

## Current State vs. Desired State

### ❌ Current Behavior (Gap)
When a plan is adapted after orientation:
1. ✅ OpenAI generates new workout parameters (distance, pace, intensity)
2. ✅ Workouts are updated in the database
3. ❌ **Session coaching instructions NOT regenerated**
4. ❌ Old pre-run briefs still show
5. ❌ User gets changed workout but old coaching

**Example:**
```
Orientation completed: Runner ran 4:45/km (faster than 5:00/km estimate)
↓
AI suggests: Increase tempo pace from 5:20 to 5:05/km
↓
Workout updated: newPace = "5:05/km"
↓
But session coaching still says: "Target 5:20/km rhythm"
❌ MISMATCH!
```

### ✅ Desired Behavior (What You're Asking For)
When a plan is adapted:
1. ✅ OpenAI generates new workout parameters
2. ✅ Workouts are updated
3. ✨ **Session coaching regenerated with new parameters**
4. ✨ New pre-run briefs reflect updated paces
5. ✨ User sees fully coordinated plan + coaching

**Example (Fixed):**
```
Orientation completed: Runner ran 4:45/km (faster!)
↓
AI suggests: Increase tempo pace from 5:20 to 5:05/km
↓
Workout updated: newPace = "5:05/km"
↓
Session instructions REGENERATED:
  "You're stronger than we thought! 
   Tempo work at 5:05/km - push your threshold."
✅ ALIGNED!
```

---

## Implementation Strategy

### Option A: Regenerate on Acceptance (RECOMMENDED)

**When:** When user accepts a plan adaptation  
**Where:** `adaptation-service.ts` → `acceptAndApplyAdaptation()`  
**Cost:** ~200 lines of code

```typescript
export async function acceptAndApplyAdaptation(
  adaptationId: string,
  userId: string
): Promise<...> {
  // 1. Get adaptation
  // 2. Apply workout changes ✅
  
  // 3. [NEW] Regenerate session instructions for changed workouts
  if (workoutsUpdated > 0) {
    await regenerateSessionInstructionsForAdaptedWorkouts(
      trainingPlanId,
      changes.upcoming_workout_adjustments
    )
  }
  
  // 4. Mark accepted
  // 5. Return
}
```

### Option B: Regenerate Before Suggestion (ADVANCED)

**When:** When adaptation is created (before user accepts)  
**Where:** `training-plan-service.ts` → `adaptTrainingPlan()`  
**Cost:** ~300 lines of code
**Benefit:** Show user preview of new coaching before accepting

```typescript
// Generate new coaching prompts for suggested changes
const suggestedCoaching = await generateCoachingForAdaptations(
  userId,
  upcomingWorkouts,
  changes
)

// Return suggestion with coaching preview
return {
  summary: adaptation.summary,
  changes: changes,
  suggestedCoaching: suggestedCoaching  // Preview!
}
```

---

## Recommended Implementation: Option A

### Step 1: Create Helper Function

**File:** `server/adaptation-service.ts`

```typescript
/**
 * Regenerate session coaching for workouts that were adapted.
 * Called after user accepts an adaptation to ensure coaching
 * matches the new workout parameters.
 */
async function regenerateSessionInstructionsForAdaptedWorkouts(
  trainingPlanId: string,
  adjustments: Array<{
    workoutId: string;
    newIntensity?: string;
    newWorkoutType?: string;
    newDistance?: number;
    // ... other fields
  }>
): Promise<{ regenerated: number; failed: number }> {
  let regenerated = 0;
  let failed = 0;

  for (const adjustment of adjustments) {
    try {
      // Fetch the updated workout
      const workouts = await db
        .select()
        .from(plannedWorkouts)
        .where(eq(plannedWorkouts.id, adjustment.workoutId));

      if (!workouts[0]) continue;

      const workout = workouts[0];

      // Get user for runner profile context
      const plan = await db
        .select()
        .from(trainingPlans)
        .where(eq(trainingPlans.id, trainingPlanId))
        .limit(1);

      if (!plan[0]) continue;

      const userId = plan[0].userId;

      // Generate NEW session instructions with updated parameters
      const coaching = await generateSessionInstructions(userId, workout.id, {
        userId,
        plannedWorkoutId: workout.id,
        workoutType: workout.workoutType || undefined,
        intensity: workout.intensity || undefined,
        sessionGoal: workout.sessionGoal || undefined,
        sessionIntent: workout.sessionIntent || undefined,
        distance: workout.distance || undefined,
        duration: workout.duration || undefined,
        // Add context about why this changed
        adaptation: {
          reason: "Plan adapted based on recent session performance",
          previousIntensity: adjustment.newIntensity, // For AI context
        }
      });

      // Delete old session instructions
      if (workout.sessionInstructionsId) {
        await db
          .delete(sessionInstructions)
          .where(eq(sessionInstructions.id, workout.sessionInstructionsId));
      }

      // Create new session instructions
      const newInstructions = await db
        .insert(sessionInstructions)
        .values({
          plannedWorkoutId: workout.id,
          preRunBrief: coaching.preRunBrief,
          sessionStructure: coaching.sessionStructure,
          aiDeterminedTone: coaching.aiDeterminedTone,
          aiDeterminedIntensity: coaching.aiDeterminedIntensity,
          coachingStyle: coaching.coachingStyle,
          insightFilters: coaching.insightFilters,
          toneReasoning: coaching.toneReasoning,
        })
        .returning();

      // Link to workout
      if (newInstructions[0]) {
        await db
          .update(plannedWorkouts)
          .set({ sessionInstructionsId: newInstructions[0].id })
          .where(eq(plannedWorkouts.id, workout.id));
      }

      regenerated++;
      console.log(`✅ Regenerated coaching for adapted workout ${workout.id}`);
    } catch (err) {
      console.warn(`⚠️ Failed to regenerate coaching for ${adjustment.workoutId}:`, err);
      failed++;
    }
  }

  return { regenerated, failed };
}
```

### Step 2: Call Helper in acceptAndApplyAdaptation

**File:** `server/adaptation-service.ts`

Update the function at line 36:

```typescript
export async function acceptAndApplyAdaptation(
  adaptationId: string,
  userId: string
): Promise<{ success: boolean; workoutsUpdated: number; error?: string }> {
  try {
    // ... existing code to apply changes ...

    // 4. Apply changes to future workouts
    let workoutsUpdated = 0;
    // ... loop through adjustments and update ...

    // 5. [NEW] Regenerate session coaching for adapted workouts
    if (workoutsUpdated > 0 && changes.upcoming_workout_adjustments) {
      console.log(`[Adaptation] Regenerating coaching for ${workoutsUpdated} adapted workouts...`);
      
      const coachingResult = await regenerateSessionInstructionsForAdaptedWorkouts(
        trainingPlanId,
        changes.upcoming_workout_adjustments
      );
      
      console.log(
        `[Adaptation] Coaching regenerated: ${coachingResult.regenerated} successful, ${coachingResult.failed} failed`
      );
    }

    // 6. Mark adaptation as accepted
    await db
      .update(planAdaptations)
      .set({ userAccepted: true })
      .where(eq(planAdaptations.id, adaptationId));

    console.log(
      `✅ Adaptation ${adaptationId} accepted. ${workoutsUpdated} workouts updated, coaching regenerated.`
    );

    return { success: true, workoutsUpdated };
  } catch (error) {
    console.error(`❌ Error applying adaptation:`, error);
    return {
      success: false,
      workoutsUpdated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

### Step 3: Import Required Functions

**File:** `server/adaptation-service.ts`

```typescript
import { generateSessionInstructions } from "./session-coaching-service";
// Add to existing imports
```

---

## What Gets Regenerated?

### Session Coaching Parameters Updated

When a workout changes from:
```json
{
  "workoutType": "tempo",
  "intensity": "z3",
  "distance": 10,
  "targetPace": "5:20/km",
  "description": "Tempo run at threshold pace"
}
```

To:
```json
{
  "workoutType": "tempo",
  "intensity": "z3",
  "distance": 10,
  "targetPace": "5:05/km",  // ← CHANGED
  "description": "Tempo run at threshold pace"
}
```

### New Session Instructions Will Include:

✅ Updated pre-run brief mentioning faster pace  
✅ New intensity guidance for the higher tempo  
✅ Updated session structure with new targets  
✅ Adjusted coaching tone if needed  
✅ Context about "Your fitness is stronger"  

### Example Output

**Old Coaching (Before Adaptation):**
```
🏃‍♂️ TEMPO RUN

Distance: 10km
Target Pace: 5:20/km
Intensity: Lactate Threshold (Zone 3)

Today you're working at your threshold pace.
Hold 5:20/km and focus on steady effort.
This is comfortably hard but sustainable.
```

**New Coaching (After Adaptation):**
```
🏃‍♂️ TEMPO RUN - ADJUSTED FOR YOUR FITNESS

Distance: 10km
Target Pace: 5:05/km  ← Updated based on your strength
Intensity: Lactate Threshold (Zone 3)

Your recent runs showed you're stronger than expected!
We've bumped up your tempo work to 5:05/km.
This challenges your threshold more effectively.
Focus on smooth form at this faster pace.
You've got this!
```

---

## Code Flow Diagram

```
USER COMPLETES ORIENTATION RUN
        ↓
reassessTrainingPlansWithRunData() triggered
        ↓
Calls adaptTrainingPlan()
        ↓
OpenAI generates adaptation:
  - Increase tempo from 5:20 to 5:05
  - Add VO2 work Week 3
  - Adjust long run pace
        ↓
planAdaptations record created
        ↓
User sees notification:
  "Your fitness is stronger! Accept new plan?"
        ↓
User clicks ACCEPT
        ↓
acceptAndApplyAdaptation() called
        ↓
┌─ Update workouts
│  └─ tempo: 5:20 → 5:05 ✓
│  └─ longRun: 5:45 → 5:30 ✓
│  └─ vo2Start: Week 4 → Week 3 ✓
│
└─ [NEW] regenerateSessionInstructionsForAdaptedWorkouts()
   ├─ For each changed workout:
   │  ├─ Fetch updated workout data
   │  ├─ Call generateSessionInstructions()
   │  ├─ Delete old sessionInstructions
   │  ├─ Insert new sessionInstructions
   │  └─ Link to workout
   │
   └─ Report: "Regenerated 3 coaching briefs"
        ↓
Mark adaptation as accepted
        ↓
User sees updated plan with NEW COACHING
```

---

## Testing the Implementation

### Test Case 1: Pace Change Regeneration
```
Setup: Plan with tempo at 5:20/km
Action: Orientation shows runner is 15s/km faster
        AI adapts tempo to 5:05/km
        User accepts

Verify:
✅ Workout updated to 5:05/km
✅ Old session instructions deleted
✅ New session instructions created
✅ New coaching mentions faster pace
✅ Pre-run brief says "stronger than expected"
```

### Test Case 2: Intensity Change Regeneration
```
Setup: Plan with VO2 max Week 4
Action: Orientation shows runner needs base building
        AI moves VO2 to Week 5
        User accepts

Verify:
✅ Workout moved/modified
✅ New coaching explains delay
✅ Session instructions regenerated
✅ Tone adjusted (more cautious, encouraging)
```

### Test Case 3: Rest Day Creation
```
Setup: Plan with regular workout
Action: AI detects overtraining
        Suggests converting to rest day
        User accepts

Verify:
✅ Workout changed to "rest" type
✅ Old coaching deleted
✅ New coaching created (or none for rest days)
✅ Confirmation shown to user
```

---

## FAQ & Considerations

### Q: What if session instruction generation fails?
**A:** Function continues with other workouts. Failed count is logged.
```
[Adaptation] Coaching regenerated: 2 successful, 1 failed
```
User is still notified that adaptation was applied.

### Q: Will regeneration slow down the user experience?
**A:** 
- Regenerating 1-3 workouts takes ~2-5 seconds
- Happens after user accepts (not blocking)
- Could be async if needed

### Q: What if the user had started the run already?
**A:** Session instructions only matter before the run starts.
If workout already started, new coaching won't appear during run.
But it will be there for reattempts or future similar sessions.

### Q: Should we regenerate ALL workouts or just changed ones?
**A:** Just changed ones (more efficient).
The `changes.upcoming_workout_adjustments` already tells us which workouts changed.

### Q: What about cost (OpenAI API calls)?
**A:** 
- Each adaptation affects 1-3 workouts typically
- Each regeneration = 1 API call (~0.05 seconds, ~$0.0005)
- Orientation adaptations happen once per plan
- Acceptable cost for better UX

---

## Implementation Checklist

- [ ] Create helper function `regenerateSessionInstructionsForAdaptedWorkouts()`
- [ ] Import `generateSessionInstructions` in adaptation-service.ts
- [ ] Call helper from `acceptAndApplyAdaptation()`
- [ ] Add logging for regeneration progress
- [ ] Test with orientation adaptation scenario
- [ ] Test with regular workout adaptation
- [ ] Test error handling
- [ ] Deploy and monitor logs

---

## Future Enhancements

### Phase 1 (Current): Manual Regeneration on Accept
- User accepts adaptation
- Coaching regenerated immediately

### Phase 2 (Optional): Preview Coaching Before Accept
- Generate coaching as part of suggestion
- Show user: "Here's your new coaching"
- User sees before accepting

### Phase 3 (Optional): Async Regeneration
- User accepts adaptation (instant)
- Coaching regenerated in background
- Push notification when ready

---

## Summary

### The Gap
Currently, when plans adapt:
- ✅ Workouts change
- ❌ Coaching doesn't match

### The Fix
Regenerate session coaching whenever workouts are adapted:
- ✅ Workouts change
- ✅ Coaching regenerated
- ✅ Everything aligned

### Implementation
- Add helper function: ~50 lines
- Call from acceptAndApplyAdaptation: ~10 lines
- Total: ~60 lines of code

### Benefit
Users see fully coordinated plan + coaching after adaptations.
No mismatches between workout parameters and pre-run briefs.

---

## Code Ready to Implement

The helper function and integration point are outlined above.
Ready to implement in `server/adaptation-service.ts` when you give the go-ahead!

Would you like me to implement this enhancement?
