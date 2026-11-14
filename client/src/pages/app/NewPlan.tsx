import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Goal } from "@/lib/types";
import { Field, PageHeader, Panel, selectClass } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const GOALS = [
  { id: "5k", label: "5K", km: 5 },
  { id: "10k", label: "10K", km: 10 },
  { id: "half_marathon", label: "Half marathon", km: 21.0975 },
  { id: "marathon", label: "Marathon", km: 42.195 },
  { id: "custom", label: "Custom", km: 0 },
];

// Same levels and wording as the apps (GeneratePlanViewModel.FITNESS_LEVELS).
const LEVELS: [string, string][] = [
  ["Newcomer", "Just getting started with running — every step counts"],
  ["Beginner", "Building a running habit, can run 1–3 km comfortably"],
  ["Casual", "Running a few times a month for fun and fitness"],
  ["Regular", "Running 2–3 times a week, comfortable at 5–10 km"],
  ["Committed", "Consistent training schedule, running 10–20 km per week"],
  ["Competitive", "Racing regularly, training with structure and goals"],
  ["Advanced", "High-mileage runner, comfortable at half marathon+"],
  ["Elite", "Sub-elite performance, racing at a high level"],
  ["Professional", "Competing or coaching at a professional level"],
];

function ageFrom(dob?: string | null) {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

function Choice({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
        active ? "border-brand bg-brand/10 text-ink" : "border-line bg-surface-2/50 text-ink-2 hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export default function NewPlan() {
  const { user, userId } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [goalType, setGoalType] = useState("5k");
  const [customKm, setCustomKm] = useState("8");
  const [hasTime, setHasTime] = useState(false);
  const [h, setH] = useState("0");
  const [m, setM] = useState("25");
  const [s, setS] = useState("0");
  const [weeks, setWeeks] = useState(10);
  const [level, setLevel] = useState(user?.fitnessLevel && LEVELS.some(([l]) => l === user.fitnessLevel) ? user.fitnessLevel : "Regular");
  const [days, setDays] = useState(4);
  const [start, setStart] = useState<"today" | "tomorrow" | "flexible">("today");
  const [activity, setActivity] = useState<"run" | "walk">(user?.defaultSessionType === "walk" ? "walk" : "run");
  const [preEvent, setPreEvent] = useState(false);
  const [goalId, setGoalId] = useState("");
  const [state, setState] = useState<{ phase: "idle" | "working" | "error"; message?: string }>({ phase: "idle" });
  const cancelled = useRef(false);
  useEffect(() => () => void (cancelled.current = true), []);

  const goals = useQuery({ queryKey: ["goals", userId], queryFn: () => api<Goal[]>("GET", `/api/goals/${userId}`), enabled: !!userId });
  const injuries = useQuery({ queryKey: ["injuries"], queryFn: () => api<any>("GET", "/api/user/injuries") });

  const follow = async (jobId: string) => {
    const started = Date.now();
    while (!cancelled.current && Date.now() - started < 9 * 60_000) {
      await new Promise((r) => setTimeout(r, 3000));
      const job = await api<{ status: string; planId?: string; error?: string }>("GET", `/api/training-plans/jobs/${jobId}`);
      if (job.status === "ready" && job.planId) return job.planId;
      if (job.status === "failed") throw new Error(job.error || "We couldn’t build your plan this time. Please try again.");
    }
    throw new Error("Your plan is still being written. Check Training in a few minutes.");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const g = GOALS.find((x) => x.id === goalType)!;
    const km = goalType === "custom" ? Number(customKm) : g.km;
    if (!km || km <= 0) return setState({ phase: "error", message: "Enter a target distance." });
    const targetTime = hasTime ? Number(h) * 3600 + Number(m) * 60 + Number(s) : 0;
    const active = [...(injuries.data?.active ?? []), ...(injuries.data?.chronic ?? [])];
    setState({ phase: "working" });
    try {
      const body = {
        goalType,
        targetDistance: km,
        targetTime: targetTime > 0 ? targetTime : null,
        targetDate: null,
        durationWeeks: weeks,
        experienceLevel: level,
        daysPerWeek: days,
        goalId: goalId || null,
        firstSessionStart: start,
        isPreEventPlan: preEvent,
        regularSessions: [],
        age: ageFrom(user?.dob),
        gender: user?.gender ?? null,
        height: user?.height ? Number(user.height) : null,
        weight: user?.weight ? Number(user.weight) : null,
        injuries: active.map((i: any) => ({ bodyPart: String(i.bodyPart ?? "").toLowerCase(), status: String(i.status ?? "").toLowerCase(), notes: i.notes ?? null, injuryDate: i.injuryDate ?? null })),
        userTimezone: user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        activityType: activity,
        async: true,
      };
      let planId: string | undefined;
      try {
        const res = await api<{ planId?: string; jobId?: string }>("POST", "/api/training-plans/generate", body);
        planId = res.planId ?? (res.jobId ? await follow(res.jobId) : undefined);
      } catch (err) {
        if (err instanceof ApiError && err.status === 429 && err.body?.jobId) planId = await follow(err.body.jobId);
        else throw err;
      }
      if (!planId) throw new Error("The server didn’t return a plan.");
      qc.invalidateQueries({ queryKey: ["plans"] });
      navigate(`/training/${planId}`);
    } catch (err) {
      const msg = err instanceof ApiError && err.body?.message ? err.body.message : err instanceof Error ? err.message : "Something went wrong.";
      setState({ phase: "error", message: msg });
    }
  };

  if (state.phase === "working") {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-green text-root shadow-[0_0_60px_-10px_rgba(0,212,255,0.7)]">
          <Sparkles className="h-7 w-7 animate-pulse" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-ink">Your coach is writing your plan</h1>
        <p className="mt-2 text-sm text-ink-2">
          It’s reading your recent runs, setting a safe starting load and checking every week against the training rules. This usually takes one to three minutes — you can leave this page and find it under Training.
        </p>
        <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/training", label: "Training" }} title="Build a training plan" subtitle="A few questions and your coach does the rest." />
      <form onSubmit={submit} className="space-y-4">
        <Panel className="panel-pad space-y-5">
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">What are you training for?</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {GOALS.map((g) => (
                <Choice key={g.id} active={goalType === g.id} onClick={() => setGoalType(g.id)} className="text-center font-semibold">
                  {g.label}
                </Choice>
              ))}
            </div>
            {goalType === "custom" && (
              <div className="mt-3 max-w-[200px]">
                <Field label="Distance (km)">
                  <Input type="number" min="1" step="0.1" value={customKm} onChange={(e) => setCustomKm(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" checked={hasTime} onChange={(e) => setHasTime(e.target.checked)} className="h-4 w-4 accent-[#00d4ff]" /> I have a target time
            </label>
            {hasTime && (
              <div className="mt-3 flex max-w-xs gap-2">
                <Field label="Hours">
                  <Input type="number" min="0" value={h} onChange={(e) => setH(e.target.value)} />
                </Field>
                <Field label="Minutes">
                  <Input type="number" min="0" max="59" value={m} onChange={(e) => setM(e.target.value)} />
                </Field>
                <Field label="Seconds">
                  <Input type="number" min="0" max="59" value={s} onChange={(e) => setS(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={preEvent} onChange={(e) => setPreEvent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#00d4ff]" />
            <span>
              <span className="font-semibold text-ink">I can already run this distance</span> — sharpen me for race day instead of building up to it.
            </span>
          </label>
          {(goals.data ?? []).filter((g) => g.isActive && !g.isCompleted).length > 0 && (
            <Field label="Link to a goal (optional)">
              <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className={selectClass}>
                <option value="">No goal</option>
                {(goals.data ?? [])
                  .filter((g) => g.isActive && !g.isCompleted)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </Panel>

        <Panel className="panel-pad">
          <div className="mb-2 text-sm font-semibold text-ink">Where are you now?</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {LEVELS.map(([l, d]) => (
              <Choice key={l} active={level === l} onClick={() => setLevel(l)}>
                <div className="font-semibold">{l}</div>
                <div className="mt-0.5 text-xs text-ink-3">{d}</div>
              </Choice>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">Your last 30 days of runs set the real starting point — this fills the gaps when there’s little history.</p>
        </Panel>

        <Panel className="panel-pad grid gap-5 sm:grid-cols-2">
          <Field label={`Days per week: ${days}`}>
            <input type="range" min={2} max={6} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-[#00d4ff]" />
          </Field>
          <Field label={`Plan length: ${weeks} weeks`}>
            <input type="range" min={4} max={24} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-full accent-[#00d4ff]" />
          </Field>
          <Field label="First session">
            <select value={start} onChange={(e) => setStart(e.target.value as any)} className={selectClass}>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="flexible">Flexible</option>
            </select>
          </Field>
          <Field label="Activity">
            <select value={activity} onChange={(e) => setActivity(e.target.value as any)} className={selectClass}>
              <option value="run">Running</option>
              <option value="walk">Walking</option>
            </select>
          </Field>
        </Panel>

        {state.phase === "error" && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{state.message}</div>}

        <div className="flex justify-end">
          <Button type="submit" size="lg">
            <Sparkles /> Build my plan
          </Button>
        </div>
      </form>
    </div>
  );
}
