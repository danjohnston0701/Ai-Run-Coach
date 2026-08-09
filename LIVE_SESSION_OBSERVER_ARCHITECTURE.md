# AiRunCoach Live Session & Observer Tracking Architecture

## Overview
This project is a full-stack fitness application with Android, iOS, and watch companion apps. The backend is Node.js/TypeScript with a PostgreSQL database using Drizzle ORM. The system supports live run session tracking and real-time observer invitations (both registered and non-registered users).

---

## 1. API ENDPOINTS FOR LIVE SESSIONS

### Session Management Endpoints

#### Create Live Session
- **Endpoint**: `POST /api/live-sessions`
- **Auth**: Required (authMiddleware)
- **Location**: `server/routes.ts:4444`
- **Handler**: Creates a new live run session
- **Request Body**:
  ```json
  { "runnerName": "string" }
  ```
- **Response**:
  ```json
  { "id": "uuid", "success": true }
  ```
- **Key Logic**:
  - Generates random 32-byte hex token (`observeToken`)
  - Used as share link token for non-authenticated observers
  - Sets `isActive: true` and `startedAt: new Date()`

#### Get Live Session
- **Endpoint**: `GET /api/live-sessions/:sessionId`
- **Auth**: Not required
- **Location**: `server/routes.ts:4466`
- **Returns**: Full session object with current metrics

#### Get User's Current Live Session
- **Endpoint**: `GET /api/users/:userId/live-session`
- **Auth**: Not required
- **Location**: `server/routes.ts:4479`
- **Returns**: Active session for a user or null

#### Sync Live Session
- **Endpoint**: `PUT /api/live-sessions/sync`
- **Auth**: Required
- **Location**: `server/routes.ts:4489`
- **Syncs**: Updates session with latest GPS, metrics, and status

#### End Session
- **Endpoint**: `POST /api/live-sessions/end-by-key`
- **Auth**: Required
- **Location**: `server/routes.ts:4508`
- **Request Body**: `{ "sessionKey": "string" }`

---

## 2. OBSERVER INVITATION ENDPOINTS

### Invite Observers (Registered Friends)
- **Endpoint**: `POST /api/live-sessions/:sessionId/invite-observer`
- **Auth**: Required
- **Location**: `server/routes.ts:4520-4681`
- **Handler**: Invites observers (both registered and non-registered)

#### Flow 1: Invite Registered Friend
- **Request Body**:
  ```json
  {
    "friendId": "uuid"  // User ID of a registered friend
  }
  ```
- **Validation**:
  - Session must exist and belong to authenticated user
  - Users must have friend relationship
- **Actions**:
  1. Adds observer to session's `observers` JSON array:
     ```json
     {
       "userId": "uuid",
       "status": "invited",
       "invitedAt": timestamp
     }
     ```
  2. Sends Firebase push notification (data-only, fires in all states)
  3. Sends email notification if friend has email on file
- **Response**:
  ```json
  {
    "success": true,
    "type": "registered",
    "pushSent": boolean,
    "emailSent": boolean
  }
  ```

#### Flow 2: Invite Non-Registered User via Email
- **Request Body**:
  ```json
  {
    "email": "user@example.com"
  }
  ```
- **Validation**:
  - Email format validation
  - If email belongs to registered user who is friend → use Flow 1
  - If email is unknown or registered but not friend → create invitation
- **Actions**:
  1. If registered + friend: Use Flow 1 logic
  2. If unknown/non-friend:
     - Create `observer_invitations` record with unique token
     - Token = 32 random hex bytes
     - Expires in 7 days
     - Send email with invitation link containing token
- **Response**:
  ```json
  {
    "success": true,
    "type": "email",
    "emailSent": boolean,
    "invitationToken": "hex_string"
  }
  ```

### Validate Observer Invitation Token
- **Endpoint**: `POST /api/observer-invitations/validate`
- **Auth**: Not required (for non-registered users)
- **Location**: `server/routes.ts:4685-4743`
- **Handler**: Validates observer invitation and returns session info

#### Request Body:
```json
{ "token": "hex_string" }
```

#### Validation Steps:
1. Token must exist in `observer_invitations` table
2. Check expiration (7 days from creation)
3. Check if session is still active (`isActive = true`)
4. Mark invitation as viewed if not already

#### Response:
```json
{
  "success": true,
  "sessionId": "uuid",
  "runnerId": "uuid",
  "runnerName": "string",
  "hasStarted": boolean,
  "status": "waiting|running"
}
```

#### Error Responses:
- `404` + `error: "Invalid invitation token"` - Token not found
- `410` + `error: "Invitation token has expired"` - Token expired
- `410` + `error: "Sorry, this live run session has ended"` - Session ended
- `status: "ended"` in 410 response

