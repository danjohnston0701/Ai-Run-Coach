import type { Run } from "./types";

/* ── Numbers & units ──────────────────────────────────────────────────────── */

/** API runs carry distance in metres; legacy rows can be km (< 200 means km, see CLAUDE.md). */
export function runKm(run: Pick<Run, "distance">): number {
  const d = Number(run.distance) || 0;
  return d > 200 ? d / 1000 : d;
}

export function fmtKm(km: number | null | undefined, digits = 2): string {
  if (km == null || !isFinite(km)) return "—";
  return km.toFixed(digits);
}

/** "1:02:05" / "25:40" from a number of seconds. Rounds the total first (no "4:60"). */
export function fmtClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, "0")}` : `${mm}:${String(sec).padStart(2, "0")}`;
}

export const fmtMs = (ms: number | null | undefined) => (ms == null ? "—" : fmtClock(ms / 1000));

/** Human duration: "1 h 05 min", "42 min". */
export function fmtHuman(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || !isFinite(totalSeconds)) return "—";
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** Pace "m:ss" from seconds per km. */
export function fmtPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 60 * 60) return "—";
  return fmtClock(secPerKm);
}

/** Parses "4:41", "4:41/km" or "4:41 /km" into seconds per km. */
export function parsePace(p: string | null | undefined): number | null {
  if (!p) return null;
  const m = /(\d+):(\d{1,2})/.exec(p);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Moving time (s) — moving_time when present, else the recorded duration. */
export function runSeconds(run: Run): number {
  if (run.movingTime && run.movingTime > 0) return run.movingTime;
  return (Number(run.duration) || 0) / 1000;
}

export function runPaceSec(run: Run): number | null {
  const km = runKm(run);
  if (km < 0.05) return null;
  return runSeconds(run) / km;
}

export function fmtInt(n: number | null | undefined, suffix = ""): string {
  if (n == null || !isFinite(Number(n))) return "—";
  return `${Math.round(Number(n)).toLocaleString()}${suffix}`;
}

/* ── Dates ────────────────────────────────────────────────────────────────── */

export function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(v: any, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  const d = toDate(v);
  return d ? d.toLocaleDateString(undefined, opts) : "—";
}

export function fmtDateTime(v: any) {
  const d = toDate(v);
  if (!d) return "—";
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function fmtTime(v: any) {
  const d = toDate(v);
  return d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—";
}

/** Plan dates are stored as UTC midnight of the local day — read them back as that calendar day. */
export function fmtPlanDate(v: any, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}

export function planDayKey(v: any): string | null {
  const d = toDate(v);
  return d ? d.toISOString().slice(0, 10) : null;
}

export function todayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function relTime(v: any): string {
  const d = toDate(v);
  if (!d) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return fmtDate(d, { day: "numeric", month: "short" });
}

/* ── Run naming (port of Android RunNaming.kt / server defaultRunName) ────── */

const NON_PLAN_WORKOUT_TYPES = new Set(["free", "watch_standalone"]);
const PLAN_WORKOUT_NAMES: Record<string, string> = {
  easy: "Easy Run",
  easy_run: "Easy Run",
  easy_with_strides: "Easy Run + Strides",
  easy_strides: "Easy Run + Strides",
  long: "Long Run",
  long_run: "Long Run",
  back_to_back_long: "Back-to-Back Long Run",
  walk_run: "Walk/Run",
  interval: "Intervals",
  intervals: "Intervals",
  short_interval: "Intervals",
  park_run: "parkrun",
  pre_race_shakeout: "Pre-Race Shakeout",
};
const SESSION_NOUNS = /\b(run|race|intervals|repeats|strides|fartlek|shakeout|walk|parkrun)$/i;

export function planWorkoutName(workoutType?: string | null): string | null {
  const key = (workoutType ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key || NON_PLAN_WORKOUT_TYPES.has(key)) return null;
  if (PLAN_WORKOUT_NAMES[key]) return PLAN_WORKOUT_NAMES[key];
  const name = key
    .split("_")
    .filter(Boolean)
    .map((w) => (w === "parkrun" ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
  return SESSION_NOUNS.test(name) ? name : `${name} Run`;
}

export function timeOfDayLabel(hour: number) {
  if (hour >= 5 && hour <= 11) return "Morning";
  if (hour >= 12 && hour <= 13) return "Lunch";
  if (hour >= 14 && hour <= 16) return "Afternoon";
  if (hour >= 17 && hour <= 20) return "Evening";
  return "Night";
}

export function runName(run: Pick<Run, "name" | "sessionType" | "startTime" | "workoutType">): string {
  if (run.name && run.name.trim()) return run.name;
  const isWalk = (run.sessionType ?? "").toLowerCase() === "walk";
  const planned = planWorkoutName(run.workoutType);
  if (planned) return isWalk && planned !== "Walk/Run" ? planned.replace(/\bRun$/, "Walk") : planned;
  const hour = new Date(run.startTime).getHours();
  return `${timeOfDayLabel(hour)} ${isWalk ? "Walk" : "Run"}`;
}

export function isWalk(run: Pick<Run, "sessionType">) {
  return (run.sessionType ?? "").toLowerCase() === "walk";
}

/* ── Labels ───────────────────────────────────────────────────────────────── */

export function titleCase(s?: string | null) {
  if (!s) return "";
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function goalTypeLabel(goalType?: string | null) {
  const map: Record<string, string> = {
    "5k": "5K",
    "10k": "10K",
    half_marathon: "Half Marathon",
    marathon: "Marathon",
    custom: "Custom distance",
  };
  return map[(goalType ?? "").toLowerCase()] ?? titleCase(goalType);
}

export function recordingSourceLabel(run: Run): string | null {
  if (run.externalSource && /strava/i.test(run.externalSource)) return "Strava";
  if (run.garminDeviceName) return run.garminDeviceName;
  if (run.hasGarminData) return "Garmin";
  return null;
}

export const ZONE_COLORS = ["#60a5fa", "#00e676", "#ffb300", "#ff6b35", "#ff5252"];
