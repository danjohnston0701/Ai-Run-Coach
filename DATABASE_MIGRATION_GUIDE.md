# Garmin Integration - Database Migration Guide

## 🗄️ Overview

You need to execute SQL migrations on your Neon database to add all the tables and columns required for Garmin integration. This guide walks you through the process.

---

## 📋 What Gets Created

### **14 New/Modified Database Objects**

1. ✅ **Extend `runs` table** - Add Garmin linking fields
2. ✅ **`activity_merge_log`** - Track merged activities
3. ✅ **`garmin_activity_samples`** - Store time-series GPS data
4. ✅ **Extend `garmin_wellness_metrics`** - Add all wellness fields
5. ✅ **`garmin_skin_temperature`** - Temperature tracking
6. ✅ **`garmin_blood_pressure`** - Blood pressure readings
7. ✅ **`garmin_move_iq`** - Activity classification
8. ✅ **`garmin_epochs_raw`** - Minute-by-minute data (7-day)
9. ✅ **`garmin_epochs_aggregate`** - Daily summaries (permanent)
10. ✅ **`garmin_health_snapshots`** - Multi-metric data (30-day)
11. ✅ **`webhook_failure_queue`** - Retry tracking
12. ✅ **Indexes** - For performance optimization
13. ✅ **Views** - Convenient data access
14. ✅ **Cleanup policies** - Auto-delete old data

---

## 🚀 How to Execute Migrations

### **Option 1: Neon Dashboard (Recommended for First Time)**

