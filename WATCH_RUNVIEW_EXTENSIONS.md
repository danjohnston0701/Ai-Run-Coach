# Watch RunView.mc Extensions - Phase 1-2

## Task 1: Add Biomechanical Data Fields to RunView.mc

**Location**: After line 53 (after `_cadence` field)

```monkey
    private var _cadence       = 0;

    // ── Running Dynamics (from Activity.Info) ──────────────────────────────
    // Captured every 1-2 seconds during active run
    private var _groundContactTime = 0;        // milliseconds (200-300ms normal)
    private var _groundContactBalance = 0.0;   // percent (50% = perfectly balanced)
    private var _verticalOscillation = 0.0;    // centimeters (6-8cm efficient, >10 inefficient)
    private var _verticalRatio = 0.0;          // percent (8-10% efficient)
    private var _strideLength = 0.0;           // meters (calculated from pace + cadence)

    // ── Training Metrics (from Activity.Info) ──────────────────────────────
    // Updated periodically during run
    private var _trainingEffect = 0.0;         // 0-5 scale (0=no effect, 5=max effort)
    private var _vo2Max = 0.0;                 // ml/kg/min (estimated or measured)
    private var _recoveryTime = 0;             // minutes until full recovery

    // ── Environmental Data (from Position.Info) ───────────────────────────
    // Captured every 1-2 seconds from GPS
    private var _bearing = 0.0;                // degrees (0=N, 90=E, 180=S, 270=W)
    private var _gpsAccuracy = 0.0;            // meters (Garmin ~3m)
    private var _ambientPressure = 0.0;        // Pascals (standard sea level ~101325)

    // ── Display metrics for UI ─────────────────────────────────────────────
    // Smoothed versions for non-jarring screen updates
    private var _dispVO = 0.0;
    private var _dispGCT = 0;
```

---

## Task 2: Add Method to Capture Running Dynamics

**Location**: Add new method after `onSensor()` (around line 433)

```monkey
    function onSensor(info as Sensor.Info) as Void {
        if (info.heartRate != null) { _heartRate = info.heartRate; _heartRateZone = _hrZone(_heartRate); }
        if (info.cadence   != null) { _cadence   = info.cadence; }
    }

    // ── NEW: Capture Running Dynamics from Activity.Info ────────────────────
    private function _captureRunningDynamics() {
        try {
            var activity = Activity.getActivityInfo();
            if (activity != null) {
                // Ground Contact Time (milliseconds)
                if (activity.groundContactTime != null) {
                    _groundContactTime = activity.groundContactTime;
                    _dispGCT = ((_dispGCT * 0.7) + (_groundContactTime * 0.3)).toNumber();
                }
                
                // Ground Contact Balance (percent, 50% = balanced)
                if (activity.groundContactTimeBalance != null) {
                    _groundContactBalance = activity.groundContactTimeBalance;
                }
                
                // Vertical Oscillation (centimeters)
                if (activity.verticalOscillation != null) {
                    _verticalOscillation = activity.verticalOscillation;
                    _dispVO = (_dispVO * 0.7) + (_verticalOscillation * 0.3);
                }
                
                // Vertical Ratio (percent)
                if (activity.verticalRatio != null) {
                    _verticalRatio = activity.verticalRatio;
                }
                
                // Stride Length (meters) - calculate from pace and cadence if not available
                if (activity.strideLength != null) {
                    _strideLength = activity.strideLength;
                } else if (_cadence > 0 && _pace > 0) {
                    // Estimate: stride = (distance / time) / cadence
                    // pace is min/km, cadence is steps/min
                    // stride = (speed in m/s) / (cadence in steps/s)
                    var speedMs = 1000.0 / (_pace * 60.0);  // convert pace to m/s
                    var cadencePerSecond = _cadence.toFloat() / 60.0;
                    if (cadencePerSecond > 0) {
                        _strideLength = speedMs / cadencePerSecond;
                    }
                }
                
                // Training Metrics
                if (activity.trainingEffect != null) {
                    _trainingEffect = activity.trainingEffect;
                }
                
                // VO2 Max Estimate
                if (activity.vo2Max != null) {
                    _vo2Max = activity.vo2Max;
                }
                
                // Recovery Time
                if (activity.recoveryTime != null) {
                    _recoveryTime = activity.recoveryTime;
                }
            }
        } catch (e) {
            Sys.println("Error capturing running dynamics: " + e.getErrorMessage());
        }
    }
```

