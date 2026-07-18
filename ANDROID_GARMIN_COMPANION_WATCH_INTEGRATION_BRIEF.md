# Android Garmin Companion Watch Integration Technical Brief

## Overview

The Android app integrates with Garmin wearables via the **ConnectIQ SDK** (`com.garmin.connectiq:ciq-companion-app-sdk:2.3.0`), enabling bidirectional communication between the phone and a paired Garmin watch running the AI Run Coach companion app.

This brief documents the **complete architecture, message protocol, lifecycle, and three distinct use cases** that iOS must replicate identically to achieve feature parity.

---

## Architecture Diagram

```
┌─────────��────────────────────────────────────────────────────────┐
│ Android Phone                                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ MainActivity (lifecycle init)                            │    │
│  │  ↓ initialize()                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           ↓                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ GarminWatchManager (ConnectIQ bridge)                    │    │
│  │  • Manages SDK lifecycle (init → shutdown)              │    │
│  │  • Resolves companion app on watch (via APP_ID)         │    │
│  │  • Registers for message events                         │    │
│  │  • Emits isCompanionAppInstalled StateFlow              │    │
│  │  • Caches auth token + prepared-run payload             │    │
│  └─────────────────────────────────────────────────────────┘    │
│         ↓ Message Events ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ RunTrackingService (foreground)                         │    │
│  │  • Receives watch commands: start | pause | stop        │    │
│  │  • Processes biometric frames (GPS + HR + dynamics)     │    │
│  │  • Injects watch locations into route                   │    │
│  │  • Sends live runUpdate messages to watch               │    │
│  │  • Toggles foreground notification on watch event       │    │
│  └───────────────────────────��─────────────────────────────┘    │
│         ↓ UI Binding ↓                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ RunSessionViewModel                                      │    │
│  │  • Observes RunTrackingService metrics                   │    │
│  │  • Manages coaching decision (watch + phone HR + pace)   │    │
│  │  • Prepares & sends configured run to watch via button  │    │
│  │  • Shows PrepareRunOnWatchButton when app installed      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
          ║         Bluetooth (ConnectIQ)         ║
          ║     Message-based (fire-and-forget)  ║
          ║                                       ║
┌─────────────────────────────────────────────────────────────────┐
│ Garmin Watch (Fenix 7, Epix, FR965, etc.)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ AI Run Coach Companion App (MonkeyC)                     │  │
│  │  • StartView: idle or "Coached Run Ready ▶"             │  │
│  │  • RunView: active session (timer, pace, HR, dynamics)  │  │
│  │  • Manages Activity.Info record                         │  │
│  │  • Streams biometric frames every ~2 seconds            │  │
│  │  • Sends commands: start | pause | resume | stop        │  │
│  │  • Reports offline run batch status: pendingSync ↔ sync  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Message Protocol

### Phone → Watch (sendToWatch)

The Android app sends structured maps via `connectIQ.sendMessage()`. All messages are **fire-and-forget** — there is no guarantee of delivery, though the SDK logs status callbacks.

#### "auth" — Authentication & User Profile

**Trigger:** App startup (after cached auth loads) OR watch sends "watchReady" command

**Payload:**
```kotlin
mapOf(
    "type"       to "auth",           // Required marker
    "authToken"  to "xxx...",         // Bearer token for Garmin API calls
    "runnerName" to "Alice",          // Display name on watch
    "maxHr"      to 185               // Max HR derived from age (Tanaka formula)
)
```

**Watch behavior:**
- Stores auth token for future offline sync
- Updates display name and HR zone calculation
- Shows "Connected" status (replaces "OFFLINE" warning)

---

#### "preparedRun" — Coached Run Ready

**Trigger:** User taps "Prepare for Watch" button OR watch reconnects with cached payload

**Payload:**
```kotlin
mapOf(
    "type"               to "preparedRun",
    "distance"           to 5.0f,             // Target km (0.0 = open-ended)
    "runType"            to "route",          // "route" | "free" | "training"
    "workoutType"        to "tempo",          // Optional: "easy", "tempo", "intervals"
    "workoutIntensity"   to "z4",             // Optional: "z2", "z3", "z4", "z5"
    "workoutDesc"        to "Steady tempo",   // Optional: short description
    "routePolyline"      to "gfo}E...",       // Optional: encoded polyline for nav
    "targetPace"         to "5:30",           // Optional: target pace /km
    "intervalCount"      to 8,                // Optional: for interval workouts
    "intervalDistKm"     to 0.4f,             // Optional: interval distance
    "intervalDurSecs"    to null,             // Optional: interval duration
    "plannedWorkoutId"   to "pw_123abc"      // Optional: backend workout ID
)
```

**Watch behavior:**
- Transitions StartView from idle to "Coached Run Ready ▶"
- Stores configuration for immediate run start
- Displays target pace, distance, and workout metadata on RunView
- Sends prepared run ID with "start" command for coaching continuity

---

#### "runUpdate" — Live Session Metrics

**Trigger:** Every ~2 seconds while a run is active (from RunTrackingService)

**Payload:**
```kotlin
mapOf(
    "type"        to "runUpdate",
    "pace"        to 330.0,          // Seconds per km (formatted as "5:30")
    "distance"    to 2500.0,         // Metres
    "hr"          to 155,            // Beats per minute
    "elapsedTime" to 458,            // Seconds
    "cadence"     to 180,            // Steps per minute
    "isRunning"   to true,           // true = active, false = idle
    "isPaused"    to false           // true = paused, false = running/stopped
)
```

**Watch behavior:**
- Updates live metrics on RunView (pace, distance, HR, time)
- Maintains HR zone indicator
- Continues on-watch audio coaching based on received pace/HR

**Optimization:** If `wasRunStartedByWatch == true`, do **not** send runUpdate. The watch owns the authoritative activity and has superior GPS + timer. Sending redundant data creates UI flicker.

---

#### "startAck" — Start Command Acknowledgment

**Trigger:** Sent immediately after receiving watch "start" command

**Payload:**
```kotlin
mapOf("type" to "startAck")
```

**Watch behavior:**
- Cancels the BT retry timer (FR55 uses ~3-second exponential backoff)
- Prevents duplicate "start" commands

---

#### "startRun" — Phone-Initiated Run Transition

**Trigger:** When a run is started from the phone (Scenario 1) and watch is connected

**Payload:**
```kotlin
mapOf("type" to "startRun")
```

**Watch behavior:**
- Transitions from StartView → RunView
- Begins streaming biometric frames

---

#### "sessionEnded" — Run Completion

**Trigger:** When a run ends (stop command or background cleanup)

**Payload:**
```kotlin
mapOf("type" to "sessionEnded")
```

**Watch behavior:**
- Closes Activity.Info record (if watch-owned) or stops accepting updates
- Pops back to StartView
- Prepares offline sync if needed

---

### Watch → Phone (onMessageReceived)

The watch sends command and sensor messages. All arrive as a single-element list containing a map.

#### "hello" — Version Report (First Connect)

**Trigger:** Watch app first connects to phone

**Payload:**
```kotlin
mapOf(
    "type"       to "hello",
    "appVersion" to "3.2.2"   // Watch companion app version
)
```

**Phone behavior:**
- Persists version to SharedPreferences (`PREF_WATCH_APP_VERSION`)
- Used by GarminWatchUpdateScreen to show "Installed vs Available"
- Logs for debugging

---

#### "command" → "watchReady" — Watch App Opened

**Trigger:** User opens watch app while phone app is idle/backgrounded

**Payload:**
```kotlin
mapOf(
    "type"           to "command",
    "action"         to "watchReady",
    "hasPendingSync" to false        // true = offline run ready to upload
)
```

**Phone behavior:**
- Auto-sends cached auth (no ViewModel intervention required)
- Re-sends any pending `preparedRun` payload
- If `hasPendingSync == true`: see "pendingSync" handler below
- Fires `onWatchCommand?.invoke("watchReady")` so active ViewModels react

**Purpose:** Ensures watch can show "Connected" immediately without waiting for phone ViewModel to register; enables watch-first workflows.

---

#### "command" → "start" — Run Started on Watch

**Trigger:** User taps ▶ on watch StartView

**Payload:**
```kotlin
mapOf(
    "type"   to "command",
    "action" to "start"
)
```

**Phone behavior:**
1. **Immediately send startAck** (cancel watch BT retry timer)
2. **Clear stale preparedRun cache** (run has begun; do not resend config)
3. **Set `wasRunStartedByWatch = true`** (so phone skips GPS injection during Garmin window)
4. **Clear pending sync flag** (stale offline batch; if a new one exists, watch will re-signal)
5. If `onWatchCommand == null` (no ViewModel active):
   - Show "Run in progress" notification
   - Bootstrap RunTrackingService via `ACTION_START_TRACKING_FROM_WATCH`
   - Manage lifecycle until "stop" arrives
6. Else fire `onWatchCommand?.invoke("start")` for ViewModel handling

---

#### "command" → "pause" — Run Paused

**Trigger:** User pauses timer on watch

**Payload:**
```kotlin
mapOf(
    "type"   to "command",
    "action" to "pause"
)
```

**Phone behavior:**
- Pause tracking if active
- Stop sending runUpdate messages
- Fire `onWatchCommand?.invoke("pause")`

---

#### "command" → "resume" — Run Resumed

**Trigger:** User resumes timer after pause

**Payload:**
```kotlin
mapOf(
    "type"   to "command",
    "action" to "resume"
)
```

**Phone behavior:**
- Resume tracking
- Resume runUpdate message stream
- Fire `onWatchCommand?.invoke("resume")`

---

#### "command" → "stop" — Run Completed

**Trigger:** User taps ⏹ on watch RunView

**Payload:**
```kotlin
mapOf(
    "type"   to "command",
    "action" to "stop"
)
```

**Phone behavior:**
1. Clear `wasRunStartedByWatch` flag
2. Clear watch-only run notification
3. Stop location updates and sensor collection
4. Finalize session (distance, duration, coaching history)
5. If `onWatchCommand != null`: fire callback for ViewModel cleanup
6. Else if `wasRunStartedByWatch` was true: forward ACTION_STOP_TRACKING to RunTrackingService for safe termination

---

#### "command" → "pendingSync" — Offline Run Detected

**Trigger:** Watch detects a saved offline run batch ready to sync

**Payload:**
```kotlin
mapOf(
    "type"   to "command",
    "action" to "pendingSync"
)
```

**Phone behavior:**
- Set `_hasPendingWatchSync.value = true` (dashboard shows banner)
- Show heads-up notification: *"Open the AI Run Coach watch app to sync your run"*
- Persist banner until "syncComplete" or user dismisses notification

---

#### "command" → "syncComplete" — Offline Batch Uploaded

**Trigger:** Watch confirms offline run batch has been uploaded to backend

**Payload:**
```kotlin
mapOf(
    "type"     to "command",
    "action"   to "syncComplete",
    "runId"    to "run_abc123",      // Backend run ID
    "sessionId" to "session_xyz"     // Optional
)
```

**Phone behavior:**
1. Clear `_hasPendingWatchSync.value` (remove dashboard banner)
2. Dismiss "pending sync" notification
3. Clear all cached run lists in RunRepository (5-minute cache TTL)
4. Signal refresh event: `_runSyncedEvent.value = System.currentTimeMillis()`
5. Show success notification: *"Garmin run synced! Your offline run has been saved. Tap to view your summary."*
6. Tapping success notification deep-links to run summary screen

**Importance:** The watch—not Garmin Connect—is the system of record for offline runs. The phone must not show stale cached data while the watch is uploading.

---

#### "watchData" — Biometric Frame (~2 second stream)

**Trigger:** Every ~2 seconds while watch RunView is active

**Payload:**
```kotlin
mapOf(
    // GPS & Environment
    "elap"      to 458,                // Seconds (timer, excl. pauses)
    "lat"       to 40.7128,            // Latitude (degrees)
    "lng"       to -74.0060,           // Longitude (degrees)
    "alt"       to 45.2,               // GPS altitude (metres)
    "speed"     to 3.6f,               // Current speed (metres/second)
    "bear"      to 125.5f,             // Bearing (0–360°, 0 = North)
    "acc"       to 4.0f,               // GPS accuracy: Pos.Quality 0–4 (4 = best)
    
    // Biometrics (real-time from sensors)
    "hr"        to 155,                // Beats per minute
    "hrz"       to 3,                  // HR zone (1–5)
    "cad"       to 180,                // Cadence (steps/minute)
    
    // Running Dynamics (from Activity.Info; 0 if unsupported)
    "gct"       to 245.0f,             // Ground contact time (ms)
    "gcb"       to 49.5f,              // Ground contact balance (%, 50 = symmetric)
    "vo"        to 7.2f,               // Vertical oscillation (cm)
    "vr"        to 9.5f,               // Vertical ratio (%)
    "sl"        to 1.25f,              // Stride length (metres)
    
    // Training Effect (from Activity.Info; updated periodically)
    "te"        to 2.5f,               // Aerobic training effect (0–5)
    "ate"       to 1.0f,               // Anaerobic training effect (0–5)
    "rt"        to 24,                 // Recovery time (minutes until fully recovered)
    "vo2"       to 48.5f,              // VO₂ Max estimate (ml/kg/min)
    
    // Power & Respiration (device-dependent; 0 if unsupported)
    "pwr"       to 285,                // Running power (watts; Fenix 7+ only)
    "resp"      to 45.2f,              // Respiration rate (breaths/min; Fenix 7+ only)
    
    // Environmental
    "pres"      to 101325.5f,          // Ambient pressure (Pa)
    "baroAlt"   to 48.3f,              // Barometric altitude (metres; more accurate than GPS for elevation)
    
    // Authoritative Distance (watch Activity.Info.elapsedDistance)
    "dist"      to 2500.0f             // Cumulative distance (metres); null on older watch builds
)
```

**Phone behavior:**

1. **Parse as WatchBiometricFrame** (Kotlin data class):
   ```kotlin
   data class WatchBiometricFrame(
       val elapsedSeconds: Int,
       val lat: Double?, val lng: Double?, val altMetres: Double?,
       val speedMs: Float?, val bearingDeg: Float?, val gpsAccuracy: Float?,
       val heartRate: Int, val heartRateZone: Int, val cadence: Int,
       val groundContactTime: Float, val groundContactBalance: Float,
       val verticalOscillation: Float, val verticalRatio: Float,
       val strideLength: Float,
       val aerobicTrainingEffect: Float, val anaerobicTrainingEffect: Float,
       val recoveryTimeMinutes: Int, val vo2MaxEstimate: Float,
       val runningPower: Int, val respirationRate: Float,
       val ambientPressure: Float, val baroAltitude: Float = 0f,
       val cumulativeDistanceM: Float? = null
   )
   ```

2. **GPS Injection** (if valid lat/lng):
   - `onWatchGpsUpdate?.invoke(lat, lng, altM, speed)`
   - RunTrackingService appends to route (if not within 15-second fresh window)
   - **Does NOT** re-calculate distance from phone GPS when watch is streaming

3. **Biometric Processing**:
   - Inject into live session state (HR, cadence, dynamics)
   - Feed into coaching decision engine (HR zones, pace cues)
   - Store valid samples in run history (only positive values; zero = unsupported)

4. **Full Frame Callback**:
   - `onWatchSensorData?.invoke(frame)`
   - RunTrackingService uses for comprehensive biometric storage

5. **Authoritative Distance Handling** (watch-owned sessions only):
   - If `wasRunStartedByWatch == true` AND `cumulativeDistanceM` is valid:
     ```kotlin
     if (cumulativeDistanceM != null && cumulativeDistanceM > 5.0) {
         if (cumulativeDistanceM >= acceptedWatchDistanceM) {
             acceptedWatchDistanceM = cumulativeDistanceM
             totalDistance = cumulativeDistanceM  // Authoritative correction
         }
     }
     ```
   - **Never** allow stale frames to reduce distance (BT queue out-of-order delivery)
   - **Ignore** phone GPS distance accumulation while watch stream is fresh (15-second window)

---

## Three Scenarios

### Scenario 1: Phone-Initiated Run (watch may or may not be present)

**Setup:**
- User opens app on phone
- Taps "Prepare Run Setup" (if watch app is installed) or "Start Run" directly
- Optional: taps "Prepare for Watch" to send configuration

**Flow:**

```
┌─────────────────────────────────────────────────────┐
│ RunSessionViewModel.prepareRun()                    │
│  • Build RunSetupConfig (distance, type, etc.)      │
│  • If companionInstalled: call sendPreparedRun()    │
│  • Show PrepareRunOnWatchButton in SENDING state    │
└─────────────────────────────────────────────────────┘
                       ↓
      GarminWatchManager.sendPreparedRun()
      → cache payload + send "preparedRun" message
                       ↓
      Watch receives → StartView updates to
      "Coached Run Ready ▶" (if connected)
                       ↓
