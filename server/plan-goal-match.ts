// Which of the runner's goals a new training plan is for, and how long it runs.
//
// Karen (2026-11-23) set a goal for the Great North Run on 12 Sep 2027, then built a half-marathon
// plan from the plans screen instead of from the goal. The plan never saw the goal: it got the app's
// 8-week default, no race date and none of her notes, and would have "peaked" in January. Neither app
// sent a race date even when the plan was made from the goal. Now the server matches the goal itself
// (an explicit goalId still wins; only a goal of the same distance whose date hasn't passed).
// A race within MAX_RACE_PLAN_WEEKS sets the plan's length so it ends on race day. A race further
// out (Karen's is 42 weeks away) doesn't: runners keep a plan 6–10 weeks, so the plan keeps the
// length they chose and the race is only its long-term goal (Daniel, 2026-11-23) — the prompt
// says so (training-plan-service.ts longTermGoalNote).
// `GET /api/plan-goal-match` gives the apps the same answer, so the screen shows it.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { goals, trainingPlans } from "@shared/schema";

/** A race this many weeks out or fewer sets the plan length (the apps' longest plan); further
 *  out, the race is a long-term goal and the runner's chosen length stands. */
export const MAX_RACE_PLAN_WEEKS = 20;

/** The plan goal type a goal's distance means ("Half Marathon" → half_marathon), else null. */
export function planGoalTypeForGoal(goal: { distanceTarget?: string | null }): string | null {
  const d = (goal.distanceTarget ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!d) return null;
  if (d.includes("ultra")) return "ultra";
  if (d.includes("half")) return "half_marathon";
  if (d.includes("marathon")) return "marathon";
  if (/^10 ?k(m)?$/.test(d)) return "10k";
  if (/^5 ?k(m)?$/.test(d)) return "5k";
  const km = parseFloat(d.replace(/[^0-9.]/g, ""));
  if (!isFinite(km) || km <= 0) return null;
  if (Math.abs(km - 5) < 0.2) return "5k";
  if (Math.abs(km - 10) < 0.3) return "10k";
  if (Math.abs(km - 21.1) < 0.5) return "half_marathon";
  if (Math.abs(km - 42.2) < 0.8) return "marathon";
  return "custom";
}

/** The runner's local calendar date for a stored goal date (saved as midnight UTC of that day). */
function goalCalendarDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Weeks from week 1's Monday through the week holding the race, counted the way
 * generateTrainingPlan lays weeks out: week 1 is this week, or next week when the first session
 * day is already past Sunday (training-plan-service.ts weekShiftDays). Null when the race is not
 * after the first session day.
 */
export function weeksToRace(
  raceDate: Date,
  userTimezone: string | null,
  firstSessionStart: string = "tomorrow",
  now: Date = new Date(),
): number | null {
  const todayStr = userTimezone
    ? now.toLocaleDateString("en-CA", { timeZone: userTimezone })
    : now.toISOString().slice(0, 10);
  const today = new Date(todayStr + "T00:00:00Z");
  const todayIdx = (today.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const startsToday = String(firstSessionStart).toLowerCase() === "today";
  const weekShiftDays = todayIdx + (startsToday ? 0 : 1) >= 7 ? 7 : 0;
  const firstSession = new Date(today.getTime() + (startsToday ? 0 : 1) * 86_400_000);
  const race = goalCalendarDate(raceDate);
  if (race.getTime() <= firstSession.getTime()) return null;
  const weekOneMonday = new Date(today.getTime() + (weekShiftDays - todayIdx) * 86_400_000);
  const days = Math.round((race.getTime() - weekOneMonday.getTime()) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

export type PlanGoalMatch = {
  goal: typeof goals.$inferSelect;
  /** The goal's race day, when it has one in the future. */
  raceDate: Date | null;
  /** Plan length that ends in the race week; null when there's no usable race date. */
  raceWeeks: number | null;
  /** True when the race is further out than MAX_RACE_PLAN_WEEKS. */
  raceTooFar: boolean;
  /** Weeks to the race however far out it is (week 1 = this plan's first week); null without one. */
  weeksToRace: number | null;
};

function describe(goal: typeof goals.$inferSelect, userTimezone: string | null, firstSessionStart: string): PlanGoalMatch {
  const raw = goal.targetDate ? new Date(goal.targetDate) : null;
  const weeks = raw && !isNaN(raw.getTime()) ? weeksToRace(raw, userTimezone, firstSessionStart) : null;
  return {
    goal,
    raceDate: weeks != null ? raw : null,
    raceWeeks: weeks != null && weeks <= MAX_RACE_PLAN_WEEKS ? weeks : null,
    raceTooFar: weeks != null && weeks > MAX_RACE_PLAN_WEEKS,
    weeksToRace: weeks,
  };
}

/**
 * The goal a new plan of `goalType` is for: `explicitGoalId` when it's the runner's, else their
 * active goal of the same distance that isn't already driving another active plan — race-dated
 * goals first (soonest race), then by priority, then newest.
 */
export async function findGoalForPlan(
  userId: string,
  goalType: string,
  explicitGoalId: string | null,
  userTimezone: string | null,
  firstSessionStart: string = "tomorrow",
): Promise<PlanGoalMatch | null> {
  if (explicitGoalId) {
    const [g] = await db.select().from(goals).where(and(eq(goals.id, explicitGoalId), eq(goals.userId, userId))).limit(1);
    return g ? describe(g, userTimezone, firstSessionStart) : null;
  }
  if (!goalType || goalType === "custom") return null;

  const active = await db.select().from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, "active")))
    .orderBy(desc(goals.createdAt));
  // Only a goal this plan is relevant to: the same distance, and not a race that's already been.
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const sameDistance = active.filter(g =>
    planGoalTypeForGoal(g) === goalType && !(g.targetDate && new Date(g.targetDate).getTime() < today.getTime()));
  if (sameDistance.length === 0) return null;

  // A goal already linked to a plan that's still active belongs to that plan.
  const linkedIds = sameDistance.map(g => g.linkedTrainingPlanId).filter((x): x is string => !!x);
  const activePlanIds = new Set(
    linkedIds.length
      ? (await db.select({ id: trainingPlans.id }).from(trainingPlans)
          .where(and(inArray(trainingPlans.id, linkedIds), eq(trainingPlans.status, "active")))).map(p => p.id)
      : [],
  );
  const free = sameDistance
    .filter(g => !g.linkedTrainingPlanId || !activePlanIds.has(g.linkedTrainingPlanId))
    .map(g => describe(g, userTimezone, firstSessionStart));
  if (free.length === 0) return null;

  free.sort((a, b) => {
    if (!!a.raceDate !== !!b.raceDate) return a.raceDate ? -1 : 1;
    if (a.raceDate && b.raceDate) return a.raceDate.getTime() - b.raceDate.getTime();
    return (a.goal.priority ?? 1) - (b.goal.priority ?? 1);
  });
  return free[0];
}
