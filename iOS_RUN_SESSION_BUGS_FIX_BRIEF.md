# iOS Brief: Run Session Bug Fixes (June 2026)

Six bugs were found during a real run and fixed in the Android app. All fixes need to be mirrored in the iOS Xcode project. This brief covers each change with exact Swift code.

---

## Bug 1 & 3 — Wrong Voice Gender (Female Instead of Male Coach)

### Root Cause
`AVSpeechSynthesizer` on iOS selects a voice using a language/locale identifier — it does **not** filter by gender keyword in a voice name string. However, iOS apps that build a manual voice-name filter (e.g. looking for `"male"` in `voice.identifier`) will hit the same substring bug as Android: `"female"` contains the substring `"male"`, so a male-voice search accidentally matches female voices.

### Fix — `TextToSpeechHelper.swift` (or equivalent)

If your code selects a voice by scanning `AVSpeechSynthesisVoice.speechVoices()` by name/identifier string, update the gender match logic:

```swift
private func voiceForGender(_ gender: String, language: String) -> AVSpeechSynthesisVoice? {
    let voices = AVSpeechSynthesisVoice.speechVoices()
        .filter { $0.language.hasPrefix(language) }

    switch gender.lowercased() {
    case "female":
        // Match voices that contain "female" or "woman" in their identifier/name
        return voices.first {
            let id = $0.identifier.lowercased()
            return id.contains("female") || id.contains("woman")
        } ?? voices.first

    case "male":
        // IMPORTANT: "female" contains the substring "male".
        // Must explicitly exclude female voices when searching for male ones.
        return voices.first {
            let id = $0.identifier.lowercased()
            return (id.contains("male") && !id.contains("female"))
                || (id.contains("man") && !id.contains("woman"))
        } ?? voices.first

    default:
        return AVSpeechSynthesisVoice(language: language)
    }
}
```

If using `AVSpeechSynthesisVoiceGender` (iOS 17+), use the native API instead:

```swift
private func voiceForGender(_ gender: String, language: String) -> AVSpeechSynthesisVoice? {
    if #available(iOS 17.0, *) {
        // Use the native gender enum — no substring matching needed
        let targetGender: AVSpeechSynthesisVoiceGender = gender.lowercased() == "female" ? .female : .male
        return AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix(language) && $0.gender == targetGender }
            .first
            ?? AVSpeechSynthesisVoice(language: language)
    }
    // iOS 16 and below — use identifier heuristics (with female-exclusion fix above)
    return voiceForGenderLegacy(gender, language: language)
}
```

**Also:** when using the device TTS fallback, make sure you always pass the gender parameter. For example, the talk-to-coach fallback at the bottom of `onWakeWordDetected` must include gender:

```swift
// ❌ Before — no gender → defaults to system voice (usually female)
textToSpeechHelper.speak("Hey, how can I help?", accent: user?.coachAccent)

// ✅ After — pass gender explicitly
textToSpeechHelper.speak("Hey, how can I help?", accent: user?.coachAccent, gender: user?.coachGender)
```

---

## Bug 3 — "Yes?" → "Hey, how can I help?" (Talk to Coach Acknowledgment)

### What Changed
The pre-warmed acknowledgment audio was `"Yes?"`. This has been changed to `"Hey, how can I help?"` everywhere — both the Polly pre-warm and the device TTS fallback.

### Fix 1 — Update `GenerateTtsRequest` model

The backend `/api/tts/generate` endpoint now accepts optional `coachGender` and `coachAccent` fields to select the correct Polly voice. Update your request model:

```swift
// ❌ Before
struct GenerateTtsRequest: Codable {
    let text: String
}

// ✅ After
struct GenerateTtsRequest: Codable {
    let text: String
    let coachGender: String?  // "male" | "female" — selects the correct Polly voice
    let coachAccent: String?  // "british" | "american" | "australian" etc.
}
```

### Fix 2 — Update `preWarmYesAudio()` in `RunSessionViewModel` (or equivalent)

