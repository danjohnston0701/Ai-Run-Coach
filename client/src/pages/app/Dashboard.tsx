import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarRange, Clock, Flame, Footprints, Mountain, Sparkles, Target, Trophy, UsersRound } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Goal, GroupRun, PersonalBest, Run, TrainingPlan } from "@/lib/types";
import { fmtClock, fmtDateTime, fmtHuman, fmtKm, fmtMs, fmtPace, fmtPlanDate, planDayKey, runKm, runName, runPaceSec, runSeconds, todayKey } from "@/lib/format";
import { EmptyState, Panel, ProgressBar, SectionTitle, Skeleton, StatTile } from "@/components/app/kit";
import { RunRow } from "./Runs";
import { RunMap } from "@/components/app/RunMap";
import { WorkoutBadge, workoutTitle } from "./PlanDetail";
import { validPoints } from "@/lib/series";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function useRuns(limit = 50, offset = 0) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["runs", userId, limit, offset],
    queryFn: () => api<Run[]>("GET", `/api/users/${userId}/runs?limit=${limit}&offset=${offset}`),
    enabled: !!userId,
  });
}

export function useActivePlans() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["plans", userId, "active"],
    queryFn: () => api<TrainingPlan[]>("GET", `/api/training-plans/${userId}?status=active`),
    enabled: !!userId,
  });
}

function WeekStrip({ runs }: { runs: Run[] }) {
  const start = startOfWeek();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const byDay = days.map((d) => {
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    return runs.filter((r) => r.startTime >= d.getTime() && r.startTime < next.getTime()).reduce((s, r) => s + runKm(r), 0);
  });
  const max = Math.max(5, ...byDay);
  const today = (new Date().getDay() + 6) % 7;
  return (
    <div className="flex h-24 items-end gap-2">
      {byDay.map((km, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="relative flex h-16 w-full items-end overflow-hidden rounded-lg bg-surface-2/70">
            <div
              className="w-full rounded-lg bg-gradient-to-t from-brand to-brand-green transition-all"
              style={{ height: `${km > 0 ? Math.max(10, (km / max) * 100) : 0}%` }}
              title={`${km.toFixed(1)} km`}
            />
          </div>
          <span className={`text-[11px] font-medium ${i === today ? "text-brand" : "text-ink-3"}`}>{"MTWTFSS"[i]}</span>
        </div>
      ))}
    </div>
  );
}

function LatestRun({ run }: { run: Run }) {
  const detail = useQuery({ queryKey: ["run", run.id], queryFn: () => api<Run>("GET", `/api/runs/${run.id}`) });
  const pts = detail.data ? validPoints(detail.data) : [];
  const km = runKm(run);
  return (
    <Link href={`/runs/${run.id}`} className="panel group block overflow-hidden transition-colors hover:border-brand/40">
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="relative h-56 bg-surface-2 md:h-full md:min-h-[260px]">
          {pts.length > 1 ? <RunMap points={pts} interactive={false} /> : <div className="grid h-full place-items-center text-sm text-ink-3">{detail.isLoading ? "Loading map…" : "No GPS track"}</div>}
        </div>
        <div className="flex flex-col p-5 sm:p-6">
          <div className="eyebrow">Latest {run.sessionType === "walk" ? "walk" : "run"}</div>
          <div className="mt-1.5 text-xl font-bold text-ink group-hover:text-brand">{runName(run)}</div>
          <div className="text-sm text-ink-3">{fmtDateTime(run.startTime)}</div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <StatTile label="Distance" value={fmtKm(km)} unit="km" tone="cyan" size="sm" />
            <StatTile label="Time" value={fmtClock(runSeconds(run))} tone="green" size="sm" />
            <StatTile label="Avg pace" value={fmtPace(runPaceSec(run))} unit="/km" tone="orange" size="sm" />
            <StatTile label="Avg HR" value={run.heartRate ? run.heartRate : "—"} unit={run.heartRate ? "bpm" : undefined} tone="violet" size="sm" />
          </div>
          <div className="mt-auto flex items-center gap-1 pt-5 text-sm font-semibold text-brand">
            View full summary <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function NextSession({ plan }: { plan: TrainingPlan }) {
  const details = useQuery({
    queryKey: ["plan", plan.id],
    queryFn: () => api<any>("GET", `/api/training-plans/details/${plan.id}`),
  });
  const workouts = (details.data?.weeks ?? []).flatMap((w: any) => w.workouts ?? []);
  const today = todayKey();
  const next = workouts
    .filter((w: any) => !w.isCompleted && w.status !== "skipped" && (planDayKey(w.scheduledDate) ?? "") >= today)
    .sort((a: any, b: any) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)))[0];
  const done = workouts.filter((w: any) => w.isCompleted).length;
  return (
    <Link href={`/training/${plan.id}`} className="panel panel-pad group block transition-colors hover:border-brand/40">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Training plan</div>
        <span className="text-xs text-ink-3">
          Week {plan.currentWeek ?? 1} of {plan.totalWeeks ?? "?"}
        </span>
      </div>
      <div className="mt-1.5 text-lg font-bold text-ink">{plan.goalType ? `${String(plan.goalType).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} plan` : "Your plan"}</div>
      <ProgressBar className="mt-3" value={workouts.length ? (done / workouts.length) * 100 : 0} />
      <div className="mt-1 text-xs text-ink-3">
        {done} of {workouts.length || "—"} sessions done
      </div>
      {details.isLoading ? (
        <Skeleton className="mt-4 h-20" />
      ) : next ? (
        <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-brand">{planDayKey(next.scheduledDate) === today ? "Today" : fmtPlanDate(next.scheduledDate)}</span>
            <WorkoutBadge type={next.workoutType} />
          </div>
          <div className="mt-1.5 font-semibold text-ink">{workoutTitle(next)}</div>
          <div className="mt-0.5 line-clamp-2 text-sm text-ink-2">{next.description}</div>
        </div>
      ) : (
        <div className="mt-4 text-sm text-ink-2">No upcoming sessions scheduled.</div>
      )}
    </Link>
  );
}

