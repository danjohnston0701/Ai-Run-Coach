/**
 * Strava OAuth Bridge - Backend Endpoint
 * 
 * Handles OAuth callback from Strava and redirects to mobile app
 * (Required because Strava only accepts HTTPS callbacks, not custom URL schemes)
 */

import express, { Request, Response } from 'express';
import { db } from './db';
import { sql, eq, and } from 'drizzle-orm';
import { connectedDevices, oauthStateStore, runs } from '@shared/schema';
import { desc } from 'drizzle-orm';
import { authMiddleware, type AuthenticatedRequest } from './auth';
import axios from 'axios';

import {
  exchangeStravaCode,
  storeTokenTemporarily,
  retrieveTemporaryToken,
  refreshStravaToken,
} from './strava-oauth-service';

const router = express.Router();

/**
 * POST /api/strava/auth/authorize - Initiate OAuth flow
 * Generates auth URL and stores state in database
 */
router.post('/api/strava/auth/authorize', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const {
      generateOAuthState,
      buildStravaAuthUrl,
    } = await import('./strava-oauth-service');

    const state = generateOAuthState();

    // Store state in database for validation
    await db
      .insert(oauthStateStore)
      .values({
        state,
        userId,
        provider: 'strava',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      })
      .catch(() => {}); // Ignore duplicate key errors

    const authUrl = buildStravaAuthUrl(state);
    console.log('[Strava Auth] Auth URL built. redirect_uri used:', new URL(authUrl).searchParams.get('redirect_uri'));
    console.log('[Strava Auth] client_id used:', new URL(authUrl).searchParams.get('client_id'));
    res.json({ authUrl, state });
  } catch (error: any) {
    console.error('[Strava Auth] Error:', error.message);
    res.status(500).json({ error: 'Failed to initiate Strava auth' });
  }
});

/**
 * GET /strava/callback - Handle Strava OAuth callback
 * Strava redirects here after user grants permissions
 */
router.get('/strava/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  console.log('[Strava Callback] Received:', { code, state, error });

  // Handle user denial
  if (error) {
    return res.redirect(
      `airuncoach://strava/auth-complete?success=false&error=${encodeURIComponent(
        error_description || error
      )}`
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return res.redirect(
      'airuncoach://strava/auth-complete?success=false&error=missing_parameters'
    );
  }

  try {
    // Verify state exists and retrieve user ID
    const [stateRecord] = await db
      .select()
      .from(oauthStateStore)
      .where(eq(oauthStateStore.state, state as string));

    if (!stateRecord) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    const userId = stateRecord.userId;

    // Exchange code for access token
    const { accessToken, refreshToken, athleteId, athleteName, expiresAt } =
      await exchangeStravaCode(code as string);

    console.log(`[Strava Callback] Exchange successful for: ${athleteName}`);

    // Check if device already connected
    const [existingDevice] = await db
      .select()
      .from(connectedDevices)
      .where(
        and(
          eq(connectedDevices.userId, userId),
          eq(connectedDevices.deviceType, 'strava')
        )
      );

    const deviceId = `strava-${athleteId}`;

    if (existingDevice) {
      // Update existing connection
      await db
        .update(connectedDevices)
        .set({
          accessToken,
          refreshToken,
          tokenExpiresAt: expiresAt,
          deviceId,
          deviceName: `Strava - ${athleteName}`,
          lastSyncAt: new Date(),
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(connectedDevices.id, existingDevice.id));

      console.log('[Strava Callback] Updated existing device');
    } else {
      // Create new connection
      await db.insert(connectedDevices).values({
        userId,
        deviceType: 'strava',
        deviceId,
        deviceName: `Strava - ${athleteName}`,
        accessToken,
        refreshToken,
        tokenExpiresAt: expiresAt,
        isActive: true,
      });

      console.log('[Strava Callback] Created new device');
    }

    // Clean up state
    await db
      .delete(oauthStateStore)
      .where(eq(oauthStateStore.state, state as string));

    // Redirect to app with success
    res.redirect('airuncoach://strava/auth-complete?success=true');
  } catch (error: any) {
    console.error('[Strava Callback] Error:', error.message);
    res.redirect(
      `airuncoach://strava/auth-complete?success=false&error=${encodeURIComponent(
        error.message
      )}`
    );
  }
});

/**
 * POST /api/strava/disconnect - Disconnect Strava account
 * Marks device as inactive and deauthorizes with Strava
 */
router.post('/api/strava/disconnect', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [device] = await db
      .select()
      .from(connectedDevices)
      .where(
        and(
          eq(connectedDevices.userId, userId),
          eq(connectedDevices.deviceType, 'strava')
        )
      );

    if (!device) {
      return res.status(404).json({ error: 'Strava not connected' });
    }

    // Deauthorize with Strava
    if (device.accessToken) {
      try {
        const { deregisterFromStrava } = await import('./strava-upload-service');
        await deregisterFromStrava(device.accessToken);
      } catch (error) {
        console.warn('[Strava Disconnect] Deregistration failed (non-fatal):', error);
      }
    }

    // Mark device as inactive
    await db
      .update(connectedDevices)
      .set({ isActive: false })
      .where(eq(connectedDevices.id, device.id));

    res.json({ success: true, message: 'Strava disconnected' });
  } catch (error: any) {
    console.error('[Strava Disconnect] Error:', error.message);
    res.status(500).json({ error: 'Failed to disconnect Strava' });
  }
});

