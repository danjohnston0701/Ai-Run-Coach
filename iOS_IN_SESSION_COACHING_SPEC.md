# iOS In-Session Coaching Data Specification

## Overview

For iOS to receive the **same comprehensive in-session coaching, insights, and triggers** that Android gets, it needs to send rich session context data to the backend. This includes real-time metrics, run state, wellness data, and training plan information.

There are **three main in-session coaching APIs**:

1. **Talk to Coach** - User-initiated coaching requests
2. **Interval Coaching** - Automated coaching for interval/structured workouts
3. **Coaching Events** - Logging coaching delivered for post-run analysis

---

## 1. Talk to Coach (User-Initiated)

### Endpoint
```
POST https://api.airuncoach.live/v1/coaching/talk-to-coach
Content-Type: application/json
Authorization: Bearer {access_token}
```

### Request Model

```typescript
interface TalkToCoachRequest {
  message: string;              // User's question or request
  context: CoachingContext;     // Full session state at time of request
}

interface CoachingContext {
  // ─── Current Run Metrics ────────────────────────────────────
  distance?: number;            // km run so far
  duration?: number;            // seconds elapsed
  pace?: string;                // average pace (M:SS/km)
  currentPace?: string;         // real-time pace (M:SS/km)
  targetPace?: string;          // target pace (M:SS/km)
  totalDistance?: number;       // total session target distance
  
  // ─── Heart Rate & Effort ────────────────────────────────────
  heartRate?: number;           // current HR (bpm)
  avgHeartRate?: number;        // average HR
  maxHeartRate?: number;        // max HR during session
  minHeartRate?: number;        // min HR during session
  
  // ─── Cadence & Running Dynamics ──────────────────────────────
  // ⚠️ FOR WALKS: Only send if user doing a run
  cadence?: number;             // current cadence (steps/min)
  avgCadence?: number;          // average cadence
  maxCadence?: number;          // max cadence
  avgStrideLength?: number;     // meters
  avgGroundContactTime?: number; // milliseconds
  avgVerticalOscillation?: number; // centimeters
  
  // ─── Elevation & Terrain ────────────────────────────────────
  elevation?: number;           // current elevation (m)
  elevationChange?: string;     // "flat"|"hilly"|"mountainous"
  elevationGain?: number;       // total m climbed
  elevationLoss?: number;       // total m descended
  avgGradient?: number;         // average gradient %
  maxGradient?: number;         // steepest gradient %
  currentGrade?: number;        // current slope %
  
  // ─── Time Tracking ──────────────────────────────────────────
  targetTime?: number;          // target finish time (ms)
  elapsedTime?: number;         // elapsed time (seconds)
  movingTime?: number;          // moving time excluding pauses
  
  // ─── Environment & Weather ──────────────────────────────────
  weather?: WeatherData;        // current weather conditions
  
  // ─── Run State & Phase ──────────────────────────────────────
  phase?: string;               // "warmup"|"main"|"cooldown"|"interval_1_of_6"
  isStruggling?: boolean;       // user self-reported difficulty
  
  // ─── Activity Type (CRITICAL) ───────────────────────────────
  activityType?: string;        // "run" or "walk"
  workoutType?: string;         // "easy"|"tempo"|"intervals"|"long_run"
  workoutIntensity?: string;    // "z1"|"z2"|"z3"|"z4"|"z5"
  
  // ─── Energy & Training Effect ───────────────────────────────
  calories?: number;            // estimated burn
  aerobicTrainingEffect?: number;  // 0-5 scale
  anaerobicTrainingEffect?: number; // 0-5 scale
  trainingEffectLabel?: string; // "Recovery"|"Base"|"Tempo"
  recoveryTimeMinutes?: number; // minutes until recovery
  vo2MaxEstimate?: number;      // ml/kg/min
  
  // ─── Runner Profile ────────────────────────────────────────
  runnerAge?: number;
  runnerHeight?: number;        // cm
  runnerWeight?: number;        // kg
  userFitnessLevel?: string;    // "beginner"|"intermediate"|"advanced"
  coachName?: string;
  coachTone?: string;           // "motivating"|"analytical"|etc
  coachGender?: string;
  coachAccent?: string;
  
  // ─── Wellness (from HealthKit/Garmin) ──────────────────────
  wellness?: WellnessContext;   // sleep, stress, HRV, readiness
}

interface WellnessContext {
  sleepHours?: number;
  sleepQuality?: string;        // "poor"|"fair"|"good"|"excellent"
  sleepScore?: number;          // 0-100
  bodyBattery?: number;         // 0-100 (Garmin)
  stressLevel?: number;         // 0-100
  stressQualifier?: string;     // "low"|"medium"|"high"
  hrvStatus?: string;           // "imbalanced"|"balanced"|"balanced_high"
  hrvFeedback?: string;
  restingHeartRate?: number;    // bpm
  readinessScore?: number;      // 0-100
  readinessRecommendation?: string;
}

interface WeatherData {
  temp: number;                 // Celsius
  condition: string;            // "clear"|"cloudy"|"rainy"|etc
  windSpeed: number;            // km/h
}
```

