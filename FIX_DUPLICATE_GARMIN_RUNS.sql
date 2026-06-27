-- =============================================================================
-- Migration: Prevent duplicate Garmin companion run records
--
-- Problem: When a user runs with the Garmin watch + phone together, two upload
-- requests can arrive within milliseconds of each other (race condition).  Both
-- pass the application-level dedup check before either is committed, resulting
-- in two identical rows with the same external_id (Garmin activity ID).
--
-- Root cause of data loss: The watch creates the EARLIEST record (minimal data —
-- no coaching notes, no GPS track beyond basic summary) and the phone creates
-- the LATER record (rich data — ai_coaching_notes, gps_track, km_splits, etc.).
-- A naive "keep earliest" delete strategy threw away the coaching notes.
--
-- Fix applied at the application layer (routes.ts): Case 0 dedup now MERGES
-- coaching notes and other phone-only fields into the surviving watch record
-- before returning it, so no data is lost going forward.
--
-- Fix applied at the DB layer: A partial unique index enforces deduplication at
-- the database level as a final safety net.
--
-- Run this in the Neon SQL editor ONCE.
-- =============================================================================

-- Step 1: Merge coaching notes and rich data from LATER duplicates into the
--         EARLIER (surviving) record, then delete the later duplicates.
--
--         This prevents coaching notes from being silently lost when the phone
--         upload arrives after the watch upload.
--
-- ⚠  NOTE: If this migration was already run without the MERGE step (i.e. the
--    coaching notes were deleted), the UPDATE below will have no effect (there
--    is nothing to merge).  The application-layer fix in routes.ts prevents
--    future data loss.

-- 1a. Merge ai_coaching_notes from the later (richer) duplicate into the keeper.
WITH pairs AS (
  SELECT
    MIN(id) OVER (PARTITION BY user_id, external_id ORDER BY created_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS keep_id,
    id,
    ai_coaching_notes,
    gps_track,
    heart_rate_data,
    pace_data,
    struggle_points,
    km_splits,
    weather_data,
    target_distance,
    target_time,
    was_target_achieved,
    ROW_NUMBER() OVER (PARTITION BY user_id, external_id ORDER BY created_at ASC) AS rn
  FROM runs
  WHERE external_id IS NOT NULL
)
UPDATE runs r
SET
  ai_coaching_notes  = COALESCE(r.ai_coaching_notes,  p.ai_coaching_notes),
  gps_track          = COALESCE(r.gps_track,          p.gps_track),
  heart_rate_data    = COALESCE(r.heart_rate_data,     p.heart_rate_data),
  pace_data          = COALESCE(r.pace_data,           p.pace_data),
  struggle_points    = COALESCE(r.struggle_points,     p.struggle_points),
  km_splits          = COALESCE(r.km_splits,           p.km_splits),
  weather_data       = COALESCE(r.weather_data,        p.weather_data),
  target_distance    = COALESCE(r.target_distance,     p.target_distance),
  target_time        = COALESCE(r.target_time,         p.target_time),
  was_target_achieved = COALESCE(r.was_target_achieved, p.was_target_achieved)
FROM pairs p
WHERE r.id = p.keep_id   -- update the KEEPER row
  AND p.rn > 1;           -- only when there is a later duplicate to merge from

-- 1b. Now safely delete the later duplicates (rich data already merged above).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, external_id
           ORDER BY created_at ASC            -- keep the earliest
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
    FILTER (WHERE external_id IS NOT NULL)              AS distinct_user_external_id_pairs,
  COUNT(*) FILTER (WHERE external_id IS NOT NULL AND ai_coaching_notes IS NOT NULL)
                                                        AS runs_with_coaching_notes
FROM runs;
