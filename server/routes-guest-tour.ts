/**
 * Guest (pre-login) onboarding tour tracking.
 *
 * Both apps now offer "Take a Tour First" on the fresh-install welcome, before any account
 * exists. The signed-in tour reports to users.onboarding_tour_* (POST /api/user/
 * onboarding-tour-event); this is the unauthenticated counterpart, keyed by a client-generated
 * install id, so we can see how many downloads take the tour, how far they get, and — via
 * markGuestTourConverted() from the register handler — whether that install went on to
 * create a user. One row per install (guest_tour_sessions.device_id), upserted per event.
 * That same conversion also stamps users.acquisition_source = 'guest_tour' on the new user.
 */
import { Router, Request, Response } from "express";
import { pool } from "./db";

const router = Router();

// "skip_prompt": a pre-login visitor tapped Skip and was offered the account (create / keep
// touring / back to welcome) — not an exit by itself; only "Back to welcome" sends "skipped".
// "create_account" can now arrive from any page (the top-bar shortcut), not just the last one.
const GUEST_TOUR_EVENTS = ["started", "step", "left", "skipped", "skip_prompt", "completed", "create_account"] as const;
type GuestTourEvent = (typeof GUEST_TOUR_EVENTS)[number];

const str = (v: unknown, max = 120): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;
const int = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);

const WATCH_CHOICES = ["apple_watch", "garmin_watch", "samsung_watch", "phone_only"] as const;
const EVENT_LOG_CAP = 200;

/**
 * POST /api/onboarding-tour/guest-event — no auth.
 * Body: { deviceId, event, step?, stepName?, totalSteps?, watchChoice?, platform?, timezone?,
 *         country?, device?: { manufacturer, model, osVersion, appVersion } }
 *
 * Beyond the furthest-step funnel, each row keeps the screen of the latest event
 * (current_step*), the screen of the latest skip/leave (abandoned_* — cleared once the tour is
 * completed, so "abandoned_via IS NOT NULL" means the visitor's last exit was a drop-off), the
 * device they said they run with (watch_choice), and a capped per-event log for dwell times.
 */
