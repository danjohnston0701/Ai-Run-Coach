/**
 * "New AI plan" review email — sent to the team every time a runner creates a training plan, so
 * each plan can be checked against the runner it was made for (fitness, history, injuries, goal).
 *
 * Fired in the background after POST /api/training-plans/generate responds; never blocks or fails
 * plan creation. Goes to PLAN_REVIEW_EMAIL if set, else SUPPORT_NOTIFICATION_EMAIL / support@.
 */
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "./db";
import { goals, plannedWorkouts, runs, trainingPlans, users, weeklyPlans } from "@shared/schema";
import { sendInternalEmail } from "./email-service";
import { parseWeightKg } from "./utils/run-derivation";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function fmtSeconds(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "6× (2 min jog / 3 min walk) = 30 min", "6× 400 m, 90 s rest", "5 km", "20 min". */
function sessionShape(w: any): string {
  const n = w.intervalCount;
  const run = w.intervalDurationSeconds, rest = w.restDurationSeconds;
  if (n && run) {
    const r = run / 60, wk = (rest ?? 0) / 60;
    const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
    return w.workoutType === "walk_run" || w.workoutType === "orientation"
      ? `${n}× (${fmt(r)} min jog / ${fmt(wk)} min walk) = ${fmt(n * (r + wk))} min`
      : `${n}× ${fmt(r)} min${rest ? `, ${fmt(wk)} min recovery` : ""}`;
  }
  if (n && w.intervalDistanceMeters) return `${n}× ${w.intervalDistanceMeters} m${rest ? `, ${Math.round(rest)} s recovery` : ""}`;
  const parts: string[] = [];
  if (w.distance) parts.push(`${Number(w.distance).toFixed(1).replace(/\.0$/, "")} km`);
  if (w.duration) parts.push(`${Math.round(w.duration / 60)} min`);
  return parts.join(" / ") || "—";
}

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const t = new Date(dob).getTime();
  if (Number.isNaN(t)) return null;
  const a = Math.floor((Date.now() - t) / 31557600000);
  return a > 0 && a < 120 ? a : null;
}

export async function sendNewPlanReviewEmail(planId: string): Promise<void> {
  const email = await buildPlanReviewEmail(planId);
  if (!email) return;
  await sendInternalEmail({ ...email, to: process.env.PLAN_REVIEW_EMAIL || null });
  console.log(`[PlanReview] Review email sent for plan ${planId}`);
}

