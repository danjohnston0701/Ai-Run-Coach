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
const INTRO_MS  = 1300;    // zoom/tilt into the start
const FOLLOW_MS = 11000;   // drone follow along the route
const OUTRO_MS  = 2700;    // pull up to reveal the whole route
const TOTAL_MS  = INTRO_MS + FOLLOW_MS + OUTRO_MS;
const HOLD_MS   = 1200;    // hold the final frame before stopping the recorder

// ─── Camera tuning ────────────────────────────────────────────────────────────
const FOLLOW_ZOOM   = 15.2;
const FOLLOW_PITCH  = 66;
const LOOKAHEAD_M   = 70;   // camera centres slightly ahead of the marker

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

// ─── Formatting helpers ───────────────────────────────────────────────────────
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
  const dispBearingRef = useRef<number>(0);
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
    // Backend returns routePoints as { latitude, longitude }; older/phone formats
    // may use { lat, lng }. Normalise both, coerce numeric strings, drop invalids.
    const coords: LngLat[] = Array.isArray(run.routePoints)
      ? run.routePoints
          .map((p: any): LngLat => [Number(p?.longitude ?? p?.lng), Number(p?.latitude ?? p?.lat)])
          .filter((c: LngLat) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
      : [];
    coordsRef.current = coords;

    const cum: number[] = [0];
    for (let i = 1; i < coords.length; i++) {
      cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
    }
    cumRef.current = cum;
    totalRef.current = cum[cum.length - 1] || 0;
    dispBearingRef.current = coords.length >= 2 ? bearing(coords[0], coords[1]) : 0;
    setHasRoute(coords.length >= 2);
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
      map.addLayer({ id: "routeProgressGlow", type: "line", source: "routeProgress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": TEAL, "line-width": 18, "line-blur": 10, "line-opacity": 0.55 } });
      map.addLayer({ id: "routeProgress", type: "line", source: "routeProgress",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": TEAL, "line-width": 8 } });
      map.addLayer({ id: "headHalo", type: "circle", source: "head",
        paint: { "circle-radius": 15, "circle-color": TEAL, "circle-opacity": 0.35, "circle-blur": 0.7 } });
      map.addLayer({ id: "headDot", type: "circle", source: "head",
        paint: { "circle-radius": 7, "circle-color": WHITE, "circle-stroke-color": TEAL, "circle-stroke-width": 3 } });

      // Pre-compute the "whole route" overview camera used for the outro.
      const bounds = coords.reduce(
        (b, c) => b.extend(c as any),
        new maplibregl.LngLatBounds(coords[0] as any, coords[0] as any),
      );
      try {
        const cam: any = map.cameraForBounds(bounds, { pitch: 32, bearing: 0, padding: 140 });
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
      map.jumpTo({ center: ahead, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current });

      map.once("idle", () => {
        setMapReady(true);
        compositeFrame(0, 0);
      });
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // ── Draw the 2D overlay (stats, branding, progress) on top of the map image ─
  const drawOverlay = useCallback((ctx: CanvasRenderingContext2D, routeProgress: number, run: any, units: "km" | "mi") => {
    // Top stats gradient
    const overlayH = 280;
    const grad = ctx.createLinearGradient(0, 0, 0, overlayH);
    grad.addColorStop(0,    "rgba(0,0,0,0.82)");
    grad.addColorStop(0.75, "rgba(0,0,0,0.55)");
    grad.addColorStop(1,    "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, overlayH);

    // Brand label
    ctx.save();
    ctx.fillStyle = TEAL;
    ctx.font = "bold 36px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.letterSpacing = "4px";
    ctx.fillText("AI RUN COACH", CW / 2, 64);
    ctx.restore();

    // Run name
    const runName = run?.name || run?.routeName || "Run Summary";
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "28px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(runName, CW / 2, 108);
    ctx.restore();

    // Stats row (distance + elevation count up with progress)
    const totalDistM = run?.distance || 0;
    const elevGain   = run?.totalElevationGain || 0;
    const avgPace    = run?.averagePace || run?.avgPace || "--'--\"";
    const stats = [
      { label: "Pace",      value: avgPace,                             unit: `/${units}` },
      { label: "Elevation", value: fmtElev(elevGain * routeProgress, units), unit: units === "mi" ? "ft" : "m" },
      { label: "Distance",  value: fmtDist(totalDistM * routeProgress, units), unit: units },
    ];
    const colW = CW / 3;
    stats.forEach((s, i) => {
      const cx = colW * i + colW / 2;
      ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "28px 'Inter', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(s.label.toUpperCase(), cx, 158); ctx.restore();
      ctx.save(); ctx.fillStyle = WHITE; ctx.font = "bold 84px 'Inter', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(s.value, cx, 238); ctx.restore();
      ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "28px 'Inter', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(s.unit, cx, 272); ctx.restore();
    });
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
    [colW, colW * 2].forEach(dx => { ctx.beginPath(); ctx.moveTo(dx, 148); ctx.lineTo(dx, 268); ctx.stroke(); });
    ctx.restore();

    // Bottom branding strip
    const botH = 120;
    const botGrad = ctx.createLinearGradient(0, CH - botH, 0, CH);
    botGrad.addColorStop(0, "rgba(0,0,0,0)");
    botGrad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, CH - botH, CW, botH);

    const dateStr = fmtDate(run?.completedAt || run?.date || null);
    if (dateStr) {
      ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "26px 'Inter', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(dateStr, CW / 2, CH - 36); ctx.restore();
    }

    // Progress bar
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, CH - 8, CW, 8);
    ctx.fillStyle = TEAL;
    ctx.fillRect(0, CH - 8, CW * routeProgress, 8);
  }, []);

  // ── Composite the map WebGL canvas + overlay into the recording canvas ──────
  const compositeFrame = useCallback((routeProgress: number, _overall: number) => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, CW, CH);
    if (map) {
      const mc = map.getCanvas();
      if (mc.width > 0 && mc.height > 0) {
        try { ctx.drawImage(mc, 0, 0, CW, CH); } catch { /* tainted-canvas guard */ }
      }
    }
    drawOverlay(ctx, routeProgress, run, units);
  }, [drawOverlay, run, units]);

  // ── Animation driver ────────────────────────────────────────────────────────
  const runAnimation = useCallback((record: boolean) => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map || coordsRef.current.length < 2) return;

    cancelAnimationFrame(animRef.current);
    chunksRef.current = [];
    dispBearingRef.current = bearing(coordsRef.current[0], coordsRef.current[1]);

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
        // ── Intro: tilt + zoom into the start ──
        const k = t / INTRO_MS;
        routeProgress = 0;
        const ahead = interpAt(LOOKAHEAD_M).pos;
        map.jumpTo({
          center: ahead,
          zoom:  13.6 + (FOLLOW_ZOOM - 13.6) * k,
          pitch: 46   + (FOLLOW_PITCH - 46) * k,
          bearing: dispBearingRef.current,
        });
        lastCamRef.current = { center: ahead, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current };
      } else if (t < INTRO_MS + FOLLOW_MS) {
        // ── Follow: drone chases the marker along the route ──
        routeProgress = (t - INTRO_MS) / FOLLOW_MS;
        const d = routeProgress * total;
        const { pos: head, brg } = interpAt(d);
        const ahead = interpAt(Math.min(d + LOOKAHEAD_M, total)).pos;
        dispBearingRef.current = lerpAngle(dispBearingRef.current, brg, 0.09);

        map.getSource("routeProgress") && (map.getSource("routeProgress") as any).setData({
          type: "Feature", geometry: { type: "LineString", coordinates: buildProgressLine(d) }, properties: {},
        });
        (map.getSource("head") as any)?.setData({
          type: "Feature", geometry: { type: "Point", coordinates: head }, properties: {},
        });
        map.jumpTo({ center: ahead, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current });
        lastCamRef.current = { center: ahead, zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: dispBearingRef.current };
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
            pitch: from.pitch + (32       - from.pitch) * e,
            bearing: lerpAngle(from.bearing, 0, e),
          });
        }
      }

      compositeFrame(routeProgress, overall);

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
          {/* MapLibre renders here (underneath); the compositor canvas covers it. */}
          <div ref={mapContainerRef} className="absolute inset-0" />
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
