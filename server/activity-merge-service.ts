/**
 * Activity Merge Service
 * 
 * Handles intelligent fuzzy matching and merging of Garmin activities
 * with existing AiRunCoach run records to prevent duplicates while
 * enriching run data with wearable metrics.
 */

import { and, eq, gte, lte, desc } from "drizzle-orm";
import { db } from "./db";
import { runs, activityMergeLog } from "@shared/schema";
import type { GarminActivity } from "@shared/schema";

/**
 * Represents a potential match between a Garmin activity and AiRunCoach run
 */
export interface ActivityMergeCandidate {
  aiRunCoachRunId: string;
  garminActivityId: string;
  matchScore: number; // 0-100
  matchReasons: string[];
  timeDiff: number; // seconds
  distanceDiff: number; // percentage
  durationDiff: number; // percentage
}

/**
 * Calculate absolute difference between two timestamps
 */
function getTimeDifferenceSeconds(date1: Date, timestamp2: number): number {
  const date2 = new Date(timestamp2 * 1000);
  return Math.abs(date1.getTime() - date2.getTime()) / 1000;
}

/**
 * Calculate percentage difference between two numbers
 */
function getPercentageDifference(value1: number, value2: number): number {
  if (value1 === 0) return 100;
  return Math.abs((value1 - value2) / value1) * 100;
}

/**
 * Fuzzy match a Garmin activity to potential AiRunCoach runs
 * 
 * Scoring breakdown (out of 100 points):
 * - Time matching: 30 points (exact start times)
 * - Distance matching: 30 points (consistent route)
 * - Duration matching: 20 points (similar pace)
 * - Activity type: 10 points (must be running)
 * - No existing data: 10 points (not already merged)
 * 
 * Threshold: >50 points required for merge (high confidence)
 */
