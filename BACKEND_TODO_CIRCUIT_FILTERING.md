# Backend TODO: Circuit Filtering Implementation

## Quick Summary
The Android app now requests **50 templates** and expects the backend to filter them down to the **top 5 best circuit/loop routes**.

## API Changes Received from Android

### New Request Parameters
```typescript
interface RouteGenerationRequest {
  startLat: number;
  startLng: number;
  distance: number;
  activityType: string;
  avoidHills?: boolean;
  sampleSize: number;      // NEW: default 50
  returnTopN: number;       // NEW: default 5
}
```

### Example Request from Android
```json
{
  "startLat": -37.898367,
  "startLng": 175.484444,
  "distance": 5.0,
  "activityType": "run",
  "avoidHills": false,
  "sampleSize": 50,
  "returnTopN": 5
}
```

## Backend Implementation Steps

### 1. Update Request Interface
Add `sampleSize` and `returnTopN` to your route generation endpoint.

### 2. Modify Template Selection Logic

**Current (BEFORE):**
```typescript
// Select 5 random templates
const templates = selectRandomTemplates(allTemplates, 5);
return templates.map(t => generateRoute(t));
```

**New (AFTER):**
```typescript
// Select 50 random templates
const templates = selectRandomTemplates(allTemplates, req.sampleSize || 50);

// Generate routes for all 50
const allRoutes = templates.map(t => generateRoute(t));

// Assess circuit quality for each
const scoredRoutes = allRoutes.map(route => ({
  route,
  score: calculateCircuitScore(route)
}));

// Sort by score (descending)
scoredRoutes.sort((a, b) => b.score - a.score);

// Apply diversity filter
const diverseRoutes = applyDiversityFilter(scoredRoutes, req.returnTopN || 5);

// Return top N
return diverseRoutes.map(r => r.route);
```

### 3. Implement Circuit Scoring Function

```typescript
function calculateCircuitScore(route: RouteOption): number {
  const backtrackRatio = route.circuitQuality.backtrackRatio;
  const angularSpread = route.circuitQuality.angularSpread;
  const deadEndCount = countDeadEnds(route); // Implement this
  
  // Composite score (0-1, higher is better)
  const score = (
    (1 - backtrackRatio) * 0.4 +           // 40% weight
    (angularSpread / 360) * 0.4 +          // 40% weight  
    (1 - Math.min(deadEndCount * 0.5, 1)) * 0.2  // 20% weight
  );
  
  return score;
}
```

### 4. Implement Dead-End Detection

```typescript
function countDeadEnds(route: RouteOption): number {
  const waypoints = route.waypoints;
  let deadEnds = 0;
  
  // Check if route backtracks on itself
  // A dead-end is a point where the route must turn around
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];
    
    // Calculate angle between prev->curr and curr->next
    const angle = calculateAngle(prev, curr, next);
    
    // If angle is ~180°, it's a turnaround point (dead-end)
    if (Math.abs(angle - 180) < 15) {
      deadEnds++;
    }
  }
  
  return deadEnds;
}
```

### 5. Implement Diversity Filter

```typescript
function applyDiversityFilter(
  scoredRoutes: Array<{route: RouteOption, score: number}>,
  count: number
): Array<{route: RouteOption, score: number}> {
  const selected: Array<{route: RouteOption, score: number}> = [];
  
  for (const candidate of scoredRoutes) {
    if (selected.length >= count) break;
    
    // Check if this route is sufficiently different from already selected
    const isSufficientlyDifferent = selected.every(s => 
      routesDiffer(s.route, candidate.route)
    );
    
    if (isSufficientlyDifferent || selected.length === 0) {
      selected.push(candidate);
    }
  }
  
  return selected;
}

function routesDiffer(route1: RouteOption, route2: RouteOption): boolean {
  // Calculate waypoint overlap
  const overlap = calculateWaypointOverlap(route1.waypoints, route2.waypoints);
  
  // Routes should share less than 40% of waypoints
  return overlap < 0.4;
}
```

## Validation Targets

Routes should meet these criteria:
- ✅ **Backtrack Ratio**: < 0.3 (preferably < 0.2)
- ✅ **Angular Spread**: > 270° (preferably > 300°)
- ✅ **Dead-End Count**: 0 for perfect circuits
- ✅ **Waypoint Overlap**: < 40% between selected routes

## Testing

### Test with curl:
```bash
curl -X POST http://localhost:3000/api/routes/generate-options \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "startLat": -37.898367,
    "startLng": 175.484444,
    "distance": 5.0,
    "activityType": "run",
    "sampleSize": 50,
    "returnTopN": 5
  }'
```

### Verify response:
- Should return exactly 5 routes
- Each route should have good circuit quality metrics
- Routes should be visually diverse (different paths)

## Logging (for debugging)

Add logging to track:
```typescript
console.log(`📊 Sampled ${templates.length} templates`);
console.log(`🎯 Average circuit score: ${avgScore.toFixed(2)}`);
console.log(`✨ Returning top ${selectedRoutes.length} routes`);
console.log(`   Best score: ${selectedRoutes[0].score.toFixed(2)}`);
console.log(`   Worst score: ${selectedRoutes[selectedRoutes.length-1].score.toFixed(2)}`);
```

## Performance Considerations

- Generating 50 routes instead of 5 will take ~10x longer
- Add progress indicators if needed
- Consider caching template assessments
- Optimize route generation algorithm if too slow

## Next Steps

1. ✅ Update request interface with new parameters
2. ✅ Implement circuit scoring function
3. ✅ Implement dead-end detection
4. ✅ Implement diversity filtering
5. ✅ Test with various distances and locations
6. ✅ Verify routes are visibly better than before
7. 🔜 Optional: Pass top 5 through AI for further refinement

---

**Questions?** See `ROUTE_GENERATION_CIRCUIT_FILTERING.md` for detailed algorithm explanations.
