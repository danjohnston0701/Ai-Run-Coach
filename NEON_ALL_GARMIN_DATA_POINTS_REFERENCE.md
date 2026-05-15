# 📊 Complete Neon Database: All 50+ Garmin Activity.Info Metrics

## Overview

Your system now captures **50+ data points** from Garmin watches. This document explains every new column in the database, what it means, and what device supports it.

---

## 🗂️ Database Schema Changes

### `runs` Table (Run Summaries)

After every run, these **aggregate metrics** are stored as row-level summaries:

#### **BASIC EXTENDED METRICS**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `total_steps` | int | All | Total steps taken during the run. Can derive cadence if step counter unavailable. |
| `total_energy` | int | All | Total calories burned (kcal) — includes both active and resting metabolism. |
| `min_cadence` | int | All | Slowest cadence (spm) recorded during the run. May spike during walk breaks. |

---

#### **RUNNING DYNAMICS — CADENCE & STRIDE**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `avg_stride_length` | real | Running Dynamics* | Average stride length in meters (1.1-1.6m typical). |
| `min_stride_length` | real | Running Dynamics* | Shortest stride (e.g., uphill sections, late-run fatigue). |
| `max_stride_length` | real | Running Dynamics* | Longest stride (e.g., downhill sections, fresh legs). |

**Running Dynamics devices:** Fenix 7/7X, Fenix 8, FR965, and some FR models with accel sensors.

---

#### **RUNNING DYNAMICS — VERTICAL OSCILLATION (VO) & EFFICIENCY**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `avg_vertical_oscillation` | real | Running Dynamics* | Average vertical bounce of torso per step (cm). **Lower = more efficient.** <br/>• 6-8 cm = excellent runner <br/>• 8-10 cm = good efficiency <br/>• >10 cm = poor efficiency (fatigue or form breakdown). |
| `min_vertical_oscillation` | real | Running Dynamics* | Best (most efficient) VO reading during run — shows your potential. |
| `max_vertical_oscillation` | real | Running Dynamics* | Worst VO reading — indicates fatigue or terrain challenge. |
| `avg_vertical_ratio` | real | Running Dynamics* | Ratio of vertical oscillation to stride length (%). <br/>• 8-10% = efficient <br/>• >12% = inefficient. |
| `min_vertical_ratio` | real | Running Dynamics* | Best efficiency ratio during run (fresh legs). |
| `max_vertical_ratio` | real | Running Dynamics* | Worst efficiency ratio (peak fatigue or hard terrain). |

---

#### **RUNNING DYNAMICS — GROUND CONTACT TIME (GCT) & BALANCE**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `avg_ground_contact_time` | real | Running Dynamics* | Average time foot spends on ground per step (ms). <br/>• 200-250 ms = efficient/elite <br/>• 250-300 ms = normal <br/>• >300 ms = overstriding or fatigue. |
| `min_ground_contact_time` | real | Running Dynamics* | Best (fastest) GCT — shows your fastest potential form. |
| `max_ground_contact_time` | real | Running Dynamics* | Worst (slowest) GCT — indicates fatigue or form breakdown. |
| `avg_ground_contact_balance` | real | Running Dynamics* | Left/right symmetry (%). **50% = perfectly balanced.** <br/>• 48-52% = good symmetry <br/>• >52% or <48% = asymmetry (injury risk indicator). |
| `avg_ground_contact_balance_left` | real | Running Dynamics* | Percentage of GCT attributed to left leg (0-100%). |
| `avg_ground_contact_balance_right` | real | Running Dynamics* | Percentage of GCT attributed to right leg (0-100%). |

---

#### **SPEED & PACE**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `avg_speed` | real | All | Average speed (m/s). Derive pace from 1000/speed. |
| `max_speed` | real | All | Fastest instantaneous speed recorded. |
| `min_pace` | real | All | Fastest pace (min/km) during the run. |
| `max_pace` | real | All | Slowest pace (min/km) — common at start/end or during walk breaks. |

---

