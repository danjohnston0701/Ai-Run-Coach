# iOS Pre-Run Brief: Complete API Specification

## Endpoint Summary

```
POST /api/briefing
Authorization: Bearer {authToken}
Content-Type: application/json
```

---

## Request Schema

### Request Body

```typescript
{
  // Location & Route Details
  startLocation: {
    lat: number,        // -90 to 90
    lng: number         // -180 to 180
  },
  
  // Route Metrics
  distance: number | null,           // kilometers (5.0, 10.5, etc.)
  elevationGain: number,             // meters (0, 120, 450, etc.)
  elevationLoss: number,             // meters
  maxGradientDegrees: number,        // steepest % grade (0-45+)
  difficulty: string,                // "flat" | "moderate" | "hilly" | "very_hilly"
  hasRoute: boolean,                 // user provided GPS route?
  
  // Activity Type
  activityType: string,              // "run" | "walk"
  
  // Optional: Pacing/Targets
  targetTime?: number,               // seconds (1800 = 30 min)
  targetPace?: string,               // "6:00/km" | "10:00/mile"
  
  // Weather Context
  weather?: {
    temp: number,                    // Celsius (-30 to 50)
    condition: string,               // "clear" | "cloudy" | "rainy" | "snowy" | "foggy"
    windSpeed: number,               // km/h (0-100+)
    timestamp?: number,              // epoch millis (for timezone-aware time-of-day)
    userTimezoneId?: string          // "America/New_York" | "Europe/London"
  },
  
  // Coach Personality
  coachName?: string,                // "Alex" | "Jamie" | "Morgan"
  coachGender?: string,              // "male" | "female" | "neutral"
  coachAccent?: string,              // "british" | "american" | "irish" | "australian"
  coachTone?: string,                // "energetic" | "calm" | "motivating" | "technical"
  
  // Optional: Training Plan Context
  trainingPlanId?: string,           // "plan_abc123"
  planGoalType?: string,             // "5k_race" | "marathon" | "general_fitness"
  planWeekNumber?: number,           // 1, 2, 3...
  planTotalWeeks?: number,           // 8, 12, 16...
  workoutType?: string,              // "easy" | "tempo" | "intervals" | "long_run"
  workoutIntensity?: string,         // "z1" | "z2" | "z3" | "z4" | "z5"
  workoutDescription?: string        // "20 min tempo at lactate threshold"
}
```

### Required Fields

```
✅ startLocation (lat, lng)
✅ elevationGain
✅ elevationLoss
✅ maxGradientDegrees
✅ difficulty
✅ hasRoute
✅ activityType

⚠️  distance (should provide, null is okay)
⚠️  coachName (should provide)
```

### Optional Fields

Everything else is optional and the API handles missing values gracefully.

---

## Response Schema

### Success Response (200 OK)

```typescript
{
  // Main coaching briefing (always present)
  briefing: string,                  // 2-3 sentences, max 40 words
  
  // Coaching advice (optional)
  intensityAdvice?: string,          // 1 sentence, ≤15 words
  weatherAdvice?: string,            // 1 sentence, ≤15 words  
  warnings?: string[],               // 0-3 warnings if applicable
  readinessInsight?: string,         // 1 sentence, ≤15 words
  routeInsight?: string,             // 1 sentence if hasRoute=true
  
  // Audio (optional TTS)
  audio?: string,                    // base64-encoded MP3 data
  format?: string,                   // "mp3" (if audio present)
  voice?: string                     // "british_female_energetic"
}
```

### Response Field Descriptions

| Field | Type | Always Present? | Example |
|-------|------|-----------------|---------|
| `briefing` | string | ✅ Yes | "Today's a tempo run at lactate threshold. We're doing 20 minutes at a hard but sustainable effort." |
| `intensityAdvice` | string | ❓ Sometimes | "Keep your heart rate in zone 3 (around 160-170 bpm). Push the pace but stay controlled." |
| `weatherAdvice` | string | ❓ Sometimes | "Light wind from the north. Expect a headwind on the way back." |
| `warnings` | array | ❓ Sometimes | `["Your body is showing some fatigue today."]` |
| `readinessInsight` | string | ❓ Sometimes | "You're in good shape for a solid effort." |
| `routeInsight` | string | ❓ If hasRoute=true | "Final 400m has an 8% gradient — save a little for the finish." |
| `audio` | string | ❓ Sometimes | `"SUQzBAAAI1MTRVDUkQk..."` (base64 MP3) |
| `format` | string | ❓ If audio present | `"mp3"` |
| `voice` | string | ❓ If audio present | `"british_female_energetic"` |

