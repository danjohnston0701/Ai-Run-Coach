import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Flame, Mountain, Footprints, Play, MapPin, Loader, History, ArrowRight, Timer, Bell, Menu, User, X, RotateCcw, Mic, Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { RunData } from "./RunHistory";
import { loadActiveRunSession, clearActiveRunSession, type ActiveRunSession } from "@/lib/activeRunSession";
import { loadCoachSettings, saveCoachSettings, type AiCoachSettings, type CoachGender, type CoachAccent, type CoachTone, accentLabels, toneLabels, toneDescriptions, defaultSettings } from "@/lib/coachSettings";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isSafari() {
  const ua = navigator.userAgent;
  return /^((?!chrome|android).)*safari/i.test(ua);
}

function isIOSSafari() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
}

function isStandalonePWA() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         (window.navigator as any).standalone === true;
}

interface PushResult {
  success: boolean;
  error?: 'safari_requires_homescreen' | 'not_supported' | 'not_configured' | 'permission_denied' | 'failed';
}

async function registerPushSubscription(userId: string): Promise<PushResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push] Push notifications not supported');
    
    if (isIOSSafari() && !isStandalonePWA()) {
      return { success: false, error: 'safari_requires_homescreen' };
    }
    return { success: false, error: 'not_supported' };
  }

  try {
    console.log('[Push] Checking server configuration...');
    const statusRes = await fetch('/api/push/status');
    const { configured } = await statusRes.json();
    if (!configured) {
      console.log('[Push] Push notifications not configured on server');
      return { success: false, error: 'not_configured' };
    }

    console.log('[Push] Getting VAPID key...');
    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) {
      console.log('[Push] Could not get VAPID key');
      return { success: false, error: 'not_configured' };
    }
    const { vapidPublicKey } = await keyRes.json();
    console.log('[Push] Got VAPID key');

    console.log('[Push] Registering service worker...');
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('[Push] Service worker registered, waiting for ready...');
    await navigator.serviceWorker.ready;
    console.log('[Push] Service worker ready');

    console.log('[Push] Requesting notification permission...');
    const permission = await Notification.requestPermission();
    console.log('[Push] Permission result:', permission);
    if (permission !== 'granted') {
      console.log('[Push] Notification permission denied');
      return { success: false, error: 'permission_denied' };
    }

    console.log('[Push] Subscribing to push manager...');
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    console.log('[Push] Got push subscription');

    console.log('[Push] Saving subscription to server...');
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
    });
    
    if (!saveRes.ok) {
      console.error('[Push] Failed to save subscription to server');
      return { success: false, error: 'failed' };
    }

    console.log('[Push] Successfully subscribed');
    return { success: true };
  } catch (error) {
    console.error('[Push] Registration failed:', error);
    return { success: false, error: 'failed' };
  }
}

import mapBeginner from "@assets/generated_images/dark_mode_map_with_flat_green_route.png";
import mapModerate from "@assets/generated_images/dark_mode_map_with_yellow_moderate_route.png";
import mapExpert from "@assets/generated_images/dark_mode_map_with_red_expert_route.png";

const LEVELS = [
  {
    id: "beginner",
    title: "Beginner",
    description: "Flat terrain, easy pace",
    icon: Footprints,
    color: "text-green-400",
    image: mapBeginner,
    stats: "50m Elev • Mixed"
  },
  {
    id: "moderate",
    title: "Moderate",
    description: "Mixed terrain, some inclines",
    icon: Mountain,
    color: "text-yellow-400",
    image: mapModerate,
    stats: "150m Elev • Mixed"
  },
  {
    id: "expert",
    title: "Expert",
    description: "Steep hills, stairs, technical",
    icon: Flame,
    color: "text-red-500",
    image: mapExpert,
    stats: "400m Elev • Trail/Stairs"
  }
];

interface UserProfile {
  id?: string;
  name: string;
  coachName: string;
  profilePic?: string;
  isAdmin?: boolean;
}

