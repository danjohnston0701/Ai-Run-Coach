import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import RunSession from "@/pages/RunSession";
import RunHistory from "@/pages/RunHistory";
import RunInsights from "@/pages/RunInsights";
import ProfileSetup from "@/pages/ProfileSetup";
import Profile from "@/pages/Profile";

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
      {!hasProfile && <Route path="/" component={ProfileSetup} />}
      {hasProfile && (
        <>
          <Route path="/" component={Home} />
          <Route path="/run" component={RunSession} />
          <Route path="/history" component={RunHistory} />
          <Route path="/history/:id" component={RunInsights} />
          <Route path="/profile" component={Profile} />
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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
