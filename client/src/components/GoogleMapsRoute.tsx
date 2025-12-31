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
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
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
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry,places`;
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

      // Add start marker
      new window.google.maps.Marker({
        position: center,
        map,
        title: "Start / End",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        zIndex: 100,
      });

      if (waypoints && waypoints.length > 0) {
        // Use Directions API to get road-following route
        const directionsService = new window.google.maps.DirectionsService();
        const directionsRenderer = new window.google.maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: "#a855f7",
            strokeOpacity: 0.9,
            strokeWeight: 5,
          },
        });

        // Create waypoints for Directions API (exclude first and last as they're origin/destination)
        const intermediateWaypoints = waypoints.slice(0, -1).map((wp) => ({
          location: new window.google.maps.LatLng(wp.lat, wp.lng),
          stopover: false,
        }));

        const request = {
          origin: center,
          destination: center, // Round trip back to start
          waypoints: intermediateWaypoints,
          travelMode: window.google.maps.TravelMode.WALKING,
          optimizeWaypoints: false,
        };

        directionsService.route(request, (result: any, status: any) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
            
            // Calculate total distance and duration
            let totalDistance = 0;
            let totalDuration = 0;
            result.routes[0].legs.forEach((leg: any) => {
              totalDistance += leg.distance.value;
              totalDuration += leg.duration.value;
            });
            
            setRouteInfo({
              distance: (totalDistance / 1000).toFixed(2) + " km",
              duration: Math.round(totalDuration / 60) + " min",
            });
          } else {
            // Fallback to simple polyline if Directions fails
            console.log("Directions request failed:", status);
            drawSimpleRoute(map, center, waypoints);
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }

    function drawSimpleRoute(map: any, center: Waypoint, waypoints: Waypoint[]) {
      const routePath = [
        center,
        ...waypoints,
        center,
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
      {(routeName || routeInfo) && (
        <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 border border-white/10">
          {routeName && <h3 className="font-bold text-sm text-foreground">{routeName}</h3>}
          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
            {routeInfo ? (
              <>
                <span>{routeInfo.distance}</span>
                <span>{routeInfo.duration} walking</span>
              </>
            ) : (
              <>
                {distance && <span>{distance.toFixed(1)} km</span>}
                {estimatedTime && <span>{estimatedTime} min</span>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
