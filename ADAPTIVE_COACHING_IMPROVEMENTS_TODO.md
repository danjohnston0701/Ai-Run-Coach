# Adaptive Coaching Improvements — TODO

## Overview

The adaptive coaching system works well but is missing some original plan context that would make adaptations more coherent and personalized.

---

## Current Gaps

| Gap | Impact | For Nino | Priority |
|-----|--------|----------|----------|
| No original injuries stored | Can't distinguish new vs. original | Medium | Medium |
| defaultSessionType not passed | Adaptation might suggest running | **High** | **High** |
| Goal notes not passed | Loses context about user intent | Low | Low |
| Plan philosophy not passed | Can't maintain original approach | Medium | Medium |

---

## Priority 1 (Should Do): Pass defaultSessionType

### The Problem
```
Initial Plan:
├─ Knows: user.defaultSessionType = "walk"
├─ Generates: Walking-dominant plan
└─ Includes: "bias toward walking-based progressions"

Week 3 Adaptation:
├─ Doesn't know: user prefers walking
├─ Might suggest: "Add some running for intensity"
└─ ❌ Contradicts original plan
```

### The Fix
**Effort**: Minimal (2 lines of code)

**In adaptTrainingPlan() and reassessTrainingPlansWithRunData():**

Add after line 2256 (in reassessTrainingPlansWithRunData):
```typescript
${userProfile?.defaultSessionType ? `- Session Type Preference: ${userProfile.defaultSessionType}` : ''}
```

Add to prompt (line 2249):
```typescript
const prompt = `...
${userProfile?.defaultSessionType ? `\n⚠️ ATHLETE PREFERENCE: This athlete prefers ${userProfile.defaultSessionType} sessions. Maintain this preference in adaptations.` : ''}
...`
```

Do the same in adaptTrainingPlan() prompt (line 2013).

### Impact
- ✅ Adaptation respects user preference
- ✅ Nino's plan stays walking-focused even through adaptations
- ✅ Maintains coherence with original plan

### Estimate
- 15 minutes

---

## Priority 2 (Nice to Have): Store Injuries at Plan Creation

### The Problem
```
Initial Plan Creation:
├─ Injuries used: [post-stroke, AFO]
├─ Plan generated
└─ ❌ These injuries not saved anywhere except in safety disclaimer

Week 3 During Plan:
├─ Nino adds: Right knee pain
├─ Reassessment sees: [post-stroke, AFO, knee pain]
├─ Adaptation thinks: "Must adapt for all 3"
└─ ❌ Doesn't know which are new

Better:
├─ Adaptation knows: "Knee pain is NEW"
└─ ✅ Can prioritize: "Focus adjustments on new constraint"
```

### The Fix
**Effort**: Medium (DB schema + code changes)

**Step 1: Database Migration**
```sql
ALTER TABLE training_plans 
ADD COLUMN injuries_at_creation JSONB;
```

**Step 2: When Creating Plan**

In `generateTrainingPlan()`, after saving plan:
```typescript
await db
  .update(trainingPlans)
  .set({ 
    injuriesAtCreation: injuries  // Store the injuries array used at creation
  })
  .where(eq(trainingPlans.id, planId));
```

**Step 3: In Adaptation**

In `reassessTrainingPlansWithRunData()` and `adaptTrainingPlan()`:
```typescript
// Get original injuries
const planInjuries = JSON.parse(plan.injuriesAtCreation || '[]');
const currentInjuries = userProfile?.injuryHistory || [];

// Find new injuries
const newInjuries = currentInjuries.filter(current =>
  !planInjuries.some(original => 
    original.bodyPart === current.bodyPart && 
    original.isProstheticOrAFO === current.isProstheticOrAFO
  )
);

// Add context to prompt
const newInjuryContext = newInjuries.length > 0 ? `
⚠️ NEW INJURIES SINCE PLAN CREATION:
${newInjuries.map(i => `- ${i.bodyPart}${i.isProstheticOrAFO ? ` (${i.prostheticType})` : ''}`).join('\n')}
When adapting, prioritize managing these new constraints.` : '';

const prompt = `...${newInjuryContext}...`;
```

### Impact
- ✅ Adaptation understands new vs. original constraints
- ✅ Can prioritize addressing new issues
- ✅ Better decision-making context
- ✅ For Nino: If he gets injured mid-plan, adaptation knows it's new

### Estimate
- 1-2 hours (including testing)

---

## Priority 3 (Optional): Store Goal Context

### The Problem
```
Initial Plan:
├─ User writes notes: "Preparing for a destination race in Italy, want to enjoy the experience"
├─ Plan generated with this context
└─ ❌ Notes not stored anywhere

Week 3 Adaptation:
├─ Might suggest: "Increase tempo work for race pace"
├─ But user's context was: "Enjoy the experience, not push hard"
└─ ❌ Misses intent
```

### The Fix
**Effort**: Low (code) + Medium (schema)

**Step 1: DB Migration**
```sql
ALTER TABLE training_plans 
ADD COLUMN goal_notes TEXT,
ADD COLUMN goal_description TEXT;
```

**Step 2: When Creating Plan**

In `generateTrainingPlan()`:
```typescript
// These might come from a goal object or user input
const goalInfo = await getGoalDescription(goalId); // or from params

await db
  .update(trainingPlans)
  .set({ 
    goalNotes: goalInfo?.notes,
    goalDescription: goalInfo?.description
  })
  .where(eq(trainingPlans.id, planId));
```

**Step 3: In Adaptation**

