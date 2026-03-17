# Interval Training Implementation Guide

## Overview

The AI Run Coach now has complete support for interval training workouts. When you run a 6x400m, 8x200m, or any distance-based interval session from your coaching plan, the system provides real-time coaching at every interval boundary.

## Architecture

### Data Flow

```
Training Plan (6x400m) 
  → RunSessionScreen (auto-starts)
    → RunSessionViewModel (tracks intervals)
      → triggerIntervalCoachingEvent()
        → /api/coaching/interval-coaching (server)
          → AI generates interval-specific coaching
            → Audio + Text response
              → Speaker + Coach Display
```

### What Happens During an Interval Run

1. **Run starts** — System detects `isIntervalWorkout = true` from training plan
2. **Distance tracked** — GPS updates position within current interval phase
3. **Phase changes detected** — When runner crosses interval boundaries
4. **Coaching triggered** — API call to generate interval-specific message
5. **Audio played** — Coach response played immediately via speaker
6. **Display updated** — Interval counter and phase shown on screen

## Key Features

### Interval Phase Detection

The system tracks:
- **Work phase**: The intense effort portion (e.g., 400m sprint)
- **Recovery phase**: The easy recovery jog between repeats
- **Current repetition**: Which rep you're on (e.g., "Rep 3 of 6")
- **Progress in phase**: Distance remaining to hit the target

```kotlin
// Example from 6x400m session:
isWorkPhase = true
currentInterval = 3
distanceInCurrentPhase = 0.25 km (250m into 400m sprint)
targetPace = 1:40/km
targetHeartRateMin = 165
targetHeartRateMax = 180
```

### Real-Time Coaching Triggers

Coaching is triggered at 4 key moments:

1. **Interval Start** (~first 50m)
   - "Rep 3 of 6: 400m interval. Target pace 1:40/km. Let's go!"
   - HR: "Get up to 165-180 bpm"

2. **Halfway Point** (~200m for 400m)
   - "You're crushing it. Keep this pace. 200m to go."

3. **Final Push** (~50m from end)
   - "50m to go: PUSH. Final sprint!"

4. **Recovery Start** (~first 50m of rest)
   - "Recovery phase: bring HR down to 130 bpm. Easy jog."
   - "Next rep in 90 seconds"

### Coaching Context

Each coaching request includes:

```json
{
  "currentInterval": 3,
  "totalIntervals": 6,
  "isWorkPhase": true,
  "currentPace": "1:38/km",
  "targetPace": "1:40/km",
  "heartRate": 172,
  "targetHRMin": 165,
  "targetHRMax": 180,
  "cadence": 165,
  "fatigueLevel": "fresh",
  "trainingPlanId": "plan_123",
  "workoutType": "intervals",
  "wellnessContext": {
    "sleepQuality": "good",
    "stressLevel": 32,
    "bodyBattery": 85,
    "restingHeartRate": 58
  }
}
```

## Data Model

### RunSetupConfig (Kotlin Android)

```kotlin
data class RunSetupConfig(
    val isIntervalWorkout: Boolean = false,
    val intervalCount: Int? = null,           // Total reps (6 for 6x400m)
    val intervalDistanceKm: Float? = null,    // Distance of hard effort (0.4 for 400m)
    val restDistanceKm: Float? = null,        // Recovery jog distance
    val intervalTargetPace: String? = null,   // e.g., "1:40/km"
    val restTargetPace: String? = null,       // e.g., "2:50/km"
    val intervalHeartRateMin: Int? = null,    // Min HR during work
    val intervalHeartRateMax: Int? = null,    // Max HR during work
    val restHeartRateMax: Int? = null,        // Max HR during recovery
    val trainingPlanId: String? = null,
    val workoutType: String? = null
)
```

### IntervalPhase (Runtime Tracking)

```kotlin
data class IntervalPhase(
    val currentInterval: Int,                 // 1-6
    val isWorkPhase: Boolean,                 // true = sprint, false = recovery
    val distanceInCurrentPhase: String,       // "0.25" km
    val timeInCurrentPhase: String,           // "02:15" elapsed
    val phaseDurationTarget: Float,           // 0.4 km or equivalent
    val targetPace: String?,                  // "1:40/km"
    val targetHeartRateMin: Int?,
    val targetHeartRateMax: Int?
)
```

### Server Models

**IntervalCoachingRequest:**
```typescript
interface IntervalCoachingRequest {
  runId: string;
  currentInterval: number;
  totalIntervals: number;
  isWorkPhase: boolean;
  currentPace: string;              // "1:38/km"
  targetPace: string;               // "1:40/km"
  distanceInPhase: number;          // km
  phaseDurationTarget: number;      // km
  heartRate: number;                // bpm
  targetHRMin: number;
  targetHRMax: number;
  cadence: number;
  fatigueLevel: "fresh" | "moderate" | "high";
  trainingPlanId: string;
  workoutType: string;
  wellnessContext: WellnessPayload;
}
```

**IntervalCoachingResponse:**
```typescript
interface IntervalCoachingResponse {
  message: string;
  audioUrl: string;
  intensity: "easy" | "moderate" | "hard";
  nextCheckDistance: number;  // km
  recommendedPace: string;
}
```

## Implementation Details

### Interval Detection Algorithm

