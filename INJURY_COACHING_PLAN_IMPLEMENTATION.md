# Injury Support in AI Coaching Plan Generation & Adaptation

## Overview

The AI coaching plan system now fully integrates **injury tracking** to design safe, personalized training plans. Users can record injuries or conditions during plan creation, and the AI automatically adjusts training recommendations based on injury status and history.

**Key Features:**
- ✅ Users can add injuries/conditions during plan creation
- ✅ Injuries inform both initial plan generation AND ongoing plan reassessment
- ✅ Graceful handling when no injuries are recorded
- ✅ Support for multiple injury statuses: recovering, healed, chronic, active
- ✅ AI considers injury history during plan adaptation after each run

## Architecture

### 1. Data Flow

```
Mobile App (GeneratePlanScreen)
    ↓
User adds injuries & conditions
    ↓
Injuries passed to backend via API
    ↓
generateTrainingPlan() includes injuries in AI prompt
    ↓
AI generates personalized plan considering injury status
    ↓
Plan stored in database
    ↓
User completes runs
    ↓
reassessTrainingPlansWithRunData() is triggered
    ↓
AI reassesses plan considering injury history
    ↓
Plan adaptations suggested to user
```

### 2. Injury Data Model

**Android (Kotlin):**
```kotlin
data class Injury(
    val id: String? = null,
    val bodyPart: String,      // "knee", "ankle", "shin", "hip", etc.
    val status: InjuryStatus,  // RECOVERING | HEALED | CHRONIC
    val notes: String? = null, // optional details
    val createdAt: Long = System.currentTimeMillis()
)

enum class InjuryStatus {
    RECOVERING,  // Currently recovering - AI should avoid stress
    HEALED,      // Fully healed - can resume normal training
    CHRONIC      // Chronic condition - manage but accommodate
}
```

**Backend (TypeScript):**
```typescript
export interface InjuryInput {
  bodyPart: string;
  status: string; // "active" | "recovering" | "healed" | "chronic"
  notes?: string;
}
```

## Implementation Details

### 1. UI Changes (Android)

**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GeneratePlanScreen.kt`

**Change:** Moved injuries section AFTER the regular running sessions section

**Rationale:**
- Better logical flow: Goal → Fitness Level → Start Date → Regular Sessions → Injuries → Generate
- Injuries are optional, so placing them last prevents confusion
- Regular sessions are more commonly used, so they appear before optional injury tracking

**UI Components:**
- **Add Injury Dialog** (`AddInjuryDialog`) — Modal for entering injury details
  - Body part dropdown (13 options: knee, ankle, shin, hip, back, foot, calf, hamstring, quad, groin, shoulder, wrist, other)
  - Status selector (Recovering, Healed, Chronic)
  - Optional notes field
- **Injury Cards** — Display added injuries with remove button
- **Add Button** — "Add an injury or condition" / "Add another" (changes text if empty)

### 2. Initial Plan Generation

**File:** `server/training-plan-service.ts` (Function: `generateTrainingPlan`)

**Lines 473-482:** Injuries included in AI prompt when user submits plan

**Injury Prompt Section:**
```
INJURIES & LIMITATIONS:
- Knee: Recovering — ACL reconstruction, 3 months into recovery
- Back: Chronic — lower back tension, especially on long runs

