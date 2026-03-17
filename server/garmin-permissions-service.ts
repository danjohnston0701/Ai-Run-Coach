/**
 * Garmin Permissions Service
 * 
 * Handles Garmin OAuth scopes, permission management, and re-authorization flows
 */

import { db } from './db';
import { connectedDevices } from '../shared/schema';
import { eq } from 'drizzle-orm';
import axios from 'axios';

// ============================================================================
// GARMIN OAUTH SCOPES
// ============================================================================

export const GARMIN_SCOPES = {
  // Activity Scopes
  ACTIVITY_READ: 'activity:read',
  ACTIVITY_WRITE: 'activity:write',
  ACTIVITY_DETAILS_READ: 'activity_details:read',
  
  // Health Scopes
  HEALTH_READ: 'health:read',
  HR_READ: 'hr:read',
  BP_READ: 'bp:read',
  SPO2_READ: 'spo2:read',
  RESPIRATION_READ: 'respiration:read',
  TEMPERATURE_READ: 'temperature:read',
  
  // Wellness Scopes
  SLEEP_READ: 'sleep:read',
  STRESS_READ: 'stress:read',
  BODY_COMPOSITION_READ: 'body_composition:read',
  MENSTRUAL_READ: 'menstrual:read',
  
  // Advanced Scopes
  VO2_READ: 'vo2_max:read',
  FITNESS_AGE_READ: 'fitness_age:read',
  EPOCHS_READ: 'epochs:read',
} as const;

// ============================================================================
// PERMISSION DEFINITIONS
// ============================================================================

export interface GarminPermissionDef {
  id: string;
  scope: string;
  name: string;
  description: string;
  icon: string;
  category: 'activities' | 'health' | 'wellness' | 'advanced';
  dataTypes: string[]; // What data types this enables
  optional: boolean; // Whether this is optional vs required
}

export const GARMIN_PERMISSIONS_LIST: GarminPermissionDef[] = [
  // ACTIVITIES
  {
    id: 'activity_summary',
    scope: GARMIN_SCOPES.ACTIVITY_READ,
    name: 'Activity Summaries',
    description: 'Access to activity summaries (runs, walks, etc)',
    icon: '🏃',
    category: 'activities',
    dataTypes: ['activities', 'activity-details', 'moveiq'],
    optional: false, // Core feature
  },
  {
    id: 'activity_details',
    scope: GARMIN_SCOPES.ACTIVITY_DETAILS_READ,
    name: 'Activity Details',
    description: 'GPS data, pace samples, elevation profiles',
    icon: '📍',
    category: 'activities',
    dataTypes: ['activity-details', 'samples'],
    optional: true,
  },

  // HEALTH
  {
    id: 'heart_rate',
    scope: GARMIN_SCOPES.HR_READ,
    name: 'Heart Rate',
    description: 'HR monitoring, heart rate zones, trends',
    icon: '❤️',
    category: 'health',
    dataTypes: ['health-snapshot', 'daily-summary'],
    optional: true,
  },
  {
    id: 'blood_pressure',
    scope: GARMIN_SCOPES.BP_READ,
    name: 'Blood Pressure',
    description: 'Blood pressure readings and trends',
    icon: '🩸',
    category: 'health',
    dataTypes: ['blood-pressure'],
    optional: true,
  },
  {
    id: 'spo2',
    scope: GARMIN_SCOPES.SPO2_READ,
    name: 'Oxygen Levels (SpO2)',
    description: 'Blood oxygen saturation measurements',
    icon: '🫁',
    category: 'health',
    dataTypes: ['pulse-ox'],
    optional: true,
  },
  {
    id: 'respiration',
    scope: GARMIN_SCOPES.RESPIRATION_READ,
    name: 'Breathing Rate',
    description: 'Breathing rate measurements and trends',
    icon: '💨',
    category: 'health',
    dataTypes: ['respiration'],
    optional: true,
  },
  {
    id: 'skin_temperature',
    scope: GARMIN_SCOPES.TEMPERATURE_READ,
    name: 'Skin Temperature',
    description: 'Body temperature monitoring',
    icon: '🌡️',
    category: 'health',
    dataTypes: ['skin-temperature'],
    optional: true,
  },

  // WELLNESS
  {
    id: 'sleep',
    scope: GARMIN_SCOPES.SLEEP_READ,
    name: 'Sleep Data',
    description: 'Sleep duration, stages, quality scores',
    icon: '😴',
    category: 'wellness',
    dataTypes: ['sleeps', 'sleep-scores'],
    optional: true,
  },
  {
    id: 'stress',
    scope: GARMIN_SCOPES.STRESS_READ,
    name: 'Stress & Body Battery',
    description: 'Stress levels, body battery, recovery data',
    icon: '🔋',
    category: 'wellness',
    dataTypes: ['stress', 'body-battery'],
    optional: true,
  },
  {
    id: 'hrv',
    scope: GARMIN_SCOPES.HEALTH_READ,
    name: 'Heart Rate Variability (HRV)',
    description: 'HRV metrics for recovery monitoring',
    icon: '📈',
    category: 'wellness',
    dataTypes: ['hrv'],
    optional: true,
  },
  {
    id: 'body_composition',
    scope: GARMIN_SCOPES.BODY_COMPOSITION_READ,
    name: 'Body Composition',
    description: 'Weight, body fat %, BMI tracking',
    icon: '⚖️',
    category: 'wellness',
    dataTypes: ['body-compositions'],
    optional: true,
  },
  {
    id: 'menstrual',
    scope: GARMIN_SCOPES.MENSTRUAL_READ,
    name: 'Menstrual Cycle',
    description: 'Women\'s health cycle tracking (if applicable)',
    icon: '👩',
    category: 'wellness',
    dataTypes: ['menstrual-cycle'],
    optional: true,
  },

  // ADVANCED
  {
    id: 'vo2_max',
    scope: GARMIN_SCOPES.VO2_READ,
    name: 'VO2 Max',
    description: 'Aerobic fitness measurements',
    icon: '🫀',
    category: 'advanced',
    dataTypes: ['user-metrics'],
    optional: true,
  },
  {
    id: 'fitness_age',
    scope: GARMIN_SCOPES.FITNESS_AGE_READ,
    name: 'Fitness Age',
    description: 'Biological fitness age calculations',
    icon: '🎂',
    category: 'advanced',
    dataTypes: ['user-metrics'],
    optional: true,
  },
  {
    id: 'epochs',
    scope: GARMIN_SCOPES.EPOCHS_READ,
    name: 'Minute-by-Minute Data (Epochs)',
    description: 'High-resolution activity and wellness data',
    icon: '📊',
    category: 'advanced',
    dataTypes: ['epochs'],
    optional: true,
  },
];

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * Get current permissions for a user
 */
