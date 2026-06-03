# iOS Strava Import History Refresh Brief

## Status: Ready for Implementation 🚀

## Problem Being Fixed

When users import their Strava run history, the backend successfully imports 40+ runs, but the iOS app shows "0 runs imported" because it displays the response without refreshing the cached runs list.

**Logs Show**:
- ✅ Backend: "Imported 40 runs from Strava"  
- ❌ Frontend: Shows "0 runs imported" to user
- ❌ Root Cause: Runs cache never invalidated after import

---

## Solution Overview

**Cache invalidation pattern** - After a successful Strava import:
1. Call the import endpoint ✅
2. Invalidate the runs cache ← **NEW**
3. Next time user views runs, fresh data loads ← **Automatic**

This is a **minimal, surgical fix** that follows Android implementation.

---

## What Android Did

```kotlin
fun importStravaHistory() {
    viewModelScope.launch {
        try {
            _stravaLoading.value = true
            val response = apiService.importStravaHistory()
            
            // NEW: Invalidate cache after successful import
            if (response.success) {
                val userId = sessionManager.getUserId()
                if (!userId.isNullOrBlank()) {
                    runRepository.invalidateRunsForUser(userId)
                }
            }
            
            _stravaImportStatus.value = if (response.success)
                "Imported ${response.imported} runs from Strava"
            else
                "Import failed: ${response.error}"
        } finally {
            _stravaLoading.value = false
        }
    }
}
```

**Key Points**:
- Inject `RunRepository` (centralized cache manager)
- Call `invalidateRunsForUser(userId)` after success
- Next fetch auto-loads fresh data
- User sees all 40 runs! ✅

---

## iOS Implementation (Same Pattern)

### 1. **Find StravaViewModel** (in Xcode)
Location: Wherever iOS Strava sync logic lives  
Current method: `importStravaHistory()` or similar

### 2. **Add Method to Invalidate Runs Cache**
You likely have a runs cache (in memory, CoreData, or UserDefaults).

**If using a cache manager** (like Android):
```swift
// In StravaViewModel or wherever imports are handled
func importStravaHistory() async {
    do {
        _isLoading.value = true
        let response = try await apiService.post(
            "/api/strava/import-history",
            body: [:],
            responseType: StravaImportResponse.self
        )
        
        // NEW: Invalidate runs cache after successful import
        if response.success {
            if let userId = sessionManager.getUserId() {
                runsCache.invalidate(forUser: userId)  // ← This is the key line
            }
        }
        
        _importStatus = response.success 
            ? "Imported \(response.imported) runs from Strava"
            : "Import failed: \(response.error ?? "Unknown error")"
    } finally {
        _isLoading.value = false
    }
}
```

**If using UserDefaults/local storage**:
```swift
// NEW: Clear local runs cache
if response.success {
    UserDefaults.standard.removeObject(forKey: "cachedRuns")
    // OR if you have a RunsManager:
    runsManager.clearCache()
}
```

### 3. **Model**
You may need to add response model if missing:
```swift
struct StravaImportResponse: Codable {
    let success: Bool
    let imported: Int
    let skipped: Int
    let message: String?
    let error: String?
}
```

---

## What Files to Update

| File | Change | Complexity |
|------|--------|------------|
| StravaViewModel.swift | Add cache invalidation call | ⚠️ Low |
| RunsCache/Manager.swift | Ensure `invalidate()` method exists | ⚠️ Low |
| (Optional) StravaViewModels.swift | Add response model | ⚠️ Low |

**Total Time**: 10-15 minutes

---

## Testing Checklist

✅ **Quick Manual Test**:
1. In Settings, connect Strava (or already connected)
2. Tap "Import Run History" button
3. **Before Fix**: Shows "0 runs imported" (even if 40 were imported)
4. **After Fix**: Shows "Imported 40 runs from Strava" ✅
5. Go to Run History tab
6. **Verify**: All 40 imported runs visible ✅

