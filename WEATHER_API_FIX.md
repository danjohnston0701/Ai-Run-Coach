# Weather API Fix - Graceful Handling of Missing Location

## Issue

The iOS app was calling `GET /api/weather` **without** `lat` and `lng` query parameters, resulting in:

```
GET /api/weather 400 in 0ms :: {"error":"lat and lng are required"}
```

This happened at the start of runs when the iOS app tried to fetch current weather conditions but hadn't yet determined the user's GPS coordinates.

---

## Root Cause

The `/api/weather` endpoint required `lat` and `lng` parameters and returned a **400 Bad Request** error if they were missing. The iOS app couldn't handle this error gracefully.

**Reasons iOS might not have location:**
1. GPS not yet acquired at run start
2. User granted location permission only "while using the app"
3. Network latency in getting first GPS fix
4. iOS privacy settings preventing immediate location access

---

## Solution Implemented

### **Changed Behavior:**

**Before:**
```
GET /api/weather (no params)
→ 400 error: "lat and lng are required"
→ iOS app error screen
```

**After:**
```
GET /api/weather (no params)
→ 200 OK: returns null weather data
→ iOS app gracefully shows "weather unavailable"

GET /api/weather?lat=X&lng=Y
→ 200 OK: returns actual weather data
```

### **Code Changes** (`server/routes.ts` line 3168-3232)

```typescript
app.get("/api/weather", async (req: Request, res: Response) => {
  try {
    const { lat, lng } = req.query;
    
    // If location not provided, return null values instead of 400 error
    if (!lat || !lng) {
      console.warn(`[GET /api/weather] Called without location parameters`);
      return res.json({
        temp: null,
        feelsLike: null,
        humidity: null,
        windSpeed: null,
        windDirection: null,
        condition: null,
        weatherCode: null,
      });
    }
    
    // Fetch from Open-Meteo API...
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?...`);
    // ... return weather data
    
  } catch (error: any) {
    // Return null weather data on error instead of 500
    res.json({
      temp: null,
      feelsLike: null,
      humidity: null,
      windSpeed: null,
      windDirection: null,
      condition: null,
      weatherCode: null,
    });
  }
});
```

---

## What iOS Should Do

The iOS app should:

1. **Call `/api/weather` early** - even if GPS hasn't locked yet
2. **Handle null weather gracefully** - show "Weather: Loading..." or skip weather display
3. **Retry when GPS is available** - call again with `?lat=X&lng=Y` once location is known
4. **Don't block run start** on weather API failures - weather is nice-to-have, not required

---

## Benefits

✅ **Graceful Degradation** - No more 400 errors, just null weather data  
✅ **Better UX** - App doesn't crash/error on weather unavailability  
✅ **Backwards Compatible** - Still works with params passed: `/api/weather?lat=...&lng=...`  
✅ **Resilient** - Even if Open-Meteo API is down, returns null instead of 500  

---

## Testing

1. **Without location:**
   ```bash
   curl "http://localhost:3000/api/weather"
   # Returns: {"temp":null, "feelsLike":null, "humidity":null, ...}
   # Status: 200 OK
   ```

2. **With location:**
   ```bash
   curl "http://localhost:3000/api/weather?lat=40.7128&lng=-74.0060"
   # Returns: {"temp": 22.5, "feelsLike": 21.0, "humidity": 65, ...}
   # Status: 200 OK
   ```

3. **iOS should test:**
   - [ ] Call `/api/weather` at run start (no location) → should not error
   - [ ] Call again later with location → should get actual weather
   - [ ] Verify weather displays correctly or shows "unavailable" gracefully

---

## Related Endpoints

- `GET /api/weather/current?lat=X&lng=Y` - Requires location, returns weather or 400
- `GET /api/weather/full?lat=X&lng=Y` - Requires location, returns full forecast or 400
- `GET /api/weather` - **NEW BEHAVIOR** - Optional location, returns weather or null

---

## Future Improvements

Consider adding an authenticated endpoint:
```
GET /api/users/:userId/weather
```

This could:
- Get user's current run location (if available from GPS tracking)
- Fall back to user's home location (from profile)
- Fall back to last known location from previous runs
- Return actual weather data instead of null

This would be useful for the iPhone app which loses GPS during pause/resume.

