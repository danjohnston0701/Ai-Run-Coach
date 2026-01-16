import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Calendar, Route, ArrowRight, BarChart3, ChevronDown, ChevronUp,
  Cloud, CloudOff, RefreshCw, AlertCircle, Filter, Plus, Globe
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import WeatherImpactAnalysis from "@/components/WeatherImpactAnalysis";
import { toast } from "sonner";

type TimeFrame = "last_7_days" | "this_week" | "last_week" | "this_month" | "all_time" | "custom";

export interface RunData {
  id: string;
  name?: string;
  date: string;
  time: string;
  distance: number;
  totalTime: number;
  avgPace: string;
  difficulty: "beginner" | "moderate" | "expert";
  lat: number;
  lng: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  cadence?: number;
  dbSynced?: boolean;
  pendingSync?: boolean;
  gpsTrack?: any[];
  kmSplits?: any[];
  weatherData?: any;
  routeId?: string;
  sessionKey?: string;
  aiCoachEnabled?: boolean;
  elevationGain?: number;
  elevationLoss?: number;
  detectedWeaknesses?: any[];
}

export default function RunHistory() {
  const [, setLocation] = useLocation();
  const [runs, setRuns] = useState<RunData[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showWeatherAnalysis, setShowWeatherAnalysis] = useState(false);
  const [syncingRunId, setSyncingRunId] = useState<string | null>(null);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("last_7_days");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [showCreateEventDialog, setShowCreateEventDialog] = useState(false);
  const [selectedRunForEvent, setSelectedRunForEvent] = useState<RunData | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    name: "",
    country: "",
    city: "",
    eventType: "parkrun",
    description: "",
    scheduleType: "recurring" as "one_time" | "recurring",
    specificDate: "",
    recurrencePattern: "weekly" as "daily" | "weekly" | "fortnightly" | "monthly",
    dayOfWeek: 6, // Saturday by default
    dayOfMonth: 1,
  });

  const parseRunDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return null;
  };

  const filteredRuns = useMemo(() => {
    if (timeFrame === "all_time") return runs;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    let startDate: Date;
    let endDate: Date;
    
    switch (timeFrame) {
      case "last_7_days": {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 6);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case "this_week": {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - mondayOffset);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case "last_week": {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - mondayOffset - 7);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case "this_month": {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
      case "custom": {
        if (!customStartDate || !customEndDate) return runs;
        startDate = new Date(customStartDate);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      default:
        return runs;
    }
    
    return runs.filter(run => {
      const runDate = parseRunDate(run.date);
      if (!runDate) return false;
      return runDate >= startDate && runDate <= endDate;
    });
  }, [runs, timeFrame, customStartDate, customEndDate]);

  const syncRunToCloud = async (run: RunData, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!userId) {
      toast.error("Please log in to sync runs");
      return;
    }
    
    setSyncingRunId(run.id);
    const oldRunId = run.id;
    
    // Helper function for retry with exponential backoff
    const saveWithRetry = async (dbRunData: any, maxRetries: number = 3): Promise<{ success: boolean; savedRun?: any; error?: string }> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[ManualSync] Attempt ${attempt}/${maxRetries}`);
          const response = await fetch('/api/runs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dbRunData)
          });
          
          if (response.ok) {
            const savedRun = await response.json();
            return { success: true, savedRun };
          } else {
            const errorText = await response.text();
            console.error(`[ManualSync] Attempt ${attempt} failed. Status: ${response.status}. Body:`, errorText);
            // Return error immediately for any non-2xx response to show detailed error
            return { success: false, error: `Status ${response.status}: ${errorText}` };
          }
        } catch (err) {
          console.error(`[ManualSync] Attempt ${attempt} network error:`, err);
        }
        
        if (attempt < maxRetries) {
          const waitMs = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
      return { success: false, error: 'All retry attempts failed' };
    };
    
    try {
      // Get the full local run data from localStorage for complete field access
      const runHistoryStr = localStorage.getItem("runHistory");
      const localRuns = runHistoryStr ? JSON.parse(runHistoryStr) : [];
      const fullLocalRun = localRuns.find((r: any) => r.id === run.id) || run;
      
      // Validate and sanitize fields to ensure database compatibility
      const validDistance = typeof fullLocalRun.distance === 'number' && !isNaN(fullLocalRun.distance) ? fullLocalRun.distance : 0;
      const validDuration = typeof fullLocalRun.totalTime === 'number' && !isNaN(fullLocalRun.totalTime) ? Math.floor(fullLocalRun.totalTime) : 0;
      const validStartLat = typeof fullLocalRun.lat === 'number' && !isNaN(fullLocalRun.lat) ? fullLocalRun.lat : undefined;
      const validStartLng = typeof fullLocalRun.lng === 'number' && !isNaN(fullLocalRun.lng) ? fullLocalRun.lng : undefined;
      const validCadence = (fullLocalRun.avgCadence || fullLocalRun.cadence);
      
      // Try to create route record if local run has route data
      let validRouteId: string | undefined = undefined;
      const hasRouteData = fullLocalRun.routePolyline || fullLocalRun.turnInstructions || 
                           (fullLocalRun.routeWaypoints && fullLocalRun.routeWaypoints.length > 0);
      
      if (hasRouteData) {
        try {
          console.log('[ManualSync] Creating route record for local run');
          const routeData = {
            userId,
            name: fullLocalRun.routeName || `Run on ${fullLocalRun.date}`,
            distance: validDistance,
            difficulty: fullLocalRun.difficulty || 'moderate',
            startLat: validStartLat,
            startLng: validStartLng,
            waypoints: fullLocalRun.routeWaypoints || [],
            polyline: fullLocalRun.routePolyline || '',
            elevationGain: fullLocalRun.elevationGain,
            elevationLoss: fullLocalRun.elevationLoss,
            elevationProfile: fullLocalRun.elevationProfile,
            turnInstructions: fullLocalRun.turnInstructions,
            source: 'synced_run',
            sourceRunId: run.id,
          };
          
          const routeResponse = await fetch('/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeData)
          });
          
          if (routeResponse.ok) {
            const savedRoute = await routeResponse.json();
            validRouteId = savedRoute.id;
            console.log('[ManualSync] Route created with ID:', validRouteId);
          } else {
            console.warn('[ManualSync] Failed to create route, proceeding without it');
          }
        } catch (routeErr) {
          console.warn('[ManualSync] Route creation error, proceeding without it:', routeErr);
        }
      }
      
      // Build complete payload matching saveRunData - use fullLocalRun for original field names
      const dbRunData = {
        userId,
        routeId: validRouteId,
        eventId: fullLocalRun.eventId || undefined,
        distance: validDistance,
        duration: validDuration,
        runDate: fullLocalRun.date,
        runTime: fullLocalRun.time,
        avgPace: fullLocalRun.avgPace,
        cadence: validCadence && validCadence > 0 ? validCadence : undefined,
        elevation: fullLocalRun.elevationGain || undefined,
        elevationGain: fullLocalRun.elevationGain || undefined,
        elevationLoss: fullLocalRun.elevationLoss || undefined,
        difficulty: fullLocalRun.difficulty || 'moderate',
        startLat: validStartLat,
        startLng: validStartLng,
        gpsTrack: fullLocalRun.gpsTrack || [],
        paceData: fullLocalRun.kmSplits || [],
        weatherData: fullLocalRun.weatherData || undefined,
        sessionKey: fullLocalRun.sessionKey || undefined,
        aiCoachEnabled: fullLocalRun.aiCoachEnabled ?? false,
      };
      
      console.log('[ManualSync] dbRunData:', JSON.stringify({
        userId: dbRunData.userId,
        distance: dbRunData.distance,
        duration: dbRunData.duration,
        routeId: dbRunData.routeId,
        difficulty: dbRunData.difficulty
      }));
      
      // Get weakness events from local run
      const detectedWeaknesses = fullLocalRun.detectedWeaknesses || [];
      const sessionKey = fullLocalRun.sessionKey;
      
      const result = await saveWithRetry(dbRunData, 3);
      
      if (result.success && result.savedRun) {
        // Save detected weakness events if any
        if (detectedWeaknesses.length > 0) {
          try {
            console.log('[ManualSync] Saving', detectedWeaknesses.length, 'weakness events');
            await fetch(`/api/runs/${result.savedRun.id}/weakness-events/bulk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ events: detectedWeaknesses })
            });
          } catch (err) {
            console.error('[ManualSync] Failed to save weakness events:', err);
          }
        }
        
        // Link coaching logs to this run if sessionKey exists
        if (sessionKey) {
          try {
            console.log('[ManualSync] Linking coaching logs to run:', result.savedRun.id);
            await fetch('/api/coaching-logs/link-to-run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionKey: sessionKey,
                runId: result.savedRun.id,
                userId
              })
            });
          } catch (err) {
            console.error('[ManualSync] Failed to link coaching logs:', err);
          }
        }
        
        toast.success("Run synced to cloud!");
        
        // Update localStorage: remove old entry and add synced version
        const runHistory = localStorage.getItem("runHistory");
        if (runHistory) {
          const localRuns = JSON.parse(runHistory);
          const updatedRuns = localRuns.filter((r: any) => r.id !== oldRunId);
          // Add the synced version with new ID
          updatedRuns.push({
            ...run,
            id: result.savedRun.id,
            dbSynced: true,
            pendingSync: false,
          });
          localStorage.setItem("runHistory", JSON.stringify(updatedRuns));
        }
        
        // Reload runs from both DB and localStorage to ensure consistency
        setLoading(true);
        const response = await fetch(`/api/users/${userId}/runs`);
        if (response.ok) {
          const dbRuns = await response.json();
          const formattedDbRuns = dbRuns.map((dbRun: any) => ({
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
            dbSynced: true,
            gpsTrack: dbRun.gpsTrack,
            kmSplits: dbRun.paceData,
            weatherData: dbRun.weatherData,
            routeId: dbRun.routeId,
          }));
          
          // Get remaining unsynced local runs
          const localRunsStr = localStorage.getItem("runHistory");
          const localRuns = localRunsStr ? JSON.parse(localRunsStr) : [];
          const dbRunIds = new Set(formattedDbRuns.map((r: any) => r.id));
          const unsyncedLocalRuns = localRuns.filter((r: any) => 
            !dbRunIds.has(r.id) && !r.dbSynced
          );
          
          const allRuns = [...formattedDbRuns, ...unsyncedLocalRuns].sort((a, b) => {
            const dateA = a.date ? new Date(a.date.split('/').reverse().join('-')).getTime() : 0;
            const dateB = b.date ? new Date(b.date.split('/').reverse().join('-')).getTime() : 0;
            return dateB - dateA;
          });
          setRuns(allRuns);
        }
        setLoading(false);
      } else {
        console.error("[ManualSync] Sync failed after retries. Error:", result.error);
        // Show more detailed error message to help debug
        const errorMsg = result.error?.substring(0, 100) || "Unknown error";
        toast.error(`Sync failed: ${errorMsg}`);
      }
    } catch (err) {
      console.error("Sync error:", err);
      toast.error("Network error - please try again");
    } finally {
      setSyncingRunId(null);
    }
  };

  useEffect(() => {
    const loadRuns = async () => {
      setLoading(true);
      let dbRuns: RunData[] = [];
      let localRuns: RunData[] = [];
      
      // Try to load from database if user is logged in
      const userProfileStr = localStorage.getItem("userProfile");
      if (userProfileStr) {
        try {
          const userProfile = JSON.parse(userProfileStr);
          if (userProfile.id) {
            setUserId(userProfile.id);
            setIsAdmin(!!userProfile.isAdmin);
            const response = await fetch(`/api/users/${userProfile.id}/runs`);
            if (response.ok) {
              const data = await response.json();
              dbRuns = data.map((run: any) => ({
                id: run.id,
                name: run.name,
                date: run.completedAt ? new Date(run.completedAt).toLocaleDateString('en-GB') : '',
                time: run.completedAt ? new Date(run.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
                distance: run.distance,
                totalTime: run.duration,
                avgPace: run.avgPace || '',
                difficulty: run.difficulty || 'beginner',
                lat: run.startLat || 0,
                lng: run.startLng || 0,
                avgHeartRate: run.avgHeartRate,
                maxHeartRate: run.maxHeartRate,
                calories: run.calories,
                cadence: run.cadence,
                gpsTrack: run.gpsTrack,
                kmSplits: run.paceData,
                weatherData: run.weatherData,
                routeName: undefined,
                routeId: run.routeId,
              }));
            }
          }
        } catch (err) {
          console.warn('Failed to load runs from database:', err);
        }
      }
      
      // Load from localStorage as fallback/supplement
      const runHistory = localStorage.getItem("runHistory");
      if (runHistory) {
        localRuns = JSON.parse(runHistory);
      }
      
      // Merge runs - database runs take priority, include unsynced local runs
      // If DB is available, use DB runs + any unsynced local runs
      // If DB is unavailable, fallback to all local runs
      let finalRuns: RunData[];
      
      if (dbRuns.length > 0) {
        const dbRunIds = new Set(dbRuns.map(r => r.id));
        const unsyncedLocalRuns = localRuns.filter((r: any) => 
          !dbRunIds.has(r.id) && !r.dbSynced
        );
        finalRuns = [...dbRuns, ...unsyncedLocalRuns];
      } else {
        // Offline or no DB runs - use all local runs
        finalRuns = localRuns;
      }
      
      setRuns(finalRuns.sort((a: RunData, b: RunData) => {
        const dateA = a.date ? new Date(a.date.split('/').reverse().join('-')).getTime() : 0;
        const dateB = b.date ? new Date(b.date.split('/').reverse().join('-')).getTime() : 0;
        return dateB - dateA;
      }));
      setLoading(false);
    };
    
    loadRuns();
  }, []);

  const getDifficultyBadgeColor = (level: string) => {
    switch(level) {
      case "expert": return "bg-red-500/10 border-red-500/30 text-red-400";
      case "moderate": return "bg-yellow-400/10 border-yellow-400/30 text-yellow-400";
      default: return "bg-green-400/10 border-green-400/30 text-green-400";
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const totalStats = filteredRuns.length > 0 ? {
    totalRuns: filteredRuns.length,
    totalDistance: filteredRuns.reduce((sum, run) => sum + run.distance, 0),
    totalTime: filteredRuns.reduce((sum, run) => sum + run.totalTime, 0),
  } : null;

  const timeFrameLabels: Record<TimeFrame, string> = {
    last_7_days: "Last 7 Days",
    this_week: "This Week (Mon - Sun)",
    last_week: "Last Week (Mon - Sun)",
    this_month: "This Month",
    all_time: "All Time",
    custom: "Custom"
  };

  const handleTimeFrameChange = (value: string) => {
    const newTimeFrame = value as TimeFrame;
    setTimeFrame(newTimeFrame);
    if (newTimeFrame === "custom") {
      setShowCustomDatePicker(true);
    } else {
      setShowCustomDatePicker(false);
    }
  };

  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const openCreateEventDialog = (run: RunData, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRunForEvent(run);
    setEventForm({
      name: run.name || `Run on ${run.date}`,
      country: "",
      city: "",
      eventType: "parkrun",
      description: "",
      scheduleType: "recurring",
      specificDate: "",
      recurrencePattern: "weekly",
      dayOfWeek: 6, // Saturday
      dayOfMonth: 1,
    });
    setShowCreateEventDialog(true);
  };

  const handleCreateEvent = async () => {
    if (!selectedRunForEvent || !userId || !eventForm.name || !eventForm.country) {
      toast.error("Please fill in the required fields");
      return;
    }

    // Validate one-time event has a date
    if (eventForm.scheduleType === "one_time" && !eventForm.specificDate) {
      toast.error("Please select a date for the one-time event");
      return;
    }

    setCreatingEvent(true);
    try {
      const response = await fetch(`/api/events/from-run/${selectedRunForEvent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: eventForm.name,
          country: eventForm.country,
          city: eventForm.city,
          eventType: eventForm.eventType,
          description: eventForm.description,
          scheduleType: eventForm.scheduleType,
          specificDate: eventForm.scheduleType === "one_time" ? eventForm.specificDate : null,
          recurrencePattern: eventForm.scheduleType === "recurring" ? eventForm.recurrencePattern : null,
          dayOfWeek: eventForm.scheduleType === "recurring" && eventForm.recurrencePattern !== "monthly" && eventForm.recurrencePattern !== "daily" ? eventForm.dayOfWeek : null,
          dayOfMonth: eventForm.scheduleType === "recurring" && eventForm.recurrencePattern === "monthly" ? eventForm.dayOfMonth : null,
        }),
      });

      if (response.ok) {
        toast.success("Event created successfully!");
        setShowCreateEventDialog(false);
        setSelectedRunForEvent(null);
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to create event");
      }
    } catch (error) {
      console.error("Create event error:", error);
      toast.error("Failed to create event");
    } finally {
      setCreatingEvent(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 pb-24">
      <header className="mb-6 flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLocation("/")}
          className="rounded-full border-white/10 hover:bg-white/10"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-4xl font-display font-bold text-primary uppercase tracking-wider">Run History</h1>
          <p className="text-muted-foreground text-sm">Review your performance insights</p>
        </div>
      </header>

      <div className="mb-6 space-y-3">
        <Select value={timeFrame} onValueChange={handleTimeFrameChange}>
          <SelectTrigger 
            className="w-full bg-card/50 border-white/10 text-white"
            data-testid="select-timeframe"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              <SelectValue placeholder="Select time period" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-card border-white/10">
            <SelectItem value="last_7_days" data-testid="option-last-7-days">Last 7 Days</SelectItem>
            <SelectItem value="this_week" data-testid="option-this-week">This Week (Mon - Sun)</SelectItem>
            <SelectItem value="last_week" data-testid="option-last-week">Last Week (Mon - Sun)</SelectItem>
            <SelectItem value="this_month" data-testid="option-this-month">This Month</SelectItem>
            <SelectItem value="all_time" data-testid="option-all-time">All Time</SelectItem>
            <SelectItem value="custom" data-testid="option-custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        {showCustomDatePicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card/50 border border-white/10 rounded-lg p-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">From</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                  data-testid="input-custom-start-date"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">To</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                  data-testid="input-custom-end-date"
                />
              </div>
            </div>
            {customStartDate && customEndDate && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing runs from {formatDateForDisplay(customStartDate)} to {formatDateForDisplay(customEndDate)}
              </p>
            )}
          </motion.div>
        )}
      </div>

      {totalStats && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-4 mb-6"
          data-testid="stats-summary"
        >
          <Card className="bg-card/50 border-white/10 overflow-hidden relative group text-center p-3">
            <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Sessions</div>
            <div className="text-2xl font-display font-bold text-primary">{totalStats.totalRuns}</div>
          </Card>
          <Card className="bg-card/50 border-white/10 overflow-hidden relative group text-center p-3">
            <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Distance</div>
            <div className="text-2xl font-display font-bold text-primary">{totalStats.totalDistance.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-tighter">km</div>
          </Card>
          <Card className="bg-card/50 border-white/10 overflow-hidden relative group text-center p-3">
            <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Time</div>
            <div className="text-2xl font-display font-bold text-primary">{Math.floor(totalStats.totalTime / 3600)}h</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-tighter">Total</div>
          </Card>
        </motion.div>
      )}

      {userId && runs.length >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Button
            variant="outline"
            onClick={() => setShowWeatherAnalysis(!showWeatherAnalysis)}
            className="w-full justify-between border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-white mb-3"
            data-testid="button-toggle-weather-analysis"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span className="font-display uppercase tracking-wider text-sm">Weather Impact Analysis</span>
            </div>
            {showWeatherAnalysis ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
          
          {showWeatherAnalysis && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <WeatherImpactAnalysis userId={userId} />
            </motion.div>
          )}
        </motion.div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-muted-foreground">Loading your runs...</p>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <Route className="w-16 h-16 text-muted-foreground/30 mx-auto mb-6" />
            {runs.length > 0 && timeFrame !== "all_time" ? (
              <>
                <h2 className="text-2xl font-display font-bold text-foreground mb-3">No Runs Found</h2>
                <p className="text-muted-foreground max-w-sm mx-auto mb-8">
                  No runs recorded for {timeFrameLabels[timeFrame].toLowerCase()}. Try selecting a different time period.
                </p>
                <Button 
                  onClick={() => setTimeFrame("all_time")} 
                  className="bg-primary text-background hover:bg-primary/90"
                  data-testid="button-view-all-runs"
                >
                  View All Runs
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-display font-bold text-foreground mb-3">Ready to Track Your Progress?</h2>
                <p className="text-muted-foreground max-w-sm mx-auto mb-8">
                  No previous run history. Complete your first session to track and review your performance.
                </p>
                <Button 
                  onClick={() => setLocation("/")} 
                  className="bg-primary text-background hover:bg-primary/90"
                  data-testid="button-start-first-run"
                >
                  Start Your First Run
                </Button>
              </>
            )}
          </motion.div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRuns.map((run, index) => (
            <motion.div
              key={run.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              data-testid={`run-card-${run.id}`}
            >
              <Card 
                className={`bg-card/50 border-white/10 hover:border-primary/50 transition-all cursor-pointer overflow-hidden`}
                onClick={() => setLocation(`/history/${run.id}`)}
              >
                <CardContent className="p-0">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1">
                        {run.name && (
                          <span className="text-sm font-bold font-display uppercase tracking-wider text-primary mb-1 block">{run.name}</span>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="text-sm font-bold font-display uppercase tracking-wider">{run.date}</span>
                          {run.time && (
                            <span className="text-sm text-muted-foreground font-display">{run.time}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${getDifficultyBadgeColor(run.difficulty)} border rounded-full px-3 py-0 h-5 text-[10px] uppercase font-bold tracking-tighter`}>
                            {run.difficulty}
                          </Badge>
                          {run.dbSynced === true ? (
                            <Badge className="bg-green-500/10 border-green-500/30 text-green-400 border rounded-full px-2 py-0 h-5 text-[10px] uppercase font-bold tracking-tighter flex items-center gap-1">
                              <Cloud className="w-3 h-3" />
                              Synced
                            </Badge>
                          ) : run.pendingSync || (run.id && run.id.startsWith('run_')) ? (
                            <Badge 
                              className="bg-orange-500/10 border-orange-500/30 text-orange-400 border rounded-full px-2 py-0 h-5 text-[10px] uppercase font-bold tracking-tighter flex items-center gap-1 cursor-pointer hover:bg-orange-500/20"
                              onClick={(e) => syncRunToCloud(run, e)}
                            >
                              {syncingRunId === run.id ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Syncing...
                                </>
                              ) : (
                                <>
                                  <CloudOff className="w-3 h-3" />
                                  Local Only - Tap to Sync
                                </>
                              )}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Distance</div>
                        <div className="text-xl font-display font-bold text-primary leading-none">{run.distance.toFixed(1)} <span className="text-[10px] font-normal lowercase">km</span></div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Avg Pace</div>
                        <div className="text-xl font-display font-bold text-primary leading-none">{run.avgPace} <span className="text-[10px] font-normal lowercase">/km</span></div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Duration</div>
                        <div className="text-xl font-display font-bold text-primary leading-none">{formatTime(run.totalTime)}</div>
                      </div>
                    </div>

                    {isAdmin && run.dbSynced && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs border-primary/30 text-primary hover:bg-primary/10"
                          onClick={(e) => openCreateEventDialog(run, e)}
                          data-testid={`button-create-event-${run.id}`}
                        >
                          <Globe className="w-3 h-3 mr-2" />
                          Create Public Event
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={showCreateEventDialog} onOpenChange={setShowCreateEventDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wider">Create Public Event</DialogTitle>
            <DialogDescription>
              Create a public event from this run so other users can run the same route.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="event-name">Event Name *</Label>
              <Input
                id="event-name"
                value={eventForm.name}
                onChange={(e) => setEventForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Auckland Domain Parkrun"
                data-testid="input-event-name"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event-country">Country *</Label>
                <Input
                  id="event-country"
                  value={eventForm.country}
                  onChange={(e) => setEventForm(prev => ({ ...prev, country: e.target.value }))}
                  placeholder="e.g., New Zealand"
                  data-testid="input-event-country"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-city">City</Label>
                <Input
                  id="event-city"
                  value={eventForm.city}
                  onChange={(e) => setEventForm(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="e.g., Auckland"
                  data-testid="input-event-city"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="event-type">Event Type</Label>
              <Select
                value={eventForm.eventType}
                onValueChange={(value) => setEventForm(prev => ({ ...prev, eventType: value }))}
              >
                <SelectTrigger id="event-type" data-testid="select-event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parkrun">Park Run</SelectItem>
                  <SelectItem value="5k">5K</SelectItem>
                  <SelectItem value="10k">10K</SelectItem>
                  <SelectItem value="half_marathon">Half Marathon</SelectItem>
                  <SelectItem value="marathon">Marathon</SelectItem>
                  <SelectItem value="trail">Trail Run</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                value={eventForm.description}
                onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the event route and any important details..."
                rows={3}
                data-testid="input-event-description"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              <Label className="text-sm font-medium">Schedule</Label>
              
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={eventForm.scheduleType === "recurring"}
                    onChange={() => setEventForm(prev => ({ ...prev, scheduleType: "recurring" }))}
                    className="accent-primary"
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
                  />
                  <span className="text-sm">One-time Event</span>
                </label>
              </div>

              {eventForm.scheduleType === "one_time" && (
                <div className="space-y-2">
                  <Label htmlFor="specific-date">Event Date *</Label>
                  <Input
                    id="specific-date"
                    type="date"
                    value={eventForm.specificDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, specificDate: e.target.value }))}
                    data-testid="input-specific-date"
                  />
                </div>
              )}

              {eventForm.scheduleType === "recurring" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="recurrence-pattern">Frequency</Label>
                    <Select
                      value={eventForm.recurrencePattern}
                      onValueChange={(value: "daily" | "weekly" | "fortnightly" | "monthly") => 
                        setEventForm(prev => ({ ...prev, recurrencePattern: value }))
                      }
                    >
                      <SelectTrigger id="recurrence-pattern" data-testid="select-recurrence-pattern">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="fortnightly">Fortnightly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(eventForm.recurrencePattern === "weekly" || eventForm.recurrencePattern === "fortnightly") && (
                    <div className="space-y-2">
                      <Label htmlFor="day-of-week">Day of Week</Label>
                      <Select
                        value={String(eventForm.dayOfWeek)}
                        onValueChange={(value) => setEventForm(prev => ({ ...prev, dayOfWeek: parseInt(value) }))}
                      >
                        <SelectTrigger id="day-of-week" data-testid="select-day-of-week">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Sunday</SelectItem>
                          <SelectItem value="1">Monday</SelectItem>
                          <SelectItem value="2">Tuesday</SelectItem>
                          <SelectItem value="3">Wednesday</SelectItem>
                          <SelectItem value="4">Thursday</SelectItem>
                          <SelectItem value="5">Friday</SelectItem>
                          <SelectItem value="6">Saturday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {eventForm.recurrencePattern === "monthly" && (
                    <div className="space-y-2">
                      <Label htmlFor="day-of-month">Day of Month</Label>
                      <Select
                        value={String(eventForm.dayOfMonth)}
                        onValueChange={(value) => setEventForm(prev => ({ ...prev, dayOfMonth: parseInt(value) }))}
                      >
                        <SelectTrigger id="day-of-month" data-testid="select-day-of-month">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                            <SelectItem key={day} value={String(day)}>
                              {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateEventDialog(false)}
              data-testid="button-cancel-event"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateEvent}
              disabled={creatingEvent || !eventForm.name || !eventForm.country}
              data-testid="button-submit-event"
            >
              {creatingEvent ? "Creating..." : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

