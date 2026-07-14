# iOS Group Run Feature — Complete Implementation Brief

**Status**: Ready for Xcode AI Implementation  
**Scope**: Full group run feature including create, join, run together, view results  
**Reference**: Android implementation complete (version 1.7+)  
**Timeline**: 4-5 days for full feature

---

## 📋 Executive Summary

**Group Run** is a complete social running feature that lets friends create, organize, and run together as a group. After the run, participants see a leaderboard with sortable stats and AI debrief.

### Three Main Components:
1. **Create Group Run Screen** — Organiser creates and publishes group runs
2. **Group Run Detail Screen** — Participants view, RSVP, and start together
3. **Group Run Results Tab** — Leaderboard with stats, sorting, and AI debrief (on RunSummaryView)

### Push Notifications:
- **Group Run Invite**: Participant receives notification to join
- **Group Run Started**: Organiser starts run, participants notified to begin
- **Tapping notification**: Deep links directly to group run detail screen

### Garmin Watch Support:
- plannedWorkoutId is passed through to watch for auto-completion
- Watch tracking includes group run context

---

## 🎯 Feature Overview

### User Flows

#### 1. Organiser Creates Group Run
```
Dashboard
  ↓
"Create Group Run" button
  ↓
Create Screen (date, location, distance, max participants, public/private)
  ↓
Save → Group Run Created
  ↓
Group Run Detail Screen (organiser view)
```

#### 2. Friend Receives Invite & Joins
```
Friend receives PUSH: "Alice invited you to group run"
  ↓
Tap notification → Group Run Detail Screen
  ↓
View event details
  ↓
"Accept" button → Mark as accepted
  ↓
Wait for organiser to start
```

#### 3. Organiser Starts Run
```
Organiser: "Mark Ready" → Status changes to ready
  ↓
All participants get PUSH: "Group run starting soon"
  ↓
Organiser: "Start Run" button
  ↓
System creates RunSession with groupRunId
  ↓
All participants notified: "Run has started"
  ↓
Participants tap notification → Observer screen (watches organiser)
```

#### 4. After Run Completes
```
Organiser finishes run
  ↓
RunSummaryView shows with "Group Run Results" tab
  ↓
Tab shows leaderboard + AI debrief
  ↓
All participants' runs auto-linked to group run
  ↓
Stats sortable by pace, time, HR, cadence, elevation
```

---

## 📱 UI Specifications

### Screen 1: Create Group Run Screen

**Purpose**: Organiser creates a new group run event

**Layout**:
```
┌──────────────────────────────┐
│ ← Create Group Run      [X] │
├──────────────────────────────┤
│                              │
│ Group Run Name               │
│ [5K Together            ]    │
│                              │
│ Description (optional)       │
│ [Summer training run    ]    │
│                              │
│ Date & Time                  │
│ [Sun, 20 Jul, 6:00 AM ] ▼   │
│                              │
│ Distance (km)                │
│ [5.0                   ]     │
│                              │
│ Meeting Point (optional)     │
│ [Central Park          ]     │
│                              │
│ [📍] Get Location            │
│                              │
│ Max Participants             │
│ [10                    ]     │
│                              │
│ Visibility                   │
│ ☑ Make this group run public │
│                              │
│     [Cancel]   [Create Run]  │
│                              │
└──────────────────────────────┘
```

**Fields**:
- **Group Run Name** (required) — Text input, max 100 chars
- **Description** (optional) — Text input, max 500 chars
- **Date & Time** (required) — Date picker + time picker
- **Distance** (required) — Double, in km
- **Meeting Point** (optional) — Text input or map location picker
- **Max Participants** (required) — Integer, min 2, default 10
- **Public/Private** (required) — Toggle, default true (public)

**Actions**:
- **Cancel** — Discard and return to Dashboard
- **Create Run** — POST to `/api/group-runs`, navigate to Group Run Detail
- **Validation** — Name + date/time + distance required, show errors inline

---

### Screen 2: Group Run Detail Screen

**Two Views**: Organiser vs Participant

#### 2A. Organiser View

