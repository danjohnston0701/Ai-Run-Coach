# iOS Garmin Watch Integration Brief

## Overview

The Garmin watch app (`AiRunCoach_v2.4.6.iq`) works identically on iOS and Android — it is the **same `.iq` file** installed from the Connect IQ Store. The watch makes HTTP requests **directly to the backend** (`https://airuncoach.live`) via `Comm.makeWebRequest`, which routes through the **Garmin Connect Mobile app on iOS** as the internet relay. No data passes through the iOS app itself.

The iOS app's role is:

1. Send the user's auth token + runner name to the watch (so it can authenticate with the backend)
2. Send run configuration to the watch (coached run type, target pace, distance)
3. Receive control commands from the watch (start, pause, resume, stop, watchReady)
4. Send live run metrics to the watch during a phone-controlled run
5. Trigger the offline batch upload by sending auth when the watch reconnects after a phone-less run

---

## 1. SDK Setup

Install the **Garmin ConnectIQ Mobile SDK for iOS** via CocoaPods or Swift Package Manager.

**CocoaPods:**
```ruby
pod 'ConnectIQ'
```

**Swift Package Manager:**
`https://github.com/garmin/connectiq-apple-sdk`

**Import in all Garmin-related files:**
```swift
import ConnectIQ
```

**Watch App UUID** — must match `manifest.xml` in the companion watch app:
```swift
static let APP_UUID = UUID(uuidString: "C7BF12555C184F9FB1F82B49E72E20A2")!
```

---

## 2. Info.plist — URL Scheme Registration

The ConnectIQ SDK requires a custom URL scheme to return control to your app after opening Garmin Connect. Add this to `Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>airuncoachgarmin</string>
        </array>
    </dict>
</array>
```

Handle the callback in `AppDelegate` or `SceneDelegate`:

```swift
// AppDelegate
func application(_ app: UIApplication, open url: URL,
                 options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    ConnectIQ.sharedInstance()?.handleOpenURL(url)
    return true
}

// SceneDelegate (if using scenes)
func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for ctx in URLContexts {
        ConnectIQ.sharedInstance()?.handleOpenURL(ctx.url)
    }
}
```

---

## 3. GarminWatchManager

Create a `GarminWatchManager` singleton. This mirrors the Android `GarminWatchManager.kt` exactly.

