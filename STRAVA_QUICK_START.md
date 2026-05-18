# 🚀 Strava Integration - Quick Start

## What Was Created

✅ **4 new service files** for Strava integration
✅ **Dependencies installed** (fit-file, form-data, axios)
✅ **Complete implementation guide** with code examples

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `server/strava-oauth-service.ts` | 180 | OAuth flow, token exchange/refresh |
| `server/strava-upload-service.ts` | 140 | FIT upload, async polling, activity fetch |
| `server/fit-file-generator.ts` | 120 | Convert run data to FIT binary format |
| `server/strava-oauth-bridge.ts` | 200 | OAuth callback handler, disconnect |
| `STRAVA_INTEGRATION_GUIDE.md` | 600+ | Complete setup & implementation |

---

## Next Steps (Implementation Checklist)

### 1️⃣ Environment Setup (5 minutes)

```bash
# 1. Create Strava API app
# Go to: https://www.strava.com/settings/api
# - Create New Application
# - Copy Client ID & Secret

# 2. Add to .env
echo "STRAVA_CLIENT_ID=your_id_here" >> .env
echo "STRAVA_CLIENT_SECRET=your_secret_here" >> .env
echo "STRAVA_REDIRECT_URI=https://api.airuncoach.com/strava/callback" >> .env

# 3. Verify dependencies
npm list fit-file form-data axios
```

### 2️⃣ Backend Routes (10 minutes)

In `server/routes.ts`:

```typescript
// At the top, add imports:
import stravaOAuthRouter from './strava-oauth-bridge';
import { generateFitFile } from './fit-file-generator';
import { uploadRunToStrava, pollUploadStatus } from './strava-upload-service';
import { refreshStravaToken } from './strava-oauth-service';

// Mount router (after garminOAuthRouter):
app.use(stravaOAuthRouter);

// Add endpoints from STRAVA_INTEGRATION_GUIDE.md section "Part 2.2"
```

### 3️⃣ Database Schema (Optional - Already Compatible)

The `connectedDevices` table already supports Strava:

```typescript
// From shared/schema.ts (already exists)
deviceType: text("device_type").notNull(), // 'garmin' | 'strava' | etc
deviceId: text("device_id"), // Strava athlete ID
accessToken: text("access_token"), // Encrypted OAuth token
refreshToken: text("refresh_token"), // Encrypted refresh token
tokenExpiresAt: timestamp("token_expires_at"),
isActive: boolean("is_active").default(true),
```

✅ **No migrations needed!**

### 4️⃣ Android Integration (15 minutes)

```kotlin
// Add to settings screen
Button(text = "Connect Strava") {
  viewModel.initiateStravaAuth()
}

// Handle callback in MainActivity
override fun onNewIntent(intent: Intent?) {
  super.onNewIntent(intent)
  if (intent?.data?.scheme == "airuncoach") {
    val success = intent.data?.getQueryParameter("success") == "true"
    if (success) {
      showToast("Strava Connected! ✅")
    }
  }
}

// Publish run to Strava
Button(text = "Share to Strava") {
  viewModel.publishToStrava(runId)
}
```

### 5️⃣ iOS Integration (15 minutes)

```swift
// Add to settings view
Button("Connect Strava") {
  Task {
    do {
      let response = try await apiService.post(
        "/api/strava/auth/authorize",
        body: [:]
      )
      if let authUrl = response["authUrl"] as? String,
         let url = URL(string: authUrl) {
        await openURL(url)
      }
    } catch {
      showAlert("Failed: \(error)")
    }
  }
}

// Handle callback
.onOpenURL { url in
  if url.scheme == "airuncoach" && url.host == "strava" {
    let success = URLComponents(url: url, resolvingAgainstBaseURL: true)?
      .queryItems?.first(where: { $0.name == "success" })?.value == "true"
    
    if success {
      showAlert("Strava Connected! ✅")
    }
  }
}
```

---

## API Endpoints Summary

### OAuth Flow

```
1. POST /api/strava/auth/authorize
   → Returns: { authUrl, state }
   → Redirect user to authUrl

2. User authorizes in Strava

3. GET /strava/callback?code=...&state=...
   → Backend exchanges code for token
   → Stores in connectedDevices table
   → Redirects to: airuncoach://strava/auth-complete?success=true
```

### Publishing Runs

```
POST /api/runs/{runId}/publish-strava
  ├─ Check Strava connection
  ├─ Refresh token if expired
  ├─ Generate FIT file from run data
  ├─ Upload to Strava /uploads API
  ├─ Start async polling
  └─ Return: { uploadId, message }

Background polling:
  ├─ Poll /uploads/{uploadId} every 2 seconds
  ├─ Max 30 attempts (60 seconds total)
  ├─ On success: Update run with Strava activity ID
  └─ Return: { activityId, stravaUrl }
```

