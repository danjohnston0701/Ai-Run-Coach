# iOS Brief: Garmin Watch Metric Parity Fixes

## Purpose

Replicate the Android Garmin watch-session fixes in the iOS Xcode app. These
changes prevent a watch-started session from mixing two independent GPS tracks,
stop delayed Connect IQ frames from moving totals backwards, make pace labels
truthful, and retain the user-selected `run` or `walk` session type through
upload and offline retry.

The Garmin companion watch app now sends these values in every `watchData`
frame:

| Key | Type | Meaning |
| --- | --- | --- |
| `dist` | number | Garmin `Activity.Info.elapsedDistance` in **metres** |
| `elap` | number | Garmin `Activity.Info.timerTime / 1000` in **seconds**, excluding paused time |
| `lat`, `lng`, `speed` | number | Watch location and instantaneous speed |

`dist` and `elap` are authoritative only for a session initiated on the watch.
For an iPhone-initiated session, Core Location remains the owner of distance and
duration.

---

## 1. Add the Garmin cumulative distance to the received frame

Update the `WatchBiometricFrame` from `iOS_GARMIN_INTEGRATION_BRIEF.md`:

```swift
struct WatchBiometricFrame {
    let elapsedSeconds: Int
    let cumulativeDistanceM: Double? // NEW: Garmin elapsedDistance, metres

    let lat: Double?
    let lng: Double?
    let altMetres: Double?
    let speedMs: Float?
    let bearingDeg: Float?
    let gpsAccuracy: Float?

    // Keep all existing biometric fields unchanged.
}
```

Parse `dist` as optional. Its absence must remain supported because an older
watch build may not send it:

```swift
private func parseWatchData(_ data: [String: Any]) -> WatchBiometricFrame {
    func double(_ key: String) -> Double? {
        (data[key] as? NSNumber)?.doubleValue
    }

    // Keep every existing initializer argument unchanged. Add only:
    return WatchBiometricFrame(
        cumulativeDistanceM: double("dist"),
        // ... existing fields, including elapsedSeconds: int("elap")
    )
}
```

Do **not** translate `0` to a valid distance or timer. It is the normal initial
value before the watch activity has accumulated meaningful data.

---

## 2. Mark watch ownership before starting the local session

When the watch sends its `"start"` command, set the origin flag before starting
location tracking. This prevents early iPhone GPS fixes from polluting the
watch-owned total while the first watch frame is in flight.

```swift
private var wasSessionStartedByWatch = false
private var lastWatchLocationReceivedAt: Date?

func handleWatchCommand(_ action: String) {
    switch action {
    case "start":
        wasSessionStartedByWatch = true
        lastWatchLocationReceivedAt = Date()
        startTracking()
    case "pause":
        pauseTracking()
    case "resume":
        resumeTracking()
    case "stop":
        stopTracking()
    default:
        break
    }
}
```

At `startTracking()`:

- Reset `acceptedWatchDistanceM` and `watchElapsedSeconds` to zero.
- **Do not** clear `wasSessionStartedByWatch`.
- **Do not** clear `lastWatchLocationReceivedAt` for a watch-started session.
- For an iPhone-started session, reset the flag to `false` and clear the
  watch-location timestamp.

Suppress iPhone `CLLocation` distance accumulation while recent Garmin location
is streaming. Android uses a 15-second window:

```swift
private let watchLocationFreshness: TimeInterval = 15

private var shouldIgnorePhoneLocation: Bool {
    guard wasSessionStartedByWatch,
          let lastWatchLocationReceivedAt else { return false }
    return Date().timeIntervalSince(lastWatchLocationReceivedAt) < watchLocationFreshness
}
```

If `shouldIgnorePhoneLocation` is true, do not append the phone location to the
route or add its segment distance. Watch locations can still be saved to the
route for the watch-owned session.

---

## 3. Accept only valid, monotonic Garmin totals

Connect IQ Bluetooth messages can be queued and delivered out of order. Never
allow a stale frame to reduce distance, elapsed time, or average pace.

```swift
private var acceptedWatchDistanceM: Double = 0
private var watchElapsedSeconds: Int = 0

func processWatchFrame(_ frame: WatchBiometricFrame) {
    guard isTracking else { return }

    if wasSessionStartedByWatch {
        if let distance = frame.cumulativeDistanceM,
           distance.isFinite,
           distance > 5,                 // startup GPS noise floor
           distance >= acceptedWatchDistanceM {
            acceptedWatchDistanceM = distance
            totalDistanceM = distance    // authoritative correction
        }

        // timerTime excludes pauses; only accept newer values.
        if frame.elapsedSeconds > watchElapsedSeconds {
            watchElapsedSeconds = frame.elapsedSeconds
        }
    }

    // Continue to process valid HR/cadence/dynamics below.
}
```

**Important:** compare incoming `distance` with `acceptedWatchDistanceM`, not
the current `totalDistanceM`. A transient fallback iPhone location must not
prevent the next valid Garmin cumulative total from correcting the session.

