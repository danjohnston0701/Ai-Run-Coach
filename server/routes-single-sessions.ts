// One-off AI sessions: "I want a 40-minute interval session today, designed by my coach."
//
// The session goes through the same pipeline as a plan session, so it gets the same coaching:
//   1. this file designs the workout (type, structure, instructions) from the runner's history,
//      pace anchor, runner profile and any active plan (so it doesn't stack hard on hard);
//   2. enrichWorkoutBlock() sets the paces and HR zones exactly as it does for plan sessions;
//   3. the app opens the normal workout screen, whose POST /api/workouts/:id/prepare-coaching
//      generates the phases, live triggers and pre-run brief.
//
// planned_workouts needs a plan and a week, so each one-off session gets its own hidden
// training_plans row with status = "single_session" (and a week 1). Every scheduled job and
// every plan list filters on status = "active" (or another named status), so these never show
// as plans and are never stalled, extended, adapted or matched to free runs.
//
// Allowance: singleSessionsGenerated (server/tier-limits.ts), AI Plans tiers only, spent when
// the session is designed. Opening or running a designed session again costs nothing.

import { isWorkoutLocked } from "./plan-trial-cap";
import type { Express, Response } from "express";
import { db } from "./db";
import { runs, users, trainingPlans, weeklyPlans, plannedWorkouts } from "@shared/schema";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { authMiddleware, type AuthenticatedRequest } from "./auth";
import { checkAndEnforceLimit, recordUsage } from "./usage-service";
import { planChat, planAiUsage } from "./plan-ai";
import { classifySession, derivePaceAnchor, describeAnchor, normaliseIntensity } from "./plan-quality";
import { enrichWorkoutBlock } from "./session-enrichment-service";
import { getRunnerProfile, runnerProfileBlock } from "./runner-profile-service";
import { localDateTime } from "./utils/run-derivation";
import { suggestSessionPaces } from "./session-pace-suggest";
import { runDistanceKm } from "./utils/run-units";

export const SINGLE_SESSION_STATUS = "single_session";
/** Soft-deleted one-off sessions: kept so runs linked to them stay valid. */
export const SINGLE_SESSION_DELETED_STATUS = "single_session_deleted";

/** Session types a one-off can be. Same vocabulary as plan sessions (and the setup picker). */
export const SINGLE_SESSION_TYPES: Record<string, { label: string; activity: "run" | "walk" }> = {
  easy:         { label: "Easy Run",     activity: "run" },
  long_run:     { label: "Long Run",     activity: "run" },
  tempo:        { label: "Tempo Run",    activity: "run" },
  threshold:    { label: "Threshold",    activity: "run" },
  intervals:    { label: "Intervals",    activity: "run" },
  hill_repeats: { label: "Hill Repeats", activity: "run" },
  fartlek:      { label: "Fartlek",      activity: "run" },
  recovery:     { label: "Recovery Run", activity: "run" },
  race_pace:    { label: "Race Pace",    activity: "run" },
  walk:         { label: "Walk",         activity: "walk" },
  walk_run:     { label: "Walk-Run",     activity: "run" },
};

// gpt-4o list prices, $ per million tokens. Used only for the cost log line.
const OPENAI_IN_PER_M = 2.5;
const OPENAI_OUT_PER_M = 10;

const clampInt = (v: unknown, min: number, max: number): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** The runner's local date (YYYY-MM-DD) and that date at UTC midnight, how plan dates are stored. */
function localToday(timezone: string | null | undefined): { date: string; scheduled: Date; dayOfWeek: number } {
  const { date } = localDateTime(new Date(), timezone);
  const scheduled = new Date(`${date}T00:00:00.000Z`);
  return { date, scheduled, dayOfWeek: scheduled.getUTCDay() };
}

/** Today's open session in one of the runner's ACTIVE plans (the "you have a plan session" prompt). */
export async function findOpenPlanSessionOn(userId: string, date: string) {
  const rows = await db
    .select({ workout: plannedWorkouts, planId: trainingPlans.id, goalType: trainingPlans.goalType, currentWeek: trainingPlans.currentWeek, totalWeeks: trainingPlans.totalWeeks })
    .from(plannedWorkouts)
    .innerJoin(trainingPlans, eq(plannedWorkouts.trainingPlanId, trainingPlans.id))
    .where(and(
      eq(trainingPlans.userId, userId),
      eq(trainingPlans.status, "active"),
      eq(plannedWorkouts.isCompleted, false),
      ne(plannedWorkouts.workoutType, "rest"),
      sql`${plannedWorkouts.scheduledDate}::date = ${date}::date`,
    ));
  // Never offer a free-trial plan's locked session (plan-trial-cap.ts).
  for (const r of rows) if (!(await isWorkoutLocked(r.workout.id))) return r;
  return null;
}

