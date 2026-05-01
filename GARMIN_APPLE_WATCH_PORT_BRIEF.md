# Garmin Watch App to Apple Watch Port — Complete Design & Functionality Brief

**Purpose**: This document provides a comprehensive overview of how the AI Run Coach Garmin watch app is built, designed, and functions. Use this as your reference for porting to Apple Watch in Xcode.

---

## Executive Summary

The AI Run Coach Garmin app is a **premium real-time running coaching system** that pairs with the phone app via Bluetooth. It captures 23+ biometric metrics every 2 seconds, displays real-time AI coaching cues, and streams data back to the backend for analysis.

**Key principle**: The watch is the data collection + coaching display device. The phone is the computation + AI backend. The watch never does heavy computation—it streams raw metrics and displays coaching text.

---

## Architecture & Communication Flow

```
┌──────────────────┐
│  Garmin Watch    │  • Captures 23+ metrics every 2 sec
│  App (Monkey C)  │  • Displays coaching cues & dashboard
│                  │  • Streams to phone OR backend
└────────┬─────────┘
         │ Bluetooth (preferred)
         │ or HTTP (backend direct)
         │
┌────────▼──────────────────────┐
│  Phone App (Android/iOS)       │  • Receives watch metrics
│  PhoneLink messaging layer     │  • Stores in local DB
│                                │  • Uploads to backend
└────────┬──────────────────────┘
         │ HTTPS (on demand)
         │
┌────────▼──────────────────────┐
│  Backend Server (Node.js)      │  • Runs AI analysis
│  Claude API integration        │  • Returns coaching cues
│                                │  • Stores time-series data
└────────────────────────────────┘
```

---

## Watch App Structure (Monkey C)

### File Organization
```
garmin-companion-app/
├── source/
│   ├── AiRunCoachApp.mc        # Main entry point
│   ├── views/
│   │   ├── RunView.mc          # Primary dashboard (1041 lines)
│   │   └── StartView.mc        # Pre-run screen (346 lines)
│   └── networking/
│       ├── DataStreamer.mc     # Backend HTTP communication
│       └── PhoneLink.mc        # Phone Bluetooth messaging
├── resources/
│   ├── strings/strings.xml     # Localization
│   ├── layouts/layouts.xml     # UI layouts
│   ├── menus/menus.xml         # Menu definitions
│   └── drawables/              # Icons & images
├── manifest.xml                # App metadata & permissions
└── monkey.jungle               # Build configuration
```

### Key Classes

#### **AiRunCoachApp.mc** (Main Entry)
- Extends `App.AppBase`
- Initializes on app launch
- Returns `RunView` as the initial screen
- Listens for coaching cues from backend via `onCoachingCue()`
- Uses persistent storage for auth tokens and session IDs

#### **RunView.mc** (Dashboard - 1041 lines)
- **Most complex component** — handles all run-time logic
- Displays the arc dashboard with real-time metrics
- Manages state for running, paused, coaching, GPS acquisition
- Sensor integration (GPS, heart rate, cadence)
- Phone-controlled vs standalone modes
- Real-time metric streaming (every 250 ms tick update)

#### **StartView.mc** (Pre-run Screen)
- Shows three modes:
  1. **Waiting**: Not authenticated (no auth token)
  2. **Basic**: Authenticated, ready for free run
  3. **Coached**: Prepared run received from phone (with target pace, distance, workout type)
- Animates connection status and loading states
- Launches RunView when user presses START button

#### **DataStreamer.mc** (Backend Communication)
- Sends real-time metrics to backend API
- POST to `/api/garmin-companion/data` every 1 second
- Receives coaching cues piggybacked on response
- Handles authentication with Bearer token
- Manages session lifecycle

#### **PhoneLink.mc** (Phone Communication)
- Bluetooth messaging with phone app
- Registers for incoming phone messages
- Sends commands: `start`, `pause`, `resume`, `stop`, `watchReady`
- Receives: auth tokens, prepared run data, run updates, coaching cues
- Bi-directional: watch → phone runs data when phone-controlled

