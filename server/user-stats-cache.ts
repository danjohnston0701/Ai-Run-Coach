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
 *   - onRunSaved(userId, run)    → called after createRun succeeds
 *   - onRunDeleted(userId, runId)→ called after deleteRun succeeds (triggers full recompute)
 *   - recomputeForUser(userId)   → full recompute from scratch (backfill / recovery)
 *
 * CONSISTENCY:
 *   - For cumulative totals (distance, duration, calories): incremented atomically
 *   - For personal bests: only updated when the new run beats the current record
 *   - On delete: full recompute (deletions are rare, correctness trumps speed)
 */

import { db } from './db';
import { runs, userStats, goals } from '@shared/schema';
import { eq, and, gte, lte, isNotNull, count, sum, avg, max, min, sql } from 'drizzle-orm';

// Distance band definitions for PB categories (in km)
const PB_DISTANCES = [
  { key: '1k',      label: '1K',           minKm: 0.95,  maxKm: 1.1   },
  { key: 'mile',    label: 'Mile',         minKm: 1.59,  maxKm: 1.64  },
  { key: '5k',      label: '5K',           minKm: 4.95,  maxKm: 5.1   },
  { key: '10k',     label: '10K',          minKm: 9.95,  maxKm: 10.1  },
  { key: 'half',    label: 'Half Marathon', minKm: 21.05, maxKm: 21.2  },
  { key: 'marathon',label: 'Marathon',      minKm: 42.15, maxKm: 42.3  },
] as const;

type PbKey = typeof PB_DISTANCES[number]['key'];

// Map PB key → column names in user_stats
const PB_COLUMNS: Record<PbKey, { durationCol: string; runIdCol: string; dateCol: string }> = {
  '1k':       { durationCol: 'pb1kDurationMs',       runIdCol: 'pb1kRunId',       dateCol: 'pb1kDate'       },
  'mile':     { durationCol: 'pbMileDurationMs',     runIdCol: 'pbMileRunId',     dateCol: 'pbMileDate'     },
  '5k':       { durationCol: 'pb5kDurationMs',       runIdCol: 'pb5kRunId',       dateCol: 'pb5kDate'       },
  '10k':      { durationCol: 'pb10kDurationMs',      runIdCol: 'pb10kRunId',      dateCol: 'pb10kDate'      },
  'half':     { durationCol: 'pbHalfDurationMs',     runIdCol: 'pbHalfRunId',     dateCol: 'pbHalfDate'     },
  'marathon': { durationCol: 'pbMarathonDurationMs', runIdCol: 'pbMarathonRunId', dateCol: 'pbMarathonDate' },
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Call this immediately after a run is saved.
 * Increments cumulative totals and updates PBs if this run sets a record.
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
    const [existing] = await db.select().from(userStats).where(eq(userStats.userId, userId));

    if (!existing) {
      // First run for this user — build the cache from scratch
      await recomputeForUser(userId);
      return;
    }

    const runPace = parseFloat(run.avgPace || '0') || null;
    const newCount = existing.totalRuns + 1;

    // Incremental average: newAvg = (oldAvg * oldCount + newValue) / newCount
    const newAvgPace = (runPace && runPace > 0)
      ? (((existing.avgPaceMinPerKm ?? 0) * existing.totalRuns) + runPace) / newCount
      : existing.avgPaceMinPerKm;

    // Convert run.distance from meters to km
    const distanceKm = run.distance / 1000;

    await db.update(userStats).set({
      totalRuns:            newCount,
      totalDistanceKm:      (existing.totalDistanceKm ?? 0) + distanceKm,
      totalDurationSeconds: (existing.totalDurationSeconds ?? 0) + run.duration,
      totalElevationGainM:  (existing.totalElevationGainM ?? 0) + (run.elevationGain ?? 0),
      totalCalories:        (existing.totalCalories ?? 0) + (run.calories ?? 0),
      totalActiveCalories:  (existing.totalActiveCalories ?? 0) + (run.activeCalories ?? 0),
      avgPaceMinPerKm:      newAvgPace,
      fastestPaceMinPerKm:  (runPace && runPace > 0)
        ? Math.min(existing.fastestPaceMinPerKm ?? 999, runPace)
        : existing.fastestPaceMinPerKm,
      longestRunKm: Math.max(existing.longestRunKm ?? 0, distanceKm),
      updatedAt: new Date(),
    }).where(eq(userStats.userId, userId));

    // Check if this run sets a PB in any distance category
    await maybeUpdatePersonalBests(userId, run);

    console.log(`[UserStatsCache] Updated stats for user ${userId} after run ${run.id}`);
  } catch (error) {
    // Non-fatal: My Data screen has a live fallback, cache miss is graceful
    console.error(`[UserStatsCache] Failed to update stats for user ${userId}:`, error);
  }
}

