import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Waypoint {
  lat: number;
  lng: number;
}

interface GoogleMapsRouteProps {
  waypoints: Waypoint[];
  startLat: number;
  startLng: number;
  routeName?: string;
  distance?: number;
  estimatedTime?: number;
  className?: string;
}

declare global {
  interface Window {
    google: any;
    initGoogleMaps: () => void;
  }
}

export default function GoogleMapsRoute({
  waypoints,
  startLat,
  startLng,
  routeName,
  distance,
  estimatedTime,
  className = "",
}: GoogleMapsRouteProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGoogleMaps() {
      try {
        const res = await fetch("/api/config/maps-key");
        if (!res.ok) {
          throw new Error("Failed to get Google Maps API key");
        }
        const { apiKey } = await res.json();

        if (window.google?.maps) {
          if (isMounted) initMap();
          return;
        }

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) initMap();
        };
        script.onerror = () => {
          if (isMounted) setError("Failed to load Google Maps");
        };
        document.head.appendChild(script);
      } catch (err) {
        if (isMounted) setError("Failed to initialize map");
      }
    }

    function initMap() {
      if (!mapRef.current || !window.google) return;

      const center = { lat: startLat, lng: startLng };
      
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 14,
        mapTypeId: "roadmap",
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: true,
      });

      mapInstanceRef.current = map;

      new window.google.maps.Marker({
        position: center,
        map,
        title: "Start / End",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });

      if (waypoints && waypoints.length > 0) {
        const routePath = [
          { lat: startLat, lng: startLng },
          ...waypoints,
          { lat: startLat, lng: startLng },
        ];

        new window.google.maps.Polyline({
          path: routePath,
          geodesic: true,
          strokeColor: "#a855f7",
          strokeOpacity: 0.9,
          strokeWeight: 4,
          map,
        });

        waypoints.forEach((waypoint, index) => {
          new window.google.maps.Marker({
            position: waypoint,
            map,
            title: `Waypoint ${index + 1}`,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#a855f7",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
        });

        const bounds = new window.google.maps.LatLngBounds();
        routePath.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, 50);
      }

      setLoading(false);
    }

    loadGoogleMaps();

    return () => {
      isMounted = false;
    };
  }, [waypoints, startLat, startLng]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-card/50 rounded-xl border border-white/10 ${className}`}>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className={`relative rounded-xl overflow-hidden border border-white/10 ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className="w-full h-full min-h-[300px]" />
      {routeName && (
        <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 border border-white/10">
          <h3 className="font-bold text-sm text-foreground">{routeName}</h3>
          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
            {distance && <span>{distance.toFixed(1)} km</span>}
            {estimatedTime && <span>{estimatedTime} min</span>}
          </div>
        </div>
      )}
    </div>
  );
}
