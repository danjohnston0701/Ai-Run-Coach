# AI Run Coach - "Run" References Visual Map

## 1. Run Lifecycle & Navigation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        DASHBOARD                            │
│                  "Start Run" Button                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  MapMyRunSetupScreen           │
        │  "CONFIGURE YOUR RUN" / "MAP   │
        │  MY RUN SETUP"                 │
        │  - Distance setup              │
        │  - Time target (optional)      │
        │  - Activity type toggle:       │
        │    [RUN] | [WALK]              │
        │  - AI Coach toggle             │
        │  - Group run invite            │
        │  - Mode: "route" or "no_route" │
        └────────────┬─────────────────┬──┘
                     │ Generate Routes │
           ┌─────────▼─────────┐       │
           │ RouteSelection    │       │
           │ Screen            │       │
           │ "SELECT YOUR      │       │
           │ ROUTE"            │       │
           │ - Easy/Moderate/  │       │
           │   Hard routes     │       │
           │ - Difficulty UI   │       │
           │ - Map preview     │       │
           └────────┬──────────┘       │
                    │                  │
         ┌──────────▼──────────┐   ┌───▼──────────────────┐
         │                     │   │                      │
         │  "Prepare Run on    │   │  "START RUN"         │
         │   Watch" (optional) │   │                      │
         │                     │   │  (No Route Mode)     │
         └──────────┬──────────┘   └───┬──────────────────┘
                    │                  │
                    └──────────┬───────┘
                               │
                               ▼
        ┌──────────────────────────────────┐
        │   RunSessionScreen               │
        │   - Real-time metrics            │
        │   - Coaching messages            │
        │   - GPS tracking                 │
        │   - Pause / Stop / Resume        │
        │   - Route map (if route mode)    │
        │   - Watch mode (waiting for BLE) │
        │   - Observer sync                │
        │   - Interval phase tracking      │
        └────────────┬─────────────────────┘
                     │ Run Complete
                     ▼
        ┌──────────────────────────────────┐
        │   RunSummaryScreen               │
        │   - Summary metrics              │
        │   - Graphs & charts              │
        │   - AI insights                  │
        │   - Social share                 │
        │   - Edit run name/comments       │
        │   - Delete run                   │
        └──��─────────┬─────────────────────┘
                     │
                ┌────┴────┐
                │ Back to  │
                │ Dashboard│
                │ or       │
                │ History  │
                └─────────┘
```

---

## 2. Screen Component Hierarchy

```
RunSessionScreen
├── Header Section
│   ├── Status bar (GPS, time elapsed)
│   └── Run metrics (distance, pace, cadence, HR)
├── Main Content
│   ├── [Route Mode]
│   │   ├── GoogleMap with polyline
│   │   ├── Current location marker
│   │   └── Turn-by-turn instructions
│   ├── [Elite Mode - Garmin Connected]
│   │   ├── Effort Core dial
│   │   ├── Adaptive insight layers
│   │   └── Real-time coaching cards
│   └── [Free Run Elite - No Garmin]
│       ├── Performance dashboard
│       ├── Pace/elevation graph
│       └── Cadence/HR metrics
├── Coaching Section
│   ├── Latest coach message display
│   ├── TTS playback indicator
│   └── Wake word detected badge
├── Group Run Panel (if applicable)
│   ├── Participant list
│   ├── Sync status
│   └── Observer count
└── Control Buttons
    ��── Pause / Resume
    ├── End Run
    └── Cancel
