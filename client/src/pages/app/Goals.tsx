import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, Flag, HeartPulse, Loader2, MoreHorizontal, Pencil, Plus, Repeat, Target, Trash2, Trophy } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Goal } from "@/lib/types";
import { fmtClock, fmtDate, titleCase } from "@/lib/format";
import { EmptyState, ErrorState, Field, Loading, PageHeader, Panel, Pill, ProgressBar, Segmented, selectClass } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const TYPES = [
  { id: "EVENT", label: "Event", desc: "A race or event on a date", icon: Flag },
  { id: "DISTANCE_TIME", label: "Distance & time", desc: "Run a distance, or in a time", icon: Target },
  { id: "HEALTH_WELLBEING", label: "Health & wellbeing", desc: "Fitness, weight, recovery", icon: HeartPulse },
  { id: "CONSISTENCY", label: "Consistency", desc: "Run regularly every week", icon: Repeat },
] as const;
const DISTANCES = ["5K", "10K", "Half Marathon", "Marathon", "Ultra Marathon"];
const HEALTH = ["Improve fitness", "Improve endurance", "Lose weight", "Injury Recovery", "Better recovery", "Build strength"];

function typeMeta(t: string) {
  return TYPES.find((x) => x.id === t) ?? TYPES[1];
}

function goalDetail(g: Goal) {
  const parts: string[] = [];
  if (g.eventName && g.type === "EVENT") parts.push(g.eventName.trim());
  if (g.eventLocation) parts.push(g.eventLocation.trim());
  if (g.distanceTarget) parts.push(g.distanceTarget);
  if (g.timeTargetSeconds) parts.push(`in ${fmtClock(g.timeTargetSeconds)}`);
  if (g.healthTarget) parts.push(g.healthTarget.trim());
  if (g.weeklyRunTarget) parts.push(`${g.weeklyRunTarget} runs a week`);
  return parts.join(" · ");
}

type FormState = {
  type: string;
  title: string;
  description: string;
  targetDate: string;
  eventName: string;
  eventLocation: string;
  distanceTarget: string;
  h: string;
  m: string;
  s: string;
  healthTarget: string;
  weeklyRunTarget: string;
  notes: string;
};

const emptyForm: FormState = { type: "DISTANCE_TIME", title: "", description: "", targetDate: "", eventName: "", eventLocation: "", distanceTarget: "", h: "", m: "", s: "", healthTarget: "", weeklyRunTarget: "", notes: "" };

function fromGoal(g: Goal): FormState {
  const t = g.timeTargetSeconds ?? 0;
  return {
    type: g.type,
    title: g.title ?? "",
    description: g.description ?? "",
    targetDate: g.targetDate ? String(g.targetDate).slice(0, 10) : "",
    eventName: g.eventName ?? "",
    eventLocation: g.eventLocation ?? "",
    distanceTarget: g.distanceTarget ?? "",
    h: t ? String(Math.floor(t / 3600)) : "",
    m: t ? String(Math.floor((t % 3600) / 60)) : "",
    s: t ? String(t % 60) : "",
    healthTarget: g.healthTarget ?? "",
    weeklyRunTarget: g.weeklyRunTarget ? String(g.weeklyRunTarget) : "",
    notes: g.notes ?? "",
  };
}

