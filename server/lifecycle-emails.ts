/**
 * Lifecycle emails: each one goes to a user at most once.
 *
 *   welcome         1 h after sign-up: a plain-text note from Daniel (thanks, intro, ask for feedback)
 *   trial_7d        7 days before the trial ends   ┐ only while still on the free trial (never paid,
 *   trial_2d        2 days before the trial ends   ┘ not lapsed) and the month's allowance isn't used up
 *   trial_expired   when the trial has ended (sent up to 3 days after, then not at all)
 *   trial_limit:YYYY-MM   when a trial user uses up an allowance (AI coaching km or post-run
 *                   summaries) that month, sent from usage-service.ts (crossing the limit, or the
 *                   429 when a request is blocked)
 *
 * `lifecycle_emails` (auto-migrated) records each one sent. A row is inserted before sending
 * (ON CONFLICT DO NOTHING), so two autoscale instances running the sweep can't both send. A
 * failed send deletes its row so the next sweep retries it. A row of type `unsubscribed` (from the
 * link in the trial emails) stops all of them, the welcome email included.
 *
 * The time windows are what keeps the first deploy from emailing old accounts: welcome only for
 * accounts 1–48 h old, the expiry email only within 3 days of the end.
 *
 * Sender: the welcome email comes from FOUNDER_FROM_EMAIL (default: the Resend from address) under
 * the name FOUNDER_NAME (default "Daniel Johnston"), and replies go to FOUNDER_REPLY_TO_EMAIL
 * (default support@airuncoach.live). The trial emails come from "AI Run Coach".
 */
import crypto from "crypto";
import { DateTime } from "luxon";
import { pool } from "./db";
import { getResendClient } from "./email-service";
import { firstNameOf } from "./utils/first-name";
import { TIER_LIMITS, FREE_TRIAL_DAYS } from "./tier-limits";

export type LifecycleEmailType = "welcome" | "trial_7d" | "trial_2d" | "trial_expired";

const BASE_URL = "https://airuncoach.live";
const APP_STORE_URL = "https://apps.apple.com/nz/app/ai-run-coach/id6762181649";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach";
const BATCH = 50;
const FREE_LIMITS = TIER_LIMITS.free;

/** On the free trial: no tier (or "free") and not a lapsed paid subscriber. */
const FREE_TRIAL_SQL = `
  COALESCE(LOWER(TRIM(u.subscription_tier)), 'free') IN ('free', 'null', '')
  AND COALESCE(LOWER(u.subscription_status), '') NOT IN
      ('expired', 'refunded', 'cancelled', 'canceled', 'on_hold', 'paused', 'inactive')`;

const NOT_SENT_SQL = (type: string) => `
  u.email IS NOT NULL AND u.email <> ''
  AND NOT EXISTS (SELECT 1 FROM lifecycle_emails le
                  WHERE le.user_id = u.id AND le.email_type IN ('${type}', 'unsubscribed'))`;

interface Candidate {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  device_source: string | null;
  trial_expires_at: Date | null;
}

// ── Sending bookkeeping ────────────────────────────────────────────────────────

async function claim(userId: string, type: string): Promise<boolean> {
  const r = await pool.query(
    `INSERT INTO lifecycle_emails (user_id, email_type) VALUES ($1, $2)
     ON CONFLICT (user_id, email_type) DO NOTHING RETURNING user_id`,
    [userId, type]
  );
  return (r.rowCount ?? 0) > 0;
}

async function release(userId: string, type: string): Promise<void> {
  await pool.query(`DELETE FROM lifecycle_emails WHERE user_id = $1 AND email_type = $2`, [userId, type]);
}

