-- Target-distance decimal places: replaces the boolean distance_decimals_enabled with a
-- 0–3 picklist. 0/1 keep the slider; 2/3 switch the target-distance control to a numeric field.
--
-- Run this in Neon BEFORE deploying the server build that references target_distance_decimals
-- (Drizzle selects every schema column explicitly, so a missing column breaks every user read).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS target_distance_decimals INTEGER NOT NULL DEFAULT 0;

-- The old toggle promised "up to 3 dp", so anyone who had it on keeps that precision.
UPDATE users
   SET target_distance_decimals = 3
 WHERE distance_decimals_enabled = TRUE
   AND target_distance_decimals = 0;

-- Optional, AFTER the new server is live (the currently deployed server still selects it):
-- ALTER TABLE users DROP COLUMN IF EXISTS distance_decimals_enabled;