export function registerSingleSessionRoutes(app: Express): void {
  /**
   * GET /api/plan-sessions/open-today[?date=YYYY-MM-DD]
   * The runner's open plan session today, or { workout: null }. The apps ask this before a
   * one-off session or a typed free run starts, to offer "count it / leave it open".
   */
  app.get("/api/plan-sessions/open-today", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
      const qDate = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
      const date = qDate ?? localToday(user?.timezone).date;
      const open = await findOpenPlanSessionOn(userId, date);
      if (!open) return res.json({ date, workout: null });
      res.json({
        date,
        workout: open.workout,
        planId: open.planId,
        goalType: open.goalType,
        weekNumber: open.currentWeek ?? 1,
        totalWeeks: open.totalWeeks,
      });
    } catch (err) {
      console.error("[SingleSession] open-today failed:", err);
      res.status(500).json({ error: "Failed to check today's plan session" });
    }
  });

  /**
   * POST /api/sessions/suggest-paces — suggested target paces for a session the runner
   * configured on the setup screen ("Confirm session"). Body: { sessionType, reps, workSeconds |
   * workMeters, restSeconds | restMeters, warmupMinutes, cooldownMinutes }. Free (no allowance):
   * worked out from the same pace anchor the plans use, not an AI call. See session-pace-suggest.ts.
   */
  app.post("/api/sessions/suggest-paces", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const b = req.body ?? {};
      const sessionType = typeof b.sessionType === "string" ? b.sessionType : "intervals";
      const recentRuns = await db
        .select({ distance: runs.distance, duration: runs.duration, movingTime: runs.movingTime, completedAt: runs.completedAt })
        .from(runs)
        .where(and(eq(runs.userId, userId), gte(runs.completedAt, new Date(Date.now() - 120 * 86_400_000))))
        .orderBy(desc(runs.completedAt))
        .limit(60);
      const anchor = derivePaceAnchor(recentRuns as any);
      const [u] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
      res.json(suggestSessionPaces(anchor, {
        sessionType,
        reps: clampInt(b.reps, 1, 50) ?? 1,
        workSeconds: clampInt(b.workSeconds, 1, 7200),
        workMeters: clampInt(b.workMeters, 1, 50000),
        restSeconds: clampInt(b.restSeconds, 1, 7200),
        restMeters: clampInt(b.restMeters, 1, 50000),
        warmupMinutes: clampInt(b.warmupMinutes, 0, 120),
        cooldownMinutes: clampInt(b.cooldownMinutes, 0, 120),
      }, u?.timezone));
    } catch (err) {
      console.error("[SessionPaces] suggest failed:", err);
      res.status(500).json({ error: "Failed to suggest paces" });
    }
  });

  /** GET /api/single-sessions — the runner's one-off sessions, newest first: [{ workout, planId, name, createdAt }]. */
  app.get("/api/single-sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const limit = clampInt(req.query.limit, 1, 100) ?? 30;
      const rows = await db
        .select({ workout: plannedWorkouts, planId: trainingPlans.id, createdAt: trainingPlans.createdAt, name: weeklyPlans.weekDescription })
        .from(plannedWorkouts)
        .innerJoin(trainingPlans, eq(plannedWorkouts.trainingPlanId, trainingPlans.id))
        .innerJoin(weeklyPlans, eq(plannedWorkouts.weeklyPlanId, weeklyPlans.id))
        .where(and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, SINGLE_SESSION_STATUS)))
        .orderBy(desc(trainingPlans.createdAt))
        .limit(limit);
      // The session's name is stored as its week's description (planned_workouts has no name).
      res.json(rows.map(r => ({ workout: r.workout, planId: r.planId, name: r.name ?? null, createdAt: r.createdAt })));
    } catch (err) {
      console.error("[SingleSession] list failed:", err);
      res.status(500).json({ error: "Failed to load sessions" });
    }
  });

  /** DELETE /api/single-sessions/:workoutId — hides it (runs linked to it keep their link). */
  app.delete("/api/single-sessions/:workoutId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const [row] = await db
        .select({ planId: trainingPlans.id })
        .from(plannedWorkouts)
        .innerJoin(trainingPlans, eq(plannedWorkouts.trainingPlanId, trainingPlans.id))
        .where(and(eq(plannedWorkouts.id, req.params.workoutId), eq(trainingPlans.userId, userId), eq(trainingPlans.status, SINGLE_SESSION_STATUS)))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Session not found" });
      await db.update(trainingPlans).set({ status: SINGLE_SESSION_DELETED_STATUS }).where(eq(trainingPlans.id, row.planId));
      res.json({ success: true });
    } catch (err) {
      console.error("[SingleSession] delete failed:", err);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  /**
   * POST /api/single-sessions
   * Body: { workoutType, durationMinutes? | distanceKm?, notes? }
   * Returns { workout, planId, todayPlanSession } — workout has the plan-session shape the
   * apps' workout detail screen already reads; open it and call prepare-coaching as usual.
   */
  app.post("/api/single-sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const started = Date.now();
    const usageMark = planAiUsage.length;
    try {
      const userId = req.user!.userId;
      const workoutType = String(req.body?.workoutType ?? "").trim().toLowerCase();
      const typeInfo = SINGLE_SESSION_TYPES[workoutType];
      if (!typeInfo) {
        return res.status(400).json({ error: "invalid_workout_type", message: "Choose a session type.", allowed: Object.keys(SINGLE_SESSION_TYPES) });
      }
      const durationMinutes = clampInt(req.body?.durationMinutes, 10, 300);
      const distanceRaw = Number(req.body?.distanceKm);
      const distanceKm = Number.isFinite(distanceRaw) && distanceRaw >= 1 && distanceRaw <= 60 ? Math.round(distanceRaw * 100) / 100 : null;
      if (!durationMinutes && !distanceKm) {
        return res.status(400).json({ error: "missing_length", message: "Set how long (10–300 minutes) or how far (1–60 km) the session should be." });
      }
      const notes = String(req.body?.notes ?? "").trim().slice(0, 500);

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });

      const allowed = await checkAndEnforceLimit(
        res, userId, user.subscriptionTier, "singleSessionsGenerated", 1,
        user.trialExpiresAt ?? null, user.createdAt ?? null, user.aiPlansEnabled ?? true,
      );
      if (!allowed) return;

      const today = localToday((user as any).timezone);

      // ── Context: same inputs the plan engine uses ─────────────────────────────
      const recentRuns = await db
        .select({
          distance: runs.distance, duration: runs.duration, movingTime: runs.movingTime, avgPace: runs.avgPace,
          avgHeartRate: runs.avgHeartRate, maxHeartRate: runs.maxHeartRate, completedAt: runs.completedAt,
          workoutType: runs.workoutType, runDate: runs.runDate,
        })
        .from(runs)
        .where(and(eq(runs.userId, userId), gte(runs.completedAt, new Date(Date.now() - 120 * 86_400_000))))
        .orderBy(desc(runs.completedAt))
        .limit(60);
      const anchor = derivePaceAnchor(recentRuns as any);
      const last30 = recentRuns.filter(r => r.completedAt && r.completedAt.getTime() >= Date.now() - 30 * 86_400_000);
      const km30 = last30.reduce((s, r) => s + runDistanceKm(r.distance), 0);
      const longest30 = last30.reduce((m, r) => Math.max(m, runDistanceKm(r.distance)), 0);
      const last7 = recentRuns
        .filter(r => r.completedAt && r.completedAt.getTime() >= Date.now() - 7 * 86_400_000)
        .map(r => `- ${r.runDate ?? r.completedAt!.toISOString().slice(0, 10)}: ${runDistanceKm(r.distance).toFixed(1)} km in ${Math.round((r.movingTime ?? r.duration ?? 0) / 60)} min${r.workoutType && r.workoutType !== "free" ? ` (${r.workoutType})` : ""}${r.avgHeartRate ? `, avg HR ${r.avgHeartRate}` : ""}`)
        .join("\n") || "- none";

      const [activePlan] = await db.select().from(trainingPlans)
        .where(and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")))
        .orderBy(desc(trainingPlans.createdAt)).limit(1);
      const todayPlanSession = await findOpenPlanSessionOn(userId, today.date);
      const profile = (await getRunnerProfile(userId).catch(() => null))?.profile ?? null;

      const lengthLine = durationMinutes
        ? `${durationMinutes} minutes in total, warm-up and cool-down included. This is a TIMED session: do not set a distance.`
        : `${distanceKm} km in total, warm-up and cool-down included.`;

      const system = `You are an elite running coach designing ONE stand-alone training session for a specific athlete, today. It is not part of a plan. Design it the way you would design a session inside this athlete's plan: right for their level, their recent load and their pace data, and safe. Return only JSON.`;
      const prompt = `SESSION REQUESTED
- Type: ${workoutType} (${typeInfo.label})
- Length: ${lengthLine}
${notes ? `- Runner's notes: "${notes}"` : "- Runner's notes: none"}

ATHLETE
- Fitness level: ${(user as any).fitnessLevel ?? "intermediate"}
- Age: ${(user as any).age ?? "unknown"}
- Last 30 days: ${last30.length} runs, ${km30.toFixed(1)} km, longest ${longest30.toFixed(1)} km
${anchor ? `- PERFORMANCE ANCHOR: ${describeAnchor(anchor)}` : "- No recent effort of 3 km or more: keep targets effort-based and conservative."}
- Last 7 days:
${last7}
${activePlan ? `- Active plan: ${activePlan.goalType}, week ${activePlan.currentWeek ?? 1} of ${activePlan.totalWeeks}.` : "- No active plan."}
${todayPlanSession ? `- Their plan also has a ${todayPlanSession.workout.workoutType} session today. They chose this session instead or as well, so don't make it harder than the plan would allow.` : ""}
${runnerProfileBlock(profile)}

RULES
1. Fit the whole session, including a warm-up and a cool-down, inside the requested length.
2. intervals / hill_repeats / fartlek / walk_run / race_pace: set intervalCount and either intervalDistanceMeters or intervalDurationSeconds, plus restDurationSeconds (or restDistanceMeters). Work + recovery × reps + warm-up + cool-down must fit the length.
3. Continuous types (easy, long_run, tempo, threshold, recovery, walk): no interval fields (null). Tempo/threshold: describe the warm-up, the sustained block and the cool-down in the instructions.
4. Respect recent load: if the last 7 days show a hard session yesterday or several in a row, shorten the hard part and say why.
5. A walk is a walk: no running in it.
6. instructions: 3–6 short sentences the runner reads before starting, in plain words ("heart rate", never "HR"). No pace or BPM numbers — those are set from their data afterwards.
7. name: 2–4 words, e.g. "Hill Repeats", "40-min Fartlek".

Return JSON:
{
  "name": "string",
  "description": "one sentence: what the session is",
  "instructions": "string",
  "effortDescription": "short feel, e.g. 'comfortably hard'",
  "sessionGoal": "build_fitness | develop_speed | active_recovery | endurance | race_preparation",
  "sessionIntent": "one sentence: why this session, today",
  "intensity": "z1 | z2 | z3 | z4 | z5",
  "intervalCount": null,
  "intervalDistanceMeters": null,
  "intervalDurationSeconds": null,
  "restDistanceMeters": null,
  "restDurationSeconds": null
}`;

      const ai = await planChat({
        task: "single-session",
        openaiModel: "gpt-4o",
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        temperature: 0.4,
        maxTokens: 1500,
      });
      let design: any;
      try {
        design = JSON.parse(ai.choices[0].message.content ?? "{}");
      } catch {
        return res.status(502).json({ error: "design_failed", message: "Your coach couldn't design the session. Please try again." });
      }

      // ── Server-side sanity, the same way plan output is never trusted as-is ────
      const isRepType = ["intervals", "hill_repeats", "fartlek", "walk_run", "race_pace"].includes(workoutType);
      let intervalCount = isRepType ? clampInt(design.intervalCount, 1, 30) : null;
      let intervalDistanceMeters = isRepType ? clampInt(design.intervalDistanceMeters, 50, 5000) : null;
      let intervalDurationSeconds = isRepType && !intervalDistanceMeters ? clampInt(design.intervalDurationSeconds, 10, 1800) : null;
      const restDurationSeconds = isRepType ? clampInt(design.restDurationSeconds, 10, 900) : null;
      const restDistanceMeters = isRepType && !restDurationSeconds ? clampInt(design.restDistanceMeters, 50, 2000) : null;
      if (isRepType && (!intervalCount || (!intervalDistanceMeters && !intervalDurationSeconds))) {
        intervalCount = null; intervalDistanceMeters = null; intervalDurationSeconds = null;
      }
      // Timed sessions: drop reps until work + rest fits the time minus a 15-minute warm-up/cool-down.
      if (durationMinutes && intervalCount && intervalDurationSeconds) {
        const budget = Math.max(5 * 60, durationMinutes * 60 - 15 * 60);
        while (intervalCount > 1 && intervalCount * (intervalDurationSeconds + (restDurationSeconds ?? 0)) > budget) intervalCount--;
      }

      const name = String(design.name ?? typeInfo.label).trim().slice(0, 60) || typeInfo.label;
      const wo: any = {
        workoutType,
        effortLabel: workoutType,
        intensity: typeof design.intensity === "string" ? design.intensity : null,
      };
      normaliseIntensity(wo);
      const category = classifySession(workoutType, workoutType);

      // ── Store: hidden plan → week 1 → the workout ─────────────────────────────
      const [plan] = await db.insert(trainingPlans).values({
        userId,
        goalType: SINGLE_SESSION_STATUS,
        totalWeeks: 1,
        currentWeek: 1,
        experienceLevel: String((user as any).fitnessLevel ?? "intermediate"),
        daysPerWeek: 1,
        status: SINGLE_SESSION_STATUS,
        aiGenerated: true,
        generatedThroughWeek: 1,
        enrichedThroughWeek: 1,
      } as any).returning();
      const [week] = await db.insert(weeklyPlans).values({
        trainingPlanId: plan.id,
        weekNumber: 1,
        weekDescription: name,
        totalDistance: distanceKm,
        totalDuration: durationMinutes ? durationMinutes * 60 : null,
      } as any).returning();
      const [workout] = await db.insert(plannedWorkouts).values({
        weeklyPlanId: week.id,
        trainingPlanId: plan.id,
        dayOfWeek: today.dayOfWeek,
        scheduledDate: today.scheduled,
        workoutType,
        distance: distanceKm,
        duration: durationMinutes ? durationMinutes * 60 : null,
        intensity: wo.intensity,
        description: String(design.description ?? "").slice(0, 400) || `${typeInfo.label} session`,
        instructions: String(design.instructions ?? "").slice(0, 2000) || null,
        effortDescription: String(design.effortDescription ?? "").slice(0, 120) || null,
        sessionGoal: String(design.sessionGoal ?? "").slice(0, 40) || null,
        sessionIntent: String(design.sessionIntent ?? "").slice(0, 400) || null,
        effortLabel: workoutType,
        intervalCount,
        intervalDistanceMeters,
        intervalDurationSeconds,
        restDistanceMeters,
        restDurationSeconds,
        isEnrichmentPending: true,
        sessionType: typeInfo.activity,
      } as any).returning();

      // Paces + HR zones from the athlete's own data — the plan sessions' enrichment step.
      await enrichWorkoutBlock(userId, [workout.id]);
      // Timed sessions keep their requested time (enrichment recomputes duration only from distance).
      if (durationMinutes) {
        await db.update(plannedWorkouts).set({ duration: durationMinutes * 60 } as any).where(eq(plannedWorkouts.id, workout.id));
      }
      const [finalWorkout] = await db.select().from(plannedWorkouts).where(eq(plannedWorkouts.id, workout.id)).limit(1);

      recordUsage(userId, "singleSessionsGenerated");

      const used = planAiUsage.slice(usageMark).filter(u => u.task === "single-session" || u.task === "session-enrichment");
      const inTok = used.reduce((s, u) => s + u.inputTokens, 0);
      const outTok = used.reduce((s, u) => s + u.outputTokens, 0);
      const estCost = (inTok * OPENAI_IN_PER_M + outTok * OPENAI_OUT_PER_M) / 1_000_000;
      console.log(`[SingleSession] cost user=${userId} type=${workoutType} ${durationMinutes ? durationMinutes + "min" : distanceKm + "km"} category=${category} provider=${used.map(u => u.provider).join("+") || "?"} tokens=${inTok}/${outTok} est=$${estCost.toFixed(4)} (design+enrichment; coaching plan generated on open) ms=${Date.now() - started}`);

      res.status(201).json({
        workout: { ...finalWorkout, name },
        planId: plan.id,
        name,
        todayPlanSession: todayPlanSession
          ? { workout: todayPlanSession.workout, planId: todayPlanSession.planId, goalType: todayPlanSession.goalType }
          : null,
      });
    } catch (err) {
      console.error("[SingleSession] create failed:", err);
      if (!res.headersSent) res.status(500).json({ error: "design_failed", message: "Your coach couldn't design the session. Please try again." });
    }
  });
}
