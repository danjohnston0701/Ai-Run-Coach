# Observer Map — Quick Reference

## What the Observer Map Shows

```
┌─────────────────────────────────────┐
│ Planned Route (gray)                │
│  ────────────────                   │
│         ╱────────╲                  │
│        ╱          ╲                 │
│       ╱  Trail    ╲                 │
│      ╱ (colored)   ╲                │
│ ●●●●●●●●●●●●●●●●● (runner pin)  │
│      ╲              ╱               │
│       ╲            ╱                │
│        ╲──────────╱                 │
│                                     │
│ 👁 3 watching                      │
└─────────────────────────────────────┘
```

**Three layers:**
1. 🟩 **Gray planned route** (for routed runs only)
2. 🟦 **Colored trail** (GPS points from runner)
3. 🔴 **Red runner pin** (live location)

---

## Backend Fields Required

### GET /api/live-sessions/{sessionId}

```json
{
  "gps_track": [
    { "lat": 40.7128, "lng": -74.0060, "timestamp": 1000 },
    { "lat": 40.7129, "lng": -74.0059, "timestamp": 2000 },
    { "lat": 40.7130, "lng": -74.0058, "timestamp": 3000 }
  ],
  "route_polyline": "encoded polyline string...",
  "current_lat": 40.7128,
  "current_lng": -74.0060,
  "observer_count": 2
}
```

**Fields:**
| Field | Type | Always? | Notes |
|-------|------|---------|-------|
| `gps_track` | Array | ✅ Yes | All GPS points so far (accumulates) |
| `route_polyline` | String | ❌ Only if routed | Planned route (Google encoded polyline) |
| `current_lat` | Float | ✅ Yes | Live runner latitude |
| `current_lng` | Float | ✅ Yes | Live runner longitude |

---

## How GPS Track Accumulates

### Runner sends updates
```
PUT /api/live-sessions/sync
{
  "sessionId": "uuid",
  "currentLat": 40.7128,
  "currentLng": -74.0060
}
```

### Backend accumulates
```javascript
// Update 1: gps_track = [{ lat: 40.7128, lng: -74.0060 }]
// Update 2: gps_track = [..., { lat: 40.7129, lng: -74.0059 }]
// Update 3: gps_track = [..., { lat: 40.7130, lng: -74.0058 }]
// ... trail builds up over time
```

### Observer polls every 10s
```swift
GET /api/live-sessions/{sessionId}
// Response includes full gps_track array
// Map re-renders polyline with all points
```

---

## Rendering in iOS

### Free Runs (No Route)
```
// gps_track = [all points]
// route_polyline = nil

mapView.drawPolyline(gps_track, color: .blue) // Colored trail
mapView.drawPin(current_lat, current_lng)     // Runner pin
```

### Routed Runs
```
// gps_track = [all points]
// route_polyline = "encoded polyline"

mapView.drawPolyline(route_polyline, color: .gray)      // Planned route
mapView.drawPolyline(gps_track, color: .blue)           // Actual trail
mapView.drawPin(current_lat, current_lng)               // Runner pin
mapView.fitCamera(to: content)                          // Zoom to fit
```

---

## GPS Track Data Structure

### Single Point
```json
{
  "lat": 40.7128,
  "lng": -74.0060,
  "timestamp": 1723123456789,
  "altitude": 45.2
}
```

### Full Track
```json
[
  { "lat": 40.7100, "lng": -74.0100, "timestamp": 1000 },
  { "lat": 40.7110, "lng": -74.0090, "timestamp": 2000 },
  { "lat": 40.7120, "lng": -74.0080, "timestamp": 3000 },
  ...
]
```

### Typical Sizes
- **5km run at 10m intervals:** ~500 points = 50KB
- **5km run with deduplication:** ~100 points = 10KB
- **10km run:** ~200 points after dedup = 20KB

---

## Route Polyline

### What it is
Google-encoded polyline string representing the planned route.

