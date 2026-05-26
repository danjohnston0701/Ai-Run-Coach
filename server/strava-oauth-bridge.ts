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

// ── App deep-link redirect helper ─────────────────────────────────────────────
//
// Chrome on Android blocks bare `airuncoach://` redirects that arrive via an
// HTTP Location header (security policy since Chrome 25).  To reliably open the
// app we serve a tiny HTML page that fires two attempts:
//
//   1. intent:// URI  — Chrome's native "open in app" mechanism, works in any
//      Chrome version and respects the registered intent-filter in the manifest.
//
//   2. window.location fallback  — fires 100 ms later for non-Chrome browsers
//      (Firefox, Samsung Internet, in-app WebViews) which support the plain
//      airuncoach:// scheme but don't understand intent://.
//
// The app's ON_RESUME lifecycle observer in ConnectedDevicesScreen acts as a
// second safety net: even if both redirects fail (e.g. split-screen edge cases),
// the status is refreshed as soon as the user switches back to the app.
//
function sendAppRedirect(res: any, success: boolean, error?: string): void {
  const params = success
    ? 'success=true'
    : `success=false&error=${error ?? 'unknown'}`;

  // intent:// URI — understood by Chrome on Android
  const intentUri = `intent://strava/auth-complete?${params}#Intent;scheme=airuncoach;package=live.airuncoach.airuncoach;S.browser_fallback_url=https%3A%2F%2Fairuncoach.live;end`;

  // Plain custom-scheme URI — works in most non-Chrome browsers
  const customUri = `airuncoach://strava/auth-complete?${params}`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${success ? 'Connected!' : 'Connection failed'} — Ai Run Coach</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center;
           align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
    .card { text-align: center; padding: 2rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    p { color: #aaa; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h2>${success ? 'Strava connected!' : 'Connection failed'}</h2>
    <p>Returning to Ai Run Coach…</p>
  </div>
  <script>
    // Chrome on Android: use intent:// scheme
    var ua = navigator.userAgent;
    if (/android/i.test(ua) && /chrome/i.test(ua)) {
      window.location.href = '${intentUri}';
    } else {
      window.location.href = '${customUri}';
    }
    // Fallback: if the page is still visible after 1.5s the redirect failed
    setTimeout(function() {
      window.location.href = '${customUri}';
    }, 1500);
  </script>
</body>
</html>`);
}

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
    return sendAppRedirect(res, false, encodeURIComponent(String(error_description || error)));
  }

  // Validate required parameters
  if (!code || !state) {
    return sendAppRedirect(res, false, 'missing_parameters');
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

    // Redirect to app with success.
    // Chrome on Android blocks bare `airuncoach://` redirects from server Location headers.
    // Serve an HTML page that uses the intent:// scheme (Chrome's way of launching apps),
    // with a fallback to the standard custom-scheme URI for other browsers.
    sendAppRedirect(res, true);
  } catch (error: any) {
    console.error('[Strava Callback] Error:', error.message);
    sendAppRedirect(res, false, encodeURIComponent(error.message));
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

// ── Strava Webhook ──────────────────────────────────────────────────────────
//
// Strava requires a webhook subscription to:
//   • Know when an athlete deauthorizes the app (mandatory per API Terms)
//   • Receive new activity events without polling (rate-limit friendly)
//   • Know when activities change visibility (private/public)
//
// Setup:
//   1. Set STRAVA_WEBHOOK_VERIFY_TOKEN in Replit Secrets (any private string you choose)
//   2. Deploy the server — the GET /strava/webhook endpoint must respond within 2 s
//   3. Call POST /api/strava/webhook/register once (or use the startup auto-register below)
//   4. Strava will validate the endpoint and begin sending events to POST /strava/webhook
//
// The callback URL used is:  https://airuncoach.live/strava/webhook
// (override with STRAVA_WEBHOOK_CALLBACK_URL env var if needed)

const STRAVA_WEBHOOK_VERIFY_TOKEN =
  process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? 'airuncoach_webhook_verify';

const STRAVA_WEBHOOK_CALLBACK_URL =
  process.env.STRAVA_WEBHOOK_CALLBACK_URL ??
  `${process.env.SITE_URL ?? 'https://airuncoach.live'}/strava/webhook`;

const STRAVA_PUSH_SUBSCRIPTIONS_URL = 'https://www.strava.com/api/v3/push_subscriptions';

// ── Webhook Validation (GET) ─────────────────────────────────────────────────
// Strava sends a GET to the callback URL when creating a subscription.
// We must echo hub.challenge within 2 seconds.
router.get('/strava/webhook', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[Strava Webhook] Validation request received:', { mode, token, challenge });

  if (mode === 'subscribe' && token === STRAVA_WEBHOOK_VERIFY_TOKEN) {
    console.log('[Strava Webhook] ✅ Subscription validated');
    return res.json({ 'hub.challenge': challenge });
  }

  console.warn('[Strava Webhook] ❌ Validation failed — verify_token mismatch or wrong mode');
  return res.status(403).json({ error: 'Forbidden' });
});

// ── Webhook Event Handler (POST) ─────────────────────────────────────────────
// Strava sends a POST for every event.  We must respond 200 within 2 seconds,
// then process the event asynchronously to avoid timeout retries.
router.post('/strava/webhook', (req: Request, res: Response) => {
  // Acknowledge immediately — Strava retries 3 times if it doesn't get a 200
  res.sendStatus(200);

  const event = req.body;
  console.log('[Strava Webhook] Event received:', JSON.stringify(event));

  // Process asynchronously so we never hold up the 200 response
  processStravaWebhookEvent(event).catch((err: Error) =>
    console.error('[Strava Webhook] Event processing error:', err.message)
  );
});

async function processStravaWebhookEvent(event: any): Promise<void> {
  const { object_type, aspect_type, object_id, owner_id, updates } = event;

  // ── Athlete deauthorization ────────────────────────────────────────────────
  if (object_type === 'athlete' && updates?.authorized === 'false') {
    console.log(`[Strava Webhook] Athlete ${owner_id} deauthorized — disconnecting`);
    try {
      await db
        .update(connectedDevices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(connectedDevices.deviceType, 'strava'),
            eq(connectedDevices.deviceId, `strava-${owner_id}`)
          )
        );
      console.log(`[Strava Webhook] ✅ Disconnected Strava for athlete ${owner_id}`);
    } catch (err: any) {
      console.error('[Strava Webhook] Error disconnecting athlete:', err.message);
    }
    return;
  }

  if (object_type !== 'activity') {
    console.log(`[Strava Webhook] Ignoring non-activity event: ${object_type}`);
    return;
  }

  // Look up the athlete's device record so we can find their userId and token
  const [device] = await db
    .select()
    .from(connectedDevices)
    .where(
      and(
        eq(connectedDevices.deviceType, 'strava'),
        eq(connectedDevices.deviceId, `strava-${owner_id}`),
        eq(connectedDevices.isActive, true)
      )
    );

  if (!device) {
    console.log(`[Strava Webhook] No active Strava device for athlete ${owner_id} — ignoring`);
    return;
  }

  const userId = device.userId;

  // ── Activity: create ───────────────────────────────────────────────────────
  if (aspect_type === 'create') {
    console.log(`[Strava Webhook] New activity ${object_id} for user ${userId}`);

    // Check if already imported (idempotent)
    const [existing] = await db
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          eq(runs.externalId, String(object_id)),
          eq(runs.externalSource, 'strava')
        )
      );

    if (existing) {
      console.log(`[Strava Webhook] Activity ${object_id} already imported — skipping`);
      return;
    }

    // Fetch full activity details from Strava
    let accessToken = device.accessToken!;
    if (device.tokenExpiresAt && new Date(device.tokenExpiresAt) < new Date()) {
      const refreshed = await refreshStravaToken(device.refreshToken!);
      accessToken = refreshed.accessToken;
      await db.update(connectedDevices).set({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.expiresAt,
        updatedAt: new Date(),
      }).where(eq(connectedDevices.id, device.id));
    }

    const activityRes = await axios.get(
      `https://www.strava.com/api/v3/activities/${object_id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const activity = activityRes.data;

    // Only import Run-type activities
    if (activity.type !== 'Run' && activity.sport_type !== 'Run') {
      console.log(`[Strava Webhook] Activity ${object_id} is ${activity.type} — not a run, skipping`);
      return;
    }

    const distanceKm = (activity.distance ?? 0) / 1000;
    const durationSec = activity.moving_time ?? activity.elapsed_time ?? 0;
    const avgPaceSecPerKm = distanceKm > 0 ? Math.round(durationSec / distanceKm) : null;
    const avgPaceFormatted = avgPaceSecPerKm
      ? `${Math.floor(avgPaceSecPerKm / 60)}:${String(avgPaceSecPerKm % 60).padStart(2, '0')}`
      : null;
    const startDate = activity.start_date ? new Date(activity.start_date) : new Date();

    await db.insert(runs).values({
      userId,
      externalId:    String(object_id),
      externalSource: 'strava',
      name:          activity.name ?? 'Strava Run',
      distance:      distanceKm,
      duration:      durationSec * 1000,
      avgPace:       avgPaceFormatted ?? undefined,
      avgHeartRate:  activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
      maxHeartRate:  activity.max_heartrate      ? Math.round(activity.max_heartrate)     : undefined,
      calories:      activity.calories ?? undefined,
      cadence:       activity.average_cadence    ? Math.round(activity.average_cadence * 2) : undefined,
      elevation:     activity.total_elevation_gain ?? undefined,
      elevationGain: activity.total_elevation_gain ?? undefined,
      startLat:      activity.start_latlng?.[0]  ?? undefined,
      startLng:      activity.start_latlng?.[1]  ?? undefined,
      movingTime:    durationSec,
      elapsedTime:   activity.elapsed_time ?? durationSec,
      avgSpeed:      activity.average_speed ?? undefined,
      maxSpeed:      activity.max_speed     ?? undefined,
      completedAt:   startDate,
      runDate:       startDate.toISOString().split('T')[0],
    });

    // Update lastSyncAt
    await db.update(connectedDevices)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(connectedDevices.id, device.id));

    console.log(`[Strava Webhook] ✅ Imported activity ${object_id} (${distanceKm.toFixed(2)} km) for user ${userId}`);
    return;
  }

  // ── Activity: update ───────────────────────────────────────────────────────
  if (aspect_type === 'update') {
    const fieldsToUpdate: Record<string, any> = {};

    if (updates?.title) fieldsToUpdate.name = updates.title;

    // Handle privacy change: activity set to private → treat as deleted for us
    // (we only have activity:read scope, not activity:read_all)
    if (updates?.private === 'true') {
      console.log(`[Strava Webhook] Activity ${object_id} set to private — removing from our store`);
      await db.delete(runs).where(
        and(
          eq(runs.userId, userId),
          eq(runs.externalId, String(object_id)),
          eq(runs.externalSource, 'strava')
        )
      );
      return;
    }

    if (Object.keys(fieldsToUpdate).length > 0) {
      await db.update(runs)
        .set(fieldsToUpdate)
        .where(
          and(
            eq(runs.userId, userId),
            eq(runs.externalId, String(object_id)),
            eq(runs.externalSource, 'strava')
          )
        );
      console.log(`[Strava Webhook] ✅ Updated activity ${object_id}:`, fieldsToUpdate);
    }
    return;
  }

  // ── Activity: delete ───────────────────────────────────────────────────────
  if (aspect_type === 'delete') {
    await db.delete(runs).where(
      and(
        eq(runs.userId, userId),
        eq(runs.externalId, String(object_id)),
        eq(runs.externalSource, 'strava')
      )
    );
    console.log(`[Strava Webhook] ✅ Deleted activity ${object_id} for user ${userId}`);
    return;
  }

  console.log(`[Strava Webhook] Unhandled event: ${object_type}/${aspect_type}`);
}

// ── Subscription Management (Admin endpoints) ─────────────────────────────────

/**
 * GET /api/strava/webhook/status
 * View the current webhook subscription registered with Strava.
 */
router.get('/api/strava/webhook/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const response = await axios.get(STRAVA_PUSH_SUBSCRIPTIONS_URL, {
      params: {
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
      },
    });
    res.json({ subscriptions: response.data });
  } catch (err: any) {
    console.error('[Strava Webhook] Error fetching subscription status:', err.response?.data ?? err.message);
    res.status(500).json({ error: 'Failed to fetch subscription status', detail: err.response?.data });
  }
});

/**
 * POST /api/strava/webhook/register
 * Register (or re-register) a webhook subscription with Strava.
 * Strava allows only ONE subscription per app — this deletes any existing one first.
 */
router.post('/api/strava/webhook/register', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check for existing subscription and delete it first (Strava enforces max 1)
    const existing = await axios.get(STRAVA_PUSH_SUBSCRIPTIONS_URL, {
      params: {
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
      },
    });

    for (const sub of existing.data ?? []) {
      console.log(`[Strava Webhook] Deleting existing subscription ${sub.id}…`);
      await axios.delete(`${STRAVA_PUSH_SUBSCRIPTIONS_URL}/${sub.id}`, {
        params: {
          client_id:     process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
        },
      });
    }

    // Register new subscription
    console.log(`[Strava Webhook] Registering new subscription → ${STRAVA_WEBHOOK_CALLBACK_URL}`);
    const createRes = await axios.post(
      STRAVA_PUSH_SUBSCRIPTIONS_URL,
      new URLSearchParams({
        client_id:     process.env.STRAVA_CLIENT_ID ?? '',
        client_secret: process.env.STRAVA_CLIENT_SECRET ?? '',
        callback_url:  STRAVA_WEBHOOK_CALLBACK_URL,
        verify_token:  STRAVA_WEBHOOK_VERIFY_TOKEN,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log('[Strava Webhook] ✅ Subscription registered:', createRes.data);
    res.json({ success: true, subscription: createRes.data });
  } catch (err: any) {
    console.error('[Strava Webhook] Error registering subscription:', err.response?.data ?? err.message);
    res.status(500).json({ error: 'Failed to register webhook', detail: err.response?.data });
  }
});

/**
 * DELETE /api/strava/webhook/unsubscribe
 * Delete all webhook subscriptions for this app.
 */
router.delete('/api/strava/webhook/unsubscribe', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const listRes = await axios.get(STRAVA_PUSH_SUBSCRIPTIONS_URL, {
      params: {
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
      },
    });

    const deleted: number[] = [];
    for (const sub of listRes.data ?? []) {
      await axios.delete(`${STRAVA_PUSH_SUBSCRIPTIONS_URL}/${sub.id}`, {
        params: {
          client_id:     process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
        },
      });
      deleted.push(sub.id);
      console.log(`[Strava Webhook] Deleted subscription ${sub.id}`);
    }

    res.json({ success: true, deleted });
  } catch (err: any) {
    console.error('[Strava Webhook] Error deleting subscription:', err.response?.data ?? err.message);
    res.status(500).json({ error: 'Failed to delete subscription', detail: err.response?.data });
  }
});

// ── Auto-register on server startup ──────────────────────────────────────────
// Called from registerRoutes() (or you can call it manually).
// Skips if already subscribed, or if client credentials are missing.
export async function ensureStravaWebhookSubscription(): Promise<void> {
  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('[Strava Webhook] Skipping auto-register — STRAVA_CLIENT_ID/SECRET not set');
    return;
  }

  try {
    const listRes = await axios.get(STRAVA_PUSH_SUBSCRIPTIONS_URL, {
      params: { client_id: clientId, client_secret: clientSecret },
    });

    const subs: any[] = listRes.data ?? [];

    if (subs.length > 0) {
      console.log(`[Strava Webhook] ✅ Subscription already active (id=${subs[0].id}), callback=${subs[0].callback_url}`);

      // Auto-fix if the callback URL has drifted (e.g. Replit domain changed)
      if (subs[0].callback_url !== STRAVA_WEBHOOK_CALLBACK_URL) {
        console.log(`[Strava Webhook] ⚠️  Callback URL mismatch — expected ${STRAVA_WEBHOOK_CALLBACK_URL}, got ${subs[0].callback_url}. Re-registering…`);
        await reregisterWebhook(clientId, clientSecret, subs[0].id);
      }
      return;
    }

    // No subscription — register now
    await reregisterWebhook(clientId, clientSecret, null);
  } catch (err: any) {
    console.error('[Strava Webhook] Auto-register error:', err.response?.data ?? err.message);
  }
}

async function reregisterWebhook(clientId: string, clientSecret: string, existingId: number | null): Promise<void> {
  if (existingId !== null) {
    await axios.delete(`${STRAVA_PUSH_SUBSCRIPTIONS_URL}/${existingId}`, {
      params: { client_id: clientId, client_secret: clientSecret },
    });
    console.log(`[Strava Webhook] Deleted old subscription ${existingId}`);
  }

  const createRes = await axios.post(
    STRAVA_PUSH_SUBSCRIPTIONS_URL,
    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      callback_url:  STRAVA_WEBHOOK_CALLBACK_URL,
      verify_token:  STRAVA_WEBHOOK_VERIFY_TOKEN,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  console.log(`[Strava Webhook] ✅ New subscription registered: id=${createRes.data.id}, callback=${STRAVA_WEBHOOK_CALLBACK_URL}`);
}

export default router;
