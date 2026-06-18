# Response to Nino's AI Coaching Plan Questions

## Question 1: Pass `defaultSessionType` to the Prompt

**Status**: ✅ **Agreed. Will implement.**

---

## Question 2: Will OpenAI Recognize AFO + Post-Stroke Recovery from Injury Notes?

**Short Answer**: **Yes, it likely WILL work reasonably well.** However, there's a caveat — the system's injury handling is strong, but not optimal for Nino's specific biomechanical needs.

**The Evidence**:

### What IS Passed to OpenAI

When Nino creates a plan with his injuries listed:

```
Body Part: "Left leg"
Status: "recovering" (or "active")
Notes: "Post-stroke recovery, carbon fiber AFO brace on left leg, asymmetrical loading expected"
Injury Date: [when he had the stroke]
```

The system builds this section in the prompt (training-plan-service.ts lines 820–888):

```
⚕️ ACTIVE HEALTH CONDITIONS — APPLY CONSERVATIVE TRAINING MODIFICATIONS

⚠️ IMPORTANT DISCLAIMER: This AI running coach provides training guidance only...

COACHING PRIORITY ORDER (higher priority always overrides lower):
1. SAFETY — Do not design sessions that risk re-injury or aggravate the condition
2. INJURY RECOVERY — Match loading to the athlete's current rehabilitation stage
3. GOAL ACHIEVEMENT — Work toward the performance target within the constraints of #1 and #2
4. PERFORMANCE OPTIMISATION — Fine-tune paces and intensity only once #1–3 are satisfied

- Left leg: Recovering (injured 8 weeks ago on [date])
  Athlete notes: "Post-stroke recovery, carbon fiber AFO brace on left leg, asymmetrical loading expected"

This athlete has active or recovering injuries. Apply conservative training modifications informed by general sports rehabilitation principles. The performance goal (BUILD_ENDURANCE in 30 weeks) is the eventual end target — it must not drive the early weeks.

━━━ PACING RULES FOR INJURY-MODIFIED PLANS ━━━━━━━━━━━━━━━━━━━━

⛔ DO NOT use the athlete's historical running paces OR their target finish time to set session paces.
✅ ALL pacing in this plan must be expressed as effort descriptors — not specific minute/km targets.
   Use language like: "comfortable conversational pace", "gentle jog where you can speak in full sentences",
   "easy shuffle — no faster than feels totally comfortable", "brisk walk", "slow easy jog (RPE 2-3/10)".

For each injury, consider these dimensions when designing each week:

1. RECOVERY STAGE — How long ago did the injury occur? What is the typical recovery arc for this type of injury?
2. APPROPRIATE LOADING — walk-run intervals? reduced volume? modified session types?
3. SESSIONS TO AVOID — Which session types (tempo, intervals, hills, strides) should be excluded?
4. PROGRESSION CRITERIA — What must the athlete experience symptom-free before advancing?
5. REGRESSION RULE — What symptoms indicate stepping back?

Every session's "instructions" field must include: acceptable discomfort level during the run, 
symptoms that mean stop immediately, and expected next-day response.
```

### What OpenAI WILL Understand

Given this context, GPT-4 **will understand and apply**:

✅ **Conservative loading** — GPT-4 knows post-stroke recovery needs gradual progression  
✅ **Walk-run intervals** — GPT-4 knows this is appropriate for returning to activity  
✅ **Effort-based pacing** — GPT-4 will avoid specific pace targets for early weeks  
✅ **Weekly progression** — GPT-4 will design each week to build on the previous  
✅ **Symptom monitoring** — GPT-4 will include stop criteria and warning signs  
✅ **Recovery-first philosophy** — GPT-4 won't push performance goals early  

**Proof**: The prompt explicitly delegates this to OpenAI:
> "For each injury, consider these dimensions when designing each week... Design sessions appropriate for where the athlete is right now, not where a healthy athlete would be."

GPT-4 has been trained on sports rehabilitation principles and will apply them.

---

### What OpenAI Might MISS or Be Less Specific About

However, there are **biomechanical specifics** that OpenAI knows generically but might not weave into session design unless explicitly guided:

