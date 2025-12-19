import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { motion, AnimatePresence } from "framer-motion";
import { Pause, Play, Square, MapPin, Heart, Wind } from "lucide-react";

import coachAvatar from "@assets/generated_images/glowing_ai_voice_sphere_interface.png";
import mapBeginner from "@assets/generated_images/dark_mode_map_with_flat_green_route.png";
import mapModerate from "@assets/generated_images/dark_mode_map_with_yellow_moderate_route.png";
import mapExpert from "@assets/generated_images/dark_mode_map_with_red_expert_route.png";

const MESSAGES = [
  "Good pace. Keep your breathing steady.",
  "You're approaching a slight incline. Shorten your stride.",
  "Heart rate is optimal. Push a little harder.",
  "Relax your shoulders. Form looks good.",
  "Halfway to your next checkpoint.",
  "Focus on your rhythm. In, two, three. Out, two, three."
];

export default function RunSession() {
  const [active, setActive] = useState(true);
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0.00);
  const [message, setMessage] = useState("Starting run session...");
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [, setLocation] = useLocation();

  // Get query params manually since wouter doesn't parse them automatically in the hook
  const searchParams = new URLSearchParams(window.location.search);
  const targetDistance = searchParams.get("distance") || "5";
  const levelId = searchParams.get("level") || "beginner";

  const getMapImage = () => {
    switch(levelId) {
      case 'expert': return mapExpert;
      case 'moderate': return mapModerate;
      default: return mapBeginner;
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (active) {
      interval = setInterval(() => {
        setTime(t => t + 1);
        setDistance(d => d + 0.003); // Simulate distance
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [active]);

  // AI Coach Logic
  useEffect(() => {
    if (!active) return;
    
    // Random message every 10-20 seconds
    const interval = setInterval(() => {
       const randomMsg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
       setMessage(randomMsg);
       setLastMessageTime(Date.now());
       
       // Clear message after 5 seconds
       setTimeout(() => {
         if (Date.now() - lastMessageTime > 4000) {
            setMessage(""); 
         }
       }, 5000);

    }, 12000);

    return () => clearInterval(interval);
  }, [active, lastMessageTime]);


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculatePace = () => {
    if (distance === 0) return "0:00";
    const paceSeconds = time / distance;
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}'${secs.toString().padStart(2, '0')}"`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden font-sans">
      {/* Background Map Visual */}
      <div className="absolute inset-0 z-0 opacity-20">
        <img src={getMapImage()} className="w-full h-full object-cover" alt="Map Route" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      </div>

      {/* Top HUD */}
      <div className="relative z-10 p-6 flex justify-between items-start">
        <div className="bg-card/30 backdrop-blur-md rounded-xl p-3 border border-white/10">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Target</div>
          <div className="text-xl font-display font-bold text-primary">{targetDistance} km</div>
        </div>
        <div className="bg-destructive/20 backdrop-blur-md rounded-xl p-3 border border-destructive/30 flex items-center gap-2">
          <Heart className="w-4 h-4 text-red-500 animate-pulse" />
          <div className="text-xl font-display font-bold text-white">142 <span className="text-xs font-sans font-normal text-muted-foreground">BPM</span></div>
        </div>
      </div>

      {/* Center AI Avatar */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-6">
        <div className="relative mb-8">
           <div className={`absolute inset-0 bg-primary/20 blur-3xl rounded-full transition-all duration-1000 ${active ? 'scale-110 opacity-100' : 'scale-90 opacity-50'}`} />
           <img 
              src={coachAvatar} 
              className="w-48 h-48 rounded-full border-4 border-primary/20 shadow-[0_0_50px_rgba(6,182,212,0.3)] object-cover relative z-10"
              alt="AI Coach"
            />
            
            {/* Message Bubble */}
            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.9 }}
                  className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-64 bg-card/80 backdrop-blur-xl border border-primary/30 p-4 rounded-2xl text-center shadow-2xl"
                >
                  <p className="text-primary font-medium text-sm leading-relaxed">"{message}"</p>
                </motion.div>
              )}
            </AnimatePresence>
        </div>
        
        <VoiceVisualizer isActive={active && !!message} />
      </div>

      {/* Bottom Stats & Controls */}
      <div className="relative z-10 bg-card/40 backdrop-blur-xl border-t border-white/10 rounded-t-3xl p-8 pb-12 mt-auto">
        <div className="grid grid-cols-3 gap-4 mb-8 text-center">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Time</div>
            <div className="text-4xl font-display font-bold">{formatTime(time)}</div>
          </div>
          <div className="border-x border-white/10">
             <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Distance</div>
             <div className="text-4xl font-display font-bold">{distance.toFixed(2)}</div>
             <div className="text-xs text-muted-foreground">km</div>
          </div>
          <div>
             <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Pace</div>
             <div className="text-4xl font-display font-bold">{calculatePace()}</div>
             <div className="text-xs text-muted-foreground">/km</div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6">
          <Button 
            variant="outline" 
            size="icon" 
            className="w-14 h-14 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20"
            onClick={() => setLocation("/")}
            data-testid="button-stop"
          >
            <Square className="w-5 h-5 fill-foreground" />
          </Button>
          
          <Button 
            size="icon" 
            className="w-20 h-20 rounded-full bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-transform active:scale-95"
            onClick={() => setActive(!active)}
            data-testid="button-toggle-play"
          >
            {active ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
          </Button>

          <Button 
            variant="outline" 
            size="icon" 
            className="w-14 h-14 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20"
            data-testid="button-map"
          >
            <MapPin className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
