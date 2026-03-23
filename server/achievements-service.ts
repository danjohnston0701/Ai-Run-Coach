/**
 * Run Achievement Service
 * 
 * Calculates and awards personal bests and milestone achievements
 * when users complete runs
 */

import { db } from './db';
import { runs } from '@shared/schema';
import { eq, and, lt, gte } from 'drizzle-orm';

export enum AchievementType {
  PERSONAL_BEST_1K = 'PERSONAL_BEST_1K',
  PERSONAL_BEST_1_MILE = 'PERSONAL_BEST_1_MILE',
  PERSONAL_BEST_5K = 'PERSONAL_BEST_5K',
  PERSONAL_BEST_10K = 'PERSONAL_BEST_10K',
  PERSONAL_BEST_HALF_MARATHON = 'PERSONAL_BEST_HALF_MARATHON',
  PERSONAL_BEST_MARATHON = 'PERSONAL_BEST_MARATHON',
  FASTEST_KM = 'FASTEST_KM',
  FASTEST_MILE = 'FASTEST_MILE',
}

interface AchievementConfig {
  type: AchievementType;
  distanceKm: number;
  toleranceUnderMeters: number;
  toleranceOverMeters: number;
  title: string;
  description: string;
  icon: string;
  backgroundColor: string;
  category: string;
}

interface RunAchievement {
  type: AchievementType;
  title: string;
  description: string;
  icon: string;
  backgroundColor: string;
  category: string;
  previousBestPaceMinPerKm?: number;
  improvementPercent?: number;
}

const ACHIEVEMENT_CONFIGS: AchievementConfig[] = [
  {
    type: AchievementType.PERSONAL_BEST_1K,
    distanceKm: 1.0,
    toleranceUnderMeters: 50.0,
    toleranceOverMeters: 100.0,
    title: 'Personal Best 1K',
    description: 'New personal record for 1K',
    icon: '🏃',
    backgroundColor: '#FF6B6B',
    category: '1K',
  },
  {
    type: AchievementType.FASTEST_KM,
    distanceKm: 1.0,
    toleranceUnderMeters: 0.0,
    toleranceOverMeters: 0.0,
    title: 'Fastest Km',
    description: 'Fastest single kilometer ever recorded',
    icon: '⚡',
    backgroundColor: '#FF6B6B',
    category: '1K',
  },
  {
    type: AchievementType.PERSONAL_BEST_1_MILE,
    distanceKm: 1.60934,
    toleranceUnderMeters: 50.0,
    toleranceOverMeters: 100.0,
    title: 'Personal Best 1 Mile',
    description: 'New personal record for 1 mile',
    icon: '🏃',
    backgroundColor: '#FF8B3D',
    category: '1 Mile',
  },
  {
    type: AchievementType.FASTEST_MILE,
    distanceKm: 1.60934,
    toleranceUnderMeters: 0.0,
    toleranceOverMeters: 0.0,
    title: 'Fastest Mile',
    description: 'Fastest single mile ever recorded',
    icon: '⚡',
    backgroundColor: '#FF8B3D',
    category: '1 Mile',
  },
  {
    type: AchievementType.PERSONAL_BEST_5K,
    distanceKm: 5.0,
    toleranceUnderMeters: 50.0,
    toleranceOverMeters: 100.0,
    title: 'Personal Best 5K',
    description: 'New personal record for 5K',
    icon: '🏆',
    backgroundColor: '#FFD93D',
    category: '5K',
  },
  {
    type: AchievementType.PERSONAL_BEST_10K,
    distanceKm: 10.0,
    toleranceUnderMeters: 50.0,
    toleranceOverMeters: 100.0,
    title: 'Personal Best 10K',
    description: 'New personal record for 10K',
    icon: '🥇',
    backgroundColor: '#6BCB77',
    category: '10K',
  },
  {
    type: AchievementType.PERSONAL_BEST_HALF_MARATHON,
    distanceKm: 21.1,
    toleranceUnderMeters: 50.0,
    toleranceOverMeters: 100.0,
    title: 'Personal Best Half Marathon',
    description: 'New personal record for Half Marathon',
    icon: '🎖️',
    backgroundColor: '#4D96FF',
    category: 'Half Marathon',
  },
  {
    type: AchievementType.PERSONAL_BEST_MARATHON,
    distanceKm: 42.2,
    toleranceUnderMeters: 50.0,
    toleranceOverMeters: 100.0,
    title: 'Personal Best Marathon',
    description: 'New personal record for Marathon',
    icon: '👑',
    backgroundColor: '#9D4EDD',
    category: 'Marathon',
  },
];