---

## Authentication & Authorization Flow

### Initial Setup
1. User opens phone app, starts pairing process
2. Phone app generates auth token (JWT)
3. Phone sends `auth` message to watch via Bluetooth:
   ```
   {
     "type": "auth",
     "authToken": "eyJhbGc...",
     "runnerName": "Daniel"
   }
   ```
4. Watch stores in persistent storage: `App.Storage.setValue("authToken", token)`
5. Watch shows "READY" screen (StartView basic mode)

### Token Persistence
- Auth token survives app restart (stored in watch's application storage)
- No token refresh needed (tokens are long-lived)
- Disconnect removes token from watch

---

## Running Modes

### Mode 1: Standalone Mode (Garmin Backend Direct)
**When**: Watch is disconnected from phone OR user manually starts run
**Data flow**:
- Watch captures metrics every 2 seconds via onSensor() and onPosition()
- Every 1 second, DataStreamer sends to `https://airuncoach.live/api/garmin-companion/data`
- Backend receives POST with: HR, HR zone, pace, distance, cadence, GPS, altitude, elapsed time
- Backend runs AI analysis, returns coaching cue in response body
- Watch receives cue, displays overlay for 5 seconds (`_coachingCueTicks = 20`)

**Pros**: Works without phone
**Cons**: Requires watch to have cellular or WiFi

### Mode 2: Phone-Controlled Mode (Preferred)
**When**: Phone app is open and connected
**Data flow**:
- Phone sends `runUpdate` message to watch every ~250 ms with computed metrics
- Watch uses these metrics (phone does the heavy computation)
- Watch streams raw GPS (watch's superior multi-band GPS) back to phone every 2 seconds
- Watch sends cadence + HR sensor data separately
- Phone compiles everything, uploads to backend

**Pros**: 
- Watch uses less power (phone does math)
- Watch GPS is more accurate than phone GPS
- Better battery life

**Cons**: Requires phone connection

### Mode Selection Logic
```
if phoneControlled {
  // Phone controlled: use phone's metrics
  // Watch still captures own sensor data
} else {
  // Standalone: use watch's own calculations
  _dataStreamer.sendData({...})
}
```

---

## Dashboard Design (RunView)

### Visual Layout (Arc Dashboard)

```
        ╔════════════════════════╗
        ║       12 o'clock       ║
        ║   [Time Elapsed]       ║
        ║                        ║
        ║    ┌──────────────┐    ║
        ║   ╱              ╲   ║  Zone Arc: 240° spanning top
        ║  │  ╱─────────╲  │   ║  Colors: Red(Z5) → Orange → Amber → 
        ║  │ │   PACE   │ │   ║  Green(Z2) → Blue(Z1)
        ║  │  ╲─────────╱  │   ║  Thickness: 11 pixels
        ║  │   [Primary]    │   ║  Glow effect on active zone
        ║   ╲              ╱   ║
        ║    └──────────────┘    ║
        ║                        ║
        ║  [Distance] | [HR]     ║  Secondary metrics
        ║  [Cadence]             ║  Smaller text
        ║                        ║
        ║  [Status / Coaching]   ║  Shows live coaching cue
        ║                        ║
        ╚════════════════════════╝
```

### Color Scheme
- **Background**: Pure black (#000000)
- **Bezel**: Gold (#B8960C, #D4AF37) - premium aesthetic
- **Zone Colors**:
  - Z1 (easy): Deep blue (#2979FF)
  - Z2 (steady): Green (#00E676)
  - Z3 (tempo): Amber (#FFD740)
  - Z4 (hard): Orange (#FF6D00)
  - Z5 (max): Red (#F44336)
- **Text**: White primary, gold secondary, gray tertiary
- **Active elements**: Bright gold (#FFD700), green for START button

### Metric Hierarchy

**Row 1 - Elapsed Time** (tiny, top center)
- Format: `MM:SS` or `H:MM:SS` depending on duration
- Updated every 250 ms tick

**Row 2 - Zone Arc** (visual centerpiece)
- 240° arc spanning watch top (12 o'clock centered)
- 5 colored segments: one for each HR zone
- Active zone: full color + breathing glow + pulse boost
- Inactive zones: dimmed
- Breathing animation: sine wave at ~0.6 rad/s (~10 second cycle)

**Row 3 - Primary Metric: PACE** (large, center)
- Format: `M:SS /km` (or /mi if imperial)
- Font: MEDIUM (largest readable)
- Color: White
- Smoothed with exponential moving average (α=0.15)
  - Prevents jittery GPS noise
  - Feels natural to read

**Row 4 - Secondary Metrics** (two-column layout)
- **Left**: Distance (`km`)
- **Right**: Heart rate (`bpm`)
- Font: SMALL
- Color: Gold secondary
- Both smoothed for readability

**Row 5 - Cadence** (bottom left or tertiary)
- Format: `cadence` (steps per minute)
- Font: TINY
- Color: Gray

**Row 6 - Status / Coaching** (bottom center)
- Pre-run: `Press START` (bright gold)
- Running: Can show coaching cue (overlay)
- Paused: `— PAUSED —` (orange banner)

### Coaching Cue Overlay
- Appears at top of screen as a translucent box
- Displays AI coaching text (max 2-3 lines)
- Auto-disappears after 5 seconds (`_coachingCueTicks = 20` at 250 ms each)
- Can be re-triggered by new cues
- Font: SMALL, white, centered

### Pre-Run Overlays

#### GPS Acquisition Screen
- Shows when GPS is not yet locked
- Displays:
  - Large "GPS" label in cyan (#00CFFF)
  - 4-bar signal strength indicator
    - Bars 0-4 based on GPS quality
    - Color changes: gray → red (no signal) → yellow → green (locked)
  - Quality label: "No signal" → "Last known" → "Poor" → **"Usable"** ← gate for START
  - Animated "Acquiring..." text with animated dots
  - Hint: "Stand still outdoors"
  - Warning: "START disabled"
- **Purpose**: User clearly understands they can't start until GPS is ready

#### Ready Screen (Basic Mode)
- Shows when authenticated but no prepared run
- Displays:
  - Gold "READY" text
  - Runner name (if available)
  - "Press START" instruction
- Breathing ring animation around center
  - Expands/contracts with breathing cycle
  - Gold color with multiple rings for depth

#### Coached Run Screen
- Shows when prepared run received from phone
- Displays:
  - Gold pill badge: "COACHED RUN"
  - Workout type: e.g., "Interval Run", "Tempo Run"
  - Workout description: e.g., "8x400m at 3:30 pace"
  - Target pace: e.g., "4:45 /km" (in bordered box)
  - Distance goal: e.g., "10.5 km"
  - "Press START" instruction
- Premium visual treatment (matches StartView coached mode)

---

## Real-Time Metrics Captured

### Every 2 Seconds (Phone Sync)
The watch captures these metrics from onPosition() and onSensor():

**GPS Data** (from Pos.Info):
- Latitude (degrees)
- Longitude (degrees)
- Altitude (meters)
- Speed (m/s)
- Bearing (direction, degrees)
- GPS accuracy (quality code: 0-4)

**Heart Rate** (from Sensor.Info):
- Heart rate (bpm)
- Calculated HR zone (1-5) based on user's max HR from UserProfile

**Movement** (from Sensor.Info):
- Cadence (steps/min)

**Advanced metrics** (if watch supports via Activity.Info):
- Ground contact time (ms)
- Ground contact balance (%)
- Vertical oscillation (cm)
- Vertical ratio (%)
- Stride length (m)
- Running power (watts)

### Data Smoothing
Real-time values use exponential moving average to reduce jitter:
```
displayValue = displayValue + (rawValue - displayValue) × α
```
Where α = 0.15 for pace/distance, 0.30 for HR/cadence

### Streaming

**Standalone Mode**:
- DataStreamer.sendData() called every 1 second
- HTTP POST to backend with all current metrics
- Payload includes sessionId for tracking

**Phone-Controlled Mode**:
- Phone sends runUpdate every ~250 ms with calculated metrics
- Watch sends raw GPS + HR + cadence to phone every 2 seconds
- Phone combines and uploads

---

## Button Mapping & User Interaction

### Button Actions (Universal Garmin Devices)

| Button | Pre-Run | Running | Paused |
|--------|---------|---------|--------|
| **START/SELECT** | Begin run | Pause run | Resume run |
| **BACK** | Exit app | Pause run | Finish & save |
| **UP/DOWN** | Not used | Not used | Not used |

### State Machine
```
Pre-Run (Waiting for GPS or not authenticated)
  ↓ [START]
  → Check GPS ready?
    → No: Vibe short, stay on screen
    → Yes: Begin run
         
Running
  ↓ [START]
  → Pause run
  
Paused
  ↓ [START]
  → Resume run
  ↓ [BACK]
  → Finish run (save + exit)
```

### Haptic Feedback
- `_vibeShort()`: Quick confirmation (START button, GPS lock, coaching cue)
- `_vibeLong()`: Session ended (run finished)

---

## Permissions Required

### manifest.xml
```xml
<iq:permissions>
    <iq:uses-permission id="Positioning"/>      <!-- GPS -->
    <iq:uses-permission id="Sensor"/>           <!-- HR, cadence -->
    <iq:uses-permission id="SensorHistory"/>    <!-- Advanced metrics -->
    <iq:uses-permission id="Communications"/>   <!-- Bluetooth + HTTP -->
    <iq:uses-permission id="PersistedContent"/>  <!-- Local storage -->
    <iq:uses-permission id="Fit"/>               <!-- FIT file format -->
    <iq:uses-permission id="UserProfile"/>      <!-- Max HR for zones -->
</iq:permissions>
```

---

## Watch Device Support

### Supported Garmin Devices
```
Fenix series:     6, 6 Pro, 6S, 6S Pro, 6X Pro, 7, 7S, 7X, 7 Pro, 7S Pro, 7X Pro
Forerunner:       55, 245, 255, 265, 745, 945, 955, 965
Vivoactive:       4, 5
Venu series:      (standard), 2, 2 Plus, 3
```

### API Level Requirement
- **Minimum**: Connect IQ 3.2.0
- Most devices use 4.x or 5.x (no compatibility issues)

---

## Key Algorithms & Calculations

### Heart Rate Zone Calculation
```
User's max HR from UserProfile.maxHeartRate (e.g., 185 bpm)

Zone boundaries (% of max):
  Z1 (easy):    50-60%    = 92-111 bpm
  Z2 (steady):  60-70%    = 111-129 bpm
  Z3 (tempo):   70-80%    = 129-148 bpm
  Z4 (hard):    80-90%    = 148-166 bpm
  Z5 (max):     90-100%   = 166-185 bpm

function _hrZone(hr) {
    var maxHr = UserProfile.maxHeartRate;
    var pct = (hr.toFloat() / maxHr.toFloat()) * 100.0;
    if (pct >= 90) return 5;
    if (pct >= 80) return 4;
    if (pct >= 70) return 3;
    if (pct >= 60) return 2;
    return 1;
}
```

### Pace Calculation (from GPS Speed)
```
Input: GPS speed in m/s
Output: Pace in seconds per km (for display as M:SS /km)

pace = 1000.0 / (speed_mps * 60.0)

Example:
  speed = 2.78 m/s
  pace = 1000 / (2.78 * 60) = 1000 / 166.8 = 5.99 min/km ≈ 5:59 /km
```

### Zone Arc Rendering
- 240° arc centered on 12 o'clock
- CCW (counter-clockwise) angle system:
  - 0° = 3 o'clock (right)
  - 90° = 12 o'clock (top)
  - 180° = 9 o'clock (left)
  - 270° = 6 o'clock (bottom)

**Zone segment mapping**:
```
Z5 (red):    336° → 20°   (wraps through 0°, lower-right)
Z4 (orange):  22° → 66°
Z3 (amber):   68° → 112°  (centered at 90° = 12 o'clock)
Z2 (green):  114° → 158°
Z1 (blue):   160° → 204°  (lower-left)
```

**Breathing animation** (sine wave at phase ~0.6 rad/s):
```
breath = (sin(ringPhase) + 1.0) × 0.5  // Maps [-1, 1] to [0, 1]
glow = breath × 2.5 + pulseBoost × 3.0
```

### Exponential Moving Average (Smoothing)
```
displayValue += (rawValue - displayValue) × alpha

For pace/distance:  α = 0.15 (more responsive)
For HR/cadence:     α = 0.30 (smoother)

Effect: Removes GPS jitter, creates smooth transitions
```

---

## Data Persistence & Storage

### App.Storage (Watch's Persistent Storage)
```
authToken       → JWT from phone (persists between app restarts)
runnerName      → User's name from phone
sessionId       → Current session ID (regenerated per run in standalone mode)
```

### Runtime State
All metrics are held in RunView member variables:
```
_heartRate, _heartRateZone, _distance, _pace, _elapsedTime, _cadence
_isRunning, _isPaused, _isCoached, _coachingCue
_gpsReady, _lastGpsLat, _lastGpsLng, _lastGpsAlt, _gpsQuality
```

### No Local Recording
- **Important**: Watch app does NOT save runs locally (unlike native Garmin Forerunner apps)
- Runs are only recorded on the phone app's side
- Watch is purely real-time display + coaching device

---

## Connection & Pairing Logic

### Phone ↔ Watch Messaging
**Bluetooth channel** (via PhoneLink):
```
watch → phone:  "watchReady", "start", "pause", "resume", "stop"
phone → watch:  "auth", "preparedRun", "startRun", "runUpdate", "coachingCue", "disconnect"
```

**HTTP channel** (DataStreamer, Standalone mode):
```
watch → backend:  POST /api/garmin-companion/data
backend → watch:  { "coaching": "cue text" } (piggybacked on response)
```

### Reconnection Logic
- If phone disconnects, watch continues running (depending on mode)
- Standalone mode: keeps streaming to backend
- Phone-controlled mode: gracefully degrades (stops updating metrics)
- User can re-pair by sending `watchReady` command when phone reconnects

---

## UI/UX Patterns

### Loading & Waiting States
- Animated dots: `"Waiting."` → `"Waiting.."` → `"Waiting..."` → `"Waiting"`
- Updates every 500 ms (`_dotCount` increments)
- Used for: GPS acquisition, phone connection, coaching cue arrival

### Color Coding
- **Gold/champagne** (#D4AF37, #B8960C): Premium branding, app identity
- **Zone colors**: Immediate visual feedback on effort level
- **Green**: GO/READY/Connected status
- **Orange**: Warnings, PAUSED state
- **Red/dim red**: Error states, not connected

### Text Sizing
- **FONT_MEDIUM**: Pace (primary metric)
- **FONT_SMALL**: Distance, HR, time
- **FONT_TINY**: Cadence, coaching text, labels
- **FONT_XTINY**: Fine details, quality label

### Contrast & Readability
- All text white or gold on black background (max contrast)
- No semi-transparent overlays (watch screens are small)
- Simple geometry, minimal visual clutter

---

## Performance Considerations

### Battery Impact
- GPS enabled: Drains battery fastest (~10% per hour of use)
- Sensor sampling (HR, cadence): Minimal impact
- Bluetooth communication: Moderate impact
- Screen updates: Every 250 ms (not optimized for sleep)

### Memory
- Small app: ~5-10 MB total
- Metric arrays: Minimal (only current values, not history)
- No image assets except icons

### Network
- Standalone mode: 1 HTTP request per second (light API load)
- Phone-controlled mode: Lightweight messages only
- Graceful degradation if network unavailable

---

## Error Handling

### GPS Failure
- If GPS doesn't acquire within reasonable time:
  - Show "No signal" in GPS wait screen
  - Keep showing wait screen (don't proceed)
  - User must restart app or move outdoors

### Network Failure
- DataStreamer stops sending but run continues
- Watch still displays metrics (uses onSensor callbacks)
- Coaching cues don't arrive (graceful degradation)

### Phone Disconnect
- Standalone mode: Run continues unaffected
- Phone-controlled mode: Run pauses OR continues with last-known metrics
- Watch doesn't crash, stays responsive

### Low Battery
- Watch app respects system low-battery state
- Gracefully exits if device powers off

---

## Apple Watch Port Considerations

### Direct Mapping
When porting to Apple Watch (Swift/SwiftUI):

| Garmin Concept | Apple Equivalent |
|---|---|
| Monkey C classes | Swift classes |
| Ui.View + onUpdate | SwiftUI @View |
| onSensor callback | HealthKit sensor fusion |
| Comm.makeWebRequest | URLSession API |
| Comm.registerForPhoneAppMessages | WatchConnectivity framework |
| App.Storage | UserDefaults + Keychain |
| Graphics drawing (Gfx.drawArc) | Canvas shapes (SwiftUI) |
| Timer.Timer (250 ms tick) | Timer + DispatchSourceTimer |
| Pos.enableLocationEvents | CLLocationManager |
| Sensor.enableSensorEvents | HealthKit queries |

### Feature Parity Checklist
- ✅ Real-time heart rate display with zone colors
- ✅ GPS tracking with pace calculation
- ✅ Cadence monitoring
- ✅ Coaching cue overlay
- ✅ Button controls (digital crown, action button)
- ✅ Pre-run state machine (waiting → ready → running → paused)
- ✅ Phone communication via WatchConnectivity
- ✅ Backend HTTP communication (if standalone)
- ✅ Persistent auth token storage
- ✅ Premium visual design (arc dashboard, zone colors)

### Differences to Account For
1. **Screen size**: Apple Watch screens are slightly different aspect ratios than Garmin
   - Adjust layout percentages accordingly
   - Test on 40mm and 44mm variants

2. **Graphics API**: SwiftUI Canvas has different primitives
   - Arc drawing is straightforward
   - Breathing animation uses SwiftUI @State + animation modifier

3. **Sensor access**: WatchConnectivity is simpler than Garmin's messaging
   - No separate phone link layer needed
   - Direct payload serialization

4. **Permissions**: Apple requires Privacy plist entries
   - NSHealthShareUsageDescription
   - NSLocationWhenInUseUsageDescription
   - NSBluetoothPeripheralUsageDescription (for phone link)

5. **Haptics**: Apple's HapticEngine has different patterns
   - Map Garmin's vibeShort/vibeLong to WKInterfaceDevice

---

## Testing on Device

### Garmin Testing
```bash
# Build for device
monkeyc -o bin/AiRunCoach.prg -f monkey.jungle -y developer_key.der -d fenix7 -w

# Install to device (USB connected)
monkeydo bin/AiRunCoach.prg fenix7

# View real-time logs
adb logcat | grep "AiRunCoach"
```

### Apple Watch Testing
```bash
# Build in Xcode
Cmd + B

# Run on simulator
Cmd + R (select Apple Watch simulator target)

# Install on physical device
Build → Run → Select device in Xcode organizer
```

---

## Key Insights for Implementation

### 1. The Arc Dashboard is the Star
- Spend time perfecting the zone arc rendering
- Breathing animation must feel natural (not jerky)
- Colors must be exactly right (user will compare to native Garmin)
- This is the primary differentiator from other apps

### 2. GPS Acquisition is Critical
- Never let user start run without usable GPS (quality ≥ 3)
- Show clear progress and hints
- This prevents "poor GPS data" complaints later

### 3. Phone Link is Non-Negotiable
- Apple Watch apps REQUIRE phone connection for most features
- Implement WatchConnectivity early
- Test extensively with phone sleep/disconnect scenarios

### 4. Metric Smoothing is Subtle but Important
- Users will notice jumpy pace/distance
- EMA with α=0.15 is proven to work
- Don't skip this to "save CPU"

### 5. Coaching Cue Integration
- Overlay must auto-dismiss (don't require user action)
- Can be re-triggered by new cues
- Vibrate when cue arrives (confirms feedback)

### 6. Real-Time Update Loop
- 250 ms tick is smooth but not excessive
- Don't update faster (wastes power)
- Don't update slower (feels laggy)

### 7. Storage is Minimal
- Only auth token and runner name need persistence
- All metric data flows live, never stored on watch
- This keeps app size small

---

## Deployment & Distribution

### Garmin Deployment
```bash
# Build release version
monkeyc -o bin/AiRunCoach.iq -f monkey.jungle -y developer_key.der -e -r

# Submit to Garmin Connect IQ Store
# 1. Go to apps.garmin.com/developer
# 2. Upload .iq file
# 3. Add screenshots (minimum 3)
# 4. Add description + release notes
# 5. Submit for review (3-5 business days)
```

### Apple Watch Deployment
```
1. Enroll in Apple Developer Program ($99/year)
2. Create App ID in Apple Developer portal
3. Configure signing certificates
4. Archive build in Xcode
5. Upload to App Store Connect
6. Submit for review (24-48 hours typical)
```

---

## Summary: What to Build

| Component | File | Language | Lines | Purpose |
|---|---|---|---|---|
| **Main App** | AiRunCoachApp | Swift | ~50 | Entry point, lifecycle |
| **Dashboard** | RunView | SwiftUI | ~1000+ | Real-time coaching display |
| **Pre-Run** | StartView | SwiftUI | ~350 | Setup & state selection |
| **Phone Link** | WatchConnectivity wrapper | Swift | ~100 | Bluetooth messaging |
| **Backend Comm** | APIClient | Swift | ~150 | HTTP requests |
| **Sensors** | SensorManager | Swift | ~200 | GPS + HealthKit fusion |
| **Models** | RunMetrics, CoachingCue | Swift | ~100 | Data structures |

**Total estimated code**: ~2000 lines Swift (vs ~1400 lines Monkey C)

---

## Final Checklist for Apple Watch Implementation

- [ ] Create Xcode project with Watch App target
- [ ] Set up WatchConnectivity for phone communication
- [ ] Implement HealthKit sensor collection (HR, cadence)
- [ ] Implement CLLocationManager for GPS tracking
- [ ] Build RunView with Canvas arc dashboard
- [ ] Implement zone color animation + breathing effect
- [ ] Build StartView with three modes (waiting/ready/coached)
- [ ] Add button handling (digital crown for menu, action button for start/pause)
- [ ] Implement UserDefaults + Keychain for auth token storage
- [ ] Add haptic feedback (HapticEngine)
- [ ] Test on 40mm and 44mm simulators
- [ ] Test on physical Apple Watch
- [ ] Configure privacy plist entries
- [ ] Test phone disconnection scenarios
- [ ] Optimize battery usage
- [ ] Submit to App Store

---

## Questions? Key Contacts in Codebase

**Garmin Watch Code Reference:**
- RunView.mc (1041 lines): All dashboard logic, metric collection, state management
- StartView.mc (346 lines): UI states and pre-run flow
- DataStreamer.mc (170 lines): Backend HTTP communication pattern
- PhoneLink.mc (98 lines): Phone Bluetooth messaging pattern

**Backend API Endpoints (to replicate on Apple Watch):**
- `POST /api/garmin-companion/session/start` - Start tracking session
- `POST /api/garmin-companion/data` - Send metrics every second
- `POST /api/garmin-companion/session/end` - End session

**Database Schema (to understand data model):**
- `runs` table: Aggregated run summary (1 row per run)
- `watch_biometric_samples` table: Time-series metrics (every 2 seconds, ~900 rows/hour)

---

## This Document is Your Specification

Print this out, share with your iOS team, and use it as your Apple Watch implementation spec. Everything you need is here:
- **What** to build (complete component list)
- **How** it works (algorithms, state machines, data flow)
- **Why** it matters (user experience justification)
- **When** it updates (timing, refresh rates)
- **Where** it talks to (phone, backend, sensors)

Good luck porting! 🍎⌚

