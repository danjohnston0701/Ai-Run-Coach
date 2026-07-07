---
name: Run route point key convention
description: What key names run GPS route points use across the API boundary
---

# Run route point keys

`GET /api/runs/:id` runs through `transformRunForAndroid` (server/routes.ts), which
normalizes the DB `gpsTrack` column into a `routePoints` array where each point uses
`{ latitude, longitude, timestamp, speed, altitude, heartRate, bearing, cadence }`.

**Key trap:** the keys are `latitude`/`longitude` (spelled out), NOT `lat`/`lng`.

**Why:** the React web video page (`client/src/pages/RunVideoShare.tsx`) originally
filtered/read points as `p.lat && p.lng`, so every point was dropped, the map tiles
and route never rendered, and the "share run video" came out blank (only the stats
overlay drew). Coordinates can also arrive as numeric strings from mixed legacy data.

**How to apply:** any web/client code consuming `run.routePoints` must accept both
`latitude/longitude` and `lat/lng`, and coerce with `Number(...)` + `Number.isFinite`
before use.
