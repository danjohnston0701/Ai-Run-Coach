import OpenAI from "openai";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Place types that are good for running routes
const RUNNING_PLACE_TYPES = ['park', 'natural_feature', 'campground', 'stadium', 'tourist_attraction'];

interface NearbyPlace {
  lat: number;
  lng: number;
  name: string;
  type: string;
}

// Find nearby parks, trails, and natural areas using Google Places API
async function findNearbyTrailAnchors(lat: number, lng: number, radiusKm: number): Promise<NearbyPlace[]> {
  if (!GOOGLE_MAPS_API_KEY) return [];
  
  const places: NearbyPlace[] = [];
  const radiusMeters = Math.min(radiusKm * 1000, 50000); // Max 50km radius
  
  try {
    // Search for parks and natural features
    for (const placeType of RUNNING_PLACE_TYPES) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=${placeType}&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results) {
        for (const result of data.results.slice(0, 5)) { // Top 5 per type
          places.push({
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            name: result.name,
            type: placeType
          });
        }
      }
    }
    
    // Also search for "walking trail" and "river walk" by keyword
    const keywordSearches = ['walking trail', 'river walk', 'nature reserve', 'domain'];
    for (const keyword of keywordSearches) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results) {
        for (const result of data.results.slice(0, 3)) {
          places.push({
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            name: result.name,
            type: keyword
          });
        }
      }
    }
    
    console.log(`[Route Gen] Found ${places.length} nearby trail anchors`);
    return places;
  } catch (error) {
    console.error('[Route Gen] Error fetching nearby places:', error);
    return [];
  }
}

interface AIWaypointSuggestion {
  waypoints: Array<{ lat: number; lng: number; reason: string }>;
  routeName: string;
  description: string;
}

// Validate that coordinates are valid numbers within reasonable bounds
function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' && 
    typeof lng === 'number' && 
    !isNaN(lat) && 
    !isNaN(lng) && 
    lat >= -90 && lat <= 90 && 
    lng >= -180 && lng <= 180
  );
}

// Validate AI waypoints are within reasonable distance from start
function validateAIWaypoints(
  waypoints: Array<{ lat: number; lng: number; reason: string }>,
  startLat: number,
  startLng: number,
  maxDistanceKm: number
): Array<{ lat: number; lng: number; reason: string }> {
  return waypoints.filter(wp => {
    if (!isValidCoordinate(wp.lat, wp.lng)) {
      console.log(`[Route Gen] Invalid AI waypoint coords: ${wp.lat}, ${wp.lng}`);
      return false;
    }
    const dist = getDistanceKm({ lat: startLat, lng: startLng }, { lat: wp.lat, lng: wp.lng });
    if (dist > maxDistanceKm) {
      console.log(`[Route Gen] AI waypoint too far: ${dist.toFixed(2)}km from start`);
      return false;
    }
    return true;
  });
}

