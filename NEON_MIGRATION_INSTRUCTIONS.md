# Neon Database Migration Instructions

## Overview
These migrations add support for:
1. **OAuth Security Fix** - Server-side state storage (prevents account hijacking)
2. **Garmin Webhook Monitoring** - Complete audit trail of all activities received
3. **Push Notifications** - Alert users when activities arrive or runs are enriched

## Prerequisites
- Access to your Neon PostgreSQL console
- Database: `airuncoach` (or your database name)

## Step-by-Step Instructions

### Step 1: Access Your Neon Console
1. Go to https://console.neon.tech
2. Select your project
3. Click the **SQL Editor** tab
4. Make sure you're connected to the `airuncoach` database

### Step 2: Run the Migration SQL
Copy the entire contents of `NEON_MIGRATIONS_MARCH_2026.sql` and paste into the Neon SQL editor.

**⚠️ IMPORTANT:** Run ALL statements together. They're designed to be idempotent (safe to run multiple times).

### Step 3: Verify Success
Run these verification queries:

```sql
-- Check all new tables exist
\dt oauth_state_store
\dt notifications
\dt garmin_webhook_events
\dt webhook_failure_queue

-- Count rows (should all be 0 initially)
SELECT 'oauth_state_store' as table_name, COUNT(*) as row_count FROM oauth_state_store
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'garmin_webhook_events', COUNT(*) FROM garmin_webhook_events
UNION ALL
SELECT 'webhook_failure_queue', COUNT(*) FROM webhook_failure_queue;
```

✅ **Success**: All 4 tables exist with 0 rows

### Step 4: Verify Indexes
```sql
-- List all indexes on new tables
SELECT tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('oauth_state_store', 'notifications', 'garmin_webhook_events', 'webhook_failure_queue')
ORDER BY tablename, indexname;
```

✅ **Success**: Should see 15+ indexes listed

### Step 5: Check garmin_activity_id Column
```sql
-- Verify the new column exists on runs table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'runs' 
AND column_name = 'garmin_activity_id';
```

✅ **Success**: Should see one row with `character varying` type

## What Each Table Does

### 1. oauth_state_store (Security)
Stores OAuth state server-side during Garmin authentication.

**Why**: Prevents attackers from tampering with the state parameter to connect their Garmin device to another user's account.

**Key columns**:
- `state` - Unique state ID (cannot be modified)
- `user_id` - User who initiated the auth
- `expires_at` - States expire after 10 minutes

**Sample query**:
```sql
-- See current active OAuth flows
SELECT state, user_id, provider, created_at 
FROM oauth_state_store 
WHERE expires_at > NOW() 
ORDER BY created_at DESC;
```

### 2. notifications (Alerts)
Stores push notifications and in-app alerts.

**Used for**:
- "New Garmin activity recorded!" 
- "Your run was enriched with Garmin data"
- Training plan updates
- Achievements

**Key columns**:
- `type` - Type of notification
- `read` - Whether user has seen it
- `data` - JSON with context (runId, activityId, etc.)

**Sample query**:
```sql
-- See unread notifications for a user
SELECT title, message, created_at 
FROM notifications 
WHERE user_id = 'user-123' 
AND read = false 
ORDER BY created_at DESC;

-- Mark as read
UPDATE notifications 
SET read = true 
WHERE user_id = 'user-123' AND read = false;
```

### 3. garmin_webhook_events (Monitoring)
Comprehensive audit trail of all Garmin webhook events.

**Tracks**:
- Every activity received from Garmin
- Whether it created a new run or enriched existing
- Fuzzy match scores
- Any errors that occurred
- Push notification status

**Key columns**:
- `status` - 'received', 'created_run', 'merged_run', 'failed', 'skipped'
- `match_score` - Match confidence (0-100). > 50% = enriched existing run
- `matched_run_id` - Which run was enriched
- `new_run_id` - New run created
- `raw_payload` - Full webhook data for debugging

**Sample queries**:
```sql
-- See all activities received in last 24 hours
SELECT activity_id, status, activity_type, distance_in_meters, 
       match_score, created_at 
FROM garmin_webhook_events 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- See processing stats
SELECT 
  COUNT(*) as total_received,
  SUM(CASE WHEN status = 'created_run' THEN 1 ELSE 0 END) as new_runs_created,
  SUM(CASE WHEN status = 'merged_run' THEN 1 ELSE 0 END) as runs_enriched,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
  ROUND(AVG(CASE WHEN match_score IS NOT NULL THEN match_score ELSE 0 END), 1) as avg_match_score
FROM garmin_webhook_events 
WHERE created_at > NOW() - INTERVAL '7 days';

-- See errors
SELECT activity_id, error_message, created_at 
FROM garmin_webhook_events 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 20;

-- See which users had activities processed
SELECT DISTINCT user_id, COUNT(*) as activity_count 
FROM garmin_webhook_events 
WHERE user_id IS NOT NULL 
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id 
ORDER BY activity_count DESC;
```

### 4. webhook_failure_queue (Retries)
Queues failed webhook processing for automatic retry.

**Why**: If a webhook fails (e.g., database error), it's queued for retry instead of being lost.

