import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Search, UserMinus, UserPlus, Users, X } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Friend, FriendRequest } from "@/lib/types";
import { relTime } from "@/lib/format";
import { Avatar, EmptyState, ErrorState, Loading, PageHeader, Panel, Pill, SectionTitle } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SearchHit = Friend & { friendRequestStatus?: string | null; friendRequestId?: string | null };

export default function Friends() {
  const { userId, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [removing, setRemoving] = useState<Friend | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const friends = useQuery({ queryKey: ["friends", userId], queryFn: () => api<Friend[]>("GET", `/api/users/${userId}/friends`), enabled: !!userId });
  const requests = useQuery({ queryKey: ["friend-requests", userId], queryFn: () => api<{ sent: FriendRequest[]; received: FriendRequest[] }>("GET", `/api/friend-requests/${userId}`), enabled: !!userId });
  const search = useQuery({
    queryKey: ["user-search", debounced],
    queryFn: () => api<SearchHit[]>("GET", `/api/users/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["friends"] });
    qc.invalidateQueries({ queryKey: ["friend-requests"] });
    qc.invalidateQueries({ queryKey: ["user-search"] });
  };
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "decline" | "withdraw" }) => api("POST", `/api/friend-requests/${id}/${action}`),
    onSuccess: (_d, v) => {
      refresh();
      toast.success(v.action === "accept" ? "You’re now friends" : v.action === "decline" ? "Request declined" : "Request withdrawn");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: (addresseeId: string) => api("POST", "/api/friend-requests", { addresseeId }),
    onSuccess: () => {
      refresh();
      toast.success("Friend request sent");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (friendId: string) => api("DELETE", `/api/friends/${userId}/${friendId}`),
    onSuccess: () => {
      refresh();
      setRemoving(null);
      toast.success("Friend removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const received = (requests.data?.received ?? []).filter((r) => r.status === "pending");
  const sent = (requests.data?.sent ?? []).filter((r) => r.status === "pending");
  const hits = (search.data ?? []).filter((h) => h.id !== userId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Friends"
        subtitle="Follow each other’s runs live, and invite friends to group runs."
        actions={
          user?.userCode ? (
            <button
              onClick={() => navigator.clipboard?.writeText(user.userCode!).then(() => toast.success("Your code is copied"))}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-2 hover:border-brand/50"
            >
              Your code <span className="num font-bold tracking-wider text-ink">{user.userCode}</span> <Copy className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />

      <Panel className="panel-pad">
        <SectionTitle>Find runners</SectionTitle>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or friend code" className="pl-10" />
        </div>
        {debounced.length >= 2 && (
          <div className="mt-3 divide-y divide-line/50">
            {search.isLoading && <div className="py-3 text-sm text-ink-3">Searching…</div>}
            {!search.isLoading && hits.length === 0 && <div className="py-3 text-sm text-ink-3">No runners found.</div>}
            {hits.map((h) => (
              <div key={h.id} className="flex items-center gap-3 py-3">
                <Avatar name={h.name} pic={h.profilePic} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{h.name}</div>
                  {h.userCode && <div className="num text-xs text-ink-3">{h.userCode}</div>}
                </div>
                {h.friendRequestStatus === "accepted" ? (
                  <Pill tone="green">Friends</Pill>
                ) : h.friendRequestStatus === "pending" ? (
                  <Pill>Pending</Pill>
                ) : (
                  <Button size="sm" onClick={() => send.mutate(h.id)} disabled={send.isPending}>
                    <UserPlus /> Add
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {received.length > 0 && (
        <section>
          <SectionTitle>Requests</SectionTitle>
          <Panel className="divide-y divide-line/60">
            {received.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-4">
                <Avatar name={r.requesterName} pic={r.requesterProfilePic} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{r.requesterName ?? "A runner"}</div>
                  <div className="text-xs text-ink-3">Sent {relTime(r.createdAt)}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: r.id, action: "decline" })} disabled={act.isPending}>
                  <X /> Decline
                </Button>
                <Button size="sm" onClick={() => act.mutate({ id: r.id, action: "accept" })} disabled={act.isPending}>
                  <Check /> Accept
                </Button>
              </div>
            ))}
          </Panel>
        </section>
      )}

      <section>
        <SectionTitle>Your friends {friends.data ? `(${friends.data.length})` : ""}</SectionTitle>
        {friends.isLoading ? (
          <Loading />
        ) : friends.isError ? (
          <ErrorState error={friends.error} onRetry={() => friends.refetch()} />
        ) : (friends.data ?? []).length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No friends yet">
            Search above, or share your friend code so others can add you.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(friends.data ?? []).map((f) => (
              <Panel key={f.id} className="flex items-center gap-3 p-4">
                <Avatar name={f.name} pic={f.profilePic} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{f.name}</div>
                  {f.userCode && <div className="num text-xs text-ink-3">{f.userCode}</div>}
                </div>
                <button onClick={() => setRemoving(f)} className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-danger" aria-label={`Remove ${f.name}`}>
                  <UserMinus className="h-4 w-4" />
                </button>
              </Panel>
            ))}
          </div>
        )}
      </section>

      {sent.length > 0 && (
        <section>
          <SectionTitle>Sent requests</SectionTitle>
          <Panel className="divide-y divide-line/60">
            {sent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-4">
                <Avatar name={r.addresseeName} pic={r.addresseeProfilePic} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{r.addresseeName ?? "Runner"}</div>
                  <div className="text-xs text-ink-3">Sent {relTime(r.createdAt)}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: r.id, action: "withdraw" })} disabled={act.isPending}>
                  Withdraw
                </Button>
              </div>
            ))}
          </Panel>
        </section>
      )}

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription className="text-ink-2">You’ll stop being friends on both sides. You can add each other again later.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => removing && remove.mutate(removing.id)} disabled={remove.isPending}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
