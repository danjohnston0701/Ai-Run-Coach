# Promo Code Validation Issue - Debugging & Fix

## Problem
User trying to apply "FOUNDER_1YR" promo code gets "Invalid or expired token" error, but the code exists and is valid in Neon Database.

## Root Cause Analysis

The validation logic in `coupon-service.ts` checks multiple conditions:

```typescript
// Line 31: Query the coupon code
const couponResult = await db.execute(
  sql`SELECT * FROM coupon_codes WHERE UPPER(code) = ${normalizedCode} AND is_active = true`
);

// Line 34: If not found, return error
if (!couponResult.length) {
  return {
    success: false,
    message: "Invalid or expired promo code. Please check and try again.",
  };
}
```

**The error "Invalid or expired promo code" can be returned by ANY of these conditions:**

1. ✅ Code doesn't exist → `!couponResult.length` (line 34)
2. ✅ `is_active = false` → `AND is_active = true` (line 31)
3. ✅ `expires_at` is in the past (line 44)
4. ✅ Usage limit reached (line 52-55)
5. ✅ User already redeemed it (line 67-71)

Since you say it's "valid in the database", let's diagnose which condition is failing.

---

## Diagnostic Steps

### Step 1: Check the Exact Code in Database

```sql
SELECT 
  code,
  is_active,
  expires_at,
  max_uses,
  current_uses,
  type,
  created_at
FROM coupon_codes
WHERE code = 'FOUNDER_1YR' OR UPPER(code) = 'FOUNDER_1YR';
```

**What to look for:**
- `code`: Verify exact spelling (case-sensitive in DB)
- `is_active`: Should be `true`
- `expires_at`: Should be `NULL` or future date
- `current_uses` < `max_uses`: Or max_uses should be NULL
- `type`: Should be one of: `unlimited_all`, `unlimited_plans`, `unlimited_routes`, `unlimited_analyses`

### Step 2: Check if User Already Redeemed

```sql
SELECT * FROM user_coupons 
WHERE user_id = 'YOUR_USER_ID' 
  AND coupon_id = (SELECT id FROM coupon_codes WHERE code = 'FOUNDER_1YR');
```

If this returns a row, the user already redeemed it.

### Step 3: Enable Debug Logging

Add console logs to `coupon-service.ts` to see exactly which check is failing:

```typescript
export async function redeemPromoCode(
  userId: string,
  code: string
): Promise<PromoCodeRedemption> {
  try {
    const normalizedCode = code.trim().toUpperCase();
    console.log(`[CouponDebug] Attempting to redeem code: "${code}" → "${normalizedCode}"`);

    const couponResult = await db.execute(
      sql`SELECT * FROM coupon_codes WHERE UPPER(code) = ${normalizedCode} AND is_active = true`
    );

    console.log(`[CouponDebug] Query result:`, couponResult);

    if (!couponResult.length) {
      console.log(`[CouponDebug] Code not found or is_active = false`);
      return {
        success: false,
        message: "Invalid or expired promo code. Please check and try again.",
      };
    }

    const couponRecord = couponResult[0];
    console.log(`[CouponDebug] Found coupon:`, {
      code: couponRecord.code,
      type: couponRecord.type,
      is_active: couponRecord.is_active,
      expires_at: couponRecord.expires_at,
      max_uses: couponRecord.max_uses,
      current_uses: couponRecord.current_uses,
    });

    // Check if expired
    if (couponRecord.expires_at && new Date(couponRecord.expires_at) < new Date()) {
      console.log(`[CouponDebug] Code expired at:`, couponRecord.expires_at);
      return {
        success: false,
        message: "This promo code has expired.",
      };
    }

    // Check max uses
    if (
      couponRecord.max_uses &&
      couponRecord.current_uses >= couponRecord.max_uses
    ) {
      console.log(`[CouponDebug] Max uses reached: ${couponRecord.current_uses}/${couponRecord.max_uses}`);
      return {
        success: false,
        message: "This promo code has reached its usage limit.",
      };
    }

    // Check if user already redeemed
    const existingUse = await db.execute(
      sql`SELECT * FROM user_coupons WHERE user_id = ${userId} AND coupon_id = ${couponRecord.id}`
    );

    if (existingUse.length) {
      console.log(`[CouponDebug] User already redeemed this code`);
      return {
        success: false,
        message: "You have already redeemed this promo code.",
      };
    }

    console.log(`[CouponDebug] All checks passed, proceeding with redemption`);
    
    // ... rest of function ...
  }
}
```

---

## Most Common Issues

### Issue 1: Code Exists but is_active = false

**Symptom**: Code found in DB but still says "Invalid or expired"

**Cause**: `is_active` column is `false`

