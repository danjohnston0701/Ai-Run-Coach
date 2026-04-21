import crypto from 'crypto';

const GARMIN_CLIENT_ID = process.env.GARMIN_CLIENT_ID;
const GARMIN_CLIENT_SECRET = process.env.GARMIN_CLIENT_SECRET;

// Garmin OAuth 2.0 endpoints
const GARMIN_AUTH_URL = 'https://auth.garmin.com/auth/authorize';
const GARMIN_TOKEN_URL = 'https://auth.garmin.com/oauth/token';
// Garmin Health API base (for wellness data - works with OAuth 2.0)
const GARMIN_API_BASE = 'https://apis.garmin.com';
// Garmin Connect proxy (for activity data if available)
const GARMIN_CONNECT_API = 'https://connect.garmin.com/modern/proxy';

// Import database for PKCE storage
import { db } from './db';
import { sql } from 'drizzle-orm';

// Store PKCE code verifiers in database (survives server restarts)
async function storeCodeVerifier(nonce: string, verifier: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO oauth_state (nonce, code_verifier, created_at)
      VALUES (${nonce}, ${verifier}, NOW())
      ON CONFLICT (nonce) DO UPDATE SET code_verifier = ${verifier}, created_at = NOW()
    `);
    console.log(`[Garmin] Stored code verifier in database for nonce: ${nonce}`);
  } catch (error) {
    console.error(`[Garmin] Failed to store code verifier:`, error);
    throw error;
  }
}

async function getCodeVerifier(nonce: string): Promise<string | null> {
  try {
    const result = await db.execute(sql`
      SELECT code_verifier FROM oauth_state WHERE nonce = ${nonce}
    `);
    const verifier = (result.rows[0] as any)?.code_verifier || null;
    if (verifier) {
      console.log(`[Garmin] Found code verifier in database for nonce: ${nonce}`);
    } else {
      console.log(`[Garmin] Code verifier NOT found in database for nonce: ${nonce}`);
    }
    return verifier;
  } catch (error) {
    console.error(`[Garmin] Failed to get code verifier:`, error);
    return null;
  }
}

async function deleteCodeVerifier(nonce: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM oauth_state WHERE nonce = ${nonce}`);
    console.log(`[Garmin] Deleted code verifier from database for nonce: ${nonce}`);
  } catch (error) {
    console.error(`[Garmin] Failed to delete code verifier:`, error);
  }
}

