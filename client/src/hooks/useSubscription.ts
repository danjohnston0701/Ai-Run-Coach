import { useQuery } from "@tanstack/react-query";

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
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function hasActiveSubscription(data: SubscriptionData | undefined): boolean {
  if (!data) return false;
  // Check for active subscription in stripe data or user's stored status
  if (data.subscription) return true;
  if (data.status === 'active' || data.status === 'trialing') return true;
  return false;
}

export function getSubscriptionTier(data: SubscriptionData | undefined): string | null {
  if (!data) return null;
  return data.tier;
}
