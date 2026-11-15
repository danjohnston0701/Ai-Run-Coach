/*
 * Run analysis for the Run Summary's Graphs and Summary tabs — line-for-line ports of the
 * Android RunSummaryScreen.kt calculations (calculateEffortScore, computeOptimalCadence,
 * RunMetricRingsRow, FatigueCurveCard, AerobicDecouplingCard, RunningEconomyCard,
 * RaceTimePredictorCard, WeatherPerformanceCard, IntensityDistributionCard,
 * buildHRPaceData) so a run reads the same on the web as in the app. Change them together.
 *
 * Units follow the API (Android RunSession): run.distance in metres, run.duration in ms.
 */
import type { Run } from "./types";
import { parsePace } from "./format";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const Q = {
  excellent: "#00E676",
  good: "#69F0AE",
  average: "#FFEE58",
  caution: "#FF9800",
  bad: "#FF5252",
};

export function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a > 0 && a < 120 ? a : null;
}

/** Tanaka (2001): 208 − 0.7 × age, clamped 155–210; 185 when age is unknown. */
export function tanakaMaxHr(age: number | null | undefined) {
  return age ? clamp(Math.trunc(208 - 0.7 * age), 155, 210) : 185;
}

/* ── Effort score ─────────────────────────────────────────────────────────── */

export type Effort = { score: number; label: string; color: string; factors: [string, string][] };

export function effortScore(run: Run, age: number | null): Effort {
  const durationMin = (Number(run.duration) || 0) / 60000;
  const distanceKm = (Number(run.distance) || 0) / 1000;
  const factors: [string, string][] = [];
  const durationScore = clamp((durationMin / 90) * 20, 0, 20);
  factors.push(["Duration", `${Math.round(durationMin)} min`]);
  const distanceScore = clamp((distanceKm / 20) * 20, 0, 20);
  factors.push(["Distance", `${distanceKm.toFixed(1)} km`]);
  const pace = distanceKm > 0 && durationMin > 0 ? (durationMin * 60) / distanceKm : 420;
  const paceScore = clamp(((420 - pace) / (420 - 180)) * 25, 0, 25);
  factors.push(["Pace intensity", `${Math.trunc(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, "0")}/km`]);
  const gain = Number(run.totalElevationGain) || 0;
  const elevScore = clamp((gain / 500) * 15, 0, 15);
  const range = run.maxElevation != null && run.minElevation != null ? Math.max(0, run.maxElevation - run.minElevation) : null;
  const elevShown = range && Math.round(range) > 0 ? Math.round(range) : Math.round(gain) > 0 ? Math.round(gain) : null;
  if (elevShown != null) factors.push(["Elevation", `${elevShown} m`]);
  const hr = Number(run.heartRate) || 0;
  const hrScore = hr > 0 ? clamp((((hr / tanakaMaxHr(age)) * 100 - 50) / 50) * 20, 0, 20) : 10;
  if (hr > 0) factors.push(["Avg heart rate", `${hr} bpm`]);
  const total = clamp(Math.round(durationScore + distanceScore + paceScore + elevScore + hrScore), 0, 100);
  const [label, color] =
    total >= 80 ? ["Maximum Effort", "#FF5252"] : total >= 60 ? ["Hard", "#FF9800"] : total >= 40 ? ["Moderate", "#FFC107"] : total >= 20 ? ["Easy", "#8BC34A"] : ["Recovery", "#4CAF50"];
  return { score: total, label, color, factors };
}

/* ── Cadence ──────────────────────────────────────────────────────────────── */

function avgSpeedMs(run: Run) {
  if ((run.averageSpeed ?? 0) > 0) return run.averageSpeed!;
  if (run.distance > 0 && run.duration > 0) return run.distance / (run.duration / 1000);
  return 3;
}

export function isWalkingPace(run: Run) {
  return avgSpeedMs(run) < 2;
}

export function optimalCadence(run: Run, heightCm: number | null, age: number | null, weightKg: number | null) {
  const speedMs = avgSpeedMs(run);
  if (speedMs < 2) return 110;
  const pace = clamp(1000 / speedMs, 180, 900);
  const speed = 1000 / pace;
  const heightM = clamp(heightCm ?? 170, 140, 220) / 100;
  const stepLength = clamp(0.58 + (speed - 2.78) * 0.16, 0.45, 0.95) * heightM;
  let optimal = Math.round((speed / stepLength) * 60);
  if ((age ?? 0) > 50) optimal = Math.max(150, optimal - Math.min(6, Math.round(((age as number) - 50) / 5)));
  const w = weightKg ?? 70;
  if (w > 70) optimal += clamp(Math.round((w - 70) / 15), 0, 4);
  const grad = run.distance > 0 ? (((run.totalElevationGain ?? 0) - (run.totalElevationLoss ?? 0)) / run.distance) * 100 : 0;
  const incline = grad > 0 ? clamp(grad * 0.8, 0, 10) : grad < 0 ? clamp(-grad * 0.4, 0, 6) : 0;
  return optimal + Math.round(incline);
}

