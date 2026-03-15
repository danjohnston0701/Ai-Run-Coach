# Garmin Integration - API Reference

**Base URL**: `https://api.airuncoach.live`

---

## Authentication Endpoints

### 1. Get Authorization URL

```
POST /api/auth/garmin
Content-Type: application/json

{
  "redirectUrl": "airuncoach://garmin-callback"
}
```

**Response** (200):
```json
{
  "authorizationUrl": "https://connect.garmin.com/oauthConfirm?client_id=...&state=...",
  "stateId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Use**: Get this URL and open in browser/WebView for OAuth flow.

---

### 2. Handle OAuth Callback

```
GET /api/auth/garmin/callback?code=<auth_code>&state=<state_id>
```

**Response** (302 or 200):
```json
{
  "success": true,
  "userId": "user-id",
  "message": "Garmin device connected successfully",
  "device": {
    "id": "device-id",
    "name": "Garmin Fenix 7X",
    "lastSyncAt": "2026-03-15T19:30:00Z"
  }
}
```

**Use**: This is called automatically after user approves OAuth. System handles redirect back to app.

---

## Device Management Endpoints

### 3. List Connected Devices

```
GET /api/garmin/devices
Authorization: Bearer <user_token>
```

**Response** (200):
```json
{
  "devices": [
    {
      "id": "device-id-1",
      "name": "Garmin Fenix 7X",
      "deviceType": "WATCH",
      "manufacturer": "Garmin",
      "isConnected": true,
      "lastSyncAt": "2026-03-15T19:45:00Z",
      "connectedAt": "2026-02-15T10:00:00Z"
    },
    {
      "id": "device-id-2",
      "name": "Garmin Edge 830",
      "deviceType": "BIKE_COMPUTER",
      "manufacturer": "Garmin",
      "isConnected": false,
      "lastSyncAt": "2026-02-20T14:30:00Z",
      "connectedAt": "2025-12-01T08:00:00Z"
    }
  ]
}
```

**Status Codes**:
- `200`: Success
- `401`: Unauthorized
- `403`: Forbidden

---

### 4. Disconnect Device

```
DELETE /api/garmin/devices/:deviceId
Authorization: Bearer <user_token>
```

**Response** (200):
```json
{
  "success": true,
  "message": "Device disconnected successfully",
  "deviceId": "device-id-1"
}
```

**Status Codes**:
- `200`: Success
- `401`: Unauthorized
- `404`: Device not found

---

## Activity & Run Management Endpoints

### 5. List Garmin Activities

```
GET /api/garmin/activities?days=7&limit=20
Authorization: Bearer <user_token>
```

**Query Parameters**:
- `days`: Number of days to look back (default: 7)
- `limit`: Max activities to return (default: 20, max: 100)

**Response** (200):
```json
{
  "activities": [
    {
      "activityId": "garmin-123456",
      "name": "Morning Run",
      "activityType": "RUNNING",
      "startTime": "2026-03-15T06:00:00Z",
      "distanceInMeters": 5200,
      "durationInSeconds": 1800,
      "averageHeartRateInBeatsPerMinute": 145,
      "maxHeartRateInBeatsPerMinute": 165,
      "minHeartRateInBeatsPerMinute": 130,
      "caloriesBurned": 450,
      "elevationGainInMeters": 45,
      "averageRunningCadenceInStepsPerMinute": 172,
      "hasEpochData": true,
      "linkedToRunId": "run-xyz"
    }
  ]
}
```

**Status Codes**:
- `200`: Success
- `401`: Unauthorized
- `429`: Rate limited (try again in 60 seconds)

---

### 6. Enrich Run with Garmin Data

```
POST /api/runs/:runId/enrich-with-garmin-data
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Path Parameters**:
- `runId`: The AI Run Coach run ID to enrich

