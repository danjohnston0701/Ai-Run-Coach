# Share Live Run Session — Executive Summary

**Date**: July 1, 2026  
**Status**: Comprehensive Review Complete & Enhanced Requirements Documented  
**Scope**: Complete implementation guide for inviting observers to live run sessions

---

## Current Implementation Status

### ✅ What's Already Built
1. **Web client sharing interface** — Friends list with toggles
2. **Database schema** — LiveRunSession with observers array
3. **API endpoint** — `POST /api/live-sessions/:sessionId/invite-observer` (partial)
4. **Push notification service** — Firebase/FCM infrastructure
5. **Android observer screen** — Complete UI with waiting & live states
6. **Android deep-linking** — Routes notifications to observer screen

### ❌ What's Missing
1. **Email invitations** — Support for non-registered users
2. **Observer-only web page** — `/observe/{token}` public URL
3. **Email notification service** — Function to send invitation emails
4. **Token-based access** — Public observer session retrieval
5. **iOS observer push handling** — Handle `live_run_invite` notifications
6. **iOS observer UI** — See iOS_LIVE_RUN_OBSERVER_BRIEF.md

---

## The Enhancement: Email Invites for Non-Registered Users

### Current Flow (Registered Friends Only)
```
Runner → Selects friend from list → Friend gets push → Taps to observe
```

### Enhanced Flow (Registered + Non-Registered)
```
Runner → Selects friend OR enters email → 
  If registered: Friend gets push
  If not registered: Non-registered user gets email with link
  Both: Can watch live run in real-time
```

---

## Key User Stories

### Story 1: Invite Registered Friend
**Actor**: Runner (Tom)  
**Goal**: Share live run with friend (Alice)

