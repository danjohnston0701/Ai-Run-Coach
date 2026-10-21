// Keeps an AI plan in step with the runs a runner actually does, wherever they were recorded.
//
// Only a run started FROM a planned session used to count. Every reviewed customer plan
// drifted because of that: Julie ran the morning after creating her plan as a free run,
// Emma's runs arrive from Strava (club runs), Damion did a free run instead of his session.
// Their sessions stayed "not done", orientations never completed, so the plans never got
// real targets and the next block never generated.
//
// Order of matching for a run with no linked workout:
//   1. the plan's pending orientation (first run after the plan was created)
//   2. an open planned session scheduled on the same date as the run
import { db } from "./db";
import { runs, trainingPlans, weeklyPlans, plannedWorkouts, sessionInstructions as sessionInstructionsTable } from "@shared/schema";
import { eq, and, desc, lt, inArray, ne, sql } from "drizzle-orm";
import { enrichWorkoutBlock, getWorkoutIdsForPlanWeeks, markPlanEnrichedThroughWeek } from "./session-enrichment-service";
import { checkAndGeneratePendingBlocks } from "./training-plan-service";

// ── Enrich weeks 1-2 once the orientation session is done ────────────────
// Every way an orientation can become complete must call this — auto-complete from a saved
// run, the manual "Mark complete" and "Skip". Only auto-complete did, so a manually-completed
// orientation left the plan on placeholder targets indefinitely (Damion, 2026-10-06).
// Background, idempotent enough to re-run: enrichment overwrites targets.
// Coaching plans cached before this ran carry the placeholder targets — mark them stale so
// the version gate regenerates them on next open (cheaper than regenerateCoaching=true,
// which would generate a plan for every workout whether or not it is ever opened).
export function enrichWeeksAfterOrientation(planId: string, userId: string, source: string): void {
  setImmediate(async () => {
    try {
      console.log(`[${source}] Orientation complete — enriching weeks 1-2 for plan ${planId}`);
      const allIds = await getWorkoutIdsForPlanWeeks(planId, [1, 2]);
      const open = allIds.length === 0 ? [] : (await db.select({ id: plannedWorkouts.id, isCompleted: plannedWorkouts.isCompleted })
        .from(plannedWorkouts).where(inArray(plannedWorkouts.id, allIds)))
        .filter(w => !w.isCompleted).map(w => w.id);
      if (open.length > 0) {
        await enrichWorkoutBlock(userId, open);
        await db.update(sessionInstructionsTable).set({ generatedVersion: "0" })
          .where(inArray(sessionInstructionsTable.plannedWorkoutId, open));
      }
      await markPlanEnrichedThroughWeek(planId, 2);
      console.log(`[${source}] ✅ Weeks 1-2 enriched after orientation for plan ${planId} (${open.length} workouts)`);
    } catch (e) {
      console.error(`[${source}] Enrichment after orientation failed for plan ${planId}:`, e);
    }
  });
}

function runKm(run: any): number {
  const d = Number(run?.distance ?? 0);
  return d > 200 ? d / 1000 : d;
}

// 3:00–20:00/km. Emma's 2026-10-11 "run" was 4.2 km in 8 min (a car or bike left recording).
function plausiblePace(run: any): boolean {
  const km = runKm(run);
  const secs = Number(run?.movingTime ?? run?.duration ?? 0);
  if (!(km > 0) || !(secs > 0)) return false;
  const pace = secs / km;
  return pace >= 180 && pace <= 1200;
}

function isWalk(run: any): boolean {
  return String(run?.sessionType ?? "run").toLowerCase() === "walk";
}

async function linkRun(run: any, workout: { id: string; planId: string; workoutType: string; intensity: string | null; description: string | null }): Promise<string> {
  await db.update(runs).set({
    linkedWorkoutId: workout.id,
    linkedPlanId: workout.planId,
    workoutType: workout.workoutType,
    workoutIntensity: workout.intensity ?? null,
    workoutDescription: workout.description ?? null,
  } as any).where(eq(runs.id, run.id));
  return workout.id;
}

// ── 1. The first run after a plan is created completes its orientation ───
// That run is exactly the calibration data the orientation exists to collect.
export async function linkRunToPendingOrientation(run: any): Promise<string | null> {
  if (!run?.userId || isWalk(run) || !(runKm(run) >= 1) || !plausiblePace(run)) return null;
  const runAt = new Date(run.completedAt ?? run.createdAt ?? Date.now());
  const [pending] = await db
    .select({ id: plannedWorkouts.id, planId: trainingPlans.id, workoutType: plannedWorkouts.workoutType, intensity: plannedWorkouts.intensity, description: plannedWorkouts.description })
    .from(plannedWorkouts)
    .innerJoin(trainingPlans, eq(plannedWorkouts.trainingPlanId, trainingPlans.id))
    .where(and(
      eq(trainingPlans.userId, run.userId),
      eq(trainingPlans.status, "active"),
      eq(plannedWorkouts.workoutType, "orientation"),
      eq(plannedWorkouts.isCompleted, false),
      lt(trainingPlans.createdAt, runAt),
    ))
    .orderBy(desc(trainingPlans.createdAt))
    .limit(1);
  if (!pending) return null;
  await linkRun(run, pending);
  console.log(`✅ [planSync] Run ${run.id} linked to pending orientation ${pending.id}`);
  return pending.id;
}

