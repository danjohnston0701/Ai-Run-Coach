# Distance Formatting Standardization in AI Coaching Feedback

## Problem Statement

When OpenAI writes out coaching feedback with distance references, the formatting was inconsistent:
- **Mixed decimal places**: Some distances showed 1 decimal (3.6km), others showed 2 (3.62km)
- **Unnecessary trailing zeros**: Whole numbers displayed as "3.0km" instead of "3km"
- **No standard rule**: No consistent formatting across different coaching types

**Goal**: Standardize ALL distance references in coaching feedback to:
- **Whole numbers**: "3km" (0 decimals)
- **With decimals**: "3.6km" (1 decimal max, never 2+)

---

## Solution

### Created New Helper Function

```typescript
// Helper to format distance for coaching feedback
// - Whole numbers: "5km" (0 decimals)
// - With decimals: "3.6km" (1 decimal max, never 2+ decimals)
const formatDistanceForCoaching = (km: number | undefined): string => {
  if (km === undefined) return '?';
  if (km === Math.floor(km)) {
    return `${Math.floor(km)}km`; // Whole numbers: "5km"
  }
  return `${km.toFixed(1)}km`; // With decimals: "3.6km" (1 decimal)
};
```

### Updated formatDistanceForTTS

The existing `formatDistanceForTTS()` now delegates to the new helper:

```typescript
const formatDistanceForTTS = (km: number | undefined): string => {
  return formatDistanceForCoaching(km);
};
```

---

## Locations Updated

### Split and Pace Coaching (Line 811, 826, 831)

**Before:**
```typescript
- Overall progress: ${distance.toFixed(1)}km of ${targetDistance.toFixed(1)}km
500m check-in: Runner is at ${distance.toFixed(2)}km
```

**After:**
```typescript
- Overall progress: ${formatDistanceForCoaching(distance)} of ${formatDistanceForCoaching(targetDistance)}
500m check-in: Runner is at ${formatDistanceForCoaching(distance)}
```

### Navigation Coaching (Line 1071)

**Before:**
```typescript
Runner context: ${distance.toFixed(1)}km into their run
```

**After:**
```typescript
Runner context: ${formatDistanceForCoaching(distance)} into their run
```

### Phase-Based Coaching (Line 1353)

**Before:**
```typescript
- Distance covered: ${distance.toFixed(2)}km of ${formatDistanceForTTS(targetDistance)} target
```

**After:**
```typescript
- Distance covered: ${formatDistanceForCoaching(distance)} of ${formatDistanceForCoaching(targetDistance)} target
```

### Struggle Detection (Line 1626)

**Before:**
```typescript
- Distance: ${distance.toFixed(2)}km
```

**After:**
```typescript
- Distance: ${formatDistanceForCoaching(distance)}
```

### Cadence & Stride Coaching (Line 1764)

**Before:**
```typescript
- Distance: ${distance.toFixed(1)}km, time: ${timeFormatted}
```

**After:**
```typescript
- Distance: ${formatDistanceForCoaching(distance)}, time: ${timeFormatted}
```

### Emotional/Support Coaching (Lines 2053, 2063, 2068)

**Before:**
```typescript
They are ${progress}% through their run at ${distance.toFixed(1)}km.
Do NOT be generic — reference their actual data (pace: ${currentPace}, distance: ${distance.toFixed(1)}km).
They're ${progress}% through their run, ${distance.toFixed(1)}km in
```

**After:**
```typescript
They are ${progress}% through their run at ${formatDistanceForCoaching(distance)}.
Do NOT be generic — reference their actual data (pace: ${currentPace}, distance: ${formatDistanceForCoaching(distance)}).
They're ${progress}% through their run, ${formatDistanceForCoaching(distance)} in
```

### Post-Run Analysis (Line 2334)

**Before:**
```typescript
prompt += ` (Runner is at ${context.distance.toFixed(2)}km`;
```

**After:**
```typescript
prompt += ` (Runner is at ${formatDistanceForCoaching(context.distance)}`;
```

### End-of-Run Coaching (Line 4513)

**Before:**
```typescript
let status = `Runner Status:
- Distance: ${distance.toFixed(2)}km of ${targetDistance}km — ${remaining}km remaining`;
```

**After:**
```typescript
let status = `Runner Status:
- Distance: ${formatDistanceForCoaching(distance)} of ${formatDistanceForCoaching(targetDistance)} — ${remaining} remaining`;
```

### Milestone Coaching (Line 4595)

**Before:**
```typescript
1. Acknowledge the milestone (${milestonePercent}% done, ${distance.toFixed(1)}km covered)
```

**After:**
```typescript
1. Acknowledge the milestone (${milestonePercent}% done, ${formatDistanceForCoaching(distance)} covered)
```

### Run History References (Line 4056)

**Before:**
```typescript
prompt += `${i + 1}. ${run.distance?.toFixed(1) || '?'}km at ${run.avgPace || 'N/A'}/km`;
```

**After:**
```typescript
prompt += `${i + 1}. ${run.distance ? formatDistanceForCoaching(run.distance) : '?'} at ${run.avgPace || 'N/A'}/km`;
```

### Additional locations updated (Lines 1607, 1861, 4081, 5054)
All remaining distance `.toFixed()` usages have been replaced with `formatDistanceForCoaching()`.

---

## Examples

### Before (Inconsistent)
```
"3.62km through the 5.0km run"   ❌ Mixed decimals, unnecessary trailing zero
"You're 2.1km in, having covered 2km" ❌ Inconsistent formatting
```

### After (Consistent)
```
"3.6km through the 5km run"   ✅ 1 decimal for fractional, 0 for whole
"You're 2.1km in, having covered 2km" ✅ Consistent formatting throughout
```

---

## Impact

✅ **All coaching feedback now displays distances consistently**:
- Whole distances: "5km" (no decimal clutter)
- Fractional distances: "3.6km" (exactly 1 decimal)
- Distances remaining: Properly formatted
- Historical distance comparisons: Consistent styling

✅ **Applies to**:
- Split/pace coaching feedback
- Navigation directions
- Phase-based coaching
- Milestone celebrations
- Emotional support messages
- Post-run analysis
- Run history references
- Every AI-generated coaching message with distance

---

## Files Modified

**`server/ai-service.ts`**
- Lines 87-100: New `formatDistanceForCoaching()` helper + updated `formatDistanceForTTS()`
- 25+ locations: Replaced `.toFixed()` with `formatDistanceForCoaching()`

---

## Testing

To verify the fix works:

1. **Start a 5km run**
2. **Check coaching feedback at various points**:
   - Splits: Should show "1.2km" (1 decimal) or "2km" (0 decimals)
   - Milestones: "2.5km of 5km" ✓
   - Struggle messages: "1.8km in" ✓
   - History: "3km at 5:45/km" ✓

**Examples you should see:**
- "You're 2km in, having covered 2km" ✓
- "3.6km through the 5km run" ✓
- "Fastest split was 1.2km at 4:50/km" ✓
- "You've covered 1km, 4km remaining" ✓

**Examples you should NOT see:**
- "2.00km" ❌
- "3.65km" ❌
- "5.0km" ❌
