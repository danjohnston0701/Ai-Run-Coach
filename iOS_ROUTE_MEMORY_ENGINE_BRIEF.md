# iOS Implementation Brief: Route Memory Engine

**Feature**: Route Memory Engine — Personalised Recurring Route Intelligence  
**Status**: 🟢 Backend Complete — iOS implementation needed  
**Estimated Time**: 4–6 hours  
**Difficulty**: Medium  

---

## 🎯 Overview

The backend now automatically recognises when a user is running a familiar recurring route and returns a **Route Intelligence Packet** — historical split times, personal bests, elevation profiles, and notable terrain warnings — to supercharge live AI coaching.

**Good news for iOS**: Every time the iOS app saves a completed run, the backend already silently builds up the user's route fingerprint database. No changes needed for that. The iOS work is purely on the **run session screen** side: calling the recognition endpoint at run start, showing a banner, and passing the route context into coaching API calls.

---

## 🔌 Backend API (Already Complete)

### Endpoint 1: Recognise Route at Run Start

```
POST /api/runs/recognize-route
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "latitude": 52.2037,
  "longitude": 0.1276,
  "timestamp": 1746518400000,
  "intendedDistanceKm": 5.0
}
```

**Response (matched route):**
```json
{
  "matched": true,
  "confidence": 0.97,
  "confidenceLabel": "certain",
  "knownRoute": {
    "id": "abc123",
    "name": "Saturday Morning Run",
    "runCount": 4,
    "typicalDistanceKm": 5.0,
    "terrainType": "road",
    "elevationProfile": [
      { "pct": 0.0, "altM": 45 },
      { "pct": 0.1, "altM": 47 }
    ],
    "notableSegments": [
      {
        "name": "Tough Hill",
        "startPct": 0.92,
        "endPct": 1.0,
        "gradient": 8.2,
        "severity": "hard",
        "coachingNote": "150m climb at 8.2% — shorten stride, stay tall."
      }
    ]
  },
  "routeIntelligence": {
    "personalBest": {
      "timeMs": 1632000,
      "formatted": "27:12",
      "date": "last week"
    },
    "lastRunStats": {
      "timeMs": 1725000,
      "formatted": "28:45",
      "date": "7 days ago",
      "kmSplits": [
        { "km": 1, "time": 312, "pace": "5:12" },
        { "km": 2, "time": 318, "pace": "5:18" }
      ]
    },
    "averageSplits": [
      { "km": 1, "avgSecPerKm": 319, "lastRunSecPerKm": 312 },
      { "km": 2, "avgSecPerKm": 322, "lastRunSecPerKm": 318 }
    ],
    "splitCount": 4,
    "preRunBrief": "Saturday Morning Run recognised — 4 previous runs. PB 27:12. Last run: 28:45 (7 days ago)."
  },
  "confidenceBreakdown": {
    "gpsProximity":  { "score": 40, "max": 40, "note": "48m from usual start" },
    "distanceMatch": { "score": 18, "max": 20, "note": "5.0km intended" },
    "dayOfWeek":     { "score": 15, "max": 15, "note": "Saturday (4/4 runs)" },
    "timeOfDay":     { "score": 10, "max": 10, "note": "08:03, typical 08:02" },
    "runFrequency":  { "score": 9,  "max": 10, "note": "4 previous runs" },
    "total": 92
  }
}
```

**Response (no match):**
```json
{
  "matched": false,
  "confidence": 0.18,
  "confidenceLabel": "none",
  "knownRoute": null,
  "routeIntelligence": null,
  "confidenceBreakdown": null
}
```

**Confidence labels:** `"none"` < 40% · `"tentative"` 40–59% · `"confident"` 60–79% · `"certain"` 80%+

---

### Endpoint 2: Get All Known Routes (optional, for future "My Routes" screen)

```
GET /api/runs/known-routes
Authorization: Bearer <token>
```

Returns array of known route objects for the authenticated user.

---

## 📱 iOS Implementation

### Step 1: Data Models

