-- ============================================================================
-- NEON DATABASE MIGRATION - Fix Missing Garmin Epochs Columns
-- ============================================================================
--
-- The garmin_epochs_aggregate table was created with incomplete columns.
-- This migration adds all missing columns needed for epoch data processing.
--
-- Run this migration in your Neon console.
-- ============================================================================

-- Add missing columns to garmin_epochs_aggregate table
-- These columns are needed for processing Garmin epoch data

ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS average_met real DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS mean_motion_intensity real DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS max_motion_intensity real DEFAULT 0;
ALTER TABLE garmin_epochs_aggregate ADD COLUMN IF NOT EXISTS min_motion_intensity real DEFAULT 0;

-- Also ensure garmin_epochs_raw has all necessary columns
ALTER TABLE garmin_epochs_raw ADD COLUMN IF NOT EXISTS mean_motion_intensity real DEFAULT 0;
ALTER TABLE garmin_epochs_raw ADD COLUMN IF NOT EXISTS max_motion_intensity real DEFAULT 0;

-- Verify columns exist
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'garmin_epochs_aggregate' ORDER BY ordinal_position;
