import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Check, ChevronDown, Loader2, Pause, Play, ShieldCheck, SkipForward, Timer, X } from "lucide-react";
import { api } from "@/lib/queryClient";
import type { PlannedWorkout, PlanWeek, TrainingPlan } from "@/lib/types";
import { fmtClock, fmtDate, fmtHuman, fmtKm, fmtPace, fmtPlanDate, goalTypeLabel, planDayKey, planWorkoutName, titleCase, todayKey } from "@/lib/format";
import { ErrorState, Loading, PageHeader, Panel, Pill, ProgressBar, SectionTitle, StatTile, type Tone } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TYPE_TONE: Record<string, Tone> = {
  easy: "green",
  recovery: "green",
  long: "cyan",
  long_run: "cyan",
  tempo: "orange",
  threshold: "orange",
  interval: "red",
  intervals: "red",
  hill: "amber",
  hills: "amber",
  hill_repeats: "amber",
  orientation: "violet",
  race: "violet",
};

export function WorkoutBadge({ type }: { type?: string | null }) {
  const key = (type ?? "").toLowerCase();
  const tone = TYPE_TONE[key] ?? (key.includes("interval") ? "red" : key.includes("hill") ? "amber" : key.includes("tempo") ? "orange" : "plain");
  return <Pill tone={tone}>{titleCase(type) || "Session"}</Pill>;
}

export function workoutTitle(w: PlannedWorkout) {
  const name = w.workoutType === "orientation" ? "Orientation Run" : planWorkoutName(w.workoutType) ?? "Session";
  if (w.sessionType === "walk") return name.replace(/\bRun$/, "Walk");
  return name;
}

export function workoutSummary(w: PlannedWorkout) {
  const parts: string[] = [];
  if (w.intervalCount && (w.intervalDistanceMeters || w.intervalDurationSeconds)) {
    parts.push(`${w.intervalCount} × ${w.intervalDistanceMeters ? `${w.intervalDistanceMeters} m` : fmtHuman(w.intervalDurationSeconds)}`);
  } else if (w.distance) parts.push(`${fmtKm(w.distance, w.distance % 1 ? 1 : 0)} km`);
  if (w.duration) parts.push(fmtHuman(w.duration));
  if (w.targetPace) parts.push(`${w.targetPace}/km`);
  if (w.hrZoneNumber) parts.push(`Zone ${w.hrZoneNumber}`);
  return parts.join(" · ");
}

function workoutState(w: PlannedWorkout): "done" | "skipped" | "today" | "missed" | "upcoming" {
  if (w.isCompleted) return w.completedRunId ? "done" : "skipped";
  const k = planDayKey(w.scheduledDate);
  const t = todayKey();
  if (k === t) return "today";
  if (k && k < t) return "missed";
  return "upcoming";
}

function WorkoutRow({ w, onOpen }: { w: PlannedWorkout; onOpen: () => void }) {
  const s = workoutState(w);
  return (
    <button onClick={onOpen} className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50 sm:px-5">
      <div
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
          s === "done"
            ? "border-brand-green/50 bg-brand-green/15 text-brand-green"
            : s === "skipped"
              ? "border-line bg-surface-2 text-ink-3"
              : s === "today"
                ? "border-brand bg-brand/15 text-brand"
                : s === "missed"
                  ? "border-orange/40 text-orange"
                  : "border-line text-ink-3"
        }`}
      >
        {s === "done" ? <Check className="h-4 w-4" /> : s === "skipped" ? <SkipForward className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-semibold ${s === "skipped" ? "text-ink-3 line-through" : "text-ink"} group-hover:text-brand`}>{workoutTitle(w)}</span>
          {s === "today" && <Pill tone="cyan">Today</Pill>}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-3">
          {fmtPlanDate(w.scheduledDate)} · {workoutSummary(w) || titleCase(w.intensity)}
        </div>
      </div>
      <WorkoutBadge type={w.workoutType} />
    </button>
  );
}

