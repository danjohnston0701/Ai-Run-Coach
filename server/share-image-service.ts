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

/* ═══════════════════════ DESIGN SYSTEM ═══════════════════════ */

const C = {
  cyan:       "#00D4FF",
  cyanDark:   "#0099CC",
  cyanGlow:   "#00D4FF",
  orange:     "#FF6B35",
  green:      "#00E676",
  greenDark:  "#00C853",
  yellow:     "#FFD600",
  red:        "#FF5252",
  redSoft:    "#FF8A80",
  white:      "#FFFFFF",
  offWhite:   "#E8ECF1",
  grey:       "#A0AEC0",
  greyMuted:  "#64748B",
  greyDark:   "#475569",
  bg1:        "#050A12",
  bg2:        "#0A1628",
  bg3:        "#0F1D32",
  bgCard:     "#111D2E",
  bgCardAlt:  "#162236",
  border:     "#1E3048",
  borderGlow: "#00D4FF",
};

const FONT = `'SF Pro Display', 'Inter', 'Helvetica Neue', Arial, sans-serif`;

export const TEMPLATES: ShareTemplate[] = [
  {
    id: "stats-grid",
    name: "Stats Grid",
    description: "Premium grid of your key run metrics",
    category: "stats",
    preview: "grid",
    aspectRatios: ["1:1", "9:16", "4:5"],
  },
  {
    id: "route-map",
    name: "Route Map",
    description: "Your GPS route with pace-colored trail",
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

/* ═══════════════════════ UTILITIES ═══════════════════════ */

function formatDuration(seconds: number): string {
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

/** Pace string (e.g. "4:35") to seconds */
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

/* ═══════════════════════ SHARED SVG BUILDING BLOCKS ═══════════════════════ */

/** Global defs reused across all templates */
function globalDefs(w: number, h: number): string {
  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${C.bg1}"/>
        <stop offset="50%" stop-color="${C.bg2}"/>
        <stop offset="100%" stop-color="${C.bg1}"/>
      </linearGradient>
      <linearGradient id="cyanGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.cyan}"/>
        <stop offset="100%" stop-color="${C.green}"/>
      </linearGradient>
      <linearGradient id="orangeGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.orange}"/>
        <stop offset="100%" stop-color="${C.yellow}"/>
      </linearGradient>
      <linearGradient id="fadeLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.cyan}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${C.cyan}" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="${C.cyan}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C.cyan}"/>
        <stop offset="50%" stop-color="${C.green}"/>
        <stop offset="100%" stop-color="${C.cyan}"/>
      </linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glowLarge" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="20" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="115%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
    </defs>
  `;
}

/** Premium watermark bar */
function watermark(w: number, h: number): string {
  return `
    <rect x="0" y="${h - 56}" width="${w}" height="56" fill="${C.bg1}" opacity="0.85"/>
    <line x1="0" y1="${h - 56}" x2="${w}" y2="${h - 56}" stroke="${C.border}" stroke-width="1"/>
    <text x="${w / 2}" y="${h - 20}" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.cyan}" text-anchor="middle" letter-spacing="4" opacity="0.8">AI RUN COACH</text>
  `;
}

/** Subtle grid pattern background */
function bgPattern(w: number, h: number): string {
  let lines = "";
  const spacing = 60;
  for (let x = 0; x <= w; x += spacing) {
    lines += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${C.border}" stroke-width="0.5" opacity="0.15"/>`;
  }
  for (let y = 0; y <= h; y += spacing) {
    lines += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${C.border}" stroke-width="0.5" opacity="0.15"/>`;
  }
  return lines;
}

/** Glass-morphism stat card */
function glassCard(
  x: number, y: number, w: number, h: number,
  label: string, value: string, unit: string, color: string
): string {
  const rx = 20;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${C.bgCard}" opacity="0.85" filter="url(#cardShadow)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${C.border}" stroke-width="1.5"/>
    <line x1="${x + 20}" y1="${y + 4}" x2="${x + w - 20}" y2="${y + 4}" stroke="${color}" stroke-width="2.5" opacity="0.5" stroke-linecap="round"/>
    <text x="${x + w / 2}" y="${y + 32}" font-family="${FONT}" font-size="13" font-weight="500" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="2">${esc(label.toUpperCase())}</text>
    <text x="${x + w / 2}" y="${y + h * 0.58 + 8}" font-family="${FONT}" font-size="42" font-weight="800" fill="${color}" text-anchor="middle">${esc(value)}</text>
    ${unit ? `<text x="${x + w / 2}" y="${y + h - 18}" font-family="${FONT}" font-size="14" font-weight="500" fill="${C.grey}" text-anchor="middle">${esc(unit)}</text>` : ""}
  `;
}

/** Header block: user name, date, hero distance */
function headerBlock(w: number, startY: number, run: RunDataForImage, userName?: string): string {
  let y = startY;
  let svg = "";

  if (userName) {
    svg += `<text x="${w / 2}" y="${y}" font-family="${FONT}" font-size="18" font-weight="600" fill="${C.offWhite}" text-anchor="middle" letter-spacing="1">${esc(userName)}</text>`;
    y += 28;
  }

  svg += `<text x="${w / 2}" y="${y}" font-family="${FONT}" font-size="15" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="0.5">${esc(formatDate(run.completedAt))}</text>`;
  y += 50;

  // Hero distance
  const dist = run.distance?.toFixed(2) || "0";
  svg += `<text x="${w / 2}" y="${y}" font-family="${FONT}" font-size="64" font-weight="900" fill="${C.white}" text-anchor="middle" letter-spacing="-1">${esc(dist)}</text>`;
  y += 30;
  svg += `<text x="${w / 2}" y="${y}" font-family="${FONT}" font-size="16" font-weight="600" fill="${C.cyan}" text-anchor="middle" letter-spacing="5">KILOMETERS</text>`;
  y += 12;

  // Accent line under
  svg += `<line x1="${w * 0.2}" y1="${y}" x2="${w * 0.8}" y2="${y}" stroke="url(#fadeLine)" stroke-width="1.5"/>`;

  return svg;
}

/* ═══════════════════════ STATS GRID ═══════════════════════ */

function buildStatsGridSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const isVertical = h > w;
  const pad = 40;
  const headerStartY = isVertical ? 80 : 60;

  // Header
  const header = headerBlock(w, headerStartY, run, userName);

  // Calculate grid start
  const headerEndY = headerStartY + (userName ? 28 : 0) + 95;
  const gridStartY = headerEndY + 30;
  const gridEndY = h - 80; // leave room for watermark
  const availH = gridEndY - gridStartY;

  const cols = 2;
  const gap = 16;
  const cardW = (w - pad * 2 - gap) / cols;
  const rows = isVertical ? 3 : 3;
  const cardH = Math.min((availH - gap * (rows - 1)) / rows, 140);

  const stats = [
    { label: "Distance",   value: run.distance?.toFixed(2) || "0",                    unit: "km",   color: C.cyan },
    { label: "Duration",   value: formatDuration(run.duration || 0),                   unit: "",     color: C.cyan },
    { label: "Avg Pace",   value: run.avgPace || "--:--",                              unit: "/km",  color: C.orange },
    { label: "Heart Rate", value: run.avgHeartRate?.toString() || "--",                unit: "bpm",  color: C.red },
    { label: "Calories",   value: run.calories?.toString() || "--",                    unit: "kcal", color: C.yellow },
    { label: "Elevation",  value: Math.round(run.elevationGain || run.elevation || 0).toString(), unit: "m", color: C.green },
  ];

  let cards = "";
  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = pad + col * (cardW + gap);
    const cy = gridStartY + row * (cardH + gap);
    if (cy + cardH <= gridEndY) {
      cards += glassCard(cx, cy, cardW, cardH, s.label, s.value, s.unit, s.color);
    }
  });

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    ${bgPattern(w, h)}
    ${header}
    ${cards}
    ${watermark(w, h)}
  `;
}

/* ═══════════════════════ ROUTE MAP ═══════════════════════ */

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

  // Build pace-colored segments if pace data available
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
    // Gradient polyline fallback
    const points = mapped.map(p => `${p.px},${p.py}`).join(" ");
    routeSvg = `
      <polyline points="${points}" fill="none" stroke="url(#routeGrad)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
    `;
  }

  // Glow effect underneath the route
  const glowPoints = mapped.map(p => `${p.px},${p.py}`).join(" ");
  const glowRoute = `<polyline points="${glowPoints}" fill="none" stroke="${C.cyan}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity="0.15"/>`;

  // Start/end markers
  const sp = mapped[0];
  const ep = mapped[mapped.length - 1];

  // Distance markers along route
  let kmMarkers = "";
  if (paceData && paceData.length > 1) {
    paceData.forEach((pd, idx) => {
      if (idx === 0) return; // skip start
      const trackIdx = Math.min(Math.floor(((idx) / paceData.length) * mapped.length), mapped.length - 1);
      const pt = mapped[trackIdx];
      kmMarkers += `
        <circle cx="${pt.px}" cy="${pt.py}" r="10" fill="${C.bg1}" stroke="${C.border}" stroke-width="1.5" opacity="0.9"/>
        <text x="${pt.px}" y="${pt.py + 4}" font-family="${FONT}" font-size="9" font-weight="700" fill="${C.grey}" text-anchor="middle">${idx}</text>
      `;
    });
  }

  return `
    ${glowRoute}
    ${routeSvg}
    ${kmMarkers}
    <circle cx="${sp.px}" cy="${sp.py}" r="12" fill="${C.green}" stroke="${C.bg1}" stroke-width="4"/>
    <circle cx="${sp.px}" cy="${sp.py}" r="5" fill="${C.bg1}"/>
    <circle cx="${ep.px}" cy="${ep.py}" r="12" fill="${C.red}" stroke="${C.bg1}" stroke-width="4"/>
    <circle cx="${ep.px}" cy="${ep.py}" r="4" fill="${C.white}"/>
  `;
}

function buildRouteMapSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const isVertical = h > w;
  const mapH = isVertical ? h * 0.6 : h * 0.58;
  const statsY = mapH + 16;

  const routeSvg = run.gpsTrack && run.gpsTrack.length > 1
    ? buildGpsRouteElite(0, 0, w, mapH, run.gpsTrack, run.paceData)
    : `<text x="${w / 2}" y="${mapH / 2}" font-family="${FONT}" font-size="22" fill="${C.greyMuted}" text-anchor="middle">No GPS data available</text>`;

  // Stats strip
  const gap = 12;
  const statW = (w - gap * 4) / 3;
  const statH = isVertical ? 100 : 90;

  const stats = [
    { label: "Distance", value: run.distance?.toFixed(2) || "0", unit: "km", color: C.cyan },
    { label: "Pace",     value: run.avgPace || "--:--",          unit: "/km", color: C.orange },
    { label: "Time",     value: formatDuration(run.duration || 0), unit: "", color: C.cyan },
  ];

  let statCards = "";
  stats.forEach((s, i) => {
    const sx = gap + i * (statW + gap);
    statCards += glassCard(sx, statsY, statW, statH, s.label, s.value, s.unit, s.color);
  });

  // Pace legend (if pace data exists)
  let legend = "";
  if (run.paceData && run.paceData.length > 0) {
    const paceSeconds = run.paceData.map(p => p.paceSeconds);
    const fastest = Math.min(...paceSeconds);
    const slowest = Math.max(...paceSeconds);
    const fastPace = `${Math.floor(fastest / 60)}:${String(fastest % 60).padStart(2, "0")}`;
    const slowPace = `${Math.floor(slowest / 60)}:${String(slowest % 60).padStart(2, "0")}`;
    const legendY = mapH - 50;
    legend = `
      <rect x="20" y="${legendY}" width="160" height="40" rx="10" fill="${C.bg1}" opacity="0.85" stroke="${C.border}" stroke-width="1"/>
      <text x="30" y="${legendY + 14}" font-family="${FONT}" font-size="10" font-weight="600" fill="${C.grey}" letter-spacing="1">PACE</text>
      <rect x="30" y="${legendY + 20}" width="80" height="6" rx="3" fill="url(#paceGradLegend)"/>
      <text x="30" y="${legendY + 36}" font-family="${FONT}" font-size="9" fill="${C.green}">${fastPace}</text>
      <text x="110" y="${legendY + 36}" font-family="${FONT}" font-size="9" fill="${C.orange}" text-anchor="end">${slowPace}</text>
    `;
  }

  // Footer
  const footerY = statsY + statH + 30;
  const nameDate = userName
    ? `${esc(userName)}  ·  ${esc(formatDate(run.completedAt))}`
    : esc(formatDate(run.completedAt));

  return `
    ${globalDefs(w, h)}
    <defs>
      <linearGradient id="paceGradLegend" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.green}"/>
        <stop offset="50%" stop-color="${C.yellow}"/>
        <stop offset="100%" stop-color="${C.orange}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    ${bgPattern(w, h)}
    ${routeSvg}
    ${legend}
    ${statCards}
    <text x="${w / 2}" y="${footerY}" font-family="${FONT}" font-size="14" fill="${C.greyMuted}" text-anchor="middle">${nameDate}</text>
    ${watermark(w, h)}
  `;
}

