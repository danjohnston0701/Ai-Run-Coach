import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import Home from "@/pages/Home";
import RoutePreview from "@/pages/RoutePreview";
import RunSession from "@/pages/RunSession";
import RunHistory from "@/pages/RunHistory";
import RunInsights from "@/pages/RunInsights";
import ProfileSetup from "@/pages/ProfileSetup";
import Profile from "@/pages/Profile";
import Notifications from "@/pages/Notifications";
import ManageNotifications from "@/pages/ManageNotifications";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfUse from "@/pages/TermsOfUse";
import Login from "@/pages/Login";
import AdminAIConfig from "@/pages/AdminAIConfig";
import Routes from "@/pages/Routes";
import Events from "@/pages/Events";
import PreEvent from "@/pages/PreEvent";
import Goals from "@/pages/Goals";
import FriendProfile from "@/pages/FriendProfile";
import Features from "@/pages/Features";
import { migrateLocalDataToDatabase } from "@/lib/dataMigration";

function ScrollToTop() {
  const [location] = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  
  return null;
}

function Router() {
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userProfile = localStorage.getItem("userProfile");
    setHasProfile(!!userProfile);
    setLoading(false);
    
    // One-time cleanup: remove dummy/test runs from localStorage
    const CLEANUP_KEY = "dummyRunsCleanedUp";
    if (!localStorage.getItem(CLEANUP_KEY)) {
      const runHistory = localStorage.getItem("runHistory");
      if (runHistory) {
        try {
          const runs = JSON.parse(runHistory);
          const dummyIds = ["run-1", "run-2", "run-3"];
          const filteredRuns = runs.filter((run: { id: string }) => !dummyIds.includes(run.id));
          if (filteredRuns.length !== runs.length) {
            localStorage.setItem("runHistory", JSON.stringify(filteredRuns));
            console.log(`Cleaned up ${runs.length - filteredRuns.length} dummy runs from localStorage`);
          }
        } catch (e) {
          console.warn("Failed to cleanup dummy runs:", e);
        }
      }
      localStorage.setItem(CLEANUP_KEY, "true");
    }
    
    // Auto-migrate local data to database for logged-in users
    if (userProfile) {
      try {
        const profile = JSON.parse(userProfile);
        if (profile.id) {
          migrateLocalDataToDatabase(profile.id).then((result) => {
            if (result.runs > 0) {
              toast.success(`Synced ${result.runs} run${result.runs > 1 ? 's' : ''} to your account!`);
            }
          });
        }
      } catch (e) {
        console.warn("Failed to trigger data migration:", e);
      }
    }
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <Switch>
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfUse} />
      <Route path="/login" component={Login} />
      <Route path="/features" component={Features} />
      {!hasProfile && (
        <>
          <Route path="/" component={LandingPage} />
          <Route path="/setup" component={ProfileSetup} />
        </>
      )}
      {hasProfile && (
        <>
          <Route path="/" component={Home} />
          <Route path="/setup" component={ProfileSetup} />
          <Route path="/route-preview" component={RoutePreview} />
          <Route path="/run" component={RunSession} />
          <Route path="/history" component={RunHistory} />
          <Route path="/history/:id" component={RunInsights} />
          <Route path="/goals" component={Goals} />
          <Route path="/profile" component={Profile} />
          <Route path="/friend/:friendId" component={FriendProfile} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/notifications/manage" component={ManageNotifications} />
          <Route path="/admin/ai-config" component={AdminAIConfig} />
          <Route path="/routes" component={Routes} />
          <Route path="/events" component={Events} />
          <Route path="/event/:id" component={PreEvent} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ScrollToTop />
        <Toaster />
        <SonnerToaster position="top-center" richColors />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
