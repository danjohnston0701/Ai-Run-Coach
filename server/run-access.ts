// Authorization for reading/writing a single run by ID.
//
// Until 2026-09-13 the per-run endpoints had no ownership check at all: GET /api/runs/:id and
// POST /api/runs/:id/analysis authenticated the caller but never asked whether the run was
// theirs, and GET /api/runs/:id/analysis, GET /api/runs/:id/device-data and
// POST /api/runs/:id/ai-insights had no auth middleware whatsoever (the last one both spends
// OpenAI credits and writes back to the run). Run IDs are UUIDs so nothing was enumerable,
// but anyone holding or guessing an ID could read a stranger's GPS track, splits and heart
// rate — or rewrite their AI insights.
//
// The fix is a single access model rather than per-route ad-hoc checks, because the app has
// three genuine cross-user read paths that a naive `run.userId === userId` would have broken:
//
//   1. Live-tracking observers. When a watched session finishes, the runner's phone writes
//      live_run_sessions.result_run_id and the observer screen offers "View run summary" —
//      a signed-in observer opening the *runner's* run. Only users the runner actually
//      invited (they appear in the session's `observers` JSON) qualify; email/token
//      standalone observers never get the button and are not covered here.
//   2. Group-run participants. runs.group_run_id links a run to its group run, and everyone
//      who accepted an invitation can already see each other's full run records through
//      GET /api/group-runs/:id/results — so the same people reading them individually is not
//      a new disclosure.
//   3. The onboarding tour's designated demo run, which every signed-in user may read by
//      design (see GET /api/onboarding-tour/demo-run in routes.ts).
//
// Writes are deliberately stricter than reads: owner only, no exceptions.
//
// Verified against live data on 2026-09-13: owner allowed, stranger denied, tour demo run
// readable by a stranger but not writable, and a real 2-participant group run's co-participant
// allowed. The observer branch could NOT be data-verified — no production row has a non-null
// `observers` array yet (all 21 sessions) and none has result_run_id, since the friend-invite
// and result-linking features haven't shipped. It's matched to the only code path that reaches
// the observer screen's "View run summary" button (the live_run_invite push, sent solely by
// the friendId branch of POST /api/live-sessions/:id/invite-observer, which is what calls
// storage.inviteObserver and writes the userId into `observers`), so re-check this first if an
// observer reports a 404 opening a finished run.

import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { liveRunSessions, groupRunParticipants } from "@shared/schema";
import { storage } from "./storage";

/**
 * The one run any signed-in user may read regardless of ownership. Shared with the
 * GET /api/onboarding-tour/demo-run route so the tour's older fallback path
 * (Android OnboardingTourScreen.loadTourDemoRun → GET /api/runs/{id}) keeps working on
 * clients built before that endpoint existed. Swapping the demo run means changing it here.
 */
export const ONBOARDING_TOUR_DEMO_RUN_ID = "09b2fa5f-1b16-4de3-a89a-85129644a9c8";

/** Why a reader was allowed through — logged on access, useful when auditing a report. */
export type RunAccessReason = "owner" | "observer" | "group-participant" | "tour-demo";

/**
 * Resolve a run for a reader. Returns null when the run does not exist OR the caller may not
 * see it — callers should answer 404 either way, so a probe can't distinguish "no such run"
 * from "not yours".
 */
export async function getRunForReader(
  runId: string,
  userId: string,
): Promise<{ run: any; reason: RunAccessReason } | null> {
  const run = await storage.getRun(runId);
  if (!run) return null;

  if ((run as any).userId === userId) return { run, reason: "owner" };
  if (runId === ONBOARDING_TOUR_DEMO_RUN_ID) return { run, reason: "tour-demo" };

  // Observer of the live session this run came from.
  const sessions = await db
    .select({ observers: liveRunSessions.observers })
    .from(liveRunSessions)
    .where(eq(liveRunSessions.resultRunId, runId));
  for (const session of sessions) {
    const observers = (session.observers as Array<{ userId?: string }> | null) ?? [];
    if (observers.some((o) => o?.userId === userId)) return { run, reason: "observer" };
  }

  // Accepted participant of the group run this run belongs to.
  const groupRunId = (run as any).groupRunId as string | null | undefined;
  if (groupRunId) {
    const [participant] = await db
      .select({ userId: groupRunParticipants.userId })
      .from(groupRunParticipants)
      .where(
        and(
          eq(groupRunParticipants.groupRunId, groupRunId),
          eq(groupRunParticipants.userId, userId),
          eq(groupRunParticipants.invitationStatus, "accepted"),
        ),
      );
    if (participant) return { run, reason: "group-participant" };
  }

  console.warn(`[run-access] Denied read of run ${runId} to user ${userId} (owner ${(run as any).userId})`);
  return null;
}

/**
 * Resolve a run for a writer. Owner only — none of the read exceptions apply, so an observer
 * or group-mate can never overwrite someone else's analysis or trigger a paid regeneration
 * against their run.
 */
export async function getRunForOwner(runId: string, userId: string): Promise<any | null> {
  const run = await storage.getRun(runId);
  if (!run) return null;
  if ((run as any).userId !== userId) {
    console.warn(`[run-access] Denied write to run ${runId} by user ${userId} (owner ${(run as any).userId})`);
    return null;
  }
  return run;
}
