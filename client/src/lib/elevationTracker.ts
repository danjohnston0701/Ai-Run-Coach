export interface ElevationPoint {
  lat: number;
  lng: number;
  elevation: number;
  distance: number;
  grade: number;
}

export interface TerrainData {
  currentAltitude?: number;
  currentGrade?: number;
  upcomingTerrain?: {
    distanceAhead: number;
    grade: number;
    elevationChange: number;
    description: string;
  };
  totalElevationGain?: number;
  totalElevationLoss?: number;
}

function getDistanceMeters(
  lat1: number, lng1: number, 
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function findNearestProfilePoint(
  lat: number, 
  lng: number, 
  profile: ElevationPoint[]
): { index: number; distance: number } {
  let minDist = Infinity;
  let nearestIdx = 0;
  
  for (let i = 0; i < profile.length; i++) {
    const dist = getDistanceMeters(lat, lng, profile[i].lat, profile[i].lng);
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }
  
  return { index: nearestIdx, distance: minDist };
}

function getGradeDescription(grade: number): string {
  if (grade >= 8) return "steep hill ahead";
  if (grade >= 5) return "moderate hill ahead";
  if (grade >= 2) return "gentle incline ahead";
  if (grade <= -8) return "steep descent ahead";
  if (grade <= -5) return "moderate downhill ahead";
  if (grade <= -2) return "gentle descent ahead";
  return "flat terrain ahead";
}

export function calculateTerrainData(
  currentLat: number,
  currentLng: number,
  distanceCoveredMeters: number,
  elevationProfile?: ElevationPoint[] | null,
  totalElevationGain?: number,
  totalElevationLoss?: number
): TerrainData | undefined {
  if (!elevationProfile || elevationProfile.length < 2) {
    return undefined;
  }
  
  const { index: nearestIdx } = findNearestProfilePoint(currentLat, currentLng, elevationProfile);
  const currentPoint = elevationProfile[nearestIdx];
  
  const terrain: TerrainData = {
    currentAltitude: currentPoint.elevation,
    currentGrade: currentPoint.grade,
    totalElevationGain,
    totalElevationLoss,
  };
  
  const lookAheadDistance = 200;
  
  for (let i = nearestIdx + 1; i < elevationProfile.length; i++) {
    const point = elevationProfile[i];
    const distanceAhead = point.distance - currentPoint.distance;
    
    if (distanceAhead > 0 && distanceAhead <= lookAheadDistance) {
      if (Math.abs(point.grade) >= 3) {
        const elevationChange = point.elevation - currentPoint.elevation;
        terrain.upcomingTerrain = {
          distanceAhead: Math.round(distanceAhead),
          grade: point.grade,
          elevationChange: Math.round(elevationChange),
          description: getGradeDescription(point.grade),
        };
        break;
      }
    }
    
    if (distanceAhead > lookAheadDistance) break;
  }
  
  return terrain;
}

export type TerrainDirection = 'uphill' | 'downhill' | null;
export type TerrainEvent = 'uphill' | 'downhill' | 'hill_crest' | null;

export function getTerrainDirection(terrain: TerrainData | undefined): TerrainDirection {
  if (!terrain) return null;
  
  // Check upcoming terrain first (warning ahead)
  if (terrain.upcomingTerrain && Math.abs(terrain.upcomingTerrain.grade) >= 5) {
    return terrain.upcomingTerrain.grade > 0 ? 'uphill' : 'downhill';
  }
  
  // Check current grade
  if (terrain.currentGrade !== undefined && Math.abs(terrain.currentGrade) >= 6) {
    return terrain.currentGrade > 0 ? 'uphill' : 'downhill';
  }
  
  return null;
}

export function detectHillCrest(
  terrain: TerrainData | undefined,
  previousGrade: number | null
): boolean {
  if (!terrain || previousGrade === null) return false;
  
  const currentGrade = terrain.currentGrade ?? 0;
  
  // Hill crest: was on moderate/steep uphill (5%+), now flat or downhill (<2%)
  if (previousGrade >= 5 && currentGrade < 2) {
    return true;
  }
  
  return false;
}

export function shouldTriggerTerrainCoaching(
  terrain: TerrainData | undefined,
  lastUphillCoachingTime: number,
  lastDownhillCoachingTime: number,
  lastHillCrestTime: number,
  previousGrade: number | null,
  minIntervalMs: number = 30000
): TerrainEvent {
  if (!terrain) return null;
  
  const now = Date.now();
  
  // Check for hill crest first (reaching top of a climb)
  if (detectHillCrest(terrain, previousGrade) && now - lastHillCrestTime >= minIntervalMs) {
    return 'hill_crest';
  }
  
  const direction = getTerrainDirection(terrain);
  
  if (!direction) return null;
  
  // Check cooldown based on direction
  if (direction === 'uphill' && now - lastUphillCoachingTime < minIntervalMs) {
    return null;
  }
  if (direction === 'downhill' && now - lastDownhillCoachingTime < minIntervalMs) {
    return null;
  }
  
  return direction;
}
