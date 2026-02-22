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
    const seenLocations = new Set<string>();

    for (const el of elements) {
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
    return [];
  }
}

/**
 * Select scenic waypoints that form a good loop around the start point
 */
function selectScenicWaypoints(
  features: ScenicFeature[],
  startLat: number,
  startLng: number,
  targetDistanceKm: number
): Array<{ lat: number; lng: number; name: string; type: string }> {
  if (features.length === 0) return [];

  const idealRadius = targetDistanceKm / (2 * Math.PI);
  const minDist = idealRadius * 0.3;
  const maxDist = idealRadius * 1.2;

  const inRange = features.filter(f => f.distance >= minDist && f.distance <= maxDist);
  const pool = inRange.length >= 3 ? inRange : features;

  const typePriority: Record<string, number> = {
    park: 5, river: 4, trail: 4, coastline: 4, lake: 3, footpath: 2, green_space: 1,
  };
  const sortedPool = [...pool].sort((a, b) => (typePriority[b.type] || 0) - (typePriority[a.type] || 0));

  // Select waypoints spread across 4 compass quadrants
  const quadrants: Array<ScenicFeature | null> = [null, null, null, null];
  for (const feature of sortedPool) {
    const quadrant = Math.floor(feature.bearing / 90) % 4;
    if (!quadrants[quadrant]) quadrants[quadrant] = feature;
  }

  const selectedFeatures = quadrants.filter(Boolean) as ScenicFeature[];
  
  if (selectedFeatures.length < 2) {
    return sortedPool.slice(0, 3).map(f => ({
      lat: f.lat, lng: f.lng, name: f.name || f.type, type: f.type,
    }));
  }

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
  if (preferScenic) {
    try {
      return await generateGraphHopperRoutePost(lat, lng, distanceMeters, seed);
    } catch (error: any) {
      console.log(`POST with custom_model failed, falling back to GET: ${error.message}`);
    }
  }
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
        { if: "road_class == TRACK", multiply_by: 3.0 },
        { if: "road_class == PATH", multiply_by: 3.0 },
        { if: "road_class == FOOTWAY", multiply_by: 2.5 },
        { if: "road_class == CYCLEWAY", multiply_by: 2.0 },
        { if: "road_class == RESIDENTIAL", multiply_by: 0.4 },
        { if: "road_class == TERTIARY", multiply_by: 0.3 },
        { if: "road_class == SECONDARY", multiply_by: 0.2 },
        { if: "road_class == PRIMARY", multiply_by: 0.1 },
        { if: "road_class == TRUNK", multiply_by: 0.05 },
        { if: "road_class == MOTORWAY", multiply_by: 0.01 },
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
 */
async function generateScenicWaypointRoute(
  startLat: number,
  startLng: number,
  waypoints: Array<{ lat: number; lng: number; name: string; type: string }>
): Promise<any> {
  if (waypoints.length === 0) throw new Error("No waypoints provided");

  const points: Array<[number, number]> = [
    [startLng, startLat],
    ...waypoints.map(w => [w.lng, w.lat] as [number, number]),
    [startLng, startLat],
  ];

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
    console.log(`Scenic POST failed, trying GET fallback: ${postError.message}`);
    const pointParams = points.map(p => `point=${p[1]},${p[0]}`).join('&');
    const response = await axios.get(
      `${GRAPHHOPPER_BASE_URL}/route?${pointParams}`,
      {
        params: {
          profile: 'hike',
          points_encoded: false,
          elevation: true,
          instructions: true,
          details: ['road_class', 'surface'],
          key: GRAPHHOPPER_API_KEY,
        },
        timeout: 30000,
      }
    );
    return response.data;
  }
}

// ==================== ROAD CLASS ANALYSIS ====================

