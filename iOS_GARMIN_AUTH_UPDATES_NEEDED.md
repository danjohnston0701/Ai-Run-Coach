# 📱 iOS App Updates Required for Garmin Watch Authentication

## Overview

The Android app has been updated with Garmin watch authentication support. The iOS app needs **similar updates** to maintain feature parity with Android.

---

## Current State

### ✅ What Android Has
1. **GarminWatchManager** service - manages all watch communication
2. **Watch authentication flow** - sends auth token to watch
3. **Real-time metrics streaming** - biometrics from watch
4. **Watch command handling** - start/pause/resume/stop
5. **Phone-controlled runs** - watch uses phone GPS when available

### ❌ What iOS Needs (if it doesn't have it)
1. **ConnectIQ SDK integration** (if not already done)
2. **Watch authentication messaging** (send JWT token to watch)
3. **Real-time metrics reception** (receive HR, cadence, GPS from watch)
4. **Command handling** (send start/pause/stop to watch)
5. **Session management** (link watch metrics to runs)

---

## Garmin Authentication Flow

### What Needs to Happen in iOS

**When user logs in:**

```swift
// 1. User authenticates in iOS app
loginUser(email, password) {
    let token = authResponse.jwtToken  // JWT token from backend
    let userName = authResponse.user.name
    
    // 2. Send token to Garmin watch
    garminWatchManager.sendAuth(token: token, runnerName: userName)
}
```

**Watch receives and stores the token:**
- Watch stores token in persistent storage
- Watch shows "READY" state
- User can start runs

### Message Format

The iOS app needs to send this to the watch:

```json
{
  "type": "auth",
  "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "runnerName": "Daniel Johnston"
}
```

---

## iOS Implementation Checklist

### Phase 1: Setup & Detection

- [ ] **Verify ConnectIQ SDK is installed**
  - Check Podfile has ConnectIQ dependencies
  - If not: `pod install` after adding to Podfile

- [ ] **Create GarminWatchManager for iOS**
  - Similar to Android version
  - Use ConnectIQ iOS SDK to communicate
  - Handle device pairing & discovery

- [ ] **Add watch detection**
  - Detect when Garmin watch is paired
  - Set a flag: `isWatchCompanionInstalled`

### Phase 2: Authentication

- [ ] **Create sendAuth() method**
  - Called when user logs in
  - Sends JWT token + user name to watch
  - Should check if watch is connected first

- [ ] **Handle watch responses**
  - Watch will send "watchReady" when authenticated
  - Parse incoming messages from watch

- [ ] **Persist auth state**
  - Save to iOS Keychain (secure storage)
  - Reuse token on app restart if still valid

### Phase 3: Run Data Handling

- [ ] **Receive runUpdate messages**
  - Watch sends metrics every ~250 ms during run
  - Parse and update UI in real-time
  - Fields: pace, distance, HR, cadence, elapsedTime

- [ ] **Send commands to watch**
  - start, pause, resume, stop
  - Called when user controls run

- [ ] **Handle biometric frames**
  - Watch sends detailed metrics every 2 seconds
  - Include in run summary

### Phase 4: UI Updates

- [ ] **Update Connected Devices screen**
  - Show Garmin watch connection status
  - Similar to Android implementation

- [ ] **Show watch auth prompt**
  - When user logs in, optionally prompt to authenticate watch
  - If watch not connected, show helpful message

- [ ] **Run activity screen**
  - Display metrics from watch in real-time
  - Show current pace, HR, cadence

---

## Code Structure (Swift Example)

### GarminWatchManager.swift

```swift
import ConnectIQ

class GarminWatchManager: NSObject, IQDeviceEventDelegate {
    
    static let shared = GarminWatchManager()
    
    private let sdkInstance = ConnectIQ.sdk()!
    private var pairedWatch: IQDevice?
    var isWatchConnected: Bool = false
    
    // Callbacks
    var onWatchCommand: ((String) -> Void)?
    var onWatchGpsUpdate: ((Double, Double, Double, Double) -> Void)?
    var onWatchSensorData: ((WatchBiometricFrame) -> Void)?
    
    override init() {
        super.init()
        sdkInstance.delegate = self
        sdkInstance.registerForDeviceEvents(self)
    }
    
    // MARK: - Authentication
    
    func sendAuth(token: String, runnerName: String) {
        guard let watch = pairedWatch else {
            print("❌ No paired watch found")
            return
        }
        
        let message: [String: Any] = [
            "type": "auth",
            "authToken": token,
            "runnerName": runnerName
        ]
        
        sendMessageToWatch(message)
        print("✅ Auth token sent to watch")
    }
    
    // MARK: - Commands
    
    func sendCommand(_ action: String) {
        let message: [String: Any] = [
            "type": "command",
            "action": action
        ]
        sendMessageToWatch(message)
    }
    
    func sendRunData(lat: Double, lng: Double, alt: Double, speed: Double, hr: Int, cad: Int) {
        let message: [String: Any] = [
            "type": "gpsUpdate",
            "lat": lat,
            "lng": lng,
            "alt": alt,
            "speed": speed,
            "hr": hr,
            "cad": cad
        ]
        sendMessageToWatch(message)
    }
    
    // MARK: - Private
    
    private func sendMessageToWatch(_ message: [String: Any]) {
        guard let watch = pairedWatch else { return }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: message)
            let jsonString = String(data: jsonData, encoding: .utf8) ?? ""
            
            sdkInstance.sendMessage(
                jsonString,
                to: watch,
                progress: { _ in },
                completed: { status in
                    if status != IQSendMessageStatus.success {
                        print("❌ Failed to send message to watch")
                    }
                }
            )
        } catch {
            print("❌ Error serializing message: \(error)")
        }
    }
    
    // MARK: - Device Delegate
    
    func devicesChanged() {
        sdkInstance.getConnectedDevices { devices in
            self.pairedWatch = devices?.first(where: { $0.deviceIdentifier > 0 })
            self.isWatchConnected = self.pairedWatch != nil
            print("✅ Watch connection status: \(self.isWatchConnected)")
        }
    }
}
```

