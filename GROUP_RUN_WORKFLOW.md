# Group Run Complete Workflow

## Overview

Group runs allow multiple users to coordinate and run together while tracking individually. Each participant gets real-time coaching, and at the end everyone's results are compared side-by-side.

---

## The Five Phases

### Phase 1: Invitation 💌

**Who:** Group run organiser (host)  
**What:** Creates a group run and invites participants

**Flow:**
1. Host creates group run: `POST /api/group-runs` → runs DB with status `"created"`
2. Host selects friends to invite
3. For each invited user:
   - `POST /api/group-runs/:id/invite` → creates `groupRunParticipants` row with `status: "invited"`
   - Server sends push notification: "You're invited to a group run!"
   - Notification data includes `type: "group_run_invite"` and `groupRunId`

**Client Side:**
- Android/iOS receives push → taps notification → navigates to `GroupRunDetailScreen`
- Shows group run details: date, organiser, distance, time target, etc.
- User sees "Accept" / "Decline" buttons

---

### Phase 2: Acceptance ✅

**Who:** Invited participants  
**What:** Accept or decline the invitation

**Flow:**
1. Participant taps "Accept" → `POST /api/group-runs/:id/respond-invite?response=accepted`
   - Server updates: `groupRunParticipants.status = "accepted"`
2. Organiser can see who's accepted in real-time on `GroupRunDetailScreen`

**Database State:**
```
group_runs:
  id: "abc123"
  status: "created"
  organiser_user_id: "alice"

group_run_participants:
  group_run_id: "abc123", user_id: "bob", status: "accepted"
  group_run_id: "abc123", user_id: "carol", status: "accepted"
  group_run_id: "abc123", user_id: "dave", status: "declined"  ← won't participate
```

---

### Phase 3: Ready ⏱️

**Who:** All participants (including host)  
**What:** Signal they're physically ready to start

**Flow:**
1. Everyone opens the `GroupRunDetailScreen`
2. Sees the group run scheduled for "5:00 PM" (example)
3. Everyone taps "Mark Ready" → `POST /api/group-runs/:id/ready`
   - Server updates: `groupRunParticipants.readyToStart = true`
4. Organiser can see checkmarks next to each person's name when they mark ready

**Real-World:** Participants have shoes on, watch is ready, phone is in pocket — waiting for signal to GO

---

### Phase 4: Start 🏃

**Who:** Organiser (and all participants)  
**What:** Organiser signals the start; everyone begins running

**Organiser's Action:**
1. Organiser taps "Start Run" button on `GroupRunDetailScreen`
2. `POST /api/group-runs/:id/start` → Server sets `group_runs.status = "active"`
3. The organiser's app receives the response and navigates to `RunSessionScreen` with `groupRunId`

**Each Participant's Action:**
1. When they see the organiser has started (or via an in-app notification), they see a "Start Running" button
2. Taps it → navigates to `RunSessionScreen` with the `groupRunId` context
3. `RunSessionScreen` passes `groupRunId` to `RunSessionViewModel` → `RunTrackingService`
4. `RunTrackingService` stores it: `groupRunId = intent.getStringExtra("EXTRA_GROUP_RUN_ID")`

**During the Run:**
- **Each person runs independently** with their own GPS, HR, cadence, coaching
- **No live location sharing** between participants (could be added later)
- Each participant gets personalized AI coaching based on their individual performance
- Real-time metrics are tracked locally; no cross-user sync during the run

---

### Phase 5: Completion & Results 📊

**When:**  Each person finishes their run (hits the STOP button in `RunSessionScreen`)

**Individual Completion:**
1. `RunSessionScreen` calls `RunTrackingService.stopTracking()`
2. Service finalises the run data and calls `uploadRun()`
3. Upload builds `UploadRunRequest` and **includes** `groupRunId = "abc123"`
4. `POST /api/runs` → Server creates the run record with `group_run_id` field
5. App immediately calls `POST /api/group-runs/:id/complete?runId=<their-run-id>`
   - Server updates: `groupRunParticipants.runId = <their-run-id>` ← **Links the run to the group**
   - Server links run ↔ group: `runs.group_run_id = "abc123"`