export default function Home() {
  const [distance, setDistance] = useState([5]);
  const [selectedLevel, setSelectedLevel] = useState("moderate");
  const [, setLocation] = useLocation();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState("");
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{description: string; placeId: string}>>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [customLat, setCustomLat] = useState("");
  const [customLng, setCustomLng] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lastRun, setLastRun] = useState<RunData | null>(null);
  const [targetTimeActive, setTargetTimeActive] = useState(false);
  const [targetTime, setTargetTime] = useState({ h: "0", m: "30", s: "00" });
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveRunSession | null>(null);
  const [coachSettingsOpen, setCoachSettingsOpen] = useState(false);
  const [coachSettings, setCoachSettings] = useState<AiCoachSettings>(defaultSettings);

  useEffect(() => {
    setCoachSettings(loadCoachSettings());
  }, []);

  useEffect(() => {
    const session = loadActiveRunSession();
    if (session) {
      setActiveSession(session);
    }
  }, []);

  const handleResumeRun = () => {
    if (activeSession) {
      setLocation(`/run?resume=true`);
    }
  };

  const handleDiscardSession = () => {
    clearActiveRunSession();
    setActiveSession(null);
    toast.success("Previous run session discarded");
  };

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['/api/notifications/unread-count', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const res = await fetch(`/api/notifications/unread-count?userId=${profile.id}`);
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count || 0;
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
    staleTime: 0,
  });

  interface RecentRoute {
    id: string;
    name: string;
    distance: number;
    difficulty: string;
    startLocationLabel?: string;
    elevationGain?: number;
    createdAt: string;
    lastStartedAt?: string;
    startLat: number;
    startLng: number;
    polyline?: string;
  }

  const { data: recentRoutes = [], isLoading: routesLoading } = useQuery<RecentRoute[]>({
    queryKey: ['/api/routes/recent'],
    queryFn: async () => {
      const res = await fetch('/api/routes/recent?limit=4');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
      case 'beginner':
        return 'text-green-400 border-green-400/30 bg-green-400/10';
      case 'moderate':
        return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
      case 'hard':
      case 'expert':
        return 'text-red-400 border-red-400/30 bg-red-400/10';
      default:
        return 'text-primary border-primary/30 bg-primary/10';
    }
  };

  const handleSelectRoute = async (route: RecentRoute) => {
    // Mark route as started
    try {
      await fetch(`/api/routes/${route.id}/start`, { method: 'POST' });
    } catch (err) {
      console.log("Failed to mark route started:", err);
    }
    
    const targetSeconds = parseInt(targetTime.h || "0") * 3600 + parseInt(targetTime.m || "0") * 60 + parseInt(targetTime.s || "0");
    const params = new URLSearchParams({
      routeId: route.id,
      distance: route.distance.toString(),
      level: route.difficulty,
      lat: route.startLat.toString(),
      lng: route.startLng.toString(),
      targetTime: targetSeconds.toString(),
    });
    setLocation(`/run?${params.toString()}`);
  };

  const formatLastStarted = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Last run: Today";
    if (diffDays === 1) return "Last run: Yesterday";
    if (diffDays < 7) return `Last run: ${diffDays} days ago`;
    return `Last run: ${date.toLocaleDateString()}`;
  };

  // Update target time when distance changes (default 6 min/km pace)
  useEffect(() => {
    if (!targetTimeActive) {
      const totalSeconds = Math.round(distance[0] * 6 * 60);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      setTargetTime({
        h: hours.toString(),
        m: minutes.toString().padStart(2, '0'),
        s: seconds.toString().padStart(2, '0')
      });
    }
  }, [distance, targetTimeActive]);

  const handleTimeChange = (unit: 'h' | 'm' | 's', value: string) => {
    const cleanValue = value.replace(/\D/g, '').slice(0, 2);
    setTargetTime(prev => ({ ...prev, [unit]: cleanValue }));
  };

  // Dummy previous runs for demonstration
  const dummyRuns: RunData[] = [
    {
      id: "run-1",
      distance: 5.2,
      time: "14:30",
      totalTime: 1725,
      avgPace: "5:32",
      date: "Dec 18, 2024",
      difficulty: "beginner",
      lat: 37.898379,
      lng: 175.484486,
    },
    {
      id: "run-2",
      distance: 8.5,
      time: "08:15",
      totalTime: 2535,
      avgPace: "4:58",
      date: "Dec 15, 2024",
      difficulty: "moderate",
      lat: 37.898379,
      lng: 175.484486,
    },
    {
      id: "run-3",
      distance: 10.3,
      time: "17:45",
      totalTime: 3150,
      avgPace: "5:06",
      date: "Dec 12, 2024",
      difficulty: "expert",
      lat: 37.898379,
      lng: 175.484486,
    },
  ];

  useEffect(() => {
    const userProfile = localStorage.getItem("userProfile");
    if (userProfile) {
      setProfile(JSON.parse(userProfile));
    }

    const runHistory = localStorage.getItem("runHistory");
    if (runHistory) {
      const runs = JSON.parse(runHistory);
      if (runs.length > 0) {
        setLastRun(runs[runs.length - 1]);
      }
    } else {
      // Use dummy data if no history exists
      localStorage.setItem("runHistory", JSON.stringify(dummyRuns));
      setLastRun(dummyRuns[0]);
    }

    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      setLocationLoading(false);
      return;
    }

    // Use watchPosition to get accurate GPS fix (not network-based location)
    const MAX_ACCURACY = 30; // Only accept positions with ≤30m accuracy
    let gotAccuratePosition = false;
    
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const accuracy = position.coords.accuracy;
        console.log(`GPS update: lat=${position.coords.latitude}, lng=${position.coords.longitude}, accuracy=${accuracy.toFixed(1)}m`);
        
        // Reject inaccurate positions (network-based location)
        if (accuracy > MAX_ACCURACY) {
          setLocationError(`Refining GPS signal... (${Math.round(accuracy)}m accuracy)`);
          console.log(`GPS position rejected: accuracy ${accuracy.toFixed(1)}m > ${MAX_ACCURACY}m threshold`);
          return;
        }
        
        // Got accurate position - stop watching
        if (!gotAccuratePosition) {
          gotAccuratePosition = true;
          navigator.geolocation.clearWatch(watchId);
          
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          setCustomLat(loc.lat.toString());
          setCustomLng(loc.lng.toString());
          // Save accurate GPS to localStorage
          localStorage.setItem("userGpsLocation", JSON.stringify(loc));
          setLocationLoading(false);
          setLocationError("");
          
          // Fetch address for the coordinates
          try {
            const res = await fetch(`/api/geocode/reverse?lat=${loc.lat}&lng=${loc.lng}`);
            const data = await res.json();
            if (data.address) {
              setUserAddress(data.address);
            }
          } catch (error) {
            console.log("Failed to fetch address:", error);
          }
        }
      },
      async (error) => {
        console.log("GPS location error:", error.code, error.message);
        navigator.geolocation.clearWatch(watchId);
        
        // Show toast for permission denied (only once per session)
        if (error.code === 1) {
          const locationToastShown = sessionStorage.getItem('locationToastShown');
          if (!locationToastShown) {
            sessionStorage.setItem('locationToastShown', 'true');
            if (isIOSSafari()) {
              toast.error('Location blocked. Open iPhone Settings → Privacy & Security → Location Services → Safari Websites → set to "While Using"', {
                duration: 10000,
              });
            } else if (isSafari()) {
              toast.error('Location access denied. Click Safari → Settings for this website → Allow Location, then refresh this page', {
                duration: 8000,
              });
            } else {
              toast.error('Location access denied. Please enable location in your browser settings and refresh the page.', {
                duration: 6000,
              });
            }
          }
        }
        
        // No fallback - require real GPS location
        setLocationError("Enable location access to get personalized routes");
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0  // Don't use cached position, get fresh GPS
      }
    );
    
    // Cleanup on unmount
    return () => {
      if (!gotAccuratePosition) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Check for notification permission after login
  useEffect(() => {
    if (!profile?.id) return;
    
    const checkNotificationStatus = async () => {
      // Skip if notifications not supported or already granted/denied
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return;
      
      // Check if user has dismissed the prompt permanently
      const dismissed = localStorage.getItem('notificationPromptDismissed');
      if (dismissed) return;
      
      // Check if user already has an active subscription on the server
      try {
        const res = await fetch(`/api/push/subscription-status?userId=${profile.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.hasSubscription) return; // Already subscribed, don't prompt
        }
      } catch (err) {
        // Continue to show prompt if check fails
      }
      
      // Show prompt after a short delay
      setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 2000);
    };
    
    checkNotificationStatus();
  }, [profile?.id]);

  const handleEnableNotifications = async () => {
    if (!profile?.id) return;
    setEnablingNotifications(true);
    const result = await registerPushSubscription(profile.id);
    setEnablingNotifications(false);
    setShowNotificationPrompt(false);
    
    if (result.success) {
      toast.success('Notifications enabled! You\'ll be notified of friend requests.');
    } else {
      switch (result.error) {
        case 'safari_requires_homescreen':
          toast.error('On Safari, add this app to your Home Screen first (tap Share → Add to Home Screen), then enable notifications.');
          break;
        case 'permission_denied':
          toast.error('Notification permission was denied. Check your browser settings to enable notifications.');
          break;
        case 'not_supported':
          toast.error('Push notifications are not supported on this browser.');
          break;
        default:
          toast.error('Could not enable notifications. You can try again in your profile settings.');
      }
    }
  };

  const handleDismissNotificationPrompt = () => {
    localStorage.setItem('notificationPromptDismissed', 'true');
    setShowNotificationPrompt(false);
  };

  const fetchAddressFromCoords = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data.address) {
        setUserAddress(data.address);
      }
    } catch (error) {
      console.log("Failed to fetch address:", error);
    }
  };

  const handleUseCustomLocation = () => {
    const newLoc = { lat: parseFloat(customLat), lng: parseFloat(customLng) };
    setUserLocation(newLoc);
    localStorage.setItem("userGpsLocation", JSON.stringify(newLoc));
    setShowLocationInput(false);
    setShowAddressSearch(false);
    fetchAddressFromCoords(newLoc.lat, newLoc.lng);
  };

  const handleAddressSearch = async (input: string) => {
    setAddressSearch(input);
    if (input.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    
    setSearchingAddress(true);
    try {
      const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(input)}`);
      const data = await res.json();
      if (data.predictions) {
        setAddressSuggestions(data.predictions);
      }
    } catch (error) {
      console.log("Address search error:", error);
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleSelectAddress = async (placeId: string, description: string) => {
    setSearchingAddress(true);
    try {
      const res = await fetch(`/api/places/details?placeId=${placeId}`);
      const data = await res.json();
      if (data.lat && data.lng) {
        const newLoc = { lat: data.lat, lng: data.lng };
        setUserLocation(newLoc);
        setUserAddress(data.address || description);
        setCustomLat(data.lat.toString());
        setCustomLng(data.lng.toString());
        localStorage.setItem("userGpsLocation", JSON.stringify(newLoc));
        setAddressSuggestions([]);
        setAddressSearch("");
        setShowAddressSearch(false);
        setShowLocationInput(false);
      }
    } catch (error) {
      console.log("Failed to get place details:", error);
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleRefreshLocation = () => {
    setLocationLoading(true);
    setLocationError("");
    setUserAddress(null);
    localStorage.removeItem("userGpsLocation");
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        console.log("Fresh GPS location:", position.coords.latitude, position.coords.longitude, "accuracy:", position.coords.accuracy);
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(loc);
        setCustomLat(loc.lat.toString());
        setCustomLng(loc.lng.toString());
        localStorage.setItem("userGpsLocation", JSON.stringify(loc));
        setLocationLoading(false);
        
        // Fetch address
        try {
          const res = await fetch(`/api/geocode/reverse?lat=${loc.lat}&lng=${loc.lng}`);
          const data = await res.json();
          if (data.address) {
            setUserAddress(data.address);
          }
        } catch (error) {
          console.log("Failed to fetch address:", error);
        }
      },
      (error) => {
        console.log("GPS refresh error:", error.code, error.message);
        setLocationError("Could not get fresh location. Try again or enter manually.");
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  const handleMapRun = () => {
    // Use GPS location if available, otherwise use custom coordinates
    const lat = userLocation?.lat ?? parseFloat(customLat);
    const lng = userLocation?.lng ?? parseFloat(customLng);
    
    console.log("handleMapRun - userLocation state:", userLocation);
    console.log("handleMapRun - using coordinates:", { lat, lng });
    
    const targetSeconds = parseInt(targetTime.h || "0") * 3600 + parseInt(targetTime.m || "0") * 60 + parseInt(targetTime.s || "0");
    const params = new URLSearchParams({
      distance: distance[0].toString(),
      level: selectedLevel,
      lat: lat.toString(),
      lng: lng.toString(),
      targetTime: targetSeconds.toString(),
    });
    console.log("Navigating to route preview with params:", { lat, lng, distance: distance[0], level: selectedLevel });
    setLocation(`/route-preview?${params.toString()}`);
  };

  const handleStartSession = () => {
    // Use GPS location if available, otherwise use custom coordinates
    const lat = userLocation?.lat ?? parseFloat(customLat);
    const lng = userLocation?.lng ?? parseFloat(customLng);
    
    const targetSeconds = parseInt(targetTime.h || "0") * 3600 + parseInt(targetTime.m || "0") * 60 + parseInt(targetTime.s || "0");
    const params = new URLSearchParams({
      distance: distance[0].toString(),
      level: selectedLevel,
      lat: lat.toString(),
      lng: lng.toString(),
      targetTime: targetSeconds.toString(),
    });
    setLocation(`/run?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background p-6 pb-24 font-sans text-foreground">
      {/* Resume Run Banner */}
      {activeSession && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 -mx-6 -mt-6 px-6 py-4 bg-gradient-to-r from-primary/20 to-primary/10 border-b border-primary/30"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Run in progress</p>
                <p className="text-sm text-muted-foreground">
                  {formatTime(activeSession.elapsedSeconds)} · {activeSession.distanceKm.toFixed(2)} km
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDiscardSession}
                className="text-muted-foreground"
                data-testid="button-discard-session"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={handleResumeRun}
                className="bg-primary text-background hover:bg-primary/90"
                data-testid="button-resume-run"
              >
                Resume
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Notification Permission Dialog */}
      <Dialog open={showNotificationPrompt} onOpenChange={setShowNotificationPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Stay Connected
            </DialogTitle>
            <DialogDescription>
              Enable notifications to get alerts when friends send you requests or when your coach has updates for you.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={handleDismissNotificationPrompt}
              data-testid="button-dismiss-notifications"
            >
              Maybe Later
            </Button>
            <Button
              onClick={handleEnableNotifications}
              disabled={enablingNotifications}
              data-testid="button-enable-notifications"
            >
              {enablingNotifications ? "Enabling..." : "Enable Notifications"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Coach Settings Dialog */}
      <Dialog open={coachSettingsOpen} onOpenChange={setCoachSettingsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-primary" />
              AI Coach Settings
            </DialogTitle>
            <DialogDescription>
              Customize your AI coach's voice and personality
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Gender Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Voice Gender</Label>
              <RadioGroup
                value={coachSettings.gender}
                onValueChange={(value: CoachGender) => setCoachSettings(prev => ({ ...prev, gender: value }))}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="male" id="gender-male" data-testid="radio-gender-male" />
                  <Label htmlFor="gender-male" className="cursor-pointer">Male</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="female" id="gender-female" data-testid="radio-gender-female" />
                  <Label htmlFor="gender-female" className="cursor-pointer">Female</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Accent Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Accent</Label>
              <RadioGroup
                value={coachSettings.accent}
                onValueChange={(value: CoachAccent) => setCoachSettings(prev => ({ ...prev, accent: value }))}
                className="grid grid-cols-2 gap-2"
              >
                {(Object.entries(accentLabels) as [CoachAccent, string][]).map(([value, label]) => (
                  <div key={value} className="flex items-center space-x-2">
                    <RadioGroupItem value={value} id={`accent-${value}`} data-testid={`radio-accent-${value}`} />
                    <Label htmlFor={`accent-${value}`} className="cursor-pointer text-sm">{label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Tone Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Coaching Tone</Label>
              <RadioGroup
                value={coachSettings.tone}
                onValueChange={(value: CoachTone) => setCoachSettings(prev => ({ ...prev, tone: value }))}
                className="space-y-2"
              >
                {(Object.entries(toneLabels) as [CoachTone, string][]).map(([value, label]) => (
                  <div key={value} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value={value} id={`tone-${value}`} data-testid={`radio-tone-${value}`} />
                    <div className="flex-1">
                      <Label htmlFor={`tone-${value}`} className="cursor-pointer font-medium">{label}</Label>
                      <p className="text-xs text-muted-foreground">{toneDescriptions[value]}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setCoachSettings(loadCoachSettings());
                setCoachSettingsOpen(false);
              }}
              data-testid="button-cancel-coach-settings"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                saveCoachSettings(coachSettings);
                setCoachSettingsOpen(false);
                toast.success("Coach settings saved!");
              }}
              data-testid="button-save-coach-settings"
            >
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button 
                className="relative p-2 -ml-2 rounded-lg hover:bg-muted/50 transition-colors"
                data-testid="button-hamburger-menu"
              >
                <Menu className="w-6 h-6 text-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader className="text-left">
                <SheetTitle className="text-primary font-display uppercase tracking-wider">Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 space-y-2">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setLocation("/profile");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-profile"
                >
                  <User className="w-5 h-5 text-primary" />
                  <span className="font-medium">Profile</span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setLocation("/notifications");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-notifications"
                >
                  <Bell className="w-5 h-5 text-primary" />
                  <span className="font-medium flex-1">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="min-w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setLocation("/history");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-history"
                >
                  <History className="w-5 h-5 text-primary" />
                  <span className="font-medium">Run History</span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setCoachSettingsOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-coach-settings"
                >
                  <Mic className="w-5 h-5 text-primary" />
                  <span className="font-medium">AI Coach Settings</span>
                </button>
                {profile?.isAdmin && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setLocation("/admin/ai-config");
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    data-testid="menu-ai-control-centre"
                  >
                    <Settings className="w-5 h-5 text-primary" />
                    <span className="font-medium">AI Control Centre</span>
                  </button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
          <div>
            <h1 className="text-4xl font-display font-bold text-primary uppercase tracking-wider">
              {profile?.name}
            </h1>
            <p className="text-muted-foreground text-sm">Welcome, Plan your run with {profile?.coachName}</p>
          </div>
        </div>
        <motion.div 
          className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 cursor-pointer hover:bg-primary/30 transition-colors overflow-hidden"
          animate={{ scale: locationLoading ? [1, 1.1, 1] : 1 }}
          transition={{ repeat: locationLoading ? Infinity : 0, duration: 1.5 }}
          onClick={() => setLocation("/profile")}
          data-testid="button-profile"
        >
          {locationLoading ? (
            <Loader className="w-5 h-5 text-primary animate-spin" />
          ) : profile?.profilePic ? (
            <img src={profile.profilePic} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5 text-primary" />
          )}
        </motion.div>
      </header>

      {locationError && !userLocation && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-muted/50 border border-muted-foreground/20 rounded-lg p-3 mb-6"
          data-testid="alert-location"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{locationError}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.location.reload()}
              className="text-xs h-7 px-2"
              data-testid="button-refresh-location"
            >
              Refresh & Retry
            </Button>
          </div>

          {isIOSSafari() && (
            <div className="bg-card/50 border border-primary/20 rounded p-2 mt-2 mb-3">
              <p className="text-xs text-primary font-medium mb-1">To enable location on iPhone/iPad:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Open iPhone <strong>Settings</strong> app</li>
                <li>Tap <strong>Privacy & Security</strong></li>
                <li>Tap <strong>Location Services</strong> (make sure it's ON)</li>
                <li>Scroll down and tap <strong>Safari Websites</strong></li>
                <li>Select <strong>"While Using"</strong> or <strong>"Ask Next Time"</strong></li>
                <li>Close Safari completely and reopen this page</li>
              </ol>
            </div>
          )}
          
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 space-y-2"
          >
            <p className="text-xs text-primary font-medium mb-2">Or search for your starting location:</p>
            <input
              type="text"
              placeholder="Enter your address or location..."
              value={addressSearch}
              onChange={(e) => handleAddressSearch(e.target.value)}
              className="w-full px-3 py-2 bg-card border border-white/10 rounded text-sm text-foreground"
              data-testid="input-address-search-no-location"
            />
            {searchingAddress && (
              <p className="text-xs text-muted-foreground">Searching...</p>
            )}
            {addressSuggestions.length > 0 && (
              <div className="bg-card border border-white/10 rounded max-h-40 overflow-y-auto">
                {addressSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.placeId}
                    onClick={() => handleSelectAddress(suggestion.placeId, suggestion.description)}
                    className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-primary/20 border-b border-white/5 last:border-0"
                    data-testid={`suggestion-no-loc-${suggestion.placeId}`}
                  >
                    {suggestion.description}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {userLocation && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-6"
          data-testid="alert-location-found"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <p className="text-xs text-primary">Location</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleRefreshLocation}
                className="text-xs text-primary hover:text-primary/80 underline flex items-center gap-1"
                data-testid="button-refresh-location"
                disabled={locationLoading}
              >
                {locationLoading ? "..." : "Refresh"}
              </button>
              <button 
                onClick={() => setShowAddressSearch(!showAddressSearch)}
                className="text-xs text-primary hover:text-primary/80 underline"
                data-testid="button-search-address"
              >
                Search
              </button>
            </div>
          </div>
          {userAddress && (
            <p className="text-xs text-primary mt-1 font-medium">
              {userAddress}
            </p>
          )}
          <p className="text-[10px] text-primary/60 mt-1 font-mono">
            {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
          </p>
          {!userAddress && (
            <p className="text-[9px] text-muted-foreground/50 mt-1">
              Wrong location? Click Search to find your address
            </p>
          )}
          
          {showAddressSearch && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-3 space-y-2"
            >
              <input
                type="text"
                placeholder="Search for your address..."
                value={addressSearch}
                onChange={(e) => handleAddressSearch(e.target.value)}
                className="w-full px-3 py-2 bg-card border border-white/10 rounded text-sm text-foreground"
                data-testid="input-address-search"
              />
              {searchingAddress && (
                <p className="text-xs text-muted-foreground">Searching...</p>
              )}
              {addressSuggestions.length > 0 && (
                <div className="bg-card border border-white/10 rounded max-h-40 overflow-y-auto">
                  {addressSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.placeId}
                      onClick={() => handleSelectAddress(suggestion.placeId, suggestion.description)}
                      className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-primary/20 border-b border-white/5 last:border-0"
                      data-testid={`suggestion-${suggestion.placeId}`}
                    >
                      {suggestion.description}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
          
        </motion.div>
      )}

      <main className="space-y-8">
        <section className="space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <h2 className="text-xl font-display uppercase tracking-wide">Target Distance</h2>
              <span className="text-4xl font-bold font-display text-primary">{distance} <span className="text-lg text-muted-foreground">km</span></span>
            </div>
            <Slider
              defaultValue={[5]}
              max={42}
              step={1}
              value={distance}
              onValueChange={setDistance}
              className="py-4"
              data-testid="slider-distance"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className={`w-5 h-5 ${targetTimeActive ? "text-primary" : "text-muted-foreground/40"}`} />
                <h2 className={`text-xl font-display uppercase tracking-wide transition-opacity ${targetTimeActive ? "opacity-100" : "opacity-40"}`}>Target Time</h2>
              </div>
              <Switch 
                checked={targetTimeActive} 
                onCheckedChange={setTargetTimeActive}
                data-testid="switch-target-time"
              />
            </div>
            
            <div className={`flex items-center gap-4 transition-all duration-300 ${targetTimeActive ? "opacity-100" : "opacity-30 pointer-events-none grayscale"}`}>
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Hours</Label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={targetTime.h}
                  onChange={(e) => handleTimeChange('h', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg h-12 text-center font-display text-xl text-primary focus:border-primary/50 outline-none transition-colors"
                  placeholder="00"
                  disabled={!targetTimeActive}
                />
              </div>
              <div className="pt-6 font-display text-xl text-muted-foreground">:</div>
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Minutes</Label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={targetTime.m}
                  onChange={(e) => handleTimeChange('m', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg h-12 text-center font-display text-xl text-primary focus:border-primary/50 outline-none transition-colors"
                  placeholder="00"
                  disabled={!targetTimeActive}
                />
              </div>
              <div className="pt-6 font-display text-xl text-muted-foreground">:</div>
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Seconds</Label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={targetTime.s}
                  onChange={(e) => handleTimeChange('s', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg h-12 text-center font-display text-xl text-primary focus:border-primary/50 outline-none transition-colors"
                  placeholder="00"
                  disabled={!targetTimeActive}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display uppercase tracking-wide">Recent Routes</h2>
            {recentRoutes.length > 0 && (
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => setLocation('/routes')}>
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
          <div className="grid gap-3">
            {routesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : recentRoutes.length > 0 ? (
              recentRoutes.map((route) => (
                <motion.div
                  key={route.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectRoute(route)}
                >
                  <Card 
                    className="relative overflow-hidden border border-white/10 cursor-pointer transition-all duration-300 hover:border-primary/50 bg-card/50"
                    data-testid={`card-route-${route.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`text-xs uppercase font-medium ${getDifficultyColor(route.difficulty)}`}>
                              {route.difficulty}
                            </Badge>
                            <span className="text-lg font-display font-bold text-primary">{route.distance.toFixed(1)} km</span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{route.startLocationLabel || 'Unknown location'}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {route.elevationGain && (
                              <span>
                                <Mountain className="w-3 h-3 inline mr-1" />
                                {route.elevationGain}m
                              </span>
                            )}
                            {formatLastStarted(route.lastStartedAt) ? (
                              <span className="text-primary/70">{formatLastStarted(route.lastStartedAt)}</span>
                            ) : (
                              <span className="text-muted-foreground/50">Never started</span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <Card className="border border-dashed border-white/20 bg-transparent">
                <CardContent className="p-6 text-center">
                  <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No routes yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Generate your first route below</p>
                </CardContent>
              </Card>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
              data-testid="card-session-options"
            >
              <Button 
                size="lg" 
                className={`w-full h-12 text-lg font-display uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  userLocation 
                    ? "bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)]" 
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
                onClick={handleMapRun}
                disabled={!userLocation}
                data-testid="button-map-run"
              >
                <MapPin className="mr-2 w-5 h-5 fill-current" /> Map My Run
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className={`w-full h-12 text-lg font-display uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  userLocation 
                    ? "border-white/20 hover:bg-white/10" 
                    : "border-muted/20 text-muted-foreground cursor-not-allowed"
                }`}
                onClick={handleStartSession}
                disabled={!userLocation}
                data-testid="button-start-session"
              >
                <Play className="mr-2 w-5 h-5 fill-current" /> Start Run Without Route
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              data-testid="card-last-run"
            >
              <Card className="relative overflow-hidden border-2 border-primary/30 bg-primary/5 cursor-pointer hover:border-primary/50 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <History className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-display font-bold uppercase">Previous Runs</h3>
                  </div>
                  {lastRun ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm mb-4 pb-4 border-b border-white/10">
                        <div>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Distance</div>
                          <div className="font-display font-bold text-primary">{lastRun.distance.toFixed(2)} km</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Pace</div>
                          <div className="font-display font-bold text-primary">{lastRun.avgPace}/km</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Date</div>
                          <div className="text-sm text-foreground">{lastRun.date}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Level</div>
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                            {lastRun.difficulty}
                          </Badge>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm mb-4 pb-4 border-b border-white/10">
                      <p className="text-muted-foreground">Complete your first run to see your stats and progress here.</p>
                    </div>
                  )}
                  <button
                    onClick={() => setLocation("/history")}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/50 rounded-lg text-primary text-sm font-medium transition-colors"
                    data-testid="button-view-dashboard"
                  >
                    View Run Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent z-50">
        <Button 
          size="lg" 
          className={`w-full h-16 text-xl font-display uppercase tracking-widest transition-all ${
            userLocation 
              ? "bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)]" 
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
          onClick={handleMapRun}
          disabled={!userLocation}
          data-testid="button-map-my-run"
        >
          <MapPin className="mr-2 w-6 h-6 fill-current" /> {userLocation ? "Map My Run" : "Set Location to Continue"}
        </Button>
      </div>
    </div>
  );
}
