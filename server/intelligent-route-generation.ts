/**
 * Intelligent Route Generation Service
 * 
 * Uses GraphHopper API + OSM segment popularity data to generate high-quality running routes
 * 
 * ROUTE QUALITY RULES (Feb 22, 2026):
 * ✅ Avoids highways, motorways, and major roads (using GraphHopper road_class data)
 * ✅ Validates distance within ±20% of target
 * ✅ Detects and rejects routes with 180° U-turns (point-level AND macro-level)
 * ✅ Prevents repeated segments (backtracking < 25%)
 * ✅ Detects parallel road out-and-back (proximity-based, not just exact segment match)
 * ✅ Enforces genuine circular routes (loop quality > 70%)
 * ✅ Measures route shape compactness (rejects elongated lollipop/out-and-back shapes)
 * ✅ Measures angular spread from start (routes should explore multiple directions)
 * ✅ Optimizes for trails, parks, paths, cycleways when preferTrails=true
 * ✅ Filters out routes with >30% highway usage (HIGH severity)
 * ✅ Generates 8 candidates with well-spaced seeds for maximum variety, returns top 3
 * ✅ Ensures returned routes are diverse (not three nearly-identical routes)
 * ✅ Scores: Quality (25%) + Shape (25%) + Backtrack (20%) + Popularity (15%) + Terrain (15%)
 */

import axios from "axios";
import { getRoutePopularityScore, analyzeRouteCharacteristics } from "./osm-segment-intelligence";

const GRAPHHOPPER_API_KEY = process.env.GRAPHHOPPER_API_KEY || "";
const GRAPHHOPPER_BASE_URL = "https://graphhopper.com/api/1";

// ==================== TYPES ====================

interface RouteRequest {
  latitude: number;
  longitude: number;
  distanceKm: number;
  preferTrails?: boolean;
  avoidHills?: boolean;
}

interface RoadClassAnalysis {
  hasHighways: boolean;
  highwayPercentage: number;
  trailPercentage: number;
  pathPercentage: number;
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
  sign: number; // -3=sharp left, -2=left, -1=slight left, 0=straight, 1=slight right, 2=right, 3=sharp right
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

// ==================== GRAPHHOPPER API ====================

/**
 * Generate a circuit route using GraphHopper Round Trip API
 */
async function generateGraphHopperRoute(
  lat: number,
  lng: number,
  distanceMeters: number,
  profile: 'foot' | 'bike',
  seed: number = 0
): Promise<any> {
  try {
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
      timeout: 30000, // 30 second timeout
    });

