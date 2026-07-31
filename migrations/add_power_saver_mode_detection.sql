-- Add power saver mode detection column to runs table
-- This column tracks whether the user's phone had power saver/low power mode enabled
-- during a run, which can affect GPS accuracy and sensor data quality.

ALTER TABLE runs
ADD COLUMN IF NOT EXISTS power_saver_mode_detected boolean DEFAULT false;

-- Create index for querying runs with power saver mode active
CREATE INDEX IF NOT EXISTS idx_runs_power_saver_mode 
  ON runs(power_saver_mode_detected) 
  WHERE power_saver_mode_detected = true;

-- Add comment for documentation
COMMENT ON COLUMN runs.power_saver_mode_detected IS 
  'Boolean flag indicating whether the phone had power saver/low power mode enabled during this run. When true, GPS updates and sensor data may have been throttled by the OS.';
