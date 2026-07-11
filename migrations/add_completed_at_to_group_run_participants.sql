-- Add completed_at column to track when participants finish their runs
ALTER TABLE group_run_participants
ADD COLUMN completed_at TIMESTAMP DEFAULT NULL;

-- Create index for faster queries on completion status
CREATE INDEX idx_group_run_participants_completed_at 
ON group_run_participants(group_run_id, completed_at);