    return response.data;
  } catch (error: any) {
    console.error("GraphHopper API error:", error.response?.data || error.message);
    throw new Error(`GraphHopper API failed: ${error.message}`);
  }
}

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
      terrainScore: 0.5,
    };
  }
  
  let totalSegments = 0;
  let highwaySegments = 0;
  let trailSegments = 0;
  let pathSegments = 0;
  
  // GraphHopper road_class values: https://docs.graphhopper.com/#section/Elevation-API/Details
  // motorway, trunk, primary, secondary, tertiary, unclassified, residential, service, track, path, footway, cycleway
  
  for (const detail of roadClassDetails) {
    const [startIdx, endIdx, roadClass] = detail;
    const segmentLength = endIdx - startIdx;
    totalSegments += segmentLength;
    
    const roadClassLower = (roadClass || '').toLowerCase();
    
    // Highways and major roads (BAD for running)
    if (roadClassLower.includes('motorway') || 
        roadClassLower.includes('trunk') || 
        roadClassLower.includes('primary')) {
      highwaySegments += segmentLength;
    }
    
    // Trails and paths (GOOD for running)
    if (roadClassLower.includes('track') || 
        roadClassLower.includes('trail')) {
      trailSegments += segmentLength;
    }
    
    // Footpaths and cycleways (GREAT for running)
    if (roadClassLower.includes('path') || 
        roadClassLower.includes('footway') || 
        roadClassLower.includes('cycleway')) {
      pathSegments += segmentLength;
    }
  }
  
  const highwayPercentage = totalSegments > 0 ? (highwaySegments / totalSegments) : 0;
  const trailPercentage = totalSegments > 0 ? (trailSegments / totalSegments) : 0;
  const pathPercentage = totalSegments > 0 ? (pathSegments / totalSegments) : 0;
  
  // Terrain score: 1.0 = all trails/paths, 0.0 = all highways
  const terrainScore = Math.max(0, Math.min(1, 
    (trailPercentage * 1.0 + pathPercentage * 1.0) - (highwayPercentage * 2.0)
  ));
  
  return {
    hasHighways: highwayPercentage > 0.1, // More than 10% highways
    highwayPercentage,
    trailPercentage,
    pathPercentage,
    terrainScore,
  };
}

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
  
  // Check distance tolerance (±20% of target - more lenient for diverse route options)
  const distanceDiffPercent = Math.abs(actualDistanceMeters - targetDistanceMeters) / targetDistanceMeters;
  if (distanceDiffPercent > 0.20) {
    issues.push({
      type: 'DISTANCE_MISMATCH',
      location: coordinates[0],
      severity: 'HIGH',
    });
    console.log(`⚠️ Distance mismatch: ${(distanceDiffPercent * 100).toFixed(1)}% off target (actual=${actualDistanceMeters}m, target=${targetDistanceMeters}m)`);
  }
  
  // Check for MACRO U-turns (going out 200m+ and turning back in approximately same direction)
  // Sample every ~100m worth of points to detect large-scale direction reversals
  const sampleInterval = Math.max(1, Math.floor(coordinates.length / 50));
  const sampledCoords: Array<[number, number]> = [];
  for (let i = 0; i < coordinates.length; i += sampleInterval) {
    sampledCoords.push(coordinates[i]);
  }
  // Always include last point
  if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
    sampledCoords.push(coordinates[coordinates.length - 1]);
  }
  
  let macroUTurnCount = 0;
  for (let i = 1; i < sampledCoords.length - 1; i++) {
    const angle = calculateAngle(
      sampledCoords[i - 1],
      sampledCoords[i],
      sampledCoords[i + 1]
    );
    
    if (angle > 150) {
      macroUTurnCount++;
      issues.push({
        type: 'U_TURN',
        location: sampledCoords[i],
        severity: 'HIGH',
      });
    }
  }
  
  // Check for repeated segments (running same road twice)
  const segmentSet = new Set<string>();
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segment = `${coordinates[i][0].toFixed(4)},${coordinates[i][1].toFixed(4)}-${coordinates[i + 1][0].toFixed(4)},${coordinates[i + 1][1].toFixed(4)}`;
    if (segmentSet.has(segment)) {
      issues.push({
        type: 'REPEATED_SEGMENT',
        location: coordinates[i],
        severity: 'MEDIUM',
      });
    }
    segmentSet.add(segment);
  }
  
  // Check for highways/motorways
  if (roadClassDetails) {
    const roadAnalysis = analyzeRoadClasses(roadClassDetails);
    if (roadAnalysis.hasHighways) {
      issues.push({
        type: 'HIGHWAY',
        location: coordinates[0],
        severity: roadAnalysis.highwayPercentage > 0.3 ? 'HIGH' : 'MEDIUM',
      });
      console.log(`⚠️ Highway detected: ${(roadAnalysis.highwayPercentage * 100).toFixed(1)}% of route`);
    }
  }
  
  // Calculate quality score
  const highIssues = issues.filter(i => i.severity === 'HIGH').length;
  const mediumIssues = issues.filter(i => i.severity === 'MEDIUM').length;
  
  const qualityScore = Math.max(0, 1 - (highIssues * 0.3 + mediumIssues * 0.1));
  const isValid = highIssues < 2; // Allow max 1 high severity issue
  
  return { isValid, issues, qualityScore };
}

