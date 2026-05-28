# iOS Update Brief — Changes Required Since Previous Brief

This document covers **only the new changes** from the latest development session.
Refer to the existing `iOS_GARMIN_INTEGRATION_BRIEF.md` for the full Garmin SDK setup.

---

## 1. Garmin Watch — Token Auto-Refresh ⚠️ Critical

### What changed
A new backend endpoint generates a dedicated **365-day companion JWT** specifically for the watch.
Every time the phone app opens or the watch connects, the phone calls this endpoint and pushes
the fresh token to the watch over Bluetooth. This means the token is silently renewed on every
phone open — in practice, token expiry is never reached.

Previously the phone sent its own regular JWT (30-day lifetime) to the watch, causing the watch
to show the "Waiting for phone" auth screen every month.

### Backend endpoint (live now)
```
POST /api/garmin-companion/refresh-watch-token
Authorization: Bearer <user's regular JWT>
Body: { "deviceId": "optional", "deviceModel": "e.g. Fenix 7" }
Response: { "token": "<365d companion JWT>", "expiresIn": 31536000 }
```

### iOS implementation

Create a `pushFreshWatchToken(runnerName:)` helper and call it in two places:

```swift
// Call in: sceneDidBecomeActive AND when onWatchAppReady fires
func pushFreshWatchToken(runnerName: String) async {
    do {
        let deviceModel = garminManager.connectedDeviceName
        let response = try await apiService.refreshWatchToken(deviceModel: deviceModel)
        garminManager.sendAuth(token: response.token, runnerName: runnerName)
        print("✅ Fresh 365d watch token pushed")
    } catch {
        // Fallback: send the user's regular JWT if network unavailable
        if let fallback = sessionManager.authToken {
            garminManager.sendAuth(token: fallback, runnerName: runnerName)
        }
    }
}
```

Wire it up:
```swift
// AppDelegate / SceneDelegate
func sceneDidBecomeActive(_ scene: UIScene) {
    let name = sessionManager.userName ?? ""
    Task { await pushFreshWatchToken(runnerName: name) }
}

// GarminManager onWatchAppReady callback
garminManager.onWatchAppReady = {
    let name = sessionManager.userName ?? ""
    Task { await pushFreshWatchToken(runnerName: name) }
}
```

**Important**: Never send the user's regular short-lived JWT to the watch directly anymore.
Always use the `refresh-watch-token` endpoint. Fall back to the stored JWT only if the network
call fails.

---

## 2. Garmin Watch App — Updated IQ File ⚠️ Important

The latest watch app is **v2.4.7** (was 2.4.6 in the previous brief).

### What changed in v2.4.7
- **IQ crash fix** — The watch was crashing on cold opens (showing the IQ error icon). Root cause:
  `Comm.makeWebRequest()` was being called during the ConnectIQ `initialize()` constructor phase,
  before the Comm subsystem was ready. Now fixed — HTTP calls only happen at run-start or later.
- **Waiting screen text** — Now reads: *"Open Ai Run Coach on your phone to connect. You only
  need to do this once."* in grey with a green confirmation line.
- **No mid-run token wipe** — If a 401 occurs during an active run, the stored token is preserved
  (run continues in offline buffer mode). Token is only cleared when the app is idle.
- **Smart offline buffer** — Offline buffer only activates after 5 consecutive HTTP failures
  (confirming relay is genuinely unavailable), not just when the watch reports no phone connection.

Update the `.iq` file reference in your iOS project to `AiRunCoach_v2.4.7.iq`.

---

## 3. Strava — OAuth Callback & Screen Refresh ⚠️ Critical

### What changed
The backend OAuth callback no longer sends a bare `Location: airuncoach://...` HTTP redirect
(which browsers on both iOS and Android can silently block). It now serves an **HTML page** that
uses JavaScript to fire the deep link — `SFSafariViewController` on iOS handles this natively.

### Connected Devices screen — must refresh on appear

Add a check in **two places**:

**a) On every `viewWillAppear` / `onAppear` (safety net):**
```swift
override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    // Delay 1.5s — lets the backend DB write complete before we query
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
        self.viewModel.checkStravaConnection()
    }
}
```

