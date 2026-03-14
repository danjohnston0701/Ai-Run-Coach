-- Fix missing columns from incomplete migrations
-- These columns were defined in schema.ts but never added to the database

-- Add missing activity_sub_type column to garmin_activities table
ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS activity_sub_type VARCHAR(100);

-- Ensure all new columns exist on runs table
ALTER TABLE runs 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE runs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Ensure connected_devices table has the updated_at column
ALTER TABLE connected_devices 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE connected_devices 
ADD COLUMN IF NOT EXISTS granted_scopes TEXT;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_garmin_activities_activity_sub_type 
ON garmin_activities(activity_sub_type);
