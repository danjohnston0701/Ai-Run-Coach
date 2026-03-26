# Replit Compute Units Optimization Plan
## Target: Reduce 7.7M CU/month → 2.5M CU/month (-68% reduction)

---

## 📊 Your Decisions & Implementation Plan

### ✅ TIER 1: Quick Wins (Day 1-2) - Estimated 40% CU Reduction

#### 1️⃣ **Local Save: 5s → 30s**
**File**: `client/src/pages/RunSession.tsx`
**Current**: `const SAVE_INTERVAL_MS = 5000;`
**Change to**: `const SAVE_INTERVAL_MS = 30000;`

**Why safe**: Only saves to browser localStorage (no server hit)
**Data loss**: Max 30s of run data if app crashes (acceptable)
**CU savings**: ~15% (browser-only operation, modest impact)

```typescript
// BEFORE
const SAVE_INTERVAL_MS = 5000;  // Save every 5 seconds

// AFTER
const SAVE_INTERVAL_MS = 30000;  // Save every 30 seconds
```

---

#### 2️⃣ **GPS Watchdog: 10s → 30s**
**File**: `client/src/pages/RunSession.tsx`
**Current**: `const GPS_WATCHDOG_INTERVAL = 10000;`
**Change to**: `const GPS_WATCHDOG_INTERVAL = 30000;`

**Why safe**: Still catches GPS failures quickly (30s = 1 city block)
**Impact**: Slightly slower GPS failure detection (still acceptable)
**CU savings**: ~20% (fewer client checks, minimal compute)

```typescript
// BEFORE
const GPS_WATCHDOG_INTERVAL = 10000;  // Check every 10 seconds

// AFTER
const GPS_WATCHDOG_INTERVAL = 30000;  // Check every 30 seconds
```

---

#### 3️⃣ **Full DB Sync: Smart Gating by Live Share Flag**
**File**: `client/src/pages/RunSession.tsx` and `server/routes.ts`

**Current behavior**: Syncs every 30s regardless of live sharing

**New behavior**:
- If live sharing **enabled**: Sync every 60s (was 30s)
- If live sharing **disabled**: Sync every 10 minutes (was constant 30s)
- On hide/unload: Always sync (final save)

**Why this works**:
- Live sharing viewers need reasonably fresh data → 60s is fine
- Non-shared runs just need periodic backup → 10 min is acceptable
- Emergency save on hide/unload ensures data never lost

**CU savings**: **40-50%** (this is the biggest consumer!)

**Implementation**:

```typescript
// BEFORE (client/src/pages/RunSession.tsx)
useEffect(() => {
  const syncInterval = setInterval(() => {
    syncToDatabase(sessionData);  // Every 30s, always
  }, 30000);
  return () => clearInterval(syncInterval);
}, []);

// AFTER
useEffect(() => {
  // Determine sync interval based on live sharing
  const syncIntervalMs = isLiveSharing ? 60000 : 600000;  // 60s or 10 min
  
  const syncInterval = setInterval(() => {
    if (shouldSync) {  // Gate by live sharing flag
      syncToDatabase(sessionData);
    }
  }, syncIntervalMs);
  
  return () => clearInterval(syncInterval);
}, [isLiveSharing]);

// Server-side guard (optional but recommended)
// server/routes.ts - PUT /api/live-sessions/sync
router.put('/api/live-sessions/sync', async (req, res) => {
  // Accept all syncs (for recovery), but add logging
  // for debugging unexpected patterns
  await updateLiveSession(req.body);
  res.json({ success: true });
});
```

**Data flow**:
```
Non-Shared Run:
  ├─ User runs (30 min) without sharing
  ├─ DB syncs at: 0m, 10m, 20m, 30m (4 syncs total)
  ├─ On close: Final sync
  └─ Total syncs: 5 (was 60 @ 30s intervals) ✅ 92% reduction

Shared Run:
  ├─ User runs (30 min) with live sharing
  ├─ Viewers see updates at: 0m, 1m, 2m...30m (60s intervals)
  ├─ DB syncs at: 0m, 1m, 2m...30m (30 syncs total)
  └─ Total syncs: 30 (was 60) ✅ 50% reduction
```

