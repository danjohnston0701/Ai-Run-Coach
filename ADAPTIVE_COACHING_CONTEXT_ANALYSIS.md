# Adaptive Coaching Context Analysis

## Question 1: What Context Does Adaptive Coaching Have?

### What IS Included

#### adaptTrainingPlan() Receives:
```
✅ Goal Type
✅ Current Week / Total Weeks
✅ Experience Level
✅ Current Fitness (CTL)
✅ Training Status
✅ Completed Workouts Count
✅ Upcoming Workouts (with IDs, types, distances, intensities)
✅ Session Compliance Data (HR alerts, pace deviations, intervals)
✅ Prosthetic Context (if applicable)
```

**Code** (lines 2018-2026):
```typescript
TRAINING PLAN:
|- Goal: ${plan[0].goalType}
|- Current Week: ${plan[0].currentWeek}/${plan[0].totalWeeks}
|- Experience Level: ${plan[0].experienceLevel}
|- Current Fitness (CTL): ${fitness?.ctl || "N/A"}
|- Training Status: ${fitness?.status || "N/A"}
|- Completed workouts so far: ${completedWorkouts.length}
${complianceSection}
${upcomingSection}
```

#### reassessTrainingPlansWithRunData() Receives:
```
✅ Goal Type
✅ Current Week / Total Weeks
✅ Experience Level
✅ Days Per Week
✅ Target Distance
✅ Target Date
✅ Athlete Age (calculated from DOB)
✅ Fitness Level
✅ Current Fitness (CTL)
✅ Training Status
✅ Injury History (CURRENT)
✅ Recent Run Details (distance, duration, pace, HR, elevation)
✅ Session Coaching Data (HR zone alerts, pace deviations, interval completion)
✅ Plan Progress
✅ Prosthetic Context (if applicable)
```

**Code** (lines 2251-2264):
```typescript
TRAINING PLAN DETAILS:
|- Goal: ${plan.goalType}
|- Current Week: ${plan.currentWeek}/${plan.totalWeeks}
|- Experience Level: ${plan.experienceLevel}
|- Days Per Week: ${plan.daysPerWeek}
|- Target Distance: ${plan.targetDistance} km
|- Target Date: ${plan.targetDate || 'Flexible'}

RUNNER PROFILE:
|- Age: ${userProfile?.dob ? calculated : 'Unknown'}
|- Fitness Level: ${userProfile?.fitnessLevel || 'Not specified'}
|- Current CTL (Fitness): ${fitness?.ctl || 'N/A'}
|- Training Status: ${fitness?.status || 'N/A'}
|- Injury History: ${userProfile?.injuryHistory}
```

---

### What IS NOT Included

#### ❌ NOT in Adaptive Coaching Prompts:

1. **Default Session Type Preference** (`defaultSessionType`)
   - Initial plan knows user prefers "walk"
   - Adaptation doesn't know this
   - Impact: Might suggest running when user prefers walking

2. **Original Goal Description/Notes**
   - Initial plan got user's goal notes
   - Adaptation doesn't have them
   - Impact: Less context about user's specific intention

3. **Original Injuries Used at Plan Creation**
   - Only has CURRENT injuries (`userProfile.injuryHistory`)
   - Doesn't know which injuries existed when plan was created
   - Impact: Can't compare "original constraints vs. current constraints"

4. **Plan Generation Parameters**
   - No access to: `isPreEventPlan`, `isRollingPlan`, taper strategy
   - Impact: Can't understand original plan philosophy

5. **Completed Workout Details** (in reassessment)
   - Knows count but not details of what was completed
   - Impact: Can't analyze pattern of what types worked well

---

## Question 2: Do New Injuries Get Reflected in Adaptive Coaching?

### Short Answer: **YES, but with caveats**

### How It Works

```typescript
// In reassessTrainingPlansWithRunData() at line 2264:
${userProfile?.injuryHistory ? `- Injury History: ${JSON.stringify(userProfile.injuryHistory)}` : ''}
```

This fetches the **CURRENT** injury history from the user's profile:

```
SCENARIO: Nino's Injury Timeline

Week 1:
├─ Plan generated with:
│  └─ Injuries: [post-stroke, AFO]
└─ Adaptive coaching created for this context

Week 3 (During Plan):
├─ Nino experiences knee pain
├─ Adds NEW injury to profile:
│  └─ Injury: [post-stroke, AFO, knee pain - recovering]
└─ Next reassessment WILL see new knee injury

reassessTrainingPlansWithRunData() triggers:
├─ Fetches: userProfile.injuryHistory (NOW includes knee pain)
├─ Prompt receives: "Injury History: [..., {knee pain, recovering}, ...]"
├─ OpenAI assesses: "Athlete now has knee issue, adjust conservatively"
└─ Adaptation considers NEW injury
```

### What Gets Updated

✅ **Immediately Visible**:
- Reassessment knows about new injury
- Adaptation suggestions consider new injury
- Next week's plan adjusted for new constraint

❌ **Not Visible**:
- Plan was NOT generated with new injury in mind
- "Original context" is lost
- Can't compare "would this plan have included running if I knew about knee?"

### Practical Example: Nino

**Week 1 Original Plan**:
```
Generated with injuries:
├─ Post-stroke recovery
└─ Carbon fiber AFO

Plan: Walking-dominant, flat surfaces, careful progression
```

**Week 3 New Situation**:
```
Nino adds injury:
├─ Post-stroke recovery
├─ Carbon fiber AFO
└─ Right knee pain (developing)

Next reassessment sees:
"Athlete has 3 injuries now, including developing knee pain"

Adaptation response:
├─ "Knee pain is new, add rest days"
├─ "Reduce impact-heavy sessions"
└─ Plan adjusts for CURRENT reality
```

**But OpenAI is thinking**:
- "Plan was for 2 injuries, now there's 3"
- "Have to work backwards from what exists"
- "What was the original rationale?"

**vs. Ideally**:
- "Athlete has 3 injuries from start"
- "Design complete plan from scratch"
- "Full context available"

---

## Problems This Raises

### Problem 1: Lost Context
```
Initial Plan Generation:
  Injuries: [A, B]
  ↓
  OpenAI designs: Plan A+B

Week 3 (During Execution):
  User adds: Injury C
  ↓
  Reassessment sees: [A, B, C]
  ↓
  OpenAI thinks: "How do I adapt for C?"
  
  ❌ Missing: "What if I had generated with A+B+C from the start?"
```

### Problem 2: Injury History Not Stored at Plan Time
```
Database stores:
├─ trainingPlans table: goal, weeks, target, etc.
├─ plannedWorkouts table: sessions, distances, intensities
└─ ❌ NO field: "injuries_used_at_creation"

Result:
├─ Can't know what injuries original plan considered
├─ Adaptation only sees current injuries
└─ Can't properly validate "is this adapted plan coherent with original?"
```

### Problem 3: Adaptive Coaching Lacks Original Preferences
```
User Profile:
├─ defaultSessionType: "walk" ← Set once
└─ Never passed to adaptation

Initial Plan:
├─ Knows: "user prefers walking"
└─ Generates: Walking-dominant plan

Adaptation:
├─ Doesn't know: "user prefers walking"
└─ Might suggest: "Add some running for speed"
└─ ❌ Contradicts original plan philosophy
```

---

## Solutions (Not Yet Implemented)

### Solution 1: Store Injuries at Plan Creation
**Effort**: Medium (requires DB schema change)

Add to `trainingPlans` table:
```sql
ALTER TABLE training_plans ADD COLUMN injuries_at_creation JSONB;
```

When creating plan, store:
```typescript
safetyDisclaimer.injuriesAtCreation = [
  { bodyPart: "left leg", status: "recovering", isProstheticOrAFO: false },
  { bodyPart: "right leg", status: "chronic", isProstheticOrAFO: true, prostheticType: "Carbon fiber AFO" }
]
```

In adaptation, compare:
```typescript
const newInjuries = userProfile.injuryHistory.filter(i => 
  !plan.injuries_at_creation.some(orig => orig.bodyPart === i.bodyPart)
);

if (newInjuries.length > 0) {
  prompt += `\nNEW INJURIES SINCE PLAN CREATION: ${JSON.stringify(newInjuries)}`;
}
```

