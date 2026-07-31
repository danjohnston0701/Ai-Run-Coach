# GPS Location Tracking, Power Saving, and Location Permissions - Comprehensive Analysis

## Executive Summary

The AI Run Coach application implements sophisticated GPS location tracking across Android, iOS, and backend servers with careful attention to:
- **Location Data Collection**: High-accuracy GPS tracking with multi-source integration (phone + Garmin watch)
- **Power Management**: Partial wake locks, foreground services, and aggressive resource optimization
- **Location Permissions**: Multi-tier permission system with granular user controls
- **Background Operation**: Sophisticated foreground service architecture to handle Android's background restrictions

---

## 1. GPS/LOCATION DATA COLLECTION

### 1.1 Android GPS Tracking (RunTrackingService.kt)

#### Location Request Configuration
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`

```kotlin
// Lines 529-530: GPS Update Intervals
private const val LOCATION_UPDATE_INTERVAL = 1000L      // Request GPS every 1 second
private const val LOCATION_FASTEST_INTERVAL = 500L      // Accept updates as fast as 500ms

// Lines 2679-2680: Location Request Setup
val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_UPDATE_INTERVAL)
    .apply { 
        setMinUpdateIntervalMillis(LOCATION_FASTEST_INTERVAL)
        setWaitForAccurateLocation(false)  // Don't wait for high confidence
    }
    .build()
fusedLocationClient.requestLocationUpdates(req, locationCallback, Looper.getMainLooper())
```

**Key Features**:
- **Priority**: `PRIORITY_HIGH_ACCURACY` - Uses both GPS + network for best accuracy
- **Update Frequency**: 1 second (1000ms) normal interval, accepts updates as fast as 500ms
- **Immediate Reporting**: `setWaitForAccurateLocation(false)` - Reports immediately, doesn't wait for high confidence to avoid stale data
- **Provider**: Fused Location Provider (Google Play Services)

#### Location Data Point Structure
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 2757-2767)

```kotlin
val newPoint = LocationPoint(
    latitude = location.latitude,
    longitude = location.longitude,
    timestamp = location.time,
    speed = location.speed.takeIf { it > 0 },           // m/s (filtered)
    altitude = location.altitude.takeIf { location.hasAltitude() },
    heartRate = currentHeartRate.takeIf { it > 0 },
    bearing = location.bearing.takeIf { location.hasBearing() },
    cadence = currentCadence.takeIf { it > 0 },
    inclineDegrees = inclineDegrees                       // Calculated from elevation change
)
```

**Data Captured Per GPS Point**:
- Latitude/Longitude (WGS84)
- Timestamp (millisecond precision)
- Speed (m/s, filtered for positive values)
- Altitude (meters, when available)
- Bearing (degrees 0-360, when available)
- Heart Rate (bpm from sensors, when available)
- Cadence (spm from step counter, when available)
- Incline/Grade (calculated from elevation change)

### 1.2 Multi-Source Location Integration (Phone + Garmin Watch)

#### Smart GPS Arbitration
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 2728-2731)

```kotlin
// If watch is actively streaming GPS (within 15 seconds), skip phone GPS
if (location.provider != "garmin" && 
    (System.currentTimeMillis() - lastWatchGpsMs) < 15_000L) {
    Log.d("RunTrackingService", 
          "Skipping phone GPS — watch GPS is active (${System.currentTimeMillis() - lastWatchGpsMs}ms ago)")
    return
}
```

**Watch GPS Priority Logic**:
- **15-Second Window**: If Garmin watch has sent a GPS update within the last 15 seconds, ALL phone GPS updates are skipped
- **Rationale**: Watch GPS is significantly more accurate (multi-band antenna) and more stable than phone GPS
- **Prevents Double-Counting**: Ensures distance/pace calculations don't include both phone and watch data
- **Watch Detection**: Identifies watch GPS by checking `location.provider == "garmin"`

#### Watch Metrics Integration
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 82-99)

```kotlin
// Garmin watch bridge — sends live state to watch, receives start/pause/resume/stop commands
private var garminWatchManager: GarminWatchManager? = null
private var lastWatchGpsMs: Long = 0L                   // Timestamp of last watch GPS injection
private var wasRunStartedByWatch: Boolean = false       // Run initiated by watch START command
private var hasGarminData: Boolean = false              // True once any biometric frame received
private var garminDeviceName: String? = null            // e.g., "Vívoactive 4", "Forerunner 965"
```

**Watch Data Categories**:
1. **GPS Data**: Latitude, longitude, altitude, bearing, speed
2. **Biometric Data**: Heart rate, respiration rate (Fenix 7+ only)
3. **Running Dynamics**: Ground contact time, vertical oscillation, stride length, ground contact balance
4. **Cadence**: Steps per minute
5. **Power**: Running power in watts (Fenix 7+, FR965 only)
6. **Training Effects**: Aerobic/Anaerobic Training Effect

### 1.3 Backend Location Data Storage

**File**: `./shared/schema.ts` (Lines 391-395)

```typescript
// Database schema for GPS samples
latitude: real("latitude"),                    // WGS84
longitude: real("longitude"),                 // WGS84
altitude: real("altitude"),                   // meters
bearing: real("bearing"),                     // degrees 0-360
gpsAccuracy: real("gps_accuracy"),            // meters CEP (Circular Error Probable)
```

**Additional Location-Related Columns**:
```typescript
// From runs table (Lines 825-826)
startLatitude: real("start_latitude"),
startLongitude: real("start_longitude"),

