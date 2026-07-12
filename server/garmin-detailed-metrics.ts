/**
 * Garmin Detailed Metrics Extraction
 *
 * Helper functions to extract and format detailed run metrics from Garmin API data
 * including pace data, km splits, heart rate data, GPS track, and elevation profiles.
 */

// ─── Shared types ────────────────────────────────────────────────────────────

/** Canonical km-split shape understood by the Android app. */
export interface KmSplitRecord {
  km:        number;   // 1-based km number
  time:      number;   // split duration in milliseconds
  pace:      string;   // "M:SS" e.g. "5:22"
  duration:  number;   // split duration in seconds (convenience alias)
  distance?: number;   // km (always 1.0 for full km, <1 for partial final split)
  hr?:       number | null;
  cadence?:  number | null;
  elevGain?: number | null;
}

// ─── Helper: seconds to "M:SS" string ────────────────────────────────────────

function secsToMSS(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0:00';
  const mins = Math.floor(totalSec / 60);
  const secs = Math.round(totalSec % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── Helper: Haversine distance between two lat/lng points (metres) ───────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Core algorithm: compute km splits from any per-point time-series ─────────

/**
 * Compute accurate km splits from a per-second (or per-point) GPS/sensor
 * time-series.  Works with **both** Garmin formats:
 *
 *  • **Webhook samples**  `{startTimeInSeconds, totalDistanceInMeters, speedMetersPerSecond, heartRate, cadence, altitude}`
 *  • **Companion app**    `{elapsedTime, cumulativeDistance, heartRate, cadence, altitude}`
 *
 * The algorithm:
 *   1. Normalise each point to `{elapsedSec, distanceM, hr, cadence, altitude}`.
 *   2. Walk the series; when cumulative distance crosses a km boundary, interpolate
 *      the exact crossing time.
 *   3. Compute `duration = crossTime - prevCrossTime`.
 *   4. Average HR, cadence, and elevation gain over points within that km window.
 *
 * @param samples       Raw sample array in either format.
 * @param totalDistKm   Optional total distance from activity summary (used to add
 *                      a partial final-km split if the run ended mid-km).
 * @returns             Array of KmSplitRecord, or `[]` if insufficient data.
 */
export function computeKmSplitsFromSamples(
  samples: any[],
  totalDistKm?: number,
): KmSplitRecord[] {
  if (!samples || samples.length < 5) return [];

  // ── 1. Normalise points ──────────────────────────────────────────────────
  interface Pt {
    elapsedSec: number;
    distM:      number;
    hr:         number | null;
    cadence:    number | null;
    altitude:   number | null;
  }

  const firstTimeSec = samples[0].startTimeInSeconds ?? null;

  const pts: Pt[] = [];
  for (const s of samples) {
    // Elapsed time: companion uses `elapsedTime` (sec); webhook uses `startTimeInSeconds`
    const elapsedSec: number =
      typeof s.elapsedTime     === 'number' ? s.elapsedTime :
      typeof s.timerDuration   === 'number' ? s.timerDuration :  // companion alias
      (typeof s.startTimeInSeconds === 'number' && firstTimeSec !== null)
        ? s.startTimeInSeconds - firstTimeSec
        : null as any;
    if (elapsedSec == null || elapsedSec < 0) continue;

    // Cumulative distance in metres
    const distM: number =
      typeof s.cumulativeDistance    === 'number' ? s.cumulativeDistance :
      typeof s.totalDistanceInMeters === 'number' ? s.totalDistanceInMeters :
      typeof s.distance              === 'number' ? s.distance : -1;
    if (distM < 0) continue;

    pts.push({
      elapsedSec,
      distM,
      hr:       typeof s.heartRate === 'number' && s.heartRate > 0   ? s.heartRate : null,
      cadence:  typeof s.cadence   === 'number' && s.cadence   > 0   ? s.cadence   : null,
      altitude: typeof s.altitude  === 'number'                       ? s.altitude  : null,
    });
  }

  if (pts.length < 5) return [];

  // Sort by elapsed time (safety — data should already be ordered)
  pts.sort((a, b) => a.elapsedSec - b.elapsedSec);

  // ── 2. Walk through points and detect km crossings ───────────────────────
  const splits: KmSplitRecord[] = [];
  let nextBoundaryM = 1000;
  let prevCrossTime = pts[0].elapsedSec;   // time at start (or last km boundary)
  let prevIdx       = 0;                    // index of last km boundary point

  for (let i = 1; i < pts.length; i++) {
    const curr = pts[i];

    if (curr.distM >= nextBoundaryM) {
      // Interpolate exact crossing time
      const prev     = pts[i - 1];
      const span     = Math.max(curr.distM - prev.distM, 0.01);
      const frac     = (nextBoundaryM - prev.distM) / span;
      const crossSec = prev.elapsedSec + frac * (curr.elapsedSec - prev.elapsedSec);

      const durSec  = Math.max(Math.round(crossSec - prevCrossTime), 1);
      const paceSecPerKm = durSec;  // for 1km, duration_in_seconds === seconds-per-km

      // Average HR, cadence, elevation over this km window
      const slice  = pts.slice(prevIdx, i + 1);
      const hrs    = slice.filter(p => p.hr    != null).map(p => p.hr!);
      const cads   = slice.filter(p => p.cadence != null).map(p => p.cadence!);
      const alts   = slice.filter(p => p.altitude != null).map(p => p.altitude!);
      const elevGain = alts.length >= 2
        ? alts.reduce((acc, v, idx) => idx > 0 && v > alts[idx - 1] ? acc + (v - alts[idx - 1]) : acc, 0)
        : 0;

      splits.push({
        km:       splits.length + 1,
        time:     durSec * 1000,          // milliseconds — matches phone KmSplit.time
        pace:     secsToMSS(paceSecPerKm),
        duration: durSec,
        distance: 1.0,
        hr:       hrs.length > 0    ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
        cadence:  cads.length > 0   ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : null,
        elevGain: alts.length >= 2  ? Math.round(elevGain * 10) / 10 : null,
      });

      prevCrossTime = crossSec;
      prevIdx       = i;
      nextBoundaryM += 1000;
    }
  }

  // ── 3. Partial final-km split ────────────────────────────────────────────
  // Add if the remaining distance is ≥ 100m (avoid a near-zero stub).
  const lastPt     = pts[pts.length - 1];
  const remaining  = lastPt.distM - (nextBoundaryM - 1000);  // metres in final partial km
  if (remaining >= 100 && splits.length > 0) {
    const durSec = Math.max(Math.round(lastPt.elapsedSec - prevCrossTime), 1);
    const distKm = remaining / 1000;
    const paceSecPerKm = distKm > 0 ? Math.round(durSec / distKm) : 0;

    const slice    = pts.slice(prevIdx);
    const hrs      = slice.filter(p => p.hr      != null).map(p => p.hr!);
    const cads     = slice.filter(p => p.cadence != null).map(p => p.cadence!);
    const alts     = slice.filter(p => p.altitude != null).map(p => p.altitude!);
    const elevGain = alts.length >= 2
      ? alts.reduce((acc, v, idx) => idx > 0 && v > alts[idx - 1] ? acc + (v - alts[idx - 1]) : acc, 0)
      : 0;

    splits.push({
      km:       splits.length + 1,
      time:     durSec * 1000,
      pace:     paceSecPerKm > 0 ? secsToMSS(paceSecPerKm) : '0:00',
      duration: durSec,
      distance: Math.round(distKm * 1000) / 1000,
      hr:       hrs.length  > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      cadence:  cads.length > 0 ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : null,
      elevGain: alts.length >= 2 ? Math.round(elevGain * 10) / 10 : null,
    });
  }

  return splits;
}

// ─── Compute km splits from a stored GPS track (phone or Garmin format) ──────

/**
 * Returns `true` if all km splits in an array have the same duration — which is
 * the telltale sign that Garmin divided total_time / total_km instead of tracking
 * each km boundary.
 */
export function hasIdenticalKmSplits(splits: any[]): boolean {
  if (!splits || splits.length < 2) return false;
  const first = splits[0].duration ?? Math.round((splits[0].time ?? 0) / 1000);
  if (first <= 0) return false;
  return splits.every(s => {
    const dur = s.duration ?? Math.round((s.time ?? 0) / 1000);
    return Math.abs(dur - first) <= 1;   // within 1 second → treat as identical
  });
}

/**
 * Compute accurate km splits from a GPS track array in phone-upload format:
 *   `{lat, lng, timestamp, speed?, heartRate?, cadence?, altitude?}`
 *
 * where `timestamp` is **elapsed seconds** since run start (not epoch).
 *
 * Strategy:
 *  1. Use Haversine between consecutive lat/lng pairs to get cumulative distance.
 *  2. Find exact km-boundary crossing times via linear interpolation.
 *  3. Average HR, cadence, and elevation gain per km window.
 *
 * Falls back to `computeKmSplitsFromSamples` if the track lacks lat/lng but has
 * speed + timestamp (rare, but defensive).
 */
export function computeKmSplitsFromGpsTrack(gpsTrack: any[]): KmSplitRecord[] {
  if (!gpsTrack || gpsTrack.length < 5) return [];

  // Normalise: some tracks use {lat,lng} others use {latitude,longitude}
  interface GptPt {
    lat:       number;
    lng:       number;
    timeSec:   number;   // elapsed seconds
    hr:        number | null;
    cadence:   number | null;
    altitude:  number | null;
  }

  const pts: GptPt[] = [];
  let cumDistM = 0;

  // Parallel cumulative-distance array so we can interpolate crossings
  const cumDists: number[] = [];

  for (const p of gpsTrack) {
    const lat = p.lat ?? p.latitude;
    const lng = p.lng ?? p.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    // timestamp is elapsed seconds in phone format; fallback to startTimeInSeconds
    const timeSec: number =
      typeof p.timestamp === 'number'            ? p.timestamp            :
      typeof p.elapsedTime === 'number'          ? p.elapsedTime          :
      typeof p.startTimeInSeconds === 'number'   ? p.startTimeInSeconds   : -1;
    if (timeSec < 0) continue;

    if (pts.length > 0) {
      const prev = pts[pts.length - 1];
      cumDistM += haversineM(prev.lat, prev.lng, lat, lng);
    }

    pts.push({
      lat, lng, timeSec,
      hr:       typeof p.heartRate === 'number' && p.heartRate > 0 ? p.heartRate : null,
      cadence:  typeof p.cadence   === 'number' && p.cadence   > 0 ? p.cadence   : null,
      altitude: typeof p.altitude  === 'number'                     ? p.altitude  : null,
    });
    cumDists.push(cumDistM);
  }

  if (pts.length < 5 || cumDistM < 1000) return [];

  // ── Walk through points and detect km crossings ──────────────────────────
  const splits: KmSplitRecord[] = [];
  let nextBoundaryM = 1000;
  let prevCrossTime = pts[0].timeSec;
  let prevIdx       = 0;

  for (let i = 1; i < pts.length; i++) {
    if (cumDists[i] >= nextBoundaryM) {
      const prevDist = cumDists[i - 1];
      const currDist = cumDists[i];
      const frac     = (nextBoundaryM - prevDist) / Math.max(currDist - prevDist, 0.01);
      const crossSec = pts[i - 1].timeSec + frac * (pts[i].timeSec - pts[i - 1].timeSec);

      const durSec       = Math.max(Math.round(crossSec - prevCrossTime), 1);
      const paceSecPerKm = durSec;   // 1 km → duration = pace

      const slice    = pts.slice(prevIdx, i + 1);
      const hrs      = slice.filter(p => p.hr      != null).map(p => p.hr!);
      const cads     = slice.filter(p => p.cadence != null).map(p => p.cadence!);
      const alts     = slice.filter(p => p.altitude != null).map(p => p.altitude!);
      const elevGain = alts.length >= 2
        ? alts.reduce((acc, v, idx) => idx > 0 && v > alts[idx - 1] ? acc + (v - alts[idx - 1]) : acc, 0)
        : 0;

      splits.push({
        km:       splits.length + 1,
        time:     durSec * 1000,
        pace:     secsToMSS(paceSecPerKm),
        duration: durSec,
        distance: 1.0,
        hr:       hrs.length  > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
        cadence:  cads.length > 0 ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : null,
        elevGain: alts.length >= 2 ? Math.round(elevGain * 10) / 10 : null,
      });

      prevCrossTime = crossSec;
      prevIdx       = i;
      nextBoundaryM += 1000;
    }
  }

  // ── Partial final-km split (≥ 100 m) ────────────────────────────────────
  const remaining = cumDists[pts.length - 1] - (nextBoundaryM - 1000);
  if (remaining >= 100 && splits.length > 0) {
    const lastPt   = pts[pts.length - 1];
    const durSec   = Math.max(Math.round(lastPt.timeSec - prevCrossTime), 1);
    const distKm   = remaining / 1000;
    const paceSecPerKm = distKm > 0 ? Math.round(durSec / distKm) : 0;

    const slice    = pts.slice(prevIdx);
    const hrs      = slice.filter(p => p.hr      != null).map(p => p.hr!);
    const cads     = slice.filter(p => p.cadence != null).map(p => p.cadence!);
    const alts     = slice.filter(p => p.altitude != null).map(p => p.altitude!);
    const elevGain = alts.length >= 2
      ? alts.reduce((acc, v, idx) => idx > 0 && v > alts[idx - 1] ? acc + (v - alts[idx - 1]) : acc, 0)
      : 0;

    splits.push({
      km:       splits.length + 1,
      time:     durSec * 1000,
      pace:     paceSecPerKm > 0 ? secsToMSS(paceSecPerKm) : '0:00',
      duration: durSec,
      distance: Math.round(distKm * 1000) / 1000,
      hr:       hrs.length  > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      cadence:  cads.length > 0 ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : null,
      elevGain: alts.length >= 2 ? Math.round(elevGain * 10) / 10 : null,
    });
  }

  return splits;
}

// ─── Heart rate ───────────────────────────────────────────────────────────────

/**
 * Extract heart rate data from Garmin samples.
 */
export function extractHeartRateData(
  samples: any[],
  avgHeartRate?: number,
  maxHeartRate?: number,
  minHeartRate?: number,
) {
  if (!samples || samples.length === 0) {
    return { min: minHeartRate || 0, max: maxHeartRate || 0, avg: avgHeartRate || 0, samples: [] };
  }

  const heartRateSamples = samples
    .filter(s => s.heartRate !== undefined && s.heartRate > 0)
    .map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000,
      hr: sample.heartRate,
    }));

  return { min: minHeartRate || 0, max: maxHeartRate || 0, avg: avgHeartRate || 0, samples: heartRateSamples };
}

