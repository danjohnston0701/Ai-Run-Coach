# iOS Implementation Brief: AI Coaching Session Generation & Preparation

## Overview

This brief covers the **Generate Session screen** and the **AI coaching session generation flow** in the AI Run Coach app. This is where users view a planned workout from an AI-generated training plan, trigger the generation of a bespoke AI coaching plan, and then prepare to start the run either on their watch or phone.

The iOS team should replicate the Android user experience exactly, including:
- The Generate Session screen layout and all coaching state indicators
- Real-time feedback while AI coaching is being generated
- Button state management (enabled/disabled based on location + coaching readiness)
- Full integration with watch preparation and phone start flows

---

## Screen: Generate Session (Workout Detail)

### Navigation & Data

**Route:** Triggered when user taps a workout card from "Today's Plans" on the dashboard.

**Data Passed:**
```swift
struct WorkoutDetails {
    let id: String                      // Workout ID from the training plan
    let workoutType: String            // e.g. "interval_training", "tempo", "zone_2", "long_run", "recovery"
    let intensity: String              // e.g. "threshold", "easy", "hard"
    let distance: Double?              // In kilometers
    let targetPace: String?            // e.g. "5:30/km"
    let intervalCount: Int?            // Number of intervals (if applicable)
    let intervalDistanceMeters: Double? // Distance per interval
    let intervalDurationSeconds: Int?  // Duration per interval
    let description: String            // Full workout description from the plan
}
```

---

## Top Bar / Header

```
┌─────────────────────────────────────┐
│ ← Back    Generate Session          │
│           interval_training         │ (smaller, secondary text)
└─────────────────────────────────────┘
```

**Styling:**
- Back button: Left-aligned, light arrow icon
- Title: "Generate Session" (bold, large, primary color)
- Subtitle: Workout type label (secondary color, smaller font) — e.g. "Interval Training", "Tempo", "Zone 2 Recovery"

---

## Screen Content Layout

### Section 1: Workout Summary Card

Displays the workout details with a colored badge indicating the session type.

```
┌─────────────────────────────────────┐
│ 📊 Interval Training (colored badge)│
│                                     │
│ 5 × 2km @ 5:30/km                  │
│ Recovery: 400m easy jog             │
│                                     │
│ 3 sets • ~45 minutes • 12.5 km      │
└─────────────────────────────────────┘
```

**Card Details:**
- Workout type badge (colored: blue for tempo, teal for interval, purple for VO2 max, green for recovery, etc.)
- Workout description (full text from the training plan)
- Key metrics row: Sets/reps, estimated duration, total distance

---

### Section 2: AI Coaching Status Banner (Dynamic)

This banner shows the real-time state of AI coaching generation. It has **three possible states:**

#### State 1: GENERATING
```
┌─────────────────────────────────────┐
│ 🔄 (spinning) Generating your       │
│    AI coaching plan…                │
│                                     │
│ This usually takes 15-30 seconds    │
└─────────────────────────────────────┘
```

**Styling:**
- Cyan/teal background with animation
- Spinning progress icon
- Body text: "Generating your AI coaching plan…"
- Subtext: "This usually takes 15-30 seconds"

**When Visible:**
- Appears immediately when the screen loads
- Disappears once coaching transitions to READY or FAILED state

#### State 2: READY
```
┌─────────────────────────────────────┐
│ ✓ AI coaching ready                 │
│                                     │
│ 6 phases • Strategy: interval       │
│ Tone: motivational • Watch: native  │
└─────────────────────────────────────┘
```

**Styling:**
- Green background
- Checkmark icon
- Main text: "AI coaching ready"
- Details row: Number of phases, cueing strategy, coaching tone, HR data availability

**When Visible:**
- Replaces GENERATING banner once coaching succeeds
- Tappable for long-press to regenerate if needed

#### State 3: FAILED
```
┌─────────────────────────────────────┐
│ ⚠️ Coaching generation failed        │
│                                     │
│ Connection error. Retry?            │
│                                     │
│ [RETRY] button                      │
└─────────────────────────────────────┘
```

