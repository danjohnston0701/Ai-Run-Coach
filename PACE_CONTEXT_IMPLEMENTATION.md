# Pace Context Implementation - Complete

## ✅ Changes Made

This implementation adds **pace-aware coaching** to the AI coaching system. The system now adapts coaching language and messaging based on the runner's actual pace and fitness level, ensuring coaching remains relevant across all speed ranges (5:00/km elite runners through 10:00+/km building fitness runners).

---

## Files Modified

### 1. **server/ai-service.ts**

#### Added: `getPaceContextDirective()` Function (Lines 233-298)
A new helper function that generates pace-context directives for the AI. Based on a runner's typical pace, it returns appropriate coaching philosophy:

```typescript
const getPaceContextDirective = (
  recentPaceSecPerKm: number | undefined,
  fitnessLevel?: string,
  sessionTargetPaceMin?: number
): string => { ... }
```

**Returns tailored directives for 4 pace categories:**
- **Fast** (≤6:00/km): Elite/competitive runners - focus on effort relative to their targets
- **Moderate** (≤8:00/km): Intermediate runners - emphasize effort feel and HR zone over pace magnitude
- **Easy** (≤10:00/km): Building fitness - validate their pace as their appropriate aerobic zone
- **Very Easy** (>10:00/km): Base builders - focus on consistency, effort management, and distance

#### Updated: `generateSessionCoaching()` System Prompt (Line 5035)
Injected the pace context directive into the system prompt:
```typescript
${getPaceContextDirective(runnerProfile.recentPaceAvgSecPerKm, runnerProfile.fitnessLevel, targetPaceMin)}
```

This tells the AI: *"This runner's typical pace is 8:30/km. When they run at their target pace, adjust your messaging accordingly."*

#### Updated: `generatePaceUpdate()` System Prompt (Line 761)
Added pace context to live split coaching:
```typescript
${getPaceContextDirective(runHistory?.avgPaceSecondsPerKm || (params as any).recentPaceAvgSecPerKm, fitnessLevel)}
```

This ensures every split update and pace check-in respects the runner's individual pace zone.

---

### 2. **server/session-coaching-service.ts**

#### Updated: `buildFallbackStructure()` Function (Line 414)
Made the fallback coaching messages pace-aware:
- Added `recentPaceSecPerKm?: number` parameter
- Detects if runner is slower (>8:00/km) and adjusts messaging accordingly
- **Before**: "GO! Push hard, stay tall, drive those arms" (aggressive athletic language)
- **After for slow runners**: "Rep starts. Find your effort zone. Steady controlled effort." (appropriate effort language)

Example adaptations:
```typescript
{ phase: "main_set", trigger: "rep_start", 
  message: isSlowerRunner 
    ? "Rep starts. Find your effort zone. Steady controlled effort." 
    : "GO! Push hard, stay tall, drive those arms." }
```

#### Updated: `generateAiSessionDesign()` Function Signature (Line 306)
Added pace parameter:
```typescript
async function generateAiSessionDesign(
  workout: SessionToneRequest, 
  aiRunnerProfile?: string | null, 
  recentPaceSecPerKm?: number  // ← NEW
): Promise<{...}>
```

#### Updated: `generateAiSessionDesign()` Fallback Calls (Lines 387, 393)
Now pass pace data to fallback structure generation:
```typescript
buildFallbackStructure(workout, recentPaceSecPerKm)
```

#### Updated: `generateSessionInstructions()` Function (Lines 275-295)
Added logic to fetch and pass pace context:
```typescript
// Fetch user's recent pace for pace-aware coaching
const user = await db.select()...
const recentPaceSecPerKm = (user as any)?.recentPaceAvgSecPerKm;

// Pass it to the design function
generateAiSessionDesign(workoutData, aiRunnerProfile, recentPaceSecPerKm)
```

---

## How It Works

### Flow for Session Coaching Generation