```kotlin
// Calculate position within repeating cycle
val currentDistanceKm = session.getDistanceInKm()
val cycleDistanceKm = intervalDistanceKm + restDistanceKm
val positionInCycleKm = currentDistanceKm % cycleDistanceKm

// Determine phase
val isWorkPhase = positionInCycleKm < intervalDistanceKm

// Which rep?
val cyclesCompleted = (currentDistanceKm / cycleDistanceKm).toInt()
val currentInterval = cyclesCompleted + 1
```

**Example for 6x400m (rest = 200m jog):**
```
Total cycle = 400m + 200m = 600m

Distance  | Rep | Phase | Distance in Phase
----------|-----|-------|------------------
0m        | 1   | START | 0m
100m      | 1   | WORK  | 100m
400m      | 1   | END   | 400m → trigger recovery
500m      | 1   | REST  | 100m (recovery)
600m      | 1   | END   | 600m → trigger next rep
600m      | 2   | WORK  | 0m → trigger interval start
1000m     | 2   | WORK  | 400m
```

### Coaching Event Triggering

Events trigger when `distanceInPhaseKm < 0.05` (50m threshold):

1. **Work phase start** (< 50m into interval):
   - Triggers sprint-focused coaching
   - Emphasizes target pace and HR zone

2. **Recovery phase start** (< 50m into recovery):
   - Triggers relaxation/HR recovery coaching
   - Countdown to next rep

3. **Event debouncing**: Events only trigger once per phase transition (via position check)

## API Endpoint

**Endpoint:** `POST /api/coaching/interval-coaching`

**Request Body:** `IntervalCoachingRequest` (see above)

**Response:** `IntervalCoachingResponse` with:
- Text message (for display)
- Audio URL (if TTS enabled)
- Recommended pace adjustment
- Distance to next coaching check

**Example Response:**
```json
{
  "message": "Rep 3 of 6: 400m interval. You're at 1:38/km, target is 1:40 — ease back slightly. HR is 172, aiming for 165-180. Keep this rhythm.",
  "audioUrl": "https://api.example.com/audio/coaching_12345.mp3",
  "intensity": "hard",
  "nextCheckDistance": 0.35,
  "recommendedPace": "1:40/km"
}
```

## UI Display

### Interval Phase Card (RunSessionScreen)

When running an interval workout, a special card appears:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
║  REP 3 OF 6  ●  WORK PHASE              ║
├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┤
║  Distance in Rep:  ████░░░░  250m / 400m ║
║  Target Pace:      1:40/km   Actual: 1:38║
║  Target HR:        165-180   Current: 172║
║  Time in Rep:      02:15                  ║
├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┤
║  "You're crushing it. Keep this pace.    ║
║   200m to go. Let's finish strong."      ║
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Color coding:**
- **WORK phase**: Red/Orange background
- **RECOVERY phase**: Green/Cool background
- **Progress bar**: Fills as you complete the phase

## Testing Your 6x400m Session

### Setup
1. Create a coaching plan with a workout: **6x400m @ 1:40/km**
2. Set rest distance: **200m** (or auto-calculated 50%)
3. Target HR for work: **165-180 bpm**
4. Target HR for recovery: **< 140 bpm**

### During Run
1. Start the workout from coaching plan
2. Screen shows: "REP 1 OF 6 • WORK PHASE"
3. Coach says: "Rep 1 of 6: 400m interval. Target 1:40/km. Let's go!"
4. System tracks your pace vs target
5. At 200m: Coach offers mid-rep feedback
6. At 350m: "50m to go: PUSH!"
7. At 400m: "Recovery phase. Bring HR down."
8. Repeats for reps 2-6

### What You'll See
- Real-time phase indicator (WORK / RECOVERY)
- Progress bar toward phase target
- Current pace vs target pace
- Current HR vs target HR zone
- Live coaching text from AI coach
- Audio coaching from speaker (if enabled)

## Integration Points

### Android Client
1. **RunSessionViewModel.kt** — Tracks intervals, triggers coaching events
2. **RunSessionScreen.kt** — Displays interval phase card
3. **ApiService.kt** — Calls `/api/coaching/interval-coaching` endpoint
4. **IntervalCoachingModels.kt** — Request/response data classes

### Backend Server
1. **ai-service.ts** — `generateIntervalCoaching()` function
2. **routes.ts** — `POST /api/coaching/interval-coaching` endpoint
3. Uses existing coaching prompt system (zone-aware, wellness-aware)

## Future Enhancements

1. **Time-based intervals** — Support for "8x3min" tempo repeats
2. **Variable rest** — Different rest periods between reps
3. **Ladder workouts** — 400m, 800m, 1200m, 800m, 400m
4. **Floating intervals** — Rest period defined by HR recovery, not distance
5. **Split tracking** — Individual rep times displayed post-run
6. **Interval history** — Compare reps within same workout

## Troubleshooting

**Coaching isn't triggering?**
- Ensure `isIntervalWorkout = true` in RunSetupConfig
- Check that `intervalDistanceKm` is set (not null)
- Verify GPS is active and tracking distance

**Wrong intervals detected?**
- Confirm `intervalCount` and `intervalDistanceKm` match training plan
- Check rest distance (`restDistanceKm`) — should match actual rest effort

**Audio not playing?**
- Verify TTS is enabled and audio permission is granted
- Check speaker volume isn't muted
- Ensure internet connection for audio URL streaming