**Group Completion:**
1. Organiser finishes last
2. App calls `POST /api/group-runs/:id/complete` with organiser's runId
3. Since organiser is the `hostUserId`, server also sets: `group_runs.status = "completed"`

**Viewing Results:**
1. Any participant opens the group run detail screen
2. Sees a "Results" button (only visible after status = "completed")
3. Taps it → `GET /api/group-runs/:id/results`
4. Server returns all participants' runs side-by-side:
   - **Bob**: 5.0 km in 28:14 (5:39/km), 155 avg HR, 163 spm
   - **Carol**: 5.0 km in 29:01 (5:48/km), 149 avg HR, 161 spm
   - **Alice** (organiser): 5.0 km in 27:33 (5:31/km), 162 avg HR, 165 spm

**Results Screen Shows:**
- Leaderboard: fastest → slowest
- Splits comparison: who was ahead at each km
- HR zones: aerobic intensity comparison
- Cadence: who was running more efficiently
- Elevation gain/loss (same for all since same route)

---

## Data Model

### Key Tables

```sql
-- Group run event
group_runs:
  id (UUID)
  title (string)
  scheduled_for (timestamp)
  organiser_user_id (FK users.id)
  status ('created' | 'active' | 'completed')
  target_distance_km (float, nullable)
  target_time_ms (long, nullable)
  created_at
  updated_at

-- Participants
group_run_participants:
  group_run_id (FK group_runs.id)
  user_id (FK users.id)
  status ('invited' | 'accepted' | 'declined')
  run_id (FK runs.id, nullable)  ← Links to individual's completed run
  ready_to_start (boolean)
  created_at
  responded_at

-- Runs linked to groups
runs:
  id
  user_id
  ...
  group_run_id (FK group_runs.id, nullable)  ← This run is part of a group
  ...
```

### API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/group-runs` | POST | Create a new group run |
| `/api/group-runs` | GET | List my group runs (past & upcoming) |
| `/api/group-runs/:id` | GET | View group run details & participant list |
| `/api/group-runs/:id/invite` | POST | Add users to the group run (sends notification) |
| `/api/group-runs/:id/respond-invite` | POST | Accept or decline invitation |
| `/api/group-runs/:id/ready` | POST | Mark self as ready to start |
| `/api/group-runs/:id/start` | POST | **Organiser only** — start the group run |
| `/api/group-runs/:id/complete` | POST | Link my completed run to the group |
| `/api/group-runs/:id/results` | GET | View all participants' final results |
| `/api/group-runs/by-run/:runId` | GET | Look up which group run a run belongs to |

---

## Android Implementation Detail

### Navigation Flow

```
GroupRunDetailScreen
  ↓ (user taps "Start Run")
  GroupRunDetailViewModel.startRun(groupRunId)
    ↓ (calls API)
  apiService.startGroupRun(groupRunId)  ← POST /api/group-runs/:id/start
    ↓ (receives "active" status)
  _startedGroupRunId.value = groupRunId
    ↓ (triggers LaunchedEffect)
  onStartRun(groupRunId)  ← callback from MainScreen
    ↓ (NavController navigates)
  navController.navigate("run_session/group/$groupRunId")
    ↓ (MainScreen composable matches)
  RunSessionScreen(groupRunId = groupRunId)
    ↓ (LaunchedEffect)
  viewModel.setGroupRunId(groupRunId)
    ↓ (when user taps start button in RunSessionScreen)
  viewModel.startRun()
    ↓ (Intent extras)
  RunTrackingService.ACTION_START_TRACKING
    groupRunId passed via EXTRA_GROUP_RUN_ID
    ↓ (when run finishes & uploads)
  UploadRunRequest(groupRunId = groupRunId)
    ↓ (POST /api/runs)
  Server links run to group
    ↓ (app calls)
  POST /api/group-runs/:id/complete
```

### Intent Extras Passed

