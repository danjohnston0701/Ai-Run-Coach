-- Observers can read what the runner's AI coach is saying (text only).
--
-- The runner's phone already syncs position/pace/HR to live_run_sessions every ~5 s; it now
-- also sends the last few coaching cues it has spoken as [{ "time": <elapsed ms>, "message" }].
-- Capped to the most recent 10 by PUT /api/live-sessions/sync. Also applied at boot by
-- server/auto-migrate.ts so a redeploy can't outrun it.

ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS recent_coaching_notes JSONB;
