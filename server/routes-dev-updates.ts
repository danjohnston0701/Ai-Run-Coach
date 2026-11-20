// Development updates & asks — /admin/dev-updates on the web app.
//
// A feed between the developer (Daniel) and the coding agents working on the project:
//   question      — something only Daniel can decide; he answers on the page
//   test_request  — a test to run on a real device/watch; he records the result as the answer
//   change        — a change that was made (what, why, screenshots)
//   review        — a code review that was done and what came of it
//   ux_test       — user-experience testing done on a simulator, with screenshots
//
// Reading and answering: admin users only (JWT, users.is_admin). Posting: an admin JWT, or the
// X-Dev-Updates-Key header matching the DEV_UPDATES_API_KEY secret (how agents post — they have
// no admin login). Unset secret = key posting is off. Raw SQL, not in the Drizzle schema; tables
// are created by auto-migrate.ts. Images are stored in the DB (bytea) — keep them small (the
// poster tool downsizes screenshots to ~1000 px JPEG).

import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { pool, db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { verifyToken } from "./auth";

export const DEV_UPDATE_KINDS = ["question", "test_request", "change", "review", "ux_test"] as const;
const STATUSES = ["open", "answered", "done"] as const;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function keyMatches(req: Request): boolean {
  const secret = process.env.DEV_UPDATES_API_KEY;
  const given = req.header("x-dev-updates-key");
  if (!secret || !given) return false;
  const a = Buffer.from(secret), b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  try {
    const payload: any = verifyToken(auth.slice(7));
    const userId = payload?.userId;
    if (!userId) return false;
    const [u] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    return !!u?.isAdmin;
  } catch {
    return false;
  }
}

/** Admin JWT, or (when allowKey) the agents' posting key. */
function guard(allowKey: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (allowKey && keyMatches(req)) return next();
    if (await isAdminRequest(req)) return next();
    res.status(403).json({ error: "Admin access required" });
  };
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export function registerDevUpdatesRoutes(app: Express): void {
  /** GET /api/dev-updates — every entry, newest first, with its images' ids and captions (no data). */
  app.get("/api/dev-updates", guard(true), async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT u.*, COALESCE(
          (SELECT json_agg(json_build_object('id', i.id, 'caption', i.caption) ORDER BY i.position, i.created_at)
             FROM dev_update_images i WHERE i.update_id = u.id), '[]') AS images
        FROM dev_updates u ORDER BY u.created_at DESC LIMIT 500`);
      res.json(rows.map((r: any) => ({
        id: r.id, kind: r.kind, title: r.title, body: r.body, platforms: r.platforms ?? [],
        status: r.status, answer: r.answer, answeredAt: r.answered_at, author: r.author,
        createdAt: r.created_at, updatedAt: r.updated_at, images: r.images,
      })));
    } catch (err) {
      console.error("[DevUpdates] list failed:", err);
      res.status(500).json({ error: "Failed to load updates" });
    }
  });

  /** POST /api/dev-updates — { kind, title, body, platforms?, status?, author? } → { id }. */
  app.post("/api/dev-updates", guard(true), async (req, res) => {
    try {
      const b = req.body ?? {};
      const kind = DEV_UPDATE_KINDS.includes(b.kind) ? b.kind : null;
      const title = str(b.title, 300);
      if (!kind || !title) return res.status(400).json({ error: `kind (${DEV_UPDATE_KINDS.join(" | ")}) and title are required` });
      const status = STATUSES.includes(b.status) ? b.status : (kind === "question" || kind === "test_request" ? "open" : "done");
      const platforms = Array.isArray(b.platforms) ? b.platforms.filter((p: unknown) => typeof p === "string").slice(0, 10) : [];
      const { rows } = await pool.query(
        `INSERT INTO dev_updates (kind, title, body, platforms, status, author) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [kind, title, str(b.body, 50_000) ?? "", platforms, status, str(b.author, 100) ?? "Claude"],
      );
      res.status(201).json({ id: rows[0].id });
    } catch (err) {
      console.error("[DevUpdates] create failed:", err);
      res.status(500).json({ error: "Failed to create update" });
    }
  });

  /** POST /api/dev-updates/:id/images — { caption?, contentType, dataBase64, position? } → { id }. One image per call. */
  app.post("/api/dev-updates/:id/images", guard(true), async (req, res) => {
    try {
      const b = req.body ?? {};
      if (!IMAGE_TYPES.includes(b.contentType)) return res.status(400).json({ error: `contentType must be one of ${IMAGE_TYPES.join(", ")}` });
      const data = typeof b.dataBase64 === "string" ? Buffer.from(b.dataBase64, "base64") : null;
      if (!data?.length) return res.status(400).json({ error: "dataBase64 is required" });
      if (data.length > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Image over 3 MB — downsize it first" });
      const { rows } = await pool.query(
        `INSERT INTO dev_update_images (update_id, position, caption, content_type, data)
         SELECT id, $2, $3, $4, $5 FROM dev_updates WHERE id = $1 RETURNING id`,
        [req.params.id, Number.isInteger(b.position) ? b.position : 0, str(b.caption, 500), b.contentType, data],
      );
      if (!rows.length) return res.status(404).json({ error: "Update not found" });
      res.status(201).json({ id: rows[0].id });
    } catch (err) {
      console.error("[DevUpdates] image upload failed:", err);
      res.status(500).json({ error: "Failed to save image" });
    }
  });

  /** GET /api/dev-updates/images/:imageId — the image bytes (the page fetches it with the JWT). */
  app.get("/api/dev-updates/images/:imageId", guard(true), async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT content_type, data FROM dev_update_images WHERE id = $1`, [req.params.imageId]);
      if (!rows.length) return res.status(404).end();
      res.setHeader("Content-Type", rows[0].content_type);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(rows[0].data);
    } catch (err) {
      console.error("[DevUpdates] image read failed:", err);
      res.status(500).end();
    }
  });

  /**
   * PATCH /api/dev-updates/:id — Daniel's answer / test result and status: { answer?, status? }.
   * Admin only (the posting key can't answer its own questions). An answer without a status
   * marks the entry answered.
   */
  app.patch("/api/dev-updates/:id", guard(false), async (req, res) => {
    try {
      const b = req.body ?? {};
      const answer = typeof b.answer === "string" ? b.answer.trim().slice(0, 20_000) : undefined;
      const status = STATUSES.includes(b.status) ? b.status : (answer ? "answered" : undefined);
      const { rows } = await pool.query(
        `UPDATE dev_updates SET
           answer = COALESCE($2, answer),
           answered_at = CASE WHEN $2::text IS NOT NULL THEN NOW() ELSE answered_at END,
           status = COALESCE($3, status),
           updated_at = NOW()
         WHERE id = $1 RETURNING id, status, answer, answered_at`,
        [req.params.id, answer ?? null, status ?? null],
      );
      if (!rows.length) return res.status(404).json({ error: "Update not found" });
      res.json({ id: rows[0].id, status: rows[0].status, answer: rows[0].answer, answeredAt: rows[0].answered_at });
    } catch (err) {
      console.error("[DevUpdates] update failed:", err);
      res.status(500).json({ error: "Failed to save" });
    }
  });
}
