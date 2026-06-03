-- Add missing polyline column to segments table
-- This column is required for segment matching to work

ALTER TABLE segments 
ADD COLUMN IF NOT EXISTS polyline TEXT NOT NULL DEFAULT '';

-- Create index for faster segment lookups
CREATE INDEX IF NOT EXISTS idx_segments_location 
ON segments(start_lat, start_lng, end_lat, end_lng);

-- Update any existing segments with a default polyline if needed
-- In production, you may want to regenerate polylines from GPS tracks
UPDATE segments 
SET polyline = '' 
WHERE polyline IS NULL OR polyline = '';

-- Make the column properly required (remove default after migration)
-- ALTER TABLE segments ALTER COLUMN polyline SET NOT NULL;
