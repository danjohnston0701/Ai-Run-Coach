import { useQuery } from "@tanstack/react-query";

export interface EntitlementStatus {
  hasPremiumAccess: boolean;
  entitlementType: "subscription" | "one_time" | "coupon" | null;
  expiresAt: string | null;
  isExpired: boolean;
}

export function useEntitlement(userId: string | null) {
  return useQuery<EntitlementStatus>({
    queryKey: ["entitlement", userId],
    queryFn: async () => {
      if (!userId) {
        return { hasPremiumAccess: false, entitlementType: null, expiresAt: null, isExpired: false };
      }
      const res = await fetch(`/api/entitlement/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch entitlement");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}

interface SubscriptionData {
  subscription: any | null;
  tier: string | null;
  status: string | null;
}

export function useSubscription(userId: string | null) {
  return useQuery<SubscriptionData>({
    queryKey: ["subscription", userId],
    queryFn: async () => {
      if (!userId) {
        return { subscription: null, tier: null, status: null };
      }
      const res = await fetch(`/api/stripe/subscription/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch subscription");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}

export function hasActiveSubscription(data: SubscriptionData | undefined): boolean {
  if (!data) return false;
  if (data.subscription) return true;
  if (data.status === 'active' || data.status === 'trialing') return true;
  return false;
}

export function getSubscriptionTier(data: SubscriptionData | undefined): string | null {
  if (!data) return null;
  return data.tier;
}

export function hasPremiumAccess(entitlement: EntitlementStatus | undefined): boolean {
  // TEMPORARILY DISABLED - All users have premium access
  // To reactivate: if (!entitlement) return false; return entitlement.hasPremiumAccess;
  return true;
}

export function getEntitlementLabel(entitlement: EntitlementStatus | undefined): string {
  if (!entitlement || !entitlement.hasPremiumAccess) return "";
  
  switch (entitlement.entitlementType) {
    case "subscription":
      return "Standard Subscriber";
    case "one_time":
      return "Early Bird";
    case "coupon":
      return "Free Trial";
    default:
      return "Premium";
  }
}

export function getExpiryInfo(entitlement: EntitlementStatus | undefined): string | null {
  if (!entitlement?.expiresAt) return null;
  
  const expiresAt = new Date(entitlement.expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysLeft <= 0) return "Expired";
  if (daysLeft === 1) return "Expires tomorrow";
  if (daysLeft <= 7) return `Expires in ${daysLeft} days`;
  
  return `Expires on ${expiresAt.toLocaleDateString()}`;
}