```swift
// MARK: - Request

struct RouteRecognitionRequest: Codable {
    let latitude: Double
    let longitude: Double
    let timestamp: Int64          // epoch milliseconds
    let intendedDistanceKm: Double?
}

// MARK: - Response

struct RouteRecognitionResponse: Codable {
    let matched: Bool
    let confidence: Double           // 0.0–1.0
    let confidenceLabel: String      // "none"|"tentative"|"confident"|"certain"
    let knownRoute: KnownRouteInfo?
    let routeIntelligence: RouteIntelligenceData?
    let confidenceBreakdown: ConfidenceBreakdown?
}

struct KnownRouteInfo: Codable {
    let id: String
    let name: String
    let runCount: Int
    let typicalDistanceKm: Double
    let terrainType: String
    let elevationProfile: [ElevationPoint]
    let notableSegments: [NotableSegment]
}

struct ElevationPoint: Codable {
    let pct: Double      // 0.0–1.0
    let altM: Double
}

struct NotableSegment: Codable {
    let name: String
    let startPct: Double
    let endPct: Double
    let gradient: Double
    let severity: String   // "easy"|"moderate"|"hard"|"brutal"
    let coachingNote: String
}

struct RouteIntelligenceData: Codable {
    let personalBest: RouteTimeRecord?
    let lastRunStats: LastRunStats?
    let averageSplits: [SplitComparison]
    let splitCount: Int
    let preRunBrief: String
}

struct RouteTimeRecord: Codable {
    let timeMs: Int64
    let formatted: String    // "27:12"
    let date: String         // "last week", "April 12"
}

struct LastRunStats: Codable {
    let timeMs: Int64
    let formatted: String
    let date: String
    let kmSplits: [KmSplitHistory]
}

struct KmSplitHistory: Codable {
    let km: Int
    let time: Int         // seconds for this km
    let pace: String      // "mm:ss"
}

struct SplitComparison: Codable {
    let km: Int
    let avgSecPerKm: Int?
    let lastRunSecPerKm: Int?
}

struct ConfidenceBreakdown: Codable {
    let gpsProximity: ConfidenceSignal
    let distanceMatch: ConfidenceSignal
    let dayOfWeek: ConfidenceSignal
    let timeOfDay: ConfidenceSignal
    let runFrequency: ConfidenceSignal
    let total: Int
}

struct ConfidenceSignal: Codable {
    let score: Int
    let max: Int
    let note: String
}

// MARK: - Route Intelligence Context (injected into coaching requests)

struct RouteIntelligenceContext: Codable {
    let routeName: String
    let confidence: Double
    let personalBestFormatted: String?
    let lastRunFormatted: String?
    let lastRunDate: String?
    let splitComparisons: [SplitComparisonContext]?
    let notableSegments: [NotableSegment]?
    let typicalDistanceKm: Double?
}

struct SplitComparisonContext: Codable {
    let km: Int
    let lastRunSecPerKm: Int?
    let avgSecPerKm: Int?
}
```

---

### Step 2: API Call in Network Layer

```swift
func recognizeRoute(
    latitude: Double,
    longitude: Double,
    intendedDistanceKm: Double? = nil
) async throws -> RouteRecognitionResponse {
    let body = RouteRecognitionRequest(
        latitude: latitude,
        longitude: longitude,
        timestamp: Int64(Date().timeIntervalSince1970 * 1000),
        intendedDistanceKm: intendedDistanceKm
    )
    return try await post("/api/runs/recognize-route", body: body)
}
```

---

### Step 3: Call at Run Start (First GPS Fix)

In your run session view model / location manager, call `recognizeRoute` when the **first stable GPS fix** is obtained after a run starts. This should be:
- Called **once per run** only
- **Non-blocking** — run continues regardless of result or failure
- Use `Task { }` so it doesn't block the main thread

```swift
// In your RunSessionViewModel or LocationManager

@Published var knownRouteMatch: RouteRecognitionResponse? = nil
private(set) var routeIntelligenceContext: RouteIntelligenceContext? = nil
var intendedDistanceKm: Double? = nil   // Set before run starts from user's target

private var hasCalledRouteRecognition = false

func onFirstGPSFix(latitude: Double, longitude: Double) {
    guard !hasCalledRouteRecognition else { return }
    hasCalledRouteRecognition = true

    Task {
        do {
            let response = try await apiService.recognizeRoute(
                latitude: latitude,
                longitude: longitude,
                intendedDistanceKm: intendedDistanceKm
            )
            if response.matched {
                await MainActor.run {
                    self.knownRouteMatch = response
                    self.routeIntelligenceContext = buildContext(from: response)
                }
            }
        } catch {
            // Intentionally silent — route recognition failure never affects the run
            print("[RouteMemory] Recognition failed (non-fatal): \(error)")
        }
    }
}

func startRun() {
    // Reset for new run
    knownRouteMatch = nil
    routeIntelligenceContext = nil
    hasCalledRouteRecognition = false
    // ... rest of start run logic
}

private func buildContext(from response: RouteRecognitionResponse) -> RouteIntelligenceContext? {
    guard let route = response.knownRoute,
          let intel = response.routeIntelligence else { return nil }
    return RouteIntelligenceContext(
        routeName: route.name,
        confidence: response.confidence,
        personalBestFormatted: intel.personalBest?.formatted,
        lastRunFormatted: intel.lastRunStats?.formatted,
        lastRunDate: intel.lastRunStats?.date,
        splitComparisons: intel.averageSplits.map {
            SplitComparisonContext(km: $0.km, lastRunSecPerKm: $0.lastRunSecPerKm, avgSecPerKm: $0.avgSecPerKm)
        },
        notableSegments: route.notableSegments,
        typicalDistanceKm: route.typicalDistanceKm
    )
}
```

**Trigger point**: In your CLLocationManager delegate, detect first fix:

```swift
private var isFirstGPSFix = true

func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last, isRunActive else { return }
    if isFirstGPSFix && location.horizontalAccuracy < 50 {
        isFirstGPSFix = false
        viewModel.onFirstGPSFix(latitude: location.coordinate.latitude,
                                 longitude: location.coordinate.longitude)
    }
    // ... rest of GPS handling
}
```

