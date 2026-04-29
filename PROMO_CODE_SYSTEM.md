# Promo Code System — Unlimited Access

## Overview

The app now has a promotional code system that grants users unlimited access to premium features (training plan generation, route generation, analysis).

---

## User Experience

### Hitting a Monthly Limit

When a user hits their monthly limit:

**Before**:
```
"You've reached your monthly limit for training plan generation on the free plan. 
Upgrade to continue."
```

**Now**:
```
"You have reached the limit of Plans this month for your free plan. 
Upgrade to unlock unlimited Plans, or wait until 2026-05 to try again."
```

### Redeeming a Promo Code

Users can now tap **"Have a promo code?"** in the limit dialog:

1. Enter promo code (e.g., `EARLYBIRD50`)
2. Tap "Redeem"
3. Instant feedback: `"🎉 Promo code applied! You now have unlimited training plans until June 15, 2026."`
4. Immediately try the feature again

---

## Admin: Creating Promo Codes

### In Database (One-Time Setup)

```sql
INSERT INTO coupon_codes (code, type, duration_days, max_uses, is_active, expires_at)
VALUES 
  ('EARLYBIRD50', 'unlimited_all', 30, 50, true, '2026-06-15'),
  ('UNLOCK_PLANS', 'unlimited_plans', 90, 100, true, '2026-08-31'),
  ('FOUNDING_MEMBER', 'unlimited_all', 365, null, true, '2027-04-29');
```

### Coupon Types

- **`unlimited_all`** — Unlimited Plans, Routes, Analyses
- **`unlimited_plans`** — Unlimited training plan generation only
- **`unlimited_routes`** — Unlimited route generation only
- **`unlimited_analyses`** — Unlimited post-run analyses only

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| `code` | text | The promo code (case-insensitive, unique) |
| `type` | text | What features the code unlocks |
| `duration_days` | int | How long access lasts (default: 30) |
| `max_uses` | int | Maximum times it can be redeemed (null = unlimited) |
| `current_uses` | int | Current number of redemptions |
| `is_active` | bool | Enable/disable the code |
| `expires_at` | timestamp | When the code itself expires |

---

## API Endpoints

### Redeem a Promo Code

**POST** `/api/promo-codes/redeem`

```json
{
  "code": "EARLYBIRD50"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "🎉 Promo code applied! You now have unlimited training plans until June 15, 2026.",
  "grantedUntil": "2026-06-15T00:00:00Z",
  "features": ["trainingPlansGenerated"]
}
```

**Response (Invalid Code)**:
```json
{
  "success": false,
  "message": "Invalid or expired promo code. Please check and try again."
}
```

### Get Active Grants

**GET** `/api/promo-codes/active-grants`

**Response**:
```json
{
  "grants": [
    {
      "code": "EARLYBIRD50",
      "expiresAt": "2026-06-15T00:00:00Z",
      "features": ["training plans", "routes", "analyses"]
    }
  ]
}
```

---

## How It Works

1. **User hits limit** → Gets new error message with renewal date
2. **User enters promo code** → Calls `/api/promo-codes/redeem`
3. **Backend validates**:
   - Code exists and is active
   - Code hasn't expired
   - Code hasn't hit max uses
   - User hasn't already redeemed it
4. **Code granted** → Creates `user_coupons` record with expiration date
5. **Next feature request** → `checkAndEnforceLimit()` checks for active grants, allows unlimited use
6. **Grant expires** → User reverts to normal limits

---

## Example Use Cases

### Early Bird Offer
```sql
INSERT INTO coupon_codes (code, type, duration_days, max_uses)
VALUES ('EARLYBIRD25', 'unlimited_all', 30, 100);
-- 100 first users get unlimited access for 30 days
```

### Paid Upgrade Campaign
```sql
INSERT INTO coupon_codes (code, type, duration_days, max_uses)
VALUES ('UPGRADE_PLANS', 'unlimited_plans', 90, null);
-- Unlimited use, 90 days, for marketing campaigns
```

### Founding Members
```sql
INSERT INTO coupon_codes (code, type, duration_days, max_uses, expires_at)
VALUES ('FOUNDER_1YEAR', 'unlimited_all', 365, 50, '2027-04-29');
-- 50 founding members get 1 year unlimited
```

---

## User Flow in App

```
┌─ Hit Monthly Limit ─┐
│                     │
│ "You reached your   │
│  Plans limit"       │
│                     │
│ [Have a promo code?]│  ← New button
│ [Upgrade Plan]      │
│ [OK]                │
└─────────────────────┘
         ↓
┌─ Promo Code Dialog ─┐
│                     │
│ Enter Code:         │
│ [_______________]   │
│                     │
│ [Redeem] [Cancel]   │
└─────────────────────┘
         ↓ (Valid code)
┌─ Success Dialog ────┐
│                     │
│ 🎉 Promo Applied!   │
│                     │
│ "You now have       │
│  unlimited Plans    │
│  until June 15"     │
│                     │
│ [Try Again] [OK]    │
└─────────────────────┘
         ↓
    User can now
  generate unlimited
    training plans
```

---

## Database Schema

Already exists in `shared/schema.ts`:

```typescript
export const couponCodes = pgTable("coupon_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  type: text("type").notNull(),
  value: integer("value"),
  durationDays: integer("duration_days"),
  maxUses: integer("max_uses"),
  currentUses: integer("current_uses").default(0),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userCoupons = pgTable("user_coupons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  couponId: varchar("coupon_id").notNull().references(() => couponCodes.id),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});
```

---

## Server Implementation

### Files Updated

1. **`server/usage-service.ts`**
   - Updated error message format
   - Added check for active grants before enforcing limits

2. **`server/coupon-service.ts` (NEW)**
   - `redeemPromoCode()` — Validate and apply code
   - `hasUnlimitedGrant()` — Check if user has active unlimited grant
   - `getUserActiveGrants()` — Get user's active promo codes

3. **`server/routes.ts`**
   - `POST /api/promo-codes/redeem` — Redeem a code
   - `GET /api/promo-codes/active-grants` — View active grants

---

## Testing Promo Codes

### Create a Test Code

```bash
# Via SQL
INSERT INTO coupon_codes (code, type, duration_days, max_uses, is_active)
VALUES ('TEST123', 'unlimited_all', 30, 10, true);
```

### Test Redemption

```bash
curl -X POST http://localhost:3000/api/promo-codes/redeem \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "TEST123"}'
```

### Verify Active Grants

```bash
curl http://localhost:3000/api/promo-codes/active-grants \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Impact on Subscriptions

- **Free users**: Can still generate 1 plan/month, OR redeem a promo for unlimited
- **Pro users**: Can generate 3 plans/month, OR upgrade with promo
- **Premium users**: Can generate 10 plans/month, OR use promo for unlimited lifetime access
- **Promo code holders**: Unlimited for the duration of their grant (regardless of tier)

This system lets you:
- ✅ Give away unlimited access for marketing
- ✅ Reward early users
- ✅ Run limited-time campaigns
- ✅ Offer founder benefits
- ✅ Create partnerships with a simple code

---

## Status: ✅ PRODUCTION READY

All code written, tested, and deployed.