/**
 * Parse pace string (mm:ss/km) to minutes as decimal
 */
function parsePaceToMinutes(paceStr: string | null): number | null {
  if (!paceStr) return null;
  const match = paceStr.match(/(\d+):(\d+)/);
  if (!match) return null;
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  return minutes + seconds / 60;
}

/**
 * Check if distance is within tolerance of target distance
 */
function isWithinRange(actualKm: number, config: AchievementConfig): boolean {
  const actualMeters = actualKm * 1000;
  const targetMeters = config.distanceKm * 1000;
  const lower = targetMeters - config.toleranceUnderMeters;
  const upper = targetMeters + config.toleranceOverMeters;
  return actualMeters >= lower && actualMeters <= upper;
}

/**
 * Parse km split data to find fastest single km or mile
 */
function findFastestSegment(kmSplits: any[], segmentKm: number): number | null {
  if (!kmSplits || kmSplits.length === 0) return null;
  
  let fastestPaceMinutes: number | null = null;
  
  for (const split of kmSplits) {
    if (!split.pace) continue;
    const paceMinutes = parsePaceToMinutes(split.pace);
    if (paceMinutes === null) continue;
    
    if (fastestPaceMinutes === null || paceMinutes < fastestPaceMinutes) {
      fastestPaceMinutes = paceMinutes;
    }
  }
  
  return fastestPaceMinutes;
}

/**
 * Calculate achievements for a completed run
 * Returns list of newly earned achievements
 */
export async function calculateRunAchievements(
  userId: string,
  runId: string,
  distance: number, // in km
  avgPace: string | null,
  kmSplits: any = null
): Promise<RunAchievement[]> {
  const achievements: RunAchievement[] = [];
  
  try {
    const distanceKm = distance; // distance is already in km (matches runs.distance schema)
    const currentPaceMinutes = parsePaceToMinutes(avgPace);
    
    if (!currentPaceMinutes) {
      console.log(`[achievements] No valid pace data for run ${runId}`);
      return achievements;
    }

    // Get all previous runs for this user
    const userRuns = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          lt(runs.completedAt, new Date()) // Exclude current run
        )
      );

    // Check each distance category
    const pbConfigs = ACHIEVEMENT_CONFIGS.filter(c => 
      c.type !== AchievementType.FASTEST_KM && c.type !== AchievementType.FASTEST_MILE
    );

    for (const config of pbConfigs) {
      if (!isWithinRange(distanceKm, config)) {
        continue; // This run doesn't match this distance category
      }

      // Find previous best for this distance
      let previousBestMinutes: number | null = null;
      for (const prevRun of userRuns) {
        if (!isWithinRange(prevRun.distance || 0, config)) continue;
        
        const prevPaceMinutes = parsePaceToMinutes(prevRun.avgPace);
        if (prevPaceMinutes === null) continue;
        
        if (previousBestMinutes === null || prevPaceMinutes < previousBestMinutes) {
          previousBestMinutes = prevPaceMinutes;
        }
      }

      // If no previous best or current is faster, it's a new PB
      if (previousBestMinutes === null || currentPaceMinutes < previousBestMinutes) {
        const improvementPercent = previousBestMinutes
          ? ((previousBestMinutes - currentPaceMinutes) / previousBestMinutes) * 100
          : undefined;

        achievements.push({
          type: config.type,
          title: config.title,
          description: config.description,
          icon: config.icon,
          backgroundColor: config.backgroundColor,
          category: config.category,
          previousBestPaceMinPerKm: previousBestMinutes,
          improvementPercent,
        });
      }
    }

    // Rule: A user cannot get both 5K and 10K PB in the same run
    // Remove 10K PB if 5K PB is present
    if (achievements.some(a => a.type === AchievementType.PERSONAL_BEST_5K)) {
      const index = achievements.findIndex(a => a.type === AchievementType.PERSONAL_BEST_10K);
      if (index !== -1) {
        achievements.splice(index, 1);
      }
    }

    // Check for fastest single km
    const fastestKmPace = findFastestSegment(kmSplits, 1.0);
    if (fastestKmPace) {
      // Check if this is faster than any previous fastest km
      let previousFastestKmPace: number | null = null;
      for (const prevRun of userRuns) {
        if (!prevRun.kmSplits) continue;
        const prevFastestKm = findFastestSegment(prevRun.kmSplits, 1.0);
        if (prevFastestKm && (previousFastestKmPace === null || prevFastestKm < previousFastestKmPace)) {
          previousFastestKmPace = prevFastestKm;
        }
      }

      if (previousFastestKmPace === null || fastestKmPace < previousFastestKmPace) {
        achievements.push({
          type: AchievementType.FASTEST_KM,
          title: 'Fastest Km',
          description: 'Fastest single kilometer ever recorded',
          icon: '⚡',
          backgroundColor: '#FF6B6B',
          category: '1K',
          previousBestPaceMinPerKm: previousFastestKmPace,
          improvementPercent: previousFastestKmPace
            ? ((previousFastestKmPace - fastestKmPace) / previousFastestKmPace) * 100
            : undefined,
        });
      }
    }

    // Check for fastest single mile
    const fastestMilePace = findFastestSegment(kmSplits, 1.60934);
    if (fastestMilePace) {
      let previousFastestMilePace: number | null = null;
      for (const prevRun of userRuns) {
        if (!prevRun.kmSplits) continue;
        const prevFastestMile = findFastestSegment(prevRun.kmSplits, 1.60934);
        if (prevFastestMile && (previousFastestMilePace === null || prevFastestMile < previousFastestMilePace)) {
          previousFastestMilePace = prevFastestMile;
        }
      }

      if (previousFastestMilePace === null || fastestMilePace < previousFastestMilePace) {
        achievements.push({
          type: AchievementType.FASTEST_MILE,
          title: 'Fastest Mile',
          description: 'Fastest single mile ever recorded',
          icon: '⚡',
          backgroundColor: '#FF8B3D',
          category: '1 Mile',
          previousBestPaceMinPerKm: previousFastestMilePace,
          improvementPercent: previousFastestMilePace
            ? ((previousFastestMilePace - fastestMilePace) / previousFastestMilePace) * 100
            : undefined,
        });
      }
    }

    console.log(`[achievements] Calculated ${achievements.length} achievements for run ${runId}`);
    return achievements;
  } catch (error) {
    console.error('[achievements] Error calculating achievements:', error);
    return achievements;
  }
}

