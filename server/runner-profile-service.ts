/**
 * Runner Profile Service — "What I know about you"
 *
 * Maintains the ai_runner_profile column in user_stats.
 *
 * WHY:
 *   Every AI feature in the app (pre-run briefing, route suggestions, plan
 *   generation, in-run coaching, post-run analysis) benefits from a rich
 *   personal context about the runner.  Without a pre-built summary, each
 *   feature must query and re-interpret raw data at call time — slow, costly,
 *   and imprecise.  With a living profile, every feature simply injects 200
 *   words of curated context and gets hyper-personalised output instantly.
 *
 * WHEN IT RUNS:
 *   - After every run is saved (triggered non-blocking from user-stats-cache)
 *   - On demand via POST /api/my-data/refresh-runner-profile
 *
 * WHAT IT CAPTURES:
 *   Runner identity, fitness level, weekly volume, personal bests, active
 *   training plan status, goals, recent run patterns, recurring challenges
 *   (stitches, HR spikes, elevation struggles), injury history, coaching tone
 *   preference, last run details — everything a coach needs to personalise
 *   advice without looking anything up.
 *
 * OUTPUT:
 *   ~150–250 words of plain English, written in third person.
 *   Stored in user_stats.ai_runner_profile.  Injected verbatim into AI prompts.
 */

import OpenAI from 'openai';
import { db } from './db';
import {
  users, runs, userStats, goals, trainingPlans, plannedWorkouts,
} from '@shared/schema';
import {
  eq, and, desc, gte, isNotNull, count, sum, max,
} from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Shared prompt helper ────────────────────────────────────────────────────

/**
 * Returns a formatted runner-profile block ready to append to any AI system
 * prompt.  Pass the result of getRunnerProfile(userId) — or the value stored
 * on a session/context — directly into any AI function that accepts
 * `runnerProfile?: string | null`.
 *
 * When profile is empty/null this returns an empty string so callers can
 * safely do: `systemPrompt + runnerProfileBlock(profile)` without guards.
 *
 * Usage example:
 *   const profile = await getRunnerProfile(userId);
 *   const systemPrompt = `You are a running coach...` + runnerProfileBlock(profile);
 */
export function runnerProfileBlock(profile: string | null | undefined): string {
  if (!profile || profile.trim() === '') return '';
  return `

━━━ RUNNER PROFILE — "What I know about this runner" ━━━
${profile.trim()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use the above context to personalise every part of your response. Reference specifics when relevant — name, goals, challenges, PBs, recent form — but only where it adds value. Do not repeat the profile back verbatim.`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Regenerate the AI runner profile for a user and persist it to user_stats.
 * Non-blocking safe — all errors are caught and logged, never thrown.
 */
export async function refreshRunnerProfile(userId: string): Promise<void> {
  try {
    const context = await gatherRunnerContext(userId);
    if (!context) {
      console.warn(`[RunnerProfile] No context available for user ${userId} — skipping`);
      return;
    }

    const profile = await generateProfile(context);
    if (!profile) return;

    await persistProfile(userId, profile);
    console.log(`[RunnerProfile] Updated profile for user ${userId} (${profile.length} chars)`);
  } catch (err) {
    // Non-fatal — My Data screen and all AI features have sensible fallbacks
    console.error(`[RunnerProfile] Failed to refresh profile for user ${userId}:`, err);
  }
}

/**
 * Read the current runner profile from cache.
 * Returns null if not yet generated.
 */
export async function getRunnerProfile(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ aiRunnerProfile: userStats.aiRunnerProfile })
    .from(userStats)
    .where(eq(userStats.userId, userId));
  return row?.aiRunnerProfile ?? null;
}

// ─── Context assembly ────────────────────────────────────────────────────────

interface RunnerContext {
  // Identity
  name: string;
  age: number | null;
  gender: string | null;
  fitnessLevel: string | null;
  desiredFitnessLevel: string | null;
  coachName: string;
  injuryHistory: any;

