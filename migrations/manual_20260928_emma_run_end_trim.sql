-- One-off correction: Emma's 2026-09-25 run (450dd0a6-7b1a-476c-9b94-d8f8b4dbae24).
-- She finished running at 38:52 / 4.963 km but kept recording for another 5:33 of walking
-- (saved as 5.22 km / 44:25 / 8:30/km). Corrected to what Android would have recorded:
--   • trimmed at the detected finish (38:52, 11:48:09 UTC) — server/run-end-trim.ts logic
--   • minus the 49 s start-line wait (Android's START_IDLE rule: 3 consecutive samples
--     faster than 18 min/km, credited to the earliest sample) — iOS has no such credit yet
-- Result: 4.963 km, 38:03, 7:40/km. Km split 1 loses the 49 s too (465 → 416 s).
-- Original row is copied to run_backup_20260928 first; restore from there if needed.

BEGIN;

CREATE TABLE IF NOT EXISTS run_backup_20260928 AS
  SELECT * FROM runs WHERE id = '450dd0a6-7b1a-476c-9b94-d8f8b4dbae24';

UPDATE runs SET
  distance            = 4.962892,
  duration            = 2283,                       -- 38:03 (seconds)
  avg_pace            = '7:40',
  completed_at        = '2026-09-25 11:48:09',      -- actual finish (UTC)
  -- GPS track up to the finish (first 755 of 803 points)
  gps_track           = CASE jsonb_typeof(gps_track)
                          WHEN 'string' THEN to_jsonb((
                            SELECT jsonb_agg(e ORDER BY i)
                              FROM jsonb_array_elements((gps_track #>> '{}')::jsonb) WITH ORDINALITY AS t(e, i)
                             WHERE i <= 755)::text)
                          WHEN 'array' THEN (
                            SELECT jsonb_agg(e ORDER BY i)
                              FROM jsonb_array_elements(gps_track) WITH ORDINALITY AS t(e, i)
                             WHERE i <= 755)
                          ELSE gps_track
                        END,
  -- pace samples, proportionally (752 of 800). iOS uploads paceData as a JSON-encoded
  -- STRING, so the column holds a jsonb string wrapping the array — unwrap, trim, and store
  -- it back in the same string form (a plain array is handled too).
  pace_data           = CASE jsonb_typeof(pace_data)
                          WHEN 'string' THEN to_jsonb((
                            SELECT jsonb_agg(e ORDER BY i)
                              FROM jsonb_array_elements((pace_data #>> '{}')::jsonb) WITH ORDINALITY AS t(e, i)
                             WHERE i <= 752)::text)
                          WHEN 'array' THEN (
                            SELECT jsonb_agg(e ORDER BY i)
                              FROM jsonb_array_elements(pace_data) WITH ORDINALITY AS t(e, i)
                             WHERE i <= 752)
                          ELSE pace_data
                        END,
  -- km 5 ended during the walk; km 1 loses the start-line wait
  km_splits           = '[{"pace":"6:56","distanceKm":1,"durationSeconds":416},
                          {"pace":"7:33","distanceKm":2,"durationSeconds":453},
                          {"pace":"7:59","distanceKm":3,"durationSeconds":479},
                          {"pace":"7:38","distanceKm":4,"durationSeconds":458}]'::jsonb,
  total_steps         = 621,                        -- step count at the finish point
  tss                 = 63,                         -- scaled with duration (74 × 2283/2665)
  was_target_achieved = true                        -- 4.963 km is within 1% of the 5 km target
WHERE id = '450dd0a6-7b1a-476c-9b94-d8f8b4dbae24'
  AND duration = 2665;                              -- only applies to the untouched original

-- My Data cache is derived data only: drop it so totals/PBs fall back to the live query
-- (the row is rebuilt automatically on her next saved run).
DELETE FROM user_stats WHERE user_id = 'a3a746b0-c1ce-41d7-ba71-1e86877924e0';

-- Sanity check — expect: 4.962892 | 2283 | 7:40 | 755 | 752 | 4
SELECT distance, duration, avg_pace,
       jsonb_array_length(CASE jsonb_typeof(gps_track) WHEN 'string' THEN (gps_track #>> '{}')::jsonb ELSE gps_track END) AS gps_points,
       jsonb_array_length(CASE jsonb_typeof(pace_data) WHEN 'string' THEN (pace_data #>> '{}')::jsonb ELSE pace_data END) AS pace_points,
       jsonb_array_length(km_splits) AS splits
  FROM runs WHERE id = '450dd0a6-7b1a-476c-9b94-d8f8b4dbae24';

COMMIT;
