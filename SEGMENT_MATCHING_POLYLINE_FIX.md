# Segment Matching Error: Missing Polyline Column

## Error

```
Error matching segments: error: column "polyline" does not exist
code: '42703'
```

This occurs when running segment matching against a user's GPS track.

---

## Root Cause

The **schema defines** a `polyline` column in the segments table (shared/schema.ts:1174), but the **actual Neon database table doesn't have this column**.

The code tries to:
```typescript
const candidateSegments = await db
  .select()        // ← Selects ALL columns including polyline
  .from(segments)  // ← But polyline doesn't exist in DB
```

---

## Solution

**Run this migration in Neon:**

```sql
ALTER TABLE segments 
ADD COLUMN IF NOT EXISTS polyline TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_segments_location 
ON segments(start_lat, start_lng, end_lat, end_lng);
```

**Migration file**: `ADD_SEGMENTS_POLYLINE_COLUMN.sql`

---

## Steps to Fix

1. **Go to Neon Console**
2. **Open SQL Editor**
3. **Copy and paste** the SQL from `ADD_SEGMENTS_POLYLINE_COLUMN.sql`
4. **Execute the migration**
5. **Restart the backend** in Replit
6. **Test**: Wayne completes a run → segment matching should work ✅

---

## What This Does

✅ **Adds missing polyline column** to segments table  
✅ **Adds index** for faster segment location lookups  
✅ **Prevents database errors** when selecting segments  
✅ **Segment matching works** for all future runs  

---

## Why This Happened

The segments feature (for tracking PRs on popular running routes) was added to the schema but the migration to update the actual database wasn't run in Neon.

---

## Impact

- Currently: **Segment matching fails** → Achievements don't calculate for segments
- After fix: **Segment matching works** → Users get KOM/PR/Top 10 achievements on segments

---

## Testing After Fix

After running the migration:
1. Have a test user complete a run with GPS track
2. Check logs for: `[Segment Matching] Found X candidate segments`
3. Should see achievements calculated for matched segments
4. No more "column polyline does not exist" errors ✅

---

## Files Involved

| File | Change |
|------|--------|
| `ADD_SEGMENTS_POLYLINE_COLUMN.sql` | NEW - Migration to add column |
| `shared/schema.ts` | Already defines polyline (no change needed) |
| `server/segment-matching-service.ts` | Already uses polyline (no change needed) |

---

**Status**: Ready to execute migration 🚀
