import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Map as MapIcon, Mountain, Search, Star } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { fmtDate, titleCase } from "@/lib/format";
import { decodePolyline } from "@/components/RouteMap";
import { EmptyState, ErrorState, Loading, PageHeader, Panel, Pill, SectionTitle, Segmented, StatTile } from "@/components/app/kit";
import { RunMap } from "@/components/app/RunMap";
import { MetricAreaChart } from "@/components/app/charts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SavedRoute = {
  id: string;
  name: string;
  distance: number | string;
  difficulty?: string | null;
  polyline?: string | null;
  elevationGain?: number | string | null;
  elevationLoss?: number | string | null;
  elevationProfile?: { distance: number; elevation: number }[] | null;
  estimatedTime?: number | string | null;
  terrainType?: string | null;
  createdAt?: string;
  isFavorite?: boolean;
  lastStartedAt?: string | null;
  startLocationLabel?: string | null;
  turnInstructions?: { instruction?: string; text?: string; distance?: number }[] | null;
  source?: string | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Tile-free route silhouette for cards (237 Leaflet maps on one page would be far too heavy). */
function RouteShape({ coords }: { coords: [number, number][] }) {
  if (coords.length < 2) return <div className="grid h-full place-items-center text-ink-3"><MapIcon className="h-5 w-5" /></div>;
  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const w = (maxLng - minLng) * k || 1e-6;
  const h = maxLat - minLat || 1e-6;
  const s = 84 / Math.max(w, h);
  const ox = (100 - w * s) / 2;
  const oy = (100 - h * s) / 2;
  const step = Math.max(1, Math.floor(coords.length / 300));
  const d = coords
    .filter((_, i) => i % step === 0 || i === coords.length - 1)
    .map(([la, ln], i) => `${i ? "L" : "M"}${(ox + (ln - minLng) * k * s).toFixed(1)},${(oy + (maxLat - la) * s).toFixed(1)}`)
    .join(" ");
  const [sLa, sLn] = coords[0];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <defs>
        <linearGradient id="rs" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#00e676" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="#00d4ff" strokeOpacity="0.15" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="url(#rs)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ox + (sLn - minLng) * k * s} cy={oy + (maxLat - sLa) * s} r="3" fill="#00e676" stroke="#0a0f1a" strokeWidth="1.5" />
    </svg>
  );
}

