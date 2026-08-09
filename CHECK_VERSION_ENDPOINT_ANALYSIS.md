# Check-Version Endpoint Implementation Analysis

## Overview
This document provides a comprehensive analysis of the version checking system across the AI Run Coach application, including iOS implementation, Android implementation, backend implementation, and duplicate run protection logic.

---

## 1. iOS Implementation Details: `/api/app/version-check`

### Location: Not Found in iOS-Specific Code
**Status**: ⚠️ Limited iOS Implementation Found
- iOS directory contains only `StravaViewModel.swift` and `StravaViews.swift`
- No dedicated iOS version check implementation files were located
- Likely implemented as a Codable struct that decodes from the backend response

### Expected iOS Model Structure
Based on Android patterns, iOS should have a corresponding model structure:
```swift
struct AppVersionCheckResponse: Codable {
    let android: AndroidVersionInfo
    let garmin: GarminVersionInfo
}

struct AndroidVersionInfo: Codable {
    let latestVersionCode: Int
    let latestVersionName: String
    let minVersionCode: Int
    let playStoreUrl: String
    let releaseNote: String
}

struct GarminVersionInfo: Codable {
    let latestVersion: String
    let minVersion: String
    let connectIqStoreUrl: String
    let releaseNote: String
}
```

---

## 2. Android Implementation: Version Checking

### File: `VersionCheckViewModel.kt`
**Location**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/VersionCheckViewModel.kt`

#### Purpose
- Checks app and Garmin companion versions at startup
- Surfaces update prompts for both Android app and Garmin watch
- Non-blocking operation — network failures are silently ignored

#### Key Features

**Android Version Check** (lines 77-96):
- Compares installed `BuildConfig.VERSION_CODE` against server's `latestVersionCode`
- Determines if update is forced (`minVersionCode > installed`)
- Exposes `AndroidUpdateInfo` with version name, Play Store URL, release notes, and forced flag

**Garmin Companion Check** (lines 98-127):
- Retrieves installed watch app version from SharedPreferences
- Compares against server's `latestVersion`
- Uses semantic version comparison for compatibility
- Shows update prompt with version and release notes when update available

#### API Integration
```kotlin
@GET("/api/app/version-check")
suspend fun checkAppVersion(): AppVersionCheckResponse
```

#### Data Classes
```kotlin
data class AndroidUpdateInfo(
    val latestVersionName: String,
    val playStoreUrl: String,
    val releaseNote: String,
    val isForced: Boolean,   // true = minVersionCode > installed
)