// ─── Pace data ────────────────────────────────────────────────────────────────

/**
 * Extract pace data from Garmin samples with timestamps.
 */
export function extractPaceData(samples: any[], avgPaceMinPerKm?: number) {
  if (!samples || samples.length === 0) {
    return { avg: avgPaceMinPerKm || 0, samples: [] };
  }

  const paceSamples = samples
    .filter(s => s.speedMetersPerSecond !== undefined && s.speedMetersPerSecond > 0)
    .map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000,
      pace: 1000 / sample.speedMetersPerSecond / 60, // min/km
    }));

  return { avg: avgPaceMinPerKm || 0, samples: paceSamples };
}

// ─── Garmin auto-lap splits (fallback only) ───────────────────────────────────

/**
 * Convert Garmin auto-lap `detail.splits` to the app's KmSplitRecord format.
 *
 * **This is a fallback** used only when no per-second sample data is available.
 * Garmin auto-lap records often contain identical pace values because they average
 * over the whole run rather than tracking each km boundary individually.  Always
 * prefer `computeKmSplitsFromSamples` when samples are present.
 */
export function extractKmSplits(splits: any[]): KmSplitRecord[] {
  if (!splits || splits.length === 0) return [];

  return splits.map((split, index) => {
    const distKm      = (split.distanceInMeters || 0) / 1000;
    const durSec      = split.durationInSeconds || split.timerDurationInSeconds || 0;
    const paceMinPerKm = distKm > 0 ? (durSec / 60) / distKm : 0;
    const paceSecPerKm = Math.round(paceMinPerKm * 60);

    return {
      km:       split.displayOrder ?? (index + 1),
      time:     durSec * 1000,
      pace:     paceSecPerKm > 0 ? secsToMSS(paceSecPerKm) : '0:00',
      duration: durSec,
      distance: distKm,
      hr:       split.averageHeartRateInBeatsPerMinute ?? null,
      cadence:  split.averageCadenceInStepsPerMinute   ?? null,
      elevGain: split.elevationGainInMeters             ?? null,
    };
  });
}

