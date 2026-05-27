-- Migration: Add injury_side column to goals table
-- 
-- Stores which side of a bilateral body part was injured (left, right, both).
-- Applies to: knee, ankle, shoulder, hip, foot (has multiple toes)

ALTER TABLE goals ADD COLUMN IF NOT EXISTS injury_side TEXT;

-- Backfill: if an injury exists but side is not set, assume "both" as conservative default
UPDATE goals 
SET injury_side = 'both'
WHERE injury_body_part IS NOT NULL AND injury_side IS NULL;