```kotlin
intent.apply {
  action = RunTrackingService.ACTION_START_TRACKING
  // ... other extras ...
  putExtra(RunTrackingService.EXTRA_GROUP_RUN_ID, groupRunId)  // ← New
}
```

### RunTrackingService Retrieval

```kotlin
val groupRunId = intent?.getStringExtra(EXTRA_GROUP_RUN_ID)
// ... later during upload ...
UploadRunRequest(
  // ... all fields ...
  groupRunId = groupRunId  // ← Included in upload
)
```

---

## iOS Implementation Guide (for Xcode Agent)

### Overview

iOS needs to implement the **complete group run feature** from scratch, including:
1. Group Runs screen/tab in the Profile section
2. Create group run flow
3. Invite friends to group runs
4. Accept/decline invitations
5. Full run lifecycle with groupRunId context
6. Results/leaderboard view

---

### UI Screens & Navigation

#### Screen 1: Group Runs Hub (Tab in Profile)

**Location:** Tab in the Profile section (similar to Friends, Workouts, etc.)

**Layout:**
```
┌─────────────────────────────────┐
│  Group Runs                  [+] │  ← FAB to create new
├─────────────────────────────────┤
│                                 │
│  UPCOMING                       │
│  ┌────────────────────────────┐ │
│  │ 5K Morning Run             │ │
│  │ Tomorrow at 6:00 AM        │ │
│  │ with Alice & Bob           │ │
│  │ You: Ready ✓               │ │  ← Tap to open detail
│  └────────────────────────────┘ │
│                                 │
│  PAST                           │
│  ┌────────────────────────────┐ │
│  │ 10K Long Run               │ │
│  │ Last Sunday                │ │
│  │ with 6 friends             │ │
│  │ Results: 2nd place (5:42)  │ │
│  └────────────────────────────┘ │
│                                 │
└─────────────────────────────────┘
```

**States:**
- Empty state: "No group runs yet. Create one or wait for invitations!"
- Has invitations: Show "Pending Invitations" section at top
- Ready to start: Show "Ready to Start" badge
- Active: Show "Running Now" with live participant count
- Completed: Show results with placement + time

---

#### Screen 2: Group Run Detail

**Shows:** Full group run information and participant list

**Layout:**
```
┌─────────────────────────────────┐
│ ◄ Back    5K Together           │
├─────────────────────────────────┤
│                                 │
│  📅 Tomorrow, 6:00 AM           │
│  📍 Central Park Loop (5.0 km)  │
│  ⏱️ Target: 28 min              │
│  👤 Organiser: Alice            │
│                                 │
│  PARTICIPANTS (3 of 4)          │
│  ┌─────────────────────────────┐│
│  │ Alice (organiser)   Ready ✓ ││
│  │ Bob                 Ready ✓ ││
│  │ Carol               Waiting  ││
│  │ Dave           (Declined)    ││
│  └─────────────────────────────┘│
│                                 │
│  [Mark Ready] [Start Running]   │ ← Organiser only
│       or                        │
│  [Accept] [Decline]             │ ← If invited
│                                 │
│  [View Results] (if completed)  │
│                                 │
└─────────────────────────────────┘
```

**For Status = "created":**
- Show "Mark Ready" button (all participants)
- Show "Start Running" button (organiser only, greyed out until ready)
- Show participant list with Ready status

**For Status = "active":**
- Show "Running Now..." 
- Real-time participant count
- "Start Running" button (joins the run)
- "View Results" button (read-only, updates live)

**For Status = "completed":**
- Hide all action buttons
- Show full "View Results" section
- Allow share to social media

---

#### Screen 3: Create Group Run

**Flow:** Bottom sheet or full screen modal

**Step 1: Basic Details**
```
┌─────────────────────────────────┐
│ Create Group Run                │
├─────────────────────────────────┤
│                                 │
│ Title *                         │
│ [5K Morning Run        ]        │
│                                 │
│ Date & Time *                   │
│ [Tomorrow ▼] [6:00 AM ▼]        │
│                                 │
│ Distance (km)                   │
│ [5.0              ]             │
│                                 │
│ Target Time (optional)          │
│ [28 : 30           ]            │
│                                 │
│ Route (optional)                │
│ [Select Route ▼]                │
│                                 │
│ Notes                           │
│ [Morning endurance run    ]     │
│ [                        ]      │
│                                 │
│              [Next]             │
│                                 │
└─────────────────────────────────┘
```