export async function getCurrentPermissions(userId: string): Promise<{
  deviceName: string | null;
  connectedSince: string | null;
  lastSyncAt: string | null;
  permissions: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    isGranted: boolean;
    category: string;
  }>;
}> {
  const device = await db.query.connectedDevices.findFirst({
    where: eq(connectedDevices.userId, userId),
  });

  if (!device) {
    return {
      deviceName: null,
      connectedSince: null,
      lastSyncAt: null,
      permissions: GARMIN_PERMISSIONS_LIST.map(perm => ({
        id: perm.id,
        name: perm.name,
        description: perm.description,
        icon: perm.icon,
        isGranted: false,
        category: perm.category,
      })),
    };
  }

  // Parse granted scopes from device record
  const grantedScopes = parseGrantedScopes(device.grantedScopes || '');

  return {
    deviceName: device.deviceName || 'Unknown Device',
    connectedSince: device.createdAt ? formatDateRelative(device.createdAt) : null,
    lastSyncAt: device.lastSyncAt ? formatDateRelative(device.lastSyncAt) : null,
    permissions: GARMIN_PERMISSIONS_LIST.map(perm => ({
      id: perm.id,
      name: perm.name,
      description: perm.description,
      icon: perm.icon,
      isGranted: grantedScopes.includes(perm.scope),
      category: perm.category,
    })),
  };
}

/**
 * Get Garmin OAuth URL for re-authorization
 */
export async function getReauthorizationUrl(userId: string, baseUrl: string): Promise<string> {
  const consumerKey = process.env.GARMIN_CONSUMER_KEY;
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error('Garmin credentials not configured');
  }

  // Get the "request token" from Garmin
  const requestTokenUrl = 'https://auth.garmin.com/oauth-provider/oauth/requestToken';
  
  const redirectUri = `${baseUrl}/api/auth/garmin/callback`;
  
  try {
    const response = await axios.post(requestTokenUrl, null, {
      params: {
        oauth_consumer_key: consumerKey,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_signature: generateSignature(
          'POST',
          requestTokenUrl,
          { oauth_consumer_key: consumerKey },
          consumerSecret
        ),
        oauth_callback: redirectUri,
      },
    });

    const { oauth_token } = response.data;

    // Store userId with the request token for later lookup
    const authUrl = `https://auth.garmin.com/oauth-provider/oauth/authorize?oauth_token=${oauth_token}&state=${userId}`;

    return authUrl;
  } catch (error: any) {
    console.error('Failed to get authorization URL:', error.message);
    throw new Error('Failed to initiate Garmin re-authorization');
  }
}

