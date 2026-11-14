import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CalendarRange, CheckCheck, Footprints, Radio, Trophy, UserPlus, UsersRound } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Notification } from "@/lib/types";
import { relTime } from "@/lib/format";
import { EmptyState, ErrorState, Loading, PageHeader, Panel } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";

function iconFor(type: string) {
  if (type.includes("friend")) return UserPlus;
  if (type.includes("group")) return UsersRound;
  if (type.includes("plan") || type.includes("coaching")) return CalendarRange;
  if (type.includes("live") || type.includes("observer")) return Radio;
  if (type.includes("achievement") || type.includes("goal") || type.includes("pb")) return Trophy;
  if (type.includes("run")) return Footprints;
  return Bell;
}

function targetFor(n: Notification): string | null {
  let d = n.data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      d = null;
    }
  }
  const t = n.type ?? "";
  if (d?.code && (t.includes("live") || t.includes("observer"))) return `/observe/${d.code}`;
  if (d?.groupRunId) return `/group-runs/${d.groupRunId}`;
  if (d?.runId) return `/runs/${d.runId}`;
  if (d?.planId) return `/training/${d.planId}`;
  if (t.includes("friend")) return "/friends";
  if (t.includes("group")) return "/group-runs";
  if (t.includes("goal")) return "/goals";
  return null;
}

export default function Notifications() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const q = useNotifications();
  const key = ["/api/notifications", userId];

  const markRead = useMutation({
    mutationFn: (id: string) => api("PUT", `/api/notifications/${id}/read`),
    onMutate: (id) => qc.setQueryData<Notification[]>(key, (old) => old?.map((n) => (n.id === id ? { ...n, read: true } : n))),
  });
  const markAll = useMutation({
    mutationFn: () => api("PUT", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      qc.setQueryData<Notification[]>(key, (old) => old?.map((n) => ({ ...n, read: true })));
      toast.success("All caught up");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const list = q.data ?? [];
  const unread = list.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You’re all caught up."}
        actions={
          unread > 0 ? (
            <Button variant="secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          ) : null
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Bell className="h-5 w-5" />} title="No notifications">
          Friend requests, group run invites and plan updates will show here.
        </EmptyState>
      ) : (
        <Panel className="divide-y divide-line/60 overflow-hidden">
          {list.map((n) => {
            const Icon = iconFor(n.type ?? "");
            const target = targetFor(n);
            return (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  if (target) navigate(target);
                }}
                className={cn("flex w-full gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2/50 sm:px-5", !n.read && "bg-brand/[0.04]")}
              >
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", n.read ? "bg-surface-2 text-ink-3" : "bg-brand/15 text-brand")}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn("font-semibold", n.read ? "text-ink-2" : "text-ink")}>{n.title}</span>
                    <span className="shrink-0 text-xs text-ink-3">{relTime(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">{n.message}</p>
                </div>
                {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange" />}
              </button>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
