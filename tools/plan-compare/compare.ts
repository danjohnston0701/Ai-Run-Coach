// Generates plans for real runners with one AI provider and records how good the model's
// first attempt was and what the quality gate had to fix. Run once per provider, then
// build the side-by-side report (report.ts).
//
// ONLY against a Neon branch — it creates real plans for the users in the cases file:
//   TZ=UTC EXTERNAL_DATABASE_URL=<branch> DATABASE_URL=<branch> PLAN_AI_PROVIDER=anthropic \
//     npx tsx --env-file=.env tools/plan-compare/compare.ts cases.json out-anthropic.json [repeats]
//
// cases.json: [{ "label", "userId", "goalType", "targetKm", "targetTimeSecs"?, "targetDate"?,
//   "level", "daysPerWeek", "weeks"?, "regularSessions"?, "timezone" }]
import fs from "node:fs";
import { generateTrainingPlan } from "../../server/training-plan-service";
import { planAiUsage, planAiProvider } from "../../server/plan-ai";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";

interface Case {
  label: string; userId: string; goalType: string; targetKm: number; targetTimeSecs?: number; targetDate?: string;
  level: string; daysPerWeek: number; weeks?: number; regularSessions?: any[]; timezone?: string;
}

const [casesPath, outPath, repeatsArg] = process.argv.slice(2);
if (!casesPath || !outPath) throw new Error("usage: compare.ts cases.json out.json [repeats]");
// Refuse the database in .env (production): the target must be passed explicitly.
const envFileDb = (() => {
  try { return fs.readFileSync(".env", "utf8").match(/^EXTERNAL_DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, "").trim(); } catch { return undefined; }
})();
const targetDb = process.env.EXTERNAL_DATABASE_URL ?? "";
if (process.env.ALLOW_PLAN_COMPARE !== "1" || !targetDb || targetDb === envFileDb) {
  throw new Error("Set ALLOW_PLAN_COMPARE=1 and point EXTERNAL_DATABASE_URL at a Neon BRANCH (not the .env database) — this creates plans.");
}
const cases: Case[] = JSON.parse(fs.readFileSync(casesPath, "utf8"));
const repeats = Math.max(1, Number(repeatsArg) || 1);

// Log lines from the generator are the record of what the gate did.
const captured: string[] = [];
for (const level of ["log", "warn", "error"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: any[]) => {
    captured.push(args.map(a => (typeof a === "string" ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(" "));
    orig(...args);
  };
}

const num = (re: RegExp, text: string) => { const m = text.match(re); return m ? Number(m[1]) : 0; };

const results: any[] = [];
for (let rep = 1; rep <= repeats; rep++) {
  for (const c of cases) {
    captured.length = 0;
    const usageStart = planAiUsage.length;
    const started = Date.now();
    let planId: string | null = null;
    let error: string | null = null;
    try {
      planId = await generateTrainingPlan(
        c.userId, c.goalType, c.targetKm, c.targetTimeSecs, c.targetDate ? new Date(c.targetDate) : undefined,
        c.level, c.daysPerWeek, c.regularSessions ?? [], "flexible", c.weeks, [], c.timezone ?? null,
        null, null, null, null, null, false,
      );
    } catch (e: any) {
      error = e?.message ?? String(e);
    }
    const log = captured.join("\n");
    const loadLines = captured.filter(l => /Load rules:|Progression guard:|still flagged/.test(l));
    const firstLoad = log.match(/Load rules: (\d+) violation\(s\), correction 1\/2/);
    const firstGuard = log.match(/Progression guard: (\d+) violation/);
    const usage = planAiUsage.slice(usageStart);

    let weeks: any[] = [];
    let workouts: any[] = [];
    if (planId) {
      const q = async (s: any) => { const r: any = await db.execute(s); return r.rows ?? r; };
      weeks = await q(sql`SELECT week_number, total_distance, week_description FROM weekly_plans WHERE training_plan_id = ${planId} ORDER BY week_number`);
      workouts = await q(sql`
        SELECT wp.week_number, to_char(pw.scheduled_date, 'Dy DD Mon') AS date, pw.day_of_week, pw.workout_type, pw.distance, pw.duration,
               pw.target_pace, pw.intensity, pw.hr_zone_min_bpm, pw.hr_zone_max_bpm, pw.interval_count, pw.interval_distance_meters,
               pw.interval_duration_seconds, pw.rest_duration_seconds, pw.interval_target_pace, pw.description, pw.instructions
        FROM planned_workouts pw JOIN weekly_plans wp ON wp.id = pw.weekly_plan_id
        WHERE pw.training_plan_id = ${planId} ORDER BY pw.scheduled_date`);
    }

    results.push({
      label: c.label, repeat: rep, provider: planAiProvider(), planId, error,
      seconds: Math.round((Date.now() - started) / 1000),
      firstAttemptViolations: firstLoad ? Number(firstLoad[1]) : firstGuard ? Number(firstGuard[1]) : 0,
      correctionRounds: (log.match(/correction \d\/2/g) ?? []).length,
      repairs: num(/repaired (\d+) item/, log),
      stillFlagged: /still flagged/.test(log) || /violation\(s\) remain/.test(log),
      reviewRewrites: num(/Review \(\w+\): (\d+) session/, log),
      reviewConcerns: captured.filter(l => l.includes("concerns:")).join("\n"),
      gateLog: loadLines,
      calls: usage.map(u => ({ task: u.task, model: u.model, ms: u.ms, in: u.inputTokens, out: u.outputTokens })),
      weeks, workouts,
    });
    fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
    console.info(`[compare] ${c.label} #${rep} (${planAiProvider()}): ${error ?? "ok"} in ${Math.round((Date.now() - started) / 1000)}s`);
  }
}
process.exit(0);
