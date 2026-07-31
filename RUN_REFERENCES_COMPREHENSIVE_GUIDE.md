# AI Run Coach - Comprehensive "Run" References Guide

This document catalogues all files, screens, UI strings, ViewModels, and configuration related to "Run" text labels, session management, and run/walk activity types in the Android app.

---

## 1. Screen Composables (UI Screens)

### 1.1 **RunSessionScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSessionScreen.kt`

**Purpose:** Main active run screen with three modes:
1. **Route Mode** - displays map with route, turn instructions
2. **Garmin Elite+** - Effort Core metrics + adaptive insight layers (when Garmin connected, no route)
3. **Free Run Elite** - Performance dashboard (pace/elevation/cadence/score, no Garmin)

**Key Features:**
- Real-time coaching messages display and TTS integration
- GPS locked status and countdown to start
- Run state tracking (time, distance, pace, cadence, HR, calories)
- Pause/stop/end run functionality
- Power saver warning banner
- Route recognition (matches known routes at run start)
- Group run participant panel display
- Live observer count tracking
- Wake word detection for voice commands

**ViewModel:** `RunSessionViewModel`

**Key State Variables:**
```kotlin
runState: StateFlow<RunState>  // Current run metrics
pendingSyncCount: StateFlow<Int>  // Offline sync tracking
knownRouteMatch: StateFlow<RouteRecognitionResponse?>  // Route ID detection
isPowerSaverWarningVisible: StateFlow<Boolean>
```

---

### 1.2 **RunSummaryScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt`

**Purpose:** Post-run analysis and results screen (displayed after run completes)

**Key Features:**
- Summary tab: distance, duration, pace, elevation, cadence metrics
- Graphs tab: comprehensive charts (pace curves, HR zones, elevation)
- Data tab: lap/km splits, segment analysis
- Social sharing (Strava, image export)
- Run editing (name, comments, delete)
- AI-generated insights and coaching notes
- Weather impact analysis
- Consistency score display
- Personal best indicators
- Training plan context (if run was from a plan)
- Group run results (if part of group run)

**ViewModel:** `RunSummaryViewModel`

**Data Flows:**
- Receives `RunSession` object from `RunSessionViewModel`
- Fetches comprehensive analysis from backend
- Manages post-run UI state

---

### 1.3 **MapMyRunSetupScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MapMyRunSetupScreen.kt`

**Purpose:** Run setup/configuration screen (pre-run preparation)

**Header Text:**
- Route mode: **"MAP MY RUN SETUP"** — Configure your route preferences
- No-route mode: **"CONFIGURE YOUR RUN"** — Set your run details

**Activity Type Selection:**
```kotlin
private enum class ActivityMode { 
    RUN,    // Running session (default)
    WALK    // Walking session
}
```

**Configuration Options:**
1. **Activity Type** - RUN or WALK (toggle button, visible in `ActivityModeToggle()`)
2. **Target Distance** - distance in km
3. **Target Time** - optional hours/minutes/seconds
4. **AI Coach** - toggle coaching on/off
5. **Live Tracking** - enable observers (iOS pending)
6. **Group Run** - invite participants
7. **Route Generation** - for "route" mode

**Buttons:**
- **"MAP MY RUN"** - Generate routes (route mode)
- **"Prepare Run on Watch"** (when Garmin companion installed)
- **"START RUN"** - Begin session

---

### 1.4 **RouteSelectionScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RouteSelectionScreen.kt`

**Purpose:** Route selection and confirmation screen (shown after route generation)

**Header Text:** **"SELECT YOUR ROUTE"**

**Features:**
- Displays generated routes grouped by difficulty (Easy/Moderate/Hard)
- Map preview for each route
- Distance and elevation info per route
- "Prepare Run on Watch" button (visible if companion app installed)
- **"START RUN"** button to begin with selected route

---

### 1.5 **PreviousRunsScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/PreviousRunsScreen.kt`

**Purpose:** Run history/archive view (all completed runs)

**Features:**
- Displays list of all previous runs with:
  - Date, distance, duration, pace
  - Personal best indicators
  - Weather impact analysis
  - Garmin sync badges
  - Filters (distance, date, type)