### Invite Group Run Participant
- **Endpoint**: `POST /api/live-sessions/:sessionId/invite-participant`
- **Auth**: Required
- **Location**: `server/routes.ts:4746-4806`
- **Handler**: Invites registered friend to join group run (sends push)

---

## 3. DATABASE SCHEMA

### Live Run Sessions Table
**Table**: `live_run_sessions`
**Location**: `shared/schema.ts:564-588`

```sql
CREATE TABLE live_run_sessions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Runner & Session Identification
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  runner_name TEXT,                      -- Display name for observers
  
  -- Route Information
  route_id VARCHAR(36) REFERENCES routes(id),
  
  -- Session Status
  is_active BOOLEAN DEFAULT true,        -- True while running, false when ended
  has_started BOOLEAN DEFAULT false,     -- False while waiting to start
  started_at TIMESTAMP,                  -- When runner actually started
  session_key TEXT,                      -- Unique session identifier
  observe_token TEXT,                    -- Random token for share links
  
  -- Location & Real-time Metrics
  current_lat REAL,                      -- Current GPS latitude
  current_lng REAL,                      -- Current GPS longitude
  current_pace TEXT,                     -- Current pace (e.g., "6:30/km")
  current_heart_rate INTEGER,            -- Current HR in bpm
  cadence INTEGER,                       -- Current cadence
  
  -- Distance & Time
  elapsed_time INTEGER DEFAULT 0,        -- Seconds
  distance_covered REAL DEFAULT 0,       -- Kilometers
  
  -- Advanced Data (JSONB)
  gps_track JSONB,                       -- Array of {lat, lng, timestamp, altitude}
  km_splits JSONB,                       -- Array of split times for each km
  
  -- Observer Tracking
  observers JSONB,                       -- Array of observer objects
  shared_with_friends BOOLEAN DEFAULT false,
  viewer_count INTEGER DEFAULT 0,        -- Active viewers count
  
  -- Route Analysis
  difficulty TEXT,
  
  -- Timestamps
  last_synced_at TIMESTAMP DEFAULT NOW()
);
```

**Columns Explained**:
- `observers`: JSON array of `{ userId, status, invitedAt }` for registered observers
- `observer_token`: Random 32-byte hex for generating shareable links
- `viewer_count`: Incremented when observers call `/api/live-sessions/:id/join`
- `km_splits`: Data structure for showing split times at each kilometer mark

### Observer Invitations Table
**Table**: `observer_invitations`
**Location**: `shared/schema.ts:606-617`

```sql
CREATE TABLE observer_invitations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign Keys
  session_id VARCHAR(36) NOT NULL REFERENCES live_run_sessions(id) ON DELETE CASCADE,
  runner_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Invitation Details
  email VARCHAR(255) NOT NULL,           -- Recipient email
  token VARCHAR(255) NOT NULL UNIQUE,    -- Unique invitation token
  
  -- Status Tracking
  status TEXT DEFAULT 'sent',            -- 'sent', 'viewed', 'expired'
  viewed_at TIMESTAMP,                   -- When user first accessed the link
  clicked_at TIMESTAMP,                  -- When user clicked "Watch Live"
  
  -- Lifecycle
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP                   -- Expires 7 days after creation
);
```

**Indexes**:
```sql
CREATE INDEX idx_observer_invitations_token ON observer_invitations(token);
CREATE INDEX idx_observer_invitations_email ON observer_invitations(email);
CREATE INDEX idx_observer_invitations_session ON observer_invitations(session_id);
CREATE INDEX idx_observer_invitations_runner ON observer_invitations(runner_id);
CREATE INDEX idx_observer_invitations_expires ON observer_invitations(expires_at);
```

---

## 4. TOKEN & INVITE CODE GENERATION LOGIC

### Observer Token Generation (For Registered Observers)
**Location**: `server/routes.ts:4448-4449`

```typescript
const { randomBytes } = await import("node:crypto");
const observeToken = randomBytes(32).toString("hex");
```

- **Type**: 32-byte random hex string
- **Length**: 64 characters
- **Used**: For session.observeToken (shareable link token)
- **Generation**: Called when creating live session

### Invitation Token Generation (For Non-Registered Users)
**Location**: `server/storage.ts:884`

```typescript
async createObserverInvitation(data: { ... }): Promise<ObserverInvitation> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const [invitation] = await db
        .insert(observerInvitations)
        .values({
            ...data,
            token,
            expiresAt,
            status: "sent",
            createdAt: new Date(),
        })
        .returning();
    
    return invitation!;
}
```

- **Type**: 32-byte random hex string
- **Length**: 64 characters
- **Expiration**: 7 days
- **Tracking**: `viewed_at` and `clicked_at` timestamps

### Group Run Invite Code Generation
**Location**: `server/routes.ts:4906`

```typescript
const inviteToken = `GR${Date.now().toString(36).toUpperCase()}`;
```

