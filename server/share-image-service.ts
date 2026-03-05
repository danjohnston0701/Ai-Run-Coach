import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

export interface ShareTemplate {
  id: string;
  name: string;
  description: string;
  category: "stats" | "map" | "splits" | "achievement" | "minimal";
  preview: string;
  aspectRatios: AspectRatio[];
}

export type AspectRatio = "1:1" | "9:16" | "4:5";

interface Dimensions {
  width: number;
  height: number;
}

const ASPECT_DIMENSIONS: Record<AspectRatio, Dimensions> = {
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
};

export interface StickerWidget {
  id: string;
  type: "stat" | "chart" | "badge" | "text";
  category: string;
  label: string;
  icon: string;
}

export interface PlacedSticker {
  widgetId: string;
  x: number;
  y: number;
  scale: number;
}

export interface GenerateImageRequest {
  templateId: string;
  aspectRatio: AspectRatio;
  stickers: PlacedSticker[];
  runData: RunDataForImage;
  userName?: string;
}

export interface RunDataForImage {
  distance: number;
  duration: number;
  avgPace?: string;
  avgHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  cadence?: number;
  elevation?: number;
  elevationGain?: number;
  elevationLoss?: number;
  difficulty?: string;
  gpsTrack?: Array<{ lat: number; lng: number }>;
  heartRateData?: Array<{ timestamp: number; value: number }>;
  paceData?: Array<{ km: number; pace: string; paceSeconds: number }>;
  completedAt?: string;
  name?: string;
  weatherData?: { temperature?: number; conditions?: string };
}

const C = {
  cyan:       "#00D4FF",
  cyanDark:   "#0099CC",
  orange:     "#FF6B35",
  green:      "#00E676",
  greenDark:  "#00C853",
  yellow:     "#FFD600",
  red:        "#FF5252",
  blue:       "#4285F4",
  white:      "#FFFFFF",
  offWhite:   "#F8FAFC",
  bg:         "#FFFFFF",
  bgSoft:     "#F1F5F9",
  bgCard:     "#FFFFFF",
  textDark:   "#0F172A",
  textMid:    "#334155",
  textLight:  "#64748B",
  textMuted:  "#94A3B8",
  border:     "#E2E8F0",
  borderSoft: "#F1F5F9",
  shadow:     "#000000",
};

const FONT = `'SF Pro Display', 'Inter', 'Helvetica Neue', Arial, sans-serif`;

const LOGO_ZONE_H = 70;

export const TEMPLATES: ShareTemplate[] = [
  {
    id: "stats-grid",
    name: "Run Rings",
    description: "Dynamic ring gauges showing your key metrics",
    category: "stats",
    preview: "grid",
    aspectRatios: ["1:1", "9:16", "4:5"],
  },
  {
    id: "route-map",
    name: "Route Map",
    description: "Your GPS route on a real map with stats",
    category: "map",
    preview: "map",
    aspectRatios: ["1:1", "9:16", "4:5"],
  },
  {
    id: "split-summary",
    name: "Split Summary",
    description: "Km splits with pace performance bars",
    category: "splits",
    preview: "splits",
    aspectRatios: ["1:1", "9:16", "4:5"],
  },
  {
    id: "achievement",
    name: "Achievement",
    description: "Celebrate your personal bests and milestones",
    category: "achievement",
    preview: "achievement",
    aspectRatios: ["1:1", "9:16", "4:5"],
  },
  {
    id: "minimal-dark",
    name: "Minimal Dark",
    description: "Clean, editorial single-stat hero layout",
    category: "minimal",
    preview: "minimal",
    aspectRatios: ["1:1", "9:16", "4:5"],
  },
];

export const STICKER_WIDGETS: StickerWidget[] = [
  { id: "stat-distance", type: "stat", category: "metrics", label: "Distance", icon: "map-pin" },
  { id: "stat-duration", type: "stat", category: "metrics", label: "Duration", icon: "clock" },
  { id: "stat-pace", type: "stat", category: "metrics", label: "Avg Pace", icon: "zap" },
  { id: "stat-heartrate", type: "stat", category: "metrics", label: "Avg Heart Rate", icon: "heart" },
  { id: "stat-calories", type: "stat", category: "metrics", label: "Calories", icon: "activity" },
  { id: "stat-elevation", type: "stat", category: "metrics", label: "Elevation", icon: "trending-up" },
  { id: "stat-cadence", type: "stat", category: "metrics", label: "Cadence", icon: "repeat" },
  { id: "stat-maxhr", type: "stat", category: "metrics", label: "Max Heart Rate", icon: "heart" },
  { id: "chart-elevation", type: "chart", category: "charts", label: "Elevation Profile", icon: "bar-chart" },
  { id: "chart-pace", type: "chart", category: "charts", label: "Pace Chart", icon: "bar-chart" },
  { id: "chart-heartrate", type: "chart", category: "charts", label: "Heart Rate Chart", icon: "bar-chart" },
  { id: "badge-difficulty", type: "badge", category: "badges", label: "Difficulty Badge", icon: "shield" },
  { id: "badge-weather", type: "badge", category: "badges", label: "Weather", icon: "cloud" },
  { id: "text-custom", type: "text", category: "text", label: "Custom Text", icon: "type" },
];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sampleData(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;
  const step = data.length / maxPoints;
  const result: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(data[Math.floor(i * step)]);
  }
  return result;
}

function paceToSeconds(pace: string): number {
  const parts = pace.split(":");
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return 0;
}

function paceColor(seconds: number, fastest: number, slowest: number): string {
  const range = slowest - fastest || 1;
  const ratio = (seconds - fastest) / range;
  if (ratio <= 0.33) return C.green;
  if (ratio <= 0.66) return C.yellow;
  return C.orange;
}

