const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export function isGoogleMapsConfigured(): boolean {
  return !!GOOGLE_MAPS_API_KEY;
}

export interface RouteConfig {
  waypointCount: number;
  maxRetries: number;
  minUniqueRatio: number;
  maxElevationGuidance: number;
}

export const DIFFICULTY_PRESETS: Record<string, RouteConfig> = {
  beginner: {
    waypointCount: 4,
    maxRetries: 30,
    minUniqueRatio: 0.65,
    maxElevationGuidance: 50,
  },
  moderate: {
    waypointCount: 5,
    maxRetries: 30,
    minUniqueRatio: 0.70,
    maxElevationGuidance: 150,
  },
  expert: {
    waypointCount: 6,
    maxRetries: 30,
    minUniqueRatio: 0.75,
    maxElevationGuidance: 300,
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
  needsApproval?: boolean;
  variancePercent?: number;
  targetDistance?: number;
  uniquenessScore?: number;
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

function detectDeadEndPatterns(polyline: string): { deadEndCount: number; deadEndPenalty: number } {
  const points = decodePolyline(polyline);
  if (points.length < 20) return { deadEndCount: 0, deadEndPenalty: 0 };
  
  let deadEndCount = 0;
  const minSegmentLength = 10;
  const turnThreshold = 150;
  
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
      
      if (approachAngle < 45) {
        deadEndCount++;
      }
    }
  }
  
  const routeLengthKm = points.length * 0.01;
  const deadEndsPerKm = deadEndCount / Math.max(routeLengthKm, 1);
  const deadEndPenalty = Math.min(deadEndsPerKm * 0.1, 0.3);
  
  return { deadEndCount, deadEndPenalty };
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
  const targetDistance = request.targetDistance;
  const minDistance = targetDistance * 0.95;
  const maxDistance = targetDistance * 1.05;
  
  console.log(`Generating ${request.difficulty} route: target ${targetDistance}km (${minDistance.toFixed(2)}-${maxDistance.toFixed(2)}km acceptable)`);

  const estimatedCircumference = targetDistance;
  let lowerRadius = (estimatedCircumference / (2 * Math.PI)) * 0.3;
  let upperRadius = (estimatedCircumference / (2 * Math.PI)) * 2.0;
  
  let bestResult: RouteResult | null = null;
  let closestDiff = Infinity;
  let attempts = 0;
  
  const rotationAngles = [0, 45, 22.5, 67.5, 15, 30, 60, 75, 90, 120, 135, 150, 180, 210, 240, 270, 300, 330, 10, 50];
  
  for (const rotation of rotationAngles) {
    if (attempts >= config.maxRetries) break;
    
    let searchLower = lowerRadius;
    let searchUpper = upperRadius;
    
    for (let binaryStep = 0; binaryStep < 5 && attempts < config.maxRetries; binaryStep++) {
      attempts++;
      
      const testRadius = (searchLower + searchUpper) / 2;
      
      const waypoints = generatePolygonWaypoints(
        request.startLat,
        request.startLng,
        testRadius,
        config.waypointCount,
        rotation
      );

      const result = await fetchDirectionsRoute(
        { lat: request.startLat, lng: request.startLng },
        waypoints
      );

      if (!result.success) {
        console.log(`Attempt ${attempts}: API error - ${result.error} (radius: ${testRadius.toFixed(3)}km, rotation: ${rotation}°)`);
        searchLower = testRadius;
        continue;
      }

      const diff = Math.abs(result.distance - targetDistance);
      const uniqueness = calculatePathUniqueness(result.polyline);
      const { deadEndCount, deadEndPenalty } = detectDeadEndPatterns(result.polyline);
      const adjustedUniqueness = Math.max(0, uniqueness - deadEndPenalty);
      
      console.log(`Attempt ${attempts}: ${result.distance.toFixed(2)}km (target: ${targetDistance}km, diff: ${diff.toFixed(2)}km, uniqueness: ${(uniqueness * 100).toFixed(1)}%, dead-ends: ${deadEndCount}, adjusted: ${(adjustedUniqueness * 100).toFixed(1)}%, radius: ${testRadius.toFixed(3)}km, rotation: ${rotation}°)`);

      if (result.distance >= minDistance && result.distance <= maxDistance && adjustedUniqueness >= config.minUniqueRatio && deadEndCount <= 2) {
        console.log(`Found valid route on attempt ${attempts} with ${(adjustedUniqueness * 100).toFixed(1)}% uniqueness and ${deadEndCount} dead-ends`);
        return {
          success: true,
          waypoints,
          actualDistance: result.distance,
          duration: result.duration,
          polyline: result.polyline,
          attempts,
          routeName: `${targetDistance}km ${request.difficulty} Loop`,
          uniquenessScore: adjustedUniqueness,
        };
      }

      const weightedScore = diff + (adjustedUniqueness < config.minUniqueRatio ? (1 - adjustedUniqueness) * targetDistance : 0) + (deadEndCount * 0.5);
      
      if (result.distance > 0 && weightedScore < closestDiff) {
        closestDiff = weightedScore;
        bestResult = {
          success: false,
          waypoints,
          actualDistance: result.distance,
          duration: result.duration,
          polyline: result.polyline,
          attempts,
          routeName: `${targetDistance}km ${request.difficulty} Loop`,
          uniquenessScore: adjustedUniqueness,
        };
        
        if (result.distance > targetDistance) {
          searchUpper = testRadius;
        } else {
          searchLower = testRadius;
        }
        
        lowerRadius = Math.min(lowerRadius, searchLower * 0.9);
        upperRadius = Math.max(upperRadius, searchUpper * 1.1);
      } else {
        if (result.distance > targetDistance) {
          searchUpper = testRadius;
        } else {
          searchLower = testRadius;
        }
      }
    }
    
    if (bestResult && 
        Math.abs(bestResult.actualDistance - targetDistance) / targetDistance <= 0.05 &&
        (bestResult.uniquenessScore || 0) >= config.minUniqueRatio) {
      break;
    }
  }

  if (bestResult) {
    const variance = ((bestResult.actualDistance - targetDistance) / targetDistance) * 100;
    const isWithinTolerance = bestResult.actualDistance >= minDistance && bestResult.actualDistance <= maxDistance;
    const isWithinExtendedTolerance = Math.abs(variance) <= 25;
    const uniqueness = bestResult.uniquenessScore || 0;
    const { deadEndCount } = detectDeadEndPatterns(bestResult.polyline);
    const hasAcceptableDeadEnds = deadEndCount <= 2;
    
    if (isWithinTolerance && uniqueness >= config.minUniqueRatio && hasAcceptableDeadEnds) {
      console.log(`Using best route: ${bestResult.actualDistance.toFixed(2)}km (${variance.toFixed(1)}% variance, ${(uniqueness * 100).toFixed(1)}% unique, ${deadEndCount} dead-ends) - within tolerance`);
      bestResult.success = true;
      bestResult.attempts = attempts;
      return bestResult;
    } else if (isWithinTolerance && (uniqueness < config.minUniqueRatio || !hasAcceptableDeadEnds)) {
      const reason = !hasAcceptableDeadEnds ? `too many dead-ends (${deadEndCount})` : `low uniqueness (${(uniqueness * 100).toFixed(1)}%)`;
      console.log(`Best route ${bestResult.actualDistance.toFixed(2)}km has ${reason} - needs user approval`);
      return {
        success: true,
        waypoints: bestResult.waypoints,
        actualDistance: bestResult.actualDistance,
        duration: bestResult.duration,
        polyline: bestResult.polyline,
        attempts,
        routeName: `${bestResult.actualDistance.toFixed(1)}km ${request.difficulty} Loop`,
        needsApproval: true,
        variancePercent: parseFloat(variance.toFixed(1)),
        targetDistance,
        uniquenessScore: uniqueness,
      };
    } else if (isWithinExtendedTolerance && uniqueness >= config.minUniqueRatio && hasAcceptableDeadEnds) {
      console.log(`Using best route: ${bestResult.actualDistance.toFixed(2)}km (${variance.toFixed(1)}% variance, ${(uniqueness * 100).toFixed(1)}% unique, ${deadEndCount} dead-ends) - within extended tolerance`);
      bestResult.success = true;
      bestResult.attempts = attempts;
      bestResult.routeName = `${bestResult.actualDistance.toFixed(1)}km ${request.difficulty} Loop`;
      return bestResult;
    } else {
      console.log(`Best route ${bestResult.actualDistance.toFixed(2)}km exceeds tolerance (${variance.toFixed(1)}% variance) - needs user approval`);
      return {
        success: true,
        waypoints: bestResult.waypoints,
        actualDistance: bestResult.actualDistance,
        duration: bestResult.duration,
        polyline: bestResult.polyline,
        attempts,
        routeName: `${bestResult.actualDistance.toFixed(1)}km ${request.difficulty} Loop`,
        needsApproval: true,
        variancePercent: parseFloat(variance.toFixed(1)),
        targetDistance,
        uniquenessScore: uniqueness,
      };
    }
  }

  return {
    success: false,
    waypoints: [],
    actualDistance: 0,
    duration: 0,
    polyline: "",
    attempts,
    routeName: "",
    error: "Could not generate a valid route",
  };
}
