import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, Play, MapPin, Loader2, RefreshCw, Lightbulb, Mountain, Clock, Route } from "lucide-react";
import GoogleMapsRoute from "@/components/GoogleMapsRoute";

interface GeneratedRoute {
  id: string;
  name: string;
  distance: number;
  difficulty: string;
  startLat: number;
  startLng: number;
  waypoints: Array<{ lat: number; lng: number }>;
  elevation: number | null;
  estimatedTime: number | null;
  tips?: string[];
  description?: string;
}

export default function RoutePreview() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  
  const distance = parseFloat(params.get("distance") || "5");
  const level = params.get("level") || "beginner";
  // Default to Mangawhai, New Zealand if no location provided
  const lat = parseFloat(params.get("lat") || "-36.1316");
  const lng = parseFloat(params.get("lng") || "174.5755");
  
  console.log("Route generation with coordinates:", { lat, lng, distance, level });

  const [route, setRoute] = useState<GeneratedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateRoute = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const userProfile = localStorage.getItem("userProfile");
      const profile = userProfile ? JSON.parse(userProfile) : null;
      
      const res = await fetch("/api/ai/generate-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: lat,
          startLng: lng,
          distance,
          difficulty: level,
          terrainPreference: level === "beginner" ? "flat" : level === "expert" ? "hilly" : "mixed",
          userFitnessLevel: profile?.fitnessLevel || "intermediate",
          userId: profile?.id || null,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate route");
      }

      const data = await res.json();
      setRoute(data);
    } catch (err) {
      setError("Failed to generate route. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateRoute();
  }, []);

  const handleStartRun = () => {
    if (!route) return;
    
    const runParams = new URLSearchParams({
      distance: distance.toString(),
      level,
      lat: lat.toString(),
      lng: lng.toString(),
      routeId: route.id,
      routeName: route.name,
    });
    setLocation(`/run?${runParams.toString()}`);
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
          <h1 className="text-2xl font-display font-bold uppercase tracking-wider">Your Route</h1>
          <p className="text-muted-foreground text-sm">AI-generated {distance}km {level} route</p>
        </div>
      </header>

      {loading && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Generating your personalized route...</p>
          <p className="text-xs text-muted-foreground/60 mt-2">This may take a few seconds</p>
        </motion.div>
      )}

      {error && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={generateRoute} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
        </motion.div>
      )}

      {route && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <GoogleMapsRoute
            waypoints={route.waypoints || []}
            startLat={lat}
            startLng={lng}
            routeName={route.name}
            distance={route.distance}
            estimatedTime={route.estimatedTime || undefined}
            className="h-[350px]"
          />

          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-card/50 border-white/10">
              <CardContent className="p-4 text-center">
                <Route className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-2xl font-display font-bold text-primary">{route.distance.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground uppercase">km</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-white/10">
              <CardContent className="p-4 text-center">
                <Clock className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-2xl font-display font-bold text-primary">{route.estimatedTime || "--"}</p>
                <p className="text-xs text-muted-foreground uppercase">min</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-white/10">
              <CardContent className="p-4 text-center">
                <Mountain className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-2xl font-display font-bold text-primary">{route.elevation || 0}</p>
                <p className="text-xs text-muted-foreground uppercase">m elev</p>
              </CardContent>
            </Card>
          </div>

          {route.description && (
            <Card className="bg-card/50 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-display font-bold uppercase text-sm mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Route Overview
                </h3>
                <p className="text-sm text-muted-foreground">{route.description}</p>
              </CardContent>
            </Card>
          )}

          {route.tips && route.tips.length > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <h3 className="font-display font-bold uppercase text-sm mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  AI Coach Tips
                </h3>
                <ul className="space-y-2">
                  {route.tips.map((tip, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary font-bold">{index + 1}.</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={generateRoute}
              className="flex-1 h-12 gap-2 border-white/20"
              data-testid="button-regenerate"
            >
              <RefreshCw className="w-4 h-4" />
              New Route
            </Button>
          </div>
        </motion.div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent z-50">
        <Button 
          size="lg" 
          className="w-full h-16 text-xl font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all"
          onClick={handleStartRun}
          disabled={!route || loading}
          data-testid="button-start-run"
        >
          <Play className="mr-2 w-6 h-6 fill-current" /> Start Run
        </Button>
      </div>
    </div>
  );
}
