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
import { eq, and, gt } from "drizzle-orm";
import { PlanAdaptation, PlannedWorkout } from "@shared/schema";

interface AdaptationChanges {
  intensity?: "lower" | "higher";
  volume?: "reduce" | "increase";
  frequency?: "skip_day" | "add_easy_day";
  upcoming_workout_adjustments?: Array<{
    weekOffset: number;
    dayOffset: number;
    newIntensity?: string;
    newDescription?: string;
    skip?: boolean;
  }>;
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
        if (adjustment.skip) {
          // Mark workout as skipped (set intensity to "rest")
          const updated = await db
            .update(plannedWorkouts)
            .set({
              intensity: "rest",
              description: "Rest day (adapted)",
            })
            .where(
              and(
                eq(plannedWorkouts.trainingPlanId, trainingPlanId),
                eq(plannedWorkouts.weekNumber, adjustment.weekOffset + 1),
                eq(plannedWorkouts.dayOfWeek, adjustment.dayOffset)
              )
            );
          workoutsUpdated += 1;
        } else if (adjustment.newIntensity || adjustment.newDescription) {
          // Update workout intensity and/or description
          const updates: any = {};
          if (adjustment.newIntensity) updates.intensity = adjustment.newIntensity;
          if (adjustment.newDescription)
            updates.description = adjustment.newDescription;

          const updated = await db
            .update(plannedWorkouts)
            .set(updates)
            .where(
              and(
                eq(plannedWorkouts.trainingPlanId, trainingPlanId),
                eq(plannedWorkouts.weekNumber, adjustment.weekOffset + 1),
                eq(plannedWorkouts.dayOfWeek, adjustment.dayOffset)
              )
            );
          workoutsUpdated += 1;
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
        eq(planAdaptations.userAccepted, false)
      )
    );

  return result.map((r) => r.plan_adaptations);
}