**Step 2: Invite Friends**
```
┌─────────────────────────────────┐
│ Invite Friends                  │
├─────────────────────────────────┤
│                                 │
│ Search                          │
│ [🔍 Type name...           ]    │
│                                 │
│ FRIENDS                         │
│ ☐ Alice                         │
│ ☑ Bob                           │
│ ☑ Carol                         │
│ ☐ Dave                          │
│ ☐ Eve                           │
│                                 │
│ RECENT                          │
│ ☐ Frank                         │
│ ☐ Grace                         │
│                                 │
│ (3 selected)                    │
│                                 │
│        [Create Group Run]       │
│                                 │
└─────────────────────────────────┘
```

---

#### Screen 4: Invitation Card (Home Tab / Notifications)

**Shows:** When invited to a group run

```
┌─────────────────────────────────┐
│ GROUP RUN INVITATION            │
├─────────────────────────────────┤
│ 👤 Alice invited you to:        │
│                                 │
│ 5K Together                     │
│ Tomorrow at 6:00 AM             │
│ 5.0 km                          │
│                                 │
│         [Accept] [Decline]      │
│                                 │
└─────────────────────────────────┘
```

**Tap card:** Navigates to Group Run Detail screen

---

#### Screen 5: Run Session with Group Context

**Modification to RunSessionView:**

```
┌─────────────────────────────────┐
│ ◄ 5K Together                   │
├─────────────────────────────────┤
│                                 │
│ 👥 Group Run                    │
│ Alice, Bob, Carol (running)     │
│ [View All]                      │
│                                 │
│ [Main run metrics display]      │
│                                 │
│           [STOP]                │
│                                 │
└─────────────────────────────────┘
```

**New Elements:**
- Show group run name at top
- Show active participant count / list
- Show "View All" to see full leaderboard live
- Stop button works same way (triggers upload with groupRunId)

---

#### Screen 6: Group Run Results / Leaderboard

**Shows:** After group run completes

```
┌─────────────────────────────────┐
│ ◄ Results: 5K Together          │
├─────────────────────────────────┤
│                                 │
│ 🏆 LEADERBOARD                  │
│                                 │
│ 1️⃣ Alice           27:33 (5:31) │
│    155 bpm    161 spm           │
│                                 │
│ 2️⃣ Bob             28:14 (5:39) │
│    158 bpm    165 spm           │
│                                 │
│ 3️⃣ Carol           29:01 (5:48) │
│    151 bpm    159 spm           │
│                                 │
│ KM SPLITS                       │
│ 1️⃣ Alice 5:28  Bob 5:35  Carol  │
│ 2️⃣ Alice 5:30  Bob 5:40  Carol  │
│ ...                             │
│                                 │
│ [Share] [Get AI Debrief]        │
│                                 │
└─────────────────────────────────┘
```

**Tabs:**
- Leaderboard (default)
- Splits comparison
- Heart rate zones
- Elevation profile (same for all)
- Map (optional - shows all routes together)

---

### Data Flow & Technical Implementation

#### 1. Create Group Run

```
CreateGroupRunView
  ↓ (user fills form)
  Step 1: title, date, distance, target time, route, notes
  Step 2: select friends to invite
  ↓ (user taps "Create Group Run")
apiService.createGroupRun(CreateGroupRunRequest)
  ↓ (POST /api/group-runs)
  Server creates:
    - group_runs record with status = "created"
    - group_run_participants rows for each invitee with status = "invited"
    - Sends push notifications to each invitee
  ↓ (app receives response)
GroupRunDetailView with groupRunId
```

