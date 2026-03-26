# iOS Network Optimization Guide

## Yes, Your iOS App Needs the Same Optimizations ✅

The network optimization strategy applies **100% to iOS** as well. The bandwidth being consumed happens at the backend level—it doesn't matter if requests come from Android or iOS, they both cost the same on your Neon bill.

---

## iOS Optimization Strategy (Parallel to Android)

### ✅ What iOS Already Has (Likely)

**URLSession HTTP Caching:**
- iOS has built-in HTTP caching via `URLSession`
- Automatically respects `Cache-Control` headers from backend
- Stores cached responses to disk

**Current issue:** If your backend isn't sending `Cache-Control` headers, this built-in caching won't activate.

---

## iOS Implementation Roadmap

### Step 1: Enable URLSession HTTP Caching (iOS Only)

If not already configured, ensure your URLSession setup includes caching:

```swift
// In your NetworkClient or APIManager
let config = URLSessionConfiguration.default
config.urlCache = URLCache(
    memoryCapacity: 20 * 1024 * 1024,  // 20MB
    diskCapacity: 50 * 1024 * 1024,    // 50MB
    diskPath: "http_cache"
)
config.requestCachePolicy = .useProtocolCachePolicy  // Respect Cache-Control headers

let session = URLSession(configuration: config)
```

This is **identical in concept** to Android's OkHttp caching.

### Step 2: Create Shared Data Repository (iOS)

Create a `RunRepository` equivalent in iOS:

```swift
@MainActor
class RunRepository: ObservableObject {
    private let apiClient: APIClient
    private let cacheDuration: TimeInterval = 5 * 60  // 5 minutes
    
    // In-memory caches
    private var runsCacheByUser: [String: CachedData<[RunSession]>] = [:]
    private var runByIdCache: [String: CachedData<RunSession>] = [:]
    
    func getRunsForUser(_ userId: String, forceRefresh: Bool = false) async throws -> [RunSession] {
        // Check cache first
        if !forceRefresh,
           let cached = runsCacheByUser[userId],
           cached.isFresh() {
            Logger.log("✅ Returning cached runs for user \(userId)")
            return cached.data
        }
        
        // Fetch from API
        Logger.log("📡 Fetching runs for user \(userId)")
        let runs = try await apiClient.getRunsForUser(userId)
        
        // Cache result
        runsCacheByUser[userId] = CachedData(runs, Date())
        Logger.log("💾 Cached \(runs.count) runs")
        
        return runs
    }
    
    func getRunById(_ runId: String) async throws -> RunSession {
        // Check cache first
        if let cached = runByIdCache[runId], cached.isFresh() {
            Logger.log("✅ Returning cached run \(runId)")
            return cached.data
        }
        
        // Fetch from API
        Logger.log("📡 Fetching run \(runId)")
        let run = try await apiClient.getRunById(runId)
        
        // Cache result
        runByIdCache[runId] = CachedData(run, Date())
        Logger.log("💾 Cached run \(runId)")
        
        return run
    }
    
    // Cache invalidation
    func invalidateRunsForUser(_ userId: String) {
        runsCacheByUser.removeValue(forKey: userId)
    }
    
    func clearAllCaches() {
        runsCacheByUser.removeAll()
        runByIdCache.removeAll()
    }
}

// Helper struct
private struct CachedData<T> {
    let data: T
    let cachedAt: Date
    
    func isFresh() -> Bool {
        Date().timeIntervalSince(cachedAt) < 5 * 60
    }
}
```

### Step 3: Integrate into iOS ViewModels/Services

Update your data access layer (ViewModels, Services, etc.):

**Before (Multiple API Calls):**
```swift
// DashboardView
@StateObject private var viewModel: DashboardViewModel

// Inside viewModel:
async let runs = apiClient.getRunsForUser(userId)  // ❌ Direct API call

// PreviousRunsView
async let allRuns = apiClient.getRunsForUser(userId)  // ❌ Another call to same endpoint
```

