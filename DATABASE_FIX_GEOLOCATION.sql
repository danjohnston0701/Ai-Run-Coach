-- =====================================================
-- FIX: Segment Geolocation Index Without PostGIS
-- =====================================================

-- Option 1: Try to enable PostGIS extension (might not be available on all Neon plans)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- If that works, then run:
CREATE INDEX IF NOT EXISTS idx_segments_location ON segments USING GIST (
    ll_to_earth(start_lat, start_lng)
);

-- =====================================================
-- Option 2: Use regular B-tree indexes instead (works on all plans)
-- =====================================================

-- If PostGIS is not available, drop the failed index and use these instead:
DROP INDEX IF EXISTS idx_segments_location;

-- Create separate indexes for lat and lng
CREATE INDEX IF NOT EXISTS idx_segments_start_lat ON segments(start_lat);
CREATE INDEX IF NOT EXISTS idx_segments_start_lng ON segments(start_lng);
CREATE INDEX IF NOT EXISTS idx_segments_end_lat ON segments(end_lat);
CREATE INDEX IF NOT EXISTS idx_segments_end_lng ON segments(end_lng);

-- Create composite index for bounding box queries (more efficient)
CREATE INDEX IF NOT EXISTS idx_segments_bounds ON segments(start_lat, start_lng, end_lat, end_lng);

-- =====================================================
-- Option 3: Use PostgreSQL's built-in point and distance operators
-- =====================================================

-- Add a point column for efficient distance queries
ALTER TABLE segments ADD COLUMN IF NOT EXISTS start_point POINT;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS end_point POINT;

-- Populate the point columns from existing lat/lng
UPDATE segments 
SET start_point = point(start_lng, start_lat),
    end_point = point(end_lng, end_lat);

-- Create GIST index on points (native PostgreSQL, no extension needed)
CREATE INDEX IF NOT EXISTS idx_segments_start_point ON segments USING GIST(start_point);
CREATE INDEX IF NOT EXISTS idx_segments_end_point ON segments USING GIST(end_point);

-- Now you can query nearby segments with:
-- SELECT * FROM segments 
-- WHERE start_point <-> point(-122.4194, 37.7749) < 0.1  -- within ~11km
-- ORDER BY start_point <-> point(-122.4194, 37.7749)
-- LIMIT 10;

-- =====================================================
-- RECOMMENDED: Use Option 2 (Regular Indexes)
-- =====================================================
-- It's the simplest and works everywhere.
-- Distance calculations will be done in your backend code.
