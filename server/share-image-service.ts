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

const COLORS = {
  primary: "#00D4FF",
  primaryDark: "#00B8E6",
  accent: "#FF6B35",
  success: "#00E676",
  warning: "#FFB300",
  error: "#FF5252",
  bgRoot: "#0A0F1A",
  bgDefault: "#111827",
  bgSecondary: "#1F2937",
  bgTertiary: "#374151",
  text: "#FFFFFF",
  textSecondary: "#A0AEC0",
  textMuted: "#718096",
  border: "#2D3748",
};

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
    aspectRatios: ["9:16", "4:5"],
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

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildWatermark(w: number, h: number): string {
  const logoY = h - 50;
  return `
    <rect x="0" y="${logoY - 10}" width="${w}" height="60" fill="${COLORS.bgRoot}" opacity="0.7"/>
    <text x="${w / 2}" y="${logoY + 22}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="${COLORS.primary}" text-anchor="middle" letter-spacing="2">
      AI RUN COACH
    </text>
  `;
}

function buildStatBox(x: number, y: number, w: number, h: number, label: string, value: string, unit: string, color: string): string {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${COLORS.bgSecondary}" opacity="0.9"/>
    <text x="${x + w / 2}" y="${y + 28}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle" letter-spacing="1">${escapeXml(label.toUpperCase())}</text>
    <text x="${x + w / 2}" y="${y + h / 2 + 14}" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="${color}" text-anchor="middle">${escapeXml(value)}</text>
    ${unit ? `<text x="${x + w / 2}" y="${y + h - 16}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(unit)}</text>` : ""}
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
    <text x="${x}" y="${y + 16}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${COLORS.textMuted}" letter-spacing="0.5">${escapeXml(label.toUpperCase())}</text>
    <polygon points="${areaPoints}" fill="${color}" opacity="0.15"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function buildGpsRoute(x: number, y: number, w: number, h: number, track: Array<{ lat: number; lng: number }>): string {
  if (!track || track.length < 2) return "";

  const lats = track.map((p) => p.lat);
  const lngs = track.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;

  const padding = 30;
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

  return `
    <polyline points="${points}" fill="none" stroke="url(#routeGrad)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${sx}" cy="${sy}" r="8" fill="${COLORS.success}" stroke="${COLORS.bgRoot}" stroke-width="3"/>
    <circle cx="${ex}" cy="${ey}" r="8" fill="${COLORS.error}" stroke="${COLORS.bgRoot}" stroke-width="3"/>
  `;
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
  let color = COLORS.primary;

  switch (sticker.widgetId) {
    case "stat-distance":
      value = run.distance?.toFixed(2) || "0";
      unit = "km";
      label = "DISTANCE";
      color = COLORS.primary;
      break;
    case "stat-duration":
      value = formatDuration(run.duration || 0);
      unit = "";
      label = "DURATION";
      color = COLORS.primary;
      break;
    case "stat-pace":
      value = run.avgPace || "--:--";
      unit = "/km";
      label = "AVG PACE";
      color = COLORS.accent;
      break;
    case "stat-heartrate":
      value = run.avgHeartRate?.toString() || "--";
      unit = "bpm";
      label = "AVG HR";
      color = COLORS.error;
      break;
    case "stat-calories":
      value = run.calories?.toString() || "--";
      unit = "kcal";
      label = "CALORIES";
      color = COLORS.warning;
      break;
    case "stat-elevation":
      value = Math.round(run.elevationGain || run.elevation || 0).toString();
      unit = "m";
      label = "ELEVATION";
      color = COLORS.success;
      break;
    case "stat-cadence":
      value = run.cadence?.toString() || "--";
      unit = "spm";
      label = "CADENCE";
      color = COLORS.primary;
      break;
    case "stat-maxhr":
      value = run.maxHeartRate?.toString() || "--";
      unit = "bpm";
      label = "MAX HR";
      color = COLORS.error;
      break;
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
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, elevData, COLORS.success, "Elevation")}</g>`;
    }
    case "chart-pace": {
      if (!run.paceData || run.paceData.length < 2) return "";
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const paceValues = run.paceData.map((p) => p.paceSeconds);
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, paceValues, COLORS.accent, "Pace /km")}</g>`;
    }
    case "chart-heartrate": {
      if (!run.heartRateData || run.heartRateData.length < 2) return "";
      const chartW = Math.round(280 * s);
      const chartH = Math.round(140 * s);
      const hrSampled = sampleData(run.heartRateData.map((h) => h.value), 30);
      return `<g transform="translate(${px},${py})">${buildMiniChart(0, 0, chartW, chartH, hrSampled, COLORS.error, "Heart Rate")}</g>`;
    }
    case "badge-difficulty": {
      const diff = run.difficulty || "moderate";
      const diffColors: Record<string, string> = {
        easy: COLORS.success, moderate: COLORS.warning, challenging: COLORS.accent, hard: COLORS.accent, extreme: COLORS.error,
      };
      const dc = diffColors[diff] || COLORS.warning;
      const bw = Math.round(160 * s);
      const bh = Math.round(48 * s);
      return `
        <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${dc}" opacity="0.2" stroke="${dc}" stroke-width="2"/>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 5}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(16 * s)}" font-weight="600" fill="${dc}" text-anchor="middle">${escapeXml(diff.toUpperCase())}</text>
      `;
    }
    case "badge-weather": {
      if (!run.weatherData?.temperature) return "";
      const bw = Math.round(180 * s);
      const bh = Math.round(48 * s);
      const weatherText = `${Math.round(run.weatherData.temperature)}°C ${run.weatherData.conditions || ""}`.trim();
      return `
        <rect x="${px}" y="${py}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${COLORS.bgSecondary}" opacity="0.9" stroke="${COLORS.border}" stroke-width="1"/>
        <text x="${px + bw / 2}" y="${py + bh / 2 + 5}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(14 * s)}" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(weatherText)}</text>
      `;
    }
    default:
      return "";
  }

  return `
    <rect x="${px}" y="${py}" width="${sw}" height="${sh}" rx="${Math.round(12 * s)}" fill="${COLORS.bgSecondary}" opacity="0.9"/>
    <text x="${px + sw / 2}" y="${py + labelSize + 8}" font-family="Arial, Helvetica, sans-serif" font-size="${labelSize}" fill="${COLORS.textMuted}" text-anchor="middle" letter-spacing="0.5">${label}</text>
    <text x="${px + sw / 2}" y="${py + sh / 2 + fontSize * 0.35}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="${color}" text-anchor="middle">${escapeXml(value)}</text>
    ${unit ? `<text x="${px + sw / 2}" y="${py + sh - Math.round(8 * s)}" font-family="Arial, Helvetica, sans-serif" font-size="${labelSize}" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(unit)}</text>` : ""}
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

function buildStatsGridSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const isVertical = h > w;
  const headerY = isVertical ? 120 : 80;
  const statsStartY = headerY + 120;
  const gap = 16;
  const cols = 2;
  const boxW = (w - gap * 3) / cols;
  const boxH = isVertical ? 130 : 120;

  const stats = [
    { label: "Distance", value: run.distance?.toFixed(2) || "0", unit: "km", color: COLORS.primary },
    { label: "Duration", value: formatDuration(run.duration || 0), unit: "", color: COLORS.primary },
    { label: "Avg Pace", value: run.avgPace || "--:--", unit: "/km", color: COLORS.accent },
    { label: "Heart Rate", value: run.avgHeartRate?.toString() || "--", unit: "bpm", color: COLORS.error },
    { label: "Calories", value: run.calories?.toString() || "--", unit: "kcal", color: COLORS.warning },
    { label: "Elevation", value: Math.round(run.elevationGain || run.elevation || 0).toString(), unit: "m", color: COLORS.success },
  ];

  let boxes = "";
  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = gap + col * (boxW + gap);
    const by = statsStartY + row * (boxH + gap);
    if (by + boxH < h - 60) {
      boxes += buildStatBox(bx, by, boxW, boxH, s.label, s.value, s.unit, s.color);
    }
  });

  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0D1117"/>
        <stop offset="100%" stop-color="#0A0F1A"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    <text x="${w / 2}" y="${headerY}" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(formatDate(run.completedAt))}</text>
    <text x="${w / 2}" y="${headerY + 55}" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${escapeXml(run.distance?.toFixed(2) || "0")} km</text>
    ${userName ? `<text x="${w / 2}" y="${headerY + 85}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(userName)}</text>` : ""}
    ${boxes}
    ${buildWatermark(w, h)}
  `;
}

function buildRouteMapSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const mapH = h > w ? h * 0.55 : h * 0.6;
  const statsY = mapH + 20;
  const gap = 12;
  const statW = (w - gap * 4) / 3;
  const statH = 90;

  const routeSvg = run.gpsTrack && run.gpsTrack.length > 1
    ? buildGpsRoute(20, 20, w - 40, mapH - 40, run.gpsTrack)
    : `<text x="${w / 2}" y="${mapH / 2}" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${COLORS.textMuted}" text-anchor="middle">No GPS data</text>`;

  const stats = [
    { label: "Distance", value: `${run.distance?.toFixed(2) || "0"}`, unit: "km", color: COLORS.primary },
    { label: "Pace", value: run.avgPace || "--:--", unit: "/km", color: COLORS.accent },
    { label: "Time", value: formatDuration(run.duration || 0), unit: "", color: COLORS.primary },
  ];

  let statBoxes = "";
  stats.forEach((s, i) => {
    const sx = gap + i * (statW + gap);
    statBoxes += buildStatBox(sx, statsY, statW, statH, s.label, s.value, s.unit, s.color);
  });

  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0D1117"/>
        <stop offset="100%" stop-color="#0A0F1A"/>
      </linearGradient>
      <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${COLORS.primary}"/>
        <stop offset="100%" stop-color="${COLORS.success}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    ${routeSvg}
    ${statBoxes}
    ${userName ? `<text x="${w / 2}" y="${statsY + statH + 40}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(userName)} • ${escapeXml(formatDate(run.completedAt))}</text>` : ""}
    ${buildWatermark(w, h)}
  `;
}

function buildSplitSummarySvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const headerY = 80;
  const splitsStartY = headerY + 100;
  const rowH = 52;
  const maxSplits = Math.min(run.paceData?.length || 0, Math.floor((h - splitsStartY - 120) / rowH));

  let splitRows = "";
  const paceData = run.paceData || [];
  const paceValues = paceData.map((p) => p.paceSeconds);
  const minPace = Math.min(...paceValues);
  const maxPace = Math.max(...paceValues);
  const paceRange = maxPace - minPace || 1;

  for (let i = 0; i < maxSplits; i++) {
    const split = paceData[i];
    const ry = splitsStartY + i * rowH;
    const barMaxW = w * 0.4;
    const barW = barMaxW * (1 - (split.paceSeconds - minPace) / paceRange * 0.6);
    const paceColor = split.paceSeconds <= minPace + paceRange * 0.33
      ? COLORS.success
      : split.paceSeconds <= minPace + paceRange * 0.66
        ? COLORS.warning
        : COLORS.accent;

    splitRows += `
      <text x="40" y="${ry + 30}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textSecondary}">Km ${split.km}</text>
      <rect x="${w * 0.3}" y="${ry + 10}" width="${barW}" height="28" rx="14" fill="${paceColor}" opacity="0.3"/>
      <rect x="${w * 0.3}" y="${ry + 10}" width="${barW * 0.8}" height="28" rx="14" fill="${paceColor}" opacity="0.6"/>
      <text x="${w - 40}" y="${ry + 30}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="${paceColor}" text-anchor="end">${escapeXml(split.pace)}</text>
    `;

    if (i < maxSplits - 1) {
      splitRows += `<line x1="40" y1="${ry + rowH}" x2="${w - 40}" y2="${ry + rowH}" stroke="${COLORS.border}" stroke-width="1"/>`;
    }
  }

  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0D1117"/>
        <stop offset="100%" stop-color="#0A0F1A"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    <text x="${w / 2}" y="${headerY}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(formatDate(run.completedAt))}</text>
    <text x="${w / 2}" y="${headerY + 50}" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${escapeXml(run.distance?.toFixed(2) || "0")} km — ${escapeXml(formatDuration(run.duration || 0))}</text>
    <text x="${w / 2}" y="${headerY + 80}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle" letter-spacing="2">KM SPLITS</text>
    ${splitRows}
    ${userName ? `<text x="${w / 2}" y="${h - 70}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(userName)}</text>` : ""}
    ${buildWatermark(w, h)}
  `;
}

function buildAchievementSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const centerY = h / 2;
  const circleR = Math.min(w, h) * 0.22;

  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0D1117"/>
        <stop offset="50%" stop-color="#111827"/>
        <stop offset="100%" stop-color="#0A0F1A"/>
      </linearGradient>
      <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${COLORS.primary}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${COLORS.primary}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    <circle cx="${w / 2}" cy="${centerY - 30}" r="${circleR + 40}" fill="url(#glowGrad)"/>
    <circle cx="${w / 2}" cy="${centerY - 30}" r="${circleR}" fill="none" stroke="${COLORS.primary}" stroke-width="4" opacity="0.6"/>
    <circle cx="${w / 2}" cy="${centerY - 30}" r="${circleR - 8}" fill="none" stroke="${COLORS.primary}" stroke-width="2" opacity="0.3"/>
    <text x="${w / 2}" y="${centerY - 60}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle" letter-spacing="3">RUN COMPLETE</text>
    <text x="${w / 2}" y="${centerY}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${escapeXml(run.distance?.toFixed(2) || "0")}</text>
    <text x="${w / 2}" y="${centerY + 35}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${COLORS.primary}" text-anchor="middle">KILOMETERS</text>
    <text x="${w * 0.25}" y="${centerY + circleR + 60}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle">PACE</text>
    <text x="${w * 0.25}" y="${centerY + circleR + 90}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${COLORS.accent}" text-anchor="middle">${escapeXml(run.avgPace || "--:--")}</text>
    <text x="${w * 0.5}" y="${centerY + circleR + 60}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle">TIME</text>
    <text x="${w * 0.5}" y="${centerY + circleR + 90}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${COLORS.primary}" text-anchor="middle">${escapeXml(formatDuration(run.duration || 0))}</text>
    <text x="${w * 0.75}" y="${centerY + circleR + 60}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textMuted}" text-anchor="middle">AVG HR</text>
    <text x="${w * 0.75}" y="${centerY + circleR + 90}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${COLORS.error}" text-anchor="middle">${run.avgHeartRate || "--"}</text>
    ${userName ? `<text x="${w / 2}" y="${centerY - circleR - 50}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600" fill="${COLORS.text}" text-anchor="middle">${escapeXml(userName)}</text>` : ""}
    <text x="${w / 2}" y="${centerY - circleR - 25}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(formatDate(run.completedAt))}</text>
    ${buildWatermark(w, h)}
  `;
}

