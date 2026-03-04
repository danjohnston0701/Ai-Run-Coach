# AI Run Coach - Comprehensive iOS Build Brief

> **For Xcode AI Agent:** This document contains everything needed to rebuild the Ai Run Coach app for iOS identically to the Android version.

---

## 1. App Overview

### What is AI Run Coach?

**Ai Run Coach** is an intelligent running app that provides real-time audio coaching during runs. Users can generate AI-powered routes, track runs with GPS, receive personalized coaching feedback, analyze performance, and share achievements.

### Target Audience
- Recreational runners wanting coaching guidance
- Intermediate runners improving pace and form
- Beginners building running habits
- Users who run with Garmin/Apple Watch without carrying a phone

### Core Value Proposition
Real-time AI audio coaching that adapts to your pace, heart rate, terrain, and running goals — without needing to look at your phone.

---

## 2. Navigation Structure

### Bottom Navigation (5 tabs)
1. **Home** (`/home`) - Dashboard with start run, recent activity, weather
2. **History** (`/history`) - Past runs list with filters
3. **Events** (`/events`) - Community events, parkruns
4. **Goals** (`/goals`) - User goals (distance, pace, frequency)
5. **Profile** (`/profile`) - User settings, coach settings, connected devices

### Screen Flow

```
App Launch
    │
    ▼
LoginScreen / SignUpScreen
    │
    ▼
MainScreen (Bottom Nav)
    │
    ├── HomeTab
    │   ├── DashboardScreen
    │   │   ├── StartRunButton → RunSetupScreen / MapMyRunSetupScreen
    │   │   ├── RouteGenerationScreen (generate new route)
    │   │   ├── RouteSelectionScreen (choose existing route)
    │   │   └── ConnectedDevicesScreen (Garmin, etc.)
    │   │
    │   └── RunSessionScreen (during active run)
    │       ├── Pre-run briefing (if route selected)
    │       ├── Active run UI (real-time metrics)
    │       └── Post-run summary
    │
    ├── HistoryTab
    │   ├── PreviousRunsScreen (list)
    │   └── RunSummaryScreen (detail for each run)
    │
    ├── EventsTab
    │   ├── EventsScreen (list)
    │   └── EventDetailScreen
    │
    ├── GoalsTab
    │   ├── GoalsScreen (list)
    │   └── CreateGoalScreen
    │
    └── ProfileTab
        ├── ProfileScreen (user info)
        ├── CoachSettingsScreen (AI coach voice/behavior)
        ├── FitnessLevelScreen
        ├── PersonalDetailsScreen
        ├── ConnectedDevicesScreen
        ├── SubscriptionScreen
        ├── NotificationsScreen
        └── FriendsScreen

Additional Flows:
├── GroupRunsScreen → CreateGroupRunScreen
├── LiveTrackingScreen (share live location)
└── ShareImageEditorScreen (create run share image)
```

---

## 3. All Screens Detail

### 3.1 Login & Onboarding

**LoginScreen**
- Email/password fields
- "Login" button (primary)
- "Forgot Password?" link
- "Sign Up" link
- Background gradient

**SignUpScreen**
- Name, email, password fields
- Fitness level selector (beginner/intermediate/advanced)
- Coach gender preference (male/female/neutral)
- Sign up button

**LocationPermissionScreen**
- Location permission request
- Explanation of why location needed
- "Allow" / "Not Now" options

### 3.2 Home Dashboard

**DashboardScreen**
- **Weather Widget**: Current temp, conditions, "Good for running" indicator
- **Start Run Button**: Large CTA, opens run setup
- **Quick Actions**:
  - "Generate Route" - AI route generation
  - "Select Route" - choose existing route
  - "Group Run" - create/join group run
- **Recent Activity**: Last 3 runs summary
- **Connected Device Status**: Garmin/Apple Watch battery, sync status
- **Weekly Stats**: Distance, time, runs count

### 3.3 Run Setup

**RunSetupScreen / MapMyRunSetupScreen**
- **Goal Type Selector**:
  - Free Run (no target)
  - Distance Target (5K, 10K, half marathon, custom)
  - Time Target (30 min, 1 hour, custom)
  - Pace Target (run at specific pace)
- **Route Options**:
  - Start from current location
  - Select saved route
  - Generate new route
