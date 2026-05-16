-- ============================================================================
-- NEON MIGRATION: Garmin Watch App User Tracking
-- Run this in your Neon Console SQL Editor
-- ============================================================================
-- This adds columns to track which users have the Garmin Connect IQ companion
-- app installed. This powers the "broadcast update" notification feature.
-- ============================================================================

-- Add Garmin watch app tracking columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_garmin_watch_app         BOOLEAN   DEFAULT false,
  ADD COLUMN IF NOT EXISTS garmin_watch_app_first_seen_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS garmin_watch_app_last_seen_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS garmin_watch_app_version       TEXT;

-- Index for efficiently querying watch app users (used by broadcast endpoint)
CREATE INDEX IF NOT EXISTS idx_users_has_garmin_watch_app
  ON users(has_garmin_watch_app)
  WHERE has_garmin_watch_app = true;

-- ============================================================================
-- BACKFILL: Mark existing users who have already used the companion app
-- This runs a one-time update for users who already have companion runs saved
-- ============================================================================
UPDATE users
SET has_garmin_watch_app = true,
    garmin_watch_app_first_seen_at = NOW(),
    garmin_watch_app_last_seen_at  = NOW()
WHERE id IN (
  SELECT DISTINCT user_id
  FROM runs
  WHERE external_source = 'garmin_companion'
)
AND (has_garmin_watch_app IS NULL OR has_garmin_watch_app = false);

-- ============================================================================
-- VERIFY
-- ============================================================================
SELECT
  COUNT(*)                                             AS total_users,
  COUNT(*) FILTER (WHERE has_garmin_watch_app = true)  AS garmin_watch_app_users,
  COUNT(*) FILTER (WHERE has_garmin_watch_app = true AND fcm_token IS NOT NULL) AS with_fcm_token
FROM users;
