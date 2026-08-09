# Live Session & Observer Quick Reference

## 🎯 API Endpoints at a Glance

### Session Endpoints
```
POST   /api/live-sessions                        Create session
GET    /api/live-sessions/:sessionId             Get session details
GET    /api/users/:userId/live-session           Get user's active session
PUT    /api/live-sessions/sync                   Sync metrics/location
POST   /api/live-sessions/end-by-key             End session
POST   /api/live-sessions/:sessionId/join        Join as viewer (increments viewerCount)
```

### Observer/Invite Endpoints
```
POST   /api/live-sessions/:sessionId/invite-observer      Invite observer (friend or email)
POST   /api/observer-invitations/validate                 Validate email invite token
POST   /api/live-sessions/:sessionId/invite-participant   Invite friend to group run
```

---

## 📊 Database Tables

### `live_run_sessions`
```
id                    VARCHAR(36)  PRIMARY KEY
user_id               VARCHAR(36)  REFERENCES users(id)
runner_name           TEXT                           -- Display name for observers
route_id              VARCHAR(36)  
is_active             BOOLEAN      DEFAULT true      -- Running state
has_started           BOOLEAN      DEFAULT false     -- Waiting to start
started_at            TIMESTAMP
session_key           TEXT
observe_token         TEXT                           -- Share token (32-byte hex)

-- Real-time metrics
current_lat           REAL
current_lng           REAL
current_pace          TEXT                           -- e.g., "6:30/km"
current_heart_rate    INTEGER
cadence               INTEGER
elapsed_time          INTEGER      DEFAULT 0
distance_covered      REAL         DEFAULT 0

-- Advanced data (JSON)
gps_track             JSONB                          -- [{lat, lng, timestamp, altitude}, ...]
km_splits             JSONB                          -- [{time, distance}, ...]
observers             JSONB                          -- [{userId, status, invitedAt}, ...]

-- Tracking
shared_with_friends   BOOLEAN      DEFAULT false
viewer_count          INTEGER      DEFAULT 0        -- Active viewers
difficulty            TEXT

last_synced_at        TIMESTAMP    DEFAULT NOW()
```

### `observer_invitations`
```
id                    VARCHAR(36)  PRIMARY KEY
session_id            VARCHAR(36)  REFERENCES live_run_sessions(id) ON DELETE CASCADE
runner_id             VARCHAR(36)  REFERENCES users(id) ON DELETE CASCADE
email                 VARCHAR(255)                   -- Recipient email
token                 VARCHAR(255) UNIQUE            -- Invite link token

status                TEXT         DEFAULT 'sent'    -- sent, viewed, expired
viewed_at             TIMESTAMP                      -- When user accessed link
clicked_at            TIMESTAMP                      -- When user clicked Watch

created_at            TIMESTAMP    DEFAULT NOW()
expires_at            TIMESTAMP                      -- 7 days after creation
```

---

## 🔐 Token Generation

| Type | Generation | Length | Expiration | Use Case |
|------|-----------|--------|-----------|----------|
| **observeToken** | `randomBytes(32).toString("hex")` | 64 chars | None | Session share link |
| **Invite token** | `randomBytes(32).toString("hex")` | 64 chars | 7 days | Email invite link |
| **GR invite** | `GR${Date.now().toString(36).toUpperCase()}` | ~10 chars | None | Group run code |
| **Share token** | `randomBytes(6).toString("base64url").slice(0,8)` | 8 chars | Short | Image share |

---

## 🔄 Invite Flows

### Flow 1: Invite Registered Friend to Observe
```
Runner: POST /api/live-sessions/{sessionId}/invite-observer
  └─ friendId: "friend-uuid"
       ├─ Checks friendship ✓
       ├─ Adds to observers[] JSONB array
       ├─ Sends Firebase push notification
       └─ Sends email notification
Response: { success: true, type: "registered", pushSent, emailSent }
```

### Flow 2: Invite Non-Registered User via Email
```
Runner: POST /api/live-sessions/{sessionId}/invite-observer
  └─ email: "unknown@example.com"
       ├─ Checks if registered friend (→ Flow 1 if yes)
       ├─ Creates observer_invitations record
       ├─ Generates 64-char hex token
       ├─ Sets expires_at = now + 7 days
       ├─ Sends email with link: https://app.com/invite?token={token}
       └─ Returns token to runner
Response: { success: true, type: "email", invitationToken, emailSent }
```

### Flow 3: Non-Registered Observer Joins
```
Observer: POST /api/observer-invitations/validate
  └─ token: "hex_from_email"
       ├─ Validates token exists
       ├─ Checks not expired
       ├─ Checks session is active (isActive=true)
       ├─ Marks viewed_at = now
       └─ Returns session info
       
Observer: GET /api/live-sessions/{sessionId}
  └─ Returns full session with GPS, metrics, observers

Observer: POST /api/live-sessions/{sessionId}/join
  └─ Registers as active viewer
       └─ server increments viewer_count
```

---

