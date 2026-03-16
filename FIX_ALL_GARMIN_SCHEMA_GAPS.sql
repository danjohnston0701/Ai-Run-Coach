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

-- Sleep metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS total_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS deep_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS light_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS rem_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS awake_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sleep_score INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sleep_quality TEXT;

-- Stress metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS average_stress_level INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS max_stress_level INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS stress_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS rest_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS activity_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS low_stress_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS medium_stress_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS high_stress_duration INTEGER;

-- Stress duration breakdown (in seconds)
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS stress_duration_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS rest_stress_duration_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS activity_stress_duration_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS low_stress_duration_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS medium_stress_duration_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS high_stress_duration_seconds INTEGER;

-- Body Battery metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS body_battery_high INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS body_battery_low INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS body_battery_current INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS body_battery_charged INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS body_battery_drained INTEGER;

-- HRV metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS hrv_weekly_avg REAL;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS hrv_last_night_avg REAL;

-- Heart rate metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS resting_heart_rate INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS min_heart_rate INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS max_heart_rate INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS average_heart_rate INTEGER;

-- Respiration metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS avg_waking_respiration_value REAL;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS highest_respiration_value REAL;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS lowest_respiration_value REAL;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS avg_sleep_respiration_value REAL;

-- Pulse Ox metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS avg_spo2 REAL;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS min_spo2 REAL;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS avg_altitude REAL;

-- Activity/Daily metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS steps INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS pushes INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS distance_meters INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS push_distance_meters REAL;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS active_kilocalories INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS bmr_kilocalories INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS floors_climbed INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS floors_descended INTEGER;

-- Duration breakdown
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS duration_in_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS active_time_in_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS moderate_intensity_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS vigorous_intensity_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS intensity_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sedentary_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sleeping_duration INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS active_duration INTEGER;

-- Daily goal tracking
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS steps_goal INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS pushes_goal INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS floors_climbed_goal INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS intensity_goal INTEGER;

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