- Tap to view run details in `RunSummaryScreen`
- "Import Run History" from Garmin
- Run deletion functionality
- Weather impact section (expanded/collapsed)

**ViewModel:** `PreviousRunsViewModel`

---

### 1.6 **ObserverRunSessionScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ObserverRunSessionScreen.kt`

**Purpose:** Live tracking view for invited observers (friends/family watching a run)

**Features:**
- Real-time runner location on map
- Runner metrics display (distance, pace, HR, etc.)
- Runner status updates
- Coaching messages relay
- Messaging capability to runner

**ViewModel:** `ObserverRunSessionViewModel`

---

### 1.7 **DashboardScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/DashboardScreen.kt`

**Features Include:**
- Quick action: **"Start Run"** button
- Recent runs summary
- Training plan quick access
- "Run History" tile (same styling as Garmin import)
- Fitness metrics and trends

---

### 1.8 **CoachSettingsScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/CoachSettingsScreen.kt`

**Purpose:** AI coach personalization (voice, name, tone, intensity)

**Notes:**
- No direct run type selection here
- Settings apply to all runs (both "run" and "walk" activities)

---

### 1.9 **ConnectedDevicesScreen.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/ConnectedDevicesScreen.kt`

**Features:**
- Garmin integration section
- **"Run History"** chip for viewing imported activities
- **"Import Run History"** button
- Watch companion status

---

## 2. Domain Models

### 2.1 **RunSession.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt`

**Primary Data Model:**
```kotlin
data class RunSession(
    val id: String,
    val startTime: Long,
    val endTime: Long?,
    val duration: Long,          // milliseconds
    val distance: Double,        // meters
    val averagePace: String?,    // min/km format
    val currentPace: String?,    // Real-time instant pace
    val cadence: Int,            // steps per minute
    val heartRate: Int,          // beats per minute
    val totalElevationGain: Double,
    val totalElevationLoss: Double,
    val sessionType: String = "run",  // "run" or "walk"
    val routeName: String?,
    val workoutType: String?,    // "easy", "tempo", "intervals", "long_run"
    val workoutIntensity: String?, // "z1" through "z5"
    val groupRunId: String?,
    val linkedWorkoutId: String?, // Training plan context
    val linkedPlanId: String?,
    val externalSource: String?,  // "garmin", "strava", null for native
    // ... 40+ additional fields for enrichment
)
```

**Key Fields for "Run" Classification:**
- **sessionType** (line 47): "run" or "walk" - user's choice
- **externalSource** (line 43): "garmin", "strava", or null
- **linkedWorkoutId** / **linkedPlanId**: Training plan integration

---

### 2.2 **RunSetupConfig.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSetupConfig.kt`

**Configuration Data Model:**
```kotlin
data class RunSetupConfig(
    val activityType: PhysicalActivityType = PhysicalActivityType.RUN,
    val targetDistance: Float? = null,
    val hasTargetTime: Boolean = false,
    val targetHours: Int = 0,
    val targetMinutes: Int = 0,
    val targetSeconds: Int = 0,
    val aiCoachEnabled: Boolean = true,
    val liveTrackingEnabled: Boolean = false,
    val isGroupRun: Boolean = false,
    val route: GeneratedRoute?,
    val workoutType: String?,      // "easy" | "tempo" | "intervals"
    val workoutIntensity: String?, // "z1" | "z2" | ... "z5"
    val isIntervalWorkout: Boolean = false,
    val isWatchMode: Boolean = false  // True when "Prepare Run on Watch"
)

enum class PhysicalActivityType {
    RUN,
    WALK
}
```

---

### 2.3 **User.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/domain/model/User.kt`

**Key Field for Default Session Type:**
```kotlin
data class User(
    // ... other fields ...
    val defaultSessionType: String? = "RUN",  // Line 43
    // ... other fields ...
)
```

**Usage:** User's preferred activity type for run setup screens and plan generation

---

### 2.4 **PreviousRun.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/domain/model/PreviousRun.kt`

