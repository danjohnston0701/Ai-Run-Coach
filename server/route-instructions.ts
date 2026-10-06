/**
 * Spoken turn instructions for run-with-route navigation.
 *
 * GraphHopper's raw instructions are written for drivers and include entries that aren't
 * decisions at all ("Continue onto Queen Street" when only the name changes, "Waypoint 1" at
 * the loop's hidden via-points, "Arrive at destination"). Both apps used to speak whatever came
 * back — and iOS couldn't decode the GraphHopper shape at all (its TurnInstructionDto needs
 * `instruction` + `distance`), so iOS route runs had no spoken turns.
 *
 * buildSpokenInstructions() keeps only real decisions, words them for a runner (no compass
 * bearings or degrees — street names where OpenStreetMap has them), chains turns that come
 * within CLOSE_TURN_M of each other ("Turn left onto King Street, then right onto Queen
 * Street"), and emits every field either app reads:
 *   text / instruction   the spoken instruction (Android reads `text`, iOS `instruction`)
 *   lat / lng            where the manoeuvre happens (polyline vertex)
 *   distance             metres from the START of the route to the manoeuvre (iOS fallback,
 *                        and Android's TurnInstruction.distance after /1000)
 *   interval             GraphHopper polyline index range (Android derives lat/lng from it)
 *   sign, streetName, legDistance, thenText   extra context
 */

/** Two decisions closer than this are announced together. */
export const CLOSE_TURN_M = 60;
/**
 * Decisions closer than this are one manoeuvre, judged by the NET change of direction. Footpath
 * routing turns every road crossing into "turn right, then immediately turn left" (onto the
 * crossing, then back onto the pavement) — which is really "go straight across".
 */
export const MERGE_TURN_M = 30;

export interface RawRouteInstruction {
  text?: string;
  street_name?: string;
  distance?: number;
  time?: number;
  interval?: [number, number];
  sign?: number;
  exit_number?: number;
  [key: string]: unknown;
}

export interface SpokenInstruction {
  text: string;
  instruction: string;
  lat: number;
  lng: number;
  distance: number;      // metres from route start
  legDistance: number;   // metres until the next spoken instruction (or route end)
  interval: [number, number];
  sign: number;
  streetName: string | null;
  thenText: string | null;
}

// GraphHopper turn signs
const SIGN = {
  U_TURN_UNKNOWN: -98, U_TURN_LEFT: -8, KEEP_LEFT: -7, LEAVE_ROUNDABOUT: -6,
  SHARP_LEFT: -3, LEFT: -2, SLIGHT_LEFT: -1, CONTINUE: 0, SLIGHT_RIGHT: 1, RIGHT: 2,
  SHARP_RIGHT: 3, FINISH: 4, VIA_REACHED: 5, ROUNDABOUT: 6, KEEP_RIGHT: 7, U_TURN_RIGHT: 8,
} as const;

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function cleanStreet(name: string | undefined | null): string | null {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  return n.length > 0 ? n : null;
}

/** The action alone, e.g. "Turn left", "At the roundabout, take the second exit". Null = not a decision. */
function actionFor(sign: number, exitNumber?: number): string | null {
  switch (sign) {
    case SIGN.SHARP_LEFT: return "Turn sharp left";
    case SIGN.LEFT: return "Turn left";
    case SIGN.SLIGHT_LEFT: return "Bear left";
    case SIGN.KEEP_LEFT: return "Keep left";
    case SIGN.SHARP_RIGHT: return "Turn sharp right";
    case SIGN.RIGHT: return "Turn right";
    case SIGN.SLIGHT_RIGHT: return "Bear right";
    case SIGN.KEEP_RIGHT: return "Keep right";
    case SIGN.U_TURN_LEFT:
    case SIGN.U_TURN_RIGHT:
    case SIGN.U_TURN_UNKNOWN: return "Turn around";
    case SIGN.ROUNDABOUT: {
      const ord = exitNumber && exitNumber >= 1 && exitNumber <= ORDINALS.length ? ORDINALS[exitNumber - 1] : null;
      return ord ? `At the roundabout, take the ${ord} exit` : "At the roundabout, take your exit";
    }
    default: return null; // CONTINUE, FINISH, VIA_REACHED, LEAVE_ROUNDABOUT — not a spoken decision
  }
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}

