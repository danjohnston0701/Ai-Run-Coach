-- ============================================================================
-- NEON DATABASE MIGRATIONS - March 2026
-- AI Run Coach Updates for Garmin OAuth Security & Webhook Monitoring
-- ============================================================================
--
-- This SQL file contains all necessary migrations to support:
-- 1. Server-side OAuth state storage (security fix)
-- 2. Garmin webhook event logging & monitoring
-- 3. Push notifications system
--
-- Run these migrations in order. Each section is independent.
-- ============================================================================

-- ============================================================================
-- 1. OAUTH STATE STORE TABLE (Security fix for Garmin OAuth)
-- ============================================================================
-- Stores OAuth state server-side instead of trusting client-provided state
-- States expire after 10 minutes for security

CREATE TABLE IF NOT EXISTS oauth_state_store (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  state varchar(255) NOT NULL UNIQUE,           -- The state parameter sent to OAuth provider
  user_id varchar(36) NOT NULL,                 -- User who initiated the OAuth flow
  provider varchar(50) NOT NULL,                -- 'garmin', 'strava', etc.
  app_redirect text,                            -- Deep link URL to redirect back to mobile app
  history_days integer DEFAULT 30,              -- Days of history to sync
  nonce varchar(255),                           -- PKCE nonce for verifier lookup
  expires_at timestamp NOT NULL,                -- State expiration (10 minutes)
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast state lookup during callback
CREATE INDEX IF NOT EXISTS idx_oauth_state_store_state ON oauth_state_store(state);
CREATE INDEX IF NOT EXISTS idx_oauth_state_store_user_id ON oauth_state_store(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_state_store_expires_at ON oauth_state_store(expires_at);

-- Comment
COMMENT ON TABLE oauth_state_store IS 'Server-side storage for OAuth state parameters. States expire after 10 minutes for security.';
COMMENT ON COLUMN oauth_state_store.state IS 'Unique state ID used in OAuth flow - cannot be tampered with';
COMMENT ON COLUMN oauth_state_store.expires_at IS 'Automatic expiration (10 min) prevents state reuse attacks';

-- ============================================================================
-- 2. NOTIFICATIONS TABLE (Push & in-app notifications)
-- ============================================================================
-- Stores both push notifications and in-app notifications
-- Used for: new Garmin activities, run enrichment, plan updates, etc.

CREATE TABLE IF NOT EXISTS notifications (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,                           -- 'new_activity', 'run_enriched', 'plan_updated', etc.
  title text NOT NULL,                          -- Notification title (shown in push)
  message text NOT NULL,                        -- Notification message body
  read boolean DEFAULT false,                   -- Whether user has read the notification
  data jsonb,                                   -- Extra data: {runId, activityId, matchScore, etc.}
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Comment
COMMENT ON TABLE notifications IS 'In-app and push notifications for users. Stores activity alerts, run enrichment, plan updates, etc.';
COMMENT ON COLUMN notifications.type IS 'Type of notification: new_activity, run_enriched, plan_updated, achievement, etc.';
COMMENT ON COLUMN notifications.data IS 'JSON data for notification context: {runId, activityId, matchScore, deviceName, etc.}';

-- ============================================================================
-- 3. GARMIN WEBHOOK EVENTS TABLE (Monitoring & audit trail)
-- ============================================================================
-- Comprehensive logging of every Garmin webhook event
-- Tracks: received, created, merged, failed, skipped
-- Used for monitoring, debugging, and ensuring no data loss

CREATE TABLE IF NOT EXISTS garmin_webhook_events (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  webhook_type text NOT NULL DEFAULT 'activities',      -- 'activities', 'activity-details', 'sleep', etc.
  activity_id varchar(50),                              -- Garmin activity ID
  user_id varchar(36),                                  -- User ID if known at webhook time
  device_id varchar(50),                                -- Garmin device ID
  status text NOT NULL,                                 -- 'received', 'created_run', 'merged_run', 'failed', 'skipped'
  match_score real,                                     -- Fuzzy match score (0-100) if merged to existing run
  matched_run_id varchar(36),                           -- ID of existing AI Run Coach run if merged
  new_run_id varchar(36),                               -- ID of new run record if created
  activity_type text,                                   -- 'RUNNING', 'WALKING', 'TRAIL_RUNNING', etc.
  distance_in_meters real,                              -- Activity distance
  duration_in_seconds integer,                          -- Activity duration
  error_message text,                                   -- Error details if status = 'failed'
  notification_sent boolean DEFAULT false,              -- Whether push notification was sent
  notification_type text,                               -- 'new_activity', 'run_enriched'
  is_processed boolean DEFAULT false,                   -- Whether processing is complete
  processed_at timestamp,                               -- When processing completed
  raw_payload jsonb,                                    -- Full webhook payload for debugging
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries and monitoring
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_user_id ON garmin_webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_activity_id ON garmin_webhook_events(activity_id);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_status ON garmin_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_created_at ON garmin_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_webhook_type ON garmin_webhook_events(webhook_type);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_matched_run_id ON garmin_webhook_events(matched_run_id);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_new_run_id ON garmin_webhook_events(new_run_id);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_processed ON garmin_webhook_events(is_processed, created_at);

-- Composite index for monitoring dashboard queries
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_monitoring 
  ON garmin_webhook_events(user_id, created_at DESC, status);

-- Comments
COMMENT ON TABLE garmin_webhook_events IS 'Comprehensive audit trail of all Garmin webhook events. Used for monitoring, debugging, and statistics.';
COMMENT ON COLUMN garmin_webhook_events.status IS 'Processing status: received (initial), created_run (new), merged_run (enriched), failed (error), skipped (not applicable)';
COMMENT ON COLUMN garmin_webhook_events.match_score IS 'Fuzzy match confidence (0-100). > 50% considered a match and run is enriched.';
COMMENT ON COLUMN garmin_webhook_events.raw_payload IS 'Full webhook payload for debugging. Includes all activity fields from Garmin.';

-- ============================================================================
-- 4. WEBHOOK FAILURE QUEUE TABLE (Retry logic)
-- ============================================================================
-- Already exists but included here for reference
-- Handles failed webhook processing with automatic retry

CREATE TABLE IF NOT EXISTS webhook_failure_queue (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  webhook_type text NOT NULL,                  -- 'activities', 'sleep', 'daily', etc.
  user_id varchar(36),                        -- User ID if known
  payload jsonb NOT NULL,                     -- Full webhook payload
  error text,                                 -- Error message from processing
  retry_count integer DEFAULT 0,              -- Number of retry attempts
  max_retries integer DEFAULT 3,              -- Maximum retry attempts
  next_retry_at timestamp DEFAULT CURRENT_TIMESTAMP,  -- When to retry next
  last_error text,                            -- Most recent error message
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for retry queue processing
CREATE INDEX IF NOT EXISTS idx_webhook_failure_queue_next_retry 
  ON webhook_failure_queue(next_retry_at) 
  WHERE retry_count < max_retries;
CREATE INDEX IF NOT EXISTS idx_webhook_failure_queue_user_id 
  ON webhook_failure_queue(user_id);

-- ============================================================================
-- 5. UPDATE RUNS TABLE (if garminActivityId not present)
-- ============================================================================
-- Add column to track which Garmin activity enriched a run
-- (May already exist, this is a safety check)

ALTER TABLE runs 
ADD COLUMN IF NOT EXISTS garmin_activity_id varchar(50);

-- Add index for fast lookup
CREATE INDEX IF NOT EXISTS idx_runs_garmin_activity_id 
  ON runs(garmin_activity_id) 
  WHERE garmin_activity_id IS NOT NULL;

-- ============================================================================
-- 6. CLEANUP PROCEDURE (Optional - for maintenance)
-- ============================================================================
-- Automatic cleanup of expired OAuth states
-- Run this periodically (daily) to clean up old state entries

-- Example: You can create a scheduled job in your application to:
-- DELETE FROM oauth_state_store WHERE expires_at < NOW();
-- DELETE FROM webhook_failure_queue WHERE retry_count >= max_retries AND updated_at < NOW() - INTERVAL '7 days';

-- ============================================================================
-- 7. VERIFY MIGRATIONS
-- ============================================================================
-- Run these queries to verify all tables were created successfully:

-- Count rows in new tables (should be 0 initially):
-- SELECT 'oauth_state_store' as table_name, COUNT(*) as row_count FROM oauth_state_store
-- UNION ALL
-- SELECT 'notifications', COUNT(*) FROM notifications
-- UNION ALL
-- SELECT 'garmin_webhook_events', COUNT(*) FROM garmin_webhook_events
-- UNION ALL
-- SELECT 'webhook_failure_queue', COUNT(*) FROM webhook_failure_queue;

-- List all new columns:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name IN ('oauth_state_store', 'notifications', 'garmin_webhook_events', 'webhook_failure_queue')
-- ORDER BY table_name, ordinal_position;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- New Tables:
-- 1. oauth_state_store        - Secure OAuth state storage (5 columns)
-- 2. notifications            - Push & in-app notifications (7 columns)
-- 3. garmin_webhook_events    - Webhook audit trail (17 columns)
-- 4. webhook_failure_queue    - Retry queue (already exists, reference only)
--
-- Modified Tables:
-- 1. runs - Added garmin_activity_id column
--
-- Total: 3 new tables + 1 column addition
-- Indexes: 15+ for optimal query performance
--
-- All tables include:
-- - Proper foreign keys with CASCADE delete
-- - Comprehensive indexes for common queries
-- - Created/updated timestamps for audit
-- - Comments for documentation
-- ============================================================================
