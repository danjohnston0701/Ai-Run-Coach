import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface RouteMapProps {
  lat: number;
  lng: number;
  level: "beginner" | "moderate" | "expert";
  distance: number;
}

// Generate mock route coordinates based on starting point and difficulty
function generateRouteCoordinates(lat: number, lng: number, level: string, distance: number): [number, number][] {
  const coordinates: [number, number][] = [[lat, lng]];
  const step = 0.001; // ~100m per step
  let currentLat = lat;
  let currentLng = lng;
  
  const steps = Math.ceil((distance * 1000) / 100);
  
  for (let i = 1; i < steps; i++) {
    // Generate wavy path
    const angle = (i / steps) * Math.PI * 2 * (level === "expert" ? 3 : level === "moderate" ? 2 : 1);
    const radius = level === "beginner" ? 0.002 : level === "moderate" ? 0.003 : 0.004;
    
    currentLat += Math.sin(angle) * step + (Math.random() - 0.5) * 0.0002;
    currentLng += Math.cos(angle) * step + (Math.random() - 0.5) * 0.0002;
    
    coordinates.push([currentLat, currentLng] as [number, number]);
  }
  
  return coordinates;
}

export function RouteMap({ lat, lng, level, distance }: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map
    if (!map.current) {
      map.current = L.map(mapContainer.current).setView([lat, lng], 14);
      
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        className: "grayscale-[1] brightness-[0.8] contrast-[1.2]",
      }).addTo(map.current);
    }

    // Generate and draw route
    const route = generateRouteCoordinates(lat, lng, level, distance);
    
    const lineColor = level === "expert" ? "#ef4444" : level === "moderate" ? "#eab308" : "#22c55e";
    
    const polyline = L.polyline(route, {
      color: lineColor,
      weight: 4,
      opacity: 0.8,
      dashArray: level === "expert" ? "10,5" : undefined,
      className: "animate-pulse"
    }).addTo(map.current);

    // Add start marker
    L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: "#06b6d4",
      color: "#06b6d4",
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(map.current).bindPopup("Start");

    // Add end marker
    const endCoords = route[route.length - 1] as [number, number];
    L.circleMarker(endCoords, {
      radius: 8,
      fillColor: lineColor,
      color: lineColor,
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(map.current).bindPopup("Finish");

    // Fit bounds
    map.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });

    return () => {
      // Cleanup polyline and markers on unmount
      polyline.remove();
    };
  }, [lat, lng, level, distance]);

  return (
    <div 
      ref={mapContainer} 
      className="w-full h-full rounded-lg border border-white/10 overflow-hidden"
      data-testid="map-route"
    />
  );
}
