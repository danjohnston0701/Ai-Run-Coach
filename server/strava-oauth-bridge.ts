/**
 * Strava OAuth Bridge - Backend Endpoint
 * 
 * Handles OAuth callback from Strava and redirects to mobile app
 * (Required because Strava only accepts HTTPS callbacks, not custom URL schemes)
 */

import express, { Request, Response } from 'express';
import { db } from './db';
import { sql, eq, and } from 'drizzle-orm';
import { connectedDevices, oauthStateStore } from '@shared/schema';
import { desc } from 'drizzle-orm';
import { authMiddleware, type AuthenticatedRequest } from './auth';

import {
  exchangeStravaCode,
  storeTokenTemporarily,
  retrieveTemporaryToken,
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

export default router;