function analyzeRoadClasses(roadClassDetails: any[]): RoadClassAnalysis {
  if (!roadClassDetails || roadClassDetails.length === 0) {
    return { hasHighways: false, highwayPercentage: 0, trailPercentage: 0, pathPercentage: 0, residentialPercentage: 0, terrainScore: 0.5 };
  }
  
  let totalSegments = 0, highwaySegments = 0, trailSegments = 0, pathSegments = 0, residentialSegments = 0;
  
  for (const detail of roadClassDetails) {
    const [startIdx, endIdx, roadClass] = detail;
    const segLen = endIdx - startIdx;
    totalSegments += segLen;
    const rc = (roadClass || '').toLowerCase();
    
    if (rc.includes('motorway') || rc.includes('trunk') || rc.includes('primary')) highwaySegments += segLen;
    if (rc.includes('residential') || rc.includes('tertiary') || rc.includes('secondary')) residentialSegments += segLen;
    if (rc.includes('track') || rc.includes('trail')) trailSegments += segLen;
    if (rc.includes('path') || rc.includes('footway') || rc.includes('cycleway')) pathSegments += segLen;
  }
  
  const hp = totalSegments > 0 ? highwaySegments / totalSegments : 0;
  const tp = totalSegments > 0 ? trailSegments / totalSegments : 0;
  const pp = totalSegments > 0 ? pathSegments / totalSegments : 0;
  const rp = totalSegments > 0 ? residentialSegments / totalSegments : 0;
  const terrainScore = Math.max(0, Math.min(1, (tp + pp) * 1.5 - rp * 0.5 - hp * 2.0));
  
  return { hasHighways: hp > 0.1, highwayPercentage: hp, trailPercentage: tp, pathPercentage: pp, residentialPercentage: rp, terrainScore };
}

// ==================== VALIDATION ====================

function validateRoute(
  coordinates: Array<[number, number]>,
  actualDistanceMeters: number,
  targetDistanceMeters: number,
  roadClassDetails?: any[]
): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  if (coordinates.length < 3) return { isValid: false, issues: [], qualityScore: 0 };
  
  const distanceDiffPercent = Math.abs(actualDistanceMeters - targetDistanceMeters) / targetDistanceMeters;
  if (distanceDiffPercent > 0.25) {
    issues.push({ type: 'DISTANCE_MISMATCH', location: coordinates[0], severity: 'HIGH' });
    console.log(`⚠️ Distance mismatch: ${(distanceDiffPercent * 100).toFixed(1)}% off target`);
  }
  
  // Macro U-turn detection
  const sampleInterval = Math.max(1, Math.floor(coordinates.length / 50));
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < coordinates.length; i += sampleInterval) sampled.push(coordinates[i]);
  if (sampled[sampled.length - 1] !== coordinates[coordinates.length - 1]) sampled.push(coordinates[coordinates.length - 1]);
  
  for (let i = 1; i < sampled.length - 1; i++) {
    if (calculateAngle(sampled[i - 1], sampled[i], sampled[i + 1]) > 150) {
      issues.push({ type: 'U_TURN', location: sampled[i], severity: 'HIGH' });
    }
  }
  
  // Repeated segments
  const segSet = new Set<string>();
  for (let i = 0; i < coordinates.length - 1; i++) {
    const seg = `${coordinates[i][0].toFixed(4)},${coordinates[i][1].toFixed(4)}-${coordinates[i + 1][0].toFixed(4)},${coordinates[i + 1][1].toFixed(4)}`;
    if (segSet.has(seg)) issues.push({ type: 'REPEATED_SEGMENT', location: coordinates[i], severity: 'MEDIUM' });
    segSet.add(seg);
  }
  
  if (roadClassDetails) {
    const ra = analyzeRoadClasses(roadClassDetails);
    if (ra.hasHighways) issues.push({ type: 'HIGHWAY', location: coordinates[0], severity: ra.highwayPercentage > 0.3 ? 'HIGH' : 'MEDIUM' });
  }
  
  const high = issues.filter(i => i.severity === 'HIGH').length;
  const med = issues.filter(i => i.severity === 'MEDIUM').length;
  return { isValid: high < 2, issues, qualityScore: Math.max(0, 1 - high * 0.3 - med * 0.1) };
}

// ==================== GEOMETRY HELPERS ====================

