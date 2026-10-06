-- Guest tour: which device the visitor said they run with, the screen they were on when they
-- left/skipped, and a per-event log for time-on-screen analysis. Also applied at boot by
-- server/auto-migrate.ts (ADD COLUMN IF NOT EXISTS) so a redeploy can't outrun it.

ALTER TABLE guest_tour_sessions ADD COLUMN IF NOT EXISTS watch_choice        TEXT;    -- apple_watch | garmin_watch | samsung_watch | phone_only (latest pick)
ALTER TABLE guest_tour_sessions ADD COLUMN IF NOT EXISTS current_step        INTEGER; -- screen of the latest event (furthest_step never goes backwards; this does)
ALTER TABLE guest_tour_sessions ADD COLUMN IF NOT EXISTS current_step_name   TEXT;
ALTER TABLE guest_tour_sessions ADD COLUMN IF NOT EXISTS abandoned_step      INTEGER; -- screen of the latest skipped/left; cleared when the tour is completed
ALTER TABLE guest_tour_sessions ADD COLUMN IF NOT EXISTS abandoned_step_name TEXT;
ALTER TABLE guest_tour_sessions ADD COLUMN IF NOT EXISTS abandoned_via       TEXT;    -- 'skipped' | 'left'
ALTER TABLE guest_tour_sessions ADD COLUMN IF NOT EXISTS abandoned_at        TIMESTAMP;
ALTER TABLE guest_tour_sessions ADD COLUMN IF NOT EXISTS event_log           JSONB NOT NULL DEFAULT '[]'::jsonb; -- [{e, s, n, w, t}], newest last, capped at 200

-- Backfill what the old columns already tell us about past abandonments.
UPDATE guest_tour_sessions
   SET abandoned_step      = furthest_step,
       abandoned_step_name = furthest_step_name,
       abandoned_via       = last_event,
       abandoned_at        = last_event_at
 WHERE abandoned_via IS NULL AND completed_at IS NULL AND last_event IN ('skipped', 'left');
