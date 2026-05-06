# Repeated Route Intelligence — Feature Design Brief

**Feature Name**: Route Memory & Repeated Run Intelligence  
**Status**: 🟡 Design / Ready for Implementation  
**Estimated Complexity**: Large (3–4 sprints)  
**Impact**: Very High — transforms live coaching from generic to deeply contextual

---

## 🎯 The Problem

The AI coach currently has **zero memory of a route** a user has run before. Even if Daniel runs Cambridge Parkrun every Saturday morning for 12 weeks in a row, the AI starts each session completely blind — no knowledge of the brutal 150m final hill, no split comparisons, no "you're 20 seconds up on last week" intelligence.

This is the biggest gap between a great running coach and the current experience. A real human coach would know your regular routes intimately.

---

## 💡 The Solution: Route Memory Engine

At run start, the app performs a **multi-signal route recognition check** against the user's run history and (optionally) community data. If a match is found with sufficient confidence, the AI coach receives a full **Route Intelligence Packet** that transforms coaching quality for the entire session.

### What Changes Immediately

| Before | After |
|--------|-------|
| "Great pace, keep it up!" | "You're 23 seconds ahead of your average at this point on Cambridge Parkrun — but the hill is coming in 400m" |
| Generic elevation warning | "That final 150m climb hits at km 4.8. Your average drop here is 45 sec/km — brace for it" |
| No split context | "Km 2 split: 5:12 — 8 seconds faster than last week, 15 seconds faster than your 4-run average" |
| Blind to terrain | Full elevation profile from prior GPS tracks feeds into every coaching cue |

---

## 🧠 Route Recognition: Confidence Scoring Engine

### Core Algorithm

When a run starts (first GPS fix received), the backend runs a **multi-signal confidence score** against the user's historical runs.

```
CONFIDENCE SCORE = weighted sum of signals (0–100%)
```

### Signal Weights

| Signal | Weight | Logic |
|--------|--------|-------|
| **Start GPS proximity** | 40% | Distance from current start to historical run start (within 50m = full score, linear decay to 200m) |
| **Distance match** | 20% | Historical runs within ±5% of intended/expected distance |
| **Day of week** | 15% | Same day of week as ≥2 previous runs from this location |
| **Time of day** | 10% | Within ±20 minutes of historical start times from this location |
| **Run frequency** | 10% | ≥2 runs from this location in the last 9 weeks |
| **Community signal** | 5% | (Phase 2) Other users currently at same GPS location with same historical pattern |

### Confidence Thresholds

| Score | Action | User Message |
|-------|--------|-------------|
| **< 40%** | No route recognition, standard coaching | Silent — no mention |
| **40–59%** | Tentative match — route data loaded but AI hedges | "I think I recognise this route..." |
| **60–79%** | Confident match — full route intelligence active | "Cambridge Parkrun detected! Here's what's ahead..." |
| **80–100%** | Certain match — maximum context, richest coaching | "Your Cambridge Parkrun — let's beat last week's 28:45" |

### Example: Cambridge Parkrun on a Saturday morning

```
Signal breakdown:
  GPS proximity:      50m from known start    → 40/40 pts
  Distance match:     5.0km expected          → 18/20 pts  
  Day of week:        Saturday (4/4 Saturdays)→ 15/15 pts
  Time of day:        08:03 (avg 08:02)       → 10/10 pts
  Run frequency:      4 runs in 9 weeks       → 9/10 pts
  Community signal:   18 other runners nearby → 5/5 pts

TOTAL: 97/100 = 97% confidence ✅
Coach: "Cambridge Parkrun locked in. Your PB is 27:12. 
        4 previous splits loaded. Let's go!"
```

---

## 🗄️ Database Design

### New Table: `known_routes`

Stores a fingerprint of a recognised recurring route. Created automatically once a user has run from the same location 2+ times.

