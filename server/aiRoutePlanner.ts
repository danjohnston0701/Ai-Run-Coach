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
  parks: Array<{
    name: string;
    location: { lat: number; lng: number };
  }>;
  elevation: {
    min: number;
    max: number;
    avgSlope: number;
  };
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

interface DirectionsResult {
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
}

// Loop template shapes - different polygon types for variety
type LoopShape = "square" | "pentagon" | "hexagon" | "triangle" | "octagon";

const LOOP_SHAPES: Record<LoopShape, number> = {
  triangle: 3,
  square: 4,
  pentagon: 5,
  hexagon: 6,
  octagon: 8,
};

// Generate waypoints for a loop template
function generateLoopTemplate(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  shape: LoopShape,
  rotationDegrees: number = 0
): Array<{ lat: number; lng: number }> {
  const numPoints = LOOP_SHAPES[shape];
  const waypoints: Array<{ lat: number; lng: number }> = [];
  const angleStep = 360 / numPoints;

  for (let i = 0; i < numPoints; i++) {
    const bearing = rotationDegrees + (i * angleStep);
    const point = projectPoint(centerLat, centerLng, bearing, radiusKm);
    waypoints.push(point);
  }

  return waypoints;
}

// Calculate initial radius estimate based on target distance and shape
// Roads typically add 20-40% to the straight-line perimeter due to curves
function estimateInitialRadius(targetDistanceKm: number, shape: LoopShape): number {
  const numSides = LOOP_SHAPES[shape];
  // For a regular polygon: perimeter = 2 * n * r * sin(π/n)
  // But real roads add ~30% overhead, so we use a correction factor
  const roadOverheadFactor = 1.3;
  const perimeter = targetDistanceKm / roadOverheadFactor;
  const sideLength = perimeter / numSides;
  // For regular polygon: side = 2 * r * sin(π/n)
  const angleRad = Math.PI / numSides;
  const radius = sideLength / (2 * Math.sin(angleRad));
  return radius;
}

// Fetch route from Google Directions API (loop back to start)
async function fetchLoopRoute(
  origin: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }>
): Promise<DirectionsResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: "No API key" };
  }

  // Format waypoints for the API (via points)
  const waypointsStr = waypoints.map((wp) => `via:${wp.lat},${wp.lng}`).join("|");
  
  // Request walking route that returns to origin, avoiding highways
  const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=${waypointsStr}&mode=walking&avoid=highways&key=${GOOGLE_MAPS_API_KEY}`;

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
      distance: totalDistance / 1000, // Convert to km
      duration: Math.round(totalDuration / 60), // Convert to minutes
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

// Iteratively calibrate the route to match target distance
// Uses binary search to adjust radius until distance is within tolerance
async function calibrateRouteDistance(
  startLat: number,
  startLng: number,
  targetDistanceKm: number,
  shape: LoopShape,
  rotationDegrees: number,
  tolerancePercent: number = 15,
  maxIterations: number = 5
): Promise<{ waypoints: Array<{ lat: number; lng: number }>; result: DirectionsResult } | null> {
  
  let radiusKm = estimateInitialRadius(targetDistanceKm, shape);
  let minRadius = radiusKm * 0.3;
  let maxRadius = radiusKm * 3.0;
  
  let bestResult: { waypoints: Array<{ lat: number; lng: number }>; result: DirectionsResult } | null = null;
  let bestError = Infinity;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const waypoints = generateLoopTemplate(startLat, startLng, radiusKm, shape, rotationDegrees);
    const result = await fetchLoopRoute({ lat: startLat, lng: startLng }, waypoints);
    
    if (!result.success) {
      // Try with a smaller radius if route fails
      maxRadius = radiusKm;
      radiusKm = (minRadius + maxRadius) / 2;
      continue;
    }

    const errorPercent = Math.abs((result.distance - targetDistanceKm) / targetDistanceKm) * 100;
    
    console.log(`[Calibration] Iteration ${iteration + 1}: radius=${radiusKm.toFixed(3)}km, distance=${result.distance.toFixed(2)}km, error=${errorPercent.toFixed(1)}%`);
    
    // Track the best result so far
    if (errorPercent < bestError) {
      bestError = errorPercent;
      bestResult = { waypoints, result };
    }

    // Check if we're within tolerance
    if (errorPercent <= tolerancePercent) {
      console.log(`[Calibration] Target achieved within ${tolerancePercent}% tolerance`);
      return { waypoints, result };
    }

    // Adjust radius using binary search
    if (result.distance < targetDistanceKm) {
      // Route too short, increase radius
      minRadius = radiusKm;
    } else {
      // Route too long, decrease radius
      maxRadius = radiusKm;
    }
    
    radiusKm = (minRadius + maxRadius) / 2;
  }

  // Return best result even if not perfect (as long as it's reasonable)
  if (bestResult && bestError < 50) {
    console.log(`[Calibration] Returning best result with ${bestError.toFixed(1)}% error`);
    return bestResult;
  }
  
  return null;
}

// Get nearby parks for scenic routing
async function getNearbyParks(lat: number, lng: number, radiusKm: number): Promise<AreaData["parks"]> {
  if (!GOOGLE_MAPS_API_KEY) return [];
  
  const radiusMeters = radiusKm * 1000;
  const parks: AreaData["parks"] = [];

  try {
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=park&key=${GOOGLE_MAPS_API_KEY}`;
    const placesRes = await fetch(placesUrl);
    const placesData = await placesRes.json();
    
    if (placesData.results) {
      for (const place of placesData.results.slice(0, 8)) {
        parks.push({
          name: place.name,
          location: {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
          },
        });
      }
    }
  } catch (error) {
    console.error("Error fetching parks:", error);
  }

  return parks;
}

