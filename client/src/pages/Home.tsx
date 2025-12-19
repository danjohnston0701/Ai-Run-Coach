import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Flame, Mountain, Footprints, Play, MapPin, Loader } from "lucide-react";

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

export default function Home() {
  const [distance, setDistance] = useState([5]);
  const [selectedLevel, setSelectedLevel] = useState("beginner");
  const [, setLocation] = useLocation();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
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

  const handleStart = () => {
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
          <h1 className="text-4xl font-display font-bold text-primary uppercase tracking-wider">AI Coach</h1>
          <p className="text-muted-foreground text-sm">Plan your run</p>
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
          className="bg-muted/50 border border-muted-foreground/20 rounded-lg p-3 mb-6 flex items-center gap-2"
          data-testid="alert-location"
        >
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{locationError}</p>
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
        <section className="space-y-4">
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
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent z-50">
        <Button 
          size="lg" 
          className="w-full h-16 text-xl font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all"
          onClick={handleStart}
          data-testid="button-start-run"
        >
          <Play className="mr-2 w-6 h-6 fill-current" /> Start Session
        </Button>
      </div>
    </div>
  );
}
