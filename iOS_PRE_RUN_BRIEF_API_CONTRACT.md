# Pre-Run Briefing API Contract

## Endpoint

```
POST https://api.airuncoach.live/v1/coaching/pre-run-briefing
Content-Type: application/json
Authorization: Bearer {access_token}
```

## Request Payload (TypeScript/Swift Types)

```typescript
interface PreRunBriefingRequest {
  // Core Session Information (REQUIRED)
  startLocation: {
    lat: number;      // -90 to 90
    lng: number;      // -180 to 180
  };
  distance: number;   // kilometers, must be > 0
  activityType: "run" | "walk";  // ⭐ CRITICAL for walk-aware briefings
  hasRoute: boolean;  // true if user selected a route

  // Route Characteristics (REQUIRED, but 0 for free runs)
  elevationGain: number;        // meters
  elevationLoss: number;        // meters
  maxGradientDegrees: number;   // 0-90 degrees
  difficulty: "easy" | "moderate" | "hard" | "very_hard";

  // Target Parameters (OPTIONAL)
  targetTime?: number;          // seconds (null if no target)
  targetPace?: string;          // format: "m:ss/km" (e.g., "6:00/km")
  firstTurnInstruction?: string; // null for free runs

  // Weather (REQUIRED)
  weather: {
    temp: number;                    // Celsius, realistic range: -30 to 50
    condition: "clear" | "partly_cloudy" | "cloudy" | "rainy" | "snowy" | "windy" | "extreme_heat";
    windSpeed: number;               // km/h
    timestamp?: number;              // milliseconds since epoch (for timezone-aware analysis)
    userTimezoneId?: string;         // e.g., "America/New_York"
  };

  // Wellness Data (OPTIONAL but recommended)
  wellness?: {
    sleepHours?: number;             // hours
    sleepQuality?: "poor" | "fair" | "good" | "excellent";
    sleepScore?: number;             // 0-100
    bodyBattery?: number;            // 0-100 (Garmin)
    stressLevel?: number;            // 0-100
    stressQualifier?: "low" | "medium" | "high";
    hrvStatus?: "imbalanced" | "balanced" | "balanced_high";
    hrvFeedback?: string;
    restingHeartRate?: number;       // bpm
    readinessScore?: number;         // 0-100
    readinessRecommendation?: string;
  };

  // Coach Personality (OPTIONAL)
  coachName?: string;              // e.g., "Alex"
  coachGender?: "male" | "female" | "neutral";
  coachAccent?: "american" | "british" | "australian" | "canadian";
  coachTone?: "motivating" | "analytical" | "encouraging" | "conversational";

  // Training Plan Context (OPTIONAL)
  trainingPlanId?: string;
  planGoalType?: "5k_race" | "10k_race" | "half_marathon" | "marathon" | "general_fitness";
  planWeekNumber?: number;         // 1-indexed
  planTotalWeeks?: number;
  workoutType?: "easy" | "tempo" | "intervals" | "long_run" | "recovery";
  workoutIntensity?: "z1" | "z2" | "z3" | "z4" | "z5";
  workoutDescription?: string;
}
```

## Response Payload

```typescript
interface PreRunBriefingResponse {
  // AI-Generated Content
  briefing?: string;              // Main briefing, covers route & conditions
  intensityAdvice?: string;       // Pacing & effort guidance
  warnings?: string[];            // Specific warnings for this route
  readinessInsight?: string;      // Wellness-based insights
  
  // Audio Fields
  audio?: string;                 // Base64-encoded MP3 (optional)
  format?: string;                // "mp3" or null
  voice?: string;                 // TTS voice (e.g., "Joanna", "Justin")
  
  // Fallback Text (for device TTS)
  text?: string;                  // Full text for fallback TTS
  
  // Metadata
  garminConnected?: boolean;      // Whether Garmin data was available
}

// Helper Methods (to be implemented in iOS)
function getFullBriefingText(response: PreRunBriefingResponse, isWalk: boolean): string {
  // Compose from structured fields, with fallbacks
  // Returns walk-specific or run-specific text
}

function getSpeechText(response: PreRunBriefingResponse, isWalk: boolean): string {
  // Shorter version suitable for TTS
  // Returns walk-specific or run-specific text
}
```

## HTTP Response Codes

| Code | Meaning | Handling |
|------|---------|----------|
| 200 | Success | Use briefing response |
| 400 | Bad Request | Validate all required fields, especially `activityType` |
| 401 | Unauthorized | Refresh access token, retry |
| 429 | Rate Limited | Backoff and retry after 60 seconds |
| 500 | Server Error | Show fallback briefing, allow user to proceed |

## Example: Run Session Request

```json
{
  "startLocation": { "lat": 40.7128, "lng": -74.0060 },
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
    "restingHeartRate": 52,
    "readinessScore": 78,
    "readinessRecommendation": "Ready for a solid workout today"
  },
  "coachName": "Alex",
  "coachGender": "female",
  "coachAccent": "australian",
  "coachTone": "motivating"
}
```

### Expected Response (Run):
```json
{
  "briefing": "You're heading out for a 5km run at a moderate pace. The weather is partly cloudy at 18°C with light winds—perfect running conditions. Based on your excellent sleep and solid readiness score, you're in great shape for this tempo session.",
  "intensityAdvice": "Focus on maintaining a steady Z3 pace. Your HRV looks balanced, so you can push harder today. Aim for the target pace of 6:00/km.",
  "warnings": ["The route has some steep sections—pace yourself on the climbs"],
  "readinessInsight": "Your body is well-recovered. This is a good day for threshold work.",
  "garminConnected": true,
  "audio": "base64_mp3_string...",
  "format": "mp3",
  "voice": "Joanna",
  "text": "You're heading out for a 5km run... [fallback text]"
}
```

