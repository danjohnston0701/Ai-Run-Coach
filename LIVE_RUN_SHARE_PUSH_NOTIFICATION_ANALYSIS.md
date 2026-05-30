# Live Run Share Push Notification Analysis & Implementation Plan

**Date**: May 30, 2026  
**Status**: Comprehensive Analysis Complete  
**Scope**: Push notification handling for Share Live Run feature

---

## Executive Summary

The **Share Live Run** feature has the infrastructure partially built, but **critical gaps** exist:

1. **✅ Partially Working**: Web-side run session screen can invite observers to live tracking
2. **❌ Missing**: Server endpoint for sending push notifications to invited observers
3. **❌ Missing**: Android deep-link routing for live run observer invitations
4. **❌ Missing**: Observer-facing mobile UI/screen to receive and join live run sessions
5. **⚠️ Incomplete**: Push notification payload doesn't specify observer session details

---

## Current Implementation Status

### What's Already Built

#### 1. Web Client (Client-Side Sharing)
**File**: `client/src/pages/RunSession.tsx` (lines 3501-3546)

- Users can click a **Share** icon during an active run
- UI shows list of friends with toggle buttons
- `toggleLiveShare(friend)` sends POST to `/api/live-sessions/{sessionId}/invite-observer`
- Toast notifications provide feedback
- `sharedWith` state tracks currently shared observers

**Example Request**:
```json
POST /api/live-sessions/abc123/invite-observer
{
  "runnerId": "user-123",
  "friendId": "friend-456"
}
```

#### 2. Data Model
**File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/LiveTrackingObserver.kt`

```kotlin
data class LiveTrackingObserver(
    val userId: String,
    val userName: String,
    val profilePicUrl: String?,
    val invitedAt: Long,
    val status: ObserverStatus  // INVITED, WATCHING, DECLINED
)
```

#### 3. Database Schema
**File**: `shared/schema.ts` (lines 518-537)

`liveRunSessions` table tracks:
- Active sessions (userId, route, GPS position, metrics)
- Session sharing flag: `sharedWithFriends: boolean`
- Real-time data: lat/lng, pace, heart rate, elapsed time, distance

**Note**: No `observers` or `sharedWith` field — this is a **gap**.

#### 4. Push Notification Infrastructure
**Files**: 
- `app/src/main/java/live/airuncoach/airuncoach/service/AiRunCoachMessagingService.kt` (FCM handler)
- `server/notification-service.ts` (Firebase Admin SDK)

**What Works**:
- FCM tokens are stored and refreshed (`saveFcmToken`)
- Push notifications are sent to users (with `runId` and `type`)
- Android app receives notifications and routes them via `MainActivity`

**What's Missing**:
- No push sending for live run invitations
- No observer-specific notification types defined

#### 5. Android Deep-Link Routing
**Files**:
- `MainActivity.kt` (lines 98-127): Routes notifications to `pendingDeepLink`
- `MainScreen.kt` (lines 97-112): Consumes `pendingDeepLink` and navigates

**Current Routes Handled**:
- `run_summary/{runId}` — for completed/enriched run notifications
- `run_session` — for active run notifications (user's own active run)
- Garmin watch update notifications

**Missing Routes**:
- `observer_session/{sessionId}` — for observer invitations
- No handling for "waiting for runner to start" state

---

## Gaps & Missing Pieces

### 1. **Missing Server Endpoint** ⚠️ CRITICAL
The endpoint called by the web client **does not exist**:
```
POST /api/live-sessions/{sessionId}/invite-observer
```

**What should happen**:
- Accept `runnerId` and `friendId`
- Validate both users exist and are friends
- Store observer invitation in database
- **Send FCM push notification** to the friend's device
- Return success/error

**Current Status**: 404 error silently fails.

### 2. **Missing Database Fields** ⚠️ CRITICAL
`liveRunSessions` table lacks:
- `observers` (JSON array or separate table)
- `observerInvitations` (pending invites)
- `sessionKey` field exists but isn't used for observers

The table needs to track:
```
{
  sessionId: string
  userId: string (runner)
  observers: Array<{
    userId: string
    status: "invited" | "watching" | "declined"
    invitedAt: timestamp
  }>
  hasStarted: boolean  // has runner begun the run?
  startedAt?: timestamp
}
```

### 3. **Missing Push Notification Type** ⚠️ CRITICAL
No push notification type for live run invitations.

**Current types** (from `notification-service.ts`):
- `new_activity` — Garmin activity recorded
- `run_enriched` — Garmin data synced
- `garmin_watch_update` — Watch app update available

**Needed**:
- `live_run_invite` — "Alice invited you to watch her run"

**Payload structure**:
```json
{
  "title": "Alice invited you to watch her run",
  "body": "She's running 5km in your area",
  "data": {
    "type": "live_run_invite",
    "sessionId": "sess-123",
    "runnerId": "user-alice",
    "runnerName": "Alice",
    "routeId": "route-456"
  }
}
```

### 4. **Missing Android Observer Screen** ⚠️ CRITICAL
No screen exists for observers to:
- See the invitation
- Join the live session
- View the runner's real-time metrics & map

**Needed**:
- `ObserverRunSessionScreen.kt` — Shows runner's live location on map + metrics
- "Waiting for {runner's name} to start the run" message when session not active
- Auto-refresh of runner's position (WebSocket or polling)
- Back button to exit observer session

### 5. **Missing Push Notification Handler for Observers** ⚠️ CRITICAL
`AiRunCoachMessagingService.kt` only handles:
- Garmin activities
- Watch updates

**Missing**:
- Check for `type == "live_run_invite"` in `onMessageReceived`
- Set appropriate intent extra: e.g., `deeplink_observer_session_id`
- Route to observer session screen instead of run summary

### 6. **Navigation Route Missing** ⚠️ CRITICAL
`MainScreen.kt` (NavHost) lacks:
- Route for `observer_session/{sessionId}`
- Composable function `ObserverRunSessionScreen`

---

## What Works for Observers Today

### ✅ If You Access Manually via Web
1. Observer navigates to `https://airuncoach.live/runs/{sessionId}` (hypothetically)
2. Can view runner's live map and metrics in real-time
3. Interface shows runner's position, pace, distance, time

