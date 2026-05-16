# 📱 iOS Brief: Talk to Coach — Voice Activation + Apple Watch Tap Trigger

## Overview

Implement two ways for a runner to talk to their AI coach hands-free during a run:

1. **"Hey Coach" wake word** — phone continuously listens during an active run; saying "hey coach" opens a 5-second query window, the user asks their question, OpenAI responds with voice audio.
2. **Apple Watch screen tap** — tapping the watch face during an active run triggers the same flow on the phone (watch vibrates to confirm, shows "Asking coach..." text).

This is a **backend-ready** feature — the API endpoint and OpenAI prompt already handle both data questions ("how's my pace?") and general coaching questions ("I'm getting a stitch", "my calf is cramping", "how should I breathe") without any changes needed on the server.

---

## Part 1 — iOS Phone: "Hey Coach" Wake Word

### How Android Does It (reference implementation)

Android uses `SpeechRecognizer` in a continuous 4-second loop:
- Start looping on run start, stop on run end
- Each window checks if result contains "hey coach" (fuzzy match)
- On match: pause loop → play "Yes?" TTS → open full 5s query window → send to API → speak response → resume loop
- Errors (silence, timeout, network) silently loop without crashing

### iOS Implementation

**Recommended approach:** Use `SFSpeechRecognizer` (built-in, no third-party SDK).

#### 1. `WakeWordDetector.swift` — New file

```swift
import Foundation
import Speech
import AVFoundation

/// Continuously listens for "hey coach" during an active run using SFSpeechRecognizer.
/// Uses short recognition tasks in a loop — no third-party wake word SDK required.
class WakeWordDetector: ObservableObject {

    enum State { case idle, watching, paused, stopped }

    @Published var state: State = .idle

    var onWakeWord: (() -> Void)?

    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var isWatching = false

    // Phrases accepted as the wake word (fuzzy match)
    private let wakePhrases = ["hey coach", "ok coach", "okay coach", "hey couch", "a coach"]

    func startWatching() {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else { return }
        isWatching = true
        state = .watching
        startListeningWindow()
    }

    func pauseListening() {
        state = .paused
        stopAudioEngine()
    }

    func resumeListening() {
        guard isWatching else { return }
        state = .watching
        startListeningWindow()
    }

    func stopWatching() {
        isWatching = false
        state = .stopped
        stopAudioEngine()
    }

    private func startListeningWindow() {
        guard isWatching, state != .paused, state != .stopped else { return }
        stopAudioEngine()

        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try? audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest else { return loop(); return }
        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.requiresOnDeviceRecognition = false // on-device if available

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try? audioEngine.start()

        // 4-second window timeout
        let deadline = DispatchTime.now() + .seconds(4)
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self else { return }
            if let result {
                let text = result.bestTranscription.formattedString.lowercased()
                if self.wakePhrases.contains(where: { text.contains($0) }) {
                    self.pauseListening()
                    DispatchQueue.main.async { self.onWakeWord?() }
                    return
                }
            }
            if error != nil || result?.isFinal == true {
                self.loop()
            }
        }

        // Force-end the window after 4 seconds to prevent hanging
        DispatchQueue.main.asyncAfter(deadline: deadline) { [weak self] in
            guard let self, self.state == .watching else { return }
            self.recognitionTask?.finish()
            self.loop()
        }
    }

    private func stopAudioEngine() {
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
    }

    private func loop() {
        guard isWatching, state != .paused, state != .stopped else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.startListeningWindow()
        }
    }
}
```

#### 2. `SpeechRecognizerHelper.swift` — New or update existing

This handles the **full query window** after wake word fires (5-second silence timeout):

