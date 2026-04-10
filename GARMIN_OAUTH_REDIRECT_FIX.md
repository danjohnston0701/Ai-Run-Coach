# Garmin OAuth Redirect Issue - Root Cause & Fix

## Problem
When connecting Garmin from the Android app's "Connected Apps" settings:
- ✗ Takes you to the Garmin auth endpoint URL
- ✗ Does NOT redirect to Garmin's authorization/login page
- ✗ No authorization prompt appears

## Root Cause

The issue was in `server/garmin-service.ts` line 7:

```typescript
// WRONG - this is not the OAuth 2.0 authorization endpoint
const GARMIN_AUTH_URL = 'https://connect.garmin.com/oauth2Confirm';
```

The problem:
1. **`https://connect.garmin.com/oauth2Confirm`** is NOT a valid OAuth 2.0 authorization endpoint
2. You're using the **DiAuth token endpoint** (`diauth.garmin.com/di-oauth2-service/oauth/token`) but the **wrong auth endpoint**
3. Garmin's OAuth 2.0 flow requires the DiAuth authorization service, not the Connect web server

## Solution

**Changed the authorization URL to the correct Garmin OAuth 2.0 endpoint:**

```typescript
// CORRECT - DiAuth OAuth 2.0 authorization endpoint
const GARMIN_AUTH_URL = 'https://diauth.garmin.com/oauth-service/oauth/authorize';
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/oauth-service/oauth/token';
```

### What This Changes

#### Before (BROKEN):
1. Android app requests: `GET /api/auth/garmin`
2. Server responds with URL: `https://connect.garmin.com/oauth2Confirm?client_id=...&redirect_uri=...`
3. Browser/WebView navigates to this URL
4. ❌ **Garmin's server rejects it or returns an error page** (not a valid OAuth endpoint)
5. No authorization page appears

#### After (FIXED):
1. Android app requests: `GET /api/auth/garmin`
2. Server responds with URL: `https://diauth.garmin.com/oauth-service/oauth/authorize?client_id=...&redirect_uri=...`
3. Browser/WebView navigates to this URL
4. ✅ **Garmin's DiAuth service recognizes it as a valid OAuth request**
5. **Redirects to Garmin's login/authorization page**
6. User authorizes the app
7. Garmin redirects back to your callback URL with the auth `code`

## Verification Checklist

- [ ] **Redeploy the server** with the updated `garmin-service.ts`
- [ ] **Clear app cache** on your Android device (Settings > Apps > AI Run Coach > Storage > Clear Cache)
- [ ] **Try connecting Garmin again** from Connected Apps
- [ ] **Verify you see Garmin's login page** (username/email prompt)
- [ ] **Check server logs** for this message:
  ```
  [Garmin Auth] Generated auth URL: https://diauth.garmin.com/oauth-service/oauth/authorize?...
  ```
- [ ] **Successful flow**:
  - Login to Garmin
  - See permission/scope approval screen
  - Get redirected back to your app with auth code
  - Receive "Successfully connected" message in the app

## Files Changed

- `server/garmin-service.ts` (line 6-8): Updated OAuth endpoints

## Why This Happened

Your project had comments indicating awareness of the issue:
```typescript
// Garmin Health API base (for wellness data - works with OAuth 2.0)
const GARMIN_API_BASE = 'https://apis.garmin.com';
```

But the authorization URL was pointing to the old `connect.garmin.com` domain instead of the modern `diauth.garmin.com` service that Garmin now uses for OAuth 2.0.

## Additional Notes

- **Scope Configuration**: Garmin scopes are typically configured in the [Garmin Developer Portal](https://developer.garmin.com), not in the auth URL
- **PKCE Implementation**: Your code correctly implements PKCE (Proof Key for Code Exchange), which is a security best practice
- **Callback Redirect**: Make sure `https://your-server/api/auth/garmin/callback` is registered in your Garmin app settings

## Testing the Fix

1. **Local testing**: If testing locally, ensure your callback URL matches what's registered in Garmin Developer Portal
2. **Production**: Verify your production domain is registered with Garmin
3. **Logs**: Monitor server logs during the OAuth flow to confirm:
   - Auth URL generation
   - Callback reception with `code` parameter
   - Token exchange success

## Related Documentation

- Garmin Developer: https://developer.garmin.com
- OAuth 2.0 PKCE: https://tools.ietf.org/html/rfc7636
- Your implementation: `garmin-service.ts`, `routes.ts` (lines 2686-2750)
