# Pace Context Directive — Signal Hierarchy Implementation

## What Changed

Replaced **hardcoded population-average pace thresholds** with a **personalized signal hierarchy** that respects each runner's actual fitness level and coach personality by workout type.

### Before (❌ Wrong)
```typescript
if (recentPaceSecPerKm <= 360)   // ≤6:00/km
  paceCategory = 'fast';         // → "You're elite/competitive"
else if (recentPaceSecPerKm <= 600)  // ≤10:00/km
  paceCategory = 'easy';         // → "You're building fitness"
```

**Problem**: A 6:30/km runner gets labeled "elite" and told to "relax even more." Inaccurate, condescending, wrong.

### After (✅ Correct)
```typescript
// Signal 1: HR Zone (personalized by max HR)
if (heartRateZone <= 2) return "Easy aerobic zone";

// Signal 2: Target pace deviation
if (Math.abs(deviationFromTarget) <= 5%) return "On target";

// Signal 3: Personal benchmarks from profile
// Use the runner's actual paces, not population thresholds

// Signal 4: Workout type (not pace bucket)
if (workoutType === 'easy') return "Conversational, relaxed";
if (workoutType === 'tempo') return "Focused, purposeful";
```

---

## Signal Hierarchy (Priority Order)

### 1. **Heart Rate Zone** (Always Authoritative)
- Personalized by the runner's max HR
- Zone 2 IS easy effort for that specific person
- **Never override with pace assumptions**

Example: "You are in an easy aerobic zone. This is exactly where easy runs should be."

### 2. **Target Pace Deviation** (When Session Has a Target)
- Classify effort relative to the TARGET, not population averages
- ±5% of target = on-target
- >5% slower = acceptable (tough conditions, fatigue)
- >5% faster = flag over-effort for that workout type

Example: "Running 8% faster than target. Check if intentional (feeling strong) or accidental (went out too fast)."

### 3. **Personal Pace Benchmarks** (From Runner Profile)
- Extract actual running data from the profile (easy pace, tempo pace, threshold)
- Use THAT runner's paces as reference, not population averages
- Only applies when profile contains pace data

Example: "Runner's easy pace is 6:00-7:00/km. Current pace matches their easy pattern — reinforce it."

### 4. **Workout Type Tone** (Even Without Pace Data)
- Personality comes from the SESSION, not from absolute speed

| Type | Tone |
|------|------|
| `easy` | Conversational, relaxed. Never suggest faster. Reinforce correctness. |
| `recovery` | Patient, restorative. Catch over-effort early. |
| `tempo` | Focused, purposeful. Coach to sustain — don't push beyond. |
| `interval` | Sharp, brief. High effort expected. Don't flag HR unless alarming. |
| `long_run` | Patient, steady. Flag early drift above easy. Encourage resilience. |
| `free_run` | Observe and reflect. Never imply pace is wrong. |

### 5. **No Data → Silence**
- Better to say nothing than make a wrong assumption
- Returns empty string when none of the above signals apply

---

## What Removed

✂️ **All hardcoded pace thresholds** (e.g., "6:00/km = elite", "10:00/km = slow")  
✂️ **Patronizing language** ("never suggest they're slow", "build confidence in their pace")  
✂️ **Generic runner labels** ("competitive/elite", "developing", "base-building")  
✂️ **Pace category buckets** (fast/moderate/easy/very_easy)  

Reduces function from **~145 lines to ~46 lines** while becoming MORE accurate.

---

## How It Works in Practice

### Example 1: 6:30/km Runner on Recovery

**Signal 1 (HR Zone)**:
- HR Zone = 2 (easy)
- → "You are in an easy aerobic zone. This is where easy runs should be."
- ✅ No patronizing labels, no "you're elite" nonsense

**Signal 2 (Target)**:
- No target for recovery run
- → Continue to Signal 3

**Signal 3 (Profile)**:
- Runner profile says: "Easy pace 6:00-7:00/km"
- Current: 6:30/km
- → "Compare current pace to historical data. Runner's easy pace is 6:00-7:00/km. Current pace aligns with pattern."
- ✅ Uses THEIR data, not population benchmarks

**Signal 4 (Type)**:
- Workout = 'recovery'
- → "Recovery session. Patient, restorative tone. Any sign of over-effort should be caught early."

---

### Example 2: 10:00/km Runner on Tempo

**Signal 1 (HR Zone)**:
- HR Zone = 4 (high intensity)
- → "You are in a high-intensity zone. Effort is expected."

**Signal 2 (Target)**:
- Target tempo pace: 9:00/km
- Current: 8:45/km
- → "Running 2.7% faster than target. Check if intentional (feeling strong) or accidental."
- ✅ Coaches relative to THEIR target, not "fast runners should run 6:00/km"

**Signal 4 (Type)**:
- Workout = 'tempo'
- → "Tempo session. Focused, purposeful tone. Coach to sustain effort."

---

### Example 3: New User (No Profile, No Signals)

**All Signals**:
- No HR zone data
- No target pace
- No profile yet
- Workout type = 'free run'
- → "Coach based on effort feel, heart rate, and session demands — not pace magnitude."

✅ Admits uncertainty, doesn't impose false categorization

---

## What iOS Sends (Already in Place)

No changes needed. iOS already sends:

| Field | Format | Used By |
|---|---|---|
| `currentPace` | "M:SS" per km | Convert to seconds/km for deviations |
| `userFitnessLevel` | "beginner"/"intermediate"/etc | Coaching vocabulary level |
| `workoutType` | "easy"/"tempo"/etc | Tone directive |
| `targetHeartRateZone` | 1–5 | Signal 1 (authoritative) |
| `hrConfidence` | "high"/"medium"/"low" | Trust level for HR signal |
| `currentHeartRate` | bpm | Calculate zone or detect over-effort |

---

## Code Changes

**File**: `server/ai-service.ts`

**Function**: `getPaceContextDirective()`

**Before**:
- 145 lines of hardcoded pace categorization
- 5 static directives (fast/moderate/easy/very_easy for run + walk variants)
- Population-average thresholds

**After**:
- 46 lines following signal hierarchy
- Conditional logic based on available data
- Personalizes to runner's actual data and workout type

---

## Benefits

1. **Accuracy** — Uses runner's actual paces, not population averages
2. **Respect** — No patronizing labels ("you're slow" or "you're elite")
3. **Simplicity** — 66% fewer lines, more maintainable
4. **Graceful Degradation** — Returns silence when uncertain, not false confidence
5. **Scope-Independent** — Works for all fitness levels without recalibration
6. **Personalization** — Respects the runner profile, the system's core design

---

## Verification

**Commit**: `234bfa4` — "Replace hardcoded pace thresholds with signal hierarchy"

The function is now called from:
- `generatePaceUpdate()` — pass heart rate, workout type, runner profile ✅
- `generateCadenceCoaching()` — receives from request ✅
- `generateHeartRateCoaching()` — receives HR zone, runner profile ✅

All three endpoints will benefit from the new signal hierarchy automatically.

