# Android Changes Needed for Pace Context Directive

## Quick Answer

**For Cadence Coaching**: ❌ **NO changes needed** — Android already sends all required data

**For Heart Rate Coaching**: ⚠️ **MAYBE** — Depends on whether Android app sends `currentPace` or `recentPaceAvgSecPerKm`

**For Pace Update**: ✅ **ALREADY WORKING** — No changes needed

---

## Detailed Analysis

### 1. `/api/coaching/cadence-coaching` ✅ NO CHANGES NEEDED

**Route Handler** (line 11279):
```typescript
const message = await aiService.generateCadenceCoaching({ ...req.body, runnerProfile });
```

**What Android is Sending** (via `req.body`):
- `currentPace: string` (e.g., "7:30") — ✅ AVAILABLE
- `fitnessLevel?: string` — ✅ AVAILABLE
- `sessionType?: string` — ✅ AVAILABLE

**Function Signature** (line 1999):
```typescript
export async function generateCadenceCoaching(params: {
  currentPace: string;        // ✅ Receiving from Android
  coachAccent?: string;       // ✅ Receiving
  // ... other fields
}): Promise<string>
```

**Backend Enhancement Needed**:
Inside `generateCadenceCoaching()`, convert `currentPace` to seconds/km and call `getPaceContextDirective()`:

```typescript
// Inside generateCadenceCoaching() (line 2032-2035):
const paceSecPerKm = (() => {
  const parts = currentPace.split(':').map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : 360;
})();

// Then use it in the system prompt:
${getPaceContextDirective(paceSecPerKm, /* fitnessLevel from runnerProfile */, undefined, sessionType || 'run')}
```

**Android App Changes**: ✅ NONE — Keep sending what you're already sending

---

### 2. `/api/coaching/hr-coaching` ⚠️ MAYBE CHANGES NEEDED

**Route Handler** (lines 11598-11655):
```typescript
const response = await aiService.generateHeartRateCoaching({
  currentHR,
  avgHR,
  maxHR: maxHR || 190,
  targetZone,
  elapsedMinutes: elapsedMinutes || 0,
  coachName,
  coachTone: effectiveTone,
  coachAccent: user?.coachAccent || 'british',
  coachGender: user?.coachGender,
  wellness,
  runnerAge,
  fitnessLevel: req.body.fitnessLevel ?? (user as any)?.fitnessLevel ?? undefined,
  runnerName: req.body.runnerName ?? user?.name ?? undefined,
  runnerProfile: (await getRunnerProfile(req.user!.userId).catch(() => null))?.profile ?? null,
});
```

**Function Signature** (line 3553):
```typescript
export async function generateHeartRateCoaching(params: {
  currentHR: number;
  avgHR: number;
  maxHR: number;
  targetZone?: number;
  elapsedMinutes: number;
  coachName: string;
  coachTone: string;
  coachAccent?: string;
  coachGender?: string;
  wellness?: WellnessContext;
  runnerAge?: number;
  fitnessLevel?: string;        // ✅ Has this
  runnerName?: string;
  runnerProfile?: string | null;
  // ... NO currentPace or recentPaceAvgSecPerKm field
}): Promise<string>
```

**The Problem**: 
- `generateHeartRateCoaching()` has `fitnessLevel` ✅ (good)
- But it **doesn't have `currentPace` or `recentPaceAvgSecPerKm`** ❌ (needed for `getPaceContextDirective()`)

**Solution A: Android App Needs to Send Pace Data**

Modify the route handler to pass pace:
```typescript
const response = await aiService.generateHeartRateCoaching({
  // ... existing fields ...
  fitnessLevel: req.body.fitnessLevel ?? (user as any)?.fitnessLevel ?? undefined,
  // ADD THIS:
  currentPace: req.body.currentPace,  // e.g., "7:30/km"
  // OR:
  recentPaceAvgSecPerKm: req.body.recentPaceAvgSecPerKm, // e.g., 450 seconds/km
});
```

Then update the function signature:
```typescript
export async function generateHeartRateCoaching(params: {
  // ... existing ...
  fitnessLevel?: string;
  currentPace?: string;              // ADD THIS
  recentPaceAvgSecPerKm?: number;    // OR THIS
}): Promise<string>
```

Then use it in the system prompt:
```typescript
// Inside generateHeartRateCoaching():
const paceSecPerKm = params.recentPaceAvgSecPerKm || (() => {
  if (!params.currentPace) return undefined;
  const parts = params.currentPace.split(':').map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : undefined;
})();

// Then add to system prompt:
${paceSecPerKm ? getPaceContextDirective(paceSecPerKm, params.fitnessLevel, undefined, 'run') : ''}
```

**Android App Changes Needed**: 
- ✅ **Probably already sending** — check if `req.body.currentPace` or similar is available

---

### 3. `/api/coaching/pace-update` ✅ NO CHANGES NEEDED

**Route Handler** (line 11151):
```typescript
const message = await aiService.generatePaceUpdate({ ...req.body, runnerProfile });
```

**Function Already Using `getPaceContextDirective()`** (line 934):
```typescript
${getPaceContextDirective(runHistory?.avgPaceSecondsPerKm || (params as any).recentPaceAvgSecPerKm, fitnessLevel, undefined, sessionType || 'run')}
```

**Status**: ✅ COMPLETE — No changes needed

---

## Summary: What Android Needs to Do

| Endpoint | Current Status | Android Action Needed |
|----------|----------------|----------------------|
| `/api/coaching/cadence-coaching` | Has all needed data ✅ | **NONE** — Keep sending `currentPace` and `fitnessLevel` |
| `/api/coaching/hr-coaching` | Missing pace data ❌ | **Check if sending `currentPace`**; if not, add it |
| `/api/coaching/pace-update` | Already working ✅ | **NONE** |

---

## Checklist for Android Team

- [ ] **Cadence endpoint**: Verify Android is sending `currentPace` and `fitnessLevel` (almost certainly is)
- [ ] **Heart rate endpoint**: Check if Android is sending `currentPace` when calling HR coaching
  - [ ] If YES: No changes needed, backend can use it
  - [ ] If NO: Add `currentPace` to request payload

---

## Technical Details for Backend Implementation

Once Android data is confirmed available, backend changes are simple (one-line additions to three coaching functions):

### Pattern (from `generatePaceUpdate` at line 934):

```typescript
// Current AI service (without pace context):
const completion = await openai.chat.completions.create({
  messages: [
    { role: "system", content: `You are ${coachName}...${toneDirective(coachTone)}...` }
  ]
});

// Enhanced (with pace context):
const completion = await openai.chat.completions.create({
  messages: [
    { role: "system", content: `You are ${coachName}...
${getPaceContextDirective(recentPaceSecPerKm, fitnessLevel, undefined, sessionType || 'run')}
...${toneDirective(coachTone)}...` }
  ]
});
```

Apply same pattern to:
1. `generateCadenceCoaching()` line 2144-2152
2. `generateHeartRateCoaching()` line 3678-3686

