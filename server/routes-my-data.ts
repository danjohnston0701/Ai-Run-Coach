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

const router = Router();

/**
 * GET /api/my-data/personal-bests
 * Get personal records for common distances
 */
router.get('/personal-bests', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
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
    const userId = req.user?.id;
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
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const trends = await myDataService.getPerformanceTrends(userId);

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
    const userId = req.user?.id;
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
    const userId = req.user?.id;
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

export default router;
