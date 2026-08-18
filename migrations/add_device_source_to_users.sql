-- Add device_source column to users table
-- Tracks which app (iOS or Android) the user most recently registered or logged in
-- from. Set by POST /api/auth/register and POST /api/auth/login; null for accounts
-- that predate this column or haven't logged in again since it was added.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS device_source text;

COMMENT ON COLUMN users.device_source IS
  'Platform of the app the user most recently registered or logged in from — "ios" or "android". Null if unknown (predates this column, or a login/register since then never sent it).';