**Styling:**
- Amber/orange background
- Warning icon
- Main text: "Coaching generation failed"
- Subtext: Reason (e.g. "Connection error", "Server error")
- Button: "RETRY" triggers `regenerateCoachingForWorkout(workoutId)`

---

### Section 3: Location Permission & GPS Acquisition

**Permission Check:**
- On screen load, request `CoreLocation` permission if not already granted
- Display a system permission prompt

**GPS Acquisition:**
- Once permission granted, request current location with high accuracy
- This runs in parallel with coaching generation — user sees both states simultaneously

**Visual Feedback:**
- Location status shown in button state (see button section below)

---

### Section 4: Action Buttons (Critical Logic)

The button behavior changes based on:
1. **Watch connectivity** — Is the Garmin companion app installed?
2. **Coaching state** — IDLE, GENERATING, READY, or FAILED?
3. **Location state** — Permission denied, acquiring GPS, GPS ready?

#### Button Logic Table

| Watch Connected | Coaching State | Location Ready | Primary Button | Secondary Button |
|---|---|---|---|---|
| Yes | GENERATING | N/A | **Prepare for Watch** (teal, filled) | Hidden |
| Yes | READY | Yes | **Prepare for Watch** (teal, filled) | "Start on Phone" (outlined, secondary) |
| Yes | READY | No | **Prepare for Watch** (teal, filled) | "Start on Phone" (disabled, outlined) |
| Yes | FAILED | Any | **Prepare for Watch** (disabled, teal) | Hidden |
| No | GENERATING | N/A | **Preparing AI Coaching…** (filled, primary) | N/A |
| No | READY | Yes | **Start on Phone** (filled, primary) | N/A |
| No | READY | No | Conditional button (location required) | N/A |
| No | FAILED | Any | Disabled state | N/A |

---

### Button States in Detail

#### 1. When Watch Is Connected