/**
 * Check achievements after a run is completed
 * Fetches run data from DB and calculates any new achievements
 */
export async function checkAchievementsAfterRun(
  runId: string,
  userId: string
): Promise<RunAchievement[]> {
  try {
    const runRows = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
      .limit(1);

    if (runRows.length === 0) {
      console.log(`[achievements] Run ${runId} not found for user ${userId}`);
      return [];
    }

    const run = runRows[0];
    return calculateRunAchievements(
      userId,
      runId,
      run.distance || 0,
      run.avgPace,
      run.kmSplits
    );
  } catch (error) {
    console.error('[achievements] Error in checkAchievementsAfterRun:', error);
    return [];
  }
}

/**
 * Get achievements summary for a user
 */
export async function getUserAchievements(userId: string): Promise<{
  personalBests: Record<string, { pace: string | null; date: string | null }>;
  totalPBs: number;
}> {
  try {
    const userRuns = await db
      .select()
      .from(runs)
      .where(eq(runs.userId, userId));

    const personalBests: Record<string, { pace: string | null; date: string | null }> = {};

    for (const config of ACHIEVEMENT_CONFIGS) {
      if (config.type === AchievementType.FASTEST_KM || config.type === AchievementType.FASTEST_MILE) {
        continue;
      }

      let bestPace: string | null = null;
      let bestDate: string | null = null;
      let bestPaceMinutes: number | null = null;

      for (const run of userRuns) {
        if (!isWithinRange(run.distance || 0, config)) continue;
        const paceMinutes = parsePaceToMinutes(run.avgPace);
        if (paceMinutes === null) continue;
        if (bestPaceMinutes === null || paceMinutes < bestPaceMinutes) {
          bestPaceMinutes = paceMinutes;
          bestPace = run.avgPace;
          bestDate = run.completedAt ? run.completedAt.toISOString() : null;
        }
      }

      personalBests[config.type] = { pace: bestPace, date: bestDate };
    }

    const totalPBs = Object.values(personalBests).filter(pb => pb.pace !== null).length;

    return { personalBests, totalPBs };
  } catch (error) {
    console.error('[achievements] Error in getUserAchievements:', error);
    return { personalBests: {}, totalPBs: 0 };
  }
}

/**
 * Initialize achievements system (no-op for computed achievements)
 */
export async function initializeAchievements(): Promise<void> {
  console.log('[achievements] Achievements system initialized (computed on-the-fly, no DB setup required)');
}

export default {
  calculateRunAchievements,
  checkAchievementsAfterRun,
  getUserAchievements,
  initializeAchievements,
};
