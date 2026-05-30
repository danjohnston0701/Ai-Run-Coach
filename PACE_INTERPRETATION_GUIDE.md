# 🏃 Pace Interpretation Guide — Critical for All AI Features

## The Core Principle

**In running, PACE is TIME per KILOMETER (M:SS format).**

- **LOWER pace values = FASTER running** (better/quicker)
- **HIGHER pace values = SLOWER running** (worse/behind target)

### Example
- Target pace: `5:00/km` (5 minutes per km)
- Runner's current pace: `5:30/km` (5 minutes 30 seconds per km)
- **Interpretation**: Runner is **30 seconds SLOWER per km** = **BEHIND TARGET** = needs to **pick up the pace**

This is NOT like speed (km/h) where higher is better. It's the inverse.

---

## How Pace Comparison Works

### The Math

```javascript
const targetSec = (minutes * 60) + seconds;      // e.g., 5:30 → 330 seconds
const currentSec = (minutes * 60) + seconds;     // e.g., 5:00 → 300 seconds
const diffSec = currentSec - targetSec;          // 300 - 330 = -30
```

**Interpretation:**
- If `diffSec > 0` → current pace is SLOWER (higher time value) → BEHIND target
- If `diffSec < 0` → current pace is FASTER (lower time value) → AHEAD of target
- If `diffSec ≈ 0` → ON TARGET pace

---

## Examples (Annotated)

### Example 1: Behind Target (Needs to Speed Up)

| Field | Value |
|-------|-------|
| **Target pace** | `5:00/km` (300 seconds) |
| **Current pace** | `5:20/km` (320 seconds) |
| **Difference** | 320 - 300 = **+20 seconds** |
| **AI Verdict** | "You're 20 seconds per km slower than your target. You need to pick up the pace." |
| **Correct?** | ✅ YES — runner must speed up |

### Example 2: Ahead of Target (Can Ease Off)

| Field | Value |
|-------|-------|
| **Target pace** | `5:00/km` (300 seconds) |
| **Current pace** | `4:45/km` (285 seconds) |
| **Difference** | 285 - 300 = **-15 seconds** |
| **AI Verdict** | "You're 15 seconds per km faster than target. You're doing great—just ease off slightly to conserve energy." |
| **Correct?** | ✅ YES — runner is ahead, can sustain better pace management |

### Example 3: On Target

| Field | Value |
|-------|-------|
| **Target pace** | `5:00/km` (300 seconds) |
| **Current pace** | `5:02/km` (302 seconds) |
| **Difference** | 302 - 300 = **+2 seconds** |
| **AI Verdict** | "You're right on target pace. Excellent job—keep this rhythm going." |
| **Correct?** | ✅ YES — runner is nailing it |

---

## Where Pace Logic Is Used

### ✅ Correct Implementations

1. **`buildCoachingSystemPrompt()` (ai-service.ts, lines 2160–2210)**
   - Added explicit pace comparison with proper interpretation
   - Used when "Talk to Coach" is invoked
   - Provides AI with target pace context
   - **Key phrase**: "Lower pace values = faster running"

2. **`generatePaceUpdate()` (ai-service.ts, lines 448–630)**
   - Compares current split pace to target pace
   - Correctly identifies when `diffSec > 0` as BEHIND target
   - Used for real-time split updates

3. **`generatePhaseCoaching()` (ai-service.ts, lines 667–1180)**
   - Compares current phase pace to target pace
   - Line 794: `const diffSec = currentSec - targetSec;`
   - Line 795-802: Correct interpretation of positive/negative differences
   - **Example**: Line 796: "BEHIND TARGET: Runner is X seconds/km SLOWER"

4. **`generateSessionCoaching()` (ai-service.ts, lines 1180–1280)**
   - Uses percentage-based pace deviation
   - Line 2:
     - `paceDeviation > 0` → SLOWER (behind)
     - `paceDeviation < 0` → FASTER (ahead)

5. **Android `RunTrackingService.kt` (lines 1500–1592)**
   - Line 1500: `const paceDeviation = (currentAvgPaceSecondsPerKm - targetPaceSecondsPerKm) / targetPaceSecondsPerKm`
   - Positive deviation = slower = behind
   - Negative deviation = faster = ahead
   - Lines 1559–1562: Correct trigger mapping

---

## Red Flags ⚠️ (Anti-patterns to Avoid)

### ❌ WRONG: "Higher pace is better"
```javascript
// ANTI-PATTERN — DO NOT USE
if (currentPace > targetPace) {
  // "You're going faster" — WRONG interpretation when pace is M:SS
}
```
✗ This treats pace like speed (km/h), which is incorrect.

### ❌ WRONG: "Larger pace values = good performance"
```javascript
// ANTI-PATTERN
const verdict = currentPace > targetPace ? "You're ahead!" : "You're behind!";
```
✗ Inverses the logic. A runner with pace 5:30 is NOT "ahead of" a target of 5:00.

### ❌ WRONG: Forgetting to convert M:SS to seconds
```javascript
// ANTI-PATTERN — comparing strings directly
if (currentPace > targetPace) { // "5:30" > "5:00" alphabetically? Nonsense.
}
```
✗ String comparison doesn't work. Always convert to numeric seconds.

