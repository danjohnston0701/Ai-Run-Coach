# Share Live Run Session — User Flows & Diagrams

---

## Flow 1: Invite Registered Friend

### Runner's Perspective

```
┌─────────────────────────────────────┐
│   During Active Run (Web)           │
│                                     │
│  [Map View]                     🔗  │  ← Share button
│  Current: 3.2 km                   │
│  Pace: 5:45/km                     │
└─────────────────────────────────────┘
            ↓ [Click Share]
┌─────────────────────────────────────┐
│   Share Modal                       │
│                                     │
│  Friends:                           │
│  [🔘] Alice                         │
│  [🔘] Bob                           │
│  [🔘] Carol                         │
│                                     │
│  + Add another person               │
└─────────────────────────────────────┘
            ↓ [Toggle Alice On]
           POST /api/live-sessions/{id}/invite-observer
           { runnerId, friendId: "alice-id" }
            ↓ Response: { success: true, pushSent: true }
┌─────────────────────────────────────┐
│   Toast: "Invited Alice ✅"         │
│   (Alice is now watching)           │
└─────────────────────────────────────┘
```

### Friend's Perspective (Registered Observer)

```
┌───────────────────────────���─────────┐
│   Alice's Phone (Background)        │
│                                     │
│   🔔 NOTIFICATION                   │
│   ┌───────────────────────────────┐ │
│   │ Tom invited you to watch their│ │
│   │ run                           │ │
│   │                               │ │
│   │ Watch their live location and │ │
│   │ route in real-time            │ │
│   │                               │ │
│   │        [TAP TO VIEW]           │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
            ↓ [Tap Notification]
        Firebase → Deeplink
     observer_session/{sessionId}
            ↓
┌─────────────────────────────────────┐
│   Observer Session Screen           │
│   (If run not started yet)          │
│                                     │
│              🔄                     │
│         (Spinning)                  │
│                                     │
│   Waiting for Tom to start the      │
│   run session                       │
│                                     │
│   You'll see their live location    │
│   and metrics once they begin       │
│                                     │
│           [Cancel]                  │
└─────────────────────────────────────┘
       ↓ (Polling every 3 seconds)
       ↓ (Tom starts running)
┌─────────────────────────────────────┐
│   Live Run Map                      │
│   (Auto-transition)                 │
│                                     │
│  ┌─────────────────────────────────┤ │
│  │                                 │ │
│  │        [Map with route]      📍  │ │
│  │  polyline (blue)  marker       │ │
│  │        (red)                    │ │
│  │                                 │ │
│  └─────────────────────────────────┤ │
│                                     │
│  Metrics:                           │
│  Distance: 4.1 km | Time: 23:30     │
│  Pace: 5:43/km | HR: 168 bpm        │
│                                     │
│              [Exit]                 │
└─────────────────────────────────────┘
       ↓ (Metrics update every 2s)
       ↓ (Tom finishes run)
┌─────────────────────────────────────┐
│   Run Finished                      │
│                                     │
│         ✅ Run finished             │
│                                     │
│  [Go Back to Dashboard] [Close]     │
└─────────────────────────────────────┘
```

---

## Flow 2: Invite Non-Registered User (Email)

### Runner's Perspective

```
┌───���─────────────────────────────────┐
│   During Active Run (Web)           │
│                                     │
│  [Map View]                     🔗  │
│  Current: 3.2 km                   │
│  Pace: 5:45/km                     │
└─────────────────────────────────────┘
            ↓ [Click Share]
┌─────────────────────────────────────┐
│   Share Modal                       │
│                                     │
│  Friends:                           │
│  [🔘] Alice                         │
│  [🔘] Bob                           │
│                                     │
│  + Add another person               │
└─────────────────────────────────────┘
       ↓ [Click Add another person]
┌─────────────────────────────────────┐
│   Share Modal (Extended)            │
│                                     │
│  Friends:                           │
│  [🔘] Alice                         │
│  [🔘] Bob                           │
│                                     │
│  Non-Registered Users:              │
│  [Email input field]                │
│  Enter email address                │
│  ┌────────────────────────────���──┐ │
│  │ jane@example.com              │ │
│  └───────────────────────────────┘ │
│                                     │
│          [Send Invite]              │
└─────────────────────────────────────┘
           ↓ [Enter email & click Send]
  POST /api/live-sessions/{id}/invite-observer
  { runnerId, email: "jane@example.com" }
           ↓
  Backend checks: Is jane@example.com registered?
  NO → Create invitation record + send email
  Response: { success: true, type: "email", emailSent: true }
           ↓
┌─────────────────────────────────────┐
│   Toast: "Invite sent to jane@... ✅"
└─────────────────────────────────────┘
```