1. Go to [https://console.neon.tech](https://console.neon.tech)
2. Select your AiRunCoach project
3. Navigate to **SQL Editor**
4. Open `GARMIN_DATABASE_MIGRATIONS.sql`
5. Copy all content
6. Paste into Neon SQL Editor
7. Click **Execute** (or `Ctrl+Enter`)
8. Wait for completion - should see "14 statements executed"

### **Option 2: Neon CLI**

```bash
# Install Neon CLI if not already installed
npm install -g @neondatabase/cli

# Authenticate with Neon
neon auth

# Execute SQL file
neon sql < GARMIN_DATABASE_MIGRATIONS.sql

# Or execute directly from project
cat GARMIN_DATABASE_MIGRATIONS.sql | neon sql
```

### **Option 3: From Your Application**

If you're using Drizzle ORM (which you likely are), you can also run migrations through your migration system:

```bash
# If using Drizzle migrations
drizzle-kit generate:migrations

# Then apply
drizzle-kit migrate
```

### **Option 4: PostgreSQL psql Client (If you have local access)**

```bash
# Get your Neon connection string
export DATABASE_URL="postgresql://user:password@host/dbname"

# Execute the migration file
psql $DATABASE_URL < GARMIN_DATABASE_MIGRATIONS.sql
```

---

## ⚠️ Important Notes

### **Backup First**
Before running migrations on production:
```bash
# Neon automatically backs up, but you can also export data
neon export

# Or use pg_dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### **Run in Development First**
1. Create a development branch in Neon
2. Test migrations there first
3. Verify everything works
4. Then apply to production

### **Check Prerequisites**
Make sure you have:
- ✅ Access to Neon console or CLI
- ✅ Database connection string available
- ✅ Backup of existing data
- ✅ The `GARMIN_DATABASE_MIGRATIONS.sql` file

---

## 📊 Verify Migrations Succeeded

### **Check Tables Were Created**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (table_name LIKE 'garmin%' 
     OR table_name LIKE 'activity_merge%' 
     OR table_name LIKE 'webhook%')
ORDER BY table_name;
```

Expected output should show:
- `activity_merge_log`
- `garmin_activity_samples`
- `garmin_blood_pressure`
- `garmin_epochs_aggregate`
- `garmin_epochs_raw`
- `garmin_health_snapshots`
- `garmin_move_iq`
- `garmin_skin_temperature`
- `webhook_failure_queue`

### **Check Columns Were Added to runs**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'runs' 
AND column_name LIKE '%garmin%' OR column_name LIKE '%merge%'
ORDER BY column_name;
```

Expected columns:
- `garmin_activity_id`
- `garmin_summary_id`
- `activity_sub_type`
- `has_garmin_data`
- `device_name`
- `distance_garmin`
- `duration_garmin`
- `elevation_gain_garmin`
- `merge_score`
- `merge_confidence`

### **Check garmin_wellness_metrics Columns**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'garmin_wellness_metrics' 
ORDER BY column_name;
```

Should have 100+ columns covering all health metrics.

### **Check Indexes Were Created**
```sql
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
ORDER BY tablename;
```

Should see indexes on key tables for performance.

### **Check View Was Created**
```sql
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public';
```

Should include `wellness_daily_summary` view.

---

## 🔧 If Something Goes Wrong

### **Rollback Changes**
If migrations fail, you can:

1. **Revert to backup**
   ```bash
   psql $DATABASE_URL < backup_$(date +%Y%m%d).sql
   ```

2. **Or drop problematic tables** (be careful!)
   ```sql
   DROP TABLE IF EXISTS activity_merge_log CASCADE;
   DROP TABLE IF EXISTS garmin_activity_samples CASCADE;
   DROP TABLE IF EXISTS garmin_blood_pressure CASCADE;
   -- etc.
   ```

3. **Check Neon transaction history** in dashboard to see what failed

### **Common Issues**

**Issue**: "UNIQUE constraint violation"
- **Cause**: Table already exists
- **Fix**: Migrations use `IF NOT EXISTS` so this shouldn't happen

**Issue**: "Column already exists"
- **Cause**: Column was added in previous migration
- **Fix**: Migrations use `IF NOT EXISTS` so this is safe to re-run

**Issue**: "Referenced table doesn't exist"
- **Cause**: Foreign key constraint failed
- **Fix**: Ensure `users` and `runs` tables exist first

**Issue**: "Insufficient permissions"
- **Cause**: User role doesn't have CREATE permission
- **Fix**: Use superuser or admin role to run migrations

---

## 📈 Performance Considerations

### **Indexes Created**
These indexes optimize common queries:

```
Activity Merging:
- idx_runs_garmin_activity_id - Fast lookups by Garmin ID
- idx_runs_garmin_summary_id - Fast lookups by summary ID
- idx_activity_merge_log_user_id - Fast merge lookups

Wellness Queries:
- idx_garmin_wellness_user_date - Most common wellness queries
- idx_garmin_skin_temp_user_date - Temperature trends
- idx_garmin_blood_pressure_user_date - BP history

Cleanup:
- idx_garmin_epochs_raw_expires - For auto-deletion of old epochs
- idx_garmin_health_snapshots_expires - For auto-deletion of old snapshots
```

### **Storage Estimates**

For a typical user with 1 year of data:

| Table | Rows | Size |
|-------|------|------|
| activity_merge_log | 365 | ~100 KB |
| garmin_activity_samples | 365 | ~50 MB |
| garmin_wellness_metrics | 365 | ~10 MB |
| garmin_epochs_raw (7-day) | 960 | ~15 MB |
| garmin_epochs_aggregate | 365 | ~2 MB |
| garmin_health_snapshots (30-day) | 720 | ~30 MB |
| garmin_blood_pressure | 90 | ~200 KB |
| garmin_skin_temperature | 365 | ~5 MB |
| **TOTAL** | | **~115 MB** |

With cleanup policies removing old data:
- Real storage usage: **~30-40 MB per user**

---

## ✅ Post-Migration Checklist

After running migrations:

- [ ] All 14 tables/objects created successfully
- [ ] All indexes are in place
- [ ] Can query `wellness_daily_summary` view
- [ ] Verified in Neon dashboard
- [ ] Ran verification queries above
- [ ] Backup was taken
- [ ] Tested with sample data (optional)
- [ ] Ready to deploy webhook handlers

---

## 🔄 Running Migrations in CI/CD Pipeline

If you use GitHub Actions or similar:

```yaml
- name: Run Database Migrations
  run: |
    echo "${{ secrets.DATABASE_URL }}" | psql
    psql $DATABASE_URL < GARMIN_DATABASE_MIGRATIONS.sql
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## 📞 Need Help?

If you encounter issues:

1. **Check Neon dashboard** for error messages
2. **Review migration file** for syntax errors
3. **Test in development branch** first
4. **Contact Neon support** if database-level issues
5. **Check your timezone** - Neon uses UTC by default

---

## 🎉 You're All Set!

Once migrations complete successfully, your database is ready for:
- ✅ Garmin webhook processing
- ✅ Activity data storage and merging
- ✅ Wellness data aggregation
- ✅ User health insights
- ✅ Historical trend analysis

The TypeScript code we created earlier will now work seamlessly with this database schema!
