-- Session Enrichment Architecture
-- Adds columns needed for the staggered session enrichment system.
--
-- training_plans.enriched_through_week:
--   Tracks how far enrichment has progressed.
--   null = legacy plan (no enrichment architecture)
--   2    = weeks 1-2 have been enriched with runner-specific numeric targets
--   4    = weeks 1-4 enriched, etc.
--
-- planned_workouts.effort_label:
--   GPT's coaching intent for the session, set at plan generation time.
--   e.g. "easy_aerobic", "threshold", "race_pace", "temperval", "hill_power"
--   Works for any session type GPT invents — no hardcoded mapping needed.
--   Numeric targets (targetPace, hrZone etc.) are filled later by enrichment service.
--
-- planned_workouts.is_enrichment_pending:
--   true = session created under new architecture, awaiting numeric enrichment.
--   Used to show appropriate placeholder copy to the user.
--   Set to false once enrichment completes.

ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS enriched_through_week INTEGER;

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS effort_label TEXT;

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS is_enrichment_pending BOOLEAN DEFAULT FALSE;

-- Index for the daily scheduler query (finds plans needing next block enrichment)
CREATE INDEX IF NOT EXISTS idx_training_plans_enrichment
  ON training_plans (status, enriched_through_week)
  WHERE enriched_through_week IS NOT NULL;