/* ═══════════════════════ SPLIT SUMMARY ═══════════════════════ */

function buildSplitSummarySvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const pad = 40;
  const isVertical = h > w;

  // Header
  const headerY = isVertical ? 70 : 55;
  const dateText = esc(formatDate(run.completedAt));
  const heroText = `${esc(run.distance?.toFixed(2) || "0")} km`;
  const timeText = esc(formatDuration(run.duration || 0));

  let headerSvg = `
    <text x="${w / 2}" y="${headerY}" font-family="${FONT}" font-size="14" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="0.5">${dateText}</text>
    <text x="${w / 2}" y="${headerY + 48}" font-family="${FONT}" font-size="48" font-weight="900" fill="${C.white}" text-anchor="middle" letter-spacing="-1">${heroText}</text>
    <text x="${w / 2}" y="${headerY + 76}" font-family="${FONT}" font-size="22" font-weight="600" fill="${C.cyan}" text-anchor="middle">${timeText}</text>
    <line x1="${pad}" y1="${headerY + 92}" x2="${w - pad}" y2="${headerY + 92}" stroke="url(#fadeLine)" stroke-width="1"/>
  `;

  // Column headers
  const splitsStartY = headerY + 118;
  headerSvg += `
    <text x="${pad + 10}" y="${splitsStartY - 8}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.greyMuted}" letter-spacing="1.5">SPLIT</text>
    <text x="${w / 2}" y="${splitsStartY - 8}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="1.5">PERFORMANCE</text>
    <text x="${w - pad - 10}" y="${splitsStartY - 8}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.greyMuted}" text-anchor="end" letter-spacing="1.5">PACE</text>
  `;

  const paceData = run.paceData || [];
  const rowH = 56;
  const maxSplits = Math.min(paceData.length, Math.floor((h - splitsStartY - 100) / rowH));

  let splitRows = "";

  if (paceData.length === 0) {
    splitRows = `<text x="${w / 2}" y="${splitsStartY + 60}" font-family="${FONT}" font-size="18" fill="${C.greyMuted}" text-anchor="middle">No split data available</text>`;
  }

  const paceValues = paceData.map((p) => p.paceSeconds);
  const minPace = paceValues.length > 0 ? Math.min(...paceValues) : 0;
  const maxPace = paceValues.length > 0 ? Math.max(...paceValues) : 1;
  const paceRange = maxPace - minPace || 1;
  const bestSplitIdx = paceValues.indexOf(minPace);

  const barStartX = pad + 80;
  const barMaxW = w - pad * 2 - 180;

  for (let i = 0; i < maxSplits; i++) {
    const split = paceData[i];
    const ry = splitsStartY + i * rowH;
    const barRatio = 0.4 + 0.6 * (1 - (split.paceSeconds - minPace) / paceRange);
    const barW = barMaxW * barRatio;
    const pc = paceColor(split.paceSeconds, minPace, maxPace);
    const isBest = i === bestSplitIdx;

    // Row background (subtle alternation)
    if (i % 2 === 0) {
      splitRows += `<rect x="${pad}" y="${ry}" width="${w - pad * 2}" height="${rowH}" rx="8" fill="${C.bgCard}" opacity="0.3"/>`;
    }

    // Km label
    splitRows += `<text x="${pad + 14}" y="${ry + 34}" font-family="${FONT}" font-size="18" font-weight="700" fill="${C.offWhite}">Km ${split.km}</text>`;

    // Performance bar with rounded ends
    splitRows += `<rect x="${barStartX}" y="${ry + 18}" width="${barW}" height="20" rx="10" fill="${pc}" opacity="0.2"/>`;
    splitRows += `<rect x="${barStartX}" y="${ry + 18}" width="${barW * 0.85}" height="20" rx="10" fill="${pc}" opacity="0.5"/>`;

    // Best split indicator
    if (isBest && maxSplits > 1) {
      splitRows += `<text x="${barStartX + barW + 6}" y="${ry + 34}" font-family="${FONT}" font-size="10" font-weight="700" fill="${C.green}" letter-spacing="0.5">BEST</text>`;
    }

    // Pace value
    splitRows += `<text x="${w - pad - 14}" y="${ry + 34}" font-family="${FONT}" font-size="20" font-weight="700" fill="${pc}" text-anchor="end">${esc(split.pace)}</text>`;
  }

  // Avg pace summary at bottom
  const summaryY = splitsStartY + maxSplits * rowH + 20;
  let summarySvg = "";
  if (maxSplits > 0) {
    summarySvg = `
      <line x1="${pad}" y1="${summaryY - 4}" x2="${w - pad}" y2="${summaryY - 4}" stroke="${C.border}" stroke-width="1"/>
      <text x="${pad + 14}" y="${summaryY + 24}" font-family="${FONT}" font-size="14" font-weight="600" fill="${C.grey}">AVG PACE</text>
      <text x="${w - pad - 14}" y="${summaryY + 24}" font-family="${FONT}" font-size="22" font-weight="800" fill="${C.cyan}" text-anchor="end">${esc(run.avgPace || "--:--")} /km</text>
    `;
  }

  // Footer name
  let footerSvg = "";
  if (userName) {
    footerSvg = `<text x="${w / 2}" y="${h - 72}" font-family="${FONT}" font-size="14" fill="${C.greyMuted}" text-anchor="middle">${esc(userName)}</text>`;
  }

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    ${bgPattern(w, h)}
    ${headerSvg}
    ${splitRows}
    ${summarySvg}
    ${footerSvg}
    ${watermark(w, h)}
  `;
}

/* ═══════════════════════ ACHIEVEMENT ═══════════════════════ */

function buildAchievementSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const cx = w / 2;
  const cy = h * 0.4;
  const ringR = Math.min(w, h) * 0.2;

  // Decorative radial rings
  const rings = `
    <circle cx="${cx}" cy="${cy}" r="${ringR + 60}" fill="none" stroke="${C.cyan}" stroke-width="0.5" opacity="0.08"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR + 40}" fill="none" stroke="${C.cyan}" stroke-width="0.5" opacity="0.12"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR + 20}" fill="none" stroke="${C.cyan}" stroke-width="1" opacity="0.15"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${C.cyan}" stroke-width="3" opacity="0.4"/>
    <circle cx="${cx}" cy="${cy}" r="${ringR - 6}" fill="none" stroke="${C.cyan}" stroke-width="1.5" opacity="0.2"/>
  `;

  // Glow behind the distance
  const glow = `
    <circle cx="${cx}" cy="${cy}" r="${ringR - 20}" fill="${C.cyan}" opacity="0.04"/>
  `;

  // Center content
  const center = `
    <text x="${cx}" y="${cy - 28}" font-family="${FONT}" font-size="14" font-weight="600" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="4">RUN COMPLETE</text>
    <text x="${cx}" y="${cy + 24}" font-family="${FONT}" font-size="72" font-weight="900" fill="${C.white}" text-anchor="middle" filter="url(#glow)">${esc(run.distance?.toFixed(2) || "0")}</text>
    <text x="${cx}" y="${cy + 54}" font-family="${FONT}" font-size="20" font-weight="700" fill="${C.cyan}" text-anchor="middle" letter-spacing="6">KILOMETERS</text>
  `;

  // Stats row below ring
  const statsY = cy + ringR + 40;
  const thirds = w / 3;
  const statItems = [
    { label: "PACE",   value: run.avgPace || "--:--", color: C.orange },
    { label: "TIME",   value: formatDuration(run.duration || 0), color: C.cyan },
    { label: "AVG HR", value: `${run.avgHeartRate || "--"}`, color: C.red },
  ];

  let statsRow = "";
  statItems.forEach((s, i) => {
    const sx = thirds * i + thirds / 2;
    statsRow += `
      <text x="${sx}" y="${statsY}" font-family="${FONT}" font-size="12" font-weight="600" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="2">${s.label}</text>
      <text x="${sx}" y="${statsY + 36}" font-family="${FONT}" font-size="32" font-weight="800" fill="${s.color}" text-anchor="middle">${esc(s.value)}</text>
    `;
  });

  // Dividers between stats
  statsRow += `
    <line x1="${thirds}" y1="${statsY - 10}" x2="${thirds}" y2="${statsY + 44}" stroke="${C.border}" stroke-width="1"/>
    <line x1="${thirds * 2}" y1="${statsY - 10}" x2="${thirds * 2}" y2="${statsY + 44}" stroke="${C.border}" stroke-width="1"/>
  `;

  // User/date
  const topY = cy - ringR - 50;
  let topSection = "";
  if (userName) {
    topSection += `<text x="${cx}" y="${topY}" font-family="${FONT}" font-size="20" font-weight="700" fill="${C.offWhite}" text-anchor="middle">${esc(userName)}</text>`;
    topSection += `<text x="${cx}" y="${topY + 24}" font-family="${FONT}" font-size="14" fill="${C.greyMuted}" text-anchor="middle">${esc(formatDate(run.completedAt))}</text>`;
  } else {
    topSection += `<text x="${cx}" y="${topY + 12}" font-family="${FONT}" font-size="14" fill="${C.greyMuted}" text-anchor="middle">${esc(formatDate(run.completedAt))}</text>`;
  }

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    ${bgPattern(w, h)}
    ${topSection}
    ${rings}
    ${glow}
    ${center}
    ${statsRow}
    ${watermark(w, h)}
  `;
}