function WeekCard({ week, current, onOpen }: { week: PlanWeek; current: boolean; onOpen: (w: PlannedWorkout) => void }) {
  const [open, setOpen] = useState(current);
  const done = week.workouts.filter((w) => w.isCompleted).length;
  const sorted = [...week.workouts].sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
  const [phase, ...rest] = (week.weekDescription ?? "").split(" — ");
  return (
    <Panel className={current ? "border-brand/40" : ""}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-center ${current ? "bg-brand text-root" : "bg-surface-2 text-ink"}`}>
          <div>
            <div className="text-[9px] font-bold uppercase leading-none opacity-70">Week</div>
            <div className="num text-lg font-bold leading-tight">{week.weekNumber}</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{rest.length ? phase : week.focusArea ?? `Week ${week.weekNumber}`}</span>
            {current && <Pill tone="cyan">This week</Pill>}
          </div>
          <div className="mt-0.5 line-clamp-1 text-sm text-ink-2">{rest.length ? rest.join(" — ") : week.weekDescription}</div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="num text-sm font-semibold text-ink">{week.totalDistance ? `${fmtKm(week.totalDistance, 1)} km` : "—"}</div>
          <div className="text-xs text-ink-3">
            {done}/{week.workouts.length} done
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="divide-y divide-line/50 border-t border-line/60">{sorted.map((w) => <WorkoutRow key={w.id} w={w} onOpen={() => onOpen(w)} />)}</div>}
    </Panel>
  );
}

function WorkoutDialog({ w, planId, editable, onClose }: { w: PlannedWorkout | null; planId: string; editable: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const coaching = useQuery({
    queryKey: ["coaching-plan", w?.id],
    queryFn: () => api<any>("GET", `/api/workouts/${w!.id}/coaching-plan`),
    enabled: !!w,
    retry: false,
  });
  const skip = useMutation({
    mutationFn: () => api("PUT", `/api/training-plans/workouts/${w!.id}/skip`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan", planId] });
      toast.success("Session skipped");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  if (!w) return null;
  const s = workoutState(w);
  const plan = coaching.data?.plan;
  return (
    <Dialog open={!!w} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <WorkoutBadge type={w.workoutType} />
            <span className="text-xs text-ink-3">{fmtPlanDate(w.scheduledDate, { weekday: "long", day: "numeric", month: "long" })}</span>
          </div>
          <DialogTitle className="text-2xl">{workoutTitle(w)}</DialogTitle>
          {w.description && <DialogDescription className="text-ink-2">{w.description}</DialogDescription>}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {w.distance ? <StatTile label="Distance" value={fmtKm(w.distance, w.distance % 1 ? 1 : 0)} unit="km" tone="cyan" size="sm" /> : null}
          {w.duration ? <StatTile label="Duration" value={fmtHuman(w.duration)} tone="green" size="sm" /> : null}
          {w.targetPace ? <StatTile label="Target pace" value={w.targetPace} unit="/km" tone="orange" size="sm" /> : null}
          {w.hrZoneNumber ? (
            <StatTile label="Heart rate" value={`Z${w.hrZoneNumber}`} tone="red" size="sm" hint={w.hrZoneMinBpm && w.hrZoneMaxBpm ? `${w.hrZoneMinBpm}–${w.hrZoneMaxBpm} bpm` : undefined} />
          ) : null}
        </div>

        {w.intervalCount ? (
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-ink">
              <Timer className="h-4 w-4 text-brand" /> Intervals
            </div>
            <div className="text-ink-2">
              {w.intervalCount} × {w.intervalDistanceMeters ? `${w.intervalDistanceMeters} m` : fmtHuman(w.intervalDurationSeconds)}
              {w.intervalTargetPace ? ` at ${w.intervalTargetPace}/km` : ""}
              {(w.restDistanceMeters || w.restDurationSeconds) && `, ${w.restDistanceMeters ? `${w.restDistanceMeters} m` : fmtHuman(w.restDurationSeconds)} recovery`}
              {w.restTargetPace ? ` at ${w.restTargetPace}/km` : ""}
            </div>
          </div>
        ) : null}

        {w.instructions && (
          <div>
            <div className="eyebrow mb-1.5">How to run it</div>
            <p className="text-sm leading-relaxed text-ink-2">{w.instructions}</p>
          </div>
        )}

        <div>
          <div className="eyebrow mb-2">Your coach’s session plan</div>
          {coaching.isLoading ? (
            <div className="text-sm text-ink-3">Loading…</div>
          ) : plan ? (
            <div className="space-y-3">
              {plan.whyThisSession && <p className="text-sm leading-relaxed text-ink">{plan.whyThisSession}</p>}
              {plan.preRunBrief && <blockquote className="rounded-xl border-l-2 border-brand bg-surface-2/40 px-4 py-3 text-sm italic text-ink-2">“{plan.preRunBrief}”</blockquote>}
              <ol className="space-y-2">
                {(plan.phases ?? []).map((p: any, i: number) => (
                  <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
                    <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">{i + 1}</span>
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold text-ink">
                        {titleCase(p.name)}
                        {p.repetitions > 1 ? ` × ${p.repetitions}` : ""}
                      </div>
                      <div className="text-xs text-ink-3">
                        {[
                          p.distanceKm ? `${p.distanceKm} km` : p.durationMinutes ? `${p.durationMinutes} min` : null,
                          p.targetPaceMin && p.targetPaceMax ? `${fmtPace(p.targetPaceMin)}–${fmtPace(p.targetPaceMax)}/km` : null,
                          p.targetHRMin && p.targetHRMax ? `${p.targetHRMin}–${p.targetHRMax} bpm` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {p.phaseInstructions && <div className="mt-1 text-ink-2">{p.phaseInstructions}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-sm text-ink-3">Your coach builds the full phase-by-phase plan the first time you open this session in the app.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {w.completedRunId ? (
            <Button asChild variant="secondary">
              <Link href={`/runs/${w.completedRunId}`}>View the run</Link>
            </Button>
          ) : (
            <span className="text-xs text-ink-3">{s === "upcoming" || s === "today" ? "Start this session from the app on your phone or watch." : ""}</span>
          )}
          {!w.isCompleted && editable && (
            <Button variant="outline" onClick={() => skip.mutate()} disabled={skip.isPending}>
              {skip.isPending ? <Loader2 className="animate-spin" /> : <SkipForward />} Skip session
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlanDetail() {
  const { planId } = useParams<{ planId: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState<PlannedWorkout | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const q = useQuery({ queryKey: ["plan", planId], queryFn: () => api<{ plan: TrainingPlan; weeks: PlanWeek[]; performanceBaseline?: any }>("GET", `/api/training-plans/details/${planId}`) });

  const setStatus = useMutation({
    mutationFn: (status: string) => api("PUT", `/api/training-plans/${planId}/status`, { status }),
    onSuccess: (_d, status) => {
      qc.invalidateQueries({ queryKey: ["plan", planId] });
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast.success(status === "paused" ? "Plan paused" : status === "active" ? "Plan resumed" : "Plan ended");
      if (status === "cancelled") navigate("/training");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const weeks = useMemo(() => [...(q.data?.weeks ?? [])].sort((a, b) => a.weekNumber - b.weekNumber), [q.data]);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const { plan, performanceBaseline: base } = q.data;
  const all = weeks.flatMap((w) => w.workouts);
  const done = all.filter((w) => w.isCompleted && w.completedRunId).length;
  const today = todayKey();
  const currentWeek =
    weeks.find((w) => w.workouts.some((x) => (planDayKey(x.scheduledDate) ?? "") >= today))?.weekNumber ?? plan.currentWeek ?? 1;
  let disclaimer: any = null;
  try {
    disclaimer = plan.safetyDisclaimer ? JSON.parse(plan.safetyDisclaimer) : null;
  } catch {
    /* plain text */
  }

  return (
    <div>
      <PageHeader
        back={{ href: "/training", label: "Training" }}
        eyebrow={`${titleCase(plan.status)} plan · started ${fmtDate(plan.createdAt)}`}
        title={`${goalTypeLabel(plan.goalType)}${plan.targetDistance && plan.goalType === "custom" ? ` · ${plan.targetDistance} km` : ""} plan`}
        subtitle={[
          plan.targetTime ? `Target ${fmtClock(plan.targetTime)}` : null,
          plan.targetDate ? `Race day ${fmtPlanDate(plan.targetDate, { day: "numeric", month: "long", year: "numeric" })}` : null,
          `${plan.daysPerWeek ?? "?"} days a week`,
          plan.experienceLevel,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {plan.status === "active" && (
              <Button variant="secondary" onClick={() => setStatus.mutate("paused")} disabled={setStatus.isPending}>
                <Pause /> Pause
              </Button>
            )}
            {plan.status === "paused" && (
              <Button onClick={() => setStatus.mutate("active")} disabled={setStatus.isPending}>
                <Play /> Resume
              </Button>
            )}
            {(plan.status === "active" || plan.status === "paused") && (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                <X /> End plan
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="panel-pad">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Progress</div>
              <div className="num mt-1 text-3xl font-bold text-ink">
                {done}
                <span className="text-lg text-ink-3">/{all.length} sessions</span>
              </div>
            </div>
            <div className="text-right text-sm text-ink-2">
              Week {currentWeek} of {plan.totalWeeks}
              {plan.generatedThroughWeek && plan.generatedThroughWeek < (plan.totalWeeks ?? 0) && (
                <div className="text-xs text-ink-3">Weeks {plan.generatedThroughWeek + 1}+ are written as you go</div>
              )}
            </div>
          </div>
          <ProgressBar className="mt-4" value={all.length ? (done / all.length) * 100 : 0} />
          <div className="mt-4 flex gap-1">
            {Array.from({ length: plan.totalWeeks ?? weeks.length }, (_, i) => i + 1).map((n) => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${n < currentWeek ? "bg-brand-green/70" : n === currentWeek ? "bg-brand" : "bg-surface-3/50"}`} title={`Week ${n}`} />
            ))}
          </div>
        </Panel>
        {base?.hasHistory ? (
          <Panel className="panel-pad">
            <div className="eyebrow mb-3">Built from your running</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-ink-3">Runs analysed</div>
                <div className="num font-semibold text-ink">{base.runsRecorded}</div>
              </div>
              <div>
                <div className="text-ink-3">Per week</div>
                <div className="num font-semibold text-ink">{base.runsPerWeek}</div>
              </div>
              <div>
                <div className="text-ink-3">Average run</div>
                <div className="num font-semibold text-ink">{base.avgDistance ? `${fmtKm(Number(base.avgDistance), 1)} km` : "—"}</div>
              </div>
              <div>
                <div className="text-ink-3">Longest</div>
                <div className="num font-semibold text-ink">{base.longestRun ? `${fmtKm(Number(base.longestRun), 1)} km` : "—"}</div>
              </div>
            </div>
          </Panel>
        ) : null}
      </div>

      <SectionTitle>Schedule</SectionTitle>
      <div className="space-y-3">
        {weeks.map((w) => (
          <WeekCard key={w.id} week={w} current={w.weekNumber === currentWeek} onOpen={setOpen} />
        ))}
      </div>

      {disclaimer && (
        <Panel className="panel-pad mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-brand-green" /> Train safely
          </div>
          {disclaimer.stopCriteria?.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Stop and rest if</div>
              <ul className="ml-4 list-disc space-y-1 text-sm text-ink-2">
                {disclaimer.stopCriteria.map((t: string, i: number) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {disclaimer.disclaimer && <p className="mt-3 text-xs leading-relaxed text-ink-3">{disclaimer.disclaimer}</p>}
        </Panel>
      )}

      <WorkoutDialog w={open} planId={planId} editable={plan.status === "active" || plan.status === "paused"} onClose={() => setOpen(null)} />

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this plan?</DialogTitle>
            <DialogDescription className="text-ink-2">Your completed sessions stay in your history. Remaining sessions are cancelled and your coach stops scheduling new ones.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep training
            </Button>
            <Button variant="destructive" onClick={() => setStatus.mutate("cancelled")} disabled={setStatus.isPending}>
              End plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