---

### Step 4: Show Route Recognition Banner in Run Screen

Show a banner for ~10 seconds when `knownRouteMatch` is populated and the run is active.

```swift
// In RunSessionView

if let match = viewModel.knownRouteMatch, match.matched, isRunning {
    RouteRecognitionBanner(match: match)
        .transition(.move(edge: .top).combined(with: .opacity))
}
```

```swift
struct RouteRecognitionBanner: View {
    let match: RouteRecognitionResponse

    private var accentColor: Color {
        switch match.confidenceLabel {
        case "certain":   return Color(hex: "00E676")   // green
        case "confident": return Color(hex: "69F0AE")   // light green
        default:          return Color(hex: "FFD740")   // amber
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Text("📍")
                .font(.system(size: 22))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(match.knownRoute?.name ?? "Known Route")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)

                    Text("\(Int(match.confidence * 100))%")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(accentColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(accentColor.opacity(0.2))
                        .cornerRadius(6)
                }

                HStack(spacing: 0) {
                    if let pb = match.routeIntelligence?.personalBest?.formatted {
                        Text("PB \(pb)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color(hex: "69F0AE"))
                    }
                    if match.routeIntelligence?.personalBest != nil,
                       match.routeIntelligence?.lastRunStats != nil {
                        Text("  ·  ")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.4))
                    }
                    if let last = match.routeIntelligence?.lastRunStats {
                        Text("Last: \(last.formatted) (\(last.date))")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.7))
                    }
                }
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            LinearGradient(
                colors: [Color(hex: "1A2340"), Color(hex: "0D1A2E")],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .overlay(
            Rectangle()
                .fill(accentColor)
                .frame(width: 4),
            alignment: .leading
        )
        .cornerRadius(16)
    }
}
```

---

### Step 5: Inject Route Intelligence into Coaching API Calls

This is what makes the split coaching say **"8 seconds faster than last week"**. When building your km-split or pace update coaching request, add the `routeIntelligence` and `lastKmSplitSeconds` fields.

Your existing pace update request body needs two new optional fields:

```swift
// Add to your existing PaceUpdateRequest struct:
struct PaceUpdateRequest: Codable {
    // ... all existing fields ...
    
    // Route Memory Engine (optional — nil if no route match)
    let routeIntelligence: RouteIntelligenceContext?
    let lastKmSplitSeconds: Int?       // seconds taken for the km just completed
}
```

When building the request at each km split:

```swift
func buildPaceUpdateRequest(splitKm: Int, splitSeconds: Int) -> PaceUpdateRequest {
    return PaceUpdateRequest(
        // ... existing fields ...
        routeIntelligence: viewModel.routeIntelligenceContext,
        lastKmSplitSeconds: splitSeconds
    )
}
```

The backend AI coach will automatically use these fields to say things like:
- *"Kilometre 2 — 5 minutes 14. That's 8 seconds faster than last week."*
- *"The big hill is coming in 400 metres — shorten your stride now."*

**No changes to the coaching API endpoint itself** — the backend already handles the new fields.

---

## ✅ Implementation Checklist

- [ ] **Models** — Add all Swift data models from Step 1
- [ ] **Network** — Add `recognizeRoute()` to API client
- [ ] **ViewModel** — `onFirstGPSFix()`, `knownRouteMatch` @Published, `routeIntelligenceContext`, reset on run start
- [ ] **Location trigger** — Call `onFirstGPSFix()` from CLLocationManager on first stable fix
- [ ] **UI banner** — `RouteRecognitionBanner` SwiftUI view shown when `matched == true`
- [ ] **Coaching injection** — Add `routeIntelligence` + `lastKmSplitSeconds` to pace update request
- [ ] **Test** — Run the same route twice, verify `known_routes` is populated, verify banner appears on 3rd run

---

## 🧪 Testing

1. **Run 1** from a new location → no banner (expected, fingerprint being built)
2. **Run 2** same location, same day ± 30 min → no banner (still building, route created in DB)
3. **Run 3** same location, same day ± 30 min → banner appears with PB + last run time
4. **Split coaching** — on km 1 completion, coaching should reference "X seconds vs last run"
5. **Failure test** — kill network after run starts → run should continue normally, no banner shown

---

## ⚠️ Critical Constraints

- **Never block run start** — `recognizeRoute` must be called in a `Task {}` (background). If it times out or fails, the run proceeds with standard coaching.
- **Call once per run** — guard with `hasCalledRouteRecognition` flag, reset on `startRun()`
- **Only call when GPS is stable** — `horizontalAccuracy < 50m` before triggering

---

## 🔗 Reference

- **Android equivalent**: `RunSessionViewModel.kt` → `checkForKnownRoute()` + `RunTrackingService.kt` → `_firstGpsPoint` StateFlow + `RunSessionScreen.kt` → `RouteRecognitionBanner`
- **Backend**: `server/route-recognition-service.ts`
- **API endpoint**: `POST /api/runs/recognize-route`

**Status**: 🟢 Backend complete & tested · iOS implementation needed  
**Estimated time**: 4–6 hours
