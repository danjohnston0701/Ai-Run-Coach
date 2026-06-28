/**
 * User Stats Cache Service
 *
 * Maintains the user_stats table — a pre-computed summary of all-time totals
 * and personal bests for each user.
 *
 * WHY: The My Data screen needs all-time stats and PBs on every load.
 *      Without a cache, this requires querying every run the user has ever done.
 *      With the cache, it's a single PK lookup — O(1) forever.
 *
 * UPDATE TRIGGERS:
 *   - onRunSaved(userId, run)    → always triggers full recompute for correctness
 *   - onRunDeleted(userId)       → full recompute
 *   - recomputeForUser(userId)   → full recompute from scratch (backfill / recovery)
 *
 * UNIT CONVENTIONS (canonical rule — enforced by all write paths):
 *   - runs.distance     → km  (e.g. 5.19 for a 5.19km run)
 *   - runs.duration     → seconds (e.g. 1520 = 25.3 minutes — NOT milliseconds)
 *   - km_splits[].time  → milliseconds per km split
 *   - pb_*_duration_ms  → milliseconds (runs.duration × 1000 when storing)
 *   - total_distance_km → km (runs.distance summed directly — no /1000 needed)
 *   - total_duration_s  → seconds (runs.duration summed directly)
 *
 * NOTE: Legacy rows written before the unit fix may store distance in meters.
 * All SQL queries use CASE WHEN distance > 200 THEN distance/1000 ELSE distance END
 * to normalize on-the-fly. Run the one-time migration SQL to fully clean up old rows.
 *
 * NOTE: Despite the "_ms" column suffix, historical rows may contain seconds if
 * written by old code. The recompute-all admin endpoint corrects all rows.
 */

import { db } from './db';
import { runs, userStats, goals } from '@shared/schema';
import { eq, and, gte, lte, isNotNull, count, sum, avg, max, min, sql } from 'drizzle-orm';
import { refreshRunnerProfile } from './runner-profile-service';

// Distance band definitions for PB categories (in km).
// Half marathon band is deliberately wide (21.0–21.6) because GPS tracks 21.097km
// but runners often end up anywhere in 21.0–21.5 depending on GPS drift and route.
const PB_DISTANCES = [
  { key: '1k',      label: '1K',            minKm: 0.95,  maxKm: 1.1   },
  { key: 'mile',    label: 'Mile',          minKm: 1.59,  maxKm: 1.65  },
  { key: '5k',      label: '5K',            minKm: 4.9,   maxKm: 5.2   },
  { key: '10k',     label: '10K',           minKm: 9.9,   maxKm: 10.2  },
  { key: '20k',     label: '20K',           minKm: 19.8,  maxKm: 20.3  },
  { key: 'half',    label: 'Half Marathon', minKm: 21.0,  maxKm: 21.6  },  // ← was 21.05–21.2, too narrow
  { key: 'marathon',label: 'Marathon',      minKm: 42.0,  maxKm: 42.5  },  // ← also widened
] as const;

type PbKey = typeof PB_DISTANCES[number]['key'];