/** "Turn left" + "King Street" → "Turn left onto King Street"; a named roundabout is "at", not "onto". */
function withStreet(action: string, street: string | null): string {
  if (!street) return action;
  return /\broundabout$/i.test(street) && !/roundabout/i.test(action) ? `${action} at ${street}` : `${action} onto ${street}`;
}

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function normalise180(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Action for a net change of direction (degrees, + = right). Null = effectively straight. */
function actionForNetAngle(net: number): { action: string; sign: number } | null {
  const a = Math.abs(net), right = net > 0;
  if (a < 30) return null;
  if (a < 60) return { action: right ? "Bear right" : "Bear left", sign: right ? SIGN.SLIGHT_RIGHT : SIGN.SLIGHT_LEFT };
  if (a < 150) return { action: right ? "Turn right" : "Turn left", sign: right ? SIGN.RIGHT : SIGN.LEFT };
  return { action: right ? "Turn sharp right" : "Turn sharp left", sign: right ? SIGN.SHARP_RIGHT : SIGN.SHARP_LEFT };
}

/**
 * @param raw     GraphHopper instructions (interval indexes into `coords`)
 * @param coords  route coordinates as [lng, lat, ...] (GraphHopper / encodePolyline order)
 */
export function buildSpokenInstructions(raw: RawRouteInstruction[], coords: Array<[number, number, ...number[]]>): SpokenInstruction[] {
  if (!Array.isArray(raw) || raw.length === 0 || !Array.isArray(coords) || coords.length < 2) return [];

  // Cumulative metres at each coordinate
  const cum: number[] = new Array(coords.length).fill(0);
  for (let i = 1; i < coords.length; i++) {
    cum[i] = cum[i - 1] + haversineM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  const total = cum[cum.length - 1];

  type Decision = { action: string; street: string | null; sign: number; idx: number; interval: [number, number] };
  const decisions: Decision[] = [];
  raw.forEach((inst, k) => {
    const sign = typeof inst.sign === "number" ? inst.sign : SIGN.CONTINUE;
    const action = actionFor(sign, inst.exit_number);
    if (!action) return;
    const start = Math.max(0, Math.min(coords.length - 1, inst.interval?.[0] ?? 0));
    if (k === 0 && cum[start] < 1) return; // a "turn" at the very first point is the start, not a decision
    const end = Math.max(start, Math.min(coords.length - 1, inst.interval?.[1] ?? start));
    decisions.push({ action, street: cleanStreet(inst.street_name), sign, idx: start, interval: [start, end] });
  });

  // Point `m` metres along the route (clamped), for measuring the direction in/out of a junction.
  const pointAt = (m: number): [number, number] => {
    const t = Math.max(0, Math.min(total, m));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= t) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo];
    const f = seg > 0 ? (t - cum[lo]) / seg : 0;
    return [coords[lo][1] + f * (coords[hi][1] - coords[lo][1]), coords[lo][0] + f * (coords[hi][0] - coords[lo][0])];
  };
  const headingBetween = (fromM: number, toM: number) => {
    const [aLat, aLng] = pointAt(fromM), [bLat, bLng] = pointAt(toM);
    return bearingDeg(aLat, aLng, bLat, bLng);
  };

  // Collapse decisions within MERGE_TURN_M of each other into one manoeuvre (see MERGE_TURN_M).
  const clusters: Decision[][] = [];
  for (const d of decisions) {
    const last = clusters[clusters.length - 1];
    // Measured from the cluster's FIRST decision, so a chain of close turns can't grow into a 50 m jog.
    if (last && cum[d.idx] - cum[last[0].idx] < MERGE_TURN_M) last.push(d);
    else clusters.push([d]);
  }
  const deduped: Decision[] = clusters.flatMap((c): Decision[] => {
    if (c.length === 1) return c;
    const first = c[0], last = c[c.length - 1];
    const roundabout = c.find(d => d.sign === SIGN.ROUNDABOUT);
    if (roundabout) return [{ ...roundabout, idx: first.idx, interval: [first.idx, last.interval[1]], street: last.street ?? roundabout.street }];
    const sIn = cum[first.idx], sOut = cum[last.idx];
    const net = normalise180(headingBetween(sOut, sOut + 15) - headingBetween(sIn - 15, sIn));
    const merged = actionForNetAngle(net);
    if (!merged) {
      if (sOut - sIn < 8) return []; // a kink in the path, not a decision
      return [{ action: "Go straight across", street: last.street, sign: SIGN.CONTINUE, idx: first.idx, interval: [first.idx, last.interval[1]] }];
    }
    return [{ ...merged, street: last.street, idx: first.idx, interval: [first.idx, last.interval[1]] }];
  });

  // "Go straight across onto King Street" right after turning onto King Street → just "Go straight across".
  deduped.forEach((d, i) => {
    if (d.sign === SIGN.CONTINUE && d.street && i > 0 && deduped[i - 1].street === d.street) d.street = null;
  });

  return deduped.map((d, i) => {
    const here = cum[d.idx];
    const next = deduped[i + 1];
    const gapToNext = next ? cum[next.idx] - here : null;
    const base = withStreet(d.action, d.street);
    let thenText: string | null = null;
    if (next && gapToNext !== null && gapToNext < CLOSE_TURN_M) {
      const nextBase = withStreet(next.action, next.street);
      // "then immediately" when there's no time to settle; otherwise give the gap.
      thenText = gapToNext < 30
        ? `then immediately ${lowerFirst(nextBase)}`
        : `then in ${Math.round(gapToNext / 10) * 10} metres, ${lowerFirst(nextBase)}`;
    }
    const text = thenText ? `${base}, ${thenText}` : base;
    return {
      text,
      instruction: text,
      lat: coords[d.idx][1],
      lng: coords[d.idx][0],
      distance: Math.round(here),
      legDistance: Math.round((next ? cum[next.idx] : total) - here),
      interval: d.interval,
      sign: d.sign,
      streetName: d.street,
      thenText,
    };
  });
}
