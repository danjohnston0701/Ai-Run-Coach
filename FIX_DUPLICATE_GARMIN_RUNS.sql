-- =============================================================================
-- Migration: Prevent duplicate Garmin companion run records
--
-- Problem: When a user runs with the Garmin watch + phone together, two upload
-- requests can arrive within milliseconds of each other (race condition).  Both
-- pass the application-level dedup check before either is committed, resulting
-- in two identical rows with the same external_id (Garmin activity ID).
--
-- Fix: A partial unique index on (user_id, external_id) where external_id IS NOT
-- NULL ensures the database itself rejects the second insert.  The application
-- catches the resulting 23505 error and returns the already-saved record instead.
--
-- Run this in the Neon SQL editor ONCE.
-- =============================================================================

-- Step 1: Remove existing duplicates, keeping the EARLIEST record for each
--         (user_id, external_id) pair.  This is safe to run even if there are
--         no duplicates — the DELETE will simply affect 0 rows.
-- ⚠ WARNING: This permanently deletes the later duplicate rows.  Verify the
--   query first with a SELECT before running the DELETE in production.
--
-- Preview (shows which rows would be deleted):
/*
WITH ranked AS (
  SELECT id, user_id, external_id, created_at,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, external_id
           ORDER BY created_at ASC            -- keep the earliest
         ) AS rn
  FROM runs
  WHERE external_id IS NOT NULL
)
SELECT r.id, r.user_id, r.external_id, r.created_at
FROM runs r
JOIN ranked ON r.id = ranked.id
WHERE ranked.rn > 1;
*/

-- Actual delete (keep oldest, remove later duplicates):
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, external_id
           ORDER BY created_at ASC
         ) AS rn
  FROM runs
  WHERE external_id IS NOT NULL
)
DELETE FROM runs
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Step 2: Add the unique partial index.
--   • Partial (WHERE external_id IS NOT NULL) so free runs without an external_id
--     are unaffected — they can coexist with any number of other free runs.
--   • IF NOT EXISTS makes the statement idempotent (safe to re-run).
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_user_external_id_unique
  ON runs (user_id, external_id)
  WHERE external_id IS NOT NULL;

-- Step 3: Verify
SELECT
  COUNT(*)                                              AS total_runs,
  COUNT(*) FILTER (WHERE external_id IS NOT NULL)       AS runs_with_external_id,
  COUNT(DISTINCT (user_id, external_id))
    FILTER (WHERE external_id IS NOT NULL)              AS distinct_user_external_id_pairs
FROM runs;
