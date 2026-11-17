/**
 * Free-trial plan cap.
 *
 * A plan made on the free trial is generated only far enough to hold its first
 * TRIAL_PLAN_SESSION_CAP sessions (2–3 weeks; week 1 can be short). Only those sessions are
 * unlocked: any later sessions in the generated weeks are locked, and the next block isn't
 * generated. The apps show every week after them greyed out with a lock. Once the runner has
 * AI Plans (a paid tier with AI Plans, or a promo grant) the cap is lifted on the next read
 * (`activePlanCap`): the column is cleared and the rest of the plan is generated.
 *
 * `training_plans.trial_session_cap` holds the cap; NULL = no cap. The server enforces it, so
 * an app that doesn't know about locking still can't start a locked session's coaching.
 */
import { db } from "./db";
import { users, trainingPlans, plannedWorkouts, weeklyPlans } from "@shared/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { effectiveTier } from "./usage-service";
import { getLimitsForTier } from "./tier-limits";

export const TRIAL_PLAN_SESSION_CAP = 4;

type UserLike = {
  id: string;
  subscriptionTier?: string | null;
  trialExpiresAt?: Date | null;
  createdAt?: Date | null;
  aiPlansEnabled?: boolean | null;
};

/** Whether the user's current plan includes AI Plans: a paid tier with AI Plans, or a promo grant. */
export async function userHasAiPlans(user: UserLike): Promise<boolean> {
  const tier = effectiveTier(user.subscriptionTier, user.trialExpiresAt, user.createdAt);
  if (tier !== "free" && tier !== "trial_expired") {
    const aiPlans = user.aiPlansEnabled ?? true;
    if (aiPlans && getLimitsForTier(tier, aiPlans).trainingPlansGenerated > 0) return true;
  }
  try {
    const { hasUnlimitedGrant } = await import("./coupon-service");
    return await hasUnlimitedGrant(user.id, "trainingPlansGenerated");
  } catch {
    return false;
  }
}

/** The cap a plan generated for this user right now should get (null = full plan). */
export async function capForNewPlan(userId: string): Promise<number | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  return (await userHasAiPlans(user)) ? null : TRIAL_PLAN_SESSION_CAP;
}

/** Weeks to generate so a capped plan holds its free sessions: one spare for a short week 1. */
export function trialWeeksToGenerate(cap: number, daysPerWeek: number): number {
  return Math.ceil(cap / Math.max(1, daysPerWeek)) + 1;
}

/**
 * Whether the plan is still capped, without lifting anything. Used where lifting must not
 * recurse (generateNextBlock).
 */
export async function isPlanCapped(plan: { userId: string; trialSessionCap?: number | null }): Promise<boolean> {
  if (plan.trialSessionCap == null) return false;
  const [user] = await db.select().from(users).where(eq(users.id, plan.userId)).limit(1);
  return !(user && (await userHasAiPlans(user)));
}

/**
 * The cap as it applies now. If the runner has since got AI Plans, lifts it: clears the column
 * and generates the next block in the background (it was held back), then returns null.
 */
export async function activePlanCap(plan: {
  id: string;
  userId: string;
  trialSessionCap?: number | null;
}): Promise<number | null> {
  if (plan.trialSessionCap == null) return null;
  if (await isPlanCapped(plan)) return plan.trialSessionCap;

  // Atomic claim: only the request that actually clears the cap starts the generation, so two
  // reads at once can't both generate a block.
  const claimed = await db
    .update(trainingPlans)
    .set({ trialSessionCap: null })
    .where(and(eq(trainingPlans.id, plan.id), isNotNull(trainingPlans.trialSessionCap)))
    .returning({ id: trainingPlans.id });
  if (claimed.length > 0) {
    console.log(`[PlanTrialCap] Runner has AI Plans now: lifted the trial cap on plan ${plan.id}, generating the rest`);
    const { generateNextBlock } = await import("./training-plan-service");
    generateNextBlock(plan.id, plan.userId).catch((err) =>
      console.error(`[PlanTrialCap] Next block after unlocking plan ${plan.id} failed:`, err)
    );
  }
  return null;
}

/**
 * IDs of the plan's locked sessions: every non-rest workout after the first `cap` in schedule
 * order. Rest days are never locked (there's nothing to unlock).
 */
export async function lockedWorkoutIds(planId: string, cap: number): Promise<Set<string>> {
  const rows = await db
    .select({
      id: plannedWorkouts.id,
      workoutType: plannedWorkouts.workoutType,
      scheduledDate: plannedWorkouts.scheduledDate,
      dayOfWeek: plannedWorkouts.dayOfWeek,
      weekNumber: weeklyPlans.weekNumber,
    })
    .from(plannedWorkouts)
    .innerJoin(weeklyPlans, eq(plannedWorkouts.weeklyPlanId, weeklyPlans.id))
    .where(eq(plannedWorkouts.trainingPlanId, planId));

  const sessions = rows
    .filter((r) => (r.workoutType ?? "").toLowerCase() !== "rest")
    .sort((a, b) => {
      const ta = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      if ((a.weekNumber ?? 0) !== (b.weekNumber ?? 0)) return (a.weekNumber ?? 0) - (b.weekNumber ?? 0);
      // Monday-first within a week (day_of_week is 0 = Sunday).
      return ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7);
    });
  return new Set(sessions.slice(cap).map((r) => r.id));
}

/** Locked session IDs for a plan as things stand now (empty when the plan isn't capped). */
export async function lockedWorkoutIdsForPlan(plan: {
  id: string;
  userId: string;
  trialSessionCap?: number | null;
}): Promise<Set<string>> {
  const cap = await activePlanCap(plan);
  return cap == null ? new Set() : lockedWorkoutIds(plan.id, cap);
}

/** Whether a single planned workout is locked by its plan's trial cap. */
export async function isWorkoutLocked(workoutId: string): Promise<boolean> {
  const [row] = await db
    .select({ planId: plannedWorkouts.trainingPlanId })
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.id, workoutId))
    .limit(1);
  if (!row) return false;
  const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, row.planId)).limit(1);
  if (!plan || plan.trialSessionCap == null) return false;
  return (await lockedWorkoutIdsForPlan(plan)).has(workoutId);
}

/** 403 body for a locked session; the apps show it as the upgrade prompt. */
export const PLAN_SESSION_LOCKED = {
  error: "plan_session_locked",
  message: `Your free trial includes the first ${TRIAL_PLAN_SESSION_CAP} sessions of your plan. Upgrade to a plan with AI Plans to unlock the rest.`,
  upgradeRequired: true,
};
