# iOS Implementation Quick Summary

**Complete Brief**: `iOS_LIVE_TRACKING_AND_GROUP_RUN_COMPLETE_BRIEF.md` (900+ lines)

---

## 📋 What's Covered

### Feature 1: Live Tracking ✅

**Purpose**: Friends watch your run live  
**User Flow**: Toggle ON → Add friends → Start run → Friends get push/email

**Key Components**:
- `LiveTrackingSection` — Expandable section with friend picker
- Email input field with validation
- Observers list display

**API Calls**:
- `POST /api/live-sessions/:sessionId/invite-observer` (with friendId OR email)

### Feature 2: Group Run ✅

**Purpose**: Friends run together  
**User Flow**: Toggle ON → Add friends → Start run → Friends get push to join

**Key Components**:
- `GroupRunSection` — Expandable section with friend picker
- Participants list display

**API Calls**:
- `POST /api/live-sessions/:sessionId/invite-participant/:participantId`

---

## 🎨 UI Specifications

### Expandable Sections

**Live Tracking (When ON)**:
```
┌─────────────────────────────────┐
│ Live Tracking               [ON] │
│ Friends can watch your run      │
│ [+ Add Friends] [+] [email]     │
│ - Sarah Johnson        [x]       │
│ - jane@example.com     [x]      │
└─────────────────────────────────┘
```

**Group Run (When ON)**:
```
┌─────────────────────────────────┐
│ Group Run                  [ON]  │
│ Run together with friends       │
│ [+ Add Friends]                 │
│ - Mike Chen            [x]       │
│ - Alex Davis           [x]       │
└─────────────────────────────────┘
```

### Friend Picker Dialog

```
┌────────────────────────────────┐
│ Select Friends           [Close]│
├────────────────────────────────┤
│ [Search by name...           ] │
├────────────────────────────────┤
│ ☐ Sarah Johnson                │
│ ☑ Mike Chen                    │
│ ☐ Alex Davis                   │
│ ☐ Jessica Wong                 │
│                                │
│      [Cancel]  [Add Selected]  │
└────────────────────────────────┘
```

---

## 💾 Data Models

```swift
struct RunSetupConfig {
    // Social features (new)
    var liveTrackingEnabled: Bool = false
    var liveTrackingObservers: [String] = []      // Friend IDs
    var liveTrackingEmails: [String] = []         // Email addresses
    
    var isGroupRun: Bool = false
    var groupRunParticipants: [String] = []       // Friend IDs
}
```

---

## 🔗 API Endpoints

### Live Tracking Invite
```
POST /api/live-sessions/:sessionId/invite-observer
Body: { "friendId": "..." } OR { "email": "..." }
Response: { success, type, pushSent, emailSent, error }
```

### Group Run Invite
```
POST /api/live-sessions/:sessionId/invite-participant/:participantId
Response: { success, pushSent, error }
```

### Get Session ID
```
GET /api/users/{userId}/live-session
Response: { id, runnerId, hasStarted, isActive, ... }
```

---

## 📲 Push Notifications

**Live Tracking**:
```json
{
  "type": "live_run_invite",
  "title": "Sarah invited you",
  "body": "Watch their run live in real-time",
  "sessionId": "session-uuid-123"
}
```

**Group Run**:
```json
{
  "type": "group_run_invite",
  "title": "Tom invited you",
  "body": "Join their group run",
  "sessionId": "session-uuid-123"
}
```

**Handling**:
```swift
func userNotificationCenter(..., didReceive response: ...) {
    if type == "live_run_invite" || "group_run_invite" {
        navigate(to: .observerSession(sessionId))
    }
}
```

---

## 🔗 Deep Linking (Email Invites)

**URL Format**: `airuncoach://observe/{token}`

**Info.plist Setup**:
```xml
<key>CFBundleURLSchemes</key>
<array>
    <string>airuncoach</string>
</array>
```

**Handler**:
```swift
func application(..., open url: URL) -> Bool {
    if url.scheme == "airuncoach" && url.host == "observe" {
        let token = url.lastPathComponent
        navigate(to: .observerLogin(token))
        return true
    }
    return false
}
```

---

## 🎬 When Run Starts (Send Invites)

```swift
func startRun() async {
    // 1. Start RunTrackingService
    startRunTracking()
    
    // 2. Wait 500ms for session creation
    try? await Task.sleep(nanoseconds: 500_000_000)
    
    // 3. Get session ID
    let sessionId = try? await getActiveSessionId()
    
    // 4. Send Live Tracking invites (if enabled)
    if runSetupConfig.liveTrackingEnabled {
        for friendId in observers {
            try? await apiService.inviteObserver(
                sessionId: sessionId,
                friendId: friendId
            )
        }
        for email in emails {
            try? await apiService.inviteObserver(
                sessionId: sessionId,
                email: email
            )
        }
    }
    
    // 5. Send Group Run invites (if enabled)
    if runSetupConfig.isGroupRun {
        for participantId in participants {
            try? await apiService.inviteGroupRunParticipant(
                sessionId: sessionId,
                participantId: participantId
            )
        }
    }
}
```

---

## ✅ Testing Checklist

### Unit Tests
- [ ] Sections expand/collapse
- [ ] Friends added/removed
- [ ] Email validation works
- [ ] Multi-select in picker

### Integration Tests
- [ ] Invites sent on run start
- [ ] Session ID retrieved correctly
- [ ] API calls have correct params
- [ ] Error handling works

### E2E Tests
- [ ] Full Live Tracking flow (friend)
- [ ] Full Live Tracking flow (email)
- [ ] Full Group Run flow
- [ ] Push notifications work
- [ ] Deep links work

---

## 🎯 Implementation Timeline

- **Day 1**: UI components + state management
- **Day 2**: API integration + invite sending
- **Day 3**: Push notifications + deep links
- **Day 4**: Testing + refinement

**Total**: 3-4 days for both features

---

## 📚 Complete Guide

**Everything is documented in**:  
`iOS_LIVE_TRACKING_AND_GROUP_RUN_COMPLETE_BRIEF.md`

This includes:
- ✅ Detailed UI wireframes
- ✅ Complete SwiftUI code templates
- ✅ API endpoint specifications
- ✅ Data model definitions
- ✅ Push notification setup
- ✅ Deep link configuration
- ✅ Async/await implementation patterns
- ✅ Comprehensive testing checklist
- ✅ Deployment procedures
- ✅ Reference to Android code
- ✅ Common issues & solutions

---

## 🚀 Ready to Build

iOS team can now replicate Android features with:
- ✅ 100% feature parity
- ✅ Same user experience
- ✅ Same API integration
- ✅ Complete code examples
- ✅ Full testing guide

Start building! 🎉

