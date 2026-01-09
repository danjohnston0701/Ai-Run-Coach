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
  polyline?: string;
  className?: string;
}

declare global {
  interface Window {
    google: any;
    initGoogleMaps: () => void;
    googleMapsLoading: Promise<void> | null;
  }
}

export default function GoogleMapsRoute({
  waypoints,
  startLat,
  startLng,
  routeName,
  distance,
  polyline,
  className = "",
}: GoogleMapsRouteProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string } | null>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGoogleMaps() {
      try {
        if (window.google?.maps) {
          if (isMounted) {
            setTimeout(() => initMap(), 50);
          }
          return;
        }

        if (window.googleMapsLoading) {
          try {
            await window.googleMapsLoading;
            if (isMounted) {
              setTimeout(() => initMap(), 50);
            }
            return;
          } catch {
            window.googleMapsLoading = null;
          }
        }

        const res = await fetch("/api/config/maps-key");
        if (!res.ok) {
          throw new Error("Failed to get Google Maps API key");
        }
        const { apiKey } = await res.json();

        window.googleMapsLoading = new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry,places,routes`;
          script.async = true;
          script.defer = true;
          script.onload = () => {
            resolve();
          };
          script.onerror = () => {
            window.googleMapsLoading = null;
            reject(new Error("Failed to load Google Maps"));
          };
          document.head.appendChild(script);
        });

        await window.googleMapsLoading;
        if (isMounted) {
          setTimeout(() => initMap(), 50);
        }
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

      if (polyline && polyline.length > 0) {
        console.log("Using pre-computed polyline from backend");
        
        const decodedPath = window.google.maps.geometry.encoding.decodePath(polyline);
        
        // Create gradient segments from blue (start) to green (finish)
        const totalPoints = decodedPath.length;
        const numSegments = Math.min(totalPoints - 1, 100); // Limit segments for performance
        const step = Math.max(1, Math.floor((totalPoints - 1) / numSegments));
        
        for (let i = 0; i < totalPoints - 1; i += step) {
          const endIdx = Math.min(i + step, totalPoints - 1);
          const progress = i / (totalPoints - 1);
          
          // Interpolate from blue (#3b82f6) to green (#22c55e)
          const r = Math.round(59 + progress * (34 - 59));
          const g = Math.round(130 + progress * (197 - 130));
          const b = Math.round(246 + progress * (94 - 246));
          const color = `rgb(${r},${g},${b})`;
          
          const segmentPath = decodedPath.slice(i, endIdx + 1);
          
          new window.google.maps.Polyline({
            path: segmentPath,
            geodesic: true,
            strokeColor: color,
            strokeOpacity: 0.9,
            strokeWeight: 5,
            map,
          });
        }
        
        const bounds = new window.google.maps.LatLngBounds();
        decodedPath.forEach((point: any) => bounds.extend(point));
        bounds.extend(center);
        map.fitBounds(bounds);
        
        if (distance) {
          setRouteInfo({
            distance: distance.toFixed(2) + " km",
          });
        }
        setLoading(false);
      } else if (waypoints && waypoints.length > 0) {
        console.log("No polyline provided, calculating route from waypoints:", waypoints);
        
        // Filter out duplicate waypoints and those too close to start
        const validWaypoints = waypoints.filter((wp, index) => {
          if (typeof wp.lat !== 'number' || typeof wp.lng !== 'number') return false;
          if (isNaN(wp.lat) || isNaN(wp.lng)) return false;
          
          const distFromStart = Math.sqrt(
            Math.pow((wp.lat - startLat) * 111000, 2) + 
            Math.pow((wp.lng - startLng) * 111000 * Math.cos(startLat * Math.PI / 180), 2)
          );
          if (distFromStart < 10) return false;
          
          for (let i = 0; i < index; i++) {
            if (Math.abs(waypoints[i].lat - wp.lat) < 0.0001 && 
                Math.abs(waypoints[i].lng - wp.lng) < 0.0001) {
              return false;
            }
          }
          return true;
        });
        
        console.log("Valid waypoints after filtering:", validWaypoints);
        
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

        const intermediateWaypoints = validWaypoints.map((wp) => ({
          location: new window.google.maps.LatLng(wp.lat, wp.lng),
          stopover: false,
        }));

        const request = {
          origin: center,
          destination: center,
          waypoints: intermediateWaypoints,
          travelMode: window.google.maps.TravelMode.WALKING,
          optimizeWaypoints: false,
          provideRouteAlternatives: false,
        };

        console.log("Calling Directions API with request:", {
          origin: center,
          destination: center,
          waypointsCount: intermediateWaypoints.length,
          travelMode: "WALKING"
        });
        
        directionsService.route(request, (result: any, status: any) => {
          console.log("Directions API response status:", status);
          if (status === "REQUEST_DENIED") {
            console.error("Directions API request denied - please enable Directions API in Google Cloud Console");
            setError("Directions API not enabled. Please enable it in Google Cloud Console.");
          }
          if (status === window.google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
            
            let totalDistance = 0;
            let totalDuration = 0;
            result.routes[0].legs.forEach((leg: any) => {
              totalDistance += leg.distance.value;
              totalDuration += leg.duration.value;
            });
            
            setRouteInfo({
              distance: (totalDistance / 1000).toFixed(2) + " km",
            });
            setLoading(false);
          } else {
            console.log("Full route failed, trying simplified route:", status);
            const simplifiedWaypoints = validWaypoints.length > 2 
              ? [validWaypoints[Math.floor(validWaypoints.length / 2)]]
              : [];
            
            const simpleRequest = {
              origin: center,
              destination: center,
              waypoints: simplifiedWaypoints.map(wp => ({
                location: new window.google.maps.LatLng(wp.lat, wp.lng),
                stopover: false,
              })),
              travelMode: window.google.maps.TravelMode.WALKING,
            };
            
            directionsService.route(simpleRequest, (simpleResult: any, simpleStatus: any) => {
              if (simpleStatus === window.google.maps.DirectionsStatus.OK) {
                directionsRenderer.setDirections(simpleResult);
                let totalDistance = 0;
                let totalDuration = 0;
                simpleResult.routes[0].legs.forEach((leg: any) => {
                  totalDistance += leg.distance.value;
                  totalDuration += leg.duration.value;
                });
                setRouteInfo({
                  distance: (totalDistance / 1000).toFixed(2) + " km",
                });
              } else {
                console.log("Simplified route also failed:", simpleStatus);
                drawSimpleRoute(map, center, validWaypoints);
              }
              setLoading(false);
            });
          }
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
      <div ref={mapRef} className="w-full h-full" style={{ minHeight: '100%' }} />
    </div>
  );
}
