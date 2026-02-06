import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Mountain, Footprints, Play, MapPin, Loader, History, ArrowRight, Timer, Bell, Menu, User, X, RotateCcw, Mic, MicOff, Settings, Users, Check, Copy, Radio, Target, UserCog, LogOut, Search, Heart, Activity, Calendar } from "lucide-react";
import { MobileAppComingSoon } from "@/components/MobileAppComingSoon";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { RunData } from "./RunHistory";
import { loadActiveRunSession, clearActiveRunSession, type ActiveRunSession } from "@/lib/activeRunSession";
import { loadCoachSettings, saveCoachSettingsToProfile, loadCoachSettingsFromProfile, type AiCoachSettings, type CoachGender, type CoachAccent, type CoachTone, accentLabels, toneLabels, toneDescriptions, defaultSettings } from "@/lib/coachSettings";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { GpsHelpDialog } from "@/components/GpsHelpDialog";
import { WeatherWidget } from "@/components/WeatherWidget";
import { GoalWidget } from "@/components/GoalWidget";

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
    try {
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
      });
      
      if (!saveRes.ok) {
        console.error('[Push] Failed to save subscription to server');
        return { success: false, error: 'failed' };
      }
    } catch (fetchError) {
      // Network error - but subscription might have been saved
      // Verify by checking subscription status
      console.warn('[Push] Network error saving subscription, verifying status...');
      try {
        const verifyRes = await fetch(`/api/push/subscription-status?userId=${userId}`);
        if (verifyRes.ok) {
          const { hasSubscription } = await verifyRes.json();
          if (hasSubscription) {
            console.log('[Push] Subscription was saved despite network error');
            return { success: true };
          }
        }
      } catch (verifyError) {
        // Ignore verify errors
      }
      return { success: false, error: 'failed' };
    }

    console.log('[Push] Successfully subscribed');
    return { success: true };
  } catch (error) {
    console.error('[Push] Registration failed:', error);
    // Before failing, verify if subscription was actually saved
    try {
      const verifyRes = await fetch(`/api/push/subscription-status?userId=${userId}`);
      if (verifyRes.ok) {
        const { hasSubscription } = await verifyRes.json();
        if (hasSubscription) {
          console.log('[Push] Subscription exists despite error, treating as success');
          return { success: true };
        }
      }
    } catch (verifyError) {
      // Ignore verify errors
    }
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
  distanceMinKm?: number;
  distanceMaxKm?: number;
  distanceDecimalsEnabled?: boolean;
}

