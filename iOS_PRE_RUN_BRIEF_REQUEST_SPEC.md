# iOS Pre-Run Briefing API Request Specification

## Overview
The iOS app needs to send a `PreRunBriefingRequest` to `/api/v1/coaching/pre-run-briefing` to get a comprehensive AI-generated pre-run briefing tailored to the user's session (run or walk), route characteristics, weather conditions, and wellness status.

## Request Structure

### Endpoint
```
POST /api/v1/coaching/pre-run-briefing
Content-Type: application/json
```

### Request Body (JSON)

```json
{
  "startLocation": {
    "lat": 40.7128,
    "lng": -74.0060
  },
  "distance": 5.0,
  "elevationGain": 120,
  "elevationLoss": 110,
  "maxGradientDegrees": 8.5,
  "difficulty": "moderate",
  "hasRoute": true,
  "activityType": "run",
  "targetTime": 1800,
  "targetPace": "6:00/km",
  "firstTurnInstruction": "Turn left onto Broadway",
  "weather": {
    "temp": 18,
    "condition": "partly_cloudy",
    "windSpeed": 12,
    "timestamp": 1723000000000,
    "userTimezoneId": "America/New_York"
  },
  "wellness": {
    "sleepHours": 7.5,
    "sleepQuality": "good",
    "sleepScore": 82,
    "bodyBattery": 75,
    "stressLevel": 35,
    "stressQualifier": "low",
    "hrvStatus": "balanced",
    "hrvFeedback": "Your HRV is stable. Good day for harder efforts.",
    "restingHeartRate": 52,
    "readinessScore": 78,
    "readinessRecommendation": "Ready for a solid workout today"
  },
  "coachName": "Alex",
  "coachGender": "female",
  "coachAccent": "australian",
  "coachTone": "motivating",
  "trainingPlanId": "plan_12345",
  "planGoalType": "5k_race",
  "planWeekNumber": 8,
  "planTotalWeeks": 12,
  "workoutType": "tempo",
  "workoutIntensity": "z3",
  "workoutDescription": "Threshold pace work to build aerobic capacity"
}
```

## Field Descriptions

### Core Session Information

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startLocation` | Object | ✅ Yes | GPS coordinates of the run start point |
| `startLocation.lat` | Float | ✅ Yes | Latitude (-90 to 90) |
| `startLocation.lng` | Float | ✅ Yes | Longitude (-180 to 180) |
| `distance` | Float | ✅ Yes | Target distance in kilometers |
| `activityType` | String | ✅ Yes | **"run"** or **"walk"** - CRITICAL for walk-aware coaching |
| `hasRoute` | Boolean | ✅ Yes | True if the user selected a route, false for free runs |

### Route Characteristics

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `elevationGain` | Int | ✅ Yes | Total elevation gain in meters |
| `elevationLoss` | Int | ✅ Yes | Total elevation loss in meters |
| `maxGradientDegrees` | Float | ✅ Yes | Steepest gradient in degrees (0-90) |
| `difficulty` | String | ✅ Yes | Route difficulty: "easy", "moderate", "hard", "very_hard" |
| `firstTurnInstruction` | String | ❌ No | Navigation instruction for the first turn (or null for free runs) |

### Target Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetTime` | Int | ❌ No | Target duration in seconds (null if no time target) |
| `targetPace` | String | ❌ No | Target pace in format "m:ss/km" (e.g., "6:00/km") or null |

### Weather Information

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `weather` | Object | ✅ Yes | Current weather conditions at start location |
| `weather.temp` | Int | ✅ Yes | Temperature in Celsius |
| `weather.condition` | String | ✅ Yes | Condition: "clear", "partly_cloudy", "cloudy", "rainy", "snowy", "windy", "extreme_heat" |
| `weather.windSpeed` | Int | ✅ Yes | Wind speed in km/h |
| `weather.timestamp` | Long | ❌ No | Epoch milliseconds for timezone-aware time-of-day analysis |
| `weather.userTimezoneId` | String | ❌ No | User's timezone (e.g., "America/New_York", "Europe/London", "Australia/Auckland") |

