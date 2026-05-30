# iOS Live Run Observer Push Notification Brief

**Status**: Ready for iOS Implementation  
**Based On**: Android implementation (completed May 30, 2026)  
**Scope**: Push notification handling + observer UI for Share Live Run feature

---

## Overview

Observers invited to watch a runner's live session should:
1. **Receive push notification** when runner shares with them
2. **Tap notification** → navigate to observer session screen
3. **See "waiting" state** if runner hasn't started yet
4. **See live map + metrics** once runner begins running

---

## What Already Exists (Server-Side)

✅ **Backend Endpoint**: `POST /api/live-sessions/{sessionId}/invite-observer`
- Validates friendship & session ownership
- Sends FCM push with `type: "live_run_invite"` payload

✅ **Live Session Data**: `GET /api/live-sessions/{sessionId}`
- Returns runner's position, pace, distance, HR, elapsed time
- Includes `hasStarted` boolean and `gpsTrack` array

✅ **Push Payload Structure**:
```json
{
  "title": "{runnerName} invited you to watch their run",
  "body": "Watch their live location and route in real-time",
  "data": {
    "type": "live_run_invite",
    "sessionId": "abc-123",
    "runnerId": "user-123",
    "runnerName": "Alice",
    "routeId": "route-456",
    "hasStarted": "false"
  }
}
```

---

## iOS Implementation Required

### 1. Push Notification Handling

**File**: `AppDelegate.swift` (or relevant notification handling)

**What to do**:
- Check for `type == "live_run_invite"` in push payload's `data` dictionary
- Extract `sessionId` and `runnerName` from push data
- Route to observer session screen (deep link)

**Example**:
```swift
if let data = userInfo as? [String: String],
   data["type"] == "live_run_invite",
   let sessionId = data["sessionId"] {
    // Open observer session screen with sessionId
    navigateToObserverSession(sessionId: sessionId)
}
```

---

### 2. Deep Link Routing

**Add to App Routes** (wherever your deep link handling exists):
- Route scheme: `airuncoach://observer-session/{sessionId}`
- Also handle push notification tap (see above)
- Priority: Observer session should open full screen (not modal)

---

### 3. Observer Session Screen

**Create new SwiftUI View**: `ObserverRunSessionView.swift`

**Structure**:
```swift
struct ObserverRunSessionView: View {
    let sessionId: String
    @StateObject var viewModel: ObserverRunSessionViewModel
    
    var body: some View {
        ZStack {
            if viewModel.isLoading {
                LoadingView()
            } else if let error = viewModel.error {
                ErrorView(error: error, onRetry: { viewModel.loadSession() })
            } else if let session = viewModel.session {
                if session.hasStarted {
                    LiveRunMapView(session: session)
                } else {
                    WaitingForRunnerView(runnerName: session.runnerName)
                }
            }
        }
        .onAppear { viewModel.loadSession(sessionId) }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(viewModel.session?.hasStarted == true ? "Live Run" : "Run Invitation")
                    .font(.headline)
            }
            ToolbarItem(placement: .navigationBarLeading) {
                BackButton()
            }
        }
    }
}
```

**Key States**:
1. **Loading** → Show spinner + "Loading run session..."
2. **Error** → Show error message + retry button
3. **Not Started** → `WaitingForRunnerView`
4. **Active** → `LiveRunMapView`

---

### 4. Waiting Screen

**File**: `WaitingForRunnerView.swift`

**Display**:
```
    🔄 [Spinner]
    
    Waiting for {runnerName} to start the run session
    
    You'll see their live location and metrics once they begin
    
    [Cancel Button]
```

**Behavior**:
- Poll server every 3 seconds for session updates
- Auto-transition to `LiveRunMapView` when `hasStarted` becomes true
- Show spinner to indicate active polling
- Cancel button dismisses view

---

### 5. Live Map + Metrics View

**File**: `LiveRunMapView.swift`

**Layout**:
```
┌─────────────────────────────┐
│   Map (runner's location)    │  ← 70% of screen
│   + polyline of GPS track    │
└─────────────────────────────┘
┌─────────────────────────────┐
│  Metrics Panel              │  ← 30% of screen
│  Distance | Time | Pace | HR│
└─────────────────────────────┘
         [Exit Button]
```

**Map Requirements**:
- Center on runner's `currentLat` / `currentLng`
- Draw polyline from `gpsTrack` array (if available)
- Pin marker at runner's current position
- Zoom level ~17

