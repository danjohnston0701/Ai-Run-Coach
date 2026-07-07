import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Play, Square, Download, Loader2, Video, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// ─── Brand colours ────────────────────────────────────────────────────────────
const TEAL       = "#00BFFF";   // hsl(190 100% 50%) – AI Run Coach primary
const TEAL_GLOW  = "rgba(0,191,255,0.35)";
const WHITE      = "#ffffff";

// ─── Recording canvas dimensions (9:16 portrait – perfect for stories / reels) ─
const CW = 1080;
const CH = 1920;

// ─── Free tile sources (no API key) ───────────────────────────────────────────
// Satellite imagery: ESRI World Imagery (CORS enabled — already used elsewhere).
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Global elevation: AWS "terrarium" terrain-RGB tiles (CORS enabled, no key).
const TERRAIN_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

// ─── Animation timeline (ms) ──────────────────────────────────────────────────
const INTRO_MS  = 2200;    // zoom/tilt into the start (slow, cinematic)
const FOLLOW_MS = 18000;   // drone follow along the route (slower = smoother)
const OUTRO_MS  = 3400;    // pull up to reveal the whole route
const TOTAL_MS  = INTRO_MS + FOLLOW_MS + OUTRO_MS;
const HOLD_MS   = 1400;    // hold the final frame before stopping the recorder

// ─── Camera tuning ────────────────────────────────────────────────────────────
const FOLLOW_ZOOM     = 16.0;
const FOLLOW_PITCH    = 70;   // low, cinematic drone angle (more horizon, less top-down)
const LOOKAHEAD_M     = 95;   // camera centres this far ahead of the marker
const BRG_LOOKAHEAD_M = 150;  // travel direction sampled over a longer span (smoother turns)
const POS_SMOOTH      = 0.09; // camera-position easing per frame (lower = smoother/floatier)
const BRG_SMOOTH      = 0.04; // camera-bearing easing per frame (lower = gentler turns)
const SUPERSAMPLE     = 1.25; // render the map above output res, then downscale = crisper
const PULSE_MS        = 1600; // marker energy-ring pulse period

// ─── Geo helpers ──────────────────────────────────────────────────────────────
type LngLat = [number, number]; // [lng, lat]

function haversine(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a: LngLat, b: LngLat): number {
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Shortest angular interpolation (handles the 359°→1° wrap-around).
function lerpAngle(from: number, to: number, t: number): number {
  let diff = ((to - from + 540) % 360) - 180;
  return (from + diff * t + 360) % 360;
}

// Moving-average smoothing to tame raw GPS jitter, so both the drawn line and
// the camera path glide instead of jerking around. Endpoints are preserved.
function smoothPath(coords: LngLat[], radius = 3): LngLat[] {
  if (coords.length <= 2) return coords;
  const out: LngLat[] = [];
  for (let i = 0; i < coords.length; i++) {
    let sx = 0, sy = 0, n = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      if (j < 0 || j >= coords.length) continue;
      sx += coords[j][0]; sy += coords[j][1]; n++;
    }
    out.push([sx / n, sy / n]);
  }
  out[0] = coords[0];
  out[out.length - 1] = coords[coords.length - 1];
  return out;
}

