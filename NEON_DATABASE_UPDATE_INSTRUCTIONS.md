# 🗄️ Neon Database Migration: Running Power & Respiration Metrics

## Quick Start

**Two files to run in Neon:**

1. **SQL Migration** (adds columns to existing tables):
   ```
   NEON_MIGRATION_RUNNING_POWER_RESPIRATION.sql
   ```

2. **Update Drizzle ORM schema** (keeps code in sync):
   ```
   shared/schema.ts (already updated)
   ```

---

## What's Being Added

### New Columns in `runs` Table

```sql
-- Average and peak running power (watts)
avg_running_power INTEGER          -- null on unsupported watches
max_running_power INTEGER          -- null on unsupported watches
running_power_data JSONB           -- time-series: [watts, watts, ...]

-- Average respiration rate (breaths per minute)
avg_respiration_rate REAL          -- null on unsupported watches
respiration_rate_data JSONB        -- time-series: [breaths/min, breaths/min, ...]
```

### New Columns in `watch_biometric_samples` Table

```sql
-- Per-sample power and respiration (one row per 2 seconds of activity)
running_power INTEGER              -- watts for this sample
respiration_rate REAL              -- breaths/min for this sample
```

---

## Why These Columns?

### Running Power (watts)
- **Available on**: Fenix 7+, Fenix 8, FR965, FR245M+ (with app)
- **Null on**: FR945, older models
- **Use cases**:
  - Efficiency analysis: same power at faster pace = improving
  - Training load: higher power at target pace = harder session
  - Individual baseline: personalized thresholds (not hardcoded)
  - Coaching: "12% more efficient today"
  - Post-run graphs: power curve visualization

### Respiration Rate (breaths/min)
- **Available on**: Fenix 7, Fenix 7X, Fenix 8, FR965
- **Null on**: FR945, older models
- **Use cases**:
  - Intensity detection: RR 38 = easy, RR 55 = threshold
  - Breathing coaching: "Respiration matched intensity perfectly"
  - Form analysis: abnormal RR may indicate over-exertion
  - Recovery guidance: RR trends show fatigue level
  - Biofeedback: runners can monitor breathing during run

---

## Implementation Details

### Migration Strategy

1. **Nullable columns** — No data loss, safe to add to production
2. **Time-series JSONB** — Stores per-2-second samples for graphing
3. **Indexes on averages** — Fast queries for post-run analysis, user cohort analysis
4. **Backward compatible** — Existing runs have NULL, new data populates as uploaded

### Data Flow

```
Garmin Watch (Fenix 7+, FR965)
    ↓
Activity.Info.currentPower, currentRespirationRate
    ↓
RunView.mc (reads into _power, _respRate variables)
    ↓
PhoneLink.sendRunData() / DataStreamer.sendData()
    ↓
WatchBiometricFrame.runningPower, respirationRate
    ↓
RunTrackingService (accumulates + averages)
    ↓
RunSession { avgRunningPower, maxRunningPower, avgRespirationRate }
    ↓
UploadRunRequest → POST /api/runs
    ↓
Neon:
  - runs.avg_running_power ✓
  - runs.max_running_power ✓
  - runs.avg_respiration_rate ✓
  - watch_biometric_samples.running_power ✓
  - watch_biometric_samples.respiration_rate ✓
```

---

## Running the Migration

### Step 1: Execute SQL in Neon Console

Copy and paste the entire contents of:
```
NEON_MIGRATION_RUNNING_POWER_RESPIRATION.sql
```

Into the Neon SQL editor and run it. Expected output:
```
ALTER TABLE
ALTER TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
```

### Step 2: Verify in Neon

Run these verification queries:

```sql
-- Verify new columns exist in runs table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'runs'
AND column_name IN ('avg_running_power', 'max_running_power', 'running_power_data',
                    'avg_respiration_rate', 'respiration_rate_data')
ORDER BY column_name;
```

Expected output:
```
column_name              | data_type | is_nullable
------------------------+-----------+------------
avg_respiration_rate     | numeric   | YES
avg_running_power        | integer   | YES
max_running_power        | integer   | YES
respiration_rate_data    | jsonb     | YES
running_power_data       | jsonb     | YES
```

```sql
-- Verify new columns exist in watch_biometric_samples table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'watch_biometric_samples'
AND column_name IN ('running_power', 'respiration_rate')
ORDER BY column_name;
```

Expected output:
```
column_name      | data_type | is_nullable
-----------------+-----------+------------
respiration_rate | numeric   | YES
running_power    | integer   | YES
```

### Step 3: Check Indexes

```sql
-- Verify indexes were created
SELECT indexname
FROM pg_indexes
WHERE tablename = 'runs'
AND indexname LIKE 'idx_runs_avg%'
ORDER BY indexname;
```

