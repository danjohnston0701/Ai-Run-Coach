# iOS Run Session Save Process Brief for Xcode Agent

## Overview
iOS is currently failing when trying to save completed run sessions to the backend. This brief documents the **complete end-to-end process** for constructing and submitting run data with the full JSON structure, and how to handle database commits with related records.

---

## Architecture: Request Flow

```
iOS App (Session Data)
    ↓
[Construct Full JSON Payload]
    ↓
POST /api/runs (to Backend)
    ↓
Backend Validation & Deduplication
    ↓
[INSERT into runs table + Related Records]
    ↓
Response: 200 OK with saved Run object
```

---

## Step 1: Construct Full Run Session JSON Payload

### Required Fields (MUST HAVE)
```json
{
  "distance": <number>,           // kilometers (REQUIRED - must be > 0)
  "duration": <number>,            // milliseconds (Android sends ms, but server accepts and normalizes)
  "sessionType": "run"|"walk",     // lowercase string (defaults to "run")
  "startTime": <ISO8601|timestamp>, // e.g., "2026-08-02T10:30:00Z" or epoch ms
  "completedAt": <ISO8601|timestamp>
}
```

### Optional but Critical Fields (Highly Recommended)
```json
{
  "currentPace": "MM:SS/km",           // e.g., "7:30/km"
  "avgHeartRate": <number>,            // beats per minute
  "maxHeartRate": <number>,
  "cadence": <number>,                 // steps per minute (used to calculate totalSteps)
  "avgSpeed": <number>,                // km/h
  "maxSpeed": <number>,
  "calories": <number>,
  "elevation": <number>,               // meters
  "startLat": <number>,
  "startLng": <number>,
  "externalId": <string>,              // Garmin/Apple Watch activity ID (prevents duplicates)
  "externalSource": "garmin"|"apple"|"strava",
  
  // Key Running Metrics
  "totalSteps": <number>,              // Steps during run (calculated from cadence if not provided)
  "avgStrideLength": <number>,         // meters
  "minElevation": <number>,
  "maxElevation": <number>,
  "steepestIncline": <number>,         // percentage (renamed from maxInclinePercent)
  "steepestDecline": <number>,         // percentage (renamed from maxDeclinePercent)
  "movingTime": <number>,              // seconds
  "elapsedTime": <number>,             // seconds
  
  // Training Metrics
  "tss": <number>,                     // Training Stress Score
  "trainingEffect": <number>,          // Aerobic training effect (Garmin)
  "vo2MaxEstimate": <number>,
  "recoveryTimeMinutes": <number>
}
```

### GPS & Telemetry Data (Advanced)
```json
{
  "gpsTrack": [
    {
      "lat": <number>,
      "lng": <number>,
      "elevation": <number>,           // optional
      "timestamp": <number>,           // elapsed ms since run start
      "pace": "MM:SS/km",             // optional
      "heartRate": <number>           // optional - embedded HR at GPS point
    },
    // ... more points
  ],
  
  "heartRateData": [
    <number>,  // HR value in bpm at each second
    <number>,
    // ... one sample per second
  ],
  
  "cadenceData": [
    { "timestamp": <number>, "cadence": <number> },
    // ... cadence samples
  ],
  
  "paceData": [
    { "timestamp": <number>, "pace": <number> },
    // ... pace samples in sec/km
  ],
  
  "altitudeData": [
    { "timestamp": <number>, "value": <number> },
    // ... altitude samples
  ],
  
  "weatherData": {
    "temperature": <number>,
    "humidity": <number>,
    "windSpeed": <number>,
    "condition": "sunny"|"rainy"|...
  }
}
```

### AI Coaching & Engagement Data
```json
{
  "aiCoachingNotes": [
    {
      "time": <number>,                // elapsed milliseconds from run start (NOT epoch)
      "type": "cadence"|"hr"|"pace",
      "message": <string>,
      "coachName": <string>,
      "tone": <string>
    },
    // ... more coaching events
  ],
  
  "aiCoachEnabled": true,              // whether AI coaching was active
  
  "strugglePoints": [
    {
      "timestamp": <ISO8601|epoch>,
      "type": "fatigue"|"pace-drop"|...,
      "message": <string>
    }
  ]
}
```

### Planned Workout & Target Linking
```json
{
  "linkedWorkoutId": <string>,         // if this run is from a planned workout
  "linkedPlanId": <string>,            // if from a training plan
  "targetDistance": <number>,          // kilometers
  "targetTime": <number>,              // milliseconds
  "wasTargetAchieved": <boolean>,
  
  "groupRunId": <string>               // if part of a group run
}
```