// Feature flag: Set to true to disable run features and show mobile app coming soon
const MOBILE_APP_COMING_SOON = true;

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
  const [favoriteRoutes, setFavoriteRoutes] = useState<Array<{
    id: string;
    name: string;
    distance: number;
    difficulty: string;
    elevationGain?: number;
    isFavorite: boolean;
  }>>([]);
  const [targetTimeActive, setTargetTimeActive] = useState(false);
  const [targetTime, setTargetTime] = useState({ h: "0", m: "30", s: "00" });
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveRunSession | null>(null);
  const [coachSettingsOpen, setCoachSettingsOpen] = useState(false);
  const [coachSettings, setCoachSettings] = useState<AiCoachSettings>(defaultSettings);
  const [showGpsHelp, setShowGpsHelp] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [currentGpsAccuracy, setCurrentGpsAccuracy] = useState<number | undefined>(undefined);
  const [aiCoachEnabled, setAiCoachEnabled] = useState(true);
  const [showFreeRunGroupModal, setShowFreeRunGroupModal] = useState(false);
  const [freeRunFriends, setFreeRunFriends] = useState<{id: string; name: string; profilePic?: string}[]>([]);
  const [selectedFreeRunFriends, setSelectedFreeRunFriends] = useState<string[]>([]);
  const [creatingFreeRunGroup, setCreatingFreeRunGroup] = useState(false);
  const [freeRunGroupCreated, setFreeRunGroupCreated] = useState<{ id: string; inviteToken: string } | null>(null);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [showPreRunModal, setShowPreRunModal] = useState(false);
  const [preRunDistanceEnabled, setPreRunDistanceEnabled] = useState(true);
  const [preRunTimeEnabled, setPreRunTimeEnabled] = useState(false);
  const [preRunLiveTracking, setPreRunLiveTracking] = useState(false);
  const [preRunDistance, setPreRunDistance] = useState([5]);
  const [preRunTime, setPreRunTime] = useState({ h: "0", m: "30", s: "00" });
  const [preRunMode, setPreRunMode] = useState<"freerun" | "mapmyrun">("freerun");
  const [exerciseType, setExerciseType] = useState<"running" | "walking">("running");
  
  // Admin User Support state
  const [showUserSupportModal, setShowUserSupportModal] = useState(false);
  const [adminUserList, setAdminUserList] = useState<Array<{ id: string; email: string; name: string; isAdmin: boolean; createdAt: Date | null }>>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  interface PendingGroupInvite {
    id: string;
    groupRunId: string;
    invitationStatus: string;
    groupRun: {
      id: string;
      title?: string;
      routeId?: string;
      targetDistance?: number;
      inviteToken: string;
    };
    host?: {
      id: string;
      name: string;
      profilePic?: string;
    };
  }

  // Entitlement check for paywall (premium features only)
  const isPremiumUser = true;

  useEffect(() => {
    loadCoachSettingsFromProfile().then(setCoachSettings);
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

  // Admin: Load users for User Support modal
  const loadAdminUsers = async () => {
    if (!profile?.id) return;
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'x-user-id': profile.id }
      });
      if (res.ok) {
        const users = await res.json();
        setAdminUserList(users);
      } else {
        toast.error("Failed to load users");
      }
    } catch (error) {
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  // Admin: Impersonate a user
  const handleImpersonate = async (targetUserId: string) => {
    if (!profile?.id) return;
    setImpersonating(true);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': profile.id 
        },
        body: JSON.stringify({ targetUserId })
      });
      if (res.ok) {
        const { user, originalAdminId, originalAdminEmail } = await res.json();
        // Store original admin's full profile for returning later
        const currentProfile = localStorage.getItem('userProfile');
        localStorage.setItem('originalAdminProfile', currentProfile || '');
        localStorage.setItem('originalAdmin', JSON.stringify({ id: originalAdminId, email: originalAdminEmail }));
        // Replace current userProfile with impersonated user's profile
        const impersonatedProfile = {
          id: user.id,
          name: user.name,
          coachName: user.coachName || 'Coach',
          profilePic: user.profilePic,
          isAdmin: user.isAdmin,
          distanceMinKm: user.distanceMinKm,
          distanceMaxKm: user.distanceMaxKm,
          distanceDecimalsEnabled: user.distanceDecimalsEnabled,
        };
        localStorage.setItem('userProfile', JSON.stringify(impersonatedProfile));
        toast.success(`Now viewing as ${user.name || user.email}`);
        setShowUserSupportModal(false);
        // Reload to apply impersonation
        window.location.reload();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to impersonate user");
      }
    } catch (error) {
      toast.error("Failed to impersonate user");
    } finally {
      setImpersonating(false);
    }
  };

  // Admin: Return to original admin account
  const handleReturnToAdmin = () => {
    const originalAdminProfile = localStorage.getItem('originalAdminProfile');
    if (originalAdminProfile) {
      // Restore the original admin's full profile
      localStorage.setItem('userProfile', originalAdminProfile);
      localStorage.removeItem('originalAdmin');
      localStorage.removeItem('originalAdminProfile');
      toast.success("Returned to your admin account");
      window.location.reload();
    }
  };

  // Check if currently impersonating
  const originalAdmin = localStorage.getItem('originalAdmin');
  const isImpersonating = !!originalAdmin;

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

  const { data: pendingInvites = [], refetch: refetchInvites } = useQuery<PendingGroupInvite[]>({
    queryKey: ['/api/group-runs/invites/pending', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const res = await fetch(`/api/group-runs/invites/pending/${profile.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!profile?.id,
    refetchInterval: 15000,
    staleTime: 0,
  });

  const handleAcceptGroupInvite = async (invite: PendingGroupInvite) => {
    if (!profile?.id || processingInvite) return;
    setProcessingInvite(invite.id);
    try {
      const res = await fetch(`/api/group-runs/invites/${invite.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id }),
      });
      if (!res.ok) throw new Error('Failed to accept invite');
      const data = await res.json();
      toast.success('Group run invite accepted!');
      refetchInvites();
      // Navigate to run session waiting room with group run info
      const params = new URLSearchParams({
        groupRunId: invite.groupRunId,
        waiting: 'true',
      });
      if (data.route) {
        params.set('routeId', data.route.id);
        // Also store route data in localStorage for RunSession to pick up
        if (data.route.polyline) {
          localStorage.setItem("activeRoute", JSON.stringify({
            id: data.route.id,
            routeName: data.route.name || 'Group Run Route',
            difficulty: data.route.difficulty || 'moderate',
            actualDistance: data.route.distance || invite.groupRun.targetDistance,
            polyline: data.route.polyline,
            waypoints: data.route.waypoints || [],
            startLat: data.route.startLat,
            startLng: data.route.startLng,
            elevation: data.route.elevation || (data.route.elevationGain ? {
              gain: data.route.elevationGain,
              loss: data.route.elevationLoss,
              profile: data.route.elevationProfile,
            } : undefined),
            turnInstructions: data.route.turnInstructions || [],
          }));
        }
      }
      setLocation(`/run?${params.toString()}`);
    } catch (err) {
      toast.error('Failed to accept invite');
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleDeclineGroupInvite = async (invite: PendingGroupInvite) => {
    if (!profile?.id || processingInvite) return;
    setProcessingInvite(invite.id);
    try {
      const res = await fetch(`/api/group-runs/invites/${invite.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id }),
      });
      if (!res.ok) throw new Error('Failed to decline invite');
      toast.success('Group run invite declined');
      refetchInvites();
    } catch (err) {
      toast.error('Failed to decline invite');
    } finally {
      setProcessingInvite(null);
    }
  };

  interface RecentRoute {
    id: string;
    name: string;
    distance: number;
    difficulty: string;
    startLocationLabel?: string;
    elevationGain?: number;
    elevationLoss?: number;
    elevationProfile?: Array<{ distance: number; elevation: number; grade?: number }>;
    createdAt: string;
    lastStartedAt?: string;
    startLat: number;
    startLng: number;
    polyline?: string;
    turnInstructions?: Array<{
      instruction: string;
      maneuver: string;
      distance: number;
      duration: number;
      startLat: number;
      startLng: number;
      endLat: number;
      endLng: number;
      cumulativeDistance: number;
    }>;
  }

  const { data: recentRoutes = [], isLoading: routesLoading } = useQuery<RecentRoute[]>({
    queryKey: ['/api/routes/recent', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const res = await fetch(`/api/routes/recent?limit=4&userId=${profile.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!profile?.id,
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
    
    // Store route in localStorage with elevation data for RunSession
    localStorage.setItem("activeRoute", JSON.stringify({
      id: route.id,
      routeName: route.name,
      difficulty: route.difficulty,
      actualDistance: route.distance,
      polyline: route.polyline,
      waypoints: [],
      startLat: route.startLat,
      startLng: route.startLng,
      elevation: route.elevationGain ? {
        gain: route.elevationGain,
        loss: route.elevationLoss || 0,
        profile: route.elevationProfile,
      } : undefined,
      turnInstructions: route.turnInstructions || [],
    }));
    
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

  // Initialize distance slider when profile loads with user's preferences
  useEffect(() => {
    if (profile) {
      const minKm = profile.distanceMinKm ?? 0;
      const maxKm = profile.distanceMaxKm ?? 50;
      // Set initial distance to a reasonable starting point within the user's range
      const initialDistance = Math.max(minKm, Math.min(5, maxKm));
      setDistance([initialDistance]);
    }
  }, [profile?.distanceMinKm, profile?.distanceMaxKm]);

  useEffect(() => {
    const loadProfileAndRuns = async () => {
      const userProfileStr = localStorage.getItem("userProfile");
      if (userProfileStr) {
        const parsedProfile = JSON.parse(userProfileStr);
        setProfile(parsedProfile);
        
        // Try to load last run and favorite routes from database if user has an ID
        if (parsedProfile.id) {
          try {
            const [runsResponse, routesResponse] = await Promise.all([
              fetch(`/api/users/${parsedProfile.id}/runs`),
              fetch(`/api/routes/favorites?userId=${parsedProfile.id}`)
            ]);
            
            if (runsResponse.ok) {
              const runs = await runsResponse.json();
              if (runs.length > 0) {
                const lastDbRun = runs[0]; // Already sorted by completedAt desc
                setLastRun({
                  id: lastDbRun.id,
                  date: lastDbRun.completedAt ? new Date(lastDbRun.completedAt).toLocaleDateString('en-GB') : '',
                  time: lastDbRun.completedAt ? new Date(lastDbRun.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
                  distance: lastDbRun.distance,
                  totalTime: lastDbRun.duration,
                  avgPace: lastDbRun.avgPace || '',
                  difficulty: lastDbRun.difficulty || 'beginner',
                  lat: lastDbRun.startLat || 0,
                  lng: lastDbRun.startLng || 0,
                });
              }
            }
            
            if (routesResponse.ok) {
              const routes = await routesResponse.json();
              setFavoriteRoutes(routes);
            }
          } catch (err) {
            console.warn('Failed to load data from database:', err);
          }
          return;
        }
      }

      // Fallback to localStorage only if user is NOT logged in (guest mode)
      // For logged-in users, the database is the source of truth
      if (!userProfileStr) {
        const runHistory = localStorage.getItem("runHistory");
        if (runHistory) {
          const runs = JSON.parse(runHistory);
          if (runs.length > 0) {
            setLastRun(runs[runs.length - 1]);
          }
        }
      }
      // If user is logged in but has no DB runs, lastRun stays null (new user)
    };
    
    loadProfileAndRuns();

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
        
        // Track current accuracy for help dialog
        setCurrentGpsAccuracy(accuracy);
        
        // Reject inaccurate positions (network-based location)
        if (accuracy > MAX_ACCURACY) {
          setLocationError(`Refining GPS signal... (${Math.round(accuracy)}m accuracy)`);
          console.log(`GPS position rejected: accuracy ${accuracy.toFixed(1)}m > ${MAX_ACCURACY}m threshold`);
          return;
        }
        
        // Clear accuracy when we get a good fix
        setCurrentGpsAccuracy(undefined);
        
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

  // Handle "Run Again" flow from RunInsights page
  useEffect(() => {
    const runAgainRunId = localStorage.getItem("runAgainRunId");
    const runAgainRunName = localStorage.getItem("runAgainRunName");
    const runAgainUserId = localStorage.getItem("runAgainUserId");
    
    if (!runAgainRunId) return;
    
    // If location is not available yet, show a message and wait
    if (!userLocation) {
      // Only show this toast once per session
      const toastShown = sessionStorage.getItem("runAgainLocationToastShown");
      if (!toastShown) {
        sessionStorage.setItem("runAgainLocationToastShown", "true");
        toast.info("Waiting for GPS location to start your run...");
      }
      return;
    }
    
    // Verify the current user matches the stored userId (security check)
    const currentProfile = localStorage.getItem("userProfile");
    const currentUserId = currentProfile ? JSON.parse(currentProfile).id : null;
    
    if (!currentUserId || currentUserId !== runAgainUserId) {
      // Clear flags and abort - user doesn't own this run
      localStorage.removeItem("runAgainRunId");
      localStorage.removeItem("runAgainRunName");
      localStorage.removeItem("runAgainUserId");
      sessionStorage.removeItem("runAgainLocationToastShown");
      toast.error("Cannot start run - please try again");
      return;
    }
    
    // Convert the run to a route and start a new run
    const convertAndStart = async () => {
      try {
        const response = await fetch(`/api/runs/${runAgainRunId}/to-route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            name: runAgainRunName || "Run Again Route",
            makeFavorite: false,
            userId: runAgainUserId
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create route from run");
        }
        
        const route = await response.json();
        
        // Clear flags only after successful conversion
        localStorage.removeItem("runAgainRunId");
        localStorage.removeItem("runAgainRunName");
        localStorage.removeItem("runAgainUserId");
        sessionStorage.removeItem("runAgainLocationToastShown");
        
        // Transform route data to expected format for RunSession with elevation
        const routeData = {
          id: route.id,
          routeName: route.name,
          difficulty: route.difficulty,
          actualDistance: route.distance,
          polyline: route.polyline,
          waypoints: route.waypoints,
          startLat: route.startLat,
          startLng: route.startLng,
          elevation: route.elevationProfile ? {
            gain: route.elevationGain || 0,
            loss: route.elevationLoss || 0,
            profile: route.elevationProfile
          } : undefined,
          turnInstructions: route.turnInstructions,
        };
        
        // Store in localStorage for RunSession to use (enables elevation-aware coaching)
        localStorage.setItem("activeRoute", JSON.stringify(routeData));
        
        // Navigate to run session with the new route
        const params = new URLSearchParams({
          routeId: route.id,
          lat: userLocation.lat.toString(),
          lng: userLocation.lng.toString(),
          level: route.difficulty || "moderate",
          distance: route.distance?.toString() || "5",
          aiCoach: isPremiumUser && aiCoachEnabled ? "on" : "off",
        });
        
        toast.success("Starting run with your saved route!");
        setLocation(`/run?${params.toString()}`);
      } catch (error) {
        console.error("Failed to start Run Again:", error);
        // Clear flags on error to prevent infinite retry
        localStorage.removeItem("runAgainRunId");
        localStorage.removeItem("runAgainRunName");
        localStorage.removeItem("runAgainUserId");
        sessionStorage.removeItem("runAgainLocationToastShown");
        toast.error(error instanceof Error ? error.message : "Failed to start run from previous route");
      }
    };
    
    convertAndStart();
  }, [userLocation, isPremiumUser, aiCoachEnabled, setLocation]);

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

  useEffect(() => {
    if (profile?.id && showFreeRunGroupModal) {
      fetch(`/api/users/${profile.id}/friends`)
        .then(res => res.json())
        .then(data => {
          const friendList = data.map((f: any) => ({
            id: f.friendId,
            name: f.name || 'Unknown',
            profilePic: f.profilePic,
          }));
          setFreeRunFriends(friendList);
        })
        .catch(err => console.error("Failed to load friends:", err));
    }
  }, [profile?.id, showFreeRunGroupModal]);

  const handleCreateFreeRunGroup = async () => {
    if (!profile?.id || !userLocation) return;
    
    setCreatingFreeRunGroup(true);
    try {
      const res = await fetch("/api/group-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostUserId: profile.id,
          mode: "free",
          title: "Free Group Run",
          targetDistance: distance[0],
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create group run");
      }

      const groupRun = await res.json();
      setFreeRunGroupCreated({ id: groupRun.id, inviteToken: groupRun.inviteToken });

      if (selectedFreeRunFriends.length > 0) {
        await fetch(`/api/group-runs/${groupRun.id}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: profile.id,
            friendIds: selectedFreeRunFriends,
          }),
        });
        toast.success(`Invited ${selectedFreeRunFriends.length} friend${selectedFreeRunFriends.length > 1 ? 's' : ''} to join!`);
      }
    } catch (err) {
      console.error("Failed to create group run:", err);
      toast.error("Failed to create group run");
    } finally {
      setCreatingFreeRunGroup(false);
    }
  };

  const handleCopyFreeRunInviteLink = () => {
    if (!freeRunGroupCreated) return;
    const link = `${window.location.origin}/join-run?token=${freeRunGroupCreated.inviteToken}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied to clipboard!");
  };

  const handleStartFreeRunGroup = () => {
    if (!freeRunGroupCreated || !userLocation) return;
    
    const lat = userLocation.lat;
    const lng = userLocation.lng;
    
    const canUseAiCoach = isPremiumUser && aiCoachEnabled;
    const targetSeconds = parseInt(targetTime.h || "0") * 3600 + parseInt(targetTime.m || "0") * 60 + parseInt(targetTime.s || "0");
    const params = new URLSearchParams({
      distance: distance[0].toString(),
      level: selectedLevel,
      lat: lat.toString(),
      lng: lng.toString(),
      targetTime: targetSeconds.toString(),
      aiCoach: canUseAiCoach ? "on" : "off",
      groupRunId: freeRunGroupCreated.id,
    });
    setLocation(`/run?${params.toString()}`);
  };

  const toggleFreeRunFriendSelection = (friendId: string) => {
    setSelectedFreeRunFriends(prev => 
      prev.includes(friendId) 
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleStartSession = () => {
    // Initialize pre-run modal with current homepage settings
    setPreRunMode("freerun");
    setPreRunDistanceEnabled(true);
    setPreRunTimeEnabled(targetTimeActive);
    setPreRunDistance(distance);
    setPreRunTime(targetTime);
    setPreRunLiveTracking(false);
    setShowPreRunModal(true);
  };

  const handleMapRunClick = () => {
    // Initialize pre-run modal with current homepage settings for Map My Run
    setPreRunMode("mapmyrun");
    setPreRunDistanceEnabled(true);
    setPreRunTimeEnabled(targetTimeActive);
    setPreRunDistance(distance);
    setPreRunTime(targetTime);
    setPreRunLiveTracking(false);
    setShowPreRunModal(true);
  };

  const handlePreRunTimeChange = (unit: 'h' | 'm' | 's', value: string) => {
    const cleanValue = value.replace(/\D/g, '').slice(0, 2);
    setPreRunTime(prev => ({ ...prev, [unit]: cleanValue }));
  };

  const handleConfirmPreRun = () => {
    // Use GPS location if available, otherwise use custom coordinates
    const lat = userLocation?.lat ?? parseFloat(customLat);
    const lng = userLocation?.lng ?? parseFloat(customLng);
    
    // Calculate target values based on pre-run settings
    const finalDistance = preRunDistanceEnabled ? preRunDistance[0] : 0;
    const targetSeconds = preRunTimeEnabled 
      ? parseInt(preRunTime.h || "0") * 3600 + parseInt(preRunTime.m || "0") * 60 + parseInt(preRunTime.s || "0")
      : 0;
    
    setShowPreRunModal(false);
    
    if (preRunMode === "mapmyrun") {
      // Navigate to route preview for Map My Run
      const params = new URLSearchParams({
        distance: finalDistance.toString(),
        level: selectedLevel,
        lat: lat.toString(),
        lng: lng.toString(),
        targetTime: targetSeconds.toString(),
        targetTimeEnabled: preRunTimeEnabled ? "on" : "off",
        liveTracking: preRunLiveTracking ? "on" : "off",
        exerciseType,
      });
      setLocation(`/route-preview?${params.toString()}`);
    } else {
      // Start free run session
      const canUseAiCoach = aiCoachEnabled;
      
      const params = new URLSearchParams({
        distance: finalDistance.toString(),
        level: selectedLevel,
        lat: lat.toString(),
        lng: lng.toString(),
        targetTime: targetSeconds.toString(),
        aiCoach: canUseAiCoach ? "on" : "off",
        liveTracking: preRunLiveTracking ? "on" : "off",
        exerciseType,
      });
      setLocation(`/run?${params.toString()}`);
    }
  };

  // Feature flag: Show mobile app coming soon page instead of run features
  if (MOBILE_APP_COMING_SOON) {
    return <MobileAppComingSoon userName={profile?.name} lastRunDistance={lastRun?.distance} />;
  }

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

      {/* Group Run Invite Banner */}
      <AnimatePresence>
        {pendingInvites.length > 0 && pendingInvites.map((invite) => (
          <motion.div
            key={invite.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`mb-4 ${!activeSession ? '-mx-6 -mt-6' : '-mx-6'} px-6 py-4 bg-gradient-to-r from-purple-500/20 to-purple-400/10 border-b border-purple-400/30`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Group Run Invite</p>
                  <p className="text-sm text-muted-foreground">
                    {invite.host?.name || 'A friend'} invited you
                    {invite.groupRun.targetDistance ? ` · ${invite.groupRun.targetDistance.toFixed(1)} km` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeclineGroupInvite(invite)}
                  disabled={processingInvite === invite.id}
                  className="text-muted-foreground"
                  data-testid={`button-decline-invite-${invite.id}`}
                >
                  <X className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAcceptGroupInvite(invite)}
                  disabled={processingInvite === invite.id}
                  className="bg-purple-500 text-white hover:bg-purple-600"
                  data-testid={`button-accept-invite-${invite.id}`}
                >
                  {processingInvite === invite.id ? 'Joining...' : 'Join'}
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

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
              onClick={async () => {
                const success = await saveCoachSettingsToProfile(coachSettings);
                setCoachSettingsOpen(false);
                if (success) {
                  toast.success("Coach settings saved!");
                } else {
                  toast.error("Settings saved locally, but couldn't sync to your account. They'll sync when you're back online.");
                }
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
                    setLocation("/goals");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-goals"
                >
                  <Target className="w-5 h-5 text-primary" />
                  <span className="font-medium">Goals</span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setLocation("/events");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-events"
                >
                  <Calendar className="w-5 h-5 text-primary" />
                  <span className="font-medium">Events</span>
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
                  <>
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
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setShowUserSupportModal(true);
                        loadAdminUsers();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      data-testid="menu-user-support"
                    >
                      <UserCog className="w-5 h-5 text-primary" />
                      <span className="font-medium">User Support</span>
                    </button>
                  </>
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

      {/* Goal Widget */}
      {profile?.id && <GoalWidget userId={profile.id} />}

      {/* GPS Status Section - Always visible */}
      {locationLoading && !userLocation && !locationError && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-6"
          data-testid="alert-location-loading"
        >
          <div className="flex items-center gap-2">
            <Loader className="w-4 h-4 text-primary animate-spin" />
            <p className="text-xs text-primary">Acquiring GPS signal...</p>
          </div>
        </motion.div>
      )}

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
            <div className="flex gap-2">
              {currentGpsAccuracy && currentGpsAccuracy > 100 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowGpsHelp(true)}
                  className="text-xs h-7 px-2 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                  data-testid="button-gps-help"
                >
                  Need Help?
                </Button>
              )}
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
        <div className="flex justify-center mb-4">
          <WeatherWidget 
            lat={userLocation.lat} 
            lng={userLocation.lng} 
            compact
            onClick={() => setShowWeatherModal(true)}
          />
        </div>
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
              <span className="text-4xl font-bold font-display text-primary">
                {profile?.distanceDecimalsEnabled ? distance[0].toFixed(1) : distance[0]} 
                <span className="text-lg text-muted-foreground"> km</span>
              </span>
            </div>
            <Slider
              defaultValue={[profile?.distanceMinKm ?? 0]}
              min={profile?.distanceMinKm ?? 0}
              max={profile?.distanceMaxKm ?? 50}
              step={profile?.distanceDecimalsEnabled ? 0.1 : 1}
              value={distance}
              onValueChange={setDistance}
              className="py-4"
              data-testid="slider-distance"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${targetTimeActive ? "bg-primary/20" : "bg-white/10"}`}>
                  <Timer className={`w-5 h-5 ${targetTimeActive ? "text-primary" : "text-foreground/60"}`} />
                </div>
                <div>
                  <h2 className={`text-lg font-display uppercase tracking-wide transition-colors ${targetTimeActive ? "text-foreground" : "text-foreground/60"}`}>Target Time</h2>
                  <p className="text-xs text-muted-foreground">{targetTimeActive ? "Set your goal time" : "Tap to enable"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTargetTimeActive(!targetTimeActive)}
                className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wide transition-all ${
                  targetTimeActive 
                    ? "bg-primary text-background shadow-lg shadow-primary/30" 
                    : "bg-white/20 text-foreground border-2 border-dashed border-white/30 hover:border-primary/50 hover:bg-white/30"
                }`}
                data-testid="switch-target-time"
              >
                {targetTimeActive ? "ON" : "OFF"}
              </button>
            </div>
            
            <div className={`flex items-center gap-4 transition-all duration-300 ${targetTimeActive ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
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
              <Card className="bg-card/50 border-white/10">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {aiCoachEnabled ? (
                        <Mic className="w-4 h-4 text-primary" />
                      ) : (
                        <MicOff className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Label htmlFor="ai-coach-home" className="text-sm font-medium">
                        AI Coach
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${aiCoachEnabled ? 'text-primary' : 'text-muted-foreground'}`}>
                        {aiCoachEnabled ? 'On' : 'Off'}
                      </span>
                      <Switch
                        id="ai-coach-home"
                        checked={aiCoachEnabled}
                        onCheckedChange={setAiCoachEnabled}
                        data-testid="switch-ai-coach-home"
                      />
                    </div>
                  </div>
                  {!aiCoachEnabled && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Route directions will use your device's voice instead
                    </p>
                  )}
                </CardContent>
              </Card>
              <Button 
                size="lg" 
                className={`w-full h-12 text-lg font-display uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  userLocation 
                    ? "bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)]" 
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
                onClick={handleMapRunClick}
                disabled={!userLocation}
                data-testid="button-map-run"
              >
                <MapPin className="mr-2 w-5 h-5 fill-current" /> Map My Run
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className={`w-full h-12 text-base font-display uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  userLocation 
                    ? "border-white/20 hover:bg-white/10" 
                    : "border-muted/20 text-muted-foreground cursor-not-allowed"
                }`}
                onClick={handleStartSession}
                disabled={!userLocation}
                data-testid="button-start-session"
              >
                <Play className="mr-2 w-5 h-5 fill-current" /> Run without Route
              </Button>
            </motion.div>

            {favoriteRoutes.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                data-testid="card-favorites"
              >
                <Card className="relative overflow-hidden border-2 border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/50 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Heart className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                      <h3 className="text-lg font-display font-bold uppercase">Saved Routes</h3>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {favoriteRoutes.slice(0, 5).map((route) => (
                        <button
                          key={route.id}
                          onClick={async () => {
                            if (!userLocation) {
                              toast.error("Enable location to run saved routes");
                              return;
                            }
                            
                            // Fetch full route data including elevation for AI coaching
                            try {
                              const response = await fetch(`/api/routes/${route.id}`);
                              if (response.ok) {
                                const fullRoute = await response.json();
                                
                                // Transform route data to expected format for RunSession
                                const routeData = {
                                  id: fullRoute.id,
                                  routeName: fullRoute.name,
                                  difficulty: fullRoute.difficulty,
                                  actualDistance: fullRoute.distance,
                                  polyline: fullRoute.polyline,
                                  waypoints: fullRoute.waypoints,
                                  startLat: fullRoute.startLat,
                                  startLng: fullRoute.startLng,
                                  elevation: fullRoute.elevationProfile ? {
                                    gain: fullRoute.elevationGain || 0,
                                    loss: fullRoute.elevationLoss || 0,
                                    profile: fullRoute.elevationProfile
                                  } : undefined,
                                  turnInstructions: fullRoute.turnInstructions,
                                };
                                
                                // Store in localStorage for RunSession to use
                                localStorage.setItem("activeRoute", JSON.stringify(routeData));
                              }
                            } catch (err) {
                              console.warn("Failed to fetch full route data:", err);
                            }
                            
                            const params = new URLSearchParams({
                              routeId: route.id,
                              lat: userLocation.lat.toString(),
                              lng: userLocation.lng.toString(),
                              level: route.difficulty || "moderate",
                              distance: route.distance?.toString() || "5",
                              aiCoach: isPremiumUser && aiCoachEnabled ? "on" : "off",
                            });
                            setLocation(`/run?${params.toString()}`);
                          }}
                          className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-primary/10 border border-white/10 hover:border-primary/30 rounded-lg transition-colors text-left"
                          data-testid={`button-favorite-route-${route.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{route.name}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <span>{route.distance?.toFixed(1)} km</span>
                              {route.elevationGain && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Mountain className="w-3 h-3" />
                                    {route.elevationGain}m
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1 h-4">
                                {route.difficulty}
                              </Badge>
                            </div>
                          </div>
                          <Play className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
                        </button>
                      ))}
                    </div>
                    {favoriteRoutes.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        +{favoriteRoutes.length - 5} more saved routes
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              data-testid="card-last-run"
            >
              <Card 
                className="relative overflow-hidden border-2 border-primary/30 bg-primary/5 cursor-pointer hover:border-primary/50 transition-all"
                onClick={() => setLocation("/history")}
                data-testid="card-previous-runs-clickable"
              >
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
                          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Avg Pace</div>
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
          onClick={handleMapRunClick}
          disabled={!userLocation}
          data-testid="button-map-my-run"
        >
          <MapPin className="mr-2 w-6 h-6 fill-current" /> {userLocation ? "Map My Run" : "Set Location to Continue"}
        </Button>
      </div>

      <GpsHelpDialog 
        open={showGpsHelp} 
        onClose={() => setShowGpsHelp(false)} 
        currentAccuracy={currentGpsAccuracy}
      />

      {showWeatherModal && userLocation && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowWeatherModal(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <WeatherWidget 
              lat={userLocation.lat} 
              lng={userLocation.lng} 
              className="max-w-sm"
            />
          </div>
        </div>
      )}

      <AnimatePresence>
        {showPreRunModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[100] flex items-end sm:items-center justify-center"
            onClick={() => setShowPreRunModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-display uppercase tracking-wider">
                    {preRunMode === "mapmyrun" ? "Map My Run Setup" : "Run Setup"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {preRunMode === "mapmyrun" ? "Configure your AI-generated route" : "Configure your run settings"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPreRunModal(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Exercise Type Toggle - Compact inline */}
                <div className="flex items-center justify-between px-1" data-testid="section-exercise-type">
                  <span className="text-sm text-muted-foreground" id="exercise-type-label">Activity</span>
                  <div className="flex gap-1 bg-white/5 rounded-lg p-0.5" role="radiogroup" aria-labelledby="exercise-type-label">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={exerciseType === "running"}
                      onClick={() => setExerciseType("running")}
                      className={`py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                        exerciseType === "running"
                          ? "bg-primary text-background"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="button-exercise-running"
                    >
                      Run
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={exerciseType === "walking"}
                      onClick={() => setExerciseType("walking")}
                      className={`py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                        exerciseType === "walking"
                          ? "bg-primary text-background"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="button-exercise-walking"
                    >
                      Walk
                    </button>
                  </div>
                </div>

                {/* Target Distance */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${preRunDistanceEnabled ? "bg-primary/20" : "bg-white/10"}`}>
                        <MapPin className={`w-5 h-5 ${preRunDistanceEnabled ? "text-primary" : "text-foreground/60"}`} />
                      </div>
                      <div>
                        <h3 className="font-medium">Target Distance</h3>
                        <p className="text-xs text-muted-foreground">{preRunDistanceEnabled ? `${preRunDistance[0]} km goal` : "No distance goal"}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreRunDistanceEnabled(!preRunDistanceEnabled)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all ${
                        preRunDistanceEnabled 
                          ? "bg-primary text-background" 
                          : "bg-white/20 text-foreground border border-dashed border-white/30"
                      }`}
                    >
                      {preRunDistanceEnabled ? "ON" : "OFF"}
                    </button>
                  </div>
                  {preRunDistanceEnabled && (
                    <div className="mt-3">
                      <Slider
                        min={profile?.distanceMinKm ?? 0}
                        max={profile?.distanceMaxKm ?? 50}
                        step={profile?.distanceDecimalsEnabled ? 0.1 : 1}
                        value={preRunDistance}
                        onValueChange={setPreRunDistance}
                        className="py-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{profile?.distanceMinKm ?? 0} km</span>
                        <span className="text-primary font-bold">{preRunDistance[0]} km</span>
                        <span>{profile?.distanceMaxKm ?? 50} km</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Target Time */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${preRunTimeEnabled ? "bg-primary/20" : "bg-white/10"}`}>
                        <Timer className={`w-5 h-5 ${preRunTimeEnabled ? "text-primary" : "text-foreground/60"}`} />
                      </div>
                      <div>
                        <h3 className="font-medium">Target Time</h3>
                        <p className="text-xs text-muted-foreground">
                          {preRunTimeEnabled 
                            ? `${preRunTime.h || "0"}h ${preRunTime.m || "0"}m ${preRunTime.s || "0"}s goal`
                            : "No time goal"
                          }
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreRunTimeEnabled(!preRunTimeEnabled)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all ${
                        preRunTimeEnabled 
                          ? "bg-primary text-background" 
                          : "bg-white/20 text-foreground border border-dashed border-white/30"
                      }`}
                    >
                      {preRunTimeEnabled ? "ON" : "OFF"}
                    </button>
                  </div>
                  {preRunTimeEnabled && (
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Hours</Label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={preRunTime.h}
                          onChange={(e) => handlePreRunTimeChange('h', e.target.value)}
                          className="w-full bg-white/10 border border-white/20 rounded-lg h-10 text-center font-display text-lg text-primary focus:border-primary/50 outline-none"
                          placeholder="0"
                        />
                      </div>
                      <div className="pt-5 font-display text-lg text-muted-foreground">:</div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Min</Label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={preRunTime.m}
                          onChange={(e) => handlePreRunTimeChange('m', e.target.value)}
                          className="w-full bg-white/10 border border-white/20 rounded-lg h-10 text-center font-display text-lg text-primary focus:border-primary/50 outline-none"
                          placeholder="30"
                        />
                      </div>
                      <div className="pt-5 font-display text-lg text-muted-foreground">:</div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Sec</Label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={preRunTime.s}
                          onChange={(e) => handlePreRunTimeChange('s', e.target.value)}
                          className="w-full bg-white/10 border border-white/20 rounded-lg h-10 text-center font-display text-lg text-primary focus:border-primary/50 outline-none"
                          placeholder="00"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Tracking */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${preRunLiveTracking ? "bg-green-500/20" : "bg-white/10"}`}>
                        <Radio className={`w-5 h-5 ${preRunLiveTracking ? "text-green-400" : "text-foreground/60"}`} />
                      </div>
                      <div>
                        <h3 className="font-medium">Live Tracking</h3>
                        <p className="text-xs text-muted-foreground">Share your location with friends</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreRunLiveTracking(!preRunLiveTracking)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all ${
                        preRunLiveTracking 
                          ? "bg-green-500 text-background" 
                          : "bg-white/20 text-foreground border border-dashed border-white/30"
                      }`}
                    >
                      {preRunLiveTracking ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                {/* Invite Friends */}
                <div 
                  className="bg-white/5 rounded-xl p-4 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => {
                    setShowPreRunModal(false);
                    setShowFreeRunGroupModal(true);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-500/20">
                        <Users className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-medium">Run with Friends</h3>
                        <p className="text-xs text-muted-foreground">Create a group run and invite friends</p>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <Button
                  className="w-full h-12 font-display uppercase tracking-wider bg-primary text-background"
                  onClick={handleConfirmPreRun}
                >
                  {preRunMode === "mapmyrun" ? (
                    <>
                      <MapPin className="mr-2 w-5 h-5 fill-current" />
                      Generate Route
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 w-5 h-5 fill-current" />
                      Start Run
                    </>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  {!preRunDistanceEnabled && !preRunTimeEnabled 
                    ? "Free run - no targets set"
                    : preRunDistanceEnabled && preRunTimeEnabled
                    ? `${preRunDistance[0]} km in ${preRunTime.h || "0"}h ${preRunTime.m || "0"}m`
                    : preRunDistanceEnabled
                    ? `Target: ${preRunDistance[0]} km`
                    : `Target: ${preRunTime.h || "0"}h ${preRunTime.m || "0"}m ${preRunTime.s || "0"}s`
                  }
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFreeRunGroupModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[100] flex items-end sm:items-center justify-center"
            onClick={() => !creatingFreeRunGroup && setShowFreeRunGroupModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display uppercase tracking-wider">
                  {freeRunGroupCreated ? "Group Run Created!" : "Run with Friends"}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowFreeRunGroupModal(false);
                    setFreeRunGroupCreated(null);
                    setSelectedFreeRunFriends([]);
                  }}
                  disabled={creatingFreeRunGroup}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {!freeRunGroupCreated ? (
                <>
                  <div className="bg-white/5 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Run Type</p>
                        <p className="font-bold">Run without Route</p>
                      </div>
                      <div className="px-2 py-1 rounded-full text-xs font-bold uppercase bg-primary/20 text-primary">
                        {distance[0]}km target
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Invite Friends</h3>
                    {freeRunFriends.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No friends yet. Add friends to invite them to group runs!
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {freeRunFriends.map(friend => (
                          <div
                            key={friend.id}
                            className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                              selectedFreeRunFriends.includes(friend.id) 
                                ? 'bg-primary/20 border border-primary/50' 
                                : 'bg-white/5 hover:bg-white/10'
                            }`}
                            onClick={() => toggleFreeRunFriendSelection(friend.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                {friend.name.charAt(0).toUpperCase()}
                              </div>
                              <span>{friend.name}</span>
                            </div>
                            {selectedFreeRunFriends.includes(friend.id) && (
                              <Check className="w-5 h-5 text-primary" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mb-4">
                    You can also share an invite link after creating the group run
                  </p>

                  <Button
                    className="w-full h-12 font-display uppercase tracking-wider"
                    onClick={handleCreateFreeRunGroup}
                    disabled={creatingFreeRunGroup}
                  >
                    {creatingFreeRunGroup ? (
                      <>
                        <Loader className="mr-2 w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Users className="mr-2 w-4 h-4" />
                        Create Group Run
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">Group Run Created!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Share the invite code with friends or start running now
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-4 mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Invite Code</p>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-2xl font-bold tracking-widest text-primary">
                        {freeRunGroupCreated.inviteToken}
                      </span>
                      <Button variant="ghost" size="sm" onClick={handleCopyFreeRunInviteLink}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </Button>
                    </div>
                  </div>

                  {selectedFreeRunFriends.length > 0 && (
                    <p className="text-sm text-muted-foreground mb-4 text-center">
                      {selectedFreeRunFriends.length} friend{selectedFreeRunFriends.length > 1 ? 's' : ''} invited
                    </p>
                  )}

                  <Button
                    className="w-full h-12 font-display uppercase tracking-wider bg-primary text-background"
                    onClick={handleStartFreeRunGroup}
                  >
                    <Play className="mr-2 w-4 h-4 fill-current" />
                    Start Group Run
                  </Button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Support Modal (Admin Only) */}
      <Dialog open={showUserSupportModal} onOpenChange={setShowUserSupportModal}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              User Support
            </DialogTitle>
            <DialogDescription>
              Select a user to view their account and run history
            </DialogDescription>
          </DialogHeader>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-user-search"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px]">
            {loadingUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : adminUserList.filter(u => 
              userSearchQuery === "" || 
              u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
              u.email.toLowerCase().includes(userSearchQuery.toLowerCase())
            ).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No users found
              </div>
            ) : (
              adminUserList
                .filter(u => 
                  userSearchQuery === "" || 
                  u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                  u.email.toLowerCase().includes(userSearchQuery.toLowerCase())
                )
                .map(user => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        {user.isAdmin ? (
                          <UserCog className="w-5 h-5 text-primary" />
                        ) : (
                          <User className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{user.name}</p>
                          {user.isAdmin && (
                            <Badge variant="secondary" className="text-xs">Admin</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImpersonate(user.id)}
                      disabled={impersonating || user.id === profile?.id}
                      className="shrink-0 ml-2"
                      data-testid={`button-impersonate-${user.id}`}
                    >
                      {impersonating ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        "View As"
                      )}
                    </Button>
                  </div>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Impersonation Indicator */}
      {isImpersonating && (
        <motion.div
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="fixed top-0 left-0 right-0 bg-amber-500 text-black py-2 px-4 z-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <UserCog className="w-4 h-4" />
            <span className="text-sm font-medium">
              Viewing as: {profile?.name || profile?.id}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReturnToAdmin}
            className="text-black hover:bg-amber-600"
            data-testid="button-return-to-admin"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Return to Admin
          </Button>
        </motion.div>
      )}
    </div>
  );
}
