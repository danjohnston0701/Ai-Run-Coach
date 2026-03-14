-- Fix missing columns from incomplete migrations
-- These columns were defined in schema.ts but never added to the database

-- ==================== GARMIN_ACTIVITIES TABLE - ADD ALL MISSING COLUMNS ====================

-- Wheelchair-specific metrics (CRITICAL - causing immediate errors)
ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS avg_push_cadence REAL;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS max_push_cadence REAL;

-- Activity classification
ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS activity_sub_type VARCHAR(100);

-- Environmental data
ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS average_temperature REAL;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS min_temperature REAL;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS max_temperature REAL;

-- Additional fields that may be missing
ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS training_effect_label TEXT;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS event_type TEXT;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS lactate_threshold_bpm INTEGER;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS lactate_threshold_speed REAL;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS device_active_kilocalories INTEGER;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS normalized_power REAL;

ALTER TABLE garmin_activities 
ADD COLUMN IF NOT EXISTS ground_contact_balance REAL;

-- ==================== RUNS TABLE ====================

ALTER TABLE runs 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE runs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ==================== CONNECTED_DEVICES TABLE ====================

ALTER TABLE connected_devices 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE connected_devices 
ADD COLUMN IF NOT EXISTS granted_scopes TEXT;

-- ==================== PERFORMANCE INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_garmin_activities_activity_sub_type 
ON garmin_activities(activity_sub_type);

CREATE INDEX IF NOT EXISTS idx_garmin_activities_user_id 
ON garmin_activities(user_id);

CREATE INDEX IF NOT EXISTS idx_runs_created_at 
ON runs(created_at);
