-- "Forgot to stop" end trim (server/run-end-trim.ts, server/routes-run-end-trim.ts).
-- null = never actioned; {"status":"applied","original":{...}} after the runner accepts the
-- Run Summary suggestion (original = pre-trim columns, restored by Undo);
-- {"status":"dismissed"} once they keep the run as recorded.
-- Also applied automatically at server start by server/auto-migrate.ts.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS end_trim JSONB;
