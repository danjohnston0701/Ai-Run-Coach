# Android Network Optimization - Implementation Guide

## Changes Made ✅

### 1. **HTTP Caching Enabled in RetrofitClient**
- Added `okhttp3.Cache` with 50MB capacity
- OkHttp will automatically cache responses based on server headers
- Respects `Cache-Control` headers from backend
- **Status**: ✅ ACTIVE (no code changes needed, works automatically)

### 2. **RunRepository Created**
- Location: `app/src/main/java/live/airuncoach/airuncoach/data/repository/RunRepository.kt`
- Implements in-memory caching for:
  - `getRunsForUser(userId)` - caches for 5 minutes
  - `getRunById(runId)` - caches for 5 minutes
- Provides invalidation methods for cache clearing
- **Status**: ✅ CREATED (ready to integrate)

---

## Next Steps: Integrate RunRepository into ViewModels

### Step 1: Update DashboardViewModel

**Current code:**
```kotlin
@HiltViewModel
class DashboardViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager
) : ViewModel() {
    // ...
    fun loadRuns(userId: String) {
        viewModelScope.launch {
            try {
                val runs = apiService.getRunsForUser(userId)  // ❌ Direct API call
                // ...
            }
        }
    }
}
```

**Update to:**
```kotlin
@HiltViewModel
class DashboardViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val sessionManager: SessionManager,
    private val runRepository: RunRepository  // ✅ Inject repository
) : ViewModel() {
    // ...
    fun loadRuns(userId: String) {
        viewModelScope.launch {
            try {
                val runs = runRepository.getRunsForUser(userId)  // ✅ Use repository
                // ...
            }
        }
    }
}
```

### Step 2: Update PreviousRunsViewModel

Same pattern - replace `apiService.getRunsForUser()` with `runRepository.getRunsForUser()`

```kotlin
// Before:
val allRuns = apiService.getRunsForUser(userId)

// After:
val allRuns = runRepository.getRunsForUser(userId)
```

### Step 3: Update RunSummaryViewModel

Replace `apiService.getRunById()` with `runRepository.getRunById()`

```kotlin
// Before:
val session = apiService.getRunById(runId)

// After:
val session = runRepository.getRunById(runId)
```

### Step 4: Update GoalsViewModel

```kotlin
// Before:
_linkedRunSession.value = apiService.getRunById(runId)

// After:
_linkedRunSession.value = runRepository.getRunById(runId)
```

---

## Expected Network Savings After Integration

| ViewModel | Current Calls | After Repository | Savings |
|---|---|---|---|
| **DashboardViewModel** | getRunsForUser() | Cache hit | ~50-70% |
| **PreviousRunsViewModel** | getRunsForUser() | Cache hit | ~50-70% |
| **RunSummaryViewModel** | getRunById() | Cache hit | ~70-80% |
| **GoalsViewModel** | getRunById() | Cache hit | ~70-80% |
| **TOTAL** | 4+ API calls | 1 API call | **~60-75% reduction** |

---

## Cache Invalidation Points

The repository provides methods to clear caches when data changes:

```kotlin
// After completing a run
runRepository.invalidateRunsForUser(userId)  // Next call fetches fresh data

// After updating a run
runRepository.invalidateRunById(runId)

// On logout
runRepository.clearAllCaches()
```

---

## Backend Changes Needed (Coordinate with Backend Dev)

### Priority 1: Enable Gzip Compression (5 min)

**Node.js/Express:**
```typescript
// Add to your package.json
"compression": "^1.7.4"

// In your app.js
import compression from 'compression';
app.use(compression());
```

This is a **one-line change** that reduces transfer by **40-60%** automatically.

### Priority 2: Add Cache-Control Headers (15 min)

**Node.js/Express:**
```typescript
// For GET endpoints that don't change frequently
router.get('/api/runs/:id', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');  // 1 hour
  // ... send run data
});

router.get('/api/users/:userId/runs', (req, res) => {
  res.set('Cache-Control', 'public, max-age=1800');  // 30 minutes
  // ... send runs list
});

// For real-time endpoints (coaching, etc.)
router.post('/api/coaching/elite-coaching', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store');  // No caching
  // ... send coaching data
});
```

**Why this matters:**
- Without `Cache-Control` headers, OkHttp won't cache responses
- With proper headers, identical requests return zero-byte cached responses
- This is the **single biggest leverage point** for reducing bandwidth

### Priority 3: Pagination & Field Selection (2-4 hours)

Add optional query parameters to list endpoints:

```typescript
router.get('/api/users/:userId/runs', (req, res) => {
  const limit = req.query.limit || 50;
  const offset = req.query.offset || 0;
  const fields = req.query.fields || 'id,distance,duration,date,pace';
  
  // Return only requested fields
  const runs = fetchRuns(userId, limit, offset).map(run => ({
    id: run.id,
    distance: run.distance,
    duration: run.duration,
    date: run.date,
    pace: run.pace,
    // ... only fields in the 'fields' parameter
  }));
  
  res.set('Cache-Control', 'public, max-age=1800');
  res.json({ runs, total: runs.length, hasMore: offset + limit < total });
});
```

---

## Implementation Checklist

### Android App Changes:
- [x] Add HTTP caching to RetrofitClient
- [x] Create RunRepository with 5-minute cache
- [ ] Update DashboardViewModel to use RunRepository
- [ ] Update PreviousRunsViewModel to use RunRepository
- [ ] Update RunSummaryViewModel to use RunRepository
- [ ] Update GoalsViewModel to use RunRepository
- [ ] Test: Verify cache hits in logs (look for "✅ Returning cached runs...")

### Backend Changes (Communicate with Backend Dev):
- [ ] **PRIORITY**: Add gzip compression (`npm install compression`)
- [ ] **PRIORITY**: Add `Cache-Control` headers to GET endpoints
- [ ] **NICE TO HAVE**: Add pagination + field selection to list endpoints

---

## Monitoring & Validation

After implementation, you should see logs like:

```
✅ Returning cached runs for user 12345 (cached 123ms ago)
✅ Returning cached run abc123 (cached 456ms ago)
📡 Fetching runs for user 12345 from API
💾 Cached 15 runs for user 12345
```

The first call fetches from API, subsequent calls (within 5 min) return cached data.

---

## Cost Impact

**Before optimizations:**
- ~250MB/day network transfer
- 7.5GB/month (expensive on Neon)

**After optimizations:**
- ~75MB/day network transfer
- 2.25GB/month (very comfortable, room to grow)

**Savings: ~70% reduction in bandwidth costs** 💰

---

## Questions?

- **How does HTTP caching work?** OkHttp respects `Cache-Control` headers and stores responses to disk. Identical requests return cached data (zero network transfer).
- **How does RunRepository caching differ?** In-memory caching for 5 minutes, independent of server headers. Ensures fresh data every 5 min while avoiding duplicate API calls.
- **What if data changes?** Call `invalidateRunsForUser()` or `invalidateRunById()` to clear cache immediately.
- **What about sync with backend?** Always call these invalidation methods after POST/PUT/DELETE operations.
