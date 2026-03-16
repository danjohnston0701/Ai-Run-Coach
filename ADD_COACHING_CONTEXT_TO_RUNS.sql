-- ============================================================================
-- NEON DATABASE MIGRATION - Add Training Plan Context to Runs Table
-- ============================================================================
--
-- Adds fields to track which coaching plan workout a run belongs to,
-- so in-run coaching prompts and post-run analysis can be tailored
-- to the specific workout's goals and intensity zone.
--
-- Run this script in the Neon SQL editor. Safe to run multiple times.
-- ============================================================================

-- Add coaching plan context fields to runs table
ALTER TABLE runs
ADD COLUMN IF NOT EXISTS linked_workout_id VARCHAR,
ADD COLUMN IF NOT EXISTS linked_plan_id VARCHAR,
ADD COLUMN IF NOT EXISTS plan_progress_week INTEGER,
ADD COLUMN IF NOT EXISTS plan_progress_weeks INTEGER,
ADD COLUMN IF NOT EXISTS workout_type VARCHAR,        -- "easy", "tempo", "intervals", "long_run", etc.
ADD COLUMN IF NOT EXISTS workout_intensity VARCHAR,   -- "z1", "z2", "z3", "z4", "z5"
ADD COLUMN IF NOT EXISTS workout_description TEXT;    -- Human-readable workout description

-- Optional: Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_runs_linked_plan_id ON runs(linked_plan_id);
CREATE INDEX IF NOT EXISTS idx_runs_linked_workout_id ON runs(linked_workout_id);
CREATE INDEX IF NOT EXISTS idx_runs_workout_type ON runs(workout_type);

-- Verification query (run this to confirm columns exist):
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'runs'
--   AND column_name IN (
--     'linked_workout_id',
--     'linked_plan_id',
--     'plan_progress_week',
--     'plan_progress_weeks',
--     'workout_type',
--     'workout_intensity',
--     'workout_description'
--   )
-- ORDER BY column_name;