┌─────────────────────────────────────────────────────┐
│ RunSessionViewModel.startRun()                      │
│  • Clear pendingPreparedRun cache                   │
│  • Start RunTrackingService                         │
│  • Set wasRunStartedByWatch = false                 │
│  • Begin location + sensor collection (phone-owned) │
│  • If connected: send "startRun" to watch           │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ RunTrackingService (phone owns GPS + timer)         │
│  • Collect phone GPS every 2–5 seconds              │
│  • Send "runUpdate" every 2 seconds to watch        │
│  • Watch mirrors metrics on RunView                 │
│  • Watch can PAUSE/RESUME/STOP from its buttons    │
└─────────────────────────────────────────────────────┘
                       ↓
        (watch sends "pause" | "resume" | "stop")
                       ↓
┌─────────────────────────────────────────────────────┐
│ RunTrackingService.handleWatchCommand()             │
│  • onWatchCommand callback routed from watch        │
│  • ViewModel pauses/resumes/stops the session       │
│  • Post run: upload immediately                     │
└─────────────────────────────────────────────────────┘
```

**Key Properties:**
- Phone GPS is authoritative for distance & duration
- Watch mirrors metrics in real-time
- Watch can control pause/resume/stop
- Prepared config is sent once; "startRun" transitions watch to RunView
- **Watch can also start independently** (user taps watch directly; see Scenario 2)

---

### Scenario 2: Watch-Initiated Run (phone idle/foreground)

**Setup:**
- User opens watch app (or keeps it open from previous session)
- Phone app is running (but may not have a ViewModel registered)

**Flow:**

```
┌─────────────────────────────────────────────────────┐
│ GarminWatchManager.onSdkReady()                    │
│  • Resolves companion app on watch                  │
│  • Registers for message events                     │
│  • Auto-sends cached auth (if available)           │
│  • Caches auth for future "watchReady"             │
└─────────────────────────────────────────────────────┘
                       ↓
        User taps ▶ on watch (no phone preparation)
                       ↓
