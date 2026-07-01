
# iOS: Share Live Run Session — Complete Implementation Brief

**Date**: July 1, 2026  
**Status**: Implementation Guide for Xcode AI Agent  
**Platform**: iOS (Swift + SwiftUI)

---

## 📋 Executive Summary

The iOS app needs to replicate the **Share Live Run Session** feature recently completed on Android. This enables runners to invite friends and email contacts to observe their live runs in real-time.

### Two Invitation Flows

**Flow 1: Registered Friends (Push Notification)**
```
Runner selects friend → Invite sent → Friend gets push notification
→ Tap notification → App shows ObserverRunSessionView
→ Friend sees live location, metrics, route
```

**Flow 2: Non-Registered Users (Email + Deep Link)**
```
Runner enters email → Invite sent → Email with deep link
→ Email recipient clicks → Deep link opens app with token
→ Token validation → ObserverRunSessionView
→ No account needed!
```

---

## 🏗️ Architecture Overview

### Backend Endpoints (Already Implemented)
- ✅ `POST /api/live-sessions/:sessionId/invite-observer` — Accept `friendId` OR `email`
- ✅ `GET /api/observe/:token` — Public (no auth) endpoint to validate token & load session
- ✅ `GET /api/live-sessions/:sessionId` — Existing endpoint for observer polling

### Database (Already Implemented)
- ✅ `observer_invitations` table — Tracks email invites with token, expiry, viewed_at
- ✅ Data structure supports 7-day token expiry

### iOS Task: Implement Client-Side Features
- [ ] **New ViewModel**: `ObserverLoginViewModel` — Token validation & session loading
- [ ] **New View**: `ObserverLoginView` — Token entry screen (UI for non-registered observers)
- [ ] **Enhance Existing**: `ObserverRunSessionView` — Add "Run Finished" end state
- [ ] **Deep Link Handling**: Register `airuncoach://observe/{token}` scheme in Info.plist
- [ ] **Navigation Integration**: Route deep links to the token entry view
- [ ] **API Client**: Add `getObserveSession(token:)` method

---

## 🔗 Deep Link Flow (Critical for UX)

### Email Link Format
```
airuncoach://observe/{64-char-hex-token}
```

### How It Works
1. User clicks link in email
2. iOS opens the app with the deep link URL
3. App extracts token from URL: `airuncoach://observe/abc123...xyz`
4. App routes to `ObserverLoginView` with `initialToken` pre-filled
5. ViewModel auto-validates token
6. On success, navigate to `ObserverRunSessionView`

### Deep Link Handling Code Location
- **File**: `SceneDelegate.swift` or root navigation logic
- **Scheme**: Must be registered in `Info.plist` → `URL Types`

---

## 📱 UI Screens

### Screen 1: ObserverLoginView

**Purpose**: Entry point for non-registered observers to paste their invite token.

**Layout**:
```
┌─────────────────────────────────┐
│   [Back] "Watch Live Run"       │ ← TopBar (primary color)
├─────────────────────────────────┤
│                                 │
│  👟                             │ ← Icon (40pt)
│                                 │
│  Enter Your Invite Token        │ ← H3 Title
│  You were sent a token in       │ ← Body text
│  the email. Paste it below.     │   (explain what to do)
│                                 │
│  ┌─────────────────────────────┐│ ← Token input (monospace)
│  │ Paste your 64-character...  ││   - Filters to alphanumeric only
│  │ abc123xyz...                ││   - Shows checkmark when 64 chars
│  │                              ││   - Shows clear button otherwise
│  └─────────────────────────────┘│
│  64 / 64 characters ✓           │ ← Char counter (green when full)
│                                 │
│  ❌ Token not found            │ ← Error card (if validation fails)
│  Check the token in your       │   - Shows helpful error message
│  email and try again.          │   - Red background, red text
│                                 │
│ [Spacer / Weight 1]             │
│                                 │
│  ┌─────────────────────────────┐│ ← Primary button (filled)
│  │  Watch Live Run             ││   - Disabled until token entered
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│ ← Secondary button (outlined)
│  │  Cancel                      ││
│  └─────────────────────────────┘│
│                                 │
└─────────────────────────────────┘
```

