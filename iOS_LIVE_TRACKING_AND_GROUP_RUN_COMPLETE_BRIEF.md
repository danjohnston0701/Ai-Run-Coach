# iOS: Live Tracking & Group Run — Complete Implementation Brief

**Date**: July 1, 2026  
**Platform**: iOS (SwiftUI)  
**Status**: Ready for Xcode AI Implementation  
**Reference**: Android implementation complete at commit `43fb8d4`

---

## 📋 Executive Summary

Two complementary **real-time social features** that enhance group coordination:

1. **Live Tracking** — Friends/non-registered users watch runner's live location & metrics
2. **Group Run** — Friends participate together as a running group

Both features integrate into the **Prepare Run Screen** with:
- Expandable UI sections
- Friend picker dialogs
- Push notification handling
- Automatic invite sending on run start

**Timeline**: 2-3 days for one feature, 3-4 days for both

---

## 🎯 Feature Overview

### Live Tracking

**Purpose**: Let friends watch your run in real-time without participating

**User Flow**:
```
Prepare Run Screen
  ├─ Toggle "Live Tracking" ON
  ├─ Expandable section appears
  ├─ Tap "Add Friend" button
  ├─ Friend picker opens (search enabled)
  ├─ Select friends (multi-select checkboxes)
  ├─ Friends appear in list
  ├─ Can add email addresses manually
  ├─ Start run
  └─ Invites sent:
      ├─ Registered friends → PUSH notification
      └─ Non-registered (emails) → EMAIL with deep link
```

**Observer Experience**:
```
Friend (Registered)
  └─ Tap PUSH notification
  └─ App opens → Observer screen
  └─ See live map + metrics updating every 2-3 seconds
  └─ Wait state while runner prepares
  └─ Auto-transition to live when runner starts

Non-Registered User (via Email)
  └─ Click link in email
  └─ Deep link: airuncoach://observe/{token}
  └─ App opens → Token entry screen
  └─ Enter token manually
  └─ Validates token
  └─ Observer screen appears
  └─ Same experience as registered friend
```

---

### Group Run

**Purpose**: Friends participate together in a group run

**User Flow**:
```
Prepare Run Screen
  ├─ Toggle "Group Run" ON
  ├─ Expandable section appears
  ├─ Tap "Add Friends" button
  ├─ Friend picker opens
  ├─ Select participants (multi-select)
  ├─ Participants list shown
  ├─ Start run
  └─ Invites sent:
      └─ All participants → PUSH: "Join [runner]'s group run"
```

**Participant Experience**:
```
Friend gets PUSH: "Tom invited you to join group run"
  └─ Tap notification
  └─ App opens → Observer screen (same as Live Tracking)
  └─ See runner's live map + metrics
  └─ Can run alongside (their own device tracks them separately)
  └─ See shared progress in real-time
```

---

## 📱 UI Specifications

### Prepare Run Screen (Existing)

**Location**: Main run preparation flow  
**Current State**: Has "Live Tracking" & "Group Run" toggles that are non-functional

### Enhancement: Add Expandable Sections

**When "Live Tracking" toggle is ON:**
```
┌─────────────────────────────────┐
│ Live Tracking               [ON] │
│ Friends can watch your run      │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Who can watch?                  │
│                                 │
│ [+ Add Friends] [+] [Mail]      │
│ - Sarah Johnson      [x]         │
│ - jane@example.com   [x]        │
│                                 │
└─────────────────────────────────┘
```

**When "Group Run" toggle is ON:**
```
┌─────────────────────────────────┐
│ Group Run                  [ON]  │
│ Run together with friends       │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Who's running with you?         │
│                                 │
│ [+ Add Friends]                 │
│ - Mike Chen          [x]        │
│ - Alex Davis         [x]        │
│                                 │
└─────────────────────────────────┘
```

### Friend Picker Dialog

**Triggered by**: "Add Friends" button in Live Tracking or Group Run section

**UI Layout**:
```
┌────────────────────────────────┐
│ Select Friends                 │ [Close]
├────────────────────────────────┤
│ [Search by name...           ] │
├────────────────────────────────┤
│ ☐ Sarah Johnson                │
│ ☑ Mike Chen                    │
│ ☐ Alex Davis                   │
│ ☐ Jessica Wong                 │
│ ☐ Tom Rodriguez                │
│ ☐ Emily Brown                  │
│                                │
│       [Cancel]  [Add Selected] │
└────────────────────────────────┘
```

