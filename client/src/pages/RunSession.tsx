import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  Pause, Play, Square, Heart, Share2, Users, Navigation, Volume2, VolumeX, Footprints, Mic, MicOff, MessageCircle, AlertTriangle
} from "lucide-react";
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
import { calculateTerrainData, shouldTriggerTerrainCoaching, type ElevationPoint, type TerrainData } from "@/lib/elevationTracker";
import { GpsHelpDialog } from "@/components/GpsHelpDialog";

import coachAvatar from "@assets/generated_images/glowing_ai_voice_sphere_interface.png";
import mapBeginner from "@assets/generated_images/dark_mode_map_with_flat_green_route.png";
import mapModerate from "@assets/generated_images/dark_mode_map_with_yellow_moderate_route.png";
import mapExpert from "@assets/generated_images/dark_mode_map_with_red_expert_route.png";

interface RouteData {
  id: string;
  routeName: string;
  difficulty: string;
  actualDistance: number;
  polyline: string;
  waypoints: Array<{ lat: number; lng: number }>;
  startLat: number;
  startLng: number;
  elevation?: {
    gain: number;
    loss: number;
    maxElevation: number;
    minElevation: number;
    profile?: ElevationPoint[];
  };
}

interface Position {
  lat: number;
  lng: number;
  timestamp: number;
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

const COACH_MESSAGES = [
  "Good pace. Keep your breathing steady.",
  "You're doing great! Stay focused.",
  "Heart rate is optimal. Keep it up.",
  "Relax your shoulders. Form looks good.",
  "Focus on your rhythm. In, two, three. Out, two, three."
];

const MOTIVATIONAL_MESSAGES = [
  "You're crushing it!",
  "Keep pushing, you've got this!",
  "Strong work! Stay focused.",
  "You're doing amazing!",
  "Every step counts. Keep going!",
  "That's the pace! Maintain it.",
  "You're a machine!",
  "Fantastic effort!"
];

function getCadenceFeedback(cadence: number): string {
  if (cadence < 150) return "Try to pick up your step frequency.";
  if (cadence < 165) return "Good rhythm, try slightly quicker steps.";
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
  const [active, setActive] = useState(true);
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [message, setMessage] = useState("Acquiring GPS signal...");
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"acquiring" | "active" | "error">("acquiring");
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [lastDirectionTime, setLastDirectionTime] = useState(0);
  
  const [cadence, setCadence] = useState(0);
  const [lastKmAnnounced, setLastKmAnnounced] = useState(0);
  const [kmSplits, setKmSplits] = useState<number[]>([]);
  const [motionPermission, setMotionPermission] = useState<"unknown" | "granted" | "denied" | "unavailable">("unknown");
  
  // Track recent coaching messages to avoid repetition
  const recentCoachingRef = useRef<string[]>([]);
  const lastProgressMilestoneRef = useRef<number>(0);
  const lastPaceRef = useRef<number>(0);
  
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
  } | null>(null);
  
  const positionsRef = useRef<Position[]>([]);
  const recognitionRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stepTimestampsRef = useRef<number[]>([]);
  const lastAccelRef = useRef<number>(0);
  const runMetricsRef = useRef({ time: 0, distance: 0 });
  const startTimestampRef = useRef<number>(Date.now());
  const sessionIdRef = useRef<string>(`run-${Date.now()}`);
  const lastTerrainCoachingTimeRef = useRef<number>(0);
  const initialAnnouncementMadeRef = useRef<boolean>(false);
  const navAudioCacheRef = useRef<Map<string, string>>(new Map());
  const lastNavSpeakTimeRef = useRef<number>(0);
  const navSpeakQueueRef = useRef<string[]>([]);
  const isNavSpeakingRef = useRef<boolean>(false);
  const lastMovementTimeRef = useRef<number>(Date.now());
  const lastNavInstructionRef = useRef<string>("");
  const runStoppedRef = useRef<boolean>(false);

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

