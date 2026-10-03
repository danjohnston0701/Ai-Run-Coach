/**
 * User activity log — one row per key user action, with whether it worked, so we can see what
 * people are doing and spot actions that are failing for them.
 *
 *   user_activity(created_at, user_id, user_email, action, outcome, error_message, http_status,
 *                 platform, app_version, details)
 *
 * Two sources:
 *  1. Server-side actions are logged automatically by `userActivityMiddleware` — each tracked
 *     API route (RULES below) is matched on the way in and logged when its response finishes:
 *     outcome "success" for 2xx/3xx replies without `success:false`, otherwise "error" with the
 *     reply's error text. Nothing in the route handlers needs to know about it.
 *  2. Actions that only happen in the apps (preparing / starting a run, making the share video)
 *     are reported with POST /api/user-activity — only the CLIENT_ACTIONS names are accepted.
 *
 * Logging is fire-and-forget: a failed insert is printed and never affects the request.
 * The table is created by auto-migrate.ts (user_activity.create_table).
 */
import type { Express, NextFunction, Request, Response } from "express";
import { pool } from "./db";
import { authMiddleware, verifyToken, type AuthenticatedRequest } from "./auth";

export type ActivityOutcome = "success" | "error";

export interface ActivityEntry {
  userId?: string | null;
  email?: string | null;
  action: string;
  outcome: ActivityOutcome;
  errorMessage?: string | null;
  httpStatus?: number | null;
  platform?: string | null;
  appVersion?: string | null;
  details?: Record<string, unknown> | null;
}

