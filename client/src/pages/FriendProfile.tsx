import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, User, MapPin, Clock, Activity, BarChart3, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface FriendData {
  id: string;
  name: string;
  userCode?: string;
  profilePic?: string;
  fitnessLevel?: string;
}

interface FriendRun {
  id: string;
  distance: number;
  duration: number;
  avgPace: string;
  difficulty: string;
  completedAt: string;
  name?: string;
  elevationGain?: number;
  elevationLoss?: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function getDifficultyColor(difficulty: string): string {
  switch (difficulty?.toLowerCase()) {
    case 'easy':
      return 'bg-green-500';
    case 'moderate':
      return 'bg-yellow-500';
    case 'hard':
      return 'bg-orange-500';
    case 'extreme':
      return 'bg-red-500';
    default:
      return 'bg-primary';
  }
}

export default function FriendProfile() {
  const [, setLocation] = useLocation();
  const params = useParams<{ friendId: string }>();
  const friendId = params.friendId;
  const [activeTab, setActiveTab] = useState<'activity' | 'stats'>('activity');

  const userProfileStr = localStorage.getItem("userProfile");
  const currentUserId = userProfileStr ? JSON.parse(userProfileStr).id : null;

  const { data: friendData, isLoading: loadingFriend } = useQuery({
    queryKey: ['friend-profile', friendId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${friendId}/public-profile?requesterId=${currentUserId}`);
      if (!res.ok) throw new Error('Failed to load friend profile');
      return res.json() as Promise<FriendData>;
    },
    enabled: !!friendId && !!currentUserId,
  });

  const { data: friendRuns = [], isLoading: loadingRuns } = useQuery({
    queryKey: ['friend-runs', friendId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${friendId}/runs?requesterId=${currentUserId}`);
      if (!res.ok) throw new Error('Failed to load friend runs');
      return res.json() as Promise<FriendRun[]>;
    },
    enabled: !!friendId && !!currentUserId,
  });

  const totalDistance = friendRuns.reduce((sum, run) => sum + run.distance, 0);
  const totalDuration = friendRuns.reduce((sum, run) => sum + run.duration, 0);
  const avgPace = friendRuns.length > 0 
    ? totalDuration / totalDistance 
    : 0;

  const groupedRuns = friendRuns.reduce((groups, run) => {
    const dateKey = formatDate(run.completedAt);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(run);
    return groups;
  }, {} as Record<string, FriendRun[]>);

  if (loadingFriend) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!friendData) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <p className="text-muted-foreground mb-4">Could not load friend profile</p>
        <Button onClick={() => setLocation("/profile")} variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="p-4 flex items-center gap-4 border-b border-white/5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/profile")}
          className="rounded-full"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold">Profile</h1>
      </header>

      <div className="flex flex-col items-center py-6">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center overflow-hidden mb-4">
          {friendData.profilePic ? (
            <img src={friendData.profilePic} alt={friendData.name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-12 h-12 text-primary" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-foreground">{friendData.name}</h2>
        {friendData.fitnessLevel && (
          <p className="text-sm text-muted-foreground">{friendData.fitnessLevel}</p>
        )}
      </div>

      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'activity' 
              ? 'text-primary border-b-2 border-primary' 
              : 'text-muted-foreground'
          }`}
          data-testid="tab-activity"
        >
          Activity
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'stats' 
              ? 'text-primary border-b-2 border-primary' 
              : 'text-muted-foreground'
          }`}
          data-testid="tab-stats"
        >
          Stats
        </button>
      </div>

      <div className="p-4">
        {activeTab === 'activity' ? (
          <div className="space-y-6">
            {loadingRuns ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : friendRuns.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No runs yet</p>
            ) : (
              Object.entries(groupedRuns).map(([dateLabel, runs]) => (
                <div key={dateLabel}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <p className="text-sm text-muted-foreground">{dateLabel}</p>
                  </div>
                  <div className="space-y-3">
                    {runs.map((run) => (
                      <motion.div
                        key={run.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`${getDifficultyColor(run.difficulty)} rounded-xl p-4 cursor-pointer hover:opacity-90 transition-opacity`}
                        onClick={() => setLocation(`/history/${run.id}?friendView=true`)}
                        data-testid={`run-${run.id}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="w-4 h-4 text-white/80" />
                          <span className="text-sm font-medium text-white/90">
                            {run.name || 'Running'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-bold text-white">
                            {run.distance.toFixed(2)}
                          </span>
                          <span className="text-sm text-white/70">KM</span>
                          <div className="flex items-center gap-4 ml-auto">
                            <div className="text-right">
                              <p className="text-xs text-white/60 uppercase">Time</p>
                              <p className="text-lg font-bold text-white">{formatDuration(run.duration)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-white/60 uppercase">Pace</p>
                              <p className="text-lg font-bold text-white">{run.avgPace}<span className="text-xs">/KM</span></p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-xs text-muted-foreground uppercase mb-1">Total Runs</p>
                <p className="text-2xl font-bold text-primary">{friendRuns.length}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-xs text-muted-foreground uppercase mb-1">Total Distance</p>
                <p className="text-2xl font-bold text-primary">{totalDistance.toFixed(1)} <span className="text-sm">km</span></p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-xs text-muted-foreground uppercase mb-1">Total Time</p>
                <p className="text-2xl font-bold text-primary">{formatDuration(totalDuration)}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-xs text-muted-foreground uppercase mb-1">Avg Pace</p>
                <p className="text-2xl font-bold text-primary">
                  {avgPace > 0 ? `${Math.floor(avgPace / 60)}:${Math.floor(avgPace % 60).toString().padStart(2, '0')}` : '--:--'}
                  <span className="text-sm">/km</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
