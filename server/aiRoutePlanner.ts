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

// Probe result for detecting viable directions
interface ProbeResult {
  bearing: number;
  isViable: boolean;
  reachableDistance: number;
  hasDeadEnd: boolean;
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

// Probe a direction to check if it leads to a dead end
async function probeDirection(
  startLat: number,
  startLng: number,
  bearing: number,
  probeDistanceKm: number
): Promise<ProbeResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    return { bearing, isViable: true, reachableDistance: probeDistanceKm, hasDeadEnd: false };
  }

  const targetPoint = projectPoint(startLat, startLng, bearing, probeDistanceKm);
  
  // Get walking directions to the probe point
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${targetPoint.lat},${targetPoint.lng}&mode=walking&key=${GOOGLE_MAPS_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== "OK" || !data.routes[0]) {
      return { bearing, isViable: false, reachableDistance: 0, hasDeadEnd: true };
    }
    
    const route = data.routes[0];
    const actualDistance = route.legs[0].distance.value / 1000;
    const straightLineDistance = probeDistanceKm;
    
    // Check route efficiency - if actual distance is much longer than straight line,
    // it likely involves backtracking or detours around obstacles
    const efficiency = straightLineDistance / actualDistance;
    
    // Check for "Head back" or "Turn around" instructions indicating dead ends
    let hasDeadEndMarkers = false;
    for (const step of route.legs[0].steps) {
      const instruction = (step.html_instructions || "").toLowerCase();
      if (instruction.includes("head back") || 
          instruction.includes("turn around") ||
          instruction.includes("make a u-turn")) {
        hasDeadEndMarkers = true;
        break;
      }
    }
    
    // Direction is viable if efficiency > 60% and no dead end markers
    const isViable = efficiency > 0.6 && !hasDeadEndMarkers;
    
    return {
      bearing,
      isViable,
      reachableDistance: actualDistance,
      hasDeadEnd: hasDeadEndMarkers || efficiency < 0.5,
    };
  } catch (error) {
    console.error(`Probe error for bearing ${bearing}:`, error);
    return { bearing, isViable: true, reachableDistance: probeDistanceKm, hasDeadEnd: false };
  }
}

// Probe multiple directions to find viable routes (avoid dead ends)
async function probeViableDirections(
  startLat: number,
  startLng: number,
  radiusKm: number,
  numProbes: number = 8
): Promise<number[]> {
  const bearings: number[] = [];
  const angleStep = 360 / numProbes;
  
  // Create probe bearings
  for (let i = 0; i < numProbes; i++) {
    bearings.push(i * angleStep);
  }
  
  console.log(`[Probe] Testing ${numProbes} directions at radius ${radiusKm.toFixed(2)}km`);
  
  // Probe all directions in parallel
  const probePromises = bearings.map(bearing => 
    probeDirection(startLat, startLng, bearing, radiusKm)
  );
  
  const results = await Promise.all(probePromises);
  
  // Filter to viable directions
  const viableBearings = results
    .filter(r => r.isViable)
    .map(r => r.bearing);
  
  console.log(`[Probe] Found ${viableBearings.length}/${numProbes} viable directions: ${viableBearings.join(', ')}`);
  
  return viableBearings;
}

// Generate waypoints using only viable directions, ensuring quadrant coverage
function generateSmartWaypoints(
  startLat: number,
  startLng: number,
  radiusKm: number,
  viableBearings: number[],
  numWaypoints: number = 4,
  rotationOffset: number = 0
): Array<{ lat: number; lng: number }> {
  if (viableBearings.length < 3) {
    // Fallback to geometric if not enough viable directions
    return generateGeometricWaypoints(startLat, startLng, radiusKm, numWaypoints, rotationOffset);
  }
  
  // Divide into quadrants and pick bearings from each
  const quadrants = [
    viableBearings.filter(b => b >= 0 && b < 90),
    viableBearings.filter(b => b >= 90 && b < 180),
    viableBearings.filter(b => b >= 180 && b < 270),
    viableBearings.filter(b => b >= 270 && b < 360),
  ];
  
  const selectedBearings: number[] = [];
  
  // Try to get one bearing from each quadrant
  for (let i = 0; i < 4; i++) {
    const quadrantIndex = (i + Math.floor(rotationOffset / 90)) % 4;
    const quadrant = quadrants[quadrantIndex];
    if (quadrant.length > 0) {
      // Pick the bearing closest to the center of this quadrant
      const idealBearing = quadrantIndex * 90 + 45 + rotationOffset;
      const closest = quadrant.reduce((a, b) => 
        Math.abs(a - idealBearing) < Math.abs(b - idealBearing) ? a : b
      );
      selectedBearings.push(closest);
    }
  }
  
  // If we don't have enough, add more from viable bearings
  while (selectedBearings.length < numWaypoints && viableBearings.length > selectedBearings.length) {
    for (const b of viableBearings) {
      if (!selectedBearings.includes(b)) {
        selectedBearings.push(b);
        break;
      }
    }
  }
  
  // Sort bearings clockwise
  selectedBearings.sort((a, b) => a - b);
  
  // Generate waypoints at these bearings
  return selectedBearings.map(bearing => 
    projectPoint(startLat, startLng, bearing, radiusKm)
  );
}

