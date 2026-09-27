/**
 * Post-run "forgot to stop" detection — the end-of-run counterpart to Android's
 * start-line idle credit (RunTrackingService.hasCreditedStartIdle).
 *
 * The start case can be handled live: once sustained movement is confirmed, everything
 * before it is idle. The end case can't — while the runner is walking, the tracker has no
 * way to know whether it's a walk break or the cool-down after they've finished. So this
 * runs after the fact, over the whole saved GPS track: find the last moment the runner was
 * genuinely running, check that everything after it is a sustained walk/standstill that
 * never returns to running pace, and if so SUGGEST trimming the run to that point.
 * Nothing changes until the runner accepts on the Run Summary (routes-run-end-trim.ts),
 * and the full original data is kept in runs.end_trim so the trim can be undone.
 *
 * Worked example (Emma, 2026-09-25): ran 4.96 km to 38:52 at ~7:10/km, then walked for
 * 5:33 before stopping the session — recorded as 5.22 km / 44:25 / 8:30/km. Detected:
 * finish at 38:52, 4.96 km, 7:50/km.
 *
 * Deliberately NOT applied to Garmin/watch-recorded runs (watch data is the source of truth,
 * never corrected from phone-side heuristics) or to runs without a usable phone GPS track.
 */

const WINDOW_S = 20;               // trailing window for smoothed speed (robust to 1-point GPS jumps)
const MIN_WINDOW_SPAN_S = 10;      // a window must span at least this long to be trusted
const RUN_SPEED_FRACTION = 0.75;   // "still running" = at least 75% of the run's typical moving speed
const TAIL_SPEED_FRACTION = 0.70;  // the trimmed tail must average below 70% of typical speed…
const TAIL_MAX_SPEED_MS = 1.9;     // …and below a brisk walk (~8:45/km) in absolute terms
const WALK_MOVING_SPEED_MS = 0.6;  // walk sessions: only a genuine standstill tail is trimmed
const WALK_TAIL_MAX_SPEED_MS = 0.4;
const MIN_TAIL_S = 120;            // shorter than this isn't worth a prompt (Strava-like)
const MIN_KEPT_M = 1000;
const MIN_KEPT_S = 300;
const MIN_KEPT_FRACTION = 0.5;     // never suggest throwing away most of a run
const TARGET_TOLERANCE = 0.01;     // GPS can't resolve better than ~1% — 4.96 km counts as a 5 km target

export interface EndTrimSuggestion {
  /** Index of the last kept gps_track point. */
  keepThroughIndex: number;
  /** Wall-clock time of the detected finish (epoch ms). */
  finishedAtMs: number;
  newDistanceKm: number;
  newDurationSec: number;
  newAvgPace: string;
  removedSeconds: number;
  removedMeters: number;
  /** "walk" = walked after finishing; "stationary" = stood still. */
  tailKind: "walk" | "stationary";
}

export interface EndTrimState {
  status: "applied" | "dismissed";
  at: string;
  finishedAtMs?: number;
  removedSeconds?: number;
  removedMeters?: number;
  /** Pre-trim values of every column the trim rewrote — restored verbatim by undo. */
  original?: Record<string, any>;
}

interface TrackPoint { t: number; d: number; elapsed: number | null; raw: any }

/**
 * jsonb series columns can hold either a real array or a JSON-encoded STRING of one — iOS
 * uploads paceData as a string (APIModels.swift `let paceData: String?`), so the column
 * holds a jsonb string scalar. Returns the array either way, or null.
 */
