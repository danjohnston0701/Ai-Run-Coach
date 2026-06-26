-- =============================================================================
-- Migration: Add trial_expires_at to users table
--
-- The free tier is changing from a forever-free model to a 14-day trial.
-- After 14 days from account creation, free-tier users are blocked from ALL
-- features until they upgrade to a paid plan.
--
-- Run this in the Neon SQL editor once.
-- =============================================================================

-- 1. Add the trial_expires_at column (idempotent — safe to re-run)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP;

-- 2. Backfill ALL existing users.
--    trial_expires_at = account creation date + 14 days.
--    This applies to every user regardless of tier:
--      • Free users: expiry determines when the paywall activates.
--      • Paid users: field is set but irrelevant (tier check bypasses it).
UPDATE users
SET trial_expires_at = created_at + INTERVAL '14 days'
WHERE trial_expires_at IS NULL;

-- 3. Verify the backfill
SELECT
  COUNT(*)                                                          AS total_users,
  COUNT(*) FILTER (WHERE trial_expires_at IS NOT NULL)             AS backfilled,
  COUNT(*) FILTER (WHERE trial_expires_at < NOW()
                   AND (subscription_tier IS NULL
                        OR subscription_tier = 'free'))            AS trial_expired_free_users,
  COUNT(*) FILTER (WHERE trial_expires_at >= NOW()
                   AND (subscription_tier IS NULL
                        OR subscription_tier = 'free'))            AS trial_active_free_users,
  COUNT(*) FILTER (WHERE subscription_tier IN ('lite','standard')) AS paid_users
FROM users;