### Response Model

```typescript
interface TalkToCoachResponse {
  message: string;              // Coaching response text
  audioUrl?: string;            // URL to TTS audio if generated
  tone?: string;                // Tone used ("motivating", "analytical", etc)
  actionItems?: string[];       // Suggested actions (e.g., "slow down", "relax")
  emphasis?: string;            // Focus area ("pace"|"hr"|"form"|"breathing")
}
```

### Example: User asks for pace guidance during run

```json
{
  "message": "Should I speed up? I'm doing 7:00/km and feeling okay",
  "context": {
    "distance": 3.5,
    "duration": 1575,
    "pace": "7:02/km",
    "currentPace": "7:00/km",
    "targetPace": "6:30/km",
    "heartRate": 155,
    "avgHeartRate": 152,
    "cadence": 178,
    "elevation": 45,
    "elevationGain": 52,
    "avgGradient": 1.2,
    "currentGrade": 2.5,
    "activityType": "run",
    "workoutType": "tempo",
    "workoutIntensity": "z3",
    "phase": "main",
    "isStruggling": false,
    "coachName": "Alex",
    "coachTone": "motivating"
  }
}
```

---

## 2. Interval Coaching (Structured Workouts)

### Endpoint
```
POST https://api.airuncoach.live/v1/coaching/interval-coaching
Content-Type: application/json
Authorization: Bearer {access_token}
```

### Request Model

```typescript
interface IntervalCoachingRequest {
  // ─── Interval Identification ────────────────────────────────
  runId: string;                // unique run ID
  currentInterval: number;      // which interval/rep (1-indexed)
  totalIntervals: number;       // total reps
  isWorkPhase: boolean;         // true for hard effort, false for recovery
  repNumber?: number;           // rep number if doing repeats
  
  // ─── Current Performance ────────────────────────────────────
  currentPace: string;          // M:SS/km
  targetPace?: string;          // M:SS/km for this phase
  distanceInPhase: number;      // km covered in current phase
  phaseDurationTarget?: number; // target km or seconds for phase
  
  // ─── Heart Rate & Effort ────────────────────────────────────
  heartRate?: number;           // current bpm
  targetHRMin?: number;         // min HR for this interval
  targetHRMax?: number;         // max HR for this interval
  
  // ─── Cadence (Run Only) ─────────────────────────────────────
  // ⚠️ FOR WALKS: Send null or 0
  cadence?: number;             // steps/min
  
  // ─── Fatigue & Environmental ────────────────────────────────
  fatigueLevel?: string;        // "fresh"|"moderate"|"high"
  elevationGain?: number;       // meters gained in interval
  
  // ─── Training Plan Context ──────────────────────────────────
  trainingPlanId?: string;
  workoutType?: string;         // "intervals"|"repeats"|"fartlek"
  
  // ─── Session Coaching Context ────────────────────────────────
  sessionCoachingTone?: string; // personality tone
  currentPhase?: string;        // "warmup"|"interval_2_of_6"|"recovery"
  userId?: string;              // for AI runner profile injection
  
  // ─── Wellness ────────────────────────────────────────────────
  wellnessContext?: WellnessPayload;
  
  // ─── Activity Type (CRITICAL) ───────────────────────────────
  activityType: string;         // "run" or "walk"
}
```