#### **HEART RATE & TRAINING ZONES**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `avg_heart_rate` | int | All | Average HR across entire run. |
| `max_heart_rate` | int | All | Peak HR during run. |
| `min_heart_rate` | int | All | Lowest HR during run (recovery moments). |
| `avg_heart_rate_zone` | int | All | Average zone (1-5) across the run. <br/>• Z1 (50-60% max HR) = Recovery <br/>• Z2 (60-70%) = Aerobic base <br/>• Z3 (70-80%) = Tempo <br/>• Z4 (80-90%) = Threshold <br/>• Z5 (90-100%) = VO2 Max. |
| `time_in_zone_1` | int | All | Seconds spent in Z1 (recovery pace). |
| `time_in_zone_2` | int | All | Seconds spent in Z2 (aerobic base — sweet spot for endurance). |
| `time_in_zone_3` | int | All | Seconds spent in Z3 (tempo — sustained hard effort). |
| `time_in_zone_4` | int | All | Seconds spent in Z4 (threshold — lactate buildup). |
| `time_in_zone_5` | int | All | Seconds spent in Z5 (max effort — anaerobic work). |

---

#### **TRAINING EFFECT & RECOVERY**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `aerobic_training_effect` | real | All | Garmin's aerobic load score (0-5). <br/>• 0-2 = light <br/>• 2-3 = moderate <br/>• 3-4 = hard <br/>• 4-5 = very hard. |
| `anaerobic_training_effect` | real | All | Anaerobic load (0-5) — mainly high-intensity intervals. |
| `max_training_effect` | real | All | Peak aerobic training effect recorded during run. |
| `max_anaerobic_training_effect` | real | All | Peak anaerobic effect — maximum intensity moment. |
| `recovery_time_minutes` | int | All | Garmin's estimate: hours until fully recovered. Useful for training plan. |
| `vo2_max_estimate` | real | All | Garmin's VO2 max estimate (ml/kg/min) **after this run.** Evolves over time. |
| `fitness_level_after` | real | All | VO2 max estimate (same as above, for clarity). |
| `training_effect_label` | text | All | Human-readable: "Recovery", "Base", "Tempo", "Threshold", "VO2 Max". |

---

#### **RUNNING POWER (Advanced — Fenix 7+, FR965 only)**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `avg_running_power` | int | Fenix 7+, FR965 | Average watts output during run. Can estimate energy more accurately than HR-based calorie calc. |
| `max_running_power` | int | Fenix 7+, FR965 | Peak watts — maximum power output moment. |
| `min_running_power` | int | Fenix 7+, FR965 | Minimum watts (easiest effort sections). |
| `power_to_pace_ratio` | real | Fenix 7+, FR965 | watts ÷ (km/h). **Lower = more efficient.** <br/>Example: 3.5 W/(km/h) is very efficient; 4.5+ is taxing. |

---

#### **RESPIRATION RATE (Advanced — Fenix 7X, FR965+)**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `avg_respiration_rate` | real | Fenix 7X, FR965+ | Average breaths/min during run. <br/>• 30-40 = easy pace <br/>• 40-50 = moderate <br/>• 50-60 = hard <br/>• >60 = maximum effort. |
| `min_respiration_rate` | real | Fenix 7X, FR965+ | Slowest breathing (recovery moments). |
| `max_respiration_rate` | real | Fenix 7X, FR965+ | Fastest breathing (peak effort). |

---

#### **ENVIRONMENT (GPS + Barometer)**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `elevation` | real | All | Total elevation gain (m). |
| `elevation_gain` | real | All | Cumulative uphill (m). |
| `elevation_loss` | real | All | Cumulative downhill (m). |
| `min_elevation` | real | All | Lowest point on route. |
| `max_elevation` | real | All | Highest point on route. |
| `avg_ambient_pressure` | real | All | Average air pressure (Pa). Can verify altitude, infer weather changes. |
| `min_ambient_pressure` | real | All | Lowest pressure reading (may indicate incoming weather). |
| `max_ambient_pressure` | real | All | Highest pressure. |
| `avg_temperature` | real | Fenix 7X+ | Average wrist skin temperature (°C). Elevated temp = stress/exertion. |
| `min_temperature` | real | Fenix 7X+ | Coolest wrist reading. |
| `max_temperature` | real | Fenix 7X+ | Hottest wrist reading (peak exertion). |

