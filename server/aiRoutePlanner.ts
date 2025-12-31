import OpenAI from "openai";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RouteRequest {
  startLat: number;
  startLng: number;
  targetDistance: number;
  difficulty?: "easy" | "moderate" | "hard";
}

interface AreaData {
  roads: Array<{
    name: string;
    type: string;
    geometry: Array<{ lat: number; lng: number }>;
  }>;
  parks: Array<{
    name: string;
    location: { lat: number; lng: number };
  }>;
  paths: Array<{
    name: string;
    type: string;
    geometry: Array<{ lat: number; lng: number }>;
  }>;
  elevation: {
    min: number;
    max: number;
    avgSlope: number;
  };
}

interface AIWaypointResult {
  waypoints: Array<{ lat: number; lng: number }>;
  reasoning: string;
  estimatedDifficulty: string;
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
  elevation?: {
    gain: number;
    loss: number;
    maxElevation: number;
    minElevation: number;
  };
  aiReasoning?: string;
}

interface MultiRouteResult {
  success: boolean;
  routes: RouteCandidate[];
  error?: string;
}

// Query Google Places API to find nearby roads, parks, and paths
async function getAreaData(lat: number, lng: number, radiusKm: number): Promise<AreaData> {
  const radiusMeters = radiusKm * 1000;
  const parks: AreaData["parks"] = [];
  const roads: AreaData["roads"] = [];
  const paths: AreaData["paths"] = [];

  try {
    // Get nearby parks and recreational areas
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=park&key=${GOOGLE_MAPS_API_KEY}`;
    const placesRes = await fetch(placesUrl);
    const placesData = await placesRes.json();
    
    if (placesData.results) {
      for (const place of placesData.results.slice(0, 10)) {
        parks.push({
          name: place.name,
          location: {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
          },
        });
      }
    }

    // Get roads data using Roads API (sample points in the area)
    const samplePoints = generateSamplePoints(lat, lng, radiusKm);
    const roadsUrl = `https://roads.googleapis.com/v1/nearestRoads?points=${samplePoints.map(p => `${p.lat},${p.lng}`).join('|')}&key=${GOOGLE_MAPS_API_KEY}`;
    
    try {
      const roadsRes = await fetch(roadsUrl);
      const roadsData = await roadsRes.json();
      
      if (roadsData.snappedPoints) {
        // Group snapped points by placeId to identify unique roads
        const roadMap = new Map<string, Array<{ lat: number; lng: number }>>();
        for (const point of roadsData.snappedPoints) {
          const placeId = point.placeId;
          if (!roadMap.has(placeId)) {
            roadMap.set(placeId, []);
          }
          roadMap.get(placeId)!.push({
            lat: point.location.latitude,
            lng: point.location.longitude,
          });
        }
        
        let roadIndex = 0;
        Array.from(roadMap.values()).forEach((geometry) => {
          roads.push({
            name: `Road ${roadIndex + 1}`,
            type: "road",
            geometry,
          });
          roadIndex++;
        });
      }
    } catch (roadsError) {
      console.log("Roads API not available, using fallback");
    }

  } catch (error) {
    console.error("Error fetching area data:", error);
  }

  // Get elevation data for the area
  const elevation = await getAreaElevation(lat, lng, radiusKm);

  return { roads, parks, paths, elevation };
}

function generateSamplePoints(lat: number, lng: number, radiusKm: number): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  const numRings = 3;
  const pointsPerRing = 8;
  
  for (let ring = 1; ring <= numRings; ring++) {
    const ringRadius = (radiusKm / numRings) * ring;
    for (let i = 0; i < pointsPerRing; i++) {
      const angle = (360 / pointsPerRing) * i;
      const point = projectPoint(lat, lng, angle, ringRadius);
      points.push(point);
    }
  }
  
  return points;
}

