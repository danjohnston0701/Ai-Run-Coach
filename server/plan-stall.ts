// A runner who goes quiet for a week restarts where they left off instead of jumping ahead.
// Damion (2026-10) missed all of week 2; the plan carried on and put him into week 3's
// 6–8 minute run segments after 9 days off.
//
// Daily: an active plan whose runner hasn't run for 7+ days (but has within 28), with a session at least 7
// days overdue, has every open session from that session's week onward moved back a week
// (same weekdays), and its next block a week later. Completed sessions stay where they are.
//
// Race-dated plans keep their race: the plan is one week shorter instead (total_weeks − 1,
// only while blocks remain to generate). A fully generated race plan is never moved —
// that needs a coach's decision, so it's only logged.
import { db } from "./db";
import { storage } from "./storage";
import { runs, trainingPlans, weeklyPlans, plannedWorkouts } from "@shared/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { sendFirebasePush } from "./notification-service";

const DAY_MS = 24 * 60 * 60 * 1000;
const QUIET_DAYS = 7;
const ENGAGED_DAYS = 28;

export async function shiftStalledPlans(now: Date = new Date(), notify = true): Promise<string[]> {
  const shifted: string[] = [];
  const quietSince = new Date(now.getTime() - QUIET_DAYS * DAY_MS);
  const plans = await db.select().from(trainingPlans).where(eq(trainingPlans.status, "active"));

  for (const plan of plans) {
    try {
      const [recentRun] = await db.select({ id: runs.id }).from(runs)
        .where(and(eq(runs.userId, plan.userId), gte(runs.completedAt, quietSince))).limit(1);
      if (recentRun) continue;
      // Gone a month or more: they've stopped, not missed a week — leave the plan (and their
      // notifications) alone rather than nudge it on every week.
      const [engaged] = await db.select({ id: runs.id }).from(runs)
        .where(and(eq(runs.userId, plan.userId), gte(runs.completedAt, new Date(now.getTime() - ENGAGED_DAYS * DAY_MS)))).limit(1);
      if (!engaged) continue;

      const sessions = await db
        .select({ id: plannedWorkouts.id, scheduledDate: plannedWorkouts.scheduledDate, isCompleted: plannedWorkouts.isCompleted,
          workoutType: plannedWorkouts.workoutType, weekNumber: weeklyPlans.weekNumber })
        .from(plannedWorkouts)
        .innerJoin(weeklyPlans, eq(plannedWorkouts.weeklyPlanId, weeklyPlans.id))
        .where(eq(plannedWorkouts.trainingPlanId, plan.id));
      const open = sessions.filter(s => !s.isCompleted && s.workoutType !== "rest" && s.scheduledDate);
      const overdue = open
        .filter(s => new Date(s.scheduledDate!).getTime() <= quietSince.getTime())
        .sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime())[0];
      if (!overdue) continue;

      const toMove = open.filter(s => s.weekNumber >= overdue.weekNumber).map(s => s.id);
      if (toMove.length === 0) continue;

      const fullyGenerated = plan.generatedThroughWeek == null || plan.generatedThroughWeek >= plan.totalWeeks;
      if (plan.targetDate) {
        const lastAfterMove = Math.max(...open.filter(s => toMove.includes(s.id)).map(s => new Date(s.scheduledDate!).getTime())) + 7 * DAY_MS;
        if (fullyGenerated && lastAfterMove > new Date(plan.targetDate).getTime()) {
          console.warn(`[PlanStall] Plan ${plan.id}: runner quiet ${QUIET_DAYS}+ days but the race date leaves no room to move — needs a coach's decision`);
          continue;
        }
      }

      await db.transaction(async tx => {
        await tx.update(plannedWorkouts)
          .set({ scheduledDate: sql`${plannedWorkouts.scheduledDate} + interval '7 days'` } as any)
          .where(inArray(plannedWorkouts.id, toMove));
        await tx.update(trainingPlans).set({
          nextBlockAt: plan.nextBlockAt ? new Date(new Date(plan.nextBlockAt).getTime() + 7 * DAY_MS) : null,
          currentWeek: overdue.weekNumber,
          // A race plan absorbs the lost week in the blocks still to generate.
          ...(plan.targetDate && !fullyGenerated && plan.totalWeeks > (plan.generatedThroughWeek ?? 0) + 1
            ? { totalWeeks: plan.totalWeeks - 1 } : {}),
        }).where(eq(trainingPlans.id, plan.id));
      });

      const title = "Your plan has moved back a week";
      const message = `No runs for a week — no problem. We've moved week ${overdue.weekNumber} to start again this week, so you pick up where you left off.`;
      if (notify) await storage.createNotification({
        userId: plan.userId, title, message, type: "coaching_plan_reminder",
        data: { type: "coaching_plan_reminder", planId: plan.id, reason: "plan_shifted" }, read: false,
      } as any).catch(() => {});
      if (notify) await sendFirebasePush(plan.userId, title, message, { type: "coaching_plan_reminder", planId: plan.id }).catch(() => false);

      shifted.push(plan.id);
      console.log(`[PlanStall] Plan ${plan.id}: runner quiet ${QUIET_DAYS}+ days — moved ${toMove.length} session(s) from week ${overdue.weekNumber} on back a week`);
    } catch (err) {
      console.error(`[PlanStall] Plan ${plan.id} failed:`, err);
    }
  }
  return shifted;
}
