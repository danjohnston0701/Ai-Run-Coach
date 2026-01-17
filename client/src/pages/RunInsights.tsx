import { useState, useEffect, useMemo } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  ArrowLeft, Calendar, TrendingUp, Heart, 
  Activity, Zap as CadenceIcon, Info, Timer, MapPin, Share2, Mail, User as UserIcon, Search, Star,
  Facebook, Instagram, Download, X, Map, Users, Trophy, Medal, Award, Trash2, Brain, CheckCircle, Target, Lightbulb, AlertTriangle, Sparkles, Footprints, Pencil, Check, Play, Route, MessageSquare
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { TelemetryChartSection, type TelemetryDataPoint } from "@/components/TelemetryChartSection";
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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RunData } from "./RunHistory";
import { shareToSocialMedia, downloadShareImage } from "@/lib/shareImageGenerator";
import { MapContainer, TileLayer, Polyline, useMap, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Cloud, Sun, CloudRain, Wind, Droplets, ThermometerSun } from "lucide-react";

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Component to fit map bounds to the GPS track
function FitBoundsToTrack({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      const bounds = L.latLngBounds(positions.map(p => [p[0], p[1]]));
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [positions, map]);
  return null;
}

interface GroupRunParticipant {
  id: string;
  userId: string;
  userName: string;
  role: string;
  runId?: string;
  run?: {
    distance: number;
    duration: number;
    avgPace: string;
    cadence?: number;
  };
}

interface GroupRunSummary {
  groupRun: {
    id: string;
    title: string;
    mode: string;
    status: string;
  };
  participants: GroupRunParticipant[];
}

