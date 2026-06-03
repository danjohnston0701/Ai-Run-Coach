# iOS Run Upload Issues - Complete Fix Summary

## Issues Identified by iOS Agent

### **Issue 1: Date Encoding Format Mismatch**
**Problem:** iOS was encoding dates as raw Unix timestamps (floating point: `1748641200.123`) instead of ISO8601 strings that the backend expects.

**Impact:** Backend validation failed, returned 400/422 error, iOS app caught the error, set `runUploadFailed = true`, navigated to broken screen.

**iOS Fix Applied:** Updated `NetworkManager` to use `.iso8601` date encoding on all three body-encoding paths
- `HomeScreens.swift` - phone runs
- `WatchRunSyncManager.swift` - watch-synced runs

---

### **Issue 2: Missing Distance Field**
**Problem:** iOS sends `distance_meters` (in meters) but backend's database expects `distance` (in km). Since the field wasn't sent, the database received `NULL` for a `NOT NULL` column.

**Impact:** Database constraint violation → 500 error → upload failed

**iOS Fixes Applied:**
- `HomeScreens.swift` - added explicit `"distance": distanceMeters / 1000.0` to request body
- `WatchRunSyncManager.swift` - added explicit `"distance": distanceMeters / 1000.0` to request body
- Both also explicitly include `"duration": durationSeconds`

---

## Backend Fixes Applied

To ensure the backend gracefully handles iOS submissions (both old and new format), I've added:

### **1. Distance Field Conversion** (`server/routes.ts` line 1379)
```typescript
// Support both iOS (distance_meters) and Android (distance in km) formats
let distance = runData.distance || 0;
if (!distance && runData.distance_meters) {
  distance = runData.distance_meters / 1000.0; // Convert meters to km
  console.log(`[POST /api/runs] Converted iOS distance_meters=${runData.distance_meters} to distance=${distance}km`);
}
```

**Why:** If iOS still sends the old format, backend will automatically convert. Allows both old and new iOS versions to work.

---

### **2. Robust Date Parsing** (`server/routes.ts` line 1422)
```typescript
// Helper to safely parse dates - handles both ISO strings and Unix timestamps
const parseDate = (val: any): Date | undefined => {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  // If it's a string, try to parse it
  if (typeof val === 'string') return new Date(val);
  // If it's a number, treat as milliseconds if < year 3000, else seconds
  if (typeof val === 'number') {
    return val > 1e10 ? new Date(val) : new Date(val * 1000);
  }
  return undefined;
};
```

**Why:** Handles:
- ISO8601 strings (new iOS format)
- Unix timestamps in milliseconds (old format)
- Unix timestamps in seconds
- Already-parsed Date objects

Supports both `startTime` (Android) and `start_time` (iOS) field names.

---

### **3. Enhanced Logging** (`server/routes.ts` line 1476-1479)
```typescript
console.log(`[POST /api/runs] Distance handling — received distance: ${distance}km${runData.distance_meters ? ` (from ${runData.distance_meters}m)` : ''}`);
console.log(`[POST /api/runs] Date fields — startedAt: ${processedRunData.startTime}, completedAt: ${processedRunData.completedAt}`);
```

**Why:** Makes it easy to debug future iOS encoding issues. When Terry next uploads, logs will show exactly what format was received.

---

## What Happens Now

### **When iOS Sends a Run:**

1. **Distance Handling**
   - If `distance` field exists → use it directly
   - If only `distance_meters` exists → convert to km automatically
   - Both work ✅

2. **Date Handling**
   - If ISO8601 string (new format) → parse directly ✅
   - If Unix timestamp number (old format) → convert intelligently ✅
   - Support both `start_time` and `startTime` field names ✅

3. **Validation**
   - Must have `distance > 0` (already enforced, with user-friendly error)
   - All date fields parsed safely
   - Clear logging for debugging

### **Example: Terry's Next Run**

**Before (Failed):**
```
POST /api/runs
{
  distance_meters: 5432,
  startTime: 1748641200.123,  // Raw Unix timestamp
  ...
}
→ No "distance" field → NULL → 500 error → failed upload
```

**After (Will Succeed):**
```
POST /api/runs
{
  distance: 5.432,              // iOS sends km now
  start_time: "2026-05-31T10:07:05.000Z",  // ISO8601 string
  ...
}
→ distance validated ✅
→ dates parsed ✅
→ run saved ✅
→ navigates to summary screen ✅
```

**Or if iOS still sends old format:**
```
POST /api/runs
{
  distance_meters: 5432,        // Old format
  startTime: 1748641200123,     // Timestamp in ms
  ...
}
→ backend converts distance_meters to distance ✅
→ backend parses timestamp intelligently ✅
→ run saved ✅
→ backwards compatible ✅
```

---

## Testing Checklist

- [ ] Deploy iOS fixes (date encoding + distance fields)
- [ ] Deploy backend fixes (distance conversion + date parsing)
- [ ] Have Terry complete a new run on iOS
- [ ] Check logs for: `[POST /api/runs] Distance handling` and `Date fields` entries
- [ ] Verify run appears in app without "Run Not Found" error
- [ ] Check that coaching still works (pace-update no longer crashes on undefined pace)

---

## Files Modified

| File | Changes |
|------|---------|
| **iOS: `HomeScreens.swift`** | Add ISO8601 date encoding + explicit distance/duration fields |
| **iOS: `WatchRunSyncManager.swift`** | Add ISO8601 date encoding + explicit distance/duration fields |
| **Backend: `server/routes.ts`** | Add distance conversion + robust date parsing + enhanced logging |

---

## Root Cause Summary

| Issue | Root Cause | iOS Fix | Backend Fix |
|-------|-----------|---------|------------|
| **Date Format** | `JSONEncoder()` default | Use `.iso8601` encoding | Accept both ISO strings and timestamps |
| **Distance Field** | iOS sends `distance_meters`, backend expects `distance` | Send explicit `distance` in request | Auto-convert `distance_meters` to `distance` |

---

## Why This Matters

1. **iOS fixes ensure consistent data format** - all dates are now ISO8601 strings
2. **Backend fixes ensure backward compatibility** - old iOS versions still work
3. **Clear error messages** - if something's still wrong, user sees "Check your GPS data"
4. **Better logging** - future debugging shows exactly what format was received

Terry's next run should upload successfully! 🚀

