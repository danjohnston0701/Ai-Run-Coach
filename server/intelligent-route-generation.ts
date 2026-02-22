/**
 * Intelligent Route Generation Service
 * 
 * Uses GraphHopper API + Overpass API (OSM) to generate high-quality SCENIC running routes
 * 
 * ROUTE QUALITY RULES (Feb 22, 2026 v3 — Scenic):
 * ✅ Uses 'hike' profile (prefers trails, paths, parks over city streets)
 * ✅ Queries Overpass API for nearby parks, rivers, trails, coastline, green spaces
 * ✅ Generates scenic waypoint-based loop routes THROUGH parks/rivers/trails
 * ✅ Uses POST API with custom_model to heavily penalise residential/tertiary streets
 * ✅ Avoids highways, motorways, and major roads
 * ✅ Validates distance within ±25% of target
 * ✅ Detects and rejects routes with 180° U-turns (macro-level)
 * ✅ Prevents repeated segments (backtracking < 25%)
 * ✅ Detects parallel road out-and-back (proximity-based)
 * ✅ Enforces genuine circular routes (loop quality > 70%)
 * ✅ Measures route shape compactness (rejects elongated out-and-back shapes)
 * ✅ Measures angular spread from start (routes should explore multiple directions)
 * ✅ Generates 6 round_trip + 4 scenic waypoint candidates, returns top 3 diverse
 * ✅ Scores: Scenic (20%) + Shape (20%) + Quality (20%) + Backtrack (15%) + Popularity (10%) + Loop (15%)
 */

import axios from "axios";
import { getRoutePopularityScore, analyzeRouteCharacteristics } from "./osm-segment-intelligence";

const GRAPHHOPPER_API_KEY = process.env.GRAPHHOPPER_API_KEY || "";
const GRAPHHOPPER_BASE_URL = "https://graphhopper.com/api/1";
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

// ==================== TYPES ====================

interface RouteRequest {
  latitude: number;
  longitude: number;
  distanceKm: number;
  preferTrails?: boolean;
  avoidHills?: boolean;
}

interface ScenicFeature {
  type: 'park' | 'river' | 'trail' | 'coastline' | 'lake' | 'green_space' | 'footpath';
  name: string;
  lat: number;
  lng: number;
  bearing: number; // bearing from start point
  distance: number; // km from start point
}

interface RoadClassAnalysis {
  hasHighways: boolean;
  highwayPercentage: number;
  trailPercentage: number;
  pathPercentage: number;
  residentialPercentage: number;
  terrainScore: number; // 0-1, higher = more trails/paths
}

interface GeneratedRoute {
  id: string;
  polyline: string; // Encoded polyline
  coordinates: Array<[number, number]>; // [[lng, lat], ...]
  distance: number; // meters
  elevationGain: number; // meters
  elevationLoss: number; // meters
  duration: number; // seconds (estimated)
  difficulty: string; // "easy", "moderate", "hard"
  popularityScore: number; // 0-1
  qualityScore: number; // 0-1
  turnInstructions: TurnInstruction[];
}

interface TurnInstruction {
  text: string;
  distance: number;
  time: number;
  interval: [number, number];
  sign: number;
}