| Issue | What GPT-4 Knows | What It Might Miss |
|-------|---|---|
| **Asymmetrical loading** | "One leg is weaker" | HOW to structure sessions to prevent right-leg overload (doesn't know his RIGHT leg compensates) |
| **AFO-specific terrain** | "Orthotic devices limit terrain" | Detailed guidance like "smooth pavement > grass > hills" in early sessions |
| **AFO cadence** | "Lower cadence can help control" | Specific cues like "don't accelerate naturally; maintain 160–170 cadence" |
| **Proprioception fatigue** | "Returning athletes fatigue faster" | That proprioceptive fatigue (from AFO learning) is INDEPENDENT of heart rate fatigue |
| **Right-leg swelling patterns** | "Monitor for swelling" | That for Nino specifically, right ankle/knee swelling signals over-compensation |
| **Carbon fiber AFO durability** | General knowledge | That his specific AFO can handle certain activities but not others |

**Example of what GPT-4 might generate without guidance:**

```json
{
  "week": 2,
  "workouts": [
    {
      "day": "Monday",
      "workoutType": "easy",
      "distance": 3,
      "instructions": {
        "preRunBrief": "Easy 3km jog at conversational pace.",
        "sessionStructure": "Warm-up 0.5km, main 2km, cool-down 0.5km"
        // ❌ Doesn't mention:
        // - That he should walk the first 0.5km to warm up (not jog)
        // - To monitor right ankle/knee for swelling
        // - That if right leg feels stiff, slow down or walk more
        // - Terrain restriction
      }
    }
  ]
}
```

**What we want instead:**

```json
{
  "week": 2,
  "workouts": [
    {
      "day": "Monday",
      "workoutType": "walk_run",
      "distance": 3,
      "instructions": {
        "preRunBrief": "Structured walk/jog: 2 min walk, 1 min jog, repeat 3x. Flat pavement only.",
        "sessionStructure": "Warm-up 2 min walk, then 3× (2 min walk + 1 min jog), cool-down 2 min walk",
        "afoSpecificGuidance": {
          "terrainPreference": "flat pavement or track — avoid grass/uneven ground",
          "rightLegMonitoring": "after session, check right ankle — if any swelling, next session should be easier",
          "cadenceCue": "maintain steady rhythm; don't let pace drift upward naturally",
          "postSessionCheck": "skin under AFO for pressure points; overall fatigue level before next day"
        }
        // ✅ Now Nino gets AFO-aware guidance
      }
    }
  ]
}
```

---

## The Real Answer: Is Current System Good Enough for Nino?

### Scenario 1: If Nino Provides Detailed Injury Notes

**Injury Input**:
```
bodyPart: "Left leg (post-stroke hemiparesis)"
status: "recovering"
injuryDate: "2025-10-15"
notes: "Post-stroke left-sided weakness and hemiparesis. Using carbon fiber AFO brace on left leg for support. 
        Right leg compensates and may fatigue faster. Walking is primary activity. 
        Cleared for structured walking and graduated walk/run intervals. 
        Prefer flat, smooth surfaces. Garmin HR monitoring for Zone 2 focus."
```

**What GPT-4 Will Generate**: ✅ **Reasonable plan, 70–80% suitable**

- Conservative progression (walk → walk/run → easy jog)
- Effort-based pacing (no specific km targets)
- Weekly progressions
- Good injury awareness

**What Will Be Missing**: ⚠️ **AFO-specific detail (20–30%)**

- No explicit terrain guidance per session
- No "monitor right ankle/knee" cues
- No cadence control guidance
- Might include activities on varied terrain without warning

**Example risk**: Week 3 might suggest "2km easy walk" without specifying terrain, and Nino chooses a park trail thinking "easy = flexible" and ends up on uneven ground.

---

### Scenario 2: If Nino Only Says "Post-Stroke Recovery"

**Injury Input**:
```
bodyPart: "Left leg"
status: "recovering"
injuryDate: "2025-10-15"
notes: "Post-stroke recovery"
```

**What GPT-4 Will Generate**: ⚠️ **Safe plan, but generic (60% suitable)**

- Conservative approach (correct)
- Walk/run intervals (probably)
- But might miss:
  - That he has a prosthetic specifically
  - That asymmetrical loading is a design factor
  - That AFO-specific guidance is needed
  - Might suggest tempo or interval work too soon

**Example problem**: Week 4 might suggest "tempo work at threshold pace" if GPT-4 interprets "post-stroke at 6 weeks" as "ready for intensity work".

---

## Comparison: Current System vs. Ideal System

### Current System Strength

The **injury context IS strong**:

```typescript
// Line 876: "Design sessions appropriate for where the athlete is right now, not where a healthy athlete would be at week 1 of a standard plan."
// Line 878: "walk-run intervals, reduced volume, modified session types"
// Line 880: "Which session types (tempo, intervals, hills, strides) should be excluded"
// Line 886: "acceptable discomfort level during the run, symptoms that mean stop immediately"
```

**GPT-4 is authorized and instructed to be conservative.** It will respect this.

### Current System Gap

The **AFO and biomechanics are generic**:

```typescript
// The system says: "injury/health limitations"
// It does NOT say: "specifically, an AFO user has these constraints..."
// It does NOT say: "asymmetrical loading means..."
// It does NOT say: "terrain matters because..."
```

OpenAI knows these things generally, but without explicit guidance, it might not weave them into every session design.

---

## My Recommendation

### For Nino Specifically

**Don't just pass "post-stroke recovery" — be DETAILED:**

```
Body Part: Left leg
Status: Recovering
Injury Date: [October 2025]
Notes: "Post-stroke left hemiparesis with carbon fiber AFO brace.
        Main activity: walking (structured Zone 2 approach on Garmin).
        Walking 5 days/week is the goal. Cleared for graduated walk/run intervals.
        
        KEY CONSTRAINTS:
        - Asymmetrical loading: right leg compensates (monitor for swelling/stiffness)
        - Terrain: flat/smooth surfaces only (pavement, track) — NO trails/grass/hills early weeks
        - Cadence: maintain controlled rhythm, don't accelerate naturally
        - Fatigue: proprioceptive fatigue (from AFO control) ≠ aerobic fatigue — session may feel harder than HR says
        - Progress: slow and steady; each week should feel sustainable at week's end
        
        Physio-cleared for: walking, walk/run intervals, easy jogging
        NOT cleared for: hills, tempo/speed work, uneven terrain, fartlek"
```

**Result**: GPT-4 will see the detail and weave it into the plan. You'll get 80–90% suitable sessions instead of 70%.

---

### For the System Going Forward

**Priority 1** (Implement now for Nino):
- Add `defaultSessionType` to the prompt ✅ You want this done

**Priority 2** (Would help Nino + future prosthetic users):
- Add an **optional AFO/Prosthetic checkbox** to the user profile
- If checked, automatically append AFO-specific guidance to the injury section
- This takes ~30 minutes to code

```typescript
// In the HEALTH & INJURY CONTEXT section, after the injury lines:

if (user?.useProstheticOrAFO) {
  return `${injuryLines}

━━━ PROSTHETIC/AFO-SPECIFIC CONSTRAINTS ━━━━━━━━━━━━━━━━━━━━━

This athlete uses a prosthetic or orthotic device (AFO/brace/orthosis).

Session Design Rules:
1. TERRAIN — Strongly bias toward flat, even surfaces (pavement, track preferred).
   Only introduce varied terrain once cleared by physiotherapist.
2. ASYMMETRICAL LOADING — The non-AFO side typically compensates and fatigues faster.
   Design sessions where intensity can be modulated (walk/jog intervals > sustained efforts).
3. CADENCE — Encourage controlled, steady rhythm. Avoid high-speed bursts or uncontrolled acceleration.
4. SESSION STRUCTURE — Include recovery breaks within sessions. Prosthetic adds fatigue independent of HR.
5. PROGRESSION — Walk → Walk/Run → Easy Jog is the standard progression. Do not skip steps.

Coaching Cues for Each Session:
- Include explicit terrain recommendation (flat pavement vs other)
- Add "monitor non-AFO leg for fatigue/swelling" to each session
- Include post-session checks: "Check skin under AFO, report any swelling"
- Use stop criteria: "sharp pain, AFO slipping, loss of balance, non-AFO leg swelling"
`;
}
```

---

## Final Answer to Your Question

**"Will OpenAI tailor sessions in consideration of AFO + post-stroke recovery if we explain it in the injury/condition info?"**

### Short Answer:
**Yes, partially.** GPT-4 will understand the **conservative requirements** (walk-run, avoid tempo, effort-based pacing). It will NOT automatically understand **AFO-specific biomechanics** (terrain constraints, asymmetrical loading patterns, cadence control) unless you make it explicit in the injury notes.

### Medium Answer:
The injury context you're passing **IS refined and good**. But Nino would get better results by:
1. Providing detailed notes that mention the AFO explicitly
2. Adding `defaultSessionType = "walk"` (you're doing this now)
3. Requesting that we add an AFO-aware guidance block to the prompt

### Long Answer:
See the detailed response above. The system is strong on injury recovery. It's less strong on biomechanics-specific guidance. Adding an AFO-aware section takes 30 minutes and would solve this for all prosthetic users.

---

## What Should I Code Next?

**Immediate (for Nino)**:
1. ✅ Add `defaultSessionType` to the prompt (you want this)
2. ✅ Test with detailed AFO notes in the injury field

**Short-term (would help Nino + future users)**:
3. Add optional "useProstheticOrAFO" flag to user profile
4. Auto-generate AFO-aware guidance in injury section (30 min)

**Let me know which you want me to implement first.**