// Use AI to select optimal anchor points from parks for scenic routes
async function selectScenicAnchors(
  startLat: number,
  startLng: number,
  targetDistance: number,
  parks: AreaData["parks"],
  difficulty: "easy" | "moderate" | "hard",
  variant: number
): Promise<Array<{ lat: number; lng: number }> | null> {
  if (parks.length < 2) return null;
  
  const approximateRadius = estimateInitialRadius(targetDistance, "pentagon");

  const prompt = `You are a running route optimizer. Select 3-5 parks/locations from the list below to create a scenic loop route.

START LOCATION: ${startLat.toFixed(6)}, ${startLng.toFixed(6)}
TARGET DISTANCE: ${targetDistance} km
DIFFICULTY: ${difficulty}
APPROXIMATE ROUTE RADIUS: ${approximateRadius.toFixed(2)} km

AVAILABLE PARKS/LOCATIONS:
${parks.map((p, i) => `${i + 1}. ${p.name} at (${p.location.lat.toFixed(6)}, ${p.location.lng.toFixed(6)})`).join('\n')}

REQUIREMENTS:
1. Select 3-5 locations that form a roughly circular loop around the start point
2. For variant ${variant}, prefer ${variant === 0 ? 'northern/eastern' : variant === 1 ? 'southern/western' : 'varied direction'} parks
3. Parks should be roughly evenly spaced around the start point
4. ${difficulty === 'easy' ? 'Prioritize parks that are close together for a gentler route' : difficulty === 'hard' ? 'Include parks that are more spread out for a challenging route' : 'Balance convenience with variety'}

Return ONLY a JSON array of selected park indices (1-indexed), e.g.: [1, 3, 5, 7]
No explanation, just the JSON array.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You output only valid JSON arrays of numbers." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3 + (variant * 0.1),
      max_tokens: 100,
    });

    const content = response.choices[0]?.message?.content || "";
    const indices = JSON.parse(content);
    
    if (!Array.isArray(indices) || indices.length < 3) {
      return null;
    }

    // Convert indices to coordinates
    const anchors = indices
      .filter((i: number) => i >= 1 && i <= parks.length)
      .map((i: number) => parks[i - 1].location);

    return anchors.length >= 3 ? anchors : null;
    
  } catch (error) {
    console.error("AI anchor selection error:", error);
    return null;
  }
}

// Get elevation data along a route polyline
async function getRouteElevation(polyline: string): Promise<{
  gain: number;
  loss: number;
  maxElevation: number;
  minElevation: number;
} | undefined> {
  if (!GOOGLE_MAPS_API_KEY) return undefined;
  
  try {
    const points = decodePolyline(polyline);
    
    // Sample points along the route (max 100 for Elevation API efficiency)
    const sampleRate = Math.max(1, Math.floor(points.length / 80));
    const sampledPoints = points.filter((_, i) => i % sampleRate === 0).slice(0, 80);
    
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

// Helper: Project a point at a given bearing and distance
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

// Decode Google polyline to points
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

// Check if route contains major roads
const MAJOR_ROAD_KEYWORDS = [
  'highway', 'hwy', 'motorway', 'state highway', 'sh-', 'sh ', ' sh ',
  'expressway', 'freeway', 'interstate', ' i-', 'turnpike'
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

// Calculate how much of the route backtracks (lower is better for loops)
function calculatePathUniqueness(polyline: string): number {
  const points = decodePolyline(polyline);
  if (points.length < 10) return 1.0;
  
  const gridSize = 0.0003; // ~30 meter grid cells
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

// Calculate difficulty score based on route characteristics
function calculateDifficultyScore(
  hasMajorRoads: boolean,
  uniqueness: number,
  elevationGain: number
): number {
  let score = 0;
  
  if (hasMajorRoads) score += 50;
  if (uniqueness < 0.6) score += 20; // Lots of backtracking
  if (elevationGain > 100) score += 30;
  else if (elevationGain > 50) score += 15;
  
  return score;
}

// Main function: Generate calibrated loop routes
export async function generateAIRoutes(request: RouteRequest): Promise<MultiRouteResult> {
  const { startLat, startLng, targetDistance } = request;
  
  console.log(`[AI Route Planner] Starting generation for ${targetDistance}km route`);
  
  // Step 1: Get nearby parks for scenic anchor options
  const searchRadius = estimateInitialRadius(targetDistance, "pentagon") * 1.5;
  const parks = await getNearbyParks(startLat, startLng, searchRadius);
  console.log(`[AI Route Planner] Found ${parks.length} nearby parks`);
  
  // Step 2: Generate 9 routes using calibrated geometric templates
  const candidates: RouteCandidate[] = [];
  const difficulties: Array<"easy" | "moderate" | "hard"> = [
    "easy", "easy", "easy", 
    "moderate", "moderate", "moderate", 
    "hard", "hard", "hard"
  ];
  
  // Different shapes and rotations for variety
  const routeConfigs: Array<{ shape: LoopShape; rotation: number }> = [
    { shape: "pentagon", rotation: 0 },
    { shape: "square", rotation: 45 },
    { shape: "hexagon", rotation: 30 },
    { shape: "pentagon", rotation: 72 },
    { shape: "square", rotation: 0 },
    { shape: "hexagon", rotation: 60 },
    { shape: "pentagon", rotation: 144 },
    { shape: "octagon", rotation: 22.5 },
    { shape: "hexagon", rotation: 0 },
  ];

  for (let i = 0; i < 9; i++) {
    const difficulty = difficulties[i];
    const config = routeConfigs[i];
    const variantIndex = i % 3;
    
    console.log(`[AI Route Planner] Generating ${difficulty} route ${variantIndex + 1} (${config.shape}, rotation ${config.rotation}°)`);
    
    let calibrationResult: { waypoints: Array<{ lat: number; lng: number }>; result: DirectionsResult } | null = null;
    
    // Try AI-selected scenic anchors first for easy routes
    if (difficulty === "easy" && parks.length >= 3) {
      const scenicAnchors = await selectScenicAnchors(
        startLat, startLng, targetDistance, parks, difficulty, variantIndex
      );
      
      if (scenicAnchors && scenicAnchors.length >= 3) {
        console.log(`[AI Route Planner] Using ${scenicAnchors.length} AI-selected scenic anchors`);
        
        // Try to get route through scenic points
        const scenicResult = await fetchLoopRoute({ lat: startLat, lng: startLng }, scenicAnchors);
        
        if (scenicResult.success) {
          const errorPercent = Math.abs((scenicResult.distance - targetDistance) / targetDistance) * 100;
          
          if (errorPercent <= 25) {
            calibrationResult = { waypoints: scenicAnchors, result: scenicResult };
            console.log(`[AI Route Planner] Scenic route accepted: ${scenicResult.distance.toFixed(2)}km (${errorPercent.toFixed(1)}% error)`);
          }
        }
      }
    }
    
    // Fall back to geometric calibration if scenic route didn't work
    if (!calibrationResult) {
      calibrationResult = await calibrateRouteDistance(
        startLat,
        startLng,
        targetDistance,
        config.shape,
        config.rotation,
        15, // 15% tolerance
        4   // max iterations
      );
    }
    
    if (!calibrationResult) {
      console.log(`[AI Route Planner] Route ${i} calibration failed, skipping`);
      continue;
    }
    
    const { waypoints, result } = calibrationResult;
    
    const hasMajorRoads = containsMajorRoads(result.instructions);
    const uniqueness = calculatePathUniqueness(result.polyline);
    const elevationGain = result.elevation?.gain || 0;
    const difficultyScore = calculateDifficultyScore(hasMajorRoads, uniqueness, elevationGain);
    
    // Reject routes with too much backtracking (not real loops)
    if (uniqueness < 0.4) {
      console.log(`[AI Route Planner] Route ${i} rejected: too much backtracking (${(uniqueness * 100).toFixed(0)}% unique)`);
      continue;
    }
    
    // Adjust final difficulty based on actual characteristics
    let finalDifficulty = difficulty;
    if (hasMajorRoads && difficulty !== "hard") {
      finalDifficulty = "hard";
    } else if (elevationGain > 80 && difficulty === "easy") {
      finalDifficulty = "moderate";
    }
    
    const errorPercent = ((result.distance - targetDistance) / targetDistance) * 100;
    console.log(`[AI Route Planner] Route ${i}: ${result.distance.toFixed(2)}km (${errorPercent.toFixed(1)}% off target), ${finalDifficulty}, elevation: +${elevationGain}m`);
    
    candidates.push({
      id: `ai-route-${i}`,
      waypoints,
      actualDistance: result.distance,
      duration: result.duration,
      polyline: result.polyline,
      routeName: `${result.distance.toFixed(1)}km ${finalDifficulty} Loop`,
      difficulty: finalDifficulty,
      difficultyScore,
      hasMajorRoads,
      uniquenessScore: uniqueness,
      deadEndCount: 0,
      elevation: result.elevation,
      aiReasoning: `${config.shape} template with ${config.rotation}° rotation`,
    });
  }
  
  if (candidates.length === 0) {
    return { success: false, routes: [], error: "Could not generate any routes matching criteria" };
  }
  
  // Sort candidates by distance accuracy first, then by quality
  candidates.sort((a, b) => {
    const aError = Math.abs(a.actualDistance - targetDistance);
    const bError = Math.abs(b.actualDistance - targetDistance);
    if (Math.abs(aError - bError) > 0.3) {
      return aError - bError; // Prioritize distance accuracy
    }
    return a.difficultyScore - b.difficultyScore; // Then quality (lower = better)
  });
  
  // Organize routes by difficulty (up to 3 per category)
  const easyRoutes = candidates.filter(r => r.difficulty === "easy").slice(0, 3);
  const moderateRoutes = candidates.filter(r => r.difficulty === "moderate").slice(0, 3);
  const hardRoutes = candidates.filter(r => r.difficulty === "hard").slice(0, 3);
  
  // Fill missing slots from remaining candidates
  const usedIds = new Set([...easyRoutes, ...moderateRoutes, ...hardRoutes].map(r => r.id));
  const remaining = candidates.filter(r => !usedIds.has(r.id));
  
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
  
  console.log(`[AI Route Planner] Generated ${finalRoutes.length} calibrated routes`);
  console.log(`[AI Route Planner] Distance range: ${Math.min(...finalRoutes.map(r => r.actualDistance)).toFixed(2)}km - ${Math.max(...finalRoutes.map(r => r.actualDistance)).toFixed(2)}km (target: ${targetDistance}km)`);
  
  return {
    success: true,
    routes: finalRoutes,
  };
}
