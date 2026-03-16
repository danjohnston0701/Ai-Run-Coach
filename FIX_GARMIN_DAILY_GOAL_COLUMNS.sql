-- ============================================================================
-- NEON DATABASE MIGRATION - Fix Missing Garmin Daily Goal Columns
-- ============================================================================
--
-- Scheduler errors like:
--   column "steps_goal" does not exist
--
-- come from the Garmin daily summary sync writing into `garmin_wellness_metrics`.
-- This table in Neon is older than the current schema.
--
-- Run this script in the Neon SQL editor. Safe to run multiple times.
-- ============================================================================

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS steps_goal INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS pushes_goal INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS floors_climbed_goal INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS intensity_goal INTEGER;

-- Optional verification
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'garmin_wellness_metrics'
--   AND column_name IN (
--     'steps_goal',
--     'pushes_goal',
--     'floors_climbed_goal',
--     'intensity_goal'
--   )
-- ORDER BY column_name;
