import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Calendar, Route, ArrowRight
} from "lucide-react";

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

  useEffect(() => {
    const runHistory = localStorage.getItem("runHistory");
    if (runHistory) {
      setRuns(JSON.parse(runHistory).sort((a: RunData, b: RunData) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      ));
    }
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
                className={`bg-card/50 border-white/10 hover:border-primary/50 transition-all cursor-pointer overflow-hidden`}
                onClick={() => setLocation(`/history/${run.id}`)}
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
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