**Fix**:
```sql
UPDATE coupon_codes 
SET is_active = true 
WHERE code = 'FOUNDER_1YR';
```

### Issue 2: Code Has Expired

**Symptom**: Found in DB, is_active = true, but still rejected

**Cause**: `expires_at` is in the past

**Fix** (set to 1 year from now):
```sql
UPDATE coupon_codes 
SET expires_at = NOW() + INTERVAL '1 year'
WHERE code = 'FOUNDER_1YR';
```

Or remove expiry:
```sql
UPDATE coupon_codes 
SET expires_at = NULL
WHERE code = 'FOUNDER_1YR';
```

### Issue 3: Max Uses Reached

**Symptom**: Code is valid but says "reached its usage limit"

**Cause**: `current_uses >= max_uses`

**Fix** (increase max uses or reset usage):
```sql
UPDATE coupon_codes 
SET max_uses = 1000, current_uses = 0
WHERE code = 'FOUNDER_1YR';
```

Or set unlimited:
```sql
UPDATE coupon_codes 
SET max_uses = NULL
WHERE code = 'FOUNDER_1YR';
```

### Issue 4: User Already Redeemed

**Symptom**: First 3 checks pass, but says "already redeemed"

**Cause**: User has a record in `user_coupons` table

**Fix** (if you want them to redeem again, delete the record):
```sql
DELETE FROM user_coupons 
WHERE user_id = 'YOUR_USER_ID' 
  AND coupon_id = (SELECT id FROM coupon_codes WHERE code = 'FOUNDER_1YR');
```

---

## Quick Verification SQL

Run this to see the complete state of the FOUNDER_1YR code:

```sql
SELECT 
  cc.id,
  cc.code,
  cc.type,
  cc.is_active,
  cc.expires_at,
  cc.max_uses,
  cc.current_uses,
  cc.created_at,
  COUNT(uc.id) as times_redeemed_by_users,
  CASE 
    WHEN cc.is_active = false THEN 'REASON: is_active = false'
    WHEN cc.expires_at IS NOT NULL AND cc.expires_at < NOW() THEN 'REASON: Expired'
    WHEN cc.max_uses IS NOT NULL AND cc.current_uses >= cc.max_uses THEN 'REASON: Max uses reached'
    ELSE 'OK - Code is valid'
  END as status
FROM coupon_codes cc
LEFT JOIN user_coupons uc ON cc.id = uc.coupon_id
WHERE cc.code = 'FOUNDER_1YR'
GROUP BY cc.id, cc.code, cc.type, cc.is_active, cc.expires_at, cc.max_uses, cc.current_uses, cc.created_at;
```

---

## Solution: Fix the Code

Based on your description (it's "valid in database"), most likely scenario:

### Option 1: is_active is false
```sql
UPDATE coupon_codes 
SET is_active = true 
WHERE code = 'FOUNDER_1YR';
```

### Option 2: expires_at is in the past
```sql
UPDATE coupon_codes 
SET expires_at = NULL
WHERE code = 'FOUNDER_1YR';
```

### Option 3: max_uses limit reached
```sql
UPDATE coupon_codes 
SET max_uses = NULL, current_uses = 0
WHERE code = 'FOUNDER_1YR';
```

### Option 4: Do all three (safest)
```sql
UPDATE coupon_codes 
SET 
  is_active = true,
  expires_at = NULL,
  max_uses = NULL,
  current_uses = 0
WHERE code = 'FOUNDER_1YR';
```

---

## Permanent Fix: Improve Error Messages

The current code returns the same error message for all failures. We should return more specific messages.

**File**: `server/coupon-service.ts`

**Change**:
```typescript
// Current (line 34-38):
if (!couponResult.length) {
  return {
    success: false,
    message: "Invalid or expired promo code. Please check and try again.",
  };
}
```

**To**:
```typescript
// New version:
if (!couponResult.length) {
  // Check if code exists at all (even if inactive)
  const allCodes = await db.execute(
    sql`SELECT * FROM coupon_codes WHERE UPPER(code) = ${normalizedCode}`
  );
  
  if (allCodes.length === 0) {
    return {
      success: false,
      message: "Promo code not found. Please check the code and try again.",
    };
  } else {
    return {
      success: false,
      message: "This promo code is currently inactive. Please contact support.",
    };
  }
}
```

This helps distinguish between "code doesn't exist" and "code exists but is disabled".

---

## Summary

1. **Check database** with diagnostic SQL above
2. **Identify which condition is failing**
3. **Apply appropriate fix**
4. **Test redemption again**

Most likely: `is_active = false` or `expires_at` in the past.

Let me know what you find in the database and I can help fix it!
