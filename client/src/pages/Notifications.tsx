import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, UserPlus, Route, Trophy, Clock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Notification {
  id: string;
  type: 'friend_request' | 'friend_accepted' | 'route_shared' | 'achievement' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

interface UserProfile {
  id?: string;
  name: string;
}

export default function Notifications() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const userProfile = localStorage.getItem("userProfile");
    if (userProfile) {
      setProfile(JSON.parse(userProfile));
    }
  }, []);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const res = await fetch(`/api/notifications?userId=${profile.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!profile?.id,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      const res = await fetch(`/api/notifications/mark-all-read?userId=${profile.id}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to mark all as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'friend_request':
      case 'friend_accepted':
        return <UserPlus className="w-5 h-5" />;
      case 'route_shared':
        return <Route className="w-5 h-5" />;
      case 'achievement':
        return <Trophy className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-background p-6 pb-24 font-sans text-foreground">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-wider">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending}
            data-testid="button-mark-all-read"
          >
            Mark all read
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-12 text-center"
        >
          <Bell className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-medium text-muted-foreground mb-2">No notifications yet</h2>
          <p className="text-sm text-muted-foreground/70">
            You'll see friend requests and updates here
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card 
                className={`cursor-pointer transition-colors ${
                  notification.read 
                    ? 'bg-card/50 border-white/5' 
                    : 'bg-primary/5 border-primary/20'
                }`}
                onClick={() => {
                  if (!notification.read) {
                    markAsReadMutation.mutate(notification.id);
                  }
                }}
                data-testid={`notification-${notification.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${
                      notification.read ? 'bg-muted' : 'bg-primary/20'
                    }`}>
                      <div className={notification.read ? 'text-muted-foreground' : 'text-primary'}>
                        {getIcon(notification.type)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`font-medium text-sm ${
                          notification.read ? 'text-muted-foreground' : 'text-foreground'
                        }`}>
                          {notification.title}
                        </h3>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground/70">
                        <Clock className="w-3 h-3" />
                        {formatTime(notification.createdAt)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
