// =============================================================================
// Usage Service — helpers for checking monthly quotas and incrementing usage.
//
// All four gated features run through this file so limit enforcement stays in
// one place. To change limits, edit server/tier-limits.ts only.
// =============================================================================

import { Response } from "express";
import { storage } from "./storage";
import { getLimitsForTier, TierLimits } from "./tier-limits";

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
  createdAt?: Date | null
): Promise<UsageWithLimits> {
  const yearMonth = currentYearMonth();
  const row = await storage.getMonthlyUsage(userId, yearMonth);

  // Resolve effective tier — "trial_expired" if free user's window has closed
  const resolvedTier = effectiveTier(tier, trialExpiresAt, createdAt);
  const limits = getLimitsForTier(resolvedTier);

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
  createdAt?: Date | null
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

  const resolvedTier = effectiveTier(tier, trialExpiresAt, createdAt);
  const limits = getLimitsForTier(resolvedTier);
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

  const yearMonth = currentYearMonth();
  const row = await storage.getMonthlyUsage(userId, yearMonth);
  const current = row[feature] as number;

  if (current + amount > limit) {
    const featureLabel: Record<GatedFeature, string> = {
      aiCoachingKm: "AI coaching",
      trainingPlansGenerated: "Plans",
      routesGenerated: "Routes",
      postRunAnalyses: "post-run AI analysis",
    };

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
  storage.incrementUsage(userId, yearMonth, { [feature]: amount } as any).catch((err) => {
    console.error(`[UsageService] Failed to record usage for user=${userId} feature=${feature}:`, err);
  });
}

// ── Private helpers ───────────────────────────────────────────────────────────

function nextMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1)); // month is 1-based, so +1 = Date constructor 0-index month next month
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}
