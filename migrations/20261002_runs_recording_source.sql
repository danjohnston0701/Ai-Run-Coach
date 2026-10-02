-- Where a run was recorded (server/utils/run-derivation.ts):
-- phone | apple_watch | garmin_watch | wear_os_watch | phone_apple_watch | phone_garmin_watch |
-- phone_wear_os_watch | strava_import. Sent by the clients; inferred server-side otherwise, and
-- backfilled for existing runs by the hourly derived-fields sweep (server/run-derived-fields.ts).
-- Also applied automatically at server start by server/auto-migrate.ts.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS recording_source TEXT;
