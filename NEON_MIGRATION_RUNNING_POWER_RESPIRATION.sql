-- ============================================================================
-- NEON Migration: Add Running Power & Respiration Rate Metrics
-- ============================================================================
--
-- Purpose: Add support for the new Garmin running power and respiration rate
-- metrics that are now captured from watches (Fenix 7+, FR965) and included
-- in coaching requests and post-run analysis.
--
-- Changes:
-- 1. Add power/respiration columns to `runs` table (averages for run summary)
-- 2. Add power/respiration time-series columns to `runs` table (for graphing)
-- 3. Add power/respiration columns to `watch_biometric_samples` (per-sample data)
--
-- Backward Compatible: All new columns are nullable, safe to add to live DB
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add Running Power columns to `runs` table
-- ────────────────────────────────────────────────────────────────────────────
--
-- avgRunningPower: average watts expended during the run
-- maxRunningPower: peak watts during the run
-- runningPowerData: time-series array [watts per 2s sample]
--
-- Device Support:
--   - Fenix 7, Fenix 7X, Fenix 8
--   - FR965
--   - FR245M+ (with running power app)
--   - Null on unsupported devices (FR945, older models)
--
ALTER TABLE runs
ADD COLUMN IF NOT EXISTS avg_running_power INTEGER,          -- avg watts
ADD COLUMN IF NOT EXISTS max_running_power INTEGER,          -- peak watts
ADD COLUMN IF NOT EXISTS running_power_data jsonb;           -- number[] – watts per 2s sample

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Add Respiration Rate columns to `runs` table
-- ────────────────────────────────────────────────────────────────────────────
--
-- avgRespirationRate: average breaths per minute during the run
-- respirationRateData: time-series array [breaths/min per 2s sample]
--
-- Device Support:
--   - Fenix 7, Fenix 7X, Fenix 8
--   - FR965
--   - Null on unsupported devices
--
-- Ranges (device-dependent):
--   - Easy pace: 30-38 bpm
--   - Steady: 38-45 bpm
--   - Tempo: 45-53 bpm
--   - Threshold: 53-60 bpm
--   - VO2 Max: 60+ bpm
--
ALTER TABLE runs
ADD COLUMN IF NOT EXISTS avg_respiration_rate REAL,          -- avg breaths/min
ADD COLUMN IF NOT EXISTS respiration_rate_data jsonb;        -- number[] – breaths/min per 2s sample

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Add Power & Respiration columns to `watch_biometric_samples` table
-- ────────────────────────────────────────────────────────────────────────────
--
-- These capture per-sample (every 2 seconds) running power and respiration data
-- from the watch during the run. Used for:
-- - Fine-grained time-series graphs
-- - AI coaching analysis (detecting fatigue, efficiency changes)
-- - Post-run insights (power curves, breathing patterns)
--
ALTER TABLE watch_biometric_samples
ADD COLUMN IF NOT EXISTS running_power INTEGER,              -- watts per sample
ADD COLUMN IF NOT EXISTS respiration_rate REAL;              -- breaths/min per sample

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Add indexes for efficient queries on new columns
-- ────────────────────────────────────────────────────────────────────────────

-- Index for finding runs with power data (for post-run analysis, grouping by fitness level)
CREATE INDEX IF NOT EXISTS idx_runs_avg_running_power ON runs(avg_running_power)
  WHERE avg_running_power IS NOT NULL;

-- Index for finding runs with respiration data (for breathing pattern analysis)
CREATE INDEX IF NOT EXISTS idx_runs_avg_respiration_rate ON runs(avg_respiration_rate)
  WHERE avg_respiration_rate IS NOT NULL;

-- Index for querying biometric samples by power (for power curve graphs, fatigue detection)
CREATE INDEX IF NOT EXISTS idx_watch_biometrics_running_power ON watch_biometric_samples(running_power)
  WHERE running_power IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Data Migration Notes (No Action Required)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Existing runs will have NULL values for these columns.
-- New runs with Garmin watches (Fenix 7+, FR965) will populate:
--   - avg_running_power, max_running_power, running_power_data
--   - avg_respiration_rate, respiration_rate_data
--
-- Post-run analysis (AI coaching) will check for these fields and include them
-- in the analysis request if present (safely nullable).
--
-- UI graphs will display these metrics only if data is present.
--
-- ────────────────────────────────────────────────────────────────────────────
-- Verification Queries (run these to confirm migration)
-- ────────────────────────────────────────────────────────────────────────────
--
-- -- List new columns in runs table:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'runs'
-- AND column_name IN ('avg_running_power', 'max_running_power', 'running_power_data',
--                     'avg_respiration_rate', 'respiration_rate_data')
-- ORDER BY column_name;
--
-- -- List new columns in watch_biometric_samples table:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'watch_biometric_samples'
-- AND column_name IN ('running_power', 'respiration_rate')
-- ORDER BY column_name;
--
-- -- Count runs with power data:
-- SELECT COUNT(*) as runs_with_power FROM runs WHERE avg_running_power IS NOT NULL;
--
-- -- Count runs with respiration data:
-- SELECT COUNT(*) as runs_with_respiration FROM runs WHERE avg_respiration_rate IS NOT NULL;
--
-- ════════════════════════════════════════════════════════════════════════════