1. Tom starts running with web client open
2. Tom clicks "Share" button
3. Tom sees list of friends with toggles
4. Tom toggles "Alice" ON
5. Alice's phone receives push: "Tom invited you to watch their run"
6. Alice taps notification → observer screen opens
7. Alice sees waiting screen (if Tom hasn't started yet)
8. Alice auto-transitions to live map when Tom starts running
9. Alice sees real-time metrics: distance, time, pace, heart rate
10. When Tom finishes, Alice sees completion screen with "Go Back to Dashboard" button

**Result**: ✅ Friend watches live run in real-time from mobile app

---

### Story 2: Invite Non-Registered User
**Actor**: Runner (Tom)  
**Goal**: Invite someone to watch who isn't in the app (friend, family, etc.)

1. Tom starts running with web client open
2. Tom clicks "Share" button
3. Tom scrolls past friends list
4. Tom clicks "Add another person"
5. Email input field appears
6. Tom enters: "jane@example.com"
7. Tom clicks "Send Invite"
8. System sends email to Jane:
   - Subject: "Tom invited you to watch their run"
   - Link: "Watch Live Run" button
   - Full URL in email body
9. Jane receives email, clicks link: `https://airuncoach.live/observe/{token}`
10. Jane's browser opens web page (no app required)
11. Jane sees waiting screen
12. Jane auto-transitions to live map when Tom starts
13. Jane sees live location on map + metrics updating
14. When Tom finishes, Jane sees: "✅ Run finished. You can close this tab now."

**Result**: ✅ Non-registered user watches live run from web browser

---

## Technical Implementation Overview

### 1. Database
- **New table**: `observer_invitations`
  - Stores email + token + expiry for non-registered users
  - Tokens expire after 7 days
  - Tracks viewed/clicked events

### 2. Backend API
- **Enhanced endpoint**: `POST /api/live-sessions/{sessionId}/invite-observer`
  - Accepts `friendId` (existing) OR `email` (new)
  - Routes to appropriate flow
  - Sends push or email accordingly

- **New endpoint**: `GET /api/observe/{token}` (public)
  - No authentication required
  - Validates token + expiry
  - Returns live session data
  - Marks invitation viewed

### 3. Email Service
- **New function**: `sendObserverInvitationEmail()`
  - Sends HTML + text email
  - Includes observation link
  - Friendly message with runner name
  - Expiry notice

### 4. Web Frontend
- **Enhanced RunSession.tsx**
  - Email input UI in share modal
  - "Add another person" option
  - Email validation

- **New page**: `ObserveSession.tsx`
  - Public observer interface
  - Works in any browser (no app needed)
  - Waiting state (if run not started)
  - Live map + metrics (when running)
  - Finished state (with close message)

### 5. Mobile (No Changes Needed!)
- **Android**: ✅ Already complete
  - Observer screen ready to use
  - Just needs push notification handling
  
- **iOS**: 📋 Ready for implementation
  - See iOS_LIVE_RUN_OBSERVER_BRIEF.md
  - Needs push notification handler
  - Needs observer UI screens

---

## User Experience Flows

### Registered User Experience
```
Runner sends invite
       ↓
Friend receives push notification
       ↓
Taps notification → App opens to observer screen
       ↓
Waits for runner to start (spinner)
       ↓
Runner starts → auto-transition to live map
       ↓
Watch real-time: location, metrics, route
       ↓
Runner finishes → see completion screen
       ↓
"Go Back to Dashboard" button
```

### Non-Registered User Experience
```
Runner sends email invite
       ↓
Non-registered user receives email
       ↓
Clicks link → Web browser opens
       ↓
Waits for runner to start (spinner)
       ↓
Runner starts → auto-transition to live map
       ↓
Watch real-time: location, metrics, route
       ↓
Runner finishes → see completion screen
       ↓
"You can close this tab now"
```

---

## Data Flow Architecture

### Registered User (Existing + Enhanced)
```
Web Client → API (friend invite) → Push Service → Firebase → Mobile App
                ↓
            Database: live_run_sessions.observers []
                ↓
         GET /api/live-sessions/{id}
                ↓
            Observer Screen (polling 2-3s)
```

### Non-Registered User (New)
```
Web Client → API (email invite) → Email Service (Resend/SendGrid) → Email
                ↓
         Database: observer_invitations
                ↓
        Email link: /observe/{token}
                ↓
        GET /api/observe/{token} (public)
                ↓
        Browser: ObserveSession.tsx (polling 2-3s)
```

---

## Files to Modify/Create

### Backend
| File | Change | Priority |
|------|--------|----------|
| `server/routes.ts` | Add email branch + public endpoint | 🔴 Critical |
| `server/storage.ts` | Add invitation methods | 🔴 Critical |
| `shared/schema.ts` | Add observerInvitations table | 🔴 Critical |
| `server/notification-service.ts` | Add email sending | 🔴 Critical |
| `migrations/` | Add DB migration | 🔴 Critical |

### Frontend
| File | Change | Priority |
|------|--------|----------|
| `client/src/pages/RunSession.tsx` | Add email input UI | 🟠 High |
| `client/src/pages/ObserveSession.tsx` | Create observer page | 🔴 Critical |

### Mobile
| File | Change | Priority |
|------|--------|----------|
| Android Screens | ✅ No changes needed | ✅ Complete |
| iOS Screens | See iOS brief | 📋 Pending |

---

## Implementation Timeline

### Week 1: Backend Foundation
- [ ] Database migration
- [ ] Storage methods
- [ ] API endpoints (both)
- [ ] Email service
- [ ] Testing

### Week 2: Frontend
- [ ] Web UI (runner share modal)
- [ ] Observer page (web)
- [ ] Testing
- [ ] Deployment

### Week 3: Mobile (iOS)
- [ ] Push notification handler
- [ ] Observer UI screens
- [ ] Testing
- [ ] Deployment

**Total**: ~3 weeks for complete implementation

---

## Testing Strategy

### Unit Tests
- Token generation (unique, 64-char)
- Email validation
- Expiry calculation (7 days)
- Invitation lookup

### Integration Tests
- API endpoints (both flows)
- Email delivery
- Token validation
- Database operations

### End-to-End Tests
- **Happy path**: Invite → Notification/Email → Observe → Complete
- **Error cases**: Invalid token, expired link, network errors
- **Edge cases**: Duplicate invites, email already registered

### Manual Testing
- Web: Share modal, email input, validation
- Web: Observer page (waiting, active, finished states)
- Email: Delivery, link validity, HTML rendering
- Mobile: Push notification, deep linking

---

## Security Considerations

✅ **Access Control**
- Tokens are cryptographically random (64-char hex)
- Tokens validated on every request
- Only invited observers can see session

✅ **Privacy**
- Email invitations don't create accounts
- Non-registered users can't see other runners
- Sessions not visible after token expires

✅ **Token Expiry**
- Tokens expire after 7 days
- Old invites can't be replayed
- Viewer can request new invite from runner

✅ **Rate Limiting** (Recommended)
- Max 10 email invites per session
- Max 1 email per minute per address
- Prevents spam/abuse

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| **Waiting state poll** | 3 seconds |
| **Active state poll** | 2 seconds |
| **Email send latency** | < 1 second |
| **Token lookup latency** | < 100ms |
| **Map update debounce** | 10 meters |
| **Token expiry** | 7 days |

---

## Success Criteria

✅ Implementation is complete when:

1. **Registered friends**
   - Can be invited via UI
   - Receive push notification
   - Can observe live run
   - See "Run finished" → "Go Back to Dashboard"

2. **Non-registered users**
   - Can be invited via email
   - Receive email with link
   - Link works without authentication
   - Can observe live run
   - See "Run finished" → "You can close this tab"

3. **Observer experience**
   - Waiting screen if run not started
   - Auto-transition to map when run starts
   - Real-time metrics (every 2 seconds)
   - Smooth map panning
   - GPS track visible (if available)

4. **Quality**
   - No errors or crashes
   - Graceful error handling
   - Proper logging
   - Security verified

---

## Documentation Provided

This review includes comprehensive documentation:

1. **SHARE_LIVE_RUN_SESSION_COMPLETE_BRIEF.md**
   - Full implementation details
   - API contracts
   - Code examples
   - Database schema

2. **SHARE_LIVE_RUN_FLOW_DIAGRAMS.md**
   - User flow diagrams
   - API communication flows
   - Database relationships
   - State transitions

3. **SHARE_LIVE_RUN_IMPLEMENTATION_CHECKLIST.md**
   - Phase-by-phase checklist
   - Testing checklist
   - Deployment steps
   - Post-deployment verification

4. **iOS_LIVE_RUN_OBSERVER_BRIEF.md** (Already exists)
   - iOS implementation guide
   - UI specifications
   - ViewModel details
   - Integration checklist

5. **LIVE_RUN_SHARE_PUSH_NOTIFICATION_ANALYSIS.md** (Already exists)
   - Analysis of current implementation
   - Gap identification
   - Roadmap (updated by this review)

---

## Next Steps

### 1. Review & Feedback
- Review this brief with team
- Identify any gaps or changes
- Adjust timeline based on resources

### 2. Start Phase 1 (Backend)
- Create database migration
- Implement storage methods
- Update API endpoints
- Set up email service

### 3. Start Phase 2 (Frontend Web)
- Update RunSession.tsx
- Create ObserveSession.tsx
- Manual testing

### 4. Mobile Implementation
- iOS push notification handler
- iOS observer UI screens
- Cross-platform testing

### 5. Deployment
- Run migrations
- Deploy backend + frontend
- Post-deployment verification
- Monitor logs and errors

---

## Questions & Discussion Points

1. **Email Provider**: Which service? (Resend, SendGrid, etc.)
2. **Token Expiry**: 7 days acceptable? (Can be configurable)
3. **Rate Limiting**: Needed? (Recommended for production)
4. **Analytics**: Track email opens? (Optional enhancement)
5. **Mobile Priority**: iOS or Android first? (Android ready, iOS pending)

---

## Conclusion

The Share Live Run Session feature has a solid foundation with the existing implementation. This enhancement adds:

✅ **Email invitations** for non-registered users  
✅ **Web-based observer experience** (no app required)  
✅ **Complete push + email notification flow**  
✅ **Seamless transition** from waiting to live viewing  

The implementation is **scoped, documented, and actionable**. All code examples and API contracts are provided. Timeline: **3 weeks** to complete.

---

## Contact & Support

For questions on implementation details, refer to:
- Code examples: SHARE_LIVE_RUN_SESSION_COMPLETE_BRIEF.md
- Visual flows: SHARE_LIVE_RUN_FLOW_DIAGRAMS.md
- Task checklist: SHARE_LIVE_RUN_IMPLEMENTATION_CHECKLIST.md
- iOS guide: iOS_LIVE_RUN_OBSERVER_BRIEF.md
