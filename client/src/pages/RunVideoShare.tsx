import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Play, Square, Download, Loader2, Video, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Brand colours ────────────────────────────────────────────────────────────
const TEAL       = "#00BFFF";   // hsl(190 100% 50%) – AI Run Coach primary
const TEAL_GLOW  = "rgba(0,191,255,0.35)";
const WHITE      = "#ffffff";
const DARK_BG    = "rgba(0,0,0,0.55)";

// ─── Canvas dimensions (9:16 portrait – perfect for stories / reels) ─────────
const CW = 1080;
const CH = 1920;

// ─── Tile helpers ─────────────────────────────────────────────────────────────
const TILE_SIZE = 256;

function worldPx(lat: number, lng: number, zoom: number) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const sinLat = Math.sin(lat * Math.PI / 180);
  return {
    x: (lng + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function pickZoom(
  points: { lat: number; lng: number }[],
  padFraction = 0.2,
) {
  if (points.length < 2) return 14;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const targetW = CW  * (1 - 2 * padFraction);
  const targetH = CH * (1 - 2 * padFraction);
  for (let z = 18; z >= 1; z--) {
    const p1 = worldPx(minLat, minLng, z);
    const p2 = worldPx(maxLat, maxLng, z);
    if (Math.abs(p2.x - p1.x) <= targetW && Math.abs(p2.y - p1.y) <= targetH) {
      return z;
    }
  }
  return 1;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Formatting helpers ───────────────────────────────────────────────────────
function fmtDist(meters: number, units: "km" | "mi"): string {
  if (units === "mi") {
    const mi = meters / 1609.344;
    return mi.toFixed(1);
  }
  const km = meters / 1000;
  return km.toFixed(2);
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

// ─── Canvas drawing helpers ───────────────────────────────────────────────────
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RunVideoShare() {
  const [, params] = useRoute("/run-video/:id");
  const [, setLocation] = useLocation();
  const runId = params?.id;

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);  // pre-rendered tiles
  const animRef    = useRef<number>(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const startTsRef = useRef<number>(0);

  const [run, setRun]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg]   = useState<string | null>(null);
  const [tilesReady, setTilesReady] = useState(false);
  const [status, setStatus]   = useState<"idle" | "playing" | "recording" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [units] = useState<"km" | "mi">(() => {
    try {
      const p = JSON.parse(localStorage.getItem("userProfile") || "{}");
      return p.preferredUnits === "imperial" ? "mi" : "km";
    } catch { return "km"; }
  });

  // ── Fetch run ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!runId) return;
    const token = localStorage.getItem("authToken");
    fetch(`/api/runs/${runId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => { setRun(data); setLoading(false); })
      .catch(() => { setErrMsg("Could not load this run."); setLoading(false); });
  }, [runId]);

  // ── Pre-render satellite tiles to an offscreen canvas ──────────────────────
  const prepareTiles = useCallback(async (points: { lat: number; lng: number }[]) => {
    if (points.length < 2) return null;

    const zoom = pickZoom(points);
    const lats  = points.map(p => p.lat);
    const lngs  = points.map(p => p.lng);
    const cLat  = (Math.min(...lats) + Math.max(...lats)) / 2;
    const cLng  = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    // centre of canvas in world-pixel space
    const cPx  = worldPx(cLat, cLng, zoom);
    const originX = cPx.x - CW / 2;   // world-px of canvas top-left
    const originY = cPx.y - CH / 2;

    // which tiles do we need?
    const tileXMin = Math.floor(originX / TILE_SIZE);
    const tileYMin = Math.floor(originY / TILE_SIZE);
    const tileXMax = Math.floor((originX + CW) / TILE_SIZE);
    const tileYMax = Math.floor((originY + CH) / TILE_SIZE);

    const offscreen = document.createElement("canvas");
    offscreen.width  = CW;
    offscreen.height = CH;
    const ctx = offscreen.getContext("2d")!;

    // dark fallback background
    ctx.fillStyle = "#1a2230";
    ctx.fillRect(0, 0, CW, CH);

    const tilePromises: Promise<void>[] = [];
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      for (let ty = tileYMin; ty <= tileYMax; ty++) {
        const px = tx * TILE_SIZE - originX;
        const py = ty * TILE_SIZE - originY;
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
        tilePromises.push(
          loadImage(url)
            .then(img => { ctx.drawImage(img, Math.round(px), Math.round(py), TILE_SIZE, TILE_SIZE); })
            .catch(() => {}), // silently skip missing tiles
        );
      }
    }
    await Promise.allSettled(tilePromises);

    // slight dark overlay to improve text legibility
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, CW, CH);

    offscreenRef.current = offscreen;

    // build pixel-space route
    const route = points.map(p => {
      const wp = worldPx(p.lat, p.lng, zoom);
      return { x: wp.x - originX, y: wp.y - originY };
    });

    return route;
  }, []);

  const routePixelsRef = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    if (!run) return;
    const pts: { lat: number; lng: number }[] = Array.isArray(run.routePoints)
      ? run.routePoints.filter((p: any) => p?.lat && p?.lng)
      : [];
    if (pts.length < 2) { setTilesReady(true); return; }

    prepareTiles(pts).then(route => {
      if (route) routePixelsRef.current = route;
      setTilesReady(true);
    });
  }, [run, prepareTiles]);

  // ── Draw a single animation frame ──────────────────────────────────────────
  const drawFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    progress: number,          // 0 → 1
    run: any,
    units: "km" | "mi",
  ) => {
    const route  = routePixelsRef.current;
    const nPts   = route.length;
    const endIdx = Math.max(1, Math.floor(progress * (nPts - 1)));

    // 1. Tile background
    if (offscreenRef.current) {
      ctx.drawImage(offscreenRef.current, 0, 0);
    } else {
      ctx.fillStyle = "#1a2230";
      ctx.fillRect(0, 0, CW, CH);
    }

    if (nPts >= 2) {
      // 2. Drawn route (teal with glow)
      ctx.save();
      ctx.shadowColor  = TEAL_GLOW;
      ctx.shadowBlur   = 18;
      ctx.strokeStyle  = TEAL;
      ctx.lineWidth    = 14;
      ctx.lineCap      = "round";
      ctx.lineJoin     = "round";
      ctx.beginPath();
      ctx.moveTo(route[0].x, route[0].y);
      for (let i = 1; i <= endIdx; i++) {
        ctx.lineTo(route[i].x, route[i].y);
      }
      ctx.stroke();
      ctx.restore();

      // 3. Leading dot
      const dot = route[endIdx];
      ctx.save();
      // outer glow ring
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 28, 0, Math.PI * 2);
      ctx.fillStyle = TEAL_GLOW;
      ctx.fill();
      // white filled circle
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = WHITE;
      ctx.shadowColor = "rgba(255,255,255,0.6)";
      ctx.shadowBlur  = 10;
      ctx.fill();
      ctx.restore();
    }

    // 4. Top stats overlay ──────────────────────────────────────────────────
    const overlayH = 280;
    const grad = ctx.createLinearGradient(0, 0, 0, overlayH);
    grad.addColorStop(0,   "rgba(0,0,0,0.82)");
    grad.addColorStop(0.75,"rgba(0,0,0,0.55)");
    grad.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, overlayH);

    // Brand label
    ctx.save();
    ctx.fillStyle = TEAL;
    ctx.font      = "bold 36px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.letterSpacing = "4px";
    ctx.fillText("AI RUN COACH", CW / 2, 64);
    ctx.restore();

    // Run name
    const runName = run?.name || run?.routeName || "Run Summary";
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font      = "28px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(runName, CW / 2, 108);
    ctx.restore();

    // Stats row
    const totalDistM  = run?.distance || 0;
    const elevGain    = run?.totalElevationGain || 0;
    const avgPace     = run?.averagePace || run?.avgPace || "--'--\"";

    const currentDistM  = totalDistM * progress;
    const currentElev   = elevGain * progress;

    const stats = [
      { label: "Pace",     value: avgPace,                        unit: `/${units}` },
      { label: "Elevation",value: fmtElev(currentElev, units),   unit: units === "mi" ? "ft" : "m"  },
      { label: "Distance", value: fmtDist(currentDistM, units),  unit: units },
    ];

    const colW = CW / 3;
    stats.forEach((s, i) => {
      const cx = colW * i + colW / 2;

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font      = "28px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.label.toUpperCase(), cx, 158);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = WHITE;
      ctx.font      = "bold 84px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.value, cx, 238);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font      = "28px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.unit, cx, 272);
      ctx.restore();
    });

    // Dividers between stats
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth   = 2;
    [colW, colW * 2].forEach(dx => {
      ctx.beginPath();
      ctx.moveTo(dx, 148);
      ctx.lineTo(dx, 268);
      ctx.stroke();
    });
    ctx.restore();

    // 5. Bottom branding strip ──────────────────────────────────────────────
    const botH = 120;
    const botGrad = ctx.createLinearGradient(0, CH - botH, 0, CH);
    botGrad.addColorStop(0, "rgba(0,0,0,0)");
    botGrad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, CH - botH, CW, botH);

    const dateStr = fmtDate(run?.completedAt || run?.date || null);
    if (dateStr) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font      = "26px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(dateStr, CW / 2, CH - 36);
      ctx.restore();
    }

    // Progress bar at very bottom
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, CH - 8, CW, 8);
    ctx.fillStyle = TEAL;
    ctx.fillRect(0, CH - 8, CW * progress, 8);
  }, []);

  // ── Animation loop ─────────────────────────────────────────────────────────
  const DURATION_MS = 14000;

  const runAnimation = useCallback((record: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    cancelAnimationFrame(animRef.current);
    chunksRef.current = [];

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
      } catch {
        // recording not supported, just play
      }
    }

    startTsRef.current = performance.now();
    setStatus(record ? "recording" : "playing");

    const tick = (now: number) => {
      const elapsed  = now - startTsRef.current;
      const progress = Math.min(elapsed / DURATION_MS, 1);
      setProgress(progress);
      drawFrame(ctx, progress, run, units);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        // Final frame: full route complete
        drawFrame(ctx, 1, run, units);
        if (record && recorderRef.current?.state === "recording") {
          // Hold last frame for 1.5 s then stop
          setTimeout(() => {
            recorderRef.current?.stop();
          }, 1500);
        } else {
          setStatus("done");
        }
      }
    };

    animRef.current = requestAnimationFrame(tick);
  }, [run, units, drawFrame, runId]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setStatus("idle");
    setProgress(0);
  }, []);

  // Draw idle preview once tiles are ready
  useEffect(() => {
    if (!tilesReady || !run) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, 0, run, units);
  }, [tilesReady, run, units, drawFrame]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasRoute = run?.routePoints?.length >= 2;

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
          <p className="text-white/40 text-xs">Preview your animated run summary</p>
        </div>
      </div>

      {/* Canvas preview */}
      <div className="flex-1 flex flex-col items-center px-4 py-6 gap-6">
        <div
          className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10"
          style={{ width: "min(360px, 100%)", aspectRatio: "9/16" }}
        >
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            className="w-full h-full"
            data-testid="canvas-run-video"
          />
          {!tilesReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-white/70 text-sm">Loading map tiles…</span>
              </div>
            </div>
          )}
          {!hasRoute && tilesReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center px-6">
                <p className="text-white/60 text-sm">No GPS track available for this run</p>
              </div>
            </div>
          )}
          {/* Progress bar overlay during play */}
          {(status === "playing" || status === "recording") && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <div
                className="h-full transition-none"
                style={{ width: `${progress * 100}%`, background: TEAL }}
              />
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
          {(status === "idle" || status === "done") && tilesReady && (
            <>
              <Button
                onClick={() => runAnimation(false)}
                variant="outline"
                className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                data-testid="button-preview"
              >
                <Play className="w-4 h-4 mr-2" />
                Preview Animation
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
          Video is saved as a .webm file — you can share it directly to Instagram, WhatsApp, or any social platform.
        </p>
      </div>
    </div>
  );
}
