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

## iOS Implementation (for Xcode Agent)

**Similar flow, just different syntax:**

1. When notification with `type: "group_run_invite"` is tapped, navigate to `GroupRunDetailView` with `groupRunId`
2. When user taps "Start Run", pass `groupRunId` through NavigationStack to `RunSessionView`
3. `RunSessionView` passes it to the run tracking context (equivalent to Kotlin `EXTRA_GROUP_RUN_ID`)
4. When uploading, include `groupRunId` in the run upload payload
5. App calls `/api/group-runs/:id/complete` with the run ID

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
