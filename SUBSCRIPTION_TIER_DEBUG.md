# Subscription Tier Mismatch — Debug Guide

## The Issue

Your profile shows **"Premium Tier"** with **3 AI Plans allowed**, but when you click "AI Plans" you get locked out saying you need to upgrade.

This is because:

1. **Profile Display** shows what's in the `users.subscription_tier` field in the database
2. **Feature Limit Check** uses that same field to determine if you can generate plans
3. **The Mismatch**: Either the field is not set correctly, OR the field name/value doesn't match the tier-limits config

---

## How Tier Limits Work

**Server Config** (`server/tier-limits.ts`):
```
free:     1 plan/month
lite:     3 plans/month  ← This matches what your profile says
standard: 10 plans/month
```

**The Check** happens in `server/usage-service.ts`:
```
const limits = getLimitsForTier(tier);  // Your tier
const limit = limits[feature];          // Get limit for this feature
if (current + 1 > limit) {             // You've exceeded?
  → Show upsell screen
}
```

---

## Most Likely Cause

Your `users.subscription_tier` is one of:
- `NULL` (not set) → Falls back to "free" (1 plan/month)
- `"premium"` (wrong string) → Falls back to "free" (unknown tier)
- `"lite"` (correct) → Should allow 3 plans

---

## How to Fix

### Option 1: Check Your Database

```sql
SELECT id, email, subscription_tier, subscription_status FROM users WHERE email = 'your@email.com';
```

You should see:
```
id                                    email               subscription_tier  subscription_status
xxxxx...                              you@...             lite               active
```

If it shows `NULL` or `"premium"`, that's the problem.

### Option 2: Set Your Tier to "Lite"

```sql
UPDATE users 
SET subscription_tier = 'lite', subscription_status = 'active'
WHERE email = 'your@email.com';
```

### Option 3: Clear Monthly Usage & Refresh

If you've already used 2 out of 3 plans this month, you need to reset the usage counter:

```sql
-- See current usage for this month
SELECT * FROM monthly_usage 
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com')
  AND year_month = '2026-06';

-- Clear it if needed
DELETE FROM monthly_usage 
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com')
  AND year_month = '2026-06';
```

---

## After Fixing

1. **Restart the app** (kill and relaunch)
2. **Or** tap "AI Plans" again — the feature limit check runs fresh each time
3. You should now see **"2 of 3 plans remaining"** instead of the upsell screen

---

## Why This Happened

When subscriptions were removed from the UI (due to Apple App Review), the `subscription_tier` field might not have been populated correctly, or it reverted to `NULL`.

The profile screen displays whatever is in the database (`subscription_tier`), but the feature limit check ALSO relies on that same field. If they don't match, you get this UX mismatch.

---

## Going Forward

Now that we're re-instating promo codes, you can:
1. **Manually update `subscription_tier`** in the database for yourself and test users
2. **OR redeem a promo code** like `founder_1yr` for unlimited access (after we wire up the dialog)

The promo system **bypasses tier limits entirely** — even a "free" user with an active `founder_1yr` grant gets unlimited plans.