// Clean up old verifiers (older than 15 minutes) - called periodically
async function cleanupOldVerifiers(): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM oauth_state WHERE created_at < NOW() - INTERVAL '15 minutes'`);
  } catch (error) {
    console.error(`[Garmin] Failed to cleanup old verifiers:`, error);
  }
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Get and remove code verifier for a given nonce (one-time use) - DATABASE VERSION
 */
export async function getAndRemoveCodeVerifier(nonce: string): Promise<string | null> {
  console.log(`[Garmin] Looking up code verifier for nonce: ${nonce}`);
  const verifier = await getCodeVerifier(nonce);
  if (verifier) {
    await deleteCodeVerifier(nonce);
    console.log(`[Garmin] Found and removed code verifier for nonce: ${nonce}`);
    return verifier;
  }
  console.log(`[Garmin] Code verifier NOT found for nonce: ${nonce}`);
  return null;
}

/**
 * Generate the Garmin OAuth authorization URL - ASYNC DATABASE VERSION
 */
export async function getGarminAuthUrl(redirectUri: string, state: string, nonce: string): Promise<string> {
  const { codeVerifier, codeChallenge } = generatePKCE();
  
  // Store the code verifier using database (survives server restarts)
  await storeCodeVerifier(nonce, codeVerifier);
  
  // Cleanup old verifiers periodically
  cleanupOldVerifiers().catch(err => console.error('Failed to cleanup old verifiers:', err));
  
  // Garmin OAuth 2.0 parameters
  // Note: Scopes are typically configured in the Garmin Developer Portal, but we can request them here
  const params = new URLSearchParams({
    client_id: GARMIN_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state,
    // Scope is optional for Garmin - it's configured in the app settings
    // But including common scopes helps ensure proper permissions:
    // scope: 'ACTIVITY:READ WELLNESS:READ',
  });
  
  const fullUrl = `${GARMIN_AUTH_URL}?${params.toString()}`;
  console.log(`[Garmin Auth] Generated auth URL: ${fullUrl}`);
  
  return fullUrl;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeGarminCode(
  code: string,
  redirectUri: string,
  nonce: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  athleteId?: string;
}> {
  const codeVerifier = await getAndRemoveCodeVerifier(nonce);
  if (!codeVerifier) {
    throw new Error('Invalid state - PKCE code verifier not found for nonce: ' + nonce);
  }
  
  // Garmin requires client_id and client_secret in the POST body (not Basic Auth)
  // Build the form body manually to ensure proper encoding
  const formParts = [
    `grant_type=authorization_code`,
    `code=${encodeURIComponent(code)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `code_verifier=${encodeURIComponent(codeVerifier)}`,
    `client_id=${encodeURIComponent(GARMIN_CLIENT_ID!)}`,
    `client_secret=${encodeURIComponent(GARMIN_CLIENT_SECRET!)}`,
  ];
  const formBody = formParts.join('&');
  
  console.log('=== GARMIN TOKEN EXCHANGE ===');
  console.log('Token URL:', GARMIN_TOKEN_URL);
  console.log('Redirect URI:', redirectUri);
  console.log('Nonce:', nonce);
  console.log('Code:', code);
  console.log('Code verifier:', codeVerifier);
  console.log('Code verifier length:', codeVerifier.length);
  console.log('Client ID:', GARMIN_CLIENT_ID);
  console.log('Client Secret (first 5 chars):', GARMIN_CLIENT_SECRET?.substring(0, 5));
  console.log('Request body:', formBody);
  console.log('==============================');
  
  const response = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Garmin token exchange failed:', errorText);
    throw new Error(`Failed to exchange Garmin code: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 7776000, // Default 90 days
    athleteId: data.user_id,
  };
}

/**
 * Refresh Garmin access token
 */
export async function refreshGarminToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  // Garmin requires client_id and client_secret in the POST body
  const response = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: GARMIN_CLIENT_ID!,
      client_secret: GARMIN_CLIENT_SECRET!,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Garmin token refresh failed:', errorText);
    throw new Error(`Failed to refresh Garmin token: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 7776000,
  };
}

/**
 * Fetch user's recent activities from Garmin
 */
/**
 * Request a historical backfill from Garmin.
 *
 * Garmin does NOT support direct pull of user activities — instead you ask
 * Garmin to re-push historical data to your webhook endpoints.
 * Garmin will then deliver the activities to POST /api/garmin/webhooks/activities
 * exactly the same way as real-time activity webhooks.
 *
 * Docs: https://developer.garmin.com/gc-developer-program/activity-api/
 */
