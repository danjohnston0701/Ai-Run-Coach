-- Garmin Permissions Management Database Migrations
-- These migrations add permission tracking to the connected_devices table

-- Migration 1: Add createdAt column if it doesn't exist
ALTER TABLE connected_devices
ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

-- Migration 2: Add updatedAt column to connected_devices table
ALTER TABLE connected_devices
ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

-- Migration 3: Add grantedScopes column to track Garmin OAuth scopes
ALTER TABLE connected_devices
ADD COLUMN IF NOT EXISTS granted_scopes text;

-- Migration 4: Update existing records to set updatedAt to createdAt (only if both exist)
UPDATE connected_devices
SET updated_at = created_at
WHERE updated_at IS NULL AND created_at IS NOT NULL;

-- Migration 5: Create index for better query performance on permissions lookups
CREATE INDEX IF NOT EXISTS idx_connected_devices_user_device_type 
ON connected_devices(user_id, device_type, is_active);

-- Migration 6: Create permissions audit log table (optional, for tracking all permission changes)
-- Note: device_id stored as text without foreign key to avoid type mismatch issues
CREATE TABLE IF NOT EXISTS garmin_permission_changes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL,
  device_id text NOT NULL,
  changed_at timestamp DEFAULT now(),
  change_type text NOT NULL, -- 'GRANTED' | 'REVOKED'
  permissions text, -- Comma-separated list of scopes changed
  reason text -- 'USER_REAUTHORIZATION' | 'WEBHOOK' | 'SYSTEM'
);

CREATE INDEX idx_garmin_permission_changes_user 
ON garmin_permission_changes(user_id, changed_at DESC);

-- Verify migrations
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'connected_devices'
  AND column_name IN ('updated_at', 'granted_scopes')
ORDER BY column_name;