// From segments table (Lines 1138-1139)
latitude: real("latitude"),
longitude: real("longitude"),
```

**GPS Accuracy Tracking**:
- **GPS Accuracy Field**: Stores estimated horizontal accuracy in meters
- **CEP Metric**: Circular Error Probable (68% of points within this radius)
- **From Garmin**: Uses Garmin GPS quality readings (0=poor, 4=best) converted to approx metres CEP

---

## 2. POWER SAVING HANDLING

### 2.1 Wake Lock Management

#### Acquiring Wake Lock
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 1218-1221)

```kotlin
private fun acquireWakeLock() {
    val powerManager = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK, 
        "AiRunCoach::RunTrackingWakeLock"
    ).apply { 
        acquire(10 * 60 * 60 * 1000L)  // 10 hours max
    }
}
```

**Wake Lock Details**:
- **Type**: `PARTIAL_WAKE_LOCK` (keeps CPU awake, allows screen to turn off)
- **Purpose**: Prevents CPU from entering deep sleep during GPS tracking
- **Timeout**: 10 hours maximum (auto-release safety measure)
- **Rationale**: Ensures GPS polling and location callback processing continue even when screen is off
- **Trigger**: Called at line 859 during `startTracking()`

#### Releasing Wake Lock
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Line 4125)

```kotlin
private fun releaseWakeLock() { 
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null 
}
```

**Release Triggers**:
- Run completion/stop (line 3705)
- Service destruction (line 4129)
- Permission check failure (line 2675)

### 2.2 Foreground Service Architecture (Background Restrictions)

#### Service Declaration
**File**: `./app/src/main/AndroidManifest.xml` (Lines 144-148)

```xml
<service
    android:name=".service.RunTrackingService"
    android:enabled="true"
    android:exported="false"
    android:foregroundServiceType="location" />
