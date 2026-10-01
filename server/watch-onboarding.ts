/**
 * "First time we've seen this user genuinely using a watch" — the trigger for the one-off
 * watch welcome email (sendWatchWelcomeEmail) that explains how the watch and phone work
 * together: live AI coaching needs the phone with you; watch-only still syncs for full
 * post-run analysis.
 *
 * Deliberately NOT keyed off users.garmin_watch_app_last_seen_at: /refresh-watch-token bumps
 * that on every phone-app open for every user, watch or not, so it says nothing about watch
 * use. Real signals only:
 *  - Garmin / Wear OS: the companion pairing flows (/auth, pairing-code confirm) and the watch's
 *    own session/start. The latter matters — a watch authorised over Bluetooth by the phone
 *    never goes through either pairing endpoint, so has_garmin_watch_app stayed false for those
 *    users and they were missing from watch-app update broadcasts (seen on a 2026-09-29 signup).
 *  - Apple Watch: the first standalone watch workout the iPhone uploads
 *    (workout_type = 'watch_standalone'); the server has no earlier Apple Watch signal.
 *
 * Both are race-safe "exactly once": the Garmin/Wear path flips has_garmin_watch_app with a
 * conditional UPDATE … RETURNING, and the Apple path only fires when this is the user's first
 * standalone run. Email failures are logged, never thrown — this must not affect the request.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";

function watchLabelFor(deviceModel: string | null | undefined): string {
  const m = (deviceModel || "").toLowerCase();
  if (m.includes("galaxy") || m.includes("wear os") || m.includes("samsung")) return "Galaxy Watch";
  return "Garmin watch";
}

async function sendWelcome(email: string | null, name: string | null, watchLabel: string): Promise<void> {
  if (!email) return;
  try {
    const { sendWatchWelcomeEmail } = await import("./email-service");
    await sendWatchWelcomeEmail({ email, name, watchLabel });
  } catch (err: any) {
    console.warn(`[WatchOnboarding] Welcome email to ${email} failed (non-fatal):`, err?.message);
  }
}

/**
 * Garmin / Wear OS companion seen for this user. Marks has_garmin_watch_app (+ first-seen) the
 * first time and sends the welcome email then; a no-op on every later call.
 */
export async function onWatchCompanionSeen(userId: string, deviceModel?: string | null): Promise<void> {
  try {
    const result: any = await db.execute(sql`
      UPDATE users
         SET has_garmin_watch_app = true,
             garmin_watch_app_first_seen_at = COALESCE(garmin_watch_app_first_seen_at, NOW())
       WHERE id = ${userId}
         AND has_garmin_watch_app IS NOT TRUE
      RETURNING email, name
    `);
    const row = result?.rows?.[0];
    if (row) {
      console.log(`[WatchOnboarding] First watch companion use for user ${userId} (${deviceModel || "unknown model"})`);
      // Fire-and-forget: never hold up the watch's request on an email send.
      void sendWelcome(row.email, row.name, watchLabelFor(deviceModel));
    }
  } catch (err: any) {
    console.warn(`[WatchOnboarding] onWatchCompanionSeen failed for ${userId} (non-fatal):`, err?.message);
  }
}

/** Call after saving a run; sends the Apple Watch welcome on the user's first standalone watch run. */
export async function onRunSavedForWatchOnboarding(userId: string, workoutType: string | null | undefined): Promise<void> {
  if (workoutType !== "watch_standalone") return;
  try {
    const result: any = await db.execute(sql`
      SELECT u.email, u.name,
             (SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id AND r.workout_type = 'watch_standalone')::int AS n
        FROM users u
       WHERE u.id = ${userId}
    `);
    const row = result?.rows?.[0];
    if (row && Number(row.n) === 1) {
      console.log(`[WatchOnboarding] First standalone Apple Watch run for user ${userId}`);
      void sendWelcome(row.email, row.name, "Apple Watch");
    }
  } catch (err: any) {
    console.warn(`[WatchOnboarding] onRunSavedForWatchOnboarding failed for ${userId} (non-fatal):`, err?.message);
  }
}
