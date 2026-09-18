-- Guest (pre-login) onboarding tour tracking — one row per install that opened the tour
-- from the fresh-install welcome without an account. Answers: how many downloads take the
-- tour, how far they get, and whether that install went on to create a user (converted_*).
-- Device columns mirror what users.* captures at login/register. Also applied at boot by
-- server/auto-migrate.ts (CREATE TABLE IF NOT EXISTS) so a redeploy can't outrun it.

CREATE TABLE IF NOT EXISTS guest_tour_sessions (
  device_id                TEXT PRIMARY KEY,            -- client-generated install UUID
  platform                 TEXT,                        -- 'ios' | 'android'
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
  create_account_tapped_at TIMESTAMP,                   -- tapped "Create a Free Account" at the end of the tour
  converted_user_id        VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  converted_at             TIMESTAMP,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_tour_sessions_converted ON guest_tour_sessions(converted_user_id);
CREATE INDEX IF NOT EXISTS idx_guest_tour_sessions_first_started ON guest_tour_sessions(first_started_at);
