# 🏃 Strava Integration Guide

## Overview

This guide covers the complete Strava integration for AI Run Coach, enabling users to publish their run data (including GPS tracks) directly to Strava with full route map generation.

**Architecture**: OAuth 2.0 → FIT file generation → Strava Uploads API → Async polling

---

## Part 1: Setup & Configuration

### 1.1 Create Strava API Application

1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Click **Create New Application**
3. Fill in:
   - **Application Name**: `AI Run Coach`
   - **Website**: `https://airuncoach.com`
   - **Application Description**: `AI-powered coaching app for runners`
   - **Category**: `Training`
4. Accept terms and create
5. Copy **Client ID** and **Client Secret** → store in `.env`

### 1.2 Configure Redirect URI

In Strava API settings:
- **Authorization Callback Domain**: `api.airuncoach.com` (or your backend domain)
- Strava will redirect to: `https://api.airuncoach.com/strava/callback`

### 1.3 Environment Variables

Add to `.env`:

```bash
# Strava OAuth
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here
STRAVA_REDIRECT_URI=https://api.airuncoach.com/strava/callback
```

### 1.4 Install Dependencies

```bash
npm install fit-file form-data axios @types/form-data
```

---

## Part 2: Server Implementation

### 2.1 Files Created

| File | Purpose |
|------|---------|
| `server/strava-oauth-service.ts` | OAuth authorization, token exchange, refresh |
| `server/strava-upload-service.ts` | FIT upload, async polling, activity fetching |
| `server/fit-file-generator.ts` | Convert run data to FIT binary format |
| `server/strava-oauth-bridge.ts` | OAuth callback handler, disconnect endpoint |

### 2.2 Routes to Add to `server/routes.ts`

Import the services at the top:

```typescript
import stravaOAuthRouter from './strava-oauth-bridge';
import {
  generateFitFile,
} from './fit-file-generator';
import {
  uploadRunToStrava,
  pollUploadStatus,
  deregisterFromStrava,
} from './strava-upload-service';
import { refreshStravaToken } from './strava-oauth-service';
```

Mount the OAuth router:

```typescript
// Around line 96 (next to garminOAuthRouter)
app.use(stravaOAuthRouter);
```

Add these endpoints:

