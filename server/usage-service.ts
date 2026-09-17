// =============================================================================
// Usage Service — helpers for checking monthly quotas and incrementing usage.
//
// All four gated features run through this file so limit enforcement stays in
// one place. To change limits, edit server/tier-limits.ts only.
// =============================================================================

import { Response } from "express";
import { storage } from "./storage";
import { getLimitsForTier, TierLimits, USAGE_ALERT_THRESHOLD } from "./tier-limits";

// ── Trial expiry helpers ──────────────────────────────────────────────────────

/**
 * Returns true if a free-tier user's 14-day trial has expired.
 *
 * Paid users are NEVER considered trial-expired — this only blocks free accounts.
 * If `trialExpiresAt` is null (legacy account created before this migration),
 * we fall back to computing the expiry from `createdAt` + 14 days.
 */
export function isTrialExpired(
  tier: string | null | undefined,
  trialExpiresAt: Date | null | undefined,
  createdAt: Date | null | undefined
): boolean {
  // Paid subscribers are never blocked by trial expiry
  const normalised = (tier ?? "free").toLowerCase().trim();
  if (normalised !== "free") return false;

  const now = new Date();

  // Use server-set trialExpiresAt if available
  if (trialExpiresAt) return now > trialExpiresAt;

  // Fall back: compute from account creation date
  if (createdAt) {
    const fallbackExpiry = new Date(createdAt);
    fallbackExpiry.setDate(fallbackExpiry.getDate() + 14);
    return now > fallbackExpiry;
  }

  // Cannot determine — assume trial is still active (fail open, not closed)
  return false;
}

/**
 * Resolves the effective tier for limit enforcement.
 * Returns "trial_expired" when a free user's trial window has closed,
 * so getLimitsForTier() returns all-zero limits (hard block).
 */
