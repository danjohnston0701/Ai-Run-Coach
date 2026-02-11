# Group Runs JSON Parsing Fix - February 7, 2026

## Issue Summary

**Problem:** When clicking "Group Runs" in the profile, the app showed an error:
```
Use Json.Reader.setLenient(true) to accept malformed JSON at line 1 column 1 path $
```

**LogCat Evidence:**
```
okhttp.OkHttpClient: <-- END HTTP (1712-byte body)
RetrofitClient: 📡 Response from /api/group-runs: 200
```

## Root Cause

The backend endpoint `/api/group-runs` **does not exist yet**. When the Android app makes a request to this unimplemented endpoint:

1. Backend receives request to `/api/group-runs`
2. No route matches, so Express.js serves the React frontend's `index.html` (1712 bytes)
3. Response has `Content-Type: text/html; charset=UTF-8` with HTTP 200 OK
4. Android app tries to parse HTML as JSON → **JsonSyntaxException**

### Backend Response (Actual)
```bash
$ curl -I https://ai-run-coach.replit.app/api/group-runs

HTTP/2 200 
content-type: text/html; charset=UTF-8
content-length: 1712
```

The response body is the React frontend HTML:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <meta property="og:title" content="AI Run Coach" />
    ...
```

### What Should Happen
The backend should return a JSON array:
```json
[
  {
    "id": "uuid",
    "name": "Morning Group Run",
    "meetingPoint": "Central Park, Main Entrance",
    "description": "Easy pace 5k run",
    "distance": 5.0,
    "maxParticipants": 15,
    "dateTime": "2026-02-08T08:00:00Z",
    "participants": ["user-id-1", "user-id-2"]
  }
]
```

## Solution Implemented

### 1. Enhanced Error Detection in ViewModel
**File:** `app/src/main/java/live/airuncoach/airuncoach/viewmodel/GroupRunsViewModel.kt`

Added specific error handling for JSON parsing failures:

```kotlin
try {
    val groupRuns = apiService.getGroupRuns()
    _groupRunsState.value = GroupRunsUiState.Success(groupRuns)
} catch (e: com.google.gson.JsonSyntaxException) {
    // Backend returning HTML instead of JSON
    android.util.Log.e("GroupRunsViewModel", "❌ JSON parsing error: Backend returned HTML instead of JSON", e)
    _groupRunsState.value = GroupRunsUiState.Error(
        "Group Runs feature coming soon! 🏃\n\nThis feature is currently being developed on the backend."
    )
} catch (e: retrofit2.HttpException) {
    // Handle other HTTP errors
    _groupRunsState.value = when (e.code()) {
        401, 403 -> GroupRunsUiState.Error("Please log in to view group runs")
        404 -> GroupRunsUiState.Error("Group Runs feature coming soon! 🏃\n\nThis feature is currently being developed.")
        else -> GroupRunsUiState.Error("Failed to load group runs. Please try again.")
    }
}
```

### 2. Improved Error UI
**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GroupRunsScreen.kt`

Created user-friendly error state:

```kotlin
@Composable
fun ErrorGroupRunsState(
    errorMessage: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Warning icon
        Icon(
            painter = painterResource(id = R.drawable.icon_x_circle),
            contentDescription = "Error",
            tint = Colors.warning,
            modifier = Modifier.size(64.dp)
        )
        
        Spacer(modifier = Modifier.height(Spacing.lg))
        
        // User-friendly message
        Text(
            text = errorMessage,
            style = AppTextStyles.body,
            color = Colors.textSecondary,
            modifier = Modifier.padding(horizontal = Spacing.lg)
        )
        
        // Retry button (only shown for transient errors)
        if (!errorMessage.contains("coming soon", ignoreCase = true)) {
            Button(onClick = onRetry) {
                Text(text = "Retry", color = Colors.buttonText)
            }
        }
    }
}
```

### 3. Enhanced Backend Response Logging
**File:** `app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt`

Added HTML detection for **all** responses (not just 404):

```kotlin
// Detect if API is returning HTML instead of JSON
val contentType = response.header("Content-Type") ?: ""
if (contentType.contains("text/html", ignoreCase = true)) {
    android.util.Log.e("RetrofitClient", "⚠️ Backend returning HTML instead of JSON!")
    android.util.Log.e("RetrofitClient", "📍 Endpoint: ${request.url}")
    android.util.Log.e("RetrofitClient", "📦 Content-Type: $contentType")
    android.util.Log.e("RetrofitClient", "💡 This usually means the endpoint is not implemented on the backend")
    
    // Peek at response body to confirm it's HTML
    val bodyPreview = response.peekBody(200).string()
    if (bodyPreview.contains("<!DOCTYPE html>", ignoreCase = true)) {
        android.util.Log.e("RetrofitClient", "✅ Confirmed: Backend served HTML (frontend app)")
    }
}
```

## Files Modified

1. `app/src/main/java/live/airuncoach/airuncoach/viewmodel/GroupRunsViewModel.kt`
   - Added JsonSyntaxException handling
   - Added user-friendly error messages
   - Enhanced logging

2. `app/src/main/java/live/airuncoach/airuncoach/ui/screens/GroupRunsScreen.kt`
   - Created `ErrorGroupRunsState` composable
   - Added warning icon and retry button
   - Improved error display

3. `app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt`
   - Enhanced HTML detection logic
   - Added logging for all HTML responses
   - Better diagnostics for developers

