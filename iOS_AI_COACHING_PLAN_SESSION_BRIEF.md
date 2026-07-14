# iOS AI Coaching Plan Session Dashboard — Complete Implementation Brief

**Status**: Ready for Xcode AI Implementation  
**Scope**: Dashboard display, session preparation, watch integration, Garmin sync, and completion tracking  
**Priority**: Due Today / Overdue  
**Reference**: Android implementation in progress  
**Timeline**: 2-3 days for full feature

---

## 📋 Executive Summary

The **AI Coaching Plan Session** feature enables users to:
1. **View upcoming/current coaching sessions** on the dashboard with key metrics
2. **Prepare for a session** on their iPhone with warm-up guidance
3. **Prepare the Apple Watch** or synced device with session data
4. **Feed live data** from Garmin watches during the run
5. **Run the session** with real-time in-run coaching cues
6. **Mark session complete** on phone or watch when done
7. **Auto-detect completion** when session ends on watch and sync back to phone

The experience is **fully synchronized** across phone ↔ watch ↔ Garmin ecosystem, ensuring seamless multi-device operation.

---

## 🎯 User Journey

```
Dashboard (Home)
    ↓ (See "AI Coaching Plan" card showing today's session)
    ├─ Tap "View" / "Start"
    ↓
Session Preparation Screen
    ├─ Session details (distance, duration, coaching type)
    ├─ Warm-up instructions
    ├─ Equipment check (watch, Garmin sync status)
    └─ "Prepare Watch" & "Start Session" buttons
    ↓
[If Apple Watch enabled]
├─ Watch receives session payload
├─ User taps "Start" on watch
├─ Watch app begins session UI
└─ Phone receives "watch session started" notification
    ↓
[If Garmin enabled]
├─ Phone maintains Garmin connection
├─ Real-time heart rate, GPS, cadence streamed to phone
├─ Coaching cues generated based on live metrics
└─ Data synced to backend
    ↓
Run Session UI (Phone OR Watch-primary)
    ├─ Distance / pace / HR / cadence display
    ├─ In-run coaching cues
    ├─ Segment milestones ("500m to go", "Slow down")
    └─ "Pause" / "Finish" buttons
    ↓
Session Completion
    ├─ User taps "Finish" on phone OR watch
    ├─ "Mark as Complete" confirmation
    ├─ Sync completion status across devices
    └─ Navigate to "Session Complete" summary screen
    ↓
Session Summary
    ├─ Total distance, duration, pace, HR metrics
    ├─ AI feedback on performance
    ├─ Save to history
    └─ Suggest next session
```

---

## 📱 Dashboard Component (Home Screen)

### AI Coaching Plan Card

**Location**: Top of home dashboard, below user greeting  
**Priority**: High-visibility, actionable card

**Layout**:
```
┌─────────────────────────────────────────┐
│ 🎯 AI Coaching Plan — Today             │
├─────────────────────────────────────────┤
│                                         │
│ Status: 📅 Ready to Start              │
│ Time: 3:00 PM (in ~2 hours)            │
│                                         │
│ Session Type: Speed Work               │
│ 🏃 5 km at 5:30/km pace                │
│ ⏱️ ~28 minutes                          │
│                                         │
│ Coaching: Interval focus, cadence >175 │
│                                         │
│                    [Start] [Details ▶] │
│                                         │
└─────────────────────────────────────────┘
```

**Data to Display**:
- **Session title** (e.g., "Speed Work", "Easy Recovery", "Long Run")
- **Target distance** & **estimated duration**
- **Scheduled time** (if scheduled) or "Ready Now"
- **Session type** (interval, tempo, steady state, easy, long run)
- **Coaching focus** (1-2 key coaching points)
- **Status badge**:
  - 🟢 Ready to Start
  - 🟡 Coming Soon (scheduled for future)
  - 🟠 Overdue (should have started earlier)
  - 🔴 Session Expired

**UI States**:
1. **No Session**: Show "No coaching session scheduled" + prompt to view training plan
2. **Session Ready**: Show card with "Start" button
3. **Session In Progress**: Show card with "Continue" button + elapsed time
4. **Session Completed**: Show "✓ Completed" badge + link to summary

**Actions**:
- **[Start]**: Navigate to Session Preparation screen
- **[Continue]**: Resume session if paused
- **[Details ▶]**: Show full session details (optional)

