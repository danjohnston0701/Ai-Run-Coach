import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  CloudSun,
  Download,
  Flame,
  Footprints,
  Gauge,
  Heart,
  Loader2,
  MessageSquareQuote,
  Mountain,
  MoreHorizontal,
  Pencil,
  Scissors,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Video,
  Wind,
} from "lucide-react";
import { api, apiFetch } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { PersonalBest, Run } from "@/lib/types";
import {
  fmtClock,
  fmtDateTime,
  fmtInt,
  fmtKm,
  fmtMs,
  fmtPace,
  isWalk,
  parsePace,
  recordingSourceLabel,
  runKm,
  runName,
  runPaceSec,
  runSeconds,
  titleCase,
  ZONE_COLORS,
} from "@/lib/format";
import { buildSeries, validPoints } from "@/lib/series";
import { ErrorState, KV, Loading, Panel, Pill, SectionTitle, StatTile, TabBar } from "@/components/app/kit";
import { PaceLegend, RunMap } from "@/components/app/RunMap";
import { ChartCard, MetricAreaChart, SplitBars } from "@/components/app/charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Markdown } from "@/components/app/Markdown";

type Tab = "insights" | "group" | "summary" | "graphs" | "dynamics" | "data";

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("insights");
  const run = useQuery({ queryKey: ["run", id], queryFn: () => api<Run>("GET", `/api/runs/${id}`) });

  if (run.isLoading) return <Loading label="Loading run…" />;
  if (run.isError || !run.data) return <ErrorState error={run.error} onRetry={() => run.refetch()} />;
  return <RunView run={run.data} tab={tab} setTab={setTab} />;
}

function hasDynamics(r: Run) {
  return [r.avgGroundContactTime, r.avgVerticalOscillation, r.avgVerticalRatio, r.avgRunningPower, r.avgStrideLength, r.avgGroundContactBalance, r.avgRespirationRate].some(
    (v) => v != null && Number(v) > 0,
  );
}

function RunView({ run, tab, setTab }: { run: Run; tab: Tab; setTab: (t: Tab) => void }) {
  const km = runKm(run);
  const secs = runSeconds(run);
  const pace = runPaceSec(run);
  const points = useMemo(() => validPoints(run), [run]);
  const walk = isWalk(run);
  const source = recordingSourceLabel(run);
  const showDynamics = hasDynamics(run);

  const pbs = useQuery({ queryKey: ["my-data", "pbs", true], queryFn: () => api<any>("GET", "/api/my-data/personal-bests") });
  const pbHere: PersonalBest[] = (pbs.data?.data?.personalBests ?? []).filter((p: PersonalBest) => p.runId === run.id);

  return (
    <div>
      <RunHeader run={run} walk={walk} source={source} />
      <EndTrimCard run={run} />

      {/* Hero: map + headline numbers */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel className="relative h-72 overflow-hidden sm:h-96 lg:h-auto lg:min-h-[420px]">
          {points.length > 1 ? (
            <>
              <RunMap points={points} struggles={run.strugglePoints} />
              <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg bg-root/80 px-2.5 py-1.5 backdrop-blur">
                <PaceLegend />
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-ink-3">
              <div>
                <Footprints className="mx-auto mb-2 h-6 w-6" />
                No GPS track for this {walk ? "walk" : "run"}
              </div>
            </div>
          )}
        </Panel>
        <div className="grid grid-cols-2 content-start gap-3">
          <StatTile label="Distance" value={fmtKm(km)} unit="km" tone="cyan" size="lg" />
          <StatTile label="Moving time" value={fmtClock(secs)} tone="green" size="lg" hint={run.elapsedTime && run.elapsedTime - secs > 30 ? `Elapsed ${fmtClock(run.elapsedTime)}` : undefined} />
          <StatTile label="Avg pace" value={fmtPace(pace)} unit="/km" tone="orange" />
          <StatTile label={walk ? "Avg cadence" : "Avg cadence"} value={run.cadence ? run.cadence : "—"} unit={run.cadence ? "spm" : undefined} tone="violet" />
          <StatTile label="Avg heart rate" value={run.heartRate ? run.heartRate : "—"} unit={run.heartRate ? "bpm" : undefined} tone="red" hint={run.avgHeartRateZone ? `Mostly zone ${run.avgHeartRateZone}` : undefined} />
          <StatTile label="Elevation gain" value={fmtInt(run.totalElevationGain)} unit="m" tone="amber" hint={run.terrainType ? titleCase(run.terrainType) : undefined} />
          <StatTile label="Calories" value={fmtInt(run.activeCalories || run.calories)} unit="kcal" tone="plain" />
          <StatTile label="Max speed" value={run.maxSpeed ? fmtPace(1000 / run.maxSpeed) : "—"} unit={run.maxSpeed ? "/km" : undefined} tone="plain" hint="Fastest pace" />
        </div>
      </div>

      <TargetBanner run={run} />

      <TabBar<Tab>
        className="mt-8"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "insights", label: "Ai Insights" },
          { id: "group", label: "Group Run", hidden: !run.groupRunId },
          { id: "summary", label: "Summary" },
          { id: "graphs", label: "Graphs" },
          { id: "dynamics", label: "Dynamics", hidden: !showDynamics },
          { id: "data", label: "Data" },
        ]}
      />

      <div className="mt-6">
        {tab === "insights" && <InsightsTab run={run} pbHere={pbHere} />}
        {tab === "group" && run.groupRunId && <GroupTab groupRunId={run.groupRunId} runId={run.id} />}
        {tab === "summary" && <SummaryTab run={run} />}
        {tab === "graphs" && <GraphsTab run={run} km={km} />}
        {tab === "dynamics" && <DynamicsTab run={run} />}
        {tab === "data" && <DataTab run={run} />}
      </div>
    </div>
  );
}

