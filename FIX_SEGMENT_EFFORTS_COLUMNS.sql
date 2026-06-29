-- =============================================================================
-- FIX_SEGMENT_EFFORTS_COLUMNS.sql
-- Run this in your Neon SQL editor.
--
-- Fixes PostgreSQL error 42703 "column does not exist" thrown from
-- matchRunToSegments() after every run is saved.
--
-- Root cause: columns were added to the Drizzle schema (schema.ts) for
-- segment_efforts and segments but the corresponding ALTER TABLE statements
-- were never run in production, so the DB is missing these columns.
-- =============================================================================

-- ── segment_efforts: add all columns that may be missing ─────────────────────

-- Achievement / leaderboard columns (most likely culprits for the 42703 error)
ALTER TABLE segment_efforts ADD COLUMN IF NOT EXISTS achievement_type TEXT;
ALTER TABLE segment_efforts ADD COLUMN IF NOT EXISTS leaderboard_rank  INTEGER;
ALTER TABLE segment_efforts ADD COLUMN IF NOT EXISTS yearly_rank       INTEGER;
ALTER TABLE segment_efforts ADD COLUMN IF NOT EXISTS monthly_rank      INTEGER;

-- Optional biometric columns
ALTER TABLE segment_efforts ADD COLUMN IF NOT EXISTS moving_time  INTEGER;  -- seconds excluding pauses
ALTER TABLE segment_efforts ADD COLUMN IF NOT EXISTS avg_power    INTEGER;  -- watts

-- ── segments: add columns that may be missing ────────────────────────────────

ALTER TABLE segments ADD COLUMN IF NOT EXISTS effort_count INTEGER DEFAULT 0;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS star_count   INTEGER DEFAULT 0;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS avg_gradient REAL;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS max_gradient REAL;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS terrain_type TEXT;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS city         TEXT;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS country      TEXT;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS category     TEXT DEFAULT 'community';
ALTER TABLE segments ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN DEFAULT FALSE;

-- ── Indexes for performance ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_segment_efforts_segment_id
    ON segment_efforts(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_user_id
    ON segment_efforts(user_id);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_run_id
    ON segment_efforts(run_id);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_elapsed_time
    ON segment_efforts(segment_id, elapsed_time);  -- for leaderboard queries

CREATE INDEX IF NOT EXISTS idx_segments_location
    ON segments(start_lat, start_lng, end_lat, end_lng);  -- for bounding-box queries