### Non-Registered User's Perspective

```
┌─────────────────────────────────────┐
│   Jane's Email Inbox                │
│                                     │
│   📧 From: noreply@airuncoach.live  │
│   Subject: Tom invited you to watch │
│   their run                         │
│                                     │
│   ┌───────────────────────────────┐ │
│   │ 🏃 You're invited to watch a  │ │
│   │    live run!                  │ │
│   │                               │ │
│   │ Tom has invited you to watch  │ │
│   │ their run in real-time.       │ │
│   │                               │ │
│   │ See their live location, route│ │
│   │ and metrics as they run.      │ │
│   │                               │ │
│   │    [Watch Live Run →]         │ │
│   │                               │ │
│   │ Or paste: ...observe/token... │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
           ↓ [Click link in email]
    https://airuncoach.live/observe/{token}
           ↓
           GET /api/observe/{token}
           (No authentication required)
           ↓
┌─────────────────────────────────────┐
│   Observer Session Page             │
│   (If run not started yet)          │
│                                     │
│              🔄                     │
│         (Spinning)                  │
│                                     │
│   Waiting for Tom to start the      │
│   run session                       │
│                                     │
│   You'll see their live location    │
│   and metrics once they begin       │
│                                     │
│       (No close button - can)        │
│        (browser back button)         │
└─────────────────────────────────────┘
       ↓ (Polling every 3 seconds)
       ↓ (Tom starts running)
┌─────────────────────────────────────┐
│   Live Run Map                      │
│   (Web browser - public)            │
│                                     │
│  ┌─────────────────────────────────┤ │
│  │                                 │ │
│  │        [Map with route]      📍  │ │
│  │  polyline (blue)  marker       │ │
│  │        (red)                    │ │
│  │                                 │ │
│  └─────────────────────────────────┤ │
│                                     │
│  Metrics:                           │
│  Distance: 4.1 km | Time: 23:30     │
│  Pace: 5:43/km | HR: 168 bpm        │
│                                     │
│           (No exit button)          │
└─────────────────────────────────────┘
       ↓ (Metrics update every 2s)
       ↓ (Tom finishes run)
┌─────────────────────────────────────┐
│   Run Finished Screen               │
│   (Web browser - non-registered)    │
│                                     │
│         ✅ Run finished.            │
│    You can close this tab now.      │
│                                     │
│   [OPTIONAL: Marketing link]        │
│   "Create account to save your      │
│    activities"                      │
└─────────────────────────────────────┘
           ↓ [Close browser]
```

---

## API Communication Flow

### Registered User Invite

```
Runner App (Web)
│
├─ User clicks "Share"
│
├─ POST /api/live-sessions/{sessionId}/invite-observer
│  Payload: { runnerId, friendId: "alice-id" }
│
└─ Backend (Node.js)
   │
   ├─ Validate session ownership
   ├─ Validate friendship
   ├─ Insert observer into live_run_sessions.observers[]
   │
   ├─ sendFirebasePush("alice-id", title, body, data)
   │  └─ Firebase Admin SDK → FCM
   │     └─ Android device receives notification
   │
   └─ Response: { success: true, pushSent: true }
        ↓
        Observer's phone receives push
        │
        ├─ User taps notification
        ├─ Deep link: observer_session/{sessionId}
        ├─ GET /api/live-sessions/{sessionId}
        │
        └─ ObserverRunSessionScreen opens
```

### Non-Registered User Invite

