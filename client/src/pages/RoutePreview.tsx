import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, Loader2, RefreshCw, Route, TrendingUp, TrendingDown, Mic, MicOff, Brain, Sparkles, MapPin, Users, X, Check, Copy, Share2, Timer } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import GoogleMapsRoute from "@/components/GoogleMapsRoute";

interface Friend {
  id: string;
  name: string;
  email?: string;
  profilePic?: string;
}

interface TurnInstruction {
  instruction: string;
  maneuver: string;
  distance: number;
  duration: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  cumulativeDistance: number;
}

interface RouteCandidate {
  id: string;
  waypoints: Array<{ lat: number; lng: number }>;
  actualDistance: number;
  duration: number;
  polyline: string;
  routeName: string;
  difficulty: "easy" | "moderate" | "hard";
  difficultyScore: number;
  hasMajorRoads: boolean;
  uniquenessScore: number;
  deadEndCount: number;
  turnInstructions?: TurnInstruction[];
  elevation?: {
    gain: number;
    loss: number;
    maxElevation: number;
    minElevation: number;
    maxInclinePercent?: number;
    maxInclineDegrees?: number;
    maxDeclinePercent?: number;
    maxDeclineDegrees?: number;
  };
  aiReasoning?: string;
}

export default function RoutePreview() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  
  const distance = parseFloat(params.get("distance") || "5");
  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const lat = parseFloat(latParam || "-36.1316");
  const lng = parseFloat(lngParam || "174.5755");
  const targetTimeSeconds = parseInt(params.get("targetTime") || "0");
  const targetTimeEnabled = params.get("targetTimeEnabled") === "on";
  
  const paceSecondsPerKm = targetTimeEnabled && distance > 0 ? targetTimeSeconds / distance : 0;
  
  const formatTargetTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };
  
  const calculateAdjustedTargetTime = (actualDistance: number): number => {
    if (!targetTimeEnabled || paceSecondsPerKm === 0) return 0;
    return Math.round(paceSecondsPerKm * actualDistance);
  };

  const [routes, setRoutes] = useState<RouteCandidate[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("Your AI Coach");
  const [aiCoachEnabled, setAiCoachEnabled] = useState(true);
  const [showGroupRunModal, setShowGroupRunModal] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [creatingGroupRun, setCreatingGroupRun] = useState(false);
  const [groupRunCreated, setGroupRunCreated] = useState<{ id: string; inviteToken: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const savedProfile = localStorage.getItem("userProfile");
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      if (parsed.coachName) {
        setCoachName(parsed.coachName);
      }
      if (parsed.id) {
        setUserId(parsed.id);
      }
    }
  }, []);

  useEffect(() => {
    if (userId && showGroupRunModal) {
      fetch(`/api/users/${userId}/friends`)
        .then(res => res.json())
        .then(data => {
          const friendList = data.map((f: any) => ({
            id: f.friendId,
            name: f.name || 'Unknown',
            profilePic: f.profilePic,
          }));
          setFriends(friendList);
        })
        .catch(err => console.error("Failed to load friends:", err));
    }
  }, [userId, showGroupRunModal]);

  const generateRoutes = async () => {
    setLoading(true);
    setError(null);
    setSelectedRoute(null);
    
    // Get userId for personalized route suggestions
    const savedProfile = localStorage.getItem("userProfile");
    const userId = savedProfile ? JSON.parse(savedProfile).id : null;
    
    try {
      const res = await fetch("/api/routes/generate-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startLat: lat,
          startLng: lng,
          targetDistance: distance,
          userId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate routes");
      }

      const data = await res.json();
      setRoutes(data.routes || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate routes";
      setError(errorMessage);
      console.error("Route generation error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateRoutes();
  }, []);

  const handleStartRun = () => {
    if (!selectedRoute) return;
    
    localStorage.setItem("activeRoute", JSON.stringify({
      id: selectedRoute.id,
      routeName: selectedRoute.routeName,
      difficulty: selectedRoute.difficulty,
      actualDistance: selectedRoute.actualDistance,
      polyline: selectedRoute.polyline,
      waypoints: selectedRoute.waypoints || [],
      startLat: lat,
      startLng: lng,
      elevation: selectedRoute.elevation,
      turnInstructions: selectedRoute.turnInstructions || [],
    }));
    
    const runParams = new URLSearchParams({
      distance: distance.toString(),
      level: selectedRoute.difficulty,
      lat: lat.toString(),
      lng: lng.toString(),
      routeId: selectedRoute.id,
      routeName: selectedRoute.routeName,
      aiCoach: aiCoachEnabled ? "on" : "off",
    });
    setLocation(`/run?${runParams.toString()}`);
  };

  const handleCreateGroupRun = async () => {
    if (!selectedRoute || !userId) return;
    
    setCreatingGroupRun(true);
    try {
      const res = await fetch("/api/group-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostUserId: userId,
          routeId: selectedRoute.id,
          mode: "route",
          title: `${selectedRoute.actualDistance.toFixed(1)}km ${selectedRoute.difficulty} run`,
          targetDistance: selectedRoute.actualDistance,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create group run");
      }

      const groupRun = await res.json();
      setGroupRunCreated({ id: groupRun.id, inviteToken: groupRun.inviteToken });

      if (selectedFriends.length > 0) {
        await fetch(`/api/group-runs/${groupRun.id}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            friendIds: selectedFriends,
          }),
        });
        toast.success(`Invited ${selectedFriends.length} friend${selectedFriends.length > 1 ? 's' : ''} to join!`);
      }
    } catch (err) {
      console.error("Failed to create group run:", err);
      toast.error("Failed to create group run");
    } finally {
      setCreatingGroupRun(false);
    }
  };

  const handleCopyInviteLink = () => {
    if (!groupRunCreated) return;
    const link = `${window.location.origin}/join-run?token=${groupRunCreated.inviteToken}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied to clipboard!");
  };

  const handleStartGroupRun = () => {
    if (!selectedRoute || !groupRunCreated) return;
    
    localStorage.setItem("activeRoute", JSON.stringify({
      id: selectedRoute.id,
      routeName: selectedRoute.routeName,
      difficulty: selectedRoute.difficulty,
      actualDistance: selectedRoute.actualDistance,
      polyline: selectedRoute.polyline,
      waypoints: selectedRoute.waypoints || [],
      startLat: lat,
      startLng: lng,
      elevation: selectedRoute.elevation,
      turnInstructions: selectedRoute.turnInstructions || [],
    }));
    
    const runParams = new URLSearchParams({
      distance: distance.toString(),
      level: selectedRoute.difficulty,
      lat: lat.toString(),
      lng: lng.toString(),
      routeId: selectedRoute.id,
      routeName: selectedRoute.routeName,
      aiCoach: aiCoachEnabled ? "on" : "off",
      groupRunId: groupRunCreated.id,
      waiting: "true",
    });
    setLocation(`/run?${runParams.toString()}`);
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) 
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const easyRoutes = routes.filter(r => r.difficulty === "easy");
  const moderateRoutes = routes.filter(r => r.difficulty === "moderate");
  const hardRoutes = routes.filter(r => r.difficulty === "hard");

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return { bg: "bg-green-500/20", border: "border-green-500/40", text: "text-green-400", dot: "bg-green-500" };
      case "moderate": return { bg: "bg-yellow-500/20", border: "border-yellow-500/40", text: "text-yellow-400", dot: "bg-yellow-500" };
      case "hard": return { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400", dot: "bg-red-500" };
      default: return { bg: "bg-gray-500/20", border: "border-gray-500/40", text: "text-gray-400", dot: "bg-gray-500" };
    }
  };

  const RouteCard = ({ route }: { route: RouteCandidate }) => {
    const colors = getDifficultyColor(route.difficulty);
    const isSelected = selectedRoute?.id === route.id;
    
    return (
      <Card 
        className={`cursor-pointer transition-all ${colors.bg} ${colors.border} border-2 ${
          isSelected ? 'ring-2 ring-primary scale-[1.01]' : 'hover:scale-[1.005]'
        }`}
        onClick={() => setSelectedRoute(route)}
        data-testid={`card-route-${route.id}`}
      >
        <CardContent className="p-0">
          <div className="relative">
            <GoogleMapsRoute
              waypoints={route.waypoints || []}
              startLat={lat}
              startLng={lng}
              routeName={route.routeName}
              distance={route.actualDistance}
              polyline={route.polyline}
              className="h-[150px] rounded-t-lg"
            />
            {isSelected && (
              <div className="absolute top-2 right-2 bg-primary text-background px-2 py-1 rounded-full text-xs font-bold">
                Selected
              </div>
            )}
            <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full ${colors.bg} backdrop-blur-sm`}>
              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
              <span className={`text-xs font-bold uppercase ${colors.text}`}>{route.difficulty}</span>
            </div>
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Route className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg font-bold">{route.actualDistance.toFixed(1)} km</span>
              </div>
              {route.elevation && route.elevation.gain > 0 && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-xs">{route.elevation.gain}m</span>
                </div>
              )}
            </div>
            {targetTimeEnabled && (
              <div className="flex items-center gap-1 mt-2 text-primary">
                <Timer className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Target: {formatTargetTime(calculateAdjustedTargetTime(route.actualDistance))}
                </span>
              </div>
            )}
            {route.elevation && (route.elevation.maxInclineDegrees || route.elevation.maxDeclineDegrees) && (
              <div className="flex items-center gap-3 mt-2 text-xs">
                {route.elevation.maxInclineDegrees !== undefined && route.elevation.maxInclineDegrees > 0 && (
                  <div className="flex items-center gap-1 text-green-400">
                    <TrendingUp className="w-3 h-3" />
                    <span>Steepest climb: {route.elevation.maxInclineDegrees}°</span>
                  </div>
                )}
                {route.elevation.maxDeclineDegrees !== undefined && route.elevation.maxDeclineDegrees > 0 && (
                  <div className="flex items-center gap-1 text-orange-400">
                    <TrendingDown className="w-3 h-3" />
                    <span>Steepest descent: {route.elevation.maxDeclineDegrees}°</span>
                  </div>
                )}
              </div>
            )}
            {route.hasMajorRoads && (
              <p className="text-xs text-muted-foreground mt-1">Includes major roads</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const DifficultySection = ({ title, routeList, color }: { title: string; routeList: RouteCandidate[]; color: string }) => {
    if (routeList.length === 0) return null;
    
    return (
      <div className="mb-6">
        <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${color}`}>{title}</h3>
        <div className="grid grid-cols-1 gap-4">
          {routeList.map((route) => (
            <RouteCard key={route.id} route={route} />
          ))}
        </div>
      </div>
    );
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
          <h1 className="text-2xl font-display font-bold uppercase tracking-wider">Choose Your Route</h1>
          <p className="text-muted-foreground text-sm">Select from {routes.length} route options for your {distance}km run</p>
        </div>
      </header>

      {loading && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16"
        >
          <div className="relative mb-8">
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute inset-0 bg-primary/20 rounded-full blur-xl"
              style={{ width: 120, height: 120, left: -10, top: -10 }}
            />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-primary/30 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary/50"
              />
              <Brain className="w-10 h-10 text-primary" />
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute -top-1 -right-1"
              >
                <Sparkles className="w-5 h-5 text-yellow-400" />
              </motion.div>
            </div>
          </div>
          
          <motion.p
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-lg font-medium text-foreground mb-2"
          >
            {coachName} is thinking...
          </motion.p>
          
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
            <MapPin className="w-4 h-4 text-primary" />
            <span>Analyzing terrain and finding the best routes</span>
          </div>
          
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ 
                  y: [0, -8, 0],
                  opacity: [0.3, 1, 0.3]
                }}
                transition={{ 
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
                className="w-2 h-2 rounded-full bg-primary"
              />
            ))}
          </div>
        </motion.div>
      )}

      {error && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={generateRoutes} variant="outline" className="gap-2" data-testid="button-try-again">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
        </motion.div>
      )}

      {!loading && !error && routes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Route color legend - moved to top */}
          <div className="flex items-center justify-center gap-4 py-3 px-4 bg-card/50 rounded-lg border border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#3b82f6]" />
              <span className="text-sm text-muted-foreground">Start</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-12 h-1 rounded-full bg-gradient-to-r from-[#3b82f6] to-[#22c55e]" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#22c55e]" />
              <span className="text-sm text-muted-foreground">Finish</span>
            </div>
          </div>

          <DifficultySection title="Easy Routes" routeList={easyRoutes} color="text-green-400" />
          <DifficultySection title="Moderate Routes" routeList={moderateRoutes} color="text-yellow-400" />
          <DifficultySection title="Hard Routes" routeList={hardRoutes} color="text-red-400" />

          <div className="pt-4">
            <Button 
              variant="outline" 
              onClick={generateRoutes}
              className="w-full h-12 gap-2 border-white/20"
              data-testid="button-regenerate"
            >
              <RefreshCw className="w-4 h-4" />
              Generate New Routes
            </Button>
          </div>
        </motion.div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent z-50 space-y-3">
        <Card className="bg-card/80 backdrop-blur-sm border-white/10">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {aiCoachEnabled ? (
                  <Mic className="w-4 h-4 text-primary" />
                ) : (
                  <MicOff className="w-4 h-4 text-muted-foreground" />
                )}
                <Label htmlFor="ai-coach-toggle" className="text-sm font-medium">
                  AI Coach
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${aiCoachEnabled ? 'text-primary' : 'text-muted-foreground'}`}>
                  {aiCoachEnabled ? 'On' : 'Off'}
                </span>
                <Switch
                  id="ai-coach-toggle"
                  checked={aiCoachEnabled}
                  onCheckedChange={setAiCoachEnabled}
                  data-testid="switch-ai-coach"
                />
              </div>
            </div>
            {!aiCoachEnabled && (
              <p className="text-xs text-muted-foreground mt-2">
                Route directions will use your device's voice instead
              </p>
            )}
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button 
            size="lg" 
            className="flex-1 h-16 text-lg font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all disabled:opacity-50"
            onClick={handleStartRun}
            disabled={!selectedRoute || loading}
            data-testid="button-start-run"
          >
            <Play className="mr-2 w-5 h-5 fill-current" /> 
            {selectedRoute ? `Start Run` : 'Select a Route'}
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            className="h-16 px-4 border-primary/50 text-primary hover:bg-primary/10"
            onClick={() => setShowGroupRunModal(true)}
            disabled={!selectedRoute || loading || !userId}
            data-testid="button-run-with-friends"
          >
            <Users className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showGroupRunModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[100] flex items-end sm:items-center justify-center"
            onClick={() => !creatingGroupRun && setShowGroupRunModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display uppercase tracking-wider">
                  {groupRunCreated ? "Group Run Created!" : "Run with Friends"}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowGroupRunModal(false);
                    setGroupRunCreated(null);
                    setSelectedFriends([]);
                  }}
                  disabled={creatingGroupRun}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {!groupRunCreated ? (
                <>
                  {selectedRoute && (
                    <div className="bg-white/5 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Selected Route</p>
                          <p className="font-bold">{selectedRoute.actualDistance.toFixed(1)}km {selectedRoute.difficulty}</p>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${getDifficultyColor(selectedRoute.difficulty).bg} ${getDifficultyColor(selectedRoute.difficulty).text}`}>
                          {selectedRoute.difficulty}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Invite Friends</h3>
                    {friends.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No friends yet. Add friends to invite them to group runs!
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {friends.map(friend => (
                          <div
                            key={friend.id}
                            className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                              selectedFriends.includes(friend.id) 
                                ? 'bg-primary/20 border border-primary/50' 
                                : 'bg-white/5 hover:bg-white/10'
                            }`}
                            onClick={() => toggleFriendSelection(friend.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                {friend.name.charAt(0).toUpperCase()}
                              </div>
                              <span>{friend.name}</span>
                            </div>
                            {selectedFriends.includes(friend.id) && (
                              <Check className="w-5 h-5 text-primary" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mb-4">
                    You can also share an invite link after creating the group run
                  </p>

                  <Button
                    className="w-full h-12 font-display uppercase tracking-wider"
                    onClick={handleCreateGroupRun}
                    disabled={creatingGroupRun}
                  >
                    {creatingGroupRun ? (
                      <>
                        <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Users className="mr-2 w-4 h-4" />
                        Create Group Run
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">Group Run Created!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Share the invite code with friends or start running now
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-4 mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Invite Code</p>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-2xl font-bold tracking-widest text-primary">
                        {groupRunCreated.inviteToken}
                      </span>
                      <Button variant="ghost" size="sm" onClick={handleCopyInviteLink}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </Button>
                    </div>
                  </div>

                  {selectedFriends.length > 0 && (
                    <p className="text-sm text-muted-foreground mb-4 text-center">
                      {selectedFriends.length} friend{selectedFriends.length > 1 ? 's' : ''} invited
                    </p>
                  )}

                  <Button
                    className="w-full h-12 font-display uppercase tracking-wider bg-primary text-background"
                    onClick={handleStartGroupRun}
                  >
                    <Play className="mr-2 w-4 h-4 fill-current" />
                    Start Group Run
                  </Button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
