/**
 * My Data Service
 *
 * Provides analytics, performance insights, and trend analysis
 * across user's running history.
 *
 * Performance strategy:
 *   - getPeriodStatistics()  → SQL aggregation (1 query, 1 row returned)
 *   - getAllTimeStats()       → reads from user_stats cache table (O(1) PK lookup)
 *   - getPersonalBests()     → reads from user_stats cache table (O(1) PK lookup)
 *   - getDetailedTrends()    → per-run data for charts, but only 5 columns (no JSON blobs)
 */

import { db } from './db';
import { runs, userStats, goals } from '@shared/schema';
import { eq, gte, and, desc, asc, count, sum, avg, max, min, sql, isNotNull } from 'drizzle-orm';
import { type InferSelectModel } from 'drizzle-orm';

// ─── Personal Bests ──────────────────────────────────────────────────────────

/**
 * Get personal bests from the user_stats cache table.
 * Falls back to live DB query if cache not yet populated.
 */
export async function getPersonalBests(userId: string) {
  try {
    // Attempt cache read first (O(1) PK lookup)
    const [cached] = await db.select().from(userStats).where(eq(userStats.userId, userId));

    if (cached) {
      return buildPersonalBestsFromCache(cached);
    }
  } catch (err) {
    console.warn('[MyData] user_stats cache miss for PBs, falling back to live query:', err);
  }

  // Fallback: live query (runs for users without cache yet)
  return getPersonalBestsLive(userId);
}

/**
 * Live PB query — fetches runs and calculates PBs for both distance-based
 * and split-based (fastest km/mile) personal bests.
 */
async function getPersonalBestsLive(userId: string) {
  const distancePBs = [
    { min: 0.95, max: 1.1,   label: '5K',           target: 5.0 },
    { min: 9.95, max: 10.1,  label: '10K',          target: 10.0 },
    { min: 21.05, max: 21.2, label: 'Half Marathon', target: 21.1 },
    { min: 42.15, max: 42.3, label: 'Marathon',      target: 42.2 },
  ];

  const personalBests: any[] = [];

  // Fetch all runs to calculate both distance-based and split-based PBs
  const userRuns = await db
    .select()
    .from(runs)
    .where(eq(runs.userId, userId))
    .orderBy(asc(runs.completedAt));

  // Calculate distance-based personal bests (5K, 10K, Half Marathon, Marathon)
  for (const dist of distancePBs) {
    let bestRun: typeof userRuns[0] | null = null;
    let bestPace: number | null = null;

    for (const run of userRuns) {
      if (!run.avgPace || run.distance === null) continue;
      
      // Convert distance from meters to km for comparison
      const distanceKm = run.distance / 1000;
      const isInRange = distanceKm >= dist.min && distanceKm <= dist.max;
      if (!isInRange) continue;

      const pace = parseFloat(run.avgPace);
      if (isNaN(pace)) continue;

      if (bestPace === null || pace < bestPace) {
        bestPace = pace;
        bestRun = run;
      }
    }

    if (bestRun && bestPace !== null) {
      personalBests.push({
        category: dist.label,
        pace: formatPace(bestPace),
        distance: bestRun.distance,
        duration: bestRun.duration,
        date: bestRun.completedAt?.toISOString().split('T')[0] || '',
        runId: bestRun.id,
      });
    }
  }

  // Calculate fastest 1K from km splits
  const fastest1K = findFastestSplitFromRuns(userRuns, 1.0);
  if (fastest1K) {
    personalBests.push(fastest1K);
  }

  // Calculate fastest Mile from km splits
  const fastestMile = findFastestSplitFromRuns(userRuns, 1.609);
  if (fastestMile) {
    personalBests.push(fastestMile);
  }

  return personalBests;
}

/**
 * Helper: Find fastest split across all runs and return as PersonalBest object
 */
function findFastestSplitFromRuns(
  runs: typeof runs.$inferSelect[],
  segmentKm: number
): any | null {
  let fastestPaceMinutes: number | null = null;
  let fastestRun: typeof runs.$inferSelect | null = null;

  for (const run of runs) {
    if (!Array.isArray(run.kmSplits)) continue;

    for (const split of run.kmSplits) {
      if (!split.pace) continue;
      const paceMinutes = parsePaceToMinutes(split.pace);
      if (paceMinutes === null) continue;

      if (fastestPaceMinutes === null || paceMinutes < fastestPaceMinutes) {
        fastestPaceMinutes = paceMinutes;
        fastestRun = run;
      }
    }
  }

  if (!fastestRun || fastestPaceMinutes === null) return null;

  const label = segmentKm === 1.0 ? '1K' : 'Mile';
  return {
    category: label,
    pace: formatPace(fastestPaceMinutes),
    distance: segmentKm,
    duration: Math.round(fastestPaceMinutes * 60 * 1000), // Convert min to ms
    date: fastestRun.completedAt?.toISOString().split('T')[0] || '',
    runId: fastestRun.id,
  };
}

