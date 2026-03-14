# URGENT: Missing Database Columns Fix

## 🚨 Issue
The comprehensive analysis endpoint is failing with:
```
error: column "activity_sub_type" does not exist
```

This is because columns were defined in `shared/schema.ts` but never added to the actual Neon database.

## ✅ Solution

### Step 1: Run Migration in Neon
1. Go to [Neon Console](https://console.neon.tech)
2. Open SQL Editor
3. **Copy and paste the ENTIRE content** of `FIX_MISSING_COLUMNS.sql`
4. Click **Execute**
5. Wait for completion (should be instant)

### Step 2: What Gets Fixed
This migration adds all missing columns:

| Column | Table | Purpose |
|--------|-------|---------|
| `activity_sub_type` | `garmin_activities` | Stores MoveIQ activity classification (e.g., Hurdles, Intervals) |
| `created_at` | `runs` | Timestamp when run record was created |
| `updated_at` | `runs` | Timestamp when run was last modified |
| `updated_at` | `connected_devices` | Track when device permissions changed |
| `granted_scopes` | `connected_devices` | Store OAuth scopes user granted |

### Step 3: Verify Success
After running the migration, try generating AI Analysis again. It should now work!

## 🔍 Root Cause
The database migrations (GARMIN_DATABASE_MIGRATIONS.sql, GARMIN_PERMISSIONS_MIGRATIONS.sql) had incomplete definitions:
- Some columns were defined in Drizzle schema but never added to migrations
- When Drizzle tried to query these columns, they didn't exist in the database
- This caused a PostgreSQL error: `column does not exist (42703)`

## 🛡️ Prevention
Going forward, always:
1. Define columns in `shared/schema.ts`
2. **Immediately** add them to migration SQL files
3. Run migrations in Neon before deploying
4. Test the endpoint that uses the new columns

## 📞 Need Help?
If the migration fails, check the error message for:
- `already exists` = Column already added (no problem, migration is idempotent with IF NOT EXISTS)
- `table does not exist` = Wrong table name
- Other errors = Check Neon logs
