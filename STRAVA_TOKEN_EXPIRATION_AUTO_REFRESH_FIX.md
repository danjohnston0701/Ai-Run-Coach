# Strava Token Expiration Auto-Refresh Fix

## Problem

Wayne connected Strava last night but when he logged in this morning, Strava showed as "disconnected" even though his connection was still valid.

**Why**: Strava access tokens expire after **6 hours**. When Wayne checked his connection status the next morning, the token was expired. The app showed "disconnected" without trying to refresh it.

---

## Root Cause

The `/api/strava/connection-status` endpoint checked if the token was expired:
```typescript
const isExpired = device.tokenExpiresAt && device.tokenExpiresAt < new Date();

res.json({
  connected: device.isActive && !isExpired,  // ← Shows false if token expired
  // ...
});
```

But it **never attempted to refresh the token**. Strava provides a refresh token specifically for this purpose, but we weren't using it.

---

## Solution

Modified `/api/strava/connection-status` to **automatically refresh expired tokens** when the app checks connection status.

**New Logic**:
1. Check if token is expired
2. If expired AND we have a refresh token → **auto-refresh immediately**
3. Save new tokens to database
4. Return `connected: true` ✅
5. If refresh fails → return `connected: false` with error message

---

## How It Works

```typescript
// Before: Token expired → shows disconnected
if (isExpired && device.refreshToken) {
  // NEW: Try to refresh the token
  const refreshed = await refreshStravaToken(device.refreshToken);
  
  // Save new tokens to database
  await db.update(connectedDevices).set({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    tokenExpiresAt: refreshed.expiresAt,  // New 6-hour window
  });
  
  // Now token is valid again!
  connected: true ✅
}
```

---

## User Experience After Fix

**Before** (Broken):
```
1. Wayne connects Strava (token valid for 6 hours)
2. Goes to bed
3. Wakes up 10 hours later
4. Opens app
5. Checks connected devices
6. Shows "Strava: Disconnected" ❌
7. Wayne confused "Did it disconnect?"
8. Has to reconnect manually
```

**After** (Fixed):
```
1. Wayne connects Strava (token valid for 6 hours)
2. Goes to bed
3. Wakes up 10 hours later
4. Opens app
5. Checks connected devices
6. App silently refreshes token
7. Shows "Strava: Connected" ✅
8. Works seamlessly, Wayne never knows
```

---

## What Changed

**File**: `server/routes.ts` (lines 10721-10758)

**Changes**:
- Added auto-refresh logic using `refreshStravaToken()`
- Updates database with new tokens after successful refresh
- Returns connection status based on whether refresh succeeded
- If refresh fails, returns error message so user can reconnect manually

---

## Strava Token Lifecycle

| Time | State | Action |
|------|-------|--------|
| T+0h | New | Token valid for 6 hours |
| T+5h | Valid | App works normally |
| T+6h | Expired | Old: shows "disconnected" ❌<br>New: auto-refreshes ✅ |
| T+6h:01s | Refreshed | New token valid for 6 more hours |
| T+12h | Valid | App still works |
| T+13h | Expired | Auto-refreshes again ✅ |

**Result**: Users stay connected indefinitely without manual reconnection!

---

## Technical Details

### Refresh Token Request to Strava
```
POST https://www.strava.com/api/v3/oauth/token
{
  "client_id": STRAVA_CLIENT_ID,
  "client_secret": STRAVA_CLIENT_SECRET,
  "grant_type": "refresh_token",
  "refresh_token": <stored_refresh_token>
}
```

Strava returns:
```json
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",
  "expires_at": 1717545600
}
```

We store these in the database and use the new access token immediately.

---

## Error Handling

If token refresh **fails** (e.g., user revoked access on Strava):
- Endpoint returns `connected: false`
- Includes error message: `"Token refresh failed - please reconnect Strava"`
- User can reconnect manually

---

## Performance Impact

- **Minimal**: Only refreshes when token is actually expired
- **Transparent**: No user action required
- **Fast**: Happens in background during connection check (already a server call)

---

## Backwards Compatible

✅ No schema changes  
✅ No API contract changes  
✅ Existing connections work fine  
✅ New connections also get auto-refresh  

---

## Testing

**Test Case 1: Fresh Connection**
1. Connect Strava
2. Check connection status → `connected: true`
3. Wait 6+ hours
4. Check connection status again → Should still show `connected: true` ✅

**Test Case 2: Revoked Access**
1. Connect Strava
2. Go to Strava app, revoke app access
3. Check connection status
4. Should show `connected: false` with error message ✅

**Test Case 3: Overnight Disconnect**
1. Connect Strava at night
2. Don't use app for 8 hours
3. Open app in morning
4. Should show connected and import should work ✅

---

## Related Code

- `server/strava-oauth-service.ts` - `refreshStravaToken()` function
- `server/strava-oauth-bridge.ts` - Initial token exchange
- `shared/schema.ts` - connectedDevices table definition

---

## Summary

✅ **Problem**: Token expires after 6 hours, users see "disconnected" overnight  
✅ **Solution**: Auto-refresh token when checking connection status  
✅ **Result**: Users stay connected indefinitely without manual action  
✅ **Implementation**: One endpoint change, leverages existing refresh token infrastructure  

🚀 **Ready to deploy**
