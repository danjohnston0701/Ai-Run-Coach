import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Play, Square, Download, Loader2, Video, AlertCircle, Share2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// ─── Brand colours ────────────────────────────────────────────────────────────
const TEAL       = "#00BFFF";   // hsl(190 100% 50%) – AI Run Coach primary
const TEAL_GLOW  = "rgba(0,191,255,0.35)";
const WHITE      = "#ffffff";

// ─── Recording canvas dimensions (9:16 portrait – perfect for stories / reels) ─
// WKWebView has a substantially smaller WebGL/canvas rendering budget. Rendering
// its 2D fallback at 720p prevents the map + three route strokes from missing
// multiple consecutive frames; Android keeps its full-resolution WebGL output.
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const CW = isIOS ? 720 : 1080;
const CH = isIOS ? 1280 : 1920;

// ─── Free tile sources (no API key) ───────────────────────────────────────────
// Satellite imagery: ESRI World Imagery (CORS enabled — already used elsewhere).
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Global elevation: AWS "terrarium" terrain-RGB tiles (CORS enabled, no key).
const TERRAIN_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

// ─── Animation timeline (ms) ──────────────────────────────────────────────────
const INTRO_MS  = 1467;    // zoom/tilt into the start (slow, cinematic)
const OUTRO_MS  = 2267;    // pull up to reveal the whole route
const HOLD_MS   = 933;     // hold the final frame before stopping the recorder

// The drone-follow segment scales with run distance so a marathon isn't crammed into the
// same 12s as a 3km run. Square-root scaling keeps long runs watchable without dragging:
//   3km → 12s · 5km → 15s · 10km → 22s · half → 32s · marathon → 40s (capped).
// Speed increased by 50% vs original (durations divided by 1.5).
const FOLLOW_MS_BASE = 12000; // follow duration tuned for a ~3 km run
const followMsForMeters = (meters: number) => {
  const km = Math.max(0.5, (meters > 0 ? meters : 3000) / 1000);
  return Math.round(Math.min(40_000, Math.max(8_000, FOLLOW_MS_BASE * Math.sqrt(km / 3))));
};

// ─── Camera tuning ────────────────────────────────────────────────────────────
const FOLLOW_ZOOM     = 16.6;  // closer in = lower apparent altitude + more terrain detail
const FOLLOW_PITCH    = isIOS ? 58 : 76; // iOS uses a stable tilted satellite plane
const LOOKAHEAD_M     = 95;   // camera centres this far ahead of the marker
const BRG_LOOKAHEAD_M = 150;  // travel direction sampled over a longer span (smoother turns)
const POS_SMOOTH      = 0.09; // camera-position easing per frame (lower = smoother/floatier)
const BRG_SMOOTH      = 0.04; // camera-bearing easing per frame (lower = gentler turns)
const SUPERSAMPLE     = 1.25; // render the map above output res, then downscale = crisper
const PULSE_MS        = 1600; // marker energy-ring pulse period

