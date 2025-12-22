import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Flame, Mountain, Footprints, Play, MapPin, Loader, History, ArrowRight, Timer } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { RunData } from "./RunHistory";

import mapBeginner from "@assets/generated_images/dark_mode_map_with_flat_green_route.png";
import mapModerate from "@assets/generated_images/dark_mode_map_with_yellow_moderate_route.png";
import mapExpert from "@assets/generated_images/dark_mode_map_with_red_expert_route.png";

const LEVELS = [
  {
    id: "beginner",
    title: "Beginner",
    description: "Flat terrain, easy pace",
    icon: Footprints,
    color: "text-green-400",
    image: mapBeginner,
    stats: "0m Elev • Paved"
  },
  {
    id: "moderate",
    title: "Moderate",
    description: "Mixed terrain, some inclines",
    icon: Mountain,
    color: "text-yellow-400",
    image: mapModerate,
    stats: "150m Elev • Mixed"
  },
  {
    id: "expert",
    title: "Expert",
    description: "Steep hills, stairs, technical",
    icon: Flame,
    color: "text-red-500",
    image: mapExpert,
    stats: "400m Elev • Trail/Stairs"
  }
];

interface UserProfile {
  name: string;
  coachName: string;
}

export default function Home() {
  const [distance, setDistance] = useState([5]);
  const [selectedLevel, setSelectedLevel] = useState("beginner");
  const [, setLocation] = useLocation();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState("");
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [customLat, setCustomLat] = useState("37.898379");
  const [customLng, setCustomLng] = useState("175.484486");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lastRun, setLastRun] = useState<RunData | null>(null);
  const [targetTimeActive, setTargetTimeActive] = useState(false);
  const [targetTime, setTargetTime] = useState([30]);

  // Update target time when distance changes (default 6 min/km pace)
  useEffect(() => {
    if (!targetTimeActive) {
      const calculatedTime = Math.round(distance[0] * 6);
      setTargetTime([calculatedTime]);
    }
  }, [distance, targetTimeActive]);

  // Dummy previous runs for demonstration
  const dummyRuns: RunData[] = [
    {
      id: "run-1",
      distance: 5.2,
      time: "14:30",
      totalTime: 1725,
      avgPace: "5:32",
      date: "Dec 18, 2024",
      difficulty: "beginner",
      lat: 37.898379,
      lng: 175.484486,
    },
    {
      id: "run-2",
      distance: 8.5,
      time: "08:15",
      totalTime: 2535,
      avgPace: "4:58",
      date: "Dec 15, 2024",
      difficulty: "moderate",
      lat: 37.898379,
      lng: 175.484486,
    },
    {
      id: "run-3",
      distance: 10.3,
      time: "17:45",
      totalTime: 3150,
      avgPace: "5:06",
      date: "Dec 12, 2024",
      difficulty: "expert",
      lat: 37.898379,
      lng: 175.484486,
    },
  ];

  useEffect(() => {
    const userProfile = localStorage.getItem("userProfile");
    if (userProfile) {
      setProfile(JSON.parse(userProfile));
    }

    const runHistory = localStorage.getItem("runHistory");
    if (runHistory) {
      const runs = JSON.parse(runHistory);
      if (runs.length > 0) {
        setLastRun(runs[runs.length - 1]);
      }
    } else {
      // Use dummy data if no history exists
      localStorage.setItem("runHistory", JSON.stringify(dummyRuns));
      setLastRun(dummyRuns[0]);
    }

    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationLoading(false);
        setLocationError("");
      },
      (error) => {
        setLocationError("Enable location access to get personalized routes");
        setLocationLoading(false);
      }
    );
  }, []);

  const handleUseCustomLocation = () => {
    setUserLocation({ lat: parseFloat(customLat), lng: parseFloat(customLng) });
    setShowLocationInput(false);
  };

  const handleMapRun = () => {
    const params = new URLSearchParams({
      distance: distance[0].toString(),
      level: selectedLevel,
      ...(userLocation && { lat: userLocation.lat.toString(), lng: userLocation.lng.toString() }),
      mapped: "true",
    });
    setLocation(`/run?${params.toString()}`);
  };

  const handleStartSession = () => {
    const params = new URLSearchParams({
      distance: distance[0].toString(),
      level: selectedLevel,
      ...(userLocation && { lat: userLocation.lat.toString(), lng: userLocation.lng.toString() }),
    });
    setLocation(`/run?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background p-6 pb-24 font-sans text-foreground">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-display font-bold text-primary uppercase tracking-wider">
            {profile?.coachName || "AI Coach"}
          </h1>
          <p className="text-muted-foreground text-sm">Welcome, {profile?.name}. Plan your run</p>
        </div>
        <motion.div 
          className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50"
          animate={{ scale: locationLoading ? [1, 1.1, 1] : 1 }}
          transition={{ repeat: locationLoading ? Infinity : 0, duration: 1.5 }}
        >
          {locationLoading ? (
            <Loader className="w-5 h-5 text-primary animate-spin" />
          ) : userLocation ? (
            <MapPin className="w-5 h-5 text-primary" />
          ) : (
            <div className="w-3 h-3 bg-muted rounded-full" />
          )}
        </motion.div>
      </header>

      {locationError && !userLocation && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-muted/50 border border-muted-foreground/20 rounded-lg p-3 mb-6"
          data-testid="alert-location"
        >
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{locationError}</p>
          </div>
          <button 
            onClick={() => setShowLocationInput(!showLocationInput)}
            className="text-xs text-primary hover:text-primary/80 underline"
            data-testid="button-manual-location"
          >
            {showLocationInput ? "Close" : "Enter location manually"}
          </button>
          
          {showLocationInput && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-3 space-y-2"
            >
              <input
                type="number"
                placeholder="Latitude"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                className="w-full px-2 py-1 bg-card border border-white/10 rounded text-xs text-foreground"
                step="0.0001"
                data-testid="input-latitude"
              />
              <input
                type="number"
                placeholder="Longitude"
                value={customLng}
                onChange={(e) => setCustomLng(e.target.value)}
                className="w-full px-2 py-1 bg-card border border-white/10 rounded text-xs text-foreground"
                step="0.0001"
                data-testid="input-longitude"
              />
              <button
                onClick={handleUseCustomLocation}
                className="w-full px-2 py-1 bg-primary text-background text-xs rounded font-medium hover:bg-primary/90"
                data-testid="button-use-location"
              >
                Use Location
              </button>
              <p className="text-xs text-muted-foreground mt-2">
                Try: 40.7128, -74.0060 (NYC) or 51.5074, -0.1278 (London)
              </p>
            </motion.div>
          )}
        </motion.div>
      )}

      {userLocation && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-6 flex items-center gap-2"
          data-testid="alert-location-found"
        >
          <MapPin className="w-4 h-4 text-primary" />
          <p className="text-xs text-primary">Route will be tailored to your location</p>
        </motion.div>
      )}

      <main className="space-y-8">
        <section className="space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <h2 className="text-xl font-display uppercase tracking-wide">Target Distance</h2>
              <span className="text-4xl font-bold font-display text-primary">{distance} <span className="text-lg text-muted-foreground">km</span></span>
            </div>
            <Slider
              defaultValue={[5]}
              max={42}
              step={1}
              value={distance}
              onValueChange={setDistance}
              className="py-4"
              data-testid="slider-distance"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className={`w-5 h-5 ${targetTimeActive ? "text-primary" : "text-muted-foreground/40"}`} />
                <h2 className={`text-xl font-display uppercase tracking-wide transition-opacity ${targetTimeActive ? "opacity-100" : "opacity-40"}`}>Target Time</h2>
              </div>
              <div className="flex items-center gap-3">
                {targetTimeActive && (
                  <span className="text-2xl font-display font-bold text-primary">{targetTime[0]}m</span>
                )}
                <Switch 
                  checked={targetTimeActive} 
                  onCheckedChange={setTargetTimeActive}
                  data-testid="switch-target-time"
                />
              </div>
            </div>
            <div className={`transition-all duration-300 ${targetTimeActive ? "opacity-100" : "opacity-20 pointer-events-none grayscale"}`}>
              <Slider
                value={targetTime}
                onValueChange={setTargetTime}
                min={5}
                max={120}
                step={5}
                className="py-4"
                disabled={!targetTimeActive}
                data-testid="slider-target-time"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-display uppercase tracking-wide">Select Difficulty</h2>
          <div className="grid gap-4">
            {LEVELS.map((level) => (
              <motion.div
                key={level.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedLevel(level.id)}
              >
                <Card 
                  className={`relative overflow-hidden border-2 cursor-pointer transition-all duration-300 ${
                    selectedLevel === level.id 
                      ? "border-primary shadow-[0_0_20px_rgba(6,182,212,0.3)] bg-primary/5" 
                      : "border-border hover:border-primary/50 bg-card/50"
                  }`}
                  data-testid={`card-level-${level.id}`}
                >
                  <div className="absolute inset-0 z-0 opacity-40">
                    <img src={level.image} alt={level.title} className="w-full h-full object-cover grayscale opacity-50 mix-blend-luminosity" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
                  </div>
                  
                  <CardContent className="relative z-10 p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <level.icon className={`w-5 h-5 ${level.color}`} />
                        <h3 className="text-2xl font-display font-bold uppercase">{level.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">{level.description}</p>
                      <Badge variant="outline" className="mt-2 bg-background/50 backdrop-blur border-white/10 text-xs">
                        {level.stats}
                      </Badge>
                    </div>
                    
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedLevel === level.id ? "border-primary" : "border-muted"}`}>
                      {selectedLevel === level.id && <div className="w-3 h-3 bg-primary rounded-full" />}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
              data-testid="card-session-options"
            >
              <Button 
                size="lg" 
                className="w-full h-12 text-lg font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2"
                onClick={handleMapRun}
                data-testid="button-map-run"
              >
                <MapPin className="mr-2 w-5 h-5 fill-current" /> Map My Run
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="w-full h-12 text-lg font-display uppercase tracking-widest border-white/20 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                onClick={handleStartSession}
                data-testid="button-start-session"
              >
                <Play className="mr-2 w-5 h-5 fill-current" /> Start Run Without Route
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              data-testid="card-last-run"
            >
              <Card className="relative overflow-hidden border-2 border-primary/30 bg-primary/5 cursor-pointer hover:border-primary/50 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <History className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-display font-bold uppercase">Previous Runs</h3>
                  </div>
                  {lastRun ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm mb-4 pb-4 border-b border-white/10">
                        <div>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Distance</div>
                          <div className="font-display font-bold text-primary">{lastRun.distance.toFixed(2)} km</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Pace</div>
                          <div className="font-display font-bold text-primary">{lastRun.avgPace}/km</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Date</div>
                          <div className="text-sm text-foreground">{lastRun.date}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Level</div>
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                            {lastRun.difficulty}
                          </Badge>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm mb-4 pb-4 border-b border-white/10">
                      <p className="text-muted-foreground">Complete your first run to see your stats and progress here.</p>
                    </div>
                  )}
                  <button
                    onClick={() => setLocation("/history")}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/50 rounded-lg text-primary text-sm font-medium transition-colors"
                    data-testid="button-view-dashboard"
                  >
                    View Run Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent z-50">
        <Button 
          size="lg" 
          className="w-full h-16 text-xl font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all"
          onClick={handleMapRun}
          data-testid="button-map-my-run"
        >
          <MapPin className="mr-2 w-6 h-6 fill-current" /> Map My Run
        </Button>
      </div>
    </div>
  );
}
