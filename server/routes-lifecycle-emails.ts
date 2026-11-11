/**
 * Lifecycle email endpoints (logic in server/lifecycle-emails.ts).
 *
 *   GET  /api/email/unsubscribe?u=&t=   link in the trial emails → confirmation page
 *   POST /api/email/unsubscribe?u=&t=   one-click unsubscribe (List-Unsubscribe-Post, used by Gmail/Apple Mail)
 *   POST /api/admin/lifecycle-emails/test  { type }  admin only: sends that email to your own address
 */
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "./db";
import { authMiddleware, type AuthenticatedRequest } from "./auth";
import { verifyUnsubscribeToken, unsubscribe, sendLifecyclePreview } from "./lifecycle-emails";

const PREVIEW_TYPES = ["welcome", "trial_7d", "trial_2d", "trial_expired", "trial_limit"] as const;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#0A0A1A;font-family:Arial,sans-serif;color:#e2e8f0;">
<div style="max-width:480px;margin:80px auto;padding:0 16px;text-align:center;">
<h1 style="color:#00E5FF;font-size:22px;">${title}</h1><p style="line-height:1.6;color:#94a3b8;">${body}</p>
</div></body></html>`;
}

export function registerLifecycleEmailRoutes(app: Express): void {
  const handleUnsubscribe = async (req: Request, res: Response, html: boolean) => {
    const userId = String(req.query.u ?? "");
    const token = String(req.query.t ?? "");
    if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
      return html
        ? res.status(400).send(page("Link not valid", "This unsubscribe link isn't valid. Email support@airuncoach.live and we'll sort it out."))
        : res.status(400).json({ error: "Invalid link" });
    }
    try {
      await unsubscribe(userId);
      return html
        ? res.send(page("You're unsubscribed", "You won't get any more trial or upgrade emails from AI Run Coach. Emails about your account, like password resets, still come through."))
        : res.json({ ok: true });
    } catch (err) {
      console.error("[LifecycleEmail] Unsubscribe failed:", err);
      return html
        ? res.status(500).send(page("Something went wrong", "Please try the link again in a minute."))
        : res.status(500).json({ error: "Failed" });
    }
  };
  app.get("/api/email/unsubscribe", (req, res) => handleUnsubscribe(req, res, true));
  app.post("/api/email/unsubscribe", (req, res) => handleUnsubscribe(req, res, false));

  app.post("/api/admin/lifecycle-emails/test", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [u] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
      if (!u?.isAdmin) return res.status(403).json({ error: "Admin access required" });
      const type = req.body?.type;
      if (!PREVIEW_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of ${PREVIEW_TYPES.join(", ")}` });
      }
      await sendLifecyclePreview(
        { id: u.id, email: u.email, name: u.name, timezone: u.timezone ?? null, deviceSource: u.deviceSource ?? null },
        type
      );
      res.json({ ok: true, sentTo: u.email, type });
    } catch (err: any) {
      console.error("[LifecycleEmail] Preview failed:", err);
      res.status(500).json({ error: err?.message ?? "Failed" });
    }
  });
}
