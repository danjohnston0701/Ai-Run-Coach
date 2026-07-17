-- Add timezone and country columns to users table for localization and future features
-- Timezone: IANA timezone identifier (e.g., "America/Los_Angeles", "Europe/London")
-- Country: ISO 3166-1 alpha-2 country code (e.g., "US", "GB", "CA")
-- Both are inferred from device timezone at signup/login, but stored for future use

ALTER TABLE users ADD COLUMN timezone text DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN country text DEFAULT 'US';

-- Add comment for context
COMMENT ON COLUMN users.timezone IS 'IANA timezone identifier (e.g., America/Los_Angeles, Europe/London)';
COMMENT ON COLUMN users.country IS 'ISO 3166-1 alpha-2 country code (e.g., US, GB, CA)';
