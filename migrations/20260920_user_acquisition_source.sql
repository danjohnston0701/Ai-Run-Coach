-- Where a user came from, recorded on the user row itself.
--
-- guest_tour_sessions already knows which INSTALL took the pre-login "Take a Tour" and which
-- user it became (converted_user_id), but nothing on `users` said so — you had to know the
-- guest-tour table existed and join back to it to answer "did this user arrive via the tour?".
-- These columns put the answer on the user record: `acquisition_source = 'guest_tour'` is a
-- plain WHERE clause, and guest_tour_device_id joins back to guest_tour_sessions for the full
-- tour detail (how far they got, whether they completed or skipped it).
--
-- Written by markGuestTourConverted() in server/routes-guest-tour.ts, called from the register
-- handler. Write-once: an existing acquisition_source is never overwritten.
-- NULL acquisition_source = direct sign-up, or an account created before 2026-09-20.
-- Also applied at boot by server/auto-migrate.ts so a redeploy can't outrun it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_tour_device_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_tour_converted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_acquisition_source ON users(acquisition_source);

-- Backfill: any install that already converted before these columns existed.
UPDATE users u
   SET acquisition_source      = COALESCE(u.acquisition_source, 'guest_tour'),
       guest_tour_device_id    = COALESCE(u.guest_tour_device_id, g.device_id),
       guest_tour_converted_at = COALESCE(u.guest_tour_converted_at, g.converted_at, NOW())
  FROM guest_tour_sessions g
 WHERE g.converted_user_id = u.id;
