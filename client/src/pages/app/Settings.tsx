import { useEffect, useState, type ReactNode } from "react";
import { useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Bell, CreditCard, KeyRound, Loader2, LogOut, Mic, Trash2, User as UserIcon, Watch } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { fmtDate, titleCase } from "@/lib/format";
import { Avatar, Field, KV, PageHeader, Panel, Pill, ProgressBar, SectionTitle, selectClass } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_STORE_URL, GARMIN_STORE_URL, PLAY_STORE_URL } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

type Tab = "profile" | "coach" | "notifications" | "subscription" | "devices" | "account";
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "coach", label: "AI coach", icon: Mic },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "subscription", label: "Plan & usage", icon: CreditCard },
  { id: "devices", label: "Devices", icon: Watch },
  { id: "account", label: "Account", icon: KeyRound },
];

const LEVELS = ["Newcomer", "Beginner", "Casual", "Regular", "Committed", "Competitive", "Advanced", "Elite", "Professional"];
const ACCENTS = ["British", "American", "Australian", "Irish", "Scottish", "New Zealand"];
const TONES: [string, string][] = [
  ["Energetic", "High energy, upbeat encouragement"],
  ["Motivational", "Inspiring and supportive coaching"],
  ["Friendly", "Like running with your best mate"],
  ["Instructive", "Clear, detailed guidance and tips"],
  ["Tough Love", "Firm but caring — pushes you because they believe in you"],
  ["Analytical", "Deep stats nerd, data-driven insights"],
  ["Zen", "Calm, mindful, breathing-focused"],
  ["Playful", "Witty, light-hearted, uses humour"],
  ["Factual", "Straightforward stats and information"],
  ["Abrupt", "Short, direct commands"],
];
const COACH_TOGGLES: [keyof User, string, string][] = [
  ["coachPaceEnabled", "Pace coaching", "Feedback on your pace against your target"],
  ["coachNavigationEnabled", "Route navigation", "Turn-by-turn directions on routes"],
  ["coachElevationEnabled", "Hills & elevation", "Tips for climbs and descents"],
  ["coachHeartRateEnabled", "Heart rate", "Zone guidance from your watch or strap"],
  ["coachCadenceStrideEnabled", "Cadence & stride", "Form cues on step rate and stride"],
  ["coachKmSplitsEnabled", "Km splits", "A summary as you pass each split"],
  ["coachStruggleEnabled", "Struggle support", "Help when your pace drops off"],
  ["coachMotivationalEnabled", "Motivation", "Encouragement along the way"],
  ["coachHalfKmCheckInEnabled", "500 m check-in", "A quick check-in early in the run"],
];
const NOTIF: [string, string][] = [
  ["friendRequest", "Friend requests"],
  ["friendAccepted", "Friend request accepted"],
  ["groupRunInvite", "Group run invites"],
  ["groupRunStarting", "Group run starting"],
  ["liveRunInvite", "Live run invites"],
  ["liveObserverJoined", "Someone is watching your run live"],
  ["runCompleted", "Run completed"],
  ["weeklyProgress", "Weekly progress"],
  ["coachingPlanReminder", "Training plan reminders"],
];