---

## Example: Walk Session Request

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
  },
  "coachName": "Jordan",
  "coachGender": "male",
  "coachAccent": "british",
  "coachTone": "encouraging"
}
```

### Expected Response (Walk):
```json
{
  "briefing": "You're all set for a lovely 3km walk. The weather is clear and warm at 22°C with light breezes—absolutely perfect walking conditions. Your excellent sleep and high readiness score suggest you'll have a great outing today.",
  "intensityAdvice": "Focus on enjoying the walk at a comfortable pace around 4:00/km. This is a recovery-focused activity, so take your time and enjoy the scenery. There's no pressure to hit any particular pace.",
  "warnings": [],
  "readinessInsight": "You're well-rested and full of energy. Perfect day for a relaxing walk.",
  "garminConnected": false,
  "audio": null,
  "format": null,
  "voice": null,
  "text": "You're all set for a lovely 3km walk... [fallback text]"
}
```

---

## Implementation Guidelines for iOS

### 1. Request Construction

```swift
func buildBriefingRequest(
    location: CLLocationCoordinate2D,
    activityType: String,  // "run" or "walk"
    distance: Double,
    route: Route?,
    weather: WeatherData,
    wellness: WellnessData?
) -> PreRunBriefingRequest {
    
    // Calculate elevation from route if available
    let (elevGain, elevLoss) = calculateElevation(route: route)
    
    return PreRunBriefingRequest(
        startLocation: StartLocation(lat: location.latitude, lng: location.longitude),
        distance: distance,
        elevationGain: elevGain,
        elevationLoss: elevLoss,
        maxGradientDegrees: route?.maxGradient ?? 0,
        difficulty: calculateDifficulty(elevation: elevGain),
        hasRoute: route != nil,
        activityType: activityType.lowercased(),  // "run" or "walk"
        targetTime: calculateTargetSeconds(userInput),
        targetPace: calculatePace(userInput, activityType),
        firstTurnInstruction: route?.firstTurn ?? nil,
        weather: WeatherPayload(
            temp: Int(weather.temperature),
            condition: mapWeatherCondition(weather.condition),
            windSpeed: Int(weather.windSpeed),
            timestamp: Date().millisecondsSince1970,
            userTimezoneId: TimeZone.current.identifier
        ),
        wellness: wellness
    )
}
```

### 2. API Call

```swift
func fetchPreRunBriefing(_ request: PreRunBriefingRequest) async throws -> PreRunBriefingResponse {
    var urlRequest = URLRequest(url: URL(string: "\(baseURL)/v1/coaching/pre-run-briefing")!)
    urlRequest.httpMethod = "POST"
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    urlRequest.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    
    let encoder = JSONEncoder()
    urlRequest.httpBody = try encoder.encode(request)
    
    let (data, response) = try await URLSession.shared.data(for: urlRequest)
    
    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
        throw APIError.invalidResponse
    }
    
    let decoder = JSONDecoder()
    return try decoder.decode(PreRunBriefingResponse.self, from: data)
}
```

### 3. Response Display

```swift
func displayBriefing(_ response: PreRunBriefingResponse, isWalk: Bool) {
    // Get appropriate text based on activity type
    let displayText = getFullBriefingText(response, isWalk: isWalk)
    briefingLabel.text = displayText
    
    // Play audio if available
    if let audioBase64 = response.audio,
       let audioData = Data(base64Encoded: audioBase64) {
        playAudio(audioData, format: response.format ?? "mp3")
    } else if let fallbackText = response.text {
        // Use device TTS
        speak(text: fallbackText)
    }
    
    // Update UI based on activity type
    if isWalk {
        cadenceView.isHidden = true
        intensityLabel.text = "Comfort level"
    } else {
        cadenceView.isHidden = false
        intensityLabel.text = "Target intensity"
    }
}
```

### 4. Error Handling

```swift
func fetchBriefingWithFallback(_ request: PreRunBriefingRequest, isWalk: Bool) async {
    do {
        let briefing = try await fetchPreRunBriefing(request)
        displayBriefing(briefing, isWalk: isWalk)
    } catch {
        // Show fallback briefing
        let fallback = isWalk ? "Ready to walk! Tap Start when you're ready." 
                              : "Ready to run! Tap Start when you're ready."
        briefingLabel.text = fallback
        speak(text: fallback)
    }
}
```

---

## Key Differences: Run vs Walk API Response

| Aspect | Run Response | Walk Response |
|--------|--------------|---------------|
| `briefing` | Performance/effort focused | Enjoyment/relaxation focused |
| `intensityAdvice` | Pace/HR zones emphasized | Comfort pace only |
| `warnings` | Hill/pace strategies | Recovery/energy preservation |
| `readinessInsight` | Training readiness | General wellness |
| Text includes | "run", "pace", "effort" | "walk", "comfortable", "enjoy" |

---

## Data Type Reference for iOS Implementation

```swift
// Foundation Types
typealias JSONString = String  // JSON-encoded base64 audio

// Custom Types
struct StartLocation: Codable {
    let lat: Double
    let lng: Double
}

struct WeatherPayload: Codable {
    let temp: Int
    let condition: String
    let windSpeed: Int
    let timestamp: Int64?
    let userTimezoneId: String?
}

struct WellnessPayload: Codable {
    let sleepHours: Double?
    let sleepQuality: String?
    let sleepScore: Int?
    let bodyBattery: Int?
    let stressLevel: Int?
    let stressQualifier: String?
    let hrvStatus: String?
    let hrvFeedback: String?
    let restingHeartRate: Int?
    let readinessScore: Int?
    let readinessRecommendation: String?
}
```

---

This API contract ensures iOS generates walk-aware pre-run briefings that are personalized, activity-appropriate, and provide comprehensive coaching context.