┌─────────────────────────────────────────────────────┐
│ Watch sends "start" command                        │
│  • Activity.Info record created on watch           │
│  • RunView activated; timer begins                 │
│  • Biometric frames start streaming every ~2s      │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ GarminWatchManager.handleWatchMessage("start")     │
│  1. Send startAck (cancel watch BT retry timer)    │
│  2. Set wasRunStartedByWatch = true                │
│  3. Clear cachedPreparedRunPayload                 │
│  4. If onWatchCommand == null:                     │
│     • Show "Run in progress" notification          │
│     • Bootstrap RunTrackingService via             │
│       ACTION_START_TRACKING_FROM_WATCH             │
│     • watchOnlyRunActive = true                    │
│  5. Else: fire onWatchCommand?.invoke("start")     │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ RunTrackingService (watch owns GPS + timer)        │
│  • wasRunStartedByWatch = true                     │
│  • DO NOT collect phone GPS                        │
│  • Process incoming watchData frames               │
│  • Use watch cumulativeDistance as authoritative   │
│  • Use watch elapsedSeconds for duration           │
│  • Accept GPS from watch for route (optional nav)  │
│  • DO NOT send "runUpdate" back to watch           │
└─────────────────────────────────────────────────────┘
                       ↓
    (watch streams "watchData" every ~2 seconds)
                       ↓
