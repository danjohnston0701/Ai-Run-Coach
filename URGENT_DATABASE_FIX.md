# URGENT: Database Table Fix

## 🚨 Issues
Multiple cascading PostgreSQL errors (code 42703):
```
column "activity_sub_type" does not exist
column "avg_push_cadence" does not exist  
column "pushes" does not exist
column "user_id" does not exist (in webhook_failure_queue)
```

**Root Cause**: The `garmin_activities` table is missing 65 columns that are defined in the schema.

## ✅ Solution (Choose ONE approach)

### **OPTION 1: Recommended - Full Table Initialization** ⭐
**Use this if the garmin_activities table seems broken or incomplete.**

1. Go to [Neon Console](https://console.neon.tech)
2. Open SQL Editor
3. **Copy and paste ENTIRE content** of `INITIALIZE_GARMIN_ACTIVITIES.sql`
4. Click **Execute**
5. ✅ Done! Table will be created/initialized with all 65 columns

**Advantages:**
- Creates a clean, complete table from scratch
- Ensures proper structure and indexes
- No partial/broken columns
- Fastest for completely broken tables

### **OPTION 2: Additive Fix** 
**Use this if the garmin_activities table exists but is missing some columns.**

1. Go to [Neon Console](https://console.neon.tech)
2. Open SQL Editor
3. **Copy and paste ENTIRE content** of `FIX_MISSING_COLUMNS.sql`
4. Click **Execute**
5. ✅ Done! Missing columns will be added

**Advantages:**
- Non-destructive (doesn't recreate table)
- Preserves existing data if any
- Works if table structure is mostly correct

## 🎯 What Gets Fixed

### garmin_activities table (65 columns):
- ✅ Core identity: garmin_activity_id, user_id, run_id
- ✅ Activity info: name, type, subtype, event_type
- ✅ Heart rate: average, max, zone data
- ✅ Speed/Pace: average, max, average pace
- ✅ Power: average, max, normalized
- ✅ Running dynamics: cadence, stride, ground contact, oscillation
- ✅ Elevation: coordinates, gain/loss, min/max
- ✅ Calories: active, device active, BMR
- ✅ Training effect: aerobic, anaerobic, label
- ✅ Recovery: VO2 Max, lactate threshold, recovery time
- ✅ Time series: laps, splits, samples (GPS/HR/pace)
- ✅ Environmental: temperature data
- ✅ Wheelchair: push cadence, pushes
- ✅ Metadata: raw_data, timestamps

### Other tables:
- ✅ `runs`: created_at, updated_at
- ✅ `connected_devices`: updated_at, granted_scopes
- ✅ `webhook_failure_queue`: user_id, endpoint, retry tracking

## ✅ After Migration

1. Try generating AI Analysis again - it should work!
2. If you get different column errors, run the other script
3. Both scripts are idempotent (safe to run multiple times)

## 🔍 Root Cause

The database migrations had incomplete/missing definitions:
- Columns defined in `shared/schema.ts` but never added to actual database
- Drizzle ORM can't create the table properly on its own
- PostgreSQL throws error 42703 when querying non-existent columns

## 🛡️ Prevention Going Forward

1. Define all columns in `shared/schema.ts` ✅
2. Add them to migration SQL files **immediately** 🔴 (was missing)
3. Run migrations in Neon before deploying ✅
4. Test endpoints that use new columns ✅

## 📞 If Migration Fails

Check the error:
- `already exists` = Fine! (IF NOT EXISTS makes it safe)
- `table does not exist` = Wrong table name (check SQL)
- `REFERENCES` error = Foreign key issue (ensure referenced table exists)
- Other errors = Check Neon logs or try the other script
