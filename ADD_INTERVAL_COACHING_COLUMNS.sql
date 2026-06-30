-- ============================================================================
-- NEON DATABASE MIGRATION — AI Session Coaching Improvements (Jun 2026)
-- Adds per-phase HR/pace targets and session context to planned_workouts.
-- These columns power the new personalised in-run coaching engine:
--   • OpenAI receives exact HR targets per phase (jog vs. walk) 
--   • The Android coaching engine uses these to fire reactive HR/pace alerts
--   • The pre-run brief names the actual targets the athlete should hit
-- ============================================================================
-- SAFE TO RUN MULTIPLE TIMES (every statement uses IF NOT EXISTS / idempotent).
-- ============================================================================


-- ── 1. Per-phase interval coaching targets ────────────────────────────────────
-- Needed by getOrGenerateSessionCoaching() to give OpenAI the correct
-- HR and pace ranges for each phase of a walk_run or interval session.

-- Walk/recovery phase duration (seconds) — e.g. 120 for a 2-minute walk
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS rest_duration_seconds INTEGER;

-- Work phase HR targets (e.g. jog at 130–150 bpm)
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS interval_heart_rate_min INTEGER;

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS interval_heart_rate_max INTEGER;

-- Recovery phase max HR (e.g. walk until HR is below 120 bpm)
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS rest_heart_rate_max INTEGER;

-- Work phase target pace as "mm:ss" string (e.g. "6:00" for 6:00/km)
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS interval_target_pace TEXT;

-- Recovery phase target pace (e.g. "8:00" — brisk walk)
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS rest_target_pace TEXT;


-- ── 2. Session context fields (may already exist — safe either way) ───────────
-- sessionGoal and sessionIntent classify what the session is trying to achieve.
-- session_instructions_id links to AI-generated pre-session coaching instructions.

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS session_goal TEXT;

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS session_intent TEXT;

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS session_instructions_id VARCHAR
    REFERENCES session_instructions(id);


-- ── 3. session_instructions — coaching plan cache column ──────────────────────
-- The prepared coaching plan (phases + triggers) is stored here as JSONB.
-- Without this column the plan regenerates on every "Prepare Run" (functional
-- but slower — ~5-10s per call). With it, plans are cached and served instantly
-- on repeat visits to the Workout Detail screen.
-- generated_version is checked to invalidate stale plans when the prompt changes.

ALTER TABLE session_instructions
  ADD COLUMN IF NOT EXISTS session_structure JSONB;

-- generated_version may already exist from FIX_SESSION_INSTRUCTIONS_COLUMNS.sql
-- IF NOT EXISTS keeps this safe to re-run.
ALTER TABLE session_instructions
  ADD COLUMN IF NOT EXISTS generated_version TEXT DEFAULT '1.0';


-- ── 4. Indexes for performance ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_planned_workouts_session_goal
  ON planned_workouts(session_goal);

-- ── 5. Verification (optional — run to confirm all columns exist) ─────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'planned_workouts'
--   AND column_name IN (
--     'rest_duration_seconds',
--     'interval_heart_rate_min',
--     'interval_heart_rate_max',
--     'rest_heart_rate_max',
--     'interval_target_pace',
--     'rest_target_pace',
--     'session_goal',
--     'session_intent',
--     'session_instructions_id'
--   )
-- ORDER BY column_name;