```swift
// ��� Before
private func preWarmYesAudio() async {
    do {
        let response = try await apiService.generateTts(
            GenerateTtsRequest(text: "Yes?")
        )
        // ...
    }
}

// ✅ After — new text + pass coach voice settings
private func preWarmYesAudio() async {
    do {
        let response = try await apiService.generateTts(
            GenerateTtsRequest(
                text: "Hey, how can I help?",
                coachGender: user?.coachGender,  // uses user's configured voice
                coachAccent: user?.coachAccent
            )
        )
        if let audioData = Data(base64Encoded: response.audio) {
            yesAudioData = audioData
            print("✅ Pre-warmed Polly 'Hey, how can I help?' audio (\(audioData.count) bytes)")
        }
    } catch {
        print("⚠️ Could not pre-warm audio: \(error)")
        yesAudioData = nil
    }
}
```

### Fix 3 — Update `onWakeWordDetected()` fallback text and gender

```swift
// ❌ Before
func onWakeWordDetected() {
    if let audioData = yesAudioData {
        playAudio(audioData) { [weak self] in
            self?.startListening(fromWakeWord: true)
        }
    } else {
        // No cached audio — open mic silently (per the existing iOS brief)
        startListening(fromWakeWord: true)
    }
}

// ✅ After — same logic, just update log messages
// (The actual text "Hey, how can I help?" is in the preWarmYesAudio change above)
```

> **Note:** The existing iOS brief says "if pre-warm fails, open mic silently". Keep that behaviour — do NOT fall back to `AVSpeechSynthesizer` for the acknowledgment. The gender fix applies only to any other TTS fallback paths in your codebase.

---

## Bug 4 — Cadence Coaching Ignores Target Pace

### What Changed
The `CadenceCoachingRequest` model now includes the user's target pace and the biomechanics-computed optimal cadence at current speed. Without these, the AI would recommend a generic cadence (e.g. 160 spm) that doesn't account for how fast the user is actually supposed to be running.

### Fix — Update `CadenceCoachingRequest` model

```swift
// ❌ Before
struct CadenceCoachingRequest: Codable {
    let cadence: Int
    let strideLength: Double
    let strideZone: String          // "OVERSTRIDING" | "UNDERSTRIDING" | "OPTIMAL"
    let currentPace: String
    let speed: Double               // m/s
    let distance: Double            // km
    let elapsedTime: Int
    let heartRate: Int?
    let userHeight: Double?         // metres
    let userWeight: Double?         // kg
    let userAge: Int?
    let optimalCadenceMin: Int
    let optimalCadenceMax: Int
    let optimalStrideLengthMin: Double
    let optimalStrideLengthMax: Double
    let coachName: String?
    let coachTone: String?
    let coachGender: String?
    let coachAccent: String?
}

// ✅ After — add three new fields
struct CadenceCoachingRequest: Codable {
    let cadence: Int
    let strideLength: Double
    let strideZone: String
    let currentPace: String
    let targetPace: String?         // NEW — user's goal pace, e.g. "5:15" (nil for free runs)
    let targetTime: Int?            // NEW — user's goal time in seconds (nil if not set)
    let optimalCadenceTarget: Int   // NEW — biomechanics ideal spm at current speed
    let speed: Double
    let distance: Double
    let elapsedTime: Int
    let heartRate: Int?
    let userHeight: Double?
    let userWeight: Double?
    let userAge: Int?
    let optimalCadenceMin: Int
    let optimalCadenceMax: Int
    let optimalStrideLengthMin: Double
    let optimalStrideLengthMax: Double
    let coachName: String?
    let coachTone: String?
    let coachGender: String?
    let coachAccent: String?
}
```

### Where to pass these values (in `RunTrackingService.swift` or equivalent)

```swift
// When building the request in maybeTriggerCadenceCoaching():
let request = CadenceCoachingRequest(
    cadence: stride.cadence,
    strideLength: stride.strideLength,
    strideZone: stride.strideZone,
    currentPace: currentPace,
    targetPace: targetPaceSecondsPerKm > 0 ? formatPace(targetPaceSecondsPerKm) : nil,
    targetTime: targetTime.map { Int($0 / 1000) },  // ms → seconds
    optimalCadenceTarget: stride.optimalCadenceTarget,
    speed: currentSpeedMs,
    // ... rest of fields unchanged
)
```

Also update `EliteCoachingRequest` (used for HR coaching, milestone coaching etc.) — the `targetPace` field should no longer be `nil`:

```swift
// ❌ Before
targetPace: nil,  // TODO: pass if user has set one

// ✅ After
targetPace: targetPaceSecondsPerKm > 0 ? formatPace(targetPaceSecondsPerKm) : nil,
```

