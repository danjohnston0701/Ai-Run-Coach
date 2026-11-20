// Suggested paces for a session the runner configured themselves (setup screen → Configure
// session → Confirm session). The apps show these on the confirm screen, the runner can change
// them, and the confirmed values become the phases' target paces for the live coach.
//
// Deterministic, not an AI call: the same pace anchor the training plans use (derivePaceAnchor,
// best recent effort ≥ 3 km projected to a 5K), so a configured session and a plan session of
// the same shape get the same targets, instantly and without spending an allowance. No anchor
// (fewer than one usable run) → no paces, and the apps coach on effort and let the runner type one.

import type { PaceAnchor, PaceBand } from "./plan-quality";

export interface ConfiguredStructure {
  sessionType: string;          // intervals | hill_repeats | fartlek | walk_run
  reps: number;
  workSeconds?: number | null;
  workMeters?: number | null;
  restSeconds?: number | null;
  restMeters?: number | null;
  warmupMinutes?: number | null;
  cooldownMinutes?: number | null;
}

export interface SuggestedPaces {
  /** "history" when paces came from the runner's runs, "none" when there's nothing to base them on. */
  source: "history" | "none";
  /** One line for the confirm screen, e.g. "Based on your 7.2 km on 14 Nov (5K ≈ 24:30)". */
  basis: string | null;
  /** Rep pace band, sec/km (min = faster end). Null for hill repeats (effort, not pace). */
  workPace: PaceBand | null;
  /** Warm-up / cool-down pace band, sec/km. Null for walk-run (those are walks). */
  easyPace: PaceBand | null;
  /** Why the rep pace is what it is ("5K pace or a touch quicker for 400 m reps"). */
  workNote: string | null;
}

const round5 = (s: number) => Math.round(s / 5) * 5;
const band = (min: number, max: number): PaceBand => ({ min: round5(min), max: round5(Math.max(max, min + 5)) });

/** "15 Nov" in the runner's time zone (the server runs in UTC: an NZ morning run is "yesterday" there). */
function localDay(d: Date, timezone?: string | null): string {
  try {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: timezone || "UTC" });
  } catch {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  }
}

function fmtPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtDuration(secs: number): string {
  const s = Math.round(secs);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Rep pace from rep length. Shorter reps run faster than 5K pace, longer ones settle toward
 * 10K and then threshold — the usual coaching ladder. Distance reps are judged by distance
 * (a 1 km rep is a 5K-pace rep whether it takes 3:30 or 6:30), timed reps by time:
 *   ≤ 400 m / ≤ 90 s        5K pace −20 to −8 s/km
 *   ≤ 1200 m / ≤ 5 min      the plans' interval band (5K pace −12 to +5)
 *   ≤ 2000 m / < 10 min     10K-ish, 5K pace +5 to +18
 *   longer                  the plans' tempo/threshold band
 */
export function suggestSessionPaces(anchor: PaceAnchor | null, s: ConfiguredStructure, timezone?: string | null): SuggestedPaces {
  if (!anchor) return { source: "none", basis: null, workPace: null, easyPace: null, workNote: null };
  const p = anchor.est5kSecs / 5; // 5K pace, sec/km
  const when = anchor.sourceDate
    ? ` on ${localDay(anchor.sourceDate, timezone)}`
    : "";
  const basis = `Based on your ${anchor.sourceKm.toFixed(1)} km${when} (5K ≈ ${fmtDuration(anchor.est5kSecs)}, ${fmtPace(p)}/km)`;

  const isWalkRun = s.sessionType === "walk_run";
  const easyPace = isWalkRun ? null : band(anchor.easy.min, anchor.easy.max);

  if (s.sessionType === "hill_repeats") {
    return { source: "history", basis, workPace: null, easyPace, workNote: "Hill reps are run on effort — hard but controlled, the same on every rep." };
  }
  if (isWalkRun) {
    return { source: "history", basis, workPace: band(anchor.walkRun.min, anchor.walkRun.max), easyPace: null,
      workNote: "An easy, relaxed running pace you could hold for every run segment." };
  }

  type Tier = "short" | "fiveK" | "tenK" | "threshold";
  const tier: Tier = s.workMeters && s.workMeters > 0
    ? (s.workMeters <= 400 ? "short" : s.workMeters <= 1200 ? "fiveK" : s.workMeters <= 2000 ? "tenK" : "threshold")
    : (s.workSeconds ?? 120) <= 90 ? "short" : (s.workSeconds ?? 120) <= 300 ? "fiveK"
    : (s.workSeconds ?? 120) < 600 ? "tenK" : "threshold";

  let workPace: PaceBand;
  let workNote: string;
  switch (tier) {
    case "short":
      workPace = band(p - 20, p - 8);
      workNote = "Short reps: a little quicker than your 5K pace.";
      break;
    case "fiveK":
      workPace = band(anchor.interval.min, anchor.interval.max);
      workNote = "Around your 5K pace.";
      break;
    case "tenK":
      workPace = band(p + 5, p + 18);
      workNote = "Longer reps: around your 10K pace.";
      break;
    default:
      workPace = band(anchor.tempo.min, anchor.tempo.max);
      workNote = "Long reps: comfortably hard, threshold pace.";
  }
  // Fartlek surges are less precise than track reps — widen the band a little.
  if (s.sessionType === "fartlek") workPace = band(workPace.min, workPace.max + 10);

  return { source: "history", basis, workPace, easyPace, workNote };
}
