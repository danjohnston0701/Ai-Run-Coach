import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Calendar, ArrowRight, Smartphone, User, Menu } from "lucide-react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState, useEffect } from "react";

interface MobileAppComingSoonProps {
  userName?: string;
  lastRunDistance?: number;
}

export function MobileAppComingSoon({ userName, lastRunDistance }: MobileAppComingSoonProps) {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<{ name?: string; profilePic?: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("userProfile");
    if (stored) {
      try {
        setProfile(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse profile:", e);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 pb-32">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" data-testid="button-menu">
                <Menu className="w-5 h-5 text-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader className="text-left">
                <SheetTitle className="text-primary font-display uppercase tracking-wider">Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 space-y-2">
                <button
                  onClick={() => { setMenuOpen(false); setLocation("/profile"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-profile"
                >
                  <User className="w-5 h-5 text-primary" />
                  <span className="font-medium">Profile</span>
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setLocation("/history"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-history"
                >
                  <History className="w-5 h-5 text-primary" />
                  <span className="font-medium">Run History</span>
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setLocation("/events"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid="menu-events"
                >
                  <Calendar className="w-5 h-5 text-primary" />
                  <span className="font-medium">Events</span>
                </button>
              </nav>
            </SheetContent>
          </Sheet>
          <div>
            <h1 className="text-4xl font-display font-bold text-primary uppercase tracking-wider">
              {profile?.name || userName || "Runner"}
            </h1>
            <p className="text-muted-foreground text-sm">Welcome to AI Run Coach</p>
          </div>
        </div>
        <motion.div 
          className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 cursor-pointer hover:bg-primary/30 transition-colors overflow-hidden"
          onClick={() => setLocation("/profile")}
          data-testid="button-profile"
        >
          {profile?.profilePic ? (
            <img src={profile.profilePic} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5 text-primary" />
          )}
        </motion.div>
      </header>

      <main className="space-y-6">
        {/* Mobile Apps Coming Soon */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-8"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/20 flex items-center justify-center">
            <Smartphone className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-display font-bold uppercase tracking-wide mb-3">
            Mobile Apps Coming Soon
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-8">
            We're building native mobile apps with GPS tracking, AI coaching, and more. Stay tuned!
          </p>
        </motion.div>

        <div className="grid gap-4">
          {/* Android App Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="relative overflow-hidden border-2 border-green-500/30 bg-green-500/5">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-8 h-8 text-green-500" fill="currentColor">
                      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-1.4-.59-2.96-.92-4.61-.92s-3.21.33-4.61.92L5.37 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.22 9.5C3.34 11.19 1.33 14.07 1 17.5h22c-.33-3.43-2.35-6.31-5.4-8.02zM7 15.25c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25zm10 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-display font-bold uppercase tracking-wide text-green-400">
                      Android App
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      Coming Soon
                    </p>
                    <Badge variant="outline" className="mt-2 border-green-500/50 text-green-400">
                      In Development
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* iOS App Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="relative overflow-hidden border-2 border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-8 h-8 text-blue-500" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-display font-bold uppercase tracking-wide text-blue-400">
                      iOS App
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      Coming Soon
                    </p>
                    <Badge variant="outline" className="mt-2 border-blue-500/50 text-blue-400">
                      In Development
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Previous Runs - Still accessible */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
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
              {lastRunDistance ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Last run</p>
                    <p className="font-display text-lg">{lastRunDistance.toFixed(2)} km</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-primary" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">View your run history</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Events - Still accessible */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card 
            className="relative overflow-hidden border-2 border-orange-500/30 bg-orange-500/5 cursor-pointer hover:border-orange-500/50 transition-all"
            onClick={() => setLocation("/events")}
            data-testid="card-events"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-orange-500" />
                <div className="flex-1">
                  <h3 className="text-lg font-display font-bold uppercase">Browse Events</h3>
                  <p className="text-sm text-muted-foreground">Find parkruns and races near you</p>
                </div>
                <ArrowRight className="w-5 h-5 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