export async function fuzzyMatchGarminToAiRunCoachRun(
  garminActivity: GarminActivity,
  userId: string
): Promise<ActivityMergeCandidate | null> {
  try {
    // Query runs within 24-hour window of Garmin activity
    const garminActivityTime = new Date(garminActivity.startTimeInSeconds * 1000);
    const windowStart = new Date(garminActivityTime.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(garminActivityTime.getTime() + 24 * 60 * 60 * 1000);

    const candidates = await db.query.runs.findMany({
      where: and(
        eq(runs.userId, userId),
        gte(runs.completedAt, windowStart),
        lte(runs.completedAt, windowEnd)
      ),
    });

    let bestMatch: ActivityMergeCandidate | null = null;

    for (const aiRunCoachRun of candidates) {
      let matchScore = 0;
      const matchReasons: string[] = [];

      // Skip if already has Garmin data
      if (aiRunCoachRun.hasGarminData) {
        continue;
      }

      // 1. TIME MATCHING (Weight: 30 points)
      // Runs should start at roughly the same time
      const timeDiffSeconds = getTimeDifferenceSeconds(
        aiRunCoachRun.completedAt,
        garminActivity.startTimeInSeconds
      );

      if (timeDiffSeconds < 60) {
        // Exact match within 1 minute
        matchScore += 30;
        matchReasons.push("Exact time match (<1 min diff)");
      } else if (timeDiffSeconds < 300) {
        // Very close match within 5 minutes
        matchScore += 25;
        matchReasons.push("Close time match (<5 min diff)");
      } else if (timeDiffSeconds < 900) {
        // Reasonable match within 15 minutes
        matchScore += 15;
        matchReasons.push("Reasonable time match (<15 min diff)");
      } else if (timeDiffSeconds < 3600) {
        // Same hour
        matchScore += 5;
        matchReasons.push("Same hour");
      }

      // 2. DISTANCE MATCHING (Weight: 30 points)
      // Routes should be similar distance
      const garminDistanceKm = (garminActivity.distanceInMeters || 0) / 1000;
      const distanceDiffPercent = getPercentageDifference(
        aiRunCoachRun.distance,
        garminDistanceKm
      );

      if (distanceDiffPercent < 5) {
        // Exact distance match within 5%
        matchScore += 30;
        matchReasons.push("Exact distance match (<5% diff)");
      } else if (distanceDiffPercent < 15) {
        // Very close distance within 15%
        matchScore += 20;
        matchReasons.push("Very close distance (<15% diff)");
      } else if (distanceDiffPercent < 30) {
        // Close distance within 30%
        matchScore += 10;
        matchReasons.push("Close distance (<30% diff)");
      }

      // 3. DURATION MATCHING (Weight: 20 points)
      // Runs should take similar time (pace consistency)
      const durationDiffPercent = getPercentageDifference(
        aiRunCoachRun.duration,
        garminActivity.durationInSeconds || 0
      );

      if (durationDiffPercent < 5) {
        // Exact duration match within 5%
        matchScore += 20;
        matchReasons.push("Exact duration match (<5% diff)");
      } else if (durationDiffPercent < 15) {
        // Very close duration within 15%
        matchScore += 15;
        matchReasons.push("Very close duration (<15% diff)");
      } else if (durationDiffPercent < 30) {
        // Close duration within 30%
        matchScore += 8;
        matchReasons.push("Close duration (<30% diff)");
      }

      // 4. ACTIVITY TYPE MATCHING (Weight: 10 points)
      // Should be a running activity
      const runningActivityTypes = [
        "RUNNING",
        "TRAIL_RUNNING",
        "TRACK_RUNNING",
        "WHEELCHAIR_PUSH_RUN",
      ];

      const isRunningActivity = runningActivityTypes.includes(
        (garminActivity.activityType || "").toUpperCase()
      );

      if (isRunningActivity && aiRunCoachRun.type === "RUN") {
        matchScore += 10;
        matchReasons.push("Activity type matches (running)");
      }

      // 5. NO EXISTING GARMIN DATA (Weight: 10 points)
      // Prefer runs without existing Garmin data to avoid duplicates
      if (!aiRunCoachRun.garminActivityId) {
        matchScore += 10;
        matchReasons.push("No existing Garmin data linked");
      }

      // Update best match if this one scores higher
      if (matchScore > 50 && matchScore > (bestMatch?.matchScore || 0)) {
        bestMatch = {
          aiRunCoachRunId: aiRunCoachRun.id,
          garminActivityId: garminActivity.id,
          matchScore,
          matchReasons,
          timeDiff: timeDiffSeconds,
          distanceDiff: distanceDiffPercent,
          durationDiff: durationDiffPercent,
        };
      }
    }

    return bestMatch;
  } catch (error) {
    console.error("❌ Error fuzzy matching Garmin activity:", error);
    return null;
  }
}

/**
 * Merge Garmin activity data into existing AiRunCoach run record
 * 
 * Uses Garmin data as primary source for metrics (wearables are more accurate)
 * while preserving user-entered data like notes and custom goals
 */
export async function mergeGarminActivityWithAiRunCoachRun(
  aiRunCoachRunId: string,
  garminActivity: GarminActivity,
  mergeCandidate: ActivityMergeCandidate,
  userId: string
): Promise<void> {
  try {
    console.log(
      `[Merge] Merging Garmin activity ${garminActivity.id} with run ${aiRunCoachRunId}`
    );

    // Prepare enriched data from Garmin
    // Use Garmin metrics as primary (wearables are more accurate)
    const enrichedData = {
      garminActivityId: garminActivity.id,
      garminSummaryId: garminActivity.summaryId,
      hasGarminData: true,

      // Override with Garmin metrics (more accurate)
      distance: (garminActivity.distanceInMeters || 0) / 1000,
      duration: garminActivity.durationInSeconds,
      avgHeartRate: garminActivity.averageHeartRateInBeatsPerMinute,
      maxHeartRate: garminActivity.maxHeartRateInBeatsPerMinute,
      calories: garminActivity.activeKilocalories,

      // Add enriched data
      elevationGain: garminActivity.totalElevationGainInMeters,
      avgPace: garminActivity.averagePaceInMinutesPerKilometer,
      avgSpeed: garminActivity.averageSpeedInMetersPerSecond,
      activityType: garminActivity.activityType,
      deviceName: garminActivity.deviceName,

      // Merge tracking
      mergeScore: mergeCandidate.matchScore,
      mergeConfidence: mergeCandidate.matchScore / 100,
    };

    // Update the run record with merged data
    await db.update(runs)
      .set(enrichedData)
      .where(eq(runs.id, aiRunCoachRunId));

    // Log the merge for audit trail
    await db.insert(activityMergeLog).values({
      aiRunCoachRunId,
      garminActivityId: garminActivity.id,
      mergeScore: mergeCandidate.matchScore,
      mergeReasons: mergeCandidate.matchReasons,
      mergedAt: new Date(),
      userId,
    });

    console.log(
      `✅ [Merge] Successfully merged with confidence ${mergeCandidate.matchScore}%`
    );
    console.log(
      `   Reasons: ${mergeCandidate.matchReasons.join(", ")}`
    );

  } catch (error) {
    console.error("❌ Error merging Garmin activity with run:", error);
    throw error;
  }
}

/**
 * Process a Garmin activity - either merge with existing run or create new
 * 
 * This is the main entry point for activity webhook handlers
 */
export async function processGarminActivityForMerge(
  garminActivity: GarminActivity,
  userId: string
): Promise<{
  action: "MERGED" | "CREATED";
  runId: string;
  mergeScore?: number;
  reasons?: string[];
}> {
  try {
    // Step 1: Try to find matching AiRunCoach run
    const mergeCandidate = await fuzzyMatchGarminToAiRunCoachRun(
      garminActivity,
      userId
    );

    if (mergeCandidate && mergeCandidate.matchScore > 50) {
      // Step 2: Merge if confident match found
      await mergeGarminActivityWithAiRunCoachRun(
        mergeCandidate.aiRunCoachRunId,
        garminActivity,
        mergeCandidate,
        userId
      );

      return {
        action: "MERGED",
        runId: mergeCandidate.aiRunCoachRunId,
        mergeScore: mergeCandidate.matchScore,
        reasons: mergeCandidate.matchReasons,
      };
    } else {
      // Step 3: No match - activity will be created by webhook handler
      console.log(
        `[Merge] No suitable match found for Garmin activity ${garminActivity.id}`
      );
      if (mergeCandidate) {
        console.log(
          `   Best match score was ${mergeCandidate.matchScore}% (threshold: 50%)`
        );
      }

      return {
        action: "CREATED",
        runId: garminActivity.id,
      };
    }
  } catch (error) {
    console.error("❌ Error processing Garmin activity for merge:", error);
    throw error;
  }
}

/**
 * Get merge statistics for a user
 * Useful for dashboard showing how many runs have been enriched
 */
export async function getUserMergeStatistics(userId: string): Promise<{
  totalRuns: number;
  mergedRuns: number;
  mergePercentage: number;
  averageMergeScore: number;
  recentMerges: {
    runId: string;
    garminActivityId: string;
    score: number;
    mergedAt: Date;
  }[];
}> {
  try {
    // Count total runs
    const totalRuns = await db.query.runs.findMany({
      where: eq(runs.userId, userId),
    });

    // Count merged runs
    const mergedRuns = totalRuns.filter((run) => run.hasGarminData);

    // Get recent merges
    const recentMerges = await db.query.activityMergeLog.findMany({
      where: eq(activityMergeLog.userId, userId),
      orderBy: desc(activityMergeLog.mergedAt),
      limit: 10,
    });

    // Calculate average score
    const avgScore =
      recentMerges.length > 0
        ? recentMerges.reduce((sum, m) => sum + (m.mergeScore || 0), 0) /
          recentMerges.length
        : 0;

    return {
      totalRuns: totalRuns.length,
      mergedRuns: mergedRuns.length,
      mergePercentage:
        totalRuns.length > 0
          ? (mergedRuns.length / totalRuns.length) * 100
          : 0,
      averageMergeScore: Math.round(avgScore),
      recentMerges: recentMerges.map((m) => ({
        runId: m.aiRunCoachRunId,
        garminActivityId: m.garminActivityId,
        score: m.mergeScore || 0,
        mergedAt: m.mergedAt,
      })),
    };
  } catch (error) {
    console.error("❌ Error getting user merge statistics:", error);
    throw error;
  }
}

/**
 * Get detailed merge information for a specific run
 */
export async function getRunMergeDetails(runId: string): Promise<{
  isMerged: boolean;
  garminActivityId?: string;
  mergeScore?: number;
  mergeReasons?: string[];
  mergedAt?: Date;
} | null> {
  try {
    const mergeLog = await db.query.activityMergeLog.findFirst({
      where: eq(activityMergeLog.aiRunCoachRunId, runId),
    });

    if (!mergeLog) {
      return { isMerged: false };
    }

    return {
      isMerged: true,
      garminActivityId: mergeLog.garminActivityId,
      mergeScore: mergeLog.mergeScore || undefined,
      mergeReasons: mergeLog.mergeReasons || undefined,
      mergedAt: mergeLog.mergedAt,
    };
  } catch (error) {
    console.error("❌ Error getting run merge details:", error);
    return null;
  }
}