data class GarminUpdateInfo(
    val installedVersion: String,
    val latestVersion: String,
    val releaseNote: String,
    val connectIqStoreUrl: String,
)
```

---

## 3. Backend Implementation: `/api/app/version-check`

### File: `server/routes.ts` (lines 16507-16531)

#### Endpoint Definition
```typescript
app.get("/api/app/version-check", async (req: Request, res: Response) => {
  // No authentication required
  // Returns environment variable defaults + overrides
})
```

#### Response Structure
```json
{
  "android": {
    "latestVersionCode": 29,
    "latestVersionName": "1.9.0",
    "minVersionCode": 29,
    "playStoreUrl": "https://play.google.com/store/apps/details?id=...",
    "releaseNote": "Major user experience improvements..."
  },
  "garmin": {
    "latestVersion": "1.4.0",
    "minVersion": "1.0.0",
    "connectIqStoreUrl": "https://apps.garmin.com/en-NZ/apps/...",
    "releaseNote": ""
  }
}
```

#### Environment Variables
Configuration is managed via environment variables:
- `ANDROID_LATEST_VERSION_CODE` – Latest Play Store versionCode (default: 29)
- `ANDROID_LATEST_VERSION_NAME` – Human-readable version (default: "1.9.0")
- `ANDROID_MIN_VERSION_CODE` – Minimum required version (default: 29)
- `ANDROID_PLAY_STORE_URL` – Play Store listing URL
- `ANDROID_RELEASE_NOTE` – What's new description
- `GARMIN_LATEST_VERSION` – Latest Connect IQ companion (default: "1.4.0")
- `GARMIN_MIN_VERSION` – Minimum required version (default: "1.0.0")
- `GARMIN_CONNECT_IQ_STORE_URL` – Connect IQ store URL
- `GARMIN_RELEASE_NOTE` – Watch app release notes

#### Authentication
✅ **No authentication required** — endpoint is public
- Can be called before login
- Allows app to check for critical security/compatibility updates immediately on launch

---

## 4. Duplicate Run Protection Logic

### Architecture Overview
The system implements a **multi-layer deduplication strategy** to prevent duplicate runs across multiple sources (Garmin watch, Android phone, iOS phone).

### Database Schema
**File**: `shared/schema.ts` (lines 175-378)

#### Runs Table Key Fields
```typescript
externalId: varchar("external_id"),       // Garmin activity ID, Strava ID, etc.
externalSource: varchar("external_source"), // 'garmin', 'strava', 'coros', etc.
userId: varchar("user_id"),                // Foreign key to users
createdAt: timestamp("created_at"),        // When inserted
```

#### Unique Constraint
**Index Name**: `idx_runs_user_external_id_unique`
- **Scope**: `(userId, externalId)` – one external_id per user
- **Purpose**: Race-condition safety net — ensures DB-level uniqueness even if two requests arrive simultaneously
- **Code Reference**: `server/storage.ts:630`, `server/routes.ts:2536`

---

### Deduplication Strategy (POST /api/runs)

**File**: `server/routes.ts` (lines 2529-2949)

#### Three-Tier Approach (Checked in Order of Specificity)

##### **Case 0: Exact External ID Match** (lines 2554-2707)
**Trigger**: Same `externalId` + same `userId`

**Use Case**: 
- Watch uploads run with `external_id = "garmin_activity_12345"`
- Phone later uploads same run with identical `external_id`
- Server deduplicates and merges richer phone data into watch record

**Merge Strategy** (lines 2570-2680):
When merging, prioritize:
1. **Session Type** – Use phone's user-selected activity (walk vs run)
2. **Coaching Notes** – Phone has AI coaching, watch doesn't
3. **GPS Track** – Phone's full array with timestamps preferred
4. **Heart Rate Data** – Upgrade from object array to flat number[] if available
5. **Pace/Cadence Data** – Replace minimal data with rich time-series
6. **Struggle Points & KM Splits** – Phone-computed only
7. **Weather Data** – Phone captures at run start
8. **Training Plan Linking** – Phone knows the workout, watch doesn't
9. **Group Run Links** – Critical to preserve (watch may not know)

**Result**: Return merged record (HTTP 200)

---

##### **Case 1: Rapid Retry Window (30 seconds)** (lines 2710-2785)
**Trigger**: Same user + similar distance + created within 30s

**Use Case**:
- Android SyncWorker retry with exponential backoff
- User accidentally uploads twice
- Network timeout + automatic retry

**Detection** (lines 2712-2721):
```typescript
const thirtySecondsAgo = new Date(Date.now() - 30_000);
const recentCandidates = await db.select().from(runs)
  .where(and(
    eq(runs.userId, userId),
    gte(runs.createdAt, thirtySecondsAgo)
  )).limit(5);
const rapidDup = recentCandidates.find(r =>
  Math.abs(r.distance - distanceRounded) < 0.05  // ±50 meters
);
```

**Merge Strategy** (lines 2728-2772):
- Coaching notes
- Weather data
- Workout/plan linking
- GPS track
- Heart rate & pace data
- Group run links

**Result**: Return existing record with merged data (HTTP 200)

---

##### **Case 2: Garmin Companion Watch Duplicate (3 hours)** (lines 2787-2949)
**Trigger**: Garmin companion run + similar distance + created within 3 hours

**Use Case**:
- Watch uploads standalone session → creates minimal record
- Phone subsequently uploads its richer copy
- Server merges phone's coaching notes, HR data, GPS track into watch record

**Detection** (lines 2792-2808):
```typescript
const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
const garminCandidates = await db.select().from(runs)
  .where(and(
    eq(runs.userId, userId),
    gte(runs.createdAt, threeHoursAgo),
    eq(runs.externalSource, 'garmin_companion')
  )).limit(10);