**API Call**:
```
GET /api/coaching-plans/today-session
Authorization: Bearer {token}

Response:
{
  "sessionId": "uuid",
  "date": "2026-07-14",
  "title": "Speed Work",
  "type": "interval",  // "interval" | "tempo" | "steady" | "easy" | "long_run"
  "targetDistance": 5.0,  // km
  "estimatedDuration": 1800,  // seconds
  "scheduledTime": "2026-07-14T15:00:00Z",  // or null for "ready now"
  "coachingFocus": "Maintain 175+ cadence, push pace on intervals",
  "segments": [
    {
      "segmentId": "seg1",
      "type": "warmup",  // "warmup" | "interval" | "recovery" | "cooldown" | "steady"
      "targetDistance": 1.0,
      "targetPace": "6:00/km",
      "intensity": "easy",
      "duration": 600  // seconds
    },
    // ... more segments
  ],
  "status": "ready",  // "ready" | "in_progress" | "paused" | "completed" | "expired"
  "startedAt": null,
  "completedAt": null
}
```

---

## 🛠️ Session Preparation Screen

**Purpose**: Get user ready to start the session; check equipment; brief on expectations.

**Layout**:
```
┌──────────────────────────────────────┐
│ Speed Work Session                X  │
├──────────────────────────────────────┤
│                                      │
│ Session Overview                     │
│ ───────────────────────────────────  │
│ 🏃 Distance: 5.0 km                 │
│ ⏱️  Duration: ~28 minutes            │
│ 📊 Pace: 5:30/km (avg)              │
│ 💓 HR Zone: Zone 4-5 (hard)          │
│                                      │
│ Segments (3)                         │
│ ───────────────────────────────────  │
│ 1. Warm-up: 1 km easy (6:00/km)     │
│ 2. Intervals: 3x800m @ 5:00/km      │
│ 3. Cool-down: 1 km easy             │
│                                      │
│ Coaching Focus                       │
│ ───────────────────────────────────  │
│ "Keep cadence above 175 steps/min   │
│  Push hard on the 800m repeats"     │
│                                      │
│ Equipment Check                      │
│ ───────────────────────────────────  │
│ ✓ GPS enabled                        │
│ ⚠��� Apple Watch connected             │
│ ✓ Garmin synced                      │
│                                      │
│ Warm-up Instructions                 │
│ ───────────────────────────────────  │
│ "Before starting, walk 2-3 minutes   │
│  then jog easy for 1km. You'll get   │
│  cues on pace & cadence when we      │
│  transition to intervals."           │
│                                      │
│ [Prepare Watch] [Start Session]     │
│                                      │
└──────────────────────────────────────┘
```

**Sections**:

### 1. Session Overview
- **Target distance** & **estimated duration**
- **Target pace** (average across all segments)
- **HR zone** (e.g., Zone 4-5, hard effort)
- **Session type badge** (Speed Work, Tempo, Long Run, etc.)

### 2. Segments Breakdown
- List each segment (warm-up, intervals, cool-down)
- Show: Distance, target pace, intensity level
- Tap segment for more details (optional)

### 3. Coaching Focus
- **Main coaching point** (1-2 sentences max)
- What to focus on during the run
- Example: "Maintain high cadence on hills" or "Stay relaxed in the last 2km"

### 4. Equipment Check
- ✓ **GPS enabled** — Always required
- ⚠️ **Apple Watch** — Optional (show if watch is available)
  - ✓ Connected
  - ✗ Not connected → "Pair your watch before starting"
- ✓ **Garmin device** — Optional (show if Garmin is linked)
  - ✓ Synced (last sync: 5 mins ago)
  - ✗ Not synced → "Last synced 2 hours ago. Sync now?" [button]

### 5. Warm-up Instructions
- Personalized warm-up guidance based on session type
- **Easy Run/Recovery**: "Walk 2 mins, then easy jog for 5 mins"
- **Speed Work**: "Dynamic stretching, easy 1km jog, then strides"
- **Long Run**: "Easy 10 min jog to warm muscles"

**State Variables** (SwiftUI):
```swift
@State var showWatchPrepareSheet = false
@State var isStartingSession = false
@State var error: String? = nil
@State var garmirSyncStatus: GarminSyncStatus = .checking
@State var watchConnectionStatus: WatchConnectionStatus = .unknown
```

**Actions**:

#### [Prepare Watch] Button
- Opens sheet to push session to Apple Watch
- Only visible if Apple Watch is available
- Calls `pushSessionToWatch()` function
- Shows loading state
- On success: "✓ Session sent to watch"
- On failure: "Failed to send to watch. Try again?"

#### [Start Session] Button
- Validates GPS is enabled
- Creates session record on backend
- Initializes session UI (transitions to Run Session Screen)
- If watch is prepared: sync session start across devices
- Enables real-time data streaming (Garmin, GPS, HR)

