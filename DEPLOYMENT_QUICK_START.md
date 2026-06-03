# Deployment Quick Start - Terry's Run Issue Fix

## What to Deploy

1. **iOS App Updates** (iOS Agent handled)
   - ISO8601 date encoding
   - Explicit distance/duration fields

2. **Backend Code** (Already committed in this session)
   - Distance validation & conversion
   - Robust date parsing
   - Type guards for elevation data
   - Graceful error handling

3. **Database Migration** (REQUIRED - Run this first)

---

## Step 1: Create the Missing Table in Neon

**Copy and paste this SQL into Neon console:**

```sql
-- Create the missing coaching_session_events table
CREATE TABLE IF NOT EXISTS coaching_session_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  run_id varchar NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  planned_workout_id varchar REFERENCES planned_workouts(id),
  event_type text NOT NULL,
  event_phase text,
  coaching_message text,
  coaching_audio_url text,
  user_metrics jsonb,
  tone_used text,
  user_engagement text,
  triggered_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_coaching_session_events_run_id 
  ON coaching_session_events(run_id);

CREATE INDEX IF NOT EXISTS idx_coaching_session_events_workout_id 
  ON coaching_session_events(planned_workout_id);

CREATE INDEX IF NOT EXISTS idx_coaching_session_events_triggered_at 
  ON coaching_session_events(triggered_at);
```

**To run it:**
1. Go to https://console.neon.tech
2. Select your AI Run Coach database
3. Click "SQL Editor"
4. Paste the SQL above
5. Click "Execute"
6. You should see: "CREATE TABLE" and "CREATE INDEX" success messages

---

## Step 2: Deploy Backend Code

Push the commits containing:
- `server/routes.ts` - Distance validation + date parsing
- `server/ai-service.ts` - Type guards
- `server/training-plan-service.ts` - Error handling
- `server/routes-session-coaching.ts` - Table checks

---

## Step 3: Deploy iOS App

Push iOS updates containing:
- ISO8601 date encoding in `NetworkManager`
- Explicit `distance` and `duration` fields in requests
- Applied to `HomeScreens.swift` and `WatchRunSyncManager.swift`

---

## Step 4: Verify Deployment

**Check the logs after first test run:**

```
[POST /api/runs] Distance handling — received distance: 5.43km
[POST /api/runs] Date fields — startedAt: 2026-05-31T10:07:05.000Z, completedAt: 2026-05-31T10:15:30.000Z
[POST /api/runs] Run created successfully with ID: xxx
[Plan Reassessment] Reassessing plan xxx with run data
✅ Plan reassessment completed for user xxx
```

If you see these, everything is working! ✅

---

## Rollback Plan (if needed)

The `IF NOT EXISTS` clause makes everything safe:
- Running the migration multiple times is fine
- Code changes are backwards compatible
- No data loss risk

---

## Summary of Fixed Issues

| Issue | Fix | Status |
|-------|-----|--------|
| Zero-distance run crash | Backend validation | ✅ |
| iOS date format mismatch | ISO8601 encoding + parsing | ✅ |
| Missing distance field | Explicit field + conversion | ✅ |
| Coaching crashes | Type guards for elevation | ✅ |
| Missing DB table | SQL migration + error handling | ✅ |

---

## Questions?

Check these docs for details:
- `COMPLETE_TERRY_ISSUE_RESOLUTION.md` - Full analysis
- `IOS_RUN_UPLOAD_FIXES.md` - iOS-specific details
- `TERRY_RUN_NOT_FOUND_FIX.md` - Backend issue details

