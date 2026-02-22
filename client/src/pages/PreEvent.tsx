import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, Play, MapPin, TrendingUp, TrendingDown, Timer, Calendar, Flag, Brain } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

interface EventRoute {
  id: string;
  name: string;
  distance: number;
  difficulty: string;
  elevationGain?: number;
  elevationLoss?: number;
  polyline?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  startLocationLabel?: string;
  waypoints?: Array<{ lat: number; lng: number }>;
}

interface Event {
  id: string;
  name: string;
  country: string;
  city?: string;
  description?: string;
  eventType: string;
  routeId: string;
  route?: EventRoute;
  isActive: boolean;
  createdAt: string;
  scheduleType?: string;
  specificDate?: string;
  recurrencePattern?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

function MapBoundsUpdater({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [positions, map]);
  return null;
}

const eventTypeLabels: Record<string, string> = {
  parkrun: "Parkrun",
  marathon: "Marathon",
  half_marathon: "Half Marathon",
  "10k": "10K",
  "5k": "5K",
  trail: "Trail Run",
  other: "Other",
};

function getNextEventDate(event: Event): Date | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (event.scheduleType === "one_time" && event.specificDate) {
    const date = new Date(event.specificDate);
    date.setHours(0, 0, 0, 0);
    return date >= now ? date : null;
  }