---

## ⌚ Prepare Watch Flow

**Purpose**: Send session data to Apple Watch and set up watchOS app to receive session cues.

### Backend to Watch Data Sync

**Payload sent to watch**:
```json
{
  "sessionId": "uuid",
  "title": "Speed Work",
  "segments": [
    {
      "segmentId": "seg1",
      "type": "warmup",
      "targetDistance": 1.0,
      "targetPace": "6:00/km",
      "intensity": "easy"
    },
    {
      "segmentId": "seg2",
      "type": "interval",
      "targetDistance": 0.8,
      "targetPace": "5:00/km",
      "intensity": "hard"
    }
  ],
  "coachingCues": [
    {
      "atDistance": 0.5,  // km
      "message": "You're on pace! Keep cadence up."
    }
  ]
}
```

### Prepare Watch Sheet (iPhone)

**UI**:
```
┌────────────────────────────────┐
│ Prepare Apple Watch            │
│                            X   │
├────────────────────────────────┤
│                                │
│ 📱 Sending session to watch... │
│                                │
│ [████████░░░░░░░░░░░] 60%     │
│                                │
│ We're loading your session     │
│ onto your Apple Watch so you   │
│ can run coaching-guided.       │
│                                │
│ What happens next:             │
│ • Session appears on watch     │
│ • Tap "Start" when you're      │
│   ready to run                 │
│ • Your phone will track GPS    │
│   and Garmin data              │
│ • You'll get cues every 200m   │
│                                │
│            [Continue]          │
│                                │
└────────────────────────────────┘
```

**States**:
1. **Sending**: Show progress bar + explanation
2. **Success**: "✓ Session ready on your watch!"
3. **Failure**: "Failed to send to watch. Try again?" [Retry]

**watchOS App Requirements**:
- Receives session payload via WatchConnectivity
- Displays session segments clearly
- "Start" button to begin
- Sends "sessionStarted" notification back to iPhone
- Waits for real-time cue data during run

---

## 📱 Phone Preparation (Pre-Run)

**Location**: Session Preparation screen

**Tasks to complete before pressing "Start Session"**:

1. **GPS Check**
   - Verify Location Services enabled
   - Request location permission if needed
   - Alert if GPS is disabled

2. **Audio Setup**
   - Test speaker volume (coaching cues audible)
   - Option to use headphones
   - Mute switch warning ("You'll miss cues if muted")

3. **Screen Lock**
   - Warn user to disable auto-lock
   - Or keep app in foreground (show banner)

4. **Battery**
   - Show current battery %
   - Warn if < 20% (may not last full session)
   - Option to enable Low Power Mode (will reduce cue frequency)

5. **Garmin Connection** (if applicable)
   - Check Garmin app is running in background
   - Last sync time displayed
   - Manual sync button available

**Code**:
```swift
func validatePhoneSetup() -> [ValidationError] {
    var errors: [ValidationError] = []
    
    // GPS check
    if !locationManager.authorizationStatus.isFullyAuthorized {
        errors.append(.gpsNotEnabled)
    }
    
    // Battery check
    let batteryLevel = UIDevice.current.batteryLevel
    if batteryLevel < 0.2 {
        errors.append(.lowBattery(percentage: Int(batteryLevel * 100)))
    }
    
    // Screen lock
    if UIApplication.shared.isIdleTimerDisabled == false {
        errors.append(.screenLockEnabled)
    }
    
    return errors
}

enum ValidationError {
    case gpsNotEnabled
    case lowBattery(percentage: Int)
    case screenLockEnabled
    case garmirNotSynced
}
```

---

## 🏃 Run Session UI

**Purpose**: Display real-time metrics, coaching cues, and segment progress during the run.

### Phone Run Session Screen

**Layout** (Primary view):
```
┌────────────────────────────────────┐
│                                    │
│ Speed Work — Interval 2 of 3      │
├────────────────────────────────────┤
│                                    │
│ Distance: 2.4 / 5.0 km  ███░░░    │
│                                    │
│ ⏱️  Elapsed: 13:42  |  Remaining: 14:08 │
│                                    │
│ [Large pace display]               │
│        5:28 /km                    │
│   (Target: 5:30)                   │
│   ✓ On pace!                       │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ 💓 HR: 172 bpm  (Zone 4)       │ │
│ │ 👟 Cadence: 178 spm  (Good!)   │ │
│ │ 🏔️ Elevation: 42m gained       │ │
│ └────────────────────────────────┘ │
│                                    │
│ 📍 Next segment in 0.3 km          │
│    Cool-down (easy pace)           │
│                                    │
│ Coaching Cue (animated):           │
│ ╔════════════════════════════════╗ │
│ ║ "Great pace! Push on next 200m" ║ │
│ ║ Show a little more fire! 🔥     ║ │
│ ╚════════════════════════════════╝ │
│                                    │
│ [Pause]  [Finish]                 │
│                                    │
└────────────────────────────────────┘
```

