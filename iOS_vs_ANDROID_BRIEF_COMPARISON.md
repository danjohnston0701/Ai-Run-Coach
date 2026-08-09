# iOS vs Android: Pre-Run Brief Comparison

## Side-by-Side Comparison

### Android ✅ (What We Want)

```
┌─────────────────────────────────────────────┐
│  Ready to Run?                              │
├─────────────────────────────────────────────┤
│                                             │
│  Today's a tempo run at lactate threshold. │
│  We're doing 20 minutes at a hard but      │
│  sustainable effort. The cloud cover       │
│  means cooler conditions.                  │
│                                             │
│  💪 Keep your heart rate in zone 3        │
│     (around 160-170 bpm). Push the pace   │
│     but stay controlled.                   │
│                                             │
│  🌬️ Light wind from the north. Expect a   │
│     headwind on the way back — practice    │
│     power on climbs.                       │
│                                             │
│  ⚠️ Your body is showing some fatigue     │
│     today. Start conservatively and build  │
│     in.                                    │
│                                             │
│  📊 You're in good shape for a solid      │
│     effort.                                │
│                                             │
│  🗺️ Final 400m has an 8% gradient — save  │
│     a little for the finish.               │
│                                             │
���─────────────────────────────────────────────┤
│  [  START RUN  ]                            │
└─────────────────────────────────────────────┘
```

### iOS ❌ (Current State - Broken)

```
┌─────────────────────────────────────────────┐
│  Ready to Run?                              │
├─────────────────────────────────────────────┤
│                                             │
│  ⏳ Loading briefing...                    │
│                                             │
│                                             │
│                                             │
│                                             │
│                                             │
│                                             │
│                                             │
│                                             │
│                                             │
│  (No briefing text shown)                  │
│                                             │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│  [  START RUN  ]                            │
└─────────────────────────────────────────────┘
```

---

## What's Different?

| Aspect | Android | iOS |
|--------|---------|-----|
| **Brief Text** | ✅ Displays AI-generated 2-3 sentences | ❌ Not shown (only loading spinner) |
| **Intensity Advice** | ✅ Shows with 💪 emoji | ❌ Missing |
| **Weather Advice** | ✅ Shows with 🌬️ emoji | ❌ Missing |
| **Warnings** | ✅ Shows with ⚠️ emoji in red | ❌ Missing |
| **Readiness Insight** | ✅ Shows with 📊 emoji | ❌ Missing |
| **Route Insight** | ✅ Shows with 🗺️ emoji | ❌ Missing |
| **Audio TTS** | ✅ Plays with coach voice | ❌ Missing |
| **API Endpoint** | ✅ Calls `POST /api/briefing` | ❌ No API call |
| **User Experience** | ✅ Personalized coaching before run | ❌ Generic "Ready to run?" |

---

## Android Implementation (Reference)

### Where the Brief is Fetched
**File:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSessionViewModel.kt`  
**Lines:** 1090-1170

```kotlin
val briefing = await apiService.getPreRunBriefing(
    distance = 5.0,
    elevationGain = 120,
    difficulty = "moderate",
    weather = weatherData,
    coachName = user?.coachName,
    coachTone = user?.coachTone,
    // ... more params
)

// Update UI state with response
_runState.update { it.copy(
    coachText = briefing.briefing,           // Main text
    latestCoachMessage = briefing.briefing,  // For speech
    briefingResponse = briefing              // Full response with intensity, warnings, etc.
)}
```

### Where the Brief is Displayed
**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSessionScreen.kt`  
**Lines:** 1630-1680

```kotlin
// Main briefing text
Text(
    text = message.orEmpty(),
    style = AppTextStyles.body,
    fontWeight = FontWeight.Medium,
    fontSize = 12.sp
)

// Intensity advice
briefingResponse?.intensityAdvice?.takeIf { it.isNotBlank() }?.let {
    Text(text = "💪 $it", fontSize = 11.sp)
}

// Warnings
briefingResponse?.warnings?.takeIf { it.isNotEmpty() }?.let { warnings ->
    warnings.forEach { warning ->
        Text(text = "⚠️ $warning", color = Colors.warning, fontSize = 10.sp)
    }
}

// Readiness insight
briefingResponse?.readinessInsight?.takeIf { it.isNotBlank() }?.let {
    Text(text = "📊 $it", fontSize = 10.sp)
}
```

### How Audio Plays
**File:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSessionViewModel.kt`  
**Lines:** 1110-1142

```kotlin
val briefAudio = if (cachedAudioFile.exists()) {
    Base64.encodeToString(cachedAudioFile.readBytes(), Base64.NO_WRAP)
} else null

