# iOS Run Save - Quick Reference Card

## The Problem
iOS run session saves are failing. The backend expects a specific JSON structure with proper field names, units, and timestamps.

---

## The Solution: One Endpoint

```http
POST /api/runs
Authorization: Bearer <token>
Content-Type: application/json
```

---

## Minimal Payload (Just to Make It Work)

```json
{
  "distance": 10.5,              // KILOMETERS (required, > 0)
  "duration": 2700000,           // MILLISECONDS (45 mins = 2.7M ms)
  "sessionType": "run",          // or "walk"
  "startTime": "2026-08-02T08:00:00Z",
  "completedAt": "2026-08-02T08:45:00Z",
  "externalId": "apple_12345"    // Apple Watch ID (prevents dupes)
}
```

**Response on success:** `200 OK` with `{ "id": "run_abc123", ... }`

---

## Critical Unit Conversions

| Field | Required Unit | Example | Common Mistake |
|-------|---|---|---|
| `distance` | **Kilometers** | `10.5` | Sending `10500` meters |
| `duration` | **Milliseconds** | `2700000` | Sending `2700` seconds |
| `cadence` | **Steps/minute** | `175` | N/A |
| `timestamp` in `aiCoachingNotes.time` | **Elapsed ms from run start** | `300000` | Using epoch timestamp |
| `timestamp` in GPS/HR data | **Elapsed ms from run start** | `10000` | Using epoch timestamp |

---

## Full Recommended Payload

```json
{
  "distance": 10.5,
  "duration": 2700000,
  "sessionType": "run",
  "startTime": "2026-08-02T08:00:00Z",
  "completedAt": "2026-08-02T08:45:00Z",
  "currentPace": "7:30/km",
  "avgHeartRate": 165,
  "maxHeartRate": 180,
  "cadence": 175,
  "avgSpeed": 14.0,
  "calories": 850,
  "totalSteps": 7875,
  "externalId": "apple_12345",
  "externalSource": "apple",
  "linkedWorkoutId": "workout_xyz",
  
  "aiCoachingNotes": [
    {
      "time": 300000,              // ← Elapsed ms, NOT epoch!
      "type": "cadence",
      "message": "Keep it steady!",
      "coachName": "Alex"
    }
  ],
  
  "gpsTrack": [
    {
      "lat": 40.7128,
      "lng": -74.0060,
      "timestamp": 0,              // ← Elapsed ms
      "heartRate": 155
    }
  ],
  
  "heartRateData": [155, 158, 162, 165, 168],  // One per second
  
  "cadenceData": [
    { "timestamp": 0, "cadence": 170 }
  ]
}
```

---

## Field Naming: Use CamelCase (iOS Convention)

Server accepts both `camelCase` and `snake_case`, but prefer camelCase:

```swift
✓ "startTime"           // Good
✓ "start_time"         // Also accepted
✗ Mixed usage           // Confusing

✓ "externalId"         // Good
✓ "external_id"        // Also accepted

✓ "sessionType"        // Good
✓ "activityType"       // Also accepted (legacy Android)
```

---

## Validation Rules: Why It Fails

| Check | Example Failure | Fix |
|-------|---|---|
| `distance > 0` | 0 km sent | Enable GPS and ensure tracking occurred |
| `distance` missing | No field provided | Always include distance in km |
| `duration` wrong unit | 2700 (seconds) instead of 2700000 | Convert to milliseconds |
| `startTime` invalid | `08:00` instead of ISO 8601 | Use `2026-08-02T08:00:00Z` |
| `completedAt` invalid | epoch ms not parsed | Use ISO 8601 format |
| `aiCoachingNotes.time` epoch | `1722595200000` | Use **elapsed** ms, e.g., `300000` for 5 min mark |
| Duplicate run | Same `externalId` twice | Expected; server merges data, returns 200 OK |

---

## Handling Responses

### Success (200 OK)
```json
{
  "id": "run_abc123def456",
  "distance": 10.5,
  "duration": 2700,
  "avgHeartRate": 165,
  "createdAt": "2026-08-02T08:46:00Z"
}
```
**→ Extract `id` and store it locally**

### Duplicate Run (200 OK)
```json
{
  "id": "run_existing_id",
  "distance": 10.5,
  "duration": 2700,
  "mergedFields": ["aiCoachingNotes", "gpsTrack"]
}
```
**→ Same as success; server merged your data into existing run**

### Validation Error (400)
```json
{
  "error": "Run must have a distance greater than 0. Please check your GPS data and try again.",
  "details": "No distance recorded during run session"
}
```
**→ Check GPS was enabled; don't retry**

