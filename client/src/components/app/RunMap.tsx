import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RoutePoint, StrugglePoint } from "@/lib/types";
import { segmentSpeeds } from "@/lib/series";
import { cn } from "@/lib/utils";

// OSM standard tiles (same source as the live viewer), darkened in CSS (.arc-dark-tiles in index.css).
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** slow → fast: orange → amber → green → cyan */
function speedColor(t: number) {
  const stops = [
    [255, 107, 53],
    [255, 179, 0],
    [0, 230, 118],
    [0, 212, 255],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function dot(color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #0a0f1a;box-shadow:0 0 0 2px ${color}55,0 4px 12px rgba(0,0,0,.5);display:grid;place-items:center;color:#0a0f1a;font:700 9px Inter,sans-serif">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function RunMap({
  points,
  struggles,
  colorByPace = true,
  className,
  interactive = true,
  polyline,
}: {
  points: RoutePoint[];
  struggles?: StrugglePoint[];
  colorByPace?: boolean;
  className?: string;
  interactive?: boolean;
  /** Plain [lat,lng] path (e.g. a planned route) when there are no recorded points. */
  polyline?: [number, number][];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, {
      zoomControl: interactive,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: false,
      keyboard: interactive,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, className: "arc-dark-tiles" }).addTo(map);

    const latlngs: [number, number][] = points.length > 1 ? points.map((p) => [p.latitude, p.longitude]) : polyline ?? [];
    if (latlngs.length < 2) {
      map.setView([0, 0], 1);
      return () => {
        map.remove();
      };
    }

    // Glow underlay
    L.polyline(latlngs, { color: "#00d4ff", weight: 10, opacity: 0.12, lineCap: "round", lineJoin: "round" }).addTo(map);

    const speeds = colorByPace && points.length > 1 ? segmentSpeeds(points) : [];
    const valid = speeds.filter((s): s is number => s != null && s > 0.3 && s < 12).sort((a, b) => a - b);
    if (valid.length > 10) {
      const lo = valid[Math.floor(valid.length * 0.05)];
      const hi = valid[Math.floor(valid.length * 0.95)];
      // Draw in short runs of same-colour buckets to keep the layer count low.
      let start = 0;
      let bucket = -1;
      const flush = (end: number) => {
        if (end - start < 1 || bucket < 0) return;
        L.polyline(latlngs.slice(start, end + 1), { color: speedColor(bucket / 10), weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(map);
      };
      for (let i = 0; i < speeds.length; i++) {
        const s = speeds[i];
        const t = s == null ? 0.5 : (s - lo) / Math.max(0.01, hi - lo);
        const b = Math.round(Math.max(0, Math.min(1, t)) * 10);
        if (b !== bucket) {
          flush(i);
          start = i;
          bucket = b;
        }
      }
      flush(speeds.length);
    } else {
      L.polyline(latlngs, { color: "#00d4ff", weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(map);
    }

    L.marker(latlngs[0], { icon: dot("#00e676", ""), interactive: false }).addTo(map);
    L.marker(latlngs[latlngs.length - 1], { icon: dot("#ff6b35", ""), interactive: false }).addTo(map);

    (struggles ?? []).forEach((sp: any) => {
      const loc = sp.location;
      if (loc?.latitude && loc?.longitude) {
        L.marker([loc.latitude, loc.longitude], { icon: dot("#ffb300", "!") })
          .bindTooltip(`Pace dropped to ${sp.paceAtStruggle ?? "?"}${sp.userComment ? ` — ${sp.userComment}` : ""}`)
          .addTo(map);
      }
    });

    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [28, 28] });
    // Containers that animate in (dialogs) start at 0×0: refit until the user moves the map.
    let userMoved = false;
    const markMoved = () => (userMoved = true);
    ref.current.addEventListener("pointerdown", markMoved, { once: true });
    ref.current.addEventListener("wheel", markMoved, { once: true });
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (!userMoved) map.fitBounds(bounds, { padding: [28, 28], animate: false });
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, [points, struggles, colorByPace, interactive, polyline]);

  return <div ref={ref} className={cn("h-full w-full overflow-hidden", className)} />;
}

export function PaceLegend() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-3">
      <span>Slower</span>
      <span className="h-1.5 w-20 rounded-full" style={{ background: "linear-gradient(90deg,#ff6b35,#ffb300,#00e676,#00d4ff)" }} />
      <span>Faster</span>
    </div>
  );
}
