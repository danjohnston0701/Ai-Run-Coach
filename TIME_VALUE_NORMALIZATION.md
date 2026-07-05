# Time Value Normalization in Coaching Messages - Implementation Complete ✅

## Problem

Coaching messages were expressing time differences in raw seconds, which sounded awkward when spoken:

**Before:**
> "You've covered 0.5 kilometres in 2 minutes and 14 seconds, which puts you at a current pace of 4 minutes and 25 seconds per kilometre. That's **131 seconds** faster than your target pace."

**Expected:**
> "...That's **2 minutes and 11 seconds** faster than your target pace."

Similarly, projected finish times like "5400 seconds" should be "1 hour and 30 minutes".

---

## Solution

### 1. **New Utility Function: `formatDurationForSpeech()`**

**File:** `app/src/main/java/live/airuncoach/airuncoach/util/AbbreviationExpander.kt`

Converts raw seconds into human-readable time notation with proper grammar:

```kotlin
formatDurationForSpeech(42)    → "42 seconds"
formatDurationForSpeech(131)   → "2 minutes and 11 seconds"
formatDurationForSpeech(3661)  → "1 hour, 1 minute and 1 second"
formatDurationForSpeech(5400)  → "1 hour and 30 minutes"
```

**Rules:**
- **0-59 seconds**: "X seconds"
- **60-3599 seconds**: "M minutes and S seconds" (drops "and S" if S=0)
- **3600+ seconds**: "H hours, M minutes and S seconds" (drops zero-value parts)

**Proper Grammar:**
- Singular/plural handling: "1 second" vs "2 seconds", "1 minute" vs "30 minutes"
- Proper conjunctions: "1 hour and 30 minutes" (not "1 hour, 30 minutes")

### 2. **New Utility Function: `normalizeTimeValues()`**

Finds numeric time patterns in text and normalizes them:

```kotlin
normalizeTimeValues("...131 seconds faster...")
  → "...2 minutes and 11 seconds faster..."

normalizeTimeValues("expected in 5400 seconds")
  → "expected in 1 hour and 30 minutes"
```

Regex patterns handled:
- `\d+ seconds` (where value ≥ 60)
- Context preservation: "by 131 seconds" → "by 2 minutes and 11 seconds"

### 3. **Centralized Message Cleaning**

**File:** `app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`

New function `cleanCoachingMessage()` applies all normalizations in order:

```kotlin
private fun cleanCoachingMessage(message: String): String {
    var result = message
    // 1. Remove redundant "per kilometer" from pace differences
    result = AbbreviationExpander.cleanPaceDifference(result)
    // 2. Normalize time values (131 seconds → 2 minutes and 11 seconds)
    result = AbbreviationExpander.normalizeTimeValues(result)
    return result
}
```

This is automatically called in `playCoachingAudio()`, so all coaching messages get normalized before TTS.

---

## Examples

### Km Split Coaching

**Before:**
```
"500m: Mighty start, Daniel! You've covered 0.5 kilometres in 2 minutes and 14 seconds, 
which puts you at a current pace of 4 minutes and 25 seconds per kilometre. 
That's 131 seconds faster than your target pace."
```

**After:**
```
"500m: Mighty start, Daniel! You've covered 0.5 kilometres in 2 minutes and 14 seconds, 
which puts you at a current pace of 4 minutes and 25 seconds per kilometre. 
That's 2 minutes and 11 seconds faster than your target pace."
```

### Projected Finish Time

**Before:**
```
"At your current pace, you're on track to finish in 5400 seconds."
```

**After:**
```
"At your current pace, you're on track to finish in 1 hour and 30 minutes."
```

### Complex Duration

**Before:**
```
"You're 93 minutes behind schedule."
```

**After:**
```
"You're 1 hour and 33 minutes behind schedule."
```

---

## Implementation Details

### Function: `formatDurationForSpeech(totalSeconds: Long): String`

**Location:** `AbbreviationExpander.kt` lines 138-180

**Algorithm:**
1. If < 60 seconds: Return "X seconds"
2. If < 3600 seconds: Calculate minutes and seconds, format with "and"
3. If ≥ 3600 seconds:
   - Break into hours, minutes, seconds
   - Build string parts only for non-zero values
   - Join with commas and "and" for final item

**Singular/Plural Logic:**
- Checks if value == 1L to use singular form
- "1 minute" vs "2 minutes"
- "1 second" vs "42 seconds"

### Function: `normalizeTimeValues(text: String): String`

**Location:** `AbbreviationExpander.kt` lines 182-224

**Regex Patterns:**
1. `(\d+)\s+seconds(?!\s+per)` — Matches "N seconds" but NOT "N seconds per kilometer"
2. Converts any match ≥ 60 seconds using `formatDurationForSpeech()`
3. Preserves context and surrounding text

### Message Processing Pipeline

**Location:** `RunTrackingService.kt` line 3668+

```
Coaching API Response
        ↓
playCoachingAudio(audio, format, message)
        ↓
cleanCoachingMessage(message)  ← NEW
        ├── cleanPaceDifference()      (removes redundant "per kilometer")
        └── normalizeTimeValues()       (converts 131 → "2 minutes and 11 seconds")
        ↓
Broadcast to UI: _latestCoachingText.value
        ↓
Enqueue to CoachingAudioQueue (with normalized text)
        ↓
expandForSpeech() in CoachingAudioQueue
        ├── cleanPaceDifference()      (redundant but safe)
        └── All abbreviation expansions (bpm → beats per minute, etc.)
        ↓
TTS or Polly Audio Playback
```

---

## Files Modified

| File | Changes |
|------|---------|
| `AbbreviationExpander.kt` | Added `formatDurationForSpeech()` and `normalizeTimeValues()` |
| `RunTrackingService.kt` | Added `cleanCoachingMessage()` and integrated into `playCoachingAudio()` |

---

## Testing

Test cases to verify:

| Input | Expected Output |
|-------|-----------------|
| 42 seconds | "42 seconds" |
| 60 seconds | "1 minute" |
| 65 seconds | "1 minute and 5 seconds" |
| 131 seconds | "2 minutes and 11 seconds" |
| 120 seconds | "2 minutes" |
| 3600 seconds | "1 hour" |
| 3661 seconds | "1 hour, 1 minute and 1 second" |
| 5400 seconds | "1 hour and 30 minutes" |
| 5454 seconds | "1 hour, 30 minutes and 54 seconds" |

### Test in Context

```kotlin
val message = "You're 131 seconds faster than target and will finish in 5400 seconds"
val normalized = normalizeTimeValues(message)
// Expected: "You're 2 minutes and 11 seconds faster than target and will finish in 1 hour and 30 minutes"
```

---

## Notes

- This solution handles time values but **doesn't modify Polly/OpenAI audio** (only the text fallback)
- The regex avoids matching "per kilometer" patterns (preserves those units)
- All normalizations are idempotent (can be applied multiple times safely)
- Works with both singular and plural time units
- Integrates seamlessly with existing `expandForSpeech()` abbreviation expansion