```kotlin
data class PreviousRun(
    val id: Long,
    val date: Date,
    val distance: Double,
    val duration: Long,
    val pace: String
)
```

**Used By:** `PreviousRunsScreen` for history list display

---

## 3. Network Models

### 3.1 **PreRunBriefingResponse.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/network/model/PreRunBriefingResponse.kt`

**Purpose:** Server response with pre-run coaching brief
- Cached in `RunState.briefingResponse`
- Contains coaching focus, motivation, safety tips

---

### 3.2 **RunHistoryStats.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/network/model/RunHistoryStats.kt`

```kotlin
data class RunHistoryStats(
    // Stats about user's run history for contextual coaching
)
```

**Used In:** PaceUpdate and StruggleUpdate responses for run-specific context

---

### 3.3 **UploadRunRequest.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/network/model/UploadRunRequest.kt`

**Purpose:** Upload completed run to backend/Strava
```kotlin
data class UploadRunRequest(
    val maxSpeed: Float?,     // peak speed (m/s)
    // ... run metrics ...
)
```

---

### 3.4 **RunInsightsModels.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/network/model/RunInsightsModels.kt`

```kotlin
data class BasicRunInsights(...)       // Quick post-run summary
data class ComprehensiveRunAnalysis(...) // Deep analysis with AI insights
data class SaveRunAnalysisRequest(...)  // Save analysis to backend
data class RenameRunRequest(...)        // Edit run name/comments
```

---

### 3.5 **GroupRunModels.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/network/model/GroupRunModels.kt`

```kotlin
data class GroupRunParticipantResult(
    val runSession: RunSession?  // Each participant's run data
)
data class GroupRunDebriefResponse(...)
```

---

### 3.6 **RouteRecognitionResponse.kt** (via RouteRecognitionModels.kt)
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/network/model/RouteRecognitionModels.kt`

**Purpose:** Route memory engine response after run start (populated when first GPS fix obtained)
- Matched route ID and confidence score (≥40%)
- Historical stats for that route

---

## 4. ViewModels

### 4.1 **RunSessionViewModel.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSessionViewModel.kt`

**Manages:**
- Active run state (metrics, coaching)
- Run start/pause/stop/resume logic
- GPS tracking and location updates
- Route recognition and intelligence context
- Pre-run briefing fetch and cache
- In-run coaching generation and delivery
- Interval workout phase tracking
- Group run synchronization
- Live observer management
- Watch companion communication
- Power saver detection

**Key Flows:**
```kotlin
runState: StateFlow<RunState>
runSession: StateFlow<RunSession?>
knownRouteMatch: StateFlow<RouteRecognitionResponse?>
isPowerSaverWarningVisible: StateFlow<Boolean>
isWatchCompanionInstalled: StateFlow<Boolean>
liveSessionId: StateFlow<String?>
liveObserverCount: StateFlow<Int>
```

**Key Methods:**
```kotlin
startRun()              // Initialize run tracking
pauseRun()              // Pause timing
resumeRun()             // Resume from pause
stopRun()               // End run and return to summary
prepareRunOnWatch(...)  // Send to companion app
```

---

### 4.2 **RunSummaryViewModel.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSummaryViewModel.kt`

**Manages:**
- Post-run analysis and insights
- Graph data preparation
- Social sharing (Strava, image)
- Run metadata (name, comments)
- Delete run functionality
- Training plan context display

---

### 4.3 **PreviousRunsViewModel.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/PreviousRunsViewModel.kt`

**Manages:**
- Run history fetching and caching
- Run filtering (distance, date, type)
- Weather impact calculation
- Garmin sync state
- Personal best detection

---

### 4.4 **ObserverRunSessionViewModel.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/ObserverRunSessionViewModel.kt`

**Manages:**
- Live tracking for observer view
- Real-time runner location updates
- Messaging between observer and runner
- Run status polling

---

## 5. String Resources & Text Labels

**File Path:** `app/src/main/res/values/strings.xml`

**Current Content (Minimal):**
```xml
<string name="app_name">Ai Run Coach</string>
```

