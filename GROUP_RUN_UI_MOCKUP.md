# Group Run Session - UI Layout Mockup

## RunSessionScreen Layout (Organizer View)

```
┌─────────────────────────────────────────────────┐
│  🏃 Run Session Screen                     [⚙]  │  ← Top Bar
├─────────────────────────────────────────────────┤
│                                                   │
│  [GPS locked! Tap 'Start Run' when ready.]      │  ← Coach Message
│                                                   │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────────────────────────────────┐    │
│  │  👥 Group Run (4)          ↻            │    │  ← Participants Panel
│  ├─────────────────────────────────────────┤    │
│  │  👤 Mike Chen         🏃 Running        │    │     (auto-updates every 2s)
│  │  👤 Sarah Johnson     ✓ Joined          │    │
│  │  👤 Alex Davis        ⏳ Invited        │    │
│  │  👤 Jessica Wong      ✗ Declined       │    │
│  └─────────────────────────────────────────┘    │
│                                                   │
├─────────────────────────────────────────────────┤
│                                                   │
│              [⏱ 00:00]                          │  ← Timer / Metrics
│         [Distance] [Pace] [HR]                   │
│                                                   │
│              [🗺 Map View]                       │  ← Route Map
│                                                   │
│                                                   │
├─────────────────────────────────────────────────┤
│        [■ Stop]     [▶ Start/Pause]             │  ← Control Buttons
└─────────────────────────────────────────────────┘
```

---

## Participants Panel - State Variations

### Initial State (Loading)
```
┌─────────────────────────────────┐
│  👥 Group Run (4)        ↻      │
├─────────────────────────────────┤
│  👤 Mike Chen                   │
│  👤 Sarah Johnson               │
│  👤 Alex Davis                  │
│  👤 Jessica Wong                │
└─────────────────────────────────┘
     (Loading spinner visible)
```

### Updated State (Participants Joined)
```
┌─────────────────────────────────────────┐
│  👥 Group Run (4)              [✓]     │
├─────────────────────────────────────────┤
│  👤 Mike Chen      🏃 Running            │  ← Started their session
│  👤 Sarah Johnson  ✓ Joined              │  ← Accepted invite
│  👤 Alex Davis     ⏳ Invited             │  ← Still pending
│  👤 Jessica Wong   ✗ Declined            │  ← Declined
└────────────────────���────────────────────┘
```

### Empty State (No Participants)
```
(Panel hidden - only shown when groupRunId is present)
```

---

## Participant Row Details

### Row Layout
```
┌─────────────────────────────────────┐
│  👤 │  Mike Chen     │ 🏃 Running   │
│     │                │              │
│  ↑  │       ↑        │      ↑       │
│ Avatar │    Name     │ Status Badge │
│(colored)│            │ (color-coded)│
└─────────────────────────────────────┘
```

### Color Coding by Status

**Running (Green)**
```
┌─────────────────────────┐
│ 🟢 Mike Chen  🏃 Running│
│    Avatar (green tint)  │
└─────────────────────────┘
```

**Joined (Blue)**
```
┌─────────────────────────┐
│ 🔵 Sarah J.   ✓ Joined  │
│    Avatar (blue tint)   │
└─────────────────────────┘
```

**Invited (Gray)**
```
┌─────────────────────────┐
│ ⚪ Alex D.   ⏳ Invited  │
│    Avatar (gray tint)   │
└─────────────────────────┘
```

**Declined (Red)**
```
┌─────────────────────────┐
│ 🔴 Jessica W. ✗ Declined│
│    Avatar (red tint)    │
└─────────────────────────┘
```

---

## Timeline - Real-Time Updates

### T=0:00 (Organizer Clicks "Start Group Run")
```
Organizer Action:
  Click "Start Group Run" → Group marked active in backend

Next: Organizer navigated to RunSessionScreen
```

### T=0:05 (Participants Panel Loads)
```
Panel Shows:
  👥 Group Run (4)
  
Participant List:
  - Mike Chen (not started - invited status pending)
  - Sarah Johnson (not started - invited)
  - Alex Davis (invited but not responded)
  - Jessica Wong (declined)
```

