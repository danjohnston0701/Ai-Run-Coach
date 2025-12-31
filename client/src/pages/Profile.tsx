import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Save, User, Camera, Upload, UserPlus, X, Users, Check, Bell, BellOff, Clock, Loader2, Pencil } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const FITNESS_LEVELS = ["Unfit", "Casual", "Athletic", "Very Fit", "Elite"];

export interface Friend {
  name: string;
  email?: string;
}

interface ProfileData {
  id?: string;
  email?: string;
  name: string;
  dob: string;
  gender: string;
  height: string;
  weight: string;
  fitnessLevel: string;
  desiredFitnessLevel: string;
  coachName: string;
  profilePic?: string;
  friends?: Friend[];
}

interface FriendRequest {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: string;
  requesterName?: string;
  requesterEmail?: string;
  addresseeName?: string;
  addresseeEmail?: string;
  createdAt: string;
}

interface SearchUser {
  id: string;
  name: string;
  email: string;
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const savedProfile = localStorage.getItem("userProfile");
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      if (!parsed.friends) {
        parsed.friends = [];
      }
      setProfile(parsed);

      if ('Notification' in window) {
        setNotificationsEnabled(Notification.permission === 'granted');
      }
    } else {
      setLocation("/");
    }
  }, [setLocation]);

  const { data: incomingRequests = [], isLoading: loadingIncoming } = useQuery({
    queryKey: ['friend-requests-incoming', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const res = await fetch(`/api/friend-requests/incoming/${profile.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!profile?.id,
  });

  const { data: outgoingRequests = [], isLoading: loadingOutgoing } = useQuery({
    queryKey: ['friend-requests-outgoing', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const res = await fetch(`/api/friend-requests/outgoing/${profile.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!profile?.id,
  });

  const sendRequestMutation = useMutation({
    mutationFn: async (addresseeId: string) => {
      const res = await apiRequest('POST', '/api/friend-requests', {
        requesterId: profile?.id,
        addresseeId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast.success('Friend request sent!');
      queryClient.invalidateQueries({ queryKey: ['friend-requests-outgoing'] });
      setFriendSearchQuery("");
      setShowAddFriend(false);
      setSearchResults([]);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send friend request');
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ requestId, action, requesterName, requesterEmail }: { requestId: string; action: 'accept' | 'reject'; requesterName?: string; requesterEmail?: string }) => {
      const res = await apiRequest('POST', `/api/friend-requests/${requestId}/respond`, {
        action,
        userId: profile?.id,
      });
      return { response: await res.json(), requesterName, requesterEmail, action };
    },
    onSuccess: ({ requesterName, requesterEmail, action }) => {
      toast.success(action === 'accept' ? 'Friend added!' : 'Request declined');
      queryClient.invalidateQueries({ queryKey: ['friend-requests-incoming'] });
      
      if (action === 'accept' && profile && requesterName) {
        const newFriend: Friend = {
          name: requesterName,
          email: requesterEmail,
        };
        const updatedFriends = [...(profile.friends || []), newFriend];
        const updatedProfile = { ...profile, friends: updatedFriends };
        setProfile(updatedProfile);
        localStorage.setItem("userProfile", JSON.stringify(updatedProfile));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to respond to request');
    },
  });

  useEffect(() => {
    const searchUsers = async () => {
      if (friendSearchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(friendSearchQuery)}`);
        if (res.ok) {
          const users = await res.json();
          const filtered = users.filter((u: SearchUser) => 
            u.id !== profile?.id && 
            !profile?.friends?.some(f => f.email === u.email) &&
            !outgoingRequests.some((r: FriendRequest) => r.addresseeId === u.id)
          );
          setSearchResults(filtered);
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [friendSearchQuery, profile?.id, profile?.friends, outgoingRequests]);

  const handleEnableNotifications = async () => {
    if (!profile?.id) return;
    const result = await registerPushSubscription(profile.id);
    if (result.success) {
      setNotificationsEnabled(true);
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
        case 'not_configured':
          toast.error('Push notifications are not configured on this server.');
          break;
        default:
          toast.error('Could not enable notifications. Try refreshing the page and allowing when prompted.');
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
    setShowPhotoOptions(false);
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
    setShowPhotoOptions(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange("profilePic", reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (field: keyof ProfileData, value: string) => {
    if (!profile) return;
    setProfile(prev => ({ ...prev!, [field]: value }));
  };

  const formatDateInput = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value);
    handleChange("dob", formatted);
  };

  const handleSendRequest = (user: SearchUser) => {
    sendRequestMutation.mutate(user.id);
  };

  const handleRemoveFriend = (index: number) => {
    if (!profile) return;
    const updatedFriends = profile.friends?.filter((_, i) => i !== index) || [];
    setProfile({ ...profile, friends: updatedFriends });
    toast.success("Friend removed");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    if (!profile.name) {
      toast.error("Please fill in your name");
      return;
    }
    
    // Save to database if user has an ID
    if (profile.id) {
      try {
        const res = await fetch(`/api/users/${profile.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: profile.name,
            dob: profile.dob,
            gender: profile.gender,
            height: profile.height,
            weight: profile.weight,
            fitnessLevel: profile.fitnessLevel,
            desiredFitnessLevel: profile.desiredFitnessLevel,
            coachName: profile.coachName,
            profilePic: profile.profilePic,
          }),
        });
        if (res.ok) {
          const updatedUser = await res.json();
          localStorage.setItem("userProfile", JSON.stringify(updatedUser));
          toast.success("Profile saved!");
        } else {
          toast.error("Failed to save profile");
          return;
        }
      } catch (error) {
        console.error("Error saving profile:", error);
        toast.error("Failed to save profile");
        return;
      }
    } else {
      localStorage.setItem("userProfile", JSON.stringify(profile));
      toast.success("Profile saved!");
    }
    
    setLocation("/");
  };

  const handleSaveEmail = async () => {
    if (!profile?.id || !newEmail) {
      toast.error("Please enter a valid email");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    try {
      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      
      if (res.ok) {
        const updatedUser = await res.json();
        setProfile(prev => prev ? { ...prev, email: newEmail } : null);
        localStorage.setItem("userProfile", JSON.stringify(updatedUser));
        setIsEditingEmail(false);
        setNewEmail("");
        toast.success("Email updated successfully");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update email");
      }
    } catch (error) {
      console.error("Error updating email:", error);
      toast.error("Failed to update email");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userProfile");
    toast.success("Logged out successfully");
    window.location.href = "/";
  };

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation("/")}
            className="rounded-full border-white/10 hover:bg-white/10"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-4xl font-display font-bold text-primary uppercase tracking-wider">Profile</h1>
            <p className="text-muted-foreground text-sm">Manage your personal details</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-2 uppercase tracking-widest text-[10px] font-bold"
          data-testid="button-logout"
        >
          Logout
        </Button>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto w-full"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="relative group">
            <div 
              className="w-24 h-24 rounded-full border-2 border-primary/50 overflow-hidden bg-white/5 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => setShowPhotoOptions(!showPhotoOptions)}
              data-testid="button-profile-photo"
            >
              {profile.profilePic ? (
                <img src={profile.profilePic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            
            <AnimatePresence>
              {showPhotoOptions && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full mt-2 w-48 bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={handleCameraClick}
                    className="w-full px-4 py-3 text-left text-xs font-display font-bold uppercase tracking-widest flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5"
                    data-testid="button-take-photo"
                  >
                    <Camera className="w-4 h-4 text-primary" /> Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="w-full px-4 py-3 text-left text-xs font-display font-bold uppercase tracking-widest flex items-center gap-3 hover:bg-white/5 transition-colors"
                    data-testid="button-upload-photo"
                  >
                    <Upload className="w-4 h-4 text-primary" /> From Gallery
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange}
            />
            <input 
              type="file" 
              ref={cameraInputRef} 
              className="hidden" 
              accept="image/*" 
              capture="user"
              onChange={handleFileChange}
            />
          </div>
          <button 
            type="button"
            onClick={() => setShowPhotoOptions(!showPhotoOptions)}
            className="mt-3 text-xs font-display font-bold text-primary uppercase tracking-widest flex items-center gap-2 hover:opacity-80"
          >
            Update Profile Photo
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 pb-24">
          <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-display font-bold uppercase tracking-wide">Personal Info</h2>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Your Name
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                data-testid="input-name"
              />
            </div>

            {profile.email && (
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                  Email
                </label>
                {isEditingEmail ? (
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Enter new email"
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                      data-testid="input-new-email"
                    />
                    <button
                      type="button"
                      onClick={handleSaveEmail}
                      className="px-3 py-2 bg-primary text-background rounded-xl hover:bg-primary/90 transition-colors"
                      data-testid="button-save-email"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsEditingEmail(false); setNewEmail(""); }}
                      className="px-3 py-2 bg-white/10 text-foreground rounded-xl hover:bg-white/20 transition-colors"
                      data-testid="button-cancel-email"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-muted-foreground"
                      data-testid="text-email"
                    >
                      {profile.email}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIsEditingEmail(true); setNewEmail(profile.email || ""); }}
                      className="px-3 py-3 bg-white/10 text-foreground rounded-xl hover:bg-white/20 transition-colors"
                      data-testid="button-edit-email"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Date of Birth
              </label>
              <input
                type="text"
                placeholder="DD/MM/YYYY"
                value={profile.dob}
                onChange={handleDateChange}
                maxLength={10}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                data-testid="input-dob"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Gender
              </label>
              <select
                value={profile.gender}
                onChange={(e) => handleChange("gender", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                data-testid="select-gender"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                  Height (cm)
                </label>
                <input
                  type="number"
                  value={profile.height}
                  onChange={(e) => handleChange("height", e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                  data-testid="input-height"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  value={profile.weight}
                  onChange={(e) => handleChange("weight", e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                  data-testid="input-weight"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
             <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-5 text-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
              </div>
              <h2 className="text-lg font-display font-bold uppercase tracking-wide">Fitness Goals</h2>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Current Level
              </label>
              <select
                value={profile.fitnessLevel}
                onChange={(e) => handleChange("fitnessLevel", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                data-testid="select-fitness-level"
              >
                {FITNESS_LEVELS.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Target Level
              </label>
              <select
                value={profile.desiredFitnessLevel}
                onChange={(e) => handleChange("desiredFitnessLevel", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                data-testid="select-target-level"
              >
                {FITNESS_LEVELS.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
          </div>

           <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-5 text-primary">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.5 9.5"/><path d="M12 12l9.5 2.5"/></svg>
              </div>
              <h2 className="text-lg font-display font-bold uppercase tracking-wide">Coach Config</h2>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1.5 ml-1">
                Coach's Name
              </label>
              <input
                type="text"
                value={profile.coachName}
                onChange={(e) => handleChange("coachName", e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors"
                data-testid="input-coach-name"
              />
            </div>
          </div>

          <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-display font-bold uppercase tracking-wide">Notifications</h2>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-[10px] text-muted-foreground">Get notified when friends add you</p>
              </div>
              {notificationsEnabled ? (
                <div className="flex items-center gap-2 text-green-500">
                  <Bell className="w-4 h-4" />
                  <span className="text-xs font-bold">ON</span>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleEnableNotifications}
                  className="h-8 px-3 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold"
                  data-testid="button-enable-notifications"
                >
                  Enable
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4 bg-card/50 p-6 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-display font-bold uppercase tracking-wide">Friends</h2>
              </div>
              <Button
                type="button"
                onClick={() => setShowAddFriend(true)}
                className="h-8 px-3 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold uppercase flex items-center gap-2"
                data-testid="button-add-friend"
              >
                <UserPlus className="w-3 h-3" /> Add
              </Button>
            </div>

            {incomingRequests.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Pending Requests ({incomingRequests.length})
                </p>
                <div className="space-y-2">
                  {incomingRequests.map((request: FriendRequest) => (
                    <div key={request.id} className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20" data-testid={`request-incoming-${request.id}`}>
                      <div>
                        <p className="text-sm font-medium text-foreground">{request.requesterName}</p>
                        <p className="text-[10px] text-muted-foreground">{request.requesterEmail}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => respondMutation.mutate({ 
                            requestId: request.id, 
                            action: 'accept',
                            requesterName: request.requesterName,
                            requesterEmail: request.requesterEmail
                          })}
                          disabled={respondMutation.isPending}
                          className="h-7 px-2 bg-green-500/20 hover:bg-green-500/30 text-green-500"
                          data-testid={`button-accept-${request.id}`}
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => respondMutation.mutate({ requestId: request.id, action: 'reject' })}
                          disabled={respondMutation.isPending}
                          className="h-7 px-2 bg-red-500/20 hover:bg-red-500/30 text-red-500"
                          data-testid={`button-reject-${request.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {outgoingRequests.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Sent Requests ({outgoingRequests.length})
                </p>
                <div className="space-y-2">
                  {outgoingRequests.map((request: FriendRequest) => (
                    <div key={request.id} className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/20" data-testid={`request-outgoing-${request.id}`}>
                      <div>
                        <p className="text-sm font-medium text-foreground">{request.addresseeName}</p>
                        <p className="text-[10px] text-muted-foreground">{request.addresseeEmail}</p>
                      </div>
                      <span className="text-[10px] text-blue-400 font-bold uppercase">Pending</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.friends && profile.friends.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Your Friends</p>
                {profile.friends.map((friend, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5" data-testid={`friend-${idx}`}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{friend.name}</p>
                      {friend.email && <p className="text-[10px] text-muted-foreground">{friend.email}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFriend(idx)}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                      data-testid={`button-remove-friend-${idx}`}
                    >
                      <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            ) : !incomingRequests.length && !outgoingRequests.length ? (
              <p className="text-xs text-muted-foreground italic">No friends yet. Add some to easily share runs!</p>
            ) : null}

            <AnimatePresence>
              {showAddFriend && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10 space-y-4"
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={friendSearchQuery}
                      onChange={(e) => setFriendSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                      placeholder="Search name or email..."
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                      autoFocus
                      data-testid="input-search-friend"
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {searchResults.length > 0 ? (
                      searchResults.map((user) => (
                        <div 
                          key={user.id}
                          onClick={() => handleSendRequest(user)}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-white/10 transition-all cursor-pointer group"
                          data-testid={`search-result-${user.id}`}
                        >
                          <div>
                            <p className="text-xs font-medium text-foreground">{user.name}</p>
                            <p className="text-[10px] text-muted-foreground">{user.email}</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100"
                            disabled={sendRequestMutation.isPending}
                          >
                            {sendRequestMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send Request'}
                          </Button>
                        </div>
                      ))
                    ) : friendSearchQuery.length > 1 && !isSearching ? (
                      <p className="text-[10px] text-center text-muted-foreground py-2 italic">No matching runners found</p>
                    ) : (
                      <p className="text-[10px] text-center text-muted-foreground py-2 italic">Start typing to search...</p>
                    )}
                  </div>

                  <Button
                    type="button"
                    onClick={() => {
                      setShowAddFriend(false);
                      setFriendSearchQuery("");
                      setSearchResults([]);
                    }}
                    variant="outline"
                    className="w-full border-white/10 text-[10px] h-8 font-bold uppercase tracking-widest"
                    data-testid="button-cancel-add-friend"
                  >
                    Cancel
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent z-50">
            <Button
              type="submit"
              size="lg"
              className="w-full h-16 text-xl font-display uppercase tracking-widest bg-primary text-background hover:bg-primary/90 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2"
              data-testid="button-save-profile"
            >
              <Save className="w-6 h-6" />
              Save Changes
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