**Reality**: This likely isn't fully built either, but web-side is ahead.

### ✅ What the Runner Sees
1. During run, web client shows **Share** button
2. Can toggle friends on/off to share live session
3. `sharedWith` state tracks active observers
4. Toast confirms when share is toggled

---

## Implementation Roadmap

### Phase 1: Backend Infrastructure (Server)

#### 1.1 Update `liveRunSessions` Schema
**File**: `shared/schema.ts`

Add fields to track observers:
```typescript
observers: jsonb("observers"),  // [{ userId, status, invitedAt }]
hasStarted: boolean("has_started").default(false),
startedAt: timestamp("started_at"),
```

Or create a separate `liveSessionObservers` table for better normalization.

#### 1.2 Create `/api/live-sessions/{sessionId}/invite-observer` Endpoint
**File**: `server/routes.ts` (after line 2748)

```typescript
app.post("/api/live-sessions/:sessionId/invite-observer", 
  authMiddleware, 
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { runnerId, friendId } = req.body;
      
      // Validate session exists and belongs to runnerId
      const session = await storage.getLiveSession(sessionId);
      if (!session || session.userId !== runnerId) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Validate friendship
      const isFriend = await storage.checkFriendship(runnerId, friendId);
      if (!isFriend) {
        return res.status(403).json({ error: "Not friends" });
      }
      
      // Store observer invitation
      await storage.inviteObserver(sessionId, friendId);
      
      // Get friend's info for notification
      const friend = await storage.getUser(friendId);
      const runner = await storage.getUser(runnerId);
      
      // Get runner's name
      const runnerName = runner?.name || "A runner";
      
      // Send push notification
      const notificationService = await import("./notification-service");
      await notificationService.sendFirebasePush(
        friendId,
        `${runnerName} invited you to watch their run`,
        "Watch their live location and route in real-time",
        {
          type: "live_run_invite",
          sessionId,
          runnerId,
          runnerName,
          routeId: session.routeId || "",
          hasStarted: session.startedAt ? "true" : "false",
        }
      );
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Invite observer error:", error);
      res.status(500).json({ error: "Failed to invite observer" });
    }
  }
);
```

#### 1.3 Create `/api/live-sessions/{sessionId}` GET (for observers)
Already exists but needs observer-filtering for non-runners.

#### 1.4 Update Live Session Sync
**File**: `server/routes.ts` (around line 2720)

Ensure `hasStarted` and `startedAt` are updated when runner starts running.

---

### Phase 2: Android Push Notification Handling

#### 2.1 Update `AiRunCoachMessagingService.kt`
**File**: `app/src/main/java/live/airuncoach/airuncoach/service/AiRunCoachMessagingService.kt` (lines 74-157)

Add handler for `live_run_invite` type:

```kotlin
override fun onMessageReceived(message: com.google.firebase.messaging.RemoteMessage) {
  super.onMessageReceived(message)
  Log.d(TAG, "FCM message received: ${message.data}")
  
  val type = message.data["type"]
  val runId = message.data["runId"]?.takeIf { it.isNotBlank() }
  val sessionId = message.data["sessionId"]?.takeIf { it.isNotBlank() }  // NEW
  val runnerName = message.data["runnerName"]?.takeIf { it.isNotBlank() }  // NEW
  val title = message.notification?.title ?: message.data["title"] ?: "AI Run Coach"
  val body = message.notification?.body ?: message.data["body"] ?: ""
  
  showNotification(title, body, type, runId, sessionId = sessionId, message.data)
}

private fun showNotification(
  title: String,
  body: String,
  type: String?,
  runId: String? = null,
  sessionId: String? = null,  // NEW parameter
  storeUrl: String? = null,
  data: Map<String, String> = emptyMap()
) {
  // ... existing code ...
  
  val pendingIntent = when {
    type == "live_run_invite" -> {  // NEW branch
      val mainIntent = Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (sessionId != null) {
          putExtra("deeplink_observer_session_id", sessionId)
          putExtra("runner_name", data["runnerName"] ?: "")
        }
      }
      PendingIntent.getActivity(
        this,
        REQUEST_CODE_GENERAL,
        mainIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    // ... rest of existing cases ...
  }
  
  // ... rest of function ...
}
```

#### 2.2 Update `MainActivity.kt` Deep-Link Handling
**File**: `app/src/main/java/live/airuncoach/airuncoach/MainActivity.kt` (lines 98-127)

Add observer session routing:

```kotlin
// In onCreate, after existing deep-link checks:
val observerSessionId = intent?.getStringExtra("deeplink_observer_session_id")

when {
  launchToActiveRun -> pendingDeepLink.value = "run_session"
  anyRunId != null -> pendingDeepLink.value = "run_summary/$anyRunId"
  observerSessionId != null -> pendingDeepLink.value = "observer_session/$observerSessionId"  // NEW
}

// In handleNotificationIntent (onNewIntent path):
// Observer session notification → inner nav observer_session
when {
  intent?.hasExtra("deeplink_observer_session_id") == true -> {
    val sessionId = intent.getStringExtra("deeplink_observer_session_id")
    if (!sessionId.isNullOrBlank()) {
      Log.d("MainActivity", "Warm launch: observer_session/$sessionId")
      pendingDeepLink.value = "observer_session/$sessionId"
    }
  }
  // ... rest of cases ...
}
```

---

### Phase 3: Android Observer UI

#### 3.1 Create `ObserverRunSessionScreen.kt`
**File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ObserverRunSessionScreen.kt`

Structure:
```kotlin
@Composable
fun ObserverRunSessionScreen(
  sessionId: String,
  onNavigateBack: () -> Unit
) {
  val viewModel: ObserverRunSessionViewModel = hiltViewModel()
  val liveSession by viewModel.liveSession.collectAsState()
  val error by viewModel.error.collectAsState()
  
  LaunchedEffect(sessionId) {
    viewModel.loadRunnerSession(sessionId)
  }
  
  when {
    error != null -> ErrorScreen(message = error!!, onRetry = { viewModel.loadRunnerSession(sessionId) })
    liveSession == null -> LoadingScreen()
    liveSession!!.hasStarted == false -> WaitingScreen(
      runnerName = liveSession!!.runnerName,
      onCancel = onNavigateBack
    )
    else -> LiveRunMapScreen(session = liveSession!!, onNavigateBack = onNavigateBack)
  }
}
```

Key States:
1. **Loading** — Fetching runner session
2. **Waiting** — "Waiting for {runner's name} to start the run session"
3. **Active** — Show live map + metrics
4. **Ended** — Show final summary

#### 3.2 Create `ObserverRunSessionViewModel.kt`

```kotlin
@HiltViewModel
class ObserverRunSessionViewModel @Inject constructor(
  private val apiService: ApiService
) : ViewModel() {
  private val _liveSession = MutableStateFlow<LiveRunSessionObserver?>(null)
  val liveSession = _liveSession.asStateFlow()
  
  private val _error = MutableStateFlow<String?>(null)
  val error = _error.asStateFlow()
  
  fun loadRunnerSession(sessionId: String) {
    viewModelScope.launch {
      try {
        val session = apiService.getLiveSession(sessionId)
        _liveSession.value = session
        // Start polling for updates if session is active
        if (session.hasStarted) {
          startPollingUpdates(sessionId)
        }
      } catch (e: Exception) {
        _error.value = "Failed to load session: ${e.message}"
      }
    }
  }
  
  private fun startPollingUpdates(sessionId: String) {
    viewModelScope.launch {
      while (isActive && _liveSession.value?.hasStarted == true) {
        try {
          val updated = apiService.getLiveSession(sessionId)
          _liveSession.value = updated
          delay(2000)  // Poll every 2 seconds
        } catch (e: Exception) {
          Log.w("ObserverVM", "Failed to fetch updates: ${e.message}")
        }
      }
    }
  }
}
```

#### 3.3 Create Waiting Screen Component

```kotlin
@Composable
fun WaitingScreen(
  runnerName: String,
  onCancel: () -> Unit
) {
  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(Colors.backgroundRoot)
      .padding(24.dp),
    contentAlignment = Alignment.Center
  ) {
    Column(
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
      CircularProgressIndicator(color = Colors.primary)
      
      Text(
        "Waiting for $runnerName to start the run session",
        style = AppTextStyles.body,
        textAlign = TextAlign.Center
      )
      
      Button(
        onClick = onCancel,
        modifier = Modifier.fillMaxWidth()
      ) {
        Text("Cancel")
      }
    }
  }
}
```

#### 3.4 Add Route to `MainScreen.kt` NavHost
**File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt` (after line 588)