---

## Bug 5 — Wrong HR Zone (148 bpm Reported as Zone 5 for a 35-Year-Old)

### Root Cause
Two separate issues:
1. **Phone HR zone calculation** used the "220 − age" formula and non-standard zone boundaries
2. **Garmin watch `_hrZone()` function** had a hardcoded max HR of 185 that ignored the user's actual age

### Fix A — HR Zone Calculation in iOS `RunningMetricsConfig` (or equivalent)

**Switch to the Tanaka formula** and align zone boundaries to the standard 5-zone model used by Garmin and Polar:

```swift
// ❌ Before — "220 − age" formula, non-standard zone widths
func getMaxHeartRate(userAge: Int) -> Int {
    let actualMaxHr = UserDefaults.standard.integer(forKey: "user_actual_max_hr")
    if actualMaxHr > 0 { return actualMaxHr }
    return max(170, min(200, 220 - userAge))  // "220 − age" formula
}

func getHeartRateZoneThresholds(userAge: Int) -> HeartRateZoneThresholds {
    let maxHr = getMaxHeartRate(userAge: userAge)
    return HeartRateZoneThresholds(
        maxHr: maxHr,
        zone1Upper: Int(Double(maxHr) * 0.50),  // Zone 1: < 50%
        zone2Upper: Int(Double(maxHr) * 0.60),  // Zone 2: 50-60%
        zone3Upper: Int(Double(maxHr) * 0.70),  // Zone 3: 60-70%
        zone4Upper: Int(Double(maxHr) * 0.85),  // Zone 4: 70-85% ← too wide
        zone5Upper: maxHr                        // Zone 5: 85-100%
    )
}

// ✅ After — Tanaka formula (2001), standard 5-zone boundaries
//
// Standard zones (Garmin / Polar / most coaches):
//   Zone 1: < 60%   — Recovery
//   Zone 2: 60-70%  — Base aerobic
//   Zone 3: 70-80%  — Aerobic/tempo
//   Zone 4: 80-90%  — Threshold / hard
//   Zone 5: ≥ 90%   — VO2 Max / maximum effort
//
// Example for a 35-year-old: maxHR ≈ 184 bpm
//   Zone 1 < 110, Zone 2 < 129, Zone 3 < 147, Zone 4 < 166, Zone 5 ≥ 166
func getMaxHeartRate(userAge: Int) -> Int {
    let actualMaxHr = UserDefaults.standard.integer(forKey: "user_actual_max_hr")
    if actualMaxHr > 0 { return actualMaxHr }
    // Tanaka formula: HRmax = 208 − (0.7 × age)  [more accurate for active adults]
    let tanaka = 208 - Int(0.7 * Double(userAge))
    return max(155, min(210, tanaka))
}

func getHeartRateZoneThresholds(userAge: Int) -> HeartRateZoneThresholds {
    let maxHr = getMaxHeartRate(userAge: userAge)
    return HeartRateZoneThresholds(
        maxHr: maxHr,
        zone1Upper: Int(Double(maxHr) * 0.60),  // Zone 1: < 60%
        zone2Upper: Int(Double(maxHr) * 0.70),  // Zone 2: 60-70%
        zone3Upper: Int(Double(maxHr) * 0.80),  // Zone 3: 70-80%
        zone4Upper: Int(Double(maxHr) * 0.90),  // Zone 4: 80-90%
        zone5Upper: maxHr                        // Zone 5: 90-100%
    )
}

func calculateHeartRateZone(heartRate: Int, userAge: Int) -> Int? {
    guard heartRate > 0, userAge > 0 else { return nil }
    let thresholds = getHeartRateZoneThresholds(userAge: userAge)
    switch heartRate {
    case ..<thresholds.zone1Upper: return 1
    case ..<thresholds.zone2Upper: return 2
    case ..<thresholds.zone3Upper: return 3
    case ..<thresholds.zone4Upper: return 4
    default:                        return 5
    }
}
```

### Fix B — Send `maxHr` to the Garmin Watch

The Garmin watch app now uses the max HR received from the phone for on-watch zone display instead of a hardcoded 185. Update `sendAuth` in `GarminWatchManager.swift`:

```swift
// ❌ Before
extension GarminWatchManager {
    func sendAuth(authToken: String, runnerName: String) {
        sendToWatch(["type": "auth", "authToken": authToken, "runnerName": runnerName])
    }
}

// ✅ After — include maxHr so the watch displays correct HR zones
extension GarminWatchManager {
    /// - Parameter userAge: Optional. Used to compute personalised max HR for on-watch
    ///   HR zone display using the Tanaka formula (208 − 0.7 × age). Defaults to 185 if nil.
    func sendAuth(authToken: String, runnerName: String, userAge: Int? = nil) {
        // Tanaka formula — same as the phone-side calculation
        let maxHr: Int
        if let age = userAge, age > 0 {
            maxHr = max(155, min(210, 208 - Int(0.7 * Double(age))))
        } else {
            maxHr = 185  // safe default
        }
        sendToWatch([
            "type":       "auth",
            "authToken":  authToken,
            "runnerName": runnerName,
            "maxHr":      maxHr          // NEW — watch uses this for zone display
        ])
    }
}
```

**Update every `sendAuth` call site to pass the user's age:**

```swift
// In RunSessionViewModel / wherever onWatchAppReady fires:
garminWatchManager.sendAuth(
    authToken: token,
    runnerName: user.name,
    userAge: user.age       // pass age so watch gets correct maxHr
)

// In the "watchReady" command handler:
garminWatchManager.sendAuth(
    authToken: token,
    runnerName: cachedRunnerName,
    userAge: cachedUserAge  // store age alongside token when the user logs in
)
```

---

## Bug 2 — Missing 500 m / 1 km Update Announcements

### Root Cause
The km-split coaching audio is silently dropped if the **global cooldown** (15 s / 150 m minimum gap between any two coaching events) happens to be active at the exact moment the runner crosses a km boundary. The split is recorded in the data but the voice cue never fires, and there is no retry.

### Fix — Add a "pending split" retry in `RunTrackingService.swift`

Add a stored property to hold the deferred split:

```swift
// In RunTrackingService / RunTrackingViewModel:
private var pendingKmSplitCoaching: KmSplit? = nil  // Retry when cooldown clears
```

Reset it at run start:

```swift
func resetForNewRun() {
    // ... existing resets ...
    pendingKmSplitCoaching = nil
}
```

Update `checkForKmSplit()` to defer instead of silently drop:

```swift
private func checkForKmSplit() {
    let currentKm = Int(totalDistance / 1000)

    // ── Retry any pending split from a previous tick where cooldown blocked it ──
    if let pending = pendingKmSplitCoaching,
       !hasCoachingFiredThisTick,
       canFireCoaching(),
       !isInFinalStretch() {
        print("Retrying pending km split coaching at \(pending.km)km")
        pendingKmSplitCoaching = nil
        hasCoachingFiredThisTick = true
        recordCoachingFired()
        triggerKmSplitCoaching(pending)
        return
    }

    guard currentKm > lastKmSplit else { return }

    let now = Date().timeIntervalSince1970
    let splitTime = (now - lastSplitTime) - splitPausedSeconds
    let splitPaceSeconds = splitTime > 0 ? splitTime : 0
    let split = KmSplit(km: currentKm, time: splitPaceSeconds, pace: formatPace(splitPaceSeconds))
    kmSplits.append(split)
    lastKmSplit = currentKm
    lastSplitTime = now
    splitPausedSeconds = 0

    // Skip coaching audio for interval sessions
    guard !isIntervalTypeSession else { return }

    let interval = coachingFeaturePrefs.kmSplitIntervalKm
    guard currentKm % interval == 0, !isInFinalStretch() else { return }

    if !hasCoachingFiredThisTick && canFireCoaching() {
        print("Triggering split coaching at \(currentKm)km")
        hasCoachingFiredThisTick = true
        recordCoachingFired()
        triggerKmSplitCoaching(split)
    } else {
        // Cooldown active at crossing — store and retry next GPS tick
        print("Km split at \(currentKm)km deferred (cooldown active) — will retry")
        pendingKmSplitCoaching = split
    }
}
```

---

## Bug 6 — Watch Metrics Disappear Mid-Run (IQ Error Screen)

### What Changed in the Watch App (already fixed in `RunView.mc`)

The `_drawBattery()` function in the Garmin watch app was calling `Sys.getSystemStats()` without a null check. On some Garmin firmware versions this can return `nil`, causing an IQ runtime exception that blanks the watch screen (while button/tap delegates remain functional).

