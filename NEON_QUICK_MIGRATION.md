# 🚀 Neon Quick Migration (Copy & Paste)

## TL;DR: Just Run This

Go to your **Neon Console** → **SQL Editor** → Paste this entire block:

```sql
-- Add Running Power columns to runs table
ALTER TABLE runs
ADD COLUMN IF NOT EXISTS avg_running_power INTEGER,
ADD COLUMN IF NOT EXISTS max_running_power INTEGER,
ADD COLUMN IF NOT EXISTS running_power_data jsonb;

-- Add Respiration Rate columns to runs table
ALTER TABLE runs
ADD COLUMN IF NOT EXISTS avg_respiration_rate REAL,
ADD COLUMN IF NOT EXISTS respiration_rate_data jsonb;

-- Add Power & Respiration columns to watch_biometric_samples table
ALTER TABLE watch_biometric_samples
ADD COLUMN IF NOT EXISTS running_power INTEGER,
ADD COLUMN IF NOT EXISTS respiration_rate REAL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_runs_avg_running_power ON runs(avg_running_power)
  WHERE avg_running_power IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_runs_avg_respiration_rate ON runs(avg_respiration_rate)
  WHERE avg_respiration_rate IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_watch_biometrics_running_power ON watch_biometric_samples(running_power)
  WHERE running_power IS NOT NULL;
```

**Then verify it worked:**

```sql
SELECT COUNT(*) FROM information_schema.columns 
WHERE table_name = 'runs' 
AND column_name IN ('avg_running_power', 'avg_respiration_rate');
```

Should return: `5` (the 5 new columns)

---

## That's It! ✅

The database is now ready to receive power and respiration data from Garmin watches (Fenix 7+, FR965).