Expected output:
```
indexname
----------------------------------
idx_runs_avg_respiration_rate
idx_runs_avg_running_power
idx_watch_biometrics_running_power
```

---

## Code Changes (Already Done)

### 1. Drizzle ORM Schema (`shared/schema.ts`)

✅ **Already updated** with:
- `avgRunningPower`, `maxRunningPower`, `runningPowerData` in `runs` table
- `avgRespirationRate`, `respirationRateData` in `runs` table
- `runningPower`, `respirationRate` in `watch_biometric_samples` table

### 2. API Types (Backend)

The backend `UploadRunRequest` already includes:
```typescript
avgRunningPower?: number;
maxRunningPower?: number;
avgRespirationRate?: number;
```

### 3. Android Models

The Android `RunSession` model already has:
```kotlin
val avgRunningPower: Int? = null
val maxRunningPower: Int? = null
val avgRespirationRate: Float? = null
val runningPowerData: List<Int>? = null
val respirationRateData: List<Float>? = null
```

---

## Querying the New Data

### Post-Run Analytics

```sql
-- Find runs with power data to analyze efficiency trends
SELECT 
  id,
  user_id,
  distance,
  avg_running_power,
  max_running_power,
  ROUND(distance / NULLIF(avg_running_power, 0), 2) as efficiency_ratio
FROM runs
WHERE avg_running_power IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### Respiration Pattern Analysis

```sql
-- Find runs by respiration profile (easy, tempo, hard sessions)
SELECT 
  id,
  user_id,
  distance,
  ROUND(avg_respiration_rate::numeric, 1) as avg_rr,
  CASE 
    WHEN avg_respiration_rate < 38 THEN 'Easy'
    WHEN avg_respiration_rate < 45 THEN 'Steady'
    WHEN avg_respiration_rate < 53 THEN 'Tempo'
    WHEN avg_respiration_rate < 60 THEN 'Threshold'
    ELSE 'VO2 Max'
  END as intensity_level
FROM runs
WHERE avg_respiration_rate IS NOT NULL
ORDER BY created_at DESC;
```

### Biometric Sample Analysis

```sql
-- Find power drops during runs (fatigue indicator)
SELECT 
  run_id,
  user_id,
  MIN(running_power) as min_power,
  MAX(running_power) as max_power,
  ROUND(MAX(running_power)::numeric / NULLIF(MIN(running_power), 0), 2) as power_ratio
FROM watch_biometric_samples
WHERE running_power IS NOT NULL
GROUP BY run_id, user_id
HAVING MAX(running_power) IS NOT NULL
ORDER BY power_ratio DESC;
```

---

## Timeline

| When | What | Status |
|------|------|--------|
| Now | Run SQL migration in Neon | ⏳ You need to do this |
| Now | Verify columns exist | ⏳ You need to do this |
| After next build | Android app uploads runs with power/respiration | ✅ Ready |
| After next backend deploy | API stores power/respiration in DB | ✅ Ready |
| UI update (later) | Post-run graphs display power/respiration curves | 📋 Planned |

---

## Troubleshooting

### Column Already Exists Error

```
ERROR: column "avg_running_power" of relation "runs" already exists
```

**Solution**: This is fine! It means the migration was already applied. The `IF NOT EXISTS` clause prevents errors.

### Data Not Appearing After Upload

1. **Verify migration ran** — Check if columns exist (see Verify section above)
2. **Check watch data** — Not all watches support power/respiration:
   - ✅ Fenix 7/7X, Fenix 8, FR965 → have power & respiration
   - ⚠️ FR945 → no power, no respiration
   - ❌ Older models → neither
3. **Rebuild app** — Make sure you're using the latest APK with new data capture
4. **Monitor uploads** — Check backend logs for `UploadRunRequest` payload

### NULL Values Are Normal

Existing runs in the database will have NULL for these columns. That's expected.

---

## No Further Action Needed

✅ **SQL Migration File**: `NEON_MIGRATION_RUNNING_POWER_RESPIRATION.sql`
✅ **Drizzle Schema**: Already updated in `shared/schema.ts`
✅ **Backend API**: Already supports new fields
✅ **Android App**: Already captures and sends new metrics

**Just run the SQL migration above in Neon and you're done!**

---

## Questions?

- **Power/respiration not appearing after upload?** Check if your watch model supports it (Fenix 7+, FR965 only)
- **Need to add more columns later?** Use the same pattern: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
- **Want to backfill old data?** Neon provides webhook sync from Garmin Connect if you have a Garmin developer account

---

**Status**: ✅ Ready to deploy. Just run the SQL! 🚀