**Request Model:**
```swift
struct CreateGroupRunRequest: Codable {
    let title: String
    let scheduledFor: Date
    let targetDistanceKm: Float?
    let targetTimeMs: Long?
    let routeId: String?
    let notes: String?
    let invitedUserIds: [String]
}
```

---

#### 2. Invite Friends to Existing Group Run

```
GroupRunDetailView [Invite Button]
  ↓ (user taps invite)
InviteFriendsSheet
  ↓ (user selects friends)
  ↓ (user taps "Invite")
apiService.inviteFriendsToGroupRun(groupRunId, InviteFriendsRequest)
  ↓ (POST /api/group-runs/:id/invite)
  Server creates group_run_participants rows
  Server sends push notifications
  ↓ (app receives response)
GroupRunDetailView refreshes
```

**Request Model:**
```swift
struct InviteFriendsRequest: Codable {
    let userIds: [String]
}
```

---

#### 3. Handle Push Notification

```
AppDelegate / SceneDelegate (UNUserNotificationCenterDelegate)
  ↓ (receives notification with type: "group_run_invite")
  payload: {
    "type": "group_run_invite",
    "groupRunId": "abc123",
    "requesterId": "alice",
    "requesterName": "Alice",
    "groupRunTitle": "5K Together"
  }
  ↓ (user taps notification)
  Deep link: app://group-run/abc123
  ↓ (app router processes)
NavigationStack.append(.groupRunDetail(groupRunId: "abc123"))
  ↓ (shows)
GroupRunDetailView with groupRunId
```

---

#### 4. Mark Ready

```
GroupRunDetailView [Mark Ready Button]
  ↓ (user taps)
apiService.markReadyToStart(groupRunId)
  ↓ (POST /api/group-runs/:id/ready)
  Server updates: groupRunParticipants.readyToStart = true
  ↓ (app receives response)
GroupRunDetailView shows:
  - Own status changed to "Ready ✓"
  - Other participants' status updated in real-time (if using WebSocket or polling)
```

---

#### 5. Start Group Run (Organiser Only)

```
GroupRunDetailView [Start Running Button]  (organiser only)
  ↓ (user taps)
apiService.startGroupRun(groupRunId)
  ↓ (POST /api/group-runs/:id/start)
  Server updates: group_runs.status = "active"
  Server sends push: "Group run started! Time to run!"
  ↓ (app receives response with status = "active")
@State var shouldNavigateToRun = true
  ↓ (NavigationStack changes)
NavigationStack.append(.runSession(groupRunId: groupRunId))
  ↓ (shows)
RunSessionView(groupRunId: groupRunId)
```

---

#### 6. Run Session with Group Context

**Modifications to RunSessionView:**

```swift
@State var groupRunId: String?

// When initializing run tracking:
var context = RunContext(
    // ... existing fields ...
    groupRunId: groupRunId  // ← NEW
)

// When user taps STOP button:
func stopRun() {
    runTracker.stopRunning()
    // Data gets packaged with groupRunId
}

// When upload happens:
let uploadRequest = UploadRunRequest(
    // ... all existing fields ...
    groupRunId: groupRunId  // ← NEW: Include it in upload
)
```

**Live Updates During Run (Optional but Recommended):**

```swift
// If you want to show who's currently running:
// Option 1: Poll every 10 seconds
let timer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { _ in
    apiService.getGroupRun(groupRunId) { groupRun in
        // Update participant list with who's active
        activeParticipants = groupRun.participants.filter { $0.status == "running" }
    }
}

// Option 2: WebSocket (more efficient, future enhancement)
// Connect to ws://api.airuncoach.com/group-runs/:id/live
```

---

#### 7. Run Completion & Linking

```
RunSessionView [STOP button pressed]
  ↓ (run finalizes)
  ↓ (data uploaded)
apiService.uploadRun(uploadRequest)  // ← includes groupRunId
  ↓ (POST /api/runs)
  Server creates run with group_run_id field
  ↓ (app gets back runId)
  ↓ (app automatically calls)
apiService.completeGroupRun(groupRunId, CompleteGroupRunRequest(runId))
  ↓ (POST /api/group-runs/:id/complete)
  Server updates:
    - groupRunParticipants.runId = runId  (links participant to their run)
    - runs.group_run_id = groupRunId  (cross-link)
    - If organiser: group_runs.status = "completed"
  ↓ (app receives response)
NavigationStack.append(.runSummary(runId: runId))
  ↓ (shows)
RunSummaryView with automatic group run results loading
```

