/**
 * Foreign-key aware cleanup helpers for destructive deletes (runs, users, routes).
 *
 * WHY THIS EXISTS
 * ---------------
 * `storage.deleteRun()` / `storage.deleteUser()` hand-maintain an ordered list of
 * "clear the references, then delete the row" statements. That list drifts: every new
 * table that adds a `user_id` / `run_id` foreign key without `ON DELETE CASCADE` silently
 * breaks deletion for whichever users happen to have rows in it, surfacing at the client
 * as a bare `500 Failed to delete …`.
 *
 * That is exactly how account deletion broke on iOS but not Android:
 * `garmin_pairing_diagnostics.user_id` is written only by the iOS "Pair Garmin Device"
 * flow and had no cleanup entry, so `DELETE FROM users` failed with a 23503
 * foreign-key violation for every iOS user who had ever attempted pairing.
 *
 * So rather than trusting the hand-written list alone, these helpers read the *actual*
 * foreign keys out of `pg_catalog` at runtime and resolve whatever is left over:
 *   - nullable FK column  → `SET NULL` (keep the child row, drop the link)
 *   - NOT NULL FK column  → delete the child rows (its own dependents handled first)
 * Children declared `ON DELETE CASCADE / SET NULL / SET DEFAULT` are left to Postgres.
 *
 * Nothing here replaces the explicit lists — it runs *after* them as a safety net, so the
 * deliberate semantics encoded there (e.g. keeping a feed post but unlinking its run) win,
 * and this only catches tables nobody remembered to add.
 */

import { pool } from "./db";

interface ForeignKeyChild {
  /** Referencing table, e.g. "garmin_pairing_diagnostics" */
  table: string;
  /** Referencing column on that table, e.g. "user_id" */
  column: string;
  /** Referenced column on the parent table, almost always "id" */
  parentColumn: string;
  /** pg_constraint.confdeltype: a=no action, r=restrict, c=cascade, n=set null, d=set default */
  onDelete: string;
  /** Whether the referencing column is NOT NULL (so it can't simply be unlinked) */
  notNull: boolean;
}

/** One statement in a cleanup plan. `sql` takes the same params as the caller's `where`. */
export interface CleanupStatement {
  sql: string;
  description: string;
}

/** Per-process cache — the FK graph only changes on migration, and these are rare calls. */
const childCache = new Map<string, ForeignKeyChild[]>();

/** Double-quote an identifier read from pg_catalog. */
const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/** Depth cap, so a pathological FK graph can't spin forever. */
const MAX_DEPTH = 6;

/**
 * Every foreign key pointing *at* `parentTable`, read from the live catalog.
 * Composite foreign keys are ignored (none reference runs/users/routes today) and logged.
 */
async function foreignKeyChildren(parentTable: string): Promise<ForeignKeyChild[]> {
  const cached = childCache.get(parentTable);
  if (cached) return cached;

  const { rows } = await pool.query(
    `SELECT src.relname                  AS child_table,
            ca.attname                   AS child_column,
            pa.attname                   AS parent_column,
            con.confdeltype              AS on_delete,
            ca.attnotnull                AS not_null,
            array_length(con.conkey, 1)  AS col_count
       FROM pg_constraint con
       JOIN pg_class     src ON src.oid = con.conrelid
       JOIN pg_class     tgt ON tgt.oid = con.confrelid
       JOIN pg_namespace ns  ON ns.oid  = src.relnamespace
       JOIN pg_attribute ca  ON ca.attrelid = con.conrelid  AND ca.attnum = con.conkey[1]
       JOIN pg_attribute pa  ON pa.attrelid = con.confrelid AND pa.attnum = con.confkey[1]
      WHERE con.contype = 'f'
        AND ns.nspname = 'public'
        AND tgt.relname = $1
      ORDER BY src.relname, ca.attname`,
    [parentTable],
  );

  const children: ForeignKeyChild[] = [];
  for (const row of rows) {
    if (Number(row.col_count) !== 1) {
      console.warn(
        `[FKCleanup] Skipping composite foreign key ${row.child_table} → ${parentTable} (not supported)`,
      );
      continue;
    }
    children.push({
      table: row.child_table,
      column: row.child_column,
      parentColumn: row.parent_column,
      onDelete: row.on_delete,
      notNull: row.not_null === true,
    });
  }

  childCache.set(parentTable, children);
  return children;
}

