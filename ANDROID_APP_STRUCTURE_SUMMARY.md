# AI Run Coach Android App - Structure & File Reference

## Overview
This document provides a comprehensive mapping of all Android app files related to run summaries, AI insights, coaching plans, adaptations, and related ViewModels. The app uses Jetpack Compose for UI, Hilt for dependency injection, and follows MVVM architecture.

---

## 1. Run Summary Screen & ViewModel

### Screen Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt`
  - **Size**: 404.4 KB, 9,817 lines (largest UI file in the app)
  - **Purpose**: Comprehensive UI for displaying completed run details, AI insights, and analysis
  - **Key Features**:
    - Displays run metrics (distance, pace, HR, elevation, etc.)
    - Shows AI-generated insights and analysis
    - Manages multiple analysis states (loading, comprehensive, basic, freeform, error, limit reached)
    - Run sharing and image generation
    - Edit run details, rename runs
    - Delete run functionality
    - Maps and elevation charts

### ViewModel Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSummaryViewModel.kt`
  - **Size**: 68.8 KB, 1,480 lines
  - **Purpose**: Manages run analysis, insights generation, and caching
  - **Key Responsibilities**:
    - Handles comprehensive AI run analysis requests
    - Manages analysis state (loading, success, error, quota limit)
    - Implements freeform (markdown-based) analysis
    - Tracks AI analysis quota and trial expiration
    - Caches analysis results to avoid repeated requests
    - Manages run editing, sharing, and deletion
  - **Key States**:
    - `AiAnalysisState.Idle` - No analysis yet
    - `AiAnalysisState.Loading` - Fetching analysis
    - `AiAnalysisState.Comprehensive` - Full structured analysis
    - `AiAnalysisState.Basic` - Fallback basic insights
    - `AiAnalysisState.Freeform` - Markdown analysis
    - `AiAnalysisState.LimitReached` - Quota/trial limits hit
    - `AiAnalysisState.Error` - Analysis failed

---

## 2. AI Insights Models

### Network Models
- **File**: `app/src/main/java/live/airuncoach/airuncoach/network/model/RunInsightsModels.kt`
  - **Purpose**: Data models for AI insights, analysis, and weather impact
  - **Key Models**:
    - `BasicRunInsights` - Fallback simple insights (highlights, struggles, tips, score)
    - `ComprehensiveRunAnalysis` - Full structured analysis with multiple sections:
      - Performance score and summary
      - Highlights and struggles
      - Personal bests and improvement tips
      - Training load assessment
      - Recovery advice
      - Next run suggestions
      - Wellness and weather impact
      - Technical analysis (pace, HR, cadence, dynamics, elevation)
      - Garmin insights (training effect, VO2Max, recovery time)
    - `NextWorkoutCoaching` - Specific coaching for upcoming workout
    - `TechnicalAnalysis` - Detailed metrics breakdown
    - `GarminInsights` - Garmin watch metrics analysis
    - `FreeformAnalysisRequest` - Comprehensive request data for markdown analysis including:
      - Run metrics and splits
      - Weather conditions and performance index
      - User profile and demographics
      - Active goals context
      - Coach settings
      - Historical context
    - `FreeformAnalysisResponse` - Markdown-formatted AI analysis
    - `WeatherImpactFactor` - Individual weather factor analysis
    - `UserWeatherInsights` - User's historical weather performance patterns
    - `ComprehensiveAnalysisResponse` - API response wrapper

---

## 3. Coaching Plans - Generation & Management

### Screen Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GeneratePlanScreen.kt`
  - **Size**: 86.2 KB, 1,695 lines
  - **Purpose**: UI for creating new AI-generated training plans
  - **Key Features**:
    - Goal type selection (5K, 10K, half-marathon, marathon, custom)
    - Target date and duration configuration
    - Experience level selection
    - Days per week configuration
    - Regular sessions input (existing recurring runs)
    - Injury tracking for plan safety
    - Weekly mileage and intensity preferences
    - Plan generation and preview

- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/CoachingProgrammeScreen.kt`
  - **Size**: 89.4 KB, 1,882 lines
  - **Purpose**: Main coaching plan view with full schedule and progress tracking
  - **Key Features**:
    - Week-by-week schedule display
    - Workout details and instructions
    - Progress tracking and completion status
    - Workout execution details
    - Plan adaptation suggestions
    - Reschedule workouts functionality

### ViewModel Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/GeneratePlanViewModel.kt`
  - **Size**: 23.7 KB, 539 lines
  - **Purpose**: Manages plan generation workflow
  - **Key Responsibilities**:
    - Validates plan generation inputs
    - Handles API requests for plan generation
    - Manages form state and user selections
    - Tracks generation progress

- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/TrainingPlanViewModel.kt`
  - **Size**: 19.0 KB, 411 lines
  - **Purpose**: Manages training plan display and interaction
  - **Key Responsibilities**:
    - Loads plan details and progress
    - Handles workout completion marking
    - Manages plan rescheduling
    - Tracks plan progress metrics

### Network Models
- **File**: `app/src/main/java/live/airuncoach/airuncoach/network/model/TrainingPlanModels.kt`
  - **Size**: 12.8 KB, 231 lines
  - **Purpose**: Request/response models for training plan API
  - **Key Models**:
    - `GeneratePlanRequest` - Plan generation input with:
      - Goal type, distance, time, date
      - Experience level and days per week
      - Regular sessions (recurring runs)
      - Injuries list for safety considerations
      - User demographics (age, gender, height, weight)
      - Timezone for proper scheduling
      - Pre-event plan flag
    - `GeneratePlanResponse` - Plan creation response
    - `TrainingPlanSummary` - Plan metadata (status, progress, duration)
    - `TrainingPlanDetails` - Full plan with all weeks and workouts
    - `WeekDetails` - Individual week information
    - `WorkoutDetails` - Specific workout with:
      - Type (easy, tempo, intervals, long run, hill repeats, etc.)
      - Distance and duration targets
      - Target pace and intensity (zone 1-5)
      - Heart rate zone information
      - Interval metadata (reps, distances, recovery info)
      - Completion status
    - `TrainingPlanProgress` - Plan completion tracking
    - `PerformanceBaseline` - User's historical baseline for plan design
    - `TodayWorkoutResponse` - Current day's workout
    - `CompleteWorkoutRequest/Response` - Workout completion tracking
    - `RescheduleSessionsRequest/Response` - Workout rescheduling
    - `BlockStatus` - Rolling block generation status (for phased plan generation)
    - `RegularSessionRequest` - Recurring run configuration
    - `InjuryRequest` - Injury data for plan safety

### Domain Models
- **File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/TrainingPlan.kt`
  - **Purpose**: Core training plan domain objects
  - **Key Models**:
    - `TrainingPlan` - Complete plan with:
      - ID, name, description, goal
      - Duration in weeks
      - Start/end dates
      - Weekly workouts (weeklyWorkouts)
      - Peak week and taper weeks
      - Difficulty level
      - Completion rate
    - `TrainingGoal` - Goal definition:
      - Type (5K, 10K, half-marathon, marathon, ultra, speed, endurance, weight loss, maintenance, comeback)
      - Target distance and time
      - Target pace and race date
    - `WeeklyPlan` - Week-level plan with:
      - Week number and date
      - Theme (Base Building, Speed Work, Taper)
      - Total distance and duration
      - List of planned workouts
      - Recovery week flag
      - Completion percentage
    - `PlannedWorkout` - Individual workout:
      - Type (Easy, Long, Tempo, Intervals, Hill Repeats, Fartlek, Recovery, Rest, Cross-training, Race Pace, Progression)
      - Intensity zones
      - Interval structure (warmup, work, recovery, cooldown)
      - Target metrics
      - Completion tracking
    - `Interval` - Interval structure
    - `PlanProgress` - Progress tracking with weekly compliance
    - `PlanAdaptation` - Plan change records
    - `WorkoutAnalysis` - Analysis of workout execution vs. plan
    - `PlanDifficulty` enum: BEGINNER, INTERMEDIATE, ADVANCED, ELITE
    - `WorkoutType` enum: 11 different workout types
    - `WorkoutIntensity` enum: VERY_EASY through MAX_EFFORT (Zone 1-5+)

---

## 4. Plan Adaptations & Changes