```swift
import ConnectIQ
import Combine

class GarminWatchManager: NSObject, ObservableObject,
                          IQDeviceEventDelegate,
                          IQApplicationEventDelegate {

    static let shared = GarminWatchManager()

    // MARK: - Published State
    @Published var isWatchConnected        = false
    @Published var isCompanionAppInstalled = false

    // MARK: - Callbacks (set by the active run screen / view model)
    var onWatchCommand:    ((String) -> Void)?
    var onWatchSensorData: ((WatchBiometricFrame) -> Void)?
    var onWatchAppReady:   (() -> Void)?

    // MARK: - Private
    private var connectedDevice: IQDevice?
    private var iqApp: IQApp?

    static let APP_UUID             = UUID(uuidString: "C7BF12555C184F9FB1F82B49E72E20A2")!
    static let PREF_WATCH_VERSION   = "garmin_watch_installed_version"

    // MARK: - Lifecycle

    func initialize() {
        ConnectIQ.sharedInstance()?.initialize(withUrlScheme: "airuncoachgarmin",
                                               uiOverrideDelegate: nil)
        // Register for events on all already-known devices
        let knownDevices = ConnectIQ.sharedInstance()?.knownDevices() as? [IQDevice] ?? []
        for device in knownDevices {
            ConnectIQ.sharedInstance()?.register(forDeviceEvents: device, delegate: self)
            let status = ConnectIQ.sharedInstance()?.getDeviceStatus(device)
            if status == .connected {
                connectedDevice = device
                isWatchConnected = true
                resolveApp(device)
            }
        }
    }

    func shutdown() {
        if let device = connectedDevice {
            ConnectIQ.sharedInstance()?.unregister(forDeviceEvents: device, delegate: self)
        }
        isWatchConnected        = false
        isCompanionAppInstalled = false
        connectedDevice = nil
        iqApp           = nil
    }

    func getConnectedDeviceName() -> String? {
        connectedDevice?.friendlyName
    }

    func getInstalledWatchVersion() -> String? {
        UserDefaults.standard.string(forKey: Self.PREF_WATCH_VERSION)
    }

    // MARK: - IQDeviceEventDelegate

    func deviceStatusChanged(_ device: IQDevice, status: IQDeviceStatus) {
        let connected = status == .connected
        DispatchQueue.main.async {
            self.isWatchConnected = connected
        }
        if connected {
            connectedDevice = device
            resolveApp(device)
        } else {
            iqApp = nil
            DispatchQueue.main.async { self.isCompanionAppInstalled = false }
        }
    }

    // MARK: - Private App Resolution

    private func resolveApp(_ device: IQDevice) {
        ConnectIQ.sharedInstance()?.getAppInfo(Self.APP_UUID, on: device) { [weak self] app in
            guard let self = self else { return }
            if let app = app {
                self.iqApp = app
                DispatchQueue.main.async { self.isCompanionAppInstalled = true }
                self.registerForMessages(device, app: app)
            } else {
                DispatchQueue.main.async { self.isCompanionAppInstalled = false }
            }
        }
    }

    private func registerForMessages(_ device: IQDevice, app: IQApp) {
        ConnectIQ.sharedInstance()?.register(forAppMessages: app, delegate: self)
        print("GarminWatchManager: watch app ready — firing onWatchAppReady")
        onWatchAppReady?()
    }

    // MARK: - Send to Watch

    private func sendToWatch(_ payload: [String: Any]) {
        guard let device = connectedDevice, let app = iqApp else { return }
        ConnectIQ.sharedInstance()?.sendMessage(payload, to: app, on: device, progress: nil) { status in
            print("GarminWatchManager sendToWatch: \(status.rawValue)")
        }
    }

    // MARK: - IQApplicationEventDelegate (Watch → Phone)

    func receivedMessage(_ message: Any, from app: IQApp) {
        guard let outer = message as? [Any],
              let data   = outer.first as? [String: Any],
              let type   = data["type"] as? String else { return }

        switch type {
        case "hello":
            if let version = data["appVersion"] as? String {
                UserDefaults.standard.set(version, forKey: Self.PREF_WATCH_VERSION)
                print("GarminWatchManager: watch app version = \(version)")
            }
        case "command":
            if let action = data["action"] as? String {
                print("GarminWatchManager: watch command = \(action)")
                onWatchCommand?(action)
            }
        case "watchData":
            if let lat = data["lat"] as? Double, let lng = data["lng"] as? Double {
                // Use superior Garmin GPS for location tracking during phone-controlled run
                _ = lat; _ = lng
            }
            let frame = parseWatchData(data)
            onWatchSensorData?(frame)
        default:
            break
        }
    }

    // MARK: - Parse biometric frame

    private func parseWatchData(_ d: [String: Any]) -> WatchBiometricFrame {
        func dbl(_ k: String) -> Double?  { (d[k] as? NSNumber)?.doubleValue }
        func flt(_ k: String) -> Float    { (d[k] as? NSNumber)?.floatValue  ?? 0 }
        func int(_ k: String) -> Int      { (d[k] as? NSNumber)?.intValue    ?? 0 }
        return WatchBiometricFrame(
            elapsedSeconds:           int("elap"),
            lat:                      dbl("lat"),   lng: dbl("lng"),
            altMetres:                dbl("alt"),
            speedMs:                  (d["speed"] as? NSNumber)?.floatValue,
            bearingDeg:               (d["bear"]  as? NSNumber)?.floatValue,
            gpsAccuracy:              (d["acc"]   as? NSNumber)?.floatValue,
            heartRate:                int("hr"),    heartRateZone: int("hrz"),
            cadence:                  int("cad"),
            groundContactTime:        flt("gct"),   groundContactBalance: flt("gcb"),
            verticalOscillation:      flt("vo"),    verticalRatio:        flt("vr"),
            strideLength:             flt("sl"),
            aerobicTrainingEffect:    flt("te"),    anaerobicTrainingEffect: flt("ate"),
            recoveryTimeMinutes:      int("rt"),    vo2MaxEstimate:          flt("vo2"),
            runningPower:             int("pwr"),   respirationRate:         flt("resp"),
            ambientPressure:          flt("pres")
        )
    }
}
```

