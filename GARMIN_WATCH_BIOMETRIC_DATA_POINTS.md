# Garmin Companion Watch - Complete Biomechanical Data Points

## Overview
The Garmin companion watch can stream **23+ biomechanical and physiological data points** to the Android app in real-time during the run. This document outlines all available data fields from the Garmin Connect IQ SDK that can be captured for live coaching and comprehensive run analysis.

---

## 📊 Real-Time Sensor Data (From Sensor.Info)

These are available **every ~250ms** from the watch sensors via `onSensor()` callback:

### Heart Rate & Cardiovascular
1. **Heart Rate (bpm)** - `info.heartRate`
   - Current beats per minute
   - Real-time for zone-based coaching
   - Used for fatigue detection, effort monitoring

2. **Heart Rate Zone (1-5)** - Calculated from HR
   - Zone 1: Easy (50-60% max HR)
   - Zone 2: Aerobic (60-70% max HR)
   - Zone 3: Tempo (70-80% max HR)
   - Zone 4: Threshold (80-90% max HR)
   - Zone 5: Max (90-100% max HR)

### Running Cadence
3. **Cadence (spm)** - `info.cadence`
   - Steps per minute
   - Used for form coaching, stride optimization
   - Target: 170-180 spm for most runners

---

## 🗺️ GPS & Environmental Data (From Position.Info)

These are available **every ~1 second** from the GPS sensor via `onPosition()` callback:

### Geographic Position
4. **Latitude** - `info.position.toDegrees()[0]`
   - Current latitude coordinate
   - Used for route tracking, route similarity

5. **Longitude** - `info.position.toDegrees()[1]`
   - Current longitude coordinate
   - Used for route tracking, route similarity

### Elevation & Terrain
6. **Altitude (meters)** - `info.altitude`
   - Current elevation above sea level
   - Used for elevation gain/loss, grade calculation

7. **Ambient Pressure (Pascals)** - `info.ambientPressure`
   - Air pressure at current location
   - Used for altitude verification, weather correlation
   - Can indicate weather changes (dropping pressure = incoming weather)

### Speed Metrics
8. **Speed (m/s)** - `info.speed`
   - Current instantaneous speed from GPS
   - Used for pace calculation, acceleration analysis

9. **Bearing (degrees)** - `info.bearing`
   - Direction of travel (0° = North, 90° = East, etc.)
   - Used for route fidelity, navigation overlay

### GPS Quality
10. **GPS Accuracy (meters)** - `info.accuracy`
    - Estimated accuracy of GPS fix
    - Used to filter unreliable GPS spikes
    - Garmin multi-band: ~3m CEP (circular error probability)

---

## 🏃 Running Dynamics (From Activity.Info)

These are available **every 1-2 seconds** during an active activity via `Activity.getActivityInfo()`:

### Ground Contact & Stride
11. **Ground Contact Time (milliseconds)** - `info.groundContactTime`
    - Time foot spends on ground per step
    - Normal: 200-300ms for runners
    - Higher values = more contact time (possibly overstriding or fatigue)
    - Used for form analysis, injury risk detection

12. **Ground Contact Balance (%)** - `info.groundContactTimeBalance`
    - Left/right symmetry in ground contact time
    - Normal: 48-52% (perfectly balanced is 50%)
    - Used for running asymmetry detection, injury prevention
    - Example: 52% left means left foot spends 2% more time on ground

### Vertical Movement
13. **Vertical Oscillation (cm)** - `info.verticalOscillation`
    - Vertical bounce of torso per step
    - Lower is more efficient (6-8 cm is good, >10 cm is inefficient)
    - Used for running economy assessment
    - High values may indicate: fatigue, poor posture, or overstriding

14. **Vertical Ratio (%)** - `info.verticalRatio`
    - Ratio of vertical oscillation to stride length
    - Lower percentage = better running efficiency
    - Normal: 8-10% for good runners, >12% for less efficient
    - Used for running economy coaching

### Stride Metrics
15. **Stride Length (meters)** - `info.strideLength` (if available)
    - Distance covered per stride
    - Normal: 1.2-1.6m depending on height
    - Can calculate from: stride = speed ÷ cadence
    - Used for biomechanical analysis, injury detection

---

## 💪 Training & Performance Metrics

### Training Load
16. **Training Effect Score (0-5)** - From activity summary
    - Aerobic training effect (low/high)
    - Anaerobic training effect (if intense)
    - 0-2: Light | 2-3: Moderate | 3-4: Hard | 4-5: Very Hard
    - Used for training load management, recovery recommendations

17. **VO2 Max Estimate (ml/kg/min)** - From activity or wellness data
    - Estimated maximum oxygen consumption
    - Updated after each run
    - Used for fitness level tracking, training plan adjustments

18. **Recovery Time (hours)** - From activity summary
    - Garmin's estimate of how long until fully recovered
    - Used for training schedule recommendations
    - Example: "Recover in 36 hours - take it easy today"

### Power & Energy
19. **Power (watts)** - `info.averagePower` (if power meter paired)
    - Currently available mainly for cycling
    - Some running dynamics-capable watches provide estimated power
    - Used for intensity monitoring on compatible devices

