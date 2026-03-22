/**
 * Session Coaching Routes
 * 
 * Endpoints for dynamic session-specific coaching:
 * - Fetch session instructions for a workout
 * - Generate session instructions for a workout
 * - Log coaching events during a run
 */

import { Express, Response } from "express";
import { db } from "./db";
import { sessionInstructions, plannedWorkouts, coachingSessionEvents } from "../shared/schema";
import { eq } from "drizzle-orm";
import { generateSessionInstructions } from "./session-coaching-service";
import { AuthenticatedRequest } from "./types";

export function registerSessionCoachingRoutes(app: Express) {
  /**
   * GET /api/workouts/:workoutId/session-instructions
   * 
   * Fetch pre-generated session instructions for a planned workout.
   * Called before a run starts to get the coaching plan.
   */
  app.get(
    "/api/workouts/:workoutId/session-instructions",
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { workoutId } = req.params;

        // Get the workout
        const workout = await db
          .select()
          .from(plannedWorkouts)
          .where(eq(plannedWorkouts.id, workoutId))
          .then((rows) => rows[0]);

        if (!workout) {
          return res.status(404).json({ error: "Workout not found" });
        }

        // Get session instructions if they exist
        const instructions = await db
          .select()
          .from(sessionInstructions)
          .where(eq(sessionInstructions.plannedWorkoutId, workoutId))
          .then((rows) => rows[0]);

        if (!instructions) {
          return res.status(404).json({
            error: "Session instructions not found for this workout",
            note: "Instructions will be generated on next plan update",
          });
        }

        return res.json({
          workoutId,
          preRunBrief: instructions.preRunBrief,
          sessionStructure: instructions.sessionStructure,
          coachingStyle: instructions.coachingStyle,
          insightFilters: instructions.insightFilters,
          aiDeterminedTone: instructions.aiDeterminedTone,
          aiDeterminedIntensity: instructions.aiDeterminedIntensity,
          toneReasoning: instructions.toneReasoning,
        });
      } catch (error) {
        console.error("Error fetching session instructions:", error);
        res.status(500).json({ error: "Failed to fetch session instructions" });
      }
    }
  );

  /**
   * POST /api/workouts/:workoutId/regenerate-session-instructions
   * 
   * Force regeneration of session instructions for a workout.
   * Useful if user profile changes or you want to update coaching.
   */
  app.post(
    "/api/workouts/:workoutId/regenerate-session-instructions",
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { workoutId } = req.params;
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        // Get the workout with full context
        const workout = await db
          .select()
          .from(plannedWorkouts)
          .where(eq(plannedWorkouts.id, workoutId))
          .then((rows) => rows[0]);

        if (!workout) {
          return res.status(404).json({ error: "Workout not found" });
        }

        // Regenerate session instructions
        const coaching = await generateSessionInstructions(userId, workoutId, {
          userId,
          plannedWorkoutId: workoutId,
          workoutType: workout.workoutType || "easy",
          intensity: workout.intensity || "z3",
          sessionGoal: workout.sessionGoal,
          sessionIntent: workout.sessionIntent,
          intervalCount: workout.intervalCount || undefined,
          distance: workout.distance || undefined,
          duration: workout.duration || undefined,
        });

        // Update or create session instructions
        const existing = await db
          .select()
          .from(sessionInstructions)
          .where(eq(sessionInstructions.plannedWorkoutId, workoutId))
          .then((rows) => rows[0]);

        if (existing) {
          // Update existing
          await db
            .update(sessionInstructions)
            .set({
              preRunBrief: coaching.preRunBrief,
              sessionStructure: coaching.sessionStructure,
              aiDeterminedTone: coaching.aiDeterminedTone,
              aiDeterminedIntensity: coaching.aiDeterminedIntensity,
              coachingStyle: coaching.coachingStyle,
              insightFilters: coaching.insightFilters,
              toneReasoning: coaching.toneReasoning,
              updatedAt: new Date(),
            })
            .where(eq(sessionInstructions.plannedWorkoutId, workoutId));
        } else {
          // Create new
          await db.insert(sessionInstructions).values({
            plannedWorkoutId: workoutId,
            preRunBrief: coaching.preRunBrief,
            sessionStructure: coaching.sessionStructure,
            aiDeterminedTone: coaching.aiDeterminedTone,
            aiDeterminedIntensity: coaching.aiDeterminedIntensity,
            coachingStyle: coaching.coachingStyle,
            insightFilters: coaching.insightFilters,
            toneReasoning: coaching.toneReasoning,
          });
        }

        return res.json({
          success: true,
          message: "Session instructions regenerated",
          coachingStyle: coaching.coachingStyle,
          tone: coaching.aiDeterminedTone,
          reasoning: coaching.toneReasoning,
        });
      } catch (error) {
        console.error("Error regenerating session instructions:", error);
        res.status(500).json({ error: "Failed to regenerate session instructions" });
      }
    }
  );

  /**
   * POST /api/coaching/session-events
   * 
   * Log a coaching event during an active run.
   * Used to track what coaching was delivered and how the user engaged with it.
   */
  app.post(
    "/api/coaching/session-events",
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const {
          runId,
          plannedWorkoutId,
          eventType,
          eventPhase,
          coachingMessage,
          coachingAudioUrl,
          userMetrics,
          toneUsed,
          userEngagement,
        } = req.body;

        if (!runId || !eventType) {
          return res
            .status(400)
            .json({ error: "runId and eventType are required" });
        }

        // Log the coaching event
        await db.insert(coachingSessionEvents).values({
          runId,
          plannedWorkoutId,
          eventType,
          eventPhase,
          coachingMessage,
          coachingAudioUrl,
          userMetrics,
          toneUsed,
          userEngagement,
        });

        return res.json({ success: true, message: "Coaching event logged" });
      } catch (error) {
        console.error("Error logging coaching session event:", error);
        res.status(500).json({ error: "Failed to log coaching event" });
      }
    }
  );

  /**
   * GET /api/coaching/session-events/:runId
   * 
   * Fetch all coaching events for a completed run.
   * Used for post-run analysis and to understand coaching effectiveness.
   */
  app.get(
    "/api/coaching/session-events/:runId",
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { runId } = req.params;

        const events = await db
          .select()
          .from(coachingSessionEvents)
          .where(eq(coachingSessionEvents.runId, runId));

        return res.json({ runId, events, count: events.length });
      } catch (error) {
        console.error("Error fetching coaching session events:", error);
        res.status(500).json({ error: "Failed to fetch coaching events" });
      }
    }
  );
}
