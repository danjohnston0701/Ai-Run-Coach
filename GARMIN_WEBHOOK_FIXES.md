# Garmin Webhook Error Fixes - March 2026

## Issues Identified in Replit Logs

### 1. ❌ CRITICAL: Missing Database Columns
```
Error: column "average_met" does not exist
```

**Root Cause**: The `garmin_epochs_aggregate` table was created incomplete without necessary columns for processing Garmin epoch data.

**Fix**: Run the SQL migration in `FIX_GARMIN_EPOCHS_COLUMNS.sql`

#### Steps:
1. Go to https://console.neon.tech
2. Open **SQL Editor**
3. Copy and run all SQL from `FIX_GARMIN_EPOCHS_COLUMNS.sql`
4. This adds:
   - `average_met`
   - `mean_motion_intensity`
   - `max_motion_intensity`
   - `min_motion_intensity`

**Expected Result**: After running, the errors will stop appearing.

---

### 2. ⚠️ WARNING: No Access Token (Non-Critical)
```
⚠️ [Garmin Webhook] Could not map dailies to user (no access token)
⚠️ [Garmin Webhook] Could not map respiration to user for date 2026-03-14
```

**Root Cause**: User's Garmin OAuth access token has expired or wasn't properly stored. The webhook can still process activities and epochs, but can't fetch detailed dailies/respiration data.

**Impact**: LOW - This is informational only. The webhook continues processing:
- ✅ Activities (running, walking, etc.)
- ✅ Epochs (1-minute granular data)
- ✅ Basic daily summaries

**Fix Options**:
1. **User can reconnect Garmin** in app settings to refresh access token
2. **Or**: Add logic to auto-refresh tokens when they expire (future enhancement)

**No database migration needed** - this is just a warning about missing auth data.

---

## Summary

| Issue | Type | Fix | Status |
|-------|------|-----|--------|
| Missing `average_met` column | ERROR | Run `FIX_GARMIN_EPOCHS_COLUMNS.sql` | **REQUIRED** |
| Respiration mapping | WARNING | Optional - user can reconnect Garmin | Optional |
| Dailies mapping | WARNING | Optional - user can reconnect Garmin | Optional |

## After Running the Migration

Verify the columns were added:
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'garmin_epochs_aggregate' 
ORDER BY ordinal_position;
```

Should see:
- ✅ average_met
- ✅ mean_motion_intensity
- ✅ max_motion_intensity
- ✅ min_motion_intensity