**States**:
- **Loading**: Show spinner + "Loading run session…" text
- **Form**: Token input + buttons
- **Error**: Show error message, keep form visible for retry
- **Success**: Navigate immediately (don't wait, use `.onReceive`)

**Behavior**:
- If `initialToken` passed (from deep link): auto-fill & auto-validate
- User can also manually type/paste token
- Button disabled until token is not blank
- Clear button only shown if token is entered
- Checkmark icon only shown if token is exactly 64 chars
- On validation error, show message (404 → "not found", 410 → "expired", etc.)

---

### Screen 2: Enhanced ObserverRunSessionView

**Add Run Finished State** (currently missing):

```
┌─────────────────────────────────┐
│  [Back] "Tom's Run"             │
├─────────────────────────────────┤
│                                 │
│                                 │
│            ✅                    │ ← Large checkmark emoji
│                                 │
│       Run finished!             │ ← H3 Title
│                                 │
│  Tom's run has ended.           │ ← Body text
│  Great job cheering them on!    │
│                                 │
│  [Spacer / Weight 1]             │
│                                 │
│  ┌─────────────────────────────┐│ ← Primary button
│  │  Go Back to Dashboard       ││
│  └─────────────────────────────┘│
│                                 │
└─────────────────────────────────┘
```

**When to Show This**:
- When `session.isActive == false` AND previously was `true`
- Check this BEFORE the waiting/live states in the if/else chain
- Tapping "Go Back" pops the view

**Data Structure Update**:
Add to the `ObserverLiveRunSession` model:
```swift
struct ObserverLiveRunSession {
    // ... existing fields ...
    var isActive: Bool = true  // NEW: false means run has ended
}
```

---

## 🔌 API Integration

### New API Method: `getObserveSession(token:)`

**Location**: `APIClient.swift` or `NetworkManager.swift`

**Method Signature**:
```swift
func getObserveSession(token: String) async throws -> ObserveSessionResponse {
    let url = baseURL.appending(path: "/api/observe/\(token)")
    let request = URLRequest(url: url)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw NetworkError.invalidResponse
    }
    
    switch httpResponse.statusCode {
    case 200:
        return try JSONDecoder().decode(ObserveSessionResponse.self, from: data)
    case 404:
        throw ObserverError.tokenNotFound
    case 410:
        throw ObserverError.tokenExpired
    default:
        throw NetworkError.httpError(statusCode: httpResponse.statusCode)
    }
}
```

**Data Models**:
```swift
struct ObserveSessionResponse: Codable {
    let sessionData: ObserveSessionData
    let isExpired: Bool
}

struct ObserveSessionData: Codable {
    let id: String
    let userId: String
    let runnerName: String?
    let currentLat: Double?
    let currentLng: Double?
    let distanceCovered: Double
    let elapsedTime: Int
    let currentPace: String?
    let currentHeartRate: Int?
    let hasStarted: Bool
    let isActive: Bool
    let startedAt: Date?
    let routeId: String?
    let gpsTrack: [GpsPoint]?
}

enum ObserverError: LocalizedError {
    case tokenNotFound
    case tokenExpired
    case invalidSession
}
```

---

## 🎬 ViewModel: ObserverLoginViewModel

**Purpose**: Validates invite token via the public API endpoint.

**File**: Create `ObserverLoginViewModel.swift`

**Key Properties**:
```swift
@MainActor
class ObserverLoginViewModel: ObservableObject {
    @Published var token = ""
    @Published var isLoading = false
    @Published var error: String?
    @Published var resolvedSessionId: String?  // NEW: populated on success
    
    private let apiClient: APIClient
    
    func validateAndLoadSession(token: String) async {
        guard !token.trimmingCharacters(in: .whitespaces).isEmpty else {
            error = "Please enter a token"
            return
        }
        
        isLoading = true
        error = nil
        resolvedSessionId = nil
        
        do {
            let response = try await apiClient.getObserveSession(token: token)
            
            // Extract session ID — this is what we navigate with
            guard !response.sessionData.id.isEmpty else {
                error = "Invalid session data. Please try again."
                isLoading = false
                return
            }
            
            resolvedSessionId = response.sessionData.id
            isLoading = false
            
        } catch let error as ObserverError {
            self.error = error.localizedDescription
            isLoading = false
        } catch {
            self.error = "Failed to validate token. Please check your connection."
            isLoading = false
        }
    }
}
```

**Error Handling**:
```swift
extension ObserverError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .tokenNotFound:
            return "Token not found or invalid. Check the token in your email."
        case .tokenExpired:
            return "This token has expired. Ask the runner to send a new invite."
        case .invalidSession:
            return "Run session no longer available. Please try again."
        }
    }
}
```

---

## 🧭 Navigation Integration

### Deep Link Registration (Info.plist)

Add to your app's `Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>airuncoach</string>
        </array>
        <key>CFBundleURLName</key>
        <string>com.airuncoach.observe</string>
    </dict>
</array>
```

### Deep Link Handling (SceneDelegate or Root Navigation)

**Approach 1: SceneDelegate** (UIKit style)
```swift
func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let urlContext = URLContexts.first else { return }
    let url = urlContext.url
    
    if url.scheme == "airuncoach" && url.host == "observe" {
        let token = url.pathComponents.dropFirst().joined(separator: "/")
        
        // Navigation happens via @EnvironmentObject or deep link state
        // See SwiftUI integration below
    }
}
```

**Approach 2: SwiftUI with onOpenURL** (Recommended)
```swift
@main
struct AiRunCoachApp: App {
    @State private var deepLinkToken: String?
    