**Example:**
```
"_p~iF~ps|U_ulLnnqC_mqNvxq`@"
```

### How to decode (iOS)
```swift
// Google Polyline decoder (built into many iOS mapping libraries)
let coordinates = GMSPath(fromEncodedPath: polylineString)?.coordinates()
// or use third-party polyline library
```

### When it appears
**Only for routed runs** — if runner has a pre-planned route (`route_id` set).

**Not present for:**
- Free runs (no route)
- Group runs without a route

---

## Observer Count

### What it is
Real-time count of active observers viewing the session.

### How it works
```swift
// Observer starts viewing:
incrementObserverCount(sessionId)
observer_count = 1

// Another observer joins:
incrementObserverCount(sessionId)
observer_count = 2

// First observer leaves:
decrementObserverCount(sessionId)
observer_count = 1
```

### Display
```swift
// In runner's UI:
if observer_count > 0 {
  showBadge("👁 \(observer_count) watching")
} else {
  hideBadge()
}
```

---

## API Integration Checklist

### Runner Side
- [ ] PUT /api/live-sessions/sync with GPS points
- [ ] Backend accumulates into gps_track
- [ ] Poll GET /api/live-sessions to see observer_count

### Observer Side
- [ ] GET /api/observe/:code to start watching
- [ ] Poll GET /api/live-sessions/{sessionId} every 10s
- [ ] Render map with gps_track + route_polyline + current position

### Backend Provides
- [ ] ✅ GPS accumulation with deduplication
- [ ] ✅ Route polyline lookup (only for routed runs)
- [ ] ✅ Observer count tracking
- [ ] ✅ All in snake_case

---

## Common Scenarios

### Scenario 1: Free Run (No Route)
```
Runner: Starts run without choosing a route
  ↓
Backend: route_id = null, gps_track = []
  ↓
Observer: Sees blue trail + red pin
  ↓
No gray route (because no route_polyline)
```

### Scenario 2: Routed Run
```
Runner: Selects route before running
  ↓
Backend: route_id = "uuid", fetches polyline
  ↓
Observer: Sees gray planned route + blue trail + red pin
  ↓
Map shows expected path vs actual path
```

### Scenario 3: Group Run
```
Runner: Hosts group run with route
  ↓
Multiple observers: Each see same map
  ↓
Each observer's observer_count increments
  ↓
Runner sees "👁 5 watching" badge
```

---

## Polling Strategy

### Recommended (iOS)
```swift
// Start polling when observer opens live session
Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { _ in
  GET /api/live-sessions/{sessionId}
  // Update map with new gps_track points
  // Update observer_count badge (if runner)
}

// Stop polling when closing session
timer.invalidate()
```

### Efficient Updates
```swift
// Only redraw if gps_track changed
if previousTrack.count < newTrack.count {
  let newPoints = newTrack.dropFirst(previousTrack.count)
  mapView.appendToPolyline(newPoints)
  // Don't redraw entire polyline, just append new segment
}
```

---

## Performance Tips

### For Backend
- Deduplication reduces point count by ~80%
- JSONB is indexed, queries are fast
- Route polyline lookup is one query (or cached)

### For iOS
- Use polyline rendering library (MKPolyline)
- Append to existing polyline, don't recreate
- Fit camera only once on first load
- Let user zoom/pan freely after

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Map is blank | gps_track empty | Run just started, wait 10s |
| Gray route not shown | route_id is null | Free run (no route chosen) |
| Gray route wrong | route_polyline stale | Clear cache, re-fetch |
| Trail lags behind | Polling interval slow | Check network, try 5s interval |
| Observer count wrong | Didn't call increment | Increment when observer opens session |
| Map won't zoom to fit | gps_track only 1-2 points | Wait for more data |

---

## Related Docs

- `OBSERVER_MAP_IMPLEMENTATION.md` — Full backend implementation
- `LIVE_RUN_OBSERVER_COMPLETE_SUMMARY.md` — Full feature overview
- Backend API docs — PUT sync, GET session endpoints