function RouteDialog({ route, onClose }: { route: SavedRoute | null; onClose: () => void }) {
  const coords = useMemo(() => (route?.polyline ? decodePolyline(route.polyline) : []), [route]);
  const profile = (route?.elevationProfile ?? []).map((p) => ({ km: (p.distance ?? 0) / 1000, elevation: p.elevation }));
  if (!route) return null;
  const turns = (route.turnInstructions ?? []).filter((t) => t.instruction || t.text);
  return (
    <Dialog open={!!route} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{route.name}</DialogTitle>
          {route.startLocationLabel && <div className="text-sm text-ink-3">From {route.startLocationLabel}</div>}
        </DialogHeader>
        <div className="h-72 overflow-hidden rounded-xl border border-line">
          <RunMap points={[]} polyline={coords} colorByPace={false} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Distance" value={Number(route.distance).toFixed(1)} unit="km" tone="cyan" size="sm" />
          <StatTile label="Climb" value={route.elevationGain != null ? Math.round(Number(route.elevationGain)) : "—"} unit="m" tone="amber" size="sm" />
          <StatTile label="Terrain" value={<span className="text-lg">{titleCase(route.terrainType) || "—"}</span>} tone="green" size="sm" />
          <StatTile label="Difficulty" value={<span className="text-lg">{titleCase(route.difficulty) || "—"}</span>} tone="orange" size="sm" />
        </div>
        {profile.length > 2 && (
          <div>
            <div className="eyebrow mb-2">Elevation</div>
            <MetricAreaChart data={profile} y="elevation" color="#ffb300" unit="m" height={150} domainPad={0.3} />
          </div>
        )}
        {turns.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Turn by turn</div>
            <ol className="max-h-48 space-y-1.5 overflow-y-auto text-sm">
              {turns.map((t, i) => (
                <li key={i} className="flex gap-3 text-ink-2">
                  <span className="num w-14 shrink-0 text-right text-ink-3">{t.distance != null ? `${(t.distance / 1000).toFixed(2)}` : ""}</span>
                  <span>{t.text ?? t.instruction}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-xs text-ink-3">Run this route with turn-by-turn coaching from the app on your phone or watch.</p>
      </DialogContent>
    </Dialog>
  );
}

export default function Routes() {
  const { userId } = useAuth();
  const [filter, setFilter] = useState<"all" | "favorites" | "run">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(24);
  const [open, setOpen] = useState<SavedRoute | null>(null);
  const routes = useQuery({ queryKey: ["routes", userId], queryFn: () => api<SavedRoute[]>("GET", `/api/routes/user/${userId}`), enabled: !!userId });
  const events = useQuery({ queryKey: ["events-grouped"], queryFn: () => api<Record<string, any[]>>("GET", "/api/events/grouped") });

  const list = useMemo(() => {
    const all = [...(routes.data ?? [])].sort(
      (a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite) || String(b.lastStartedAt ?? b.createdAt).localeCompare(String(a.lastStartedAt ?? a.createdAt)),
    );
    return all.filter((r) => {
      if (filter === "favorites" && !r.isFavorite) return false;
      if (filter === "run" && !r.lastStartedAt) return false;
      if (q.trim() && !`${r.name} ${r.startLocationLabel ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
  }, [routes.data, filter, q]);
  const eventList = Object.entries(events.data ?? {}).flatMap(([country, evs]) => evs.map((e) => ({ ...e, country })));

  return (
    <div className="space-y-8">
      <PageHeader title="Routes" subtitle="Routes your coach has built for you, and events near you." />

      {eventList.length > 0 && (
        <section>
          <SectionTitle>Events</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {eventList.map((e) => (
              <Panel key={e.id} className="flex items-center gap-4 p-4">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-green/15 text-brand-green">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{e.name}</div>
                  <div className="text-xs text-ink-3">
                    {[e.city, e.country].filter(Boolean).join(", ")}
                    {e.scheduleType === "recurring" && e.dayOfWeek != null ? ` · Every ${DAYS[e.dayOfWeek]}` : e.specificDate ? ` · ${fmtDate(e.specificDate)}` : ""}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-ink sm:text-lg">Your routes {routes.data ? <span className="text-ink-3">({routes.data.length})</span> : null}</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routes" className="h-10 pl-10 sm:w-56" />
            </div>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "favorites", label: "Favourites" },
                { value: "run", label: "Run before" },
              ]}
            />
          </div>
        </div>
        {routes.isLoading ? (
          <Loading />
        ) : routes.isError ? (
          <ErrorState error={routes.error} onRetry={() => routes.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={<MapIcon className="h-5 w-5" />} title={routes.data?.length ? "No routes match" : "No routes yet"}>
            In the app, choose “Run with route” and your coach designs loops from your door at the distance you want.
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.slice(0, limit).map((r) => (
                <RouteCard key={r.id} r={r} onOpen={() => setOpen(r)} />
              ))}
            </div>
            {list.length > limit && (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" onClick={() => setLimit((l) => l + 24)}>
                  Show more
                </Button>
              </div>
            )}
          </>
        )}
      </section>
      <RouteDialog route={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function RouteCard({ r, onOpen }: { r: SavedRoute; onOpen: () => void }) {
  const coords = useMemo(() => (r.polyline ? decodePolyline(r.polyline) : []), [r.polyline]);
  return (
    <button onClick={onOpen} className="panel group flex gap-4 p-3 text-left transition-colors hover:border-brand/40">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2/70 p-1.5">
        <RouteShape coords={coords} />
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-start gap-1.5">
          <span className="line-clamp-2 text-sm font-semibold text-ink group-hover:text-brand">{r.name}</span>
          {r.isFavorite && <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber text-amber" />}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span className="num font-semibold text-ink-2">{Number(r.distance).toFixed(1)} km</span>
          {r.elevationGain != null && (
            <span className="inline-flex items-center gap-1">
              <Mountain className="h-3 w-3" /> {Math.round(Number(r.elevationGain))} m
            </span>
          )}
          {r.difficulty && <Pill tone={r.difficulty === "easy" ? "green" : r.difficulty === "hard" ? "orange" : "amber"}>{r.difficulty}</Pill>}
        </div>
        <div className="mt-1.5 text-[11px] text-ink-3">{r.lastStartedAt ? `Last run ${fmtDate(r.lastStartedAt)}` : `Created ${fmtDate(r.createdAt)}`}</div>
      </div>
    </button>
  );
}