    var body: some Scene {
        WindowGroup {
            RootView(deepLinkToken: $deepLinkToken)
                .onOpenURL { url in
                    if url.scheme == "airuncoach" && url.host == "observe" {
                        // Extract token from: airuncoach://observe/{token}
                        let token = url.pathComponents.last ?? ""
                        self.deepLinkToken = token
                    }
                }
        }
    }
}
```

### Navigation State Management

**In your main NavigationStack or NavigationView**:
```swift
struct RootView: View {
    @Binding var deepLinkToken: String?
    @State private var navigationPath = NavigationPath()
    
    var body: some View {
        NavigationStack(path: $navigationPath) {
            // Your existing navigation
            HomeView()
                .navigationDestination(for: String.self) { token in
                    // When deep link token arrives, navigate to observer login
                    ObserverLoginView(initialToken: token)
                }
        }
        .onChange(of: deepLinkToken) { newToken in
            if let token = newToken {
                navigationPath.append(token)  // Navigate to ObserverLoginView
            }
        }
    }
}
```

---

## 💻 ObserverLoginView Implementation

**File**: Create `ObserverLoginView.swift`

```swift
import SwiftUI

struct ObserverLoginView: View {
    @StateObject private var viewModel = ObserverLoginViewModel()
    @Environment(\.dismiss) var dismiss
    
    let initialToken: String?
    let onSessionLoaded: (String) -> Void
    