export default function Dashboard() {
  const { user, userId } = useAuth();
  const runs = useRuns(30);
  const plans = useActivePlans();
  const goals = useQuery({ queryKey: ["goals", userId], queryFn: () => api<Goal[]>("GET", `/api/goals/${userId}`), enabled: !!userId });
  const allTime = useQuery({ queryKey: ["my-data", "all-time"], queryFn: () => api<any>("GET", "/api/my-data/all-time-stats") });
  const pbs = useQuery({ queryKey: ["my-data", "pbs", true], queryFn: () => api<any>("GET", "/api/my-data/personal-bests") });
  const groupRuns = useQuery({ queryKey: ["group-runs"], queryFn: () => api<{ groupRuns: GroupRun[] }>("GET", "/api/group-runs") });

  const list = runs.data ?? [];
  const week = useMemo(() => {
    const s = startOfWeek().getTime();
    const wk = list.filter((r) => r.startTime >= s);
    return {
      runs: wk.length,
      km: wk.reduce((a, r) => a + runKm(r), 0),
      secs: wk.reduce((a, r) => a + runSeconds(r), 0),
      elev: wk.reduce((a, r) => a + (r.totalElevationGain ?? 0), 0),
    };
  }, [list]);

  const activeGoals = (goals.data ?? []).filter((g) => g.isActive && !g.isCompleted);
  const upcomingGroup = (groupRuns.data?.groupRuns ?? []).filter(
    (g) => g.status !== "completed" && g.status !== "cancelled" && new Date(g.plannedStartAt ?? g.dateTime ?? 0).getTime() > Date.now() - 3600_000,
  );
  const invites = (groupRuns.data?.groupRuns ?? []).filter((g) => g.myInvitationStatus === "pending");
  const at = allTime.data?.data;
  const bests: PersonalBest[] = pbs.data?.data?.personalBests ?? [];
  const firstName = (user?.name ?? "").split(" ")[0];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow mb-2">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-1.5 text-sm text-ink-2 sm:text-base">
            {week.runs > 0
              ? `${fmtKm(week.km, 1)} km across ${week.runs} ${week.runs === 1 ? "session" : "sessions"} this week. Keep it rolling.`
              : "No sessions yet this week — your coach is ready when you are."}
          </p>
        </div>
      </header>

      {/* This week */}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel className="panel-pad">
          <SectionTitle>This week</SectionTitle>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile label="Distance" value={fmtKm(week.km, 1)} unit="km" tone="cyan" size="sm" icon={<Footprints className="h-3.5 w-3.5" />} />
            <StatTile label="Time" value={fmtHuman(week.secs)} tone="green" size="sm" icon={<Clock className="h-3.5 w-3.5" />} />
            <StatTile label="Sessions" value={week.runs} tone="orange" size="sm" icon={<Flame className="h-3.5 w-3.5" />} />
            <StatTile label="Climb" value={Math.round(week.elev)} unit="m" tone="violet" size="sm" icon={<Mountain className="h-3.5 w-3.5" />} />
          </div>
          <div className="mt-5">{runs.isLoading ? <Skeleton className="h-24" /> : <WeekStrip runs={list} />}</div>
        </Panel>
        <Panel className="panel-pad">
          <SectionTitle action={<Link href="/my-data" className="text-xs font-semibold text-brand hover:underline">My Data</Link>}>All time</SectionTitle>
          {at ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Big label="Total distance" value={`${Math.round(at.totalDistanceKm).toLocaleString()}`} unit="km" />
              <Big label="Runs" value={at.totalRuns} />
              <Big label="Time on feet" value={Math.round(at.totalHours)} unit="h" />
              <Big label="Longest run" value={fmtKm(at.longestRunKm, 1)} unit="km" />
              <Big label="Best streak" value={at.mostConsecutiveRuns} unit="days" />
              <Big label="Goals achieved" value={at.goalsAchieved} />
            </div>
          ) : (
            <Skeleton className="h-40" />
          )}
        </Panel>
      </div>

      {/* Latest run + plan */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        {runs.isLoading ? (
          <Skeleton className="h-72" />
        ) : list[0] ? (
          <LatestRun run={list[0]} />
        ) : (
          <EmptyState icon={<Footprints className="h-5 w-5" />} title="No runs yet">
            Record your first run with the Ai Run Coach app on your phone or watch — it shows up here instantly.
          </EmptyState>
        )}
        <div className="space-y-4">
          {plans.data && plans.data.length > 0 ? (
            plans.data.slice(0, 1).map((p) => <NextSession key={p.id} plan={p} />)
          ) : (
            <Panel className="panel-pad">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div className="font-semibold text-ink">No active training plan</div>
              <p className="mt-1 text-sm text-ink-2">Your coach builds a plan from your recent runs and adapts it as you go.</p>
              <Link href="/training/new" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                <Sparkles className="h-4 w-4" /> Create a plan
              </Link>
            </Panel>
          )}
          {invites.length > 0 && (
            <Link href="/group-runs" className="panel panel-pad block border-orange/40 hover:border-orange/70">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange/15 text-orange">
                  <UsersRound className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-ink">
                    {invites.length} group run {invites.length === 1 ? "invite" : "invites"}
                  </div>
                  <div className="text-sm text-ink-2">Tap to respond</div>
                </div>
              </div>
            </Link>
          )}
          {upcomingGroup.length > 0 && invites.length === 0 && (
            <Link href={`/group-runs/${upcomingGroup[0].id}`} className="panel panel-pad block hover:border-brand/40">
              <div className="eyebrow">Next group run</div>
              <div className="mt-1 font-semibold text-ink">{upcomingGroup[0].name ?? upcomingGroup[0].title}</div>
              <div className="text-sm text-ink-2">{fmtDateTime(upcomingGroup[0].plannedStartAt ?? upcomingGroup[0].dateTime)}</div>
            </Link>
          )}
        </div>
      </div>

      {/* Goals + PBs */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="panel-pad">
          <SectionTitle action={<Link href="/goals" className="text-xs font-semibold text-brand hover:underline">All goals</Link>}>Goals</SectionTitle>
          {activeGoals.length === 0 ? (
            <div className="flex items-center gap-3 text-sm text-ink-2">
              <Target className="h-4 w-4 text-ink-3" /> No active goals.{" "}
              <Link href="/goals" className="font-semibold text-brand hover:underline">
                Set one
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {activeGoals.slice(0, 3).map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-ink">{g.title}</span>
                    <span className="num text-ink-3">{Math.round(g.currentProgress ?? 0)}%</span>
                  </div>
                  <ProgressBar className="mt-2" value={g.currentProgress ?? 0} />
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel className="panel-pad">
          <SectionTitle action={<Link href="/my-data" className="text-xs font-semibold text-brand hover:underline">Details</Link>}>Personal bests</SectionTitle>
          {bests.length === 0 ? (
            <div className="text-sm text-ink-2">{pbs.isLoading ? "Loading…" : "Personal bests appear once you’ve run a 1K or more."}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {bests.slice(0, 4).map((pb) => (
                <Link key={pb.category} href={`/runs/${pb.runId}`} className="rounded-xl border border-line bg-surface-2/60 p-3 hover:border-amber/50">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber">
                    <Trophy className="h-3.5 w-3.5" /> {pb.category}
                  </div>
                  <div className="num mt-1 text-xl font-bold text-ink">{fmtMs(pb.duration)}</div>
                  <div className="text-xs text-ink-3">{pb.pace}</div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Recent */}
      <section>
        <SectionTitle action={<Link href="/runs" className="text-xs font-semibold text-brand hover:underline">All runs</Link>}>Recent activity</SectionTitle>
        <Panel className="divide-y divide-line/60 overflow-hidden">
          {runs.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="m-4 h-12" />)
            : list.slice(1, 6).map((r) => <RunRow key={r.id} run={r} />)}
          {!runs.isLoading && list.length <= 1 && <div className="p-6 text-sm text-ink-3">More runs will show here.</div>}
        </Panel>
      </section>
    </div>
  );
}

function Big({ label, value, unit }: { label: string; value: any; unit?: string }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="num mt-0.5 text-2xl font-bold text-ink">
        {value ?? "—"}
        {unit && <span className="ml-1 text-sm font-medium text-ink-2">{unit}</span>}
      </div>
    </div>
  );
}