**Metrics**:
- **Distance**: `%.2f km`
- **Time**: Format as `H:MM:SS` or `MM:SS`
- **Pace**: Display `currentPace` string (from server)
- **Heart Rate**: Only show if `currentHeartRate > 0`

**Auto-Refresh**:
- Poll server every 2 seconds for updated metrics
- Smooth map panning to new position
- Update metrics in real-time

---

### 6. View Model

**File**: `ObserverRunSessionViewModel.swift`

**Responsibilities**:
```swift
@MainActor
class ObserverRunSessionViewModel: ObservableObject {
    @Published var session: ObserverLiveSession?
    @Published var error: String?
    @Published var isLoading = false
    
    private let apiService: APIService
    private var pollingTask: Task<Void, Never>?
    
    func loadSession(_ sessionId: String) async {
        // 1. Fetch initial session data
        // 2. Start polling based on hasStarted state
    }
    
    private func startActivePolling(_ sessionId: String) {
        // Poll every 2 seconds (running)
    }
    
    private func startWaitingPolling(_ sessionId: String) {
        // Poll every 3 seconds (waiting)
        // Auto-upgrade to active polling when hasStarted becomes true
    }
}

struct ObserverLiveSession: Codable {
    let id: String
    let userId: String
    let runnerName: String
    let currentLat: Double?
    let currentLng: Double?
    let distanceCovered: Double
    let elapsedTime: Int
    let currentPace: String?
    let currentHeartRate: Int?
    let hasStarted: Boolean
    let startedAt: Date?
    let routeId: String?
    let gpsTrack: [GpsPoint]?
}

struct GpsPoint: Codable {
    let lat: Double
    let lng: Double
    let timestamp: Int
    let altitude: Double?
}
```

---

### 7. API Service Extension

**Add to existing `APIService`**:

```swift
func getLiveSession(sessionId: String) async throws -> ObserverLiveSession {
    let endpoint = "/api/live-sessions/\(sessionId)"
    return try await request(endpoint, method: "GET")
}
```

---

## Integration Checklist

- [ ] Handle `type == "live_run_invite"` in push notification handler
- [ ] Extract `sessionId` from push data
- [ ] Route to observer session screen
- [ ] Create `ObserverRunSessionView.swift`
- [ ] Create `WaitingForRunnerView.swift`
- [ ] Create `LiveRunMapView.swift`
- [ ] Create `ObserverRunSessionViewModel.swift`
- [ ] Update `APIService` with `getLiveSession()` method
- [ ] Test cold launch (app not running → push → observe)
- [ ] Test warm launch (app running → push → observe)
- [ ] Test waiting → active transition
- [ ] Test map and metrics real-time updates
- [ ] Test error handling and retry flow

---

## Design Notes

### UI/UX
- Use existing app theme colors (primary, background, text)
- Match RunSession screen styling where possible
- Waiting spinner should be subtle but clear
- Metrics should be in clean card layout (similar to Android)

### Performance
- Start polling only when screen is visible
- Stop polling when screen dismisses
- Debounce map center updates (only pan if distance > 10m)
- Cache session data during re-renders

### Error Handling
- If `hasStarted` is nil, treat as `false`
- If GPS data is missing, show "Waiting for GPS signal..."
- If session not found (404), show "Run session ended"
- Retry button allows user to re-fetch

### Real-Time Updates
- Use `@State` + `.onReceive()` or `AsyncSequence` for polling
- Cancel polling task in `onDisappear`
- Smooth map animations for position updates

---

## Testing Scenarios

1. **Happy Path**:
   - Receive push → tap → see waiting state → runner starts → see live map

2. **Already Started**:
   - Receive push for session already in progress → show map immediately

3. **Network Error**:
   - Show error → user taps retry → recovers

4. **Map Missing GPS**:
   - No GPS data yet → show "Waiting for GPS signal..."

5. **Session Ended**:
   - Get 404 from API → show "Run session ended"

---

## Dependencies

- **MapKit** (built-in) or **Google Maps SDK** (if consistency with Android preferred)
- Existing `APIService`
- Existing navigation/routing system

---

## References

- Android implementation: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ObserverRunSessionScreen.kt`
- Android ViewModel: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/ObserverRunSessionViewModel.kt`
- Server API: `POST /api/live-sessions/{sessionId}/invite-observer` and `GET /api/live-sessions/{sessionId}`

---

## Questions?

If anything is unclear:
- Check the Android implementation for UI/UX patterns
- Verify API response format by testing endpoints directly
- Look at existing RunSession screen for reference styling
