/**
 * Server-side weather for runs.
 *
 * Only Android sends `weatherData` with its upload. iOS sends a bare `temperature` /
 * `weatherCondition` that map to no `runs` column (dropped), and runs created on the server —
 * Garmin companion sessions, Garmin Connect / Strava imports — never had weather at all. In
 * Sept 2026 that left ~70% of iOS and ~80% of companion runs without weather, starving the
 * weather-impact insights.
 *
 * So the server fills `runs.weather_data` itself when a run arrives without it: Open-Meteo's
 * hourly history (the same free source as GET /api/weather/current, which Android's own
 * weatherData comes from) at the run's start point and start hour, in Android's shape. Client
 * weather always wins — this only ever writes where weather_data is still NULL.
 *
 *   ensureRunWeather(runId)   — fire-and-forget after a run is created
 *   backfillRunWeather(limit) — hourly sweep in scheduler.ts; also backfills old runs
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { runs } from "@shared/schema";
import { db } from "./db";

/** WMO weather code → the condition strings already stored by Android / the weather endpoints. */
export function weatherCodeToCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 49) return "Foggy";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

const HOURLY = "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m";
const DAY_MS = 86_400_000;

type RunLike = {
  startLat?: number | null;
  startLng?: number | null;
  gpsTrack?: unknown;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  duration?: number | null; // seconds
};

function validCoord(lat: unknown, lng: unknown): [number, number] | null {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;
  return [a, b];
}

/** Start point: start_lat/lng, else the first usable GPS point ({latitude,longitude} or {lat,lng}). */
export function runStartPoint(run: RunLike): [number, number] | null {
  const s = validCoord(run.startLat, run.startLng);
  if (s) return s;
  const track = Array.isArray(run.gpsTrack) ? run.gpsTrack : [];
  for (const p of track.slice(0, 50) as any[]) {
    const c = validCoord(p?.latitude ?? p?.lat, p?.longitude ?? p?.lng);
    if (c) return c;
  }
  return null;
}

/** Start time: started_at, else completed_at minus duration. */
export function runStartTime(run: RunLike): Date | null {
  if (run.startedAt) return new Date(run.startedAt);
  if (!run.completedAt) return null;
  const end = new Date(run.completedAt).getTime();
  return new Date(end - (Number(run.duration) > 0 ? Number(run.duration) * 1000 : 0));
}

const FORECAST_API = "https://api.open-meteo.com/v1/forecast"; // recent days (archive lags ~5 days)
const ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive"; // anything older

async function hourlyAt(base: string, lat: number, lng: number, when: Date): Promise<Record<string, any> | null> {
  const day = when.toISOString().slice(0, 10);
  const url = `${base}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&hourly=${HOURLY}` +
    `&start_date=${day}&end_date=${day}&timezone=GMT`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const h = (await res.json())?.hourly;
  if (!h?.time?.length) return null;
  const i = Math.min(h.time.length - 1, when.getUTCHours() + (when.getUTCMinutes() >= 30 ? 1 : 0));
  const code = h.weather_code?.[i];
  if (h.temperature_2m?.[i] == null || code == null) return null; // date outside this API's range
  const condition = weatherCodeToCondition(code);
  return {
    temperature: h.temperature_2m[i],
    feelsLike: h.apparent_temperature?.[i] ?? null,
    humidity: h.relative_humidity_2m?.[i] ?? null,
    windSpeed: h.wind_speed_10m?.[i] != null ? Math.round(h.wind_speed_10m[i]) : null, // km/h
    windDirection: h.wind_direction_10m?.[i] ?? null,
    condition,
    description: condition,
    weatherCode: code,
    source: "open-meteo-hourly", // marks server-filled weather (client weather has no source)
  };
}

/** Open-Meteo hourly weather at (lat, lng) for the hour nearest `when`, in runs.weather_data shape. */
export async function fetchHistoricalWeather(lat: number, lng: number, when: Date): Promise<Record<string, any> | null> {
  // The forecast API only reaches back a few weeks (it returned nulls at 77 days); the archive
  // lags ~5 days. Prefer whichever fits the date and fall back to the other.
  const recent = Date.now() - when.getTime() < 7 * DAY_MS;
  const [first, second] = recent ? [FORECAST_API, ARCHIVE_API] : [ARCHIVE_API, FORECAST_API];
  return (await hourlyAt(first, lat, lng, when)) ?? (await hourlyAt(second, lat, lng, when));
}

/** Fills weather_data for one run if it's still missing. Never throws. Returns true if written. */
export async function ensureRunWeather(runId: string): Promise<boolean> {
  try {
    const [run] = await db.select({
      weatherData: runs.weatherData, startLat: runs.startLat, startLng: runs.startLng, gpsTrack: runs.gpsTrack,
      startedAt: runs.startedAt, completedAt: runs.completedAt, duration: runs.duration,
    }).from(runs).where(eq(runs.id, runId)).limit(1);
    if (!run || run.weatherData != null) return false;
    const where = runStartPoint(run as RunLike);
    const when = runStartTime(run as RunLike);
    if (!where || !when || when.getTime() > Date.now() + 3_600_000) return false;
    const weather = await fetchHistoricalWeather(where[0], where[1], when);
    if (!weather) return false;
    const updated = await db.update(runs).set({ weatherData: weather })
      .where(and(eq(runs.id, runId), isNull(runs.weatherData))).returning({ id: runs.id });
    return updated.length > 0;
  } catch (err: any) {
    console.warn(`[RunWeather] ${runId}: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Fills weather for up to `limit` runs that still have none (newest first), skipping runs with
 * no location at all. Runs whose lookup comes back empty (e.g. archive not yet published) are
 * simply retried on a later sweep.
 */
export async function backfillRunWeather(limit = 150): Promise<{ checked: number; filled: number }> {
  const rows = await db.select({ id: runs.id }).from(runs)
    .where(and(
      isNull(runs.weatherData),
      sql`(${runs.startLat} is not null or (jsonb_typeof(${runs.gpsTrack}) = 'array' and jsonb_array_length(${runs.gpsTrack}) > 0))`,
    ))
    .orderBy(sql`${runs.completedAt} desc nulls last`)
    .limit(limit);
  let filled = 0;
  for (const r of rows) {
    if (await ensureRunWeather(r.id)) filled++;
    await new Promise((res) => setTimeout(res, 250)); // be gentle with the free API
  }
  return { checked: rows.length, filled };
}

/**
 * One-off repair: runs saved without start_lat/start_lng (every iOS upload before the
 * storage.createRun fix) get them from their first usable GPS point. Idempotent — only touches
 * rows where start_lat is still NULL.
 */
export async function backfillRunStartPoints(limit = 500): Promise<number> {
  const rows = await db.select({ id: runs.id, gpsTrack: runs.gpsTrack }).from(runs)
    .where(and(isNull(runs.startLat), sql`jsonb_typeof(${runs.gpsTrack}) = 'array' and jsonb_array_length(${runs.gpsTrack}) > 0`))
    .limit(limit);
  let fixed = 0;
  for (const r of rows) {
    const p = runStartPoint({ gpsTrack: r.gpsTrack });
    if (!p) continue;
    const u = await db.update(runs).set({ startLat: p[0], startLng: p[1] })
      .where(and(eq(runs.id, r.id), isNull(runs.startLat))).returning({ id: runs.id });
    fixed += u.length;
  }
  return fixed;
}
