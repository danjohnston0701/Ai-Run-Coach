-- Known routes were named, and given their typical days / start time, from the server's UTC
-- clock (route-recognition-service.ts used getDay()/getHours()), so a New Zealand Saturday
-- 08:00 run became "Friday Evening Run". The code now uses users.timezone; this rewrites the
-- existing rows from their constituent runs in the runner's own time zone.
--   name     — "<day> <time of day>" prefix rebuilt like generateRouteName(): the day of the
--              route's second run (the one that created it; else its latest), time of day from
--              the average of its first two runs; the distance word and Run/Walk are kept.
--   typical_days_of_week / typical_start_hour / typical_start_minute — from all its runs.
-- runs.completed_at is a UTC timestamp without time zone. Idempotent.
WITH c AS (
  SELECT kr.id, e.ord,
         (r.completed_at AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(u.timezone, 'UTC') AS lt
  FROM known_routes kr
  JOIN users u ON u.id = kr.user_id
  CROSS JOIN LATERAL jsonb_array_elements_text(kr.constituent_run_ids) WITH ORDINALITY e(run_id, ord)
  JOIN runs r ON r.id = e.run_id
  WHERE r.completed_at IS NOT NULL
), agg AS (
  SELECT id,
    jsonb_agg(DISTINCT extract(dow FROM lt)::int) AS days,
    round(avg(extract(hour FROM lt) * 60 + extract(minute FROM lt)))::int AS all_min,
    round(avg(extract(hour FROM lt) * 60 + extract(minute FROM lt)) FILTER (WHERE ord <= 2))::int AS first2_min,
    COALESCE(max(lt) FILTER (WHERE ord = 2), max(lt)) AS name_lt
  FROM c GROUP BY id
)
UPDATE known_routes kr SET
  name = trim(to_char(a.name_lt, 'Day')) || ' '
         || CASE WHEN a.first2_min < 720 THEN 'Morning' WHEN a.first2_min < 1020 THEN 'Afternoon' ELSE 'Evening' END
         || substring(kr.name from '^\S+ \S+(.*)$'),
  typical_days_of_week = a.days,
  typical_start_hour = a.all_min / 60,
  typical_start_minute = a.all_min % 60
FROM agg a
WHERE a.id = kr.id
  AND kr.name ~ '^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) (Morning|Afternoon|Evening)\M';
