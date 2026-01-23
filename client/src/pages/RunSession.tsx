import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  Pause, Play, Square, Heart, Share2, Users, Navigation, Volume2, VolumeX, Footprints, Mic, MicOff, MessageCircle, AlertTriangle, Map as MapIcon, ChevronUp, ChevronDown, Navigation2, Check, Loader
} from "lucide-react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Friend } from "./Profile";
import { saveActiveRunSession, loadActiveRunSession, clearActiveRunSession, type ActiveRunSession } from "@/lib/activeRunSession";
import { loadCoachSettings, loadCoachSettingsFromProfile, getVoicePreferences, getTTSVoice, type AiCoachSettings } from "@/lib/coachSettings";
import { calculateTerrainData, shouldTriggerTerrainCoaching, type ElevationPoint, type TerrainData, type TerrainEvent } from "@/lib/elevationTracker";
import { GpsHelpDialog } from "@/components/GpsHelpDialog";
import { 
  determinePhase, 
  selectStatement, 
  MAX_STATEMENT_USES,
  type CoachingPhase 
} from "@shared/coachingStatements";

import coachAvatar from "@assets/generated_images/glowing_ai_voice_sphere_interface.png";

interface TurnInstruction {
  instruction: string;
  maneuver: string;
  distance: number;
  duration: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  cumulativeDistance: number;
}

interface RouteData {
  id: string;
  routeName: string;
  difficulty: string;
  actualDistance: number;
  polyline: string;
  waypoints: Array<{ lat: number; lng: number }>;
  startLat: number;
  startLng: number;
  turnInstructions?: TurnInstruction[];
  elevation?: {
    gain: number;
    loss: number;
    maxElevation: number;
    minElevation: number;
    profile?: ElevationPoint[];
  };
  eventId?: string;
  eventName?: string;
}

interface Position {
  lat: number;
  lng: number;
  timestamp: number;
  altitude?: number;
  altitudeAccuracy?: number;
}

// Downsample GPS track to max points while preserving route shape
// Uses Ramer-Douglas-Peucker-like approach: keep start, end, and evenly distributed points
function downsampleGpsTrack(positions: Position[], maxPoints: number = 1000): Position[] {
  if (positions.length <= maxPoints) return positions;
  
  const result: Position[] = [];
  const step = (positions.length - 1) / (maxPoints - 1);
  
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.round(i * step), positions.length - 1);
    result.push(positions[idx]);
  }
  
  // Always include the last point for accurate end position
  if (result[result.length - 1] !== positions[positions.length - 1]) {
    result[result.length - 1] = positions[positions.length - 1];
  }
  
  return result;
}

// Map component that follows runner position
function FollowRunner({ position, enabled }: { position: { lat: number; lng: number } | null; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (position && enabled) {
      map.setView([position.lat, position.lng], 17, { animate: true });
    }
  }, [map, position, enabled]);
  return null;
}