**Note:** Most UI strings are hardcoded in Composables. Here are the key "Run" related text labels found throughout the codebase:

### 5.1 Screen Headers & Titles
| Text | Screen | File | Line |
|------|--------|------|------|
| **"MAP MY RUN SETUP"** | MapMyRunSetupScreen | MapMyRunSetupScreen.kt | 191 |
| **"CONFIGURE YOUR RUN"** | MapMyRunSetupScreen | MapMyRunSetupScreen.kt | 191 |
| **"Configure your route preferences"** | MapMyRunSetupScreen | MapMyRunSetupScreen.kt | 192 |
| **"Set your run details"** | MapMyRunSetupScreen | MapMyRunSetupScreen.kt | 192 |
| **"SELECT YOUR ROUTE"** | RouteSelectionScreen | RouteSelectionScreen.kt | 64 |
| **"START RUN"** | RouteSelectionScreen, MapMyRunSetupScreen | Multiple | Various |
| **"GPS locked! Tap 'Start Run' when you're ready."** | RunSessionScreen | RunSessionViewModel.kt | 88 |

### 5.2 Activity Type Labels
| Text | Location | File |
|------|----------|------|
| **"RUN"** | Toggle button left | MapMyRunSetupScreen.kt:768 |
| **"WALK"** | Toggle button right | MapMyRunSetupScreen.kt:769 |
| **"Prepare Run"** | Button (dynamic) | MapMyRunSetupScreen.kt:453 |
| **"Prepare Walk"** | Button (dynamic) | MapMyRunSetupScreen.kt:453 |
| **"PREPARE RUN"** | Button (dynamic caps) | MapMyRunSetupScreen.kt:511 |
| **"PREPARE WALK"** | Button (dynamic caps) | MapMyRunSetupScreen.kt:511 |

### 5.3 Run History Labels
| Text | Location | File |
|------|----------|------|
| **"Run History"** | Dashboard tile, Settings | ConnectedDevicesScreen.kt:649, 731, 911 |
| **"Import Run History"** | Garmin connection | ConnectedDevicesScreen.kt:731 |
| **"No Run History"** | Garmin setup message | GarminConnectScreen.kt:49 |

### 5.4 Preparation & Onboarding
| Text | Context | File |
|------|---------|------|
| **"Prepare Run on Watch"** | Watch companion button | RouteSelectionScreen.kt:165 |
| **"Prepare for Watch"** (mentioned in docs) | Watch mode activation | Multiple |
| **"Start on Phone"** (mentioned in docs) | Phone mode activation | Multiple |

### 5.5 GPS & Permission Labels
| Text | Location | File |
|------|----------|------|
| **"AI Run Coach needs access to your device's GPS and sensors..."** | LocationPermissionScreen | LocationPermissionScreen.kt:129 |
| **"Real-time GPS tracking during runs"** | LocationPermissionScreen | LocationPermissionScreen.kt:146 |
| **"Your location data is only used during runs..."** | LocationPermissionScreen | LocationPermissionScreen.kt:186 |

### 5.6 Post-Run & Sharing Labels
| Text | Location | File |
|------|----------|------|
| **"Publish your runs with full GPS data and metrics"** | Strava setup | StravaOAuthScreen.kt:134 |
| **"Share your runs with friends"** | Strava setup | StravaOAuthScreen.kt:172 |
| **"Write access: Publish your completed runs"** | Strava OAuth | StravaOAuthScreen.kt:207 |

---

## 6. Related Data Classes & Enums

### 6.1 **PhysicalActivityType Enum**
```kotlin
enum class PhysicalActivityType {
    RUN,
    WALK
}
```
**Location:** `RunSetupConfig.kt`
**Usage:** Specifies activity type in RunSetupConfig and RunSession

---

### 6.2 **ActivityMode Enum** (Local to MapMyRunSetupScreen)
```kotlin
private enum class ActivityMode { 
    RUN,
    WALK 
}
```
**Location:** `MapMyRunSetupScreen.kt:747`
**Usage:** Local UI state for run setup toggle

---