**Features**:
- Search bar with real-time filtering
- Checkboxes for multi-select
- Shows friend names + avatars (optional)
- Cancel/Add buttons at bottom
- Excludes already-selected friends

### Email Input Field (Live Tracking Only)

**Shown in**: Live Tracking expanded section below friend list

```
┌─────────────────────────────────┐
│ Or invite by email:             │
│ [jane@example.com        ] [✓]  │
│                                 │
│ [+ Add]                         │
└─────────────────────────────────┘
```

**Validation**:
- Check for @ symbol
- Basic email format validation
- Disable "Add" button if invalid
- Show checkmark when valid

---

## 🏗️ Architecture

### Components to Build

#### 1. **LiveTrackingSection** (SwiftUI View)
```swift
struct LiveTrackingSection: View {
    @State var isExpanded: Bool = false
    @State var observers: [String] = []  // Friend IDs
    @State var emails: [String] = []     // Email addresses
    @State var showFriendPicker: Bool = false
    @State var showEmailInput: Bool = false
    
    var body: some View {
        VStack {
            // Toggle
            Toggle("Live Tracking", isOn: $isExpanded)
            
            if isExpanded {
                Divider()
                
                // Observers list
                VStack(alignment: .leading) {
                    Text("Who can watch?")
                        .font(.headline)
                    
                    // Friend picker button
                    Button(action: { showFriendPicker = true }) {
                        HStack {
                            Image(systemName: "person.badge.plus")
                            Text("Add Friends")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    
                    // Observers list
                    ForEach(observers, id: \.self) { observer in
                        HStack {
                            Text(friendName(observer))
                            Spacer()
                            Button(action: { removeObserver(observer) }) {
                                Image(systemName: "xmark.circle")
                            }
                        }
                    }
                    
                    ForEach(emails, id: \.self) { email in
                        HStack {
                            Text(email)
                            Spacer()
                            Button(action: { removeEmail(email) }) {
                                Image(systemName: "xmark.circle")
                            }
                        }
                    }
                    
                    // Email input
                    HStack {
                        TextField("jane@example.com", text: $emailInput)
                            .keyboardType(.emailAddress)
                        
                        if isValidEmail(emailInput) {
                            Button(action: { addEmail() }) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                            }
                        }
                    }
                }
                .padding()
            }
        }
    }
}
```

#### 2. **GroupRunSection** (SwiftUI View)
```swift
struct GroupRunSection: View {
    @State var isExpanded: Bool = false
    @State var participants: [String] = []  // Friend IDs
    @State var showFriendPicker: Bool = false
    
    var body: some View {
        VStack {
            // Toggle
            Toggle("Group Run", isOn: $isExpanded)
            
            if isExpanded {
                Divider()
                
                VStack(alignment: .leading) {
                    Text("Who's running with you?")
                        .font(.headline)
                    
                    Button(action: { showFriendPicker = true }) {
                        HStack {
                            Image(systemName: "person.badge.plus")
                            Text("Add Friends")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    
                    ForEach(participants, id: \.self) { participant in
                        HStack {
                            Text(friendName(participant))
                            Spacer()
                            Button(action: { removeParticipant(participant) }) {
                                Image(systemName: "xmark.circle")
                            }
                        }
                    }
                }
                .padding()
            }
        }
    }
}
```