function globalDefs(w: number, h: number): string {
  return `
    <defs>
      <linearGradient id="cyanRingGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#00E5FF"/>
        <stop offset="100%" stop-color="#00E676"/>
      </linearGradient>
      <linearGradient id="blueRingGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#42A5F5"/>
        <stop offset="100%" stop-color="#7C4DFF"/>
      </linearGradient>
      <linearGradient id="yellowRingGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFD600"/>
        <stop offset="100%" stop-color="#FF9100"/>
      </linearGradient>
      <linearGradient id="greenRingGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#00E676"/>
        <stop offset="100%" stop-color="#00BFA5"/>
      </linearGradient>
      <linearGradient id="redRingGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FF5252"/>
        <stop offset="100%" stop-color="#FF4081"/>
      </linearGradient>
      <linearGradient id="orangeRingGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FF6B35"/>
        <stop offset="100%" stop-color="#FF9100"/>
      </linearGradient>
      <linearGradient id="fadeLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.cyan}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${C.cyan}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${C.cyan}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.cyan}"/>
        <stop offset="50%" stop-color="${C.green}"/>
        <stop offset="100%" stop-color="${C.cyan}"/>
      </linearGradient>
      <filter id="ringGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="softShadow" x="-10%" y="-5%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#000000" flood-opacity="0.08"/>
      </filter>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
  `;
}

