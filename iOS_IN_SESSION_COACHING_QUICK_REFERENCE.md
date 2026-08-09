# iOS In-Session Coaching - Quick Reference

## Three APIs Required

```
1. POST /v1/coaching/talk-to-coach          (user asks questions)
2. POST /v1/coaching/interval-coaching      (automated interval guidance)
3. POST /v1/coaching/session-events         (log coaching delivered)
```

## Minimal CoachingContext for "Talk to Coach"

```swift
let context = CoachingContext(
    distance: 3.5,                    // km run so far
    duration: 1575,                   // seconds elapsed
    pace: "7:02/km",                  // average pace
    currentPace: "7:00/km",           // real-time pace
    targetPace: "6:30/km",            // target pace
    heartRate: 155,                   // current bpm
    cadence: isWalk ? nil : 178,      // ⭐ nil for walks!
    elevation: 45,                    // current elevation (m)
    elevationGain: 52,                // total m climbed
    activityType: isWalk ? "walk" : "run",  // CRITICAL
    phase: "main",                    // current phase
    isStruggling: false,              // self-reported difficulty
    coachName: "Alex",
    coachTone: "motivating"
)
```

## Core Metrics to Track (Every 1-2 Seconds)

```swift
struct SessionMetrics {
    var distance: Double           // km
    var duration: Int              // seconds
    var pace: String               // M:SS/km (average)
    var currentPace: String        // M:SS/km (real-time)
    var heartRate: Int?            // bpm
    var cadence: Int?              // spm (nil for walks)
    var elevation: Double          // meters
    var elevationGain: Double      // total m
}
```

## 1. Talk to Coach Flow

```
┌─────────────────┐
│ User says:      │
│ "Should I speed │
│  up?"           │
└────────┬────────┘
         │
         ├─► Capture current metrics
         ├─► Build CoachingContext
         │
┌────────▼────────┐
│ POST to         │
│ /talk-to-coach  │
└────────┬────────┘
         │
┌────────▼──────────────────┐
│ Response: "Yes, you can    │
│ push harder. You're 20s    │
│ off pace but HR is good."  │
└────────┬──────────────────┘
         │
         ├─► Display message
         ├─► Play audio
         └─► Log event
```

## 2. Interval Coaching Flow

```
╔═══════════════════════════╗
║ Rep 3 starts (work phase) ║
╚═════════════╤═════════════╝
              │
              ├─► Check: isWorkPhase = true
              ├─► Get current pace, HR, cadence
              ├─► Calculate distance in phase
              │
┌─────────────▼─────────────┐
│ POST to                   │
│ /interval-coaching        │
│ (every km or fixed time)  │
└─────────────┬─────────────┘
              │
┌─────────────▼──────────���───────┐
│ Response: "Rep 3 of 6. Pace     │
│ dropping—speed up 10 sec/km."   │
└─────────────┬──────────────────┘
              │
              ├─► Display message
              ├─► Play audio
              └─► Log event
```

## 3. Logging Coaching Events

```swift
let event = CoachingSessionEvent(
    runId: "run_12345",
    eventType: "interval_start",
    eventPhase: "interval_3_of_6",
    coachingMessage: "Rep 3 of 6. Push hard!",
    coachingAudioUrl: "https://...",
    userMetrics: [
        "distance": 3.2,
        "pace": "5:52/km",
        "heartRate": 175,
        "cadence": isWalk ? nil : 184,
        "activityType": isWalk ? "walk" : "run"
    ],
    userEngagement: "positive"  // optional
)

try await coachingAPI.logCoachingEvent(event)
```

## Critical: Cadence Handling

```swift
// ✅ FOR RUNS
let request = IntervalCoachingRequest(
    cadence: 185,  // Include value
    // ...
)

// ❌ FOR WALKS
let request = IntervalCoachingRequest(
    cadence: nil,  // Exclude (nil or 0)
    // ...
)
```

## Real-Time Metric Update Loop

```swift
timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    // GPS/location updates
    metrics.distance = calculateDistance()
    metrics.duration = Int(elapsedTime)
    metrics.elevation = getCurrentElevation()
    metrics.elevationGain = getTotalElevationGain()
    
    // Pace calculation
    metrics.pace = calculateAveragePace()
    metrics.currentPace = calculateCurrentPace()
    
    // Heart rate (from HealthKit/wearable)
    metrics.heartRate = getCurrentHR()
    
    // Cadence (only for runs)
    if activityType == "run" {
        metrics.cadence = calculateCadence()
    }
}
```

## Sending "Talk to Coach" Request

```swift
func talkToCoach(userMessage: String) async throws {
    // 1. Build context from current metrics
    let context = CoachingContext(
        distance: metrics.distance,
        duration: metrics.duration,
        pace: metrics.pace,
        currentPace: metrics.currentPace,
        heartRate: metrics.heartRate,
        cadence: activityType == "walk" ? nil : metrics.cadence,
        elevation: metrics.elevation,
        elevationGain: metrics.elevationGain,
        activityType: activityType,
        // ... other fields
    )
    
    // 2. Send request
    let request = TalkToCoachRequest(
        message: userMessage,
        context: context
    )
    
    let response = try await api.talkToCoach(request)
    
    // 3. Display & play
    displayMessage(response.message)
    if let audioUrl = response.audioUrl {
        playAudio(audioUrl)
    }
    
    // 4. Log event
    logCoachingEvent(
        type: "user_query",
        message: response.message
    )
}
```