#### 3. **FriendPickerDialog** (SwiftUI View)
```swift
struct FriendPickerDialog: View {
    @Environment(\.dismiss) var dismiss
    @State var searchText: String = ""
    @State var selectedFriends: Set<String> = []
    
    let friends: [Friend]
    let onFriendsSelected: ([String]) -> Void
    
    var filteredFriends: [Friend] {
        if searchText.isEmpty {
            return friends
        }
        return friends.filter { 
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }
    
    var body: some View {
        NavigationView {
            VStack {
                SearchBar(text: $searchText, placeholder: "Search friends...")
                
                List(filteredFriends, id: \.id) { friend in
                    HStack {
                        Image(systemName: selectedFriends.contains(friend.id) ? "checkmark.square.fill" : "square")
                            .foregroundColor(.blue)
                        
                        Text(friend.name)
                        Spacer()
                    }
                    .onTapGesture {
                        toggleSelection(friend.id)
                    }
                }
                
                HStack {
                    Button("Cancel") { dismiss() }
                    Spacer()
                    Button("Add Selected") {
                        onFriendsSelected(Array(selectedFriends))
                        dismiss()
                    }
                }
                .padding()
            }
            .navigationTitle("Select Friends")
        }
    }
    
    private func toggleSelection(_ id: String) {
        if selectedFriends.contains(id) {
            selectedFriends.remove(id)
        } else {
            selectedFriends.insert(id)
        }
    }
}
```

---

## 🔗 API Integration

### Endpoints Needed

#### 1. Invite Observer (Live Tracking)
```
POST /api/live-sessions/:sessionId/invite-observer

Headers:
  Authorization: Bearer {token}
  Content-Type: application/json

Request Body:
{
  "friendId": "user-uuid-123",  // OR
  "email": "jane@example.com"
}

Response:
{
  "success": true,
  "type": "registered",  // or "email"
  "pushSent": true,
  "emailSent": false,
  "error": null
}
```

#### 2. Invite Group Run Participant
```
POST /api/live-sessions/:sessionId/invite-participant/:participantId

Headers:
  Authorization: Bearer {token}

Response:
{
  "success": true,
  "pushSent": true,
  "error": null
}
```

#### 3. Get User's Live Session (for getting session ID)
```
GET /api/users/{userId}/live-session

Headers:
  Authorization: Bearer {token}

Response:
{
  "id": "session-uuid-123",
  "runnerId": "user-uuid-456",
  "hasStarted": false,
  "isActive": true,
  "startedAt": 1719864000000,
  "routeId": "route-uuid-789",
  "location": { "lat": 37.7749, "lng": -122.4194 },
  "metrics": { ... }
}
```

---

## 💾 Data Models

### Run Setup Configuration

```swift
struct RunSetupConfig {
    // Existing fields
    var distanceKm: Double?
    var durationMinutes: Int?
    var routeId: String?
    
    // NEW: Social features
    var liveTrackingEnabled: Bool = false
    var liveTrackingObservers: [String] = []      // Friend IDs
    var liveTrackingEmails: [String] = []         // Email addresses
    
    var isGroupRun: Bool = false
    var groupRunParticipants: [String] = []       // Friend IDs
}
```

### API Request/Response Models

```swift
struct InviteObserverRequest: Codable {
    var friendId: String?
    var email: String?
}

struct InviteObserverResponse: Codable {
    let success: Bool
    let type: String?           // "registered" or "email"
    let pushSent: Bool
    let emailSent: Bool
    let error: String?
}

struct InviteParticipantResponse: Codable {
    let success: Bool
    let pushSent: Bool
    let error: String?
}
```

---

## 📲 Push Notification Handling

### Notification Payload

**For Live Tracking (Registered Friend)**:
```json
{
  "aps": {
    "alert": {
      "title": "Sarah invited you",
      "body": "Watch their run live in real-time"
    },
    "sound": "default",
    "badge": 1
  },
  "type": "live_run_invite",
  "sessionId": "session-uuid-123"
}
```

**For Group Run**:
```json
{
  "aps": {
    "alert": {
      "title": "Tom invited you",
      "body": "Join their group run"
    },
    "sound": "default",
    "badge": 1
  },
  "type": "group_run_invite",
  "sessionId": "session-uuid-123"
}
```

### Notification Handling Code

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
) {
    let userInfo = response.notification.request.content.userInfo
    
    guard let type = userInfo["type"] as? String,
          let sessionId = userInfo["sessionId"] as? String else {
        completionHandler()
        return
    }
    
    switch type {
    case "live_run_invite":
        // Navigate to observer session
        navigationManager.navigate(to: .observerSession(sessionId))
        
    case "group_run_invite":
        // Same as live run invite for now
        navigationManager.navigate(to: .observerSession(sessionId))
        
    default:
        break
    }
    
    completionHandler()
}
```

---

## 🔄 Deep Linking (for Email Invites)

### Deep Link Format

```
airuncoach://observe/{token}
```

### URL Scheme Registration (Info.plist)

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.airuncoach.app</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>airuncoach</string>
        </array>
    </dict>
</array>
```

