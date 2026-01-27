# 🗄️ Database Migration Guide for Neon.com

## Overview
You need to add **12 new table categories** plus updates to existing tables. This guide shows you exactly what to run and in what order.

---

## 📊 Summary of Changes

### New Tables: **39 tables total**
- Fitness & Freshness: 2 tables
- Segments & Leaderboards: 3 tables
- Training Plans: 6 tables
- Social Feed: 3 tables
- Clubs: 2 tables
- Challenges: 2 tables
- Achievements: 2 tables
- Notifications: 1 table

### Modified Tables:
- `runs` table: Add 4 new columns

### New Indexes: **25 indexes**
### New Views: **3 views**
### New Functions: **2 functions**

---

## 🚀 Step-by-Step Migration

### STEP 1: Backup Your Database
```sql
-- In Neon.com dashboard:
-- 1. Go to your project
-- 2. Click "Backups"
-- 3. Create manual backup
-- 4. Wait for completion before proceeding
```

### STEP 2: Run Core Schema (Required for MVP)
These are CRITICAL for basic functionality:

```sql
-- 1. Update existing runs table
ALTER TABLE runs ADD COLUMN IF NOT EXISTS tss INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS gap VARCHAR(20);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS kudos_count INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_runs_public ON runs(user_id, is_public, start_time DESC);

-- 2. Fitness & Freshness tables
CREATE TABLE daily_fitness (...);  -- See DATABASE_SCHEMA.sql
CREATE TABLE fitness_summary (...);
```

### STEP 3: Run Segments Schema (High Priority)
```sql
CREATE TABLE segments (...);
CREATE TABLE segment_efforts (...);
CREATE TABLE segment_stars (...);

-- Don't forget the indexes!
CREATE INDEX idx_segments_location ON segments USING GIST (ll_to_earth(start_lat, start_lng));
-- ... etc
```

### STEP 4: Run Training Plans Schema (Medium Priority)
```sql
CREATE TABLE training_plans (...);
CREATE TABLE plan_enrollments (...);
CREATE TABLE weekly_plans (...);
CREATE TABLE planned_workouts (...);
CREATE TABLE workout_completions (...);
CREATE TABLE plan_adaptations (...);
```

### STEP 5: Run Social Schema (Can wait for V2)
```sql
CREATE TABLE feed_activities (...);
CREATE TABLE reactions (...);
CREATE TABLE activity_comments (...);
CREATE TABLE comment_likes (...);
CREATE TABLE clubs (...);
CREATE TABLE club_memberships (...);
CREATE TABLE challenges (...);
CREATE TABLE challenge_participants (...);
```

### STEP 6: Run Achievements & Notifications
```sql
CREATE TABLE achievements (...);
CREATE TABLE user_achievements (...);
CREATE TABLE notifications (...);

-- Insert achievement definitions
INSERT INTO achievements VALUES (...);
```

### STEP 7: Create Views & Functions
```sql
CREATE OR REPLACE VIEW current_fitness_view AS ...;
CREATE OR REPLACE VIEW segment_leaderboard_view AS ...;
CREATE OR REPLACE VIEW activity_feed_view AS ...;

CREATE OR REPLACE FUNCTION update_segment_ranks(...) ...;
CREATE OR REPLACE FUNCTION update_challenge_progress(...) ...;
```

---

## 🎯 Quick Start (Minimum Viable Product)

If you want to launch quickly, just run these first:

```sql
-- PHASE 1: CORE (Do this NOW)
-- 1. runs table updates
ALTER TABLE runs ADD COLUMN IF NOT EXISTS tss INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS gap VARCHAR(20);

-- 2. Fitness tracking
CREATE TABLE daily_fitness (...);
CREATE TABLE fitness_summary (...);

-- DONE! You can now:
-- ✅ Track TSS
-- ✅ Calculate Fitness & Freshness
-- ✅ Show GAP
```

Then add features incrementally:

```sql
-- PHASE 2: COMPETITION (Week 2)
CREATE TABLE segments (...);
CREATE TABLE segment_efforts (...);

-- PHASE 3: TRAINING (Week 3-4)
CREATE TABLE training_plans (...);
CREATE TABLE plan_enrollments (...);

-- PHASE 4: SOCIAL (Week 5-6)
CREATE TABLE feed_activities (...);
CREATE TABLE reactions (...);
```

