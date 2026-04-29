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
 *   sessionId: string,
 *   biometrics: BiometricDataPoint,
 *   distanceRemaining?: number,
 *   targetPace?: number
 * }
 */
realtimeCoachingRouter.post(
  "/biometric-data",
  async (req: Request, res: Response) => {
    try {
      const { sessionId, biometrics, distanceRemaining, targetPace } = req.body;

      if (!sessionId || !biometrics) {
        return res
          .status(400)
          .json({ error: "Missing sessionId or biometrics" });
      }

      // 1. Get runner's baseline from historical data
      const baseline = await getRunnerBaseline(sessionId);
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
 * Get runner's baseline metrics from their last 4 weeks of running
 */
async function getRunnerBaseline(userId: string): Promise<RunnerBaseline | null> {
  try {
    // Query last 4 weeks of completed runs
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const recentRuns = await db
      .select()
      .from(runs)
      .where(
        `user_id = $1 AND completed_at > $2 AND is_active = false`,
        [userId, fourWeeksAgo.toISOString()]
      )
      .limit(20); // Last ~20 runs in 4 weeks

    if (recentRuns.length === 0) {
      return null; // No historical data, use defaults
    }

    // Extract numeric metrics and compute ranges
    const heartRates = recentRuns
      .map((r) => r.average_heart_rate)
      .filter((hr) => hr && hr > 0);
    const cadences = recentRuns
      .map((r) => r.cadence)
      .filter((c) => c && c > 0);
    const paces = recentRuns
      .map((r) => parseFloat(r.average_pace || "6:00"))
      .filter((p) => !isNaN(p) && p > 0);
    const strideLengths = recentRuns
      .map((r) => r.avg_stride_length)
      .filter((s) => s && s > 0);
    const gcts = recentRuns
      .map((r) => r.ground_contact_time)
      .filter((g) => g && g > 0);
    const vos = recentRuns
      .map((r) => r.vertical_oscillation)
      .filter((v) => v && v > 0);

    const baseline: RunnerBaseline = {
      userId,
      
      normalHeartRate: {
        min: Math.min(...heartRates),
        max: Math.max(...heartRates),
        avg: heartRates.reduce((a, b) => a + b, 0) / heartRates.length || 150,
      },
      
      normalCadence: {
        min: Math.min(...cadences),
        max: Math.max(...cadences),
        avg: cadences.reduce((a, b) => a + b, 0) / cadences.length || 175,
      },
      
      normalPace: {
        min: Math.max(...paces), // Higher number = slower pace
        max: Math.min(...paces), // Lower number = faster pace
        avg: paces.reduce((a, b) => a + b, 0) / paces.length || 6.0,
      },
      
      normalGroundContactTime: {
        min: Math.min(...gcts),
        max: Math.max(...gcts),
        avg: gcts.reduce((a, b) => a + b, 0) / gcts.length || 250,
      },
      
      normalVerticalOscillation: {
        min: Math.min(...vos),
        max: Math.max(...vos),
        avg: vos.reduce((a, b) => a + b, 0) / vos.length || 7.5,
      },
      
      normalStrideLength: {
        min: Math.min(...strideLengths),
        max: Math.max(...strideLengths),
        avg: strideLengths.reduce((a, b) => a + b, 0) / strideLengths.length || 1.4,
      },

      maxHeartRate: Math.max(...heartRates) + 5, // Add buffer
      restingHeartRate: Math.min(...heartRates),
      lactateThreshold: Math.max(...heartRates) * 0.85,
      preferredCadence: cadences.reduce((a, b) => a + b, 0) / cadences.length || 175,
      typicalStrideLength: strideLengths.reduce((a, b) => a + b, 0) / strideLengths.length || 1.4,
      typicalGroundContactTime: gcts.reduce((a, b) => a + b, 0) / gcts.length || 250,
      typicalVerticalOscillation: vos.reduce((a, b) => a + b, 0) / vos.length || 7.5,
    };

    return baseline;
  } catch (error) {
    console.error("Error computing baseline:", error);
    return null;
  }
}

/**
 * Compute terrain context (grade, course type) from GPS coordinates
 */
async function computeTerrainContext(
  lat: number,
  lng: number,
  altitude: number,
  totalDistance: number
): Promise<TerrainContext> {
  // TODO: In production, would query elevation database or DEM (Digital Elevation Model)
  // For now, use simple heuristics based on recent altitude changes

  // Estimate current grade based on altitude progression
  // This would be much more accurate with full route history
  const currentGrade = 0; // Placeholder

  // Determine overall course type from elevation gain/loss progression
  let courseType: "flat" | "rolling" | "hilly" | "mountainous" = "flat";
  
  // TODO: Compute from actual elevation data
  if (totalDistance > 5000) {
    // Based on elevation gain in first 5km
    courseType = "rolling"; // Placeholder
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
 * Estimate current fatigue level (0-100) based on biometric changes
 * 
 * Fatigue indicators:
 * - Rising HR at same pace (HR drift)
 * - Increased vertical oscillation
 * - Decreased cadence
 * - Longer run duration
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
  const hrPercent = (currentHR / maxHR) * 100;
  if (hrPercent > 85) fatigue += 30;
  else if (hrPercent > 75) fatigue += 20;
  else if (hrPercent > 65) fatigue += 10;

  // Vertical oscillation increases with fatigue (form breakdown)
  const voRatio = currentVO / normalVO;
  if (voRatio > 1.15) fatigue += 25;
  else if (voRatio > 1.08) fatigue += 12;
  else if (voRatio > 1.00) fatigue += 5;

  // Time in activity - fatigue accumulates
  const minutesElapsed = elapsedSeconds / 60;
  if (minutesElapsed > 60) fatigue += Math.min(25, (minutesElapsed - 60) * 0.25);
  else if (minutesElapsed > 45) fatigue += 10;
  else if (minutesElapsed > 30) fatigue += 5;

  return Math.min(100, Math.max(0, fatigue));
}

/**
 * Determine current workout phase based on time and effort
 */
function determineWorkoutPhase(
  hrZone: number,
  elapsedSeconds: number,
  distanceMeters: number
): string {
  const minutes = elapsedSeconds / 60;

  // First 10 minutes = warmup
  if (minutes < 10) return "warmup";

  // Last 10 minutes = cooldown
  // (Would need total distance/time target to know this accurately)
  if (minutes > 50 && hrZone <= 2) return "cooldown";

  // By HR zone
  if (hrZone === 1) return "easy";
  if (hrZone === 2) return "easy";
  if (hrZone === 3) return "tempo";
  if (hrZone === 4) return "threshold";
  if (hrZone === 5) return "max";

  return "easy";
}

export default realtimeCoachingRouter;