### LoginViewController.swift

```swift
override func viewDidLoad() {
    super.viewDidLoad()
    // ...
}

func loginUser(email: String, password: String) {
    // Authenticate with backend
    apiClient.login(email: email, password: password) { [weak self] result in
        switch result {
        case .success(let response):
            // Save token
            KeychainManager.save(token: response.jwtToken, for: "authToken")
            
            // Send to watch
            GarminWatchManager.shared.sendAuth(
                token: response.jwtToken,
                runnerName: response.user.fullName
            )
            
            // Update UI
            self?.showConnectedDevicesScreen()
            
        case .failure(let error):
            self?.showError("Login failed: \(error)")
        }
    }
}
```

---

## Feature-by-Feature Comparison

| Feature | Android | iOS | Status |
|---------|---------|-----|--------|
| Watch detection | ✅ GarminWatchManager | Need to verify | ❓ |
| Send auth token | ✅ sendAuth() | Need to implement | ❌ |
| Receive auth confirmation | ✅ watchReady handler | Need to implement | ❌ |
| Send run commands | ✅ sendCommand() | Need to implement | ❌ |
| Receive metrics | ✅ onWatchSensorData | Need to implement | ❌ |
| GPS injection | ✅ injectWatchLocation() | Need to implement | ❌ |
| UI for watch status | ✅ ConnectedDevicesScreen | Need to update | ❌ |
| Session management | ✅ RunTrackingService | Need to update | ❓ |

---

## Priority Checklist for Xcode Agent

### High Priority (Required for Feature Parity)

```
□ Phase 1: Setup & Detection
  □ Verify ConnectIQ SDK is available in iOS project
  □ Create GarminWatchManager.swift if it doesn't exist
  □ Implement device pairing detection
  □ Add isWatchCompanionInstalled property to app state

□ Phase 2: Authentication (CRITICAL)
  □ Implement sendAuth() method
  □ Send JWT token when user logs in
  □ Handle "watchReady" response from watch
  □ Store auth state securely in Keychain
  □ Update login flow to send token to watch

□ Phase 3: Run Data
  □ Add handlers for incoming metrics from watch
  □ Parse runUpdate messages
  □ Parse biometric frame messages
  □ Update RunViewModel with watch metrics
```

### Medium Priority (User Experience)

```
□ Phase 4: UI Updates
  □ Update Settings/Connected Devices screen
  □ Show Garmin watch connection status
  □ Show auth status (authenticated / waiting for auth)
  □ Add prompt to authenticate watch after login (like Android)

□ Phase 5: Run Activity
  □ Display live metrics from watch on active run screen
  □ Show HR, pace, cadence in real-time
  □ Update run summary with watch metrics
```

### Low Priority (Polish)

```
□ Error handling & logging
  □ Log watch disconnections
  □ Log failed auth attempts
  □ Show user-friendly error messages

□ Testing
  □ Test with real Garmin watch
  □ Test with simulator
  □ Test auth token expiry handling
  □ Test watch reconnection
```

---

## Questions for Xcode Agent

Before starting implementation, clarify:

1. **Does iOS already have ConnectIQ SDK integrated?**
   - Check Podfile and imports
   - If not, needs to be added

2. **Is there already a watch manager for iOS?**
   - Check for existing GarminWatchManager or similar
   - If yes, what methods does it have?

3. **What's the current login flow?**
   - Where is authentication happening?
   - Where should we add the "send token to watch" step?

4. **Is there a ConnectedDevicesScreen in iOS?**
   - If yes, where is it and what does it show?
   - If no, where should we add watch status?

5. **What's the watch data model in iOS?**
   - How are metrics stored?
   - What's the RunViewModel structure?

---

## Testing Checklist

Once implemented, test these scenarios:

```
□ Login → Token sent to watch
□ Watch receives token and shows READY
□ Start run → Watch receives start command
□ Metrics flowing from watch to phone
□ Pause/resume commands work
□ Finish run → Watch shows "READY" again
□ Watch disconnected → Graceful fallback
□ Watch reconnected → Can authenticate again
□ Session data includes watch metrics
□ Run summary shows metrics from watch
```

---

## Reference Documents

For complete implementation details, see:
- `GARMIN_COMPANION_BUILD_GUIDE.md` - Complete watch app architecture
- `GARMIN_AUTH_INTEGRATION_FIX.md` - Android auth implementation
- `GARMIN_APPLE_WATCH_PORT_BRIEF.md` - Full port requirements (if doing Apple Watch)

---

## Summary

**iOS needs these updates to match Android:**

1. ✅ Send JWT token to watch when user logs in
2. ✅ Handle watch authentication confirmation
3. ✅ Receive and display live metrics from watch
4. ✅ Send run commands to watch
5. ✅ Show watch connection status in UI
6. ✅ Store metrics in run summary

**Estimated effort**: 2-3 days for Xcode agent
**Complexity**: Medium (depends on existing ConnectIQ integration)
**Risk**: Low (isolated feature, doesn't affect existing runs)