  // Totals
  totalRuns: number;
  totalDistanceKm: number;
  totalHours: number;

  // Weekly volume (last 4 weeks)
  avgWeeklyRunsLast4Weeks: number;
  avgWeeklyKmLast4Weeks: number;

  // Personal bests (formatted strings)
  pb5k: string | null;
  pb10k: string | null;
  pbHalf: string | null;
  pbMarathon: string | null;
  pb20k: string | null;

  // Active plan
  activePlan: {
    goalType: string;
    currentWeek: number;
    totalWeeks: number;
    targetDate: string | null;
    experienceLevel: string;
  } | null;

  // Active goals
  activeGoals: string[];

  // Recent runs (last 10) — lightweight summary
  recentRuns: {
    date: string;
    distanceKm: number;
    avgPace: string | null;
    avgHeartRate: number | null;
    elevationGainM: number | null;
    workoutType: string | null;
    durationMin: number;
  }[];

  // Last run details
  lastRun: {
    date: string;
    distanceKm: number;
    avgPace: string | null;
    durationMin: number;
    elevationGainM: number | null;
  } | null;
}

async function gatherRunnerContext(userId: string): Promise<RunnerContext | null> {
  // ── 1. User profile ───────────────────────────────────────────────────────
  const [user] = await db
    .select({
      name:                 users.name,
      dob:                  users.dob,
      gender:               users.gender,
      fitnessLevel:         users.fitnessLevel,
      desiredFitnessLevel:  users.desiredFitnessLevel,
      coachName:            users.coachName,
      injuryHistory:        users.injuryHistory,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return null;

  // ── 2. Cached totals + PBs ────────────────────────────────────────────────
  const [stats] = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId));

  const totalRuns        = stats?.totalRuns        ?? 0;
  const totalDistanceKm  = stats?.totalDistanceKm  ?? 0;
  const totalDurationSec = stats?.totalDurationSeconds ?? 0;

  // ── 3. Recent runs — last 10, only essential columns ─────────────────────
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const recentRawRuns = await db
    .select({
      completedAt:   runs.completedAt,
      distance:      runs.distance,
      duration:      runs.duration,
      avgPace:       runs.avgPace,
      avgHeartRate:  runs.avgHeartRate,
      elevationGain: runs.elevationGain,
      workoutType:   runs.workoutType,
    })
    .from(runs)
    .where(eq(runs.userId, userId))
    .orderBy(desc(runs.completedAt))
    .limit(10);

  // Weekly volume over last 4 weeks
  const recentRunsForVolume = await db
    .select({ distance: runs.distance })
    .from(runs)
    .where(and(eq(runs.userId, userId), gte(runs.completedAt, fourWeeksAgo)));

  const runsLast4Weeks = recentRunsForVolume.length;
  const kmLast4Weeks   = recentRunsForVolume.reduce((sum, r) => sum + (r.distance ?? 0) / 1000, 0);
  const avgWeeklyRunsLast4Weeks = Math.round((runsLast4Weeks / 4) * 10) / 10;
  const avgWeeklyKmLast4Weeks   = Math.round((kmLast4Weeks   / 4) * 10) / 10;

  const recentRuns = recentRawRuns.map(r => ({
    date:           r.completedAt?.toISOString().split('T')[0] ?? '',
    distanceKm:     Math.round(((r.distance ?? 0) / 1000) * 100) / 100,
    avgPace:        r.avgPace ?? null,
    avgHeartRate:   r.avgHeartRate ?? null,
    elevationGainM: r.elevationGain != null ? Math.round(r.elevationGain) : null,
    workoutType:    r.workoutType ?? null,
    durationMin:    Math.round((r.duration ?? 0) / 60),
  }));

  const lastRun = recentRuns[0] ?? null;

  // ── 4. Active training plan ───────────────────────────────────────────────
  const activePlans = await db
    .select({
      goalType:        trainingPlans.goalType,
      currentWeek:     trainingPlans.currentWeek,
      totalWeeks:      trainingPlans.totalWeeks,
      targetDate:      trainingPlans.targetDate,
      experienceLevel: trainingPlans.experienceLevel,
    })
    .from(trainingPlans)
    .where(and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, 'active')))
    .limit(1);

  const activePlan = activePlans[0]
    ? {
        goalType:        activePlans[0].goalType,
        currentWeek:     activePlans[0].currentWeek ?? 1,
        totalWeeks:      activePlans[0].totalWeeks,
        targetDate:      activePlans[0].targetDate?.toISOString().split('T')[0] ?? null,
        experienceLevel: activePlans[0].experienceLevel,
      }
    : null;

  // ── 5. Active goals ───────────────────────────────────────────────────────
  const activeGoalRows = await db
    .select({ title: goals.title, type: goals.type, targetDate: goals.targetDate })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))
    .limit(5);

  const activeGoals = activeGoalRows.map(g =>
    g.targetDate
      ? `${g.title} (target: ${g.targetDate.toISOString().split('T')[0]})`
      : g.title,
  );

  // ── 6. Age ────────────────────────────────────────────────────────────────
  let age: number | null = null;
  if (user.dob) {
    const dob = new Date(user.dob);
    if (!isNaN(dob.getTime())) {
      age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
  }

  // ── 7. PB formatting helper ───────────────────────────────────────────────
  const fmtPb = (ms: number | null | undefined, distKm: number): string | null => {
    if (!ms) return null;
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const timeStr = h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
    const paceMin = totalSec / 60 / distKm;
    const pm = Math.floor(paceMin);
    const ps = Math.round((paceMin - pm) * 60);
    return `${timeStr} (${pm}:${ps.toString().padStart(2, '0')}/km)`;
  };

  return {
    name:                user.name,
    age,
    gender:              user.gender ?? null,
    fitnessLevel:        user.fitnessLevel ?? null,
    desiredFitnessLevel: user.desiredFitnessLevel ?? null,
    coachName:           user.coachName ?? 'AI Coach',
    injuryHistory:       user.injuryHistory ?? null,

    totalRuns,
    totalDistanceKm:    Math.round(totalDistanceKm * 10) / 10,
    totalHours:         Math.round((totalDurationSec / 3600) * 10) / 10,

    avgWeeklyRunsLast4Weeks,
    avgWeeklyKmLast4Weeks,

    pb5k:      fmtPb(stats?.pb5kDurationMs,       5.0),
    pb10k:     fmtPb(stats?.pb10kDurationMs,      10.0),
    pb20k:     fmtPb(stats?.pb20kDurationMs,      20.0),
    pbHalf:    fmtPb(stats?.pbHalfDurationMs,     21.1),
    pbMarathon:fmtPb(stats?.pbMarathonDurationMs, 42.2),

    activePlan,
    activeGoals,
    recentRuns,
    lastRun,
  };
}