┌─────────────────────────────────────────────────────┐
│ RunSessionViewModel (if opened during run)          │
│  • Observes RunTrackingService.runState             │
│  • Distance & time come from watch (read-only)     │
│  • HR & coaching use watch biometrics              │
│  • User can view live metrics on phone              │
└─────────────────────────────────────────────────────┘
                       ↓
        (user taps ⏹ on watch — only watch can stop)
                       ↓
┌─────────────────────────────────────────────────────┐
│ Watch sends "stop" command                         │
│  • Activity.Info record finalized on watch         │
│  • Timer stops; Garmin syncs elapsed distance      │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ GarminWatchManager.handleWatchMessage("stop")      │
│  1. Clear watchOnlyRunActive flag                  │
│  2. Cancel "Run in progress" notification          │
│  3. Forward ACTION_STOP_TRACKING to service        │
│     (if onWatchCommand is null)                    │
│  4. Else: fire onWatchCommand?.invoke("stop")      │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ RunTrackingService stops & finalizes               │
│  • Snapshot final distance (from watch)            │
│  • Snapshot final duration (from watch)            │
│  • Calculate training effect from watch metrics    │
│  • Upload session to backend                       │
│  • Clean up GPS listeners and foreground notif.    │
└─────────────────────────────────────────────────────┘
```

**Key Properties:**
- **Watch is the system of record** for distance, duration, and all biometrics
- Phone GPS is disabled (watch BTis exclusively authoritative)
- Phone does not send "runUpdate" back to watch (watch owns the data)
- ViewModel may not be active; GarminWatchManager bootstraps RunTrackingService
- Watch command ("stop") is the only way to end the session
- **Dropped "stop" recovery**: if watch reports "hasPendingSync" after "start", the phone assumes "stop" was silently dropped and auto-forwards WATCH_RUN_FINISHED to service

---

### Scenario 3: Offline Watch Run (watch disconnected; phone discovers later)

**Setup:**
- User starts run on watch
- Phone disconnects or app is backgrounded
- Watch completes run and saves it locally
- Phone reconnects (or user opens app)

**Flow:**

```
┌─────────────────────────────────────────────────────┐
│ Watch App (disconnected from phone)                │
│  • User starts run (Activity.Info created)         │
│  • Timer & biometrics collected entirely on watch  │
│  • User stops run (Activity.Info finalized)        │
│  • Run saved to watch memory                       │
│  • Awaits phone reconnect for sync                 │
└─────────────────────────────────────────────────────┘
                       ↓
    Phone either reconnects OR user opens app
                       ↓
