# Live Tracking Observers — Implementation Guide

**Date**: July 1, 2026  
**Status**: UI Complete, Ready for Backend Integration

---

## 📋 Overview

The Live Tracking feature now has a **fully expanded UI** that allows runners to:
1. Toggle "Live Tracking" ON in the prepare run screen
2. Add friends and email addresses to observe the run
3. Invites are sent **automatically when the run starts**

This works for **all run types**:
- ✅ Runs without routes
- ✅ Runs with generated routes
- ✅ AI coaching plan workouts
- ✅ Group runs

---

## 🎨 UI Components Created

### File: `MapMyRunSetupScreen.kt`

**New State Variables**:
```kotlin
var liveTrackingObservers by remember { mutableStateOf<List<String>>(emptyList()) }
```

**New Composable: `LiveTrackingObserverSection`**
- Shows when "Live Tracking" toggle is ON
- Two input methods:
  1. **"Add Friend" button** — Opens friend picker (TODO: needs FriendPickerDialog implementation)
  2. **Email input field** — Text input with validation for email addresses
- Displays list of added observers with remove buttons (X icon)

**Updated `SocialSection`**
- Now passes `liveTrackingObservers` state
- Expanded when Live Tracking is enabled
- Observers are stored in the `RunSetupConfig` when run is created

**Updated `SocialRowToggle`**
- Removed unused `onManage` callback
- Simplified to just toggle + title + subtitle

---

## 📦 Data Flow

### Prepare Run Screen → Run Start

```
MapMyRunSetupScreen
  ├─ User toggles "Live Tracking" ON
  ├─ UI expands to show observer picker
  ├─ User adds friends and/or emails
  │  └─ Observers stored in: liveTrackingObservers: List<String>
  └─ User taps "Start Run"
     └─ RunSetupConfig created with liveTrackingObservers
        └─ Passed to RunSessionViewModel.setRunConfig()
           └─ Call startRun()
```

### When Run Starts

```
RunSessionViewModel.startRun()
  └─ Starts RunTrackingService with ACTION_START_TRACKING
  └─ [TODO] AFTER service starts, send observer invites:
     └─ For each observer in runConfig.liveTrackingObservers:
        ├─ If it's a user ID (friend):
        │  └─ POST /api/live-sessions/:sessionId/invite-observer
        │     └─ Body: { friendId: "user-id-123" }
        │     └─ → Friend gets PUSH notification + optional email
        │
        └─ If it's an email address:
           └─ POST /api/live-sessions/:sessionId/invite-observer
              └─ Body: { email: "jane@example.com" }
              └─ → Email sent
              └─ → Push sent if email is registered user
```

---

## 🔌 Integration Points

### 1. Friend Picker Dialog (NOT YET IMPLEMENTED)

**Location**: `MapMyRunSetupScreen.kt` - `LiveTrackingObserverSection`

**What's Needed**:
```kotlin
// When "Add Friend" button is tapped:
if (showFriendPicker) {
    FriendPickerDialog(
        onFriendSelected = { friend ->
            onObserversChanged(observers + friend.id)  // Add user ID to list
            showFriendPicker = false
        },
        onDismiss = { showFriendPicker = false }
    )
}
```

**Data to Collect**:
- Friend's **user ID** (for `friendId` parameter in API call)
- Display name (for UI)

---

### 2. Session ID Retrieval (PARTIALLY NEEDED)

**When**: Right after `RunTrackingService` starts

**Current Flow**:
```
startRun() → RunTrackingService.ACTION_START_TRACKING
```

**Needed Addition**:
The `RunTrackingService` creates a live session via `PUT /api/live-sessions/sync`. Once that call succeeds, it should:
1. Return the **sessionId** 
2. Pass it back to `RunSessionViewModel`
3. ViewModel then sends invites via `POST /api/live-sessions/:sessionId/invite-observer`

---

### 3. Send Observer Invites (MAIN INTEGRATION POINT)

**Location**: `RunSessionViewModel.kt` - Add to `startRun()` method

**Timing**: After RunTrackingService starts and creates the live session

**Pseudo-Code**:
```kotlin
fun startRun() {
    // ... existing code to start service ...
    
    // Once service is running and sessionId is available:
    runConfig?.let { config ->
        if (config.liveTrackingEnabled && config.liveTrackingObservers.isNotEmpty()) {
            sendObserverInvites(config.liveTrackingObservers)
        }
    }
}

private fun sendObserverInvites(observers: List<String>) {
    viewModelScope.launch {
        // Get the current live session ID (from RunTrackingService or active session)
        val sessionId = getCurrentLiveSessionId() // TBD: implementation
        
        if (sessionId.isNullOrBlank()) {
            Log.w("RunSessionViewModel", "No active session ID for inviting observers")
            return@launch
        }
        
        observers.forEach { observer ->
            try {
                if (observer.contains("@")) {
                    // Email address
                    apiService.inviteObserverByEmail(
                        sessionId = sessionId,
                        email = observer
                    )
                    Log.d("RunSessionViewModel", "📧 Observer email invite sent: $observer")
                } else {
                    // User ID (friend)
                    apiService.inviteObserverByFriendId(
                        sessionId = sessionId,
                        friendId = observer
                    )
                    Log.d("RunSessionViewModel", "👤 Observer friend invite sent: $observer")
                }
            } catch (e: Exception) {
                Log.e("RunSessionViewModel", "Failed to invite observer $observer: ${e.message}")
                // Continue with other invites even if one fails
            }
        }
    }
}
```

