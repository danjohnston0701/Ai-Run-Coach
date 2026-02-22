import logoUrl from "@/assets/logo-transparent.png";
import type { RunData } from "@/pages/RunHistory";

interface ShareImageOptions {
  run: RunData;
  routeCoords?: { lat: number; lng: number }[];
  format?: "post" | "story";
}

const COLORS = {
  background: "#09090b",
  primary: "#B4F481",
  text: "#ffffff",
  muted: "#64748b",
  card: "#1a1a1d",
};

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawRouteOnCanvas(
  ctx: CanvasRenderingContext2D,
  coords: { lat: number; lng: number }[],
  bounds: { x: number; y: number; width: number; height: number }
) {
  if (!coords || coords.length < 2) return;

  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;
  const padding = 30;

  const scaleX = (bounds.width - padding * 2) / lngRange;
  const scaleY = (bounds.height - padding * 2) / latRange;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = bounds.x + (bounds.width - lngRange * scale) / 2;
  const offsetY = bounds.y + (bounds.height - latRange * scale) / 2;

  ctx.beginPath();
  ctx.strokeStyle = COLORS.primary;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  coords.forEach((coord, i) => {
    const x = offsetX + (coord.lng - minLng) * scale;
    const y = offsetY + (maxLat - coord.lat) * scale;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  const startX = offsetX + (coords[0].lng - minLng) * scale;
  const startY = offsetY + (maxLat - coords[0].lat) * scale;
  ctx.beginPath();
  ctx.arc(startX, startY, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#22c55e";
  ctx.fill();

  const endCoord = coords[coords.length - 1];
  const endX = offsetX + (endCoord.lng - minLng) * scale;
  const endY = offsetY + (maxLat - endCoord.lat) * scale;
  ctx.beginPath();
  ctx.arc(endX, endY, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function generateShareImage(
  options: ShareImageOptions
): Promise<Blob> {
  const { run, routeCoords, format = "post" } = options;

  const isStory = format === "story";
  const width = isStory ? 1080 : 1080;
  const height = isStory ? 1920 : 1080;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 3,
    0,
    width / 2,
    height / 3,
    width
  );
  gradient.addColorStop(0, "rgba(180, 244, 129, 0.08)");
  gradient.addColorStop(1, "rgba(180, 244, 129, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const mapBounds = isStory
    ? { x: 60, y: 200, width: width - 120, height: 600 }
    : { x: 60, y: 180, width: 500, height: 400 };

  drawRoundedRect(
    ctx,
    mapBounds.x,
    mapBounds.y,
    mapBounds.width,
    mapBounds.height,
    24
  );
  ctx.fillStyle = COLORS.card;
  ctx.fill();

  if (routeCoords && routeCoords.length > 1) {
    drawRouteOnCanvas(ctx, routeCoords, mapBounds);
  } else {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "bold 24px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "Route Map",
      mapBounds.x + mapBounds.width / 2,
      mapBounds.y + mapBounds.height / 2
    );
  }

  const statsStartY = isStory ? 880 : 180;
  const statsStartX = isStory ? 60 : 620;
  const statWidth = isStory ? (width - 180) / 2 : 180;
  const statHeight = 140;
  const statGap = 30;

  const stats = [
    { label: "DISTANCE", value: `${run.distance.toFixed(2)}`, unit: "km" },
    { label: "TIME", value: formatDuration(run.totalTime), unit: "" },
    { label: "PACE", value: run.avgPace, unit: "/km" },
    {
      label: "DIFFICULTY",
      value: run.difficulty.toUpperCase(),
      unit: "",
      highlight: true,
    },
  ];

  stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = statsStartX + col * (statWidth + statGap);
    const y = statsStartY + row * (statHeight + statGap);

    drawRoundedRect(ctx, x, y, statWidth, statHeight, 16);
    ctx.fillStyle = stat.highlight
      ? "rgba(180, 244, 129, 0.1)"
      : "rgba(255, 255, 255, 0.03)";
    ctx.fill();
    ctx.strokeStyle = stat.highlight
      ? "rgba(180, 244, 129, 0.3)"
      : "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "bold 14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(stat.label, x + statWidth / 2, y + 35);

    ctx.fillStyle = stat.highlight ? COLORS.primary : COLORS.text;
    ctx.font = "bold 36px Inter, system-ui, sans-serif";
    ctx.fillText(stat.value, x + statWidth / 2, y + 85);

    if (stat.unit) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "bold 18px Inter, system-ui, sans-serif";
      ctx.fillText(stat.unit, x + statWidth / 2, y + 115);
    }
  });

  const brandingY = isStory ? height - 200 : height - 120;

  try {
    const logo = await loadImage(logoUrl);
    const logoSize = 80;
    const logoX = width / 2 - logoSize / 2;
    ctx.drawImage(logo, logoX, brandingY, logoSize, logoSize);

    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 32px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AI RUN COACH", width / 2, brandingY + logoSize + 40);
  } catch {
    ctx.fillStyle = COLORS.primary;
    ctx.font = "bold 48px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AI RUN COACH", width / 2, brandingY + 50);
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = "16px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(run.date, width / 2, isStory ? 100 : 80);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to generate image"));
        }
      },
      "image/png",
      1.0
    );
  });
}

export async function shareToSocialMedia(
  options: ShareImageOptions,
  platform: "facebook" | "instagram" | "native"
): Promise<void> {
  const imageBlob = await generateShareImage(options);
  const file = new File([imageBlob], "run-summary.png", { type: "image/png" });

  if (platform === "native" && navigator.share && navigator.canShare) {
    const shareData = {
      title: "My Run with AI Run Coach",
      text: `I just completed a ${options.run.distance.toFixed(1)}km run in ${formatDuration(options.run.totalTime)}! Average pace: ${options.run.avgPace}/km`,
      files: [file],
    };

    if (navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return;
    }
  }

  const url = URL.createObjectURL(imageBlob);

  if (platform === "facebook") {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(`I just completed a ${options.run.distance.toFixed(1)}km run with AI Run Coach! Average pace: ${options.run.avgPace}/km`)}`,
      "_blank",
      "width=600,height=400"
    );
    downloadImage(url, "run-summary.png");
  } else if (platform === "instagram") {
    downloadImage(url, "run-summary.png");
  } else {
    downloadImage(url, "run-summary.png");
  }
}

function downloadImage(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function downloadShareImage(
  options: ShareImageOptions
): Promise<void> {
  const imageBlob = await generateShareImage(options);
  const url = URL.createObjectURL(imageBlob);
  downloadImage(url, `run-${options.run.id}.png`);
}