---

## 4. WatchBiometricFrame Model

```swift
struct WatchBiometricFrame {
    let elapsedSeconds: Int

    // GPS
    let lat: Double?, lng: Double?, altMetres: Double?
    let speedMs: Float?, bearingDeg: Float?, gpsAccuracy: Float?

    // Biometrics
    let heartRate: Int          // bpm
    let heartRateZone: Int      // 1–5
    let cadence: Int            // steps per minute

    // Running Dynamics (0 if unsupported on device)
    let groundContactTime: Float        // ms   — 200–300 ms normal
    let groundContactBalance: Float     // %    — 50 = perfect symmetry
    let verticalOscillation: Float      // cm   — 6–8 cm efficient
    let verticalRatio: Float            // %    — 8–10% efficient
    let strideLength: Float             // m per stride

    // Training Effect
    let aerobicTrainingEffect: Float    // 0–5
    let anaerobicTrainingEffect: Float  // 0–5
    let recoveryTimeMinutes: Int        // minutes until fully recovered
    let vo2MaxEstimate: Float           // ml/kg/min

    // Power & Respiration (device-dependent — 0 if unsupported)
    let runningPower: Int               // watts (Fenix 7 / FR965 with Running Power)
    let respirationRate: Float          // breaths/min (Fenix 7 series)
    let ambientPressure: Float          // Pa (~101325 at sea level)
}
```

---

## 5. Phone → Watch Messages

Call these on `GarminWatchManager.shared` at the appropriate times:

### Auth — send immediately when `onWatchAppReady` fires

This is the most important call. The watch **cannot make any backend requests** until it receives the auth token. It also uses this message to trigger any pending offline batch upload.

```swift
extension GarminWatchManager {
    func sendAuth(authToken: String, runnerName: String) {
        sendToWatch(["type": "auth", "authToken": authToken, "runnerName": runnerName])
    }
}
```

**When to call:** Immediately when `onWatchAppReady` fires, and again any time the app reconnects (app foregrounded with watch nearby).

### Prepared Run — send before a coached run

```swift
func sendPreparedRun(distanceKm: Float, runType: String,
                     workoutType: String? = nil,
                     workoutDesc: String? = nil,
                     targetPace: String? = nil) {
    var payload: [String: Any] = [
        "type":     "preparedRun",
        "distance": distanceKm,
        "runType":  runType         // "route" | "free" | "training"
    ]
    if let wt = workoutType { payload["workoutType"] = wt }  // "easy" | "tempo" | "intervals"
    if let wd = workoutDesc { payload["workoutDesc"] = wd }
    if let tp = targetPace  { payload["targetPace"]  = tp }  // e.g. "5:30"
    sendToWatch(payload)
}
```

### Run Update — send every ~1 second during a phone-controlled run

```swift
func sendRunUpdate(paceSecPerKm: Double, distanceMetres: Double,
                   heartRate: Int, elapsedSeconds: Int,
                   cadence: Int, isRunning: Bool, isPaused: Bool) {
    sendToWatch([
        "type":        "runUpdate",
        "pace":        paceSecPerKm,
        "distance":    distanceMetres,
        "hr":          heartRate,
        "elapsedTime": elapsedSeconds,
        "cadence":     cadence,
        "isRunning":   isRunning,
        "isPaused":    isPaused
    ])
}
```

### Session Ended — send when run finishes

```swift
func sendSessionEnded() {
    sendToWatch(["type": "sessionEnded"])
}
```