- **AI Coach Toggle**: Enable/disable audio coaching
- **Auto-Pause Toggle**: Pause when stopped
- **Start Button**: Begin run

**RouteGenerationScreen**
- **Distance Slider**: 1km to 50km
- **Difficulty Selector**: Easy, Moderate, Hard, Extreme
- **Terrain Type**: Flat, Hilly, Mixed, Mountainous
- **Return to Start Toggle**: Loop route or out-and-back
- **Generate Button**: Creates AI route
- **Map Preview**: Shows generated route polyline
- **Save/Start Route**: Options after generation

### 3.4 Run Session (Core Screen)

**RunSessionScreen - Pre-Run (with route)**
- Route map preview
- Turn-by-turn preview (scrolling list)
- Terrain summary (elevation profile)
- Distance, estimated time
- "Start Run" button
- Audio briefing toggle

**RunSessionScreen - Active Run (GPS tracking)**

*Primary Display (large, readable):*
- **Timer**: "00:00:00" format, very large
- **Distance**: "0.00 km" format
- **Current Pace**: "6:30 /km" (real-time)
- **Average Pace**: "6:45 /km" (smaller)

*Secondary Metrics (smaller):*
- Heart Rate (if connected device)
- Cadence (steps/min)
- Elevation/Current gradient

*AI Coach Panel:*
- Current coaching message (scrolling text)
- Coach avatar/icon
- Mute button

*Map Display:*
- Current location marker
- Route polyline (gradient: cyan → green)
- Turn indicators
- Distance to next turn

*Controls:*
- Pause/Resume button (large)
- Stop button (end run)
- Lock screen button (prevents accidental touches)
- Audio feedback indicator

**RunSessionScreen - Pause State**
- "PAUSED" overlay
- Time/distance still visible (dimmed)
- "Resume" button
- "End Run" button

### 3.5 Run Summary

**RunSummaryScreen**
- **Header**: Date, run name, duration
- **Primary Stats Grid**:
  - Distance, Time, Average Pace
  - Calories, Elevation Gain
- **Performance Chart**:
  - Pace per km (bar chart)
  - Heart rate zones (if available)
- **AI Insights**:
  - Performance summary
  - Strengths
  - Areas for improvement
  - Personalized tips
- **Splits Table**: Per-kilometer times
- **Map**: GPS track visualization
- **Struggle Points**: Detected pace drops (if any)
- **Weather**: Conditions during run
- **Save/Discard Options**
- **Share Button**: Generate shareable image

### 3.6 History

**PreviousRunsScreen**
- Filterable list (date range, distance, device)
- Run cards showing: date, distance, time, pace
- Tap to view RunSummaryScreen

### 3.7 Events

**EventsScreen**
- List of community events (parkruns, races)
- Event cards: name, date, location, distance
- Filter by: upcoming, past, nearby

**EventDetailScreen**
- Event name, description
- Date/time
- Location (map)
- Route info
- "Register" / "Join" button

### 3.8 Goals

**GoalsScreen**
- Active goals list
- Progress bars
- Goal types: distance milestones, pace targets, frequency

**CreateGoalScreen**
- Goal type selector
- Target input (distance/time/pace)
- Deadline picker
- Priority selector

### 3.9 Profile

**ProfileScreen**
- User avatar, name, email
- Quick stats (total distance, runs)
- Settings sections (collapsible)
- Logout button

**CoachSettingsScreen** (Critical)
- **Coach Name**: Customizable (default: "AI Coach")
- **Coach Voice**:
  - Gender (Male/Female/Neutral)
  - Accent (British, American, Australian, Irish)
  - Tone (Energetic, Calm, Humorous, Professional)
- **Coaching Features Toggles**:
  - Pace coaching
  - Route navigation
  - Elevation coaching
  - Heart rate coaching
  - Cadence/stride coaching
  - Km split announcements
  - Struggle detection
  - Motivational coaching
  - Half-km check-in
- **Split Interval**: 1km, 2km, 3km, 5km, 10km

**ConnectedDevicesScreen**
- Paired devices list
- Device cards: name, type, battery, status
- "Connect New Device" button
- Garmin connect flow
- Apple Watch sync status

**FitnessLevelScreen**
- Assessment run or manual input
- Calculates VO2 max estimate
- Sets training zones

**PersonalDetailsScreen**
- DOB, gender, height, weight
- Emergency contact
- Medical notes