```swift
import Speech
import AVFoundation

enum SpeechStatus { case idle, listening, timedOut, error }

class SpeechRecognizerHelper: ObservableObject {
    @Published var status: SpeechStatus = .idle
    @Published var recognisedText: String = ""

    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var silenceTimer: Timer?
    private let silenceTimeout: TimeInterval = 5.0

    var onResult: ((String) -> Void)?
    var onTimeout: (() -> Void)?
    var onError: (() -> Void)?

    func startListening() {
        stopListening()
        status = .listening
        recognisedText = ""

        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try? audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest else { return }
        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }
        audioEngine.prepare()
        try? audioEngine.start()

        // Arm the 5-second "no speech" timeout
        armSilenceTimeout()

        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self else { return }
            if result != nil { self.disarmSilenceTimeout() }  // Speech detected — cancel timeout
            if let result, result.isFinal {
                let text = result.bestTranscription.formattedString
                self.recognisedText = text
                self.status = .idle
                self.stopListening()
                if !text.isEmpty { self.onResult?(text) }
            }
            if error != nil && result == nil {
                self.status = .error
                self.stopListening()
                self.onError?()
            }
        }
    }

    func stopListening() {
        disarmSilenceTimeout()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
    }

    private func armSilenceTimeout() {
        silenceTimer = Timer.scheduledTimer(withTimeInterval: silenceTimeout, repeats: false) { [weak self] _ in
            self?.status = .timedOut
            self?.stopListening()
            self?.onTimeout?()
        }
    }

    private func disarmSilenceTimeout() {
        silenceTimer?.invalidate()
        silenceTimer = nil
    }
}
```

#### 3. `RunSessionViewModel.swift` — Wire everything together

```swift
// Add these to RunSessionViewModel (or equivalent run ViewModel)

private let wakeWordDetector = WakeWordDetector()
private let speechHelper = SpeechRecognizerHelper()
private let ttsPlayer = AVSpeechSynthesizer() // or your existing TTS helper

@Published var wakeWordState: WakeWordDetector.State = .idle
@Published var coachText: String = ""

func onRunStarted() {
    guard AVAudioSession.sharedInstance().recordPermission == .granted,
          SFSpeechRecognizer.authorizationStatus() == .authorized else { return }

    wakeWordDetector.onWakeWord = { [weak self] in
        self?.onWakeWordDetected()
    }
    wakeWordDetector.startWatching()
    // Observe state for UI pulsing indicator
    wakeWordDetector.$state.assign(to: &$wakeWordState)
}

func onRunEnded() {
    wakeWordDetector.stopWatching()
    speechHelper.stopListening()
}

private func onWakeWordDetected() {
    // Play "Yes?" so the user knows the mic is open
    speakTTS("Yes?")
    startListening(fromWakeWord: true)
}

func startListening(fromWakeWord: Bool = false) {
    if !fromWakeWord { wakeWordDetector.pauseListening() }
    coachText = "Listening..."

    speechHelper.onResult = { [weak self] text in
        self?.coachText = "You said: \(text)"
        self?.sendMessageToCoach(text)
    }
    speechHelper.onTimeout = { [weak self] in
        self?.coachText = ""
        self?.wakeWordDetector.resumeListening()
    }
    speechHelper.onError = { [weak self] in
        self?.coachText = "Sorry, couldn't hear you. Try again!"
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            self?.coachText = ""
            self?.wakeWordDetector.resumeListening()
        }
    }
    speechHelper.startListening()
}

private func sendMessageToCoach(_ message: String) {
    coachText = "Thinking..."
    Task {
        do {
            let request = TalkToCoachRequest(message: message, context: buildCoachingContext())
            let response = try await apiService.talkToCoach(request)
            await MainActor.run { coachText = response.message }

            // Play audio response — backend returns base64 mp3
            if let audioB64 = response.audio, let audioData = Data(base64Encoded: audioB64) {
                playAudio(audioData)  // use your existing AudioPlayerHelper
            } else {
                speakTTS(response.message)  // AVSpeechSynthesizer fallback
            }

            await MainActor.run { coachText = "" }
            wakeWordDetector.resumeListening()

        } catch {
            await MainActor.run {
                coachText = "Sorry, couldn't process that. Keep going!"
            }
            wakeWordDetector.resumeListening()
        }
    }
}

private func buildCoachingContext() -> CoachingContext {
    // Populate with current run session data — all fields optional
    return CoachingContext(
        distance: currentSession?.distanceKm,
        duration: currentSession?.elapsedSeconds,
        pace: currentSession?.currentPace,
        totalDistance: targetDistanceKm,
        heartRate: currentSession?.heartRate,
        cadence: currentSession?.cadence,
        elevation: currentSession?.totalElevationGain,
        phase: currentSession?.phase,
        isStruggling: currentSession?.isStruggling,
        coachName: userProfile?.coachName,
        coachTone: userProfile?.coachTone,
        coachGender: userProfile?.coachGender,
        coachAccent: userProfile?.coachAccent
    )
}
```

#### 4. `RunSessionView.swift` — Pulsing "Hey Coach" indicator