**Layout** (before start):
```
┌──────────────────────────────┐
│ ← 5K Together          [...]│
├──────────────────────────────┤
│                              │
│ SUN, 20 JUL • 6:00 AM       │
│ Central Park • 5.0 km        │
│                              │
│ ┌──────────────────────────┐ │
│ │ 🗺️ [Map of meeting point]│ │
│ │ Tap for directions       │ │
│ └──────────────────────────┘ │
│                              │
│ Participants: 6/10           │
│                              │
│ ✅ Alice (You - Organiser)   │
│ ✅ Bob                        │
│ ⏳ Carol (Invited)            │
│ ❌ Dave (Declined)           │
│ ? Emily (No response)        │
│ ✅ Frank                      │
│                              │
│ [+ Invite Friends] [Share]   │
│                              │
│ ┌──────────────────────────┐ │
│ │  [Mark Ready to Start] ▶ │ │
│ └──────────────────────────┘ │
│                              │
│ (After Mark Ready:)          │
│ ┌──────────────────────────┐ │
│ │     [Start Run Now] ▶    │ │
│ └──────────────────────────┘ │
│                              │
│ ❌ [Cancel/Delete Run]       │
│                              │
└──────────────────────────────┘
```

**Organiser Actions**:
- **Invite Friends** — Opens friend picker dialog
- **Share** — Share via Messages, Mail, social
- **Mark Ready** — Sets status to "ready", notifies participants
- **Start Run** — Creates RunSession with groupRunId, notifies all
- **Cancel Run** — Deletes group run (only if not started)

#### 2B. Participant View (Before Accepting)

**Layout**:
```
┌──────────────────────────────┐
│ ← 5K Together               │
├──────────────────────────────┤
│                              │
│ SUN, 20 JUL • 6:00 AM       │
│ Central Park • 5.0 km        │
│                              │
│ 🗺️ [Map of meeting point]    │
│                              │
│ Organiser: Alice             │
│ Participants: 6/10           │
│                              │
│ ✅ Alice                      │
│ ✅ Bob                        │
│ ⏳ Carol (Invited)            │
│                              │
│ Your Response:               │
│ [ Accept ]  [ Decline ]      │
│                              │
│ (After Accept:)              │
│ ┌──────────────────────────┐ │
│ │ ✅ You're in!           │ │
│ │ Wait for organiser to   │ │
│ │ start the run.          │ │
│ └──────────────────────────┘ │
│                              │
└──────────────────────────────┘
```

**Participant Actions**:
- **Accept** — POST `/api/group-runs/:id/respond` with "accepted"
- **Decline** — POST `/api/group-runs/:id/respond` with "declined"
- **Watch for Start** — Status updates when organiser starts

#### 2C. After Run Started

```
┌──────────────────────────────┐
│ ← 5K Together               │
├──────────────────────────────┤
│                              │
│ 🟢 RUN IN PROGRESS           │
│                              │
│ Organiser is running!        │
│                              │
│ [🔴 Watch Live] [Join Run]   │
│                              │
│ Participants:                │
│ 🟢 Alice (Running)           │
│ 🟡 Bob (Running)             │
│ ⚫ Carol (Not started)        │
│ ⚪ Dave (Not running)         │
│                              │
└──────────────────────────────┘
```

---

### Screen 3: Group Run Results Tab (in RunSummaryView)

**Location**: RunSummaryView has multiple tabs: Details, Insights, **Results** (if group run)

**See detailed spec in**: `iOS_GROUP_RUN_RESULTS_TAB.md`

**Summary**:
- Leaderboard with sortable stats (Pace, Time, HR, Cadence, Elevation)
- AI debrief card with placement info
- Current user highlighted
- "Still running…" for participants without completed stats

---

## 🏗️ Architecture

### Data Models