    var body: some View {
        ZStack {
            Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.04, green: 0.04, blue: 0.10, alpha: 1) : .white })
                .ignoresSafeArea()
            
            VStack(spacing: 20) {
                // Top bar
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    Spacer()
                    Text("Watch Live Run")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                    Spacer()
                    Color.clear.frame(width: 40)
                }
                .padding(16)
                .background(Color(red: 0.0, green: 0.84, blue: 1.0))
                
                if viewModel.isLoading {
                    // Loading state
                    VStack(spacing: 16) {
                        ProgressView()
                            .tint(Color(red: 0.0, green: 0.84, blue: 1.0))
                        Text("Loading run session…")
                            .font(.system(size: 14, weight: .regular))
                            .foregroundColor(Color(red: 0.65, green: 0.68, blue: 0.74))
                    }
                    .frame(maxHeight: .infinity, alignment: .center)
                    
                } else {
                    // Form
                    ScrollView {
                        VStack(spacing: 20) {
                            // Icon + header
                            VStack(spacing: 16) {
                                Text("👟")
                                    .font(.system(size: 40))
                                
                                Text("Enter Your Invite Token")
                                    .font(.system(size: 24, weight: .bold))
                                    .foregroundColor(Color(red: 0.96, green: 0.97, blue: 0.99))
                                
                                Text("You were sent a token in the invite email. Paste it below to join the live run.")
                                    .font(.system(size: 14, weight: .regular))
                                    .foregroundColor(Color(red: 0.65, green: 0.68, blue: 0.74))
                                    .multilineTextAlignment(.center)
                            }
                            .padding(.top, 24)
                            
                            // Token input
                            VStack(alignment: .leading, spacing: 8) {
                                TextField("Paste your 64-character token here", text: $viewModel.token)
                                    .font(.system(size: 12, weight: .regular, design: .monospaced))
                                    .textContentType(.none)
                                    .autocorrectionDisabled()
                                    .textInputAutocapitalization(.never)
                                    .padding(12)
                                    .background(Color(red: 0.1, green: 0.1, blue: 0.12))
                                    .cornerRadius(8)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .stroke(
                                                viewModel.token.count == 64 ? Color(red: 0.3, green: 0.8, blue: 0.3) : Color(red: 0.0, green: 0.84, blue: 1.0),
                                                lineWidth: 1
                                            )
                                    )
                                
                                if !viewModel.token.isEmpty {
                                    HStack {
                                        Text("\(viewModel.token.count) / 64 characters\(viewModel.token.count == 64 ? " ✓" : "")")
                                            .font(.system(size: 11, weight: .regular))
                                            .foregroundColor(viewModel.token.count == 64 ? Color(red: 0.3, green: 0.8, blue: 0.3) : Color(red: 0.65, green: 0.68, blue: 0.74))
                                        Spacer()
                                    }
                                }
                            }
                            
                            // Error message
                            if let error = viewModel.error {
                                HStack(spacing: 8) {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 16))
                                        .foregroundColor(Color(red: 1.0, green: 0.3, blue: 0.3))
                                    
                                    Text(error)
                                        .font(.system(size: 14, weight: .regular))
                                        .foregroundColor(Color(red: 1.0, green: 0.3, blue: 0.3))
                                    
                                    Spacer()
                                }
                                .padding(12)
                                .background(Color(red: 1.0, green: 0.3, blue: 0.3, opacity: 0.1))
                                .cornerRadius(8)
                            }
                            
                            Spacer()
                        }
                        .padding(24)
                    }
                    
                    // Buttons
                    VStack(spacing: 12) {
                        Button(action: {
                            Task {
                                await viewModel.validateAndLoadSession(token: viewModel.token)
                            }
                        }) {
                            Text("Watch Live Run")
                                .font(.system(size: 16, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(16)
                                .background(viewModel.token.isEmpty ? Color(red: 0.0, green: 0.84, blue: 1.0, opacity: 0.5) : Color(red: 0.0, green: 0.84, blue: 1.0))
                                .foregroundColor(.white)
                                .cornerRadius(8)
                        }
                        .disabled(viewModel.token.isEmpty || viewModel.isLoading)
                        
                        Button(action: { dismiss() }) {
                            Text("Cancel")
                                .font(.system(size: 16, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(16)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(red: 0.0, green: 0.84, blue: 1.0), lineWidth: 1))
                                .foregroundColor(Color(red: 0.0, green: 0.84, blue: 1.0))
                        }
                    }
                    .padding(24)
                }
            }
        }
        .onAppear {
            if let token = initialToken {
                viewModel.token = token
                Task {
                    await viewModel.validateAndLoadSession(token: token)
                }
            }
        }
        .onChange(of: viewModel.resolvedSessionId) { sessionId in
            if let sessionId = sessionId {
                onSessionLoaded(sessionId)
            }
        }
    }
}

#Preview {
    ObserverLoginView(initialToken: nil) { _ in }
}
```

---

## 🔄 ObserverRunSessionViewModel Updates

**Update the polling logic** to stop when `isActive == false`:

```swift
private func startPolling() {
    pollingTimer?.invalidate()
    
    pollingTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
        Task { @MainActor in
            guard let self = self else { return }
            
            do {
                let updated = try await self.apiClient.getLiveSession(id: self.sessionId)
                self.liveSession = updated
                
                // Stop polling when run ends
                if !updated.isActive {
                    self.pollingTimer?.invalidate()
                    self.pollingTimer = nil
                }
                
            } catch {
                print("Failed to fetch updates: \(error)")
                // Continue polling on error
            }
        }
    }
}
```

---

## 🎨 ObserverRunSessionView: Add "Run Finished" State

**Add this composable before the existing state checks**:

```swift
// In ObserverRunSessionView body
var body: some View {
    ZStack {
        // Existing content
        
        VStack {
            // Load session on appear
            if viewModel.liveSession == nil && !viewModel.isLoading {
                VStack {
                    ProgressView()
                    Text("Loading run session…")
                }
            }
            
            // Run finished state (CHECK THIS FIRST!)
            else if let session = viewModel.liveSession, !session.isActive {
                RunFinishedView(
                    runnerName: session.runnerName ?? "The runner",
                    onDismiss: { dismiss() }
                )
            }
            
            // Waiting for runner to start
            else if let session = viewModel.liveSession, !session.hasStarted {
                WaitingForRunnerView(
                    runnerName: session.runnerName ?? "Unknown",
                    onCancel: { dismiss() }
                )
            }
            
            // Active run - show map and metrics
            else if let session = viewModel.liveSession {
                LiveRunMapView(session: session)
            }
        }
    }
}
```

**New Composable: RunFinishedView**

```swift
struct RunFinishedView: View {
    let runnerName: String
    let onDismiss: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Text("✅")
                .font(.system(size: 56))
            
