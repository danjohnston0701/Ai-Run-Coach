import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Brain, CloudSun, Footprints, Heart, HeartPulse, Medal, Mountain, Trophy, Zap } from "lucide-react";
import { api } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { PersonalBest } from "@/lib/types";
import { fmtClock, fmtDate, fmtHuman, fmtMs, fmtPace, titleCase } from "@/lib/format";
import { Panel, PageHeader, Pill, SectionTitle, Segmented, Skeleton, StatTile } from "@/components/app/kit";
import { ChartCard } from "@/components/app/charts";
import { TrendCard } from "@/components/app/TrendCard";

const PERIODS = [
  { value: 30, label: "1M", long: "1 month" },
  { value: 90, label: "3M", long: "3 months" },
  { value: 180, label: "6M", long: "6 months" },
  { value: 365, label: "1Y", long: "1 year" },
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

const TYPE_LABELS: Record<string, string> = {
  easy_run: "Easy Run",
  easy: "Easy Run",
  long_run: "Long Run",
  tempo: "Tempo",
  intervals: "Intervals",
  hill_repeats: "Hill Repeats",
  recovery: "Recovery",
  other: "Other",
};

function CoachingSummary({ cs }: { cs: any }) {
  if (!cs?.hasCoachingSessions || !cs.sessionsThisPeriod) {
    return (
      <Panel className="panel-pad text-sm text-ink-3">
        No coaching plan sessions in this period. Start a training plan to see insights here.
      </Panel>
    );
  }
  const ib = cs.intensityBreakdown ?? { easy: 0, moderate: 0, hard: 0 };
  const total = (ib.easy ?? 0) + (ib.moderate ?? 0) + (ib.hard ?? 0);
  const trend = String(cs.progressionTrend ?? "STABLE").toUpperCase();
  const [trendIcon, trendColor] = trend === "IMPROVING" ? ["↗", "#00E676"] : trend === "DECLINING" ? ["↘", "#FF9800"] : ["→", "#00D4FF"];
  const types = Object.entries(cs.workoutTypeBreakdown ?? {}).sort((a: any, b: any) => b[1] - a[1]) as [string, number][];
  return (
    <Panel className="panel-pad space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Sessions" value={cs.sessionsThisPeriod} tone="cyan" size="sm" />
        <StatTile label="Avg / week" value={Number(cs.avgWeeklyCoachingSessions ?? 0).toFixed(1)} tone="plain" size="sm" />
        <StatTile label="Target hit" value={`${Math.round(cs.targetAchievementRate ?? 0)}%`} tone="green" size="sm" />
        <StatTile label="Avg pace" value={cs.avgPaceDisplay && cs.avgPaceDisplay !== "--" ? String(cs.avgPaceDisplay).replace(/\s*\/km$/, "") : "—"} unit={cs.avgPaceDisplay && cs.avgPaceDisplay !== "--" ? "/km" : undefined} tone="plain" size="sm" />
        <StatTile label="Distance" value={Number(cs.totalDistanceKm ?? 0).toFixed(1)} unit="km" tone="plain" size="sm" />
        <StatTile label="All time" value={cs.totalSessions} unit="sessions" tone="plain" size="sm" />
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <span className="text-2xl leading-none" style={{ color: trendColor }}>
          {trendIcon}
        </span>
        <div>
          <div className="text-sm font-semibold text-ink">Progression</div>
          <p className="mt-0.5 text-sm text-ink-2">{cs.progressionNote}</p>
        </div>
      </div>
      {total > 0 && (
        <div>
          <div className="mb-2 text-sm font-semibold text-ink">Intensity mix</div>
          <div className="flex h-3 overflow-hidden rounded-full">
            {[
              [ib.easy, "#4CAF50"],
              [ib.moderate, "#FF9800"],
              [ib.hard, "#FF5252"],
            ].map(([v, c], i) => ((v as number) > 0 ? <div key={i} style={{ width: `${((v as number) / total) * 100}%`, background: c as string }} /> : null))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-ink-2">
            <span>● <span className="text-[#4CAF50]">Easy</span> {ib.easy}</span>
            <span>● <span className="text-[#FF9800]">Moderate</span> {ib.moderate}</span>
            <span>● <span className="text-[#FF5252]">Hard</span> {ib.hard}</span>
          </div>
        </div>
      )}
      <div>
        <div className="mb-2 text-sm font-semibold text-ink">Session types</div>
        {types.length ? (
          <div className="flex flex-wrap gap-2">
            {types.map(([k, n]) => (
              <span key={k} className="rounded-full border border-line bg-surface-2/60 px-3 py-1 text-xs text-ink-2">
                {TYPE_LABELS[k] ?? titleCase(k)} <span className="num ml-1 font-semibold text-ink">{n}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-3">No session type data available.</p>
        )}
      </div>
      {cs.bestCoachingRun && (
        <Link href={`/runs/${cs.bestCoachingRun.runId}`} className="flex items-center justify-between rounded-xl border border-amber/30 bg-amber/5 p-4 hover:border-amber/60">
          <div>
            <div className="text-sm font-semibold text-amber">⭐ Best coached run</div>
            <div className="mt-0.5 text-sm text-ink-2">{fmtDate(cs.bestCoachingRun.date)}</div>
          </div>
          <div className="num text-right text-sm text-ink">
            {Number(cs.bestCoachingRun.distanceKm).toFixed(2)} km · {cs.bestCoachingRun.pace}/km
          </div>
        </Link>
      )}
    </Panel>
  );
}

export default function MyData() {
  const { userId } = useAuth();
  const [days, setDays] = useState(30);
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
  const periodLabel = PERIODS.find((p) => p.value === days)?.long ?? "";

  // HR zone gridlines, as the app draws them: max = observed max (at least 185 bpm).
  const hrMax = Math.max(185, ...((t?.hrTrend ?? []) as any[]).map((p) => Number(p.value) || 0));
  const zoneLines = [0.6, 0.7, 0.8, 0.9].map((f, i) => ({ value: Math.trunc(f * hrMax), label: `Z${i + 2}` }));
  const anyTrend = t && ["aerobicEfficiencyTrend", "paceTrend", "hrTrend", "cadenceTrend", "elevationTrend"].some((k) => (t[k] ?? []).length > 0);

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

      {/* AI coach's review */}
      {profile.data?.profile && (
        <Panel className="panel-pad border-brand/30 bg-gradient-to-br from-brand/[0.07] to-transparent">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-brand" /> Your coach’s review
            </span>
          </SectionTitle>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{profile.data.profile}</p>
          {profile.data.updatedAt && <p className="mt-3 text-xs text-ink-3">Updated {fmtDate(profile.data.updatedAt)}</p>}
        </Panel>
      )}

      {/* PBs */}
      <section>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber" /> Personal records
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
        <SectionTitle>All-time achievements</SectionTitle>
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
        <div className="sticky top-14 z-20 -mx-4 flex items-center justify-between gap-3 bg-root/85 px-4 py-2 backdrop-blur lg:top-0">
          <h2 className="text-base font-semibold text-ink sm:text-lg">Performance trends · {periodLabel}</h2>
          <Segmented value={days} onChange={setDays} options={PERIODS} />
        </div>
        {trends.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        ) : !anyTrend ? (
          <Panel className="panel-pad text-sm text-ink-3">No run data for this period. Complete a run to see your trends!</Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(t.aerobicEfficiencyTrend ?? []).length >= 2 && (
              <TrendCard
                title="Aerobic efficiency"
                icon={<HeartPulse className="h-4 w-4 text-danger" />}
                points={t.aerobicEfficiencyTrend}
                days={days}
                unit=""
                note="km/h at 100 bpm — higher = fitter. Rises as your aerobic base develops."
              />
            )}
            {(t.paceTrend ?? []).length > 0 && (
              <TrendCard
                title="Avg pace"
                icon={<Zap className="h-4 w-4 text-amber" />}
                points={t.paceTrend.map((p: any) => ({ date: p.date, value: p.value * 60 }))}
                days={days}
                unit="/km"
                invert
                format={(v) => fmtPace(v)}
              />
            )}
            {(t.hrTrend ?? []).length > 0 && (
              <TrendCard title="Avg heart rate" icon={<Heart className="h-4 w-4 text-danger" />} points={t.hrTrend} days={days} unit=" bpm" gradient={false} format={(v) => String(Math.round(v))} zoneLines={zoneLines} />
            )}
            {(t.cadenceTrend ?? []).length > 0 && (
              <TrendCard title="Avg cadence" icon={<Footprints className="h-4 w-4 text-violet" />} points={t.cadenceTrend} days={days} unit=" spm" format={(v) => String(Math.round(v))} />
            )}
            {(t.elevationTrend ?? []).length > 0 && (
              <TrendCard title="Elevation gain" icon={<Mountain className="h-4 w-4 text-amber" />} points={t.elevationTrend} days={days} unit=" m" gradient={false} format={(v) => String(Math.round(v))} />
            )}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Statistics · {periodLabel}</SectionTitle>
        {s ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Runs" value={s.totalRuns} tone="cyan" size="sm" />
            <StatTile label="Distance" value={Number(s.totalDistance).toFixed(1)} unit="km" tone="green" size="sm" />
            <StatTile label="Longest" value={Number(s.longestRun ?? 0).toFixed(1)} unit="km" tone="violet" size="sm" />
            <StatTile label="Avg pace" value={s.averagePace ? String(s.averagePace).replace("/km", "") : "—"} unit="/km" tone="orange" size="sm" />
            <StatTile label="Avg cadence" value={s.averageCadence || "—"} unit={s.averageCadence ? "spm" : undefined} tone="plain" size="sm" />
            <StatTile label="Avg HR" value={s.averageHeartRate || "—"} unit={s.averageHeartRate ? "bpm" : undefined} tone="red" size="sm" />
            <StatTile label="Elevation" value={Math.round(s.totalElevationGain ?? 0)} unit="m" tone="amber" size="sm" />
            <StatTile label="Total calories" value={Number(s.totalCalories ?? 0).toLocaleString()} tone="plain" size="sm" />
            <StatTile label="Consistency" value={`${Math.round(s.consistencyScore ?? 0)}%`} tone="plain" size="sm" hint={s.totalDuration ? `${fmtHuman(s.totalDuration / 1000)} running` : undefined} />
          </div>
        ) : (
          <Skeleton className="h-40" />
        )}
      </section>

      <section>
        <SectionTitle>Coaching plan summary · {periodLabel}</SectionTitle>
        {coaching.data ? <CoachingSummary cs={coaching.data} /> : <Skeleton className="h-40" />}
      </section>

      {userId && <FitnessChart userId={userId} />}
      {userId && <WeatherImpact userId={userId} />}
    </div>
  );
}