async function isUnsubscribed(userId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM lifecycle_emails WHERE user_id = $1 AND email_type = 'unsubscribed'`,
    [userId]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Claim, send, and give the claim back if the send fails so the next sweep retries. */
async function sendOnce(userId: string, type: string, send: () => Promise<void>): Promise<boolean> {
  if (!(await claim(userId, type))) return false;
  try {
    await send();
    return true;
  } catch (err) {
    await release(userId, type).catch(() => {});
    throw err;
  }
}

// ── Unsubscribe ────────────────────────────────────────────────────────────────

function unsubscribeToken(userId: string): string {
  const secret = process.env.SESSION_SECRET || "fallback-secret-key-change-in-production";
  return crypto.createHmac("sha256", secret).update(`unsubscribe:${userId}`).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(userId: string): string {
  return `${BASE_URL}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = unsubscribeToken(userId);
  return token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function unsubscribe(userId: string): Promise<void> {
  await claim(userId, "unsubscribed");
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function firstName(name: string | null): string {
  return firstNameOf(name) ?? "there";
}

function storeUrl(deviceSource: string | null): string {
  return deviceSource === "android" ? PLAY_STORE_URL : APP_STORE_URL;
}

function localDate(d: Date, timezone: string | null): string {
  const dt = DateTime.fromJSDate(d).setZone(timezone || "UTC");
  return (dt.isValid ? dt : DateTime.fromJSDate(d).setZone("UTC")).toFormat("cccc d LLLL");
}

function daysPhrase(n: number): string {
  return n <= 1 ? "1 day" : `${n} days`;
}

function yearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

async function monthUsage(userId: string): Promise<{ km: number; analyses: number }> {
  const r = await pool.query(
    `SELECT ai_coaching_km, post_run_analyses FROM monthly_usage WHERE user_id = $1 AND year_month = $2`,
    [userId, yearMonth()]
  );
  return { km: Number(r.rows[0]?.ai_coaching_km ?? 0), analyses: Number(r.rows[0]?.post_run_analyses ?? 0) };
}

function allowanceUsedUp(u: { km: number; analyses: number }): boolean {
  return u.km >= FREE_LIMITS.aiCoachingKm || u.analyses >= FREE_LIMITS.postRunAnalyses;
}

/** What a paid plan adds over the trial: the same list in every trial email. */
const PAID_BENEFITS = [
  "AI training plans built around your goal and adapted as you go",
  "AI-generated routes for any distance, from your front door",
  "A bigger monthly allowance of live AI coaching and post-run analysis",
];

// ── Templates ──────────────────────────────────────────────────────────────────

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

function brandedEmail(opts: {
  userId: string;
  heading: string;
  greeting: string;
  paragraphs: string[];
  benefitsIntro?: string;
  ctaLabel: string;
  ctaUrl: string;
  footnote: string;
}): { html: string; textBody: string } {
  const p = (t: string) => `<p style="margin: 0 0 16px; color: #cbd5e1; line-height: 1.6;">${t}</p>`;
  const benefits = opts.benefitsIntro
    ? `<div style="background: #1a1a2e; border-radius: 8px; padding: 20px; border-left: 3px solid #00E5FF; margin: 8px 0 24px;">
         <p style="margin: 0 0 10px; color: #ffffff; font-weight: 700;">${opts.benefitsIntro}</p>
         ${PAID_BENEFITS.map((b) => `<p style="margin: 0 0 6px; color: #e2e8f0; font-size: 14px;">✓ ${b}</p>`).join("")}
       </div>`
    : "";
  const unsub = unsubscribeUrl(opts.userId);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #00E5FF 0%, #0099CC 100%); padding: 32px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #0A0A1A;">${opts.heading}</h1>
      </div>
      <div style="padding: 36px 32px;">
        <p style="margin: 0 0 16px; color: #e2e8f0; line-height: 1.6;">${opts.greeting}</p>
        ${opts.paragraphs.map(p).join("")}
        ${benefits}
        <div style="text-align: center; margin: 8px 0 24px;">
          <a href="${opts.ctaUrl}" style="display: inline-block; background: #00E5FF; color: #0A0A1A; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 999px; text-decoration: none; letter-spacing: 1px; text-transform: uppercase;">${opts.ctaLabel}</a>
        </div>
        <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">${opts.footnote}</p>
        <p style="margin: 24px 0 0; color: #475569; font-size: 11px;">Don't want these emails? <a href="${unsub}" style="color: #64748b;">Unsubscribe</a></p>
      </div>
    </div>`;
  const strip = (t: string) => t.replace(/<[^>]+>/g, "");
  const textBody =
    `${strip(opts.greeting)}\n\n` +
    opts.paragraphs.map(strip).join("\n\n") +
    (opts.benefitsIntro ? `\n\n${strip(opts.benefitsIntro)}\n${PAID_BENEFITS.map((b) => `- ${b}`).join("\n")}` : "") +
    `\n\n${opts.ctaLabel}: ${opts.ctaUrl}\n\n${strip(opts.footnote)}\n\nUnsubscribe: ${unsub}`;
  return { html, textBody };
}

const UPGRADE_HOW = "In the app, go to Profile → Subscription to choose Lite or Standard.";

export function renderWelcome(u: { name: string | null }): { subject: string; text: string } {
  const founder = (process.env.FOUNDER_NAME || "Daniel Johnston").split(" ")[0];
  return {
    subject: "Thanks for joining Ai Run Coach",
    text:
      `Hi ${firstName(u.name)},\n\n` +
      `I'm ${founder}, the founder of Ai Run Coach, and I wanted to say a personal thank you for signing up.\n\n` +
      `Your ${FREE_TRIAL_DAYS}-day free trial has started. There's no card on file, so there's nothing to cancel. ` +
      `Take your coach out on a few runs or walks and see how it feels to have someone in your ear who knows ` +
      `your pace, your heart rate and what you're working towards.\n\n` +
      `I'd really value your feedback: what you like, what's confusing, or anything that doesn't work the ` +
      `way you expected. Just reply to this email. It comes straight to me and I read every one.\n\n` +
      `All the best with your trial, and happy running!\n\n` +
      `${founder}\nFounder, Ai Run Coach`,
  };
}

export function renderTrialReminder(
  u: { id: string; name: string | null; timezone: string | null; device_source: string | null },
  expiresAt: Date,
  usage: { km: number; analyses: number }
): Rendered {
  const days = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000));
  const endDate = localDate(expiresAt, u.timezone);
  const kmLeft = Math.max(0, FREE_LIMITS.aiCoachingKm - usage.km);
  const analysesLeft = Math.max(0, FREE_LIMITS.postRunAnalyses - usage.analyses);
  const final = days <= 2;
  const { html, textBody } = brandedEmail({
    userId: u.id,
    heading: `${daysPhrase(days)} left on your trial`,
    greeting: `Hi ${firstName(u.name)},`,
    paragraphs: [
      `Your AI Run Coach free trial ends on <strong style="color:#ffffff;">${endDate}</strong>, ${daysPhrase(days)} from now.`,
      `You still have <strong style="color:#ffffff;">${Math.floor(kmLeft)} km of live AI coaching</strong> and ` +
        `<strong style="color:#ffffff;">${analysesLeft} post-run AI summaries</strong> to use this month, ` +
        (final ? "so there's time for one or two more coached sessions before it ends." : "so make the most of them this week."),
      final
        ? "To keep your coach after the trial, pick a plan before it ends. Your runs and history stay either way."
        : "If you're enjoying it, a paid plan keeps everything going without a break, and adds more.",
    ],
    benefitsIntro: "A paid plan also gives you:",
    ctaLabel: "Open AI Run Coach",
    ctaUrl: storeUrl(u.device_source),
    footnote: UPGRADE_HOW,
  });
  return {
    subject: final
      ? `Your AI Run Coach trial ends in ${daysPhrase(days)}`
      : `${daysPhrase(days)} left on your AI Run Coach free trial`,
    html,
    text: textBody,
  };
}