export default function RunInsights() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/history/:id");
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const groupRunId = searchParams.get("groupRunId");
  const isFriendView = searchParams.get("friendView") === "true";
  
  const [run, setRun] = useState<RunData | null>(null);
  const [groupRunSummary, setGroupRunSummary] = useState<GroupRunSummary | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [routeRating, setRouteRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [showSocialShareModal, setShowSocialShareModal] = useState(false);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [shareFormat, setShareFormat] = useState<"post" | "story">("post");
  const [cadenceAnalysis, setCadenceAnalysis] = useState<{
    idealCadenceMin: number;
    idealCadenceMax: number;
    strideAssessment: string;
    shortAdvice: string;
    coachingAdvice: string;
  } | null>(null);
  const [isLoadingCadenceAnalysis, setIsLoadingCadenceAnalysis] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    highlights: string[];
    struggles: string[];
    personalBests: string[];
    demographicComparison: string;
    coachingTips: string[];
    overallAssessment: string;
    weatherImpact?: string;
    warmUpAnalysis?: string;
    goalProgress?: string;
    targetTimeAnalysis?: string;
  } | null>(null);
  const [isLoadingAiAnalysis, setIsLoadingAiAnalysis] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [selfAssessment, setSelfAssessment] = useState("");
  const [coachingLogs, setCoachingLogs] = useState<Array<{
    id: string;
    createdAt: string;
    eventType: string;
    elapsedSeconds: number | null;
    distanceKm: number | null;
    currentPace: string | null;
    heartRate: number | null;
    cadence: number | null;
    terrain: unknown;
    weather: unknown;
    prompt: string | null;
    responseText: string | null;
    topic: string | null;
    latencyMs: number | null;
  }>>([]);
  const [isLoadingCoachingLogs, setIsLoadingCoachingLogs] = useState(false);
  const [showCoachingLogs, setShowCoachingLogs] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [telemetryData, setTelemetryData] = useState<{
    dataPoints: TelemetryDataPoint[];
    paceStats?: { min: number; max: number; avg: number };
    elevationProfile?: { totalGain: number; totalLoss: number; maxGrade: number; hillCount: number };
    cadenceStats?: { min: number; max: number; avg: number };
    distance?: number;
    duration?: number;
  } | null>(null);
  
  // Weakness/Struggle events state
  const [weaknessEvents, setWeaknessEvents] = useState<Array<{
    id: string;
    startDistanceKm: number;
    endDistanceKm: number;
    durationSeconds: number;
    avgPaceBefore: number;
    avgPaceDuring: number;
    dropPercent: number;
    causeTag: string | null;
    causeNote: string | null;
    coachResponseGiven: string | null;
    userComment: string | null;
    isIrrelevant: boolean;
    reviewedAt: string | null;
  }>>([]);
  const [isLoadingWeaknesses, setIsLoadingWeaknesses] = useState(false);
  const [editingWeaknessId, setEditingWeaknessId] = useState<string | null>(null);
  const [editingCauseTag, setEditingCauseTag] = useState<string>("");
  const [editingCauseNote, setEditingCauseNote] = useState<string>("");
  const [editingUserComment, setEditingUserComment] = useState<string>("");
  const [pendingReviewSaves, setPendingReviewSaves] = useState<Set<string>>(new Set());
  // Track local comment edits per event (not yet saved to server) - used for toggleIrrelevant
  const [localCommentEdits, setLocalCommentEdits] = useState<Record<string, string>>({});
  
  // Run-to-route conversion state
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  
  // Create Event state (admin only)
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    name: "",
    country: "",
    city: "",
    eventType: "parkrun",
    description: "",
    scheduleType: "recurring" as "one_time" | "recurring",
    recurrencePattern: "weekly" as "daily" | "weekly" | "fortnightly" | "monthly",
    dayOfWeek: 6, // Saturday default
    dayOfMonth: 1,
    specificDate: "",
  });

  useEffect(() => {
    const loadRun = async () => {
      if (!params?.id) return;
      
      // First try localStorage
      const runHistory = localStorage.getItem("runHistory");
      if (runHistory) {
        const runs = JSON.parse(runHistory);
        const foundRun = runs.find((r: RunData) => r.id === params.id);
        if (foundRun) {
          setRun(foundRun);
          if (foundRun.rating) {
            setRouteRating(foundRun.rating);
            setRatingSubmitted(true);
          }
          return;
        }
      }
      
      // If not in localStorage, try fetching from API (for UUID-based IDs)
      try {
        const profile = localStorage.getItem("userProfile");
        const userId = profile ? JSON.parse(profile).id : null;
        const url = userId ? `/api/runs/${params.id}?userId=${userId}` : `/api/runs/${params.id}`;
        const response = await fetch(url);
        if (response.ok) {
          const dbRun = await response.json();
          const mappedRun: RunData = {
            id: dbRun.id,
            name: dbRun.name,
            date: dbRun.completedAt ? new Date(dbRun.completedAt).toLocaleDateString('en-GB') : '',
            time: dbRun.completedAt ? new Date(dbRun.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
            distance: dbRun.distance,
            totalTime: dbRun.duration,
            avgPace: dbRun.avgPace || '',
            difficulty: dbRun.difficulty || 'beginner',
            lat: dbRun.startLat || 0,
            lng: dbRun.startLng || 0,
            avgHeartRate: dbRun.avgHeartRate,
            maxHeartRate: dbRun.maxHeartRate,
            calories: dbRun.calories,
            cadence: dbRun.cadence,
            gpsTrack: dbRun.gpsTrack,
            kmSplits: dbRun.paceData,
            weatherData: dbRun.weatherData,
            routeId: dbRun.routeId,
            aiCoachEnabled: dbRun.aiCoachEnabled,
          } as any;
          setRun(mappedRun);
          if ((mappedRun as any).rating) {
            setRouteRating((mappedRun as any).rating);
            setRatingSubmitted(true);
          }
          // Hydrate cached AI analysis if available
          if (dbRun.aiCoachingNotes && typeof dbRun.aiCoachingNotes === 'object') {
            const notes = dbRun.aiCoachingNotes;
            if (notes.highlights && notes.coachingTips) {
              setAiAnalysis(notes);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch run from API:', err);
      }
    };
    
    loadRun();
    
    const shared = localStorage.getItem(`shared_${params?.id}`);
    if (shared) {
      setSharedWith(JSON.parse(shared));
    }

    const profile = localStorage.getItem("userProfile");
    if (profile) {
      const parsed = JSON.parse(profile);
      setFriends(parsed.friends || []);
    }
  }, [params?.id]);

  // Fetch saved AI analysis on page load
  useEffect(() => {
    if (!params?.id) return;
    
    const fetchSavedAnalysis = async () => {
      try {
        const profile = localStorage.getItem("userProfile");
        const userId = profile ? JSON.parse(profile).id : null;
        const url = userId 
          ? `/api/runs/${params.id}/analysis?userId=${userId}` 
          : `/api/runs/${params.id}/analysis`;
        
        const response = await fetch(url);
        if (response.ok) {
          const savedAnalysis = await response.json();
          if (savedAnalysis && savedAnalysis.highlights) {
            setAiAnalysis(savedAnalysis);
          }
        }
      } catch (err) {
        // Silently fail - user can manually generate if needed
        console.warn('No saved AI analysis found:', err);
      }
    };
    
    fetchSavedAnalysis();
  }, [params?.id]);

  // Fetch telemetry data for charts
  useEffect(() => {
    if (!params?.id) return;
    
    const fetchTelemetry = async () => {
      try {
        const response = await fetch(`/api/runs/${params.id}/telemetry`);
        if (response.ok) {
          const data = await response.json();
          if (data.telemetry) {
            setTelemetryData({
              ...data.telemetry,
              distance: data.distance,
              duration: data.duration
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch telemetry:', err);
      }
    };
    
    fetchTelemetry();
  }, [params?.id]);

  // Fetch weakness/struggle events for this run
  useEffect(() => {
    if (!params?.id) return;
    
    const fetchWeaknesses = async () => {
      setIsLoadingWeaknesses(true);
      try {
        const profile = localStorage.getItem("userProfile");
        const userId = profile ? JSON.parse(profile).id : null;
        if (!userId) return;
        
        const response = await fetch(`/api/runs/${params.id}/weakness-events?userId=${userId}`);
        if (response.ok) {
          const events = await response.json();
          setWeaknessEvents(events);
        }
      } catch (err) {
        console.warn('Failed to fetch weakness events:', err);
      } finally {
        setIsLoadingWeaknesses(false);
      }
    };
    
    fetchWeaknesses();
  }, [params?.id]);

  // Check admin status and fetch coaching logs for admin users
  useEffect(() => {
    const profile = localStorage.getItem("userProfile");
    if (profile) {
      const parsed = JSON.parse(profile);
      if (parsed.isAdmin) {
        setIsAdmin(true);
      }
    }
  }, []);

  // Fetch coaching logs when admin clicks to view them
  const fetchCoachingLogs = async () => {
    if (!params?.id || isLoadingCoachingLogs) return;
    
    setIsLoadingCoachingLogs(true);
    try {
      const profile = localStorage.getItem("userProfile");
      const userId = profile ? JSON.parse(profile).id : null;
      if (!userId) return;
      
      const response = await fetch(`/api/runs/${params.id}/coaching-logs?userId=${userId}`);
      if (response.ok) {
        const logs = await response.json();
        setCoachingLogs(logs);
      }
    } catch (err) {
      console.error('Failed to fetch coaching logs:', err);
    } finally {
      setIsLoadingCoachingLogs(false);
    }
  };

  // Fetch AI cadence analysis when run is loaded
  useEffect(() => {
    if (!run) return;
    
    const avgCadence = (run as any).avgCadence || run.cadence;
    if (!avgCadence || avgCadence < 60) return;
    
    // Get user profile for height
    const profile = localStorage.getItem("userProfile");
    if (!profile) return;
    
    const userProfile = JSON.parse(profile);
    const heightStr = userProfile.height;
    if (!heightStr) return;
    
    const heightCm = parseFloat(String(heightStr).replace(/[^0-9.]/g, ''));
    if (isNaN(heightCm) || heightCm < 100 || heightCm > 250) return;
    
    // Calculate pace (min/km)
    const avgPaceStr = run.avgPace || '';
    let paceMinPerKm = 0;
    const paceParts = avgPaceStr.split(':');
    if (paceParts.length === 2) {
      paceMinPerKm = parseInt(paceParts[0]) + parseInt(paceParts[1]) / 60;
    }
    if (paceMinPerKm <= 0 || paceMinPerKm > 20) return;
    
    // Calculate age if DOB available
    let userAge: number | undefined;
    if (userProfile.dob) {
      const birthDate = new Date(userProfile.dob);
      const today = new Date();
      userAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        userAge--;
      }
    }
    
    setIsLoadingCadenceAnalysis(true);
    
    fetch('/api/ai/analyze-cadence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heightCm,
        paceMinPerKm,
        cadenceSpm: avgCadence,
        distanceKm: run.distance,
        userFitnessLevel: userProfile.fitnessLevel,
        userAge
      })
    })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data) {
        setCadenceAnalysis(data);
      }
    })
    .catch(err => console.error('Cadence analysis error:', err))
    .finally(() => setIsLoadingCadenceAnalysis(false));
  }, [run]);

  useEffect(() => {
    if (!groupRunId) return;
    
    const profile = localStorage.getItem("userProfile");
    const userId = profile ? JSON.parse(profile).id : null;
    const url = userId 
      ? `/api/group-runs/${groupRunId}/summary?userId=${userId}`
      : `/api/group-runs/${groupRunId}/summary`;
    
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        setGroupRunSummary(data);
      })
      .catch(err => console.error('Failed to fetch group run summary:', err));
  }, [groupRunId]);

  const sortedParticipants = useMemo(() => {
    if (!groupRunSummary?.participants) return [];
    
    return [...groupRunSummary.participants]
      .filter(p => p.run)
      .sort((a, b) => {
        if (!a.run || !b.run) return 0;
        const paceA = a.run.avgPace?.split(':').map(Number) || [99, 99];
        const paceB = b.run.avgPace?.split(':').map(Number) || [99, 99];
        const totalA = paceA[0] * 60 + (paceA[1] || 0);
        const totalB = paceB[0] * 60 + (paceB[1] || 0);
        return totalA - totalB;
      });
  }, [groupRunSummary?.participants]);

  const submitRating = async (rating: number) => {
    if (!run || ratingSubmitted) return;
    
    setRouteRating(rating);
    
    try {
      const profile = localStorage.getItem("userProfile");
      const userId = profile ? JSON.parse(profile).id : null;
      
      if (userId) {
        // Extract template name from route name (e.g., "5.2km hard - North Loop" -> "North Loop")
        const templateMatch = (run as any).routeName?.match(/- (.+)$/);
        const templateName = templateMatch ? templateMatch[1] : null;
        
        await fetch("/api/route-ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            runId: run.id,
            rating,
            templateName,
            routeDistance: run.distance,
            startLat: (run as any).lat,
            startLng: (run as any).lng,
          }),
        });
      }
      
      // Save rating to local storage
      const runHistory = localStorage.getItem("runHistory");
      if (runHistory) {
        const runs = JSON.parse(runHistory);
        const updatedRuns = runs.map((r: RunData) => 
          r.id === run.id ? { ...r, rating } : r
        );
        localStorage.setItem("runHistory", JSON.stringify(updatedRuns));
      }
      
      setRatingSubmitted(true);
      toast.success(`Route rated ${rating}/10! This helps improve future suggestions.`);
    } catch (error) {
      console.error("Failed to submit rating:", error);
      toast.error("Failed to save rating");
    }
  };

  const handleSaveAsRoute = async () => {
    if (!run || !params?.id) return;
    
    const profile = localStorage.getItem("userProfile");
    const userId = profile ? JSON.parse(profile).id : null;
    
    if (!userId) {
      toast.error("Please log in to save routes");
      return;
    }
    
    setIsSavingRoute(true);
    try {
      const response = await fetch(`/api/runs/${params.id}/to-route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: run.name || `Route from ${run.date}`,
          makeFavorite: true,
          userId: userId
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save route");
      }
      
      toast.success("Route saved to favorites!");
    } catch (error) {
      console.error("Failed to save as route:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save route");
    } finally {
      setIsSavingRoute(false);
    }
  };

  const handleRunAgain = () => {
    if (!run || !params?.id) return;
    
    const profile = localStorage.getItem("userProfile");
    const userId = profile ? JSON.parse(profile).id : null;
    
    if (!userId) {
      toast.error("Please log in to run again");
      return;
    }
    
    // Store the run ID, name, and userId to convert to route and navigate to home
    localStorage.setItem("runAgainRunId", params.id);
    localStorage.setItem("runAgainRunName", run.name || `Run from ${run.date}`);
    localStorage.setItem("runAgainUserId", userId);
    setLocation("/");
  };

  const handleCreateEvent = async () => {
    if (!run || !params?.id) return;
    
    const profile = localStorage.getItem("userProfile");
    const userId = profile ? JSON.parse(profile).id : null;
    
    if (!userId) {
      toast.error("Please log in to create events");
      return;
    }
    
    if (!eventForm.name.trim() || !eventForm.country.trim()) {
      toast.error("Event name and country are required");
      return;
    }
    
    if (eventForm.scheduleType === "one_time" && !eventForm.specificDate) {
      toast.error("Event date is required for one-time events");
      return;
    }
    
    setIsCreatingEvent(true);
    try {
      const response = await fetch(`/api/events/from-run/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: eventForm.name,
          country: eventForm.country,
          city: eventForm.city || undefined,
          eventType: eventForm.eventType,
          description: eventForm.description || undefined,
          scheduleType: eventForm.scheduleType,
          specificDate: eventForm.scheduleType === "one_time" ? eventForm.specificDate : undefined,
          recurrencePattern: eventForm.scheduleType === "recurring" ? eventForm.recurrencePattern : undefined,
          dayOfWeek: eventForm.scheduleType === "recurring" && ["weekly", "fortnightly"].includes(eventForm.recurrencePattern) 
            ? eventForm.dayOfWeek : undefined,
          dayOfMonth: eventForm.scheduleType === "recurring" && eventForm.recurrencePattern === "monthly" 
            ? eventForm.dayOfMonth : undefined,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        const errorMsg = error.detail ? `${error.error}: ${error.detail}` : (error.error || "Failed to create event");
        throw new Error(errorMsg);
      }
      
      const result = await response.json();
      toast.success(`Event "${eventForm.name}" created successfully!`);
      setShowCreateEventModal(false);
      setEventForm({
        name: "",
        country: "",
        city: "",
        eventType: "parkrun",
        description: "",
        scheduleType: "recurring",
        recurrencePattern: "weekly",
        dayOfWeek: 6,
        dayOfMonth: 1,
        specificDate: "",
      });
    } catch (error) {
      console.error("Failed to create event:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create event");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const handleDeleteRun = async () => {
    if (!run || !params?.id) return;
    
    setIsDeleting(true);
    try {
      const profile = localStorage.getItem("userProfile");
      const userId = profile ? JSON.parse(profile).id : null;
      
      // Delete from database
      const url = userId ? `/api/runs/${params.id}?userId=${userId}` : `/api/runs/${params.id}`;
      const response = await fetch(url, { method: "DELETE" });
      
      if (!response.ok) {
        throw new Error("Failed to delete run from server");
      }
      
      // Also remove from localStorage
      const runHistory = localStorage.getItem("runHistory");
      if (runHistory) {
        const runs = JSON.parse(runHistory);
        const updatedRuns = runs.filter((r: RunData) => r.id !== params.id);
        localStorage.setItem("runHistory", JSON.stringify(updatedRuns));
      }
      
      toast.success("Run deleted successfully");
      setLocation("/history");
    } catch (error) {
      console.error("Failed to delete run:", error);
      toast.error("Failed to delete run");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSaveRunName = async () => {
    if (!run || !params?.id || !editedName.trim()) return;
    
    setIsSavingName(true);
    try {
      const response = await fetch(`/api/runs/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editedName.trim() }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update run name");
      }
      
      // Update local state
      setRun({ ...run, name: editedName.trim() } as any);
      
      // Update localStorage
      const runHistory = localStorage.getItem("runHistory");
      if (runHistory) {
        const runs = JSON.parse(runHistory);
        const updatedRuns = runs.map((r: RunData) => 
          r.id === params.id ? { ...r, name: editedName.trim() } : r
        );
        localStorage.setItem("runHistory", JSON.stringify(updatedRuns));
      }
      
      setIsEditingName(false);
      toast.success("Run renamed successfully");
    } catch (error) {
      console.error("Failed to rename run:", error);
      toast.error("Failed to rename run");
    } finally {
      setIsSavingName(false);
    }
  };

  const startEditingName = () => {
    setEditedName((run as any)?.name || `Run on ${run?.date}`);
    setIsEditingName(true);
  };

  // Save weakness event annotation
  const saveWeaknessAnnotation = async (eventId: string) => {
    try {
      const profile = localStorage.getItem("userProfile");
      const userId = profile ? JSON.parse(profile).id : null;
      if (!userId) return;
      
      const response = await fetch(`/api/weakness-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          causeTag: editingCauseTag || null,
          causeNote: editingCauseNote || null,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to save annotation");
      }
      
      // Update local state
      setWeaknessEvents(prev => prev.map(e => 
        e.id === eventId 
          ? { ...e, causeTag: editingCauseTag || null, causeNote: editingCauseNote || null }
          : e
      ));
      
      setEditingWeaknessId(null);
      setEditingCauseTag("");
      setEditingCauseNote("");
      toast.success("Struggle point annotated");
    } catch (error) {
      console.error("Failed to save weakness annotation:", error);
      toast.error("Failed to save annotation");
    }
  };

  // Start editing a weakness event
  const startEditingWeakness = (event: typeof weaknessEvents[0]) => {
    setEditingWeaknessId(event.id);
    setEditingCauseTag(event.causeTag || "");
    setEditingCauseNote(event.causeNote || "");
    setEditingUserComment(event.userComment || "");
  };

  // Save user review (comment and isIrrelevant flag)
  const saveWeaknessReview = async (eventId: string, userComment: string | null, isIrrelevant: boolean) => {
    try {
      setPendingReviewSaves(prev => new Set(prev).add(eventId));
      
      const response = await fetch(`/api/weakness-events/${eventId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userComment, isIrrelevant }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to save review");
      }
      
      const updatedEvent = await response.json();
      
      // Update local state
      setWeaknessEvents(prev => prev.map(e => 
        e.id === eventId 
          ? { ...e, userComment, isIrrelevant, reviewedAt: updatedEvent.reviewedAt }
          : e
      ));
      
      toast.success(isIrrelevant ? "Marked as not relevant" : "Comment saved");
    } catch (error) {
      console.error("Failed to save weakness review:", error);
      toast.error("Failed to save review");
    } finally {
      setPendingReviewSaves(prev => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  // Toggle irrelevant status - use local edits if they exist (persists after blur)
  const toggleIrrelevant = (event: typeof weaknessEvents[0]) => {
    // Check for local edits first (persists even after blur), then editing state, then saved value
    const currentComment = localCommentEdits[event.id] !== undefined 
      ? localCommentEdits[event.id] 
      : (editingWeaknessId === event.id ? editingUserComment : event.userComment);
    saveWeaknessReview(event.id, currentComment || null, !event.isIrrelevant);
    // Clear local edits for this event since we're saving
    setLocalCommentEdits(prev => {
      const next = { ...prev };
      delete next[event.id];
      return next;
    });
    // Clear editing state if applicable
    if (editingWeaknessId === event.id) {
      setEditingWeaknessId(null);
    }
  };

  const generateAiAnalysis = async () => {
    if (!run || !params?.id) return;
    
    setIsLoadingAiAnalysis(true);
    setAiAnalysisError(null);
    
    try {
      const profile = localStorage.getItem("userProfile");
      const userId = profile ? JSON.parse(profile).id : null;
      
      if (!userId) {
        setAiAnalysisError("Please log in to generate AI analysis");
        return;
      }
      
      // Prepare struggle data for AI context - filter out irrelevant ones
      const reviewedStruggles = weaknessEvents
        .filter(e => !e.isIrrelevant)
        .map(e => ({
          distanceKm: `${e.startDistanceKm.toFixed(2)}-${e.endDistanceKm.toFixed(2)}`,
          paceDropPercent: Math.round(e.dropPercent),
          durationSeconds: e.durationSeconds,
          userComment: e.userComment,
          causeTag: e.causeTag,
        }));
      
      const response = await fetch(`/api/runs/${params.id}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId,
          reviewedStruggles: reviewedStruggles.length > 0 ? reviewedStruggles : undefined,
          selfAssessment: selfAssessment.trim() || undefined
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate analysis");
      }
      
      const analysis = await response.json();
      setAiAnalysis(analysis);
      toast.success("AI analysis generated!");
    } catch (error) {
      console.error("Failed to generate AI analysis:", error);
      setAiAnalysisError(error instanceof Error ? error.message : "Failed to generate analysis");
      toast.error("Failed to generate AI analysis");
    } finally {
      setIsLoadingAiAnalysis(false);
    }
  };

  const handleShareFriend = (friend: Friend) => {
    const recipient = friend.userCode || friend.name;
    if (sharedWith.includes(recipient)) {
      toast.error("Already shared with this friend");
      return;
    }
    const updatedSharedWith = [...sharedWith, recipient];
    setSharedWith(updatedSharedWith);
    localStorage.setItem(`shared_${params?.id}`, JSON.stringify(updatedSharedWith));
    toast.success(`Run shared with ${friend.name}!`);
  };

  const handleShare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim()) {
      toast.error("Please enter a valid email address or username");
      return;
    }
    
    if (sharedWith.includes(shareEmail)) {
      toast.error("Already shared with this person");
      return;
    }

    const updatedSharedWith = [...sharedWith, shareEmail];
    setSharedWith(updatedSharedWith);
    localStorage.setItem(`shared_${params?.id}`, JSON.stringify(updatedSharedWith));
    
    toast.success(`Run shared with ${shareEmail}! They'll receive a notification.`);
    setShareEmail("");
  };

  const filteredFriends = friends.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSocialShare = async (platform: "facebook" | "instagram" | "native") => {
    if (!run) return;
    setIsGeneratingShare(true);
    try {
      const routeCoords = (run as any).gpsTrack || (run as any).routeCoords;
      await shareToSocialMedia({ run, routeCoords, format: shareFormat }, platform);
      if (platform === "instagram") {
        toast.success("Image downloaded! Open Instagram and share from your gallery.");
      } else if (platform === "facebook") {
        toast.success("Image downloaded! You can attach it to your Facebook post.");
      } else {
        toast.success("Run summary shared!");
      }
    } catch (error) {
      console.error("Share error:", error);
      toast.error("Could not share. Try downloading the image instead.");
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!run) return;
    setIsGeneratingShare(true);
    try {
      const routeCoords = (run as any).gpsTrack || (run as any).routeCoords;
      await downloadShareImage({ run, routeCoords, format: shareFormat });
      toast.success("Image downloaded!");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Could not download image.");
    } finally {
      setIsGeneratingShare(false);
    }
  };

  // Check if we have real heart rate data
  const hasHeartRateData = !!(run as any)?.heartRateData?.length || !!(run as any)?.avgHeartRate;
  
  // Get GPS track data for pace gradient map
  const gpsTrack = (run as any)?.gpsTrack || [];
  const hasGpsTrack = gpsTrack.length > 1;
  
  // Get real splits data
  const kmSplits = (run as any)?.kmSplits || [];
  
  // Calculate pace data from GPS track for chart
  const paceChartData = useMemo(() => {
    if (!run || kmSplits.length === 0) return [];
    return kmSplits.map((split: any, idx: number) => ({
      km: idx + 1,
      pace: split.pace,
      paceSeconds: split.paceSeconds || 0,
    }));
  }, [run, kmSplits]);

  // Generate chart data with elevation (and heart rate if available)
  const chartData = useMemo(() => {
    if (!run) return [];
    const data = [];
    
    // Use real elevation profile from route if available
    const elevationProfile = (run as any).elevationProfile || [];
    const heartRateData = (run as any).heartRateData || [];
    const baseHR = (run as any).avgHeartRate || 155;
    
    if (elevationProfile.length > 0) {
      // Use real elevation data
      for (let i = 0; i < elevationProfile.length; i++) {
        const point = elevationProfile[i];
        const distKm = (point.distance || 0) / 1000;
        
        // Get heart rate from recorded data if available
        let hr: number = 0;
        if (heartRateData.length > 0) {
          const hrIdx = Math.floor((i / elevationProfile.length) * heartRateData.length);
          hr = heartRateData[Math.min(hrIdx, heartRateData.length - 1)]?.hr || baseHR;
        } else if (hasHeartRateData) {
          hr = baseHR - 10 + Math.random() * 20;
        }
        
        data.push({
          distance: parseFloat(distKm.toFixed(2)),
          elevation: point.elevation || 0,
          hr: hr > 0 ? hr : undefined,
        });
      }
    } else {
      // Fallback: generate points based on distance with flat elevation
      const points = Math.max(20, Math.floor(run.distance * 10));
      const baseElev = (run as any).elevationGain || 10;
      
      for (let i = 0; i <= points; i++) {
        const dist = (run.distance / points) * i;
        
        let hr: number = 0;
        if (heartRateData.length > 0) {
          const hrIdx = Math.floor((i / points) * heartRateData.length);
          hr = heartRateData[Math.min(hrIdx, heartRateData.length - 1)]?.hr || baseHR;
        } else if (hasHeartRateData) {
          hr = baseHR - 10 + Math.random() * 20;
        }
        
        data.push({
          distance: parseFloat(dist.toFixed(2)),
          elevation: baseElev,
          hr: hr > 0 ? hr : undefined,
        });
      }
    }
    return data;
  }, [run, hasHeartRateData]);

  // Calculate pace gradient segments from GPS track
  const paceGradientSegments = useMemo(() => {
    if (!run || !hasGpsTrack || gpsTrack.length < 2) return [];
    
    const segments: { positions: [number, number][]; color: string; pace: number }[] = [];
    
    // Calculate pace for each segment (finer segmentation for better visualization)
    const segmentSize = Math.max(2, Math.floor(gpsTrack.length / 50));
    
    // Calculate all segment paces first to find min/max
    const segmentPaces: number[] = [];
    for (let i = 0; i < gpsTrack.length - 1; i += segmentSize) {
      const endIdx = Math.min(i + segmentSize, gpsTrack.length - 1);
      const startPoint = gpsTrack[i];
      const endPoint = gpsTrack[endIdx];
      
      // Calculate segment distance
      const lat1 = startPoint.lat * Math.PI / 180;
      const lat2 = endPoint.lat * Math.PI / 180;
      const dLat = (endPoint.lat - startPoint.lat) * Math.PI / 180;
      const dLng = (endPoint.lng - startPoint.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distanceKm = 6371 * c;
      
      // Calculate time between points (using timestamp if available, else estimate)
      const timeMs = (endPoint.timestamp || 0) - (startPoint.timestamp || 0);
      const timeMin = timeMs > 0 ? timeMs / 60000 : (run.totalTime / gpsTrack.length * segmentSize) / 60;
      
      // Calculate pace (min/km)
      const pace = distanceKm > 0.01 ? timeMin / distanceKm : 0;
      segmentPaces.push(pace);
    }
    
    // Get pace range for color mapping
    const validPaces = segmentPaces.filter(p => p > 0 && p < 20);
    if (validPaces.length === 0) return [];
    
    const minPace = Math.min(...validPaces);
    const maxPace = Math.max(...validPaces);
    const paceRange = maxPace - minPace || 1;
    
    // Create colored segments
    let segmentIdx = 0;
    for (let i = 0; i < gpsTrack.length - 1; i += segmentSize) {
      const endIdx = Math.min(i + segmentSize + 1, gpsTrack.length);
      const segmentPoints: [number, number][] = [];
      
      for (let j = i; j < endIdx; j++) {
        segmentPoints.push([gpsTrack[j].lat, gpsTrack[j].lng]);
      }
      
      const pace = segmentPaces[segmentIdx] || 0;
      
      // Garmin-style color: blue (slower) → green → yellow → orange → red (faster)
      // normalizedPace: 0 = fastest, 1 = slowest
      const normalizedPace = pace > 0 ? (pace - minPace) / paceRange : 0.5;
      
      // Multi-stop gradient: faster (0) = red/orange, slower (1) = blue
      // Color stops: 0=red, 0.25=orange, 0.5=yellow, 0.75=green, 1=blue
      let color: string;
      if (normalizedPace <= 0.25) {
        // Red to orange (fastest)
        const t = normalizedPace / 0.25;
        color = `rgb(${Math.round(239 + (249 - 239) * t)}, ${Math.round(68 + (115 - 68) * t)}, ${Math.round(68 + (22 - 68) * t)})`;
      } else if (normalizedPace <= 0.5) {
        // Orange to yellow
        const t = (normalizedPace - 0.25) / 0.25;
        color = `rgb(${Math.round(249 + (234 - 249) * t)}, ${Math.round(115 + (179 - 115) * t)}, ${Math.round(22 + (8 - 22) * t)})`;
      } else if (normalizedPace <= 0.75) {
        // Yellow to green
        const t = (normalizedPace - 0.5) / 0.25;
        color = `rgb(${Math.round(234 + (34 - 234) * t)}, ${Math.round(179 + (197 - 179) * t)}, ${Math.round(8 + (94 - 8) * t)})`;
      } else {
        // Green to blue (slowest)
        const t = (normalizedPace - 0.75) / 0.25;
        color = `rgb(${Math.round(34 + (59 - 34) * t)}, ${Math.round(197 + (130 - 197) * t)}, ${Math.round(94 + (246 - 94) * t)})`;
      }
      
      segments.push({
        positions: segmentPoints,
        color,
        pace
      });
      
      segmentIdx++;
    }
    
    return segments;
  }, [run, gpsTrack, hasGpsTrack]);

  if (!run) return null;

  const hrZones = [
    { name: "Zone 5", range: "> 169 bpm", value: 12, color: "#ef4444", label: "Maximum" },
    { name: "Zone 4", range: "151-169 bpm", value: 48, color: "#f97316", label: "Threshold" },
    { name: "Zone 3", range: "132-150 bpm", value: 25, color: "#84cc16", label: "Aerobic" },
    { name: "Zone 2", range: "113-131 bpm", value: 10, color: "#3b82f6", label: "Easy" },
    { name: "Zone 1", range: "95-112 bpm", value: 5, color: "#64748b", label: "Warm Up" },
  ];

  const formatDuration = (seconds: number) => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return '-';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
  };
  
  const formatDistance = (dist: number) => {
    if (dist === undefined || dist === null || isNaN(dist)) return '-';
    return dist.toFixed(2);
  };
  
  const formatPace = (pace: string | undefined) => {
    if (!pace || pace.includes('NaN') || pace.includes('undefined')) return '-';
    return pace;
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 pb-24 font-sans">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation("/history")}
            className="rounded-full border-white/10 hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-xl font-display font-bold bg-white/10 border-primary/50 text-foreground h-10 max-w-[280px]"
                  placeholder="Enter run name..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRunName();
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                  data-testid="input-run-name"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSaveRunName}
                  disabled={isSavingName || !editedName.trim()}
                  className="text-green-400 hover:bg-green-400/20"
                  data-testid="button-save-name"
                >
                  <Check className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditingName(false)}
                  className="text-muted-foreground hover:bg-white/10"
                  data-testid="button-cancel-edit"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-wider">
                  {(run as any).name || "Run Insights"}
                </h1>
                {!isFriendView && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={startEditingName}
                    className="text-muted-foreground hover:text-primary hover:bg-white/10 h-8 w-8"
                    data-testid="button-edit-name"
                    title="Rename run"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{run.date} • {run.time}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isFriendView && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowSocialShareModal(true)}
                className="rounded-full border-primary/50 hover:bg-primary/20 text-primary"
                data-testid="button-social-share"
                title="Share to Social Media"
              >
                <Instagram className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowShareModal(true)}
                className="rounded-full border-white/20 hover:bg-white/10 text-muted-foreground"
                data-testid="button-share-run"
                title="Share with Friends"
              >
                <Share2 className="w-5 h-5" />
              </Button>
            </>
          )}
          <Badge className="bg-primary/10 border-primary/30 text-primary text-[10px] uppercase font-bold px-3">
            {run.difficulty}
          </Badge>
        </div>
      </header>

      {/* Group Run Comparison Section */}
      {groupRunSummary && sortedParticipants.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Card className="bg-gradient-to-br from-purple-500/10 to-primary/10 border-purple-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-display font-bold uppercase tracking-wider text-purple-400">
                  Group Run Results
                </h2>
              </div>
              
              <div className="space-y-3">
                {sortedParticipants.map((participant, idx) => {
                  const profile = localStorage.getItem("userProfile");
                  const currentUserId = profile ? JSON.parse(profile).id : null;
                  const isCurrentUser = participant.userId === currentUserId;
                  const RankIcon = idx === 0 ? Trophy : idx === 1 ? Medal : idx === 2 ? Award : null;
                  const rankColor = idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-600' : 'text-muted-foreground';
                  
                  return (
                    <div 
                      key={participant.id}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        isCurrentUser 
                          ? 'bg-primary/20 border border-primary/50' 
                          : 'bg-white/5 border border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          idx < 3 ? 'bg-white/10' : 'bg-white/5'
                        }`}>
                          {RankIcon ? (
                            <RankIcon className={`w-4 h-4 ${rankColor}`} />
                          ) : (
                            <span className="text-sm font-bold text-muted-foreground">{idx + 1}</span>
                          )}
                        </div>
                        <div>
                          <p className={`font-medium ${isCurrentUser ? 'text-primary' : ''}`}>
                            {participant.userName}
                            {isCurrentUser && <span className="text-xs ml-1">(You)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {participant.run?.distance?.toFixed(2) || '-'} km
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${idx === 0 ? 'text-yellow-400' : isCurrentUser ? 'text-primary' : ''}`}>
                          {participant.run?.avgPace || '-'}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase">/km</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {groupRunSummary.participants.filter(p => !p.run).length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {groupRunSummary.participants.filter(p => !p.run).length} participant(s) haven't completed yet
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-card border border-white/10 rounded-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <h2 className="text-xl font-display font-bold uppercase tracking-wider text-primary">Share Run</h2>
              <p className="text-xs text-muted-foreground">Send this run record to inspire others.</p>
              
              {/* Friends List */}
              {friends.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Quick Share - Friends</p>
                  <div className="grid grid-cols-2 gap-2">
                    {friends.map((friend, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleShareFriend(friend)}
                        disabled={sharedWith.includes(friend.userCode || friend.name)}
                        className="p-3 bg-white/5 hover:bg-primary/10 border border-white/10 hover:border-primary/50 rounded-lg text-xs font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sharedWith.includes(friend.userCode || friend.name) ? "✓" : "+"} {friend.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search/Lookup */}
              <form onSubmit={handleShare} className="space-y-3 border-t border-white/10 pt-4">
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
                    Search or Add by Email
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="friend@example.com"
                      className="w-full pl-9 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowShareModal(false)}
                    className="flex-1 border-white/10 hover:bg-white/5 text-xs"
                  >
                    Done
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-primary text-background hover:bg-primary/90 flex items-center justify-center gap-2 text-xs"
                  >
                    <Mail className="w-3 h-3" />
                    Share
                  </Button>
                </div>
              </form>

              {sharedWith.length > 0 && (
                <div className="border-t border-white/10 pt-4 space-y-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Shared with ({sharedWith.length}):</p>
                  <div className="space-y-2">
                    {sharedWith.map((email, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/5">
                        <UserIcon className="w-3 h-3 text-primary" />
                        <span className="text-xs text-muted-foreground truncate">{email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Social Media Share Modal */}
      <AnimatePresence>
        {showSocialShareModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
            onClick={() => setShowSocialShareModal(false)}
          >
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-card border border-white/10 rounded-2xl p-6 space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-display font-bold uppercase tracking-wider text-primary">Share to Social</h2>
                <button 
                  onClick={() => setShowSocialShareModal(false)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  data-testid="button-close-social-share"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Share your run achievement with friends on social media. We'll generate a beautiful image with your stats!
              </p>

              {/* Format Selection */}
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Image Format</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShareFormat("post")}
                    className={`flex-1 py-3 px-4 rounded-xl border transition-all ${
                      shareFormat === "post" 
                        ? "bg-primary/20 border-primary text-primary" 
                        : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/30"
                    }`}
                    data-testid="button-format-post"
                  >
                    <div className="text-sm font-bold">Post</div>
                    <div className="text-[10px] opacity-70">1:1 Square</div>
                  </button>
                  <button
                    onClick={() => setShareFormat("story")}
                    className={`flex-1 py-3 px-4 rounded-xl border transition-all ${
                      shareFormat === "story" 
                        ? "bg-primary/20 border-primary text-primary" 
                        : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/30"
                    }`}
                    data-testid="button-format-story"
                  >
                    <div className="text-sm font-bold">Story</div>
                    <div className="text-[10px] opacity-70">9:16 Vertical</div>
                  </button>
                </div>
              </div>

              {/* Social Platforms */}
              <div className="space-y-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Share To</p>
                
                <button
                  onClick={() => handleSocialShare("facebook")}
                  disabled={isGeneratingShare}
                  className="w-full flex items-center gap-4 p-4 bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border border-[#1877F2]/30 rounded-xl transition-all disabled:opacity-50"
                  data-testid="button-share-facebook"
                >
                  <div className="p-2 bg-[#1877F2] rounded-lg">
                    <Facebook className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-bold text-white">Facebook</div>
                    <div className="text-[10px] text-muted-foreground">Post or Story</div>
                  </div>
                </button>

                <button
                  onClick={() => handleSocialShare("instagram")}
                  disabled={isGeneratingShare}
                  className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-[#833AB4]/10 via-[#FD1D1D]/10 to-[#F77737]/10 hover:from-[#833AB4]/20 hover:via-[#FD1D1D]/20 hover:to-[#F77737]/20 border border-[#E1306C]/30 rounded-xl transition-all disabled:opacity-50"
                  data-testid="button-share-instagram"
                >
                  <div className="p-2 bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737] rounded-lg">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-bold text-white">Instagram</div>
                    <div className="text-[10px] text-muted-foreground">Post or Story</div>
                  </div>
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={() => handleSocialShare("native")}
                    disabled={isGeneratingShare}
                    className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all disabled:opacity-50"
                    data-testid="button-share-native"
                  >
                    <div className="p-2 bg-primary/20 rounded-lg">
                      <Share2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="text-sm font-bold text-white">More Options</div>
                      <div className="text-[10px] text-muted-foreground">Use device sharing</div>
                    </div>
                  </button>
                )}
              </div>

              {/* Download Option */}
              <div className="border-t border-white/10 pt-4">
                <button
                  onClick={handleDownloadImage}
                  disabled={isGeneratingShare}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-primary font-bold text-sm transition-all disabled:opacity-50"
                  data-testid="button-download-image"
                >
                  <Download className="w-4 h-4" />
                  {isGeneratingShare ? "Generating..." : "Download Image"}
                </button>
                <p className="text-[10px] text-center text-muted-foreground mt-2">
                  Save the image and share it anywhere
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="space-y-8">
        {/* Key Stats Grid */}
        <section className="grid grid-cols-2 gap-3">
          <Card className="bg-card/30 border-white/5 backdrop-blur-sm">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <MapPin className="w-4 h-4 text-primary mb-1" />
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Distance</div>
              <div className="text-2xl font-display font-bold text-primary">{formatDistance(run.distance)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">km</div>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5 backdrop-blur-sm">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <Timer className="w-4 h-4 text-primary mb-1" />
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Time</div>
              <div className="text-2xl font-display font-bold text-primary">{formatDuration(run.totalTime)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">duration</div>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5 backdrop-blur-sm">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <TrendingUp className="w-4 h-4 text-primary mb-1" />
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Avg Pace</div>
              <div className="text-2xl font-display font-bold text-primary">{formatPace(run.avgPace)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">/km</div>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5 backdrop-blur-sm">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <CadenceIcon className="w-4 h-4 text-primary mb-1" />
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Avg Cadence</div>
              <div className="text-2xl font-display font-bold text-primary">{((run as any).avgCadence || run.cadence) && ((run as any).avgCadence || run.cadence) > 0 ? Math.round((run as any).avgCadence || run.cadence) : '--'}</div>
              <div className="text-[10px] text-muted-foreground uppercase">spm</div>
            </CardContent>
          </Card>
        </section>

        {/* Struggle Awareness Points Section - Above AI Analysis */}
        {!isFriendView && (
        <section className="space-y-4">
          {/* Compact empty state */}
          {!isLoadingWeaknesses && weaknessEvents.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-500/5 border border-green-500/10 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">
                <span className="text-green-400 font-medium">No pace drops detected</span> — consistent effort throughout your run
              </span>
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold uppercase tracking-wide">Struggle Awareness Points</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Review pace changes before generating AI analysis</p>
              </div>
            </div>
          </div>

          {isLoadingWeaknesses ? (
            <Card className="bg-card/30 border-white/5 p-4">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-white/10 rounded w-2/3" />
                <div className="h-4 bg-white/10 rounded w-1/2" />
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Review these pace changes and add comments if they were caused by external factors (e.g., traffic lights, water break). 
                Mark as "Not Relevant" to exclude from AI analysis.
              </p>
              {weaknessEvents.map((event, idx) => {
                const isSaving = pendingReviewSaves.has(event.id);
                const paceBeforeMins = Math.floor(event.avgPaceBefore / 60);
                const paceBeforeSecs = Math.floor(event.avgPaceBefore % 60);
                const paceDuringMins = Math.floor(event.avgPaceDuring / 60);
                const paceDuringSecs = Math.floor(event.avgPaceDuring % 60);
                
                return (
                  <Card 
                    key={event.id} 
                    className={`bg-card/30 border-white/5 p-4 ${event.isIrrelevant ? 'opacity-50' : ''}`}
                    data-testid={`struggle-point-${idx}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-orange-400 border-orange-400/30 text-xs">
                            {event.startDistanceKm.toFixed(2)} - {event.endDistanceKm.toFixed(2)} km
                          </Badge>
                          <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs">
                            -{Math.round(event.dropPercent)}% pace drop
                          </Badge>
                          {event.isIrrelevant && (
                            <Badge variant="outline" className="text-gray-400 border-gray-400/30 text-xs">
                              Not Relevant
                            </Badge>
                          )}
                          {event.reviewedAt && !event.isIrrelevant && (
                            <Badge variant="outline" className="text-green-400 border-green-400/30 text-xs">
                              <Check className="w-3 h-3 mr-1" />
                              Reviewed
                            </Badge>
                          )}
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          Pace: {paceBeforeMins}:{paceBeforeSecs.toString().padStart(2, '0')} → {paceDuringMins}:{paceDuringSecs.toString().padStart(2, '0')}/km 
                          <span className="mx-1">•</span>
                          Duration: {event.durationSeconds}s
                        </div>
                        
                        {event.coachResponseGiven && (
                          <p className="text-xs text-white/70 italic bg-white/5 p-2 rounded">
                            "{event.coachResponseGiven}"
                          </p>
                        )}
                        
                        <div className="pt-2">
                          <label className="text-xs text-muted-foreground block mb-1">Your comment (optional):</label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="e.g., Stopped at traffic light, water break..."
                              value={editingWeaknessId === event.id ? editingUserComment : (localCommentEdits[event.id] ?? event.userComment ?? "")}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                // Track local edits so toggleIrrelevant can access them even after blur
                                setLocalCommentEdits(prev => ({ ...prev, [event.id]: newValue }));
                                if (editingWeaknessId !== event.id) {
                                  setEditingWeaknessId(event.id);
                                  setEditingUserComment(newValue);
                                } else {
                                  setEditingUserComment(newValue);
                                }
                              }}
                              onBlur={() => {
                                if (editingWeaknessId === event.id && editingUserComment !== (event.userComment || "")) {
                                  saveWeaknessReview(event.id, editingUserComment || null, event.isIrrelevant);
                                  // Clear local edits after successful save on blur
                                  setLocalCommentEdits(prev => {
                                    const next = { ...prev };
                                    delete next[event.id];
                                    return next;
                                  });
                                }
                                setEditingWeaknessId(null);
                              }}
                              className="text-xs h-8 bg-white/5 border-white/10"
                              data-testid={`input-struggle-comment-${idx}`}
                              disabled={isSaving}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <Button
                          variant={event.isIrrelevant ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleIrrelevant(event)}
                          disabled={isSaving}
                          className={`text-xs ${event.isIrrelevant ? 'bg-gray-600' : ''}`}
                          data-testid={`button-toggle-irrelevant-${idx}`}
                        >
                          {isSaving ? (
                            <span className="animate-spin">...</span>
                          ) : event.isIrrelevant ? (
                            "Mark Relevant"
                          ) : (
                            "Not Relevant"
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          </>
          )}
        </section>
        )}

        {/* AI Run Analysis Section - Hidden for friend views */}
        {!isFriendView && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-lg">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold uppercase tracking-wide">AI Coach Analysis</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Elite coaching insights for this run</p>
              </div>
            </div>
          </div>

          {!aiAnalysis && !isLoadingAiAnalysis && (
            <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/20 backdrop-blur-sm">
              <CardContent className="p-6 space-y-4">
                <div className="text-center">
                  <div className="p-4 bg-purple-500/10 rounded-full w-fit mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-display font-bold text-white mb-2">Get Personalized Coaching</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Our AI coach will analyze your run data, compare it to your history, and provide expert tips tailored to your fitness goals.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/90 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                    Self-Assessment - How did the session go? (optional)
                  </label>
                  <textarea
                    value={selfAssessment}
                    onChange={(e) => setSelfAssessment(e.target.value)}
                    placeholder="Share your thoughts... e.g., 'I got sore shins after 3km', 'Felt strong on the hills', 'Had a muscle knot in my shoulder the whole run', 'Struggled mentally in the middle section'"
                    rows={3}
                    className="w-full px-3 py-2 rounded-md border border-white/10 bg-background/50 text-foreground placeholder:text-muted-foreground/60 resize-none text-sm"
                    data-testid="textarea-self-assessment"
                  />
                  <p className="text-xs text-muted-foreground">
                    Include any aches, pains, challenges, or positive feelings that data might not capture. This helps the AI coach provide more relevant advice.
                  </p>
                </div>
                
                {aiAnalysisError && (
                  <div className="flex items-center justify-center gap-2 text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {aiAnalysisError}
                  </div>
                )}
                <div className="text-center">
                  <Button
                    onClick={generateAiAnalysis}
                    disabled={isLoadingAiAnalysis}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold px-8"
                    data-testid="button-generate-ai-analysis"
                  >
                    <Brain className="w-4 h-4 mr-2" />
                    Generate AI Run Analysis
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoadingAiAnalysis && (
            <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/20 backdrop-blur-sm">
              <CardContent className="p-6 text-center space-y-4">
                <div className="animate-pulse space-y-4">
                  <div className="p-4 bg-purple-500/20 rounded-full w-fit mx-auto animate-spin">
                    <Brain className="w-8 h-8 text-purple-400" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-white/10 rounded w-3/4 mx-auto" />
                    <div className="h-4 bg-white/10 rounded w-1/2 mx-auto" />
                  </div>
                  <p className="text-sm text-muted-foreground">Analyzing your performance data...</p>
                </div>
              </CardContent>
            </Card>
          )}

          {aiAnalysis && (
            <div className="space-y-4">
              {/* Overall Assessment */}
              <Card className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500/20 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg shrink-0">
                      <Brain className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-display font-bold text-white mb-2">Overall Assessment</h3>
                      <p className="text-sm text-white/90 leading-relaxed">{aiAnalysis.overallAssessment}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Highlights */}
              {aiAnalysis.highlights.length > 0 && (
                <Card className="bg-card/30 border-green-500/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <h3 className="text-sm font-display font-bold text-green-400 uppercase tracking-wide">What You Did Well</h3>
                    </div>
                    <ul className="space-y-2">
                      {aiAnalysis.highlights.map((highlight, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                          <span className="text-green-400 shrink-0 mt-1">•</span>
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Struggles */}
              {aiAnalysis.struggles.length > 0 && (
                <Card className="bg-card/30 border-yellow-500/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-4 h-4 text-yellow-400" />
                      <h3 className="text-sm font-display font-bold text-yellow-400 uppercase tracking-wide">Areas to Improve</h3>
                    </div>
                    <ul className="space-y-2">
                      {aiAnalysis.struggles.map((struggle, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                          <span className="text-yellow-400 shrink-0 mt-1">•</span>
                          {struggle}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Weather Impact */}
              {aiAnalysis.weatherImpact && (
                <Card className="bg-card/30 border-cyan-500/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Cloud className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-sm font-display font-bold text-cyan-400 uppercase tracking-wide">Weather Impact</h3>
                    </div>
                    <p className="text-sm text-white/80">{aiAnalysis.weatherImpact}</p>
                  </CardContent>
                </Card>
              )}

              {/* Warm-Up Analysis */}
              {aiAnalysis.warmUpAnalysis && (
                <Card className="bg-card/30 border-rose-500/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Heart className="w-4 h-4 text-rose-400" />
                      <h3 className="text-sm font-display font-bold text-rose-400 uppercase tracking-wide">Warm-Up Analysis</h3>
                    </div>
                    <p className="text-sm text-white/80">{aiAnalysis.warmUpAnalysis}</p>
                  </CardContent>
                </Card>
              )}

              {/* Goal Progress */}
              {aiAnalysis.goalProgress && (
                <Card className="bg-card/30 border-violet-500/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-4 h-4 text-violet-400" />
                      <h3 className="text-sm font-display font-bold text-violet-400 uppercase tracking-wide">Goal Progress</h3>
                    </div>
                    <p className="text-sm text-white/80">{aiAnalysis.goalProgress}</p>
                  </CardContent>
                </Card>
              )}

              {/* Target Time Analysis */}
              {aiAnalysis.targetTimeAnalysis && (
                <Card className="bg-card/30 border-amber-500/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Timer className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-display font-bold text-amber-400 uppercase tracking-wide">Target Time</h3>
                    </div>
                    <p className="text-sm text-white/80">{aiAnalysis.targetTimeAnalysis}</p>
                  </CardContent>
                </Card>
              )}

              {/* Personal Bests */}
              {aiAnalysis.personalBests.length > 0 && (
                <Card className="bg-card/30 border-primary/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">Achievements</h3>
                    </div>
                    <ul className="space-y-2">
                      {aiAnalysis.personalBests.map((pb, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                          <span className="text-primary shrink-0 mt-1">★</span>
                          {pb}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Demographic Comparison */}
              {aiAnalysis.demographicComparison && (
                <Card className="bg-card/30 border-blue-500/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-blue-400" />
                      <h3 className="text-sm font-display font-bold text-blue-400 uppercase tracking-wide">How You Compare</h3>
                    </div>
                    <p className="text-sm text-white/80">{aiAnalysis.demographicComparison}</p>
                  </CardContent>
                </Card>
              )}

              {/* Coaching Tips */}
              {aiAnalysis.coachingTips.length > 0 && (
                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-display font-bold text-primary uppercase tracking-wide">Coaching Tips</h3>
                    </div>
                    <ul className="space-y-3">
                      {aiAnalysis.coachingTips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-white/90 bg-white/5 rounded-lg p-3">
                          <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </section>
        )}

        {/* AI Coaching Logs Section - visible to run owner when AI coaching was enabled or to admins */}
        {(isAdmin || (run && (run as any).aiCoachEnabled !== false)) && !isFriendView && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Brain className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold uppercase tracking-wide">AI Coaching Logs</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">View coaching advice from your run</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!showCoachingLogs && coachingLogs.length === 0) {
                    fetchCoachingLogs();
                  }
                  setShowCoachingLogs(!showCoachingLogs);
                }}
                className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                data-testid="button-toggle-coaching-logs"
              >
                {isLoadingCoachingLogs ? "Loading..." : showCoachingLogs ? "Hide Logs" : "View Logs"}
              </Button>
            </div>
            
            {showCoachingLogs && (
              <Card className="bg-card/30 border-purple-500/20 backdrop-blur-sm">
                <CardContent className="p-4">
                  {coachingLogs.length === 0 ? (
                    <p className="text-sm text-white/60 text-center py-4">
                      {isLoadingCoachingLogs ? "Loading coaching logs..." : "No AI coaching interactions recorded for this run"}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-xs text-white/60 mb-2">
                        {coachingLogs.length} coaching interaction{coachingLogs.length !== 1 ? 's' : ''} • 
                        Total latency: {coachingLogs.reduce((sum, log) => sum + (log.latencyMs || 0), 0)}ms
                      </div>
                      {coachingLogs.map((log, idx) => (
                        <div key={log.id} className="border border-white/10 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-purple-400 font-mono">#{idx + 1} • {log.eventType || 'coaching'}</span>
                            <span className="text-white/40">
                              {new Date(log.createdAt).toLocaleTimeString()}{log.latencyMs ? ` • ${log.latencyMs}ms` : ''}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                            <div>Distance: {log.distanceKm?.toFixed(2) || '-'} km</div>
                            <div>Duration: {log.elapsedSeconds ? Math.floor(log.elapsedSeconds / 60) + ':' + String(Math.floor(log.elapsedSeconds % 60)).padStart(2, '0') : '-'}</div>
                            {log.currentPace && <div>Pace: {log.currentPace} /km</div>}
                            {log.cadence && <div>Cadence: {log.cadence} spm</div>}
                          </div>
                          {(log.terrain || log.weather) ? (
                            <div className="flex gap-2 text-xs flex-wrap">
                              {log.terrain ? (
                                <Badge variant="outline" className="text-orange-400 border-orange-400/30">
                                  Grade: {(log.terrain as { grade?: number })?.grade?.toFixed(1) || '-'}%
                                </Badge>
                              ) : null}
                              {log.weather ? (
                                <Badge variant="outline" className="text-blue-400 border-blue-400/30">
                                  {(log.weather as { temperature?: number })?.temperature ? `${Math.round((log.weather as { temperature?: number }).temperature!)}°C` : ''} {(log.weather as { condition?: string })?.condition || ''}
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                          {log.topic && (
                            <div className="text-xs text-purple-300">
                              Topic: {log.topic}
                            </div>
                          )}
                          {log.prompt && (
                            <div className="bg-white/5 rounded p-2 text-xs">
                              <div className="text-purple-300 font-medium mb-1">Your question:</div>
                              <div className="text-white/70">{log.prompt}</div>
                            </div>
                          )}
                          <div className="bg-primary/5 rounded p-2 text-xs">
                            <div className="text-primary font-medium mb-1">Coach:</div>
                            <div className="text-white/80">{log.responseText || '-'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* Weather Conditions */}
        {(run as any).weatherData && (
          <Card className="bg-gradient-to-br from-blue-900/30 to-gray-900/30 border-blue-500/20 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  {((run as any).weatherData.condition || '').toLowerCase().includes('rain') ? (
                    <CloudRain className="w-5 h-5 text-blue-400" />
                  ) : ((run as any).weatherData.condition || '').toLowerCase().includes('cloud') ? (
                    <Cloud className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Sun className="w-5 h-5 text-yellow-400" />
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Weather During Run</div>
                  <div className="text-lg font-display font-bold text-white">
                    {typeof (run as any).weatherData.temperature === 'number' && !isNaN((run as any).weatherData.temperature) 
                      ? `${Math.round((run as any).weatherData.temperature)}°C` 
                      : '-'} • {(run as any).weatherData.condition || '-'}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/10">
                <div className="text-center">
                  <ThermometerSun className="w-4 h-4 mx-auto text-orange-400 mb-1" />
                  <div className="text-[10px] text-muted-foreground">Feels</div>
                  <div className="text-sm text-white font-medium">
                    {typeof (run as any).weatherData.feelsLike === 'number' && !isNaN((run as any).weatherData.feelsLike) 
                      ? `${Math.round((run as any).weatherData.feelsLike)}°` 
                      : '-'}
                  </div>
                </div>
                <div className="text-center">
                  <Wind className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                  <div className="text-[10px] text-muted-foreground">Wind</div>
                  <div className="text-sm text-white font-medium">
                    {typeof (run as any).weatherData.windSpeed === 'number' && !isNaN((run as any).weatherData.windSpeed) 
                      ? `${Math.round((run as any).weatherData.windSpeed)} km/h` 
                      : '-'}
                  </div>
                </div>
                <div className="text-center">
                  <Droplets className="w-4 h-4 mx-auto text-blue-400 mb-1" />
                  <div className="text-[10px] text-muted-foreground">Humidity</div>
                  <div className="text-sm text-white font-medium">
                    {typeof (run as any).weatherData.humidity === 'number' && !isNaN((run as any).weatherData.humidity) 
                      ? `${(run as any).weatherData.humidity}%` 
                      : '-'}
                  </div>
                </div>
                <div className="text-center">
                  <CloudRain className="w-4 h-4 mx-auto text-blue-300 mb-1" />
                  <div className="text-[10px] text-muted-foreground">Rain</div>
                  <div className="text-sm text-white font-medium">
                    {typeof (run as any).weatherData.precipitationProbability === 'number' && !isNaN((run as any).weatherData.precipitationProbability) 
                      ? `${(run as any).weatherData.precipitationProbability}%` 
                      : '0%'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pace Gradient Map Section - Garmin Style */}
        {hasGpsTrack && paceGradientSegments.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Map className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold uppercase tracking-wide">Route Pace</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Speed variation across your run</p>
              </div>
            </div>
            
            <Card className="bg-card/30 border-white/5 p-0 overflow-hidden relative">
              <div className="h-72 w-full">
                <MapContainer
                  center={[gpsTrack[0]?.lat || 0, gpsTrack[0]?.lng || 0]}
                  zoom={15}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  />
                  {paceGradientSegments.map((segment, idx) => (
                    <Polyline
                      key={idx}
                      positions={segment.positions}
                      color={segment.color}
                      weight={5}
                      opacity={0.95}
                    />
                  ))}
                  {/* Start marker - green */}
                  {gpsTrack.length > 0 && (
                    <CircleMarker
                      center={[gpsTrack[0].lat, gpsTrack[0].lng]}
                      radius={10}
                      fillColor="#22c55e"
                      fillOpacity={1}
                      color="#ffffff"
                      weight={3}
                    />
                  )}
                  {/* Finish marker - red checkered */}
                  {gpsTrack.length > 1 && (
                    <CircleMarker
                      center={[gpsTrack[gpsTrack.length - 1].lat, gpsTrack[gpsTrack.length - 1].lng]}
                      radius={10}
                      fillColor="#ef4444"
                      fillOpacity={1}
                      color="#ffffff"
                      weight={3}
                    />
                  )}
                  <FitBoundsToTrack positions={gpsTrack.map((p: any) => [p.lat, p.lng] as [number, number])} />
                </MapContainer>
              </div>
              
              {/* Garmin-style horizontal gradient legend */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 shadow-lg">
                <span className="text-xs font-medium text-gray-600">Slower</span>
                <div 
                  className="w-32 h-3 rounded-full"
                  style={{
                    background: 'linear-gradient(to right, #3b82f6, #22c55e, #eab308, #f97316, #ef4444)'
                  }}
                />
                <span className="text-xs font-medium text-gray-600">Faster</span>
              </div>
            </Card>
          </section>
        )}

        {/* Performance Charts Section - Collapsible */}
        {run && telemetryData && telemetryData.dataPoints && telemetryData.dataPoints.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-display font-bold uppercase tracking-wide flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Performance Charts
            </h2>
            
            {/* Pace Chart */}
            <TelemetryChartSection
              metric="pace"
              icon={<Activity className="w-5 h-5 text-blue-400" />}
              dataPoints={telemetryData.dataPoints}
              stats={telemetryData.paceStats ? {
                avg: telemetryData.paceStats.avg,
                min: telemetryData.paceStats.min,
                max: telemetryData.paceStats.min  // Best pace is min for pace
              } : undefined}
              defaultOpen={true}
              totalDistance={telemetryData.distance || run.distance || 1}
              totalDuration={telemetryData.duration || run.totalTime || 600}
            />
            
            {/* Heart Rate Chart */}
            {telemetryData.dataPoints.some(p => p.heartRate !== undefined) && (
              <TelemetryChartSection
                metric="heartRate"
                icon={<Heart className="w-5 h-5 text-red-500" />}
                dataPoints={telemetryData.dataPoints}
                stats={run.avgHeartRate ? {
                  avg: run.avgHeartRate,
                  max: run.maxHeartRate
                } : undefined}
                defaultOpen={false}
                totalDistance={telemetryData.distance || run.distance || 1}
                totalDuration={telemetryData.duration || run.totalTime || 600}
              />
            )}
            
            {/* Elevation Chart */}
            {telemetryData.dataPoints.some(p => p.elevation !== undefined) && (
              <TelemetryChartSection
                metric="elevation"
                icon={<TrendingUp className="w-5 h-5 text-green-500" />}
                dataPoints={telemetryData.dataPoints}
                stats={telemetryData.elevationProfile ? {
                  min: 0,  // We'll show gain instead
                  max: telemetryData.elevationProfile.totalGain,
                  avg: telemetryData.elevationProfile.totalGain
                } : undefined}
                defaultOpen={false}
                totalDistance={telemetryData.distance || run.distance || 1}
                totalDuration={telemetryData.duration || run.totalTime || 600}
              />
            )}
            
            {/* Cadence Chart */}
            {telemetryData.dataPoints.some(p => p.cadence !== undefined) && (
              <TelemetryChartSection
                metric="cadence"
                icon={<Footprints className="w-5 h-5 text-yellow-500" />}
                dataPoints={telemetryData.dataPoints}
                stats={telemetryData.cadenceStats}
                defaultOpen={false}
                totalDistance={telemetryData.distance || run.distance || 1}
                totalDuration={telemetryData.duration || run.totalTime || 600}
              />
            )}
          </section>
        )}

        {/* Km Splits Section */}
        {kmSplits.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Activity className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold uppercase tracking-wide">Km Splits</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Pace per kilometer</p>
                </div>
              </div>
            </div>
            
            <Card className="bg-card/30 border-white/5 p-4 overflow-hidden">
              <div className="space-y-3">
                {kmSplits.map((split: any, idx: number) => {
                  const avgPaceSeconds = run.avgPace ? 
                    parseInt(run.avgPace.split(':')[0]) * 60 + parseInt(run.avgPace.split(':')[1]) : 0;
                  const splitPaceSeconds = split.paceSeconds || 0;
                  const isFaster = splitPaceSeconds < avgPaceSeconds;
                  const isSlower = splitPaceSeconds > avgPaceSeconds + 15;
                  
                  return (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">{idx + 1}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">Kilometer {idx + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${isFaster ? 'text-green-500' : isSlower ? 'text-red-400' : 'text-primary'}`}>
                          {formatPace(split.pace)}
                        </span>
                        <span className="text-xs text-muted-foreground">/km</span>
                        {isFaster && <TrendingUp className="w-4 h-4 text-green-500" />}
                        {isSlower && <TrendingUp className="w-4 h-4 text-red-400 rotate-180" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>
        )}

        {/* Runner Struggle Analysis Section - Hidden for friend views */}
        {!isFriendView && weaknessEvents.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold uppercase tracking-wide">Runner Struggle Analysis</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Moments where you slowed down</p>
                </div>
              </div>
            </div>
            
            <Card className="bg-card/30 border-white/5 p-4 overflow-hidden">
              <div className="space-y-4">
                {weaknessEvents.map((event, idx) => {
                  const isEditing = editingWeaknessId === event.id;
                  const paceBeforeMins = Math.floor(event.avgPaceBefore / 60);
                  const paceBeforeSecs = Math.floor(event.avgPaceBefore % 60);
                  const paceDuringMins = Math.floor(event.avgPaceDuring / 60);
                  const paceDuringSecs = Math.floor(event.avgPaceDuring % 60);
                  
                  const causeTags = [
                    { value: "hill", label: "Hill" },
                    { value: "fatigue", label: "Fatigue" },
                    { value: "breathing", label: "Breathing" },
                    { value: "heat", label: "Heat" },
                    { value: "cold", label: "Cold" },
                    { value: "hydration", label: "Hydration" },
                    { value: "nutrition", label: "Nutrition" },
                    { value: "injury", label: "Injury/Pain" },
                    { value: "headache", label: "Headache" },
                    { value: "vision", label: "Vision went blurry" },
                    { value: "chest", label: "Chest pain" },
                    { value: "mental", label: "Mental" },
                    { value: "other", label: "Other" },
                  ];
                  
                  return (
                    <div key={event.id} className="py-3 border-b border-white/5 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-orange-500">{idx + 1}</span>
                          </div>
                          <div>
                            <span className="text-sm font-medium">
                              {event.startDistanceKm.toFixed(1)} - {event.endDistanceKm.toFixed(1)} km
                            </span>
                            <p className="text-[10px] text-muted-foreground">
                              {Math.floor(event.durationSeconds / 60)}:{(event.durationSeconds % 60).toString().padStart(2, '0')} duration
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">
                              {paceBeforeMins}:{paceBeforeSecs.toString().padStart(2, '0')}
                            </span>
                            <span className="text-xs text-muted-foreground">→</span>
                            <span className="text-sm text-red-400 font-medium">
                              {paceDuringMins}:{paceDuringSecs.toString().padStart(2, '0')}
                            </span>
                            <span className="text-xs text-muted-foreground">/km</span>
                          </div>
                          <Badge className="bg-red-500/20 text-red-400 text-[9px]">
                            {Math.round(event.dropPercent)}% slower
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Annotation section */}
                      {isEditing ? (
                        <div className="mt-3 space-y-3 bg-white/5 rounded-lg p-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">What caused this slowdown?</p>
                            <div className="flex flex-wrap gap-2">
                              {causeTags.map(tag => (
                                <button
                                  key={tag.value}
                                  onClick={() => setEditingCauseTag(tag.value)}
                                  className={`px-3 py-1 rounded-full text-xs transition-colors ${
                                    editingCauseTag === tag.value
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-white/10 text-muted-foreground hover:bg-white/20'
                                  }`}
                                >
                                  {tag.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <Input
                              placeholder="Add a note (optional)..."
                              value={editingCauseNote}
                              onChange={(e) => setEditingCauseNote(e.target.value)}
                              className="bg-white/5 border-white/10 text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveWeaknessAnnotation(event.id)}
                              className="flex-1"
                            >
                              <Check className="w-4 h-4 mr-1" /> Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingWeaknessId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center justify-between">
                          {event.causeTag ? (
                            <div className="flex items-center gap-2">
                              <Badge className="bg-orange-500/20 text-orange-400">
                                {causeTags.find(t => t.value === event.causeTag)?.label || event.causeTag}
                              </Badge>
                              {event.causeNote && (
                                <span className="text-xs text-muted-foreground italic">
                                  "{event.causeNote}"
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              No cause recorded
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditingWeakness(event)}
                            className="h-7 px-2"
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            {event.causeTag ? 'Edit' : 'Annotate'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-xs text-muted-foreground text-center">
                  <Lightbulb className="w-3 h-3 inline mr-1" />
                  Annotating your struggles helps the AI coach give you better advice in future runs
                </p>
              </div>
            </Card>
          </section>
        )}

        {/* Zone Breakdown & Metrics */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* HR Zones - Only show if we have heart rate data */}
          {hasHeartRateData ? (
            <div className="space-y-4">
              <h3 className="text-xs font-display font-bold uppercase tracking-widest flex items-center gap-2">
                <Info className="w-3 h-3 text-primary" /> Heart Rate Zone Breakdown
              </h3>
              <div className="space-y-3">
                {hrZones.map((zone) => (
                  <div key={zone.name} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground font-medium">{zone.name} <span className="text-[9px] opacity-40 px-1">•</span> {zone.label}</span>
                      <span className="text-primary font-bold">{zone.value}%</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${zone.value}%` }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: zone.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xs font-display font-bold uppercase tracking-widest flex items-center gap-2 text-muted-foreground/50">
                <Info className="w-3 h-3" /> Heart Rate Zone Breakdown
              </h3>
              <div className="space-y-3 opacity-30">
                {hrZones.map((zone) => (
                  <div key={zone.name} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground font-medium">{zone.name} <span className="text-[9px] opacity-40 px-1">•</span> {zone.label}</span>
                      <span className="text-muted-foreground">--%</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-muted/20 w-0" />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/50 italic">No heart rate data recorded</p>
            </div>
          )}

          {/* Additional Stats */}
          <div className="space-y-4">
            <h3 className="text-xs font-display font-bold uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3 h-3 text-primary" /> Technical Metrics
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <CadenceIcon className="w-4 h-4 text-orange-400" />
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Cadence</div>
                </div>
                <div className="flex items-baseline gap-1">
                  {(() => {
                    const avgCadence = (run as any).avgCadence;
                    const cadenceValue = isNaN(avgCadence) || avgCadence === undefined ? null : Math.round(avgCadence);
                    const isInIdealRange = cadenceAnalysis && cadenceValue && 
                      cadenceValue >= cadenceAnalysis.idealCadenceMin && 
                      cadenceValue <= cadenceAnalysis.idealCadenceMax;
                    return (
                      <span className={`text-3xl font-display font-bold ${
                        isInIdealRange ? 'text-green-400' : cadenceValue ? 'text-yellow-400' : 'text-primary'
                      }`}>
                        {cadenceValue ?? '-'}
                      </span>
                    );
                  })()}
                  <span className="text-[10px] text-muted-foreground uppercase">spm</span>
                </div>
                {isLoadingCadenceAnalysis ? (
                  <p className="text-[9px] text-muted-foreground mt-2 leading-tight animate-pulse">Analyzing your cadence...</p>
                ) : cadenceAnalysis ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-[9px] text-muted-foreground leading-tight">
                      Ideal range: <span className="text-primary font-medium">{cadenceAnalysis.idealCadenceMin}-{cadenceAnalysis.idealCadenceMax} spm</span>
                    </p>
                    <p className="text-[9px] text-muted-foreground leading-tight">{cadenceAnalysis.strideAssessment}</p>
                  </div>
                ) : (
                  <p className="text-[9px] text-muted-foreground mt-2 leading-tight">Average steps per minute throughout the session.</p>
                )}
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Pace</div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-display font-bold text-primary">{formatPace(run.avgPace)}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">/km</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-2 leading-tight">Average pace throughout the session.</p>
              </div>
            </div>
          </div>

          {/* AI Cadence Coach Advice */}
          {cadenceAnalysis && cadenceAnalysis.coachingAdvice && (
            <div className="space-y-4">
              <h3 className="text-xs font-display font-bold uppercase tracking-widest flex items-center gap-2">
                <CadenceIcon className="w-3 h-3 text-orange-400" /> AI Cadence Coach
              </h3>
              <div className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 rounded-2xl p-4 border border-orange-500/20">
                <p className="text-sm text-foreground/90 leading-relaxed">{cadenceAnalysis.coachingAdvice}</p>
              </div>
            </div>
          )}

          {/* Route Rating */}
          {(run as any).routeName && (
            <div className="space-y-4">
              <h3 className="text-xs font-display font-bold uppercase tracking-widest flex items-center gap-2">
                <Star className="w-3 h-3 text-primary" /> Rate This Route
              </h3>
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-5 border border-primary/20">
                {ratingSubmitted ? (
                  <div className="text-center space-y-2">
                    <div className="flex justify-center gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                        <Star
                          key={star}
                          className={`w-5 h-5 ${
                            star <= (routeRating || 0) 
                              ? "text-yellow-400 fill-yellow-400" 
                              : "text-gray-600"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      You rated this route <span className="text-primary font-bold">{routeRating}/10</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Your feedback helps improve future route suggestions!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-center text-muted-foreground">
                      How was the <span className="text-primary font-semibold">{(run as any).routeName?.split(' - ')[1] || 'route'}</span>?
                    </p>
                    <div className="flex justify-center gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                        <button
                          key={star}
                          onClick={() => submitRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          className="p-1 transition-transform hover:scale-110"
                          data-testid={`button-rate-${star}`}
                        >
                          <Star
                            className={`w-6 h-6 transition-colors ${
                              star <= (hoverRating || routeRating || 0)
                                ? "text-yellow-400 fill-yellow-400"
                                : "text-gray-600 hover:text-yellow-400/50"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground px-2">
                      <span>Terrible</span>
                      <span>Perfect</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Run Again & Save Route Actions - only show for own runs */}
          {!isFriendView && (
            <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
              <div className="flex gap-3">
                <Button
                  variant="default"
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleRunAgain}
                  data-testid="button-run-again"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Run Again
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={handleSaveAsRoute}
                  disabled={isSavingRoute}
                  data-testid="button-save-route"
                >
                  <Route className="w-4 h-4 mr-2" />
                  {isSavingRoute ? "Saving..." : "Save Route"}
                </Button>
              </div>
              
              {/* Create Event button - admin only */}
              {isAdmin && (
                <Button
                  variant="outline"
                  className="w-full border-green-500/30 text-green-400 hover:bg-green-500/10"
                  onClick={() => setShowCreateEventModal(true)}
                  data-testid="button-create-event"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Create Event from This Run
                </Button>
              )}
              
              <p className="text-xs text-muted-foreground text-center">
                Run this route again with AI coaching or save it to your favorites
              </p>
            </div>
          )}

          {/* Delete Run Section - only show for own runs */}
          {!isFriendView && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <Button
                variant="outline"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="button-delete-run"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete This Run
              </Button>
            </div>
          )}
        </section>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this run record from your history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRun}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete Run"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Event Modal */}
      <AlertDialog open={showCreateEventModal} onOpenChange={setShowCreateEventModal}>
        <AlertDialogContent className="bg-card border-white/10 max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-green-400" />
              Create Event
            </AlertDialogTitle>
            <AlertDialogDescription>
              Create a public event from this run route. Other users can browse and run this event.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Event Name *</label>
              <Input
                value={eventForm.name}
                onChange={(e) => setEventForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Hamilton Lake Parkrun"
                className="bg-background/50"
                data-testid="input-event-name"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Country *</label>
                <Input
                  value={eventForm.country}
                  onChange={(e) => setEventForm(prev => ({ ...prev, country: e.target.value }))}
                  placeholder="e.g., New Zealand"
                  className="bg-background/50"
                  data-testid="input-event-country"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">City</label>
                <Input
                  value={eventForm.city}
                  onChange={(e) => setEventForm(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="e.g., Hamilton"
                  className="bg-background/50"
                  data-testid="input-event-city"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Event Type</label>
              <select
                value={eventForm.eventType}
                onChange={(e) => setEventForm(prev => ({ ...prev, eventType: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-white/10 bg-background/50 text-foreground"
                data-testid="select-event-type"
              >
                <option value="parkrun">Parkrun</option>
                <option value="5k">5K</option>
                <option value="10k">10K</option>
                <option value="half_marathon">Half Marathon</option>
                <option value="marathon">Marathon</option>
                <option value="trail">Trail Run</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={eventForm.description}
                onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the event..."
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-white/10 bg-background/50 text-foreground resize-none"
                data-testid="textarea-event-description"
              />
            </div>
            
            <div className="space-y-3 pt-2 border-t border-white/10">
              <label className="text-sm font-medium">Schedule</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={eventForm.scheduleType === "recurring"}
                    onChange={() => setEventForm(prev => ({ ...prev, scheduleType: "recurring" }))}
                    className="accent-primary"
                    data-testid="radio-schedule-recurring"
                  />
                  <span className="text-sm">Recurring</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={eventForm.scheduleType === "one_time"}
                    onChange={() => setEventForm(prev => ({ ...prev, scheduleType: "one_time" }))}
                    className="accent-primary"
                    data-testid="radio-schedule-onetime"
                  />
                  <span className="text-sm">One-time</span>
                </label>
              </div>
              
              {eventForm.scheduleType === "recurring" && (
                <div className="space-y-3">
                  <select
                    value={eventForm.recurrencePattern}
                    onChange={(e) => setEventForm(prev => ({ ...prev, recurrencePattern: e.target.value as any }))}
                    className="w-full h-10 px-3 rounded-md border border-white/10 bg-background/50 text-foreground"
                    data-testid="select-recurrence-pattern"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  
                  {["weekly", "fortnightly"].includes(eventForm.recurrencePattern) && (
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Day of Week</label>
                      <select
                        value={eventForm.dayOfWeek}
                        onChange={(e) => setEventForm(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
                        className="w-full h-10 px-3 rounded-md border border-white/10 bg-background/50 text-foreground"
                        data-testid="select-day-of-week"
                      >
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                      </select>
                    </div>
                  )}
                  
                  {eventForm.recurrencePattern === "monthly" && (
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Day of Month</label>
                      <select
                        value={eventForm.dayOfMonth}
                        onChange={(e) => setEventForm(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value) }))}
                        className="w-full h-10 px-3 rounded-md border border-white/10 bg-background/50 text-foreground"
                        data-testid="select-day-of-month"
                      >
                        {Array.from({ length: 31 }, (_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              
              {eventForm.scheduleType === "one_time" && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Event Date *</label>
                  <Input
                    type="date"
                    value={eventForm.specificDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, specificDate: e.target.value }))}
                    className="bg-background/50"
                    data-testid="input-event-date"
                  />
                </div>
              )}
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreatingEvent}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleCreateEvent}
              disabled={
                isCreatingEvent || 
                !eventForm.name.trim() || 
                !eventForm.country.trim() ||
                (eventForm.scheduleType === "one_time" && !eventForm.specificDate)
              }
              className="bg-green-500 hover:bg-green-600 text-white"
              data-testid="button-submit-create-event"
            >
              {isCreatingEvent ? "Creating..." : "Create Event"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
