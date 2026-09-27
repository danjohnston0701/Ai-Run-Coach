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
    // ── runs ───────────────────────────────────────────────────────────────────
    {
      name: "runs.session_type",
      sql: "ALTER TABLE runs ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'run'",
    },
    // Android phone-GPS filter diagnostics (accepted/rejected-by-reason fix counts, anchor
    // recoveries) — see gpsFilterStats in shared/schema.ts.
    {
      name: "runs.gps_filter_stats",
      sql: "ALTER TABLE runs ADD COLUMN IF NOT EXISTS gps_filter_stats JSONB",
    },
    // planned_workouts.session_type — added to shared/schema.ts for walk/run workout
    // classification but the DB migration was never applied. Without this, any
    // db.select().from(plannedWorkouts) (e.g. plan reassessment after a run save)
    // throws "column session_type does not exist".
    {
      name: "planned_workouts.session_type",
      sql: "ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'run'",
    },
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

    // ── group_runs — add columns that were missing when the table was first created ──
    // The original table was created without several columns that are now in the schema.
    // CREATE TABLE IF NOT EXISTS silently skips when the table already exists, so we
    // need explicit ALTER TABLEs to add the missing columns to existing tables.
    {
      name: "group_runs.name",
      sql: "ALTER TABLE group_runs ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Group Run'",
    },
    {
      name: "group_runs.description",
      sql: "ALTER TABLE group_runs ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "group_runs.meeting_point",
      sql: "ALTER TABLE group_runs ADD COLUMN IF NOT EXISTS meeting_point TEXT",
    },
    {
      name: "group_runs.meeting_lat",
      sql: "ALTER TABLE group_runs ADD COLUMN IF NOT EXISTS meeting_lat REAL",
    },
    {
      name: "group_runs.meeting_lng",
      sql: "ALTER TABLE group_runs ADD COLUMN IF NOT EXISTS meeting_lng REAL",
    },
    {
      name: "group_runs.max_participants",
      sql: "ALTER TABLE group_runs ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 10",
    },
    {
      name: "group_runs.invite_token",
      sql: "ALTER TABLE group_runs ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE DEFAULT gen_random_uuid()::text",
    },
    {
      name: "group_runs.updated_at",
      sql: "ALTER TABLE group_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
    },
    // group_run_participants extra columns
    {
      name: "group_run_participants.ready_to_start",
      sql: "ALTER TABLE group_run_participants ADD COLUMN IF NOT EXISTS ready_to_start BOOLEAN NOT NULL DEFAULT FALSE",
    },
    {
      name: "group_run_participants.run_id",
      sql: "ALTER TABLE group_run_participants ADD COLUMN IF NOT EXISTS run_id VARCHAR REFERENCES runs(id)",
    },

    // ── users.default_session_type ────────────────────────────────────────────
    // Added to allow users to set a preferred activity type (run/walk/interval).
    // Column was added to shared/schema.ts but DB migration was not applied.
    {
      name: "users.default_session_type",
      sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS default_session_type TEXT DEFAULT 'run'",
    },
    {
      name: "users.timezone",
      sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'",
    },
    {
      name: "users.country",
      sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US'",
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
    // ── runs.coaching_insight — post-run AI coaching assessment ──────────────
    // Stores the plan reassessment reason + recommendation for this specific run.
    // Written by reassessTrainingPlansWithRunData() and read by comprehensive analysis.
    {
      name: "runs.coaching_insight",
      sql: "ALTER TABLE runs ADD COLUMN IF NOT EXISTS coaching_insight JSONB",
    },
    {
      // "Forgot to stop" end-trim state + pre-trim snapshot (2026-09-27). Canonical copy:
      // migrations/20260927_runs_end_trim.sql
      name: "runs.end_trim",
      sql: "ALTER TABLE runs ADD COLUMN IF NOT EXISTS end_trim JSONB",
    },

    // ── live_run_sessions — columns added after initial table creation ────────
    // These columns exist in shared/schema.ts but may be missing from the DB if
    // the table was created before they were added.  All are safe to add with
    // IF NOT EXISTS / DEFAULT values so existing rows are unaffected.
    {
      name: "live_run_sessions.has_started",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS has_started BOOLEAN DEFAULT false",
    },
    {
      // Observers read the runner's recent AI coaching cues (2026-09-21). Canonical copy:
      // migrations/20260921_live_session_coaching_notes.sql
      name: "live_run_sessions.recent_coaching_notes",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS recent_coaching_notes JSONB",
    },
    {
      name: "live_run_sessions.started_at",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMP",
    },
    {
      name: "live_run_sessions.last_synced_at",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP DEFAULT NOW()",
    },
    {
      name: "live_run_sessions.shared_with_friends",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS shared_with_friends BOOLEAN DEFAULT false",
    },
    {
      name: "live_run_sessions.session_key",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS session_key TEXT",
    },
    {
      name: "live_run_sessions.difficulty",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS difficulty TEXT",
    },
    {
      name: "live_run_sessions.cadence",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS cadence INTEGER",
    },
    {
      name: "live_run_sessions.gps_track",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS gps_track JSONB",
    },
    {
      name: "live_run_sessions.km_splits",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS km_splits JSONB",
    },
    {
      name: "live_run_sessions.observers",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS observers JSONB",
    },
    {
      name: "live_run_sessions.runner_name",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS runner_name TEXT",
    },
    {
      name: "live_run_sessions.observe_token",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS observe_token TEXT",
    },
    {
      name: "live_run_sessions.route_id",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS route_id VARCHAR REFERENCES routes(id)",
    },
    {
      name: "live_run_sessions.viewer_count",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS viewer_count INTEGER DEFAULT 0",
    },
    {
      name: "live_run_sessions.observer_count",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS observer_count INTEGER DEFAULT 0",
    },
    {
      name: "live_run_sessions.invite_code",
      sql: "ALTER TABLE live_run_sessions ADD COLUMN IF NOT EXISTS invite_code VARCHAR(8) UNIQUE",
    },
    {
      name: "idx_live_run_sessions_invite_code",
      sql: "CREATE INDEX IF NOT EXISTS idx_live_run_sessions_invite_code ON live_run_sessions(invite_code)",
    },

    // ─��� observer_invitations — full table for email-based live-run invites ────
    // Created to support non-registered users receiving email invitations to
    // watch a live run session.  Must be run before any email invite is sent.
    {
      name: "observer_invitations.create_table",
      sql: `
        CREATE TABLE IF NOT EXISTS observer_invitations (
          id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id  VARCHAR(36)  NOT NULL REFERENCES live_run_sessions(id) ON DELETE CASCADE,
          runner_id   VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          email       VARCHAR(255) NOT NULL,
          token       VARCHAR(255) NOT NULL UNIQUE,
          status      TEXT DEFAULT 'sent',
          created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
          expires_at  TIMESTAMP,
          viewed_at   TIMESTAMP,
          clicked_at  TIMESTAMP
        )
      `,
    },
    {
      name: "idx_observer_invitations_token",
      sql: "CREATE INDEX IF NOT EXISTS idx_observer_invitations_token ON observer_invitations(token)",
    },
    {
      name: "idx_observer_invitations_email",
      sql: "CREATE INDEX IF NOT EXISTS idx_observer_invitations_email ON observer_invitations(email)",
    },
    {
      name: "idx_observer_invitations_session",
      sql: "CREATE INDEX IF NOT EXISTS idx_observer_invitations_session ON observer_invitations(session_id)",
    },
    {
      name: "observer_invitations.invite_code",
      sql: "ALTER TABLE observer_invitations ADD COLUMN IF NOT EXISTS invite_code VARCHAR(8) UNIQUE",
    },
    {
      name: "idx_observer_invitations_invite_code",
      sql: "CREATE INDEX IF NOT EXISTS idx_observer_invitations_invite_code ON observer_invitations(invite_code)",
    },
    // ── group_run_participants.completed_at ──────────────────────────────────
    // Track when each participant finishes their run
    {
      name: "group_run_participants.completed_at",
      sql: "ALTER TABLE group_run_participants ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP DEFAULT NULL",
    },
    {
      name: "idx_group_run_participants_completed_at",
      sql: "CREATE INDEX IF NOT EXISTS idx_group_run_participants_completed_at ON group_run_participants(group_run_id, completed_at)",
    },

    // ── runs.power_saver_mode_detected ───────────────────────────────────────────
    // Tracks whether the phone had power saver / battery saver active during the run.
    // When true, GPS was likely throttled by the OS which reduces tracking accuracy.
    {
      name: "runs.power_saver_mode_detected",
      sql: "ALTER TABLE runs ADD COLUMN IF NOT EXISTS power_saver_mode_detected boolean DEFAULT false",
    },

    // ── apple_transactions ───────────────────────────────────────────────────────
    // Store Apple App Store transaction IDs to map notifications back to users.
    // Enables tracking subscription renewals, expiries, and refunds.
    {
      name: "apple_transactions.create_table",
      sql: `
        CREATE TABLE IF NOT EXISTS apple_transactions (
          id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id                VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          original_transaction_id VARCHAR NOT NULL UNIQUE,
          transaction_id         VARCHAR NOT NULL,
          app_account_token      VARCHAR,
          product_id             VARCHAR NOT NULL,
          created_at             TIMESTAMP DEFAULT NOW(),
          updated_at             TIMESTAMP DEFAULT NOW()
        )
      `,
    },
    {
      name: "idx_apple_transactions_user",
      sql: "CREATE INDEX IF NOT EXISTS idx_apple_transactions_user ON apple_transactions(user_id)",
    },
    {
      name: "idx_apple_transactions_original_id",
      sql: "CREATE INDEX IF NOT EXISTS idx_apple_transactions_original_id ON apple_transactions(original_transaction_id)",
    },

    // ── users.target_distance_decimals ───────────────────────────────────────────
    // Added to shared/schema.ts in 3fc9513 with a hand-run migration
    // (migrations/add_target_distance_decimals.sql) that was never applied to Neon. Drizzle
    // selects every schema column explicitly, so without this every storage.getUser() fails
    // with 42703 the moment that build is deployed. Backfill mirrors the SQL file.
    {
      name: "users.target_distance_decimals",
      sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS target_distance_decimals INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "users.target_distance_decimals.backfill",
      sql: "UPDATE users SET target_distance_decimals = 3 WHERE distance_decimals_enabled = TRUE AND target_distance_decimals = 0",
    },

    // ── users.onboarding_tour_* progress ─────────────────────────────────────────
    // How far the onboarding feature tour got and how it ended (skip / closed app /
    // completed). The original started_at/completed_at pair came via
    // migrations/add_onboarding_tour_tracking.sql; these extend it — see
    // migrations/20260918_onboarding_tour_progress.sql.
    { name: "users.onboarding_tour_furthest_step", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_furthest_step INTEGER" },
    { name: "users.onboarding_tour_total_steps", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_total_steps INTEGER" },
    { name: "users.onboarding_tour_furthest_step_name", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_furthest_step_name TEXT" },
    { name: "users.onboarding_tour_last_event", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_last_event TEXT" },
    { name: "users.onboarding_tour_last_event_at", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_last_event_at TIMESTAMP" },
    { name: "users.onboarding_tour_skipped_at", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_skipped_at TIMESTAMP" },
    { name: "users.onboarding_tour_skipped_at_step", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_skipped_at_step INTEGER" },

    // ── users.acquisition_source / guest-tour conversion ─────────────────────────
    // "Did this user arrive via the pre-login tour?" answerable from the user row, without
    // joining guest_tour_sessions. Canonical copy: migrations/20260920_user_acquisition_source.sql
    { name: "users.acquisition_source", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS acquisition_source TEXT" },
    { name: "users.guest_tour_device_id", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_tour_device_id TEXT" },
    { name: "users.guest_tour_converted_at", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_tour_converted_at TIMESTAMP" },
    { name: "idx_users_acquisition_source", sql: "CREATE INDEX IF NOT EXISTS idx_users_acquisition_source ON users(acquisition_source)" },

    // ── user_stats.coaching_observations: drop sub-100 m runs ───────────────────
    // Observations recorded from test taps / aborted starts (< 0.1 km) shaped "What your
    // coach knows about you". The service now refuses to record them; this clears the
    // ones already stored. Profiles regenerate on the next run / My Data refresh.
    {
      name: "user_stats.coaching_observations.drop_sub_100m",
      sql: `
        UPDATE user_stats s
        SET coaching_observations = (
          SELECT COALESCE(jsonb_agg(o ORDER BY ord), '[]'::jsonb)
          FROM jsonb_array_elements(s.coaching_observations) WITH ORDINALITY AS t(o, ord)
          WHERE COALESCE((o->>'distanceKm')::numeric, 0) >= 0.1
        )
        WHERE s.coaching_observations IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(s.coaching_observations) AS e(o)
            WHERE COALESCE((e.o->>'distanceKm')::numeric, 0) < 0.1
          )
      `,
    },

    // ── guest_tour_sessions ──────────────────────────────────────────────────────
    // Pre-login "Take a Tour" tracking per install + whether it converted to a user.
    // Canonical copy: migrations/20260919_guest_tour_sessions.sql
    {
      name: "guest_tour_sessions.create_table",
      sql: `
        CREATE TABLE IF NOT EXISTS guest_tour_sessions (
          device_id                TEXT PRIMARY KEY,
          platform                 TEXT,
          device_manufacturer      TEXT,
          device_model             TEXT,
          device_os_version        TEXT,
          device_app_version       TEXT,
          timezone                 TEXT,
          country                  TEXT,
          tours_started            INTEGER NOT NULL DEFAULT 0,
          first_started_at         TIMESTAMP,
          last_started_at          TIMESTAMP,
          furthest_step            INTEGER,
          furthest_step_name       TEXT,
          total_steps              INTEGER,
          last_event               TEXT,
          last_event_at            TIMESTAMP,
          completed_at             TIMESTAMP,
          skipped_at               TIMESTAMP,
          skipped_at_step          INTEGER,
          left_at                  TIMESTAMP,
          create_account_tapped_at TIMESTAMP,
          converted_user_id        VARCHAR REFERENCES users(id) ON DELETE SET NULL,
          converted_at             TIMESTAMP,
          created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `,
    },
    { name: "idx_guest_tour_sessions_converted", sql: "CREATE INDEX IF NOT EXISTS idx_guest_tour_sessions_converted ON guest_tour_sessions(converted_user_id)" },
    { name: "idx_guest_tour_sessions_first_started", sql: "CREATE INDEX IF NOT EXISTS idx_guest_tour_sessions_first_started ON guest_tour_sessions(first_started_at)" },

    // ── google_play_transactions ─────────────────────────────────────────────────
    // Purchase-token → user mapping for Google Play subscriptions (the Play analogue of
    // apple_transactions). Written by verify-purchase, RTDN and the hourly reconcile in
    // google-play-billing.ts. Canonical copy: migrations/20260918_google_play_transactions.sql
    {
      name: "google_play_transactions.create_table",
      sql: `
        CREATE TABLE IF NOT EXISTS google_play_transactions (
          id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id               VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          purchase_token        TEXT NOT NULL UNIQUE,
          product_id            VARCHAR NOT NULL,
          package_name          VARCHAR NOT NULL DEFAULT 'live.airuncoach.airuncoach',
          linked_purchase_token TEXT,
          expiry_time           TIMESTAMP,
          auto_renewing         BOOLEAN DEFAULT FALSE,
          subscription_state    VARCHAR,
          last_checked_at       TIMESTAMP,
          created_at            TIMESTAMP DEFAULT NOW(),
          updated_at            TIMESTAMP DEFAULT NOW()
        )
      `,
    },
    {
      name: "idx_google_play_transactions_user",
      sql: "CREATE INDEX IF NOT EXISTS idx_google_play_transactions_user ON google_play_transactions(user_id)",
    },
    {
      name: "idx_google_play_transactions_expiry",
      sql: "CREATE INDEX IF NOT EXISTS idx_google_play_transactions_expiry ON google_play_transactions(expiry_time)",
    },

    // ── users.apple_account_token ───────────────────────────────────────────────
    // Store the app account token to link Apple notifications to users
    {
      name: "users.apple_account_token",
      sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_account_token VARCHAR",
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

  // ── Ensure admin accounts have is_admin = true ───────────────────────────────
  try {
    await pool.query(`UPDATE users SET is_admin = true WHERE email = 'danjohnston0701@gmail.com'`);
  } catch (err: any) {
    console.warn(`[AutoMigrate] Admin email setup (non-fatal): ${err.message}`);
  }

  // ── One-time data repair: coaching observation distances written as metres÷1000 ──
  // POST /api/runs/:id/comprehensive-analysis stored `distanceKm = runs.distance / 1000`
  // on the assumption the column was metres; it's kilometres, so every observation
  // (which the AI runner profile reads back as "[date · 0.01km · score]") was ~1000×
  // too small. Re-derive from the run row for any observation under 0.2 km that still
  // has a resolvable runId. Idempotent — the WHERE clause makes it a no-op once clean.
  try {
    const result = await pool.query(`
      UPDATE user_stats s
      SET coaching_observations = (
        SELECT jsonb_agg(
          CASE
            WHEN r.id IS NOT NULL AND (o->>'distanceKm')::numeric < 0.2
            THEN jsonb_set(o, '{distanceKm}', to_jsonb(round((CASE WHEN r.distance > 200 THEN r.distance / 1000.0 ELSE r.distance END)::numeric, 2)))
            ELSE o
          END ORDER BY t.ord
        )
        FROM jsonb_array_elements(s.coaching_observations) WITH ORDINALITY AS t(o, ord)
        LEFT JOIN runs r ON r.id = t.o->>'runId'
      )
      WHERE s.coaching_observations IS NOT NULL
        AND jsonb_typeof(s.coaching_observations) = 'array'
        AND jsonb_array_length(s.coaching_observations) > 0
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(s.coaching_observations) o
          JOIN runs r ON r.id = o->>'runId'
          WHERE (o->>'distanceKm')::numeric < 0.2
            AND (CASE WHEN r.distance > 200 THEN r.distance / 1000.0 ELSE r.distance END) >= 0.2
        )
    `);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[AutoMigrate] Repaired coaching_observations distanceKm for ${result.rowCount} user(s)`);
    }
  } catch (err: any) {
    console.warn(`[AutoMigrate] coaching_observations distance repair (non-fatal): ${err.message}`);
  }

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
      SET ai_coaching_notes = (
        SELECT jsonb_agg(
          CASE
            WHEN (note->>'time')::bigint > 7200000
            THEN jsonb_set(note, '{time}', to_jsonb(((note->>'time')::bigint / 1000)::bigint))
            ELSE note
          END
        )
        FROM jsonb_array_elements(ai_coaching_notes) AS note
      )
      WHERE ai_coaching_notes IS NOT NULL
        AND jsonb_array_length(ai_coaching_notes) > 0
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(ai_coaching_notes) AS note
          WHERE (note->>'time')::bigint > 7200000
        )
    `);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[AutoMigrate] Fixed ai_coaching_notes timestamps in ${result.rowCount} run(s)`);
    }
  } catch (err: any) {
    console.warn(`[AutoMigrate] aiCoachingNotes repair (non-fatal): ${err.message}`);
  }
}