// ── 2. A free or imported run on a session's date is that session ─────────
// Same calendar date only (run_date is the runner's local date; planned dates are stored as
// that date at UTC midnight). With several open sessions that day, the closest in distance.
// A walk only counts for a walk-run session, and a run well short of the planned distance
// (under half) doesn't complete it.
export async function linkRunToSameDayWorkout(run: any): Promise<string | null> {
  if (!run?.userId) return null;
  const km = runKm(run);
  if (!(km >= 1) || !plausiblePace(run)) return null;
  const runDate: string | null = run.runDate
    ?? (run.completedAt ? new Date(run.completedAt).toISOString().slice(0, 10) : null);
  if (!runDate) return null;
  const candidates = await db
    .select({
      id: plannedWorkouts.id, planId: trainingPlans.id, workoutType: plannedWorkouts.workoutType,
      intensity: plannedWorkouts.intensity, description: plannedWorkouts.description, distance: plannedWorkouts.distance,
    })
    .from(plannedWorkouts)
    .innerJoin(trainingPlans, eq(plannedWorkouts.trainingPlanId, trainingPlans.id))
    .where(and(
      eq(trainingPlans.userId, run.userId),
      eq(trainingPlans.status, "active"),
      eq(plannedWorkouts.isCompleted, false),
      ne(plannedWorkouts.workoutType, "rest"),
      ne(plannedWorkouts.workoutType, "orientation"),
      sql`${plannedWorkouts.scheduledDate}::date = ${runDate}::date`,
    ));
  const fits = candidates.filter(w =>
    (!isWalk(run) || String(w.workoutType).includes("walk")) &&
    (w.distance == null || km >= w.distance * 0.5));
  if (fits.length === 0) return null;
  fits.sort((a, b) => Math.abs((a.distance ?? km) - km) - Math.abs((b.distance ?? km) - km));
  await linkRun(run, fits[0]);
  console.log(`✅ [planSync] Run ${run.id} (${runDate}) linked to same-day ${fits[0].workoutType} ${fits[0].id}`);
  return fits[0].id;
}

// ── Server-side auto-complete of the run's planned workout ───────────────
// Called whenever a run is saved or imported (new, Case-0 merge, Case-2 merge, Strava).
// Idempotent — skips silently if already completed or no workout matches.
export async function autoCompleteLinkedWorkout(runId: string): Promise<void> {
  const [savedRun] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!savedRun) return;
  const wid = (savedRun as any).linkedWorkoutId
    ?? await linkRunToPendingOrientation(savedRun)
    ?? await linkRunToSameDayWorkout(savedRun);
  if (!wid) return;

  const [pw] = await db.select().from(plannedWorkouts).where(eq(plannedWorkouts.id, wid)).limit(1);
  // A skipped workout (completed, no run) that the runner then did anyway gets the run.
  if (!pw || ((pw as any).isCompleted && (pw as any).completedRunId)) return;

  await db.update(plannedWorkouts)
    .set({ isCompleted: true, completedRunId: runId })
    .where(eq(plannedWorkouts.id, wid));
  console.log(`✅ [autoComplete] Planned workout ${wid} marked complete via run ${runId}`);

  // ── Orientation session completion → trigger enrichment for weeks 1-2 ──────
  // When a new user completes their orientation run, we now have real pace + HR data
  // to enrich all week 1-2 sessions with accurate numeric targets.
  if ((pw as any).workoutType === "orientation" && (pw as any).trainingPlanId) {
    enrichWeeksAfterOrientation((pw as any).trainingPlanId, (savedRun as any).userId, "autoComplete");
  }

  // Advance the week if all workouts in this week are now done
  if ((pw as any).weeklyPlanId && (pw as any).trainingPlanId) {
    const weekWorkouts = await db.select().from(plannedWorkouts)
      .where(eq(plannedWorkouts.weeklyPlanId, (pw as any).weeklyPlanId));
    if (weekWorkouts.every((w: any) => w.isCompleted)) {
      const [week] = await db.select().from(weeklyPlans)
        .where(eq(weeklyPlans.id, (pw as any).weeklyPlanId)).limit(1);
      if (week) {
        await db.update(trainingPlans)
          .set({ currentWeek: (week as any).weekNumber + 1 })
          .where(eq(trainingPlans.id, (pw as any).trainingPlanId));
        console.log(`📅 [autoComplete] Week ${(week as any).weekNumber} complete — advanced to ${(week as any).weekNumber + 1}`);
      }
    }
  }
}

// For run sources outside POST /api/runs (Strava webhook/import): the same plan updates a
// phone-saved run gets — complete its session, then generate the next block if it's due.
export async function syncImportedRunWithPlan(runId: string, userId: string): Promise<void> {
  try {
    await autoCompleteLinkedWorkout(runId);
    await checkAndGeneratePendingBlocks(userId);
  } catch (err) {
    console.error(`[planSync] Imported run ${runId} plan sync failed:`, err);
  }
}
