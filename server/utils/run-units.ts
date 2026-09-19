/**
 * `runs.distance` is stored in KILOMETRES. Legacy rows (and the odd watch-originated
 * save) may hold metres; `> 200` is the detection heuristic used throughout the codebase
 * (no single run is 200+ km, no metre value under 200 is a real run). This is the TS
 * twin of the `DIST_KM` SQL expression in user-stats-cache.ts — use it anywhere a run's
 * distance is read in application code rather than dividing by 1000 on the assumption
 * that the column is metres (which made every km-stored run read as ~0.00x km in the AI
 * runner profile, pre-run coaching context and post-run coaching observations).
 */
export function runDistanceKm(distance: number | null | undefined): number {
  const d = distance ?? 0;
  return d > 200 ? d / 1000 : d;
}

/**
 * Minimum distance for a run to count as evidence about the runner (AI runner profile,
 * coaching observations, pre-run context). Anything shorter is a test tap / aborted start —
 * "0.03 km in 12 s" — and must not shape "What your coach knows about you".
 */
export const MIN_MEANINGFUL_RUN_KM = 0.1;

export function isMeaningfulRun(distance: number | null | undefined): boolean {
  return runDistanceKm(distance) >= MIN_MEANINGFUL_RUN_KM;
}

/**
 * SQL twin of isMeaningfulRun() for Drizzle where-clauses: `runs.distance >= 0.1`.
 * (Legacy metre-stored rows are > 200 and pass, which is correct.) Applied to run history
 * lists and every My Data / stats-cache aggregate so a 0.03 km test tap never shows up as a
 * "run" or drags a personal-best / average.
 */
import { sql } from "drizzle-orm";
import { runs } from "@shared/schema";
export const MEANINGFUL_RUN_SQL = sql`${runs.distance} >= ${MIN_MEANINGFUL_RUN_KM}`;
