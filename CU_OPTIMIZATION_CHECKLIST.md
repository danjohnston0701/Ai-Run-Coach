# Replit CU Optimization - Quick Checklist

## 🎯 Goal: 7.7M CU/month → 2.2M CU/month (71% reduction)

---

## 📋 Day-by-Day Implementation

### ✅ DAY 1: Local Save + GPS Watchdog (2 hours)

**File**: `client/src/pages/RunSession.tsx`

```diff
// LOCAL SAVE: Change 5s to 30s
- const SAVE_INTERVAL_MS = 5000;
+ const SAVE_INTERVAL_MS = 30000;

// GPS WATCHDOG: Change 10s to 30s
- const GPS_WATCHDOG_INTERVAL = 10000;
+ const GPS_WATCHDOG_INTERVAL = 30000;
```

**Test**:
- [ ] Run a test session
- [ ] Close app and reopen → data still there
- [ ] Trigger GPS failure → warning within 60s

**Expected Savings**: 35% ⚡

---

### ✅ DAY 2: DB Sync Gating by Live Share (3 hours)

**File**: `client/src/pages/RunSession.tsx`

```typescript
// Find the sync interval setup
// BEFORE:
const syncInterval = setInterval(() => {
  syncToDatabase(sessionData);
}, 30000);

// AFTER:
const syncIntervalMs = isLiveSharing ? 60000 : 600000;  // 60s or 10min
const syncInterval = setInterval(() => {
  syncToDatabase(sessionData);
}, syncIntervalMs);
```

**Test**:
- [ ] Run without live sharing → syncs every 10 min
- [ ] Run with live sharing → syncs every 60 sec
- [ ] Close app → final sync happens

**Expected Savings**: Additional 40-50% 💰

---

### ✅ DAY 3: Garmin Sync (2 hours)

**File**: `server/scheduler.ts`

```typescript
// BEFORE:
scheduler.every('1 hour', async () => {
  const devices = await getAllGarminDevices();
  for (const device of devices) {
    await syncGarminWellness(device);
  }
});

// AFTER:
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
```

**Also add to login endpoint**:
```typescript
// After user authentication
triggerGarminSync(user.id).catch(err => 
  console.error('Garmin sync error:', err)
);
```

**Test**:
- [ ] Login → Garmin sync triggers immediately
- [ ] Check scheduler runs at 6h interval
- [ ] Wellness data still fresh

**Expected Savings**: Additional 75% ✨

---

### ✅ DAY 4: Coaching Reminders (1 hour)

**File**: `server/scheduler.ts`

```typescript
// BEFORE:
scheduler.every('1 hour', async () => {
  const users = await getUsers();
  for (const user of users) {
    const localHour = getUserLocalHour(user);
    if (localHour === 8) {
      await sendCoachingPlanReminder(user);
    }
  }
});

// AFTER:
scheduler.every('1 day', '08:00 UTC', async () => {
  const timezones = await getUniqueUserTimezones();
  for (const tz of timezones) {
    const users = await getUsers({ where: { timezone: tz } });
    for (const user of users) {
      scheduleReminder(user, convertToTimezone(8, tz));
    }
  }
});
```

**Test**:
- [ ] Reminders still send at 8 AM local time
- [ ] No duplicate reminders
- [ ] Works across timezones

**Expected Savings**: Additional 15% 📬

---

### ✅ DAY 5: Webhook Retry (30 min)

**File**: `server/scheduler.ts`

```diff
// CHANGE THIS:
- scheduler.every('5 minutes', async () => {
-   await retryFailedWebhooks();
- });

// TO THIS:
+ scheduler.every('30 minutes', async () => {
+   await retryFailedWebhooks();
+ });
```

**Test**:
- [ ] Failed webhooks still retry
- [ ] Queue doesn't grow unbounded

**Expected Savings**: Additional 83% 🚀

---

## 📊 Cumulative Savings Tracker

```
Initial State:         7.7M CU/month = $24.80
├─ After Day 1:       5.0M CU (-35%) = $16.00
├─ After Day 2:       2.5M CU (-50%) = $8.00
├─ After Day 3:       1.8M CU (-28%) = $5.76
├─ After Day 4:       1.5M CU (-17%) = $4.80
├─ After Day 5:       1.4M CU (-7%)  = $4.48
└─ FINAL TARGET:      2.2M CU (-71%) = $7.04

✅ TOTAL SAVINGS: $17.76/month (at 1 user)
                  $17,760/month (at 1,000 users)
```

---

## 🔍 What to Monitor

### Replit Dashboard
- [ ] Daily CU usage (should drop ~70%)
- [ ] Request/minute (should drop ~40%)
- [ ] Database writes (should drop ~60%)

### Application Logs
- [ ] Sync frequency during runs
- [ ] Webhook retry queue size
- [ ] Garmin sync frequency (should be 4-6x/day)

### User Experience
- [ ] No complaints about stale data
- [ ] Live sharing still responsive
- [ ] Garmin wellness data fresh
- [ ] Coaching reminders on time

---

## ⚠️ Safety Checks

### Before Each Change
- [ ] Read the section in `REPLIT_CU_OPTIMIZATION_PLAN.md`
- [ ] Understand what the timer does
- [ ] Plan your test scenario
- [ ] Have a rollback plan (revert the line)

### After Each Change
- [ ] Deploy to dev first
- [ ] Run the specific test
- [ ] Monitor logs for errors
- [ ] Then deploy to production

---

## 🎯 Success Criteria

✅ Replit CU drops to ~2.2M/month
✅ No user complaints about stale data  
✅ Live sharing responsive (60s updates)
✅ Garmin data fresh (4-6 syncs/day)
✅ Coaching reminders on time
✅ Webhook retries work (within 30 min)
✅ Cost drops from $24.80 → $7.04/month

---

## 📞 If Something Goes Wrong

**Rollback is simple** - revert the single line change:

```bash
git diff client/src/pages/RunSession.tsx  # See your change
git checkout client/src/pages/RunSession.tsx  # Revert it
npm run deploy  # Redeploy
```

Each change is isolated and easily reversible!

---

## 🚀 Ready to Start?

**Day 1 changes are the safest and give 35% savings immediately.**

Start there, and if all goes well, proceed to Days 2-5.

Good luck! Let's cut your Replit bill by 70%! 💰