### T=0:10 (First Participant Joins)
```
Mike joins and taps "Start My Run"

Next update (T=0:12 after polling):
  
  👥 Group Run (4)  ↻
  
  👤 Mike Chen       🏃 Running      ← UPDATED
  👤 Sarah Johnson   ⏳ Invited
  👤 Alex Davis      ⏳ Invited
  👤 Jessica Wong    ✗ Declined
```

### T=0:15 (Second Participant Joins)
```
Sarah joins and taps "Start My Run"

Next update (T=0:16 after polling):
  
  👥 Group Run (4)  ✓
  
  👤 Mike Chen       🏃 Running
  👤 Sarah Johnson   🏃 Running      ← UPDATED
  👤 Alex Davis      ⏳ Invited
  👤 Jessica Wong    ✗ Declined
```

### T=0:20 (Third Participant Joins)
```
Alex joins and taps "Start My Run"

Next update (T=0:22 after polling):
  
  👥 Group Run (4)  ✓
  
  👤 Mike Chen       🏃 Running
  👤 Sarah Johnson   🏃 Running
  👤 Alex Davis      🏃 Running      ← UPDATED
  👤 Jessica Wong    ✗ Declined
```

---

## Polling Behavior Diagram

```
Organizer starts run
        ↓
isRunning = true
        ↓
startParticipantPolling() triggered
        ↓
┌─────────────────────────────┐
│  Poll Loop (every 2 sec)    │
├─────────────────────────────┤
│  1. Fetch group run data    │
│     from API                │
│  2. Extract participants    │
│  3. Update StateFlow        │
│  4. UI auto-refreshes       │
│  5. Wait 2 seconds          │
│  6. Repeat while running    │
└─────────────────────────────┘
        ↓
Organizer stops run
        ↓
isRunning = false
        ↓
stopParticipantPolling() triggered
        ↓
Polling job cancelled
```

---

## Code to UI Mapping

### ViewModel State → UI
```kotlin
// ViewModel
val groupRunParticipants: StateFlow<List<GroupRunParticipant>>
val isLoadingParticipants: StateFlow<Boolean>

// Screen
val participants by viewModel.groupRunParticipants.collectAsState()
val isLoadingParticipants by viewModel.isLoadingParticipants.collectAsState()

// UI
GroupRunParticipantsPanel(
    participants = participants,
    isLoading = isLoadingParticipants
)
```

### Participant Data Object
```kotlin
data class GroupRunParticipant(
    val userId: String,
    val userName: String,           // Display name
    val profilePic: String?,        // Could be used for avatar
    val invitationStatus: String,   // "pending"|"accepted"|"declined"
    val role: String,               // "organiser"|"participant"
    val runId: String?,             // Their run session ID (if started)
    val readyToStart: Boolean       // 🏃 Running indicator
)
```

---

## Error Handling - Graceful Degradation

### Network Error During Poll
```
T=2.00s: Poll request sent
T=2.05s: Request fails (timeout/no internet)
T=2.10s: Exception caught, backoff to 5 seconds
T=7.10s: Retry poll
T=7.15s: Success - participants updated

UI: Shows loading spinner while retrying
    Panel data remains from last successful poll
```

### No Internet While Polling
```
Initial state:
  👥 Group Run (4)  ↻

After 3 failed polls (wait 5s between each):
  👥 Group Run (4)  [Error icon]  ← Could show indicator
                                   (keeps last known state)
  
Panel shows last-known participant list until connection restored
```

---

## Performance Considerations

| Operation | Time | Impact |
|-----------|------|--------|
| Poll API call | ~200-500ms | Network dependent |
| StateFlow update | ~10-20ms | Very fast |
| UI recomposition | ~50-100ms | Only if data changed |
| Memory usage | ~5-10KB | Minimal (list of <20 people) |

**Total cycle time**: ~2 seconds (configurable via `delay(2000)`)

---

## Accessibility Features

- Status badges include emoji + text (not just color-coded)
- Avatar initials for participants without profile pics
- Loading spinner indicates data is refreshing
- Clear status descriptions ("Running", "Joined", "Invited", "Declined")
- Sufficient color contrast for status indicators

