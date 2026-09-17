/**
 * Google Play Real-time Developer Notifications (RTDN) endpoint.
 *
 * Google publishes subscription events to a Cloud Pub/Sub topic; a *push* subscription on
 * that topic POSTs each message here. Mounted from routes.ts as
 *   POST /api/google/play-notifications
 *
 * Setup (Daniel):
 *   1. GCP → Pub/Sub → create topic (e.g. `play-rtdn`); grant
 *      `google-play-developer-notifications@system.gserviceaccount.com` the Pub/Sub Publisher
 *      role on it.
 *   2. Play Console → app → Monetise → Monetisation setup → Real-time developer
 *      notifications → topic name → "Send test notification" (this endpoint logs it).
 *   3. Pub/Sub → create a *push* subscription on the topic with endpoint
 *      `https://airuncoach.live/api/google/play-notifications?token=<RTDN_SHARED_SECRET>`.
 *      Set the Replit secret `RTDN_SHARED_SECRET` to the same value. Without the secret set,
 *      the endpoint accepts unauthenticated pushes (every notification is only a hint that
 *      triggers a fresh, authenticated Play API lookup, so a forged push can't grant access —
 *      it just costs an API call).
 *
 * No user auth — Pub/Sub doesn't send our Bearer tokens. Response codes matter: 2xx acks the
 * message; anything else makes Pub/Sub redeliver with backoff, which we want only for
 * transient Play API failures.
 */

import { Router, Request, Response } from "express";
import {
  decodeRtdnBody,
  handleRtdnMessage,
  GooglePlayApiError,
  PubSubPushBody,
} from "./google-play-billing";

const router = Router();

router.post("/google/play-notifications", async (req: Request, res: Response) => {
  const expectedSecret = process.env.RTDN_SHARED_SECRET;
  if (expectedSecret && req.query.token !== expectedSecret) {
    console.warn("[Google Play RTDN] Rejected push with missing/invalid ?token=");
    return res.status(403).json({ error: "Forbidden" });
  }

  const body = req.body as PubSubPushBody;
  const notification = decodeRtdnBody(body);
  if (!notification) {
    // Malformed — ack it anyway; redelivery can't fix a bad payload.
    console.warn("[Google Play RTDN] Push without decodable message.data:", JSON.stringify(body).substring(0, 300));
    return res.status(204).end();
  }

  try {
    await handleRtdnMessage(notification);
    return res.status(204).end();
  } catch (err: any) {
    if (err instanceof GooglePlayApiError) {
      // Transient (5xx / rate-limit / auth hiccup) — let Pub/Sub retry.
      console.error(`[Google Play RTDN] Play API error, asking Pub/Sub to retry: ${err.message}`);
      return res.status(503).json({ error: "Play API unavailable" });
    }
    console.error("[Google Play RTDN] Handler error (acked, hourly reconcile will catch up):", err?.message ?? err);
    return res.status(204).end();
  }
});

export default router;