async function getAreaElevation(lat: number, lng: number, radiusKm: number): Promise<AreaData["elevation"]> {
  try {
    // Sample elevation at multiple points around the area
    const samplePoints = [
      { lat, lng }, // center
      projectPoint(lat, lng, 0, radiusKm),
      projectPoint(lat, lng, 90, radiusKm),
      projectPoint(lat, lng, 180, radiusKm),
      projectPoint(lat, lng, 270, radiusKm),
    ];
    
    const locations = samplePoints.map(p => `${p.lat},${p.lng}`).join('|');
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${locations}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.status === "OK" && data.results) {
      const elevations = data.results.map((r: any) => r.elevation);
      const min = Math.min(...elevations);
      const max = Math.max(...elevations);
      const avgSlope = (max - min) / (radiusKm * 1000) * 100; // percentage slope
      
      return { min, max, avgSlope };
    }
  } catch (error) {
    console.error("Elevation API error:", error);
  }
  
  return { min: 0, max: 0, avgSlope: 0 };
}

// Use OpenAI to design optimal waypoints based on area data and criteria
async function designWaypointsWithAI(
  startLat: number,
  startLng: number,
  targetDistance: number,
  difficulty: "easy" | "moderate" | "hard",
  areaData: AreaData,
  routeVariant: number
): Promise<AIWaypointResult> {
  const difficultyGuidelines = {
    easy: "Prefer flat terrain, residential streets, parks, and paths. Avoid busy roads, highways, and steep hills. Prioritize scenic, quiet routes.",
    moderate: "Balance between convenience and challenge. Can include some moderate hills and busier roads. Mix of residential and commercial areas is fine.",
    hard: "Include challenging elements: steep hills, longer stretches, can use busier roads. Maximize elevation gain and route complexity."
  };

  // Calculate approximate radius needed for the target distance
  const approximateRadius = (targetDistance / (2 * Math.PI)) * 0.5; // Correction factor for real roads

  const prompt = `You are a running route designer. Design waypoints for a circular running route.

START LOCATION: ${startLat}, ${startLng}
TARGET DISTANCE: ${targetDistance} km
DIFFICULTY: ${difficulty}
ROUTE VARIANT: ${routeVariant} (create a unique route different from variants 0-${routeVariant - 1})

AREA DATA:
- Parks nearby: ${areaData.parks.map(p => `${p.name} at (${p.location.lat.toFixed(5)}, ${p.location.lng.toFixed(5)})`).join(', ') || 'None found'}
- Elevation range: ${areaData.elevation.min.toFixed(0)}m to ${areaData.elevation.max.toFixed(0)}m (avg slope: ${areaData.elevation.avgSlope.toFixed(1)}%)
- Approximate search radius: ${approximateRadius.toFixed(2)} km

DIFFICULTY GUIDELINES FOR ${difficulty.toUpperCase()}:
${difficultyGuidelines[difficulty]}

REQUIREMENTS:
1. Create a CIRCULAR route that starts and ends at the start location
2. Design ${4 + (routeVariant % 3)} waypoints arranged to form a loop
3. Route must be approximately ${targetDistance} km (roads add ~60-100% distance to straight-line paths)
4. For variant ${routeVariant}, rotate the route ${routeVariant * 40} degrees from north to create variety
5. ${difficulty === 'easy' ? 'Route through parks if available: ' + areaData.parks.slice(0, 2).map(p => p.name).join(', ') : ''}

Return a JSON object with:
{
  "waypoints": [{"lat": number, "lng": number}, ...],
  "reasoning": "Brief explanation of route design choices",
  "estimatedDifficulty": "easy|moderate|hard"
}

IMPORTANT: Return ONLY valid JSON, no markdown or extra text.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a running route designer that outputs only valid JSON. Design routes that are safe, enjoyable, and match the specified criteria."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7 + (routeVariant * 0.05), // Vary temperature for different routes
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || "";
    
    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON in response");
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    // Validate waypoints
    if (!Array.isArray(result.waypoints) || result.waypoints.length < 3) {
      throw new Error("Invalid waypoints array");
    }
    
    // Ensure waypoints are valid numbers
    const validWaypoints = result.waypoints.filter((wp: any) => 
      typeof wp.lat === 'number' && typeof wp.lng === 'number' &&
      !isNaN(wp.lat) && !isNaN(wp.lng)
    );
    
    if (validWaypoints.length < 3) {
      throw new Error("Not enough valid waypoints");
    }
    
    return {
      waypoints: validWaypoints,
      reasoning: result.reasoning || "AI-designed route",
      estimatedDifficulty: result.estimatedDifficulty || difficulty,
    };
    
  } catch (error) {
    console.error("OpenAI waypoint design error:", error);
    // Fallback to geometric waypoints
    const fallbackWaypoints = generateFallbackWaypoints(startLat, startLng, targetDistance, difficulty, routeVariant);
    return {
      waypoints: fallbackWaypoints,
      reasoning: "Fallback geometric route (AI unavailable)",
      estimatedDifficulty: difficulty,
    };
  }
}

function generateFallbackWaypoints(
  startLat: number,
  startLng: number,
  targetDistance: number,
  difficulty: string,
  variant: number
): Array<{ lat: number; lng: number }> {
  const waypointCount = 4 + (variant % 3);
  const radius = (targetDistance / (2 * Math.PI)) * 0.45;
  const rotation = variant * 40;
  
  const waypoints: Array<{ lat: number; lng: number }> = [];
  const angleStep = 360 / waypointCount;
  
  for (let i = 0; i < waypointCount; i++) {
    const bearing = rotation + (i * angleStep);
    // Add some randomness based on variant
    const radiusVariation = radius * (0.9 + (variant % 3) * 0.1);
    const point = projectPoint(startLat, startLng, bearing, radiusVariation);
    waypoints.push(point);
  }
  
  return waypoints;
}

// Fetch route from Google Directions API with elevation data
async function fetchRouteWithElevation(
  origin: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }>
): Promise<{
  distance: number;
  duration: number;
  polyline: string;
  success: boolean;
  instructions: string[];
  elevation?: {
    gain: number;
    loss: number;
    maxElevation: number;
    minElevation: number;
  };
  error?: string;
}> {
  if (!GOOGLE_MAPS_API_KEY) {
    return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: "No API key" };
  }

  const waypointsStr = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join("|");
  const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=${waypointsStr}&mode=walking&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(directionsUrl);
    const data = await response.json();

    if (data.status !== "OK") {
      return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: data.status };
    }

    const route = data.routes[0];
    let totalDistance = 0;
    let totalDuration = 0;
    const allInstructions: string[] = [];

    for (const leg of route.legs) {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;
      for (const step of leg.steps) {
        if (step.html_instructions) {
          const cleanInstruction = step.html_instructions.replace(/<[^>]*>/g, '');
          allInstructions.push(cleanInstruction);
        }
      }
    }

    // Get elevation data along the route
    const elevation = await getRouteElevation(route.overview_polyline.points);

    return {
      distance: totalDistance / 1000,
      duration: Math.round(totalDuration / 60),
      polyline: route.overview_polyline.points,
      success: true,
      instructions: allInstructions,
      elevation,
    };
  } catch (error) {
    console.error("Directions fetch error:", error);
    return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: "Fetch failed" };
  }
}

async function getRouteElevation(polyline: string): Promise<{
  gain: number;
  loss: number;
  maxElevation: number;
  minElevation: number;
} | undefined> {
  try {
    // Decode polyline to get points
    const points = decodePolyline(polyline);
    
    // Sample points along the route (max 512 for Elevation API)
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
      
      for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];
        if (diff > 0) gain += diff;
        else loss += Math.abs(diff);
      }
      
      return {
        gain: Math.round(gain),
        loss: Math.round(loss),
        maxElevation: Math.round(Math.max(...elevations)),
        minElevation: Math.round(Math.min(...elevations)),
      };
    }
  } catch (error) {
    console.error("Route elevation error:", error);
  }
  
  return undefined;
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

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2),
  };
}

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

const MAJOR_ROAD_KEYWORDS = [
  'highway', 'hwy', 'motorway', 'state highway', 'sh-', 'sh ', ' sh ',
  'a road', 'a-road', 'm road', 'm-road', ' m1', ' m2', ' m3', ' m4', ' m5',
  ' a1', ' a2', ' a3', ' a4', ' a5', 'expressway', 'freeway'
];

function containsMajorRoads(instructions: string[]): boolean {
  for (const instruction of instructions) {
    const lowerInstruction = instruction.toLowerCase();
    for (const keyword of MAJOR_ROAD_KEYWORDS) {
      if (lowerInstruction.includes(keyword)) {
        return true;
      }
    }
  }
  return false;
}

function calculatePathUniqueness(polyline: string): number {
  const points = decodePolyline(polyline);
  if (points.length < 10) return 1.0;
  
  const gridSize = 0.0005;
  const segments: string[] = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const g1 = `${Math.round(p1.lat / gridSize)},${Math.round(p1.lng / gridSize)}`;
    const g2 = `${Math.round(p2.lat / gridSize)},${Math.round(p2.lng / gridSize)}`;
    
    if (g1 !== g2) {
      const segmentKey = [g1, g2].sort().join("->");
      segments.push(segmentKey);
    }
  }
  
  if (segments.length === 0) return 1.0;
  
  const uniqueSegments = new Set(segments);
  return uniqueSegments.size / segments.length;
}

function calculateDifficultyScore(
  hasMajorRoads: boolean,
  uniqueness: number,
  elevationGain: number,
  targetDifficulty: string
): number {
  let score = 0;
  
  if (hasMajorRoads) score += 50;
  if (uniqueness < 0.5) score += 20;
  else if (uniqueness < 0.7) score += 10;
  
  // Add elevation-based scoring
  if (elevationGain > 100) score += 20;
  else if (elevationGain > 50) score += 10;
  
  return score;
}

// Main function: Generate AI-powered routes
export async function generateAIRoutes(request: RouteRequest): Promise<MultiRouteResult> {
  const { startLat, startLng, targetDistance } = request;
  
  console.log(`[AI Route Planner] Starting generation for ${targetDistance}km route`);
  
  // Step 1: Get area data from Google
  const searchRadius = (targetDistance / (2 * Math.PI)) * 1.5; // Search a bit wider than needed
  console.log(`[AI Route Planner] Fetching area data within ${searchRadius.toFixed(2)}km radius`);
  
  const areaData = await getAreaData(startLat, startLng, searchRadius);
  console.log(`[AI Route Planner] Found ${areaData.parks.length} parks, elevation range: ${areaData.elevation.min.toFixed(0)}-${areaData.elevation.max.toFixed(0)}m`);
  
  // Step 2: Generate 9 routes (3 easy, 3 moderate, 3 hard) using AI
  const candidates: RouteCandidate[] = [];
  const difficulties: Array<"easy" | "moderate" | "hard"> = ["easy", "easy", "easy", "moderate", "moderate", "moderate", "hard", "hard", "hard"];
  
  for (let i = 0; i < 9; i++) {
    const difficulty = difficulties[i];
    const variant = Math.floor(i / 3); // 0, 0, 0, 1, 1, 1, 2, 2, 2
    const subVariant = i % 3; // 0, 1, 2, 0, 1, 2, 0, 1, 2
    
    console.log(`[AI Route Planner] Designing ${difficulty} route variant ${subVariant}`);
    
    // Step 2a: Use OpenAI to design waypoints
    const aiResult = await designWaypointsWithAI(
      startLat,
      startLng,
      targetDistance,
      difficulty,
      areaData,
      i // Use index as variant for variety
    );
    
    console.log(`[AI Route Planner] AI designed ${aiResult.waypoints.length} waypoints: ${aiResult.reasoning}`);
    
    // Step 2b: Feed waypoints to Google to get actual route with elevation
    const routeResult = await fetchRouteWithElevation(
      { lat: startLat, lng: startLng },
      aiResult.waypoints
    );
    
    if (!routeResult.success) {
      console.log(`[AI Route Planner] Route ${i} failed: ${routeResult.error}`);
      continue;
    }
    
    const hasMajorRoads = containsMajorRoads(routeResult.instructions);
    const uniqueness = calculatePathUniqueness(routeResult.polyline);
    const elevationGain = routeResult.elevation?.gain || 0;
    const difficultyScore = calculateDifficultyScore(hasMajorRoads, uniqueness, elevationGain, difficulty);
    
    // Determine final difficulty based on actual route characteristics
    let finalDifficulty = difficulty;
    if (hasMajorRoads && difficulty !== "hard") {
      finalDifficulty = "hard"; // Major roads always make it hard
    }
    
    const variance = ((routeResult.distance - targetDistance) / targetDistance) * 100;
    console.log(`[AI Route Planner] Route ${i}: ${routeResult.distance.toFixed(2)}km (${variance.toFixed(1)}% off target), ${finalDifficulty}, elevation gain: ${elevationGain}m`);
    
    candidates.push({
      id: `ai-route-${i}`,
      waypoints: aiResult.waypoints,
      actualDistance: routeResult.distance,
      duration: routeResult.duration,
      polyline: routeResult.polyline,
      routeName: `${routeResult.distance.toFixed(1)}km ${finalDifficulty} Loop`,
      difficulty: finalDifficulty,
      difficultyScore,
      hasMajorRoads,
      uniquenessScore: uniqueness,
      deadEndCount: 0,
      elevation: routeResult.elevation,
      aiReasoning: aiResult.reasoning,
    });
  }
  
  if (candidates.length === 0) {
    return { success: false, routes: [], error: "Could not generate any routes" };
  }
  
  // Step 3: Organize routes by difficulty (3 easy, 3 moderate, 3 hard)
  const easyRoutes = candidates.filter(r => r.difficulty === "easy").slice(0, 3);
  const moderateRoutes = candidates.filter(r => r.difficulty === "moderate").slice(0, 3);
  const hardRoutes = candidates.filter(r => r.difficulty === "hard").slice(0, 3);
  
  // Fill in any missing slots
  const remaining = candidates.filter(r => 
    !easyRoutes.includes(r) && !moderateRoutes.includes(r) && !hardRoutes.includes(r)
  );
  
  while (easyRoutes.length < 3 && remaining.length > 0) {
    const route = remaining.shift()!;
    easyRoutes.push({ ...route, difficulty: "easy", routeName: `${route.actualDistance.toFixed(1)}km easy Loop` });
  }
  while (moderateRoutes.length < 3 && remaining.length > 0) {
    const route = remaining.shift()!;
    moderateRoutes.push({ ...route, difficulty: "moderate", routeName: `${route.actualDistance.toFixed(1)}km moderate Loop` });
  }
  while (hardRoutes.length < 3 && remaining.length > 0) {
    const route = remaining.shift()!;
    hardRoutes.push({ ...route, difficulty: "hard", routeName: `${route.actualDistance.toFixed(1)}km hard Loop` });
  }
  
  const finalRoutes = [...easyRoutes, ...moderateRoutes, ...hardRoutes];
  
  console.log(`[AI Route Planner] Generated ${finalRoutes.length} AI-powered routes: ${easyRoutes.length} easy, ${moderateRoutes.length} moderate, ${hardRoutes.length} hard`);
  
  return {
    success: true,
    routes: finalRoutes,
  };
}