### 6.3 **IntervalPhase Data Class**
**Location:** `RunSessionViewModel.kt:66-75`
```kotlin
data class IntervalPhase(
    val currentInterval: Int = 1,
    val isWorkPhase: Boolean = true,
    val distanceInCurrentPhase: String = "0.00",
    val timeInCurrentPhase: String = "00:00",
    val phaseDurationTarget: Float? = null,
    val targetPace: String? = null,
    val targetHeartRateMin: Int? = null,
    val targetHeartRateMax: Int? = null
)
```

**Usage:** Tracks position within interval/repeat workouts (6x400m, 5x2min hard/easy, etc.)

---

### 6.4 **RunState Data Class**
**Location:** `RunSessionViewModel.kt:77-99`
```kotlin
data class RunState(
    val time: String = "00:00",
    val distance: String = "0.00",
    val pace: String = "0:00",
    val currentPace: String = "0:00",
    val cadence: String = "0",
    val heartRate: String = "0",
    val isRunning: Boolean = false,
    val isPaused: Boolean = false,
    val isCoachEnabled: Boolean = true,
    val isMuted: Boolean = false,
    val coachText: String = "GPS locked!...",
    val latestCoachMessage: String? = null,
    val briefingResponse: PreRunBriefingResponse? = null,
    val isIntervalWorkout: Boolean = false,
    val intervalPhase: IntervalPhase? = null
)
```

**Usage:** Real-time state during active run in `RunSessionScreen`

---

## 7. Configuration & Settings

### 7.1 **DefaultSessionType Storage**
- **Stored In:** User profile (server-synced)
- **Field:** `User.defaultSessionType` (defaults to "RUN")
- **Usage:** Populates activity type in run setup screens and plan generation

### 7.2 **Run-Specific Feature Flags**
Located in `User` model:
```kotlin
val coachPaceEnabled: Boolean?           // Coach pace calls
val coachNavigationEnabled: Boolean?     // Turn-by-turn guidance
val coachElevationEnabled: Boolean?      // Hill coaching
val coachHeartRateEnabled: Boolean?      // HR zone coaching
val coachCadenceStrideEnabled: Boolean?  // Cadence guidance
val coachKmSplitsEnabled: Boolean?       // Split notifications
val coachStruggleEnabled: Boolean?       // Struggle detection
val coachMotivationalEnabled: Boolean?   // Motivational calls
val coachHalfKmCheckInEnabled: Boolean?  // Frequent check-ins
val coachKmSplitIntervalKm: Int?        // Split interval (1 or 2 km)
```

---

## 8. Key API Endpoints (Referenced in Comments)

### 8.1 Pre-Run Coaching
- **Endpoint:** "Prepare Run" time API call
- **Location Comment:** `ApiService.kt:652` — "Called at 'Prepare Run' time"
- **Purpose:** Generate coaching plan, return phases, triggers, cueing strategy
- **Returns:** `DynamicSessionCoachingPlan` (cached for run duration)

### 8.2 Session Instructions / Coaching
- **Data Class:** `SessionInstructionsResponse`
- **Cached In:** `RunSetupConfig.sessionInstructions`
- **Used During:** Active run for coaching logic

### 8.3 In-Run Pace Updates
- **API Method:** Called during run for coaching generation
- **Includes:** `RunHistoryStats` context
- **Purpose:** Drive real-time pace-based coaching

---

## 9. Service Classes

### 9.1 **RunTrackingService.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`

**Responsibilities:**
- Foreground service for GPS tracking during runs
- Location update collection and distance calculation
- Pace calculation from GPS data
- Cadence detection (via accelerometer if available)
- Power saver mode detection
- Write to HealthConnect (steps, distance, heart rate)
- Sync queue management for offline runs
- Watch integration (receives start command via Garmin companion)

**Key Comment References:**
- Line 670: "Prepare Run" screen → "Send to Watch" flow
- Line 686: Watch auto-start path (no prior phone preparation)
- Line 5727: Pre-cached coaching logic
- Line 5846: Polly file caching at "Prepare Run" time

---

### 9.2 **GarminWatchManager.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/service/GarminWatchManager.kt`

