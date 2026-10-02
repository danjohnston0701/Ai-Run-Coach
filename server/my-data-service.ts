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
import { NON_PLAN_WORKOUT_TYPES } from "./utils/run-derivation";
import { MEANINGFUL_RUN_SQL } from "./utils/run-units";
import { runs, userStats, goals } from '@shared/schema';
import { eq, gte, and, desc, asc, count, sum, avg, max, min, sql, isNotNull, isNull, or, lt, inArray } from 'drizzle-orm';
import { type InferSelectModel } from 'drizzle-orm';

// ─── Personal Bests ──────────────────────────────────────────────────────────

// Distance bands for PB categories that must come from a dedicated run of
// (approximately) that distance — never inferred from a km split.
const DISTANCE_PB_BANDS: Record<string, { min: number; max: number; target: number }> = {
  '5K':            { min: 4.9,  max: 5.3,  target: 5.0  },
  '10K':           { min: 9.8,  max: 10.3, target: 10.0 },
  '20K':           { min: 19.8, max: 20.3, target: 20.0 },
  'Half Marathon': { min: 21.0, max: 21.6, target: 21.1 },
  'Marathon':      { min: 42.0, max: 42.6, target: 42.2 },
};

/**
 * Get personal bests from the user_stats cache table.
 * Falls back to live DB query if cache not yet populated.
 */
export async function getPersonalBests(userId: string, excludeCoachingPlan: boolean = false) {
  // The user_stats cache aggregates ALL runs (coaching-plan and free alike) — it has no
  // excludeCoachingPlan-filtered variant, so that mode always falls through to a live query.
  if (excludeCoachingPlan) {
    return getPersonalBestsLive(userId, true);
  }

  try {
    // Attempt cache read first (O(1) PK lookup)
    const [cached] = await db.select().from(userStats).where(eq(userStats.userId, userId));

    if (cached && (cached.totalRuns ?? 0) > 0) {
      const fromCache = buildPersonalBestsFromCache(cached);

      // Self-heal: verify EVERY cached PB's run actually exists, and for
      // distance-based categories (5K/10K/20K/Half/Marathon) that the run's
      // logged distance genuinely falls within that category's band.
      // Checking only the first entry let stale rows through: the old
      // recomputeForUser() extrapolated 5K–Marathon PBs from a single fast
      // 1km split, so those entries pointed at a real run (the split's run)
      // that was never actually run at that distance.
      if (fromCache.length > 0) {
        const runIds = Array.from(new Set(fromCache.filter(pb => pb.runId).map(pb => pb.runId as string)));
        const cachedRuns = runIds.length > 0
          ? await db.select({ id: runs.id, distance: runs.distance })
              .from(runs)
              .where(and(and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL), inArray(runs.id, runIds)))
          : [];
        const runById = new Map(cachedRuns.map(r => [r.id, r]));

        const cacheValid = fromCache.every(pb => {
          if (!pb.runId) return true;
          const run = runById.get(pb.runId);
          if (!run) return false;

          const band = DISTANCE_PB_BANDS[pb.category];
          if (!band) return true; // 1K / Mile are split-based — existence is enough

          const distanceKm = run.distance !== null && run.distance > 200 ? run.distance / 1000 : run.distance;
          return distanceKm !== null && distanceKm >= band.min && distanceKm <= band.max;
        });

        if (cacheValid) return fromCache;
        // Otherwise cache is invalid — fall through to live query
      }
    }
  } catch (err) {
    console.warn('[MyData] user_stats cache miss/validation failure for PBs, falling back to live query:', err);
  }

  // Fallback: live query (runs for users without cache yet, or stale/invalid cache)
  return getPersonalBestsLive(userId);
}

/**
 * Live PB query — fetches runs and calculates PBs.
 *
 * Distance-based PBs (5K, 10K, 20K, Half, Marathon): ONLY awarded when the user
 * has completed a run within the defined distance band. We never infer these from
 * km-split data because a fastest-1km split does NOT equal a 10K personal best.
 *
 * 1K / Mile PBs: derived from the fastest individual km split across all runs,
 * which is a valid proxy for short-distance best efforts.
 */