            Text("Run finished!")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(Color(red: 0.96, green: 0.97, blue: 0.99))
            
            Text("\(runnerName)'s run has ended. Great job cheering them on!")
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(Color(red: 0.65, green: 0.68, blue: 0.74))
                .multilineTextAlignment(.center)
            
            Spacer()
            
            Button(action: onDismiss) {
                Text("Go Back to Dashboard")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(16)
                    .background(Color(red: 0.0, green: 0.84, blue: 1.0))
                    .foregroundColor(.white)
                    .cornerRadius(8)
            }
        }
        .padding(32)
        .frame(maxHeight: .infinity, alignment: .center)
    }
}
```

---

## 📊 ObserverLiveRunSession Model Update

**Add `isActive` property**:

```swift
struct ObserverLiveRunSession: Identifiable, Codable {
    let id: String
    let userId: String
    var runnerName: String?
    var currentLat: Double?
    var currentLng: Double?
    var distanceCovered: Double = 0
    var elapsedTime: Int = 0
    var currentPace: String?
    var currentHeartRate: Int?
    var hasStarted: Bool = false
    var isActive: Bool = true  // NEW: false when run has ended
    var startedAt: Date?
    var routeId: String?
    var gpsTrack: [GpsPoint]?
}
```

---

## 🔐 Existing Invite Feature (Already in App)

The RunSession share button (runner invites friends) is already complete. When implementing, ensure:

1. ✅ When runner taps "Add another person" → Show modal to choose friend or enter email
2. ✅ If friend ID: Call `POST /api/live-sessions/:id/invite-observer` with `friendId`
3. ✅ If email: Call `POST /api/live-sessions/:id/invite-observer` with `email`
4. ✅ Push notifications sent automatically for registered friends
5. ✅ Email sent automatically for non-registered emails

**This is already in RunSessionView.swift** — no changes needed, just ensure the API call accepts both `friendId` and `email` in the request body.

---

## ✅ Implementation Checklist

### Phase 1: Core Components (Day 1)
- [ ] Create `ObserverLoginViewModel.swift`
- [ ] Create `ObserverLoginView.swift` (UI, validation, error handling)
- [ ] Add `getObserveSession(token:)` to APIClient
- [ ] Define `ObserveSessionResponse`, `ObserveSessionData`, `ObserverError` data models
- [ ] Update `ObserverLiveRunSession` model with `isActive` property

### Phase 2: Navigation & Deep Links (Day 1)
- [ ] Register `airuncoach` URL scheme in `Info.plist`
- [ ] Add `onOpenURL` handler in app entry point
- [ ] Integrate deep link token into navigation stack
- [ ] Test deep link: `xcrun simctl openurl booted airuncoach://observe/test123`

### Phase 3: ObserverRunSessionView Updates (Day 2)
- [ ] Create `RunFinishedView` composable
- [ ] Update view state logic to check `isActive` first
- [ ] Update polling logic to stop when `isActive == false`
- [ ] Add "Go Back" button to finished state

### Phase 4: Testing (Day 2)
- [ ] **Unit Tests**: ViewModel validation logic
- [ ] **Deep Link Test**: Send real deep link via email/SMS, verify app opens to login
- [ ] **Token Validation Test**: Use real token from backend, verify session loads
- [ ] **Error Cases**: Test expired token (410), invalid token (404), network error
- [ ] **End State Test**: Manually set session.isActive = false, verify finish screen appears
- [ ] **Registration Flow**: Invite friend via push, verify notification + observer view

### Phase 5: QA & Polish (Day 3)
- [ ] Accessibility: Check VoiceOver, dynamic type, color contrast
- [ ] Localization: All user-facing strings are localizable
- [ ] Performance: No memory leaks from polling
- [ ] Edge cases: Orientation changes, background/foreground transitions
- [ ] Copy review: Match tone/messaging with Android implementation

---

## 🔗 API Request/Response Examples

