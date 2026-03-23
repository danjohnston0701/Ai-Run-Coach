/**
 * My Data Service
 * 
 * Provides analytics, performance insights, and trend analysis
 * across user's running history
 */

import { db } from './db';
import { runs } from '@shared/schema';
import { eq, gte, lte, and, desc, asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Calculate personal bests for common distances
 */
export async function getPersonalBests(userId: string) {
  // 50m under, 100m over tolerance — matches achievements-service.ts
  const distances = [
    { min: 0.95, max: 1.1, label: '1K', target: 1.0 },
    { min: 4.95, max: 5.1, label: '5K', target: 5.0 },
    { min: 9.95, max: 10.1, label: '10K', target: 10.0 },
    { min: 21.05, max: 21.2, label: 'Half Marathon', target: 21.1 },
    { min: 42.15, max: 42.3, label: 'Marathon', target: 42.2 },
  ];

  const personalBests = [];

  for (const dist of distances) {
    try {
      // Find the fastest run closest to this distance
      const result = await db
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.userId, userId),
            gte(runs.distance, dist.min),
            lte(runs.distance, dist.max),
            sql`${runs.avgPace} IS NOT NULL`
          )
        )
        .orderBy(runs.avgPace)
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

/**
 * Calculate aggregated statistics for a time period
 */
export async function getPeriodStatistics(userId: string, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const userRuns = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          gte(runs.completedAt, startDate)
        )
      );

    if (userRuns.length === 0) {
      return {
        totalRuns: 0,
        totalDistance: 0,
        totalDuration: 0,
        totalElevationGain: 0,
        averagePace: '--',
        averageHeartRate: 0,
        averageCadence: 0,
        averageRunDuration: 0,
        fastestRun: 0,
        slowestRun: 0,
        longestRun: 0,
        totalCalories: 0,
        averageCalories: 0,
        consistencyScore: 0,
      };
    }

    // Calculate metrics
    const totalDistance = userRuns.reduce((sum, r) => sum + (r.distance || 0), 0);
    const totalDuration = userRuns.reduce((sum, r) => sum + (r.duration || 0), 0);
    const totalElevationGain = userRuns.reduce((sum, r) => sum + (r.elevationGain || 0), 0);
    const totalCalories = userRuns.reduce((sum, r) => sum + (r.calories || 0), 0);

    // Filter runs with pace data
    const runsWithPace = userRuns.filter(r => r.avgPace);
    const avgPace = runsWithPace.length > 0
      ? runsWithPace.reduce((sum, r) => sum + parseFloat(r.avgPace || '0'), 0) / runsWithPace.length
      : 0;

    // Filter runs with HR data
    const runsWithHR = userRuns.filter(r => r.avgHeartRate);
    const avgHeartRate = runsWithHR.length > 0
      ? Math.round(runsWithHR.reduce((sum, r) => sum + (r.avgHeartRate || 0), 0) / runsWithHR.length)
      : 0;

    // Filter runs with cadence data
    const runsWithCadence = userRuns.filter(r => r.cadence);
    const avgCadence = runsWithCadence.length > 0
      ? Math.round(runsWithCadence.reduce((sum, r) => sum + (r.cadence || 0), 0) / runsWithCadence.length)
      : 0;

    // Find extremes
    const paces = runsWithPace.map(r => parseFloat(r.avgPace || '0'));
    const fastestPace = paces.length > 0 ? Math.min(...paces) : 0;
    const slowestPace = paces.length > 0 ? Math.max(...paces) : 0;
    const longestRun = Math.max(...userRuns.map(r => r.distance || 0));

    // Calculate consistency score (0-100)
    // Based on run frequency relative to expected frequency
    const daysInPeriod = days;
    const expectedRunsPerWeek = 3; // Assume 3 runs per week is "consistent"
    const expectedRuns = (daysInPeriod / 7) * expectedRunsPerWeek;
    const consistencyScore = Math.min(100, Math.round((userRuns.length / expectedRuns) * 100));

    return {
      totalRuns: userRuns.length,
      totalDistance,
      totalDuration,
      totalElevationGain,
      averagePace: formatPace(avgPace),
      averageHeartRate: avgHeartRate,
      averageCadence: avgCadence,
      averageRunDuration: Math.round(totalDuration / userRuns.length),
      fastestRun: fastestPace > 0 ? (1000 / fastestPace / 60) : 0, // Convert to distance
      slowestRun: slowestPace > 0 ? (1000 / slowestPace / 60) : 0, // Convert to distance
      longestRun,
      totalCalories,
      averageCalories: Math.round(totalCalories / userRuns.length),
      consistencyScore,
    };
  } catch (error) {
    console.error('Error calculating period statistics:', error);
    throw error;
  }
}