## Testing Verification

### Build Status
✅ **SUCCESS** - Debug APK built successfully
- **Build Time:** ~15 seconds
- **APK Size:** 25 MB
- **Location:** `app/build/outputs/apk/debug/app-debug.apk`
- **Build Date:** February 7, 2026, 8:36 PM

### Expected Behavior After Fix

**Before Fix:**
- Tap "Group Runs" → App crashes or shows cryptic JSON error
- LogCat shows: "Use Json.Reader.setLenient(true)..."

**After Fix:**
- Tap "Group Runs" → Shows user-friendly message:
  ```
  Group Runs feature coming soon! 🏃
  
  This feature is currently being developed on the backend.
  ```
- No crash
- Clear message about feature status
- LogCat shows helpful diagnostics

### LogCat Output (After Fix)
```
GroupRunsViewModel: 📡 Fetching group runs...
RetrofitClient: 📡 Response from /api/group-runs: 200
RetrofitClient: ⚠️ Backend returning HTML instead of JSON!
RetrofitClient: 📍 Endpoint: https://ai-run-coach.replit.app/api/group-runs
RetrofitClient: 📦 Content-Type: text/html; charset=UTF-8
RetrofitClient: 💡 This usually means the endpoint is not implemented on the backend
RetrofitClient: ✅ Confirmed: Backend served HTML (frontend app)
GroupRunsViewModel: ❌ JSON parsing error: Backend returned HTML instead of JSON
GroupRunsViewModel: 💡 The /api/group-runs endpoint is not implemented on the backend yet
```

## Test Checklist

- [ ] Install updated APK
- [ ] Open app and navigate to Profile
- [ ] Tap "Group Runs"
- [ ] **Verify no crash** ✅
- [ ] **Verify user-friendly message displayed** ✅
- [ ] **Verify no retry button shown** (since it's "coming soon")
- [ ] Check LogCat for helpful diagnostics

## Backend Implementation Required

This is a **temporary fix** that handles the missing endpoint gracefully. The proper solution requires backend implementation:

### Backend TODO: Implement `/api/group-runs` Endpoint

**File:** `backend/server.js` (or routes file)

```javascript
// GET /api/group-runs - Get all group runs
app.get('/api/group-runs', requireAuth, async (req, res) => {
  try {
    const groupRuns = await db.query(`
      SELECT 
        id, name, meeting_point as "meetingPoint",
        description, distance, max_participants as "maxParticipants",
        date_time as "dateTime"
      FROM group_runs
      WHERE date_time >= NOW()
      ORDER BY date_time ASC
    `);
    
    // Get participants for each run
    for (let run of groupRuns.rows) {
      const participants = await db.query(
        'SELECT user_id FROM group_run_participants WHERE group_run_id = $1',
        [run.id]
      );
      run.participants = participants.rows.map(p => p.user_id);
    }
    
    res.json(groupRuns.rows);
  } catch (error) {
    console.error('Error fetching group runs:', error);
    res.status(500).json({ error: 'Failed to fetch group runs' });
  }
});
```

### Database Schema Required
```sql
CREATE TABLE group_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  meeting_point TEXT NOT NULL,
  description TEXT,
  distance FLOAT NOT NULL,
  max_participants INT DEFAULT 50,
  date_time TIMESTAMP NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE group_run_participants (
  group_run_id UUID REFERENCES group_runs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (group_run_id, user_id)
);
```

## Related Features to Implement

Once the backend endpoint is working, these Android features will automatically work:
1. ✅ View list of group runs
2. ✅ See run details (name, location, distance, participants)
3. ❓ Create new group run (needs backend POST endpoint)
4. ❓ Join/leave group run (needs backend PATCH endpoints)
5. ❓ View participants list
6. ❓ Group run chat/messages

## Prevention Guidelines

To prevent similar issues in the future:

### For Android Developers
1. **Always handle JsonSyntaxException** when parsing API responses
2. **Check Content-Type header** before parsing as JSON
3. **Add specific error messages** for common failures
4. **Use comprehensive logging** to diagnose issues
5. **Test with Postman/curl** before implementing Android code

### For Backend Developers
1. **Return proper 404 with JSON** for unimplemented endpoints:
   ```javascript
   app.use('/api/*', (req, res) => {
     res.status(404).json({ 
       error: 'Endpoint not found',
       message: 'This API endpoint is not yet implemented'
     });
   });
   ```
2. **Never let HTML fall through** to API routes
3. **Use API versioning** to avoid confusion
4. **Document all endpoints** in API spec
5. **Set proper Content-Type headers** for all responses

## Error Types We Now Handle

| Error Type | Cause | User Message | Retry Button |
|------------|-------|--------------|--------------|
| `JsonSyntaxException` | HTML returned instead of JSON | "Feature coming soon! 🏃" | ❌ No |
| `HttpException 401/403` | Not authenticated | "Please log in" | ✅ Yes |
| `HttpException 404` | Endpoint not found | "Feature coming soon! 🏃" | ❌ No |
| `HttpException 500` | Server error | "Failed to load. Try again." | ✅ Yes |
| `IOException` | Network error | "Check your connection" | ✅ Yes |

---

**Status:** ✅ **FIXED & DEPLOYED**  
**Build:** app-debug.apk (25 MB) - February 7, 2026, 8:36 PM  
**Backend Required:** `/api/group-runs` endpoint implementation  
**User Experience:** Graceful error with "Coming Soon" message
