-- ============================================================================
-- PLAN ADAPTATIONS DATABASE MIGRATION
-- Add contextual filtering support for run-specific and workout-specific
-- adaptations
-- ============================================================================

-- Step 1: Add new columns to plan_adaptations table
-- ============================================================================

ALTER TABLE plan_adaptations ADD COLUMN run_record_id VARCHAR(36) NULL COMMENT 'FK to runs table - populated when adaptation is result of run analysis';

ALTER TABLE plan_adaptations ADD COLUMN planned_workout_id VARCHAR(36) NULL COMMENT 'FK to planned_workouts table - populated when adaptation is result of workout completion';


-- Step 2: Create indexes for query performance
-- ============================================================================

-- Index for filtering by run_record_id
ALTER TABLE plan_adaptations ADD INDEX idx_run_record_id (run_record_id);

-- Index for filtering by planned_workout_id
ALTER TABLE plan_adaptations ADD INDEX idx_planned_workout_id (planned_workout_id);

-- Composite indexes for common query patterns
ALTER TABLE plan_adaptations ADD INDEX idx_combo_run_status (run_record_id, status);

ALTER TABLE plan_adaptations ADD INDEX idx_combo_workout_status (planned_workout_id, status);

-- Update composite index for plan-level filtering
ALTER TABLE plan_adaptations ADD INDEX idx_combo_plan_status_filter (training_plan_id, run_record_id, planned_workout_id, status);


-- Step 3: Add foreign key constraints (if enforcing referential integrity)
-- ============================================================================
-- OPTIONAL: Uncomment if you want to enforce foreign key relationships
-- Note: Make sure runs and planned_workouts tables exist and have ON DELETE CASCADE

/*
ALTER TABLE plan_adaptations 
ADD CONSTRAINT fk_plan_adaptations_run_record_id 
FOREIGN KEY (run_record_id) REFERENCES runs(id) ON DELETE CASCADE;

ALTER TABLE plan_adaptations 
ADD CONSTRAINT fk_plan_adaptations_planned_workout_id 
FOREIGN KEY (planned_workout_id) REFERENCES planned_workouts(id) ON DELETE CASCADE;
*/


-- Step 4: Verification queries
-- ============================================================================

-- Verify columns were added
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'plan_adaptations' 
  AND COLUMN_NAME IN ('run_record_id', 'planned_workout_id');

-- Verify indexes were created
SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_NAME = 'plan_adaptations'
  AND INDEX_NAME LIKE 'idx_%'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;


-- Step 5: Sample data for testing (optional)
-- ============================================================================

-- Plan-level adaptation (no run or workout)
INSERT INTO plan_adaptations (
    id, 
    training_plan_id, 
    run_record_id, 
    planned_workout_id, 
    adaptation_date, 
    reason, 
    status, 
    ai_suggestion, 
    changes
) VALUES (
    UUID(),
    'plan-123',
    NULL,
    NULL,
    NOW(),
    'missed_workout',
    'pending',
    'You missed Monday\'s workout. Let\'s reschedule.',
    JSON_OBJECT('summary', 'Rescheduling Monday workout')
);

-- Run-specific adaptation
INSERT INTO plan_adaptations (
    id, 
    training_plan_id, 
    run_record_id, 
    planned_workout_id, 
    adaptation_date, 
    reason, 
    status, 
    ai_suggestion, 
    changes
) VALUES (
    UUID(),
    'plan-123',
    'run-456',
    NULL,
    NOW(),
    'run_data_feedback',
    'pending',
    'Great effort on that hill! Let\'s add more elevation next week.',
    JSON_OBJECT('summary', 'Increase elevation in upcoming workouts')
);

-- Workout-specific adaptation
INSERT INTO plan_adaptations (
    id, 
    training_plan_id, 
    run_record_id, 
    planned_workout_id, 
    adaptation_date, 
    reason, 
    status, 
    ai_suggestion, 
    changes
) VALUES (
    UUID(),
    'plan-123',
    NULL,
    'workout-789',
    NOW(),
    'run_data_feedback',
    'pending',
    'Your tempo pace was perfect. Let\'s increase duration.',
    JSON_OBJECT('summary', 'Increase tempo workout duration')
);


-- Step 6: Query examples for different adaptation types
-- ============================================================================

-- Get plan-level adaptations only
SELECT * FROM plan_adaptations
WHERE training_plan_id = 'plan-123'
  AND run_record_id IS NULL
  AND planned_workout_id IS NULL
  AND status = 'pending'
ORDER BY adaptation_date DESC;

-- Get run-specific adaptations
SELECT * FROM plan_adaptations
WHERE run_record_id = 'run-456'
  AND status = 'pending'
ORDER BY adaptation_date DESC;

-- Get workout-specific adaptations
SELECT * FROM plan_adaptations
WHERE planned_workout_id = 'workout-789'
  AND status = 'pending'
ORDER BY adaptation_date DESC;

-- Get all adaptation types for a plan (useful for admin/debugging)
SELECT 
    id,
    training_plan_id,
    run_record_id,
    planned_workout_id,
    reason,
    status,
    adaptation_date,
    CASE 
        WHEN run_record_id IS NOT NULL AND planned_workout_id IS NULL THEN 'Run-Specific'
        WHEN planned_workout_id IS NOT NULL AND run_record_id IS NULL THEN 'Workout-Specific'
        WHEN run_record_id IS NULL AND planned_workout_id IS NULL THEN 'Plan-Level'
        ELSE 'INVALID'
    END AS adaptation_type
FROM plan_adaptations
WHERE training_plan_id = 'plan-123'
ORDER BY adaptation_date DESC;


-- Step 7: Rollback script (if needed)
-- ============================================================================
/*
-- Drop indexes
ALTER TABLE plan_adaptations DROP INDEX idx_run_record_id;
ALTER TABLE plan_adaptations DROP INDEX idx_planned_workout_id;
ALTER TABLE plan_adaptations DROP INDEX idx_combo_run_status;
ALTER TABLE plan_adaptations DROP INDEX idx_combo_workout_status;
ALTER TABLE plan_adaptations DROP INDEX idx_combo_plan_status_filter;

-- Drop foreign key constraints (if you added them)
ALTER TABLE plan_adaptations DROP FOREIGN KEY fk_plan_adaptations_run_record_id;
ALTER TABLE plan_adaptations DROP FOREIGN KEY fk_plan_adaptations_planned_workout_id;

-- Drop columns
ALTER TABLE plan_adaptations DROP COLUMN run_record_id;
ALTER TABLE plan_adaptations DROP COLUMN planned_workout_id;
*/


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- Status: Ready to execute
-- Expected execution time: < 1 second
-- Downtime impact: None (columns are NULL by default)
-- Rollback available: Yes (see Step 7)
-- ============================================================================
