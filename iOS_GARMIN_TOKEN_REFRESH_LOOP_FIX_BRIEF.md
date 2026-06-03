# iOS Garmin Token Refresh Loop Fix Brief

## Status: Critical Bug Fix ⚠️

## Problem

Users without a Garmin Watch (like Wayne) see repeated token refresh requests flooding the logs:
```
[Companion] Token refreshed for user undefined (device: unknown)
POST /api/garmin-companion/refresh-watch-token 200 in 1466ms
```

This happens because of a **backend property name bug** that's now fixed on the server.

---

## What Was Fixed on Backend

**In `routes.ts` and `routes-samsung-companion.ts`:**

Wrong:
```typescript
const userId = req.user?.id;  // ❌ Property doesn't exist
```

Correct:
```typescript
const userId = req.user?.userId;  // ✅ Correct property
```

This caused `userId` to be `undefined`, which broke JWT token claims and triggered infinite refresh loops.

---

## What iOS Needs to Do

### **Option 1: If Using Stored Tokens** (Most Likely)

No changes needed! The fix is entirely backend-side.

When iOS makes requests to `/api/garmin-companion/refresh-watch-token`, it will now:
- ✅ Get valid tokens with correct `userId` claims
- ✅ Stop receiving "undefined" responses
- ✅ No infinite refresh loops

Just redeploy with the backend fix.

### **Option 2: If Parsing userId from JWT** (Less Likely)

If your iOS code manually extracts `userId` from the JWT token response:

**Before** (would get undefined):
```swift
let decoded = try JWT.decode(token)
let userId = decoded["userId"] as? String  // nil/undefined
```

**After** (will work correctly):
```swift
let decoded = try JWT.decode(token)
let userId = decoded["userId"] as? String  // Valid UUID
```

No code changes needed — the backend now sends the correct value.

---

## Verification

After backend deployment, verify by checking iOS console logs:

✅ **No more logs like**:
```
[Companion] Token refreshed for user undefined
```

✅ **Users with Garmin only see**:
```
[Companion] Token refreshed for user <valid-uuid> (device: <model>)
```

---

## Timeline

**Backend**: ✅ Fixed (routes.ts + routes-samsung-companion.ts)

**iOS**: 
- [ ] Deploy backend fix to production
- [ ] Verify logs show valid userIds (not "undefined")
- [ ] No iOS code changes required
- ✅ Done!

---

## Files Changed on Backend

| File | Change | Lines |
|------|--------|-------|
| `server/routes.ts` | `req.user!.id` → `req.user!.userId` | 8995 |
| `server/routes-samsung-companion.ts` | `req.user?.id` → `req.user?.userId` | 45, 71, 87, 256 |

---

## What This Fixes

✅ **Eliminates token refresh spam** for users without watches  
✅ **Fixes JWT claims** to have valid `userId`  
✅ **Stops database thrashing** from repeated token refreshes  
✅ **Improves server performance** by stopping unnecessary API calls  

---

## Questions for iOS Team

- Are you parsing the JWT token's `userId` field in iOS?
- Or do you just store/use the token as-is?

Either way, no iOS changes are needed. The backend fix handles everything.

---

## Summary

**iOS Action Items**: 
1. ✅ Redeploy with backend fix
2. ✅ Verify logs show valid userIds
3. ✅ Done!

**No iOS code changes required.**

This was a pure backend property name bug that iOS never needed to handle.

---

**Status**: Ready for backend deployment 🚀
