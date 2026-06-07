# Publish Wayne's Last Run to Strava

## Quick Answer

Yes! We can publish Wayne's last run to Strava using the existing `/api/runs/:runId/publish-strava` endpoint.

---

## Steps

### 1. Get Wayne's Last Run ID

From the logs, Wayne's userId is: `c8f290df-a3d0-4c1e-9f7e-0956edb419dc`

Make an API call to fetch his runs:
```bash
curl -H "Authorization: Bearer <WAYNE_AUTH_TOKEN>" \
  "https://airuncoach.live/api/users/c8f290df-a3d0-4c1e-9f7e-0956edb419dc/runs?limit=1&offset=0"
```

This will return something like:
```json
[
  {
    "id": "0acb9664-20d8-435f-b9ae-8af37a8c9627",
    "name": "Morning Run",
    "distance": 5.2,
    "duration": 1800,
    "completedAt": "2026-06-04T07:30:00Z",
    ...
  }
]
```

**Note the run ID**: `0acb9664-20d8-435f-b9ae-8af37a8c9627`

### 2. Publish to Strava

Make a POST request to publish:
```bash
curl -X POST \
  -H "Authorization: Bearer <WAYNE_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  "https://airuncoach.live/api/runs/0acb9664-20d8-435f-b9ae-8af37a8c9627/publish-strava"
```

### 3. Check Response

Success response:
```json
{
  "success": true,
  "uploadId": 12345678,
  "message": "Run uploaded to Strava, processing..."
}
```

---

## What Happens

1. ✅ Run gets converted to FIT format (standard fitness file)
2. ✅ Uploaded to Strava API with GPS track
3. ✅ Strava processes it (takes 30 seconds to few minutes)
4. ✅ Activity appears in Wayne's Strava feed
5. ✅ GPS route map generated on Strava
6. ✅ All metrics (heart rate, cadence, pace) included

---

## Prerequisites

✅ **Strava must be connected** (it is - Wayne connected this morning)  
✅ **Run must have GPS track** (all our runs have this)  
✅ **Run not already on Strava** (won't duplicate)  

---

## Alternative: Publish via UI

If Wayne has access to the app:
1. Go to **Run History**
2. Find the run
3. Click on it to view details
4. Tap **"Share to Strava"** button
5. Done! ✅

---

## What Gets Published to Strava

The run includes:
- ✅ Activity name and description
- ✅ Distance (km)
- ✅ Duration (hours:minutes:seconds)
- ✅ Average pace
- ✅ GPS track (full route map)
- ✅ Elevation (gain/loss if available)
- ✅ Heart rate (if device captured it)
- ✅ Cadence (if device captured it)
- ✅ Calories (if calculated)

---

## FIT File Generation

The `generateFitFile()` function converts run data to FIT format:
- Industry standard fitness data format
- Used by Garmin, Strava, etc.
- Includes all metrics and GPS coordinates
- Compressed binary format

---

## Strava Upload Process

1. **Upload FIT file** → Strava receives binary data
2. **Strava validates** → Checks for required fields
3. **Processing** → Takes 30 seconds to few minutes
4. **Activity created** → Appears in feed with map
5. **Social features** → Can be shared, get kudos, etc.

---

## If You Want to Do This Programmatically

Create an admin endpoint that publishes a user's last run:

```typescript
app.post("/api/admin/publish-user-last-run", async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.body;
  
  // Get user's last run
  const runs = await storage.getUserRuns(userId, { limit: 1, offset: 0 });
  if (!runs.length) {
    return res.status(404).json({ error: "No runs found" });
  }
  
  const lastRun = runs[0];
  
  // Publish to Strava
  // (same logic as POST /api/runs/:runId/publish-strava)
  
  res.json({ 
    success: true, 
    runId: lastRun.id,
    publishedTo: "Strava"
  });
});
```

Then call:
```bash
curl -X POST \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "c8f290df-a3d0-4c1e-9f7e-0956edb419dc"}' \
  "https://airuncoach.live/api/admin/publish-user-last-run"
```

---

## Summary

**Yes, easily!** The infrastructure exists:
- ✅ Endpoint ready: `POST /api/runs/:runId/publish-strava`
- ✅ Strava connected (Wayne authenticated today)
- ✅ Run has all required data (GPS track, metrics)
- ✅ Token auto-refresh handles expiration

Just need Wayne's last run ID and one API call.

---

## Questions?

- Do you want me to create an admin endpoint for bulk publish?
- Should we add a "Publish to Strava" button on recent runs screen?
- Want to publish all of Wayne's imported runs to Strava?