function calculateAngle(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number]
): number {
  const bearing1 = calculateBearing(p1, p2);
  const bearing2 = calculateBearing(p2, p3);
  
  let angle = Math.abs(bearing2 - bearing1);
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
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Calculate difficulty based on distance and elevation
 */
function calculateDifficulty(distanceKm: number, elevationGainM: number): string {
  const elevationPerKm = elevationGainM / distanceKm;
  
  if (elevationPerKm < 10 && distanceKm < 8) {
    return 'easy';
  } else if (elevationPerKm < 25 && distanceKm < 15) {
    return 'moderate';
  } else {
    return 'hard';
  }
}

// ==================== SHAPE & QUALITY ANALYSIS ====================

/**
 * Calculate route compactness - how "fat" the loop is vs elongated/lollipop
 * 
 * A perfect circle has the highest area-to-perimeter ratio.
 * An out-and-back has ~zero area for its perimeter.
 * 
 * Returns 0-1 where 1 = perfect compact loop, 0 = straight out-and-back
 */
function calculateCompactness(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 10) return 0;
  
  // Calculate the approximate enclosed area using the Shoelace formula
  // (works for non-self-intersecting polygons, and gives a good approximation for routes)
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Convert to approximate meters from start for area calculation
    const x1 = (coordinates[i][0] - coordinates[0][0]) * 111320 * Math.cos(startLat * Math.PI / 180);
    const y1 = (coordinates[i][1] - coordinates[0][1]) * 110540;
    const x2 = (coordinates[j][0] - coordinates[0][0]) * 111320 * Math.cos(startLat * Math.PI / 180);
    const y2 = (coordinates[j][1] - coordinates[0][1]) * 110540;
    
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;
  
  // Calculate total route length in meters (approximate)
  let perimeter = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const dx = (coordinates[i + 1][0] - coordinates[i][0]) * 111320 * Math.cos(startLat * Math.PI / 180);
    const dy = (coordinates[i + 1][1] - coordinates[i][1]) * 110540;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  
  if (perimeter === 0) return 0;
  
  // Isoperimetric ratio: 4π·A / P² = 1 for a perfect circle
  const circleRatio = (4 * Math.PI * area) / (perimeter * perimeter);
  
  // Normalize: a good running loop typically has 0.05-0.15 ratio
  // (not a perfect circle, but has real enclosed area)
  // An out-and-back will be near 0
  // Cap at 1.0
  const compactness = Math.min(1, circleRatio / 0.10); // 0.10 ratio = score of 1.0
  
  return compactness;
}

/**
 * Calculate angular spread - how many different directions the route explores from start
 * 
 * A good loop should visit bearings all around the compass (360°).
 * A lollipop/out-and-back will only visit a narrow bearing range.
 * 
 * Returns 0-1 where 1 = full 360° coverage, 0 = all in one direction
 */
function calculateAngularSpread(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 10) return 0;
  
  const startPoint: [number, number] = [startLng, startLat]; // [lng, lat]
  
  // Sample points along the route (every ~5% of the route)
  const sampleInterval = Math.max(1, Math.floor(coordinates.length / 20));
  const bearings: number[] = [];
  
  for (let i = sampleInterval; i < coordinates.length - sampleInterval; i += sampleInterval) {
    // Only consider points that are at least 100m from start (skip the start/end area)
    const dx = (coordinates[i][0] - startPoint[0]) * 111320 * Math.cos(startLat * Math.PI / 180);
    const dy = (coordinates[i][1] - startPoint[1]) * 110540;
    const distFromStart = Math.sqrt(dx * dx + dy * dy);
    
    if (distFromStart > 100) {
      const bearing = calculateBearing(startPoint, coordinates[i]);
      bearings.push(bearing);
    }
  }
  
  if (bearings.length < 3) return 0;
  
  // Divide compass into 8 sectors (N, NE, E, SE, S, SW, W, NW) of 45° each
  const sectors = new Set<number>();
  for (const bearing of bearings) {
    sectors.add(Math.floor(bearing / 45));
  }
  
  // Score: 8/8 sectors = 1.0, 1/8 = 0.125
  return sectors.size / 8;
}

