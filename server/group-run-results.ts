/**
 * Group-run results ranking — the single ordering used by both the results table
 * (GET /api/group-runs/:id/results) and the AI debrief's "finished #N of M", which
 * previously disagreed (table sorted by raw distance, debrief by pace).
 *
 * Every participant's pace is recomputed here from the run's own distance and duration
 * rather than read from the stored `avgPace` string: those strings come from different
 * recorders (Android, iOS, Garmin, Wear OS) with different formats and moving-vs-elapsed
 * conventions, so comparing them side by side was not like-for-like.
 */
import { runDistanceKm } from "./utils/run-units";

/** A runner counts as having covered the group distance at ≥ 95% of it (GPS under-reads). */
export const TARGET_COMPLETION_RATIO = 0.95;
/** Below this the "run" is an accidental start/stop and is not ranked. */
const MIN_RANKABLE_KM = 0.1;

export type GroupParticipantStatus = "not_started" | "running" | "finished";

export interface GroupResultInput {
  userId: string;
  /** Raw `runs.distance` (km; legacy rows may be metres). Null when no run is linked. */
  rawDistance: number | null;
  /** Raw `runs.duration` (seconds; legacy rows may be milliseconds). */
  rawDuration: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface RankedGroupResult extends GroupResultInput {
  status: GroupParticipantStatus;
  distanceKm: number | null;
  durationSeconds: number | null;
  paceSecondsPerKm: number | null;
  /** "m:ss" — canonical, comparable across platforms. */
  pace: string | null;
  coveredTargetDistance: boolean | null;
  /** 1-based; null for anyone without a rankable run. */
  rank: number | null;
}

export function normalizeDurationSeconds(raw: number | null | undefined): number {
  const d = raw ?? 0;
  return d > 86400 ? Math.round(d / 1000) : d;
}

export function formatPace(secondsPerKm: number): string {
  let m = Math.floor(secondsPerKm / 60);
  let s = Math.round(secondsPerKm - m * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function rankGroupResults(
  rows: GroupResultInput[],
  targetDistanceKm: number | null | undefined,
): RankedGroupResult[] {
  const target = targetDistanceKm && targetDistanceKm > 0 ? targetDistanceKm : null;

  const enriched: RankedGroupResult[] = rows.map((r) => {
    const hasRun = r.rawDistance != null;
    const distanceKm = hasRun ? runDistanceKm(r.rawDistance) : null;
    const durationSeconds = hasRun ? normalizeDurationSeconds(r.rawDuration) : null;
    const rankable = distanceKm != null && durationSeconds != null
      && distanceKm >= MIN_RANKABLE_KM && durationSeconds > 0;
    const paceSecondsPerKm = rankable ? durationSeconds! / distanceKm! : null;
    const status: GroupParticipantStatus =
      hasRun || r.completedAt ? "finished" : r.startedAt ? "running" : "not_started";
    return {
      ...r,
      status,
      distanceKm,
      durationSeconds,
      paceSecondsPerKm,
      pace: paceSecondsPerKm != null ? formatPace(paceSecondsPerKm) : null,
      coveredTargetDistance: target != null && distanceKm != null
        ? distanceKm >= target * TARGET_COMPLETION_RATIO
        : null,
      rank: null,
    };
  });

  // Ranked: everyone with a rankable run. Runners who covered the group distance come
  // before anyone who stopped short (otherwise a fast 1 km bail-out "wins"), then by pace,
  // then — on a tie — by the longer distance.
  const ranked = enriched
    .filter((r) => r.paceSecondsPerKm != null)
    .sort((a, b) => {
      if (target != null && a.coveredTargetDistance !== b.coveredTargetDistance) {
        return a.coveredTargetDistance ? -1 : 1;
      }
      if (a.paceSecondsPerKm !== b.paceSecondsPerKm) return a.paceSecondsPerKm! - b.paceSecondsPerKm!;
      return (b.distanceKm ?? 0) - (a.distanceKm ?? 0);
    });
  ranked.forEach((r, i) => { r.rank = i + 1; });

  // Unranked after: finished-without-data, then still running, then not started.
  const order: Record<GroupParticipantStatus, number> = { finished: 0, running: 1, not_started: 2 };
  const unranked = enriched
    .filter((r) => r.paceSecondsPerKm == null)
    .sort((a, b) => order[a.status] - order[b.status]);

  return [...ranked, ...unranked];
}