Add a pulsing badge to the run screen top bar when wake word detection is active:

```swift
// In your run screen top bar / HStack

if wakeWordState == .watching {
    HStack(spacing: 5) {
        Circle()
            .fill(Color.blue.opacity(pulseOpacity))
            .frame(width: 7, height: 7)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulseOpacity)
        Text("Hey Coach")
            .font(.caption2.bold())
            .foregroundColor(.blue.opacity(pulseOpacity))
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 5)
    .background(Color.blue.opacity(0.1))
    .clipShape(Capsule())
    .onAppear { pulseOpacity = 1.0 }
}

// Also — keep the manual mic tap button working:
Button(action: { viewModel.startListening() }) {
    Image(systemName: "mic.fill")
        .foregroundColor(.blue)
}
```

Add `@State private var pulseOpacity: Double = 0.3` to the view.

#### 5. `Info.plist` — Permissions (if not already present)

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>AI Run Coach listens for "hey coach" to let you talk to your coach hands-free during a run.</string>

<key>NSMicrophoneUsageDescription</key>
<string>Required to hear your questions and coaching commands during a run.</string>
```

Request both permissions at run setup time:
```swift
SFSpeechRecognizer.requestAuthorization { _ in }
AVAudioSession.sharedInstance().requestRecordPermission { _ in }
```

---

## Part 2 — Apple Watch: Screen Tap Trigger

When the user taps the Apple Watch screen during an active run, it sends a message to the iPhone to open the talk-to-coach query window. The phone handles all speech recognition and API calls — the watch just acts as a trigger.

### WatchKit App (`WatchRunView.swift`)

```swift
import WatchKit
import WatchConnectivity

struct WatchRunView: View {
    @StateObject private var watchConnector = WatchPhoneConnector.shared
    @State private var statusMessage = ""
    @State private var showingCoachPrompt = false

    var body: some View {
        ZStack {
            // Your existing run metrics display...

            // During an active run — tap anywhere to talk to coach
            if isRunActive {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        requestTalkToCoach()
                    }
            }

            // Brief "Asking coach..." overlay after tap
            if showingCoachPrompt {
                VStack {
                    Spacer()
                    Text("Asking coach...")
                        .font(.footnote)
                        .foregroundColor(.blue)
                        .padding(.bottom, 8)
                }
            }
        }
    }

    private func requestTalkToCoach() {
        // Haptic confirmation
        WKInterfaceDevice.current().play(.click)

        // Show brief on-screen prompt
        showingCoachPrompt = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            showingCoachPrompt = false
        }

        // Send command to iPhone
        watchConnector.sendCommand("talkToCoach")
    }
}
```

### `WatchPhoneConnector.swift` (Watch side)

```swift
import WatchConnectivity

class WatchPhoneConnector: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchPhoneConnector()

    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func sendCommand(_ action: String) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["type": "command", "action": action], replyHandler: nil)
    }

    // WCSessionDelegate stubs
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
}
```

### iPhone Side — Receive Watch Command

In your existing `WCSessionDelegate` on the iPhone (wherever you handle Watch messages):

```swift
func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    let type = message["type"] as? String
    let action = message["action"] as? String

    if type == "command", action == "talkToCoach" {
        DispatchQueue.main.async {
            // Trigger the same flow as the "hey coach" wake word
            self.runViewModel?.onWakeWordDetected()
        }
    }
}
```

### Watch: Show Coach Response Text

After the phone gets the coach response, send the text back to the watch so it can display it:

```swift
// iPhone — after receiving coach response:
if WCSession.default.isReachable {
    WCSession.default.sendMessage(
        ["type": "coachingCue", "message": response.message],
        replyHandler: nil
    )
}

