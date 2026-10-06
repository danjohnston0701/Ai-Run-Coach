/**
 * Pure derivation of run summary columns from data the run already carries (GPS track,
 * distance/duration, coaching notes, series). No DB access — see server/run-derived-fields.ts
 * for where this is applied (storage.createRun before insert + an hourly backfill sweep).
 *
 * Why: only Android computes most of these on the device. iOS uploads, Garmin/Wear companion
 * sessions and Strava/Garmin imports arrived with them NULL — e.g. Emma's 2026-09-30 iOS run had
 * no elevation, difficulty, terrain_type, avg_speed, moving/elapsed time, steepest incline/decline,
 * calories, ai_coach_enabled, run_date/run_time, struggle_points or workout_type.
 *
 * Every rule here mirrors the Android client (RunTrackingService) so the columns mean the same
 * thing whichever platform recorded the run. Only ever fills a NULL — client values always win.
 */

export type RecordingSource =
  | "phone"
  | "apple_watch"
  | "garmin_watch"
  | "wear_os_watch"
  | "phone_apple_watch"
  | "phone_garmin_watch"
  | "phone_wear_os_watch"
  | "strava_import";

export const RECORDING_SOURCES: ReadonlySet<string> = new Set<RecordingSource>([
  "phone", "apple_watch", "garmin_watch", "wear_os_watch",
  "phone_apple_watch", "phone_garmin_watch", "phone_wear_os_watch", "strava_import",
]);

/** workout_type values that mean "not a coaching-plan session" — never plan context for the AI. */
export const NON_PLAN_WORKOUT_TYPES: ReadonlySet<string> = new Set(["free", "watch_standalone"]);

/** Time-series columns clients may send as a JSON *string* (iOS always does) instead of an array. */
export const RUN_SERIES_FIELDS = [
  "heartRateData", "paceData", "cadenceData", "altitudeData", "groundContactTimeData",
  "groundContactBalanceData", "verticalOscillationData", "verticalRatioData", "strideLengthData",
  "runningPowerData", "respirationRateData", "bearingData", "stepsData", "temperatureData",
] as const;

/** A JSON-string series → its array; anything else unchanged. */
export function parseSeriesValue(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!s.startsWith("[")) return v;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : v;
  } catch {
    return v;
  }
}

/** In place: parse every string-encoded series field on an incoming run payload. */
export function normalizeSeriesFields(data: Record<string, any>): void {
  for (const f of RUN_SERIES_FIELDS) {
    if (typeof data[f] === "string") data[f] = parseSeriesValue(data[f]);
  }
}

// ── GPS track parsing ─────────────────────────────────────────────────────────

type TrackPoint = {
  lat: number;
  lng: number;
  alt: number | null;
  t: number | null; // seconds since the first point
  hr: number | null;
  source: string | null;
  d: number; // cumulative metres
};

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function timeMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e12) return v; // epoch ms (Android)
    if (v > 1e9) return v * 1000; // epoch s
    return null;
  }
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Array-shaped GPS track in any client's point shape (iOS / Android / companion). */
export function parseTrack(gpsTrack: unknown): TrackPoint[] {
  if (!Array.isArray(gpsTrack)) return [];
  const out: TrackPoint[] = [];
  let firstMs: number | null = null;
  let firstElapsed: number | null = null;
  for (const p of gpsTrack as any[]) {
    const lat = num(p?.latitude ?? p?.lat);
    const lng = num(p?.longitude ?? p?.lng ?? p?.lon);
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue;
    let t: number | null = null;
    const elapsed = num(p?.elapsedSeconds);
    if (elapsed != null) {
      if (firstElapsed == null) firstElapsed = elapsed;
      t = elapsed - firstElapsed;
    } else {
      const ms = timeMs(p?.timestamp ?? p?.time);
      if (ms != null) {
        if (firstMs == null) firstMs = ms;
        t = (ms - firstMs) / 1000;
      }
    }
    const prev = out[out.length - 1];
    out.push({
      lat, lng,
      alt: num(p?.elevation ?? p?.altitude ?? p?.alt),
      t,
      hr: num(p?.heartRate ?? p?.hr),
      source: typeof p?.source === "string" ? p.source : null,
      d: prev ? prev.d + haversineM(prev.lat, prev.lng, lat, lng) : 0,
    });
  }
  return out;
}

