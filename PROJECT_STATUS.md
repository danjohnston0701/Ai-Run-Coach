# AI Run Coach - Project Status & Roadmap

**Last Updated:** January 24, 2026  
**Last Session:** Create Goal screen complete - Full goal creation flow with 4 categories  
**Next Priority:** Route Generation System (Feature #3) or AI Coaching (Feature #4)

---

## 🎯 Project Overview

AI Run Coach is an Android fitness tracking app with AI-powered coaching, GPS tracking, and wearable device integration.

**Total Features:** 58+  
**Completed:** 6 (Branding, GPS, Weather, Dashboard, Icons, Navigation, Create Goal)  
**Specifications Received:** 9 major feature areas documented  
**In Progress:** None  
**Remaining:** 52+ features

---

## ✅ Completed Features

### Feature 1: App Logo & Branding ✓
**Completed:** January 24, 2026  
**Status:** Production Ready

**What was done:**
- Updated launcher icons to use `icon.png` for all device icons
- Configured adaptive icon system with dark theme background (#0A0F1A)
- Updated `ic_launcher_foreground.xml` to reference app logo
- Updated `ic_launcher_background.xml` with brand colors
- Removed unused icons: `splash_icon.png`, `android_icon_background.png`
- Verified AndroidManifest.xml icon references

**Files Modified:**
- `app/src/main/res/drawable/ic_launcher_foreground.xml`
- `app/src/main/res/drawable/ic_launcher_background.xml`
- `app/src/main/res/mipmap-anydpi/ic_launcher.xml`
- `app/src/main/AndroidManifest.xml`

---

### Feature 2: Real GPS Tracking & Weather Data ✓
**Completed:** January 24, 2026  
**Status:** Functional (API key required for weather)

**What was done:**

#### GPS Tracking Implementation:
- Created `RunTrackingService` with foreground service + wake locks for screen-off reliability
- Implemented Google Play Services FusedLocationProvider for accurate GPS
- Added Haversine formula for precise distance calculations
- Real-time pace, speed, and calorie tracking
- GPS accuracy filtering (>20m rejected)
- 2-second location update intervals
- Auto-restart on system kill (START_STICKY)

#### Weather Integration:
- Created `WeatherRepository` with OpenWeatherMap API
- Real device GPS location used for weather data
- Live temperature, humidity, wind speed
- Fallback to last known location

#### Data Persistence:
- `RunRepository` for saving run sessions
- Weekly statistics calculation (runs, distance, pace)
- SharedPreferences storage (TODO: migrate to Room DB)

#### Dashboard Updates:
- Removed mock data
- Connected to real WeatherRepository
- Connected to real RunRepository for stats
- Updated `DashboardViewModel` to use live data sources

**Files Created:**
- `app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`
- `app/src/main/java/live/airuncoach/airuncoach/data/WeatherRepository.kt`
- `app/src/main/java/live/airuncoach/airuncoach/data/RunRepository.kt`
- `app/src/main/java/live/airuncoach/airuncoach/domain/model/LocationPoint.kt`
- `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt`
- `app/src/main/java/live/airuncoach/airuncoach/network/WeatherApiService.kt`
- `app/src/main/java/live/airuncoach/airuncoach/network/WeatherRetrofitClient.kt`
- `app/src/main/java/live/airuncoach/airuncoach/network/model/WeatherResponse.kt`

**Files Modified:**
- `app/build.gradle.kts` (added Google Play Services Location, OkHttp logging)
- `app/src/main/AndroidManifest.xml` (added WAKE_LOCK, POST_NOTIFICATIONS, service declaration)
- `app/src/main/java/live/airuncoach/airuncoach/viewmodel/DashboardViewModel.kt`

**Dependencies Added:**
- `com.google.android.gms:play-services-location:21.1.0`
- `com.squareup.okhttp3:logging-interceptor:4.12.0`

**⚠️ Action Required:**
- Get OpenWeatherMap API key from https://openweathermap.org/api
- Replace `YOUR_API_KEY_HERE` in `app/build.gradle.kts` (lines 38 & 44)

**Known Limitations:**
- Doze mode may pause tracking after 30+ minutes screen off
- GPS unreliable indoors/tunnels
- Manufacturer battery optimization may interfere (user must whitelist app)
- Power saving mode reduces GPS accuracy

---

### Feature 2.1: Dashboard UI Redesign ✓
**Completed:** January 24, 2026  
**Status:** Production Ready

**What was done:**
- Complete dashboard rebuild to match design specifications
- Removed weekly stats section
- Added Garmin connection status card (conditional rendering)
- Updated user avatar to show runner icon instead of initials
- Redesigned goal card with circular icon background and + button
- Rebuilt target time card with proper ON/OFF toggle and time picker
- Updated action buttons (MAP MY RUN + RUN WITHOUT ROUTE)
- Styled bottom navigation bar (consistent across all screens)

**Garmin Connection Logic:**
- Created `GarminConnection` data model with connection state
- Added `garminConnection` StateFlow to `DashboardViewModel`
- Connection stored in SharedPreferences (`"garmin_connection"`)
- **Card only displays when device is connected** (`isConnected = true`)
- Shows real device name and last sync timestamp
- Smart time formatting ("37m ago", "2h ago", etc.)

**Files Created:**
- `app/src/main/java/live/airuncoach/airuncoach/domain/model/GarminConnection.kt`

**Files Modified:**
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/DashboardScreen.kt` (major redesign)
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt` (bottom nav styling)
- `app/src/main/java/live/airuncoach/airuncoach/viewmodel/DashboardViewModel.kt`

**Components Removed:**
- `WeeklyStatsSection` (not in design)
- `StatCard` (not needed)
- `EditableTimeInput` (replaced with `TimePickerColumn`)
- `CustomSwitch` (replaced with inline toggle)

**Components Added:**
- `GarminConnectionCard` (conditional rendering)
- `TimePickerColumn` (improved time input)

---

### Feature 2.2: Weather Impact Analysis Data Collection ✓
**Completed:** January 24, 2026  
**Status:** Production Ready (awaits OpenAI integration)

**CRITICAL FEATURE:** This enhancement enables future AI-powered weather impact analysis by collecting comprehensive weather and terrain data with every run.

**What was done:**

#### Enhanced RunSession Data Model:
- Added `weatherAtStart` - Weather conditions at run beginning
- Added `weatherAtEnd` - Weather conditions at run completion
- Added `totalElevationGain` - Meters climbed during run
- Added `totalElevationLoss` - Meters descended during run
- Added `averageGradient` - Overall route gradient percentage
- Added `maxGradient` - Steepest section gradient percentage
- Added `terrainType` - Classification (FLAT, ROLLING, HILLY, MOUNTAINOUS)
- Added `routeHash` - MD5 hash of coordinates for route similarity matching
- Added `routeName` - User-defined or auto-generated route name

#### Route Similarity Algorithm:
- `calculateRouteSimilarity()` method for comparing runs (0.0 to 1.0 score)
- Compares: distance (±10%), elevation gain (±20%), terrain type
- Enables AI to compare similar routes with different weather conditions

#### RunTrackingService Enhancements:
- **Captures weather at run START** via `WeatherRepository`
- **Captures weather at run END** for weather change analysis
- **Tracks elevation changes** from GPS altitude data
- **Calculates real-time elevation gain/loss** during run
- **Generates route hash** from coordinate points
- **Determines terrain type** based on gradient analysis

#### Weather Data Storage:
- Weather data from **OpenWeatherMap API** (NOT Google Weather API)
- Uses device's real-time GPS location
- Stores: temperature, humidity, wind speed, conditions
- Associated with every completed run session

**Why This Matters:**
This data enables future OpenAI-powered features to analyze:
- "How does rain affect your pace on hilly routes?"
- "You run 15% faster in 15-20°C weather on flat terrain"
- "High humidity slows you down 8% on similar routes"
- Route recommendations based on current weather conditions
- Personalized training insights based on weather patterns

**Files Modified:**
- `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt` (major data model expansion)
- `app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (weather + terrain tracking)

**New Enums:**
- `TerrainType` (FLAT, ROLLING, HILLY, MOUNTAINOUS)

**Dependencies:**
- No new dependencies required
- Uses existing OpenWeatherMap API integration
- Uses existing GPS altitude data from FusedLocationProvider

**Data Collected Per Run:**
```kotlin
RunSession {
  // Performance metrics
  distance, pace, speed, calories
  
  // Route data
  routePoints[] (lat/lon/altitude/timestamp)
  routeHash (for similarity comparison)
  
  // Weather data (START and END)
  temperature, humidity, windSpeed, conditions
  
  // Terrain analysis
  totalElevationGain, totalElevationLoss
  averageGradient, maxGradient
  terrainType (FLAT/ROLLING/HILLY/MOUNTAINOUS)
}
```

**Future Use Cases:**
1. **Weather Impact Analysis** - Compare performance on similar routes with different weather
2. **Route Recommendations** - Suggest routes based on current weather and past performance
3. **Training Insights** - "You're strongest in cool, dry conditions on flat routes"
4. **Performance Predictions** - Predict pace based on route terrain and current weather
5. **Personal Records** - Contextualize PRs with weather conditions

**Important Notes:**
- Weather API key still required (OpenWeatherMap, not Google)
- All data stored locally in RunRepository (SharedPreferences for now)
- No PII or sensitive data - only weather conditions and terrain metrics
- OpenAI integration for analysis is a separate future feature

---

### Feature 2.3: Goals API Integration ✓
**Completed:** January 24, 2026  
**Status:** Production Ready

**What was done:**
- Added `/api/goals/{userId}` endpoint to `ApiService.kt`
- Updated `DashboardViewModel` to fetch real goals from Neon database
- Goals now display on dashboard when user has active goals
- Error handling for API failures with graceful fallback

---

### Feature 2.4: Icon Display Fixes ✓
**Completed:** January 24, 2026  
**Status:** Production Ready

**What was done:**
- Created lightweight XML vector drawable versions of all UI icons
- Replaced large PNG icons (200-600KB) with efficient vector drawables
- All icons now render properly and are theme-tintable

**Files Created:**
- `icon_target_vector.xml`, `icon_location_vector.xml`, `icon_play_vector.xml`
- `icon_home_vector.xml`, `icon_chart_vector.xml`, `icon_calendar_vector.xml`
- `icon_profile_vector.xml`, `icon_timer_vector.xml`, `icon_trending_vector.xml`

**Files Modified:**
- `DashboardScreen.kt` - Updated all icon references to vector versions
- `MainScreen.kt` - Updated bottom navigation icons to vector versions

---

### Feature 2.5: Dashboard Navigation & Placeholder Screens ✓
**Completed:** January 24, 2026  
**Status:** Production Ready

**What was done:**
- Created `RouteGenerationScreen.kt` placeholder for "MAP MY RUN" button
- Created `RunSessionScreen.kt` placeholder for "RUN WITHOUT ROUTE" button
- Wired up navigation in `MainScreen.kt` to both new screens
- Dashboard action buttons now fully functional with proper navigation

**Files Created:**
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RouteGenerationScreen.kt`
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSessionScreen.kt`

**Files Modified:**
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`

---

### Feature 2.6: Create Goal Screen ✓
**Completed:** January 24, 2026  
**Status:** Production Ready

**What was done:**
- Built complete goal creation UI matching webapp design
- Implemented 4 goal type categories with conditional fields
- Created dynamic form with proper validation structure
- Wired up navigation from Dashboard and Goals screen

**Goal Type Categories:**
1. **Event** - Race or competition
   - Event Name, Event Location
   - Distance Target (5K, 10K, Half Marathon, Marathon, Ultra Marathon + custom)
   - Time Target (optional HH:MM:SS)

2. **Distance/Time** - Personal record target
   - Distance Target (preset buttons + custom input)
   - Time Target (optional)

3. **Health & Wellbeing** - Fitness or weight goals
   - Health Target (Improve fitness, Improve endurance, Lose weight, Build strength, Better recovery + custom)

4. **Consistency** - Run frequency target
   - Weekly Run Target (number input + "runs per week")

**Common Fields (All Categories):**
- Goal Title * (required)
- Target Date (optional dropdown)
- Description (optional multiline)
- Notes (optional multiline)
- Create Goal button (primary)
- Cancel button (outlined)

**Files Created:**
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/CreateGoalScreen.kt`

**Files Modified:**
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GoalsScreen.kt` - Added create goal button
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/DashboardScreen.kt` - + button opens create goal
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt` - Added create_goal route

**UI Features:**
- 2x2 grid of selectable goal type cards with icons
- Conditional field rendering based on selected type
- Consistent styling with app theme
- Chip-style selection buttons for preset options
- Custom input fallbacks for all preset fields
- Proper spacing and alignment matching webapp
- Full-screen modal presentation

**Next Steps:**
- Wire up to backend API for goal creation
- Add form validation
- Implement date picker for Target Date field

---

## 🚧 In Progress Features

_(No features currently in progress)_

---

## 📚 COMPLETE FEATURE SPECIFICATIONS RECEIVED

**Date:** January 24, 2026  
**Source:** Replit Agent handover document  
**Status:** Documented and ready for implementation

The following comprehensive specifications have been documented in the project:

### 1. Route Generation System
**File:** `ROUTE_GENERATION_SPEC.md`  
**Scope:**
- Generate minimum 5 diverse circuit routes (target 100 templates)
- Backtrack detection algorithm (dead-end avoidance)
- Angular spread validation (150-180° circuits)
- Route similarity detection (prevent duplicates)
- Distance tolerance (20% primary, 35% fallback)
- Trail-based templates using Google Places API
- Route calibration with binary search scaling
- Difficulty assignment (easy/moderate/hard)
- Elevation profile integration

**Key Algorithms:**
- `calculateBacktrackRatio()` - 30m grid-based detection
- `calculateAngularSpread()` - Sector-based circuit validation
- `calculateRouteOverlap()` - 50m grid similarity check
- `calibrateRoute()` - Iterative waypoint scaling
- `projectPoint()` - Haversine bearing projection

### 2. AI Coaching During Runs
**File:** `AI_COACHING_SPEC.md`  
**Scope:**
- 12 coaching triggers (periodic, km milestone, terrain, pace, voice, etc.)
- Phase-based coaching (EARLY/MID/LATE/FINAL/GENERIC)
- 40 coaching statements organized by phase
- 5 elite coaching tip categories (30+ tips)
- 5 coach tone configurations
- Anti-repetition logic
- Statement usage tracking (max 3 per run)
- Pre-run summary generation
- Post-run AI analysis with target time feedback

**Coaching Phases:**
- EARLY: First 2km OR 10% (warm-up, settling in)
- MID: 3-5km OR 40-50% (form maintenance)
- LATE: 7km+ OR 75-90% (mental strength, fatigue management)
- FINAL: Last 10% (finishing strong)
- GENERIC: Anytime (timeless advice)

### 3. Elevation & Hill Coaching
**File:** `ELEVATION_STRUGGLE_SPEC.md`  
**Scope:**
- Predictive terrain detection (200m lookahead)
- Grade classification (flat/gentle/moderate/steep)
- Real-time hill coaching (uphill/downhill/crest)
- Google Elevation API integration for free runs
- Terrain event triggers (30s cooldown)
- Elevation profile analysis for routed runs

**Grade Thresholds:**
- Gentle: 2-5%
- Moderate: 5-8%
- Steep: 8%+

### 4. Struggle Point Detection
**File:** `ELEVATION_STRUGGLE_SPEC.md`  
**Scope:**
- Real-time pace drop detection (20% threshold)
- Rolling median pace calculation (5-sample window)
- Minimum 30-second slowdown duration
- User-annotatable weakness events (11 cause tags)
- Historical weakness pattern analysis
- Integration with AI coaching prompts

**Weakness Causes:**
- Fatigue, hill climb, hydration stop, traffic light, obstacle
- Cramp, breathing, heat, mental, injury discomfort, other

### 5. Voice Input & TTS
**File:** `AI_COACHING_SPEC.md`  
**Scope:**
- Real-time voice input to AI coach
- Speech recognition (Android: SpeechRecognizer, iOS: Speech framework)
- Text-to-Speech responses with tone-matched voices
- OpenAI TTS API integration
- Voice personality mapping (energetic → echo, motivational → onyx, etc.)

### 6. Free Run (Run Without Route)
**File:** `WATCH_ADMIN_SPEC.md`  
**Scope:**
- No pre-planned route, GPS tracking only
- Conservative phase detection (EARLY ≤2km, MID 3-5km, GENERIC beyond)
- Real-time elevation sampling via Google Elevation API
- Never trigger LATE/FINAL phases (safety - unknown total distance)
- All coaching features available except navigation

### 7. Watch Device Integration
**File:** `WATCH_ADMIN_SPEC.md`  
**Scope:**
- Apple Watch (HealthKit) - real-time HR + post-run sync
- Samsung Galaxy Watch (Samsung Health SDK) - real-time HR + post-run sync
- Garmin (Connect IQ SDK) - real-time HR + post-run sync
- Coros & Strava (Web API OAuth) - post-run sync only
- Heart rate zones (5 zones based on max HR)
- Advanced metrics: VO2 max, training effect, recovery time, body battery

### 8. Admin AI Configuration
**File:** `WATCH_ADMIN_SPEC.md`  
**Scope:**
- Customizable coach identity (description, instructions, knowledge, FAQs)
- Phase threshold configuration (admin can adjust km/% triggers)
- Coaching interval settings
- Feature toggles (km milestones, terrain coaching, pace coaching, etc.)
- Coaching audit trail (full request/response logging)
- AI usage statistics dashboard

### 9. API Endpoints
**File:** `WATCH_ADMIN_SPEC.md`  
**Complete API reference:**
- Route generation: `POST /api/routes/generate`
- AI coaching: `POST /api/ai/coaching`
- Pre-run summary: `POST /api/ai/run-summary`
- Post-run analysis: `POST /api/ai/run-analysis`
- Text-to-speech: `POST /api/tts`
- Weakness events: `POST /api/runs/{runId}/weakness-events/bulk`
- Device sync: `POST /api/device-data/sync`
- Coaching logs: `POST /api/coaching-logs`

---

## 📋 Upcoming Features (Priority Order)

### Feature 3: Route Generation System
**Status:** Ready to implement  
**Specification:** `ROUTE_GENERATION_SPEC.md`  
**Estimated Effort:** Large (2-3 weeks)  
**Dependencies:**
- Google Maps Directions API (already have key: `AIzaSyAunS1M9c5wxGMqjd9gOoNTvso7AACZcF0`)
- Google Places API (same key)
- Google Elevation API (same key)

**Implementation Tasks:**
- [ ] Create `RouteTemplates.kt` with 100 template patterns
- [ ] Implement `RouteValidator.kt` (backtrack, angular spread, overlap detection)
- [ ] Implement `RouteCalibrator.kt` (binary search distance scaling)
- [ ] Implement `TrailFinder.kt` (Google Places integration)
- [ ] Create `RouteGenerationService.kt` (orchestrator)
- [ ] Build route selection UI screen
- [ ] Integrate with existing Dashboard

### Feature 4: AI Coaching System
**Status:** Ready to implement  
**Specification:** `AI_COACHING_SPEC.md`  
**Estimated Effort:** Large (3-4 weeks)  
**Dependencies:**
- OpenAI API (requires API key)
- OpenAI TTS API (same key)

**Implementation Tasks:**
- [ ] Create `CoachingService.kt` (main orchestrator)
- [ ] Implement `CoachingPhaseManager.kt`
- [ ] Implement `EliteCoachingTips.kt` (5 categories, 30+ tips)
- [ ] Implement `CoachingStatements.kt` (40 statements)
- [ ] Create `VoiceInputHandler.kt` (speech recognition)
- [ ] Create `TTSService.kt` (OpenAI TTS integration)
- [ ] Implement trigger system (periodic, km, terrain, pace, voice)
- [ ] Build coaching UI overlay during runs

### Feature 5: Elevation & Struggle Detection
**Status:** Ready to implement  
**Specification:** `ELEVATION_STRUGGLE_SPEC.md`  
**Estimated Effort:** Medium (1-2 weeks)  
**Dependencies:**
- Google Elevation API (already have key)
- Existing GPS tracking (RunTrackingService)

**Implementation Tasks:**
- [ ] Create `TerrainAnalyzer.kt`
- [ ] Create `ElevationTracker.kt` (200m lookahead)
- [ ] Create `StruggleDetector.kt` (pace drop detection)
- [ ] Create `WeaknessEventManager.kt`
- [ ] Integrate with backend API endpoints
- [ ] Build struggle review UI (post-run)

### Feature 6: Pre-Run & Post-Run AI
**Status:** Ready to implement  
**Specification:** `AI_COACHING_SPEC.md`  
**Estimated Effort:** Small (3-5 days)  
**Dependencies:**
- OpenAI API

**Implementation Tasks:**
- [ ] Create `PreRunSummaryGenerator.kt`
- [ ] Create `PostRunAnalyzer.kt`
- [ ] Build pre-run summary screen (before start)
- [ ] Build post-run analysis screen (after finish)
- [ ] Integrate target time analysis
- [ ] Integrate self-assessment input

### Feature 7-56: TBD
**Status:** Not Started  
**Assigned:** Pending user input  

*User will specify next feature priority*

---

### Features 4-55: TBD
**Status:** Not Started  
**Notes:** Feature list and priorities to be defined by user

---

### Feature 56: Garmin SDK Integration
**Status:** Not Started  
**Priority:** Low (near end of roadmap)  
**Notes:** 
- Garmin Connect IQ SDK integration
- Bluetooth connectivity to Garmin watches
- Sync run data from watch to phone
- Connection UI in Profile/Settings
- Update `GarminConnection` model with real SDK data

**Dependencies:**
- Uncomment Garmin SDK in `app/build.gradle.kts`
- `implementation("com.garmin.android:connectiq:5.1.0")`

---

### Feature 57: Samsung Health SDK Integration
**Status:** Not Started  
**Priority:** Low (near end of roadmap)  
**Notes:**
- Samsung Health Platform SDK
- Connect to Galaxy Watch devices
- Query run data from Samsung Health
- Unified data model with Garmin runs

---

### Feature 58: TBD
**Status:** Not Started  
**Priority:** Final feature

---

## 🔧 Technical Debt & Future Improvements

### High Priority
- [ ] Test weather integration on real device (API key already configured)
- [ ] Test RunTrackingService on real device (not emulator)
- [ ] Add notification permission request for Android 13+

### Medium Priority
- [ ] Migrate RunRepository from SharedPreferences to Room database
- [ ] Add error handling for GPS permission denied
- [x] ~~Implement RunSession screen~~ ✓ Placeholder created
- [x] ~~Implement RouteGeneration screen~~ ✓ Placeholder created

### Low Priority
- [ ] Optimize GPS battery usage
- [ ] Add run history screen functionality
- [ ] Add events screen functionality
- [ ] Add goals screen functionality (beyond navigation)
- [ ] Add profile screen functionality

---

## 📱 Screen Status

| Screen | Status | Notes |
|--------|--------|-------|
| **Login** | ✅ Complete | Connects to backend API |
| **Location Permission** | ✅ Complete | Requests GPS permissions |
| **Dashboard (Home)** | ✅ Complete | Fully redesigned, production ready |
| **History** | 📝 Placeholder | Needs implementation |
| **Events** | 📝 Placeholder | Needs implementation |
| **Goals** | 📝 Placeholder | Shows empty state with create button |
| **Profile** | 📝 Placeholder | Needs implementation |
| **Route Generation** | 📝 Placeholder | MAP MY RUN - navigation working |
| **Run Session** | 📝 Placeholder | RUN WITHOUT ROUTE - navigation working |
| **Create Goal** | ✅ Complete | Full form with 4 categories, conditional fields |

---

## 🎨 Design System

### Colors
- **Primary:** Cyan (#00D4FF)
- **Background:** Dark (#0A0F1A)
- **Success:** Green (#00E676)
- **Warning:** Amber (#FFB300)
- **Error:** Red (#FF5252)

### Typography
- Defined in `AppTextStyles.kt`
- Font weight changes for active/inactive states

### Spacing
- Consistent spacing values in `Spacing.kt`
- Border radius values in `BorderRadius.kt`

---

## 🔗 API Integrations

### Backend API
- **Base URL (Debug):** `http://10.0.2.2:5000`
- **Base URL (Release):** `https://airuncoach.live`
- **Authentication:** Login/Register endpoints functional
- **Session Management:** SessionManager stores auth tokens

### OpenWeatherMap API
- **Status:** Configured but needs API key
- **Endpoint:** `https://api.openweathermap.org/data/2.5/weather`
- **Usage:** Real-time weather based on GPS location

---

## 📦 Dependencies Summary

### Core
- Jetpack Compose with Material 3
- Navigation Compose
- Lifecycle ViewModel

### Networking
- Retrofit 2.9.0
- Gson converter
- OkHttp logging interceptor

### Location & GPS
- Google Play Services Location 21.1.0

### Storage
- Room 2.6.1 (configured but not fully implemented)
- SharedPreferences (currently in use)
- Security Crypto (for secure token storage)

### Background Work
- WorkManager 2.9.0
- Foreground Service with wake locks

---

## 🚀 Build & Run

### Prerequisites
1. Android Studio latest version
2. Android SDK 26+ (minSdk: 26, targetSdk: 34)
3. Real Android device recommended (GPS testing)

### Setup Steps
1. Clone repository
2. Open in Android Studio
3. Sync Gradle dependencies
4. Add OpenWeatherMap API key to `app/build.gradle.kts`
5. Run on device

### Testing Checklist
- [ ] App launches successfully
- [ ] Login flow works
- [ ] Location permission requested
- [ ] Dashboard displays correctly
- [ ] Bottom navigation works across all screens
- [ ] Garmin card hidden by default (no connection configured)
- [ ] Weather data loads (API key configured)
- [ ] GPS tracking service starts (test on device)
- [ ] "MAP MY RUN" button navigates to route generation placeholder
- [ ] "RUN WITHOUT ROUTE" button navigates to run session placeholder

---

## 📝 Notes for Future Sessions

**When resuming this project:**
1. Read this file first to understand current state
2. Check "Last Session" note at top for context
3. Review "In Progress Features" for incomplete work
4. Ask user for next feature priority if not specified
5. Update this file after completing each feature/task
6. Always mark completion dates and status changes

**Important Contexts:**
- User has 58 features planned total
- Garmin/Samsung SDK integration are features 56-57 (near end)
- Dashboard is the home screen and is now production-ready
- Real GPS tracking is functional but needs device testing
- Weather API needs API key before testing

---

**End of Project Status Document**
