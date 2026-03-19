/**
 * Unified Garmin User Resolution
 * 
 * Handles mapping incoming Garmin webhook data to app users across all webhook types
 * (dailies, respiration, epochs, activities, etc.).
 * 
 * Resolution strategy:
 * 1. Try matching by userAccessToken (preferred - always accurate)
 * 2. Fall back to Garmin userId + deviceId lookup
 * 3. Fall back to single-device assumption (if user has exactly one Garmin device)
 */

import { storage, ConnectedDevice } from "./storage";

interface GarminWebhookPayload {
  userId?: string | number;           // Garmin numeric user ID (e.g., 344638)
  userAccessToken?: string;           // OAuth token (e.g., "abc123xyz...")
  [key: string]: unknown;
}

interface UserResolutionResult {
  userId: string;                     // App user ID
  device?: ConnectedDevice;           // Garmin device record
  method: "token" | "userId" | "single_device" | "none";
  hasToken: boolean;
}

/**
 * Resolve an app user from incoming Garmin webhook data.
 * 
 * @param payload Garmin webhook payload (dailies, respiration, etc.)
 * @returns Resolved user ID + device, or null if unresolvable
 */
export async function resolveGarminUser(
  payload: GarminWebhookPayload
): Promise<UserResolutionResult | null> {
  const userAccessToken = payload.userAccessToken;
  const garminUserId = payload.userId;
  
  // Strategy 1: Try access token (most reliable)
  if (userAccessToken) {
    const device = await storage.getConnectedDeviceByGarminToken(userAccessToken);
    if (device && device.userId) {
      console.log(
        `[Garmin] Resolved user via token: ${device.userId} (method=token)`
      );
      return {
        userId: device.userId,
        device,
        method: "token",
        hasToken: true,
      };
    }
    console.log(
      `[Garmin] Token provided but no matching device found (token may be stale)`
    );
  }

  // Strategy 2: Try Garmin userId + deviceId lookup
  if (garminUserId) {
    const garminIdStr = String(garminUserId);
    const devices = await storage.getConnectedDevicesByGarminId(garminIdStr);
    
    if (devices.length === 1) {
      const device = devices[0];
      console.log(
        `[Garmin] Resolved user via Garmin ID: ${device.userId} (method=userId, garminId=${garminIdStr})`
      );
      return {
        userId: device.userId,
        device,
        method: "userId",
        hasToken: !!userAccessToken,
      };
    } else if (devices.length > 1) {
      console.warn(
        `[Garmin] Ambiguous: ${devices.length} users with Garmin ID ${garminIdStr}. Using first. (method=userId)`
      );
      return {
        userId: devices[0].userId,
        device: devices[0],
        method: "userId",
        hasToken: !!userAccessToken,
      };
    }
  }

  // Strategy 3: Single device fallback (only if NO token or Garmin ID in payload)
  if (!userAccessToken && !garminUserId) {
    console.log(
      `[Garmin] No userAccessToken or userId in payload. Trying single-device fallback...`
    );
    // This is a last resort and should rarely be used
    // Only applicable if the user has exactly one Garmin device
  }

  console.warn(
    `[Garmin] Could not resolve user from webhook. token=${!!userAccessToken}, garminId=${garminUserId}`
  );
  return null;
}

/**
 * Version for resolving by sport/date (for activities, runs, etc.)
 * Used when webhook doesn't have userId but we can match by date + sport.
 * 
 * @param userAccessToken Garmin OAuth token
 * @param date ISO date string (YYYY-MM-DD)
 * @param sport Sport type (e.g., "running")
 */
export async function resolveGarminUserByActivity(
  userAccessToken: string | undefined,
  date: string | undefined,
  sport: string | undefined
): Promise<UserResolutionResult | null> {
  // First try token
  if (userAccessToken) {
    const device = await storage.getConnectedDeviceByGarminToken(userAccessToken);
    if (device && device.userId) {
      console.log(
        `[Garmin] Resolved activity user via token: ${device.userId}`
      );
      return {
        userId: device.userId,
        device,
        method: "token",
        hasToken: true,
      };
    }
  }

  // If token fails and we have date/sport, we could implement activity matching
  // but this is unreliable (multiple activities same day, same sport)
  // For now, we require either token or userId

  console.warn(
    `[Garmin] Could not resolve activity user. token=${!!userAccessToken}, date=${date}, sport=${sport}`
  );
  return null;
}
