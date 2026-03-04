import sharp from "sharp";

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
  cyan: "#00D4FF",
  cyanDark: "#00A3CC",
  cyanLight: "#33DFFF",
  orange: "#FF6B35",
  orangeLight: "#FF8F66",
  green: "#00E676",
  greenDark: "#00C853",
  red: "#FF5252",
  redLight: "#FF8A80",
  gold: "#FFD700",
  goldLight: "#FFE44D",
  yellow: "#FFB300",
  white: "#FFFFFF",
  offWhite: "#F8F9FA",
  bg: "#FFFFFF",
  cardBg: "rgba(255,255,255,0.85)",
  cardBorder: "rgba(0,0,0,0.06)",
  textPrimary: "#1A1A2E",
  textSecondary: "#4A5568",
  textMuted: "#A0AEC0",
  subtle: "#E2E8F0",
  frost: "rgba(255,255,255,0.7)",
};

const QUOTES = [
  "Every step is progress.",
  "Run the mile you're in.",
  "Strong legs, stronger mind.",
  "The road doesn't judge.",
  "One run closer to the goal.",
  "Earned, not given.",
  "Trust the process.",
  "Your only limit is you.",
];

export const TEMPLATES: ShareTemplate[] = [
  {
    id: "stats-grid",
    name: "Stats Grid",
    description: "Clean grid showing your key run metrics",
    category: "stats",
    preview: "grid",
    aspectRatios: ["1:1", "9:16", "4:5"],
  },
  {
    id: "route-map",
    name: "Route Map",
    description: "Your GPS route with stats overlay",
    category: "map",
    preview: "map",
    aspectRatios: ["1:1", "9:16", "4:5"],
  },
  {
    id: "split-summary",
    name: "Split Summary",
    description: "Km splits with pace visualization",
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
    description: "Single big stat with gradient background",
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
  if (seconds > 86400) seconds = Math.round(seconds / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatDateShort(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function distKm(d: number): string {
  if (d > 100) return (d / 1000).toFixed(2);
  return d.toFixed(2);
}

function pickQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function commonDefs(w: number, h: number): string {
  return `
    <filter id="frost" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.04  0 1 0 0 0.04  0 0 1 0 0.04  0 0 0 0.75 0" result="tint"/>
      <feComposite in="SourceGraphic" in2="tint" operator="over"/>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="blur"/>
      <feFlood flood-color="${C.cyan}" flood-opacity="0.35" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowOrange" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="blur"/>
      <feFlood flood-color="${C.orange}" flood-opacity="0.3" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="rgba(0,0,0,0.08)"/>
    </filter>
    <filter id="bigGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="30" result="blur"/>
      <feFlood flood-color="${C.cyan}" flood-opacity="0.2" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="cyanGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.cyan}"/>
      <stop offset="100%" stop-color="#0088FF"/>
    </linearGradient>
    <linearGradient id="orangeGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.orange}"/>
      <stop offset="100%" stop-color="#FF4500"/>
    </linearGradient>
    <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${C.cyan}"/>
      <stop offset="50%" stop-color="${C.cyanLight}"/>
      <stop offset="100%" stop-color="${C.green}"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.gold}"/>
      <stop offset="100%" stop-color="#FFA000"/>
    </linearGradient>
    <linearGradient id="topAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${C.cyan}"/>
      <stop offset="100%" stop-color="${C.orange}"/>
    </linearGradient>
    <clipPath id="roundCard"><rect x="0" y="0" width="${w}" height="${h}" rx="0"/></clipPath>
  `;
}

function buildWatermark(w: number, h: number): string {
  const y = h - 52;
  return `
    <rect x="0" y="${y}" width="${w}" height="52" fill="${C.bg}" opacity="0.95"/>
    <line x1="${w * 0.2}" y1="${y}" x2="${w * 0.8}" y2="${y}" stroke="url(#topAccent)" stroke-width="1.5" opacity="0.4"/>
    <text x="${w / 2}" y="${y + 32}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="15" font-weight="700" fill="${C.textMuted}" text-anchor="middle" letter-spacing="4">AI RUN COACH</text>
  `;
}

function buildTopBar(w: number): string {
  return `<rect x="0" y="0" width="${w}" height="5" fill="url(#topAccent)"/>`;
}

function premiumStatCard(x: number, y: number, w: number, h: number, label: string, value: string, unit: string, color: string, iconSvg?: string): string {
  const iconContent = iconSvg || "";
  return `
    <g filter="url(#softShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${C.white}" stroke="${C.subtle}" stroke-width="1"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${color}" opacity="0.04"/>
      <rect x="${x + 16}" y="${y + h - 6}" width="${w - 32}" height="4" rx="2" fill="${color}" opacity="0.15"/>
    </g>
    ${iconContent}
    <text x="${x + w / 2}" y="${y + 26}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="2">${esc(label.toUpperCase())}</text>
    <text x="${x + w / 2}" y="${y + h / 2 + 16}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="40" font-weight="800" fill="${C.textPrimary}" text-anchor="middle" filter="url(#glow)" style="paint-order: stroke">${esc(value)}</text>
    ${unit ? `<text x="${x + w / 2}" y="${y + h - 18}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="12" font-weight="500" fill="${color}" text-anchor="middle" letter-spacing="1">${esc(unit.toUpperCase())}</text>` : ""}
  `;
}

function buildSparkline(x: number, y: number, w: number, h: number, data: number[], color: string, gradId: string): string {
  if (!data || data.length < 2) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);

  const points = data.map((v, i) => {
    const px = x + i * stepX;
    const py = y + h - ((v - min) / range) * h;
    return `${px},${py}`;
  }).join(" ");

  const areaPoints = `${x},${y + h} ${points} ${x + w},${y + h}`;

  return `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <polygon points="${areaPoints}" fill="url(#${gradId})"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function buildPremiumChart(x: number, y: number, w: number, h: number, data: number[], color: string, label: string, gradId: string): string {
  if (!data || data.length < 2) return "";
  const chartH = h - 36;
  const chartY = y + 28;
  return `
    <text x="${x}" y="${y + 14}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}" letter-spacing="1.5">${esc(label.toUpperCase())}</text>
    <g opacity="0.9">
      ${buildSparkline(x, chartY, w, chartH, data, color, gradId)}
    </g>
  `;
}

function buildGpsRoute(x: number, y: number, w: number, h: number, track: Array<{ lat: number; lng: number }>, thick?: boolean): string {
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

  const points = track.map((p) => {
    const px = offsetX + (p.lng - minLng) * scale;
    const py = offsetY + (maxLat - p.lat) * scale;
    return `${px},${py}`;
  }).join(" ");

  const startPt = track[0];
  const endPt = track[track.length - 1];
  const sx = offsetX + (startPt.lng - minLng) * scale;
  const sy = offsetY + (maxLat - startPt.lat) * scale;
  const ex = offsetX + (endPt.lng - minLng) * scale;
  const ey = offsetY + (maxLat - endPt.lat) * scale;
  const sw = thick ? 6 : 4;

  return `
    <defs>
      <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
        <feFlood flood-color="${C.cyan}" flood-opacity="0.5" result="color"/>
        <feComposite in="color" in2="blur" operator="in" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <polyline points="${points}" fill="none" stroke="${C.cyan}" stroke-width="${sw + 8}" stroke-linecap="round" stroke-linejoin="round" opacity="0.12"/>
    <polyline points="${points}" fill="none" stroke="url(#routeGrad)" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" filter="url(#routeGlow)"/>
    <circle cx="${sx}" cy="${sy}" r="11" fill="${C.green}" stroke="${C.white}" stroke-width="3"/>
    <circle cx="${ex}" cy="${ey}" r="10" fill="${C.red}" stroke="${C.white}" stroke-width="3"/>
  `;
}

function buildMapBackground(w: number, h: number, mapH: number): string {
  let grid = "";
  const gridColor = "rgba(0,40,80,0.06)";
  const spacing = 60;
  for (let gx = 0; gx <= w; gx += spacing) {
    grid += `<line x1="${gx}" y1="0" x2="${gx}" y2="${mapH}" stroke="${gridColor}" stroke-width="0.5"/>`;
  }
  for (let gy = 0; gy <= mapH; gy += spacing) {
    grid += `<line x1="0" y1="${gy}" x2="${w}" y2="${gy}" stroke="${gridColor}" stroke-width="0.5"/>`;
  }

  const cx1 = w * 0.3, cy1 = mapH * 0.4, cx2 = w * 0.7, cy2 = mapH * 0.6;
  return `
    <rect x="0" y="0" width="${w}" height="${mapH}" fill="#F0F4F8"/>
    <defs>
      <radialGradient id="mapGlow1" cx="${cx1 / w}" cy="${cy1 / mapH}" r="0.4">
        <stop offset="0%" stop-color="${C.cyan}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${C.cyan}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="mapGlow2" cx="${cx2 / w}" cy="${cy2 / mapH}" r="0.35">
        <stop offset="0%" stop-color="${C.green}" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="${C.green}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${mapH}" fill="url(#mapGlow1)"/>
    <rect x="0" y="0" width="${w}" height="${mapH}" fill="url(#mapGlow2)"/>
    ${grid}
    <rect x="${w * 0.12}" y="${mapH * 0.25}" width="${w * 0.18}" height="${mapH * 0.3}" rx="4" fill="rgba(0,60,120,0.03)" stroke="rgba(0,60,120,0.05)" stroke-width="0.5"/>
    <rect x="${w * 0.55}" y="${mapH * 0.15}" width="${w * 0.25}" height="${mapH * 0.22}" rx="4" fill="rgba(0,60,120,0.03)" stroke="rgba(0,60,120,0.05)" stroke-width="0.5"/>
    <rect x="${w * 0.4}" y="${mapH * 0.55}" width="${w * 0.15}" height="${mapH * 0.25}" rx="4" fill="rgba(0,60,120,0.03)" stroke="rgba(0,60,120,0.05)" stroke-width="0.5"/>
    <line x1="${w * 0.08}" y1="${mapH * 0.2}" x2="${w * 0.92}" y2="${mapH * 0.2}" stroke="rgba(0,40,80,0.04)" stroke-width="2"/>
    <line x1="${w * 0.1}" y1="${mapH * 0.5}" x2="${w * 0.9}" y2="${mapH * 0.5}" stroke="rgba(0,40,80,0.04)" stroke-width="2"/>
    <line x1="${w * 0.35}" y1="${mapH * 0.05}" x2="${w * 0.35}" y2="${mapH * 0.95}" stroke="rgba(0,40,80,0.04)" stroke-width="2"/>
    <line x1="${w * 0.65}" y1="${mapH * 0.1}" x2="${w * 0.65}" y2="${mapH * 0.9}" stroke="rgba(0,40,80,0.04)" stroke-width="2"/>
  `;
}

function buildConfetti(w: number, h: number, count: number): string {
  let svg = "";
  const colors = [C.cyan, C.orange, C.gold, C.green, C.red, C.cyanLight, C.orangeLight];
  for (let i = 0; i < count; i++) {
    const cx = Math.random() * w;
    const cy = Math.random() * h * 0.7 + h * 0.05;
    const size = 4 + Math.random() * 8;
    const color = colors[i % colors.length];
    const opacity = 0.15 + Math.random() * 0.35;
    const rot = Math.random() * 360;
    const shape = i % 3;
    if (shape === 0) {
      svg += `<rect x="${cx}" y="${cy}" width="${size}" height="${size * 0.4}" rx="1" fill="${color}" opacity="${opacity}" transform="rotate(${rot} ${cx + size / 2} ${cy + size * 0.2})"/>`;
    } else if (shape === 1) {
      svg += `<circle cx="${cx}" cy="${cy}" r="${size * 0.35}" fill="${color}" opacity="${opacity}"/>`;
    } else {
      svg += `<polygon points="${cx},${cy - size * 0.4} ${cx + size * 0.35},${cy + size * 0.3} ${cx - size * 0.35},${cy + size * 0.3}" fill="${color}" opacity="${opacity}" transform="rotate(${rot} ${cx} ${cy})"/>`;
    }
  }
  return svg;
}

function buildTrophy(cx: number, cy: number, size: number): string {
  const s = size / 100;
  return `
    <g transform="translate(${cx - 50 * s}, ${cy - 60 * s}) scale(${s})">
      <ellipse cx="50" cy="110" rx="30" ry="6" fill="${C.gold}" opacity="0.2"/>
      <rect x="35" y="95" width="30" height="20" rx="3" fill="url(#goldGrad)"/>
      <rect x="40" y="85" width="20" height="14" rx="2" fill="url(#goldGrad)"/>
      <path d="M15,10 Q15,0 25,0 L75,0 Q85,0 85,10 L85,35 Q85,65 50,80 Q15,65 15,35 Z" fill="url(#goldGrad)" stroke="${C.goldLight}" stroke-width="2"/>
      <path d="M25,10 L25,35 Q25,55 50,68 Q75,55 75,35 L75,10 Z" fill="${C.goldLight}" opacity="0.3"/>
      <path d="M10,15 Q0,15 0,25 L0,35 Q0,50 15,45" fill="url(#goldGrad)" opacity="0.8"/>
      <path d="M90,15 Q100,15 100,25 L100,35 Q100,50 85,45" fill="url(#goldGrad)" opacity="0.8"/>
      <text x="50" y="52" font-family="'SF Pro Display', Arial, sans-serif" font-size="28" font-weight="800" fill="${C.white}" text-anchor="middle">&#9733;</text>
    </g>
  `;
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

function buildStickerSvg(sticker: PlacedSticker, run: RunDataForImage, canvasW: number, canvasH: number): string {
  const px = Math.round(sticker.x * canvasW);
  const py = Math.round(sticker.y * canvasH);
  const s = sticker.scale || 1;
  const sw = Math.round(200 * s);
  const sh = Math.round(100 * s);
  const fontSize = Math.round(28 * s);
  const labelSize = Math.round(12 * s);

  let value = "";
  let unit = "";
  let label = "";
  let color = C.cyan;

  switch (sticker.widgetId) {
    case "stat-distance":
      value = distKm(run.distance || 0);
      unit = "km"; label = "DISTANCE"; color = C.cyan; break;
    case "stat-duration":
      value = formatDuration(run.duration || 0);
      unit = ""; label = "DURATION"; color = C.cyan; break;
    case "stat-pace":
      value = run.avgPace || "--:--";
      unit = "/km"; label = "AVG PACE"; color = C.orange; break;
    case "stat-heartrate":
      value = run.avgHeartRate?.toString() || "--";
      unit = "bpm"; label = "AVG HR"; color = C.red; break;
    case "stat-calories":
      value = run.calories?.toString() || "--";
      unit = "kcal"; label = "CALORIES"; color = C.yellow; break;
    case "stat-elevation":
      value = Math.round(run.elevationGain || run.elevation || 0).toString();
      unit = "m"; label = "ELEVATION"; color = C.green; break;
    case "stat-cadence":
      value = run.cadence?.toString() || "--";
      unit = "spm"; label = "CADENCE"; color = C.cyan; break;
    case "stat-maxhr":
      value = run.maxHeartRate?.toString() || "--";
      unit = "bpm"; label = "MAX HR"; color = C.red; break;
    case "chart-elevation": {
      if (!run.paceData || run.paceData.length < 2) return "";
      const cw = Math.round(280 * s), ch = Math.round(140 * s);
      const uid = `elev_${px}_${py}`;
      const elevData = run.paceData.map((_, i) => {
        const gps = run.gpsTrack;
        if (gps && gps.length > i) {
          const pt = gps[Math.floor((i / run.paceData!.length) * gps.length)] as any;
          return pt?.elevation || 0;
        }
        return 0;
      });
      return `<g transform="translate(${px},${py})">${buildPremiumChart(0, 0, cw, ch, elevData, C.green, "Elevation", uid)}</g>`;
    }
    case "chart-pace": {
      if (!run.paceData || run.paceData.length < 2) return "";
      const cw = Math.round(280 * s), ch = Math.round(140 * s);
      const uid = `pace_${px}_${py}`;
      return `<g transform="translate(${px},${py})">${buildPremiumChart(0, 0, cw, ch, run.paceData.map(p => p.paceSeconds), C.orange, "Pace /km", uid)}</g>`;
    }
    case "chart-heartrate": {
      if (!run.heartRateData || run.heartRateData.length < 2) return "";
      const cw = Math.round(280 * s), ch = Math.round(140 * s);
      const uid = `hr_${px}_${py}`;
      const hrSampled = sampleData(run.heartRateData.map(h => h.value), 30);
      return `<g transform="translate(${px},${py})">${buildPremiumChart(0, 0, cw, ch, hrSampled, C.red, "Heart Rate", uid)}</g>`;
    }
    case "badge-difficulty": {
      const diff = run.difficulty || "moderate";
      const dc: Record<string, string> = { easy: C.green, moderate: C.yellow, challenging: C.orange, hard: C.orange, extreme: C.red };
      const col = dc[diff] || C.yellow;
      const bw = Math.round(160 * s), bh = Math.round(44 * s);
      return `
        <g filter="url(#softShadow)">
          <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.white}" stroke="${col}" stroke-width="2"/>
        </g>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 5}" font-family="'SF Pro Display', Arial, sans-serif" font-size="${Math.round(14 * s)}" font-weight="700" fill="${col}" text-anchor="middle" letter-spacing="1">${esc(diff.toUpperCase())}</text>
      `;
    }
    case "badge-weather": {
      if (!run.weatherData?.temperature) return "";
      const bw = Math.round(180 * s), bh = Math.round(44 * s);
      const wt = `${Math.round(run.weatherData.temperature)}°C ${run.weatherData.conditions || ""}`.trim();
      return `
        <g filter="url(#softShadow)">
          <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.white}" stroke="${C.subtle}" stroke-width="1"/>
        </g>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 5}" font-family="'SF Pro Display', Arial, sans-serif" font-size="${Math.round(13 * s)}" font-weight="500" fill="${C.textSecondary}" text-anchor="middle">${esc(wt)}</text>
      `;
    }
    default:
      return "";
  }

  return premiumStatCard(px, py, sw, sh, label, value, unit, color);
}

function buildStatsGridSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const isVertical = h > w;
  const pad = 40;
  const headerY = isVertical ? 80 : 60;
  const gap = 16;
  const cols = 2;
  const boxW = (w - pad * 2 - gap) / cols;
  const boxH = isVertical ? 130 : 120;
  const statsStartY = headerY + 140;

  const stats = [
    { label: "Distance", value: distKm(run.distance || 0), unit: "km", color: C.cyan },
    { label: "Duration", value: formatDuration(run.duration || 0), unit: "", color: C.cyan },
    { label: "Avg Pace", value: run.avgPace || "--:--", unit: "/km", color: C.orange },
    { label: "Heart Rate", value: run.avgHeartRate?.toString() || "--", unit: "bpm", color: C.red },
    { label: "Calories", value: run.calories?.toString() || "--", unit: "kcal", color: C.yellow },
    { label: "Elevation", value: Math.round(run.elevationGain || run.elevation || 0).toString(), unit: "m", color: C.green },
  ];

  if (run.cadence) {
    stats.push({ label: "Cadence", value: run.cadence.toString(), unit: "spm", color: C.cyan });
  }
  if (run.maxHeartRate) {
    stats.push({ label: "Max HR", value: run.maxHeartRate.toString(), unit: "bpm", color: C.red });
  }

  let boxes = "";
  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = pad + col * (boxW + gap);
    const by = statsStartY + row * (boxH + gap);
    if (by + boxH < h - 120) {
      boxes += premiumStatCard(bx, by, boxW, boxH, s.label, s.value, s.unit, s.color);
    }
  });

  const gridBottom = statsStartY + Math.ceil(stats.length / cols) * (boxH + gap);
  const remainingSpace = h - 52 - gridBottom;
  let fillerContent = "";

  if (remainingSpace > 140) {
    const paceData = run.paceData;
    const hrData = run.heartRateData;
    if (paceData && paceData.length >= 2) {
      const chartY = gridBottom + 10;
      const chartH = Math.min(remainingSpace - 60, 120);
      fillerContent = `
        <text x="${pad}" y="${chartY + 12}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}" letter-spacing="1.5">PACE CHART</text>
        ${buildSparkline(pad, chartY + 22, w - pad * 2, chartH - 30, paceData.map(p => p.paceSeconds), C.orange, "statsGridPaceGrad")}
      `;
    } else if (hrData && hrData.length >= 2) {
      const chartY = gridBottom + 10;
      const chartH = Math.min(remainingSpace - 60, 120);
      const sampled = sampleData(hrData.map(h => h.value), 40);
      fillerContent = `
        <text x="${pad}" y="${chartY + 12}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}" letter-spacing="1.5">HEART RATE</text>
        ${buildSparkline(pad, chartY + 22, w - pad * 2, chartH - 30, sampled, C.red, "statsGridHrGrad")}
      `;
    } else {
      const qy = gridBottom + remainingSpace / 2;
      const quote = pickQuote();
      fillerContent = `
        <line x1="${w * 0.25}" y1="${qy - 20}" x2="${w * 0.75}" y2="${qy - 20}" stroke="${C.subtle}" stroke-width="1"/>
        <text x="${w / 2}" y="${qy + 8}" font-family="'Georgia', 'Times New Roman', serif" font-size="18" font-style="italic" fill="${C.textMuted}" text-anchor="middle">"${esc(quote)}"</text>
        <line x1="${w * 0.25}" y1="${qy + 30}" x2="${w * 0.75}" y2="${qy + 30}" stroke="${C.subtle}" stroke-width="1"/>
      `;
    }
  }

  return `
    <defs>${commonDefs(w, h)}</defs>
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${buildTopBar(w)}
    <text x="${w / 2}" y="${headerY + 10}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="13" font-weight="500" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">${esc(formatDate(run.completedAt).toUpperCase())}</text>
    <text x="${w / 2}" y="${headerY + 70}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="64" font-weight="800" fill="${C.textPrimary}" text-anchor="middle" filter="url(#bigGlow)">${esc(distKm(run.distance || 0))}</text>
    <text x="${w / 2}" y="${headerY + 100}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="16" font-weight="600" fill="${C.cyan}" text-anchor="middle" letter-spacing="4">KILOMETERS</text>
    ${userName ? `<text x="${w / 2}" y="${headerY + 125}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="13" font-weight="500" fill="${C.textMuted}" text-anchor="middle">${esc(userName)}</text>` : ""}
    ${boxes}
    ${fillerContent}
    ${buildWatermark(w, h)}
  `;
}

function buildRouteMapSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const mapH = h > w ? h * 0.58 : h * 0.55;
  const statsY = mapH + 20;
  const gap = 14;
  const statW = (w - gap * 4) / 3;
  const statH = 100;

  const mapBg = buildMapBackground(w, h, mapH);

  const routeSvg = run.gpsTrack && run.gpsTrack.length > 1
    ? buildGpsRoute(20, 20, w - 40, mapH - 40, run.gpsTrack, true)
    : `<text x="${w / 2}" y="${mapH / 2}" font-family="'SF Pro Display', Arial, sans-serif" font-size="18" fill="${C.textMuted}" text-anchor="middle">No GPS data</text>`;

  const stats = [
    { label: "Distance", value: distKm(run.distance || 0), unit: "km", color: C.cyan },
    { label: "Pace", value: run.avgPace || "--:--", unit: "/km", color: C.orange },
    { label: "Time", value: formatDuration(run.duration || 0), unit: "", color: C.cyan },
  ];

  let statBoxes = "";
  stats.forEach((s, i) => {
    const sx = gap + i * (statW + gap);
    statBoxes += premiumStatCard(sx, statsY, statW, statH, s.label, s.value, s.unit, s.color);
  });

  const extraY = statsY + statH + 20;
  let extraStats = "";
  const extras = [];
  if (run.elevationGain) extras.push({ l: "Elev Gain", v: `${Math.round(run.elevationGain)}m`, c: C.green });
  if (run.calories) extras.push({ l: "Calories", v: `${run.calories}`, c: C.yellow });
  if (run.avgHeartRate) extras.push({ l: "Avg HR", v: `${run.avgHeartRate} bpm`, c: C.red });

  if (extras.length > 0 && extraY + 30 < h - 60) {
    const spacing = w / (extras.length + 1);
    extras.forEach((e, i) => {
      const ex = spacing * (i + 1);
      extraStats += `
        <text x="${ex}" y="${extraY}" font-family="'SF Pro Display', Arial, sans-serif" font-size="10" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">${esc(e.l.toUpperCase())}</text>
        <text x="${ex}" y="${extraY + 22}" font-family="'SF Pro Display', Arial, sans-serif" font-size="16" font-weight="700" fill="${e.c}" text-anchor="middle">${esc(e.v)}</text>
      `;
    });
  }

  return `
    <defs>${commonDefs(w, h)}</defs>
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${buildTopBar(w)}
    ${mapBg}
    ${routeSvg}
    <rect x="0" y="${mapH - 40}" width="${w}" height="40" fill="url(#mapFade)"/>
    <defs><linearGradient id="mapFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C.bg}" stop-opacity="0"/><stop offset="100%" stop-color="${C.bg}"/></linearGradient></defs>
    ${statBoxes}
    ${extraStats}
    ${userName ? `<text x="${w / 2}" y="${h - 65}" font-family="'SF Pro Display', Arial, sans-serif" font-size="13" font-weight="500" fill="${C.textMuted}" text-anchor="middle">${esc(userName)} · ${esc(formatDate(run.completedAt))}</text>` : `<text x="${w / 2}" y="${h - 65}" font-family="'SF Pro Display', Arial, sans-serif" font-size="13" font-weight="500" fill="${C.textMuted}" text-anchor="middle">${esc(formatDate(run.completedAt))}</text>`}
    ${buildWatermark(w, h)}
  `;
}

function buildSplitSummarySvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const pad = 40;
  const headerY = 70;
  const splitsStartY = headerY + 110;
  const rowH = 56;
  const paceData = run.paceData || [];
  const maxSplits = Math.min(paceData.length, Math.floor((h - splitsStartY - 140) / rowH));

  let splitRows = "";

  if (paceData.length === 0) {
    splitRows = `<text x="${w / 2}" y="${splitsStartY + 60}" font-family="'SF Pro Display', Arial, sans-serif" font-size="16" fill="${C.textMuted}" text-anchor="middle">No split data available</text>`;
  }

  const paceValues = paceData.map(p => p.paceSeconds);
  const minPace = paceValues.length > 0 ? Math.min(...paceValues) : 0;
  const maxPace = paceValues.length > 0 ? Math.max(...paceValues) : 1;
  const paceRange = maxPace - minPace || 1;

  for (let i = 0; i < maxSplits; i++) {
    const split = paceData[i];
    const ry = splitsStartY + i * rowH;
    const barMaxW = w * 0.42;
    const barFrac = 1 - (split.paceSeconds - minPace) / paceRange * 0.6;
    const barW = barMaxW * barFrac;
    const pct = (split.paceSeconds - minPace) / paceRange;
    const gradId = `splitGrad${i}`;

    let startColor = C.green;
    let endColor = C.green;
    if (pct <= 0.33) { startColor = C.green; endColor = C.greenDark; }
    else if (pct <= 0.66) { startColor = C.yellow; endColor = C.orange; }
    else { startColor = C.orange; endColor = C.red; }

    splitRows += `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${startColor}"/>
          <stop offset="100%" stop-color="${endColor}"/>
        </linearGradient>
      </defs>
      <text x="${pad}" y="${ry + 32}" font-family="'SF Pro Display', Arial, sans-serif" font-size="15" font-weight="600" fill="${C.textSecondary}">KM ${split.km}</text>
      <rect x="${w * 0.22}" y="${ry + 12}" width="${barW}" height="30" rx="15" fill="url(#${gradId})" opacity="0.2"/>
      <rect x="${w * 0.22}" y="${ry + 14}" width="${barW * 0.85}" height="26" rx="13" fill="url(#${gradId})" opacity="0.5"/>
      <rect x="${w * 0.22}" y="${ry + 16}" width="${barW * 0.65}" height="22" rx="11" fill="url(#${gradId})" opacity="0.8"/>
      <text x="${w - pad}" y="${ry + 34}" font-family="'SF Pro Display', Arial, sans-serif" font-size="20" font-weight="700" fill="${startColor}" text-anchor="end">${esc(split.pace)}</text>
    `;

    if (i < maxSplits - 1) {
      splitRows += `<line x1="${pad}" y1="${ry + rowH}" x2="${w - pad}" y2="${ry + rowH}" stroke="${C.subtle}" stroke-width="0.5" opacity="0.6"/>`;
    }
  }

  const sparkY = splitsStartY + maxSplits * rowH + 20;
  let sparkline = "";
  if (paceValues.length >= 3 && sparkY + 80 < h - 100) {
    sparkline = `
      <text x="${pad}" y="${sparkY + 12}" font-family="'SF Pro Display', Arial, sans-serif" font-size="10" font-weight="600" fill="${C.textMuted}" letter-spacing="1.5">PACE TREND</text>
      ${buildSparkline(pad, sparkY + 20, w - pad * 2, 50, paceValues, C.orange, "splitSparkGrad")}
    `;
  }

  return `
    <defs>${commonDefs(w, h)}</defs>
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${buildTopBar(w)}
    <text x="${w / 2}" y="${headerY + 8}" font-family="'SF Pro Display', Arial, sans-serif" font-size="12" font-weight="500" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">${esc(formatDate(run.completedAt).toUpperCase())}</text>
    <text x="${w / 2}" y="${headerY + 55}" font-family="'SF Pro Display', Arial, sans-serif" font-size="44" font-weight="800" fill="${C.textPrimary}" text-anchor="middle">${esc(distKm(run.distance || 0))} km</text>
    <text x="${w / 2}" y="${headerY + 82}" font-family="'SF Pro Display', Arial, sans-serif" font-size="18" font-weight="500" fill="${C.orange}" text-anchor="middle">${esc(formatDuration(run.duration || 0))} · ${esc(run.avgPace || "--:--")} /km</text>
    <text x="${w / 2}" y="${headerY + 105}" font-family="'SF Pro Display', Arial, sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="3">KILOMETER SPLITS</text>
    ${splitRows}
    ${sparkline}
    ${userName ? `<text x="${w / 2}" y="${h - 65}" font-family="'SF Pro Display', Arial, sans-serif" font-size="13" font-weight="500" fill="${C.textMuted}" text-anchor="middle">${esc(userName)}</text>` : ""}
    ${buildWatermark(w, h)}
  `;
}

function buildAchievementSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const centerY = h * 0.42;
  const circleR = Math.min(w, h) * 0.2;

  const confetti = buildConfetti(w, h, 50);
  const trophy = buildTrophy(w / 2, centerY - circleR - 50, Math.min(w, h) * 0.35);

  const ringSegments = 60;
  let progressRing = "";
  for (let i = 0; i < ringSegments; i++) {
    const angle = (i / ringSegments) * 360 - 90;
    const rad = (angle * Math.PI) / 180;
    const x1 = w / 2 + Math.cos(rad) * circleR;
    const y1 = centerY + Math.sin(rad) * circleR;
    const x2 = w / 2 + Math.cos(rad) * (circleR + 6);
    const y2 = centerY + Math.sin(rad) * (circleR + 6);
    const opacity = 0.3 + (i / ringSegments) * 0.7;
    progressRing += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.cyan}" stroke-width="3" stroke-linecap="round" opacity="${opacity}"/>`;
  }

  const statY = centerY + circleR + 60;
  const statSpacing = w / 4;

  return `
    <defs>
      ${commonDefs(w, h)}
      <radialGradient id="achieveGlow" cx="50%" cy="40%" r="45%">
        <stop offset="0%" stop-color="${C.cyan}" stop-opacity="0.08"/>
        <stop offset="40%" stop-color="${C.gold}" stop-opacity="0.04"/>
        <stop offset="100%" stop-color="${C.cyan}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="innerGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${C.gold}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${C.gold}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${buildTopBar(w)}
    <rect width="${w}" height="${h}" fill="url(#achieveGlow)"/>
    ${confetti}

    ${trophy}

    ${userName ? `<text x="${w / 2}" y="${centerY - circleR - 30}" font-family="'SF Pro Display', Arial, sans-serif" font-size="18" font-weight="700" fill="${C.textPrimary}" text-anchor="middle">${esc(userName)}</text>` : ""}
    <text x="${w / 2}" y="${centerY - circleR - 10}" font-family="'SF Pro Display', Arial, sans-serif" font-size="12" font-weight="500" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">${esc(formatDate(run.completedAt).toUpperCase())}</text>

    <circle cx="${w / 2}" cy="${centerY}" r="${circleR + 20}" fill="url(#innerGlow)"/>
    ${progressRing}
    <circle cx="${w / 2}" cy="${centerY}" r="${circleR}" fill="none" stroke="${C.subtle}" stroke-width="1.5"/>

    <text x="${w / 2}" y="${centerY - 22}" font-family="'SF Pro Display', Arial, sans-serif" font-size="12" font-weight="600" fill="${C.gold}" text-anchor="middle" letter-spacing="3">RUN COMPLETE</text>
    <text x="${w / 2}" y="${centerY + 25}" font-family="'SF Pro Display', Arial, sans-serif" font-size="72" font-weight="800" fill="${C.textPrimary}" text-anchor="middle" filter="url(#bigGlow)">${esc(distKm(run.distance || 0))}</text>
    <text x="${w / 2}" y="${centerY + 55}" font-family="'SF Pro Display', Arial, sans-serif" font-size="18" font-weight="600" fill="${C.cyan}" text-anchor="middle" letter-spacing="5">KILOMETERS</text>

    <line x1="${w * 0.15}" y1="${statY - 15}" x2="${w * 0.85}" y2="${statY - 15}" stroke="${C.subtle}" stroke-width="1"/>

    <text x="${statSpacing}" y="${statY + 10}" font-family="'SF Pro Display', Arial, sans-serif" font-size="10" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">PACE</text>
    <text x="${statSpacing}" y="${statY + 38}" font-family="'SF Pro Display', Arial, sans-serif" font-size="28" font-weight="800" fill="${C.orange}" text-anchor="middle">${esc(run.avgPace || "--:--")}</text>
    <text x="${statSpacing}" y="${statY + 54}" font-family="'SF Pro Display', Arial, sans-serif" font-size="11" font-weight="500" fill="${C.textMuted}" text-anchor="middle">/km</text>

    <text x="${statSpacing * 2}" y="${statY + 10}" font-family="'SF Pro Display', Arial, sans-serif" font-size="10" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">TIME</text>
    <text x="${statSpacing * 2}" y="${statY + 38}" font-family="'SF Pro Display', Arial, sans-serif" font-size="28" font-weight="800" fill="${C.cyan}" text-anchor="middle">${esc(formatDuration(run.duration || 0))}</text>

    <text x="${statSpacing * 3}" y="${statY + 10}" font-family="'SF Pro Display', Arial, sans-serif" font-size="10" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">AVG HR</text>
    <text x="${statSpacing * 3}" y="${statY + 38}" font-family="'SF Pro Display', Arial, sans-serif" font-size="28" font-weight="800" fill="${C.red}" text-anchor="middle">${run.avgHeartRate || "--"}</text>
    <text x="${statSpacing * 3}" y="${statY + 54}" font-family="'SF Pro Display', Arial, sans-serif" font-size="11" font-weight="500" fill="${C.textMuted}" text-anchor="middle">bpm</text>

    ${run.calories ? `
      <line x1="${w * 0.15}" y1="${statY + 75}" x2="${w * 0.85}" y2="${statY + 75}" stroke="${C.subtle}" stroke-width="0.5"/>
      <text x="${w * 0.35}" y="${statY + 100}" font-family="'SF Pro Display', Arial, sans-serif" font-size="10" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">CALORIES</text>
      <text x="${w * 0.35}" y="${statY + 124}" font-family="'SF Pro Display', Arial, sans-serif" font-size="22" font-weight="700" fill="${C.yellow}" text-anchor="middle">${run.calories}</text>
      <text x="${w * 0.65}" y="${statY + 100}" font-family="'SF Pro Display', Arial, sans-serif" font-size="10" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">ELEVATION</text>
      <text x="${w * 0.65}" y="${statY + 124}" font-family="'SF Pro Display', Arial, sans-serif" font-size="22" font-weight="700" fill="${C.green}" text-anchor="middle">${Math.round(run.elevationGain || run.elevation || 0)}m</text>
    ` : ""}

    ${buildWatermark(w, h)}
  `;
}

function buildMinimalSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const centerY = h * 0.44;

  return `
    <defs>
      ${commonDefs(w, h)}
      <radialGradient id="minimalGlow" cx="50%" cy="44%" r="35%">
        <stop offset="0%" stop-color="${C.cyan}" stop-opacity="0.07"/>
        <stop offset="100%" stop-color="${C.cyan}" stop-opacity="0"/>
      </radialGradient>
      <filter id="numberShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur"/>
        <feFlood flood-color="${C.cyan}" flood-opacity="0.15" result="color"/>
        <feComposite in="color" in2="blur" operator="in" result="shadow"/>
        <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${buildTopBar(w)}
    <rect width="${w}" height="${h}" fill="url(#minimalGlow)"/>

    ${userName ? `<text x="${w / 2}" y="${centerY - 120}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="16" font-weight="600" fill="${C.textSecondary}" text-anchor="middle">${esc(userName)}</text>` : ""}
    <text x="${w / 2}" y="${centerY - 90}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="13" font-weight="500" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">${esc(formatDate(run.completedAt).toUpperCase())}</text>

    <line x1="${w * 0.2}" y1="${centerY - 70}" x2="${w * 0.8}" y2="${centerY - 70}" stroke="url(#topAccent)" stroke-width="1.5" opacity="0.3"/>

    <text x="${w / 2}" y="${centerY + 10}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="120" font-weight="800" fill="${C.textPrimary}" text-anchor="middle" filter="url(#numberShadow)">${esc(distKm(run.distance || 0))}</text>
    <text x="${w / 2}" y="${centerY + 55}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="700" fill="${C.cyan}" text-anchor="middle" letter-spacing="8">KILOMETERS</text>

    <line x1="${w * 0.2}" y1="${centerY + 80}" x2="${w * 0.8}" y2="${centerY + 80}" stroke="url(#topAccent)" stroke-width="1.5" opacity="0.3"/>

    <text x="${w * 0.33}" y="${centerY + 130}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">TIME</text>
    <text x="${w * 0.33}" y="${centerY + 158}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="700" fill="${C.textPrimary}" text-anchor="middle">${esc(formatDuration(run.duration || 0))}</text>

    <text x="${w * 0.66}" y="${centerY + 130}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">PACE</text>
    <text x="${w * 0.66}" y="${centerY + 158}" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="700" fill="${C.orange}" text-anchor="middle">${esc(run.avgPace || "--:--")} /km</text>

    ${run.avgHeartRate ? `
      <line x1="${w * 0.3}" y1="${centerY + 185}" x2="${w * 0.7}" y2="${centerY + 185}" stroke="${C.subtle}" stroke-width="0.5"/>
      <text x="${w / 2}" y="${centerY + 210}" font-family="'SF Pro Display', Arial, sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">HEART RATE</text>
      <text x="${w / 2}" y="${centerY + 238}" font-family="'SF Pro Display', Arial, sans-serif" font-size="22" font-weight="700" fill="${C.red}" text-anchor="middle">${run.avgHeartRate} bpm</text>
    ` : ""}

    ${buildWatermark(w, h)}
  `;
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

  return sharp(Buffer.from(fullSvg)).png({ quality: 95 }).toBuffer();
}
