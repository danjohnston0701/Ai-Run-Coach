-- =============================================================================
-- Migration: Garmin Companion Watch Biomechanical Data
-- Date: 2026-04-29
-- Description:
--   1. Adds 25 new columns to the `runs` table for biomechanical summary metrics
--      and time-series JSONB arrays streamed from the Garmin companion watch.
--   2. Creates the new `watch_biometric_samples` table that stores every
--      2-second real-time sample from the watch during a run (for fine-grained
--      graphs, AI coaching analysis, and My Data screen).
--
-- Safe to run multiple times — uses IF NOT EXISTS / IF NOT EXISTS guards.
-- All new columns are nullable so existing rows are unaffected.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: New columns on the `runs` table
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Running Dynamics (averages for the full run) ──────────────────────────────

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS avg_ground_contact_time     REAL,        -- ms  (200-300ms normal)
  ADD COLUMN IF NOT EXISTS min_ground_contact_time     REAL,        -- ms  (best / lowest during run)
  ADD COLUMN IF NOT EXISTS max_ground_contact_time     REAL,        -- ms  (worst / highest during run)
  ADD COLUMN IF NOT EXISTS avg_ground_contact_balance  REAL,        -- %   (50% = perfectly balanced)
  ADD COLUMN IF NOT EXISTS avg_vertical_oscillation    REAL,        -- cm  (6-8cm efficient, >10 wasteful)
  ADD COLUMN IF NOT EXISTS max_vertical_oscillation    REAL,        -- cm  (peak bounce — fatigue indicator)
  ADD COLUMN IF NOT EXISTS avg_vertical_ratio          REAL,        -- %   (oscillation / stride, 8-10% efficient)
  ADD COLUMN IF NOT EXISTS min_stride_length           REAL,        -- m   (shortest stride — typically uphill)
  ADD COLUMN IF NOT EXISTS max_stride_length           REAL;        -- m   (longest stride — typically downhill)

-- ── Training Effect & Recovery ────────────────────────────────────────────────

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS aerobic_training_effect     REAL,        -- 0-5  (aerobic load of this run)
  ADD COLUMN IF NOT EXISTS anaerobic_training_effect   REAL,        -- 0-5  (anaerobic load)
  ADD COLUMN IF NOT EXISTS training_effect_label       TEXT,        -- 'Recovery'|'Base'|'Tempo'|'Threshold'|'VO2 Max'
  ADD COLUMN IF NOT EXISTS recovery_time_minutes       INTEGER,     -- minutes until body is fully recovered
  ADD COLUMN IF NOT EXISTS vo2_max_estimate            REAL;        -- ml/kg/min estimated from this run

-- ── Environmental ─────────────────────────────────────────────────────────────

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS avg_ambient_pressure        REAL,        -- Pa  (barometric pressure, ~101325 at sea level)
  ADD COLUMN IF NOT EXISTS avg_bearing                 REAL,        -- °   (overall direction of travel)
  ADD COLUMN IF NOT EXISTS garmin_device_name          TEXT;        -- e.g. 'Fenix 7X', 'VivoActive 4'

