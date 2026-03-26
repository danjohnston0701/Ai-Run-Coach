# iOS Route Generation API Specification

## Overview
This document specifies the exact API structure and requirements for iOS to generate running routes. **This is the same endpoint Android is using successfully.**

## Endpoint

**URL**: `/api/routes/generate-intelligent`  
**Method**: `POST`  
**Authentication**: Required (Bearer token in `Authorization` header)  
**Content-Type**: `application/json`

⚠️ **IMPORTANT**: Use `/api/routes/generate-intelligent` NOT `/api/routes/generate-options`. The intelligent endpoint uses GraphHopper with quality validation that eliminates dead ends and bad routes. The generate-options endpoint uses basic templates and produces lower-quality routes.

---

## Request Body

```json
{
  "latitude": number,      // Latitude of start location (required)
  "longitude": number,     // Longitude of start location (required)
  "distanceKm": number,    // Distance in kilometers (required)
  "preferTrails": boolean, // Prefer scenic trails (optional, default: true)
  "avoidHills": boolean    // Avoid hilly terrain (optional, default: false)
}
```

### Required Fields:
- **latitude**: Latitude as a decimal number (e.g., `40.7128`)
- **longitude**: Longitude as a decimal number (e.g., `-74.0060`)
- **distanceKm**: Distance in kilometers as a number (e.g., `5`, `10`, `21`)

### Optional Fields:
- **preferTrails**: Boolean to prefer scenic trails over roads (default: `true`)
- **avoidHills**: Boolean to avoid hilly terrain (default: `false`)

---

## Example Request

### iOS Swift Implementation

```swift
let location = CLLocationCoordinate2D(latitude: -37.898386, longitude: 175.484414)
let distanceKm = 5.0

var request = URLRequest(url: URL(string: "https://your-backend-url/api/routes/generate-intelligent")!)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")

let payload: [String: Any] = [
    "latitude": location.latitude,
    "longitude": location.longitude,
    "distanceKm": distanceKm,
    "preferTrails": true,    // Request scenic trails
    "avoidHills": false      // Include hilly terrain
]

request.httpBody = try JSONSerialization.data(withJSONObject: payload)

URLSession.shared.dataTask(with: request) { data, response, error in
    guard let data = data else { return }
    if let response = try? JSONDecoder().decode(RouteResponse.self, from: data) {
        // response.routes contains the high-quality routes
        let routes = response.routes
    }
}.resume()
```

---

## Response

### Success Response (HTTP 200)

```json
{
  "routes": [
    {
      "id": "route_1234567890_abc123",
      "polyline": "encoded_polyline_string",
      "coordinates": [[lng, lat], [lng, lat], ...],
      "distance": 5000,           // distance in meters
      "elevationGain": 125,       // elevation gain in meters
      "elevationLoss": 125,       // elevation loss in meters
      "duration": 1800,           // duration in seconds
      "difficulty": "easy",       // "easy", "moderate", or "hard"
      "popularityScore": 0.65,    // 0-1 (NEW: handles iOS users with no history)
      "qualityScore": 0.85,       // 0-1
      "loopQuality": 0.92,        // 0-1
      "backtrackRatio": 0.08,     // 0-1 (lower is better)
      "turnInstructions": [...]
    },
    // Up to 3 routes returned
  ]
}
```

### Error Response (HTTP 400+)

```json
{
  "error": "Failed to generate routes"
}
```

Common error scenarios:
- Invalid coordinates (outside service area)
- Distance too short or too long
- Authentication failed
- GraphHopper API rate limited
- Overpass API rate limited

---

## Key Implementation Notes for iOS

### 1. **Authorization Header Required**
All requests must include a valid authentication token:
```
Authorization: Bearer <auth_token>
```

### 2. **Coordinate Format**
- **Latitude**: -90 to +90 (negative = South, positive = North)
- **Longitude**: -180 to +180 (negative = West, positive = East)
- Example: Auckland, NZ = `-37.898386, 175.484414`

### 3. **Distance Units**
- Always send distance in **kilometers** (not miles)
- Example: `5` = 5 km run

### 4. **Handling New Users (No Run History)**
The backend now gracefully handles iOS users with no previous run data:
- **Before fix**: PostgreSQL error `ANY/ALL (array) requires array on right side`
- **After fix**: Returns default popularity score of `0.5` for new locations
- **Result**: iOS users get the same seamless route generation as Android users

### 5. **Response Coordinates Format**
Routes return coordinates as `[longitude, latitude]` pairs:
```json
"coordinates": [
  [175.48, -37.89],  // [lng, lat]
  [175.49, -37.90],
  ...
]
```
**Note**: This is GeoJSON format where longitude comes first.

