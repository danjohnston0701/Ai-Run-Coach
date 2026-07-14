-- Add currency support to users table for localized pricing display
-- Defaults to USD; inferred from timezone at login; user can override

ALTER TABLE users ADD COLUMN currency TEXT DEFAULT 'USD';

-- Create an index for potential future filtering by currency
CREATE INDEX idx_users_currency ON users(currency);

-- Note: timezone-to-currency mapping happens server-side in utils/timezone-to-currency.ts
-- No migration needed for existing users — currency will be inferred and set on next login
