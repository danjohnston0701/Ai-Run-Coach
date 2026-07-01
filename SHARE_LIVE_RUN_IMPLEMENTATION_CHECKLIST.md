# Share Live Run Session — Implementation Checklist

---

## Phase 1: Database & Backend Foundation

### Database Schema
- [ ] Create migration file: `migrations/add_observer_invitations.sql`
- [ ] Run migration to create `observer_invitations` table with fields:
  - [ ] `id` (primary key, UUID)
  - [ ] `sessionId` (FK to liveRunSessions)
  - [ ] `runnerId` (FK to users)
  - [ ] `email` (varchar)
  - [ ] `token` (varchar, unique)
  - [ ] `status` (varchar: sent/viewed/expired)
  - [ ] `createdAt` (timestamp)
  - [ ] `expiresAt` (timestamp, +7 days)
  - [ ] `viewedAt` (timestamp, nullable)
  - [ ] `clickedAt` (timestamp, nullable)
- [ ] Create indexes:
  - [ ] `idx_observer_invitations_token`
  - [ ] `idx_observer_invitations_email`
  - [ ] `idx_observer_invitations_session`
- [ ] Verify existing `liveRunSessions.observers` JSONB field exists

### TypeScript Schema
- [ ] Update `shared/schema.ts`:
  - [ ] Add `observerInvitations` table definition
  - [ ] Export `ObserverInvitation` type
  - [ ] Verify `liveRunSessions` schema unchanged

### Storage Methods
- [ ] Update `server/storage.ts`:
  - [ ] Add `createObserverInvitation(data)` method
    - [ ] Generate random 64-char token
    - [ ] Set expiry to 7 days from now
    - [ ] Insert into DB and return invitation
  - [ ] Add `getObserverInvitation(token)` method
    - [ ] Query by token (case-sensitive)
    - [ ] Return invitation or undefined
  - [ ] Add `updateObserverInvitation(id, updates)` method
    - [ ] Update specific fields
    - [ ] Return updated record
  - [ ] Add `getUserByEmail(email)` method
    - [ ] Query users table (case-insensitive)
    - [ ] Return user or undefined

---

## Phase 2: Email Service

### Email Provider Setup
- [ ] Choose email provider:
  - [ ] Resend (recommended, easiest)
  - [ ] SendGrid
  - [ ] Other (Mailgun, AWS SES, etc.)
- [ ] Set up account and API key
- [ ] Add environment variables:
  - [ ] `EMAIL_PROVIDER=resend` (or chosen provider)
  - [ ] `RESEND_API_KEY=re_xxxxx...`
  - [ ] (or equivalent for your provider)
- [ ] Test API key with simple request

### Email Service Function
- [ ] Update `server/notification-service.ts`:
  - [ ] Add `sendObserverInvitationEmail(email, runnerName, sessionId, token)` function
    - [ ] Build HTML email body (see brief for template)
    - [ ] Build plain text version (fallback)
    - [ ] Call email service with:
      - [ ] From: `noreply@airuncoach.live`
      - [ ] To: recipient email
      - [ ] Subject: `{runnerName} invited you to watch their run`
      - [ ] HTML and text bodies
    - [ ] Log result (success/failure)
    - [ ] Return boolean (success/failure)
  - [ ] Add `getEmailService()` helper
    - [ ] Initialize provider based on env var
    - [ ] Handle missing credentials gracefully

### Email Template
- [ ] Verify HTML email template includes:
  - [ ] Friendly greeting
  - [ ] Runner name in message
  - [ ] Call-to-action button: "Watch Live Run"
  - [ ] Full URL in button link: `https://airuncoach.live/observe/{token}`
  - [ ] Fallback text with full URL
  - [ ] Expiry notice (7 days)
  - [ ] Footer with app branding

---

## Phase 3: API Endpoints

### Enhanced Invite Observer Endpoint
**File**: `server/routes.ts`

**Endpoint**: `POST /api/live-sessions/:sessionId/invite-observer`

- [ ] Keep existing code for `friendId` flow
- [ ] Add new branch for `email` parameter:
  - [ ] Validate email format (basic check)
  - [ ] Lowercase and trim email
  - [ ] Check if user exists with `getUserByEmail()`
  - [ ] If user exists:
    - [ ] Treat as registered friend
    - [ ] Invite as friend (existing flow)
  - [ ] If user doesn't exist:
    - [ ] Create invitation: `storage.createObserverInvitation()`
    - [ ] Send email: `notification.sendObserverInvitationEmail()`
    - [ ] Return: `{ success: true, type: "email", emailSent: true }`
- [ ] Update request body validation:
  - [ ] Require either `friendId` OR `email`
  - [ ] Return 400 if neither provided