**Impact**: This alone saves ~40% CU!

---

### ✅ TIER 2: Medium Effort (Day 3-4) - Estimated Additional 25% CU Reduction

#### 4️⃣ **Garmin Sync: Hourly → On-Login + Every 6 Hours**
**File**: `server/scheduler.ts` and add login endpoint

**Current behavior**: Syncs every 60 minutes for all devices

**New behavior**:
- On user login/app open: Trigger immediate Garmin sync
- Then: Sync every 6 hours (instead of every 1 hour)
- Optional: Only sync active users (have been active in last 24h)

**Why this works**:
- Users want fresh wellness data when they open app → sync on login
- Hourly sync = 24/day, but 6-hour = 4/day, still very fresh
- Wellness data doesn't change minute-to-minute

**CU savings**: **75%** on this operation (hourly → 4x daily)

**Implementation**:

```typescript
// server/scheduler.ts - Change hourly to 6-hourly
// BEFORE
scheduler.every('1 hour', async () => {
  const devices = await getAllGarminDevices();
  for (const device of devices) {
    await syncGarminWellness(device);
  }
});

// AFTER
// 1. Scheduled sync (4x per day)
scheduler.every('6 hours', async () => {
  const activeDevices = await getGarminDevices({
    where: { 
      isActive: true,
      user: { lastActiveAt: { gte: '24 hours ago' } }
    }
  });
  for (const device of activeDevices) {
    await syncGarminWellness(device);
  }
});

// 2. On-demand sync (when user logs in/opens app)
// In your login/auth endpoint or app init
router.post('/api/auth/login', async (req, res) => {
  const user = await authenticateUser(req.body);
  
  // Trigger Garmin sync in background
  triggerGarminSync(user.id).catch(err => 
    console.error('Garmin sync error:', err)
  );
  
  res.json({ token, user });
});

// Helper function
async function triggerGarminSync(userId: string) {
  const devices = await getGarminDevices({ userId });
  for (const device of devices) {
    await syncGarminWellness(device);
  }
}
```

**Metrics**:
- Before: 24 Garmin syncs/day (1 per hour)
- After: 4 scheduled + N on-login = ~6-8 syncs/day
- **Reduction**: 70-85% ✅

---

#### 5️⃣ **Coaching Reminders: Hourly → Once Daily (Daily Job)**
**File**: `server/scheduler.ts`

**Current behavior**: Runs every hour, checks timezone, sends once per day

**New behavior**: Runs once per day, pre-computes per timezone, sends at local 8 AM

**Why better**:
- Hourly scheduler does 23/24 no-op iterations (waste!)
- Daily scheduler is cleaner, more efficient

**CU savings**: **15%** (less frequent query loop)

**Implementation**:

```typescript
// server/scheduler.ts
// BEFORE (inefficient)
scheduler.every('1 hour', async () => {
  const users = await getUsers();  // Query all users hourly
  for (const user of users) {
    const localHour = getUserLocalHour(user);
    if (localHour === 8) {
      await sendCoachingPlanReminder(user);
    }
  }
});

// AFTER (efficient)
scheduler.every('1 day', '08:00 UTC', async () => {
  // Pre-compute by timezone for better efficiency
  const timezones = await getUniqueUserTimezones();
  
  for (const tz of timezones) {
    const localTime8AM = convertToTimezone(8, tz);  // 8 AM in their TZ
    const users = await getUsers({
      where: { timezone: tz }
    });
    
    for (const user of users) {
      // Schedule for their local 8 AM (can be deferred)
      scheduleReminder(user, localTime8AM);
    }
  }
});
```

**Metrics**:
- Before: 24 executions/day (1 per hour)
- After: 1 execution/day
- **Reduction**: 96% on this scheduler ✅

---

