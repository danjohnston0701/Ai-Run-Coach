const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export interface RouteConfig {
  waypointCount: number;
  radiusMultiplier: number;
  headingJitter: number;
  maxRetries: number;
  minUniqueRatio: number;
}

export const DIFFICULTY_PRESETS: Record<string, RouteConfig> = {
  beginner: {
    waypointCount: 3,
    radiusMultiplier: 0.18,
    headingJitter: 20,
    maxRetries: 15,
    minUniqueRatio: 0.65,
  },
  moderate: {
    waypointCount: 4,
    radiusMultiplier: 0.20,
    headingJitter: 30,
    maxRetries: 15,
    minUniqueRatio: 0.70,
  },
  expert: {
    waypointCount: 5,
    radiusMultiplier: 0.22,
    headingJitter: 40,
    maxRetries: 15,
    minUniqueRatio: 0.75,
  },
};

export interface RouteRequest {
  startLat: number;
  startLng: number;
  targetDistance: number;
  difficulty: "beginner" | "moderate" | "expert";
}

export interface RouteResult {
  success: boolean;
  waypoints: Array<{ lat: number; lng: number }>;
  actualDistance: number;
  duration: number;
  polyline: string;
  attempts: number;
  routeName: string;
  error?: string;
}

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

function generateWaypoints(
  startLat: number,
  startLng: number,
  targetDistance: number,
  config: RouteConfig,
  attempt: number,
  scaleFactor: number = 1
): Array<{ lat: number; lng: number }> {
  const baseRadius = (targetDistance / (2 * Math.PI)) * config.radiusMultiplier;
  const attemptVariation = 1 + (attempt * 0.05) * (attempt % 2 === 0 ? 1 : -0.5);
  const radiusKm = baseRadius * attemptVariation * scaleFactor;
  
  const waypoints: Array<{ lat: number; lng: number }> = [];
  const baseAngle = (attempt * 37) % 360;
  const angleStep = 360 / config.waypointCount;
  
  for (let i = 0; i < config.waypointCount; i++) {
    const jitter = (Math.random() - 0.5) * 2 * config.headingJitter;
    const bearing = baseAngle + (i * angleStep) + jitter;
    const radiusVariation = radiusKm * (0.85 + Math.random() * 0.3);
    
    const point = projectPoint(startLat, startLng, bearing, radiusVariation);
    waypoints.push(point);
  }
  
  return waypoints;
}

async function fetchDirectionsRoute(
  origin: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }>
): Promise<{
  distance: number;
  duration: number;
  polyline: string;
  success: boolean;
  error?: string;
}> {
  if (!GOOGLE_MAPS_API_KEY) {
    return { distance: 0, duration: 0, polyline: "", success: false, error: "No API key" };
  }

  const waypointsStr = waypoints
    .map((wp) => `${wp.lat},${wp.lng}`)
    .join("|");

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${origin.lat},${origin.lng}&waypoints=${waypointsStr}&mode=walking&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      console.log("Directions API error:", data.status, data.error_message);
      return { distance: 0, duration: 0, polyline: "", success: false, error: data.status };
    }

    const route = data.routes[0];
    let totalDistance = 0;
    let totalDuration = 0;

    for (const leg of route.legs) {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;
    }

    return {
      distance: totalDistance / 1000,
      duration: Math.round(totalDuration / 60),
      polyline: route.overview_polyline.points,
      success: true,
    };
  } catch (error) {
    console.error("Directions fetch error:", error);
    return { distance: 0, duration: 0, polyline: "", success: false, error: "Fetch failed" };
  }
}

export async function generateCircularRoute(request: RouteRequest): Promise<RouteResult> {
  const config = DIFFICULTY_PRESETS[request.difficulty] || DIFFICULTY_PRESETS.moderate;
  const minDistance = request.targetDistance * 0.95;
  const maxDistance = request.targetDistance * 1.05;
  
  console.log(`Generating ${request.difficulty} route: target ${request.targetDistance}km (${minDistance.toFixed(2)}-${maxDistance.toFixed(2)}km acceptable)`);

  let bestResult: RouteResult | null = null;
  let closestDiff = Infinity;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    const scaleFactor = bestResult 
      ? request.targetDistance / bestResult.actualDistance 
      : 1;
    
    const waypoints = generateWaypoints(
      request.startLat,
      request.startLng,
      request.targetDistance,
      config,
      attempt,
      scaleFactor
    );

    const result = await fetchDirectionsRoute(
      { lat: request.startLat, lng: request.startLng },
      waypoints
    );

    if (!result.success) {
      console.log(`Attempt ${attempt + 1}: API error - ${result.error}`);
      continue;
    }

    const diff = Math.abs(result.distance - request.targetDistance);
    console.log(`Attempt ${attempt + 1}: ${result.distance.toFixed(2)}km (diff: ${diff.toFixed(2)}km)`);

    if (result.distance >= minDistance && result.distance <= maxDistance) {
      console.log(`Found valid route on attempt ${attempt + 1}`);
      return {
        success: true,
        waypoints,
        actualDistance: result.distance,
        duration: result.duration,
        polyline: result.polyline,
        attempts: attempt + 1,
        routeName: `${request.targetDistance}km ${request.difficulty} Loop`,
      };
    }

    if (diff < closestDiff) {
      closestDiff = diff;
      bestResult = {
        success: false,
        waypoints,
        actualDistance: result.distance,
        duration: result.duration,
        polyline: result.polyline,
        attempts: attempt + 1,
        routeName: `${request.targetDistance}km ${request.difficulty} Loop`,
      };
    }
  }

  if (bestResult) {
    const variance = ((bestResult.actualDistance - request.targetDistance) / request.targetDistance) * 100;
    const isWithinTolerance = bestResult.actualDistance >= minDistance && bestResult.actualDistance <= maxDistance;
    
    if (isWithinTolerance) {
      console.log(`Using best route: ${bestResult.actualDistance.toFixed(2)}km (${variance.toFixed(1)}% variance) - within tolerance`);
      bestResult.success = true;
      bestResult.attempts = config.maxRetries;
      return bestResult;
    } else {
      console.log(`Best route ${bestResult.actualDistance.toFixed(2)}km exceeds 5% tolerance (${variance.toFixed(1)}% variance)`);
      return {
        success: false,
        waypoints: bestResult.waypoints,
        actualDistance: bestResult.actualDistance,
        duration: bestResult.duration,
        polyline: bestResult.polyline,
        attempts: config.maxRetries,
        routeName: "",
        error: `Could not generate route within 5% of ${request.targetDistance}km. Best available: ${bestResult.actualDistance.toFixed(1)}km (${variance.toFixed(1)}% off)`,
      };
    }
  }

  return {
    success: false,
    waypoints: [],
    actualDistance: 0,
    duration: 0,
    polyline: "",
    attempts: config.maxRetries,
    routeName: "",
    error: "Could not generate a valid route",
  };
}
