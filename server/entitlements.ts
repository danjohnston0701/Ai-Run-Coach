import type { User } from "@shared/schema";

export interface EntitlementStatus {
  hasPremiumAccess: boolean;
  entitlementType: "subscription" | "one_time" | "coupon" | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

export function checkEntitlementStatus(user: User): EntitlementStatus {
  const now = new Date();
  
  if (user.entitlementType && user.entitlementExpiresAt) {
    const expiresAt = new Date(user.entitlementExpiresAt);
    const isExpired = expiresAt < now;
    
    return {
      hasPremiumAccess: !isExpired,
      entitlementType: user.entitlementType as "subscription" | "one_time" | "coupon",
      expiresAt,
      isExpired,
    };
  }
  
  if (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") {
    return {
      hasPremiumAccess: true,
      entitlementType: "subscription",
      expiresAt: null,
      isExpired: false,
    };
  }
  
  return {
    hasPremiumAccess: false,
    entitlementType: null,
    expiresAt: null,
    isExpired: false,
  };
}

export function hasPremiumAccess(user: User): boolean {
  // TEMPORARILY DISABLED - All users have premium access
  // To reactivate: return checkEntitlementStatus(user).hasPremiumAccess;
  return true;
}
