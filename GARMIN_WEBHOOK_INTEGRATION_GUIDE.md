# Garmin Webhook Integration Guide - Unified User Resolution

## Overview
Replace the inline user resolution logic in each webhook handler with the unified `resolveGarminUser()` function from `garmin-user-resolver.ts`.

## Step 1: Add Import to routes.ts

At the top of `routes.ts`, add:
```typescript
import { resolveGarminUser, resolveGarminUserByActivity } from "./garmin-user-resolver";
```

## Step 2: Update Each Webhook Handler

### Pattern to Replace:
```typescript
// OLD: Inline resolution logic (different in each handler)
let device;
if (userAccessToken) {
  device = await findUserByGarminToken(userAccessToken);
}
if (!device && userId) {
  // fallback logic
}
```

### New: Unified resolution
```typescript
// NEW: One-line resolution
const resolution = await resolveGarminUser(req.body);
if (!resolution) {
  return res.status(400).json({ error: "Could not map user" });
}
const userId = resolution.userId;
const device = resolution.device;
```

## Step 3: Webhooks to Update

### 1. **Daily Summary** (`garminWebhook("dailies", ...)`)
- **Current Issue**: Falls back to single-device if token fails (unreliable)
- **Fix**: Use `resolveGarminUser()` which properly tries token → ID → fallback

### 2. **Respiration** (`garminWebhook("respiration", ...)`)
- **Current Issue**: Never tries token matching, only userId→deviceId
- **Fix**: Use `resolveGarminUser()` to add token matching as first step

### 3. **Epochs** (`garminWebhook("epochs", ...)`)
- **Current Issue**: Same as respiration
- **Fix**: Use `resolveGarminUser()`

### 4. **Activities** (if applicable)
- **Issue**: May have date-based fallback that's unreliable
- **Fix**: Use `resolveGarminUserByActivity()` if you need activity matching

## Expected Impact

### Before:
- 20% of Garmin users get "Could not map" errors
- Dailies fail silently if token is stale
- Respiration never tries token matching

### After:
- All user resolution attempts token first (most reliable)
- Falls back to Garmin ID if token fails
- Consistent logic across all webhook types
- Better logging for debugging

## Testing Checklist

- [ ] Create test user with Garmin connected
- [ ] Trigger a daily summary webhook (Sleep, HRV, stress data)
- [ ] Verify logs show "Resolved user via token"
- [ ] Check respiration data comes through
- [ ] Manually update token to stale value
- [ ] Verify fallback to Garmin ID works
- [ ] Check error logs don't show "Could not map"

## Logging

All resolutions include:
- Method used (token / userId / single_device)
- User ID resolved
- Garmin ID (if applicable)

Example logs:
```
[Garmin] Resolved user via token: user_123 (method=token)
[Garmin] Resolved user via Garmin ID: user_456 (method=userId, garminId=344638)
[Garmin] Token provided but no matching device found (token may be stale)
[Garmin] Could not resolve user from webhook. token=true, garminId=344638
```

## Files Modified
- `server/routes.ts` - Update webhook handlers
- `server/garmin-user-resolver.ts` - NEW unified resolution logic
- `server/storage.ts` - NEW query methods (getConnectedDeviceByGarminToken, getConnectedDevicesByGarminId)
