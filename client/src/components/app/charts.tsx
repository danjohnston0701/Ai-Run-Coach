import { useId, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
