-- ============================================================================
-- NEON DATABASE MIGRATION - Complete Garmin Schema Gap Fix
-- ============================================================================
--
-- This script fixes ALL missing Garmin columns causing scheduler sync failures.
-- Includes columns for:
--   - Epoch (raw) data sync
--   - Daily wellness metrics sync
--   - Activity data sync
--
-- Recent errors fixed:
--   - column "active_time_in_seconds" does not exist
--   - column "steps_goal" does not exist
--   - column "stress_duration_seconds" does not exist
--
-- Run this entire script ONCE in the Neon SQL editor.
-- It is safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================================

-- ============================================================================
-- GARMIN_EPOCHS_RAW - Raw epoch/activity data sync
-- ============================================================================

ALTER TABLE garmin_epochs_raw
ADD COLUMN IF NOT EXISTS active_time_in_seconds INTEGER DEFAULT 0;

-- ============================================================================
-- GARMIN_WELLNESS_METRICS - Daily wellness summary sync
-- ============================================================================

-- Active time tracking
ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS active_time_in_seconds INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS stress_duration_seconds INTEGER;

-- Duration fields
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

-- Daily goal tracking
ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS steps_goal INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS pushes_goal INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS floors_climbed_goal INTEGER;

ALTER TABLE garmin_wellness_metrics
ADD COLUMN IF NOT EXISTS intensity_goal INTEGER;

-- ============================================================================
-- OPTIONAL VERIFICATION (uncomment to run)
-- ============================================================================

-- Verify all columns exist:
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name IN ('garmin_epochs_raw', 'garmin_wellness_metrics')
--   AND column_name IN (
--     'active_time_in_seconds',
--     'stress_duration_seconds',
--     'duration_in_seconds',
--     'moderate_intensity_duration',
--     'vigorous_intensity_duration',
--     'intensity_duration',
--     'sedentary_duration',
--     'sleeping_duration',
--     'active_duration',
--     'steps_goal',
--     'pushes_goal',
--     'floors_climbed_goal',
--     'intensity_goal'
--   )
-- ORDER BY table_name, column_name;