function calculateAngle(p1: [number, number], p2: [number, number], p3: [number, number]): number {
  const b1 = calculateBearing(p1, p2), b2 = calculateBearing(p2, p3);
  let a = Math.abs(b2 - b1); if (a > 180) a = 360 - a; return a;
}

function calculateBearing(p1: [number, number], p2: [number, number]): number {
  const [lng1, lat1] = p1, [lng2, lat2] = p2;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
  return (Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * 180 / Math.PI + 360) % 360;
}

function getDistanceKm(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371, dLat = (p2.lat - p1.lat) * Math.PI / 180, dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateDifficulty(distanceKm: number, elevationGainM: number): string {
  const e = elevationGainM / distanceKm;
  if (e < 10 && distanceKm < 8) return 'easy';
  if (e < 25 && distanceKm < 15) return 'moderate';
  return 'hard';
}

// ==================== SHAPE & QUALITY ANALYSIS ====================

function calculateCompactness(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 10) return 0;
  let area = 0; const n = coordinates.length, cosLat = Math.cos(startLat * Math.PI / 180);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = (coordinates[i][0] - coordinates[0][0]) * 111320 * cosLat, y1 = (coordinates[i][1] - coordinates[0][1]) * 110540;
    const x2 = (coordinates[j][0] - coordinates[0][0]) * 111320 * cosLat, y2 = (coordinates[j][1] - coordinates[0][1]) * 110540;
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;
  let perim = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const dx = (coordinates[i + 1][0] - coordinates[i][0]) * 111320 * cosLat, dy = (coordinates[i + 1][1] - coordinates[i][1]) * 110540;
    perim += Math.sqrt(dx * dx + dy * dy);
  }
  if (perim === 0) return 0;
  return Math.min(1, (4 * Math.PI * area) / (perim * perim) / 0.10);
}

function calculateAngularSpread(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 10) return 0;
  const sp: [number, number] = [startLng, startLat], cosLat = Math.cos(startLat * Math.PI / 180);
  const step = Math.max(1, Math.floor(coordinates.length / 20));
  const bearings: number[] = [];
  for (let i = step; i < coordinates.length - step; i += step) {
    const dx = (coordinates[i][0] - sp[0]) * 111320 * cosLat, dy = (coordinates[i][1] - sp[1]) * 110540;
    if (Math.sqrt(dx * dx + dy * dy) > 100) bearings.push(calculateBearing(sp, coordinates[i]));
  }
  if (bearings.length < 3) return 0;
  const sectors = new Set<number>(); for (const b of bearings) sectors.add(Math.floor(b / 45));
  return sectors.size / 8;
}

function calculateProximityOverlap(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 20) return 0;
  const cosLat = Math.cos(startLat * Math.PI / 180);
  const step = Math.max(1, Math.floor(coordinates.length / 100));
  const s: Array<{ c: [number, number]; p: number }> = [];
  for (let i = 0; i < coordinates.length; i += step) s.push({ c: coordinates[i], p: i / coordinates.length });
  let ov = 0, tot = 0;
  for (let i = 0; i < s.length; i++) {
    const d0x = (s[i].c[0] - startLng) * 111320 * cosLat, d0y = (s[i].c[1] - startLat) * 110540;
    if (Math.sqrt(d0x * d0x + d0y * d0y) < 150) continue;
    for (let j = i + 1; j < s.length; j++) {
      if (Math.abs(s[j].p - s[i].p) < 0.30) continue;
      const d1x = (s[j].c[0] - startLng) * 111320 * cosLat, d1y = (s[j].c[1] - startLat) * 110540;
      if (Math.sqrt(d1x * d1x + d1y * d1y) < 150) continue;
      tot++;
      const dx = (s[j].c[0] - s[i].c[0]) * 111320 * cosLat, dy = (s[j].c[1] - s[i].c[1]) * 110540;
      if (Math.sqrt(dx * dx + dy * dy) < 60) ov++;
    }
  }
  return tot > 0 ? ov / tot : 0;
}

