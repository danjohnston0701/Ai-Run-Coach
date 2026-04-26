import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import { DateTime } from "luxon";

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
  customText?: string;
}

export interface CustomStickerData {
  imageBase64: string;
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

export interface GenerateImageRequest {
  templateId: string;
  aspectRatio: AspectRatio;
  stickers: PlacedSticker[];
  runData: RunDataForImage;
  userName?: string;
  customBackground?: string;
  backgroundOpacity?: number;
  backgroundBlur?: number;
  customStickers?: CustomStickerData[];
  ringLayout?: { topLeft?: string; topRight?: string; bottomLeft?: string; bottomRight?: string };
  customCaption?: string;
}

export interface RunDataForImage {
  distance: number;
  duration: number;
  avgPace?: string;
  avgHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  cadence?: number;
  totalSteps?: number;
  elevation?: number;
  elevationGain?: number;
  elevationLoss?: number;
  difficulty?: string;
  gpsTrack?: Array<{ lat: number; lng: number; elevation?: number; alt?: number; altitude?: number }>;
  heartRateData?: Array<{ timestamp: number; value: number }>;
  paceData?: Array<{ km: number; pace: string; paceSeconds: number }>;
  completedAt?: string;
  name?: string;
  weatherData?: { temperature?: number; conditions?: string };
  timezone?: string;
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

const LOGO_ZONE_H = 185;
const LOGO_GRADIENT_H = 90; // gradient bleed above the solid banner

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
    id: "run-metrics",
    name: "Run Metrics",
    description: "Clean photo overlay with distance, time and pace",
    category: "stats",
    preview: "metrics",
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

function formatDate(dateStr?: string, timezone?: string): string {
  const tz = timezone || "UTC";
  if (!dateStr) {
    return DateTime.now().setZone(tz).toFormat("EEE, MMM d, yyyy");
  }
  const dt = DateTime.fromISO(dateStr, { zone: "utc" }).setZone(tz);
  return dt.isValid ? dt.toFormat("EEE, MMM d, yyyy") : DateTime.now().setZone(tz).toFormat("EEE, MMM d, yyyy");
}

function formatTime(dateStr?: string, timezone?: string): string {
  if (!dateStr) return "";
  const tz = timezone || "UTC";
  const dt = DateTime.fromISO(dateStr, { zone: "utc" }).setZone(tz);
  return dt.isValid ? dt.toFormat("h:mm a") : "";
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
  gradId: string, progress: number,
  trackColorHex: string
): string {
  const strokeW = Math.round(r * 0.15);

  const labelFontSize = Math.min(Math.round(r * 0.19), 28);
  const valueFontSize = Math.min(Math.round(r * 0.40), 72);
  const unitFontSize  = Math.min(Math.round(r * 0.16), 22);

  // Three-line layout: label (top) → value (centre) → unit (below)
  const labelY = cy - r * 0.28;
  const valueY = cy + r * 0.13;
  const unitY  = cy + r * 0.38;

  const unitText = unit
    ? `<text x="${cx}" y="${unitY}" font-family="${FONT}" font-size="${unitFontSize}" font-weight="500" fill="${C.textMid}" text-anchor="middle" opacity="0.65">${esc(unit)}</text>`
    : "";

  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${gradId})" stroke-width="${strokeW}" filter="url(#ringGlow)"/>
    <text x="${cx}" y="${labelY}" font-family="${FONT}" font-size="${labelFontSize}" font-weight="700" fill="${C.textDark}" text-anchor="middle" letter-spacing="0.5">${esc(label)}</text>
    <text x="${cx}" y="${valueY}" font-family="${FONT}" font-size="${valueFontSize}" font-weight="800" fill="${C.textDark}" text-anchor="middle">${esc(value)}</text>
    ${unitText}
  `;
}

type RingMetricData = { label: string; unit: string; value: string; grad: string; prog: number; track: string };

function getMetricData(metric: string, run: RunDataForImage): RingMetricData {
  switch (metric) {
    case "distance": {
      const d = run.distance || 0;
      return { label: "Distance", unit: "km", value: run.distance?.toFixed(2) || "0", grad: "cyanRingGrad", prog: Math.min(0.3 + d / 10 * 0.6, 0.95), track: "#00E5FF" };
    }
    case "pace": {
      let p = 0.65;
      if (run.avgPace) { const s = paceToSeconds(run.avgPace); if (s > 0) p = Math.min(Math.max(0.35, 1 - (s - 180) / 480), 0.95); }
      return { label: "Pace", unit: "min/km", value: run.avgPace || "--:--", grad: "blueRingGrad", prog: p, track: "#42A5F5" };
    }
    case "duration": {
      const sec = run.duration || 0;
      return { label: "Duration", unit: "", value: formatDuration(sec), grad: "yellowRingGrad", prog: Math.min(0.3 + sec / 3600 * 0.6, 0.95), track: "#FFD600" };
    }
    case "heartRate": {
      const hr = run.avgHeartRate || 0;
      return { label: "Heart Rate", unit: "bpm", value: hr ? hr.toString() : "--", grad: "redRingGrad", prog: hr ? Math.min(0.3 + hr / 200 * 0.6, 0.95) : 0.5, track: "#FF5252" };
    }
    case "maxHeartRate": {
      const mhr = run.maxHeartRate || 0;
      return { label: "Max HR", unit: "bpm", value: mhr ? mhr.toString() : "--", grad: "redRingGrad", prog: mhr ? Math.min(0.3 + mhr / 220 * 0.6, 0.95) : 0.5, track: "#FF5252" };
    }
    case "calories": {
      const cal = run.calories || 0;
      return { label: "Calories", unit: "kcal", value: cal ? cal.toString() : "--", grad: "greenRingGrad", prog: cal ? Math.min(0.3 + cal / 600 * 0.6, 0.95) : 0.5, track: "#00E676" };
    }
    case "elevationGain": {
      const eg = run.elevationGain || 0;
      return { label: "Elev Gain", unit: "m", value: eg ? `${Math.round(eg)}` : "--", grad: "orangeRingGrad", prog: eg ? Math.min(0.3 + eg / 200 * 0.6, 0.95) : 0.5, track: "#FF6B35" };
    }
    case "elevationLoss": {
      const el = run.elevationLoss || 0;
      return { label: "Elev Loss", unit: "m", value: el ? `${Math.round(el)}` : "--", grad: "blueRingGrad", prog: el ? Math.min(0.3 + el / 200 * 0.6, 0.95) : 0.5, track: "#42A5F5" };
    }
    case "cadence": {
      const cad = run.cadence || 0;
      return { label: "Cadence", unit: "spm", value: cad ? cad.toString() : "--", grad: "greenRingGrad", prog: cad ? Math.min(0.3 + (cad - 140) / 50 * 0.6, 0.95) : 0.5, track: "#00E676" };
    }
    case "steps": {
      const steps = run.totalSteps || 0;
      return { label: "Steps", unit: "", value: steps ? steps.toLocaleString() : "--", grad: "cyanRingGrad", prog: steps ? Math.min(0.3 + steps / 10000 * 0.6, 0.95) : 0.5, track: "#00E5FF" };
    }
    default: {
      const d = run.distance || 0;
      return { label: "Distance", unit: "km", value: run.distance?.toFixed(2) || "0", grad: "cyanRingGrad", prog: Math.min(0.3 + d / 10 * 0.6, 0.95), track: "#00E5FF" };
    }
  }
}

function buildStatsGridSvg(
  w: number, h: number,
  run: RunDataForImage,
  userName?: string,
  ringLayout?: { topLeft?: string; topRight?: string; bottomLeft?: string; bottomRight?: string },
  customCaption?: string
): string {
  const cx = w / 2;
  const contentEndY = h - LOGO_ZONE_H;

  // ── Header ──────────────────────────────────────────────────────────
  const nameFontSize = 26;
  const metaFontSize = 22;
  let headerY = 56;
  let headerSvg = "";

  if (userName) {
    headerSvg += `<text x="${cx}" y="${headerY}" font-family="${FONT}" font-size="${nameFontSize}" font-weight="700" fill="${C.textDark}" text-anchor="middle">${esc(userName)}</text>`;
    headerY += nameFontSize + 8;
  }
  headerSvg += `<text x="${cx}" y="${headerY}" font-family="${FONT}" font-size="${metaFontSize}" font-weight="400" fill="${C.textDark}" text-anchor="middle" letter-spacing="0.3">${esc(formatDate(run.completedAt, run.timezone))}</text>`;
  headerY += metaFontSize + 6;
  const runTime = formatTime(run.completedAt, run.timezone);
  if (runTime) {
    headerSvg += `<text x="${cx}" y="${headerY}" font-family="${FONT}" font-size="${metaFontSize}" font-weight="400" fill="${C.textMid}" text-anchor="middle" letter-spacing="0.3">${esc(runTime)}</text>`;
    headerY += metaFontSize + 6;
  }
  headerSvg += `<line x1="${cx - 80}" y1="${headerY + 4}" x2="${cx + 80}" y2="${headerY + 4}" stroke="url(#fadeLine)" stroke-width="1.5"/>`;
  headerY += 18;

  // ── Ring sizing — fill the width, nearly touching ───────────────────
  // Layout constants
  const PAD_OUTSIDE = 22;   // from image edge to ring centre
  const GAP_H = 16;         // horizontal gap between the two rings (edge-to-edge)
  const GAP_V = 16;         // vertical gap between the two rows (edge-to-edge)
  const CAPTION_H = 130;    // height reserved for caption text below rings
  const CAPTION_GAP = 28;   // space between bottom ring edge and caption separator

  const ringAreaTop = headerY;
  const availableH = contentEndY - ringAreaTop;

  // Solve for r given two constraints:
  //   Width:  2*PAD_OUTSIDE + 4*r + GAP_H  ≤ w
  //   Height: 4*r + GAP_V + CAPTION_GAP + CAPTION_H ≤ availableH
  const rFromW = Math.floor((w - 2 * PAD_OUTSIDE - GAP_H) / 4);
  const rFromH = Math.floor((availableH - GAP_V - CAPTION_GAP - CAPTION_H) / 4);
  const ringR  = Math.max(40, Math.min(rFromW, rFromH));

  // Column centres (nearly touching the edges)
  const col1X = PAD_OUTSIDE + ringR;
  const col2X = w - PAD_OUTSIDE - ringR;

  // Vertically centre the ring block + caption in the available area
  const ringBlockH   = 4 * ringR + GAP_V;
  const totalBlockH  = ringBlockH + CAPTION_GAP + CAPTION_H;
  const topPad       = Math.max(ringR * 0.1, Math.floor((availableH - totalBlockH) / 2));

  const row1CY      = ringAreaTop + topPad + ringR;
  const row2CY      = row1CY + 2 * ringR + GAP_V;
  const captionAreaY = row2CY + ringR + CAPTION_GAP;

  // ── Four rings ───────────────────────────────────────────────────────
  const rings = [
    { cx: col1X, cy: row1CY, ...getMetricData(ringLayout?.topLeft     || "distance",      run) },
    { cx: col2X, cy: row1CY, ...getMetricData(ringLayout?.topRight    || "pace",           run) },
    { cx: col1X, cy: row2CY, ...getMetricData(ringLayout?.bottomLeft  || "duration",       run) },
    { cx: col2X, cy: row2CY, ...getMetricData(ringLayout?.bottomRight || "elevationGain",  run) },
  ];

  let ringSvg = "";
  rings.forEach(r => {
    ringSvg += metricRing(r.cx, r.cy, ringR, r.label, r.value, r.unit, r.grad, r.prog, r.track);
  });

  // ── Caption area ─────────────────────────────────────────────────────
  const captionFontSize = Math.min(Math.round(w * 0.030), 34);
  const captionText = (customCaption || "").trim();
  const captionLineY = captionAreaY + captionFontSize + 10;

  const captionSvg = `
    <line x1="${cx - 100}" y1="${captionAreaY}" x2="${cx + 100}" y2="${captionAreaY}" stroke="${C.border}" stroke-width="1.5" opacity="0.5"/>
    ${captionText
      ? `<text x="${cx}" y="${captionLineY}" font-family="${FONT}" font-size="${captionFontSize}" font-weight="500" fill="${C.textMid}" text-anchor="middle">${esc(captionText)}</text>`
      : `<text x="${cx}" y="${captionLineY}" font-family="${FONT}" font-size="${captionFontSize}" font-weight="400" fill="${C.textMuted}" text-anchor="middle" opacity="0.4">Add a caption...</text>`
    }
  `;

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    ${headerSvg}
    ${ringSvg}
    ${captionSvg}
  `;
}

function buildRunMetricsSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const isVertical = h > w;
  const pad = 48;
  const bottomY = h - LOGO_ZONE_H;

