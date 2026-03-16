-- ============================================================================
-- NEON DATABASE MIGRATION - Fix Missing HR Zone Columns on planned_workouts
-- ============================================================================
--
-- AI Coaching Plan creation now stores personalized HR-zone metadata for each
-- planned workout. Older Neon databases may have the `planned_workouts` table
-- without these newer columns, which causes 500 errors like:
--
--   column "hr_zone_number" of relation "planned_workouts" does not exist
--
-- Run this script in the Neon SQL editor. It is safe to run multiple times.
-- ============================================================================

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS hr_zone_number INTEGER;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS hr_zone_min_bpm INTEGER;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS hr_zone_max_bpm INTEGER;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS hr_zone_scenario TEXT;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS effort_description TEXT;

-- Optional verification:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'planned_workouts'
--   AND column_name IN (
--     'hr_zone_number',
--     'hr_zone_min_bpm',
--     'hr_zone_max_bpm',
--     'hr_zone_scenario',
--     'effort_description'
--   )
-- ORDER BY column_name;