### Device & Source Metadata
```json
{
  "external_id": <string>,             // alternative naming (snake_case)
  "external_source": <string>,
  "distance_meters": <number>,         // iOS sometimes sends meters instead of km
  "hasGarminData": <boolean>,
  "garminDeviceName": <string>,
  "difficulty": 1-5                    // subjective difficulty rating
}
```

---

## Step 2: Handle Distance & Duration Normalization

**CRITICAL**: The server implements smart detection for unit mismatches:

### Distance Handling
```
If iOS sends:
  - distance (kilometers) → used as-is
  - distance_meters → converted to kilometers

If implied speed > 15 m/s (impossible for running):
  - Assumes distance was sent as meters
  - Automatically converts: distance_km = distance_meters / 1000
```

**Action**: Ensure iOS sends `distance` in **kilometers**, not meters. If sending raw GPS meters, use `distance_meters` and the server will convert.

### Duration Handling
```
Server receives: duration value
Smart detection compares:
  - If treatedAsMs (duration > 1000 & consistent with actual elapsed time):
      durationInSeconds = duration / 1000
  - Else (duration in seconds):
      durationInSeconds = duration

Fallback: If startTime is unavailable:
  - duration > 86400 → treat as milliseconds
  - else → treat as seconds
```

**Action**: iOS should send `duration` in **milliseconds** to match Android's convention. The server will normalize automatically.

---

## Step 3: API Endpoint & HTTP Details

### Endpoint
```
POST /api/runs
Content-Type: application/json
Authorization: Bearer <auth_token>
```

### Example Request
```json
POST /api/runs HTTP/1.1
Host: api.airuncoach.com
Content-Type: application/json
Authorization: Bearer eyJhbGc...

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
  "aiCoachingNotes": [
    {
      "time": 300000,
      "type": "cadence",
      "message": "Nice pace! Keep that cadence steady.",
      "coachName": "Alex",
      "tone": "motivating"
    }
  ],
  "gpsTrack": [
    { "lat": 40.7128, "lng": -74.0060, "timestamp": 0, "heartRate": 155 },
    { "lat": 40.7138, "lng": -74.0070, "timestamp": 10000, "heartRate": 162 }
  ],
  "heartRateData": [155, 158, 162, 165, 168, ...],
  "externalId": "garmin_12345",
  "externalSource": "apple"
}
```

### Response: Success (200 OK)
```json
{
  "id": "run_abc123def456",
  "userId": "user_xyz",
  "distance": 10.5,
  "duration": 2700,
  "sessionType": "run",
  "startTime": "2026-08-02T08:00:00Z",
  "completedAt": "2026-08-02T08:45:00Z",
  "avgHeartRate": 165,
  "createdAt": "2026-08-02T08:46:00Z",
  "...": "other fields"
}
```

### Response: Validation Error (400)
```json
{
  "error": "Run must have a distance greater than 0. Please check your GPS data and try again.",
  "details": "No distance recorded during run session"
}
```

**Possible validation failures:**
- `distance <= 0` → Check GPS tracking was enabled
- Missing `distance` → Ensure distance field is present in payload
- Invalid `startTime`/`completedAt` → Use ISO 8601 or epoch timestamp format

---

## Step 4: Deduplication Logic (Handle Duplicate Uploads)

The backend uses **three-tier deduplication** to prevent duplicate runs:

### Tier 0: Exact External ID Match (Primary)
```
If externalId matches an existing run by the same user:
  → Merge missing fields from this upload into the existing record
  → Return existing run with updated data
  → Status: 200 (success, not inserted)
  
Benefit: Handles Garmin watch uploads + iPhone uploads of same run
```

### Tier 1: Rapid Retry Window (30 seconds)
```
If same user + same distance (within ±10% margin)
  + created within last 30 seconds:
  → Skip insertion, return existing
  
Benefit: Catches retry storms from exponential backoff
```

### Tier 2: Watch Battery Fallback (3 hours)
```
If watch run exists from Garmin companion
  + similar distance (within ±10%)
  + created within last 3 hours:
  → Merge phone's richer data into watch record
  
Benefit: Watch dies mid-run, phone uploads, both eventually sync
```

**Action for iOS**:
- Always send `externalId` if available (Apple Watch activity ID)
- Server handles duplicates automatically; you'll receive 200 OK either way
- If you get 200 OK but the run wasn't newly created, it's because a duplicate was detected and merged

