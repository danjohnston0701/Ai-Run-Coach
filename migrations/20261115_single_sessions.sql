-- One-off AI sessions and typed free runs (2026-11-15). Applied automatically by
-- server/auto-migrate.ts; this is the canonical copy.

-- The runner's answer to "You have a plan session today — should this count?":
-- 'count' | 'leave_open' | NULL (not asked). Read by server/plan-run-sync.ts.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS plan_session_choice TEXT;

-- Monthly allowance counter for one-off AI-designed sessions (server/tier-limits.ts).
ALTER TABLE monthly_usage ADD COLUMN IF NOT EXISTS single_sessions_generated INTEGER NOT NULL DEFAULT 0;

-- One-off sessions are stored as a planned_workouts row under a training_plans row with
-- status = 'single_session' (planned_workouts requires a plan and a week). Every scheduled
-- job and plan list filters on status = 'active' (or a named status), so these never appear
-- as plans or get stalled / extended / adapted. No DDL needed for that.
