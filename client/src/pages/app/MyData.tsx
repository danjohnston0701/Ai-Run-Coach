import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Brain, CloudSun, Medal, Trophy } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { PersonalBest } from "@/lib/types";
import { fmtClock, fmtDate, fmtHuman, fmtMs, fmtPace, titleCase } from "@/lib/format";
import { Panel, PageHeader, Pill, SectionTitle, Segmented, Skeleton, StatTile } from "@/components/app/kit";
import { ChartCard, TrendChart } from "@/components/app/charts";

const PERIODS = [
  { value: 30, label: "1M" },
  { value: 90, label: "3M" },
  { value: 180, label: "6M" },
  { value: 365, label: "1Y" },
];

const PB_ORDER = ["1K", "Mile", "5K", "10K", "Half Marathon", "Marathon"];

function useMyData<T = any>(path: string, key: any[]) {
  return useQuery({ queryKey: ["my-data", ...key], queryFn: () => api<{ success: boolean; data: T }>("GET", path).then((r) => r.data) });
}

function FitnessChart({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ["fitness-trend", userId], queryFn: () => api<any>("GET", `/api/fitness/trend/${userId}`) });
  const cur = useQuery({ queryKey: ["fitness-current", userId], queryFn: () => api<any>("GET", `/api/fitness/current/${userId}`) });
  const rows = (q.data?.trend ?? []).map((t: any) => ({ ...t, t: new Date(t.date).getTime() }));
  const c = cur.data;
  return (
    <ChartCard
      title="Fitness, fatigue & form"
      subtitle="Built from the training load of every run (CTL / ATL / TSB)."
      right={c?.status ? <Pill tone={c.status === "overtrained" ? "red" : c.status === "productive" || c.status === "optimal" ? "green" : "cyan"}>{titleCase(c.status)}</Pill> : null}
    >
      {c && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatTile label="Fitness" value={Number(c.ctl).toFixed(1)} tone="cyan" size="sm" />
          <StatTile label="Fatigue" value={Number(c.atl).toFixed(1)} tone="orange" size="sm" />
          <StatTile label="Form" value={Number(c.tsb).toFixed(1)} tone={c.tsb >= 0 ? "green" : "amber"} size="sm" />
        </div>
      )}
      {rows.length > 1 ? (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2d3748" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke="#4a5568" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" })} minTickGap={28} />
              <YAxis stroke="#4a5568" fontSize={11} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{ background: "#111827", border: "1px solid #2d3748", borderRadius: 12, fontSize: 12 }}
                labelFormatter={(v) => fmtDate(v)}
                formatter={(v: any, n: any) => [Number(v).toFixed(1), titleCase(String(n))]}
              />
              <Area type="monotone" dataKey="fitness" stroke="#00d4ff" strokeWidth={2} fill="url(#fit)" isAnimationActive={false} />
              <Line type="monotone" dataKey="fatigue" stroke="#ff6b35" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="form" stroke="#00e676" strokeWidth={2} dot={false} strokeDasharray="4 3" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-ink-3">{q.isLoading ? "Loading…" : "Not enough runs yet."}</div>
      )}
      {c?.recommendations?.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-ink-2">
          {c.recommendations.map((r: string, i: number) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

function WeatherImpact({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ["weather-impact", userId], queryFn: () => api<any>("GET", `/api/users/${userId}/weather-impact`) });
  const d = q.data;
  if (!d?.hasEnoughData) return null;
  const sections: [string, any[], string][] = [
    ["Temperature", d.temperatureAnalysis ?? [], "label"],
    ["Conditions", d.conditionAnalysis ?? [], "condition"],
    ["Time of day", d.timeOfDayAnalysis ?? [], "label"],
    ["Humidity", d.humidityAnalysis ?? [], "label"],
  ];
  return (
    <Panel className="panel-pad">
      <SectionTitle>
        <span className="flex items-center gap-2">
          <CloudSun className="h-4 w-4 text-brand" /> How conditions change your pace
        </span>
      </SectionTitle>
      <p className="-mt-1 mb-4 text-xs text-ink-3">
        From {d.runsAnalyzed} runs · overall average {fmtPace(d.overallAvgPace)}/km. Negative means faster than your average.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        {sections
          .filter(([, rows]) => rows.length)
          .map(([title, rows, key]) => (
            <div key={title}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</div>
              <div className="space-y-1.5">
                {[...rows]
                  .sort((a, b) => a.paceVsAvg - b.paceVsAvg)
                  .map((r) => {
                    const v = Number(r.paceVsAvg) || 0;
                    const w = Math.min(50, Math.abs(v) * 2);
                    return (
                      <div key={r[key] ?? r.range} className="flex items-center gap-3 text-sm">
                        <span className="w-32 shrink-0 truncate text-ink-2">{r[key] ?? r.range}</span>
                        <div className="relative h-2 flex-1 rounded-full bg-surface-3/40">
                          <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                          <div className={`absolute inset-y-0 rounded-full ${v <= 0 ? "bg-brand-green" : "bg-orange"}`} style={v <= 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }} />
                        </div>
                        <span className={`num w-14 text-right text-xs ${v <= 0 ? "text-brand-green" : "text-orange"}`}>
                          {v > 0 ? "+" : ""}
                          {v.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
      </div>
    </Panel>
  );
}

export default function MyData() {
  const { userId } = useAuth();
  const [days, setDays] = useState(90);
  const [exclude, setExclude] = useState(false);
  const ex = `excludeCoachingPlan=${exclude}`;
  const pbs = useMyData<{ personalBests: PersonalBest[] }>(`/api/my-data/personal-bests?${ex}`, ["pbs", exclude]);
  const allTime = useMyData(`/api/my-data/all-time-stats?${ex}`, ["all-time", exclude]);
  const stats = useMyData(`/api/my-data/statistics?days=${days}&${ex}`, ["stats", days, exclude]);
  const trends = useMyData(`/api/my-data/detailed-trends?days=${days}&${ex}`, ["trends", days, exclude]);
  const coaching = useMyData(`/api/my-data/coaching-summary?days=${days}`, ["coaching", days]);
  const profile = useMyData(`/api/my-data/runner-profile`, ["profile"]);

  const bests = [...(pbs.data?.personalBests ?? [])].sort((a, b) => PB_ORDER.indexOf(a.category) - PB_ORDER.indexOf(b.category));
  const at = allTime.data;
  const s = stats.data;
  const t = trends.data;
  const cs = coaching.data;

  return (
    <div className="space-y-8">
      <PageHeader
        title="My Data"
        subtitle="Personal bests, totals and how your running is trending."
        actions={
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-2">
            <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} className="h-3.5 w-3.5 accent-[#00d4ff]" />
            Exclude AI coaching plan runs
          </label>
        }
      />

      {/* PBs */}
      <section>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber" /> Personal bests
          </span>
        </SectionTitle>
        {pbs.isLoading ? (
          <Skeleton className="h-32" />
        ) : bests.length === 0 ? (
          <Panel className="panel-pad text-sm text-ink-3">Run 1 km or more and your bests appear here.</Panel>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {bests.map((pb) => (
              <Link key={pb.category} href={`/runs/${pb.runId}`} className="group rounded-2xl border border-amber/25 bg-gradient-to-br from-amber/10 to-transparent p-4 transition-colors hover:border-amber/60">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber">
                  <Medal className="h-3.5 w-3.5" /> {pb.category}
                </div>
                <div className="num mt-2 text-2xl font-bold text-ink">{fmtMs(pb.duration)}</div>
                <div className="num text-xs text-ink-2">{pb.pace}</div>
                <div className="mt-2 text-[11px] text-ink-3 group-hover:text-amber">{fmtDate(pb.date)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* All time */}
      <section>
        <SectionTitle>All time</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Runs" value={at?.totalRuns ?? "—"} tone="cyan" />
          <StatTile label="Distance" value={at ? Math.round(at.totalDistanceKm).toLocaleString() : "—"} unit="km" tone="green" />
          <StatTile label="Time" value={at ? Math.round(at.totalHours) : "—"} unit="h" tone="orange" />
          <StatTile label="Calories" value={at ? Math.round(at.totalCalories).toLocaleString() : "—"} unit="kcal" tone="red" />
          <StatTile label="Longest run" value={at ? at.longestRunKm.toFixed(1) : "—"} unit="km" tone="violet" hint={at?.longestRunTimeSec ? fmtClock(at.longestRunTimeSec) : undefined} />
          <StatTile label="Best streak" value={at?.mostConsecutiveRuns ?? "—"} unit="days" tone="amber" />
          <StatTile label="Highest climb" value={at?.highestElevationM ?? "—"} unit="m" tone="plain" />
          <StatTile label="Goals achieved" value={at?.goalsAchieved ?? "—"} tone="plain" />
        </div>
      </section>

      {/* Period */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink sm:text-lg">Trends</h2>
          <Segmented value={days} onChange={setDays} options={PERIODS} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Runs" value={s?.totalRuns ?? "—"} tone="plain" size="sm" />
          <StatTile label="Distance" value={s ? Number(s.totalDistance).toFixed(1) : "—"} unit="km" tone="plain" size="sm" />
          <StatTile label="Average pace" value={s?.averagePace ? String(s.averagePace).replace("/km", "") : "—"} unit="/km" tone="plain" size="sm" />
          <StatTile label="Consistency" value={s?.consistencyScore ?? "—"} unit="/100" tone="plain" size="sm" hint={s?.totalDuration ? `${fmtHuman(s.totalDuration / 1000)} running` : undefined} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Average pace" subtitle="Faster is higher">
            {t?.paceTrend?.length > 1 ? <TrendChart data={t.paceTrend.map((p: any) => ({ date: p.date, value: p.value * 60 }))} invert format={(v) => fmtPace(v)} unit="/km" /> : <Empty loading={trends.isLoading} />}
          </ChartCard>
          <ChartCard title="Heart rate">{t?.hrTrend?.length > 1 ? <TrendChart data={t.hrTrend} color="#ff5252" unit="bpm" /> : <Empty loading={trends.isLoading} />}</ChartCard>
          <ChartCard title="Cadence">{t?.cadenceTrend?.length > 1 ? <TrendChart data={t.cadenceTrend} color="#8b7cf6" unit="spm" /> : <Empty loading={trends.isLoading} />}</ChartCard>
          <ChartCard title="Aerobic efficiency" subtitle="Speed per heartbeat — higher is fitter">
            {t?.aerobicEfficiencyTrend?.length > 1 ? <TrendChart data={t.aerobicEfficiencyTrend} color="#00e676" format={(v) => v.toFixed(1)} /> : <Empty loading={trends.isLoading} />}
          </ChartCard>
        </div>
      </section>

      {userId && <FitnessChart userId={userId} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="panel-pad">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-brand" /> What your coach knows about you
            </span>
          </SectionTitle>
          {profile.data?.profile ? (
            <>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{profile.data.profile}</p>
              {profile.data.updatedAt && <p className="mt-3 text-xs text-ink-3">Updated {fmtDate(profile.data.updatedAt)}</p>}
            </>
          ) : (
            <p className="text-sm text-ink-3">{profile.isLoading ? "Loading…" : "Your coach builds this profile as you run."}</p>
          )}
        </Panel>
        <Panel className="panel-pad">
          <SectionTitle>AI coaching sessions</SectionTitle>
          {cs ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Sessions (period)" value={cs.sessionsThisPeriod} tone="cyan" size="sm" />
                <StatTile label="All time" value={cs.totalSessions} tone="plain" size="sm" />
                <StatTile label="Target hit rate" value={Math.round(cs.targetAchievementRate ?? 0)} unit="%" tone="green" size="sm" />
                <StatTile label="Per week" value={Number(cs.avgWeeklyCoachingSessions ?? 0).toFixed(1)} tone="plain" size="sm" />
              </div>
              {cs.progressionNote && <p className="mt-4 text-sm text-ink-2">{cs.progressionNote}</p>}
            </>
          ) : (
            <Skeleton className="h-32" />
          )}
        </Panel>
      </div>

      {userId && <WeatherImpact userId={userId} />}
    </div>
  );
}

function Empty({ loading }: { loading?: boolean }) {
  return <div className="grid h-[180px] place-items-center text-sm text-ink-3">{loading ? "Loading…" : "Not enough runs in this period."}</div>;
}