  const statsBlockH = isVertical ? 320 : 280;
  const statsTop = bottomY - statsBlockH;

  const gradientOverlay = `
    <defs>
      <linearGradient id="photoFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="40%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="70%" stop-color="#000000" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#photoFade)"/>
  `;

  let y = statsTop + 20;

  let nameSvg = "";
  if (userName) {
    nameSvg += `<text x="${pad}" y="${y}" font-family="${FONT}" font-size="20" font-weight="600" fill="#FFFFFF" opacity="0.85">${esc(userName)}</text>`;
    y += 28;
  }
  nameSvg += `<text x="${pad}" y="${y}" font-family="${FONT}" font-size="14" fill="#FFFFFF" opacity="0.55" letter-spacing="0.5">${esc(formatDate(run.completedAt, run.timezone))}</text>`;
  y += 36;

  const runName = run.name || "Run";
  nameSvg += `<text x="${pad}" y="${y}" font-family="${FONT}" font-size="28" font-weight="800" fill="#FFFFFF">${esc(runName)}</text>`;
  y += 46;

  const col1X = pad;
  const col2X = w * 0.5;

  const labelStyle = `font-family="${FONT}" font-size="15" font-weight="500" fill="#FFFFFF" opacity="0.6"`;
  const valueStyle = `font-family="${FONT}" font-size="38" font-weight="800" fill="#FFFFFF"`;
  const unitStyle = `font-family="${FONT}" font-size="20" font-weight="500" fill="#FFFFFF" opacity="0.7"`;