- **Type**: Alphanumeric string starting with "GR"
- **Format**: `GR{timestamp_in_base36}`
- **Example**: `GRKHW5P2E` (shorter, human-readable)
- **Disadvantage**: Not cryptographically secure, sequential/predictable

### Share Image Token (Short-lived)
**Location**: `server/routes.ts:16256-16257`

```typescript
const { randomBytes } = await import("node:crypto");
const shareToken = randomBytes(6).toString("base64url").slice(0, 8);
```

- **Type**: 6 bytes of random data, base64url encoded, truncated to 8 chars
- **Format**: Short, URL-friendly
- **Used**: Share session images

---

## 5. EXISTING OBSERVER TRACKING & FRIENDSHIP LOGIC

### Friendship Management
**Location**: `server/storage.ts:865-876`

```typescript
async checkFriendship(userId1: string, userId2: string): Promise<boolean> {
    const [friendship] = await db.select()
        .from(friends)
        .where(
            or(
                and(eq(friends.userId, userId1), eq(friends.friendId, userId2)),
                and(eq(friends.userId, userId2), eq(friends.friendId, userId1))
            )
        )
        .limit(1);
    return !!friendship;
}
```

- **Bidirectional friendship check**: Works both ways
- **Used by**: Invite observer flow to validate user relationships

### Observer Tracking in Session
**Location**: `server/storage.ts:836-863`

```typescript
async inviteObserver(sessionId: string, observerId: string): Promise<LiveRunSession | undefined> {
    const session = await this.getLiveSession(sessionId);
    if (!session) return undefined;

    // Build observers array - initialize if null
    const observers = (session.observers as any[] | null) || [];
    
    // Check if observer already invited
    const alreadyInvited = observers.some(obs => obs.userId === observerId);
    if (alreadyInvited) {
        return session; // Already invited, return existing
    }

    // Add new observer invitation
    observers.push({
        userId: observerId,
        status: "invited",
        invitedAt: Date.now(),
    });

    // Update session with new observers list
    const [updated] = await db.update(liveRunSessions)
        .set({ observers })
        .where(eq(liveRunSessions.id, sessionId))
        .returning();
    return updated || undefined;
}
```

**Observer Object Structure**:
```typescript
{
    userId: "uuid",           // Invited observer's user ID
    status: "invited",        // Status: invited | watching | declined
    invitedAt: timestamp      // Milliseconds when invited
}
```

### Viewer Count Tracking
- **Column**: `viewer_count` in `live_run_sessions`
- **Incremented**: When observer calls `POST /api/live-sessions/:sessionId/join`
- **Purpose**: Show runner how many people are actively watching

---

## 6. ANDROID APP IMPLEMENTATION

### Observer Models
**File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/LiveTrackingObserver.kt`

```kotlin
data class LiveTrackingObserver(
    val userId: String,
    val userName: String,
    val profilePicUrl: String?,
    val invitedAt: Long,        // Timestamp in milliseconds
    val status: ObserverStatus  // INVITED, WATCHING, DECLINED
)

enum class ObserverStatus {
    INVITED,    // Invitation sent but not yet accepted
    WATCHING,   // Actively watching the run session
    DECLINED    // Declined the invitation
}
```

### Observer Login ViewM

odel
**File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/ObserverLoginViewModel.kt`

**Purpose**: Validates observer invitation tokens for non-registered users

**Flow**:
1. User enters token from email or deep link
2. `validateAndLoadSession(token)` calls API
3. API validates token and checks session status
4. Returns `sessionId` or error message
5. UI navigates to `ObserverRunSessionScreen` with validated sessionId

**Error Handling**:
- `404`: Token not found
- `410`: Session ended or token expired
- `400`: Invalid token format
- Timeout/network errors with user-friendly messages

### Observer Run Session ViewModel
**File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/ObserverRunSessionViewModel.kt`

**Purpose**: Displays live session data to observers

**Key Features**:
- Polls session every 2 seconds for updates (once started)
- Polls every 3 seconds while waiting for runner to start
- Registers observer as "active viewer" via `/api/live-sessions/:id/join`
- Converts API response to UI model with type flexibility
- Stops polling once session is inactive

**API Data Conversion**:
```kotlin
data class LiveSessionApiResponse(
    val id: String,
    val userId: String,
    val runnerName: String?,
    val currentLat: Any?,           // Double or String
    val currentLng: Any?,           // Double or String
    val currentPace: String?,
    val currentHeartRate: Any?,     // Int or String
    val elapsedTime: Any?,          // Int or String
    val distanceCovered: Any?,      // Double or String
    val hasStarted: Boolean?,
    val startedAt: Any?,
    val routeId: String?,
    val isActive: Boolean?,
    val observers: Any?,            // List of invited observers
    val viewerCount: Int?,          // Active viewers count
    // ... GPS track and splits data
)
```

### Network API Definitions
**File**: `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`

**Key Endpoints**:

```kotlin
@POST("/api/live-sessions/:sessionId/invite-observer")
suspend fun inviteObserver(
    @Path("sessionId") sessionId: String,
    @Body body: InviteObserverRequest
): InviteObserverResponse