### Auth Error (401)
```json
{ "error": "Unauthorized" }
```
**→ Refresh token; retry request**

### Server Error (500 or 503)
**→ Use exponential backoff: wait 2s, 4s, 8s before retrying**

---

## Retry Strategy (Pseudocode)

```swift
var retries = 0
let maxRetries = 5
var backoffSeconds = 2

while retries < maxRetries {
  do {
    let response = try await POST("/api/runs", payload, token)
    
    if response.statusCode == 200 {
      print("✓ Run saved: \(response.id)")
      return response.id
    }
    
    if response.statusCode == 401 {
      token = try await refreshToken()
      continue  // Retry with new token
    }
    
    if response.statusCode >= 500 {
      sleep(backoffSeconds)
      backoffSeconds *= 2
      retries += 1
      continue
    }
    
    if response.statusCode == 400 {
      throw ValidationError(response.error)  // Don't retry
    }
    
  } catch {
    sleep(backoffSeconds)
    backoffSeconds *= 2
    retries += 1
  }
}

throw UploadFailedError("Failed after \(maxRetries) retries")
```

---

## Key Gotchas

| Gotcha | Why It's Bad | Solution |
|--------|---|---|
| Sending `distance_meters` without conversion | Server detects >15 m/s and auto-converts | Send `distance` in km, or use `distance_meters` if sending raw GPS meters |
| Using epoch timestamp for `aiCoachingNotes.time` | Backend calculates elapsed time wrong | Always use elapsed ms from run **start**, not calendar time |
| Forgetting `externalId` | Creates duplicate runs on retry or sync | Always include Apple Watch activity ID |
| `duration` in seconds instead of ms | 45-min run becomes 2700 ms (0.75 sec) | Multiply by 1000: `duration_seconds * 1000` |
| Missing `startTime` or `completedAt` | Can't parse run timeline | Use ISO 8601: `2026-08-02T08:00:00Z` |
| Empty GPS track or HR data | Loss of useful analytics | Include at least `heartRateData` array if available |

---

## Swift Code Template

```swift
import Foundation

struct RunPayload: Encodable {
  let distance: Double
  let duration: Int          // milliseconds!
  let sessionType: String
  let startTime: String      // ISO 8601
  let completedAt: String
  let currentPace: String?
  let avgHeartRate: Int?
  let maxHeartRate: Int?
  let externalId: String?
  let externalSource: String?
  let aiCoachingNotes: [CoachingNote]?
  let gpsTrack: [GPSPoint]?
  let heartRateData: [Int]?
}

struct CoachingNote: Encodable {
  let time: Int              // elapsed ms, NOT epoch
  let type: String
  let message: String
  let coachName: String?
}

struct GPSPoint: Encodable {
  let lat: Double
  let lng: Double
  let timestamp: Int         // elapsed ms
  let heartRate: Int?
}

func saveRun(payload: RunPayload, token: String) async throws -> String {
  var request = URLRequest(url: URL(string: "https://api.airuncoach.com/api/runs")!)
  request.httpMethod = "POST"
  request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  
  let encoder = JSONEncoder()
  encoder.dateEncodingStrategy = .iso8601
  request.httpBody = try encoder.encode(payload)
  
  let (data, response) = try await URLSession.shared.data(for: request)
  
  guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
    throw NSError(domain: "Run save failed", code: -1)
  }
  
  let result = try JSONDecoder().decode([String: String].self, from: data)
  return result["id"] ?? ""
}
```

---

## Success Checklist

- [ ] Distance sent in **kilometers** and > 0
- [ ] Duration sent in **milliseconds**
- [ ] Dates in ISO 8601 format (`YYYY-MM-DDTHH:MM:SSZ`)
- [ ] `externalId` included (Apple Watch ID)
- [ ] `aiCoachingNotes.time` in elapsed **milliseconds** from start
- [ ] GPS/HR timestamps in elapsed **milliseconds**, not epoch
- [ ] Using `camelCase` for field names
- [ ] Auth token included and valid
- [ ] Retrying on 5xx with exponential backoff
- [ ] Not retrying on 4xx validation errors

---

## When All Else Fails

Check the server logs at `POST /api/runs` handler (routes.ts:2311):

```
[POST /api/runs] Converted iOS distance_meters=10500 to distance=10.5km
[POST /api/runs] Duration normalization: raw=2700000 → 2700s (treated as ms)
[POST /api/runs] Distance detected as METERS → converting...
[POST /api/runs] Distance handling — received distance: 10.5km
```

These logs confirm the server received and processed your data. If you see validation errors, check distance > 0 and duration > 0.