---

## Talk to Coach: Pace Queries

When a user asks during a run: **"How is my pace tracking?"**

The system should:

1. **Fetch target pace** from:
   - Current training plan (mainEffortPaceMin/Max average)
   - User's race goal pace
   - Context passed from the client

2. **Include in AI prompt**:
   - Current pace (from run data)
   - Target pace (from training plan/goal)
   - Explicit comparison with verdict

3. **Example Response**:
   ```
   "You're running 5:20 per km, and your target is 5:00. 
   That's 20 seconds per km slower, so you need to pick up the pace a bit. 
   You've got plenty of time left in this run—let's build from here."
   ```

---

## Code Locations to Update (If Adding New Features)

| File | Function | Line | Note |
|------|----------|------|------|
| `server/ai-service.ts` | `buildCoachingSystemPrompt()` | 2160–2210 | **Now includes pace context** |
| `server/ai-service.ts` | `generatePaceUpdate()` | 448–630 | ✅ Correct |
| `server/ai-service.ts` | `generatePhaseCoaching()` | 667–1180 | ✅ Correct |
| `server/ai-service.ts` | `generateSessionCoaching()` | 1180–1280 | ✅ Correct |
| `server/routes.ts` | `POST /api/coaching/talk-to-coach` | 8681–8748 | **Updated to infer target pace** |
| `server/ai-service.ts` | `CoachingContext` interface | 232–250 | **Added targetPace field** |
| `app/.../RunTrackingService.kt` | `checkPaceCoaching()` | 1500–1592 | ✅ Correct |

---

## Testing: Pace Interpretation

### Test Case 1: Talk to Coach — "How's my pace?"
```
Setup:
- Target pace: 5:00/km
- Current pace: 5:20/km
- Question: "How's my pace?"

Expected response:
"You're running 5:20 per km, which is 20 seconds slower than your target of 5:00. 
You need to pick up the pace a bit to hit your goal."

❌ WRONG response:
"You're running 5:20, which is ahead of your target of 5:00. Keep it up!"
(This is backward — 5:20 is SLOWER, not faster.)
```

### Test Case 2: Real-time Coaching — On Pace
```
Setup:
- Target pace: 5:00/km
- Current average: 4:58/km
- Elapsed: 3km

Expected response:
"You're running 4:58 per km—right on your target pace of 5:00. Excellent work!"

❌ WRONG response:
"Your pace is 4:58, which is lower than the target of 5:00, so you're too slow."
(4:58 < 5:00 in numeric terms, but 4:58/km is FASTER than 5:00/km.)
```

### Test Case 3: Session Coaching — Too Fast
```
Setup:
- Target pace range: 5:30–6:00/km (conversational, easy run)
- Current pace: 4:45/km
- Trigger: `pace_too_fast`

Expected response:
"You're pushing 4:45 per km, but this is an easy run at 5:30–6:00 pace. 
Ease back—you're going 45 seconds too fast per kilometer."

❌ WRONG response:
"Your pace of 4:45 is slower than the target range—you need to speed up."
(This misinterprets faster as slower.)
```

---

## AI Prompt Directives

When writing AI system prompts, always include:

```
PACE INTERPRETATION:
- Pace is TIME per km (minutes:seconds), not speed (km/h)
- Lower values = faster (better)
- Higher values = slower (worse)
- If current pace > target pace → runner is BEHIND and needs to SPEED UP
- If current pace < target pace → runner is AHEAD and should EASE OFF
```

**Example from `buildCoachingSystemPrompt()`:**
```typescript
// CRITICAL: Include pace context with proper interpretation
// ⚠️ PACE INTERPRETATION: In running, pace is TIME per km (minutes:seconds).
// LOWER pace values = FASTER running. HIGHER pace values = SLOWER running.
```

---

## Reference: Pace Values in Code

### Representation

- **String format**: `"5:30"` (minutes:seconds)
- **Numeric format**: `330` (total seconds)
- **Per-km indicator**: Always include `/km` in text output for clarity

### Conversion Functions

```typescript
// String → Seconds
const parts = "5:30".split(':').map(Number);
const seconds = parts[0] * 60 + parts[1]; // 330

// Seconds → String
const minutes = Math.floor(seconds / 60);  // 5
const secs = Math.round(seconds % 60);     // 30
const formatted = `${minutes}:${secs.toString().padStart(2, '0')}`; // "5:30"
```

---

## Summary

✅ **DO:**
- Always convert pace to seconds before comparing
- Remember: Lower time/km = faster = better
- Test with real examples (5:00 target, 5:20 current = behind)
- Include explicit pace context in AI prompts
- Use the `buildCoachingSystemPrompt()` pattern for new features

❌ **DON'T:**
- Compare pace strings directly
- Treat pace like speed (where higher = better)
- Forget the `/km` unit when displaying
- Assume clients always pass target pace (infer it!)

---

## Questions?

If you're adding new pace comparison logic or suspect an issue:
1. Check this guide first
2. Find a working example (e.g., `generatePhaseCoaching()`)
3. Copy the pattern
4. Test with edge cases
5. Update this guide if you find gaps
