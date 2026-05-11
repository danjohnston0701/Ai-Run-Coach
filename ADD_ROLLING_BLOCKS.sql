-- ─────────────────────────────────────────────────────────────────────────────
-- ADD_ROLLING_BLOCKS.sql
-- Adds rolling-block generation fields to training_plans.
--
-- generatedThroughWeek: how many weeks are currently stored in the DB for this
--   plan (e.g. 4 out of a 20-week plan). NULL means legacy plan where all weeks
--   were generated upfront.
--
-- nextBlockAt: the timestamp at which the next training block should be
--   generated. The server checks this when the user opens the app / completes
--   a run, then triggers background block generation automatically.
--
-- Run this against your Neon (or any Postgres) database before deploying the
-- server changes. Safe to run multiple times (IF NOT EXISTS guards).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS generated_through_week INTEGER  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_block_at           TIMESTAMPTZ DEFAULT NULL;

-- Index to quickly find plans that need their next block generated
CREATE INDEX IF NOT EXISTS idx_training_plans_next_block_at
  ON training_plans (next_block_at)
  WHERE next_block_at IS NOT NULL AND status = 'active';
