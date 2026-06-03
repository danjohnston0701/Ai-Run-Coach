# Pace Context Issue: Why Coaching Falls Short for Slow Runners

## The Real Problem

Your system **HAS the data** to be dynamic, but it's **not using it effectively** in coaching prompts. Here's what's happening:

### ✅ What IS Passed to AI
The `generateSessionCoaching()` function receives:
```typescript
runnerProfile: {
  age: number
  gender: string
  fitnessLevel: string  // "beginner" | "intermediate" | "advanced"
  recentPaceAvgSecPerKm: number  // ← ACTUAL USER PACE (e.g., 480 = 8:00/km)
  recentHRAvg: number
  weeklyMileageKm: number
  injuries: string[]
}

// Plus session targets:
targetPaceMin: number  // seconds/km (e.g., 480 = 8:00/km)
targetPaceMax: number  // seconds/km
targetHRMin: number
targetHRMax: number
```

This is **perfect data**. A user running 8:00/km should have a completely different coaching experience than someone running 5:30/km.

### ❌ How It's Currently Used

The prompts in `generateSessionCoaching()` (line 4841) **DO reference the user's actual pace**:

```typescript
// This IS included in the prompt:
`- Average Recent Pace: ${formatPaceForPrompt(runnerProfile.recentPaceAvgSecPerKm)}`
`- Target Pace Range: ${formatPaceForPrompt(targetPaceMin)} – ${formatPaceForPrompt(targetPaceMax)}`

// And recent runs:
`Run ${i + 1}: ${r.distanceKm.toFixed(1)}km in ${r.durationMinutes}min @ ${formatPaceForPrompt(r.avgPaceSecPerKm)}`
```

**BUT** — the system prompt (line 4891) doesn't give the AI any coaching principles that **adapt to different pace ranges**. 

The system says things like:
- *"Intervals/hills/speed: direct, energetic, motivating — emphasise rep quality and recovery discipline"*
- *"Trigger messages must be SHORT (under 20 words), direct, conversational"*

**But it never tells the AI**:
> "If a runner's typical pace is 9:00/km, they should NOT be told to 'push harder' on a 9:00/km target. If a runner is running 8:00/km, that IS hard for them — treat it that way."

---

## The Core Issues

### Issue 1: No Pace-Adaptive Coaching Principles
The AI gets the user's pace data but has no directive on how to coach people at different pace zones.

**Example Scenario**:
- **Slow runner** (8:00-9:00/km typical, intermediate fitness)
- Session: Easy run at 8:30/km
- **Current coaching**: Generic "keep it easy" (which IS appropriate)
- **Missing directive**: "This pace (8:30/km) IS the aerobic sweet spot for this runner. Treat it as their 'easy zone'. Do NOT mention 'picking up pace' or 'pushing' — that's not what easy means for them."

vs.

- **Fast runner** (5:30-6:00/km typical, advanced fitness)
- Session: Easy run at 6:00/km  
- **Current coaching**: Same generic "keep it easy"
- **Missing directive**: "This pace (6:00/km) is recovery pace. It should feel almost lazy — coach them to truly back OFF if they're naturally running faster."

### Issue 2: No Context Around Heart Rate vs. Pace Trade-offs
A slow runner at 8:00/km might hit Z4 HR (high effort), while a fast runner at 8:00/km would be Z1 (recovery).

The system has `targetHRMin` and `targetHRMax` but the AI coaching philosophy doesn't explain:
> "If their HR is in zone but pace is 'slow', PRAISE THE EFFORT not the pace. Pace is individual to their fitness level."

### Issue 3: Fallback Messages Are Generic & Pace-Agnostic

When AI coaching fails, fallback messages in `buildFallbackStructure()` (line 413) kick in:
```typescript
// For intervals:
{ phase: "main_set", trigger: "rep_start", message: "GO! Push hard, stay tall, drive those arms." }
{ phase: "main_set", trigger: "rep_end", message: "Rep done. Shake it out, breathe, recover fully." }

// For tempo:
{ phase: "tempo_block", trigger: "at_start", message: "Tempo effort. Find your rhythm, breathe steady, hold the pace." }
```

