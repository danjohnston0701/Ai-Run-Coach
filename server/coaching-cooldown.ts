/**
 * Coaching Cooldown Manager
 *
 * Prevents in-run AI coaching cues from firing back-to-back or in rapid succession
 * while still guaranteeing that distance milestones always fire on time.
 *
 * ── Milestone events (bypass cooldown, always fire) ──────────────────────────
 *   • Km splits          isSplit === true  (honours coachKmSplitIntervalKm setting)
 *   • 500m check-in      triggerType === '500m_checkin' (honours coachHalfKmCheckInEnabled)
 *   • Final 500m         triggerType === 'final_500m'
 *   • Final 100m         triggerType === 'final_100m'
 *   • Navigation turn    triggerType === 'navigation_turn'
 *   • Interval coaching  every interval transition is a milestone
 *
 * ── Non-milestone events (subject to cooldown) ───────────────────────────────
 *   • Phase coaching (HR, cadence, technique, motivation, etc.)
 *   • Struggle coaching
 *   • Cadence coaching
 *   • Elevation coaching
 *   • Elite coaching (technique, pace trend, etc.)
 *   • HR coaching
 *   • Pace-update (when not a split)
 *
 * ── Cooldown rules ────────────────────────────────────────────────────────────
 *   NON_MILESTONE_COOLDOWN  — 90 seconds between any two non-milestone cues
 *   POST_MILESTONE_BUFFER   — 45 seconds of silence after a milestone before
 *                             non-milestone coaching can resume
 *                             (avoids e.g. elevation coaching firing 7s after a km split)
 *
 * ── Why this state lives in the database, not process memory ────────────────
 * The backend runs on Replit's autoscale deployment, which can run several
 * identical server instances simultaneously behind a load balancer. An
 * in-memory Map of "last cue time per user" is invisible across instances —
 * whenever two consecutive coaching requests for the same user land on
 * different instances, each thinks it's the first cue of the run and lets it
 * through. Confirmed 2026-09-05 (Daniel's Garmin run): coaching cues fired as
 * close as 18-23 seconds apart despite this exact 90s/45s rule being in the
 * code the whole time. The per-user settings cache below is NOT subject to
 * this problem — it caches near-static DB values with a short TTL, so a few
 * minutes of cross-instance staleness there is harmless, unlike the cooldown
 * timestamps, which are the actual coordination primitive and must be shared.
 */

import { db } from './db';
import { users, coachingCooldownState } from '../shared/schema';
import { eq } from 'drizzle-orm';

// ── Configuration ─────────────────────────────────────────────────────────────
const NON_MILESTONE_COOLDOWN_MS = 90_000;   // 90 s between non-milestone cues
const POST_MILESTONE_BUFFER_MS  = 45_000;   // 45 s quiet time after any milestone

// ── User settings cache ───────────────────────────────────────────────────────
// Safe to keep per-instance/in-memory: near-static settings, short TTL, no
// cross-request coordination requirement (see file doc comment above).
const SETTINGS_CACHE_TTL_MS = 2 * 60 * 1000; // user settings cache TTL

interface CachedSettings {
  kmInterval: number;
  halfKmEnabled: boolean;
  expiresAt: number;
}

const settingsCache = new Map<string, CachedSettings>();

async function getUserCoachSettings(userId: string): Promise<{ kmInterval: number; halfKmEnabled: boolean }> {
  const cached = settingsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { kmInterval: cached.kmInterval, halfKmEnabled: cached.halfKmEnabled };
  }
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { coachKmSplitIntervalKm: true, coachHalfKmCheckInEnabled: true },
    });
    const entry: CachedSettings = {
      kmInterval:    user?.coachKmSplitIntervalKm    ?? 1,
      halfKmEnabled: user?.coachHalfKmCheckInEnabled ?? true,
      expiresAt:     Date.now() + SETTINGS_CACHE_TTL_MS,
    };
    settingsCache.set(userId, entry);
    return { kmInterval: entry.kmInterval, halfKmEnabled: entry.halfKmEnabled };
  } catch {
    // Non-fatal: fall back to permissive defaults
    return { kmInterval: 1, halfKmEnabled: true };
  }
}

// ── Public types ──────────────────────────────────────────────────────────────
export type CooldownResult =
  | { allowed: true;  isMilestone: boolean }
  | { allowed: false; reason: 'cooldown';         retryAfter: number }
  | { allowed: false; reason: 'split_interval' }
  | { allowed: false; reason: 'half_km_disabled' };

/**
 * Reads this user's shared cooldown state from the database.
 * Returns null (never throws) on any failure — callers treat that as "no prior
 * cue on record", which is the same permissive fallback the old in-memory
 * version used for a brand-new session.
 */
async function readCooldownState(userId: string): Promise<{ lastNonMilestoneAt: number; lastMilestoneAt: number } | null> {
  try {
    const row = await db.query.coachingCooldownState.findFirst({
      where: eq(coachingCooldownState.userId, userId),
    });
    if (!row) return null;
    return {
      lastNonMilestoneAt: row.lastNonMilestoneAt ? row.lastNonMilestoneAt.getTime() : 0,
      lastMilestoneAt:    row.lastMilestoneAt    ? row.lastMilestoneAt.getTime()    : 0,
    };
  } catch (e) {
    console.warn(`[CooldownMgr] Failed to read cooldown state for ${userId} (non-fatal, treating as no prior cue): ${(e as Error).message}`);
    return null;
  }
}