interface ValidationResult {
  isValid: boolean;
  issues: Array<{
    type: 'U_TURN' | 'REPEATED_SEGMENT' | 'DEAD_END' | 'HIGHWAY' | 'DISTANCE_MISMATCH';
    location: [number, number];
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  qualityScore: number;
}

// ==================== OVERPASS API — SCENIC FEATURE DISCOVERY ====================

/**
 * Query Overpass API to find scenic features near a location
 * Returns parks, rivers, trails, coastline, lakes, green spaces
 */
async function findScenicFeatures(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<ScenicFeature[]> {
  try {
    const query = `
      [out:json][timeout:10];
      (
        way["leisure"="park"](around:${radiusMeters},${lat},${lng});
        relation["leisure"="park"](around:${radiusMeters},${lat},${lng});
        way["waterway"="river"](around:${radiusMeters},${lat},${lng});
        way["waterway"="stream"](around:${radiusMeters},${lat},${lng});
        way["natural"="water"](around:${radiusMeters},${lat},${lng});
        way["natural"="coastline"](around:${radiusMeters},${lat},${lng});
        way["leisure"="nature_reserve"](around:${radiusMeters},${lat},${lng});
        relation["leisure"="nature_reserve"](around:${radiusMeters},${lat},${lng});
        relation["boundary"="national_park"](around:${radiusMeters},${lat},${lng});
        way["leisure"="garden"]["access"!="private"](around:${radiusMeters},${lat},${lng});
        way["landuse"="recreation_ground"](around:${radiusMeters},${lat},${lng});
        way["highway"="path"]["name"](around:${radiusMeters},${lat},${lng});
        way["highway"="footway"]["name"](around:${radiusMeters},${lat},${lng});
        way["highway"="cycleway"]["name"](around:${radiusMeters},${lat},${lng});
        way["route"="hiking"](around:${radiusMeters},${lat},${lng});
      );
      out center;
    `;

    const response = await axios.post(OVERPASS_API_URL, `data=${encodeURIComponent(query)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 12000,
    });

    const elements = response.data?.elements || [];
    const features: ScenicFeature[] = [];
    const seenLocations = new Set<string>(); // Deduplicate nearby features

    for (const el of elements) {
      // Get center coordinates (Overpass returns center for ways/relations with "out center")
      const elLat = el.center?.lat || el.lat;
      const elLng = el.center?.lon || el.lon;
      if (!elLat || !elLng) continue;

      // Deduplicate: skip if we already have a feature within 100m
      const gridKey = `${Math.round(elLat * 100)},${Math.round(elLng * 100)}`;
      if (seenLocations.has(gridKey)) continue;
      seenLocations.add(gridKey);

      const tags = el.tags || {};
      const name = tags.name || tags['name:en'] || '';

      let type: ScenicFeature['type'] = 'green_space';
      if (tags.leisure === 'park' || tags.leisure === 'garden') type = 'park';
      else if (tags.waterway === 'river' || tags.waterway === 'stream') type = 'river';
      else if (tags.natural === 'water') type = 'lake';
      else if (tags.natural === 'coastline') type = 'coastline';
      else if (tags.leisure === 'nature_reserve' || tags.boundary === 'national_park') type = 'trail';
      else if (tags.highway === 'path' || tags.highway === 'footway' || tags.highway === 'cycleway') type = 'footpath';
      else if (tags.route === 'hiking') type = 'trail';

      const bearing = calculateBearing([lng, lat], [elLng, elLat]);
      const distance = getDistanceKm({ lat, lng }, { lat: elLat, lng: elLng });

      // Skip features that are too close to start (< 200m) or too far
      if (distance < 0.2 || distance > radiusMeters / 1000) continue;

      features.push({ type, name, lat: elLat, lng: elLng, bearing, distance });
    }

    console.log(`🌳 Found ${features.length} scenic features within ${radiusMeters}m (${elements.length} raw OSM elements)`);
    if (features.length > 0) {
      const typeBreakdown = features.reduce((acc, f) => { acc[f.type] = (acc[f.type] || 0) + 1; return acc; }, {} as Record<string, number>);
      console.log(`   Types: ${JSON.stringify(typeBreakdown)}`);
    }

    return features;
  } catch (error: any) {
    console.warn(`⚠️ Overpass API failed (non-fatal): ${error.message}`);
    return []; // Non-fatal — fall back to round_trip routes
  }
}

/**
 * Select scenic waypoints that form a good loop around the start point
 * Picks 3-4 features spread across different bearings to create a circuit
 */
function selectScenicWaypoints(
  features: ScenicFeature[],
  startLat: number,
  startLng: number,
  targetDistanceKm: number
): Array<{ lat: number; lng: number; name: string; type: string }> {
  if (features.length === 0) return [];

  // Target radius from start: roughly targetDistance / (2*pi) for a circular route
  const idealRadius = targetDistanceKm / (2 * Math.PI);
  // Allow features from 30% to 120% of ideal radius
  const minDist = idealRadius * 0.3;
  const maxDist = idealRadius * 1.2;

  // Filter features to reasonable distance range
  const inRange = features.filter(f => f.distance >= minDist && f.distance <= maxDist);
  
  // If not enough in ideal range, widen to all features
  const pool = inRange.length >= 3 ? inRange : features;

  // Prioritize: parks > rivers > trails > lakes > coastline > footpaths > green_space
  const typePriority: Record<string, number> = {
    park: 5, river: 4, trail: 4, coastline: 4, lake: 3, footpath: 2, green_space: 1,
  };
  const sortedPool = [...pool].sort((a, b) => (typePriority[b.type] || 0) - (typePriority[a.type] || 0));

  // Select waypoints spread across different compass sectors (every ~90°)
  // Divide compass into 4 quadrants and pick the best feature from each
  const quadrants: Array<ScenicFeature | null> = [null, null, null, null];
  
  for (const feature of sortedPool) {
    const quadrant = Math.floor(feature.bearing / 90) % 4;
    if (!quadrants[quadrant]) {
      quadrants[quadrant] = feature;
    }
  }

  const selectedFeatures = quadrants.filter(Boolean) as ScenicFeature[];
  
  if (selectedFeatures.length < 2) {
    // Not enough spread — just pick top 3 by priority
    return sortedPool.slice(0, 3).map(f => ({
      lat: f.lat, lng: f.lng, name: f.name || f.type, type: f.type,
    }));
  }

  // Order waypoints by bearing (clockwise) to form a natural loop
  selectedFeatures.sort((a, b) => a.bearing - b.bearing);

  return selectedFeatures.map(f => ({
    lat: f.lat, lng: f.lng, name: f.name || f.type, type: f.type,
  }));
}

// ==================== GRAPHHOPPER API ====================

/**
 * Generate a round-trip route using GraphHopper with hike profile
 * Uses POST with custom_model to prefer scenic roads, with GET fallback
 */
async function generateGraphHopperRoute(
  lat: number,
  lng: number,
  distanceMeters: number,
  seed: number = 0,
  preferScenic: boolean = true
): Promise<any> {
  // Try POST with custom_model first (prefers trails, penalises streets)
  if (preferScenic) {
    try {
      return await generateGraphHopperRoutePost(lat, lng, distanceMeters, seed);
    } catch (error: any) {
      // custom_model may not be available on free tier — fall back to GET with hike profile
      console.log(`POST with custom_model failed, falling back to GET: ${error.message}`);
    }
  }

  // Fallback: GET with hike profile (still better than foot for scenic routes)
  return await generateGraphHopperRouteGet(lat, lng, distanceMeters, 'hike', seed);
}

/**
 * POST route request with custom_model for scenic preferences
 */
async function generateGraphHopperRoutePost(
  lat: number,
  lng: number,
  distanceMeters: number,
  seed: number
): Promise<any> {
  const body = {
    points: [[lng, lat]],
    profile: "hike",
    algorithm: "round_trip",
    "round_trip.distance": distanceMeters,
    "round_trip.seed": seed,
    points_encoded: false,
    elevation: true,
    instructions: true,
    details: ["road_class", "surface"],
    "ch.disable": true,
    custom_model: {
      priority: [
        // BOOST scenic road types (trails, paths, cycleways)
        { if: "road_class == TRACK", multiply_by: 3.0 },
        { if: "road_class == PATH", multiply_by: 3.0 },
        { if: "road_class == FOOTWAY", multiply_by: 2.5 },
        { if: "road_class == CYCLEWAY", multiply_by: 2.0 },
        // PENALISE city streets
        { if: "road_class == RESIDENTIAL", multiply_by: 0.4 },
        { if: "road_class == TERTIARY", multiply_by: 0.3 },
        { if: "road_class == SECONDARY", multiply_by: 0.2 },
        { if: "road_class == PRIMARY", multiply_by: 0.1 },
        { if: "road_class == TRUNK", multiply_by: 0.05 },
        { if: "road_class == MOTORWAY", multiply_by: 0.01 },
        // Prefer unpaved / natural surfaces
        { if: "surface == GRAVEL", multiply_by: 1.5 },
        { if: "surface == DIRT", multiply_by: 1.5 },
        { if: "surface == GRASS", multiply_by: 1.3 },
      ],
    },
  };

  const response = await axios.post(`${GRAPHHOPPER_BASE_URL}/route?key=${GRAPHHOPPER_API_KEY}`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  return response.data;
}

/**
 * GET route request (fallback — no custom_model, but uses hike profile)
 */
async function generateGraphHopperRouteGet(
  lat: number,
  lng: number,
  distanceMeters: number,
  profile: 'foot' | 'hike' | 'bike',
  seed: number
): Promise<any> {
  const response = await axios.get(`${GRAPHHOPPER_BASE_URL}/route`, {
    params: {
      point: `${lat},${lng}`,
      profile: profile,
      algorithm: 'round_trip',
      'round_trip.distance': distanceMeters,
      'round_trip.seed': seed,
      points_encoded: false,
      elevation: true,
      instructions: true,
      details: ['road_class', 'surface'],
      key: GRAPHHOPPER_API_KEY,
    },
    timeout: 30000,
  });

  return response.data;
}

/**
 * Generate a scenic loop route through specific waypoints
 * Routes: start → waypoint1 → waypoint2 → ... → start
 */
async function generateScenicWaypointRoute(
  startLat: number,
  startLng: number,
  waypoints: Array<{ lat: number; lng: number; name: string; type: string }>
): Promise<any> {
  if (waypoints.length === 0) throw new Error("No waypoints provided");

  // Build point list: start → waypoints → start (loop)
  const points: Array<[number, number]> = [
    [startLng, startLat],
    ...waypoints.map(w => [w.lng, w.lat] as [number, number]),
    [startLng, startLat], // Close the loop
  ];

  // Try POST with custom_model for scenic preferences
  try {
    const body: any = {
      points,
      profile: "hike",
      points_encoded: false,
      elevation: true,
      instructions: true,
      details: ["road_class", "surface"],
      "ch.disable": true,
      custom_model: {
        priority: [
          { if: "road_class == TRACK", multiply_by: 3.0 },
          { if: "road_class == PATH", multiply_by: 3.0 },
          { if: "road_class == FOOTWAY", multiply_by: 2.5 },
          { if: "road_class == CYCLEWAY", multiply_by: 2.0 },
          { if: "road_class == RESIDENTIAL", multiply_by: 0.4 },
          { if: "road_class == TERTIARY", multiply_by: 0.3 },
          { if: "road_class == SECONDARY", multiply_by: 0.2 },
          { if: "road_class == PRIMARY", multiply_by: 0.1 },
        ],
      },
    };

    const response = await axios.post(`${GRAPHHOPPER_BASE_URL}/route?key=${GRAPHHOPPER_API_KEY}`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    return response.data;
  } catch (postError: any) {
    // Fallback: use GET with multiple point params and hike profile
    console.log(`Scenic POST failed, trying GET fallback: ${postError.message}`);
    
    const params: any = {
      profile: 'hike',
      points_encoded: false,
      elevation: true,
      instructions: true,
      details: ['road_class', 'surface'],
      key: GRAPHHOPPER_API_KEY,
    };

    // GraphHopper GET accepts multiple 'point' params
    const pointParams = points.map(p => `point=${p[1]},${p[0]}`).join('&');
    
    const response = await axios.get(
      `${GRAPHHOPPER_BASE_URL}/route?${pointParams}`,
      { params, timeout: 30000 }
    );

    return response.data;
  }
}

// ==================== ROAD CLASS ANALYSIS ====================

/**
 * Analyze road classes from GraphHopper details
 */
function analyzeRoadClasses(roadClassDetails: any[]): RoadClassAnalysis {
  if (!roadClassDetails || roadClassDetails.length === 0) {
    return {
      hasHighways: false,
      highwayPercentage: 0,
      trailPercentage: 0,
      pathPercentage: 0,
      residentialPercentage: 0,
      terrainScore: 0.5,
    };
  }
  
  let totalSegments = 0;
  let highwaySegments = 0;
  let trailSegments = 0;
  let pathSegments = 0;
  let residentialSegments = 0;
  
  for (const detail of roadClassDetails) {
    const [startIdx, endIdx, roadClass] = detail;
    const segmentLength = endIdx - startIdx;
    totalSegments += segmentLength;
    
    const rc = (roadClass || '').toLowerCase();
    
    if (rc.includes('motorway') || rc.includes('trunk') || rc.includes('primary')) {
      highwaySegments += segmentLength;
    }
    if (rc.includes('residential') || rc.includes('tertiary') || rc.includes('secondary')) {
      residentialSegments += segmentLength;
    }
    if (rc.includes('track') || rc.includes('trail')) {
      trailSegments += segmentLength;
    }
    if (rc.includes('path') || rc.includes('footway') || rc.includes('cycleway')) {
      pathSegments += segmentLength;
    }
  }
  
  const highwayPercentage = totalSegments > 0 ? (highwaySegments / totalSegments) : 0;
  const trailPercentage = totalSegments > 0 ? (trailSegments / totalSegments) : 0;
  const pathPercentage = totalSegments > 0 ? (pathSegments / totalSegments) : 0;
  const residentialPercentage = totalSegments > 0 ? (residentialSegments / totalSegments) : 0;
  
  // Scenic terrain score: high when trails/paths, low when residential/highway
  const terrainScore = Math.max(0, Math.min(1, 
    (trailPercentage + pathPercentage) * 1.5 - residentialPercentage * 0.5 - highwayPercentage * 2.0
  ));
  
  return {
    hasHighways: highwayPercentage > 0.1,
    highwayPercentage,
    trailPercentage,
    pathPercentage,
    residentialPercentage,
    terrainScore,
  };
}

// ==================== VALIDATION ====================

/**
 * Validate route for dead ends, U-turns, backtracking, highways, and distance
 */
function validateRoute(
  coordinates: Array<[number, number]>,
  actualDistanceMeters: number,
  targetDistanceMeters: number,
  roadClassDetails?: any[]
): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  
  if (coordinates.length < 3) {
    return { isValid: false, issues: [], qualityScore: 0 };
  }
  
  // Distance tolerance ±25% (slightly wider for scenic routes which may need to detour)
  const distanceDiffPercent = Math.abs(actualDistanceMeters - targetDistanceMeters) / targetDistanceMeters;
  if (distanceDiffPercent > 0.25) {
    issues.push({
      type: 'DISTANCE_MISMATCH',
      location: coordinates[0],
      severity: 'HIGH',
    });
    console.log(`⚠️ Distance mismatch: ${(distanceDiffPercent * 100).toFixed(1)}% off target`);
  }
  
  // Macro U-turn detection
  const sampleInterval = Math.max(1, Math.floor(coordinates.length / 50));
  const sampledCoords: Array<[number, number]> = [];
  for (let i = 0; i < coordinates.length; i += sampleInterval) {
    sampledCoords.push(coordinates[i]);
  }
  if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
    sampledCoords.push(coordinates[coordinates.length - 1]);
  }
  
  for (let i = 1; i < sampledCoords.length - 1; i++) {
    const angle = calculateAngle(sampledCoords[i - 1], sampledCoords[i], sampledCoords[i + 1]);
    if (angle > 150) {
      issues.push({ type: 'U_TURN', location: sampledCoords[i], severity: 'HIGH' });
    }
  }
  
  // Repeated segments
  const segmentSet = new Set<string>();
  for (let i = 0; i < coordinates.length - 1; i++) {
    const seg = `${coordinates[i][0].toFixed(4)},${coordinates[i][1].toFixed(4)}-${coordinates[i + 1][0].toFixed(4)},${coordinates[i + 1][1].toFixed(4)}`;
    if (segmentSet.has(seg)) {
      issues.push({ type: 'REPEATED_SEGMENT', location: coordinates[i], severity: 'MEDIUM' });
    }
    segmentSet.add(seg);
  }
  
  // Highways
  if (roadClassDetails) {
    const ra = analyzeRoadClasses(roadClassDetails);
    if (ra.hasHighways) {
      issues.push({
        type: 'HIGHWAY',
        location: coordinates[0],
        severity: ra.highwayPercentage > 0.3 ? 'HIGH' : 'MEDIUM',
      });
    }
  }
  
  const highIssues = issues.filter(i => i.severity === 'HIGH').length;
  const mediumIssues = issues.filter(i => i.severity === 'MEDIUM').length;
  const qualityScore = Math.max(0, 1 - (highIssues * 0.3 + mediumIssues * 0.1));
  const isValid = highIssues < 2;
  
  return { isValid, issues, qualityScore };
}

// ==================== GEOMETRY HELPERS ====================

function calculateAngle(p1: [number, number], p2: [number, number], p3: [number, number]): number {
  const b1 = calculateBearing(p1, p2);
  const b2 = calculateBearing(p2, p3);
  let angle = Math.abs(b2 - b1);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

function calculateBearing(p1: [number, number], p2: [number, number]): number {
  const [lng1, lat1] = p1;
  const [lng2, lat2] = p2;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function getDistanceKm(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateDifficulty(distanceKm: number, elevationGainM: number): string {
  const elevPerKm = elevationGainM / distanceKm;
  if (elevPerKm < 10 && distanceKm < 8) return 'easy';
  if (elevPerKm < 25 && distanceKm < 15) return 'moderate';
  return 'hard';
}

// ==================== SHAPE & QUALITY ANALYSIS ====================

function calculateCompactness(coordinates: Array<[number, number]>, startLat: number): number {
  if (coordinates.length < 10) return 0;
  
  let area = 0;
  const n = coordinates.length;
  const cosLat = Math.cos(startLat * Math.PI / 180);
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = (coordinates[i][0] - coordinates[0][0]) * 111320 * cosLat;
    const y1 = (coordinates[i][1] - coordinates[0][1]) * 110540;
    const x2 = (coordinates[j][0] - coordinates[0][0]) * 111320 * cosLat;
    const y2 = (coordinates[j][1] - coordinates[0][1]) * 110540;
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;
  
  let perimeter = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const dx = (coordinates[i + 1][0] - coordinates[i][0]) * 111320 * cosLat;
    const dy = (coordinates[i + 1][1] - coordinates[i][1]) * 110540;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  
  if (perimeter === 0) return 0;
  const circleRatio = (4 * Math.PI * area) / (perimeter * perimeter);
  return Math.min(1, circleRatio / 0.10);
}

function calculateAngularSpread(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 10) return 0;
  const startPoint: [number, number] = [startLng, startLat];
  const cosLat = Math.cos(startLat * Math.PI / 180);
  const sampleInterval = Math.max(1, Math.floor(coordinates.length / 20));
  const bearings: number[] = [];
  
  for (let i = sampleInterval; i < coordinates.length - sampleInterval; i += sampleInterval) {
    const dx = (coordinates[i][0] - startPoint[0]) * 111320 * cosLat;
    const dy = (coordinates[i][1] - startPoint[1]) * 110540;
    if (Math.sqrt(dx * dx + dy * dy) > 100) {
      bearings.push(calculateBearing(startPoint, coordinates[i]));
    }
  }
  
  if (bearings.length < 3) return 0;
  const sectors = new Set<number>();
  for (const b of bearings) sectors.add(Math.floor(b / 45));
  return sectors.size / 8;
}

function calculateProximityOverlap(
  coordinates: Array<[number, number]>,
  startLat: number,
  startLng: number
): number {
  if (coordinates.length < 20) return 0;
  
  const PROX_M = 60;
  const EXCL_M = 150;
  const cosLat = Math.cos(startLat * Math.PI / 180);
  
  const sampleInterval = Math.max(1, Math.floor(coordinates.length / 100));
  const sampled: Array<{ c: [number, number]; p: number }> = [];
  for (let i = 0; i < coordinates.length; i += sampleInterval) {
    sampled.push({ c: coordinates[i], p: i / coordinates.length });
  }
  
  let overlapCount = 0;
  let totalChecks = 0;
  
  for (let i = 0; i < sampled.length; i++) {
    const dx0 = (sampled[i].c[0] - startLng) * 111320 * cosLat;
    const dy0 = (sampled[i].c[1] - startLat) * 110540;
    if (Math.sqrt(dx0 * dx0 + dy0 * dy0) < EXCL_M) continue;
    
    for (let j = i + 1; j < sampled.length; j++) {
      if (Math.abs(sampled[j].p - sampled[i].p) < 0.30) continue;
      const dx1 = (sampled[j].c[0] - startLng) * 111320 * cosLat;
      const dy1 = (sampled[j].c[1] - startLat) * 110540;
      if (Math.sqrt(dx1 * dx1 + dy1 * dy1) < EXCL_M) continue;
      
      totalChecks++;
      const dx = (sampled[j].c[0] - sampled[i].c[0]) * 111320 * cosLat;
      const dy = (sampled[j].c[1] - sampled[i].c[1]) * 110540;
      if (Math.sqrt(dx * dx + dy * dy) < PROX_M) overlapCount++;
    }
  }
  
  return totalChecks > 0 ? overlapCount / totalChecks : 0;
}

function calculateLoopQuality(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 2) return 0;
  const endPoint = { lat: coordinates[coordinates.length - 1][1], lng: coordinates[coordinates.length - 1][0] };
  const distKm = getDistanceKm({ lat: startLat, lng: startLng }, endPoint);
  return Math.max(0, 1 - (distKm / 1.0));
}

function calculateBacktrackRatio(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 10) return 0;
  const gridSize = 0.0003;
  const segmentSet = new Set<string>();
  let total = 0;
  let backtrack = 0;
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const g1 = `${Math.round(coordinates[i][0] / gridSize)},${Math.round(coordinates[i][1] / gridSize)}`;
    const g2 = `${Math.round(coordinates[i + 1][0] / gridSize)},${Math.round(coordinates[i + 1][1] / gridSize)}`;
    if (g1 !== g2) {
      total++;
      if (segmentSet.has(`${g2}-${g1}`)) backtrack++;
      segmentSet.add(`${g1}-${g2}`);
    }
  }
  return total > 0 ? backtrack / total : 0;
}

function calculateRouteDiversity(
  a: Array<[number, number]>,
  b: Array<[number, number]>,
  startLat: number,
  startLng: number
): number {
  const sp: [number, number] = [startLng, startLat];
  
  function dominant(coords: Array<[number, number]>): number {
    const s = Math.floor(coords.length * 0.2);
    const e = Math.floor(coords.length * 0.6);
    const step = Math.max(1, Math.floor((e - s) / 10));
    let sinS = 0, cosS = 0, c = 0;
    for (let i = s; i < e; i += step) {
      const br = calculateBearing(sp, coords[i]);
      sinS += Math.sin(br * Math.PI / 180);
      cosS += Math.cos(br * Math.PI / 180);
      c++;
    }
    if (c === 0) return 0;
    return (Math.atan2(sinS / c, cosS / c) * 180 / Math.PI + 360) % 360;
  }
  
  let diff = Math.abs(dominant(a) - dominant(b));
  if (diff > 180) diff = 360 - diff;
  return diff / 180;
}

// ==================== MAIN ROUTE GENERATION ====================

/**
 * Generate multiple route candidates and return top 3
 * Combines scenic waypoint routes with round-trip routes
 */
export async function generateIntelligentRoute(
  request: RouteRequest
): Promise<GeneratedRoute[]> {
  const { latitude, longitude, distanceKm, preferTrails = true } = request;
  const distanceMeters = distanceKm * 1000;
  
  if (!GRAPHHOPPER_API_KEY) {
    throw new Error("GRAPHHOPPER_API_KEY is not set in environment variables");
  }
  
  console.log(`🗺️ Generating ${distanceKm}km scenic route at (${latitude}, ${longitude})`);
  
  // =====================================================
  // STEP 1: Discover scenic features via Overpass API
  // =====================================================
  const searchRadius = Math.max(1500, Math.min(5000, distanceKm * 500)); // 1.5-5km radius
  const scenicFeatures = await findScenicFeatures(latitude, longitude, searchRadius);
  const scenicWaypoints = selectScenicWaypoints(scenicFeatures, latitude, longitude, distanceKm);
  
  if (scenicWaypoints.length > 0) {
    console.log(`🌳 Selected ${scenicWaypoints.length} scenic waypoints:`);
    scenicWaypoints.forEach((w, i) => console.log(`   ${i + 1}. ${w.name} (${w.type}) at (${w.lat.toFixed(4)}, ${w.lng.toFixed(4)})`));
  } else {
    console.log(`⚠️ No scenic features found nearby, using round-trip only`);
  }

  // =====================================================
  // STEP 2: Generate candidates in parallel
  // =====================================================
  const candidates: Array<{
    route: any;
    validation: ValidationResult;
    popularityScore: number;
    terrainScore: number;
    loopQuality: number;
    backtrackRatio: number;
    compactness: number;
    angularSpread: number;
    proximityOverlap: number;
    coordinates: Array<[number, number]>;
    isScenic: boolean;
  }> = [];

  const baseSeed = Math.floor(Math.random() * 1000);
  const seedOffsets = [0, 17, 37, 53, 71, 89];
  
  // A) Round-trip candidates (6 attempts with hike profile)
  console.log(`🔄 Generating ${seedOffsets.length} round-trip candidates (hike profile)...`);
  const roundTripPromises = seedOffsets.map(async (offset) => {
    const seed = baseSeed + offset;
    try {
      const ghResponse = await generateGraphHopperRoute(latitude, longitude, distanceMeters, seed, preferTrails);
      return { seed, ghResponse, isScenic: false };
    } catch (error: any) {
      console.error(`Seed ${seed} failed: ${error.message}`);
      return { seed, ghResponse: null, isScenic: false };
    }
  });

  // B) Scenic waypoint candidates (up to 4 variations if waypoints available)
  const scenicPromises: Promise<{ seed: number; ghResponse: any; isScenic: boolean }>[] = [];
  
  if (scenicWaypoints.length >= 2) {
    console.log(`🌿 Generating scenic waypoint route candidates...`);
    
    // Variation 1: All waypoints
    scenicPromises.push((async () => {
      try {
        const ghResponse = await generateScenicWaypointRoute(latitude, longitude, scenicWaypoints);
        return { seed: -1, ghResponse, isScenic: true };
      } catch (error: any) {
        console.error(`Scenic route (all waypoints) failed: ${error.message}`);
        return { seed: -1, ghResponse: null, isScenic: true };
      }
    })());
    
    // Variation 2: Reversed waypoint order (opposite direction loop)
    scenicPromises.push((async () => {
      try {
        const reversed = [...scenicWaypoints].reverse();
        const ghResponse = await generateScenicWaypointRoute(latitude, longitude, reversed);
        return { seed: -2, ghResponse, isScenic: true };
      } catch (error: any) {
        console.error(`Scenic route (reversed) failed: ${error.message}`);
        return { seed: -2, ghResponse: null, isScenic: true };
      }
    })());

    // Variation 3: Subset of waypoints (first half)
    if (scenicWaypoints.length >= 3) {
      scenicPromises.push((async () => {
        try {
          const subset = scenicWaypoints.filter((_, i) => i % 2 === 0);
          if (subset.length >= 2) {
            const ghResponse = await generateScenicWaypointRoute(latitude, longitude, subset);
            return { seed: -3, ghResponse, isScenic: true };
          }
          return { seed: -3, ghResponse: null, isScenic: true };
        } catch (error: any) {
          return { seed: -3, ghResponse: null, isScenic: true };
        }
      })());
    }
  }

  // Fire all requests in parallel
  const allResults = await Promise.all([...roundTripPromises, ...scenicPromises]);

  // =====================================================
  // STEP 3: Process and validate all candidates
  // =====================================================
  for (const { seed, ghResponse, isScenic } of allResults) {
    if (!ghResponse?.paths?.length) {
      console.log(`${isScenic ? 'Scenic' : `Seed ${seed}`}: No route found`);
      continue;
    }
    
    const path = ghResponse.paths[0];
    let coordinates = path.points.coordinates as Array<[number, number]>;
    
    const loopQuality = calculateLoopQuality(coordinates, latitude, longitude);
    const backtrackRatio = calculateBacktrackRatio(coordinates);
    
    const label = isScenic ? `Scenic(${seed})` : `Seed ${seed}`;
    console.log(`${label}: Loop=${loopQuality.toFixed(2)}, Backtrack=${backtrackRatio.toFixed(2)}, Dist=${path.distance}m`);

    // Scenic waypoint routes get slightly more lenient loop quality check
    // (they're explicitly designed as start→...→start loops)
    const minLoopQuality = isScenic ? 0.5 : 0.7;
    if (loopQuality < minLoopQuality) {
      console.log(`${label}: Rejected - poor loop quality (${loopQuality.toFixed(2)} < ${minLoopQuality})`);
      continue;
    }
    if (backtrackRatio > 0.25) {
      console.log(`${label}: Rejected - backtracking (${backtrackRatio.toFixed(2)})`);
      continue;
    }
    
    const compactness = calculateCompactness(coordinates, latitude);
    const angularSpread = calculateAngularSpread(coordinates, latitude, longitude);
    const proximityOverlap = calculateProximityOverlap(coordinates, latitude, longitude);
    
    console.log(`${label}: Shape - compact=${compactness.toFixed(2)}, spread=${angularSpread.toFixed(2)}, overlap=${proximityOverlap.toFixed(2)}`);
    
    if (proximityOverlap > 0.25) {
      console.log(`${label}: Rejected - proximity overlap`);
      continue;
    }
    // Scenic routes get more lenient compactness (they may be elongated to reach a park)
    if (!isScenic && compactness < 0.15) {
      console.log(`${label}: Rejected - too elongated`);
      continue;
    }
    if (!isScenic && angularSpread < 0.25) {
      console.log(`${label}: Rejected - poor angular spread`);
      continue;
    }
    
    // Force circular
    if (coordinates.length > 0) {
      const sp: [number, number] = [longitude, latitude];
      coordinates[0] = sp;
      coordinates[coordinates.length - 1] = sp;
    }

    const roadClassDetails = path.details?.road_class || [];
    const roadAnalysis = analyzeRoadClasses(roadClassDetails);
    
    console.log(`${label}: Terrain - trails=${(roadAnalysis.trailPercentage * 100).toFixed(1)}%, paths=${(roadAnalysis.pathPercentage * 100).toFixed(1)}%, residential=${(roadAnalysis.residentialPercentage * 100).toFixed(1)}%`);
    
    const validation = validateRoute(coordinates, path.distance, distanceMeters, roadClassDetails);
    if (!validation.isValid) {
      console.log(`${label}: Rejected - invalid route`);
      continue;
    }
    
    const popularityScore = await getRoutePopularityScore(coordinates);

    candidates.push({
      route: path,
      validation,
      popularityScore,
      terrainScore: roadAnalysis.terrainScore,
      loopQuality,
      backtrackRatio,
      compactness,
      angularSpread,
      proximityOverlap,
      coordinates,
      isScenic,
    });
  }
  
  if (candidates.length === 0) {
    throw new Error("Could not generate a valid route. Try a different location or distance.");
  }
  
  console.log(`📊 ${candidates.length} valid candidates (${candidates.filter(c => c.isScenic).length} scenic, ${candidates.filter(c => !c.isScenic).length} round-trip)`);

  // =====================================================
  // STEP 4: Score and select top 3 diverse routes
  // =====================================================
  const scored = candidates.map((c) => {
    const shapeScore = Math.max(0,
      c.compactness * 0.4 + c.angularSpread * 0.4 - c.proximityOverlap * 0.8
    );
    
    // Scenic bonus: routes that use more trails/paths and less residential get a boost
    const scenicScore = c.terrainScore + (c.isScenic ? 0.3 : 0); // Scenic waypoint routes get a bonus
    
    // Scoring: Scenic (20%) + Shape (20%) + Quality (20%) + Backtrack (15%) + Loop (15%) + Popularity (10%)
    let totalScore = 
      Math.min(1, scenicScore) * 0.20 +
      shapeScore * 0.20 +
      c.validation.qualityScore * 0.20 +
      (1 - c.backtrackRatio) * 0.15 +
      c.loopQuality * 0.15 +
      c.popularityScore * 0.10;
    
    console.log(`  ${c.isScenic ? '🌿' : '🔄'} scenic=${scenicScore.toFixed(2)}, shape=${shapeScore.toFixed(2)}, quality=${c.validation.qualityScore.toFixed(2)}, backtrack=${c.backtrackRatio.toFixed(2)}, terrain=${c.terrainScore.toFixed(2)} → TOTAL=${totalScore.toFixed(3)}`);
    
    return { ...c, totalScore, shapeScore, scenicScore };
  });
  
  scored.sort((a, b) => b.totalScore - a.totalScore);
  
  // Select top 3 with diversity enforcement
  const selected: typeof scored = [];
  for (const candidate of scored) {
    if (selected.length >= 3) break;
    
    let diverse = true;
    for (const sel of selected) {
      if (calculateRouteDiversity(candidate.coordinates, sel.coordinates, latitude, longitude) < 0.15) {
        diverse = false;
        break;
      }
    }
    if (diverse) selected.push(candidate);
  }
  
  // Fill remaining slots
  if (selected.length < 3) {
    for (const c of scored) {
      if (selected.length >= 3) break;
      if (!selected.includes(c)) selected.push(c);
    }
  }
  
  console.log(`✅ Returning ${selected.length} routes (${selected.filter(s => s.isScenic).length} scenic)`);
  
  return selected.map((candidate, index) => {
    const route = candidate.route;
    const difficulty = calculateDifficulty(route.distance / 1000, route.ascend || 0);
    
    console.log(`  Route ${index + 1}: ${(route.distance / 1000).toFixed(2)}km ${candidate.isScenic ? '🌿' : '🔄'}, Score=${candidate.totalScore.toFixed(2)}, Scenic=${candidate.scenicScore.toFixed(2)}, Shape=${candidate.shapeScore.toFixed(2)}`);
    
    return {
      id: generateRouteId(),
      polyline: encodePolyline(route.points.coordinates),
      coordinates: route.points.coordinates,
      distance: route.distance,
      elevationGain: route.ascend || 0,
      elevationLoss: route.descend || 0,
      duration: route.time / 1000,
      difficulty,
      popularityScore: candidate.popularityScore,
      qualityScore: candidate.validation.qualityScore,
      loopQuality: candidate.loopQuality,
      backtrackRatio: candidate.backtrackRatio,
      turnInstructions: route.instructions || [],
    };
  });
}

// ==================== ENCODING ====================

function generateRouteId(): string {
  return `route_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function encodePolyline(coordinates: Array<[number, number]>): string {
  const latLngCoords = coordinates.map(coord => [coord[1], coord[0]]);
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const [lat, lng] of latLngCoords) {
    const lat5 = Math.round(lat * 1e5);
    const lng5 = Math.round(lng * 1e5);
    encoded += encodeValue(lat5 - prevLat);
    encoded += encodeValue(lng5 - prevLng);
    prevLat = lat5;
    prevLng = lng5;
  }
  return encoded;
}

function encodeValue(value: number): string {
  let encoded = '';
  let num = value < 0 ? ~(value << 1) : (value << 1);
  while (num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  encoded += String.fromCharCode(num + 63);
  return encoded;
}
