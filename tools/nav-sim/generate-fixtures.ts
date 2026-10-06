/**
 * Run-with-route navigation simulation — fixture generator.
 *
 *   npx tsx tools/nav-sim/generate-fixtures.ts                 (OpenStreetMap walking loops)
 *   npx tsx tools/nav-sim/generate-fixtures.ts --graphhopper   (+ real routes from the production
 *        generator, server/intelligent-route-generation.ts — needs GRAPHHOPPER_API_KEY and
 *        EXTERNAL_DATABASE_URL in .env; it only reads the DB)
 *
 * Builds real walking loops from OpenStreetMap (public OSRM foot router), converts each step
 * into GraphHopper's instruction shape (sign / interval / street_name / exit_number) and runs
 * them through the production server's buildSpokenInstructions() — so the turn list is exactly
 * what the apps receive. Then synthesises 1 Hz GPS tracks for a set of runner behaviours.
 *
 * Every fix carries `s`, the runner's TRUE position along the route in metres (null while
 * genuinely off it), so evaluate.ts can score cue timing against reality instead of noisy GPS.
 *
 * Output: app/src/test/resources/nav/*.json — replayed by Android's RouteNavigatorSimulationTest
 * and the iOS harness (tools/nav-sim/ios/), both of which write transcripts that evaluate.ts scores.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { buildSpokenInstructions, type RawRouteInstruction } from "../../server/route-instructions";

const OUT = join(process.cwd(), "app/src/test/resources/nav"); // run from the repo root
const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";

// ── Deterministic RNG so fixtures are reproducible ─────────────────────────
let seed = 1;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => { const u = Math.max(1e-9, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ── Geometry ───────────────────────────────────────────────────────────────
type LL = { lat: number; lng: number };
const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
function dist(a: LL, b: LL) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function offset(p: LL, eastM: number, northM: number): LL {
  return { lat: p.lat + northM / 111320, lng: p.lng + eastM / (111320 * Math.cos(rad(p.lat))) };
}
function bearing(a: LL, b: LL) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
function move(p: LL, bearingDeg: number, m: number): LL {
  return offset(p, m * Math.sin(rad(bearingDeg)), m * Math.cos(rad(bearingDeg)));
}

/** Resample a polyline at `step` metres; returns points + their along-route metres. */
function resample(coords: LL[], step = 1): { p: LL; s: number }[] {
  const out: { p: LL; s: number }[] = [{ p: coords[0], s: 0 }];
  let s = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i], d = dist(a, b);
    if (d === 0) continue;
    let t = (out.length * step - s) / d;
    while (t <= 1) {
      out.push({ p: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }, s: out.length * step });
      t = (out.length * step - s) / d;
    }
    s += d;
  }
  return out;
}

// ── OSRM → GraphHopper instruction shape ───────────────────────────────────
function decodePolyline6(str: string): LL[] {
  const pts: LL[] = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, result = 0;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }
  return pts;
}

function ghSign(type: string, modifier?: string): number {
  if (type === "arrive") return 5;            // via-point (the final one becomes 4 below)
  if (type === "roundabout" || type === "rotary" || type === "roundabout turn") return 6;
  if (type === "exit roundabout" || type === "exit rotary") return -6;
  if (type === "fork") return modifier?.includes("left") ? -7 : 7;
  if (type === "new name" || type === "continue" && (modifier === "straight" || !modifier) || type === "depart") return 0;
  switch (modifier) {
    case "sharp left": return -3; case "left": return -2; case "slight left": return -1;
    case "sharp right": return 3; case "right": return 2; case "slight right": return 1;
    case "uturn": return -98; default: return 0;
  }
}

async function osrmLoop(waypoints: LL[]): Promise<{ coords: LL[]; raw: RawRouteInstruction[]; isRoundaboutAt: Set<number> }> {
  const url = `${OSRM}/${waypoints.map(w => `${w.lng},${w.lat}`).join(";")}?steps=true&geometries=polyline6&overview=false`;
  const res = await fetch(url);
  const json: any = await res.json();
  if (json.code !== "Ok") throw new Error(`OSRM: ${json.code} ${json.message ?? ""}`);
  const coords: LL[] = [];
  const raw: RawRouteInstruction[] = [];
  const isRoundaboutAt = new Set<number>();
  const legs = json.routes[0].legs;
  legs.forEach((leg: any, li: number) => {
    leg.steps.forEach((st: any) => {
      const g = decodePolyline6(st.geometry);
      const startIdx = coords.length === 0 ? 0 : coords.length - 1;
      g.forEach((p, k) => { if (coords.length === 0 || k > 0) coords.push(p); });
      const type = st.maneuver.type as string;
      let sign = ghSign(type, st.maneuver.modifier);
      if (type === "arrive" && li === legs.length - 1) sign = 4;
      if (type === "depart" && li > 0) return; // continuation after a via-point
      if (sign === 6) isRoundaboutAt.add(startIdx);
      raw.push({ text: `${type} ${st.maneuver.modifier ?? ""}`.trim(), street_name: st.name || "", distance: st.distance,
        interval: [startIdx, coords.length - 1], sign, exit_number: st.maneuver.exit });
    });
  });
  return { coords, raw, isRoundaboutAt };
}

