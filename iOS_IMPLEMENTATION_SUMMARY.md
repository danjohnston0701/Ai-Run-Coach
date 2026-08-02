# iOS Run Session Save - Implementation Summary

## Problem Statement
iOS run session saves are currently failing. The iOS app needs to properly construct and submit completed run data to the backend's `POST /api/runs` endpoint.

## Root Cause Analysis
Based on the backend implementation (routes.ts line 2311+), iOS is likely:
1. ❌ Sending distance in **meters** instead of **kilometers**
2. ❌ Sending duration in **seconds** instead of **milliseconds**
3. ❌ Using epoch timestamps for coaching note times (should be elapsed ms)
4. ❌ Not including required fields like `distance` or `sessionType`
5. ❌ Missing `externalId` which prevents deduplication

## Solution Overview

### What You Need
The iOS Xcode agent has **two comprehensive documents**:

1. **iOS_RUN_SESSION_SAVE_BRIEF.md** (590 lines)
   - Complete specification of the run JSON structure
   - All 40+ fields documented with units and examples
   - Database deduplication logic explained
   - Full HTTP lifecycle with error handling
   - Swift code examples

2. **iOS_RUN_SAVE_QUICK_REFERENCE.md** (314 lines)
   - One-page cheat sheet with critical gotchas
   - Minimal payload to make saves work
   - Swift template code ready to use
   - Retry strategy pseudocode
   - Validation checklist

### Quick Implementation Path

#### Step 1: Fix Units
```swift
let runPayload = [
  "distance": 10.5,           // ✓ kilometers, NOT 10500 meters
  "duration": 2700000,        // ✓ milliseconds (45 min), NOT 2700 seconds
  "sessionType": "run",       // ✓ lowercase string
]
```

#### Step 2: Add Required Fields
```swift
let runPayload = [
  "distance": 10.5,
  "duration": 2700000,
  "sessionType": "run",
  "startTime": "2026-08-02T08:00:00Z",      // ISO 8601
  "completedAt": "2026-08-02T08:45:00Z",   // ISO 8601
  "externalId": appleWatchActivityId        // prevents duplicates
]
```

#### Step 3: Add Optional High-Impact Fields
```swift
let runPayload = [
  // ... required fields above ...
  "currentPace": "7:30/km",           // coaching context
  "avgHeartRate": 165,
  "maxHeartRate": 180,
  "cadence": 175,                     // for totalSteps calculation
  "calories": 850,
  "aiCoachingNotes": [                // coaching events during run
    [
      "time": 300000,                 // ✓ elapsed ms, NOT epoch
      "type": "cadence",
      "message": "Keep it steady!",
      "coachName": "Alex"
    ]
  ],
  "gpsTrack": [...],                  // timestamps in elapsed ms
  "heartRateData": [155, 158, 162]    // one per second
]
```

#### Step 4: Implement with Error Handling
```swift
func saveCompletedRun(payload: [String: Any], token: String) async throws -> String {
  var request = URLRequest(url: URL(string: "https://api.airuncoach.com/api/runs")!)
  request.httpMethod = "POST"
  request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  request.httpBody = try JSONSerialization.data(withJSONObject: payload)
  
  let (data, response) = try await URLSession.shared.data(for: request)
  
  guard let http = response as? HTTPURLResponse else {
    throw NSError(domain: "Network", code: -1)
  }
  
  if http.statusCode == 200 {
    let result = try JSONDecoder().decode([String: String].self, from: data)
    return result["id"] ?? ""
  } else if http.statusCode == 401 {
    // Refresh token and retry
    throw AuthError.tokenExpired
  } else if http.statusCode >= 500 {
    // Exponential backoff retry (2s → 4s → 8s)
    throw ServerError.temporary
  } else if http.statusCode == 400 {
    // Validation error — don't retry
    let error = try JSONDecoder().decode([String: String].self, from: data)
    throw ValidationError(error["error"] ?? "Unknown")
  }
  
  throw NSError(domain: "Unexpected", code: http.statusCode)
}
```