### Deep Link Handler

```swift
func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
) -> Bool {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
          components.scheme == "airuncoach" else {
        return false
    }
    
    // Handle observe/{token}
    if components.host == "observe",
       let token = components.path.split(separator: "/").last {
        navigationManager.navigate(to: .observerLogin(String(token)))
        return true
    }
    
    return false
}
```

---

## 🎬 Implementation Flow

### When Run Starts (Send Invites)

```swift
func startRun() async {
    // 1. Start RunTrackingService
    startRunTracking()
    
    // 2. Wait for session creation (500ms)
    try? await Task.sleep(nanoseconds: 500_000_000)
    
    // 3. Get session ID
    guard let sessionId = try? await getActiveSessionId() else {
        print("❌ No session ID available")
        return
    }
    
    // 4. Send Live Tracking invites (if enabled)
    if runSetupConfig.liveTrackingEnabled {
        await sendLiveTrackingInvites(
            sessionId: sessionId,
            observers: runSetupConfig.liveTrackingObservers,
            emails: runSetupConfig.liveTrackingEmails
        )
    }
    
    // 5. Send Group Run invites (if enabled)
    if runSetupConfig.isGroupRun {
        await sendGroupRunInvites(
            sessionId: sessionId,
            participants: runSetupConfig.groupRunParticipants
        )
    }
}

private func sendLiveTrackingInvites(
    sessionId: String,
    observers: [String],
    emails: [String]
) async {
    // Send invites for registered friends
    for friendId in observers {
        do {
            let response = try await apiService.inviteObserver(
                sessionId: sessionId,
                friendId: friendId
            )
            print("✅ Live tracking invite sent to \(friendId) (push: \(response.pushSent))")
        } catch {
            print("❌ Failed to invite \(friendId): \(error.localizedDescription)")
        }
    }
    
    // Send invites for email addresses
    for email in emails {
        do {
            let response = try await apiService.inviteObserver(
                sessionId: sessionId,
                email: email
            )
            print("✅ Email invite sent to \(email)")
        } catch {
            print("❌ Failed to email \(email): \(error.localizedDescription)")
        }
    }
}

private func sendGroupRunInvites(
    sessionId: String,
    participants: [String]
) async {
    for participantId in participants {
        do {
            let response = try await apiService.inviteGroupRunParticipant(
                sessionId: sessionId,
                participantId: participantId
            )
            print("✅ Group run invite sent to \(participantId) (push: \(response.pushSent))")
        } catch {
            print("❌ Failed to invite \(participantId): \(error.localizedDescription)")
        }
    }
}
```

---

## 🧪 Testing Checklist

### Unit Tests

- [ ] `LiveTrackingSection` expands/collapses
- [ ] Friends are added to observers list
- [ ] Friends are removed from list
- [ ] Email validation works
- [ ] Emails are added/removed
- [ ] `GroupRunSection` expands/collapses
- [ ] Participants are added/removed
- [ ] FriendPickerDialog filters by search
- [ ] Multi-select works correctly

### Integration Tests

- [ ] Live tracking invites are sent on run start
- [ ] Group run invites are sent on run start
- [ ] Session ID is retrieved correctly
- [ ] API calls include correct parameters
- [ ] Error handling works gracefully
- [ ] Both features work together without conflicts

### E2E Tests

**Scenario: Live Tracking with Registered Friend**
1. [ ] Enable "Live Tracking" toggle
2. [ ] Tap "Add Friends"
3. [ ] Select friend from picker
4. [ ] Friend appears in observers list
5. [ ] Start run
6. [ ] Friend receives PUSH notification
7. [ ] Tap notification → Observer screen
8. [ ] Friend sees live map & metrics

**Scenario: Live Tracking with Email**
1. [ ] Enable "Live Tracking" toggle
2. [ ] Enter email address
3. [ ] Email appears in list
4. [ ] Start run
5. [ ] Email recipient receives EMAIL
6. [ ] Click link → Deep link opens app
7. [ ] Token entry screen appears
8. [ ] Enter token manually
9. [ ] Observer screen shows
10. [ ] See live map & metrics

