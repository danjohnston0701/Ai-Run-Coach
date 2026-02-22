import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, MapPin, Clock, TrendingUp, ChevronRight, ChevronDown, Flag, Globe, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface EventRoute {
  id: string;
  name: string;
  distance: number;
  difficulty: string;
  elevationGain?: number;
  elevationLoss?: number;
  polyline?: string;
  startLocationLabel?: string;
}

interface Event {
  id: string;
  name: string;
  country: string;
  city?: string;
  description?: string;
  eventType: string;
  routeId: string;
  route?: EventRoute;
  isActive: boolean;
  createdAt: string;
  scheduleType?: string;
  specificDate?: string;
  recurrencePattern?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

function getNextEventDate(event: Event): Date | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Handle one-time events
  if (event.scheduleType === "one_time" && event.specificDate) {
    const date = new Date(event.specificDate);
    date.setHours(0, 0, 0, 0);
    return date >= now ? date : null;
  }

  // Handle recurring events (default to recurring if scheduleType is missing for backwards compatibility)
  if (event.scheduleType === "recurring" || !event.scheduleType) {
    const pattern = event.recurrencePattern || "weekly"; // Default to weekly

    if (pattern === "daily") {
      return now;
    }

    if (pattern === "weekly" && event.dayOfWeek !== undefined) {
      const targetDay = event.dayOfWeek;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      return nextDate;
    }

    if (pattern === "fortnightly" && event.dayOfWeek !== undefined) {
      // Use event creation date as anchor for fortnightly calculation
      const createdAt = event.createdAt ? new Date(event.createdAt) : new Date();
      createdAt.setHours(0, 0, 0, 0);
      
      const targetDay = event.dayOfWeek;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      
      const nextOnTargetDay = new Date(now);
      nextOnTargetDay.setDate(now.getDate() + daysUntil);
      
      // Calculate weeks since anchor and check if this week is even (fortnightly)
      const daysSinceAnchor = Math.floor((nextOnTargetDay.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
      
      if (weeksSinceAnchor % 2 === 0) {
        return nextOnTargetDay;
      } else {
        // Add another week
        nextOnTargetDay.setDate(nextOnTargetDay.getDate() + 7);
        return nextOnTargetDay;
      }
    }

    if (pattern === "monthly" && event.dayOfMonth !== undefined) {
      const targetDay = event.dayOfMonth;
      const currentDate = now.getDate();
      const nextDate = new Date(now);
      
      if (currentDate <= targetDay) {
        // Try this month
        const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
        nextDate.setDate(Math.min(targetDay, lastDayOfMonth));
      } else {
        // Move to next month
        nextDate.setMonth(nextDate.getMonth() + 1);
        const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
        nextDate.setDate(Math.min(targetDay, lastDayOfMonth));
      }
      return nextDate;
    }

    // Fallback for recurring events with dayOfWeek but no pattern specified
    if (event.dayOfWeek !== undefined) {
      const targetDay = event.dayOfWeek;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      return nextDate;
    }
  }

  // Default: return today for events without proper schedule data
  return now;
}

function formatNextEventDate(date: Date | null): string {
  if (!date) return "No upcoming date";
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()];
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const eventTypeLabels: Record<string, string> = {
  parkrun: "Park Run",
  marathon: "Marathon",
  half_marathon: "Half Marathon",
  "10k": "10K",
  "5k": "5K",
  trail: "Trail Run",
  other: "Other",
};

const countryFlags: Record<string, string> = {
  "New Zealand": "🇳🇿",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "United Kingdom": "🇬🇧",
  "Australia": "🇦🇺",
  "United States": "🇺🇸",
  "Canada": "🇨🇦",
  "Ireland": "🇮🇪",
  "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "South Africa": "🇿🇦",
  "Germany": "🇩🇪",
  "France": "🇫🇷",
  "Spain": "🇪🇸",
  "Italy": "🇮🇹",
  "Japan": "🇯🇵",
};

function EventCard({ event, onSelect }: { event: Event; onSelect: () => void }) {
  const difficultyColors: Record<string, string> = {
    easy: "bg-green-500/20 text-green-400 border-green-500/30",
    beginner: "bg-green-500/20 text-green-400 border-green-500/30",
    moderate: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    challenging: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    hard: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const displayDifficulty = (diff: string) => {
    if (diff === "beginner") return "Easy";
    if (diff === "challenging") return "Hard";
    return diff.charAt(0).toUpperCase() + diff.slice(1);
  };

  const route = event.route;
  const nextDate = getNextEventDate(event);
  const nextDateLabel = formatNextEventDate(nextDate);

  return (
    <Card
      onClick={onSelect}
      className="cursor-pointer hover:border-primary/50 transition-all bg-card/50 border-border/50"
      data-testid={`event-card-${event.id}`}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">{event.name}</h3>
            {event.city && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                {event.city}
              </p>
            )}
          </div>
          <Badge variant="outline" className="text-xs">
            {eventTypeLabels[event.eventType] || event.eventType}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-sm mt-2">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-primary font-medium">{nextDateLabel}</span>
          {event.scheduleType === "recurring" && event.recurrencePattern && (
            <span className="text-xs text-muted-foreground">
              ({event.recurrencePattern === "fortnightly" ? "every 2 weeks" : event.recurrencePattern})
            </span>
          )}
        </div>

        {route && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-3">
            <span className="font-medium text-foreground">{route.distance.toFixed(1)} km</span>
            <span className={`px-2 py-0.5 rounded-full text-xs border ${difficultyColors[route.difficulty] || difficultyColors.moderate}`}>
              {displayDifficulty(route.difficulty)}
            </span>
            {route.elevationGain && route.elevationGain > 0 && (
              <span className="flex items-center gap-1 text-xs">
                <TrendingUp className="w-3 h-3" />
                +{Math.round(route.elevationGain)}m
              </span>
            )}
          </div>
        )}

        {event.description && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{event.description}</p>
        )}

        <div className="flex justify-end items-center mt-3">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function CountrySection({ 
  country, 
  events, 
  onSelectEvent,
  defaultOpen = false 
}: { 
  country: string; 
  events: Event[];
  onSelectEvent: (event: Event) => void;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const flag = countryFlags[country] || "🌍";

  // Sort events by next occurrence date (soonest first)
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = getNextEventDate(a);
    const dateB = getNextEventDate(b);
    
    // Events with no upcoming date go to the end
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    
    return dateA.getTime() - dateB.getTime();
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-3 bg-card/30 rounded-lg hover:bg-card/50 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{flag}</span>
            <span className="font-semibold text-lg">{country}</span>
            <Badge variant="secondary" className="text-xs">
              {events.length} {events.length === 1 ? "event" : "events"}
            </Badge>
          </div>
          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 mt-3 pl-2">
          {sortedEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onSelect={() => onSelectEvent(event)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function Events() {
  const [, setLocation] = useLocation();

  const { data: groupedEvents = {}, isLoading } = useQuery<Record<string, Event[]>>({
    queryKey: ["/api/events/grouped"],
    queryFn: async () => {
      const res = await fetch("/api/events/grouped");
      if (!res.ok) return {};
      return res.json();
    },
  });

  const handleSelectEvent = (event: Event) => {
    setLocation(`/event/${event.id}`);
  };

  const countries = Object.keys(groupedEvents).sort();
  const totalEvents = Object.values(groupedEvents).reduce((sum, events) => sum + events.length, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-display font-bold uppercase tracking-wider">Events</h1>
            <p className="text-xs text-muted-foreground">Browse running events worldwide</p>
          </div>
        </div>
      </header>

      <main className="p-4 pb-24">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground">Loading events...</p>
          </div>
        ) : countries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Globe className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Events Yet</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Events will appear here once admins create them from completed runs.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
              <Flag className="w-4 h-4" />
              <span>{totalEvents} events across {countries.length} {countries.length === 1 ? "country" : "countries"}</span>
            </div>

            {countries.map((country, index) => (
              <CountrySection
                key={country}
                country={country}
                events={groupedEvents[country]}
                onSelectEvent={handleSelectEvent}
                defaultOpen={index === 0}
              />
            ))}
          </>
        )}
      </main>
    </div>
  );
}