/* ═══════════════════════ MINIMAL DARK ═══════════════════════ */

function buildMinimalSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const cx = w / 2;
  const cy = h * 0.42;

  // Ultra-subtle accent lines
  const lines = `
    <line x1="${w * 0.12}" y1="${cy - 80}" x2="${w * 0.88}" y2="${cy - 80}" stroke="url(#fadeLine)" stroke-width="1"/>
    <line x1="${w * 0.12}" y1="${cy + 70}" x2="${w * 0.88}" y2="${cy + 70}" stroke="url(#fadeLine)" stroke-width="1"/>
  `;

  // User/date above
  const topY = cy - 110;
  const nameDate = userName
    ? `${esc(userName)}  ·  ${esc(formatDate(run.completedAt))}`
    : esc(formatDate(run.completedAt));
  const topText = `<text x="${cx}" y="${topY}" font-family="${FONT}" font-size="17" font-weight="500" fill="${C.grey}" text-anchor="middle" letter-spacing="0.5">${nameDate}</text>`;

  // Giant distance
  const heroDistance = `
    <text x="${cx}" y="${cy + 10}" font-family="${FONT}" font-size="120" font-weight="900" fill="${C.white}" text-anchor="middle" letter-spacing="-4">${esc(run.distance?.toFixed(2) || "0")}</text>
    <text x="${cx}" y="${cy + 48}" font-family="${FONT}" font-size="22" font-weight="700" fill="${C.cyan}" text-anchor="middle" letter-spacing="8">KILOMETERS</text>
  `;

  // Sub-stats
  const subY = cy + 110;
  const subStats = `
    <text x="${w * 0.3}" y="${subY}" font-family="${FONT}" font-size="12" font-weight="600" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="2">DURATION</text>
    <text x="${w * 0.3}" y="${subY + 28}" font-family="${FONT}" font-size="24" font-weight="700" fill="${C.offWhite}" text-anchor="middle">${esc(formatDuration(run.duration || 0))}</text>
    <text x="${w * 0.7}" y="${subY}" font-family="${FONT}" font-size="12" font-weight="600" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="2">AVG PACE</text>
    <text x="${w * 0.7}" y="${subY + 28}" font-family="${FONT}" font-size="24" font-weight="700" fill="${C.offWhite}" text-anchor="middle">${esc(run.avgPace || "--:--")} /km</text>
    <line x1="${cx}" y1="${subY - 10}" x2="${cx}" y2="${subY + 36}" stroke="${C.border}" stroke-width="1"/>
  `;

  return `
    ${globalDefs(w, h)}
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    ${bgPattern(w, h)}
    ${topText}
    ${lines}
    ${heroDistance}
    ${subStats}
    ${watermark(w, h)}
  `;
}