- [ ] Update response to include type field
- [ ] Error handling:
  - [ ] 400 Bad Request — invalid input
  - [ ] 403 Forbidden — not runner, not friend
  - [ ] 404 Not Found — session not found
  - [ ] 500 Internal Error — email/push failure (still return partial success)
- [ ] Logging:
  - [ ] Log email invitations with email address
  - [ ] Log success/failure of email sending

### Public Observer Endpoint
**Endpoint**: `GET /api/observe/:token`

- [ ] Create endpoint (no auth required):
  - [ ] Validate token exists: `storage.getObserverInvitation(token)`
  - [ ] Check token not expired:
    - [ ] If expired → 410 Gone: `{ error: "Link expired", isExpired: true }`
  - [ ] Load session: `storage.getLiveSession(invitation.sessionId)`
  - [ ] Check session exists:
    - [ ] If not → 404 Not Found
  - [ ] Mark invitation viewed: `updateObserverInvitation(id, { viewedAt: new Date() })`
  - [ ] Return session data (filtered for observer):
    ```json
    {
      "sessionData": {
        "id": "...",
        "userId": "...",
        "runnerName": "...",
        "currentLat": null,
        "currentLng": null,
        "distanceCovered": 0,
        "elapsedTime": 0,
        "currentPace": null,
        "currentHeartRate": null,
        "hasStarted": false,
        "startedAt": null,
        "routeId": null,
        "gpsTrack": []
      },
      "isExpired": false
    }
    ```
- [ ] Logging:
  - [ ] Log access with token (not full token for privacy)
  - [ ] Log invitation viewed event

---

## Phase 4: Web Frontend Updates

### Update Run Session Share UI
**File**: `client/src/pages/RunSession.tsx`

- [ ] Find share modal section (around line 3501)
- [ ] Add state for email input:
  - [ ] `const [shareEmail, setShareEmail] = useState("")`
  - [ ] `const [showEmailInput, setShowEmailInput] = useState(false)`
- [ ] Add function `handleShareWithEmail(email)`:
  - [ ] Validate email format (contains @)
  - [ ] Lowercase email
  - [ ] POST to `/api/live-sessions/{sessionId}/invite-observer`
  - [ ] Payload: `{ runnerId: user.userId, email }`
  - [ ] On success:
    - [ ] Clear email input
    - [ ] Close email input UI
    - [ ] Show toast: `Invite sent to {email}`
  - [ ] On error:
    - [ ] Show error toast
    - [ ] Keep modal open
- [ ] Update modal UI:
  - [ ] After friends list, add "Add another person" button
  - [ ] When button clicked, show email input field
  - [ ] Email input:
    - [ ] Type: "email"
    - [ ] Placeholder: "Enter email address"
    - [ ] Value bound to `shareEmail` state
  - [ ] Send button next to email input
  - [ ] Cancel button to hide email input

### Create Public Observer Page
**File**: `client/src/pages/ObserveSession.tsx` (NEW)

- [ ] Create component `ObserveSession`:
  - [ ] Extract token from URL params: `useParams().token`
  - [ ] Setup state:
    - [ ] `session: LiveSession | null`
    - [ ] `loading: boolean`
    - [ ] `error: string | null`
    - [ ] `hasStarted: boolean`
  - [ ] On mount:
    - [ ] Call `GET /api/observe/{token}`
    - [ ] On success: store session data, set hasStarted
    - [ ] On error (404): show "Invalid link"
    - [ ] On error (410): show "Link expired"
- [ ] Polling logic:
  - [ ] If `hasStarted === false`: poll every 3 seconds
  - [ ] If `hasStarted === true`: poll every 2 seconds
  - [ ] Stop polling when component unmounts
  - [ ] Auto-transition UI when hasStarted changes
- [ ] Render states:
  - [ ] Loading: "Loading run session..."
  - [ ] Error: error message + optional "Back" link
  - [ ] Not started: `WaitingForRunnerComponent`
  - [ ] Active: `LiveRunMapComponent`
  - [ ] Finished: `RunFinishedComponent`

### Waiting Screen Component
**File**: `client/src/pages/ObserveSession.tsx`

- [ ] Create component `WaitingForRunnerComponent`:
  - [ ] Show spinner (center of screen)
  - [ ] Text: "Waiting for {runnerName} to start the run session"
  - [ ] Smaller text: "You'll see their live location and metrics once they begin"
  - [ ] No action buttons (can use browser back)

### Live Map Component
**File**: `client/src/pages/ObserveSession.tsx`

