import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { garminCompanionSessions } from "../shared/schema";

/**
 * Makes `runId` the run of this watch session unless another run got there first, and returns
 * whichever run owns the session.
 *
 * The phone (POST /api/runs) and the watch (session/end) finish at the same moment. Each looks
 * for the other's run, finds none because neither has inserted yet, and inserts its own: Daniel's
 * 2026-10-31 parkrun saved twice, 0.9 s apart. This single UPDATE lets only one of them win, so
 * the other can tell straight after its insert and merge instead.
 */
export async function claimCompanionSessionRun(sessionId: string, userId: string, runId: string): Promise<string> {
  const where = and(eq(garminCompanionSessions.sessionId, sessionId), eq(garminCompanionSessions.userId, userId));
  const claimed = await db.update(garminCompanionSessions)
    .set({ runId })
    .where(and(where, isNull(garminCompanionSessions.runId)))
    .returning({ runId: garminCompanionSessions.runId });
  if (claimed.length > 0) return runId;
  const [session] = await db.select({ runId: garminCompanionSessions.runId })
    .from(garminCompanionSessions)
    .where(where)
    .limit(1);
  return session?.runId ?? runId;
}
