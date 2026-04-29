/**
 * Real-Time Coaching Integration
 *
 * Integrates the smart biomechanical coach with the session coaching pipeline.
 * Handles:
 * - Receiving real-time biometric data from watch
 * - Computing terrain context from GPS
 * - Fetching runner baseline from historical data
 * - Generating intelligent coaching feedback
 * - Broadcasting coaching cues to the mobile app
 */

import { Router, Request, Response } from "express";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { runs } from "@shared/schema";
import RealTimeBiomechanicalCoach, {
  BiometricDataPoint,
  RunnerBaseline,
  TerrainContext,
  CoachingContext,
} from "./real-time-biomechanical-coach";

// ============================================================================
// ROUTES
// ============================================================================

export const realtimeCoachingRouter = Router();

/**
 * POST /api/coaching/biometric-data
 *
 * Receive real-time biometric data from the watch during a run.
 * Generate and return coaching feedback.
 *
 * Request Body:
 * {
 *   userId: string,         ← caller must supply their own userId
 *   biometrics: BiometricDataPoint,
 *   distanceRemaining?: number,
 *   targetPace?: number
 * }
 */
realtimeCoachingRouter.post(
  "/biometric-data",
  async (req: Request, res: Response) => {
    try {
      const { userId, biometrics, distanceRemaining, targetPace } = req.body;

      if (!userId || !biometrics) {
        return res
          .status(400)
          .json({ error: "Missing userId or biometrics" });
      }

      // 1. Get runner's baseline from historical data
      const baseline = await getRunnerBaseline(userId);
      if (!baseline) {
        return res.status(404).json({ error: "Runner profile not found" });
      }

      // 2. Compute terrain context from GPS
      const terrain = await computeTerrainContext(
        biometrics.latitude,
        biometrics.longitude,
        biometrics.altitude,
        biometrics.distance
      );

      // 3. Estimate fatigue level
      const fatigueLevel = estimateFatigue(
        biometrics.heartRate,
        baseline.maxHeartRate,
        biometrics.verticalOscillation,
        baseline.normalVerticalOscillation.avg,
        biometrics.elapsedTime
      );

      // 4. Build coaching context
      const context: CoachingContext = {
        biometrics,
        baseline,
        terrain,
        fatigueLevel,
        distanceRemaining,
        targetPace,
        workoutPhase: determineWorkoutPhase(
          biometrics.heartRateZone,
          biometrics.elapsedTime,
          biometrics.distance
        ),
        timeInZone: {}, // Would be populated from session history
      };

      // 5. Generate coaching feedback
      const coaching =
        await RealTimeBiomechanicalCoach.generateCoachingFeedback(context);

      // 6. Return to client
      return res.json({
        success: true,
        coaching,
        context: {
          fatigueLevel: Math.round(fatigueLevel),
          terrain: {
            courseType: terrain.courseType,
            currentGrade: terrain.currentGrade.toFixed(1),
          },
        },
      });
    } catch (error) {
      console.error("Biometric coaching error:", error);
      return res.status(500).json({ error: "Failed to generate coaching" });
    }
  }
);

/**
 * GET /api/coaching/runner-baseline
 *
 * Get the runner's baseline metrics from recent runs.
 * Used for understanding normal performance.
 */
