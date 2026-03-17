# iOS Implementation Guide
## Changes Made in This Session — Replicate on iOS

This document covers every feature and bug fix implemented on Android in this session.
Each section includes: what changed, why, the relevant API contracts, and what to build on iOS.

---

## Table of Contents

1. [GPS Permission Gating on Coached Workout Detail Screen](#1-gps-permission-gating)
2. [Auto-Start GPS Tracking for Coached Workouts](#2-auto-start-coached-workouts)
3. [Auto-Complete Training Plan Workout on Run Save](#3-auto-complete-training-plan-workout)
4. [Garmin Webhook User Matching Fix (Server)](#4-garmin-webhook-user-matching)
5. [Pre-Run Briefing Improvements (Server)](#5-pre-run-briefing-improvements)
6. [Zone 2 / HR Zone-Aware Coaching (Server)](#6-zone-aware-coaching)
7. [Garmin Data Enrichment — Full Fix Suite](#7-garmin-enrichment-fixes)
8. [Garmin Sync CTA on Run Summary Screen](#8-garmin-sync-cta)
9. [Chart Bug Fixes (KM Splits + Fatigue Analysis)](#9-chart-bug-fixes)
10. [Garmin Sync Polling + Push Notifications](#10-polling-and-push-notifications)

---

## 1. GPS Permission Gating

### What Changed
`WorkoutDetailScreen` now checks GPS permissions **before** allowing the user to start a coached workout. Previously the run could start silently without location data.

### Behaviour
- On screen load (for any non-rest workout): immediately request `NSLocationWhenInUseAuthorization`
- While acquiring: show a banner **"Acquiring GPS signal…"** with a spinner
- If denied: show a banner **"Location permission required"** with a **Grant** button that opens Settings
- If error: show **"GPS signal unavailable"** + **Retry** button
- **"Start This Workout" button** is disabled until GPS is confirmed

### iOS Implementation
```swift
// In WorkoutDetailView
@State private var locationAuthStatus: CLAuthorizationStatus = .notDetermined
@State private var isAcquiringGPS = false

// Request on appear
.onAppear {
    guard workout.type != .rest else { return }
    locationManager.requestWhenInUseAuthorization()
    startGPSAcquisition()
}

// Disable start button
Button("Start This Workout") { ... }
    .disabled(locationAuthStatus != .authorizedWhenInUse || isAcquiringGPS)
```

Use `CLLocationManager` and observe `locationManagerDidChangeAuthorization`. Show the GPS status banner at the top of the screen — it should disappear once a fix is confirmed.

---

## 2. Auto-Start Coached Workouts

### What Changed
When `RunSessionScreen` is launched **from a coaching plan** (config has a `trainingPlanId`), the run tracking starts **automatically** after 800ms instead of requiring the user to tap "Start Run". The AI pre-run briefing plays while the GPS tracking is already running.

### Logic
```kotlin
// Android (LaunchedEffect on screen load)
val config = RunConfigHolder.getConfig()
val isCoached = config?.trainingPlanId != null
if (isCoached) {
    viewModel.prepareRun()       // triggers briefing API call
    delay(800)
    viewModel.startRun()         // starts GPS tracking immediately
} else {
    viewModel.prepareRun()       // shows briefing, user taps Start Run
}
```

### iOS Implementation
In your equivalent of `RunSessionView`, detect whether the session was launched from a coaching plan:
```swift
.onAppear {
    viewModel.prepareRun()  // start briefing
    if runConfig.trainingPlanId != nil {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            viewModel.startRun()  // auto-start tracking
        }
    }
}
```

Free runs (launched from map screen) should still require a manual "Start Run" tap.

---

## 3. Auto-Complete Training Plan Workout on Run Save

### What Changed
When a run that was linked to a coaching plan session is loaded on the run summary screen, **the workout is automatically marked as complete** — no user action required.

### Server Endpoint
```
POST /api/training-plans/complete-workout
Body: { "workoutId": "<planWorkoutId>", "runId": "<runId>" }
```

### How the Link Works
When a coached run is started, the run record is saved with:
- `linkedWorkoutId` — the ID of the training plan workout
- `linkedPlanId` — the training plan ID

### iOS Implementation
In your run summary ViewModel, after loading the run:
```swift
func loadRun(runId: String) async {
    let run = try await apiService.getRun(runId: runId)
    self.run = run

    // Auto-complete the linked training plan workout
    if let workoutId = run.linkedWorkoutId {
        try? await apiService.completeWorkout(workoutId: workoutId, runId: runId)
    }
}
```

This ensures plan progress updates the moment the summary screen appears.

---

## 4. Garmin Webhook User Matching

### What Changed (Server Only)
A `resolveGarminUserId()` helper was added to match incoming Garmin webhook payloads to app users. Previously **sleep, stress, and pulse-ox** handlers were ignoring Garmin's `userId` field and trying (and failing) to look up the user by their run activity on the same date.

### Fix Summary
All wellness webhook handlers (sleep, stress, pulse-ox, dailies) now:
1. Check `payload.userId` against `connected_devices.device_id`
2. Fall back to single-Garmin-account assumption if only one device is connected

The **OAuth callback** was also fixed to call Garmin's `/wellness-api/rest/user/id` endpoint if the `userId` wasn't returned in the token exchange response, ensuring `device_id` is always populated.

**No iOS client changes needed** — this is a server-only fix.

---

## 5. Pre-Run Briefing Improvements

### What Changed (Server)
The `/api/coaching/pre-run-briefing-audio` endpoint (what the mobile app calls) was fixed to pass training plan context to the AI prompt. Previously the plan fields were silently dropped.

The AI prompt was also updated to:
- Cap total output at **50 words** (≈10 second briefing)
- For **coached workouts**: lead with the workout type and plan week
- For **free runs**: lead with distance and target pace

### Coached Workout Briefing Example
> *"Week 3 easy run of your half-marathon build. Keep heart rate in Zone 2 — this builds your aerobic base."*

### API Call
```
POST /api/coaching/pre-run-briefing-audio
Body: {
  "distance": 5.0,
  "difficulty": "easy",
  "hasElevation": false,
  "trainingPlanId": "abc123",
  "workoutType": "easy_run",
  "planWeekNumber": 3,
  "planTotalWeeks": 12,
  "goalType": "half_marathon",
  "targetHeartRateZone": 2
}
```

### iOS Implementation
When starting a run from a coaching plan, populate the additional fields from the `TrainingPlanWorkout` object. The iOS app likely already calls the briefing endpoint — just ensure these 7 extra fields are included in the request body.

---

## 6. Zone-Aware Coaching

### What Changed (Server)
All real-time coaching prompts now receive the session's `targetHeartRateZone` and adapt accordingly.

### Zone 1-2 (Aerobic/Easy) Behaviour Changes
| Coaching Type | Old Behaviour | New Behaviour |
|---|---|---|
| **Struggle coaching** | Flags pace drop as fatigue | Reframes as correct aerobic control |
| **Technique coaching** | Form corrections | Breathing rhythm and relaxation focus |
| **Sprint finish** (final 500m/100m) | Encourages speed up | Replaced with "maintain HR zone to the finish" |
| **Cadence coaching** | Hardcoded 170-180 spm | Dynamic: 110-130 spm for Zone 2 paces |
| **Heart rate check** *(new)* | Didn't exist | Dedicated prompts reinforcing why slowing to control HR is correct |
| **Milestone coaching** | Generic celebration | Acknowledges aerobic adaptation happening right now |

### Cadence Calculation Logic
```typescript
function getOptimalCadenceForPace(paceMinsPerKm, heightCm?, fitnessLevel?, age?) {
  // Base from pace
  let base: [min, max]
  if (pace > 12)     base = [100, 120]  // very slow walk
  else if (pace > 9) base = [110, 130]  // Zone 2 easy run
  else if (pace > 7) base = [140, 160]  // moderate
  else if (pace > 5) base = [155, 175]  // tempo
  else               base = [170, 185]  // race pace

  // Adjustments
  if (heightCm > 180) base -= 2          // taller = longer stride
  if (fitnessLevel === 'beginner') base += 2
  if (fitnessLevel === 'advanced') base -= 3
  if (age > 40) base -= Math.floor((age - 40) / 10)

  return base
}
```

### What Zone 2 Coaching Says
- *"You're building your aerobic engine. Every Zone 2 minute improves mitochondrial density."*
- *"Slowing down to keep HR in zone is exactly right — elite runners built their speed HERE."*
- *"This aerobic work is building your base. That's why elite runners spend 80% of training at easy paces."*

### iOS Integration
Pass `targetHeartRateZone` from the training plan workout to all coaching API calls. The relevant server endpoints:
- `POST /api/coaching/realtime-coaching`
- `POST /api/coaching/cadence-coaching`
- `POST /api/coaching/struggle-coaching`
- `POST /api/coaching/pre-run-briefing-audio`

---

## 7. Garmin Enrichment Fixes

### 7a. Wrong API Endpoint Path
**Bug**: `/wellnessapi/rest/activities` (no hyphen) → 400 error  
**Fix**: `/wellness-api/rest/activities` (with hyphen)  
**No iOS change needed** — server-side fix.

### 7b. Pull API Uses Wrong Token Type
**Root Cause**: Garmin gives us a **push/webhook token** (for receiving data). Their `/wellness-api/rest/activities` pull endpoint requires a different token type → `InvalidPullTokenException`.

**Fix**: The enrich endpoint now queries **our own `garmin_activities` database table** (populated when Garmin pushes via webhook) instead of calling Garmin's API. The pull API is used only as a fallback.

**Architecture** (important for iOS to understand):
```
Garmin Watch → sync → Garmin Connect App 
    → Garmin pushes to our webhook → stored in garmin_activities table
    → User taps "Sync" → we query our own DB (no outbound call)
```

### 7c. Integer Overflow from Decimal Values
**Bug**: Garmin sends `"steps": 34.63` (decimal) but DB column is `INTEGER` → SQL error.  
**Fix**: All integer fields in the epoch processor now use `Math.floor()`.  
**No iOS change needed** — server-side fix.

### 7d. Activity Search Window
**Bug**: Was searching 8 days of Garmin history → hit Garmin's 86400s API limit.  
**Fix**: Window is now `run.startTime - 20min` to `run.endTime + 20min` — precise matching, no cross-contamination between multiple runs on the same day.  
**No iOS change needed** — server-side fix.

### 7e. Token Expiry Handling
**Server**: Detects `invalid_grant` during token refresh → marks device as inactive, returns HTTP 401 with `{ error: "garmin_reconnect_required" }`.

**iOS should handle the 401**:
```swift
// In Garmin enrich handler
if response.statusCode == 401 && errorBody.contains("garmin_reconnect_required") {
    showGarminReconnectAlert()  // "Your Garmin connection expired. Reconnect in Settings."
    hideGarminSyncCTA()
}
```

---

## 8. Garmin Sync CTA on Run Summary Screen

### What Changed
Moved the "Sync with Garmin" action from inside the AI Analysis card (buried) to a **prominent card at the top of the run summary screen**, immediately below the "Run Completed" banner.

### Display Logic
```swift
// Show CTA when:
if isGarminConnected && !run.hasGarminData {
    GarminEnrichCTACard(isEnriching: isEnriching, onSync: enrichRun)
}

// Replace with badge when data is loaded:
if run.hasGarminData {
    GarminPoweredByBadge()
}
```

### Visual Design
- Dark card (`#0D1B2A`) with a blue border (`#1679C2` at 60% opacity)
- Garmin Connect logo on the left
- Title: **"Garmin data available"**
- Subtitle: **"Enrich this run with HR, HRV, sleep & recovery data"**
- Blue **"Sync"** button on the right — shows a spinner while loading

---

## 9. Chart Bug Fixes

### KM Splits (Horizontal Bar Chart)
**Bug**: Faster splits had longer bars (inverted).  
**Fix**: Slower pace (higher min/km value) → longer bar.

```swift
// WRONG (was):
let barWidth = (1.0 - norm) * maxBarWidth

// CORRECT:
let barWidth = norm * maxBarWidth
// where norm = (pace - minPace) / (maxPace - minPace)
// i.e. slowest split = 1.0 (longest bar)
```

### Fatigue Analysis (Vertical Bar Chart)
**Bug**: Slower splits (fatigue) had shorter bars — the opposite of what fatigue means visually.  
**Fix**: Slower pace → taller bar.

```swift
// WRONG (was):
let barHeight = (1.0 - norm) * maxBarHeight

// CORRECT:
let barHeight = norm * maxBarHeight
```

Both charts should now accurately show the pace curve — rising bars toward the end of the run indicate fatigue (slowing pace).

---

## 10. Garmin Sync Polling + Push Notifications

### Flow Overview
```
User taps "Sync" 
  → Server checks DB 
      → Data found: return 200 + enriched run ✅
      → Data not found: return 202 Accepted (pending)
          → iOS polls every 5s for 30s
          → After 30s: show "we'll notify you" dialog
              → Later: Garmin pushes → webhook matches run → push notification fires
```

### Server Response Codes
| Code | Meaning | iOS Action |
|---|---|---|
| `200` | Enriched successfully | Update run UI with new data |
| `202` | Garmin data not received yet | Poll again in 5 seconds |
| `401` | Token expired | Show reconnect prompt |
| `4xx/5xx` | Error | Show error message |

### iOS Polling Implementation
```swift
func enrichWithGarmin(runId: String) {
    Task {
        isEnriching = true
        let maxAttempts = 6  // 30 seconds at 5s intervals
        var attempts = 0

        while attempts < maxAttempts {
            let response = try await apiService.enrichRunWithGarmin(runId: runId)

            switch response.statusCode {
            case 200:
                run = response.body
                isEnriching = false
                isWaitingForSync = false
                return
            case 202:
                if attempts == 0 {
                    isEnriching = false
                    isWaitingForSync = true  // show "Waiting for sync..." state
                }
                attempts += 1
                try await Task.sleep(nanoseconds: 5_000_000_000)  // 5s
            case 401:
                garminNeedsReconnect = true
                isEnriching = false
                return
            default:
                enrichmentError = "Sync failed"
                isEnriching = false
                return
            }
        }

        // Timed out
        isWaitingForSync = false
        showSyncPendingDialog = true  // "We'll notify you"
    }
}
```

### "We'll Notify You" Dialog
Show this after 30s of unsuccessful polling:

> **"Garmin sync pending"**  
> It doesn't look like Garmin has sent us the data for this run yet.
>
> Once we receive the data from this session we'll send you a notification that your run has been enriched with Garmin data — including your heart rate, HRV, cadence, elevation, and recovery metrics.
>
> **[Got it]**

### Push Notification Setup

#### Server Requirements
Set the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable on Replit with the Firebase service account JSON (download from Firebase Console → Project Settings → Service Accounts → Generate new private key).

The server automatically sends a push notification via Firebase when:
- Garmin pushes a new activity via webhook
- The activity fuzzy-matches an existing run in the DB
- The notification payload includes `type: "run_enriched"` and `runId`

#### iOS Push Notification Setup
1. **Enable Push Notifications** capability in Xcode (Signing & Capabilities → Push Notifications)
2. **Register for remote notifications**:
```swift
// In AppDelegate / App startup
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
    guard granted else { return }
    DispatchQueue.main.async {
        UIApplication.shared.registerForRemoteNotifications()
    }
}
```
3. **Upload APNs key to Firebase Console** (or use APNs certificate)
4. **Save FCM token to server** after login:
```swift
func uploadFCMToken() async {
    do {
        let token = try await Messaging.messaging().token()
        try await apiService.saveFCMToken(token)  // POST /api/users/me/fcm-token
    } catch {
        print("FCM token upload failed: \(error)")
    }
}
```

#### FCM Token API
```
POST /api/users/me/fcm-token
Authorization: Bearer <token>
Body: { "fcmToken": "<device FCM token>" }
```

#### Handling the Push Notification
```swift
// In UNUserNotificationCenterDelegate
func userNotificationCenter(_ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse) async {
    
    let userInfo = response.notification.request.content.userInfo
    if let runId = userInfo["runId"] as? String, !runId.isEmpty {
        // Deep-link to run summary screen
        navigate(to: .runSummary(runId: runId))
    }
}
```

The notification payload from the server:
```json
{
  "title": "✨ Run Enriched with Garmin Data",
  "body": "Your run was updated with Garmin data: HR, cadence, elevation",
  "data": {
    "type": "run_enriched",
    "runId": "<run-uuid>",
    "activityId": "<garmin-activity-id>",
    "distanceKm": "5.2",
    "durationMin": "32"
  }
}
```

---

## API Summary — All Endpoints Used

| Method | Endpoint | Used For |
|---|---|---|
| `POST` | `/api/coaching/pre-run-briefing-audio` | Pre-run briefing (pass plan context fields) |
| `POST` | `/api/training-plans/complete-workout` | Auto-complete workout when run saves |
| `POST` | `/api/runs/{runId}/enrich-with-garmin-data` | Garmin enrichment (supports 202 polling) |
| `POST` | `/api/users/me/fcm-token` | Save/update FCM push token |
| `GET` | `/api/connected-devices` | Check if Garmin is connected + active |

---

## HeartRateZone Reference

| Zone | Name | Effort | % Max HR | Pace (approx) | Purpose |
|---|---|---|---|---|---|
| 1 | Recovery | Very easy | 50-60% | >13 min/km | Active recovery |
| 2 | Aerobic Base | Easy | 60-70% | 9-13 min/km | Fat burning, base building |
| 3 | Aerobic | Moderate | 70-80% | 7-9 min/km | Fitness building |
| 4 | Threshold | Hard | 80-90% | 5-7 min/km | Race conditioning |
| 5 | Anaerobic | Maximum | 90-100% | <5 min/km | Speed/power development |

**Zone 2 is the target for easy/long runs in the coaching plan.** The key messaging for Zone 2: *slowing down to control HR is intentional and correct — it builds the aerobic base that makes future speed possible.*

---

## Database Schema Changes

### `users` table — new column
```sql
ALTER TABLE users ADD COLUMN fcm_token TEXT;
```
This stores the device's Firebase Cloud Messaging token for push notifications. Updated via `POST /api/users/me/fcm-token` on every login and whenever the OS rotates the token.
