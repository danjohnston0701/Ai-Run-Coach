/**
 * My Data Analytics Routes
 * 
 * GET /api/my-data/personal-bests - Get personal records
 * GET /api/my-data/statistics - Get period statistics
 * GET /api/my-data/trends - Get performance trends
 * GET /api/my-data/all-time-stats - Get all-time achievements
 */

import { Router, Request, Response } from 'express';
import { AuthenticatedRequest, authMiddleware } from './auth';
import myDataService from './my-data-service';
import { recomputeForUser } from './user-stats-cache';
import { refreshRunnerProfile, getRunnerProfile } from './runner-profile-service';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/my-data/personal-bests
 * Get personal records for common distances
 */
router.get('/personal-bests', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const personalBests = await myDataService.getPersonalBests(userId);

    // Wrap array in object so Android Map<String, Any> deserialization works correctly
    res.json({
      success: true,
      data: { personalBests },
    });
  } catch (error: any) {
    console.error('Error getting personal bests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch personal bests',
      message: error.message,
    });
  }
});

/**
 * GET /api/my-data/statistics
 * Get aggregated statistics for a time period (default 30 days)
 * Query: days (optional) - number of days to look back
 */
router.get('/statistics', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days as string) || 30;

    const stats = await myDataService.getPeriodStatistics(userId, days);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error getting period statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message,
    });
  }
});

/**
 * GET /api/my-data/trends
 * Get performance trends across time periods
 */
router.get('/trends', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const trends = await myDataService.getDetailedTrends(userId, 30);

    res.json({
      success: true,
      data: trends,
    });
  } catch (error: any) {
    console.error('Error getting performance trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trends',
      message: error.message,
    });
  }
});

/**
 * GET /api/my-data/detailed-trends
 * Get run-by-run trend data for a specific time period
 * Query: days (optional) - number of days to look back (default 30)
 */
router.get('/detailed-trends', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days as string) || 30;

    const trends = await myDataService.getDetailedTrends(userId, days);

    res.json({
      success: true,
      data: trends,
    });
  } catch (error: any) {
    console.error('Error getting detailed trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch detailed trends',
      message: error.message,
    });
  }
});

/**
 * GET /api/my-data/all-time-stats
 * Get all-time achievements and statistics
 */
router.get('/all-time-stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await myDataService.getAllTimeStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error getting all-time stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all-time stats',
      message: error.message,
    });
  }
});

/**
 * GET /api/my-data/coaching-summary
 * Coaching-plan-specific analytics:
 *  - session count, target achievement rate, intensity/type breakdown
 *  - progression trend (improving/declining/stable)
 *  - best coaching run in period
 * Query: days (optional, default 90) — number of days to look back
 */
router.get('/coaching-summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const days = parseInt(req.query.days as string) || 90;
    const summary = await myDataService.getCoachingPlanSummary(userId, days);

    res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('[CoachingSummary] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch coaching summary', message: error.message });
  }
});

/**
 * GET /api/my-data/runner-profile
 * Return the current AI runner profile ("What I know about you") for the
 * authenticated user.  Returns null if not yet generated.
 */
router.get('/runner-profile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const profile = await getRunnerProfile(userId);

    res.json({ success: true, data: { profile } });
  } catch (error: any) {
    console.error('[RunnerProfile] GET error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch runner profile', message: error.message });
  }
});

/**
 * POST /api/my-data/refresh-runner-profile
 * Trigger an immediate (awaited) regeneration of the AI runner profile.
 * Useful after onboarding, goal changes, or injury updates — or for testing.
 */
router.post('/refresh-runner-profile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await refreshRunnerProfile(userId);
    const profile = await getRunnerProfile(userId);

    res.json({ success: true, data: { profile } });
  } catch (error: any) {
    console.error('[RunnerProfile] Refresh error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh runner profile', message: error.message });
  }
});

/**
 * POST /api/my-data/reset-cache
 * Force a full recompute of the user's stats cache.
 * Useful when cached values are stale (e.g. after a data migration or bug fix).
 *
 * POST /api/my-data/admin/recompute-all
 * Admin-only: recompute stats for EVERY user.
 * Call this after deploying user-stats-cache.ts fixes to correct historical data.
 */
router.post('/reset-cache', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[MyData] Force recomputing stats cache for user ${userId}`);
    await recomputeForUser(userId);

    res.json({
      success: true,
      message: 'Stats cache recomputed successfully',
    });
  } catch (error: any) {
    console.error('Error resetting stats cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset stats cache',
      message: error.message,
    });
  }
});

/**
 * POST /api/my-data/admin/recompute-all
 * Admin-only: recomputes user_stats for every user in the system.
 * Safe to call multiple times — fully idempotent.
 *
 * Use this after:
 *   - Deploying unit-fix changes to user-stats-cache.ts
 *   - Discovering corrupted totals (e.g. wrong distance/PB units)
 *   - Adding new PB distance categories
 */
router.post('/admin/recompute-all', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch requesting user and check admin flag
    const [requestingUser] = await db.select({ isAdmin: (users as any).isAdmin }).from(users).where(eq((users as any).id, userId));
    if (!requestingUser?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get all distinct user IDs that have runs
    const allUsers = await db.selectDistinct({ id: (users as any).id }).from(users);
    const userIds = allUsers.map(u => u.id as string).filter(Boolean);

    console.log(`[MyData][Admin] Recomputing stats for ${userIds.length} users...`);

    let successCount = 0;
    let errorCount   = 0;
    const errors: string[] = [];

    for (const uid of userIds) {
      try {
        await recomputeForUser(uid);
        successCount++;
      } catch (err: any) {
        errorCount++;
        errors.push(`${uid}: ${err.message}`);
        console.error(`[MyData][Admin] Failed for user ${uid}:`, err.message);
      }
    }

    console.log(`[MyData][Admin] Recompute complete — ${successCount} ok, ${errorCount} errors`);
    res.json({
      success: true,
      total:   userIds.length,
      ok:      successCount,
      errors:  errorCount,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[MyData][Admin] Recompute-all failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