#### Step 5: Test the Implementation
```swift
let payload: [String: Any] = [
  "distance": 10.5,
  "duration": 2700000,
  "sessionType": "run",
  "startTime": ISO8601DateFormatter().string(from: Date()),
  "completedAt": ISO8601DateFormatter().string(from: Date()),
  "currentPace": "7:30/km",
  "avgHeartRate": 165,
  "maxHeartRate": 180,
  "cadence": 175,
  "calories": 850,
  "externalId": UUID().uuidString,
  "externalSource": "apple"
]

do {
  let runId = try await saveCompletedRun(payload: payload, token: authToken)
  print("✓ Run saved: \(runId)")
} catch {
  print("✗ Save failed: \(error)")
}
```

## Backend Behavior (What to Expect)

### On Success (200 OK)
```json
{
  "id": "run_abc123",
  "distance": 10.5,
  "duration": 2700,
  "avgHeartRate": 165,
  "createdAt": "2026-08-02T08:46:00Z"
}
```
✓ Run is now in the database

### On Duplicate (200 OK - Same externalId)
```json
{
  "id": "run_existing_abc",
  "distance": 10.5,
  "duration": 2700,
  "mergedFields": ["aiCoachingNotes", "gpsTrack"]
}
```
✓ Your data was merged into existing run; safe to ignore

### On Validation Error (400)
```json
{
  "error": "Run must have a distance greater than 0. Please check your GPS data and try again.",
  "details": "No distance recorded during run session"
}
```
❌ Check: GPS enabled? distance > 0? Don't retry

### On Auth Error (401)
```json
{ "error": "Unauthorized" }
```
🔄 Refresh token; retry request

### On Server Error (500 or 503)
❌ Use exponential backoff: 2s → 4s → 8s → give up after 5 retries

## Key Differences: iOS vs Android

| Aspect | iOS | Android | Server Handling |
|--------|-----|---------|---|
| Distance unit | **Kilometers** | Kilometers | Both accepted; auto-converts meters |
| Duration unit | **Milliseconds** | Milliseconds | Auto-detects and normalizes |
| Timestamp format | ISO 8601 | ISO 8601 or epoch | Both parsed automatically |
| Coaching note times | Elapsed **ms** from start | Elapsed **ms** from start | Both treated same |
| Field names | `camelCase` | `camelCase` or `snake_case` | Both accepted |
| GPS point timestamps | Elapsed **ms** | Elapsed **ms** | Both expected |
| ExternalId source | Apple Watch activity ID | Garmin activity ID | Both trigger deduplication |

## Critical Fields That Prevent Failure

| Field | Type | Why Required | Example |
|-------|------|---|---|
| `distance` | number | Validates run was actually recorded | `10.5` |
| `duration` | number | Calculates pace and training effect | `2700000` (ms) |
| `sessionType` | string | Determines coaching strategy | `"run"` or `"walk"` |
| `startTime` | ISO 8601 | Timestamps run in user's history | `"2026-08-02T08:00:00Z"` |
| `completedAt` | ISO 8601 | Marks run completion time | `"2026-08-02T08:45:00Z"` |
| `externalId` | string | Prevents duplicate uploads | Apple Watch activity ID |

## Database Workflow (Automatic)

Once iOS POSTs to `/api/runs`, the backend:

1. **Validates** distance > 0, required fields present
2. **Deduplicates** (checks if externalId already exists)
3. **Normalizes** units (distance to km, duration to seconds)
4. **Inserts** into runs table with all embedded fields
5. **Merges** coaching notes, GPS data, HR data into run record
6. **Auto-completes** linked planned workouts (if `linkedWorkoutId` provided)
7. **Refreshes** runner profile (affects consistency streak, fitness averages)
8. **Triggers** AI analysis (creates detailed post-run insights)
9. **Returns** 200 OK with saved run ID

