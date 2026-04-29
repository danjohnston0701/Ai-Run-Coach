/**
 * Training Plan Adaptation Service
 * 
 * Handles accepting and applying AI-suggested plan adaptations.
 * When user accepts an adaptation, this service rewrites upcoming workouts based on the suggestion.
 */

import { db } from "./db";
import {
  trainingPlans,
  planAdaptations,
  plannedWorkouts,
} from "@shared/schema";
import { eq, and, gt, isNull, or } from "drizzle-orm";
import { PlanAdaptation, PlannedWorkout } from "@shared/schema";

interface AdaptationChanges {
  // Each adjustment targets a specific workout by its database ID
  // This is precise and avoids the fragile weekOffset/dayOffset approach
  upcoming_workout_adjustments?: Array<{
    workoutId: string;           // Direct DB ID of the planned workout to modify
    newIntensity?: string;       // e.g. "z1", "z2", "z3"
    newWorkoutType?: string;     // e.g. "easy", "recovery", "rest"
    newDescription?: string;     // Updated description for the workout
    newDistance?: number;        // New distance in km
    skip?: boolean;              // If true, convert to rest day
  }>;
  summary: string;               // Human-readable explanation shown to the user
  changeCount: number;           // How many workouts will be modified
}

/**
 * Accept and apply a plan adaptation.
 * Updates the adaptation record and rewrites future workouts.
 */
export async function acceptAndApplyAdaptation(
  adaptationId: string,
  userId: string
): Promise<{ success: boolean; workoutsUpdated: number; error?: string }> {
  try {
    // 1. Get the adaptation record
    const adaptations = await db
      .select()
      .from(planAdaptations)
      .where(eq(planAdaptations.id, adaptationId));

    if (adaptations.length === 0) {
      return { success: false, workoutsUpdated: 0, error: "Adaptation not found" };
    }

    const adaptation = adaptations[0];
    const trainingPlanId = adaptation.trainingPlanId;

    // 2. Verify user owns this plan
    const plans = await db
      .select()
      .from(trainingPlans)
      .where(
        and(
          eq(trainingPlans.id, trainingPlanId),
          eq(trainingPlans.userId, userId)
        )
      );

    if (plans.length === 0) {
      return {
        success: false,
        workoutsUpdated: 0,
        error: "Plan not found or access denied",
      };
    }

    const plan = plans[0];

    // 3. Parse the adaptation changes
    const changes = adaptation.changes as AdaptationChanges | null;
    if (!changes) {
      return {
        success: false,
        workoutsUpdated: 0,
        error: "No changes specified in adaptation",
      };
    }

    // 4. Apply changes to future workouts
    let workoutsUpdated = 0;

    if (changes.upcoming_workout_adjustments && Array.isArray(changes.upcoming_workout_adjustments)) {
      for (const adjustment of changes.upcoming_workout_adjustments) {
        if (!adjustment.workoutId) continue; // Safety guard

        if (adjustment.skip) {
          // Convert workout to a rest day
          await db
            .update(plannedWorkouts)
            .set({
              workoutType: "rest",
              intensity: "z1",
              description: "Rest day — adapted by AI coach based on recent session performance",
              distance: 0,
            })
            .where(
              and(
                eq(plannedWorkouts.id, adjustment.workoutId),
                eq(plannedWorkouts.trainingPlanId, trainingPlanId) // Security: verify same plan
              )
            );
          workoutsUpdated += 1;
        } else {
          // Build the update object from whichever fields the AI provided
          const updates: Record<string, any> = {};
          if (adjustment.newIntensity)    updates.intensity    = adjustment.newIntensity;
          if (adjustment.newWorkoutType)  updates.workoutType  = adjustment.newWorkoutType;
          if (adjustment.newDescription)  updates.description  = adjustment.newDescription;
          if (adjustment.newDistance != null) updates.distance = adjustment.newDistance;

          if (Object.keys(updates).length > 0) {
            await db
              .update(plannedWorkouts)
              .set(updates)
              .where(
                and(
                  eq(plannedWorkouts.id, adjustment.workoutId),
                  eq(plannedWorkouts.trainingPlanId, trainingPlanId)
                )
              );
            workoutsUpdated += 1;
          }
        }
      }
    }

    // 5. Mark adaptation as accepted
    await db
      .update(planAdaptations)
      .set({ userAccepted: true })
      .where(eq(planAdaptations.id, adaptationId));

    console.log(
      `✅ Adaptation ${adaptationId} accepted and applied. ${workoutsUpdated} workouts updated.`
    );

    return { success: true, workoutsUpdated };
  } catch (error) {
    console.error(`❌ Error applying adaptation:`, error);
    return {
      success: false,
      workoutsUpdated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Decline an adaptation (without applying it).
 */
export async function declineAdaptation(
  adaptationId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify user owns this plan
    const result = await db
      .select()
      .from(planAdaptations)
      .innerJoin(
        trainingPlans,
        eq(planAdaptations.trainingPlanId, trainingPlans.id)
      )
      .where(
        and(
          eq(planAdaptations.id, adaptationId),
          eq(trainingPlans.userId, userId)
        )
      );

    if (result.length === 0) {
      return { success: false, error: "Adaptation not found or access denied" };
    }

    // Mark as declined (set userAccepted to false, but don't apply changes)
    await db
      .update(planAdaptations)
      .set({ userAccepted: false })
      .where(eq(planAdaptations.id, adaptationId));

    console.log(`⏭️  Adaptation ${adaptationId} declined by user.`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Error declining adaptation:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get pending adaptations for a training plan.
 */
export async function getPendingAdaptations(
  trainingPlanId: string,
  userId: string
): Promise<PlanAdaptation[]> {
  try {
    console.log(`[getPendingAdaptations] Querying for plan ${trainingPlanId}, user ${userId}`);
    const startTime = Date.now();
    
    const result = await db
      .select()
      .from(planAdaptations)
      .innerJoin(
        trainingPlans,
        eq(planAdaptations.trainingPlanId, trainingPlans.id)
      )
      .where(
        and(
          eq(planAdaptations.trainingPlanId, trainingPlanId),
          eq(trainingPlans.userId, userId),
          // Only include rows where userAccepted is NULL (never responded)
          // Exclude declined (userAccepted = false) and accepted (userAccepted = true)
          isNull(planAdaptations.userAccepted)
        )
      );

    const elapsed = Date.now() - startTime;
    console.log(`[getPendingAdaptations] ✅ Query completed in ${elapsed}ms. Found ${result.length} results`);
    
    return result.map((r) => r.plan_adaptations);
  } catch (error) {
    console.error("[getPendingAdaptations] ❌ Error during query:", error);
    throw error;
  }
}