/**
 * Build (but don't run) the statements that resolve every remaining foreign-key reference
 * into the `parentTable` rows matched by `where`.
 *
 * `where` is a raw SQL predicate over `parentTable` using `$1`-style placeholders
 * (e.g. `"id = $1"`). Identifiers come from pg_catalog, never from user input. The plan is
 * derived purely from the FK graph, so it can be inspected/EXPLAINed without touching data.
 * Statements are ordered depth-first: a child's own dependents come before the child.
 */
export async function planSweep(
  parentTable: string,
  where: string,
  stack: string[] = [parentTable],
): Promise<CleanupStatement[]> {
  if (stack.length > MAX_DEPTH) {
    console.warn(`[FKCleanup] Max depth reached at ${parentTable}; stopping sweep`);
    return [];
  }

  const plan: CleanupStatement[] = [];

  for (const fk of await foreignKeyChildren(parentTable)) {
    // Postgres already handles these on delete.
    if (fk.onDelete !== "a" && fk.onDelete !== "r") continue;
    // Self-references and cycles: the parent delete removes them anyway.
    if (stack.includes(fk.table)) continue;

    const childWhere =
      `${q(fk.column)} IN (SELECT ${q(fk.parentColumn)} FROM ${q(parentTable)} WHERE ${where})`;

    if (fk.notNull) {
      // Can't unlink — the child rows only make sense alongside the parent.
      plan.push(...(await planSweep(fk.table, childWhere, [...stack, fk.table])));
      plan.push({
        sql: `DELETE FROM ${q(fk.table)} WHERE ${childWhere}`,
        description: `delete ${fk.table} rows via ${fk.column}`,
      });
    } else {
      plan.push({
        sql: `UPDATE ${q(fk.table)} SET ${q(fk.column)} = NULL WHERE ${childWhere}`,
        description: `unlink ${fk.table}.${fk.column}`,
      });
    }
  }

  return plan;
}

/**
 * Resolve every remaining foreign-key reference into the `parentTable` rows matched by
 * `where`, so those rows can then be deleted without tripping a 23503.
 *
 * Best-effort by design: this runs *after* the explicit cleanup list, so a failure here is
 * logged rather than thrown — the subsequent DELETE is what reports a real problem.
 */
export async function sweepDependents(
  parentTable: string,
  where: string,
  params: any[],
): Promise<void> {
  let plan: CleanupStatement[];
  try {
    plan = await planSweep(parentTable, where);
  } catch (e: any) {
    console.error(`[FKCleanup] Could not plan sweep for ${parentTable}:`, e.message);
    return;
  }

  for (const step of plan) {
    try {
      const res = await pool.query(step.sql, params);
      if (res.rowCount) {
        console.log(`[FKCleanup] ${step.description}: ${res.rowCount} row(s)`);
      }
    } catch (e: any) {
      console.error(`[FKCleanup] Failed to ${step.description}:`, e.message);
    }
  }
}

/**
 * Build the statement that deletes rows from `table` only where nothing still points at them.
 */
export async function planDeleteIfUnreferenced(
  table: string,
  where: string,
): Promise<CleanupStatement> {
  const children = (await foreignKeyChildren(table)).filter(
    (fk) => fk.onDelete === "a" || fk.onDelete === "r",
  );

  const guards = children.map(
    (fk, i) =>
      `NOT EXISTS (SELECT 1 FROM ${q(fk.table)} AS _c${i} ` +
      `WHERE _c${i}.${q(fk.column)} = _t.${q(fk.parentColumn)})`,
  );

  return {
    sql:
      `DELETE FROM ${q(table)} AS _t WHERE (${where})` +
      (guards.length ? ` AND ${guards.join(" AND ")}` : ""),
    description: `delete unreferenced ${table} rows`,
  };
}

/**
 * Delete rows from `table` only where nothing still points at them.
 *
 * Used for `routes`: a route derived from a run is worth removing with that run, but the
 * same route row can be shared by other runs, live sessions or a public `events` entry —
 * deleting it out from under those would either fail on the FK or destroy someone else's
 * data. Rows that are still referenced are simply left behind.
 */
export async function deleteRowsIfUnreferenced(
  table: string,
  where: string,
  params: any[],
): Promise<number> {
  const step = await planDeleteIfUnreferenced(table, where);
  const res = await pool.query(step.sql, params);
  if (res.rowCount) {
    console.log(`[FKCleanup] Deleted ${res.rowCount} unreferenced row(s) from ${table}`);
  }
  return res.rowCount ?? 0;
}