// Fallback geometric waypoint generation
function generateGeometricWaypoints(
  startLat: number,
  startLng: number,
  radiusKm: number,
  numWaypoints: number,
  rotationOffset: number
): Array<{ lat: number; lng: number }> {
  const waypoints: Array<{ lat: number; lng: number }> = [];
  const angleStep = 360 / numWaypoints;
  
  for (let i = 0; i < numWaypoints; i++) {
    const bearing = rotationOffset + (i * angleStep);
    waypoints.push(projectPoint(startLat, startLng, bearing, radiusKm));
  }
  
  return waypoints;
}

// Calculate initial radius - use larger footprint
function estimateInitialRadius(targetDistanceKm: number): number {
  // Use circular model: circumference = 2πr
  // For a running loop, radius ≈ distance / (2π) with slight efficiency factor
  // Start larger so calibration can adjust down if needed
  return (targetDistanceKm / (2 * Math.PI)) * 1.15;
}

// Fetch route with alternatives for better loop selection
async function fetchLoopRouteWithAlternatives(
  origin: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }>
): Promise<DirectionsResult[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    return [{ distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: "No API key" }];
  }

  const waypointsStr = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join("|");
  
  // Request with alternatives=true to get multiple route options
  const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=optimize:false|${waypointsStr}&mode=walking&avoid=highways&alternatives=true&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(directionsUrl);
    const data = await response.json();

    if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
      return [{ distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: data.status }];
    }

    const results: DirectionsResult[] = [];
    
    for (const route of data.routes) {
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

      results.push({
        distance: totalDistance / 1000,
        duration: Math.round(totalDuration / 60),
        polyline: route.overview_polyline.points,
        success: true,
        instructions: allInstructions,
      });
    }

    return results;
  } catch (error) {
    console.error("Directions fetch error:", error);
    return [{ distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: "Fetch failed" }];
  }
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

// Calculate uniqueness - how much of the route doesn't backtrack
function calculatePathUniqueness(polyline: string): number {
  const points = decodePolyline(polyline);
  if (points.length < 10) return 1.0;
  
  // Use smaller grid for more accurate detection
  const gridSize = 0.0002; // ~20 meter cells
  const segments: string[] = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const g1 = `${Math.round(p1.lat / gridSize)},${Math.round(p1.lng / gridSize)}`;
    const g2 = `${Math.round(p2.lat / gridSize)},${Math.round(p2.lng / gridSize)}`;
    
    if (g1 !== g2) {
      // Create bidirectional segment key
      const segmentKey = [g1, g2].sort().join("->");
      segments.push(segmentKey);
    }
  }
  
  if (segments.length === 0) return 1.0;
  
  const uniqueSegments = new Set(segments);
  return uniqueSegments.size / segments.length;
}

// Count repeated street names in instructions
function countRepeatedStreets(instructions: string[]): number {
  const streetMentions: Record<string, number> = {};
  
  for (const instruction of instructions) {
    // Extract street names (words ending in St, Ave, Rd, Dr, Ln, Blvd, Way, etc.)
    const streetPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Way|Pl|Place|Ct|Court|Cres|Crescent))\b/gi;
    const matches = instruction.match(streetPattern) || [];
    
    for (const street of matches) {
      const normalized = street.toLowerCase();
      streetMentions[normalized] = (streetMentions[normalized] || 0) + 1;
    }
  }
  
  // Count streets mentioned more than twice (indicating backtracking)
  let repeatedCount = 0;
  for (const count of Object.values(streetMentions)) {
    if (count > 2) {
      repeatedCount += count - 2;
    }
  }
  
  return repeatedCount;
}

// Check for major roads
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

// Get elevation data
async function getRouteElevation(polyline: string): Promise<{
  gain: number;
  loss: number;
  maxElevation: number;
  minElevation: number;
} | undefined> {
  if (!GOOGLE_MAPS_API_KEY) return undefined;
  
  try {
    const points = decodePolyline(polyline);
    const sampleRate = Math.max(1, Math.floor(points.length / 60));
    const sampledPoints = points.filter((_, i) => i % sampleRate === 0).slice(0, 60);
    
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

// Calculate route footprint (how spread out it is)
function calculateRouteFootprint(polyline: string): number {
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
  
  // Return diagonal distance in km
  return getDistanceKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });
}