function buildMinimalSvg(w: number, h: number, run: RunDataForImage, userName?: string): string {
  const centerY = h / 2;

  return `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0A0F1A"/>
        <stop offset="40%" stop-color="#111827"/>
        <stop offset="100%" stop-color="#0D1117"/>
      </linearGradient>
      <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${COLORS.primary}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${COLORS.primary}"/>
        <stop offset="100%" stop-color="${COLORS.primary}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    <line x1="${w * 0.15}" y1="${centerY - 70}" x2="${w * 0.85}" y2="${centerY - 70}" stroke="url(#accentLine)" stroke-width="2"/>
    <text x="${w / 2}" y="${centerY - 20}" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="700" fill="${COLORS.text}" text-anchor="middle">${escapeXml(run.distance?.toFixed(2) || "0")}</text>
    <text x="${w / 2}" y="${centerY + 30}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${COLORS.primary}" text-anchor="middle" letter-spacing="6">KILOMETERS</text>
    <line x1="${w * 0.15}" y1="${centerY + 60}" x2="${w * 0.85}" y2="${centerY + 60}" stroke="url(#accentLine)" stroke-width="2"/>
    <text x="${w * 0.33}" y="${centerY + 110}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(formatDuration(run.duration || 0))}</text>
    <text x="${w * 0.66}" y="${centerY + 110}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${COLORS.textMuted}" text-anchor="middle">${escapeXml(run.avgPace || "--:--")} /km</text>
    ${userName ? `<text x="${w / 2}" y="${centerY - 100}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(userName)} • ${escapeXml(formatDate(run.completedAt))}</text>` : `<text x="${w / 2}" y="${centerY - 100}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="${COLORS.textSecondary}" text-anchor="middle">${escapeXml(formatDate(run.completedAt))}</text>`}
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

  const buffer = await sharp(Buffer.from(fullSvg)).png({ quality: 95 }).toBuffer();
  return buffer;
}