// ── Track synthesis ────────────────────────────────────────────────────────
type Fix = { t: number; lat: number; lng: number; acc: number; speed: number; s: number | null };
type Behaviour = {
  name: string; description: string;
  paceSecPerKm: number;
  sideOffsetM: number;          // pavement offset from the line (sign alternates per instruction leg)
  cornerCutM: number;           // smoothing window (±m) — rounds corners, crosses roundabouts
  noiseM: number; driftM: number;
  stops?: { atM: number; seconds: number }[];
  canyon?: { fromM: number; toM: number; biasM: number };   // urban-canyon / tree-cover drift
  missTurn?: number;            // index into spoken turns: run straight past it
  wrongTurn?: number;           // index: turn the wrong way for 250 m, then come back
  shortcut?: { fromFrac: number; toFrac: number };
};

function synthesize(route: LL[], turnsM: number[], b: Behaviour): Fix[] {
  const path = resample(route, 1);
  const total = path[path.length - 1].s;
  const at = (s: number) => path[Math.max(0, Math.min(path.length - 1, Math.round(s)))];
  // Intended path: offset + smoothing (corner cutting)
  const side = (s: number) => { const k = turnsM.filter(m => m <= s).length; return (k % 2 === 0 ? 1 : -1) * b.sideOffsetM; };
  const intended = (s: number): LL => {
    const w = b.cornerCutM; let lat = 0, lng = 0, n = 0;
    for (let d = -w; d <= w; d += 2) { const q = at(s + d).p; lat += q.lat; lng += q.lng; n++; }
    const c = { lat: lat / n, lng: lng / n };
    const brg = bearing(at(s - 3).p, at(s + 3).p);
    return move(c, brg + 90, side(s));
  };

  const v = 1000 / b.paceSecPerKm;
  const fixes: Fix[] = [];
  let t = 0, s = 0, bx = 0, by = 0;
  const emit = (truth: LL, sTrue: number | null, speed: number, extraBias = 0, accOverride?: number) => {
    bx = 0.85 * bx + gauss() * b.driftM * 0.5; by = 0.85 * by + gauss() * b.driftM * 0.5;
    const nx = bx + gauss() * b.noiseM + extraBias, ny = by + gauss() * b.noiseM;
    const p = offset(truth, nx, ny);
    const err = Math.hypot(nx, ny);
    const acc = accOverride ?? Math.max(3, Math.min(30, err * 0.8 + 4 + rand() * 4));
    fixes.push({ t: t * 1000, lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7), acc: +acc.toFixed(1),
      speed: +(Math.max(0, speed + gauss() * 0.2)).toFixed(2), s: sTrue === null ? null : +sTrue.toFixed(1) });
    t++;
  };
  const canyonBias = (sv: number) => b.canyon && sv >= b.canyon.fromM && sv <= b.canyon.toM ? b.canyon.biasM : 0;
  const canyonAcc = (sv: number) => (b.canyon && sv >= b.canyon.fromM && sv <= b.canyon.toM ? 12 + rand() * 10 : undefined);

  // Off-route excursion: run `outM` along `brg` from `from`, pause, come back.
  const excursion = (from: LL, brg: number, outM: number, sAt: number) => {
    for (let d = 0; d < outM; d += v) emit(move(from, brg, d), d < 25 ? sAt : null, v);
    for (let k = 0; k < 4; k++) emit(move(from, brg, outM), null, 0);          // stop, look at phone
    for (let d = outM; d > 0; d -= v) emit(move(from, brg, d), d < 25 ? sAt : null, v);
  };

  const stops = [...(b.stops ?? [])];
  const missAt = b.missTurn !== undefined ? turnsM[b.missTurn] : null;
  const wrongAt = b.wrongTurn !== undefined ? turnsM[b.wrongTurn] : null;
  let missDone = false, wrongDone = false, shortcutDone = false;
  while (s < total) {
    if (stops.length && s >= stops[0].atM) {
      const st = stops.shift()!;
      for (let k = 0; k < st.seconds; k++) emit(intended(s), s, 0);
    }
    if (missAt !== null && !missDone && s >= missAt) {
      missDone = true;
      const brg = bearing(at(missAt - 25).p, at(missAt).p);   // keep going straight
      excursion(at(missAt).p, brg, 160, missAt);
    }
    if (wrongAt !== null && !wrongDone && s >= wrongAt) {
      wrongDone = true;
      const inB = bearing(at(wrongAt - 20).p, at(wrongAt).p);
      const outB = bearing(at(wrongAt).p, at(wrongAt + 20).p);
      const turnSign = ((outB - inB + 540) % 360) - 180;       // + = route turns right
      excursion(at(wrongAt).p, inB + (turnSign >= 0 ? -90 : 90), 250, wrongAt);
    }
    if (b.shortcut && !shortcutDone && s >= total * b.shortcut.fromFrac) {
      shortcutDone = true;
      const from = at(s).p, toS = total * b.shortcut.toFrac, to = at(toS).p;
      const d = dist(from, to), brg = bearing(from, to);
      for (let x = 0; x < d; x += v) emit(move(from, brg, x), null, v);
      s = toS;
      continue;
    }
    emit(intended(s), s, v, canyonBias(s), canyonAcc(s));
    s += v * (1 + 0.06 * Math.sin(t / 37));
  }
  return fixes;
}