/** Centred 5-point moving average of altitude (Android's ALTITUDE_SMOOTHING_WINDOW). */
function smoothedAltitudes(pts: TrackPoint[]): (number | null)[] {
  return pts.map((_, i) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(pts.length - 1, i + 2); k++) {
      const a = pts[k].alt;
      if (a != null) { sum += a; n++; }
    }
    return n > 0 ? sum / n : null;
  });
}

const GRADE_WINDOW_M = 100; // Android GRADE_WINDOW_M
const MAX_PLAUSIBLE_GRADE = 40; // beyond this a 100 m window is altitude noise, not a hill

/**
 * Steepest uphill / downhill grade (%) over any 100 m stretch — Android's
 * trailingWindowGradePercent(): rise over the trailing 100 m of route, near end smoothed,
 * far end averaged over the three points around the window boundary.
 */
export function steepestGrades(pts: TrackPoint[]): { incline: number; decline: number } | null {
  const alts = smoothedAltitudes(pts);
  let incline = 0, decline = 0, found = false;
  let j = 0;
  for (let i = 1; i < pts.length; i++) {
    const near = alts[i];
    if (near == null) continue;
    // Advance j so pts[j] is the last point at least GRADE_WINDOW_M behind i.
    while (j + 1 < i && pts[i].d - pts[j + 1].d >= GRADE_WINDOW_M) j++;
    const dist = pts[i].d - pts[j].d;
    if (dist < GRADE_WINDOW_M) continue;
    const far: number[] = [];
    for (let k = Math.max(0, j - 1); k <= Math.min(i, j + 1); k++) {
      const a = alts[k];
      if (a != null) far.push(a);
    }
    if (far.length === 0) continue;
    const grade = ((near - far.reduce((s, a) => s + a, 0) / far.length) / dist) * 100;
    if (Math.abs(grade) > MAX_PLAUSIBLE_GRADE) continue;
    found = true;
    if (grade > incline) incline = grade;
    if (-grade > decline) decline = -grade;
  }
  return found ? { incline: round1(incline), decline: round1(decline) } : null;
}

/** 60-second window means of altitude — what Android tracks smoothedMin/MaxElevation over. */
function altitudeWindowMeans(pts: TrackPoint[]): number[] {
  const means: number[] = [];
  let bucket: number[] = [];
  let bucketStart: number | null = null;
  for (const p of pts) {
    if (p.alt == null || p.t == null) continue;
    if (bucketStart == null) bucketStart = p.t;
    if (p.t - bucketStart >= 60 && bucket.length > 0) {
      means.push(bucket.reduce((s, a) => s + a, 0) / bucket.length);
      bucket = [];
      bucketStart = p.t;
    }
    bucket.push(p.alt);
  }
  if (bucket.length > 0) means.push(bucket.reduce((s, a) => s + a, 0) / bucket.length);
  return means;
}

/** Android determineTerrainType(): smoothed elevation range per km. */
export function terrainTypeFor(pts: TrackPoint[], distanceKm: number): string | null {
  if (!(distanceKm > 0)) return null;
  if (distanceKm < 1) return "flat"; // ROLLING_TERRAIN_WINDOW_KM
  const means = altitudeWindowMeans(pts);
  if (means.length < 2) return pts.length > 0 ? "flat" : null;
  const rangePerKm = (Math.max(...means) - Math.min(...means)) / distanceKm;
  if (rangePerKm < 5) return "flat";
  if (rangePerKm < 20) return "rolling";
  if (rangePerKm < 50) return "hilly";
  return "mountainous";
}

/** Total climb from 60 s altitude means — used only when the client sent no elevation gain. */
function smoothedElevationGain(pts: TrackPoint[]): number | null {
  const means = altitudeWindowMeans(pts);
  if (means.length < 2) return null;
  let gain = 0;
  for (let i = 1; i < means.length; i++) if (means[i] > means[i - 1]) gain += means[i] - means[i - 1];
  return round1(gain);
}

/** Seconds spent actually moving (≥ 0.5 m/s between consecutive fixes, gaps > 60 s ignored). */
export function movingSeconds(pts: TrackPoint[]): number | null {
  let total = 0, any = false;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a.t == null || b.t == null) continue;
    const dt = b.t - a.t;
    if (dt <= 0 || dt > 60) continue;
    any = true;
    if ((b.d - a.d) / dt >= 0.5) total += dt;
  }
  return any ? Math.round(total) : null;
}

// ── Struggle points ───────────────────────────────────────────────────────────

const STRUGGLE_DROP = 0.20; // 20 % slower than baseline — the clients' paceDropThreshold
const STRUGGLE_MIN_SECONDS = 30;
const PACE_WINDOW_M = 200;
const STRUCTURED_WORKOUTS = /interval|repeat|fartlek|walk_run|run_walk|strides|hill/i;