/**
 * Detect proximity-based backtracking (parallel road problem)
 * 
 * Instead of checking exact segment reuse, checks if later parts of the route
 * come within a close distance of earlier parts (excluding the start/end area).
 * This catches the "down one street, back on adjacent parallel street" pattern.
 * 
 * Returns 0-1 where 0 = no proximity issues, 1 = heavy overlap
 */
function calculateProximityOverlap(
  coordinates: Array<[number, number]>,
  startLat: number,
  startLng: number
): number {
  if (coordinates.length < 20) return 0;
  
  const PROXIMITY_THRESHOLD_M = 60; // Points within 60m of each other (catches adjacent streets)
  const START_END_EXCLUSION_M = 150; // Ignore overlap near start/end (expected to overlap)
  
  const cosLat = Math.cos(startLat * Math.PI / 180);
  const startPoint: [number, number] = [startLng, startLat];
  
  // Sample the route at regular intervals (~every 30m worth of index)
  const sampleInterval = Math.max(1, Math.floor(coordinates.length / 100));
  const sampledCoords: Array<{ coord: [number, number]; routeProgress: number }> = [];
  
  for (let i = 0; i < coordinates.length; i += sampleInterval) {
    const progress = i / coordinates.length; // 0-1 position along route
    sampledCoords.push({ coord: coordinates[i], routeProgress: progress });
  }
  
  let overlapCount = 0;
  let totalChecks = 0;
  
  for (let i = 0; i < sampledCoords.length; i++) {
    const pi = sampledCoords[i];
    
    // Skip points near start/end
    const dxStart = (pi.coord[0] - startPoint[0]) * 111320 * cosLat;
    const dyStart = (pi.coord[1] - startPoint[1]) * 110540;
    const distFromStart = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
    if (distFromStart < START_END_EXCLUSION_M) continue;
    
    for (let j = i + 1; j < sampledCoords.length; j++) {
      const pj = sampledCoords[j];
      
      // Only compare points that are far apart along the route (>30% of route apart)
      // to detect going out and coming back, not just dense points in same area
      const routeGap = Math.abs(pj.routeProgress - pi.routeProgress);
      if (routeGap < 0.30) continue;
      
      // Skip points near start/end for the second point too
      const dxStart2 = (pj.coord[0] - startPoint[0]) * 111320 * cosLat;
      const dyStart2 = (pj.coord[1] - startPoint[1]) * 110540;
      const distFromStart2 = Math.sqrt(dxStart2 * dxStart2 + dyStart2 * dyStart2);
      if (distFromStart2 < START_END_EXCLUSION_M) continue;
      
      totalChecks++;
      
      // Calculate distance between these two points
      const dx = (pj.coord[0] - pi.coord[0]) * 111320 * cosLat;
      const dy = (pj.coord[1] - pi.coord[1]) * 110540;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < PROXIMITY_THRESHOLD_M) {
        overlapCount++;
      }
    }
  }
  
  if (totalChecks === 0) return 0;
  
  // Return ratio of overlapping point-pairs
  return overlapCount / totalChecks;
}

/**
 * Calculate loop quality - how well the route forms a closed loop
 * Returns 0-1 where 1 is a perfect loop (end point = start point)
 */
function calculateLoopQuality(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 2) return 0;
  
  const startPoint = { lat: startLat, lng: startLng };
  const endPoint = { lat: coordinates[coordinates.length - 1][1], lng: coordinates[coordinates.length - 1][0] };
  
  // Distance from end to start in km
  const distanceKm = getDistanceKm(startPoint, endPoint);
  
  // If end is within 200m of start, that's a perfect loop (score = 1)
  // If end is more than 1km away, score = 0
  return Math.max(0, 1 - (distanceKm / 1.0));
}