// Score a route based on quality metrics
function scoreRoute(
  result: DirectionsResult,
  targetDistance: number
): { score: number; uniqueness: number; repeatedStreets: number; footprint: number } {
  const distanceError = Math.abs(result.distance - targetDistance) / targetDistance;
  const uniqueness = calculatePathUniqueness(result.polyline);
  const repeatedStreets = countRepeatedStreets(result.instructions);
  const footprint = calculateRouteFootprint(result.polyline);
  const hasMajorRoads = containsMajorRoads(result.instructions);
  
  // Score components (higher is better)
  let score = 0;
  
  // Distance accuracy (0-30 points)
  score += Math.max(0, 30 - distanceError * 100);
  
  // Uniqueness (0-40 points) - most important
  score += uniqueness * 40;
  
  // Low repeated streets (0-20 points)
  score += Math.max(0, 20 - repeatedStreets * 3);
  
  // Good footprint (0-10 points)
  const expectedFootprint = targetDistance / 3; // Expect ~1/3 of distance as diameter
  const footprintRatio = Math.min(footprint / expectedFootprint, 1.5);
  score += footprintRatio * 10 / 1.5;
  
  // Penalty for major roads
  if (hasMajorRoads) score -= 10;
  
  return { score, uniqueness, repeatedStreets, footprint };
}

// Generate a single calibrated route
async function generateCalibratedRoute(
  startLat: number,
  startLng: number,
  targetDistance: number,
  viableBearings: number[],
  numWaypoints: number,
  rotationOffset: number,
  tolerancePercent: number = 20
): Promise<{ waypoints: Array<{ lat: number; lng: number }>; result: DirectionsResult; score: number } | null> {
  
  let radiusKm = estimateInitialRadius(targetDistance);
  let minRadius = radiusKm * 0.4;
  let maxRadius = radiusKm * 2.5; // Allow much larger radius for exploration
  
  let bestResult: { waypoints: Array<{ lat: number; lng: number }>; result: DirectionsResult; score: number } | null = null;

  for (let iteration = 0; iteration < 6; iteration++) {
    const waypoints = generateSmartWaypoints(
      startLat, startLng, radiusKm, viableBearings, numWaypoints, rotationOffset
    );
    
    const results = await fetchLoopRouteWithAlternatives({ lat: startLat, lng: startLng }, waypoints);
    
    // Score all alternatives and pick the best
    for (const result of results) {
      if (!result.success) continue;
      
      const { score, uniqueness, repeatedStreets, footprint } = scoreRoute(result, targetDistance);
      const errorPercent = Math.abs((result.distance - targetDistance) / targetDistance) * 100;
      
      console.log(`[Calibration] r=${radiusKm.toFixed(2)}km: dist=${result.distance.toFixed(2)}km (${errorPercent.toFixed(0)}%), uniq=${(uniqueness*100).toFixed(0)}%, rpt=${repeatedStreets}, foot=${footprint.toFixed(2)}km, score=${score.toFixed(1)}`);
      
      // Only consider routes with reasonable uniqueness (lowered threshold for more results)
      if (uniqueness < 0.45) continue;
      
      // Check if within tolerance
      if (errorPercent <= tolerancePercent) {
        if (!bestResult || score > bestResult.score) {
          bestResult = { waypoints, result, score };
        }
      }
    }
    
    // If we found a good result, we can stop or try to improve
    if (bestResult && bestResult.score > 60) {
      break;
    }
    
    // Adjust radius based on best result so far
    const testResult = results.find(r => r.success);
    if (testResult) {
      if (testResult.distance < targetDistance) {
        minRadius = radiusKm;
      } else {
        maxRadius = radiusKm;
      }
    }
    
    radiusKm = (minRadius + maxRadius) / 2;
  }
  
  return bestResult;
}