async function getPersonalBestsLive(userId: string, excludeCoachingPlan: boolean = false) {
  const distancePBs = Object.entries(DISTANCE_PB_BANDS).map(([label, band]) => ({
    label, min: band.min, max: band.max, target: band.target,
  }));

  const personalBests: any[] = [];

  // Fetch all native runs (exclude Garmin imports)
  const userRuns = await db
    .select()
    .from(runs)
    .where(excludeCoachingPlan
      ? and(and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL), isNull(runs.linkedPlanId), isNull(runs.linkedWorkoutId))
      : and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL))
    .orderBy(asc(runs.completedAt));

  // ── Distance-based PBs: only awarded for actual full-distance runs ──────────
  // A 9.9 km run CANNOT generate a 10K PB — the user must have actually run 10K.
  for (const dist of distancePBs) {
    let bestRun: typeof userRuns[0] | null = null;
    let bestPace: number | null = null;

    for (const run of userRuns) {
      if (!run.avgPace || run.distance === null) continue;

      // Distance stored in metres — convert to km for comparison
      // runs.distance is stored in km; apply safety-net for any legacy meter rows (distance > 200 → impossible in km)
      const distanceKm = run.distance > 200 ? run.distance / 1000 : run.distance;
      if (distanceKm < dist.min || distanceKm > dist.max) continue;

      const paceMinutes = parsePaceToMinutes(run.avgPace);
      if (paceMinutes === null || paceMinutes <= 0) continue;

      if (bestPace === null || paceMinutes < bestPace) {
        bestPace = paceMinutes;
        bestRun = run;
      }
    }

    if (bestRun && bestPace !== null) {
      // Duration: use the actual run duration (stored in seconds)
      const durationMs = (bestRun.duration ?? 0) * 1000;
      personalBests.push({
        category: dist.label,
        pace: formatPace(bestPace),
        distance: dist.target,
        duration: durationMs,
        date: bestRun.completedAt?.toISOString().split('T')[0] || '',
        runId: bestRun.id,
      });
    }
  }

  // ── 1K PB: fastest individual km split across all runs ──────────────────────
  const fastest1K = findFastest1kSplit(userRuns);
  if (fastest1K) personalBests.push(fastest1K);

  return personalBests;
}

/**
 * Find the fastest single km split across all runs.
 * Returns a 1K PersonalBest object, or null if no split data exists.
 */
function findFastest1kSplit(userRuns: any[]): any | null {
  let fastestPaceMinutes: number | null = null;
  let fastestRun: any | null = null;

  for (const run of userRuns) {
    if (!Array.isArray(run.kmSplits)) continue;

    for (const split of run.kmSplits) {
      if (!split.pace) continue;
      const paceMinutes = parsePaceToMinutes(split.pace);
      if (paceMinutes === null || paceMinutes <= 0) continue;

      if (fastestPaceMinutes === null || paceMinutes < fastestPaceMinutes) {
        fastestPaceMinutes = paceMinutes;
        fastestRun = run;
      }
    }
  }

  if (!fastestRun || fastestPaceMinutes === null) return null;

  return {
    category: '1K',
    pace: formatPace(fastestPaceMinutes),
    distance: 1.0,
    duration: Math.round(fastestPaceMinutes * 60 * 1000), // ms
    date: fastestRun.completedAt?.toISOString().split('T')[0] || '',
    runId: fastestRun.id,
  };
}

/**
 * Parse pace string (mm:ss/km or mm:ss) to minutes as decimal
 */