## 📱 Android Implementation

### Key ViewModels
- `ObserverLoginViewModel`: Validates tokens from email/deep link
- `ObserverRunSessionViewModel`: Displays live session with polling

### Polling Intervals
- **Active run**: 2 seconds (fetch GPS, metrics)
- **Waiting to start**: 3 seconds (fetch status)
- **Stopped**: Polling stops when `isActive=false`

### Data Conversion
API returns `Any` types (flexible) → App converts to Kotlin types:
- `currentLat: Any?` → `Double`
- `elapsedTime: Any?` → `Int` 
- `currentHeartRate: Any?` → `Int`

---

## 🚨 Error Codes

| Code | Endpoint | Meaning |
|------|----------|---------|
| `404` | `/observer-invitations/validate` | Token not found |
| `410` | `/observer-invitations/validate` | Token expired OR session ended |
| `403` | `/invite-observer` | Not friends OR session not owned by user |
| `400` | `/invite-observer` | Invalid email format or missing friendId/email |

---

## 🎬 State Machine for Observers

```
                    ┌─────────────────────┐
                    │   Invite Sent       │
                    │ (observers array)   │
                    └──────────┬──────────┘
                               │
                          Accepts
                               │
                    ┌─────────��▼──────────┐
                    │   Now Watching      │  ◄─── Called /api/.../join
                    │ (viewer_count ++)   │       Real-time polling
                    └──────────┬──────────┘
                               │
                        Run Ends
                               │
                    ┌──────────▼──────────┐
                    │   Session Ended     │
                    │ (isActive=false)    │
                    │ (polling stops)     │
                    └─────────────────────┘
```

---

## 📈 Observer Tracking Methods

| Observer Type | Storage | Lifetime | Access |
|---------------|---------|----------|--------|
| **Registered friend** | `live_run_sessions.observers[]` | Session | Can always watch (if has token) |
| **Email invite** | `observer_invitations` | 7 days | Needs token from email |
| **Active viewer** | `live_run_sessions.viewer_count` | Session | Incremented on /join call |

---

## 🔍 Key Fields Explained

### `observers` JSONB Array
```typescript
[
  {
    userId: "friend-uuid",
    status: "invited",        // Could add: watching, declined
    invitedAt: 1688000000000  // Milliseconds since epoch
  }
]
```

### `gps_track` JSONB Array
```typescript
[
  {
    lat: 40.7128,
    lng: -74.0060,
    timestamp: 1688000000000,
    altitude: 10.5
  }
]
```

### `km_splits` JSONB Array
```typescript
[
  { distance: 1, time: 360 },  // 1km in 6 minutes
  { distance: 2, time: 375 },  // 2km in 6:15
]
```

---

## ✅ Current Implementation Strengths

✓ Dual-track invitations (registered + email)
✓ Cryptographically secure token generation
✓ 7-day expiration on email invites
✓ Real-time polling with fallback
✓ Push + email notifications
✓ Friendship validation
✓ Session isolation (can only invite to own sessions)

---

## ⚠️ Known Limitations

- No rate limiting on invite endpoints
- `observeToken` has no expiration
- No observer capacity limits
- Observer status only: invited | (watching implied) | (no declined tracking)
- No audit log of observer access
- Group run codes are predictable (timestamp-based)

---

## 🚀 Common Tasks

### Create a Session
```bash
curl -X POST https://api.example.com/api/live-sessions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"runnerName":"John"}'
```

### Invite a Friend
```bash
curl -X POST https://api.example.com/api/live-sessions/{sessionId}/invite-observer \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"friendId":"friend-uuid"}'
```

### Invite via Email
```bash
curl -X POST https://api.example.com/api/live-sessions/{sessionId}/invite-observer \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"observer@example.com"}'
```

### Validate Email Invite
```bash
curl -X POST https://api.example.com/api/observer-invitations/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"hex_string_from_email"}'
```

### Sync Session During Run
```bash
curl -X PUT https://api.example.com/api/live-sessions/sync \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId":"session-uuid",
    "hasStarted":true,
    "currentLat":40.7128,
    "currentLng":-74.0060,
    "distanceCovered":2.5,
    "elapsedTime":900,
    "currentPace":"6:30/km"
  }'
```

---

## 📂 File Locations Quick Index

```
Backend Implementation:
  server/routes.ts                          (Lines 4444-4806)
  server/storage.ts                         (Lines 805-920)
  shared/schema.ts                          (Lines 564-617)

Android Implementation:
  network/ApiService.kt                     (Observer endpoints)
  viewmodel/ObserverLoginViewModel.kt       (Token validation)
  viewmodel/ObserverRunSessionViewModel.kt  (Live display)
  domain/model/LiveTrackingObserver.kt      (Data models)
  ui/screens/ObserverLoginScreen.kt         (Token entry UI)
  ui/screens/ObserverRunSessionScreen.kt    (Live watch UI)

Database Migrations:
  migrations/add_observer_invitations.sql   (Schema history)
```

---