// Main function: Generate high-quality loop routes
export async function generateAIRoutes(request: RouteRequest): Promise<MultiRouteResult> {
  const { startLat, startLng, targetDistance } = request;
  
  console.log(`[AI Route Planner] Generating routes for ${targetDistance}km`);
  
  // Step 1: Probe directions to find viable (non-dead-end) bearings
  const probeRadius = estimateInitialRadius(targetDistance);
  const viableBearings = await probeViableDirections(startLat, startLng, probeRadius, 12);
  
  if (viableBearings.length < 3) {
    console.log(`[AI Route Planner] Not enough viable directions, using geometric fallback`);
  }
  
  // Step 2: Generate routes with different configurations
  const candidates: RouteCandidate[] = [];
  
  const configs = [
    { numWaypoints: 4, rotation: 0 },
    { numWaypoints: 4, rotation: 45 },
    { numWaypoints: 5, rotation: 0 },
    { numWaypoints: 5, rotation: 36 },
    { numWaypoints: 6, rotation: 0 },
    { numWaypoints: 6, rotation: 30 },
    { numWaypoints: 4, rotation: 90 },
    { numWaypoints: 5, rotation: 72 },
    { numWaypoints: 6, rotation: 60 },
  ];
  
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    console.log(`[AI Route Planner] Generating route ${i + 1}/${configs.length}: ${config.numWaypoints} waypoints, rotation ${config.rotation}°`);
    
    const result = await generateCalibratedRoute(
      startLat,
      startLng,
      targetDistance,
      viableBearings,
      config.numWaypoints,
      config.rotation,
      20 // 20% tolerance
    );
    
    if (!result) {
      console.log(`[AI Route Planner] Route ${i + 1} failed to generate`);
      continue;
    }
    
    const { waypoints, result: routeResult, score } = result;
    
    const hasMajorRoads = containsMajorRoads(routeResult.instructions);
    const uniqueness = calculatePathUniqueness(routeResult.polyline);
    const footprint = calculateRouteFootprint(routeResult.polyline);
    
    // Assign difficulty based on characteristics
    let difficulty: "easy" | "moderate" | "hard" = "easy";
    if (hasMajorRoads) {
      difficulty = "hard";
    } else if (uniqueness < 0.7 || footprint < targetDistance / 4) {
      difficulty = "moderate";
    }
    
    // Get elevation
    const elevation = await getRouteElevation(routeResult.polyline);
    if (elevation && elevation.gain > 80) {
      if (difficulty === "easy") difficulty = "moderate";
      if (elevation.gain > 150 && difficulty === "moderate") difficulty = "hard";
    }
    
    candidates.push({
      id: `route-${i}`,
      waypoints,
      actualDistance: routeResult.distance,
      duration: routeResult.duration,
      polyline: routeResult.polyline,
      routeName: `${routeResult.distance.toFixed(1)}km ${difficulty} Loop`,
      difficulty,
      difficultyScore: 100 - score, // Lower is better
      hasMajorRoads,
      uniquenessScore: uniqueness,
      deadEndCount: 0,
      elevation,
      aiReasoning: `${config.numWaypoints} waypoints, ${footprint.toFixed(2)}km footprint`,
    });
  }
  
  if (candidates.length === 0) {
    return { success: false, routes: [], error: "Could not generate any routes" };
  }
  
  // Sort by score (higher uniqueness, better distance match)
  candidates.sort((a, b) => a.difficultyScore - b.difficultyScore);
  
  // Distribute into difficulty buckets
  const easyRoutes = candidates.filter(r => r.difficulty === "easy").slice(0, 3);
  const moderateRoutes = candidates.filter(r => r.difficulty === "moderate").slice(0, 3);
  const hardRoutes = candidates.filter(r => r.difficulty === "hard").slice(0, 3);
  
  // Fill missing slots
  const usedIds = new Set([...easyRoutes, ...moderateRoutes, ...hardRoutes].map(r => r.id));
  const remaining = candidates.filter(r => !usedIds.has(r.id));
  
  while (easyRoutes.length < 3 && remaining.length > 0) {
    const r = remaining.shift()!;
    easyRoutes.push({ ...r, difficulty: "easy", routeName: `${r.actualDistance.toFixed(1)}km easy Loop` });
  }
  while (moderateRoutes.length < 3 && remaining.length > 0) {
    const r = remaining.shift()!;
    moderateRoutes.push({ ...r, difficulty: "moderate", routeName: `${r.actualDistance.toFixed(1)}km moderate Loop` });
  }
  while (hardRoutes.length < 3 && remaining.length > 0) {
    const r = remaining.shift()!;
    hardRoutes.push({ ...r, difficulty: "hard", routeName: `${r.actualDistance.toFixed(1)}km hard Loop` });
  }
  
  const finalRoutes = [...easyRoutes, ...moderateRoutes, ...hardRoutes];
  
  console.log(`[AI Route Planner] Generated ${finalRoutes.length} routes`);
  const footprints = finalRoutes.map(r => calculateRouteFootprint(r.polyline));
  console.log(`[AI Route Planner] Footprint range: ${Math.min(...footprints).toFixed(2)}km - ${Math.max(...footprints).toFixed(2)}km`);
  
  return {
    success: true,
    routes: finalRoutes,
  };
}
