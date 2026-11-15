import { useId, useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * My Data trend chart — port of the app's TrendBarChart / SophisticatedLineChart
 * (MyDataScreen.kt): points grouped by week (1M, 3M) or month (6M, 1Y), the line and dots
 * coloured on the green → yellow → orange → red performance spectrum (scaled to this
 * period's own min/max), a ±15 % padded axis, optional HR-zone gridlines, and colour-coded
 * Min / Avg / Max / Periods underneath.
 */

export type TrendPoint = { date: string; value: number };
type Group = { label: string; value: number; key: number; start: string };

/** 0 = worst (red) … 1 = best (green), the same spectrum as the app (performanceGradientColor). */
export function performanceColor(goodness: number) {
  const r = 1 - Math.max(0, Math.min(1, goodness));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  let c: [number, number, number];
  if (r < 0.33) {
    const t = r / 0.33;
    c = [lerp(0.3, 1, t), lerp(0.69, 0.84, t), lerp(0.31, 0, t)];
  } else if (r < 0.66) {
    const t = (r - 0.33) / 0.33;
    c = [1, lerp(0.84, 0.55, t), 0];
  } else {
    const t = (r - 0.66) / 0.34;
    c = [lerp(1, 0.9, t), lerp(0.55, 0.22, t), lerp(0, 0.15, t)];
  }
  return `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function groupTrend(points: TrendPoint[], days: number): Group[] {
  const byWeek = days <= 90;
  const map = new Map<number, { label: string; start: string; vals: number[] }>();
  points.forEach((p) => {
    const [y, m, d] = p.date.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d || p.value == null || !isFinite(p.value)) return;
    let key: number;
    let label: string;
    let start: string;
    if (byWeek) {
      const dt = new Date(y, m - 1, d);
      const back = (dt.getDay() + 6) % 7; // to Monday
      dt.setDate(dt.getDate() - back);
      key = dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
      label = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
      start = dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      start = `Week of ${start}`;
    } else {
      key = y * 100 + m;
      label = `${MONTHS[m - 1]} ${String(y % 100).padStart(2, "0")}`;
      start = `${MONTHS[m - 1]} ${y}`;
    }
    if (!map.has(key)) map.set(key, { label, start, vals: [] });
    map.get(key)!.vals.push(p.value);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([key, g]) => ({ key, label: g.label, start: g.start, value: g.vals.reduce((a, b) => a + b, 0) / g.vals.length }));
}

export function TrendCard({
  title,
  icon,
  points,
  days,
  unit,
  invert = false,
  gradient = true,
  format = (v: number) => v.toFixed(1),
  axisFormat,
  zoneLines,
  note,
}: {
  title: string;
  icon?: React.ReactNode;
  points: TrendPoint[];
  days: number;
  unit: string;
  /** Lower is better (pace). */
  invert?: boolean;
  /** Colour points by performance (off for elevation, like the app). */
  gradient?: boolean;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  zoneLines?: { value: number; label: string }[];
  note?: string;
}) {
  const id = useId().replace(/:/g, "");
  const data = useMemo(() => groupTrend(points, days).map((g, i) => ({ ...g, i })), [points, days]);
  if (data.length === 0) return null;

  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const range = max - min > 1e-4 ? max - min : 1;
  const goodness = (v: number) => (invert ? (max - v) / range : (v - min) / range);
  const colorOf = (v: number) => (gradient ? performanceColor(goodness(v)) : "#4CAF50");
  // App axis: int(max × 1.15) down to int(min × 0.85) in four equal integer steps.
  const yMax = Math.trunc(max * 1.15) || 1;
  const yMin = Math.max(0, Math.trunc(min * 0.85));
  const step = Math.max(1, Math.trunc((yMax - yMin) / 4));
  const ticks = [0, 1, 2, 3, 4].map((k) => yMax - k * step).filter((v) => v >= yMin);
  const n = data.length;
  const fmtAxis = axisFormat ?? format;

  return (
    <div className="panel panel-pad">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {/* Line coloured point by point along x — the app's per-segment spectrum. */}
              <linearGradient id={`l${id}`} x1="0" y1="0" x2="1" y2="0">
                {data.map((d, i) => (
                  <stop key={i} offset={n === 1 ? 0 : i / (n - 1)} stopColor={colorOf(d.value)} />
                ))}
              </linearGradient>
              <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4CAF50" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#4CAF50" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#374151" strokeOpacity={0.5} vertical={false} horizontal={!zoneLines} />
            <XAxis dataKey="i" type="number" domain={[0, Math.max(1, n - 1)]} ticks={data.map((d) => d.i)} interval={n > 12 ? Math.ceil(n / 8) - 1 : 0} tickFormatter={(i) => data[i]?.label ?? ""} stroke="#4a5568" fontSize={10} tickLine={false} axisLine={false} padding={{ left: 6, right: 6 }} />
            <YAxis
              domain={[yMin, yMax]}
              ticks={zoneLines ? zoneLines.map((z) => z.value).filter((v) => v >= yMin && v <= yMax) : ticks}
              allowDecimals={false}
              tickFormatter={(v) => fmtAxis(v)}
              stroke="#4a5568"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={42}
              reversed={false}
            />
            {zoneLines?.map((z) =>
              z.value >= yMin && z.value <= yMax ? <ReferenceLine key={z.label} y={z.value} stroke="#374151" strokeDasharray="3 3" label={{ value: z.label, position: "insideTopRight", fill: "#718096", fontSize: 9 }} /> : null,
            )}
            <Tooltip
              cursor={{ stroke: "#a0aec0", strokeOpacity: 0.35 }}
              content={({ active, payload }: any) =>
                active && payload?.length ? (
                  <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-xl">
                    <div className="num font-semibold" style={{ color: colorOf(payload[0].payload.value) }}>
                      {format(payload[0].payload.value)}
                      {unit}
                    </div>
                    <div className="text-ink-3">{payload[0].payload.start}</div>
                  </div>
                ) : null
              }
            />
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#f${id})`} baseValue={yMin} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={n > 1 && max - min > 1e-4 ? `url(#l${id})` : colorOf(vals[0])}
              strokeWidth={2.5}
              isAnimationActive={false}
              dot={(p: any) => <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill="#1f2937" stroke={colorOf(p.payload.value)} strokeWidth={2.5} />}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line/50 pt-3 text-center">
        {[
          ["Min", min],
          ["Avg", mean],
          ["Max", max],
        ].map(([l, v]) => (
          <div key={l as string}>
            <div className="text-[10px] uppercase tracking-wide text-ink-3">{l}</div>
            <div className="num mt-0.5 text-sm font-semibold" style={{ color: colorOf(v as number) }}>
              {format(v as number)}
              {unit}
            </div>
          </div>
        ))}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-3">{days <= 90 ? "Weeks" : "Months"}</div>
          <div className="num mt-0.5 text-sm font-semibold text-ink-2">{n}</div>
        </div>
      </div>
      {note && <p className="mt-3 text-xs text-ink-3">{note}</p>}
    </div>
  );
}
