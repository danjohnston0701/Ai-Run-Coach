-- Adds respiration rate + training effect columns to garmin_realtime_data.
--
-- The watch has been sending these fields in its per-second live stream
-- (garmin-companion-app/source/views/RunView.mc: "respirationRate", "aerobicTE",
-- "anaerobicTE") since before this migration, but POST /api/garmin-companion/data had
-- nowhere to put them — they were silently dropped on ingest. This migration + the
-- matching routes.ts/schema.ts changes let live-coaching enrichment
-- (getWatchDynamicsEnrichment() in server/routes.ts) reference them, alongside the
-- ground-contact/vertical-oscillation/vertical-ratio/stride-length/power fields that
-- were already flowing through.
--
-- Apply via `npm run db:push` (requires EXTERNAL_DATABASE_URL), or run this directly
-- against the Neon database. Must land BEFORE the code that inserts these columns is
-- deployed (Replit redeploy is a separate manual step — see CLAUDE.md).

ALTER TABLE garmin_realtime_data
  ADD COLUMN IF NOT EXISTS respiration_rate real,
  ADD COLUMN IF NOT EXISTS aerobic_training_effect real,
  ADD COLUMN IF NOT EXISTS anaerobic_training_effect real;