**Button 1: "Prepare for Watch"**
- **Always visible when** `companionInstalled == true`
- **Styling:** Teal background (cyan #00E5FF), filled, bold text, watch icon + text
- **Enabled when:** Coaching is READY (not GENERATING or FAILED)
- **Disabled visual:** Opacity reduced, no tap response
- **On tap:**
  1. Call `prepareRunOnWatchWithCoaching()` with workout metadata
  2. Send the coaching plan to the watch via BLE
  3. Set `WorkoutHolder.isWatchMode = true` (prevents phone auto-start)
  4. Navigate to RunSessionScreen
  5. RunSessionScreen waits for watch to send "start" command (does NOT auto-start)

**Button 2: "Start on Phone"**
- **Only visible when** watch is connected
- **Styling:** Secondary outlined button (dark background, light border)
- **Text:** "Start on Phone"
- **Enabled when:**
  - Coaching is READY
  - GPS is ready
  - Not acquiring GPS
- **Disabled visual:** Opacity reduced, no tap response
- **On tap:**
  1. Call `startRun(workout)`
  2. Set `WorkoutHolder.isWatchMode = false` (allows phone coaching)
  3. Navigate to RunSessionScreen
  4. RunSessionScreen starts coaching immediately on phone

---

#### 2. When No Watch Connected

**Single Button: Dynamic "Start on Phone"**
- **Always visible**
- **Styling:** Primary teal button (filled, bold text, play icon + text)
- **Button text changes based on state:**

| State | Text | Icon | Color | Enabled |
|---|---|---|---|---|
| Acquiring GPS | "Acquiring GPS…" | Spinner | Primary | No |
| Coaching Generating | "Preparing AI Coaching…" | Spinner | Primary | No |
| Location Required | "Location Required" | Location pin | Primary | No |
| Ready | "Start on Phone" | Play icon | Primary | Yes |
| Coaching Failed | "Start on Phone" | Play icon | Primary (faded) | No |

**On tap (when enabled):**
1. Call `startRun(workout)`
2. Set `WorkoutHolder.isWatchMode = false`
3. Navigate to RunSessionScreen
4. RunSessionScreen starts phone coaching immediately

---

### Section 5: Alternative Actions (Always Visible)

Below the primary start button, two secondary outlined buttons:

**Button: "Mark as Done (no GPS)"**
- Styling: Outlined, secondary colors
- Icon: Checkmark
- On tap: Call `markWorkoutComplete(workout)` → returns to plan view with checkmark
- Use case: User completed the workout offline (e.g. treadmill) and wants to log it

**Button: "Skip Session"**
- Styling: Outlined, secondary colors, text in muted gray
- Icon: X
- On tap: Call `skipWorkout(workout)` → removes from plan, logs skip reason
- Use case: User needs to defer or skip this session

---

## API Integration

### 1. Trigger AI Coaching Generation

**Endpoint:** `POST /api/workouts/{workoutId}/prepare-coaching`

**Timing:** Triggered in `onAppear` / `onLoad` of the workout detail screen

**Request Body:**
```json
{
  "hasWatchConnected": boolean
}
```

**Response:**
```json
{
  "workoutId": "string",
  "plan": {
    "sessionType": "string",
    "sessionGoal": "string",
    "coachingTone": "string",
    "cueingStrategy": "string",
    "preRunBrief": "string",
    "whyThisSession": "string",
    "phases": [
      {
        "name": "warmup|work|recovery|cooldown",
        "order": 0,
        "durationMinutes": 10.5,
        "distanceKm": 2.0,
        "targetPaceMin": 330,
        "targetPaceMax": 345,
        "targetHRMin": 120,
        "targetHRMax": 145,
        "effort": "easy|moderate|threshold|hard|max",
        "coachingFocus": "relaxation|power|rhythm|endurance|speed",
        "phaseInstructions": "string",
        "repetitions": 5
      }
    ],
    "triggers": [
      {
        "id": "string",
        "type": "phase_start|rep_start|hr_zone_high|pace_too_fast",
        "condition": "string",
        "message": "string",
        "frequency": "once|on_condition|periodic",
        "frequencySeconds": 120,
        "alternativeMessages": ["string"],
        "alertType": "vibrate|audio|none"
      }
    ],
    "targetMetrics": {
      "totalDurationMinutes": 45,
      "totalDistanceKm": 12.5,
      "primaryMetric": "pace|heart_rate|effort",
      "secondaryMetric": "string",
      "isSpeedWork": true,
      "isEnduranceWork": false
    },
    "coachingPolicy": {
      "primaryMetric": "pace",
      "cadenceTriggersAllowed": false,
      "elevationTriggersAllowed": true,
      "hrValidationRequired": true
    }
  },
  "cueingStrategy": "interval|threshold|paced|freerun",
  "coachingTone": "light_fun|direct|motivational|calm|serious|playful",
  "preRunBrief": "string",
  "whyThisSession": "string",
  "phasesCount": 6,
  "triggersCount": 24
}
```

**State Management:**
- On request: Set `coachingGenerationState = .GENERATING`
- On success: Set `coachingGenerationState = .READY` + store `activeSessionCoachingPlan`
- On failure: Set `coachingGenerationState = .FAILED`
- Cache check: Don't regenerate if already READY for this workoutId (unless user explicitly taps regenerate)

---

### 2. Prepare Run on Watch

**Endpoint:** `POST /api/workouts/{workoutId}/prepare-watch`

**Request Body:**
```json
{
  "workoutId": "string",
  "distanceKm": 5.0,
  "workoutType": "interval_training",
  "workoutIntensity": "threshold",
  "targetPace": "5:30/km",
  "intervalCount": 5,
  "intervalDistanceKm": 2.0,
  "intervalDurationSeconds": 600,
  "coachingPlan": { /* full DynamicSessionCoachingPlan object */ }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "string",
  "watchReady": true,
  "message": "Run prepared and sent to watch"
}
```

**Side Effects:**
- Sends coaching plan to watch via BLE
- Watch stores the plan locally
- Sets `WorkoutHolder.isWatchMode = true`
- Navigates to RunSessionScreen (watch will trigger start via BLE message)

---

### 3. Start Run on Phone

**Endpoint:** No direct call — data is passed to RunSessionScreen

**Data Passed:**
```swift
struct RunSetupConfig {
    let workoutId: String
    let activityType: String  // "run" or "walk"
    let targetDistance: Double // kilometers
    let hasTargetTime: Bool
    let targetHours: Int
    let targetMinutes: Int
    let targetSeconds: Int
    let coachingPlan: DynamicSessionCoachingPlan
    let isGroupRun: Bool
    // ... other fields
}
```

**Action:**
1. Package coaching plan into RunSetupConfig
2. Set `WorkoutHolder.isWatchMode = false`
3. Navigate to RunSessionScreen
4. RunSessionScreen uses coaching plan for all in-run AI coaching

---

## State Management Architecture

### ViewModel Properties (iOS Equivalent)

```swift
class WorkoutDetailViewModel: NSObject, ObservableObject {
    // Coaching generation state
    @Published var coachingGenerationState: CoachingGenerationState = .idle
    @Published var activeSessionCoachingPlan: DynamicSessionCoachingPlan?
    private var coachingGeneratedForWorkoutId: String?
    
    // Location state
    @Published var hasLocationPermission: Bool = false
    @Published var isGettingLocation: Bool = false
    @Published var gpsReady: Bool = false
    @Published var gpsError: String?
    
    // Watch state
    @Published var companionInstalled: Bool = false
    @Published var watchSendState: WatchSendState = .idle
    
    // Derived state
    var isCoachingGenerating: Bool { coachingGenerationState == .generating }
    var isCoachingReady: Bool { coachingGenerationState == .ready || coachingGenerationState == .failed }
    var canStart: Bool {
        hasLocationPermission && gpsReady && !isGettingLocation && isCoachingReady
    }
}

enum CoachingGenerationState {
    case idle
    case generating      // API call in progress
    case ready           // Plan generated successfully
    case failed          // Generation failed
}

enum WatchSendState {
    case idle
    case sending
    case sent
}
```

---

## Loading States & Progress Feedback

### Parallel Loading (Coaching + GPS)

Both processes run in parallel on screen load:

```
┌─────────────────────────────────────────────┐
│ COACHING:                                   │
│  t=0s: Idle                                 │
│  t=0.1s: Trigger generateCoachingForWorkout │
│  t=0.1-15s: GENERATING ← Show banner        │
│  t=15s: READY ← Show success banner         │
│                                             │
│ GPS:                                        │
│  t=0s: Check permission                     │
│  t=0-1s: Request if denied                  │
│  t=1s: Permission granted                   │
│  t=1-10s: Acquiring GPS ← Button shows text │
│  t=10s: Location acquired ← Button enables  │
└─────────────────────────────────────────────┘
```

### Button State While Loading

| Coaching | GPS | Button State |
|---|---|---|
| GENERATING | Acquiring | "Preparing AI Coaching…" (disabled) |
| GENERATING | Ready | "Preparing AI Coaching…" (disabled) |
| READY | Acquiring | "Acquiring GPS…" (disabled) |
| READY | Ready | "Start on Phone" (enabled) |
| READY | Denied | "Location Required" (disabled) |
| FAILED | Any | "Start on Phone" (disabled) |

---

## Coaching Brief Display

Once coaching is READY, show detailed info in the status banner:

**Information to Display:**
- Number of phases (e.g. "6 phases")
- Cueing strategy (e.g. "Strategy: interval", "Strategy: freerun", "Strategy: threshold")
- Coaching tone (e.g. "Tone: motivational", "Tone: calm", "Tone: playful")
- HR data source (e.g. "Watch: native HR", "Phone: wrist sensor", "Phone: chest strap")

**Format:**
```
✓ AI coaching ready
6 phases • Strategy: interval • Tone: motivational
```

---

## Long-Press / Regenerate Flow

When coaching is READY, user can long-press the coaching status banner to **force-regenerate** if they believe the plan is incorrect.

**Action:**
1. Show confirmation prompt: "Generate a fresh coaching plan? (This may take 30 seconds)"
2. User confirms
3. Call `regenerateCoachingForWorkout(workoutId, force: true)`
4. Server bypasses its cache and generates a brand-new plan
5. Banner transitions to GENERATING → READY

---

## Error Handling

### Coaching Generation Fails
- Display FAILED state banner with "Retry" button
- User can retry, which calls `regenerateCoachingForWorkout(workoutId)`
- If retry fails again, show error message with technical reason

### GPS Acquisition Fails
- Button shows "Location Required" or "Acquiring GPS…"
- User can try again (manual retry) or skip and proceed without GPS (disable location-based coaching features)

### Network Errors During Prepare for Watch
- Show error toast: "Failed to send to watch. Check Bluetooth connection."
- Button remains enabled to retry

---

## User Experience Flow (Watch Scenario)

```
User opens training plan → Tap workout
    ↓
WorkoutDetailScreen loads
    ├→ Trigger generateCoachingForWorkout(workoutId)
    └→ Request GPS permission + acquire location
    ↓
COACHING GENERATING + GPS ACQUIRING (parallel)
    ├→ Banner shows "Generating your AI coaching plan…"
    └→ Button shows state based on GPS progress
    ↓
Coaching READY + GPS Ready
    ├→ Banner shows "✓ AI coaching ready | 6 phases | Strategy: interval"
    └→ "Prepare for Watch" button (PRIMARY, teal, filled)
    └→ "Start on Phone" button (secondary, outlined)
    ↓
User taps "Prepare for Watch"
    ├→ Send coaching plan to watch via BLE
    ├→ Watch stores plan + waits for user to press START
    └→ Navigate to RunSessionScreen (watch-mode)
    ↓
RunSessionScreen (waiting for watch)
    ├→ Show "Waiting for watch to start…" message
    ├→ Display pre-run brief from coaching plan
    └→ User presses START on watch
        ↓
        Watch sends BLE "start" message
        ↓
        RunSessionScreen activates coaching
        ↓
        Live coaching from the generated session plan
```

---

## User Experience Flow (Phone Scenario)

```
User opens training plan → Tap workout
    ↓
WorkoutDetailScreen loads
    ├→ Trigger generateCoachingForWorkout(workoutId)
    └→ Request GPS permission + acquire location
    ↓
COACHING GENERATING + GPS ACQUIRING (parallel)
    ├→ Banner shows "Generating your AI coaching plan…"
    └→ Button shows "Acquiring GPS…" or "Preparing AI Coaching…"
    ↓
Coaching READY + GPS Ready
    ├→ Banner shows "✓ AI coaching ready | 6 phases | Strategy: interval"
    └→ "Start on Phone" button (PRIMARY, teal, filled, ENABLED)
    ↓
User taps "Start on Phone"
    ├→ Package RunSetupConfig with coaching plan
    ├→ Set isWatchMode = false
    └→ Navigate to RunSessionScreen (phone-mode)
    ↓
RunSessionScreen (no watch)
    ├→ Start location tracking immediately
    ├→ Display pre-run brief from coaching plan
    ├→ Activate live coaching from the generated session plan
    └→ All coaching feedback on phone (audio, visual, haptic)
```

---

## Key Implementation Notes for iOS

### 1. Loading Animation

The "Generating your AI coaching plan…" banner should have a subtle **pulsing cyan animation** to indicate work in progress. Use a repeating animation:

```swift
.opacity(isGenerating ? 1.0 : 0.5)
.animation(.easeInOut(duration: 0.9).repeatForever(), value: isGenerating)
```

### 2. Button Disabled States

Disabled buttons should:
- Reduce opacity to ~35% of full color
- Show no tap feedback
- Briefly display the reason in a tooltip if user attempts to tap

### 3. GPS Acquisition

Use `CLLocationManager` with `kCLLocationAccuracyBest` / `kCLLocationAccuracyNearestTenMeters`. Timeout after 30 seconds if no location acquired.

### 4. Permission Handling

Request location permission in this order:
1. Check if permission is already granted
2. If not, present permission prompt (system)
3. Wait for user response
4. Once granted, immediately start GPS acquisition
5. If denied, disable GPS-dependent features (show "Location Required" button state)

### 5. Coding Strategy & Cueing Strategy

The coaching plan includes:
- **coachingTone**: How the coach should speak (e.g. "motivational", "calm", "playful")
- **cueingStrategy**: How coaching is triggered ("interval", "threshold", "paced", "freerun")
- **phases**: Structured workout phases with HR/pace targets
- **triggers**: Coaching message conditions (phase start, HR zone high, pace deviation, etc.)

These should be **cached locally** once generated and used during the run by RunSessionScreen for live coaching.

### 6. Watch Preparation

When sending coaching plan to watch:
1. Serialize the entire `DynamicSessionCoachingPlan` object
2. Send via BLE as a binary payload (or JSON if supported)
3. Watch confirms receipt with ACK
4. Phone sets `isWatchMode = true` and navigates to run screen
5. Phone waits for watch to send "start" BLE message before activating coaching

### 7. Coaching Plan Caching

Cache the generated plan in:
- **Memory** (for current session use)
- **UserDefaults** / **Core Data** (for offline access if needed)
- **On-disk file** (for large plans > 50KB)

Key: `"coaching_plan_\(workoutId)"`

---

## Testing Checklist

- [ ] GenerateSession screen loads with correct workout data
- [ ] Coaching generation triggers automatically (GENERATING → READY)
- [ ] GPS permission requested if not already granted
- [ ] GPS acquisition starts immediately after permission granted
- [ ] Parallel loading: coaching and GPS acquire independently
- [ ] Button states match table above (enabled/disabled based on coaching + GPS state)
- [ ] Watch connected: "Prepare for Watch" button appears and sends coaching to watch
- [ ] Watch not connected: "Start on Phone" button appears as primary action
- [ ] "Preparing AI Coaching…" text + spinner shows while generating
- [ ] "Acquiring GPS…" text + spinner shows while acquiring location
- [ ] "Location Required" shows when permission denied
- [ ] "AI coaching ready" banner shows successful generation with phase/strategy/tone info
- [ ] Long-press on coaching banner regenerates plan (if implemented)
- [ ] Tapping "Prepare for Watch" navigates to RunSessionScreen in watch mode
- [ ] Tapping "Start on Phone" navigates to RunSessionScreen in phone mode
- [ ] "Mark as Done" button marks workout complete without running
- [ ] "Skip Session" button skips workout from the plan
- [ ] Navigate back dismisses screen without side effects
- [ ] Rapid screen transitions (open/close) don't cause state conflicts

---

## Files to Reference (Android)

- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/WorkoutDetailScreen.kt` — Full screen implementation
- `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSessionViewModel.kt` — Coaching generation logic
- `app/src/main/java/live/airuncoach/airuncoach/network/model/SessionCoachingModels.kt` — API models
- `app/src/main/java/live/airuncoach/airuncoach/ui/components/PrepareRunOnWatchButton.kt` — Watch button component

---

## Summary

The **Generate Session screen** is a critical user-facing interface that:
1. **Displays** the planned workout with its full description
2. **Triggers & shows progress** of AI coaching plan generation (with real-time feedback)
3. **Acquires GPS** location for run validation
4. **Routes to RunSessionScreen** with either watch or phone as the primary device

The experience should feel **immediate and responsive**, with clear visual feedback on both the coaching generation progress and GPS acquisition status. The coaching plan, once generated, is passed to RunSessionScreen and drives all subsequent in-run coaching behavior.
