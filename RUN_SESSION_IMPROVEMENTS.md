# Run Session Screen Improvements - Implementation Plan

## Design Goals
Match the React app design with:
1. Route polyline visible on map (blue line)  
2. User's GPS track (green line)
3. Coach avatar with TTS text visible
4. Pre-run briefing at start
5. Turn-by-turn navigation display

## Current Implementation Status

### ✅ Already Working
- GPS tracking and location updates
- RunTrackingService collects route points
- Map display with Google Maps Compose
- OpenAI TTS audio playback
- Speech recognition for "Talk to Coach"

### ❌ Missing Features
1. **Route polyline not shown** - need to decode and display selected route
2. **Coach message not visible** - TTS text should be on screen
3. **No pre-run briefing** - need to trigger at start
4. **No turn instructions** - navigation data not displayed

## Implementation Steps

### 1. Store Selected Route in RunConfigHolder
**File**: `util/RunConfigHolder.kt`
- Add `selectedRoute: GeneratedRoute?` to RunSetupConfig
- Pass route from RouteSelectionScreen → RunSetupScreen → RunSessionScreen

### 2. Display Route Polyline on Map  
**File**: `RunSessionScreen.kt`
- Decode selected route polyline using PolyUtil
- Show as blue polyline on map
- Show user's GPS track as green polyline
- Add start (blue) and finish (green) markers

### 3. Add Coach Message Display
**File**: `RunSessionScreen.kt`
- Add coach avatar image
- Display latest TTS text in speech bubble
- Update text when new coaching received
- Match React design with avatar + message box

### 4. Implement Pre-Run Briefing
**File**: `RunSessionViewModel.kt` 
- Call `/api/coaching/pre-run-briefing-audio` when run starts
- Include:
  - First 2 turn instructions (if route exists)
  - Total distance and elevation
  - Terrain type
  - Weather summary
  - Motivational statement
- Play OpenAI TTS audio
- Display text on screen

### 5. Add Coach Message State
**File**: `RunSessionViewModel.kt`
- Add `latestCoachMessage: String` to RunState
- Update on every coaching trigger:
  - Pre-run briefing
  - Phase coaching (500m milestones)
  - Struggle detection
  - Km splits
  - Talk to coach responses

## Data Flow

```
RouteSelectionScreen
  ↓ (user selects route)
RunSetupScreen  
  ↓ (passes route in config)
RunConfigHolder.setConfig(route)
  ↓
RunSessionScreen
  ↓ (loads route)
Decode polyline → Display on map
  ↓ (user starts run)
RunSessionViewModel.startRun()
  ↓
Generate pre-run briefing
  → Get route summary
  → Get first 2 turns
  → Get weather
  → Call OpenAI TTS API
  ↓
Play audio + Show text on screen
  ↓ (during run)
All coaching updates latestCoachMessage state
```

## API Changes Needed

### Pre-Run Briefing Request
Already exists: `POST /api/coaching/pre-run-briefing-audio`

**Enhanced Request**:
```kotlin
data class PreRunBriefingRequest(
    val distance: Double,
    val elevationGain: Double,
    val elevationLoss: Double,
    val difficulty: String,
    val activityType: String,
    val weather: WeatherPayload?,
    val startLocation: StartLocation?,
    val targetTime: Int?,
    val firstTurnInstruction: String?,  // NEW
    val secondTurnInstruction: String?  // NEW
)
```

**Response** (already correct):
```kotlin
data class PreRunBriefingResponse(
    val audio: String,   // base64 MP3
    val format: String,  // "mp3"
    val voice: String,   // "onyx", "nova", etc
    val text: String     // TTS text to display
)
```

## UI Design (Matching React App)

### Layout Structure
```
┌─────────────────────────────────┐
│  TIME   DISTANCE   PACE  CADENCE│ ← Stats Row
├─────────────────────────────────┤
│                                 │
│      Google Map with:           │
│      - Blue polyline (route)    │
│      - Green polyline (track)   │
│      - Current location marker  │
│      - Start/Finish markers     │
│                                 │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │  👤 Coach Avatar        │   │
│  │  ┌───────────────────┐  │   │
│  │  │ "Great job! Keep  │  │   │ ← Coach Message
│  │  │  up the pace!"    │  │   │
│  │  └───────────────────┘  │   │
│  └─────────────────────────┘   │
│  ▂▃▅▇▅▃▂ (voice visualizer)   │ ← Sound waves
├─────────────────────────────────┤
│     [■]  [▶/❚❚]  [Share]      │ ← Controls
└─────────────────────────────────┘
```

## Files to Modify

1. **`util/RunConfigHolder.kt`**
   - Add selectedRoute field

2. **`domain/model/RunSetupConfig.kt`**  
   - Add selectedRoute: GeneratedRoute?

3. **`ui/screens/RunSetupScreen.kt`**
   - Pass selected route to config

4. **`viewmodel/RunSessionViewModel.kt`**
   - Add latestCoachMessage to RunState
   - Implement generatePreRunBriefing()
   - Update all coaching methods to set latestCoachMessage

5. **`ui/screens/RunSessionScreen.kt`**
   - Display route polyline
   - Display GPS track polyline  
   - Add coach avatar + message display
   - Show turn instructions if available

6. **`service/RunTrackingService.kt`**
   - Store selected route
   - Broadcast current coach message

## Testing Plan

1. **Route Display**
   - Generate route → Select route → Start run → See blue polyline
   - Start run → Move around → See green track appear

2. **Pre-Run Briefing**
   - Select route → Start run → Hear briefing
   - Check includes: turns, distance, elevation, weather, motivation
   - Verify text appears on screen

3. **Coach Messages**
   - Run 500m → See/hear coaching → Text updates on screen
   - Run 1km → See split coaching → Text updates
   - Tap "Talk to Coach" → See response text

4. **Audio + Text Sync**
   - Verify text matches what is spoken
   - Verify text stays visible until next message
   - Verify audio plays through headphones

## Next Steps

Ready to implement! This will make the Android app match the React app design perfectly.
