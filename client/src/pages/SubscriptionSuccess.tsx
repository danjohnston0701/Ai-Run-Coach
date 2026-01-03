import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Home, PartyPopper } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Invalidate ALL subscription cache entries so the app picks up the new subscription
  useEffect(() => {
    // Use exact: false to invalidate all queries that start with "subscription"
    queryClient.invalidateQueries({ queryKey: ["subscription"], exact: false });
  }, [queryClient]);

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
                Your subscription is now active. You have full access to all premium features.
              </p>
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
