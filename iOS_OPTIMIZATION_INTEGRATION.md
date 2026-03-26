# iOS Network & Compute Optimisation — Implementation Brief

**Status**: Backend changes are fully deployed. iOS client work required.
**Android reference**: `ANDROID_OPTIMIZATION_INTEGRATION.md` (same patterns, Swift equivalents)

---

## What the Backend Already Does For You ✅

These are active on the server right now — **iOS benefits automatically once you verify
your URLSession setup respects them:**

| Backend Change | How iOS Benefits |
|---|---|
| **Gzip compression** | URLSession accepts gzip by default — all responses are 40-60% smaller immediately |
| **Cache-Control headers** | URLSession/NSURLCache will cache GET responses automatically |
| **Paginated runs list** | API now returns 50 runs by default instead of full history |
| **SQL-level stats aggregation** | `/api/my-data` responses are tiny (1 row) regardless of run count |
| **user_stats cache table** | All-time stats + PBs load in one O(1) DB lookup |

---

## Part 1: URLSession HTTP Caching (30 min)

The single biggest win. Verify your `URLSession` is configured with a disk cache —
most iOS apps don't enable this by default.

### Check your current setup

Look for where `URLSession` is configured in your networking layer (likely `APIClient.swift`
or `NetworkManager.swift`). If you see this, you're using the default (no disk cache):

```swift
// ❌ Default — no disk cache, no benefit from Cache-Control headers
let session = URLSession.shared
```

### Update to use a cache

```swift
// ✅ Configure once at app launch (AppDelegate or dependency injection root)
import Foundation

final class NetworkClient {
    static let shared = NetworkClient()

    let session: URLSession

    private init() {
        let cache = URLCache(
            memoryCapacity: 20 * 1024 * 1024,   // 20MB in-memory
            diskCapacity:   50 * 1024 * 1024,    // 50MB on disk
            diskPath:       "airuncoach_http_cache"
        )

        let config = URLSessionConfiguration.default
        config.urlCache = cache
        config.requestCachePolicy = .useProtocolCachePolicy  // Respect Cache-Control headers

        self.session = URLSession(configuration: config)
    }
}
```

**Why `.useProtocolCachePolicy`?** The backend sends `Cache-Control: private, max-age=300`
on run data. With this policy URLSession returns the cached copy for 5 minutes without
hitting the network — identical to what OkHttp does on Android.

**Endpoints that will be cached automatically** (backend sends correct headers):
- `GET /api/runs/user/:userId` — 5 min cache
- `GET /api/runs/:id` — 5 min cache
- `GET /api/my-data/*` — 5 min cache
- `GET /api/training-plans/*` — 5 min cache

**Endpoints that are explicitly NOT cached** (backend sends `no-store`):
- `GET /api/live-sessions/*`
- `GET /api/ai/*`
- `GET /api/notifications/unread-count`

---

## Part 2: RunRepository (2–3 hours)

An in-memory cache layer that sits between your ViewModels/ViewControllers and the
network client. Prevents duplicate API calls when multiple screens need the same data.

### The problem without it

When a user navigates from Dashboard → Previous Runs → Run Summary, each screen
independently calls `GET /api/runs/user/:userId` — even within seconds of each other.
That's 3 identical network requests.

### Implementation

```swift
// RunRepository.swift
import Foundation

actor RunRepository {

    static let shared = RunRepository()

    private let network: NetworkClient
    private let cacheTTL: TimeInterval = 5 * 60  // 5 minutes

    private var runsCache: [String: (runs: [RunSession], fetchedAt: Date)] = [:]
    private var runByIdCache: [String: (run: RunSession, fetchedAt: Date)] = [:]

    private init(network: NetworkClient = .shared) {
        self.network = network
    }

    // MARK: - Public API

    func getRuns(for userId: String) async throws -> [RunSession] {
        if let cached = runsCache[userId], !isStale(cached.fetchedAt) {
            print("✅ Returning cached runs for \(userId)")
            return cached.runs
        }

        print("📡 Fetching runs for \(userId) from API")
        let runs = try await network.fetchRuns(userId: userId)
        runsCache[userId] = (runs: runs, fetchedAt: Date())
        return runs
    }

    func getRun(id: String) async throws -> RunSession {
        // Check the runs list cache first (avoids a separate request)
        for (_, cached) in runsCache {
            if !isStale(cached.fetchedAt), let run = cached.runs.first(where: { $0.id == id }) {
                return run
            }
        }

        if let cached = runByIdCache[id], !isStale(cached.fetchedAt) {
            print("✅ Returning cached run \(id)")
            return cached.run
        }

        print("📡 Fetching run \(id) from API")
        let run = try await network.fetchRun(id: id)
        runByIdCache[id] = (run: run, fetchedAt: Date())
        return run
    }

    // MARK: - Cache Invalidation

    /// Call after completing/saving a run
    func invalidateRuns(for userId: String) {
        runsCache.removeValue(forKey: userId)
    }

    /// Call after updating a specific run
    func invalidateRun(id: String) {
        runByIdCache.removeValue(forKey: id)
    }

    /// Call on logout
    func clearAll() {
        runsCache.removeAll()
        runByIdCache.removeAll()
    }

    // MARK: - Private

    private func isStale(_ date: Date) -> Bool {
        Date().timeIntervalSince(date) > cacheTTL
    }
}
```