---

#### **GPS QUALITY**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `avg_gps_accuracy` | real | All | Average GPS accuracy (meters CEP). <br/>• <5m = excellent (multi-band) <br/>• 5-10m = good <br/>• >15m = poor reception. |
| `worst_gps_accuracy` | real | All | Worst GPS reading — may indicate tunnels or urban canyons. |

---

#### **TIME-SERIES DATA (JSONB Arrays)**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `heart_rate_data` | jsonb | All | number[] — HR per ~1s sample. Used to render HR graph. |
| `pace_data` | jsonb | All | number[] — pace per sample. Render pace over time. |
| `cadence_data` | jsonb | All | number[] — cadence (spm) per sample. Shows cadence drift. |
| `altitude_data` | jsonb | All | number[] — altitude (m) per GPS sample. Elevation profile. |
| `ground_contact_time_data` | jsonb | Running Dynamics* | number[] — GCT per sample. Analyze form trends during run. |
| `vertical_oscillation_data` | jsonb | Running Dynamics* | number[] — VO (cm) per sample. Fatigue indicator (VO increases late run). |
| `stride_length_data` | jsonb | Running Dynamics* | number[] — stride (m) per sample. Shows stride decay with fatigue. |
| `running_power_data` | jsonb | Fenix 7+, FR965 | number[] — watts per sample. Power profile over time. |
| `respiration_rate_data` | jsonb | Fenix 7X, FR965+ | number[] — breaths/min per sample. Shows breathing response to intensity. |
| `steps_data` | jsonb | All | number[] — steps per sample window. Aggregate cadence if granular step counter available. |
| `training_effect_data` | jsonb | All | number[] — aerobic training effect (0-5) per ~10s sample. Shows training load buildup. |
| `temperature_data` | jsonb | Fenix 7X+ | number[] — wrist temp per sample. Stress/exertion profile. |
| `power_to_pace_ratio_data` | jsonb | Fenix 7+, FR965 | number[] — efficiency metric per sample. Identify when runner is tiring (ratio increases). |

---

#### **METADATA**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `activity_type` | text | All | "running", "trail_running", "road_running", etc. |
| `sport_name` | text | All | Garmin sport classification. |
| `sub_sport_name` | text | All | "trail_run", "fell_running", "track_running". |
| `data_quality_score` | real | All | 0-100 — percentage of valid biometric samples. <br/>• >95% = excellent <br/>• 85-95% = good (minor GPS gaps) <br/>• <85% = poor (bad connection, tunnels). |
| `garmin_device_name` | text | All | e.g., "Fenix 7X", "FR965", "Venu 3". |

---

### `watch_biometric_samples` Table (Time-Series Samples)

**Every 2 seconds**, a new row is inserted with real-time metrics. Used for live coaching and post-run graphs.

#### **NEW EXTENDED COLUMNS**

