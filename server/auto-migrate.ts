/**
 * Auto-migrations — run safe ALTER TABLE / CREATE TABLE IF NOT EXISTS statements
 * on every server start.
 *
 * All statements are idempotent (IF NOT EXISTS / DO blocks), so they are safe
 * to run repeatedly without side-effects.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function runAutoMigrations(): Promise<void> {
  console.log("[AutoMigrate] Running schema auto-migrations...");

  const migrations: { name: string; sql: string }[] = [
    // ── session_instructions ─────────────────────────────────────────────────
    // Added after the table was first created; required for AI Coaching Plan generation.
    {
      name: "session_instructions.ai_determined_intensity",
      sql: `ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS ai_determined_intensity TEXT`,
    },
    {
      name: "session_instructions.tone_reasoning",
      sql: `ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS tone_reasoning TEXT`,
    },
    {
      name: "session_instructions.coaching_style",
      sql: `ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS coaching_style JSONB`,
    },
    {
      name: "session_instructions.insight_filters",
      sql: `ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS insight_filters JSONB`,
    },
    {
      name: "session_instructions.generated_at",
      sql: `ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP DEFAULT NOW()`,
    },
    {
      name: "session_instructions.generated_version",
      sql: `ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS generated_version TEXT DEFAULT '1.0'`,
    },
    {
      name: "session_instructions.updated_at",
      sql: `ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    },
    // ── plan_adaptations ─────────────────────────────────────────────────────
    // Ensure index exists for FK-cascade deletes performed during plan deletion.
    {
      name: "idx_plan_adaptations_training_plan",
      sql: `CREATE INDEX IF NOT EXISTS idx_plan_adaptations_training_plan ON plan_adaptations(training_plan_id)`,
    },
  ];

  let succeeded = 0;
  let failed = 0;

  for (const migration of migrations) {
    try {
      await db.execute(sql.raw(migration.sql));
      succeeded++;
    } catch (err: any) {
      // Only log unexpected errors — "column already exists" is swallowed by IF NOT EXISTS
      console.warn(`[AutoMigrate] ⚠️  ${migration.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(
    `[AutoMigrate] Done — ${succeeded} succeeded, ${failed} skipped/failed`
  );
}
