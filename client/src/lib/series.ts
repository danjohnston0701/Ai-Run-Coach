import type { Run, RoutePoint } from "./types";

export function haversine(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function validPoints(run: Run): RoutePoint[] {
  return (run.routePoints ?? []).filter(
    (p) => p && isFinite(p.latitude) && isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0),
  );
}

/** Cumulative distance (km) at each route point, scaled so the end matches the saved distance. */
export function cumulativeKm(points: RoutePoint[], totalKm?: number): number[] {
  const out: number[] = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + haversine(points[i - 1], points[i]) / 1000);
  const last = out[out.length - 1];
  if (totalKm && last > 0) {
    const k = totalKm / last;
    return out.map((v) => v * k);
  }
  return out;
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** Rolling mean over a window, ignoring nulls. */
export function smooth(values: (number | null)[], window = 5): (number | null)[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j];
      if (v != null && isFinite(v)) {
        sum += v;
        n++;
      }
    }
    return n ? sum / n : null;
  });
}

export type SeriesPoint = { km: number; min: number; pace?: number | null; hr?: number | null; elevation?: number | null; cadence?: number | null };

/**
 * Builds a distance-indexed series for the charts. Each data array is spread across the route
 * proportionally (the apps record them on slightly different clocks, so lengths differ by a few).
 */
export function buildSeries(run: Run, totalKm: number, maxPoints = 300): SeriesPoint[] {
  const pts = validPoints(run);
  const cum = pts.length > 1 ? cumulativeKm(pts, totalKm) : [];
  const n = Math.max(
    cum.length,
    run.paceData?.length ?? 0,
    run.heartRateData?.length ?? 0,
    run.altitudeData?.length ?? 0,
    run.cadenceData?.length ?? 0,
  );
  if (n < 2) return [];

  const kmAt = (frac: number) => {
    if (cum.length > 1) {
      const idx = frac * (cum.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.min(cum.length - 1, lo + 1);
      return cum[lo] + (cum[hi] - cum[lo]) * (idx - lo);
    }
    return frac * totalKm;
  };
  // Elapsed minutes: from GPS timestamps when present, else spread over the recorded duration.
  const ts = pts.length > 1 && pts[0].timestamp && pts[pts.length - 1].timestamp ? pts.map((p) => Number(p.timestamp) || 0) : null;
  const totalMin = (Number(run.duration) || 0) / 60000;
  const minAt = (frac: number) => {
    if (ts) {
      const idx = Math.round(frac * (ts.length - 1));
      return Math.max(0, (ts[idx] - ts[0]) / 60000);
    }
    return frac * totalMin;
  };
  const pick = (arr: number[] | null | undefined, frac: number) => {
    if (!arr || arr.length < 2) return null;
    const v = arr[Math.round(frac * (arr.length - 1))];
    return v == null || !isFinite(v) ? null : v;
  };

  // Pace: drop GPS spikes (standing still / teleports) before smoothing.
  const paceSrc = run.paceData && run.paceData.length > 1 ? run.paceData : null;
  const paceMed = paceSrc ? median(paceSrc.filter((v) => v > 120 && v < 1800)) : 0;
  const altSrc =
    run.altitudeData && run.altitudeData.length > 1
      ? run.altitudeData
      : pts.some((p) => p.altitude != null)
        ? pts.map((p) => (p.altitude ?? NaN) as number)
        : null;

  const steps = Math.min(maxPoints, n);
  const raw: SeriesPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const frac = steps === 1 ? 0 : i / (steps - 1);
    let pace = pick(paceSrc, frac);
    if (pace != null && (pace < 120 || pace > Math.max(paceMed * 2.2, 900))) pace = null;
    const hr = pick(run.heartRateData, frac);
    const cad = pick(run.cadenceData, frac);
    raw.push({
      km: Number(kmAt(frac).toFixed(3)),
      min: Number(minAt(frac).toFixed(2)),
      pace,
      hr: hr != null && hr > 30 && hr < 240 ? hr : null,
      elevation: pick(altSrc as number[] | null, frac),
      cadence: cad != null && cad > 60 && cad < 260 ? cad : null,
    });
  }
  const w = Math.max(3, Math.round(steps / 40));
  const sp = smooth(raw.map((r) => r.pace ?? null), w);
  const sh = smooth(raw.map((r) => r.hr ?? null), Math.max(3, Math.round(w / 2)));
  const se = smooth(raw.map((r) => r.elevation ?? null), 3);
  const sc = smooth(raw.map((r) => r.cadence ?? null), w);
  return raw.map((r, i) => ({
    km: r.km,
    min: r.min,
    pace: sp[i] != null ? Math.round(sp[i]!) : null,
    hr: sh[i] != null ? Math.round(sh[i]!) : null,
    elevation: se[i] != null ? Number(se[i]!.toFixed(1)) : null,
    cadence: sc[i] != null ? Math.round(sc[i]!) : null,
  }));
}

/** Speed (m/s) per route segment from timestamps, smoothed — drives the pace-coloured map line. */
export function segmentSpeeds(points: RoutePoint[]): (number | null)[] {
  const speeds: (number | null)[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = a.timestamp && b.timestamp ? (b.timestamp - a.timestamp) / 1000 : 0;
    const d = haversine(a, b);
    speeds.push(dt > 0 ? d / dt : b.speed ?? null);
  }
  return smooth(speeds, 7);
}