```
Runner App (Web)
│
├─ User clicks "Share"
├─ Enters email: jane@example.com
│
├─ POST /api/live-sessions/{sessionId}/invite-observer
│  Payload: { runnerId, email: "jane@example.com" }
│
└─ Backend (Node.js)
   │
   ├─ Validate session ownership
   ├─ Check: Is email registered?
   │  └─ NO
   │
   ├─ CREATE observer_invitations record
   │  ├─ id: uuid
   │  ├─ sessionId, runnerId
   │  ├─ email: "jane@example.com"
   │  ├─ token: random 64-char hex
   │  ├─ status: "sent"
   │  ├─ expiresAt: now + 7 days
   │
   ├─ sendObserverInvitationEmail()
   │  ├─ Email service (Resend/SendGrid)
   │  ├─ To: jane@example.com
   │  ├─ Link: https://airuncoach.live/observe/{token}
   │  └─ ✅ Email sent
   │
   └─ Response: { success: true, type: "email", emailSent: true }
        ↓
        Jane receives email
        │
        ├─ Clicks link: https://airuncoach.live/observe/{token}
        │
        ├─ GET /api/observe/{token}
        │  ├─ Validate token exists
        │  ├─ Check not expired
        │  ├─ Load live_run_sessions by sessionId
        │  ├─ UPDATE invitation.viewedAt
        │  └─ Return session data
        │
        └─ Browser loads ObserveSession.tsx
           └─ Shows waiting or live map view
```

---

## Database Schema Relationships

```
users
  │
  ├─ (owns) live_run_sessions
  │  │
  │  ├─ id, userId, routeId
  │  ├─ currentLat, currentLng
  │  ├─ observers: JSONB [
  │  │    { userId, status, invitedAt },  ← Registered friends
  │  │  ]
  │  └─ (many) observer_invitations  ← Non-registered email invites
  │
  └─ (receives) observer_invitations
     │
     ├─ id, sessionId, runnerId, email
     ├─ token (unique, random)
     ├─ status: 'sent' | 'viewed' | 'expired'
     ├─ expiresAt (7 days)
     └─ viewedAt, clickedAt timestamps
```

---

## State Transitions

### Run Not Started → Started

```
┌──────────────────┐
│  Waiting State   │ ← Observer waiting for runner to start
│  hasStarted=false│
│  Polling 3s      │
└──────────────────┘
         │ Runner starts GPS tracking
         │ PUT /api/live-sessions/sync { hasStarted: true }
         ↓
┌──────────────────┐
│  Active State    │ ← Observer sees live map
│  hasStarted=true │
│  Polling 2s      │
└──────────────────┘
         │ Runner finishes run
         │ POST /api/live-sessions/end-by-key
         ↓
┌──────────────────┐
│  Finished State  │ ← Observer sees completion screen
│  (can close)     │
└──────────────────┘
```

---

## Real-Time Data Updates

### Observer Receives Live Metrics

```
       ┌─────────────────────────────────────┐
       │    Live Session Real-Time Data      │
       │    GET /api/live-sessions/{id}      │
       └─────────────────────────────────────┘
                     │
      ┌──────────────┼──────────────┐
      │              │              │
   2s polling   2s polling    2s polling
      │              │              │
      ↓              ↓              ↓
   Update 1      Update 2      Update 3
   4.1 km        4.3 km        4.5 km
   23:30         24:30         25:30
   5:43/km       5:42/km       5:41/km
   168 bpm       170 bpm       172 bpm

Map pans smoothly from old position to new position
Metrics update with fade animation
```

---

## Error Handling Flows

### Invalid Token

```
Observer clicks link: /observe/invalid-token
    │
    ├─ GET /api/observe/invalid-token
    │
    └─ Backend: Token not found in DB
       │
       └─ 404 Response: { error: "Invalid or expired link" }
            │
            └─ Browser shows:
               ❌ Error
               "This link is invalid or has already expired.
                Ask the runner to send a new invite."
```

### Expired Token

```
Observer clicks link: /observe/token-from-8-days-ago
    │
    ├─ GET /api/observe/token-from-8-days-ago
    │
    └─ Backend: Token exists but expiresAt < now
       │
       └─ 410 Response: 
          { error: "Link expired", isExpired: true }
            │
            └─ Browser shows:
               ⏰ Invitation Expired
               "This link expired on July 8, 2026.
                Ask Tom to send a new invite."
```