┌─────────────────────────────────────────────────────┐
│ GarminWatchManager.resolveApp()                    │
│  • App on watch found and registered               │
│  • Auto-sends cached auth (from previous session)  │
└─────────────────────────────────────────────────────┘
                       ↓
    Watch app on phone receives auth message
                       ↓
┌─────────────────────────────────────────────────────┐
│ Watch App (Garmin Connect relay)                   │
│  • Detects local offline run batch                 │
│  • Immediately syncs to Garmin Connect cloud       │
│  • Garmin webhook → AI Run Coach backend (async)   │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Watch App → Phone (still connected)                │
│  • Sends "watchReady" command (hasPendingSync=true)│
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ GarminWatchManager.handleWatchMessage("watchReady")│
│  1. Read hasPendingSync flag                       │
│  2. If true:                                       │
│     • Set _hasPendingWatchSync.value = true        │
│     • Show "pending sync" banner on dashboard      │
│     • Show heads-up notification                   │
│     • Forward WATCH_RUN_FINISHED to service        │
│       (dropped-stop recovery)                      │
│  3. Auto-send cached auth                         │
│  4. Re-send any pending preparedRun cache         │
│  5. Fire onWatchCommand?.invoke("watchReady")      │
└─────────────────────────────────────────────────────┘
                       ↓
    (user opens app; observes dashboard banner)
                       ↓
    Garmin webhook delivers run to backend async
                       ↓
┌─────────────��───────────────────────────────────────┐
│ Watch App (phone still connected)                  │
│  • Polls backend to confirm offline batch uploaded │
│  • Sends "syncComplete" command to phone           │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ GarminWatchManager.handleWatchMessage("syncComplete")
│  1. Clear _hasPendingWatchSync.value                │
│  2. Dismiss "pending sync" notification             │
│  3. Clear RunRepository caches (force fresh fetch)  │
│  4. Emit _runSyncedEvent = now()                    │
│  5. Show success notification + run summary link    │
│  6. Dashboard & history auto-refresh due to event   │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Dashboard & Previous Runs View                      │
│  • runSyncedEvent observers trigger refresh        │
│  • Fresh backend data replaces stale cache         │
│  • Offline watch run now visible in history        │
│  • User can tap → run summary                      │
└─────────────────────────────────────────────────────┘
```

**Key Properties:**
- **Watch is entirely offline**; phone has no visibility until reconnect
- Garmin Connect cloud is the intermediate (Garmin webhook posts to backend)
- Phone detects pending batch via "watchReady + hasPendingSync" flag
- Phone never directly syncs watch data; relies on Garmin Connect relay
- Dashboard + run history must refresh when "syncComplete" arrives (cache invalidation is critical)
- Dropped "stop" recovery: if watch reports pending sync, assume the "stop" message was lost and forward cleanup to service

---

## Implementation Details

### GarminWatchManager Class

**Location:** `app/src/main/java/live/airuncoach/airuncoach/service/GarminWatchManager.kt`

#### Public StateFlows (Observable)

```kotlin
val isWatchConnected: StateFlow<Boolean>
    // true once Garmin device shows CONNECTED status