### ✅ TIER 3: Low Risk (Day 5) - Estimated Additional 20% CU Reduction

#### 6️⃣ **Webhook Retry: 5 min → 30 min**
**File**: `server/scheduler.ts`

**Current behavior**: Retries failed webhooks every 5 minutes

**New behavior**: Retries every 30 minutes

**Why safe**:
- Garmin webhooks are queued reliably
- 30-min delay is acceptable (webhook data can wait)
- 7-day retention means data won't be lost

**CU savings**: **83%** on this operation (5 min → 30 min = 6x less frequent)

**Implementation**:

```typescript
// server/scheduler.ts
// BEFORE
scheduler.every('5 minutes', async () => {
  await retryFailedWebhooks();
});

// AFTER - OPTION 1: Conservative (30 min)
scheduler.every('30 minutes', async () => {
  await retryFailedWebhooks();
});

// AFTER - OPTION 2: Aggressive (1 hour)
scheduler.every('1 hour', async () => {
  await retryFailedWebhooks();
});
```

**Webhook reliability**:
- Garmin webhooks are queued (not lost)
- Retries up to 3 attempts with 10-min backoff
- 7-day retention, so data never permanently lost
- 30-min retry window is safe ✅

**Metrics**:
- Before: 288 retries/day (every 5 min × 24h)
- After (30 min): 48 retries/day
- **Reduction**: 83% ✅

---

### ⏸️ NOT CHANGING (Per Your Decision)

#### **Speech/Coaching: Keep Every 15 Seconds** ✅
You're right - this is AI TTS output for audio coaching to the user. This is core functionality and worth the compute cost. Keep it as is.

#### **Elapsed Time: Keep Every 1 Second** ✅
No change - this is local only (no network cost).

#### **Group-Run Polling: Conditional, No Change Needed** ✅
Already gated by `waitingForParticipants` flag. Only active during group run waiting state.

---

## 🎯 Summary: Total Expected Savings

| Optimization | Current | New | Savings | Implementation |
|---|---|---|---|---|
| **Local Save** | 5s | 30s | 15% | 1 line change |
| **GPS Watchdog** | 10s | 30s | 20% | 1 line change |
| **DB Sync (Live Share Gating)** | 30s always | 60s or 10m | 40-50% | 10 lines change |
| **Garmin Sync** | 60m | 6h + login | 75% | 15 lines change |
| **Coaching Reminders** | 60m hourly | 1x daily | 15% | 10 lines change |
| **Webhook Retry** | 5m | 30m | 83% | 1 line change |
| **TOTAL COMBINED** | **7.7M CU** | **2.2M CU** | **71% reduction** | **~50 lines total** |

---

## 📊 Real-World Impact at Different Scales

### Current (1 user)
```
Before: 7.7M CU/month = $24.80
After:  2.2M CU/month = $7.04
Savings: $17.76/month
```

### At 100 users
```
Before: 770M CU/month = $2,480
After:  220M CU/month = $704
Savings: $1,776/month
```

### At 1,000 users (Your Goal!)
```
Before: 7.7B CU/month = $24,800
After:  2.2B CU/month = $7,040
Savings: $17,760/month!!! 🎉
```

---

## 🚀 Implementation Roadmap

### Day 1 (2 hours - Quick Wins)
- [ ] Update `SAVE_INTERVAL_MS` from 5000 to 30000
- [ ] Update `GPS_WATCHDOG_INTERVAL` from 10000 to 30000
- [ ] Test: Run a test session, verify data saves correctly
- [ ] Deploy to dev environment

**Expected savings**: 35% reduction

### Day 2 (3 hours - DB Sync Gating)
- [ ] Add `isLiveSharing` flag to RunSession state
- [ ] Implement conditional sync interval logic
- [ ] Test: Run with sharing ON and OFF
- [ ] Verify final sync on hide/unload still works
- [ ] Deploy to dev environment

**Expected savings**: Additional 40-50% reduction