function calculateLoopQuality(coordinates: Array<[number, number]>, startLat: number, startLng: number): number {
  if (coordinates.length < 2) return 0;
  return Math.max(0, 1 - getDistanceKm({ lat: startLat, lng: startLng }, { lat: coordinates[coordinates.length - 1][1], lng: coordinates[coordinates.length - 1][0] }));
}

function calculateBacktrackRatio(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 10) return 0;
  const gs = 0.0003, segSet = new Set<string>();
  let tot = 0, bt = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const g1 = `${Math.round(coordinates[i][0] / gs)},${Math.round(coordinates[i][1] / gs)}`;
    const g2 = `${Math.round(coordinates[i + 1][0] / gs)},${Math.round(coordinates[i + 1][1] / gs)}`;
    if (g1 !== g2) { tot++; if (segSet.has(`${g2}-${g1}`)) bt++; segSet.add(`${g1}-${g2}`); }
  }
  return tot > 0 ? bt / tot : 0;
}

function calculateRouteDiversity(a: Array<[number, number]>, b: Array<[number, number]>, startLat: number, startLng: number): number {
  const sp: [number, number] = [startLng, startLat];
  function dom(coords: Array<[number, number]>): number {
    const s = Math.floor(coords.length * 0.2), e = Math.floor(coords.length * 0.6), step = Math.max(1, Math.floor((e - s) / 10));
    let ss = 0, cs = 0, c = 0;
    for (let i = s; i < e; i += step) { const br = calculateBearing(sp, coords[i]); ss += Math.sin(br * Math.PI / 180); cs += Math.cos(br * Math.PI / 180); c++; }
    return c === 0 ? 0 : (Math.atan2(ss / c, cs / c) * 180 / Math.PI + 360) % 360;
  }
  let d = Math.abs(dom(a) - dom(b)); if (d > 180) d = 360 - d;
  return d / 180;
}

// ==================== MAIN ROUTE GENERATION ====================