// ── Scenarios ──────────────────────────────────────────────────────────────
const PLACES: { id: string; name: string; waypoints: LL[] }[] = [
  { id: "belfast", name: "Belfast city centre (UK) — short blocks, close turns",
    waypoints: [{ lat: 54.5964, lng: -5.9301 }, { lat: 54.5934, lng: -5.9185 }, { lat: 54.5889, lng: -5.9235 }, { lat: 54.5964, lng: -5.9301 }] },
  { id: "miltonkeynes", name: "Milton Keynes (UK) — roundabouts and redways",
    waypoints: [{ lat: 52.0406, lng: -0.7594 }, { lat: 52.0458, lng: -0.7480 }, { lat: 52.0366, lng: -0.7440 }, { lat: 52.0406, lng: -0.7594 }] },
  { id: "auckland", name: "Auckland Ponsonby (NZ) — mixed suburban streets",
    waypoints: [{ lat: -36.8566, lng: 174.7466 }, { lat: -36.8487, lng: 174.7429 }, { lat: -36.8530, lng: 174.7355 }, { lat: -36.8566, lng: 174.7466 }] },
  { id: "chicago", name: "Chicago Lincoln Park (US) — grid + lakefront path",
    waypoints: [{ lat: 41.9214, lng: -87.6513 }, { lat: 41.9270, lng: -87.6370 }, { lat: 41.9160, lng: -87.6330 }, { lat: 41.9214, lng: -87.6513 }] },
  { id: "hydepark", name: "Hyde Park (London) — park paths, few street names",
    waypoints: [{ lat: 51.5073, lng: -0.1657 }, { lat: 51.5100, lng: -0.1550 }, { lat: 51.5045, lng: -0.1580 }, { lat: 51.5073, lng: -0.1657 }] },
];