// Map PB key → column names in user_stats
const PB_COLUMNS: Record<PbKey, { durationCol: string; runIdCol: string; dateCol: string }> = {
  '1k':       { durationCol: 'pb1kDurationMs',       runIdCol: 'pb1kRunId',       dateCol: 'pb1kDate'       },
  'mile':     { durationCol: 'pbMileDurationMs',     runIdCol: 'pbMileRunId',     dateCol: 'pbMileDate'     },
  '5k':       { durationCol: 'pb5kDurationMs',       runIdCol: 'pb5kRunId',       dateCol: 'pb5kDate'       },
  '10k':      { durationCol: 'pb10kDurationMs',      runIdCol: 'pb10kRunId',      dateCol: 'pb10kDate'      },
  '20k':      { durationCol: 'pb20kDurationMs',      runIdCol: 'pb20kRunId',      dateCol: 'pb20kDate'      },
  'half':     { durationCol: 'pbHalfDurationMs',     runIdCol: 'pbHalfRunId',     dateCol: 'pbHalfDate'     },
  'marathon': { durationCol: 'pbMarathonDurationMs', runIdCol: 'pbMarathonRunId', dateCol: 'pbMarathonDate' },
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Call this immediately after a run is saved.
 * Always does a full recompute for correctness — the incremental path had
 * too many unit-conversion edge cases that caused data drift over time.
 */
export async function onRunSaved(userId: string, run: {
  id: string;
  distance: number;
  duration: number;
  elevationGain?: number | null;
  calories?: number | null;
  activeCalories?: number | null;
  avgPace?: string | null;
  completedAt?: Date | null;
  kmSplits?: Array<{ km?: number; pace?: string; [key: string]: any }> | null;
}): Promise<void> {
  try {
    // Always full-recompute — this is O(runs_count) SQL but runs < 1000 for any user
    // and avoids the incremental drift bugs that caused Wayne's 19321km total_distance_km.
    await recomputeForUser(userId);
    console.log(`[UserStatsCache] Recomputed stats for user ${userId} after run ${run.id}`);
  } catch (error) {
    // Non-fatal: My Data screen has a live fallback, cache miss is graceful
    console.error(`[UserStatsCache] Failed to update stats for user ${userId}:`, error);
  }

  // Refresh AI runner profile non-blocking — fire and forget.
  // If it fails the profile just stays at its last value (graceful degradation).
  refreshRunnerProfile(userId).catch(err =>
    console.error(`[UserStatsCache] Runner profile refresh failed for ${userId}:`, err),
  );
}

/**
 * Call this after a run is deleted.
 * Full recompute for correctness.
 */
export async function onRunDeleted(userId: string): Promise<void> {
  try {
    await recomputeForUser(userId);
    console.log(`[UserStatsCache] Recomputed stats for user ${userId} after run deletion`);
  } catch (error) {
    console.error(`[UserStatsCache] Failed to recompute after deletion for user ${userId}:`, error);
  }
}

/**
 * Full recompute from scratch using SQL aggregation.
 * Used for: all run saves, deletions, and admin backfill.
 *
 * UNIT NOTES (canonical rule — enforced by all write paths):
 *   - runs.distance → km  (e.g. 5.19 for a 5.19km run)
 *   - runs.duration → seconds (e.g. 1520 = 25.3 minutes)
 *   - pb_*_duration_ms columns store MILLISECONDS → runs.duration × 1000
 *
 * The DIST_KM SQL expression applies a safety-net CASE for any legacy rows
 * that may still be in meters (distance > 200 is impossible for a single run
 * in km, so it must be meters — divide by 1000).
 * After the one-time Neon migration SQL has been run, this CASE never fires.
 */
// Safety-net SQL expression: normalizes distance to km regardless of stored unit.
// Any value > 200 km would be impossible for a single run, so treat as meters.
const DIST_KM = sql<number>`CASE WHEN distance > 200 THEN distance / 1000.0 ELSE distance END`;

export async function recomputeForUser(userId: string): Promise<void> {
  // ── Aggregate all-time totals in a single SQL query ──────────────────────
  const [agg] = await db.select({
    totalRuns:           count(),
    totalDistanceKm:     sql<number>`SUM(CASE WHEN ${runs.distance} > 200 THEN ${runs.distance} / 1000.0 ELSE ${runs.distance} END)`,
    // Safety-net: legacy Strava/Garmin rows may have duration stored in ms (e.g. 336000).
    // Values > 86400 (one day) are impossible in seconds for a single run → treat as ms.
    totalDurationSec:    sql<number>`SUM(CASE WHEN ${runs.duration} > 86400 THEN ${runs.duration} / 1000 ELSE ${runs.duration} END)`,
    totalElevationGain:  sum(runs.elevationGain),
    totalCalories:       sum(runs.calories),
    totalActiveCalories: sum(runs.activeCalories),
    longestRunKm:        sql<number>`MAX(CASE WHEN ${runs.distance} > 200 THEN ${runs.distance} / 1000.0 ELSE ${runs.distance} END)`,
    // Highest elevation: prefer maxElevation column; fall back to elevationGain
    highestElevationM:   sql<number>`COALESCE(MAX(${runs.maxElevation}), MAX(${runs.elevationGain}), 0)`,
    // avgPace is stored as "M:SS" format (e.g. "5:22") — parse via SPLIT_PART
    fastestPace: sql<number>`MIN(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
    avgPace:     sql<number>`AVG(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
  }).from(runs).where(eq(runs.userId, userId));

  // ── Find PBs for each distance category ─────────────────────────────────
  const pbUpdates: Record<string, number | string | Date | null> = {};

  // 1K and Mile PBs: fastest SPLIT from any run (not runs of exactly that distance).
  // Uses PostgreSQL jsonb_array_elements to scan km_splits across all runs.
  // Stores result in MILLISECONDS.
  for (const splitDist of [
    { key: '1k'   as PbKey, segmentKm: 1.0   },
    { key: 'mile' as PbKey, segmentKm: 1.609 },
  ]) {
    const rows = await db.execute<{ id: string; completed_at: Date | null; pace_seconds: number }>(sql`
      SELECT
        r.id,
        r.completed_at,
        SPLIT_PART(elem->>'pace', ':', 1)::numeric * 60
          + SPLIT_PART(elem->>'pace', ':', 2)::numeric AS pace_seconds
      FROM runs r,
      LATERAL jsonb_array_elements(r.km_splits) AS elem
      WHERE r.user_id = ${userId}
        AND r.km_splits IS NOT NULL
        AND jsonb_typeof(r.km_splits) = 'array'
        AND (elem->>'pace') LIKE '%:%'
      ORDER BY pace_seconds ASC
      LIMIT 1
    `);

    const best = rows.rows?.[0];
    const cols = PB_COLUMNS[splitDist.key];
    if (best) {
      // pace_seconds = seconds per km. Duration = time to cover segment in ms.
      const durationMs = Math.round(Number(best.pace_seconds) * splitDist.segmentKm * 1000);
      pbUpdates[cols.durationCol] = durationMs;
      pbUpdates[cols.runIdCol]    = best.id;
      // Neon driver may return timestamp as string — ensure we pass a real Date object
      pbUpdates[cols.dateCol]     = toDate(best.completed_at as any);
    } else {
      pbUpdates[cols.durationCol] = null;
      pbUpdates[cols.runIdCol]    = null;
      pbUpdates[cols.dateCol]     = null;
    }
  }

  // 5K, 10K, Half Marathon, Marathon: best performance from either:
  // 1. A dedicated run in the distance band (e.g., a 5K-only run)
  // 2. A split/segment from a longer run (e.g., 5K split from a 10K run)
  // We check both and use whichever has the faster pace.
  // runs.duration is in SECONDS → multiply × 1000 to store as milliseconds
  // so that pb_*_duration_ms column names are accurate.
  for (const dist of PB_DISTANCES.filter(d => d.key !== '1k' && d.key !== 'mile')) {
    const cols = PB_COLUMNS[dist.key];
    // Distance thresholds in km (canonical unit).
    // The CASE expression normalizes any legacy meter rows on-the-fly so the
    // WHERE clause works correctly regardless of which unit a row was stored in.
    const minKm = dist.minKm;
    const maxKm = dist.maxKm;

    // ── Check dedicated runs in the distance band ────────────────────────────
    const [pbRun] = await db
      .select({ id: runs.id, duration: runs.duration, completedAt: runs.completedAt })
      .from(runs)
      .where(and(
        eq(runs.userId, userId),
        sql`(CASE WHEN ${runs.distance} > 200 THEN ${runs.distance} / 1000.0 ELSE ${runs.distance} END) >= ${minKm}`,
        sql`(CASE WHEN ${runs.distance} > 200 THEN ${runs.distance} / 1000.0 ELSE ${runs.distance} END) <= ${maxKm}`,
        isNotNull(runs.avgPace),
      ))
      .orderBy(runs.avgPace)   // fastest (lowest) pace first ("4:00" < "5:00" alphabetically ✓)
      .limit(1);

    let bestRun: { id: string; duration: number | null; completedAt: Date | null } | null = pbRun ?? null;
    let bestPaceSecsPerKm: number | null = null;

    if (bestRun?.duration) {
      bestPaceSecsPerKm = bestRun.duration;  // duration in seconds, divide by km for pace
    }

    // ── Check splits from all runs (fastest segment of this distance) ────────
    // Find the fastest pace segment matching this distance category
    const splitRows = await db.execute<{ id: string; completed_at: Date | null; pace_seconds: number }>(sql`
      SELECT
        r.id,
        r.completed_at,
        SPLIT_PART(elem->>'pace', ':', 1)::numeric * 60
          + SPLIT_PART(elem->>'pace', ':', 2)::numeric AS pace_seconds
      FROM runs r,
      LATERAL jsonb_array_elements(r.km_splits) AS elem
      WHERE r.user_id = ${userId}
        AND r.km_splits IS NOT NULL
        AND jsonb_typeof(r.km_splits) = 'array'
        AND (elem->>'pace') LIKE '%:%'
      ORDER BY pace_seconds ASC
      LIMIT 1
    `);

    const bestSplit = splitRows.rows?.[0];
    
    // If we have a split and it's faster than the dedicated run, use the split
    if (bestSplit && (!bestPaceSecsPerKm || bestSplit.pace_seconds < bestPaceSecsPerKm)) {
      bestRun = {
        id: bestSplit.id,
        duration: null,  // Will use pace_seconds directly
        completedAt: bestSplit.completed_at ? toDate(bestSplit.completed_at as any) : null,
      };
      bestPaceSecsPerKm = bestSplit.pace_seconds;
    }

    // ── Store the winner in cache ─────────────────────────────────────────
    if (bestRun && bestPaceSecsPerKm !== null) {
      // Duration = time to cover this distance segment in milliseconds
      const durationMs = Math.round(bestPaceSecsPerKm * dist.minKm * 1000);
      pbUpdates[cols.durationCol] = durationMs;
      pbUpdates[cols.runIdCol]    = bestRun.id;
      pbUpdates[cols.dateCol]     = bestRun.completedAt ?? null;
    } else {
      pbUpdates[cols.durationCol] = null;
      pbUpdates[cols.runIdCol]    = null;
      pbUpdates[cols.dateCol]     = null;
    }
  }

  // ── Count completed goals ─────────────────────────────────────────────────
  const [completedGoalsResult] = await db
    .select({ count: count() })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, "completed")));

  const goalsAchieved = Number(completedGoalsResult?.count ?? 0);

  // ── Upsert the cache row ─────────────────────────────────────────────────
  const totalRuns = Number(agg.totalRuns ?? 0);
  // runs.distance is in KM (canonical rule). SQL already normalized via CASE expression.
  const totalDistanceKm = Number(agg.totalDistanceKm ?? 0);
  const longestRunKm    = Number(agg.longestRunKm    ?? 0);
  // runs.duration is in SECONDS — store directly (column is total_duration_seconds)
  const totalDurationSeconds = Number(agg.totalDurationSec ?? 0);

  // Longest run time: duration of the run with the greatest distance (already in seconds)
  // Order by normalized distance so legacy meter rows sort correctly
  let longestRunTimeSec = 0;
  if (totalRuns > 0) {
    const [longestRun] = await db
      .select({ duration: runs.duration })
      .from(runs)
      .where(eq(runs.userId, userId))
      .orderBy(sql`CASE WHEN ${runs.distance} > 200 THEN ${runs.distance} / 1000.0 ELSE ${runs.distance} END DESC NULLS LAST`)
      .limit(1);
    // Normalize duration: legacy rows may be in ms; values > 86400 are impossible in seconds.
    const rawDur = longestRun?.duration || 0;
    longestRunTimeSec = Math.round(rawDur > 86400 ? rawDur / 1000 : rawDur);
  }

  const highestElevationM = Math.round(Number(agg.highestElevationM ?? 0));

  console.log(`[UserStatsCache] Recomputing for user ${userId}: ${totalRuns} runs, ${totalDistanceKm.toFixed(2)}km, ${totalDurationSeconds}s, longestTime=${longestRunTimeSec}s, highElev=${highestElevationM}m`);

  const upsertData = {
    userId,
    updatedAt:            new Date(),
    totalRuns,
    totalDistanceKm,
    totalDurationSeconds,
    totalElevationGainM:  Number(agg.totalElevationGain ?? 0),
    totalCalories:        Number(agg.totalCalories ?? 0),
    totalActiveCalories:  Number(agg.totalActiveCalories ?? 0),
    avgPaceMinPerKm:      Number(agg.avgPace ?? 0) || null,
    fastestPaceMinPerKm:  Number(agg.fastestPace ?? 0) || null,
    longestRunKm,
    longestRunTimeSec,
    highestElevationM,
    // PB fields — all duration columns store MILLISECONDS
    pb1kDurationMs:       pbUpdates['pb1kDurationMs'] as number | null,
    pb1kRunId:            pbUpdates['pb1kRunId'] as string | null,
    pb1kDate:             pbUpdates['pb1kDate'] as Date | null,
    pbMileDurationMs:     pbUpdates['pbMileDurationMs'] as number | null,
    pbMileRunId:          pbUpdates['pbMileRunId'] as string | null,
    pbMileDate:           pbUpdates['pbMileDate'] as Date | null,
    pb5kDurationMs:       pbUpdates['pb5kDurationMs'] as number | null,
    pb5kRunId:            pbUpdates['pb5kRunId'] as string | null,
    pb5kDate:             pbUpdates['pb5kDate'] as Date | null,
    pb10kDurationMs:      pbUpdates['pb10kDurationMs'] as number | null,
    pb10kRunId:           pbUpdates['pb10kRunId'] as string | null,
    pb10kDate:            pbUpdates['pb10kDate'] as Date | null,
    pb20kDurationMs:      pbUpdates['pb20kDurationMs'] as number | null,
    pb20kRunId:           pbUpdates['pb20kRunId'] as string | null,
    pb20kDate:            pbUpdates['pb20kDate'] as Date | null,
    pbHalfDurationMs:     pbUpdates['pbHalfDurationMs'] as number | null,
    pbHalfRunId:          pbUpdates['pbHalfRunId'] as string | null,
    pbHalfDate:           pbUpdates['pbHalfDate'] as Date | null,
    pbMarathonDurationMs: pbUpdates['pbMarathonDurationMs'] as number | null,
    pbMarathonRunId:      pbUpdates['pbMarathonRunId'] as string | null,
    pbMarathonDate:       pbUpdates['pbMarathonDate'] as Date | null,
    goalsAchieved,
  };

  await db
    .insert(userStats)
    .values(upsertData)
    .onConflictDoUpdate({
      target: userStats.userId,
      set: { ...upsertData, userId: undefined },  // Don't overwrite PK
    });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Safely convert any timestamp value (Date, string, number, null) to a Date or null.
 * Needed because the Neon postgres driver returns timestamp columns as ISO strings,
 * not JS Date objects, but Drizzle's PgTimestamp.mapToDriverValue() calls .toISOString()
 * which fails on strings.
 */
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a "M:SS" pace string into total seconds per km. Returns null on failure.
 */
function parsePaceToSeconds(paceStr: string | null | undefined): number | null {
  if (!paceStr) return null;
  const match = paceStr.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}
