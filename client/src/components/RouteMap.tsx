import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface RouteMapProps {
  lat: number;
  lng: number;
  level: "beginner" | "moderate" | "expert";
  distance: number;
  routePolyline?: string;
  routeWaypoints?: Array<{ lat: number; lng: number }>;
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

function generateRouteCoordinates(lat: number, lng: number, level: string, distance: number): [number, number][] {
  const coordinates: [number, number][] = [[lat, lng]];
  const step = 0.001;
  let currentLat = lat;
  let currentLng = lng;
  
  const steps = Math.ceil((distance * 1000) / 100);
  
  for (let i = 1; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2 * (level === "expert" ? 3 : level === "moderate" ? 2 : 1);
    
    currentLat += Math.sin(angle) * step + (Math.random() - 0.5) * 0.0002;
    currentLng += Math.cos(angle) * step + (Math.random() - 0.5) * 0.0002;
    
    coordinates.push([currentLat, currentLng] as [number, number]);
  }
  
  return coordinates;
}

export function RouteMap({ lat, lng, level, distance, routePolyline, routeWaypoints }: RouteMapProps) {
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

    // Use provided route polyline or generate mock route
    const route = routePolyline 
      ? decodePolyline(routePolyline)
      : generateRouteCoordinates(lat, lng, level, distance);
    
    const lineColor = level === "expert" ? "#ef4444" : level === "moderate" ? "#eab308" : "#22c55e";
    
    const polyline = L.polyline(route, {
      color: lineColor,
      weight: 4,
      opacity: 0.8,
      dashArray: level === "expert" ? "10,5" : undefined,
      className: "animate-pulse"
    }).addTo(map.current);

    // Add start marker using first point from route
    const startCoords = route[0] as [number, number];
    const startMarker = L.circleMarker(startCoords, {
      radius: 8,
      fillColor: "#06b6d4",
      color: "#06b6d4",
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(map.current).bindPopup("Start");

    // Add end marker
    const endCoords = route[route.length - 1] as [number, number];
    const endMarker = L.circleMarker(endCoords, {
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
      polyline.remove();
      startMarker.remove();
      endMarker.remove();
    };
  }, [lat, lng, level, distance, routePolyline]);

  return (
    <div 
      ref={mapContainer} 
      className="w-full h-full rounded-lg border border-white/10 overflow-hidden"
      data-testid="map-route"
    />
  );
}
