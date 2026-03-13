-- Garmin Integration Database Migrations for Neon
-- This file contains all SQL migrations needed to support Garmin webhook integration

-- ==================== 1. EXTEND EXISTING RUNS TABLE ====================
-- Add Garmin-related fields to track merged activities

-- First, add created_at and updated_at timestamps if they don't exist
ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add Garmin-related fields
ALTER TABLE runs ADD COLUMN IF NOT EXISTS garmin_activity_id VARCHAR(255);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS garmin_summary_id VARCHAR(255);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS activity_sub_type VARCHAR(255);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS has_garmin_data BOOLEAN DEFAULT false;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS device_name VARCHAR(255);

-- Garmin-provided metrics (override AiRunCoach if present)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS distance_garmin DECIMAL(10,2);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS duration_garmin INTEGER;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS elevation_gain_garmin INTEGER;

-- Merge tracking
ALTER TABLE runs ADD COLUMN IF NOT EXISTS merge_score INTEGER;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS merge_confidence DECIMAL(3,2);

-- Create indexes for Garmin queries and performance
CREATE INDEX IF NOT EXISTS idx_runs_garmin_activity_id ON runs(garmin_activity_id);
CREATE INDEX IF NOT EXISTS idx_runs_garmin_summary_id ON runs(garmin_summary_id);
CREATE INDEX IF NOT EXISTS idx_runs_user_created_at ON runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_user_completed_at ON runs(user_id, completed_at);

-- ==================== 2. ACTIVITY MERGE LOG TABLE ====================
-- Track merges between AiRunCoach runs and Garmin activities

CREATE TABLE IF NOT EXISTS activity_merge_log (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ai_run_coach_run_id VARCHAR(255) NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  garmin_activity_id VARCHAR(255) NOT NULL,
  merge_score INTEGER NOT NULL CHECK (merge_score >= 0 AND merge_score <= 100),
  merge_reasons JSONB,
  merged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ai_run_coach_run_id, garmin_activity_id),
  CONSTRAINT valid_merge_score CHECK (merge_score > 50)
);

