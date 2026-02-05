# Garmin Companion App - Complete Architecture

## ❌ Q1: Can the user start Garmin's native app and we auto-start our companion app?

**NO** - This is not possible. Here's why:

### How Garmin Connect IQ Actually Works:

**User MUST explicitly start YOUR app on their watch:**
1. User goes to watch menu
2. Selects "AI Run Coach" app (your Connect IQ app)
3. Starts the activity

**You CANNOT:**
- ❌ Automatically launch when they start Garmin's native run tracking
- ❌ Hook into Garmin's native activities
- ❌ Run in the background while they use Garmin's app

**Why?**
- Garmin Connect IQ apps are sandboxed
- Only ONE activity app can run at a time on the watch
- Security/battery constraints prevent background monitoring

---

## 🎯 Q2: Will the user see data on BOTH Garmin app and AI Run Coach app?

**NO** - It's ONE or the OTHER:

### Scenario A: User Starts YOUR Connect IQ App ✅
- ✅ **Watch displays:** YOUR app's UI (shows AI coaching, stats, HR)
- ✅ **Phone displays:** Your Android app (map, detailed stats, route)
- ✅ **Backend receives:** Real-time data stream
- ✅ **Watch receives:** AI coaching audio + text prompts
- ❌ **Garmin's native app:** Not running

### Scenario B: User Starts Garmin's Native App
- ✅ **Watch displays:** Garmin's native UI
- ✅ **Garmin Connect:** Syncs data after run
- ❌ **Your app:** Gets nothing in real-time
- ⚠️ **Your app:** Can sync the completed activity via Garmin Connect API later

**THE KEY INSIGHT:**
Your Garmin Connect IQ app **REPLACES** Garmin's native running app. The user chooses one or the other.

---

## 📊 Q3: What real-time data do we get beyond heart rate?

### ✅ TONS OF DATA! (Your Backend is Already Ready)

Looking at your backend's `garminRealtimeData` table, here's everything you get:

#### **Heart Rate & Zones** 💓
```kotlin
heartRate: Int                    // BPM (beats per minute)
heartRateZone: Int               // 1-5 (recovery → max effort)
```

#### **GPS & Location** 🗺️
```kotlin
latitude: Float                  // Real-time position
longitude: Float                 // Real-time position
altitude: Float                  // Elevation in meters
speed: Float                     // Current m/s
pace: Float                      // Seconds per km
```

#### **Advanced Running Dynamics** 🏃 (If watch supports it)
```kotlin
cadence: Int                     // Steps per minute
strideLength: Float              // Meters per stride
groundContactTime: Float         // Milliseconds foot is on ground
groundContactBalance: Float      // Left/right balance percentage
verticalOscillation: Float       // Up/down bounce in centimeters
verticalRatio: Float             // Efficiency metric
power: Int                       // Running power in watts (if supported)
```

#### **Environmental** 🌡️
```kotlin
temperature: Float               // Current temp from watch sensor
```

#### **Activity Status** ⏸️
```kotlin
activityType: String             // "running", "walking", etc.
isMoving: Boolean               // Currently moving?
isPaused: Boolean               // User paused?
```

#### **Cumulative Stats** 📈
```kotlin
cumulativeDistance: Float        // Total meters so far
cumulativeAscent: Float         // Total climb in meters
cumulativeDescent: Float        // Total descent in meters
elapsedTime: Int                // Total elapsed seconds
```

---

## 🔄 Complete Data Flow Architecture

### The Full Picture:

```
┌─────────────────────────────────────────────────────────────────┐
│                      GARMIN WATCH                               │
│                   (Your Connect IQ App)                         │
│                                                                 │
│  UI Displays:                                                   │
│  • Current HR + Zone                                            │
│  • Distance, Pace, Time                                         │
│  • AI Coaching Text                                             │
│  • Elevation Profile                                            │
│  • Map (if you add it)                                          │
│                                                                 │
│  Every 1 second: Streams data ↓                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                   📡 POST /api/garmin-companion/data
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR BACKEND SERVER                          │
│                                                                 │
│  1. Receives realtime data point                                │
│  2. Stores in garmin_realtime_data table                        │
│  3. Forwards to Android app via WebSocket/polling               │
│  4. Generates AI coaching based on data                         │
│  5. Sends coaching back to watch                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
         ┌──────────────────┴──────────────────┐
         ↓                                     ↓
┌─────────────────────┐            ┌─────────────────────┐
│   GARMIN WATCH      │◄───────────│   ANDROID PHONE     │
│  (Receives back)    │   Audio    │                     │
│                     │   Text     │  Displays:          │
│  • AI coaching text │◄───────────│  • Full map         │
│  • Audio prompts    │            │  • Detailed stats   │
│  • Pace feedback    │            │  • Route overlay    │
│                     │            │  • Charts           │
└─────────────────────┘            │  • AI insights      │
                                   └─────────────────────┘
```

---

## 🎮 User Experience Flow

### Starting a Run with Your Companion App:

**Step 1: User Opens Watch**
- Navigates to "AI Run Coach" in watch app menu
- Taps to start

**Step 2: Watch App Launches**
- Shows: "Connecting to AI Run Coach..."
- Authenticates with backend (JWT token)
- Creates companion session
- Displays: "Ready to Start"

**Step 3: User Opens Phone App (Optional)**
- Android app detects active watch session
- Shows: "Garmin Watch Connected 🟢"
- Displays real-time map with watch's GPS location
- Shows live stats synced from watch

**Step 4: User Starts Run**
- Taps "Start" on watch
- Watch begins streaming data every second
- Backend receives:
  ```json
  {
    "sessionId": "abc123",
    "timestamp": 1706644800,
    "heartRate": 145,
    "heartRateZone": 3,
    "latitude": 37.7749,
    "longitude": -122.4194,
    "altitude": 52.3,
    "speed": 3.33,
    "pace": 300,
    "cadence": 172,
    "cumulativeDistance": 523.5,
    "isMoving": true,
    "isPaused": false
  }
  ```

**Step 5: AI Coaching Triggers**
- Backend detects: "User at 1km mark"
- Generates: "Great pace! You're in Zone 3, perfect for this distance. Keep it steady!"
- Sends audio + text to watch
- Watch vibrates, displays text, plays audio

**Step 6: Throughout Run**
- Watch continuously streams 20+ data fields
- Phone displays live map with runner's position
- AI coaching triggers based on:
  - HR zone changes
  - Pace variations
  - Elevation changes
  - Distance milestones
  - User questions (voice input on watch)

**Step 7: Run Complete**
- User taps "Finish" on watch
- Final data sync
- Backend generates post-run analysis
- Both watch and phone show summary
- Data saved to your database
- **BONUS:** Can also sync to Garmin Connect if you want!

---

## 💪 Advantages vs. Other Options

### Garmin Companion App vs. Bluetooth HR Monitor

| Feature | Companion App | BT HR Monitor |
|---------|---------------|---------------|
| **Heart Rate** | ✅ Yes | ✅ Yes |
| **GPS Location** | ✅ Yes | ❌ No |
| **Cadence** | ✅ Yes | ❌ No |
| **Running Dynamics** | ✅ Yes (GCT, VO, etc.) | ❌ No |
| **Elevation** | ✅ Yes | ❌ No |
| **AI Coaching on Watch** | ✅ Yes | ❌ No |
| **User Interaction** | ✅ Yes (buttons, touch) | ❌ No |
| **Extra Hardware** | ❌ No | ✅ Yes ($50-100) |
| **Works on Any Phone** | ✅ Yes | ✅ Yes |

---

## 🛠️ What Needs to Be Built