export function renderTrialExpired(u: { id: string; name: string | null; device_source: string | null }): Rendered {
  const { html, textBody } = brandedEmail({
    userId: u.id,
    heading: "Your free trial has ended",
    greeting: `Hi ${firstName(u.name)},`,
    paragraphs: [
      `Your ${FREE_TRIAL_DAYS}-day AI Run Coach free trial has now ended. Thanks for training with us.`,
      "Live AI coaching and post-run AI analysis are paused until you choose a plan. " +
        "Your runs, history and personal bests are all still there.",
      "Upgrade to pick up exactly where you left off.",
    ],
    benefitsIntro: "With a paid plan you get:",
    ctaLabel: "Upgrade in the app",
    ctaUrl: storeUrl(u.device_source),
    footnote: UPGRADE_HOW,
  });
  return { subject: "Your AI Run Coach free trial has ended", html, text: textBody };
}

export function renderTrialLimit(
  u: { id: string; name: string | null; timezone: string | null; device_source: string | null },
  feature: "aiCoachingKm" | "postRunAnalyses",
  trialExpiresAt: Date | null
): Rendered {
  const label =
    feature === "aiCoachingKm"
      ? `${FREE_LIMITS.aiCoachingKm} km of live AI coaching`
      : `${FREE_LIMITS.postRunAnalyses} post-run AI summaries`;
  const reset = nextMonthStart();
  const resetsDuringTrial = trialExpiresAt != null && trialExpiresAt > reset;
  const { html, textBody } = brandedEmail({
    userId: u.id,
    heading: "You've used your trial allowance",
    greeting: `Hi ${firstName(u.name)},`,
    paragraphs: [
      `You've used all <strong style="color:#ffffff;">${label}</strong> included in your free trial this month. That's some serious training!`,
      resetsDuringTrial
        ? `Your allowance resets on ${localDate(reset, u.timezone)}, or upgrade now to carry on without waiting.`
        : "Upgrade to a paid plan to carry on with your AI coach.",
    ],
    benefitsIntro: "A paid plan gives you:",
    ctaLabel: "Upgrade in the app",
    ctaUrl: storeUrl(u.device_source),
    footnote: UPGRADE_HOW,
  });
  return { subject: "You've used your AI Run Coach trial allowance", html, text: textBody };
}

