// Samsung Galaxy Watch Companion App Routes
// Mirrors Garmin companion routes for Samsung Tizen watch communication

import type { Express, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { authMiddleware, type AuthenticatedRequest } from './auth';
import { storage } from './storage';
import { garminCompanionSessions, garminRealtimeData, users } from '@shared/schema';
import { DateTime } from 'luxon';
import { generateToken } from './auth';

interface SamsungWatchSession {
  sessionId: string;
  userId: string;
  startTime: number;
  isActive: boolean;
  lastDataPoint?: number;
}

interface WatchMetrics {
  heartRate: number;
  heartRateZone: number;
  distance: number;
  pace: number;
  cadence: number;
  elapsedTime: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

// Store active Samsung watch sessions in memory (with periodic flush to DB)
const activeSamsungSessions = new Map<string, SamsungWatchSession>();

export async function registerSamsungCompanionRoutes(app: Express) {
  // ── Authentication & Session Management ──

  /**
   * POST /api/samsung-companion/auth
   * Samsung watch requests auth token
   */
  app.post('/api/samsung-companion/auth', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Generate session ID for this watch
      const sessionId = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

      // Store session metadata
      const session: SamsungWatchSession = {
        sessionId,
        userId,
        startTime: Date.now(),
        isActive: true,
      };

      activeSamsungSessions.set(sessionId, session);

      // Get runner info
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const runnerName = user[0]?.displayName || 'Runner';

      console.log(`✓ Samsung watch authenticated: ${sessionId} (${runnerName})`);

      res.json({
        sessionId,
        authToken: req.user?.id, // Use user ID as token for watch
        runnerName,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error('Samsung auth failed:', e);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  /**
   * POST /api/samsung-companion/session/start
   * Samsung watch starts a running session
   */
  app.post('/api/samsung-companion/session/start', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const sessionId = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

      // Create session record in the shared garminCompanionSessions table
      await db.insert(garminCompanionSessions).values({
        sessionId,
        userId,
        deviceModel: 'Samsung Galaxy Watch', // Identifies as Samsung
        activityType: 'running',
        status: 'active',
        startedAt: new Date(),
        dataPointCount: 0,
      });

      // Track in memory for real-time updates
      activeSamsungSessions.set(sessionId, {
        sessionId,
        userId,
        startTime: Date.now(),
        isActive: true,
      });

      console.log(`▶️ Samsung watch session started: ${sessionId}`);

      res.json({
        sessionId,
        success: true,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error('Samsung session start failed:', e);
      res.status(500).json({ error: 'Failed to start session' });
    }
  });

  /**
   * POST /api/samsung-companion/data
   * Samsung watch sends real-time run metrics (1 Hz)
   */
  app.post('/api/samsung-companion/data', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId, timestamp, metrics } = req.body as {
        sessionId: string;
        timestamp: number;
        metrics: WatchMetrics;
      };

      if (!sessionId || !metrics) {
        return res.status(400).json({ error: 'Missing sessionId or metrics' });
      }

      const session = activeSamsungSessions.get(sessionId);
      if (!session) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Update session last seen
      session.lastDataPoint = timestamp;

      // Store metrics in realtime data table
      await db.insert(garminRealtimeData).values({
        sessionId,
        userId: session.userId,
        timestamp: new Date(timestamp),
        heartRate: metrics.heartRate,
        heartRateZone: metrics.heartRateZone,
        cumulativeDistance: metrics.distance, // schema uses cumulativeDistance
        pace: metrics.pace,
        cadence: metrics.cadence,
        elapsedTime: metrics.elapsedTime,
        latitude: metrics.latitude,
        longitude: metrics.longitude,
        altitude: metrics.altitude,
        source: 'samsung_watch', // new column — see migration SQL
      });

      // Log every 10 data points to reduce noise
      if ((session.lastDataPoint || 0) % 10000 === 0) {
        console.log(
          `📊 Samsung data: HR=${metrics.heartRate} Pace=${metrics.pace.toFixed(0)}s Dist=${(metrics.distance / 1000).toFixed(2)}km`
        );
      }

      res.json({
        success: true,
        received: timestamp,
      });
    } catch (e) {
      console.error('Samsung data stream failed:', e);
      res.status(500).json({ error: 'Failed to store metrics' });
    }
  });

  /**
   * POST /api/samsung-companion/session/end
   * Samsung watch ends the running session
   */
  app.post('/api/samsung-companion/session/end', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.body as { sessionId: string };
      if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
      }

      const session = activeSamsungSessions.get(sessionId);
      if (!session) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Fetch all metrics for this session
      const metrics = await db
        .select()
        .from(garminRealtimeData)
        .where(eq(garminRealtimeData.sessionId, sessionId));

      // Calculate stats (schema uses cumulativeDistance, not distance)
      const lastMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;
      const totalDistance = lastMetric?.cumulativeDistance || 0;
      const totalDuration = lastMetric?.elapsedTime || 0;
      const heartRates = metrics.map((m) => m.heartRate || 0).filter((hr) => hr > 0);
      const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b) / heartRates.length) : 0;
      const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : 0;

      // Update session record using correct schema column names
      await db
        .update(garminCompanionSessions)
        .set({
          endedAt: new Date(),
          status: 'completed',
          totalDistance,
          totalDuration,
          avgHeartRate,
          maxHeartRate,
        })
        .where(eq(garminCompanionSessions.sessionId, sessionId));

      // Remove from memory
      activeSamsungSessions.delete(sessionId);

      console.log(
        `⏹️ Samsung watch session ended: ${sessionId} | ${(totalDistance / 1000).toFixed(2)}km | ${totalTime.toFixed(0)}s | HR: ${avgHeartRate} bpm`
      );

      res.json({
        success: true,
        stats: {
          distance: totalDistance,
          time: totalTime,
          avgHeartRate,
          maxHeartRate,
          metricsCount: metrics.length,
        },
      });
    } catch (e) {
      console.error('Samsung session end failed:', e);
      res.status(500).json({ error: 'Failed to end session' });
    }
  });

  /**
   * GET /api/samsung-companion/status
   * Check Samsung watch connectivity and session status
   */
  app.get('/api/samsung-companion/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Find active sessions for this user
      const userSessions = Array.from(activeSamsungSessions.values()).filter((s) => s.userId === userId);

      res.json({
        connected: userSessions.length > 0,
        activeSessions: userSessions.length,
        sessions: userSessions.map((s) => ({
          sessionId: s.sessionId,
          startTime: s.startTime,
          lastDataPoint: s.lastDataPoint,
          isActive: s.isActive,
        })),
      });
    } catch (e) {
      console.error('Samsung status check failed:', e);
      res.status(500).json({ error: 'Failed to check status' });
    }
  });

  /**
   * POST /api/samsung-companion/coaching-cue
   * Send AI coaching cue to watch
   */
  app.post('/api/samsung-companion/coaching-cue', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId, cue, audioUrl } = req.body as { sessionId: string; cue: string; audioUrl?: string };

      if (!sessionId || !cue) {
        return res.status(400).json({ error: 'Missing sessionId or cue' });
      }

      const session = activeSamsungSessions.get(sessionId);
      if (!session) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // In a real implementation, this would send a push notification or message to the watch
      console.log(`💡 Coaching cue for Samsung watch: "${cue}"`);

      res.json({
        success: true,
        sent: true,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error('Coaching cue send failed:', e);
      res.status(500).json({ error: 'Failed to send coaching cue' });
    }
  });

  console.log('✓ Samsung Companion routes registered');
}
