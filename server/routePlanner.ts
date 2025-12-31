const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export function isGoogleMapsConfigured(): boolean {
  return !!GOOGLE_MAPS_API_KEY;
}

export interface RouteRequest {
  startLat: number;
  startLng: number;
  targetDistance: number;
}

export interface RouteCandidate {
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
}

export interface MultiRouteResult {
  success: boolean;
  routes: RouteCandidate[];
  error?: string;
}

const MAJOR_ROAD_KEYWORDS = [
  'highway', 'hwy', 'motorway', 'state highway', 'sh-', 'sh ', ' sh ',
  'a road', 'a-road', 'm road', 'm-road', ' m1', ' m2', ' m3', ' m4', ' m5',
  ' a1', ' a2', ' a3', ' a4', ' a5', 'expressway', 'freeway'
];

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

function projectPoint(
  lat: number,
  lng: number,
  bearingDegrees: number,
  distanceKm: number
): { lat: number; lng: number } {
  const R = 6371;
  const lat1 = toRadians(lat);
  const lng1 = toRadians(lng);
  const bearing = toRadians(bearingDegrees);
  const d = distanceKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2),
  };
}

function generatePolygonWaypoints(
  startLat: number,
  startLng: number,
  radiusKm: number,
  waypointCount: number,
  rotationOffset: number = 0
): Array<{ lat: number; lng: number }> {
  const waypoints: Array<{ lat: number; lng: number }> = [];
  const angleStep = 360 / waypointCount;
  
  for (let i = 0; i < waypointCount; i++) {
    const bearing = rotationOffset + (i * angleStep);
    const point = projectPoint(startLat, startLng, bearing, radiusKm);
    waypoints.push(point);
  }
  
  return waypoints;
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

function calculateBearing(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const lat1 = toRadians(p1.lat);
  const lat2 = toRadians(p2.lat);
  const dLng = toRadians(p2.lng - p1.lng);
  
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  
  let bearing = toDegrees(Math.atan2(x, y));
  return (bearing + 360) % 360;
}

function getDistanceMeters(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371000;
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

function detectDeadEndPatterns(polyline: string): { deadEndCount: number } {
  const points = decodePolyline(polyline);
  if (points.length < 20) return { deadEndCount: 0 };
  
  let deadEndCount = 0;
  const minSegmentLength = 8;
  const turnThreshold = 140;
  
  for (let i = 2; i < points.length - 2; i++) {
    const dist1 = getDistanceMeters(points[i-1], points[i]);
    const dist2 = getDistanceMeters(points[i], points[i+1]);
    
    if (dist1 < minSegmentLength || dist2 < minSegmentLength) continue;
    
    const bearing1 = calculateBearing(points[i-1], points[i]);
    const bearing2 = calculateBearing(points[i], points[i+1]);
    
    let turnAngle = Math.abs(bearing2 - bearing1);
    if (turnAngle > 180) turnAngle = 360 - turnAngle;
    
    if (turnAngle >= turnThreshold) {
      const prevBearing = i >= 3 ? calculateBearing(points[i-2], points[i-1]) : bearing1;
      let approachAngle = Math.abs(bearing1 - prevBearing);
      if (approachAngle > 180) approachAngle = 360 - approachAngle;
      
      if (approachAngle < 60) {
        deadEndCount++;
      }
    }
  }
  
  return { deadEndCount };
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

function calculateDifficultyScore(hasMajorRoads: boolean, uniqueness: number, deadEndCount: number): number {
  let score = 0;
  
  if (hasMajorRoads) score += 50;
  if (uniqueness < 0.5) score += 20;
  else if (uniqueness < 0.7) score += 10;
  score += deadEndCount * 5;
  
  return score;
}

function assignDifficulty(score: number, hasMajorRoads: boolean): "easy" | "moderate" | "hard" {
  if (hasMajorRoads) return "hard";
  if (score >= 30) return "hard";
  if (score >= 15) return "moderate";
  return "easy";
}

async function fetchSingleRoute(
  origin: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }>
): Promise<{
  distance: number;
  duration: number;
  polyline: string;
  success: boolean;
  instructions: string[];
  error?: string;
}> {
  if (!GOOGLE_MAPS_API_KEY) {
    return { distance: 0, duration: 0, polyline: "", success: false, instructions: [], error: "No API key" };
  }

  const waypointsStr = waypoints
    .map((wp) => `${wp.lat},${wp.lng}`)
    .join("|");

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=${waypointsStr}&mode=walking&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(url);
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

export async function generateMultipleRoutes(request: RouteRequest): Promise<MultiRouteResult> {
  const targetDistance = request.targetDistance;
  const baseRadius = targetDistance / (2 * Math.PI);
  
  console.log(`Generating 9 route options for ${targetDistance}km`);
  
  const configurations = [
    { waypointCount: 4, rotation: 0, radiusMod: 1.0 },
    { waypointCount: 4, rotation: 45, radiusMod: 1.0 },
    { waypointCount: 4, rotation: 90, radiusMod: 1.0 },
    { waypointCount: 5, rotation: 0, radiusMod: 1.0 },
    { waypointCount: 5, rotation: 60, radiusMod: 1.0 },
    { waypointCount: 5, rotation: 120, radiusMod: 1.0 },
    { waypointCount: 6, rotation: 0, radiusMod: 1.0 },
    { waypointCount: 6, rotation: 30, radiusMod: 1.0 },
    { waypointCount: 6, rotation: 60, radiusMod: 1.0 },
    { waypointCount: 4, rotation: 135, radiusMod: 1.1 },
    { waypointCount: 5, rotation: 180, radiusMod: 0.9 },
    { waypointCount: 6, rotation: 90, radiusMod: 1.05 },
  ];
  
  const candidates: RouteCandidate[] = [];
  let routeId = 0;
  
  for (const config of configurations) {
    if (candidates.length >= 12) break;
    
    const adjustedRadius = baseRadius * config.radiusMod;
    const waypoints = generatePolygonWaypoints(
      request.startLat,
      request.startLng,
      adjustedRadius,
      config.waypointCount,
      config.rotation
    );
    
    const result = await fetchSingleRoute(
      { lat: request.startLat, lng: request.startLng },
      waypoints
    );
    
    if (!result.success) {
      console.log(`Route config ${routeId} failed: ${result.error}`);
      continue;
    }
    
    const hasMajorRoads = containsMajorRoads(result.instructions);
    const uniqueness = calculatePathUniqueness(result.polyline);
    const { deadEndCount } = detectDeadEndPatterns(result.polyline);
    const difficultyScore = calculateDifficultyScore(hasMajorRoads, uniqueness, deadEndCount);
    const difficulty = assignDifficulty(difficultyScore, hasMajorRoads);
    
    const variance = ((result.distance - targetDistance) / targetDistance) * 100;
    
    console.log(`Route ${routeId}: ${result.distance.toFixed(2)}km (${variance.toFixed(1)}%), ${difficulty}, majorRoads: ${hasMajorRoads}, uniqueness: ${(uniqueness * 100).toFixed(0)}%, deadEnds: ${deadEndCount}`);
    
    candidates.push({
      id: `route-${routeId}`,
      waypoints,
      actualDistance: result.distance,
      duration: result.duration,
      polyline: result.polyline,
      routeName: `${result.distance.toFixed(1)}km ${difficulty} Loop`,
      difficulty,
      difficultyScore,
      hasMajorRoads,
      uniquenessScore: uniqueness,
      deadEndCount,
    });
    
    routeId++;
  }
  
  if (candidates.length === 0) {
    return { success: false, routes: [], error: "Could not generate any routes" };
  }
  
  // RULE: Routes with major roads MUST remain "hard" - never downgrade
  // Sort all candidates by difficulty score (ascending: easiest first)
  const sortedByScore = [...candidates].sort((a, b) => a.difficultyScore - b.difficultyScore);
  
  // Separate routes that MUST be hard (have major roads) from flexible routes
  const mustBeHard = sortedByScore.filter(r => r.hasMajorRoads);
  const flexible = sortedByScore.filter(r => !r.hasMajorRoads);
  
  const easyRoutes: RouteCandidate[] = [];
  const moderateRoutes: RouteCandidate[] = [];
  const hardRoutes: RouteCandidate[] = [];
  
  // First, add all must-be-hard routes to hard bucket (up to 3)
  for (const route of mustBeHard) {
    if (hardRoutes.length < 3) {
      hardRoutes.push({ ...route, difficulty: "hard" as const, routeName: `${route.actualDistance.toFixed(1)}km hard Loop` });
    }
  }
  
  // Sort flexible routes by score (ascending = easiest first)
  const sortedFlexible = [...flexible].sort((a, b) => a.difficultyScore - b.difficultyScore);
  const numFlexible = sortedFlexible.length;
  
  // Calculate how many flexible routes we need for each bucket
  const hardSlotsNeeded = 3 - hardRoutes.length;
  const totalSlotsNeeded = 3 + 3 + hardSlotsNeeded; // easy + moderate + remaining hard
  
  // If we have enough flexible routes, allocate 3 to each category
  // Priority order: easy (lowest scores), moderate (middle), hard (highest scores)
  if (numFlexible >= totalSlotsNeeded) {
    // Take 3 easiest for easy bucket
    for (let i = 0; i < 3 && i < numFlexible; i++) {
      easyRoutes.push({ ...sortedFlexible[i], difficulty: "easy" as const, routeName: `${sortedFlexible[i].actualDistance.toFixed(1)}km easy Loop` });
    }
    // Take 3 hardest flexible for hard bucket (if needed)
    for (let i = numFlexible - 1; i >= 0 && hardRoutes.length < 3; i--) {
      if (i >= 3) { // Don't take from easy slots
        hardRoutes.push({ ...sortedFlexible[i], difficulty: "hard" as const, routeName: `${sortedFlexible[i].actualDistance.toFixed(1)}km hard Loop` });
      }
    }
    // Fill moderate from the middle
    const usedIds = new Set([...easyRoutes, ...hardRoutes].map(r => r.id));
    for (const route of sortedFlexible) {
      if (moderateRoutes.length >= 3) break;
      if (!usedIds.has(route.id)) {
        moderateRoutes.push({ ...route, difficulty: "moderate" as const, routeName: `${route.actualDistance.toFixed(1)}km moderate Loop` });
      }
    }
  } else {
    // Not enough flexible routes - distribute what we have proportionally
    // Priority: fill each bucket evenly, then overflow to hard
    const easyTarget = Math.min(3, Math.ceil(numFlexible / 3));
    const moderateTarget = Math.min(3, Math.ceil((numFlexible - easyTarget) / 2));
    
    for (let i = 0; i < numFlexible; i++) {
      const route = sortedFlexible[i];
      if (easyRoutes.length < easyTarget) {
        easyRoutes.push({ ...route, difficulty: "easy" as const, routeName: `${route.actualDistance.toFixed(1)}km easy Loop` });
      } else if (moderateRoutes.length < moderateTarget) {
        moderateRoutes.push({ ...route, difficulty: "moderate" as const, routeName: `${route.actualDistance.toFixed(1)}km moderate Loop` });
      } else if (hardRoutes.length < 3) {
        hardRoutes.push({ ...route, difficulty: "hard" as const, routeName: `${route.actualDistance.toFixed(1)}km hard Loop` });
      }
    }
  }
  
  const finalRoutes = [...easyRoutes, ...moderateRoutes, ...hardRoutes];
  
  console.log(`Generated ${finalRoutes.length} routes: ${easyRoutes.length} easy, ${moderateRoutes.length} moderate, ${hardRoutes.length} hard`);
  
  return {
    success: true,
    routes: finalRoutes,
  };
}

export async function generateCircularRoute(request: RouteRequest & { difficulty: string }): Promise<{
  success: boolean;
  waypoints: Array<{ lat: number; lng: number }>;
  actualDistance: number;
  duration: number;
  polyline: string;
  attempts: number;
  routeName: string;
  error?: string;
  routeGrade?: string;
}> {
  const result = await generateMultipleRoutes(request);
  
  if (!result.success || result.routes.length === 0) {
    return {
      success: false,
      waypoints: [],
      actualDistance: 0,
      duration: 0,
      polyline: "",
      attempts: 0,
      routeName: "",
      error: result.error || "No routes generated",
    };
  }
  
  const route = result.routes[0];
  return {
    success: true,
    waypoints: route.waypoints,
    actualDistance: route.actualDistance,
    duration: route.duration,
    polyline: route.polyline,
    attempts: 1,
    routeName: route.routeName,
    routeGrade: route.difficulty,
  };
}