// ── Senders ────────────────────────────────────────────────────────────────────

async function deliverWelcome(to: string, u: { name: string | null }): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const name = process.env.FOUNDER_NAME || "Daniel Johnston";
  const from = process.env.FOUNDER_FROM_EMAIL || fromEmail;
  const replyTo = process.env.FOUNDER_REPLY_TO_EMAIL || process.env.SUPPORT_NOTIFICATION_EMAIL || "support@airuncoach.live";
  const { subject, text } = renderWelcome(u);
  const r: any = await client.emails.send({ from: `${name} <${from}>`, to, replyTo, subject, text });
  if (r?.error) throw new Error(r.error.message || "Resend error");
}

async function deliverMarketing(to: string, userId: string, m: Rendered): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const unsub = unsubscribeUrl(userId);
  const r: any = await client.emails.send({
    from: `AI Run Coach <${fromEmail}>`,
    to,
    replyTo: process.env.SUPPORT_NOTIFICATION_EMAIL || "support@airuncoach.live",
    subject: m.subject,
    html: m.html,
    text: m.text,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  if (r?.error) throw new Error(r.error.message || "Resend error");
}

// ── Sweep (scheduler.ts, every 10 minutes) ─────────────────────────────────────

async function candidates(where: string, type: string): Promise<Candidate[]> {
  const r = await pool.query(
    `SELECT u.id, u.email, u.name, u.timezone, u.device_source, u.trial_expires_at
     FROM users u WHERE ${where} AND ${NOT_SENT_SQL(type)}
     ORDER BY u.created_at LIMIT ${BATCH}`
  );
  return r.rows;
}

export async function sweepLifecycleEmails(): Promise<Record<LifecycleEmailType, number>> {
  const sent: Record<LifecycleEmailType, number> = { welcome: 0, trial_7d: 0, trial_2d: 0, trial_expired: 0 };
  const attempt = async (type: LifecycleEmailType, c: Candidate, send: () => Promise<void>) => {
    try {
      if (await sendOnce(c.id, type, send)) {
        sent[type]++;
        console.log(`[LifecycleEmail] ${type} sent to ${c.email}`);
      }
    } catch (err: any) {
      console.error(`[LifecycleEmail] ${type} to ${c.email} failed: ${err?.message ?? err}`);
    }
  };

  for (const c of await candidates(
    `u.created_at <= NOW() - INTERVAL '1 hour' AND u.created_at > NOW() - INTERVAL '48 hours'`,
    "welcome"
  )) {
    await attempt("welcome", c, () => deliverWelcome(c.email, c));
  }

  const reminders: [LifecycleEmailType, string][] = [
    ["trial_7d", `u.trial_expires_at > NOW() + INTERVAL '2 days' AND u.trial_expires_at <= NOW() + INTERVAL '7 days'`],
    ["trial_2d", `u.trial_expires_at > NOW() AND u.trial_expires_at <= NOW() + INTERVAL '2 days'`],
  ];
  for (const [type, window] of reminders) {
    for (const c of await candidates(`${FREE_TRIAL_SQL} AND ${window}`, type)) {
      const usage = await monthUsage(c.id);
      if (allowanceUsedUp(usage)) continue; // they've had the allowance email; re-checked next sweep
      await attempt(type, c, () => deliverMarketing(c.email, c.id, renderTrialReminder(c, c.trial_expires_at!, usage)));
    }
  }

  for (const c of await candidates(
    `${FREE_TRIAL_SQL} AND u.trial_expires_at <= NOW() AND u.trial_expires_at > NOW() - INTERVAL '3 days'`,
    "trial_expired"
  )) {
    await attempt("trial_expired", c, () => deliverMarketing(c.email, c.id, renderTrialExpired(c)));
  }

  return sent;
}

// ── Trial allowance used up (usage-service.ts) ─────────────────────────────────

/**
 * Called when a trial user's usage reaches the limit or a request is refused for it. Only AI
 * coaching km and post-run summaries have a trial allowance (routes and plans are 0 = not
 * included, which is a different message). Once a month; never throws.
 */
export async function maybeSendTrialLimitEmail(
  user: {
    id: string;
    email: string | null;
    name: string | null;
    timezone?: string | null;
    deviceSource?: string | null;
    trialExpiresAt?: Date | null;
  },
  feature: string
): Promise<void> {
  try {
    if (feature !== "aiCoachingKm" && feature !== "postRunAnalyses") return;
    if (!user.email || (await isUnsubscribed(user.id))) return;
    const type = `trial_limit:${yearMonth()}`;
    const u = {
      id: user.id,
      name: user.name,
      timezone: user.timezone ?? null,
      device_source: user.deviceSource ?? null,
    };
    if (
      await sendOnce(user.id, type, () =>
        deliverMarketing(user.email!, user.id, renderTrialLimit(u, feature, user.trialExpiresAt ?? null))
      )
    ) {
      console.log(`[LifecycleEmail] ${type} (${feature}) sent to ${user.email}`);
    }
  } catch (err: any) {
    console.error(`[LifecycleEmail] trial limit email to ${user.email} failed: ${err?.message ?? err}`);
  }
}

// ── Admin preview ──────────────────────────────────────────────────────────────

/** Sends one of the emails to an admin's own address with their own details. Nothing is recorded. */
export async function sendLifecyclePreview(
  admin: { id: string; email: string; name: string | null; timezone: string | null; deviceSource: string | null },
  type: LifecycleEmailType | "trial_limit"
): Promise<void> {
  const u = { id: admin.id, name: admin.name, timezone: admin.timezone, device_source: admin.deviceSource };
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000 - 60_000);
  const usage = { km: 12.4, analyses: 4 };
  switch (type) {
    case "welcome":
      return deliverWelcome(admin.email, admin);
    case "trial_7d":
      return deliverMarketing(admin.email, admin.id, renderTrialReminder(u, inDays(7), usage));
    case "trial_2d":
      return deliverMarketing(admin.email, admin.id, renderTrialReminder(u, inDays(2), usage));
    case "trial_expired":
      return deliverMarketing(admin.email, admin.id, renderTrialExpired(u));
    case "trial_limit":
      return deliverMarketing(admin.email, admin.id, renderTrialLimit(u, "aiCoachingKm", inDays(20)));
  }
}