---

## 📝 SQL File Execution in Neon.com

### Method 1: Neon.com SQL Editor (Recommended)
1. Login to Neon.com
2. Select your project
3. Click "SQL Editor"
4. Copy/paste sections from `DATABASE_SCHEMA.sql`
5. Click "Run" for each section
6. Verify "Query succeeded" message

### Method 2: psql CLI
```bash
# Get connection string from Neon.com
psql "postgresql://user:pass@host/dbname?sslmode=require"

# Run the SQL file
\i /path/to/DATABASE_SCHEMA.sql

# Or run specific sections
\i /path/to/fitness_tables.sql
```

### Method 3: Code Migration (Cleanest)
Create a migration script in your backend:

```javascript
// migrations/001_add_fitness_tables.js
exports.up = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS daily_fitness (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      // ... rest of schema
    );
  `);
};

exports.down = async (db) => {
  await db.query(`DROP TABLE IF EXISTS daily_fitness CASCADE;`);
};
```

---

## ✅ Verification Checklist

After migration, verify everything worked:

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Should see:
-- - daily_fitness
-- - fitness_summary
-- - segments
-- - segment_efforts
-- - training_plans
-- - ... etc (39 total)

-- Check indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Check views
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public';

-- Should see:
-- - current_fitness_view
-- - segment_leaderboard_view
-- - activity_feed_view

-- Check functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION';

-- Should see:
-- - update_segment_ranks
-- - update_challenge_progress
```

---

## 🔧 Common Issues & Solutions

### Issue 1: "relation already exists"
**Solution:** Table already created. Safe to skip.
```sql
-- Add IF NOT EXISTS to all CREATE statements
CREATE TABLE IF NOT EXISTS daily_fitness (...);
```

### Issue 2: "column already exists"
**Solution:** Column already added. Safe to skip.
```sql
-- Add IF NOT EXISTS to ALTER statements
ALTER TABLE runs ADD COLUMN IF NOT EXISTS tss INT DEFAULT 0;
```

### Issue 3: "foreign key constraint violation"
**Solution:** Create tables in correct order.
```sql
-- ALWAYS create parent tables first!
-- 1. users (should already exist)
-- 2. runs (should already exist)
-- 3. Then segments, training_plans, etc.
```

### Issue 4: "permission denied"
**Solution:** Ensure you're using the owner/admin account in Neon.
```sql
-- Check your role
SELECT current_user;

-- Should be the database owner
```

### Issue 5: PostGIS extension not available
**Solution:** For segment geolocation, you might need PostGIS
```sql
-- Create extension (if available)
CREATE EXTENSION IF NOT EXISTS postgis;

-- If not available, remove the GIST index line and use regular indexes
-- CREATE INDEX idx_segments_location ON segments(start_lat, start_lng);
```

---

## 📊 Data Migration (Historical Data)

After creating tables, you need to populate historical data:

### 1. Calculate TSS for existing runs
```sql
-- Update TSS for all existing runs
-- Formula: duration (hours) × intensity × distance_multiplier
UPDATE runs
SET tss = (
  EXTRACT(EPOCH FROM duration) / 3600 * 
  CASE 
    WHEN average_hr > 170 THEN 1.5
    WHEN average_hr > 150 THEN 1.2
    ELSE 1.0
  END *
  (distance / 1000)
)::INT
WHERE tss = 0 OR tss IS NULL;
```

### 2. Calculate historical fitness
```sql
-- Calculate fitness for the past 90 days for all users
-- This should be done via backend API call to:
-- POST /api/fitness/calculate-historical

-- Or run a script:
-- node scripts/calculate-historical-fitness.js
```

### 3. Detect segments from existing runs
```sql
-- This requires backend processing
-- POST /api/segments/detect-from-historical-runs

-- Or run a script:
-- node scripts/detect-historical-segments.js
```

---

## 🎯 Rollback Plan

If something goes wrong:

```sql
-- Drop new tables in reverse order (most dependencies first)
DROP TABLE IF EXISTS comment_likes CASCADE;
DROP TABLE IF EXISTS activity_comments CASCADE;
DROP TABLE IF EXISTS reactions CASCADE;
DROP TABLE IF EXISTS feed_activities CASCADE;

DROP TABLE IF EXISTS challenge_participants CASCADE;
DROP TABLE IF EXISTS challenges CASCADE;

DROP TABLE IF EXISTS club_memberships CASCADE;
DROP TABLE IF EXISTS clubs CASCADE;

DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;

DROP TABLE IF EXISTS notifications CASCADE;

DROP TABLE IF EXISTS plan_adaptations CASCADE;
DROP TABLE IF EXISTS workout_completions CASCADE;
DROP TABLE IF EXISTS planned_workouts CASCADE;
DROP TABLE IF EXISTS weekly_plans CASCADE;
DROP TABLE IF EXISTS plan_enrollments CASCADE;
DROP TABLE IF EXISTS training_plans CASCADE;

DROP TABLE IF EXISTS segment_stars CASCADE;
DROP TABLE IF EXISTS segment_efforts CASCADE;
DROP TABLE IF EXISTS segments CASCADE;

DROP TABLE IF EXISTS fitness_summary CASCADE;
DROP TABLE IF EXISTS daily_fitness CASCADE;

-- Remove added columns from runs
ALTER TABLE runs DROP COLUMN IF EXISTS tss;
ALTER TABLE runs DROP COLUMN IF EXISTS gap;
ALTER TABLE runs DROP COLUMN IF EXISTS is_public;
ALTER TABLE runs DROP COLUMN IF EXISTS kudos_count;
ALTER TABLE runs DROP COLUMN IF EXISTS comment_count;

-- Drop views
DROP VIEW IF EXISTS current_fitness_view;
DROP VIEW IF EXISTS segment_leaderboard_view;
DROP VIEW IF EXISTS activity_feed_view;

-- Drop functions
DROP FUNCTION IF EXISTS update_segment_ranks;
DROP FUNCTION IF EXISTS update_challenge_progress;
```

---

## 📈 Performance Optimization

After migration, optimize for performance:

```sql
-- Analyze tables to update statistics
ANALYZE daily_fitness;
ANALYZE segments;
ANALYZE segment_efforts;
ANALYZE feed_activities;

-- Vacuum to reclaim space
VACUUM ANALYZE;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 🚀 Estimated Migration Time

| Phase | Tables | Time | Can Run Async? |
|-------|--------|------|----------------|
| Prep & Backup | - | 5 min | No |
| Core (runs, fitness) | 2 | 2 min | No |
| Segments | 3 | 3 min | No |
| Training Plans | 6 | 5 min | Yes |
| Social | 8 | 8 min | Yes |
| Achievements | 3 | 3 min | Yes |
| Views & Functions | 5 | 2 min | Yes |
| Verification | - | 3 min | No |
| **TOTAL** | **27** | **~30 min** | - |

**Historical data population: 1-2 hours** (run overnight)

---

## 📞 Need Help?

### Neon.com Support
- Docs: https://neon.tech/docs
- Discord: https://discord.gg/neon
- Email: support@neon.tech

### PostgreSQL Resources
- Migration guide: https://www.postgresql.org/docs/current/sql-commands.html
- Indexes: https://www.postgresql.org/docs/current/indexes.html

---

## ✅ Final Checklist

Before deploying to production:

- [ ] Backup created
- [ ] All tables created successfully
- [ ] All indexes created
- [ ] All views created
- [ ] All functions created
- [ ] `runs` table updated with new columns
- [ ] Verification queries passed
- [ ] Historical TSS calculated
- [ ] Performance optimization run
- [ ] Backend updated to use new tables
- [ ] API endpoints tested
- [ ] Mobile app tested with new data

---

## 🎯 Summary

**YES**, you need significant database updates for all the new features:

1. **39 new tables**
2. **4 new columns** in existing `runs` table
3. **25 new indexes** for performance
4. **3 views** for common queries
5. **2 functions** for complex calculations

**Good news:** You can do it incrementally!

Start with Fitness & Freshness (2 tables), then add Segments, then Training Plans, then Social features.

The full `DATABASE_SCHEMA.sql` file is ready to run in Neon.com. Just copy/paste into SQL Editor and execute! 🚀