function formatPace(secPerKm: number): string {
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm - m * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Sustained slowdowns of ≥ 20 % against the first-kilometre pace lasting ≥ 30 s — the same rule
 * iOS and Android apply live. Returns [] for "analysed, none found" and null when the track
 * can't support the analysis. Skipped for structured sessions where slow phases are prescribed.
 */
export function detectStrugglePoints(
  pts: TrackPoint[],
  opts: { workoutType?: string | null; startMs?: number | null } = {},
): any[] | null {
  if (opts.workoutType && STRUCTURED_WORKOUTS.test(opts.workoutType)) return [];
  const timed = pts.filter((p) => p.t != null);
  if (timed.length < 20 || timed[timed.length - 1].d < 1500) return null;

  const firstKm = timed.find((p) => p.d >= 1000);
  if (!firstKm || !(firstKm.t! > 0)) return null;
  const baseline = firstKm.t!; // seconds for the first 1000 m
  const grades = smoothedAltitudes(timed);

  const found: any[] = [];
  let j = 0;
  let current: { startIdx: number; peakIdx: number; peakPace: number } | null = null;
  const close = (endIdx: number) => {
    if (!current) return;
    const a = timed[current.startIdx], b = timed[endIdx];
    if (b.t! - a.t! >= STRUGGLE_MIN_SECONDS) {
      const peak = timed[current.peakIdx];
      // Grade over the 100 m leading into the struggle (same window as steepest grade).
      let k = current.startIdx;
      while (k > 0 && a.d - timed[k].d < GRADE_WINDOW_M) k--;
      const gA = grades[current.startIdx], gB = grades[k];
      const grade = gA != null && gB != null && a.d - timed[k].d >= 50
        ? round1(((gA - gB) / (a.d - timed[k].d)) * 100)
        : null;
      found.push({
        id: `server-${Math.round(a.d)}`,
        timestamp: opts.startMs != null ? Math.round(opts.startMs + a.t! * 1000) : null,
        distanceMeters: Math.round(a.d),
        paceAtStruggle: formatPace(current.peakPace),
        baselinePace: formatPace(baseline),
        paceDropPercent: round1(((current.peakPace - baseline) / baseline) * 100),
        currentGrade: grade != null && Math.abs(grade) <= MAX_PLAUSIBLE_GRADE ? grade : null,
        heartRate: peak.hr != null && peak.hr > 30 ? Math.round(peak.hr) : null,
        location: { latitude: a.lat, longitude: a.lng, timestamp: opts.startMs != null ? Math.round(opts.startMs + a.t! * 1000) : 0, speed: null, altitude: a.alt },
        userComment: null,
        isRelevant: true,
        dismissReason: null,
        source: "server", // distinguishes these from live, client-detected struggle points
      });
    }
    current = null;
  };

  for (let i = 0; i < timed.length; i++) {
    const p = timed[i];
    if (p.d < 1000) continue; // baseline kilometre
    while (j + 1 < i && p.d - timed[j + 1].d >= PACE_WINDOW_M) j++;
    const dd = p.d - timed[j].d;
    if (dd < PACE_WINDOW_M) continue;
    const pace = ((p.t! - timed[j].t!) / dd) * 1000;
    const slow = pace >= baseline * (1 + STRUGGLE_DROP);
    if (slow) {
      if (!current) current = { startIdx: i, peakIdx: i, peakPace: pace };
      else if (pace > current.peakPace) { current.peakIdx = i; current.peakPace = pace; }
    } else if (current) {
      close(i);
    }
  }
  if (current) close(timed.length - 1); // run ended mid-slowdown — still a struggle
  return found.slice(0, 10);
}

// ── Recording source ──────────────────────────────────────────────────────────

function isWearOsName(name: unknown): boolean {
  const m = String(name ?? "").toLowerCase();
  return m.includes("galaxy") || m.includes("wear os") || m.includes("samsung") || m.includes("pixel watch");
}

function isAppleWatchName(name: unknown): boolean {
  return String(name ?? "").toLowerCase().includes("apple watch");
}

/**
 * Best-effort classification of where a run was recorded. Clients send `recordingSource`
 * explicitly from 2026-10 on; this covers older rows and server-created runs.
 */
export function inferRecordingSource(run: Record<string, any>, pts: TrackPoint[]): RecordingSource {
  const ext = String(run.externalSource ?? "").toLowerCase();
  const device = run.garminDeviceName ?? run.deviceName;
  const notes = Array.isArray(run.aiCoachingNotes) ? run.aiCoachingNotes : [];
  // Phone took part: phone-tagged GPS fixes (iOS), or phone-side coaching notes on a watch record.
  const phoneGps = pts.some((p) => p.source === "phone_gps");
  const phoneInvolved = phoneGps || notes.length > 0;

  if (ext === "strava") return "strava_import";
  if (ext === "garmin") return "garmin_watch"; // Garmin Connect import
  if (ext === "wearos_companion") return phoneInvolved ? "phone_wear_os_watch" : "wear_os_watch";
  if (ext === "garmin_companion") return phoneInvolved ? "phone_garmin_watch" : "garmin_watch";

  if (run.workoutType === "watch_standalone" || isAppleWatchName(device) ||
      (typeof run.workoutDescription === "string" && run.workoutDescription.includes("Recorded on Apple Watch"))) {
    return phoneGps ? "phone_apple_watch" : "apple_watch";
  }

  if (run.hasGarminData || device) {
    return isWearOsName(device) ? "phone_wear_os_watch" : "phone_garmin_watch";
  }

  // iOS phone run (client-generated upper-case UUID external_id). Watch-streamed fixes carry no
  // `source` tag, so untagged points next to phone_gps ones mean a Garmin was streaming.
  const isIos = typeof run.externalId === "string" && /^[0-9A-F]{8}-[0-9A-F]{4}-/.test(run.externalId);
  if (isIos) {
    if (phoneGps && pts.some((p) => p.source == null)) return "phone_garmin_watch";
    // A phone has no heart-rate sensor; on iPhone live HR comes from HealthKit, i.e. an Apple Watch.
    if (num(run.avgHeartRate) != null && num(run.avgHeartRate)! > 0) return "phone_apple_watch";
  }
  return "phone";
}

// ── Main entry point ──────────────────────────────────────────────────────────

export type DerivationContext = {
  timezone?: string | null; // users.timezone (IANA)
  weightKg?: number | null;
  plannedWorkoutType?: string | null; // planned_workouts.workout_type for linkedWorkoutId
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v as any);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * users.weight is free text ("62", "62 kg", "140 lbs") — kg, or null when unusable.
 *
 * `unitConfirmed` (users.weight_unit_confirmed) = the runner saved it with the apps' lb/kg toggle,
 * so it IS kilograms — taken as-is, however heavy (a genuinely 170 kg runner must never be
 * "corrected" to 77 kg). Only unconfirmed legacy values, entered in the old kg-only field where
 * US runners often typed pounds ("235" from a 5'10" runner = BMI 74), are checked: a bare number
 * implausible as kg for the height (BMI > 55) but plausible as lb (BMI 15–55) is read as pounds;
 * without a height, only values beyond any realistic kg weight (> 250). The apps ask these
 * runners to confirm the unit, which ends the guessing. Use this everywhere weight is read.
 */
export function parseWeightKg(raw: unknown, heightCm?: unknown, unitConfirmed = false): number | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase();
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const lbToKg = (v: number) => Math.round(v * 0.45359237 * 10) / 10;
  let kg = /lb/.test(s) ? lbToKg(n) : n;
  if (unitConfirmed) return kg >= 25 && kg <= 350 ? kg : null;
  if (!/lb|kg/.test(s)) {
    const h = parseFloat(String(heightCm ?? ""));
    if (Number.isFinite(h) && h > 100 && h < 250) {
      const m2 = (h / 100) ** 2;
      if (n / m2 > 55 && lbToKg(n) / m2 >= 15 && lbToKg(n) / m2 <= 55) kg = lbToKg(n);
    } else if (n > 250 && lbToKg(n) <= 250) {
      kg = lbToKg(n);
    }
  }
  return kg >= 30 && kg <= 250 ? kg : null;
}

/** YYYY-MM-DD and HH:MM of `when` in the runner's own time zone (falls back to UTC). */
export function localDateTime(when: Date, timezone?: string | null): { date: string; time: string } {
  const fmt = (tz: string) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(when).map((p) => [p.type, p.value]),
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  };
  try {
    return fmt(timezone || "UTC");
  } catch {
    return fmt("UTC"); // unknown IANA id
  }
}

