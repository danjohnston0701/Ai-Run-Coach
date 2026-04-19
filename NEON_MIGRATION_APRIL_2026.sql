-- ============================================================================
-- NEON DATABASE MIGRATION — April 2026
-- AI Run Coach: Samsung Watch Support + Data Source Tracking + Data Loss Fixes
-- ============================================================================
-- Safe to run multiple times (uses IF NOT EXISTS / DO NOTHING patterns).
-- ============================================================================


-- ============================================================================
-- 1. CREATE garmin_realtime_data TABLE (if it doesn't exist yet)
-- ============================================================================
-- This table stores per-second metrics streamed from Garmin/Samsung watches.

CREATE TABLE IF NOT EXISTS garmin_realtime_data (
  id                    varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id               varchar NOT NULL REFERENCES users(id),
  run_id                varchar REFERENCES runs(id),
  session_id            text NOT NULL,
  timestamp             timestamptz NOT NULL DEFAULT now(),

  -- Heart Rate
  heart_rate            integer,
  heart_rate_zone       integer,

  -- Location & Movement
  latitude              real,
  longitude             real,
  altitude              real,
  speed                 real,
  pace                  real,

  -- Running Dynamics
  cadence               integer,
  stride_length         real,
  ground_contact_time   real,
  ground_contact_balance real,
  vertical_oscillation  real,
  vertical_ratio        real,

  -- Power & Performance
  power                 integer,

  -- Environmental
  temperature           real,

  -- Activity Status
  activity_type         text,
  is_moving             boolean DEFAULT true,
  is_paused             boolean DEFAULT false,

  -- Data source ('garmin_watch', 'samsung_watch', etc.)
  source                text DEFAULT 'garmin_watch',

  -- Cumulative stats at this point in the run
  cumulative_distance   real,
  cumulative_ascent     real,
  cumulative_descent    real,
  elapsed_time          integer,

  created_at            timestamptz DEFAULT now()
);

-- ============================================================================
-- 2. CREATE garmin_companion_sessions TABLE (if it doesn't exist yet)
-- ============================================================================
-- Tracks active and completed watch companion app sessions.

CREATE TABLE IF NOT EXISTS garmin_companion_sessions (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id             varchar NOT NULL REFERENCES users(id),
  run_id              varchar REFERENCES runs(id),
  session_id          text NOT NULL UNIQUE,
  device_id           text,
  device_model        text,
  activity_type       text DEFAULT 'running',
  status              text NOT NULL DEFAULT 'active',
  started_at          timestamptz DEFAULT now(),
  ended_at            timestamptz,
  last_data_at        timestamptz,
  data_point_count    integer DEFAULT 0,

  -- Session summary (populated on session end)
  total_distance      real,
  total_duration      integer,
  avg_heart_rate      integer,
  max_heart_rate      integer,
  avg_cadence         integer,
  avg_pace            real,
  total_ascent        real,
  total_descent       real,

  created_at          timestamptz DEFAULT now()
);

-- ============================================================================
-- 3. ADD source COLUMN TO garmin_realtime_data (if table already existed)
-- ============================================================================
-- Safe no-op if the CREATE TABLE above already included the column.

ALTER TABLE garmin_realtime_data
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'garmin_watch';

UPDATE garmin_realtime_data
  SET source = 'garmin_watch'
  WHERE source IS NULL;

-- ============================================================================
-- 4. ADD MISSING COLUMNS TO runs TABLE
-- ============================================================================
-- started_at  — actual run start time. Android sends startTime in the upload
--               but there was previously no column to store it.
-- total_steps — step count computed from cadence × duration. Previously
--               silently dropped by Drizzle (no column existed).

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS total_steps integer;

-- Backfill started_at for existing rows (completedAt - duration)
UPDATE runs
  SET started_at = completed_at - (duration || ' seconds')::interval
  WHERE started_at IS NULL
    AND completed_at IS NOT NULL
    AND duration IS NOT NULL;

-- ============================================================================
-- 5. ADD 20K PERSONAL BEST COLUMNS TO user_stats
-- ============================================================================
-- New PB category between 10K and Half Marathon.
-- Populated automatically on next recomputeForUser call (or recompute-all).

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS pb_20k_duration_ms integer;

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS pb_20k_run_id varchar;

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS pb_20k_date timestamptz;

-- ============================================================================
-- 6. ADD MISSING COLUMNS TO user_stats TABLE
-- ============================================================================
-- These columns are written by recomputeForUser() on every run save and read
-- by getAllTimeStats() / getPersonalBests().  Without them the upsert will
-- error and the My Data screen will fall back to the slower live query path.

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS longest_run_time_sec   integer;

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS highest_elevation_m    real;

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS most_consecutive_runs  integer DEFAULT 0;

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS goals_achieved         integer DEFAULT 0;

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS total_active_calories  integer DEFAULT 0;

-- ============================================================================
-- 7. ADD COACHING PLAN COLUMNS TO runs TABLE
-- ============================================================================
-- Required for the coaching summary endpoint and performance trend filtering
-- (getCoachingPlanSummary, getDetailedTrends both filter on these columns).

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS linked_workout_id      varchar;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS linked_plan_id         varchar;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS plan_progress_week     integer;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS plan_progress_weeks    integer;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS workout_type           varchar;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS workout_intensity      varchar;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS workout_description    text;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();

-- ============================================================================
-- 8. ADD EXTENDED METRICS COLUMNS TO runs TABLE
-- ============================================================================
-- Added when Garmin/Samsung data enrichment was introduced.  Safe no-ops if
-- already present.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS max_speed         real;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS avg_speed         real;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS moving_time       integer;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS elapsed_time      integer;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS max_cadence       integer;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS avg_stride_length real;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS min_elevation     real;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS max_elevation     real;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS steepest_incline  real;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS steepest_decline  real;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS active_calories   integer;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS resting_calories  integer;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS est_sweat_loss    real;

-- ============================================================================
-- 9. ADD AI RUNNER PROFILE TO user_stats TABLE
-- ============================================================================
-- "What I know about you" — a living AI-generated plain-text summary of the
-- runner.  Updated after every run.  Injected into all AI prompts (plan
-- generation, pre-run insights, route suggestions, in-run coaching, post-run
-- analysis) so every feature has immediate personal context without needing
-- to re-join runs / goals / plans tables at prompt-generation time.
--
-- Example content:
--   "Dan is an intermediate runner, 34M, training for a half marathon in
--    June. Averages 3 runs/week, 25km/week. Strong on flat tempo runs but
--    struggles with hills — often gets a stitch at ~3km on hilly routes.
--    Best 5K: 24:12 (improving). Current plan: Week 6 of 12. Last run: 8km
--    easy, felt good. Focus: build aerobic base, avoid overstriding."

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS ai_runner_profile          text;

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS ai_runner_profile_updated_at timestamptz;

-- ============================================================================
-- Verification queries (uncomment and run to confirm)
-- ============================================================================

-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('garmin_realtime_data', 'garmin_companion_sessions');

-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'runs'
--   AND column_name IN ('started_at', 'total_steps');

-- SELECT source, COUNT(*) FROM garmin_realtime_data GROUP BY source;

-- Verify new columns exist:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'user_stats'
--   AND column_name IN (
--     'longest_run_time_sec', 'highest_elevation_m', 'most_consecutive_runs',
--     'goals_achieved', 'total_active_calories',
--     'ai_runner_profile', 'ai_runner_profile_updated_at'
--   );

-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'runs'
--   AND column_name IN (
--     'linked_plan_id', 'linked_workout_id', 'workout_type',
--     'workout_intensity', 'workout_description', 'updated_at'
--   );
