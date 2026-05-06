/**
 * Auto-migrations — run safe ALTER TABLE / CREATE INDEX IF NOT EXISTS statements
 * on every server start.
 *
 * Uses the raw pg pool directly (no Drizzle query builder) so DDL statements
 * work reliably without template-literal wrappers.
 *
 * All statements are idempotent, safe to run repeatedly.
 */

import { pool } from "./db";

export async function runAutoMigrations(): Promise<void> {
  console.log("[AutoMigrate] Running schema auto-migrations...");

  const migrations: { name: string; sql: string }[] = [
    // ── session_instructions ─────────────────────────────────────────────────
    // These columns were added to the schema after the table was first created.
    // Required for AI Coaching Plan generation.
    {
      name: "session_instructions.ai_determined_intensity",
      sql: "ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS ai_determined_intensity TEXT",
    },
    {
      name: "session_instructions.tone_reasoning",
      sql: "ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS tone_reasoning TEXT",
    },
    {
      name: "session_instructions.coaching_style",
      sql: "ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS coaching_style JSONB",
    },
    {
      name: "session_instructions.insight_filters",
      sql: "ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS insight_filters JSONB",
    },
    {
      name: "session_instructions.generated_at",
      sql: "ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP DEFAULT NOW()",
    },
    {
      name: "session_instructions.generated_version",
      sql: "ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS generated_version TEXT DEFAULT '1.0'",
    },
    {
      name: "session_instructions.updated_at",
      sql: "ALTER TABLE session_instructions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
    },
    // ── plan_adaptations index ────────────────────────────────────────────────
    {
      name: "idx_plan_adaptations_training_plan",
      sql: "CREATE INDEX IF NOT EXISTS idx_plan_adaptations_training_plan ON plan_adaptations(training_plan_id)",
    },
    // ── connected_devices ─────────────────────────────────────────────────────
    {
      name: "connected_devices.granted_scopes",
      sql: "ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS granted_scopes TEXT",
    },
    {
      name: "connected_devices.updated_at",
      sql: "ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
    },

    // ── Route Memory Engine ───────────────────────────────────────────────────
    // known_routes: fingerprints of recurring routes per user.
    // Auto-populated after a user runs the same location 2+ times.
    {
      name: "known_routes.create_table",
      sql: `
        CREATE TABLE IF NOT EXISTS known_routes (
          id                   VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id              VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name                 TEXT,
          display_name         TEXT,
          start_lat            REAL NOT NULL,
          start_lng            REAL NOT NULL,
          start_radius_m       REAL DEFAULT 75,
          typical_distance_km  REAL,
          elevation_profile    JSONB,
          notable_segments     JSONB,
          terrain_type         TEXT,
          typical_days_of_week JSONB,
          typical_start_hour   INTEGER,
          typical_start_minute INTEGER,
          run_count            INTEGER NOT NULL DEFAULT 0,
          first_run_at         TIMESTAMP,
          last_run_at          TIMESTAMP,
          constituent_run_ids  JSONB,
          best_time_ms         INTEGER,
          avg_time_ms          INTEGER,
          avg_pace_sec_per_km  REAL,
          split_profiles       JSONB,
          created_at           TIMESTAMP DEFAULT NOW(),
          updated_at           TIMESTAMP DEFAULT NOW()
        )
      `,
    },
    {
      name: "idx_known_routes_user_location",
      sql: "CREATE INDEX IF NOT EXISTS idx_known_routes_user_location ON known_routes(user_id, start_lat, start_lng)",
    },
    // Add Route Memory Engine columns to runs table
    {
      name: "runs.known_route_id",
      sql: "ALTER TABLE runs ADD COLUMN IF NOT EXISTS known_route_id VARCHAR",
    },
    {
      name: "runs.route_confidence",
      sql: "ALTER TABLE runs ADD COLUMN IF NOT EXISTS route_confidence REAL",
    },
  ];

  let succeeded = 0;
  let failed = 0;

  for (const migration of migrations) {
    try {
      await pool.query(migration.sql);
      succeeded++;
    } catch (err: any) {
      console.warn(`[AutoMigrate] ⚠️  ${migration.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(
    `[AutoMigrate] Done — ${succeeded} succeeded, ${failed} skipped/warned`
  );
}
