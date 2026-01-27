# ⚡ Quick Start - Database Migration

## TL;DR
You need to add **39 new tables** to Neon.com to support all the new features. Here's the fastest way to do it.

---

## 🚀 5-Minute Setup (Minimum Viable)

### Step 1: Open Neon.com SQL Editor
1. Go to https://console.neon.tech
2. Select your project
3. Click "SQL Editor"

### Step 2: Run This (Copy/Paste)
```sql
-- ====== CORE UPDATES (Required) ======

-- 1. Update runs table
ALTER TABLE runs ADD COLUMN IF NOT EXISTS tss INT DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS gap VARCHAR(20);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_runs_public ON runs(user_id, is_public, start_time DESC);

-- 2. Fitness & Freshness
CREATE TABLE IF NOT EXISTS daily_fitness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    ctl FLOAT NOT NULL,
    atl FLOAT NOT NULL,
    tsb FLOAT NOT NULL,
    training_load INT DEFAULT 0,
    training_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_daily_fitness_user_date ON daily_fitness(user_id, date DESC);
```

### Step 3: Click "Run"
✅ **Done!** You can now track Fitness & Freshness and GAP.

---

## 📊 What Each Feature Needs

| Feature | Tables Needed | Priority | Time |
|---------|---------------|----------|------|
| **Fitness & Freshness** | 2 | 🔴 Critical | 2 min |
| **GAP** | 0 (just column) | 🔴 Critical | 30 sec |
| **Segments** | 3 | 🔴 High | 3 min |
| **Training Plans** | 6 | 🟡 Medium | 5 min |
| **Social Feed** | 8 | 🟢 Low | 8 min |
| **Achievements** | 3 | 🟢 Low | 3 min |

---

## 🎯 Full Migration (30 minutes)

### Option A: Run the Whole File
```bash
# Download the schema
# Copy all content from DATABASE_SCHEMA.sql
# Paste into Neon SQL Editor
# Click Run
# Wait 2-3 minutes
# ✅ Done!
```

### Option B: Incremental (Safer)
```sql
-- Week 1: Core
[Copy/paste Fitness tables]

-- Week 2: Segments
[Copy/paste Segment tables]

-- Week 3: Training
[Copy/paste Training Plan tables]

-- Week 4: Social
[Copy/paste Social Feed tables]
```

---

## 📋 Quick Verification

After running migrations, verify:

```sql
-- Check tables exist
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'daily_fitness',
  'segments',
  'segment_efforts',
  'training_plans'
);

-- Should return 4 (or more)

-- Check runs table updated
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'runs' 
AND column_name IN ('tss', 'gap', 'is_public');

-- Should return 3 rows
```

---

## 🔥 That's It!

**3 files to know:**
1. `DATABASE_SCHEMA.sql` - Full schema (copy/paste into Neon)
2. `DATABASE_MIGRATION_GUIDE.md` - Detailed guide with troubleshooting
3. `QUICK_START.md` - This file!

**Do now:**
1. ✅ Backup database in Neon
2. ✅ Run core tables (5 min)
3. ✅ Test app
4. ✅ Add more features incrementally

**Questions?** Check `DATABASE_MIGRATION_GUIDE.md` for detailed help!

---

## �� Pro Tip

Start with **just Fitness & Freshness** (2 tables). Get that working. Then add features one at a time as you build the UI.

You don't need all 39 tables on day 1! 🚀
