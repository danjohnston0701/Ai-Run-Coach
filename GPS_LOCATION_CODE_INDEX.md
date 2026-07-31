# GPS Location Tracking - Code Location Index

## Android Implementation

### GPS Tracking Service
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`

#### GPS Configuration
- **Lines 529-530**: GPS update interval constants
  - `LOCATION_UPDATE_INTERVAL = 1000L` (1 second)
  - `LOCATION_FASTEST_INTERVAL = 500L` (accept as fast as)

#### Location Request Setup
- **Lines 2672-2686**: `requestLocationUpdates()` function
  - Creates LocationRequest with HIGH_ACCURACY priority
  - Sets minimum update interval to 500ms
  - Registers callback with FusedLocationProviderClient

#### Location Callback Setup
- **Lines 1223-1226**: `setupLocationCallback()` function
  - Creates LocationCallback object
  - Routes location results to `onNewLocation()` method

#### Location Data Processing
- **Lines 2720-2769**: `onNewLocation(location: Location)` function
  - Arbitrates between phone and watch GPS sources
  - Calculates elevation grade from altitude change
  - Creates LocationPoint with 9+ data fields
  - Processes elevation, pace, coaching triggers

#### GPS Source Arbitration
- **Lines 2728-2731**: Watch GPS priority window (15 seconds)
  - If Garmin GPS active, skip phone GPS updates
  - Prevents double-counting distance

#### Elevation Processing
- **Lines 577-645**: Elevation noise filtering constants
  - Phone GPS: 60-second window, 1.5m threshold
  - Garmin GPS: 20-second window, 0.5m threshold
  - Grade thresholds: 3% minimum uphill/downhill

#### Watch Metrics Integration
- **Lines 82-99**: Garmin watch manager variables
  - `garminWatchManager`: Watch bridge
  - `lastWatchGpsMs`: Timestamp of last watch GPS
  - `hasGarminData`, `garminDeviceName`: Status tracking

#### Accuracy Tracking
- **Lines 277-283**: GPS accuracy variables
  - `watchGpsAccuracySum`, `watchGpsAccuracyCount`
  - `watchGpsAccuracyWorst`: Worst (highest) CEP seen
  - `watchMinPace`, `watchMaxPace`: Pace extremes

#### GPS Lock Confidence
- **Lines 172-174**: `watchGpsUpdateCount`
  - First 8 seconds: Show "–" (lock unstable)
  - After 8 seconds: Display pace (signal settled)

---

### Power Management

#### Wake Lock Acquisition
- **Lines 1218-1221**: `acquireWakeLock()` function
  - Type: PARTIAL_WAKE_LOCK
  - Timeout: 10 hours maximum
  - Called at line 859 during `startTracking()`

#### Wake Lock Release
- **Line 4125**: `releaseWakeLock()` function
  - Release triggers: line 3705 (run end), line 4129 (service destroy)

#### Foreground Service Startup
- **Lines 1268-1274**: `startTracking()` foreground service setup
  - Calls `startForeground(NOTIFICATION_ID, notification)` immediately
  - Must complete within 5 seconds to avoid ANR
  - Creates notification via `createNotification()`

#### Watch-Initiated Run (Standby Mode)
- **Lines 1230-1258**: `prepareForWatch()` function
  - Start service in foreground while app is open
  - Shows "Watch Ready" notification
  - Waits for watch START command
  - Workaround for Android 12+ background service restrictions

#### Sensor Tracking
- **Lines 2688-2718**: `startSensorTracking()` function
  - Step counter: ACTIVITY_RECOGNITION permission (Android 10+)
  - Heart rate: BODY_SENSORS permission (Android 6+)
  - Update rate: SENSOR_DELAY_NORMAL (~200ms)
  - Graceful degradation if permission denied

#### Service Shutdown
- **Line 3706**: `stopForeground(STOP_FOREGROUND_REMOVE)`

---

### Coaching Integration

#### Coaching Cooldown Periods
- **Lines 124-140**: Global coaching coordinator
  - `GLOBAL_COACHING_MIN_GAP_MS = 15_000L` (15 seconds)
  - `GLOBAL_COACHING_MIN_GAP_M = 150.0` (150 meters)
  - `NAV_COACHING_MIN_GAP_MS = 8_000L` (navigation specific)
  - `KM_SPLIT_EXCLUSION_ZONE_M = 200.0` (exclusion buffer)

#### Data Aggregation
- **Lines 163-190**: Distance/time tracking
- **Lines 188-192**: Heart rate aggregation
- **Lines 231-235**: Cadence aggregation
- **Lines 262-276**: Watch time-series data

---

### Location Permission Handling

**File**: `./app/src/main/java/live/airuncoach/airuncoach/ui/screens/LocationPermissionScreen.kt`

#### Permission Checking
- **Lines 39-48**: `checkPermission()` function
  - Checks ACCESS_FINE_LOCATION OR ACCESS_COARSE_LOCATION
  - Returns boolean (either is sufficient)

- **Lines 50-59**: `checkActivityRecognitionPermission()` function
  - Android 10+: Check ACTIVITY_RECOGNITION
  - Pre-Android 10: Returns true (not required)

#### Permission Request Dialog
- **Lines 234-243**: Multi-permission launcher
  - ACCESS_FINE_LOCATION
  - ACCESS_COARSE_LOCATION
  - BODY_SENSORS
  - ACTIVITY_RECOGNITION (Android 10+ only)

#### Permission Result Handling
- **Lines 77-92**: `locationPermissionLauncher` result callback
  - Fine OR Coarse: Sets `hasLocationPermission = true`
  - Both core permissions + activity recognition: Auto-proceed
  - Some denied: Show "Continue to App" button

#### User Explanations
- **Lines 129-133**: Main description text
- **Lines 144-169**: Features list (GPS tracking, distance, elevation, background, HR/cadence)
- **Lines 186-189**: Privacy assurance

#### Permission Auto-Navigation
- **Lines 95-102**: `LaunchedEffect` auto-navigate if already granted
- **Lines 96-101**: `checkPermission() && checkActivityRecognitionPermission()` → proceed

---

## Android Manifest

**File**: `./app/src/main/AndroidManifest.xml`

### Permission Declarations
- **Lines 9-11**: Location permissions
  - `android.permission.ACCESS_FINE_LOCATION`
  - `android.permission.ACCESS_COARSE_LOCATION`

- **Line 14**: Background location (Android 10+)
  - `android.permission.ACCESS_BACKGROUND_LOCATION`

- **Line 17**: Activity recognition (Android 10+)
  - `android.permission.ACTIVITY_RECOGNITION`

- **Line 20**: Body sensors
  - `android.permission.BODY_SENSORS`

- **Lines 26-27**: Foreground service (Android 12+)
  - `android.permission.FOREGROUND_SERVICE`
  - `android.permission.FOREGROUND_SERVICE_LOCATION`

- **Line 30**: Wake lock
  - `android.permission.WAKE_LOCK`

- **Line 33**: Post notifications (Android 13+)
  - `android.permission.POST_NOTIFICATIONS`

### Service Declaration
- **Lines 144-148**: RunTrackingService
  - `android:name=".service.RunTrackingService"`
  - `android:exported="false"`
  - `android:foregroundServiceType="location"`

---

## Backend Implementation

### Database Schema

**File**: `./shared/schema.ts`

#### GPS Sample Data
- **Lines 391-395**: Per-location GPS fields
  ```typescript
  latitude: real("latitude")
  longitude: real("longitude")
  altitude: real("altitude")
  bearing: real("bearing")
  gpsAccuracy: real("gps_accuracy")
  ```

- **Lines 397-400**: Pace and speed
  ```typescript
  pace: real("pace")
  speed: real("speed")
  distanceSoFar: real("distance_so_far")
  ```

- **Lines 410-421**: Running dynamics and power
  ```typescript
  groundContactTime: real("ground_contact_time")
  groundContactBalance: real("ground_contact_balance")
  verticalOscillation: real("vertical_oscillation")
  verticalRatio: real("vertical_ratio")
  runningPower: integer("running_power")
  respirationRate: real("respiration_rate")
  ```

#### Run-Level Location
- **Lines 825-826**: Start location
  ```typescript
  startLatitude: real("start_latitude")
  startLongitude: real("start_longitude")
  ```

#### Segment Location
- **Lines 1138-1139**: Segment coordinates
  ```typescript
  latitude: real("latitude")
  longitude: real("longitude")
  ```

### Server Routes

**File**: `./server/routes.ts`

#### Polyline Processing
- **Line 21**: `import polylineCodec from "@mapbox/polyline"`
  - Encodes/decodes GPS track to polyline format for efficient storage

#### Route Generation
- **Lines 95-103**: Intelligent route generation
  - `generateIntelligentRoute()`
  - `snapTrackToOSMSegments()`
  - `analyzeRouteCharacteristics()`

---

## iOS Implementation

**File**: `./ios/StravaViews.swift`

#### Location Data Sharing
- **Lines 42-46**: Features shared with Strava
  ```swift
  FeatureRow(emoji: "📍", title: "GPS Track Mapping")
  FeatureRow(emoji: "❤️", title: "Heart Rate Data")
  FeatureRow(emoji: "🏃", title: "Cadence Metrics")
  FeatureRow(emoji: "⛰️", title: "Elevation Data")
  ```

#### Strava Integration
- **Lines 5-75**: StravaSettingsView
- **Lines 79-145**: StravaConnectionCard
- **Lines 327-395**: StravaActivitiesView

**Note**: Full CLLocationManager implementation details not found in provided files. Would typically include:
- `CLLocationManager` initialization
- `CLLocationManagerDelegate` methods
- `startUpdatingLocation()` calls
- `NSLocationWhenInUseUsageDescription` in Info.plist
- `NSLocationAlwaysAndWhenInUseUsageDescription` in Info.plist

---

## Data Flow Summary

### Run Start → GPS Collection
1. User taps "Start Run" (or watch sends START)
2. `startTracking()` called
3. `startForeground()` shows notification
4. `acquireWakeLock()` keeps CPU awake
5. `requestLocationUpdates()` subscribes to GPS
6. `startSensorTracking()` registers sensors

### GPS Update → Processing → Upload
1. `LocationCallback.onLocationResult()` receives update
2. `onNewLocation(location)` processes it
3. GPS arbitration (watch vs phone)
4. Grade calculation from elevation
5. LocationPoint created with all fields
6. Added to route, elevation processed
7. Coaching triggers checked
8. Every 5 seconds: `LIVE_SESSION_SYNC_INTERVAL_MS` uploads to server

### Run End → Cleanup
1. User stops run
2. Final data aggregation (totals, averages, max values)
3. Data uploaded to server
4. `stopForeground(STOP_FOREGROUND_REMOVE)` clears notification
5. `releaseWakeLock()` allows CPU sleep
6. Service destroyed

---

## Constants Reference

| Constant | Value | Purpose | File |
|----------|-------|---------|------|
| `LOCATION_UPDATE_INTERVAL` | 1000L ms | Normal GPS update interval | RunTrackingService.kt:529 |
| `LOCATION_FASTEST_INTERVAL` | 500L ms | Fastest accepted GPS rate | RunTrackingService.kt:530 |
| `PHONE_ELEV_WINDOW` | 60 | Phone altitude samples to average | RunTrackingService.kt:595 |
| `PHONE_ELEV_COMMIT_THRESHOLD` | 1.5 m | Min elevation change to count (phone) | RunTrackingService.kt:596 |
| `GARMIN_ELEV_WINDOW` | 10 | Garmin altitude samples to average | RunTrackingService.kt:605 |
| `GARMIN_ELEV_COMMIT_THRESHOLD` | 0.5 m | Min elevation change to count (Garmin) | RunTrackingService.kt:606 |
| `UPHILL_GRADE_THRESHOLD` | 3.0 % | Min grade for uphill detection | RunTrackingService.kt:620 |
| `GLOBAL_COACHING_MIN_GAP_MS` | 15000 ms | Min time between coaching cues | RunTrackingService.kt:136 |
| `GLOBAL_COACHING_MIN_GAP_M` | 150.0 m | Min distance between coaching cues | RunTrackingService.kt:137 |
| `NAV_WAYPOINT_REACHED_RADIUS_M` | 45.0 m | Distance to consider waypoint reached | RunTrackingService.kt:512 |
| `NAV_WARNING_RADIUS_M` | 100.0 m | Distance to announce upcoming turn | RunTrackingService.kt:513 |
| `LIVE_SESSION_SYNC_INTERVAL_MS` | 5000 ms | How often to upload to live session | RunTrackingService.kt:649 |

---

**Generated**: 2026-07-29
**Last Updated**: Comprehensive code index completed