```kotlin
// Observer run session (invited to watch a friend's live run)
composable("observer_session/{sessionId}") { backStackEntry ->
  val sessionId = backStackEntry.arguments?.getString("sessionId") ?: ""
  ObserverRunSessionScreen(
    sessionId = sessionId,
    onNavigateBack = { navController.popBackStack() }
  )
}
```

---

### Phase 4: API Contract & Data Models

#### 4.1 Update `ApiService` Interface
**File**: `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`

```kotlin
@GET("/api/live-sessions/{sessionId}")
suspend fun getLiveSession(
  @Path("sessionId") sessionId: String
): LiveRunSessionObserver

// Data class for observer view (different from runner view)
data class LiveRunSessionObserver(
  val id: String,
  val userId: String,          // Runner's ID
  val runnerName: String,
  val currentLat: Double?,
  val currentLng: Double?,
  val distanceCovered: Double,
  val elapsedTime: Int,
  val currentPace: String?,
  val currentHeartRate: Int?,
  val hasStarted: Boolean,
  val startedAt: Long?,
  val routeId: String?,
  val gpsTrack: List<GpsPoint>?
)

data class GpsPoint(
  val lat: Double,
  val lng: Double,
  val timestamp: Long,
  val altitude: Double? = null
)
```

---

## Testing Checklist

- [ ] **Server**: `POST /api/live-sessions/{id}/invite-observer` successfully sends push notification
- [ ] **Push Notification**: Android device receives notification with correct title/body
- [ ] **Deep Link**: Tapping notification routes to `observer_session/{sessionId}` screen
- [ ] **Waiting State**: Observer sees "Waiting for Alice to start the run session" message
- [ ] **Active State**: Observer sees live map with runner's position updating every 2-3 seconds
- [ ] **Real-time Metrics**: Observer sees runner's pace, distance, elapsed time, heart rate (if available)
- [ ] **Exit**: Observer can tap back button to exit the observer session
- [ ] **Web**: Verify runner still sees share toggle and observer list during run

---

## Summary of Required Changes

| Component | File | Type | Priority |
|-----------|------|------|----------|
| Backend Endpoint | `server/routes.ts` | New | 🔴 Critical |
| Schema Update | `shared/schema.ts` | Update | 🔴 Critical |
| Push Handler | `AiRunCoachMessagingService.kt` | Update | 🔴 Critical |
| Deep-Link Routing | `MainActivity.kt` | Update | 🔴 Critical |
| Navigation Routes | `MainScreen.kt` | Update | 🔴 Critical |
| Observer Screen | `ObserverRunSessionScreen.kt` | New | 🔴 Critical |
| Observer ViewModel | `ObserverRunSessionViewModel.kt` | New | 🔴 Critical |
| Waiting Component | `WaitingScreen.kt` | New | 🔴 Critical |
| API Models | `ApiService.kt` | Update | 🟠 High |
| Notification Service | `notification-service.ts` | No change needed | ✅ Complete |

---

## Notes

1. **Web Side**: Client-side appears mostly built. The observer experience on web (e.g., viewing a link directly) may be different from push notification flow.

2. **Notification Preference**: Check `ManageNotifications.tsx` to ensure `liveRunInvite` is enabled by default.

3. **Session Key vs Session ID**: The schema has `sessionKey` but routes use UUID `id`. Ensure consistency.

4. **Real-Time Updates**: Consider WebSocket instead of polling for better performance at scale, but polling works for MVP.

5. **Privacy**: Ensure observers can only see sessions they've been explicitly invited to (validate on GET request).