---

## Step 5: Understanding Related Records & Automatic Cascades

When you POST a run, the backend automatically:

### 1. Creates the Run Record
```
INSERT INTO runs (
  userId, distance, duration, sessionType, startTime, 
  completedAt, avgHeartRate, cadence, gpsTrack, 
  heartRateData, aiCoachingNotes, ...
) VALUES (...)
```

### 2. Merges Coaching Notes
```
The aiCoachingNotes array is embedded in the run record 
as a JSONB column (PostgreSQL). No separate inserts needed.
```

### 3. Associates with Planned Workouts (Auto-Complete)
```
If linkedWorkoutId is provided:
  → Backend marks the planned_workout as completed
  → Links this run to the planned_workout record
  → Auto-completes interval-based sessions
```

### 4. Links to Group Runs
```
If groupRunId is provided:
  → Adds run to group_run_participants
  → Aggregates stats across all group participants
```

### 5. Creates AI Analysis Record
```
Backend triggers:
  POST /api/runs/:id/analysis (internally)
  → Generates comprehensive post-run analysis
  → Stores in run_analyses table
  → Enriches aerobic_decoupling, efficiency metrics, etc.
```

### 6. Updates Runner Profile
```
After successful run save:
  → Refreshes user's runner_profile
  → Updates consistency streak
  → Recalculates fitness averages
  → Updates "Last reviewed" timestamp
```

---

## Step 6: Error Handling & Retry Strategy

### HTTP Status Codes
| Code | Meaning | Action |
|------|---------|--------|
| **200** | Run saved or merged | Success; extract `id` from response |
| **400** | Validation error (distance, dates) | Check data format; don't retry |
| **401** | Auth token expired/invalid | Refresh token; retry with new token |
| **500** | Server error | Implement exponential backoff retry (3-5 attempts) |
| **503** | Server temporarily unavailable | Exponential backoff with longer delays |

### Recommended Retry Logic
```swift
// Pseudocode for iOS
let maxRetries = 5
var retryCount = 0
var delaySeconds = 2

repeat {
  do {
    let response = try await postRun(jsonPayload, token: authToken)
    if response.statusCode == 200 {
      print("Run saved: \(response.body.id)")
      break
    } else if response.statusCode == 401 {
      // Refresh token and retry once
      authToken = try await refreshAuthToken()
      continue
    } else if response.statusCode >= 500 {
      retryCount += 1
      if retryCount < maxRetries {
        sleep(delaySeconds)
        delaySeconds *= 2  // exponential backoff
        continue
      }
    } else if response.statusCode == 400 {
      // Validation error — don't retry
      throw RunValidationError(response.body.error)
    }
  } catch {
    retryCount += 1
    if retryCount < maxRetries {
      sleep(delaySeconds)
      delaySeconds *= 2
      continue
    } else {
      throw RunUploadError("Failed after \(maxRetries) retries: \(error)")
    }
  }
} while retryCount < maxRetries
```

### Handle Common Failures
| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `distance > 0` validation | GPS was off during run | Ensure location services enabled |
| `distance` missing | App crash before capturing | Check app initialization |
| `startTime` parse error | Invalid date format | Use ISO 8601: `2026-08-02T10:30:00Z` |
| `duration` incorrect | Milliseconds/seconds mismatch | Send duration in **milliseconds** |
| Duplicate run (200 OK) | Same external ID uploaded twice | Expected behavior; safe to ignore |

---

## Step 7: Field Naming Conventions (iOS vs Android)

**CRITICAL**: iOS and Android use **different field names**. Server handles both:

### Accepted Name Pairs (either name works)
```
iOS Name              ↔  Android Name / Alternative
─────────────────────────────────────────────────
startTime            ↔  start_time, started_at
endTime              ↔  end_time
distance_meters      ↔  (iOS sends meters, Android sends km)
distance             ↔  distance (same)
externalId           ↔  external_id
externalSource       ↔  external_source
sessionType          ↔  activityType (older Android)
maxInclinePercent    ↔  steepestIncline
maxDeclinePercent    ↔  steepestDecline
```

**Best Practice**: Use **camelCase** (iOS convention):
```json
{
  "startTime": "2026-08-02T08:00:00Z",
  "completedAt": "2026-08-02T08:45:00Z",
  "externalId": "apple_watch_12345",
  "externalSource": "apple"
}
```

---

## Step 8: Full Request-Response Cycle Example

