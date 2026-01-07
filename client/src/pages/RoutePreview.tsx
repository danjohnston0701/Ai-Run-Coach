import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Loader2, RefreshCw, Route, TrendingUp, TrendingDown, Mic, MicOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import GoogleMapsRoute from "@/components/GoogleMapsRoute";

interface RouteCandidate {
  id: string;
  waypoints: Array<{ lat: number; lng: number }>;
  actualDistance: number;
  duration: number;
  polyline: string;
  routeName: string;
  difficulty: "easy" | "moderate" | "hard";
  difficultyScore: number;
  hasMajorRoads: boolean;
  uniquenessScore: number;
  deadEndCount: number;
  elevation?: {
    gain: number;
    loss: number;
    maxElevation: number;
    minElevation: number;
    maxInclinePercent?: number;
    maxInclineDegrees?: number;
    maxDeclinePercent?: number;
    maxDeclineDegrees?: number;
  };
  aiReasoning?: string;
}

export default function RoutePreview() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  
  const distance = parseFloat(params.get("distance") || "5");
  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const lat = parseFloat(latParam || "-36.1316");
  const lng = parseFloat(lngParam || "174.5755");

  const [routes, setRoutes] = useState<RouteCandidate[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("Your AI Coach");
  const [aiCoachEnabled, setAiCoachEnabled] = useState(true);

  useEffect(() => {
    const savedProfile = localStorage.getItem("userProfile");
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      if (parsed.coachName) {
        setCoachName(parsed.coachName);
      }
    }
  }, []);

  const generateRoutes = async () => {
    setLoading(true);
    setError(null);
    setSelectedRoute(null);
    
    // Get userId for personalized route suggestions
    const savedProfile = localStorage.getItem("userProfile");
    const userId = savedProfile ? JSON.parse(savedProfile).id : null;
    
    try {
      const res = await fetch("/api/routes/generate-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: lat,
          startLng: lng,
          targetDistance: distance,
          userId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate routes");
      }

      const data = await res.json();
      setRoutes(data.routes || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate routes";
      setError(errorMessage);
      console.error("Route generation error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateRoutes();
  }, []);

  const handleStartRun = () => {
    if (!selectedRoute) return;
    
    localStorage.setItem("activeRoute", JSON.stringify({
      id: selectedRoute.id,
      routeName: selectedRoute.routeName,
      difficulty: selectedRoute.difficulty,
      actualDistance: selectedRoute.actualDistance,
      polyline: selectedRoute.polyline,
      waypoints: selectedRoute.waypoints || [],
      startLat: lat,
      startLng: lng,
    }));
    
    const runParams = new URLSearchParams({
      distance: distance.toString(),
      level: selectedRoute.difficulty,
      lat: lat.toString(),
      lng: lng.toString(),
      routeId: selectedRoute.id,
      routeName: selectedRoute.routeName,
      aiCoach: aiCoachEnabled ? "on" : "off",
    });
    setLocation(`/run?${runParams.toString()}`);
  };

  const easyRoutes = routes.filter(r => r.difficulty === "easy");
  const moderateRoutes = routes.filter(r => r.difficulty === "moderate");
  const hardRoutes = routes.filter(r => r.difficulty === "hard");

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return { bg: "bg-green-500/20", border: "border-green-500/40", text: "text-green-400", dot: "bg-green-500" };
      case "moderate": return { bg: "bg-yellow-500/20", border: "border-yellow-500/40", text: "text-yellow-400", dot: "bg-yellow-500" };
      case "hard": return { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400", dot: "bg-red-500" };
      default: return { bg: "bg-gray-500/20", border: "border-gray-500/40", text: "text-gray-400", dot: "bg-gray-500" };
    }
  };

  const RouteCard = ({ route }: { route: RouteCandidate }) => {
    const colors = getDifficultyColor(route.difficulty);
    const isSelected = selectedRoute?.id === route.id;
    
    return (
      <Card 
        className={`cursor-pointer transition-all ${colors.bg} ${colors.border} border-2 ${
          isSelected ? 'ring-2 ring-primary scale-[1.01]' : 'hover:scale-[1.005]'
        }`}
        onClick={() => setSelectedRoute(route)}
        data-testid={`card-route-${route.id}`}
      >
        <CardContent className="p-0">
          <div className="relative">
            <GoogleMapsRoute
              waypoints={route.waypoints || []}
              startLat={lat}
              startLng={lng}
              routeName={route.routeName}
              distance={route.actualDistance}
              polyline={route.polyline}
              className="h-[150px] rounded-t-lg"
            />
            {isSelected && (
              <div className="absolute top-2 right-2 bg-primary text-background px-2 py-1 rounded-full text-xs font-bold">
                Selected
              </div>
            )}
            <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full ${colors.bg} backdrop-blur-sm`}>
              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
              <span className={`text-xs font-bold uppercase ${colors.text}`}>{route.difficulty}</span>
            </div>
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Route className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg font-bold">{route.actualDistance.toFixed(1)} km</span>
              </div>
              {route.elevation && route.elevation.gain > 0 && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-xs">{route.elevation.gain}m</span>
                </div>
              )}
            </div>
            {route.elevation && (route.elevation.maxInclinePercent || route.elevation.maxDeclinePercent) && (
              <div className="flex items-center gap-3 mt-2 text-xs">
                {route.elevation.maxInclinePercent !== undefined && route.elevation.maxInclinePercent > 0 && (
                  <div className="flex items-center gap-1 text-green-400">
                    <TrendingUp className="w-3 h-3" />
                    <span>Max incline: {route.elevation.maxInclinePercent}% ({route.elevation.maxInclineDegrees}°)</span>
                  </div>
                )}
                {route.elevation.maxDeclinePercent !== undefined && route.elevation.maxDeclinePercent > 0 && (
                  <div className="flex items-center gap-1 text-orange-400">
                    <TrendingDown className="w-3 h-3" />
                    <span>Max decline: {route.elevation.maxDeclinePercent}% ({route.elevation.maxDeclineDegrees}°)</span>
                  </div>
                )}
              </div>
            )}
            {route.hasMajorRoads && (
              <p className="text-xs text-muted-foreground mt-1">Includes major roads</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const DifficultySection = ({ title, routeList, color }: { title: string; routeList: RouteCandidate[]; color: string }) => {
    if (routeList.length === 0) return null;
    
    return (
      <div className="mb-6">
        <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${color}`}>{title}</h3>
        <div className="grid grid-cols-1 gap-4">
          {routeList.map((route) => (
            <RouteCard key={route.id} route={route} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6 pb-32 font-sans text-foreground">
      <header className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          className="text-muted-foreground hover:text-primary"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold uppercase tracking-wider">Choose Your Route</h1>
          <p className="text-muted-foreground text-sm">Select from {routes.length} route options for your {distance}km run</p>
        </div>
      </header>

      {loading && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">{coachName} is generating your personalized route options</p>
          <p className="text-xs text-muted-foreground/60 mt-2">Analyzing terrain, parks, and roads to find the perfect routes for you</p>
        </motion.div>
      )}

      {error && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={generateRoutes} variant="outline" className="gap-2" data-testid="button-try-again">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
        </motion.div>
      )}

      {!loading && !error && routes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <DifficultySection title="Easy Routes" routeList={easyRoutes} color="text-green-400" />
          <DifficultySection title="Moderate Routes" routeList={moderateRoutes} color="text-yellow-400" />
          <DifficultySection title="Hard Routes" routeList={hardRoutes} color="text-red-400" />

          <div className="pt-4">
            <Button 
              variant="outline" 
              onClick={generateRoutes}
              className="w-full h-12 gap-2 border-white/20"
              data-testid="button-regenerate"
            >
              <RefreshCw className="w-4 h-4" />
              Generate New Routes
            </Button>
          </div>
        </motion.div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent z-50 space-y-3">
        <Card className="bg-card/80 backdrop-blur-sm border-white/10">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {aiCoachEnabled ? (
                  <Mic className="w-4 h-4 text-primary" />
                ) : (
                  <MicOff className="w-4 h-4 text-muted-foreground" />
                )}
                <Label htmlFor="ai-coach-toggle" className="text-sm font-medium">
                  AI Coach
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${aiCoachEnabled ? 'text-primary' : 'text-muted-foreground'}`}>
                  {aiCoachEnabled ? 'On' : 'Off'}
                </span>
                <Switch
                  id="ai-coach-toggle"
                  checked={aiCoachEnabled}
                  onCheckedChange={setAiCoachEnabled}
                  data-testid="switch-ai-coach"
                />
              </div>
            </div>
            {!aiCoachEnabled && (
              <p className="text-xs text-muted-foreground mt-2">
                Route directions will use your device's voice instead
              </p>
            )}
          </CardContent>
        </Card>
        <Button 
          size="lg" 
          className="w-full h-16 text-xl font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all disabled:opacity-50"
          onClick={handleStartRun}
          disabled={!selectedRoute || loading}
          data-testid="button-start-run"
        >
          <Play className="mr-2 w-6 h-6 fill-current" /> 
          {selectedRoute ? `Start ${selectedRoute.actualDistance.toFixed(1)}km Run` : 'Select a Route'}
        </Button>
      </div>
    </div>
  );
}