/* ── Header + actions ─────────────────────────────────────────────────────── */

function RunHeader({ run, walk, source }: { run: Run; walk: boolean; source: string | null }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const [, navigate] = useLocation();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(runName(run));

  const rename = useMutation({
    mutationFn: (n: string) => api("PATCH", `/api/runs/${run.id}/rename`, { name: n.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["run", run.id] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["runs-infinite"] });
      setRenaming(false);
      toast.success("Renamed");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => api("DELETE", `/api/runs/${run.id}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["run", run.id] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["runs-infinite", userId] });
      qc.invalidateQueries({ queryKey: ["my-data"] });
      toast.success(`${walk ? "Walk" : "Run"} deleted`);
      navigate("/runs");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const downloadFit = async () => {
    try {
      const res = await apiFetch(`/api/runs/${run.id}/download-fit`);
      if (!res.ok) throw new Error(res.status === 404 ? "No GPS data to export for this run." : "Couldn’t build the .FIT file.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date(run.startTime);
      a.href = url;
      a.download = `ai-run-coach-${d.toISOString().slice(0, 10)}.fit`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <header className="mb-6">
      <Link href="/runs" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-brand">
        ← Runs
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            <span className="truncate">{runName(run)}</span>
            <button onClick={() => setRenaming(true)} className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-brand" aria-label="Rename">
              <Pencil className="h-4 w-4" />
            </button>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <span>{fmtDateTime(run.startTime)}</span>
            {walk && <Pill tone="green">Walk</Pill>}
            {run.terrainType && <Pill tone="cyan">{run.terrainType}</Pill>}
            {run.workoutType && run.workoutType !== "free" && run.workoutType !== "watch_standalone" && <Pill tone="violet">{titleCase(run.workoutType)}</Pill>}
            {source && <Pill>{source}</Pill>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" asChild>
            <a href={`/run-video/${run.id}`}>
              <Video /> Run video
            </a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 border-line bg-surface">
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadFit}>
                <Download className="mr-2 h-4 w-4" /> Download .FIT
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDeleting(true)} className="text-danger focus:text-danger">
                <Trash2 className="mr-2 h-4 w-4" /> Delete {walk ? "walk" : "run"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {walk ? "walk" : "run"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rename.mutate(name);
            }}
            className="space-y-4"
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={rename.isPending}>
                {rename.isPending && <Loader2 className="animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {walk ? "walk" : "run"}?</DialogTitle>
            <DialogDescription className="text-ink-2">
              “{runName(run)}” and its insights are removed from your history, stats and personal bests, on every device. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
              {del.isPending && <Loader2 className="animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function TargetBanner({ run }: { run: Run }) {
  if (!run.targetDistance && !run.targetTime) return null;
  const achieved = run.wasTargetAchieved;
  return (
    <div
      className={`mt-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
        achieved ? "border-brand-green/30 bg-brand-green/10 text-brand-green" : "border-line bg-surface text-ink-2"
      }`}
    >
      <Target className="h-4 w-4" />
      <span className="font-semibold">{achieved ? "Target achieved" : "Target"}</span>
      <span className="text-ink-2">
        {run.targetDistance ? `${fmtKm(run.targetDistance, run.targetDistance % 1 ? 2 : 0)} km` : ""}
        {run.targetDistance && run.targetTime ? " in " : ""}
        {run.targetTime ? fmtMs(run.targetTime) : ""}
      </span>
    </div>
  );
}

function EndTrimCard({ run }: { run: Run }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["end-trim", run.id], queryFn: () => api<any>("GET", `/api/runs/${run.id}/end-trim`) });
  const act = useMutation({
    mutationFn: (action: "apply" | "dismiss" | "undo") => api("POST", `/api/runs/${run.id}/end-trim/${action}`),
    onSuccess: (_d, action) => {
      qc.invalidateQueries({ queryKey: ["end-trim", run.id] });
      qc.invalidateQueries({ queryKey: ["run", run.id] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      toast.success(action === "apply" ? "Trimmed" : action === "undo" ? "Restored the original" : "Kept as recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const s = q.data;
  if (!s || (s.status !== "suggested" && s.status !== "applied")) return null;
  if (s.status === "applied") {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
        <span className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-brand" /> Trimmed {fmtClock(s.applied?.removedSeconds)} you spent after finishing.
        </span>
        <Button size="sm" variant="ghost" onClick={() => act.mutate("undo")} disabled={act.isPending}>
          Undo
        </Button>
      </div>
    );
  }
  const g = s.suggestion;
  return (
    <Panel className="mb-4 border-brand/40 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <Scissors className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-ink">Forgot to stop?</div>
            <p className="mt-0.5 text-sm text-ink-2">
              It looks like you finished at {fmtKm(g.newDistanceKm)} km and then {g.tailKind === "walk" ? "walked" : "stood still"} for {fmtClock(g.removedSeconds)}. Trim it to{" "}
              <span className="font-semibold text-ink">
                {fmtKm(g.newDistanceKm)} km · {fmtClock(g.newDurationSec)} · {g.newAvgPace}/km
              </span>
              ?
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={() => act.mutate("dismiss")} disabled={act.isPending}>
            Keep as recorded
          </Button>
          <Button size="sm" onClick={() => act.mutate("apply")} disabled={act.isPending}>
            Trim
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/* ── Insights ─────────────────────────────────────────────────────────────── */

function unwrapAnalysis(record: any): { kind: "freeform"; markdown: string; title?: string } | { kind: "structured"; a: any } | null {
  let obj = record?.analysis;
  if (!obj) return null;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return { kind: "freeform", markdown: obj };
    }
  }
  if (obj.freeform && obj.markdown) return { kind: "freeform", markdown: obj.markdown, title: obj.title };
  if (!obj.performanceScore && !obj.overallScore && !obj.summary && obj.analysis) obj = obj.analysis;
  if (obj.performanceScore != null || obj.overallScore != null || obj.summary) return { kind: "structured", a: obj };
  return null;
}

function InsightsTab({ run, pbHere }: { run: Run; pbHere: PersonalBest[] }) {
  const qc = useQueryClient();
  const record = useQuery({ queryKey: ["run-analysis", run.id], queryFn: () => api<any>("GET", `/api/runs/${run.id}/analysis`) });
  const analysis = unwrapAnalysis(record.data);
  const relevantStruggles = (run.strugglePoints ?? []).filter((s) => s.isRelevant !== false);

  const generate = useMutation({
    mutationFn: async () => {
      const res = await api<any>("POST", `/api/runs/${run.id}/comprehensive-analysis`, { runId: run.id });
      const a = res?.analysis ?? res;
      if (!a) throw new Error("The coach didn’t return an analysis. Please try again.");
      await api("POST", `/api/runs/${run.id}/analysis`, { analysis: { comprehensive: true, analysis: a } });
      return a;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["run-analysis", run.id] }),
    onError: (e: any) => toast.error(e.message || "Couldn’t generate insights"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        {pbHere.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber/40 bg-gradient-to-r from-amber/15 to-transparent px-4 py-3.5">
            <Trophy className="h-5 w-5 text-amber" />
            <div className="text-sm">
              <span className="font-semibold text-ink">Personal best!</span>{" "}
              <span className="text-ink-2">Your fastest {pbHere.map((p) => p.category).join(", ")} yet.</span>
            </div>
          </div>
        )}

        <Panel className="panel-pad">
          <div className="mb-4 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-green text-root">
              <Brain className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-ink">AI Analysis</h2>
          </div>
          {record.isLoading ? (
            <Loading label="Loading analysis…" className="py-8" />
          ) : analysis?.kind === "freeform" ? (
            <div>
              {analysis.title && <h3 className="mb-3 text-lg font-semibold text-ink">{analysis.title}</h3>}
              <Markdown text={analysis.markdown} />
            </div>
          ) : analysis?.kind === "structured" ? (
            <StructuredAnalysis a={analysis.a} />
          ) : (
            <div className="rounded-xl border border-dashed border-line-strong/60 p-5">
              <p className="text-sm text-ink-2">
                Get a personalised breakdown of this {isWalk(run) ? "walk" : "run"} — what went well, where you struggled and what to do next — written by your coach from every data point you recorded.
              </p>
              <Button className="mt-4" onClick={() => generate.mutate()} disabled={generate.isPending}>
                {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {generate.isPending ? "Your coach is analysing…" : "Generate AI insights"}
              </Button>
              <p className="mt-2 text-xs text-ink-3">Uses one post-run analysis from your monthly allowance.</p>
            </div>
          )}
        </Panel>

        <CoachingNotes notes={run.aiCoachingNotes ?? []} />
      </div>

      <div className="space-y-4">
        <Panel className="panel-pad">
          <SectionTitle>Struggle points</SectionTitle>
          {relevantStruggles.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-brand-green/10 px-3 py-3 text-sm font-medium text-brand-green">
              <CheckCircle2 className="h-4 w-4" /> Great {isWalk(run) ? "walk" : "run"}! No struggle points identified.
            </div>
          ) : (
            <ul className="space-y-3">
              {relevantStruggles.map((s) => (
                <li key={s.id} className="rounded-xl border border-amber/30 bg-amber/5 p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-amber">
                    <AlertTriangle className="h-4 w-4" />
                    {s.distanceMeters != null ? `${fmtKm(s.distanceMeters / 1000)} km` : "Pace drop"}
                  </div>
                  <div className="mt-1 text-ink-2">
                    Pace fell to <span className="font-medium text-ink">{s.paceAtStruggle}</span> from {s.baselinePace}
                    {s.paceDropPercent ? ` (−${Math.round(s.paceDropPercent)}%)` : ""}
                    {s.currentGrade != null && Math.abs(s.currentGrade) >= 1 ? ` on a ${s.currentGrade.toFixed(1)}% grade` : ""}
                    {s.heartRate ? `, HR ${s.heartRate}` : ""}.
                  </div>
                  {s.userComment && <div className="mt-1 text-ink-3">“{s.userComment}”</div>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <WeatherCard run={run} />
        <RacePredictions runId={run.id} />
      </div>
    </div>
  );
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col items-center">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} stroke="#2d3748" strokeWidth="8" fill="none" />
        <circle cx="44" cy="44" r={r} stroke="url(#ring)" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#00e676" />
          </linearGradient>
        </defs>
      </svg>
      <div className="-mt-[60px] mb-[26px] text-center">
        <div className="num text-2xl font-bold text-ink">{Math.round(v)}</div>
      </div>
      <div className="text-xs text-ink-3">{label}</div>
    </div>
  );
}

function Bullets({ items, color }: { items?: string[]; color: string }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, children, accent = "#00d4ff" }: { title: string; children: ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StructuredAnalysis({ a }: { a: any }) {
  const score = a.performanceScore ?? a.overallScore;
  const pb = a.performanceBreakdown;
  const obj = (o: any) => (o && typeof o === "object" ? Object.entries(o).filter(([, v]) => typeof v === "string" && v) : []);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {score != null && <ScoreRing score={Number(score)} label="Performance" />}
        {a.summary && <p className="flex-1 text-[15px] leading-relaxed text-ink">{a.summary}</p>}
      </div>
      {pb && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Effort", pb.effortScore],
            ["Execution", pb.executionScore],
            ["Consistency", pb.consistencyScore],
          ].map(([l, v]) =>
            v != null ? (
              <div key={l as string} className="rounded-xl border border-line bg-surface-2/50 p-3 text-center">
                <div className="num text-xl font-bold text-ink">{v as any}</div>
                <div className="text-xs text-ink-3">{l}</div>
              </div>
            ) : null,
          )}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {a.highlights?.length > 0 && (
          <Block title="Highlights" accent="#00e676">
            <Bullets items={a.highlights} color="#00e676" />
          </Block>
        )}
        {(a.struggles?.length > 0 || a.areasForImprovement?.length > 0) && (
          <Block title="Struggles" accent="#ffb300">
            <Bullets items={a.struggles ?? a.areasForImprovement} color="#ffb300" />
          </Block>
        )}
      </div>
      {a.personalBests?.length > 0 && (
        <Block title="Personal bests" accent="#ffb300">
          <Bullets items={a.personalBests} color="#ffb300" />
        </Block>
      )}
      {obj(a.pacingStrategy).length > 0 && (
        <Block title="Pacing">
          <dl className="space-y-2 text-sm">
            {obj(a.pacingStrategy).map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium text-ink">{titleCase(k.replace(/([A-Z])/g, " $1"))}</dt>
                <dd className="text-ink-2">{v as string}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}
      {obj(a.mentalGame).length > 0 && (
        <Block title="Mental game" accent="#8b7cf6">
          <dl className="space-y-2 text-sm">
            {obj(a.mentalGame).map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium text-ink">{titleCase(k.replace(/([A-Z])/g, " $1"))}</dt>
                <dd className="text-ink-2">{v as string}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}
      {a.improvementTips?.length > 0 && (
        <Block title="Coaching tips" accent="#ff6b35">
          <Bullets items={a.improvementTips} color="#ff6b35" />
        </Block>
      )}
      {(a.nextWorkoutCoaching?.recommendation || a.nextRunSuggestion) && (
        <div className="rounded-xl border border-brand/30 bg-gradient-to-r from-brand/10 to-transparent p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">Next session</div>
          <div className="mt-1 font-semibold text-ink">{a.nextWorkoutCoaching?.recommendation ?? a.nextRunSuggestion}</div>
          {a.nextWorkoutCoaching?.reasonWhy && <p className="mt-1 text-sm text-ink-2">{a.nextWorkoutCoaching.reasonWhy}</p>}
          <Bullets items={a.nextWorkoutCoaching?.focusPoints} color="#00d4ff" />
        </div>
      )}
      {[
        ["Recovery", a.recoveryAdvice],
        ["Training load", a.trainingLoadAssessment],
        ["Progression", a.progressionTrend],
        ["Weather impact", a.weatherImpact],
      ]
        .filter(([, v]) => typeof v === "string" && v)
        .map(([k, v]) => (
          <div key={k} className="text-sm">
            <span className="font-semibold text-ink">{k}: </span>
            <span className="text-ink-2">{v}</span>
          </div>
        ))}
      {a.coachMotivationalMessage && (
        <blockquote className="rounded-xl border-l-2 border-brand bg-surface-2/40 px-4 py-3 text-sm italic leading-relaxed text-ink">{a.coachMotivationalMessage}</blockquote>
      )}
    </div>
  );
}

function CoachingNotes({ notes }: { notes: { time: number; message: string }[] }) {
  const [all, setAll] = useState(false);
  if (!notes.length) return null;
  const shown = all ? notes : notes.slice(0, 6);
  return (
    <Panel className="panel-pad">
      <SectionTitle>
        <span className="flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4 text-brand" /> Coaching during your run
        </span>
      </SectionTitle>
      <ol className="relative space-y-4 border-l border-line pl-5">
        {shown.map((n, i) => {
          const m = /^([A-Za-z0-9 %]+):\s/.exec(n.message);
          const tag = m && m[1].length < 20 ? m[1] : null;
          const body = tag ? n.message.slice(m![0].length) : n.message;
          return (
            <li key={i} className="relative">
              <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-root bg-brand" />
              <div className="flex items-center gap-2 text-xs text-ink-3">
                <span className="num font-semibold text-brand">{fmtClock(n.time / 1000)}</span>
                {tag && <Pill tone="cyan">{tag}</Pill>}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
            </li>
          );
        })}
      </ol>
      {notes.length > 6 && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setAll((x) => !x)}>
          {all ? "Show fewer" : `Show all ${notes.length} cues`}
        </Button>
      )}
    </Panel>
  );
}

function WeatherCard({ run }: { run: Run }) {
  const w = run.weatherAtStart;
  if (!w || w.temperature == null) return null;
  return (
    <Panel className="panel-pad">
      <SectionTitle>
        <span className="flex items-center gap-2">
          <CloudSun className="h-4 w-4 text-brand" /> Conditions
        </span>
      </SectionTitle>
      <div className="flex items-center gap-4">
        <div className="num text-4xl font-bold text-ink">{Math.round(w.temperature)}°</div>
        <div className="text-sm text-ink-2">
          <div className="font-medium text-ink">{w.description ?? w.condition}</div>
          {w.feelsLike != null && <div>Feels like {Math.round(w.feelsLike)}°</div>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {w.humidity != null && <div className="rounded-lg bg-surface-2/60 px-3 py-2 text-ink-2">Humidity <span className="float-right font-medium text-ink">{w.humidity}%</span></div>}
        {w.windSpeed != null && (
          <div className="rounded-lg bg-surface-2/60 px-3 py-2 text-ink-2">
            <Wind className="mr-1 inline h-3.5 w-3.5" />
            Wind <span className="float-right font-medium text-ink">{Math.round(w.windSpeed)} km/h</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

function RacePredictions({ runId }: { runId: string }) {
  const q = useQuery({ queryKey: ["race-predictions", runId], queryFn: () => api<any>("GET", `/api/runs/${runId}/race-predictions`), retry: false });
  const preds = (q.data?.predictions ?? []).filter((p: any) => p.reliable !== false);
  if (!preds.length) return null;
  return (
    <Panel className="panel-pad">
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" /> Race predictions
        </span>
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {preds.map((p: any) => (
          <div key={p.race} className="rounded-xl border border-line bg-surface-2/50 p-3">
            <div className="text-xs font-semibold text-ink-3">{p.race}</div>
            <div className="num mt-0.5 text-lg font-bold text-ink">{fmtClock(p.predictedTimeSeconds)}</div>
            <div className="num text-xs text-ink-3">{fmtPace(p.predictedTimeSeconds / p.distanceKm)}/km</div>
          </div>
        ))}
      </div>
      {q.data?.disclaimer && <p className="mt-3 text-xs text-ink-3">{q.data.disclaimer}</p>}
    </Panel>
  );
}

/* ── Group run ────────────────────────────────────────────────────────────── */

function GroupTab({ groupRunId, runId }: { groupRunId: string; runId: string }) {
  const q = useQuery({ queryKey: ["group-results", groupRunId], queryFn: () => api<any>("GET", `/api/group-runs/${groupRunId}/results`) });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{q.data?.groupRunName ?? "Group run"}</h2>
        <Link href={`/group-runs/${groupRunId}`} className="text-sm font-semibold text-brand hover:underline">
          Group run details
        </Link>
      </div>
      <Leaderboard results={q.data?.results ?? []} highlightRunId={runId} />
    </div>
  );
}

export function Leaderboard({ results, highlightRunId }: { results: any[]; highlightRunId?: string }) {
  if (!results.length) return <Panel className="panel-pad text-sm text-ink-3">No results yet.</Panel>;
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="px-4 py-3 font-semibold">#</th>
            <th className="px-4 py-3 font-semibold">Runner</th>
            <th className="px-4 py-3 text-right font-semibold">Distance</th>
            <th className="px-4 py-3 text-right font-semibold">Time</th>
            <th className="px-4 py-3 text-right font-semibold">Pace</th>
            <th className="px-4 py-3 text-right font-semibold">Avg HR</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const s = r.runSession as Run | null;
            const mine = r.isCurrentUser || (highlightRunId && r.runId === highlightRunId);
            return (
              <tr key={r.userId ?? i} className={`border-b border-line/50 last:border-0 ${mine ? "bg-brand/5" : ""}`}>
                <td className="num px-4 py-3 font-bold text-ink">{r.rank ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${mine ? "text-brand" : "text-ink"}`}>{r.userName}</span>
                  {!s && <span className="ml-2 text-xs text-ink-3">{r.status ? titleCase(r.status) : "Not finished"}</span>}
                </td>
                <td className="num px-4 py-3 text-right text-ink-2">{s ? `${fmtKm(runKm(s))} km` : "—"}</td>
                <td className="num px-4 py-3 text-right text-ink">{s ? fmtClock(runSeconds(s)) : "—"}</td>
                <td className="num px-4 py-3 text-right text-ink-2">{s ? fmtPace(runPaceSec(s)) : "—"}</td>
                <td className="num px-4 py-3 text-right text-ink-2">{s?.heartRate || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

/* ── Summary ──────────────────────────────────────────────────────────────── */

function SummaryTab({ run }: { run: Run }) {
  const splits = (run.kmSplits ?? [])
    .map((s) => ({ km: s.km, paceSec: parsePace(s.pace) ?? s.time / 1000, time: s.time }))
    .filter((s) => s.paceSec > 0);
  const zones = [run.timeInZone1, run.timeInZone2, run.timeInZone3, run.timeInZone4, run.timeInZone5].map((v) => Number(v) || 0);
  const zoneTotal = zones.reduce((a, b) => a + b, 0);
  const fastest = splits.length ? Math.min(...splits.map((s) => s.paceSec)) : null;
  const slowest = splits.length ? Math.max(...splits.map((s) => s.paceSec)) : null;
  const avg = splits.length ? splits.reduce((a, s) => a + s.paceSec, 0) / splits.length : null;
  const sd = splits.length > 1 && avg ? Math.sqrt(splits.reduce((a, s) => a + (s.paceSec - avg) ** 2, 0) / splits.length) : null;
  const consistency = sd != null && avg ? Math.max(0, Math.round(100 - (sd / avg) * 100 * 4)) : null;
  const firstHalf = splits.slice(0, Math.floor(splits.length / 2));
  const secondHalf = splits.slice(Math.ceil(splits.length / 2));
  const mean = (xs: typeof splits) => xs.reduce((a, s) => a + s.paceSec, 0) / Math.max(1, xs.length);
  const negative = firstHalf.length && secondHalf.length ? mean(secondHalf) < mean(firstHalf) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <ChartCard title="Km splits" subtitle={avg ? `Average ${fmtPace(avg)}/km — cyan bars beat it` : undefined}>
          {splits.length ? (
            <SplitBars splits={splits.map((s) => ({ km: s.km, paceSec: s.paceSec, label: String(s.km) }))} />
          ) : (
            <div className="py-8 text-center text-sm text-ink-3">No full kilometre splits for this session.</div>
          )}
        </ChartCard>
        {splits.length > 0 && (
          <Panel className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
                  <th className="px-5 py-3 font-semibold">Km</th>
                  <th className="px-5 py-3 text-right font-semibold">Pace</th>
                  <th className="px-5 py-3 text-right font-semibold">Split time</th>
                  <th className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {splits.map((s) => {
                  const w = fastest && slowest && slowest > fastest ? 30 + ((slowest - s.paceSec) / (slowest - fastest)) * 70 : 100;
                  return (
                    <tr key={s.km} className="border-b border-line/40 last:border-0">
                      <td className="num px-5 py-2.5 font-semibold text-ink">{s.km}</td>
                      <td className={`num px-5 py-2.5 text-right font-medium ${s.paceSec === fastest ? "text-brand-green" : s.paceSec === slowest ? "text-orange" : "text-ink"}`}>{fmtPace(s.paceSec)}</td>
                      <td className="num px-5 py-2.5 text-right text-ink-2">{fmtMs(s.time)}</td>
                      <td className="w-1/3 px-5 py-2.5">
                        <div className="h-1.5 rounded-full bg-surface-3/50">
                          <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-green" style={{ width: `${w}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
      <div className="space-y-4">
        {splits.length > 1 && (
          <Panel className="panel-pad">
            <SectionTitle>Pacing</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Fastest km" value={fmtPace(fastest)} unit="/km" tone="green" size="sm" />
              <StatTile label="Slowest km" value={fmtPace(slowest)} unit="/km" tone="orange" size="sm" />
              <StatTile label="Consistency" value={consistency ?? "—"} unit={consistency != null ? "/100" : undefined} tone="cyan" size="sm" />
              <StatTile label="Split" value={negative == null ? "—" : negative ? "Negative" : "Positive"} tone="violet" size="sm" hint={negative ? "Second half faster" : negative === false ? "Second half slower" : undefined} />
            </div>
          </Panel>
        )}
        {zoneTotal > 0 && (
          <Panel className="panel-pad">
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-danger" /> Heart rate zones
              </span>
            </SectionTitle>
            <div className="mb-4 flex h-3 overflow-hidden rounded-full">
              {zones.map((z, i) => (z > 0 ? <div key={i} style={{ width: `${(z / zoneTotal) * 100}%`, background: ZONE_COLORS[i] }} /> : null))}
            </div>
            <div className="space-y-2">
              {zones.map((z, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ZONE_COLORS[i] }} />
                  <span className="w-16 text-ink-2">Zone {i + 1}</span>
                  <span className="num flex-1 text-right text-ink">{fmtClock(z)}</span>
                  <span className="num w-12 text-right text-ink-3">{Math.round((z / zoneTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
        <Panel className="panel-pad">
          <SectionTitle>Effort</SectionTitle>
          <div className="divide-y divide-line/50">
            <KV label="Avg heart rate" value={run.heartRate ? `${run.heartRate} bpm` : "—"} />
            <KV label="Min heart rate" value={run.minHeartRate ? `${run.minHeartRate} bpm` : "—"} />
            <KV label="Max cadence" value={run.maxCadence ? `${run.maxCadence} spm` : "—"} />
            <KV label="Steps" value={fmtInt(run.totalSteps)} />
            <KV label="Est. sweat loss" value={run.estSweatLoss ? `${run.estSweatLoss} L` : "—"} />
            <KV label="Steepest climb" value={run.steepestIncline ? `${run.steepestIncline.toFixed(1)}%` : "—"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── Graphs ───────────────────────────────────────────────────────────────── */

function GraphsTab({ run, km }: { run: Run; km: number }) {
  const series = useMemo(() => buildSeries(run, km), [run, km]);
  const avgPace = runPaceSec(run);
  const has = (k: "pace" | "hr" | "elevation" | "cadence") => series.filter((p) => p[k] != null).length > 5;
  if (!series.length) return <Panel className="panel-pad text-sm text-ink-3">No time-series data was recorded for this session.</Panel>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {has("pace") && (
        <ChartCard title="Pace" subtitle="Faster is higher" right={<Activity className="h-4 w-4 text-brand" />}>
          <MetricAreaChart data={series} y="pace" color="#00d4ff" invert format={(v) => fmtPace(v)} unit="/km" reference={avgPace ? { value: avgPace, label: `avg ${fmtPace(avgPace)}` } : undefined} />
        </ChartCard>
      )}
      {has("hr") && (
        <ChartCard title="Heart rate" right={<Heart className="h-4 w-4 text-danger" />}>
          <MetricAreaChart data={series} y="hr" color="#ff5252" unit="bpm" reference={run.heartRate ? { value: run.heartRate, label: `avg ${run.heartRate}` } : undefined} />
        </ChartCard>
      )}
      {has("elevation") && (
        <ChartCard title="Elevation" subtitle={run.totalElevationGain ? `+${Math.round(run.totalElevationGain)} m / −${Math.round(run.totalElevationLoss ?? 0)} m` : undefined} right={<Mountain className="h-4 w-4 text-amber" />}>
          <MetricAreaChart data={series} y="elevation" color="#ffb300" unit="m" domainPad={0.3} />
        </ChartCard>
      )}
      {has("cadence") && (
        <ChartCard title="Cadence" right={<Footprints className="h-4 w-4 text-violet" />}>
          <MetricAreaChart data={series} y="cadence" color="#8b7cf6" unit="spm" />
        </ChartCard>
      )}
    </div>
  );
}

/* ── Dynamics (watch running dynamics) ────────────────────────────────────── */

function DynamicsTab({ run }: { run: Run }) {
  const km = runKm(run);
  const charts: { key: keyof Run; title: string; unit: string; color: string }[] = [
    { key: "groundContactTimeData", title: "Ground contact time", unit: "ms", color: "#00d4ff" },
    { key: "verticalOscillationData", title: "Vertical oscillation", unit: "cm", color: "#00e676" },
    { key: "strideLengthData", title: "Stride length", unit: "m", color: "#8b7cf6" },
    { key: "runningPowerData", title: "Running power", unit: "W", color: "#ff6b35" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {run.avgGroundContactTime ? <StatTile label="Ground contact" value={Math.round(run.avgGroundContactTime)} unit="ms" tone="cyan" hint="200–300 ms is typical" /> : null}
        {run.avgGroundContactBalance ? <StatTile label="GCT balance" value={run.avgGroundContactBalance.toFixed(1)} unit="% L" tone="green" hint="50% is even" /> : null}
        {run.avgVerticalOscillation ? <StatTile label="Vertical oscillation" value={run.avgVerticalOscillation.toFixed(1)} unit="cm" tone="violet" hint="6–8 cm is efficient" /> : null}
        {run.avgVerticalRatio ? <StatTile label="Vertical ratio" value={run.avgVerticalRatio.toFixed(1)} unit="%" tone="amber" hint="8–10% is efficient" /> : null}
        {run.avgStrideLength ? <StatTile label="Stride length" value={run.avgStrideLength.toFixed(2)} unit="m" tone="plain" /> : null}
        {run.avgRunningPower ? <StatTile label="Avg power" value={run.avgRunningPower} unit="W" tone="orange" hint={run.maxRunningPower ? `Max ${run.maxRunningPower} W` : undefined} /> : null}
        {run.avgRespirationRate ? <StatTile label="Respiration" value={Math.round(run.avgRespirationRate)} unit="brpm" tone="plain" /> : null}
        {run.aerobicTrainingEffect ? <StatTile label="Training effect" value={run.aerobicTrainingEffect.toFixed(1)} tone="green" hint={run.trainingEffectLabel ?? "Aerobic"} /> : null}
        {run.vo2MaxEstimate ? <StatTile label="VO₂ max" value={run.vo2MaxEstimate.toFixed(0)} tone="cyan" /> : null}
        {run.recoveryTimeMinutes ? <StatTile label="Recovery" value={Math.round(run.recoveryTimeMinutes / 60)} unit="h" tone="plain" /> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {charts.map((c) => {
          const arr = run[c.key] as number[] | null | undefined;
          if (!arr || arr.filter((v) => v > 0).length < 5) return null;
          const step = Math.max(1, Math.floor(arr.length / 250));
          const data = arr
            .filter((_, i) => i % step === 0)
            .map((v, i, all) => ({ km: Number(((i / Math.max(1, all.length - 1)) * km).toFixed(3)), v: v > 0 ? v : null }));
          return (
            <ChartCard key={String(c.key)} title={c.title}>
              <MetricAreaChart data={data} y="v" color={c.color} unit={c.unit} format={(v) => (c.unit === "m" ? v.toFixed(2) : String(Math.round(v)))} />
            </ChartCard>
          );
        })}
      </div>
      {run.garminDeviceName && <p className="text-xs text-ink-3">Recorded with {run.garminDeviceName}. Garmin data is shown exactly as your watch recorded it.</p>}
    </div>
  );
}

/* ── Data ─────────────────────────────────────────────────────────────────── */

function DataTab({ run }: { run: Run }) {
  const groups: { title: string; icon: ReactNode; rows: [string, ReactNode][] }[] = [
    {
      title: "Time",
      icon: <Clock className="h-4 w-4 text-brand" />,
      rows: [
        ["Start", fmtDateTime(run.startTime)],
        ["Finish", run.endTime ? fmtDateTime(run.endTime) : "—"],
        ["Moving time", fmtClock(runSeconds(run))],
        ["Elapsed time", run.elapsedTime ? fmtClock(run.elapsedTime) : fmtMs(run.duration)],
      ],
    },
    {
      title: "Distance & pace",
      icon: <Footprints className="h-4 w-4 text-brand" />,
      rows: [
        ["Distance", `${fmtKm(runKm(run))} km`],
        ["Average pace", `${fmtPace(runPaceSec(run))} /km`],
        ["Average speed", run.averageSpeed ? `${(run.averageSpeed * 3.6).toFixed(1)} km/h` : "—"],
        ["Max speed", run.maxSpeed ? `${(run.maxSpeed * 3.6).toFixed(1)} km/h` : "—"],
        ["Km splits", String(run.kmSplits?.length ?? 0)],
      ],
    },
    {
      title: "Body",
      icon: <Heart className="h-4 w-4 text-danger" />,
      rows: [
        ["Average heart rate", run.heartRate ? `${run.heartRate} bpm` : "—"],
        ["Min heart rate", run.minHeartRate ? `${run.minHeartRate} bpm` : "—"],
        ["Average cadence", run.cadence ? `${run.cadence} spm` : "—"],
        ["Max cadence", run.maxCadence ? `${run.maxCadence} spm` : "—"],
        ["Steps", fmtInt(run.totalSteps)],
        ["Active calories", run.activeCalories ? `${run.activeCalories} kcal` : run.calories ? `${run.calories} kcal` : "—"],
      ],
    },
    {
      title: "Terrain",
      icon: <Mountain className="h-4 w-4 text-amber" />,
      rows: [
        ["Elevation gain", run.totalElevationGain != null ? `${Math.round(run.totalElevationGain)} m` : "—"],
        ["Elevation loss", run.totalElevationLoss != null ? `${Math.round(run.totalElevationLoss)} m` : "—"],
        ["Lowest point", run.minElevation != null ? `${Math.round(run.minElevation)} m` : "—"],
        ["Highest point", run.maxElevation != null ? `${Math.round(run.maxElevation)} m` : "—"],
        ["Steepest incline", run.steepestIncline ? `${run.steepestIncline.toFixed(1)}%` : "—"],
        ["Steepest decline", run.steepestDecline ? `${run.steepestDecline.toFixed(1)}%` : "—"],
        ["Terrain", run.terrainType ? titleCase(run.terrainType) : "—"],
      ],
    },
    {
      title: "Recording",
      icon: <Flame className="h-4 w-4 text-orange" />,
      rows: [
        ["Type", isWalk(run) ? "Walk" : "Run"],
        ["Session", run.workoutType ? titleCase(run.workoutType) : "—"],
        ["Device", recordingSourceLabel(run) ?? "Phone"],
        ["GPS points", String(run.routePoints?.length ?? 0)],
        ["Coaching cues", String(run.aiCoachingNotes?.length ?? 0)],
      ],
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g) => (
        <Panel key={g.title} className="panel-pad">
          <SectionTitle>
            <span className="flex items-center gap-2">
              {g.icon} {g.title}
            </span>
          </SectionTitle>
          <div className="divide-y divide-line/50">
            {g.rows.map(([k, v]) => (
              <KV key={k} label={k} value={v} />
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
