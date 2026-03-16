-- ============================================================================
-- NEON DATABASE MIGRATION - Add Training Plan Link to Goals
-- ============================================================================
--
-- Allows goals to reference their generated training plans, enabling the UI to
-- detect when a user tries to generate a plan for a goal that already has one,
-- and navigate directly to that plan instead of regenerating.
--
-- Run this script in the Neon SQL editor. It is safe to run multiple times.
-- ============================================================================

ALTER TABLE goals
ADD COLUMN IF NOT EXISTS linked_training_plan_id VARCHAR(36);

-- Optional: Add a foreign key constraint to training_plans table
-- ALTER TABLE goals
-- ADD CONSTRAINT fk_goals_training_plans
-- FOREIGN KEY (linked_training_plan_id) REFERENCES training_plans(id) ON DELETE SET NULL;

-- Optional verification:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'goals'
--   AND column_name = 'linked_training_plan_id';