### Screen Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/AdaptationReviewScreen.kt`
  - **Size**: 13.4 KB, 375 lines
  - **Purpose**: UI for reviewing and accepting/declining AI-suggested plan adaptations
  - **Key Features**:
    - Lists pending plan adaptations
    - Shows adaptation reasons (missed workout, injury, over-training, ahead of schedule)
    - Displays AI suggestions for changes
    - Accept/decline decision interface
    - Confirmation dialogs

### ViewModel Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/AdaptationViewModel.kt`
  - **Size**: 5.3 KB, 149 lines
  - **Purpose**: Manages plan adaptation requests and responses
  - **Key Responsibilities**:
    - Loads pending adaptations for a plan
    - Accepts adaptations (applies changes)
    - Declines adaptations (rejects changes)
    - Manages loading and error states
    - Tracks success/error messages

### Network Models
- **File**: `app/src/main/java/live/airuncoach/airuncoach/network/model/PlanAdaptationRequest.kt`
  - **Purpose**: Request/response models for plan adaptations
  - **Key Models**:
    - `PendingAdaptation` - Suggested plan change with:
      - ID and training plan ID
      - Adaptation date
      - Reason (missed_workout, injury, over_training, ahead_of_schedule)
      - Changes map (flexible for different adaptation types)
      - AI suggestion text
      - User acceptance flag
    - `PendingAdaptationsResponse` - List of pending adaptations
    - `AcceptAdaptationRequest` - Accept action
    - `DeclineAdaptationRequest` - Decline action
    - `AdaptationResponse` - Result of accept/decline with workouts updated count

---

## 5. Session & Workout Details

### Screen Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/WorkoutDetailScreen.kt`
  - **Size**: 51.6 KB, 1,023 lines
  - **Purpose**: Detailed view of a specific planned or completed workout
  - **Key Features**:
    - Workout metrics and target information
    - Interval breakdown for complex workouts
    - Actual performance vs. planned
    - Coach notes and suggestions
    - Reschedule options

- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSessionScreen.kt`
  - **Size**: 121.6 KB, 3,402 lines
  - **Purpose**: Real-time running session screen with live coaching
  - **Key Features**:
    - Real-time metrics display (pace, HR, distance, cadence)
    - Live AI coaching during run
    - Heart rate zone guidance
    - Elevation and terrain display
    - Pace coaching and adjustments
    - Session summary at end

### ViewModel Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSessionViewModel.kt`
  - **Size**: 103.4 KB, 2,054 lines
  - **Purpose**: Manages active running session state and coaching
  - **Key Responsibilities**:
    - Tracks real-time location and metrics
    - Manages live coaching logic
    - Handles voice coaching queue
    - Tracks struggle points
    - Monitors heart rate zones
    - Manages session completion

### Domain Models
- **File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt`
  - **Size**: 12.1 KB, 255 lines
  - **Purpose**: Core run session data
  - **Key Models**:
    - `RunSession` - Active/completed run with:
      - ID, user ID, planned workout reference
      - Start/end times and location
      - Total distance, duration, elevation
      - Average metrics (pace, HR, cadence)
      - Splits (KM split data)
      - Struggle points
      - Heart rate zones
      - Weather conditions
      - Garmin sync status
      - Notes and feedback

- **File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/SessionCoaching.kt`
  - **Purpose**: In-session coaching guidance
  - **Key Models**:
    - `SessionCoaching` - Coaching context and suggestions during run
    - `CoachingPhase` - Phase information
    - `CoachingContext` - Context data for coaching decisions

### Network Models
- **File**: `app/src/main/java/live/airuncoach/airuncoach/network/model/SessionCoachingModels.kt`
  - **Size**: 23.1 KB, 439 lines
  - **Purpose**: Session coaching request/response models
  - **Key Features**: Real-time coaching data structures

---

## 6. Coaching Components

### UI Components
- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/components/CoachingPlanBadge.kt`
  - **Purpose**: Visual badge component for displaying plan status/indicators

### Related Files
- **File**: `app/src/main/java/live/airuncoach/airuncoach/data/CoachingFeaturePreferences.kt`
  - **Purpose**: User preferences for coaching features

- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/AiCoachingOnboardingScreen.kt`
  - **Purpose**: Onboarding for AI coaching features

