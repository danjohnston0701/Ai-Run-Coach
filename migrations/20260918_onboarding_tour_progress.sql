-- Onboarding feature tour: progress + outcome (2026-09-18)
-- Extends add_onboarding_tour_tracking.sql (started_at / completed_at) so a "started but
-- never completed" user can be read as skipped-at-step-N, closed-the-app-at-step-N, or
-- still in progress. Written by POST /api/user/onboarding-tour-event.
--
-- Step vocabulary: 0 = watch-choice screen, 1..total_steps = the paged tour (names in
-- OnboardingTourScreen.kt/.swift `tourStepName`). furthest_step is a running max across
-- attempts; skipped_at is write-once (first skip); last_event / last_event_at always reflect
-- the most recent event: 'started' | 'step' | 'left' (app backgrounded/closed mid-tour) |
-- 'skipped' | 'completed'.
--
-- Also applied idempotently by server/auto-migrate.ts on server start.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_tour_furthest_step      INTEGER,
  ADD COLUMN IF NOT EXISTS onboarding_tour_total_steps        INTEGER,
  ADD COLUMN IF NOT EXISTS onboarding_tour_furthest_step_name TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_tour_last_event         TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_tour_last_event_at      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS onboarding_tour_skipped_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS onboarding_tour_skipped_at_step    INTEGER;

-- Handy read: how did each tour attempt end?
-- SELECT email, onboarding_tour_started_at, onboarding_tour_furthest_step || '/' || onboarding_tour_total_steps AS progress,
--        onboarding_tour_furthest_step_name, onboarding_tour_last_event, onboarding_tour_last_event_at,
--        CASE WHEN onboarding_tour_completed_at IS NOT NULL THEN 'completed'
--             WHEN onboarding_tour_skipped_at IS NOT NULL THEN 'skipped at step ' || onboarding_tour_skipped_at_step
--             WHEN onboarding_tour_last_event = 'left' THEN 'closed app at step ' || onboarding_tour_furthest_step
--             WHEN onboarding_tour_started_at IS NOT NULL THEN 'abandoned / in progress'
--             ELSE 'never started' END AS outcome
--   FROM users ORDER BY created_at DESC;