---

## Example Requests & Responses

### Example 1: Tempo Workout on a Route (Coached Plan)

**Request:**
```json
{
  "startLocation": { "lat": 40.7128, "lng": -74.0060 },
  "distance": 10.0,
  "elevationGain": 150,
  "elevationLoss": 150,
  "maxGradientDegrees": 5.2,
  "difficulty": "moderate",
  "hasRoute": true,
  "activityType": "run",
  "targetTime": 3600,
  "targetPace": "6:00/km",
  "weather": {
    "temp": 22,
    "condition": "cloudy",
    "windSpeed": 5,
    "timestamp": 1691234567000,
    "userTimezoneId": "America/New_York"
  },
  "coachName": "Alex",
  "coachGender": "female",
  "coachAccent": "british",
  "coachTone": "energetic",
  "trainingPlanId": "plan_abc123",
  "planGoalType": "10k_race",
  "planWeekNumber": 4,
  "planTotalWeeks": 12,
  "workoutType": "tempo",
  "workoutIntensity": "z3",
  "workoutDescription": "20 min tempo at lactate threshold"
}
```

**Response:**
```json
{
  "briefing": "Today's a tempo run at lactate threshold. We're doing 20 minutes at a hard but sustainable effort. The cloud cover means cooler conditions — perfect for pushing.",
  "intensityAdvice": "Keep your heart rate in zone 3 (around 160-170 bpm). Push the pace but stay controlled.",
  "weatherAdvice": "Light wind from the north. Expect a headwind on the way back — practice power on climbs.",
  "warnings": ["Your body is showing some fatigue today. Start conservatively and build in."],
  "readinessInsight": "You're in good shape for a solid effort.",
  "routeInsight": "Final 400m has an 8% gradient — save a little for the finish.",
  "audio": "SUQzBAAAI1MTRVDUkQkAC...",
  "format": "mp3",
  "voice": "british_female_energetic"
}
```

---

### Example 2: Easy Free Run (No Route)

**Request:**
```json
{
  "startLocation": { "lat": 40.7128, "lng": -74.0060 },
  "distance": 5.0,
  "elevationGain": 0,
  "elevationLoss": 0,
  "maxGradientDegrees": 0,
  "difficulty": "flat",
  "hasRoute": false,
  "activityType": "run",
  "weather": {
    "temp": 25,
    "condition": "sunny",
    "windSpeed": 2,
    "userTimezoneId": "America/Los_Angeles"
  },
  "coachName": "Alex",
  "coachGender": "female",
  "coachAccent": "american",
  "coachTone": "calm"
}
```

**Response:**
```json
{
  "briefing": "Beautiful day for a run, Alex. Just a relaxed 5km at conversational pace. Enjoy the sunshine!",
  "intensityAdvice": "Keep it easy and conversational. This is about enjoying the run.",
  "weatherAdvice": "Perfect running weather — sunny and warm. Hydrate well.",
  "warnings": [],
  "readinessInsight": "Your body is ready for a quality effort."
}
```

---

### Example 3: Hilly Route with Warnings

**Request:**
```json
{
  "startLocation": { "lat": 40.7128, "lng": -74.0060 },
  "distance": 8.0,
  "elevationGain": 450,
  "elevationLoss": 450,
  "maxGradientDegrees": 12.5,
  "difficulty": "very_hilly",
  "hasRoute": true,
  "activityType": "run",
  "weather": {
    "temp": 28,
    "condition": "sunny",
    "windSpeed": 15,
    "userTimezoneId": "America/New_York"
  },
  "coachName": "Morgan",
  "coachGender": "neutral",
  "coachTone": "motivating"
}
```

**Response:**
```json
{
  "briefing": "Challenging day on the hills! This is a 8km route with 450m of climbing. The wind is up, so expect some tough sections.",
  "intensityAdvice": "You're in charge here. Build intensity on the climbs, recover on the descents.",
  "weatherAdvice": "Strong wind today — watch your footing on downhills and practice side-to-side stability.",
  "warnings": [
    "Warm conditions — hydrate well every 5 minutes.",
    "Strong wind gusts expected. Be cautious on exposed ridges.",
    "Steep downhill (12.5° max gradient) — control your speed."
  ],
  "readinessInsight": "Your body has the energy for this challenge today.",
  "routeInsight": "Steepest section is 12.5° — aggressive downhill. Take your time and enjoy the descent."
}
```

---

### Example 4: Walk (Not a Run)