// ─── Platform detection ───────────────────────────────────────────────────────
// iOS WKWebView blocks blob-URL Web Workers, which MapLibre uses for GeoJSON
// setData() processing — so on iOS we skip all MapLibre route layers and draw
// everything on the 2D compositor canvas instead.  On Android (which supports
// the full Web Worker API) we use the original MapLibre WebGL layers for the
// buttery-smooth, perspective-correct "drone follow" experience.

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
  const animationGenerationRef = useRef(0);
  const logoImgRef      = useRef<HTMLImageElement | null>(null);
  const recorderRef     = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const startTsRef      = useRef<number>(0);
  const stopTimeoutRef  = useRef<number | null>(null);

  // WebCodecs encoder path (produces a correct-duration H.264 MP4 — the MediaRecorder
  // MP4 muxer on Android WebView writes broken duration metadata, so players show ~3s).
  const videoEncoderRef = useRef<any>(null);
  const muxerRef        = useRef<any>(null);
  const useWebCodecsRef = useRef<boolean>(false);
  const lastEncMsRef    = useRef<number>(-1);
  const encFrameCountRef = useRef<number>(0);
  const webCodecsSupportedRef = useRef<boolean>(false); // set at mount via a real encode self-test
  const workingCodecRef = useRef<string>("avc1.42E029");// H.264 codec proven to encode on THIS device
  // Decoder config (avcC / SPS+PPS "description") captured during the self-test. Some Android
  // WebViews emit it on a single-frame flush but NOT during continuous real-time encoding, so we
  // reuse this proven one to seed the muxer when the live chunks arrive without it.
  const provenDecoderConfigRef = useRef<any>(null);
  const seededConfigRef = useRef<boolean>(false); // whether we seeded the muxer's decoderConfig (diagnostic)
  const muxStatsRef = useRef<{ added: number; failed: number; firstErr: string }>({ added: 0, failed: 0, firstErr: "" });
  const videoFileRef = useRef<{ blob: Blob; name: string } | null>(null); // finished video, kept so Download/Share can be tapped repeatedly
  const encErrRef       = useRef<string>("");           // first runtime encoder/frame error (surfaced to UI)

  // Route geometry
  const coordsRef  = useRef<LngLat[]>([]);
  const coords3dRef = useRef<number[][]>([]); // [lng, lat, alt?][] for GeoJSON sources
  const cumRef     = useRef<number[]>([]);
  const totalRef   = useRef<number>(0);
  const timeFracRef = useRef<number[] | null>(null); // real elapsed-time fraction per point (0..1)
  const altRef = useRef<number[] | null>(null); // real per-point altitude (metres), smoothed
  const rawAltRef  = useRef<number[] | null>(null); // raw GPS altitude per point (for 3D line rendering)
  const dispBearingRef = useRef<number>(0);
  const dispCenterRef  = useRef<LngLat>([0, 0]); // smoothed (chase) camera centre
  const lastCamRef = useRef<{ center: LngLat; zoom: number; pitch: number; bearing: number } | null>(null);
  const overviewCamRef = useRef<{ center: LngLat; zoom: number } | null>(null);

  const [run, setRun]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg]   = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus]   = useState<"idle" | "playing" | "recording" | "done" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [probeDone, setProbeDone] = useState(false); // WebCodecs self-test finished (record gated on this)
  const probeReasonRef = useRef<string>(""); // why WebCodecs was rejected (surfaced for on-device diagnosis)
  const [progress, setProgress] = useState(0);
  const [hasRoute, setHasRoute] = useState(false);
  const [units] = useState<"km" | "mi">(() => {
    try {
      const p = JSON.parse(localStorage.getItem("userProfile") || "{}");
      return p.preferredUnits === "imperial" ? "mi" : "km";
    } catch { return "km"; }
  });

  // ── Fetch run ───────────────────────────────────────────────────────────────
  // ── Preload brand logo for canvas overlay ────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.src = "/logo-with-text.png";
    img.onload = () => { logoImgRef.current = img; };
  }, []);

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
        alt: Number(p?.altitude  ?? p?.elevation ?? NaN),
      }))
      .filter((p: any) => Number.isFinite(p.lng) && Number.isFinite(p.lat));

    const raw: LngLat[] = parsed.map((p: any): LngLat => [p.lng, p.lat]);
    const coords = raw;
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

    // Genuine altitude profile from the recorded per-point altitudes, smoothed to tame
    // GPS noise. Lets the ALTITUDE readout rise and fall with the real terrain instead of
    // an evenly-climbing number. Null (→ linear-gain fallback) when the run has no altitudes.
    const alt: number[] = parsed.map((p: any) => p.alt);
    let altSmooth: number[] | null = null;
    if (alt.length === coords.length && alt.length > 1 && alt.every(Number.isFinite)) {
      const win = 4;
      altSmooth = alt.map((_, i) => {
        let s = 0, n = 0;
        for (let j = Math.max(0, i - win); j <= Math.min(alt.length - 1, i + win); j++) { s += alt[j]; n++; }
        return s / n;
      });
    }
    altRef.current = altSmooth;

    // Store raw altitude for 3D line rendering (bridges, overpasses, etc.)
    const rawAlts = (alt.length === coords.length && alt.length > 0 && alt.every(Number.isFinite)) ? alt : null;
    rawAltRef.current = rawAlts;

    // Build 3D coords [lng, lat, alt] — used for all GeoJSON map sources so the route
    // renders at its true GPS altitude rather than following the terrain DEM surface.
    // This correctly handles bridges, overpasses, and elevated paths.
    coords3dRef.current = coords.map((c, i) => {
      const a = rawAlts?.[i];
      return Number.isFinite(a!) ? [c[0], c[1], a!] : [c[0], c[1]];
    });

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
    const coords  = coordsRef.current;
    const coords3d = coords3dRef.current;
    const cum     = cumRef.current;
    const d = Math.max(0, Math.min(dist, totalRef.current));
    const line: number[][] = [];
    for (let i = 0; i < coords.length; i++) {
      if (cum[i] <= d) line.push(coords3d[i] ?? [coords[i][0], coords[i][1]]);
      else break;
    }
    const head = interpAt(d).pos;
    if (line.length === 0) line.push(coords3d[0] ?? [coords[0]?.[0] ?? head[0], coords[0]?.[1] ?? head[1]]);
    // Interpolate altitude for the fractional head position
    const rawAlts = rawAltRef.current;
    const headCoord: number[] = [head[0], head[1]];
    if (rawAlts && line.length > 0) {
      const lastPt = line[line.length - 1];
      if (lastPt.length === 3) headCoord.push(lastPt[2]); // inherit altitude of last known point
    }
    line.push(headCoord);
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
    const cssW = Math.round((CW * (isIOS ? 1 : SUPERSAMPLE)) / dpr);
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
      // The iOS 2D overlay uses map.project(), which samples live DEM tiles.
      // Tile refinement changes both projected route heights and camera elevation;
      // waiting for "render" cannot prevent those jumps. Keep its projection flat.
      // Android retains the original terrain and terrain-aware WebGL route layers.
      if (!isIOS) {
        try {
          map.setTerrain({ source: "terrain", exaggeration: 2.4 });
        } catch { /* terrain unsupported — continue flat */ }
      }

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

      const coords3d = coords3dRef.current;
      const start3d  = coords3d[0] ?? [start[0], start[1]];

      // On Android (isIOS === false) we use full MapLibre WebGL layers for the
      // original high-quality perspective-correct drone-follow experience.
      // On iOS, blob-URL Web Workers are blocked so setData() silently fails;
      // those platforms fall back to 2D canvas drawing inside compositeFrame.
      if (!isIOS) {
        // ── Ghost trace (full route, faint white) ──
        const fullLine = { type: "Feature", geometry: { type: "LineString", coordinates: coords3d }, properties: {} };
        map.addSource("routeFull", { type: "geojson", data: fullLine as any });
        map.addLayer({ id: "routeFull", type: "line", source: "routeFull",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-opacity": 0.22, "line-width": 5 } });

        // ── Animated progress line ──
        const emptyLine = { type: "Feature", geometry: { type: "LineString", coordinates: [start3d, start3d] }, properties: {} };
        map.addSource("routeProgress", { type: "geojson", data: emptyLine as any });
        map.addLayer({ id: "routeProgressGlow", type: "line", source: "routeProgress",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": TEAL, "line-opacity": 0.35, "line-width": 44, "line-blur": 8 } });
        map.addLayer({ id: "routeProgress", type: "line", source: "routeProgress",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": TEAL, "line-opacity": 0.9, "line-width": 24 } });
        map.addLayer({ id: "routeCore", type: "line", source: "routeProgress",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#eaffff", "line-opacity": 0.9, "line-width": 8 } });

        // ── Animated head marker ──
        const headPt = { type: "Feature", geometry: { type: "Point", coordinates: start3d }, properties: {} };
        map.addSource("head", { type: "geojson", data: headPt as any });
        map.addLayer({ id: "headPulse1", type: "circle", source: "head",
          paint: { "circle-radius": 12, "circle-color": "transparent",
                   "circle-stroke-width": 2.5, "circle-stroke-color": TEAL, "circle-stroke-opacity": 0.6, "circle-opacity": 0 } });
        map.addLayer({ id: "headPulse2", type: "circle", source: "head",
          paint: { "circle-radius": 12, "circle-color": "transparent",
                   "circle-stroke-width": 2.5, "circle-stroke-color": TEAL, "circle-stroke-opacity": 0.45, "circle-opacity": 0 } });
        map.addLayer({ id: "headGlow", type: "circle", source: "head",
          paint: { "circle-radius": 14, "circle-color": TEAL, "circle-opacity": 0.4, "circle-blur": 0.6 } });
        map.addLayer({ id: "headDot", type: "circle", source: "head",
          paint: { "circle-radius": 9, "circle-color": WHITE,
                   "circle-stroke-width": 4, "circle-stroke-color": TEAL, "circle-opacity": 1 } });
      }

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
    // HUD was designed at 1080×1920. Scale the whole design on iOS instead of
    // clipping its large title and stat typography in the 720p export.
    ctx.save();
    ctx.scale(ctx.canvas.width / 1080, ctx.canvas.height / 1920);
    const CW = 1080, CH = 1920;
    const runName    = run?.name || run?.routeName || "Run Summary";
    const totalDistM = run?.distance || 0;
    const elevGain   = run?.totalElevationGain || 0;
    // Duration may arrive in seconds (Garmin) or milliseconds (legacy Android uploads).
    // No run lasts over 24h (86400s), so anything larger is milliseconds → convert.
    const rawDur = run?.totalTime ?? run?.movingTime ?? run?.duration ?? 0;
    const totalDurSec = rawDur > 86400 ? Math.round(rawDur / 1000) : rawDur;
    const dateStr    = fmtDate(run?.completedAt || run?.date || null);
    const distUnit   = units === "mi" ? "MILES" : "KILOMETRES";

    // Genuine elapsed time at the marker's actual position on the track: interpolate
    // the real per-point timestamps. Falls back to even pace if the run has none.
    const cumArr = cumRef.current;
    const tfArr  = timeFracRef.current;
    const altArr = altRef.current;
    const trackTotal = totalRef.current || 0;
    let elapsedFrac = routeProgress;
    let altAtMarker: number | null = null;
    if (trackTotal > 0 && cumArr.length > 1) {
      const d = routeProgress * trackTotal;
      let i = 1;
      while (i < cumArr.length && cumArr[i] < d) i++;
      if (i >= cumArr.length) i = cumArr.length - 1;
      const seg = (d - cumArr[i - 1]) / ((cumArr[i] - cumArr[i - 1]) || 1);
      if (tfArr  && cumArr.length === tfArr.length)  elapsedFrac = tfArr[i - 1]  + (tfArr[i]  - tfArr[i - 1])  * seg;
      if (altArr && cumArr.length === altArr.length) altAtMarker = altArr[i - 1] + (altArr[i] - altArr[i - 1]) * seg;
    }
    elapsedFrac = Math.max(0, Math.min(1, elapsedFrac));

    // Show the real altitude at the marker (rises/falls with the terrain). If the run has
    // no altitude data, fall back to the evenly-climbing elevation-gain figure.
    const elevStat = altAtMarker != null
      ? { label: "ALTITUDE", value: fmtElev(altAtMarker, units),           unit: units === "mi" ? "ft" : "m" }
      : { label: "ELEV",     value: fmtElev(elevGain * routeProgress, units), unit: units === "mi" ? "ft" : "m" };

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
      // Brand logo (runner + "Ai Run Coach" text) — replaces plain text header
      const introLogo = logoImgRef.current;
      if (introLogo) {
        const logoW = 520;
        const logoH = Math.round(logoW * (introLogo.naturalHeight / introLogo.naturalWidth));
        ctx.drawImage(introLogo, (CW - logoW) / 2, CH * 0.27, logoW, logoH);
      }

      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "500 46px 'Inter', sans-serif";
      ctx.fillText(runName, CW / 2, CH * 0.45);

      ctx.save();
      ctx.shadowColor = TEAL_GLOW; ctx.shadowBlur = 45;
      ctx.fillStyle = WHITE; ctx.font = "bold 210px 'Inter', sans-serif";
      ctx.fillText(fmtDist(totalDistM, units), CW / 2, CH * 0.60);
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "600 42px 'Inter', sans-serif"; ctx.letterSpacing = "6px";
      ctx.fillText(distUnit, CW / 2, CH * 0.655); ctx.letterSpacing = "0px";

      // Secondary stats beneath the hero distance — genuine total time + average pace.
      const introDistVal = units === "mi" ? totalDistM / 1609.344 : totalDistM / 1000;
      const introPaceSec = introDistVal > 0 ? totalDurSec / introDistVal : 0;
      const introStats: { label: string; value: string }[] = [
        { label: "TIME",     value: fmtClock(totalDurSec) },
        { label: "AVG PACE", value: introPaceSec > 0 ? `${fmtClock(introPaceSec)}/${units}` : "—" },
      ];
      introStats.forEach((s, i) => {
        const cx = i === 0 ? CW * 0.30 : CW * 0.70;
        ctx.fillStyle = TEAL; ctx.font = "600 30px 'Inter', sans-serif"; ctx.letterSpacing = "5px";
        ctx.fillText(s.label, cx, CH * 0.72); ctx.letterSpacing = "0px";
        ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = "bold 62px 'Inter', sans-serif";
        ctx.fillText(s.value, cx, CH * 0.785);
      });
      ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(CW * 0.5, CH * 0.705); ctx.lineTo(CW * 0.5, CH * 0.79); ctx.stroke();
      ctx.restore();
    }

    // ── Flight HUD ──
    if (hudFade > 0.01) {
      ctx.save();
      ctx.globalAlpha = hudFade;

      // Top-left brand lockup — logo image replaces teal dot + text
      const hudLogo = logoImgRef.current;
      if (hudLogo) {
        const hudLogoW = 210;
        const hudLogoH = Math.round(hudLogoW * (hudLogo.naturalHeight / hudLogo.naturalWidth));
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.drawImage(hudLogo, 22, 16, hudLogoW, hudLogoH);
        ctx.restore();
      }
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "30px 'Inter', sans-serif";
      ctx.fillText(runName, 28, 162);

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
        elevStat,
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

    // ── 2D canvas route lines + head marker (iOS only) ───────────────────────
    // On iOS WKWebView, blob-URL Web Workers are blocked so MapLibre GeoJSON
    // setData() silently does nothing.  We draw the route entirely on this 2D
    // canvas via map.project() instead.  On Android the MapLibre WebGL layers
    // (added in map init above) handle this with full perspective-correct 3D
    // rendering — no 2D canvas drawing needed there.
    if (isIOS && map) {
      const container = map.getContainer();
      const cssW = container.offsetWidth  || 1;
      const cssH = container.offsetHeight || 1;
      const sx = CW / cssW;
      const sy = CH / cssH;
      const proj = (lngLat: [number, number]): [number, number] => {
        const p = map.project(lngLat as any);
        return [p.x * sx, p.y * sy];
      };

      // Margin beyond which a projected point is considered off-screen.
      // Points outside this box cause the pen to lift so no line is drawn
      // across the canvas to an out-of-bounds coordinate (pitched cameras
      // project "behind-horizon" points to extreme pixel values).
      const PAD = 200;
      const inBounds = ([x, y]: [number, number]) =>
        x > -PAD && x < CW + PAD && y > -PAD && y < CH + PAD;

      // Build a canvas path with pen-lift at out-of-bounds points so that
      // off-screen projections never draw a diagonal slash across the frame.
      const buildClippedPath = (screenPts: [number, number][]) => {
        ctx.beginPath();
        let penDown = false;
        for (const pt of screenPts) {
          if (!inBounds(pt)) { penDown = false; continue; }
          if (!penDown) { ctx.moveTo(pt[0], pt[1]); penDown = true; }
          else          { ctx.lineTo(pt[0], pt[1]); }
        }
      };

      // Helper: project a list of raw coords (subsampled to maxSeg) to screen pts.
      const projectCoords = (raw: [number, number][], stride: number): [number, number][] => {
        const out: [number, number][] = [];
        for (let i = 0; i < raw.length; i += stride) {
          try { out.push(proj([raw[i][0], raw[i][1]])); } catch { /* guard */ }
        }
        // Always include the exact last point
        if (raw.length > 1 && (raw.length - 1) % stride !== 0) {
          try { out.push(proj([raw[raw.length - 1][0], raw[raw.length - 1][1]])); } catch { /* guard */ }
        }
        return out;
      };

      // Full ghost trace (white, faint) — drawn first so progress line sits on top.
      const allCoords = (coords3dRef.current.length ? coords3dRef.current : coordsRef.current) as [number, number][];
      const ghostPts = projectCoords(allCoords, Math.max(1, Math.ceil(allCoords.length / 220)));
      if (ghostPts.length >= 2) {
        ctx.save();
        buildClippedPath(ghostPts);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.22;
        ctx.stroke();
        ctx.restore();
      }

      // Progress line + head marker (only once route has started)
      if (routeProgress > 0) {
      const d = routeProgress * (totalRef.current || 0);
      const progressCoords = buildProgressLine(d);
      // A fixed stride for the whole run avoids changing every vertex whenever
      // progress crosses a subsampling threshold (visible as a snapping line).
      const pts = projectCoords(progressCoords as [number, number][], Math.max(1, Math.ceil(allCoords.length / 220)));

      if (pts.length >= 2) {
        const buildPath = () => buildClippedPath(pts);
        // Glow — shadowBlur works on iOS (ctx.filter blur does not)
        ctx.save();
        ctx.shadowColor = TEAL; ctx.shadowBlur = 44; ctx.globalAlpha = 0.7;
        buildPath(); ctx.strokeStyle = TEAL; ctx.lineWidth = 24; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
        ctx.restore();
        // Teal body
        ctx.save();
        buildPath(); ctx.strokeStyle = TEAL; ctx.lineWidth = 24; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
        ctx.restore();
        // White-hot core
        ctx.save();
        ctx.globalAlpha = 0.9;
        buildPath(); ctx.strokeStyle = "#eaffff"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
        ctx.restore();
      }

      // Head marker — pulse rings + glow halo + white dot
      try {
        const headPos = interpAt(d).pos;
        const [hx, hy] = proj(headPos);
        const p1 = (tMs % PULSE_MS) / PULSE_MS;
        const p2 = ((tMs + PULSE_MS / 2) % PULSE_MS) / PULSE_MS;
        // Ring 1
        ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, 10 + p1 * 38, 0, Math.PI * 2);
        ctx.strokeStyle = TEAL; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6 * (1 - p1); ctx.stroke(); ctx.restore();
        // Ring 2
        ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, 10 + p2 * 38, 0, Math.PI * 2);
        ctx.strokeStyle = TEAL; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.45 * (1 - p2); ctx.stroke(); ctx.restore();
        // Glow halo
        ctx.save(); ctx.shadowColor = TEAL; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI * 2);
        ctx.fillStyle = TEAL; ctx.globalAlpha = 0.4; ctx.fill(); ctx.restore();
        // White dot with teal border
        ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2);
        ctx.fillStyle = WHITE; ctx.fill();
        ctx.strokeStyle = TEAL; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
      } catch { /* map.project() throws if coordinate is off-screen */ }
      } // end routeProgress > 0
    } // end if (map)

    drawOverlay(ctx, routeProgress, tMs, run, units);
  }, [drawOverlay, run, units, buildProgressLine, interpAt]);

  // Trigger a file download. The Android WebView bridge intercepts the anchor click and
  // reads the blob ASYNCHRONOUSLY (fetch → FileReader), so the object URL must stay alive
  // well past click() — revoking it synchronously breaks the native share. Delay the revoke.
  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch { /* already removed */ }
      URL.revokeObjectURL(url);
    }, 60_000);
  }, []);

  // Flush the WebCodecs encoder, finalize the MP4, and stash it for Download/Share.
  const finishWebCodecs = useCallback(async () => {
    const enc   = videoEncoderRef.current;
    const muxer = muxerRef.current;
    if (!enc || !muxer) { setErrorDetail("WebCodecs: encoder missing"); setStatus("error"); return; }
    let ok = false;
    try {
      await enc.flush();
      if (encFrameCountRef.current === 0) {
        throw new Error(encErrRef.current || "no frames encoded (VideoFrame unsupported?)");
      }
      if (muxStatsRef.current.added === 0) {
        // Surface the REAL reason the muxer is empty instead of letting finalize() crash cryptically.
        throw new Error(`muxer received 0 chunks (${muxStatsRef.current.failed} rejected${muxStatsRef.current.firstErr ? `: ${muxStatsRef.current.firstErr}` : ""})`);
      }
      muxer.finalize();
      const { buffer } = muxer.target;
      if (!buffer || buffer.byteLength === 0) throw new Error("empty output buffer");
      const blob = new Blob([buffer], { type: "video/mp4" });
      videoFileRef.current = { blob, name: `run-summary-${runId || "video"}.mp4` };
      ok = true;
    } catch (e: any) {
      console.error("[finishWebCodecs]", e);
      const mux = muxStatsRef.current;
      setErrorDetail(`WebCodecs — ${encErrRef.current || e?.message || e} (frames: ${encFrameCountRef.current}, muxed: ${mux.added}, rejected: ${mux.failed}${mux.firstErr ? `, muxErr: ${mux.firstErr}` : ""}, seeded: ${seededConfigRef.current ? "yes" : "no"})`);
    } finally {
      try { enc.close(); } catch { /* already closed */ }
      videoEncoderRef.current = null;
      muxerRef.current        = null;
      useWebCodecsRef.current = false;
      setStatus(ok ? "done" : "error");
    }
  }, [runId]);

  // Save the finished video to the device (the Android WebView bridge intercepts this
  // and opens its native Save/Share sheet). The video is kept, so it can be tapped again.
  const downloadVideo = useCallback(() => {
    const f = videoFileRef.current;
    if (f) triggerDownload(f.blob, f.name);
  }, [triggerDownload]);

  // Share the finished video. Prefer the Web Share API (real share sheet with the file
  // attached); fall back to the download path, which on Android opens the native share sheet.
  const shareVideo = useCallback(async () => {
    const f = videoFileRef.current;
    if (!f) return;
    const nav: any = navigator;
    try {
      const file = new File([f.blob], f.name, { type: f.blob.type || "video/mp4" });
      if (nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file] }); return; }
        catch (e: any) { if (e?.name === "AbortError") return; /* user cancelled */ }
      }
    } catch { /* File constructor or canShare unsupported — fall through */ }
    triggerDownload(f.blob, f.name);
  }, [triggerDownload]);

  // ── Animation driver ────────────────────────────────────────────────────────
  const runAnimation = useCallback((record: boolean) => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map || coordsRef.current.length < 2) return;

    cancelAnimationFrame(animRef.current);
    const generation = ++animationGenerationRef.current;
    chunksRef.current = [];
    dispBearingRef.current = bearing(coordsRef.current[0], coordsRef.current[1]);
    dispCenterRef.current = interpAt(LOOKAHEAD_M).pos;

    if (record) {
      useWebCodecsRef.current = false;
      lastEncMsRef.current    = -1;
      encFrameCountRef.current = 0;
      encErrRef.current       = "";
      videoFileRef.current    = null; // starting a fresh recording invalidates the previous video
      setErrorDetail("");
      const W = window as any;
      const canWebCodecs = webCodecsSupportedRef.current && typeof W.VideoFrame === "function";

      // ── Preferred path: WebCodecs → mp4-muxer. Explicit per-frame timestamps give a
      //    correct-duration, non-fragmented H.264 MP4 that Instagram/WhatsApp accept. ──
      if (canWebCodecs) {
        try {
          const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: { codec: "avc", width: CW, height: CH, frameRate: 30 },
            fastStart: "in-memory",
            // The first rAF frame fires ~16ms after start, so our first frame's timestamp is never
            // exactly 0. mp4-muxer's default "strict" behavior would THROW on a non-zero first chunk,
            // and such a throw (inside the async encoder callback) is swallowed → empty muxer →
            // finalize() crashes on null. "offset" rebases all timestamps so the first is 0.
            // (Defense-in-depth; the primary crash cause was a missing VideoFrame duration — see below.)
            firstTimestampBehavior: "offset",
          });
          seededConfigRef.current = false; // reset per recording; set true once muxer has a decoderConfig
          muxStatsRef.current = { added: 0, failed: 0, firstErr: "" };
          const encoder = new W.VideoEncoder({
            output: (chunk: any, meta: any) => {
              try {
                let m = meta;
                // Some Android WebViews never attach decoderConfig to live chunks. Seed the muxer
                // with the description proven during the self-test so finalize() doesn't crash.
                if (!m?.decoderConfig && !seededConfigRef.current && provenDecoderConfigRef.current) {
                  m = { ...(meta || {}), decoderConfig: provenDecoderConfigRef.current };
                }
                // Feed the muxer via addVideoChunkRaw with values WE control. addVideoChunk
                // re-validates chunk.duration / instanceof EncodedVideoChunk, and some WebViews
                // hand back chunks that fail those checks (e.g. null duration even when the
                // VideoFrame had one) — the resulting throw inside this async callback is
                // swallowed, silently emptying the muxer until finalize() crashes.
                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);
                const ts  = Number.isFinite(chunk.timestamp) && chunk.timestamp >= 0 ? chunk.timestamp : muxStatsRef.current.added * 33333;
                const dur = Number.isFinite(chunk.duration)  && chunk.duration  >= 0 ? chunk.duration  : 33333;
                muxer.addVideoChunkRaw(data, chunk.type === "key" ? "key" : "delta", ts, dur, m);
                muxStatsRef.current.added++;
                if (m?.decoderConfig) seededConfigRef.current = true; // only after a SUCCESSFUL add
              } catch (err: any) {
                muxStatsRef.current.failed++;
                if (!muxStatsRef.current.firstErr) muxStatsRef.current.firstErr = String(err?.message || err);
              }
            },
            error:  (e: any) => {
              console.error("[VideoEncoder]", e);
              if (!encErrRef.current) encErrRef.current = `encoder: ${e?.message || e}`;
            },
          });
          encoder.configure({
            codec: workingCodecRef.current, // codec proven to encode on THIS device by the self-test
            width: CW,
            height: CH,
            bitrate: 8_000_000,
            framerate: 30,
            avc: { format: "avc" }, // force AVCC + decoderConfig.description (mp4-muxer needs it)
          });
          muxerRef.current        = muxer;
          videoEncoderRef.current = encoder;
          useWebCodecsRef.current = true;
        } catch (e: any) {
          console.error("[WebCodecs setup failed — falling back to MediaRecorder]", e);
          if (!encErrRef.current) encErrRef.current = `setup: ${e?.message || e}`;
          useWebCodecsRef.current = false;
        }
      }

      // ── Fallback path: MediaRecorder (older WebViews; MP4 duration may be imperfect). ──
      if (!useWebCodecsRef.current) {
        try {
          const stream   = canvas.captureStream(30);
          const candidates = [
            "video/mp4;codecs=avc1.42E01E",
            "video/mp4;codecs=h264",
            "video/mp4",
            "video/webm;codecs=vp9",
            "video/webm",
          ];
          const mimeType = candidates.find(t => {
            try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
          }) || "";
          const isMp4    = mimeType.startsWith("video/mp4");
          const ext      = isMp4 ? "mp4" : "webm";
          const blobType = isMp4 ? "video/mp4" : "video/webm";
          const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
            : new MediaRecorder(stream, { videoBitsPerSecond: 8_000_000 });
          recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
          recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: blobType });
            if (blob.size === 0) { setErrorDetail("MediaRecorder produced empty file"); setStatus("error"); return; }
            videoFileRef.current = { blob, name: `run-summary-${runId || "video"}.${ext}` };
            setStatus("done");
          };
          recorder.start(100);
          recorderRef.current = recorder;
        } catch (e: any) {
          console.error("[MediaRecorder setup failed]", e);
          setErrorDetail(`MediaRecorder — ${e?.message || e}`);
          setStatus("error");
          return; // recording unsupported — don't run a fake "recording" that ends in false success
        }
      }
    }

    startTsRef.current = performance.now();
    setStatus(record ? "recording" : "playing");

    const total = totalRef.current;
    // Timeline scaled to this run's distance (longer runs → longer, watchable flyovers).
    const followMs = followMsForMeters(run?.distance || 0);
    const totalMs  = INTRO_MS + followMs + OUTRO_MS;
    let iosFrameIndex = 0;
    let iosElapsed = 0;
    let iosLastWall = startTsRef.current;
    let previousTimelineMs = 0;

    const tick = (now: number) => {
      if (generation !== animationGenerationRef.current) return;
      // On iOS, advancing the route by wall time skips hundreds of metres when
      // WKWebView needs more than 33ms to draw a map frame. WebCodecs can encode
      // at a fixed 30fps timeline regardless of rendering speed. MediaRecorder
      // uses wall-clock timestamps, so bound each step there instead of jumping.
      if (isIOS && !(record && useWebCodecsRef.current)) {
        iosElapsed += Math.min(Math.max(now - iosLastWall, 0), 50);
        iosLastWall = now;
      }
      const t = isIOS
        ? (record && useWebCodecsRef.current ? iosFrameIndex * (1000 / 30) : iosElapsed)
        : now - startTsRef.current;
      // Preserve the same iOS camera response per second in preview and export.
      // Use logical video time, not encoding wall time, for offline WebCodecs.
      const frameScale = Math.max(0, t - previousTimelineMs) / (1000 / 60);
      previousTimelineMs = t;
      const positionAlpha = isIOS ? 1 - Math.pow(1 - POS_SMOOTH, frameScale) : POS_SMOOTH;
      const bearingAlpha = isIOS ? 1 - Math.pow(1 - BRG_SMOOTH, frameScale) : BRG_SMOOTH;
      const overall = Math.min(t / totalMs, 1);
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
      } else if (t < INTRO_MS + followMs) {
        // ── Follow: a floaty "chase" drone that trails the marker ──
        routeProgress = (t - INTRO_MS) / followMs;
        const d = routeProgress * total;
        const head  = interpAt(d).pos;
        const ahead = interpAt(Math.min(d + LOOKAHEAD_M, total)).pos;

        // Travel direction sampled over a long span so gentle bends don't jerk the camera.
        const brgFrom = interpAt(Math.max(0, d - 20)).pos;
        const brgTo   = interpAt(Math.min(d + BRG_LOOKAHEAD_M, total)).pos;
        const targetBrg = bearing(brgFrom, brgTo);
        dispBearingRef.current = lerpAngle(dispBearingRef.current, targetBrg, bearingAlpha);

        // Ease the camera centre toward the look-ahead point (smooth glide, no snapping).
        dispCenterRef.current = [
          dispCenterRef.current[0] + (ahead[0] - dispCenterRef.current[0]) * positionAlpha,
          dispCenterRef.current[1] + (ahead[1] - dispCenterRef.current[1]) * positionAlpha,
        ];

        map.jumpTo({ center: dispCenterRef.current as any, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current });
        lastCamRef.current = { center: [dispCenterRef.current[0], dispCenterRef.current[1]], zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current };
        if (!isIOS) {
          map.getSource("routeProgress") && (map.getSource("routeProgress") as any).setData({
            type: "Feature", geometry: { type: "LineString", coordinates: buildProgressLine(d) }, properties: {},
          });
          (map.getSource("head") as any)?.setData({
            type: "Feature", geometry: { type: "Point", coordinates: head }, properties: {},
          });
          pulseMarker(map, t);
        }
      } else {
        // ── Outro: pull up and out to reveal the whole route ──
        routeProgress = 1;
        if (!isIOS) {
          const endCoords = coords3dRef.current.length ? coords3dRef.current : coordsRef.current;
          (map.getSource("routeProgress") as any)?.setData({
            type: "Feature", geometry: { type: "LineString", coordinates: endCoords }, properties: {},
          });
          const end = interpAt(total).pos;
          (map.getSource("head") as any)?.setData({
            type: "Feature", geometry: { type: "Point", coordinates: end }, properties: {},
          });
          pulseMarker(map, t);
        }
        const from = lastCamRef.current!;
        const ov   = overviewCamRef.current;
        const k = Math.min((t - INTRO_MS - followMs) / OUTRO_MS, 1);
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
      }

      const captureFrame = () => {
        if (generation !== animationGenerationRef.current) return;
        compositeFrame(routeProgress, t);

        // ── WebCodecs: encode this frame with an explicit timestamp (throttled to ~30fps). ──
        if (useWebCodecsRef.current && videoEncoderRef.current) {
        const enc = videoEncoderRef.current;
        if (enc.state === "configured" && (lastEncMsRef.current < 0 || t - lastEncMsRef.current >= 33)) {
          try {
            // duration is REQUIRED: mp4-muxer's addVideoChunk throws on a null/undefined chunk
            // duration (Number.isFinite(null) === false) BEFORE it stores anything, and that throw
            // is swallowed inside the async encoder callback → no samples, no decoderConfig →
            // finalize() crashes on null. VideoFrames without an explicit duration yield a null
            // chunk.duration, so we set one (~1/30s in µs). THIS is the real root cause.
            const frame = new (window as any).VideoFrame(canvas, { timestamp: Math.round(t * 1000), duration: Math.round(1_000_000 / 30) });
            enc.encode(frame, { keyFrame: encFrameCountRef.current % 60 === 0 });
            frame.close();
            encFrameCountRef.current++;
            lastEncMsRef.current = t;
          } catch (e: any) {
            console.error("[VideoFrame encode]", e);
            if (!encErrRef.current) encErrRef.current = `frame: ${e?.message || e}`;
          }
        }
        }

        if (t < totalMs) {
          if (isIOS) iosFrameIndex++;
          animRef.current = requestAnimationFrame(tick);
        } else if (record) {
          stopTimeoutRef.current = window.setTimeout(() => {
            if (generation !== animationGenerationRef.current) return;
            if (useWebCodecsRef.current) finishWebCodecs();
            else if (recorderRef.current?.state === "recording") recorderRef.current.stop();
            else { setErrorDetail("no recorder was active"); setStatus("error"); }
          }, HOLD_MS);
        } else {
          setStatus("idle");
        }
      };

      if (isIOS) {
        // map.jumpTo schedules a WebGL repaint. Projecting the line before that
        // repaint pairs a new-camera marker with an old-camera satellite frame.
        // Capture only after MapLibre has rendered this camera position.
        map.once("render", captureFrame);
        map.triggerRepaint();
      } else {
        captureFrame();
      }
    };

    animRef.current = requestAnimationFrame(tick);
  }, [runId, run, interpAt, buildProgressLine, compositeFrame, finishWebCodecs, triggerDownload]);

  const stopAll = useCallback(() => {
    animationGenerationRef.current++;
    cancelAnimationFrame(animRef.current);
    if (stopTimeoutRef.current !== null) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    if (videoEncoderRef.current) {
      try { videoEncoderRef.current.close(); } catch { /* already closed */ }
      videoEncoderRef.current = null;
      muxerRef.current        = null;
      useWebCodecsRef.current = false;
    }
    setStatus("idle");
    setProgress(0);
    // Reset visuals back to the framed start
    const map = mapRef.current;
    const coords = coordsRef.current;
    if (map && coords.length >= 2) {
      const c3d = coords3dRef.current;
      const s3d = c3d[0] ?? [coords[0][0], coords[0][1]];
      (map.getSource("routeProgress") as any)?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [s3d, s3d] }, properties: {} });
      (map.getSource("head") as any)?.setData({ type: "Feature", geometry: { type: "Point", coordinates: coords[0] }, properties: {} });
      dispBearingRef.current = bearing(coords[0], coords[1]);
      const ahead = interpAt(LOOKAHEAD_M).pos;
      dispCenterRef.current = ahead;
      map.jumpTo({ center: ahead, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current });
      map.once("idle", () => compositeFrame(0, 0));
    }
  }, [interpAt, compositeFrame]);

  // Runtime WebCodecs self-test. isConfigSupported() lies on some Android WebViews (returns
  // true, then real encoding fails), so we actually encode + flush one real frame at the true
  // recording resolution, walking a codec ladder. WebCodecs is only enabled if a chunk really
  // comes out — otherwise we fall back to MediaRecorder from the start (no dead-end "failed").
  useEffect(() => {
    const W = window as any;
    if (typeof W.VideoEncoder !== "function" || typeof W.VideoFrame !== "function") { setProbeDone(true); return; }
    let cancelled = false;
    (async () => {
      let probeReason = "";
      const ladder = ["avc1.42E029", "avc1.42E028", "avc1.42001F", "avc1.4D0029", "avc1.640029"];
      const test = document.createElement("canvas");
      test.width = CW; test.height = CH;
      const tctx = test.getContext("2d");
      if (tctx) { tctx.fillStyle = "#0a0a0f"; tctx.fillRect(0, 0, CW, CH); }
      for (const codec of ladder) {
        if (cancelled) return;
        let enc: any = null;
        try {
          if (typeof W.VideoEncoder.isConfigSupported === "function") {
            const s = await W.VideoEncoder.isConfigSupported({ codec, width: CW, height: CH, bitrate: 8_000_000, framerate: 30 });
            if (!s?.supported) continue;
          }
          let chunks = 0;
          let provenConfig: any = null; // full decoderConfig (with description) proven on THIS device
          enc = new W.VideoEncoder({
            output: (_chunk: any, meta: any) => {
              chunks++;
              const dc = meta?.decoderConfig;
              if (dc?.description && !provenConfig) {
                // Deep-copy the description bytes so they survive after the encoder closes,
                // respecting byteOffset/byteLength so we copy only this view's bytes.
                const src = dc.description as ArrayBuffer | ArrayBufferView;
                const bytes = src instanceof ArrayBuffer
                  ? new Uint8Array(src.slice(0))
                  : new Uint8Array(src.buffer, src.byteOffset, src.byteLength).slice();
                provenConfig = { codec: dc.codec, codedWidth: dc.codedWidth, codedHeight: dc.codedHeight, description: bytes };
              }
            },
            error: () => {},
          });
          enc.configure({ codec, width: CW, height: CH, bitrate: 8_000_000, framerate: 30, avc: { format: "avc" } });
          const frame = new W.VideoFrame(test, { timestamp: 0 });
          enc.encode(frame, { keyFrame: true });
          frame.close();
          await enc.flush();
          try { enc.close(); } catch { /* already closed */ }
          // Require a real chunk AND a captured description — otherwise finalize() would crash
          // reading colorSpace off a null decoderConfig, so this codec is unusable here.
          if (!cancelled && chunks > 0 && provenConfig) {
            workingCodecRef.current       = codec;
            provenDecoderConfigRef.current = provenConfig; // reused to seed the muxer during real recording
            webCodecsSupportedRef.current = true;
            if (!cancelled) setProbeDone(true);
            return; // proven working — done
          }
          const gotDescription = !!provenConfig;
          if (chunks > 0 && !gotDescription) probeReason = "encoder gave no video description";
        } catch {
          try { enc?.close(); } catch { /* ignore */ }
          // try next codec in the ladder
        }
      }
      // none worked — leave webCodecsSupportedRef false → MediaRecorder fallback
      if (!cancelled) { if (probeReason) probeReasonRef.current = probeReason; setProbeDone(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    animationGenerationRef.current++;
    cancelAnimationFrame(animRef.current);
    if (stopTimeoutRef.current !== null) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
    if (recorderRef.current?.state === "recording") { try { recorderRef.current.stop(); } catch { /* already stopped */ } }
    if (videoEncoderRef.current) { try { videoEncoderRef.current.close(); } catch { /* already closed */ } }
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
            <span className="text-red-400 text-sm font-medium">Generating video… {Math.round(progress * 100)}%</span>
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
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-sm font-medium">Video ready — save or share it below</span>
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-400 text-sm font-medium">Recording failed — please try again</span>
            </div>
            {errorDetail && (
              <span className="text-red-400/70 text-[11px] text-center max-w-[320px] break-words px-2" data-testid="text-error-detail">
                {errorDetail}
              </span>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          {status === "done" && mapReady && (
            <>
              <Button
                onClick={downloadVideo}
                className="w-full font-bold"
                style={{ background: TEAL, color: "#000" }}
                data-testid="button-download"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Video
              </Button>
              <Button
                onClick={shareVideo}
                variant="outline"
                className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                data-testid="button-share"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share Video
              </Button>
              <Button
                onClick={() => runAnimation(true)}
                variant="ghost"
                className="w-full text-white/50 hover:text-white hover:bg-white/5"
                data-testid="button-regenerate"
                disabled={!hasRoute || !probeDone}
              >
                <Video className="w-4 h-4 mr-2" />
                Generate Again
              </Button>
            </>
          )}

          {(status === "idle" || status === "error") && mapReady && (
            <>
              <Button
                onClick={() => runAnimation(true)}
                className="w-full font-bold"
                style={{ background: TEAL, color: "#000" }}
                data-testid="button-record"
                disabled={!hasRoute || !probeDone}
              >
                {probeDone ? (
                  <>
                    <Video className="w-4 h-4 mr-2" />
                    Generate Video
                  </>
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking video support…
                  </>
                )}
              </Button>
              {probeDone && !webCodecsSupportedRef.current && probeReasonRef.current && (
                <span className="text-white/40 text-[11px] text-center px-2" data-testid="text-probe-note">
                  Using basic recorder ({probeReasonRef.current})
                </span>
              )}
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
          A 3D drone-style flyover of your route, saved as a video you can share to Instagram, WhatsApp, or any platform.
        </p>
      </div>
    </div>
  );
}