20. **Temperature (Celsius)** - `info.temperature` (some devices)
    - Wrist skin temperature
    - Can indicate stress, fever, or dehydration
    - Advanced biometric metric on newer watches

### Respiration (Advanced)
21. **Respiration Rate (breaths/min)** - `info.respirationRate` (if available)
    - Breathing rate during activity
    - Normal: 30-50 bpm during running, higher with intensity
    - Used for stress level monitoring, recovery assessment
    - Available on Fenix 7X, Epix, and newer models

---

## 🧠 Wellness & Recovery Metrics

### Stress & Recovery
22. **Heart Rate Variability (HRV)** - From wellness data
    - Variability between heartbeats
    - Higher HRV = better recovery | Lower HRV = stress/fatigue
    - Used for readiness assessment
    - Example: Morning HRV of 67ms = Balanced | <50ms = Stressed

23. **Stress Level (0-100)** - From wellness data
    - Current physiological stress
    - Used to recommend easy vs. hard training days
    - Correlates with HRV, sleep quality, training load

---

## 📈 Cumulative Run Metrics

Available by accumulating sensor samples throughout the run:

- **Total Distance** (meters) - Sum of GPS track points
- **Total Duration** (seconds) - Time from start to finish
- **Total Elevation Gain** (meters) - Cumulative ascent
- **Total Elevation Loss** (meters) - Cumulative descent
- **Total Steps** - From step counter sensor
- **Average Pace** (min/km) - Total distance ÷ duration
- **Average Cadence** (spm) - Average across all samples
- **Average HR** (bpm) - Average across all samples
- **Max HR** (bpm) - Peak heart rate during run
- **Calories Burned** (kcal) - Estimated from HR, weight, age

---

## 📊 Data Streaming Frequency

| Metric | Source | Frequency | Latency |
|--------|--------|-----------|---------|
| Heart Rate | Optical HR Sensor | 1 Hz (every 1s) | <500ms |
| Cadence | Accelerometer | ~1 Hz | <500ms |
| GPS (Lat/Lng) | Garmin Multi-band GPS | ~1-2 Hz | ~2-5s |
| Altitude | GPS + Barometer | ~1-2 Hz | ~2-5s |
| Running Dynamics | Accelerometer | ~1-2 Hz | <1s |
| Training Effect | Calculated periodically | Every 10-30s | 10-30s |

---

## 🎯 Real-Time Coaching Opportunities

With all these data points available in real-time, the AI coach can provide:

### Form Coaching
- "Your cadence dropped to 165 spm - try to maintain 172+ for efficiency"
- "Ground contact time increasing - you're getting fatigued, shorten your stride"
- "Vertical oscillation spike - watch your posture on that hill"
- "Running asymmetry detected: right side 8% longer - may indicate minor strain"

### Effort Coaching
- "You're in Zone 4 - dial it back to Zone 3 for this segment"
- "HR trending upward - manageable but watch for fatigue"
- "VO2 Max training load appropriate - good intensity for aerobic adaptation"

### Pacing Coaching
- "Pace slowed to 6:15/km on this segment - that's expected for a 6% grade hill"
- "Negative split potential - if you can hold 5:55/km you'll PR this route"
- "Pace variability high - focus on steady effort"

### Environmental Coaching
- "Pressure dropping 2mb - storm incoming, wrap up soon"
- "Temperature rising - watch for dehydration, take water break"
- "Altitude gain 150m - adjust pacing expectation"

### Recovery Coaching
- "Training effect 3.2 - this was a hard aerobic session"
- "Recovery time 42 hours - take 2 easy days before next hard run"
- "HR variability dropping - you're getting fatigued, consider rest day"

---

## 🔌 Implementation Status

### Currently Streaming to Phone ✅
- Heart Rate (HR)
- Cadence
- GPS (Lat/Lng/Altitude/Speed)
- Distance, Pace, Elapsed Time

### Available But Not Yet Streamed ⏳
- Ground Contact Time
- Ground Contact Balance
- Vertical Oscillation
- Vertical Ratio
- Stride Length
- Training Effect
- VO2 Max
- Respiration Rate (if available)
- Ambient Pressure
- Temperature
- Bearing
- GPS Accuracy

---

## 🚀 Next Steps to Capture All 23+ Data Points

1. **Extend Sensor.Info extraction** in watch `onSensor()` callback
2. **Extend Activity.Info queries** for running dynamics data
3. **Update PhoneLink.sendRunData()** to include all metrics
4. **Update GarminWatchManager** to parse and expose all data
5. **Update RunTrackingService** callbacks to receive all metrics
6. **Integrate with coaching engine** for real-time analysis
7. **Store complete metrics** in run summary for AI analysis

---

## 📚 References

- Garmin Activity.Info: https://developer.garmin.com/connect-iq/api-docs/Toybox/Activity/Info.html
- Garmin Sensor.Info: https://developer.garmin.com/connect-iq/api-docs/Toybox/Sensor/Info.html
- Running Dynamics: https://www.garmin.com/en-US/garmin-technology/running-science/running-dynamics/
- Heart Rate Zones: https://en.wikipedia.org/wiki/Heart_rate_zone