### 1. Validate Token

**Request**:
```
GET /api/observe/abc123def456xyz...
```

**Response (200 - Success)**:
```json
{
  "sessionData": {
    "id": "session-uuid-123",
    "userId": "runner-uuid-456",
    "runnerName": "Tom Johnson",
    "currentLat": 40.7128,
    "currentLng": -74.0060,
    "distanceCovered": 5.2,
    "elapsedTime": 1847,
    "currentPace": "6:45/km",
    "currentHeartRate": 162,
    "hasStarted": false,
    "isActive": true,
    "startedAt": null,
    "routeId": "route-uuid",
    "gpsTrack": null
  },
  "isExpired": false
}
```

**Response (404 - Not Found)**:
```json
{
  "error": "Invalid or expired link"
}
```

**Response (410 - Expired)**:
```json
{
  "error": "Link expired",
  "isExpired": true,
  "message": "This invite link has expired. Please ask the runner to send a new invite."
}
```

### 2. Poll for Updates (Existing Endpoint)

**Request**:
```
GET /api/live-sessions/session-uuid-123
```

**Response**:
```json
{
  "id": "session-uuid-123",
  "userId": "runner-uuid-456",
  "runnerName": "Tom Johnson",
  "currentLat": 40.7135,
  "currentLng": -74.0055,
  "distanceCovered": 5.8,
  "elapsedTime": 2105,
  "currentPace": "6:42/km",
  "currentHeartRate": 168,
  "hasStarted": true,
  "isActive": true,  // Becomes false when run ends
  "startedAt": 1719878400000,
  "routeId": "route-uuid",
  "gpsTrack": [
    {"lat": 40.7128, "lng": -74.0060, "timestamp": 1719878400000, "altitude": 10.5},
    ...
  ]
}
```

---

## 🎯 Key Implementation Notes

### Token Input Validation
- Only allow **alphanumeric characters** (a-z, A-Z, 0-9)
- Tokens are **64 characters** (32 bytes in hex)
- Use `.filter { $0.isLetter || $0.isNumber }` in TextField binding

### Network Error Handling
```swift
switch error {
case let httpError as URLError where httpError.code == .notConnectedToInternet:
    return "No internet connection"
case let httpError as URLError where httpError.code == .timedOut:
    return "Request timed out — please try again"
default:
    return "Network error — check your connection"
}
```

### Polling Strategy
- **While waiting**: Poll every 3 seconds (less frequent = better UX, runner might not start immediately)
- **While active**: Poll every 2 seconds (real-time feel without overwhelming network)
- **When finished**: Stop polling immediately (detected by `isActive == false`)
- **On app background**: Invalidate timer, restart on foreground if session still active

### Deep Link vs Manual Entry
- **Deep link advantage**: Seamless UX, one click from email
- **Manual entry advantage**: Fallback if deep link doesn't work (user always has a token to paste)
- **Best practice**: Email contains both (link + fallback instructions with token)

### Security
- Token is **public** (sent via email) — no authentication required
- Token **expires in 7 days** — backend checks this
- Token is **unique** per invitation (stored in DB)
- Token is **one-time use** (could add `viewedAt` tracking to DB if needed)

---

## 📚 Reference: Android Implementation

For comparison, the Android implementation includes:
- `ObserverLoginViewModel.kt` — Validates token & exposes session ID
- `ObserverLoginScreen.kt` — UI with token input, error handling, loading state
- `ObserverRunSessionScreen.kt` — Maps, polling, waiting/active/finished states
- Deep link in `MainActivity.kt` → routes to `ObserverLoginScreen` with token
- `ApiService.kt` → `getObserveSession(token)` public endpoint

---

## 🚀 Getting Started

1. **Start with Phase 1**: Create ViewModel + View components first
2. **Test locally**: Mock token validation before deep link setup
3. **Then Phase 2**: Register scheme, wire up deep links
4. **Then Phase 3**: Update observer session view with end state
5. **Finally QA**: Test all flows end-to-end with real backend

**Estimated timeline**: 2-3 days (including testing)

---

## 📞 Questions?

Reference this brief + Android code for:
- Exact UI colors (use ColorAsset values, match Android theme)
- Error message wording (use exact text from Android for consistency)
- State machine logic (if/else precedence: finished → waiting → active)
- API response parsing (handle type mismatches, use safe unwrapping)

Good luck! 🎉