```sql
CREATE TABLE known_routes (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         VARCHAR NOT NULL REFERENCES users(id),
  name            TEXT,                      -- "Cambridge Parkrun", auto-generated or user-labelled
  display_name    TEXT,                      -- User-editable friendly name
  
  -- Location fingerprint
  start_lat       REAL NOT NULL,             -- Centroid of all start points
  start_lng       REAL NOT NULL,
  start_radius_m  REAL DEFAULT 50,           -- Adaptive radius
  
  -- Route characteristics  
  typical_distance_km REAL,                 -- Average distance across runs
  elevation_profile   JSONB,               -- Normalised elevation array [{pct: 0, alt: 45}, {pct:0.1, alt:47}...]
  notable_segments    JSONB,               -- [{name:"final hill", start_pct:0.92, end_pct:1.0, gradient:8.2, warning:"brutal"}]
  terrain_type    TEXT,                     -- "road", "trail", "track", "mixed"
  
  -- Temporal fingerprint
  typical_day_of_week INT[],               -- [6] = Saturday, [1,3] = Mon+Wed
  typical_start_hour  INT,                 -- 8 = 8am
  typical_start_minute INT,               -- 0 = on the hour
  
  -- Run history summary
  run_count       INT DEFAULT 0,
  first_run_at    TIMESTAMP,
  last_run_at     TIMESTAMP,
  constituent_run_ids VARCHAR[],           -- IDs of runs that built this fingerprint
  
  -- All-time stats for this route
  best_time_ms    INT,                     -- Personal best duration
  avg_time_ms     INT,
  avg_pace_sec_per_km REAL,
  
  -- Split profiles (km-by-km averages across all runs on this route)
  split_profiles  JSONB,                   -- [{km:1, avg_sec:312, best_sec:287, worst_sec:340}...]
  
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_known_routes_user_location 
  ON known_routes(user_id, start_lat, start_lng);
```

### Schema Changes to `runs` table

Add a foreign key back to `known_routes` once a run is matched:

```sql
ALTER TABLE runs ADD COLUMN known_route_id VARCHAR REFERENCES known_routes(id);
ALTER TABLE runs ADD COLUMN route_confidence REAL;  -- 0.0–1.0 match confidence at run start
```

---

## 🔌 New API Endpoints

### 1. `POST /api/runs/recognize-route`

Called by the Android app when the first stable GPS fix is obtained at run start (within the first ~30 seconds of a new run). Returns a Route Intelligence Packet.

**Request:**
```json
{
  "latitude": 52.2037,
  "longitude": 0.1276,
  "timestamp": "2026-05-06T08:03:22Z",
  "intendedDistanceKm": 5.0
}
```

**Response (high confidence match):**
```json
{
  "matched": true,
  "confidence": 0.97,
  "confidenceLabel": "certain",
  "knownRoute": {
    "id": "abc123",
    "name": "Cambridge Parkrun",
    "runCount": 4,
    "typicalDistanceKm": 5.0,
    "terrainType": "road",
    "elevationProfile": [...],
    "notableSegments": [
      {
        "name": "Final Hill",
        "startPct": 0.92,
        "endPct": 1.0,
        "gradient": 8.2,
        "severity": "hard",
        "coachingNote": "Your pace typically drops 45 sec/km here — brace from km 4.6"
      }
    ]
  },
  "routeIntelligence": {
    "personalBest": {
      "timeMs": 1632000,
      "formatted": "27:12",
      "date": "2026-04-12"
    },
    "lastRunStats": {
      "timeMs": 1725000,
      "formatted": "28:45",
      "date": "2026-04-26",
      "kmSplits": [
        {"km": 1, "paceSecPerKm": 312, "formatted": "5:12"},
        {"km": 2, "paceSecPerKm": 318, "formatted": "5:18"},
        {"km": 3, "paceSecPerKm": 325, "formatted": "5:25"},
        {"km": 4, "paceSecPerKm": 329, "formatted": "5:29"},
        {"km": 5, "paceSecPerKm": 371, "formatted": "6:11"}
      ]
    },
    "averageSplits": [
      {"km": 1, "avgPaceSecPerKm": 319, "formatted": "5:19"},
      {"km": 2, "avgPaceSecPerKm": 322, "formatted": "5:22"},
      ...
    ],
    "splitCount": 4,
    "preRunBrief": "Cambridge Parkrun, 4 previous runs. PB 27:12. Last week 28:45. The final 400m has an 8% gradient that typically costs you 45 sec/km — save a little for it."
  },
  "confidenceBreakdown": {
    "gpsProximity": {"score": 40, "max": 40, "note": "48m from usual start"},
    "distanceMatch": {"score": 18, "max": 20, "note": "5.0km expected"},
    "dayOfWeek": {"score": 15, "max": 15, "note": "Saturday (4/4 runs)"},
    "timeOfDay": {"score": 10, "max": 10, "note": "08:03, avg 08:02"},
    "runFrequency": {"score": 9, "max": 10, "note": "4 runs in 9 weeks"},
    "communitySignal": {"score": 5, "max": 5, "note": "22 runners at same location"}
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
  "routeIntelligence": null
}
```

