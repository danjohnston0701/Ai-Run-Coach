import OpenAI from "openai";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RouteRequest {
  startLat: number;
  startLng: number;
  targetDistance: number;
  difficulty?: "easy" | "moderate" | "hard";
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
function calculateBacktrackRatio(polyline: string): number {
  const points = decodePolyline(polyline);
  if (points.length < 10) return 0;
  
  const gridSize = 0.0003; // ~30m grid for finer detection
  const directedSegments: string[] = [];
  
  // Create directed segments (A->B is different from B->A)
  for (let i = 0; i < points.length - 1; i++) {
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
    return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: "No API key" };
  }

  const waypointsStr = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join("|");
  const optimizeParam = optimize ? "optimize:true|" : "";
  
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=${optimizeParam}${waypointsStr}&mode=walking&avoid=highways&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.routes[0]) {
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
          allInstructions.push(step.html_instructions.replace(/<[^>]*>/g, ''));
        }
      }
    }

    return {
      distance: totalDistance / 1000,
      duration: Math.round(totalDuration / 60),
      polyline: route.overview_polyline.points,
      success: true,
      instructions: allInstructions,
    };
  } catch (error) {
    console.error("Directions fetch error:", error);
    return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: "Fetch failed" };
  }
}

// Generate diverse route templates
// Each template creates waypoints in a fundamentally different pattern
function generateRouteTemplates(
  startLat: number,
  startLng: number,
  targetDistance: number
): Array<{ name: string; waypoints: Array<{ lat: number; lng: number }>; optimize: boolean }> {
  
  // Base radius for target distance (circumference = 2πr)
  const baseRadius = targetDistance / (2 * Math.PI);
  
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
  let scale = 1.0;
  let minScale = 0.3;
  let maxScale = 3.0;
  
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
    const sampleRate = Math.max(1, Math.floor(points.length / 50));
    const sampledPoints = points.filter((_, i) => i % sampleRate === 0).slice(0, 50);
    
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
    console.error("Elevation error:", error);
  }
  
  return undefined;
}

// Main function: Generate diverse routes
export async function generateAIRoutes(
  request: RouteRequest, 
  templatePreferences?: Array<{ templateName: string; avgRating: number; count: number }>
): Promise<MultiRouteResult> {
  const { startLat, startLng, targetDistance } = request;
  
  console.log(`[Route Gen] Generating diverse routes for ${targetDistance}km`);
  
  // Generate all route templates
  let templates = generateRouteTemplates(startLat, startLng, targetDistance);
  console.log(`[Route Gen] Created ${templates.length} unique templates`);
  
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
  const calibratedCache: Map<string, { waypoints: Array<{lat: number; lng: number}>, result: DirectionsResult, backtrackRatio: number }> = new Map();
  
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
      calibratedCache.set(template.name, { 
        waypoints: calibrated.waypoints, 
        result: calibrated.result,
        backtrackRatio
      });
      console.log(`[Route Gen] Calibrated ${template.name}: ${calibrated.result.distance.toFixed(2)}km, backtrack ${(backtrackRatio*100).toFixed(0)}%`);
    } else {
      console.log(`[Route Gen] Template ${template.name} failed calibration`);
    }
  }
  
  // Progressive relaxation: try increasingly lenient thresholds
  const backtrackThresholds = [0.25, 0.40, 0.55, 0.70];
  
  const candidates: RouteCandidate[] = [];
  const acceptedPolylines: string[] = [];
  
  for (const maxBacktrack of backtrackThresholds) {
    if (candidates.length >= 9) break;
    
    console.log(`[Route Gen] Trying with backtrack threshold ${(maxBacktrack*100).toFixed(0)}%`);
    
    for (const template of templates) {
      if (candidates.length >= 9) break;
      
      const cached = calibratedCache.get(template.name);
      if (!cached) continue;
      
      // Skip if already accepted
      if (acceptedPolylines.includes(cached.result.polyline)) continue;
      
      // Check backtrack threshold for this pass
      if (cached.backtrackRatio > maxBacktrack) continue;
      
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
      let difficulty: "easy" | "moderate" | "hard";
      
      // Routes with less backtracking are easier, more backtracking means harder
      if (cached.backtrackRatio <= 0.25) {
        difficulty = "easy";
      } else if (cached.backtrackRatio <= 0.40) {
        difficulty = "moderate";
      } else {
        difficulty = "hard";
      }
      
      if (hasMajorRoads) difficulty = "hard";
      
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
        aiReasoning: template.name,
      });
      
      acceptedPolylines.push(result.polyline);
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