### 6. **Polyline Encoding**
The `polyline` field contains an encoded polyline string (Google's polyline algorithm):
- Use a polyline decoder library to convert to coordinates
- Useful for efficient transmission and rendering on maps

### 7. **Difficulty Calculation**
Difficulty is determined by:
- Distance (km)
- Elevation gain (m)
- Formula: `elevation_gain / distance_km` vs thresholds
  - Easy: < 10m/km elevation and < 8km
  - Moderate: < 25m/km elevation and < 15km
  - Hard: anything else

### 8. **Popularity Score**
This score (0-1) indicates how popular a route segment is among runners:
- **Before fix**: Would crash for iOS new users
- **After fix**: Returns `0.5` (neutral) for new locations, real data for established ones
- Used for ranking/filtering route suggestions

---

## Testing the Endpoint

### cURL Example

```bash
curl -X POST https://your-backend-url/api/routes/generate-intelligent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "latitude": -37.898386,
    "longitude": 175.484414,
    "distanceKm": 5,
    "preferTrails": true,
    "avoidHills": false
  }'
```

### Why Route Quality Matters: The Two Generation Systems

The backend has **TWO route generation endpoints** with VERY different quality levels:

#### 1. `/api/routes/generate-options` (❌ POOR - Don't use)
- Uses basic template-based routing
- No validation for dead ends, 180° turns, or backtracking
- Fast but produces low-quality routes (bad circuits, highway segments, poor loops)
- **This is what iOS was originally calling**

#### 2. `/api/routes/generate-intelligent` (✅ EXCELLENT - Use this!)
- Uses GraphHopper API with multi-tier quality validation
- Implements sophisticated route quality checks:
  - ✅ Eliminates dead ends (max 180° turns)
  - ✅ Rejects parallel road out-and-back patterns
  - ✅ Enforces genuine circular loops (> 70% loop quality)
  - ✅ Validates route compactness (eliminates elongated out-and-back)
  - ✅ Ensures angular spread (explores multiple directions)
  - ✅ Limits backtracking to <25%
  - ✅ Avoids highways and major roads (prefers trails/paths)
- Returns 1-3 curated routes with detailed quality metrics
- **This is what Android uses and produces excellent routes**

### Why Original PostgreSQL Error Occurred

**Root Cause**: When a location has no run history, the backend's popularity score query returns NULL instead of an empty array. PostgreSQL's `ANY()` operator requires a proper array type.

**Affected Flow**:
1. iOS user generates route for new location → No historical GPS data in DB
2. `getRoutePopularityScore()` queries for GPS point IDs → Returns NULL
3. Queries database with `WHERE id = ANY(NULL)` → **PostgreSQL Error**

**Solution**: Guard against empty arrays before the query:
```typescript
if (!osmWayIds || osmWayIds.length === 0) {
    return 0.5; // Default score for new locations
}
```

---

## Implementation Checklist for iOS

- [ ] Import `URLSession` or use preferred HTTP library (Alamofire, etc.)
- [ ] Extract user's current location (CLLocationManager)
- [ ] Get selected run distance from UI
- [ ] Format request with latitude, longitude, distance in km
- [ ] Add Bearer token to Authorization header
- [ ] Send POST to `/api/routes/generate-options`
- [ ] Decode JSON response as array of routes
- [ ] Handle errors gracefully (show user-friendly message)
- [ ] Display 1-3 route options on map
- [ ] When user selects route, decode polyline and display turn-by-turn instructions

---

## Understanding Route Quality Metrics

Each returned route includes quality metrics so iOS can display them to users:

```json
{
  "id": "route_...",
  "polyline": "encoded_polyline",
  "distance": 5000,              // meters
  "elevationGain": 125,          // meters
  "difficulty": "easy",          // easy | moderate | hard
  "popularityScore": 0.65,       // 0-1: How popular with runners
  "qualityScore": 0.85,          // 0-1: Overall route quality
  "loopQuality": 0.92,           // 0-1: How well it forms a loop
  "backtrackRatio": 0.08         // 0-1: % of repeated segments (lower is better)
}
```

**Quality Thresholds Used by Intelligent Generator**:
- **Loop Quality** ≥ 0.7 (strict) or 0.4 (loose fallback)
- **Backtrack Ratio** ≤ 0.25 (strict) or 0.40 (loose fallback)
- **Proximity Overlap** ≤ 0.25 (strict) or 0.40 (loose fallback)
- **Compactness** ≥ 0.15 (prevents elongated routes)
- **Angular Spread** ≥ 0.25 (ensures routes explore multiple directions)

## Implementation Checklist for iOS

✅ Must use `/api/routes/generate-intelligent` endpoint (NOT `/api/routes/generate-options`)
✅ Send request with: `latitude`, `longitude`, `distanceKm`, `preferTrails`, `avoidHills`
✅ Handle response with routes array containing quality metrics
✅ Display 1-3 high-quality route options to user
✅ Show quality indicators (loop quality, difficulty) to help user choose
✅ Decode polyline for map display
✅ Use coordinates array for turn-by-turn navigation

## Backend Changes Made

**File**: `server/osm-segment-intelligence.ts`  
**Function**: `getRoutePopularityScore()`  
**Change**: Added guard clause for empty GPS point arrays

```typescript
// Guard against empty array: if no GPS points exist (new user), return default score
if (osmWayIds.length === 0) {
  return 0.5; // Default popularity score for routes with no data yet
}
```

**Result**: iOS can now call the intelligent route generation endpoint and get the same high-quality routes as Android.

---

## Troubleshooting

**Problem**: Still getting low-quality routes
- ✅ Verify you're calling `/api/routes/generate-intelligent`
- ✅ Check that `latitude`, `longitude`, `distanceKm` are being sent correctly
- ✅ Ensure auth token is valid (check 401 responses)

**Problem**: Getting "No routes found" (422 error)
- This area has no suitable routes (too remote, no connected paths)
- Try a different location or slightly different distance

**Problem**: Timeout or slow response
- Intelligent generation typically takes 10-30 seconds
- GraphHopper and Overpass APIs are making multiple queries
- Set appropriate timeout in your HTTP client (30+ seconds recommended)

## Questions?

Contact the backend team with:
1. HTTP status code received
2. Response body/error message
3. Request coordinates (lat/lng) and distance (km)
4. Check Replit logs for server-side errors
5. Verify you're using the correct endpoint: `/api/routes/generate-intelligent`