/**
 * Parse pace string (mm:ss/km or mm:ss) to minutes as decimal
 */
function parsePaceToMinutes(paceStr: string | null): number | null {
  if (!paceStr) return null;
  const match = paceStr.match(/(\d+):(\d+)/);
  if (!match) return null;
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  return minutes + seconds / 60;
}

function buildPersonalBestsFromCache(cached: typeof userStats.$inferSelect) {
  const bests = [];

  // Note: For 1K and Mile, these are split-based records (fastest km/mile from any run),
  // not from runs that are exactly 1K or 1 mile in total distance
  const entries = [
    { label: '1K',           duration: cached.pb1kDurationMs,       runId: cached.pb1kRunId,       date: cached.pb1kDate,       distance: 1.0 },
    { label: 'Mile',         duration: cached.pbMileDurationMs,     runId: cached.pbMileRunId,     date: cached.pbMileDate,     distance: 1.609 },
    { label: '5K',           duration: cached.pb5kDurationMs,       runId: cached.pb5kRunId,       date: cached.pb5kDate,       distance: 5.0 },
    { label: '10K',          duration: cached.pb10kDurationMs,      runId: cached.pb10kRunId,      date: cached.pb10kDate,      distance: 10.0 },
    { label: '20K',          duration: (cached as any).pb20kDurationMs, runId: (cached as any).pb20kRunId, date: (cached as any).pb20kDate, distance: 20.0 },
    { label: 'Half Marathon', duration: cached.pbHalfDurationMs,    runId: cached.pbHalfRunId,     date: cached.pbHalfDate,     distance: 21.1 },
    { label: 'Marathon',     duration: cached.pbMarathonDurationMs, runId: cached.pbMarathonRunId, date: cached.pbMarathonDate, distance: 42.2 },
  ];

  for (const entry of entries) {
    if (entry.duration && entry.runId) {
      // Convert duration (ms) to pace (min/km)
      const durationMins = entry.duration / 1000 / 60;
      const paceMinPerKm = durationMins / entry.distance;
      bests.push({
        category: entry.label,
        pace: formatPace(paceMinPerKm),
        distance: entry.distance,
        duration: entry.duration,
        date: entry.date?.toISOString().split('T')[0] || '',
        runId: entry.runId,
      });
    }
  }

  return bests;
}

// ─── Period Statistics ────────────────────────────────────────────────────────

/**
 * Calculate aggregated statistics for a time period using SQL aggregation.
 * ⚡ Returns 1 row from the DB regardless of how many runs exist in the period.
 * Previous implementation fetched all matching rows and computed in JavaScript.
 */
