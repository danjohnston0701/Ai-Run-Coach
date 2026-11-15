import { useId, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { fmtPace } from "@/lib/format";

const AXIS = { stroke: "#4a5568", fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, render }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {render(payload[0].payload, label)}
    </div>
  );
}

/**
 * Area chart over distance (or any numeric x). `invert` puts lower values on top — used for pace,
 * where a smaller number is faster.
 */
export function MetricAreaChart({
  data,
  x = "km",
  y,
  color = "#00d4ff",
  height = 220,
  invert = false,
  format = (v: number) => String(Math.round(v)),
  xFormat = (v: number) => `${Number(v).toFixed(1)}`,
  xLabel = "km",
  unit = "",
  reference,
  domainPad = 0.08,
}: {
  data: any[];
  x?: string;
  y: string;
  color?: string;
  height?: number;
  invert?: boolean;
  format?: (v: number) => string;
  xFormat?: (v: any) => string;
  xLabel?: string;
  unit?: string;
  reference?: { value: number; label: string };
  domainPad?: number;
}) {
  const id = useId().replace(/:/g, "");
  const vals = data.map((d) => d[y]).filter((v) => v != null && isFinite(v)) as number[];
  if (vals.length < 2) return <div className="grid h-[120px] place-items-center text-sm text-ink-3">No data recorded</div>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max((max - min) * domainPad, 1);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1={invert ? "1" : "0"} x2="0" y2={invert ? "0" : "1"}>
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2d3748" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey={x} type="number" domain={["dataMin", "dataMax"]} tickFormatter={xFormat} {...AXIS} minTickGap={28} />
          <YAxis
            {...AXIS}
            width={44}
            reversed={invert}
            domain={[Math.floor(min - pad), Math.ceil(max + pad)]}
            tickFormatter={(v) => format(v)}
            tickCount={5}
          />
          {reference && (
            <ReferenceLine y={reference.value} stroke="#ffffff" strokeOpacity={0.35} strokeDasharray="4 4" label={{ value: reference.label, fill: "#a0aec0", fontSize: 10, position: "insideTopRight" }} />
          )}
          <Tooltip
            cursor={{ stroke: "#a0aec0", strokeOpacity: 0.4 }}
            content={
              <TooltipBox
                render={(p: any) => (
                  <>
                    <div className="num font-semibold text-ink">
                      {p[y] != null ? format(p[y]) : "—"} {unit}
                    </div>
                    <div className="text-ink-3">
                      {xFormat(p[x])} {xLabel}
                    </div>
                  </>
                )}
              />
            }
          />
          <Area type="monotone" dataKey={y} stroke={color} strokeWidth={2} fill={`url(#g${id})`} baseValue={invert ? "dataMax" : "dataMin"} connectNulls isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Km split bars: bar height = speed (faster = taller), coloured vs the average. */
export function SplitBars({ splits, height = 220 }: { splits: { km: number; paceSec: number; label: string }[]; height?: number }) {
  if (!splits.length) return null;
  const avg = splits.reduce((s, x) => s + x.paceSec, 0) / splits.length;
  const max = Math.max(...splits.map((s) => s.paceSec));
  const data = splits.map((s) => ({ ...s, v: max * 1.15 - s.paceSec }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2d3748" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="label" {...AXIS} interval={splits.length > 20 ? 4 : 0} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "#ffffff", fillOpacity: 0.04 }}
            content={<TooltipBox render={(p: any) => (<><div className="num font-semibold text-ink">{fmtPace(p.paceSec)} /km</div><div className="text-ink-3">Km {p.label}</div></>)} />}
          />
          <Bar dataKey="v" radius={[6, 6, 2, 2]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.paceSec <= avg ? "#00d4ff" : "#ff6b35"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Simple trend line over dates (My Data). */
export function TrendChart({
  data,
  color = "#00d4ff",
  invert = false,
  format = (v: number) => String(Math.round(v)),
  unit = "",
  height = 180,
}: {
  data: { date: string; value: number }[];
  color?: string;
  invert?: boolean;
  format?: (v: number) => string;
  unit?: string;
  height?: number;
}) {
  const rows = data.map((d) => ({ ...d, t: new Date(d.date).getTime() }));
  return (
    <MetricAreaChart
      data={rows}
      x="t"
      y="value"
      color={color}
      invert={invert}
      format={format}
      unit={unit}
      height={height}
      xLabel=""
      xFormat={(v) => new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
    />
  );
}

export function ChartCard({ title, children, right, subtitle }: { title: ReactNode; children: ReactNode; right?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="panel panel-pad">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-ink-3">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Elevation (shaded, right axis) under a second metric (line, left axis) — Android's "Pace vs Elevation". */
export function DualAxisChart({
  data,
  x,
  xFormat,
  xLabel,
  y,
  yColor,
  yFormat,
  yUnit,
  invert = false,
  height = 240,
}: {
  data: any[];
  x: string;
  xFormat: (v: any) => string;
  xLabel: string;
  y: string;
  yColor: string;
  yFormat: (v: number) => string;
  yUnit: string;
  invert?: boolean;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const ys = data.map((d) => d[y]).filter((v) => v != null) as number[];
  const es = data.map((d) => d.elevation).filter((v) => v != null) as number[];
  if (ys.length < 5 || es.length < 5) return <div className="grid h-[120px] place-items-center text-sm text-ink-3">No data recorded</div>;
  const yPad = Math.max((Math.max(...ys) - Math.min(...ys)) * 0.08, 1);
  const eMin = Math.min(...es);
  const eMax = Math.max(...es);
  const ePad = Math.max((eMax - eMin) * 1.4, 5); // keep the terrain in the lower part of the chart
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`e${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffb300" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ffb300" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2d3748" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey={x} type="number" domain={["dataMin", "dataMax"]} tickFormatter={xFormat} {...AXIS} minTickGap={28} />
          <YAxis yAxisId="m" {...AXIS} width={44} reversed={invert} domain={[Math.floor(Math.min(...ys) - yPad), Math.ceil(Math.max(...ys) + yPad)]} tickFormatter={(v) => yFormat(v)} tickCount={5} />
          <YAxis yAxisId="e" orientation="right" {...AXIS} width={36} domain={[Math.floor(eMin - 2), Math.ceil(eMax + ePad)]} tickFormatter={(v) => `${Math.round(v)}`} tickCount={4} />
          <Tooltip
            cursor={{ stroke: "#a0aec0", strokeOpacity: 0.4 }}
            content={
              <TooltipBox
                render={(p: any) => (
                  <>
                    <div className="num font-semibold" style={{ color: yColor }}>
                      {p[y] != null ? yFormat(p[y]) : "—"} {yUnit}
                    </div>
                    <div className="num text-amber">{p.elevation != null ? `${Math.round(p.elevation)} m` : "—"}</div>
                    <div className="text-ink-3">
                      {xFormat(p[x])} {xLabel}
                    </div>
                  </>
                )}
              />
            }
          />
          <Area yAxisId="e" type="monotone" dataKey="elevation" stroke="#ffb300" strokeOpacity={0.6} strokeWidth={1} fill={`url(#e${id})`} connectNulls isAnimationActive={false} />
          <Line yAxisId="m" type="monotone" dataKey={y} stroke={yColor} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const ZONE_DOT = ["#60a5fa", "#00e676", "#ffb300", "#ff6b35", "#ff5252"];

/** Heart rate against pace, dots coloured by HR zone, with the least-squares trend line. */
export function HrPaceScatter({ points, line }: { points: { pace: number; hr: number; zone: number }[]; line: { a: number; b: number } | null }) {
  const xs = points.map((p) => p.pace);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const trend = line ? [{ pace: xMin, hr: line.a + line.b * xMin }, { pace: xMax, hr: line.a + line.b * xMax }] : [];
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2d3748" strokeOpacity={0.5} />
          <XAxis dataKey="pace" type="number" reversed domain={[Math.floor(xMin - 10), Math.ceil(xMax + 10)]} tickFormatter={(v) => fmtPace(v)} {...AXIS} name="Pace" />
          <YAxis dataKey="hr" type="number" domain={["dataMin - 5", "dataMax + 5"]} {...AXIS} width={40} name="HR" />
          <ZAxis range={[36, 36]} />
          <Tooltip
            cursor={{ strokeOpacity: 0.2 }}
            content={<TooltipBox render={(p: any) => (<><div className="num font-semibold text-ink">{Math.round(p.hr)} bpm</div><div className="num text-ink-3">{fmtPace(p.pace)} /km{p.zone ? ` · Zone ${p.zone}` : ""}</div></>)} />}
          />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell key={i} fill={ZONE_DOT[p.zone - 1]} fillOpacity={0.8} />
            ))}
          </Scatter>
          {trend.length > 0 && <Scatter data={trend} line={{ stroke: "#ffffff", strokeOpacity: 0.55, strokeDasharray: "5 4", strokeWidth: 1.5 }} shape={() => <g />} isAnimationActive={false} />}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Score ring used by the "Run score" row. */
export function ScoreRing({ value, color, label, sub, badge, target }: { value: number | null; color: string; label: string; sub: string; badge?: string; target?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{label}</div>
      <div className="relative mt-2 h-[104px] w-[104px]">
        <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
          <circle cx="52" cy="52" r={r} stroke="#2d3748" strokeWidth="9" fill="none" />
          <circle cx="52" cy="52" r={r} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="num text-2xl font-bold text-ink">{value == null ? "—" : `${Math.round(v * 100)}%`}</span>
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-ink">{sub}</div>
      {target && <div className="text-xs text-ink-3">{target}</div>}
      {badge && (
        <span className="mt-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color, background: `${color}1f` }}>
          {badge}
        </span>
      )}
    </div>
  );
}

/** Donut for a few shares that add up to 1. */
export function Donut({ parts, size = 132 }: { parts: { name: string; color: string; pct: number }[]; size?: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const top = [...parts].sort((a, b) => b.pct - a.pct)[0];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} stroke="#2d3748" strokeWidth="16" fill="none" />
        {parts.map((p) => {
          const len = p.pct * c;
          const el = len > 0.5 ? <circle key={p.name} cx="60" cy="60" r={r} stroke={p.color} strokeWidth="16" fill="none" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} /> : null;
          offset += len;
          return el;
        })}
      </svg>
      {top && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="num text-xl font-bold text-ink">{Math.round(top.pct * 100)}%</div>
            <div className="text-[11px] text-ink-3">{top.name}</div>
          </div>
        </div>
      )}
    </div>
  );
}
