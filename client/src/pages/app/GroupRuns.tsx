import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Check, ChevronRight, Loader2, Plus, UsersRound, X } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Friend, GroupRun } from "@/lib/types";
import { fmtDateTime, titleCase } from "@/lib/format";
import { Avatar, EmptyState, ErrorState, Field, Loading, PageHeader, Panel, Pill, SectionTitle } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function groupRunTime(g: GroupRun) {
  return g.plannedStartAt ?? g.dateTime ?? null;
}

export function useRespond(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (response: "accepted" | "declined") => api("POST", `/api/group-runs/${id}/respond`, { response }),
    onSuccess: (_d, r) => {
      qc.invalidateQueries({ queryKey: ["group-runs"] });
      qc.invalidateQueries({ queryKey: ["group-run", id] });
      toast.success(r === "accepted" ? "You’re in! See you there." : "Invite declined");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

function InviteCard({ g }: { g: GroupRun }) {
  const respond = useRespond(g.id);
  return (
    <Panel className="flex flex-col gap-4 border-orange/40 p-5 sm:flex-row sm:items-center">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange/15 text-orange">
        <UsersRound className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">
          {g.creatorName ?? "A friend"} invited you to <span className="text-brand">{g.name ?? g.title}</span>
        </div>
        <div className="mt-0.5 text-sm text-ink-2">
          {fmtDateTime(groupRunTime(g))}
          {g.distance ? ` · ${g.distance} km` : ""}
          {g.meetingPoint ? ` · ${g.meetingPoint}` : ""}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => respond.mutate("declined")} disabled={respond.isPending}>
          <X /> Decline
        </Button>
        <Button onClick={() => respond.mutate("accepted")} disabled={respond.isPending}>
          <Check /> Join
        </Button>
      </div>
    </Panel>
  );
}

function GroupRow({ g }: { g: GroupRun }) {
  const d = new Date(groupRunTime(g) ?? 0);
  const accepted = (g.participants ?? []).filter((p) => p.invitationStatus === "accepted");
  return (
    <Link href={`/group-runs/${g.id}`} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-2/50 sm:px-5">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-line bg-surface-2/70 py-1.5">
        <span className="text-[10px] font-semibold uppercase text-ink-3">{d.toLocaleDateString(undefined, { month: "short" })}</span>
        <span className="num text-lg font-bold leading-none text-ink">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-ink group-hover:text-brand">{g.name ?? g.title}</span>
          {g.isOrganiser && <Pill tone="violet">Host</Pill>}
          {g.status && g.status !== "pending" && g.status !== "scheduled" && <Pill tone={g.status === "completed" ? "green" : g.status === "active" ? "orange" : "plain"}>{titleCase(g.status)}</Pill>}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-3">
          {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          {g.distance ? ` · ${g.distance} km` : ""}
          {g.meetingPoint ? ` · ${g.meetingPoint}` : ""}
        </div>
      </div>
      <div className="hidden -space-x-2 sm:flex">
        {accepted.slice(0, 4).map((p) => (
          <Avatar key={p.userId} name={p.userName} pic={p.profilePic} size={28} className="ring-2 ring-surface" />
        ))}
      </div>
      <ChevronRight className="h-4 w-4 text-ink-3 group-hover:text-brand" />
    </Link>
  );
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [when, setWhen] = useState("");
  const [distance, setDistance] = useState("5");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [invite, setInvite] = useState<string[]>([]);
  const friends = useQuery({ queryKey: ["friends", userId], queryFn: () => api<Friend[]>("GET", `/api/users/${userId}/friends`), enabled: open && !!userId });
  const create = useMutation({
    mutationFn: async () => {
      const g = await api<any>("POST", "/api/group-runs", {
        name: name.trim(),
        description: description.trim(),
        meetingPoint: meetingPoint.trim() || null,
        meetingLat: null,
        meetingLng: null,
        distance: Number(distance),
        dateTime: new Date(when).toISOString(),
        maxParticipants: 10,
        isPublic: true,
      });
      const id = g?.id ?? g?.groupRun?.id;
      if (id && invite.length) await api("POST", `/api/group-runs/${id}/invite`, { userIds: invite });
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["group-runs"] });
      toast.success("Group run created");
      onClose();
      if (id) navigate(`/group-runs/${id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const minWhen = new Date(Date.now() + 15 * 60_000);
  const minStr = new Date(minWhen.getTime() - minWhen.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New group run</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !when || !Number(distance)) return toast.error("Add a name, a time and a distance");
            create.mutate();
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Saturday long run" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date & time">
              <Input type="datetime-local" min={minStr} value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <Field label="Distance (km)">
              <Input type="number" min="0.5" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} />
            </Field>
          </div>
          <Field label="Meeting point (optional)">
            <Input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} placeholder="Town Basin car park" />
          </Field>
          <Field label="Description (optional)">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {(friends.data ?? []).length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-ink-2">Invite friends</div>
              <div className="flex flex-wrap gap-2">
                {(friends.data ?? []).map((f) => {
                  const on = invite.includes(f.id);
                  return (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => setInvite((x) => (on ? x.filter((i) => i !== f.id) : [...x, f.id]))}
                      className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${on ? "border-brand bg-brand/10 text-ink" : "border-line text-ink-2 hover:border-line-strong"}`}
                    >
                      <Avatar name={f.name} pic={f.profilePic} size={24} /> {f.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />} Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupRuns() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ["group-runs"], queryFn: () => api<{ groupRuns: GroupRun[] }>("GET", "/api/group-runs") });
  const all = q.data?.groupRuns ?? [];
  const now = Date.now();
  const invites = all.filter((g) => g.myInvitationStatus === "pending" && new Date(groupRunTime(g) ?? 0).getTime() > now - 3600_000);
  const mine = all.filter((g) => g.myInvitationStatus !== "pending" && g.myInvitationStatus !== "declined");
  const upcoming = mine
    .filter((g) => g.status !== "completed" && g.status !== "cancelled" && new Date(groupRunTime(g) ?? 0).getTime() > now - 3 * 3600_000)
    .sort((a, b) => String(groupRunTime(a)).localeCompare(String(groupRunTime(b))));
  const past = mine.filter((g) => !upcoming.includes(g)).sort((a, b) => String(groupRunTime(b)).localeCompare(String(groupRunTime(a))));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Group Runs"
        subtitle="Run together, wherever you are — everyone’s coached live, with a shared leaderboard at the finish."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New group run
          </Button>
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          {invites.length > 0 && (
            <section className="space-y-3">
              <SectionTitle>Invitations</SectionTitle>
              {invites.map((g) => (
                <InviteCard key={g.id} g={g} />
              ))}
            </section>
          )}
          <section>
            <SectionTitle>Upcoming</SectionTitle>
            {upcoming.length ? (
              <Panel className="divide-y divide-line/60 overflow-hidden">
                {upcoming.map((g) => (
                  <GroupRow key={g.id} g={g} />
                ))}
              </Panel>
            ) : (
              <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="Nothing planned" action={<Button variant="secondary" onClick={() => setCreating(true)}><Plus /> Plan one</Button>}>
                Pick a time and invite friends. On the day, everyone starts from the app and runs with their own coach.
              </EmptyState>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <SectionTitle>Past</SectionTitle>
              <Panel className="divide-y divide-line/60 overflow-hidden">
                {past.map((g) => (
                  <GroupRow key={g.id} g={g} />
                ))}
              </Panel>
            </section>
          )}
        </>
      )}
      <CreateDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
