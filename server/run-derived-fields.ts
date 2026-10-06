/**
 * Fills run summary columns that the recording client left NULL — see utils/run-derivation.ts
 * for the rules. Same shape as run-weather.ts:
 *
 *   fillDerivedRunFields(insert) — storage.createRun, before the INSERT
 *   ensureRunDerivedFields(runId) — one run, after the fact (merges, server-created runs)
 *   backfillRunDerivedFields(limit) — hourly sweep in scheduler.ts; also repairs history
 *
 * The sweep keys off `recording_source IS NULL` (always set once a run has been through here),
 * plus series columns still stored as a JSON *string* — iOS sent every time series that way and
 * the POST /api/runs extraction dropped them (heart_rate_data / cadence_data / altitude_data …
 * were NULL on every iOS run) or stored them as an unreadable jsonb string (pace_data).
 */
import { eq, isNull, or, sql } from "drizzle-orm";
import { plannedWorkouts, runs, users } from "@shared/schema";
import { db, pool } from "./db";
import { deriveRunFields, parseSeriesValue, parseWeightKg, RUN_SERIES_FIELDS, type DerivationContext } from "./utils/run-derivation";

async function contextFor(userId: string | null | undefined, linkedWorkoutId: string | null | undefined): Promise<DerivationContext> {
  const ctx: DerivationContext = {};
  if (userId) {
    const [u] = await db.select({ timezone: users.timezone, weight: users.weight, height: users.height, weightUnitConfirmed: users.weightUnitConfirmed }).from(users).where(eq(users.id, userId)).limit(1);
    ctx.timezone = u?.timezone ?? null;
    ctx.weightKg = parseWeightKg(u?.weight, u?.height, u?.weightUnitConfirmed);
  }
  if (linkedWorkoutId) {
    const [w] = await db.select({ workoutType: plannedWorkouts.workoutType }).from(plannedWorkouts)
      .where(eq(plannedWorkouts.id, linkedWorkoutId)).limit(1);
    ctx.plannedWorkoutType = w?.workoutType ?? null;
  }
  return ctx;
}

/** Mutates an insert payload in place with derived values for its NULL columns. Never throws. */
export async function fillDerivedRunFields(insert: Record<string, any>): Promise<Record<string, any> | null> {
  try {
    for (const f of RUN_SERIES_FIELDS) {
      if (typeof insert[f] === "string") insert[f] = parseSeriesValue(insert[f]);
    }
    const ctx = await contextFor(insert.userId, insert.linkedWorkoutId);
    const { patch, legacy } = deriveRunFields(insert, ctx);
    Object.assign(insert, patch);
    return legacy;
  } catch (err: any) {
    console.warn(`[RunDerived] derive on insert failed (run saved without): ${err?.message ?? err}`);
    return null;
  }
}

// ── Legacy columns ────────────────────────────────────────────────────────────
// runs.start_time / end_time / max_incline_percent / max_incline_degrees exist in the
// production table from an early schema but were never in shared/schema.ts. Their exact SQL
// types aren't recorded anywhere in the repo, so read them once and convert to match.

let legacyTypes: Promise<Map<string, string>> | null = null;
function legacyColumnTypes(): Promise<Map<string, string>> {
  if (legacyTypes) return legacyTypes;
  const pending: Promise<Map<string, string>> = pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'runs' AND column_name = ANY($1)`,
    [["start_time", "end_time", "max_incline_percent", "max_incline_degrees"]],
  ).then((r: { rows: any[] }) => new Map<string, string>(r.rows.map((row) => [row.column_name, String(row.data_type)])))
    .catch((err: unknown) => { legacyTypes = null; throw err; });
  legacyTypes = pending;
  return pending;
}

function toColumnValue(value: unknown, type: string): unknown {
  if (value == null) return null;
  if (value instanceof Date) {
    if (type.startsWith("timestamp") || type === "date") return value;
    if (type === "bigint" || type === "numeric") return value.getTime();
    if (type === "integer") return Math.round(value.getTime() / 1000);
    if (type === "text" || type.startsWith("character")) return value.toISOString();
    return undefined;
  }
  if (typeof value === "number") {
    if (type === "integer" || type === "bigint" || type === "smallint") return Math.round(value);
    if (type === "real" || type === "double precision" || type === "numeric") return value;
    if (type === "text" || type.startsWith("character")) return String(value);
  }
  return undefined;
}

/** Writes the legacy columns that are still NULL. Never throws. */
export async function writeLegacyRunColumns(runId: string, legacy: Record<string, any> | null): Promise<void> {
  if (!legacy) return;
  try {
    const types = await legacyColumnTypes();
    const sets: string[] = [];
    const params: unknown[] = [runId];
    for (const [col, value] of Object.entries(legacy)) {
      const type = types.get(col);
      const v = type ? toColumnValue(value, type) : undefined;
      if (v == null) continue;
      params.push(v);
      sets.push(`${col} = COALESCE(${col}, $${params.length})`);
    }
    if (sets.length > 0) await pool.query(`UPDATE runs SET ${sets.join(", ")} WHERE id = $1`, params);
  } catch (err: any) {
    console.warn(`[RunDerived] ${runId}: legacy columns not written: ${err?.message ?? err}`);
  }
}

/** Derives and writes every still-NULL column for one existing run. Returns true if anything changed. */
export async function ensureRunDerivedFields(runId: string): Promise<boolean> {
  try {
    const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    if (!run) return false;
    const current: Record<string, any> = { ...run };
    const repaired: Record<string, any> = {};
    for (const f of RUN_SERIES_FIELDS) {
      const v = (run as any)[f];
      if (typeof v === "string") {
        const parsed = parseSeriesValue(v);
        repaired[f] = Array.isArray(parsed) ? parsed : null; // an unparseable string is no series
        current[f] = repaired[f];
      }
    }
    const ctx = await contextFor(run.userId, run.linkedWorkoutId);
    const { patch, legacy } = deriveRunFields(current, ctx);
    const update = { ...repaired, ...patch };
    let changed = false;
    if (Object.keys(update).length > 0) {
      const u = await db.update(runs).set(update).where(eq(runs.id, runId)).returning({ id: runs.id });
      changed = u.length > 0;
    }
    await writeLegacyRunColumns(runId, legacy);
    return changed;
  } catch (err: any) {
    console.warn(`[RunDerived] ${runId}: ${err?.message ?? err}`);
    return false;
  }
}

/** Processes up to `limit` runs that haven't been through derivation yet (newest first). */
export async function backfillRunDerivedFields(limit = 300): Promise<{ checked: number; filled: number }> {
  const stringSeries = RUN_SERIES_FIELDS.map((f) => sql`jsonb_typeof(${(runs as any)[f]}) = 'string'`);
  const rows = await db.select({ id: runs.id }).from(runs)
    .where(or(isNull(runs.recordingSource), ...stringSeries))
    .orderBy(sql`${runs.completedAt} desc nulls last`)
    .limit(limit);
  let filled = 0;
  for (const r of rows) {
    if (await ensureRunDerivedFields(r.id)) filled++;
  }
  return { checked: rows.length, filled };
}