val isCompanionAppInstalled: StateFlow<Boolean>
    // true once getApplicationInfo() confirms app is installed on watch

val hasPendingWatchSync: StateFlow<Boolean>
    // true when "pendingSync" or "watchReady+hasPendingSync" arrives;
    // clears on "syncComplete"

val runSyncedEvent: StateFlow<Long>
    // Emits System.currentTimeMillis() when "syncComplete" arrives;
    // observers refresh run lists immediately
```

#### Public Callbacks

```kotlin
var onWatchCommand: ((action: String) -> Unit)? = null
    // Invoked with "start" | "pause" | "resume" | "stop" | "watchReady"
    // Routed from RunTrackingService's watch listener

var onWatchGpsUpdate: ((Double, Double, Double?, Float?) -> Unit)? = null
    // Invoked with (lat, lng, alt?, speed?) every ~2 seconds

var onWatchSensorData: ((WatchBiometricFrame) -> Unit)? = null
    // Invoked with complete biometric frame every ~2 seconds

var onWatchAppReady: (() -> Unit)? = null
    // Invoked when watch app is resolved (for explicit auth if no cached token)
```

#### Public Methods

```kotlin
fun initialize()
    // Call from MainActivity.onCreate()
    // Initializes ConnectIQ SDK + registers device listener

fun shutdown()
    // Call from MainActivity.onDestroy()
    // Cleans up SDK, unregisters listeners

fun sendAuth(authToken: String, runnerName: String, userAge: Int? = null)
    // Push auth token to watch (cached for "watchReady" recovery)
    // maxHr calculated via Tanaka formula if age provided

fun sendPreparedRun(
    distanceKm: Float, runType: String,
    workoutType: String? = null, workoutIntensity: String? = null,
    workoutDesc: String? = null, routePolyline: String? = null,
    targetPace: String? = null, intervalCount: Int? = null,
    intervalDistKm: Float? = null, intervalDurSecs: Int? = null,
    plannedWorkoutId: String? = null
)
    // Transitions watch StartView to "Coached Run Ready ▶"
    // Caches payload for "watchReady" recovery

fun clearPendingPreparedRun()
    // Called after run starts or is cancelled
    // Prevents re-sending stale config on watch reconnect

fun sendRunUpdate(
    paceSecPerKm: Double, distanceMetres: Double,
    heartRate: Int, elapsedSeconds: Long,
    cadence: Int, isRunning: Boolean, isPaused: Boolean
)
    // Stream live metrics every ~2 seconds (phone-owned runs only)
    // Watch-owned runs skip this (watch is authoritative)

fun sendStartRun()
    // Transitions watch from StartView to RunView (phone-initiated)

fun sendStartAck()
    // Lightweight ack sent immediately after "start" command
    // Cancels watch BT retry timer

fun sendSessionEnded()
    // Signals run completion to watch

fun getConnectedDeviceName(): String?
    // Returns friendly name of connected Garmin device

fun getInstalledWatchVersion(): String?
    // Returns last reported companion app version from SharedPreferences
```

---

### RunTrackingService Integration

**Location:** `app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`

#### Watch-Specific Flags & State

```kotlin
private var wasRunStartedByWatch: Boolean = false
    // Set to true when "start" command arrives
    // Controls:
    //   - Whether to suppress phone GPS injection
    //   - Whether to send "runUpdate" to watch (no = watch is authoritative)
    //   - How to interpret biometric frames

private var lastWatchGpsMs: Long = 0L
    // Timestamp of most recent watch GPS (ms)
    // Used to calculate freshness window (15 seconds)

private var hasGarminData: Boolean = false
    // true once any valid biometric frame has been received

private var acceptedWatchDistanceM: Double = 0.0
    // Monotonically-increasing distance from watch
    // Protects against out-of-order Bluetooth frames

private var watchElapsedSeconds: Int = 0
    // Monotonically-increasing timer from watch (excl. pauses)
    // Used only for watch-owned sessions
```

#### Watch Command Listener

```kotlin
init {
    // Boot GarminWatchManager and register for commands
    val entryPoint = EntryPointAccessors.fromApplication<GarminWatchManagerEntryPoint>(context)
    garminWatchManager = entryPoint.garminWatchManager()
    
    garminWatchManager?.onWatchCommand = { action ->
        when (action) {
            "start"  -> handleWatchStart()
            "pause"  -> handleWatchPause()
            "resume" -> handleWatchResume()
            "stop"   -> handleWatchStop()
            else     -> Log.d(TAG, "Unknown watch action: $action")
        }
    }
    
    garminWatchManager?.onWatchGpsUpdate = { lat, lng, alt, speed ->
        injectWatchLocation(lat, lng, alt, speed)
    }
    
    garminWatchManager?.onWatchSensorData = { frame ->
        processWatchBiometrics(frame)
    }
}
```

#### Distance Handling (Watch-Owned Sessions)

```kotlin
private fun processWatchGpsFrame(lat: Double, lng: Double) {
    if (!wasRunStartedByWatch) return  // Phone-owned; use normal GPS injection
    
    // Watch-owned: accept cumulative distance from frame, not phone GPS
    // (handled separately in processWatchBiometrics)
}