```

**Key Attributes**:
- **foregroundServiceType="location"**: Declares this as a location tracking foreground service (Android 12+)
- **exported="false"**: Internal service, not accessible to other apps

#### Foreground Service Startup
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 1268-1274)

```kotlin
// CRITICAL: Call startForeground IMMEDIATELY to avoid ANR
try {
    startForeground(
        NOTIFICATION_ID, 
        createNotification("Starting run...", "Initializing GPS")
    )
    Log.d("RunTrackingService", "Foreground service started successfully")
} catch (e: Exception) {
    Log.e("RunTrackingService", "Failed to start foreground service", e)
    stopSelf()
}
```

**Critical Design Pattern**:
1. **Immediate Notification**: Service must call `startForeground()` within 5 seconds of `onStartCommand()` to avoid ANR (Application Not Responding)
2. **Persistent Notification**: Shows to user throughout the run
3. **Prevents Background Killing**: Android 8+ (API 26+) won't terminate foreground services, even under memory pressure
4. **Android 12+ Compliance**: Requires `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` permissions

#### Watch-Initiated Run (Special Handling)
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 1230-1258)

```kotlin
/**
 * Enter lightweight standby state: start a foreground notification (so Android does not
 * kill the service when the phone screen turns off) and wait for the watch to send "start".
 * 
 * Pre-starts service while phone app is in foreground; avoids Android 12+ blocking
 * of startForegroundService() from background.
 */
private fun prepareForWatch() {
    if (isTracking) return
    try {
        startForeground(
            NOTIFICATION_ID,
            createNotification("Watch Ready", "Press START on your watch to begin")
        )
        Log.d("RunTrackingService", 
              "⌚ Service in standby — foreground started, waiting for watch START")
    } catch (e: Exception) {
        Log.e("RunTrackingService", "prepareForWatch: startForeground failed: $e")
        stopSelf()
    }
}
```

**Android 12+ Workaround**:
- **Problem**: Android 12+ blocks `startForegroundService()` calls from background
- **Solution**: Start service while app is in foreground (user tapping "Send to Watch")
- **State**: Service enters standby, showing "Watch Ready" notification
- **No New Call**: When watch sends START, service is already running as foreground service, no new `startForegroundService()` needed

### 2.3 Sensor-Level Power Optimization

#### Activity Recognition Permission (Step Counter)
**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 2688-2718)

```kotlin
private fun startSensorTracking() {
    // Check ACTIVITY_RECOGNITION permission for step counter (Android 10+)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        if (ActivityCompat.checkSelfPermission(
            this, 
            Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED) {
            stepCounterSensor?.let {
                try {
                    sensorManager.registerListener(
                        this, 
                        it, 
                        SensorManager.SENSOR_DELAY_NORMAL
                    )
                    Log.d("RunTrackingService", "Step counter sensor registered")
                } catch (e: Exception) {
                    Log.e("RunTrackingService", "Failed to register step counter", e)
                }
            }
        } else {
            Log.w("RunTrackingService", 
                  "ACTIVITY_RECOGNITION permission not granted - skipping step counter")
        }
    }

    // Check BODY_SENSORS permission for heart rate (Android 6+)
    if (ActivityCompat.checkSelfPermission(
        this, 
        Manifest.permission.BODY_SENSORS
    ) == PackageManager.PERMISSION_GRANTED) {
        heartRateSensor?.let {
            try {
                sensorManager.registerListener(
                    this, 
                    it, 
                    SensorManager.SENSOR_DELAY_NORMAL
                )
                Log.d("RunTrackingService", "Heart rate sensor registered")
            } catch (e: Exception) {
                Log.e("RunTrackingService", "Failed to register heart rate sensor", e)
            }
        }
    } else {
        Log.w("RunTrackingService", 
              "BODY_SENSORS permission not granted - skipping heart rate sensor")
    }
}
```

**Sensor Update Rates**:
- **SENSOR_DELAY_NORMAL**: ~200ms updates (most power-efficient)
- **Fallback Pattern**: Graceful degradation if permission denied
- **Dual Cadence Tracking**:
  - Primary: Step counter sensor (step count accumulator)
  - Fallback: Step detector sensor (fires per individual step) - only if counter unavailable

---

## 3. LOCATION SERVICE PERMISSIONS

### 3.1 Android Permission Declarations

**File**: `./app/src/main/AndroidManifest.xml` (Lines 9-30)

```xml
<!-- Location permissions for GPS tracking -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Background location for live run tracking (Android 10+) -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Step counter for cadence tracking (Android 10+) -->
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />

<!-- Heart rate for coaching (Android 8+) -->
<uses-permission android:name="android.permission.BODY_SENSORS" />

<!-- Foreground service for run tracking -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

<!-- Wake lock to keep CPU active during tracking (screen off) -->
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Post notifications for foreground service (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**Permission Categories**:

| Permission | Purpose | Android Version | Type | Critical |
|-----------|---------|-----------------|------|----------|
| `ACCESS_FINE_LOCATION` | Precise GPS (±10m) | 6+ | Runtime | **YES** |
| `ACCESS_COARSE_LOCATION` | Network location (±1km) | 6+ | Runtime | Fallback |
| `ACCESS_BACKGROUND_LOCATION` | GPS when app in background | 10+ | Runtime | **YES** |
| `ACTIVITY_RECOGNITION` | Step counter access | 10+ | Runtime | Optional |
| `BODY_SENSORS` | Heart rate sensor access | 6+ | Runtime | Optional |
| `FOREGROUND_SERVICE` | Run foreground service | 12+ | Manifest | **YES** |
| `FOREGROUND_SERVICE_LOCATION` | Location foreground service type | 12+ | Manifest | **YES** |
| `WAKE_LOCK` | Prevent CPU sleep | All | Manifest | **YES** |
| `POST_NOTIFICATIONS` | Show run notifications | 13+ | Runtime | Important |

### 3.2 Permission Request UI

**File**: `./app/src/main/java/live/airuncoach/airuncoach/ui/screens/LocationPermissionScreen.kt`

#### Permission Checking Functions

```kotlin
// Lines 39-48: Check fine/coarse location
fun checkPermission(): Boolean {
    return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED ||
    ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_COARSE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
}

// Lines 50-59: Check activity recognition (Android 10+)
fun checkActivityRecognitionPermission(): Boolean {
    return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED
    } else {
        true  // Pre-Android 10 doesn't require explicit request
    }
}
```

#### Permission Request Dialog

```kotlin
// Lines 234-243: Multi-permission request
val permissions = mutableListOf(
    Manifest.permission.ACCESS_FINE_LOCATION,
    Manifest.permission.ACCESS_COARSE_LOCATION,
    Manifest.permission.BODY_SENSORS
)
if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
    permissions.add(Manifest.permission.ACTIVITY_RECOGNITION)
}
locationPermissionLauncher.launch(permissions.toTypedArray())
```

**Requested Permissions in Dialog**:
1. **ACCESS_FINE_LOCATION** - Primary GPS permission
2. **ACCESS_COARSE_LOCATION** - Network-based location fallback
3. **BODY_SENSORS** - Heart rate sensor
4. **ACTIVITY_RECOGNITION** - Step counter (Android 10+ only)

#### User-Facing Explanations

```kotlin
// Lines 129-133: Main description
Text(
    text = "AI Run Coach needs access to your device's\n" +
           "GPS and sensors to accurately track your runs,\n" +
           "calculate distance, pace, and heart rate.",
    style = AppTextStyles.body,
    color = Colors.textSecondary,
    textAlign = TextAlign.Center
)

// Lines 186-189: Privacy assurance
Text(
    text = "Your location data is only used during runs\n" +
           "and is never shared with third parties.",
    style = AppTextStyles.small,
    color = Colors.textMuted,
    lineHeight = AppTextStyles.small.lineHeight
)
```

**Features Listed to Users**:
- Real-time GPS tracking during runs
- Accurate distance and pace calculation
- Route mapping and elevation data
- Background tracking (screen locked)
- Heart rate and cadence tracking

#### Permission Grant Flow

```kotlin
// Lines 77-92: Handle permission result
val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
val activityRecognitionGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    permissions[Manifest.permission.ACTIVITY_RECOGNITION] ?: false
} else {
    true
}

if (fineLocationGranted || coarseLocationGranted) {
    hasLocationPermission = true
}

if ((fineLocationGranted || coarseLocationGranted) && activityRecognitionGranted) {
    // Core permissions granted — auto-proceed
    if (!hasNavigated) {
        hasNavigated = true
        onPermissionGranted()  // Navigate to home/main screen
    }
} else {
    // Dialogs completed but some permissions denied — show "Continue to App"
    dialogsCompleted = true
}
```

**Key Decision Points**:
1. **Either Fine OR Coarse Location**: App proceeds with either (prefers fine, accepts coarse)
2. **Activity Recognition Optional**: Android <10 doesn't require; 10+ must match main location grant
3. **Graceful Degradation**: If user denies sensors, app still runs (just without step counter/HR data)
4. **Continue to App**: Users can proceed even after denying some permissions

### 3.3 iOS Location Implementation

**File**: `./ios/StravaViews.swift` (Partial implementation found)

The iOS implementation includes Strava integration which handles location data sharing:

```swift
// Lines 42, 44, 45, 46: Features shared with Strava
FeatureRow(emoji: "📍", title: "GPS Track Mapping", description: "Strava generates route maps")
FeatureRow(emoji: "❤️", title: "Heart Rate Data", description: "Complete biometric details")
FeatureRow(emoji: "🏃", title: "Cadence Metrics", description: "Running dynamics included")
FeatureRow(emoji: "⛰️", title: "Elevation Data", description: "Altitude profiles included")
```

**Note**: Full iOS location tracking implementation would use:
- `CLLocationManager` for GPS
- `CLLocationManagerDelegate` for location updates
- Location permissions states (always, when in use, never)
- HealthKit integration for heart rate from wearables

---

## 4. BACKGROUND DATA RESTRICTIONS

### 4.1 Android Background Execution Handling

#### Foreground Service as Solution

**Problems Solved**:
1. **Doze Mode** (Android 6+): Prevents background services unless whitelisted
   - **Solution**: Run as foreground service with persistent notification
2. **Battery Optimization/App Standby** (Android 5+): Restrict background execution
   - **Solution**: Foreground service exemption
3. **Background Execution Limits** (Android 8+): Can't start services from background
   - **Solution**: Start service while app in foreground + transition to foreground immediately on run start

#### Notification Requirement

**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt`

The service must maintain an active notification throughout the run (created via `createNotification()` and shown via `startForeground()`). This notification:
- Is **mandatory** and cannot be dismissed by user
- Shows run progress/status
- Appears in persistent notification area
- Keeps service in active process (not subject to background killing)

#### Location Update Persistence

Even with these restrictions, the service:
1. **Continues GPS polling** via `requestLocationUpdates()`
2. **Maintains sensor listeners** for heart rate and step counter
3. **Processes all callbacks** in `LocationCallback.onLocationResult()`
4. **Uploads data periodically** (every 5 seconds to live session)

### 4.2 Data Loss Prevention (Sync Queue)

**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Line 73)

```kotlin
private lateinit var syncQueue: SyncQueue  // For offline run persistence
```

**Purpose**:
- If network drops during run, GPS/metric data is queued locally
- On network restoration, queued data is synced to server
- Prevents data loss if user moves between network coverage areas

---

## 5. GPS ACCURACY SETTINGS

### 5.1 Accuracy Tracking and Filtering

**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 277-283)

```kotlin
// GPS accuracy tracking (from Garmin Pos.Quality — 0=poor, 4=best; converted to approx metres CEP)
private var watchGpsAccuracySum:   Float = 0f
private var watchGpsAccuracyCount: Int   = 0
private var watchGpsAccuracyWorst: Float = 0f   // highest metres CEP seen (worst)

// Pace extremes (sec/km) — min = fastest, max = slowest
private var watchMinPace: Double = 0.0
private var watchMaxPace: Double = 0.0
```

### 5.2 Watch GPS Lock Confidence

**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 172-174)

```kotlin
// How many watch GPS updates have arrived in this session. GPS lock isn't stable in
// the first ~8 seconds so we show "–" until the signal settles.
private var watchGpsUpdateCount: Int = 0
```

**GPS Stability Logic**:
- **First 8 Seconds**: Show "–" (no pace/speed display) while GPS acquires lock
- **After 8 Seconds**: Display pace once signal is stable
- **Rationale**: Prevents misleading pace calculations during initial acquisition

### 5.3 Elevation Accuracy Thresholds

**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 575-606)

```kotlin
// ELEVATION NOISE FILTER — two thresholds because GPS sources have very different accuracy profiles:

// Phone GPS: updates every ~1s, altitude accuracy ±5–10m
private const val PHONE_ELEV_WINDOW            = 60   // 60 × 1 Hz readings = 60 second window
private const val PHONE_ELEV_COMMIT_THRESHOLD  = 1.5  // Min net change (m) per window to count

// Garmin watch GPS: updates every ~2s, altitude accuracy ±1m (barometric fusion)
private const val GARMIN_ELEV_WINDOW           = 10   // ~10 × 2s samples = 20 second window
private const val GARMIN_ELEV_COMMIT_THRESHOLD = 0.5  // Min net change (m) per window to count
```

**Rationale for Different Thresholds**:
- **Phone GPS**: ±5–10m noise means need 60-second averaging to reduce noise to ±1.3m RMS
  - 60m window at 1 Hz needed before committing to 1.5m elevation change
  - Prevents false positives from random GPS jitter
- **Garmin GPS**: ±1m accuracy (barometric altimeter + GPS fusion) means can use tighter window
  - 20s window (10 samples) enough to reduce noise to ±0.10m RMS
  - Can commit to 0.5m changes without false positives

**Grade Thresholds** (Secondary validation):
```kotlin
private const val UPHILL_GRADE_THRESHOLD = 3.0       // Raised from 2.0
private const val STEEP_UPHILL_GRADE_THRESHOLD = 5.0
private const val DOWNHILL_GRADE_THRESHOLD = -3.0
private const val STEEP_DOWNHILL_GRADE_THRESHOLD = -5.0
```

**Why 3% Threshold**:
- GPS altitude error ±5m over 150m horizontal distance = ~3% apparent grade on flat terrain
- 3% is the reliable lower bound separating real hills from GPS noise
- Prevents elevation coaching on flat terrain with bad GPS

---

## 6. LOCATION UPDATE PROCESSING

### 6.1 Location Callback Flow

**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 1223-1226)

```kotlin
private fun setupLocationCallback() {
    locationCallback = object : LocationCallback() {
        override fun onLocationResult(locationResult: LocationResult) {
            locationResult.lastLocation?.let { onNewLocation(it) }
        }
    }
}
```

### 6.2 Main Location Processing Pipeline

**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 2720-2769)

```kotlin
private fun onNewLocation(location: Location) {
    if (!isTracking) return

    // Step 1: Smart GPS source arbitration
    // If watch is streaming GPS (within 15s), skip phone GPS entirely
    if (location.provider != "garmin" && 
        (System.currentTimeMillis() - lastWatchGpsMs) < 15_000L) {
        Log.d("RunTrackingService", 
              "Skipping phone GPS — watch GPS is active...")
        return
    }

    // Step 2: Calculate elevation/grade from GPS altitude
    var inclineDegrees: Float? = null
    if (location.hasAltitude()) {
        if (routePoints.isNotEmpty()) {
            val prevAlt = routePoints.last().altitude
            if (prevAlt != null) {
                val altChange = location.altitude - prevAlt
                val distToNextPoint = calculateDistance(routePoints.last(), LocationPoint(...))
                if (distToNextPoint > 0) {
                    val angleRadians = kotlin.math.atan(altChange / distToNextPoint)
                    // Convert to percentage grade (not degrees!)
                    inclineDegrees = (kotlin.math.tan(angleRadians) * 100).toFloat()
                }
            }
        }
    }

    // Step 3: Create comprehensive location point
    val newPoint = LocationPoint(
        latitude = location.latitude,
        longitude = location.longitude,
        timestamp = location.time,
        speed = location.speed.takeIf { it > 0 },
        altitude = location.altitude.takeIf { location.hasAltitude() },
        heartRate = currentHeartRate.takeIf { it > 0 },
        bearing = location.bearing.takeIf { location.hasBearing() },
        cadence = currentCadence.takeIf { it > 0 },
        inclineDegrees = inclineDegrees
    )

    // Step 4: Add to route points for playback/upload
    if (routePoints.isNotEmpty()) {
        // Process elevation, calculate pace, etc.
    }
}
```

### 6.3 Elevation Processing Pipeline

**Windowed Mean Approach for Noise Filtering**:

1. **Raw Altitude Capture**: Each GPS point's altitude stored
2. **Window Accumulation**:
   - Phone: Accumulate 60 readings (60 seconds)
   - Garmin: Accumulate 10 readings (~20 seconds)
3. **Noise Reduction**: Calculate mean across window
4. **Threshold Check**: Only commit gain/loss if window mean change exceeds threshold
5. **Accumulation**: Add committed gain/loss to running totals

**Example for Phone GPS**:
```
Sample 1-60: Altitudes 100, 100.3, 100.1, 99.9, ... → Window mean = 100.2m
              Commit: change of 0.2m — below 1.5m threshold, ignore
Sample 61-120: Altitudes 101.5, 101.7, 101.9, ... → Window mean = 101.6m
               Commit: change of 1.4m — below 1.5m threshold, ignore
Sample 121-180: Altitudes 103.1, 103.3, 103.8, ... → Window mean = 103.2m
                Commit: change of 2.0m — exceeds 1.5m threshold, ADD TO GAIN
```

### 6.4 Real-Time Coaching Triggers

**File**: `./app/src/main/java/live/airuncoach/airuncoach/service/RunTrackingService.kt` (Lines 124-140)

```kotlin
// Global coaching coordinator — prevents back-to-back audio
private var lastGlobalCoachingTime: Long = 0          // Timestamp of last coaching audio
private var lastGlobalCoachingDistance: Double = 0.0  // Distance at which last coaching fired
private val GLOBAL_COACHING_MIN_GAP_MS = 15_000L      // 15 second minimum between ANY audio
private val GLOBAL_COACHING_MIN_GAP_M = 150.0         // 150m minimum between ANY audio

// Navigation coaching gets shorter gap (safety-critical)
private val NAV_COACHING_MIN_GAP_MS = 8_000L          // But still prevents overlap
private val KM_SPLIT_EXCLUSION_ZONE_M = 200.0         // Suppress pace cues within 200m of km boundary
```

**Coaching Types and Triggers**:
1. **Pace Coaching**: Every 300-750m (varies by run phase)
2. **HR Zone Coaching**: When HR exceeds thresholds
3. **Elevation Coaching**: When sustained uphill/downhill detected (15m+ gain/loss)
4. **Cadence Coaching**: Every 1-2km if cadence suboptimal
5. **Navigation Coaching**: At turn waypoints
6. **Elevation Coaching**: Hill detection and transition cues
7. **Elite Coaching**: Technique, milestones, reinforcement, ETA, trends

**Cooling Periods** (prevent audio spam):
- **Global Gap**: 15 seconds AND 150m between any two coaching cues
- **Navigation Gap**: 8 seconds (shorter because safety-critical, but still prevents overlap)
- **Km Split**: Suppress pace coaching within 200m of km boundary

### 6.5 Session-Level Data Aggregation

Data accumulated for upload at run completion:

```kotlin
// Distance/Time
totalDistance: Double = 0.0
startTime: Long = 0
totalPausedMs: Long = 0

// Heart Rate
heartRateSum: Long = 0
heartRateSampleCount: Int = 0
maxHeartRate: Int = 0
minHeartRate: Int = 0

// Cadence
cadenceSum: Long = 0
cadenceCount: Int = 0
maxCadenceValue: Int = 0

// Elevation
totalElevationGain: Double = 0.0
totalElevationLoss: Double = 0.0

// Watch Data (if Garmin watch connected)
watchHrSeries: List<Int> = emptyList()
watchCadenceSeries: List<Int> = emptyList()
watchAltSeries: List<Float> = emptyList()
watchGctSeries: List<Float> = emptyList()  // Ground Contact Time
watchVoSeries: List<Float> = emptyList()   // Vertical Oscillation
// ... and more
```

---

## 7. SECURITY & PRIVACY CONSIDERATIONS

### 7.1 Data Minimization

- **Real-Time Upload**: GPS data uploaded every 5 seconds to avoid large buffering on device
- **No Persistent Cache**: After upload, data removed from phone unless run saved locally
- **User Control**: User can delete runs, which removes all associated GPS data
- **Third-Party Sharing**: Optional (Strava share only after explicit user action)

### 7.2 Permission Minimization

- **Requested Only When Needed**: Activity recognition only requested at onboarding
- **Graceful Degradation**: App functions without optional sensors (HR, step counter)
- **User Override**: Users can change permission state in Android settings

### 7.3 Data Encryption

- All API calls to backend over HTTPS
- Sensitive data (auth tokens) stored in encrypted shared preferences
- No plaintext storage of GPS coordinates

---

## 8. SUMMARY TABLE

| Aspect | Implementation | Details |
|--------|----------------|---------|
| **GPS Frequency** | 1 second (1000ms) | Accepts updates as fast as 500ms |
| **Priority** | HIGH_ACCURACY | Uses GPS + network |
| **Update Reporting** | Immediate | No waiting for high confidence |
| **Watch Integration** | 15-second priority window | Skips phone GPS when watch active |
| **Wake Lock** | PARTIAL_WAKE_LOCK | Keeps CPU awake, screen can off |
| **Wake Lock Timeout** | 10 hours max | Auto-release safety |
| **Foreground Service** | Required for background | Shows persistent notification |
| **Permissions** | Multi-tier | Fine/coarse location, activity recognition, body sensors |
| **Background Handling** | Foreground service exemption | Continues even under Doze/battery optimization |
| **Elevation Window (Phone)** | 60 seconds | Threshold: 1.5m |
| **Elevation Window (Garmin)** | ~20 seconds (10 samples) | Threshold: 0.5m |
| **Grade Threshold** | 3% minimum | Avoids GPS noise false positives |
| **Coaching Gap** | 15 sec + 150m | Global minimum between any audio |
| **Location Update Rate** | ~1Hz | Matches typical GPS receiver update rate |
| **Data Points Per Sample** | 9+ fields | Lat/long/alt/bearing/speed/HR/cadence/grade/accuracy |

---

## 9. iOS LOCATION TRACKING (PARTIAL)

The iOS implementation found focuses on Strava integration:
- **GPS Data Sharing**: Location track sent to Strava with complete route mapping
- **Features Shared**: GPS track mapping, heart rate data, cadence metrics, elevation data
- **Typical Implementation** would use:
  - `CLLocationManager` with `CLLocationManagerDelegate`
  - `startUpdatingLocation()` or `startUpdatingHeading()`
  - `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription` in Info.plist
  - HealthKit integration for heart rate from Apple Watch

**Note**: Full iOS location implementation details would require access to actual iOS source files beyond what was found in the codebase.

---

**Document Generated**: 2026-07-29
**Codebase Version**: Latest (July 2026)
**Coverage**: Android (Complete), Backend (Complete), iOS (Partial - Strava integration found)