---

### 2. `POST /api/runs/update-route-intelligence`

Called when a run completes. Updates (or creates) the `known_routes` fingerprint.

- Extracts `kmSplits`, elevation profile from the GPS track
- Creates a new `known_routes` record if this is the 2nd+ run from this location
- Updates averages, splits, best time if it's an improvement

---

### 3. `GET /api/runs/known-routes`

Returns all known routes for a user — for a "My Routes" screen (future).

---

### 4. `GET /api/runs/known-routes/:id/splits`

Returns full historical split data for a known route — for the split comparison coaching context.

---

## 📱 Android Implementation

### `RunSessionViewModel.kt` Changes

**At run start (first GPS fix):**

```kotlin
// Triggered when first stable GPS fix is obtained in RunTrackingService
private fun checkForKnownRoute(lat: Double, lng: Double) {
    viewModelScope.launch {
        try {
            val response = apiService.recognizeRoute(
                RouteRecognitionRequest(
                    latitude = lat,
                    longitude = lng,
                    timestamp = System.currentTimeMillis(),
                    intendedDistanceKm = currentRunTarget?.distanceKm
                )
            )
            if (response.matched && response.confidence >= 0.40) {
                _knownRouteMatch.value = response
                // Inject route intelligence into the session coaching context
                injectRouteIntelligenceIntoCoaching(response)
            }
        } catch (e: Exception) {
            Log.w("RouteRecognition", "Route recognition failed (non-fatal): ${e.message}")
            // Silently fail — standard coaching continues
        }
    }
}
```

**Route intelligence injected into `SessionCoachingHelper`:**

The `RouteIntelligencePacket` gets passed into the pre-run brief and every live coaching prompt for the rest of the session. Key injections:

1. **Pre-run brief** — includes PB, last run time, notable terrain warnings
2. **Split coaching triggers** — at each km marker, compare current split vs last week + average
3. **Elevation anticipation** — ~400m before a notable segment, warn the user
4. **Final push** — at 90% of route distance, calculate if PB is achievable

### New `StateFlow` in `RunSessionViewModel`:

```kotlin
private val _knownRouteMatch = MutableStateFlow<RouteRecognitionResponse?>(null)
val knownRouteMatch: StateFlow<RouteRecognitionResponse?> = _knownRouteMatch.asStateFlow()

private val _splitComparisons = MutableStateFlow<List<SplitComparison>>(emptyList())
val splitComparisons: StateFlow<List<SplitComparison>> = _splitComparisons.asStateFlow()
```

### `RunSessionScreen.kt` UI Changes