**SubscriptionScreen**
- Plan tiers display
- Current subscription status
- Upgrade/downgrade options

---

## 4. UI/Brand Guidelines

### Color Palette

```swift
// Primary Brand
primary = "#00D4FF"        // Bright cyan - main accent
primaryDark = "#00B8E6"    // Pressed state
accent = "#FF6B35"         // Orange - CTAs

// Semantic
success = "#00E676"        // Green - achievements
warning = "#FFB300"        // Amber - caution
error = "#FF5252"          // Red - errors

// Background (dark theme)
backgroundRoot = "#0A0F1A" // Main background
backgroundDefault = "#111827"
backgroundSecondary = "#1F2937"  // Cards
backgroundTertiary = "#374151"   // Inputs

// Text
textPrimary = "#FFFFFF"
textSecondary = "#A0AEC0"
textMuted = "#718096"

// Borders
border = "#2D3748"
borderLight = "#4A5568"

// Route gradient
routeGradientStart = "#00D4FF"  // Cyan
routeGradientEnd = "#00E676"    // Green
```

### Typography

- **Headings**: Bold, large (24-32sp)
- **Body**: Regular (16sp)
- **Captions**: Light (12-14sp)
- **Numbers (run metrics)**: Monospace-style, very large for primary metrics

### Layout Principles

