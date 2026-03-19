/**
 * Training Plan Adaptation Routes
 * 
 * Endpoints for accepting/declining AI-suggested adaptations.
 * Integration with adaptation-service.ts
 */

import { Router, Request, Response } from "express";
import { AuthenticatedRequest, authMiddleware } from "./middleware";
import {
  acceptAndApplyAdaptation,
  declineAdaptation,
  getPendingAdaptations,
} from "./adaptation-service";

const router = Router();

/**
 * POST /api/training-plans/adaptations/:adaptationId/accept
 * Accept and apply a plan adaptation to future workouts.
 */
router.post(
  "/training-plans/adaptations/:adaptationId/accept",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { adaptationId } = req.params;
      const userId = req.user!.id;

      const result = await acceptAndApplyAdaptation(adaptationId, userId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        message: `Adaptation accepted and applied to ${result.workoutsUpdated} workouts`,
        workoutsUpdated: result.workoutsUpdated,
      });
    } catch (error) {
      console.error("[Adaptation Accept]", error);
      res.status(500).json({ error: "Failed to accept adaptation" });
    }
  }
);

/**
 * POST /api/training-plans/adaptations/:adaptationId/decline
 * Decline a plan adaptation without applying it.
 */
router.post(
  "/training-plans/adaptations/:adaptationId/decline",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { adaptationId } = req.params;
      const userId = req.user!.id;

      const result = await declineAdaptation(adaptationId, userId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, message: "Adaptation declined" });
    } catch (error) {
      console.error("[Adaptation Decline]", error);
      res.status(500).json({ error: "Failed to decline adaptation" });
    }
  }
);

/**
 * GET /api/training-plans/:planId/adaptations/pending
 * Get all pending adaptations for a training plan.
 */
router.get(
  "/training-plans/:planId/adaptations/pending",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const userId = req.user!.id;

      const adaptations = await getPendingAdaptations(planId, userId);

      res.json({
        adaptations,
        count: adaptations.length,
      });
    } catch (error) {
      console.error("[Get Pending Adaptations]", error);
      res.status(500).json({ error: "Failed to fetch adaptations" });
    }
  }
);

export default router;