/**
 * Determine whether a coaching request should fire or be suppressed.
 *
 * Call this at the start of every coaching endpoint handler, BEFORE calling
 * the AI service.  If `allowed === false`, return the skip response immediately
 * and skip AI + TTS generation entirely.
 *
 * @param endpointName  e.g. "pace-update", "phase-coaching", "interval-coaching"
 * @param body          Raw req.body from the coaching POST request
 * @param userId        User ID string, or null/undefined if unavailable
 */
export async function checkCooldown(
  endpointName: string,
  body: any,
  userId: string | null | undefined
): Promise<CooldownResult> {
  const now = Date.now();
  const uid = userId ? String(userId) : null;
  const triggerType: string = (body.triggerType ?? '').toString();
  const isSplit: boolean    = body.isSplit === true;
  const splitKm: number     = typeof body.splitKm === 'number' ? body.splitKm : 0;

  // ── 1. Unconditional milestones ─────────────────────────────────────────────
  if (triggerType === 'final_500m' || triggerType === 'final_100m') {
    return { allowed: true, isMilestone: true };
  }
  if (triggerType === 'navigation_turn') {
    return { allowed: true, isMilestone: true };
  }
  // Every interval transition is a milestone (work/recovery phase change)
  if (endpointName === 'interval-coaching') {
    return { allowed: true, isMilestone: true };
  }

  // ── 2. User-setting-gated milestones ────────────────────────────────────────
  // 500m check-in (first 500m into the run)
  if (triggerType === '500m_checkin') {
    if (uid) {
      const { halfKmEnabled } = await getUserCoachSettings(uid);
      if (!halfKmEnabled) return { allowed: false, reason: 'half_km_disabled' };
    }
    return { allowed: true, isMilestone: true };
  }

  // Km splits — enforce user's configured split interval
  if (isSplit && splitKm > 0) {
    if (uid) {
      const { kmInterval } = await getUserCoachSettings(uid);
      if (kmInterval > 1 && splitKm % kmInterval !== 0) {
        // e.g. user wants every 2 km — skip km 1, 3, 5 …
        return { allowed: false, reason: 'split_interval' };
      }
    }
    return { allowed: true, isMilestone: true };
  }

  // ── 3. Non-milestone: apply cooldown ────────────────────────────────────────
  // No userId means we have no state to check — let it through
  if (!uid) return { allowed: true, isMilestone: false };

  const state = await readCooldownState(uid);
  if (state) {
    // Post-milestone buffer: enforce quiet period after any milestone fires
    const sinceMilestone = now - state.lastMilestoneAt;
    if (state.lastMilestoneAt > 0 && sinceMilestone < POST_MILESTONE_BUFFER_MS) {
      const retryAfter = Math.ceil((POST_MILESTONE_BUFFER_MS - sinceMilestone) / 1000);
      console.log(`[CooldownMgr] ${endpointName} suppressed — ${retryAfter}s post-milestone buffer remaining (userId: ${uid})`);
      return { allowed: false, reason: 'cooldown', retryAfter };
    }
    // General non-milestone cooldown
    const sinceNonMilestone = now - state.lastNonMilestoneAt;
    if (state.lastNonMilestoneAt > 0 && sinceNonMilestone < NON_MILESTONE_COOLDOWN_MS) {
      const retryAfter = Math.ceil((NON_MILESTONE_COOLDOWN_MS - sinceNonMilestone) / 1000);
      console.log(`[CooldownMgr] ${endpointName} suppressed — ${retryAfter}s cooldown remaining (userId: ${uid})`);
      return { allowed: false, reason: 'cooldown', retryAfter };
    }
  }

  return { allowed: true, isMilestone: false };
}

/**
 * Record that a coaching cue was delivered successfully.
 * Call this AFTER res.json() so the timestamp is as late as possible.
 *
 * Upserts into the shared coachingCooldownState table — visible to every
 * autoscale instance immediately, unlike the old in-memory Map.
 */
export async function recordFired(userId: string | null | undefined, isMilestone: boolean): Promise<void> {
  if (!userId) return;
  const now = new Date();
  const uid = String(userId);
  try {
    const insertValues: typeof coachingCooldownState.$inferInsert = { userId: uid, updatedAt: now };
    if (isMilestone) insertValues.lastMilestoneAt = now;
    else insertValues.lastNonMilestoneAt = now;

    await db.insert(coachingCooldownState)
      .values(insertValues)
      .onConflictDoUpdate({
        target: coachingCooldownState.userId,
        set: isMilestone
          ? { lastMilestoneAt: now, updatedAt: now }
          : { lastNonMilestoneAt: now, updatedAt: now },
      });
  } catch (e) {
    // Non-fatal: worst case a future cue's cooldown check doesn't see this one,
    // firing a bit early — never worth failing the coaching response over.
    console.warn(`[CooldownMgr] Failed to record cooldown state for ${uid} (non-fatal): ${(e as Error).message}`);
  }
}

/**
 * Build a standardised skip response body for use in coaching endpoints.
 */
export function buildSkipResponse(result: CooldownResult & { allowed: false }): Record<string, unknown> {
  const base: Record<string, unknown> = { skipped: true, reason: result.reason };
  if ('retryAfter' in result) base.retryAfter = result.retryAfter;
  return base;
}
