import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
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
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfUse from "@/pages/TermsOfUse";
import Login from "@/pages/Login";
import AdminAIConfig from "@/pages/AdminAIConfig";

function Router() {
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userProfile = localStorage.getItem("userProfile");
    setHasProfile(!!userProfile);
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <Switch>
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfUse} />
      <Route path="/login" component={Login} />
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
          <Route path="/profile" component={Profile} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/admin/ai-config" component={AdminAIConfig} />
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
        <Toaster />
        <SonnerToaster position="top-center" richColors />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