### Response Model

```typescript
interface IntervalCoachingResponse {
  message: string;              // Interval-specific coaching
  audioUrl?: string;            // TTS audio URL
  messageType: string;          // "interval_start"|"work_phase"|"recovery_start"|etc
  emphasis?: string;            // "pace"|"hr"|"form"|"breathing"
  immediateActions?: string[];  // ["speed_up"|"slow_down"|"relax"|"push"]
  nextIntervalPreview?: string; // prep for next interval
}
```

### Example: Interval coaching during workout

```json
{
  "runId": "run_12345",
  "currentInterval": 3,
  "totalIntervals": 6,
  "isWorkPhase": true,
  "currentPace": "5:45/km",
  "targetPace": "5:30/km",
  "distanceInPhase": 0.8,
  "phaseDurationTarget": 1.0,
  "heartRate": 178,
  "targetHRMin": 170,
  "targetHRMax": 185,
  "cadence": 185,
  "fatigueLevel": "moderate",
  "elevationGain": 15,
  "trainingPlanId": "plan_789",
  "workoutType": "intervals",
  "sessionCoachingTone": "motivating",
  "currentPhase": "interval_3_of_6",
  "activityType": "run"
}
```

Response:
```json
{
  "message": "You're on rep 3 of 6. Pace is dropping slightly—dig in and hit that 5:30 target. You've got this!",
  "messageType": "work_phase",
  "emphasis": "pace",
  "immediateActions": ["speed_up"],
  "nextIntervalPreview": "Next rep is your last one before the cooldown. Stay focused."
}
```

---

## 3. Coaching Events (Post-Run Analysis)

### Endpoint
```
POST https://api.airuncoach.live/v1/coaching/session-events
Content-Type: application/json
Authorization: Bearer {access_token}
```

### Request Model

```typescript
interface CoachingSessionEvent {
  runId: string;                    // unique run ID
  plannedWorkoutId?: string;        // linked training plan workout
  
  // ─── Event Details ──────────────────────────────────────────
  eventType: string;                // "interval_start"|"pace_coaching"|"recovery_guidance"|etc
  eventPhase?: string;              // "warmup"|"interval_2_of_6"|"cooldown"
  
  // ─── Coaching Delivered ─────────────────────────────────────
  coachingMessage?: string;         // actual message sent
  coachingAudioUrl?: string;        // audio URL
  toneUsed?: string;                // tone that was used
  
  // ─── User Metrics at Time of Coaching ───────────────────────
  userMetrics?: {
    distance: number;
    duration: number;
    pace: string;
    currentPace: string;
    heartRate: number;
    cadence?: number;              // null for walks
    elevation: number;
    elevationGain: number;
    activityType: string;           // "run" or "walk"
  };
  
  // ─── User Engagement ────────────────────────────────────────
  userEngagement?: string;          // "positive"|"neutral"|"struggled"
}
```

### Example: Log that interval coaching was delivered

```json
{
  "runId": "run_12345",
  "plannedWorkoutId": "workout_789",
  "eventType": "interval_start",
  "eventPhase": "interval_3_of_6",
  "coachingMessage": "Rep 3 of 6. Push hard for the next kilometer!",
  "coachingAudioUrl": "https://...",
  "toneUsed": "motivating",
  "userMetrics": {
    "distance": 3.2,
    "duration": 1440,
    "pace": "5:52/km",
    "currentPace": "5:45/km",
    "heartRate": 175,
    "cadence": 184,
    "elevation": 42,
    "elevationGain": 48,
    "activityType": "run"
  },
  "userEngagement": "positive"
}
```

---

## iOS Implementation Patterns

### 1. Real-Time Metric Collection

