# Verify Strava Developer App Permissions

## Current Configuration

Your code is correctly configured to request:
- ✅ `activity:write` - Upload/create activities
- ✅ `activity:read_all` - Read all activities

**Location**: `server/strava-oauth-service.ts:79`

---

## How to Verify Your Strava App Settings

### Step 1: Go to Strava Developer Settings
1. Visit: https://www.strava.com/settings/api
2. Log in with your Strava account
3. Find your app (should be "AI Run Coach" or similar)

### Step 2: Check OAuth Scopes

Look for a section called **"Authorization Scopes"** or **"Permissions"**

**You need BOTH of these enabled:**
- ✅ **`activity:write`** - Allows uploading/creating activities
- ✅ **`activity:read_all`** - Allows reading all activities

**If you see these options:**
- ❌ `activity:read` (read public only) - NOT enough, need `activity:read_all`
- ❌ No write permission - NOT configured correctly

### Step 3: Check Authorization Callback Domain

Look for **"Authorization Callback Domain"**

**Must be set to:**
```
airuncoach.live
```

(Our env variable is: `STRAVA_REDIRECT_URI` = `https://airuncoach.live/strava/callback`)

---

## Test Your Permissions

Once verified, you can test by:

### 1. Test Reading Activities
```bash
curl -H "Authorization: Bearer <STRAVA_ACCESS_TOKEN>" \
  "https://www.strava.com/api/v3/athlete/activities?limit=1"
```

**Success Response:**
```json
[
  {
    "id": 12345678,
    "name": "Morning Run",
    "distance": 5200,
    "moving_time": 1800,
    ...
  }
]
```

**Error Response (means `activity:read_all` missing):**
```json
{
  "errors": [{"resource":"Activity","field":"id","code":"access_denied"}],
  "message": "..."
}
```

### 2. Test Upload Permission
```bash
curl -X POST \
  -H "Authorization: Bearer <STRAVA_ACCESS_TOKEN>" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@run.fit" \
  -F "data_type=fit" \
  -F "name=Test Upload" \
  "https://www.strava.com/api/v3/uploads"
```

**Success Response:**
```json
{
  "id": 987654321,
  "id_str": "987654321",
  "external_id": "run.fit",
  "error": null,
  "status": "Your activity is being processed.",
  "activity_id": null
}
```

**Error Response (means `activity:write` missing):**
```json
{
  "errors": [{"resource":"Upload","field":"activity","code":"access_denied"}],
  "message": "Authorization Error"
}
```

---

## Common Issues & Fixes

### Issue 1: Only `activity:read` Instead of `activity:read_all`

**Problem**: Can only read public activities, not private ones

**Fix**: 
1. Go to https://www.strava.com/settings/api
2. Look for permissions dropdown
3. Change from `activity:read` to `activity:read_all`
4. Re-authorize in app (users need to reconnect)

### Issue 2: Missing `activity:write`

**Problem**: Can read but not upload activities

**Fix**:
1. Go to https://www.strava.com/settings/api
2. Enable `activity:write` checkbox
3. Re-authorize in app (users need to reconnect)

### Issue 3: Wrong Redirect URI

**Problem**: OAuth callback fails, users can't connect

**Fix**:
1. Go to https://www.strava.com/settings/api
2. Set "Authorization Callback Domain" to: `airuncoach.live`
3. NOT `https://airuncoach.live` or `https://airuncoach.live/strava/callback`
4. Just the domain: `airuncoach.live`

---

## What Each Permission Does

| Scope | What It Allows | What It Blocks |
|-------|---|---|
| `activity:read` | Read public activities only | Can't read private activities |
| `activity:read_all` | Read all activities (public + private) | ✅ Can read everything |
| `activity:write` | Upload activities, create records | ✅ Can publish runs |
| `activity:read_all` + `activity:write` | Full read+write access | ✅ Complete solution |

---

## Verify Endpoint

You can also test directly via our code:

```bash
# Get Wayne's Strava connection status
curl -H "Authorization: Bearer <WAYNE_AUTH_TOKEN>" \
  "https://airuncoach.live/api/strava/connection-status"
```

Response shows:
```json
{
  "connected": true,
  "athleteName": "Wayne Clark",
  "athleteId": 12345678,
  "tokenExpired": false
}
```

If `connected: true` → Wayne's Strava account has authorized us ✅

---

## After Verifying Permissions

Once confirmed both scopes are enabled:

1. ✅ Users can upload runs to Strava
2. ✅ Users can fetch their Strava history
3. ✅ Admin endpoint to publish runs will work
4. ✅ Wayne can publish his runs automatically

---

## Checklist

- [ ] Visit https://www.strava.com/settings/api
- [ ] App is listed
- [ ] `activity:write` is enabled/checked
- [ ] `activity:read_all` is enabled/checked  
- [ ] Authorization Callback Domain = `airuncoach.live`
- [ ] Test `/api/strava/connection-status` endpoint
- [ ] Get 200 response with `connected: true`

If all checks pass → You're ready to publish! ✅

---

## Still Having Issues?

Check these files:
- **Strava OAuth service**: `server/strava-oauth-service.ts:79`
- **App settings**: https://www.strava.com/settings/api
- **Current scopes**: Visible when user authorizes (asks for permissions)

If Strava isn't asking for both `activity:read_all` AND `activity:write` permissions during OAuth, your app settings need updating.