function parsePaceToMinutes(paceStr: string | null | number): number | null {
  if (paceStr === null || paceStr === undefined) return null;
  
  // If it's already a number (seconds per km from database), convert to minutes
  if (typeof paceStr === 'number') {
    return paceStr / 60;
  }
  
  // If it's a string in "M:SS" format, parse it
  const match = (paceStr as string).match(/(\d+):(\d+)/);
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
    // Only show PB if both duration AND runId are non-null/non-empty
    // Sanity-check: duration should be > 0 and reasonable (>= 30s for even fast segments)
    // AND the date is valid (some stale cache rows may have garbage data)
    if (entry.duration && entry.duration > 30000 && entry.runId && entry.date) {
      // Convert duration (ms) to pace (min/km)
      const durationMins = entry.duration / 1000 / 60;
      const paceMinPerKm = durationMins / entry.distance;
      
      // Final sanity-check: pace should be realistic (0.5 to 60 min/km)
      // Anything outside this range indicates corrupt cache data
      if (paceMinPerKm > 0.5 && paceMinPerKm < 60) {
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
  }

  return bests;
}

// ─── Period Statistics ────────────────────────────────────────────────────────

/**
 * Calculate aggregated statistics for a time period using SQL aggregation.
 * ⚡ Returns 1 row from the DB regardless of how many runs exist in the period.
 * Previous implementation fetched all matching rows and computed in JavaScript.
 */
export async function getPeriodStatistics(userId: string, days: number, excludeCoachingPlan: boolean = false) {
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
      and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL),
      gte(runs.completedAt, startDate),
      ...(excludeCoachingPlan ? [isNull(runs.linkedPlanId), isNull(runs.linkedWorkoutId)] : []),
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
export async function getDetailedTrends(userId: string, days: number, excludeCoachingPlan: boolean = true) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // ⚡ Only fetch the columns needed for charts — not SELECT *
    // Coaching plan sessions are excluded by default (linked_plan_id/linked_workout_id IS NULL)
    // so trends only reflect the runner's natural free-run performance.
    const userRuns = await db
      .select({
        completedAt:      runs.completedAt,
        avgPace:          runs.avgPace,
        avgHeartRate:     runs.avgHeartRate,
        avgHeartRateZone: runs.avgHeartRateZone,
        elevationGain:    runs.elevationGain,
        cadence:          runs.cadence,
      })
      .from(runs)
      .where(and(
        and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL),
        gte(runs.completedAt, startDate),
        ...(excludeCoachingPlan ? [isNull(runs.linkedPlanId), isNull(runs.linkedWorkoutId)] : []),
      ))
      .orderBy(asc(runs.completedAt));

    if (userRuns.length === 0) {
      return { paceTrend: [], hrTrend: [], elevationTrend: [], cadenceTrend: [] };
    }

    // Sane pace bounds (min/km) — anything outside this range is almost certainly a
    // corrupted/paused-GPS artifact (e.g. a run stopped mid-track that kept recording
    // duration while barely moving), not a real running pace. Even a slow hike rarely
    // exceeds ~20 min/km, so 30 gives generous headroom while still excluding the
    // wild outliers (e.g. "750 min/km") that were blowing out the chart's Y-axis.
    const MIN_SANE_PACE = 1.5;  // faster than 1:30/km is not realistically achievable
    const MAX_SANE_PACE = 30;   // slower than 30:00/km is treated as bad data

    const paceTrend = userRuns
      .map(r => ({
        date: r.completedAt?.toISOString().split('T')[0] || '',
        value: r.avgPace ? parsePaceToMinutes(r.avgPace) : null,
        rawAvgPace: r.avgPace,
      }))
      .filter((d) => {
        const inRange = d.value !== null && d.value >= MIN_SANE_PACE && d.value <= MAX_SANE_PACE;
        if (!inRange && d.value !== null) {
          // Log so we can trace exactly which run/date is producing the outlier.
          console.warn(
            `[MyData] Excluding outlier pace for user ${userId} on ${d.date}: ` +
            `raw="${d.rawAvgPace}" parsed=${d.value.toFixed(1)} min/km`
          );
        }
        return inRange;
      })
      .map(({ date, value }) => ({ date, value: value as number }));

    // Same idea for heart rate and cadence — guard against sensor glitches / corrupted
    // rows producing a single wild outlier that distorts the whole chart's scale.
    const hrTrend = userRuns
      .map(r => ({ date: r.completedAt?.toISOString().split('T')[0] || '', value: r.avgHeartRate ?? null }))
      .filter((d): d is { date: string; value: number } =>
        d.value !== null && d.value >= 30 && d.value <= 230
      );

    const elevationTrend = userRuns
      .map(r => ({ date: r.completedAt?.toISOString().split('T')[0] || '', value: r.elevationGain ?? null }))
      .filter((d): d is { date: string; value: number } => d.value !== null && d.value >= 0);

    const cadenceTrend = userRuns
      .map(r => ({ date: r.completedAt?.toISOString().split('T')[0] || '', value: r.cadence ?? null }))
      .filter((d): d is { date: string; value: number } =>
        d.value !== null && d.value >= 100 && d.value <= 260
      );

    // ─── Aerobic Efficiency Trend ─────────────────────────────────────────────
    // Measures how fast you can run at a given heart rate effort.
    // Formula: (speed_km_h / avgHR) × 100 — "km/h at 100 bpm" normalised.
    // Higher = more efficient (faster pace per unit of cardiac effort).
    // As aerobic fitness improves, this index increases over weeks/months.
    // Guard: only include runs where both avgPace (parseable) and avgHR > 40 exist.
    const aerobicEfficiencyTrend = userRuns
      .map(r => {
        const date = r.completedAt?.toISOString().split('T')[0] || '';
        const paceMinPerKm = r.avgPace ? parsePaceToMinutes(r.avgPace) : null;
        const hr = r.avgHeartRate ?? null;
        if (!paceMinPerKm || paceMinPerKm <= 0 || !hr || hr < 40) return null;
        // Convert pace (min/km) → speed (km/h): speed = 60 / paceMinPerKm
        const speedKmH = 60 / paceMinPerKm;
        // Normalise to "km/h at 100 bpm"
        const efficiencyIndex = (speedKmH / hr) * 100;
        // Sanity-check: meaningful range is ~3–20 for recreational runners
        if (efficiencyIndex < 1 || efficiencyIndex > 30) return null;
        return { date, value: Math.round(efficiencyIndex * 100) / 100 };
      })
      .filter((d): d is { date: string; value: number } => d !== null);

    return { paceTrend, hrTrend, elevationTrend, cadenceTrend, aerobicEfficiencyTrend };
  } catch (error) {
    console.error('Error getting detailed trends:', error);
    return { paceTrend: [], hrTrend: [], elevationTrend: [], cadenceTrend: [], aerobicEfficiencyTrend: [] };
  }
}