- **Route recognition banner** — shown at top of screen for ~8 seconds when route is detected:
  ```
  ✅ Cambridge Parkrun recognised (97%)
  PB: 27:12 · Last week: 28:45
  ```
- **Live split delta card** — appears after each km marker:
  ```
  KM 2 — 5:14  ▲ 8s faster than last week
                ▲ 5s faster than your average
  ```
- **Upcoming terrain alert** — 400m before notable segment:
  ```
  ⚠️  Final hill in 400m — 8% gradient, 150m
  ```

---

## 🤖 AI Coaching Prompt Enhancements

### Pre-Run Brief (with route intelligence)

The `preRunBrief` field in session instructions gains a new block:

```
ROUTE INTELLIGENCE:
- Known route: Cambridge Parkrun (97% confidence)
- Previous runs: 4 times in the last 9 weeks
- Personal best: 27:12 (April 12)
- Last run: 28:45 (April 26) — 1:33 off PB
- Average finish: 28:21

COURSE PROFILE:
- 5.0km road loop, moderate difficulty
- Notable: Final 400m has 8.2% gradient — user's pace drops avg 45 sec/km here
- Splits tend to drift 12 sec/km slower from km 3 onwards

SPLIT TARGETS (based on PB pace):
- Km 1: 5:26 target (avg 5:19, last week 5:12)
- Km 2: 5:26 target
- Km 3: 5:26 target
- Km 4: 5:26 target (but expect slight slowdown)
- Km 5: allow 6:10 for final hill

COACHING FOCUS:
- Hold back in km 1-2 (user tends to go out too fast)
- Conserve for the final hill — crucial for overall time
- Compare splits openly — user responds well to time comparisons
```

### Live Coaching Cues (AI generates these with route context)

At km split:
> *"Kilometre 2 — 5 minutes 14. That's 8 seconds faster than last week and 5 up on your average. Beautiful. But km 3 is where you tend to drift — hold that 5:20 form."*

400m before final hill:
> *"The big one's coming — that 150m climb in about 400 metres. Shorten your stride NOW, drop your effort to a hard 7, and just grind. You lose 40 seconds here on average. Today, let's make it 30."*

Post-run (if PB):
> *"27 minutes 4 seconds — that's a new Cambridge Parkrun PB. Eight seconds off your previous best. The hill didn't get you this time."*

---

## ⚙️ Backend Service: `route-recognition-service.ts`

New server-side service with the following functions:

```typescript
// Main recognition function — called on run start
async function recognizeRoute(
  userId: string,
  lat: number,
  lng: number,
  timestamp: Date,
  intendedDistanceKm?: number
): Promise<RouteRecognitionResult>

// Score a candidate known_route against current signals
function scoreRouteMatch(
  candidate: KnownRoute,
  lat: number,
  lng: number,
  timestamp: Date,
  intendedDistanceKm?: number
): ConfidenceScore

// Update or create a known_route after a run completes
async function updateKnownRoutes(
  userId: string,
  completedRun: Run
): Promise<void>

// Build elevation profile from GPS track
function buildElevationProfile(
  gpsTrack: GPSPoint[]
): NormalisedElevationProfile

// Detect notable segments (hills, flat sections) from elevation profile
function detectNotableSegments(
  elevationProfile: NormalisedElevationProfile,
  gpsTrack: GPSPoint[]
): NotableSegment[]

// Build split profile averages from constituent run IDs
async function buildSplitProfiles(
  runIds: string[]
): Promise<SplitProfile[]>
```

### Haversine Helper (reuse existing from `osm-segment-intelligence.ts`)

The existing `haversineDistance()` function already in the codebase handles GPS proximity scoring.

---

## 🌍 Community Signal (Phase 2)

This is the "60 other people at the same GPS location" insight mentioned in the brief. Implementation:

1. **Aggregated start clusters** — on run completion, log anonymised start GPS to a `route_clusters` table (no PII, grid-snapped to 50m cells)
2. **Pre-run query** — when recognizing a route, query how many OTHER users have started a run from within 100m of this location in the same time window (day ± 2h) in the last 12 weeks
3. **Community confidence boost** — ≥5 other users = +5 confidence points; used in the `communitySignal` component
4. **Named events** — if ≥20 users cluster at same time/day (parkrun, local race), auto-tag as potential event and surface in coaching: *"Looks like a parkrun — 34 other runners started here last Saturday"*

---

## 🗺️ "My Routes" Screen (Phase 3)

A new screen in the app showing the user's recognised recurring routes:

```
MY ROUTES

  📍 Cambridge Parkrun          ●●●●●  5 runs
     5.0km · Saturday 8am
     PB: 27:12 · Last: 28:45
     [View Splits]  [Route Map]

  📍 Riverside Loop             ●●●  3 runs
     8.2km · Sunday morning
     PB: 44:01 · Last: 45:22
     [View Splits]  [Route Map]
```

Each route card shows:
- Run count, typical day/time
- PB and last run time
- Elevation thumbnail
- Split history sparkline

---

## 🚀 Implementation Plan

### Phase 1 — Route Detection Core (Sprint 1-2)

**Backend:**
- [ ] Create `known_routes` table + migration
- [ ] Add `known_route_id`, `route_confidence` columns to `runs`
- [ ] Build `route-recognition-service.ts`
  - [ ] `recognizeRoute()` with multi-signal confidence scoring
  - [ ] `updateKnownRoutes()` called on run completion
  - [ ] `buildElevationProfile()` from GPS track
  - [ ] `detectNotableSegments()` — hill detection algorithm
  - [ ] `buildSplitProfiles()` — historical split averages
- [ ] Register `POST /api/runs/recognize-route`
- [ ] Register `POST /api/runs/update-route-intelligence` (called internally on run save)
- [ ] Unit tests for confidence scoring algorithm

**Android:**
- [ ] `RouteRecognitionRequest` / `RouteRecognitionResponse` data models
- [ ] `ApiService` — add `recognizeRoute()` endpoint
- [ ] `RunSessionViewModel` — `checkForKnownRoute()` called on first GPS fix
- [ ] `RunTrackingService` — expose first-GPS-fix event to ViewModel
- [ ] Route recognition banner in `RunSessionScreen`
- [ ] `knownRouteMatch` StateFlow + UI observation

### Phase 2 — Live Split Comparisons (Sprint 2-3)

**Backend:**
- [ ] Split comparison logic in `recognizeRoute` response
- [ ] `GET /api/runs/known-routes/:id/splits` endpoint
- [ ] Enrich AI coaching prompts with route intelligence context in `ai-service.ts`
- [ ] Enhance `routes-session-coaching.ts` to accept + inject `RouteIntelligencePacket`

**Android:**
- [ ] `SplitComparison` data model (current vs last week vs average)
- [ ] `_splitComparisons` StateFlow in ViewModel
- [ ] Per-km split delta card in `RunSessionScreen`
- [ ] Upcoming terrain alert widget (400m lookahead)
- [ ] Update pre-run brief fetch to include route intelligence

### Phase 3 — "My Routes" Screen + Community Signal (Sprint 3-4)

- [ ] `route_clusters` table for anonymised community data
- [ ] Community signal query on route recognition
- [ ] `GET /api/runs/known-routes` endpoint
- [ ] `MyRoutesScreen.kt` — new screen
- [ ] Route detail screen with split history + elevation chart
- [ ] Navigation entry point from main nav

---

## 🧪 Testing Scenarios

