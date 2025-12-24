import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  ArrowLeft, Calendar, TrendingUp, Heart, 
  Activity, Zap as CadenceIcon, Info, Timer, MapPin, Share2, Mail, User as UserIcon, Search
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

export default function RunInsights() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/history/:id");
  const [run, setRun] = useState<RunData | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const runHistory = localStorage.getItem("runHistory");
    if (runHistory && params?.id) {
      const runs = JSON.parse(runHistory);
      const foundRun = runs.find((r: RunData) => r.id === params.id);
      if (foundRun) {
        setRun(foundRun);
      }
    }
    
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

  if (!run) return null;

  // Generate simulated chart data
  const chartData = (() => {
    const data = [];
    const points = 30;
    const baseHR = run.avgHeartRate || 155;
    const baseElev = run.difficulty === "expert" ? 40 : run.difficulty === "moderate" ? 20 : 10;
    
    for (let i = 0; i <= points; i++) {
      const dist = (run.distance / points) * i;
      data.push({
        distance: dist.toFixed(2),
        hr: baseHR - 15 + Math.random() * 30,
        elevation: baseElev + Math.sin(i / 3) * (baseElev / 1.5) + Math.random() * 3,
        cadence: 165 + Math.random() * 25
      });
    }
    return data;
  })();

  const hrZones = [
    { name: "Zone 5", range: "> 169 bpm", value: 12, color: "#ef4444", label: "Maximum" },
    { name: "Zone 4", range: "151-169 bpm", value: 48, color: "#f97316", label: "Threshold" },
    { name: "Zone 3", range: "132-150 bpm", value: 25, color: "#84cc16", label: "Aerobic" },
    { name: "Zone 2", range: "113-131 bpm", value: 10, color: "#3b82f6", label: "Easy" },
    { name: "Zone 1", range: "95-112 bpm", value: 5, color: "#64748b", label: "Warm Up" },
  ];

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
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
            onClick={() => setShowShareModal(true)}
            className="rounded-full border-primary/50 hover:bg-primary/20 text-primary"
            data-testid="button-share-run"
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

      <main className="space-y-8">
        {/* Key Stats Grid */}
        <section className="grid grid-cols-2 gap-4">
          <Card className="bg-card/30 border-white/5 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <MapPin className="w-4 h-4 text-primary mb-2" />
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Distance</div>
              <div className="text-3xl font-display font-bold text-primary">{run.distance.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground uppercase">kilometers</div>
            </CardContent>
          </Card>
          <Card className="bg-card/30 border-white/5 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <Timer className="w-4 h-4 text-primary mb-2" />
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Time</div>
              <div className="text-2xl font-display font-bold text-primary">{formatDuration(run.totalTime)}</div>
              <div className="text-xs text-muted-foreground uppercase">duration</div>
            </CardContent>
          </Card>
        </section>

        {/* Heart Rate Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Heart className="w-5 h-5 text-red-500 fill-red-500/20" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold uppercase tracking-wide">Heart Rate</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Intensity over distance</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-display font-bold text-primary">{run.avgHeartRate || 158}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Avg BPM</div>
            </div>
          </div>
          
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
        </section>

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
              <div className="text-2xl font-display font-bold text-primary">74</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Max Meters</div>
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
          {/* HR Zones */}
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
                  <span className="text-3xl font-display font-bold text-primary">153</span>
                  <span className="text-[10px] text-muted-foreground uppercase">spm</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-2 leading-tight">Average steps per minute throughout the session.</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Burn</div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-display font-bold text-primary">{run.calories || 485}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">kcal</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-2 leading-tight">Total active calories burned during this activity.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
