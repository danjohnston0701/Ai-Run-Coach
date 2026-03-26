# AI Run Coach - Run Summary Screen - Complete iOS Implementation Spec

**Document Version:** 1.0  
**Last Updated:** March 25, 2026  
**Target Platform:** iOS (Native or Swift)  
**Android Reference Version:** Kotlin Compose

---

## 📋 Table of Contents
1. [Overview & Screen Architecture](#overview--screen-architecture)
2. [Data Models](#data-models)
3. [Tab Structure](#tab-structure)
4. [UI Components & Charts](#ui-components--charts)
5. [Garmin Integration](#garmin-integration)
6. [Share Image System](#share-image-system)
7. [Known Issues & TODOs](#known-issues--todos)
8. [API Endpoints](#api-endpoints)

---

## Overview & Screen Architecture

### Screen Purpose
The Run Summary Screen is the primary post-run analysis interface. It displays:
- **Comprehensive run metrics** (distance, pace, HR, cadence, elevation)
- **AI-powered insights** (personalized coaching analysis)
- **Struggle point detection & annotation** (pace drops with user commentary)
- **Personal Best badges** (achievements unlocked on this run)
- **Garmin data enrichment** (optional sync from Garmin devices)
- **Share functionality** (image generation and social sharing)

### High-Level Flow
```
RunSummaryScreenFlagship (main composable)
├── Top Bar (run date, distance, duration, avg pace)
├── Tab Navigation (AI Insights | Summary | Graphs | Data | Badges)
├── Tab Content
│   ├── AI Insights Tab → AiInsightsTab → analysis state display
│   ├── Summary Tab → SummaryTabFlagship → key metrics + struggle points
│   ├── Graphs Tab → GraphsTabContent → pace, HR, elevation, advanced charts
│   ├── Data Tab → DataTabFlagship → raw metrics (speed, elevation, weather, GPS)
│   └── Badges Tab → AchievementsTabFlagship → personal bests + milestones
├── Modals (Garmin sync, pending notifications, error states)
└── Bottom Actions (delete run, AI analysis, share)
```

### State Management (ViewModel)
- **RunSummaryViewModel** (Kotlin) manages all state:
  - `runSession: StateFlow<RunSession?>` - loaded run data
  - `analysisState: StateFlow<AiAnalysisState>` - AI analysis (Idle/Loading/Comprehensive/Freeform/Basic/Error)
  - `strugglePoints: StateFlow<List<StrugglePoint>>` - detected pace drops
  - `userPostRunComments: StateFlow<String>` - user's self-assessment
  - Garmin state: `isGarminConnected`, `isEnrichingWithGarmin`, `showGarminSyncPendingDialog`, etc.

---

## Data Models

### Core Data Structure: RunSession
```kotlin
data class RunSession(
    // Basic identifiers
    val id: String,
    val startTime: Long,              // Unix timestamp (ms)
    val endTime: Long?,
    val duration: Long,                // milliseconds
    
    // Distance metrics
    val distance: Double,              // meters
    val averageSpeed: Float,           // m/s
    val maxSpeed: Float,               // m/s
    val averagePace: String?,          // "min:ss/km" format (e.g., "5:42/km")
    val currentPace: String? = null,   // Real-time instant pace
    
    // Physiological
    val heartRate: Int,                // Average bpm
    val cadence: Int,                  // Average steps per minute
    val calories: Int,
    
    // Time-series data (present for Garmin-enriched runs)
    val heartRateData: List<Int>?,     // HR data point per second or interval
    val paceData: List<Double>?,       // Pace data points over time
    
    // Route & terrain
    val routePoints: List<LocationPoint>,  // GPS coordinates with HR/pace
    val kmSplits: List<KmSplit>,           // km-by-km breakdown
    val totalElevationGain: Double,        // meters climbed
    val totalElevationLoss: Double,        // meters descended
    val averageGradient: Float,            // percentage
    val maxGradient: Float,                // percentage
    val terrainType: TerrainType?,         // FLAT, ROLLING, HILLY, STEEP, EXTREME
    val steepestIncline: Float?,           // percent
    val steepestDecline: Float?,           // percent
    
    // Weather
    val weatherAtStart: WeatherData?,
    val weatherAtEnd: WeatherData?,
    
    // Route identification
    val routeHash: String?,            // Hash for similarity matching
    val routeName: String?,            // User-defined route name
    
    // External sync (Garmin, Strava, etc)
    val externalSource: String? = null,  // "garmin", "strava", null for native
    val externalId: String? = null,
    val hasGarminData: Boolean = false,  // TRUE if enriched with Garmin data
    val garminActivityId: String? = null,
    
    // Post-run analysis context
    val name: String? = null,
    val difficulty: String? = null,       // "easy", "moderate", "hard"
    val userComments: String? = null,     // User's self-assessment
    val strugglePoints: List<StrugglePoint> = emptyList(),
    
    // AI analysis
    val aiCoachingNotes: List<AiCoachingNote> = emptyList(),
    
    // Achievements
    val achievements: List<RunAchievement> = emptyList(),
    
    // Target tracking
    val targetDistance: Double? = null,    // km
    val targetTime: Long? = null,          // ms
    val wasTargetAchieved: Boolean? = null,
    
    // Training plan context
    val linkedWorkoutId: String? = null,
    val linkedPlanId: String? = null,
    val planProgressWeek: Int? = null,
    val workoutType: String? = null,       // "easy", "tempo", "intervals", "long_run"
    val workoutIntensity: String? = null,  // "z1", "z2", "z3", "z4", "z5"
    
    // Extended metrics
    val minHeartRate: Int? = null,
    val maxCadence: Int? = null,
    val avgStrideLength: Float? = null,
    val minElevation: Double? = null,
    val maxElevation: Double? = null,
    val totalSteps: Int? = null
)

// Helper methods:
fun getDistanceInKm(): Double = distance / 1000.0
fun getFormattedDuration(): String = "HH:mm:ss" or "mm:ss"
fun getFormattedDate(): String = "dd/MM/yyyy"
fun getDifficultyLevel(): String  // Returns "flat", "rolling", "hilly", "steep", "extreme"
fun calculateRouteSimilarity(other: RunSession): Float  // 0.0-1.0
```

### StrugglePoint Model
```kotlin
data class StrugglePoint(
    val id: String,
    val timestamp: Long,               // When struggle occurred
    val distanceMeters: Double,        // Distance at struggle point
    val paceAtStruggle: String,        // e.g., "7:15/km"
    val baselinePace: String,          // Previous km pace for comparison
    val paceDropPercent: Double,       // % slowdown (e.g., 18.5)
    val currentGrade: Double?,         // Terrain gradient at this point (percent)
    val heartRate: Int?,               // HR at struggle point (bpm)
    val location: LocationPoint?,      // GPS coordinates
    
    // User annotations
    var userComment: String? = null,   // User's explanation ("traffic light", etc)
    var isRelevant: Boolean = true,    // FALSE if should be excluded from AI analysis
    var dismissReason: DismissReason? = null
)

enum class DismissReason {
    TRAFFIC_LIGHT,      // Stopped at lights
    BATHROOM_BREAK,
    STOPPED_FOR_PHOTO,
    TIED_SHOE,
    WATER_BREAK,
    CROSSING_ROAD,
    OTHER
}

// Inference logic (from Android):
// Struggle points are detected when pace slows by >= 15% from previous km split
// Stored in backend but also inferred locally from km splits if backend has no data
```

### RunAchievement (Personal Best Badge)
```kotlin
data class RunAchievement(
    val type: String,                  // Achievement type ID
    val title: String,                 // e.g., "New 5K Personal Best"
    val description: String,
    val icon: String,                  // emoji icon
    val backgroundColor: String,       // hex color (#RRGGBB)
    val category: String,              // Distance: "1K", "1 Mile", "5K", "10K", "Half Marathon", "Marathon"
    val previousBestPaceMinPerKm: Double? = null,
    val improvementPercent: Float? = null  // % improvement over previous best
)
```

### KmSplit (Split Analysis)
```kotlin
data class KmSplit(
    val km: Int,                       // Which km (1, 2, 3, etc)
    val time: Long,                    // milliseconds to complete this km
    val pace: String                   // "min:ss/km" format
)
```

### LocationPoint (GPS Data)
```kotlin
data class LocationPoint(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double?,             // meters
    val speed: Double?,                // m/s
    val heartRate: Int?,               // bpm (if available from Garmin)
    val cadence: Int?,                 // spm
    val timestamp: Long?               // Unix timestamp
)
```

### WeatherData
```kotlin
data class WeatherData(
    val temperature: Double,           // Celsius
    val feelsLike: Double?,
    val humidity: Double,              // percentage (0-100)
    val windSpeed: Double,             // m/s
    val windDirection: Int?,           // degrees (0-360)
    val condition: String?,            // "Clear", "Cloudy", "Rain", etc
    val description: String,
    val uvIndex: Int?
)
```

### AiCoachingNote
```kotlin
data class AiCoachingNote(
    val time: Long,                    // Unix timestamp when coaching was given
    val message: String                // Coaching message text
)
```

---

## Tab Structure

### 1️⃣ AI Insights Tab
**Purpose:** Display AI-generated analysis of the run

**Content:**
- **Analysis State Management:**
  - `Idle` → No analysis generated; show "Generate Analysis" button
  - `Loading` → Show progress spinner
  - `Comprehensive` → Structured JSON analysis (see ComprehensiveRunAnalysis below)
  - `Freeform` → Markdown text (bespoke, unique analysis per run)
  - `Basic` → Fallback structured format
  - `Error` → Show error message with retry button

**ComprehensiveRunAnalysis Structure:**
```kotlin
data class ComprehensiveRunAnalysis(
    val summary: String,                                // Overall run summary
    val performanceScore: Int,                          // 0-100 overall score
    val highlights: List<String>,                       // Positive aspects
    val struggles: List<String>,                        // Challenges detected
    val personalBests: List<String>,                    // PRs achieved on this run
    val improvementTips: List<String>,                  // Actionable advice
    val trainingLoadAssessment: String,                 // How hard was this workout
    val recoveryAdvice: String,                         // Rest recommendations
    val nextRunSuggestion: String,                      // What to do next
    val wellnessImpact: String,                         // Holistic health impact
    val technicalAnalysis: TechnicalAnalysis,           // Pace/HR/cadence/dynamics
    val garminInsights: GarminInsights? = null          // Garmin-specific insights
)

data class TechnicalAnalysis(
    val paceAnalysis: String,
    val heartRateAnalysis: String,
    val cadenceAnalysis: String,
    val runningDynamics: String,
    val elevationPerformance: String
)

data class GarminInsights(
    val trainingEffect: String,        // Training stimulus score
    val vo2MaxTrend: String,           // VO2 max impact
    val recoveryTime: String           // Estimated recovery hours
)
```

**Freeform Analysis:** Markdown text written by the AI, completely unique per run.

**UI Elements:**
- Card showing analysis state
- "Generate AI Analysis" button (visible only in Idle state)
- Retry button on Error
- Full markdown rendering for Freeform
- Structured card layout for Comprehensive
- Dismiss/acknowledge button after reading

---

### 2️⃣ Summary Tab
**Purpose:** Key metrics + struggle points overview

**Content:**
- **Run Stats Card:**
  - Distance (km/miles)
  - Duration (HH:mm:ss)
  - Average pace (min/km)
  - Calories burned
  - Average heart rate + max HR
  - Average cadence

- **Difficulty Badge:**
  - Calculated from elevation gain per km
  - Levels: "Flat", "Rolling", "Hilly", "Steep", "Extreme"
  - Visual indicator (color/icon)

- **Pace Consistency Card:**
  - Shows how consistent pace was across the run
  - Visual bar chart of km-by-km pace
  - Variance percentage
  - "Even split", "Positive split", or "Negative split" verdict

- **Heart Rate Zones Visual Card:**
  - HR zone breakdown (Z1-Z5 or similar)
  - Pie chart or stacked bar showing time in each zone
  - Zone definitions (based on user's max HR)
  - **IMPORTANT:** This is where HR graphs should live in Summary Tab

- **Struggle Points Section:**
  - List of detected struggle points (pace drops >= 15%)
  - Each point shows:
    - Distance (km)
    - Pace drop (%)
    - Previous vs. current pace
    - Terrain grade (if available)
    - Heart rate (if available)
  - User can:
    - **Add comment** → Explain reason (traffic, fatigue, terrain, etc)
    - **Dismiss with reason** → Select from: Traffic Light, Bathroom Break, Photo Stop, Tied Shoe, Water Break, Road Crossing, Other
    - **Restore** → Undo dismissal
  - Comments are persisted immediately to backend
  - Dismissed points remain visible but marked as "not relevant for analysis"

- **Coaching Prompt Summary:**
  - If AI analysis exists, show key coaching message
  - Quick actionable advice highlight
  - Tap to expand full AI analysis

---

### 3️⃣ Graphs Tab
**Purpose:** Visual representation of run performance

**Content:**

#### A. Pace Graph (⚠️ ISSUE: Currently flat in Android)
- **X-axis:** Distance (km)
- **Y-axis:** Pace (min/km) or Speed (km/h)
- **Display:**
  - Line chart showing pace evolution throughout run
  - Each km split as a data point
  - Color coding: green (faster), blue (average), red (slower)
  - Interactive: tap to see exact pace at each km
- **Metrics overlay:**
  - Fastest km pace
  - Slowest km pace
  - Pace variance
- **Problem in Android:** Graph renders as flat line — need to verify:
  - km Split data is being populated
  - Y-axis scaling accounts for pace variation
  - Data points are correctly mapped

#### B. Heart Rate Graph
- **X-axis:** Distance (km) or Time
- **Y-axis:** Heart rate (bpm)
- **Display:**
  - Line chart with gradient fill
  - Zone background shading (Z1-Z5 colored regions)
  - Real-time HR points connected
- **Metrics overlay:**
  - Average HR
  - Max HR
  - Min HR (if available)
  - Time in each zone (Z1, Z2, Z3, Z4, Z5)
- **Axis Management (Android reference):**
  - Dynamic Y-axis scaling: `(minHR * 0.95)` to `(maxHR * 1.05)`
  - Grid lines at 20 bpm intervals
  - Zone background fills:
    - Z1 (50-60%): Light blue
    - Z2 (60-70%): Blue
    - Z3 (70-80%): Yellow
    - Z4 (80-90%): Orange
    - Z5 (90-100%): Red

#### C. Elevation Graph (⚠️ ISSUE: Not implemented in Android)
- **X-axis:** Distance (km) or Time
- **Y-axis:** Altitude (meters) or Elevation change
- **Display:**
  - Area chart with elevation profile
  - Uphill sections: green
  - Downhill sections: orange/brown
  - Flat sections: light gray
- **Metrics overlay:**
  - Total elevation gain (m/ft)
  - Total elevation loss (m/ft)
  - Max elevation
  - Min elevation
  - Average gradient (%)
  - Steepest incline (%)
  - Steepest decline (%)
- **Interactive:**
  - Hover/tap to see exact elevation at each point
  - Identify hill locations

#### D. Advanced Charts (Scrollable section in Graphs Tab)
**HeartRatePaceCorrelationChart:**
- Scatter plot: Pace vs. Heart Rate
- Shows efficiency (are you working harder for same pace?)
- Elite runners have flat HR/pace ratio
- Efficiency score overlay

**CadenceAnalysisChart:**
- Cadence gauge showing avg SPM vs. optimal (170-180)
- Visual feedback on cadence efficiency
- Insight text based on cadence level

**SplitAnalysisChart:**
- First half vs. second half comparison
- Type: NEGATIVE (strong finish), POSITIVE (faded), EVEN
- Verdict + recommendation text
- Color-coded by split type

**FatigueIndexChart:**
- Shows pace degradation over the run
- Calculated as slowdown percentage across km splits
- "How much did you slow down?" visualization
- Elite runners have flat fatigue index

**TrainingLoadCard:**
- Training load assessment (based on HR, pace, elevation)
- Zones: Low, Moderate, High, Very High
- Recommendation for next run

**VO2MaxEstimationCard:**
- Estimated VO2 max based on this run
- Comparison to user's historical VO2 max
- Trend indicator (improving/declining)
- Only shown if Garmin data available

**EffortHeatmapCard:**
- Color-coded map showing effort zones throughout run
- Red = highest effort, Green = low effort
- Identifies where in the run user pushed hardest

**WeatherProgressionChart:**
- Temperature and wind speed changes during run
- Impact on performance during each km
- "Weather got harder/easier" indicators

---

### 4️⃣ Data Tab
**Purpose:** Raw, unfiltered metrics for power users

**Content:**

**Session Information:**
- Run ID
- Start/end time (formatted)
- Duration (milliseconds)
- Route hash and name
- Is active flag

**Distance Metrics:**
- Total distance (m, km, miles)
- GPS points recorded
- Avg point distance

**Speed & Pace:**
- Average speed (m/s, km/h, mph)
- Max speed (all units)
- Average pace (min/km, min/mi)
- Speed distribution stats

**Physiological Metrics:**
- Average heart rate (bpm)
- Max/min heart rate (if available)
- HR reserve used (if calculable)
- Average cadence (spm)
- Max cadence (if available)
- Estimated step count

**Elevation Metrics:**
- Total ascent (m, ft)
- Total descent (m, ft)
- Net elevation change
- Average gradient (%)
- Max gradient (%)
- Terrain type
- Highest/lowest point elevation

**Energy Expenditure:**
- Calories burned
- Calories per km
- Calories per minute
- Energy rate (kcal/hr)

**Weather (Start & End):**
- Condition (Clear, Cloudy, Rain, etc)
- Temperature (°C, °F)
- Feels like temperature
- Humidity (%)
- Wind speed (m/s, km/h, mph)
- Wind direction (degrees and cardinal)
- UV index

**Split Details Table:**
- Column headers: Km | Time | Pace
- All km splits listed
- Last split highlighted
- Scrollable if many splits

**GPS Route Data:**
- Shows GPS route point count
- Option to expand and see first 50 points
- Columns: # | Latitude | Longitude | Altitude
- Monospace font for readability
- Shows "...and X more points" if truncated

---

### 5️⃣ Badges Tab (Achievements)
**Purpose:** Personal bests and milestone tracking

**Content:**

**Personal Best Badges:**
- Display all `RunAchievement` objects from run
- For each badge show:
  - **Icon:** Emoji or graphic (medal, crown, fire, etc)
  - **Title:** "New 5K Personal Best"
  - **Category:** Distance category ("5K", "10K", "Half Marathon", "Marathon")
  - **Previous Best Pace:** Previous best pace for this distance
  - **Improvement:** "3:45 min/km (5.2% faster)"
  - **Background color:** Category-specific color (from `backgroundColor` field)
  - **Animation:** Entrance animation when tab loads

**Milestone Card:**
- Shows cumulative statistics:
  - Total runs tracked
  - Total distance (km)
  - Total elevation gain (m)
  - Longest run
  - Best 5K time
  - Best 10K time
  - Streak (consecutive running days)

**No Achievements State:**
- If no achievements on this run, show friendly message
- Encourage next run for potential PB
- Show "Build more PRs!" visual

**Badge Popup/Modal (on tap):**
- Full achievement details
- Comparison to previous best
- Tips to maintain/improve this distance
- Share badge option

---

## UI Components & Charts

### Key Composables (from Android Codebase)

#### Main Screen Entry Point
```
RunSummaryScreenFlagship(
    navController: NavController,
    runId: String,
    viewModel: RunSummaryViewModel
)
```

#### Tab Content Composables
```
AiInsightsTab(
    analysisState: AiAnalysisState,
    isLoading: Boolean,
    onGenerateAnalysis: () -> Unit,
    onRetry: () -> Unit
)

SummaryTabFlagship(
    run: RunSession,
    strugglePoints: List<StrugglePoint>,
    onStrugglePointDismiss: (id: String, reason: DismissReason) -> Unit,
    onAddComment: (id: String, comment: String) -> Unit,
    onRestorePoint: (id: String) -> Unit
)

GraphsTabContent(
    run: RunSession,
    modifier: Modifier = Modifier
)

DataTabFlagship(
    run: RunSession,
    modifier: Modifier = Modifier
)

AchievementsTabFlagship(
    achievements: List<RunAchievement>,
    modifier: Modifier = Modifier
)
```

#### Card Components
```
PaceConsistencyCard(run: RunSession)
HeartRateZonesVisualCard(heartRateData: List<Int>?)
GarminEnrichCTACard(onClick: () -> Unit)
GarminPoweredByBadge()
PersonalBestsCardFlagship(achievements: List<RunAchievement>)
AchievementBadgeItem(achievement: RunAchievement)
AchievementBadgesStack(achievements: List<RunAchievement>)
```

#### Advanced Chart Components (from AdvancedRunCharts.kt)
```
HeartRatePaceCorrelationChart(routePoints: List<LocationPoint>)
CadenceAnalysisChart(routePoints: List<LocationPoint>, avgCadence: Int)
SplitAnalysisChart(kmSplits: List<KmSplit>)
FatigueIndexChart(kmSplits: List<KmSplit>)
TrainingLoadCard(run: RunSession)
VO2MaxEstimationCard(run: RunSession)
EffortHeatmapCard(routePoints: List<LocationPoint>)
WeatherProgressionChart(run: RunSession)
```

#### Chart Rendering Details

**Canvas-based Charts (Android uses Compose Canvas):**
- Pace vs. Distance (line chart with axes)
- Heart Rate vs. Distance (line chart with zone shading)
- Elevation Profile (area chart)
- HR vs. Pace scatter plot
- Split comparison bars

**Axis Management Pattern (from Android):**
```kotlin
// Dynamic scaling
val minValue = data.minOrNull() ?: 0
val maxValue = data.maxOrNull() ?: 1
val range = (maxValue - minValue).takeIf { it != 0f } ?: 1f

// Padding (space for axis labels)
val padding = 40f
val width = canvasWidth - (padding * 2)
val height = canvasHeight - (padding * 2)

// Scaling function
fun scaleX(x: Float) = padding + ((x - minX) / xRange) * width
fun scaleY(y: Float) = canvasHeight - padding - ((y - minY) / yRange) * height
```

---

## Garmin Integration

### Architecture
Garmin data enrichment is a **multi-step async process** with polling and notifications.

### Flow Diagram
```
User taps "Sync with Garmin" button
    ↓
Check: Is Garmin connected? (check device list)
    ├─ NO → Show "Connect Garmin" CTA → navigate to Garmin Connect screen
    └─ YES → Continue
    ↓
Call enrichRunWithGarminData(runId)
    ↓
Server response:
    ├─ 200 OK → Data arrived immediately
    │   └─ Update RunSession with Garmin data, dismiss modal
    ├─ 202 PENDING → Garmin sync in progress
    │   └─ Start polling loop (every 5s, max 30s)
    │       ├─ Success within 30s → Update run
    │       └─ Timeout after 30s → Show "We'll notify you" dialog
    └─ 401 UNAUTHORIZED → Token expired
        └─ Show "Reconnect Garmin" prompt
```

### ViewModel State (Kotlin)
```kotlin
// In RunSummaryViewModel:

private val _isGarminConnected = MutableStateFlow(false)
private val _isEnrichingWithGarmin = MutableStateFlow(false)
private val _isWaitingForGarminSync = MutableStateFlow(false)
private val _showGarminSyncPendingDialog = MutableStateFlow(false)
private val _garminEnrichmentError = MutableStateFlow<String?>(null)
private val _garminNeedsReconnect = MutableStateFlow(false)

// Polling implementation
fun enrichRunWithGarminData() {
    // 1. Attempt initial enrichment
    // 2. If 202, start 5-second polling loop
    // 3. Max poll time: 30 seconds
    // 4. On success: update _runSession, close modals
    // 5. On timeout: show "We'll notify you" dialog
    // 6. On 401: show reconnect prompt
}

fun dismissGarminSyncPendingDialog()
fun dismissGarminReconnect()
fun clearGarminEnrichmentError()
```

### UI Components (from RunSummaryScreen.kt)
```
GarminEnrichCTACard(
    onClick: () -> Unit  // Triggers enrichRunWithGarminData()
)

GarminPoweredByBadge()  // Shows "Powered by Garmin" when data enriched

GarminEnrichmentLoadingModal()  // "Syncing with Garmin..."

GarminWaitingForSyncModal()  // "Waiting for Garmin sync..."
    - Message: "Garmin data is syncing. We'll notify you when it's ready."
    - Background process: no action needed
    - Dismiss button

GarminReconnectPrompt()  // "Reconnect your Garmin device"
    - Navigate to Garmin auth flow
    - Button: "Reconnect Garmin"
```

### Garmin Data Fields Populated
Once Garmin enrichment succeeds, these fields in `RunSession` are updated:
- `heartRateData: List<Int>?` → Detailed HR time-series
- `hasGarminData: Boolean = true`
- `minHeartRate: Int?`
- `maxCadence: Int?`
- `totalSteps: Int?`
- `avgStrideLength: Float?`
- `estSweatLoss: Float?`
- Additional elevation refinement

### API Endpoints (Garmin)
- `GET /garmin/devices` → Get connected Garmin devices
- `POST /garmin/auth` → Initiate Garmin OAuth
- `POST /garmin/permissions` → Request fitness permissions
- `POST /runs/{runId}/enrich-garmin` → Enrich with Garmin data (returns 200 or 202)
- `POST /runs/{runId}/enrich-garmin-raw` → Raw enrich endpoint for polling

### Known Issues with Garmin Integration
1. **Inconsistencies in enriched data:** Garmin sometimes returns partial data
2. **Sync status unclear to user:** Notification system needs improvement
3. **Polling timeout:** 30s may be too short for slow syncs
4. **Error messages:** Generic error states need more context

---

## Share Image System

### Architecture
Two-step process: **Editor → Preview → Download/Share**

### Flow
```
User taps "Share Run" button
    ↓
Navigate to ShareImageEditorScreen
    ├─ Load available templates (API call)
    ├─ Show template grid
    ├─ User selects template
    ├─ Editor opens:
    │   ├─ Template preview (center)
    │   ├─ Customization options (right panel):
    │   │   ├─ Aspect ratio picker (1:1, 4:5, 16:9)
    │   │   ├─ Background image selector
    │   │   ├─ Sticker widgets (drag/drop)
    │   │   ├─ Custom sticker upload
    │   │   ├─ Blur/opacity controls
    │   └─ Live preview updates
    ├─ User taps "Generate Preview"
    │   └─ API call: generateShareImage() → base64 PNG
    ├─ Show generated image
    ├─ Options:
    │   ├─ Download image
    │   ├─ Share via intent (native share sheet)
    │   └─ Back to editor
    └─ Share completes with "Shared!" confirmation
```

### Data Models (from ShareModels.kt)
```kotlin
data class ShareTemplate(
    val id: String,
    val name: String,
    val description: String,
    val category: String,              // "motivational", "stats", "achievement", etc
    val aspectRatios: List<String>     // ["1:1", "4:5", "16:9", "9:16"]
)

data class StickerWidget(
    val id: String,
    val type: String,                  // "distance", "pace", "duration", "calories", etc
    val category: String,              // "metrics", "badges", "decorative"
    val label: String,                 // Display name
    val icon: String                   // Icon emoji or SVG
)

data class ShareImageRequest(
    val runId: String,
    val templateId: String,
    val aspectRatio: String = "1:1",
    val stickers: List<PlacedSticker> = emptyList(),
    val customBackground: String? = null,      // base64 image
    val backgroundOpacity: Float? = null,      // 0.0-1.0
    val backgroundBlur: Int? = null,           // 0-100 blur radius
    val customStickers: List<CustomSticker>? = null
)

data class PlacedSticker(
    val widgetId: String,              // References StickerWidget
    val x: Float,                      // Normalized coordinates (0.0-1.0)
    val y: Float,
    val scale: Float = 1.0f
)

data class CustomSticker(
    val imageBase64: String,
    val x: Float,
    val y: Float,
    val scale: Float = 1.0f,
    val rotation: Float = 0f,          // degrees
    val opacity: Float = 1.0f          // 0.0-1.0
)

data class SharePreviewResponse(
    val image: String                  // "data:image/png;base64,..." full PNG
)

data class ShareLinkResponse(
    val shareToken: String,
    val shareUrl: String,              // Public URL to view run summary
    val deepLink: String               // Deep link for app
)
```

### ViewModel (ShareImageViewModel)
```kotlin
class ShareImageViewModel {
    val templates: StateFlow<List<ShareTemplate>>
    val selectedTemplate: StateFlow<ShareTemplate?>
    val previewImage: StateFlow<String?>  // base64 PNG data
    val isGeneratingPreview: StateFlow<Boolean>
    val aspectRatio: StateFlow<String>
    val error: StateFlow<String?>
    
    suspend fun loadTemplates(runId: String)
    suspend fun generateSharePreview(request: ShareImageRequest)
    fun downloadImage(context: Context, imageBase64: String)
    fun shareImage(context: Context, imageBase64: String)
}
```

### API Endpoints
- `GET /share/templates` → Get available templates and stickers
- `POST /share/preview` → Generate preview image (request: ShareImageRequest, response: SharePreviewResponse)
- `POST /share/generate` → Generate final share image (returns PNG URL)
- `POST /share/link` → Create shareable public link (returns ShareLinkResponse)

### Known Issues with Share System
1. **"Create share image button doesn't do anything"** 
   - Need to verify button tap handler is wired correctly
   - Check if API endpoint is reachable
   - Add error logging/UI feedback

2. **Image generation slow:**
   - Consider backend caching
   - May need timeout handling

3. **Limited template variety:**
   - Backend should provide more templates
   - Consider user-uploaded custom templates

---

## Known Issues & TODOs

### Critical Issues (Need fixing for iOS)

#### 1. Pace Graph Rendering (Flat Line) ⚠️
**Problem:** Pace graph in Android renders as flat line despite valid data
**Root causes (suspected):**
- KmSplit data not properly populated from API
- Y-axis scaling not accounting for pace variation
- Data points not correctly mapped to canvas coordinates
- Pace values all identical or malformed

**iOS Implementation Tips:**
- Verify `kmSplits` array is populated: `run.kmSplits.count > 0`
- Check pace values are parseable (format: "5:42/km")
- Implement dynamic Y-axis: `minPace...maxPace` with padding
- Test with mock data first: ensure graph scales properly
- Use SwiftUI Charts or custom Canvas rendering
- Add debug logging: log min/max pace, data points count

---

#### 2. Elevation Graph Missing ❌
**Problem:** No elevation profile graph exists in Android Graphs tab
**Required for iOS:**
- X-axis: Distance (km)
- Y-axis: Altitude (meters/feet)
- Area chart with uphill/downhill coloring
- Display elevation gain/loss metrics
- Show gradient percentage at hover points

**Data source:**
```
run.routePoints: List<LocationPoint>
  - Each point has: latitude, longitude, altitude (meters)

run.totalElevationGain: Double     // Total meters climbed
run.totalElevationLoss: Double     // Total meters descended
run.maxElevation: Double?          // Highest point
run.minElevation: Double?          // Lowest point
run.maxGradient: Float             // Steepest slope (%)
run.steepestIncline: Float?        // Max uphill (%)
run.steepestDecline: Float?        // Max downhill (%)
```

---

#### 3. Inconsistencies in Garmin Data ⚠️
**Problem:** Garmin enrichment sometimes returns partial/inconsistent data
**Symptoms:**
- Heart rate data may be missing
- Elevation refinement incomplete
- Cadence/stride length sometimes null
- No error message to user

**iOS Handling:**
- Check all Garmin fields for null before using
- Show "Partial Garmin data" warning if key fields missing
- Implement retry logic (user can tap "Re-sync" button)
- Log API responses for debugging

---

#### 4. Sync Garmin Timeout UX ⚠️
**Problem:** 30-second polling timeout may be too short or unclear
**Current behavior:**
- Poll every 5 seconds
- Max 30 seconds total
- After 30s: show "We'll notify you" dialog
- Background process continues
- Push notification sent when data arrives

**iOS Improvement:**
- Make polling duration configurable
- Show countdown timer in "Waiting..." modal
- Add "Still waiting? We'll notify you" hint after 20s
- Better notification system (badge count, vibration)

---

#### 5. Share Image Button Non-functional ❌
**Problem:** Share image functionality partially implemented in Android
**Issue:**
- Button exists but doesn't navigate to editor
- ShareImageViewModel exists but not fully integrated
- Missing: tap handler wiring, error states, completion flow

**iOS Implementation:**
- Route to ShareImageEditorScreen when tapped
- Load templates from backend
- Show editor with live preview
- Implement download/share intent
- Add success confirmation

---

#### 6. Personal Best Badges Inconsistent ⚠️
**Problem:** Achievements may not populate correctly
**Issues:**
- Detection logic may miss some PBs
- Category matching inconsistent
- Display may be cut off on some devices
- Animation performance issues

**iOS Checklist:**
- Verify `run.achievements` array populated
- Check all badge fields: title, icon, category, color
- Test on various iPhone sizes (SE to Max)
- Implement smooth entrance animation
- Handle long titles gracefully

---

### Minor TODOs

#### 1. Heart Rate Graph
- [ ] Add zone background shading (Z1-Z5 colored bands)
- [ ] Implement interactive legend
- [ ] Show time-in-zone breakdown
- [ ] Add min/max/avg overlays
- [ ] Handle missing HR data gracefully

#### 2. Coaching Prompt Summary
- [ ] Extract key coaching point from AI analysis
- [ ] Show prominent summary in Summary tab
- [ ] Highlight most actionable insight
- [ ] Tap to expand full analysis

#### 3. Struggle Points UX
- [ ] Smooth dismiss/restore animations
- [ ] Better dismiss reason picker (visual icons)
- [ ] Comment rich text editing
- [ ] Drag to delete struggle points
- [ ] Batch operations (dismiss all, restore all)

#### 4. Advanced Charts
- [ ] VO2Max estimation (Garmin only)
- [ ] Effort heatmap (requires route points with HR)
- [ ] Weather progression (requires weather at start/end)
- [ ] Performance clustering (compare similar routes)

#### 5. Data Tab
- [ ] Sortable columns
- [ ] Export to CSV
- [ ] Copy single value to clipboard
- [ ] Search/filter metrics

---

## API Endpoints

### Run Summary Endpoints
```
GET /api/runs/{runId}
Response: RunSession (full object with all nested data)

POST /api/runs/{runId}/progress
Body: UpdateRunProgressRequest
  - userComments: String?
  - strugglePoints: List<StrugglePoint>
Response: { success: boolean }

DELETE /api/runs/{runId}
Response: { success: boolean }
```

### AI Analysis Endpoints
```
POST /api/runs/{runId}/analysis/comprehensive
Response: ComprehensiveAnalysisResponse
  - analysis: ComprehensiveRunAnalysis

POST /api/runs/{runId}/analysis/freeform
Body: FreeformAnalysisRequest (all run context)
Response: FreeformAnalysisResponse
  - analysis: String (markdown)
  - title: String?

GET /api/runs/{runId}/analysis
Response: RunAnalysisRecord
  - analysis: JsonElement (stored analysis)

POST /api/runs/{runId}/analysis/save
Body: SaveRunAnalysisRequest
  - analysis: JsonElement
Response: { success: boolean }
```

### Struggle Points Endpoints
```
POST /api/runs/{runId}/struggle-points/{pointId}/comment
Body: { userComment: String }
Response: { success: boolean }

POST /api/runs/{runId}/struggle-points/{pointId}/dismiss
Body: { dismissReason: String }
Response: { success: boolean }

POST /api/runs/{runId}/struggle-points/{pointId}/restore
Response: { success: boolean }
```

### Garmin Integration Endpoints
```
GET /api/garmin/devices
Response: List<ConnectedDevice>
  - deviceType: "garmin"
  - isActive: boolean

POST /api/runs/{runId}/enrich-garmin
Response: RunSession (enriched) OR
Status 202 Accepted (polling required)

GET /api/runs/{runId}/enrich-garmin/status?token=...
Response: { status: "pending" | "complete", data?: RunSession }

POST /api/garmin/auth
Body: { code: String }
Response: GarminAuthResponse

GET /api/garmin/permissions
Response: GarminPermissionsResponse
```

### Share Image Endpoints
```
GET /api/share/templates
Response: ShareTemplatesResponse
  - templates: List<ShareTemplate>
  - stickers: List<StickerWidget>

POST /api/share/preview
Body: ShareImageRequest
Response: SharePreviewResponse
  - image: String (base64 PNG)

POST /api/share/link
Body: { runId: String }
Response: ShareLinkResponse
  - shareToken: String
  - shareUrl: String
  - deepLink: String

GET /api/share/{token}
Response: SharedRunResponse (public view)
```

### Workout Completion Endpoint
```
POST /api/workouts/{workoutId}/complete
Body: CompleteWorkoutRequest
  - runId: String
Response: { success: boolean }

(Called automatically when run is saved if linkedWorkoutId exists)
```

---

## Summary for iOS Dev

### File Organization (How Android is structured)
```
AndroidStudioProjects/AiRunCoach/app/src/main/java/live/airuncoach/airuncoach/

├── ui/
│   ├── screens/
│   │   ├── RunSummaryScreen.kt      (MAIN - 777 lines, all tabs + modals)
│   │   ├── ShareImageEditorScreen.kt (Share image UI)
│   │   └── GarminConnectScreen.kt   (Garmin auth flow)
│   │
│   ├── components/
│   │   ├── AdvancedRunCharts.kt     (6+ advanced chart components)
│   │   ├── RawDataViews.kt          (Raw data tab display)
│   │   ├── AchievementBadge.kt      (Badge rendering)
│   │   └── [other shared components]
│   │
│   └── theme/
│       ├── Colors.kt, Spacing.kt, AppTextStyles.kt
│
├── viewmodel/
│   ├── RunSummaryViewModel.kt       (State management, API calls, Garmin polling)
│   └── ShareImageViewModel.kt
│
├── domain/model/
│   ├── RunSession.kt                (Core data class)
│   ├── StrugglePoint.kt
│   ├── RunAchievement.kt
│   ├── AiCoachingNote.kt
│   ├── LocationPoint.kt
│   └── WeatherData.kt
│
├── network/
│   ├── ApiService.kt                (Retrofit interface, all endpoints)
│   └── model/
│       ├── RunInsightsModels.kt    (Analysis data classes)
│       ├── ShareModels.kt
│       ├── GarminUploadRequest.kt
│       └── [40+ model files]
│
└── analytics/
    └── [Analysis helper functions: calculateFatigueIndex, analyzeSplits, etc]
```

### Key Implementation Patterns (for iOS)
1. **State Management:** Use `@State`, `@StateObject`, or Redux-like pattern
2. **API Calls:** Async/await in Swift (URLSession or Alamofire)
3. **Data Persistence:** Core Data or UserDefaults for cached runs
4. **Charts:** SwiftUI Charts or custom Canvas
5. **Navigation:** NavigationStack (iOS 16+) or NavigationView
6. **Image Rendering:** Core Graphics or custom rendering
7. **Animations:** Spring animations for badges, transitions for tabs

### Testing Checklist for iOS
- [ ] Load run from API (test with 5K, 10K, half marathon, marathon)
- [ ] Display all tabs without crashes
- [ ] Pace graph renders correctly (no flat lines)
- [ ] Elevation graph displays altitudes
- [ ] Heart rate zones render with proper colors
- [ ] Struggle points detect and display correctly
- [ ] Can add/dismiss/restore struggle points
- [ ] AI analysis generates and displays (all three formats)
- [ ] Garmin sync flow: connect, enrich, polling, timeout
- [ ] Share image: select template, customize, generate, download
- [ ] Personal best badges display with animations
- [ ] Raw data tab scrolls smoothly with all metrics
- [ ] Responsive layout on iPhone SE, 13, 14 Max
- [ ] Dark mode support
- [ ] Network error handling and retry

---

**Document Complete** ✅  
This spec covers all implemented features, data models, UI components, and known issues from the Android codebase. Use this as the reference for complete iOS parity.