/* ═══════════════════════ MINI CHART (for stickers) ═══════════════════════ */

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
    <text x="${x}" y="${y + 16}" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.greyMuted}" letter-spacing="1">${esc(label.toUpperCase())}</text>
    <polygon points="${areaPoints}" fill="${color}" opacity="0.1"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

/* ═══════════════════════ STICKER SVG BUILDER ═══════════════════════ */

function buildStickerSvg(sticker: PlacedSticker, run: RunDataForImage, canvasW: number, canvasH: number): string {
  const px = Math.round(sticker.x * canvasW);
  const py = Math.round(sticker.y * canvasH);
  const s = sticker.scale || 1;
  const sw = Math.round(200 * s);
  const sh = Math.round(100 * s);
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
      value = formatDuration(run.duration || 0); unit = ""; label = "DURATION"; color = C.cyan; break;
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
        <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.bgCard}" opacity="0.9" stroke="${dc}" stroke-width="2"/>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 6}" font-family="${FONT}" font-size="${Math.round(16 * s)}" font-weight="700" fill="${dc}" text-anchor="middle" letter-spacing="2">${esc(diff.toUpperCase())}</text>
      `;
    }
    case "badge-weather": {
      if (!run.weatherData?.temperature) return "";
      const bw = Math.round(190 * s);
      const bh = Math.round(48 * s);
      const weatherText = `${Math.round(run.weatherData.temperature)}°C ${run.weatherData.conditions || ""}`.trim();
      return `
        <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.bgCard}" opacity="0.9" stroke="${C.border}" stroke-width="1.5"/>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 6}" font-family="${FONT}" font-size="${Math.round(14 * s)}" font-weight="600" fill="${C.grey}" text-anchor="middle">${esc(weatherText)}</text>
      `;
    }
    default:
      return "";
  }

  // Glass sticker card
  return `
    <rect x="${px}" y="${py}" width="${sw}" height="${sh}" rx="${rx}" fill="${C.bgCard}" opacity="0.9" filter="url(#cardShadow)"/>
    <rect x="${px}" y="${py}" width="${sw}" height="${sh}" rx="${rx}" fill="none" stroke="${C.border}" stroke-width="1"/>
    <line x1="${px + 16}" y1="${py + 3}" x2="${px + sw - 16}" y2="${py + 3}" stroke="${color}" stroke-width="2" opacity="0.4" stroke-linecap="round"/>
    <text x="${px + sw / 2}" y="${py + labelSize + 10}" font-family="${FONT}" font-size="${labelSize}" font-weight="600" fill="${C.greyMuted}" text-anchor="middle" letter-spacing="1">${label}</text>
    <text x="${px + sw / 2}" y="${py + sh / 2 + fontSize * 0.35}" font-family="${FONT}" font-size="${fontSize}" font-weight="800" fill="${color}" text-anchor="middle">${esc(value)}</text>
    ${unit ? `<text x="${px + sw / 2}" y="${py + sh - Math.round(10 * s)}" font-family="${FONT}" font-size="${labelSize}" font-weight="500" fill="${C.grey}" text-anchor="middle">${esc(unit)}</text>` : ""}
  `;
}

/* ═══════════════════════ MAIN ENTRY POINT ═══════════════════════ */

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

  const buffer = await sharp(Buffer.from(fullSvg)).png({ quality: 95 }).toBuffer();
  return buffer;
}
