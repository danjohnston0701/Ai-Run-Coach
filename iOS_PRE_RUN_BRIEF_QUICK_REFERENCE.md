# iOS Pre-Run Briefing - Quick Reference

## Minimum Required Fields

```swift
let request = PreRunBriefingRequest(
    startLocation: StartLocation(lat: 40.7128, lng: -74.0060),
    distance: 5.0,
    elevationGain: 120,
    elevationLoss: 110,
    maxGradientDegrees: 8.5,
    difficulty: "moderate",
    hasRoute: true,
    activityType: isWalk ? "walk" : "run",  // ⭐ CRITICAL
    targetTime: nil,                         // Optional
    targetPace: nil,                         // Optional
    firstTurnInstruction: nil,               // Optional
    weather: WeatherPayload(
        temp: 18,
        condition: "partly_cloudy",
        windSpeed: 12,
        timestamp: Date().milliseconds,
        userTimezoneId: TimeZone.current.identifier
    ),
    wellness: nil,                           // Optional but highly recommended
    coachName: nil,
    coachGender: nil,
    coachAccent: nil,
    coachTone: nil,
    trainingPlanId: nil,
    planGoalType: nil,
    planWeekNumber: nil,
    planTotalWeeks: nil,
    workoutType: nil,
    workoutIntensity: nil,
    workoutDescription: nil
)
```

## Setup Screen to Briefing Flow

```
┌─────────────────────────────┐
│  User selects RUN vs WALK   │
│  (activityType: String)     │
└──────────────┬──────────────┘
               │
               ├──► Extract GPS location
               ├──► Fetch weather data
               ├──► Get wellness data (HealthKit/Garmin)
               ├──► Calculate route stats (if route selected)
               │
┌──────────────▼──────────────┐
│  Build PreRunBriefingRequest│
│  with activityType = "run"  │
│  or activityType = "walk"   │
└──────────────┬──────────────┘
               │
        ┌──────▼──────┐
        │ POST to API │
        └──────┬──────┘
               │
┌──────────────▼──────────────────┐
│ Receive PreRunBriefingResponse  │
│ (walk-aware briefing text)      │
└──────────────┬──────────────────┘
               │
        ┌──────▼──────────────────────────────┐
        │ Display briefing + play audio       │
        │ (Hide cadence metrics for walks)    │
        └─────────────────────────────────────┘
```

## Critical Settings by Activity Type

### For RUN Sessions
```json
{
  "activityType": "run",
  "difficulty": "easy|moderate|hard|very_hard",
  "targetPace": "6:00/km",
  "workoutIntensity": "z1|z2|z3|z4|z5",
  "display": {
    "showCadence": true,
    "showHeartRateZones": true,
    "intensityLabel": "pace-based"
  }
}
```

### For WALK Sessions
```json
{
  "activityType": "walk",
  "difficulty": "easy",
  "targetPace": "4:00/km",
  "workoutIntensity": null,
  "display": {
    "showCadence": false,
    "showHeartRateZones": false,
    "intensityLabel": "comfort-based"
  }
}
```

## Response Usage

```swift
// Full briefing text (with readiness, warnings, etc.)
let displayText = response.getFullBriefingText(isWalk: isWalk)

// Shorter text for TTS
let speechText = response.getSpeechText(isWalk: isWalk)

// Play audio if available
if let audio = response.audio {
    let audioData = Data(base64Encoded: audio)
    playAudio(audioData)
} else {
    // Fallback to device TTS
    speak(speechText)
}
```

## Walk-Specific UI Adjustments

```swift
if activityType == "walk" {
    // Hide cadence ring/metric
    cadenceView.isHidden = true
    
    // Adjust pace labels
    paceLabel.text = "Pace (min/km)"  // Instead of "Pace (/km)"
    
    // Hide heart rate zones
    hrZoneView.isHidden = true
    
    // Simplify coaching focus
    coachingTitle.text = "Walk tips"   // Instead of "Run coaching"
    
    // Adjust button labels
    startButton.setTitle("Start Walk", for: .normal)
}
```

## Validation Before Sending

```swift
func validateBriefingRequest(_ request: PreRunBriefingRequest) -> Bool {
    // Activity type
    guard ["run", "walk"].contains(request.activityType.lowercased()) else { 
        return false 
    }
    
    // Location
    guard request.startLocation.lat >= -90 && request.startLocation.lat <= 90,
          request.startLocation.lng >= -180 && request.startLocation.lng <= 180 else {
        return false
    }
    
    // Distance
    guard request.distance ?? 0 > 0 else { return false }
    
    // Weather
    guard request.weather.temp >= -30 && request.weather.temp <= 50 else { 
        return false 
    }
    
    return true
}
```

## Common Response Patterns

### Run with Good Conditions
```
"You're ready for a solid 5km run at moderate pace. 
The weather is perfect—clear skies at 18°C. 
Your readiness score is high, so push for a good effort today."
```

### Walk with Recovery Focus
```
"You're all set for a lovely 3km walk. 
Enjoy the comfortable 22°C weather. 
This is a great recovery day—just relax and take your time."
```

### Run with Warnings
```
"You're heading out for a 5km run, but watch out—
the route has some steep climbs. 
Pace yourself and don't rush the hills."
```

## Timezone Handling

```swift
// Always include user's timezone for time-of-day analysis
let timezone = TimeZone.current.identifier  // "America/New_York"

let weather = WeatherPayload(
    temp: 18,
    condition: "partly_cloudy",
    windSpeed: 12,
    timestamp: Date().timeIntervalSince1970 * 1000,
    userTimezoneId: timezone  // ⭐ Include this
)
```

## Wellness Data Collection

```swift
// Optional but highly recommended for personalized briefings
let wellness = WellnessPayload(
    sleepHours: try await getLastNightSleep(),
    sleepQuality: try await getSleepQuality(),
    readinessScore: try await getReadinessScore(),
    stressLevel: try await getStressLevel(),
    restingHeartRate: try await getRHR(),
    bodyBattery: try await getBodyBattery()
)
```

## Error Recovery

```swift
func briefingFallback(activityType: String) -> String {
    if activityType.lowercased() == "walk" {
        return "Ready to walk! Tap Start when you're ready."
    } else {
        return "Ready to run! Tap Start when you're ready."
    }
}
```

## Testing Checklist

- [ ] Run session shows cadence metrics
- [ ] Walk session hides cadence metrics
- [ ] Briefing text says "walk" for walks, "run" for runs
- [ ] Audio plays correctly for both activity types
- [ ] Pace targets are realistic (5-7 km/h for walks, 5-12 km/h for runs)
- [ ] Wellness data is included if available
- [ ] Weather data is current (within last 30 minutes)
- [ ] GPS location is accurate
- [ ] Coach personality settings are applied

---

**Remember:** The `activityType` field is critical—it controls whether the coaching is walk-aware or run-focused throughout the entire session.