@POST("/api/observer-invitations/validate")
suspend fun validateObserverInvitation(
    @Body body: ValidateObserverInvitationRequest
): ValidateObserverInvitationResponse

@POST("/api/live-sessions/{sessionId}/join")
suspend fun joinLiveSession(
    @Path("sessionId") sessionId: String
): JoinLiveSessionResponse

@GET("/api/live-sessions/{sessionId}")
suspend fun getLiveSession(
    @Path("sessionId") sessionId: String
): LiveSessionApiResponse
```

**Request/Response Data Classes**:

```kotlin
data class InviteObserverRequest(
    val friendId: String? = null,  // User ID of registered friend
    val email: String? = null       // Email (registered or non-registered)
)

data class ValidateObserverInvitationRequest(val token: String)

data class ValidateObserverInvitationResponse(
    val success: Boolean,
    val sessionId: String?,
    val runnerId: String?,
    val runnerName: String?,
    val hasStarted: Boolean?,
    val status: String?,            // "waiting" or "running"
    val error: String?
)
```

---

## 7. MIGRATIONS & SCHEMA HISTORY

### Observer Invitations Migration
**File**: `migrations/add_observer_invitations.sql`
**Date**: July 1, 2026
**Purpose**: Support email-based invitations for non-registered observers

**Creates**:
- `observer_invitations` table with 5 indexes
- Foreign keys to `live_run_sessions` and `users`
- Status tracking columns

---

## 8. KEY FINDINGS & DESIGN PATTERNS

### Observer Tracking Approaches
1. **Registered Observers**: Stored in `observers` JSONB array in `live_run_sessions`
2. **Non-Registered Observers**: Tracked via `observer_invitations` table with token
3. **Active Viewers**: Tracked via `viewer_count` in `live_run_sessions`

### Token Security
- **Observer token**: Generated fresh for each session
- **Invitation token**: 32-byte random hex (cryptographically secure)
- **Expires**: 7 days for email invitations
- **No rate limiting**: Visible in current code

### Real-time Updates
- **Polling interval**: 2 seconds (active run), 3 seconds (waiting)
- **Syncing**: `PUT /api/live-sessions/sync` pushed by runner
- **Reactive updates**: Observable via viewer count changes

### Notification Integrations
- **Push**: Firebase Cloud Messaging (data-only payloads)
- **Email**: Custom templates (observer invitations, friend invites)
- **In-app**: Via notification system

---

## 9. POTENTIAL IMPROVEMENT AREAS

1. **Token expiration for observeToken**: No expiration on session share token
2. **Rate limiting**: No protection on invite endpoints
3. **Observer capacity**: No max observers limit visible
4. **Invite status tracking**: Could enhance to track RSVP/acceptance
5. **Email verification**: Non-registered observers not verified before access
6. **Session access audit**: No logging of observer access patterns
7. **Group run invite codes**: More human-readable but less secure than hex tokens

---

## 10. DIRECTORY STRUCTURE SUMMARY

```
server/
├── routes.ts                          # Main API endpoints (17,808 lines)
├── storage.ts                         # Database layer (1,349 lines)
├── session-coaching-service.ts        # Session AI coaching logic
├── notification-service.ts            # Push/email notifications
├── email-service.ts                   # Email templates & delivery
├── index.ts                          # Server startup

shared/
└── schema.ts                          # Drizzle ORM table definitions

migrations/
└── add_observer_invitations.sql       # Observer tracking schema

app/src/main/java/live/airuncoach/airuncoach/
├── network/ApiService.kt             # Retrofit API definitions
├── viewmodel/
│   ├── ObserverLoginViewModel.kt      # Token validation logic
│   └── ObserverRunSessionViewModel.kt # Live session display
├── ui/screens/
│   ├── ObserverLoginScreen.kt         # Token entry UI
│   └── ObserverRunSessionScreen.kt    # Live watch UI
└── domain/model/LiveTrackingObserver.kt
```

---

## CONCLUSION

The project has a **well-structured observer tracking system** with:
- ✅ Dual-track observer support (registered + non-registered)
- ✅ Secure token generation (crypto.randomBytes)
- ✅ Email-based invitations with 7-day expiration
- ✅ Real-time polling for live updates
- ✅ Push/email notification integration
- ✅ Friendship-based validation

**Next steps would be**: Implement invite code tracking for reporting, add rate limiting on invites, and enhance observer status tracking (RSVP/acceptance).

