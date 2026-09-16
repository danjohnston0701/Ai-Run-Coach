import type { User } from "@shared/schema";

/**
 * Canonical walk/run preference as stored: `users.default_session_type` = "run" | "walk"
 * (Android historically writes "Run"/"Walk" — every reader lowercases).
 */
export function normalizeSessionType(value: unknown): "run" | "walk" | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "walk" || v === "walking") return "walk";
  if (v === "run" || v === "running") return "run";
  return null;
}

/**
 * Shape a user row for a client response: strips the password hash and adds the
 * `defaultActivityMode` ("RUN" | "WALK") alias of `defaultSessionType`.
 *
 * iOS builds up to and including the 2026-09 release read/write the preference ONLY as
 * `defaultActivityMode` — a field the server never knew about — so their Walk selection was
 * silently dropped on write and always read back as nil (→ "RUN"). Emitting the alias here is
 * what lets those already-installed builds see the real value without an App Store update.
 */
export function toClientUser<T extends Partial<User> & { password?: string | null }>(user: T) {
  const { password: _password, ...rest } = user;
  const sessionType = normalizeSessionType(rest.defaultSessionType) ?? "run";
  return {
    ...rest,
    defaultActivityMode: sessionType === "walk" ? "WALK" : "RUN",
  };
}
