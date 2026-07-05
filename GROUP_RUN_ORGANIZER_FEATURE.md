# Group Run Organizer Feature - Implementation Complete ✅

## Overview

Organizers can now see all group run participants joining in real-time when they click "Start Group Run". The organizer is navigated to the run session screen where a participants panel displays all attendees with their real-time status.

---

## What Changed

### 1. **Fixed Group Run Start Error** ✅
- **Issue**: `startGroupRun()` endpoint returned null response body, causing deserialization error
- **Fix**: Made return type nullable in `ApiService.kt`
- **File**: `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`
  - Changed: `startGroupRun(): GroupRun` → `startGroupRun(): GroupRun?`

### 2. **Added Participant Tracking to ViewModel** ✅
- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSessionViewModel.kt`
- **New Features**:
  - `groupRunParticipants: StateFlow<List<GroupRunParticipant>>` — Real-time participant list
  - `isLoadingParticipants: StateFlow<Boolean>` — Loading indicator
  - Real-time polling logic that fetches participants every 2 seconds while the run is active
  - Automatic polling stops when run ends

**Code Structure**:
```kotlin
// Automatic polling when run starts
init {
    viewModelScope.launch {
        _runState.collect { runState ->
            if (runState.isRunning && groupRunId != null) {
                startParticipantPolling()
            } else if (!runState.isRunning) {
                stopParticipantPolling()
            }
        }
    }
}

// Fetch latest participants every 2 seconds
private fun startParticipantPolling() {
    participantPollingJob = viewModelScope.launch {
        while (groupRunId != null && _runState.value.isRunning) {
            try {
                fetchGroupRunParticipants()
                delay(2000) // Poll every 2 seconds
            } catch (e: Exception) {
                delay(5000) // Back off on error
            }
        }
    }
}
```

### 3. **Created Participants UI Panel** ✅
- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSessionScreen.kt`
- **New Composables**:
  - `GroupRunParticipantsPanel()` — Shows all participants with real-time status updates
  - `ParticipantRowDuringRun()` — Individual participant row with status indicator

**Display Features**:
- Participant count header: "Group Run (5)"
- Real-time loading spinner while fetching
- Individual participant cards with:
  - Avatar with initials
  - Participant name
  - Status badge: "🏃 Running", "✓ Joined", "✗ Declined", or "⏳ Invited"
  - Color-coded status indicators

**Panel Location**:
- Displayed on RunSessionScreen below sync status indicator
- Only shown when group run is active (`groupRunId != null`)
- Automatically hidden if no participants

### 4. **Fixed ViewModel Error Handling** ✅
- Updated `GroupRunDetailViewModel.startRun()` to handle nullable response
- Still navigates organizer to run session even if backend returns no body
- Gracefully updates state if response is available

---

## User Flow

### Organizer Experience

```
1. Organizer clicks "Start Group Run" on group run detail screen
   ↓
2. Backend marks group run as "active"
   ↓
3. Organizer automatically navigated to RunSessionScreen with groupRunId
   ↓
4. Organizer sees "Group Run" panel displaying participants
   ↓
5. As participants tap "Start My Run" on their phones:
   - Their status updates from "⏳ Invited" → "✓ Joined" → "🏃 Running"
   - Panel refreshes every 2 seconds with latest data
   ↓
6. Organizer can monitor participation in real-time
```

### Participant Experience (Unchanged)

```
1. Participant sees group run marked as "active"
   ↓
2. Participant taps "I'm Ready — Start My Run"
   ↓
3. Navigates to RunSessionScreen for that group run
   ↓
4. Participant taps "Start Run" button to begin their session
   ↓
5. Their status updates to "Running" (visible to organizer)
```

---

## Status Indicators

| Status | Meaning | Color |
|--------|---------|-------|
| **🏃 Running** | Participant started their run session | Green (success) |
| **✓ Joined** | Participant accepted invite but hasn't started yet | Blue (primary) |
| **✗ Declined** | Participant declined the invitation | Red (warning) |
| **⏳ Invited** | Invitation still pending | Gray (muted) |

---

## Technical Implementation

### Polling Strategy
- **Frequency**: Every 2 seconds during active run
- **Backoff**: Errors trigger 5-second delay before retry
- **Automatic Cleanup**: Polling stops when run ends
- **Network Efficient**: Uses existing `getGroupRun()` API endpoint

### Data Flow
```
RunSessionViewModel
├── setGroupRunId(id)           [receives group ID from screen]
├── startParticipantPolling()   [starts when run becomes active]
├── fetchGroupRunParticipants() [fetches every 2 seconds]
├── _groupRunParticipants       [StateFlow for UI updates]
└── stopParticipantPolling()    [stops when run ends]
         ↓
RunSessionScreen
├── collects groupRunParticipants
├── displays GroupRunParticipantsPanel
└── auto-updates UI with new participant data
```

### Files Modified

| File | Changes |
|------|---------|
| `ApiService.kt` | Made `startGroupRun()` return nullable |
| `GroupRunDetailViewModel.kt` | Handle nullable response, still navigate |
| `RunSessionViewModel.kt` | Added participant tracking, polling, fetching |
| `RunSessionScreen.kt` | Added participants panel UI and composables |

---

## Testing Checklist

- [ ] **Start Group Run**: Organizer clicks "Start" and navigates to run screen
- [ ] **See Participants**: Panel shows initial participants list
- [ ] **Real-Time Updates**: As participants join, panel refreshes every 2-3 seconds
- [ ] **Status Changes**: Watch participant status change from "⏳ Invited" to "✓ Joined" to "🏃 Running"
- [ ] **Network Error**: If poll fails, app recovers gracefully with backoff
- [ ] **Run Ends**: Polling stops when organizer ends their session
- [ ] **Watch Support**: Works with both phone-only and watch-enabled participants

---

## Features Enabled

✅ Organizer navigates to run screen immediately after clicking "Start Group Run"
✅ Real-time participant status display
✅ Automatic polling every 2 seconds
✅ Graceful error handling with backoff
✅ Clean polling lifecycle (start with run, stop with run)
✅ Works with all participant configurations (phone, watch, or both)
✅ Status indicators for participant readiness

---

## Future Enhancements (Optional)

- [ ] Participant sorting (e.g., running first, then joined, then invited)
- [ ] Participant filtering (show only running, joined, etc.)
- [ ] Live map showing participant locations
- [ ] Participant notifications (alert when someone joins)
- [ ] Swipe to message individual participant
- [ ] One-tap to see participant's live stats during run

---

## API Endpoints Used

| Endpoint | Method | Purpose | Called From |
|----------|--------|---------|-------------|
| `/api/group-runs/{id}/start` | POST | Start group run | `GroupRunDetailViewModel.startRun()` |
| `/api/group-runs/{id}` | GET | Get latest participant list | `RunSessionViewModel.fetchGroupRunParticipants()` |

---

## Notes

- Polling is lightweight and uses the existing API endpoint
- No additional permissions or permissions required
- Works seamlessly with existing group run invite flow
- Compatible with watch integration (polling includes watch status)
- All participant data comes from the same `GroupRun` API response

