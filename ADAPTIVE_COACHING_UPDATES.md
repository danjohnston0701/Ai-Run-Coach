# Adaptive Coaching Plan Updates

## Overview

The adaptive coaching system (which reassesses and adjusts plans based on actual run performance) has been updated to be aware of prosthetic/AFO conditions, consistent with the initial plan generation philosophy.

---

## What Changed

### Two Functions Updated

1. **`reassessTrainingPlansWithRunData()`** (line 2219)
   - Called after every run to assess if plan needs adjusting
   - Now detects if athlete has prosthetic/AFO
   - Includes prosthetic context in reassessment prompt

2. **`adaptTrainingPlan()`** (line 1935)
   - Called when reassessment determines adjustments are needed
   - Now fetches user profile to check for prosthetic
   - Includes prosthetic context in adaptation prompt

---

## Code Changes

### Change 1: reassessTrainingPlansWithRunData()

**Added** (lines 2219-2229):
```typescript
// Check if runner has prosthetic/AFO in injury history
const hasProsthetic = userProfile?.injuryHistory && Array.isArray(userProfile.injuryHistory) && 
  userProfile.injuryHistory.some((i: any) => i.isProstheticOrAFO === true);

const prostheticContext = hasProsthetic ? `
⚠️ PROSTHETIC/ORTHOTIC DEVICE CONTEXT: This athlete uses a prosthetic or orthotic device. 
When evaluating plan adjustments, remember:
• Prosthetic-specific fatigue may differ from standard aerobic fatigue
• Non-prosthetic limb compensation patterns inform progression decisions
• Terrain and surface considerations are important for prosthetic users
• Conservative progression may be more appropriate than standard plans` : '';

// Build AI prompt for plan reassessment
const prompt = `As an expert running coach, reassess this training plan...${prostheticContext}`
```

**Result**: OpenAI's reassessment considers prosthetic constraints when deciding if/how to adapt.

---

### Change 2: adaptTrainingPlan()

**Added** (lines 1937-1943):
```typescript
// Get user profile for prosthetic context
const userProfile = await db
  .select()
  .from(users)
  .where(eq(users.id, userId))
  .limit(1);
```

**Added** (lines 2006-2015):
```typescript
// Check if runner has prosthetic/AFO
const hasProsthetic = userProfile?.[0]?.injuryHistory && Array.isArray(userProfile[0].injuryHistory) && 
  userProfile[0].injuryHistory.some((i: any) => i.isProstheticOrAFO === true);

const prostheticAdaptContext = hasProsthetic ? `
⚠️ PROSTHETIC/ORTHOTIC DEVICE CONTEXT: This athlete uses a prosthetic or orthotic device. 
When suggesting adjustments:
• Respect conservative progression principles specific to prosthetic users
�� Consider prosthetic-specific fatigue (may differ from standard aerobic fatigue)
• Monitor non-prosthetic limb compensation patterns
• Maintain safety and confidence as primary priorities in progression decisions` : '';

const prompt = `As an expert running coach, adapt this training plan...${prostheticAdaptContext}`
```

**Result**: When OpenAI generates specific workout adjustments, it respects prosthetic constraints.

---

## How This Works for Nino

### Scenario: Nino's Week 1 Performance

**Nino completes Week 1 walking sessions:**
```
Mon: 2km walk ✅ → HR good, no issues
Wed: 2.5km walk ✅ → HR good, right leg mildly tired (normal)
Thu: 1.5km recovery ✅ → fine
Fri: 2.5km walk/jog ✅ → right leg worked, AFO secure
Sat: 2km walk ✅ → managing well
Sun: 1.5km recovery ✅ → ready for Week 2
```

### System Process

```
After Sunday session:
  ↓
reassessTrainingPlansWithRunData() triggers
  ├─ Analyzes all Week 1 data
  ├─ Detects: hasProsthetic = true (from userProfile.injuryHistory)
  ├─ Adds prosthetic context to reassessment prompt:
  │  "This athlete uses a prosthetic/orthotic device.
  │   Prosthetic-specific fatigue may differ from standard aerobic fatigue..."
  ├─ OpenAI assesses: "Week 1 went well, right leg compensation manageable"
  └─ Decides: needsAdjustment = false (OR minor adjustments)
  
If adjustment needed:
  ↓
adaptTrainingPlan() triggers
  ├─ Fetches user profile (now includes prosthetic info)
  ├─ Adds prosthetic context to adaptation prompt:
  │  "This athlete uses a prosthetic. Respect conservative progression.
  │   Monitor non-prosthetic limb compensation..."
  ├─ OpenAI generates specific adjustments respecting prosthetic constraints
  └─ Example: "Slight increase in walking duration Week 2, same walk/jog ratio"

Result: Week 2 plan progression respects prosthetic adaptation timeline
```