**Key columns**:
- `retry_count` - Number of retry attempts
- `max_retries` - Stop retrying after this many attempts
- `next_retry_at` - When to retry next

**Sample query**:
```sql
-- See failed webhooks pending retry
SELECT id, webhook_type, retry_count, max_retries, next_retry_at, error 
FROM webhook_failure_queue 
WHERE retry_count < max_retries 
AND next_retry_at <= NOW()
ORDER BY next_retry_at;

-- See all failed webhooks
SELECT webhook_type, COUNT(*) as count 
FROM webhook_failure_queue 
GROUP BY webhook_type;
```

## Monitoring Dashboard Queries

### Get Webhook Processing Stats (Last 7 Days)
```sql
SELECT 
  CASE 
    WHEN created_at > NOW() - INTERVAL '1 day' THEN 'Last 24 hours'
    WHEN created_at > NOW() - INTERVAL '7 days' THEN 'Last 7 days'
    ELSE 'Earlier'
  END as time_period,
  COUNT(*) as total_events,
  SUM(CASE WHEN status = 'created_run' THEN 1 ELSE 0 END) as new_runs,
  SUM(CASE WHEN status = 'merged_run' THEN 1 ELSE 0 END) as runs_enriched,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  ROUND(
    100.0 * SUM(CASE WHEN status IN ('created_run', 'merged_run') THEN 1 ELSE 0 END) / 
    COUNT(*), 
    1
  ) as success_rate_pct,
  ROUND(AVG(CASE WHEN match_score IS NOT NULL THEN match_score END), 1) as avg_match_score
FROM garmin_webhook_events 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY time_period
ORDER BY time_period DESC;
```

### Check Notification Delivery
```sql
SELECT 
  DATE_TRUNC('day', created_at)::date as date,
  COUNT(*) as total_notifications,
  SUM(CASE WHEN read THEN 1 ELSE 0 END) as read_count,
  SUM(CASE WHEN NOT read THEN 1 ELSE 0 END) as unread_count
FROM notifications 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', created_at)::date
ORDER BY date DESC;
```

### See Most Recent Garmin Activities Per User
```sql
SELECT 
  user_id,
  COUNT(*) as activity_count,
  MAX(created_at) as last_activity,
  ROUND(AVG(CASE WHEN match_score IS NOT NULL THEN match_score END), 1) as avg_match_score
FROM garmin_webhook_events 
WHERE user_id IS NOT NULL
AND created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id 
ORDER BY MAX(created_at) DESC;
```

## Maintenance

### Daily: Clean Up Expired OAuth States
```sql
-- Delete OAuth states that have expired
DELETE FROM oauth_state_store 
WHERE expires_at < NOW();

-- You can schedule this as a daily job in your application
```

### Weekly: Clean Up Failed Webhooks
```sql
-- Delete webhooks that exceeded max retries and are old
DELETE FROM webhook_failure_queue 
WHERE retry_count >= max_retries 
AND updated_at < NOW() - INTERVAL '7 days';
```

### Monthly: Archive Old Webhook Events
```sql
-- Optional: Move old events to archive (if you implement archiving)
-- Or just note that they can be safely deleted after 90 days
DELETE FROM garmin_webhook_events 
WHERE created_at < NOW() - INTERVAL '90 days'
AND status IN ('skipped');  -- Only delete old skipped events
```

## Troubleshooting

### Issue: "relation does not exist"
**Cause**: Migration didn't run  
**Fix**: Run the full `NEON_MIGRATIONS_MARCH_2026.sql` again

### Issue: "constraint violation" when running migrations
**Cause**: Data exists that violates new constraints  
**Fix**: Likely foreign key issue. Check if `users` table has all required rows

### Issue: Indexes not created
**Cause**: Migration ran but indexes failed  
**Fix**: Run the index creation statements manually:
```sql
CREATE INDEX idx_garmin_webhook_events_user_id ON garmin_webhook_events(user_id);
-- ... repeat for other indexes from the migration file
```

## Rollback (if needed)

If something goes wrong, you can drop the new tables:
```sql
DROP TABLE IF EXISTS garmin_webhook_events CASCADE;
DROP TABLE IF EXISTS webhook_failure_queue CASCADE;
DROP TABLE IF EXISTS oauth_state_store CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;

-- And remove the column we added
ALTER TABLE runs DROP COLUMN IF EXISTS garmin_activity_id;
```

⚠️ **WARNING**: This will delete all notification and webhook event data. Only do this if instructed.

## Next Steps

1. ✅ Run the migration SQL
2. ✅ Verify all tables exist
3. 📱 **Mobile app** will automatically use the new notification system
4. 🔔 Users will start receiving push notifications when:
   - New Garmin activities arrive
   - Existing runs are enriched with Garmin data
5. 📊 Monitor via `/api/garmin/webhook-stats` endpoint
6. 🧪 Test with `/api/garmin/webhook-test` endpoint

## Support

If you encounter any issues:
1. Check the Neon console error messages
2. Run the verification queries above
3. Check the application logs for webhook processing errors
4. Query `garmin_webhook_events` table for status details