// ─── Coaching Plan Summary ───────────────────────────────────────────────────

/**
 * Get analytics specifically for coaching-plan sessions (runs with linked_plan_id
 * or linked_workout_id set).  Provides insight into plan adherence, intensity
 * distribution, workout type mix, and performance progression within coached sessions.
 */
export async function getCoachingPlanSummary(userId: string, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Coaching plan sessions = runs that are linked to a plan OR a specific workout
  const coachingFilter = and(
    and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL),
    or(isNotNull(runs.linkedPlanId), isNotNull(runs.linkedWorkoutId)),
  );

  const periodFilter = and(
    coachingFilter,
    gte(runs.completedAt, startDate),
  );

  try {
    // ── 1. Aggregate counts for the selected period ──────────────────────────
    const [periodAgg] = await db.select({
      sessionCount:      count(),
      targetHitCount:    sql<number>`COUNT(*) FILTER (WHERE ${runs.wasTargetAchieved} = true)`,
      totalDistanceM:    sum(runs.distance),
      totalDurationSec:  sum(runs.duration),
      avgPaceNumeric:    sql<number>`AVG(CASE
        WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%'
        THEN NULL
        ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0
        END)`,
    }).from(runs).where(periodFilter!);

    const sessionCount    = Number(periodAgg?.sessionCount  ?? 0);
    const targetHitCount  = Number(periodAgg?.targetHitCount ?? 0);
    const totalDistanceKm = Math.round(((Number(periodAgg?.totalDistanceM ?? 0)) / 1000) * 10) / 10;
    const avgPaceNum      = Number(periodAgg?.avgPaceNumeric ?? 0);

    const targetAchievementRate = sessionCount > 0
      ? Math.round((targetHitCount / sessionCount) * 100)
      : 0;

    // ── 2. All-time total coaching sessions ──────────────────────────────────
    const [allTimeAgg] = await db.select({ total: count() }).from(runs).where(coachingFilter!);
    const totalSessions = Number(allTimeAgg?.total ?? 0);

    if (sessionCount === 0) {
      return {
        hasCoachingSessions: false,
        totalSessions,
        sessionsThisPeriod: 0,
        totalDistanceKm: 0,
        targetAchievementRate: 0,
        avgWeeklyCoachingSessions: 0,
        intensityBreakdown: { easy: 0, moderate: 0, hard: 0, unset: 0 },
        workoutTypeBreakdown: {},
        progressionTrend: 'STABLE',
        progressionNote: 'No coaching sessions in this period.',
        bestCoachingRun: null,
      };
    }

    // ── 3. Intensity breakdown ───────────────────────────────────────────────
    const intensityRows = await db.select({
      intensity: runs.workoutIntensity,
      cnt:       count(),
    }).from(runs).where(periodFilter!).groupBy(runs.workoutIntensity);

    const intensityBreakdown = { easy: 0, moderate: 0, hard: 0, unset: 0 };
    for (const row of intensityRows) {
      const n = Number(row.cnt ?? 0);
      switch ((row.intensity ?? '').toLowerCase()) {
        case 'z1': case 'z2': case 'easy': case 'recovery':
          intensityBreakdown.easy += n; break;
        case 'z3': case 'moderate': case 'tempo':
          intensityBreakdown.moderate += n; break;
        case 'z4': case 'z5': case 'hard': case 'max': case 'intervals':
          intensityBreakdown.hard += n; break;
        default:
          intensityBreakdown.unset += n; break;
      }
    }

    // ── 4. Workout type breakdown ────────────────────────────────────────────
    const typeRows = await db.select({
      workoutType: runs.workoutType,
      cnt:         count(),
    }).from(runs).where(periodFilter!).groupBy(runs.workoutType);

    const workoutTypeBreakdown: Record<string, number> = {};
    for (const row of typeRows) {
      // "free" / "watch_standalone" (non-plan runs) count as "other", like NULL always did.
      const label = row.workoutType && !NON_PLAN_WORKOUT_TYPES.has(row.workoutType) ? row.workoutType : 'other';
      workoutTypeBreakdown[label] = (workoutTypeBreakdown[label] ?? 0) + Number(row.cnt ?? 0);
    }

    // ── 5. Progression trend (compare first half vs second half of period) ───
    const allSessionsForPeriod = await db.select({
      completedAt: runs.completedAt,
      avgPace:     runs.avgPace,
    }).from(runs).where(periodFilter!).orderBy(asc(runs.completedAt));

    let progressionTrend = 'STABLE';
    let progressionNote  = `${sessionCount} coaching session${sessionCount !== 1 ? 's' : ''} this period.`;

    if (allSessionsForPeriod.length >= 4) {
      const parsePace = (s: string | null) => {
        if (!s || !s.includes(':')) return null;
        const [m, sec] = s.split(':').map(Number);
        return isNaN(m) || isNaN(sec) ? null : m + sec / 60;
      };

      const validSessions = allSessionsForPeriod
        .map(r => parsePace(r.avgPace))
        .filter((v): v is number => v !== null && v > 0);

      if (validSessions.length >= 4) {
        const half    = Math.floor(validSessions.length / 2);
        const firstH  = validSessions.slice(0, half);
        const secondH = validSessions.slice(-half);
        const avgFirst  = firstH.reduce((a, b) => a + b, 0) / firstH.length;
        const avgSecond = secondH.reduce((a, b) => a + b, 0) / secondH.length;
        const diffPct   = ((avgFirst - avgSecond) / avgFirst) * 100; // positive = got faster

        if (diffPct > 3) {
          progressionTrend = 'IMPROVING';
          const secFaster = Math.round((avgFirst - avgSecond) * 60);
          progressionNote  = `Pace improved ~${secFaster}s/km over coached sessions this period. 🔥`;
        } else if (diffPct < -3) {
          progressionTrend = 'DECLINING';
          const secSlower = Math.round((avgSecond - avgFirst) * 60);
          progressionNote  = `Pace slowed ~${secSlower}s/km in recent coached sessions — consider easier recovery runs.`;
        } else {
          progressionTrend = 'STABLE';
          progressionNote  = `Consistent pace across coached sessions this period. Keep it up!`;
        }
      }
    }

    // ── 6. Best coaching run in period ──────────────────────────────────────
    const bestRuns = await db.select({
      id:          runs.id,
      completedAt: runs.completedAt,
      distance:    runs.distance,
      avgPace:     runs.avgPace,
    })
      .from(runs)
      .where(and(periodFilter!, isNotNull(runs.avgPace))!)
      .orderBy(
        // Order by pace numerically (lower = faster) — avoid nulls
        sql`CASE WHEN ${runs.avgPace} IS NULL OR ${runs.avgPace} = '' OR ${runs.avgPace} NOT LIKE '%:%' THEN 9999 ELSE SPLIT_PART(${runs.avgPace}, ':', 1)::numeric + SPLIT_PART(${runs.avgPace}, ':', 2)::numeric / 60.0 END ASC`,
      )
      .limit(1);

    const bestRun = bestRuns[0] ?? null;

    // ── 7. Weekly average ────────────────────────────────────────────────────
    const weeksInPeriod = Math.max(1, days / 7);
    const avgWeeklyCoachingSessions = Math.round((sessionCount / weeksInPeriod) * 10) / 10;

    // ── 8. Avg pace string for display ──────────────────────────────────────
    const avgPaceDisplay = avgPaceNum > 0 ? formatPace(avgPaceNum) : '--';

    return {
      hasCoachingSessions: true,
      totalSessions,
      sessionsThisPeriod: sessionCount,
      totalDistanceKm,
      avgPaceDisplay,
      targetAchievementRate,
      avgWeeklyCoachingSessions,
      intensityBreakdown,
      workoutTypeBreakdown,
      progressionTrend,
      progressionNote,
      bestCoachingRun: bestRun ? {
        runId:      bestRun.id,
        date:       bestRun.completedAt?.toISOString().split('T')[0] ?? '',
        distanceKm: Math.round(((bestRun.distance ?? 0) / 1000) * 100) / 100,
        pace:       bestRun.avgPace ?? '--',
      } : null,
    };
  } catch (error) {
    console.error('[CoachingSummary] Error:', error);
    return {
      hasCoachingSessions: false,
      totalSessions: 0,
      sessionsThisPeriod: 0,
      totalDistanceKm: 0,
      targetAchievementRate: 0,
      avgWeeklyCoachingSessions: 0,
      intensityBreakdown: { easy: 0, moderate: 0, hard: 0, unset: 0 },
      workoutTypeBreakdown: {},
      progressionTrend: 'STABLE',
      progressionNote: 'Unable to load coaching summary.',
      bestCoachingRun: null,
    };
  }
}