- [ ] Create component `LiveRunMapComponent(session)`:
  - [ ] Map library: Google Maps, Mapbox, or Leaflet
  - [ ] Map container: 70% of screen height
  - [ ] Map features:
    - [ ] Center on `session.currentLat`, `session.currentLng`
    - [ ] Zoom level: 17
    - [ ] Marker at runner's location (red pin)
    - [ ] Polyline for `session.gpsTrack` (blue line)
  - [ ] Metrics panel: 30% of screen
    - [ ] Distance: `${(session.distanceCovered).toFixed(2)} km`
    - [ ] Time: `formatTime(session.elapsedTime)` (MM:SS or H:MM:SS)
    - [ ] Pace: `session.currentPace || "--:--"`
    - [ ] Heart Rate (if available): `${session.currentHeartRate} bpm`
  - [ ] No action buttons

### Finished Screen Component
**File**: `client/src/pages/ObserveSession.tsx`

- [ ] Create component `RunFinishedComponent(runnerName)`:
  - [ ] Centered content
  - [ ] Emoji: ✅
  - [ ] Text: "Run finished. You can close this tab now."
  - [ ] Optional: "Create account to track your own runs" link
  - [ ] No action buttons

### Route Registration
- [ ] Add to router (if using React Router):
  - [ ] Route: `/observe/:token`
  - [ ] Component: `ObserveSession`

---

## Phase 5: Testing

### Backend Testing

#### Unit Tests
- [ ] `createObserverInvitation()`:
  - [ ] Creates record with unique token
  - [ ] Sets expiry to 7 days from now
  - [ ] Returns invitation object
- [ ] `getObserverInvitation(token)`:
  - [ ] Finds invitation by token
  - [ ] Returns undefined for invalid token
- [ ] `getUserByEmail(email)`:
  - [ ] Finds user (case-insensitive)
  - [ ] Returns undefined if not found

#### Integration Tests
- [ ] **POST `/api/live-sessions/:id/invite-observer`**:
  - [ ] With `friendId` (registered):
    - [ ] ✅ Invites friend
    - [ ] ✅ Sends push notification
    - [ ] ✅ Returns `{ success, type: "registered", pushSent: true }`
  - [ ] With `email` (not registered):
    - [ ] ✅ Creates invitation record
    - [ ] ✅ Sends email
    - [ ] ✅ Returns `{ success, type: "email", emailSent: true }`
  - [ ] With `email` (registered user):
    - [ ] ✅ Treats as friend invite
    - [ ] ✅ Sends push notification
  - [ ] Error cases:
    - [ ] ❌ No session → 404
    - [ ] ❌ Not runner → 403
    - [ ] ❌ Not friends → 403
    - [ ] ❌ Invalid email format → 400
    - [ ] ❌ Missing friendId and email → 400

- [ ] **GET `/api/observe/:token`**:
  - [ ] Valid token:
    - [ ] ✅ Returns session data
    - [ ] ✅ Marks invitation as viewed
  - [ ] Invalid token:
    - [ ] ❌ Returns 404
  - [ ] Expired token:
    - [ ] ❌ Returns 410 with `{ isExpired: true }`

#### Email Delivery
- [ ] Email received in test inbox
- [ ] Subject line correct: "{runnerName} invited you..."
- [ ] Link in email functional: `/observe/{token}`
- [ ] Fallback text link provided
- [ ] Expiry notice included (7 days)
- [ ] App branding in footer

### Frontend Testing

#### Web - Runner Share UI
- [ ] Share modal opens
- [ ] Friend list displays
- [ ] Friend toggle sends API request
- [ ] Toast shows on invite success
- [ ] "Add another person" button visible
- [ ] Email input appears when clicked
- [ ] Email validation works (shows error for invalid)
- [ ] Send invite button works
- [ ] Toast shows success/error
- [ ] Modal closes on success

#### Web - Non-Registered Observer
- [ ] Navigate to `/observe/{validToken}`:
  - [ ] ✅ Loading spinner shows
  - [ ] ✅ Page loads after 2-3 seconds
  - [ ] ✅ Waiting screen shows (if run not started)
  - [ ] ✅ Auto-transitions to map when runner starts
- [ ] Navigate to `/observe/{invalidToken}`:
  - [ ] ❌ Error message shows: "Invalid or expired link"
- [ ] Navigate to `/observe/{expiredToken}`:
  - [ ] ❌ Error message shows: "This link has expired"
- [ ] Waiting screen:
  - [ ] ✅ Spinner visible
  - [ ] ✅ Text shows runner name
  - [ ] ✅ Metrics update every 3 seconds
  - [ ] ✅ Map auto-loads when hasStarted becomes true
- [ ] Live map screen:
  - [ ] ✅ Map loads centered on runner
  - [ ] ✅ Blue polyline shows route
  - [ ] ✅ Red marker at current position
  - [ ] ✅ Metrics panel shows: distance, time, pace, HR
  - [ ] ✅ Metrics update every 2 seconds
  - [ ] ✅ Map pans smoothly to new position
- [ ] Run finished screen:
  - [ ] ✅ "Run finished" message
  - [ ] ✅ "You can close this tab now"
  - [ ] ✅ No action buttons