export const WALK_CADENCE = [100, 120] as const;

export function cadenceQuality(run: Run, target: number) {
  const c = Number(run.cadence) || 0;
  if (c <= 0) return 0;
  if (isWalkingPace(run)) {
    const delta = c < WALK_CADENCE[0] ? WALK_CADENCE[0] - c : c > WALK_CADENCE[1] ? c - WALK_CADENCE[1] : 0;
    return clamp(1 - delta / 20, 0, 1);
  }
  if (target <= 0) return 0;
  return clamp(clamp(c / target, 0, 1.2) / 1.2, 0, 1);
}

/* ── Rings ────────────────────────────────────────────────────────────────── */

export function consistencyFraction(run: Run): number | null {
  const splits = run.kmSplits ?? [];
  const samples = splits.length >= 2 ? splits.map((s) => Number(s.time)) : (run.paceData ?? []).filter((p) => p > 0).length >= 10 ? (run.paceData ?? []).filter((p) => p > 0) : [];
  if (samples.length < 2) return null;
  const m = avg(samples);
  const sd = Math.sqrt(avg(samples.map((x) => (x - m) ** 2)));
  const cv = m > 0 ? sd / m : 0;
  return clamp(1 - cv * 5, 0, 1);
}

export function hrZoneOf(hr: number, maxHr: number) {
  if (hr < maxHr * 0.6) return 1;
  if (hr < maxHr * 0.7) return 2;
  if (hr < maxHr * 0.8) return 3;
  if (hr < maxHr * 0.9) return 4;
  return 5;
}

/* ── Multi-metric cards ───────────────────────────────────────────────────── */

function splitPaces(run: Run) {
  return (run.kmSplits ?? []).map((s) => parsePace(s.pace) ?? 0).filter((p) => p > 0);
}

export function fatigue(run: Run) {
  const paces = splitPaces(run);
  if ((run.kmSplits ?? []).length < 3 || paces.length < 3) return null;
  const third = Math.max(1, Math.floor(paces.length / 3));
  const mid = avg(paces.slice(third, third * 2));
  const last = avg(paces.slice(-third));
  const pct = ((last - mid) / mid) * 100;
  const [rating, color] =
    pct <= 0 ? ["Negative split!", "#4CAF50"] : pct <= 3 ? ["Strong fatigue resistance", "#8BC34A"] : pct <= 6 ? ["Normal fatigue", "#FFC107"] : pct <= 10 ? ["Moderate fatigue", "#FF9800"] : ["Significant fatigue", "#FF5252"];
  const mean = avg(paces);
  const bars = paces.map((p) => {
    const dev = mean > 0 ? (p - mean) / mean : 0;
    return {
      pace: p,
      height: clamp((p - mean * 0.85) / Math.max(1, mean * 1.25 - mean * 0.85), 0, 1),
      color: dev <= 0.05 ? "#4CAF50" : dev <= 0.12 ? "#FFC107" : dev <= 0.2 ? "#FF9800" : "#FF5252",
    };
  });
  return { mid, last, pct, rating, color, bars };
}

export function decoupling(run: Run) {
  const hr = (run.heartRateData ?? []).filter((h) => h > 0);
  const paces = splitPaces(run);
  if (hr.length < 10 || (run.kmSplits ?? []).length < 2 || paces.length < 2) return null;
  const h1 = avg(hr.slice(0, Math.floor(hr.length / 2)));
  const h2 = avg(hr.slice(Math.floor(hr.length / 2)));
  const p1 = avg(paces.slice(0, Math.floor(paces.length / 2)));
  const p2 = avg(paces.slice(Math.floor(paces.length / 2)));
  const hrDrift = ((h2 - h1) / h1) * 100;
  const paceDrift = ((p2 - p1) / p1) * 100;
  const total = hrDrift + paceDrift;
  const [rating, color, advice] =
    total < 3
      ? ["Excellent", "#4CAF50", "Your aerobic system handled this effort efficiently. Strong fitness indicator."]
      : total < 5
        ? ["Good", "#8BC34A", "Minimal cardiac drift — your aerobic base is solid for this pace."]
        : total < 8
          ? ["Moderate", "#FFC107", "Some HR-pace decoupling detected. More aerobic base work (easy runs) would help."]
          : ["High", "#FF5252", "Significant decoupling — either the effort was above threshold or aerobic fitness needs development."];
  return { hrDrift, paceDrift, total, rating, color, advice };
}

export function economy(run: Run) {
  const hr = Number(run.heartRate) || 0;
  if (hr <= 0 || run.distance < 500) return null;
  const pace = run.distance > 0 ? run.duration / 1000 / (run.distance / 1000) : 0;
  const beats = (run.duration / 60000) * hr;
  const index = beats > 0 ? run.distance / beats : 0;
  const [rating, color] = index > 1.5 ? ["Excellent economy", "#4CAF50"] : index > 1.2 ? ["Good economy", "#8BC34A"] : index > 0.9 ? ["Average economy", "#FFC107"] : ["Developing", "#FF9800"];
  return { index, pace, hr, rating, color };
}