---

## 🔗 API Methods Needed

### Already Implemented ✅

**Endpoint**: `POST /api/live-sessions/:sessionId/invite-observer`

**Behavior**:
- Accepts **either** `friendId` OR `email` in request body
- For `friendId`: Sends push notification to friend
- For `email`: 
  - If registered user: Sends push notification + email
  - If non-registered: Sends email with deep link only

---

## 📱 Observer Experience

### For Friends (with friendId)
```
1. Runner starts run with friend invited
2. Friend receives PUSH notification
3. Tap notification → ObserverRunSessionView opens
4. See live location, route, metrics in real-time
```

### For Email Addresses
```
1. Runner starts run with email invited
2. Email recipient gets EMAIL with link
3. Click link (airuncoach://observe/{token}) → App opens
4. Token auto-filled in ObserverLoginScreen
5. See live location, route, metrics in real-time
```

---

## 🎯 Implementation Checklist

### Phase 1: Friend Picker (2-3 hours)
- [ ] Create `FriendPickerDialog` composable
- [ ] Search/filter friends
- [ ] Show selected friends in the observer list
- [ ] Test with real friend data

### Phase 2: Invite Sending (3-4 hours)
- [ ] Add API methods to `ApiService.kt`:
  - `inviteObserverByFriendId(sessionId, friendId)`
  - `inviteObserverByEmail(sessionId, email)`
- [ ] Get sessionId from RunTrackingService after it creates the session
- [ ] Call invite methods in `RunSessionViewModel.startRun()`
- [ ] Add error handling + logging

### Phase 3: Testing (2-3 hours)
- [ ] Unit test: observer list state management
- [ ] Integration test: invite API calls on run start
- [ ] E2E test: 
  - Add friend → Start run → Friend gets push notification
  - Add email → Start run → Email recipient gets email link
- [ ] Test all run types (no route, with route, coaching plan)

### Phase 4: Polish (1-2 hours)
- [ ] Show success toast after run starts
- [ ] Handle network errors gracefully
- [ ] Disable "Start Run" if observers can't be invited?
- [ ] Show list of invited observers on run screen

---

## 🔑 Key Implementation Details

### Distinguishing Friends from Emails

In the `sendObserverInvites()` function:
```kotlin
if (observer.contains("@")) {
    // It's an email
} else {
    // It's a user ID
}
```

### Session ID Timing

The session is created by `RunTrackingService` in its `onCreate()` method via:
```
PUT /api/live-sessions/sync
```

This happens **after** `startRun()` is called. Options:
1. **Polling**: Wait a few milliseconds then query `GET /api/users/{userId}/live-session`
2. **Callback**: Have RunTrackingService broadcast the sessionId back to ViewModel
3. **Direct call**: Make the invite call from the service itself

**Recommended**: Option 1 (polling) for simplicity.

---

## 📝 State Management Summary

**Prepare Run Screen** (`MapMyRunSetupScreen.kt`):
```kotlin
var liveTrackingObservers by remember { mutableStateOf<List<String>>(emptyList()) }
// Updated by: LiveTrackingObserverSection UI

// Passed to RunSetupConfig:
RunSetupConfig(
    liveTrackingEnabled = isLiveTrackingEnabled,
    liveTrackingObservers = liveTrackingObservers,  // ← List of friend IDs + emails
    ...
)
```

**Run Session ViewModel**:
```kotlin
private var runConfig: RunSetupConfig? = null

fun startRun() {
    // ... start tracking service ...
    
    // Send invites for this run
    runConfig?.liveTrackingObservers?.let { observers ->
        if (observers.isNotEmpty()) {
            sendObserverInvites(observers)
        }
    }
}
```

---

## ✅ What's Already Done

- ✅ UI for toggling Live Tracking
- ✅ Expandable observer section (shows when enabled)
- ✅ Email input field with validation
- ✅ Observer list display with remove buttons
- ✅ State management (liveTrackingObservers list)
- ✅ Data flow to RunSetupConfig
- ✅ Works for all run types

---

## ❌ What Needs to Be Done

1. **Friend Picker Dialog** — UI to select friends
2. **Invite Sending Logic** — Call API endpoints when run starts
3. **Session ID Retrieval** — Get sessionId from RunTrackingService
4. **Error Handling** — Show toasts/errors if invites fail
5. **Testing** — Unit, integration, and E2E tests

---

## 🚀 Getting Started

Start with **Phase 2** (Invite Sending):
1. Add API client methods for inviting observers
2. Modify `RunSessionViewModel.startRun()` to send invites
3. Test that invites are sent correctly when run starts

Then **Phase 1** (Friend Picker):
1. Create FriendPickerDialog
2. Integrate into LiveTrackingObserverSection
3. Test adding friends works end-to-end

---

## 📞 Questions?

Key references:
- `MapMyRunSetupScreen.kt` — UI layer (observer list + picker)
- `RunSessionViewModel.kt` — State management + run start logic
- `ApiService.kt` — API client methods
- Backend: `POST /api/live-sessions/:sessionId/invite-observer` — already implemented ✅