/**
 * Patch of derived values for every derivable column that is still NULL on `run` (a runs row
 * or an insert payload, camelCase). Never returns a key whose current value is non-null.
 * Legacy columns outside the Drizzle schema come back in `legacy` (snake_case).
 */
export function deriveRunFields(
  run: Record<string, any>,
  ctx: DerivationContext = {},
): { patch: Record<string, any>; legacy: Record<string, any> } {
  const patch: Record<string, any> = {};
  const set = (key: string, value: unknown) => {
    if (run[key] == null && value != null && !(typeof value === "number" && !Number.isFinite(value))) {
      patch[key] = value;
    }
  };

  const pts = parseTrack(run.gpsTrack);
  const distanceKm = num(run.distance) ?? 0;
  const durationS = num(run.duration) ?? 0;
  const isWalk = run.sessionType === "walk";
  const startedAt = toDate(run.startedAt);
  const completedAt = toDate(run.completedAt);
  const start = startedAt ?? (completedAt && durationS > 0 ? new Date(completedAt.getTime() - durationS * 1000) : completedAt);

  // AI coach flag — never NULL. A run that carries coaching notes had the coach on.
  const notes = Array.isArray(run.aiCoachingNotes) ? run.aiCoachingNotes : [];
  set("aiCoachEnabled", notes.length > 0);

  // Workout type — never NULL: the planned workout's type, else "free".
  const plannedType = typeof ctx.plannedWorkoutType === "string" && ctx.plannedWorkoutType ? ctx.plannedWorkoutType : null;
  set("workoutType", plannedType ?? (run.linkedWorkoutId ? null : "free"));

  // Local date/time of the start.
  if (start) {
    const local = localDateTime(start, ctx.timezone);
    set("runDate", local.date);
    set("runTime", local.time);
  }

  // Speed / time.
  if (distanceKm > 0 && durationS > 0) set("avgSpeed", Math.round((distanceKm * 1000 / durationS) * 100) / 100); // m/s
  const moving = movingSeconds(pts);
  set("movingTime", moving != null ? Math.min(moving, durationS || moving) : (durationS > 0 ? Math.round(durationS) : null));
  if (startedAt && completedAt) {
    const wall = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);
    set("elapsedTime", wall >= durationS - 5 && wall < 86400 ? Math.max(wall, durationS) : Math.round(durationS) || null);
  } else if (durationS > 0) {
    set("elapsedTime", Math.round(durationS));
  }

  // Elevation (Android: elevation = total climb; difficulty from it).
  const gain = num(run.elevationGain) ?? smoothedElevationGain(pts);
  set("elevationGain", gain);
  set("elevation", gain);
  if (gain != null) set("difficulty", gain > 200 ? "hard" : gain > 100 ? "moderate" : "easy");
  set("terrainType", terrainTypeFor(pts, distanceKm));
  const alts = pts.map((p) => p.alt).filter((a): a is number => a != null);
  if (alts.length > 0) {
    set("minElevation", Math.min(...alts));
    set("maxElevation", Math.max(...alts));
  }
  const grades = steepestGrades(pts);
  if (grades) {
    set("steepestIncline", grades.incline);
    set("steepestDecline", grades.decline);
  }

  // Calories: ~1 kcal/kg/km running, ~0.55 walking (Android's 70 kcal/km assumes 70 kg).
  if (distanceKm > 0) {
    const kcal = Math.round((ctx.weightKg ?? 70) * distanceKm * (isWalk ? 0.55 : 1.0));
    set("activeCalories", kcal);
    set("calories", num(run.activeCalories) ?? kcal);
  }

  // Heart-rate floor from the series when the client sent none.
  if (Array.isArray(run.heartRateData)) {
    const hrs = (run.heartRateData as any[])
      .map((v) => num(typeof v === "object" && v ? v.value ?? v.bpm ?? v.hr : v))
      .filter((v): v is number => v != null && v > 30 && v < 250);
    if (hrs.length > 0) set("minHeartRate", Math.round(Math.min(...hrs)));
  }

  // Struggle points — [] means "analysed, none found".
  if (run.strugglePoints == null) {
    set("strugglePoints", detectStrugglePoints(pts, {
      workoutType: plannedType ?? run.workoutType,
      startMs: start?.getTime() ?? null,
    }));
  }

  set("recordingSource", inferRecordingSource({ ...run, ...patch }, pts));

  // Legacy columns that exist in the DB but not in shared/schema.ts.
  const incline = num(run.steepestIncline) ?? patch.steepestIncline ?? null;
  const legacy: Record<string, any> = {
    start_time: start,
    end_time: completedAt,
    max_incline_percent: incline,
    max_incline_degrees: incline != null ? round1((Math.atan(incline / 100) * 180) / Math.PI) : null,
  };
  return { patch, legacy };
}
