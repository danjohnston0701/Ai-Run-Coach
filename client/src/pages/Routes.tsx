import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Heart, MapPin, Clock, TrendingUp, ChevronRight, ArrowUpDown, Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type SortOption = 
  | "created-newest" | "created-oldest"
  | "started-newest" | "started-oldest"
  | "distance-high" | "distance-low"
  | "difficulty-easy" | "difficulty-hard";

type StatusFilter = "all" | "completed" | "not-started";

const difficultyOrder: Record<string, number> = {
  easy: 1,
  beginner: 1,
  moderate: 2,
  challenging: 3,
  hard: 4,
};

function RouteCard({ route, onSelect }: { route: Route; onSelect: () => void }) {
  const difficultyColors: Record<string, string> = {
    easy: "bg-green-500/20 text-green-400",
    beginner: "bg-green-500/20 text-green-400",
    moderate: "bg-yellow-500/20 text-yellow-400",
    challenging: "bg-red-500/20 text-red-400",
    hard: "bg-red-500/20 text-red-400",
  };

  const displayDifficulty = (diff: string) => {
    if (diff === "beginner") return "Easy";
    if (diff === "challenging") return "Hard";
    return diff.charAt(0).toUpperCase() + diff.slice(1);
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
        <span className={`px-2 py-0.5 rounded-full text-xs ${difficultyColors[route.difficulty] || difficultyColors.easy}`}>
          {displayDifficulty(route.difficulty)}
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("created-newest");

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

  const uniqueLocations = useMemo(() => {
    const locations = allRoutes
      .map((r) => r.startLocationLabel)
      .filter((label): label is string => !!label);
    return Array.from(new Set(locations)).sort();
  }, [allRoutes]);

  const difficulties = [
    { value: "easy", label: "Easy" },
    { value: "moderate", label: "Moderate" },
    { value: "hard", label: "Hard" },
  ];

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "created-newest", label: "Newest First" },
    { value: "created-oldest", label: "Oldest First" },
    { value: "started-newest", label: "Recently Run" },
    { value: "started-oldest", label: "Least Recently Run" },
    { value: "distance-high", label: "Distance: High to Low" },
    { value: "distance-low", label: "Distance: Low to High" },
    { value: "difficulty-easy", label: "Difficulty: Easy to Hard" },
    { value: "difficulty-hard", label: "Difficulty: Hard to Easy" },
  ];

  const filteredAndSortedRoutes = useMemo(() => {
    let routes = [...allRoutes];

    if (selectedDifficulty) {
      routes = routes.filter((r) => {
        if (selectedDifficulty === "easy") {
          return r.difficulty === "easy" || r.difficulty === "beginner";
        }
        if (selectedDifficulty === "hard") {
          return r.difficulty === "hard" || r.difficulty === "challenging";
        }
        return r.difficulty === selectedDifficulty;
      });
    }

    if (statusFilter === "completed") {
      routes = routes.filter((r) => r.lastStartedAt);
    } else if (statusFilter === "not-started") {
      routes = routes.filter((r) => !r.lastStartedAt);
    }

    if (selectedLocation) {
      routes = routes.filter((r) => r.startLocationLabel === selectedLocation);
    }

    routes.sort((a, b) => {
      switch (sortOption) {
        case "created-newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "created-oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "started-newest":
          if (!a.lastStartedAt && !b.lastStartedAt) return 0;
          if (!a.lastStartedAt) return 1;
          if (!b.lastStartedAt) return -1;
          return new Date(b.lastStartedAt).getTime() - new Date(a.lastStartedAt).getTime();
        case "started-oldest":
          if (!a.lastStartedAt && !b.lastStartedAt) return 0;
          if (!a.lastStartedAt) return -1;
          if (!b.lastStartedAt) return 1;
          return new Date(a.lastStartedAt).getTime() - new Date(b.lastStartedAt).getTime();
        case "distance-high":
          return b.distance - a.distance;
        case "distance-low":
          return a.distance - b.distance;
        case "difficulty-easy":
          return (difficultyOrder[a.difficulty] || 2) - (difficultyOrder[b.difficulty] || 2);
        case "difficulty-hard":
          return (difficultyOrder[b.difficulty] || 2) - (difficultyOrder[a.difficulty] || 2);
        default:
          return 0;
      }
    });

    return routes;
  }, [allRoutes, selectedDifficulty, statusFilter, selectedLocation, sortOption]);

  const handleSelectRoute = (route: Route) => {
    localStorage.setItem("selectedRoute", JSON.stringify(route));
    setLocation("/route-preview");
  };

  const clearFilters = () => {
    setSelectedDifficulty(null);
    setStatusFilter("all");
    setSelectedLocation(null);
    setSortOption("created-newest");
  };

  const hasActiveFilters = selectedDifficulty || statusFilter !== "all" || selectedLocation;

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

          <TabsContent value="all" className="mt-0 space-y-4">
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-2">
                <Button
                  variant={selectedDifficulty === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDifficulty(null)}
                  data-testid="filter-difficulty-all"
                >
                  All Levels
                </Button>
                {difficulties.map((diff) => (
                  <Button
                    key={diff.value}
                    variant={selectedDifficulty === diff.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDifficulty(diff.value)}
                    data-testid={`filter-${diff.value}`}
                    className="whitespace-nowrap"
                  >
                    {diff.label}
                  </Button>
                ))}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  data-testid="filter-status-all"
                >
                  All Status
                </Button>
                <Button
                  variant={statusFilter === "completed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("completed")}
                  data-testid="filter-completed"
                >
                  Completed
                </Button>
                <Button
                  variant={statusFilter === "not-started" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("not-started")}
                  data-testid="filter-not-started"
                >
                  Not Started
                </Button>
              </div>

              <div className="flex gap-2 flex-wrap">
                {uniqueLocations.length > 0 && (
                  <Select
                    value={selectedLocation || "all-locations"}
                    onValueChange={(val) => setSelectedLocation(val === "all-locations" ? null : val)}
                  >
                    <SelectTrigger className="w-[200px] bg-card/50" data-testid="select-location">
                      <MapPin className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="All Locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-locations">All Locations</SelectItem>
                      {uniqueLocations.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={sortOption} onValueChange={(val) => setSortOption(val as SortOption)}>
                  <SelectTrigger className="w-[200px] bg-card/50" data-testid="select-sort">
                    <ArrowUpDown className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-muted-foreground"
                    data-testid="button-clear-filters"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {filteredAndSortedRoutes.length} route{filteredAndSortedRoutes.length !== 1 ? "s" : ""} found
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading routes...</div>
            ) : filteredAndSortedRoutes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {hasActiveFilters
                  ? "No routes match your filters"
                  : "No routes yet. Create your first route from the home page!"}
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredAndSortedRoutes.map((route) => (
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
