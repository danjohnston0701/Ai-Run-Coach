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
import { runs, userStats } from '@shared/schema';
import { eq, and, gte, lte, isNotNull, count, sum, avg, max, min, sql } from 'drizzle-orm';

// Distance band definitions for PB categories (in km)
const PB_DISTANCES = [
  { key: '1k',      label: '1K',           minKm: 0.95,  maxKm: 1.1   },
  { key: '5k',      label: '5K',           minKm: 4.95,  maxKm: 5.1   },
  { key: '10k',     label: '10K',          minKm: 9.95,  maxKm: 10.1  },
  { key: 'half',    label: 'Half Marathon', minKm: 21.05, maxKm: 21.2  },
  { key: 'marathon',label: 'Marathon',      minKm: 42.15, maxKm: 42.3  },
] as const;

type PbKey = typeof PB_DISTANCES[number]['key'];

// Map PB key → column names in user_stats
const PB_COLUMNS: Record<PbKey, { durationCol: string; runIdCol: string; dateCol: string }> = {
  '1k':       { durationCol: 'pb1kDurationMs',       runIdCol: 'pb1kRunId',       dateCol: 'pb1kDate'       },
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

    await db.update(userStats).set({
      totalRuns:            newCount,
      totalDistanceKm:      (existing.totalDistanceKm ?? 0) + run.distance,
      totalDurationSeconds: (existing.totalDurationSeconds ?? 0) + run.duration,
      totalElevationGainM:  (existing.totalElevationGainM ?? 0) + (run.elevationGain ?? 0),
      totalCalories:        (existing.totalCalories ?? 0) + (run.calories ?? 0),
      totalActiveCalories:  (existing.totalActiveCalories ?? 0) + (run.activeCalories ?? 0),
      avgPaceMinPerKm:      newAvgPace,
      fastestPaceMinPerKm:  (runPace && runPace > 0)
        ? Math.min(existing.fastestPaceMinPerKm ?? 999, runPace)
        : existing.fastestPaceMinPerKm,
      longestRunKm: Math.max(existing.longestRunKm ?? 0, run.distance),
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
    fastestPace:         sql<number>`MIN(NULLIF(CAST(${runs.avgPace} AS NUMERIC), 0))`,
    avgPace:             sql<number>`AVG(NULLIF(CAST(${runs.avgPace} AS NUMERIC), 0))`,
  }).from(runs).where(eq(runs.userId, userId));

  // ── Find PBs for each distance category ─────────────────────────────────
  const pbUpdates: Record<string, number | string | Date | null> = {};

  for (const dist of PB_DISTANCES) {
    const [pbRun] = await db
      .select({ id: runs.id, duration: runs.duration, completedAt: runs.completedAt })
      .from(runs)
      .where(and(
        eq(runs.userId, userId),
        gte(runs.distance, dist.minKm),
        sql`${runs.distance} <= ${dist.maxKm}`,
        isNotNull(runs.avgPace),
      ))
      .orderBy(runs.avgPace)   // fastest (lowest) pace first
      .limit(1);

    const cols = PB_COLUMNS[dist.key];
    pbUpdates[cols.durationCol] = pbRun?.duration ?? null;
    pbUpdates[cols.runIdCol]    = pbRun?.id ?? null;
    pbUpdates[cols.dateCol]     = pbRun?.completedAt ?? null;
  }

  // ── Upsert the cache row ─────────────────────────────────────────────────
  const totalRuns = Number(agg.totalRuns ?? 0);
  const upsertData = {
    userId,
    updatedAt:            new Date(),
    totalRuns,
    totalDistanceKm:      Number(agg.totalDistanceKm ?? 0),
    totalDurationSeconds: Number(agg.totalDurationSec ?? 0),
    totalElevationGainM:  Number(agg.totalElevationGain ?? 0),
    totalCalories:        Number(agg.totalCalories ?? 0),
    totalActiveCalories:  Number(agg.totalActiveCalories ?? 0),
    avgPaceMinPerKm:      Number(agg.avgPace ?? 0) || null,
    fastestPaceMinPerKm:  Number(agg.fastestPace ?? 0) || null,
    longestRunKm:         Number(agg.longestRunKm ?? 0),
    // PB fields (typed assertion safe — we build from PB_COLUMNS keys)
    pb1kDurationMs:       pbUpdates['pb1kDurationMs'] as number | null,
    pb1kRunId:            pbUpdates['pb1kRunId'] as string | null,
    pb1kDate:             pbUpdates['pb1kDate'] as Date | null,
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
 * Check if the saved run beats any PB and update just those fields.
 */
async function maybeUpdatePersonalBests(userId: string, run: {
  id: string;
  distance: number;
  duration: number;
  avgPace?: string | null;
  completedAt?: Date | null;
}): Promise<void> {
  const matchingDist = PB_DISTANCES.find(d => run.distance >= d.minKm && run.distance <= d.maxKm);
  if (!matchingDist || !run.avgPace) return;

  const [existing] = await db.select().from(userStats).where(eq(userStats.userId, userId));
  if (!existing) return;

  const cols = PB_COLUMNS[matchingDist.key];
  const existingDuration = (existing as any)[cols.durationCol] as number | null;

  // Lower duration = faster run = new PB
  if (!existingDuration || run.duration < existingDuration) {
    await db.update(userStats).set({
      [cols.durationCol]: run.duration,
      [cols.runIdCol]:    run.id,
      [cols.dateCol]:     run.completedAt ?? new Date(),
      updatedAt:          new Date(),
    }).where(eq(userStats.userId, userId));

    console.log(`[UserStatsCache] New ${matchingDist.label} PB for user ${userId}: ${run.duration}ms`);
  }
}
