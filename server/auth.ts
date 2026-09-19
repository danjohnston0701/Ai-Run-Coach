import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-secret-key-change-in-production";
const JWT_EXPIRES_IN = "30d";

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  
  req.user = payload;
  next();
}

export function optionalAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  
  next();
}


/**
 * Requires a signed-in user whose account is currently entitled to AI features: not an
 * expired free trial and not a lapsed paid subscription (both stores' lifecycle handlers
 * write tier NULL + status expired/refunded). Used on the in-run coaching and legacy AI
 * endpoints, which previously had no auth at all — a lapsed subscriber's client kept getting
 * OpenAI/Polly coaching, and the endpoints could be driven by anyone with a userId.
 * Responds 402 with a `code` the clients already understand from checkAndEnforceLimit.
 * Also pins req.body.userId to the token's user so one account can't coach as another.
 */
export async function requireEntitledUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const payload = verifyToken(authHeader.substring(7));
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.user = payload;
  try {
    const { storage } = await import("./storage");
    const { effectiveTier } = await import("./usage-service");
    const user = await storage.getUser(payload.userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    const status = (user.subscriptionStatus ?? "").toLowerCase().trim();
    const tier = (user.subscriptionTier ?? "").toLowerCase().trim();
    if ((tier === "" || tier === "free" || tier === "null") && ["expired", "refunded"].includes(status)) {
      return res.status(402).json({ error: "Your subscription has expired. Renew to continue using AI coaching.", code: "subscription_expired" });
    }
    if (effectiveTier(user.subscriptionTier, user.trialExpiresAt, user.createdAt) === "trial_expired") {
      return res.status(402).json({ error: "Your free trial has ended. Upgrade to continue using AI coaching.", code: "trial_expired", status: "trial_expired" });
    }
    if (req.body && typeof req.body === "object") {
      const bodyUser = req.body.userId ?? req.body.user_id;
      if (bodyUser && bodyUser !== payload.userId) {
        return res.status(403).json({ error: "userId does not match the signed-in user" });
      }
      req.body.userId = payload.userId;
    }
    next();
  } catch (error) {
    console.error("[requireEntitledUser] error:", error);
    res.status(500).json({ error: "Entitlement check failed" });
  }
}
