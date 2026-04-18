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