  if (event.scheduleType === "recurring" || !event.scheduleType) {
    const pattern = event.recurrencePattern || "weekly";

    if (pattern === "daily") {
      return now;
    }

    if (pattern === "weekly" && event.dayOfWeek !== undefined) {
      const targetDay = event.dayOfWeek;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      return nextDate;
    }

    if (pattern === "fortnightly" && event.dayOfWeek !== undefined) {
      const createdAt = event.createdAt ? new Date(event.createdAt) : new Date();
      createdAt.setHours(0, 0, 0, 0);
      
      const targetDay = event.dayOfWeek;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      
      const nextOnTargetDay = new Date(now);
      nextOnTargetDay.setDate(now.getDate() + daysUntil);
      
      const daysSinceAnchor = Math.floor((nextOnTargetDay.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
      
      if (weeksSinceAnchor % 2 === 0) {
        return nextOnTargetDay;
      } else {
        nextOnTargetDay.setDate(nextOnTargetDay.getDate() + 7);
        return nextOnTargetDay;
      }
    }

    if (pattern === "monthly" && event.dayOfMonth !== undefined) {
      const targetDay = event.dayOfMonth;
      const currentDate = now.getDate();
      const nextDate = new Date(now);
      
      if (currentDate <= targetDay) {
        const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
        nextDate.setDate(Math.min(targetDay, lastDayOfMonth));
      } else {
        nextDate.setMonth(nextDate.getMonth() + 1);
        const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
        nextDate.setDate(Math.min(targetDay, lastDayOfMonth));
      }
      return nextDate;
    }

    if (event.dayOfWeek !== undefined) {
      const targetDay = event.dayOfWeek;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      return nextDate;
    }
  }

  return now;
}

export default function PreEvent() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/event/:id");
  const eventId = params?.id;
  
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetTimeEnabled, setTargetTimeEnabled] = useState(false);
  const [targetTime, setTargetTime] = useState({ h: 0, m: 30, s: 0 });
  const [aiCoachEnabled, setAiCoachEnabled] = useState(true);
  const [coachName, setCoachName] = useState("Your AI Coach");
  const isPremiumUser = true;
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const savedProfile = localStorage.getItem("userProfile");
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      if (parsed.coachName) setCoachName(parsed.coachName);
      if (parsed.id) setUserId(parsed.id);
    }
  }, []);

  useEffect(() => {
    const fetchEvent = async () => {
      if (!eventId) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/events/${eventId}`);
        if (!res.ok) throw new Error("Event not found");
        const data = await res.json();
        setEvent(data);
        
        if (data.route?.distance) {
          const estimatedMinutes = Math.round(data.route.distance * 6);
          setTargetTime({ h: Math.floor(estimatedMinutes / 60), m: estimatedMinutes % 60, s: 0 });
        }
      } catch (error) {
        toast.error("Failed to load event");
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

  const getRouteCoordinates = (): [number, number][] => {
    if (!event?.route) return [];
    
    if (event.route.polyline) {
      try {
        return decodePolyline(event.route.polyline);
      } catch {
        return [];
      }
    }
    
    if (event.route.waypoints && event.route.waypoints.length > 0) {
      return event.route.waypoints.map(wp => [wp.lat, wp.lng] as [number, number]);
    }
    
    return [];
  };

  const handleStartRun = () => {
    if (!event?.route) {
      toast.error("No route available for this event");
      return;
    }

    const targetSeconds = targetTimeEnabled 
      ? (targetTime.h * 3600 + targetTime.m * 60 + targetTime.s) 
      : 0;

    const params = new URLSearchParams({
      routeId: event.route.id,
      routeName: event.name,
      distance: event.route.distance.toString(),
      aiCoach: isPremiumUser && aiCoachEnabled ? "on" : "off",
      exerciseType: "running",
      eventId: event.id,
    });

    if (targetSeconds > 0) {
      params.set("targetTime", targetSeconds.toString());
    }

    localStorage.setItem("selectedEvent", JSON.stringify(event));
    localStorage.setItem("activeRoute", JSON.stringify({
      id: event.route.id,
      routeName: event.name,
      distance: event.route.distance,
      difficulty: event.route.difficulty,
      polyline: event.route.polyline,
      elevationGain: event.route.elevationGain,
      elevationLoss: event.route.elevationLoss,
      eventId: event.id,
      eventName: event.name,
    }));

    setLocation(`/run?${params.toString()}`);
  };

  const routeCoords = getRouteCoordinates();
  const startPoint = routeCoords[0];
  const endPoint = routeCoords[routeCoords.length - 1];
  const nextDate = event ? getNextEventDate(event) : null;

  const difficultyColors: Record<string, string> = {
    easy: "bg-green-500/20 text-green-400 border-green-500/30",
    beginner: "bg-green-500/20 text-green-400 border-green-500/30",
    moderate: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    challenging: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    hard: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/events")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">Event not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/events")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-display font-bold truncate" data-testid="text-event-name">{event.name}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span data-testid="text-event-location">{event.city ? `${event.city}, ` : ""}{event.country}</span>
            </div>
          </div>
          <Badge variant="outline" className="text-xs shrink-0" data-testid="badge-event-type">
            {eventTypeLabels[event.eventType] || event.eventType}
          </Badge>
        </div>
      </header>

      <main className="p-4 pb-32 space-y-4">
        {routeCoords.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl overflow-hidden border border-border/50"
          >
            <div className="h-64">
              <MapContainer
                center={startPoint || [-36.8485, 174.7633]}
                zoom={14}
                scrollWheelZoom={false}
                className="h-full w-full"
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Polyline
                  positions={routeCoords}
                  color="#3b82f6"
                  weight={4}
                  opacity={0.8}
                />
                {startPoint && (
                  <CircleMarker
                    center={startPoint}
                    radius={8}
                    fillColor="#22c55e"
                    fillOpacity={1}
                    color="#fff"
                    weight={2}
                  />
                )}
                {endPoint && startPoint !== endPoint && (
                  <CircleMarker
                    center={endPoint}
                    radius={8}
                    fillColor="#ef4444"
                    fillOpacity={1}
                    color="#fff"
                    weight={2}
                  />
                )}
                <MapBoundsUpdater positions={routeCoords} />
              </MapContainer>
            </div>
          </motion.div>
        )}

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 space-y-3">
            {nextDate && (
              <div className="flex items-center gap-2 text-primary">
                <Calendar className="w-4 h-4" />
                <span className="font-medium" data-testid="text-event-date">
                  {nextDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
                {event.scheduleType === "recurring" && event.recurrencePattern && (
                  <span className="text-xs text-muted-foreground" data-testid="text-event-recurrence">
                    ({event.recurrencePattern === "fortnightly" ? "every 2 weeks" : event.recurrencePattern})
                  </span>
                )}
              </div>
            )}

            {event.route && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold" data-testid="text-event-distance">{event.route.distance.toFixed(1)} km</span>
                </div>
                <Badge 
                  variant="outline" 
                  className={difficultyColors[event.route.difficulty] || difficultyColors.moderate}
                  data-testid="badge-event-difficulty"
                >
                  {event.route.difficulty === "beginner" ? "Easy" : 
                   event.route.difficulty === "challenging" ? "Hard" :
                   event.route.difficulty.charAt(0).toUpperCase() + event.route.difficulty.slice(1)}
                </Badge>
                {event.route.elevationGain && event.route.elevationGain > 0 && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground" data-testid="text-elevation-gain">
                    <TrendingUp className="w-3 h-3 text-green-500" />
                    +{Math.round(event.route.elevationGain)}m
                  </span>
                )}
                {event.route.elevationLoss && event.route.elevationLoss > 0 && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground" data-testid="text-elevation-loss">
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    -{Math.round(event.route.elevationLoss)}m
                  </span>
                )}
              </div>
            )}

            {event.description && (
              <p className="text-sm text-muted-foreground" data-testid="text-event-description">{event.description}</p>
            )}

            {event.route?.startLocationLabel && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span data-testid="text-start-location">Start: {event.route.startLocationLabel}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-primary" />
                <Label htmlFor="target-time" className="font-medium">Target Time</Label>
              </div>
              <Switch
                id="target-time"
                checked={targetTimeEnabled}
                onCheckedChange={setTargetTimeEnabled}
                data-testid="switch-target-time"
              />
            </div>

            {targetTimeEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center justify-center gap-2"
              >
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={targetTime.h}
                    onChange={(e) => setTargetTime(prev => ({ ...prev, h: parseInt(e.target.value) || 0 }))}
                    className="w-16 h-12 text-center text-xl font-mono bg-background border border-border rounded-lg"
                    data-testid="input-target-hours"
                  />
                  <span className="text-xs text-muted-foreground mt-1">hours</span>
                </div>
                <span className="text-2xl font-bold">:</span>
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={targetTime.m}
                    onChange={(e) => setTargetTime(prev => ({ ...prev, m: parseInt(e.target.value) || 0 }))}
                    className="w-16 h-12 text-center text-xl font-mono bg-background border border-border rounded-lg"
                    data-testid="input-target-minutes"
                  />
                  <span className="text-xs text-muted-foreground mt-1">mins</span>
                </div>
                <span className="text-2xl font-bold">:</span>
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={targetTime.s}
                    onChange={(e) => setTargetTime(prev => ({ ...prev, s: parseInt(e.target.value) || 0 }))}
                    className="w-16 h-12 text-center text-xl font-mono bg-background border border-border rounded-lg"
                    data-testid="input-target-seconds"
                  />
                  <span className="text-xs text-muted-foreground mt-1">secs</span>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {isPremiumUser && (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Brain className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <Label className="font-medium" data-testid="label-ai-coach">AI Coach</Label>
                    <p className="text-xs text-muted-foreground" data-testid="text-ai-coach-description">
                      {coachName} will guide you through the run
                    </p>
                  </div>
                </div>
                <Switch
                  checked={aiCoachEnabled}
                  onCheckedChange={setAiCoachEnabled}
                  data-testid="switch-ai-coach"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border/50">
        <Button
          onClick={handleStartRun}
          disabled={!event.route}
          className="w-full h-14 text-lg font-bold bg-gradient-to-r from-primary to-primary/80"
          data-testid="button-start-event-run"
        >
          <Play className="w-6 h-6 mr-2 fill-current" />
          Start Run
        </Button>
      </div>
    </div>
  );
}