private fun processWatchBiometrics(frame: WatchBiometricFrame) {
    if (!wasRunStartedByWatch) return
    
    // Accept only monotonic distances (out-of-order BT protection)
    if (frame.cumulativeDistanceM != null &&
        frame.cumulativeDistanceM > 5.0 &&  // startup noise floor
        frame.cumulativeDistanceM >= acceptedWatchDistanceM) {
        
        acceptedWatchDistanceM = frame.cumulativeDistanceM
        totalDistanceMetres = frame.cumulativeDistanceM
        // Authoritative correction
    }
    
    // Accept only newer elapsed seconds
    if (frame.elapsedSeconds > watchElapsedSeconds) {
        watchElapsedSeconds = frame.elapsedSeconds
    }
    
    // Process HR, cadence, dynamics normally
    currentHeartRate = frame.heartRate
    currentCadence = frame.cadence
    // ... etc
}
```

#### SendRunUpdate Logic

```kotlin
private fun updateWatchRunState() {
    if (wasRunStartedByWatch) {
        // Watch is authoritative; do NOT send runUpdate back
        // Prevents feedback loops and watch-owned data interference
        return
    }
    
    // Phone-owned: stream live metrics
    garminWatchManager?.sendRunUpdate(
        paceSecPerKm = currentPaceSeconds,
        distanceMetres = totalDistanceMetres,
        heartRate = currentHeartRate,
        elapsedSeconds = elapsedSeconds,
        cadence = currentCadence,
        isRunning = isRunning,
        isPaused = isPaused
    )
}
```

#### Dropped-Stop Recovery (Scenario 3)

Implemented in GarminWatchManager:

```kotlin
if (action == "watchReady") {
    val hasPending = map["hasPendingSync"] as? Boolean ?: false
    if (hasPending) {
        // Watch finished a run & saved it offline
        // If our "stop" message was dropped, RunTrackingService is still running
        // Forward cleanup to service (safe no-op if no watch-only run active)
        try {
            val finishIntent = Intent(context, RunTrackingService::class.java).apply {
                this.action = RunTrackingService.ACTION_WATCH_RUN_FINISHED
            }
            context.startService(finishIntent)
        } catch (e: Exception) {
            Log.w(TAG, "watchReady+hasPendingSync: could not forward WATCH_RUN_FINISHED")
        }
    }
}
```

---

### UI Components

#### PrepareRunOnWatchButton

**Location:** `app/src/main/java/live/airuncoach/airuncoach/ui/components/PrepareRunOnWatchButton.kt`

- Only rendered when `companionInstalled == true`
- Three states: IDLE (button), SENDING (pulsing), SENT (green checkmark)
- Can be primary (filled teal) or secondary (outline) based on run flow
- Tapping calls `onPrepare` callback (ViewModel sends preparedRun)

#### GarminCompanionPromptScreen

**Location:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GarminCompanionPromptScreen.kt`

- Modal shown to first-time users (when watch is paired but app not installed)
- Benefits: real-time HR, AI coaching, running metrics, power, VO₂ Max
- Install button deep-links to Connect IQ Store
- Maybe Later button can be shown again

#### GarminWatchUpdateScreen