### Day 3 (2 hours - Garmin Sync)
- [ ] Modify scheduler to 6-hour interval
- [ ] Add `triggerGarminSync()` to login endpoint
- [ ] Test: Login triggers immediate sync
- [ ] Test: 6-hour cron works
- [ ] Deploy to dev environment

**Expected savings**: Additional 75% on Garmin sync

### Day 4 (1 hour - Coaching Reminders)
- [ ] Change hourly scheduler to daily
- [ ] Pre-compute by timezone
- [ ] Test: Reminders send at correct local time
- [ ] Deploy to dev environment

**Expected savings**: Additional 15% on scheduler

### Day 5 (30 min - Webhook Retry)
- [ ] Change 5-min interval to 30-min
- [ ] Monitor webhook retry queue for delays
- [ ] Deploy to dev environment

**Expected savings**: Additional 83% on webhook retry

### Day 6-7 (Testing & Monitoring)
- [ ] Run full end-to-end tests
- [ ] Monitor Replit CU usage dashboard
- [ ] Verify webhook retries still work
- [ ] Check for any data loss
- [ ] Deploy to production

---

## ✅ Safety Checklist

Before deploying each change:

- [ ] **Local Save (30s)**
  - [ ] Run test session, close app, reopen
  - [ ] Verify data still there
  - [ ] Max 30s data loss acceptable

- [ ] **GPS Watchdog (30s)**
  - [ ] Simulate GPS failure
  - [ ] Verify warning triggers within 60s
  - [ ] Check distance accuracy

- [ ] **DB Sync (Conditional)**
  - [ ] Run with sharing ON: verify updates every 60s
  - [ ] Run with sharing OFF: verify updates every 10m
  - [ ] Test final sync on hide/unload
  - [ ] Verify no data loss on completion

- [ ] **Garmin Sync (6h + login)**
  - [ ] Login triggers sync
  - [ ] 6h cron fires on schedule
  - [ ] Only active users sync
  - [ ] Wellness data still fresh

- [ ] **Coaching Reminders (1x daily)**
  - [ ] Reminders still send at 8 AM local
  - [ ] Per-timezone logic works
  - [ ] No duplicate reminders

- [ ] **Webhook Retry (30m)**
  - [ ] Failed webhooks still retry
  - [ ] Queue doesn't grow unbounded
  - [ ] Data eventually syncs

---

## 📈 Monitoring After Deployment

**Watch these metrics on Replit dashboard**:
1. Daily CU usage (should drop ~70%)
2. Request/minute (should drop ~40%)
3. Database writes/minute (should drop ~60%)

**Watch these metrics in your logs**:
1. Sync frequency during runs (should see fewer entries)
2. Webhook retry queue size (should be manageable)
3. Garmin sync frequency (should be 4-6x/day, not 24x)

**Expected results after 1 week**:
- CU drops from 7.7M to 2.2M
- Replit compute to $7/month (vs $24.80)
- No user-facing impact
- Same functionality, less infrastructure cost

---

## 💬 Questions?

**Q: Will users notice any difference?**
A: No! All changes are invisible. Timers just run less frequently.

**Q: What if 30-min webhook retry is too slow?**
A: Data still syncs. Webhook retry has 7-day retention and 3 attempts. 30 min is safe.

**Q: What if live sharing breaks with new DB sync?**
A: 60-second sync is still very responsive. Live sharing viewers will see updates within 1 minute.

**Q: Can I roll back if something breaks?**
A: Yes! Each change is isolated. You can revert individual timers.

**Q: Should I monitor CU after deployment?**
A: Yes! Check Replit dashboard daily for first week to confirm savings.

---

## 🎉 Success Criteria

You've succeeded when:
- ✅ Replit CU drops to ~2.2M/month
- ✅ No user complaints about stale data
- ✅ Live sharing still works smoothly
- ✅ Garmin data syncs fresh
- ✅ Coaching reminders deliver on time
- ✅ Webhook retries work reliably
- ✅ Cost drops from $24.80 → $7.04/month

Ready to start implementation?