#### GroupRun (Domain Model)
```swift
struct GroupRun: Codable {
    let id: String
    let name: String?
    let description: String?
    let creatorId: String?
    let creatorName: String?
    let meetingPoint: String?
    let meetingLat: Double?
    let meetingLng: Double?
    let distance: Double?
    let dateTime: String?  // ISO 8601
    let maxParticipants: Int?
    let currentParticipants: Int?
    let isPublic: Bool
    let status: String?    // "scheduled", "in_progress", "completed", "cancelled"
    let isJoined: Bool
    let isOrganiser: Bool
    let myInvitationStatus: String?  // "pending", "accepted", "declined"
    let participants: [GroupRunParticipant]?
    let createdAt: String?
    let inviteToken: String?
}

struct GroupRunParticipant: Codable {
    let userId: String
    let userName: String
    let profilePic: String?
    let invitationStatus: String  // "pending", "accepted", "declined"
    let role: String              // "organiser", "participant"
    let runId: String?            // Linked run session after completion
    let readyToStart: Bool
    let completedAt: String?      // When they finished
}
```

#### Create Request
```swift
struct CreateGroupRunRequest: Codable {
    let name: String
    let description: String?
    let meetingPoint: String?
    let meetingLat: Double?
    let meetingLng: Double?
    let distance: Double
    let dateTime: String    // ISO 8601
    let maxParticipants: Int
    let isPublic: Bool
}
```

#### Group Run Results
```swift
struct GroupRunResultsResponse: Codable {
    let groupRunId: String
    let groupRunName: String?
    let results: [GroupRunParticipantResult]
}

struct GroupRunParticipantResult: Codable {
    let userId: String
    let userName: String
    let profilePic: String?
    let runId: String?
    let completedAt: String?
    let isCurrentUser: Bool
    let runSession: RunSession?  // Full run data for stats
}

struct GroupRunDebriefResponse: Codable {
    let debrief: String
    let rank: Int?
    let totalFinishers: Int?
}
```

---

## 🔗 API Integration

### Endpoints Required

#### 1. Create Group Run
```
POST /api/group-runs

Headers:
  Authorization: Bearer {token}
  Content-Type: application/json

Request Body:
{
  "name": "5K Together",
  "description": "Summer training run",
  "meetingPoint": "Central Park",
  "meetingLat": 40.7829,
  "meetingLng": -73.9654,
  "distance": 5.0,
  "dateTime": "2026-07-20T06:00:00Z",
  "maxParticipants": 10,
  "isPublic": true
}

Response:
{
  "id": "group-run-uuid-123",
  "name": "5K Together",
  "status": "scheduled",
  ... full GroupRun object
}
```

#### 2. Get Group Run Details
```
GET /api/group-runs/:id

Headers:
  Authorization: Bearer {token}

Response:
{
  "id": "group-run-uuid-123",
  "name": "5K Together",
  "participants": [...]
  ... full GroupRun object
}
```

#### 3. List Group Runs (Dashboard)
```
GET /api/group-runs?status=scheduled,in_progress,completed

Headers:
  Authorization: Bearer {token}

Query Params:
  status: comma-separated values
  limit: 20
  offset: 0

Response:
{
  "groupRuns": [
    { ... GroupRun objects ... }
  ],
  "count": 15,
  "total": 42
}
```

#### 4. Respond to Invitation
```
POST /api/group-runs/:id/respond

Headers:
  Authorization: Bearer {token}
  Content-Type: application/json

Request Body:
{
  "response": "accepted"  // or "declined"
}

Response:
{
  ... updated GroupRun object
}
```

#### 5. Mark Ready to Start
```
POST /api/group-runs/:id/mark-ready

Headers:
  Authorization: Bearer {token}

Response:
{
  ... updated GroupRun object
}
```

#### 6. Start Group Run
```
POST /api/group-runs/:id/start

Headers:
  Authorization: Bearer {token}

Response:
{
  ... updated GroupRun object
  (or 204 No Content)
}
```

#### 7. Invite Friends
```
POST /api/group-runs/:id/invite

Headers:
  Authorization: Bearer {token}
  Content-Type: application/json

Request Body:
{
  "userIds": ["user-uuid-1", "user-uuid-2", "user-uuid-3"]
}

Response:
{
  "success": true,
  "invited": 3
}
```

