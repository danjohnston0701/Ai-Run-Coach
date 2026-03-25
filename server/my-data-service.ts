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
import { runs, userStats } from '@shared/schema';
import { eq, gte, and, desc, asc, count, sum, avg, max, min, sql, isNotNull } from 'drizzle-orm';

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
 * Live PB query — 5 targeted DB calls, each returns 1 row.
 * Used as fallback when cache isn't populated yet.
 */
async function getPersonalBestsLive(userId: string) {
  const distances = [
    { min: 0.95, max: 1.1,   label: '1K',           target: 1.0 },
    { min: 4.95, max: 5.1,   label: '5K',           target: 5.0 },
    { min: 9.95, max: 10.1,  label: '10K',          target: 10.0 },
    { min: 21.05, max: 21.2, label: 'Half Marathon', target: 21.1 },
    { min: 42.15, max: 42.3, label: 'Marathon',      target: 42.2 },
  ];

  const personalBests = [];

  for (const dist of distances) {
    try {
      const result = await db
        .select({
          id: runs.id,
          avgPace: runs.avgPace,
          distance: runs.distance,
          duration: runs.duration,
          completedAt: runs.completedAt,
        })
        .from(runs)
        .where(and(
          eq(runs.userId, userId),
          gte(runs.distance, dist.min),
          sql`${runs.distance} <= ${dist.max}`,
          isNotNull(runs.avgPace),
        ))
        .orderBy(runs.avgPace)  // Ascending: fastest pace first (lower = faster)
        .limit(1);

      if (result.length > 0) {
        const run = result[0];
        const pace = parseFloat(run.avgPace || '0');
        personalBests.push({
          category: dist.label,
          pace: formatPace(pace),
          distance: run.distance,
          duration: run.duration,
          date: run.completedAt?.toISOString().split('T')[0] || '',
          runId: run.id,
        });
      }
    } catch (error) {
      console.error(`Error getting personal best for ${dist.label}:`, error);
    }
  }

  return personalBests;
}

function buildPersonalBestsFromCache(cached: typeof userStats.$inferSelect) {
  const bests = [];

  const entries = [
    { label: '1K',           duration: cached.pb1kDurationMs,       runId: cached.pb1kRunId,       date: cached.pb1kDate,       distance: 1.0 },
    { label: '5K',           duration: cached.pb5kDurationMs,       runId: cached.pb5kRunId,       date: cached.pb5kDate,       distance: 5.0 },
    { label: '10K',          duration: cached.pb10kDurationMs,      runId: cached.pb10kRunId,      date: cached.pb10kDate,      distance: 10.0 },
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
      totalDistance:       Math.round(Number(stats.totalDistanceKm ?? 0) * 10) / 10,
      totalDuration:       totalDurationSec * 1000,  // ms for client compatibility
      totalElevationGain:  Math.round(Number(stats.totalElevationGain ?? 0)),
      averagePace:         formatPace(avgPace),
      averageHeartRate:    stats.avgHeartRate ? Math.round(Number(stats.avgHeartRate)) : 0,
      averageCadence:      stats.avgCadence ? Math.round(Number(stats.avgCadence)) : 0,
      averageRunDuration:  Math.round(totalDurationSec / totalRuns) * 1000,  // ms
      fastestRun:          fastestPace > 0 ? Math.round((1 / fastestPace) * 60 * 10) / 10 : 0,
      slowestRun:          slowestPace > 0 ? Math.round((1 / slowestPace) * 60 * 10) / 10 : 0,
      longestRun:          Math.round(Number(stats.longestRunKm ?? 0) * 10) / 10,
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
      return {
        totalRuns:             cached.totalRuns ?? 0,
        totalDistanceKm:       Math.round((cached.totalDistanceKm ?? 0) * 10) / 10,
        totalHours:            Math.round(((cached.totalDurationSeconds ?? 0) / 3600) * 10) / 10,
        totalCalories:         cached.totalCalories ?? 0,
        totalElevationGainM:   Math.round(cached.totalElevationGainM ?? 0),
        personalRecords:       countPersonalRecordsInCache(cached),
        longestRunKm:          Math.round((cached.longestRunKm ?? 0) * 10) / 10,
        fastestPaceMinPerKm:   formatPace(cached.fastestPaceMinPerKm ?? 0),
        averagePaceMinPerKm:   formatPace(cached.avgPaceMinPerKm ?? 0),
        totalActiveCalories:   cached.totalActiveCalories ?? 0,
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
    const [stats] = await db.select({
      totalRuns:            count(),
      totalDistanceKm:      sum(runs.distance),
      totalDurationSec:     sum(runs.duration),
      totalElevationGain:   sum(runs.elevationGain),
      totalCalories:        sum(runs.calories),
      totalActiveCalories:  sum(runs.activeCalories),
      longestRunKm:         max(runs.distance),
      fastestPaceNumeric: sql<number>`MIN(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
      avgPaceNumeric:     sql<number>`AVG(CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN NULL ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END)`,
    }).from(runs).where(eq(runs.userId, userId));

    const totalRuns = Number(stats.totalRuns ?? 0);
    if (totalRuns === 0) {
      return {
        totalRuns: 0, totalDistanceKm: 0, totalHours: 0, totalCalories: 0,
        totalElevationGainM: 0, personalRecords: 0, longestRunKm: 0,
        fastestPaceMinPerKm: '--', averagePaceMinPerKm: '--', totalActiveCalories: 0,
      };
    }

    return {
      totalRuns,
      totalDistanceKm:     Math.round(Number(stats.totalDistanceKm ?? 0) * 10) / 10,
      totalHours:          Math.round((Number(stats.totalDurationSec ?? 0) / 3600) * 10) / 10,
      totalCalories:       Number(stats.totalCalories ?? 0),
      totalElevationGainM: Math.round(Number(stats.totalElevationGain ?? 0)),
      personalRecords:     5,  // Number of distance categories (filled in once cache is built)
      longestRunKm:        Math.round(Number(stats.longestRunKm ?? 0) * 10) / 10,
      fastestPaceMinPerKm: formatPace(Number(stats.fastestPaceNumeric ?? 0)),
      averagePaceMinPerKm: formatPace(Number(stats.avgPaceNumeric ?? 0)),
      totalActiveCalories: Number(stats.totalActiveCalories ?? 0),
    };
  } catch (error) {
    console.error('Error getting all-time stats (live):', error);
    throw error;
  }
}

function countPersonalRecordsInCache(cached: typeof userStats.$inferSelect): number {
  let count = 0;
  if (cached.pb1kDurationMs) count++;
  if (cached.pb5kDurationMs) count++;
  if (cached.pb10kDurationMs) count++;
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
