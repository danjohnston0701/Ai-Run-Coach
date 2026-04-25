// =============================================================================
// Usage Service — helpers for checking monthly quotas and incrementing usage.
//
// All four gated features run through this file so limit enforcement stays in
// one place. To change limits, edit server/tier-limits.ts only.
// =============================================================================

import { Response } from "express";
import { storage } from "./storage";
import { getLimitsForTier, TierLimits } from "./tier-limits";

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
 */
export async function getUsageWithLimits(
  userId: string,
  tier: string | null | undefined
): Promise<UsageWithLimits> {
  const yearMonth = currentYearMonth();
  const row = await storage.getMonthlyUsage(userId, yearMonth);
  const limits = getLimitsForTier(tier);

  const toApiLimit = (v: number) => (v === Infinity ? null : v);
  const toRemaining = (used: number, limit: number) =>
    limit === Infinity ? null : Math.max(0, limit - used);

  return {
    yearMonth,
    tier: (tier ?? "free").toLowerCase(),
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
 * Writes a 429 JSON response and returns false if the limit is reached —
 * the route handler should return immediately when this returns false.
 *
 * @param amount  For aiCoachingKm, pass the km to be used (check is "current + amount > limit").
 *                For count features, pass 1 (or omit).
 */
export async function checkAndEnforceLimit(
  res: Response,
  userId: string,
  tier: string | null | undefined,
  feature: GatedFeature,
  amount: number = 1
): Promise<boolean> {
  const limits = getLimitsForTier(tier);
  const limit = limits[feature];

  // Unlimited tier — skip the DB read entirely
  if (limit === Infinity) return true;

  const yearMonth = currentYearMonth();
  const row = await storage.getMonthlyUsage(userId, yearMonth);
  const current = row[feature] as number;

  if (current + amount > limit) {
    const featureLabel: Record<GatedFeature, string> = {
      aiCoachingKm: "AI coaching",
      trainingPlansGenerated: "training plan generation",
      routesGenerated: "route generation",
      postRunAnalyses: "post-run AI analysis",
    };

    res.status(429).json({
      error: "monthly_limit_reached",
      feature,
      message: `You've reached your monthly limit for ${featureLabel[feature]} on the ${(tier ?? "free")} plan. Upgrade to continue.`,
      limit,
      used: current,
      remaining: Math.max(0, limit - current),
      resetMonth: nextMonthLabel(yearMonth),
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