export async function getPeriodStatistics(userId: string, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // ⚡ Single aggregation query — Postgres computes the totals, not Node.js
    const [stats] = await db.select({
      totalRuns:          count(),
      totalDistanceKm:    sum(runs.distance),
      totalDurationSec:   sum(runs.duration),
      totalElevationGain: sum(runs.elevationGain),
      totalCalories:      sum(runs.calories),
      avgHeartRate:       avg(runs.avgHeartRate),
      avgCadence:         avg(runs.cadence),
      longestRunKm:       max(runs.distance),
      // avgPace is stored as "M:SS" format (e.g. "5:22") — parse via SPLIT_PART
      avgPaceNumeric:     sql<number>`AVG(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
      fastestPaceNumeric: sql<number>`MIN(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
      slowestPaceNumeric: sql<number>`MAX(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
    }).from(runs).where(and(
      eq(runs.userId, userId),
      gte(runs.completedAt, startDate),
    ));

    const totalRuns = Number(stats.totalRuns ?? 0);
    if (totalRuns === 0) {
      return emptyPeriodStats();
    }

    const totalDurationSec = Number(stats.totalDurationSec ?? 0);
    const totalCalories = Number(stats.totalCalories ?? 0);
    const avgPace = Number(stats.avgPaceNumeric ?? 0);
    const fastestPace = Number(stats.fastestPaceNumeric ?? 0);
    const slowestPace = Number(stats.slowestPaceNumeric ?? 0);

    // Consistency score: runs logged vs expected (3/week)
    const expectedRuns = (days / 7) * 3;
    const consistencyScore = Math.min(100, Math.round((totalRuns / expectedRuns) * 100));

    return {
      totalRuns,
      totalDistance:       Math.round((Number(stats.totalDistanceKm ?? 0) / 1000) * 10) / 10,
      totalDuration:       totalDurationSec * 1000,  // ms for client compatibility
      totalElevationGain:  Math.round(Number(stats.totalElevationGain ?? 0)),
      averagePace:         formatPace(avgPace),
      averageHeartRate:    stats.avgHeartRate ? Math.round(Number(stats.avgHeartRate)) : 0,
      averageCadence:      stats.avgCadence ? Math.round(Number(stats.avgCadence)) : 0,
      averageRunDuration:  Math.round(totalDurationSec / totalRuns) * 1000,  // ms
      fastestRun:          fastestPace > 0 ? Math.round((1 / fastestPace) * 60 * 10) / 10 : 0,
      slowestRun:          slowestPace > 0 ? Math.round((1 / slowestPace) * 60 * 10) / 10 : 0,
      longestRun:          Math.round((Number(stats.longestRunKm ?? 0) / 1000) * 10) / 10,
      totalCalories,
      averageCalories:     Math.round(totalCalories / totalRuns),
      consistencyScore,
    };
  } catch (error) {
    console.error('Error calculating period statistics:', error);
    throw error;
  }
}

function emptyPeriodStats() {
  return {
    totalRuns: 0, totalDistance: 0, totalDuration: 0, totalElevationGain: 0,
    averagePace: '--', averageHeartRate: 0, averageCadence: 0,
    averageRunDuration: 0, fastestRun: 0, slowestRun: 0,
    longestRun: 0, totalCalories: 0, averageCalories: 0, consistencyScore: 0,
  };
}

// ─── Detailed Trends ─────────────────────────────────────────────────────────

/**
 * Get run-by-run trend data for charts.
 * ⚡ Selects only the 5 columns needed — avoids loading gpsTrack, heartRateData,
 *    paceData and other large JSON blobs which can be 10-100KB per run.
 */
export async function getDetailedTrends(userId: string, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // ⚡ Only fetch the 5 columns needed for charts — not SELECT *
    const userRuns = await db
      .select({
        completedAt:   runs.completedAt,
        avgPace:       runs.avgPace,
        avgHeartRate:  runs.avgHeartRate,
        elevationGain: runs.elevationGain,
        cadence:       runs.cadence,
      })
      .from(runs)
      .where(and(eq(runs.userId, userId), gte(runs.completedAt, startDate)))
      .orderBy(asc(runs.completedAt));

    if (userRuns.length === 0) {
      return { paceTrend: [], hrTrend: [], elevationTrend: [], cadenceTrend: [] };
    }

    const paceTrend = userRuns
      .map(r => ({
        date: r.completedAt?.toISOString().split('T')[0] || '',
        value: r.avgPace ? parseFloat(r.avgPace) : null,
      }))
      .filter((d): d is { date: string; value: number } => d.value !== null && d.value > 0);

    const hrTrend = userRuns
      .map(r => ({ date: r.completedAt?.toISOString().split('T')[0] || '', value: r.avgHeartRate ?? null }))
      .filter((d): d is { date: string; value: number } => d.value !== null);

    const elevationTrend = userRuns
      .map(r => ({ date: r.completedAt?.toISOString().split('T')[0] || '', value: r.elevationGain ?? null }))
      .filter((d): d is { date: string; value: number } => d.value !== null);

    const cadenceTrend = userRuns
      .map(r => ({ date: r.completedAt?.toISOString().split('T')[0] || '', value: r.cadence ?? null }))
      .filter((d): d is { date: string; value: number } => d.value !== null);

    return { paceTrend, hrTrend, elevationTrend, cadenceTrend };
  } catch (error) {
    console.error('Error getting detailed trends:', error);
    return { paceTrend: [], hrTrend: [], elevationTrend: [], cadenceTrend: [] };
  }
}

// ─── All-Time Stats ───────────────────────────────────────────────────────────

/**
 * Get all-time stats from the user_stats cache table.
 * ⚡ O(1) PK lookup regardless of run count.
 * Falls back to live SQL aggregation if cache isn't populated yet.
 */
export async function getAllTimeStats(userId: string) {
  try {
    const [cached] = await db.select().from(userStats).where(eq(userStats.userId, userId));
    if (cached) {
      // Note: cached fields are already in km (totalDistanceKm, longestRunKm)
      return {
        totalRuns:             cached.totalRuns ?? 0,
        totalDistanceKm:       Math.round((cached.totalDistanceKm ?? 0) * 10) / 10,
        totalHours:            Math.round(((cached.totalDurationSeconds ?? 0) / 3600) * 10) / 10,
        totalCalories:         cached.totalCalories ?? 0,
        mostConsecutiveRuns:   cached.mostConsecutiveRuns ?? 0,
        longestRunKm:          Math.round((cached.longestRunKm ?? 0) * 10) / 10,
        longestRunTimeSec:     cached.longestRunTimeSec ?? 0,
        highestElevationM:     Math.round(cached.highestElevationM ?? 0),
        goalsAchieved:         cached.goalsAchieved ?? 0,
      };
    }
  } catch (err) {
    console.warn('[MyData] user_stats cache miss for all-time stats, falling back to live query');
  }

  // Fallback: live SQL aggregation (users without cache yet)
  return getAllTimeStatsLive(userId);
}

/**
 * Live SQL aggregation fallback — still 1 DB query, 1 row.
 * Much better than the old approach of fetching all runs then reducing in JS.
 */
async function getAllTimeStatsLive(userId: string) {
  try {
    // Get basic aggregates
    const [stats] = await db.select({
      totalRuns:            count(),
      totalDistanceKm:      sum(runs.distance),
      totalDurationSec:     sum(runs.duration),
      totalElevationGain:   sum(runs.elevationGain),
      totalCalories:        sum(runs.calories),
      totalActiveCalories:  sum(runs.activeCalories),
      longestRunKm:         max(runs.distance),
      maxElevation:         max(runs.maxElevation),
      fastestPaceNumeric: sql<number>`MIN(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
      avgPaceNumeric:     sql<number>`AVG(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
    }).from(runs).where(eq(runs.userId, userId));

    const totalRuns = Number(stats.totalRuns ?? 0);
    if (totalRuns === 0) {
      return {
        totalRuns: 0, totalDistanceKm: 0, totalHours: 0, totalCalories: 0,
        mostConsecutiveRuns: 0, longestRunKm: 0, longestRunTimeSec: 0,
        highestElevationM: 0, goalsAchieved: 0,
      };
    }

    // Get longest run time and details
    const longestRun = await db
      .select({ duration: runs.duration })
      .from(runs)
      .where(eq(runs.userId, userId))
      .orderBy(desc(runs.distance))
      .limit(1);

    // duration is stored in SECONDS — do NOT divide by 1000
    const longestRunTimeSec = longestRun.length > 0
      ? Math.round(longestRun[0].duration || 0)
      : 0;

    // Highest elevation: prefer maxElevation if populated, fall back to max elevationGain
    // (most Android runs have elevationGain but not maxElevation)
    const highestElevationM = Math.round(
      Number(stats.maxElevation ?? 0) || Number(stats.totalElevationGain ?? 0)
    );

    // Count completed goals
    const [completedGoalsResult] = await db
      .select({ count: count() })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, "completed")));
    
    const goalsAchieved = Number(completedGoalsResult?.count ?? 0);

    return {
      totalRuns,
      totalDistanceKm:     Math.round((Number(stats.totalDistanceKm ?? 0) / 1000) * 10) / 10,
      totalHours:          Math.round((Number(stats.totalDurationSec ?? 0) / 3600) * 10) / 10,
      totalCalories:       Number(stats.totalCalories ?? 0),
      mostConsecutiveRuns: 0,  // To be calculated by stats service
      longestRunKm:        Math.round((Number(stats.longestRunKm ?? 0) / 1000) * 10) / 10,
      longestRunTimeSec,
      highestElevationM,
      goalsAchieved,
    };
  } catch (error) {
    console.error('Error getting all-time stats (live):', error);
    throw error;
  }
}

function countPersonalRecordsInCache(cached: typeof userStats.$inferSelect): number {
  let count = 0;
  if (cached.pb1kDurationMs) count++;
  if (cached.pbMileDurationMs) count++;
  if (cached.pb5kDurationMs) count++;
  if (cached.pb10kDurationMs) count++;
  if ((cached as any).pb20kDurationMs) count++;
  if (cached.pbHalfDurationMs) count++;
  if (cached.pbMarathonDurationMs) count++;
  return count;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPace(minPerKm: number): string {
  if (!minPerKm || minPerKm <= 0) return '--';
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

export default { getPersonalBests, getPeriodStatistics, getDetailedTrends, getAllTimeStats };