```

---

## 3. Data Model Relationships

```
┌──────────────────────────────────────────────────────────────┐
│                    User Profile                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ defaultSessionType: String = "RUN" or "WALK"            │ │
│  │ coachPaceEnabled: Boolean                               │ │
│  │ coachElevationEnabled: Boolean                          │ │
│  │ ... other coach feature flags ...                       │ │
│  └──────────────────┬──────────────────────────────────────┘ │
└─────────────────────┼──────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────┐
│              RunSetupConfig                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ activityType: PhysicalActivityType (RUN | WALK)        │  │
│  │ targetDistance: Float? = null                          │  │
│  │ targetTime: (hours, minutes, seconds)                  │  │
│  │ aiCoachEnabled: Boolean = true                         │  │
│  │ isGroupRun: Boolean = false                            │  │
│  │ isWatchMode: Boolean = false                           │  │
│  │ isIntervalWorkout: Boolean = false                     │  │
│  │ route: GeneratedRoute? = null                          │  │
│  │ workoutType: String? ("easy"|"tempo"|"intervals"...)  │  │
│  │ linkedPlanId: String? = null                           │  │
│  └────────────────────┬─────────────────────────────────┘  │
└─────────────────────────┼──────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │       RunState (Current)         │
        │  ┌───────────────────────────┐  │
        │  │ time: String              │  │
        │  │ distance: String          │  │
        │  │ pace: String              │  │
        │  │ currentPace: String       │  │
        │  │ cadence: String           │  │
        │  │ heartRate: String         │  │
        │  │ isRunning: Boolean        │  │
        │  │ isPaused: Boolean         │  │
        │  │ latestCoachMessage: Str   │  │
        │  │ briefingResponse: Obj     │  │
        │  │ intervalPhase: Obj?       │  │
        │  └───────────────────────────┘  │
        └─────────────┬───────────────────┘
                      │
                      ▼
        ┌──────────────────────────────┐
        │      RunSession (Completed)  │
        │  ┌──────────────────────────┐│
        │  │ id: String               ││
        │  │ startTime: Long          ││
        │  │ endTime: Long            ││
        │  │ duration: Long           ││
        │  │ distance: Double (meters)││
        │  │ averagePace: String      ││
        │  │ cadence: Int             ││
        │  │ heartRate: Int           ││
        │  │ sessionType: "run"|"walk"││
        │  │ workoutType: String?     ││
        │  │ groupRunId: String?      ││
        │  │ externalSource: Str?     ││
        │  │ garminActivityId: Str?   ││
        │  │ ... 40+ more fields ...  ││
        │  └──────────────────────────┘│
        └──────────────────────────────┘
```

---

## 4. Activity Type (RUN vs WALK) Flow

```
┌────────────────────────────────────────────────────┐
│  User Default Preference                           │
│  User.defaultSessionType = "RUN"                   │
└─────────────────────┬────────────────────────────┘
                      │ Loaded into MapMyRunSetupScreen
                      │ as initial state
                      ▼
      ┌────────────────────────────────┐
      │  Activity Type Toggle           │
      │  [RUN] | [WALK]                 │
      │  (ActivityMode.RUN / .WALK)     │
      └────────────┬─────────────────────┘
                   │
           ┌───────▼────────┐
           │                │
      RUN Selected      WALK Selected
           │                │
           ▼                ▼
  ┌──────────────────┐  ┌──────────────────┐
  │ PhysicalActivity │  │ PhysicalActivity │
  │ Type.RUN         │  │ Type.WALK        │
  └────────┬─────────┘  └────────┬─────────┘
           │                     │
           └──────────┬──────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │ RunSetupConfig.activity │
         │ Type persists through   │
         │ setup workflow          │
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │ RunSession.sessionType  │
         │ = "run" or "walk"       │
         │ (stored as String)      │
         └─────────────────────────┘