**Metrics Displayed**:

| Metric | Display | Update Frequency |
|--------|---------|------------------|
| **Distance** | "2.4 / 5.0 km" + progress bar | Every GPS update (~1 sec) |
| **Time** | Elapsed + Remaining estimate | Every second |
| **Pace** | Current pace + target pace | Every 100m |
| **Heart Rate** | BPM + Zone (1-5) | Every 1-2 sec (from Garmin or watch) |
| **Cadence** | Steps per minute + status | Every 1-2 sec |
| **Elevation** | Gain so far | Every GPS update |
| **Next Segment** | Distance to next, segment name | When approaching (< 500m) |

**Coaching Cues**:

**Trigger-based**:
- Every 200m milestone ("You're halfway through this interval!")
- Pace deviation (off by > 0.3 km/min: "You're running too fast, slow down")
- Cadence low (< 170): "Increase your cadence to 175+"
- HR zone changes: "You've entered Zone 5, be careful not to burn out"
- Segment transitions: "Great job! Now cool down for 1 km"

**Display**:
- Animated card that pops up briefly (3-5 seconds)
- Always plays audio cue + haptic feedback
- Can be dismissed by tapping
- Stored in queue if multiple cues trigger at once

**State Variables**:
```swift
@State var currentDistance: Double = 0
@State var currentPace: Double = 0  // km/min
@State var currentHR: Int = 0
@State var currentCadence: Int = 0
@State var currentSegmentIndex: Int = 0
@State var elapsedTime: Int = 0
@State var coachingCue: CoachingCue? = nil
@State var isPaused: Bool = false
@State var isSessionActive: Bool = false
```

**Actions**:

### [Pause] Button
- Pauses GPS tracking & Garmin sync
- Persists session state to local storage
- Shows pause screen with:
  - "Take a breather" message
  - Elapsed stats so far
  - [Resume] and [Finish] buttons

### [Finish] Button
- Confirmation dialog: "Mark this session as complete?"
- On confirm: Stop tracking, collect final metrics
- Transition to "Session Summary" screen

---

## ⌚ Watch Run Session UI

**Purpose**: Primary run tracking interface on Apple Watch (if watch is the main device).

**Watch Layout** (Series 8+, 45mm):
```
┌────────────────────┐
│ Speed Work (2/3)   │
├────────────────────┤
│                    │
│ 2.4 / 5.0 km       │
│ ████░░░░░░░░░░    │
│                    │
│ 5:28 /km           │
│ (Target: 5:30) ✓   │
│                    │
│ 172 bpm | 178 spm  │
│                    │
│ [Pause] [Finish]   │
│                    │
└────────────────────┘
```

**Updates from phone**: Real-time coaching cues are sent from iPhone to watch (via WatchConnectivity) and displayed as brief notifications.

**watchOS Implementation**:
- Receive location updates from the phone (via HealthKit or direct)
- Display metrics from HealthKit workouts
- Send user taps to phone (Pause/Finish)
- Receive coaching cues from phone in real-time
- Support offline mode (cache session data, sync later)

---

## 🟢 Garmin Watch Integration

**Purpose**: Feed live heart rate, GPS, and cadence data from Garmin device into the coaching session.

### Data Flow

```
Garmin Watch (e.g., Fenix 7, Epix)
    ↓ (Garmin app on iPhone syncs)
    ↓ (via Bluetooth + Garmin API)
Phone App (receives Garmin data)
    ↓ (real-time streaming)
Backend (processes metrics)
    ↓ (generates coaching cues)
Phone UI (displays cues)
    ↓ (sync to watch if applicable)
Apple Watch (shows cues)
```

### Garmin API Integration

**Requirements**:
- User has linked Garmin account (via OAuth)
- Garmin app running on iPhone
- Live data streaming enabled

**Data Points Received**:
- **Heart Rate**: Current BPM, zone (from device)
- **GPS**: Real-time lat/lon, altitude, GPS accuracy
- **Cadence**: Steps per minute (if sensor available)
- **Pace**: Calculated from GPS
- **Temperature**: Ambient (if sensor available)

