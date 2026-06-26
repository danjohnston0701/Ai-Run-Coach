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
//
// FREE TIER — 14-day trial only.  These limits apply during the trial window.
// Once trial_expires_at has passed, the server enforces "trial_expired" (all zeros).
// Route generation and training plans are NOT available on the free trial —
// users must upgrade to access those features at all.
export const TIER_LIMITS: Record<string, TierLimits> = {
  free: {
    aiCoachingKm: 15,              // 15 km of AI-coached running during the 14-day trial
    trainingPlansGenerated: 0,     // Not available on free trial — paid plans only
    routesGenerated: 0,            // Not available on free trial — paid plans only
    postRunAnalyses: 3,            // 3 AI post-run summaries during the trial
  },
  // Hard block applied server-side when trial_expires_at is in the past for a free user.
  // All limits are 0 — every feature request is rejected with a 402 upgrade required.
  trial_expired: {
    aiCoachingKm: 0,
    trainingPlansGenerated: 0,
    routesGenerated: 0,
    postRunAnalyses: 0,
  },
  lite: {
    aiCoachingKm: 50,
    trainingPlansGenerated: 1,
    routesGenerated: 10,
    postRunAnalyses: 15,
  },
  standard: {
    aiCoachingKm: 200,
    trainingPlansGenerated: 3,
    routesGenerated: 30,
    postRunAnalyses: 50,
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
