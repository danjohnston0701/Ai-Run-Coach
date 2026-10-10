-- runs.distance: saved to 2 decimal places, and snapped up to the whole km when it's 0.03 km
-- or less short of it (2026-10-09). Applied automatically by server/auto-migrate.ts on server
-- start; this file is the canonical copy.
--
--   3.9988697 -> 4.00   (2 dp)
--   3.97      -> 4.00   (within 0.03 of the next km)
--   3.96      -> 3.96
--   5.554     -> 5.55   (normal rounding otherwise — never adds more than 5 m)
--
-- The snap is judged on the 2-dp value, so 3.9688 (-> 3.97) snaps too. Values > 200 are left
-- alone: those are legacy rows stored in metres (the "distance > 200" heuristic used across
-- the codebase), and rounding metres to 2 dp would be meaningless.
--
-- A trigger rather than application code: runs are written from many places (POST /api/runs,
-- both watch companion paths, Strava/Garmin imports, end-trim, dedup merges, raw SQL), and a
-- trigger covers every one of them, including any added later.

CREATE OR REPLACE FUNCTION run_distance_km_normalized(d double precision)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d IS NULL OR d <= 0 OR d > 200 THEN d::numeric
    WHEN ceil(round(d::numeric, 2)) - round(d::numeric, 2) <= 0.03 THEN ceil(round(d::numeric, 2))
    ELSE round(d::numeric, 2)
  END
$$;

CREATE OR REPLACE FUNCTION runs_normalize_distance()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.distance := run_distance_km_normalized(NEW.distance);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_runs_normalize_distance ON runs;
CREATE TRIGGER trg_runs_normalize_distance
  BEFORE INSERT OR UPDATE OF distance ON runs
  FOR EACH ROW EXECUTE FUNCTION runs_normalize_distance();

-- Backfill existing rows (idempotent: only rows not already normalised are touched).
UPDATE runs
SET distance = run_distance_km_normalized(distance)
WHERE distance > 0 AND distance <= 200
  AND distance::numeric IS DISTINCT FROM run_distance_km_normalized(distance);

-- Afterwards: POST /api/my-data/admin/recompute-all so cached totals/PBs match
-- (server/auto-migrate.ts does this itself for the users whose runs it changed).
