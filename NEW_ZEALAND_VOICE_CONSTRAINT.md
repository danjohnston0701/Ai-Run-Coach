# New Zealand Voice Constraint - Implementation Summary

## What Was Changed

Added UI constraints and automatic voice selection for the New Zealand accent, which only supports a female voice (Aria).

## User Experience

### When User Selects New Zealand Accent

1. **Auto-switch gender:** If male is selected, automatically switches to female
2. **Help text appears:** Below the Accent selector: "ℹ️ New Zealand only supports a female voice"
3. **Male button disabled:** Grayed out with reduced opacity
4. **Help text below gender:** "New Zealand accent only supports a female voice"

### Accent Selection UI

When New Zealand is selected:
- Help text displays: "ℹ️ New Zealand only supports a female voice"
- South African shows: "ℹ️ South African only has one voice (gender neutral)"
- Indian shows: "ℹ️ Indian only has one voice (gender neutral)"

## Code Changes

### 1. CoachSettingsViewModel.kt

```kotlin
fun onAccentChanged(accent: String) {
    _accent.value = accent
    
    // New Zealand only supports female voice
    if (accent.equals("New Zealand", ignoreCase = true) && _voiceGender.value == "male") {
        _voiceGender.value = "female"
    }
}
```

**Logic:**
- When accent changes to "New Zealand"
- AND current gender is "male"
- THEN automatically switch to "female"

### 2. CoachSettingsScreen.kt - Voice Gender Section

**Added:**
- `isNewZealand` variable checks current accent
- Male button has `enabled = !isNewZealand` parameter
- Help text displays when New Zealand is selected
- Conditional rendering with nice formatting

**Changes to GenderButton:**
- Added `enabled` parameter (default = true)
- Added disabled state colors (faded appearance)
- Proper button styling for disabled state

### 3. CoachSettingsScreen.kt - Accent Section

**Added:**
- Context-aware help text for limited voice accents
- Shows below each selected accent:
  - New Zealand: "ℹ️ New Zealand only supports a female voice"
  - South African: "ℹ️ South African only has one voice (gender neutral)"
  - Indian: "ℹ️ Indian only has one voice (gender neutral)"

## User Flow

```
User opens Coach Settings
    ↓
Selects Accent: "New Zealand"
    ↓
ViewModel detects New Zealand
    ├─ If male selected → Auto-switches to female
    └─ Updates _accent value
    ↓
UI Re-renders
    ├─ Male button → Grayed out (disabled)
    ├─ Female button → Active (pre-selected)
    └─ Help text appears → "New Zealand accent only supports a female voice"
    ↓
User sees clear indication of limitation
    ↓
User saves settings with female voice automatically selected
```

## Benefits

✅ **Clear communication:** Users see why male isn't available  
✅ **Automatic correction:** No synthesis failures from invalid combinations  
✅ **Smooth UX:** Male automatically switches to female when needed  
✅ **Prevents errors:** Can't save invalid accent/gender combinations  
✅ **Informative:** Help text explains the limitation  
✅ **Extensible:** Easy to add similar constraints for other accents  

## Testing

To verify the implementation:

1. **Test New Zealand auto-switch:**
   - Select "Male" gender
   - Select "New Zealand" accent
   - ✅ Gender should auto-switch to "Female"

2. **Test male button disabled:**
   - Select "New Zealand" accent
   - ✅ Male button should be grayed out and non-clickable

3. **Test help text visibility:**
   - Select "New Zealand" accent
   - ✅ Help text should appear: "New Zealand accent only supports a female voice"
   - ✅ Help text should appear below Accent section as well

4. **Test other accents:**
   - Select "South African" → Shows "only has one voice (gender neutral)"
   - Select "Indian" → Shows "only has one voice (gender neutral)"
   - Select "British" → No help text (full gender support)

## Files Modified

- `app/src/main/java/live/airuncoach/airuncoach/viewmodel/CoachSettingsViewModel.kt`
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/CoachSettingsScreen.kt`

## Notes

- The constraint is enforced at the ViewModel level (logic layer)
- The UI provides visual feedback about the constraint
- Help text is context-aware and only shows for limited voices
- Disabled buttons use proper Material Design conventions
- All changes are backward compatible

## Future Enhancement Ideas

If you want to extend this pattern to other accents with constraints:

1. Add a data structure mapping accents to available genders:
```kotlin
val accentVoiceConstraints = mapOf(
    "new_zealand" to listOf("female"),
    "south_african" to listOf("male", "female"), // But same voice
    "indian" to listOf("male", "female"), // But same voice
    // etc.
)
```

2. Create a reusable validation function:
```kotlin
fun isVoiceAvailableForAccent(accent: String, gender: String): Boolean {
    // Check if this gender is available for the accent
}
```

3. Apply to other voice limitation scenarios as needed
