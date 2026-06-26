-- =============================================================================
-- Migration: Add planned_workout_id to garmin_companion_sessions
--
-- When a user starts a Garmin watch run for a specific coaching plan session,
-- the iOS/web app now sends the planned_workout_id when registering the companion
-- session. This column stores that linkage so that when the Garmin activity
-- syncs back via webhook, we can automatically mark the planned session as Done.
--
-- Run this in the Neon SQL editor once.
-- =============================================================================

-- 1. Add the column (idempotent — safe to re-run)
ALTER TABLE garmin_companion_sessions
  ADD COLUMN IF NOT EXISTS planned_workout_id VARCHAR
    REFERENCES planned_workouts(id) ON DELETE SET NULL;

-- 2. Index for fast lookup in the webhook auto-complete path
CREATE INDEX IF NOT EXISTS idx_garmin_companion_sessions_planned_workout
  ON garmin_companion_sessions(planned_workout_id)
  WHERE planned_workout_id IS NOT NULL;

-- 3. Verify
SELECT
  COUNT(*)                                                              AS total_sessions,
  COUNT(*) FILTER (WHERE planned_workout_id IS NOT NULL)               AS sessions_with_workout
FROM garmin_companion_sessions;