-- ── Time-series JSONB arrays (one value per 2-second watch sample) ─────────────
-- These power the fine-grained graphs in the Run Summary and My Data screens.
-- Format: plain number arrays, index-aligned with the same timestamps as pace_data.

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS ground_contact_time_data    JSONB,       -- number[] ms  per 2s sample
  ADD COLUMN IF NOT EXISTS ground_contact_balance_data JSONB,       -- number[] %   per 2s sample
  ADD COLUMN IF NOT EXISTS vertical_oscillation_data   JSONB,       -- number[] cm  per 2s sample
  ADD COLUMN IF NOT EXISTS vertical_ratio_data         JSONB,       -- number[] %   per 2s sample
  ADD COLUMN IF NOT EXISTS stride_length_data          JSONB,       -- number[] m   per 2s sample
  ADD COLUMN IF NOT EXISTS cadence_data                JSONB,       -- number[] spm per 2s sample (fine-grained vs summary cadence)
  ADD COLUMN IF NOT EXISTS altitude_data               JSONB,       -- number[] m   per GPS sample
  ADD COLUMN IF NOT EXISTS bearing_data                JSONB;       -- number[] °   per GPS sample

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: New `watch_biometric_samples` table
-- ─────────────────────────────────────────────────────────────────────────────
-- Every 2-second data frame streamed from the Garmin watch is stored here.
-- Enables:
--   • Fine-grained time-series graphs (GCT over time, VO trend, etc.)
--   • Real-time AI coaching analysis with full temporal context
--   • "My Data" screen — drill into any moment of any run
--   • Replay / playback of the run biomechanically
--   • Long-term trend analysis (e.g. GCT improving over 6 months)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watch_biometric_samples (

  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  VARCHAR NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  user_id                 VARCHAR NOT NULL REFERENCES users(id),

  -- When this sample was recorded
  elapsed_ms              INTEGER NOT NULL,   -- milliseconds from run start (for x-axis on graphs)
  sampled_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Location ────────────────────────────────────────────────────────────
  latitude                REAL,
  longitude               REAL,
  altitude                REAL,              -- meters above sea level
  bearing                 REAL,              -- degrees 0-360 (0=N, 90=E, 180=S, 270=W)
  gps_accuracy            REAL,              -- meters CEP (Garmin multi-band ~3m)

  -- ── Pace & Speed ─────────────────────────────────────────────────────────
  pace                    REAL,              -- min/km
  speed                   REAL,              -- m/s
  distance_so_far         REAL,              -- meters from run start

  -- ── Heart Rate ───────────────────────────────────────────────────────────
  heart_rate              INTEGER,           -- bpm
  heart_rate_zone         INTEGER,           -- 1-5

  -- ── Cadence & Stride ─────────────────────────────────────────────────────
  cadence                 INTEGER,           -- steps per minute
  stride_length           REAL,              -- meters per stride

  -- ── Running Dynamics ─────────────────────────────────────────────────────
  ground_contact_time     REAL,              -- ms   (200-300ms normal; higher = overstriding/fatigue)
  ground_contact_balance  REAL,              -- %    (50% = perfectly balanced; >52 or <48 = asymmetry)
  vertical_oscillation    REAL,              -- cm   (6-8cm efficient; >10cm = wasted energy)
  vertical_ratio          REAL,              -- %    (8-10% efficient; higher = poor economy)

  -- ── Training Metrics (updated periodically by watch) ─────────────────────
  training_effect         REAL,              -- 0-5
  vo2_max                 REAL,              -- ml/kg/min

  -- ── Environmental ─────────────────────────────────────────────────────────
  ambient_pressure        REAL,              -- Pa (dropping pressure = incoming weather)

  -- ── Computed fields (derived server-side from adjacent samples) ────────────
  terrain_grade           REAL,              -- % grade (negative = downhill, positive = uphill)
                                             -- computed from (altitude[n] - altitude[n-1]) / distance
  estimated_fatigue       INTEGER,           -- 0-100 fatigue score at this moment
                                             -- computed from HR drift + VO increase + time

  -- ── Coaching (if AI generated a cue at this moment) ──────────────────────
  coaching_cue            TEXT,              -- the actual coaching message spoken/displayed
  coaching_category       TEXT               -- 'form'|'pacing'|'effort'|'fatigue'|'environment'|'efficiency'

);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3: Indexes on `watch_biometric_samples`
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary access pattern: all samples for a run, ordered chronologically
CREATE INDEX IF NOT EXISTS idx_watch_samples_run_elapsed
  ON watch_biometric_samples (run_id, elapsed_ms ASC);

-- User-level queries (e.g. "show all my GCT readings across all runs")
CREATE INDEX IF NOT EXISTS idx_watch_samples_user_sampled
  ON watch_biometric_samples (user_id, sampled_at DESC);