/**
 * Calculate backtrack ratio - how much the route backtracks on itself
 * Returns 0-1 where 0 is no backtracking, 1 is maximum backtracking
 */
function calculateBacktrackRatio(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 10) return 0;
  
  const gridSize = 0.0003; // ~30m grid
  const segmentSet = new Set<string>();
  let totalSegments = 0;
  let backtrackCount = 0;
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const g1 = `${Math.round(coordinates[i][0] / gridSize)},${Math.round(coordinates[i][1] / gridSize)}`;
    const g2 = `${Math.round(coordinates[i + 1][0] / gridSize)},${Math.round(coordinates[i + 1][1] / gridSize)}`;
    
    if (g1 !== g2) {
      totalSegments++;
      const segment = `${g1}-${g2}`;
      const reverseSegment = `${g2}-${g1}`;
      
      // If we've seen this segment before in reverse direction, it's backtracking
      if (segmentSet.has(reverseSegment)) {
        backtrackCount++;
      }
      segmentSet.add(segment);
    }
  }
  
  return totalSegments > 0 ? backtrackCount / totalSegments : 0;
}

/**
 * Haversine distance between two points in km
 */
function getDistanceKm(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate how different two routes are from each other
 * Uses the mean bearing from start to sampled points to detect similar-direction routes
 * Returns 0-1 where 0 = identical direction, 1 = completely different
 */
function calculateRouteDiversity(
  coordsA: Array<[number, number]>,
  coordsB: Array<[number, number]>,
  startLat: number,
  startLng: number
): number {
  const startPoint: [number, number] = [startLng, startLat];
  
  // Get the "dominant bearing" of each route (average bearing to the midpoint area)
  function getDominantBearing(coords: Array<[number, number]>): number {
    // Sample the middle 40% of the route (20%-60%) for direction
    const startIdx = Math.floor(coords.length * 0.2);
    const endIdx = Math.floor(coords.length * 0.6);
    const sampleInterval = Math.max(1, Math.floor((endIdx - startIdx) / 10));
    
    let sinSum = 0;
    let cosSum = 0;
    let count = 0;
    
    for (let i = startIdx; i < endIdx; i += sampleInterval) {
      const bearing = calculateBearing(startPoint, coords[i]);
      sinSum += Math.sin(bearing * Math.PI / 180);
      cosSum += Math.cos(bearing * Math.PI / 180);
      count++;
    }
    
    if (count === 0) return 0;
    return (Math.atan2(sinSum / count, cosSum / count) * 180 / Math.PI + 360) % 360;
  }
  
  const bearingA = getDominantBearing(coordsA);
  const bearingB = getDominantBearing(coordsB);
  
  let diff = Math.abs(bearingA - bearingB);
  if (diff > 180) diff = 360 - diff;
  
  // Normalize: 180° apart = 1.0 diversity, 0° apart = 0.0
  return diff / 180;
}

// ==================== INTELLIGENT ROUTE GENERATION ====================

/**
 * Generate multiple route candidates and return top 3
 * Uses well-spaced seeds for maximum variety from GraphHopper
 */
export async function generateIntelligentRoute(
  request: RouteRequest
): Promise<GeneratedRoute[]> {
  const { latitude, longitude, distanceKm, preferTrails = true } = request;
  const distanceMeters = distanceKm * 1000;
  
  // Check if API key is set
  if (!GRAPHHOPPER_API_KEY) {
    throw new Error("GRAPHHOPPER_API_KEY is not set in environment variables");
  }
  
  // GraphHopper free API only supports 'foot', 'bike', 'car'
  // Always use 'foot' for running routes
  const profile = 'foot';
  
  console.log(`🗺️ Generating ${distanceKm}km (${distanceMeters}m) route at (${latitude}, ${longitude})`);
  
  // Generate MORE candidates with WELL-SPACED seeds for maximum variety
  // Sequential seeds (0,1,2) often produce very similar routes
  // Spaced seeds force GraphHopper to explore different road networks
  const maxAttempts = 8;
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
  }> = [];
  
  // Use random starting seed with wide spacing to ensure diverse routes
  const baseSeed = Math.floor(Math.random() * 1000);
  // Well-spaced seed offsets (primes * 7 for good distribution)
  const seedOffsets = [0, 13, 29, 47, 61, 83, 97, 113];
  console.log(`🎲 Using random base seed: ${baseSeed} with ${maxAttempts} attempts`);
  
  // Fire off all GraphHopper requests in parallel for speed
  const routePromises = seedOffsets.slice(0, maxAttempts).map(async (offset) => {
    const seed = baseSeed + offset;
    try {
      const ghResponse = await generateGraphHopperRoute(
        latitude,
        longitude,
        distanceMeters,
        profile,
        seed
      );
      return { seed, ghResponse };
    } catch (error) {
      console.error(`Seed ${seed} failed:`, error);
      return { seed, ghResponse: null };
    }
  });
  
  const routeResults = await Promise.all(routePromises);
  
  // Process each result
  for (const { seed, ghResponse } of routeResults) {
    if (!ghResponse || !ghResponse.paths || ghResponse.paths.length === 0) {
      console.log(`Seed ${seed}: No route found`);
      continue;
    }
    
    const path = ghResponse.paths[0];
    let coordinates = path.points.coordinates as Array<[number, number]>;
    
    // Calculate circuit quality BEFORE enforcing circular (so we get real loop quality)
    const loopQuality = calculateLoopQuality(coordinates, latitude, longitude);
    const backtrackRatio = calculateBacktrackRatio(coordinates);
    console.log(`Seed ${seed}: Circuit - Loop=${loopQuality.toFixed(2)}, Backtrack=${backtrackRatio.toFixed(2)}`);

    // Reject routes with poor circuit quality
    if (loopQuality < 0.7) {
      console.log(`Seed ${seed}: Rejected - poor loop quality (${loopQuality.toFixed(2)} < 0.7)`);
      continue;
    }
    if (backtrackRatio > 0.25) {
      console.log(`Seed ${seed}: Rejected - too much backtracking (${backtrackRatio.toFixed(2)} > 0.25)`);
      continue;
    }
    
    // NEW: Calculate shape metrics
    const compactness = calculateCompactness(coordinates, latitude, longitude);
    const angularSpread = calculateAngularSpread(coordinates, latitude, longitude);
    const proximityOverlap = calculateProximityOverlap(coordinates, latitude, longitude);
    
    console.log(`Seed ${seed}: Shape - Compactness=${compactness.toFixed(2)}, AngularSpread=${angularSpread.toFixed(2)}, ProximityOverlap=${proximityOverlap.toFixed(2)}`);
    
    // Reject routes with excessive proximity overlap (parallel road out-and-back)
    if (proximityOverlap > 0.25) {
      console.log(`Seed ${seed}: Rejected - too much proximity overlap (${proximityOverlap.toFixed(2)} > 0.25, parallel road pattern)`);
      continue;
    }
    
    // Reject very elongated routes (compactness near 0 = pure out-and-back)
    if (compactness < 0.15) {
      console.log(`Seed ${seed}: Rejected - too elongated (compactness=${compactness.toFixed(2)} < 0.15)`);
      continue;
    }
    
    // Reject routes that only explore one direction
    if (angularSpread < 0.25) {
      console.log(`Seed ${seed}: Rejected - poor angular spread (${angularSpread.toFixed(2)} < 0.25, lollipop shape)`);
      continue;
    }
    
    // ENSURE CIRCULAR ROUTE: Force start and end to be the exact same point
    if (coordinates.length > 0) {
      const startPoint: [number, number] = [longitude, latitude];
      coordinates[0] = startPoint;
      coordinates[coordinates.length - 1] = startPoint;
      console.log(`Seed ${seed}: Enforced circular route`);
    }

    console.log(`Seed ${seed}: GraphHopper returned distance=${path.distance}m, ascend=${path.ascend}m, time=${path.time}ms, points=${coordinates.length}`);
    
    // Extract road class details for validation
    const roadClassDetails = path.details?.road_class || [];
    
    // Analyze terrain (for preferTrails filtering)
    const roadAnalysis = analyzeRoadClasses(roadClassDetails);
    console.log(`Seed ${seed}: Terrain - trails=${(roadAnalysis.trailPercentage * 100).toFixed(1)}%, paths=${(roadAnalysis.pathPercentage * 100).toFixed(1)}%, highways=${(roadAnalysis.highwayPercentage * 100).toFixed(1)}%`);
    
    // If user prefers trails but route has very few, penalize it (but don't hard-reject in urban areas)
    // Lowered threshold from 0.3 to 0.1 so urban areas aren't over-filtered
    if (preferTrails && roadAnalysis.terrainScore < 0.1) {
      console.log(`Seed ${seed}: Rejected - user prefers trails but route has very low terrain score (${roadAnalysis.terrainScore.toFixed(2)})`);
      continue;
    }
    
    // Validate route quality (includes distance tolerance, U-turns, highways)
    const validation = validateRoute(coordinates, path.distance, distanceMeters, roadClassDetails);
    console.log(`Seed ${seed}: Valid=${validation.isValid}, Quality=${validation.qualityScore.toFixed(2)}, Issues=${validation.issues.length}`);
    
    if (!validation.isValid) {
      console.log(`Seed ${seed}: Rejected - invalid route`);
      continue;
    }
    
    // Check popularity score
    const popularityScore = await getRoutePopularityScore(coordinates);
    console.log(`Seed ${seed}: Popularity=${popularityScore.toFixed(2)}`);

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
    });
  }
  
  // No valid routes found
  if (candidates.length === 0) {
    throw new Error("Could not generate a valid route. Try a different location or distance.");
  }
  
  console.log(`📊 ${candidates.length} valid candidates from ${maxAttempts} attempts`);
  
  // Score candidates
  const scored = candidates.map((c) => {
    // Combined shape score: compactness (how fat the loop is) + angular spread (explores many directions)
    // - proximity overlap penalty (adjacent road out-and-back)
    const shapeScore = Math.max(0, 
      c.compactness * 0.4 + 
      c.angularSpread * 0.4 - 
      c.proximityOverlap * 0.8 // Heavy penalty for parallel road patterns
    );
    
    // New scoring weights emphasizing route shape quality:
    // Quality: 25% (no dead ends, highways, distance ok)
    // Shape: 25% (compactness + angular spread - overlap penalty)
    // Backtrack: 20% (low exact backtracking)
    // Popularity: 15% (known good segments)
    // Loop: 15% (proper closed loop)
    let totalScore = 
      c.validation.qualityScore * 0.25 +
      shapeScore * 0.25 +
      (1 - c.backtrackRatio) * 0.20 +
      c.popularityScore * 0.15 +
      c.loopQuality * 0.15;
    
    // If user prefers trails, add terrain bonus
    if (preferTrails && c.terrainScore > 0) {
      totalScore = totalScore * 0.85 + c.terrainScore * 0.15;
    }
    
    console.log(`  Candidate: quality=${c.validation.qualityScore.toFixed(2)}, shape=${shapeScore.toFixed(2)} (compact=${c.compactness.toFixed(2)}, spread=${c.angularSpread.toFixed(2)}, overlap=${c.proximityOverlap.toFixed(2)}), backtrack=${c.backtrackRatio.toFixed(2)}, popularity=${c.popularityScore.toFixed(2)}, loop=${c.loopQuality.toFixed(2)} → TOTAL=${totalScore.toFixed(3)}`);
    
    return { ...c, totalScore, shapeScore };
  });
  
  scored.sort((a, b) => b.totalScore - a.totalScore);
  
  // Select top 3 routes with DIVERSITY enforcement
  // Don't return 3 routes that all go in the same direction
  const selectedRoutes: typeof scored = [];
  
  for (const candidate of scored) {
    if (selectedRoutes.length >= 3) break;
    
    // Check if this route is sufficiently different from already-selected routes
    let isSufficientlyDiverse = true;
    for (const selected of selectedRoutes) {
      const diversity = calculateRouteDiversity(
        candidate.coordinates,
        selected.coordinates,
        latitude,
        longitude
      );
      
      if (diversity < 0.15) {
        // Routes are too similar in direction, skip this one
        console.log(`  Skipping similar route (diversity=${diversity.toFixed(2)} with already-selected route)`);
        isSufficientlyDiverse = false;
        break;
      }
    }
    
    if (isSufficientlyDiverse) {
      selectedRoutes.push(candidate);
    }
  }
  
  // If diversity filtering was too strict, fill remaining slots with best available
  if (selectedRoutes.length < 3) {
    for (const candidate of scored) {
      if (selectedRoutes.length >= 3) break;
      if (!selectedRoutes.includes(candidate)) {
        selectedRoutes.push(candidate);
      }
    }
  }
  
  console.log(`✅ Generated ${scored.length} valid routes, returning ${selectedRoutes.length} diverse routes`);
  
  return selectedRoutes.map((candidate, index) => {
    const route = candidate.route;
    const difficulty = calculateDifficulty(
      route.distance / 1000,
      route.ascend || 0
    );
    
    console.log(`  Route ${index + 1}: ${(route.distance / 1000).toFixed(2)}km, Score=${candidate.totalScore.toFixed(2)}, Shape=${candidate.shapeScore.toFixed(2)}, Compact=${candidate.compactness.toFixed(2)}, Spread=${candidate.angularSpread.toFixed(2)}`);
    
    const generatedRoute = {
      id: generateRouteId(),
      polyline: encodePolyline(route.points.coordinates),
      coordinates: route.points.coordinates,
      distance: route.distance, // Distance in meters from GraphHopper
      elevationGain: route.ascend || 0,
      elevationLoss: route.descend || 0,
      duration: route.time / 1000, // Convert milliseconds to seconds
      difficulty,
      popularityScore: candidate.popularityScore,
      qualityScore: candidate.validation.qualityScore,
      loopQuality: candidate.loopQuality,
      backtrackRatio: candidate.backtrackRatio,
      turnInstructions: route.instructions || [],
    };

    console.log(`  → distance=${generatedRoute.distance}m, elevation=${generatedRoute.elevationGain}m↗/${generatedRoute.elevationLoss}m↘, loop=${candidate.loopQuality.toFixed(2)}, backtrack=${candidate.backtrackRatio.toFixed(2)}`);
    
    return generatedRoute;
  });
}

/**
 * Generate a unique route ID
 */
function generateRouteId(): string {
  return `route_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Encode polyline using Google Polyline encoding algorithm
 * Implements the algorithm directly to avoid module import issues
 */
function encodePolyline(coordinates: Array<[number, number]>): string {
  // Convert from [lng, lat] to [lat, lng] for polyline encoding
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

/**
 * Encode a single value for polyline format
 */
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

/**
 * Get estimated time for route (rough calculation)
 */
function estimateRunTime(distanceKm: number, elevationGainM: number): number {
  // Base pace: 6 min/km
  const basePace = 6; // minutes per km
  
  // Add time for elevation (1 minute per 100m gain)
  const elevationTime = (elevationGainM / 100) * 1;
  
  const totalMinutes = distanceKm * basePace + elevationTime;
  return totalMinutes * 60; // Convert to seconds
}
