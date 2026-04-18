-- ============================================================================
-- NEON DATABASE MIGRATION — April 2026
-- AI Run Coach: Samsung Watch Support + Data Source Tracking
-- ============================================================================
--
-- Changes required by today's work:
--   1. Add `source` column to garmin_realtime_data
--      → Identifies whether a row came from a Garmin or Samsung watch
--      → Samsung companion routes insert source = 'samsung_watch'
--      → All existing rows default to 'garmin_watch'
--
-- NO other schema changes are required by today's session:
--   • Coaching cue queue is intentionally in-memory (cues are sub-second, no persistence needed)
--   • Samsung sessions share the existing garmin_companion_sessions table (device identified via deviceModel)
--   • All AI coaching improvements are purely server-side logic
--   • All Android fixes (cadence, elevation, stride) are purely in-app logic
--   • Run summary crash fix is a client-side model change only
--   • Garmin OAuth URL fix is a server config change only
--   • Padding fixes are all client-side UI changes
--
-- ============================================================================
-- Run this against your Neon database.
-- Safe to run multiple times (uses IF NOT EXISTS / DO NOTHING patterns).
-- ============================================================================


-- ============================================================================
-- 1. ADD source COLUMN TO garmin_realtime_data
-- ============================================================================
-- Distinguishes data rows by device platform.
-- Samsung companion routes will insert 'samsung_watch'.
-- All historical Garmin rows default to 'garmin_watch'.

ALTER TABLE garmin_realtime_data
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'garmin_watch';

-- Optional: backfill existing rows explicitly (they already get the default,
-- but this makes it unambiguous in queries/dashboards)
UPDATE garmin_realtime_data
  SET source = 'garmin_watch'
  WHERE source IS NULL;

-- ============================================================================
-- 2. ADD MISSING COLUMNS TO runs TABLE
-- ============================================================================
-- These were identified as data loss gaps in an audit of the upload pipeline:
--
--   startedAt     — actual run start time from device clock.  Previously
--                   the runs table only had completedAt (end time).  The
--                   Android app sends startTime in the upload but there was
--                   no column to store it.
--
--   totalSteps    — total step count for the run.  Previously computed by
--                   the server from cadence × duration but silently dropped
--                   because there was no column in the runs table.
--                   (totalSteps exists in garmin_epochs_aggregate, not runs.)

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS total_steps integer;

-- Backfill startedAt from completedAt - duration for existing rows
-- (duration is stored in seconds, completedAt is a timestamp)
UPDATE runs
  SET started_at = completed_at - (duration || ' seconds')::interval
  WHERE started_at IS NULL
    AND completed_at IS NOT NULL
    AND duration IS NOT NULL;

-- ============================================================================
-- Verification queries (run after migration to confirm)
-- ============================================================================

-- Check column exists and defaults are correct:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'garmin_realtime_data' AND column_name = 'source';

-- Check row counts by source:
-- SELECT source, COUNT(*) FROM garmin_realtime_data GROUP BY source;