### Wire it into your ViewModels

```swift
// Before (direct API call):
func loadRuns() async {
    runs = try await apiClient.fetchRuns(userId: currentUserId)  // ❌
}

// After (via repository):
func loadRuns() async {
    runs = try await RunRepository.shared.getRuns(for: currentUserId)  // ✅
}
```

**Key screens to update:**
- Dashboard screen (recent runs)
- Previous Runs / Run History screen
- Run Summary screen (`getRunById`)
- Goals screen (linked run fetch)

### Cache invalidation points

```swift
// After a run is saved
RunRepository.shared.invalidateRuns(for: userId)

// On logout
RunRepository.shared.clearAll()
```

---

## Part 3: Paginated Runs List (1 hour)

The API now defaults to 50 most-recent runs. If your app currently fetches all runs
and paginates locally, update to use the server-side pagination.

```swift
// Updated API call — fetch 50 at a time
func fetchRuns(userId: String, limit: Int = 50, offset: Int = 0) async throws -> [RunSession] {
    var components = URLComponents(string: "\(baseURL)/api/runs/user/\(userId)")
    components?.queryItems = [
        URLQueryItem(name: "limit",  value: String(limit)),
        URLQueryItem(name: "offset", value: String(offset)),
    ]
    // ... make request
}

// In your RunRepository load-more pattern:
func loadMoreRuns(for userId: String, currentCount: Int) async throws -> [RunSession] {
    return try await network.fetchRuns(userId: userId, limit: 50, offset: currentCount)
}
```

**Response shape** (unchanged — same fields, just limited rows):
```json
[
  { "id": "...", "distance": 5.2, "avgPace": "5:22", ... }
]
```

---

## Part 4: Verify Gzip Acceptance (15 min)

iOS URLSession sends `Accept-Encoding: gzip, deflate` by default, so this should work
automatically. Verify by checking a response header in a debug build:

```swift
// Quick verification — add temporarily to your network layer
if let response = urlResponse as? HTTPURLResponse {
    let encoding = response.value(forHTTPHeaderField: "Content-Encoding")
    print("Content-Encoding: \(encoding ?? "none")")  // Should print "gzip"
}
```

If `Content-Encoding` is not `gzip`, check that you haven't explicitly disabled encoding
anywhere in your `URLSessionConfiguration`.

---

## Summary: What to Build

| Task | Effort | Bandwidth Saving |
|---|---|---|
| Configure `URLCache` with disk cache | 30 min | 30–50% (HTTP caching active) |
| Create `RunRepository` + wire into key screens | 2–3 hrs | 20–30% (deduplication) |
| Update runs fetch to use `?limit=50&offset=N` | 1 hr | 30–50% (smaller payloads) |
| Verify gzip acceptance | 15 min | Already working (confirm only) |
| **Total estimated savings** | **~4 hrs** | **~70–80% bandwidth reduction** |

---

## Expected Results

```
Before:  ~250MB/day (all iOS traffic)
After:   ~50MB/day
Monthly: 1.5GB instead of 7.5GB

At 1,000 users:
  Before: 250GB/month iOS alone → Neon Scale plan required
  After:  50GB/month iOS → comfortable on standard plan
```

---

## Backend Endpoints Reference

All backend changes are already live. No backend work required from iOS.

| Endpoint | Cache-Control | Notes |
|---|---|---|
| `GET /api/runs/user/:id` | `private, max-age=300` | Supports `?limit=N&offset=N` |
| `GET /api/runs/:id` | `private, max-age=300` | Individual run |
| `GET /api/my-data/all-time-stats` | `private, max-age=300` | From cache table — very fast |
| `GET /api/my-data/personal-bests` | `private, max-age=300` | From cache table — very fast |
| `GET /api/my-data/period-stats` | `private, max-age=300` | SQL aggregation — 1 row |
| `GET /api/training-plans` | `private, max-age=300` | Plan list |
| `GET /api/live-sessions/*` | `no-store` | Always live — never cached |
| `GET /api/ai/*` | `no-store` | Always live — never cached |
| `GET /api/notifications/unread-count` | `no-store` | Always live — never cached |

---

## Questions?

**Do I need to change request headers?**
No. URLSession sends `Accept-Encoding: gzip` automatically, and `Cache-Control` is handled
by the response headers the server sends.

**What happens on cache miss?**
Falls through to a normal network request. Fully transparent to the caller.

**What about background refresh / stale data?**
The 5-minute TTL on both HTTP cache and RunRepository means data is refreshed regularly.
For critical freshness (e.g. after saving a run), call `invalidateRuns(for: userId)`.

**Is this safe during a live run session?**
Yes — `/api/live-sessions/*` endpoints have `no-store` so they bypass caching entirely.