export function riegel(run: Run) {
  if (run.distance < 1000 || run.duration < 60000) return [];
  const km = run.distance / 1000;
  const min = run.duration / 60000;
  return [
    ["5K", 5],
    ["10K", 10],
    ["Half Marathon", 21.0975],
    ["Marathon", 42.195],
  ].map(([name, d]) => {
    const minutes = min * Math.pow((d as number) / km, 1.06);
    return { name: name as string, km: d as number, seconds: minutes * 60, pace: (minutes * 60) / (d as number) };
  });
}

export function weatherIndex(temp: number) {
  const wpi = Math.max(0, 100 - Math.abs(temp - 12) * 3.5);
  const [rating, color] = wpi >= 80 ? ["Ideal conditions", "#4CAF50"] : wpi >= 60 ? ["Good conditions", "#8BC34A"] : wpi >= 40 ? ["Moderate conditions", "#FFC107"] : ["Challenging conditions", "#FF9800"];
  const label = temp < 5 ? "Cold" : temp < 12 ? "Cool" : temp <= 18 ? "Ideal" : temp < 25 ? "Warm" : "Hot";
  return { wpi, rating, color, label };
}

export function intensity(run: Run) {
  const hr = (run.heartRateData ?? []).filter((h) => h > 0);
  if (hr.length < 10) return null;
  const maxHr = Math.max(185, ...hr);
  const n = hr.length;
  const easy = hr.filter((h) => h < 0.7 * maxHr).length;
  const moderate = hr.filter((h) => h >= Math.trunc(0.7 * maxHr) && h < Math.trunc(0.8 * maxHr)).length;
  const hard = hr.filter((h) => h >= Math.trunc(0.8 * maxHr) && h < Math.trunc(0.9 * maxHr)).length;
  const maximal = hr.filter((h) => h >= 0.9 * maxHr).length;
  return [
    { name: "Easy", color: "#4CAF50", pct: easy / n },
    { name: "Moderate", color: "#FFC107", pct: moderate / n },
    { name: "Hard", color: "#FF9800", pct: hard / n },
    { name: "Maximal", color: "#E53935", pct: maximal / n },
  ];
}

/* ── HR vs pace ───────────────────────────────────────────────────────────── */

export type HRPacePoint = { pace: number; hr: number; zone: number };

/**
 * Android builds this from route points that carry both HR and speed. Many runs store HR and
 * pace only as separate series (heartRateData / paceData), so fall back to pairing those
 * proportionally when the route points don't have them.
 */
export function hrPacePoints(run: Run, maxHr: number): HRPacePoint[] {
  let pairs: { speed: number; hr: number }[] = (run.routePoints ?? [])
    .filter((p) => (p.heartRate ?? 0) > 40 && (p.speed ?? 0) > 0.3)
    .map((p) => ({ speed: p.speed!, hr: p.heartRate! }));
  if (pairs.length < 10) {
    const hr = run.heartRateData ?? [];
    const pace = run.paceData ?? [];
    if (hr.length >= 10 && pace.length >= 10) {
      const n = Math.max(hr.length, pace.length);
      pairs = [];
      for (let i = 0; i < n; i++) {
        const h = hr[Math.round((i / (n - 1)) * (hr.length - 1))];
        const p = pace[Math.round((i / (n - 1)) * (pace.length - 1))];
        if (h > 40 && p > 0) pairs.push({ speed: 1000 / p, hr: h });
      }
      pairs = pairs.filter((x) => x.speed > 0.3);
    }
  }
  if (pairs.length < 10) return [];
  const win = Math.max(1, Math.min(15, Math.floor(pairs.length / 3)));
  const step = Math.max(1, Math.floor(pairs.length / 80));
  const out: HRPacePoint[] = [];
  for (let i = 0; i < pairs.length; i += step) {
    const slice = pairs.slice(Math.max(0, i - Math.floor(win / 2)), Math.min(pairs.length, i + Math.floor(win / 2) + 1));
    const s = avg(slice.map((x) => x.speed));
    const hr = Math.round(avg(slice.map((x) => x.hr)));
    const pace = s > 0 ? 1000 / s : 0;
    if (pace < 150 || pace > 1200) continue;
    out.push({ pace, hr, zone: hrZoneOf(hr, maxHr) });
  }
  return out;
}

export function regression(points: HRPacePoint[]) {
  if (points.length < 5) return null;
  const mx = avg(points.map((p) => p.pace));
  const my = avg(points.map((p) => p.hr));
  const sx = points.reduce((a, p) => a + (p.pace - mx) ** 2, 0);
  if (sx < 1e-9) return null;
  const b = points.reduce((a, p) => a + (p.pace - mx) * (p.hr - my), 0) / sx;
  return { a: my - b * mx, b };
}