router.post("/onboarding-tour/guest-event", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const deviceId = str(body.deviceId, 64);
    const event = str(body.event, 32) as GuestTourEvent | null;
    if (!deviceId) return res.status(400).json({ error: "deviceId required" });
    if (!event || !GUEST_TOUR_EVENTS.includes(event)) {
      return res.status(400).json({ error: `event must be one of ${GUEST_TOUR_EVENTS.join(", ")}` });
    }

    const step = int(body.step);
    const totalSteps = int(body.totalSteps);
    const stepName = str(body.stepName, 60);
    const platform = (() => {
      const p = str(body.platform, 16)?.toLowerCase();
      return p === "ios" || p === "android" ? p : null;
    })();
    const d = body.device && typeof body.device === "object" ? body.device : {};
    const device = {
      manufacturer: str(d.manufacturer),
      model: str(d.model),
      osVersion: str(d.osVersion),
      appVersion: str(d.appVersion),
    };
    const watchChoice = (() => {
      const w = str(body.watchChoice, 24)?.toLowerCase();
      return w && (WATCH_CHOICES as readonly string[]).includes(w) ? w : null;
    })();
    const timezone = str(body.timezone, 64);
    const country = str(body.country, 8);

    // Furthest-step bookkeeping mirrors the signed-in handler: "completed" counts as the
    // last page; anything else is the page reported.
    const reached = event === "completed" ? totalSteps ?? step : step;
    const reachedName = event === "completed" ? "completed" : stepName;
    const isExit = event === "skipped" || event === "left";
    const logEntry = JSON.stringify([
      { e: event, s: step, n: stepName, w: watchChoice, t: new Date().toISOString() },
    ]);

    await pool.query(
      `
      INSERT INTO guest_tour_sessions (
        device_id, platform, device_manufacturer, device_model, device_os_version, device_app_version,
        timezone, country, tours_started, first_started_at, last_started_at,
        furthest_step, furthest_step_name, total_steps, last_event, last_event_at,
        completed_at, skipped_at, skipped_at_step, left_at, create_account_tapped_at,
        watch_choice, current_step, current_step_name,
        abandoned_step, abandoned_step_name, abandoned_via, abandoned_at, event_log
      ) VALUES (
        $1::text, $2::text, $3::text, $4::text, $5::text, $6::text,
        $7::text, $8::text,
        CASE WHEN $9::text = 'started' THEN 1 ELSE 0 END,
        CASE WHEN $9::text = 'started' THEN NOW() ELSE NULL END,
        CASE WHEN $9::text = 'started' THEN NOW() ELSE NULL END,
        $10::int, $11::text, $12::int, $9::text, NOW(),
        CASE WHEN $9::text = 'completed' THEN NOW() ELSE NULL END,
        CASE WHEN $9::text = 'skipped' THEN NOW() ELSE NULL END,
        CASE WHEN $9::text = 'skipped' THEN $10::int ELSE NULL END,
        CASE WHEN $9::text = 'left' THEN NOW() ELSE NULL END,
        CASE WHEN $9::text = 'create_account' THEN NOW() ELSE NULL END,
        $13::text, $14::int, $15::text,
        CASE WHEN $16::boolean THEN $14::int ELSE NULL END,
        CASE WHEN $16::boolean THEN $15::text ELSE NULL END,
        CASE WHEN $16::boolean THEN $9::text ELSE NULL END,
        CASE WHEN $16::boolean THEN NOW() ELSE NULL END,
        $17::jsonb
      )
      ON CONFLICT (device_id) DO UPDATE SET
        platform            = COALESCE(EXCLUDED.platform, guest_tour_sessions.platform),
        device_manufacturer = COALESCE(EXCLUDED.device_manufacturer, guest_tour_sessions.device_manufacturer),
        device_model        = COALESCE(EXCLUDED.device_model, guest_tour_sessions.device_model),
        device_os_version   = COALESCE(EXCLUDED.device_os_version, guest_tour_sessions.device_os_version),
        device_app_version  = COALESCE(EXCLUDED.device_app_version, guest_tour_sessions.device_app_version),
        timezone            = COALESCE(EXCLUDED.timezone, guest_tour_sessions.timezone),
        country             = COALESCE(EXCLUDED.country, guest_tour_sessions.country),
        tours_started       = guest_tour_sessions.tours_started + EXCLUDED.tours_started,
        first_started_at    = COALESCE(guest_tour_sessions.first_started_at, EXCLUDED.first_started_at),
        last_started_at     = COALESCE(EXCLUDED.last_started_at, guest_tour_sessions.last_started_at),
        furthest_step       = CASE WHEN EXCLUDED.furthest_step IS NOT NULL
                                    AND EXCLUDED.furthest_step >= COALESCE(guest_tour_sessions.furthest_step, -1)
                                   THEN EXCLUDED.furthest_step ELSE guest_tour_sessions.furthest_step END,
        furthest_step_name  = CASE WHEN EXCLUDED.furthest_step IS NOT NULL
                                    AND EXCLUDED.furthest_step >= COALESCE(guest_tour_sessions.furthest_step, -1)
                                   THEN COALESCE(EXCLUDED.furthest_step_name, guest_tour_sessions.furthest_step_name)
                                   ELSE guest_tour_sessions.furthest_step_name END,
        total_steps         = COALESCE(EXCLUDED.total_steps, guest_tour_sessions.total_steps),
        last_event          = EXCLUDED.last_event,
        last_event_at       = NOW(),
        completed_at        = COALESCE(guest_tour_sessions.completed_at, EXCLUDED.completed_at),
        skipped_at          = COALESCE(guest_tour_sessions.skipped_at, EXCLUDED.skipped_at),
        skipped_at_step     = COALESCE(guest_tour_sessions.skipped_at_step, EXCLUDED.skipped_at_step),
        left_at             = COALESCE(EXCLUDED.left_at, guest_tour_sessions.left_at),
        create_account_tapped_at = COALESCE(guest_tour_sessions.create_account_tapped_at, EXCLUDED.create_account_tapped_at),
        watch_choice        = COALESCE(EXCLUDED.watch_choice, guest_tour_sessions.watch_choice),
        current_step        = COALESCE(EXCLUDED.current_step, guest_tour_sessions.current_step),
        current_step_name   = CASE WHEN EXCLUDED.current_step IS NOT NULL
                                   THEN EXCLUDED.current_step_name ELSE guest_tour_sessions.current_step_name END,
        -- Latest exit wins (a visitor who comes back and drops off later is judged on the later
        -- screen); finishing the tour clears it.
        abandoned_step      = CASE WHEN $16::boolean THEN EXCLUDED.abandoned_step
                                   WHEN $9::text = 'completed' THEN NULL ELSE guest_tour_sessions.abandoned_step END,
        abandoned_step_name = CASE WHEN $16::boolean THEN EXCLUDED.abandoned_step_name
                                   WHEN $9::text = 'completed' THEN NULL ELSE guest_tour_sessions.abandoned_step_name END,
        abandoned_via       = CASE WHEN $16::boolean THEN EXCLUDED.abandoned_via
                                   WHEN $9::text = 'completed' THEN NULL ELSE guest_tour_sessions.abandoned_via END,
        abandoned_at        = CASE WHEN $16::boolean THEN EXCLUDED.abandoned_at
                                   WHEN $9::text = 'completed' THEN NULL ELSE guest_tour_sessions.abandoned_at END,
        event_log           = (
          SELECT COALESCE(jsonb_agg(x.v ORDER BY x.i), '[]'::jsonb)
            FROM jsonb_array_elements(guest_tour_sessions.event_log || EXCLUDED.event_log)
                 WITH ORDINALITY AS x(v, i)
           WHERE x.i > jsonb_array_length(guest_tour_sessions.event_log || EXCLUDED.event_log) - ${EVENT_LOG_CAP}
        ),
        updated_at          = NOW()
      `,
      [
        deviceId, platform, device.manufacturer, device.model, device.osVersion, device.appVersion,
        timezone, country, event, reached, reachedName, totalSteps,
        watchChoice, step, stepName, isExit, logEntry,
      ],
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/onboarding-tour/guest-event] Error:", error);
    res.status(500).json({ error: "Failed to record guest tour event" });
  }
});

