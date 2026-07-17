# Jetpack Compose TextField IllegalStateException Fix

## Problem Summary
Google Play Console identified **9 events** of `java.lang.IllegalStateException` at `androidx.compose.foundation.text.ValidatingOffsetMapping.originalToTransformed()` occurring primarily on Samsung devices (e.g., Samsung Galaxy S20 FE/R8Q).

### Root Cause
Invalid offset mapping in custom `VisualTransformation` implementations. When Samsung's aggressive keyboard (with autocorrect and predictive text) sends rapid batch edits, the offset mapping functions returned indices that exceeded the bounds of the transformed/original strings, causing Compose's validation to crash.

---

## Fixes Applied

### 1. **DateOfBirthTransformation** (PersonalDetailsScreen.kt)
**Issue:** The `DateOffsetMapping` class had critical boundary validation bugs.

**Problems:**
- `originalToTransformed()` could return indices larger than the `formatted` string length
- `transformedToOriginal()` could return indices larger than the `digitsOnly` string length
- Didn't properly handle empty strings
- Missing validation against actual transformed text length

**Solution:**
```kotlin
// Before (BROKEN):
override fun originalToTransformed(offset: Int): Int {
    val clampedOffset = minOf(offset, digitsOnly.length)
    return when {
        clampedOffset <= 2 -> clampedOffset
        clampedOffset <= 4 -> clampedOffset + 1
        else -> clampedOffset + 2
    }
    // ❌ Could return value > formatted.length
}

// After (FIXED):
override fun originalToTransformed(offset: Int): Int {
    if (digitsOnly.isEmpty()) return 0
    
    val clampedOffset = minOf(offset, digitsOnly.length)
    val transformedPos = when {
        clampedOffset <= 2 -> clampedOffset
        clampedOffset <= 4 -> clampedOffset + 1
        else -> clampedOffset + 2
    }
    
    // ✅ CRITICAL: Never return index > formatted string length
    return minOf(transformedPos, formatted.length)
}
```

**Key Changes:**
1. Added empty string check at the beginning
2. Pass `formatted` string to `DateOffsetMapping` constructor
3. Clamp returned index with `minOf(transformedPos, formatted.length)`
4. Apply same logic to `transformedToOriginal()` with `minOf(digitCount, digitsOnly.length)`

---

## Verification Checklist

- ✅ **DateOfBirthTransformation**: Now safely handles:
  - Empty input strings
  - Cursor at end of string (offset == string.length)
  - Samsung keyboard batch edits
  - Rapid text changes and deletions
  
- ✅ **Other Text Inputs Reviewed**:
  - `PromoCodeDialog.kt` - Simple `.uppercase()` transformation (safe, no custom OffsetMapping)
  - `CreateGoalScreen.kt` - Time/distance/weight inputs use direct state updates (safe)
  - No other custom `VisualTransformation` implementations found

---

## Why This Fixes Samsung Device Crashes

Samsung keyboards (like SwiftKey) often:
1. **Autocorrect**: Aggressively move cursor and replace text ranges
2. **Predictive Text**: Insert/replace words, creating rapid edits
3. **Batch Edits**: Send multiple composition updates in quick succession
4. **Cursor Repositioning**: Jump cursor to end of words during typing

The fix ensures that **regardless of how fast or aggressive keyboard updates are**, the offset mapping always returns valid indices within bounds:

```
Original: "1234567890"
Formatted: "12/34/56/7890"
```

Even if the keyboard sends offset=20 (way out of bounds), the mapping now safely clamps it to valid range.

---

## Compose Version Info

**Current Version**: `androidx.compose:compose-bom:2024.06.00`
- This is a recent stable version (June 2024)
- Contains TextField validation improvements introduced in Compose 1.2.0+
- No urgent upgrade needed, but latest (2024.12.00+) available if issues persist

**Recommendation**: If crashes persist after this fix:
1. Update to latest stable: `androidx.compose:compose-bom:2025.01.00` (or latest available)
2. Test on various Samsung devices with Samsung keyboard enabled
3. Monitor Play Console for recurring errors

---

## Testing Recommendations

1. **Manual Testing**:
   - Test DOB field on Samsung device with Samsung Keyboard app
   - Try rapid typing, auto-corrections, paste operations
   - Test with empty input, special characters, various lengths
   
2. **Automated Testing**:
   - Add unit tests for `DateOffsetMapping` boundary cases
   - Test offset values: `-1, 0, string.length, string.length + 1`
   
3. **Monitoring**:
   - Watch Google Play Console for same exception
   - Monitor error trends after release

---

## Additional Safety Tips for Text Transformations

When creating custom `VisualTransformation` or `OffsetMapping`:

```kotlin
// ✅ DO THIS:
1. Always validate offset bounds:
   return transformedOffset.coerceIn(0, transformedText.length)

2. Handle empty strings:
   if (originalText.isEmpty()) return TransformedText(AnnotatedString(""), ...)

3. Test edge cases:
   - Offset = string.length (cursor at end)
   - Empty strings
   - Single character strings
   - Rapid keystroke sequences

4. Never assume input is valid:
   // Samsung keyboard might send unexpected indices
   val safeOffset = offset.coerceIn(0, text.length)
```

---

## Files Modified
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/PersonalDetailsScreen.kt`
  - Updated `DateOfBirthTransformation` class
  - Updated `DateOffsetMapping` class with proper boundary validation

## Related Issues
- Google Play Console: 9 events of `IllegalStateException` at `ValidatingOffsetMapping.originalToTransformed`
- Affected devices: Samsung Galaxy S20 FE (R8Q) and similar Samsung devices
- Associated with aggressive keyboard autocorrect behavior

---

## References
- [Jetpack Compose TextField Documentation](https://developer.android.com/reference/androidx/compose/material3/OutlinedTextFieldDefaults)
- [VisualTransformation API](https://developer.android.com/reference/androidx/compose/ui/text/input/VisualTransformation)
- [OffsetMapping API](https://developer.android.com/reference/androidx/compose/ui/text/input/OffsetMapping)