**Request Model:**
```swift
struct CompleteGroupRunRequest: Codable {
    let runId: String
}
```

---

#### 8. View Results

```
RunSummaryView
  ↓ (user taps "View Results" or results tab)
  ↓ (component loads)
GroupRunResultsView(groupRunId: groupRunId)
  ↓ (calls)
apiService.getGroupRunResults(groupRunId)
  ↓ (GET /api/group-runs/:id/results)
  Server returns:
    {
      "groupRunTitle": "5K Together",
      "participants": [
        {
          "userId": "alice",
          "displayName": "Alice",
          "distance": 5000,
          "duration": 1653000,  // 27:33
          "pace": "5:31",
          "avgHeartRate": 155,
          "cadence": 161,
          "elevationGain": 47,
          "placement": 1,
          "runId": "run123"
        },
        // ... more participants
      ]
    }
  ↓ (app renders leaderboard)
```

---

### Required Data Models (Swift)

```swift
// MARK: - Group Run Models

struct GroupRun: Codable {
    let id: String
    let title: String
    let scheduledFor: Date
    let organiserUserId: String
    let organiserName: String
    let status: GroupRunStatus  // "created" | "active" | "completed"
    let targetDistanceKm: Float?
    let targetTimeMs: Int?
    let participants: [GroupRunParticipant]
}

enum GroupRunStatus: String, Codable {
    case created
    case active
    case completed
}

struct GroupRunParticipant: Codable {
    let userId: String
    let displayName: String
    let status: ParticipantStatus  // "invited" | "accepted" | "declined"
    let readyToStart: Bool
    let runId: String?  // Set after completion
}

enum ParticipantStatus: String, Codable {
    case invited
    case accepted
    case declined
}

struct GroupRunResults: Codable {
    let groupRunTitle: String
    let participants: [GroupRunResult]
}

struct GroupRunResult: Codable {
    let userId: String
    let displayName: String
    let distance: Double  // metres
    let duration: Int     // milliseconds
    let pace: String      // "5:31" format
    let avgHeartRate: Int?
    let cadence: Int?     // SPM
    let elevationGain: Double?
    let placement: Int    // 1st, 2nd, etc.
    let runId: String
}

// MARK: - Request Models

struct CreateGroupRunRequest: Codable {
    let title: String
    let scheduledFor: Date
    let targetDistanceKm: Float?
    let targetTimeMs: Int?
    let routeId: String?
    let notes: String?
    let invitedUserIds: [String]
}

struct InviteFriendsRequest: Codable {
    let userIds: [String]
}

struct RespondToInviteRequest: Codable {
    let response: String  // "accepted" | "declined"
}

struct CompleteGroupRunRequest: Codable {
    let runId: String
}

// MARK: - Modified UploadRunRequest

// Add to existing UploadRunRequest:
struct UploadRunRequest: Codable {
    // ... existing fields ...
    let groupRunId: String?  // ← NEW: Optional group context
}
```

---

### API Service Methods (Swift)

```swift
protocol GroupRunService {
    // Creation & Management
    func createGroupRun(_ request: CreateGroupRunRequest) async throws -> GroupRun
    func getGroupRun(_ groupRunId: String) async throws -> GroupRun
    func listGroupRuns() async throws -> [GroupRun]
    
    // Invitations & Responses
    func inviteFriendsToGroupRun(_ groupRunId: String, _ request: InviteFriendsRequest) async throws -> GroupRun
    func respondToInvite(_ groupRunId: String, _ request: RespondToInviteRequest) async throws -> GroupRun
    
    // Run Lifecycle
    func markReadyToStart(_ groupRunId: String) async throws -> GroupRun
    func startGroupRun(_ groupRunId: String) async throws -> GroupRun
    func completeGroupRun(_ groupRunId: String, _ request: CompleteGroupRunRequest) async throws -> GroupRun
    
    // Results
    func getGroupRunResults(_ groupRunId: String) async throws -> GroupRunResults
    func getGroupRunByRun(_ runId: String) async throws -> GroupRunLookup
    
    // Debrief (optional)
    func getGroupRunDebrief(_ groupRunId: String) async throws -> String
}

struct GroupRunLookup: Codable {
    let groupRunId: String
    let groupRunName: String
}
```