#### 8. Get Group Run Results
```
GET /api/group-runs/:id/results

Headers:
  Authorization: Bearer {token}

Response:
{
  "groupRunId": "group-run-uuid-123",
  "groupRunName": "5K Together",
  "results": [
    {
      "userId": "user-1",
      "userName": "Alice",
      "isCurrentUser": true,
      "completedAt": "2026-07-20T06:27:33Z",
      "runSession": { ... full RunSession object ... }
    },
    ...
  ]
}
```

#### 9. Get AI Debrief
```
POST /api/group-runs/:id/debrief

Headers:
  Authorization: Bearer {token}

Response:
{
  "debrief": "Great effort from everyone! You held #2 position...",
  "rank": 2,
  "totalFinishers": 6
}
```

#### 10. Cancel/Delete Group Run
```
DELETE /api/group-runs/:id

Headers:
  Authorization: Bearer {token}

Response:
{
  "success": true
}
(Only allowed for organiser before run starts)
```

---

## 📲 Push Notifications

### Notification Types

#### 1. Group Run Invite
```json
{
  "aps": {
    "alert": {
      "title": "Alice invited you",
      "body": "Join the 5K Together group run on Sun, 20 Jul at 6:00 AM"
    },
    "sound": "default",
    "badge": 1,
    "mutableContent": true
  },
  "type": "group_run_invite",
  "groupRunId": "group-run-uuid-123",
  "groupRunName": "5K Together",
  "organizerName": "Alice"
}
```

#### 2. Group Run Started
```json
{
  "aps": {
    "alert": {
      "title": "Group run starting!",
      "body": "Alice has started the 5K Together group run. Get running!"
    },
    "sound": "default",
    "badge": 1
  },
  "type": "group_run_started",
  "groupRunId": "group-run-uuid-123",
  "groupRunName": "5K Together",
  "organizerName": "Alice"
}
```

#### 3. Group Run Ready Notification (to others)
```json
{
  "aps": {
    "alert": {
      "title": "Group run ready",
      "body": "Alice is ready. Get prepared for the 5K Together run!"
    }
  },
  "type": "group_run_ready",
  "groupRunId": "group-run-uuid-123"
}
```

### Push Handling Code

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
) {
    let userInfo = response.notification.request.content.userInfo
    
    guard let type = userInfo["type"] as? String else {
        completionHandler()
        return
    }
    
    switch type {
    case "group_run_invite", "group_run_started", "group_run_ready":
        if let groupRunId = userInfo["groupRunId"] as? String {
            // Navigate to Group Run Detail screen
            navigationManager.navigate(to: .groupRunDetail(groupRunId))
        }
    default:
        break
    }
    
    completionHandler()
}
```

---

## 💾 View Models & State Management

### CreateGroupRunViewModel

```swift
@MainActor
class CreateGroupRunViewModel: ObservableObject {
    @Published var name: String = ""
    @Published var description: String = ""
    @Published var meetingPoint: String = ""
    @Published var latitude: Double?
    @Published var longitude: Double?
    @Published var distance: Double = 5.0
    @Published var selectedDateTime: Date = Date()
    @Published var maxParticipants: Int = 10
    @Published var isPublic: Bool = true
    
    @Published var isLoading = false
    @Published var error: String?
    @Published var createdGroupRunId: String?
    
    private let apiService: ApiService
    
    func createGroupRun() async {
        isLoading = true
        error = nil
        
        let request = CreateGroupRunRequest(
            name: name,
            description: description.isEmpty ? nil : description,
            meetingPoint: meetingPoint.isEmpty ? nil : meetingPoint,
            meetingLat: latitude,
            meetingLng: longitude,
            distance: distance,
            dateTime: ISO8601DateFormatter().string(from: selectedDateTime),
            maxParticipants: maxParticipants,
            isPublic: isPublic
        )
        
        do {
            let response = try await apiService.createGroupRun(request)
            createdGroupRunId = response.id
        } catch {
            self.error = error.localizedDescription
        }
        
        isLoading = false
    }
}
```

### GroupRunDetailViewModel

```swift
@MainActor
class GroupRunDetailViewModel: ObservableObject {
    @Published var groupRun: GroupRun?
    @Published var isLoading = false
    @Published var actionLoading = false
    @Published var error: String?
    @Published var actionError: String?
    