### Status & Info

```
GET /api/strava/connection-status
  ← { connected, athleteName, lastSync, tokenExpired }

GET /api/strava/activities
  ← { count, activities: [{ stravaId, name, distance, stravaUrl }] }

POST /api/strava/disconnect
  ├─ Deregister from Strava
  └─ Mark device as inactive
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ User completes run on phone                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ Run saved with GPS track, HR │
        │ cadence, elevation, etc      │
        └──────────────┬───────────────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
        ┌─────────────┐  ┌──────────────┐
        │ Check: Is   │  │ Strava       │
        │ Strava      │  │ connected?   │
        │ connected?  │  └──────────────┘
        └─────────────┘
              │
        ┌─────┴─────┐
        │           │
       No          Yes
        │           │
        │           ▼
        │    ┌──────────────────────┐
        │    │ Token expired?       │
        │    │ Refresh if needed    │
        │    └──────────┬───────────┘
        │               │
        │               ▼
        │    ┌──────────────────────┐
        │    │ Generate FIT file    │
        │    │ from run data        │
        │    │ (GPS + HR + cadence) │
        │    └──────────┬───────────┘
        │               │
        │               ▼
        │    ┌──────────────────────┐
        │    │ Upload to Strava     │
        │    │ POST /uploads API    │
        │    └──────────┬───────────┘
        │               │
        │               ▼
        │    ┌──────────────────────┐
        │    │ Poll /uploads/{id}   │
        │    │ until Ready (async)  │
        │    └──────────┬───────────┘
        │               │
        │               ▼
        │    ┌──────────────────────┐
        │    │ Strava activity ID   │
        │    │ saved to runs table   │
        │    └──────────┬───────────┘
        │               │
        │               ▼
        │    ┌──────────────────────┐
        │    │ User sees:           │
        │    │ "Published to Strava │
        │    │  View Activity"      │
        │    └──────────────────────┘
        │
        ▼
  ┌─────────────────────┐
  │ Show: "Connect      │
  │ Strava" button      │
  └─────────────────────┘
```

---

## Testing Commands

```bash
# 1. Test OAuth init
curl -X POST http://localhost:3000/api/strava/auth/authorize \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# 2. Test connection status
curl http://localhost:3000/api/strava/connection-status \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Test publish (after Strava is connected)
curl -X POST http://localhost:3000/api/runs/YOUR_RUN_ID/publish-strava \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Check Strava activity list
curl http://localhost:3000/api/strava/activities \
  -H "Authorization: Bearer YOUR_TOKEN"

# 5. Disconnect Strava
curl -X POST http://localhost:3000/api/strava/disconnect \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Common Questions

**Q: Why FIT format?**
A: FIT is Garmin's format, universally supported. Strava prefers it for best GPS accuracy and metric preservation.

**Q: What if Strava upload fails?**
A: We retry with exponential backoff. If it fails, user can manually re-publish.

**Q: Do we need user's phone GPS?**
A: No! We use the GPS data already stored in the run (from Garmin watch sync or manual tracking).

**Q: What about token expiration?**
A: We auto-refresh using refreshToken. If that fails, user re-authorizes.

**Q: Can we use webhooks instead of polling?**
A: Yes! See "Production Checklist" in main guide. But polling works fine for MVP.

**Q: How do we handle duplicates?**
A: We use `external_id` parameter: `airuncoach-{runId}`. Strava prevents re-uploading same ID.

---

## Estimated Implementation Time

| Task | Time |
|------|------|
| Environment setup | 5 min |
| Add routes to server | 10 min |
| Android UI | 15 min |
| iOS UI | 15 min |
| Testing & debugging | 30 min |
| **Total** | **~75 min** |

---

## Files Reference

- **Setup**: See `STRAVA_INTEGRATION_GUIDE.md` section 1-2
- **Backend**: See `STRAVA_INTEGRATION_GUIDE.md` section 2
- **Client**: See `STRAVA_INTEGRATION_GUIDE.md` section 3
- **Testing**: See `STRAVA_INTEGRATION_GUIDE.md` section 4
- **Production**: See `STRAVA_INTEGRATION_GUIDE.md` section 7

---

## Support

Need help? Check:
1. `STRAVA_INTEGRATION_GUIDE.md` (full documentation)
2. Strava API docs: https://developers.strava.com/
3. Server logs: `[Strava]` prefix for all logs

Good luck! 🏃‍♂️🚀