function metricRing(
  cx: number, cy: number, r: number,
  label: string, value: string, unit: string,
  gradId: string, progress: number
): string {
  const circumference = 2 * Math.PI * r;
  const strokeW = Math.max(r * 0.16, 8);
  const dashLen = circumference * Math.min(Math.max(progress, 0.05), 1.0);
  const gap = circumference - dashLen;
  const trackOpacity = 0.08;

  const valueFontSize = Math.round(r * 0.6);
  const labelFontSize = Math.round(r * 0.22);
  const unitFontSize = Math.round(r * 0.2);

  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.border}" stroke-width="${strokeW}" opacity="${trackOpacity}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${gradId})" stroke-width="${strokeW}" stroke-linecap="round" stroke-dasharray="${dashLen} ${gap}" transform="rotate(-90 ${cx} ${cy})" filter="url(#ringGlow)"/>
    <text x="${cx}" y="${cy - valueFontSize * 0.15}" font-family="${FONT}" font-size="${labelFontSize}" font-weight="600" fill="${C.textLight}" text-anchor="middle" letter-spacing="1">${esc(label)}</text>
    <text x="${cx}" y="${cy + valueFontSize * 0.45}" font-family="${FONT}" font-size="${valueFontSize}" font-weight="800" fill="${C.textDark}" text-anchor="middle">${esc(value)}</text>
    ${unit ? `<text x="${cx}" y="${cy + valueFontSize * 0.45 + unitFontSize + 4}" font-family="${FONT}" font-size="${unitFontSize}" font-weight="500" fill="${C.textMuted}" text-anchor="middle">${esc(unit)}</text>` : ""}
  `;
}

function buildStatsGridSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const isVertical = h > w;
  const cx = w / 2;
  const contentEndY = h - LOGO_ZONE_H;

  let headerY = isVertical ? 70 : 55;
  let headerSvg = "";

  if (userName) {
    headerSvg += `<text x="${cx}" y="${headerY}" font-family="${FONT}" font-size="20" font-weight="700" fill="${C.textDark}" text-anchor="middle">${esc(userName)}</text>`;
    headerY += 26;
  }
  headerSvg += `<text x="${cx}" y="${headerY}" font-family="${FONT}" font-size="14" fill="${C.textLight}" text-anchor="middle" letter-spacing="0.5">${esc(formatDate(run.completedAt))}</text>`;
  headerY += 14;

  const heroY = headerY + 50;
  const dist = run.distance?.toFixed(2) || "0";
  headerSvg += `<text x="${cx}" y="${heroY}" font-family="${FONT}" font-size="72" font-weight="900" fill="${C.textDark}" text-anchor="middle" letter-spacing="-2">${esc(dist)}</text>`;
  headerSvg += `<text x="${cx}" y="${heroY + 32}" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.cyan}" text-anchor="middle" letter-spacing="6">KILOMETERS</text>`;
  headerSvg += `<line x1="${w * 0.2}" y1="${heroY + 48}" x2="${w * 0.8}" y2="${heroY + 48}" stroke="url(#fadeLine)" stroke-width="1.5"/>`;

  const ringAreaTop = heroY + 70;
  const ringAreaBot = contentEndY - 20;
  const ringAreaH = ringAreaBot - ringAreaTop;

  const gap = isVertical ? 30 : 20;
  const ringR = Math.min((w - gap * 3) / 4 * 0.45, (ringAreaH - gap) / 2 * 0.45, 120);

  const col1X = w * 0.28;
  const col2X = w * 0.72;
  const row1Y = ringAreaTop + ringAreaH * 0.3;
  const row2Y = ringAreaTop + ringAreaH * 0.72;

  const durationSec = run.duration || 0;
  const distKm = run.distance || 0;
  const distProgress = Math.min(distKm / 15, 1);
  const durationProgress = Math.min(durationSec / 5400, 1);

  let paceProgress = 0.5;
  if (run.avgPace) {
    const paceSec = paceToSeconds(run.avgPace);
    if (paceSec > 0) paceProgress = Math.min(Math.max(1 - (paceSec - 180) / 420, 0.1), 1);
  }

  let hrProgress = 0.5;
  if (run.avgHeartRate) {
    hrProgress = Math.min(run.avgHeartRate / 200, 1);
  }

  let calProgress = 0.5;
  if (run.calories) {
    calProgress = Math.min(run.calories / 800, 1);
  }

  let elevProgress = 0.3;
  const elev = run.elevationGain || run.elevation || 0;
  if (elev > 0) {
    elevProgress = Math.min(elev / 500, 1);
  }

  const rings4 = [
    { cx: col1X, cy: row1Y, label: "Distance", value: dist, unit: "km", grad: "cyanRingGrad", prog: distProgress },
    { cx: col2X, cy: row1Y, label: "Pace", value: run.avgPace || "--:--", unit: "/km", grad: "blueRingGrad", prog: paceProgress },
    { cx: col1X, cy: row2Y, label: "Duration", value: formatDuration(durationSec), unit: "", grad: "yellowRingGrad", prog: durationProgress },
    { cx: col2X, cy: row2Y, label: "Calories", value: run.calories?.toString() || "--", unit: "kcal", grad: "greenRingGrad", prog: calProgress },
  ];

  if (run.avgHeartRate) {
    rings4[3] = { cx: col2X, cy: row2Y, label: "Heart Rate", value: run.avgHeartRate.toString(), unit: "bpm", grad: "redRingGrad", prog: hrProgress };
  }

  let ringSvg = "";
  rings4.forEach(r => {
    ringSvg += metricRing(r.cx, r.cy, ringR, r.label, r.value, r.unit, r.grad, r.prog);
  });

  const extraY = ringAreaBot - 6;
  let extraStats = "";
  const extras = [];
  if (run.avgHeartRate && !rings4.find(r => r.label === "Heart Rate")) {
    extras.push({ label: "AVG HR", value: `${run.avgHeartRate} bpm`, color: C.red });
  }
  if (run.calories && !rings4.find(r => r.label === "Calories" && r.value !== "--")) {
  }
  if (elev > 0) {
    extras.push({ label: "ELEVATION", value: `${Math.round(elev)}m`, color: C.green });
  }
  if (run.cadence) {
    extras.push({ label: "CADENCE", value: `${run.cadence} spm`, color: C.cyan });
  }

  if (extras.length > 0) {
    const spacing = w / (extras.length + 1);
    extras.forEach((e, i) => {
      const ex = spacing * (i + 1);
      extraStats += `<text x="${ex}" y="${extraY - 14}" font-family="${FONT}" font-size="10" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1.5">${e.label}</text>`;
      extraStats += `<text x="${ex}" y="${extraY + 6}" font-family="${FONT}" font-size="16" font-weight="700" fill="${e.color}" text-anchor="middle">${esc(e.value)}</text>`;
    });
  }

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${headerSvg}
    ${ringSvg}
    ${extraStats}
  `;
}

function buildGpsRouteElite(
  x: number, y: number, w: number, h: number,
  track: Array<{ lat: number; lng: number }>,
  paceData?: Array<{ km: number; pace: string; paceSeconds: number }>
): string {
  if (!track || track.length < 2) return "";

  const lats = track.map((p) => p.lat);
  const lngs = track.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;

  const padding = 50;
  const drawW = w - padding * 2;
  const drawH = h - padding * 2;

  const scale = Math.min(drawW / lngRange, drawH / latRange);
  const offsetX = x + padding + (drawW - lngRange * scale) / 2;
  const offsetY = y + padding + (drawH - latRange * scale) / 2;

  const mapped = track.map((p) => ({
    px: offsetX + (p.lng - minLng) * scale,
    py: offsetY + (maxLat - p.lat) * scale,
  }));

  let routeSvg = "";
  if (paceData && paceData.length > 0) {
    const paceSeconds = paceData.map(p => p.paceSeconds);
    const fastest = Math.min(...paceSeconds);
    const slowest = Math.max(...paceSeconds);
    const segmentLength = Math.max(1, Math.floor(mapped.length / paceData.length));

    for (let i = 0; i < mapped.length - 1; i++) {
      const paceIdx = Math.min(Math.floor(i / segmentLength), paceData.length - 1);
      const color = paceColor(paceData[paceIdx].paceSeconds, fastest, slowest);
      routeSvg += `<line x1="${mapped[i].px}" y1="${mapped[i].py}" x2="${mapped[i + 1].px}" y2="${mapped[i + 1].py}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
    }
  } else {
    const points = mapped.map(p => `${p.px},${p.py}`).join(" ");
    routeSvg = `<polyline points="${points}" fill="none" stroke="url(#routeGrad)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>`;
  }

  const glowPoints = mapped.map(p => `${p.px},${p.py}`).join(" ");
  const glowRoute = `<polyline points="${glowPoints}" fill="none" stroke="${C.cyan}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity="0.12"/>`;

  const sp = mapped[0];
  const ep = mapped[mapped.length - 1];

  let kmMarkers = "";
  if (paceData && paceData.length > 1) {
    paceData.forEach((pd, idx) => {
      if (idx === 0) return;
      const trackIdx = Math.min(Math.floor(((idx) / paceData.length) * mapped.length), mapped.length - 1);
      const pt = mapped[trackIdx];
      kmMarkers += `
        <circle cx="${pt.px}" cy="${pt.py}" r="10" fill="${C.bgCard}" stroke="${C.border}" stroke-width="1.5" opacity="0.9"/>
        <text x="${pt.px}" y="${pt.py + 4}" font-family="${FONT}" font-size="9" font-weight="700" fill="${C.textMid}" text-anchor="middle">${idx}</text>
      `;
    });
  }

  return `
    ${glowRoute}
    ${routeSvg}
    ${kmMarkers}
    <circle cx="${sp.px}" cy="${sp.py}" r="12" fill="${C.green}" stroke="${C.bgCard}" stroke-width="4"/>
    <circle cx="${sp.px}" cy="${sp.py}" r="5" fill="${C.bgCard}"/>
    <circle cx="${ep.px}" cy="${ep.py}" r="12" fill="${C.red}" stroke="${C.bgCard}" stroke-width="4"/>
    <circle cx="${ep.px}" cy="${ep.py}" r="4" fill="${C.white}"/>
  `;
}