  const paceVal = run.avgPace || "--:--";
  const timeVal = formatDuration(run.duration || 0);
  const distVal = run.distance?.toFixed(2) || "0";

  let statsSvg = "";

  statsSvg += `<text x="${col1X}" y="${y}" ${labelStyle}>Pace</text>`;
  statsSvg += `<text x="${col2X}" y="${y}" ${labelStyle}>Time</text>`;
  y += 40;

  statsSvg += `<text x="${col1X}" y="${y}" ${valueStyle}>${esc(paceVal)}</text>`;
  statsSvg += `<text x="${col1X + paceVal.length * 22 + 6}" y="${y}" ${unitStyle}>/km</text>`;
  statsSvg += `<text x="${col2X}" y="${y}" ${valueStyle}>${esc(timeVal)}</text>`;
  y += 44;

  statsSvg += `<text x="${col1X}" y="${y}" ${labelStyle}>Distance</text>`;
  y += 40;

  statsSvg += `<text x="${col1X}" y="${y}" ${valueStyle}>${esc(distVal)}</text>`;
  statsSvg += `<text x="${col1X + distVal.length * 22 + 6}" y="${y}" ${unitStyle}>km</text>`;

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="#1a1a2e"/>
    ${gradientOverlay}
    ${nameSvg}
    ${statsSvg}
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
    ? `${esc(userName)}  ·  ${esc(formatDate(run.completedAt, run.timezone))}`
    : esc(formatDate(run.completedAt, run.timezone));