Include in prompts:
```typescript
${plan.goalNotes ? `\nAthletes's Goal Context: "${plan.goalNotes}"` : ''}
```

### Impact
- ✅ Adaptation understands user's original intent
- ✅ Better nuance in adjustment suggestions
- ⚠️ Minor impact (mostly context, not decision-changing)

### Estimate
- 1 hour

---

## Recommended Order

### Phase 1 (Now) ��� Quick Win
- ✅ Implement: **Pass defaultSessionType** (Priority 1)
  - Effort: 15 minutes
  - Impact: High (especially for Nino)
  - Risk: Low
  
### Phase 2 (Next Sprint) — Better Context
- ✅ Implement: **Store injuries at creation** (Priority 2)
  - Effort: 1-2 hours
  - Impact: Medium-High
  - Risk: Low
  
### Phase 3 (Future) — Nice to Have
- ✅ Consider: **Goal context storage** (Priority 3)
  - Effort: 1 hour
  - Impact: Low-Medium
  - Risk: None

---

## For Nino Specifically

### Today (Without Changes)
```
✅ Gets walking-first plan
✅ Gets adaptive adjustments
❌ But adaptations might suggest running (lost preference)
❌ If he gets injured, adaptation doesn't know it's new
```

### After Priority 1 (defaultSessionType)
```
✅ Gets walking-first plan
✅ Gets adaptive adjustments
✅ Adaptations respect walking preference
❌ If he gets injured, adaptation doesn't know it's new
```

### After Priority 2 (Injuries at creation)
```
✅ Gets walking-first plan
✅ Gets adaptive adjustments
✅ Adaptations respect walking preference
✅ If he gets injured, adaptation knows it's new and prioritizes it
```

---

## Code Changes Summary

### Priority 1 Changes

**File**: `server/training-plan-service.ts`

**In adaptTrainingPlan()** (after line 2256):
```typescript
${userProfile?.[0]?.defaultSessionType ? `- Session Type Preference: ${userProfile[0].defaultSessionType}` : ''}
```

**In adaptTrainingPlan() prompt** (line 2013):
```typescript
const prompt = `...${userProfile?.[0]?.defaultSessionType ? `\nUser Preference: This athlete prefers ${userProfile[0].defaultSessionType} sessions. Maintain this preference in workout adjustments.` : ''}...`
```

**In reassessTrainingPlansWithRunData()** (after line 2257):
```typescript
${userProfile?.defaultSessionType ? `- Session Type Preference: ${userProfile.defaultSessionType}` : ''}
```

**In reassessTrainingPlansWithRunData() prompt** (line 2249):
```typescript
const prompt = `...${userProfile?.defaultSessionType ? `\nUser Preference: This athlete prefers ${userProfile.defaultSessionType} sessions. Consider this when evaluating adjustments.` : ''}...`
```

### Priority 2 Changes

**Schema** (migration file):
```sql
ALTER TABLE training_plans 
ADD COLUMN injuries_at_creation JSONB;
```

**In generateTrainingPlan()** (after plan saved):
```typescript
await db
  .update(trainingPlans)
  .set({ injuriesAtCreation: JSON.stringify(injuries) })
  .where(eq(trainingPlans.id, planId));
```

**In adaptation prompts** (after retrieving plan):
```typescript
const planInjuries = plan.injuriesAtCreation ? JSON.parse(plan.injuriesAtCreation) : [];
const currentInjuries = userProfile?.injuryHistory || [];
const newInjuries = currentInjuries.filter(current =>
  !planInjuries.some(orig => orig.bodyPart === current.bodyPart)
);

const newInjuryNote = newInjuries.length > 0 ? `\nNEW INJURIES: ${newInjuries.map(i => i.bodyPart).join(', ')} — prioritize these in adjustments.` : '';

const prompt = `...${newInjuryNote}...`;
```

---

## Questions to Consider

1. **Should we store MULTIPLE attributes at plan creation?**
   - Instead of individual fields, store full context
   - `original_plan_context: { injuries, defaultSessionType, goal_notes, ... }`
   - Easier to extend later

2. **Should adaptations WARN if new injuries are detected?**
   - "New injury detected. Consider regenerating plan from scratch?"
   - Or just adapt silently?

3. **Should we allow users to edit stored context?**
   - "What injuries were you dealing with at plan start?"
   - For manually correcting if data is wrong

---

## Testing Checklist (Priority 1)

- [ ] Create plan with `defaultSessionType = "walk"`
- [ ] Verify initial plan is walking-focused
- [ ] Complete Week 1
- [ ] Trigger reassessment
- [ ] Verify prompt includes session preference
- [ ] Trigger adaptation (if needed)
- [ ] Verify adaptation respects walking preference
- [ ] Check that new plans still suggested are walk-focused, not running-heavy

---

## Summary

| Priority | Task | Effort | Impact | Nino Benefit |
|----------|------|--------|--------|--------------|
| 1 | Pass defaultSessionType | 15 min | High | Walking preference maintained |
| 2 | Store injuries at creation | 1-2 hr | Medium | New injuries detected |
| 3 | Store goal context | 1 hr | Low | Better intent matching |

**Recommend implementing Priority 1 immediately.**

---

## Next Steps

1. Implement Priority 1 (defaultSessionType) this week
2. Test with Nino's plan
3. Plan Priority 2 (injuries storage) for next sprint
4. Consider Priority 3 (goal context) if time permits

This will ensure Nino's full coaching journey respects his preferences and constraints throughout all adaptations.