No separate API calls needed — it's all one transaction.

## Document Structure

### iOS_RUN_SESSION_SAVE_BRIEF.md
Use this as your **primary reference**:
- **Step 1**: Full JSON structure with 40+ fields
- **Step 2**: Distance & duration normalization
- **Step 3**: HTTP endpoint details & examples
- **Step 4**: Deduplication logic (why same ID → 200 OK)
- **Step 5**: Related records & cascades
- **Step 6**: Error handling & retry strategy
- **Step 7**: Field naming conventions
- **Step 8**: Full request-response cycle with Swift code
- **Step 9**: Testing checklist

### iOS_RUN_SAVE_QUICK_REFERENCE.md
Use this as your **cheat sheet** during implementation:
- Minimal payload to make saves work
- Unit conversion table
- Field naming guide
- Validation rules & common mistakes
- Swift code template
- Retry strategy pseudocode
- Success checklist

## Expected Outcomes

### Before Fix
```
iOS app → POST /api/runs (malformed payload) → 400 Bad Request
App crashes or shows generic error to user
Run data lost
```

### After Fix
```
iOS app → POST /api/runs (proper payload) → 200 OK (run_abc123)
Run stored in database with GPS, HR, coaching notes
Runner profile updated with consistency streak
AI analysis generated automatically
User sees success feedback in app
```

## Next Steps for iOS Team

1. **Read** iOS_RUN_SESSION_SAVE_BRIEF.md (10-15 min) to understand the full spec
2. **Skim** iOS_RUN_SAVE_QUICK_REFERENCE.md (2-3 min) to see critical gotchas
3. **Implement** using the Swift template provided
4. **Test** against the checklist in the brief (9 test cases)
5. **Deploy** with confidence that the backend will handle deduplication and merging

## Common Questions

### Q: What if the same run is uploaded twice?
**A**: The backend detects duplicate `externalId` and merges the data (e.g., adds HR data from second upload into first run record). Returns 200 OK both times — safe to ignore.

### Q: Should I calculate totalSteps or let the server do it?
**A**: Server calculates it automatically: `totalSteps = cadence (spm) × duration (minutes)`. You can provide it explicitly if you have better data.

### Q: What if the Apple Watch activity ID isn't available?
**A**: Omit `externalId`. The backend will still save the run but may allow duplicates if uploaded again with slightly different distance. Sending it is highly recommended.

### Q: How do I know if the save succeeded?
**A**: HTTP 200 OK status code. Extract the `id` field from the response JSON.

### Q: Why are my coaching notes showing wrong times?
**A**: You're probably sending epoch timestamps instead of elapsed milliseconds from run start. Fix: use `time: Date.now() - runStartEpoch` instead.

### Q: What if my duration is very short or very long?
**A**: The server auto-detects whether you sent milliseconds or seconds. Just be consistent. If sending 3-min run, send `180000` ms (not 180 seconds).

## Support

If iOS implementation still fails after following the brief:

1. Check the server logs for `[POST /api/runs]` entries
2. Verify each field against the validation table in the brief
3. Ensure date formats are ISO 8601: `YYYY-MM-DDTHH:MM:SSZ`
4. Confirm `aiCoachingNotes.time` is elapsed ms, not epoch
5. Try minimal payload first (distance, duration, sessionType, dates)
6. Then add optional fields one at a time

---

## Files Provided

- ✅ **iOS_RUN_SESSION_SAVE_BRIEF.md** — Complete specification (590 lines)
- ✅ **iOS_RUN_SAVE_QUICK_REFERENCE.md** — Cheat sheet & templates (314 lines)
- ✅ **iOS_IMPLEMENTATION_SUMMARY.md** — This document (you're reading it)

**Total documentation**: 900+ lines covering every aspect of the iOS run save process.

