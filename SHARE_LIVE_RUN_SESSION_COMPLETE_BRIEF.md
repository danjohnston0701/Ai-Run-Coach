# Share Live Run Session — Complete Implementation Brief

**Date**: July 1, 2026  
**Status**: Comprehensive Review & Enhancement Plan  
**Scope**: Full stack implementation for inviting observers to live run sessions  

---

## Overview

The **Share Live Run Session** feature allows runners to invite others to watch their live run in real-time. The feature has partial implementation, but needs enhancements to:

1. ✅ **Current**: Invite registered users (existing friends)
2. ❌ **Needed**: Invite non-registered users via email
3. ✅ **Partial**: Push notifications to registered users
4. ⚠️ **Incomplete**: Email delivery to non-registered users
5. ⚠️ **Incomplete**: Observer-only UI for non-registered users

---

## Complete User Flows

### Flow 1: Invite Registered User (Friend)

#### Runner's Side
1. **During run** → Web client shows "Share" button
2. **Click share** → See list of friends with toggle switches
3. **Toggle friend ON** → System immediately invites them
4. **Visual feedback** → Toast shows "Invited {Friend Name}"

#### Observer's Side (Registered User)
1. **Receive push notification** on their phone:
   - Title: "{Runner Name} invited you to watch their run"
   - Body: "Watch their live location and route in real-time"
   - Data: `{ type: "live_run_invite", sessionId, runnerId, runnerName }`

2. **Tap notification** → Deep link routes to observer session screen

3. **If runner hasn't started yet**:
   - See waiting screen: "Waiting for {Runner Name} to start the run session"
   - Spinner indicates active polling (checking every 3 seconds)
   - Cancel button to exit

4. **Once runner starts**:
   - Auto-transition to live map view
   - See runner's real-time location on map
   - Polyline shows the full route (if available) + runner's covered route
   - Real-time metrics panel: Distance, Time, Pace, HR (if available)
   - Metrics update every 2 seconds

5. **When runner finishes**:
   - See "Run finished" screen
   - Button: "Go Back to Dashboard" → returns to main app
   - Can also press back button to exit

---

### Flow 2: Invite Non-Registered User (Email)

#### Runner's Side
1. **During run** → Share button shows friends list
2. **See "Add another person" option** at bottom
3. **Click** → Show modal with email input field
4. **Enter email** (e.g., "alice@example.com")
5. **Click send** → System creates invite link and sends email
6. **Toast feedback** → "Invite sent to alice@example.com"

#### Observer's Side (Non-Registered User)
1. **Receive email** with subject: "{Runner Name} invited you to watch their run"

   **Email body** includes:
   - Friendly message: "Tom invited you to watch his 5K run live!"
   - Link text: "Watch Live Run"
   - Actual link: `https://airuncoach.live/observe/{sessionToken}`
   - Fallback: "Or paste this link: [URL]"

2. **Click link in email** → Browser opens observer-only session page
   - **No app required** for non-registered users
   - Works on web browser (any device)

