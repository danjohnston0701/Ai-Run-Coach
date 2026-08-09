# Check-Version Endpoint - Quick Reference

## 1. iOS Implementation
❌ **Not Found** - Only Strava files in `/ios` directory
- iOS models likely implemented as Codable structs elsewhere
- Decodes response from backend endpoint

## 2. Android Implementation
✅ **Location**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/VersionCheckViewModel.kt`

**Key Points**:
- Calls `apiService.checkAppVersion()` at startup
- Compares `BuildConfig.VERSION_CODE` against `latestVersionCode`
- Shows forced update if `installed < minVersionCode`
- Checks Garmin companion version from SharedPrefs
- Non-blocking (fire-and-forget)

**Data Classes**:
```kotlin
AndroidUpdateInfo(latestVersionName, playStoreUrl, releaseNote, isForced)
GarminUpdateInfo(installedVersion, latestVersion, releaseNote, connectIqStoreUrl)
```

## 3. Backend Implementation
✅ **Location**: `server/routes.ts:16507-16531`

**Endpoint**: `GET /api/app/version-check`
**Authentication**: ❌ None required (public)

**Environment Variables**:
```
ANDROID_LATEST_VERSION_CODE    (default: 29)
ANDROID_LATEST_VERSION_NAME    (default: "1.9.0")
ANDROID_MIN_VERSION_CODE       (default: 29)
ANDROID_PLAY_STORE_URL
ANDROID_RELEASE_NOTE
GARMIN_LATEST_VERSION          (default: "1.4.0")
GARMIN_MIN_VERSION             (default: "1.0.0")
GARMIN_CONNECT_IQ_STORE_URL
GARMIN_RELEASE_NOTE
```

**Response**:
```json
{
  "android": {
    "latestVersionCode": 29,
    "latestVersionName": "1.9.0",
    "minVersionCode": 29,
    "playStoreUrl": "...",
    "releaseNote": "..."
  },
  "garmin": {
    "latestVersion": "1.4.0",
    "minVersion": "1.0.0",
    "connectIqStoreUrl": "...",
    "releaseNote": "..."
  }
}
```

## 4. Duplicate Run Protection

### Three-Tier Strategy (POST /api/runs)

#### **Case 0: External ID Match** (Exact)
- **When**: Same `externalId` + `userId`
- **Window**: Unlimited
- **Example**: Garmin activity ID "12345" uploaded twice
- **Action**: Merge phone's richer data into watch record
- **Merges**: Coaching notes, GPS track, HR data, weather, plan linking, group run links

#### **Case 1: Rapid Retry** (Quick)
- **When**: Same user + similar distance (±50m)
- **Window**: Last 30 seconds
- **Example**: SyncWorker retry, accidental double-upload
- **Action**: Merge and return existing record
- **Merges**: Same as Case 0

#### **Case 2: Garmin Companion** (Watch)
- **When**: Garmin companion run + similar distance (±15%)
- **Window**: Last 3 hours
- **Example**: Watch uploads, then phone uploads richer version
- **Action**: Merge phone data into watch record
- **Distance Tolerance**: 15% (GPS algorithms vary 5-12%)
- **Merges**: HR, pace, altitude, weather, coaching notes, plan context

### Race-Condition Safety Net
- **File**: `server/storage.ts:613-642`
- **Index**: `idx_runs_user_external_id_unique` (userId, externalId)
- **Fallback**: PostgreSQL constraint violation (code 23505) → fetch winner

**Flow**:
```
createRun()
  ├─ INSERT succeeds → return new record
  └─ UNIQUE constraint violation (code 23505)
      → Fetch existing record
      → Return it instead of throwing
```

## 5. Field Handling

### Supported Field Names
- **Android**: camelCase (`externalId`, `externalSource`, `startTime`)
- **iOS**: snake_case (`external_id`, `external_source`, `start_time`)
- Both automatically normalized in code

### Foreign Key Safety
```typescript
if (processedRunData.routeId) {
  // Validate route exists before INSERT
  if (!routeExists) processedRunData.routeId = null;
}
```

### Data Merge Priorities
1. Session Type (walk vs run)
2. Coaching Notes (most important)
3. GPS Track (full array preferred)
4. Heart Rate Data (flat array > object array)
5. Pace/Cadence/Altitude Data
6. Struggle Points & KM Splits
7. Weather Data
8. Training Plan Linking
9. Group Run Links

## 6. Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `VersionCheckViewModel.kt` | Android version check logic | 160 |
| `AppVersionModels.kt` | Android data classes | 39 |
| `ApiService.kt` | Retrofit endpoint definition | 833 |
| `server/routes.ts` | Backend version check endpoint | 16507-16531 |
| `server/routes.ts` | Deduplication logic | 2529-2949 |
| `server/storage.ts` | Race-condition handling | 613-642 |
| `shared/schema.ts` | Runs table schema | 175-378 |

## 7. Testing Scenarios

### Version Check
1. ✅ First app launch → show version check
2. ✅ Network failure → silently ignore
3. ✅ Forced update available → `isForced = true`
4. ✅ App up-to-date → no dialog

### Duplicate Runs
1. ✅ Watch + Phone same activity → merge to 1 record
2. ✅ Double-upload (30s) → return existing
3. ✅ Watch batch + phone upload (3h) → merge data
4. ✅ Race condition → DB constraint catches it
5. ✅ Different externalIds → create separate records