**These assume advanced running mechanics.** A walker or slow runner sees "push hard, drive those arms" and it feels irrelevant.

### Issue 4: Cadence Coaching Is Pace-Dependent But Not Contextualized

The `calculateOptimalCadence()` function (line 165) **properly personalizes cadence** based on:
- Actual pace (not assumed pace)
- Height
- Age

But in `generatePhaseCoaching()` (line 716), the cadence coaching context isn't tied to **why** their cadence matters. It should say:
> "Your optimal cadence at this pace (8:00/km) is 160-170 spm. Hitting this makes the effort feel sustainable."

NOT:
> "180 spm is optimal" (which is a runner assumption)

---

## What's Missing: Pace-Adaptive Coaching Directives

The system needs a **contextual coaching framework** injected into every prompt that adapts to the user's speed:

### Proposed Addition to System Prompts

```typescript
/**
 * Generate pace-context directives for the AI
 * Helps the AI understand how to coach differently based on runner speed
 */
function getPaceContextDirective(
  recentPaceSecPerKm: number,
  fitnessLevel: string,
  sessionTargetPaceMin?: number
): string {
  // Convert seconds/km to human-readable pace
  const paceMin = Math.floor(recentPaceSecPerKm / 60);
  const paceSec = Math.round(recentPaceSecPerKm % 60);
  const recentPaceStr = `${paceMin}:${paceSec.toString().padStart(2, '0')}`;

  // Categorize pace zone
  let paceCategory = 'moderate';
  let paceDescription = 'moderate pace';
  if (recentPaceSecPerKm <= 360) { // ≤ 6:00/km
    paceCategory = 'fast';
    paceDescription = 'competitive/fast pace';
  } else if (recentPaceSecPerKm <= 480) { // ≤ 8:00/km
    paceCategory = 'moderate';
    paceDescription = 'moderate/steady pace';
  } else if (recentPaceSecPerKm <= 600) { // ≤ 10:00/km
    paceCategory = 'easy';
    paceDescription = 'easy/conversational pace';
  } else {
    paceCategory = 'very_easy';
    paceDescription = 'very easy/walking-adjacent pace';
  }

  const directives = {
    fast: `This runner typically runs at ${recentPaceStr}/km (${paceDescription}). They are a faster runner with higher fitness. 
- Coaching should reference THEIR pace targets, not generic "competitive pace" benchmarks
- If they run a session at 6:30/km when their typical is 5:45/km, that IS effort for them — treat it seriously
- "Pushing hard" means hitting THEIR targets, not absolute fast pace
- Recovery pace for them is sub-6:00/km`,
    
    moderate: `This runner typically runs at ${recentPaceStr}/km (${paceDescription}). They run at moderate fitness level.
- Their easy pace and their moderate pace are within a narrow 30-60s/km window
- Coaching should focus on EFFORT FEEL and HR ZONE, not pace magnitude
- "Keeping it easy" at 7:30/km is their aerobic sweet spot — reinforce consistency, not speed
- If pace drops to 8:30/km, it might mean fatigue or conditions — coach around effort/HR, not pace`,
    
    easy: `This runner typically runs at ${recentPaceStr}/km (${paceDescription}). They are building fitness.
- This IS their normal easy pace — treat it as their "conversational pace" zone
- Coaching should never imply they're "slow" or need to "speed up" on easy runs
- Easy run = sustainable effort at THIS pace, not faster
- HR zone adherence is more important than hitting an absolute pace target
- Recovery runs at 9:30+/km are perfectly normal for them`,
    
    very_easy: `This runner typically runs at ${recentPaceStr}/km (${paceDescription}). They may be building base fitness or have a longer-distance focus.
- This pace IS appropriate for their current fitness level
- Sessions are about consistency, effort management, and distance — not speed
- Coaching should focus on relaxation, cadence, and steady effort
- "Easy" means sustainable — if they're hitting their HR zone at this pace, they're doing great`
  };

  return directives[paceCategory] || directives.moderate;
}
```

### Where This Should Be Injected

**In `generateSessionCoaching()` system prompt** (line 4891):
```typescript
const systemPrompt = `...existing system prompt...

