import { useState, useEffect, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  ArrowLeft, Calendar, TrendingUp, Heart, 
  Activity, Zap as CadenceIcon, Info, Timer, MapPin, Share2, Mail, User as UserIcon, Search, Star,
  Facebook, Instagram, Download, X, Map
} from "lucide-react";
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
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
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

export default function RunInsights() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/history/:id");
  const [run, setRun] = useState<RunData | null>(null);
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
          } as any;
          setRun(mappedRun);
          if ((mappedRun as any).rating) {
            setRouteRating((mappedRun as any).rating);
            setRatingSubmitted(true);
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

  const handleShareFriend = (friend: Friend) => {
    const recipient = friend.email || friend.name;
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
    const points = Math.max(20, Math.floor(run.distance * 10));
    const baseElev = (run as any).elevationGain || (run.difficulty === "expert" ? 40 : run.difficulty === "moderate" ? 20 : 10);
    const heartRateData = (run as any).heartRateData || [];
    const baseHR = (run as any).avgHeartRate || 155;
    
    for (let i = 0; i <= points; i++) {
      const dist = (run.distance / points) * i;
      
      // Get heart rate from recorded data if available, otherwise simulate
      let hr: number;
      if (heartRateData.length > 0) {
        const hrIdx = Math.floor((i / points) * heartRateData.length);
        hr = heartRateData[Math.min(hrIdx, heartRateData.length - 1)]?.hr || baseHR;
      } else if (hasHeartRateData) {
        // We have avgHeartRate but no detailed data - simulate based on average
        hr = baseHR - 10 + Math.random() * 20;
      } else {
        hr = 0; // No heart rate data
      }
      
      data.push({
        distance: parseFloat(dist.toFixed(2)),
        elevation: baseElev + Math.sin(i / 5) * (baseElev / 2),
        hr: hr > 0 ? hr : undefined,
      });
    }
    return data;
  }, [run, hasHeartRateData]);

  // Calculate pace gradient segments from GPS track
  const paceGradientSegments = useMemo(() => {
    if (!run || !hasGpsTrack || gpsTrack.length < 2) return [];
    
    const segments: { positions: [number, number][]; color: string; pace: number }[] = [];
    
    // Calculate pace for each segment (group points for smoother visualization)
    const segmentSize = Math.max(2, Math.floor(gpsTrack.length / 20));
    
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
      
      // Color: green (fast) to yellow (medium) to red (slow)
      const normalizedPace = pace > 0 ? (pace - minPace) / paceRange : 0.5;
      const hue = 120 - (normalizedPace * 120); // 120=green, 60=yellow, 0=red
      const color = `hsl(${Math.max(0, Math.min(120, hue))}, 80%, 50%)`;
      
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
          <div>
            <h1 className="text-3xl font-display font-bold text-primary uppercase tracking-wider">Run Insights</h1>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{run.date} • {run.time}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          <Badge className="bg-primary/10 border-primary/30 text-primary text-[10px] uppercase font-bold px-3">
            {run.difficulty}
          </Badge>
        </div>
      </header>

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
                        disabled={sharedWith.includes(friend.email || friend.name)}
                        className="p-3 bg-white/5 hover:bg-primary/10 border border-white/10 hover:border-primary/50 rounded-lg text-xs font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sharedWith.includes(friend.email || friend.name) ? "✓" : "+"} {friend.name.split(" ")[0]}
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
              <div className="text-2xl font-display font-bold text-primary">{run.cadence && run.cadence > 0 ? run.cadence : '--'}</div>
              <div className="text-[10px] text-muted-foreground uppercase">spm</div>
            </CardContent>
          </Card>
        </section>

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

        {/* Pace Gradient Map Section */}
        {hasGpsTrack && paceGradientSegments.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Map className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold uppercase tracking-wide">Route Pace</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Speed variation across your run</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(120, 80%, 50%)' }} />
                  <span className="text-muted-foreground">Fast</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(60, 80%, 50%)' }} />
                  <span className="text-muted-foreground">Medium</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(0, 80%, 50%)' }} />
                  <span className="text-muted-foreground">Slow</span>
                </div>
              </div>
            </div>
            
            <Card className="bg-card/30 border-white/5 p-0 overflow-hidden">
              <div className="h-64 w-full">
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
                      weight={4}
                      opacity={0.9}
                    />
                  ))}
                  <FitBoundsToTrack positions={gpsTrack.map((p: any) => [p.lat, p.lng] as [number, number])} />
                </MapContainer>
              </div>
            </Card>
          </section>
        )}

        {/* Heart Rate Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${hasHeartRateData ? 'bg-red-500/10' : 'bg-muted/20'}`}>
                <Heart className={`w-5 h-5 ${hasHeartRateData ? 'text-red-500 fill-red-500/20' : 'text-muted-foreground/50'}`} />
              </div>
              <div>
                <h2 className={`text-lg font-display font-bold uppercase tracking-wide ${!hasHeartRateData ? 'text-muted-foreground/50' : ''}`}>Heart Rate</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {hasHeartRateData ? 'Intensity over distance' : 'No heart rate data'}
                </p>
              </div>
            </div>
            {hasHeartRateData && (
              <div className="text-right">
                <div className="text-2xl font-display font-bold text-primary">{run.avgHeartRate}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Avg BPM</div>
              </div>
            )}
          </div>
          
          {hasHeartRateData ? (
            <Card className="bg-card/30 border-white/5 p-4 overflow-hidden">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorHrFull" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                    <XAxis 
                      dataKey="distance" 
                      stroke="#ffffff40" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      type="number"
                      domain={[0, 'dataMax']}
                      ticks={Array.from({ length: Math.ceil(run.distance) + 1 }, (_, i) => i)}
                      tickFormatter={(val) => Math.round(val).toString()}
                      label={{ value: 'Distance (km)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#64748b' }}
                    />
                    <YAxis 
                      stroke="#ffffff40" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      domain={['dataMin - 10', 'dataMax + 10']}
                      tickFormatter={(val) => Math.round(val).toString()}
                      label={{ value: 'BPM', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#64748b' }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#09090b', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '12px' }}
                      labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    />
                    <Area type="monotone" dataKey="hr" stroke="#ef4444" fillOpacity={1} fill="url(#colorHrFull)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : (
            <Card className="bg-muted/10 border-white/5 p-8 text-center">
              <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No heart rate data available</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Connect a heart rate monitor or smartwatch to track your heart rate during runs</p>
            </Card>
          )}
        </section>

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

        {/* Elevation Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold uppercase tracking-wide">Elevation</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Terrain profile</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-display font-bold text-primary">{isNaN((run as any).elevationGain) || (run as any).elevationGain === undefined ? '-' : Math.round((run as any).elevationGain)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Gain (m)</div>
            </div>
          </div>

          <Card className="bg-card/30 border-white/5 p-4 overflow-hidden">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorElevFull" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                  <XAxis 
                    dataKey="distance" 
                    stroke="#ffffff40" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    type="number"
                    domain={[0, 'dataMax']}
                    ticks={Array.from({ length: Math.ceil(run.distance) + 1 }, (_, i) => i)}
                    tickFormatter={(val) => Math.round(val).toString()}
                    label={{ value: 'Distance (km)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#64748b' }}
                  />
                  <YAxis 
                    stroke="#ffffff40" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => Math.round(val).toString()}
                    label={{ value: 'Elevation (m)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '12px' }}
                    labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                  />
                  <Area type="monotone" dataKey="elevation" stroke="#22c55e" fillOpacity={1} fill="url(#colorElevFull)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

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
        </section>
      </main>
    </div>
  );
}