**Responsibilities:**
- Companion app communication
- Watch mode coordination
- Activity sync from watch to phone
- Comment (line 298): "Use this to conditionally show 'Prepare Run on Watch' in the UI"

---

## 10. Components & Utilities

### 10.1 **PrepareRunOnWatchButton.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/components/PrepareRunOnWatchButton.kt`

**Purpose:** Reusable button component for "Prepare Run on Watch" action

**States:**
```kotlin
enum class WatchSendState {
    IDLE,
    SENDING,
    SENT
}
```

**Usage:** Shown in `RouteSelectionScreen` and `MapMyRunSetupScreen` when Garmin companion installed

---

### 10.2 **RunSessionGraphHelpers.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/extensions/RunSessionGraphHelpers.kt`

**Purpose:** Utilities for rendering pace, HR, elevation graphs in `RunSummaryScreen`

---

### 10.3 **AdvancedRunCharts.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/components/AdvancedRunCharts.kt`

**Purpose:** Composable components for rendering run analysis charts

---

### 10.4 **RunSimulator.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/utils/RunSimulator.kt`

**Purpose:** Development/testing utility to simulate GPS location updates during testing

---

## 11. Navigation & Integration Points

### 11.1 **MainScreen.kt Navigation Routes**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`

**Key Routes:**
```kotlin
// Line 241: DashboardScreen()
// Line 370: MapMyRunSetupScreen() — mode: "route"
// Line 600: RouteSelectionScreen()
// Line 1061: TrainingPlanDashboardScreen() — also accesses run setup
// Line 1211: MapMyRunSetupScreen() — mode: "no_route"
// Line 1241: CoachSettingsScreen()
```

**Navigation Flow:**
1. Dashboard → **"Start Run"** → MapMyRunSetupScreen
2. MapMyRunSetupScreen (mode="route") → **"Generate Routes"** → RouteSelectionScreen
3. RouteSelectionScreen → **"Start Run"** → RunSessionScreen
4. RunSessionScreen (run complete) → RunSummaryScreen
5. RunSummaryScreen → **"Run History"** → PreviousRunsScreen

---

## 12. Data Repositories

### 12.1 **RunRepository.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/data/repository/RunRepository.kt`

**Purpose:** Centralized run data access (database + network)

---

### 12.2 **AiRunCoachDatabase.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/data/database/AiRunCoachDatabase.kt`

**Likely Tables:**
- `run_sessions` - completed runs
- `run_tracking` - in-progress run data
- `routes` - saved routes
- `coaching_plans` - training plans

---

## 13. Configuration Files

### 13.1 **RunningMetricsConfig.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/config/RunningMetricsConfig.kt`

**Purpose:** Constants for running metrics (pace zones, HR zones, effort levels)

---

### 13.2 **RunConfigHolder.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/util/RunConfigHolder.kt`

**Purpose:** Singleton to pass RunSetupConfig through navigation

---

## 14. Analytics

### 14.1 **RunAnalytics.kt**
**File Path:** `app/src/main/java/live/airuncoach/airuncoach/analytics/RunAnalytics.kt`

**Purpose:** Track run-related events (start, pause, complete, share, etc.)

---

## 15. Watch/Garmin Integration

### 15.1 Key Terms Found in Comments
- **"Prepare Run on Watch"** - User initiates run prep on watch first
- **"Prepare Run" time** - Pre-run setup phase (where coaching plan is generated)
- **"Send to Watch"** - Push prepared run to Garmin companion app
- **"Run Without Route"** - Free form run without predefined path (mentioned in WATCH_ADMIN_SPEC.md:204)

### 15.2 Watch Modes
```
Phone-initiated → RunSessionScreen starts GPS immediately
Watch-initiated → RunSessionScreen waits for watch "start" via BLE
```

---

## 16. Summary Table of Key Files

