# Pace Context Directive - iOS Request Analysis

## Question
iOS agent asks: Does the backend need to implement `getPaceContextDirective()` on the iOS coaching endpoints?

**Answer: YES, partially.** Only **2 of 3** functions are missing it.

---

## Current Implementation Status

### ✅ 1. `/api/coaching/pace-update` — ALREADY HAS `getPaceContextDirective`

**File**: `server/ai-service.ts` line 934  
**Function**: `generatePaceUpdate()`

```typescript
${getPaceContextDirective(runHistory?.avgPaceSecondsPerKm || (params as any).recentPaceAvgSecPerKm, fitnessLevel, undefined, sessionType || 'run')}
```

**Status**: ✅ COMPLETE — Injects pace-aware personality into every pace update.

---

### ❌ 2. `/api/coaching/cadence-coaching` — MISSING `getPaceContextDirective`

**File**: `server/ai-service.ts` line 1999  
**Function**: `generateCadenceCoaching()`

**Current Problem**: 
- Generates cadence coaching WITHOUT pace context
- AI doesn't know if runner is slow/moderate/fast
- Can't tailor cadence feedback to fitness level
- Example: A 10:00/km runner getting told "increase cadence to 180 spm" (generic benchmark) instead of cadence-appropriate-for-their-fitness

**What's Missing**:
```typescript
// NOT PRESENT IN CURRENT CODE:
${getPaceContextDirective(paceSecPerKm, fitnessLevel, undefined, sessionType || 'run')}
```

**Impact**: 
- Cadence coaching may sound generic or insensitive to slower runners
- No confidence-building for base-building runners
- Could demotivate if AI implies "you should run like an elite runner"

**Fix Required**: Add `getPaceContextDirective()` call to the system prompt in `generateCadenceCoaching()`

---

### ❌ 3. `/api/coaching/heart-rate` — MISSING `getPaceContextDirective`

**File**: `server/ai-service.ts` line 3553  
**Function**: `generateHeartRateCoaching()`

**Current Problem**:
- Generates HR coaching WITHOUT understanding runner's pace/fitness category
- AI can't contextualize HR zone targets relative to runner's ability
- Example: A slow runner pushing into Zone 3 at 10:00/km pace is GOOD effort, but coaching doesn't know this context

**What's Missing**:
```typescript
// NOT PRESENT IN CURRENT CODE:
${getPaceContextDirective(/* current pace in sec/km */, fitnessLevel, undefined, sessionType || 'run')}
```

**Impact**:
- HR coaching might feel generic
- Can't explain WHY a given zone is appropriate for THEIR pace
- Missing opportunity to build confidence in slower runners' pace choices

**Fix Required**: Add `getPaceContextDirective()` call to the system prompt in `generateHeartRateCoaching()`

---

## What `getPaceContextDirective()` Does

It generates a **personality injection** that changes AI behavior based on runner speed:

### For **Slow/Base-Building Runners** (>10:00/km)
- **Directive**: `"NEVER imply they are slow"`
- **Example**: "This pace (10:30/km) IS appropriate for your current fitness level — never apologize for it"
- **Tone**: Build confidence, emphasize consistency over speed

### For **Moderate Runners** (8:00-10:00/km)
- **Directive**: Effort zones matter more than absolute pace
- **Example**: "Easy pace and moderate pace are only 30-60 seconds apart — focus on EFFORT FEEL and HR ZONE"
- **Tone**: Personalize, reference their specific targets

### For **Fast/Elite Runners** (<6:00/km)
- **Directive**: Warn against over-effort on recovery runs
- **Example**: "When you run SLOWER (7:00/km on easy), you're deliberately holding back — coach them to RELAX even more"
- **Tone**: Assume they're fit, coach efficiency

### For **Walkers** (various thresholds)
- Special handling for walking pace zones
- Acknowledges brisk walking as real aerobic work
- Celebrates consistency over speed

---

## Implementation Details

### Function Signature
```typescript
const getPaceContextDirective = (
  recentPaceSecPerKm: number | undefined,
  fitnessLevel?: string,
  sessionTargetPaceMin?: number,
  sessionType: string = 'run'    // 'run' or 'walk'
): string
```

### Parameters Needed for Each Function

#### `generateCadenceCoaching()` (line 1999)
Already receives:
- `currentPace: string` (format: "M:SS") — needs conversion to sec/km
- `userHeight`, `userAge` — can infer fitness level
- `coachTone` — to flavor the directive

**Data Available**: ✅ Can calculate everything needed

#### `generateHeartRateCoaching()` (line 3553)
Already receives:
- `fitnessLevel?: string` — can use directly
- Session parameters but NO direct pace data

**Data Available**: ⚠️ Has `fitnessLevel` but no pace context. May need to pass `currentPace` or `recentPace`

#### `generatePaceUpdate()` (line 930)
Already receives:
- `runHistory?.avgPaceSecondsPerKm` — perfect
- `fitnessLevel` — perfect
- `sessionType` — perfect

**Data Available**: ✅ Already using it correctly

---

## iOS Caller Requirements

iOS app must send these fields when calling:

### `/api/coaching/cadence-coaching`
```json
{
  "currentPace": "7:30",        // Already sending (required)
  "userFitnessLevel": "intermediate",  // Already sending
  "sessionType": "run"          // Probably sending
}
```

### `/api/coaching/heart-rate`
```json
{
  "currentHR": 165,
  "fitnessLevel": "intermediate",
  "runningPace": "7:30" OR "recentPaceAvgSecPerKm": 450  // MIGHT NOT BE SENDING
}
```

**iPhone Status**: iOS agent said "The iOS client already sends all the data needed (currentPace, userFitnessLevel)" — so data is available. ✅

---

## Implementation Checklist

- [ ] **`generateCadenceCoaching()`** — Add `getPaceContextDirective()` to system prompt
- [ ] **`generateHeartRateCoaching()`** — Add `getPaceContextDirective()` to system prompt (may need pace param added)
- [ ] **Test**: Verify cadence coaching respects slow runner's pace
- [ ] **Test**: Verify HR coaching contextualizes zones relative to runner's ability
- [ ] **Deployment**: These are non-breaking changes; can deploy anytime

---

## Code Change Summary

### Pattern (from working `generatePaceUpdate()` at line 934):

```typescript
// BEFORE (without pace context):
{ role: "system", content: `You are ${coachName}, ...${toneDirective(coachTone)}...` }

// AFTER (with pace context):
{ role: "system", content: `You are ${coachName}, ...
${getPaceContextDirective(recentPaceSecPerKm, fitnessLevel, undefined, sessionType || 'run')}
...${toneDirective(coachTone)}...` }
```

Same pattern for both functions.

---

## Why This Matters for iOS

When iOS calls `/api/coaching/cadence-coaching`, the AI currently receives:
- "Coach this person's cadence"
- The person's fitness level

But it DOESN'T know:
- "Is this a slow runner building base?" → Different messaging
- "Is this an elite runner?" → Different expectations
- "Are they on a recovery day at 9:00/km?" → Validate their choice

**Result**: Generic coaching that could accidentally demotivate or oversell effort.

With `getPaceContextDirective()`, coaching becomes **personalized and confidence-building** regardless of runner's speed. iOS users get the same quality as Android.

