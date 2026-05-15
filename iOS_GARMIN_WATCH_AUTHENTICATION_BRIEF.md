# 🔐 iOS Garmin Watch Authentication Flow Brief

## The Problem We Solved

**Original Bug:** Watch app was stuck on "Open phone app to login" screen even after user logged in on phone.

**Root Cause:** Authentication token was sent once on app startup via `onWatchAppReady`, but if user logged in **after** that event, the watch never received the auth token.

**Fix:** Send auth token to watch **immediately after successful login** in addition to the startup trigger.

---

## 🔄 The Complete Authentication Flow (Android Reference)

### **Flow Diagram**

```
PHONE APP STARTUP
    ↓
MainActivity.onCreate()
    ↓
initGarminWatchBridge()
    ↓
GarminWatchManager.initialize()
    ↓
ConnectIQ SDK connects to watch
    ↓
onWatchAppReady callback fires
    ↓
SessionManager.getAuthToken()  ← Get stored JWT
    ↓
garminWatchManager.sendAuth(token, userName)
    ↓
WATCH RECEIVES "auth" MESSAGE
    ↓
onPhoneMessage() handler
    ↓
type == "auth" check
    ↓
Save token to storage
    ↓
_isAuthenticated = true
    ↓
WATCH TRANSITIONS TO "READY" SCREEN
    ↓
User can start run


SEPARATE FLOW: USER LOGS IN
    ↓
LoginViewModel.login()
    ↓
API call succeeds
    ↓
SessionManager.saveAuthToken(token)
    ↓
SessionManager.saveUserData(user)
    ↓
GarminWatchManager.sendAuth(token, userName)  ← IMMEDIATELY AFTER LOGIN
    ↓
WATCH RECEIVES "auth" MESSAGE
    ↓
onPhoneMessage() handler
    ↓
type == "auth" check
    ↓
Save token to storage
    ↓
_isAuthenticated = true
    ↓
WATCH TRANSITIONS FROM "WAITING" TO "READY"
```

---

## 📱 iOS Implementation Requirements

### **1. Watch Companion Communication (Garmin Watch Side)**

**Watch File:** `RunView.mc` (no changes needed)

**Current Watch Implementation:**
```
- Watch registers PhoneLink message handler: method(:onPhoneMessage)
- Receives messages with "type" field
- For type == "auth":
  * Extracts "authToken" field
  * Extracts "runnerName" field
  * Stores authToken to App.Storage
  * Sets _isAuthenticated = true
  * Transitions overlay from "WAITING" to "READY"
```

**Watch Message Format:**
```
{
  "type": "auth",
  "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "runnerName": "John Doe"
}
```

---

### **2. iPhone App: Two Trigger Points for Auth**

#### **Trigger 1: App Startup (When Already Logged In)**

**File:** `AppDelegate.swift` or equivalent startup location

**What Happens:**
1. App launches
2. Initialize Garmin Connection Manager
3. Set up `onWatchAppReady` callback
4. ConnectIQ SDK connects and fires `onWatchAppReady`
5. Retrieve stored JWT from KeyChain
6. If token exists, immediately call `garminConnectionManager.sendAuth(token: String, runnerName: String)`

**Pseudocode:**
```swift
// In app startup (SceneDelegate or AppDelegate)
func setupGarminConnection() {
    garminConnectionManager.onWatchAppReady = {
        // Watch app is now listening
        let token = KeychainManager.getAuthToken()
        let name = UserDefaults.standard.string(forKey: "userName") ?? ""
        
        if let token = token, !token.isEmpty {
            self.garminConnectionManager.sendAuth(token: token, runnerName: name)
            print("✅ Auth sent to watch on app startup")
        } else {
            print("ℹ️ Watch ready but user not logged in")
        }
    }
    garminConnectionManager.initialize()
}
```

#### **Trigger 2: Immediately After Login**

**File:** `LoginViewController.swift` or `LoginViewModel` (MVVM)

**What Happens:**
1. User enters credentials and taps "Login"
2. API request to `/api/auth/login` succeeds
3. JWT received and stored to Keychain
4. User data saved to UserDefaults
5. **IMMEDIATELY CALL** `garminConnectionManager.sendAuth(token, userName)` (before navigating away)
6. Watch receives "auth" message and transitions to "Ready" screen
7. Then navigate to dashboard