### Wellness Information

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `wellness` | Object | ❌ No | Wellness data from wearable (Garmin, Apple Watch, etc.) |
| `wellness.sleepHours` | Float | ❌ No | Hours of sleep from previous night |
| `wellness.sleepQuality` | String | ❌ No | "poor", "fair", "good", "excellent" |
| `wellness.sleepScore` | Int | ❌ No | Sleep quality score (0-100) |
| `wellness.bodyBattery` | Int | ❌ No | Energy level (0-100) |
| `wellness.stressLevel` | Int | ❌ No | Stress level (0-100) |
| `wellness.stressQualifier` | String | ❌ No | "low", "medium", "high" |
| `wellness.hrvStatus` | String | ❌ No | "imbalanced", "balanced", "balanced_high" |
| `wellness.hrvFeedback` | String | ❌ No | AI interpretation of HRV status |
| `wellness.restingHeartRate` | Int | ❌ No | Resting heart rate in bpm |
| `wellness.readinessScore` | Int | ❌ No | Overall readiness score (0-100) |
| `wellness.readinessRecommendation` | String | ❌ No | AI recommendation based on readiness |

### Coach Personality Settings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `coachName` | String | ❌ No | Coach's name (e.g., "Alex", "Jordan", "Sam") |
| `coachGender` | String | ❌ No | "male", "female", "neutral" |
| `coachAccent` | String | ❌ No | "american", "british", "australian", "canadian" |
| `coachTone` | String | ❌ No | "motivating", "analytical", "encouraging", "conversational" |

### Training Plan Context (Optional)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trainingPlanId` | String | ❌ No | ID of the active training plan |
| `planGoalType` | String | ❌ No | Goal type: "5k_race", "10k_race", "half_marathon", "marathon", "general_fitness" |
| `planWeekNumber` | Int | ❌ No | Current week number in the plan (1-indexed) |
| `planTotalWeeks` | Int | ❌ No | Total weeks in the plan |
| `workoutType` | String | ❌ No | Type of this workout: "easy", "tempo", "intervals", "long_run", "recovery" |
| `workoutIntensity` | String | ❌ No | Zone: "z1", "z2", "z3", "z4", "z5" |
| `workoutDescription` | String | ❌ No | Description of the workout focus |

## Response Structure

### Success Response (200 OK)

```json
{
  "briefing": "You're heading out for a 5km run at a moderate pace. The weather is partly cloudy at 18°C with light winds—perfect running conditions. Based on your excellent sleep last night (7.5 hours) and solid readiness score of 78, you're in great shape for this tempo session.",
  "intensityAdvice": "Focus on maintaining a steady Z3 pace throughout. Your HRV looks balanced, so you can push a bit harder today. Aim for the target pace of 6:00/km.",
  "warnings": [
    "The route has some steep sections—pace yourself on the climbs"
  ],
  "readinessInsight": "Your body is well-recovered. This is a good day for threshold work.",
  "garminConnected": true,
  "audio": "base64_encoded_mp3_audio_string_here",
  "format": "mp3",
  "voice": "Joanna",
  "text": "You're heading out for a 5km run... [full text for TTS fallback]"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `briefing` | String | Main pre-run briefing text covering route, weather, and session context |
| `intensityAdvice` | String | Specific advice on pacing, intensity, and effort levels |
| `warnings` | Array | Safety or pacing warnings specific to the route |
| `readinessInsight` | String | Wellness-based insights (energy, recovery, stress) |
| `garminConnected` | Boolean | Whether Garmin data was available for generating the briefing |
| `audio` | String | Base64-encoded MP3 audio of the briefing (optional, if using TTS) |
| `format` | String | Audio format ("mp3" or null) |
| `voice` | String | TTS voice used ("Joanna", "Justin", etc.) |
| `text` | String | Fallback text for device TTS if audio not available |

## Implementation Notes for iOS

### 1. **Activity Type Selection (CRITICAL)**
```swift
// When user selects Walk vs Run on setup screen
let activityType = isWalk ? "walk" : "run"