**Request Body** (optional - usually empty):
```json
{}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Run enriched with Garmin data",
  "run": {
    "id": "run-xyz",
    "name": "My Morning Run",
    "distanceInMeters": 5150,
    "durationInSeconds": 1800,
    "averageHeartRateInBeatsPerMinute": 148,
    "maxHeartRateInBeatsPerMinute": 165,
    "minHeartRateInBeatsPerMinute": 128,
    "averageCadenceInStepsPerMinute": 172,
    "maxCadenceInStepsPerMinute": 185,
    "elevationGainInMeters": 48,
    "elevationLossInMeters": 45,
    "activeCaloriesInKilocalories": 452,
    "hasGarminData": true,
    "garminActivityId": "garmin-123456",
    "enrichedAt": "2026-03-15T19:30:05Z"
  }
}
```

**Error Responses**:

```json
// 404 - Run not found
{
  "error": "Run not found",
  "runId": "run-xyz"
}
```

```json
// 400 - No matching Garmin activity
{
  "error": "No matching Garmin activity found within ±10 minutes",
  "runStartTime": "2026-03-15T06:00:00Z",
  "searchedRange": ["2026-03-15T05:50:00Z", "2026-03-15T06:10:00Z"]
}
```

```json
// 403 - No Garmin connected
{
  "error": "No Garmin device connected for this user",
  "suggestion": "Connect a Garmin device first"
}
```

**Status Codes**:
- `200`: Success
- `400`: Bad request (no matching activity)
- `401`: Unauthorized
- `403`: No Garmin device connected
- `404`: Run not found
- `409`: Run already has Garmin data

---

## Monitoring & Webhook Endpoints

### 7. Get Webhook Statistics

```
GET /api/garmin/webhook-stats?days=7
Authorization: Bearer <admin_token>
```

**Query Parameters**:
- `days`: Number of days to report (default: 1, options: 1, 7, 30)

**Response** (200):
```json
{
  "period": "7d",
  "stats": {
    "totalReceived": 245,
    "totalCreated": 32,
    "totalMerged": 198,
    "totalFailed": 5,
    "totalSkipped": 10,
    "averageMatchScore": 87.3,
    "matchRate": "92.1%",
    "averageProcessingTimeMs": 245,
    "totalProcessingTimeMs": 60025,
    "oldestEvent": "2026-03-08T19:30:00Z",
    "newestEvent": "2026-03-15T19:30:00Z"
  },
  "recentEvents": [
    {
      "timestamp": "2026-03-15T19:30:00Z",
      "activityId": "garmin-123456",
      "userId": "user-id",
      "deviceId": "device-id",
      "status": "merged_run",
      "matchScore": 95,
      "activityType": "RUNNING",
      "distance": 5200,
      "duration": 1800,
      "linkedRunId": "run-xyz",
      "errorMessage": null
    },
    {
      "timestamp": "2026-03-15T19:25:00Z",
      "activityId": "garmin-123455",
      "userId": "user-id-2",
      "deviceId": "device-id-2",
      "status": "created_run",
      "matchScore": null,
      "activityType": "WALKING",
      "distance": 2100,
      "duration": 900,
      "linkedRunId": null,
      "newRunId": "run-abc",
      "errorMessage": null
    }
  ]
}
```

---

### 8. Test Webhook Locally

```
POST /api/garmin/webhook-test
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "activities": [
    {
      "userId": "user-id",
      "summaryId": "activity-123",
      "activityName": "Test Run",
      "activityType": "RUNNING",
      "startTimeInSeconds": 1773486000,
      "durationInSeconds": 1800,
      "distanceInMeters": 5000,
      "calories": 450,
      "steps": 6000,
      "averageHeartRateInBeatsPerMinute": 145
    }
  ]
}
```

**Response** (200):
```json
{
  "success": true,
  "eventId": "webhook-test-123",
  "processed": true,
  "result": {
    "status": "merged_run",
    "matchScore": 92,
    "linkedRunId": "run-xyz"
  },
  "processingTimeMs": 245
}
```

---

## Error Codes & Messages