/**
 * POST /api/strava/import-history - Import historic Strava runs into our runs table
 * 
 * Fetches the user's Strava activities (runs only, last 90 days by default) and
 * imports them into the runs table so the AI coaching engine can use them as
 * baseline training data.
 */
router.post('/api/strava/import-history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

  // How far back to import — default 90 days, max 365
  const daysBack = Math.min(parseInt(req.body?.days ?? '90'), 365);
  const afterEpoch = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);

  try {
    // Get the user's Strava device record
    const [device] = await db
      .select()
      .from(connectedDevices)
      .where(
        and(
          eq(connectedDevices.userId, userId),
          eq(connectedDevices.deviceType, 'strava'),
          eq(connectedDevices.isActive, true)
        )
      );

    if (!device) {
      return res.status(404).json({ success: false, error: 'Strava not connected' });
    }

    // Refresh token if expired
    let accessToken = device.accessToken!;
    if (device.tokenExpiresAt && new Date(device.tokenExpiresAt) < new Date()) {
      console.log('[Strava Import] Token expired, refreshing…');
      const refreshed = await refreshStravaToken(device.refreshToken!);
      accessToken = refreshed.accessToken;
      await db.update(connectedDevices).set({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.expiresAt,
        updatedAt: new Date(),
      }).where(eq(connectedDevices.id, device.id));
    }

    // Fetch activities from Strava — paginate up to 200 activities
    let allActivities: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await axios.get(`${STRAVA_API_BASE}/athlete/activities`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          after: afterEpoch,
          per_page: perPage,
          page,
        },
      });

      const activities: any[] = response.data;
      if (!activities || activities.length === 0) break;

      allActivities = allActivities.concat(activities);
      if (activities.length < perPage) break;
      page++;
    }

    // Filter to runs only (Strava type "Run" or sport_type "Run")
    const runActivities = allActivities.filter(
      a => a.type === 'Run' || a.sport_type === 'Run'
    );

    console.log(`[Strava Import] Found ${runActivities.length} runs out of ${allActivities.length} activities for user ${userId}`);

    let imported = 0;
    let skipped = 0;

    for (const activity of runActivities) {
      const stravaId = String(activity.id);

      // Skip if already imported (by externalId)
      const [existing] = await db
        .select({ id: runs.id })
        .from(runs)
        .where(
          and(
            eq(runs.userId, userId),
            eq(runs.externalId, stravaId),
            eq(runs.externalSource, 'strava')
          )
        );

      if (existing) {
        skipped++;
        continue;
      }

      // Map Strava activity fields to our runs schema
      const distanceKm = (activity.distance ?? 0) / 1000; // metres → km
      const durationSec = activity.moving_time ?? activity.elapsed_time ?? 0;
      const avgPaceSecPerKm = distanceKm > 0 ? Math.round(durationSec / distanceKm) : null;
      const avgPaceFormatted = avgPaceSecPerKm
        ? `${Math.floor(avgPaceSecPerKm / 60)}:${String(avgPaceSecPerKm % 60).padStart(2, '0')}`
        : null;

      const startDate = activity.start_date
        ? new Date(activity.start_date)
        : new Date();

      await db.insert(runs).values({
        userId,
        externalId: stravaId,
        externalSource: 'strava',
        name: activity.name ?? 'Strava Run',
        distance: distanceKm,
        duration: durationSec * 1000, // store in ms to match app convention
        avgPace: avgPaceFormatted ?? undefined,
        avgHeartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
        maxHeartRate: activity.max_heartrate ? Math.round(activity.max_heartrate) : undefined,
        calories: activity.calories ?? undefined,
        cadence: activity.average_cadence ? Math.round(activity.average_cadence * 2) : undefined, // Strava gives steps/min per leg
        elevation: activity.total_elevation_gain ?? undefined,
        elevationGain: activity.total_elevation_gain ?? undefined,
        startLat: activity.start_latlng?.[0] ?? undefined,
        startLng: activity.start_latlng?.[1] ?? undefined,
        movingTime: durationSec,
        elapsedTime: activity.elapsed_time ?? durationSec,
        avgSpeed: activity.average_speed ?? undefined,
        maxSpeed: activity.max_speed ?? undefined,
        completedAt: startDate,
        runDate: startDate.toISOString().split('T')[0],
      });

      imported++;
    }

    console.log(`[Strava Import] Imported ${imported}, skipped ${skipped} (already existed) for user ${userId}`);

    // Update lastSyncAt on the device record
    await db.update(connectedDevices).set({
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(connectedDevices.id, device.id));

    res.json({
      success: true,
      imported,
      skipped,
      message: `Imported ${imported} run${imported !== 1 ? 's' : ''} from Strava${skipped > 0 ? ` (${skipped} already existed)` : ''}`,
    });
  } catch (error: any) {
    console.error('[Strava Import] Error:', error.response?.data ?? error.message);
    res.status(500).json({
      success: false,
      imported: 0,
      error: 'Failed to import Strava history',
    });
  }
});

export default router;
