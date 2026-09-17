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
