# Text Transformation Best Practices for AiRunCoach

## Overview
This document provides guidelines for implementing safe text input transformations in Jetpack Compose, based on the crash fixes applied to the codebase.

---

## Pattern 1: Simple Text Filtering (Safest)

**Use Case**: Allow only digits, uppercase, etc.

```kotlin
// ✅ GOOD - Simple direct filtering
OutlinedTextField(
    value = code,
    onValueChange = { newValue ->
        // This is safe - no custom OffsetMapping needed
        code = newValue.filter { it.isLetterOrDigit() }
            .uppercase()
            .take(10) // Limit length
    }
)
```

**Why it's safe**:
- No custom `OffsetMapping` - Compose handles standard behavior
- Cursor positioning is handled automatically
- Samsung keyboard autocorrect is compatible

**Current Usage in AiRunCoach**:
- `PromoCodeDialog.kt` - Promo codes with `.uppercase()`

---

## Pattern 2: Mask Formatting (Medium Complexity)

**Use Case**: Format as phone (###-###-####), date (DD/MM/YYYY), etc.

### ❌ WRONG (Causes Crashes)

```kotlin
class BadDateTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digitsOnly = text.text.filter { it.isDigit() }
        val formatted = when {
            digitsOnly.length <= 2 -> digitsOnly
            digitsOnly.length <= 4 -> "${digitsOnly.take(2)}/${digitsOnly.drop(2)}"
            else -> "${digitsOnly.take(2)}/${digitsOnly.drop(2).take(2)}/${digitsOnly.drop(4).take(4)}"
        }
        return TransformedText(
            text = AnnotatedString(formatted),
            offsetMapping = BadOffsetMapping(digitsOnly) // ❌ Missing validation
        )
    }
}

class BadOffsetMapping(val digitsOnly: String) : OffsetMapping {
    override fun originalToTransformed(offset: Int): Int {
        val clampedOffset = minOf(offset, digitsOnly.length)
        return when {
            clampedOffset <= 2 -> clampedOffset
            clampedOffset <= 4 -> clampedOffset + 1
            else -> clampedOffset + 2
        }
        // ❌ PROBLEM: Doesn't validate against formatted string length!
    }
}
```

### ✅ CORRECT (Safe for Samsung)

```kotlin
class GoodDateTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digitsOnly = text.text.filter { it.isDigit() }
        val formatted = when {
            digitsOnly.length <= 2 -> digitsOnly
            digitsOnly.length <= 4 -> "${digitsOnly.take(2)}/${digitsOnly.drop(2)}"
            digitsOnly.length <= 8 -> "${digitsOnly.take(2)}/${digitsOnly.drop(2).take(2)}/${digitsOnly.drop(4)}"
            else -> "${digitsOnly.take(2)}/${digitsOnly.drop(2).take(2)}/${digitsOnly.drop(4).take(4)}"
        }
        return TransformedText(
            text = AnnotatedString(formatted),
            offsetMapping = GoodOffsetMapping(digitsOnly, formatted) // ✅ Pass formatted string
        )
    }
}

class GoodOffsetMapping(
    private val digitsOnly: String,
    private val formatted: String // ✅ Store for validation
) : OffsetMapping {
    
    override fun originalToTransformed(offset: Int): Int {
        // ✅ Handle empty strings
        if (digitsOnly.isEmpty()) return 0
        
        val clampedOffset = minOf(offset, digitsOnly.length)
        val transformedPos = when {
            clampedOffset <= 2 -> clampedOffset
            clampedOffset <= 4 -> clampedOffset + 1
            else -> clampedOffset + 2
        }
        
        // ✅ CRITICAL: Validate against actual formatted length
        return minOf(transformedPos, formatted.length)
    }
    
    override fun transformedToOriginal(offset: Int): Int {
        // ✅ Handle empty strings
        if (formatted.isEmpty()) return 0
        
        var digitCount = 0
        for (i in 0 until minOf(offset, formatted.length)) {
            if (i != 2 && i != 5) { // Skip slash positions
                digitCount++
            }
        }
        
        // ✅ CRITICAL: Validate against actual original length
        return minOf(digitCount, digitsOnly.length)
    }
}
```

**Key Points**:
1. **Store the formatted string** in `OffsetMapping` constructor
2. **Validate all returns** with bounds checking:
   - `minOf(value, string.length)` or
   - `.coerceIn(0, string.length)`
3. **Handle edge cases**:
   - Empty strings → return 0
   - Offset = string.length → valid (cursor at end)
4. **Test Samsung behavior** - rapid edits, autocorrect, paste

---

## Pattern 3: Complex Text Transformation (Highest Risk)

**Use Case**: Building masks, handling multiple formatting rules

### Checklist Before Implementation

- [ ] Do I really need a custom `VisualTransformation`?
- [ ] Can I use simple `onValueChange` filtering instead?
- [ ] Have I tested with Samsung keyboard?
- [ ] Does my `OffsetMapping` handle all edge cases?
- [ ] Have I added unit tests for boundary conditions?

### Safe Implementation Template

```kotlin
class MyTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val original = text.text
        val transformed = transformText(original)
        
        return TransformedText(
            text = AnnotatedString(transformed),
            offsetMapping = MyOffsetMapping(original, transformed)
        )
    }
    
    private fun transformText(input: String): String {
        // Your transformation logic here
        // Must handle: empty strings, special chars, length limits
        if (input.isEmpty()) return ""
        
        // Apply your formatting...
        return formatted
    }
}

class MyOffsetMapping(
    private val original: String,
    private val transformed: String
) : OffsetMapping {
    
    override fun originalToTransformed(offset: Int): Int {
        // Offset is in the ORIGINAL (unformatted) string
        if (original.isEmpty()) return 0
        
        val validOffset = offset.coerceIn(0, original.length)
        
        // Your mapping logic
        val result = calculateTransformedOffset(validOffset)
        
        // ✅ ALWAYS validate
        return result.coerceIn(0, transformed.length)
    }
    
    override fun transformedToOriginal(offset: Int): Int {
        // Offset is in the TRANSFORMED (formatted) string
        if (transformed.isEmpty()) return 0
        
        val validOffset = offset.coerceIn(0, transformed.length)
        
        // Your reverse mapping logic
        val result = calculateOriginalOffset(validOffset)
        
        // ✅ ALWAYS validate
        return result.coerceIn(0, original.length)
    }
    
    private fun calculateTransformedOffset(originalOffset: Int): Int {
        // Your logic here
        return originalOffset
    }
    
    private fun calculateOriginalOffset(transformedOffset: Int): Int {
        // Your logic here
        return transformedOffset
    }
}
```

---

## Testing Your Transformation

### Unit Tests Required

```kotlin
@Test
fun testOriginalToTransformedBoundaries() {
    val mapping = DateOffsetMapping(
        digitsOnly = "12345678",
        formatted = "12/34/56/78"
    )
    
    // Edge cases
    assertEquals(0, mapping.originalToTransformed(-1)) // Out of bounds
    assertEquals(0, mapping.originalToTransformed(0))   // Start
    assertEquals(10, mapping.originalToTransformed(8))  // End (string length)
    assertEquals(10, mapping.originalToTransformed(100)) // Way out of bounds
    
    // All should be within bounds
    for (i in 0..8) {
        val result = mapping.originalToTransformed(i)
        assertTrue(result >= 0 && result <= 10, "Offset $i returned $result (out of bounds)")
    }
}

@Test
fun testTransformedToOriginalBoundaries() {
    val mapping = DateOffsetMapping(
        digitsOnly = "12345678",
        formatted = "12/34/56/78"
    )
    
    // Edge cases
    assertEquals(0, mapping.transformedToOriginal(-1))
    assertEquals(0, mapping.transformedToOriginal(0))
    assertEquals(8, mapping.transformedToOriginal(10))
    assertEquals(8, mapping.transformedToOriginal(100))
    
    // All should be within bounds
    for (i in 0..10) {
        val result = mapping.transformedToOriginal(i)
        assertTrue(result >= 0 && result <= 8, "Offset $i returned $result (out of bounds)")
    }
}

@Test
fun testEmptyStringHandling() {
    val mapping = DateOffsetMapping(digitsOnly = "", formatted = "")
    
    assertEquals(0, mapping.originalToTransformed(0))
    assertEquals(0, mapping.transformedToOriginal(0))
    assertEquals(0, mapping.originalToTransformed(5))
    assertEquals(0, mapping.transformedToOriginal(5))
}
```

### Manual Testing Checklist

- [ ] Open in Android emulator with Samsung keyboard enabled
- [ ] Type normally → cursor follows correctly
- [ ] Use autocorrect → no crashes
- [ ] Paste text → handles bulk input
- [ ] Use predictive text → no offset errors
- [ ] Delete/backspace → smooth cursor movement
- [ ] Clear all text → returns to empty state

---

## When to Avoid Custom VisualTransformation

Use simple `onValueChange` filtering instead when:

1. **Simple filtering** (digits only, uppercase, etc.):
   ```kotlin
   onValueChange = { it.filter { char -> char.isDigit() } }
   ```

2. **Length limit**:
   ```kotlin
   onValueChange = { it.take(10) }
   ```

3. **Simple case conversion**:
   ```kotlin
   onValueChange = { it.uppercase() }
   ```

4. **Combination of above**:
   ```kotlin
   onValueChange = { 
       it.filter { char -> char.isLetterOrDigit() }
         .uppercase()
         .take(20)
   }
   ```

These are **safe** because Compose handles the cursor positioning automatically without custom offset mapping.

---

## Current AiRunCoach Status

### ✅ Safe Implementations
- `PromoCodeDialog.kt` - `.uppercase()` transformation (simple)
- `CreateGoalScreen.kt` - Direct state updates, no custom OffsetMapping
- All other text fields - Basic filtering or no transformation

### ✅ Fixed Implementations
- `PersonalDetailsScreen.kt` - `DateOfBirthTransformation` now has proper boundary validation

### ⚠️ Review if Adding More Transforms
- Before adding custom `VisualTransformation`, consider if simple filtering is sufficient
- Always test with Samsung keyboard enabled
- Always include boundary validation in `OffsetMapping`

---

## Resources

- [Jetpack Compose Text Input Guide](https://developer.android.com/jetpack/compose/text/user-input)
- [VisualTransformation API Docs](https://developer.android.com/reference/androidx/compose/ui/text/input/VisualTransformation)
- [OffsetMapping API Docs](https://developer.android.com/reference/androidx/compose/ui/text/input/OffsetMapping)
- [Samsung Keyboard Known Issues](https://developers.google.com/android/reference/com/google/android/gms/composebar)