  const mapBg = hasMapTile
    ? ""
    : `<rect width="${w}" height="${mapH}" fill="${C.bgSoft}"/>`;

  const routeSvg = hasMapTile
    ? ""
    : (run.gpsTrack && run.gpsTrack.length > 1
      ? buildGpsRouteElite(0, 0, w, mapH, run.gpsTrack, run.paceData)
      : `<text x="${w / 2}" y="${mapH / 2}" font-family="${FONT}" font-size="22" fill="${C.textMuted}" text-anchor="middle">No GPS data available</text>`);

  const bgRect = hasMapTile
    ? `<rect width="${w}" height="${h}" fill="none"/><rect x="0" y="${mapH}" width="${w}" height="${h - mapH}" fill="${C.bg}"/>`
    : `<rect width="${w}" height="${h}" fill="${C.bg}"/>`;

  return `
    ${globalDefs(w, h)}
    ${bgRect}
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
  const dateText = esc(formatDate(run.completedAt, run.timezone));
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
    topSection += `<text x="${cx}" y="${topY + 22}" font-family="${FONT}" font-size="13" fill="${C.textLight}" text-anchor="middle">${esc(formatDate(run.completedAt, run.timezone))}</text>`;
  } else {
    topSection += `<text x="${cx}" y="${topY + 12}" font-family="${FONT}" font-size="13" fill="${C.textLight}" text-anchor="middle">${esc(formatDate(run.completedAt, run.timezone))}</text>`;
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
    ? `${esc(userName)}  ·  ${esc(formatDate(run.completedAt, run.timezone))}`
    : esc(formatDate(run.completedAt, run.timezone));
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

function buildNoDataChart(px: number, py: number, w: number, h: number, s: number, color: string, label: string): string {
  const rx = Math.round(12 * s);
  const labelFontSize = Math.round(11 * s);
  const labelY = py + Math.round(20 * s);
  const msgFontSize = Math.round(12 * s);
  const msgY = py + Math.round(h / 2) + Math.round(msgFontSize * 0.4);
  return `
    <rect x="${px}" y="${py}" width="${w}" height="${h}" rx="${rx}" fill="${C.bgCard}" filter="url(#softShadow)"/>
    <rect x="${px}" y="${py}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${C.border}" stroke-width="1"/>
    <text x="${px + w / 2}" y="${labelY}" font-family="${FONT}" font-size="${labelFontSize}" font-weight="600" fill="${C.textMuted}" text-anchor="middle" letter-spacing="1">${esc(label)}</text>
    <text x="${px + w / 2}" y="${msgY}" font-family="${FONT}" font-size="${msgFontSize}" fill="${color}" text-anchor="middle" opacity="0.55">No data for this run</text>
  `;
}

function buildStickerSvg(sticker: PlacedSticker, run: RunDataForImage, canvasW: number, canvasH: number): string {
  const px = Math.round(sticker.x * canvasW);
  const py = Math.round(sticker.y * canvasH);
  const s = sticker.scale || 1;
  const sw = Math.round(200 * s);
  const sh = Math.round(100 * s);
  const maxStickerH = Math.round(150 * s); // charts are 140*s tall
  const protectedY = canvasH - LOGO_ZONE_H;
  if (py + maxStickerH > protectedY) return "";
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
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const cRx = Math.round(12 * s);
      // Try elevation from GPS track points first
      const rawGps = run.gpsTrack as any[];
      const gpsElevData = rawGps?.length >= 2
        ? rawGps.map((p: any) => p.elevation ?? p.alt ?? p.altitude ?? null).filter((v: any) => v !== null)
        : [];
      if (gpsElevData.length >= 2) {
        return `
          <rect x="${px}" y="${py}" width="${chartW}" height="${chartH}" rx="${cRx}" fill="${C.bgCard}" filter="url(#softShadow)"/>
          <rect x="${px}" y="${py}" width="${chartW}" height="${chartH}" rx="${cRx}" fill="none" stroke="${C.border}" stroke-width="1"/>
          <g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, gpsElevData, C.green, "Elevation (m)")}</g>`;
      }
      // Fallback: simulate from pace splits if available (uphill = slower pace)
      if (run.paceData && run.paceData.length >= 2) {
        const totalElevGain = run.elevationGain || run.elevation || 30;
        const paceVals = run.paceData.map((p) => p.paceSeconds);
        const minPace = Math.min(...paceVals);
        const maxPace = Math.max(...paceVals);
        const range = maxPace - minPace || 1;
        const simElev = paceVals.map((p) => ((p - minPace) / range) * totalElevGain);
        return `
          <rect x="${px}" y="${py}" width="${chartW}" height="${chartH}" rx="${cRx}" fill="${C.bgCard}" filter="url(#softShadow)"/>
          <rect x="${px}" y="${py}" width="${chartW}" height="${chartH}" rx="${cRx}" fill="none" stroke="${C.border}" stroke-width="1"/>
          <g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, simElev, C.green, "Elevation est.")}</g>`;
      }
      // No data placeholder
      return buildNoDataChart(px, py, chartW, chartH, s, C.green, "ELEVATION");
    }
    case "chart-pace": {
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const cRx = Math.round(12 * s);
      if (run.paceData && run.paceData.length >= 2) {
        const paceValues = run.paceData.map((p) => p.paceSeconds);
        return `
          <rect x="${px}" y="${py}" width="${chartW}" height="${chartH}" rx="${cRx}" fill="${C.bgCard}" filter="url(#softShadow)"/>
          <rect x="${px}" y="${py}" width="${chartW}" height="${chartH}" rx="${cRx}" fill="none" stroke="${C.border}" stroke-width="1"/>
          <g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, paceValues, C.orange, "Pace /km")}</g>`;
      }
      return buildNoDataChart(px, py, chartW, chartH, s, C.orange, "PACE");
    }
    case "chart-heartrate": {
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const cRx = Math.round(12 * s);
      if (run.heartRateData && run.heartRateData.length >= 2) {
        const hrSampled = sampleData(run.heartRateData.map((h) => h.value), 30);
        return `
          <rect x="${px}" y="${py}" width="${chartW}" height="${chartH}" rx="${cRx}" fill="${C.bgCard}" filter="url(#softShadow)"/>
          <rect x="${px}" y="${py}" width="${chartW}" height="${chartH}" rx="${cRx}" fill="none" stroke="${C.border}" stroke-width="1"/>
          <g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, hrSampled, C.red, "Heart Rate")}</g>`;
      }
      return buildNoDataChart(px, py, chartW, chartH, s, C.red, "HEART RATE");
    }
    case "text-custom": {
      const text = sticker.customText || run.name || "My Run";
      const maxW = Math.round(320 * s);
      const padX = Math.round(20 * s);
      const padY = Math.round(14 * s);
      const tFontSize = Math.round(22 * s);
      const bh = tFontSize + padY * 2;
      return `
        <rect x="${px}" y="${py}" width="${maxW}" height="${bh}" rx="${Math.round(12 * s)}" fill="${C.bgCard}" filter="url(#softShadow)" opacity="0.92"/>
        <rect x="${px}" y="${py}" width="${maxW}" height="${bh}" rx="${Math.round(12 * s)}" fill="none" stroke="${C.border}" stroke-width="1"/>
        <text x="${px + padX}" y="${py + padY + tFontSize * 0.75}" font-family="${FONT}" font-size="${tFontSize}" font-weight="700" fill="${C.textDark}">${esc(text)}</text>
      `;
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
    return await sharp(logoPath).resize(129, 129, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  } catch (e: any) {
    try {
      const altPath = path.resolve("attached_assets/logo_1772693744611.png");
      return await sharp(altPath).resize(129, 129, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    } catch {
      console.error("Logo not found:", e.message);
      return null;
    }
  }
}

export async function generateShareImage(req: GenerateImageRequest): Promise<Buffer> {
  const template = TEMPLATES.find((t) => t.id === req.templateId);
  if (!template) throw new Error(`Template not found: ${req.templateId}`);

  console.log(`Share image: template=${req.templateId}, gpsTrack=${req.runData.gpsTrack?.length || 0} points, paceData=${req.runData.paceData?.length || 0} splits`);

  const dims = ASPECT_DIMENSIONS[req.aspectRatio] || ASPECT_DIMENSIONS["1:1"];
  const { width: w, height: h } = dims;

  let svgContent: string;

  switch (template.id) {
    case "stats-grid":
      svgContent = buildStatsGridSvg(w, h, req.runData, req.userName, req.ringLayout, req.customCaption);
      break;
    case "run-metrics":
      svgContent = buildRunMetricsSvg(w, h, req.runData, req.userName);
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
      svgContent = buildStatsGridSvg(w, h, req.runData, req.userName, req.ringLayout, req.customCaption);
  }

  let stickersSvg = "";
  if (req.stickers && req.stickers.length > 0) {
    stickersSvg = req.stickers.map((s) => buildStickerSvg(s, req.runData, w, h)).join("\n");
  }

  const hasCustomBg = !!req.customBackground;

  if (hasCustomBg) {
    const bgRectPattern = `<rect width="${w}" height="${h}" fill="`;
    const bgRectIdx = svgContent.indexOf(bgRectPattern);
    if (bgRectIdx >= 0) {
      const afterFill = svgContent.indexOf('"/>', bgRectIdx + bgRectPattern.length);
      if (afterFill >= 0) {
        svgContent = svgContent.substring(0, bgRectIdx)
          + `<rect width="${w}" height="${h}" fill="#000000" opacity="0"/>`
          + svgContent.substring(afterFill + 3);
      }
    }
  }

  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${svgContent}
    ${stickersSvg}
  </svg>`;

  let svgBuffer = await sharp(Buffer.from(fullSvg))
    .png({ quality: 95 })
    .toBuffer();

  if (hasCustomBg) {
    try {
      let bgBase64 = req.customBackground!;
      if (bgBase64.startsWith("data:")) {
        bgBase64 = bgBase64.split(",")[1] || bgBase64;
      }
      const bgRaw = Buffer.from(bgBase64, "base64");
      let bgPipeline = sharp(bgRaw).rotate().resize(w, h, { fit: "cover", position: "center" });

      const blurAmount = req.backgroundBlur || 0;
      if (blurAmount > 0) {
        const sigma = Math.max(0.3, blurAmount / 10);
        bgPipeline = bgPipeline.blur(sigma);
      }

      const opacity = Math.min(Math.max(req.backgroundOpacity ?? 1, 0.1), 1);
      let bgBuffer = await bgPipeline.ensureAlpha().png().toBuffer();

      if (opacity < 1) {
        const fadeOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${C.bg}" opacity="${(1 - opacity).toFixed(2)}"/></svg>`;
        const fadeBuffer = await sharp(Buffer.from(fadeOverlay)).png().toBuffer();
        bgBuffer = await sharp(bgBuffer)
          .composite([{ input: fadeBuffer, top: 0, left: 0 }])
          .png().toBuffer();
      }

      svgBuffer = await sharp(bgBuffer)
        .composite([{ input: svgBuffer, top: 0, left: 0 }])
        .png({ quality: 95 }).toBuffer();
    } catch (e: any) {
      console.error("Custom background processing error:", e.message);
    }
  }

  if (template.id === "route-map" && req.runData.gpsTrack && req.runData.gpsTrack.length > 1) {
    const mapRegionH = getRouteMapHeight(w, h);
    const mapTileBuffer = await fetchMapTileWithRoute(req.runData.gpsTrack, w, mapRegionH, req.runData.paceData);
    if (mapTileBuffer) {
      try {
        const overlaySvg = buildRouteMapSvg(w, h, req.runData, req.userName, true);
        const overlaySvgFull = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${overlaySvg}${stickersSvg}</svg>`;
        const overlayBuffer = await sharp(Buffer.from(overlaySvgFull)).png().toBuffer();

        const mapResized = await sharp(mapTileBuffer).resize(w, mapRegionH, { fit: "cover" }).png().toBuffer();
        console.log(`Map composite: canvas=${w}x${h}, mapRegion=${w}x${mapRegionH}, mapResized=${mapResized.length} bytes, overlay=${overlayBuffer.length} bytes`);

        svgBuffer = await sharp({
          create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } }
        })
          .composite([
            { input: mapResized, top: 0, left: 0 },
            { input: overlayBuffer, top: 0, left: 0 },
          ])
          .png({ quality: 95 })
          .toBuffer();
        console.log(`Map composite result: ${svgBuffer.length} bytes`);
      } catch (e: any) {
        console.error("Map composite error:", e.message);
      }
    }
  }

  const logoBuffer = await getLogoBuffer();
  {
    // ── Premium brand banner ──────────────────────────────────────────
    const bannerTop = h - LOGO_ZONE_H;
    const gradTop   = bannerTop - LOGO_GRADIENT_H;

    // Logo sits left, vertically centered in the solid banner
    const logoSize  = 96;
    const logoX     = 40;
    const logoY     = bannerTop + Math.round((LOGO_ZONE_H - logoSize) / 2);
    const textX     = logoX + logoSize + 20;

    // Text anchor points
    const midBanner = bannerTop + Math.round(LOGO_ZONE_H / 2);
    const brandTextY = midBanner - 8;
    const brandSubY  = midBanner + 36;
    const urlY       = h - 28;

    const brandSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="brandFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0A0A1A" stop-opacity="0"/>
          <stop offset="100%" stop-color="#0A0A1A" stop-opacity="1"/>
        </linearGradient>
        <filter id="cyanGlow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <!-- Gradient bleed — fades content into the banner -->
      <rect x="0" y="${gradTop}" width="${w}" height="${LOGO_GRADIENT_H}" fill="url(#brandFade)"/>

      <!-- Solid banner -->
      <rect x="0" y="${bannerTop}" width="${w}" height="${LOGO_ZONE_H}" fill="#0A0A1A"/>

      <!-- Glowing cyan accent line -->
      <line x1="0" y1="${bannerTop}" x2="${w}" y2="${bannerTop}" stroke="#00D4FF" stroke-width="1.5" opacity="0.55" filter="url(#cyanGlow)"/>

      <!-- Brand name — bold uppercase white -->
      <text x="${textX}" y="${brandTextY}" font-family="${FONT}" font-size="52" font-weight="900" fill="#FFFFFF" letter-spacing="2">AI RUN COACH</text>

      <!-- Tagline — cyan accent -->
      <text x="${textX}" y="${brandSubY}" font-family="${FONT}" font-size="23" font-weight="600" fill="#00D4FF" letter-spacing="1.5" opacity="0.9">YOUR AI-POWERED RUNNING PARTNER</text>

      <!-- URL — subtle, right-aligned -->
      <text x="${w - 40}" y="${urlY}" font-family="${FONT}" font-size="20" font-weight="400" fill="rgba(255,255,255,0.35)" text-anchor="end" letter-spacing="0.5">airuncoach.live</text>
    </svg>`;

    const brandBuffer = await sharp(Buffer.from(brandSvg)).png().toBuffer();

    const composites: sharp.OverlayOptions[] = [{ input: brandBuffer, top: 0, left: 0 }];
    if (logoBuffer) {
      const resizedLogo = await sharp(logoBuffer)
        .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      composites.push({ input: resizedLogo, top: logoY, left: logoX });
    }

    svgBuffer = await sharp(svgBuffer)
      .composite(composites)
      .png({ quality: 95 })
      .toBuffer();
  }

  // Composite custom image stickers (user-placed photos/logos)
  if (req.customStickers && req.customStickers.length > 0) {
    const protectedY = h - LOGO_ZONE_H;
    const composites: sharp.OverlayOptions[] = [];

    for (const cs of req.customStickers) {
      try {
        let b64 = cs.imageBase64;
        if (b64.startsWith("data:")) b64 = b64.split(",")[1] || b64;
        const rawBuf = Buffer.from(b64, "base64");
        const stickerW = Math.round(cs.width * cs.scale);
        const stickerH = Math.round(cs.height * cs.scale);
        const left = Math.max(0, Math.min(Math.round(cs.x * w), w - stickerW));
        const top = Math.max(0, Math.min(Math.round(cs.y * h), protectedY - stickerH));
        if (stickerW < 1 || stickerH < 1) continue;
        const resized = await sharp(rawBuf)
          .resize(stickerW, stickerH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .ensureAlpha()
          .png()
          .toBuffer();
        composites.push({ input: resized, top, left });
      } catch (e: any) {
        console.warn("Custom sticker composite skipped:", e.message);
      }
    }

    if (composites.length > 0) {
      svgBuffer = await sharp(svgBuffer)
        .composite(composites)
        .png({ quality: 95 })
        .toBuffer();
    }
  }

  return svgBuffer;
}

function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const pt of points) {
    const lat = Math.round(pt.lat * 1e5);
    const lng = Math.round(pt.lng * 1e5);
    let dLat = lat - prevLat;
    let dLng = lng - prevLng;
    prevLat = lat;
    prevLng = lng;
    for (const d of [dLat, dLng]) {
      let v = d < 0 ? ~(d << 1) : d << 1;
      while (v >= 0x20) {
        encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      encoded += String.fromCharCode(v + 63);
    }
  }
  return encoded;
}

async function fetchMapTileWithRoute(
  gpsTrack: Array<{ lat: number; lng: number }>,
  tileW: number, tileH: number,
  paceData?: Array<{ km: number; pace: string; paceSeconds: number }>
): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("No Google Maps API key found");
    return null;
  }

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

  const sampleCount = Math.min(gpsTrack.length, 60);
  const step = gpsTrack.length / sampleCount;
  const sampled: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < sampleCount; i++) {
    sampled.push(gpsTrack[Math.floor(i * step)]);
  }
  sampled.push(gpsTrack[gpsTrack.length - 1]);

  const encodedPath = encodePolyline(sampled);
  const pathParam = `path=color:0x00D4FFCC|weight:5|enc:${encodeURIComponent(encodedPath)}`;

  const startPt = gpsTrack[0];
  const endPt = gpsTrack[gpsTrack.length - 1];
  const markers = [
    `markers=color:0x00E676|size:small|label:S|${startPt.lat.toFixed(5)},${startPt.lng.toFixed(5)}`,
    `markers=color:0xFF5252|size:small|label:F|${endPt.lat.toFixed(5)},${endPt.lng.toFixed(5)}`,
  ].join("&");

  const url = `https://maps.googleapis.com/maps/api/staticmap?size=${reqW}x${reqH}&scale=2&maptype=roadmap&${lightStyle}&${pathParam}&${markers}&key=${apiKey}`;

  console.log("Map tile URL length:", url.length, "chars");

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
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("image")) {
      const body = await resp.text().catch(() => "");
      console.error("Map tile returned non-image content:", contentType, body.substring(0, 200));
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 1000) {
      console.error("Map tile suspiciously small:", buf.length, "bytes — may be an error image");
    }
    console.log("Map tile fetched:", buf.length, "bytes");
    return buf;
  } catch (err: any) {
    console.error("Map tile fetch error:", err.message);
    return null;
  }
}