```swift
struct SessionMetrics {
    var distance: Double = 0
    var duration: Int = 0
    var pace: String = "0:00/km"
    var currentPace: String = "0:00/km"
    var heartRate: Int? = nil
    var cadence: Int? = nil            // nil for walks
    var elevation: Double = 0
    var elevationGain: Double = 0
    var cadenceValues: [Int] = []      // for averaging
    
    func toCoachingContext(
        isWalk: Bool,
        targetPace: String?,
        phase: String?,
        wellness: WellnessContext?
    ) -> CoachingContext {
        return CoachingContext(
            distance: distance,
            duration: duration,
            pace: pace,
            currentPace: currentPace,
            targetPace: targetPace,
            heartRate: heartRate,
            cadence: isWalk ? nil : cadence,  // ⭐ Exclude for walks
            elevation: elevation,
            elevationGain: elevationGain,
            activityType: isWalk ? "walk" : "run",
            phase: phase,
            wellness: wellness
        )
    }
}
```

### 2. Sending "Talk to Coach" Request

```swift
func talkToCoach(message: String) async throws {
    let context = metrics.toCoachingContext(
        isWalk: activityType == "walk",
        targetPace: setupConfig.targetPace,
        phase: currentPhase,
        wellness: wellnessData
    )
    
    let request = TalkToCoachRequest(
        message: message,
        context: context
    )
    
    let response = try await coachingAPI.talkToCoach(request)
    
    // Display coaching response
    displayCoaching(response.message)
    
    // Play audio if available
    if let audioUrl = response.audioUrl {
        try await playAudio(from: audioUrl)
    }
    
    // Log the event
    logCoachingEvent(
        type: "user_query",
        message: response.message,
        audioUrl: response.audioUrl
    )
}
```

### 3. Interval Coaching Loop (Every Km or Time-Based)

```swift
func sendIntervalCoachingIfNeeded() async {
    guard isIntervalWorkout else { return }
    guard shouldSendIntervalCoaching() else { return }
    
    let request = IntervalCoachingRequest(
        runId: sessionId,
        currentInterval: currentInterval,
        totalIntervals: totalIntervals,
        isWorkPhase: isWorkPhase,
        currentPace: metrics.currentPace,
        targetPace: setupConfig.targetPace,
        distanceInPhase: distanceInPhase,
        heartRate: metrics.heartRate,
        cadence: activityType == "walk" ? nil : metrics.cadence,
        fatigueLevel: determineFatigue(),
        activityType: activityType
    )
    
    let response = try await coachingAPI.getIntervalCoaching(request)
    
    displayIntervalCoaching(response.message)
    
    if let audioUrl = response.audioUrl {
        try await playAudio(from: audioUrl)
    }
}
```

### 4. Log Coaching Events (Post-Coaching Delivery)

```swift
func logCoachingEvent(
    type: String,
    message: String,
    audioUrl: String?
) async {
    let event = CoachingSessionEvent(
        runId: sessionId,
        plannedWorkoutId: trainingPlanId,
        eventType: type,
        eventPhase: currentPhase,
        coachingMessage: message,
        coachingAudioUrl: audioUrl,
        toneUsed: coachPersonality.tone,
        userMetrics: [
            "distance": metrics.distance,
            "duration": metrics.duration,
            "pace": metrics.pace,
            "currentPace": metrics.currentPace,
            "heartRate": metrics.heartRate ?? 0,
            "cadence": activityType == "walk" ? nil : metrics.cadence,
            "elevation": metrics.elevation,
            "elevationGain": metrics.elevationGain,
            "activityType": activityType
        ]
    )
    
    try await coachingAPI.logCoachingEvent(event)
}
```

---

## Critical Differences: Run vs Walk

### Cadence Handling

```swift
// FOR RUNS: Include cadence data
let request = IntervalCoachingRequest(
    cadence: metrics.cadence,  // ✅ Send value
    // ... other fields
)

// FOR WALKS: Exclude cadence (send nil/0)
let request = IntervalCoachingRequest(
    cadence: nil,  // ❌ Do not send
    // ... other fields
)
```

### Intensity & HR Zones

