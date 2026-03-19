# iOS TTS Audio Playback Implementation Brief

## Objective
Implement AWS Polly Neural TTS audio playback on iOS to match the Android implementation. This will provide high-quality, regionally-accented English coaching voice during runs.

## Architecture Overview

### Current Android Implementation
- **TextToSpeechHelper.kt**: Native Android TTS engine wrapper
  - Uses `android.speech.tts.TextToSpeech` API
  - Supports accent localization (British, American, Australian, Irish, South African, Indian, New Zealand)
  - Queues speech with callbacks
  - Falls back to device TTS if Polly audio unavailable

- **CoachingAudioQueue.kt**: Audio queue manager
  - Manages playback order of coaching cues
  - Handles navigation audio interruption
  - Supports both pre-generated Polly MP3 URLs and fallback TTS
  - Tracks playback progress and completion

### Backend (Reference)
- **polly-service.ts**: AWS Polly integration
  - Maps coach accent/gender to Polly Neural voice
  - Supports 7 regional accents with gender variants
  - Returns MP3 audio buffer from Polly API
  - Falls back to OpenAI TTS if needed

## iOS Implementation Requirements

### 1. **PollyAudioManager** (New Class)
```swift
class PollyAudioManager {
    // Properties
    - audioPlayer: AVAudioPlayer?
    - currentUrl: URL?
    - onCompletion: (() -> Void)?
    - isPlaying: Bool
    
    // Methods
    - func playAudio(from url: URL, onComplete: @escaping () -> Void)
    - func playAudio(from data: Data, onComplete: @escaping () -> Void)
    - func stop()
    - func pause()
    - func resume()
}
```

**Key Features:**
- Use `AVAudioPlayer` or `AVPlayer` for MP3 playback
- Handle audio session management (category, mode, options)
- Implement proper delegation for playback completion callbacks
- Support network audio URLs (stream from backend)
- Handle interruptions (phone calls, alarms, etc.)

### 2. **TextToSpeechFallback** (Device TTS)
```swift
class TextToSpeechFallback {
    // Properties
    - synthesizer: AVSpeechSynthesizer
    
    // Methods
    - func speak(_ text: String, accent: String?, gender: String?, onComplete: @escaping () -> Void)
    - func setAccent(_ accent: String)
    - func stop()
    - func destroy()
}
```

**Key Features:**
- Use `AVSpeechSynthesizer` as fallback when Polly audio unavailable
- Map accents to `AVSpeechSynthesis` language/locale codes:
  - `en-GB` → British
  - `en-US` → American
  - `en-AU` → Australian
  - `en-IE` → Irish
  - `en-ZA` → South African
  - `en-IN` → Indian
  - `en-NZ` → New Zealand
- Implement proper delegate callbacks

### 3. **CoachingAudioQueue** (iOS Equivalent)
```swift
class CoachingAudioQueue {
    // Properties
    - audioManager: PollyAudioManager
    - ttsHelper: TextToSpeechFallback
    - queue: [AudioItem] // Enqueued audio items
    - isPlaying: Bool
    - watchdogTimer: Timer?
    
    // Methods
    - func enqueueAudio(audioUrl: URL?, fallbackText: String?, priority: AudioPriority)
    - func enqueueOpenAITTS(audioUrl: URL?, fallbackText: String, accent: String?)
    - func processQueue()
    - func stopPlayback()
    - func clearQueue()
}
```

**Audio Item Structure:**
```swift
struct AudioItem {
    let id: String
    let audioUrl: URL?           // Polly MP3 from backend
    let fallbackText: String?    // TTS fallback text
    let accent: String?          // Voice accent (british, american, etc.)
    let gender: String?          // Voice gender (male, female)
    let priority: AudioPriority  // NORMAL, NAVIGATION
    let createdAt: Date
}

enum AudioPriority {
    case normal
    case navigationInterrupt     // Pauses current playback
}
```

### 4. **Audio Session Management**
```swift
class AudioSessionManager {
    // Initialize audio session for running (background playback, no mixing)
    - func configureForRunning()
    - func handleInterruption(notification: NSNotification)
    - func releaseAudioSession()
}
```

**Configuration:**
- Category: `playback` (with options `.duckOthers` if desired)
- Mode: `default`
- Options: `defaultToSpeaker` (route to speaker, not headphones initially)

## API Integration Points

### Backend Endpoint
**GET** `/api/coaching/tts` (or similar)
- Returns pre-generated Polly MP3 URL or audio buffer
- Parameters: `text`, `accent`, `gender`, `tone`
- Response: URL or base64 encoded MP3 data

### Usage Flow
1. Backend generates coaching cue text + accent/gender
2. iOS calls backend to fetch Polly audio (or gets URL)
3. If URL returned: stream MP3 using `AVPlayer`
4. If data returned: create Data object and play with `AVAudioPlayer`
5. If error/network issue: fall back to `AVSpeechSynthesizer`
6. Invoke completion callback when done

## Voice Mapping Reference

| Accent | iOS Locale | Example Voice |
|--------|-----------|---|
| British | `en-GB` | Native GB accent |
| American | `en-US` | Native US accent |
| Australian | `en-AU` | Native AU accent |
| Irish | `en-IE` | Native IE accent |
| South African | `en-ZA` | Native ZA accent |
| Indian | `en-IN` | Native IN accent |
| New Zealand | `en-NZ` | Native NZ accent |

## Differences from Android

| Feature | Android | iOS |
|---------|---------|-----|
| **Audio Playback** | `MediaPlayer` | `AVAudioPlayer` or `AVPlayer` |
| **Native TTS** | `TextToSpeech` | `AVSpeechSynthesizer` |
| **Audio Session** | Android audio focus | iOS audio session category/mode |
| **Locale Mapping** | `Locale` class | `AVSpeechUtterance.languageCode` |
| **Background Play** | Service + notification | Audio session category |

## Testing Checklist

- [ ] Polly MP3 streaming works over network
- [ ] Audio plays at correct volume (respect system volume)
- [ ] Fallback TTS works if network unavailable
- [ ] Accent changes work (British → American → etc.)
- [ ] Navigation audio interrupts current playback
- [ ] Queue continues after interruption
- [ ] Phone call/notification interrupts playback properly
- [ ] Memory cleanup when app backgrounded
- [ ] Works with AirPods, Bluetooth speakers, built-in speaker
- [ ] No audio dropouts during intense coaching sequences
- [ ] Battery efficiency (prefer predownloaded MP3 over TTS)

## Environment Variables Required

```bash
AWS_ACCESS_KEY_ID=xxx        # Already configured on backend
AWS_SECRET_ACCESS_KEY=xxx    # Already configured on backend
AWS_REGION=us-east-1         # Already configured on backend
```

iOS app just calls backend endpoint; backend handles Polly.

## Priority & Phasing

**Phase 1** (MVP): Basic playback
- Implement `PollyAudioManager` with AVAudioPlayer
- Implement queue processor
- Network audio streaming from backend

**Phase 2**: Robustness
- AVSpeechSynthesizer fallback
- Proper audio session management
- Interruption handling

**Phase 3**: Optimization
- Audio caching (predownload during screen time)
- Local TTS synthesis to reduce backend calls
- Background playback with notifications