### Mobile Testing

#### Android Push Notification
- [ ] Send push with `type: "live_run_invite"`
- [ ] Device receives notification
- [ ] Tap notification → opens observer session screen
- [ ] Deep link correct: `observer_session/{sessionId}`
- [ ] No notification if app uninstalled

#### Android Observer Screen
- [ ] ✅ Already implemented, test existing screen

#### iOS Push Notification
- [ ] Send push with `type: "live_run_invite"`
- [ ] Device receives notification
- [ ] Tap notification → opens observer session screen
- [ ] Deep link routes correctly

#### iOS Observer Screen
- [ ] Waiting screen shows
- [ ] Live map loads and updates
- [ ] Metrics real-time update
- [ ] Run finished screen shows
- [ ] Back button works

---

## Phase 6: Deployment

### Environment Setup
- [ ] Add to production `.env`:
  - [ ] `EMAIL_PROVIDER=resend`
  - [ ] `RESEND_API_KEY=...`
  - [ ] `OBSERVER_LINK_BASE=https://airuncoach.live/observe`
- [ ] Verify database migrations applied
- [ ] Verify email service credentials working

### Migration Execution
- [ ] Run migration on production database:
  ```bash
  npm run migrate:deploy
  ```
- [ ] Verify table created:
  ```sql
  SELECT * FROM observer_invitations LIMIT 1;
  ```
- [ ] Verify indexes created

### Deployment Steps
- [ ] Merge to main branch
- [ ] Build backend: `npm run build`
- [ ] Build frontend: `npm run build:web`
- [ ] Deploy backend to production
- [ ] Deploy frontend to CDN/static hosting
- [ ] Verify endpoints responding:
  - [ ] `POST /api/live-sessions/{id}/invite-observer`
  - [ ] `GET /api/observe/{token}`
  - [ ] Public page at `/observe/test-token-123...`

### Post-Deployment Verification
- [ ] Invite registered friend → push arrives
- [ ] Invite non-registered email → email arrives
- [ ] Click email link → observer page loads
- [ ] Waiting → active transition works
- [ ] Metrics update in real-time
- [ ] Run finished screen shows correctly

---

## Phase 7: Monitoring & Maintenance

### Logging
- [ ] Monitor logs for email send failures
- [ ] Monitor logs for token validation failures
- [ ] Monitor logs for poll frequency (check for outliers)

### Database Maintenance
- [ ] Set up job to expire old invitations (> 7 days)
- [ ] Set up job to clean up viewed invitations (> 30 days)
- [ ] Monitor observer_invitations table size

### Performance Monitoring
- [ ] Monitor poll request latency
- [ ] Monitor email send latency
- [ ] Monitor token lookup time

### Analytics
- [ ] Track invitations sent (registered vs email)
- [ ] Track email open rate (viewedAt tracking)
- [ ] Track observer session duration
- [ ] Track email click-through rate

---

## Phase 8: Future Enhancements

### V2 Features
- [ ] WebSocket instead of polling for real-time updates
- [ ] Observer can comment during live run
- [ ] Runner sees observer count in real-time
- [ ] Scheduled/recurring group runs
- [ ] Observer can share session with others
- [ ] Email link shows preview: runner photo, distance, pace
- [ ] SMS notifications as alternative to email
- [ ] QR code to share session (scanned link)

---

## Quick Reference

### Key URLs
```
Production observer link:
https://airuncoach.live/observe/{token}

Example token (format):
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f
```

### Key API Endpoints
```
POST /api/live-sessions/{sessionId}/invite-observer
  Request: { runnerId, friendId? OR email? }
  Response: { success, type, pushSent?, emailSent? }

GET /api/observe/{token}
  Response: { sessionData, isExpired }
```

### Key Database Tables
```
observer_invitations
  - id: UUID
  - sessionId: FK
  - runnerId: FK
  - email: String
  - token: String (unique, 64-char hex)
  - status: 'sent' | 'viewed' | 'expired'
  - expiresAt: Timestamp (+7 days)

live_run_sessions (updated)
  - observers: JSONB (already exists)
```

### Environment Variables
```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxx...
OBSERVER_LINK_BASE=https://airuncoach.live/observe
```

---

## Sign-Off Checklist

- [ ] All database migrations applied
- [ ] All API endpoints tested and working
- [ ] Email delivery tested and verified
- [ ] Web UI (runner + observer) tested
- [ ] Mobile notifications tested
- [ ] Mobile observer screens tested
- [ ] Cross-platform compatibility verified
- [ ] Error handling verified
- [ ] Logging working
- [ ] Documentation updated
- [ ] Deployment verified
- [ ] Post-deployment testing passed
- [ ] Monitoring set up
- [ ] Ready for production ✅
