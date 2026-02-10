-- ========================================
-- FIX PRODUCTION DATABASE
-- Run this in Neon PostgreSQL Console
-- Date: February 6, 2026
-- ========================================

-- 1. CREATE SEGMENT_POPULARITY TABLE (fixes route generation)
CREATE TABLE IF NOT EXISTS segment_popularity (
  id SERIAL PRIMARY KEY,
  osm_way_id BIGINT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  avg_rating DECIMAL(3, 2) DEFAULT NULL,
  last_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_segment_popularity_osm_way_id 
ON segment_popularity(osm_way_id);

CREATE INDEX IF NOT EXISTS idx_segment_popularity_run_count 
ON segment_popularity(run_count DESC);

CREATE INDEX IF NOT EXISTS idx_segment_popularity_last_used 
ON segment_popularity(last_used DESC);

-- 2. CREATE GOALS TABLE (fixes goals feature)
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  target_date DATE,
  event_name TEXT,
  event_location TEXT,
  distance_target DECIMAL(10, 2),
  time_target_seconds INTEGER,
  health_target TEXT,
  weekly_run_target INTEGER,
  status TEXT DEFAULT 'active',
  progress_percent INTEGER DEFAULT 0,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_target_date ON goals(target_date);

-- 3. VERIFY TABLES EXIST
SELECT 
  'segment_popularity' as table_name,
  COUNT(*) as row_count
FROM segment_popularity
UNION ALL
SELECT 
  'goals' as table_name,
  COUNT(*) as row_count
FROM goals;

-- Expected output:
-- table_name           | row_count
-- segment_popularity   | 0
-- goals                | 0
-- (Both tables exist but are empty)
