// =============================================================================
// Tier Limits — single source of truth for monthly feature quotas per plan.
//
// EDIT THESE VALUES to adjust what each plan allows per month.
// Set any value to Infinity to grant unlimited usage on that tier.
// =============================================================================

export interface TierLimits {
  /** Maximum km of AI-coached running per calendar month. */
  aiCoachingKm: number;
  /** Maximum training plans a user may generate per calendar month. */
  trainingPlansGenerated: number;
  /** Maximum routes generated (AI + template combined) per calendar month. */
  routesGenerated: number;
  /** Maximum post-run AI analyses triggered per calendar month. */
  postRunAnalyses: number;
}

// ── Per-tier limits ───────────────────────────────────────────────────────────
// Tiers are matched case-insensitively (e.g. "Free", "FREE", "free" all match).
export const TIER_LIMITS: Record<string, TierLimits> = {
  free: {
    aiCoachingKm: 10,
    trainingPlansGenerated: 1,
    routesGenerated: 3,
    postRunAnalyses: 5,
  },
  lite: {
    aiCoachingKm: 50,
    trainingPlansGenerated: 3,
    routesGenerated: 10,
    postRunAnalyses: 15,
  },
  standard: {
    aiCoachingKm: 200,
    trainingPlansGenerated: 10,
    routesGenerated: 30,
    postRunAnalyses: 50,
  },
  premium: {
    aiCoachingKm: Infinity,
    trainingPlansGenerated: Infinity,
    routesGenerated: Infinity,
    postRunAnalyses: Infinity,
  },
  pro: {
    aiCoachingKm: Infinity,
    trainingPlansGenerated: Infinity,
    routesGenerated: Infinity,
    postRunAnalyses: Infinity,
  },
};

/** Users with no tier set, or an unknown tier, fall back to free limits. */
export const DEFAULT_TIER = "free";

/** Returns the limits for a given tier string, defaulting to free. */
export function getLimitsForTier(tier: string | null | undefined): TierLimits {
  const normalised = (tier ?? DEFAULT_TIER).toLowerCase().trim();
  return TIER_LIMITS[normalised] ?? TIER_LIMITS[DEFAULT_TIER];
}

/**
 * Returns a human-readable label for a limit value.
 * Infinity → "Unlimited", numbers returned as-is.
 */
export function formatLimit(value: number): string {
  return value === Infinity ? "Unlimited" : String(value);
}