/** Subject + HTML + plain text for a plan (exported so it can be previewed without sending). */
export async function buildPlanReviewEmail(planId: string): Promise<{ subject: string; html: string; text: string } | null> {
  const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, planId)).limit(1);
  if (!plan) return null;
  const [user] = await db.select({
    id: users.id, name: users.name, email: users.email, fitnessLevel: users.fitnessLevel, dob: users.dob,
    gender: users.gender, height: users.height, weight: users.weight, country: users.country, timezone: users.timezone,
  }).from(users).where(eq(users.id, plan.userId)).limit(1);
  if (!user) return null;
  // Read separately so the email still sends if the column hasn't been auto-migrated yet.
  const weightUnitConfirmed = await db.select({ c: users.weightUnitConfirmed }).from(users).where(eq(users.id, plan.userId)).limit(1)
    .then(r => !!r[0]?.c).catch(() => false);
  const [goal] = await db.select().from(goals).where(eq(goals.linkedTrainingPlanId, planId)).limit(1);
  const weeks = await db.select().from(weeklyPlans).where(eq(weeklyPlans.trainingPlanId, planId)).orderBy(asc(weeklyPlans.weekNumber));
  const workouts = await db.select().from(plannedWorkouts).where(eq(plannedWorkouts.trainingPlanId, planId)).orderBy(asc(plannedWorkouts.scheduledDate));

  // Recent running (same 90-day window the generator uses)
  const since = new Date(Date.now() - 90 * 86400000);
  const recent = await db.select({ distance: runs.distance, completedAt: runs.completedAt })
    .from(runs).where(and(eq(runs.userId, user.id), gte(runs.completedAt, since))).orderBy(desc(runs.completedAt));
  const km = (d: number | null) => (d ? (d > 200 ? d / 1000 : d) : 0);
  const last30 = recent.filter(r => r.completedAt && r.completedAt.getTime() > Date.now() - 30 * 86400000);
  const weeklyKm = last30.reduce((s, r) => s + km(r.distance), 0) / 4;

  const weightKg = parseWeightKg(user.weight, user.height, weightUnitConfirmed);
  const heightCm = parseFloat(String(user.height ?? ""));
  const bmi = weightKg && heightCm > 100 ? weightKg / (heightCm / 100) ** 2 : null;
  const age = ageFromDob(user.dob);
  const tz = user.timezone || "UTC";
  const injuries: any[] = (() => { try { return plan.injuriesAtCreation ? JSON.parse(plan.injuriesAtCreation) : []; } catch { return []; } })();
  const safety: any = (() => { try { return plan.safetyDisclaimer ? JSON.parse(plan.safetyDisclaimer) : null; } catch { return null; } })();
  const goalLabel = `${plan.goalType.replace(/_/g, " ").toUpperCase()}${plan.targetDistance ? ` (${plan.targetDistance} km)` : ""}`;

  const facts: [string, string | null][] = [
    ["Runner", `${user.name} — ${user.email}`],
    ["User ID", user.id],
    ["Fitness level", plan.experienceLevel || user.fitnessLevel || null],
    ["Age / gender", [age ? `${age}` : "age unknown (no DOB)", user.gender].filter(Boolean).join(" / ")],
    ["Height / weight", [heightCm > 0 ? `${heightCm} cm` : null, weightKg ? `${weightKg} kg${weightUnitConfirmed ? "" : " (unit unconfirmed)"}` : null, bmi ? `BMI ${bmi.toFixed(1)}` : null].filter(Boolean).join(" / ") || null],
    ["Country / timezone", [user.country, user.timezone].filter(Boolean).join(" / ") || null],
    ["Recent running", recent.length ? `${recent.length} runs in 90 days, ~${weeklyKm.toFixed(1)} km/week over the last 30` : "No runs recorded in the app"],
    ["Goal", goal ? `${goalLabel} — "${goal.title}"${goal.targetDate ? `, by ${goal.targetDate.toISOString().slice(0, 10)}` : ""}` : goalLabel],
    ["Target time", fmtSeconds(plan.targetTime) ?? "none"],
    ["Plan", `${plan.totalWeeks} weeks, ${plan.daysPerWeek} days/week — weeks 1–${plan.generatedThroughWeek ?? plan.totalWeeks} generated${plan.nextBlockAt ? `, next block ${plan.nextBlockAt.toISOString().slice(0, 10)}` : ""}`],
    ["Injuries", injuries.length ? injuries.map(i => `${i.bodyPart} (${i.status}${i.injuryDate ? `, since ${i.injuryDate}` : ""})`).join("; ") : "none"],
  ];

  const byWeek = new Map<string, any[]>();
  for (const w of workouts) { const k = w.weeklyPlanId; byWeek.set(k, [...(byWeek.get(k) ?? []), w]); }
  const dateFmt = (d: Date | null) => d ? d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }) : "";

  const weekHtml = weeks.map(wk => {
    const rows = (byWeek.get(wk.id) ?? []).map(w => `
      <tr>
        <td style="padding:6px 8px;border-top:1px solid #2a2a40;white-space:nowrap;color:#94a3b8;">${esc(dateFmt(w.scheduledDate))}</td>
        <td style="padding:6px 8px;border-top:1px solid #2a2a40;white-space:nowrap;">${esc(w.workoutType)}</td>
        <td style="padding:6px 8px;border-top:1px solid #2a2a40;white-space:nowrap;">${esc(sessionShape(w))}</td>
        <td style="padding:6px 8px;border-top:1px solid #2a2a40;"><strong>${esc(w.description)}</strong><br><span style="color:#94a3b8;font-size:12px;">${esc(w.instructions)}</span></td>
      </tr>`).join("");
    return `
      <h3 style="margin:24px 0 4px;color:#00E5FF;font-size:15px;">Week ${wk.weekNumber}${wk.totalDistance ? ` · ~${wk.totalDistance} km` : ""}</h3>
      <p style="margin:0 0 8px;color:#cbd5e1;font-size:13px;">${esc(wk.weekDescription)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e2e8f0;">${rows || `<tr><td style="color:#64748b;">No sessions</td></tr>`}</table>`;
  }).join("");

  const factsHtml = facts.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#94a3b8;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;color:#ffffff;">${esc(v)}</td></tr>`).join("");
  const safetyHtml = safety ? `
      <div style="margin-top:16px;background:#1a1a2e;border-left:3px solid #FFB300;border-radius:6px;padding:12px 16px;font-size:13px;color:#e2e8f0;">
        <strong style="color:#FFB300;">Safety notes generated with the plan</strong>
        ${safety.medicalClearanceRequired ? `<p style="margin:6px 0;">Medical clearance required.</p>` : ""}
        ${(safety.progressionGates ?? []).length ? `<p style="margin:6px 0 2px;color:#94a3b8;">Progression gates:</p><ul style="margin:0;padding-left:18px;">${safety.progressionGates.map((g: string) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}
      </div>` : "";

  const subject = `[New AI plan] ${user.name} — ${goalLabel}, ${plan.experienceLevel || user.fitnessLevel || "level?"}${injuries.length ? ", injured" : ""}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;background:#0A0A1A;color:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#00E5FF 0%,#0099CC 100%);padding:20px 24px;">
        <h1 style="margin:0;font-size:18px;font-weight:800;color:#0A0A1A;">New AI training plan to review</h1>
        <p style="margin:4px 0 0;color:#0A0A1A;font-size:13px;">Plan ${esc(plan.id)} · created ${esc(plan.createdAt?.toISOString().replace("T", " ").slice(0, 16) ?? "")} UTC</p>
      </div>
      <div style="padding:20px 24px;">
        <table style="border-collapse:collapse;font-size:14px;">${factsHtml}</table>
        ${safetyHtml}
        ${weekHtml}
      </div>
    </div>`;

  const text = [
    `New AI training plan to review — plan ${plan.id}`,
    "",
    ...facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    "",
    ...weeks.flatMap(wk => [
      `Week ${wk.weekNumber}${wk.totalDistance ? ` (~${wk.totalDistance} km)` : ""}: ${wk.weekDescription ?? ""}`,
      ...(byWeek.get(wk.id) ?? []).map(w => `  ${dateFmt(w.scheduledDate)} — ${w.workoutType} — ${sessionShape(w)} — ${w.description ?? ""}`),
      "",
    ]),
  ].join("\n");

  return { subject, html, text };
}