**API Endpoint for Real-time Data**:
```
WebSocket: wss://api.airuncoach.live/sessions/{sessionId}/live-data

Connect when session starts.

Events sent to server:
{
  "type": "garmin_update",
  "sessionId": "uuid",
  "timestamp": "2026-07-14T15:12:34Z",
  "metrics": {
    "heartRate": 172,
    "gpsLatitude": 37.7749,
    "gpsLongitude": -122.4194,
    "altitude": 52,
    "cadence": 178,
    "pace": 5.28  // km/min
  }
}

Events received from server:
{
  "type": "coaching_cue",
  "message": "Great pace! Push on!",
  "priority": "high"
}
```

### Fallback Behavior

If Garmin is not available:
- Use **iPhone GPS** + **Apple Watch HR** (if watch available)
- Or use **iPhone GPS + manual input** (tap to record HR)
- Session can still complete, but with less precision on HR/cadence

---

## ✅ Session Completion Flow

**Purpose**: Mark the session as complete and ensure status syncs across all devices.

### Completion Trigger (Phone)

**When user taps [Finish] button**:

1. **Confirmation Dialog**:
   ```
   "Mark this session as complete?"
   Distance: 5.0 km ✓
   Duration: 28:15
   Avg Pace: 5:35 /km
   
   [Cancel] [Complete]
   ```

2. **Backend Call**:
   ```
   PATCH /api/coaching-plans/{sessionId}/complete
   Authorization: Bearer {token}
   Content-Type: application/json
   
   {
     "completedAt": "2026-07-14T15:28:34Z",
     "finalDistance": 5.0,
     "finalDuration": 1695,  // seconds
     "avgPace": 5.58,  // km/min
     "avgHeartRate": 168,
     "notes": "Great session!"
   }
   
   Response:
   {
     "sessionId": "uuid",
     "status": "completed",
     "completedAt": "2026-07-14T15:28:34Z",
     "summary": {
       "performanceScore": 92,
       "feedback": "Excellent pacing! You nailed the intervals."
     }
   }
   ```

3. **Sync to Watch** (if applicable):
   - Send "sessionCompleted" message via WatchConnectivity
   - Watch dismisses run UI and shows summary

4. **Transition to Summary Screen**

### Completion Trigger (Watch)

**When user taps [Finish] on watch**:

1. Watch sends "sessionCompleted" message to phone via WatchConnectivity
2. Phone confirms with backend
3. Phone receives updated session status
4. Both devices show completion summary

### Auto-Completion Detection

**Scenario**: User finishes on watch but doesn't explicitly tap [Finish]

- Watch detects workout ended (via HealthKit)
- Watch notifies phone: "Session ended at distance X"
- Phone confirms: "Is your session done?"
- User taps [Yes] → backend marks complete
- If user doesn't respond, reminder notification in 5 mins

---

## 📊 Session Summary Screen

**Purpose**: Show performance feedback and save session to history.

**Layout**:
```
┌─────────────────────────────────┐
│ Session Complete! 🎉            │
├─────────────────────────────────┤
│                                 │
│ Speed Work                      │
│ 5.0 km in 28:15                 │
│ Avg Pace: 5:35 /km              │
│                                 │
│ Key Metrics                     │
│ ────────────────────────────    │
│ 💓 Avg HR: 168 bpm (Zone 4)    │
│ 👟 Cadence: 177 spm             │
│ 🏔️  Elevation: 85m gained       │
│ 🔥 Calories: 342 kcal           │
│                                 │
│ AI Coach Feedback               │
│ ────────────────────────────    │
│ "Excellent pacing on the       │
│  intervals! Your cadence is     │
│  perfect. Next session we'll    │
│  push the intensity a bit       │
│  more to build speed."          │
│                                 │
│ Performance Score: 92/100 ⭐⭐⭐ │
│                                 │
│ Next Suggested Session:         │
│ Long Run - 10 km (Sunday)       │
│                                 │
│  [Save] [Share] [Done]         │
│                                 │
└─────────────────────────────────┘
```

**Data to Display**:

| Field | Source |
|-------|--------|
| Session title | From session definition |
| Distance & time | From GPS tracking |
| Average pace | distance / elapsed time |
| Average HR | From Garmin/Watch |
| Cadence | From Garmin/Watch |
| Elevation gain | From GPS |
| Calories burned | Calculated (HR + distance + user profile) |
| AI feedback | Generated by backend |
| Performance score | Calculated by backend (0-100) |
| Next session suggestion | From training plan |

**Actions**:

### [Save]
- Saves session to user's run history
- Syncs to backend
- Button becomes disabled after save

