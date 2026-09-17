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
// FREE TIER — trial only. These limits apply per calendar month while the trial is
// open (trial_expires_at in the future). Once it has passed, the server enforces
// "trial_expired" (all zeros). Route generation and training plans are NOT available
// on the free trial — users must upgrade to access those features at all.
//
// LITE / STANDARD — the "with AI Plans" SKUs. The "no AI Plans" SKUs of the same tier
// (users.ai_plans_enabled = false) use the *_noaiplan entries below, which keep the
// original allowances; only the AI-Plans SKUs got the 2026-09 uplift.
export const TIER_LIMITS: Record<string, TierLimits> = {
  free: {
    aiCoachingKm: 50,              // 50 km of AI-coached running per month during the trial
    trainingPlansGenerated: 0,     // Not available on free trial — paid plans only
    routesGenerated: 0,            // Not available on free trial — paid plans only
    postRunAnalyses: 15,           // 15 AI post-run summaries per month during the trial
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
    aiCoachingKm: 100,
    trainingPlansGenerated: 1,
    routesGenerated: 10,
    postRunAnalyses: 20,
  },
  lite_noaiplan: {
    aiCoachingKm: 50,
    trainingPlansGenerated: 0,
    routesGenerated: 10,
    postRunAnalyses: 15,
  },
  standard: {
    aiCoachingKm: 400,
    trainingPlansGenerated: 3,
    routesGenerated: 30,
    postRunAnalyses: 75,
  },
  standard_noaiplan: {
    aiCoachingKm: 200,
    trainingPlansGenerated: 0,
    routesGenerated: 30,
    postRunAnalyses: 50,
  },
};

/** Users with no tier set, or an unknown tier, fall back to free limits. */
export const DEFAULT_TIER = "free";

/**
 * Returns the limits for a given tier string, defaulting to free.
 *
 * `aiPlansEnabled` selects the SKU variant: a paid tier with AI Plans switched off
 * resolves to its `<tier>_noaiplan` entry when one exists (free / trial_expired have no
 * variant — the flag is irrelevant there). Callers that pass nothing get the AI-Plans
 * allowances, matching the historical default of users.ai_plans_enabled.
 */
export function getLimitsForTier(
  tier: string | null | undefined,
  aiPlansEnabled: boolean = true
): TierLimits {
  const normalised = (tier ?? DEFAULT_TIER).toLowerCase().trim();
  if (!aiPlansEnabled) {
    const variant = TIER_LIMITS[`${normalised}_noaiplan`];
    if (variant) return variant;
  }
  return TIER_LIMITS[normalised] ?? TIER_LIMITS[DEFAULT_TIER];
}

/** Fraction of a monthly limit at which the "approaching your limit" email is sent. */
export const USAGE_ALERT_THRESHOLD = 0.9;

/**
 * Returns a human-readable label for a limit value.
 * Infinity → "Unlimited", numbers returned as-is.
 */
export function formatLimit(value: number): string {
  return value === Infinity ? "Unlimited" : String(value);
}