**b) On deep link callback (`airuncoach://strava/auth-complete?success=true`):**
```swift
if url.scheme == "airuncoach", url.host == "strava", url.path == "/auth-complete" {
    let success = URLComponents(url: url, resolvingAgainstBaseURL: false)?
        .queryItems?.first(where: { $0.name == "success" })?.value == "true"
    if success {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            // Notify Connected Devices screen to refresh
            NotificationCenter.default.post(name: .stravaAuthComplete, object: nil)
        }
    }
}
```

### Force fresh network fetch — bypass URL cache
Add `Cache-Control: no-cache, no-store` as a **request header** on
`GET /api/strava/connection-status`. Without this, `URLCache` serves the old
`connected: false` response after OAuth completes, same bug as OkHttp on Android.

```swift
var request = URLRequest(url: connectionStatusURL)
request.setValue("no-cache, no-store", forHTTPHeaderField: "Cache-Control")
```

### Don't wipe connected state on transient errors
```swift
do {
    let status = try await fetchStravaConnectionStatus()
    isConnected = status.connected      // Only update on definitive response
    athleteName = status.athleteName
} catch {
    print("Status check failed — keeping previous state: \(error)")
    // Do NOT set isConnected = false here
}
```

### Disconnect — only clear local state on HTTP 200
```swift
do {
    try await disconnectStrava()        // POST /api/strava/disconnect
    isConnected = false
    athleteName = nil
} catch {
    showError("Failed to disconnect. Please try again.")
    // Do NOT change isConnected
}
```

---

## 4. Goals Screen — Two Fixes

### Fix A: Loading spinner stuck after data loads
After calling `GET /api/goals/:userId`, **explicitly set the UI state to success**
immediately — do not rely solely on a reactive combine/publisher chain, which has a
timing race where the screen can re-render in `.loading` state after the data arrives.

```swift
do {
    let goals = try await apiService.getGoals(userId: userId)
    allGoals = goals
    goalsState = .success(filterGoals(goals, tab: selectedTab))  // ← explicit, immediate
} catch {
    goalsState = .error(error.localizedDescription)
}
```

### Fix B: Newly created goals not appearing (URL cache)
Add `Cache-Control: no-cache, no-store` to the **request headers** on `GET /api/goals/:userId`.
Without this, `URLCache` serves the old list (before the new goal was created).

```swift
// When building the request for getGoals:
request.setValue("no-cache, no-store", forHTTPHeaderField: "Cache-Control")
```

### Fix C: Don't reload goals immediately after creation
After `POST /api/goals` succeeds, **do not** call `loadGoals()` from the create-goal
flow. Just mark the cache as stale and navigate back. The Goals screen's `onAppear`
already calls `loadGoals(forceRefresh: true)` when it becomes visible — doing it twice
causes the loading spinner to flash on screen.

---

## 5. Run Summary — Graphs Tab Always Visible ⚠️ Important

### What changed (Android bug fix — replicate on iOS)
The pace, elevation, and cadence charts were accidentally inside a `heartRateData != nil`
guard block — making the entire Graphs tab blank for any run recorded **without a heart
rate monitor** (phone-only run, no chest strap or HRM).

### iOS fix
Ensure pace/elevation/cadence charts render **unconditionally**. Only the HR-specific
analysis cards (HR zones donut, intensity distribution) should be hidden when
`heartRateData` is nil or empty:

```swift
// ✅ Always show these
PaceChartView(data: run.paceData)
ElevationChartView(data: run.altitudeData)
CadenceChartView(data: run.cadenceData)

// ✅ Only show if HR data exists
if let hrData = run.heartRateData, !hrData.isEmpty {
    HeartRateChartView(data: hrData)
    HeartRateZonesCard(zones: run.hrZones)
    IntensityDistributionCard(run: run)
}
```

Each individual chart should already guard against empty data internally (show a
"No data available" placeholder if the array is empty or nil).

---

## 6. No Neon / Schema Changes Required

All changes are code-only. The Neon database schema is unchanged — no migrations needed.

---

## Summary Checklist

| # | Change | Files |
|---|--------|-------|
| 1 | Watch token auto-refresh (`refresh-watch-token` endpoint) | `GarminManager`, `SceneDelegate`, `AppDelegate` |
| 2 | Update watch app reference to v2.4.7 | Project config |
| 3 | Strava: 1.5s delay + force-fresh fetch + no state wipe on error | `StravaViewModel`, request builder |
| 4 | Goals: explicit success state + no-cache header + no double-reload | `GoalsViewModel` |
| 5 | Graphs tab: pace/elevation/cadence charts unconditional | `RunSummaryView` |
