/**
 * Strava OAuth Service
 * 
 * Handles OAuth 2.0 authorization flow with Strava API
 * Scopes: activity:write (upload activities), activity:read_all (fetch activities)
 * 
 * Flow:
 * 1. POST /api/strava/auth/authorize - Initiate OAuth flow, redirect to Strava
 * 2. GET /strava/callback - Handle Strava callback, exchange code for token
 * 3. Store token in connectedDevices table
 */

import * as crypto from 'crypto';
import axios from 'axios';

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const STRAVA_REDIRECT_URI = process.env.STRAVA_REDIRECT_URI || 'https://api.airuncoach.com/strava/callback';

// Strava OAuth endpoints
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/api/v3/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

// Temporary token store (use Redis in production)
const tokenStore = new Map<string, {
  accessToken: string;
  refreshToken: string;
  athleteId: number;
  athleteName: string;
  timestamp: number;
}>();

// Cleanup old tokens every hour
setInterval(() => {
  const oneHourAgo = Date.now() - 3600000;
  const keysToDelete: string[] = [];
  tokenStore.forEach((value, key) => {
    if (value.timestamp < oneHourAgo) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => tokenStore.delete(key));
}, 3600000);

/**
 * Generate OAuth state parameter (CSRF protection)
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Build the Strava OAuth authorization URL
 * 
 * User visits this URL to grant permissions
 */
export function buildStravaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID || '',
    redirect_uri: STRAVA_REDIRECT_URI,
    response_type: 'code',
    scope: 'activity:write,activity:read_all', // activity:write for uploads, activity:read_all for fetching
    state,
    approval_prompt: 'auto', // Skip approval if already authorized
  });

  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange OAuth authorization code for access token
 * 
 * Called from GET /strava/callback
 */
export async function exchangeStravaCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  athleteId: number;
  athleteName: string;
  expiresIn: number;
  expiresAt: Date;
}> {
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    throw new Error('Strava credentials not configured');
  }

  try {
    const response = await axios.post(STRAVA_TOKEN_URL, {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    const {
      access_token,
      refresh_token,
      expires_in,
      expires_at,
      athlete,
    } = response.data;

    console.log(`[Strava] OAuth exchange successful for athlete: ${athlete.firstname} ${athlete.lastname}`);

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      athleteId: athlete.id,
      athleteName: `${athlete.firstname} ${athlete.lastname}`,
      expiresIn: expires_in,
      expiresAt: new Date(expires_at * 1000),
    };
  } catch (error: any) {
    console.error('[Strava] OAuth exchange failed:', error.response?.data || error.message);
    throw new Error(`Strava OAuth exchange failed: ${error.message}`);
  }
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshStravaToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    throw new Error('Strava credentials not configured');
  }

  try {
    const response = await axios.post(STRAVA_TOKEN_URL, {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const {
      access_token,
      refresh_token,
      expires_at,
    } = response.data;

    console.log('[Strava] Token refreshed successfully');

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(expires_at * 1000),
    };
  } catch (error: any) {
    console.error('[Strava] Token refresh failed:', error.response?.data || error.message);
    throw new Error(`Strava token refresh failed: ${error.message}`);
  }
}

/**
 * Store token temporarily for frontend retrieval (one-time use)
 */
export function storeTokenTemporarily(
  accessToken: string,
  refreshToken: string,
  athleteId: number,
  athleteName: string
): string {
  const tempTokenId = crypto.randomBytes(16).toString('hex');
  tokenStore.set(tempTokenId, {
    accessToken,
    refreshToken,
    athleteId,
    athleteName,
    timestamp: Date.now(),
  });
  return tempTokenId;
}

/**
 * Retrieve and consume a temporary token (one-time use)
 */
export function retrieveTemporaryToken(tempTokenId: string) {
  const tokenData = tokenStore.get(tempTokenId);
  if (tokenData) {
    tokenStore.delete(tempTokenId); // One-time use
  }
  return tokenData || null;
}

/**
 * Validate an access token with Strava API
 */
export async function validateStravaToken(accessToken: string): Promise<boolean> {
  try {
    const response = await axios.get(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.status === 200 && !!response.data.id;
  } catch (error) {
    console.warn('[Strava] Token validation failed:', error);
    return false;
  }
}

/**
 * Get authenticated athlete info from Strava
 */
export async function getStravaAthleteInfo(accessToken: string) {
  try {
    const response = await axios.get(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  } catch (error: any) {
    console.error('[Strava] Failed to fetch athlete info:', error.message);
    throw new Error(`Failed to fetch Strava athlete info: ${error.message}`);
  }
}