// This MUST be passed to the briefing request
```

**Why this matters:**
- The backend generates walk-specific coaching ("ready to walk", no cadence advice, etc.)
- The iOS app should NOT show cadence metrics for walks
- Pace targets and intensity zones differ between runs and walks

### 2. **Location Acquisition**
```swift
// Use CLLocationManager for accurate GPS coordinates
let startLocation = StartLocation(
    lat: locationManager.location?.coordinate.latitude ?? 0,
    lng: locationManager.location?.coordinate.longitude ?? 0
)
```

### 3. **Route Data Extraction**
If the user selected a route:
```swift
let elevationGain = route.elevationGain  // Calculate from polyline
let maxGradient = route.maxGradient      // Degrees, not percentage
let difficulty = calculateDifficulty(elevation: route.elevationGain)
```

For free runs (no route):
```swift
let elevationGain = 0
let elevationLoss = 0
let maxGradientDegrees = 0.0
let difficulty = "easy"
let firstTurnInstruction = nil
```

### 4. **Weather Data**
```swift
// Use iOS WeatherKit or similar
let weather = WeatherPayload(
    temp: Int(weatherData.temperature.value),
    condition: mapWeatherCondition(weatherData.condition),
    windSpeed: Int(weatherData.wind.speed.value),
    timestamp: Date().timeIntervalSince1970 * 1000,  // Convert to milliseconds
    userTimezoneId: TimeZone.current.identifier      // e.g., "America/New_York"
)
```

### 5. **Wellness Data from HealthKit/Garmin**
```swift
// iOS can query HealthKit for sleep, heart rate, etc.
let wellness = try await fetchWellnessData()  // From HealthKit or Garmin SDK
```

### 6. **Coach Preferences**
```swift
// Load from user settings (stored in CoreData or UserDefaults)
let coachName = userSettings.coachName ?? "Alex"
let coachGender = userSettings.coachGender ?? "female"
```

### 7. **Handling the Response**
```swift
// Display the briefing text to the user
displayBriefing(response.getFullBriefingText(isWalk: activityType == "walk"))

// Play audio if available
if let audioData = response.audio {
    playAudio(audioData: audioData, format: response.format)
} else {
    // Fallback to device TTS
    speakText(response.getSpeechText(isWalk: activityType == "walk"))
}
```

## Example: Walk Session Request

For a walk session, the request should look like:

```json
{
  "startLocation": { "lat": 40.7128, "lng": -74.0060 },
  "distance": 3.0,
  "elevationGain": 45,
  "elevationLoss": 45,
  "maxGradientDegrees": 5.2,
  "difficulty": "easy",
  "hasRoute": false,
  "activityType": "walk",
  "targetTime": 1800,
  "targetPace": "4:00/km",
  "firstTurnInstruction": null,
  "weather": {
    "temp": 22,
    "condition": "clear",
    "windSpeed": 8,
    "timestamp": 1723000000000,
    "userTimezoneId": "America/New_York"
  },
  "wellness": {
    "sleepHours": 8.0,
    "sleepQuality": "excellent",
    "readinessScore": 85
  }
}
```

**Expected Response for Walk:**
```json
{
  "briefing": "You're set for a lovely 3km walk in clear weather. It's a warm 22°C with light breezes—perfect walking conditions. Your excellent sleep and high readiness score suggest you'll have a great outing today.",
  "intensityAdvice": "Focus on enjoying the walk at a comfortable pace around 4:00/km. This is a recovery-focused activity, so take your time and enjoy the scenery.",
  "warnings": [],
  "readinessInsight": "You're well-rested and ready for a relaxing session."
}
```

## Error Handling

If the briefing request fails:
```swift
// Return a sensible fallback
let fallbackBriefing = activityType == "walk" 
    ? "Ready to walk! Tap Start when you're ready."
    : "Ready to run! Tap Start when you're ready."
```

## Key Differences: Run vs Walk

| Aspect | Run | Walk |
|--------|-----|------|
| `activityType` | "run" | "walk" |
| Cadence coaching | ✅ Yes | ❌ No |
| Intensity zones | Z1-Z5 (HR-based) | Comfort-based only |
| Pace targets | 5:00-7:00/km typical | 3:30-5:00/km typical |
| Briefing tone | Performance-focused | Enjoyment-focused |
| Warnings | "Maintain steady pace on hills" | "Take your time, enjoy the walk" |

## Validation Checklist

Before sending the request:
- [ ] `activityType` is "run" or "walk"
- [ ] `distance` > 0
- [ ] `startLocation` has valid lat/lng
- [ ] `weather.temp` is reasonable (-30 to 50°C)
- [ ] `targetTime` is null or > 60 seconds
- [ ] If `hasRoute = false`, set `elevationGain`, `elevationLoss`, `firstTurnInstruction` to 0/null
- [ ] For walks, set realistic pace targets (3.5-5.5 km/h)
- [ ] Wellness data is current (from last 24 hours)

---

This specification ensures the iOS app generates comprehensive, personalized, activity-aware pre-run briefings that properly distinguish between run and walk sessions.