| Component | File | Type | Purpose |
|-----------|------|------|---------|
| Run Session | RunSessionScreen.kt | Screen | Active run UI |
| Run Summary | RunSummaryScreen.kt | Screen | Post-run analysis |
| Run Setup | MapMyRunSetupScreen.kt | Screen | Pre-run config |
| Route Select | RouteSelectionScreen.kt | Screen | Route choice |
| Run History | PreviousRunsScreen.kt | Screen | Past runs list |
| Observer | ObserverRunSessionScreen.kt | Screen | Live tracking view |
| State Management | RunSessionViewModel.kt | ViewModel | Run state/logic |
| Summary State | RunSummaryViewModel.kt | ViewModel | Post-run logic |
| History State | PreviousRunsViewModel.kt | ViewModel | History logic |
| Data Model | RunSession.kt | Model | Run data structure |
| Config Model | RunSetupConfig.kt | Model | Run setup config |
| User Model | User.kt | Model | User preferences |
| Tracking | RunTrackingService.kt | Service | GPS/metric tracking |
| Watch Mgmt | GarminWatchManager.kt | Service | Watch integration |
| Watch Button | PrepareRunOnWatchButton.kt | Component | Reusable button |
| Graph Utils | RunSessionGraphHelpers.kt | Utility | Graph rendering |

---

## 17. Key Search Patterns

When working with "Run" references, search for:

1. **Screen Names:**
   - `RunSessionScreen`
   - `RunSummaryScreen`
   - `MapMyRunSetupScreen`
   - `RouteSelectionScreen`
   - `PreviousRunsScreen`

2. **ViewModel Names:**
   - `RunSessionViewModel`
   - `RunSummaryViewModel`
   - `PreviousRunsViewModel`

3. **Activity Types:**
   - `PhysicalActivityType.RUN`
   - `PhysicalActivityType.WALK`
   - `ActivityMode.RUN`
   - `ActivityMode.WALK`

4. **Data Models:**
   - `RunSession`
   - `RunSetupConfig`
   - `RunState`
   - `IntervalPhase`

5. **UI Text Patterns:**
   - "CONFIGURE YOUR RUN"
   - "MAP MY RUN"
   - "SELECT YOUR ROUTE"
   - "START RUN"
   - "Prepare Run"
   - "Run History"

6. **Configuration:**
   - `defaultSessionType`
   - `sessionType`
   - `activityType`

---

## 18. External Integration Points

### 18.1 Strava Integration
- Publish completed runs to Strava
- Full GPS data export
- Connected via OAuth

### 18.2 Garmin Integration
- Import historical runs from Garmin Connect
- Sync with Garmin watches
- Enriched data (HR, elevation, device name)

### 18.3 HealthConnect Integration
- Export run data (steps, distance, HR)
- Android system integration

---

## 19. Feature Flags & Conditional UI

### 19.1 Watch Companion Availability
```kotlin
isWatchCompanionInstalled: StateFlow<Boolean>  // Determines if "Prepare Run on Watch" is shown
```

### 19.2 Session Type Selection
```kotlin
masterAiEnabled: StateFlow<Boolean>  // Master toggle for all AI coaching
```

### 19.3 Group Run Mode
```kotlin
isGroupRun: Boolean  // Enables participant selection
groupRunId: String?  // Optional group run context
```

---

## 20. Known Documentation References

The following documents provide additional context on run management:

- **iOS_AI_COACHING_SESSION_GENERATION_BRIEF.md** - RunSessionScreen behavior
- **GROUP_RUN_ORGANIZER_FEATURE.md** - Group run screens
- **POST_RUN_ANALYSIS_ROADMAP.md** - RunSummaryScreen features
- **ANDROID_3_CIRCLE_METRICS_SUMMARY.md** - Performance dashboard
- **GPS_LOCATION_TRACKING_ANALYSIS.md** - Run tracking architecture

---

## Conclusion

This guide comprehensively maps all "Run" related references across the Android app, including:
- ✅ Screen UI layouts and text labels
- ✅ ViewModels and state management
- ✅ Domain models and data classes
- ✅ Network models and API integration
- ✅ Configuration and settings
- ✅ Watch/Garmin integration points
- ✅ Activity type (RUN vs WALK) handling
- ✅ Navigation and flow

Use this document to understand the run session lifecycle, from setup through completion and post-run analysis.
