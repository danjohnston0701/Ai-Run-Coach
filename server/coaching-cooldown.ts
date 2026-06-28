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
 */

import { db } from './db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

// ── Configuration ─────────────────────────────────────────────────────────────
const NON_MILESTONE_COOLDOWN_MS = 90_000;   // 90 s between non-milestone cues
const POST_MILESTONE_BUFFER_MS  = 45_000;   // 45 s quiet time after any milestone
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // discard state after 4 h inactivity
const SETTINGS_CACHE_TTL_MS = 2 * 60 * 1000; // user settings cache TTL

// ── Per-user coaching state ───────────────────────────────────────────────────
interface CoachingState {
  lastNonMilestoneAt: number;
  lastMilestoneAt: number;
  updatedAt: number;
}

const stateMap = new Map<string, CoachingState>();

// Cleanup stale sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of stateMap) {
    if (now - state.updatedAt > SESSION_TTL_MS) stateMap.delete(key);
  }
}, 30 * 60 * 1000);

// ── User settings cache ───────────────────────────────────────────────────────
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

  // ── 1. Unconditional milestones ───────────────────────��─────────────────────
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

  const state = stateMap.get(uid);
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
 */
export function recordFired(userId: string | null | undefined, isMilestone: boolean): void {
  if (!userId) return;
  const now = Date.now();
  const uid = String(userId);
  const prev = stateMap.get(uid) ?? { lastNonMilestoneAt: 0, lastMilestoneAt: 0, updatedAt: 0 };
  stateMap.set(uid, {
    lastNonMilestoneAt: isMilestone ? prev.lastNonMilestoneAt : now,
    lastMilestoneAt:    isMilestone ? now                     : prev.lastMilestoneAt,
    updatedAt:          now,
  });
}

/**
 * Build a standardised skip response body for use in coaching endpoints.
 */
export function buildSkipResponse(result: CooldownResult & { allowed: false }): Record<string, unknown> {
  const base: Record<string, unknown> = { skipped: true, reason: result.reason };
  if ('retryAfter' in result) base.retryAfter = result.retryAfter;
  return base;
}
