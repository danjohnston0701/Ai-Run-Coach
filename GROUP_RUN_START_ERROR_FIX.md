# Group Run Start Error - Fix Applied

## Problem
When trying to start a group run, users were getting this error:
```
Failed to start run: Response from live.airuncoach.airuncoach.network.ApiService.startGroupRun was null but response body type was declared as non-null
```

## Root Cause
The backend API endpoint `POST /api/group-runs/{id}/start` is returning either:
- A 204 No Content response (empty body)
- Or an empty JSON response body

However, the Kotlin client was configured to expect a non-null `GroupRun` object as the response. This mismatch caused Retrofit to throw an exception when deserializing the null/empty response.

## Solution Applied

### 1. Updated API Service (ApiService.kt)
**Changed**:
```kotlin
@POST("/api/group-runs/{id}/start")
suspend fun startGroupRun(@Path("id") groupRunId: String): GroupRun
```

**To**:
```kotlin
@POST("/api/group-runs/{id}/start")
suspend fun startGroupRun(@Path("id") groupRunId: String): GroupRun?
```

**Rationale**: Made the return type nullable (`GroupRun?`) to match the backend's actual behavior of returning no response body.

---

### 2. Updated ViewModel (GroupRunDetailViewModel.kt)
**Changed**:
```kotlin
fun startRun(groupRunId: String) {
    viewModelScope.launch {
        _actionLoading.value = true
        try {
            apiService.startGroupRun(groupRunId)
            _startedGroupRunId.value = groupRunId
        } catch (e: Exception) {
            _actionError.value = "Failed to start run: ${e.message}"
        } finally {
            _actionLoading.value = false
        }
    }
}
```

**To**:
```kotlin
fun startRun(groupRunId: String) {
    viewModelScope.launch {
        _actionLoading.value = true
        try {
            val response = apiService.startGroupRun(groupRunId)
            // Backend may return null on 204 No Content, which is fine
            // Just mark the group run as started
            _startedGroupRunId.value = groupRunId
            // If we got a response, update the state
            response?.let { updatedGr ->
                _state.value = GroupRunDetailState.Success(updatedGr)
            }
        } catch (e: Exception) {
            _actionError.value = "Failed to start run: ${e.message}"
            Log.e("GroupRunDetailVM", "startRun error", e)
        } finally {
            _actionLoading.value = false
        }
    }
}
```

**Changes**:
- Capture the response in a variable
- Still mark `_startedGroupRunId` to trigger navigation (the important part)
- Only update the UI state if the response isn't null
- Added logging for better debugging

---

## Testing

To verify the fix works:

1. Open group run detail screen
2. As organizer, tap "Start Group Run" button
3. Should no longer get the null response error
4. Should navigate to run summary or appropriate next screen
5. Group run status should update in the backend

---

## Files Modified

| File | Changes |
|------|---------|
| `ApiService.kt` | Made `startGroupRun()` return type nullable |
| `GroupRunDetailViewModel.kt` | Updated `startRun()` to handle nullable response |

## Impact
- ✅ Fixes the error when organizer tries to start a group run
- ✅ Maintains existing navigation behavior
- ✅ No breaking changes to other functionality
- ✅ Backward compatible if backend starts returning the `GroupRun` object in the future