```typescript
// ─────────────────────────────────────────────────────────────────────────
// STRAVA INTEGRATION
// ─────────────────────────────────────────────────────────────────────────

/**
 * POST /api/runs/:runId/publish-strava
 * Publish a completed run to Strava
 * 
 * Returns:
 * {
 *   "success": true,
 *   "activityId": 12345,
 *   "stravaUrl": "https://www.strava.com/activities/12345"
 * }
 */
app.post('/api/runs/:runId/publish-strava', requireAuth, async (req, res) => {
  try {
    const { runId } = req.params;
    const userId = req.user?.id;

    // Fetch run
    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // Check if already published to Strava
    if (run.externalSource === 'strava' && run.externalId) {
      return res.status(400).json({ 
        error: 'Run already published to Strava',
        activityId: run.externalId
      });
    }

    // Fetch Strava device
    const [stravaDevice] = await db
      .select()
      .from(connectedDevices)
      .where(
        and(
          eq(connectedDevices.userId, userId),
          eq(connectedDevices.deviceType, 'strava'),
          eq(connectedDevices.isActive, true)
        )
      )
      .limit(1);

    if (!stravaDevice) {
      return res.status(400).json({ error: 'Strava not connected' });
    }

    let accessToken = stravaDevice.accessToken;

    // Check if token is expired and refresh if needed
    if (stravaDevice.tokenExpiresAt && stravaDevice.tokenExpiresAt < new Date()) {
      if (!stravaDevice.refreshToken) {
        return res.status(401).json({ error: 'Token expired, please reconnect Strava' });
      }

      try {
        const { accessToken: newToken, refreshToken: newRefresh, expiresAt } =
          await refreshStravaToken(stravaDevice.refreshToken);

        await db
          .update(connectedDevices)
          .set({
            accessToken: newToken,
            refreshToken: newRefresh,
            tokenExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(connectedDevices.id, stravaDevice.id));

        accessToken = newToken;
      } catch (error) {
        return res.status(401).json({ error: 'Strava token refresh failed, please reconnect' });
      }
    }

    // Generate FIT file from run data
    const fitFile = await generateFitFile(run);

    // Upload to Strava
    const { uploadId } = await uploadRunToStrava(
      fitFile,
      accessToken,
      run.name || 'AI Run Coach Run',
      run.userComments || `Distance: ${run.distance}km | Duration: ${run.duration}s`,
      `airuncoach-${runId}` // External ID to prevent duplicates
    );

    console.log(`[Strava] Starting async poll for upload ${uploadId}`);

    // Start async polling in background
    // In production, queue this to a job processor (Bull, BullMQ, etc.)
    pollUploadAndSaveActivity(uploadId, accessToken, runId, userId).catch(error => {
      console.error(`[Strava] Background polling failed for run ${runId}:`, error);
      // Log to database or monitoring system
    });

    // Return immediately with upload ID
    res.json({
      success: true,
      uploadId,
      message: 'Run submitted to Strava. Publishing in background...',
    });
  } catch (error: any) {
    console.error('[Strava Publish] Error:', error.message);
    res.status(500).json({ error: `Failed to publish run: ${error.message}` });
  }
});

/**
 * Helper: Poll upload status and save activity ID
 * Run this asynchronously in background
 */
async function pollUploadAndSaveActivity(
  uploadId: number,
  accessToken: string,
  runId: string,
  userId: string
): Promise<void> {
  try {
    // Poll with 30 attempts, 2s between each
    const activityId = await pollUploadStatus(uploadId, accessToken, 30, 2000);

    // Update run with Strava activity ID
    await db
      .update(runs)
      .set({
        externalId: activityId.toString(),
        externalSource: 'strava',
      })
      .where(eq(runs.id, runId));

    console.log(`✅ [Strava] Run published successfully: activity ${activityId}`);

    // Optional: Send notification to user
    // await createNotification(userId, {
    //   title: 'Run published to Strava! 🎉',
    //   body: `https://strava.com/activities/${activityId}`,
    //   type: 'strava_published'
    // });
  } catch (error: any) {
    console.error(`[Strava] Failed to publish run ${runId}:`, error.message);
    // Log failure for user to retry
  }
}

/**
 * GET /api/strava/connection-status
 * Check Strava connection status for current user
 */
