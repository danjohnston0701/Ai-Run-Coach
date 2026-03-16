-- ============================================================================
-- NEON DATABASE MIGRATION - Add active_time_in_seconds to Garmin Epochs Tables
-- ============================================================================
--
-- This migration adds the missing active_time_in_seconds column to both
-- garmin_epochs_raw and garmin_epochs_aggregate tables.
--
-- The column tracks the actual time spent in activity (excluding pauses/breaks)
-- within each 1-minute epoch.
--
-- Run this migration in your Neon SQL Editor console.
-- It is safe to run multiple times (uses ADD COLUMN IF NOT EXISTS)
-- ============================================================================

-- ============================================================================
-- 1. Add active_time_in_seconds to garmin_epochs_raw
-- ============================================================================
-- Stores the actual activity time for each 1-minute epoch
-- Used for calculating active vs sedentary time breakdowns

ALTER TABLE garmin_epochs_raw 
ADD COLUMN IF NOT EXISTS active_time_in_seconds INTEGER DEFAULT 0;

-- ============================================================================
-- 2. Add active_time_in_seconds to garmin_epochs_aggregate
-- ============================================================================
-- Stores aggregated active time across all epochs for a day
-- Used for daily activity statistics

ALTER TABLE garmin_epochs_aggregate 
ADD COLUMN IF NOT EXISTS total_active_time_in_seconds INTEGER DEFAULT 0;

-- ============================================================================
-- 3. VERIFY COLUMNS WERE ADDED
-- ============================================================================
-- Run this query to verify the columns exist:
-- 
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('garmin_epochs_raw', 'garmin_epochs_aggregate')
--   AND column_name LIKE '%active_time%'
-- ORDER BY table_name, ordinal_position;
--
-- Expected output:
-- active_time_in_seconds | integer (from garmin_epochs_raw)
-- total_active_time_in_seconds | integer (from garmin_epochs_aggregate)

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Modified Tables:
-- 1. garmin_epochs_raw - Added active_time_in_seconds column
-- 2. garmin_epochs_aggregate - Added total_active_time_in_seconds column
--
-- Default value: 0 (zero) for backward compatibility
-- This allows the Garmin sync scheduler to process epoch data without errors
-- ============================================================================