For a watch-owned session, derive visible and persisted duration from the
Garmin timer once a positive value has been received:

```swift
var activeDurationMs: Int64 {
    if wasSessionStartedByWatch && watchElapsedSeconds > 0 {
        return Int64(watchElapsedSeconds) * 1_000
    }
    return phoneDurationExcludingPausesMs
}
```

If no valid `dist`/`elap` arrives (older watch app, disconnected bridge), retain
the iPhone fallback rather than replacing a real total with zero or `nil`.

---

## 4. Handle current pace and average pace as separate values

Definitions:

- **Current pace**: derived from current watch speed; it may be unavailable
  while stopped or during GPS acquisition.
- **Average pace**: `activeDuration / cumulativeDistance`; it is valid after
  meaningful distance and duration exist.

Never present average pace under a current-pace label.

```swift
let currentPaceText: String = {
    guard let currentPace,
          currentPace != "0:00",
          currentPace != "–" else { return "--" }
    return currentPace
}()

let averagePaceText: String = {
    guard let averagePace, averagePace != "0:00" else { return "--" }
    return averagePace
}()

let notificationBody =
    String(format: "D: %.2f km | P: %@/km | Avg: %@/km | T: %@",
           totalDistanceM / 1_000,
           currentPaceText,
           averagePaceText,
           formattedDuration)
```

For current pace, do not manufacture a value from the separate iPhone GPS
track during a watch-owned session. Use Garmin `speed` when valid; otherwise
show `--`. Average pace remains available independently.

---

## 5. Use the selected session type everywhere

The persisted activity is exactly one of:

```swift
enum SessionType: String, Codable {
    case run
    case walk
}
```

Carry it from the setup screen into the active session, local persistence,
immediate upload, and any queued/offline retry upload:

```swift
struct RunSession: Codable {
    // Existing fields...
    let sessionType: SessionType
}

struct UploadRunRequest: Codable {
    // Existing fields...
    let sessionType: String  // "run" or "walk"
}
```

When building an upload:

```swift
sessionType: session.sessionType.rawValue
```

Do not derive this from Garmin device metadata such as `activityType`. Device
classification and user-selected session type are separate concepts. The server
normalizes unknown or missing values to `run`, but iOS must explicitly upload
`walk` to preserve walking terminology in summaries and AI analysis.

The active notification title must reflect the selected type:

```swift
let title = sessionType == .walk ? "Walk in progress" : "Run in progress"
```

---

## 6. Do not write unsupported Garmin biometrics as data

The watch bridge represents unsupported values as zero. Preserve the last
valid live value and only add plausible positive samples to aggregates/graphs:

```swift
if frame.heartRate > 20 {
    currentHeartRate = frame.heartRate
    heartRateSamples.append(frame.heartRate)
}

if frame.cadence > 0 {
    currentCadence = frame.cadence
    cadenceSamples.append(frame.cadence)
}

if frame.groundContactTime > 0 {
    groundContactTimeSamples.append(frame.groundContactTime)
}
```

Apply equivalent validation to stride length, vertical oscillation, vertical
ratio, running power, respiration, training effect, and barometric altitude.
Unsupported data must remain absent (`nil`/no sample), not a persisted zero.

---

## 7. End-of-session cleanup

Before teardown, snapshot whether the session was watch-originated if needed
for deduplication or upload policy. Then clear all watch-specific state so a
later iPhone-started activity cannot inherit watch ownership:

```swift
let watchInitiatedRun = wasSessionStartedByWatch

wasSessionStartedByWatch = false
lastWatchLocationReceivedAt = nil
acceptedWatchDistanceM = 0
watchElapsedSeconds = 0
```

Use the final session snapshot for upload; do not clear the data before the
final duration, distance, and average pace are calculated.

---

## Required test matrix

1. **Watch-started run with connected iPhone**
   - Phone and watch finish with the same Garmin distance and timer.
   - No early iPhone GPS distance is retained.
2. **Out-of-order watch frames**
   - Feed `dist=500`, then `dist=450`; final distance remains `500`.
   - Feed `elap=120`, then `elap=118`; final duration remains `120`.
3. **Current pace unavailable**
   - Garmin speed is zero/missing: current pace is `--`, average pace remains
     visible after distance accrues.
4. **Walk**
   - Foreground notification says `Walk in progress`.
   - Immediate and queued upload JSON both contain `"sessionType": "walk"`.
5. **Older/temporarily disconnected watch bridge**
   - Missing `dist`/`elap` does not reset distance or duration to zero.
   - iPhone tracking remains a safe fallback.
6. **Next iPhone-started run**
   - Does not inherit Garmin totals or the watch-origin flag from the previous
     session.

---

## No iOS watch-binary work required

The shared Garmin Connect IQ watch app has already been rebuilt as version
`3.2.2` and sends `dist` plus `elap`. The iOS work is limited to consuming those
fields and applying the ownership/validation rules above.