✅ **Unit Test** (if you have tests):
```swift
func testImportInvalidatesRunsCache() {
    let mockCache = MockRunsCache()
    viewModel.runsCache = mockCache
    
    viewModel.importStravaHistory()
    
    // Verify cache was invalidated
    XCTAssertTrue(mockCache.wasInvalidated)
}
```

---

## Implementation Checklist

- [ ] Find StravaViewModel or equivalent import handler
- [ ] Locate where runs cache is managed
- [ ] Add cache invalidation call after `response.success`
- [ ] Add StravaImportResponse model (if missing)
- [ ] Test: Import runs → verify all appear in Run History
- [ ] Code review: Confirm cache is cleared correctly
- [ ] PR ready ✅

---

## Edge Cases (Already Handled by Backend)

✅ **What if import fails?**  
- Don't invalidate cache (cache stays as-is)
- Show error message to user  
- ✅ Already handled

✅ **What if some runs already exist?**  
- Backend skips duplicates automatically  
- Only count new imports in response  
- ✅ Backend handles this

✅ **What if network fails mid-import?**  
- Backend rolls back or marks as pending  
- ✅ Backend handles this

---

## Key Differences from Android

| Platform | Implementation | Cache Type |
|----------|---|---|
| **Android** | `runRepository.invalidateRunsForUser(userId)` | In-memory Map cache |
| **iOS** | `runsCache.invalidate(forUser: userId)` | Likely UserDefaults or Core Data |

The **concept is identical** — just different syntax for your cache system.

---

## No Backend Changes Needed ✅

The `/api/strava/import-history` endpoint already works perfectly:
- Returns correct count of imported runs
- Already saves 40 runs to database  
- ✅ Zero backend changes needed

---

## Expected User Experience After Fix

**Before** (Current - Broken):
```
1. Click "Import Run History"
2. Backend imports 40 runs ✅ (silently)
3. App shows "0 runs imported" ❌
4. User confused "Did it work?"
5. User clicks again (creating duplicates)
```

**After** (Fixed):
```
1. Click "Import Run History"
2. Backend imports 40 runs ✅
3. App invalidates cache ✅
4. App shows "Imported 40 runs from Strava" ✅
5. User navigates to Run History
6. All 40 runs appear ✅
7. User happy!
```

---

## Copy-Paste Template

If your code is simpler and doesn't have a cache manager:

```swift
func importStravaHistory() async {
    isLoading = true
    
    do {
        let response = try await apiService.post(
            "/api/strava/import-history",
            body: [:],
            responseType: StravaImportResponse.self
        )
        
        if response.success {
            // ← ADD THIS:
            clearRunsCache()  // or runsManager.invalidateCache()
            
            importStatus = "Imported \(response.imported) runs from Strava"
        } else {
            importStatus = "Import failed: \(response.error ?? "Unknown error")"
        }
    } catch {
        importStatus = "Import failed: \(error.localizedDescription)"
    }
    
    isLoading = false
}
```

---

## Success Criteria

✅ **Complete when**:
- [ ] Code compiles without errors
- [ ] Manual test: Import shows correct count
- [ ] Manual test: Run History displays all imported runs
- [ ] No breaking changes to other features
- [ ] PR reviewed and approved

---

## Similar to Android Fix

This is **identical logic** to what was just fixed on Android:
- Same problem (cache not invalidated)
- Same solution (invalidate after success)
- Same outcome (user sees imported runs)

If you have questions about Android implementation, refer to:
```
app/src/main/java/live/airuncoach/airuncoach/viewmodel/ConnectedDevicesViewModel.kt
```

---

## Questions Before Starting?

- Where is the runs cache in iOS? (UserDefaults, Core Data, custom manager?)
- Is there an existing cache invalidation method?
- Do you have a SessionManager for getting userId?
- Should we also clear published activities cache?

---

## Estimated Time

**10-15 minutes** from start to PR-ready

No architectural changes, no migrations, no API updates needed.

---

## Final Notes

✅ **Minimal fix**: 2-3 lines of code  
✅ **High impact**: Users see their imported runs  
✅ **Low risk**: Only affects Strava import flow  
✅ **Proven**: Already works perfectly on Android  

**Ready to implement!** 🚀