function useSaveUser() {
  const { userId, refreshUser } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, any>) => api<User>("PUT", `/api/users/${userId}`, body),
    onSuccess: (u) => {
      if (u?.id) qc.setQueryData(["/api/users/me", userId], (old: any) => ({ ...(old ?? {}), ...u }));
      refreshUser();
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

function ProfileTab({ user }: { user: User }) {
  const save = useSaveUser();
  const [f, setF] = useState({
    name: user.name ?? "",
    dob: user.dob ? String(user.dob).slice(0, 10) : "",
    gender: user.gender ?? "",
    height: user.height ? String(user.height) : "",
    weight: user.weight ? String(user.weight) : "",
    fitnessLevel: user.fitnessLevel ?? "",
    defaultSessionType: user.defaultSessionType ?? "run",
  });
  const set = (k: keyof typeof f) => (e: any) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Panel className="panel-pad">
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={user.name} pic={user.profilePic} size={64} />
        <div>
          <div className="text-lg font-semibold text-ink">{user.name}</div>
          <div className="text-sm text-ink-3">{user.email}</div>
          <div className="mt-1 text-xs text-ink-3">Member since {fmtDate(user.createdAt)} · Change your photo in the app</div>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            name: f.name.trim(),
            dob: f.dob || null,
            gender: f.gender || null,
            height: f.height ? Number(f.height) : null,
            weight: f.weight ? Number(f.weight) : null,
            weightUnitConfirmed: f.weight ? true : undefined,
            fitnessLevel: f.fitnessLevel || null,
            defaultSessionType: f.defaultSessionType,
          });
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Name">
          <Input value={f.name} onChange={set("name")} required />
        </Field>
        <Field label="Date of birth" hint="Used for heart-rate zones">
          <Input type="date" value={f.dob} onChange={set("dob")} />
        </Field>
        <Field label="Gender">
          <select value={f.gender} onChange={set("gender")} className={selectClass}>
            <option value="">Prefer not to say</option>
            <option>Male</option>
            <option>Female</option>
            <option>Non-binary</option>
          </select>
        </Field>
        <Field label="Fitness level">
          <select value={f.fitnessLevel} onChange={set("fitnessLevel")} className={selectClass}>
            <option value="">—</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Height (cm)">
          <Input type="number" step="0.1" min="100" max="250" value={f.height} onChange={set("height")} />
        </Field>
        <Field label="Weight (kg)" hint="Used for calories">
          <Input type="number" step="0.1" min="30" max="300" value={f.weight} onChange={set("weight")} />
        </Field>
        <Field label="Default activity">
          <select value={f.defaultSessionType} onChange={set("defaultSessionType")} className={selectClass}>
            <option value="run">Running</option>
            <option value="walk">Walking</option>
          </select>
        </Field>
        <div className="flex items-end justify-end sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Save changes
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function CoachTab({ user }: { user: User }) {
  const { userId, refreshUser } = useAuth();
  const [f, setF] = useState(() => ({
    coachName: user.coachName ?? "Ai Run Coach",
    coachGender: (user.coachGender ?? "female").toLowerCase(),
    coachAccent: ACCENTS.find((a) => a.toLowerCase() === (user.coachAccent ?? "").toLowerCase()) ?? "British",
    coachTone: TONES.find(([t]) => t.toLowerCase() === (user.coachTone ?? "").toLowerCase())?.[0] ?? "Energetic",
    nicknameStyle: user.nicknameStyle ?? "occasional",
    coachKmSplitIntervalKm: user.coachKmSplitIntervalKm ?? 1,
    ...Object.fromEntries(COACH_TOGGLES.map(([k]) => [k, user[k] !== false])),
  }));
  const save = useMutation({
    mutationFn: () => api("PUT", `/api/users/${userId}/coach-settings`, f),
    onSuccess: () => {
      refreshUser();
      toast.success("Coach settings saved — they apply from your next run");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const nzMale = f.coachAccent === "New Zealand" && f.coachGender === "male";
  useEffect(() => {
    if (nzMale) setF((x) => ({ ...x, coachGender: "female" }));
  }, [nzMale]);

  return (
    <div className="space-y-4">
      <Panel className="panel-pad">
        <SectionTitle>Your coach</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Coach name">
            <Input value={f.coachName} onChange={(e) => setF((x) => ({ ...x, coachName: e.target.value }))} maxLength={30} />
          </Field>
          <Field label="Voice">
            <div className="grid grid-cols-2 gap-2">
              {["female", "male"].map((g) => (
                <button
                  key={g}
                  type="button"
                  disabled={g === "male" && f.coachAccent === "New Zealand"}
                  onClick={() => setF((x) => ({ ...x, coachGender: g }))}
                  className={cn(
                    "h-11 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40",
                    f.coachGender === g ? "border-brand bg-brand/10 text-ink" : "border-line bg-surface-2/50 text-ink-2 hover:border-line-strong",
                  )}
                >
                  {titleCase(g)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Accent" hint={f.coachAccent === "New Zealand" ? "The New Zealand voice is only available as female." : undefined}>
            <select value={f.coachAccent} onChange={(e) => setF((x) => ({ ...x, coachAccent: e.target.value }))} className={selectClass}>
              {ACCENTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          <Field label="Uses your name">
            <select value={f.nicknameStyle} onChange={(e) => setF((x) => ({ ...x, nicknameStyle: e.target.value }))} className={selectClass}>
              <option value="none">Never</option>
              <option value="occasional">Occasionally</option>
              <option value="frequent">Often</option>
            </select>
          </Field>
        </div>
        <div className="mt-5">
          <div className="mb-2 text-xs font-medium text-ink-2">Coaching tone</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {TONES.map(([t, d]) => (
              <button
                key={t}
                type="button"
                onClick={() => setF((x) => ({ ...x, coachTone: t }))}
                className={cn("rounded-xl border p-3 text-left transition-colors", f.coachTone === t ? "border-brand bg-brand/10" : "border-line bg-surface-2/50 hover:border-line-strong")}
              >
                <div className="text-sm font-semibold text-ink">{t}</div>
                <div className="text-xs text-ink-3">{d}</div>
              </button>
            ))}
          </div>
        </div>
      </Panel>
      <Panel className="panel-pad">
        <SectionTitle>During your run</SectionTitle>
        <div className="divide-y divide-line/50">
          {COACH_TOGGLES.map(([k, label, desc]) => (
            <label key={String(k)} className="flex cursor-pointer items-center justify-between gap-4 py-3">
              <div>
                <div className="text-sm font-medium text-ink">{label}</div>
                <div className="text-xs text-ink-3">{desc}</div>
              </div>
              <Switch checked={(f as any)[k]} onCheckedChange={(v) => setF((x) => ({ ...x, [k]: v }))} />
            </label>
          ))}
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className="text-sm font-medium text-ink">Split interval</div>
              <div className="text-xs text-ink-3">How often the split summary plays</div>
            </div>
            <select value={f.coachKmSplitIntervalKm} onChange={(e) => setF((x) => ({ ...x, coachKmSplitIntervalKm: Number(e.target.value) }))} className={cn(selectClass, "w-28")}>
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  Every {n} km
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />} Save coach settings
        </Button>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notif-prefs", userId], queryFn: () => api<any>("GET", `/api/notification-preferences/${userId}`) });
  const save = useMutation({
    // Only the changed flag: echoing the row back sends createdAt/updatedAt as strings, which the server rejects.
    mutationFn: (patch: Record<string, boolean>) => api("PUT", `/api/notification-preferences/${userId}`, patch),
    onMutate: (patch) => qc.setQueryData(["notif-prefs", userId], (old: any) => ({ ...(old ?? {}), ...patch })),
    onError: (e: any) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["notif-prefs", userId] });
    },
  });
  return (
    <Panel className="panel-pad">
      <SectionTitle>Push notifications</SectionTitle>
      <p className="-mt-1 mb-3 text-xs text-ink-3">Sent to the phone you run with.</p>
      <div className="divide-y divide-line/50">
        {NOTIF.map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center justify-between gap-4 py-3">
            <span className="text-sm text-ink">{label}</span>
            <Switch checked={q.data?.[k] !== false} disabled={!q.data} onCheckedChange={(v) => save.mutate({ [k]: v })} />
          </label>
        ))}
      </div>
    </Panel>
  );
}

const USAGE_LABELS: Record<string, [string, string]> = {
  aiCoachingKm: ["AI coaching", "km"],
  postRunAnalyses: ["Post-run analyses", ""],
  routesGenerated: ["Routes generated", ""],
  trainingPlansGenerated: ["Training plans", ""],
};

function SubscriptionTab({ user }: { user: User }) {
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => api<any>("GET", "/api/usage/current") });
  const tier = user.subscriptionTier ?? "free";
  const trial = user.trialExpiresAt && new Date(user.trialExpiresAt).getTime() > Date.now() && (!user.subscriptionTier || user.subscriptionTier === "free");
  return (
    <div className="space-y-4">
      <Panel className="panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Your plan</div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-ink">
              {titleCase(tier)}
              {user.subscriptionStatus && <Pill tone={user.subscriptionStatus === "active" ? "green" : "amber"}>{user.subscriptionStatus}</Pill>}
            </div>
            <div className="mt-1 text-sm text-ink-2">
              {trial
                ? `Free trial until ${fmtDate(user.trialExpiresAt)}`
                : user.entitlementExpiresAt
                  ? `Renews or ends ${fmtDate(user.entitlementExpiresAt)}`
                  : user.entitlementType
                    ? titleCase(user.entitlementType)
                    : ""}
              {user.aiPlansEnabled === false ? " · AI training plans not included" : ""}
            </div>
          </div>
          <BadgeCheck className="h-8 w-8 text-brand" />
        </div>
        <p className="mt-4 text-sm text-ink-3">
          Subscriptions are managed through the store you subscribed with — upgrade or cancel in the app, or in your{" "}
          <a className="text-brand hover:underline" href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noreferrer">
            Apple
          </a>{" "}
          or{" "}
          <a className="text-brand hover:underline" href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noreferrer">
            Google Play
          </a>{" "}
          account.
        </p>
      </Panel>
      <Panel className="panel-pad">
        <SectionTitle>This month’s usage</SectionTitle>
        {usage.data ? (
          <div className="space-y-4">
            {Object.entries(USAGE_LABELS).map(([k, [label, unit]]) => {
              const used = Number(usage.data.usage?.[k] ?? 0);
              const limit = usage.data.limits?.[k];
              return (
                <div key={k}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-ink-2">{label}</span>
                    <span className="num text-ink">
                      {Math.round(used * 10) / 10}
                      {limit != null ? ` / ${limit}` : ""} {unit}
                    </span>
                  </div>
                  <ProgressBar value={limit ? (used / limit) * 100 : 0} tone={limit && used / limit > 0.9 ? "orange" : "cyan"} />
                </div>
              );
            })}
            <p className="text-xs text-ink-3">Resets at the start of each month.</p>
          </div>
        ) : (
          <div className="text-sm text-ink-3">Loading…</div>
        )}
      </Panel>
    </div>
  );
}

function DevicesTab({ user }: { user: User }) {
  const strava = useQuery({ queryKey: ["strava-status"], queryFn: () => api<any>("GET", "/api/strava/connection-status") });
  const row = (icon: ReactNode, name: string, status: ReactNode, desc: string, action?: ReactNode) => (
    <div className="flex items-center gap-4 py-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold text-ink">
          {name} {status}
        </div>
        <div className="text-sm text-ink-3">{desc}</div>
      </div>
      {action}
    </div>
  );
  return (
    <Panel className="panel-pad">
      <SectionTitle>Watches & apps</SectionTitle>
      <div className="divide-y divide-line/50">
        {row(
          <Watch className="h-5 w-5" />,
          "Garmin",
          user.hasGarminWatchApp ? <Pill tone="green">Watch app installed</Pill> : <Pill>Not set up</Pill>,
          "Live AI coaching from your Garmin, with your watch data as the source of truth.",
          <Button asChild variant="secondary" size="sm">
            <a href={GARMIN_STORE_URL} target="_blank" rel="noreferrer">
              Connect IQ
            </a>
          </Button>,
        )}
        {row(<Watch className="h-5 w-5" />, "Apple Watch", null, "Included with the iPhone app — run from your wrist.", <Button asChild variant="secondary" size="sm"><a href={APP_STORE_URL} target="_blank" rel="noreferrer">App Store</a></Button>)}
        {row(<Watch className="h-5 w-5" />, "Galaxy Watch", null, "Included with the Android app — install it from Play on your watch.", <Button asChild variant="secondary" size="sm"><a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Google Play</a></Button>)}
        {row(
          <span className="text-lg font-black text-[#fc4c02]">S</span>,
          "Strava",
          strava.data?.connected ? <Pill tone="green">Connected</Pill> : <Pill>Not connected</Pill>,
          strava.data?.connected ? "Your runs sync with Strava." : "Connect Strava from Connected Devices in the app to import and share runs.",
        )}
      </div>
    </Panel>
  );
}

function AccountTab({ user }: { user: User }) {
  const { userId, signOut } = useAuth();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const change = useMutation({
    mutationFn: () => api("POST", "/api/auth/change-password", pw),
    onSuccess: () => {
      setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Password changed");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => api("DELETE", `/api/users/${userId}`),
    onSuccess: () => {
      toast.success("Your account has been deleted");
      signOut();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <Panel className="panel-pad">
        <SectionTitle>Change password</SectionTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.newPassword.length < 8) return toast.error("Use at least 8 characters");
            if (pw.newPassword !== pw.confirmPassword) return toast.error("The new passwords don’t match");
            change.mutate();
          }}
          className="grid gap-4 sm:grid-cols-3"
        >
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((x) => ({ ...x, currentPassword: e.target.value }))} required />
          </Field>
          <Field label="New password">
            <Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((x) => ({ ...x, newPassword: e.target.value }))} required />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" autoComplete="new-password" value={pw.confirmPassword} onChange={(e) => setPw((x) => ({ ...x, confirmPassword: e.target.value }))} required />
          </Field>
          <div className="flex justify-end sm:col-span-3">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending && <Loader2 className="animate-spin" />} Update password
            </Button>
          </div>
        </form>
      </Panel>
      <Panel className="panel-pad">
        <SectionTitle>Account</SectionTitle>
        <div className="divide-y divide-line/50">
          <KV label="Email" value={user.email} />
          <KV label="Friend code" value={user.userCode ?? "—"} />
          <KV label="Time zone" value={user.timezone ?? "—"} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
          <Button variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2 /> Delete account
          </Button>
        </div>
      </Panel>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription className="text-ink-2">
              This permanently deletes your Ai Run Coach account, every run, plan and goal, on all devices. Cancel any store subscription separately. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <Field label='Type "DELETE" to confirm'>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </Field>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep my account
            </Button>
            <Button variant="destructive" disabled={confirmText !== "DELETE" || del.isPending} onClick={() => del.mutate()}>
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const search = useSearch();
  const initial = (new URLSearchParams(search).get("tab") as Tab) || "profile";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial : "profile");
  return (
    <div>
      <PageHeader title="Profile & settings" />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                tab === t.id ? "bg-brand/10 text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {!user ? (
            <div className="text-sm text-ink-3">Loading…</div>
          ) : tab === "profile" ? (
            <ProfileTab user={user} />
          ) : tab === "coach" ? (
            <CoachTab user={user} />
          ) : tab === "notifications" ? (
            <NotificationsTab />
          ) : tab === "subscription" ? (
            <SubscriptionTab user={user} />
          ) : tab === "devices" ? (
            <DevicesTab user={user} />
          ) : (
            <AccountTab user={user} />
          )}
        </div>
      </div>
    </div>
  );
}
