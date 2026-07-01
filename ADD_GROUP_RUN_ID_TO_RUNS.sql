-- =============================================================================
-- Add group_run_id column to runs table for group run linking
-- Safe to run multiple times (uses IF NOT EXISTS)
-- =============================================================================

-- Add group_run_id column to runs table
ALTER TABLE runs ADD COLUMN IF NOT EXISTS group_run_id VARCHAR(255);

-- Add foreign key constraint to group_runs table
ALTER TABLE runs ADD CONSTRAINT fk_runs_group_run_id 
  FOREIGN KEY (group_run_id) REFERENCES group_runs(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_runs_group_run_id ON runs(group_run_id);

-- =============================================================================
-- Notes:
-- - ON DELETE SET NULL: If a group run is deleted, the run's group_run_id becomes null
-- - This allows orphaned runs to stay in the database without breaking referential integrity
-- - DEFERRABLE INITIALLY DEFERRED: Allows multiple updates in a transaction before checking
-- =============================================================================