PACE CONTEXT FOR THIS RUNNER:
${getPaceContextDirective(
  params.runnerProfile.recentPaceAvgSecPerKm,
  params.runnerProfile.fitnessLevel,
  params.targetPaceMin
)}

Your coaching tone and messaging must respect this runner's pace zone. A 8:00/km pace for someone running at that fitness level is NOT the same as an 8:00/km pace for an elite runner in recovery.`;
```

**In `generatePaceUpdate()` system prompt** (line 670):
```typescript
const systemPrompt = `...existing prompt...

RUNNER PACE CONTEXT: This runner's typical pace is ${formatPaceForTTS(params.runnerProfile?.recentPaceAvgSecPerKm)}/km.
${getPaceContextDirective(params.runnerProfile?.recentPaceAvgSecPerKm, params.fitnessLevel)}

Coach based on THEIR benchmark, not absolute pace numbers.`;
```

### Updated Fallback Messages

**In `buildFallbackStructure()`** (line 413):
```typescript
function buildFallbackStructure(
  workout: SessionToneRequest,
  recentPaceSecPerKm?: number  // ← NEW PARAMETER
): any {
  const paceContext = recentPaceSecPerKm 
    ? getPaceContextDirective(recentPaceSecPerKm, 'intermediate', workout.distance)
    : '';
  
  if (workout.workoutType === "intervals" || workout.workoutType === "hill_repeats") {
    const isSlowRunner = (recentPaceSecPerKm ?? 360) > 540; // > 9:00/km
    return {
      type: workout.workoutType,
      goal: workout.sessionGoal || "speed_development",
      phases: [
        { name: "warmup", durationKm: 1.0, description: "Easy warm-up jog" },
        { name: "main_set", durationKm: workout.distance ? workout.distance * 0.1 : 0.4, 
          description: `${workout.intervalCount || 6} hard repetitions` },
        { name: "cooldown", durationKm: 0.5, description: "Easy cool-down" },
      ],
      coachingTriggers: [
        { phase: "warmup", trigger: "at_end", 
          message: isSlowRunner 
            ? "Warmup done. Build into your intervals now — first rep in 200m."
            : "Warmup done. Get ready to push — first rep in 200m." },
        { phase: "main_set", trigger: "rep_start", 
          message: isSlowRunner
            ? "Rep starts. Find your effort zone. Steady, controlled effort."
            : "GO! Push hard, stay tall, drive those arms." },
        // ... etc
      ],
    };
  }
  // ... rest of structure
}
```

---

## Summary: The Fix

**The issue isn't missing data** — you have the user's actual pace. The issue is:

1. **AI prompts don't contextualize coaching around the runner's individual pace zone**
2. **No directive telling the AI how to coach slower vs. faster runners differently**
3. **Fallback messages assume athletic running mechanics (not applicable to all paces)**
4. **No "pace-relative" coaching philosophy** — all coaching is in absolute terms

### Implementation Priority: HIGH
- **Effort**: ~2-3 hours to add pace context directives
- **Impact**: Makes coaching relevant for the full spectrum of runner speeds (5:00-12:00/km)
- **Low Risk**: No database changes, no breaking changes to existing code

### Files to Update:
1. `server/ai-service.ts` — Add `getPaceContextDirective()` function
2. `server/ai-service.ts` — Inject pace context into `generateSessionCoaching()` system prompt
3. `server/ai-service.ts` — Inject pace context into `generatePaceUpdate()` system prompt
4. `server/session-coaching-service.ts` — Update `buildFallbackStructure()` to accept `recentPaceSecPerKm` parameter
5. `server/session-coaching-service.ts` — Update fallback trigger messages to be pace-aware

---

## Testing Scenarios

- [ ] Slow runner (8:30/km average) gets easy coaching message — NOT "push harder"
- [ ] Moderate runner (6:30/km average) gets effort-focused messaging
- [ ] Fast runner (5:15/km average) gets technical, competitive messaging
- [ ] Runner at 10:00/km gets validated for their effort level
- [ ] Cadence coaching mentions why THEIR cadence is optimal at THEIR pace
- [ ] Fallback messages adapt to runner's typical speed
