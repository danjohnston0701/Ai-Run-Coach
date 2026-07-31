# Neon Database Deployment Checklist — Power Saver Mode Detection

## Summary
**No manual SQL needed.** The power saver mode detection feature is fully auto-migrated via the existing `auto-migrate.ts` system.

---

## What Changed in the Database

### New Column: `runs.power_saver_mode_detected`
- **Type**: `boolean`
- **Default**: `false`
- **Purpose**: Flags whether the phone's power saver mode was active during a run
- **Query example**: `SELECT COUNT(*) FROM runs WHERE power_saver_mode_detected = true;`

---

## Deployment Steps

### Option 1: Automatic (Recommended)
✅ **You don't need to do anything manually.**

The migration is already in `server/auto-migrate.ts` (lines 392–398):
```typescript
{
  name: "runs.power_saver_mode_detected",
  sql: "ALTER TABLE runs ADD COLUMN IF NOT EXISTS power_saver_mode_detected boolean DEFAULT false",
}
```

When you deploy the server code to production, the `runAutoMigrations()` function will:
1. Connect to your Neon database on startup
2. Execute the `ALTER TABLE` statement
3. Log success: `[AutoMigrate] ✅ runs.power_saver_mode_detected: [success]`

**This happens automatically — no manual action required.**

### Option 2: Manual (If you want to verify before deployment)
If you prefer to manually verify the schema change first:

1. **Connect to your Neon database**:
   ```bash
   psql postgresql://[user]:[password]@[host]/[database]
   ```

2. **Run the migration manually**:
   ```sql
   ALTER TABLE runs ADD COLUMN IF NOT EXISTS power_saver_mode_detected boolean DEFAULT false;
   ```

3. **Verify the column exists**:
   ```sql
   \d runs
   ```
   You should see:
   ```
   power_saver_mode_detected | boolean | DEFAULT false
   ```

---

## Verification Checklist

After deployment, verify the changes are live:

### ✅ Column Created
```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'runs' AND column_name = 'power_saver_mode_detected';
```

Expected output:
```
      column_name      | data_type | column_default
-----------------------+-----------+----------------
power_saver_mode_detected | boolean   | false
```

### ✅ Auto-migration Ran Successfully
Check server logs for:
```
[AutoMigrate] Done — X succeeded, Y skipped/warned
```

The `runs.power_saver_mode_detected` migration should be in the `succeeded` count.

### ✅ New Runs Are Captured
After deployment, start a test run with power saver enabled:
```sql
SELECT id, power_saver_mode_detected, distance, started_at 
FROM runs 
ORDER BY created_at DESC 
LIMIT 5;
```

If power saver was active, you'll see `power_saver_mode_detected = true`.

---

## Rollback (If Needed)

If you need to rollback, you can safely drop the column (optional — it's harmless to leave):

```sql
ALTER TABLE runs DROP COLUMN IF EXISTS power_saver_mode_detected;
```

But this is **not necessary** — the column is nullable and defaults to `false`, so it won't affect existing queries.

---

## Schema Files Involved

| File | Change | Type |
|------|--------|------|
| `server/auto-migrate.ts` | Added migration entry | TypeScript |
| `shared/schema.ts` | Added Drizzle column definition | TypeScript |
| `migrations/add_power_saver_mode_detection.sql` | Created SQL file (reference only, not auto-executed) | SQL |

---

## Code Changes That Depend on This Column

| Component | File | Change |
|-----------|------|--------|
| Android App | `UploadRunRequest.kt` | Added `powerSaverModeDetected` field |
| Server Routes | `server/routes.ts` | Added field to `storage.createRun()` call |
| TypeScript Schema | `shared/schema.ts` | Added column definition |

---

## No Other Database Changes Needed

✅ **No indexes** — The column is rarely queried; if you add filtering later, add an index then.

✅ **No triggers** — Auto-migration handles the default value.

✅ **No views** — Existing views/queries are unaffected (new column is optional, defaults to false).

✅ **No data migration** — Existing runs are unaffected (null becomes false for backwards compatibility).

---

## Timeline

1. **Before Deployment**: Schema files are updated
2. **On Server Startup**: Auto-migration runs, column is created
3. **Immediately After**: Android app can start uploading `powerSaverModeDetected` flag
4. **First Power Saver Run**: Column is populated with the flag

---

## FAQ

**Q: Do I need to run any manual SQL?**
A: No. The auto-migration system handles it automatically on server startup.

**Q: What if the column already exists?**
A: The migration uses `IF NOT EXISTS`, so it's idempotent and safe to run repeatedly.

**Q: Will this affect existing runs?**
A: No. Existing runs will have `power_saver_mode_detected = false` (the default).

**Q: Can I query runs with power saver active?**
A: Yes! After the first run with power saver enabled:
```sql
SELECT id, distance, avg_pace, power_saver_mode_detected 
FROM runs 
WHERE power_saver_mode_detected = true 
ORDER BY created_at DESC;
```

**Q: When will data start flowing into this column?**
A: Once the server is deployed and the first run with power saver active completes.

---

## Next Steps

1. **Deploy the server code** (includes `auto-migrate.ts` changes)
2. **Verify in logs** that the migration ran successfully
3. **Test with a power saver run** to confirm data is captured
4. **Optional: Add to analytics dashboard** to track how often power saver impacts runs

---

**Deployment Status**: ✅ Ready to deploy  
**Manual SQL Required**: ❌ No  
**Rollback Risk**: ✅ Very low (column is additive, non-breaking)