// ─── GPS track ────────────────────────────────────────────────────────────────

/**
 * Extract GPS track data from Garmin samples.
 */
export function extractGpsTrack(samples: any[]) {
  if (!samples || samples.length === 0) return undefined;

  const gpsPoints = samples
    .filter(s => s.latitude !== undefined && s.longitude !== undefined)
    .map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000,
      lat:       sample.latitude,
      lng:       sample.longitude,
      altitude:  sample.altitude,
      pace:      sample.speedMetersPerSecond > 0 ? 1000 / sample.speedMetersPerSecond / 60 : null,
      hr:        sample.heartRate,
    }));

  return gpsPoints.length > 0 ? { samples: gpsPoints } : undefined;
}

// ─── Elevation profile ────────────────────────────────────────────────────────

/**
 * Extract elevation profile from Garmin samples.
 */
export function extractElevationProfile(samples: any[]) {
  if (!samples || samples.length === 0) return [];

  return samples
    .filter(s => s.altitude !== undefined)
    .map(sample => ({
      timestamp: (sample.startTimeInSeconds || 0) * 1000,
      elevation: sample.altitude,
      distance:  sample.totalDistanceInMeters || 0,
    }));
}

// ─── Top-level builder ────────────────────────────────────────────────────────

/**
 * Build comprehensive detailed metrics from a Garmin activity.
 *
 * Km splits are computed from per-second samples when available (accurate);
 * falls back to auto-lap `splits` records otherwise (less accurate).
 */
export function buildDetailedMetricsFromGarminActivity(activity: any) {
  // Prefer GPS time-series for accurate per-km splits; fall back to lap records
  const computedSplits = computeKmSplitsFromSamples(
    activity.samples ?? [],
    activity.distanceInMeters != null ? activity.distanceInMeters / 1000 : undefined,
  );
  const kmSplits = computedSplits.length > 0
    ? computedSplits
    : extractKmSplits(activity.splits ?? []);

  return {
    paceData:         extractPaceData(activity.samples, activity.averagePaceInMinutesPerKilometer),
    heartRateData:    extractHeartRateData(
                        activity.samples,
                        activity.averageHeartRateInBeatsPerMinute,
                        activity.maxHeartRateInBeatsPerMinute,
                      ),
    kmSplits,
    gpsTrack:         extractGpsTrack(activity.samples),
    elevationProfile: extractElevationProfile(activity.samples),
  };
}
