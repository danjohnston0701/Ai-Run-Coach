/**
 * Guest (pre-login) onboarding tour tracking.
 *
 * Both apps now offer "Take a Tour First" on the fresh-install welcome, before any account
 * exists. The signed-in tour reports to users.onboarding_tour_* (POST /api/user/
 * onboarding-tour-event); this is the unauthenticated counterpart, keyed by a client-generated
 * install id, so we can see how many downloads take the tour, how far they get, and — via
 * markGuestTourConverted() from the register handler — whether that install went on to
 * create a user. One row per install (guest_tour_sessions.device_id), upserted per event.
 */
import { Router, Request, Response } from "express";
import { pool } from "./db";

const router = Router();

const GUEST_TOUR_EVENTS = ["started", "step", "left", "skipped", "completed", "create_account"] as const;
type GuestTourEvent = (typeof GUEST_TOUR_EVENTS)[number];

const str = (v: unknown, max = 120): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;
const int = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);

/**
 * POST /api/onboarding-tour/guest-event — no auth.
 * Body: { deviceId, event, step?, stepName?, totalSteps?, platform?, timezone?, country?,
 *         device?: { manufacturer, model, osVersion, appVersion } }
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
    const timezone = str(body.timezone, 64);
    const country = str(body.country, 8);

    // Furthest-step bookkeeping mirrors the signed-in handler: "completed" counts as the
    // last page; anything else is the page reported.
    const reached = event === "completed" ? totalSteps ?? step : step;
    const reachedName = event === "completed" ? "completed" : stepName;

    await pool.query(
      `
      INSERT INTO guest_tour_sessions (
        device_id, platform, device_manufacturer, device_model, device_os_version, device_app_version,
        timezone, country, tours_started, first_started_at, last_started_at,
        furthest_step, furthest_step_name, total_steps, last_event, last_event_at,
        completed_at, skipped_at, skipped_at_step, left_at, create_account_tapped_at
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
        CASE WHEN $9::text = 'create_account' THEN NOW() ELSE NULL END
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
        updated_at          = NOW()
      `,
      [
        deviceId, platform, device.manufacturer, device.model, device.osVersion, device.appVersion,
        timezone, country, event, reached, reachedName, totalSteps,
      ],
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/onboarding-tour/guest-event] Error:", error);
    res.status(500).json({ error: "Failed to record guest tour event" });
  }
});

/**
 * Called from POST /api/auth/register when the client sends its install id: stamps the
 * guest tour row (if that install took the tour) with the user it became. Idempotent; a
 * device that never toured has no row and nothing happens.
 */
export async function markGuestTourConverted(deviceId: unknown, userId: string): Promise<void> {
  const id = str(deviceId, 64);
  if (!id) return;
  try {
    const r = await pool.query(
      `UPDATE guest_tour_sessions
         SET converted_user_id = $1, converted_at = NOW(), updated_at = NOW()
       WHERE device_id = $2 AND converted_user_id IS NULL`,
      [userId, id],
    );
    if (r.rowCount) console.log(`[GuestTour] install ${id} converted → user ${userId}`);
  } catch (error) {
    console.error("[GuestTour] Failed to mark conversion (non-fatal):", error);
  }
}

export default router;