// ─── All-Time Stats ───────────────────────────────────────────────────────────

/**
 * Get all-time stats from the user_stats cache table.
 * ⚡ O(1) PK lookup regardless of run count.
 * Falls back to live SQL aggregation if cache isn't populated yet.
 */
export async function getAllTimeStats(userId: string, excludeCoachingPlan: boolean = false) {
  // The user_stats cache aggregates ALL runs — no excludeCoachingPlan-filtered variant,
  // so that mode always falls through to a live query.
  if (excludeCoachingPlan) {
    return getAllTimeStatsLive(userId, true);
  }

  try {
    const [cached] = await db.select().from(userStats).where(eq(userStats.userId, userId));
    if (cached) {
      const totalRuns = cached.totalRuns ?? 0;

      // If the cached streak is 0 but the user has runs, the cache predates the streak
      // column being populated. Calculate live and backfill the cache so future reads are fast.
      let mostConsecutiveRuns = cached.mostConsecutiveRuns ?? 0;
      if (mostConsecutiveRuns === 0 && totalRuns > 0) {
        mostConsecutiveRuns = await calculateLongestConsecutiveRunStreak(userId);
        if (mostConsecutiveRuns > 0) {
          // Backfill the cache so the next request is O(1) again
          await db.update(userStats)
            .set({ mostConsecutiveRuns })
            .where(eq(userStats.userId, userId));
        }
      }

      // Note: cached fields are already in km (totalDistanceKm, longestRunKm)
      return {
        totalRuns,
        totalDistanceKm:       Math.round((cached.totalDistanceKm ?? 0) * 10) / 10,
        totalHours:            Math.round(((cached.totalDurationSeconds ?? 0) / 3600) * 10) / 10,
        totalCalories:         cached.totalCalories ?? 0,
        mostConsecutiveRuns,
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
async function getAllTimeStatsLive(userId: string, excludeCoachingPlan: boolean = false) {
  const planFilter = excludeCoachingPlan
    ? and(isNull(runs.linkedPlanId), isNull(runs.linkedWorkoutId))
    : undefined;
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
    }).from(runs).where(planFilter ? and(and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL), planFilter) : and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL));

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
      .where(planFilter ? and(and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL), planFilter) : and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL))
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
    
    // Calculate longest consecutive run streak
    const mostConsecutiveRuns = await calculateLongestConsecutiveRunStreak(userId);

    return {
      totalRuns,
      totalDistanceKm:     Math.round(Number(stats.totalDistanceKm ?? 0) * 10) / 10,
      totalHours:          Math.round((Number(stats.totalDurationSec ?? 0) / 3600) * 10) / 10,
      totalCalories:       Number(stats.totalCalories ?? 0),
      mostConsecutiveRuns,
      longestRunKm:        Math.round(Number(stats.longestRunKm ?? 0) * 10) / 10,
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

/**
 * Calculate the longest consecutive day streak of runs
 * Considers runs on different calendar days (even hours apart) as consecutive
 */
export async function calculateLongestConsecutiveRunStreak(userId: string): Promise<number> {
  try {
    // Get all run dates, sorted by date
    const runDates = await db
      .select({ runDate: runs.runDate })
      .from(runs)
      .where(and(eq(runs.userId, userId), MEANINGFUL_RUN_SQL))
      .orderBy(asc(runs.runDate));

    if (runDates.length === 0) return 0;

    let maxStreak = 1;
    let currentStreak = 1;
    let lastDate = new Date(runDates[0].runDate!);

    for (let i = 1; i < runDates.length; i++) {
      const currentDate = new Date(runDates[i].runDate!);
      const dayDiff = Math.round((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

      if (dayDiff === 1) {
        // Consecutive day
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else if (dayDiff > 1) {
        // Streak broken
        currentStreak = 1;
      }
      // If dayDiff === 0, same day, don't increment streak (only count once per day)

      lastDate = currentDate;
    }

    return maxStreak;
  } catch (error) {
    console.error('Error calculating consecutive run streak:', error);
    return 0;
  }
}

function formatPace(minPerKm: number): string {
  if (!minPerKm || minPerKm <= 0) return '--';
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

export default { getPersonalBests, getPeriodStatistics, getDetailedTrends, getAllTimeStats, getCoachingPlanSummary };