### [Share]
- Open share sheet to share on social media or messaging
- Pre-filled with: "Just completed a Speed Work session! 5.0 km in 28:15 min with AI coaching. #airuncoach #running"

### [Done]
- Returns to home dashboard
- Refreshes dashboard to show next coaching session

---

## 🔄 State Synchronization & Offline Support

### Phone ↔ Watch Sync

**Watch Connectivity Framework** (iOS):
```swift
import WatchConnectivity

class SessionSyncManager: NSObject, WCSessionDelegate {
    func sendSessionUpdate(sessionId: String, state: SessionState) {
        guard WCSession.default.activationState == .activated else { return }
        
        let message: [String: Any] = [
            "sessionId": sessionId,
            "state": state.rawValue,
            "distance": currentDistance,
            "elapsedTime": elapsedTime,
            "pace": currentPace,
            "hr": currentHR
        ]
        
        WCSession.default.sendMessage(message) { _ in }
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async {
            if message["action"] as? String == "finishSession" {
                self.completeSession()
            }
        }
    }
}
```

### Offline Mode

**If internet is lost during session**:
1. Phone caches GPS data locally
2. Caches HR/cadence if from Garmin (via Bluetooth)
3. Coaching cues generated locally (pre-cached)
4. Session continues normally
5. On internet restore: Sync all cached data to backend

**Cached Data Stored Locally**:
```swift
// CoreData or UserDefaults
struct CachedSessionData {
    var sessionId: String
    var gpsPoints: [GPSPoint]  // lat, lon, altitude, timestamp
    var metrics: [Metric]  // HR, cadence, pace over time
    var coachingCuesFired: [String]  // cue IDs shown to user
}
```

---

## 🗄️ Data Models

### Swift Models

```swift
// Session
struct CoachingSession: Codable {
    let sessionId: String
    let title: String
    let type: SessionType
    let targetDistance: Double
    let estimatedDuration: Int
    let scheduledTime: Date?
    let segments: [SessionSegment]
    let coachingFocus: String
    let status: SessionStatus
    var startedAt: Date?
    var completedAt: Date?
}

enum SessionType: String, Codable {
    case interval, tempo, steady, easy, longRun
}

enum SessionStatus: String, Codable {
    case ready, inProgress, paused, completed, expired
}

struct SessionSegment: Codable {
    let segmentId: String
    let type: SegmentType
    let targetDistance: Double
    let targetPace: String
    let intensity: String
    let duration: Int
}

enum SegmentType: String, Codable {
    case warmup, interval, recovery, cooldown, steady
}

struct CoachingCue: Codable {
    let cueId: String
    let message: String
    let triggeredAt: Double  // km distance
    let priority: CuePriority
    let audio: String?  // URL to audio file
}

enum CuePriority: String, Codable {
    case info, warning, critical
}

// Real-time metrics
struct LiveMetrics: Codable {
    var heartRate: Int?
    var cadence: Int?
    var pace: Double?
    var altitude: Double?
    var temperature: Double?
    var gpsAccuracy: Double?
}

// Session summary
struct SessionSummary: Codable {
    let sessionId: String
    let finalDistance: Double
    let finalDuration: Int
    let avgPace: Double
    let avgHeartRate: Int?
    let maxHeartRate: Int?
    let avgCadence: Int?
    let elevationGain: Double?
    let caloriesBurned: Int?
    let performanceScore: Int
    let aiFeedback: String
    let nextSuggestedSession: SessionSuggestion?
}
```

---

## 🔌 API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/coaching-plans/today-session` | GET | Fetch today's session |
| `/api/sessions/{sessionId}` | GET | Get session details |
| `/api/sessions/{sessionId}/start` | POST | Mark session as started |
| `/api/sessions/{sessionId}/complete` | PATCH | Mark session as completed |
| `/api/sessions/{sessionId}/pause` | PATCH | Pause session |
| `/api/sessions/{sessionId}/resume` | PATCH | Resume paused session |
| `wss://api.airuncoach.live/sessions/{sessionId}/live-data` | WebSocket | Stream live metrics |
| `/api/sessions/{sessionId}/summary` | GET | Fetch session summary |

---

## ⚠️ Error Handling

| Scenario | Error Message | Action |
|----------|---------------|--------|
| No session today | "No coaching session scheduled" | Show button to view training plan |
| GPS not enabled | "GPS is required to start" | Prompt to enable in Settings |
| Session expired | "This session is no longer available" | Suggest next session from plan |
| Watch disconnected | "⚠️ Apple Watch not connected" | Warning badge, session continues on phone |
| Garmin sync failed | "Last synced 2 hours ago" | Manual sync button |
| Internet lost mid-run | Session continues offline, syncs when restored | Show "offline mode" banner |
| Backend error | "Failed to save session. Try again?" | Retry button |