**Location:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GarminWatchUpdateScreen.kt`

- Shown when watch app version > installed version
- Displays current version + available version from notification
- Install button opens Connect IQ Store URL

---

## Lifecycle Summary

### App Startup (MainActivity.onCreate)

1. **Initialize RetrofitClient** (session manager + auth)
2. **Initialize GarminAuthManager** (Garmin Connect OAuth)
3. **Initialize GarminWatchManager**
   - ConnectIQ SDK init
   - Query connected devices
   - Register device status listener
   - If device already connected: resolve app + register for messages
4. **Auto-push cached auth** (if available from SharedPreferences)
5. **Set Content** (Compose UI + navigation)
6. **Handle deep links** (run summary, observer invite, Garmin update notification, etc.)

### Run Preparation (RunSessionViewModel.prepareRun)

1. Build `RunSetupConfig` from user selections
2. If `isCompanionAppInstalled == true`:
   - Transition `sendState` to SENDING
   - Call `garminWatchManager.sendPreparedRun(...)`
   - Cache payload; send to watch
   - Transition `sendState` to SENT (green checkmark)
3. Display `PrepareRunOnWatchButton` with visual feedback

### Run Start (RunSessionViewModel.startRun)

1. Clear `cachedPreparedRunPayload` (run is beginning)
2. Start `RunTrackingService`
3. If connected: send "startRun" to watch (transitions RunView)
4. Begin location + sensor collection (phone-owned)
5. Begin streaming "runUpdate" every ~2 seconds (phone-owned only)

### Run Active

**Phone-initiated:**
- Phone GPS is authoritative; watch mirrors
- Watch can pause/resume/stop
- Send "runUpdate" every 2 seconds

**Watch-initiated:**
- Watch GPS is authoritative; phone disabled
- Phone processes watch frames only
- Do NOT send "runUpdate" to watch
- Watch "stop" is the only completion path

### Run Stop

1. Clear all session state
2. Finalize distance + duration
3. Snapshot biometric history
4. Upload to backend
5. Clear watch-specific flags
6. Close RunTrackingService

### Offline Sync (Scenario 3)

1. Watch saves run locally when phone disconnected
2. Phone reconnects; GarminWatchManager receives "watchReady + hasPendingSync"
3. Phone shows dashboard banner + heads-up notification
4. Watch relays data to Garmin Connect (async)
5. Garmin webhook hits backend
6. Watch polls backend; sends "syncComplete"
7. Phone invalidates caches + shows success notification
8. User taps notification → run summary

---

## Important Notes for iOS Replication

### 1. **Message Routing vs. Direct Callbacks**

**Android pattern:**
- GarminWatchManager receives all watch messages
- Routes commands via `onWatchCommand` callback to active listener
- If no listener: bootstraps RunTrackingService directly

**iOS equivalent:**
- WatchConnectivityManager receives all watch messages
- Must route to active ViewController or create background session
- Consider UserNotificationCenter for watch-only scenarios

### 2. **State Ownership (Phone vs. Watch)**

**Critical distinction:**
- If `wasRunStartedByWatch == true`:
  - Watch distance is law (ignore phone GPS)
  - Phone does NOT send "runUpdate" back
  - Duration comes from watch timer
  - Only watch can stop the session
- If `wasRunStartedByWatch == false`:
  - Phone GPS is law
  - Send "runUpdate" every 2 seconds
  - Phone can stop or be stopped by watch

### 3. **Out-of-Order Frame Protection**

**Bluetooth can deliver frames out of order:**
- Always compare incoming distance with `acceptedWatchDistanceM`, not current total
- Enforce monotonic time (never allow elapsed seconds to decrease)
- Discard stale frames silently

### 4. **Auth Caching & Auto-Recovery**

**Android caches auth in SharedPreferences:**
- On reconnect (SDK ready), auto-sends cached auth without ViewModel intervention
- On "watchReady", re-sends cached auth
- This enables watch-first workflows (user can start run on watch without phone app open)

**iOS equivalent:**
- Cache auth token in Keychain
- On WatchConnectivity session restore, auto-send auth
- On watch "watchReady", re-send cached token

### 5. **Notification vs. Foreground Service**

**Android:**
- RunTrackingService is a foreground service (persistent notification)
- For watch-only runs, shows "Run in progress" notification
- Dismisses when watch sends "stop"
- For offline syncs, shows "pending sync" → "synced" progression

**iOS equivalent:**
- Use background URLSession or keep app alive
- Use UserNotificationCenter for watch-only run feedback
- Show "pending sync" banner in dashboard
- Invalidate run cache on "syncComplete"

### 6. **Garmin Distance vs. iPhone Distance**

**Android:**
- Watch sends `cumulativeDistanceM` in every frame (watch-owned sessions)
- Phone uses Kalman-filtered GPS accumulation (watch value)
- Not just a speed calculation; it's the authoritative cumulative total
- Phone GPS is suppressed during watch stream (15-second window)

**iOS equivalent:**
- Watch sends `dist` (cumulative distance, metres) in biometric frame
- Do NOT calculate distance from speed; use cumulative value
- Suppress CLLocationManager distance accumulation during watch stream
- Use Kalman-filtered route distance only for phone-owned sessions

---

## Testing Checklist

- [ ] Phone-initiated run: watch mirrors pace, HR, time correctly
- [ ] Watch-initiated run: phone distance matches watch distance exactly
- [ ] Out-of-order frames: distance never decreases; elapsed time never decreases
- [ ] Dropped-stop recovery: offline run detected on reconnect; service auto-stops
- [ ] Auth caching: watch auto-connects on phone reconnect (no ViewModel needed)
- [ ] Prepared run: "Coached Run Ready ▶" state persists across phone/watch order
- [ ] Offline sync: "pending sync" → success notification → run in history
- [ ] Multiple runs: watch-origin flag clears; next run doesn't inherit Garmin totals
- [ ] No watch: "Prepare for Watch" button hidden; normal phone run works
- [ ] Walk session: notification title says "Walk", upload JSON contains `"sessionType": "walk"`

---

## Summary

The Android Garmin companion watch integration is a **bidirectional, real-time message protocol** over Bluetooth Connect IQ, supporting three distinct workflows:

1. **Phone-Initiated**: User prepares run on phone, optionally sends config to watch, then starts. Watch mirrors metrics. Phone GPS is authoritative.

2. **Watch-Initiated**: User starts directly on watch (without phone prep). Watch becomes the system of record for distance, duration, and biometrics. Phone GPS is disabled.

3. **Offline Watch Run**: Watch runs disconnected, saves locally, syncs via Garmin Connect cloud when phone reconnects. Phone detects pending sync, invalidates caches, and shows success notification.

**Key architectural insights for iOS:**

- Use ConnectIQ parity (or equivalent watch communication framework)
- Implement identical state ownership logic (watch vs. phone)
- Protect against out-of-order Bluetooth frames
- Cache auth for watch-first recovery
- Detect pending sync via flag in "watchReady" message
- Invalidate run caches immediately on "syncComplete"
- Suppress phone GPS when watch stream is fresh (15-second window)
- Never send "runUpdate" for watch-owned sessions (watch is authoritative)