realtimeCoachingRouter.get(
  "/runner-baseline",
  async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      const baseline = await getRunnerBaseline(userId);
      if (!baseline) {
        return res.status(404).json({ error: "No baseline found" });
      }

      return res.json(baseline);
    } catch (error) {
      console.error("Baseline fetch error:", error);
      return res.status(500).json({ error: "Failed to fetch baseline" });
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a pace string "M:SS" into total seconds per km.
 * e.g. "5:30" → 330, "6:00" → 360.
 * Falls back to 360 (6 min/km) on any parse failure.
 */
function parsePaceToSeconds(pace: string | null | undefined): number {
  if (!pace) return 360;
  const parts = pace.split(":");
  if (parts.length !== 2) return 360;
  const mins = parseInt(parts[0], 10);
  const secs = parseInt(parts[1], 10);
  if (isNaN(mins) || isNaN(secs)) return 360;
  return mins * 60 + secs;
}

/**
 * Get runner's baseline metrics from their last 4 weeks of running.
 * Uses Drizzle ORM with proper camelCase column references.
 */
async function getRunnerBaseline(userId: string): Promise<RunnerBaseline | null> {
  try {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const recentRuns = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          gt(runs.completedAt, fourWeeksAgo),
          isNotNull(runs.completedAt)
        )
      )
      .limit(20);

    if (recentRuns.length === 0) {
      return null; // No historical data — caller decides how to handle
    }

    // Extract numeric metrics and compute ranges, filtering out missing/zero values
    const heartRates = recentRuns
      .map((r) => r.avgHeartRate)
      .filter((hr): hr is number => hr != null && hr > 0);
    const cadences = recentRuns
      .map((r) => r.cadence)
      .filter((c): c is number => c != null && c > 0);
    // Pace stored as "M:SS" string — convert to seconds per km for arithmetic
    const paces = recentRuns
      .map((r) => parsePaceToSeconds(r.avgPace))
      .filter((p) => p > 0 && p < 3600); // Sanity range: 0–60 min/km
    const strideLengths = recentRuns
      .map((r) => r.avgStrideLength)
      .filter((s): s is number => s != null && s > 0);
    const gcts = recentRuns
      .map((r) => r.groundContactTime)
      .filter((g): g is number => g != null && g > 0);
    const vos = recentRuns
      .map((r) => r.verticalOscillation)
      .filter((v): v is number => v != null && v > 0);

    const avg = (arr: number[], fallback: number) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback;

    const baseline: RunnerBaseline = {
      userId,

      normalHeartRate: {
        min: heartRates.length > 0 ? Math.min(...heartRates) : 120,
        max: heartRates.length > 0 ? Math.max(...heartRates) : 180,
        avg: avg(heartRates, 150),
      },

      normalCadence: {
        min: cadences.length > 0 ? Math.min(...cadences) : 160,
        max: cadences.length > 0 ? Math.max(...cadences) : 190,
        avg: avg(cadences, 175),
      },

      normalPace: {
        // Pace stored as seconds/km: higher = slower, lower = faster
        min: paces.length > 0 ? Math.min(...paces) : 300,  // fastest
        max: paces.length > 0 ? Math.max(...paces) : 420,  // slowest
        avg: avg(paces, 360),                               // ~6:00 /km
      },

      normalGroundContactTime: {
        min: gcts.length > 0 ? Math.min(...gcts) : 220,
        max: gcts.length > 0 ? Math.max(...gcts) : 290,
        avg: avg(gcts, 250),
      },

      normalVerticalOscillation: {
        min: vos.length > 0 ? Math.min(...vos) : 6.0,
        max: vos.length > 0 ? Math.max(...vos) : 10.0,
        avg: avg(vos, 7.5),
      },

      normalStrideLength: {
        min: strideLengths.length > 0 ? Math.min(...strideLengths) : 1.1,
        max: strideLengths.length > 0 ? Math.max(...strideLengths) : 1.7,
        avg: avg(strideLengths, 1.4),
      },

      maxHeartRate: heartRates.length > 0 ? Math.max(...heartRates) + 5 : 185,
      restingHeartRate: heartRates.length > 0 ? Math.min(...heartRates) : 60,
      lactateThreshold: heartRates.length > 0 ? Math.max(...heartRates) * 0.85 : 157,
      preferredCadence: avg(cadences, 175),
      typicalStrideLength: avg(strideLengths, 1.4),
      typicalGroundContactTime: avg(gcts, 250),
      typicalVerticalOscillation: avg(vos, 7.5),
    };

    return baseline;
  } catch (error) {
    console.error("Error computing baseline:", error);
    return null;
  }
}

/**
 * Compute terrain context from GPS coordinates.
 * Currently uses heuristics; production would query a DEM/elevation API.
 */
async function computeTerrainContext(
  lat: number,
  lng: number,
  altitude: number,
  totalDistance: number
): Promise<TerrainContext> {
  // TODO: Query elevation database / DEM for accurate grade computation
  const currentGrade = 0; // Placeholder — requires elevation API

  let courseType: "flat" | "rolling" | "hilly" | "mountainous" = "flat";
  if (totalDistance > 5000) {
    courseType = "rolling"; // Conservative default for longer runs
  }

  return {
    currentGrade,
    recentGrade: 0,
    elevationGain: 0,
    elevationLoss: 0,
    courseType,
  };
}

/**
 * Estimate current fatigue level (0–100) based on biometric changes.
 * Guards against zero/null denominators.
 */
function estimateFatigue(
  currentHR: number,
  maxHR: number,
  currentVO: number,
  normalVO: number,
  elapsedSeconds: number
): number {
  let fatigue = 0;

  // HR as percent of max increases with fatigue
  if (maxHR > 0) {
    const hrPercent = (currentHR / maxHR) * 100;
    if (hrPercent > 85) fatigue += 30;
    else if (hrPercent > 75) fatigue += 20;
    else if (hrPercent > 65) fatigue += 10;
  }

  // Vertical oscillation increases with fatigue (form breakdown)
  if (normalVO > 0 && currentVO > 0) {
    const voRatio = currentVO / normalVO;
    if (voRatio > 1.15) fatigue += 25;
    else if (voRatio > 1.08) fatigue += 12;
    else if (voRatio > 1.00) fatigue += 5;
  }

  // Time in activity — fatigue accumulates
  const minutesElapsed = elapsedSeconds / 60;
  if (minutesElapsed > 60) fatigue += Math.min(25, (minutesElapsed - 60) * 0.25);
  else if (minutesElapsed > 45) fatigue += 10;
  else if (minutesElapsed > 30) fatigue += 5;

  return Math.min(100, Math.max(0, fatigue));
}

/**
 * Determine current workout phase based on time and effort.
 */
function determineWorkoutPhase(
  hrZone: number,
  elapsedSeconds: number,
  distanceMeters: number
): string {
  const minutes = elapsedSeconds / 60;

  if (minutes < 10) return "warmup";
  if (minutes > 50 && hrZone <= 2) return "cooldown";

  if (hrZone <= 2) return "easy";
  if (hrZone === 3) return "tempo";
  if (hrZone === 4) return "threshold";
  if (hrZone === 5) return "max";

  return "easy";
}

export default realtimeCoachingRouter;