-- Fast lookups for coaching cue replay
CREATE INDEX IF NOT EXISTS idx_watch_samples_coaching
  ON watch_biometric_samples (run_id, coaching_category)
  WHERE coaching_cue IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 4: Helpful comments on the new columns (pg_description)
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN runs.avg_ground_contact_time     IS 'Average time foot spends on ground per step (ms). Normal: 200-300ms. Higher = overstriding or fatigue.';
COMMENT ON COLUMN runs.avg_ground_contact_balance  IS 'Left/right symmetry of ground contact (%). 50% = perfect balance. >52% or <48% = asymmetry worth investigating.';
COMMENT ON COLUMN runs.avg_vertical_oscillation    IS 'Average torso bounce per step (cm). 6-8cm = efficient. >10cm = wasted upward energy.';
COMMENT ON COLUMN runs.avg_vertical_ratio          IS 'Ratio of vertical oscillation to stride length (%). 8-10% = efficient. Higher = poor running economy.';
COMMENT ON COLUMN runs.aerobic_training_effect     IS 'Garmin aerobic training effect 0-5. 1=Recovery, 2=Base, 3=Tempo, 4=Threshold, 5=VO2 Max.';
COMMENT ON COLUMN runs.anaerobic_training_effect   IS 'Garmin anaerobic training effect 0-5. Indicates how much lactic / sprint work was done.';
COMMENT ON COLUMN runs.recovery_time_minutes       IS 'Garmin estimate of minutes until body is fully recovered and ready for next hard effort.';
COMMENT ON COLUMN runs.vo2_max_estimate            IS 'VO2 Max estimate from this specific run (ml/kg/min). Garmin updates this after quality training runs.';
COMMENT ON COLUMN runs.garmin_device_name          IS 'Friendly name of the Garmin device used. e.g. Fenix 7X, VivoActive 4, Forerunner 965.';
COMMENT ON COLUMN runs.ground_contact_time_data    IS 'JSONB number[] — GCT (ms) for each 2-second sample during the run. Index-aligned with pace_data timestamps.';
COMMENT ON COLUMN runs.vertical_oscillation_data   IS 'JSONB number[] — vertical oscillation (cm) per 2-second sample. Use for trend graphs showing efficiency over time.';
COMMENT ON COLUMN runs.stride_length_data          IS 'JSONB number[] — stride length (m) per 2-second sample. Terrain-adjusted interpretation required for analysis.';
COMMENT ON COLUMN runs.cadence_data                IS 'JSONB number[] — cadence (spm) per 2-second sample. More granular than the single cadence summary column.';

COMMENT ON TABLE  watch_biometric_samples          IS 'One row per 2-second data frame streamed from Garmin companion watch during a run. Powers fine-grained graphs, AI coaching, and My Data screen.';
COMMENT ON COLUMN watch_biometric_samples.elapsed_ms              IS 'Milliseconds since run start. Use as x-axis for all time-series graphs.';
COMMENT ON COLUMN watch_biometric_samples.terrain_grade           IS 'Computed server-side. Positive = uphill, negative = downhill. Critical for context-aware biomechanical analysis.';
COMMENT ON COLUMN watch_biometric_samples.estimated_fatigue       IS 'Computed server-side 0-100. Based on HR drift, vertical oscillation increase, and time elapsed.';
COMMENT ON COLUMN watch_biometric_samples.ground_contact_balance  IS '50% = perfectly symmetrical. Values outside 46-54% may indicate form asymmetry or early injury sign.';

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 5: Verify
-- ─────────────────────────────────────────────────────────────────────────────

-- Quick sanity check — list all new runs columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'runs'
  AND column_name IN (
    'avg_ground_contact_time', 'min_ground_contact_time', 'max_ground_contact_time',
    'avg_ground_contact_balance', 'avg_vertical_oscillation', 'max_vertical_oscillation',
    'avg_vertical_ratio', 'min_stride_length', 'max_stride_length',
    'aerobic_training_effect', 'anaerobic_training_effect', 'training_effect_label',
    'recovery_time_minutes', 'vo2_max_estimate',
    'avg_ambient_pressure', 'avg_bearing', 'garmin_device_name',
    'ground_contact_time_data', 'ground_contact_balance_data',
    'vertical_oscillation_data', 'vertical_ratio_data',
    'stride_length_data', 'cadence_data', 'altitude_data', 'bearing_data'
  )
ORDER BY column_name;

-- Confirm new table exists
SELECT COUNT(*) AS watch_samples_table_exists
FROM information_schema.tables
WHERE table_name = 'watch_biometric_samples';

-- Confirm indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'watch_biometric_samples'
ORDER BY indexname;

COMMIT;
