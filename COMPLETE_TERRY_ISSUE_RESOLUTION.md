# Complete Resolution: Terry's "Run Not Found" Error

## Overview

Terry completed a training plan run session on iOS but got a **"Run Not Found"** error when trying to view the summary. Through investigation of server logs and iOS analysis, **5 distinct but related issues** were identified and fixed.

---

## Issues & Fixes Matrix

| # | Issue | Severity | Root Cause | Status | File(s) Modified |
|---|-------|----------|-----------|--------|-----------------|
| **1** | Zero-distance run crashes database | **CRITICAL** | iOS sends no distance data | ✅ FIXED | `server/routes.ts` |
| **2** | Date encoding format mismatch | **CRITICAL** | iOS sends Unix timestamps, backend expects ISO8601 | ✅ FIXED | `HomeScreens.swift`, `WatchRunSyncManager.swift`, `server/routes.ts` |
| **3** | Missing distance field in request | **CRITICAL** | iOS sends `distance_meters`, backend expects `distance` | ✅ FIXED | `HomeScreens.swift`, `WatchRunSyncManager.swift`, `server/routes.ts` |
| **4** | Pace-update coaching crashes | **HIGH** | currentGrade undefined type error | ✅ FIXED | `server/ai-service.ts`, `server/routes.ts` |
| **5** | Missing database table | **MEDIUM** | coaching_session_events table undefined | ✅ FIXED | `server/training-plan-service.ts`, `routes-session-coaching.ts`, SQL migration |

---

## Detailed Issue Analysis

### **Issue 1: Zero-Distance Run**

**Symptom (10:53:53 in logs):**
```
[POST /api/runs] Duration normalization: raw=0 → 0s
Create run error: error: null value in column "distance" violates not-null constraint
```

**Why It Happened:**
- iOS device failed to record GPS distance
- App didn't validate distance before submitting
- Backend received `distance: null` or `distance: 0`
- Database rejected due to `NOT NULL` constraint

**Fix Applied:**
```typescript
// server/routes.ts line 1379
const distance = runData.distance || 0;
if (!distance || distance <= 0) {
  return res.status(400).json({ 
    error: "Run must have a distance greater than 0. Please check your GPS data and try again.",
    details: "No distance recorded during run session"
  });
}
```

**Result:** Clear error message to user about GPS issues instead of "Run Not Found"

---

### **Issue 2 & 3: iOS Request Format Mismatch**

**Symptoms:**
- iOS sends `distance_meters` (meters) but backend expects `distance` (km)
- iOS sends dates as Unix timestamps (1748641200.123) but backend expects ISO8601 strings
- Both fields missing → 400/422 validation error → upload fails

**Specific iOS Issues:**
1. **Date Encoding:** `JSONEncoder()` default encodes dates as floating-point Unix timestamps
2. **Distance Field:** iOS calculates distance in meters, request uses field name `distance_meters`

**Fixes Applied:**

*iOS Side:*
- Update `HomeScreens.swift` to use `.iso8601` date encoding
- Update `WatchRunSyncManager.swift` to use `.iso8601` date encoding
- Add explicit fields: `"distance": distanceMeters / 1000.0` and `"duration": durationSeconds`

*Backend Side:*
```typescript
// server/routes.ts line 1379-1385
let distance = runData.distance || 0;
if (!distance && runData.distance_meters) {
  distance = runData.distance_meters / 1000.0; // Auto-convert
  console.log(`Converted iOS distance_meters=${runData.distance_meters} to distance=${distance}km`);
}

// server/routes.ts line 1422-1431
const parseDate = (val: any): Date | undefined => {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);  // ISO8601
  if (typeof val === 'number') {
    return val > 1e10 ? new Date(val) : new Date(val * 1000);  // Handle both ms and s
  }
  return undefined;
};

// Support both startTime (Android) and start_time (iOS)
startTime: parseDate(runData.startTime || runData.start_time),
```

**Result:** 
- iOS sends ISO8601 dates (new format)
- Backend accepts both old and new formats
- Backwards compatible with older iOS versions

---

### **Issue 4: Pace-Update Type Error**

**Symptoms (5 failures during run at 10:12, 10:17, 10:23, 10:29, 10:34):**
```
Pace update coaching error: TypeError: Cannot read properties of undefined (reading 'toFixed')
POST /api/coaching/pace-update 500
```

**Why It Happened:**
- `currentGrade` parameter passed as `null` instead of a number
- Code called `currentGrade.toFixed()` without type checking
- 6 locations in `ai-service.ts` had this bug

**Fixes Applied:**

*In `server/ai-service.ts` (6 locations):*
```typescript
// Before:
if (currentGrade && Math.abs(currentGrade) > 5) { ... }

// After:
if (typeof currentGrade === 'number' && currentGrade !== null && Math.abs(currentGrade) > 5) { ... }
```

*In `server/routes.ts` (input sanitization):*
```typescript
if (req.body.currentGrade !== undefined && typeof req.body.currentGrade !== 'number') {
  const parsed = parseFloat(req.body.currentGrade);
  req.body.currentGrade = isNaN(parsed) ? undefined : parsed;
}
```

**Result:** Coaching no longer crashes on undefined elevation data

---

### **Issue 5: Missing Database Table**