---

## 🎨 Design System

### Colors

| Element | Color | Usage |
|---------|-------|-------|
| **Primary** | `#00BFFF` | Buttons, action elements |
| **Success** | `#22C55E` | "On pace", completed state |
| **Warning** | `#FEF3C7` | Equipment warnings |
| **Error** | `#EF4444` | Critical errors |
| **HR Zone 1** | `#3B82F6` | Easy effort (blue) |
| **HR Zone 2** | `#8B5CF6` | Moderate (purple) |
| **HR Zone 3** | `#F59E0B` | Hard (orange) |
| **HR Zone 4-5** | `#EF4444` | Very hard (red) |

### Typography

- **Session Title**: 24pt bold
- **Metric Value**: 32pt bold (pace, distance)
- **Metric Label**: 12pt regular
- **Coaching Cue**: 16pt bold (message) + 14pt regular (explanation)
- **Body Text**: 14pt regular

### Spacing

Standard: 8pt unit
- xs = 4pt
- sm = 8pt
- md = 12pt
- lg = 16pt
- xl = 24pt
- xxl = 32pt

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Session data parsing (API response → model)
- [ ] Pace calculation (distance / time)
- [ ] HR zone classification
- [ ] Coaching cue triggering logic
- [ ] Session completion validation
- [ ] Offline data caching
- [ ] Watch connectivity message encoding/decoding

### Integration Tests
- [ ] Dashboard displays correct session card
- [ ] Preparation screen loads with correct data
- [ ] Starting session syncs to backend
- [ ] GPS tracking starts when session starts
- [ ] Garmin data received and displayed
- [ ] Coaching cues triggered at correct distances
- [ ] Session completion persists to backend
- [ ] Summary screen shows correct metrics
- [ ] Watch receives session data and updates
- [ ] Offline mode caches data correctly
- [ ] Re-sync after internet restored

### E2E Tests

**Scenario 1: Simple Phone-Only Session**
1. [ ] Launch app, see coaching session on dashboard
2. [ ] Tap "Start" → Preparation screen
3. [ ] Tap "Start Session" → Run screen
4. [ ] GPS tracking active, metrics updating
5. [ ] Run for 2 mins, receive coaching cue
6. [ ] Tap "Finish" → Summary screen
7. [ ] Session saved to history

**Scenario 2: Session with Apple Watch**
1. [ ] On Preparation screen, watch available
2. [ ] Tap "Prepare Watch" → watch receives session
3. [ ] Start session on watch
4. [ ] Phone receives "watch session started"
5. [ ] Both devices show metrics in sync
6. [ ] Finish on watch → phone syncs completion

**Scenario 3: Session with Garmin**
1. [ ] Garmin linked and synced
2. [ ] Start session
3. [ ] Garmin HR and cadence appear in run UI
4. [ ] Coaching cues generated based on Garmin data
5. [ ] Session summary shows Garmin metrics
6. [ ] All data synced to backend

**Scenario 4: Offline Session**
1. [ ] Start session, disable internet
2. [ ] GPS tracking continues (offline)
3. [ ] Coaching cues cached and shown
4. [ ] Finish session
5. [ ] Re-enable internet
6. [ ] Session auto-syncs to backend

---

## 🚀 Implementation Order

### Phase 1: Dashboard & Preparation (1 day)
1. Create `CoachingSessionCard` component for dashboard
2. Implement `SessionPreparationScreen` UI
3. Wire dashboard to show today's session
4. Implement equipment check validations
5. Test session loading from API

### Phase 2: Run Session UI (1 day)
1. Create `RunSessionScreen` with metric displays
2. Implement GPS tracking integration
3. Display distance, pace, HR, cadence
4. Build coaching cue system (display + audio)
5. Test metric updates in real-time

### Phase 3: Watch Integration (1 day)
1. Set up `SessionSyncManager` for Watch Connectivity
2. Implement "Prepare Watch" flow
3. Create watch session data payload
4. Test session sync to watch app
5. Test completion sync back to phone

### Phase 4: Garmin Integration (1 day)
1. Set up WebSocket client for live data
2. Parse Garmin metrics (HR, cadence, pace)
3. Display Garmin data in run UI
4. Auto-sync Garmin data to backend
5. Test Garmin fallback if Garmin unavailable