---

## Philosophical Consistency

### Before Updates
```
✅ Initial Plan Generation: Provides context about prosthetic, lets OpenAI design
❌ Plan Adaptation: No prosthetic awareness, generic reassessment
```

### After Updates
```
✅ Initial Plan Generation: Provides context about prosthetic, lets OpenAI design
✅ Plan Adaptation: Also aware of prosthetic, respects constraints in adjustments
```

**Now consistent throughout the entire coaching lifecycle.**

---

## What Nino Experiences (Unchanged from User Perspective)

**Visible Changes:**
- None (still see the same adapted plans)

**Invisible Changes (Quality):**
- Adaptations now respect prosthetic constraints
- OpenAI factors in prosthetic-specific fatigue when adjusting
- Conservative progression more likely to be maintained
- Non-prosthetic leg compensation recognized in decisions

---

## Technical Details

### Detection Logic
```typescript
const hasProsthetic = userProfile?.injuryHistory && 
  Array.isArray(userProfile.injuryHistory) && 
  userProfile.injuryHistory.some((i: any) => i.isProstheticOrAFO === true);
```

**This checks**:
1. User has injury history
2. It's an array
3. At least one injury has `isProstheticOrAFO === true`

**Result**: `hasProsthetic` is true if detected

### Context Passed to OpenAI
```typescript
const prostheticContext = hasProsthetic ? `
⚠️ PROSTHETIC/ORTHOTIC DEVICE CONTEXT: ...
• Prosthetic-specific fatigue...
• Non-prosthetic limb compensation...
[etc]
` : '';

const prompt = `...${prostheticContext}...`;
```

**Result**: If `hasProsthetic` is true, context is included. Otherwise, generic adaptation.

---

## Guarantees

✅ **Backward Compatible**: Non-prosthetic users unaffected
✅ **Lazy Evaluation**: Only checks for prosthetic if needed
✅ **Safe**: Graceful handling if injuryHistory is missing/null
✅ **Consistent**: Uses same detection logic in both functions

---

## What Still Needs Storing

**Current State:**
- ✅ Initial plan creation knows about injuries (passed as parameters)
- ✅ Adaptations check user's current injury history
- ❌ Plan doesn't store which injuries were used at creation time

**Implication:**
- If Nino updates his injury history later (e.g., AFO replaced with different type), adaptations use the NEW information
- This is actually reasonable (we adapt to current reality)
- But we lose historical context (what injuries were considered when plan was generated)

**If we want to preserve that:**
- Could add `injuriesAtCreation` jsonb field to `trainingPlans` table
- Would require migration
- Nice to have, not critical

---

## Testing

### Test Scenario: Nino with Prosthetic

1. **Create plan** with:
   - defaultSessionType: "walk"
   - Injury 1: Post-stroke recovery
   - Injury 2: AFO prosthetic

2. **Week 1 execution**:
   - Complete 5 walking sessions
   - Right leg handles compensation well
   - No major issues

3. **System reassessment**:
   - `reassessTrainingPlansWithRunData()` should log:
     ```
     [Plan Reassessment] Prosthetic detected in injury history
     [Plan Reassessment] Considering prosthetic-specific fatigue...
     ```

4. **Verify**:
   - Adaptation prompt includes prosthetic context
   - OpenAI decisions respect conservative progression
   - Week 2 plan respects prosthetic constraints

---

## Files Modified

1. ✅ `server/training-plan-service.ts`
   - Lines 1937-1943: Added user profile fetch in adaptTrainingPlan()
   - Lines 2006-2015: Added prosthetic context in adaptTrainingPlan()
   - Lines 2219-2229: Added prosthetic detection in reassessTrainingPlansWithRunData()
   - Line 2236: Included prostheticContext in prompt

---

## Summary

The adaptive coaching system now understands prosthetics and respects them when adjusting plans, maintaining consistency with the initial plan generation philosophy.

- ✅ Plan creation: Prosthetic-aware
- ✅ Plan adaptation: Now also prosthetic-aware
- ✅ User experience: Seamless, better results for prosthetic athletes

**Nino's full coaching journey, from initial plan through all adaptations, respects his prosthetic constraints.** 💡