**Benefit**: Adaptation understands what's new vs. original

### Solution 2: Pass defaultSessionType to Adaptation
**Effort**: Minimal (one line change)

In adaptation prompts:
```typescript
const prompt = `...${plan.defaultSessionType ? `\nUser Preference: Prefers ${plan.defaultSessionType} sessions.` : ''}...`
```

**Benefit**: Adaptation respects user preference when suggesting changes

### Solution 3: Store Goal Context
**Effort**: Medium (store original notes)

Add to `trainingPlans`:
```sql
ALTER TABLE training_plans ADD COLUMN goal_notes TEXT;
```

Pass to adaptation:
```typescript
${plan.goal_notes ? `\nOriginal Goal Notes: "${plan.goal_notes}"` : ''}
```

**Benefit**: Adaptation knows original intention

---

## Impact for Nino

### Current (What Actually Happens)

**Plan Generation**:
```
✅ Knows: Walking preference, post-stroke + AFO
✅ Creates: Perfect plan for these constraints
```

**Week 1-3 Adaptation**:
```
✅ Knows: Current injuries (post-stroke + AFO)
✅ Adjusts: Appropriately for current state
```

**IF Nino adds injury Week 3**:
```
✅ Knows: New injury added
✅ Can adjust: For new constraint
❌ Doesn't know: "Would plan have been different with new injury from start?"
❌ Doesn't know: "Does new injury contradict original plan philosophy?"
```

### Ideal (With Solutions)

**Plan Generation**: (same as above)

**Week 1-3 Adaptation**: (same as above)

**If Nino adds injury Week 3**:
```
✅ Knows: New injury added
✅ Knows: Original injuries (stored at creation)
✅ Knows: Difference between original context and current
✅ Knows: User prefers walking (stored defaultSessionType)
✅ Can adapt: Cohesively, understanding full history
```

---

## Recommendation

### Minimum (Recommended)
✅ Store injuries at plan creation time (Solution 1)
- **Why**: Helps adaptation understand what's new
- **Effort**: Minimal DB change
- **Impact**: Better adaptive decisions

### Nice to Have
✅ Pass defaultSessionType to adaptation (Solution 2)
- **Why**: Respects user preferences in adaptations
- **Effort**: One line change
- **Impact**: Sessions stay aligned with user preference

✅ Store goal notes (Solution 3)
- **Why**: Adaptation understands original intent
- **Effort**: Moderate DB change
- **Impact**: Better contextual adaptations

---

## Current Status

### What Works Well
✅ Adaptive coaching has rich performance data
✅ Knows current fitness, plan progress, injury history
✅ Can make reasonable adjustments

### What Could Be Better
❌ Doesn't know original injuries vs. new injuries
❌ Doesn't know user's session type preference
❌ Doesn't know original goal context/notes
❌ Can't compare "would original plan be different?"

### For Nino Specifically
✅ Works well if no changes during plan
⚠️ Works okay if new injuries added (adapts, but lacks context)
❌ Doesn't respect his walking preference in adaptations

---

## Summary Table

| Context | Initial Plan | Adaptation | Store at Creation? |
|---------|---|---|---|
| Goal Type | ✅ | ✅ | N/A (already stored) |
| Injuries | ✅ | ✅ (current only) | ❌ No |
| Session Preference | ✅ | ❌ | ❌ No |
| Goal Notes | ✅ | ❌ | ❌ No |
| Performance Data | N/A | ✅ | N/A |
| Fitness Metrics | ✅ (baseline) | ✅ (current) | N/A |
| Prosthetic Info | ✅ | ✅ (current) | ❌ No |

---

## Conclusion

**Adaptive coaching has good context but is missing important original plan context.**

The main gaps are:
1. **Original injuries** (not distinguished from new ones)
2. **Session preferences** (not included in adaptation)
3. **Goal context** (not included in adaptation)

These would be valuable additions to make adaptations more coherent with the original plan philosophy.

For Nino, the biggest issue is #2 — his walking preference isn't reflected in adaptations, which might suggest running when that contradicts his original plan intent.