export function effectiveTier(
  tier: string | null | undefined,
  trialExpiresAt: Date | null | undefined,
  createdAt: Date | null | undefined
): string {
  if (isTrialExpired(tier, trialExpiresAt, createdAt)) return "trial_expired";
  return (tier ?? "free").toLowerCase().trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the current calendar month as "YYYY-MM" in UTC. */
export function currentYearMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface UsageWithLimits {
  yearMonth: string;
  tier: string;
  usage: {
    aiCoachingKm: number;
    trainingPlansGenerated: number;
    routesGenerated: number;
    postRunAnalyses: number;
  };
  limits: {
    aiCoachingKm: number | null;        // null means "Unlimited"
    trainingPlansGenerated: number | null;
    routesGenerated: number | null;
    postRunAnalyses: number | null;
  };
  remaining: {
    aiCoachingKm: number | null;        // null means "Unlimited"
    trainingPlansGenerated: number | null;
    routesGenerated: number | null;
    postRunAnalyses: number | null;
  };
}

/**
 * Fetches current-month usage and tier limits for a user.
 * Suitable for the GET /api/usage/current API response.
 *
 * Pass `trialExpiresAt` and `createdAt` from the User record so trial
 * expiry is enforced — free-tier users whose trial has lapsed get all-zero
 * limits and the tier label "trial_expired".
 */
export async function getUsageWithLimits(
  userId: string,
  tier: string | null | undefined,
  trialExpiresAt?: Date | null,
  createdAt?: Date | null,
  aiPlansEnabled: boolean = true
): Promise<UsageWithLimits> {
  const yearMonth = currentYearMonth();
  const row = await storage.getMonthlyUsage(userId, yearMonth);

  // Resolve effective tier — "trial_expired" if free user's window has closed
  const resolvedTier = effectiveTier(tier, trialExpiresAt, createdAt);
  // getLimitsForTier() returns a direct reference into the shared TIER_LIMITS record —
  // never mutate it in place. Copy before applying the aiPlansEnabled override.
  const limits: TierLimits = { ...getLimitsForTier(resolvedTier, aiPlansEnabled) };
  // A "no AI Plans" SKU never generates plans regardless of tier. The tier-limits table
  // already carries a *_noaiplan variant for paid tiers; this covers any tier without one.
  if (!aiPlansEnabled) {
    limits.trainingPlansGenerated = 0;
  }

  const toApiLimit = (v: number) => (v === Infinity ? null : v);
  const toRemaining = (used: number, limit: number) =>
    limit === Infinity ? null : Math.max(0, limit - used);

  return {
    yearMonth,
    tier: resolvedTier,
    usage: {
      aiCoachingKm: row.aiCoachingKm,
      trainingPlansGenerated: row.trainingPlansGenerated,
      routesGenerated: row.routesGenerated,
      postRunAnalyses: row.postRunAnalyses,
    },
    limits: {
      aiCoachingKm: toApiLimit(limits.aiCoachingKm),
      trainingPlansGenerated: toApiLimit(limits.trainingPlansGenerated),
      routesGenerated: toApiLimit(limits.routesGenerated),
      postRunAnalyses: toApiLimit(limits.postRunAnalyses),
    },
    remaining: {
      aiCoachingKm: toRemaining(row.aiCoachingKm, limits.aiCoachingKm),
      trainingPlansGenerated: toRemaining(row.trainingPlansGenerated, limits.trainingPlansGenerated),
      routesGenerated: toRemaining(row.routesGenerated, limits.routesGenerated),
      postRunAnalyses: toRemaining(row.postRunAnalyses, limits.postRunAnalyses),
    },
  };
}

export type GatedFeature = keyof TierLimits;

/**
 * Checks whether a user has quota remaining for a feature.
 *
 * Returns true if allowed.
 * Writes a 402 or 429 JSON response and returns false if blocked —
 * the route handler should return immediately when this returns false.
 *
 * @param amount         For aiCoachingKm, pass the km to be used (check is "current + amount > limit").
 *                       For count features, pass 1 (or omit).
 * @param trialExpiresAt User's trial expiry timestamp (from DB) — used to enforce hard block.
 * @param createdAt      User's account creation timestamp — fallback for trial expiry calculation.
 */
export async function checkAndEnforceLimit(
  res: Response,
  userId: string,
  tier: string | null | undefined,
  feature: GatedFeature,
  amount: number = 1,
  trialExpiresAt?: Date | null,
  createdAt?: Date | null,
  aiPlansEnabled: boolean = true
): Promise<boolean> {
  // ── Trial expiry hard block ────────────────────────────────────────────────
  // This check runs before everything else — an expired trial blocks all features
  // regardless of remaining quota or promo codes.
  if (isTrialExpired(tier, trialExpiresAt, createdAt)) {
    res.status(402).json({
      error: "trial_expired",
      message:
        "Your 14-day free trial has ended. Upgrade to a paid plan to continue using AI Run Coach.",
      upgradeRequired: true,
    });
    return false;
  }

  // ── AI Plans opted out ──────────────────────────────────────────────────────
  // Orthogonal to tier — a "no AI Plans" SKU blocks generation regardless of the
  // tier's normal monthly allowance. A promo-code unlimited grant can still
  // override this (support may need to unlock it for a specific user).
  if (feature === "trainingPlansGenerated" && !aiPlansEnabled) {
    try {
      const { hasUnlimitedGrant } = await import("./coupon-service");
      if (await hasUnlimitedGrant(userId, feature)) {
        return true;
      }
    } catch (err) {
      console.error(`[UsageService] Error checking unlimited grant: ${err}`);
    }
    res.status(403).json({
      error: "ai_plans_not_included",
      feature,
      reason: "ai_plans_excluded",
      message: "AI Training Plans aren't included in your current plan. Switch to a Lite or Standard plan with AI Plans to generate one.",
      upgradeRequired: true,
      isFreeUser: false,
      limit: 0,
      used: 0,
      remaining: 0,
    });
    return false;
  }

  const resolvedTier = effectiveTier(tier, trialExpiresAt, createdAt);
  const limits = getLimitsForTier(resolvedTier, aiPlansEnabled);
  const limit = limits[feature];

  // Unlimited tier — skip the DB read entirely
  if (limit === Infinity) return true;

  // Check if user has an active promo code grant (unlimited for this feature)
  try {
    const { hasUnlimitedGrant } = await import("./coupon-service");
    if (await hasUnlimitedGrant(userId, feature)) {
      return true; // User has unlimited access via promo code
    }
  } catch (err) {
    // If coupon check fails, continue with regular limit enforcement
    console.error(`[UsageService] Error checking unlimited grant: ${err}`);
  }

  // ── Feature not included in this plan at all ────────────────────────────────
  // A zero allowance (free trial → AI plans/routes; paid tiers without a feature)
  // is not a "monthly limit reached" — there's nothing to wait for next month.
  // Give the clients a distinct code + a message they can show verbatim, so a
  // trial user sees "not included, upgrade" instead of "0 of 0 used, resets on…".
  if (limit === 0) {
    const notIncluded = featureNotIncludedResponse(feature, resolvedTier);
    res.status(403).json(notIncluded);
    return false;
  }

  const yearMonth = currentYearMonth();
  const row = await storage.getMonthlyUsage(userId, yearMonth);
  const current = row[feature] as number;

  if (current + amount > limit) {
    const featureLabel = FEATURE_LABELS;

    const nextMonth = nextMonthLabel(yearMonth);
    const isFreeUser = resolvedTier === "free" || !tier;

    let message = `You have reached the limit of ${featureLabel[feature]} for your ${resolvedTier} plan. `;
    if (isFreeUser) {
      message += `Upgrade to a paid plan to unlock more ${featureLabel[feature]}.`;
    } else {
      message += `Upgrade to a higher tier, or wait until ${nextMonth} to try again.`;
    }

    res.status(429).json({
      error: "monthly_limit_reached",
      feature,
      message,
      limit,
      used: current,
      remaining: Math.max(0, limit - current),
      resetMonth: nextMonth,
      isFreeUser,
    });
    return false;
  }

  return true;
}

/** Human-readable feature names shared by the limit responses and the availability endpoint. */
export const FEATURE_LABELS: Record<GatedFeature, string> = {
  aiCoachingKm: "AI coaching",
  trainingPlansGenerated: "AI Training Plans",
  routesGenerated: "Route generation",
  postRunAnalyses: "post-run AI analysis",
};

/**
 * Body for a feature whose allowance on the user's current plan is zero.
 * `error` stays `ai_plans_not_included` for training plans (the code the
 * ai_plans_enabled=false branch has always sent) so a client can treat "free trial"
 * and "paid plan without AI Plans" identically; `reason` distinguishes them.
 */
export function featureNotIncludedResponse(feature: GatedFeature, resolvedTier: string) {
  const isFreeTrial = resolvedTier === "free";
  const label = FEATURE_LABELS[feature];
  const message =
    feature === "trainingPlansGenerated"
      ? isFreeTrial
        ? "AI Training Plans aren't included in the free trial. Upgrade to a Lite or Standard plan with AI Plans to have your coach build a programme around your goal."
        : "AI Training Plans aren't included in your current plan. Switch to a Lite or Standard plan with AI Plans to generate one."
      : isFreeTrial
        ? `${label} isn't included in the free trial. Upgrade to a paid plan to unlock it.`
        : `${label} isn't included in your current plan. Upgrade to unlock it.`;
  return {
    error: feature === "trainingPlansGenerated" ? "ai_plans_not_included" : "feature_not_included",
    feature,
    reason: isFreeTrial ? "free_trial" : "not_in_tier",
    message,
    upgradeRequired: true,
    isFreeUser: isFreeTrial,
    limit: 0,
    used: 0,
    remaining: 0,
  };
}

/**
 * Increments a usage counter AFTER a successful operation.
 * Fire-and-forget — errors are logged but don't affect the response.
 */
export function recordUsage(
  userId: string,
  feature: GatedFeature,
  amount: number = 1
): void {
  const yearMonth = currentYearMonth();
  storage
    .incrementUsage(userId, yearMonth, { [feature]: amount } as any)
    .then((row) => maybeSendUsageAlert(userId, yearMonth, feature, row))
    .catch((err) => {
      console.error(`[UsageService] Failed to record usage for user=${userId} feature=${feature}:`, err);
    });
}

/**
 * Sends the "approaching your monthly limit" email the first time a feature's usage
 * crosses USAGE_ALERT_THRESHOLD of its limit in a given month. Once per feature per
 * month — recorded in monthly_usage.usage_alerts_sent so retries and later increments
 * don't re-send. Runs off the request path; failures are logged, never surfaced.
 */
async function maybeSendUsageAlert(
  userId: string,
  yearMonth: string,
  feature: GatedFeature,
  row: { [K in GatedFeature]: number } & { usageAlertsSent?: string[] | null }
): Promise<void> {
  if (row.usageAlertsSent?.includes(feature)) return;

  const user = await storage.getUser(userId);
  if (!user?.email) return;

  const resolvedTier = effectiveTier(user.subscriptionTier, user.trialExpiresAt, user.createdAt);
  const limit = getLimitsForTier(resolvedTier, user.aiPlansEnabled ?? true)[feature];
  if (!Number.isFinite(limit) || limit <= 0) return; // unlimited, or feature not on this tier

  const used = row[feature];
  if (used < limit * USAGE_ALERT_THRESHOLD) return;

  // Mark first so a slow/failed send can't double up on the next increment.
  await storage.markUsageAlertSent(userId, yearMonth, feature);

  const { sendUsageThresholdAlert } = await import("./email-service");
  await sendUsageThresholdAlert({
    userId,
    email: user.email,
    name: user.name ?? "",
    tier: resolvedTier,
    feature,
    used,
    limit,
    yearMonth,
    resetMonth: nextMonthLabel(yearMonth),
  });
}

// ── Private helpers ───────────────────────────────────────────────────────────

function nextMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1)); // month is 1-based, so +1 = Date constructor 0-index month next month
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}
