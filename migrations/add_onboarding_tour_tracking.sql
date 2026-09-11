-- Adds first-occurrence timestamps for the onboarding feature tour to users.
--
-- onboarding_tour_started_at is set the first time OnboardingTourScreen is actually reached
-- (not just when the "Take a tour" button is tapped — permission/consent steps can intervene
-- between the tap and the screen mounting). onboarding_tour_completed_at is set the first time
-- a user reaches the natural end of the tour (taps "Get Started"), never on Skip. Both are
-- write-once: POST /api/user/onboarding-tour-event preserves the first value via COALESCE so
-- a user retaking the tour later doesn't overwrite their original adoption timestamp.
--
-- Apply via `npm run db:push` (requires EXTERNAL_DATABASE_URL), or run this directly against
-- the Neon database. Must land BEFORE the code that reads/writes these columns is deployed
-- (Replit redeploy is a separate manual step — see CLAUDE.md).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_tour_started_at timestamp,
  ADD COLUMN IF NOT EXISTS onboarding_tour_completed_at timestamp;
