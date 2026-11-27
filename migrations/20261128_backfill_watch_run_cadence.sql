-- Garmin watch runs: fill cadence_data / max_cadence / min_cadence from the cadence the watch
-- already recorded on each gps_track point. session/end never wrote these three columns
-- (fixed 2026-11-28 in server/routes.ts), so watch-only runs had no stored cadence series and
-- no max/min (Carsell's 26 Nov fēnix 5X Plus run). Only fills columns that are empty.
WITH c AS (
  SELECT r.id,
    (SELECT array_agg(round((p->>'cadence')::numeric)::int ORDER BY o)
       FROM jsonb_array_elements(r.gps_track) WITH ORDINALITY t(p, o)
      WHERE jsonb_typeof(p->'cadence') = 'number'
        AND (p->>'cadence')::numeric > 0 AND (p->>'cadence')::numeric < 260) AS vals
  FROM runs r
  WHERE jsonb_typeof(r.gps_track) = 'array'
    AND (r.external_source = 'garmin_companion' OR r.recording_source LIKE '%garmin_watch%')
)
UPDATE runs r SET
  cadence_data = CASE
    WHEN r.cadence_data IS NULL OR jsonb_typeof(r.cadence_data) <> 'array' OR jsonb_array_length(r.cadence_data) = 0
    THEN to_jsonb(c.vals) ELSE r.cadence_data END,
  max_cadence = COALESCE(r.max_cadence, (SELECT max(v) FROM unnest(c.vals) v)),
  min_cadence = COALESCE(r.min_cadence, (SELECT min(v) FROM unnest(c.vals) v)),
  cadence     = COALESCE(r.cadence, (SELECT round(avg(v))::int FROM unnest(c.vals) v))
FROM c
WHERE r.id = c.id
  AND array_length(c.vals, 1) >= 5
  AND (r.cadence_data IS NULL OR jsonb_typeof(r.cadence_data) <> 'array' OR jsonb_array_length(r.cadence_data) = 0
       OR r.max_cadence IS NULL OR r.min_cadence IS NULL OR r.cadence IS NULL);