### Phase 5: Completion & Summary (1 day)
1. Implement session completion flow
2. Build `SessionSummaryScreen` with metrics
3. Generate AI feedback (backend integration)
4. Test offline data sync
5. End-to-end testing of full session flow

### Phase 6: Polish & Testing (1 day)
1. Add animations and transitions
2. Refine error messages and handling
3. Test on real devices (iPhone + watch)
4. Performance optimization
5. Final edge case testing

**Total Timeline**: 5-6 days for full feature

---

## 📋 Implementation Checklist

- [ ] **Dashboard Component**
  - [ ] Session card displays on home screen
  - [ ] Status badges show correctly
  - [ ] Tap "Start" navigates to preparation screen

- [ ] **Preparation Screen**
  - [ ] Session details load from API
  - [ ] Equipment check validates GPS, watch, Garmin
  - [ ] Warm-up instructions display
  - [ ] "Prepare Watch" button initiates sync
  - [ ] "Start Session" button validates and starts

- [ ] **Run Session UI**
  - [ ] GPS tracking enabled and accurate
  - [ ] Distance/pace/HR/cadence display in real-time
  - [ ] Coaching cues trigger and display correctly
  - [ ] Pause/finish buttons functional
  - [ ] Offline mode caches data

- [ ] **Watch Integration**
  - [ ] Watch receives session payload
  - [ ] Watch app displays run metrics
  - [ ] Completion on watch syncs to phone
  - [ ] Watch connectivity handles disconnections

- [ ] **Garmin Integration**
  - [ ] WebSocket connects and receives metrics
  - [ ] HR and cadence displayed from Garmin
  - [ ] Coaching cues generated from Garmin data
  - [ ] Data syncs to backend

- [ ] **Session Completion**
  - [ ] Completion confirmation dialog shows
  - [ ] Backend persists session data
  - [ ] Summary screen displays all metrics
  - [ ] AI feedback generated and shown
  - [ ] Session saved to history

- [ ] **Testing**
  - [ ] All unit tests pass
  - [ ] Integration tests validate API calls
  - [ ] E2E scenarios all pass
  - [ ] Real device testing (iPhone 15 Pro, Apple Watch S9, Garmin Fenix 7)
  - [ ] Edge cases handled (offline, disconnections, low battery)

---

## 🔐 Security & Privacy

1. **Session Data**: Encrypted in transit (HTTPS/TLS)
2. **GPS Data**: Not stored long-term, only aggregated metrics
3. **Heart Rate**: From device sensors, never stored raw
4. **Watch Connectivity**: Uses Apple's secure messaging protocol
5. **Garmin Data**: Verified via Garmin OAuth token
6. **User Privacy**: No tracking data shared with third parties

---

## 📝 Notes & Special Considerations

1. **Offline-First**: All core features work offline; sync when internet returns
2. **Battery**: Long sessions (60+ mins) may drain battery; recommend charger
3. **Accuracy**: GPS accuracy varies; cues update based on confidence
4. **Watch Battery**: Watch may drain faster during live tracking; user should charge
5. **Garmin Lag**: Garmin data may have 1-2 second latency; account for in cue timing
6. **Accessibility**: Coaching cues in audio + haptic + visual for accessibility
7. **Internationalization**: All text must be translated; distances in km/miles per user setting

---

## 📚 References

- **Apple WatchConnectivity**: `https://developer.apple.com/documentation/watchconnectivity`
- **HealthKit Framework**: `https://developer.apple.com/documentation/healthkit`
- **CoreLocation (GPS)**: `https://developer.apple.com/documentation/corelocation`
- **Garmin API Docs**: `https://developer.garmin.com/`
- **WebSocket in Swift**: `URLSessionWebSocketTask`

---

## ✅ Final Summary

**AI Coaching Plan Session** is a **comprehensive multi-device feature** that:

✅ **Dashboard**: Shows today's session with status and quick-start  
✅ **Preparation**: Guides user through pre-run checks and watch sync  
✅ **Execution**: Real-time metrics, coaching cues, GPS tracking  
✅ **Completion**: Auto-detection on phone or watch, summary with AI feedback  
✅ **Sync**: Full phone ↔ watch ↔ Garmin synchronization  
✅ **Offline**: Works without internet, syncs when restored  

**Key User Value**: Users get **personalized in-run coaching** with **real-time metrics** across **all their devices**, making runs more guided, effective, and enjoyable.

**Complexity**: High (multiple screens, real-time data, multi-device sync)  
**Timeline**: 5-6 days full implementation  
**Impact**: Core engagement feature; critical for product success  

**Everything is ready to build!** 🚀