**No iOS code change required** — this was a pure watch-side fix. The updated `.iq` file needs to be rebuilt and re-submitted to the Connect IQ Store. See the build instructions in `GARMIN_COMPANION_BUILD_GUIDE.md`.

However, the iOS app should also handle the case where the watch temporarily loses its display by ensuring the `runUpdate` messages keep flowing:

```swift
// In your run update loop (fires every ~1 second):
// Make sure this runs even when the iOS app is backgrounded (phone screen off)
// Use a background task to keep the timer alive:
private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

func startRunUpdateTimer() {
    // Request background execution time so updates keep flowing with phone in pocket
    backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "RunUpdate") {
        UIApplication.shared.endBackgroundTask(self.backgroundTask)
        self.backgroundTask = .invalid
    }

    Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
        self?.sendRunUpdateToWatch()
    }
}
```

> **Why this matters:** The user reported the watch lost metrics while the phone was in their pocket (screen off). If iOS suspends the app's timer when backgrounded, the watch stops receiving `runUpdate` messages and its displayed metrics freeze (though controls still work). Ensure the run update loop is protected with a `UIBackgroundTask` or `CLLocationManager` background mode.

---

## Bug 7 — Run Summary Charts Empty (iOS and Android)

### Root Cause
The server's `transformRunForAndroid` function (used for **all** `GET /api/runs/:id` and `GET /api/users/:userId/runs` responses — iOS and Android) was only returning ~25 fields. It **silently omitted** `hasGarminData`, all time-series arrays, all Garmin scalar dynamics, HR zone breakdown, and extended metrics. The data was always stored in the database — it just wasn't being sent to clients.

### Fix Applied (Server — `routes.ts`)
`transformRunForAndroid` now returns the complete field set. The following fields are now included in every `GET /api/runs/:id` response:

**Garmin flag**
- `hasGarminData: Boolean` — gates all Garmin chart sections on iOS/Android

**Extended scalars**
- `avgSpeed`, `movingTime`, `elapsedTime`, `avgStrideLength`
- `minElevation`, `maxElevation`, `steepestIncline`, `steepestDecline`
- `totalSteps`, `activeCalories`, `minHeartRate`
- `maxSpeed` (m/s — fastest pace of the run), `maxCadence` (spm — highest cadence of the run)

**Garmin Running Dynamics scalars**
- `avgGroundContactTime`, `minGroundContactTime`, `maxGroundContactTime`
- `avgGroundContactBalance`, `avgVerticalOscillation`, `maxVerticalOscillation`
- `avgVerticalRatio`, `minStrideLength`, `maxStrideLength`

**Training Effect & Recovery**
- `aerobicTrainingEffect`, `anaerobicTrainingEffect`, `trainingEffectLabel`
- `recoveryTimeMinutes`, `vo2MaxEstimate`

**Power & Respiration**
- `avgRunningPower`, `maxRunningPower`, `avgRespirationRate`

**HR Zone breakdown** *(pre-computed from Tanaka formula — more accurate than deriving from raw HR)*
- `avgHeartRateZone`, `timeInZone1`, `timeInZone2`, `timeInZone3`, `timeInZone4`, `timeInZone5` (all in **seconds**)

**Time-series arrays** *(flat `number[]`, null if not recorded)*
- `heartRateData` — HR bpm per ~2s sample
- `paceData` — pace per sample
- `cadenceData` — spm per ~2s sample
- `altitudeData` — barometric altitude (metres) per GPS sample
- `groundContactTimeData` — GCT (ms) per ~2s sample
- `groundContactBalanceData` — L/R balance (%) per sample
- `verticalOscillationData` — vertical oscillation (cm) per sample
- `verticalRatioData` — vertical ratio (%) per sample
- `strideLengthData` — stride length (m) per sample
- `runningPowerData` — watts per sample (Fenix 7+ / FR965 only)
- `respirationRateData` — breaths/min per sample (Fenix 7+ / FR965 only)
- `bearingData` — heading (degrees) per sample

### iOS `RunSession` Model Update Required

Add all the above fields to your `RunSession` (or `RunResponse`) Swift struct. Example additions:

```swift
struct RunSession: Codable {
    // ... existing fields ...

    // Garmin flag
    let hasGarminData: Bool?
    let garminDeviceName: String?

    // Extended scalars
    let maxSpeed: Double?          // m/s — fastest speed during run
    let maxCadence: Int?           // spm — highest cadence during run
    let avgSpeed: Double?
    let movingTime: Int?
    let elapsedTime: Int?
    let avgStrideLength: Double?
    let minElevation: Double?
    let maxElevation: Double?
    let totalSteps: Int?
    let activeCalories: Int?
    let minHeartRate: Int?

    // Running Dynamics
    let avgGroundContactTime: Double?
    let avgGroundContactBalance: Double?
    let avgVerticalOscillation: Double?
    let avgVerticalRatio: Double?
    let avgVerticalRatioData: [Double]?  // see time-series below
    let aerobicTrainingEffect: Double?
    let anaerobicTrainingEffect: Double?
    let trainingEffectLabel: String?
    let recoveryTimeMinutes: Int?
    let vo2MaxEstimate: Double?
    let avgRunningPower: Int?
    let maxRunningPower: Int?
    let avgRespirationRate: Double?

    // HR Zone breakdown (seconds in each zone)
    let avgHeartRateZone: Int?
    let timeInZone1: Int?
    let timeInZone2: Int?
    let timeInZone3: Int?
    let timeInZone4: Int?
    let timeInZone5: Int?

    // Time-series arrays
    let heartRateData: [Int]?
    let paceData: [Double]?
    let cadenceData: [Int]?
    let altitudeData: [Double]?
    let groundContactTimeData: [Double]?
    let groundContactBalanceData: [Double]?
    let verticalOscillationData: [Double]?
    let verticalRatioData: [Double]?
    let strideLengthData: [Double]?
    let runningPowerData: [Int]?
    let respirationRateData: [Double]?
}
```

### List vs Detail Endpoints
- `GET /api/runs/:id` — returns **full** payload (all arrays + all scalars). Use this when opening a run summary/detail screen.
- `GET /api/users/:userId/runs` — returns **summary only** (scalars only, no time-series arrays). Use this for the history list. Fetch `GET /api/runs/:id` on tap to get full data.

### HR Zone Chart
Prefer `timeInZone1`–`timeInZone5` (seconds) over computing zones from `heartRateData`. The server uses the **Tanaka formula (208 − 0.7 × age)** and standard 5-zone boundaries (60/70/80/90% of maxHR), giving accurate results even for Garmin runs where the phone's HR sensor wasn't active.

---

## Summary of Files to Update in Xcode

| File | Change |
|---|---|
| `GarminWatchManager.swift` | `sendAuth()` → add `userAge` param, send `maxHr` to watch |
| `RunSessionViewModel.swift` (or equivalent) | `preWarmYesAudio()` → new text + voice gender/accent; `onWakeWordDetected()` → pass gender to TTS fallback |
| `GenerateTtsRequest.swift` (network model) | Add `coachGender: String?` and `coachAccent: String?` fields |
| `CadenceCoachingRequest.swift` (network model) | Add `targetPace`, `targetTime`, `optimalCadenceTarget` fields |
| `EliteCoachingRequest.swift` (network model) | Replace `targetPace: nil` with computed value from `targetPaceSecondsPerKm` |
| `RunningMetricsConfig.swift` (or `HRZoneCalculator.swift`) | Tanaka formula + standard 5-zone boundaries |
| `TextToSpeechHelper.swift` (or `AVSpeechHelper.swift`) | Fix male voice selection — exclude female voices from male search |
| `RunTrackingService.swift` | `checkForKmSplit()` → add `pendingKmSplitCoaching` retry; `resetForNewRun()` → clear pending |
| Any run screen `onWatchAppReady` / `watchReady` handler | Pass `userAge` to `sendAuth()` |
| **`RunSession.swift` (network/domain model)** | **Add all new fields listed in Bug 7 above** |
| **Run summary/detail view controllers** | **Use `timeInZone*` for HR zones chart; use time-series arrays for all graphs** |

---

## Watch App Rebuild Required

After these changes, the Garmin watch app also has fixes (null-safe `_drawBattery`, personalised `_maxHr` from phone). Rebuild the `.iq` file and submit to the Connect IQ Store:

```bash
cd garmin-companion-app
./build-iq.sh
```

The new build should be submitted as an update — both iOS and Android users share the same `.iq` file from the Connect IQ Store, so one build covers both platforms.