---

### Navigation Integration

**Add to Navigation router:**

```swift
enum AppRoute: Hashable {
    // ... existing cases ...
    case groupRuns                           // Tab: Group Runs hub
    case groupRunDetail(groupRunId: String)  // Detail view
    case createGroupRun                      // Create flow
    case runSession(groupRunId: String?)     // Modified to accept optional groupRunId
    case groupRunResults(groupRunId: String) // Results view
}

// In NavigationStack:
NavigationStack(path: $navigationPath) {
    // ... existing navigation ...
    
    .navigationDestination(for: AppRoute.self) { route in
        switch route {
        case .groupRuns:
            GroupRunsHubView()
        case .groupRunDetail(let groupRunId):
            GroupRunDetailView(groupRunId: groupRunId)
        case .createGroupRun:
            CreateGroupRunView()
        case .runSession(let groupRunId):
            RunSessionView(groupRunId: groupRunId)
        case .groupRunResults(let groupRunId):
            GroupRunResultsView(groupRunId: groupRunId)
        // ... other cases ...
        }
    }
}
```

---

### Push Notification Handling

```swift
extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        
        if let type = userInfo["type"] as? String {
            switch type {
            case "group_run_invite":
                if let groupRunId = userInfo["groupRunId"] as? String {
                    // Navigate to group run detail
                    navigationPath.append(.groupRunDetail(groupRunId: groupRunId))
                }
            case "group_run_started":
                if let groupRunId = userInfo["groupRunId"] as? String {
                    // Navigate to run session
                    navigationPath.append(.runSession(groupRunId: groupRunId))
                }
            // ... handle other notification types ...
            default:
                break
            }
        }
        
        completionHandler()
    }
}
```

---

### Implementation Checklist for iOS Team

- [ ] Create GroupRunsHubView (tab in Profile)
- [ ] Create GroupRunDetailView with participant list
- [ ] Create CreateGroupRunView (2-step form)
- [ ] Create GroupRunResultsView with leaderboard
- [ ] Modify RunSessionView to accept optional groupRunId
- [ ] Implement all GroupRunService API methods
- [ ] Add groupRunId to UploadRunRequest
- [ ] Modify RunSummaryView to auto-load group results
- [ ] Implement push notification handling for group run invitations
- [ ] Add deep link routing for group run URLs
- [ ] Test full workflow: create → invite → start → run → results
- [ ] Add share functionality to results
- [ ] (Optional) Add WebSocket for live participant tracking

---

## What Happens If...

| Scenario | Behavior |
|---|---|
| User closes app during a group run | App resumes with run still active in `RunTrackingService`; `groupRunId` is preserved |
| User doesn't complete their run | `groupRunParticipants.runId` stays null; results page shows "Did not finish" |
| Organiser deletes the group run | API prevents deletion if status is "active" or "completed" |
| Group run is shared to social media | Share content includes group details; each participant can view others' results |
| Live location tracking is added later | Data structure already supports it (could stream `LocationPoint` in real-time) |

---

## Future Enhancements

1. **Live location tracking** — Show where each participant is during the run (with privacy controls)
2. **Mid-run messaging** — "Come on, you're falling behind!" pings
3. **Live pace sync** — "Speed up 30 seconds to match Alice's pace"
4. **Team challenges** — "Team A vs Team B" mode with aggregate scoring
5. **Replay** — Animated map showing the real-time progression of all participants
6. **Photo finish** — Last km video clip shared to group