/**
 * Call this after a run is deleted.
 * Deletions are rare so we do a full recompute for correctness.
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
 * Used for: first run, run deletions, and backfilling existing users.
 */
export async function recomputeForUser(userId: string): Promise<void> {
  // ── Aggregate all-time totals in a single SQL query ──────────────────────
  const [agg] = await db.select({
    totalRuns:           count(),
    totalDistanceKm:     sum(runs.distance),
    totalDurationSec:    sum(runs.duration),
    totalElevationGain:  sum(runs.elevationGain),
    totalCalories:       sum(runs.calories),
    totalActiveCalories: sum(runs.activeCalories),
    longestRunKm:        max(runs.distance),
    // avgPace is stored as "M:SS" format (e.g. "5:22") — parse via SPLIT_PART
    fastestPace: sql<number>`MIN(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
    avgPace:     sql<number>`AVG(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
  }).from(runs).where(eq(runs.userId, userId));

  // ── Find PBs for each distance category ─────────────────────────────────
  const pbUpdates: Record<string, number | string | Date | null> = {};

  // 1K and Mile PBs: fastest SPLIT from any run (not runs of exactly that distance)
  // Uses PostgreSQL jsonb_array_elements to scan km_splits across all runs.
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
      // Duration = time to cover the segment at this pace (pace_seconds is sec/km)
      const durationMs = Math.round(best.pace_seconds * splitDist.segmentKm * 1000);
      pbUpdates[cols.durationCol] = durationMs;
      pbUpdates[cols.runIdCol]    = best.id;
      pbUpdates[cols.dateCol]     = best.completed_at ?? null;
    } else {
      pbUpdates[cols.durationCol] = null;
      pbUpdates[cols.runIdCol]    = null;
      pbUpdates[cols.dateCol]     = null;
    }
  }

  // 5K, 10K, Half Marathon, Marathon: best run by total distance in band
  for (const dist of PB_DISTANCES.filter(d => d.key !== '1k' && d.key !== 'mile')) {
    // Convert min/max from km to meters for database query
    const minMeters = dist.minKm * 1000;
    const maxMeters = dist.maxKm * 1000;
    
    const [pbRun] = await db
      .select({ id: runs.id, duration: runs.duration, completedAt: runs.completedAt })
      .from(runs)
      .where(and(
        eq(runs.userId, userId),
        gte(runs.distance, minMeters),
        sql`${runs.distance} <= ${maxMeters}`,
        isNotNull(runs.avgPace),
      ))
      .orderBy(runs.avgPace)   // fastest (lowest) pace first
      .limit(1);

    const cols = PB_COLUMNS[dist.key];
    pbUpdates[cols.durationCol] = pbRun?.duration ?? null;
    pbUpdates[cols.runIdCol]    = pbRun?.id ?? null;
    pbUpdates[cols.dateCol]     = pbRun?.completedAt ?? null;
  }

  // ── Count completed goals ─────────────────────────────────────────────────
  const [completedGoalsResult] = await db
    .select({ count: count() })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, "completed")));
  
  const goalsAchieved = Number(completedGoalsResult?.count ?? 0);

  // ── Upsert the cache row ─────────────────────────────────────────────────
  const totalRuns = Number(agg.totalRuns ?? 0);
  // Convert from meters to km (database stores distance in meters)
  const totalDistanceKm = (Number(agg.totalDistanceKm ?? 0)) / 1000;
  const longestRunKm = (Number(agg.longestRunKm ?? 0)) / 1000;
  
  const upsertData = {
    userId,
    updatedAt:            new Date(),
    totalRuns,
    totalDistanceKm,
    totalDurationSeconds: Number(agg.totalDurationSec ?? 0),
    totalElevationGainM:  Number(agg.totalElevationGain ?? 0),
    totalCalories:        Number(agg.totalCalories ?? 0),
    totalActiveCalories:  Number(agg.totalActiveCalories ?? 0),
    avgPaceMinPerKm:      Number(agg.avgPace ?? 0) || null,
    fastestPaceMinPerKm:  Number(agg.fastestPace ?? 0) || null,
    longestRunKm,
    // PB fields (typed assertion safe — we build from PB_COLUMNS keys)
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
 * Parse a "M:SS" pace string into total seconds per km. Returns null on failure.
 */
function parsePaceToSeconds(paceStr: string | null | undefined): number | null {
  if (!paceStr) return null;
  const match = paceStr.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/**
 * Check if the saved run beats any PB and update just those fields.
 * Handles:
 *   - 5K / 10K / Half / Marathon: total-run distance band comparison
 *   - 1K / Mile: fastest km split from this run vs current best split PB
 */
async function maybeUpdatePersonalBests(userId: string, run: {
  id: string;
  distance: number;
  duration: number;
  avgPace?: string | null;
  completedAt?: Date | null;
  kmSplits?: Array<{ km?: number; pace?: string; [key: string]: any }> | null;
}): Promise<void> {
  const [existing] = await db.select().from(userStats).where(eq(userStats.userId, userId));
  if (!existing) return;

  const updates: Record<string, number | string | Date> = {};

  // ── 1K and Mile: check fastest km split from this run ──────────────────
  if (Array.isArray(run.kmSplits) && run.kmSplits.length > 0) {
    // Find the fastest individual km split in this run
    let fastestSplitSeconds: number | null = null;
    for (const split of run.kmSplits) {
      const sec = parsePaceToSeconds(split.pace);
      if (sec !== null && (fastestSplitSeconds === null || sec < fastestSplitSeconds)) {
        fastestSplitSeconds = sec;
      }
    }

    if (fastestSplitSeconds !== null) {
      const runDate = run.completedAt ?? new Date();

      // 1K: duration = fastest km split pace in ms
      const new1kMs = Math.round(fastestSplitSeconds * 1000);
      const cur1k = existing.pb1kDurationMs as number | null;
      if (!cur1k || new1kMs < cur1k) {
        updates['pb1kDurationMs'] = new1kMs;
        updates['pb1kRunId']      = run.id;
        updates['pb1kDate']       = runDate;
        console.log(`[UserStatsCache] New 1K PB for user ${userId}: ${new1kMs}ms (split pace)`);
      }

      // Mile: duration = fastest km split pace × 1.609 in ms
      const newMileMs = Math.round(fastestSplitSeconds * 1.609 * 1000);
      const curMile = existing.pbMileDurationMs as number | null;
      if (!curMile || newMileMs < curMile) {
        updates['pbMileDurationMs'] = newMileMs;
        updates['pbMileRunId']      = run.id;
        updates['pbMileDate']       = runDate;
        console.log(`[UserStatsCache] New Mile PB for user ${userId}: ${newMileMs}ms (split pace)`);
      }
    }
  }

  // ── 5K, 10K, Half, Marathon: total-run distance band ──────────────────
  const distanceKm = run.distance / 1000;
  const matchingDist = PB_DISTANCES.find(
    d => d.key !== '1k' && d.key !== 'mile' && distanceKm >= d.minKm && distanceKm <= d.maxKm
  );
  if (matchingDist && run.avgPace) {
    const cols = PB_COLUMNS[matchingDist.key];
    const existingDuration = (existing as any)[cols.durationCol] as number | null;
    if (!existingDuration || run.duration < existingDuration) {
      updates[cols.durationCol] = run.duration;
      updates[cols.runIdCol]    = run.id;
      updates[cols.dateCol]     = run.completedAt ?? new Date();
      console.log(`[UserStatsCache] New ${matchingDist.label} PB for user ${userId}: ${run.duration}ms`);
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.update(userStats).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(userStats.userId, userId));
  }
}
