-- ============================================================
-- FIX: session_instructions - add missing columns
-- Run this in Neon SQL Editor to fix "AI Coaching Plan" creation error:
--   "column insight_filters of relation session_instructions does not exist"
--
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks)
-- ============================================================

-- Core columns that may have been added to the schema after initial table creation
ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS ai_determined_intensity TEXT;
ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS tone_reasoning TEXT;
ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS coaching_style JSONB;
ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS insight_filters JSONB;
ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS generated_version TEXT DEFAULT '1.0';
ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add performance index on planned_workout_id if it doesn't already exist
CREATE INDEX IF NOT EXISTS idx_session_instructions_workout
  ON session_instructions(planned_workout_id);

-- ============================================================
-- DONE! Re-try creating an AI Coaching Plan — it should work now.
-- ============================================================