```

---

## 5. Screen Text Labels Map

```
┌──────────────────────────────────────────────────┐
│          MapMyRunSetupScreen Text                │
│                                                  │
│  Header (mode-dependent):                        │
│  ┌────────────────────────────────────────────┐ │
│  │ Route Mode:                                │ │
│  │ "MAP MY RUN SETUP"                         │ │
│  │ "Configure your route preferences"         │ │
│  │                                            │ │
│  │ No-Route Mode:                             │ │
│  │ "CONFIGURE YOUR RUN"                       │ │
│  │ "Set your run details"                     │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  Activity Type Section:                          │
│  ┌────────────────────────────────────────────┐ │
│  │ Button 1: "RUN"                            │ │
│  │ Button 2: "WALK"                           │ │
│  │ (Toggle selects ActivityMode.RUN/WALK)     │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  Primary Actions (bottom):                       │
│  ┌────────────────────────────────────────────┐ │
│  │ [Prepare Run on Watch]  [START RUN]       │ │
│  │ (watch only)            (always)           │ │
│  │                         or                 │ │
│  │                    [MAP MY RUN] (route)    │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│        RouteSelectionScreen Text                 │
│                                                  │
│  Header:                                         │
│  "SELECT YOUR ROUTE"                             │
│  "Choose from N routes"                          │
│                                                  │
│  Route Groups (by difficulty):                   │
│  EASY ROUTES      [Color: #FFD700]                │
│  MODERATE ROUTES  [Color: #FFD700]                │
│  HARD ROUTES      [Color: #FFD700]                │
│                                                  │
│  Route Cards:                                    │
│  [Route Name] | Distance | Elevation | Select    │
│                                                  │
│  Bottom Actions:                                 │
│  [Prepare Run on Watch] [START RUN]              │
│                                                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│        RunSessionScreen Text                     │
│                                                  │
│  Default Coach Message:                          │
│  "GPS locked! Tap 'Start Run' when you're ready"│
│                                                  │
│  Control Buttons:                                │
│  PAUSE / RESUME (toggle)                         │
│  STOP RUN                                        │
│  CANCEL                                          │
│                                                  │
│  Real-time Display:                              │
│  [Time] [Distance] [Pace] [Cadence] [HR]        │
│                                                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│   PreviousRunsScreen / Run History Text          │
│                                                  │
│  Navigation:                                     │
│  [Back] Run History                              │
│                                                  │
│  List Items:                                     │
│  Date | Distance | Duration | Pace | [Details] │
│                                                  │
│  Filters:                                        │
│  [All] [This Week] [This Month] [Distance]      │
│                                                  │
│  Import Options:                                 │
│  [Import Run History] (from Garmin)              │
│  [Run History] (view imported activities)        │
│                                                  │
│  Special Labels:                                 │
│  "Run History" (tile)                            │
│  "No Run History" (when empty)                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 6. ViewModel State Management

```
┌─────────────────────────────────────────���───────────────┐
│             RunSessionViewModel                          │
│                                                          │
│  StateFlow<RunState>                                    │
│    ├── time, distance, pace, cadence, heartRate         │
│    ├── isRunning, isPaused                              │
│    ├── latestCoachMessage                               │
│    ├── briefingResponse                                 │
│    └── intervalPhase (nullable)                         │
│                                                          │
│  StateFlow<RunSession?>                                 │
│    └── Full session data (populated at end)             │
│                                                          │
│  StateFlow<RouteRecognitionResponse?>                   │
│    └── Matched known route (nullable)                   │
│                                                          │
│  StateFlow<Int> pendingSyncCount                        │
│    └── Offline queued updates                           │
│                                                          │
│  StateFlow<Boolean> isPowerSaverWarningVisible          │
│    └── Warning banner display state                     │
│                                                          │
│  StateFlow<Boolean> isWatchCompanionInstalled           │
│    └── Determines "Prepare Run on Watch" button         │
│                                                          │
│  Key Methods:                                            │
│    ├── startRun()                                        │
│    ├── pauseRun()                                        │
│    ├── resumeRun()                                       │
│    ├── stopRun()                                         │
│    ├── prepareRunOnWatch()                              │
│    └── ... ~30+ more state update methods               │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            RunSummaryViewModel                           │
│                                                          │
│  Receives: RunSession from RunSessionViewModel           │
│                                                          │
│  Processes:                                              │
│    ├── Fetch comprehensive analysis from backend        │
│    ├── Prepare graph data (pace, HR, elevation)         │
│    ├── Calculate splits and segments                    │
│    └── Load social sharing options                      │
│                                                          │
│  Manages:                                                │
│    ├── Run name/comment edits                           │
│    ├── Delete confirmation                              │
│    └── Share image generation                           │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│           PreviousRunsViewModel                          │
│                                                          │
│  StateFlow<List<RunSession>>                            │
│    └── Paginated list of user's runs                    │
│                                                          │
│  Manages:                                                │
│    ├── Run fetching from API/database                   │
│    ├── Filtering (distance, date, type)                 │
│    ├── Weather impact calculation                       │
│    ├── Personal best detection                          │
│    └── Cache refresh on screen re-entry                 │
│                                                          │
└──────────────────────���──────────────────────────────────┘
```

---

## 7. Configuration & Settings Hierarchy

```
┌─────────────────────────────────────────────────┐
│         User Account Settings                    │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ Default Session Type                       │ │
│  │ ┌─────────────────────────────────────┐   │ │
│  │ │ Preference: RUN or WALK              │   │ │
│  │ │ (defaults to "RUN")                  │   ��� │
│  │ │ Used in: MapMyRunSetupScreen         │   │ │
│  │ └─────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ AI Coach Features (all runs)               │ │
│  │ ┌─────────────────────────────────────┐   │ │
│  │ │ ☑ Pace coaching                      │   │ │
│  │ │ ☑ Navigation coaching                │   │ │
│  │ │ ☑ Elevation coaching                 │   │ │
│  │ │ ☑ Heart rate coaching                │   │ │
│  │ │ ☑ Cadence/stride coaching            │   │ │
│  │ │ ☑ KM split notifications             │   │ │
│  │ │ ☑ Struggle detection                 │   │ │
│  │ │ ☑ Motivational messages              │   │ │
│  │ │ ☑ Half-KM check-ins                  │   │ │
│  │ └─────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ Coach Personalization (CoachSettingsScreen)│ │
│  │ ┌─────────────────────────────────────┐   │ │
│  │ │ Coach Name                           │   │ │
│  │ │ Voice Gender: [Male] [Female]        │   │ │
│  │ │ Accent: [British] [American] ...     │   │ │
│  │ │ Tone: [Energetic] [Calm] [Intense]   │   │ │
│  │ └─────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
                     │
                     ▼ (Synced to server)
       ┌──────────────────────────────┐
       │ Per-Run Configuration         │
       │ (MapMyRunSetupScreen)         │
       │ ┌──────────────────────────┐ │
       │ │ Activity Type: RUN/WALK   │ │
       │ │ Distance: N km            ��� │
       │ │ Target Time: (optional)   │ │
       │ │ AI Coach: ON/OFF          │ │
       │ │ Group Run: ON/OFF         │ │
       │ │ Route: (if applicable)    │ │
       │ └──────────────────────────┘ │
       └──────────────────────────────┘
```

---

## 8. File Organization by Feature

```
SCREENS
├── MapMyRunSetupScreen.kt        ← Run/Walk setup UI
├── RouteSelectionScreen.kt       ← Route choice UI
├── RunSessionScreen.kt           ← Active run UI
├── RunSummaryScreen.kt           ← Post-run UI
├── PreviousRunsScreen.kt         ← History UI
├── ObserverRunSessionScreen.kt   ← Live tracking UI
└── CoachSettingsScreen.kt        ← Coach config UI

VIEWMODELS
├── RunSessionViewModel.kt        ← Active run logic
├── RunSummaryViewModel.kt        ← Post-run logic
├── PreviousRunsViewModel.kt      ← History logic
└── ObserverRunSessionViewModel.kt ← Tracking logic

MODELS (Domain)
├── RunSession.kt                 ← Run data structure
├── RunSetupConfig.kt             ← Setup configuration
├── User.kt                       ← User preferences
├── RunState.kt                   ← Real-time state
├── IntervalPhase.kt              ← Interval tracking
├── PhysicalActivityType.kt       ← RUN/WALK enum
└── PreviousRun.kt               ← Simple run record

MODELS (Network)
├── PreRunBriefingResponse.kt     ← Pre-run coaching
├── RunHistoryStats.kt            ← History context
├── UploadRunRequest.kt           ← Upload payload
├── RunInsightsModels.kt          ← Analysis models
├── GroupRunModels.kt             ← Group run data
├── RouteRecognitionModels.kt     ← Route matching
└── ... other request/response models

SERVICES
├── RunTrackingService.kt         ← GPS tracking
└── GarminWatchManager.kt         ← Watch integration

COMPONENTS
├── PrepareRunOnWatchButton.kt    ← Reusable button
├── RunSessionGraphHelpers.kt     ← Graph utilities
└── AdvancedRunCharts.kt          ← Chart components

UTILITIES
├── RunSimulator.kt               ← Testing utility
├── RunConfigHolder.kt            ← Config storage
└── RunAnalytics.kt               ← Event tracking
```

---

## 9. Watch Integration Workflow

```
┌─────────────────────────────────────────────┐
│  Watch Companion App Installed?              │
│  (RunSessionViewModel.isWatchCompanionInstalled)
│                                              │
│  YES ──────────────────────────────┐        │
│  NO  ──────┐                       │        │
│            │                       │        │
│            ▼                       ▼        │
│    Skip "Prepare      [Show "Prepare       │
│    Run on Watch"      Run on Watch"]        │
│    button             button                │
│                                              │
│            ┌───────────────────┐           │
│            │                   │           │
│            ▼                   ▼           │
│      MapMyRun        Start Run on Phone    │
│      (no watch)      OR                    │
│                      Prepare for Watch     │
└─────────────────────────────────────────────┘
                    │
              ┌─────┴──────┐
              │            │
              ▼            ▼
         Phone      Watch Companion
         Mode       App
         │          │
         │          ├─ Receive config
         │          ├─ Execute run
         │          └─ Send completion
         │
         ├─ RunSessionScreen
         │  (starts immediately)
         │
         └─ Awaits START signal
            from Watch via BLE

After run:
┌──────────────────────────────┐
│  RunSessionScreen receives   │
│  completion signal           │
│  from watch/phone            │
└──────────────┬───────────────┘
               │
               ▼
        RunSummaryScreen
        (displays results)
```

---

## 10. Text Patterns Quick Reference

### Search for Configuration:
```
defaultSessionType         → User's preferred activity type
sessionType               → "run" or "walk" in RunSession
activityType             → PhysicalActivityType in config
ActivityMode.RUN/WALK    → Local UI enum
PhysicalActivityType.*   → Domain model values
```

### Search for Screens:
```
RunSessionScreen         → Active run
RunSummaryScreen         → Post-run
MapMyRunSetupScreen      → Pre-run config
RouteSelectionScreen     → Route choice
PreviousRunsScreen       → Run history
ObserverRunSessionScreen → Live tracking
CoachSettingsScreen      → Coach config
```

### Search for ViewModel:
```
RunSessionViewModel      → Active run state
RunSummaryViewModel      → Post-run state
PreviousRunsViewModel    → History state
ObserverRunSessionViewModel → Tracking state
```

### Search for UI Text:
```
"CONFIGURE YOUR RUN"     → MapMyRunSetupScreen no-route mode
"MAP MY RUN SETUP"       → MapMyRunSetupScreen route mode
"SELECT YOUR ROUTE"      → RouteSelectionScreen header
"START RUN"              → Primary action button
"Prepare Run"            → Watch preparation
"Run History"            → History view reference
```

---

## 11. Key Integration Points

```
┌─────────────────────────────────────────┐
│        Main Navigation Entry              │
│                                           │
│  Dashboard
│      ↓
│  MapMyRunSetupScreen
│      ├─→ Route Mode: RouteSelectionScreen
│      └─→ No-Route Mode: RunSessionScreen (direct)
│      
│  + Watch preparation (optional)
│      ↓
│  RunSessionScreen
│      ├─→ Active tracking
│      ├─→ Pause/Resume
│      └─→ Stop → RunSummaryScreen
│
��  History Access
│      ↓
│  PreviousRunsScreen
│      ├─→ Tap run → RunSummaryScreen
│      └─→ Import from Garmin
│
│  Settings
│      ↓
│  CoachSettingsScreen
│      └─→ Applies to all runs
│
└─────────────────────────────────────────┘
```

---

## Conclusion

This visual map shows:
- **Run Lifecycle**: From setup through execution to summary
- **Activity Types**: RUN vs WALK configuration at multiple levels
- **Screen Components**: UI layout and text labels
- **Data Flow**: How information moves between models, VMs, and screens
- **Navigation**: User journey paths through the app
- **Integration**: How watches, Garmin, and external services connect

Use this reference when adding new run-related features or modifying existing screens/models.