**Request:**
```json
{
  "startLocation": { "lat": 40.7128, "lng": -74.0060 },
  "distance": 3.0,
  "elevationGain": 50,
  "elevationLoss": 50,
  "maxGradientDegrees": 2.0,
  "difficulty": "flat",
  "hasRoute": true,
  "activityType": "walk",
  "weather": {
    "temp": 20,
    "condition": "cloudy",
    "windSpeed": 3,
    "userTimezoneId": "America/Chicago"
  },
  "coachName": "Jamie",
  "coachGender": "male",
  "coachAccent": "irish",
  "coachTone": "calm"
}
```

**Response:**
```json
{
  "briefing": "A lovely day for a walk, Jamie. Just 3km on a gentle route with minimal elevation. Take your time and enjoy the fresh air.",
  "intensityAdvice": "Walk at a comfortable, conversational pace. This is about relaxation and movement.",
  "weatherAdvice": "Cloudy and cool — perfect walking weather. You won't overheat.",
  "readinessInsight": "Your body is primed for a restorative walk today."
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing required fields",
  "details": "startLocation is required"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to generate pre-run briefing"
}
```

---

## Handling in iOS

### Decode the Response

```swift
let decoder = JSONDecoder()
let response = try decoder.decode(PreRunBriefResponse.self, from: data)
```

### Check Which Fields Are Present

```swift
if let briefing = response.briefing, !briefing.isEmpty {
    // Display main brief
    print(briefing)
}

if let intensity = response.intensityAdvice {
    print("💪 \(intensity)")
}

if let warnings = response.warnings, !warnings.isEmpty {
    for warning in warnings {
        print("⚠️ \(warning)")
    }
}
```

### Play Audio (Optional)

```swift
if let audioBase64 = response.audio, !audioBase64.isEmpty {
    guard let audioData = Data(base64Encoded: audioBase64) else { return }
    
    let tempFile = FileManager.default.temporaryDirectory
        .appendingPathComponent("briefing_\(UUID().uuidString).mp3")
    try audioData.write(to: tempFile)
    
    let player = try AVAudioPlayer(contentsOf: tempFile)
    player.play()
}
```

---

## Field Size Limits

| Field | Max Length | Notes |
|-------|-----------|-------|
| `briefing` | 200 chars | 2-3 sentences |
| `intensityAdvice` | 100 chars | 1 sentence |
| `weatherAdvice` | 100 chars | 1 sentence |
| `warnings[i]` | 100 chars | 1 per warning |
| `readinessInsight` | 100 chars | 1 sentence |
| `routeInsight` | 100 chars | 1 sentence |
| `audio` | 500 KB | base64 MP3 |

---

## Notes

1. **All `?` fields are optional** — iOS should safely handle missing values
2. **`briefing` is always present** — always display it
3. **`audio` is optional** — gracefully skip if not present or invalid base64
4. **`weather` can be null** — API handles missing weather gracefully
5. **`trainingPlanId` changes the response** — coach adds plan context if present
6. **`hasRoute=false` omits `routeInsight`** — don't expect it for free runs
7. **Warnings array can be empty** — only show if present and non-empty

---

## Testing with cURL

```bash
curl -X POST https://api.airuncoach.com/api/briefing \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startLocation": {"lat": 40.7128, "lng": -74.0060},
    "distance": 5.0,
    "elevationGain": 120,
    "elevationLoss": 110,
    "maxGradientDegrees": 4.5,
    "difficulty": "moderate",
    "hasRoute": true,
    "activityType": "run",
    "weather": {
      "temp": 22,
      "condition": "cloudy",
      "windSpeed": 5,
      "userTimezoneId": "America/New_York"
    },
    "coachName": "Alex",
    "coachGender": "female",
    "coachAccent": "british",
    "coachTone": "energetic"
  }'
```

---

## Postman Collection

**Method:** POST  
**URL:** `{{baseURL}}/api/briefing`  
**Auth:** Bearer Token `{{authToken}}`  
**Body (raw JSON):**

```json
{
  "startLocation": {"lat": 40.7128, "lng": -74.0060},
  "distance": 5.0,
  "elevationGain": 120,
  "elevationLoss": 110,
  "maxGradientDegrees": 4.5,
  "difficulty": "moderate",
  "hasRoute": true,
  "activityType": "run",
  "weather": {
    "temp": 22,
    "condition": "cloudy",
    "windSpeed": 5,
    "userTimezoneId": "America/New_York"
  },
  "coachName": "Alex",
  "coachGender": "female",
  "coachAccent": "british",
  "coachTone": "energetic"
}
```

---

**Done!** You now have the complete API specification to implement iOS pre-run briefs. 🎯
