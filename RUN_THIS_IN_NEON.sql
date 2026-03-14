-- ============================================================
-- ONE-SHOT DATABASE FIX
-- Run this ENTIRE script in Neon SQL Editor to fix all errors
-- It is safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================


-- ==============================================================
-- 1. FIX: webhook_failure_queue - add missing columns
-- (Table exists but was created without user_id and other cols)
-- ==============================================================
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Rename last_retry_at -> last_attempted_at to match schema if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_failure_queue' AND column_name = 'last_retry_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_failure_queue' AND column_name = 'last_attempted_at'
  ) THEN
    ALTER TABLE webhook_failure_queue RENAME COLUMN last_retry_at TO last_attempted_at;
  END IF;
END $$;

ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMP;


-- ==============================================================
-- 2. FIX: garmin_activities - add ALL missing columns
-- (Table exists but missing ~50 columns from schema)
-- ==============================================================
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS run_id VARCHAR(255);
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS activity_name TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS activity_type VARCHAR(100);
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS activity_sub_type VARCHAR(100);
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS start_time_in_seconds INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS start_time_offset_in_seconds INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS duration_in_seconds INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS distance_in_meters REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_heart_rate INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_heart_rate INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS heart_rate_zones JSONB;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_speed REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_speed REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_pace REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_power REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_power REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS normalized_power REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_cadence REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_cadence REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_stride_length REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS ground_contact_time REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS ground_contact_balance REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS vertical_oscillation REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS vertical_ratio REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS start_latitude REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS start_longitude REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS elevation_gain REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS elevation_loss REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS min_elevation REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_elevation REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS active_kilocalories INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS device_active_kilocalories INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS bmr_kilocalories INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS aerobic_training_effect REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS anaerobic_training_effect REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS training_effect_label TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS vo2_max REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS lactate_threshold_bpm INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS lactate_threshold_speed REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS recovery_time INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS laps JSONB;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS splits JSONB;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS samples JSONB;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS average_temperature REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS min_temperature REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_temperature REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS device_name TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS avg_push_cadence REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS max_push_cadence REAL;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS pushes INTEGER;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS summary_id TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS activity_description TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS user_access_token TEXT;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMP DEFAULT NOW();
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS raw_data JSONB;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS ai_analysis_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE garmin_activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();


-- ==============================================================
-- 3. FIX: runs - add missing timestamp columns
-- ==============================================================
ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();


-- ==============================================================
-- 4. FIX: connected_devices - add missing columns
-- ==============================================================
ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS granted_scopes TEXT;
ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();


-- ==============================================================
-- 5. PERFORMANCE INDEXES
-- ==============================================================
CREATE INDEX IF NOT EXISTS idx_garmin_activities_user_id ON garmin_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_run_id ON garmin_activities(run_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_garmin_id ON garmin_activities(garmin_activity_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_created_at ON garmin_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_failure_queue_user ON webhook_failure_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failure_queue_retry ON webhook_failure_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_completed_at ON runs(user_id, completed_at);

-- ============================================================
-- DONE! All missing columns have been added.
-- Try generating AI Analysis again - it should work now.
-- ============================================================