/**
 * Get detailed run-by-run trend data for a specific time period
 * Returns pace, HR, elevation, and cadence for each run
 */
export async function getDetailedTrends(userId: string, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const userRuns = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          gte(runs.completedAt, startDate)
        )
      )
      .orderBy(asc(runs.completedAt));

    if (userRuns.length === 0) {
      return {
        paceTrend: [],
        hrTrend: [],
        elevationTrend: [],
        cadenceTrend: [],
      };
    }

    const paceTrend = userRuns
      .map(r => ({
        date: r.completedAt?.toISOString().split('T')[0] || '',
        value: r.avgPace ? parseFloat(r.avgPace.split(':')[0]) : null,
      }))
      .filter((d): d is { date: string; value: number } => d.value !== null);

    const hrTrend = userRuns
      .map(r => ({
        date: r.completedAt?.toISOString().split('T')[0] || '',
        value: r.avgHeartRate || null,
      }))
      .filter((d): d is { date: string; value: number } => d.value !== null);

    const elevationTrend = userRuns
      .map(r => ({
        date: r.completedAt?.toISOString().split('T')[0] || '',
        value: r.elevationGain || null,
      }))
      .filter((d): d is { date: string; value: number } => d.value !== null);

    const cadenceTrend = userRuns
      .map(r => ({
        date: r.completedAt?.toISOString().split('T')[0] || '',
        value: r.cadence || null,
      }))
      .filter((d): d is { date: string; value: number } => d.value !== null);

    return {
      paceTrend,
      hrTrend,
      elevationTrend,
      cadenceTrend,
    };
  } catch (error) {
    console.error('Error getting detailed trends:', error);
    return {
      paceTrend: [],
      hrTrend: [],
      elevationTrend: [],
      cadenceTrend: [],
    };
  }
}

/**
 * Get all-time achievements and statistics
 */
export async function getAllTimeStats(userId: string) {
  try {
    const allRuns = await db
      .select()
      .from(runs)
      .where(eq(runs.userId, userId));

    if (allRuns.length === 0) {
      return {
        totalRuns: 0,
        totalDistanceKm: 0,
        totalHours: 0,
        totalCalories: 0,
        totalElevationGainM: 0,
        personalRecords: 0,
        longestRunKm: 0,
        fastestPaceMinPerKm: '--',
        averagePaceMinPerKm: '--',
        totalActiveCalories: 0,
      };
    }

    const totalDistance = allRuns.reduce((sum, r) => sum + (r.distance || 0), 0);
    const totalDuration = allRuns.reduce((sum, r) => sum + (r.duration || 0), 0);
    const totalElevationGain = allRuns.reduce((sum, r) => sum + (r.elevationGain || 0), 0);
    const totalCalories = allRuns.reduce((sum, r) => sum + (r.calories || 0), 0);
    const totalActiveCalories = allRuns.reduce((sum, r) => sum + (r.activeCalories || 0), 0);

    // Find fastest pace
    const runsWithPace = allRuns.filter(r => r.avgPace);
    const fastestPace = runsWithPace.length > 0
      ? Math.min(...runsWithPace.map(r => parseFloat(r.avgPace || '0')))
      : 0;
    
    const avgPace = runsWithPace.length > 0
      ? runsWithPace.reduce((sum, r) => sum + parseFloat(r.avgPace || '0'), 0) / runsWithPace.length
      : 0;

    return {
      totalRuns: allRuns.length,
      totalDistanceKm: Math.round(totalDistance * 10) / 10,
      totalHours: Math.round((totalDuration / 1000 / 3600) * 10) / 10,
      totalCalories: totalCalories,
      totalElevationGainM: Math.round(totalElevationGain),
      personalRecords: 6, // Number of distance categories with PRs
      longestRunKm: Math.max(...allRuns.map(r => r.distance || 0)),
      fastestPaceMinPerKm: formatPace(fastestPace),
      averagePaceMinPerKm: formatPace(avgPace),
      totalActiveCalories: totalActiveCalories,
    };
  } catch (error) {
    console.error('Error getting all-time stats:', error);
    throw error;
  }
}

/**
 * Helper: Format pace from min/km to string
 */
function formatPace(minPerKm: number): string {
  if (minPerKm <= 0) return '--';
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

export default {
  getPersonalBests,
  getPeriodStatistics,
  getDetailedTrends,
  getAllTimeStats,
};