**Symptom (10:56:53 after Garmin webhook):**
```
[Plan Reassessment] Error reassessing plan: relation "coaching_session_events" does not exist
```

**Why It Happened:**
- Table defined in Drizzle schema but never created in PostgreSQL
- Plan reassessment tried to query non-existent table
- Plan adaptation failed silently

**Fixes Applied:**

*New SQL Migration:*
```sql
CREATE TABLE IF NOT EXISTS coaching_session_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id varchar NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  planned_workout_id varchar REFERENCES planned_workouts(id),
  event_type text NOT NULL,
  event_phase text,
  coaching_message text,
  coaching_audio_url text,
  user_metrics jsonb,
  tone_used text,
  user_engagement text,
  triggered_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);
-- Plus 3 indexes for performance
```

*Backend Error Handling:*
```typescript
// server/training-plan-service.ts
let sessionEvents: any[] = [];
try {
  sessionEvents = await db.select().from(coachingSessionEvents)...
} catch (tableError: any) {
  if (tableError.message?.includes('does not exist')) {
    console.warn("table not found - continuing without coaching data");
    sessionEvents = [];
  } else {
    throw tableError;
  }
}
```

**Result:** 
- Migration creates the missing table
- Code continues gracefully if table is missing
- Plan reassessment uses coaching data when available

---

## Deployment Steps

### **Step 1: Deploy iOS Fixes**
Update and rebuild iOS app with:
- ISO8601 date encoding in `NetworkManager`
- Explicit `distance` and `duration` fields in request bodies
- Applied to both `HomeScreens.swift` and `WatchRunSyncManager.swift`

### **Step 2: Create Database Table**
Run in Neon console:
```sql
CREATE TABLE IF NOT EXISTS coaching_session_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id varchar NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  planned_workout_id varchar REFERENCES planned_workouts(id),
  event_type text NOT NULL,
  event_phase text,
  coaching_message text,
  coaching_audio_url text,
  user_metrics jsonb,
  tone_used text,
  user_engagement text,
  triggered_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_session_events_run_id 
  ON coaching_session_events(run_id);
CREATE INDEX IF NOT EXISTS idx_coaching_session_events_workout_id 
  ON coaching_session_events(planned_workout_id);
CREATE INDEX IF NOT EXISTS idx_coaching_session_events_triggered_at 
  ON coaching_session_events(triggered_at);
```

### **Step 3: Deploy Backend**
All fixes are in:
- `server/routes.ts` (distance validation, date parsing, input sanitization)
- `server/ai-service.ts` (type guards for currentGrade)
- `server/training-plan-service.ts` (graceful error handling)
- `server/routes-session-coaching.ts` (table existence check)

---

## Testing Checklist

- [ ] **iOS Upload Test:** Have Terry complete a new run on iOS
  - Verify logs show: `[POST /api/runs] Distance handling`
  - Run should save successfully
  - No "Run Not Found" error
  - Can view summary without errors

- [ ] **Coaching Test:** Monitor during run
  - No more 500 errors on `pace-update` endpoint
  - Real-time coaching audio works
  - Multiple coaching cues delivered successfully

- [ ] **Plan Reassessment Test:** Check logs after run completion
  - No "coaching_session_events does not exist" error
  - Plan reassessment completes successfully
  - If adjustments needed, plan updates correctly

- [ ] **Date Format Test:** Verify logs show ISO8601 dates
  - `Date fields — startedAt: 2026-05-31T...` format (not Unix timestamp)

---

## Files Modified

### **iOS (4 changes)**
- `HomeScreens.swift` - ISO8601 date encoding + explicit fields
- `WatchRunSyncManager.swift` - ISO8601 date encoding + explicit fields

### **Backend (5 files)**
- `server/routes.ts` - Distance validation + date parsing + input sanitization
- `server/ai-service.ts` - Type guards for currentGrade (6 locations)
- `server/training-plan-service.ts` - Graceful error handling
- `server/routes-session-coaching.ts` - Table existence check
- `ADD_COACHING_SESSION_EVENTS_TABLE.sql` - NEW migration file

### **Documentation (3 files)**
- `TERRY_RUN_NOT_FOUND_FIX.md` - Backend issue analysis
- `IOS_RUN_UPLOAD_FIXES.md` - iOS-specific fixes
- `COMPLETE_TERRY_ISSUE_RESOLUTION.md` - This file

---

## Expected Outcome

When Terry next completes a training run on iOS:

1. ✅ iOS sends properly encoded ISO8601 dates and explicit distance field
2. ✅ Backend validates distance > 0 (with clear error if not)
3. ✅ Backend parses dates intelligently (handles old + new format)
4. ✅ Run saves to database successfully
5. ✅ Coaching real-time updates work without 500 errors
6. ✅ Plan reassessment uses coaching session data
7. ✅ Terry navigates to run summary without "Run Not Found" error
8. ✅ Summary shows accurate run data with AI coaching analysis

---

## Key Takeaways

1. **Always validate external input** - don't assume data format or presence
2. **Support multiple formats** - handle both old and new client versions
3. **Type-check carefully** - JavaScript's loose typing is deceptive
4. **Fail gracefully** - missing optional features shouldn't crash the app
5. **Log meaningfully** - clear logs make debugging future issues easier

This comprehensive fix addresses not just Terry's specific case, but prevents similar issues from affecting other users with iOS devices.