/**
 * Called from POST /api/auth/register when the client sends its install id: records that this
 * install's tour became this user, on BOTH sides of the join — guest_tour_sessions.converted_*
 * (per-install funnel) and users.acquisition_source/guest_tour_* (so "was this user acquired
 * through the tour?" is answerable from the user row alone, without knowing the guest-tour
 * table exists). Idempotent and write-once on both; a device that never toured has no
 * guest_tour_sessions row, so nothing is stamped anywhere.
 *
 * The two updates are deliberately independent: the guest_tour_sessions one is skipped when
 * that install already converted (a second account created on the same device), but the new
 * user still genuinely arrived via the tour, so their own row is stamped either way.
 */
export async function markGuestTourConverted(deviceId: unknown, userId: string): Promise<void> {
  const id = str(deviceId, 64);
  if (!id) return;
  try {
    // Did this install actually take the tour? No row = direct sign-up, nothing to record.
    const tour = await pool.query(`SELECT 1 FROM guest_tour_sessions WHERE device_id = $1`, [id]);
    if (!tour.rowCount) return;

    await pool.query(
      `UPDATE guest_tour_sessions
         SET converted_user_id = $1, converted_at = NOW(), updated_at = NOW()
       WHERE device_id = $2 AND converted_user_id IS NULL`,
      [userId, id],
    );

    await pool.query(
      `UPDATE users
         SET acquisition_source      = COALESCE(acquisition_source, 'guest_tour'),
             guest_tour_device_id    = COALESCE(guest_tour_device_id, $2),
             guest_tour_converted_at = COALESCE(guest_tour_converted_at, NOW())
       WHERE id = $1`,
      [userId, id],
    );

    console.log(`[GuestTour] install ${id} converted → user ${userId} (acquisition_source=guest_tour)`);
  } catch (error) {
    console.error("[GuestTour] Failed to mark conversion (non-fatal):", error);
  }
}

export default router;