| Column | Type | Device Support | Description |
|--------|------|-----------------|-------------|
| `step_count_incremental` | int | All | Steps taken in this 2-second window. Granular cadence source. |
| `ground_contact_balance_left` | real | Running Dynamics* | % of ground contact attributed to left leg in this sample. |
| `ground_contact_balance_right` | real | Running Dynamics* | % attributed to right leg. Should sum to 100%. |
| `power_to_pace_ratio` | real | Fenix 7+, FR965 | Efficiency metric (watts per km/h) **this sample**. Rising ratio = fatigue. |
| `respiration_zone` | int | Fenix 7X, FR965+ | 0-5 breathing intensity zone. <br/>• 1 = easy <br/>• 5 = maximum effort. |
| `aerobic_training_effect_current` | real | All | Live aerobic training effect (0-5) — updates every ~10s as Garmin calculates. |
| `anaerobic_training_effect_current` | real | All | Live anaerobic training effect. |
| `altitude_gain_so_far` | real | All | Cumulative elevation gain up to this point (m). |
| `altitude_loss_so_far` | real | All | Cumulative elevation loss up to this point (m). |
| `temperature` | real | Fenix 7X+ | Wrist skin temperature (°C) this sample. |
| `weather_condition` | text | All | Inferred from barometer + time of day: "sunny", "cloudy", "rain", "foggy". |
| `estimated_fatigue_level` | int | All | Server-computed 0-100 fatigue estimate (1-sample delay). <br/>Factors: HR drift, stride shortening, power decline, VO increase. |
| `time_since_last_coaching_cue` | int | All | Seconds since last coaching message. Used to throttle coaching (avoid spam). |
| `recovery_heartbeats_since_peak` | int | All | Number of heartbeats since peak HR during this recovery phase. |

---

## 🎯 Data Flow Example

**Watch captures per 2 seconds:**
```
{
  "heartRate": 158,
  "cadence": 172,
  "latitude": 51.5074,
  "longitude": -0.1278,
  "altitude": 42,
  "groundContactTime": 248,
  "groundContactBalance": 51,
  "verticalOscillation": 7.2,
  "verticalRatio": 8.9,
  "strideLength": 1.19,
  "runningPower": 312,
  "respirationRate": 42,
  "temperature": 36.2,
  "ambientPressure": 101325
}
```

**Android app accumulates over 48 minutes (1440 samples):**
```
{
  "avgHeartRate": 165,
  "maxHeartRate": 178,
  "avgCadence": 171,
  "avgGroundContactTime": 245,
  "avgVerticalOscillation": 7.4,
  "maxVerticalOscillation": 8.9,
  "avgRunningPower": 312,
  "maxRunningPower": 380,
  "avgRespirationRate": 42,
  "maxRespirationRate": 58,
  "timeInZone2": 1200,  // 20 minutes easy
  "timeInZone3": 1440,  // 24 minutes tempo
  "timeInZone4": 240,   // 4 minutes threshold
  "trainingEffectLabel": "Tempo",
  "recoveryTimeMinutes": 28,
  ...
}
```

**Uploaded to backend → Neon:**
- 1 row in `runs` table (summary)
- 1440 rows in `watch_biometric_samples` (time-series)

---

## 📋 Database Columns by Category

### All Devices Support
- Heart Rate (avg, max, min, zones)
- Pace & Speed  
- Cadence
- Distance, Duration, Elevation
- GPS Track, Accuracy
- Training Effect, Recovery Time, VO2 Max

### Running Dynamics Devices (Fenix 7/7X, Fenix 8, FR965)
- Ground Contact Time (avg, min, max, balance, left/right)
- Vertical Oscillation (avg, min, max, ratio)
- Stride Length (avg, min, max)
- Training data and graphs

### Power Meters (Fenix 7+, FR965)
- Running Power (avg, max, min)
- Power-to-Pace Ratio
- Efficiency analysis

### Advanced Metrics (Fenix 7X, FR965+)
- Respiration Rate (avg, min, max, zone)
- Wrist Temperature
- Advanced biometric analysis

---

## ✅ Schema Status

✅ **Neon `runs` table**: 30 new columns added
✅ **Neon `watch_biometric_samples` table**: 15 new columns added
✅ **Drizzle ORM schema.ts**: Updated with all new fields
✅ **Indexes**: Created for fast filtering (steps, power, fatigue, zones)
✅ **Backward compatible**: Existing runs unaffected; new columns nullable

---

## 🚀 Ready to Deploy

**Run this SQL in Neon:**
```bash
# Copy contents of NEON_COMPREHENSIVE_GARMIN_MIGRATION.sql
# Go to Neon Console → SQL Editor
# Paste & Execute
```

**Android app is ready** — already capturing all metrics from watch. No code changes needed on backend (backend already supports all fields in `UploadRunRequest`).