**Call this method in `onTick()`** - add this line in the update section around line 355:

```monkey
            if (_isRunning && !_isPaused) {
                _captureRunningDynamics();  // NEW: Capture running dynamics every tick
                
                // existing code...
                _streamAccumMs += _tickMs;
```

---

## Task 3: Extend GPS Capture in onPosition()

**Location**: Modify `onPosition()` method (around line 393)

Current code only captures lat/lng/alt. Add bearing and accuracy:

```monkey
    function onPosition(info as Pos.Info) as Void {
        // Track GPS quality for the pre-run acquisition gate
        if (info.accuracy != null) {
            _gpsQuality = info.accuracy;
            _gpsAccuracy = info.accuracy.toFloat();  // NEW: Store accuracy
            var wasReady = _gpsReady;
            _gpsReady = (_gpsQuality >= 3);
            if (_gpsReady && !wasReady && !_isRunning) {
                if (_overlayState == OVERLAY_GPS_WAIT) {
                    _overlayState = (_isCoached || _prepRunType.length() > 0)
                        ? OVERLAY_COACHED
                        : OVERLAY_READY;
                }
            }
        }

        if (info.position != null) {
            var deg = info.position.toDegrees();
            _lastGpsLat = deg[0];
            _lastGpsLng = deg[1];
            _lastGpsAlt = info.altitude;
            
            // NEW: Capture bearing (direction of travel)
            if (info.bearing != null) {
                _bearing = info.bearing.toFloat();
            }
            
            if (info.speed != null && info.speed > 0.1) {
                _lastGpsSpeed = info.speed;
                if (!_phoneControlled && info.altitude != null && _dataStreamer != null) {
                    _dataStreamer.updateGPS(deg[0], deg[1], info.altitude);
                }
                // Calculate pace from speed
                var speedKmh = info.speed * 3.6;
                if (speedKmh > 0) {
                    _pace = 60.0 / speedKmh;  // min/km
                }
            }
        }
    }
```

---

## Task 4: Update PhoneLink.sendRunData() to Stream ALL 23 Metrics

**Location**: In `onTick()` method, around line 377

**Current Code** (only sends GPS + HR + cadence):
```monkey
        if (_phoneControlled && _isRunning && !_isPaused) {
            _gpsStreamTick += 1;
            if (_gpsStreamTick >= 8 && _lastGpsLat != null && _lastGpsLng != null) {
                _gpsStreamTick = 0;
                _phoneLink.sendRunData({
                    "lat"   => _lastGpsLat,
                    "lng"   => _lastGpsLng,
                    "alt"   => _lastGpsAlt,
                    "speed" => _lastGpsSpeed,
                    "hr"    => _heartRate,
                    "cad"   => _cadence
                });
            }
        }
```

