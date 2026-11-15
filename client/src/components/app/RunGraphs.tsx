import { useMemo, useState, type ReactNode } from "react";
import { Activity, CloudSun, Flame, Footprints, Gauge, Heart, Microscope, Mountain, Timer, TrendingDown, Trophy } from "lucide-react";
import type { Run } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fmtClock, fmtPace, runPaceSec } from "@/lib/format";
import { buildSeries } from "@/lib/series";
import {
  ageFromDob,
  cadenceQuality,
  consistencyFraction,
  decoupling,
  economy,
  effortScore,
  fatigue,
  hrPacePoints,
  hrZoneOf,
  intensity,
  isWalkingPace,
  optimalCadence,
  Q,
  regression,
  riegel,
  tanakaMaxHr,
  WALK_CADENCE,
  weatherIndex,
} from "@/lib/analytics";
import { ChartCard, Donut, DualAxisChart, HrPaceScatter, MetricAreaChart, ScoreRing } from "./charts";
import { Panel, Segmented, SectionTitle } from "./kit";

export function useRunner() {
  const { user } = useAuth();
  return {
    age: ageFromDob(user?.dob),
    heightCm: user?.height ? Number(user.height) || null : null,
    weightKg: user?.weight ? Number(user.weight) || null : null,
  };
}

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function Rating({ text, color }: { text: string; color: string }) {
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color, background: `${color}1f` }}>
      {text}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="num mt-0.5 text-lg font-bold" style={{ color: color ?? "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function Header({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mb-4 mt-10 flex items-center gap-2 text-lg font-bold text-ink first:mt-0">
      {icon}
      {children}
    </h3>
  );
}

/* ── Run score rings ──────────────────────────────────────────────────────── */

function RunScore({ run }: { run: Run }) {
  const { age, heightCm, weightKg } = useRunner();
  const effort = effortScore(run, age);
  const maxHr = tanakaMaxHr(age);
  const hrSeries = (run.heartRateData ?? []).filter((h) => h > 0);
  const avgHr = hrSeries.length ? Math.round(hrSeries.reduce((a, b) => a + b, 0) / hrSeries.length) : Number(run.heartRate) || 0;
  const hasHr = (Number(run.heartRate) || 0) > 0;
  const zone = hasHr ? hrZoneOf(avgHr, maxHr) : null;
  const zoneColor = zone === 2 ? Q.excellent : zone === 3 ? Q.good : zone === 1 ? Q.average : zone === 4 ? Q.caution : Q.bad;
  const walking = isWalkingPace(run);
  const target = optimalCadence(run, heightCm, age, weightKg);
  const cadScore = cadenceQuality(run, target);
  const cad = Number(run.cadence) || 0;
  const cadColor = cad <= 0 ? "#718096" : cadScore >= 0.95 ? Q.excellent : cadScore >= 0.85 ? Q.good : cadScore >= 0.75 ? Q.average : cadScore >= 0.6 ? Q.caution : Q.bad;
  const cadBadge = cad <= 0 ? "" : walking ? "Walking pace" : cadScore >= 0.95 ? "Excellent" : cadScore >= 0.85 ? "Good" : cadScore >= 0.75 ? "Solid" : cadScore >= 0.6 ? "Low" : "Very low";
  const cons = consistencyFraction(run);
  const consColor = cons == null ? "#718096" : cons >= 0.9 ? Q.excellent : cons >= 0.75 ? Q.good : cons >= 0.55 ? Q.average : cons >= 0.35 ? Q.caution : Q.bad;
  const consBadge = cons == null ? "" : cons >= 0.9 ? "Excellent" : cons >= 0.75 ? "Solid" : cons >= 0.55 ? "Variable" : "Uneven";
  const consSub = cons == null ? "No data" : cons >= 0.9 ? "Very even" : cons >= 0.75 ? "Steady pace" : cons >= 0.55 ? "Variable" : "Uneven splits";

  return (
    <Panel className="panel-pad">
      <SectionTitle>Run score</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <ScoreRing label="Effort" value={effort.score / 100} color={effort.color} sub={effort.label} badge={effort.label} />
        {hasHr ? (
          <ScoreRing label="HR zone" value={Math.min(1, avgHr / maxHr)} color={zoneColor} sub={`${avgHr} bpm`} target={`max ${maxHr} bpm`} badge={`Zone ${zone}`} />
        ) : (
          <ScoreRing
            label="Cadence"
            value={cad > 0 ? cadScore : null}
            color={cadColor}
            sub={cad > 0 ? `${cad} spm` : "No data"}
            target={cad > 0 ? (walking ? `target ${WALK_CADENCE[0]}–${WALK_CADENCE[1]} spm` : `target ${target} spm`) : undefined}
            badge={cadBadge || undefined}
          />
        )}
        <ScoreRing label="Consistency" value={cons} color={consColor} sub={consSub} badge={consBadge || undefined} />
      </div>
    </Panel>
  );
}