// 15% tolerance: GPS disagree by 5-12% due to different algorithms
const garminDup = garminCandidates.find(r => {
  const rDist = r.distance ?? 0;
  return rDist > 0 && 
    Math.abs(rDist - distanceRounded) / Math.max(rDist, 0.1) < 0.15;
});
```

**Distance Tolerance**: 15%
- Reason: Different satellite acquisition, GPS algorithms, BLE dropout gaps
- Phone GPS vs Watch GPS commonly disagree by 5-12%

**Merge Strategy** (lines 2812-2930):
Same as Case 0, with special handling for:
- **Heart Rate**: Upgrade from object array to flat number[] (phone's BT is richer)
- **Pace Data**: Only upgrade from minimal kmSplits stub, preserve if already rich (≥20 entries)
- **Altitude**: Preserve GPS-based data over barometric
- **Weather**: Phone captures at run start, watch never has it

**Result**: Return merged record (HTTP 200)

---

### Race-Condition Safety Net

**File**: `server/storage.ts` (lines 613-642)

If all three application-level dedup checks fail, PostgreSQL's unique constraint takes over:

```typescript
async createRun(run: InsertRun): Promise<Run> {
  try {
    const [newRun] = await db.insert(runs).values(sanitized).returning();
    return newRun;
  } catch (err: any) {
    // PostgreSQL unique-constraint violation (code 23505)
    if (err.code === '23505' && run.externalId && run.userId) {
      console.warn(`[createRun] Race-condition duplicate detected for externalId=${run.externalId}`);
      // Fetch the winner's record and return it
      const [existing] = await db.select()
        .from(runs)
        .where(and(
          eq(runs.userId, run.userId),
          eq(runs.externalId, run.externalId)
        ))
        .limit(1);
      if (existing) return existing;
    }
    throw err;
  }
}
```

**How It Works**:
1. Both requests pass the 3-case dedup logic simultaneously
2. First INSERT succeeds, second violates `idx_runs_user_external_id_unique` (code 23505)
3. Application catches the constraint violation
4. Fetches the winner's record and returns it instead of throwing
5. Caller receives HTTP 200 with the deduplicated record

---

### Field Validation & Cleanup

**FK Safety** (lines 2444-2454):
```typescript
if (processedRunData.routeId) {
  const routeExists = await storage.getRoute(processedRunData.routeId);
  if (!routeExists) {
    console.warn(`routeId '${processedRunData.routeId}' not found — clearing to null`);
    processedRunData.routeId = null;  // Prevent FK violation
  }
}
```

**Distance Handling** (lines 2488-2489):
```typescript
console.log(`Distance handling — received distance: ${distance}km${runData.distance_meters ? ` (from ${runData.distance_meters}m)` : ''}`);
```

**Target Fields** (lines 2459-2461):
```typescript
const targetDistance    = typeof runData.targetDistance    === 'number'  ? runData.targetDistance    : null;
const targetTime        = typeof runData.targetTime        === 'number'  ? runData.targetTime        : null;
const wasTargetAchieved = typeof runData.wasTargetAchieved === 'boolean' ? runData.wasTargetAchieved : null;
```

---

## 5. Flow Diagrams

### Version Check Flow
```
App Startup
    ↓
VersionCheckViewModel.checkVersions()
    ↓
GET /api/app/version-check (no auth required)
    ↓
    ├─ Compare BuildConfig.VERSION_CODE vs latestVersionCode
    │    → Determines if update available/forced
    │
    └─ Retrieve watch version from SharedPrefs
         → Compare vs latestVersion
         → Show update prompt if needed
```

### Duplicate Run Detection Flow
```
POST /api/runs
    ↓
    ├─ Case 0: externalId match?
    │    YES → Merge & return (200)
    │     NO → Continue
    │
    ├─ Case 1: Rapid retry (30s, ±50m)?
    │    YES → Merge & return (200)
    │     NO → Continue
    │
    ├─ Case 2: Garmin companion (3h, ±15%)?
    │    YES → Merge & return (200)
    │     NO → Continue
    │
    └─ INSERT new run
         ↓
         Unique constraint violation (code 23505)?
            YES → Fetch winner → return (200)
            NO → Return new record (200)
```

---

## 6. Key Implementation Details

### Client-Side (Android)

**VersionCheckViewModel**:
- ✅ Calls `apiService.checkAppVersion()` on app startup
- ✅ Fire-and-forget (non-blocking)
- ✅ Compares installed versions against server response
- ✅ Shows update dialogs via StateFlow (androidUpdateAvailable, garminUpdateAvailable)

### Server-Side

**POST /api/runs Deduplication**:
- ✅ Multi-layer strategy: external_id → rapid retry → garmin_companion
- ✅ Smart merge logic: Never loses data, prioritizes richer uploads
- ✅ Handles race conditions with DB constraint
- ✅ Supports both Android (camelCase) and iOS (snake_case) field names

**GET /api/app/version-check**:
- ✅ No authentication required
- ✅ Environment-variable driven
- ✅ Includes forced-update capability via `minVersionCode`
- ✅ Supports both Android and Garmin Watch updates

---

## 7. Summary

| Component | Status | Notes |
|-----------|--------|-------|
| iOS Version Check | ⚠️ Partial | Models likely exist but not in this repo |
| Android Version Check | ✅ Complete | Full VersionCheckViewModel implementation |
| Backend /api/app/version-check | ✅ Complete | Public endpoint, env-var driven |
| Duplicate Run Detection | ✅ Complete | Three-tier strategy + DB safety net |
| Race-Condition Protection | ✅ Complete | Unique constraint + application retry |
| Merge Logic | ✅ Complete | Rich merge strategy preserving data |