// Watch — in WCSessionDelegate:
func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if message["type"] as? String == "coachingCue",
       let text = message["message"] as? String {
        DispatchQueue.main.async {
            self.statusMessage = text
            // Clear after 8 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
                self.statusMessage = ""
            }
        }
    }
}
```

---

## API Contract

### Request — `POST /api/coaching/talk-to-coach`

**Auth:** Bearer token (same JWT as rest of app)

```json
{
  "message": "I'm getting a stitch",
  "context": {
    "distance": 4.2,
    "duration": 1320,
    "pace": "5:15",
    "totalDistance": 10.0,
    "heartRate": 158,
    "cadence": 172,
    "elevation": 38.5,
    "phase": "MIDDLE",
    "isStruggling": false,
    "coachName": "Sarah",
    "coachTone": "encouraging",
    "coachGender": "female",
    "coachAccent": "british"
  }
}
```

All `context` fields are **optional** — send whatever data you have. The backend handles missing data gracefully.

### Response

```json
{
  "message": "Exhale on your left foot strike to ease the diaphragm. Slow slightly and press two fingers into the painful area. Breathe deeply for 30 seconds — it'll pass.",
  "audio": "<base64 encoded mp3>",
  "format": "mp3"
}
```

- `audio` — Play with `AVAudioPlayer` from `Data(base64Encoded: audio)`
- If `audio` is `null`, fall back to `AVSpeechSynthesizer` with the `message` text

### What the backend handles automatically

The backend now answers **any running question** — data-driven or general knowledge:

| Question type | Example | Answer source |
|---|---|---|
| Data query | "How's my pace?" | Current run metrics in context |
| Physiology | "I'm getting a stitch" | Sports science coaching knowledge |
| Symptoms | "My calf is cramping" | Sports science coaching knowledge |
| Technique | "How should I breathe?" | Biomechanics expertise |
| Motivation | "I want to stop" | Motivational coaching |
| Nutrition | "Should I take a gel?" | Nutrition/fuelling expertise |

No changes to the backend needed.

---

## Audio Handling Notes

- **Response audio is base64-encoded MP3** from OpenAI TTS — same voice/accent as the rest of the app's coaching
- Play using `AVAudioPlayer` with `AVAudioSession.sharedInstance().setCategory(.playback)`
- Before starting `SFSpeechRecognizer`, set audio session to `.record` mode; after coach responds, switch back to `.playback`
- **Important**: Stop the wake word detector's audio engine before playing the response (avoid feedback loop). Resume after playback completes.

```swift
// Before speaking coach response:
audioEngine.stop()
audioEngine.inputNode.removeTap(onBus: 0)
try? AVAudioSession.sharedInstance().setCategory(.playback)

// After playback completes — resume wake word detection:
wakeWordDetector.resumeListening()
```

---

## Complete Flow Diagram

```
Phone (active run)
│
├── WakeWordDetector loops 4s windows via SFSpeechRecognizer
│   └── Hears "hey coach"
│       ├── Pause loop
│       ├── Play "Yes?" via TTS
│       └── Open 5s query window ──────────────────────────────────┐
│                                                                   │
Watch tap                                                           │
│                                                                   │
└── WCSession sends {"type":"command","action":"talkToCoach"}       │
    └── iPhone receives → trigger onWakeWordDetected() ────────────┘
                                                                    │
                                                              SpeechRecognizerHelper
                                                              listens up to 5s
                                                                    │
                                                              User asks question
                                                                    │
                                                              POST /api/coaching/talk-to-coach
                                                                    │
                                                              OpenAI → text + MP3 audio
                                                                    │
                                                         ┌──────────┴──────────┐
                                                    Play MP3               Display text
                                                    on phone               on phone + watch
                                                         │
                                                    Resume WakeWordDetector loop
```

---

## Permissions Checklist

- [ ] `NSSpeechRecognitionUsageDescription` in Info.plist
- [ ] `NSMicrophoneUsageDescription` in Info.plist
- [ ] Request `SFSpeechRecognizer.requestAuthorization` at run setup
- [ ] Request `AVAudioSession.requestRecordPermission` at run setup
- [ ] Handle `.denied` / `.restricted` states gracefully (hide wake word badge, disable mic button)
- [ ] WatchKit: no extra permissions needed — WCSession uses the phone's mic

## Testing Scenarios

1. **Say "hey coach"** → phone plays "Yes?" → ask "how's my pace?" → coach responds with current pace data
2. **Say "hey coach"** → ask "I'm getting a stitch" → coach gives immediate physiological advice (no metrics needed)
3. **Say "hey coach"** → say nothing for 5 seconds → silently returns to listening (no crash, no hang)
4. **Tap watch face** during run → phone vibrates → plays "Yes?" → ask question → watch shows coach reply text
5. **Tap watch face** when run is paused or not started → nothing happens
6. **No microphone permission** → wake word badge hidden, mic button disabled, graceful message
7. **Run ends** → wake word detector stops cleanly, no background audio use
