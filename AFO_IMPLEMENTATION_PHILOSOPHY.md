# AFO Feature: Philosophy & Approach

## The Critical Correction

We initially over-constrained the AFO feature with hardcoded rules. This was a mistake. Here's why and how we fixed it.

---

## What We Did Wrong (Initial Version)

### ❌ Prescriptive Approach
We told OpenAI:
```
"PROGRESSION SEQUENCE — Follow this:
  • Phase 1 (weeks 1-2): Walking-only foundation
  • Phase 2 (weeks 3-4): Walk/jog intervals (2:1 ratio)
  • Phase 3 (weeks 5-6): Balanced walk/jog (1:1 ratio)
  • Phase 4 (weeks 7+): Easy jogging..."

"CADENCE & CONTROL — Prosthetic users benefit from lower, controlled cadence.
  • Encourage rhythm-based pacing"

"SESSION INSTRUCTIONS — EVERY session MUST include:
  • Terrain recommendation
  • Post-session checks
  • Monitoring cues
  [... etc ...]"
```

**Problem**: We designed the plan and told OpenAI to execute it. This:
- ❌ Ignores the athlete's age, fitness level, experience
- ❌ Locks in our assumptions (weeks 1-2 walking, weeks 3-4 walk/jog)
- ❌ Doesn't benefit from OpenAI's evolving knowledge
- ❌ Doesn't consider new research/best practices
- ❌ Treats all prosthetic athletes the same
- ❌ Removes coach flexibility based on context

---

## What We Changed (Revised Version)

### ✅ Contextual Approach
We now tell OpenAI:

```
"COACHING CONTEXT — Apply Your Expertise:

Prosthetic devices introduce unique considerations:

• TERRAIN IMPACT — Surface type affects prosthetic control 
  and energy expenditure. Apply your coaching knowledge to 
  determine appropriate terrain progression based on this 
  athlete's fitness level, confidence, and device type.

• ASYMMETRICAL LOADING — Non-prosthetic limb compensates 
  and may fatigue differently. Account for this in intensity 
  distribution and recovery planning.

• PROSTHETIC-SPECIFIC FATIGUE — Sessions that are aerobically 
  manageable may be neuromuscularly demanding. Consider this in 
  your progression logic.

• SESSION MONITORING — Include practical monitoring cues: fit/comfort, 
  skin integrity, contralateral limb response, proprioceptive control.

• CONSERVATIVE INITIAL PROGRESSION — Prosthetic users typically 
  benefit from slower initial progressions. Apply your expertise 
  to determine appropriate ramp-up for THIS athlete.

Your coaching expertise should determine:
— What session types and structures best serve this athlete
— How to progress intensity and duration appropriately
— When terrain can be more variable
— How to balance performance goals with prosthetic adaptation
— What monitoring cues are most relevant"
```

**Benefits**:
- ✅ Delegates to OpenAI's expertise, not our templates
- �� Adapts to athlete's age, fitness, experience
- ✅ Benefits from OpenAI's evolving knowledge
- ✅ Considers latest research/best practices
- ✅ Personalizes to each prosthetic athlete
- ✅ Gives OpenAI room to make coaching decisions

---

## The Philosophy

### OLD (Wrong)
```
Our Role:       Design the training plan
OpenAI's Role:  Execute our design
Result:         Template-based, inflexible, ignores context
```

### NEW (Correct)
```
Our Role:       Provide context, constraints, quality standards
OpenAI's Role:  Design the training plan using its expertise
Result:         Dynamic, contextual, adaptive, informed by AI knowledge
```

---

## What OpenAI Gets (New Approach)

### CONTEXT (Information)
- ✅ Athlete age, fitness level, experience
- ✅ Goal type and target
- ✅ Run history (if available)
- ✅ Active injuries and recovery stage
- ✅ **Prosthetic type** (carbon fiber AFO, full leg prosthetic, etc.)
- ✅ Prosthetic-specific considerations (asymmetrical loading, proprioceptive fatigue, terrain impact)
- ✅ Session type preference (walking)
- ✅ Schedule constraints

### PRINCIPLES (Guidance, Not Rules)
- ✅ Terrain affects prosthetic control; apply judgment for progression
- ✅ Non-prosthetic limb compensates; account for asymmetry
- ✅ Prosthetic fatigue differs from aerobic fatigue
- ✅ Include monitoring cues appropriate for THIS athlete
- ✅ Conservative initial progression is typical; apply your expertise
- ✅ Safety and confidence override early performance targets

### CONSTRAINTS (Structural Requirements)
- ✅ Generate exactly N weeks
- ✅ Exactly M sessions per week
- ✅ JSON format with specific fields
- ✅ Quality bar: certified coach would find it adequate
- ✅ No hardcoded distances/paces (use effort descriptors)