## Sending Interval Coaching Request

```swift
func sendIntervalCoaching() async throws {
    let request = IntervalCoachingRequest(
        runId: sessionId,
        currentInterval: currentRep,
        totalIntervals: totalReps,
        isWorkPhase: isWorkingHard,
        currentPace: metrics.currentPace,
        targetPace: setupConfig.targetPace,
        distanceInPhase: distanceInCurrentRep,
        phaseDurationTarget: 1.0,  // 1km per rep
        heartRate: metrics.heartRate,
        cadence: activityType == "walk" ? nil : metrics.cadence,
        fatigueLevel: calculateFatigue(),
        activityType: activityType
    )
    
    let response = try await api.getIntervalCoaching(request)
    displayMessage(response.message)
    if let audioUrl = response.audioUrl {
        playAudio(audioUrl)
    }
}
```

## Activity Type-Specific Coaching

### RUN Session
```swift
let context = CoachingContext(
    cadence: 182,                      // ✅ Include
    workoutIntensity: "z3",            // ✅ Heart rate zones
    phase: "interval_2_of_6",          // ✅ Interval tracking
    activityType: "run",               // ✅ "run"
    // Coaching focuses on: pace, effort, performance
)
```

### WALK Session
```swift
let context = CoachingContext(
    cadence: nil,                      // ❌ Exclude
    workoutIntensity: nil,             // ❌ No zones
    phase: "main",                     // ✅ Simple phases
    activityType: "walk",              // ✅ "walk"
    // Coaching focuses on: enjoyment, recovery, comfort
)
```

## Validation Before Sending

```swift
func validateRequest(_ request: CoachingContext) -> Bool {
    // Activity type
    guard ["run", "walk"].contains(request.activityType?.lowercased() ?? "") else {
        return false
    }
    
    // Distance & duration
    guard (request.distance ?? 0) > 0,
          (request.duration ?? 0) > 0 else {
        return false
    }
    
    // Pace format
    guard request.currentPace?.contains("/km") == true else {
        return false
    }
    
    // Cadence only for runs
    if request.activityType == "walk" {
        // Should be nil
        return request.cadence == nil || request.cadence == 0
    }
    
    return true
}
```

## Expected Response Patterns

### Run Coaching
```json
{
  "message": "You're 20 seconds behind pace, but your HR is solid. 
              Focus on effort, not pace. The pace will come.",
  "emphasis": "pace",
  "immediateActions": ["speed_up"]
}
```

### Walk Coaching
```json
{
  "message": "Beautiful pace for a recovery walk. Just enjoy 
              the movement and the weather.",
  "emphasis": "form",
  "immediateActions": []
}
```

### Interval Coaching
```json
{
  "message": "Rep 3 of 6. You've got momentum—push for one more big effort!",
  "messageType": "work_phase",
  "emphasis": "pace",
  "immediateActions": ["speed_up"],
  "nextIntervalPreview": "Recovery rep coming next. Dial it back."
}
```

## Error Handling

```swift
func handleCoachingError(_ error: Error) {
    // Network error? Just continue the run
    Log.warning("Coaching request failed: \(error)")
    
    // Don't interrupt the user's run session
    // Coaching is nice-to-have, not critical
    
    // Still log that we tried
    logCoachingEvent(
        type: "coaching_error",
        message: error.localizedDescription
    )
}
```

## Data Dictionary

| Field | Type | Run | Walk | Example |
|-------|------|-----|------|---------|
| `distance` | Double | ✅ | ✅ | 3.5 |
| `currentPace` | String | ✅ | ✅ | "7:00/km" |
| `heartRate` | Int | ✅ | ✅ | 155 |
| `cadence` | Int | ✅ | ❌ | 178 |
| `elevation` | Double | ✅ | ✅ | 45 |
| `activityType` | String | "run" | "walk" | |
| `workoutIntensity` | String | ✅ | ❌ | "z3" |
| `phase` | String | ✅ | ✅ | "interval_2_of_6" |

## Key Differences Summary

| Aspect | Run | Walk |
|--------|-----|------|
| **activityType** | "run" | "walk" |
| **cadence** | Send value (spm) | Send nil/0 |
| **Intensity** | Zone-based (z1-z5) | Comfort-based |
| **Coaching tone** | "motivating" | "encouraging" |
| **Phase tracking** | "interval_X_of_Y" | "main" (simpler) |
| **Metrics focus** | Pace, HR, effort | Enjoyment, comfort |

---

**TL;DR**: Build CoachingContext from real-time metrics, always set `activityType` to "run" or "walk", exclude cadence for walks, and send it to `/talk-to-coach` or `/interval-coaching`. Log all coaching delivered to `/session-events` for post-run analysis.
