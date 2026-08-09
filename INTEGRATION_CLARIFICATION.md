# Integration Clarification — Observer Count & In-App Code Share

After reviewing the actual backend code, here are the confirmed integration points:

---

## 1. Observer Count — How It Works (CURRENTLY)

### ❌ Current State
The `incrementObserverCount` and `decrementObserverCount` methods **exist in storage.ts** but are **NOT called from any endpoint**. There is currently **no explicit join/leave/heartbeat mechanism**.

### 📊 What This Means for iOS

**Option A (Passive counting): ✅ No iOS changes needed**
- Backend could count active pollers based on recent GET requests
- Observer polls every 2-3s → backend sees activity
- Backend tracks "last poll timestamp" per observer
- Observer count = distinct observers with poll within last ~10s
- **iOS already works** with polling; no join/leave endpoint needed

**Option B (Explicit registration): ❌ Requires iOS changes**
- Backend needs: `POST /api/live-sessions/:id/observer-join` + `/observer-leave` endpoints
- iOS must call `/observer-join` when `ObserverRunSessionViewModel` appears
- iOS must call `/observer-leave` when exiting
- iOS must handle missing join on page refresh (need /observer-heartbeat?)

### 🎯 My Recommendation
**Go with Option A (passive counting).** Here's why:
- No new endpoints needed
- iOS has no changes (already polls every 2-3s)
- Reliable: polling activity ≈ watching
- Self-correcting: idle observer removed after 10s timeout
- Matches mobile app patterns (work with existing polling)

### 📝 To Implement Option A
I'll add this logic to `GET /api/live-sessions/:sessionId`:
```typescript
// Track observer activity (in-memory for single server, or Redis for distributed)
observerActivity[sessionId] = new Set()

GET /api/live-sessions/:sessionId {
  // Record this observer's poll (use client IP or auth token)
  observerActivity[sessionId].add(clientId)
  
  // Count = observers who polled within last 10s
  observer_count = observerActivity[sessionId].size
  
  // Return count in response
  return { ...session, observer_count }
}

// Periodically clean up (every 30s):
// - Remove observers not polled in 10s
// - Save to DB for persistence
```

---

## 2. GPS Track Point Shape — Confirmed ✅

### Backend sends (PUT sync accumulation):
```typescript
// Input from runner:
currentLat: 40.7128
currentLng: -74.0060

// Converted to GPS point:
{
  lat: 40.7128,
  lng: -74.0060,
  timestamp: Date.now()  // milliseconds, Unix epoch
}

// Stored in gps_track array:
"gps_track": [
  { "lat": 40.7128, "lng": -74.0060, "timestamp": 1723123456789 },
  { "lat": 40.7129, "lng": -74.0059, "timestamp": 1723123457000 }
]
```

### ✅ Confirmed for iOS
- **latitude key:** `lat` (not `latitude`)
- **longitude key:** `lng` (not `longitude` or `lon`)
- **timestamp:** milliseconds (1723123456789, not seconds)
- **altitude:** optional, included if provided

**iOS is robust** (accepts both lat/latitude variants) so no changes needed.

---

## 3. Invite Code in App — Currently Missing 🔴

### Current State
- ✅ Invite code **generated** when creating observer invitation
- ✅ Invite code **in email**
- ❌ Invite code **NOT returned** from `POST /api/live-sessions`
- ❌ Invite code **NOT returned** from `POST /api/live-sessions/:id/invite-observer`

### What POST /api/live-sessions Currently Returns
```json
{
  "id": "session-uuid",
  "success": true
  // NO inviteCode field
}
```

### What iOS Currently Uses
```swift
// iOS calls POST /api/live-sessions to create session
// Gets back { id, success }
// Decodes to CreateLiveSessionResponse
// No way to get the code
```

### ❓ Do You Want In-App Code Sharing?

**If YES:** iOS needs the code to show in-app for phone sharing:
- Add `inviteCode` to `POST /api/live-sessions` response
- iOS stores it in `RunSessionViewModel`
- Show it in a "Share this code" UI (with copy button)
- Display format: "A2B3C4D5" in large monospace font

**If NO (email-only):** Don't change anything. Code stays in email only.

### 🎯 My Recommendation
**YES — include in-app code sharing.** Here's why:
- Runner can tell friend the code verbally
- Friend types it without waiting for email
- Better UX for synchronous observation
- Minimal backend change (just include it in response)