export function logUserActivity(e: ActivityEntry): void {
  pool
    .query(
      `INSERT INTO user_activity
         (user_id, user_email, action, outcome, error_message, http_status, platform, app_version, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        e.userId ?? null,
        e.email ? String(e.email).trim().toLowerCase() : null,
        e.action,
        e.outcome,
        e.errorMessage ? String(e.errorMessage).slice(0, 1000) : null,
        e.httpStatus ?? null,
        e.platform ?? null,
        e.appVersion ?? null,
        e.details ? JSON.stringify(e.details) : null,
      ],
    )
    .catch((err) => console.warn("[UserActivity] insert failed:", err?.message || err));
}

/** "android" | "ios" | "web" | "watch" | null — from the apps' X-App-Platform header, else the user agent. */
export function clientPlatform(req: Request): string | null {
  const h = String(req.header("x-app-platform") || "").toLowerCase();
  if (h) return h.slice(0, 20);
  const bodyPlatform = req.body?.platform; // sign-in / sign-up send which app they came from
  if (bodyPlatform === "ios" || bodyPlatform === "android") return bodyPlatform;
  const ua = String(req.header("user-agent") || "");
  if (/okhttp/i.test(ua)) return "android";
  if (/CFNetwork|Darwin/i.test(ua)) return "ios";
  if (/Mozilla/i.test(ua)) return "web";
  return null;
}

function clientVersion(req: Request): string | null {
  const v = req.header("x-app-version");
  return v ? String(v).slice(0, 40) : null;
}

// ── Server-side actions ─────────────────────────────────────────────────────────────────────

type Rule = {
  method: string;
  path: string; // express-style, e.g. /api/group-runs/:id/respond
  action: string | ((req: Request) => string | null);
};

/**
 * Tracked routes. Deliberately leaves out high-frequency traffic (live coaching cues, watch data
 * streaming, TTS, the per-launch subscription check) — this is for key user actions, not a
 * request log.
 */
const RULES: Rule[] = [
  // Account
  { method: "POST", path: "/api/auth/register", action: "New user registration" },
  { method: "POST", path: "/api/auth/login", action: "User logged in" },
  { method: "POST", path: "/api/auth/forgot-password", action: "Reset password request" },
  { method: "POST", path: "/api/auth/reset-password", action: "Reset password" },
  { method: "POST", path: "/api/auth/change-password", action: "Changed password" },
  { method: "POST", path: "/api/auth/verify-email", action: "Verified email" },
  { method: "POST", path: "/api/auth/resend-verification", action: "Resent verification email" },
  { method: "POST", path: "/api/user/onboarding-complete", action: "Completed onboarding" },
  { method: "PUT", path: "/api/users/:id", action: "Updated profile" },
  { method: "PUT", path: "/api/users/:id/coach-settings", action: "Updated coach settings" },
  { method: "POST", path: "/api/users/:id/profile-picture", action: "Updated profile picture" },
  { method: "DELETE", path: "/api/users/:id", action: "Deleted account" },
  { method: "POST", path: "/api/user/injuries", action: "Added injury" },
  { method: "POST", path: "/api/support/contact", action: "Contacted support" },
  { method: "POST", path: "/api/promo-codes/redeem", action: "Redeemed promo code" },

  // AI plans
  { method: "POST", path: "/api/training-plans/generate", action: "Generated AI plan" },
  { method: "PUT", path: "/api/training-plans/:planId/regenerate", action: "Regenerated AI plan" },
  { method: "POST", path: "/api/training-plans/:planId/next-block", action: "Generated next AI plan block" },
  { method: "POST", path: "/api/training-plans/:planId/adapt", action: "Adapted AI plan" },
  { method: "POST", path: "/api/training-plans/:planId/reassess", action: "Reassessed AI plan" },
  { method: "DELETE", path: "/api/training-plans/:planId", action: "Deleted AI plan" },
  { method: "POST", path: "/api/workouts/:workoutId/prepare-coaching", action: "Prepared plan workout coaching" },
  { method: "PUT", path: "/api/training-plans/workouts/:workoutId/skip", action: "Skipped plan workout" },

  // Runs
  { method: "POST", path: "/api/runs", action: "Finished run session" },
  { method: "DELETE", path: "/api/runs/:id", action: "Deleted run" },
  { method: "POST", path: "/api/runs/:id/ai-insights", action: "Generated AI run insights" },
  { method: "POST", path: "/api/runs/:id/comprehensive-analysis", action: "Generated AI run insights" },
  { method: "POST", path: "/api/runs/:id/end-trim/apply", action: "Trimmed run end" },
  { method: "POST", path: "/api/runs/:runId/publish-strava", action: "Published run to Strava" },
  { method: "POST", path: "/api/coaching/talk-to-coach", action: "Talked to coach" },
  { method: "POST", path: "/api/garmin-companion/session/start", action: "Started watch session" },
  { method: "POST", path: "/api/garmin-companion/session/:sessionId/upload-batch", action: "Uploaded watch-only run" },

  // Routes
  { method: "POST", path: "/api/routes/generate-intelligent", action: "Generated run routes" },
  { method: "POST", path: "/api/routes/generate-options", action: "Generated run routes" },
  { method: "POST", path: "/api/routes/generate-ai", action: "Generated run routes" },
  { method: "POST", path: "/api/routes/generate-template", action: "Generated run routes" },
  { method: "POST", path: "/api/routes", action: "Saved route" },

  // Sharing
  { method: "POST", path: "/api/share/generate", action: "Generated share image" },
  { method: "POST", path: "/api/runs/:id/share-link", action: "Created run share link" },

  // Friends
  { method: "POST", path: "/api/friend-requests", action: "Sent friend request" },
  { method: "POST", path: "/api/friend-requests/:id/accept", action: "Accepted friend request" },
  { method: "POST", path: "/api/friend-requests/:id/decline", action: "Declined friend request" },
  { method: "POST", path: "/api/friend-requests/:id/withdraw", action: "Withdrew friend request" },
  { method: "DELETE", path: "/api/friends/:userId/:friendId", action: "Removed friend" },

  // Group runs
  { method: "POST", path: "/api/group-runs", action: "Created group run" },
  { method: "PUT", path: "/api/group-runs/:id", action: "Updated group run" },
  { method: "POST", path: "/api/group-runs/:id/invite", action: "Invited friends to group run" },
  {
    method: "POST",
    path: "/api/group-runs/:id/respond",
    action: (req) =>
      req.body?.response === "declined" ? "Declined group run invite" : "Accepted group run invite",
  },
  { method: "POST", path: "/api/group-runs/:id/join", action: "Joined group run" },
  { method: "POST", path: "/api/group-runs/:groupRunId/ready", action: "Prepared group run" },
  { method: "POST", path: "/api/group-runs/:groupRunId/start", action: "Initiated group run" },
  { method: "POST", path: "/api/group-runs/:groupRunId/complete", action: "Completed group run" },
  { method: "DELETE", path: "/api/group-runs/:groupRunId/leave", action: "Left group run" },
  { method: "DELETE", path: "/api/group-runs/:groupRunId", action: "Deleted group run" },

  // Live tracking
  { method: "POST", path: "/api/live-sessions/:sessionId/invite-observer", action: "Invited live-tracking observer" },

  // Goals
  { method: "POST", path: "/api/goals", action: "Created goal" },
  { method: "PUT", path: "/api/goals/:id", action: "Updated goal" },
  { method: "DELETE", path: "/api/goals/:id", action: "Deleted goal" },

  // Devices and integrations
  { method: "POST", path: "/api/garmin-companion/pairing/confirm", action: "Paired Garmin watch with code" },
  { method: "POST", path: "/api/connected-devices", action: "Connected device" },
  { method: "DELETE", path: "/api/connected-devices/:deviceId", action: "Removed connected device" },
  { method: "POST", path: "/api/garmin/disconnect", action: "Disconnected Garmin" },
  { method: "POST", path: "/api/strava/auth/authorize", action: "Connected Strava" },
  { method: "POST", path: "/api/strava/disconnect", action: "Disconnected Strava" },
  { method: "POST", path: "/api/strava/import-history", action: "Imported Strava history" },
];

const COMPILED = RULES.map((r) => ({
  ...r,
  re: new RegExp("^" + r.path.replace(/:[A-Za-z_]+/g, "[^/]+") + "/?$"),
}));

function matchRule(method: string, path: string) {
  return COMPILED.find((r) => r.method === method && r.re.test(path));
}

/** The reply's error text, or null when the reply reads as a success. */
function replyError(status: number, body: any): string | null {
  const text = typeof body?.error === "string" ? body.error
    : typeof body?.message === "string" ? body.message
    : null;
  if (status >= 400) return text || `HTTP ${status}`;
  if (body && body.success === false) return text || "success: false";
  return null;
}

/**
 * Logs every RULES route when its response finishes. Mount before the routes; reads
 * req.user (set later by authMiddleware) at finish time, and the reply body via res.json.
 */
export function userActivityMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = req.originalUrl.split("?")[0];
  const rule = matchRule(req.method, path);
  if (!rule) return next();

  let body: any;
  const json = res.json.bind(res);
  res.json = ((payload: any) => {
    body = payload;
    return json(payload);
  }) as Response["json"];

  res.on("finish", () => {
    try {
      const action = typeof rule.action === "function" ? rule.action(req) : rule.action;
      if (!action) return;
      const user = (req as AuthenticatedRequest).user;
      // Sign-in/sign-up replies carry the user; failed ones still have the email that was tried.
      // A request without a session (e.g. reset password from the email link) may still send one.
      let userId = user?.userId ?? body?.user?.id ?? null;
      let email = user?.email ?? body?.user?.email ?? (typeof req.body?.email === "string" ? req.body.email : null);
      if (!userId) {
        const auth = req.header("authorization");
        const payload = auth?.startsWith("Bearer ") ? verifyToken(auth.slice(7)) : null;
        if (payload) { userId = payload.userId; email = email ?? payload.email; }
      }
      const err = replyError(res.statusCode, body);
      logUserActivity({
        userId,
        email,
        action,
        outcome: err ? "error" : "success",
        errorMessage: err,
        httpStatus: res.statusCode,
        platform: clientPlatform(req),
        appVersion: clientVersion(req),
        details: { method: req.method, path },
      });
    } catch (e: any) {
      console.warn("[UserActivity] middleware:", e?.message || e);
    }
  });
  next();
}

// ── App-reported actions ────────────────────────────────────────────────────────────────────

/** Actions the apps report themselves (they never reach a server route of their own). */
export const CLIENT_ACTIONS = new Set([
  "Prepared run without route",
  "Prepared run with route",
  "Prepared run for watch",
  "Started run without route",
  "Started run with route",
  "Generated share video",
]);

export function registerUserActivityRoutes(app: Express) {
  /**
   * POST /api/user-activity
   *   { action: one of CLIENT_ACTIONS, outcome?: "success" | "error", error?: string, details?: object }
   */
  app.post("/api/user-activity", authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const { action, outcome, error, details } = req.body ?? {};
    if (typeof action !== "string" || !CLIENT_ACTIONS.has(action)) {
      return res.status(400).json({ error: "Unknown action" });
    }
    const isError = outcome === "error";
    logUserActivity({
      userId: req.user!.userId,
      email: req.user!.email,
      action,
      outcome: isError ? "error" : "success",
      errorMessage: isError ? (typeof error === "string" ? error : "error") : null,
      platform: (details && typeof details.platform === "string" ? details.platform : null) ?? clientPlatform(req),
      appVersion: clientVersion(req),
      details: details && typeof details === "object" ? { ...details, source: "app" } : { source: "app" },
    });
    res.json({ ok: true });
  });
}
