-- ─────────────────────────────────────────────────────────────────────────────
-- ADD_COACHING_OBSERVATIONS.sql
--
-- Adds the coaching_observations JSONB column to user_stats.
-- This powers the AI learning loop — a rolling array of structured coaching
-- insights extracted from each post-run analysis, used to make the
-- "What I know about you" runner profile accumulate knowledge over time
-- rather than being rebuilt from scratch from raw data.
--
-- Run this once against the production Neon database.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS coaching_observations JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN user_stats.coaching_observations IS
  'Rolling array (max 20 entries) of structured coaching observations extracted
   from post-run analyses. Each entry captures patterns, pacing tendencies,
   adaptation signals, and mental game notes for this runner. Used to power
   the AI learning loop — profile generation incorporates these observations
   alongside raw run data so insights accumulate over time.';
