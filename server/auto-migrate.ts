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

    // ── Group Runs ────────────────────────────────────────────────────────────
    {
      name: "group_runs.create_table",
      sql: `
        CREATE TABLE IF NOT EXISTS group_runs (
          id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name              TEXT NOT NULL,
          description       TEXT NOT NULL DEFAULT '',
          creator_id        VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          meeting_point     TEXT,
          meeting_lat       REAL,
          meeting_lng       REAL,
          distance          REAL NOT NULL DEFAULT 5.0,
          date_time         TIMESTAMP NOT NULL,
          max_participants  INTEGER DEFAULT 10,
          is_public         BOOLEAN NOT NULL DEFAULT TRUE,
          status            TEXT NOT NULL DEFAULT 'upcoming',
          invite_token      TEXT UNIQUE DEFAULT gen_random_uuid()::text,
          created_at        TIMESTAMP DEFAULT NOW(),
          updated_at        TIMESTAMP DEFAULT NOW()
        )
      `,
    },
    {
      name: "group_run_participants.create_table",
      sql: `
        CREATE TABLE IF NOT EXISTS group_run_participants (
          id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          group_run_id        VARCHAR NOT NULL REFERENCES group_runs(id) ON DELETE CASCADE,
          user_id             VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role                TEXT NOT NULL DEFAULT 'participant',
          invitation_status   TEXT NOT NULL DEFAULT 'accepted',
          ready_to_start      BOOLEAN NOT NULL DEFAULT FALSE,
          run_id              VARCHAR REFERENCES runs(id),
          joined_at           TIMESTAMP DEFAULT NOW()
        )
      `,
    },
    {
      name: "idx_group_run_participants_group_run",
      sql: "CREATE INDEX IF NOT EXISTS idx_group_run_participants_group_run ON group_run_participants(group_run_id)",
    },
    {
      name: "idx_group_run_participants_user",
      sql: "CREATE INDEX IF NOT EXISTS idx_group_run_participants_user ON group_run_participants(user_id)",
    },

    // ── users.default_session_type ────────────────────────────────────────────
    // Added to allow users to set a preferred activity type (run/walk/interval).
    // Column was added to shared/schema.ts but DB migration was not applied.
    {
      name: "users.default_session_type",
      sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS default_session_type TEXT DEFAULT 'run'",
    },

    // ── user_stats — PB, achievement, and AI profile columns ─────────────────
    // These columns were added to shared/schema.ts after the table was first
    // created.  Without these ALTER TABLEs the server throws PG error 42703
    // ("column does not exist") whenever Drizzle generates an explicit SELECT
    // or INSERT that references them — which happens after every run save
    // (refreshRunnerProfile, recomputeForUser).
    {
      name: "user_stats.pb_20k_duration_ms",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS pb_20k_duration_ms INTEGER",
    },
    {
      name: "user_stats.pb_20k_run_id",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS pb_20k_run_id VARCHAR",
    },
    {
      name: "user_stats.pb_20k_date",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS pb_20k_date TIMESTAMP",
    },
    {
      name: "user_stats.longest_run_time_sec",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS longest_run_time_sec INTEGER",
    },
    {
      name: "user_stats.highest_elevation_m",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS highest_elevation_m REAL",
    },
    {
      name: "user_stats.most_consecutive_runs",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS most_consecutive_runs INTEGER DEFAULT 0",
    },
    {
      name: "user_stats.goals_achieved",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS goals_achieved INTEGER DEFAULT 0",
    },
    {
      name: "user_stats.ai_runner_profile",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS ai_runner_profile TEXT",
    },
    {
      name: "user_stats.ai_runner_profile_updated_at",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS ai_runner_profile_updated_at TIMESTAMP",
    },
    {
      name: "user_stats.coaching_observations",
      sql: "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS coaching_observations JSONB",
    },
    // ── segments table — gradient columns ────────────────────────────────────
    {
      name: "segments.avg_gradient",
      sql: "ALTER TABLE segments ADD COLUMN IF NOT EXISTS avg_gradient REAL",
    },
    {
      name: "segments.max_gradient",
      sql: "ALTER TABLE segments ADD COLUMN IF NOT EXISTS max_gradient REAL",
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

  // ── One-time data repair: fix corrupted aiCoachingNotes timestamps ──────────
  // The POST /api/runs handler was passing note.time through parseDate(), which
  // treated the elapsed-ms value as SECONDS and multiplied by 1000.  This made
  // every coaching timestamp exactly 1000× too large (e.g. 173 s → 173,000 s).
  // We correct all notes where the stored time exceeds 7,200,000 ms (2 hours) —
  // legitimate in-run coaching notes are always shorter than 2 hours; values
  // above that threshold were corrupted.  Dividing by 1000 recovers the original.
  try {
    const result = await pool.query(`
      UPDATE runs
      SET "ai_Coaching_Notes" = (
        SELECT jsonb_agg(
          CASE
            WHEN (note->>'time')::bigint > 7200000
            THEN jsonb_set(note, '{time}', to_jsonb(((note->>'time')::bigint / 1000)::bigint))
            ELSE note
          END
        )
        FROM jsonb_array_elements("ai_Coaching_Notes") AS note
      )
      WHERE "ai_Coaching_Notes" IS NOT NULL
        AND jsonb_array_length("ai_Coaching_Notes") > 0
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements("ai_Coaching_Notes") AS note
          WHERE (note->>'time')::bigint > 7200000
        )
    `);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[AutoMigrate] Fixed ai_Coaching_Notes timestamps in ${result.rowCount} run(s)`);
    }
  } catch (err: any) {
    console.warn(`[AutoMigrate] aiCoachingNotes repair (non-fatal): ${err.message}`);
  }
}