**Pseudocode:**
```swift
// In LoginViewController or LoginViewModel
func loginUser(email: String, password: String) {
    isLoading = true
    
    APIClient.login(email: email, password: password) { [weak self] result in
        switch result {
        case .success(let response):
            // Save credentials
            KeychainManager.save(token: response.authToken)
            UserDefaults.standard.set(response.user.name, forKey: "userName")
            UserDefaults.standard.set(response.user.email, forKey: "userEmail")
            
            self?.isLoading = false
            
            // 🔑 CRITICAL: Send auth to watch IMMEDIATELY
            do {
                try self?.garminConnectionManager.sendAuth(
                    token: response.authToken,
                    runnerName: response.user.name
                )
                print("⌚ Auth token pushed to Garmin watch after login")
            } catch {
                print("⚠️ Could not push auth to watch (may not be connected): \(error.message)")
                // Don't block login — watch may reconnect later
            }
            
            // Navigate to dashboard
            self?.navigateToDashboard()
            
        case .failure(let error):
            self?.isLoading = false
            self?.errorMessage = error.localizedDescription
        }
    }
}
```

---

### **3. GarminConnectionManager (iOS Equivalent)**

**Create:** `GarminConnectionManager.swift`

**Responsibilities:**
- Communicate with Garmin ConnectIQ SDK
- Send messages to watch
- Handle watch callbacks
- Manage connection state

**Key Methods:**
```swift
class GarminConnectionManager {
    var onWatchAppReady: (() -> Void)?
    
    func initialize() {
        // Initialize ConnectIQ SDK
        // Register watch app connection listener
        // Setup callbacks
    }
    
    func sendAuth(token: String, runnerName: String) throws {
        let message: [String: Any] = [
            "type": "auth",
            "authToken": token,
            "runnerName": runnerName
        ]
        try sendToWatch(message: message)
    }
    
    func sendRunUpdate(pace: Double, distance: Double, heartRate: Int, 
                       elapsedSeconds: Int, cadence: Int, isRunning: Bool, isPaused: Bool) {
        let message: [String: Any] = [
            "type": "runUpdate",
            "pace": pace,
            "distance": distance,
            "hr": heartRate,
            "elapsedTime": elapsedSeconds,
            "cadence": cadence,
            "isRunning": isRunning,
            "isPaused": isPaused
        ]
        try? sendToWatch(message: message)
    }
    
    private func sendToWatch(message: [String: Any]) throws {
        // Send via ConnectIQ SDK
    }
}
```

---

### **4. SessionManager / KeychainManager (iOS)**

**File:** `KeychainManager.swift` or extend `SessionManager`

**Responsibilities:**
- Store/retrieve JWT from secure Keychain
- Store user name/email in UserDefaults
- Check if user is logged in

**Key Methods:**
```swift
class KeychainManager {
    static func save(token: String) throws {
        // Store to Keychain securely
    }
    
    static func getAuthToken() -> String? {
        // Retrieve from Keychain
        // Return nil if not found or expired
    }
    
    static func clearAuthToken() {
        // Delete from Keychain on logout
    }
}
```

---

### **5. Watch Callback Handler (Already Exists)**

**Watch File:** `RunView.mc` (Lines 276-346)

**Current Implementation Handles:**
- `type: "auth"` → Save token, set `_isAuthenticated = true`, show "Ready" screen
- `type: "preparedRun"` → Load workout details
- `type: "disconnect"` → Mark watch as disconnected
- `type: "runUpdate"` → Update pace/distance/HR during run
- `type: "statusMessage"` → Show brief message
- `type: "coachingCue"` → Brief vibration alert
- `type: "sessionEnded"` → Mark run complete

**iOS doesn't need to change watch code** — the watch is already set up correctly.

---

## 🔄 Two-Scenario Test Plan

### **Scenario 1: Already Logged In → Open App**

