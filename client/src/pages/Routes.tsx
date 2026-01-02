import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Heart, MapPin, Clock, TrendingUp, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";

interface Route {
  id: string;
  name: string;
  distance: number;
  difficulty: string;
  elevationGain?: number;
  elevationLoss?: number;
  estimatedTime?: number;
  startLocationLabel?: string;
  isFavorite?: boolean;
  lastStartedAt?: string;
  createdAt: string;
}

function RouteCard({ route, onSelect }: { route: Route; onSelect: () => void }) {
  const difficultyColors: Record<string, string> = {
    beginner: "bg-green-500/20 text-green-400",
    moderate: "bg-yellow-500/20 text-yellow-400",
    challenging: "bg-orange-500/20 text-orange-400",
    hard: "bg-red-500/20 text-red-400",
  };

  const formatTime = (minutes?: number) => {
    if (!minutes) return null;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const lastRun = route.lastStartedAt
    ? `Last run ${formatDistanceToNow(new Date(route.lastStartedAt), { addSuffix: false })} ago`
    : "Never started";

  return (
    <div
      onClick={onSelect}
      className="bg-card/50 border border-border/50 rounded-xl p-4 cursor-pointer hover:bg-card/70 transition-colors"
      data-testid={`route-card-${route.id}`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-foreground truncate flex-1 mr-2">{route.name}</h3>
        {route.isFavorite && <Heart className="w-4 h-4 text-red-500 fill-red-500 flex-shrink-0" />}
      </div>
      
      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
        <span>{route.distance.toFixed(1)} km</span>
        <span className={`px-2 py-0.5 rounded-full text-xs ${difficultyColors[route.difficulty] || difficultyColors.beginner}`}>
          {route.difficulty}
        </span>
        {route.estimatedTime && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(route.estimatedTime)}
          </span>
        )}
      </div>

      {route.elevationGain && route.elevationGain > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <TrendingUp className="w-3 h-3" />
          <span>+{Math.round(route.elevationGain)}m / -{Math.round(route.elevationLoss || 0)}m</span>
        </div>
      )}

      {route.startLocationLabel && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <MapPin className="w-3 h-3" />
          <span className="truncate">{route.startLocationLabel}</span>
        </div>
      )}

      <div className="flex justify-between items-center mt-3">
        <span className="text-xs text-muted-foreground">{lastRun}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export default function Routes() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);

  const { data: allRoutes = [], isLoading } = useQuery<Route[]>({
    queryKey: ["/api/routes"],
    queryFn: async () => {
      const res = await fetch("/api/routes");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: favoriteRoutes = [] } = useQuery<Route[]>({
    queryKey: ["/api/routes/favorites"],
    queryFn: async () => {
      const res = await fetch("/api/routes/favorites");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const difficulties = ["beginner", "moderate", "challenging", "hard"];

  const filteredRoutes = selectedDifficulty
    ? allRoutes.filter((r) => r.difficulty === selectedDifficulty)
    : allRoutes;

  const handleSelectRoute = (route: Route) => {
    localStorage.setItem("selectedRoute", JSON.stringify(route));
    setLocation("/route-preview");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display text-xl uppercase tracking-wide">Routes Library</h1>
        </div>
      </header>

      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-card/50 mb-4">
            <TabsTrigger value="all" className="flex-1" data-testid="tab-all">
              All Routes
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex-1" data-testid="tab-favorites">
              Favorites
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-0">
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              <Button
                variant={selectedDifficulty === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDifficulty(null)}
                data-testid="filter-all"
              >
                All
              </Button>
              {difficulties.map((diff) => (
                <Button
                  key={diff}
                  variant={selectedDifficulty === diff ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDifficulty(diff)}
                  data-testid={`filter-${diff}`}
                  className="capitalize whitespace-nowrap"
                >
                  {diff}
                </Button>
              ))}
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading routes...</div>
            ) : filteredRoutes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {selectedDifficulty
                  ? `No ${selectedDifficulty} routes found`
                  : "No routes yet. Create your first route from the home page!"}
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredRoutes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onSelect={() => handleSelectRoute(route)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="favorites" className="mt-0">
            {favoriteRoutes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No favorite routes yet. Tap the heart on a route to add it to favorites!
              </div>
            ) : (
              <div className="grid gap-3">
                {favoriteRoutes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onSelect={() => handleSelectRoute(route)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
