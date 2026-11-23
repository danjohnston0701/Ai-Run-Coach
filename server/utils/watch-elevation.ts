/**
 * Sanity check for the elevation gain/loss a watch reports.
 *
 * Why: Naeem's fēnix 7X Pro (2026-11-22) reported 32,947 m of ascent for a flat 3.4 km
 * run whose altitude only spanned 25 m. Its barometric reading kept jumping ~410 m
 * between samples, and the watch app banked every jump as climb. The watch app now
 * ignores such jumps (RunView.mc, MAX_ALT_STEP_M), but older builds are still out there,
 * so the server checks the reported totals too.
 *
 * The reported figure is kept unless it's physically impossible:
 *   - more than half the distance covered (nothing done on foot averages a 50% climb), or
 *   - with an altitude series, more than what that series supports plus a generous margin
 *     (barometric ascent normally exceeds a GPS-altitude recount on rolling ground, so
 *     the margin is max(150 m, 5% of distance), never a ratio).
 * When rejected, the value is recounted from the altitude series (or dropped to null).
 */

/** Same anchor quantiser as the watch apps, plus jump rejection. */
export function ascentDescentFromAltitudes(
  altitudes: Array<number | null | undefined>,
  thresholdM = 5,
  maxStepM = 25,
): { ascent: number; descent: number } | null {
  const vals = altitudes.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v !== 0);
  if (vals.length < 2) return null;
  let ascent = 0;
  let descent = 0;
  let anchor = vals[0];
  let prev = vals[0];
  for (let i = 1; i < vals.length; i++) {
    const v = vals[i];
    // A jump this size between two samples isn't terrain: re-anchor without banking it.
    if (Math.abs(v - prev) > maxStepM) {
      anchor = v;
      prev = v;
      continue;
    }
    prev = v;
    const delta = v - anchor;
    if (delta > thresholdM) { ascent += delta; anchor = v; }
    else if (delta < -thresholdM) { descent -= delta; anchor = v; }
  }
  return { ascent: Math.round(ascent * 10) / 10, descent: Math.round(descent * 10) / 10 };
}

export interface WatchElevationResult {
  ascent: number | null;
  descent: number | null;
  corrected: boolean;
}

export function saneWatchElevation(input: {
  ascent: number | null | undefined;
  descent: number | null | undefined;
  distanceM: number | null | undefined;
  altitudes?: Array<number | null | undefined>;
}): WatchElevationResult {
  const distanceM = Math.max(0, Number(input.distanceM) || 0);
  const recount = input.altitudes ? ascentDescentFromAltitudes(input.altitudes) : null;
  const gradientCap = distanceM * 0.5 + 30;
  const seriesMargin = Math.max(150, distanceM * 0.05);

  const check = (reported: number | null | undefined, fromSeries: number | undefined) => {
    if (reported == null || !Number.isFinite(Number(reported))) {
      return { value: reported ?? null, bad: false };
    }
    const r = Number(reported);
    const bad =
      r < 0 ||
      r > gradientCap ||
      (fromSeries != null && r > fromSeries + seriesMargin);
    if (!bad) return { value: r, bad: false };
    return { value: fromSeries ?? null, bad: true };
  };

  const a = check(input.ascent, recount?.ascent);
  const d = check(input.descent, recount?.descent);
  return { ascent: a.value as number | null, descent: d.value as number | null, corrected: a.bad || d.bad };
}
