/**
 * Run Achievements API Routes
 * 
 * POST /api/runs/:runId/achievements - Calculate and return achievements for a completed run
 * GET /api/users/:userId/achievements - Get all achievements for a user
 */

import { Router, Request, Response } from 'express';
import { AuthenticatedRequest, authMiddleware } from './auth';
import achievementsService from './achievements-service';
import { db } from './db';
import { runs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

/**
 * POST /api/runs/:runId/achievements
 * Calculate achievements for a run (called after run is saved)
 */
router.post('/runs/:runId/achievements', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const runId = req.params.runId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch the run
    const runData = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
      .limit(1);

    if (runData.length === 0) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const run = runData[0];

    // Calculate achievements
    const achievements = await achievementsService.calculateRunAchievements(
      userId,
      runId,
      run.distance || 0,
      run.avgPace,
      run.kmSplits
    );

    res.json({
      success: true,
      data: {
        achievements,
        count: achievements.length,
      },
    });
  } catch (error: any) {
    console.error('Error calculating run achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate achievements',
      message: error.message,
    });
  }
});

/**
 * GET /api/users/:userId/achievements
 * Get all achievements for a user (for leaderboard/profile view)
 */
router.get('/users/:userId/achievements', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokenUserId = req.user?.id;
    const requestedUserId = req.params.userId;

    // Users can only view their own achievements or public achievements
    if (tokenUserId !== requestedUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get all runs for the user
    const userRuns = await db
      .select()
      .from(runs)
      .where(eq(runs.userId, requestedUserId));

    const achievementsCounts: Record<string, number> = {
      PERSONAL_BEST_1K: 0,
      PERSONAL_BEST_1_MILE: 0,
      PERSONAL_BEST_5K: 0,
      PERSONAL_BEST_10K: 0,
      PERSONAL_BEST_HALF_MARATHON: 0,
      PERSONAL_BEST_MARATHON: 0,
      FASTEST_KM: 0,
      FASTEST_MILE: 0,
    };

    // For simplicity, we're returning achievement counts
    // In a production system, you'd store achievements separately and query them
    res.json({
      success: true,
      data: {
        achievementsCounts,
        totalRuns: userRuns.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching user achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch achievements',
      message: error.message,
    });
  }
});

export default router;
