-- Watch runs used to be named after the watch model ("Venu 2S Run", "fēnix 8 47mm / 51mm /
-- tactix 8 47mm / 51mm / quatix 8 47mm / 51mm Run", "Garmin Watch Run"). New runs get the same
-- default as every other run (defaultRunName() in server/utils/run-derivation.ts): the planned
-- workout's name, else the local time of day. This renames the old ones to match.
--
-- Only touches names that are exactly the old device-label pattern, so a runner's own rename is
-- never overwritten. Idempotent: run it again after the Replit redeploy to catch watch runs saved
-- in between. On 2026-10-18 it matched 44 runs: 43 free, one park_run.

UPDATE runs SET name =
  CASE
    WHEN workout_type = 'park_run' THEN 'parkrun'
    ELSE
      CASE
        WHEN split_part(run_time, ':', 1)::int BETWEEN 5 AND 11 THEN 'Morning'
        WHEN split_part(run_time, ':', 1)::int BETWEEN 12 AND 13 THEN 'Lunch'
        WHEN split_part(run_time, ':', 1)::int BETWEEN 14 AND 16 THEN 'Afternoon'
        WHEN split_part(run_time, ':', 1)::int BETWEEN 17 AND 20 THEN 'Evening'
        ELSE 'Night'
      END || CASE WHEN session_type = 'walk' THEN ' Walk' ELSE ' Run' END
  END
WHERE run_time ~ '^\d{1,2}:\d{2}'
  AND name IN (garmin_device_name || ' Run', garmin_device_name || ' Walk',
               'Garmin Watch Run', 'Garmin Watch Walk',
               'Samsung Galaxy Watch Run', 'Samsung Galaxy Watch Walk');