### iOS Code Example
```swift
import Foundation

struct RunSession: Codable {
  let distance: Double
  let duration: Int              // milliseconds
  let sessionType: String        // "run" or "walk"
  let startTime: String          // ISO 8601
  let completedAt: String
  let currentPace: String?
  let avgHeartRate: Int?
  let maxHeartRate: Int?
  let cadence: Int?
  let calories: Int?
  let aiCoachingNotes: [CoachingNote]?
  let gpsTrack: [GPSPoint]?
  let heartRateData: [Int]?
  let externalId: String?
  let externalSource: String?
  let linkedWorkoutId: String?
}

struct CoachingNote: Codable {
  let time: Int                  // elapsed ms, NOT epoch
  let type: String
  let message: String
  let coachName: String?
}

struct GPSPoint: Codable {
  let lat: Double
  let lng: Double
  let timestamp: Int             // elapsed ms
  let heartRate: Int?
  let pace: String?
}

// Save function
func saveCompletedRun(session: RunSession, authToken: String) async throws -> String {
  let url = URL(string: "https://api.airuncoach.com/api/runs")!
  var request = URLRequest(url: url)
  request.httpMethod = "POST"
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
  
  let encoder = JSONEncoder()
  encoder.dateEncodingStrategy = .iso8601
  request.httpBody = try encoder.encode(session)
  
  let (data, response) = try await URLSession.shared.data(for: request)
  
  guard let httpResponse = response as? HTTPURLResponse else {
    throw RunUploadError.networkError
  }
  
  if httpResponse.statusCode == 200 {
    let decoder = JSONDecoder()
    let result = try decoder.decode([String: String].self, from: data)
    if let runId = result["id"] {
      return runId
    }
  } else if httpResponse.statusCode == 400 {
    let decoder = JSONDecoder()
    let error = try decoder.decode([String: String].self, from: data)
    throw RunUploadError.validationFailed(error["error"] ?? "Unknown error")
  }
  
  throw RunUploadError.unexpectedResponse(httpResponse.statusCode)
}
```

---

## Step 9: Testing Checklist

Before deploying iOS run-save functionality:

- [ ] **Distance validation**: Test with 0.0 km, 0.5 km, 10 km
- [ ] **Duration handling**: Send duration in milliseconds (e.g., 2700000 for 45 min)
- [ ] **Date formats**: Use ISO 8601 (`2026-08-02T10:30:00Z`)
- [ ] **GPS tracking**: Enable location services; ensure GPS points captured
- [ ] **Heart rate data**: Send 1 sample per second if available
- [ ] **Cadence calculation**: If totalSteps not provided, server calculates from `cadence * (duration / 60)`
- [ ] **Duplicate handling**: Upload same run twice; verify second returns 200 without duplication
- [ ] **Deduplication with externalId**: Provide `externalId` from Apple Watch; ensure merge works
- [ ] **Coaching notes timestamps**: Ensure `time` is elapsed ms from run start, NOT epoch
- [ ] **Error response parsing**: Test with missing distance field
- [ ] **Auth token refresh**: Ensure 401 errors trigger token refresh before retry
- [ ] **Exponential backoff**: Verify retry delays increase (2s → 4s → 8s)
- [ ] **Linked workout**: Test with `linkedWorkoutId` set; verify planned_workout auto-completes

---

## Summary of Key Points

1. **POST /api/runs** is the only endpoint needed to save a complete run session
2. **Always include**: `distance` (km) > 0, `duration` (ms), `startTime`, `completedAt`, `sessionType`
3. **Use camelCase** field names (iOS convention); server translates snake_case too
4. **Send duration in milliseconds**, distance in kilometers
5. **Include externalId** (Apple Watch ID) to enable deduplication and merging
6. **Coaching notes timestamps** must be elapsed ms from run start, NOT epoch timestamps
7. **Deduplication is automatic** — same external ID → 200 OK with merged data
8. **Server validates distance > 0** — check GPS was actually recorded
9. **Implement exponential backoff** for 5xx errors (2s → 4s → 8s delay)
10. **Related records** (planned workouts, runner profile, analysis) are created automatically

---

## Contact Points

- **Backend Coordinator**: Run save logic is in `POST /api/runs` (server/routes.ts line 2311)
- **Database Layer**: Deduplication & merging logic in `storage.ts createRun()`
- **AI Service**: Post-run analysis triggered after save; links via `linkedWorkoutId`
- **Runner Profile**: Auto-refreshed after every run save (affects consistency streak, fitness stats)