// Map component that fits bounds to show the full route
function FitBoundsToRoute({ routePoints, enabled }: { routePoints: Array<{ lat: number; lng: number }>; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (enabled && routePoints.length > 1) {
      const bounds = routePoints.map(p => [p.lat, p.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, routePoints, enabled]);
  return null;
}

// Calculate bearing between two points in degrees
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// Create arrow icon for direction indicators
// Uses a north-pointing arrow (▲) and rotates by bearing (0°=north, 90°=east)
function createArrowIcon(bearing: number, color: string): L.DivIcon {
  return L.divIcon({
    className: 'route-direction-arrow',
    html: `<div style="
      transform: rotate(${bearing}deg);
      color: ${color};
      font-size: 14px;
      font-weight: bold;
      text-shadow: 0 0 3px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.5);
      line-height: 1;
    ">▲</div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Check if two points are close (within threshold meters)
function arePointsClose(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }, thresholdMeters: number): boolean {
  const R = 6371000;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c < thresholdMeters;
}

// Offset a point perpendicular to bearing
function offsetPoint(lat: number, lng: number, bearing: number, offsetMeters: number): { lat: number; lng: number } {
  const perpBearing = (bearing + 90) % 360;
  const R = 6371000;
  const d = offsetMeters / R;
  const bearingRad = perpBearing * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;
  
  const newLatRad = Math.asin(Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearingRad));
  const newLngRad = lngRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(d) * Math.cos(latRad),
    Math.cos(d) - Math.sin(latRad) * Math.sin(newLatRad)
  );
  
  return {
    lat: newLatRad * 180 / Math.PI,
    lng: newLngRad * 180 / Math.PI
  };
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// Calculate signed turn angle using vector cross/dot product
// Returns positive for RIGHT turns, negative for LEFT turns
function getSignedTurnAngle(
  beforePoint: { lat: number; lng: number },
  turnPoint: { lat: number; lng: number },
  afterPoint: { lat: number; lng: number }
): number {
  // Convert to local plane vectors (approximate for small distances)
  // vIn: vector from beforePoint to turnPoint
  const vInX = turnPoint.lng - beforePoint.lng;
  const vInY = turnPoint.lat - beforePoint.lat;
  // vOut: vector from turnPoint to afterPoint
  const vOutX = afterPoint.lng - turnPoint.lng;
  const vOutY = afterPoint.lat - turnPoint.lat;
  
  // Normalize vectors
  const vInLen = Math.sqrt(vInX * vInX + vInY * vInY);
  const vOutLen = Math.sqrt(vOutX * vOutX + vOutY * vOutY);
  
  if (vInLen === 0 || vOutLen === 0) return 0;
  
  const vInNormX = vInX / vInLen;
  const vInNormY = vInY / vInLen;
  const vOutNormX = vOutX / vOutLen;
  const vOutNormY = vOutY / vOutLen;
  
  // Cross product gives sin of angle (sign indicates direction)
  // In 2D coords where Y is north: positive cross = counter-clockwise = LEFT
  // We negate to get: positive = RIGHT turn, negative = LEFT turn
  const cross = vInNormX * vOutNormY - vInNormY * vOutNormX;
  // Dot product gives cos of angle
  const dot = vInNormX * vOutNormX + vInNormY * vOutNormY;
  
  // atan2(sin, cos) gives signed angle in radians
  const angleRad = Math.atan2(cross, dot);
  const angleDeg = angleRad * (180 / Math.PI);
  
  // Negate to correct the sign: positive = RIGHT, negative = LEFT
  return -angleDeg;
}

function getDirectionInstruction(currentBearing: number, nextBearing: number, distanceToWaypoint: number): string {
  const diff = ((nextBearing - currentBearing + 540) % 360) - 180;
  const distanceMeters = Math.round(distanceToWaypoint * 1000);
  
  if (Math.abs(diff) < 20) {
    return `Continue straight for ${distanceMeters} meters`;
  } else if (diff > 0 && diff < 70) {
    return `In ${distanceMeters} meters, turn slightly right`;
  } else if (diff >= 70 && diff < 110) {
    return `In ${distanceMeters} meters, turn right`;
  } else if (diff >= 110) {
    return `In ${distanceMeters} meters, turn sharp right`;
  } else if (diff < 0 && diff > -70) {
    return `In ${distanceMeters} meters, turn slightly left`;
  } else if (diff <= -70 && diff > -110) {
    return `In ${distanceMeters} meters, turn left`;
  } else {
    return `In ${distanceMeters} meters, turn sharp left`;
  }
}

// Legacy static messages removed - now using phase-based coaching from shared/coachingStatements.ts

// Legacy static feedback - kept as fallback
function getCadenceFeedback(cadence: number): string {
  if (cadence < 150) return "Try to pick up your step frequency.";
  if (cadence < 165) return "Good step rhythm, try slightly quicker steps.";
  if (cadence >= 165 && cadence <= 185) return "Perfect cadence!";
  if (cadence > 185) return "Great turnover, stay relaxed.";
  return "";
}

function bearingToCardinal(bearing: number): string {
  const directions = [
    "north", "north-east", "east", "south-east",
    "south", "south-west", "west", "north-west"
  ];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

async function getStreetName(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
    if (!res.ok) return null;
    const data = await res.json();
    const streetComponent = data.components?.find((c: any) => 
      c.types?.includes('route') || c.types?.includes('street_address')
    );
    return streetComponent?.long_name || null;
  } catch {
    return null;
  }
}

async function getInitialDirectionAnnouncement(
  currentLat: number, 
  currentLng: number, 
  routePoints: Array<{ lat: number; lng: number }>,
  targetDistance: string
): Promise<string> {
  if (routePoints.length < 2) {
    return `Your ${targetDistance} kilometer run has started. Follow the route on your map.`;
  }
  
  const firstWaypointIdx = Math.min(5, routePoints.length - 1);
  const firstWaypoint = routePoints[firstWaypointIdx];
  const bearing = getBearing(currentLat, currentLng, firstWaypoint.lat, firstWaypoint.lng);
  const direction = bearingToCardinal(bearing);
  const distanceToFirst = haversineDistance(currentLat, currentLng, firstWaypoint.lat, firstWaypoint.lng);
  const distanceMeters = Math.round(distanceToFirst * 1000);
  
  const streetName = await getStreetName(firstWaypoint.lat, firstWaypoint.lng);
  const streetPhrase = streetName ? ` towards ${streetName}` : "";
  
  let announcement = `Your ${targetDistance} kilometer run has started.`;
  
  if (distanceMeters < 50) {
    announcement += ` Head ${direction}${streetPhrase} to begin.`;
    
    const secondWaypointIdx = Math.min(firstWaypointIdx + 10, routePoints.length - 1);
    if (secondWaypointIdx > firstWaypointIdx) {
      const secondWaypoint = routePoints[secondWaypointIdx];
      const secondBearing = getBearing(firstWaypoint.lat, firstWaypoint.lng, secondWaypoint.lat, secondWaypoint.lng);
      const secondDirection = bearingToCardinal(secondBearing);
      const secondDistance = haversineDistance(firstWaypoint.lat, firstWaypoint.lng, secondWaypoint.lat, secondWaypoint.lng);
      const secondDistanceMeters = Math.round(secondDistance * 1000);
      
      const secondStreetName = await getStreetName(secondWaypoint.lat, secondWaypoint.lng);
      const secondStreetPhrase = secondStreetName ? ` onto ${secondStreetName}` : "";
      
      announcement += ` Then head ${secondDirection}${secondStreetPhrase} for about ${secondDistanceMeters} meters.`;
    }
  } else {
    announcement += ` Head ${direction}${streetPhrase} for about ${distanceMeters} meters.`;
  }
  
  return announcement;
}

export default function RunSession() {
  const [runStarted, setRunStarted] = useState(false);
  const [active, setActive] = useState(false);
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [realtimePace, setRealtimePace] = useState<string | null>(null);
  const [message, setMessage] = useState("Acquiring GPS signal...");
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [lastPredefinedCoachingTime, setLastPredefinedCoachingTime] = useState(0); // Separate timer for predefined coaching
  const [showShareModal, setShowShareModal] = useState(false);
  const [showNavMap, setShowNavMap] = useState(true);
  const [mapFollowRunner, setMapFollowRunner] = useState(true);
  const [nextTurnInstruction, setNextTurnInstruction] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"acquiring" | "active" | "error">("acquiring");
  const [gpsRestartKey, setGpsRestartKey] = useState(0); // Increment to force GPS restart
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [lastDirectionTime, setLastDirectionTime] = useState(0);
  
  const [cadence, setCadence] = useState(0);
  const [lastKmAnnounced, setLastKmAnnounced] = useState(0);
  const [kmSplits, setKmSplits] = useState<number[]>([]);
  const [motionPermission, setMotionPermission] = useState<"unknown" | "granted" | "denied" | "unavailable">("unknown");
  
  // 0.50km pace summary announcement
  const halfKmAnnouncedRef = useRef<boolean>(false);
  
  // AI Cadence Analysis state
  const [cadenceAnalysis, setCadenceAnalysis] = useState<{
    idealCadenceMin: number;
    idealCadenceMax: number;
    strideAssessment: string;
    shortAdvice: string;
    coachingAdvice: string;
  } | null>(null);
  const lastCadenceAnalysisRef = useRef<number>(0);
  const cadenceAnalysisPendingRef = useRef<boolean>(false);
  
  // Track recent coaching messages to avoid repetition
  const recentCoachingRef = useRef<string[]>([]);
  const lastProgressMilestoneRef = useRef<number>(0);
  const lastPaceRef = useRef<number>(0);
  
  // Phase-based coaching statement usage tracking (max 3 uses per statement per run)
  const [statementUsageCounts, setStatementUsageCounts] = useState<Record<string, number>>({});
  
  const [aiCoachEnabled, setAiCoachEnabled] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isResuming = urlParams.get("resume") === "true";
    
    // If resuming, try to get from saved session first
    if (isResuming) {
      const savedSession = loadActiveRunSession();
      if (savedSession) {
        return savedSession.aiCoachEnabled;
      }
    }
    
    // Otherwise use URL param (defaults to ON if not "off")
    const aiCoachParam = urlParams.get("aiCoach");
    return aiCoachParam !== "off";
  });
  const [coachSettings, setCoachSettings] = useState<AiCoachSettings>(() => loadCoachSettings());
  
  useEffect(() => {
    loadCoachSettingsFromProfile().then(setCoachSettings);
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'aiCoachSettings') {
        setCoachSettings(loadCoachSettings());
      }
    };
    
    const handleFocus = () => {
      setCoachSettings(loadCoachSettings());
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);
  const [coachingInterval] = useState(120);
  const [isCoaching, setIsCoaching] = useState(false);
  const [coachPreferences, setCoachPreferences] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [showPauseConfirmation, setShowPauseConfirmation] = useState(false);
  const [showGpsHelp, setShowGpsHelp] = useState(false);
  const [currentGpsAccuracy, setCurrentGpsAccuracy] = useState<number | undefined>(undefined);
  const [runWeather, setRunWeather] = useState<{
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    windDirection: string;
    condition: string;
    uvIndex: number;
    precipitationProbability: number;
  } | null>(null);
  const [userProfile, setUserProfile] = useState<{
    name?: string;
    dob?: string;
    gender?: string;
    height?: string;
    weight?: string;
    fitnessLevel?: string;
    desiredFitnessLevel?: string;
    coachName?: string;
    id?: string;
  } | null>(null);
  const [userGoals, setUserGoals] = useState<Array<{
    type: string;
    title: string;
    description?: string | null;
    targetDate?: string | null;
    distanceTarget?: string | null;
    timeTargetSeconds?: number | null;
    eventName?: string | null;
    weeklyRunTarget?: number | null;
    progressPercent?: number | null;
  }>>([]);
  
  const positionsRef = useRef<Position[]>([]);
  
  // GPS drift filter: sliding window buffer
  interface WindowSegment {
    lat: number;
    lng: number;
    timestamp: number;
    accuracy: number;
    deltaDist: number;
    bearing: number;
  }
  const windowBufferRef = useRef<WindowSegment[]>([]);
  const bufferedDistanceRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stepTimestampsRef = useRef<number[]>([]);
  const lastAccelRef = useRef<number>(0);
  const runMetricsRef = useRef({ time: 0, distance: 0 });
  const currentPositionRef = useRef<Position | null>(null);
  const startTimestampRef = useRef<number>(Date.now());
  const sessionIdRef = useRef<string>(`run-${Date.now()}`);
  const lastUphillCoachingTimeRef = useRef<number>(0);
  const lastDownhillCoachingTimeRef = useRef<number>(0);
  const lastHillCrestTimeRef = useRef<number>(0);
  const previousGradeRef = useRef<number | null>(null);
  const initialAnnouncementMadeRef = useRef<boolean>(false);
  const navAudioCacheRef = useRef<Map<string, string>>(new Map());
  const lastNavSpeakTimeRef = useRef<number>(0);
  const navSpeakQueueRef = useRef<string[]>([]);
  const isNavSpeakingRef = useRef<boolean>(false);
  const speechStartTimeRef = useRef<number>(0);
  const lastMovementTimeRef = useRef<number>(Date.now());
  const lastGpsFixTimeRef = useRef<number>(Date.now());
  const gpsTimeoutAttempts = useRef<number>(0); // For handleError timeout retries
  const watchdogRecoveryAttempts = useRef<number>(0); // For watchdog stall recovery
  const lastNavInstructionRef = useRef<string>("");
  const runStoppedRef = useRef<boolean>(false);
  const finishAnnouncedRef = useRef<boolean>(false);
  const lastTurnAnnouncedIndexRef = useRef<number>(-1);
  const currentStoredTurnIndexRef = useRef<number>(0);
  const turnApproachAnnouncedRef = useRef<boolean>(false);
  const turnAtAnnouncedRef = useRef<boolean>(false);
  const distanceAtTurnReachRef = useRef<number>(0); // distance (km) when we first reach the turn location
  const closestDistanceToTurnRef = useRef<number>(0); // closest we got to the turn point (meters)
  const increasingDistanceSamplesRef = useRef<number>(0); // count of consecutive samples where distance is increasing
  const lastDistanceToTurnRef = useRef<number>(0); // last measured distance to current turn
  
  // Timestamp-based timer refs for screen-off tracking
  const pausedDurationRef = useRef<number>(0);
  const pauseStartTimeRef = useRef<number | null>(null);
  const lastVisibilityTimeRef = useRef<number>(Date.now());
  
  // Real-time pace calculation: recent GPS samples for instantaneous pace
  const recentPaceSamplesRef = useRef<Array<{ distance: number; time: number; timestamp: number }>>([]);

  // Weakness detection: track pace drops during the run
  interface WeaknessEvent {
    startDistanceKm: number;
    endDistanceKm: number;
    durationSeconds: number;
    avgPaceBefore: number;
    avgPaceDuring: number;
    dropPercent: number;
    coachResponseGiven?: string;
  }
  const [detectedWeaknesses, setDetectedWeaknesses] = useState<WeaknessEvent[]>([]);
  const rollingPaceWindowRef = useRef<Array<{ distanceKm: number; timeSeconds: number; paceSecondsPerKm: number }>>([]);
  const baselinePaceRef = useRef<number>(0);
  const inSlowdownRef = useRef<boolean>(false);
  const slowdownStartRef = useRef<{ distanceKm: number; timeSeconds: number; baselinePace: number } | null>(null);
  const lastWeaknessCoachTimeRef = useRef<number>(0);

  const saveCoachingLog = useCallback(async (data: {
    eventType: string;
    topic?: string;
    responseText?: string;
    prompt?: string;
    latencyMs?: number;
  }) => {
    const userId = userProfile?.id;
    if (!userId) {
      console.warn('[CoachingLog] No userId - user may not be logged in');
      return;
    }
    
    const { time: currentTime, distance: currentDistance } = runMetricsRef.current;
    const paceSeconds = currentDistance > 0 ? currentTime / currentDistance : 0;
    const paceMins = Math.floor(paceSeconds / 60);
    const paceSecs = Math.floor(paceSeconds % 60);
    
    const logPayload = {
      userId,
      sessionKey: sessionIdRef.current,
      eventType: data.eventType,
      elapsedSeconds: Math.floor(currentTime),
      distanceKm: parseFloat(currentDistance.toFixed(2)),
      currentPace: `${paceMins}:${paceSecs.toString().padStart(2, '0')}`,
      heartRate: null,
      cadence: cadence || null,
      terrain: routeData?.elevation ? {
        grade: previousGradeRef.current,
        totalGain: routeData.elevation.gain,
        totalLoss: routeData.elevation.loss
      } : null,
      weather: runWeather || null,
      topic: data.topic,
      responseText: data.responseText,
      prompt: data.prompt,
      latencyMs: data.latencyMs,
    };
    
    console.log('[CoachingLog] Saving:', data.eventType, data.topic);
    
    try {
      const response = await fetch('/api/coaching-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logPayload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CoachingLog] Server error:', response.status, errorText);
      } else {
        console.log('[CoachingLog] Saved successfully');
      }
    } catch (error) {
      console.error('[CoachingLog] Failed to save:', error);
    }
  }, [userProfile?.id, cadence, routeData?.elevation, runWeather]);

  const searchParams = new URLSearchParams(window.location.search);
  const isResuming = searchParams.get("resume") === "true";
  const urlTargetDistance = searchParams.get("distance") || "5";
  const urlLevelId = searchParams.get("level") || "beginner";
  const urlLat = parseFloat(searchParams.get("lat") || "40.7128");
  const urlLng = parseFloat(searchParams.get("lng") || "-74.0060");
  const urlRouteName = searchParams.get("routeName") || "";
  const urlRouteId = searchParams.get("routeId") || "";
  const urlTargetTimeSeconds = parseInt(searchParams.get("targetTime") || "0");
  const urlAiCoach = searchParams.get("aiCoach");
  const urlGroupRunId = searchParams.get("groupRunId") || "";
  const urlWaitingForParticipants = searchParams.get("waiting") === "true";
  const urlExerciseType = (searchParams.get("exerciseType") as "running" | "walking") || "running";

  const [groupRunParticipants, setGroupRunParticipants] = useState<{id: string; userId: string; userName: string; role: string; invitationStatus: string}[]>([]);
  const [isGroupRun, setIsGroupRun] = useState(!!urlGroupRunId);
  const [waitingForParticipants, setWaitingForParticipants] = useState(urlWaitingForParticipants);
  const [isHost, setIsHost] = useState(false);

  const sessionMetadataRef = useRef({
    targetDistance: urlTargetDistance,
    levelId: urlLevelId,
    startLat: urlLat,
    startLng: urlLng,
    routeName: urlRouteName,
    routeId: urlRouteId,
    targetTimeSeconds: urlTargetTimeSeconds,
    exerciseType: urlExerciseType,
    eventId: "" as string | undefined,
  });

  const calculateAge = (dob: string): number | undefined => {
    if (!dob) return undefined;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  useEffect(() => {
    const profile = localStorage.getItem("userProfile");
    if (profile) {
      const parsed = JSON.parse(profile);
      setFriends(parsed.friends || []);
      setUserProfile({
        name: parsed.name,
        dob: parsed.dob,
        gender: parsed.gender,
        height: parsed.height,
        weight: parsed.weight,
        fitnessLevel: parsed.fitnessLevel,
        desiredFitnessLevel: parsed.desiredFitnessLevel,
        coachName: parsed.coachName,
        id: parsed.id,
      });
      
      // Fetch user's active goals for goal-aware coaching
      if (parsed.id) {
        fetch(`/api/goals/user/${parsed.id}`)
          .then(res => res.ok ? res.json() : [])
          .then(goals => {
            const activeGoals = goals.filter((g: any) => g.status === 'active').map((g: any) => ({
              type: g.type,
              title: g.title,
              description: g.description,
              targetDate: g.targetDate,
              distanceTarget: g.distanceTarget,
              timeTargetSeconds: g.timeTargetSeconds,
              eventName: g.eventName,
              weeklyRunTarget: g.weeklyRunTarget,
              progressPercent: g.progressPercent,
            }));
            setUserGoals(activeGoals);
          })
          .catch(err => console.error('Failed to fetch goals for coaching:', err));
      }
      
      const savedPrefs = localStorage.getItem("coachPreferences");
      if (savedPrefs) {
        setCoachPreferences(savedPrefs);
      }
    }
    
    const savedRoute = localStorage.getItem("activeRoute");
    if (savedRoute && !isResuming) {
      const route: RouteData = JSON.parse(savedRoute);
      setRouteData(route);
      if (route.polyline) {
        const points = decodePolyline(route.polyline);
        setRoutePoints(points);
      }
      sessionMetadataRef.current = {
        ...sessionMetadataRef.current,
        routeId: route.id || sessionMetadataRef.current.routeId,
        routeName: route.routeName || sessionMetadataRef.current.routeName,
        startLat: route.startLat ?? sessionMetadataRef.current.startLat,
        startLng: route.startLng ?? sessionMetadataRef.current.startLng,
        targetDistance: route.actualDistance?.toString() || sessionMetadataRef.current.targetDistance,
        levelId: route.difficulty || sessionMetadataRef.current.levelId,
        eventId: route.eventId || sessionMetadataRef.current.eventId,
      };
    }
    
    if (isResuming) {
      const savedSession = loadActiveRunSession();
      if (savedSession) {
        console.log("Restoring session:", savedSession);
        setDistance(savedSession.distanceKm);
        setCadence(savedSession.cadence);
        setKmSplits(savedSession.kmSplits);
        setLastKmAnnounced(savedSession.lastKmAnnounced);
        setAudioEnabled(savedSession.audioEnabled);
        setAiCoachEnabled(savedSession.aiCoachEnabled);
        startTimestampRef.current = savedSession.startTimestamp;
        sessionIdRef.current = savedSession.id;
        setActive(savedSession.status === 'active');
        setRunStarted(true); // Resumed sessions are already started
        
        // Restore paused duration from saved session
        const savedPausedMs = savedSession.pausedDurationMs || 0;
        
        if (savedSession.status === 'active') {
          // Session was active - background time counts as running time
          // Restore saved pause duration and calculate elapsed from timestamps
          pausedDurationRef.current = savedPausedMs;
          // Calculate correct elapsed time immediately including background time
          const correctElapsed = Math.floor((Date.now() - savedSession.startTimestamp - savedPausedMs) / 1000);
          setTime(correctElapsed);
        } else {
          // Session was paused - add off-app gap to paused duration
          const nowGap = Date.now() - savedSession.startTimestamp;
          const savedElapsedMs = savedSession.elapsedSeconds * 1000;
          const additionalPause = nowGap - savedPausedMs - savedElapsedMs;
          pausedDurationRef.current = savedPausedMs + Math.max(0, additionalPause);
          // Keep saved elapsed time for paused sessions
          setTime(savedSession.elapsedSeconds);
        }
        
        sessionMetadataRef.current = {
          targetDistance: savedSession.targetDistance,
          levelId: savedSession.levelId,
          startLat: savedSession.startLat,
          startLng: savedSession.startLng,
          routeName: savedSession.routeName,
          routeId: savedSession.routeId,
          targetTimeSeconds: savedSession.targetTimeSeconds,
          exerciseType: savedSession.exerciseType || 'running',
          eventId: savedSession.eventId,
        };
        
        if (savedSession.routePolyline) {
          setRouteData({
            id: savedSession.routeId,
            routeName: savedSession.routeName,
            polyline: savedSession.routePolyline,
            waypoints: savedSession.routeWaypoints,
            actualDistance: parseFloat(savedSession.targetDistance),
            difficulty: savedSession.levelId as any,
            startLat: savedSession.startLat,
            startLng: savedSession.startLng,
          });
          setRoutePoints(decodePolyline(savedSession.routePolyline));
        }
        
        toast.success("Run session restored!");
      }
    }
  }, [isResuming]);

  const getCoachVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      console.log("No voices available");
      return null;
    }
    
    console.log("Coach settings:", coachSettings);
    console.log("Available voices:", voices.map(v => `${v.name} (${v.lang})`).join(', '));
    
    const femaleKeywords = ['samantha', 'victoria', 'kate', 'karen', 'moira', 'female', 'fiona', 'susan', 'allison', 'catherine', 'zoe', 'nicky', 'ava', 'tessa', 'veena', 'rishi', 'serena', 'martha'];
    const maleKeywords = ['daniel', 'james', 'arthur', 'oliver', 'alex', 'fred', 'tom', 'george', 'ryan', 'aaron', 'gordon', 'lee', 'male', 'ralph', 'bruce', 'albert'];
    
    const targetGenderKeywords = coachSettings.gender === 'female' ? femaleKeywords : maleKeywords;
    const oppositeGenderKeywords = coachSettings.gender === 'female' ? maleKeywords : femaleKeywords;
    
    const isTargetGender = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      return targetGenderKeywords.some(k => name.includes(k)) && 
             !oppositeGenderKeywords.some(k => name.includes(k));
    };
    
    const isOppositeGender = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      return oppositeGenderKeywords.some(k => name.includes(k));
    };
    
    const prefs = getVoicePreferences(coachSettings);
    
    for (const name of prefs.preferredNames) {
      const voice = voices.find(v => v.name.includes(name) && !isOppositeGender(v));
      if (voice) {
        console.log("Selected voice (preferred name):", voice.name);
        return voice;
      }
    }
    
    for (const lang of prefs.langPreferences) {
      const voice = voices.find(v => v.lang.includes(lang) && isTargetGender(v));
      if (voice) {
        console.log("Selected voice (lang + gender):", voice.name);
        return voice;
      }
    }
    
    const genderMatch = voices.find(v => v.lang.startsWith('en') && isTargetGender(v));
    if (genderMatch) {
      console.log("Selected voice (gender match):", genderMatch.name);
      return genderMatch;
    }
    
    const anyEnglishNotOpposite = voices.find(v => v.lang.startsWith('en') && !isOppositeGender(v));
    if (anyEnglishNotOpposite) {
      console.log("Selected voice (english, not opposite gender):", anyEnglishNotOpposite.name);
      return anyEnglishNotOpposite;
    }
    
    const fallback = voices.find(v => v.lang.startsWith('en')) || voices[0];
    console.log("Selected voice (fallback):", fallback?.name);
    return fallback;
  }, [coachSettings]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const cachedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  
  // Listen for voiceschanged event (voices load asynchronously on mobile)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    
    const handleVoicesChanged = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        console.log('[Voice] Voices loaded:', voices.length, 'available');
        setVoicesLoaded(true);
        // Clear cached voice so it gets re-selected with proper gender
        cachedVoiceRef.current = null;
      }
    };
    
    // Check immediately in case voices are already loaded
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      setVoicesLoaded(true);
    }
    
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
    };
  }, []);
  
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // Reset turn tracking refs when route changes
  useEffect(() => {
    currentStoredTurnIndexRef.current = 0;
    turnApproachAnnouncedRef.current = false;
    turnAtAnnouncedRef.current = false;
    distanceAtTurnReachRef.current = 0;
    closestDistanceToTurnRef.current = 0;
    increasingDistanceSamplesRef.current = 0;
    lastDistanceToTurnRef.current = 0;
    lastTurnAnnouncedIndexRef.current = -1;
    console.log('[Nav] Reset turn tracking for new route instructions');
  }, [routeData?.turnInstructions]);

  const fetchGroupRunParticipants = useCallback(async () => {
    if (!urlGroupRunId) return;
    try {
      const res = await fetch(`/api/group-runs/${urlGroupRunId}/participants`);
      if (res.ok) {
        const data = await res.json();
        const profile = localStorage.getItem("userProfile");
        const userId = profile ? JSON.parse(profile).id : null;
        
        setGroupRunParticipants(data.map((p: any) => ({
          id: p.id,
          userId: p.userId,
          userName: p.userName || 'Runner',
          role: p.role,
          invitationStatus: p.invitationStatus || 'pending',
        })));
        
        // Check if current user is the host
        const hostParticipant = data.find((p: any) => p.role === 'host');
        if (hostParticipant && userId && hostParticipant.userId === userId) {
          setIsHost(true);
        }
      }
    } catch (err) {
      console.error("Failed to load group run participants:", err);
    }
  }, [urlGroupRunId]);

  useEffect(() => {
    fetchGroupRunParticipants();
  }, [fetchGroupRunParticipants]);

  // Poll for participant updates and group run status while waiting
  useEffect(() => {
    if (!urlGroupRunId || !waitingForParticipants) return;
    
    const fetchGroupRunStatus = async () => {
      try {
        const res = await fetch(`/api/group-runs/${urlGroupRunId}`);
        if (res.ok) {
          const groupRun = await res.json();
          // If host has started the run, dismiss the waiting overlay
          if (groupRun.status === 'active') {
            setWaitingForParticipants(false);
            setActive(true);
            speak("Group run started! Let's go!", { domain: 'system' });
          }
        }
      } catch (err) {
        console.error("Failed to fetch group run status:", err);
      }
    };
    
    const interval = setInterval(() => {
      fetchGroupRunParticipants();
      fetchGroupRunStatus();
    }, 3000);
    
    // Initial fetch
    fetchGroupRunStatus();
    
    return () => clearInterval(interval);
  }, [urlGroupRunId, waitingForParticipants, fetchGroupRunParticipants]);
  
  const speakWithDeviceTTS = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.log("Device TTS not available");
      return;
    }
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (!cachedVoiceRef.current) {
      cachedVoiceRef.current = getCoachVoice();
    }
    
    if (cachedVoiceRef.current) {
      utterance.voice = cachedVoiceRef.current;
      console.log("Using cached device voice:", cachedVoiceRef.current.name);
    }
    
    const prefs = getVoicePreferences(coachSettings);
    utterance.rate = prefs.rate;
    utterance.pitch = prefs.pitch;
    utterance.volume = 1;
    speechSynthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    console.log("Fallback device TTS used with voice:", cachedVoiceRef.current?.name || "default");
  }, [getCoachVoice, coachSettings]);

  const playNavAudio = useCallback(async (audioUrl: string, text: string) => {
    return new Promise<void>((resolve) => {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      let resolved = false;
      
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        isNavSpeakingRef.current = false;
        resolve();
      };
      
      // Safety timeout - ensure audio doesn't block queue for more than 30 seconds
      const timeout = setTimeout(() => {
        console.warn('[Audio] Playback timeout, releasing queue');
        cleanup();
      }, 30000);
      
      audio.onended = () => {
        clearTimeout(timeout);
        console.log('[Audio] Playback ended:', text.substring(0, 30));
        cleanup();
      };
      audio.onerror = (e) => {
        clearTimeout(timeout);
        console.error('[Audio] Playback error:', e);
        cleanup();
      };
      audio.play().then(() => {
        console.log('[Audio] Playing:', text.substring(0, 30));
      }).catch((err) => {
        clearTimeout(timeout);
        console.error('[Audio] Play failed:', err);
        cleanup();
      });
    });
  }, []);

  const processNavQueue = useCallback(async () => {
    if (isNavSpeakingRef.current || navSpeakQueueRef.current.length === 0) return;
    
    const text = navSpeakQueueRef.current.shift();
    if (!text) return;
    
    isNavSpeakingRef.current = true;
    speechStartTimeRef.current = Date.now();
    console.log('[Speech Queue] Processing:', text.substring(0, 40), 'Queue length:', navSpeakQueueRef.current.length);
    
    // If AI Coach is disabled, use device TTS directly for all speech
    if (!aiCoachEnabled) {
      console.log("AI Coach disabled - using device TTS for:", text.substring(0, 30));
      speakWithDeviceTTS(text);
      isNavSpeakingRef.current = false;
      processNavQueue();
      return;
    }
    
    // Check cache first
    const cacheKey = text.toLowerCase().trim();
    const cachedUrl = navAudioCacheRef.current.get(cacheKey);
    
    if (cachedUrl) {
      console.log("Using cached AI audio for:", text.substring(0, 30));
      await playNavAudio(cachedUrl, text);
      processNavQueue();
      return;
    }
    
    const ttsVoice = getTTSVoice(coachSettings);
    const prefs = getVoicePreferences(coachSettings);
    
    try {
      // Add timeout for TTS fetch to prevent hanging
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          tone: coachSettings.tone,
          voice: ttsVoice,
          speed: prefs.rate
        }),
        signal: controller.signal
      });
      
      clearTimeout(fetchTimeout);
      
      if (!response.ok) throw new Error('TTS failed with status: ' + response.status);
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Cache the audio URL (limit cache to 20 entries)
      if (navAudioCacheRef.current.size >= 20) {
        const firstKey = navAudioCacheRef.current.keys().next().value;
        if (firstKey) {
          const oldUrl = navAudioCacheRef.current.get(firstKey);
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          navAudioCacheRef.current.delete(firstKey);
        }
      }
      navAudioCacheRef.current.set(cacheKey, audioUrl);
      
      console.log("Using AI voice for navigation:", text.substring(0, 30));
      await playNavAudio(audioUrl, text);
    } catch (error: any) {
      console.error('Navigation TTS error, using device fallback:', error?.message || error);
      speakWithDeviceTTS(text);
      isNavSpeakingRef.current = false;
    }
    
    // Always ensure we continue processing
    setTimeout(() => processNavQueue(), 100);
  }, [coachSettings, speakWithDeviceTTS, playNavAudio, aiCoachEnabled]);

  // Domain types: 'coach' (AI coaching), 'nav' (navigation), 'system' (run control)
  // When aiCoachEnabled is OFF, 'coach' domain is blocked, others continue
  const speak = useCallback((text: string, options: { force?: boolean; domain?: 'coach' | 'nav' | 'system' } = {}) => {
    const { force = false, domain = 'coach' } = options;
    console.log("speak() called with:", text.substring(0, 40), "domain:", domain, "aiCoachEnabled:", aiCoachEnabled);
    
    // Block coaching speech when AI coach is disabled (unless forced)
    if (!force && domain === 'coach' && !aiCoachEnabled) {
      console.log("Speech blocked: AI coach disabled");
      return;
    }
    
    if (!force && !audioEnabled) {
      console.log("Speech blocked: audio disabled");
      return;
    }
    
    // Throttle speech - minimum 3 seconds between calls (except forced)
    const now = Date.now();
    if (now - lastNavSpeakTimeRef.current < 3000 && !force) {
      console.log("Speech throttled");
      return;
    }
    lastNavSpeakTimeRef.current = now;
    
    // Add to queue and process
    navSpeakQueueRef.current.push(text);
    processNavQueue();
  }, [audioEnabled, aiCoachEnabled, processNavQueue]);

  // Ref to store last accepted position for distance calculation
  const lastAcceptedPosRef = useRef<Position | null>(null);
  
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus("error");
      setMessage("GPS not available on this device");
      return;
    }

    const handlePosition = (position: GeolocationPosition) => {
      const accuracy = position.coords.accuracy;
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const timestamp = position.timestamp;
      const altitude = position.coords.altitude ?? undefined;
      const altitudeAccuracy = position.coords.altitudeAccuracy ?? undefined;
      
      console.log(`[GPS] Raw: lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}, acc=${accuracy.toFixed(1)}m, alt=${altitude?.toFixed(1) ?? 'N/A'}m, active=${active}, positions=${positionsRef.current.length}`);
      
      // Track current accuracy for help dialog
      setCurrentGpsAccuracy(accuracy);
      
      // Only require accuracy for initial lock, then accept anything reasonable
      if (gpsStatus === "acquiring" && accuracy > 30) {
        setMessage(`Refining GPS signal... (${Math.round(accuracy)}m accuracy)`);
        console.log(`[GPS] Acquiring: waiting for better accuracy`);
        return;
      }
      
      const newPos: Position = { lat, lng, timestamp, altitude, altitudeAccuracy };
      setCurrentPosition(newPos);
      
      // First accurate fix - GPS locked!
      if (gpsStatus === "acquiring") {
        console.log(`[GPS] LOCKED! Setting status to active`);
        setGpsStatus("active");
        setMessage("GPS locked! Tap 'Start Run' when you're ready.");
        setCurrentGpsAccuracy(undefined);
        positionsRef.current = [newPos];
        lastAcceptedPosRef.current = newPos;
        
        // Fetch weather
        console.log('[Weather] Fetching weather for location:', lat, lng);
        fetch(`/api/weather/current?lat=${lat}&lng=${lng}`)
          .then(res => {
            console.log('[Weather] Response status:', res.status);
            return res.ok ? res.json() : null;
          })
          .then(data => { 
            console.log('[Weather] Weather data received:', data);
            // API returns { current: {...} } but we need the flat data
            if (data?.current) setRunWeather(data.current); 
          })
          .catch(err => console.warn('[Weather] Weather fetch failed:', err));
        return;
      }
      
      // Distance tracking - MINIMAL FILTERING
      const lastPos = lastAcceptedPosRef.current;
      if (!lastPos) {
        console.log(`[GPS] No last position, storing this one`);
        lastAcceptedPosRef.current = newPos;
        positionsRef.current.push(newPos);
        return;
      }
      
      // Calculate distance in METERS
      const distanceKm = haversineDistance(lastPos.lat, lastPos.lng, lat, lng);
      const distanceM = distanceKm * 1000;
      const timeDiffSec = (timestamp - lastPos.timestamp) / 1000;
      const speedMps = timeDiffSec > 0 ? distanceM / timeDiffSec : 0;
      const speedKmh = speedMps * 3.6;
      
      console.log(`[GPS] Delta: ${distanceM.toFixed(1)}m in ${timeDiffSec.toFixed(1)}s = ${speedKmh.toFixed(1)}km/h, active=${active}`);
      
      // MINIMAL REJECTION - only reject truly impossible values
      if (distanceM < 1) {
        // Less than 1 meter - too small to count, but update position
        console.log(`[GPS] Too small (${distanceM.toFixed(1)}m < 1m), skipping`);
        return;
      }
      
      if (speedKmh > 50) {
        // Over 50 km/h is definitely a GPS jump, reject completely
        console.log(`[GPS] Speed too high (${speedKmh.toFixed(1)}km/h > 50km/h), GPS jump`);
        return;
      }
      
      if (accuracy > 100) {
        // Very bad accuracy, reject
        console.log(`[GPS] Accuracy too bad (${accuracy.toFixed(0)}m > 100m), rejecting`);
        return;
      }
      
      // ACCEPT THE DISTANCE!
      console.log(`[GPS] *** ADDING ${distanceM.toFixed(1)}m (${distanceKm.toFixed(4)}km) ***`);
      setDistance(prev => {
        const newDist = prev + distanceKm;
        console.log(`[GPS] Distance updated: ${prev.toFixed(3)}km -> ${newDist.toFixed(3)}km`);
        return newDist;
      });
      
      // Update refs
      lastAcceptedPosRef.current = newPos;
      positionsRef.current.push(newPos);
      lastMovementTimeRef.current = Date.now();
      lastGpsFixTimeRef.current = Date.now();
      gpsTimeoutAttempts.current = 0; // Reset timeout counter on successful fix
      watchdogRecoveryAttempts.current = 0; // Reset watchdog counter on successful fix
      
      // Calculate real-time pace from recent GPS samples (last 10-15 seconds)
      const now = Date.now();
      recentPaceSamplesRef.current.push({ 
        distance: distanceKm, 
        time: timeDiffSec,
        timestamp: now 
      });
      
      // Keep only samples from last 15 seconds
      const cutoffTime = now - 15000;
      recentPaceSamplesRef.current = recentPaceSamplesRef.current.filter(s => s.timestamp > cutoffTime);
      
      // Calculate real-time pace from recent samples
      if (recentPaceSamplesRef.current.length >= 2) {
        const recentDistance = recentPaceSamplesRef.current.reduce((sum, s) => sum + s.distance, 0);
        const recentTime = recentPaceSamplesRef.current.reduce((sum, s) => sum + s.time, 0);
        
        if (recentDistance > 0.005 && recentTime > 2) { // At least 5m and 2 seconds
          const realtimePaceSecsPerKm = recentTime / recentDistance;
          
          // Only show valid pace (between 2:00 and 15:00 per km)
          if (realtimePaceSecsPerKm > 120 && realtimePaceSecsPerKm < 900) {
            const mins = Math.floor(realtimePaceSecsPerKm / 60);
            const secs = Math.floor(realtimePaceSecsPerKm % 60);
            setRealtimePace(`${mins}'${secs.toString().padStart(2, '0')}"`);
          } else {
            // Invalid pace, fall back to average
            setRealtimePace(null);
          }
          
          // Weakness Detection: Track pace drops during the run
          const currentPaceSecsPerKm = recentTime / recentDistance;
          const currentDistanceKm = distance + distanceKm;
          const currentTimeSeconds = runMetricsRef.current.time;
          
          // Add to rolling window (keep last 90 seconds of pace data for comparison)
          rollingPaceWindowRef.current.push({
            distanceKm: currentDistanceKm,
            timeSeconds: currentTimeSeconds,
            paceSecondsPerKm: currentPaceSecsPerKm,
          });
          
          // Remove samples older than 90 seconds
          const windowCutoff = currentTimeSeconds - 90;
          rollingPaceWindowRef.current = rollingPaceWindowRef.current.filter(
            s => s.timeSeconds > windowCutoff
          );
          
          // Calculate baseline from oldest 30 seconds of window (rolling baseline)
          // Compare against most recent 15 seconds to detect acute drops
          if (rollingPaceWindowRef.current.length >= 10) {
            const windowEnd = rollingPaceWindowRef.current[rollingPaceWindowRef.current.length - 1].timeSeconds;
            
            // Baseline: samples from 60-90 seconds ago (or oldest available)
            const baselineSamples = rollingPaceWindowRef.current.filter(
              s => s.timeSeconds < windowEnd - 30
            );
            
            // Current: samples from last 15 seconds
            const recentSamples = rollingPaceWindowRef.current.filter(
              s => s.timeSeconds >= windowEnd - 15
            );
            
            if (baselineSamples.length >= 3 && recentSamples.length >= 2) {
              // Use median to reduce GPS noise impact
              const sortedBaseline = baselineSamples.map(s => s.paceSecondsPerKm).sort((a, b) => a - b);
              const sortedRecent = recentSamples.map(s => s.paceSecondsPerKm).sort((a, b) => a - b);
              
              const baselineMedian = sortedBaseline[Math.floor(sortedBaseline.length / 2)];
              const recentMedian = sortedRecent[Math.floor(sortedRecent.length / 2)];
              
              baselinePaceRef.current = baselineMedian;
              
              // Detect pace drop: current pace >= 1.75x baseline (75% slower)
              // Only trigger if baseline is valid running pace (< 12 min/km)
              const dropThreshold = 1.75;
              const isSignificantDrop = baselineMedian > 0 && 
                baselineMedian < 720 && // Baseline must be actual running (< 12 min/km)
                recentMedian >= baselineMedian * dropThreshold &&
                recentMedian < 900; // Ignore stopped (> 15 min/km)
              
              if (isSignificantDrop && !inSlowdownRef.current) {
                // Start of a slowdown
                inSlowdownRef.current = true;
                slowdownStartRef.current = {
                  distanceKm: currentDistanceKm,
                  timeSeconds: currentTimeSeconds,
                  baselinePace: baselineMedian,
                };
                console.log(`[Weakness] Slowdown detected at ${currentDistanceKm.toFixed(2)}km - pace ${(recentMedian/60).toFixed(1)} vs baseline ${(baselineMedian/60).toFixed(1)} min/km`);
                
                // Trigger dynamic coaching response (only if AI coach enabled and not recently coached)
                const coachNow = Date.now();
                if (aiCoachEnabled && audioEnabled && coachNow - lastWeaknessCoachTimeRef.current > 60000) {
                  lastWeaknessCoachTimeRef.current = coachNow;
                  
                  // Determine coaching style based on user profile
                  const profile = userProfile;
                  const isHighFitness = profile?.fitnessLevel === 'expert' || profile?.fitnessLevel === 'advanced' || profile?.fitnessLevel === 'intermediate';
                  const hasPerformanceGoal = userGoals?.some(g => g.type === 'event' || g.type === 'distance_time');
                  const userAge = profile?.dob ? calculateAge(profile.dob) : undefined;
                  const isOlder = userAge && userAge > 55;
                  const isWeightLossGoal = userGoals?.some(g => g.title?.toLowerCase().includes('weight'));
                  
                  // Dynamic message based on profile
                  let coachMessage: string;
                  if (isHighFitness && hasPerformanceGoal && !isOlder) {
                    // Fit athlete - encourage pushing through
                    const encouragements = [
                      "I see you're slowing down. Dig deep! You've got the strength to push through this.",
                      "Come on, don't give in now! Find your rhythm and power through.",
                      "You're tougher than this moment. Reset your breathing and pick it up!",
                      "This is where champions are made. Push through the discomfort!",
                    ];
                    coachMessage = encouragements[Math.floor(Math.random() * encouragements.length)];
                  } else if (isWeightLossGoal || isOlder || profile?.fitnessLevel === 'beginner') {
                    // Beginner or recovery focus - gentle support
                    const gentleMessages = [
                      "I noticed you're slowing down. That's perfectly okay. Take a moment if you need it.",
                      "Listen to your body. It's okay to ease up when you need to.",
                      "You're doing great just being out here. Take it at your own pace.",
                      "Every step counts. There's no rush - find a comfortable rhythm.",
                    ];
                    coachMessage = gentleMessages[Math.floor(Math.random() * gentleMessages.length)];
                  } else {
                    // Moderate - balanced approach
                    const balancedMessages = [
                      "You're slowing a bit. Take a breath and ease back into your pace when ready.",
                      "I see the pace dropping. Focus on your form and breathing.",
                      "Finding it tough? That's okay. Steady yourself and build back up gradually.",
                    ];
                    coachMessage = balancedMessages[Math.floor(Math.random() * balancedMessages.length)];
                  }
                  
                  // Speak the coaching message
                  speak(coachMessage, { domain: 'coach', force: true });
                  
                  // Log weakness coaching
                  saveCoachingLog({
                    eventType: 'weakness_detected',
                    topic: 'pace_drop',
                    responseText: coachMessage,
                  });
                }
              } else if (!isSignificantDrop && inSlowdownRef.current && slowdownStartRef.current) {
                // End of slowdown - record the event
                const durationSeconds = currentTimeSeconds - slowdownStartRef.current.timeSeconds;
                
                // Only record if slowdown lasted at least 30 seconds
                if (durationSeconds >= 30) {
                  const event: WeaknessEvent = {
                    startDistanceKm: slowdownStartRef.current.distanceKm,
                    endDistanceKm: currentDistanceKm,
                    durationSeconds,
                    avgPaceBefore: slowdownStartRef.current.baselinePace,
                    avgPaceDuring: recentMedian,
                    dropPercent: ((recentMedian - slowdownStartRef.current.baselinePace) / slowdownStartRef.current.baselinePace) * 100,
                  };
                  
                  setDetectedWeaknesses(prev => [...prev, event]);
                  console.log(`[Weakness] Recorded: ${event.startDistanceKm.toFixed(2)}-${event.endDistanceKm.toFixed(2)}km, ${durationSeconds}s, ${event.dropPercent.toFixed(0)}% drop`);
                }
                
                inSlowdownRef.current = false;
                slowdownStartRef.current = null;
              }
            }
          }
        } else {
          // Not enough recent data, fall back to average
          setRealtimePace(null);
        }
      } else {
        // Not enough samples, fall back to average
        setRealtimePace(null);
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.error("[GPS] Error:", error.code, error.message);
      
      switch (error.code) {
        case error.PERMISSION_DENIED:
          setGpsStatus("error");
          setMessage("Please enable location access");
          break;
        case error.POSITION_UNAVAILABLE:
          // Don't immediately set to error - may be temporary
          // watchPosition will automatically retry
          console.log("[GPS] Position unavailable, waiting for retry...");
          setMessage("GPS signal weak - reconnecting...");
          break;
        case error.TIMEOUT:
          // Timeouts are common on mobile - watchPosition will automatically retry
          gpsTimeoutAttempts.current++;
          console.log(`[GPS] Timeout ${gpsTimeoutAttempts.current} - watchPosition will retry`);
          setMessage("GPS signal weak - reconnecting...");
          // Note: We never set gpsStatus to "error" for timeouts
          // The watchdog will handle severe stalls via restart
          break;
      }
    };

    console.log(`[GPS] Starting watchPosition`);
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,      // Always get fresh position
        timeout: 15000      // 15 second timeout
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        console.log(`[GPS] Stopping watchPosition`);
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [gpsStatus, gpsRestartKey]); // Include gpsRestartKey to allow forced restarts

  // Handle visibility change - ensure GPS resumes and distance is recalculated
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[GPS] Page became visible, checking GPS status');
        const timeSinceLastFix = Date.now() - lastGpsFixTimeRef.current;
        
        // If we've been hidden for a while, force a GPS restart to get fresh data
        if (timeSinceLastFix > 10000 && gpsStatus === "active") {
          console.log(`[GPS] Was hidden for ${Math.round(timeSinceLastFix / 1000)}s, triggering GPS refresh`);
          setGpsRestartKey(prev => prev + 1);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [gpsStatus]);

  // GPS Watchdog: Monitor for stale GPS and attempt recovery
  // Track last restart time separately to avoid false positives
  const lastRecoveryAttemptTimeRef = useRef<number>(0);
  
  useEffect(() => {
    // Run watchdog at all times to allow recovery during both acquisition and active run
    // Only skip if gpsStatus is "error" due to permission denied (user must fix manually)
    
    const watchdogInterval = setInterval(() => {
      const timeSinceLastFix = Date.now() - lastGpsFixTimeRef.current;
      const timeSinceLastRecovery = Date.now() - lastRecoveryAttemptTimeRef.current;
      
      // If no GPS fix for 30 seconds, warn user and potentially recover
      if (timeSinceLastFix > 30000 && gpsStatus !== "error") {
        console.warn(`[GPS Watchdog] No fix for ${Math.round(timeSinceLastFix / 1000)}s - GPS may be stale`);
        
        if (timeSinceLastFix > 60000 && timeSinceLastRecovery > 45000) {
          // Severe GPS stall - attempt recovery by restarting the watchPosition
          // Only attempt if we haven't tried in the last 45 seconds
          if (watchdogRecoveryAttempts.current < 5) {
            watchdogRecoveryAttempts.current++;
            lastRecoveryAttemptTimeRef.current = Date.now();
            console.log(`[GPS Watchdog] Attempting recovery via restart (attempt ${watchdogRecoveryAttempts.current}/5)`);
            setMessage(`Reconnecting GPS... (attempt ${watchdogRecoveryAttempts.current})`);
            // Increment restart key to trigger the main GPS useEffect to restart
            setGpsRestartKey(prev => prev + 1);
          } else {
            setMessage("GPS signal lost - try moving to open area");
          }
        } else {
          setMessage("GPS signal weak - keep phone visible");
        }
      } else if (timeSinceLastFix < 10000 && gpsStatus === "active") {
        // GPS is working (we got a real fix in last 10 seconds)
        // Clear warning and reset recovery counter
        if (watchdogRecoveryAttempts.current > 0) {
          console.log("[GPS Watchdog] GPS recovered successfully after restart");
          watchdogRecoveryAttempts.current = 0;
        }
        setMessage("");
      }
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(watchdogInterval);
  }, [gpsStatus]);

  // Speech queue watchdog - recover if stuck for more than 45 seconds
  useEffect(() => {
    if (!active) return;
    
    const speechWatchdog = setInterval(() => {
      if (isNavSpeakingRef.current && speechStartTimeRef.current > 0) {
        const stuckTime = Date.now() - speechStartTimeRef.current;
        if (stuckTime > 45000) {
          console.warn(`[Speech Watchdog] Queue stuck for ${Math.round(stuckTime / 1000)}s - forcing recovery`);
          isNavSpeakingRef.current = false;
          speechStartTimeRef.current = 0;
          // Force process next item if queue has items
          if (navSpeakQueueRef.current.length > 0) {
            console.log('[Speech Watchdog] Processing next item in queue');
            setTimeout(() => processNavQueue(), 100);
          }
        }
      }
    }, 15000);
    
    return () => clearInterval(speechWatchdog);
  }, [active, processNavQueue]);

  useEffect(() => {
    console.log('[Pre-Run Summary] Checking conditions:', {
      gpsStatus,
      hasPosition: !!currentPosition,
      announcementMade: initialAnnouncementMadeRef.current,
      isResuming
    });
    
    if (gpsStatus !== "active" || !currentPosition || initialAnnouncementMadeRef.current) return;
    if (isResuming) {
      initialAnnouncementMadeRef.current = true;
      speak("Welcome back! Resuming your run.", { domain: 'system' });
      return;
    }
    
    initialAnnouncementMadeRef.current = true;
    console.log('[Pre-Run Summary] Generating pre-run summary...');
    
    const metadata = sessionMetadataRef.current;
    const targetDistNum = parseFloat(metadata.targetDistance);
    
    const speakFallback = () => {
      console.log('[Pre-Run Summary] Using fallback announcement');
      getInitialDirectionAnnouncement(
        currentPosition.lat,
        currentPosition.lng,
        routePoints,
        metadata.targetDistance
      ).then(announcement => {
        const announcementWithPrompt = announcement + " Tap Start Run when you're ready.";
        speak(announcementWithPrompt, { domain: 'coach' });
      });
    };
    
    if (!isFinite(targetDistNum) || targetDistNum <= 0) {
      console.log('[Pre-Run Summary] Invalid target distance, using fallback');
      speakFallback();
      return;
    }
    
    const generateAndSpeakSummary = async () => {
      try {
        const firstTurn = routeData?.turnInstructions?.[0];
        const summaryRequest = {
          routeName: routeData?.routeName || metadata.routeName || "Your route",
          targetDistance: targetDistNum,
          targetTimeSeconds: metadata.targetTimeSeconds,
          difficulty: routeData?.difficulty || metadata.levelId || "moderate",
          elevationGain: routeData?.elevation?.gain,
          elevationLoss: routeData?.elevation?.loss,
          elevationProfile: routeData?.elevation?.profile,
          terrainType: undefined,
          weather: runWeather ? {
            temperature: runWeather.temperature,
            humidity: runWeather.humidity,
            windSpeed: runWeather.windSpeed,
            conditions: runWeather.condition
          } : undefined,
          coachName: userProfile?.coachName,
          userName: userProfile?.name,
          includeAiConfig: true,
          firstTurnInstruction: firstTurn ? {
            instruction: firstTurn.instruction,
            maneuver: firstTurn.maneuver,
            distance: firstTurn.distance
          } : undefined
        };
        
        console.log('[Pre-Run Summary] Calling API with:', { 
          routeName: summaryRequest.routeName,
          targetDistance: summaryRequest.targetDistance,
          difficulty: summaryRequest.difficulty,
          elevationGain: summaryRequest.elevationGain,
          elevationLoss: summaryRequest.elevationLoss,
          hasElevationProfile: !!summaryRequest.elevationProfile?.length,
          hasWeather: !!summaryRequest.weather,
          firstTurnInstruction: summaryRequest.firstTurnInstruction
        });
        
        // Add timeout for pre-run summary API call
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        
        const response = await fetch('/api/ai/run-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(summaryRequest),
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[Pre-Run Summary] Got summary, length:', data.summary?.length || 0);
          if (data.summary && typeof data.summary === 'string') {
            // Add prompt to click Start Run at the end
            const summaryWithPrompt = data.summary + " When you're ready, tap the Start Run button to begin your session.";
            speak(summaryWithPrompt, { domain: 'coach' });
            return;
          }
        } else {
          console.error('[Pre-Run Summary] API error:', response.status, await response.text().catch(() => 'unknown'));
        }
        speakFallback();
      } catch (err: any) {
        console.warn('[Pre-Run Summary] Generation failed:', err?.message || err);
        speakFallback();
      }
    };
    
    generateAndSpeakSummary();
  }, [gpsStatus, currentPosition, routePoints, isResuming, speak, routeData, runWeather, coachSettings, userProfile]);

  useEffect(() => {
    if (!active || !currentPosition || routePoints.length < 2) return;
    
    const now = Date.now();
    
    // Check if runner moved in last 15 seconds (based on GPS segment acceptance)
    const timeSinceLastMove = now - lastMovementTimeRef.current;
    const isMoving = timeSinceLastMove < 15000;
    
    let nearestIndex = currentWaypointIndex;
    let nearestDistance = Infinity;
    
    const lookBack = Math.max(0, currentWaypointIndex - 10);
    const lookForward = Math.min(routePoints.length, currentWaypointIndex + 150);
    
    for (let i = lookBack; i < lookForward; i++) {
      const point = routePoints[i];
      const dist = haversineDistance(currentPosition.lat, currentPosition.lng, point.lat, point.lng);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }
    
    if (nearestIndex !== currentWaypointIndex) {
      // Allow index to update in EITHER direction if runner is reasonably close to route
      // This handles out-and-back routes where the runner needs to retrace their path
      // 80m threshold accounts for GPS drift while still tracking properly
      if (nearestIndex >= currentWaypointIndex || nearestDistance < 0.08) {
        setCurrentWaypointIndex(nearestIndex);
        console.log(`Waypoint updated: ${nearestIndex}/${routePoints.length}, distance: ${(nearestDistance * 1000).toFixed(0)}m, direction: ${nearestIndex >= currentWaypointIndex ? 'forward' : 'backward'}`);
      }
    }
    
    // Skip navigation announcements if not moving or too soon after last announcement
    if (now - lastDirectionTime < 8000) return;
    if (!isMoving) {
      console.log("Skipping navigation - runner is stationary");
      return;
    }
    
    // Calculate distance to finish line (last point on route)
    const finishPoint = routePoints[routePoints.length - 1];
    const distanceToFinish = haversineDistance(currentPosition.lat, currentPosition.lng, finishPoint.lat, finishPoint.lng);
    
    // Calculate progress through the route (must be at least 85% through before announcing finish)
    const routeProgress = nearestIndex / routePoints.length;
    
    // Only announce approaching finish once, when within 50 meters AND runner has completed at least 85% of route
    // This prevents false triggers on loop routes where start and finish are the same location
    if (distanceToFinish < 0.05 && routeProgress > 0.85 && !finishAnnouncedRef.current) {
      finishAnnouncedRef.current = true;
      speak("You're approaching the finish. Let's push to the end. Great job!", { domain: 'coach' });
      setMessage("Almost there! Finish strong!");
      setLastDirectionTime(now);
      setLastMessageTime(now);
      return;
    }
    
    if (nearestDistance > 0.15) {
      const nearestPoint = routePoints[nearestIndex];
      const distMeters = Math.round(nearestDistance * 1000);
      
      // Try to get street name for the point to return to
      getStreetName(nearestPoint.lat, nearestPoint.lng).then(streetName => {
        const instruction = streetName 
          ? `You're ${distMeters} meters off route. Head towards ${streetName} to get back on track.`
          : `You're ${distMeters} meters off route. Check your map to get back on track.`;
        speak(instruction, { domain: 'nav' });
        setMessage(instruction);
        setLastDirectionTime(Date.now());
        setLastMessageTime(Date.now());
      });
      return;
    }
    
    // PRIORITY: Use stored turn instructions from Google Directions API (accurate street names)
    if (routeData?.turnInstructions && routeData.turnInstructions.length > 0) {
      const storedInstructions = routeData.turnInstructions;
      const currentDistanceKm = distance; // distance is already in km
      
      // === DYNAMIC RECALIBRATION ===
      // On every GPS update, check if we're closer to a LATER instruction than the current one
      // This handles missed waypoints, GPS jumps, and app pauses
      const recalibrateTurnPointer = () => {
        const currentIdx = currentStoredTurnIndexRef.current;
        if (currentIdx >= storedInstructions.length) return;
        
        const currentTurn = storedInstructions[currentIdx];
        const distanceToCurrentTurn = haversineDistance(
          currentPosition.lat, currentPosition.lng, 
          currentTurn.startLat, currentTurn.startLng
        ) * 1000;
        
        // Always check recalibration if:
        // - We're far from current waypoint (> 80m) 
        // - Distance keeps increasing for 2+ samples
        // - We're past the approach announcement and distance is growing
        const shouldCheckRecalibration = distanceToCurrentTurn > 80 || 
          (increasingDistanceSamplesRef.current >= 2 && distanceToCurrentTurn > 50) ||
          (turnApproachAnnouncedRef.current && distanceToCurrentTurn > 60);
        
        if (!shouldCheckRecalibration) return;
        
        // === SKIP LIMITS ===
        const MAX_WAYPOINTS_TO_SKIP = 5; // Never skip more than 5 waypoints at once
        const totalInstructions = storedInstructions.length;
        const targetDistNum = parseFloat(sessionMetadataRef.current.targetDistance || "0");
        
        // Protect final waypoints - don't allow jumping to last 3 instructions
        // until we've covered at least 60% of expected distance
        const progressPercent = targetDistNum > 0 ? (currentDistanceKm / targetDistNum) * 100 : 0;
        const protectedFinalCount = progressPercent < 60 ? 3 : 1;
        const maxAllowedIdx = totalInstructions - protectedFinalCount;
        
        // Calculate runner's direction of travel using recent GPS points
        const positions = positionsRef.current;
        let runnerBearing = null;
        if (positions.length >= 3) {
          const recentPos = positions.slice(-5); // Last 5 positions
          if (recentPos.length >= 2) {
            const startPos = recentPos[0];
            const endPos = recentPos[recentPos.length - 1];
            // Calculate bearing from recent movement
            const dLon = (endPos.lng - startPos.lng) * Math.PI / 180;
            const lat1 = startPos.lat * Math.PI / 180;
            const lat2 = endPos.lat * Math.PI / 180;
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            runnerBearing = Math.atan2(y, x) * 180 / Math.PI;
            if (runnerBearing < 0) runnerBearing += 360;
          }
        }
        
        // Scan forward to find if any later turn is closer than current
        let bestIdx = currentIdx;
        let bestDistance = distanceToCurrentTurn;
        
        // Limit how far ahead we scan
        const maxScanIdx = Math.min(currentIdx + MAX_WAYPOINTS_TO_SKIP, maxAllowedIdx);
        
        for (let i = currentIdx + 1; i <= maxScanIdx && i < storedInstructions.length; i++) {
          const candidate = storedInstructions[i];
          const maneuver = (candidate.maneuver || '').toLowerCase();
          const instruction = (candidate.instruction || '').toLowerCase();
          
          // Check if this is a meaningful instruction
          const isTurn = maneuver.includes('turn') || 
                        maneuver.includes('left') || 
                        maneuver.includes('right') ||
                        instruction.includes('turn left') || 
                        instruction.includes('turn right');
          const isSignificant = maneuver.includes('roundabout') ||
                               maneuver.includes('merge') ||
                               instruction.includes('roundabout');
          const isSkippable = (maneuver === 'straight' || maneuver === '') && 
                             !instruction.includes('turn') && 
                             !instruction.includes('left') && 
                             !instruction.includes('right') &&
                             candidate.distance <= 10;
          
          if (!isTurn && !isSignificant && isSkippable) continue;
          
          const distanceToCandidate = haversineDistance(
            currentPosition.lat, currentPosition.lng,
            candidate.startLat, candidate.startLng
          ) * 1000;
          
          // === DIRECTION CHECK ===
          // Runner must be traveling TOWARD the candidate waypoint to skip to it
          if (runnerBearing !== null && distanceToCandidate > 30) {
            // Calculate bearing from runner to candidate waypoint
            const dLon = (candidate.startLng - currentPosition.lng) * Math.PI / 180;
            const lat1 = currentPosition.lat * Math.PI / 180;
            const lat2 = candidate.startLat * Math.PI / 180;
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            let waypointBearing = Math.atan2(y, x) * 180 / Math.PI;
            if (waypointBearing < 0) waypointBearing += 360;
            
            // Calculate bearing difference
            let bearingDiff = Math.abs(runnerBearing - waypointBearing);
            if (bearingDiff > 180) bearingDiff = 360 - bearingDiff;
            
            // If running more than 90 degrees away from waypoint, don't skip to it
            if (bearingDiff > 90) {
              console.log(`[Nav Recal] Skip idx ${i}: runner heading ${runnerBearing.toFixed(0)}°, waypoint at ${waypointBearing.toFixed(0)}° (diff: ${bearingDiff.toFixed(0)}°)`);
              continue;
            }
          }
          
          // This turn is closer AND we're significantly closer to it than current
          // Use a 25m hysteresis to prevent premature skipping
          if (distanceToCandidate < bestDistance - 25 && distanceToCandidate < 150) {
            bestIdx = i;
            bestDistance = distanceToCandidate;
            console.log(`[Nav Recal] Found closer turn at idx ${i}: ${distanceToCandidate.toFixed(0)}m (vs current ${distanceToCurrentTurn.toFixed(0)}m)`);
          }
        }
        
        // If we found a better turn, jump to it
        if (bestIdx > currentIdx) {
          const skippedCount = bestIdx - currentIdx;
          console.log(`[Nav Recal] RECALIBRATING: Jumping from idx ${currentIdx} to ${bestIdx} (skipping ${skippedCount}, max allowed: ${MAX_WAYPOINTS_TO_SKIP}) - ${storedInstructions[bestIdx].instruction}`);
          currentStoredTurnIndexRef.current = bestIdx;
          turnApproachAnnouncedRef.current = false;
          turnAtAnnouncedRef.current = false;
          distanceAtTurnReachRef.current = 0;
          closestDistanceToTurnRef.current = 0;
          increasingDistanceSamplesRef.current = 0;
          lastDistanceToTurnRef.current = 0;
        }
      };
      
      // Run recalibration check on every GPS update
      recalibrateTurnPointer();
      
      // Find the next valid instruction starting from current pointer
      let currentIdx = currentStoredTurnIndexRef.current;
      let turn = null;
      
      // Find next meaningful instruction (turns, significant maneuvers, or direction changes)
      while (currentIdx < storedInstructions.length) {
        const candidate = storedInstructions[currentIdx];
        const maneuver = (candidate.maneuver || '').toLowerCase();
        const instruction = (candidate.instruction || '').toLowerCase();
        
        // Accept if it has a turn maneuver OR the instruction mentions turning
        const isTurn = maneuver.includes('turn') || 
                      maneuver.includes('left') || 
                      maneuver.includes('right') ||
                      instruction.includes('turn left') || 
                      instruction.includes('turn right');
        
        // Also accept roundabouts, merges, and other significant maneuvers
        const isSignificant = maneuver.includes('roundabout') ||
                             maneuver.includes('merge') ||
                             maneuver.includes('ramp') ||
                             instruction.includes('roundabout') ||
                             instruction.includes('enter') ||
                             instruction.includes('exit');
        
        // Accept any instruction with meaningful distance (> 5m) that's not just "straight"
        const isSkippable = (maneuver === 'straight' || maneuver === '') && 
                           !instruction.includes('turn') && 
                           !instruction.includes('left') && 
                           !instruction.includes('right') &&
                           candidate.distance <= 10;
        
        if (isTurn || isSignificant || !isSkippable) {
          turn = candidate;
          console.log(`[Nav] Found instruction at idx ${currentIdx}: "${candidate.instruction}" (maneuver: ${maneuver || 'none'}, dist: ${candidate.distance}m)`);
          break;
        }
        currentIdx++;
      }
      
      // Update pointer if we skipped some turns
      if (currentIdx !== currentStoredTurnIndexRef.current) {
        currentStoredTurnIndexRef.current = currentIdx;
        turnApproachAnnouncedRef.current = false;
        turnAtAnnouncedRef.current = false;
        distanceAtTurnReachRef.current = 0;
        closestDistanceToTurnRef.current = 0;
      }
      
      if (turn && currentIdx < storedInstructions.length) {
        const distanceToTurn = haversineDistance(currentPosition.lat, currentPosition.lng, turn.startLat, turn.startLng) * 1000;
        
        // Check if we should advance to the next turn
        // We advance when: at-turn announced AND (closer to next turn OR traveled enough distance)
        if (turnAtAnnouncedRef.current) {
          // Find the next valid instruction after current
          let nextValidIdx = currentIdx + 1;
          let nextTurn = null;
          while (nextValidIdx < storedInstructions.length) {
            const candidate = storedInstructions[nextValidIdx];
            const maneuver = (candidate.maneuver || '').toLowerCase();
            const instruction = (candidate.instruction || '').toLowerCase();
            
            const isTurn = maneuver.includes('turn') || 
                          maneuver.includes('left') || 
                          maneuver.includes('right') ||
                          instruction.includes('turn left') || 
                          instruction.includes('turn right');
            const isSignificant = maneuver.includes('roundabout') ||
                                 maneuver.includes('merge') ||
                                 instruction.includes('roundabout');
            const isSkippable = (maneuver === 'straight' || maneuver === '') && 
                               !instruction.includes('turn') && 
                               !instruction.includes('left') && 
                               !instruction.includes('right') &&
                               candidate.distance <= 10;
            
            if (isTurn || isSignificant || !isSkippable) {
              nextTurn = candidate;
              break;
            }
            nextValidIdx++;
          }
          
          let shouldAdvance = false;
          
          if (nextTurn) {
            // Check if we're closer to the next turn than current
            const distanceToNextTurn = haversineDistance(currentPosition.lat, currentPosition.lng, nextTurn.startLat, nextTurn.startLng) * 1000;
            if (distanceToNextTurn < distanceToTurn) {
              shouldAdvance = true;
              console.log(`[Nav] Closer to next turn (${distanceToNextTurn.toFixed(0)}m vs ${distanceToTurn.toFixed(0)}m)`);
            }
          }
          
          // Also advance if we've traveled 25m since announcing at-turn (using cumulative distance)
          if (!shouldAdvance && distanceAtTurnReachRef.current > 0) {
            const distanceTraveledSinceReach = (currentDistanceKm - distanceAtTurnReachRef.current) * 1000;
            if (distanceTraveledSinceReach > 25) {
              shouldAdvance = true;
              console.log(`[Nav] Traveled ${distanceTraveledSinceReach.toFixed(0)}m since reach`);
            }
          }
          
          // Track if distance is increasing (stuck turn detection)
          if (lastDistanceToTurnRef.current > 0 && distanceToTurn > lastDistanceToTurnRef.current + 5) {
            increasingDistanceSamplesRef.current++;
            // Auto-advance if distance increased for 3+ samples or exceeded 120m
            if (increasingDistanceSamplesRef.current >= 3 || distanceToTurn > 120) {
              shouldAdvance = true;
              console.log(`[Nav] Auto-advance: distance increasing for ${increasingDistanceSamplesRef.current} samples (${distanceToTurn.toFixed(0)}m)`);
            }
          } else {
            increasingDistanceSamplesRef.current = 0;
          }
          lastDistanceToTurnRef.current = distanceToTurn;
          
          if (shouldAdvance) {
            console.log(`[Nav] Advancing past turn ${currentIdx}: ${turn.instruction}`);
            currentStoredTurnIndexRef.current = currentIdx + 1;
            turnApproachAnnouncedRef.current = false;
            turnAtAnnouncedRef.current = false;
            distanceAtTurnReachRef.current = 0;
            closestDistanceToTurnRef.current = 0;
            increasingDistanceSamplesRef.current = 0;
            lastDistanceToTurnRef.current = 0;
            // Continue to process next turn in same tick (don't return)
          }
        }
        
        // Mark when we first reach the turn location (within 45m) - for distance tracking
        if (distanceToTurn <= 45 && distanceAtTurnReachRef.current === 0) {
          distanceAtTurnReachRef.current = currentDistanceKm;
          closestDistanceToTurnRef.current = distanceToTurn;
          console.log(`[Nav] Reached turn ${currentIdx} at ${currentDistanceKm.toFixed(3)}km, distance ${distanceToTurn.toFixed(0)}m`);
        }
        
        // Track closest distance to turn for "passed turn" detection
        if (distanceAtTurnReachRef.current > 0 && distanceToTurn < (closestDistanceToTurnRef.current || Infinity)) {
          closestDistanceToTurnRef.current = distanceToTurn;
        }
        
        // Detect if runner has passed the turn (was close, now moving away)
        if (distanceAtTurnReachRef.current > 0 && closestDistanceToTurnRef.current && closestDistanceToTurnRef.current < 45) {
          // If we were within 45m and are now 40m+ further away, we've passed
          if (distanceToTurn > closestDistanceToTurnRef.current + 40) {
            console.log(`[Nav] Passed turn ${currentIdx}: closest ${closestDistanceToTurnRef.current.toFixed(0)}m, now ${distanceToTurn.toFixed(0)}m`);
            currentStoredTurnIndexRef.current = currentIdx + 1;
            turnApproachAnnouncedRef.current = false;
            turnAtAnnouncedRef.current = false;
            distanceAtTurnReachRef.current = 0;
            closestDistanceToTurnRef.current = 0;
            increasingDistanceSamplesRef.current = 0;
            lastDistanceToTurnRef.current = 0;
          }
        }
        
        // Re-find current instruction after potential advancement
        currentIdx = currentStoredTurnIndexRef.current;
        turn = null;
        while (currentIdx < storedInstructions.length) {
          const candidate = storedInstructions[currentIdx];
          const maneuver = (candidate.maneuver || '').toLowerCase();
          const instruction = (candidate.instruction || '').toLowerCase();
          
          const isTurn = maneuver.includes('turn') || 
                        maneuver.includes('left') || 
                        maneuver.includes('right') ||
                        instruction.includes('turn left') || 
                        instruction.includes('turn right');
          const isSignificant = maneuver.includes('roundabout') ||
                               maneuver.includes('merge') ||
                               instruction.includes('roundabout');
          const isSkippable = (maneuver === 'straight' || maneuver === '') && 
                             !instruction.includes('turn') && 
                             !instruction.includes('left') && 
                             !instruction.includes('right') &&
                             candidate.distance <= 10;
          
          if (isTurn || isSignificant || !isSkippable) {
            turn = candidate;
            break;
          }
          currentIdx++;
        }
        
        if (turn && currentIdx < storedInstructions.length) {
          const newDistanceToTurn = haversineDistance(currentPosition.lat, currentPosition.lng, turn.startLat, turn.startLng) * 1000;
          
          // === GROUP NEARBY INSTRUCTIONS ===
          // Check for turns within 150m of the current turn and combine into single announcement
          const GROUP_DISTANCE_THRESHOLD = 150; // meters
          const groupedTurns: typeof storedInstructions = [turn];
          let lastTurnInGroup = turn;
          
          // Look ahead for closely spaced turns
          for (let groupIdx = currentIdx + 1; groupIdx < storedInstructions.length; groupIdx++) {
            const candidate = storedInstructions[groupIdx];
            const maneuver = (candidate.maneuver || '').toLowerCase();
            const instruction = (candidate.instruction || '').toLowerCase();
            
            // Check if meaningful turn
            const isTurn = maneuver.includes('turn') || 
                          maneuver.includes('left') || 
                          maneuver.includes('right') ||
                          instruction.includes('turn left') || 
                          instruction.includes('turn right');
            const isSignificant = maneuver.includes('roundabout') ||
                                 maneuver.includes('merge') ||
                                 instruction.includes('roundabout');
            
            if (!isTurn && !isSignificant) continue;
            
            // Check distance from last turn in group
            const distFromLastTurn = haversineDistance(
              lastTurnInGroup.startLat, lastTurnInGroup.startLng,
              candidate.startLat, candidate.startLng
            ) * 1000;
            
            if (distFromLastTurn <= GROUP_DISTANCE_THRESHOLD) {
              groupedTurns.push(candidate);
              lastTurnInGroup = candidate;
              console.log(`[Nav Group] Adding turn at idx ${groupIdx} (${distFromLastTurn.toFixed(0)}m from previous): ${candidate.instruction}`);
            } else {
              break; // Gap too large, stop grouping
            }
            
            // Limit group size
            if (groupedTurns.length >= 4) break;
          }
          
          // Build combined instruction if we have multiple turns
          // NOTE: Grouping only affects the ANNOUNCEMENT text, not pointer advancement
          // The pointer still advances through each turn normally using distance-based logic
          let combinedInstruction = turn.instruction;
          
          if (groupedTurns.length > 1) {
            // Build combined announcement: "Turn right, then in 80m turn left"
            const parts = groupedTurns.map((t, i) => {
              if (i === 0) return t.instruction;
              
              // Calculate distance from previous turn
              const prevTurn = groupedTurns[i - 1];
              const dist = haversineDistance(
                prevTurn.startLat, prevTurn.startLng,
                t.startLat, t.startLng
              ) * 1000;
              
              const distText = dist < 50 ? 'immediately' : `in ${Math.round(dist)} meters`;
              return `then ${distText} ${t.instruction.toLowerCase().replace(/^(turn|bear) /, '')}`;
            });
            
            combinedInstruction = parts.join(', ');
            console.log(`[Nav Group] Combined ${groupedTurns.length} turns: "${combinedInstruction}"`);
          }
          
          // Announce when approaching the turn (within 90m, at least 20m before at-turn threshold)
          if (newDistanceToTurn <= 90 && newDistanceToTurn > 35 && !turnApproachAnnouncedRef.current) {
            const distMeters = Math.round(newDistanceToTurn);
            const navInstruction = `In ${distMeters} meters, ${combinedInstruction}`;
            
            turnApproachAnnouncedRef.current = true;
            speak(navInstruction, { domain: 'nav' });
            setMessage(combinedInstruction);
            setNextTurnInstruction(navInstruction);
            setLastDirectionTime(Date.now());
            setLastMessageTime(Date.now());
          } else if (newDistanceToTurn <= 35 && !turnAtAnnouncedRef.current) {
            // At the turn - give the instruction now (35m threshold for GPS accuracy/drift)
            turnAtAnnouncedRef.current = true;
            speak(combinedInstruction, { domain: 'nav' });
            setMessage(combinedInstruction);
            setNextTurnInstruction(null);
            setLastDirectionTime(now);
            setLastMessageTime(now);
          }
        }
      }
    } else {
      // FALLBACK: Use bearing-based navigation when no stored instructions available
      const lookAheadPoints = Math.min(Math.max(20, Math.floor(routePoints.length * 0.03)), 60);
      
      for (let searchIdx = nearestIndex + 2; searchIdx < Math.min(nearestIndex + 150, routePoints.length - 2); searchIdx++) {
        const turnPoint = routePoints[searchIdx];
        const beforePoint = routePoints[Math.max(0, searchIdx - 1)];
        const afterPoint = routePoints[Math.min(routePoints.length - 1, searchIdx + 1)];
        
        const turnAngle = getSignedTurnAngle(beforePoint, turnPoint, afterPoint);
        const absTurnAngle = Math.abs(turnAngle);
        
        if (absTurnAngle > 25) {
          const distToTurn = haversineDistance(currentPosition.lat, currentPosition.lng, turnPoint.lat, turnPoint.lng);
          const distToTurnMeters = distToTurn * 1000;
          
          if (distToTurnMeters <= 30 && distToTurnMeters > 5) {
            if (lastTurnAnnouncedIndexRef.current === searchIdx) {
              break;
            }
            
            let turnInstruction = "";
            if (turnAngle > 70) {
              turnInstruction = "Turn right";
            } else if (turnAngle > 20) {
              turnInstruction = "Bear right";
            } else if (turnAngle < -70) {
              turnInstruction = "Turn left";
            } else if (turnAngle < -20) {
              turnInstruction = "Bear left";
            }
            
            if (turnInstruction) {
              const distMeters = Math.round(distToTurnMeters);
              const instruction = `In ${distMeters} meters, ${turnInstruction.toLowerCase()}`;
              
              lastTurnAnnouncedIndexRef.current = searchIdx;
              speak(instruction, { domain: 'nav' });
              setMessage(turnInstruction);
              setNextTurnInstruction(instruction);
              setLastDirectionTime(Date.now());
              setLastMessageTime(Date.now());
            }
            break;
          } else if (distToTurnMeters <= 5) {
            if (lastTurnAnnouncedIndexRef.current !== searchIdx + 1000) {
              let confirmInstruction = turnAngle > 0 ? "Turn right now" : "Turn left now";
              
              lastTurnAnnouncedIndexRef.current = searchIdx + 1000;
              speak(confirmInstruction, { domain: 'nav' });
              setMessage(confirmInstruction);
              setNextTurnInstruction(null);
              setLastDirectionTime(now);
              setLastMessageTime(now);
            }
            break;
          }
          break;
        }
      }
    }
  }, [active, currentPosition, routePoints, currentWaypointIndex, lastDirectionTime, speak, routeData?.turnInstructions]);

  // Pre-compute next turn for map display (runs more frequently, doesn't trigger audio)
  useEffect(() => {
    if (!currentPosition || routePoints.length < 3) return;
    
    // PRIORITY: Use stored turn instructions for accurate display
    if (routeData?.turnInstructions && routeData.turnInstructions.length > 0) {
      const storedInstructions = routeData.turnInstructions;
      
      // Use the same pointer as the audio logic to find current turn
      let currentIdx = currentStoredTurnIndexRef.current;
      
      // Skip to next valid turn (skip 'straight' maneuvers)
      while (currentIdx < storedInstructions.length) {
        const candidate = storedInstructions[currentIdx];
        if (candidate.maneuver && candidate.maneuver !== 'straight') {
          break;
        }
        currentIdx++;
      }
      
      if (currentIdx < storedInstructions.length) {
        const turn = storedInstructions[currentIdx];
        const distanceToTurn = haversineDistance(currentPosition.lat, currentPosition.lng, turn.startLat, turn.startLng) * 1000;
        
        if (distanceToTurn <= 200 && distanceToTurn > 5) {
          const distMeters = Math.round(distanceToTurn);
          setNextTurnInstruction(`In ${distMeters}m: ${turn.instruction}`);
          return;
        }
      }
      
      setNextTurnInstruction(null);
      return;
    }
    
    // FALLBACK: Use bearing-based detection when no stored instructions
    let nearestIndex = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < routePoints.length; i++) {
      const d = haversineDistance(currentPosition.lat, currentPosition.lng, routePoints[i].lat, routePoints[i].lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIndex = i;
      }
    }
    
    const lookAheadMax = Math.min(nearestIndex + 80, routePoints.length - 2);
    let foundTurn = false;
    
    for (let searchIdx = nearestIndex + 1; searchIdx < lookAheadMax; searchIdx++) {
      const prevPoint = routePoints[Math.max(0, searchIdx - 1)];
      const turnPoint = routePoints[searchIdx];
      const afterPoint = routePoints[Math.min(routePoints.length - 1, searchIdx + 1)];
      
      const turnAngle = getSignedTurnAngle(prevPoint, turnPoint, afterPoint);
      const absTurnAngle = Math.abs(turnAngle);
      
      if (absTurnAngle > 25) {
        const distToTurn = haversineDistance(currentPosition.lat, currentPosition.lng, turnPoint.lat, turnPoint.lng);
        const distToTurnMeters = Math.round(distToTurn * 1000);
        
        if (distToTurnMeters <= 200 && distToTurnMeters > 10) {
          let turnLabel = "";
          if (turnAngle > 70) turnLabel = "Turn right";
          else if (turnAngle > 20) turnLabel = "Bear right";
          else if (turnAngle < -70) turnLabel = "Turn left";
          else if (turnAngle < -20) turnLabel = "Bear left";
          
          if (turnLabel) {
            foundTurn = true;
            setNextTurnInstruction(`${turnLabel} in ${distToTurnMeters}m`);
          }
        } else if (distToTurnMeters > 200) {
          foundTurn = true;
          setNextTurnInstruction(null);
        }
        break;
      }
    }
    
    if (!foundTurn) {
      setNextTurnInstruction(null);
    }
  }, [currentPosition, routePoints, routeData?.turnInstructions]);

  // Periodic coaching with phase-based statement selection
  // Uses separate timer to avoid being blocked by splits/navigation
  useEffect(() => {
    if (!active) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      // Use separate timer for predefined coaching - 45 seconds between statements
      // Also ensure we're not speaking right after navigation (5 second gap)
      const timeSincePredefined = now - lastPredefinedCoachingTime;
      const timeSinceAnyMessage = now - lastMessageTime;
      
      if (timeSincePredefined > 45000 && timeSinceAnyMessage > 5000 && gpsStatus === "active") {
        // Determine current run phase based on distance and total planned distance
        const targetDistNum = parseFloat(sessionMetadataRef.current.targetDistance) || null;
        const currentPhase = determinePhase(distance, targetDistNum);
        
        // Select a phase-appropriate statement that hasn't been overused
        const statement = selectStatement(currentPhase, statementUsageCounts);
        
        if (statement) {
          // Update usage count for this statement
          setStatementUsageCounts(prev => ({
            ...prev,
            [statement.id]: (prev[statement.id] || 0) + 1
          }));
          
          console.log(`[Predefined Coaching] Speaking: ${statement.id} (${currentPhase})`);
          setMessage(statement.text);
          speak(statement.text, { domain: 'coach' });
          setLastPredefinedCoachingTime(now); // Only update predefined timer
          
          // Log the predefined coaching statement
          saveCoachingLog({
            eventType: 'phase_coaching',
            topic: `${currentPhase}_${statement.category}`,
            responseText: statement.text,
          });
        }
      }
    }, 15000); // Check more frequently (every 15s) since we have separate cooldown

    return () => clearInterval(interval);
  }, [active, lastPredefinedCoachingTime, lastMessageTime, gpsStatus, speak, distance, statementUsageCounts, saveCoachingLog]);

  // Timestamp-based timer that works even when screen is off
  // Timer only pauses when user explicitly pauses (active = false)
  // GPS status does NOT affect timer - only distance tracking
  useEffect(() => {
    if (!active || !runStarted) {
      // Timer should pause - record when if not already recorded
      if (pauseStartTimeRef.current === null && runStarted && !active) {
        pauseStartTimeRef.current = Date.now();
        console.log('[Timer] Paused at', new Date().toLocaleTimeString());
      }
      return;
    }
    
    // Timer should run - if resuming from pause, add paused duration
    if (pauseStartTimeRef.current !== null) {
      const pausedFor = Date.now() - pauseStartTimeRef.current;
      pausedDurationRef.current += pausedFor;
      console.log('[Timer] Resumed after', Math.round(pausedFor / 1000), 'seconds pause');
      pauseStartTimeRef.current = null;
    }
    
    // Calculate elapsed time from timestamps
    const updateTime = () => {
      const now = Date.now();
      const elapsedMs = now - startTimestampRef.current - pausedDurationRef.current;
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      setTime(elapsedSeconds);
      runMetricsRef.current.time = elapsedSeconds;
    };
    
    // Update immediately
    updateTime();
    
    // Then update every second
    const interval = setInterval(updateTime, 1000);
    
    // Handle visibility change - recalculate time when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Timer] Page became visible, recalculating time');
        updateTime();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active, runStarted]);

  const saveSessionNow = useCallback(() => {
    // Don't save if run has been stopped/completed
    if (runStoppedRef.current) {
      return;
    }
    const metadata = sessionMetadataRef.current;
    
    // Downsample GPS track for localStorage (keep ~200 points max to save space)
    const positions = positionsRef.current;
    const maxBackupPoints = 200;
    let gpsBackup: Array<{ lat: number; lng: number; timestamp?: number }> = [];
    if (positions.length > 0) {
      if (positions.length <= maxBackupPoints) {
        gpsBackup = positions.map(p => ({ lat: p.lat, lng: p.lng, timestamp: p.timestamp }));
      } else {
        const step = Math.ceil(positions.length / maxBackupPoints);
        for (let i = 0; i < positions.length; i += step) {
          const p = positions[i];
          gpsBackup.push({ lat: p.lat, lng: p.lng, timestamp: p.timestamp });
        }
        // Always include the last point
        const lastP = positions[positions.length - 1];
        if (gpsBackup[gpsBackup.length - 1]?.timestamp !== lastP.timestamp) {
          gpsBackup.push({ lat: lastP.lat, lng: lastP.lng, timestamp: lastP.timestamp });
        }
      }
    }
    
    // Build pace data from kmSplits
    const paceData = kmSplits.map((cumulativeTime, idx) => {
      const prevTime = idx > 0 ? kmSplits[idx - 1] : 0;
      const kmTime = cumulativeTime - prevTime;
      const paceMinutes = Math.floor(kmTime / 60);
      const paceSeconds = Math.floor(kmTime % 60);
      return {
        km: idx + 1,
        pace: `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`,
        paceSeconds: kmTime,
        cumulativeTime: cumulativeTime
      };
    });
    
    const session: ActiveRunSession = {
      id: sessionIdRef.current,
      startTimestamp: startTimestampRef.current,
      elapsedSeconds: time,
      pausedDurationMs: pausedDurationRef.current,
      distanceKm: distance,
      cadence,
      routeId: routeData?.id || metadata.routeId,
      routeName: routeData?.routeName || metadata.routeName,
      routePolyline: routeData?.polyline || "",
      routeWaypoints: routeData?.waypoints || [],
      startLat: metadata.startLat,
      startLng: metadata.startLng,
      targetDistance: metadata.targetDistance,
      levelId: metadata.levelId,
      targetTimeSeconds: metadata.targetTimeSeconds,
      exerciseType: metadata.exerciseType,
      audioEnabled,
      aiCoachEnabled,
      kmSplits,
      lastKmAnnounced,
      status: active ? 'active' : 'paused',
      // NEW: Include GPS backup for recovery
      gpsTrackBackup: gpsBackup,
      weatherData: runWeather || undefined,
      paceData: paceData.length > 0 ? paceData : undefined,
    };
    saveActiveRunSession(session);
  }, [active, time, distance, cadence, routeData, audioEnabled, aiCoachEnabled, kmSplits, lastKmAnnounced, runWeather]);

  const syncToDatabase = useCallback(async () => {
    if (runStoppedRef.current) return;
    if (distance < 0.1) return;
    
    try {
      const profile = localStorage.getItem('userProfile');
      const userId = profile ? JSON.parse(profile).id : null;
      if (!userId) return;

      const gpsTrack = positionsRef.current.slice(-500).map(p => ({
        lat: p.lat,
        lng: p.lng,
        timestamp: p.timestamp,
      }));

      const paceSecondsPerKm = distance > 0.1 ? time / distance : 0;
      let currentPace: string | null = null;
      if (paceSecondsPerKm > 0 && isFinite(paceSecondsPerKm)) {
        const mins = Math.floor(paceSecondsPerKm / 60);
        const secs = Math.floor(paceSecondsPerKm % 60);
        currentPace = `${mins}'${secs.toString().padStart(2, '0')}"`;
      }

      await fetch('/api/live-sessions/sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: sessionIdRef.current,
          userId,
          distanceKm: distance,
          elapsedSeconds: time,
          currentPace,
          cadence: cadence || null,
          difficulty: routeData?.difficulty || sessionMetadataRef.current.levelId || 'beginner',
          gpsTrack: gpsTrack.length > 0 ? gpsTrack : [],
          kmSplits: kmSplits.length > 0 ? kmSplits : [],
          routeId: routeData?.id || sessionMetadataRef.current.routeId || null,
        }),
      });
    } catch (err) {
      console.log('Background sync failed (will retry):', err);
    }
  }, [distance, time, cadence, routeData, kmSplits]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (time > 0 || distance > 0) {
        e.preventDefault();
        e.returnValue = 'You have an active run session. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [time, distance]);

  useEffect(() => {
    if (!active && time === 0) return;
    
    const saveInterval = setInterval(saveSessionNow, 5000);
    const dbSyncInterval = setInterval(syncToDatabase, 30000);
    
    const handleBeforeUnload = () => {
      saveSessionNow();
      syncToDatabase();
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveSessionNow();
        syncToDatabase();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(saveInterval);
      clearInterval(dbSyncInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      saveSessionNow();
    };
  }, [active, time, saveSessionNow, syncToDatabase]);

  const requestMotionPermission = useCallback(async () => {
    if (!('DeviceMotionEvent' in window)) {
      setMotionPermission("unavailable");
      return;
    }
    
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === 'granted') {
          setMotionPermission("granted");
          toast.success("Cadence tracking enabled");
        } else {
          setMotionPermission("denied");
          toast.error("Cadence tracking denied - tap footprints icon to retry");
        }
      } catch (err) {
        console.error("Motion permission error:", err);
        setMotionPermission("denied");
        toast.error("Cadence unavailable on this device");
      }
    } else {
      setMotionPermission("granted");
    }
  }, []);

  // Auto-enable cadence detection when GPS locks (only for non-iOS devices)
  // iOS requires user gesture to request permission, so we keep a button for those
  useEffect(() => {
    if (gpsStatus === "active" && motionPermission === "unknown") {
      // Check if this platform requires a user gesture (iOS Safari)
      const requiresUserGesture = typeof (DeviceMotionEvent as any).requestPermission === 'function';
      if (!requiresUserGesture) {
        requestMotionPermission();
      }
    }
  }, [gpsStatus, motionPermission, requestMotionPermission]);

  useEffect(() => {
    if (!active || motionPermission !== "granted") return;
    
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.z === null) return;
      
      const magnitude = Math.sqrt(
        (acc.x || 0) ** 2 + 
        (acc.y || 0) ** 2 + 
        (acc.z || 0) ** 2
      );
      
      const threshold = 12;
      const minTimeBetweenSteps = 200;
      const now = Date.now();
      
      if (magnitude > threshold && lastAccelRef.current <= threshold) {
        const lastStep = stepTimestampsRef.current[stepTimestampsRef.current.length - 1] || 0;
        if (now - lastStep > minTimeBetweenSteps) {
          stepTimestampsRef.current.push(now);
          
          if (stepTimestampsRef.current.length > 30) {
            stepTimestampsRef.current = stepTimestampsRef.current.slice(-30);
          }
          
          // Use 15-second window for real-time cadence (matches pace calculation)
          const recentSteps = stepTimestampsRef.current.filter(t => now - t < 15000);
          if (recentSteps.length >= 3) {
            const timeSpan = (recentSteps[recentSteps.length - 1] - recentSteps[0]) / 1000 / 60;
            if (timeSpan > 0) {
              const stepsPerMinute = Math.round((recentSteps.length - 1) / timeSpan);
              setCadence(stepsPerMinute);
            }
          }
        }
      }
      
      lastAccelRef.current = magnitude;
    };
    
    window.addEventListener('devicemotion', handleMotion);
    
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [active, motionPermission]);

  useEffect(() => {
    if (!active || gpsStatus !== "active") return;
    
    const currentKm = Math.floor(distance);
    
    if (currentKm > lastKmAnnounced && currentKm > 0) {
      console.log(`[Km Split] ${currentKm}km reached! active=${active}, gpsStatus=${gpsStatus}, aiCoachEnabled=${aiCoachEnabled}, audioEnabled=${audioEnabled}`);
      setLastKmAnnounced(currentKm);
      
      const splitTime = time;
      setKmSplits(prev => [...prev, splitTime]);
      
      const lastSplitTime = kmSplits.length > 0 ? kmSplits[kmSplits.length - 1] : 0;
      const thisKmTime = splitTime - lastSplitTime;
      
      // Last km pace (as min/km format)
      const lastKmPaceMins = Math.floor(thisKmTime / 60);
      const lastKmPaceSecs = Math.floor(thisKmTime % 60);
      
      const targetDistNum = parseFloat(sessionMetadataRef.current.targetDistance);
      const remainingKm = targetDistNum - currentKm;
      
      // Overall average pace
      const avgPaceSeconds = time / currentKm;
      const avgPaceMins = Math.floor(avgPaceSeconds / 60);
      const avgPaceSecs = Math.floor(avgPaceSeconds % 60);
      
      // Total run time formatting
      const totalMins = Math.floor(time / 60);
      const totalSecs = Math.floor(time % 60);
      
      // Target pace (if set)
      const targetTimeSeconds = sessionMetadataRef.current.targetTimeSeconds || 0;
      let targetPaceStr = "";
      if (targetTimeSeconds > 0 && targetDistNum > 0) {
        const targetPaceSecondsPerKm = targetTimeSeconds / targetDistNum;
        const targetPaceMins = Math.floor(targetPaceSecondsPerKm / 60);
        const targetPaceSecs = Math.floor(targetPaceSecondsPerKm % 60);
        targetPaceStr = `${targetPaceMins}:${targetPaceSecs.toString().padStart(2, '0')}`;
      }
      
      // Terrain and elevation summary for next km
      let terrainSummary = "";
      if (routeData?.elevation?.profile && currentPosition) {
        const profile = routeData.elevation.profile as Array<{ lat: number; lng: number; elevation: number; distance: number; grade: number }>;
        
        // Find nearest profile point to current position (same approach as elevationTracker)
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < profile.length; i++) {
          const dLat = currentPosition.lat - profile[i].lat;
          const dLng = currentPosition.lng - profile[i].lng;
          const dist = dLat * dLat + dLng * dLng;
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }
        
        // Get profile distance at current position and look ahead 1km
        const currentProfileDistance = profile[nearestIdx]?.distance || 0;
        const nextKmEnd = currentProfileDistance + 1000;
        
        // Find elevation points in the next km range using profile distance
        const nextKmPoints = profile.filter(p => 
          p.distance > currentProfileDistance && p.distance <= nextKmEnd
        );
        
        if (nextKmPoints.length > 0) {
          // Calculate elevation change and max grade in next km
          const startElevation = nextKmPoints[0].elevation;
          const endElevation = nextKmPoints[nextKmPoints.length - 1].elevation;
          const elevationChange = Math.round(endElevation - startElevation);
          const maxGrade = Math.max(...nextKmPoints.map(p => Math.abs(p.grade)));
          
          // Only emit terrain summary if significant (15m+ elevation or 3%+ grade)
          if (Math.abs(elevationChange) >= 15 || maxGrade >= 3) {
            if (elevationChange >= 15) {
              terrainSummary = `Next kilometer: climbing ${elevationChange} meters`;
              if (maxGrade >= 5) terrainSummary += ` with steep sections`;
            } else if (elevationChange <= -15) {
              terrainSummary = `Next kilometer: descending ${Math.abs(elevationChange)} meters`;
            } else if (maxGrade >= 5) {
              terrainSummary = `Next kilometer: undulating terrain with some hills`;
            } else if (maxGrade >= 3) {
              terrainSummary = `Next kilometer: gentle rolling terrain`;
            }
          }
        }
      }
      
      // Select phase-appropriate motivational statement
      const targetDistNum2 = parseFloat(sessionMetadataRef.current.targetDistance) || null;
      const currentPhase = determinePhase(distance, targetDistNum2);
      const motivationStatement = selectStatement(currentPhase, statementUsageCounts, true);
      const motivation = motivationStatement?.text || "Keep going, you're doing great!";
      
      // Track usage if we got a statement
      if (motivationStatement) {
        setStatementUsageCounts(prev => ({
          ...prev,
          [motivationStatement.id]: (prev[motivationStatement.id] || 0) + 1
        }));
      }
      
      // Build comprehensive announcement
      let announcement = `${currentKm} kilometer${currentKm > 1 ? 's' : ''} complete. `;
      announcement += `Total time: ${totalMins} minutes ${totalSecs} seconds. `;
      
      // Target vs actual pace comparison
      if (targetPaceStr) {
        announcement += `Target pace: ${targetPaceStr} per kilometer. `;
      }
      announcement += `Overall pace: ${avgPaceMins}:${avgPaceSecs.toString().padStart(2, '0')} per kilometer. `;
      announcement += `Last km pace: ${lastKmPaceMins}:${lastKmPaceSecs.toString().padStart(2, '0')} per kilometer. `;
      
      if (remainingKm > 0) {
        announcement += `${remainingKm.toFixed(1)} kilometers to go. `;
      }
      
      // Add terrain summary if available
      if (terrainSummary) {
        announcement += `${terrainSummary}. `;
      }
      
      // Cadence coaching frequency depends on run type:
      // - With AI-generated route: at 10%, 45%, 75% of target distance
      // - Without route (free run): every ~1.5km (at km 1, 3, 4, 6, 7, 9, etc.)
      const hasRoute = routePoints.length > 0;
      let shouldGiveCadenceCoaching = false;
      
      if (hasRoute && targetDistNum > 0) {
        // Percentage-based for route runs
        const km10Percent = Math.max(1, Math.ceil(targetDistNum * 0.10));
        const km45Percent = Math.ceil(targetDistNum * 0.45);
        const km75Percent = Math.ceil(targetDistNum * 0.75);
        shouldGiveCadenceCoaching = currentKm === km10Percent || currentKm === km45Percent || currentKm === km75Percent;
      } else {
        // Every ~1.5km for free runs (at km 1, then every 2km: 1, 3, 5, 7, 9...)
        shouldGiveCadenceCoaching = currentKm === 1 || (currentKm > 1 && currentKm % 2 === 1);
      }
      
      if (cadence > 0 && shouldGiveCadenceCoaching) {
        // Use full AI cadence coaching advice if available, otherwise fall back to static feedback
        const cadenceFeedback = cadenceAnalysis?.coachingAdvice || getCadenceFeedback(cadence);
        if (cadenceFeedback) {
          announcement += `Cadence: ${cadence} steps per minute. ${cadenceFeedback} `;
        }
      }
      
      announcement += motivation;
      
      speak(announcement, { domain: 'coach' });
      setMessage(`${currentKm}km - ${lastKmPaceMins}:${lastKmPaceSecs.toString().padStart(2, '0')} split`);
      setLastMessageTime(Date.now());
      
      // Log km split to coaching logs
      saveCoachingLog({
        eventType: 'km_split',
        topic: 'distance_milestone',
        responseText: announcement,
      });
    }
  }, [active, gpsStatus, distance, lastKmAnnounced, time, kmSplits, cadence, cadenceAnalysis, speak, routePoints, saveCoachingLog, routeData, currentPosition]);

  // 0.50km pace summary announcement
  useEffect(() => {
    if (!active || gpsStatus !== "active") return;
    if (halfKmAnnouncedRef.current) return; // Already announced
    if (distance < 0.50) return; // Not reached 0.50km yet
    
    // Mark as announced immediately to prevent re-triggering
    halfKmAnnouncedRef.current = true;
    
    // Calculate current pace
    const paceSecondsPerKm = distance > 0 ? time / distance : 0;
    const currentPaceMins = Math.floor(paceSecondsPerKm / 60);
    const currentPaceSecs = Math.floor(paceSecondsPerKm % 60);
    const currentPaceStr = `${currentPaceMins}:${currentPaceSecs.toString().padStart(2, '0')}`;
    
    const metadata = sessionMetadataRef.current;
    const targetDistNum = parseFloat(metadata.targetDistance || "0");
    const targetTimeSeconds = metadata.targetTimeSeconds || 0;
    
    // Calculate target pace if user set a target time
    let targetPaceSecondsPerKm = 0;
    if (targetTimeSeconds > 0 && targetDistNum > 0) {
      targetPaceSecondsPerKm = targetTimeSeconds / targetDistNum;
    }
    
    // Async function to build pace message with dynamic AI coaching
    const buildPaceMessage = async () => {
      const routeId = metadata.routeId;
      const userId = userProfile?.id;
      const hasRouteOrTarget = routeId || targetPaceSecondsPerKm > 0;
      
      // Use dynamic AI coaching for personalized, terrain-aware advice
      if (hasRouteOrTarget && aiCoachEnabled) {
        try {
          console.log(`[0.50km] Requesting dynamic AI coaching (routeId: ${routeId}, target: ${targetPaceSecondsPerKm > 0})`);
          const response = await fetch('/api/ai/dynamic-pace-coaching', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentPaceSecondsPerKm: paceSecondsPerKm,
              targetPaceSecondsPerKm: targetPaceSecondsPerKm > 0 ? targetPaceSecondsPerKm : undefined,
              distanceCovered: distance,
              totalDistance: targetDistNum > 0 ? targetDistNum : undefined,
              elapsedTimeSeconds: time,
              routeId,
              userId,
              coachTone: coachSettings.tone || 'motivational',
              coachName: userProfile?.coachName || 'AI Coach'
            })
          });
          
          if (response.ok) {
            const coaching = await response.json();
            console.log(`[0.50km] AI coaching response:`, coaching.sustainabilityAssessment);
            
            // Build dynamic message from AI response
            let paceMessage = `Half kilometer complete. ${coaching.primaryAdvice} `;
            if (coaching.terrainInsight) {
              paceMessage += `${coaching.terrainInsight} `;
            }
            paceMessage += coaching.motivation;
            
            return paceMessage;
          }
        } catch (err) {
          console.log('[0.50km] Dynamic AI coaching failed, using fallback:', err);
        }
      }
      
      // Fallback path: Use simpler comparison methods
      let paceMessage = `Half kilometer complete. Your current pace is ${currentPaceStr} per kilometer. `;
      
      if (targetPaceSecondsPerKm > 0) {
        // Compare to target pace
        const targetPaceMins = Math.floor(targetPaceSecondsPerKm / 60);
        const targetPaceSecs = Math.floor(targetPaceSecondsPerKm % 60);
        const targetPaceStr = `${targetPaceMins}:${targetPaceSecs.toString().padStart(2, '0')}`;
        
        const paceDiff = paceSecondsPerKm - targetPaceSecondsPerKm;
        const diffSeconds = Math.abs(Math.round(paceDiff));
        
        if (paceDiff < -10) {
          paceMessage += `You're running ${diffSeconds} seconds faster than your target pace of ${targetPaceStr}. `;
        } else if (paceDiff > 15) {
          paceMessage += `You're ${diffSeconds} seconds behind your target pace of ${targetPaceStr}. `;
        } else {
          paceMessage += `You're right on track for your target pace of ${targetPaceStr}. `;
        }
      } else {
        // No target - alternate between historic and demographic
        const useHistoric = Math.random() > 0.5;
        
        if (useHistoric && userId) {
          try {
            const response = await fetch('/api/ai/historic-pace', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, targetDistance: targetDistNum > 0 ? targetDistNum : undefined })
            });
            const data = await response.json();
            
            if (data.avgPace && data.avgPaceSeconds) {
              const paceDiff = paceSecondsPerKm - data.avgPaceSeconds;
              const diffSeconds = Math.abs(Math.round(paceDiff));
              
              if (paceDiff < -15) {
                paceMessage += `You're ${diffSeconds} seconds faster than your average pace of ${data.avgPace}. Strong start! `;
              } else if (paceDiff > 15) {
                paceMessage += `You're ${diffSeconds} seconds slower than your usual ${data.avgPace} pace. `;
              } else {
                paceMessage += `Right on your usual pace of ${data.avgPace}. Consistent running! `;
              }
              return paceMessage;
            }
          } catch (err) {
            console.log('[0.50km] Historic pace fetch failed');
          }
        }
        
        // Demographic fallback
        if (userProfile?.dob) {
          try {
            const age = Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            const response = await fetch('/api/ai/demographic-pace', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                age, 
                fitnessLevel: userProfile.fitnessLevel || 'intermediate',
                targetDistance: targetDistNum > 0 ? targetDistNum : undefined 
              })
            });
            const data = await response.json();
            
            if (data.suggestedPace) {
              const paceDiff = paceSecondsPerKm - data.suggestedPaceSeconds;
              if (paceDiff < -15) {
                paceMessage += `Faster than suggested ${data.suggestedPace} pace. Impressive! `;
              } else if (paceDiff > 15) {
                paceMessage += `Warming up nicely. Suggested pace is ${data.suggestedPace}. `;
              } else {
                paceMessage += `Perfect pace for your fitness level. `;
              }
              return paceMessage;
            }
          } catch (err) {
            console.log('[0.50km] Demographic pace fetch failed');
          }
        }
        
        // Final fallback
        paceMessage += `Good early run pace. Stay relaxed and focused. `;
      }
      
      return paceMessage;
    };
    
    // Execute async pace message building
    buildPaceMessage().then(paceMessage => {
      speak(paceMessage, { domain: 'coach' });
      setMessage(`0.5km - Pace: ${currentPaceStr}/km`);
      setLastMessageTime(Date.now());
      
      // Log 0.50km pace summary to coaching logs
      saveCoachingLog({
        eventType: 'pace_summary',
        topic: 'half_km_update',
        responseText: paceMessage,
      });
    });
    
  }, [active, gpsStatus, distance, time, speak, userProfile, aiCoachEnabled, coachSettings, saveCoachingLog]);

  // Fetch AI cadence analysis periodically during runs
  useEffect(() => {
    const now = Date.now();
    // Throttle to once per 30 seconds minimum - check FIRST before any validation
    if (now - lastCadenceAnalysisRef.current < 30000) return;
    
    if (!active || gpsStatus !== "active" || cadence < 60) {
      // Update timestamp even on early return to prevent rapid re-runs
      lastCadenceAnalysisRef.current = now;
      return;
    }
    
    if (cadenceAnalysisPendingRef.current) return;
    
    // Calculate current pace (min/km)
    const paceMinPerKm = distance > 0.05 ? time / 60 / distance : 0;
    if (paceMinPerKm <= 0 || paceMinPerKm > 20) {
      lastCadenceAnalysisRef.current = now;
      return; // Invalid pace
    }
    
    // Get user height from profile
    const heightStr = userProfile?.height;
    if (!heightStr) {
      lastCadenceAnalysisRef.current = now;
      return;
    }
    
    // Parse height (could be "175cm" or "175")
    const heightCm = parseFloat(heightStr.replace(/[^0-9.]/g, ''));
    if (isNaN(heightCm) || heightCm < 100 || heightCm > 250) {
      lastCadenceAnalysisRef.current = now;
      return;
    }
    
    cadenceAnalysisPendingRef.current = true;
    lastCadenceAnalysisRef.current = now;
    
    fetch('/api/ai/analyze-cadence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heightCm,
        paceMinPerKm,
        cadenceSpm: cadence,
        distanceKm: distance,
        userFitnessLevel: userProfile?.fitnessLevel,
        userAge: userProfile?.dob ? calculateAge(userProfile.dob) : undefined
      })
    })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data) {
        setCadenceAnalysis(data);
      }
    })
    .catch(err => console.error('Cadence analysis error:', err))
    .finally(() => {
      cadenceAnalysisPendingRef.current = false;
    });
  }, [active, gpsStatus, cadence, distance, time, userProfile]);

  const coachingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioEnabledRef = useRef(audioEnabled);
  const coachingControlRef = useRef({ active, aiCoachEnabled, gpsStatus });
  
  useEffect(() => {
    runMetricsRef.current = { time, distance };
  }, [time, distance]);
  
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);
  
  useEffect(() => {
    coachingControlRef.current = { active, aiCoachEnabled, gpsStatus };
  }, [active, aiCoachEnabled, gpsStatus]);
  
  const speakCoaching = useCallback(async (text: string) => {
    const { active: isActive, aiCoachEnabled: isEnabled } = coachingControlRef.current;
    if (!isActive || !isEnabled || !audioEnabledRef.current) return;
    
    if (audioRef.current && !audioRef.current.ended && !audioRef.current.paused) {
      setTimeout(() => speakCoaching(text), 2000);
      return;
    }
    
    cleanupAudio();
    
    const ttsVoice = getTTSVoice(coachSettings);
    const prefs = getVoicePreferences(coachSettings);
    
    try {
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          tone: coachSettings.tone,
          voice: ttsVoice,
          speed: prefs.rate
        })
      });
      
      if (!response.ok) throw new Error('TTS failed');
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        if (audioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          audioUrlRef.current = null;
        }
      };
      await audio.play();
    } catch (error) {
      console.error('Coaching TTS error, using device fallback:', error);
      speakWithDeviceTTS(text);
    }
  }, [coachSettings, speakWithDeviceTTS, cleanupAudio]);

  const fetchCoaching = useCallback(async (userMessage?: string) => {
    const { active: isActive, aiCoachEnabled: isEnabled, gpsStatus: gps } = coachingControlRef.current;
    // Allow user questions even without GPS active
    if (!userMessage && (!isActive || !isEnabled || gps !== "active")) return;
    
    const { time: currentTime, distance: currentDistance } = runMetricsRef.current;
    if (currentDistance < 0.1 && !userMessage) return;
    
    setIsCoaching(true);
    
    try {
      const paceSeconds = currentDistance > 0 ? currentTime / currentDistance : 0;
      const paceMins = Math.floor(paceSeconds / 60);
      const paceSecs = Math.floor(paceSeconds % 60);
      const currentPace = `${paceMins}:${paceSecs.toString().padStart(2, '0')}`;
      
      const targetPaceMap: Record<string, string> = {
        'beginner': '7:00',
        'moderate': '5:30',
        'expert': '4:30'
      };
      
      const metadata = sessionMetadataRef.current;
      
      let terrainData: TerrainData | undefined;
      if (routeData?.elevation?.profile && currentPosition) {
        terrainData = calculateTerrainData(
          currentPosition.lat,
          currentPosition.lng,
          currentDistance * 1000,
          routeData.elevation.profile,
          routeData.elevation.gain,
          routeData.elevation.loss
        );
        
      }
      
      // Calculate pace change from previous coaching
      const currentPaceSeconds = paceSeconds;
      let paceChange: 'faster' | 'slower' | 'steady' | undefined;
      if (lastPaceRef.current > 0) {
        const paceDiff = currentPaceSeconds - lastPaceRef.current;
        if (paceDiff < -5) paceChange = 'faster';
        else if (paceDiff > 5) paceChange = 'slower';
        else paceChange = 'steady';
      }
      lastPaceRef.current = currentPaceSeconds;
      
      // Calculate progress milestones
      const totalDistNum = parseFloat(metadata.targetDistance);
      const progressPercent = totalDistNum > 0 ? Math.round((currentDistance / totalDistNum) * 100) : 0;
      const currentKm = Math.floor(currentDistance);
      
      // Check for milestone events
      const milestones: string[] = [];
      const progressMilestones = [25, 50, 75, 90];
      for (const milestone of progressMilestones) {
        if (progressPercent >= milestone && lastProgressMilestoneRef.current < milestone) {
          milestones.push(`${milestone}% complete`);
          lastProgressMilestoneRef.current = milestone;
        }
      }
      
      const response = await fetch('/api/ai/coaching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPace,
          targetPace: targetPaceMap[metadata.levelId] || '6:00',
          elapsedTime: currentTime,
          distanceCovered: currentDistance,
          totalDistance: parseFloat(metadata.targetDistance),
          difficulty: metadata.levelId,
          userFitnessLevel: userProfile?.fitnessLevel || 'intermediate',
          targetTimeSeconds: metadata.targetTimeSeconds > 0 ? metadata.targetTimeSeconds : undefined,
          userName: userProfile?.name,
          userAge: userProfile?.dob ? calculateAge(userProfile.dob) : undefined,
          userWeight: userProfile?.weight,
          userHeight: userProfile?.height,
          userGender: userProfile?.gender,
          desiredFitnessLevel: userProfile?.desiredFitnessLevel,
          coachName: userProfile?.coachName,
          userMessage: userMessage,
          coachPreferences: coachPreferences || undefined,
          coachTone: coachSettings.tone,
          terrain: terrainData ? { ...terrainData, previousGrade: previousGradeRef.current ?? undefined } : undefined,
          recentCoachingTopics: recentCoachingRef.current.slice(-5),
          paceChange,
          currentKm,
          progressPercent,
          milestones: milestones.length > 0 ? milestones : undefined,
          kmSplitTimes: kmSplits,
          weather: runWeather || undefined,
          goals: userGoals.length > 0 ? userGoals : undefined,
          userId: userProfile?.id,
          sessionKey: sessionIdRef.current,
          cadence: cadence || undefined,
          exerciseType: sessionMetadataRef.current.exerciseType || 'running',
        })
      });
      
      if (response.ok) {
        const { active: stillActive, aiCoachEnabled: stillEnabled } = coachingControlRef.current;
        // Skip active check if user asked a question - always respond
        if (!userMessage && (!stillActive || !stillEnabled)) return;
        
        const advice = await response.json();
        
        let coachMessage = advice.message || '';
        if (advice.paceAdvice && advice.paceAdvice !== advice.message) {
          coachMessage += ' ' + advice.paceAdvice;
        }
        if (advice.breathingTip) {
          coachMessage += ' ' + advice.breathingTip;
        }
        if (advice.encouragement && advice.encouragement !== advice.message) {
          coachMessage += ' ' + advice.encouragement;
        }
        
        if (coachMessage.trim()) {
          // Track coaching topic to avoid repetition (extract key theme)
          const topic = advice.topic || (advice.message ? advice.message.slice(0, 50) : 'general');
          recentCoachingRef.current = [...recentCoachingRef.current.slice(-4), topic];
          
          // Use speak() with force=true for user questions to bypass all checks
          if (userMessage) {
            console.log("User question - forcing speech response:", coachMessage.trim().substring(0, 50));
            speak(coachMessage.trim(), { force: true, domain: 'coach' });
          } else {
            speakCoaching(coachMessage.trim());
          }
          setMessage(advice.message || "Coach says...");
          
          // Save coaching log for post-run review
          saveCoachingLog({
            eventType: userMessage ? 'user_question' : 'periodic_coaching',
            topic,
            responseText: coachMessage.trim(),
            prompt: userMessage || undefined,
            latencyMs: advice.latencyMs,
          });
        } else if (userMessage) {
          console.warn("Coach returned empty response for user question");
          speak("I heard you. Let me think about that as we run.", { force: true, domain: 'coach' });
        }
      } else if (userMessage) {
        console.error("Coaching API error:", response.status);
        toast.error("Coach unavailable - try again shortly");
        speak("I'm having trouble connecting. Keep running, you're doing great!", { force: true, domain: 'system' });
      }
    } catch (error) {
      console.error('AI coaching error:', error);
      if (userMessage) {
        toast.error("Coach couldn't respond - please try again");
        speak("Sorry, I couldn't process that. Please try again.", { force: true, domain: 'system' });
      }
    } finally {
      setIsCoaching(false);
    }
  }, [userProfile, coachPreferences, speakCoaching, speak, routeData, currentPosition, runWeather, kmSplits, coachSettings, userGoals, saveCoachingLog]);

  useEffect(() => {
    console.log('[Coaching Cycle] State check:', { active, aiCoachEnabled, gpsStatus });
    
    if (!active || !aiCoachEnabled || gpsStatus !== "active") {
      if (coachingTimeoutRef.current) {
        clearTimeout(coachingTimeoutRef.current);
        coachingTimeoutRef.current = null;
      }
      return;
    }
    
    console.log(`[Coaching Cycle] Starting coaching cycle, interval: ${coachingInterval}s`);
    
    const runCoachingCycle = () => {
      const { active: isActive, aiCoachEnabled: isEnabled, gpsStatus: gps } = coachingControlRef.current;
      console.log('[Coaching Cycle] Running cycle check:', { isActive, isEnabled, gps });
      
      if (!isActive || !isEnabled || gps !== "active") {
        console.log('[Coaching Cycle] Conditions not met, stopping');
        coachingTimeoutRef.current = null;
        return;
      }
      
      console.log('[Coaching Cycle] Fetching coaching...');
      fetchCoaching();
      coachingTimeoutRef.current = setTimeout(runCoachingCycle, coachingInterval * 1000);
    };
    
    const initialDelay = setTimeout(runCoachingCycle, coachingInterval * 1000);
    
    return () => {
      clearTimeout(initialDelay);
      if (coachingTimeoutRef.current) {
        clearTimeout(coachingTimeoutRef.current);
        coachingTimeoutRef.current = null;
      }
    };
  }, [active, aiCoachEnabled, gpsStatus, coachingInterval, fetchCoaching]);

  // Keep position ref in sync for use in intervals
  useEffect(() => {
    currentPositionRef.current = currentPosition;
  }, [currentPosition]);

  // Proactive terrain coaching - check periodically for significant hills
  useEffect(() => {
    if (!active || !aiCoachEnabled || gpsStatus !== "active") return;
    
    const elevationProfile = routeData?.elevation?.profile;
    const elevationGain = routeData?.elevation?.gain;
    const elevationLoss = routeData?.elevation?.loss;
    if (!elevationProfile || elevationProfile.length < 2) return;
    
    // Check terrain every 10 seconds while running
    const terrainCheckInterval = setInterval(() => {
      const { distance: currentDistance } = runMetricsRef.current;
      const pos = currentPositionRef.current;
      if (currentDistance < 0.1 || !pos) return;
      
      const terrainData = calculateTerrainData(
        pos.lat,
        pos.lng,
        currentDistance * 1000,
        elevationProfile,
        elevationGain,
        elevationLoss
      );
      
      const terrainEvent = shouldTriggerTerrainCoaching(
        terrainData, 
        lastUphillCoachingTimeRef.current, 
        lastDownhillCoachingTimeRef.current,
        lastHillCrestTimeRef.current,
        previousGradeRef.current,
        180000
      );
      
      // Update previous grade for next check
      previousGradeRef.current = terrainData?.currentGrade ?? null;
      
      if (terrainEvent) {
        console.log(`Terrain coaching triggered (${terrainEvent}):`, terrainData);
        if (terrainEvent === 'uphill') {
          lastUphillCoachingTimeRef.current = Date.now();
        } else if (terrainEvent === 'downhill') {
          lastDownhillCoachingTimeRef.current = Date.now();
        } else if (terrainEvent === 'hill_crest') {
          lastHillCrestTimeRef.current = Date.now();
        }
        fetchCoaching();
      }
    }, 10000);
    
    return () => clearInterval(terrainCheckInterval);
  }, [active, aiCoachEnabled, gpsStatus, routeData?.elevation?.profile, routeData?.elevation?.gain, routeData?.elevation?.loss, fetchCoaching]);

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Voice input not supported on this device");
      return;
    }
    
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      setIsListening(true);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log("Voice input:", transcript);
      
      const lowerTranscript = transcript.toLowerCase();
      if (lowerTranscript.includes("don't talk") || lowerTranscript.includes("be quiet") || 
          lowerTranscript.includes("silent mode") || lowerTranscript.includes("only when i ask")) {
        const newPref = "Only speak when the runner asks a question. Stay silent otherwise.";
        setCoachPreferences(newPref);
        localStorage.setItem("coachPreferences", newPref);
        speak("Got it. I'll only speak when you ask me something.", { domain: 'system' });
        toast.success("Coach set to silent mode");
      } else if (lowerTranscript.includes("talk to me") || lowerTranscript.includes("normal mode") || 
                 lowerTranscript.includes("coach me") || lowerTranscript.includes("give me feedback")) {
        setCoachPreferences("");
        localStorage.removeItem("coachPreferences");
        speak("Okay! I'll give you regular coaching updates.", { domain: 'system' });
        toast.success("Regular coaching enabled");
      } else {
        console.log('[Voice Input] Sending to AI coach:', transcript);
        toast.info(`Asking coach: "${transcript.substring(0, 40)}${transcript.length > 40 ? '...' : ''}"`);
        fetchCoaching(transcript).finally(() => {
          console.log('[Voice Input] Coach response complete');
        });
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        toast.error("Microphone access denied");
      }
    };
    
    recognition.onend = () => {
      setIsListening(false);
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  }, [speak, fetchCoaching]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const toggleLiveShare = async (friend: Friend) => {
    const uniqueId = friend.friendId || friend.name;
    if (sharedWith.includes(uniqueId)) {
      setSharedWith(prev => prev.filter(id => id !== uniqueId));
      toast.info(`Stopped live sharing with ${friend.name}`);
    } else {
      // Only proceed if friend has a valid ID
      if (!friend.friendId) {
        toast.error(`Unable to share with ${friend.name} - missing user info`);
        return;
      }
      
      const profile = localStorage.getItem("userProfile");
      const userId = profile ? JSON.parse(profile).id : null;
      
      if (!userId) {
        toast.error("Please log in to share your run");
        return;
      }
      
      // Send notification to friend that they were invited to watch
      try {
        const response = await fetch(`/api/live-sessions/${sessionIdRef.current}/invite-observer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runnerId: userId,
            friendId: friend.friendId,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          console.error('Failed to send invite:', error);
          toast.error(`Failed to invite ${friend.name}`);
          return;
        }
        
        setSharedWith(prev => [...prev, uniqueId]);
        toast.success(`Now sharing live location & route with ${friend.name}!`);
      } catch (error) {
        console.error('Failed to send live run invite notification:', error);
        toast.error(`Failed to invite ${friend.name}`);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculatePace = () => {
    if (distance < 0.01) return "--:--";
    const paceSeconds = time / distance;
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}'${secs.toString().padStart(2, '0')}"`;
  };

  const openGoogleMapsNavigation = () => {
    if (!currentPosition) {
      toast.error("Waiting for GPS signal...");
      return;
    }
    
    let destination: { lat: number; lng: number };
    let waypoints: Array<{ lat: number; lng: number }> = [];
    
    if (routeData && routeData.waypoints.length > 0) {
      destination = routeData.waypoints[routeData.waypoints.length - 1] || 
                    { lat: routeData.startLat, lng: routeData.startLng };
      
      if (routeData.waypoints.length > 1) {
        const maxWaypoints = 8;
        const allWaypoints = routeData.waypoints.slice(0, -1);
        
        if (allWaypoints.length > maxWaypoints) {
          const step = allWaypoints.length / maxWaypoints;
          for (let i = 0; i < maxWaypoints; i++) {
            waypoints.push(allWaypoints[Math.floor(i * step)]);
          }
        } else {
          waypoints = allWaypoints;
        }
      }
    } else {
      destination = { lat: sessionMetadataRef.current.startLat, lng: sessionMetadataRef.current.startLng };
    }
    
    const waypointStr = waypoints.length > 0
      ? waypoints.map(w => `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`).join('|')
      : '';
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      let iosUrl = `comgooglemaps://?api=1&origin=${currentPosition.lat},${currentPosition.lng}`;
      iosUrl += `&destination=${destination.lat},${destination.lng}`;
      if (waypointStr) {
        iosUrl += `&waypoints=${encodeURIComponent(waypointStr)}`;
      }
      iosUrl += `&travelmode=walking&dir_action=navigate`;
      
      const fallbackUrl = buildWebMapsUrl(currentPosition, destination, waypointStr);
      
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = iosUrl;
      document.body.appendChild(iframe);
      
      setTimeout(() => {
        document.body.removeChild(iframe);
        window.open(fallbackUrl, '_blank');
      }, 1500);
      
    } else if (isAndroid) {
      let androidUrl = `google.navigation:q=${destination.lat},${destination.lng}&mode=w`;
      
      const fallbackUrl = buildWebMapsUrl(currentPosition, destination, waypointStr);
      
      const link = document.createElement('a');
      link.href = androidUrl;
      link.click();
      
      setTimeout(() => {
        window.open(fallbackUrl, '_blank');
      }, 1500);
      
    } else {
      const webUrl = buildWebMapsUrl(currentPosition, destination, waypointStr);
      window.open(webUrl, '_blank');
    }
    
    toast.info("Opening Google Maps navigation. Your AI coach will continue running in the background!");
  };
  
  const buildWebMapsUrl = (
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    waypointStr: string
  ) => {
    let url = `https://www.google.com/maps/dir/?api=1`;
    url += `&origin=${origin.lat},${origin.lng}`;
    url += `&destination=${destination.lat},${destination.lng}`;
    if (waypointStr) {
      url += `&waypoints=${encodeURIComponent(waypointStr)}`;
    }
    url += `&travelmode=walking`;
    return url;
  };

  const saveRunData = async (): Promise<string> => {
    const now = new Date();
    const date = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const metadata = sessionMetadataRef.current;
    const localRunId = `run_${Date.now()}`;
    
    console.log('[Save] runWeather at save time:', runWeather);
    
    // Convert cumulative split times to pace objects for each km
    const formattedKmSplits = kmSplits.map((cumulativeTime, idx) => {
      const prevTime = idx > 0 ? kmSplits[idx - 1] : 0;
      const kmTime = cumulativeTime - prevTime;
      const paceMinutes = Math.floor(kmTime / 60);
      const paceSeconds = Math.floor(kmTime % 60);
      return {
        km: idx + 1,
        pace: `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`,
        paceSeconds: kmTime,
        cumulativeTime: cumulativeTime
      };
    });
    console.log('[Save] formattedKmSplits:', formattedKmSplits);
    
    const gpsTrackData = downsampleGpsTrack(positionsRef.current, 1000);
    
    const localRunData = {
      id: localRunId,
      date,
      time: timeStr,
      distance,
      totalTime: time,
      avgPace: calculatePace(),
      difficulty: metadata.levelId,
      lat: metadata.startLat,
      lng: metadata.startLng,
      routeName: metadata.routeName,
      routeId: metadata.routeId,
      eventId: metadata.eventId || undefined, // Preserve event linkage for offline runs
      gpsTrack: gpsTrackData,
      avgCadence: cadence,
      kmSplits: formattedKmSplits,
      targetDistance: metadata.targetDistance,
      elevationGain: routeData?.elevation?.gain || 0,
      elevationLoss: routeData?.elevation?.loss || 0,
      weatherData: runWeather || undefined,
      aiCoachEnabled: aiCoachEnabled,
      dbSynced: false, // Will be updated if DB save succeeds
      pendingSync: true, // Marks this run needs to be synced
      sessionKey: sessionIdRef.current, // Store for manual sync
      detectedWeaknesses: detectedWeaknesses, // Store for manual sync
    };
    console.log('[Save] localRunData.weatherData:', localRunData.weatherData);
    console.log('[Save] GPS points recorded:', positionsRef.current.length, 'saved:', localRunData.gpsTrack.length);

    // Helper function for retry with exponential backoff
    const saveToDbWithRetry = async (dbRunData: any, maxRetries: number = 3): Promise<{ success: boolean; savedRun?: any; error?: string }> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Save] Attempt ${attempt}/${maxRetries} to save run to database`);
          const response = await fetch('/api/runs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dbRunData)
          });
          
          if (response.ok) {
            const savedRun = await response.json();
            console.log('[Save] Run saved to database successfully:', savedRun.id);
            return { success: true, savedRun };
          } else {
            const errorText = await response.text();
            console.error(`[Save] Attempt ${attempt} failed with status:`, response.status, 'Error:', errorText);
            
            // Don't retry on 4xx errors (client errors)
            if (response.status >= 400 && response.status < 500) {
              return { success: false, error: errorText };
            }
          }
        } catch (err) {
          console.error(`[Save] Attempt ${attempt} network error:`, err);
        }
        
        // Wait before retry with exponential backoff (1s, 2s, 4s)
        if (attempt < maxRetries) {
          const waitMs = Math.pow(2, attempt - 1) * 1000;
          console.log(`[Save] Waiting ${waitMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
      return { success: false, error: 'All retry attempts failed' };
    };

    // Try to save to database if user is logged in
    const userProfileStr = localStorage.getItem("userProfile");
    if (userProfileStr) {
      try {
        const userProfile = JSON.parse(userProfileStr);
        if (userProfile.id) {
          // Ensure all required fields have valid values
          const validDistance = typeof distance === 'number' && !isNaN(distance) ? distance : 0;
          const validDuration = typeof time === 'number' && !isNaN(time) ? Math.floor(time) : 0;
          const validRouteId = metadata.routeId && metadata.routeId.length > 0 ? metadata.routeId : undefined;
          const validStartLat = typeof metadata.startLat === 'number' && !isNaN(metadata.startLat) ? metadata.startLat : undefined;
          const validStartLng = typeof metadata.startLng === 'number' && !isNaN(metadata.startLng) ? metadata.startLng : undefined;
          
          const validEventId = metadata.eventId && metadata.eventId.length > 0 ? metadata.eventId : undefined;
          
          const dbRunData = {
            userId: userProfile.id,
            routeId: validRouteId,
            eventId: validEventId,
            distance: validDistance,
            duration: validDuration,
            runDate: date,
            runTime: timeStr,
            avgPace: calculatePace(),
            cadence: cadence && cadence > 0 ? cadence : undefined,
            elevation: routeData?.elevation?.gain || undefined,
            elevationGain: routeData?.elevation?.gain || undefined,
            elevationLoss: routeData?.elevation?.loss || undefined,
            difficulty: metadata.levelId || 'moderate',
            startLat: validStartLat,
            startLng: validStartLng,
            gpsTrack: gpsTrackData,
            paceData: formattedKmSplits,
            weatherData: runWeather || undefined,
            sessionKey: sessionIdRef.current,
            aiCoachEnabled: aiCoachEnabled,
            targetTime: metadata.targetTimeSeconds > 0 ? metadata.targetTimeSeconds : undefined,
          };
          
          console.log('[Save] dbRunData:', JSON.stringify({
            userId: dbRunData.userId,
            distance: dbRunData.distance,
            duration: dbRunData.duration,
            routeId: dbRunData.routeId,
            difficulty: dbRunData.difficulty
          }));
          
          console.log('[Save] Attempting to save run to database for userId:', userProfile.id);
          
          // Use retry mechanism
          const result = await saveToDbWithRetry(dbRunData, 3);
          
          if (result.success && result.savedRun) {
            toast.success('Run saved to your account!');
            
            // Save detected weakness events if any
            if (detectedWeaknesses.length > 0) {
              try {
                console.log('[Save] Saving', detectedWeaknesses.length, 'weakness events');
                await fetch(`/api/runs/${result.savedRun.id}/weakness-events/bulk`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ events: detectedWeaknesses })
                });
                console.log('[Save] Weakness events saved successfully');
              } catch (err) {
                console.error('[Save] Failed to save weakness events:', err);
              }
            }
            
            // Link coaching logs to this run
            try {
              console.log('[Save] Linking coaching logs to run:', result.savedRun.id, 'session:', sessionIdRef.current);
              await fetch('/api/coaching-logs/link-to-run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionKey: sessionIdRef.current,
                  runId: result.savedRun.id,
                  userId: userProfile.id
                })
              });
              console.log('[Save] Coaching logs linked successfully');
            } catch (err) {
              console.error('[Save] Failed to link coaching logs:', err);
            }
            
            // Update localStorage with the DB record so RunInsights can find it
            const localDataWithDbId = {
              ...localRunData,
              id: result.savedRun.id,
              dbSynced: true,
              pendingSync: false,
            };
            const runHistory = localStorage.getItem("runHistory");
            const runs = runHistory ? JSON.parse(runHistory) : [];
            runs.push(localDataWithDbId);
            localStorage.setItem("runHistory", JSON.stringify(runs));
            
            localStorage.removeItem("activeRoute");
            return result.savedRun.id;
          } else {
            console.error('[Save] All database save attempts failed:', result.error);
            // Show persistent warning for failed sync
            toast.error('Run saved locally - will sync when connection improves', { duration: 8000 });
            toast.info('Your run data is safe. Go to Run History to manually sync later.', { duration: 10000 });
          }
        }
      } catch (err) {
        console.error('[Save] Failed to save run to database, using localStorage:', err);
        toast.error('Network error - run saved locally. Sync from Run History later.', { duration: 8000 });
      }
    }
    
    // Fallback: save to localStorage with pending sync flag
    const runHistory = localStorage.getItem("runHistory");
    const runs = runHistory ? JSON.parse(runHistory) : [];
    runs.push(localRunData);
    localStorage.setItem("runHistory", JSON.stringify(runs));
    
    localStorage.removeItem("activeRoute");
    return localRunId;
  };

  const handleStartRun = () => {
    // Reset timer tracking for fresh run
    startTimestampRef.current = Date.now();
    pausedDurationRef.current = 0;
    pauseStartTimeRef.current = null;
    recentPaceSamplesRef.current = [];
    halfKmAnnouncedRef.current = false; // Reset 0.50km pace summary for new run
    setRealtimePace(null);
    setLastPredefinedCoachingTime(Date.now()); // Reset predefined coaching timer to avoid immediate trigger
    
    setRunStarted(true);
    setActive(true);
    // Announce run start
    speak("Let's go! Your run has started. Good luck!", { domain: 'system' });
  };

  const handleStopClick = () => {
    setShowExitConfirmation(true);
  };

  const handlePauseClick = () => {
    if (active) {
      setShowPauseConfirmation(true);
    } else {
      setActive(true);
      speak("Let's go! Run resumed.", { domain: 'system' });
    }
  };

  const confirmPause = () => {
    setShowPauseConfirmation(false);
    setActive(false);
    setRealtimePace(null); // Clear real-time pace on pause
    recentPaceSamplesRef.current = []; // Clear pace samples
    speak("Run paused. Take a breather.", { domain: 'system' });
  };

  const confirmStop = async () => {
    setShowExitConfirmation(false);
    runStoppedRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    clearActiveRunSession();
    if (time > 0 && distance > 0) {
      const runId = await saveRunData();
      
      if (urlGroupRunId && userProfile?.name) {
        const profile = localStorage.getItem("userProfile");
        const userId = profile ? JSON.parse(profile).id : null;
        if (userId) {
          try {
            await fetch(`/api/group-runs/${urlGroupRunId}/complete-run`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, runId }),
            });
          } catch (err) {
            console.error("Failed to link run to group:", err);
          }
        }
      }
      
      speak("Run complete! Great job!", { domain: 'system' });
      const insightsParams = urlGroupRunId ? `?groupRunId=${urlGroupRunId}` : '';
      setLocation(`/history/${runId}${insightsParams}`);
    } else {
      setLocation("/");
    }
  };

  const acceptedParticipants = groupRunParticipants.filter(p => p.invitationStatus === 'accepted');
  const pendingParticipants = groupRunParticipants.filter(p => p.invitationStatus === 'pending');

  const handleStartGroupRun = async () => {
    try {
      const profile = localStorage.getItem("userProfile");
      const userId = profile ? JSON.parse(profile).id : null;
      
      if (!userId) {
        toast.error("User profile not found");
        return;
      }
      
      // Call API to start the group run
      const res = await fetch(`/api/group-runs/${urlGroupRunId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        toast.error(error.error || "Failed to start group run");
        return;
      }
      
      setWaitingForParticipants(false);
      setActive(true);
      speak("Group run started! Let's go!", { domain: 'system' });
    } catch (err) {
      console.error("Failed to start group run:", err);
      toast.error("Failed to start group run");
    }
  };

  return (
    <div className="h-screen w-full bg-background text-foreground flex flex-col relative overflow-hidden font-sans select-none">
      {/* Group Run Waiting Room */}
      <AnimatePresence>
        {waitingForParticipants && isGroupRun && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-background"
          >
            <div className="w-full max-w-md p-6 space-y-6 text-center">
              <div className="space-y-2">
                <Users className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                <h1 className="text-3xl font-display font-bold uppercase tracking-wider text-primary">
                  Waiting Room
                </h1>
                <p className="text-muted-foreground">
                  {isHost ? "Waiting for friends to join..." : "Waiting for host to start..."}
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-card/50 border border-white/10 rounded-2xl p-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    Ready ({acceptedParticipants.length})
                  </h3>
                  <div className="space-y-2">
                    {acceptedParticipants.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-2 bg-green-500/10 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                          <Check className="w-4 h-4 text-green-400" />
                        </div>
                        <span className="font-medium">{p.userName}</span>
                        {p.role === 'host' && (
                          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Host</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {pendingParticipants.length > 0 && (
                  <div className="bg-card/50 border border-white/10 rounded-2xl p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                      Waiting ({pendingParticipants.length})
                    </h3>
                    <div className="space-y-2">
                      {pendingParticipants.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 p-2 bg-yellow-500/10 rounded-lg">
                          <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                            <Loader className="w-4 h-4 text-yellow-400 animate-spin" />
                          </div>
                          <span className="font-medium text-muted-foreground">{p.userName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4">
                {isHost ? (
                  <Button
                    onClick={handleStartGroupRun}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 text-lg"
                    data-testid="button-start-group-run"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Start Run ({acceptedParticipants.length} Ready)
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-3 p-4 bg-purple-500/10 rounded-2xl">
                    <Loader className="w-5 h-5 text-purple-400 animate-spin" />
                    <span className="text-purple-400 font-medium">Waiting for host to start...</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShareModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-card border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl"
            >
              <div className="space-y-1">
                <h2 className="text-2xl font-display font-bold uppercase tracking-wider text-primary">Live Tracking</h2>
                <p className="text-xs text-muted-foreground italic">Allow friends to track your live location, route, and stats.</p>
              </div>
              
              <div className="space-y-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Select Friends to Track Live</p>
                {friends.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {friends.map((friend, idx) => {
                      const isShared = sharedWith.includes(friend.friendId || friend.name);
                      return (
                        <button
                          key={idx}
                          onClick={() => toggleLiveShare(friend)}
                          className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                            isShared 
                              ? "bg-primary/10 border-primary/50 text-primary" 
                              : "bg-white/5 border-white/5 text-muted-foreground hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${isShared ? "bg-primary text-background" : "bg-white/10"}`}>
                              <Users className="w-4 h-4" />
                            </div>
                            <span className="font-bold uppercase tracking-wide text-xs">{friend.name}</span>
                          </div>
                          {isShared ? (
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                              </span>
                              Live
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold uppercase opacity-40">Off</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                    <p className="text-xs text-muted-foreground italic">Add friends in your profile to enable live tracking.</p>
                  </div>
                )}
              </div>

              <Button
                onClick={() => setShowShareModal(false)}
                className="w-full h-12 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold uppercase tracking-widest rounded-xl"
              >
                Done
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 p-2 flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <div className={`backdrop-blur-md rounded-lg px-2 py-1 border flex items-center gap-1.5 ${
            gpsStatus === "active" ? "bg-green-500/20 border-green-500/30" :
            gpsStatus === "error" ? "bg-red-500/20 border-red-500/30" :
            "bg-yellow-500/20 border-yellow-500/30"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              gpsStatus === "active" ? "bg-green-500 animate-pulse" :
              gpsStatus === "error" ? "bg-red-500" :
              "bg-yellow-500 animate-pulse"
            }`} />
            <span className="text-[10px] font-bold uppercase">
              {gpsStatus === "active" ? "GPS" : gpsStatus === "error" ? "!" : "..."}
            </span>
          </div>
          <div 
            onClick={() => setAiCoachEnabled(!aiCoachEnabled)}
            className={`backdrop-blur-md rounded-lg px-2 py-1 border flex items-center gap-1.5 cursor-pointer transition-colors ${
              aiCoachEnabled 
                ? "bg-blue-500/20 border-blue-500/30" 
                : "bg-white/10 border-white/10"
            }`}
            data-testid="button-ai-coach-toggle"
          >
            {aiCoachEnabled ? <Mic className="w-3 h-3 text-blue-400" /> : <MicOff className="w-3 h-3 text-muted-foreground" />}
            <span className={`text-[10px] font-bold uppercase ${aiCoachEnabled ? 'text-blue-400' : 'text-muted-foreground'}`}>
              Coach {aiCoachEnabled ? 'On' : 'Off'}
            </span>
          </div>
          {sharedWith.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-primary/20 backdrop-blur-md rounded-lg px-2 py-1 border border-primary/30 flex items-center gap-1.5"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
              </span>
              <span className="text-[10px] font-display font-bold text-primary uppercase">Live</span>
            </motion.div>
          )}
          {isGroupRun && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-purple-500/20 backdrop-blur-md rounded-lg px-2 py-1 border border-purple-500/30 flex items-center gap-1.5"
            >
              <Users className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] font-display font-bold text-purple-400 uppercase">
                Group ({groupRunParticipants.length})
              </span>
            </motion.div>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            onClick={() => setAudioEnabled(!audioEnabled)}
            size="icon"
            className={`h-7 w-7 rounded-lg ${audioEnabled ? "bg-primary text-background" : "bg-white/10 text-muted-foreground"}`}
            data-testid="button-audio-toggle"
          >
            {audioEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          </Button>
          <Button
            onClick={isListening ? stopListening : startListening}
            size="icon"
            className={`h-7 w-7 rounded-lg ${
              isListening 
                ? "bg-red-500 text-white border border-red-400 animate-pulse" 
                : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
            }`}
            data-testid="button-talk-to-coach"
          >
            <MessageCircle className="w-3 h-3" />
          </Button>
          {(motionPermission === "unknown" || motionPermission === "denied") && typeof (DeviceMotionEvent as any).requestPermission === 'function' && (
            <Button
              onClick={requestMotionPermission}
              size="icon"
              className={`h-7 w-7 rounded-lg ${
                motionPermission === "denied" 
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
              }`}
              data-testid="button-enable-cadence"
            >
              <Footprints className="w-3 h-3" />
            </Button>
          )}
          <Button
            onClick={() => setShowShareModal(true)}
            size="icon"
            className={`h-7 w-7 rounded-lg ${
              sharedWith.length > 0 
                ? "bg-green-500 text-white border border-green-300" 
                : "bg-primary text-background hover:bg-primary/90"
            }`}
          >
            <Share2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Stats and Controls - TOP section */}
      <div className="relative z-10 bg-card/40 backdrop-blur-xl border-b border-white/10 rounded-b-xl p-2 flex-shrink-0">
        <div className="grid grid-cols-4 gap-1 mb-2 text-center">
          <div>
            <div className="text-muted-foreground text-[12px] uppercase tracking-wider">Time</div>
            <div className="text-base font-display font-bold">{formatTime(time)}</div>
          </div>
          <div className="border-x border-white/10">
             <div className="text-muted-foreground text-[12px] uppercase tracking-wider">Distance</div>
             <div className="text-base font-display font-bold">{distance.toFixed(2)}</div>
             <div className="text-[8px] text-muted-foreground">km</div>
          </div>
          <div className="border-r border-white/10">
             <div className="text-muted-foreground text-[12px] uppercase tracking-wider">
               {realtimePace ? 'Pace' : 'Avg Pace'}
             </div>
             <div className="text-base font-display font-bold">{realtimePace || calculatePace()}</div>
             <div className="text-[8px] text-muted-foreground">/km</div>
          </div>
          <div>
             <div className="text-muted-foreground text-[12px] uppercase tracking-wider">Cadence</div>
             <div className={`text-base font-display font-bold ${
               cadence >= 60 
                 ? (cadenceAnalysis 
                     ? (cadence >= cadenceAnalysis.idealCadenceMin && cadence <= cadenceAnalysis.idealCadenceMax 
                         ? 'text-green-400' 
                         : 'text-yellow-400')
                     : (cadence >= 165 && cadence <= 185 ? 'text-green-400' : 'text-yellow-400'))
                 : ''
             }`}>
               {cadence >= 60 ? cadence : '--'}
             </div>
             <div className="text-[8px] text-muted-foreground">
               {cadenceAnalysis ? `ideal: ${cadenceAnalysis.idealCadenceMin}-${cadenceAnalysis.idealCadenceMax}` : 'spm'}
             </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          {!runStarted ? (
            <Button 
              size="lg"
              className="h-14 px-10 rounded-full bg-green-500 text-white hover:bg-green-600 shadow-[0_0_30px_rgba(34,197,94,0.5)] font-display uppercase tracking-widest text-lg transition-transform active:scale-95"
              onClick={handleStartRun}
              data-testid="button-start-run"
            >
              <Play className="w-5 h-5 mr-2 fill-current" />
              Start Run
            </Button>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="icon" 
                className="w-9 h-9 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20"
                onClick={handleStopClick}
                data-testid="button-stop"
              >
                <Square className="w-3 h-3 fill-foreground" />
              </Button>
              
              <Button 
                size="icon" 
                className={`w-12 h-12 rounded-full transition-transform active:scale-95 ${
                  active 
                    ? "bg-primary text-background hover:bg-primary/90 shadow-[0_0_20px_rgba(6,182,212,0.4)]" 
                    : "bg-green-500 text-white hover:bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                }`}
                onClick={handlePauseClick}
                data-testid="button-toggle-play"
              >
                {active ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Map - Collapsible */}
      {routePoints.length > 0 && (
        <div className="relative z-10 bg-card/40 backdrop-blur-xl border-b border-white/10 mx-2 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowNavMap(!showNavMap)}
            className="w-full flex items-center justify-between p-2 hover:bg-white/5 transition-colors"
            data-testid="button-toggle-nav-map"
          >
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-primary" />
              <span className="text-xs font-display font-bold uppercase tracking-wide">
                {showNavMap ? 'Hide Map' : 'Show Map'}
              </span>
            </div>
            {showNavMap ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          
          <AnimatePresence>
            {showNavMap && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 200, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="h-[200px] w-full relative">
                  <MapContainer
                    center={[
                      currentPosition?.lat || routePoints[0]?.lat || 0,
                      currentPosition?.lng || routePoints[0]?.lng || 0
                    ]}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                    attributionControl={false}
                  >
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />
                    {/* Route line with direction indicators, opacity gradient, and overlap handling */}
                    {routePoints.length > 1 && (() => {
                      const elements: React.ReactNode[] = [];
                      const totalSegments = Math.min(routePoints.length - 1, 50);
                      const step = Math.max(1, Math.floor((routePoints.length - 1) / totalSegments));
                      const midpoint = Math.floor(routePoints.length / 2);
                      
                      // Detect overlapping segments using multi-point segment comparison
                      // For robust detection, sample multiple points per segment and check proximity + bearing
                      const overlappingSegments = new Set<number>();
                      
                      // Build first-half segment data with multiple sample points and bearing
                      const firstHalfData: Array<{
                        segIdx: number;
                        points: Array<{lat: number; lng: number}>;
                        bearing: number;
                      }> = [];
                      for (let segIdx = 0; segIdx < Math.ceil(midpoint / step); segIdx++) {
                        const segStart = segIdx * step;
                        const segEnd = Math.min(segStart + step, routePoints.length - 1);
                        if (segEnd <= segStart) continue;
                        
                        // Sample 3 points: start, middle, end of segment
                        const points = [
                          routePoints[segStart],
                          routePoints[Math.floor((segStart + segEnd) / 2)],
                          routePoints[segEnd]
                        ];
                        const bearing = calculateBearing(
                          routePoints[segStart].lat, routePoints[segStart].lng,
                          routePoints[segEnd].lat, routePoints[segEnd].lng
                        );
                        
                        firstHalfData.push({ segIdx, points, bearing });
                      }
                      
                      // Check each second-half segment for overlap with first-half segments
                      // Track contiguous overlap ranges
                      let overlapRangeStart = -1;
                      
                      for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
                        const segStart = segIdx * step;
                        if (segStart < midpoint) continue;
                        
                        const segEnd = Math.min(segStart + step, routePoints.length - 1);
                        if (segEnd <= segStart) continue;
                        
                        // Sample 3 points from this segment
                        const returnPoints = [
                          routePoints[segStart],
                          routePoints[Math.floor((segStart + segEnd) / 2)],
                          routePoints[segEnd]
                        ];
                        const returnBearing = calculateBearing(
                          routePoints[segStart].lat, routePoints[segStart].lng,
                          routePoints[segEnd].lat, routePoints[segEnd].lng
                        );
                        
                        // Check against all first-half segments
                        let foundOverlap = false;
                        for (const firstSeg of firstHalfData) {
                          // Check multiple point pairs for proximity (any match counts)
                          let hasProximity = false;
                          for (const rp of returnPoints) {
                            for (const fp of firstSeg.points) {
                              if (arePointsClose(rp, fp, 35)) {
                                hasProximity = true;
                                break;
                              }
                            }
                            if (hasProximity) break;
                          }
                          
                          if (!hasProximity) continue;
                          
                          // Check if bearings are roughly opposite (130°+ difference)
                          const rawDiff = Math.abs(returnBearing - firstSeg.bearing);
                          const normalizedDiff = rawDiff > 180 ? 360 - rawDiff : rawDiff;
                          
                          if (normalizedDiff >= 130) {
                            foundOverlap = true;
                            break;
                          }
                        }
                        
                        if (foundOverlap) {
                          // Track contiguous range start
                          if (overlapRangeStart === -1) {
                            overlapRangeStart = segIdx;
                            // Add leading neighbor for smooth transition
                            if (segIdx > 0) overlappingSegments.add(segIdx - 1);
                          }
                          overlappingSegments.add(segIdx);
                        } else {
                          // End of contiguous range - add trailing neighbor
                          if (overlapRangeStart !== -1) {
                            overlappingSegments.add(segIdx); // Include this as transition segment
                            overlapRangeStart = -1;
                          }
                        }
                      }
                      
                      // If overlap range extends to end, add final segment
                      if (overlapRangeStart !== -1) {
                        overlappingSegments.add(totalSegments - 1);
                      }
                      
                      // Render route segments with gradient color and opacity
                      for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
                        const i = segIdx * step;
                        const progress = i / (routePoints.length - 1);
                        // Interpolate from blue (#3b82f6) to green (#22c55e)
                        const r = Math.round(59 + progress * (34 - 59));
                        const g = Math.round(130 + progress * (197 - 130));
                        const b = Math.round(246 + progress * (94 - 246));
                        const color = `rgb(${r},${g},${b})`;
                        
                        // Opacity gradient: 1.0 at start, 0.5 at end
                        const opacity = 1.0 - (progress * 0.5);
                        
                        const endIdx = Math.min(i + step, routePoints.length - 1);
                        let segmentPoints = routePoints.slice(i, endIdx + 1);
                        
                        // Offset return path for overlapping segments
                        const isReturnOverlap = overlappingSegments.has(segIdx);
                        if (isReturnOverlap && i > 0) {
                          const bearing = calculateBearing(
                            routePoints[Math.max(0, i-1)].lat, routePoints[Math.max(0, i-1)].lng,
                            routePoints[i].lat, routePoints[i].lng
                          );
                          segmentPoints = segmentPoints.map(p => offsetPoint(p.lat, p.lng, bearing, 8));
                        }
                        
                        elements.push(
                          <Polyline
                            key={`route-segment-${segIdx}`}
                            positions={segmentPoints.map(p => [p.lat, p.lng] as [number, number])}
                            color={color}
                            weight={isReturnOverlap ? 3 : 5}
                            opacity={isReturnOverlap ? opacity * 0.6 : opacity}
                          />
                        );
                      }
                      
                      // Add direction arrows every ~300m (or every 10-15 points)
                      const arrowInterval = Math.max(15, Math.floor(routePoints.length / 10));
                      for (let i = arrowInterval; i < routePoints.length - arrowInterval; i += arrowInterval) {
                        const prevPoint = routePoints[Math.max(0, i - 3)];
                        const point = routePoints[i];
                        const bearing = calculateBearing(prevPoint.lat, prevPoint.lng, point.lat, point.lng);
                        
                        const progress = i / (routePoints.length - 1);
                        const r = Math.round(59 + progress * (34 - 59));
                        const g = Math.round(130 + progress * (197 - 130));
                        const b = Math.round(246 + progress * (94 - 246));
                        const arrowColor = `rgb(${r},${g},${b})`;
                        
                        elements.push(
                          <Marker
                            key={`arrow-${i}`}
                            position={[point.lat, point.lng]}
                            icon={createArrowIcon(bearing, arrowColor)}
                          />
                        );
                      }
                      
                      return elements;
                    })()}
                    {/* Start marker (blue) */}
                    <CircleMarker
                      center={[routePoints[0]?.lat || 0, routePoints[0]?.lng || 0]}
                      radius={8}
                      pathOptions={{ fillColor: '#3b82f6', fillOpacity: 1, color: '#fff', weight: 2 }}
                    />
                    {/* End marker (green) */}
                    {routePoints.length > 1 && (
                      <CircleMarker
                        center={[routePoints[routePoints.length - 1]?.lat || 0, routePoints[routePoints.length - 1]?.lng || 0]}
                        radius={8}
                        pathOptions={{ fillColor: '#22c55e', fillOpacity: 1, color: '#fff', weight: 2 }}
                      />
                    )}
                    {/* Current position marker */}
                    {currentPosition && (
                      <CircleMarker
                        center={[currentPosition.lat, currentPosition.lng]}
                        radius={10}
                        pathOptions={{ fillColor: '#3b82f6', fillOpacity: 1, color: '#fff', weight: 3 }}
                      />
                    )}
                    {/* Map view mode - follow runner or show full route */}
                    <FollowRunner position={currentPosition} enabled={mapFollowRunner} />
                    <FitBoundsToRoute routePoints={routePoints} enabled={!mapFollowRunner} />
                  </MapContainer>
                  
                  {/* Map view toggle button - top right */}
                  <button
                    onClick={() => setMapFollowRunner(!mapFollowRunner)}
                    className="absolute top-2 right-2 bg-card/90 backdrop-blur-md rounded-lg px-2 py-1 border border-white/20 z-[1000] text-[10px] font-medium"
                    data-testid="button-toggle-map-view"
                  >
                    {mapFollowRunner ? 'Show Full Route' : 'Follow Me'}
                  </button>
                  
                  {/* Upcoming instruction overlay - bottom left */}
                  {nextTurnInstruction && (
                    <div className="absolute bottom-2 left-2 right-2 bg-card/90 backdrop-blur-md rounded-lg p-2 border border-primary/30 z-[1000]">
                      <div className="flex items-center gap-2">
                        <Navigation2 className="w-4 h-4 text-primary flex-shrink-0" />
                        <p className="text-xs text-foreground">{nextTurnInstruction}</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* AI Coach - BOTTOM section */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4">
        <div className="relative flex flex-col items-center">
           <div className={`absolute inset-0 bg-primary/20 blur-3xl rounded-full transition-all duration-1000 ${active ? 'scale-110 opacity-100' : 'scale-90 opacity-50'}`} />
           <img 
              src={coachAvatar} 
              className="w-28 h-28 rounded-full border-2 border-primary/20 shadow-[0_0_30px_rgba(6,182,212,0.3)] object-cover relative z-10"
              alt="AI Coach"
            />
            
            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  className="mt-2 w-64 bg-card/80 backdrop-blur-xl border border-primary/30 px-3 py-2 rounded-xl text-center shadow-2xl relative z-20"
                >
                  <p className="text-primary font-medium text-xs leading-relaxed">"{message}"</p>
                  {currentGpsAccuracy && currentGpsAccuracy > 100 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowGpsHelp(true)}
                      className="mt-1.5 text-[10px] h-6 px-3 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                      data-testid="button-gps-help-run"
                    >
                      GPS Help
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
        </div>
        
        <div className="mt-2">
          <VoiceVisualizer isActive={active && !!message} />
        </div>
      </div>

      <AlertDialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <AlertDialogContent className="bg-card border-white/10 rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-orange-500/20">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <AlertDialogTitle className="text-lg font-display font-bold">End Run?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              Are you sure you want to end your run? Your progress will be saved, but you won't be able to resume this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 mt-4">
            <AlertDialogCancel 
              className="flex-1 h-11 bg-white/5 border-white/10 hover:bg-white/10 text-foreground rounded-xl font-bold uppercase text-xs tracking-wider"
              data-testid="button-cancel-exit"
            >
              Keep Running
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmStop}
              className="flex-1 h-11 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold uppercase text-xs tracking-wider"
              data-testid="button-confirm-exit"
            >
              End Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPauseConfirmation} onOpenChange={setShowPauseConfirmation}>
        <AlertDialogContent className="bg-card border-white/10 rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-yellow-500/20">
                <Pause className="w-5 h-5 text-yellow-500" />
              </div>
              <AlertDialogTitle className="text-lg font-display font-bold">Pause Run?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              Are you sure you want to pause your run? The timer will stop until you resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 mt-4">
            <AlertDialogCancel 
              className="flex-1 h-11 bg-white/5 border-white/10 hover:bg-white/10 text-foreground rounded-xl font-bold uppercase text-xs tracking-wider"
              data-testid="button-cancel-pause"
            >
              Keep Running
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmPause}
              className="flex-1 h-11 bg-yellow-500 hover:bg-yellow-600 text-black rounded-xl font-bold uppercase text-xs tracking-wider"
              data-testid="button-confirm-pause"
            >
              Pause Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GpsHelpDialog 
        open={showGpsHelp} 
        onClose={() => setShowGpsHelp(false)} 
        currentAccuracy={currentGpsAccuracy}
      />
    </div>
  );
}
