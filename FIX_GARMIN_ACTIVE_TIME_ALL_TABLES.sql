-- ============================================================================
-- NEON DATABASE MIGRATION - Fix Missing active_time_in_seconds Across Garmin Tables
-- ============================================================================
--
-- Replit scheduler errors like:
--   [Scheduler] Failed to sync Garmin ...: column "active_time_in_seconds" does not exist
--
-- can come from multiple Garmin sync paths:
--   1. garmin_epochs_raw
--   2. garmin_wellness_metrics
--
-- Run this entire script in the Neon SQL editor. It is safe to run multiple times.
-- ============================================================================

-- Raw epoch sync path
ALTER TABLE garmin_epochs_raw
ADD COLUMN IF NOT EXISTS active_time_in_seconds INTEGER DEFAULT 0;

-- Daily wellness sync path
ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS active_time_in_seconds INTEGER DEFAULT 0;

-- Helpful related daily duration fields used by the current schema
ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS duration_in_seconds INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS moderate_intensity_duration INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS vigorous_intensity_duration INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS intensity_duration INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS sedentary_duration INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS sleeping_duration INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS active_duration INTEGER;

-- Optional verification
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name IN ('garmin_epochs_raw', 'garmin_wellness_metrics')
--   AND column_name IN (
--     'active_time_in_seconds',
--     'duration_in_seconds',
--     'moderate_intensity_duration',
--     'vigorous_intensity_duration',
--     'intensity_duration',
--     'sedentary_duration',
--     'sleeping_duration',
--     'active_duration'
--   )
-- ORDER BY table_name, column_name;