CoachingAudioQueue.enqueue(
    context = context,
    base64Audio = briefAudio,
    format = if (briefAudio != null) "mp3" else null,
    fallbackText = coachingPlanBrief,  // Android TTS fallback
    accent = user?.coachAccent,
    gender = user?.coachGender,
    onComplete = {
        isBriefingAudioPlaying = false
        _runState.update { it.copy(coachText = "", latestCoachMessage = null) }
    }
)
```

---

## What iOS Needs to Do

### 1. Fetch the Brief
```swift
// Current: iOS doesn't call this
// Needed: Call POST /api/briefing with route/weather/coach data
```

### 2. Display the Brief
```swift
// Current: iOS shows nothing, just loading spinner
// Needed: Show briefing + intensity + warnings + readiness + route
```

### 3. Play Audio
```swift
// Current: No audio playback
// Needed: Decode base64 MP3 and play with AVAudioPlayer
```

---

## The API Response Structure

Both Android and iOS should expect **the same JSON response**:

```json
{
  "briefing": "Today's a tempo run at lactate threshold...",
  "intensityAdvice": "Keep your heart rate in zone 3...",
  "weatherAdvice": "Light wind from the north...",
  "warnings": [
    "Your body is showing some fatigue today...",
    "Warm conditions — hydrate well..."
  ],
  "readinessInsight": "You're in good shape for a solid effort.",
  "routeInsight": "Final 400m has an 8% gradient — save a little for the finish.",
  "audio": "SUQzBAAAI1MTRUNPMjA0...",  // base64 MP3
  "format": "mp3",
  "voice": "british_female_energetic"
}
```

**All fields are optional**, but `briefing` should always be present.

---

## Step-by-Step Comparison

### Android Flow
1. ✅ User opens pre-run screen
2. ✅ `RunSessionViewModel.prepareRun()` is called
3. ✅ Calls `apiService.getPreRunBriefing(params)`
4. ✅ Response is stored in `briefingResponse` state
5. ✅ `RunSessionScreen` displays all fields with emojis
6. ✅ Audio plays in background (optional)
7. ✅ User taps "Start Run" → run begins

### iOS Flow (Current - Broken)
1. ❌ User opens pre-run screen
2. ❌ No API call is made
3. ❌ Shows "Loading briefing..." spinner forever
4. ❌ No briefing text, intensity, warnings, etc.
5. ❌ No audio playback
6. ❌ User taps "Start Run" without seeing brief

### iOS Flow (What We're Building)
1. ✅ User opens pre-run screen
2. ✅ `onAppear` → calls `viewModel.fetchPreRunBrief()`
3. ✅ Calls `apiService.fetchPreRunBrief(request)`
4. ✅ Response is stored in `preRunBrief` state
5. ✅ `PreRunBriefView` displays all fields with emojis
6. ✅ Audio plays in background (optional)
7. ✅ User taps "Start Run" → run begins

---

## Code Line References

### Android
- **ViewModel briefing fetch:** `RunSessionViewModel.kt:1090-1170`
- **Model definition:** `PreRunBriefingResponse.kt:1-70`
- **UI display:** `RunSessionScreen.kt:1630-1680`
- **Audio playback:** `RunSessionViewModel.kt:1110-1142`

### iOS (To Be Implemented)
- **Model definition:** `PreRunBrief.swift` (new file)
- **API method:** Add to `APIService.swift`
- **ViewModel method:** Add to run session ViewModel
- **UI display:** `PreRunBriefView.swift` (new file)
- **Integration:** Update pre-run screen

---

## Quality Checklist

Before considering iOS complete, verify:

- [ ] Brief text appears on pre-run screen
- [ ] Intensity advice shows with 💪 emoji
- [ ] Weather advice shows with 🌬️ emoji
- [ ] Warnings show with ⚠️ emoji (in orange if possible)
- [ ] Readiness insight shows with 📊 emoji
- [ ] Route insight shows with 🗺️ emoji
- [ ] Audio plays (if available in response)
- [ ] Loading spinner shows while fetching
- [ ] Error message shows if API fails
- [ ] Brief matches Android's styling and layout
- [ ] User can still tap "Start Run" at any time
- [ ] All emojis display correctly

---

## Testing Scenarios

### Scenario 1: Happy Path (Full Brief)
```json
Request: {
  "startLocation": { "lat": 40.7128, "lng": -74.0060 },
  "distance": 5.0,
  "difficulty": "moderate",
  "hasRoute": true,
  "weather": { "temp": 22, "condition": "cloudy", "windSpeed": 5 }
}

Expected Response:
{
  "briefing": "Today's a moderate 5km run. Cloud cover means cooler conditions.",
  "intensityAdvice": "Keep it conversational and comfortable.",
  "weatherAdvice": "Light wind today — great running weather.",
  "warnings": [],
  "readinessInsight": "Your body is ready for a quality effort.",
  "routeInsight": "Rolling terrain with mixed climbs."
}

iOS Should Display:
✅ Main brief text (large)
✅ 💪 Intensity advice
✅ 🌬️ Weather advice
✅ 📊 Readiness insight
✅ 🗺️ Route insight
```

### Scenario 2: Brief with Warnings
```json
Response includes:
"warnings": [
  "Your body is showing some fatigue.",
  "Warm conditions — hydrate well."
]

iOS Should Display:
✅ Both warnings with ⚠️ emoji (in red/orange)
```

### Scenario 3: Free Run (No Route)
```json
Request: { ..., "hasRoute": false }

Expected Response:
{
  "briefing": "Free run today — just you and the road.",
  "intensityAdvice": "Run how you feel.",
  "warnings": [],
  "readinessInsight": "What will make this run rewarding?"
  // routeInsight is NOT present (no route)
}

iOS Should Display:
✅ All fields except routeInsight (omit 🗺️)
```

---

## Summary

**Android:** Already beautiful with full pre-run brief experience  
**iOS:** Needs to implement the same briefing fetch + display to match  
**Timeline:** Should take 1-2 hours with the provided templates  
**Test:** Compare side-by-side to ensure identical functionality

The backend API is **ready and waiting** at `POST /api/briefing`. iOS just needs to call it and display the response! 🚀