  const sessionMetadataRef = useRef({
    targetDistance: urlTargetDistance,
    levelId: urlLevelId,
    startLat: urlLat,
    startLng: urlLng,
    routeName: urlRouteName,
    routeId: urlRouteId,
    targetTimeSeconds: urlTargetTimeSeconds,
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
      });
      
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
      };
    }
    
    if (isResuming) {
      const savedSession = loadActiveRunSession();
      if (savedSession) {
        console.log("Restoring session:", savedSession);
        setTime(savedSession.elapsedSeconds);
        setDistance(savedSession.distanceKm);
        setCadence(savedSession.cadence);
        setKmSplits(savedSession.kmSplits);
        setLastKmAnnounced(savedSession.lastKmAnnounced);
        setAudioEnabled(savedSession.audioEnabled);
        setAiCoachEnabled(savedSession.aiCoachEnabled);
        startTimestampRef.current = savedSession.startTimestamp;
        sessionIdRef.current = savedSession.id;
        setActive(savedSession.status === 'active');
        
        sessionMetadataRef.current = {
          targetDistance: savedSession.targetDistance,
          levelId: savedSession.levelId,
          startLat: savedSession.startLat,
          startLng: savedSession.startLng,
          routeName: savedSession.routeName,
          routeId: savedSession.routeId,
          targetTimeSeconds: savedSession.targetTimeSeconds,
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
      audio.onended = () => {
        isNavSpeakingRef.current = false;
        resolve();
      };
      audio.onerror = () => {
        isNavSpeakingRef.current = false;
        resolve();
      };
      audio.play().catch(() => {
        isNavSpeakingRef.current = false;
        resolve();
      });
    });
  }, []);

  const processNavQueue = useCallback(async () => {
    if (isNavSpeakingRef.current || navSpeakQueueRef.current.length === 0) return;
    
    const text = navSpeakQueueRef.current.shift();
    if (!text) return;
    
    isNavSpeakingRef.current = true;
    
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
    } catch (error) {
      console.error('Navigation TTS error, using device fallback:', error);
      speakWithDeviceTTS(text);
      isNavSpeakingRef.current = false;
    }
    
    processNavQueue();
  }, [coachSettings, speakWithDeviceTTS, playNavAudio, aiCoachEnabled]);

  const speak = useCallback((text: string, force: boolean = false) => {
    console.log("speak() called with:", text, "audioEnabled:", audioEnabled, "force:", force);
    if (!force && !audioEnabled) {
      console.log("Speech blocked: audio disabled");
      return;
    }
    
    // Throttle navigation speech - minimum 3 seconds between calls
    const now = Date.now();
    if (now - lastNavSpeakTimeRef.current < 3000 && !force) {
      console.log("Navigation speech throttled");
      return;
    }
    lastNavSpeakTimeRef.current = now;
    
    // Add to queue and process
    navSpeakQueueRef.current.push(text);
    processNavQueue();
  }, [audioEnabled, processNavQueue]);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus("error");
      setMessage("GPS not available on this device");
      return;
    }

    const handlePosition = (position: GeolocationPosition) => {
      const accuracy = position.coords.accuracy;
      const MAX_ACCURACY = 30; // Only accept positions with ≤30m accuracy
      
      console.log(`GPS update: accuracy=${accuracy.toFixed(1)}m`);
      
      // Track current accuracy for help dialog
      setCurrentGpsAccuracy(accuracy);
      
      // Reject inaccurate positions (network-based location)
      if (accuracy > MAX_ACCURACY) {
        if (gpsStatus === "acquiring") {
          setMessage(`Refining GPS signal... (${Math.round(accuracy)}m accuracy)`);
        }
        console.log(`GPS position rejected: accuracy ${accuracy.toFixed(1)}m > ${MAX_ACCURACY}m threshold`);
        return;
      }
      
      // Clear accuracy when we get a good fix
      setCurrentGpsAccuracy(undefined);
      
      const newPos: Position = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: position.timestamp
      };
      
      setCurrentPosition(newPos);
      
      if (gpsStatus === "acquiring") {
        setGpsStatus("active");
        setMessage("GPS locked! Start running.");
        // Clear any previous inaccurate positions when we get first accurate fix
        positionsRef.current = [];
        
        // Fetch weather at run start for coaching context
        fetch(`/api/weather/current?lat=${newPos.lat}&lng=${newPos.lng}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data) {
              setRunWeather(data);
            }
          })
          .catch(err => console.warn('Weather fetch failed:', err));
      }
      
      if (active && positionsRef.current.length > 0) {
        const lastPos = positionsRef.current[positionsRef.current.length - 1];
        const segmentDistance = haversineDistance(
          lastPos.lat, lastPos.lng,
          newPos.lat, newPos.lng
        );
        
        const timeDiff = (newPos.timestamp - lastPos.timestamp) / 1000;
        const speedKmh = timeDiff > 0 ? (segmentDistance / timeDiff) * 3600 : 0;
        const speedMs = speedKmh / 3.6;
        
        // Filter settings - tuned to reject GPS drift while accepting real movement
        const minDist = 0.005; // 5m minimum to filter GPS jitter (increased from 2m)
        const maxDist = 0.15;  // 150m max to filter GPS jumps
        const maxSpeed = 35;   // 35 km/h max (sprinting speed)
        const maxTimeDiff = 30;
        
        // Require minimum speed of 1.0 m/s (~3.6 km/h) to filter stationary drift
        // This is slow walking pace - anything slower is likely GPS jitter
        const minSpeedMs = 1.0;
        const isActuallyMoving = speedMs >= minSpeedMs;
        
        const isValidSegment = segmentDistance > minDist && segmentDistance < maxDist && speedKmh < maxSpeed && timeDiff < maxTimeDiff;
        
        if (isActuallyMoving && isValidSegment) {
          setDistance(d => d + segmentDistance);
          lastMovementTimeRef.current = Date.now();
          console.log(`Distance updated: +${(segmentDistance * 1000).toFixed(1)}m, speed: ${speedKmh.toFixed(1)}km/h`);
        } else if (segmentDistance > 0.003) {
          console.log(`Distance skipped: ${(segmentDistance * 1000).toFixed(1)}m, speed: ${speedKmh.toFixed(1)}km/h (moving: ${isActuallyMoving}, valid: ${isValidSegment})`);
        }
      }
      
      positionsRef.current.push(newPos);
    };

    const handleError = (error: GeolocationPositionError) => {
      console.error("GPS Error:", error);
      setGpsStatus("error");
      switch (error.code) {
        case error.PERMISSION_DENIED:
          setMessage("Please enable location access");
          break;
        case error.POSITION_UNAVAILABLE:
          setMessage("GPS signal unavailable");
          break;
        case error.TIMEOUT:
          setMessage("GPS timeout - trying again...");
          break;
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [active, gpsStatus, speak]);

  useEffect(() => {
    if (gpsStatus !== "active" || !currentPosition || initialAnnouncementMadeRef.current) return;
    if (isResuming) {
      initialAnnouncementMadeRef.current = true;
      speak("Welcome back! Resuming your run.");
      return;
    }
    
    initialAnnouncementMadeRef.current = true;
    
    const metadata = sessionMetadataRef.current;
    const targetDistNum = parseFloat(metadata.targetDistance);
    
    const speakFallback = () => {
      getInitialDirectionAnnouncement(
        currentPosition.lat,
        currentPosition.lng,
        routePoints,
        metadata.targetDistance
      ).then(announcement => {
        speak(announcement);
      });
    };
    
    if (!isFinite(targetDistNum) || targetDistNum <= 0) {
      speakFallback();
      return;
    }
    
    const generateAndSpeakSummary = async () => {
      try {
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
          includeAiConfig: true
        };
        
        const response = await fetch('/api/ai/run-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(summaryRequest)
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.summary && typeof data.summary === 'string') {
            speak(data.summary);
            return;
          }
        }
        speakFallback();
      } catch (err) {
        console.warn('Run summary generation failed:', err);
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
      if (nearestIndex >= currentWaypointIndex || nearestDistance < 0.03) {
        setCurrentWaypointIndex(nearestIndex);
        console.log(`Waypoint updated: ${nearestIndex}/${routePoints.length}, distance: ${(nearestDistance * 1000).toFixed(0)}m`);
      }
    }
    
    // Skip navigation announcements if not moving or too soon after last announcement
    if (now - lastDirectionTime < 8000) return;
    if (!isMoving) {
      console.log("Skipping navigation - runner is stationary");
      return;
    }
    
    const remainingPoints = routePoints.length - nearestIndex;
    if (remainingPoints < 15 && nearestDistance < 0.1) {
      speak("You're approaching the finish. Great job!");
      setMessage("Almost there! Finish strong!");
      setLastDirectionTime(now);
      setLastMessageTime(now);
      return;
    }
    
    if (nearestDistance > 0.15) {
      const nearestPoint = routePoints[nearestIndex];
      const bearing = getBearing(currentPosition.lat, currentPosition.lng, nearestPoint.lat, nearestPoint.lng);
      const direction = bearingToCardinal(bearing);
      const distMeters = Math.round(nearestDistance * 1000);
      const instruction = `You're ${distMeters} meters off route. Head ${direction} to get back on track.`;
      speak(instruction);
      setMessage(instruction);
      setLastDirectionTime(now);
      setLastMessageTime(now);
      return;
    }
    
    const lookAheadPoints = Math.min(Math.max(20, Math.floor(routePoints.length * 0.03)), 60);
    const lookAhead = Math.min(nearestIndex + lookAheadPoints, routePoints.length - 1);
    
    if (lookAhead > nearestIndex + 5) {
      const currentPoint = routePoints[nearestIndex];
      const nextPoint = routePoints[lookAhead];
      const distToNext = haversineDistance(currentPosition.lat, currentPosition.lng, nextPoint.lat, nextPoint.lng);
      
      const currentBearing = getBearing(currentPoint.lat, currentPoint.lng, nextPoint.lat, nextPoint.lng);
      
      const futureLookAhead = Math.min(lookAhead + lookAheadPoints, routePoints.length - 1);
      const futurePoint = routePoints[futureLookAhead];
      const nextBearing = getBearing(nextPoint.lat, nextPoint.lng, futurePoint.lat, futurePoint.lng);
      
      const diff = Math.abs(((nextBearing - currentBearing + 540) % 360) - 180);
      
      if (diff > 25) {
        const instruction = getDirectionInstruction(currentBearing, nextBearing, distToNext);
        // Skip if same instruction as last time (prevents repetition)
        if (instruction === lastNavInstructionRef.current) {
          console.log("Skipping duplicate navigation instruction");
          return;
        }
        lastNavInstructionRef.current = instruction;
        speak(instruction);
        setMessage(instruction);
        setLastDirectionTime(now);
        setLastMessageTime(now);
      } else if (distToNext > 0.08 && distToNext < 0.3) {
        const direction = bearingToCardinal(currentBearing);
        const distMeters = Math.round(distToNext * 1000);
        const instruction = `Continue ${direction} for ${distMeters} meters.`;
        // Skip if same instruction as last time (prevents repetition)
        if (instruction === lastNavInstructionRef.current) {
          console.log("Skipping duplicate navigation instruction");
          return;
        }
        lastNavInstructionRef.current = instruction;
        speak(instruction);
        setMessage(instruction);
        setLastDirectionTime(now);
        setLastMessageTime(now);
      }
    }
  }, [active, currentPosition, routePoints, currentWaypointIndex, lastDirectionTime, speak]);

  useEffect(() => {
    if (!active) return;
    
    const interval = setInterval(() => {
      if (Date.now() - lastMessageTime > 30000 && gpsStatus === "active") {
        const randomMsg = COACH_MESSAGES[Math.floor(Math.random() * COACH_MESSAGES.length)];
        setMessage(randomMsg);
        speak(randomMsg);
        setLastMessageTime(Date.now());
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [active, lastMessageTime, gpsStatus, speak]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (active && gpsStatus === "active") {
      interval = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [active, gpsStatus]);

  const saveSessionNow = useCallback(() => {
    // Don't save if run has been stopped/completed
    if (runStoppedRef.current) {
      return;
    }
    const metadata = sessionMetadataRef.current;
    const session: ActiveRunSession = {
      id: sessionIdRef.current,
      startTimestamp: startTimestampRef.current,
      elapsedSeconds: time,
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
      audioEnabled,
      aiCoachEnabled,
      kmSplits,
      lastKmAnnounced,
      status: active ? 'active' : 'paused',
    };
    saveActiveRunSession(session);
  }, [active, time, distance, cadence, routeData, audioEnabled, aiCoachEnabled, kmSplits, lastKmAnnounced]);

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
    
    const handleBeforeUnload = () => {
      saveSessionNow();
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveSessionNow();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(saveInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      saveSessionNow();
    };
  }, [active, time, saveSessionNow]);

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
          toast.success("Motion tracking enabled!");
        } else {
          setMotionPermission("denied");
          toast.error("Motion permission denied");
        }
      } catch (err) {
        console.error("Motion permission error:", err);
        setMotionPermission("denied");
      }
    } else {
      setMotionPermission("granted");
    }
  }, []);

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
          
          if (stepTimestampsRef.current.length > 60) {
            stepTimestampsRef.current = stepTimestampsRef.current.slice(-60);
          }
          
          const recentSteps = stepTimestampsRef.current.filter(t => now - t < 60000);
          if (recentSteps.length >= 2) {
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
      setLastKmAnnounced(currentKm);
      
      const splitTime = time;
      setKmSplits(prev => [...prev, splitTime]);
      
      const lastSplitTime = kmSplits.length > 0 ? kmSplits[kmSplits.length - 1] : 0;
      const thisKmTime = splitTime - lastSplitTime;
      const thisKmMins = Math.floor(thisKmTime / 60);
      const thisKmSecs = thisKmTime % 60;
      
      const targetDistNum = parseFloat(sessionMetadataRef.current.targetDistance);
      const remainingKm = targetDistNum - currentKm;
      
      const avgPaceSeconds = time / currentKm;
      const avgPaceMins = Math.floor(avgPaceSeconds / 60);
      const avgPaceSecs = Math.floor(avgPaceSeconds % 60);
      
      const motivation = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
      
      let announcement = `${currentKm} kilometer${currentKm > 1 ? 's' : ''} complete. `;
      announcement += `Split time: ${thisKmMins} minute${thisKmMins !== 1 ? 's' : ''} ${thisKmSecs} seconds. `;
      announcement += `Average pace: ${avgPaceMins}:${avgPaceSecs.toString().padStart(2, '0')} per kilometer. `;
      
      if (remainingKm > 0) {
        announcement += `${remainingKm.toFixed(1)} kilometers to go. `;
      }
      
      if (cadence > 0) {
        const cadenceFeedback = getCadenceFeedback(cadence);
        if (cadenceFeedback) {
          announcement += `Cadence: ${cadence} steps per minute. ${cadenceFeedback} `;
        }
      }
      
      announcement += motivation;
      
      speak(announcement);
      setMessage(`${currentKm}km - ${thisKmMins}:${thisKmSecs.toString().padStart(2, '0')} split`);
      setLastMessageTime(Date.now());
    }
  }, [active, gpsStatus, distance, lastKmAnnounced, time, kmSplits, cadence, speak]);

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
        
        if (terrainData?.upcomingTerrain) {
          lastTerrainCoachingTimeRef.current = Date.now();
        }
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
          terrain: terrainData,
          // New data for smarter coaching
          recentCoachingTopics: recentCoachingRef.current.slice(-5),
          paceChange,
          currentKm,
          progressPercent,
          milestones: milestones.length > 0 ? milestones : undefined,
          kmSplitTimes: kmSplits,
          weather: runWeather || undefined,
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
            console.log("User question - forcing speech response");
            speak(coachMessage.trim(), true);
          } else {
            speakCoaching(coachMessage.trim());
          }
          setMessage(advice.message || "Coach says...");
        }
      }
    } catch (error) {
      console.error('AI coaching error:', error);
    } finally {
      setIsCoaching(false);
    }
  }, [userProfile, coachPreferences, speakCoaching, speak, routeData, currentPosition, runWeather, kmSplits, coachSettings]);

  useEffect(() => {
    if (!active || !aiCoachEnabled || gpsStatus !== "active") {
      if (coachingTimeoutRef.current) {
        clearTimeout(coachingTimeoutRef.current);
        coachingTimeoutRef.current = null;
      }
      return;
    }
    
    const runCoachingCycle = () => {
      const { active: isActive, aiCoachEnabled: isEnabled, gpsStatus: gps } = coachingControlRef.current;
      if (!isActive || !isEnabled || gps !== "active") {
        coachingTimeoutRef.current = null;
        return;
      }
      
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
        speak("Got it. I'll only speak when you ask me something.");
        toast.success("Coach set to silent mode");
      } else if (lowerTranscript.includes("talk to me") || lowerTranscript.includes("normal mode") || 
                 lowerTranscript.includes("coach me") || lowerTranscript.includes("give me feedback")) {
        setCoachPreferences("");
        localStorage.removeItem("coachPreferences");
        speak("Okay! I'll give you regular coaching updates.");
        toast.success("Regular coaching enabled");
      } else {
        fetchCoaching(transcript);
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

  const toggleLiveShare = (friend: Friend) => {
    const friendId = friend.email || friend.name;
    if (sharedWith.includes(friendId)) {
      setSharedWith(prev => prev.filter(id => id !== friendId));
      toast.info(`Stopped live sharing with ${friend.name}`);
    } else {
      setSharedWith(prev => [...prev, friendId]);
      toast.success(`Now sharing live location & route with ${friend.name}!`);
    }
  };

  const getMapImage = () => {
    switch(sessionMetadataRef.current.levelId) {
      case 'expert': return mapExpert;
      case 'moderate': return mapModerate;
      default: return mapBeginner;
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
      gpsTrack: positionsRef.current.slice(0, 500),
      avgCadence: cadence,
      kmSplits: kmSplits,
      targetDistance: metadata.targetDistance,
      elevationGain: routeData?.elevation?.gain || 0,
      elevationLoss: routeData?.elevation?.loss || 0,
      weatherData: runWeather || undefined,
    };

    // Try to save to database if user is logged in
    const userProfileStr = localStorage.getItem("userProfile");
    if (userProfileStr) {
      try {
        const userProfile = JSON.parse(userProfileStr);
        if (userProfile.id) {
          const dbRunData = {
            userId: userProfile.id,
            routeId: metadata.routeId || undefined,
            distance: distance,
            duration: time,
            avgPace: calculatePace(),
            cadence: cadence || undefined,
            elevation: routeData?.elevation?.gain || undefined,
            difficulty: metadata.levelId,
            startLat: metadata.startLat,
            startLng: metadata.startLng,
            gpsTrack: positionsRef.current.slice(0, 500),
            paceData: kmSplits,
            weatherData: runWeather || undefined,
          };
          
          const response = await fetch('/api/runs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dbRunData)
          });
          
          if (response.ok) {
            const savedRun = await response.json();
            console.log('Run saved to database:', savedRun.id);
            
            // Update localStorage with the DB record so RunInsights can find it
            const localDataWithDbId = {
              ...localRunData,
              id: savedRun.id,
              dbSynced: true
            };
            const runHistory = localStorage.getItem("runHistory");
            const runs = runHistory ? JSON.parse(runHistory) : [];
            runs.push(localDataWithDbId);
            localStorage.setItem("runHistory", JSON.stringify(runs));
            
            localStorage.removeItem("activeRoute");
            return savedRun.id;
          }
        }
      } catch (err) {
        console.warn('Failed to save run to database, using localStorage:', err);
      }
    }
    
    // Fallback: save to localStorage only
    const runHistory = localStorage.getItem("runHistory");
    const runs = runHistory ? JSON.parse(runHistory) : [];
    runs.push(localRunData);
    localStorage.setItem("runHistory", JSON.stringify(runs));
    
    localStorage.removeItem("activeRoute");
    return localRunId;
  };

  const handleStopClick = () => {
    setShowExitConfirmation(true);
  };

  const handlePauseClick = () => {
    if (active) {
      setShowPauseConfirmation(true);
    } else {
      setActive(true);
      speak("Let's go! Run resumed.");
    }
  };

  const confirmPause = () => {
    setShowPauseConfirmation(false);
    setActive(false);
    speak("Run paused. Take a breather.");
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
      speak("Run complete! Great job!");
      setLocation(`/history/${runId}`);
    } else {
      setLocation("/");
    }
  };

  return (
    <div className="h-screen w-full bg-background text-foreground flex flex-col relative overflow-hidden font-sans select-none">
      <div className="absolute inset-0 z-0 opacity-20">
        <img src={getMapImage()} className="w-full h-full object-cover" alt="Map Route" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      </div>

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
                      const isShared = sharedWith.includes(friend.email || friend.name);
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

      <div className="relative z-10 p-3 flex justify-between items-start">
        <div className="flex gap-2 items-center">
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
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end max-w-[200px]">
          <Button
            onClick={() => setAudioEnabled(!audioEnabled)}
            size="icon"
            className={`h-8 w-8 rounded-lg ${audioEnabled ? "bg-primary text-background" : "bg-white/10 text-muted-foreground"}`}
            data-testid="button-audio-toggle"
          >
            {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </Button>
          <Button
            onClick={() => setAiCoachEnabled(!aiCoachEnabled)}
            size="icon"
            className={`h-8 w-8 rounded-lg ${
              aiCoachEnabled 
                ? "bg-blue-500 text-white border border-blue-400" 
                : "bg-white/10 text-muted-foreground"
            } ${isCoaching ? "animate-pulse" : ""}`}
            data-testid="button-ai-coach-toggle"
          >
            {aiCoachEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </Button>
          <Button
            onClick={isListening ? stopListening : startListening}
            size="icon"
            className={`h-8 w-8 rounded-lg ${
              isListening 
                ? "bg-red-500 text-white border border-red-400 animate-pulse" 
                : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
            }`}
            data-testid="button-talk-to-coach"
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </Button>
          {motionPermission === "unknown" && (
            <Button
              onClick={requestMotionPermission}
              size="icon"
              className="h-8 w-8 rounded-lg bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse"
              data-testid="button-enable-cadence"
            >
              <Footprints className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            onClick={() => setShowShareModal(true)}
            size="icon"
            className={`h-8 w-8 rounded-lg ${
              sharedWith.length > 0 
                ? "bg-green-500 text-white border border-green-300" 
                : "bg-primary text-background hover:bg-primary/90"
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4 min-h-0 py-1">
        <div className="relative mb-1 flex-shrink-1 min-h-0 flex flex-col items-center">
           <div className={`absolute inset-0 bg-primary/20 blur-3xl rounded-full transition-all duration-1000 ${active ? 'scale-110 opacity-100' : 'scale-90 opacity-50'}`} />
           <img 
              src={coachAvatar} 
              className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-primary/20 shadow-[0_0_50px_rgba(6,182,212,0.3)] object-cover relative z-10 transition-all duration-500"
              alt="AI Coach"
            />
            
            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.9 }}
                  className="mt-2 w-64 bg-card/80 backdrop-blur-xl border border-primary/30 p-2 rounded-xl text-center shadow-2xl relative z-20"
                >
                  <p className="text-primary font-medium text-[11px] leading-relaxed">"{message}"</p>
                  {currentGpsAccuracy && currentGpsAccuracy > 100 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowGpsHelp(true)}
                      className="mt-2 text-xs h-7 px-3 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                      data-testid="button-gps-help-run"
                    >
                      Need Help with GPS?
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
        </div>
        
        <div className="mt-1">
          <VoiceVisualizer isActive={active && !!message} />
        </div>
      </div>

      <div className="relative z-10 bg-card/40 backdrop-blur-xl border-t border-white/10 rounded-t-2xl p-3 pb-4 mt-auto flex-shrink-0">
        <div className="grid grid-cols-4 gap-1 mb-3 text-center">
          <div>
            <div className="text-muted-foreground text-[9px] uppercase tracking-wider">Time</div>
            <div className="text-lg font-display font-bold">{formatTime(time)}</div>
          </div>
          <div className="border-x border-white/10">
             <div className="text-muted-foreground text-[9px] uppercase tracking-wider">Distance</div>
             <div className="text-lg font-display font-bold">{distance.toFixed(2)}</div>
             <div className="text-[9px] text-muted-foreground">km</div>
          </div>
          <div className="border-r border-white/10">
             <div className="text-muted-foreground text-[9px] uppercase tracking-wider">Pace</div>
             <div className="text-lg font-display font-bold">{calculatePace()}</div>
             <div className="text-[9px] text-muted-foreground">/km</div>
          </div>
          <div>
             <div className="text-muted-foreground text-[9px] uppercase tracking-wider">Cadence</div>
             <div className={`text-lg font-display font-bold ${cadence >= 165 && cadence <= 185 ? 'text-green-400' : cadence > 0 ? 'text-yellow-400' : ''}`}>
               {cadence > 0 ? cadence : '--'}
             </div>
             <div className="text-[9px] text-muted-foreground">spm</div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button 
            variant="outline" 
            size="icon" 
            className="w-10 h-10 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20"
            onClick={handleStopClick}
            data-testid="button-stop"
          >
            <Square className="w-3.5 h-3.5 fill-foreground" />
          </Button>
          
          <Button 
            size="icon" 
            className={`w-14 h-14 rounded-full transition-transform active:scale-95 ${
              active 
                ? "bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)]" 
                : "bg-green-500 text-white hover:bg-green-600 shadow-[0_0_30px_rgba(34,197,94,0.4)]"
            }`}
            onClick={handlePauseClick}
            data-testid="button-toggle-play"
          >
            {active ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
          </Button>
          
          <Button 
            variant="outline" 
            size="icon" 
            className="w-10 h-10 rounded-full border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary"
            onClick={openGoogleMapsNavigation}
            data-testid="button-google-navigation"
          >
            <Navigation className="w-3.5 h-3.5" />
          </Button>
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
