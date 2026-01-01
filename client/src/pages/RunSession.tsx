import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { RouteMap } from "@/components/RouteMap";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  Pause, Play, Square, Heart, Map, Share2, Users, Navigation, Volume2, VolumeX, Footprints, Mic, MicOff, MessageCircle 
} from "lucide-react";
import type { Friend } from "./Profile";

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

export default function RunSession() {
  const [active, setActive] = useState(true);
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [message, setMessage] = useState("Acquiring GPS signal...");
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [showMap, setShowMap] = useState(false);
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
  
  const [aiCoachEnabled, setAiCoachEnabled] = useState(true);
  const [coachingInterval] = useState(120);
  const [isCoaching, setIsCoaching] = useState(false);
  const [coachPreferences, setCoachPreferences] = useState("");
  const [isListening, setIsListening] = useState(false);
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

  const searchParams = new URLSearchParams(window.location.search);
  const targetDistance = searchParams.get("distance") || "5";
  const levelId = searchParams.get("level") || "beginner";
  const lat = parseFloat(searchParams.get("lat") || "40.7128");
  const lng = parseFloat(searchParams.get("lng") || "-74.0060");
  const routeName = searchParams.get("routeName") || "";
  const routeId = searchParams.get("routeId") || "";
  const targetTimeSeconds = parseInt(searchParams.get("targetTime") || "0");

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
    if (savedRoute) {
      const route: RouteData = JSON.parse(savedRoute);
      setRouteData(route);
      if (route.polyline) {
        const points = decodePolyline(route.polyline);
        setRoutePoints(points);
      }
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!audioEnabled || !('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    speechSynthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [audioEnabled]);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus("error");
      setMessage("GPS not available on this device");
      return;
    }

    const handlePosition = (position: GeolocationPosition) => {
      const newPos: Position = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: position.timestamp
      };
      
      setCurrentPosition(newPos);
      
      if (gpsStatus === "acquiring") {
        setGpsStatus("active");
        setMessage("GPS locked! Start running.");
        speak("GPS signal acquired. Your run has started.");
      }
      
      if (active && positionsRef.current.length > 0) {
        const lastPos = positionsRef.current[positionsRef.current.length - 1];
        const segmentDistance = haversineDistance(
          lastPos.lat, lastPos.lng,
          newPos.lat, newPos.lng
        );
        
        const timeDiff = (newPos.timestamp - lastPos.timestamp) / 1000;
        const speedKmh = timeDiff > 0 ? (segmentDistance / timeDiff) * 3600 : 0;
        
        if (segmentDistance > 0.0005 && segmentDistance < 0.1 && speedKmh < 30) {
          setDistance(d => d + segmentDistance);
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
    if (!active || !currentPosition || routePoints.length < 2) return;
    
    const now = Date.now();
    if (now - lastDirectionTime < 12000) return;
    
    let nearestIndex = currentWaypointIndex;
    let nearestDistance = Infinity;
    
    const searchWindow = Math.min(100, routePoints.length - currentWaypointIndex);
    for (let i = currentWaypointIndex; i < currentWaypointIndex + searchWindow; i++) {
      if (i >= routePoints.length) break;
      const point = routePoints[i];
      const dist = haversineDistance(currentPosition.lat, currentPosition.lng, point.lat, point.lng);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }
    
    if (nearestIndex > currentWaypointIndex) {
      setCurrentWaypointIndex(nearestIndex);
    }
    
    const remainingPoints = routePoints.length - nearestIndex;
    if (remainingPoints < 10 && nearestDistance < 0.05) {
      speak("You're approaching the finish. Great job!");
      setMessage("Almost there! Finish strong!");
      setLastDirectionTime(now);
      setLastMessageTime(now);
      return;
    }
    
    const lookAheadDistance = Math.min(50, Math.floor(routePoints.length * 0.05));
    const lookAhead = Math.min(nearestIndex + Math.max(lookAheadDistance, 15), routePoints.length - 1);
    
    if (lookAhead > nearestIndex && nearestDistance < 0.05) {
      const nextPoint = routePoints[lookAhead];
      const distToNext = haversineDistance(
        currentPosition.lat, currentPosition.lng,
        nextPoint.lat, nextPoint.lng
      );
      
      if (distToNext < 0.2) {
        const currentBearing = getBearing(
          currentPosition.lat, currentPosition.lng,
          routePoints[nearestIndex].lat, routePoints[nearestIndex].lng
        );
        
        const futureLookAhead = Math.min(lookAhead + lookAheadDistance, routePoints.length - 1);
        const futurePoint = routePoints[futureLookAhead];
        const nextBearing = getBearing(
          nextPoint.lat, nextPoint.lng,
          futurePoint.lat, futurePoint.lng
        );
        
        const diff = Math.abs(((nextBearing - currentBearing + 540) % 360) - 180);
        
        if (diff > 30) {
          const instruction = getDirectionInstruction(currentBearing, nextBearing, distToNext);
          speak(instruction);
          setMessage(instruction);
          setLastDirectionTime(now);
          setLastMessageTime(now);
        }
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
      
      const targetDistNum = parseFloat(targetDistance);
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
  }, [active, gpsStatus, distance, lastKmAnnounced, time, kmSplits, targetDistance, cadence, speak]);

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
  
  const speakCoaching = useCallback((text: string) => {
    const { active: isActive, aiCoachEnabled: isEnabled } = coachingControlRef.current;
    if (!isActive || !isEnabled || !audioEnabledRef.current || !('speechSynthesis' in window)) return;
    
    if (window.speechSynthesis.speaking) {
      setTimeout(() => speakCoaching(text), 2000);
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const fetchCoaching = useCallback(async (userMessage?: string) => {
    const { active: isActive, aiCoachEnabled: isEnabled, gpsStatus: gps } = coachingControlRef.current;
    if (!isActive || !isEnabled || gps !== "active") return;
    
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
      
      const response = await fetch('/api/ai/coaching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPace,
          targetPace: targetPaceMap[levelId] || '6:00',
          elapsedTime: currentTime,
          distanceCovered: currentDistance,
          totalDistance: parseFloat(targetDistance),
          difficulty: levelId,
          userFitnessLevel: userProfile?.fitnessLevel || 'intermediate',
          targetTimeSeconds: targetTimeSeconds > 0 ? targetTimeSeconds : undefined,
          userName: userProfile?.name,
          userAge: userProfile?.dob ? calculateAge(userProfile.dob) : undefined,
          userWeight: userProfile?.weight,
          userHeight: userProfile?.height,
          userGender: userProfile?.gender,
          desiredFitnessLevel: userProfile?.desiredFitnessLevel,
          coachName: userProfile?.coachName,
          userMessage: userMessage,
          coachPreferences: coachPreferences || undefined,
        })
      });
      
      if (response.ok) {
        const { active: stillActive, aiCoachEnabled: stillEnabled } = coachingControlRef.current;
        if (!stillActive || !stillEnabled) return;
        
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
          speakCoaching(coachMessage.trim());
          setMessage(advice.message || "Coach says...");
        }
      }
    } catch (error) {
      console.error('AI coaching error:', error);
    } finally {
      setIsCoaching(false);
    }
  }, [targetDistance, levelId, targetTimeSeconds, userProfile, coachPreferences, speakCoaching]);

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
    switch(levelId) {
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

  const openGoogleMaps = () => {
    if (!currentPosition) {
      toast.error("Waiting for GPS signal...");
      return;
    }
    
    let mapsUrl = `https://www.google.com/maps/dir/?api=1`;
    mapsUrl += `&origin=${currentPosition.lat},${currentPosition.lng}`;
    
    if (routeData && routeData.waypoints.length > 0) {
      const destination = routeData.waypoints[routeData.waypoints.length - 1] || 
                          { lat: routeData.startLat, lng: routeData.startLng };
      mapsUrl += `&destination=${destination.lat},${destination.lng}`;
      
      if (routeData.waypoints.length > 1) {
        const maxWaypoints = 8;
        const allWaypoints = routeData.waypoints.slice(0, -1);
        let sampledWaypoints = allWaypoints;
        
        if (allWaypoints.length > maxWaypoints) {
          const step = allWaypoints.length / maxWaypoints;
          sampledWaypoints = [];
          for (let i = 0; i < maxWaypoints; i++) {
            sampledWaypoints.push(allWaypoints[Math.floor(i * step)]);
          }
        }
        
        const waypointStr = sampledWaypoints
          .map(w => `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`)
          .join('|');
        mapsUrl += `&waypoints=${encodeURIComponent(waypointStr)}`;
      }
      
      mapsUrl += `&travelmode=walking`;
    } else {
      mapsUrl += `&destination=${lat},${lng}`;
      mapsUrl += `&travelmode=walking`;
    }
    
    window.open(mapsUrl, '_blank');
  };

  const saveRunData = () => {
    const now = new Date();
    const date = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const runData = {
      id: `run_${Date.now()}`,
      date,
      time: timeStr,
      distance,
      totalTime: time,
      avgPace: calculatePace(),
      difficulty: levelId,
      lat,
      lng,
      routeName,
      routeId,
      gpsTrack: positionsRef.current.slice(0, 500),
      avgCadence: cadence,
      kmSplits: kmSplits,
    };

    const runHistory = localStorage.getItem("runHistory");
    const runs = runHistory ? JSON.parse(runHistory) : [];
    runs.push(runData);
    localStorage.setItem("runHistory", JSON.stringify(runs));
    
    localStorage.removeItem("activeRoute");
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    if (time > 0 && distance > 0) {
      saveRunData();
      speak("Run complete! Great job!");
    }
    setLocation("/");
  };

  return (
    <div className="h-screen w-full bg-background text-foreground flex flex-col relative overflow-hidden font-sans select-none">
      <AnimatePresence>
        {showMap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 p-6 bg-background/95 backdrop-blur-sm"
            onClick={() => setShowMap(false)}
          >
            <div className="h-full rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <RouteMap lat={lat} lng={lng} level={levelId as any} distance={parseFloat(targetDistance)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      <div className="relative z-10 p-6 flex justify-between items-start">
        <div className="flex gap-2">
          <div className="bg-card/30 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Target</div>
            <div className="text-xl font-display font-bold text-primary">{targetDistance} km</div>
          </div>
          <div className={`backdrop-blur-md rounded-xl p-3 border flex items-center gap-2 ${
            gpsStatus === "active" ? "bg-green-500/20 border-green-500/30" :
            gpsStatus === "error" ? "bg-red-500/20 border-red-500/30" :
            "bg-yellow-500/20 border-yellow-500/30"
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              gpsStatus === "active" ? "bg-green-500 animate-pulse" :
              gpsStatus === "error" ? "bg-red-500" :
              "bg-yellow-500 animate-pulse"
            }`} />
            <span className="text-xs font-bold uppercase">
              {gpsStatus === "active" ? "GPS" : gpsStatus === "error" ? "No GPS" : "..."}
            </span>
          </div>
          {sharedWith.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-primary/20 backdrop-blur-md rounded-xl p-3 border border-primary/30 flex items-center gap-2"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <div className="text-[10px] font-display font-bold text-primary uppercase text-xs">Sharing Live</div>
            </motion.div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="bg-destructive/20 backdrop-blur-md rounded-xl p-3 border border-destructive/30 flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-500 animate-pulse" />
            <div className="text-xl font-display font-bold text-white">-- <span className="text-xs font-sans font-normal text-muted-foreground">BPM</span></div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setAudioEnabled(!audioEnabled)}
              size="icon"
              className={`h-10 w-10 rounded-xl ${audioEnabled ? "bg-primary text-background" : "bg-white/10 text-muted-foreground"}`}
              data-testid="button-audio-toggle"
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            <Button
              onClick={() => setAiCoachEnabled(!aiCoachEnabled)}
              size="icon"
              className={`h-10 w-10 rounded-xl ${
                aiCoachEnabled 
                  ? "bg-blue-500 text-white border border-blue-400" 
                  : "bg-white/10 text-muted-foreground"
              } ${isCoaching ? "animate-pulse" : ""}`}
              data-testid="button-ai-coach-toggle"
            >
              {aiCoachEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </Button>
            <Button
              onClick={isListening ? stopListening : startListening}
              size="icon"
              className={`h-10 w-10 rounded-xl ${
                isListening 
                  ? "bg-red-500 text-white border border-red-400 animate-pulse" 
                  : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
              }`}
              data-testid="button-talk-to-coach"
            >
              <MessageCircle className="w-4 h-4" />
            </Button>
            {motionPermission === "unknown" && (
              <Button
                onClick={requestMotionPermission}
                size="icon"
                className="h-10 w-10 rounded-xl bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse"
                data-testid="button-enable-cadence"
              >
                <Footprints className="w-4 h-4" />
              </Button>
            )}
            {motionPermission === "granted" && (
              <div className="h-10 w-10 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30 flex items-center justify-center">
                <Footprints className="w-4 h-4" />
              </div>
            )}
            <Button
              onClick={() => setShowShareModal(true)}
              className={`h-10 px-4 rounded-xl font-display text-[10px] uppercase tracking-widest transition-all ${
                sharedWith.length > 0 
                  ? "bg-green-500 text-white border-2 border-green-300 shadow-[0_0_15px_rgba(34,197,94,0.5)]" 
                  : "bg-primary text-background hover:bg-primary/90"
              }`}
            >
              <Share2 className="w-3 h-3 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-6 min-h-0 py-2">
        <div className="relative mb-2 flex-shrink-1 min-h-0 flex flex-col items-center">
           <div className={`absolute inset-0 bg-primary/20 blur-3xl rounded-full transition-all duration-1000 ${active ? 'scale-110 opacity-100' : 'scale-90 opacity-50'}`} />
           <img 
              src={coachAvatar} 
              className="w-32 h-32 sm:w-48 sm:h-48 md:w-64 md:h-64 rounded-full border-4 border-primary/20 shadow-[0_0_50px_rgba(6,182,212,0.3)] object-cover relative z-10 transition-all duration-500"
              alt="AI Coach"
            />
            
            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.9 }}
                  className="mt-4 w-72 bg-card/80 backdrop-blur-xl border border-primary/30 p-3 rounded-2xl text-center shadow-2xl relative z-20"
                >
                  <p className="text-primary font-medium text-xs leading-relaxed">"{message}"</p>
                </motion.div>
              )}
            </AnimatePresence>
        </div>
        
        <div className="mt-1">
          <VoiceVisualizer isActive={active && !!message} />
        </div>
      </div>

      <div className="relative z-10 bg-card/40 backdrop-blur-xl border-t border-white/10 rounded-t-3xl p-4 pb-6 mt-auto flex-shrink-0">
        <div className="grid grid-cols-4 gap-2 mb-4 text-center">
          <div>
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Time</div>
            <div className="text-xl font-display font-bold">{formatTime(time)}</div>
          </div>
          <div className="border-x border-white/10">
             <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Distance</div>
             <div className="text-xl font-display font-bold">{distance.toFixed(2)}</div>
             <div className="text-[10px] text-muted-foreground">km</div>
          </div>
          <div className="border-r border-white/10">
             <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Pace</div>
             <div className="text-xl font-display font-bold">{calculatePace()}</div>
             <div className="text-[10px] text-muted-foreground">/km</div>
          </div>
          <div>
             <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Cadence</div>
             <div className={`text-xl font-display font-bold ${cadence >= 165 && cadence <= 185 ? 'text-green-400' : cadence > 0 ? 'text-yellow-400' : ''}`}>
               {cadence > 0 ? cadence : '--'}
             </div>
             <div className="text-[10px] text-muted-foreground">spm</div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            className="w-10 h-10 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20"
            onClick={handleStop}
            data-testid="button-stop"
          >
            <Square className="w-3.5 h-3.5 fill-foreground" />
          </Button>
          
          <Button 
            size="icon" 
            className="w-14 h-14 rounded-full bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-transform active:scale-95"
            onClick={() => setActive(!active)}
            data-testid="button-toggle-play"
          >
            {active ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
          </Button>
          
          <Button 
            variant="outline" 
            size="icon" 
            className="w-10 h-10 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20"
            onClick={() => setShowMap(!showMap)}
            data-testid="button-map"
          >
            <Map className="w-3.5 h-3.5" />
          </Button>
          
          <Button 
            variant="outline" 
            size="icon" 
            className="w-10 h-10 rounded-full border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary"
            onClick={openGoogleMaps}
            data-testid="button-google-maps"
          >
            <Navigation className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