---

## 6. Watch → Phone Commands

The `onWatchCommand` callback fires when the watch sends a `"command"` message. Handle these actions in your run view model / run screen:

| Action | Meaning |
|---|---|
| `"start"` | User pressed START on the watch — begin the run |
| `"pause"` | User pressed pause on the watch |
| `"resume"` | User pressed resume on the watch |
| `"stop"` | User pressed STOP on the watch — end the run |
| `"watchReady"` | Watch has GPS lock and is ready to start |
| `"sessionReady"` | Watch is authenticated + GPS locked — trigger push notification |

---

## 7. Backend Authentication

The watch uses the **user's standard login JWT** as its bearer token. The iOS app sends this token to the watch via `sendAuth()`. All watch → backend HTTP requests use:

```
Authorization: Bearer <user_jwt>
```

The `companionAuthMiddleware` on the backend accepts any valid JWT with a `userId` claim. No special companion token is required — just the user's existing login token.

---

## 8. Backend Endpoints

All endpoints are live at `https://airuncoach.live`. The watch calls most of these directly. The iOS app only needs to call the two polling/coaching endpoints during a run.

| Method | Endpoint | Called by | Purpose |
|---|---|---|---|
| `POST` | `/api/garmin-companion/session/start` | Watch | Creates session record when run starts |
| `POST` | `/api/garmin-companion/data` | Watch | Streams 1 data point/second during run |
| `POST` | `/api/garmin-companion/data/batch` | Watch | Batch upload fallback |
| `POST` | `/api/garmin-companion/session/status` | Watch | Pause / resume |
| `POST` | `/api/garmin-companion/session/end` | Watch | Ends run → creates permanent run record |
| `POST` | `/api/garmin-companion/session/:id/upload-batch` | Watch | **Offline batch upload** for phone-less runs |
| `GET` | `/api/live-session/metrics` | **iOS app** | Poll latest metrics every 3s during run |
| `POST` | `/api/live-session/cue` | **iOS app** | Send AI coaching cue to active session |

### Polling metrics during a run

```swift
// Poll every 3 seconds while a run is active
func pollLiveMetrics(sessionId: String) async {
    let url = URL(string: "https://airuncoach.live/api/live-session/metrics?sessionId=\(sessionId)")!
    // Standard authenticated GET — include Authorization: Bearer <user_jwt>
    // Response includes: heartRate, pace, distance, cadence, elapsedTime, etc.
}
```

### Sending a coaching cue

```swift
func sendCoachingCue(sessionId: String, cue: String) async {
    // POST to /api/live-session/cue
    // Body: { "sessionId": "...", "cue": "Great pace, keep it up!" }
    // The next watch data POST response from the backend will piggyback this cue
    // to the watch, which displays it as a status overlay
}
```

---

## 9. Offline Buffer Feature (Phone-Free Runs — 90 Min)

### How it works

When the user runs **without their phone**, the watch:

1. Detects no phone connection (`_isConnected = false`)
2. Shows an amber **"OFFLINE - 90min charts"** notice on the watch face
3. Buffers a data point every **15 seconds** — capped at **360 points (90 minutes)**
4. At 90 minutes, shows **"Chart buffer full - 90min"** alert and stops buffering (the run continues normally)
5. At run end, saves the buffer to `Application.Storage` with the session ID
6. When the phone app **next sends auth**, the watch automatically uploads the batch to `/api/garmin-companion/session/:sessionId/upload-batch`
7. The backend patches the existing run record with full chart data: GPS route, HR series, pace series, altitude profile, cadence series, km splits

### What the iOS app needs to do

**Nothing special is required** — the watch handles the upload automatically after receiving `sendAuth()`. However:

1. **Always call `sendAuth()` immediately** when `onWatchAppReady` fires — this triggers the pending upload if one exists
2. After sending auth, **wait ~3 seconds** then refresh the run history list so the newly populated charts appear