**After (Shared Repository):**
```swift
// Inject repository into your view hierarchy
@StateObject private var runRepository = RunRepository()

// DashboardView
let runs = try await runRepository.getRunsForUser(userId)  // ✅ Cached

// PreviousRunsView
let allRuns = try await runRepository.getRunsForUser(userId)  // ✅ Same cache, zero network
```

---

## Backend Changes (Same as Android)

Your **backend changes are the same** and will benefit both platforms:

### Priority 1: Enable Gzip Compression (5 min)
```typescript
// In your Node.js backend
import compression from 'compression';
app.use(compression());
```

**Impact on iOS:** 40-60% reduction in all responses

### Priority 2: Add Cache-Control Headers (15 min)
```typescript
// For reads that don't change frequently
app.get('/api/runs/:id', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');  // 1 hour
  // send data
});
```

**Impact on iOS:** URLSession respects these headers and caches responses automatically

### Priority 3: Pagination & Field Selection (2-4 hours)
```typescript
app.get('/api/users/:userId/runs', (req, res) => {
  const limit = req.query.limit || 50;
  const fields = req.query.fields || 'id,distance,duration,date,pace';
  // Return only requested fields
});
```

**Impact on iOS:** Smaller payloads = faster downloads

---

## Expected Results (iOS)

| Change | Before | After | Savings |
|---|---|---|---|
| **Gzip Compression** | 100% bandwidth | 40% bandwidth | 60% ✅ |
| **HTTP Caching** | 100% requests → network | 70% requests → cache | 70% ✅ |
| **RunRepository Cache** | 4 identical API calls | 1 API call | 75% ✅ |
| **Field Selection** | 100 fields per run | 6-10 fields | 40-50% ✅ |
| **TOTAL COMBINED** | 100% baseline | ~20-25% baseline | **75-80% reduction** ⚡ |

---

## iOS Implementation Checklist

- [ ] Verify URLSession caching is configured
- [ ] Create `RunRepository` with 5-minute cache
- [ ] Update all view models to use `RunRepository`
- [ ] Add `invalidateRunsForUser()` calls after mutations
- [ ] Test in simulator/device with network inspector
- [ ] Monitor bandwidth usage

---

## Sync Both Platforms

**Important:** When your backend dev implements the optimization, **both Android and iOS will benefit automatically** from:
1. ✅ Gzip compression
2. ✅ Cache-Control headers  
3. ✅ Pagination

You only need to:
1. ✅ Ensure URLSession caching is enabled (iOS)
2. ✅ Add RunRepository (iOS)
3. ✅ Integrate RunRepository into your views

---

## Why This Matters for Neon

Your Neon bill is based on **total bytes transferred**, not per-app:

```
Total Neon Bandwidth = (Android Traffic) + (iOS Traffic)

If iOS is not optimized:
  ~250MB/day Android + ~250MB/day iOS = 500MB/day = 15GB/month ❌

If BOTH optimized:
  ~75MB/day Android + ~75MB/day iOS = 150MB/day = 4.5GB/month ✅
```

**Optimization is essential for BOTH platforms to keep costs manageable.**

---

## Timeline for iOS Implementation

1. **Week 1**: Configure URLSession caching + create RunRepository
2. **Week 2**: Integrate RunRepository into key views
3. **Week 3**: Coordinate with backend dev on Cache-Control headers
4. **Week 4**: Monitor and optimize based on real usage

---

## Key Takeaway

**The backend changes (gzip + cache headers) are the leverage point.** They'll benefit:
- ✅ Android automatically (OkHttp respects headers)
- ✅ iOS automatically (URLSession respects headers)
- ✅ Web frontend (if you have one)

Both mobile apps just need:
1. Caching layer configuration (already built-in)
2. Repository pattern for deduplication (simple to add)

This is a **coordinated effort** between backend, Android, and iOS teams, but each side has clear tasks.