const realistic = { paceSecPerKm: 330, sideOffsetM: 7, cornerCutM: 10, noiseM: 4, driftM: 3 };
/** A clear turn (≥ 60°, nothing else within 80 m) nearest the middle of the route — for miss/wrong-turn runs. */
function clearTurnNearMiddle(route: LL[], turnsM: number[], total: number, skip = -1): number {
  const path = resample(route, 1);
  const at = (m: number) => path[Math.max(0, Math.min(path.length - 1, Math.round(m)))].p;
  let best = -1, bestD = Infinity;
  turnsM.forEach((m, i) => {
    if (i === skip || m < 150 || m > total - 150) return;
    if ((i > 0 && m - turnsM[i - 1] < 80) || (i < turnsM.length - 1 && turnsM[i + 1] - m < 80)) return;
    const angle = Math.abs(((bearing(at(m), at(m + 25)) - bearing(at(m - 25), at(m)) + 540) % 360) - 180);
    if (angle < 60) return;
    const d = Math.abs(m - total / 2);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function behaviours(route: LL[], turnsM: number[], total: number): Behaviour[] {
  const nTurns = turnsM.length;
  const mid = Math.max(0, clearTurnNearMiddle(route, turnsM, total));
  const second = clearTurnNearMiddle(route, turnsM, total, mid);
  return [
    { name: "clean", description: "On the line, light GPS noise, 5:30/km", paceSecPerKm: 330, sideOffsetM: 0, cornerCutM: 0, noiseM: 2, driftM: 1 },
    { name: "realistic", description: "Pavement 7 m off the line, corners and roundabouts cut, GPS drift, two stops at lights", ...realistic,
      stops: [{ atM: total * 0.3, seconds: 35 }, { atM: total * 0.65, seconds: 25 }] },
    { name: "fast", description: "Realistic at 3:45/km", ...realistic, paceSecPerKm: 225 },
    { name: "slow", description: "Realistic at 7:30/km", ...realistic, paceSecPerKm: 450 },
    { name: "wide", description: "Far side of a wide road (15 m off) with heavy corner cutting", ...realistic, sideOffsetM: 15, cornerCutM: 20 },
    { name: "canyon", description: "Realistic + 400 m of tall-building/tree-cover drift (35 m bias, accuracy claims 12–22 m)", ...realistic,
      canyon: { fromM: total * 0.4, toM: total * 0.4 + 400, biasM: 35 } },
    { name: "missed_turn", description: "Runs ~160 m straight past a turn, stops, comes back and takes it", ...realistic, missTurn: mid },
    { name: "wrong_turn", description: "Turns the wrong way for 250 m, comes back", ...realistic, wrongTurn: second >= 0 ? second : Math.min(nTurns - 1, mid + 1) },
    { name: "shortcut", description: "Cuts straight across from 30% to 36% of the route and rejoins ahead", ...realistic, shortcut: { fromFrac: 0.30, toFrac: 0.36 } },
  ];
}

function writeFixtures(placeId: string, placeName: string, coords: LL[], turns: ReturnType<typeof buildSpokenInstructions>, rawCount: number) {
    const routeTotal = resample(coords, 1).slice(-1)[0].s;
    const turnsM = turns.map(t => t.distance);
    console.log(`\n${placeName}: ${(routeTotal / 1000).toFixed(2)} km, ${rawCount} raw → ${turns.length} spoken`);
    turns.forEach((t, i) => console.log(`  [${i}] ${String(t.distance).padStart(5)} m  ${t.text}`));
    for (const b of behaviours(coords, turnsM, routeTotal)) {
      seed = [...(placeId + b.name)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 4294967296;
      const fixes = synthesize(coords, turnsM, b);
      const fixture = {
        id: `${placeId}__${b.name}`, place: placeName, behaviour: b.name, description: b.description,
        expectOffRoute: !!(b.missTurn !== undefined || b.wrongTurn !== undefined || b.shortcut),
        deviationTurn: b.missTurn ?? b.wrongTurn ?? null,
        route: { points: coords.map(c => [+c.lat.toFixed(7), +c.lng.toFixed(7)]), totalM: Math.round(routeTotal) },
        turns: turns.map(t => ({ text: t.text, lat: t.lat, lng: t.lng, distance: t.distance, streetName: t.streetName })),
        rawInstructionCount: rawCount,
        fixes,
      };
      writeFileSync(join(OUT, `${fixture.id}.json`), JSON.stringify(fixture));
    }
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const place of PLACES) {
    const { coords, raw } = await osrmLoop(place.waypoints);
    const ghCoords = coords.map(c => [c.lng, c.lat] as [number, number]);
    writeFixtures(place.id, place.name, coords, buildSpokenInstructions(raw, ghCoords), raw.length);
  }
  if (process.argv.includes("--graphhopper")) {
    // Real routes from the production generator, started where the OSM loops start. Its output
    // already carries the spoken instructions (buildSpokenInstructions runs inside it).
    const { generateIntelligentRoute } = await import("../../server/intelligent-route-generation");
    for (const place of PLACES) {
      const start = place.waypoints[0];
      try {
        const routes = await generateIntelligentRoute({ latitude: start.lat, longitude: start.lng, distanceKm: 5 });
        const r: any = routes[0];
        const coords: LL[] = r.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] }));
        writeFixtures(`gh_${place.id}`, `${place.name} — GraphHopper`, coords, r.turnInstructions, r.turnInstructions.length);
      } catch (e: any) {
        console.log(`\n${place.name} — GraphHopper: FAILED ${e?.message ?? e}`);
      }
    }
  }
  console.log(`\nFixtures written to ${OUT}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
