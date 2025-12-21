import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Calendar, Zap, Clock, Route, Gauge, 
  Activity, TrendingUp, ChevronDown, ChevronUp,
  Heart, Zap as CadenceIcon
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface RunData {
  id: string;
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
}

export default function RunHistory() {
  const [, setLocation] = useLocation();
  const [runs, setRuns] = useState<RunData[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    const runHistory = localStorage.getItem("runHistory");
    if (runHistory) {
      setRuns(JSON.parse(runHistory).sort((a: RunData, b: RunData) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      ));
    }
  }, []);

  const selectedRun = runs.find(r => r.id === selectedRunId);

  // Generate simulated chart data for the selected run
  const generateChartData = (run: RunData) => {
    const data = [];
    const points = 20;
    const baseHR = run.avgHeartRate || 150;
    const baseElev = run.difficulty === "expert" ? 40 : run.difficulty === "moderate" ? 20 : 10;
    
    for (let i = 0; i <= points; i++) {
      const dist = (run.distance / points) * i;
      data.push({
        distance: dist.toFixed(1),
        hr: baseHR - 10 + Math.random() * 20,
        elevation: baseElev + Math.sin(i / 2) * (baseElev / 2) + Math.random() * 5,
        cadence: 160 + Math.random() * 20
      });
    }
    return data;
  };

  const hrZones = [
    { name: "Zone 5", range: "> 169 bpm", value: 10, color: "#ef4444", label: "Maximum" },
    { name: "Zone 4", range: "151-169 bpm", value: 45, color: "#f97316", label: "Threshold" },
    { name: "Zone 3", range: "132-150 bpm", value: 30, color: "#84cc16", label: "Aerobic" },
    { name: "Zone 2", range: "113-131 bpm", value: 10, color: "#3b82f6", label: "Easy" },
    { name: "Zone 1", range: "95-112 bpm", value: 5, color: "#64748b", label: "Warm Up" },
  ];

  const chartData = selectedRun ? generateChartData(selectedRun) : [];

  const getDifficultyColor = (level: string) => {
    switch(level) {
      case "expert": return "text-red-500";
      case "moderate": return "text-yellow-400";
      default: return "text-green-400";
    }
  };

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

  const totalStats = runs.length > 0 ? {
    totalRuns: runs.length,
    totalDistance: runs.reduce((sum, run) => sum + run.distance, 0),
    totalTime: runs.reduce((sum, run) => sum + run.totalTime, 0),
  } : null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 pb-24">
      <header className="mb-8 flex items-center gap-4">
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

      {totalStats && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-4 mb-8"
          data-testid="stats-summary"
        >
          <Card className="bg-card/50 border-white/10 overflow-hidden relative group">
            <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors" />
            <CardContent className="p-4 text-center relative z-10">
              <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Sessions</div>
              <div className="text-2xl font-display font-bold text-primary">{totalStats.totalRuns}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-white/10 overflow-hidden relative group">
            <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors" />
            <CardContent className="p-4 text-center relative z-10">
              <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Distance</div>
              <div className="text-2xl font-display font-bold text-primary">{totalStats.totalDistance.toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">km</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-white/10 overflow-hidden relative group">
            <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors" />
            <CardContent className="p-4 text-center relative z-10">
              <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Time</div>
              <div className="text-2xl font-display font-bold text-primary">{Math.floor(totalStats.totalTime / 3600)}h</div>
              <div className="text-[10px] text-muted-foreground uppercase">total</div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <Route className="w-16 h-16 text-muted-foreground/30 mx-auto mb-6" />
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
          </motion.div>
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map((run, index) => (
            <motion.div
              key={run.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              data-testid={`run-card-${run.id}`}
            >
              <Card 
                className={`bg-card/50 border-white/10 hover:border-primary/50 transition-all cursor-pointer overflow-hidden ${selectedRunId === run.id ? "ring-2 ring-primary border-primary/50 shadow-[0_0_30px_rgba(6,182,212,0.1)]" : ""}`}
                onClick={() => setSelectedRunId(selectedRunId === run.id ? null : run.id)}
              >
                <CardContent className="p-0">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="text-sm font-bold font-display uppercase tracking-wider">{run.date}</span>
                        </div>
                        <Badge className={`${getDifficultyBadgeColor(run.difficulty)} border rounded-full px-3 py-0 h-5 text-[10px] uppercase font-bold tracking-tighter`}>
                          {run.difficulty}
                        </Badge>
                      </div>
                      {selectedRunId === run.id ? <ChevronUp className="w-5 h-5 text-primary" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
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
                  </div>

                  <AnimatePresence>
                    {selectedRunId === run.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="border-t border-white/10 bg-black/40"
                      >
                        <div className="p-4 space-y-6">
                          {/* HR Chart */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Heart className="w-4 h-4 text-red-500 fill-red-500/20" />
                                <h4 className="text-xs font-display font-bold uppercase tracking-widest">Heart Rate</h4>
                              </div>
                              <div className="flex gap-4">
                                <div className="text-right">
                                  <div className="text-[10px] text-muted-foreground uppercase">Avg</div>
                                  <div className="text-sm font-bold text-primary leading-none">{run.avgHeartRate || 165} <span className="text-[8px] font-normal uppercase">bpm</span></div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-muted-foreground uppercase">Max</div>
                                  <div className="text-sm font-bold text-primary leading-none">182 <span className="text-[8px] font-normal uppercase">bpm</span></div>
                                </div>
                              </div>
                            </div>
                            <div className="h-40 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                  <defs>
                                    <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                                  <XAxis dataKey="distance" hide />
                                  <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '8px' }}
                                    itemStyle={{ color: '#ef4444' }}
                                  />
                                  <Area type="monotone" dataKey="hr" stroke="#ef4444" fillOpacity={1} fill="url(#colorHr)" strokeWidth={2} />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* Elevation Chart */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-500" />
                                <h4 className="text-xs font-display font-bold uppercase tracking-widest">Elevation</h4>
                              </div>
                              <div className="flex gap-4">
                                <div className="text-right">
                                  <div className="text-[10px] text-muted-foreground uppercase">Min</div>
                                  <div className="text-sm font-bold text-primary leading-none">36 <span className="text-[8px] font-normal uppercase">m</span></div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-muted-foreground uppercase">Max</div>
                                  <div className="text-sm font-bold text-primary leading-none">74 <span className="text-[8px] font-normal uppercase">m</span></div>
                                </div>
                              </div>
                            </div>
                            <div className="h-32 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                  <defs>
                                    <linearGradient id="colorElev" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                                  <XAxis dataKey="distance" hide />
                                  <YAxis hide />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #ffffff10', borderRadius: '8px' }}
                                    itemStyle={{ color: '#22c55e' }}
                                  />
                                  <Area type="monotone" dataKey="elevation" stroke="#22c55e" fillOpacity={1} fill="url(#colorElev)" strokeWidth={2} />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* HR Zones */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-display font-bold uppercase tracking-widest">Heart Rate Zones</h4>
                            <div className="space-y-2">
                              {hrZones.map((zone) => (
                                <div key={zone.name} className="space-y-1">
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-muted-foreground">{zone.name} <span className="text-[8px] opacity-50 px-1">•</span> {zone.label}</span>
                                    <span className="text-primary font-bold">{zone.value}%</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
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

                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                              <div className="flex items-center gap-2 mb-2">
                                <CadenceIcon className="w-3 h-3 text-orange-400" />
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Cadence</div>
                              </div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-xl font-display font-bold text-primary">153</span>
                                <span className="text-[10px] text-muted-foreground uppercase">spm</span>
                              </div>
                              <div className="text-[8px] text-muted-foreground mt-1">Peak: 206 spm</div>
                            </div>
                            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                              <div className="flex items-center gap-2 mb-2">
                                <Activity className="w-3 h-3 text-cyan-400" />
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Calories</div>
                              </div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-xl font-display font-bold text-primary">{run.calories || 485}</span>
                                <span className="text-[10px] text-muted-foreground uppercase">kcal</span>
                              </div>
                              <div className="text-[8px] text-muted-foreground mt-1">Total Burn</div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
