# iOS parity brief — half-marathon field review fixes (2026-09-20)

Source: Daniel's half marathon on 2026-09-20 (run `8fc48829-…`, exported as `runs (71).json`),
reviewed against the Android app + backend.

**STATUS 2026-09-20: ported to iOS the same day** (build-verified with `xcodebuild`, tree left
uncommitted as usual there). What landed in the Xcode project: `sessionClockSeconds` +
`watchElapsedAnchor*` (item 1), heart-rate staleness on the timer tick (item 2), altitude
series extended from phone points after the watch goes silent (item 5), `trailingWindowGradePercent()`
with 10% steep bands (item 4 below), `Run.elevationRangeM` + min/max upload + "Elevation" in
the summary (item 5 below), `WindContext`/`KmSplitBrief` + the new optional fields on all five
coaching requests incl. HR's `kmSplits/distance/targetDistance/targetTime/avgPace/targetPace/
paceVsTargetPercent`, `WeatherData.windDirection`, and the m/s→km/h wind label. Items 3 and
the struggle-after-target gate were already correct on iOS. The backend also now aliases iOS's
`km_splits` → `kmSplits` on the pace-update and elite routes. Remaining: on-device verification
with a real Garmin run (the dead-watch path especially). The sections below are kept as the
design reference.

## 1. Watch died mid-run → duration froze (Android `RunTrackingService`)
The Garmin died at 20.6 km. Phone GPS took over distance (existing 15 s staleness fallback) but
the session clock, HR and the sampled series did not fall back:
- Duration was `watchElapsedSeconds` unconditionally → saved 1:49:13 vs real 1:54:09; km-21
  split recorded as a bogus 4:15; "Final 250m" projected a finish earlier than the moment it
  was spoken.
- **Android fix:** `currentWatchClockMs()` — watch timer authoritative while frames arrive;
  once stale ≥15 s, the last watch value is carried forward on the phone's active-run clock
  (anchored at the last accepted frame). Used for the live timer, ETA maths, km-split clock
  and the saved duration. Watch value wins again the moment frames resume.
- HR held its last value (126 bpm) forever and was stamped into every later GPS point.
  **Android fix:** `checkHeartRateStaleness()` on the 1 Hz tick — no accepted HR sample for
  30 s → HR = unknown, confidence window cleared.
- `heart_rate_data`/`pace_data`/`altitude_data` stopped at the watch's death while the GPS
  track continued; the summary elevation chart stretches a truncated series across the whole
  run. **Android fix:** while the phone fallback is active, pace/altitude samples are appended
  from phone fixes at ~2 s spacing (HR correctly stays absent).
- **iOS:** check the Apple Watch / Garmin mirrored-session paths for the same three
  assumptions (watch clock never stale, last HR never expires, series only fed by watch frames).

## 2. "Current pace" quoted by the coach ≠ pace on the watch face
Android's `injectWatchLocation()` set `currentPace` from the watch's Doppler `currentSpeed`
(what the Garmin companion app displays), then `onNewLocation()` overwrote it with a
haversine-over-8-points pace — 4–5% faster over the first 4 km on this run. Fixed: watch-provider
fixes keep the speed-derived pace. **iOS:** if a watch speed field is available, make the pace
the coach quotes the same number the watch face shows.

## 3. Struggle coaching fired after the target was reached
`isInFinalStretch()` used `remaining in 0..500`, so past the target (`remaining < 0`) all
analysis coaching re-armed. Now `remaining <= 500`. **iOS:** check the equivalent gate.

## 4. Grade measurement (the "every rise is a steep hill" complaint)
Android's live grade was `(Δ of a 5-sample altitude mean) ÷ one GPS step (~6 m)` — a noise
amplifier: p5–p95 of ±8% on ground whose true grade sat within ±5%; 421 ticks read "steep"
(≥5%) at a median true grade of 2.6%. `steepestIncline` was the worst consecutive point pair
(50.5% on a flat course).
- **Android fix:** `trailingWindowGradePercent()` — rise over the trailing 100 m of route;
  steepest incline/decline tracked from the same window. Thresholds: gentle 3–6%, climb
  6–10%, **steep ≥10%** (was 5%). `STEEP_DOWNHILL` now −10 (was −9).
- Units are **percent grade** everywhere (the `inclineDegrees` GPS-point field is misnamed but
  holds percent — unchanged on the wire). The summary "Max Incline" tile now shows `%`, not `°`.
- **iOS:** audit how the live grade is computed; anything dividing by a single point spacing
  has the same problem. Match the 100 m window and the 3/6/10 bands.

## 5. Elevation figure shown to the runner = altitude range (max − min)
Product decision: the elevation number on the summary and share image is highest − lowest
point, not the accumulated ascent (224 m of "climbing" on a 22 m-range course).
- Backend share image now renders the range (`RunDataForImage.minElevation/maxElevation`,
  fallback to the GPS track's altitude spread). Android summary tile relabelled "Elevation";
  Total Ascent/Descent remain only inside the detailed Garmin elevation card.
- **iOS:** wherever the run summary / share flow shows "Elev Gain", show `maxElevation −
  minElevation` labelled "Elevation".

## 6. Backend coaching-prompt changes (`server/ai-service.ts`) — new optional request fields
Shared helpers: `assessTargetPaceSettled`, `settledTargetPaceRule`, `runStageRule`,
`describeGrade`, `courseElevationLine`, `windLine`.
- **Target-pace nagging:** once the last ≥3 completed splits are consistent (adjacent ±15 s)
  and all ahead of target, or the runner is past halfway with a projected finish ≥5% inside
  the target time, the target pace is ruled out as a coaching lever (split, HR, ETA and
  pace-trend prompts). First early "you're ahead of target" observation is still allowed.
  HR coaching additionally refuses to repeat it if a recent message already raised it.
- **Run stage vocabulary:** explicit early / approaching-halfway / past-halfway / second-half /
  closing-stages line built from `distance`/`targetDistance` (fixes "approaching halfway" at
  31%, "final stretch" at 45%).
- **Grade wording:** "steep" only ≥10%; 6–10% "a 7% climb"; 3–6% "a gentle 4% incline".
- **Wind:** live prompts now describe wind (speed + headwind/tailwind/crosswind) and tell the
  model a slower split into a strong headwind is the wind, not fatigue.
- **New optional fields** (send them for parity):
  - all of `/api/coaching/pace-update`, `hr-coaching`, `elite-coaching`, `struggle-coaching`,
    `elevation-coaching`: `wind: { speedKmh, directionDeg, relative }` (directionDeg is
    meteorological "from"; relative = headwind if |heading − from| ≤ 45°, tailwind if ≥ 135°),
    `elevationRangeM` (max − min altitude so far).
  - `/api/coaching/hr-coaching` only: `kmSplits: [{km, pace}]`, `distance` (km),
    `targetDistance` (km), `targetTime` (s) — without these the HR settled rule can't run
    (it falls back to the "don't repeat" recent-messages check).
- Raw-data view: `windSpeed` from `/api/weather` is **km/h** (Open-Meteo `wind_speed_10m`);
  Android's raw-data screen was labelling it m/s and multiplying — check iOS's equivalent.

## 7. Not changed (deliberately)
- "Consecutive consistent splits" (adjacent ±10 s) praise logic — Daniel is happy with it.
- Cumulative `elevationGain`/`elevationLoss` in the DB, TSS, Strava/Garmin export — untouched.