**Scenario: Group Run**
1. [ ] Enable "Group Run" toggle
2. [ ] Tap "Add Friends"
3. [ ] Select 2-3 friends
4. [ ] Friends appear in participants list
5. [ ] Start run
6. [ ] All friends receive PUSH: "Join group run"
7. [ ] Tap notification → Observer screen
8. [ ] See runner's live map & metrics
9. [ ] Multiple observers watching same run

---

## 🎨 Design Considerations

### Colors & Styling

**Live Tracking Section**:
- Background: Subtle blue tint (primary color)
- Icon: Person with eyes (watching)
- Accent: Blue checkmark for email validation

**Group Run Section**:
- Background: Subtle green tint (group/team color)
- Icon: Multiple people
- Accent: Green for active participants

**Friend Picker Dialog**:
- Background: Modal with dimmed backdrop
- Checkboxes: Standard iOS checkmark style
- Search bar: Standard iOS SearchBar

### Animations

- Section expand/collapse: Smooth spring animation
- Friend list appearance: Fade in + slight slide
- Button interactions: Standard iOS haptic feedback

---

## 📚 Reference Implementation (Android)

For UI patterns and state management, reference:
- `LiveTrackingObserverSection` in `MapMyRunSetupScreen.kt`
- `GroupRunParticipantSection` in `MapMyRunSetupScreen.kt`
- `FriendPickerDialog.kt` - Complete friend selection component
- `RunSessionViewModel.kt` - Invite sending logic

All files use the same patterns that should translate well to SwiftUI.

---

## ⚠️ Important Notes

### Session ID Timing
- Run tracking service takes ~500ms to initialize
- Live session is created asynchronously
- Must wait before retrieving session ID
- Use `Task.sleep(nanoseconds: 500_000_000)` delay

### Email Validation
- Basic validation: check for @ symbol
- Don't validate domain existence
- Let backend handle full validation
- Show clear error messages

### Error Handling
- If invites fail, don't stop the run
- Log errors for debugging
- Show optional toast/alert to user (friendly, not alarming)
- Continue run normally

### State Persistence
- Save RunSetupConfig with selected friends/emails
- Persist between app sessions if desired
- Clear when run completes

---

## 🚀 Deployment Checklist

### Pre-Launch

- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] No console warnings
- [ ] Push notifications working
- [ ] Deep links working
- [ ] Error messages user-friendly
- [ ] Logging comprehensive

### Launch

- [ ] Deploy to TestFlight
- [ ] QA testing on real devices
- [ ] Stakeholder review
- [ ] Release notes prepared
- [ ] Monitor crash reports
- [ ] Monitor push delivery

### Post-Launch

- [ ] Monitor push notification stats
- [ ] Track feature usage
- [ ] Gather user feedback
- [ ] Monitor error logs
- [ ] Performance metrics

---

## 📞 Support & Questions

**For iOS-specific questions**:
- Reference Android implementation for logic/flow
- Check push notification payload format
- Verify API endpoints match backend
- Test deep links thoroughly

**Common Issues**:
- Session ID not found → Check timing (may need longer delay)
- Push notifications not received → Check device tokens
- Deep links not working → Verify URL scheme registration
- Email validation too strict → Keep it simple (just @ check)

---

## Summary

**Two complementary social features** for iOS that match Android implementation:

1. **Live Tracking** — Watch + be watched
   - Expandable section on prepare screen
   - Friend picker + email input
   - Invites on run start
   - Push + email notifications

2. **Group Run** — Run together
   - Expandable section on prepare screen
   - Friend picker
   - Invites on run start
   - Push notifications

**Implementation Effort**: 3-4 days for both features  
**Complexity**: Medium (mostly UI + API integration)  
**Testing Effort**: 2-3 days  

**Keys to Success**:
- ✅ Match Android UI patterns
- ✅ Reuse FriendPickerDialog component
- ✅ Handle session ID timing correctly
- ✅ Comprehensive error handling
- ✅ Full logging for debugging

Everything is ready to build! 🚀

