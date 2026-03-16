# Garmin Sync Error Fix - Missing active_time_in_seconds Column

## Problem
The Garmin sync scheduler is failing with this error:
```
[Scheduler] Failed to sync Garmin for user {userId}: column "active_time_in_seconds" does not exist
```

This occurs because the code is trying to insert data into the `active_time_in_seconds` column of the `garmin_epochs_raw` table, but that column hasn't been created in the database.

## Root Cause
The `active_time_in_seconds` column is defined in the Drizzle ORM schema (`shared/schema.ts` line 751), but the corresponding database migration was never applied to Neon PostgreSQL.

## Solution

### Step 1: Run the Migration in Neon

Go to your **Neon SQL Editor** console and run the migration file:
**`ADD_ACTIVE_TIME_TO_EPOCHS.sql`**

This will add two columns:
1. **`active_time_in_seconds`** to `garmin_epochs_raw` table
2. **`total_active_time_in_seconds`** to `garmin_epochs_aggregate` table

### Step 2: Verify the Migration

Run this query in Neon to verify the columns were created:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('garmin_epochs_raw', 'garmin_epochs_aggregate')
  AND column_name LIKE '%active_time%'
ORDER BY table_name, ordinal_position;
```

**Expected output:**
```
active_time_in_seconds          | integer
total_active_time_in_seconds    | integer
```

### Step 3: Restart the Scheduler

After running the migration:
1. Restart the backend server (in Replit or your deployment)
2. The Garmin sync scheduler will automatically retry failed syncs
3. Monitor the logs for successful sync completion

You should see:
```
[Scheduler] Garmin sync completed: X successful, 0 failed
```

## What These Columns Track

- **`active_time_in_seconds`** (garmin_epochs_raw): The actual time spent in activity within each 1-minute epoch, excluding pauses or breaks
- **`total_active_time_in_seconds`** (garmin_epochs_aggregate): Sum of active time across all epochs for a given day

## Why This Happened

The schema was updated to include Garmin epoch data processing, but:
1. The database migration script wasn't created initially
2. The columns were added to the ORM schema but not to Neon
3. When the scheduler tried to process epoch data, it failed

## File Locations

- **Schema definition**: `shared/schema.ts` (lines 751, 800)
- **Migration script**: `ADD_ACTIVE_TIME_TO_EPOCHS.sql` (new file)
- **Error location**: Server scheduler processing Garmin wellness data

## Prevention

All future schema changes should:
1. Update `shared/schema.ts` (Drizzle ORM definition)
2. Create corresponding `.sql` migration files
3. Document in `README.md` which migrations need to be applied

This ensures the database stays in sync with the application code.