| Code | Message | Cause | Solution |
|------|---------|-------|----------|
| 400 | Missing authorization code | OAuth didn't provide code | Restart OAuth flow |
| 401 | Invalid or expired token | Auth token invalid | Re-authenticate user |
| 403 | No Garmin device connected | User hasn't connected Garmin | Guide user to connect device |
| 404 | Device not found | Device ID doesn't exist | Fetch fresh device list |
| 404 | Run not found | Run ID doesn't exist | Verify run ID |
| 409 | Run already has Garmin data | Run was already enriched | No action needed |
| 429 | Rate limit exceeded | Too many API calls | Wait 60 seconds and retry |
| 500 | Internal server error | Backend error | Retry after 30 seconds |

---

## Request/Response Patterns

### Authentication Header
All endpoints except OAuth callback require:
```
Authorization: Bearer <user_token>
```

### Content-Type
All requests should include:
```
Content-Type: application/json
```

### Timestamp Format
All timestamps in ISO 8601 format:
```
2026-03-15T19:30:00Z
```

### Error Response Format
```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "value"
  }
}
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| List devices | 100 req/min |
| List activities | 100 req/min |
| Enrich run | 50 req/min |
| Webhook stats | 20 req/min |

**Rate Limit Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1773486060
```

---

## Webhook Events (Received by Server)

### Activity Event
```json
{
  "activities": [
    {
      "userId": "garmin-user-id",
      "summaryId": "garmin-activity-id",
      "activityName": "Morning Run",
      "activityType": "RUNNING",
      "startTimeInSeconds": 1773486000,
      "durationInSeconds": 1800,
      "distanceInMeters": 5000,
      "calories": 450,
      "steps": 6000,
      "deviceIndex": 1
    }
  ]
}
```

### Epoch Event
```json
{
  "epochs": [
    {
      "userId": "garmin-user-id",
      "summaryId": "garmin-activity-id",
      "startTimeInSeconds": 1773486000,
      "durationInSeconds": 60,
      "activityType": "RUNNING",
      "distanceInMeters": 83.3,
      "activeKilocalories": 7,
      "steps": 100,
      "intensity": "VIGOROUS",
      "averageHeartRateInBeatsPerMinute": 160,
      "averageCadenceInStepsPerMinute": 180,
      "averagePaceInSecondsPerMeter": 12
    }
  ]
}
```

---

## Response Examples by Status Code

### 200 OK
```json
{
  "success": true,
  "data": {
    "id": "resource-id",
    "name": "Resource Name"
  }
}
```

### 201 Created
```json
{
  "success": true,
  "id": "new-resource-id"
}
```

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "details": {
    "field": "error message"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "code": "INVALID_TOKEN"
}
```

### 404 Not Found
```json
{
  "error": "Not found",
  "resource": "Device",
  "id": "device-id"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "requestId": "req-123-456"
}
```

---

## Testing Checklist

- [ ] OAuth flow generates correct authorization URL
- [ ] Callback handler validates state correctly
- [ ] Device list shows all connected devices
- [ ] Disconnect removes device from list
- [ ] Activity list returns proper format
- [ ] Enrichment updates run with Garmin data
- [ ] Webhook stats show accurate counts
- [ ] Rate limiting works as expected
- [ ] Error messages are helpful
- [ ] Timestamps are in correct format

---

## iOS Swift Examples

### Making Authenticated Requests

```swift
import Alamofire

let headers: HTTPHeaders = [
    "Authorization": "Bearer \(token)",
    "Content-Type": "application/json"
]

// Get devices
AF.request("https://api.airuncoach.live/api/garmin/devices",
           headers: headers)
    .responseDecodable(of: [Device].self) { response in
        switch response.result {
        case .success(let devices):
            print("Got \(devices.count) devices")
        case .failure(let error):
            print("Error: \(error)")
        }
    }

// Enrich run
AF.request("https://api.airuncoach.live/api/runs/\(runId)/enrich-with-garmin-data",
           method: .post,
           headers: headers)
    .responseDecodable(of: EnrichmentResponse.self) { response in
        switch response.result {
        case .success(let result):
            // Update UI with enriched data
        case .failure(let error):
            // Show error
        }
    }
```

---

**API Version**: 1.0  
**Last Updated**: March 15, 2026
