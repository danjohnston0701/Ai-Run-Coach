// Coach's read-through of a plan block after the load rules have run: the things code can't
// check — does each session's text say what its numbers say, does it read right for this
// runner, does the block make sense for the goal. Every reviewed customer plan had text that
// contradicted its own numbers ("at least 30 minutes" on a 22-minute run, "extend by 1 km
// from last week" when it didn't).
//
// The review may only rewrite a session's description and instructions. Distances,
// durations, paces, zones, days and session types belong to the load rules
// (plan-quality.ts) and are never changed here; anything structural it spots comes back
// as a concern and is logged.
import { planChat } from "./plan-ai";
import { classifySession, fmtPace } from "./plan-quality";

export interface PlanReviewContext {
  goal: string;              // "10K on 20 Feb 2027", "5K, no target time"
  fitnessLevel: string;
  easyPaceSecs: number;
  regularSessions?: string[]; // "Sands Salisbury Runners (Tuesday)"
}

export interface PlanReviewResult { fixed: string[]; concerns: string[] }

const MAX_DESCRIPTION = 90;
const MAX_INSTRUCTIONS = 700;

function sessionLine(wo: any, easyPaceSecs: number): Record<string, unknown> {
  const km = Number(wo.distance) || null;
  const durMin = Number(wo.duration) > 0 ? Math.round(Number(wo.duration) / 60)
    : km && classifySession(wo.workoutType, wo.effortLabel) !== "interval" ? Math.round((km * easyPaceSecs) / 60) : null;
  const out: Record<string, unknown> = {
    day: wo.dayOfWeek, type: wo.workoutType, km, approxMinutes: durMin, zone: wo.intensity,
    description: wo.description ?? "", instructions: wo.instructions ?? "",
  };
  if (wo.targetPace) out.pace = wo.targetPace;
  if (wo.intervalCount) {
    out.reps = wo.intervalCount;
    if (wo.intervalDistanceMeters) out.repMetres = wo.intervalDistanceMeters;
    if (wo.intervalDurationSeconds) out.repSeconds = wo.intervalDurationSeconds;
    if (wo.restDurationSeconds) out.restSeconds = wo.restDurationSeconds;
  }
  return out;
}

export async function reviewPlanText(weeks: any[], ctx: PlanReviewContext, tag: string): Promise<PlanReviewResult> {
  const result: PlanReviewResult = { fixed: [], concerns: [] };
  if (process.env.PLAN_AI_REVIEW === "0" || !Array.isArray(weeks) || weeks.length === 0) return result;

  const block = weeks.map(w => ({
    week: w.weekNumber,
    km: w.totalDistance,
    sessions: (w.workouts ?? []).map((wo: any, i: number) => ({ session: i, ...sessionLine(wo, ctx.easyPaceSecs) })),
  }));

  const system = `You are a senior running coach checking a training block before it goes to a paying athlete. The numbers (km, minutes, pace, zone, reps, day, type) are final — they have already been checked against the athlete's history and must not change. Your job is the words.`;
  const user = `ATHLETE: ${ctx.fitnessLevel} runner. Goal: ${ctx.goal}. Easy pace ≈ ${fmtPace(ctx.easyPaceSecs)}/km.${ctx.regularSessions?.length ? ` Regular group runs: ${ctx.regularSessions.join(", ")}.` : ""}

BLOCK (day: 1=Mon … 7=Sun):
${JSON.stringify(block)}

Check every session:
1. The description and instructions agree with the session's numbers — distance, minutes, reps, rep length, recovery, zone. A 22-minute run must not say "at least 30 minutes"; "extend your long run by 1 km from last week" must be true of the previous week's long run.
2. The instructions describe the session type correctly and say how to run it (warm-up/cool-down for quality sessions, what strides are, how the walk-run works).
3. The language suits a ${ctx.fitnessLevel} runner: plain, specific, encouraging, no unexplained jargon, no rule numbers or internal notes.
4. A session that is a regular group run is named after that group.
5. Keep any sentence that explains why a long run is longer than the race distance.

Rewrite ONLY the sessions that fail a check. Keep a description under ${MAX_DESCRIPTION} characters and instructions under ${MAX_INSTRUCTIONS}. If the block itself looks wrong for this athlete (a structural problem you are not allowed to fix), say so in concerns.

Return JSON: {"fixes":[{"week":<number>,"session":<index>,"description":"<new, optional>","instructions":"<new, optional>","reason":"<which check failed>"}],"concerns":["..."]}`;

  try {
    const res = await planChat({
      task: "plan-review",
      openaiModel: "gpt-4.1",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.2,
      maxTokens: 8000,
    });
    if (res.choices[0].finish_reason === "length") throw new Error("review reply truncated");
    const parsed = JSON.parse(res.choices[0].message.content || "{}");
    for (const f of Array.isArray(parsed.fixes) ? parsed.fixes : []) {
      const week = weeks.find(w => Number(w.weekNumber) === Number(f.week));
      const wo = week?.workouts?.[Number(f.session)];
      if (!wo) continue;
      const changed: string[] = [];
      if (typeof f.description === "string" && f.description.trim() && f.description.length <= MAX_DESCRIPTION) {
        wo.description = f.description.trim(); changed.push("description");
      }
      if (typeof f.instructions === "string" && f.instructions.trim() && f.instructions.length <= MAX_INSTRUCTIONS) {
        wo.instructions = f.instructions.trim(); changed.push("instructions");
      }
      if (changed.length) result.fixed.push(`Week ${f.week} session ${f.session} (${changed.join(" + ")}): ${String(f.reason ?? "").slice(0, 160)}`);
    }
    result.concerns = (Array.isArray(parsed.concerns) ? parsed.concerns : []).map((c: unknown) => String(c).slice(0, 300));
    console.log(`[${tag}] Review (${res.provider}): ${result.fixed.length} session(s) rewritten${result.fixed.length ? `:\n  ${result.fixed.join("\n  ")}` : ""}${result.concerns.length ? `\n  concerns:\n  ${result.concerns.join("\n  ")}` : ""}`);
  } catch (err) {
    console.error(`[${tag}] Plan review skipped:`, err);
  }
  return result;
}