1. **Dark theme only** - All backgrounds dark blue-black
2. **Card-based** - Content in rounded cards (#1F2937)
3. **Bottom sheet modals** - For secondary actions
4. **Full-screen maps** - For route display
5. **Large touch targets** - For use while running
6. **High contrast** - White text on dark backgrounds

### Iconography
- Outlined icons (not filled)
- Consistent 24dp size for navigation
- Custom icons for: run, heart, chart, calendar, target, profile

---

## 5. Feature Deep Dive

### 5.1 Route Generation

**Algorithm**:
1. User sets: distance (1-50km), difficulty, terrain
2. System gets current location via GPS
3. AI generates route using OpenStreetMap data
4. Route includes: waypoints, elevation profile, turn instructions

**Route Data Structure**:
- Polyline (encoded coordinates)
- Elevation gain/loss
- Turn instructions (turn type, distance, street name)
- Difficulty rating
- Terrain classification

**Route Display**:
- Map with gradient polyline (cyan → green)
- Elevation profile chart
- Turn-by-turn list with distance to each turn

### 5.2 Run Session Logic

**GPS Tracking**:
- Location updates every 1-3 seconds
- Distance calculated from GPS points
- Pace calculated from recent 30-second window (current) and total average

**Real-Time Calculations**:
- Current pace: rolling 30-second average
- Average pace: total distance / total time
- Cadence: from connected device or estimated
- Heart rate: from device
- Elevation: from GPS altitude
- Gradient: calculated from elevation change over distance

**Auto-Pause**:
- Detects when runner stops (speed < 0.5 m/s)
- Pauses timer automatically
- Resumes when movement detected

### 5.3 AI Coaching Triggers

**All toggles are configurable in CoachSettingsScreen:**

| Feature | Trigger | Audio Message Example |
|---------|---------|----------------------|
| **Pace Coaching** | Every 30 seconds | "Your pace is 6:30. Target is 6:00. Pick it up!" |
| **Route Navigation** | 100m before turn | "In 100 metres, turn left onto Smith Street" |
| **Elevation Coaching** | When gradient > 5% | "You're approaching a hill. Shorten your stride." |
| **Heart Rate Coaching** | When HR enters new zone | "You're now in zone 4. Push through!" |
| **Cadence/Stride** | Every 2 minutes | "Cadence is 170. Try to increase to 180." |
| **Km Splits** | At each km marker | "First kilometre: 6 minutes 30 seconds." |
| **Struggle Detection** | Pace drops > 20% | "You're struggling. Slow down and find your rhythm." |
| **Motivational** | At 25%, 50%, 75% | "Quarter way there! You're doing great." |
| **Half-km Check-in** | At 500m | "First 500m looks good. Heart rate is 145." |

**Coaching Message Sources**:
- Pre-written statements (tone-specific)
- Dynamic messages based on real-time data
- Backend AI generation (for complex insights)

### 5.4 Group Runs

**CreateGroupRunScreen**:
- Group name
- Date/time
- Meeting point (map picker)
- Route selection
- Max participants
- Invite friends

**GroupRunsScreen**:
- List of active/upcoming group runs
- Join/create buttons
- Participant list

**During Group Run**:
- See other runners on map (if live tracking enabled)
- Group leader can start/pause
- Shared route

### 5.5 Live Tracking

**LiveTrackingScreen**:
- Generate shareable link
- View on web (non-app users)
- Real-time position updates
- Option to show pace/HR

**Sharing Options**:
- Link generation (expires after 24h)
- Web viewer (simple map + stats)

### 5.6 Connected Devices

**Supported Devices**:
- Garmin (via Garmin Connect API)
- Apple Watch (via HealthKit)
- Samsung Watch
- Coros
- Fitbit

**Pairing Flow**:
1. User taps "Connect Device"
2. Select device type
3. OAuth/ Bluetooth pairing
4. Sync confirmation

**During Run**:
- Auto-connect to paired device
- Read: HR, cadence, stride length
- Display in run session UI
- Store in run data

---

## 6. API Endpoints (Backend)

The iOS app communicates with the backend at `https://airuncoach.live` (production) or `http://10.0.2.2:3000` (development).

### Authentication
- `POST /auth/login` - Login
- `POST /auth/register` - Sign up
- `POST /auth/refresh` - Refresh token

### Routes
- `GET /routes` - List user's routes
- `POST /routes/generate` - AI generate route
- `GET /routes/{id}` - Get route detail

### Runs
- `POST /runs` - Save run
- `GET /runs` - List runs (paginated)
- `GET /runs/{id}` - Get run detail
- `GET /runs/{id}/ai-insights` - Get AI analysis

### User
- `GET /user` - Get profile
- `PUT /user` - Update profile
- `PUT /user/coach-settings` - Update coach preferences

### Social
- `GET /events` - List events
- `GET /goals` - List goals
- `GET /friends` - List friends

### Device Integration
- `GET /devices` - Get connected devices
- `POST /devices/garmin/connect` - Garmin OAuth

---

## 7. Data Models (Reference)

All data models are available in the shared KMP module at `/shared/src/commonMain/kotlin/live/airuncoach/airuncoach/shared/`

Key models:
- `RunSession` - Complete run data
- `LocationPoint` - GPS coordinate
- `KmSplit` - Per-km timing
- `GeneratedRoute` - AI route
- `User` - Profile data
- `Goal` - User goals
- `ConnectedDevice` - Paired devices
- `CoachingFeaturePreferences` - AI settings

---

## 8. Key Differences: Android vs iOS

### Platform-Specific Implementation Required

| Feature | Android Implementation | iOS Implementation |
|---------|----------------------|-------------------|
| **GPS** | Google Play Services Location | CoreLocation |
| **Health Data** | Health Connect | HealthKit |
| **Audio TTS** | Android TTS | AVSpeechSynthesizer |
| **Notifications** | Firebase Cloud Messaging | APNs |
| **Background Run** | Foreground Service | Background Modes |
| **Maps** | Google Maps SDK | MapKit |
| **Bluetooth** | Android Bluetooth API | CoreBluetooth |
| **Watch Connection** | Wear OS APIs | WatchConnectivity |

### Shared (in KMP Module)

All business logic, calculations, and data models are shared:
- GAP calculations
- Run analytics
- Fitness calculations (CTL/ATL/TSB)
- All data models
- API DTOs
- Coaching logic

---

## 9. Testing Checklist

Before release, verify:

- [ ] GPS tracking accuracy
- [ ] Audio coaching triggers at correct times
- [ ] Route generation produces valid routes
- [ ] Connected device sync works
- [ ] Run data saves to backend
- [ ] AI insights generate correctly
- [ ] UI matches Android screens exactly
- [ ] Bottom navigation works correctly
- [ ] Dark theme applied consistently

---

## 10. Assets Required

### Images (to be ported from Android)
- App icon (all sizes)
- Onboarding illustrations
- Empty state illustrations
- Achievement badges
- Coach avatar placeholders

### Icons
- All navigation icons (home, chart, calendar, target, profile)
- Action icons (play, pause, stop, mute)
- Device icons (garmin, apple watch)
- Social icons

---

*Last Updated: March 2026*
*For Xcode AI Agent use - Ai Run Coach iOS Build*