// Rounded-rect path with a fallback for older canvas engines.
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === "function") { (ctx as any).roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Animate the marker's two energy rings (expand + fade), phase-offset for rhythm.
function pulseMarker(map: maplibregl.Map, t: number) {
  const p1 = (t % PULSE_MS) / PULSE_MS;
  const p2 = ((t + PULSE_MS / 2) % PULSE_MS) / PULSE_MS;
  try {
    map.setPaintProperty("headPulse1", "circle-radius", 12 + p1 * 48);
    map.setPaintProperty("headPulse1", "circle-stroke-opacity", 0.6 * (1 - p1));
    map.setPaintProperty("headPulse2", "circle-radius", 12 + p2 * 48);
    map.setPaintProperty("headPulse2", "circle-stroke-opacity", 0.45 * (1 - p2));
  } catch { /* layers not ready yet — ignore */ }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────
// Stopwatch clock (m:ss, or h:mm:ss past an hour) — used for the counting-up timer.
function fmtClock(totalSeconds: number): string {
  const s   = Math.max(0, Math.floor(totalSeconds));
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function fmtDist(meters: number, units: "km" | "mi"): string {
  if (units === "mi") return (meters / 1609.344).toFixed(1);
  return (meters / 1000).toFixed(2);
}
function fmtElev(meters: number, units: "km" | "mi"): string {
  if (units === "mi") return `${Math.round(meters * 3.28084)}`;
  return `${Math.round(meters)}`;
}
function fmtDate(ts: string | number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RunVideoShare() {
  const [, params] = useRoute("/run-video/:id");
  const [, setLocation] = useLocation();
  const runId = params?.id;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null); // compositor (map + overlays), this is what we record
  const animRef         = useRef<number>(0);
  const recorderRef     = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const startTsRef      = useRef<number>(0);
  const stopTimeoutRef  = useRef<number | null>(null);

  // Route geometry
  const coordsRef  = useRef<LngLat[]>([]);
  const cumRef     = useRef<number[]>([]);
  const totalRef   = useRef<number>(0);
  const timeFracRef = useRef<number[] | null>(null); // real elapsed-time fraction per point (0..1)
  const dispBearingRef = useRef<number>(0);
  const dispCenterRef  = useRef<LngLat>([0, 0]); // smoothed (chase) camera centre
  const lastCamRef = useRef<{ center: LngLat; zoom: number; pitch: number; bearing: number } | null>(null);
  const overviewCamRef = useRef<{ center: LngLat; zoom: number } | null>(null);

  const [run, setRun]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg]   = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus]   = useState<"idle" | "playing" | "recording" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [hasRoute, setHasRoute] = useState(false);
  const [units] = useState<"km" | "mi">(() => {
    try {
      const p = JSON.parse(localStorage.getItem("userProfile") || "{}");
      return p.preferredUnits === "imperial" ? "mi" : "km";
    } catch { return "km"; }
  });

  // ── Fetch run ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!runId) return;
    const token = (() => { try { return JSON.parse(localStorage.getItem("userProfile") || "{}").token; } catch { return null; } })();
    fetch(`/api/runs/${runId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => { setRun(data); setLoading(false); })
      .catch(() => { setErrMsg("Could not load this run."); setLoading(false); });
  }, [runId]);

  // ── Normalise route points → coords + cumulative distances ──────────────────
  useEffect(() => {
    if (!run) return;
    // Backend returns routePoints as { latitude, longitude, timestamp }; older/phone
    // formats may use { lat, lng, time }. Parse coord + timestamp together and drop
    // invalids as pairs, so the timestamp array stays index-aligned with the coords.
    const parsed = (Array.isArray(run.routePoints) ? run.routePoints : [])
      .map((p: any) => ({
        lng: Number(p?.longitude ?? p?.lng),
        lat: Number(p?.latitude  ?? p?.lat),
        ts:  Number(p?.timestamp ?? p?.time ?? NaN),
      }))
      .filter((p: any) => Number.isFinite(p.lng) && Number.isFinite(p.lat));

    const raw: LngLat[] = parsed.map((p: any): LngLat => [p.lng, p.lat]);
    const coords = smoothPath(raw);
    coordsRef.current = coords;

    const cum: number[] = [0];
    for (let i = 1; i < coords.length; i++) {
      cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
    }
    cumRef.current = cum;
    totalRef.current = cum[cum.length - 1] || 0;

    // Build a genuine elapsed-time fraction per point from the recorded timestamps.
    // Normalising by the total span makes it unit-agnostic (epoch ms or seconds) and
    // pins the end to the real total time — the *shape* comes from real pace changes.
    const ts: number[] = parsed.map((p: any) => p.ts);
    let timeFrac: number[] | null = null;
    if (ts.length === coords.length && ts.every(Number.isFinite)) {
      const span = ts[ts.length - 1] - ts[0];
      if (span > 0) {
        // Clamp to [0,1] so an out-of-order spike can't push the timer past the real
        // total, then enforce monotonic-increasing so it never ticks backwards.
        timeFrac = ts.map(t => Math.min(1, Math.max(0, (t - ts[0]) / span)));
        for (let i = 1; i < timeFrac.length; i++) {
          if (timeFrac[i] < timeFrac[i - 1]) timeFrac[i] = timeFrac[i - 1];
        }
        timeFrac[0] = 0; timeFrac[timeFrac.length - 1] = 1; // anchor endpoints exactly
      }
    }
    timeFracRef.current = timeFrac;

    dispBearingRef.current = coords.length >= 2 ? bearing(coords[0], coords[1]) : 0;
    // Need at least a couple of points AND some real distance — a cluster of
    // duplicate GPS fixes would otherwise produce a frozen, pointless flyover.
    setHasRoute(coords.length >= 2 && (cum[cum.length - 1] || 0) > 50);
  }, [run]);

  // ── Interpolate a point (and travel bearing) at a distance along the route ──
  const interpAt = useCallback((dist: number): { pos: LngLat; brg: number } => {
    const coords = coordsRef.current;
    const cum    = cumRef.current;
    const n      = coords.length;
    if (n === 0) return { pos: [0, 0], brg: 0 };
    if (n === 1) return { pos: coords[0], brg: 0 };
    const d = Math.max(0, Math.min(dist, totalRef.current));

    // binary-ish linear scan (routes are small enough)
    let i = 1;
    while (i < n && cum[i] < d) i++;
    const lo = i - 1, hi = Math.min(i, n - 1);
    const seg = cum[hi] - cum[lo] || 1;
    const t = (d - cum[lo]) / seg;
    const pos: LngLat = [
      coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t,
      coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t,
    ];
    return { pos, brg: bearing(coords[lo], coords[hi]) };
  }, []);

  const buildProgressLine = useCallback((dist: number) => {
    const coords = coordsRef.current;
    const cum    = cumRef.current;
    const d = Math.max(0, Math.min(dist, totalRef.current));
    const line: LngLat[] = [];
    for (let i = 0; i < coords.length; i++) {
      if (cum[i] <= d) line.push(coords[i]);
      else break;
    }
    const head = interpAt(d).pos;
    if (line.length === 0) line.push(coords[0] ?? head);
    line.push(head);
    return line;
  }, [interpAt]);

  // ── Initialise the MapLibre map once we have a route ────────────────────────
  useEffect(() => {
    if (!run || !mapContainerRef.current || mapRef.current) return;
    const coords = coordsRef.current;
    if (coords.length < 2) { setMapReady(true); return; }

    const start = coords[0];

    // Render the map at (approximately) the compositor's native resolution so the
    // recorded frame is crisp instead of an upscaled blur. We size the container in
    // CSS px = target / devicePixelRatio, so the WebGL canvas comes out ~1080×1920
    // at the correct 9:16 aspect (no stretching). It sits behind the compositor,
    // which is what the user actually sees, so overflow past the preview box is fine.
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round((CW * SUPERSAMPLE) / dpr);
    const cssH = Math.round(cssW * (CH / CW)); // enforce exact 9:16 from one dimension
    mapContainerRef.current.style.width  = `${cssW}px`;
    mapContainerRef.current.style.height = `${cssH}px`;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      // preserveDrawingBuffer is REQUIRED so we can copy the WebGL canvas each frame.
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      attributionControl: false,
      interactive: false,
      center: start,
      zoom: 13.5,
      pitch: 45,
      bearing: dispBearingRef.current,
      maxPitch: 85,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [SATELLITE_TILES],
            tileSize: 256,
            maxzoom: 19,
            attribution: "Esri, Maxar, Earthstar Geographics",
          },
          terrain: {
            type: "raster-dem",
            tiles: [TERRAIN_TILES],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 15,
            attribution: "Mapzen / AWS Terrain Tiles",
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#0a0a0f" } },
          { id: "satellite", type: "raster", source: "satellite" },
        ],
      },
    });
    mapRef.current = map;

    map.on("load", () => {
      try {
        map.setTerrain({ source: "terrain", exaggeration: 1.5 });
      } catch { /* terrain unsupported — continue flat */ }

      try {
        map.setSky({
          "sky-color": "#7fb4e6",
          "horizon-color": "#cfe3f2",
          "fog-color": "#e6eef5",
          "sky-horizon-blend": 0.6,
          "horizon-fog-blend": 0.5,
          "fog-ground-blend": 0.5,
        });
      } catch { /* sky unsupported on this build — ignore */ }

      const fullLine = { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} };
      map.addSource("routeFull",     { type: "geojson", data: fullLine as any });
      map.addSource("routeProgress", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [start, start] }, properties: {} } as any });
      map.addSource("head",          { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: start }, properties: {} } as any });

      map.addLayer({ id: "routeFull", type: "line", source: "routeFull",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-opacity": 0.22, "line-width": 5 } });
      // Aurora ribbon: a wide soft glow, a teal body, and a bright white-hot core.
      map.addLayer({ id: "routeProgressGlow", type: "line", source: "routeProgress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": TEAL, "line-width": 34, "line-blur": 26, "line-opacity": 0.5 } });
      map.addLayer({ id: "routeProgress", type: "line", source: "routeProgress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": TEAL, "line-width": 12 } });
      map.addLayer({ id: "routeCore", type: "line", source: "routeProgress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#eaffff", "line-width": 4, "line-opacity": 0.9 } });
      // Signature marker: two expanding energy rings + soft glow + white-hot core.
      map.addLayer({ id: "headPulse1", type: "circle", source: "head",
        paint: { "circle-radius": 12, "circle-opacity": 0, "circle-stroke-color": TEAL, "circle-stroke-width": 3, "circle-stroke-opacity": 0.6 } });
      map.addLayer({ id: "headPulse2", type: "circle", source: "head",
        paint: { "circle-radius": 12, "circle-opacity": 0, "circle-stroke-color": TEAL, "circle-stroke-width": 3, "circle-stroke-opacity": 0.45 } });
      map.addLayer({ id: "headGlow", type: "circle", source: "head",
        paint: { "circle-radius": 24, "circle-color": TEAL, "circle-opacity": 0.4, "circle-blur": 1 } });
      map.addLayer({ id: "headDot", type: "circle", source: "head",
        paint: { "circle-radius": 9, "circle-color": WHITE, "circle-stroke-color": TEAL, "circle-stroke-width": 4 } });

      // Pre-compute the "whole route" overview camera used for the outro.
      const bounds = coords.reduce(
        (b, c) => b.extend(c as any),
        new maplibregl.LngLatBounds(coords[0] as any, coords[0] as any),
      );
      try {
        const cam: any = map.cameraForBounds(bounds, { pitch: 24, bearing: 0, padding: 48 });
        if (cam?.center) {
          const c = cam.center;
          overviewCamRef.current = {
            center: [Array.isArray(c) ? c[0] : c.lng, Array.isArray(c) ? c[1] : c.lat],
            zoom: cam.zoom ?? 13,
          };
        }
      } catch { /* keep null; outro falls back to follow cam */ }

      // Frame the start (intro end-state) so the idle preview already looks good.
      const ahead = interpAt(LOOKAHEAD_M).pos;
      dispCenterRef.current = ahead;
      map.jumpTo({ center: ahead, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current });

      map.once("idle", () => {
        setMapReady(true);
        compositeFrame(0, 0);
      });
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // ── Draw the 2D overlay: branded intro card cross-fading into the flight HUD ─
  const drawOverlay = useCallback((ctx: CanvasRenderingContext2D, routeProgress: number, tMs: number, run: any, units: "km" | "mi") => {
    const runName    = run?.name || run?.routeName || "Run Summary";
    const totalDistM = run?.distance || 0;
    const elevGain   = run?.totalElevationGain || 0;
    const totalDurSec = run?.totalTime ?? run?.movingTime ?? run?.duration ?? 0;
    const dateStr    = fmtDate(run?.completedAt || run?.date || null);
    const distUnit   = units === "mi" ? "MILES" : "KILOMETRES";

    // Genuine elapsed time at the marker's actual position on the track: interpolate
    // the real per-point timestamps. Falls back to even pace if the run has none.
    const cumArr = cumRef.current;
    const tfArr  = timeFracRef.current;
    const trackTotal = totalRef.current || 0;
    let elapsedFrac = routeProgress;
    if (tfArr && cumArr.length === tfArr.length && trackTotal > 0 && routeProgress > 0) {
      const d = routeProgress * trackTotal;
      let i = 1;
      while (i < cumArr.length && cumArr[i] < d) i++;
      if (i >= cumArr.length) i = cumArr.length - 1;
      const seg = (d - cumArr[i - 1]) / ((cumArr[i] - cumArr[i - 1]) || 1);
      elapsedFrac = tfArr[i - 1] + (tfArr[i] - tfArr[i - 1]) * seg;
    }
    elapsedFrac = Math.max(0, Math.min(1, elapsedFrac));

    // Cross-fade: title card owns the intro, the HUD takes over once we're flying.
    const introFade = Math.max(0, Math.min(1, (INTRO_MS - tMs) / 500));
    const hudFade   = 1 - introFade;

    // ── Intro title card ──
    if (introFade > 0.01) {
      ctx.save();
      ctx.globalAlpha = introFade;
      const scrim = ctx.createLinearGradient(0, 0, 0, CH);
      scrim.addColorStop(0,   "rgba(3,6,14,0.60)");
      scrim.addColorStop(0.5, "rgba(3,6,14,0.22)");
      scrim.addColorStop(1,   "rgba(3,6,14,0.60)");
      ctx.fillStyle = scrim; ctx.fillRect(0, 0, CW, CH);

      ctx.textAlign = "center";
      ctx.fillStyle = TEAL; ctx.font = "bold 42px 'Inter', sans-serif"; ctx.letterSpacing = "8px";
      ctx.fillText("AI RUN COACH", CW / 2, CH * 0.38); ctx.letterSpacing = "0px";

      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "500 46px 'Inter', sans-serif";
      ctx.fillText(runName, CW / 2, CH * 0.45);

      ctx.save();
      ctx.shadowColor = TEAL_GLOW; ctx.shadowBlur = 45;
      ctx.fillStyle = WHITE; ctx.font = "bold 210px 'Inter', sans-serif";
      ctx.fillText(fmtDist(totalDistM, units), CW / 2, CH * 0.60);
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "600 42px 'Inter', sans-serif"; ctx.letterSpacing = "6px";
      ctx.fillText(distUnit, CW / 2, CH * 0.655); ctx.letterSpacing = "0px";
      ctx.restore();
    }

    // ── Flight HUD ──
    if (hudFade > 0.01) {
      ctx.save();
      ctx.globalAlpha = hudFade;

      // Top-left brand lockup
      ctx.save();
      ctx.shadowColor = TEAL_GLOW; ctx.shadowBlur = 18;
      ctx.fillStyle = TEAL;
      ctx.beginPath(); ctx.arc(56, 58, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = "bold 30px 'Inter', sans-serif"; ctx.letterSpacing = "3px";
      ctx.fillText("AI RUN COACH", 82, 68); ctx.letterSpacing = "0px";
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "30px 'Inter', sans-serif";
      ctx.fillText(runName, 56, 116);

      // Bottom glass stat panel
      const pad = 40, panelH = 250, panelY = CH - panelH - 56, panelW = CW - pad * 2;
      ctx.save();
      roundRectPath(ctx, pad, panelY, panelW, panelH, 34);
      ctx.fillStyle = "rgba(6,11,22,0.55)"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,191,255,0.35)"; ctx.stroke();
      ctx.restore();

      const stats = [
        { label: "TIME",     value: fmtClock(totalDurSec * elapsedFrac),        unit: "" },
        { label: "DISTANCE", value: fmtDist(totalDistM * routeProgress, units), unit: units, hero: true },
        { label: "ELEV",     value: fmtElev(elevGain * routeProgress, units),   unit: units === "mi" ? "ft" : "m" },
      ] as { label: string; value: string; unit: string; hero?: boolean }[];
      const colW = panelW / 3;
      ctx.textAlign = "center";
      stats.forEach((s, i) => {
        const cx = pad + colW * i + colW / 2;
        ctx.fillStyle = TEAL; ctx.font = "600 26px 'Inter', sans-serif"; ctx.letterSpacing = "3px";
        ctx.fillText(s.label, cx, panelY + 60); ctx.letterSpacing = "0px";
        if (s.hero) { ctx.save(); ctx.shadowColor = TEAL_GLOW; ctx.shadowBlur = 26; }
        ctx.fillStyle = WHITE; ctx.font = `bold ${s.hero ? 106 : 78}px 'Inter', sans-serif`;
        ctx.fillText(s.value, cx, panelY + (s.hero ? 152 : 142));
        if (s.hero) ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "26px 'Inter', sans-serif";
        ctx.fillText(s.unit, cx, panelY + 194);
      });
      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 2;
      [pad + colW, pad + colW * 2].forEach(dx => { ctx.beginPath(); ctx.moveTo(dx, panelY + 44); ctx.lineTo(dx, panelY + panelH - 44); ctx.stroke(); });

      if (dateStr) {
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "26px 'Inter', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(dateStr, CW / 2, CH - 26);
      }
      ctx.restore();
    }

    // Progress bar (always, with a soft glow)
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(0, CH - 6, CW, 6);
    const g = ctx.createLinearGradient(0, 0, CW, 0);
    g.addColorStop(0, TEAL); g.addColorStop(1, "#8affff");
    ctx.shadowColor = TEAL_GLOW; ctx.shadowBlur = 16;
    ctx.fillStyle = g; ctx.fillRect(0, CH - 6, CW * routeProgress, 6);
    ctx.restore();
  }, []);

  // ── Composite the map WebGL canvas + overlay into the recording canvas ──────
  const compositeFrame = useCallback((routeProgress: number, tMs: number) => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, CW, CH);

    // Map imagery with a cinematic colour grade (supersampled → downscaled = crisp).
    if (map) {
      const mc = map.getCanvas();
      if (mc.width > 0 && mc.height > 0) {
        ctx.save();
        ctx.filter = "saturate(1.22) contrast(1.08) brightness(1.03)";
        try { ctx.drawImage(mc, 0, 0, CW, CH); } catch { /* tainted-canvas guard */ }
        ctx.restore();
      }
    }

    // Atmospheric depth haze — melts the far, low-res distance into brand air.
    const haze = ctx.createLinearGradient(0, 0, 0, CH * 0.5);
    haze.addColorStop(0,   "rgba(122,170,202,0.42)");
    haze.addColorStop(0.5, "rgba(122,170,202,0.10)");
    haze.addColorStop(1,   "rgba(122,170,202,0)");
    ctx.fillStyle = haze; ctx.fillRect(0, 0, CW, CH * 0.5);

    // Cinematic vignette (under the HUD so text stays crisp).
    const vig = ctx.createRadialGradient(CW / 2, CH * 0.46, CW * 0.30, CW / 2, CH * 0.5, CH * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(3,5,12,0.55)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, CW, CH);

    drawOverlay(ctx, routeProgress, tMs, run, units);
  }, [drawOverlay, run, units]);

  // ── Animation driver ────────────────────────────────────────────────────────
  const runAnimation = useCallback((record: boolean) => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map || coordsRef.current.length < 2) return;

    cancelAnimationFrame(animRef.current);
    chunksRef.current = [];
    dispBearingRef.current = bearing(coordsRef.current[0], coordsRef.current[1]);
    dispCenterRef.current = interpAt(LOOKAHEAD_M).pos;

    if (record) {
      try {
        const stream   = canvas.captureStream(30);
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement("a");
          a.href     = url;
          a.download = `run-summary-${runId || "video"}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          setStatus("done");
        };
        recorder.start(100);
        recorderRef.current = recorder;
      } catch { /* recording unsupported — still play */ }
    }

    startTsRef.current = performance.now();
    setStatus(record ? "recording" : "playing");

    const total = totalRef.current;

    const tick = (now: number) => {
      const t = now - startTsRef.current;
      const overall = Math.min(t / TOTAL_MS, 1);
      setProgress(overall);

      let routeProgress: number;

      if (t < INTRO_MS) {
        // ── Intro: slow, eased tilt + zoom into the start ──
        const k = t / INTRO_MS;
        const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
        routeProgress = 0;
        const ahead = interpAt(LOOKAHEAD_M).pos;
        dispCenterRef.current = ahead;
        map.jumpTo({
          center: ahead,
          zoom:  13.4 + (FOLLOW_ZOOM - 13.4) * e,
          pitch: 38   + (FOLLOW_PITCH - 38) * e,
          bearing: dispBearingRef.current,
        });
        lastCamRef.current = { center: [ahead[0], ahead[1]], zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current };
      } else if (t < INTRO_MS + FOLLOW_MS) {
        // ── Follow: a floaty "chase" drone that trails the marker ──
        routeProgress = (t - INTRO_MS) / FOLLOW_MS;
        const d = routeProgress * total;
        const head  = interpAt(d).pos;
        const ahead = interpAt(Math.min(d + LOOKAHEAD_M, total)).pos;

        // Travel direction sampled over a long span so gentle bends don't jerk the camera.
        const brgFrom = interpAt(Math.max(0, d - 20)).pos;
        const brgTo   = interpAt(Math.min(d + BRG_LOOKAHEAD_M, total)).pos;
        const targetBrg = bearing(brgFrom, brgTo);
        dispBearingRef.current = lerpAngle(dispBearingRef.current, targetBrg, BRG_SMOOTH);

        // Ease the camera centre toward the look-ahead point (smooth glide, no snapping).
        dispCenterRef.current = [
          dispCenterRef.current[0] + (ahead[0] - dispCenterRef.current[0]) * POS_SMOOTH,
          dispCenterRef.current[1] + (ahead[1] - dispCenterRef.current[1]) * POS_SMOOTH,
        ];

        map.getSource("routeProgress") && (map.getSource("routeProgress") as any).setData({
          type: "Feature", geometry: { type: "LineString", coordinates: buildProgressLine(d) }, properties: {},
        });
        (map.getSource("head") as any)?.setData({
          type: "Feature", geometry: { type: "Point", coordinates: head }, properties: {},
        });
        map.jumpTo({ center: dispCenterRef.current as any, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current });
        lastCamRef.current = { center: [dispCenterRef.current[0], dispCenterRef.current[1]], zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current };
        pulseMarker(map, t);
      } else {
        // ── Outro: pull up and out to reveal the whole route ──
        routeProgress = 1;
        (map.getSource("routeProgress") as any)?.setData({
          type: "Feature", geometry: { type: "LineString", coordinates: coordsRef.current }, properties: {},
        });
        const end = interpAt(total).pos;
        (map.getSource("head") as any)?.setData({
          type: "Feature", geometry: { type: "Point", coordinates: end }, properties: {},
        });
        const from = lastCamRef.current!;
        const ov   = overviewCamRef.current;
        const k = Math.min((t - INTRO_MS - FOLLOW_MS) / OUTRO_MS, 1);
        const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
        if (ov && from) {
          map.jumpTo({
            center: [
              from.center[0] + (ov.center[0] - from.center[0]) * e,
              from.center[1] + (ov.center[1] - from.center[1]) * e,
            ],
            zoom:  from.zoom  + (ov.zoom  - from.zoom)  * e,
            pitch: from.pitch + (24       - from.pitch) * e,
            bearing: lerpAngle(from.bearing, 0, e),
          });
        }
        pulseMarker(map, t);
      }

      compositeFrame(routeProgress, t);

      if (t < TOTAL_MS) {
        animRef.current = requestAnimationFrame(tick);
      } else if (record && recorderRef.current?.state === "recording") {
        stopTimeoutRef.current = window.setTimeout(() => recorderRef.current?.stop(), HOLD_MS);
      } else {
        setStatus("done");
      }
    };

    animRef.current = requestAnimationFrame(tick);
  }, [runId, interpAt, buildProgressLine, compositeFrame]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (stopTimeoutRef.current !== null) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setStatus("idle");
    setProgress(0);
    // Reset visuals back to the framed start
    const map = mapRef.current;
    const coords = coordsRef.current;
    if (map && coords.length >= 2) {
      (map.getSource("routeProgress") as any)?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [coords[0], coords[0]] }, properties: {} });
      (map.getSource("head") as any)?.setData({ type: "Feature", geometry: { type: "Point", coordinates: coords[0] }, properties: {} });
      dispBearingRef.current = bearing(coords[0], coords[1]);
      const ahead = interpAt(LOOKAHEAD_M).pos;
      dispCenterRef.current = ahead;
      map.jumpTo({ center: ahead, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current });
      map.once("idle", () => compositeFrame(0, 0));
    }
  }, [interpAt, compositeFrame]);

  useEffect(() => () => {
    cancelAnimationFrame(animRef.current);
    if (stopTimeoutRef.current !== null) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
    if (recorderRef.current?.state === "recording") { try { recorderRef.current.stop(); } catch { /* already stopped */ } }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading run data…</p>
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-foreground font-medium">{errMsg}</p>
        <Button variant="outline" onClick={() => setLocation("/history")}>Back to history</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <button
          onClick={() => setLocation(`/history/${runId}`)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="text-white font-bold text-base">Share Run Video</h1>
          <p className="text-white/40 text-xs">3D flyover of your run</p>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 flex flex-col items-center px-4 py-6 gap-6">
        <div
          className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#0a0a0f]"
          style={{ width: "min(360px, 100%)", aspectRatio: "9/16" }}
        >
          {/* MapLibre renders here (underneath) at native res; the compositor covers it. */}
          <div ref={mapContainerRef} className="absolute top-0 left-0 origin-top-left" />
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            className="absolute inset-0 w-full h-full"
            data-testid="canvas-run-video"
          />
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-white/70 text-sm">Building 3D map…</span>
              </div>
            </div>
          )}
          {!hasRoute && mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center px-6">
                <p className="text-white/60 text-sm">No GPS track available for this run</p>
              </div>
            </div>
          )}
        </div>

        {/* Status badge */}
        {status === "recording" && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/15 border border-red-500/30">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-red-400 text-sm font-medium">Recording… {Math.round(progress * 100)}%</span>
          </div>
        )}
        {status === "playing" && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
            <Play className="w-3 h-3 text-primary fill-primary" />
            <span className="text-primary text-sm font-medium">Playing preview… {Math.round(progress * 100)}%</span>
          </div>
        )}
        {status === "done" && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20">
            <Download className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-sm font-medium">Video downloaded!</span>
          </div>
        )}

        {/* Controls */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          {(status === "idle" || status === "done") && mapReady && (
            <>
              <Button
                onClick={() => runAnimation(false)}
                variant="outline"
                className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                data-testid="button-preview"
                disabled={!hasRoute}
              >
                <Play className="w-4 h-4 mr-2" />
                Preview Flyover
              </Button>
              <Button
                onClick={() => runAnimation(true)}
                className="w-full font-bold"
                style={{ background: TEAL, color: "#000" }}
                data-testid="button-record"
                disabled={!hasRoute}
              >
                <Video className="w-4 h-4 mr-2" />
                Record &amp; Download Video
              </Button>
            </>
          )}

          {(status === "playing" || status === "recording") && (
            <Button
              onClick={stopAll}
              variant="outline"
              className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
              data-testid="button-stop"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          )}
        </div>

        {/* Info note */}
        <p className="text-white/30 text-xs text-center max-w-xs leading-relaxed">
          A 3D drone-style flyover of your route, saved as a .webm you can share to Instagram, WhatsApp, or any platform.
        </p>
      </div>
    </div>
  );
}
