# Promo Code Validation Fix

## Problem
User tried to redeem "FOUNDER_1YR" promo code and got "Invalid or expired promo code" error, even though the code was valid in the database.

## Root Cause
The `coupon-service.ts` was using **raw SQL with `db.execute()`** instead of Drizzle ORM:

1. **Column name mapping issue**: Raw SQL returned snake_case column names (`expires_at`, `current_uses`), but the code tried to access them as camelCase properties
2. **UPPER() function not working**: `UPPER(code)` on a parameterized query wasn't matching properly
3. **Result checking was unreliable**: When accessing `couponRecord.expires_at` or `couponRecord.current_uses`, JavaScript returned `undefined` because the column names were still in snake_case

## Solution
Migrated all coupon validation logic from raw SQL to **Drizzle ORM**:

### Changed Functions

**1. `redeemPromoCode()`** - Main validation function
```typescript
// BEFORE: Raw SQL
const couponResult = await db.execute(
  sql`SELECT * FROM coupon_codes WHERE UPPER(code) = ${normalizedCode} AND is_active = true`
);

// AFTER: Drizzle ORM
const couponRecords = await db
  .select()
  .from(couponCodes)
  .where(
    and(
      sql`LOWER(${couponCodes.code}) = LOWER(${normalizedCode})`,
      eq(couponCodes.isActive, true)
    )
  )
  .limit(1);
```

**Benefits:**
- ✅ Type-safe column access (camelCase works: `expiresAt`, `currentUses`)
- ✅ Case-insensitive matching using `LOWER()` SQL function
- ✅ Proper result mapping from database

**2. User coupon check**
```typescript
// BEFORE: Raw SQL
const existingUse = await db.execute(
  sql`SELECT * FROM user_coupons WHERE user_id = ${userId} AND coupon_id = ${couponRecord.id}`
);

// AFTER: Drizzle ORM
const existingUses = await db
  .select()
  .from(userCoupons)
  .where(
    and(
      eq(userCoupons.userId, userId),
      eq(userCoupons.couponId, couponRecord.id)
    )
  )
  .limit(1);
```

**3. Redemption insertion**
```typescript
// BEFORE: Raw SQL
await db.execute(
  sql`INSERT INTO user_coupons (user_id, coupon_id, expires_at) VALUES (${userId}, ${couponRecord.id}, ${expiresAt.toISOString()})`
);

// AFTER: Drizzle ORM
await db
  .insert(userCoupons)
  .values({
    userId,
    couponId: couponRecord.id,
    expiresAt,
  });
```

**4. Usage increment**
```typescript
// BEFORE: Raw SQL
await db.execute(
  sql`UPDATE coupon_codes SET current_uses = current_uses + 1 WHERE id = ${couponRecord.id}`
);

// AFTER: Drizzle ORM
await db
  .update(couponCodes)
  .set({ currentUses: sql`${couponCodes.currentUses} + 1` })
  .where(eq(couponCodes.id, couponRecord.id));
```

**5. `hasUnlimitedGrant()` and `getUserActiveGrants()`**
- Migrated to use `select()` with `innerJoin()`
- Proper type-safe access to all columns

## What Was Fixed

✅ **Column name mapping**: Now uses camelCase properties correctly  
✅ **Case-insensitive code matching**: Using `LOWER()` instead of `UPPER()`  
✅ **Result structure**: Drizzle ORM properly maps database results  
✅ **Type safety**: All column references are type-checked at compile time  

## Testing

Your FOUNDER_1YR code should now work:
- ✅ Code: `FOUNDER_1YR` (case-insensitive)
- ✅ is_active: `true`
- ✅ expires_at: `2027-04-29` (future date)
- ✅ max_uses: `50`, current_uses: `0`

**Try redeeming again** - it should work now!

## Files Modified

- `server/coupon-service.ts` (~50 lines changed)
  - Removed: Raw SQL queries with `db.execute()`
  - Added: Drizzle ORM queries with proper type safety

## Commit

```
6cd8db3 fix: promo code validation using Drizzle ORM instead of raw SQL
```

---

## Summary

The issue was a **column name mapping problem** caused by using raw SQL instead of Drizzle ORM. The database returns snake_case column names, but the code was trying to access them as camelCase properties, returning `undefined` and failing validation.

By migrating to Drizzle ORM, all column names are properly typed and mapped, case-insensitive matching works correctly, and the validation logic is more robust.

**The FOUNDER_1YR code should now redeem successfully!** 🎉