function buildRouteMapSvg(w: number, h: number, run: RunDataForImage, userName?: string, hasMapTile?: boolean): string {
  const isVertical = h > w;
  const contentEndY = h - LOGO_ZONE_H;
  const mapH = Math.round(isVertical ? contentEndY * 0.6 : contentEndY * 0.58);
  const statsY = mapH + 16;

  const gap = 12;
  const statW = (w - gap * 4) / 3;
  const statH = isVertical ? 100 : 90;

  const stats = [
    { label: "DISTANCE", value: run.distance?.toFixed(2) || "0", unit: "km", color: C.cyan },
    { label: "PACE", value: run.avgPace || "--:--", unit: "/km", color: C.orange },
    { label: "TIME", value: formatDuration(run.duration || 0), unit: "", color: C.blue },
  ];

  let statCards = "";
  stats.forEach((s, i) => {
    const sx = gap + i * (statW + gap);
    const cardMidX = sx + statW / 2;
    statCards += `
      <rect x="${sx}" y="${statsY}" width="${statW}" height="${statH}" rx="16" fill="${C.bgCard}" filter="url(#softShadow)"/>
      <rect x="${sx}" y="${statsY}" width="${statW}" height="${statH}" rx="16" fill="none" stroke="${C.border}" stroke-width="1"/>
      <line x1="${sx + 16}" y1="${statsY + 3}" x2="${sx + statW - 16}" y2="${statsY + 3}" stroke="${s.color}" stroke-width="2.5" opacity="0.4" stroke-linecap="round"/>
      <text x="${cardMidX}" y="${statsY + 28}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1.5">${s.label}</text>
      <text x="${cardMidX}" y="${statsY + statH * 0.62}" font-family="${FONT}" font-size="36" font-weight="800" fill="${s.color}" text-anchor="middle">${esc(s.value)}</text>
      ${s.unit ? `<text x="${cardMidX}" y="${statsY + statH - 14}" font-family="${FONT}" font-size="12" font-weight="500" fill="${C.textMuted}" text-anchor="middle">${esc(s.unit)}</text>` : ""}
    `;
  });

  let legend = "";
  if (run.paceData && run.paceData.length > 0 && !hasMapTile) {
    const paceSeconds = run.paceData.map(p => p.paceSeconds);
    const fastest = Math.min(...paceSeconds);
    const slowest = Math.max(...paceSeconds);
    const fastPace = `${Math.floor(fastest / 60)}:${String(Math.round(fastest % 60)).padStart(2, "0")}`;
    const slowPace = `${Math.floor(slowest / 60)}:${String(Math.round(slowest % 60)).padStart(2, "0")}`;
    const legendY = mapH - 50;
    legend = `
      <rect x="20" y="${legendY}" width="160" height="40" rx="10" fill="${C.bgCard}" opacity="0.92" stroke="${C.border}" stroke-width="1"/>
      <text x="30" y="${legendY + 14}" font-family="${FONT}" font-size="10" font-weight="600" fill="${C.textMuted}" letter-spacing="1">PACE</text>
      <rect x="30" y="${legendY + 20}" width="80" height="6" rx="3">
        <animate attributeName="fill" values="${C.green};${C.yellow};${C.orange}" dur="0s" fill="freeze"/>
      </rect>
      <linearGradient id="paceGradLegend" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${C.green}"/><stop offset="50%" stop-color="${C.yellow}"/><stop offset="100%" stop-color="${C.orange}"/></linearGradient>
      <rect x="30" y="${legendY + 20}" width="80" height="6" rx="3" fill="url(#paceGradLegend)"/>
      <text x="30" y="${legendY + 36}" font-family="${FONT}" font-size="9" fill="${C.green}">${fastPace}</text>
      <text x="110" y="${legendY + 36}" font-family="${FONT}" font-size="9" fill="${C.orange}" text-anchor="end">${slowPace}</text>
    `;
  }

  const footerY = statsY + statH + 28;
  const nameDate = userName
    ? `${esc(userName)}  ·  ${esc(formatDate(run.completedAt))}`
    : esc(formatDate(run.completedAt));

  const mapBg = hasMapTile
    ? ""
    : `<rect width="${w}" height="${mapH}" fill="${C.bgSoft}"/>`;

  const routeSvg = hasMapTile
    ? ""
    : (run.gpsTrack && run.gpsTrack.length > 1
      ? buildGpsRouteElite(0, 0, w, mapH, run.gpsTrack, run.paceData)
      : `<text x="${w / 2}" y="${mapH / 2}" font-family="${FONT}" font-size="22" fill="${C.textMuted}" text-anchor="middle">No GPS data available</text>`);

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${mapBg}
    ${routeSvg}
    ${legend}
    ${statCards}
    <text x="${w / 2}" y="${footerY}" font-family="${FONT}" font-size="14" fill="${C.textLight}" text-anchor="middle">${nameDate}</text>
  `;
}

function getRouteMapHeight(w: number, h: number): number {
  const isVertical = h > w;
  const contentEndY = h - LOGO_ZONE_H;
  return Math.round(isVertical ? contentEndY * 0.6 : contentEndY * 0.58);
}

function buildSplitSummarySvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const pad = 40;
  const contentEndY = h - LOGO_ZONE_H;

  let headerY = 65;
  const dateText = esc(formatDate(run.completedAt));
  const heroText = `${esc(run.distance?.toFixed(2) || "0")} km`;
  const timeText = esc(formatDuration(run.duration || 0));

  let headerSvg = "";
  if (userName) {
    headerSvg += `<text x="${w / 2}" y="${headerY}" font-family="${FONT}" font-size="18" font-weight="700" fill="${C.textDark}" text-anchor="middle">${esc(userName)}</text>`;
    headerY += 22;
  }
  headerSvg += `
    <text x="${w / 2}" y="${headerY}" font-family="${FONT}" font-size="13" fill="${C.textLight}" text-anchor="middle" letter-spacing="0.5">${dateText}</text>
    <text x="${w / 2}" y="${headerY + 46}" font-family="${FONT}" font-size="48" font-weight="900" fill="${C.textDark}" text-anchor="middle" letter-spacing="-1">${heroText}</text>
    <text x="${w / 2}" y="${headerY + 72}" font-family="${FONT}" font-size="20" font-weight="600" fill="${C.cyan}" text-anchor="middle">${timeText}</text>
    <line x1="${pad}" y1="${headerY + 88}" x2="${w - pad}" y2="${headerY + 88}" stroke="url(#fadeLine)" stroke-width="1"/>
  `;

  const splitsStartY = headerY + 112;
  headerSvg += `
    <text x="${pad + 10}" y="${splitsStartY - 8}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.textMuted}" letter-spacing="1.5">SPLIT</text>
    <text x="${w / 2}" y="${splitsStartY - 8}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1.5">PERFORMANCE</text>
    <text x="${w - pad - 10}" y="${splitsStartY - 8}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="end" letter-spacing="1.5">PACE</text>
  `;

  const paceData = run.paceData || [];
  const rowH = 52;
  const maxSplits = Math.min(paceData.length, Math.floor((contentEndY - splitsStartY - 80) / rowH));

  let splitRows = "";
  if (paceData.length === 0) {
    splitRows = `<text x="${w / 2}" y="${splitsStartY + 60}" font-family="${FONT}" font-size="18" fill="${C.textMuted}" text-anchor="middle">No split data available</text>`;
  }

  const paceValues = paceData.map((p) => p.paceSeconds);
  const minPace = paceValues.length > 0 ? Math.min(...paceValues) : 0;
  const maxPace = paceValues.length > 0 ? Math.max(...paceValues) : 1;
  const paceRange = maxPace - minPace || 1;
  const bestSplitIdx = paceValues.indexOf(minPace);

  const barStartX = pad + 70;
  const barMaxW = w - pad * 2 - 170;

  for (let i = 0; i < maxSplits; i++) {
    const split = paceData[i];
    const ry = splitsStartY + i * rowH;
    const barRatio = 0.4 + 0.6 * (1 - (split.paceSeconds - minPace) / paceRange);
    const barW = barMaxW * barRatio;
    const pc = paceColor(split.paceSeconds, minPace, maxPace);
    const isBest = i === bestSplitIdx;

    if (i % 2 === 0) {
      splitRows += `<rect x="${pad}" y="${ry}" width="${w - pad * 2}" height="${rowH}" rx="8" fill="${C.bgSoft}" opacity="0.6"/>`;
    }

    splitRows += `<text x="${pad + 14}" y="${ry + 32}" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.textDark}">Km ${split.km}</text>`;
    splitRows += `<rect x="${barStartX}" y="${ry + 18}" width="${barW}" height="18" rx="9" fill="${pc}" opacity="0.15"/>`;
    splitRows += `<rect x="${barStartX}" y="${ry + 18}" width="${barW * 0.85}" height="18" rx="9" fill="${pc}" opacity="0.4"/>`;

    if (isBest && maxSplits > 1) {
      splitRows += `<text x="${barStartX + barW + 6}" y="${ry + 32}" font-family="${FONT}" font-size="10" font-weight="700" fill="${C.green}" letter-spacing="0.5">BEST</text>`;
    }

    splitRows += `<text x="${w - pad - 14}" y="${ry + 32}" font-family="${FONT}" font-size="18" font-weight="700" fill="${pc}" text-anchor="end">${esc(split.pace)}</text>`;
  }

  const summaryY = splitsStartY + maxSplits * rowH + 16;
  let summarySvg = "";
  if (maxSplits > 0) {
    summarySvg = `
      <line x1="${pad}" y1="${summaryY - 4}" x2="${w - pad}" y2="${summaryY - 4}" stroke="${C.border}" stroke-width="1"/>
      <text x="${pad + 14}" y="${summaryY + 22}" font-family="${FONT}" font-size="14" font-weight="600" fill="${C.textLight}">AVG PACE</text>
      <text x="${w - pad - 14}" y="${summaryY + 22}" font-family="${FONT}" font-size="22" font-weight="800" fill="${C.cyan}" text-anchor="end">${esc(run.avgPace || "--:--")} /km</text>
    `;
  }

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${headerSvg}
    ${splitRows}
    ${summarySvg}
  `;
}

function buildAchievementSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const cx = w / 2;
  const contentEndY = h - LOGO_ZONE_H;
  const cy = contentEndY * 0.38;
  const ringR = Math.min(w, contentEndY) * 0.2;

  const distProgress = Math.min((run.distance || 0) / 15, 1);
  const circumference = 2 * Math.PI * ringR;
  const dashLen = circumference * distProgress;
  const gap = circumference - dashLen;

  const rings = `
    <circle cx="${cx}" cy="${cy}" r="${ringR + 50}" fill="none" stroke="${C.cyan}" stroke-width="0.5" opacity="0.06"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR + 30}" fill="none" stroke="${C.cyan}" stroke-width="0.5" opacity="0.1"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR + 10}" fill="none" stroke="${C.cyan}" stroke-width="1" opacity="0.12"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${C.border}" stroke-width="10" opacity="0.08"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="url(#cyanRingGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dashLen} ${gap}" transform="rotate(-90 ${cx} ${cy})" filter="url(#ringGlow)"/>
  `;

  const center = `
    <text x="${cx}" y="${cy - 30}" font-family="${FONT}" font-size="14" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="4">RUN COMPLETE</text>
    <text x="${cx}" y="${cy + 26}" font-family="${FONT}" font-size="72" font-weight="900" fill="${C.textDark}" text-anchor="middle">${esc(run.distance?.toFixed(2) || "0")}</text>
    <text x="${cx}" y="${cy + 54}" font-family="${FONT}" font-size="18" font-weight="700" fill="${C.cyan}" text-anchor="middle" letter-spacing="6">KILOMETERS</text>
  `;

  const statsY = cy + ringR + 50;
  const thirds = w / 3;
  const statItems = [
    { label: "PACE", value: run.avgPace || "--:--", color: C.orange },
    { label: "TIME", value: formatDuration(run.duration || 0), color: C.blue },
    { label: "AVG HR", value: `${run.avgHeartRate || "--"}`, color: C.red },
  ];

  let statsRow = "";
  statItems.forEach((s, i) => {
    const sx = thirds * i + thirds / 2;
    statsRow += `
      <text x="${sx}" y="${statsY}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="2">${s.label}</text>
      <text x="${sx}" y="${statsY + 34}" font-family="${FONT}" font-size="30" font-weight="800" fill="${s.color}" text-anchor="middle">${esc(s.value)}</text>
    `;
  });

  statsRow += `
    <line x1="${thirds}" y1="${statsY - 8}" x2="${thirds}" y2="${statsY + 42}" stroke="${C.border}" stroke-width="1"/>
    <line x1="${thirds * 2}" y1="${statsY - 8}" x2="${thirds * 2}" y2="${statsY + 42}" stroke="${C.border}" stroke-width="1"/>
  `;

  const topY = cy - ringR - 50;
  let topSection = "";
  if (userName) {
    topSection += `<text x="${cx}" y="${topY}" font-family="${FONT}" font-size="20" font-weight="700" fill="${C.textDark}" text-anchor="middle">${esc(userName)}</text>`;
    topSection += `<text x="${cx}" y="${topY + 22}" font-family="${FONT}" font-size="13" fill="${C.textLight}" text-anchor="middle">${esc(formatDate(run.completedAt))}</text>`;
  } else {
    topSection += `<text x="${cx}" y="${topY + 12}" font-family="${FONT}" font-size="13" fill="${C.textLight}" text-anchor="middle">${esc(formatDate(run.completedAt))}</text>`;
  }

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${topSection}
    ${rings}
    ${center}
    ${statsRow}
  `;
}

function buildMinimalSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const cx = w / 2;
  const contentEndY = h - LOGO_ZONE_H;
  const cy = contentEndY * 0.4;

  const topY = cy - 110;
  const nameDate = userName
    ? `${esc(userName)}  ·  ${esc(formatDate(run.completedAt))}`
    : esc(formatDate(run.completedAt));
  const topText = `<text x="${cx}" y="${topY}" font-family="${FONT}" font-size="17" font-weight="500" fill="${C.textLight}" text-anchor="middle" letter-spacing="0.5">${nameDate}</text>`;

  const lines = `
    <line x1="${w * 0.12}" y1="${cy - 80}" x2="${w * 0.88}" y2="${cy - 80}" stroke="url(#fadeLine)" stroke-width="1"/>
    <line x1="${w * 0.12}" y1="${cy + 70}" x2="${w * 0.88}" y2="${cy + 70}" stroke="url(#fadeLine)" stroke-width="1"/>
  `;

  const heroDistance = `
    <text x="${cx}" y="${cy + 10}" font-family="${FONT}" font-size="120" font-weight="900" fill="${C.textDark}" text-anchor="middle" letter-spacing="-4">${esc(run.distance?.toFixed(2) || "0")}</text>
    <text x="${cx}" y="${cy + 48}" font-family="${FONT}" font-size="22" font-weight="700" fill="${C.cyan}" text-anchor="middle" letter-spacing="8">KILOMETERS</text>
  `;

  const subY = cy + 110;
  const subStats = `
    <text x="${w * 0.3}" y="${subY}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="2">DURATION</text>
    <text x="${w * 0.3}" y="${subY + 28}" font-family="${FONT}" font-size="24" font-weight="700" fill="${C.textDark}" text-anchor="middle">${esc(formatDuration(run.duration || 0))}</text>
    <text x="${w * 0.7}" y="${subY}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="2">AVG PACE</text>
    <text x="${w * 0.7}" y="${subY + 28}" font-family="${FONT}" font-size="24" font-weight="700" fill="${C.textDark}" text-anchor="middle">${esc(run.avgPace || "--:--")} /km</text>
    <line x1="${cx}" y1="${subY - 10}" x2="${cx}" y2="${subY + 36}" stroke="${C.border}" stroke-width="1"/>
  `;

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${topText}
    ${lines}
    ${heroDistance}
    ${subStats}
  `;
}

function buildMiniChart(x: number, y: number, w: number, h: number, data: number[], color: string, label: string): string {
  if (!data || data.length < 2) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const chartH = h - 40;
  const chartY = y + 30;
  const stepX = w / (data.length - 1);

  const points = data.map((v, i) => {
    const px = x + i * stepX;
    const py = chartY + chartH - ((v - min) / range) * chartH;
    return `${px},${py}`;
  }).join(" ");

  const areaPoints = `${x},${chartY + chartH} ${points} ${x + w},${chartY + chartH}`;

  return `
    <text x="${x}" y="${y + 16}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.textMuted}" letter-spacing="1">${esc(label.toUpperCase())}</text>
    <polygon points="${areaPoints}" fill="${color}" opacity="0.08"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function buildStickerSvg(sticker: PlacedSticker, run: RunDataForImage, canvasW: number, canvasH: number): string {
  const px = Math.round(sticker.x * canvasW);
  const py = Math.round(sticker.y * canvasH);
  const s = sticker.scale || 1;
  const sw = Math.round(200 * s);
  const sh = Math.round(100 * s);
  const protectedY = canvasH - LOGO_ZONE_H;
  if (py + sh > protectedY) return "";
  const fontSize = Math.round(30 * s);
  const labelSize = Math.round(11 * s);
  const rx = Math.round(16 * s);

  let value = "";
  let unit = "";
  let label = "";
  let color = C.cyan;

  switch (sticker.widgetId) {
    case "stat-distance":
      value = run.distance?.toFixed(2) || "0"; unit = "km"; label = "DISTANCE"; color = C.cyan; break;
    case "stat-duration":
      value = formatDuration(run.duration || 0); unit = ""; label = "DURATION"; color = C.blue; break;
    case "stat-pace":
      value = run.avgPace || "--:--"; unit = "/km"; label = "AVG PACE"; color = C.orange; break;
    case "stat-heartrate":
      value = run.avgHeartRate?.toString() || "--"; unit = "bpm"; label = "AVG HR"; color = C.red; break;
    case "stat-calories":
      value = run.calories?.toString() || "--"; unit = "kcal"; label = "CALORIES"; color = C.yellow; break;
    case "stat-elevation":
      value = Math.round(run.elevationGain || run.elevation || 0).toString(); unit = "m"; label = "ELEVATION"; color = C.green; break;
    case "stat-cadence":
      value = run.cadence?.toString() || "--"; unit = "spm"; label = "CADENCE"; color = C.cyan; break;
    case "stat-maxhr":
      value = run.maxHeartRate?.toString() || "--"; unit = "bpm"; label = "MAX HR"; color = C.red; break;
    case "chart-elevation": {
      if (!run.paceData || run.paceData.length < 2) return "";
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const elevData = run.paceData.map((_, i) => {
        const gps = run.gpsTrack;
        if (gps && gps.length > i) {
          const point = gps[Math.floor((i / run.paceData!.length) * gps.length)] as any;
          return point?.elevation || 0;
        }
        return 0;
      });
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, elevData, C.green, "Elevation")}</g>`;
    }
    case "chart-pace": {
      if (!run.paceData || run.paceData.length < 2) return "";
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const paceValues = run.paceData.map((p) => p.paceSeconds);
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, paceValues, C.orange, "Pace /km")}</g>`;
    }
    case "chart-heartrate": {
      if (!run.heartRateData || run.heartRateData.length < 2) return "";
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const hrSampled = sampleData(run.heartRateData.map((h) => h.value), 30);
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, hrSampled, C.red, "Heart Rate")}</g>`;
    }
    case "badge-difficulty": {
      const diff = run.difficulty || "moderate";
      const diffColors: Record<string, string> = {
        easy: C.green, moderate: C.yellow, challenging: C.orange, hard: C.orange, extreme: C.red,
      };
      const dc = diffColors[diff] || C.yellow;
      const bw = Math.round(170 * s);
      const bh = Math.round(48 * s);
      return `
        <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.bgCard}" stroke="${dc}" stroke-width="2" filter="url(#softShadow)"/>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 6}" font-family="${FONT}" font-size="${Math.round(16 * s)}" font-weight="700" fill="${dc}" text-anchor="middle" letter-spacing="2">${esc(diff.toUpperCase())}</text>
      `;
    }
    case "badge-weather": {
      if (!run.weatherData?.temperature) return "";
      const bw = Math.round(190 * s);
      const bh = Math.round(48 * s);
      const weatherText = `${Math.round(run.weatherData.temperature)}°C ${run.weatherData.conditions || ""}`.trim();
      return `
        <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.bgCard}" stroke="${C.border}" stroke-width="1.5" filter="url(#softShadow)"/>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 6}" font-family="${FONT}" font-size="${Math.round(14 * s)}" font-weight="600" fill="${C.textMid}" text-anchor="middle">${esc(weatherText)}</text>
      `;
    }
    default:
      return "";
  }

  return `
    <rect x="${px}" y="${py}" width="${sw}" height="${sh}" rx="${rx}" fill="${C.bgCard}" filter="url(#softShadow)"/>
    <rect x="${px}" y="${py}" width="${sw}" height="${sh}" rx="${rx}" fill="none" stroke="${C.border}" stroke-width="1"/>
    <line x1="${px + 16}" y1="${py + 3}" x2="${px + sw - 16}" y2="${py + 3}" stroke="${color}" stroke-width="2" opacity="0.3" stroke-linecap="round"/>
    <text x="${px + sw / 2}" y="${py + labelSize + 10}" font-family="${FONT}" font-size="${labelSize}" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">${label}</text>
    <text x="${px + sw / 2}" y="${py + sh / 2 + fontSize * 0.35}" font-family="${FONT}" font-size="${fontSize}" font-weight="800" fill="${color}" text-anchor="middle">${esc(value)}</text>
    ${unit ? `<text x="${px + sw / 2}" y="${py + sh - Math.round(10 * s)}" font-family="${FONT}" font-size="${labelSize}" font-weight="500" fill="${C.textMuted}" text-anchor="middle">${esc(unit)}</text>` : ""}
  `;
}

async function getLogoBuffer(): Promise<Buffer | null> {
  try {
    const logoPath = path.resolve("server/assets/logo.png");
    return await sharp(logoPath).resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  } catch (e: any) {
    try {
      const altPath = path.resolve("attached_assets/logo_1772693744611.png");
      return await sharp(altPath).resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    } catch {
      console.error("Logo not found:", e.message);
      return null;
    }
  }
}

export async function generateShareImage(req: GenerateImageRequest): Promise<Buffer> {
  const template = TEMPLATES.find((t) => t.id === req.templateId);
  if (!template) throw new Error(`Template not found: ${req.templateId}`);

  const dims = ASPECT_DIMENSIONS[req.aspectRatio] || ASPECT_DIMENSIONS["1:1"];
  const { width: w, height: h } = dims;

  let svgContent: string;

  switch (template.id) {
    case "stats-grid":
      svgContent = buildStatsGridSvg(w, h, req.runData, req.userName);
      break;
    case "route-map":
      svgContent = buildRouteMapSvg(w, h, req.runData, req.userName);
      break;
    case "split-summary":
      svgContent = buildSplitSummarySvg(w, h, req.runData, req.userName);
      break;
    case "achievement":
      svgContent = buildAchievementSvg(w, h, req.runData, req.userName);
      break;
    case "minimal-dark":
      svgContent = buildMinimalSvg(w, h, req.runData, req.userName);
      break;
    default:
      svgContent = buildStatsGridSvg(w, h, req.runData, req.userName);
  }

  let stickersSvg = "";
  if (req.stickers && req.stickers.length > 0) {
    stickersSvg = req.stickers.map((s) => buildStickerSvg(s, req.runData, w, h)).join("\n");
  }

  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${svgContent}
    ${stickersSvg}
  </svg>`;

  let svgBuffer = await sharp(Buffer.from(fullSvg)).png({ quality: 95 }).toBuffer();

  if (template.id === "route-map" && req.runData.gpsTrack && req.runData.gpsTrack.length > 1) {
    const mapRegionH = getRouteMapHeight(w, h);
    const mapTileBuffer = await fetchMapTileWithRoute(req.runData.gpsTrack, w, mapRegionH, req.runData.paceData);
    if (mapTileBuffer) {
      const overlaySvg = buildRouteMapSvg(w, h, req.runData, req.userName, true);
      const overlaySvgFull = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${overlaySvg}${stickersSvg}</svg>`;
      const overlayBuffer = await sharp(Buffer.from(overlaySvgFull)).png().toBuffer();

      const mapResized = await sharp(mapTileBuffer).resize(w, mapRegionH, { fit: "cover" }).toBuffer();

      svgBuffer = await sharp({
        create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } }
      })
        .composite([
          { input: mapResized, top: 0, left: 0 },
          { input: overlayBuffer, top: 0, left: 0 },
        ])
        .png({ quality: 95 })
        .toBuffer();
    }
  }

  const logoBuffer = await getLogoBuffer();
  if (logoBuffer) {
    const logoY = h - LOGO_ZONE_H + 11;
    const logoX = 24;

    const brandSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect x="0" y="${h - LOGO_ZONE_H}" width="${w}" height="${LOGO_ZONE_H}" fill="${C.bg}"/>
      <line x1="40" y1="${h - LOGO_ZONE_H}" x2="${w - 40}" y2="${h - LOGO_ZONE_H}" stroke="${C.border}" stroke-width="1" opacity="0.5"/>
      <text x="${logoX + 58}" y="${logoY + 20}" font-family="${FONT}" font-size="18" font-weight="800" fill="${C.textDark}" letter-spacing="0.5">AI Run Coach</text>
      <text x="${logoX + 58}" y="${logoY + 36}" font-family="${FONT}" font-size="11" font-weight="500" fill="${C.textMuted}" letter-spacing="1">Your AI-Powered Running Partner</text>
    </svg>`;

    const brandBuffer = await sharp(Buffer.from(brandSvg)).png().toBuffer();

    svgBuffer = await sharp(svgBuffer)
      .composite([
        { input: brandBuffer, top: 0, left: 0 },
        { input: logoBuffer, top: logoY, left: logoX },
      ])
      .png({ quality: 95 })
      .toBuffer();
  }

  return svgBuffer;
}

async function fetchMapTileWithRoute(
  gpsTrack: Array<{ lat: number; lng: number }>,
  tileW: number, tileH: number,
  paceData?: Array<{ km: number; pace: string; paceSeconds: number }>
): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const reqW = Math.min(Math.round(tileW / 2), 640);
  const reqH = Math.min(Math.round(tileH / 2), 640);

  const lightStyle = [
    "style=feature:poi|visibility:off",
    "style=feature:transit|visibility:off",
    "style=feature:road|element:labels|visibility:simplified",
    "style=feature:administrative|element:labels|visibility:simplified",
    "style=feature:water|element:geometry|color:0xc8e6f5",
    "style=feature:landscape.natural|element:geometry|color:0xeef3e8",
    "style=feature:road|element:geometry|color:0xffffff",
    "style=feature:road.highway|element:geometry|color:0xf0f0f0",
    "style=feature:road|element:geometry.stroke|color:0xe2e8f0",
  ].join("&");

  const sampleCount = Math.min(gpsTrack.length, 80);
  const step = gpsTrack.length / sampleCount;
  const sampled = [];
  for (let i = 0; i < sampleCount; i++) {
    const pt = gpsTrack[Math.floor(i * step)];
    sampled.push(`${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}`);
  }
  const last = gpsTrack[gpsTrack.length - 1];
  sampled.push(`${last.lat.toFixed(5)},${last.lng.toFixed(5)}`);

  const pathParam = `path=color:0x00D4FFCC|weight:5|${sampled.join("|")}`;

  const startPt = gpsTrack[0];
  const endPt = gpsTrack[gpsTrack.length - 1];
  const markers = [
    `markers=color:0x00E676|size:small|label:S|${startPt.lat.toFixed(5)},${startPt.lng.toFixed(5)}`,
    `markers=color:0xFF5252|size:small|label:F|${endPt.lat.toFixed(5)},${endPt.lng.toFixed(5)}`,
  ].join("&");

  const url = `https://maps.googleapis.com/maps/api/staticmap?size=${reqW}x${reqH}&scale=2&maptype=roadmap&${lightStyle}&${pathParam}&${markers}&key=${apiKey}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("Map tile fetch failed:", resp.status, resp.statusText, body.substring(0, 200));
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    return buf;
  } catch (err: any) {
    console.error("Map tile fetch error:", err.message);
    return null;
  }
}