- **File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/InSessionCoachingSettingsScreen.kt`
  - **Purpose**: Configure in-session coaching preferences

---

## 7. Related ViewModels

### Supporting ViewModels
- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/DashboardViewModel.kt` (21.3 KB, 510 lines)
  - Manages main dashboard including plan overview

- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/GoalsViewModel.kt` (19.4 KB, 457 lines)
  - Manages running goals that drive plan generation

- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/PreviousRunsViewModel.kt` (16.6 KB, 337 lines)
  - Lists and manages historical runs

- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/AnalysisHelpers.kt` (11.7 KB, 326 lines)
  - Utility functions for run analysis calculations

- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/ObserverRunSessionViewModel.kt` (9.4 KB, 227 lines)
  - Manages observer/spectator view of someone's run session

- **File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/GroupRunDetailViewModel.kt` (7.1 KB, 191 lines)
  - Manages group run details and progress

---

## 8. Data Models & Utilities

### Additional Domain Models
- **File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/Goal.kt`
  - User running goals (drives plan generation)

- **File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/Segment.kt`
  - Run segment data (Strava-like segments)

- **File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/StrugglePoint.kt`
  - Points where runner struggled during the run

- **File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/Injury.kt`
  - User injury tracking for plan safety

- **File**: `app/src/main/java/live/airuncoach/airuncoach/domain/model/HeartRateZone.kt`
  - User's personalized heart rate zones for coaching

### Data & Storage
- **File**: `app/src/main/java/live/airuncoach/airuncoach/data/SessionManager.kt` (8.0 KB, 261 lines)
  - Manages session state and persistence

- **File**: `app/src/main/java/live/airuncoach/airuncoach/data/RunRepository.kt` (3.6 KB, 116 lines)
  - Repository for run data access

- **File**: `app/src/main/java/live/airuncoach/airuncoach/data/database/`
  - Room database entities and DAOs

---

## 9. Network & API Integration

### API Service
- **File**: `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt` (37.2 KB, 1,003 lines)
  - Main API client with endpoints for:
    - Plan generation and management
    - Adaptation acceptance/decline
    - Run analysis requests
    - Workout completion
    - Plan rescheduling

---

## 10. Key Architectural Patterns

### MVVM + Repository Pattern
- Each screen has a dedicated ViewModel
- ViewModels use StateFlow for reactive state management
- Network models separated from domain models
- Repository layer for data access

### State Management
- Comprehensive `AiAnalysisState` for analysis loading/display
- Pending/success/error states in adaptation VM
- Real-time session state in RunSessionViewModel

### Dependency Injection
- Hilt for DI throughout
- ViewModels use @HiltViewModel
- ApiService injected into ViewModels

### Error Handling
- Quota limit tracking (trial expired, monthly limit)
- Graceful fallback to basic insights
- User-friendly error messages

---

## 11. Directory Structure Summary

```
app/src/main/java/live/airuncoach/airuncoach/
├── ui/screens/
│   ├── RunSummaryScreen.kt          [404 KB] ⭐ Run summary UI
│   ├── GeneratePlanScreen.kt        [86 KB] Plan generation UI
│   ├── CoachingProgrammeScreen.kt   [89 KB] Plan view UI
│   ├── AdaptationReviewScreen.kt    [13 KB] Adaptation decision UI
│   ├── WorkoutDetailScreen.kt       [52 KB] Workout details UI
│   ├── RunSessionScreen.kt          [121 KB] Live session UI
│   └── [50+ other screens]
│
├── viewmodel/
│   ├── RunSummaryViewModel.kt       [69 KB] ⭐ Analysis & insights
│   ├── GeneratePlanViewModel.kt     [24 KB] Plan generation
│   ├── TrainingPlanViewModel.kt     [19 KB] Plan management
│   ├── AdaptationViewModel.kt       [5 KB] Adaptation logic
│   ├── RunSessionViewModel.kt       [103 KB] Session coaching
│   ├── DashboardViewModel.kt        [21 KB] Dashboard
│   ├── GoalsViewModel.kt            [19 KB] Goals management
│   └── [20+ other ViewModels]
│
├── network/model/
│   ├── RunInsightsModels.kt         ⭐ AI insights & analysis
│   ├── TrainingPlanModels.kt        ⭐ Plan request/responses
│   ├── PlanAdaptationRequest.kt     ⭐ Adaptation models
│   ├── SessionCoachingModels.kt     In-session coaching
│   └── [40+ other network models]
│
├── domain/model/
│   ├── TrainingPlan.kt              ⭐ Plan domain objects
│   ├── RunSession.kt                ⭐ Session domain objects
│   ├── SessionCoaching.kt           Coaching context
│   ├── Goal.kt                      Goal definitions
│   ├── Injury.kt                    Injury tracking
│   ├── HeartRateZone.kt            HR zone data
│   └── [30+ other domain models]
│
├── ui/components/
│   ├── CoachingPlanBadge.kt         Plan status badge
│   ├── AdvancedRunCharts.kt         Analysis charts
│   └── [10+ other components]
│
├── data/
│   ├── SessionManager.kt            Session persistence
│   ├── RunRepository.kt             Run data access
│   ├── database/                    Room database
│   └── [other data layer]
│
└── network/
    └── ApiService.kt               [37 KB] API client
