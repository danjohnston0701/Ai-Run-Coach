-- Fix missing wheelchair/pushes columns and other schema gaps
-- These were defined in schema.ts but never added to the production database
-- Causes: "column 'pushes' does not exist" errors during Garmin sync
-- Run this in Neon (or Replit database console)

-- ==================== garmin_wellness_metrics ====================

ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS pushes INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS push_distance_meters REAL;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS pushes_goal INTEGER;

-- ==================== garmin_epochs_raw ====================
-- The original CREATE TABLE was missing several columns vs schema.ts

ALTER TABLE garmin_epochs_raw ADD COLUMN IF NOT EXISTS pushes INTEGER;
ALTER TABLE garmin_epochs_raw ADD COLUMN IF NOT EXISTS push_distance_in_meters REAL;
ALTER TABLE garmin_epochs_raw ADD COLUMN IF NOT EXISTS active_time_in_seconds INTEGER;
ALTER TABLE garmin_epochs_raw ADD COLUMN IF NOT EXISTS summary_id TEXT;
ALTER TABLE garmin_epochs_raw ADD COLUMN IF NOT EXISTS start_time_offset_in_seconds INTEGER;

-- ==================== garmin_epochs_aggregate ====================
-- The original CREATE TABLE was also missing several columns vs schema.ts

ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS total_pushes INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS total_push_distance REAL DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS sedentary_duration_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS active_duration_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS highly_active_duration_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS sedentary_intensity_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS active_intensity_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS highly_active_intensity_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS walking_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS running_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS wheelchair_pushing_seconds INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS total_met REAL DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS average_motion_intensity REAL DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS max_motion_intensity REAL DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS total_distance REAL DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS total_epochs INTEGER DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS compressed_data TEXT;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS compressed_at TIMESTAMP;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS epoch_date TEXT;
