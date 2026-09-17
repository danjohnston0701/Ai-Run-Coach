-- 2026-09-17 — Trial extension + usage-alert bookkeeping
-- Run against Neon manually (this repo never uses drizzle-kit push — see CLAUDE.md).
-- Both statements are idempotent / safe to re-run.

-- 1. Extend the free trial for every user with no subscription tier to the end of
--    31 October 2026, New Zealand time (NZDT, UTC+13) → 2026-10-31 23:59:59 NZDT
--    = 2026-10-31 10:59:59 UTC. `trial_expires_at` is a timestamp-without-timezone
--    column that the server compares against `new Date()` (UTC), so the UTC instant
--    is what must be stored. Paid users (any non-null tier) are untouched — the
--    server never applies trial expiry to them anyway.
UPDATE users
SET trial_expires_at = TIMESTAMP '2026-10-31 10:59:59'
WHERE subscription_tier IS NULL
   OR subscription_tier = ''
   OR lower(subscription_tier) = 'free';

-- 2. Per-month record of which "approaching your limit" emails have been sent, so the
--    90% alert goes out once per feature per month (usage-service.ts maybeSendUsageAlert).
ALTER TABLE monthly_usage
  ADD COLUMN IF NOT EXISTS usage_alerts_sent text[] NOT NULL DEFAULT '{}'::text[];