CREATE INDEX IF NOT EXISTS idx_activity_merge_log_user_id ON activity_merge_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_merge_log_garmin_activity_id ON activity_merge_log(garmin_activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_merge_log_merged_at ON activity_merge_log(merged_at);

-- ==================== 3. GARMIN ACTIVITY SAMPLES TABLE ====================
-- Store detailed time-series data from Garmin activities

CREATE TABLE IF NOT EXISTS garmin_activity_samples (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id VARCHAR(255) NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  samples JSONB NOT NULL,
  pace_data JSONB,
  elevation_profile JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garmin_activity_samples_run_id ON garmin_activity_samples(run_id);
CREATE INDEX IF NOT EXISTS idx_garmin_activity_samples_user_id ON garmin_activity_samples(user_id);

-- ==================== 4. EXTEND GARMIN_WELLNESS_METRICS TABLE ====================
-- Add all new columns for comprehensive wellness tracking

-- Menstrual cycle tracking
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS cycle_start_date DATE;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS day_in_cycle INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS period_length INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS current_phase INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS current_phase_type VARCHAR(255);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS length_of_current_phase INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS days_until_next_phase INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS predicted_cycle_length INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS cycle_length INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS is_predicted_cycle BOOLEAN;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS cycle_status VARCHAR(50);

-- Pregnancy tracking
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS pregnancy_status VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS pregnancy_title VARCHAR(255);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS original_due_date DATE;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS pregnancy_due_date DATE;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS pregnancy_start_date DATE;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS weeks_of_pregnancy INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS number_of_babies VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS has_experienced_loss BOOLEAN;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS height_in_centimeters INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS weight_in_grams INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS blood_glucose_readings JSONB;

-- Sleep metrics (detailed)
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS total_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS deep_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS light_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS rem_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS awake_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS unmeasurable_sleep_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS total_nap_duration_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS nap_count INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS deep_sleep_percent DECIMAL(5,2);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS light_sleep_percent DECIMAL(5,2);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS rem_sleep_percent DECIMAL(5,2);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sleep_score INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sleep_quality VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS validation_type VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS deep_percentage_rating VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS light_percentage_rating VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS rem_percentage_rating VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS restlessness_rating VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS awake_count_rating VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS stress_rating VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS total_duration_rating VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sleep_spo2_readings JSONB;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS naps_data JSONB;

-- Stress & body battery
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS average_stress_level INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS max_stress_level INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS min_stress_level INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS stress_qualifier VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS stress_readings JSONB;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS average_body_battery INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS max_body_battery INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS min_body_battery INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS current_body_battery_level VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS body_battery_readings JSONB;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sleep_body_battery_impact INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS nap_body_battery_impact INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS activity_body_battery_impact INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS recovery_body_battery_impact INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS body_battery_activity_events JSONB;

-- Respiration
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS avg_waking_respiration_value DECIMAL(5,2);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS avg_sleep_respiration_value DECIMAL(5,2);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS highest_respiration_value INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS lowest_respiration_value INTEGER;

-- SpO2
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS avg_spo2 INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS min_spo2 INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS on_demand_readings JSONB;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS sleep_spo2_readings JSONB;

-- User metrics
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS vo2_max DECIMAL(5,1);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS vo2_max_category VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS fitness_age INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS fitness_age_category VARCHAR(50);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS is_enhanced BOOLEAN;

-- Additional metadata
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS summary_id VARCHAR(255);
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS start_time_in_seconds BIGINT;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS start_time_offset_in_seconds INTEGER;
ALTER TABLE garmin_wellness_metrics ADD COLUMN IF NOT EXISTS duration_in_seconds INTEGER;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_garmin_wellness_user_date ON garmin_wellness_metrics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_garmin_wellness_date ON garmin_wellness_metrics(date);
CREATE INDEX IF NOT EXISTS idx_garmin_wellness_user_synced ON garmin_wellness_metrics(user_id, synced_at);

-- ==================== 5. GARMIN SKIN TEMPERATURE TABLE ====================
-- Dedicated table for skin temperature tracking with trend analysis

CREATE TABLE IF NOT EXISTS garmin_skin_temperature (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  avg_temperature DECIMAL(5,2),
  min_temperature DECIMAL(5,2),
  max_temperature DECIMAL(5,2),
  temperature_trend_type VARCHAR(50),
  temperature_readings JSONB,
  summary_id VARCHAR(255),
  start_time_in_seconds BIGINT,
  start_time_offset_in_seconds INTEGER,
  raw_data JSONB,
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_garmin_skin_temp_user_date ON garmin_skin_temperature(user_id, date);
CREATE INDEX IF NOT EXISTS idx_garmin_skin_temp_user ON garmin_skin_temperature(user_id);

-- ==================== 6. GARMIN BLOOD PRESSURE TABLE ====================
-- Dedicated table for blood pressure readings with health classification

CREATE TABLE IF NOT EXISTS garmin_blood_pressure (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  systolic INTEGER,
  diastolic INTEGER,
  pulse INTEGER,
  source_type VARCHAR(50),
  health_classification VARCHAR(50),
  summary_id VARCHAR(255),
  measurement_time_in_seconds BIGINT,
  measurement_time_offset_in_seconds INTEGER,
  raw_data JSONB,
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garmin_blood_pressure_user_date ON garmin_blood_pressure(user_id, date);
CREATE INDEX IF NOT EXISTS idx_garmin_blood_pressure_user ON garmin_blood_pressure(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_blood_pressure_date ON garmin_blood_pressure(date);

-- ==================== 7. GARMIN MOVEIQ TABLE ====================
-- Activity classification from MoveIQ AI

CREATE TABLE IF NOT EXISTS garmin_move_iq (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  summary_id VARCHAR(255),
  calendar_date DATE,
  start_time_in_seconds BIGINT,
  duration_in_seconds INTEGER,
  activity_type VARCHAR(100),
  activity_sub_type VARCHAR(100),
  start_time_offset_in_seconds INTEGER,
  raw_data JSONB,
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garmin_move_iq_user_date ON garmin_move_iq(user_id, date);
CREATE INDEX IF NOT EXISTS idx_garmin_move_iq_user ON garmin_move_iq(user_id);

-- ==================== 8. GARMIN EPOCHS RAW TABLE ====================
-- Raw minute-by-minute activity data (7-day retention)

CREATE TABLE IF NOT EXISTS garmin_epochs_raw (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  epoch_time_in_seconds BIGINT,
  activity_type VARCHAR(100),
  intensity_level VARCHAR(50),
  met DECIMAL(5,2),
  mean_motion_intensity DECIMAL(5,2),
  max_motion_intensity DECIMAL(5,2),
  active_kilocalories DECIMAL(8,2),
  steps INTEGER,
  distance_in_meters INTEGER,
  duration_in_seconds INTEGER,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_garmin_epochs_raw_user_date ON garmin_epochs_raw(user_id, date);
CREATE INDEX IF NOT EXISTS idx_garmin_epochs_raw_user ON garmin_epochs_raw(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_epochs_raw_expires ON garmin_epochs_raw(expires_at);

-- ==================== 9. GARMIN EPOCHS AGGREGATE TABLE ====================
-- Daily summaries of epoch data (permanent storage)

CREATE TABLE IF NOT EXISTS garmin_epochs_aggregate (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_sedentary_seconds INTEGER,
  total_active_seconds INTEGER,
  total_highly_active_seconds INTEGER,
  avg_met DECIMAL(5,2),
  peak_met DECIMAL(5,2),
  total_steps INTEGER,
  total_distance_meters INTEGER,
  total_active_kilocalories DECIMAL(8,2),
  activity_type_distribution JSONB,
  intensity_distribution JSONB,
  raw_data JSONB,
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_garmin_epochs_agg_user_date ON garmin_epochs_aggregate(user_id, date);
CREATE INDEX IF NOT EXISTS idx_garmin_epochs_agg_user ON garmin_epochs_aggregate(user_id);

-- ==================== 10. GARMIN HEALTH SNAPSHOTS TABLE ====================
-- Real-time multi-metric 5-second interval data (30-day retention)

CREATE TABLE IF NOT EXISTS garmin_health_snapshots (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  snapshot_time_in_seconds BIGINT,
  hr_min INTEGER,
  hr_max INTEGER,
  hr_avg INTEGER,
  stress_min INTEGER,
  stress_max INTEGER,
  stress_avg INTEGER,
  spo2_min INTEGER,
  spo2_max INTEGER,
  spo2_avg INTEGER,
  respiration_min INTEGER,
  respiration_max INTEGER,
  respiration_avg INTEGER,
  hr_epochs JSONB,
  stress_epochs JSONB,
  spo2_epochs JSONB,
  respiration_epochs JSONB,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_garmin_health_snapshots_user_date ON garmin_health_snapshots(user_id, date);
CREATE INDEX IF NOT EXISTS idx_garmin_health_snapshots_user ON garmin_health_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_health_snapshots_expires ON garmin_health_snapshots(expires_at);

-- ==================== 11. WEBHOOK FAILURE QUEUE TABLE ====================
-- Track failed webhook processing for retry

CREATE TABLE IF NOT EXISTS webhook_failure_queue (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  webhook_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  error VARCHAR(1000),
  retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at TIMESTAMP NOT NULL,
  last_retry_at TIMESTAMP,
  failed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_failure_queue_type ON webhook_failure_queue(webhook_type);
CREATE INDEX IF NOT EXISTS idx_webhook_failure_queue_next_retry ON webhook_failure_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_failure_queue_retry_count ON webhook_failure_queue(retry_count);

-- ==================== 12. CLEANUP POLICIES ====================
-- Enable automatic deletion of old data for storage efficiency

-- For Neon, use a trigger or scheduled job to clean up old data
-- This is a helper comment showing what cleanup should happen:
/*
CLEANUP SCHEDULE:
- garmin_epochs_raw: Delete after 7 days (using expires_at)
- garmin_health_snapshots: Delete after 30 days (using expires_at)
- garmin_skin_temperature: Keep 90 days minimum (delete after 90 days)
- webhook_failure_queue: Delete successfully processed after 7 days
*/

-- ==================== 13. VIEW FOR DAILY WELLNESS SUMMARY ====================
-- Convenient view to get all daily wellness data for a user

CREATE OR REPLACE VIEW wellness_daily_summary AS
SELECT
  gwm.id,
  gwm.user_id,
  gwm.date,
  -- Sleep
  gwm.total_sleep_seconds,
  gwm.deep_sleep_seconds,
  gwm.light_sleep_seconds,
  gwm.rem_sleep_seconds,
  gwm.sleep_score,
  gwm.sleep_quality,
  -- Stress & Body Battery
  gwm.average_stress_level,
  gwm.average_body_battery,
  gwm.current_body_battery_level,
  -- Activity
  gea.total_active_seconds,
  gea.total_active_kilocalories,
  gea.total_steps,
  -- Health Metrics
  gwm.vo2_max,
  gwm.fitness_age,
  gwm.avg_spo2,
  gwm.avg_waking_respiration_value,
  -- Pregnancy/Cycle
  gwm.cycle_status,
  gwm.pregnancy_status,
  gwm.weeks_of_pregnancy,
  -- Skin Temperature
  gst.avg_temperature,
  gst.temperature_trend_type,
  -- Blood Pressure
  gbp.systolic,
  gbp.diastolic,
  gbp.health_classification,
  -- Metadata
  gwm.synced_at
FROM garmin_wellness_metrics gwm
LEFT JOIN garmin_epochs_aggregate gea ON gwm.user_id = gea.user_id AND gwm.date = gea.date
LEFT JOIN garmin_skin_temperature gst ON gwm.user_id = gst.user_id AND gwm.date = gst.date
LEFT JOIN garmin_blood_pressure gbp ON gwm.user_id = gbp.user_id AND gwm.date = gbp.date
ORDER BY gwm.date DESC;

-- ==================== 14. VERIFY ALL TABLES ====================
-- List all created tables (for verification)
/*
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'garmin%'
OR table_name LIKE 'activity_merge%'
OR table_name LIKE 'wellness%'
OR table_name LIKE 'webhook%'
ORDER BY table_name;
*/