/* ── Heart rate ───────────────────────────────────────────────────────────── */

function HrZonesCard({ run }: { run: Run }) {
  const { age } = useRunner();
  const userMax = tanakaMaxHr(age);
  const hr = (run.heartRateData ?? []).filter((h) => h > 0);
  const maxHr = Math.max(userMax, hr.length ? Math.max(...hr) : 0);
  const pre = [run.timeInZone1, run.timeInZone2, run.timeInZone3, run.timeInZone4, run.timeInZone5].map((v) => Number(v) || 0);
  const usePre = pre.some((v) => v > 0);
  const secsPerSample = hr.length ? (Number(run.duration) || 0) / 1000 / hr.length : 0;
  const t = [0.6, 0.7, 0.8, 0.9].map((f) => Math.trunc(f * maxHr));
  const counts = usePre ? pre : [0, 1, 2, 3, 4].map((z) => hr.filter((h) => hrZoneOf(h, maxHr) === z + 1).length * secsPerSample);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const rows = [
    { name: "Zone 5", label: "Maximum", color: "#E53935", range: `${t[3]}–${maxHr}`, secs: counts[4] },
    { name: "Zone 4", label: "Threshold", color: "#FF9800", range: `${t[2]}–${t[3] - 1}`, secs: counts[3] },
    { name: "Zone 3", label: "Aerobic", color: "#FFC107", range: `${t[1]}–${t[2] - 1}`, secs: counts[2] },
    { name: "Zone 2", label: "Easy", color: "#4CAF50", range: `${t[0]}–${t[1] - 1}`, secs: counts[1] },
    { name: "Zone 1", label: "Warm up", color: "#42A5F5", range: `< ${t[0]}`, secs: counts[0] },
  ];
  return (
    <ChartCard title="Heart rate zones" subtitle={`Based on max HR ${maxHr} bpm`} right={<Heart className="h-4 w-4 text-danger" />}>
      <div className="space-y-2.5">
        {rows.map((z) => {
          const pct = (z.secs / total) * 100;
          return (
            <div key={z.name} className="grid grid-cols-[132px_1fr_auto] items-center gap-3 text-sm">
              <div>
                <div className="font-medium text-ink">{z.name}</div>
                <div className="text-[11px] text-ink-3">
                  {z.label} · {z.range}
                </div>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-3/40">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: z.color }} />
              </div>
              <div className="num w-24 text-right text-xs text-ink-2">
                {fmtClock(z.secs)} · {Math.round(pct)}%
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

function HrPaceCard({ run }: { run: Run }) {
  const { age } = useRunner();
  const hr = (run.heartRateData ?? []).filter((h) => h > 0);
  const maxHr = Math.max(tanakaMaxHr(age), hr.length ? Math.max(...hr) : 0);
  const pts = useMemo(() => hrPacePoints(run, maxHr), [run, maxHr]);
  if (!pts.length) return null;
  const line = regression(pts);
  return (
    <ChartCard title="Heart rate vs pace" subtitle="Each dot is a stretch of your run, coloured by HR zone. The dashed line is the trend — steeper means more heart rate per second of pace.">
      <HrPaceScatter points={pts} line={line} />
    </ChartCard>
  );
}

function IntensityCard({ run }: { run: Run }) {
  const parts = intensity(run);
  if (!parts) return null;
  return (
    <ChartCard title="Intensity distribution">
      <div className="flex items-center gap-6">
        <Donut parts={parts} />
        <div className="flex-1 space-y-2">
          {parts.map((p) => (
            <div key={p.name} className="flex items-center gap-2.5 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
              <span className="flex-1 text-ink-2">{p.name}</span>
              <span className="num font-medium text-ink">{Math.round(p.pct * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

/* ── Multi-metric ─────────────────────────────────────────────────────────── */

function FatigueCard({ run }: { run: Run }) {
  const f = fatigue(run);
  if (!f) return null;
  return (
    <ChartCard title="Fatigue analysis" subtitle="Each bar is a km — taller is slower" right={<TrendingDown className="h-4 w-4 text-orange" />}>
      <div className="flex h-24 items-end gap-1">
        {f.bars.map((b, i) => (
          <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max(6, b.height * 100)}%`, background: b.color }} title={`Km ${i + 1}: ${fmtPace(b.pace)}/km`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>Km 1</span>
        <span>Km {f.bars.length}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line/50 pt-4">
        <Stat label="Mid avg" value={`${fmtPace(f.mid)}/km`} />
        <Stat label="Decay" value={signed(f.pct)} color={f.color} />
        <Stat label="Last avg" value={`${fmtPace(f.last)}/km`} />
      </div>
      <div className="mt-3">
        <Rating text={f.rating} color={f.color} />
      </div>
    </ChartCard>
  );
}

function DecouplingCard({ run }: { run: Run }) {
  const d = decoupling(run);
  if (!d) return null;
  return (
    <ChartCard title="Aerobic decoupling" subtitle="Heart rate vs pace drift, first half against second" right={<Microscope className="h-4 w-4 text-brand" />}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="HR drift" value={signed(d.hrDrift)} />
        <Stat label="Pace drift" value={signed(d.paceDrift)} />
        <Stat label="Decoupling" value={`${d.total.toFixed(1)}%`} color={d.color} />
      </div>
      <div className="mt-3">
        <Rating text={d.rating} color={d.color} />
      </div>
      <p className="mt-3 text-sm text-ink-2">{d.advice}</p>
    </ChartCard>
  );
}

function EconomyCard({ run }: { run: Run }) {
  const e = economy(run);
  if (!e) return null;
  return (
    <ChartCard title="Running economy" subtitle="How efficiently you turn heartbeats into distance" right={<Gauge className="h-4 w-4 text-brand-green" />}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="num text-3xl font-bold text-ink">{e.index.toFixed(1)}</div>
          <div className="text-xs text-ink-3">m per heartbeat</div>
        </div>
        <div className="text-right">
          <div className="num text-lg font-semibold text-ink">{fmtPace(e.pace)}/km</div>
          <div className="text-xs text-ink-3">at {e.hr} bpm avg</div>
        </div>
      </div>
      <div className="mt-3">
        <Rating text={e.rating} color={e.color} />
      </div>
      <p className="mt-3 text-sm text-ink-2">Track this over time — improving economy means you’re faster at the same heart rate, or holding pace with less cardiac effort.</p>
    </ChartCard>
  );
}

function PredictorCard({ run }: { run: Run }) {
  const preds = riegel(run);
  if (!preds.length) return null;
  return (
    <ChartCard title="Race time predictor" subtitle={`From today’s ${(run.distance / 1000).toFixed(1)} km effort (Riegel formula)`} right={<Trophy className="h-4 w-4 text-amber" />}>
      <div className="divide-y divide-line/40">
        {preds.map((p) => (
          <div key={p.name} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-ink-2">{p.name}</span>
            <span className="num font-semibold text-ink">{fmtClock(p.seconds)}</span>
            <span className="num w-20 text-right text-ink-3">{fmtPace(p.pace)}/km</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">Predictions assume similar conditions and a taper. Race day depends on training, nutrition and pacing.</p>
    </ChartCard>
  );
}

function WeatherCard({ run }: { run: Run }) {
  const temp = run.weatherAtStart?.temperature;
  if (temp == null) return null;
  const w = weatherIndex(temp);
  return (
    <ChartCard title="Weather performance index" subtitle="How the conditions affected your run" right={<CloudSun className="h-4 w-4 text-brand" />}>
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-ink-2">
          <div>
            Temperature <span className="font-semibold text-ink">{Math.round(temp)}°C</span> — {w.label}
          </div>
          {run.weatherAtStart?.condition && <div className="mt-1">{run.weatherAtStart.condition}</div>}
        </div>
        <div className="num text-4xl font-bold" style={{ color: w.color }}>
          {Math.round(w.wpi)}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3/40">
        <div className="h-full rounded-full" style={{ width: `${w.wpi}%`, background: w.color }} />
      </div>
      <div className="mt-3">
        <Rating text={w.rating} color={w.color} />
      </div>
      <p className="mt-3 text-xs text-ink-3">The best running temperature is around 12°C. Performance usually drops in strong heat or cold.</p>
    </ChartCard>
  );
}

/* ── Tab ──────────────────────────────────────────────────────────────────── */

export function GraphsTab({ run, km }: { run: Run; km: number }) {
  const [mode, setMode] = useState<"km" | "min">("km");
  const series = useMemo(() => buildSeries(run, km), [run, km]);
  const avgPace = runPaceSec(run);
  const has = (k: "pace" | "hr" | "elevation" | "cadence") => series.filter((p) => p[k] != null).length > 5;
  const x = mode;
  const xFormat = mode === "km" ? (v: number) => Number(v).toFixed(1) : (v: number) => fmtClock(Number(v) * 60);
  const xLabel = mode === "km" ? "km" : "";
  const hasHr = (run.heartRateData ?? []).some((h) => h > 0);

  return (
    <div>
      <RunScore run={run} />

      <div className="mb-4 mt-10 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Activity className="h-5 w-5 text-brand" /> Charts
        </h3>
        <Segmented value={mode} onChange={setMode} options={[{ value: "km", label: "Distance" }, { value: "min", label: "Time" }]} />
      </div>
      {!series.length ? (
        <Panel className="panel-pad text-sm text-ink-3">No time-series data was recorded for this session.</Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {has("pace") && (
            <ChartCard title="Pace" subtitle="Faster is higher" right={<Timer className="h-4 w-4 text-brand" />}>
              <MetricAreaChart data={series} x={x} xFormat={xFormat} xLabel={xLabel} y="pace" color="#00d4ff" invert format={(v) => fmtPace(v)} unit="/km" reference={avgPace ? { value: avgPace, label: `avg ${fmtPace(avgPace)}` } : undefined} />
            </ChartCard>
          )}
          {has("elevation") && (
            <ChartCard
              title="Elevation"
              subtitle={run.totalElevationGain ? `+${Math.round(run.totalElevationGain)} m / −${Math.round(run.totalElevationLoss ?? 0)} m` : undefined}
              right={<Mountain className="h-4 w-4 text-amber" />}
            >
              <MetricAreaChart data={series} x={x} xFormat={xFormat} xLabel={xLabel} y="elevation" color="#ffb300" unit="m" domainPad={0.3} />
            </ChartCard>
          )}
          {has("hr") && (
            <ChartCard title="Heart rate" right={<Heart className="h-4 w-4 text-danger" />}>
              <MetricAreaChart data={series} x={x} xFormat={xFormat} xLabel={xLabel} y="hr" color="#ff5252" unit="bpm" reference={run.heartRate ? { value: run.heartRate, label: `avg ${run.heartRate}` } : undefined} />
            </ChartCard>
          )}
          {has("cadence") && (
            <ChartCard title="Cadence" right={<Footprints className="h-4 w-4 text-violet" />}>
              <MetricAreaChart data={series} x={x} xFormat={xFormat} xLabel={xLabel} y="cadence" color="#8b7cf6" unit="spm" />
            </ChartCard>
          )}
          {has("pace") && has("elevation") && (
            <ChartCard title="Pace vs elevation" subtitle="Pace line over the terrain">
              <DualAxisChart data={series} x={x} xFormat={xFormat} xLabel={xLabel} y="pace" yColor="#00d4ff" yFormat={(v) => fmtPace(v)} yUnit="/km" invert />
            </ChartCard>
          )}
          {has("cadence") && has("elevation") && (
            <ChartCard title="Cadence vs elevation" subtitle="Step rate over the terrain">
              <DualAxisChart data={series} x={x} xFormat={xFormat} xLabel={xLabel} y="cadence" yColor="#8b7cf6" yFormat={(v) => String(Math.round(v))} yUnit="spm" />
            </ChartCard>
          )}
        </div>
      )}

      {hasHr && (
        <>
          <Header icon={<Heart className="h-5 w-5 text-danger" />}>Heart rate analysis</Header>
          <div className="grid gap-4 lg:grid-cols-2">
            <HrZonesCard run={run} />
            <IntensityCard run={run} />
            <div className="lg:col-span-2">
              <HrPaceCard run={run} />
            </div>
          </div>
        </>
      )}

      <Header icon={<Flame className="h-5 w-5 text-orange" />}>Multi-metric analysis</Header>
      <div className="grid gap-4 lg:grid-cols-2">
        <FatigueCard run={run} />
        <DecouplingCard run={run} />
        <EconomyCard run={run} />
        <PredictorCard run={run} />
        <WeatherCard run={run} />
      </div>
      {run.hasGarminData && <p className="mt-4 text-xs text-ink-3">Heart rate and cadence from {run.garminDeviceName ?? "your Garmin"}. Garmin data is shown exactly as your watch recorded it.</p>}
    </div>
  );
}

/** Summary tab card — same multi-factor score as the app's Effort Score. */
export function EffortScoreCard({ run }: { run: Run }) {
  const { age } = useRunner();
  const e = effortScore(run, age);
  return (
    <Panel className="panel-pad">
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange" /> Effort score
        </span>
      </SectionTitle>
      <div className="flex items-center gap-4">
        <div className="num text-4xl font-bold" style={{ color: e.color }}>
          {e.score}
        </div>
        <div>
          <Rating text={e.label} color={e.color} />
          <div className="mt-1 text-xs text-ink-3">out of 100</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3/40">
        <div className="h-full rounded-full" style={{ width: `${e.score}%`, background: e.color }} />
      </div>
      <div className="mt-4 divide-y divide-line/40">
        {e.factors.map(([k, v]) => (
          <div key={k} className="flex justify-between py-2 text-sm">
            <span className="text-ink-2">{k}</span>
            <span className="num font-medium text-ink">{v}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
