# 🔧 Fixes Applied - Route Generation & Run History

## Issue 1: Route Generation NumberFormatException ✅ FIXED

### Error:
```
java.lang.NumberFormatException: Expected an int but was 8396.679
at line 1 column 2467 path $.routes[0].distance
```

### Root Cause:
The `IntelligentRoute` model defined `distance` as `Int`, but the backend returns a `Double` (8396.679 meters).

### Fix Applied:
**File**: `IntelligentRouteModels.kt`
```kotlin
// Before:
val distance: Int,  // meters

// After:
val distance: Double,  // meters (can be decimal)
```

✅ **Status**: Fixed - APK needs rebuild

---

## Issue 2: Run History Not Showing ⚠️ INVESTIGATING

### Symptoms:
- No errors shown
- Previous runs saved in database not appearing
- Empty list displayed

### Possible Causes:

#### 1. **Authentication Issue**
The `/api/runs/user/:userId` endpoint requires authentication:
```json
{"error": "No token provided"}
```

**Check**: 
- Is the auth token being sent correctly?
- Is the token valid?
- Check logs: `PreviousRunsViewModel` should show token status

#### 2. **Data Model Mismatch**
The Android `RunSession` model has many fields that may not exist in backend response:
- `weatherAtStart/weatherAtEnd`
- `routePoints`
- `kmSplits`
- `terrainType`
- `routeHash`

**Backend Run Schema** (from database):
- Basic fields: id, userId, distance, duration, avgPace
- May not include all fields Android expects

#### 3. **Response Parsing Issue**
If backend returns fields Android model doesn't expect (or vice versa), Gson will fail silently.

### Debugging Steps:

1. **Check Logs** (in Android Studio Logcat):
```
Filter: PreviousRunsViewModel
Look for:
- "=== FETCH RUNS STARTED ==="
- "✅ Fetching runs for user: [userId]"
- "✅ Fetched X total runs"
- Any JSON parsing errors
```

2. **Verify Authentication**:
```
Filter: RetrofitClient
Look for:
- "🔑 Adding Bearer token to /api/runs/user/..."
- "📡 Response from /api/runs/user/...: 200"
- If you see 401 or 403, auth is failing
```

3. **Check Backend Response**:
Run this command to see what backend actually returns:
```bash
# Get your auth token from app logs, then:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/runs/user/YOUR_USER_ID
```

### Likely Solution:

The `RunSession` model needs to be more flexible. Many fields should be nullable or have defaults:

```kotlin
data class RunSession(
    val id: String,
    val startTime: Long,
    val endTime: Long? = null,
    val duration: Long,
    val distance: Double,
    val averageSpeed: Float? = null,
    val maxSpeed: Float? = null,
    val averagePace: String,
    val calories: Int? = null,
    val cadence: Int? = null,
    val heartRate: Int? = null,
    val routePoints: List<LocationPoint> = emptyList(),  // May be missing
    val kmSplits: List<KmSplit> = emptyList(),          // May be missing
    val isStruggling: Boolean = false,
    val phase: CoachingPhase = CoachingPhase.GENERIC,
    
    // These fields may not exist in backend response
    val weatherAtStart: WeatherData? = null,
    val weatherAtEnd: WeatherData? = null,
    val totalElevationGain: Double = 0.0,
    val totalElevationLoss: Double = 0.0,
    val averageGradient: Float = 0f,
    val maxGradient: Float = 0f,
    val terrainType: TerrainType = TerrainType.FLAT,
    val routeHash: String? = null,
    val routeName: String? = null,
    val isActive: Boolean = false
)
```

---

## 🧪 Testing Steps

### After Rebuilding APK:

1. **Test Route Generation**:
   - Generate a 5km route
   - Should complete without NumberFormatException
   - Should show 3 route options

2. **Test Run History**:
   - Open Previous Runs screen
   - Check Logcat for errors
   - Look for specific error messages:
     - "No token provided" = auth issue
     - "JSON parsing error" = model mismatch
     - Empty list with no errors = filtering issue

### Logcat Commands:

```bash
# Filter for run history debugging
adb logcat | grep -E "PreviousRunsViewModel|RetrofitClient|RunSession"

# Filter for authentication
adb logcat | grep -E "Bearer|Authorization|token"

# Filter for JSON errors
adb logcat | grep -E "JsonSyntaxException|JSON|parse"
```

---

## 📝 Next Steps

1. ✅ Rebuild APK with route generation fix
2. ⏳ Install and test route generation
3. ⏳ Test run history and capture logs
4. ⏳ Analyze logs to identify exact issue
5. ⏳ Fix RunSession model if needed
6. ⏳ Rebuild and retest

---

**Status**: Route generation fix applied, awaiting rebuild and testing
**Run history**: Needs log analysis to determine root cause