```swift
// In your onWatchAppReady handler:
garminWatchManager.onWatchAppReady = { [weak self] in
    guard let token = self?.authToken, let name = self?.userName else { return }
    GarminWatchManager.shared.sendAuth(authToken: token, runnerName: name)

    // Refresh run history after a delay to show newly uploaded offline charts
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
        self?.refreshRunHistory()
    }
}
```

---

## 10. Connected Devices Screen — Garmin Watch Card

Mirror the Android card exactly. All UI text and structure is specified below.

### Assets Required

- **"Available on Connect IQ" badge** — download from [developer.garmin.com](https://developer.garmin.com) (Connect IQ brand guidelines). Save as `available_connect_iq_badge` in your asset catalogue.

### Card Structure

```
┌─────────────────────────────────────────────────────┐
│  [Available on Connect IQ logo — full width]         │
│                                                       │
│  Download from Connect IQ Store        ★ FREE        │
│                                                       │
│  "Install the Ai Run Coach companion app on your     │
│  Garmin watch. Run with your phone for live coaching │
│  and full charts, or leave it at home — the watch    │
│  buffers your run and uploads everything when you're  │
│  back in range."                                      │
│                                                       │
│  [23+ Biometric Sensors]  [Personal HR Zones]        │
���  [Advanced Running Metrics] [Real-Time Coaching]     │
│  [Phone-Free Runs (90 min)]                          │
│                                                       │
│  ✅ (green) With phone: live coaching, full charts   │
│             & unlimited run length.                   │
│                                                       │
│  ⚠️ (amber) Without phone: GPS route, heart rate &  │
│             pace charts buffered for up to 90        │
│             minutes. Data uploads automatically when  │
│             you open the app after your run.         │
│                                                       │
│  [        Get Watch App        ]  ← primary button   │
└─────────────────────────────────────────────────────┘
```

**"Get Watch App" button** opens:
```
https://apps.garmin.com/apps/C7BF12555C184F9FB1F82B49E72E20A2
```

---

## 11. Watch App Version Update Screen

The watch reports its installed version via the `hello` message (`data["appVersion"]`). Store in `UserDefaults` as `garmin_watch_installed_version`. Compare against the current published version (`2.4.6`) and show an update prompt if outdated. The update screen should deep-link to the Connect IQ Store page above.

---

## 12. Android vs iOS Differences

| | Android | iOS |
|---|---|---|
| **SDK** | `com.garmin.connectiq:ciq-companion-app-sdk:2.3.0` | `ConnectIQ` via CocoaPods / SPM |
| **Singleton** | `ConnectIQ.getInstance(ctx, WIRELESS)` | `ConnectIQ.sharedInstance()` |
| **URL scheme** | AndroidManifest intent-filter | `Info.plist` CFBundleURLSchemes |
| **Callback** | `onNewIntent()` | `application(_:open:options:)` |
| **Send message** | `connectIQ.sendMessage(device, app, payload, listener)` | `connectIQ.sendMessage(payload, to:app, on:device, progress:nil, completion:)` |
| **Receive messages** | `IQApplicationEventListener.onMessageReceived()` | `IQApplicationEventDelegate.receivedMessage(_:from:)` |
| **Device events** | `IQDeviceEventListener.onDeviceStatusChanged()` | `IQDeviceEventDelegate.deviceStatusChanged(_:status:)` |
| **App resolve** | `getApplicationInfo(appId, device, listener)` | `getAppInfo(uuid, on:device, completion:)` |

Everything else — session IDs, message type strings, payload key names, endpoint paths, auth token format, the offline buffer logic — is **identical** to Android.

---

## 13. Prerequisite — Garmin Connect App

The Garmin ConnectIQ SDK requires **Garmin Connect Mobile** to be installed on the user's iPhone. It acts as the Bluetooth bridge and internet relay for watch HTTP requests. If Garmin Connect is not installed, `onWatchAppReady` will never fire. Show a prompt directing the user to install Garmin Connect from the App Store if `isWatchConnected` remains false after initialization.
