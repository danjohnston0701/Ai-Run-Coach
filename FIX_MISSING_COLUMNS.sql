-- Fix missing columns from incomplete migrations
-- These columns were defined in schema.ts but NEVER added to the actual database
-- This causes PostgreSQL 42703 errors "column does not exist"

-- ==================== GARMIN_ACTIVITIES TABLE - ADD ALL 65 COLUMNS ====================
-- The garmin_activities table was created by Drizzle but is missing most columns

-- Core activity identity
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS garmin_activity_id TEXT UNIQUE;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) NOT NULL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS run_id VARCHAR(255);

-- Basic activity info
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS activity_name TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS activity_type VARCHAR(100);
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS activity_sub_type VARCHAR(100);
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS start_time_in_seconds INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS start_time_offset_in_seconds INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS duration_in_seconds INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS distance_in_meters REAL;

-- Heart rate data
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_heart_rate INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_heart_rate INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS heart_rate_zones JSONB;

-- Pace/Speed data
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_speed REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_speed REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_pace REAL;

-- Power data
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_power REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_power REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS normalized_power REAL;

-- Running dynamics
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_cadence REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_cadence REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_stride_length REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS ground_contact_time REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS ground_contact_balance REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS vertical_oscillation REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS vertical_ratio REAL;

-- Elevation data
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS start_latitude REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS start_longitude REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS elevation_gain REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS elevation_loss REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS min_elevation REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_elevation REAL;

-- Calories
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS active_kilocalories INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS device_active_kilocalories INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS bmr_kilocalories INTEGER;

-- Training effect
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS aerobic_training_effect REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS anaerobic_training_effect REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS training_effect_label TEXT;

-- Recovery/Fitness
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS vo2_max REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS lactate_threshold_bpm INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS lactate_threshold_speed REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS recovery_time INTEGER;

-- Laps and splits
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS laps JSONB;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS splits JSONB;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS samples JSONB;

-- Environmental
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_temperature REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS min_temperature REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_temperature REAL;

-- Device info
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS device_name TEXT;

-- Wheelchair-specific metrics (CRITICAL - was causing immediate errors)
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS avg_push_cadence REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_push_cadence REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS pushes INTEGER;

-- Additional activity info
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS summary_id TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS activity_description TEXT;

-- Webhook tracking
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS user_access_token TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMP DEFAULT NOW();

-- Full raw data and metadata
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS raw_data JSONB;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS ai_analysis_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- ==================== RUNS TABLE ====================

ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ==================== CONNECTED_DEVICES TABLE ====================

ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS granted_scopes TEXT;

-- ==================== PERFORMANCE INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_garmin_activities_user_id ON garmin_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_run_id ON garmin_activities(run_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_garmin_activity_id ON garmin_activities(garmin_activity_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_created_at ON garmin_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
CREATE INDEX IF NOT EXISTS idx_runs_updated_at ON runs(updated_at);