1. **User creates/prepares a workout** → `generateSessionInstructions()` is called
2. **Fetches user's recent pace** → Gets `recentPaceAvgSecPerKm` from database
3. **AI session design is called with pace data** → `generateAiSessionDesign(workoutData, aiRunnerProfile, recentPaceSecPerKm)`
4. **AI system prompt includes pace context** → `getPaceContextDirective()` generates coaching philosophy
5. **If AI call succeeds** → Uses AI-generated plan (which is pace-aware)
6. **If AI call fails** → Uses fallback structure (which is also now pace-aware based on `recentPaceSecPerKm`)
7. **Live coaching respects pace context** → `generatePaceUpdate()` system prompt also includes pace directive

### Key Insight: Pace-Relative vs. Absolute Coaching

**Old way (absolute):**
- Runner at 8:00/km gets told "pick up pace"
- Runner at 5:30/km gets told "hold this pace"
- Same coaching for different fitness levels

**New way (pace-relative):**
- Runner at 8:00/km gets told "maintain your steady effort"
- Runner at 5:30/km gets told "don't push beyond target"
- Coaching respects individual fitness level

---

## Examples of Improved Coaching

### Example 1: Interval Session

**Slow Runner (8:30/km typical)**
- Pre-run brief (AI-generated): "Today's 5km intervals focus on building your aerobic power. Work hard, but maintain a sustainable effort. This is how you develop speed."
- Fallback message: "Rep starts. Find your effort zone. Steady controlled effort."
- Split coaching: "Km 2 split at 8:45/km. You're right in your target zone — excellent effort."

**Fast Runner (5:30/km typical)**
- Pre-run brief (AI-generated): "Today's 5km intervals develop your VO2 max. These reps are harder than tempo pace — push intensity while keeping form tight."
- Fallback message: "GO! Push hard, stay tall, drive those arms."
- Split coaching: "Km 2 split at 5:42/km. You're behind your 5:30 target — tighten up and push harder."

### Example 2: Easy Run

**Slow Runner (8:30/km typical)**
- AI coaching: "This easy run is your aerobic sweet spot at 8:30/km. Consistency at THIS pace builds your fitness foundation. Enjoy the run."
- If they drop to 9:00/km: "Nice relaxation — you're just below your easy zone. Perfect for recovery."

**Fast Runner (5:30/km typical)**
- AI coaching: "Easy pace today should be 6:15-6:30/km. If you're running 5:30, you're not recovering properly. Back off."
- If they stay at 5:30: "You're running too hard on an easy day. This isn't recovery pace for you."

---

## Testing Checklist

- [ ] Slow runner (8:30/km) gets appropriate easy run coaching (not "push harder")
- [ ] Moderate runner (6:30/km) gets effort-focused coaching
- [ ] Fast runner (5:15/km) gets technical, competitive messaging
- [ ] Interval coaching adapts to runner's typical speed
- [ ] Fallback messages are pace-aware when AI fails
- [ ] Live split coaching respects runner's pace zone
- [ ] Pre-run briefs are personalized to fitness level
- [ ] Cadence coaching still references their individual optimal cadence

---

## Performance Impact

- **No database changes** — uses existing `recentPaceAvgSecPerKm` field
- **Minimal additional computation** — pace directive is just string formatting
- **Lower cost** — AI still generates one plan per session, no extra API calls
- **Fast fallback** — Pace-aware fallbacks generated locally (no AI needed)

---

## Future Enhancements

1. **Dynamic pace thresholds** — Allow users to customize what counts as "easy" for them
2. **Pace zone coaching** — Coach based on Z1-Z5 HR zones mapped to their actual pace
3. **Fitness trajectory** — Adjust coaching as runner improves over time
4. **Personalized terminology** — Some runners prefer "aerobic base" language, others prefer "Zone 2" language
5. **Walking support** — Extend to walking with different pace expectations

---

## Summary

**Before**: "Pick up the pace" (regardless of runner's fitness level)  
**After**: "Maintain your steady effort" (respects individual pace zone)

This implementation ensures **every runner sees coaching relevant to their speed and fitness level**, not abstract coaching designed for average 6:00/km runners.
