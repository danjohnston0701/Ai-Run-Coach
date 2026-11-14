import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronRight, Footprints, Heart, Mountain, Search, Watch } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Run } from "@/lib/types";
import { fmtClock, fmtKm, fmtPace, isWalk, recordingSourceLabel, runKm, runName, runPaceSec, runSeconds } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, Panel, Pill, Segmented, Skeleton, StatTile } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PAGE = 50;

export function RunRow({ run }: { run: Run }) {
  const d = new Date(run.startTime);
  const walk = isWalk(run);
  const src = recordingSourceLabel(run);
  return (
    <Link href={`/runs/${run.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-5">
      <div className="flex w-11 shrink-0 flex-col items-center rounded-xl border border-line bg-surface-2/70 py-1.5">
        <span className="text-[10px] font-semibold uppercase text-ink-3">{d.toLocaleDateString(undefined, { month: "short" })}</span>
        <span className="num text-lg font-bold leading-none text-ink">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-ink group-hover:text-brand">{runName(run)}</span>
          {walk && <Pill tone="green">Walk</Pill>}
          {run.linkedPlanId && <Pill tone="cyan">Plan</Pill>}
          {run.groupRunId && <Pill tone="orange">Group</Pill>}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-3">
          <span>{d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
          {run.heartRate ? (
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Heart className="h-3 w-3" /> {run.heartRate}
            </span>
          ) : null}
          {run.totalElevationGain ? (
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Mountain className="h-3 w-3" /> {Math.round(run.totalElevationGain)} m
            </span>
          ) : null}
          {src && (
            <span className="hidden items-center gap-1 truncate md:inline-flex">
              <Watch className="h-3 w-3" /> {src}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-right sm:gap-8">
        <Metric value={fmtKm(runKm(run))} unit="km" />
        <Metric value={fmtClock(runSeconds(run))} unit="time" />
        <Metric value={fmtPace(runPaceSec(run))} unit="/km" className="hidden sm:block" />
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 group-hover:text-brand" />
    </Link>
  );
}

function Metric({ value, unit, className }: { value: string; unit: string; className?: string }) {
  return (
    <div className={className}>
      <div className="num text-[15px] font-semibold text-ink">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-ink-3">{unit}</div>
    </div>
  );
}

export default function Runs() {
  const { userId } = useAuth();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "run" | "walk">("all");

  const pages = useInfiniteQuery({
    queryKey: ["runs-infinite", userId],
    queryFn: ({ pageParam }) => api<Run[]>("GET", `/api/users/${userId}/runs?limit=${PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length * PAGE),
    enabled: !!userId,
  });
  const allTime = useQuery({ queryKey: ["my-data", "all-time"], queryFn: () => api<any>("GET", "/api/my-data/all-time-stats") });

  const runs = useMemo(() => (pages.data?.pages ?? []).flat(), [pages.data]);
  const filtered = runs.filter((r) => {
    if (kind === "walk" && !isWalk(r)) return false;
    if (kind === "run" && isWalk(r)) return false;
    if (q.trim()) {
      const hay = `${runName(r)} ${r.routeName ?? ""} ${new Date(r.startTime).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const groups = useMemo(() => {
    const map = new Map<string, Run[]>();
    filtered.forEach((r) => {
      const key = new Date(r.startTime).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const at = allTime.data?.data;

  return (
    <div>
      <PageHeader title="Runs" subtitle="Every session you’ve recorded, with the full post-run summary." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total runs" value={at?.totalRuns ?? "—"} tone="cyan" size="sm" />
        <StatTile label="Total distance" value={at ? Math.round(at.totalDistanceKm).toLocaleString() : "—"} unit="km" tone="green" size="sm" />
        <StatTile label="Time on feet" value={at ? Math.round(at.totalHours) : "—"} unit="h" tone="orange" size="sm" />
        <StatTile label="Longest" value={at ? fmtKm(at.longestRunKm, 1) : "—"} unit="km" tone="violet" size="sm" />
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or month" className="pl-10" />
        </div>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "run", label: "Runs" },
            { value: "walk", label: "Walks" },
          ]}
        />
      </div>

      {pages.isError ? (
        <ErrorState error={pages.error} onRetry={() => pages.refetch()} />
      ) : pages.isLoading ? (
        <Panel className="space-y-1 p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </Panel>
      ) : runs.length === 0 ? (
        <EmptyState icon={<Footprints className="h-5 w-5" />} title="No runs yet">
          Record a run with the Ai Run Coach app on your phone or watch and it will appear here.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map(([month, list]) => (
            <section key={month}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold text-ink-2">{month}</h2>
                <span className="num text-xs text-ink-3">
                  {list.length} · {fmtKm(list.reduce((s, r) => s + runKm(r), 0), 1)} km
                </span>
              </div>
              <Panel className="divide-y divide-line/60 overflow-hidden">
                {list.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </Panel>
            </section>
          ))}
          {filtered.length === 0 && <div className="py-10 text-center text-sm text-ink-3">No runs match.</div>}
          {pages.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => pages.fetchNextPage()} disabled={pages.isFetchingNextPage}>
                {pages.isFetchingNextPage ? "Loading…" : "Load older runs"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