3. **If runner hasn't started yet**:
   - See waiting screen: "Waiting for {Runner Name} to start the run session"
   - Spinner + polling message
   - No "Dashboard" option (they're not registered)

4. **Once runner starts**:
   - Auto-transition to live map view
   - Same live map + metrics as registered users
   - Real-time updates every 2 seconds

5. **When runner finishes**:
   - See final screen: "**Run finished.** You can close this tab now."
   - **Simpler than registered users** (no Dashboard button)
   - Optionally: "Create account to save your activity" (marketing)

---

## Data Model & API Contracts

### 1. Extended LiveRunSession (Database)

```typescript
// shared/schema.ts
export const liveRunSessions = pgTable("live_run_sessions", {
  // ... existing fields ...
  observers: jsonb("observers"),  // ✅ Already exists
  publicObserverTokens: jsonb("public_observer_tokens"),  // NEW
  // Structure:
  // [
  //   { sessionId, token, email, createdAt, expiresAt }
  // ]
});
```

### 2. Observer Invitation Record (New Table)

```typescript
// NEW: Public observer invitations (for non-registered users)
export const observerInvitations = pgTable("observer_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => liveRunSessions.id),
  runnerId: varchar("runner_id").notNull().references(() => users.id),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),  // Random token for URL
  status: text("status"),  // 'sent' | 'viewed' | 'expired'
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),  // 7 days from creation
  viewedAt: timestamp("viewed_at"),
  clickedAt: timestamp("clicked_at"),
});
```

### 3. Push Notification Payload (Already Correct)

```json
{
  "title": "{runnerName} invited you to watch their run",
  "body": "Watch their live location and route in real-time",
  "data": {
    "type": "live_run_invite",
    "sessionId": "abc-123",
    "runnerId": "user-123",
    "runnerName": "Tom",
    "routeId": "route-456",
    "hasStarted": "false"
  }
}
```

### 4. API Response Models

#### GET `/api/live-sessions/{sessionId}` (for observers)

```typescript
// Returns session data observable by invited users (registered or not)
{
  id: string
  userId: string                    // Runner's ID
  runnerName: string               // Runner's display name
  currentLat: number | null
  currentLng: number | null
  distanceCovered: number           // km
  elapsedTime: number               // seconds
  currentPace: string | null        // "6:12/km"
  currentHeartRate: number | null   // bpm
  hasStarted: boolean
  startedAt: Date | null
  routeId: string | null
  gpsTrack: GpsPoint[]  // Full route polyline
}

// GpsPoint
{
  lat: number
  lng: number
  timestamp: number  // Unix ms
  altitude?: number
}
```

#### POST `/api/live-sessions/{sessionId}/invite-observer` (Enhanced)

**Request**:
```typescript
{
  runnerId: string,      // Required
  friendId?: string,     // Optional (for registered friends)
  email?: string,        // Optional (for non-registered users)
}
```

**Response**:
```typescript
{
  success: boolean,
  type: "registered" | "email",
  pushSent?: boolean,     // If registered user
  emailSent?: boolean,    // If non-registered
  invitationToken?: string,  // If email invite
}
```

#### GET `/api/observe/{token}` (NEW - public endpoint)

Used by non-registered users to access live session without auth.

**Response**:
```typescript
{
  sessionData: LiveSession,  // Same as above
  canObserve: boolean,
  message?: string
}
```

---

## API Endpoints (Complete)

### 1. Invite Observer (Enhanced)

**Endpoint**: `POST /api/live-sessions/{sessionId}/invite-observer`

**Middleware**: `authMiddleware` (runner must be authenticated)

**Logic**:
```
1. Validate session exists and belongs to runner
2. If friendId provided:
   a. Validate friendship exists
   b. Invite friend (update session observers)
   c. Send Firebase push notification
   d. Return { success: true, type: "registered", pushSent: true }
3. If email provided:
   a. Validate email format
   b. Check if user is registered
   c. If registered → treat as friendId flow
   d. If not registered → create invitation record with token
   e. Send email with deep link
   f. Return { success: true, type: "email", emailSent: true, invitationToken }
4. Error handling:
   - 404 if session not found
   - 403 if not runner
   - 400 if invalid input
   - 500 on email/push failure (still return success if one succeeds)
```

### 2. Get Live Session (Existing, No Changes)

**Endpoint**: `GET /api/live-sessions/{sessionId}`

**Validation**: 
- No auth required (public observers can view)
- Check if sessionId + token valid (if coming from email link)
- Return only observer-visible fields

**Response**: Full session data (see above)

### 3. Get Live Session by Token (NEW)

**Endpoint**: `GET /api/observe/{token}`

**Validation**:
- No auth required
- Validate token exists and not expired
- Check invitation status (sent, not viewed, not too old)

**Response**:
```typescript
{
  sessionData: LiveSession,
  isExpired: boolean,
  message?: string
}
```

---

## Implementation Details by Component

### Backend (Node.js/Express)

#### 1. Update `server/routes.ts` — Invite Observer Endpoint

**Change existing endpoint** `POST /api/live-sessions/:sessionId/invite-observer`:

- Keep existing logic for registered friends (friendId case)
- Add new branch for email invitations
- Call new `createObserverInvitation()` storage method
- Call new `sendObserverInvitationEmail()` notification method

**Add new endpoint** `GET /api/observe/:token`:

- No auth required
- Validate token exists and not expired
- Load live session data
- Mark invitation as viewed
- Return session data

**Code structure**:
```typescript
app.post("/api/live-sessions/:sessionId/invite-observer", 
  authMiddleware, 
  async (req, res) => {
    const { sessionId } = req.params;
    const { runnerId, friendId, email } = req.body;
    
    // Validate session
    const session = await storage.getLiveSession(sessionId);
    // ... existing validation ...
    
    if (friendId) {
      // Existing flow: registered friend
      // ... existing code ...
    } else if (email) {
      // NEW flow: non-registered user
      const trimmedEmail = email.toLowerCase().trim();
      
      // Check if email is registered
      const existingUser = await storage.getUserByEmail(trimmedEmail);
      if (existingUser) {
        // Treat as registered friend
        // ... invite friend logic ...
      } else {
        // Create email invitation
        const invitation = await storage.createObserverInvitation({
          sessionId,
          runnerId,
          email: trimmedEmail,
        });
        
        // Send email
        const emailSent = await notificationService.sendObserverInvitationEmail(
          trimmedEmail,
          runner.name,
          sessionId,
          invitation.token
        );
        
        return res.json({ 
          success: true, 
          type: "email", 
          emailSent,
          invitationToken: invitation.token 
        });
      }
    } else {
      return res.status(400).json({ error: "friendId or email required" });
    }
  }
);

app.get("/api/observe/:token", async (req, res) => {
  const { token } = req.params;
  
  const invitation = await storage.getObserverInvitation(token);
  if (!invitation) {
    return res.status(404).json({ error: "Invalid or expired link" });
  }
  
  if (invitation.expiresAt < new Date()) {
    return res.status(410).json({ 
      error: "Link expired", 
      isExpired: true,
      message: "This invite link has expired. Please ask the runner to send a new invite." 
    });
  }
  
  const sessionData = await storage.getLiveSession(invitation.sessionId);
  if (!sessionData) {
    return res.status(404).json({ error: "Run session not found" });
  }
  
  // Mark invitation as viewed
  await storage.updateObserverInvitation(invitation.id, { viewedAt: new Date() });
  
  res.json({ 
    sessionData, 
    isExpired: false 
  });
});
```

#### 2. Update `server/storage.ts` — New Methods

```typescript
// Create observer invitation for non-registered user
async createObserverInvitation(data: {
  sessionId: string;
  runnerId: string;
  email: string;
}): Promise<ObserverInvitation> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  const [invitation] = await db.insert(observerInvitations).values({
    ...data,
    token,
    expiresAt,
    status: 'sent',
    createdAt: new Date(),
  }).returning();
  
  return invitation;
}

// Get observer invitation by token
async getObserverInvitation(token: string): Promise<ObserverInvitation | undefined> {
  const [invitation] = await db.select()
    .from(observerInvitations)
    .where(eq(observerInvitations.token, token));
  return invitation || undefined;
}

// Update observer invitation
async updateObserverInvitation(
  id: string, 
  updates: Partial<ObserverInvitation>
): Promise<ObserverInvitation | undefined> {
  const [updated] = await db.update(observerInvitations)
    .set(updates)
    .where(eq(observerInvitations.id, id))
    .returning();
  return updated || undefined;
}

// Check if email is registered
async getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return user || undefined;
}
```

#### 3. Update `server/notification-service.ts` — Email Service

```typescript
/**
 * Send observer invitation email to non-registered user
 */
export async function sendObserverInvitationEmail(
  email: string,
  runnerName: string,
  sessionId: string,
  token: string
): Promise<boolean> {
  try {
    // Build observer link
    const observeUrl = `https://airuncoach.live/observe/${token}`;
    
    // Send via Resend, SendGrid, or other email service
    const emailService = await getEmailService();
    
    const htmlBody = `
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1f2937;">🏃 You're invited to watch a live run!</h2>
            
            <p>${runnerName} has invited you to watch their run in real-time.</p>
            
            <p style="font-size: 14px; color: #666;">
              See their live location, route, and metrics as they run.
            </p>
            
            <div style="margin: 30px 0;">
              <a href="${observeUrl}" 
                 style="background: #3b82f6; color: white; padding: 12px 24px; 
                        border-radius: 6px; text-decoration: none; display: inline-block;">
                Watch Live Run →
              </a>
            </div>
            
            <p style="font-size: 12px; color: #999;">
              This link will expire in 7 days. If you can't click the button above, 
              paste this link in your browser:<br/>
              <code>${observeUrl}</code>
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999;">
              AI Run Coach — Your personal running coach
            </p>
          </div>
        </body>
      </html>
    `;
    
    const textBody = `
${runnerName} has invited you to watch their run in real-time!

See their live location, route, and metrics as they run.

Watch Live Run:
${observeUrl}

This link will expire in 7 days.

---
AI Run Coach — Your personal running coach
    `;
    
    await emailService.send({
      from: "noreply@airuncoach.live",
      to: email,
      subject: `${runnerName} invited you to watch their run`,
      html: htmlBody,
      text: textBody,
    });
    
    console.log(`[Email] Observer invitation sent to ${email} for session ${sessionId}`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send observer invitation to ${email}:`, error);
    return false;
  }
}

// Helper to get configured email service
async function getEmailService(): Promise<any> {
  const provider = process.env.EMAIL_PROVIDER || 'resend';
  
  if (provider === 'resend') {
    const { Resend } = await import('resend');
    return new Resend(process.env.RESEND_API_KEY);
  } else if (provider === 'sendgrid') {
    const sgMail = await import('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return sgMail;
  } else {
    throw new Error(`Unknown email provider: ${provider}`);
  }
}
```

#### 4. Update `shared/schema.ts` — Add New Table

```typescript
// Add after liveRunSessions table definition

export const observerInvitations = pgTable("observer_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => liveRunSessions.id),
  runnerId: varchar("runner_id").notNull().references(() => users.id),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  status: text("status").default("sent"),  // 'sent' | 'viewed' | 'expired'
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  viewedAt: timestamp("viewed_at"),
  clickedAt: timestamp("clicked_at"),
});

export type ObserverInvitation = typeof observerInvitations.$inferSelect;
```

---

### Frontend (Web)

**File**: `client/src/pages/RunSession.tsx`

**Changes**:
1. Update share modal to support email input
2. Add "Add another person" UI
3. Show friend list with toggles (existing)
4. Show email input field for non-registered users
5. Validate email format
6. Send separate API request for email invites

**Code changes**:

```typescript
// In the share modal (around line 3501):

const [shareEmail, setShareEmail] = useState("");
const [showEmailInput, setShowEmailInput] = useState(false);

const handleShareWithFriend = async (friendId: string) => {
  try {
    await apiService.post(`/api/live-sessions/${sessionId}/invite-observer`, {
      runnerId: user.userId,
      friendId,
    });
    setSharedWith(prev => [...prev, friendId]);
    showToast("Invited " + friendName);
  } catch (error) {
    showToast("Failed to invite friend", "error");
  }
};

const handleShareWithEmail = async (email: string) => {
  if (!email.includes("@")) {
    showToast("Invalid email address", "error");
    return;
  }
  
  try {
    const response = await apiService.post(`/api/live-sessions/${sessionId}/invite-observer`, {
      runnerId: user.userId,
      email: email.toLowerCase(),
    });
    
    if (response.type === "registered") {
      // Treat as friend (already registered)
      setSharedWith(prev => [...prev, response.userId]);
    }
    
    setShareEmail("");
    setShowEmailInput(false);
    showToast(`Invite sent to ${email}`);
  } catch (error) {
    showToast("Failed to send invite", "error");
  }
};

// In JSX:
<Modal open={showShareModal} onClose={() => setShowShareModal(false)}>
  <div>
    <h3>Share This Run</h3>
    
    {/* Friend toggles */}
    <div>
      {friends.map(friend => (
        <div key={friend.id}>
          <Toggle
            checked={sharedWith.includes(friend.id)}
            onChange={() => handleShareWithFriend(friend.id)}
          />
          <span>{friend.name}</span>
        </div>
      ))}
    </div>
    
    {/* Add email option */}
    {!showEmailInput ? (
      <Button onClick={() => setShowEmailInput(true)}>
        + Add another person
      </Button>
    ) : (
      <div>
        <Input
          type="email"
          placeholder="Enter email address"
          value={shareEmail}
          onChange={(e) => setShareEmail(e.target.value)}
        />
        <Button onClick={() => handleShareWithEmail(shareEmail)}>
          Send Invite
        </Button>
        <Button variant="secondary" onClick={() => setShowEmailInput(false)}>
          Cancel
        </Button>
      </div>
    )}
  </div>
</Modal>
```

---

### Mobile (iOS & Android)

#### iOS Changes

**File**: `ios/AiRunCoach/Screens/ObserverRunSessionView.swift`

**Status**: Ready to implement (see brief: `iOS_LIVE_RUN_OBSERVER_BRIEF.md`)

**Key additions**:
1. Handle push notification with `type == "live_run_invite"`
2. Route to observer session screen
3. Show waiting screen initially
4. Auto-transition to live map when runner starts
5. Show "Run finished" screen when done

---

#### Android Changes

**File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ObserverRunSessionScreen.kt`

**Status**: ✅ Already implemented (complete)

**Features already present**:
- ✅ Waiting screen with spinner
- ✅ Live map with runner's location
- ✅ GPS track polyline
- ✅ Real-time metrics panel
- ✅ Exit button
- ✅ Error handling

**No changes needed** (Android is ready)

---

### Web Public Page (Non-Registered Observer)

**New file**: `client/src/pages/ObserveSession.tsx`

**Purpose**: Public page for non-registered users to watch live runs

**Route**: `/observe/:token`

**Structure**:

```typescript
export const ObserveSession = () => {
  const { token } = useParams();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    // Fetch session by token
    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/observe/${token}`);
        if (!response.ok) {
          const data = await response.json();
          setError(data.message || "Invalid or expired link");
          return;
        }
        const data = await response.json();
        setSession(data.sessionData);
        setHasStarted(data.sessionData.hasStarted);
      } catch (err) {
        setError("Failed to load session");
      } finally {
        setLoading(false);
      }
    };
    
    fetchSession();
    
    // Poll for updates every 2-3 seconds if running
    let interval: NodeJS.Timeout;
    if (hasStarted) {
      interval = setInterval(fetchSession, 2000);
    }
    
    return () => clearInterval(interval);
  }, [token, hasStarted]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!session) return <div>Session not found</div>;

  return (
    <div>
      {!hasStarted ? (
        <WaitingScreen runnerName={session.runnerName} />
      ) : (
        <LiveMapScreen 
          session={session}
          onFinish={() => <FinishedScreen runnerName={session.runnerName} />}
        />
      )}
    </div>
  );
};

const FinishedScreen = ({ runnerName }: { runnerName: string }) => (
  <div style={{ textAlign: 'center', padding: '40px' }}>
    <h2>✅ Run finished</h2>
    <p>You can close this tab now.</p>
    <p style={{ fontSize: '14px', color: '#666', marginTop: '20px' }}>
      Interested in getting your own personal running coach?<br/>
      <a href="/">Create an AI Run Coach account</a>
    </p>
  </div>
);
```

---

## Database Migration

Create new migration file: `migrations/add_observer_invitations.sql`

```sql
-- Create observer_invitations table for non-registered user invites
CREATE TABLE observer_invitations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(36) NOT NULL REFERENCES live_run_sessions(id) ON DELETE CASCADE,
  runner_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  status TEXT DEFAULT 'sent',  -- 'sent', 'viewed', 'expired'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  viewed_at TIMESTAMP,
  clicked_at TIMESTAMP
);

-- Index for token lookups
CREATE INDEX idx_observer_invitations_token ON observer_invitations(token);
CREATE INDEX idx_observer_invitations_email ON observer_invitations(email);
CREATE INDEX idx_observer_invitations_session ON observer_invitations(session_id);

-- Add publicObserverTokens column (if using JSON approach)
-- ALTER TABLE live_run_sessions ADD COLUMN public_observer_tokens JSONB;
```

---

## Testing Checklist

### Backend (Server)

- [ ] Endpoint `POST /api/live-sessions/{sessionId}/invite-observer` with friendId works
- [ ] Endpoint `POST /api/live-sessions/{sessionId}/invite-observer` with email works
- [ ] Email sent successfully to non-registered user
- [ ] Email contains correct link with token
- [ ] Endpoint `GET /api/observe/{token}` returns session data
- [ ] Invalid token returns 404
- [ ] Expired token returns 410 with `isExpired: true`
- [ ] Invitation marked as viewed after accessing
- [ ] Database records created correctly

### Frontend (Web - Runner)

- [ ] Share modal opens
- [ ] Friend list displays correctly
- [ ] Friend toggles send API request with friendId
- [ ] "Add another person" button shows email input
- [ ] Email input validates format
- [ ] Send invite button sends API request with email
- [ ] Toast messages show correct feedback
- [ ] Duplicate invites handled gracefully

### Web - Non-Registered Observer

- [ ] Open `/observe/{token}` in browser
- [ ] Loading spinner shows
- [ ] Waiting screen displays if runner hasn't started
- [ ] Live map displays if runner has started
- [ ] Metrics update every 2 seconds
- [ ] "Run finished" screen shows when runner completes
- [ ] Close button/tab works
- [ ] Invalid token shows error message
- [ ] Expired token shows appropriate message

### iOS (Registered Observer)

- [ ] Push notification received with `live_run_invite` type
- [ ] Notification tap routes to observer session screen
- [ ] Waiting screen shows with correct runner name
- [ ] Live map transitions automatically when runner starts
- [ ] Metrics update in real-time
- [ ] Back button exits observer session
- [ ] "Run finished" screen shows with "Go Back to Dashboard" button

### Android (Registered Observer)

- [ ] ✅ All tests should pass (implementation complete)

---

## Summary of Changes

### New Files
- `migrations/add_observer_invitations.sql` — Database migration
- `client/src/pages/ObserveSession.tsx` — Public observer page
- `server/email-service.ts` — Email delivery service

### Modified Files
- `server/routes.ts` — Add email invite branch + public observe endpoint
- `server/storage.ts` — Add invitation creation/retrieval methods
- `shared/schema.ts` — Add observerInvitations table
- `server/notification-service.ts` — Add email sending function
- `client/src/pages/RunSession.tsx` — Add email input UI

### Existing (No Changes Needed)
- ✅ `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ObserverRunSessionScreen.kt`
- ✅ `app/src/main/java/live/airuncoach/airuncoach/viewmodel/ObserverRunSessionViewModel.kt`
- ✅ Android deep-link routing (already implemented)
- ✅ Push notification service (already implemented)

---

## Environment Variables

Add to `.env`:

```bash
# Email service (choose one)
EMAIL_PROVIDER=resend           # or 'sendgrid'
RESEND_API_KEY=re_xxxxx...
# OR
SENDGRID_API_KEY=SG_xxxxx...

# Observation link base
OBSERVER_LINK_BASE=https://airuncoach.live/observe
```

---

## References

- Analysis document: `LIVE_RUN_SHARE_PUSH_NOTIFICATION_ANALYSIS.md`
- iOS brief: `iOS_LIVE_RUN_OBSERVER_BRIEF.md`
- Current Android screen: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ObserverRunSessionScreen.kt`
- Current ViewModel: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/ObserverRunSessionViewModel.kt`

---

## Implementation Priority

1. **Phase 1** (Backend Foundation)
   - Create `observerInvitations` table
   - Add storage methods
   - Update `/api/live-sessions/:sessionId/invite-observer` endpoint
   - Add `/api/observe/:token` endpoint

2. **Phase 2** (Email Notifications)
   - Configure email service (Resend or SendGrid)
   - Implement `sendObserverInvitationEmail()`
   - Test email delivery

3. **Phase 3** (Web UI)
   - Update `RunSession.tsx` — add email input
   - Create `ObserveSession.tsx` — public observer page
   - Test observer flows (waiting → active → finished)

4. **Phase 4** (Polish & Testing)
   - Cross-platform testing
   - Token expiration handling
   - Error recovery flows
   - Security audit (no unauthorized access)

---

## Notes

- **Email tokens** expire after 7 days to prevent stale invites
- **Non-registered observers** don't need an account to watch
- **Registered observers** get push notifications and full app experience
- **Runner privacy** — observers can only view sessions they're explicitly invited to
- **Performance** — Polling every 2 seconds is sufficient; consider WebSocket upgrade for production scale