### 📝 To Implement In-App Code Share
**Backend change (small):**
```typescript
POST /api/live-sessions {
  // Create session...
  const session = await storage.createLiveSession({...});
  
  // Also create a session-level invite code for the runner to share
  // (or just return empty string if no code yet)
  const inviteCode = generateInviteCode(); // 8-char code
  
  return res.json({
    id: session.id,
    success: true,
    inviteCode: inviteCode  // ← NEW: Add this
  });
}
```

**iOS change (small):**
```swift
// In RunSessionViewModel after creating session
let response = await createLiveSession(runnerName: "Alice")
self.inviteCode = response.inviteCode  // Store it

// In UI:
if let code = viewModel.inviteCode {
  Text("Share this code: \(code)")
    .font(.system(.title2, design: .monospaced))
    .padding()
    .onTapGesture {
      UIPasteboard.general.string = code
      showCopiedNotification()
    }
}
```

---

## Summary of Decisions Needed

| Item | Current State | Option A | Option B | My Rec |
|------|---------------|----------|----------|--------|
| **Observer count** | Methods exist, not called | Passive polling counts | Explicit join/leave | **A** ✅ |
| **GPS track keys** | `lat`, `lng`, `timestamp` | iOS decodes robustly | No iOS changes needed | **✅** |
| **Invite code share** | In email only | Don't change | Add to POST response | **B** ✅ |

---

## Action Items

### For Backend (Me)
- [ ] **If you want Option A (observer count):** I'll add passive polling-based counting to GET endpoint
- [ ] **If you want in-app code sharing:** I'll return `inviteCode` from POST /api/live-sessions

### For iOS (You)
- [ ] **If Option A:** No changes (already polls, observer count auto-populated)
- [ ] **If in-app code sharing:** Wire `RunSessionViewModel.inviteCode` to UI display

### For Confirmation
Please confirm:
1. **Observer count:** Should I implement passive polling-based counting (Option A)?
2. **In-app code:** Should I return `inviteCode` from `POST /api/live-sessions`?

Once confirmed, I'll make the backend changes and update docs.

---

## Technical Deep-Dive (If Interested)

### Passive Observer Counting (Option A)
```typescript
// In-memory tracking (single server)
const observerActivityMap = new Map<string, Map<string, number>>();
// sessionId -> { observerId -> lastPollTimestamp }

GET /api/live-sessions/:sessionId {
  const clientId = req.ip || req.user?.id; // Use IP or user ID
  
  if (!observerActivityMap.has(sessionId)) {
    observerActivityMap.set(sessionId, new Map());
  }
  
  const activity = observerActivityMap.get(sessionId)!;
  activity.set(clientId, Date.now()); // Record poll
  
  // Clean up observers inactive for >10s
  const now = Date.now();
  for (const [id, lastPoll] of activity.entries()) {
    if (now - lastPoll > 10000) {
      activity.delete(id); // Remove idle observer
    }
  }
  
  const observer_count = activity.size;
  
  // Return session with count
  return { ...session, observer_count };
}

// Optional: Periodically persist to DB for crash recovery
setInterval(() => {
  for (const [sessionId, activity] of observerActivityMap.entries()) {
    const count = activity.size;
    db.update(liveRunSessions)
      .set({ observerCount: count })
      .where(eq(liveRunSessions.id, sessionId));
  }
}, 30000); // Every 30 seconds
```

### Explicit Join/Leave (Option B)
```typescript
POST /api/live-sessions/:sessionId/observer-join {
  const observerId = req.user?.id || req.ip;
  
  const registeredObservers = getRegisteredObservers(sessionId);
  registeredObservers.add(observerId);
  
  incrementObserverCount(sessionId);
  
  return { observer_count, success: true };
}

POST /api/live-sessions/:sessionId/observer-leave {
  const observerId = req.user?.id || req.ip;
  
  const registeredObservers = getRegisteredObservers(sessionId);
  registeredObservers.delete(observerId);
  
  decrementObserverCount(sessionId);
  
  return { observer_count, success: true };
}
```

**Issues with Option B:**
- What if iOS crashes? Observer leaves data orphaned
- Requires heartbeat if observer stalls (more complexity)
- Session-level observers (multiple per device) are tricky to track
- Polling-based is more resilient