    @Published var startedGroupRunId: String?  // Non-nil when run started
    @Published var cancelledGroupRun = false   // True when run cancelled
    
    @Published var friends: [Friend] = []
    @Published var friendsLoading = false
    
    private let apiService: ApiService
    private let sessionManager: SessionManager
    
    func loadGroupRun(_ id: String) async {
        isLoading = true
        do {
            groupRun = try await apiService.getGroupRun(id)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
    
    func loadFriends() async {
        friendsLoading = true
        do {
            let userId = try sessionManager.getUserId()
            friends = try await apiService.getFriends(userId)
        } catch {
            self.error = error.localizedDescription
        }
        friendsLoading = false
    }
    
    func respond(accept: Bool) async {
        guard let groupRunId = groupRun?.id else { return }
        actionLoading = true
        actionError = nil
        
        do {
            let response = accept ? "accepted" : "declined"
            groupRun = try await apiService.respondToGroupRun(groupRunId, response)
        } catch {
            actionError = error.localizedDescription
        }
        
        actionLoading = false
    }
    
    func markReady() async {
        guard let groupRunId = groupRun?.id else { return }
        actionLoading = true
        
        do {
            groupRun = try await apiService.markReadyToStart(groupRunId)
        } catch {
            actionError = error.localizedDescription
        }
        
        actionLoading = false
    }
    
    func startRun() async {
        guard let groupRunId = groupRun?.id else { return }
        actionLoading = true
        actionError = nil
        
        do {
            _ = try await apiService.startGroupRun(groupRunId)
            startedGroupRunId = groupRunId
            // Reload to get updated state
            await loadGroupRun(groupRunId)
        } catch {
            actionError = error.localizedDescription
        }
        
        actionLoading = false
    }
    
    func inviteFriends(_ friendIds: [String]) async {
        guard let groupRunId = groupRun?.id else { return }
        actionLoading = true
        actionError = nil
        
        do {
            let request = InviteFriendsRequest(userIds: friendIds)
            try await apiService.inviteFriendsToGroupRun(groupRunId, request)
            // Reload to reflect invites
            await loadGroupRun(groupRunId)
        } catch {
            actionError = error.localizedDescription
        }
        
        actionLoading = false
    }
    
    func cancelRun() async {
        guard let groupRunId = groupRun?.id else { return }
        actionLoading = true
        actionError = nil
        
        do {
            try await apiService.deleteGroupRun(groupRunId)
            cancelledGroupRun = true
        } catch {
            actionError = error.localizedDescription
        }
        
        actionLoading = false
    }
}
```

### GroupRunResultsViewModel

```swift
@MainActor
class GroupRunResultsViewModel: ObservableObject {
    @Published var results: GroupRunResultsResponse?
    @Published var debrief: String?
    @Published var debriefRank: Int?
    @Published var debriefTotalFinishers: Int?
    
    @Published var isLoadingResults = false
    @Published var isLoadingDebrief = false
    @Published var selectedFilter = "Pace"
    
    private let apiService: ApiService
    
    func loadResults(groupRunId: String) async {
        isLoadingResults = true
        do {
            results = try await apiService.getGroupRunResults(groupRunId)
        } catch {
            // Handle error
        }
        isLoadingResults = false
    }
    
    func requestDebrief(groupRunId: String) async {
        isLoadingDebrief = true
        do {
            let response = try await apiService.getGroupRunDebrief(groupRunId)
            debrief = response.debrief
            debriefRank = response.rank
            debriefTotalFinishers = response.totalFinishers
        } catch {
            // Handle error
        }
        isLoadingDebrief = false
    }
    
    var sortedResults: [GroupRunParticipantResult] {
        let list = results?.results ?? []
        
        switch selectedFilter {
        case "Pace":
            return list.sorted { a, b in
                let paceA = a.runSession?.avgPace ?? ""
                let paceB = b.runSession?.avgPace ?? ""
                return paceA < paceB
            }
        case "Time":
            return list.sorted { a, b in
                let durationA = a.runSession?.durationSeconds ?? Int.max
                let durationB = b.runSession?.durationSeconds ?? Int.max
                return durationA < durationB
            }
        case "HR":
            return list.sorted { a, b in
                let hrA = a.runSession?.avgHeartRate ?? 0
                let hrB = b.runSession?.avgHeartRate ?? 0
                return hrA < hrB
            }
        case "Cadence":
            return list.sorted { a, b in
                let cadenceA = a.runSession?.avgCadence ?? 0
                let cadenceB = b.runSession?.avgCadence ?? 0
                return cadenceA > cadenceB
            }
        case "Elevation":
            return list.sorted { a, b in
                let elevA = a.runSession?.totalElevationGain ?? 0
                let elevB = b.runSession?.totalElevationGain ?? 0
                return elevA > elevB
            }
        default:
            return list
        }
    }
}
```

---

## ⌚ Garmin Watch Integration

### Planned Workout ID Persistence

When a group run is started:

1. **RunSessionViewModel** creates RunSession with `plannedWorkoutId` (if applicable)
2. **GarminWatchManager** receives the plannedWorkoutId
3. **SendPreparedRun()** passes plannedWorkoutId to watch
4. **Watch** stores plannedWorkoutId in App.Storage
5. **Watch** persists plannedWorkoutId in activity/session upload payload
6. **Backend** receives plannedWorkoutId in webhook, auto-completes planned_workout record

**iOS Implementation**:
```swift
// In RunSessionViewModel
func startGroupRun() async {
    let plannedWorkoutId = groupRun.id  // Use group run ID as planned workout
    
    // Create run session with plannedWorkoutId
    let session = try await apiService.createRunSession(
        groupRunId: groupRun.id,
        plannedWorkoutId: plannedWorkoutId
    )
    
    // If watch integration available, pass plannedWorkoutId
    if let watchManager = watchManager {
        watchManager.sendPreparedRun(
            distance: groupRun.distance ?? 5.0,
            plannedWorkoutId: plannedWorkoutId,
            groupRunId: groupRun.id
        )
    }
}
```

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] CreateGroupRunViewModel — form validation, API call
- [ ] GroupRunDetailViewModel — load, respond, mark ready, start, invite
- [ ] GroupRunResultsViewModel — sorting by each filter
- [ ] Debrief request and display
- [ ] Date/time picker validation
- [ ] Distance validation (must be > 0)
- [ ] Max participants validation (min 2)

### Integration Tests
- [ ] Create group run → loaded in detail screen
- [ ] Accept/Decline → status updates
- [ ] Mark ready → button becomes "Start"
- [ ] Start run → navigates to run session
- [ ] Invite friends → appears in participants list
- [ ] Push notification handling → navigates to detail screen
- [ ] Results loading after run completes
- [ ] Debrief generation and display

### E2E Tests

**Scenario 1: Organiser Creates & Starts**
1. [ ] Open Dashboard
2. [ ] Tap "Create Group Run"
3. [ ] Enter name, date, time, distance, location
4. [ ] Tap "Create"
5. [ ] Navigate to group run detail
6. [ ] Tap "Invite Friends"
7. [ ] Select friends
8. [ ] Tap "Mark Ready"
9. [ ] Tap "Start Run"
10. [ ] Verify run tracking starts
11. [ ] Participants receive push notifications

**Scenario 2: Participant Accepts & Joins**
1. [ ] Friend receives push notification
2. [ ] Tap notification → navigates to detail screen
3. [ ] View event details
4. [ ] Tap "Accept"
5. [ ] Status changes to "You're in!"
6. [ ] Wait for organiser to start
7. [ ] Receive "Group run started" push
8. [ ] Tap push → watch organiser running

**Scenario 3: View Results After Run**
1. [ ] Run completes
2. [ ] RunSummaryView shows "Results" tab
3. [ ] Tap Results tab
4. [ ] View leaderboard with all participants
5. [ ] Toggle filter chips (Pace, Time, HR, Cadence, Elevation)
6. [ ] Verify sorting works correctly
7. [ ] Current user highlighted
8. [ ] Request AI debrief
9. [ ] Debrief loads and displays
10. [ ] Debrief shows rank and total finishers

---

## 🎨 Design System

### Colors & Styling

**Group Run Section Theme**:
- Primary action color (teal/green)
- Participant status badges:
  - ✅ Accepted: Green
  - ⏳ Pending: Orange/Yellow
  - ❌ Declined: Red/Gray
  - 🟢 Running: Bright green
  - 🟡 In progress: Yellow
  - ⚫ Not started: Gray
- Meeting point map: Apple Maps embedded view

### Typography

- **Screen titles**: Title1 (bold)
- **Section headers**: Headline
- **Labels**: Subheadline (secondary)
- **Stats**: Body (bold for values)
- **Descriptions**: Body (secondary for text)
- **Buttons**: Button (bold, uppercase)

### Spacing & Layout

- Edge margins: 16pt
- Section spacing: 20pt
- Component spacing: 8-12pt
- Button height: 48pt
- Badge padding: 4pt vertical, 8pt horizontal

---

## 📚 Integration Checklist

- [ ] Add "Create Group Run" button to Dashboard
- [ ] Add "Group Run Results" tab to RunSummaryView
- [ ] Implement push notification handling for `group_run_invite` type
- [ ] Implement push notification handling for `group_run_started` type
- [ ] Add deep link handling: `groupRunDetail(groupRunId)`
- [ ] Wire Group Run Detail screen to start run tracking
- [ ] Pass `groupRunId` to RunSession when starting
- [ ] Load results automatically when run completes
- [ ] Add Group Run models to API service
- [ ] Implement all 10 API endpoints

---

## 🚀 Implementation Order

### Phase 1: Data Models & API (1 day)
1. Add GroupRun, GroupRunParticipant models
2. Add CreateGroupRunRequest, GroupRunResultsResponse models
3. Implement all 10 API endpoints in ApiService
4. Create ViewModels (Create, Detail, Results)

### Phase 2: UI Screens (2 days)
1. Create Group Run screen with form
2. Group Run Detail screen (organiser + participant views)
3. Results tab with leaderboard and sorting
4. AI debrief card and button

### Phase 3: Integration & Notifications (1-2 days)
1. Wire screens to Dashboard
2. Add push notification handling
3. Deep link handling
4. Watch integration (plannedWorkoutId passing)
5. Testing and refinement

---

## ⚠️ Important Notes

### Session ID Timing
- When run starts, RunSession is created asynchronously
- May take 500ms-1s for session to be available
- Use `Task.sleep()` if polling for session ID

### Group Run Status Flow
```
scheduled → ready → in_progress → completed
                 ↓
             cancelled (anytime before in_progress)
```

### Participant Status
- **pending**: Invited, hasn't responded
- **accepted**: Confirmed participation
- **declined**: Opted out

### Error Handling
- If invite fails, don't prevent run from starting
- If debrief generation fails, show error but allow results viewing
- Network timeouts: Retry with exponential backoff
- 404 errors: Group run may have been deleted — navigate back

### State Persistence
- Clear group run data when navigating away
- Don't persist group run state between sessions (reload on open)
- Cache friend list to avoid repeated fetches

---

## 📞 Questions & Support

**Common Implementation Issues**:
- **Timing**: Group run invite push arrives before detail screen is ready → use `@NavigationStack` with deep links
- **Results loading**: Ensure `runId` is set on participant before querying results → may need small delay
- **Sorting**: Pace string comparison works if format is consistent (e.g., "5:31")
- **Debrief**: Long-running AI generation — show loading state for up to 30 seconds

---

## Summary

**Group Run** is a complete social feature with three main screens:
1. **Create Screen** — Form to set up event
2. **Detail Screen** — RSVP, manage, start together
3. **Results Tab** — Leaderboard with AI debrief

**Key Features**:
- ✅ Multi-participant coordination
- ✅ Push notifications for invites & start
- ✅ Sortable leaderboard after run
- ✅ AI debrief with placement info
- ✅ Garmin watch integration (plannedWorkoutId)
- ✅ Deep linking for notifications

**Timeline**: 4-5 days for full implementation  
**Complexity**: Medium-High (multi-screen, state management, notifications)  
**Testing**: 2-3 days

Everything is ready to build! 🚀