### FREEDOM (OpenAI's Expertise)
- ✅ Decide session types (walk, walk/run, jog, etc.)
- ✅ Decide progression timing (when to introduce jogging, when to increase intensity)
- ✅ Decide terrain progression (when flat → varied terrain is appropriate)
- ✅ Decide monitoring cues (what's most relevant for this athlete)
- ✅ Decide intensity distribution (how much easy vs. moderate)
- ✅ Decide recovery structure (when and how to include rest/recovery)

---

## Example: Two Different Athletes

### Athlete A: 45-year-old, recovering from stroke, carbon fiber AFO
```
What OpenAI Decides:
- Conservative progression? YES (new injury + device adaptation)
- Walking-dominant early? YES (age + recovery stage suggests this)
- When introduce jog intervals? Week 3-4 likely
- Terrain progression? Cautious, flat → slight varied later
- Session types? Mix of walk, walk/jog, maybe easy jog by week 6+
```

### Athlete B: 25-year-old, 2 years post-amputation, fitted prosthetic, experienced runner
```
What OpenAI Decides:
- Conservative progression? MODERATE (experienced runner, older injury)
- Walking-dominant early? MAYBE NOT (already confident, strong fitness base)
- When introduce jog intervals? Week 1-2 possibly
- Terrain progression? Faster progression to varied terrain
- Session types? More running-focused from start, walks for recovery
```

**Same prosthetic type, completely different plans — because OpenAI adapts to context!**

---

## What Didn't Change (Still Included)

### We STILL Provide:
✅ Injury/health context with status and recovery timeline
✅ Prosthetic device information (type, affected limb)
✅ Safety priority: prosthetic confidence over performance targets
✅ Request for monitoring cues in session instructions
✅ Quality bar: certified coach would find it adequate
✅ Structure: exact weeks, exact sessions, JSON format
✅ Effort descriptors instead of pace targets (for injuries)

### We NO LONGER Dictate:
❌ Specific progression phases (weeks 1-2 walking, weeks 3-4 walk/jog)
❌ Specific ratios (2:1 walk:jog)
❌ Specific session types ("walk/jog intervals preferred")
❌ Specific cadence rules ("lower, controlled cadence")
❌ Specific sequence progression
❌ What EVERY session MUST include (instead ask for relevant monitoring)

---

## How This Serves Nino Better

### Before (Prescriptive):
```
Nino (45, post-stroke, new AFO) gets:
- Weeks 1-2: Walk-only
- Weeks 3-4: 2:1 walk/jog
- Weeks 5-6: 1:1 walk/jog
- Weeks 7-8: Jog with walk breaks

✅ Safe, but might be too conservative OR not conservative enough
❌ Locked in regardless of his actual performance
❌ Doesn't adapt to his unique fitness level
```

### After (Contextual):
```
Nino (45, post-stroke, new AFO) gets:
- OpenAI analyzes: age 45, post-stroke recovery, new AFO, build endurance goal
- OpenAI decides: conservative initial progression appropriate
- Week 1-2: Walking foundation (same as before, but decided by AI not us)
- Week 3-4: OpenAI decides progression based on ALL context
  → Might do 2:1 walk/jog like before
  → OR might do 1.5:1 if AI thinks different
  → OR might do pure walking week 3 if cautious
- Weeks 5+: AI continues adapting
- IF Week 1 data shows he's strong: plan might adapt faster
- IF Week 1 data shows fatigue: plan stays conservative longer

✅ Safe AND personalized
✅ Adapts to actual performance
✅ Benefits from AI's analysis
✅ Respects prosthetic constraints while being flexible
```

---

## The Right Balance

```
┌────────────────────────────────────────────────────┐
│              COACHING SYSTEM BALANCE               │
├────────────────────────────────────────────────────┤
│                                                    │
│  WE PROVIDE (Our Expertise)                       │
│  ├─ Structural constraints (weeks, format)       │
│  ├─ Safety principles & priorities               │
│  ├─ Context information (athlete data)           │
│  └─ Quality standards (certified coach bar)      │
│                                                    │
│  OPENAI PROVIDES (AI Expertise)                  │
│  ├─ Training plan design                         │
│  ├─ Progression logic                            │
│  ├─ Session structure & type selection           │
│  ├─ Intensity distribution                       │
│  ├─ Recovery planning                            │
│  └─ Adaptation to athlete context                │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Principle: Information Not Prescription

### ❌ DON'T
```
"Use 2:1 walk/jog intervals"
"Include 4 specific session types"
"Follow this 4-phase progression"
"EVERY session MUST include X"
```

### ✅ DO
```
"Prosthetic users typically benefit from intensity modulation"
"Terrain significantly affects prosthetic control"
"Include monitoring cues relevant for this athlete"
"Consider conservative initial progression for this context"
"Your coaching expertise should determine when to progress terrain"
```

---

## For Future Features

Apply this same principle to any coaching feature:

**OLD (Bad)**:
```
"Weight loss plans must include 3 easy runs + 1 long run + 1 cross-training per week"
```

**NEW (Good)**:
```
"Weight loss training typically requires frequent sessions and sustained aerobic effort. 
Apply your expertise to determine session frequency and types appropriate for this 
athlete's fitness level, schedule, and goals. Prioritize sustainability and consistency 
over peak intensity."
```

**OLD (Bad)**:
```
"Pre-race taper: reduce volume 30%, maintain intensity 80%, week pattern is: easy, easy, tempo, easy, easy, easy, easy"
```

**NEW (Good)**:
```
"This athlete is in a pre-race sharpening block. Apply your coaching expertise to design 
an appropriate taper: reduce fatigue while maintaining race-specific fitness. Taper structure 
should vary based on distance, athlete experience, and target race date."
```

---

## Summary

**What Changed**: Removed hardcoded AFO progression rules. Now provide context and principles.

**Why**: OpenAI is the expert at training plan design. We provide information and constraints. It decides the plan.

**Result**: 
- ✅ Dynamic, contextual plans
- ✅ Adapts to each athlete
- ✅ Benefits from AI's evolving knowledge
- ✅ Still safe and structured
- ✅ Professional-grade coaching

**For Nino**: He still gets a prosthetic-aware plan, but one that OpenAI designs specifically for his age, fitness, recovery stage—not one we designed and he's forced to follow.

---

## Code Changed

**File**: `server/training-plan-service.ts` (lines 908-953)

**Before**: 47 lines of prescriptive rules (phases, ratios, specific requirements)

**After**: 20 lines of contextual information and principles

**Result**: Cleaner, more flexible, better leverages AI expertise.

---

**Key Takeaway**: We shifted from "template-based with prosthetic constraints" to "prosthetic-aware context that enables expert planning."

This is the right approach for an AI coaching system. 💡
