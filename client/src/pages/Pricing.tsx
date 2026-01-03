import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, Loader, ArrowLeft, Crown, Zap, Gift, Timer } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useEntitlement, hasPremiumAccess, getEntitlementLabel, getExpiryInfo } from "@/hooks/useSubscription";

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
  metadata: { tier?: string; mode?: string };
  prices: Price[];
}

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [redeemingCoupon, setRedeemingCoupon] = useState(false);
  const queryClient = useQueryClient();

  const userProfile = localStorage.getItem("userProfile");
  const user = userProfile ? JSON.parse(userProfile) : null;
  const userId = user?.id;

  const { data: entitlement } = useEntitlement(userId);
  const isPremium = hasPremiumAccess(entitlement);
  const entitlementLabel = getEntitlementLabel(entitlement);
  const expiryInfo = getExpiryInfo(entitlement);

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["stripe-products"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const handleSubscribe = async (priceId: string, isOneTime: boolean) => {
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
        body: JSON.stringify({ 
          priceId, 
          userId,
          mode: isOneTime ? "payment" : "subscription"
        }),
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

  const handleRedeemCoupon = async () => {
    if (!userId) {
      toast.error("Please log in first");
      setLocation("/login");
      return;
    }

    if (!couponCode.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }

    setRedeemingCoupon(true);
    try {
      const res = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: couponCode.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to redeem coupon");
      }

      toast.success(data.message || "Coupon redeemed successfully!");
      setCouponCode("");
      
      queryClient.invalidateQueries({ queryKey: ["entitlement"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["subscription"], exact: false });
      
      setTimeout(() => setLocation("/"), 1500);
    } catch (error: any) {
      console.error("Coupon error:", error);
      toast.error(error.message || "Failed to redeem coupon");
    } finally {
      setRedeemingCoupon(false);
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

  const earlyBirdFeatures = [
    "AI-powered route generation",
    "Real-time AI voice coaching",
    "GPS run tracking",
    "Hill & weather-aware advice",
    "Run history & analytics",
    "30 days of full access",
  ];

  const standardFeatures = [
    "Everything in Early Bird",
    "Unlimited monthly access",
    "Live run sharing with friends",
    "Advanced performance insights",
    "Priority support",
    "Cancel anytime",
  ];

  const findProduct = (keyword: string) => {
    return products?.find(p => 
      p.name.toLowerCase().includes(keyword.toLowerCase()) ||
      p.metadata?.tier?.toLowerCase().includes(keyword.toLowerCase())
    );
  };

  const earlyBirdProduct = findProduct("early") || findProduct("trial");
  const standardProduct = findProduct("standard") || findProduct("subscription");

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

        {isPremium && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="border-green-500/50 bg-green-500/10">
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-green-500" />
                  <div>
                    <span className="font-medium">{entitlementLabel}</span>
                    {expiryInfo && (
                      <span className="text-sm text-muted-foreground ml-2">
                        • {expiryInfo}
                      </span>
                    )}
                  </div>
                </div>
                {entitlement?.entitlementType === "subscription" && (
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
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {productsLoading ? (
          <div className="flex justify-center py-20">
            <Loader className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="h-full" data-testid="card-plan-early-bird">
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-3">
                    <Timer className="h-10 w-10 text-orange-500" />
                  </div>
                  <CardTitle className="text-2xl">Early Bird 30-Day Trial</CardTitle>
                  <CardDescription>Perfect for trying out AI coaching</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center">
                    <span className="text-4xl font-bold">$4.99</span>
                    <span className="text-muted-foreground"> NZD</span>
                    <p className="text-sm text-muted-foreground mt-1">One-time payment</p>
                  </div>

                  <ul className="space-y-3">
                    {earlyBirdFeatures.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    size="lg"
                    variant="outline"
                    onClick={() => earlyBirdProduct?.prices[0] && handleSubscribe(earlyBirdProduct.prices[0].id, true)}
                    disabled={!!loading || isPremium || !earlyBirdProduct}
                    data-testid="button-subscribe-early-bird"
                  >
                    {loading === earlyBirdProduct?.prices[0]?.id ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : isPremium ? (
                      "Already Active"
                    ) : (
                      "Get Early Bird Access"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card 
                className="h-full relative border-primary/50 bg-gradient-to-b from-primary/5 to-transparent"
                data-testid="card-plan-standard"
              >
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                  Best Value
                </Badge>
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-3">
                    <Crown className="h-10 w-10 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Standard Subscription</CardTitle>
                  <CardDescription>For dedicated runners</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center">
                    <span className="text-4xl font-bold">$14.99</span>
                    <span className="text-muted-foreground"> NZD/month</span>
                    <p className="text-sm text-muted-foreground mt-1">Billed monthly</p>
                  </div>

                  <ul className="space-y-3">
                    {standardFeatures.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => standardProduct?.prices[0] && handleSubscribe(standardProduct.prices[0].id, false)}
                    disabled={!!loading || (isPremium && entitlement?.entitlementType === "subscription") || !standardProduct}
                    data-testid="button-subscribe-standard"
                  >
                    {loading === standardProduct?.prices[0]?.id ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : isPremium && entitlement?.entitlementType === "subscription" ? (
                      "Currently Subscribed"
                    ) : (
                      "Subscribe Monthly"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}

        {!isPremium && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-dashed" data-testid="card-coupon">
              <CardContent className="py-6">
                <div className="flex items-center gap-3 mb-4">
                  <Gift className="h-5 w-5 text-purple-500" />
                  <span className="font-medium">Have a coupon code?</span>
                </div>
                <div className="flex gap-3">
                  <Input
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="flex-1"
                    data-testid="input-coupon-code"
                  />
                  <Button
                    onClick={handleRedeemCoupon}
                    disabled={redeemingCoupon || !couponCode.trim()}
                    data-testid="button-redeem-coupon"
                  >
                    {redeemingCoupon ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      "Redeem"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-8">
          All payments are securely processed by Stripe. Prices in NZD.
        </p>
      </div>
    </div>
  );
}
