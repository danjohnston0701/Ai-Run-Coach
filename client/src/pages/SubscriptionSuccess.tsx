import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Home, PartyPopper, Loader } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entitlementInfo, setEntitlementInfo] = useState<{
    tier: string;
    expiresAt?: string;
  } | null>(null);

  useEffect(() => {
    const completeCheckout = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get("session_id");
        
        const userProfile = localStorage.getItem("userProfile");
        const user = userProfile ? JSON.parse(userProfile) : null;
        const userId = user?.id;

        if (!sessionId || !userId) {
          setError("Missing checkout information");
          setProcessing(false);
          return;
        }

        const res = await fetch("/api/stripe/complete-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, userId }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to complete checkout");
        }

        const data = await res.json();
        setEntitlementInfo({
          tier: data.tier,
          expiresAt: data.expiresAt,
        });

        queryClient.invalidateQueries({ queryKey: ["entitlement"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["subscription"], exact: false });
        
        setProcessing(false);
      } catch (err: any) {
        console.error("Checkout completion error:", err);
        setError(err.message || "Failed to activate your subscription");
        setProcessing(false);
      }
    };

    completeCheckout();
  }, [queryClient]);

  if (processing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-6 text-center space-y-6">
            <Loader className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <h1 className="text-xl font-bold">Activating your subscription...</h1>
              <p className="text-muted-foreground text-sm mt-2">
                Please wait while we set up your account
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-red-500/30">
          <CardContent className="pt-8 pb-6 text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
              <span className="text-3xl">!</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold">Something went wrong</h1>
              <p className="text-muted-foreground">{error}</p>
            </div>
            <Button onClick={() => setLocation("/pricing")} className="w-full">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tierLabel = entitlementInfo?.tier === "early_bird" 
    ? "Early Bird 30-Day Trial" 
    : "Standard Subscription";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <Card className="border-green-500/30">
          <CardContent className="pt-8 pb-6 text-center space-y-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
              className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center"
            >
              <Check className="h-10 w-10 text-green-500" />
            </motion.div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <PartyPopper className="h-6 w-6 text-yellow-500" />
                <h1 className="text-2xl font-bold" data-testid="text-success-title">
                  Welcome to AI Run Coach!
                </h1>
              </div>
              <p className="text-muted-foreground">
                Your {tierLabel} is now active.
              </p>
              {entitlementInfo?.expiresAt && (
                <p className="text-sm text-muted-foreground">
                  Access expires: {new Date(entitlementInfo.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
              <p className="font-medium text-sm">What's included:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  AI-powered route generation
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Real-time voice coaching
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Live run sharing
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Performance analytics
                </li>
              </ul>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={() => setLocation("/")}
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4 mr-2" />
              Start Running
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
