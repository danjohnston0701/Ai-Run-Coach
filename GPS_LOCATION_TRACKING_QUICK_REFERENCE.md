# GPS Location Tracking - Quick Reference Guide

## GPS Data Collection

### Update Frequency
- **Request Interval**: 1 second (1000ms)
- **Accept Rate**: As fast as 500ms
- **Priority**: HIGH_ACCURACY (GPS + Network)

### Data Captured Per Update
```
- Latitude/Longitude (WGS84)
- Timestamp (millisecond precision)
- Speed (m/s)
- Altitude (meters)
- Bearing (degrees 0-360)
- Heart Rate (bpm)
- Cadence (spm)
- Incline/Grade (%)
```

### Multi-Source Handling
- **Watch Priority**: 15-second window (if Garmin GPS active, skip phone GPS)
- **Rationale**: Watch GPS more accurate, prevents double-counting distance

---

## Power Saving

### Wake Lock
- **Type**: PARTIAL_WAKE_LOCK
- **Purpose**: Keeps CPU awake, allows screen off
- **Timeout**: 10 hours maximum
- **Acquired**: At run start
- **Released**: At run end / service destroy / permission fail

### Foreground Service
- **Type**: Location tracking foreground service
- **Notification**: Persistent, mandatory, cannot dismiss
- **Requirements**: 
  - `android.permission.FOREGROUND_SERVICE` (Android 12+)
  - `android.permission.FOREGROUND_SERVICE_LOCATION` (Android 12+)
  - Must call `startForeground()` within 5 seconds

### Android 12+ Workaround
- Start service while app in foreground (user taps "Send to Watch")
- Service enters standby with "Watch Ready" notification
- When watch sends START, already running as foreground (no new call needed)

### Sensor Optimization
- **Update Rate**: SENSOR_DELAY_NORMAL (~200ms)
- **Sensors**: Step counter (primary), heart rate (optional)
- **Graceful Degradation**: If permission denied, skip sensor

---

## Permissions

### Runtime Permissions (Must Request at Runtime)
| Permission | Purpose | Android | Critical |
|-----------|---------|---------|----------|
| ACCESS_FINE_LOCATION | GPS tracking | 6+ | ✅ YES |
| ACCESS_COARSE_LOCATION | Network location | 6+ | Fallback |
| ACCESS_BACKGROUND_LOCATION | Background GPS | 10+ | ✅ YES |
| ACTIVITY_RECOGNITION | Step counter | 10+ | Optional |
| BODY_SENSORS | Heart rate | 6+ | Optional |
| POST_NOTIFICATIONS | Show notifications | 13+ | Important |

### Manifest Permissions (Declared Only)
| Permission | Purpose | Critical |
|-----------|---------|----------|
| FOREGROUND_SERVICE | Run foreground service | ✅ YES |
| FOREGROUND_SERVICE_LOCATION | Location foreground type | ✅ YES |
| WAKE_LOCK | Prevent CPU sleep | ✅ YES |

### Permission Logic
- Either FINE OR COARSE location accepted
- Activity recognition optional (graceful degradation)
- Users can "Continue to App" even after denying optional sensors

---

## Accuracy Settings

### Elevation Noise Filtering (Two Sources)

**Phone GPS** (±5-10m accuracy)
- Window: 60 readings (60 seconds at 1 Hz)
- Commit Threshold: 1.5m elevation change
- Noise Reduction: ±1.3m RMS

**Garmin Watch** (±1m accuracy with barometric fusion)
- Window: 10 readings (~20 seconds at 0.5 Hz)
- Commit Threshold: 0.5m elevation change
- Noise Reduction: ±0.10m RMS

### Grade Thresholds
- Uphill: **≥3%** (raised from 2% to avoid GPS noise false positives)
- Steep Uphill: ≥5%
- Downhill: ≤-3%
- Steep Downhill: ≤-5%

**Why 3%?** GPS error of ±5m over 150m horizontal = ~3% on flat terrain. This is minimum reliable threshold.

### GPS Lock Confidence
- **First 8 seconds**: Show "–" (GPS not stable)
- **After 8 seconds**: Display pace (signal settled)

---

## Background Restrictions Handling

### Problem → Solution
| Problem | Solution |
|---------|----------|
| Doze Mode blocks services (Android 6+) | Run as foreground service |
| Battery optimization restricts execution | Foreground service exemption |
| Can't start services from background (Android 8+) | Start in foreground, then background-safe |
| Service killed under memory pressure | Persistent notification required |

### Data Persistence
- **Sync Queue**: Local queue if network drops
- **Periodic Upload**: Every 5 seconds to live session
- **No Data Loss**: Queued data syncs on network restoration

---

## Location Update Processing Pipeline

```
1. Location Callback Received
   ↓
2. Check GPS Source (Arbitration)
   - If watch GPS active (last 15s), skip phone GPS
   ↓
3. Calculate Grade (if altitude available)
   - elevation_change / horizontal_distance
   - Convert to percentage grade
   ↓
4. Create LocationPoint
   - Latitude, longitude, timestamp, speed, altitude
   - Heart rate, bearing, cadence, incline
   ↓
5. Add to Route
   - Process elevation (windowed mean)
   - Calculate pace
   - Check coaching triggers
   ↓
6. Upload to Live Session (every 5 seconds)
   - Send GPS + metrics to server
   - Update observer view
```

---

## Real-Time Coaching Cooling Periods

**Global Coaching Gap**
- **Time**: 15 seconds minimum between ANY coaching audio
- **Distance**: 150m minimum between ANY coaching audio
- Use BOTH constraints (must satisfy time AND distance)

**Navigation Coaching**
- **Gap**: 8 seconds (shorter, safety-critical, but still prevents overlap)
- **Radius**: 45m for waypoint reached, 100m for upcoming warning

**Km Split Exclusion**
- **Buffer**: 200m around km boundary
- **Rationale**: Prevent pace coaching crowding the split moment

**Coaching Types**
1. Pace (300-750m intervals)
2. HR Zone (when threshold exceeded)
3. Elevation (15m+ gain/loss detected)
4. Cadence (1-2km intervals)
5. Navigation (at turns)
6. Elite (technique, milestones, ETA, trends)

---

## Key Files

| Component | File | Key Functions |
|-----------|------|----------------|
| **Android GPS** | RunTrackingService.kt | `requestLocationUpdates()`, `onNewLocation()` |
| **Wake Lock** | RunTrackingService.kt | `acquireWakeLock()`, `releaseWakeLock()` |
| **Permissions** | LocationPermissionScreen.kt | `checkPermission()`, `checkActivityRecognitionPermission()` |
| **Manifest** | AndroidManifest.xml | Permission declarations, service definition |
| **Sensors** | RunTrackingService.kt | `startSensorTracking()` |
| **Backend Schema** | schema.ts | `latitude`, `longitude`, `gpsAccuracy`, `altitude` |

---

## Backend Data Storage

```typescript
// Per GPS sample
latitude: real (WGS84)
longitude: real (WGS84)
altitude: real (meters)
bearing: real (degrees 0-360)
gpsAccuracy: real (meters CEP - Circular Error Probable)

// Run-level
startLatitude: real
startLongitude: real
```

---

## iOS Location (Partial Implementation Found)

Located in `./ios/StravaViews.swift`
- Features shared with Strava: GPS track mapping, heart rate, cadence, elevation
- Full implementation would use:
  - `CLLocationManager` for GPS
  - `CLLocationManagerDelegate` for updates
  - HealthKit for heart rate from Apple Watch

---

**Generated**: 2026-07-29
**Coverage**: Android (Complete), Backend (Complete), iOS (Partial)

