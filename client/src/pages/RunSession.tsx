import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { RouteMap } from "@/components/RouteMap";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  Pause, Play, Square, MapPin, Heart, Wind, Map, Share2, Users, Eye, EyeOff 
} from "lucide-react";
import type { Friend } from "./Profile";

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
  const [showMap, setShowMap] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const profile = localStorage.getItem("userProfile");
    if (profile) {
      const parsed = JSON.parse(profile);
      setFriends(parsed.friends || []);
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

  // Get query params manually since wouter doesn't parse them automatically in the hook
  const searchParams = new URLSearchParams(window.location.search);
  const targetDistance = searchParams.get("distance") || "5";
  const levelId = searchParams.get("level") || "beginner";
  const mapped = searchParams.get("mapped") === "true";
  const lat = parseFloat(searchParams.get("lat") || "40.7128");
  const lng = parseFloat(searchParams.get("lng") || "-74.0060");

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
    };

    const runHistory = localStorage.getItem("runHistory");
    const runs = runHistory ? JSON.parse(runHistory) : [];
    runs.push(runData);
    localStorage.setItem("runHistory", JSON.stringify(runs));
  };

  const handleStop = () => {
    if (time > 0 && distance > 0) {
      saveRunData();
    }
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden font-sans">
      {/* Live Map View */}
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

      {/* Background Map Visual */}
      <div className="absolute inset-0 z-0 opacity-20">
        {mapped ? (
          <img src={getMapImage()} className="w-full h-full object-cover" alt="Map Route" />
        ) : (
          <div className="w-full h-full bg-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      </div>

      {/* Share Live Modal */}
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

      {/* Top HUD */}
      <div className="relative z-10 p-6 flex justify-between items-start">
        <div className="flex gap-2">
          <div className="bg-card/30 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Target</div>
            <div className="text-xl font-display font-bold text-primary">{targetDistance} km</div>
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
              <div className="text-[10px] font-display font-bold text-primary uppercase">Sharing Live</div>
            </motion.div>
          )}
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

        <div className="flex items-center justify-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            className="w-12 h-12 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20"
            onClick={handleStop}
            data-testid="button-stop"
          >
            <Square className="w-4 h-4 fill-foreground" />
          </Button>
          
          <Button 
            size="icon" 
            className="w-16 h-16 rounded-full bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-transform active:scale-95"
            onClick={() => setActive(!active)}
            data-testid="button-toggle-play"
          >
            {active ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
          </Button>

          <Button 
            variant="outline" 
            size="icon" 
            className={`w-12 h-12 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20 transition-all ${sharedWith.length > 0 ? 'bg-primary/20 border-primary/50 text-primary shadow-[0_0_15px_rgba(6,182,212,0.3)]' : ''}`}
            onClick={() => setShowShareModal(true)}
            data-testid="button-live-share"
          >
            <Share2 className="w-4 h-4" />
          </Button>
          
          <Button 
            variant="outline" 
            size="icon" 
            className="w-12 h-12 rounded-full border-white/10 hover:bg-white/10 hover:border-white/20"
            onClick={() => setShowMap(!showMap)}
            data-testid="button-map"
          >
            <Map className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
