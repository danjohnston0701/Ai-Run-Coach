/**
 * Strava Upload Service
 * Handles FIT file upload to Strava and polling for activity creation
 * 
 * Flow:
 * 1. Generate FIT file from run data
 * 2. POST file to Strava /uploads API
 * 3. Poll /uploads/{uploadId} until activity is created
 * 4. Store activity ID in runs table
 */

import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

export interface UploadResponse {
  id: number;
  external_id: string;
  error?: string;
  status: string;
}

export interface ActivityResponse {
  id: number;
  resourceState: number;
  name: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  totalElevationGain: number;
  type: string;
  [key: string]: any;
}

/**
 * Upload FIT file to Strava
 * Returns uploadId for polling
 * 
 * @param fitFileBuffer - Binary FIT file data
 * @param accessToken - Strava OAuth access token
 * @param runName - Name of the run
 * @param description - Optional run description
 * @param externalId - Unique identifier to prevent duplicate uploads
 */
export async function uploadRunToStrava(
  fitFileBuffer: Buffer,
  accessToken: string,
  runName: string,
  description?: string,
  externalId?: string
): Promise<{ uploadId: number; externalId: string }> {
  try {
    const form = new FormData();

    // Add FIT file to form
    const stream = Readable.from(fitFileBuffer);
    form.append('file', stream, `run_${externalId || Date.now()}.fit`);

    // Add metadata
    form.append('data_type', 'fit'); // 'fit', 'tcx', or 'gpx'
    form.append('sport_type', 'Run');
    form.append('name', runName);
    if (description) {
      form.append('description', description);
    }
    form.append('external_id', externalId || `airuncoach-${Date.now()}.fit`);
    form.append('trainer', 'false');
    form.append('commute', 'false');

    console.log(`[Strava] Uploading run: ${runName}`);

    const response = await axios.post(
      `${STRAVA_API_BASE}/uploads`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const { id, external_id } = response.data;

    console.log(`[Strava] Upload successful: uploadId=${id}`);

    return { uploadId: id, externalId: external_id };
  } catch (error: any) {
    console.error('[Strava] Upload failed:', error.response?.data || error.message);
    throw new Error(`Strava upload failed: ${error.message}`);
  }
}

/**
 * Poll upload status until Strava processes the activity
 * Returns activity ID when ready
 * 
 * @param uploadId - Strava upload ID
 * @param accessToken - Strava OAuth access token
 * @param maxAttempts - Maximum polling attempts (default 30)
 * @param delayMs - Delay between polls in milliseconds (default 2000)
 */
export async function pollUploadStatus(
  uploadId: number,
  accessToken: string,
  maxAttempts: number = 30,
  delayMs: number = 2000
): Promise<number> {
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      const response = await axios.get(
        `${STRAVA_API_BASE}/uploads/${uploadId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const { id, status, activity_id, error } = response.data;

      if (status === 'Ready') {
        console.log(`[Strava] Activity ready: ${activity_id}`);
        return activity_id;
      }

      if (error) {
        throw new Error(`Strava processing error: ${error}`);
      }

      console.log(`[Strava] Upload status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, delayMs));
      attempt++;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Upload not found yet, retry
        await new Promise(resolve => setTimeout(resolve, delayMs));
        attempt++;
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Strava upload processing timeout after ${maxAttempts} attempts`);
}

/**
 * Get activity details from Strava
 */
export async function getStravaActivity(
  activityId: number,
  accessToken: string
): Promise<ActivityResponse> {
  try {
    const response = await axios.get(
      `${STRAVA_API_BASE}/activities/${activityId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('[Strava] Failed to fetch activity:', error.message);
    throw new Error(`Failed to fetch Strava activity: ${error.message}`);
  }
}

/**
 * Deregister from Strava (when user disconnects account)
 */
export interface StravaActivitySummary {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number;          // metres
  moving_time: number;       // seconds
  elapsed_time: number;      // seconds
  total_elevation_gain: number;
  start_date: string;        // ISO 8601
  start_latlng: [number, number] | null;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  calories?: number;
  map?: { summary_polyline?: string };
}

/**
 * Fetch all running activities for the authenticated athlete from Strava.
 * Paginates automatically — Strava caps each page at 200 activities.
 * 
 * NOTE: Requires activity:read_all scope.  Private runs are included only with
 * this scope; public-only access uses activity:read.
 * 
 * @param accessToken - Valid Strava OAuth access token
 * @param maxPages    - Safety cap on pages (default 10 → up to 2 000 activities)
 */
export async function fetchStravaAthleteActivities(
  accessToken: string,
  maxPages = 10
): Promise<StravaActivitySummary[]> {
  const all: StravaActivitySummary[] = [];
  let page = 1;

  while (page <= maxPages) {
    const { data } = await axios.get<StravaActivitySummary[]>(
      `${STRAVA_API_BASE}/athlete/activities`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { per_page: 200, page },
      }
    );

    if (!data || data.length === 0) break;

    // Filter to running activities only
    const runs = data.filter(
      (a) =>
        a.type === 'Run' ||
        a.sport_type === 'Run' ||
        a.sport_type === 'TrailRun' ||
        a.sport_type === 'VirtualRun'
    );
    all.push(...runs);

    if (data.length < 200) break; // Last page
    page++;
  }

  console.log(`[Strava] Fetched ${all.length} running activities across ${page} page(s)`);
  return all;
}

export async function deregisterFromStrava(
  accessToken: string
): Promise<void> {
  try {
    await axios.post(
      `${STRAVA_API_BASE}/athlete/deauthorize`,
      {},
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    console.log('[Strava] Deregistration successful');
  } catch (error: any) {
    console.error('[Strava] Deregistration failed:', error.message);
    throw new Error(`Strava deregistration failed: ${error.message}`);
  }
}
