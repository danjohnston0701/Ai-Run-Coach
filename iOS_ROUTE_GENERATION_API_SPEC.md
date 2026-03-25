# iOS Route Generation API Specification

## Overview
This document specifies the exact API structure and requirements for iOS to generate running routes. **This is the same endpoint Android is using successfully.**

## Endpoint

**URL**: `/api/routes/generate-options`  
**Method**: `POST`  
**Authentication**: Required (Bearer token in `Authorization` header)  
**Content-Type**: `application/json`

---

## Request Body

```json
{
  "startLat": number,      // Latitude of start location (required)
  "startLng": number,      // Longitude of start location (required)
  "targetDistance": number, // Distance in kilometers (required)
  "userId": string         // User ID (optional, for personalized suggestions)
}
```

### Required Fields:
- **startLat**: Latitude as a decimal number (e.g., `40.7128`)
- **startLng**: Longitude as a decimal number (e.g., `-74.0060`)
- **targetDistance**: Distance in kilometers as a number (e.g., `5`, `10`, `21`)

### Optional Fields:
- **userId**: User's ID for personalized route recommendations (can be null)

---

## Example Request

### iOS Swift Implementation

```swift
let location = CLLocationCoordinate2D(latitude: -37.898386, longitude: 175.484414)
let distanceKm = 5.0

var request = URLRequest(url: URL(string: "https://your-backend-url/api/routes/generate-options")!)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")

let payload: [String: Any] = [
    "startLat": location.latitude,
    "startLng": location.longitude,
    "targetDistance": distanceKm,
    "userId": userId  // or pass null if not available
]

request.httpBody = try JSONSerialization.data(withJSONObject: payload)

URLSession.shared.dataTask(with: request) { data, response, error in
    guard let data = data else { return }
    if let routes = try? JSONDecoder().decode([RouteResponse].self, from: data) {
        // Handle routes
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
curl -X POST https://your-backend-url/api/routes/generate-options \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "startLat": -37.898386,
    "startLng": 175.484414,
    "targetDistance": 5,
    "userId": "user-123"
  }'
```

### Why Android Works & iOS Didn't

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

**Result**: iOS now generates routes successfully, same as Android.

---

## Questions?

Contact the backend team with:
1. HTTP status code received
2. Response body/error message
3. Request coordinates (lat/lng)
4. User ID (if applicable)
5. Replit logs (server-side errors)