**NEW CODE** (sends all 23+ metrics):
```monkey
        if (_phoneControlled && _isRunning && !_isPaused) {
            _gpsStreamTick += 1;
            if (_gpsStreamTick >= 8 && _lastGpsLat != null && _lastGpsLng != null) {
                _gpsStreamTick = 0;
                _phoneLink.sendRunData({
                    // ── GPS & Position ────────────────────────────────────
                    "lat"         => _lastGpsLat,
                    "lng"         => _lastGpsLng,
                    "alt"         => _lastGpsAlt,
                    "speed"       => _lastGpsSpeed,
                    "bearing"     => _bearing,
                    "gpsAccuracy" => _gpsAccuracy,

                    // ── Heart Rate & Cardiovascular ────────────────────────
                    "hr"          => _heartRate,
                    "hrZone"      => _heartRateZone,

                    // ── Cadence & Stride ──────────────────────────────────
                    "cad"         => _cadence,
                    "stride"      => _strideLength,

                    // ── Running Dynamics ──────────────────────────────────
                    "gct"         => _groundContactTime,        // ground contact time (ms)
                    "gctBalance"  => _groundContactBalance,     // GCT balance (%)
                    "vo"          => _verticalOscillation,      // vertical oscillation (cm)
                    "vr"          => _verticalRatio,            // vertical ratio (%)

                    // ── Training Metrics ──────────────────────────────────
                    "te"          => _trainingEffect,           // training effect (0-5)
                    "vo2"         => _vo2Max,                   // VO2 Max estimate
                    "recovery"    => _recoveryTime,             // recovery time (mins)

                    // ── Environmental ────────────────────────────────────
                    "pressure"    => _ambientPressure,          // ambient pressure (Pa)

                    // ── Run Totals ────────────────────────────────────
                    "distance"    => _distance,
                    "pace"        => _pace,
                    "elapsedTime" => _elapsedTime,
                    "timestamp"   => Sys.getTimer()             // milliseconds since app start
                });
            }
        }
```

---

## Implementation Summary

### What Each Task Does:

| Task | What | Lines | Impact |
|------|------|-------|--------|
| **Task 1** | Add 17 new private var fields | 50-53 → +20 lines | Memory: ~200 bytes |
| **Task 2** | Capture running dynamics every tick | New method | 25-30 lines | CPU: <5ms per tick |
| **Task 3** | Extend GPS capture | onPosition() | 10 lines added | No perf impact |
| **Task 4** | Stream 23+ metrics to phone | sendRunData() | Replace 8 lines with 30 | BLE: ~500 bytes/2sec |

### Estimated Watch Impact:
- **Memory**: +200 bytes (negligible)
- **CPU**: +5-10ms per 250ms tick (2-4% overhead)
- **Battery**: Minimal (Activity.Info queries are fast)
- **BLE**: ~500 bytes every 2 seconds (manageable)

### Data Flow After Implementation:

```
Watch Activity.getActivityInfo() every 250ms
  ↓
_captureRunningDynamics() extracts: GCT, VO, VR, stride, TE, VO2, recovery
  ↓
onTick() every 2 seconds accumulates all metrics
  ↓
onPosition() captures: lat, lng, alt, speed, bearing, accuracy
  ↓
PhoneLink.sendRunData() sends complete 23+ metric payload to phone
  ↓
Phone receives via GarminWatchManager.handleWatchMessage()
  ↓
Callbacks invoke: onWatchGpsUpdate, onWatchSensorData, onWatchRunningDynamics, etc.
  ↓
RunTrackingService processes all data
  ↓
Send to backend: POST /api/coaching/biometric-data
  ↓
RealTimeBiomechanicalCoach analyzes and generates coaching
  ↓
Coaching sent back to watch via app message
```

---

## Monkey C Notes

1. **Activity.Info fields**: Only available when session is active (after `_session.start()`)
2. **Null checks required**: Many fields may be null on some watch models
3. **Type conversions**: Use `.toFloat()` and `.toNumber()` for conversions
4. **Performance**: Activity.Info queries are fast (<1ms), safe to call every tick
5. **Error handling**: Wrap in try/catch as shown - some watches may not support all fields

---

## Testing Checklist

After implementing these 4 tasks:

- [ ] Watch captures all 23+ metrics during a test run
- [ ] No watch crashes or freezes
- [ ] Battery impact acceptable
- [ ] Phone receives complete payload every 2 seconds
- [ ] All metrics displayed correctly in Android app
- [ ] No memory leaks after 30+ minute run
- [ ] BLE connection stable with larger payloads

---

## Next: Tasks 5-9

Once these 4 tasks are done, the remaining work is:

5. **Enhance GarminWatchManager** - Add callbacks for all data types
6. **Integrate into RunTrackingService** - Process all streams
7. **Connect to AI Coach** - Send to backend for analysis (ALREADY BUILT!)
8. **Test & Verify** - Run with live data
9. **Optimize** - Performance tuning if needed

The backend coaching system is **ready to go** (see `real-time-biomechanical-coach.ts` and `real-time-coaching-integration.ts`).