// Use OpenAI to intelligently design waypoints based on local geography
async function designWaypointsWithAI(
  startLat: number,
  startLng: number,
  targetDistance: number,
  nearbyPlaces: NearbyPlace[]
): Promise<AIWaypointSuggestion[]> {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[Route Gen] No OpenAI API key, skipping AI waypoint design');
    return [];
  }

  // Build context about the area
  const placeDescriptions = nearbyPlaces.slice(0, 20).map(p => 
    `- ${p.name} (${p.type}) at ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
  ).join('\n');

  const baseRadius = targetDistance / 4; // Approximate radius for loop

  const prompt = `You are a running route designer. Design 3 diverse running loop routes.

START LOCATION: ${startLat.toFixed(6)}, ${startLng.toFixed(6)}
TARGET DISTANCE: ${targetDistance}km
APPROXIMATE LOOP RADIUS: ${baseRadius.toFixed(2)}km (waypoints should be within ${(baseRadius * 2).toFixed(2)}km of start)

NEARBY POINTS OF INTEREST:
${placeDescriptions || 'No specific landmarks found'}

GEOGRAPHIC CONTEXT:
- Consider rivers, streams, and waterways as scenic route elements
- Rural/farmland roads can offer quiet, scenic running with open views
- Look for connecting paths between parks and natural areas
- Residential streets can connect trail segments

DESIGN RULES:
1. Each route must be a LOOP that returns to the start point
2. Prioritize trails, parks, river walks, and domains as waypoints when available
3. Include scenic areas like rivers, farmland, and nature reserves for variety
4. Create 3 DIFFERENT routes going in different directions (e.g., north loop, riverside loop, park circuit)
5. Use 3-5 waypoints per route to create genuine loops (not out-and-back)
6. Place waypoints at actual landmarks or logical turning points
7. Spread waypoints around the start point to create a circuit shape
8. ALL waypoint coordinates must be NUMERIC and within ${(baseRadius * 2).toFixed(2)}km of start

Return ONLY valid JSON in this exact format:
{
  "routes": [
    {
      "routeName": "Descriptive Name",
      "description": "Brief description of the route character",
      "waypoints": [
        {"lat": 0.000000, "lng": 0.000000, "reason": "Why this waypoint"}
      ]
    }
  ]
}`;

  try {
    console.log('[Route Gen] Asking OpenAI to design intelligent waypoints...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a running route designer. Return only valid JSON, no markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[Route Gen] No response from OpenAI');
      return [];
    }

    // Parse JSON response
    const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanedContent);

    if (!parsed.routes || !Array.isArray(parsed.routes)) {
      console.log('[Route Gen] Invalid OpenAI response format');
      return [];
    }

    const maxWaypointDistance = targetDistance; // Waypoints shouldn't be further than target distance
    
    const suggestions: AIWaypointSuggestion[] = (parsed.routes as any[])
      .map((route) => {
        const rawWaypoints = (route.waypoints || []).map((wp: any) => ({
          lat: parseFloat(wp.lat),
          lng: parseFloat(wp.lng),
          reason: wp.reason || ''
        }));
        
        // Validate and filter waypoints
        const validWaypoints = validateAIWaypoints(rawWaypoints, startLat, startLng, maxWaypointDistance);
        
        return {
          routeName: route.routeName || 'AI Route',
          description: route.description || '',
          waypoints: validWaypoints
        };
      })
      .filter(suggestion => suggestion.waypoints.length >= 2); // Need at least 2 valid waypoints

    console.log(`[Route Gen] OpenAI designed ${suggestions.length} valid route suggestions`);
    return suggestions;

  } catch (error) {
    console.error('[Route Gen] OpenAI waypoint design error:', error);
    return [];
  }
}

interface RouteRequest {
  startLat: number;
  startLng: number;
  targetDistance: number;
  difficulty?: "easy" | "moderate" | "hard";
}

interface TurnInstruction {
  instruction: string;
  maneuver: string;
  distance: number;
  duration: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  cumulativeDistance: number;
}

interface RouteCandidate {
  id: string;
  waypoints: Array<{ lat: number; lng: number }>;
  actualDistance: number;
  duration: number;
  polyline: string;
  routeName: string;
  difficulty: "easy" | "moderate" | "hard";
  difficultyScore: number;
  hasMajorRoads: boolean;
  uniquenessScore: number;
  deadEndCount: number;
  turnInstructions?: TurnInstruction[];
  elevation?: {
    gain: number;
    loss: number;
    maxElevation: number;
    minElevation: number;
    maxInclinePercent?: number;
    maxInclineDegrees?: number;
    maxDeclinePercent?: number;
    maxDeclineDegrees?: number;
    profile?: ElevationPoint[];
  };
  aiReasoning?: string;
}

interface MultiRouteResult {
  success: boolean;
  routes: RouteCandidate[];
  error?: string;
}

interface DirectionsResult {
  distance: number;
  duration: number;
  polyline: string;
  success: boolean;
  instructions: string[];
  turnInstructions: TurnInstruction[];
  error?: string;
}

// Helper functions
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

function projectPoint(lat: number, lng: number, bearingDegrees: number, distanceKm: number): { lat: number; lng: number } {
  const R = 6371;
  const lat1 = toRadians(lat);
  const lng1 = toRadians(lng);
  const bearing = toRadians(bearingDegrees);
  const d = distanceKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return { lat: toDegrees(lat2), lng: toDegrees(lng2) };
}

function getDistanceKm(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371;
  const lat1 = toRadians(p1.lat);
  const lat2 = toRadians(p2.lat);
  const dLat = toRadians(p2.lat - p1.lat);
  const dLng = toRadians(p2.lng - p1.lng);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
}

// Decode Google polyline
function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

// Get route footprint (diagonal span)
function getRouteFootprint(polyline: string): number {
  const points = decodePolyline(polyline);
  if (points.length < 2) return 0;
  
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  
  return getDistanceKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });
}

// Calculate route segment hash for deduplication
function getRouteSegments(polyline: string): Set<string> {
  const points = decodePolyline(polyline);
  const segments = new Set<string>();
  const gridSize = 0.0005; // ~50m grid
  
  for (let i = 0; i < points.length - 1; i++) {
    const g1 = `${Math.round(points[i].lat / gridSize)},${Math.round(points[i].lng / gridSize)}`;
    const g2 = `${Math.round(points[i+1].lat / gridSize)},${Math.round(points[i+1].lng / gridSize)}`;
    if (g1 !== g2) {
      segments.add([g1, g2].sort().join("->"));
    }
  }
  
  return segments;
}

// Calculate overlap between two routes (0-1)
function calculateRouteOverlap(polyline1: string, polyline2: string): number {
  const seg1 = getRouteSegments(polyline1);
  const seg2 = getRouteSegments(polyline2);
  
  if (seg1.size === 0 || seg2.size === 0) return 0;
  
  let overlap = 0;
  Array.from(seg1).forEach(s => {
    if (seg2.has(s)) overlap++;
  });
  
  return overlap / Math.min(seg1.size, seg2.size);
}

// Detect backtracking - returns percentage of route that doubles back on itself (0-1)
// Excludes first/last 300m to allow legitimate shared access streets
function calculateBacktrackRatio(polyline: string): number {
  const points = decodePolyline(polyline);
  if (points.length < 10) return 0;
  
  // Calculate cumulative distances to find 300m cutoffs
  const distances: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i-1] + getDistanceKm(points[i-1], points[i]));
  }
  const totalDistance = distances[distances.length - 1];
  const excludeDistance = 0.3; // 300m in km
  
  // Find start/end indices to exclude (skip first and last 300m)
  let startIdx = 0;
  let endIdx = points.length - 1;
  for (let i = 0; i < distances.length; i++) {
    if (distances[i] >= excludeDistance) {
      startIdx = i;
      break;
    }
  }
  for (let i = distances.length - 1; i >= 0; i--) {
    if (totalDistance - distances[i] >= excludeDistance) {
      endIdx = i;
      break;
    }
  }
  
  // If route too short to have middle section, analyze full route
  if (endIdx <= startIdx + 5) {
    startIdx = 0;
    endIdx = points.length - 1;
  }
  
  const gridSize = 0.0003; // ~30m grid for finer detection
  const directedSegments: string[] = [];
  
  // Create directed segments only for middle portion
  for (let i = startIdx; i < endIdx; i++) {
    const g1 = `${Math.round(points[i].lat / gridSize)},${Math.round(points[i].lng / gridSize)}`;
    const g2 = `${Math.round(points[i+1].lat / gridSize)},${Math.round(points[i+1].lng / gridSize)}`;
    if (g1 !== g2) {
      directedSegments.push(`${g1}->${g2}`);
    }
  }
  
  if (directedSegments.length === 0) return 0;
  
  // Count how many segments have their reverse also in the route
  const segmentSet = new Set(directedSegments);
  let backtrackCount = 0;
  
  for (let i = 0; i < directedSegments.length; i++) {
    const seg = directedSegments[i];
    const parts = seg.split('->');
    const reverse = `${parts[1]}->${parts[0]}`;
    
    if (segmentSet.has(reverse)) {
      backtrackCount++;
    }
  }
  
  // Return ratio of backtracked segments
  return backtrackCount / directedSegments.length;
}

// Check if route has acceptable loop quality (low backtracking)
function isGoodLoop(polyline: string, maxBacktrackRatio: number = 0.25): boolean {
  const backtrackRatio = calculateBacktrackRatio(polyline);
  return backtrackRatio <= maxBacktrackRatio;
}

// Calculate angular spread of route from start point - returns degrees covered (0-360)
// A true circuit should cover at least 240 degrees around the start point
function calculateAngularSpread(polyline: string, startLat: number, startLng: number): number {
  const points = decodePolyline(polyline);
  if (points.length < 5) return 0;
  
  // Calculate bearing from start to each point
  const bearings: number[] = [];
  for (const point of points) {
    const dLat = point.lat - startLat;
    const dLng = point.lng - startLng;
    if (Math.abs(dLat) < 0.0001 && Math.abs(dLng) < 0.0001) continue; // Skip points at start
    
    const bearing = Math.atan2(dLng, dLat) * 180 / Math.PI;
    const normalizedBearing = ((bearing % 360) + 360) % 360;
    bearings.push(normalizedBearing);
  }
  
  if (bearings.length < 3) return 0;
  
  // Find the angular span by looking at unique 30-degree sectors covered
  const sectors = new Set<number>();
  for (const bearing of bearings) {
    sectors.add(Math.floor(bearing / 30));
  }
  
  // Each sector is 30 degrees, so multiply by 30
  return sectors.size * 30;
}

// Check if route is a genuine circuit (good angular coverage, low backtracking)
function isGenuineCircuit(polyline: string, startLat: number, startLng: number): { valid: boolean; backtrackRatio: number; angularSpread: number } {
  const backtrackRatio = calculateBacktrackRatio(polyline);
  const angularSpread = calculateAngularSpread(polyline, startLat, startLng);
  
  // Require at least 180 degrees coverage and max 35% backtracking for a valid circuit
  const valid = angularSpread >= 180 && backtrackRatio <= 0.35;
  
  return { valid, backtrackRatio, angularSpread };
}

// Check for major roads
const MAJOR_ROAD_KEYWORDS = ['highway', 'hwy', 'motorway', 'expressway', 'freeway', 'interstate', 'turnpike'];

function containsMajorRoads(instructions: string[]): boolean {
  for (const instruction of instructions) {
    const lower = instruction.toLowerCase();
    for (const keyword of MAJOR_ROAD_KEYWORDS) {
      if (lower.includes(keyword)) return true;
    }
  }
  return false;
}

// Fetch route from Google Directions API
async function fetchRoute(
  origin: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }>,
  optimize: boolean = false
): Promise<DirectionsResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], turnInstructions: [], error: "No API key" };
  }

  const waypointsStr = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join("|");
  const optimizeParam = optimize ? "optimize:true|" : "";
  
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=${optimizeParam}${waypointsStr}&mode=walking&avoid=highways&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.routes[0]) {
      return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], turnInstructions: [], error: data.status };
    }

    const route = data.routes[0];
    let totalDistance = 0;
    let totalDuration = 0;
    let cumulativeDistance = 0;
    const allInstructions: string[] = [];
    const turnInstructions: TurnInstruction[] = [];

    for (const leg of route.legs) {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;
      for (const step of leg.steps) {
        if (step.html_instructions) {
          const cleanInstruction = step.html_instructions.replace(/<[^>]*>/g, '');
          allInstructions.push(cleanInstruction);
          
          const turnInstruction: TurnInstruction = {
            instruction: cleanInstruction,
            maneuver: step.maneuver || 'straight',
            distance: step.distance?.value || 0,
            duration: step.duration?.value || 0,
            startLat: step.start_location?.lat || 0,
            startLng: step.start_location?.lng || 0,
            endLat: step.end_location?.lat || 0,
            endLng: step.end_location?.lng || 0,
            cumulativeDistance: cumulativeDistance,
          };
          turnInstructions.push(turnInstruction);
          cumulativeDistance += step.distance?.value || 0;
        }
      }
    }

    return {
      distance: totalDistance / 1000,
      duration: Math.round(totalDuration / 60),
      polyline: route.overview_polyline.points,
      success: true,
      instructions: allInstructions,
      turnInstructions,
    };
  } catch (error) {
    console.error("Directions fetch error:", error);
    return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], turnInstructions: [], error: "Fetch failed" };
  }
}

// Generate diverse route templates
// Each template creates waypoints in a fundamentally different pattern
function generateRouteTemplates(
  startLat: number,
  startLng: number,
  targetDistance: number
): Array<{ name: string; waypoints: Array<{ lat: number; lng: number }>; optimize: boolean }> {
  
  // Base radius for target distance - use larger multiplier for genuine circuit loops
  // Previously: targetDistance / (2 * Math.PI) = ~1.6km for 10km (too small, creates linear routes)
  // Now: targetDistance / 2.0 = 5km for 10km (creates much bigger geographic footprint for variety)
  const baseRadius = targetDistance / 2.0;
  
  const templates: Array<{ name: string; waypoints: Array<{ lat: number; lng: number }>; optimize: boolean }> = [];
  
  // Template 1: North loop (goes primarily north)
  templates.push({
    name: "North Loop",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 330, baseRadius * 1.2),
      projectPoint(startLat, startLng, 30, baseRadius * 1.4),
      projectPoint(startLat, startLng, 90, baseRadius * 0.8),
    ]
  });
  
  // Template 2: South loop (goes primarily south)
  templates.push({
    name: "South Loop",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 150, baseRadius * 1.2),
      projectPoint(startLat, startLng, 210, baseRadius * 1.4),
      projectPoint(startLat, startLng, 270, baseRadius * 0.8),
    ]
  });
  
  // Template 3: East loop
  templates.push({
    name: "East Loop",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 45, baseRadius * 1.3),
      projectPoint(startLat, startLng, 90, baseRadius * 1.5),
      projectPoint(startLat, startLng, 135, baseRadius * 1.3),
    ]
  });
  
  // Template 4: West loop
  templates.push({
    name: "West Loop",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 225, baseRadius * 1.3),
      projectPoint(startLat, startLng, 270, baseRadius * 1.5),
      projectPoint(startLat, startLng, 315, baseRadius * 1.3),
    ]
  });
  
  // Template 5: Large clockwise square
  templates.push({
    name: "Clockwise Square",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.4),
      projectPoint(startLat, startLng, 90, baseRadius * 1.4),
      projectPoint(startLat, startLng, 180, baseRadius * 1.4),
      projectPoint(startLat, startLng, 270, baseRadius * 1.4),
    ]
  });
  
  // Template 6: Counter-clockwise square (different order)
  templates.push({
    name: "Counter-clockwise Square",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 270, baseRadius * 1.4),
      projectPoint(startLat, startLng, 180, baseRadius * 1.4),
      projectPoint(startLat, startLng, 90, baseRadius * 1.4),
      projectPoint(startLat, startLng, 0, baseRadius * 1.4),
    ]
  });
  
  // Template 7: Northeast-Southwest diagonal
  templates.push({
    name: "NE-SW Diagonal",
    optimize: true,
    waypoints: [
      projectPoint(startLat, startLng, 45, baseRadius * 1.8),
      projectPoint(startLat, startLng, 225, baseRadius * 1.8),
    ]
  });
  
  // Template 8: Northwest-Southeast diagonal
  templates.push({
    name: "NW-SE Diagonal",
    optimize: true,
    waypoints: [
      projectPoint(startLat, startLng, 315, baseRadius * 1.8),
      projectPoint(startLat, startLng, 135, baseRadius * 1.8),
    ]
  });
  
  // Template 9: Large pentagon
  templates.push({
    name: "Pentagon",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.3),
      projectPoint(startLat, startLng, 72, baseRadius * 1.3),
      projectPoint(startLat, startLng, 144, baseRadius * 1.3),
      projectPoint(startLat, startLng, 216, baseRadius * 1.3),
      projectPoint(startLat, startLng, 288, baseRadius * 1.3),
    ]
  });
  
  // Template 10: Figure-8 north-south
  templates.push({
    name: "Figure-8 NS",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.0),
      projectPoint(startLat, startLng, 45, baseRadius * 0.7),
      projectPoint(startLat, startLng, 180, baseRadius * 1.0),
      projectPoint(startLat, startLng, 225, baseRadius * 0.7),
    ]
  });
  
  // Template 11: Figure-8 east-west
  templates.push({
    name: "Figure-8 EW",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 90, baseRadius * 1.0),
      projectPoint(startLat, startLng, 135, baseRadius * 0.7),
      projectPoint(startLat, startLng, 270, baseRadius * 1.0),
      projectPoint(startLat, startLng, 315, baseRadius * 0.7),
    ]
  });
  
  // Template 12: Extended north reach
  templates.push({
    name: "North Reach",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 350, baseRadius * 2.0),
      projectPoint(startLat, startLng, 10, baseRadius * 2.0),
      projectPoint(startLat, startLng, 90, baseRadius * 0.5),
    ]
  });
  
  // Template 13: Extended south reach
  templates.push({
    name: "South Reach",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 170, baseRadius * 2.0),
      projectPoint(startLat, startLng, 190, baseRadius * 2.0),
      projectPoint(startLat, startLng, 270, baseRadius * 0.5),
    ]
  });
  
  // Template 14: Hexagon
  templates.push({
    name: "Hexagon",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.2),
      projectPoint(startLat, startLng, 60, baseRadius * 1.2),
      projectPoint(startLat, startLng, 120, baseRadius * 1.2),
      projectPoint(startLat, startLng, 180, baseRadius * 1.2),
      projectPoint(startLat, startLng, 240, baseRadius * 1.2),
      projectPoint(startLat, startLng, 300, baseRadius * 1.2),
    ]
  });
  
  // Template 15: Asymmetric east-heavy
  templates.push({
    name: "East Heavy",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 30, baseRadius * 0.8),
      projectPoint(startLat, startLng, 90, baseRadius * 1.8),
      projectPoint(startLat, startLng, 150, baseRadius * 0.8),
    ]
  });
  
  // Template 16: Asymmetric west-heavy
  templates.push({
    name: "West Heavy",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 210, baseRadius * 0.8),
      projectPoint(startLat, startLng, 270, baseRadius * 1.8),
      projectPoint(startLat, startLng, 330, baseRadius * 0.8),
    ]
  });
  
  // Template 17: Triangle north
  templates.push({
    name: "Triangle North",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.6),
      projectPoint(startLat, startLng, 120, baseRadius * 1.0),
      projectPoint(startLat, startLng, 240, baseRadius * 1.0),
    ]
  });
  
  // Template 18: Triangle south
  templates.push({
    name: "Triangle South",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 180, baseRadius * 1.6),
      projectPoint(startLat, startLng, 300, baseRadius * 1.0),
      projectPoint(startLat, startLng, 60, baseRadius * 1.0),
    ]
  });
  
  // Template 19: Octagon - 8 waypoints for guaranteed circuit loop
  templates.push({
    name: "Octagon Circuit",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.0),
      projectPoint(startLat, startLng, 45, baseRadius * 1.0),
      projectPoint(startLat, startLng, 90, baseRadius * 1.0),
      projectPoint(startLat, startLng, 135, baseRadius * 1.0),
      projectPoint(startLat, startLng, 180, baseRadius * 1.0),
      projectPoint(startLat, startLng, 225, baseRadius * 1.0),
      projectPoint(startLat, startLng, 270, baseRadius * 1.0),
      projectPoint(startLat, startLng, 315, baseRadius * 1.0),
    ]
  });
  
  // Template 20: Large octagon - more spread out
  templates.push({
    name: "Large Octagon",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.4),
      projectPoint(startLat, startLng, 45, baseRadius * 1.4),
      projectPoint(startLat, startLng, 90, baseRadius * 1.4),
      projectPoint(startLat, startLng, 135, baseRadius * 1.4),
      projectPoint(startLat, startLng, 180, baseRadius * 1.4),
      projectPoint(startLat, startLng, 225, baseRadius * 1.4),
      projectPoint(startLat, startLng, 270, baseRadius * 1.4),
      projectPoint(startLat, startLng, 315, baseRadius * 1.4),
    ]
  });
  
  // Template 21: Wide north-south circuit with 6 points
  templates.push({
    name: "North-South Circuit",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 350, baseRadius * 1.3),
      projectPoint(startLat, startLng, 30, baseRadius * 1.0),
      projectPoint(startLat, startLng, 90, baseRadius * 0.8),
      projectPoint(startLat, startLng, 170, baseRadius * 1.3),
      projectPoint(startLat, startLng, 210, baseRadius * 1.0),
      projectPoint(startLat, startLng, 270, baseRadius * 0.8),
    ]
  });
  
  // Template 22: Wide east-west circuit with 6 points
  templates.push({
    name: "East-West Circuit",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 80, baseRadius * 1.3),
      projectPoint(startLat, startLng, 120, baseRadius * 1.0),
      projectPoint(startLat, startLng, 180, baseRadius * 0.8),
      projectPoint(startLat, startLng, 260, baseRadius * 1.3),
      projectPoint(startLat, startLng, 300, baseRadius * 1.0),
      projectPoint(startLat, startLng, 0, baseRadius * 0.8),
    ]
  });
  
  // Template 23: Cloverleaf pattern - forces roads in all directions
  templates.push({
    name: "Cloverleaf",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.5),
      projectPoint(startLat, startLng, 45, baseRadius * 0.6),
      projectPoint(startLat, startLng, 90, baseRadius * 1.5),
      projectPoint(startLat, startLng, 135, baseRadius * 0.6),
      projectPoint(startLat, startLng, 180, baseRadius * 1.5),
      projectPoint(startLat, startLng, 225, baseRadius * 0.6),
      projectPoint(startLat, startLng, 270, baseRadius * 1.5),
      projectPoint(startLat, startLng, 315, baseRadius * 0.6),
    ]
  });
  
  // Template 24: Diamond with extended corners
  templates.push({
    name: "Diamond Extended",
    optimize: false,
    waypoints: [
      projectPoint(startLat, startLng, 0, baseRadius * 1.8),
      projectPoint(startLat, startLng, 45, baseRadius * 0.9),
      projectPoint(startLat, startLng, 90, baseRadius * 1.8),
      projectPoint(startLat, startLng, 135, baseRadius * 0.9),
      projectPoint(startLat, startLng, 180, baseRadius * 1.8),
      projectPoint(startLat, startLng, 225, baseRadius * 0.9),
      projectPoint(startLat, startLng, 270, baseRadius * 1.8),
      projectPoint(startLat, startLng, 315, baseRadius * 0.9),
    ]
  });
  
  return templates;
}

// Adjust waypoint distances to hit target distance
async function calibrateRoute(
  startLat: number,
  startLng: number,
  baseWaypoints: Array<{ lat: number; lng: number }>,
  targetDistance: number,
  optimize: boolean
): Promise<{ waypoints: Array<{ lat: number; lng: number }>; result: DirectionsResult } | null> {
  
  const origin = { lat: startLat, lng: startLng };
  
  // Calculate center and scale factor for waypoints
  // Expanded scale range for more variety in route sizes and geographic coverage
  let scale = 1.0;
  let minScale = 0.2;
  let maxScale = 12.0;
  
  let bestResult: { waypoints: Array<{ lat: number; lng: number }>; result: DirectionsResult } | null = null;
  let bestError = Infinity;
  
  for (let i = 0; i < 5; i++) {
    // Scale waypoints from center
    const scaledWaypoints = baseWaypoints.map(wp => {
      const dLat = (wp.lat - startLat) * scale;
      const dLng = (wp.lng - startLng) * scale;
      return { lat: startLat + dLat, lng: startLng + dLng };
    });
    
    const result = await fetchRoute(origin, scaledWaypoints, optimize);
    
    if (!result.success) {
      maxScale = scale;
      scale = (minScale + maxScale) / 2;
      continue;
    }
    
    const error = Math.abs(result.distance - targetDistance) / targetDistance;
    
    if (error < bestError) {
      bestError = error;
      bestResult = { waypoints: scaledWaypoints, result };
    }
    
    // If within 20% tolerance, accept it
    if (error < 0.20) {
      return { waypoints: scaledWaypoints, result };
    }
    
    // Adjust scale
    if (result.distance < targetDistance) {
      minScale = scale;
    } else {
      maxScale = scale;
    }
    scale = (minScale + maxScale) / 2;
  }
  
  // Return best result if within 35% tolerance
  if (bestResult && bestError < 0.35) {
    return bestResult;
  }
  
  return null;
}

// Elevation profile point for real-time terrain awareness
export interface ElevationPoint {
  lat: number;
  lng: number;
  elevation: number;
  distance: number; // cumulative distance from start in meters
  grade: number; // grade to next point as percentage (positive = uphill)
}

// Get elevation data with full profile for real-time coaching
async function getRouteElevation(polyline: string): Promise<{
  gain: number;
  loss: number;
  maxElevation: number;
  minElevation: number;
  maxInclinePercent?: number;
  maxInclineDegrees?: number;
  maxDeclinePercent?: number;
  maxDeclineDegrees?: number;
  profile?: ElevationPoint[];
} | undefined> {
  if (!GOOGLE_MAPS_API_KEY) return undefined;
  
  try {
    const points = decodePolyline(polyline);
    // Sample more points for better real-time detection (up to 100 points)
    const sampleRate = Math.max(1, Math.floor(points.length / 100));
    const sampledPoints = points.filter((_, i) => i % sampleRate === 0).slice(0, 100);
    
    if (sampledPoints.length < 2) return undefined;
    
    const locations = sampledPoints.map(p => `${p.lat},${p.lng}`).join('|');
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${locations}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.status === "OK" && data.results && data.results.length > 1) {
      const elevations = data.results.map((r: any) => r.elevation);
      
      let gain = 0;
      let loss = 0;
      
      // Build elevation profile with distance and grade
      const profile: ElevationPoint[] = [];
      let cumulativeDistance = 0;
      
      for (let i = 0; i < sampledPoints.length; i++) {
        const point = sampledPoints[i];
        const elevation = elevations[i];
        
        // Calculate distance from previous point
        if (i > 0) {
          const prevPoint = sampledPoints[i - 1];
          const segmentDistance = getDistanceKm(prevPoint, point) * 1000; // meters
          cumulativeDistance += segmentDistance;
          
          // Track gain/loss
          const elevDiff = elevation - elevations[i - 1];
          if (elevDiff > 0) gain += elevDiff;
          else loss += Math.abs(elevDiff);
        }
        
        // Calculate grade to next point (if not last point)
        let grade = 0;
        if (i < sampledPoints.length - 1) {
          const nextPoint = sampledPoints[i + 1];
          const nextElevation = elevations[i + 1];
          const segmentLength = getDistanceKm(point, nextPoint) * 1000; // meters
          if (segmentLength > 0) {
            grade = ((nextElevation - elevation) / segmentLength) * 100;
          }
        }
        
        profile.push({
          lat: point.lat,
          lng: point.lng,
          elevation: Math.round(elevation * 10) / 10,
          distance: Math.round(cumulativeDistance),
          grade: Math.round(grade * 10) / 10,
        });
      }
      
      // Calculate max incline and decline by iterating consecutive profile points
      // and calculating the actual slope between them
      let maxInclinePercent = 0;
      let maxDeclinePercent = 0;
      
      for (let i = 0; i < profile.length - 1; i++) {
        const current = profile[i];
        const next = profile[i + 1];
        
        // Calculate horizontal distance between consecutive points
        const horizontalDistance = next.distance - current.distance;
        
        // Skip very short segments (less than 10m) to avoid noise
        if (horizontalDistance < 10) continue;
        
        // Calculate elevation change
        const elevationChange = next.elevation - current.elevation;
        
        // Calculate grade as percentage
        const gradePercent = (elevationChange / horizontalDistance) * 100;
        
        // Track max incline (positive) and max decline (negative as absolute)
        if (gradePercent > maxInclinePercent) {
          maxInclinePercent = gradePercent;
        }
        if (gradePercent < 0 && Math.abs(gradePercent) > maxDeclinePercent) {
          maxDeclinePercent = Math.abs(gradePercent);
        }
      }
      
      // Round to 1 decimal place
      maxInclinePercent = Math.round(maxInclinePercent * 10) / 10;
      maxDeclinePercent = Math.round(maxDeclinePercent * 10) / 10;
      
      // Convert to degrees: degrees = atan(percent/100) * (180/PI)
      const maxInclineDegrees = Math.round(Math.atan(maxInclinePercent / 100) * (180 / Math.PI) * 10) / 10;
      const maxDeclineDegrees = Math.round(Math.atan(maxDeclinePercent / 100) * (180 / Math.PI) * 10) / 10;
      
      return {
        gain: Math.round(gain),
        loss: Math.round(loss),
        maxElevation: Math.round(Math.max(...elevations)),
        minElevation: Math.round(Math.min(...elevations)),
        maxInclinePercent,
        maxInclineDegrees,
        maxDeclinePercent,
        maxDeclineDegrees,
        profile,
      };
    }
  } catch (error) {
    console.error("Elevation error:", error);
  }
  
  return undefined;
}

// Generate trail-based templates using nearby parks/trails as waypoint anchors
function generateTrailBasedTemplates(
  startLat: number, 
  startLng: number, 
  targetDistance: number,
  places: NearbyPlace[]
): Array<{ name: string; waypoints: Array<{ lat: number; lng: number }>; optimize: boolean }> {
  const templates: Array<{ name: string; waypoints: Array<{ lat: number; lng: number }>; optimize: boolean }> = [];
  const baseRadius = targetDistance / 4; // Approximate radius for loop
  
  // Filter places within reasonable distance
  const nearbyPlaces = places.filter(p => {
    const dist = getDistanceKm({ lat: startLat, lng: startLng }, { lat: p.lat, lng: p.lng });
    return dist > 0.2 && dist < baseRadius * 2; // Between 200m and 2x radius
  });
  
  if (nearbyPlaces.length < 2) return templates;
  
  // Create templates using 2-4 nearby places as waypoints
  for (let i = 0; i < Math.min(nearbyPlaces.length, 5); i++) {
    for (let j = i + 1; j < Math.min(nearbyPlaces.length, 6); j++) {
      const place1 = nearbyPlaces[i];
      const place2 = nearbyPlaces[j];
      
      // Simple 2-waypoint loop through two places
      templates.push({
        name: `trail-${place1.name.slice(0,15)}-${place2.name.slice(0,15)}`,
        waypoints: [
          { lat: place1.lat, lng: place1.lng },
          { lat: place2.lat, lng: place2.lng }
        ],
        optimize: false
      });
      
      // Add a third point if available
      if (j + 1 < nearbyPlaces.length) {
        const place3 = nearbyPlaces[j + 1];
        templates.push({
          name: `trail-3pt-${place1.name.slice(0,10)}-${place2.name.slice(0,10)}`,
          waypoints: [
            { lat: place1.lat, lng: place1.lng },
            { lat: place2.lat, lng: place2.lng },
            { lat: place3.lat, lng: place3.lng }
          ],
          optimize: false
        });
      }
    }
  }
  
  console.log(`[Route Gen] Generated ${templates.length} trail-based templates from ${nearbyPlaces.length} nearby places`);
  return templates;
}

// Main function: Generate diverse routes
export async function generateAIRoutes(
  request: RouteRequest, 
  templatePreferences?: Array<{ templateName: string; avgRating: number; count: number }>
): Promise<MultiRouteResult> {
  const { startLat, startLng, targetDistance } = request;
  
  console.log(`[Route Gen] Generating diverse routes for ${targetDistance}km`);
  
  // Fetch nearby trail anchors (parks, walking paths, natural features)
  const nearbyPlaces = await findNearbyTrailAnchors(startLat, startLng, targetDistance);
  
  // NOTE: OpenAI waypoint design is disabled - using only Google Maps APIs and geometric templates
  // const aiSuggestions = await designWaypointsWithAI(startLat, startLng, targetDistance, nearbyPlaces);
  
  // Store AI reasoning for later attachment to RouteCandidate
  const aiReasoningMap = new Map<string, string>();
  
  // AI templates disabled - using trail-based and geometric templates only
  const aiTemplates: Array<{ name: string; waypoints: Array<{ lat: number; lng: number }>; optimize: boolean }> = [];
  
  // Generate geometric route templates
  let templates = generateRouteTemplates(startLat, startLng, targetDistance);
  
  // Add trail-based templates that use actual parks/trails as waypoints
  const trailTemplates = generateTrailBasedTemplates(startLat, startLng, targetDistance, nearbyPlaces);
  
  // Prioritize: trail-based > geometric (AI disabled)
  templates = [...trailTemplates, ...templates];
  
  console.log(`[Route Gen] Created ${templates.length} unique templates (${trailTemplates.length} trail-based, ${templates.length - trailTemplates.length} geometric)`);
  
  // Sort templates by user preferences if available
  if (templatePreferences && templatePreferences.length > 0) {
    const preferenceMap = new Map(templatePreferences.map(p => [p.templateName, p.avgRating]));
    
    templates = templates.sort((a, b) => {
      const ratingA = preferenceMap.get(a.name) || 5; // Default to neutral
      const ratingB = preferenceMap.get(b.name) || 5;
      return ratingB - ratingA; // Higher rated first
    });
    
    console.log(`[Route Gen] Sorted templates by user preferences`);
  }
  
  // Cache calibrated routes to avoid re-fetching when relaxing thresholds
  const calibratedCache: Map<string, { waypoints: Array<{lat: number; lng: number}>, result: DirectionsResult, backtrackRatio: number, angularSpread: number }> = new Map();
  
  // First pass: calibrate all templates
  for (const template of templates) {
    const calibrated = await calibrateRoute(
      startLat,
      startLng,
      template.waypoints,
      targetDistance,
      template.optimize
    );
    
    if (calibrated) {
      const backtrackRatio = calculateBacktrackRatio(calibrated.result.polyline);
      const angularSpread = calculateAngularSpread(calibrated.result.polyline, startLat, startLng);
      calibratedCache.set(template.name, { 
        waypoints: calibrated.waypoints, 
        result: calibrated.result,
        backtrackRatio,
        angularSpread
      });
      console.log(`[Route Gen] Calibrated ${template.name}: ${calibrated.result.distance.toFixed(2)}km, backtrack ${(backtrackRatio*100).toFixed(0)}%, spread ${angularSpread}°`);
    } else {
      console.log(`[Route Gen] Template ${template.name} failed calibration`);
    }
  }
  
  // Progressive relaxation: try increasingly lenient thresholds
  // Strict thresholds to enforce genuine circuit loops - max 25% backtracking
  const backtrackThresholds = [0.10, 0.15, 0.20, 0.25];
  
  const candidates: RouteCandidate[] = [];
  const acceptedPolylines: string[] = [];
  
  for (const maxBacktrack of backtrackThresholds) {
    if (candidates.length >= 5) break;
    
    console.log(`[Route Gen] Trying with backtrack threshold ${(maxBacktrack*100).toFixed(0)}%`);
    
    for (const template of templates) {
      if (candidates.length >= 5) break;
      
      const cached = calibratedCache.get(template.name);
      if (!cached) continue;
      
      // Skip if already accepted
      if (acceptedPolylines.includes(cached.result.polyline)) continue;
      
      // Check backtrack threshold for this pass
      if (cached.backtrackRatio > maxBacktrack) continue;
      
      // Require minimum angular spread for genuine circuit (at least 150 degrees)
      if (cached.angularSpread < 150) {
        console.log(`[Route Gen] Rejected ${template.name}: angular spread ${cached.angularSpread}° too narrow`);
        continue;
      }
      
      const { waypoints, result } = cached;
      
      // Check if this route is too similar to existing routes
      let tooSimilar = false;
      for (const existingPolyline of acceptedPolylines) {
        const overlap = calculateRouteOverlap(result.polyline, existingPolyline);
        if (overlap > 0.4) {
          tooSimilar = true;
          break;
        }
      }
      
      if (tooSimilar) continue;
      
      const footprint = getRouteFootprint(result.polyline);
      const hasMajorRoads = containsMajorRoads(result.instructions);
      const segments = getRouteSegments(result.polyline);
      const uniqueRatio = segments.size > 0 ? 1 : 0;
      
      console.log(`[Route Gen] Accepted ${template.name}: ${result.distance.toFixed(2)}km, footprint ${footprint.toFixed(2)}km, backtrack ${(cached.backtrackRatio*100).toFixed(0)}%`);
      
      // Assign difficulty based on route characteristics
      // Easy: low backtrack, no major roads
      // Moderate: medium backtrack OR major roads
      // Hard: based on elevation only (handled later)
      let difficulty: "easy" | "moderate" | "hard";
      
      if (cached.backtrackRatio <= 0.25 && !hasMajorRoads) {
        difficulty = "easy";
      } else {
        difficulty = "moderate";
      }
      
      // Major roads bump to moderate (not hard)
      if (hasMajorRoads && difficulty === "easy") {
        difficulty = "moderate";
      }
      
      candidates.push({
        id: `route-${candidates.length}`,
        waypoints,
        actualDistance: result.distance,
        duration: result.duration,
        polyline: result.polyline,
        routeName: `${result.distance.toFixed(1)}km ${difficulty} - ${template.name}`,
        difficulty,
        difficultyScore: Math.round(cached.backtrackRatio * 100),
        hasMajorRoads,
        uniquenessScore: uniqueRatio,
        deadEndCount: 0,
        turnInstructions: result.turnInstructions,
        aiReasoning: aiReasoningMap.get(template.name) || template.name,
      });
      
      acceptedPolylines.push(result.polyline);
    }
  }
  
  // Adaptive fallback: if fewer than 3 routes, try relaxed thresholds
  if (candidates.length < 3) {
    console.log(`[Route Gen] Only ${candidates.length} routes passed strict filters, trying relaxed thresholds...`);
    
    const relaxedBacktrackThresholds = [0.30, 0.35, 0.40];
    const relaxedAngularSpread = 120; // Lower from 150 to 120
    
    for (const maxBacktrack of relaxedBacktrackThresholds) {
      if (candidates.length >= 3) break;
      
      console.log(`[Route Gen] Fallback: backtrack ${(maxBacktrack*100).toFixed(0)}%, angular ${relaxedAngularSpread}°`);
      
      for (const template of templates) {
        if (candidates.length >= 3) break;
        
        const cached = calibratedCache.get(template.name);
        if (!cached) continue;
        
        // Skip if already accepted
        if (acceptedPolylines.includes(cached.result.polyline)) continue;
        
        // Relaxed checks
        if (cached.backtrackRatio > maxBacktrack) continue;
        if (cached.angularSpread < relaxedAngularSpread) continue;
        
        const { waypoints, result } = cached;
        
        // Still check for similarity
        let tooSimilar = false;
        for (const existingPolyline of acceptedPolylines) {
          const overlap = calculateRouteOverlap(result.polyline, existingPolyline);
          if (overlap > 0.4) {
            tooSimilar = true;
            break;
          }
        }
        if (tooSimilar) continue;
        
        const footprint = getRouteFootprint(result.polyline);
        const hasMajorRoads = containsMajorRoads(result.instructions);
        
        console.log(`[Route Gen] Fallback accepted ${template.name}: ${result.distance.toFixed(2)}km, backtrack ${(cached.backtrackRatio*100).toFixed(0)}%`);
        
        candidates.push({
          id: `route-${candidates.length}`,
          waypoints,
          actualDistance: result.distance,
          duration: result.duration,
          polyline: result.polyline,
          routeName: `${result.distance.toFixed(1)}km moderate - ${template.name}`,
          difficulty: "moderate", // Fallback routes are moderate by default
          difficultyScore: Math.round(cached.backtrackRatio * 100),
          hasMajorRoads,
          uniquenessScore: 1,
          deadEndCount: 0,
          turnInstructions: result.turnInstructions,
          aiReasoning: aiReasoningMap.get(template.name) || template.name,
        });
        
        acceptedPolylines.push(result.polyline);
      }
    }
  }
  
  if (candidates.length === 0) {
    return { success: false, routes: [], error: "Could not generate any routes" };
  }
  
  // Get elevation for all routes
  for (const candidate of candidates) {
    candidate.elevation = await getRouteElevation(candidate.polyline);
    
    // Adjust difficulty based on elevation
    if (candidate.elevation) {
      if (candidate.elevation.gain > 100 && candidate.difficulty === "easy") {
        candidate.difficulty = "moderate";
        candidate.routeName = candidate.routeName.replace("easy", "moderate");
      }
      if (candidate.elevation.gain > 200) {
        candidate.difficulty = "hard";
        candidate.routeName = candidate.routeName.replace("moderate", "hard").replace("easy", "hard");
      }
    }
  }
  
  console.log(`[Route Gen] Generated ${candidates.length} unique routes`);
  
  return {
    success: true,
    routes: candidates,
  };
}