1. User previously logged in (token in Keychain)
2. Kill app completely
3. Reopen app
4. App starts up
5. `initGarminConnection()` runs
6. `onWatchAppReady` fires
7. `getAuthToken()` returns stored JWT
8. `sendAuth()` is called
9. Watch receives "auth" and transitions to "Ready"
10. ✅ User can immediately start a run

### **Scenario 2: Not Logged In → User Logs In**

1. User opens app (not logged in)
2. Tap "Login"
3. Enter email/password
4. Tap "Login" button
5. API request succeeds
6. JWT saved to Keychain
7. **`sendAuth()` called immediately**
8. Watch receives "auth" and transitions from "Waiting" to "Ready"
9. ✅ Watch is ready (don't need to restart watch app)
10. Navigate to dashboard

---

## ⚠️ Key Differences from Android

| Aspect | Android | iOS |
|--------|---------|-----|
| **Secure Storage** | SharedPreferences (encrypted) | Keychain |
| **Connection Manager** | `GarminWatchManager.kt` | `GarminConnectionManager.swift` |
| **Session Manager** | `SessionManager.kt` | KeychainManager + UserDefaults |
| **Login Flow** | `LoginViewModel` | LoginViewController or ViewModel |
| **Startup Flow** | `MainActivity.onCreate()` | SceneDelegate or AppDelegate |

---

## 📋 Implementation Checklist

- [ ] Create `GarminConnectionManager.swift` with ConnectIQ SDK integration
- [ ] Create `KeychainManager.swift` for secure token storage
- [ ] In app startup, set up `onWatchAppReady` callback
- [ ] In login success handler, immediately call `sendAuth(token, userName)`
- [ ] Verify watch receives auth message (watch logs: "Auth received — overlayState=...")
- [ ] Test Scenario 1: Already logged in → reopen app → watch shows "Ready"
- [ ] Test Scenario 2: Login fresh → watch shows "Ready" immediately
- [ ] Test failure case: No watch connected → catch exception, don't block login
- [ ] Test logout: Call `clearAuthToken()` and watch should show "Waiting" again

---

## 🚨 Critical Points

1. **Send auth IMMEDIATELY after login success** — don't wait for next SDK event
2. **Wrap in try-catch** — watch may not be connected (non-fatal)
3. **Use Keychain** — not UserDefaults, for JWT security
4. **No hardcoded tokens** — always retrieve from storage before sending
5. **Check token exists** — before calling `sendAuth()` on app startup
6. **Handle disconnection** — if watch disconnects and reconnects, re-send auth via `onWatchAppReady`

---

## 📄 Message Format Reference

### Auth Message (From Phone → Watch)
```json
{
  "type": "auth",
  "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "runnerName": "John Doe"
}
```

### Run Update Message (From Phone → Watch During Run)
```json
{
  "type": "runUpdate",
  "pace": 300.5,
  "distance": 1500.0,
  "hr": 165,
  "elapsedTime": 300,
  "cadence": 175,
  "isRunning": true,
  "isPaused": false
}
```

### Prepared Run Message (From Phone → Watch Before Run)
```json
{
  "type": "preparedRun",
  "distance": 10000.0,
  "runType": "easy",
  "workoutType": "base_run",
  "targetPace": "5:30",
  "workoutDesc": "Easy 10k run in Zone 2"
}
```

---

## 🔍 Debugging Tips

**On Watch, logs are printed to debug console:**
```
"Auth received — overlayState=OVERLAY_READY"
"Watch app ready — sending auth token to watch"
"Could not push auth to watch (watch may not be connected)"
```

**On iPhone, log key events:**
```swift
print("⌚ Watch app ready callback triggered")
print("🔑 Auth token: \(token.prefix(20))...")
print("✅ Auth sent to watch")
print("❌ Auth send failed: \(error)")
```

**Monitor Keychain:**
```swift
let token = try KeychainManager.getAuthToken()
print("Token in Keychain: \(token != nil)")
```

---

## ✅ Success Criteria

✅ User logs in → watch transitions from "Waiting" to "Ready" immediately
✅ App restarts while logged in → watch shows "Ready" without manual action
✅ Watch disconnects → reconnects → receives auth automatically
✅ No hardcoded tokens anywhere in code
✅ All auth tokens stored securely in Keychain
✅ Logout clears token from Keychain and watch sees it