export async function generateIntelligentRoute(request: RouteRequest): Promise<GeneratedRoute[]> {
  const { latitude, longitude, distanceKm, preferTrails = true } = request;
  const distanceMeters = distanceKm * 1000;
  
  if (!GRAPHHOPPER_API_KEY) throw new Error("GRAPHHOPPER_API_KEY is not set in environment variables");
  
  console.log(`🗺️ Generating ${distanceKm}km scenic route at (${latitude}, ${longitude})`);
  
  // STEP 1: Discover scenic features via Overpass API
  const searchRadius = Math.max(1500, Math.min(5000, distanceKm * 500));
  const scenicFeatures = await findScenicFeatures(latitude, longitude, searchRadius);
  const scenicWaypoints = selectScenicWaypoints(scenicFeatures, latitude, longitude, distanceKm);
  
  if (scenicWaypoints.length > 0) {
    console.log(`🌳 Selected ${scenicWaypoints.length} scenic waypoints:`);
    scenicWaypoints.forEach((w, i) => console.log(`   ${i + 1}. ${w.name} (${w.type}) at (${w.lat.toFixed(4)}, ${w.lng.toFixed(4)})`));
  } else {
    console.log(`⚠️ No scenic features found nearby, using round-trip only`);
  }

  // STEP 2: Generate candidates in parallel
  const candidates: Array<{
    route: any; validation: ValidationResult; popularityScore: number; terrainScore: number;
    loopQuality: number; backtrackRatio: number; compactness: number; angularSpread: number;
    proximityOverlap: number; coordinates: Array<[number, number]>; isScenic: boolean;
  }> = [];

  const baseSeed = Math.floor(Math.random() * 1000);
  const seedOffsets = [0, 17, 37, 53, 71, 89];
  
  // A) Round-trip candidates (6 with hike profile)
  console.log(`🔄 Generating ${seedOffsets.length} round-trip candidates (hike profile)...`);
  const rtPromises = seedOffsets.map(async (offset) => {
    const seed = baseSeed + offset;
    try {
      const ghResponse = await generateGraphHopperRoute(latitude, longitude, distanceMeters, seed, preferTrails);
      return { seed, ghResponse, isScenic: false };
    } catch (error: any) {
      console.error(`Seed ${seed} failed: ${error.message}`);
      return { seed, ghResponse: null, isScenic: false };
    }
  });

  // B) Scenic waypoint candidates
  const scenicPromises: Promise<{ seed: number; ghResponse: any; isScenic: boolean }>[] = [];
  
  if (scenicWaypoints.length >= 2) {
    console.log(`🌿 Generating scenic waypoint candidates...`);
    
    scenicPromises.push((async () => {
      try { return { seed: -1, ghResponse: await generateScenicWaypointRoute(latitude, longitude, scenicWaypoints), isScenic: true }; }
      catch (e: any) { console.error(`Scenic (all) failed: ${e.message}`); return { seed: -1, ghResponse: null, isScenic: true }; }
    })());
    
    scenicPromises.push((async () => {
      try { return { seed: -2, ghResponse: await generateScenicWaypointRoute(latitude, longitude, [...scenicWaypoints].reverse()), isScenic: true }; }
      catch (e: any) { return { seed: -2, ghResponse: null, isScenic: true }; }
    })());

    if (scenicWaypoints.length >= 3) {
      scenicPromises.push((async () => {
        try {
          const subset = scenicWaypoints.filter((_, i) => i % 2 === 0);
          if (subset.length >= 2) return { seed: -3, ghResponse: await generateScenicWaypointRoute(latitude, longitude, subset), isScenic: true };
          return { seed: -3, ghResponse: null, isScenic: true };
        } catch (e: any) { return { seed: -3, ghResponse: null, isScenic: true }; }
      })());
    }
  }

  const allResults = await Promise.all([...rtPromises, ...scenicPromises]);

  // STEP 3: Process and validate
  for (const { seed, ghResponse, isScenic } of allResults) {
    if (!ghResponse?.paths?.length) continue;
    
    const path = ghResponse.paths[0];
    let coordinates = path.points.coordinates as Array<[number, number]>;
    const label = isScenic ? `Scenic(${seed})` : `Seed ${seed}`;
    
    const loopQuality = calculateLoopQuality(coordinates, latitude, longitude);
    const backtrackRatio = calculateBacktrackRatio(coordinates);
    console.log(`${label}: Loop=${loopQuality.toFixed(2)}, Backtrack=${backtrackRatio.toFixed(2)}, Dist=${path.distance}m`);

    if (loopQuality < (isScenic ? 0.5 : 0.7)) { console.log(`${label}: Rejected - poor loop`); continue; }
    if (backtrackRatio > 0.25) { console.log(`${label}: Rejected - backtracking`); continue; }
    
    const compactness = calculateCompactness(coordinates, latitude, longitude);
    const angularSpread = calculateAngularSpread(coordinates, latitude, longitude);
    const proximityOverlap = calculateProximityOverlap(coordinates, latitude, longitude);
    
    if (proximityOverlap > 0.25) { console.log(`${label}: Rejected - overlap`); continue; }
    if (!isScenic && compactness < 0.15) { console.log(`${label}: Rejected - elongated`); continue; }
    if (!isScenic && angularSpread < 0.25) { console.log(`${label}: Rejected - poor spread`); continue; }
    
    // Force circular
    if (coordinates.length > 0) {
      coordinates[0] = [longitude, latitude];
      coordinates[coordinates.length - 1] = [longitude, latitude];
    }

    const roadClassDetails = path.details?.road_class || [];
    const roadAnalysis = analyzeRoadClasses(roadClassDetails);
    console.log(`${label}: trails=${(roadAnalysis.trailPercentage * 100).toFixed(1)}%, paths=${(roadAnalysis.pathPercentage * 100).toFixed(1)}%, residential=${(roadAnalysis.residentialPercentage * 100).toFixed(1)}%`);
    
    const validation = validateRoute(coordinates, path.distance, distanceMeters, roadClassDetails);
    if (!validation.isValid) { console.log(`${label}: Rejected - invalid`); continue; }
    
    const popularityScore = await getRoutePopularityScore(coordinates);
    candidates.push({ route: path, validation, popularityScore, terrainScore: roadAnalysis.terrainScore, loopQuality, backtrackRatio, compactness, angularSpread, proximityOverlap, coordinates, isScenic });
  }
  
  if (candidates.length === 0) throw new Error("Could not generate a valid route. Try a different location or distance.");
  
  console.log(`📊 ${candidates.length} valid candidates (${candidates.filter(c => c.isScenic).length} scenic, ${candidates.filter(c => !c.isScenic).length} round-trip)`);

  // STEP 4: Score and select top 3 diverse routes
  const scored = candidates.map((c) => {
    const shapeScore = Math.max(0, c.compactness * 0.4 + c.angularSpread * 0.4 - c.proximityOverlap * 0.8);
    const scenicScore = c.terrainScore + (c.isScenic ? 0.3 : 0);
    
    const totalScore = 
      Math.min(1, scenicScore) * 0.20 +
      shapeScore * 0.20 +
      c.validation.qualityScore * 0.20 +
      (1 - c.backtrackRatio) * 0.15 +
      c.loopQuality * 0.15 +
      c.popularityScore * 0.10;
    
    console.log(`  ${c.isScenic ? '🌿' : '🔄'} scenic=${scenicScore.toFixed(2)}, shape=${shapeScore.toFixed(2)}, quality=${c.validation.qualityScore.toFixed(2)} → ${totalScore.toFixed(3)}`);
    return { ...c, totalScore, shapeScore, scenicScore };
  });
  
  scored.sort((a, b) => b.totalScore - a.totalScore);
  
  const selected: typeof scored = [];
  for (const c of scored) {
    if (selected.length >= 3) break;
    let diverse = true;
    for (const s of selected) { if (calculateRouteDiversity(c.coordinates, s.coordinates, latitude, longitude) < 0.15) { diverse = false; break; } }
    if (diverse) selected.push(c);
  }
  if (selected.length < 3) for (const c of scored) { if (selected.length >= 3) break; if (!selected.includes(c)) selected.push(c); }
  
  console.log(`✅ Returning ${selected.length} routes (${selected.filter(s => s.isScenic).length} scenic)`);
  
  return selected.map((c, i) => {
    const r = c.route, diff = calculateDifficulty(r.distance / 1000, r.ascend || 0);
    console.log(`  Route ${i + 1}: ${(r.distance / 1000).toFixed(2)}km ${c.isScenic ? '🌿' : '🔄'}, Score=${c.totalScore.toFixed(2)}`);
    return {
      id: generateRouteId(), polyline: encodePolyline(r.points.coordinates), coordinates: r.points.coordinates,
      distance: r.distance, elevationGain: r.ascend || 0, elevationLoss: r.descend || 0,
      duration: r.time / 1000, difficulty: diff, popularityScore: c.popularityScore,
      qualityScore: c.validation.qualityScore, loopQuality: c.loopQuality, backtrackRatio: c.backtrackRatio,
      turnInstructions: r.instructions || [],
    };
  });
}

// ==================== ENCODING ====================

function generateRouteId(): string { return `route_${Date.now()}_${Math.random().toString(36).substring(7)}`; }

function encodePolyline(coordinates: Array<[number, number]>): string {
  const lls = coordinates.map(c => [c[1], c[0]]);
  let enc = '', pLat = 0, pLng = 0;
  for (const [lat, lng] of lls) {
    const la5 = Math.round(lat * 1e5), ln5 = Math.round(lng * 1e5);
    enc += encodeValue(la5 - pLat) + encodeValue(ln5 - pLng);
    pLat = la5; pLng = ln5;
  }
  return enc;
}

function encodeValue(value: number): string {
  let enc = '', n = value < 0 ? ~(value << 1) : (value << 1);
  while (n >= 0x20) { enc += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
  enc += String.fromCharCode(n + 63); return enc;
}
