import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, UserPlus, Users, Play, Settings, Loader2, Send, Eye, Radio } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface NotificationPreferences {
  friendRequest: boolean;
  friendAccepted: boolean;
  groupRunInvite: boolean;
  groupRunStarting: boolean;
  liveRunInvite: boolean;
  liveObserverJoined: boolean;
  runCompleted: boolean;
  weeklyProgress: boolean;
}

interface UserProfile {
  id?: string;
  name: string;
}

const NOTIFICATION_TYPES = [
  {
    key: 'friendRequest' as const,
    label: 'Friend Requests',
    description: 'When someone sends you a friend request',
    icon: UserPlus,
    testType: 'friend_request',
  },
  {
    key: 'friendAccepted' as const,
    label: 'Friend Accepted',
    description: 'When someone accepts your friend request',
    icon: Users,
    testType: 'friend_accepted',
  },
  {
    key: 'groupRunInvite' as const,
    label: 'Group Run Invitations',
    description: 'When you\'re invited to a group run',
    icon: Users,
    testType: 'group_run_invite',
  },
  {
    key: 'groupRunStarting' as const,
    label: 'Group Run Starting',
    description: 'When a group run you\'re in is about to start',
    icon: Play,
    testType: 'group_run_starting',
  },
  {
    key: 'liveRunInvite' as const,
    label: 'Live Run Invitations',
    description: 'When a friend invites you to watch their live run',
    icon: Eye,
    testType: 'live_run_invite',
  },
  {
    key: 'liveObserverJoined' as const,
    label: 'Friend Watching Your Run',
    description: 'When a friend starts watching your live run',
    icon: Radio,
    testType: 'live_observer_joined',
  },
  {
    key: 'runCompleted' as const,
    label: 'Run Completed',
    description: 'Summary when you complete a run',
    icon: Bell,
    testType: null,
  },
  {
    key: 'weeklyProgress' as const,
    label: 'Weekly Progress',
    description: 'Weekly summary of your running stats',
    icon: Bell,
    testType: null,
  },
];

export default function ManageNotifications() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [testingType, setTestingType] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const userProfile = localStorage.getItem("userProfile");
    if (userProfile) {
      setProfile(JSON.parse(userProfile));
    }
  }, []);

  const { data: preferences, isLoading } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notification-preferences', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return {
        friendRequest: true,
        friendAccepted: true,
        groupRunInvite: true,
        groupRunStarting: true,
        liveRunInvite: true,
        liveObserverJoined: true,
        runCompleted: false,
        weeklyProgress: false,
      };
      const res = await fetch(`/api/notification-preferences/${profile.id}`);
      if (!res.ok) throw new Error('Failed to fetch preferences');
      return res.json();
    },
    enabled: !!profile?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async (newPrefs: Partial<NotificationPreferences>) => {
      if (!profile?.id) throw new Error('No user profile');
      const res = await fetch(`/api/notification-preferences/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preferences, ...newPrefs }),
      });
      if (!res.ok) throw new Error('Failed to update preferences');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notification-preferences'] });
      toast.success('Preferences updated');
    },
    onError: () => {
      toast.error('Failed to update preferences');
    },
  });

  const testMutation = useMutation({
    mutationFn: async (type: string) => {
      if (!profile?.id) throw new Error('No user profile');
      setTestingType(type);
      const res = await fetch(`/api/push/test/${profile.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to send test notification');
      }
      return res.json();
    },
    onSuccess: (_, type) => {
      toast.success(`Test ${type.replace('_', ' ')} notification sent! Check your device.`);
      setTestingType(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setTestingType(null);
    },
  });

  const handleToggle = (key: keyof NotificationPreferences) => {
    if (!preferences) return;
    updateMutation.mutate({ [key]: !preferences[key] });
  };

  const allEnabled = preferences ? Object.values(preferences).every(v => v === true) : false;
  
  const handleToggleAll = () => {
    if (!preferences) return;
    const newValue = !allEnabled;
    const allPrefs: NotificationPreferences = {
      friendRequest: newValue,
      friendAccepted: newValue,
      groupRunInvite: newValue,
      groupRunStarting: newValue,
      liveRunInvite: newValue,
      liveObserverJoined: newValue,
      runCompleted: newValue,
      weeklyProgress: newValue,
    };
    updateMutation.mutate(allPrefs);
  };

  const handleTest = (testType: string) => {
    testMutation.mutate(testType);
  };

  if (isLoading || !preferences) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/10"
      >
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/profile")}
              className="rounded-full text-foreground hover:bg-white/10"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-display font-bold uppercase tracking-wide">Manage Notifications</h1>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="bg-card/50 rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <p className="text-sm text-muted-foreground">
              Choose which notifications you want to receive. Test buttons send a sample notification to your device.
            </p>
          </div>

          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                allEnabled ? 'bg-primary/20' : 'bg-white/5'
              }`}>
                <Bell className={`w-5 h-5 ${allEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-sm font-bold">All Notifications</p>
                <p className="text-[10px] text-muted-foreground">Enable or disable all notifications at once</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAll}
              disabled={updateMutation.isPending}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                allEnabled ? 'bg-green-500' : 'bg-white/20'
              }`}
              data-testid="toggle-all-notifications"
            >
              <span 
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  allEnabled ? 'left-7' : 'left-1'
                }`} 
              />
            </button>
          </div>

          <div className="divide-y divide-white/5">
            {NOTIFICATION_TYPES.map((notifType) => {
              const Icon = notifType.icon;
              const isEnabled = preferences[notifType.key];
              
              return (
                <div 
                  key={notifType.key}
                  className="p-4 flex items-center justify-between gap-4"
                  data-testid={`notification-row-${notifType.key}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isEnabled ? 'bg-primary/20' : 'bg-white/5'
                    }`}>
                      <Icon className={`w-5 h-5 ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{notifType.label}</p>
                      <p className="text-[10px] text-muted-foreground">{notifType.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {notifType.testType && isEnabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTest(notifType.testType!)}
                        disabled={testingType !== null}
                        className="h-8 px-2 text-xs text-primary hover:bg-primary/10"
                        data-testid={`button-test-${notifType.key}`}
                      >
                        {testingType === notifType.testType ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    
                    <button
                      type="button"
                      onClick={() => handleToggle(notifType.key)}
                      disabled={updateMutation.isPending}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        isEnabled ? 'bg-green-500' : 'bg-white/20'
                      }`}
                      data-testid={`toggle-${notifType.key}`}
                    >
                      <span 
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          isEnabled ? 'left-7' : 'left-1'
                        }`} 
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
          <p className="text-xs text-amber-400">
            <strong>Note:</strong> Push notifications must be enabled in your Profile settings first. 
            If you don't receive test notifications, check that notifications are enabled for this app in your device settings.
          </p>
        </div>
      </main>
    </div>
  );
}