function parseSeries(v: any): any[] | null {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Store a trimmed series back in the same form it arrived in (array or JSON string). */
function sameFormAs(original: any, series: any[]): any {
  return typeof original === "string" ? JSON.stringify(series) : series;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseTimestampMs(ts: any): number | null {
  if (typeof ts === "number" && Number.isFinite(ts)) return ts > 1e11 ? ts : null; // epoch ms only
  if (typeof ts === "string" && ts.length > 0) {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Duration column may be seconds or legacy milliseconds (see transformRunForAndroid). */
function durationSeconds(raw: number): number {
  return raw > 86400 ? raw / 1000 : raw;
}

function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "0:00";
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm - m * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isWalkSession(run: any): boolean {
  return run.sessionType === "walk" || run.activityType === "walk";
}

/** Garmin/watch-recorded runs are never trimmed — watch data is the source of truth. */
export function isEndTrimEligible(run: any): boolean {
  if (!run || run.externalSource || run.hasGarminData || run.garminActivityId) return false;
  const track = parseSeries(run.gpsTrack);
  if (!track || track.length < 30) return false;
  if (!(Number(run.distance) > 0) || !(Number(run.duration) > 0)) return false;
  return true;
}

function buildTrack(run: any): TrackPoint[] | null {
  const raw = parseSeries(run.gpsTrack);
  if (!raw) return null;
  const t0 = parseTimestampMs(raw[0]?.timestamp);
  if (t0 == null) return null;
  // Prefer the app's own cumulative distance (iOS records it per point and it is exactly
  // what was saved as runs.distance); otherwise accumulate haversine.
  const hasCumDist = raw.every(p => typeof p?.distanceMeters === "number");
  const pts: TrackPoint[] = [];
  let d = 0;
  let prevT = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const ms = parseTimestampMs(p?.timestamp);
    const lat = Number(p?.latitude ?? p?.lat);
    const lon = Number(p?.longitude ?? p?.lng);
    if (ms == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const t = (ms - t0) / 1000;
    if (t < prevT) return null; // out-of-order track — don't guess
    if (hasCumDist) {
      d = Math.max(d, p.distanceMeters);
    } else if (pts.length > 0) {
      const q = raw[i - 1];
      d += haversineM(Number(q.latitude ?? q.lat), Number(q.longitude ?? q.lng), lat, lon);
    }
    pts.push({ t, d, elapsed: typeof p?.elapsedSeconds === "number" ? p.elapsedSeconds : null, raw: p });
    prevT = t;
  }
  return pts;
}

/** Trailing-window speed (m/s) at each point; null where the window is too short to trust. */
function windowSpeeds(pts: TrackPoint[]): (number | null)[] {
  const out: (number | null)[] = [];
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (pts[j].t < pts[i].t - WINDOW_S) j++;
    const span = pts[i].t - pts[j].t;
    out.push(span >= MIN_WINDOW_SPAN_S ? (pts[i].d - pts[j].d) / span : null);
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Returns a trim suggestion, or null when the run looks like it ended where it was stopped. */
export function detectEndTrim(run: any): EndTrimSuggestion | null {
  if (!isEndTrimEligible(run)) return null;
  const pts = buildTrack(run);
  if (!pts || pts.length < 30) return null;

  const last = pts[pts.length - 1];
  const totalS = durationSeconds(Number(run.duration));
  const firstMs = parseTimestampMs(pts[0].raw.timestamp)!;

  // Where the session actually ended, relative to the first GPS point. completedAt is the
  // Stop-button time; if it's inconsistent with the track (timezone-shifted legacy rows),
  // fall back to the last GPS point so we never invent a tail that isn't in the data.
  let sessionEndT = last.t;
  const completedMs = run.completedAt ? new Date(run.completedAt).getTime() : NaN;
  if (Number.isFinite(completedMs)) {
    const rel = (completedMs - firstMs) / 1000;
    if (rel >= last.t && rel - last.t < 3600) sessionEndT = rel;
  }
  // A duration longer than the recording's wall-clock span is corrupt (e.g. an epoch value
  // stored as duration) — nothing derived from it can be trusted. Slack covers GPS first-fix lag.
  if (totalS > sessionEndT + 600) return null;

  const speeds = windowSpeeds(pts);
  const walk = isWalkSession(run);
  let runThreshold: number;
  let tailMax: number;
  if (walk) {
    runThreshold = WALK_MOVING_SPEED_MS;
    tailMax = WALK_TAIL_MAX_SPEED_MS;
  } else {
    // The runner's typical moving speed, from the body of the run (stops excluded).
    const body = speeds.filter((v, i): v is number => v != null && v > 0.8 && pts[i].t <= last.t * 0.9);
    if (body.length < 10) return null;
    const typical = median(body);
    runThreshold = RUN_SPEED_FRACTION * typical;
    tailMax = Math.min(TAIL_SPEED_FRACTION * typical, TAIL_MAX_SPEED_MS);
  }

  // Last point whose smoothed speed was still at running pace…
  let lastRunIdx = -1;
  for (let i = pts.length - 1; i >= 0; i--) {
    const v = speeds[i];
    if (v != null && v >= runThreshold) { lastRunIdx = i; break; }
  }
  if (lastRunIdx < 1) return null;

  // …refined to the exact point, within that trailing window, where the per-point speed
  // last reached running pace (the smoothed window lags the real change by up to WINDOW_S).
  let k = lastRunIdx;
  for (let i = lastRunIdx; i >= 1 && pts[i].t >= pts[lastRunIdx].t - WINDOW_S; i--) {
    const dt = pts[i].t - pts[i - 1].t;
    if (dt > 0 && (pts[i].d - pts[i - 1].d) / dt >= runThreshold) { k = i; break; }
  }

  const tailS = sessionEndT - pts[k].t;
  if (tailS < MIN_TAIL_S) return null;

  const tailGpsS = last.t - pts[k].t;
  const tailM = last.d - pts[k].d;
  if (tailGpsS >= 30 && tailM / tailGpsS > tailMax) return null;

  const fraction = last.d > 0 ? pts[k].d / last.d : 0;
  const totalKm = Number(run.distance) > 200 ? Number(run.distance) / 1000 : Number(run.distance);
  const newDistanceKm = totalKm * fraction;
  // iOS stamps each point with the run clock (pauses excluded) — exact. Otherwise take the
  // tail's wall time off the recorded duration (assumes the tail itself wasn't paused).
  let newDurationSec = pts[k].elapsed != null ? pts[k].elapsed! : totalS - tailS;
  newDurationSec = Math.round(Math.min(Math.max(newDurationSec, 1), totalS));

  if (newDistanceKm * 1000 < MIN_KEPT_M || fraction < MIN_KEPT_FRACTION || newDurationSec < MIN_KEPT_S) return null;

  return {
    keepThroughIndex: k,
    finishedAtMs: firstMs + pts[k].t * 1000,
    newDistanceKm: Math.round(newDistanceKm * 1000) / 1000,
    newDurationSec,
    newAvgPace: formatPace(newDurationSec / newDistanceKm),
    removedSeconds: Math.round(totalS - newDurationSec),
    removedMeters: Math.round((totalKm - newDistanceKm) * 1000),
    tailKind: tailGpsS >= 30 && tailM / tailGpsS >= WALK_MOVING_SPEED_MS ? "walk" : "stationary",
  };
}

// Columns rewritten by a trim — snapshotted into end_trim.original and restored by undo.
const TRIMMED_COLUMNS = [
  "distance", "duration", "avgPace", "avgSpeed", "maxSpeed", "movingTime", "elapsedTime", "completedAt",
  "gpsTrack", "paceData", "heartRateData", "cadenceData", "altitudeData", "kmSplits",
  "minElevation", "maxElevation", "elevationGain", "elevationLoss", "totalSteps",
  "calories", "activeCalories", "tss", "avgHeartRate", "maxHeartRate", "wasTargetAchieved",
] as const;

function truncateSeries(series: any, fraction: number): any {
  const arr = parseSeries(series);
  if (!arr || arr.length < 2) return series;
  return sameFormAs(series, arr.slice(0, Math.max(1, Math.round(arr.length * fraction))));
}

/** Build the column patch that applies a suggestion (including the end_trim record). */
export function buildEndTrimPatch(run: any, s: EndTrimSuggestion): Record<string, any> {
  const original: Record<string, any> = {};
  for (const col of TRIMMED_COLUMNS) original[col] = run[col] ?? null;

  const track = parseSeries(run.gpsTrack)!;
  const kept = track.slice(0, s.keepThroughIndex + 1);
  const pointFraction = kept.length / track.length;
  const totalS = durationSeconds(Number(run.duration));
  const timeFraction = s.newDurationSec / totalS;
  const oldKm = Number(run.distance) > 200 ? Number(run.distance) / 1000 : Number(run.distance);
  const distFraction = oldKm > 0 ? s.newDistanceKm / oldKm : 1;

  const patch: Record<string, any> = {
    distance: Number(run.distance) > 200 ? s.newDistanceKm * 1000 : s.newDistanceKm,
    duration: Number(run.duration) > 86400 ? s.newDurationSec * 1000 : s.newDurationSec,
    avgPace: s.newAvgPace,
    completedAt: new Date(s.finishedAtMs),
    gpsTrack: sameFormAs(run.gpsTrack, kept),
    paceData: truncateSeries(run.paceData, pointFraction),
    heartRateData: truncateSeries(run.heartRateData, pointFraction),
    cadenceData: truncateSeries(run.cadenceData, pointFraction),
    altitudeData: truncateSeries(run.altitudeData, pointFraction),
  };

  if (run.avgSpeed != null) patch.avgSpeed = (s.newDistanceKm * 1000) / s.newDurationSec;
  if (run.movingTime != null) patch.movingTime = Math.max(0, Math.round(run.movingTime - s.removedSeconds));
  if (run.elapsedTime != null) patch.elapsedTime = Math.max(0, Math.round(run.elapsedTime - s.removedSeconds));

  if (Array.isArray(run.kmSplits)) {
    // Only whole kilometres survive — a split that ends in the trimmed tail is dropped.
    patch.kmSplits = run.kmSplits.filter((sp: any, i: number) => {
      const km = Number(sp?.distanceKm ?? sp?.km ?? sp?.kilometer ?? i + 1);
      return !(km > s.newDistanceKm + 1e-6);
    });
  }

  const speeds = kept.map(p => p?.speed).filter((v): v is number => typeof v === "number" && v >= 0);
  if (speeds.length > 0 && run.maxSpeed != null) patch.maxSpeed = Math.max(...speeds);

  const elev = kept.map(p => p?.elevation ?? p?.altitude).filter((v): v is number => typeof v === "number");
  if (elev.length > 0) {
    if (run.minElevation != null) patch.minElevation = Math.min(...elev);
    if (run.maxElevation != null) patch.maxElevation = Math.max(...elev);
  }
  const lastKept = kept[kept.length - 1];
  if (typeof lastKept?.cumulativeElevationGain === "number" && run.elevationGain != null) patch.elevationGain = lastKept.cumulativeElevationGain;
  if (typeof lastKept?.cumulativeElevationLoss === "number" && run.elevationLoss != null) patch.elevationLoss = lastKept.cumulativeElevationLoss;

  if (run.totalSteps != null) {
    patch.totalSteps = typeof lastKept?.totalSteps === "number" ? lastKept.totalSteps : Math.round(run.totalSteps * timeFraction);
  }
  if (run.calories != null) patch.calories = Math.round(run.calories * distFraction);
  if (run.activeCalories != null) patch.activeCalories = Math.round(run.activeCalories * distFraction);
  if (run.tss != null) patch.tss = Math.round(run.tss * timeFraction);

  const hr = kept.map(p => p?.heartRate ?? p?.hr).filter((v): v is number => typeof v === "number" && v > 0);
  if (hr.length > 0) {
    patch.avgHeartRate = Math.round(hr.reduce((a, b) => a + b, 0) / hr.length);
    patch.maxHeartRate = Math.max(...hr);
  }

  const targetKm = Number(run.targetDistance);
  if (targetKm > 0) {
    const distanceOk = s.newDistanceKm >= targetKm * (1 - TARGET_TOLERANCE);
    const targetMs = Number(run.targetTime);
    const timeOk = !(targetMs > 0) || s.newDurationSec * 1000 <= targetMs;
    patch.wasTargetAchieved = distanceOk && timeOk;
  }

  const state: EndTrimState = {
    status: "applied",
    at: new Date().toISOString(),
    finishedAtMs: s.finishedAtMs,
    removedSeconds: s.removedSeconds,
    removedMeters: s.removedMeters,
    original,
  };
  patch.endTrim = state;
  return patch;
}

/** Column patch that restores a trimmed run; the run is then marked dismissed (kept as recorded). */
export function buildEndTrimUndoPatch(run: any): Record<string, any> | null {
  const state = run.endTrim as EndTrimState | null;
  if (state?.status !== "applied" || !state.original) return null;
  const patch: Record<string, any> = {};
  for (const col of TRIMMED_COLUMNS) {
    let v = state.original[col];
    if (col === "completedAt" && v != null) v = new Date(v);
    patch[col] = v;
  }
  patch.endTrim = { status: "dismissed", at: new Date().toISOString() } satisfies EndTrimState;
  return patch;
}
