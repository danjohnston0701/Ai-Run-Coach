import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Check, Copy, Footprints, LogOut, MapPin, Trash2, UserPlus, X } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Friend, GroupRun } from "@/lib/types";
import { fmtDateTime, titleCase } from "@/lib/format";
import { Avatar, ErrorState, Loading, PageHeader, Panel, Pill, SectionTitle, StatTile } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { groupRunTime, useRespond } from "./GroupRuns";
import { Leaderboard } from "./RunDetail";

export default function GroupRunDetail() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  const q = useQuery({ queryKey: ["group-run", id], queryFn: () => api<GroupRun>("GET", `/api/group-runs/${id}`) });
  const g = q.data;
  const finished = g?.status === "completed" || (g && new Date(groupRunTime(g) ?? 0).getTime() < Date.now() - 3600_000);
  const results = useQuery({ queryKey: ["group-results", id], queryFn: () => api<any>("GET", `/api/group-runs/${id}/results`), enabled: !!finished, retry: false });
  const respond = useRespond(id);
  const friends = useQuery({ queryKey: ["friends", userId], queryFn: () => api<Friend[]>("GET", `/api/users/${userId}/friends`), enabled: inviting && !!userId });
  const [picked, setPicked] = useState<string[]>([]);

  const invite = useMutation({
    mutationFn: () => api("POST", `/api/group-runs/${id}/invite`, { userIds: picked }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-run", id] });
      setInviting(false);
      setPicked([]);
      toast.success("Invites sent");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const leaveOrDelete = useMutation({
    mutationFn: (kind: "leave" | "delete") => api("DELETE", kind === "leave" ? `/api/group-runs/${id}/leave` : `/api/group-runs/${id}`),
    onSuccess: (_d, kind) => {
      qc.invalidateQueries({ queryKey: ["group-runs"] });
      toast.success(kind === "leave" ? "You’ve left this group run" : "Group run cancelled");
      navigate("/group-runs");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !g) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const participants = g.participants ?? [];
  const accepted = participants.filter((p) => p.invitationStatus === "accepted");
  const pending = participants.filter((p) => p.invitationStatus === "pending");
  const already = new Set(participants.map((p) => p.userId));

  return (
    <div>
      <PageHeader
        back={{ href: "/group-runs", label: "Group Runs" }}
        eyebrow={g.isOrganiser ? "You’re hosting" : g.creatorName ? `Hosted by ${g.creatorName}` : undefined}
        title={g.name ?? g.title ?? "Group run"}
        subtitle={g.description && g.description !== "None" ? g.description : undefined}
        actions={
          g.myInvitationStatus === "pending" ? (
            <>
              <Button variant="ghost" onClick={() => respond.mutate("declined")}>
                <X /> Decline
              </Button>
              <Button onClick={() => respond.mutate("accepted")}>
                <Check /> Join
              </Button>
            </>
          ) : !finished ? (
            <>
              {g.isOrganiser && (
                <Button variant="secondary" onClick={() => setInviting(true)}>
                  <UserPlus /> Invite friends
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirm(g.isOrganiser ? "delete" : "leave")}>
                {g.isOrganiser ? <Trash2 /> : <LogOut />} {g.isOrganiser ? "Cancel run" : "Leave"}
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="When" value={<span className="text-lg">{fmtDateTime(groupRunTime(g))}</span>} tone="cyan" icon={<CalendarClock className="h-3.5 w-3.5" />} />
        <StatTile label="Distance" value={g.distance ?? "—"} unit="km" tone="green" icon={<Footprints className="h-3.5 w-3.5" />} />
        <StatTile label="Runners" value={accepted.length} unit={g.maxParticipants ? `of ${g.maxParticipants}` : undefined} tone="orange" />
        <StatTile label="Status" value={<span className="text-lg">{titleCase(g.status ?? "scheduled")}</span>} tone="violet" />
      </div>

      {g.meetingPoint && g.meetingPoint !== "None" && (
        <Panel className="panel-pad mb-6 flex items-center gap-3">
          <MapPin className="h-5 w-5 text-brand" />
          <div>
            <div className="text-xs text-ink-3">Meeting point</div>
            <div className="font-medium text-ink">{g.meetingPoint}</div>
          </div>
        </Panel>
      )}

      {finished && (
        <section className="mb-8">
          <SectionTitle>Results</SectionTitle>
          {results.isLoading ? <Loading /> : <Leaderboard results={results.data?.results ?? []} />}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="panel-pad">
          <SectionTitle>Going ({accepted.length})</SectionTitle>
          <ul className="space-y-3">
            {accepted.map((p) => (
              <li key={p.userId} className="flex items-center gap-3">
                <Avatar name={p.userName} pic={p.profilePic} size={36} />
                <span className="flex-1 font-medium text-ink">{p.userName}</span>
                {p.userId === g.creatorId && <Pill tone="violet">Host</Pill>}
                {p.userId === userId && <Pill tone="cyan">You</Pill>}
              </li>
            ))}
            {accepted.length === 0 && <li className="text-sm text-ink-3">No one yet.</li>}
          </ul>
        </Panel>
        <Panel className="panel-pad">
          <SectionTitle>Invited ({pending.length})</SectionTitle>
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 opacity-80">
                <Avatar name={p.userName} pic={p.profilePic} size={36} />
                <span className="flex-1 text-ink-2">{p.userName}</span>
                <Pill>Pending</Pill>
              </li>
            ))}
            {pending.length === 0 && <li className="text-sm text-ink-3">No pending invites.</li>}
          </ul>
          {g.inviteToken && g.isOrganiser && !finished && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(g.inviteToken!).then(() => toast.success("Invite code copied"));
              }}
              className="mt-5 flex w-full items-center justify-between rounded-xl border border-dashed border-line-strong/70 px-4 py-3 text-sm hover:border-brand/60"
            >
              <span className="text-ink-2">
                Invite code <span className="num ml-1 font-bold tracking-wider text-ink">{g.inviteToken}</span>
              </span>
              <Copy className="h-4 w-4 text-ink-3" />
            </button>
          )}
        </Panel>
      </div>

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite friends</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {(friends.data ?? [])
              .filter((f) => !already.has(f.id))
              .map((f) => {
                const on = picked.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => setPicked((x) => (on ? x.filter((i) => i !== f.id) : [...x, f.id]))}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${on ? "bg-brand/10" : "hover:bg-surface-2"}`}
                  >
                    <Avatar name={f.name} pic={f.profilePic} size={32} />
                    <span className="flex-1 text-sm font-medium text-ink">{f.name}</span>
                    {on && <Check className="h-4 w-4 text-brand" />}
                  </button>
                );
              })}
            {friends.data && friends.data.filter((f) => !already.has(f.id)).length === 0 && <p className="py-4 text-sm text-ink-3">All your friends are already invited.</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setInviting(false)}>
              Cancel
            </Button>
            <Button onClick={() => invite.mutate()} disabled={!picked.length || invite.isPending}>
              Send {picked.length || ""} invite{picked.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "delete" ? "Cancel this group run?" : "Leave this group run?"}</DialogTitle>
            <DialogDescription className="text-ink-2">{confirm === "delete" ? "Everyone invited will see it’s been cancelled." : "You can be invited again later."}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button variant="destructive" onClick={() => confirm && leaveOrDelete.mutate(confirm)} disabled={leaveOrDelete.isPending}>
              {confirm === "delete" ? "Cancel run" : "Leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