### Network Error During Waiting

```
Observer waiting for runner to start
    │
    ├─ Poll: GET /api/live-sessions/{sessionId}
    │  └─ Network timeout ❌
    │
    └─ Browser:
       Show error toast (top right)
       "Connection lost. Retrying..."
       │
       └─ Retry poll after 3 seconds
```

---

## Push Notification Payload

```json
{
  "notification": {
    "title": "Tom invited you to watch their run",
    "body": "Watch their live location and route in real-time"
  },
  "data": {
    "type": "live_run_invite",
    "sessionId": "abc-123-def",
    "runnerId": "user-tom",
    "runnerName": "Tom",
    "routeId": "route-456",
    "hasStarted": "false"
  },
  "android": {
    "priority": "high",
    "notification": {
      "click_action": "observer_session/abc-123-def"
    }
  }
}
```

---

## Email Structure

### Subject Line
```
{runnerName} invited you to watch their run
Example: "Tom invited you to watch their run"
```

### Email Body

```
┌────────────────────────────────────────────┐
│                                            │
│  🏃 You're invited to watch a live run!   │
│                                            │
│  Tom has invited you to watch their run   │
│  in real-time.                            │
│                                            │
│  See their live location, route, and      │
│  metrics as they run.                     │
│                                            │
│     ┌──────────────────────────────────┐ │
│     │    [Watch Live Run →]            │ │
│     └──────────────────────────────────┘ │
│                                            │
│  Or paste this link in your browser:      │
│  https://airuncoach.live/observe/        │
│  a1b2c3d4e5f6g7h8i9j0...                 │
│                                            │
│  This link will expire in 7 days.         │
│                                            │
│  ---                                       │
│  AI Run Coach — Your personal running     │
│  coach                                     │
│                                            │
└────────────────────────────────────────────┘
```

---

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| **Waiting State Poll Interval** | 3 seconds | Check every 3s if runner started |
| **Active State Poll Interval** | 2 seconds | Update live metrics frequently |
| **Email Token Expiry** | 7 days | Reasonable window for invites |
| **Map Update Debounce** | Position > 10m | Only pan map if moved significantly |
| **Metrics Update Debounce** | 2 seconds | Smooth UI updates |

---

## Security Considerations

1. **Token Validation**
   - Tokens are 64-character random hex strings
   - Difficult to guess or brute-force
   - Validated on every request

2. **Invitation Expiry**
   - Links expire after 7 days
   - Old invitations can't be replayed

3. **Access Control**
   - Non-registered users can only see invited session
   - Can't see other runners' sessions
   - Can't access after link expires

4. **Privacy**
   - Email invitations don't create user accounts
   - No tracking across sessions
   - No access to runner's other activities

5. **Rate Limiting**
   - Should implement rate limiting on email sends
   - Max 10 invites per run session
   - Max 1 email per minute per address

---

## File Structure

```
server/
├── routes.ts                    [MODIFY]
│   └─ POST /api/live-sessions/:sessionId/invite-observer
│   └─ GET /api/observe/:token
├── storage.ts                   [MODIFY]
│   └─ createObserverInvitation()
│   └─ getObserverInvitation()
│   └─ updateObserverInvitation()
│   └─ getUserByEmail()
├── notification-service.ts      [MODIFY]
│   └─ sendObserverInvitationEmail()
│   └─ getEmailService()
└── migrations/
    └─ add_observer_invitations.sql  [NEW]

shared/
└── schema.ts                    [MODIFY]
    └─ observerInvitations table

client/
└── src/pages/
    ├── RunSession.tsx           [MODIFY]
    │   └─ Add email input UI
    └── ObserveSession.tsx       [NEW]
        └─ Public observer page

app/android/
├── ObserverRunSessionScreen.kt  [NO CHANGE]
├── ObserverRunSessionViewModel.kt [NO CHANGE]
└── ...

ios/
└── Screens/
    └─ ObserverRunSessionView.swift [READY]
```
