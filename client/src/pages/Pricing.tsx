import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader, ArrowLeft, Crown, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useSubscription, hasActiveSubscription } from "@/hooks/useSubscription";

interface Price {
  id: string;
  unitAmount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface Product {
  id: string;
  name: string;
  description: string;
  metadata: { tier?: string };
  prices: Price[];
}

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState<string | null>(null);

  const userProfile = localStorage.getItem("userProfile");
  const user = userProfile ? JSON.parse(userProfile) : null;
  const userId = user?.id;

  const { data: subscription } = useSubscription(userId);
  const isSubscribed = hasActiveSubscription(subscription);

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["stripe-products"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const handleSubscribe = async (priceId: string) => {
    if (!userId) {
      toast.error("Please log in first");
      setLocation("/login");
      return;
    }

    setLoading(priceId);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, userId }),
      });

      if (!res.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { sessionUrl } = await res.json();
      window.location.href = sessionUrl;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!userId) return;
    
    setLoading("manage");
    try {
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) throw new Error("Failed to create portal session");

      const { portalUrl } = await res.json();
      window.location.href = portalUrl;
    } catch (error) {
      console.error("Portal error:", error);
      toast.error("Failed to open subscription management.");
    } finally {
      setLoading(null);
    }
  };

  // Sort products: Basic first, then Pro
  const sortedProducts = products?.sort((a, b) => {
    const tierOrder = { basic: 0, pro: 1 };
    const tierA = (a.metadata?.tier || "").toLowerCase();
    const tierB = (b.metadata?.tier || "").toLowerCase();
    return (tierOrder[tierA as keyof typeof tierOrder] ?? 99) - (tierOrder[tierB as keyof typeof tierOrder] ?? 99);
  });

  const tierFeatures: Record<string, string[]> = {
    basic: [
      "AI-powered route generation",
      "GPS run tracking",
      "Run history & stats",
      "Basic performance analytics",
      "Save up to 10 routes",
    ],
    pro: [
      "Everything in Basic",
      "Real-time AI voice coaching",
      "Live run sharing with friends",
      "Hill-awareness coaching",
      "Weather-aware advice",
      "Unlimited saved routes",
      "Advanced performance analytics",
      "Priority support",
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-6"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3" data-testid="text-title">
            Choose Your Plan
          </h1>
          <p className="text-muted-foreground">
            Unlock the full power of AI-powered running coaching
          </p>
        </div>

        {isSubscribed && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="border-green-500/50 bg-green-500/10">
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-green-500" />
                  <span className="font-medium">
                    You're subscribed to {subscription?.tier || "a plan"}!
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManageSubscription}
                  disabled={loading === "manage"}
                  data-testid="button-manage-subscription"
                >
                  {loading === "manage" ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    "Manage Subscription"
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {productsLoading ? (
          <div className="flex justify-center py-20">
            <Loader className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {sortedProducts?.map((product, index) => {
              const tier = (product.metadata?.tier || product.name).toLowerCase();
              const price = product.prices[0];
              const isPro = tier === "pro";
              const features = tierFeatures[tier] || [];

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    className={`h-full relative ${
                      isPro
                        ? "border-primary/50 bg-gradient-to-b from-primary/5 to-transparent"
                        : ""
                    }`}
                    data-testid={`card-plan-${tier}`}
                  >
                    {isPro && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                        Most Popular
                      </Badge>
                    )}
                    <CardHeader className="text-center pb-2">
                      <div className="flex justify-center mb-3">
                        {isPro ? (
                          <Crown className="h-10 w-10 text-primary" />
                        ) : (
                          <Zap className="h-10 w-10 text-blue-500" />
                        )}
                      </div>
                      <CardTitle className="text-2xl">{product.name}</CardTitle>
                      <CardDescription>{product.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="text-center">
                        <span className="text-4xl font-bold">
                          ${price ? (price.unitAmount / 100).toFixed(2) : "0.00"}
                        </span>
                        <span className="text-muted-foreground">/month</span>
                      </div>

                      <ul className="space-y-3">
                        {features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        className="w-full"
                        size="lg"
                        variant={isPro ? "default" : "outline"}
                        onClick={() => price && handleSubscribe(price.id)}
                        disabled={!!loading || isSubscribed}
                        data-testid={`button-subscribe-${tier}`}
                      >
                        {loading === price?.id ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : isSubscribed ? (
                          "Current Plan"
                        ) : (
                          `Get ${product.name}`
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-8">
          Cancel anytime. All payments are securely processed by Stripe.
        </p>
      </div>
    </div>
  );
}
