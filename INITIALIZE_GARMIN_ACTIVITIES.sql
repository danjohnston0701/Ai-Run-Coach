-- Initialize garmin_activities table if it doesn't exist
-- This ensures the table has all required columns from the start

CREATE TABLE IF NOT EXISTS garmin_activities (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id VARCHAR(255) REFERENCES runs(id),
  
  -- Basic activity identity and info
  garmin_activity_id TEXT NOT NULL UNIQUE,
  activity_name TEXT,
  activity_type VARCHAR(100),
  activity_sub_type VARCHAR(100),
  event_type TEXT,
  
  -- Timing
  start_time_in_seconds INTEGER,
  start_time_offset_in_seconds INTEGER,
  duration_in_seconds INTEGER,
  
  -- Distance and elevation
  distance_in_meters REAL,
  elevation_gain REAL,
  elevation_loss REAL,
  min_elevation REAL,
  max_elevation REAL,
  
  -- Location
  start_latitude REAL,
  start_longitude REAL,
  
  -- Heart rate
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  heart_rate_zones JSONB,
  
  -- Speed and pace
  average_speed REAL,
  max_speed REAL,
  average_pace REAL,
  
  -- Power metrics
  average_power REAL,
  max_power REAL,
  normalized_power REAL,
  
  -- Running dynamics
  average_cadence REAL,
  max_cadence REAL,
  average_stride_length REAL,
  ground_contact_time REAL,
  ground_contact_balance REAL,
  vertical_oscillation REAL,
  vertical_ratio REAL,
  
  -- Calories
  active_kilocalories INTEGER,
  device_active_kilocalories INTEGER,
  bmr_kilocalories INTEGER,
  
  -- Training effect
  aerobic_training_effect REAL,
  anaerobic_training_effect REAL,
  training_effect_label TEXT,
  
  -- Recovery and fitness
  vo2_max REAL,
  lactate_threshold_bpm INTEGER,
  lactate_threshold_speed REAL,
  recovery_time INTEGER,
  
  -- Time series data
  laps JSONB,
  splits JSONB,
  samples JSONB,
  
  -- Environmental
  average_temperature REAL,
  min_temperature REAL,
  max_temperature REAL,
  
  -- Device
  device_name TEXT,
  
  -- Wheelchair metrics
  avg_push_cadence REAL,
  max_push_cadence REAL,
  pushes INTEGER,
  
  -- Additional info
  summary_id TEXT,
  activity_description TEXT,
  
  -- Webhook and processing
  user_access_token TEXT,
  webhook_received_at TIMESTAMP DEFAULT NOW(),
  raw_data JSONB,
  is_processed BOOLEAN DEFAULT FALSE,
  ai_analysis_generated BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create all necessary indexes
CREATE INDEX IF NOT EXISTS idx_garmin_activities_user_id ON garmin_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_run_id ON garmin_activities(run_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_garmin_activity_id ON garmin_activities(garmin_activity_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_created_at ON garmin_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_user_created ON garmin_activities(user_id, created_at);

-- Ensure webhook_failure_queue table has all required columns
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMP;
ALTER TABLE webhook_failure_queue ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;

-- Ensure runs table has all required columns
ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Ensure connected_devices table has all required columns  
ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE connected_devices ADD COLUMN IF NOT EXISTS granted_scopes TEXT;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_runs_user_created ON runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_updated_at ON runs(updated_at);
CREATE INDEX IF NOT EXISTS idx_webhook_failure_queue_user ON webhook_failure_queue(user_id);