### Phase 1: Garmin Connect IQ App (Watch Side)
**Language:** Monkey C (Garmin's language)  
**Time Estimate:** 1-2 weeks

**Components:**
1. **Main Activity View** (runs on watch)
   ```
   ┌────────────────────────┐
   │   AI Run Coach         │
   │                        │
   │   ❤️ 145 BPM (Zone 3) │
   │   ⏱️ 12:34            │
   │   📍 2.5 km           │
   │   ⚡ 5:00/km          │
   │                        │
   │   "Great pace! Keep   │
   │    it steady."        │
   │                        │
   │   [Pause]    [Menu]   │
   └────────────────────────┘
   ```

2. **Data Streaming Module**
   - Read HR from watch sensors
   - Get GPS position
   - Get cadence, pace, elevation
   - Send to backend every 1 second

3. **Coaching Display Module**
   - Receive text coaching from backend
   - Play audio coaching
   - Show alerts/vibration

4. **Menu System**
   - Start/Stop/Pause run
   - Settings
   - View stats

---

### Phase 2: Android App Integration
**Time Estimate:** 3-4 days

**What to Add:**

1. **Companion Session Manager**
   ```kotlin
   class GarminCompanionManager(
       private val apiService: ApiService
   ) {
       suspend fun detectActiveWatchSession(): CompanionSession?
       
       suspend fun subscribeToRealtimeData(
           sessionId: String,
           onDataReceived: (GarminRealtimeData) -> Unit
       )
       
       suspend fun sendCoachingToWatch(
           sessionId: String,
           text: String,
           audioUrl: String
       )
   }
   ```

2. **Live Map with Watch GPS**
   - Display runner's position from watch
   - Update every second
   - Show route overlay if using route

3. **Watch Stats Dashboard**
   - Display all data from watch
   - HR graph, cadence graph, pace graph
   - Show what watch is displaying

4. **Bi-directional Communication**
   - Send coaching from phone to watch
   - Receive watch button presses
   - Sync settings

---

## 📱 Backend Already Has Everything! ✅

Your backend is **100% ready** for this. The endpoints exist:

```typescript
// ✅ ALREADY BUILT
POST /api/garmin-companion/auth              // Authenticate watch
POST /api/garmin-companion/session/start     // Start new session
POST /api/garmin-companion/session/link      // Link to run
POST /api/garmin-companion/data              // Stream realtime data
POST /api/garmin-companion/session/end       // End session

// Database table ready
garminRealtimeData {
  // All 20+ fields ready to receive data
}

garminCompanionSessions {
  // Session tracking ready
}
```

---

## 🎯 Summary: Answering Your Questions

### Q1: Can we auto-start from Garmin's native app?
**NO** - User must explicitly start YOUR Connect IQ app. It replaces Garmin's native app.

### Q2: Will user see data on both Garmin and AI Run Coach?
**NO** - Only YOUR app runs on watch. But YOUR app shows everything Garmin would show PLUS AI coaching.

### Q3: Do we get more than just heart rate?
**YES!** You get 20+ data fields:
- ❤️ Heart rate + zones
- 🗺️ GPS position (lat/long/altitude)
- 📊 Speed, pace, distance
- 🏃 Cadence, stride length
- 📈 Ground contact time, vertical oscillation
- ⚡ Running power (if supported)
- 🌡️ Temperature
- ⏸️ Activity status (moving/paused)

---

## 💎 The Killer Feature

**You're not just getting data FROM the watch...**

**...you're SENDING AI coaching TO the watch!**

The watch becomes a **dedicated AI coaching device** that:
- ✅ Displays real-time AI feedback
- ✅ Plays audio coaching
- ✅ Shows pace/HR zone guidance
- ✅ Responds to user voice input
- ✅ Adjusts coaching based on struggle detection

**No competitor does this.**

---

## 🚀 Next Steps

If you want to build this, the priority order is:

1. **Learn Garmin Connect IQ SDK** (2-3 days)
2. **Build minimal Watch app** (1 week)
   - Display HR, pace, distance
   - Stream data to backend
3. **Add Android integration** (3-4 days)
   - Subscribe to watch data
   - Display on phone map
4. **Add coaching back to watch** (2-3 days)
   - Send text prompts
   - Send audio files
5. **Polish & publish** (1 week)
   - Test on real device
   - Submit to Connect IQ Store

**Total time: 3-4 weeks for full implementation**

**Want me to help you get started on the Garmin Connect IQ app?** I can create the initial project structure and authentication flow! 🎮