CRITICAL INJURY GUIDELINES:
- For "recovering" or "active" injuries: AVOID all exercises that stress the affected area. Replace with cross-training or rest days.
- For "chronic" injuries: REDUCE intensity and impact. No speed work, hill repeats, or long runs that stress the affected body part. Favor easy runs on flat terrain.
- For "healed" injuries: Gradually reintroduce normal training but note the history — avoid sudden volume increases.
- Always err on the side of caution. A conservative plan that keeps the runner healthy is better than an aggressive plan that causes re-injury.
```

**Status Handling:**
- Supports both Kotlin enum format (RECOVERING, HEALED, CHRONIC) and TypeScript string format (recovering, healed, chronic, active)
- Normalizes status labels for consistent AI processing
- Conditional rendering: Only includes injury section in prompt if injuries exist

### 3. Plan Reassessment with Injuries

**File:** `server/training-plan-service.ts` (Function: `reassessTrainingPlansWithRunData`)

**Lines 1309-1310:** User's injury history included in reassessment prompt

**Integration Points:**
```typescript
${userProfile?.injuryHistory ? `- Injury History: ${JSON.stringify(userProfile.injuryHistory)}` : ''}
```

**Reassessment Workflow:**
1. User completes a run
2. `reassessTrainingPlansWithRunData(userId, runId)` is called
3. AI receives:
   - Recent run data (pace, HR, compliance with coaching cues)
   - User's injury history
   - Current training load and plan progress
4. AI assesses if plan needs adjustment based on:
   - Run performance (adherence to targets)
   - Fitness status (CTL, TSB, training status)
   - Injury considerations (can we increase load safely?)
5. Recommendations include injury-aware adjustments:
   - "Volume too high + recovering knee → suggest flat-surface easy runs instead"
   - "Chronic back acting up → reduce hill work this week"
   - "Healed injury → ok to progress volume, but avoid sudden jumps"

## Error Handling & Fallbacks

### No Injuries Recorded
- **UI:** "Add an injury or condition" button visible, but section is optional
- **Backend:** Conditional rendering uses `injuries && injuries.length > 0`
- **Prompt:** If no injuries, the INJURIES & LIMITATIONS section is omitted entirely
- **Result:** Plan generation works perfectly fine without any injuries

### Missing Injury History
- **Profile:** `userProfile?.injuryHistory` safely returns `undefined` if not set
- **Prompt:** Uses optional chaining — injury history only added if present
- **Result:** Reassessment proceeds without injury context (graceful degradation)

### Invalid Injury Status
- **Frontend:** Dropdown ensures only valid statuses are selected
- **Backend:** Status mapping supports multiple formats (RECOVERING, recovering, active, etc.)
- **Fallback:** Unknown status is passed as-is to AI (e.g., "chronic" → "Chronic")
- **Result:** AI still receives injury info, worst case with unclear status label

## Testing Scenarios

### Scenario 1: New User with Recovering Knee
1. User creates plan for 5K in 8 weeks
2. Adds injury: "Knee" → "Recovering" → "ACL reconstruction, currently week 4 of 12"
3. Expected plan:
   - Moderate volume (not maximum build-up)
   - Tempo and intervals on flat ground only
   - No hill repeats or strides in early weeks
   - Easy recovery runs on flat surfaces
   - Progression conservative, max 5-7% weekly increase

### Scenario 2: Chronic Hip Tightness
1. User with existing half marathon training plan
2. During week 4, reports: "Hip" → "Chronic" → "tightness after long runs"
3. After next run:
   - Reassessment notes chronic hip issue
   - If pace slowed or HR elevated → suggests reducing long run distance
   - Recommends cross-training (cycling, pool) on high-mileage weeks

### Scenario 3: Recently Healed Injury
1. User had ankle sprain 2 weeks ago, now healed
2. Plans 10K race 6 weeks away
3. Expected plan:
   - Gradual reintroduction of speed work (tempo, intervals)
   - Avoids sudden volume jumps
   - Monitors for pain signals in reassessment
   - Can eventually resume normal intensity if reassessment shows good recovery

### Scenario 4: No Injuries
1. Healthy user, no injuries recorded
2. Plan generation proceeds normally
3. No injury section appears in prompt
4. Reassessment treats user as fully available for all workouts

## API Endpoints

### POST /api/training-plans/generate

**Request Body:**
```json
{
  "goalType": "half_marathon",
  "targetDistance": 21.1,
  "durationWeeks": 12,
  "experienceLevel": "intermediate",
  "daysPerWeek": 4,
  "regularSessions": [],
  "injuries": [
    {
      "bodyPart": "Knee",
      "status": "recovering",
      "notes": "ACL reconstruction, 3 months post-op"
    }
  ],
  ...other fields
}
```

**Response:**
```json
{
  "planId": "plan_abc123",
  "message": "Training plan generated successfully"
}
```

### Plan Reassessment (Internal)

**Triggered by:** `POST /api/runs/complete` or `PUT /api/training-plans/workouts/:workoutId/complete`

**Calls:** `reassessTrainingPlansWithRunData(userId, runId)`

**Injury Context:** Automatically fetches from `users.injuryHistory` field

## Future Enhancements

1. **Injury Severity Scale**
   - Add numeric severity (1-10) for more granular AI guidance
   - Example: "Knee sprain, severity 7/10" → more conservative plan

2. **Injury Timeline**
   - Track injury start date, expected recovery date
   - AI adjusts plan as recovery progresses
   - Example: Week 1 post-injury strict rest, week 4 gradual return, week 8 normal training

3. **Injury History Analytics**
   - Dashboard showing past injuries and recovery patterns
   - AI learns runner's typical recovery speed
   - Personalized risk assessment

4. **Integration with Fitness Metrics**
   - Combine injury status with CTL/ATL/TSB
   - Example: "High fatigue + chronic knee → skip tempo work this week"

5. **Injury Prevention Workouts**
   - AI can prescribe specific strengthening exercises
   - Prehab sessions in plan to prevent recurring injuries
   - Example: "Week 3: Add calf strengthening 2x/week to prevent shin splints"

6. **Doctor/Physio Integration**
   - Allow professionals to add/update injuries
   - Share restricted movement patterns
   - Collaborative care coordination

## Rollback Plan

If issues arise:

1. **UI Issue:** Remove injuries section from GeneratePlanScreen
   - Revert: `git revert e7604f4`

2. **Prompt Issue:** Disable injuries in initial plan generation
   - Edit: `training-plan-service.ts` line 473
   - Change: `${injuries && injuries.length > 0 ? ... : ''}`

3. **Reassessment Issue:** Remove injury history from reassessment
   - Edit: `training-plan-service.ts` line 1309
   - Remove: injury history line

4. **Test:** Regenerate existing plans without injuries to verify fallback

## Summary

The injury support system is **production-ready** with:
- ✅ Full integration across plan generation and adaptation
- ✅ Graceful fallbacks for missing injury data
- ✅ Clear injury status guidelines for AI
- ✅ Mobile-first UI designed around user needs
- ✅ Comprehensive error handling
- ✅ Zero impact on users without injuries

The system respects that **keeping a runner healthy is more important than aggressive training**. Plans will always err on the side of caution when injuries are present.

---

**Status:** ✅ Implementation Complete  
**Commit:** `e7604f4` (feat: enhance injury support in AI coaching plan generation and adaptation)  
**Last Updated:** May 3, 2026  
**Testing:** Ready for QA and user feedback