```swift
// FOR RUNS: Send HR zone targets
let request = IntervalCoachingRequest(
    targetHRMin: 160,  // ✅ Z3 range
    targetHRMax: 175,
    workoutIntensity: "z3"
)

// FOR WALKS: Simpler effort guidance
let request = IntervalCoachingRequest(
    targetHRMin: nil,  // ❌ Not zone-based
    targetHRMax: nil,
    // Just provide pace guidance
)
```

### Coaching Tone

```swift
// Adjust based on activity type
let tone = activityType == "walk" 
    ? "encouraging"    // Relaxed, enjoyment-focused
    : "motivating"     // Performance-focused
```

---

## Data Collection Best Practices

### 1. Update Metrics Frequently
```swift
// Update every 1-2 seconds from GPS/sensor updates
timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    metrics.distance = calculateDistance()
    metrics.duration = Int(elapsedTime)
    metrics.pace = calculateAveragePace()
    metrics.currentPace = calculateCurrentPace()
    metrics.heartRate = getCurrentHR()
    if activityType == "run" {
        metrics.cadence = getCurrentCadence()
    }
}
```

### 2. Calculate Running Dynamics Accurately
```swift
// Only for RUNS
func calculateRunDynamics() {
    let cadences = recentCadenceValues  // last 10 samples
    metrics.cadence = Int(cadences.average())
    metrics.avgCadence = Int(cadences.average())
    metrics.maxCadence = cadences.max() ?? 0
}
```

### 3. Include Wellness Data
```swift
// Query HealthKit/Garmin at session start
let wellness = WellnessContext(
    sleepHours: try await getLastNightSleep(),
    sleepQuality: try await getSleepQuality(),
    bodyBattery: try await getBodyBattery(),
    readinessScore: try await getReadinessScore()
)
```

### 4. Track Phase Changes
```swift
// Update phase as workout progresses
func updatePhase() {
    if totalElapsed < warmupDuration {
        currentPhase = "warmup"
    } else if isIntervalPhase {
        currentPhase = "interval_\(currentInterval)_of_\(totalIntervals)"
    } else if isRecovery {
        currentPhase = "recovery"
    } else {
        currentPhase = "cooldown"
    }
}
```

---

## Validation Checklist Before Sending Requests

- [ ] `activityType` is "run" or "walk"
- [ ] `distance` and `duration` are non-zero
- [ ] `currentPace` is formatted as "M:SS/km"
- [ ] For RUNS: `cadence` is included (40-200 spm range)
- [ ] For WALKS: `cadence` is null or 0
- [ ] `heartRate` is reasonable (30-220 bpm)
- [ ] `elevation` values are current and realistic
- [ ] `phase` matches session structure
- [ ] Wellness data is current (within last 24 hours)
- [ ] `message` in TalkToCoach is user's actual question

---

## Testing Scenarios

### Scenario 1: User asks for pace advice on a run
```
User: "I'm struggling on this tempo section, should I back off?"
Context: distance=4.5km, pace=6:15/km, target=6:00/km, HR=168
Expected: "You're 15 seconds off pace, but HR is elevated. 
          Back off 10 sec/km and find a sustainable rhythm."
```

### Scenario 2: Interval coaching during 6x1km repeats
```
Rep 3 starts: isWorkPhase=true, currentPace=5:45/km, target=5:30/km
Expected: "Rep 3 of 6. Push pace—you're 15 seconds behind target. 
          You can close this gap!"
```

### Scenario 3: Walk session coaching (no cadence)
```
Walk: distance=2.5km, pace=4:15/km, cadence=null, HR=110
Expected: "Great pace for a recovery walk. You're moving nicely at 
          4:15/km. Just enjoy the moment."
```

---

## Summary

iOS needs to send **comprehensive session context** (CoachingContext) to receive walk-aware in-session coaching. The three main APIs are:

1. **TalkToCoach** - User-initiated questions
2. **IntervalCoaching** - Automated workout structure guidance
3. **CoachingEvents** - Logging for post-run analysis

**Critical**: Always exclude cadence for walks, include it for runs. Always send `activityType` field so backend provides activity-appropriate coaching.

This ensures iOS gets the same personalized, walk-aware, real-time coaching that Android receives.