function GoalForm({ initial, editing, onClose }: { initial: FormState; editing?: Goal; onClose: () => void }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(initial);
  const set = (k: keyof FormState) => (e: any) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const save = useMutation({
    mutationFn: () => {
      const secs = (Number(f.h) || 0) * 3600 + (Number(f.m) || 0) * 60 + (Number(f.s) || 0);
      const body: any = {
        title: f.title.trim(),
        description: f.description.trim() || null,
        notes: f.notes.trim() || null,
        targetDate: f.targetDate || null,
        eventName: f.type === "EVENT" ? f.eventName.trim() || null : null,
        eventLocation: f.type === "EVENT" ? f.eventLocation.trim() || null : null,
        distanceTarget: f.type === "EVENT" || f.type === "DISTANCE_TIME" ? f.distanceTarget || null : null,
        timeTargetSeconds: (f.type === "EVENT" || f.type === "DISTANCE_TIME") && secs > 0 ? secs : null,
        healthTarget: f.type === "HEALTH_WELLBEING" ? f.healthTarget || null : null,
        weeklyRunTarget: f.type === "CONSISTENCY" ? Number(f.weeklyRunTarget) || null : null,
      };
      return editing ? api("PUT", `/api/goals/${editing.id}`, body) : api("POST", "/api/goals", { ...body, userId, type: f.type });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success(editing ? "Goal updated" : "Goal created");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.title.trim()) return toast.error("Give your goal a title");
        save.mutate();
      }}
      className="space-y-4"
    >
      {!editing && (
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setF((x) => ({ ...x, type: t.id }))}
              className={`rounded-xl border p-3 text-left transition-colors ${f.type === t.id ? "border-brand bg-brand/10" : "border-line bg-surface-2/50 hover:border-line-strong"}`}
            >
              <t.icon className={`h-4 w-4 ${f.type === t.id ? "text-brand" : "text-ink-3"}`} />
              <div className="mt-1.5 text-sm font-semibold text-ink">{t.label}</div>
              <div className="text-xs text-ink-3">{t.desc}</div>
            </button>
          ))}
        </div>
      )}
      <Field label="Title">
        <Input value={f.title} onChange={set("title")} placeholder={f.type === "EVENT" ? "e.g. Auckland Half Marathon" : "e.g. Sub-25 5K"} />
      </Field>
      {f.type === "EVENT" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Event name">
            <Input value={f.eventName} onChange={set("eventName")} />
          </Field>
          <Field label="Location">
            <Input value={f.eventLocation} onChange={set("eventLocation")} />
          </Field>
        </div>
      )}
      {(f.type === "EVENT" || f.type === "DISTANCE_TIME") && (
        <>
          <Field label="Distance">
            <select value={f.distanceTarget} onChange={set("distanceTarget")} className={selectClass}>
              <option value="">Choose…</option>
              {DISTANCES.map((d) => (
                <option key={d}>{d}</option>
              ))}
              {f.distanceTarget && !DISTANCES.includes(f.distanceTarget) && <option>{f.distanceTarget}</option>}
            </select>
          </Field>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-2">Target time (optional)</div>
            <div className="flex max-w-xs gap-2">
              <Input type="number" min="0" placeholder="h" value={f.h} onChange={set("h")} />
              <Input type="number" min="0" max="59" placeholder="min" value={f.m} onChange={set("m")} />
              <Input type="number" min="0" max="59" placeholder="s" value={f.s} onChange={set("s")} />
            </div>
          </div>
        </>
      )}
      {f.type === "HEALTH_WELLBEING" && (
        <Field label="Focus">
          <select value={f.healthTarget} onChange={set("healthTarget")} className={selectClass}>
            <option value="">Choose…</option>
            {HEALTH.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
      )}
      {f.type === "CONSISTENCY" && (
        <Field label="Runs per week">
          <Input type="number" min="1" max="14" value={f.weeklyRunTarget} onChange={set("weeklyRunTarget")} />
        </Field>
      )}
      <Field label="Target date (optional)">
        <Input type="date" value={f.targetDate} onChange={set("targetDate")} />
      </Field>
      <Field label="Notes (optional)">
        <Textarea value={f.notes} onChange={set("notes")} rows={2} />
      </Field>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />} {editing ? "Save" : "Create goal"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function GoalCard({ g, onEdit, onDelete }: { g: Goal; onEdit: () => void; onDelete: () => void }) {
  const qc = useQueryClient();
  const meta = typeMeta(g.type);
  const complete = useMutation({
    mutationFn: () => api("PUT", `/api/goals/${g.id}`, { title: g.title, isCompleted: true, isActive: false, currentProgress: 100, completedAt: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal achieved — brilliant work!");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const done = g.isCompleted;
  const daysLeft = g.targetDate ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / 86400000) : null;
  return (
    <Panel className={`flex flex-col p-5 ${done ? "border-brand-green/30" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${done ? "bg-brand-green/15 text-brand-green" : "bg-brand/10 text-brand"}`}>
          {done ? <Trophy className="h-5 w-5" /> : <meta.icon className="h-5 w-5" />}
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={done ? "green" : g.isActive ? "cyan" : "plain"}>{done ? "Achieved" : g.isActive ? meta.label : "Inactive"}</Pill>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Goal actions">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-line bg-surface">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              {!done && (
                <DropdownMenuItem onClick={() => complete.mutate()}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark achieved
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-danger focus:text-danger">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-4 text-lg font-bold text-ink">{g.title.trim()}</div>
      <div className="mt-0.5 text-sm text-ink-2">{goalDetail(g) || g.description || titleCase(g.type)}</div>
      <div className="mt-auto pt-5">
        <div className="mb-1.5 flex justify-between text-xs text-ink-3">
          <span>
            {done ? `Achieved ${fmtDate(g.completedAt ?? g.targetDate)}` : g.targetDate ? (daysLeft! >= 0 ? `${daysLeft} days to go · ${fmtDate(g.targetDate)}` : `Target date ${fmtDate(g.targetDate)}`) : "No target date"}
          </span>
          <span className="num">{Math.round(g.currentProgress ?? (done ? 100 : 0))}%</span>
        </div>
        <ProgressBar value={g.currentProgress ?? (done ? 100 : 0)} tone={done ? "green" : "cyan"} />
      </div>
    </Panel>
  );
}

export default function Goals() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<"active" | "achieved" | "all">("active");
  const [editor, setEditor] = useState<{ goal?: Goal } | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const q = useQuery({ queryKey: ["goals", userId], queryFn: () => api<Goal[]>("GET", `/api/goals/${userId}`), enabled: !!userId });
  const del = useMutation({
    mutationFn: (id: string) => api("DELETE", `/api/goals/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setDeleting(null);
      toast.success("Goal deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const goals = q.data ?? [];
  const list = goals.filter((g) => (view === "active" ? g.isActive && !g.isCompleted : view === "achieved" ? g.isCompleted : true));

  return (
    <div>
      <PageHeader
        title="Goals"
        subtitle="Races, distances, habits and health — your coach shapes its advice around them."
        actions={
          <Button onClick={() => setEditor({})}>
            <Plus /> New goal
          </Button>
        }
      />
      <Segmented
        className="mb-5"
        value={view}
        onChange={setView}
        options={[
          { value: "active", label: `Active (${goals.filter((g) => g.isActive && !g.isCompleted).length})` },
          { value: "achieved", label: `Achieved (${goals.filter((g) => g.isCompleted).length})` },
          { value: "all", label: "All" },
        ]}
      />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-5 w-5" />}
          title={view === "achieved" ? "Nothing achieved yet" : "No goals here"}
          action={
            <Button onClick={() => setEditor({})}>
              <Plus /> Set a goal
            </Button>
          }
        >
          Goals give your coach something to aim for — a race date, a time to beat or a habit to build.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((g) => (
            <GoalCard key={g.id} g={g} onEdit={() => setEditor({ goal: g })} onDelete={() => setDeleting(g)} />
          ))}
        </div>
      )}

      <Dialog open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.goal ? "Edit goal" : "New goal"}</DialogTitle>
          </DialogHeader>
          {editor && <GoalForm key={editor.goal?.id ?? "new"} initial={editor.goal ? fromGoal(editor.goal) : emptyForm} editing={editor.goal} onClose={() => setEditor(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.title?.trim()}”?</DialogTitle>
            <DialogDescription className="text-ink-2">This removes the goal on every device. It can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && del.mutate(deleting.id)} disabled={del.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