export async function requestGarminBackfill(
  accessToken: string,
  startTime: Date,
  endTime: Date
): Promise<{ requested: boolean; message: string }> {
  const startTimeSeconds = Math.floor(startTime.getTime() / 1000);
  const endTimeSeconds = Math.floor(endTime.getTime() / 1000);

  const startDate = startTime.toISOString().split('T')[0];
  const endDate = endTime.toISOString().split('T')[0];
  console.log(`📤 Requesting Garmin backfill for ${startDate} → ${endDate}`);

  // Garmin backfill uses GET with query params (not POST with body)
  const url = `${GARMIN_API_BASE}/wellness-api/rest/backfill/activities?summaryStartTimeInSeconds=${startTimeSeconds}&summaryEndTimeInSeconds=${endTimeSeconds}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error(`❌ Garmin backfill request failed: HTTP ${response.status}`, responseText.substring(0, 300));
    throw new Error(`Garmin backfill request failed: ${response.status}`);
  }

  console.log(`✅ Garmin backfill requested (HTTP ${response.status}) — activities will arrive via webhook`);
  return {
    requested: true,
    message: `Garmin will push activities from ${startDate} to ${endDate} to your webhooks shortly.`,
  };
}

/**
 * @deprecated — Garmin does not support direct activity pull.
 * Use requestGarminBackfill() instead; Garmin will push the data to your webhooks.
 */
export async function getGarminActivities(
  accessToken: string,
  startTime?: Date,
  endTime?: Date
): Promise<any[]> {
  console.warn('⚠️  getGarminActivities() is deprecated — Garmin does not support direct pull. Use requestGarminBackfill() instead.');
  return [];
}

/**
 * Fetch detailed activity data including GPS and running dynamics
 */
export async function getGarminActivityDetail(
  accessToken: string,
  activityId: string
): Promise<any> {
  // Use Garmin Connect API for detailed activity data
  const response = await fetch(`${GARMIN_CONNECT_API}/activity-service/activity/${activityId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Garmin activity detail API error:', response.status, errorText);
    throw new Error(`Failed to fetch Garmin activity detail: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch user's daily health summary (steps, HR, sleep, stress)
 * Uses Garmin Connect API (OAuth 2.0 compatible)
 */
export async function getGarminDailySummary(
  accessToken: string,
  date: Date
): Promise<any> {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  const response = await fetch(`${GARMIN_CONNECT_API}/usersummary-service/usersummary/daily/${dateStr}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin daily summary: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch user's sleep data (stages, scores, duration)
 * Uses Garmin Connect API (OAuth 2.0 compatible)
 */
export async function getGarminSleepData(
  accessToken: string,
  startDate: Date,
  endDate: Date
): Promise<any> {
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailySleepData?date=${startDateStr}&nonSleepBufferMinutes=60`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin sleep data: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch user's all-day heart rate data
 * Uses Garmin Connect API (OAuth 2.0 compatible)
 */
export async function getGarminHeartRateData(
  accessToken: string,
  date: Date
): Promise<any> {
  const dateStr = date.toISOString().split('T')[0];
  
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailyHeartRate/${dateStr}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin heart rate data: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch user's stress data throughout the day
 * Uses Garmin Connect API (OAuth 2.0 compatible)
 */
export async function getGarminStressData(
  accessToken: string,
  date: Date
): Promise<any> {
  const dateStr = date.toISOString().split('T')[0];
  
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailyStress/${dateStr}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin stress data: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch detailed sleep data with sleep stages
 */
export async function getGarminSleepDetails(
  accessToken: string,
  date: Date
): Promise<any> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const params = new URLSearchParams({
    uploadStartTimeInSeconds: Math.floor(startOfDay.getTime() / 1000).toString(),
    uploadEndTimeInSeconds: Math.floor(endOfDay.getTime() / 1000).toString(),
  });
  
  const response = await fetch(`${GARMIN_API_BASE}/wellness-api/rest/sleeps?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin sleep details: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch Body Battery data (Garmin's energy metric)
 * Uses Garmin Connect API (OAuth 2.0 compatible)
 */
export async function getGarminBodyBattery(
  accessToken: string,
  date: Date
): Promise<any> {
  const dateStr = date.toISOString().split('T')[0];
  
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/bodyBattery/${dateStr}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin Body Battery: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch HRV (Heart Rate Variability) data
 * Uses Garmin Connect API (OAuth 2.0 compatible)
 */
export async function getGarminHRVData(
  accessToken: string,
  date: Date
): Promise<any> {
  const dateStr = date.toISOString().split('T')[0];
  
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/daily/hrv/${dateStr}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin HRV data: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch Respiration data
 */
/**
 * Fetch Respiration rate data
 * Uses Garmin Connect API (OAuth 2.0 compatible)
 */
export async function getGarminRespirationData(
  accessToken: string,
  date: Date
): Promise<any> {
  const dateStr = date.toISOString().split('T')[0];
  
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailyRespiration/${dateStr}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin respiration data: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch Pulse Ox (SpO2) data
 * Uses Garmin Connect API (OAuth 2.0 compatible)
 */
export async function getGarminPulseOx(
  accessToken: string,
  date: Date
): Promise<any> {
  const dateStr = date.toISOString().split('T')[0];
  
  const response = await fetch(`${GARMIN_CONNECT_API}/wellness-service/wellness/dailySpo2/${dateStr}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin Pulse Ox: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch user stats including VO2 Max
 */
export async function getGarminUserStats(
  accessToken: string
): Promise<any> {
  const response = await fetch(`${GARMIN_API_BASE}/wellness-api/rest/userStats`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin user stats: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch comprehensive wellness summary for a date range
 * Combines sleep, stress, Body Battery, HRV, and activity readiness
 */
export async function getGarminComprehensiveWellness(
  accessToken: string,
  date: Date
): Promise<{
  date: string;
  sleep: {
    totalSleepSeconds: number;
    deepSleepSeconds: number;
    lightSleepSeconds: number;
    remSleepSeconds: number;
    awakeSleepSeconds: number;
    sleepScore: number;
    sleepQuality: string;
  } | null;
  stress: {
    averageStressLevel: number;
    maxStressLevel: number;
    stressDuration: number;
    restDuration: number;
    activityDuration: number;
    stressQualifier: string;
  } | null;
  bodyBattery: {
    highestValue: number;
    lowestValue: number;
    currentValue: number;
    chargedValue: number;
    drainedValue: number;
  } | null;
  hrv: {
    weeklyAvg: number;
    lastNightAvg: number;
    lastNight5MinHigh: number;
    hrvStatus: string;
    feedbackPhrase: string;
  } | null;
  heartRate: {
    restingHeartRate: number;
    minHeartRate: number;
    maxHeartRate: number;
    averageHeartRate: number;
  } | null;
  readiness: {
    score: number;
    recommendation: string;
  };
}> {
  const dateStr = date.toISOString().split('T')[0];
  
  // Fetch all data in parallel
  const [sleepData, stressData, bodyBatteryData, hrvData, heartRateData] = await Promise.allSettled([
    getGarminSleepDetails(accessToken, date),
    getGarminStressData(accessToken, date),
    getGarminBodyBattery(accessToken, date),
    getGarminHRVData(accessToken, date),
    getGarminHeartRateData(accessToken, date),
  ]);
  
  // Parse sleep data
  let sleep = null;
  if (sleepData.status === 'fulfilled' && sleepData.value?.length > 0) {
    const s = sleepData.value[0];
    const totalSleep = s.durationInSeconds || 0;
    sleep = {
      totalSleepSeconds: totalSleep,
      deepSleepSeconds: s.deepSleepDurationInSeconds || 0,
      lightSleepSeconds: s.lightSleepDurationInSeconds || 0,
      remSleepSeconds: s.remSleepInSeconds || 0,
      awakeSleepSeconds: s.awakeDurationInSeconds || 0,
      sleepScore: s.sleepScores?.overall?.value || 0,
      sleepQuality: getSleepQuality(totalSleep / 3600),
    };
  }
  
  // Parse stress data
  let stress = null;
  if (stressData.status === 'fulfilled' && stressData.value?.length > 0) {
    const st = stressData.value[0];
    stress = {
      averageStressLevel: st.averageStressLevel || 0,
      maxStressLevel: st.maxStressLevel || 0,
      stressDuration: st.stressDuration || 0,
      restDuration: st.restDuration || 0,
      activityDuration: st.activityDuration || 0,
      stressQualifier: getStressQualifier(st.averageStressLevel || 0),
    };
  }
  
  // Parse Body Battery data
  let bodyBattery = null;
  if (bodyBatteryData.status === 'fulfilled' && bodyBatteryData.value?.length > 0) {
    const bb = bodyBatteryData.value[0];
    bodyBattery = {
      highestValue: bb.bodyBatteryHigh || 0,
      lowestValue: bb.bodyBatteryLow || 0,
      currentValue: bb.bodyBatteryMostRecentValue || 0,
      chargedValue: bb.bodyBatteryChargedValue || 0,
      drainedValue: bb.bodyBatteryDrainedValue || 0,
    };
  }
  
  // Parse HRV data
  let hrv = null;
  if (hrvData.status === 'fulfilled' && hrvData.value?.length > 0) {
    const h = hrvData.value[0];
    hrv = {
      weeklyAvg: h.weeklyAvg || 0,
      lastNightAvg: h.lastNightAvg || 0,
      lastNight5MinHigh: h.lastNight5MinHigh || 0,
      hrvStatus: h.status || 'unknown',
      feedbackPhrase: h.feedbackPhrase || '',
    };
  }
  
  // Parse heart rate data
  let heartRate = null;
  if (heartRateData.status === 'fulfilled' && heartRateData.value?.length > 0) {
    const hr = heartRateData.value[0];
    heartRate = {
      restingHeartRate: hr.restingHeartRate || 0,
      minHeartRate: hr.minHeartRate || 0,
      maxHeartRate: hr.maxHeartRate || 0,
      averageHeartRate: hr.averageHeartRate || 0,
    };
  }
  
  // Calculate overall readiness score
  const readiness = calculateReadinessScore(sleep, stress, bodyBattery, hrv);
  
  return {
    date: dateStr,
    sleep,
    stress,
    bodyBattery,
    hrv,
    heartRate,
    readiness,
  };
}

/**
 * Helper: Get sleep quality description
 */
function getSleepQuality(hours: number): string {
  if (hours >= 8) return 'Excellent';
  if (hours >= 7) return 'Good';
  if (hours >= 6) return 'Fair';
  if (hours >= 5) return 'Poor';
  return 'Very Poor';
}

/**
 * Helper: Get stress qualifier
 */
function getStressQualifier(level: number): string {
  if (level <= 25) return 'Resting';
  if (level <= 50) return 'Low';
  if (level <= 75) return 'Medium';
  return 'High';
}

/**
 * Helper: Calculate readiness score based on wellness metrics
 */
function calculateReadinessScore(
  sleep: any,
  stress: any,
  bodyBattery: any,
  hrv: any
): { score: number; recommendation: string } {
  let score = 50; // Base score
  let factors: string[] = [];
  
  // Sleep contribution (0-25 points)
  if (sleep) {
    const sleepHours = sleep.totalSleepSeconds / 3600;
    if (sleepHours >= 8) {
      score += 25;
    } else if (sleepHours >= 7) {
      score += 20;
    } else if (sleepHours >= 6) {
      score += 10;
    } else {
      factors.push('low sleep');
    }
  } else {
    factors.push('no sleep data');
  }
  
  // Stress contribution (0-15 points)
  if (stress) {
    if (stress.averageStressLevel <= 25) {
      score += 15;
    } else if (stress.averageStressLevel <= 50) {
      score += 10;
    } else if (stress.averageStressLevel > 75) {
      score -= 10;
      factors.push('high stress');
    }
  }
  
  // Body Battery contribution (0-10 points)
  if (bodyBattery) {
    if (bodyBattery.currentValue >= 75) {
      score += 10;
    } else if (bodyBattery.currentValue >= 50) {
      score += 5;
    } else if (bodyBattery.currentValue < 25) {
      score -= 5;
      factors.push('low energy');
    }
  }
  
  // HRV contribution
  if (hrv && hrv.hrvStatus === 'BALANCED') {
    score += 5;
  } else if (hrv && hrv.hrvStatus === 'LOW') {
    score -= 5;
    factors.push('HRV below baseline');
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Generate recommendation
  let recommendation: string;
  if (score >= 80) {
    recommendation = 'You are well-rested and ready for a challenging workout!';
  } else if (score >= 60) {
    recommendation = 'Good readiness for a moderate intensity run.';
  } else if (score >= 40) {
    recommendation = 'Consider a lighter recovery run today.';
  } else {
    recommendation = `Your body needs recovery. ${factors.length > 0 ? `Factors: ${factors.join(', ')}` : ''}`;
  }
  
  return { score, recommendation };
}

/**
 * Fetch user profile info
 */
export async function getGarminUserProfile(accessToken: string): Promise<any> {
  const response = await fetch(`${GARMIN_API_BASE}/wellness-api/rest/user/id`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Garmin user profile: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Parse activity data into our standard format
 */
export function parseGarminActivity(activity: any): {
  activityId: string;
  activityType: string;
  startTime: Date;
  duration: number;
  distance: number;
  calories: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averagePace?: number;
  averageCadence?: number;
  elevationGain?: number;
  vo2Max?: number;
  trainingEffect?: number;
  recoveryTime?: number;
  polyline?: string;
  runningDynamics?: {
    verticalOscillation?: number;
    groundContactTime?: number;
    groundContactTimeBalance?: number;
    strideLength?: number;
    verticalRatio?: number;
  };
} {
  return {
    activityId: activity.activityId?.toString() || activity.summaryId?.toString(),
    activityType: activity.activityType || 'running',
    startTime: new Date(activity.startTimeInSeconds * 1000),
    duration: activity.durationInSeconds || 0,
    distance: (activity.distanceInMeters || 0) / 1000, // Convert to km
    calories: activity.activeKilocalories || activity.calories || 0,
    averageHeartRate: activity.averageHeartRateInBeatsPerMinute,
    maxHeartRate: activity.maxHeartRateInBeatsPerMinute,
    averagePace: activity.averageSpeedInMetersPerSecond 
      ? (1000 / activity.averageSpeedInMetersPerSecond / 60) // Convert to min/km
      : undefined,
    averageCadence: activity.averageRunCadenceInStepsPerMinute,
    elevationGain: activity.totalElevationGainInMeters,
    vo2Max: activity.vO2Max,
    trainingEffect: activity.trainingEffectLabel ? parseFloat(activity.trainingEffectLabel) : undefined,
    recoveryTime: activity.recoveryTimeInMinutes,
    polyline: activity.polyline,
    runningDynamics: activity.avgVerticalOscillation ? {
      verticalOscillation: activity.avgVerticalOscillation,
      groundContactTime: activity.avgGroundContactTime,
      groundContactTimeBalance: activity.avgGroundContactBalance,
      strideLength: activity.avgStrideLength,
      verticalRatio: activity.avgVerticalRatio,
    } : undefined,
  };
}

/**
 * Sync Garmin activities to database and create run sessions
 * This is called automatically after OAuth connection
 */
export async function syncGarminActivities(
  userId: string,
  accessToken: string,
  startDateISO: string,
  endDateISO: string
): Promise<{ synced: number; skipped: number; errors: number }> {
  console.log(`📥 Starting Garmin activity sync for user ${userId}`);
  console.log(`📅 Date range: ${startDateISO} to ${endDateISO}`);
  
  const { db } = await import('./db');
  const { connectedDevices } = await import('@shared/schema');
  const { eq, and } = await import('drizzle-orm');

  try {
    // Check if token is expired and refresh if needed
    const deviceRecords = await db
      .select()
      .from(connectedDevices)
      .where(
        and(
          eq(connectedDevices.userId, userId),
          eq(connectedDevices.deviceType, 'garmin')
        )
      )
      .limit(1);
    
    let currentAccessToken = accessToken;
    
    if (deviceRecords.length > 0) {
      const device = deviceRecords[0];
      const expiresAt = device.tokenExpiresAt;
      const now = new Date();
      
      // Refresh token if expired or expiring within 5 minutes
      if (expiresAt && expiresAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
        console.log('🔄 Access token expired or expiring soon, refreshing...');
        try {
          const tokens = await refreshGarminToken(device.refreshToken!);
          currentAccessToken = tokens.accessToken;
          
          // Update stored tokens
          await db
            .update(connectedDevices)
            .set({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
            })
            .where(eq(connectedDevices.id, device.id));
          
          console.log('✅ Token refreshed successfully');
        } catch (refreshError: any) {
          console.error('❌ Failed to refresh token:', refreshError.message);
          throw new Error('Token expired and refresh failed. Please reconnect Garmin.');
        }
      }
    }
    
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);

    // Garmin does NOT support direct pull of historical activities.
    // Instead we request a backfill — Garmin will push the data to our
    // /api/garmin/webhooks/activities endpoint, same as real-time webhooks.
    console.log(`📤 Requesting Garmin backfill for ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`);

    await requestGarminBackfill(currentAccessToken, startDate, endDate);

    console.log('✅ Garmin backfill requested — activities will arrive via webhook and be processed automatically');
    // Return 0 synced/skipped/errors here — the webhook handler will process them asynchronously
    return { synced: 0, skipped: 0, errors: 0 };

  } catch (error: any) {
    console.error('❌ Fatal error during Garmin sync:', error);
    throw error;
  }
}

/**
 * Helper function to format pace (min/km)
 */
function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Helper function to determine run difficulty based on metrics
 */
function determineDifficulty(distanceKm: number, durationMs: number, elevationGain?: number | null): string {
  const avgPaceMinPerKm = (durationMs / 1000) / distanceKm / 60;
  const elevation = elevationGain || 0;
  
  // Simple difficulty heuristic
  if (avgPaceMinPerKm > 7 && elevation < 100) return 'easy';
  if (avgPaceMinPerKm < 4.5 || elevation > 300) return 'hard';
  return 'moderate';
}

/**
 * ============================================================
 * ACTIVITY UPLOAD API - PUBLISH RUNS TO GARMIN CONNECT
 * ============================================================
 * Allows AI Run Coach runs to be uploaded to Garmin Connect
 * Requires Training/Courses API permissions
 */

/**
 * Convert AI Run Coach run data to TCX (Training Center XML) format
 * TCX is Garmin's preferred format for activity uploads
 */
export function generateTCXFile(runData: any): string {
  const {
    id,
    userId,
    startTime,
    duration, // milliseconds
    distance, // meters
    avgPace, // min/km
    calories,
    avgHeartRate,
    maxHeartRate,
    routePoints, // Array of { latitude, longitude, altitude, speed, timestamp, heartRate }
    splits,
  } = runData;

  // Convert times to ISO 8601 format
  const startDate = new Date(startTime);
  const endDate = new Date(startDate.getTime() + duration);

  // Build TCX XML
  let tcx = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>${startDate.toISOString()}</Id>
      <Lap StartTime="${startDate.toISOString()}">
        <TotalTimeSeconds>${(duration / 1000).toFixed(2)}</TotalTimeSeconds>
        <DistanceMeters>${distance.toFixed(2)}</DistanceMeters>
        <Calories>${calories || 0}</Calories>
        <AverageHeartRateBpm>
          <Value>${avgHeartRate || 0}</Value>
        </AverageHeartRateBpm>
        <MaximumHeartRateBpm>
          <Value>${maxHeartRate || 0}</Value>
        </MaximumHeartRateBpm>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>`;

  // Add trackpoints (GPS data)
  if (routePoints && routePoints.length > 0) {
    routePoints.forEach((point: any) => {
      tcx += `
          <Trackpoint>
            <Time>${new Date(point.timestamp || startTime).toISOString()}</Time>`;
      
      if (point.latitude && point.longitude) {
        tcx += `
            <Position>
              <LatitudeDegrees>${point.latitude}</LatitudeDegrees>
              <LongitudeDegrees>${point.longitude}</LongitudeDegrees>
            </Position>`;
      }
      
      if (point.altitude) {
        tcx += `
            <AltitudeMeters>${point.altitude}</AltitudeMeters>`;
      }
      
      if (point.heartRate) {
        tcx += `
            <HeartRateBpm>
              <Value>${point.heartRate}</Value>
            </HeartRateBpm>`;
      }
      
      tcx += `
          </Trackpoint>`;
    });
  } else {
    // If no GPS data, create single trackpoint with summary
    tcx += `
          <Trackpoint>
            <Time>${startDate.toISOString()}</Time>
            <HeartRateBpm>
              <Value>${avgHeartRate || 0}</Value>
            </HeartRateBpm>
          </Trackpoint>`;
  }

  tcx += `
        </Track>
      </Lap>
      <Notes>Uploaded from AI Run Coach</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

  return tcx;
}

/**
 * Upload activity to Garmin Connect
 * Uses Garmin Upload API endpoint
 */
export async function uploadActivityToGarmin(
  accessToken: string,
  tcxData: string,
  activityName?: string
): Promise<{ success: boolean; garminActivityId?: string; error?: string }> {
  try {
    console.log('📤 Uploading activity to Garmin Connect...');

    // Garmin Upload API endpoint
    const uploadUrl = `${GARMIN_API_BASE}/upload-service/upload/.tcx`;

    // Upload TCX file as multipart/form-data
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', Buffer.from(tcxData), {
      filename: `activity_${Date.now()}.tcx`,
      contentType: 'application/xml',
    });

    if (activityName) {
      form.append('activityName', activityName);
    }

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${accessToken}`,
      },
      body: form,
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('❌ Garmin upload failed:', response.status, responseText);
      return {
        success: false,
        error: `Upload failed: ${response.status} ${responseText}`,
      };
    }

    // Parse response to get activity ID
    let garminActivityId: string | undefined;
    try {
      const jsonResponse = JSON.parse(responseText);
      garminActivityId = jsonResponse.detailedImportResult?.successes?.[0]?.internalId;
    } catch (e) {
      // Response might not be JSON
      console.log('Upload response (non-JSON):', responseText);
    }

    console.log('✅ Activity uploaded to Garmin Connect successfully');
    if (garminActivityId) {
      console.log(`   Garmin Activity ID: ${garminActivityId}`);
    }

    return {
      success: true,
      garminActivityId,
    };
  } catch (error: any) {
    console.error('❌ Error uploading to Garmin:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Upload AI Run Coach run to Garmin Connect
 * Convenience function that handles token refresh and TCX generation
 */
export async function uploadRunToGarmin(
  userId: string,
  runData: any,
  accessToken: string,
  refreshToken: string,
  tokenExpiresAt: Date
): Promise<{ success: boolean; garminActivityId?: string; error?: string }> {
  try {
    // Check if token needs refresh
    let currentAccessToken = accessToken;
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (!tokenExpiresAt || new Date(tokenExpiresAt) < fiveMinutesFromNow) {
      console.log('🔄 Access token expired or expiring soon, refreshing...');
      
      const tokenData = await refreshGarminToken(refreshToken);
      currentAccessToken = tokenData.accessToken;

      // Update token in database
      await db.execute(sql`
        UPDATE connected_devices
        SET 
          access_token = ${tokenData.accessToken},
          refresh_token = ${tokenData.refreshToken},
          token_expires_at = ${new Date(Date.now() + tokenData.expiresIn * 1000)}
        WHERE user_id = ${userId} AND device_type = 'garmin' AND is_active = true
      `);

      console.log('✅ Token refreshed successfully for upload');
    }

    // Generate TCX file
    const tcxData = generateTCXFile(runData);

    // Upload to Garmin
    const activityName = `AI Run Coach - ${new Date(runData.startTime).toLocaleDateString()}`;
    const result = await uploadActivityToGarmin(currentAccessToken, tcxData, activityName);

    if (result.success && result.garminActivityId) {
      // Update run in database to mark as uploaded to Garmin
      await db.execute(sql`
        UPDATE runs
        SET 
          uploaded_to_garmin = true,
          garmin_activity_id = ${result.garminActivityId}
        WHERE id = ${runData.id}
      `);
    }

    return result;
  } catch (error: any) {
    console.error('❌ Error in uploadRunToGarmin:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  getGarminAuthUrl,
  exchangeGarminCode,
  refreshGarminToken,
  requestGarminBackfill,
  getGarminActivities, // deprecated — kept for compatibility, returns []
  getGarminActivityDetail,
  syncGarminActivities,
  getGarminDailySummary,
  getGarminSleepData,
  getGarminSleepDetails,
  getGarminHeartRateData,
  getGarminStressData,
  getGarminBodyBattery,
  getGarminHRVData,
  getGarminRespirationData,
  getGarminPulseOx,
  getGarminUserStats,
  getGarminComprehensiveWellness,
  getGarminUserProfile,
  parseGarminActivity,
  generateTCXFile,
  uploadActivityToGarmin,
  uploadRunToGarmin,
};
