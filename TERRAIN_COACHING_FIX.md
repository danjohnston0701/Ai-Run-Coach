# Terrain Coaching Fix: Downhill Physics

## The Problem

Paul's run data showed an **inconsistency in terrain-aware coaching**:

### ❌ **At KM 1 (Incorrect)**
> "I see you're descending now, which can slow you down a bit."

This is **backwards physics**. Descending/downhill naturally allows faster running due to gravity assistance. The message implies downhill is harder — it's not.

### ✅ **At KM 3 (Correct)**
> "especially cruising downhill at an eight percent grade"

This correctly acknowledges that downhill allows faster pace.

---

## Root Cause

The AI coaching system WAS providing the correct context to the LLM:
```
"pace naturally speeds up downhill"
```

However, the LLM was **sometimes ignoring this explicit instruction** and generating the counterintuitive message anyway. This happened because:

1. **Weak guardrails**: The context was stated as a simple note, not a critical rule
2. **No safety net**: There was no post-processing check to catch and correct backwards terrain logic
3. **Temperature/variance**: At temperature 0.7, the LLM can sometimes deviate from instructions

---

## The Fix

### 1. **Strengthened Gradient Context** (Lines 1294-1300)

**Before:**
```typescript
`Note: Runner is currently descending (${grade}% gradient) — pace naturally speeds up downhill.`
```

**After:**
```typescript
`TERRAIN: Runner is descending (${grade}% grade). Downhill SPEEDS UP pace naturally — this is biomechanically easier. DO NOT say descents "slow you down" or "make things harder". If pace is faster downhill, that's expected physics, not a red flag.`
```

### 2. **Added Critical System Message Rule** (Lines 1365-1367)

Added to the pace coaching system prompt:
```typescript
CRITICAL TERRAIN RULE: If the runner is descending (downhill gradient), their pace NATURALLY SPEEDS UP due to gravity. This is biomechanically correct and expected. DO NOT say descents "slow you down", "make things harder", or imply downhill is negative.
```

### 3. **Post-Processing Safety Check** (Lines 1381-1415)

Added a regex-based safety net that **catches and fixes** backwards descent messaging:

```typescript
if (typeof currentGrade === 'number' && currentGrade < -2) {
  // Regex patterns that catch backwards physics
  const backwardsPatterns = [
    /descend.*slow.*down/gi,
    /downhill.*slow.*down/gi,
    /going.*down.*harder/gi,
    /descent.*makes.*harder/gi
  ];
  // Replace with correct phrasing
}
```

**Example correction:**
- ❌ "descending slows you down" → ✅ "downhill naturally speeds you up"
- ❌ "downhill makes it harder" → ✅ "descent uses gravity to your advantage"

---

## How It Works Now

### Scenario: Runner is Descending (Negative Grade)

**Before Fix:**
1. LLM receives context: "pace naturally speeds up downhill"
2. LLM sometimes ignores it and generates: "descending slows you down"
3. ❌ **Wrong message delivered to runner**

**After Fix:**
1. LLM receives **explicit directive**: "DO NOT say descents slow you down"
2. System prompt includes **critical terrain rule**
3. Post-processing checks for backwards logic
4. If LLM does generate wrong message, it's caught and corrected
5. ✅ **Correct message delivered to runner**

---

## Testing

To verify the fix works:

1. **Generate a run with significant descent** (negative elevation grade > 2%)
2. **Trigger KM check-in coaching** during descent
3. **Verify the message:**
   - Does NOT contain: "slow", "harder", "difficult" in context of downhill
   - DOES contain positive or neutral language about gravity/effort reduction

---

## Files Modified

- **`server/ai-service.ts`**
  - Lines 1294-1300: Strengthened gradient context
  - Lines 1365-1367: Added critical system message rule
  - Lines 1381-1415: Added post-processing safety check

---

## Impact

✅ **Terrain coaching is now consistent**
✅ **Downhill sections get correct biomechanical guidance**
✅ **False "flags" on descent-faster-pace are eliminated**
✅ **Runner experience improved** — no more contradictory advice

---

## Related Coaching Rules

This fix aligns with the broader terrain awareness system:

- **Climbing (positive grade)**: "slower pace is NORMAL and EXPECTED"
- **Descending (negative grade)**: "pace SPEEDS UP naturally due to gravity"
- **Mixed terrain**: Elevation context informs pace fairness scoring

All terrain coaching now respects basic physics principles.
