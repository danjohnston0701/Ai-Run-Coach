import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Zap, Clock, Route, Gauge } from "lucide-react";

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
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
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
          <p className="text-muted-foreground text-sm">All your completed runs</p>
        </div>
      </header>

      {totalStats && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-4 mb-8"
          data-testid="stats-summary"
        >
          <Card className="bg-card/50 border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Total Runs</div>
              <div className="text-3xl font-display font-bold text-primary">{totalStats.totalRuns}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Total Distance</div>
              <div className="text-3xl font-display font-bold text-primary">{totalStats.totalDistance.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">km</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Total Time</div>
              <div className="text-2xl font-display font-bold text-primary">{Math.floor(totalStats.totalTime / 3600)}h</div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {runs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <Route className="w-12 h-12 text-muted mb-4" />
          <p className="text-muted-foreground mb-4">No runs yet. Complete your first run to see them here!</p>
          <Button onClick={() => setLocation("/")} className="bg-primary text-background">
            Start a Run
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {runs.map((run, index) => (
            <motion.div
              key={run.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              data-testid={`run-card-${run.id}`}
            >
              <Card className="bg-card/50 border-white/10 hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{run.date} at {run.time}</span>
                      </div>
                      <Badge className={`${getDifficultyBadgeColor(run.difficulty)} border`}>
                        {run.difficulty.charAt(0).toUpperCase() + run.difficulty.slice(1)}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 pt-3 border-t border-white/10">
                    <div className="text-center">
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Distance</div>
                      <div className="text-xl font-display font-bold text-primary">{run.distance.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">km</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Pace</div>
                      <div className="text-xl font-display font-bold text-primary">{run.avgPace}</div>
                      <div className="text-xs text-muted-foreground">/km</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Time</div>
                      <div className="text-xl font-display font-bold text-primary">{formatTime(run.totalTime)}</div>
                    </div>
                    <div className="text-center">
                      <Gauge className={`w-5 h-5 mx-auto mb-1 ${getDifficultyColor(run.difficulty)}`} />
                      <div className="text-xs text-muted-foreground">Done</div>
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