| Scenario | Expected Behaviour |
|----------|--------------------|
| First run from new location | No recognition (< 40%), standard coaching |
| Second run, same location | Detection triggered, known_route created, tentative match if >60% |
| Cambridge Parkrun, Saturday 8am (4 previous) | 95%+ confidence, full route intelligence in coaching |
| Same location, different day | Confidence reduced ~15 pts, still may match on GPS alone |
| Same location, 2km run vs usual 5km | Distance mismatch drops confidence, likely no match |
| GPS slightly off (50–100m from usual start) | Partial proximity score, may still match if other signals strong |
| API failure during recognition | Graceful fallback to standard coaching — never blocks run start |

---

## ⚠️ Key Design Constraints

1. **Never block a run start** — route recognition is async and non-blocking. If it fails or times out (>3s), standard coaching kicks in silently.
2. **Graceful degradation** — at every confidence threshold, coaching degrades gracefully (less specific, not broken).
3. **Privacy by default** — community signal uses grid-snapped coordinates (50m cells), never exact GPS. Opt-in for community features.
4. **Minimum 2 runs** — a `known_route` is only created after the 2nd run from the same location. One data point is not a pattern.
5. **User control** — users can name, edit, or delete their known routes. They can also disable route recognition globally in settings.

---

## 📋 Data Models (Kotlin)

```kotlin
data class RouteRecognitionRequest(
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long,
    val intendedDistanceKm: Double? = null
)

data class RouteRecognitionResponse(
    val matched: Boolean,
    val confidence: Double,          // 0.0–1.0
    val confidenceLabel: String,     // "none"|"tentative"|"confident"|"certain"
    val knownRoute: KnownRoute?,
    val routeIntelligence: RouteIntelligence?,
    val confidenceBreakdown: ConfidenceBreakdown?
)

data class KnownRoute(
    val id: String,
    val name: String,
    val runCount: Int,
    val typicalDistanceKm: Double,
    val terrainType: String,
    val elevationProfile: List<ElevationPoint>,
    val notableSegments: List<NotableSegment>
)

data class RouteIntelligence(
    val personalBest: SplitTime?,
    val lastRunStats: RunStats?,
    val averageSplits: List<KmSplit>,
    val splitCount: Int,
    val preRunBrief: String           // AI-generated text for coaching injection
)

data class KmSplit(
    val km: Int,
    val paceSecPerKm: Int,
    val formatted: String,
    val deltaVsLastWeekSec: Int?,     // positive = faster
    val deltaVsAverageSec: Int?
)

data class NotableSegment(
    val name: String,
    val startPct: Double,             // 0.0–1.0 position along route
    val endPct: Double,
    val gradient: Double,             // % average gradient
    val severity: String,            // "easy"|"moderate"|"hard"|"brutal"
    val coachingNote: String          // Pre-written coaching hint
)
```

---

## 🔗 Related Files to Modify

| File | Change |
|------|--------|
| `shared/schema.ts` | Add `known_routes` table, add `knownRouteId`/`routeConfidence` to `runs` |
| `server/routes.ts` | Register new route recognition endpoints |
| `server/ai-service.ts` | Inject `RouteIntelligencePacket` into coaching prompts |
| `server/routes-session-coaching.ts` | Accept route intelligence in pre-run brief generation |
| `RunSessionViewModel.kt` | Add `checkForKnownRoute()`, `knownRouteMatch` StateFlow |
| `RunTrackingService.kt` | Expose first-GPS-fix event |
| `RunSessionScreen.kt` | Route recognition banner, split delta card, terrain alert |
| `ApiService.kt` | Add `recognizeRoute()` endpoint |

**New Files:**
| File | Purpose |
|------|---------|
| `server/route-recognition-service.ts` | Core recognition + fingerprinting logic |
| `app/.../model/RouteRecognition.kt` | Kotlin data models |
| `app/.../screens/MyRoutesScreen.kt` | (Phase 3) Known routes list |

---

**Status**: 🟡 Ready for implementation planning  
**Next Step**: Backend — `route-recognition-service.ts` + DB migration  
**Quick Win**: The schema already stores `startLat`, `startLng`, `kmSplits`, `gpsTrack` — all the data needed is already being captured.