app.get('/api/strava/connection-status', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

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
      return res.json({ connected: false });
    }

    const isExpired = device.tokenExpiresAt && device.tokenExpiresAt < new Date();

    res.json({
      connected: device.isActive && !isExpired,
      athleteName: device.deviceName || 'Strava Athlete',
      athleteId: device.deviceId,
      lastSync: device.lastSyncAt,
      tokenExpired: isExpired,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/strava/activities
 * Fetch list of runs synced to Strava for current user
 */
app.get('/api/strava/activities', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Get all runs that were published to Strava
    const stravaRuns = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          eq(runs.externalSource, 'strava')
        )
      )
      .orderBy(desc(runs.completedAt));

    res.json({
      count: stravaRuns.length,
      activities: stravaRuns.map(run => ({
        id: run.id,
        name: run.name,
        distance: run.distance,
        duration: run.duration,
        completedAt: run.completedAt,
        stravaUrl: `https://www.strava.com/activities/${run.externalId}`,
        stravaId: run.externalId,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## Part 3: Client Implementation (Android/iOS)

### 3.1 Android Kotlin

**Step 1: Add Strava connection in settings screen**

```kotlin
// In SettingsViewModel or similar
suspend fun connectStrava() {
  val response = apiService.post<AuthUrlResponse>(
    "/api/strava/auth/authorize",
    emptyMap()
  )
  // Open browser to response.authUrl
  openBrowser(response.authUrl)
}

suspend fun checkStravaStatus() {
  val response = apiService.get<StravaStatus>(
    "/api/strava/connection-status"
  )
  // Update UI with response.connected, response.athleteName
}

suspend fun disconnectStrava() {
  apiService.post<Unit>("/api/strava/disconnect", emptyMap())
  // Refresh UI
}
```

**Step 2: Add "Share to Strava" button in post-run screen**

```kotlin
Button(
  text = "Share to Strava",
  onClick = { viewModel.publishToStrava(runId) }
)
```

**Step 3: Handle OAuth callback**

In AndroidManifest.xml:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data
    android:scheme="airuncoach"
    android:host="strava"
    android:pathPrefix="/auth-complete" />
</intent-filter>
```

### 3.2 iOS Swift

**Step 1: Add Strava connection in settings**

```swift
@State private var stravaAuthUrl: String?
@State private var isConnected = false

func connectStrava() {
  Task {
    do {
      let response = try await apiService.post(
        "/api/strava/auth/authorize",
        body: [:]
      )
      stravaAuthUrl = response["authUrl"] as? String
      
      // Open in Safari
      if let url = URL(string: stravaAuthUrl ?? "") {
        await openURL(url)
      }
    } catch {
      print("Failed to initiate Strava auth: \(error)")
    }
  }
}

func checkStravaStatus() {
  Task {
    do {
      let response = try await apiService.get("/api/strava/connection-status")
      isConnected = response["connected"] as? Bool ?? false
    } catch {
      print("Failed to check Strava status: \(error)")
    }
  }
}
```

**Step 2: Handle OAuth callback in URL scheme**

```swift
func handleDeeplink(_ url: URL) {
  if url.scheme == "airuncoach" && url.host == "strava" {
    let success = URLComponents(url: url, resolvingAgainstBaseURL: true)?
      .queryItems?
      .first(where: { $0.name == "success" })?
      .value == "true"
    
    if success {
      checkStravaStatus()
      showAlert("Strava Connected! ✅")
    } else {
      let error = URLComponents(url: url, resolvingAgainstBaseURL: true)?
        .queryItems?
        .first(where: { $0.name == "error" })?
        .value ?? "Unknown error"
      showAlert("Strava connection failed: \(error)")
    }
  }
}
```

---

## Part 4: Testing

### 4.1 Manual Testing Checklist

- [ ] User can click "Connect Strava" in settings
- [ ] Browser opens to Strava OAuth page
- [ ] User approves and redirects back to app
- [ ] Connection status shows as "Connected"
- [ ] Athlete name is displayed
- [ ] "Share to Strava" button appears in post-run
- [ ] Clicking share uploads FIT file
- [ ] Status shows "Publishing..."
- [ ] After ~10-20 seconds, activity appears in Strava
- [ ] Activity has correct: name, distance, duration, GPS track, HR, cadence
- [ ] User can click Strava link to view activity
- [ ] User can disconnect Strava
- [ ] Disconnected runs can't be reshared

### 4.2 API Testing

```bash
# 1. Initiate OAuth
curl -X POST http://localhost:3000/api/strava/auth/authorize \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Response:
# {
#   "authUrl": "https://www.strava.com/oauth/authorize?...",
#   "state": "abc123..."
# }

# 2. Check connection status
curl http://localhost:3000/api/strava/connection-status \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Publish run to Strava
curl -X POST http://localhost:3000/api/runs/RUN_ID/publish-strava \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Response:
# {
#   "success": true,
#   "uploadId": 12345,
#   "message": "Run submitted to Strava. Publishing in background..."
# }

# 4. Check activity list
curl http://localhost:3000/api/strava/activities \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Part 5: Data Format Reference

### FIT File Structure

The FIT file contains:

```
File Header
├── Device Info (manufacturer, software version)
├── File ID (type: activity, timestamps)
├── Activity Session
├── Lap Summary
└── Trackpoints (one per second of GPS data)
    ├── Timestamp
    ├── Latitude / Longitude
    ├── Altitude
    ├── Distance
    ├── Speed
    ├── Heart Rate
    ├── Cadence
    └── Optional: Temperature, Power
```

**Why FIT vs GPX/TCX?**

| Format | GPS | HR | Cadence | Power | Elevation | Strava Route Map |
|--------|-----|----|---------|----|-----------|-----------------|
| **FIT** | ✅ | ✅ | ✅ | ✅ | ✅ (from file) | ✅ Best |
| **GPX** | ✅ | ⚠️ (extensions) | ⚠️ | ❌ | ✅ | ✅ Good |
| **TCX** | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ Good |

We use **FIT** for best fidelity and Strava compatibility.

---

## Part 6: Error Handling

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Strava not connected" | User hasn't authorized app | Show "Connect Strava" button |
| "Token expired" | OAuth token > 6 hours old | Refresh using refreshToken |
| "Upload timeout" | Strava processing delayed | Extend maxAttempts or use webhooks |
| "GPS track missing" | No gpsTrack data in run | Validate data before upload |
| "Invalid state" | CSRF token mismatch | Verify state in database |

### Retry Logic

```typescript
// Automatic token refresh on 401
if (error.response.status === 401) {
  const newToken = await refreshStravaToken(device.refreshToken);
  // Retry request with new token
}
```

---

## Part 7: Production Checklist

### Before Going Live

- [ ] Strava API credentials set in production `.env`
- [ ] STRAVA_REDIRECT_URI matches Strava app settings
- [ ] Database migrations run (if schema changes)
- [ ] Error logging configured (Sentry, DataDog, etc.)
- [ ] Background job processor set up for polling (Bull, BullMQ, Resque)
- [ ] Rate limiting on `/api/runs/:runId/publish-strava` (max 100 uploads/hour)
- [ ] Monitoring on `/strava/callback` for 4xx/5xx errors
- [ ] User notification system ready (email/push on publish)
- [ ] Strava app reviewed and approved by Strava team (if needed)

### Scaling Recommendations

**For high-volume uploads:**

1. Use **Bull job queue** instead of setTimeout
   ```typescript
   import Bull from 'bull';
   const uploadQueue = new Bull('strava-uploads', process.env.REDIS_URL);
   uploadQueue.process(async (job) => {
     await pollUploadAndSaveActivity(job.data);
   });
   ```

2. Use **Strava webhooks** instead of polling (faster)
   ```
   POST /api/strava/webhook - Strava sends activity ready event
   ```

3. Cache athlete info
   ```typescript
   await redis.set(`strava-athlete:${athleteId}`, athleteInfo, 'EX', 86400);
   ```

---

## Part 8: API Reference

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/strava/auth/authorize` | ✅ | Get OAuth URL |
| GET | `/strava/callback` | ❌ | OAuth callback handler |
| POST | `/api/strava/disconnect` | ✅ | Disconnect Strava |
| GET | `/api/strava/connection-status` | ✅ | Check connection |
| POST | `/api/runs/:runId/publish-strava` | ✅ | Publish run to Strava |
| GET | `/api/strava/activities` | ✅ | List Strava activities |

---

## Appendix: Example Run Data

```json
{
  "id": "run-123",
  "userId": "user-456",
  "name": "Morning 5K",
  "distance": 5.2,
  "duration": 1800,
  "avgPace": "5:45",
  "avgHeartRate": 165,
  "maxHeartRate": 178,
  "avgSpeed": 2.89,
  "maxSpeed": 3.2,
  "cadence": 178,
  "elevation": 45,
  "elevationGain": 120,
  "elevationLoss": 118,
  "completedAt": "2026-05-19T08:30:00Z",
  "gpsTrack": [
    {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "altitude": 10,
      "speed": 2.8,
      "heartRate": 160,
      "cadence": 175,
      "timestamp": 0
    },
    // ... more points every ~1 second
  ]
}
```

---

**Questions? Issues?** File a GitHub issue or check Strava API docs: https://developers.strava.com/