```

---

## 12. File Locations (Absolute Paths)

### Critical Files for Run Summaries
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSummaryScreen.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSummaryViewModel.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/network/model/RunInsightsModels.kt`

### Critical Files for Plans & Adaptations
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/ui/screens/GeneratePlanScreen.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/ui/screens/CoachingProgrammeScreen.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/ui/screens/AdaptationReviewScreen.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/viewmodel/GeneratePlanViewModel.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/viewmodel/TrainingPlanViewModel.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/viewmodel/AdaptationViewModel.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/network/model/TrainingPlanModels.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/network/model/PlanAdaptationRequest.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/domain/model/TrainingPlan.kt`

### Critical Files for Sessions
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSessionScreen.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/viewmodel/RunSessionViewModel.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSession.kt`
- `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/network/model/SessionCoachingModels.kt`

---

## 13. Key Statistics

| Category | File Count | Total Size |
|----------|-----------|-----------|
| UI Screens | 50+ | ~2.5 MB |
| ViewModels | 36+ | ~1.2 MB |
| Network Models | 45+ | ~800 KB |
| Domain Models | 35+ | ~600 KB |
| Components | 12+ | ~250 KB |

### Largest Files (Most Complex Logic)
1. RunSummaryScreen.kt - 404 KB (UI)
2. RunSessionScreen.kt - 121 KB (Live coaching UI)
3. RunSessionViewModel.kt - 103 KB (Session management)
4. CoachingProgrammeScreen.kt - 89 KB (Plan view)
5. GeneratePlanScreen.kt - 86 KB (Plan generation)
6. RunSummaryViewModel.kt - 69 KB (Analysis logic)

---

## 14. Integration Points

### Data Flow
```
User Action (Summary Screen)
    ↓
RunSummaryViewModel
    ↓
ApiService (comprehensive analysis endpoint)
    ↓
Backend AI Analysis Engine
    ↓
RunInsightsModels (deserialization)
    ↓
UI Display (analysis states)
```

### Plan Generation Flow
```
User Input (GeneratePlanScreen)
    ↓
GeneratePlanViewModel (validation)
    ↓
ApiService (POST /api/training-plans/generate)
    ↓
Backend Plan Generator
    ↓
TrainingPlanModels (deserialization)
    ↓
TrainingPlanViewModel (display)
    ↓
CoachingProgrammeScreen (UI display)
```

### Adaptation Flow
```
Backend AI Detection
    ↓
AdaptationViewModel (load pending)
    ↓
AdaptationReviewScreen (user decision)
    ↓
ApiService (accept/decline)
    ↓
Plan Update
```

---

## Summary

This AI Run Coach Android app has a comprehensive suite of screens and ViewModels for:
1. **Run Analysis**: Advanced AI insights in multiple formats (comprehensive, basic, freeform markdown)
2. **Training Plans**: AI-generated structured training with full scheduling and progress tracking
3. **Adaptations**: Smart plan adjustments based on performance, injuries, and progress
4. **Live Coaching**: Real-time guidance during runs with heart rate zones and pace coaching
5. **Session Management**: Complete workout tracking with metrics and analysis

All components follow MVVM architecture with proper separation of concerns, Hilt dependency injection, and reactive state management via Kotlin Flow.