/**
 * Handle permission change webhook from Garmin
 */
export async function handlePermissionChange(data: {
  userAccessToken?: string;
  userId?: string | number;
  permissionsGranted?: string[];
  permissionsRevoked?: string[];
}) {
  const { userAccessToken, userId: garminUserId, permissionsGranted = [], permissionsRevoked = [] } = data;

  // Try to find device by Garmin userId first (more reliable), then fall back to access token
  let device = null;

  if (garminUserId) {
    device = await db.query.connectedDevices.findFirst({
      where: eq(connectedDevices.deviceId, String(garminUserId)),
    });
  }

  if (!device && userAccessToken) {
    device = await db.query.connectedDevices.findFirst({
      where: eq(connectedDevices.accessToken, userAccessToken),
    });
  }

  if (!device) {
    // Only one Garmin account connected? Use it as fallback
    const allDevices = await db.query.connectedDevices.findMany({
      where: eq(connectedDevices.deviceType, 'garmin'),
    });
    if (allDevices.length === 1) {
      device = allDevices[0];
      console.log('[Garmin] Permission change: matched single connected Garmin account');
    } else {
      console.warn('[Garmin] Permission change received but could not match to a user — no userId or token provided');
      return;
    }
  }

  // Get current granted scopes
  const currentScopes = parseGrantedScopes(device.grantedScopes || '');

  // Add newly granted scopes
  const updatedScopes = new Set(currentScopes);
  permissionsGranted.forEach(scope => updatedScopes.add(scope));

  // Remove revoked scopes
  permissionsRevoked.forEach(scope => updatedScopes.delete(scope));

  // Save updated scopes
  await db
    .update(connectedDevices)
    .set({
      grantedScopes: Array.from(updatedScopes).join(','),
      updatedAt: new Date(),
    })
    .where(eq(connectedDevices.id, device.id));

  console.log('[Garmin] Permission change processed:', {
    device: device.deviceName,
    granted: permissionsGranted,
    revoked: permissionsRevoked,
    totalScopes: updatedScopes.size,
  });

  // Trigger webhooks for newly granted scopes
  // (This lets the system know to start requesting data for new permissions)
  if (permissionsGranted.length > 0) {
    await triggerDataSync(device.userId, Array.from(updatedScopes));
  }
}

/**
 * Disconnect Garmin device for user
 */
export async function disconnectDevice(userId: string): Promise<void> {
  const device = await db.query.connectedDevices.findFirst({
    where: eq(connectedDevices.userId, userId),
  });

  if (!device) {
    throw new Error('No Garmin device connected');
  }

  // Mark device as inactive
  await db
    .update(connectedDevices)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(connectedDevices.id, device.id));

  console.log('[Garmin] Device disconnected:', device.deviceName);

  // Optionally call Garmin API to revoke token
  // await revokeGarminToken(device.accessToken);
}

/**
 * Get required vs optional scopes
 */
export function getRequiredScopes(): string[] {
  return GARMIN_PERMISSIONS_LIST.filter(p => !p.optional).map(p => p.scope);
}

export function getOptionalScopes(): string[] {
  return GARMIN_PERMISSIONS_LIST.filter(p => p.optional).map(p => p.scope);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseGrantedScopes(scopesString: string): Set<string> {
  if (!scopesString) return new Set();
  return new Set(scopesString.split(',').map(s => s.trim()).filter(s => s));
}

function formatDateRelative(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function generateSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string
): string {
  // Simplified signature generation
  // In production, use a proper OAuth library
  const paramsString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramsString)}`;
  const signingKey = `${consumerSecret}&`;

  // Use crypto to generate HMAC-SHA1
  const crypto = require('crypto');
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

async function triggerDataSync(userId: string, scopes: string[]): Promise<void> {
  // Trigger initial data sync for newly granted scopes
  console.log('[Garmin] Triggering data sync for new scopes:', scopes);
  
  // In a real implementation, this would:
  // 1. Call Garmin API to fetch data for new scopes
  // 2. Trigger webhooks for historical data
  // 3. Update user's permission status
}
