-- Live tracking observer-experience fields on live_run_sessions.
--
-- is_paused: set true/false by the runner's phone on pause/resume so observers see a "Paused"
-- state. Runner phones stop syncing position while paused, so without this an observer could
-- not distinguish a pause from lost signal.
--
-- result_run_id: the `runs` row the session became, written by the runner's phone after its
-- run upload succeeds. Lets a signed-in observer open the full run summary from the observer
-- screen's finished state.
--
-- Apply via `npm run db:push` (requires EXTERNAL_DATABASE_URL), or run this directly against
-- the Neon database. Must land BEFORE the code that reads/writes these columns is deployed
-- (Replit redeploy is a separate manual step — see CLAUDE.md).

ALTER TABLE live_run_sessions
  ADD COLUMN IF NOT EXISTS is_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS result_run_id varchar;