// ─── GPT generation ───────────────────────────────────────────────────────────

async function generateProfile(ctx: RunnerContext): Promise<string | null> {
  const injuryNote = ctx.injuryHistory
    ? `Injury history / health notes: ${JSON.stringify(ctx.injuryHistory)}.`
    : '';

  const planNote = ctx.activePlan
    ? `Currently on week ${ctx.activePlan.currentWeek} of ${ctx.activePlan.totalWeeks} of a ${ctx.activePlan.goalType.replace('_', ' ')} plan (${ctx.activePlan.experienceLevel} level)${ctx.activePlan.targetDate ? `, targeting ${ctx.activePlan.targetDate}` : ''}.`
    : 'No active training plan.';

  const goalsNote = ctx.activeGoals.length > 0
    ? `Active goals: ${ctx.activeGoals.join('; ')}.`
    : 'No active goals set.';

  const pbLines = [
    ctx.pb5k      && `5K: ${ctx.pb5k}`,
    ctx.pb10k     && `10K: ${ctx.pb10k}`,
    ctx.pb20k     && `20K: ${ctx.pb20k}`,
    ctx.pbHalf    && `Half Marathon: ${ctx.pbHalf}`,
    ctx.pbMarathon && `Marathon: ${ctx.pbMarathon}`,
  ].filter(Boolean).join(', ');

  const recentRunLines = ctx.recentRuns.slice(0, 8).map(r =>
    `${r.date}: ${r.distanceKm}km in ${r.durationMin}min${r.avgPace ? ` @ ${r.avgPace}/km` : ''}${r.elevationGainM ? ` (+${r.elevationGainM}m elev)` : ''}${r.workoutType ? ` [${r.workoutType}]` : ''}${r.avgHeartRate ? ` HR:${r.avgHeartRate}` : ''}`,
  ).join('\n');

  const lastRunNote = ctx.lastRun
    ? `Last run: ${ctx.lastRun.date}, ${ctx.lastRun.distanceKm}km, ${ctx.lastRun.durationMin}min${ctx.lastRun.avgPace ? ` @ ${ctx.lastRun.avgPace}/km` : ''}.`
    : 'No runs recorded yet.';

  const userPrompt = `
RUNNER DATA:
Name: ${ctx.name}${ctx.age ? `, Age: ${ctx.age}` : ''}${ctx.gender ? `, Gender: ${ctx.gender}` : ''}
Fitness level: ${ctx.fitnessLevel ?? 'not set'} → aiming for: ${ctx.desiredFitnessLevel ?? 'not set'}
${injuryNote}

TOTALS:
${ctx.totalRuns} runs | ${ctx.totalDistanceKm}km | ${ctx.totalHours} hours lifetime
Recent 4-week avg: ${ctx.avgWeeklyRunsLast4Weeks} runs/week, ${ctx.avgWeeklyKmLast4Weeks}km/week

PERSONAL BESTS:
${pbLines || 'None recorded yet'}

PLAN & GOALS:
${planNote}
${goalsNote}

RECENT RUNS (newest first):
${recentRunLines || 'None'}

${lastRunNote}
`.trim();

  const systemPrompt = `You are an AI running coach writing a concise internal briefing note about a runner.

Write a 150–220 word plain-English summary in third person (e.g. "Dan is...").
This profile is injected into EVERY AI prompt across the app — pre-run briefings,
route suggestions, training plan generation, in-run coaching, post-run analysis —
so it must be maximally useful to an AI reading it cold.

INCLUDE (where data is available):
- Name, rough fitness level, running experience
- Current weekly volume and recent trend
- Active plan / goal and where they are in it
- Key personal bests and whether they are improving
- Any recurring challenges, weaknesses, or injury notes
- Last run context
- The "type" of runner they are (e.g. speed-focused, endurance-builder, casual, competitive)
- What to focus on / what to watch out for in coaching

TONE: Factual and concise. No fluff. Write as a coach would brief a colleague.
FORMAT: Plain text only. No bullet points, headers, or markdown. One flowing paragraph or two short paragraphs.
DO NOT fabricate data not provided. If a field is missing, simply omit it.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    max_tokens: 350,
    temperature: 0.4, // Low temperature for consistent, factual output
  });

  return completion.choices[0]?.message?.content?.trim() ?? null;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function persistProfile(userId: string, profile: string): Promise<void> {
  await db
    .insert(userStats)
    .values({
      userId,
      aiRunnerProfile:          profile,
      aiRunnerProfileUpdatedAt: new Date(),
      // Required NOT NULL columns — provide safe defaults; the real upsert in
      // recomputeForUser() will overwrite these immediately after (it always
      // runs first).  This insert only fires when the row already exists, so
      // onConflictDoUpdate handles it cleanly.
      totalRuns:            0,
      totalDistanceKm:      0,
      totalDurationSeconds: 0,
      totalElevationGainM:  0,
      totalCalories:        0,
      totalActiveCalories:  0,
      longestRunKm:         0,
    })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: {
        aiRunnerProfile:          profile,
        aiRunnerProfileUpdatedAt: new Date(),
      },
    });
}
