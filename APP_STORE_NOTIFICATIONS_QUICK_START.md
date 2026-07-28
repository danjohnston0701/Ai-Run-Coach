# App Store Server Notifications V2 — Quick Start

## What Was Built

✅ **Backend webhook endpoint** that accepts Apple's purchase notifications
✅ **JWS signature verification** (cryptographic validation)
✅ **Subscription state management** (active, expired, refunded)
✅ **Transaction tracking** (links notifications to users)
✅ **Database migrations** (apple_transactions table, apple_account_token column)

---

## The Three Steps You Need to Do

### 1️⃣ App Store Connect Configuration (5 minutes)

Go to [App Store Connect](https://appstoreconnect.apple.com/):
1. Your app → **App Information** → **App Store Server Notifications**
2. Set **Production Server URL**:
   ```
   https://ai-run-coach.replit.app/api/apple/server-notifications
   ```
3. Set **Sandbox Server URL** (same URL):
   ```
   https://ai-run-coach.replit.app/api/apple/server-notifications
   ```
4. **Enable** and **Save**

Apple will send a test notification to verify.

### 2️⃣ Test with Sandbox Tester (10 minutes)

1. App Store Connect → **Users and Access** → **Sandbox Testers**
2. Create a test tester account
3. In TestFlight, log in with that account
4. Purchase a test subscription
5. Check server logs: `[Apple Notifications] ✅ User ... subscribed to ...`

### 3️⃣ Monitor Production

Once live:
- Users purchase → Apple notifies your backend
- Backend updates `subscription_tier`, `entitlement_type`, `entitlement_expires_at`
- iOS app refreshes profile on next launch or purchase
- User's entitlements are now correct

---

## How It Works

```
User purchases in App Store
        ↓
Apple sends signed notification to your webhook
        ↓
Backend verifies JWS signature (cryptographic)
        ↓
Backend decodes: originalTransactionId, productId, expiryDate
        ↓
Backend finds user (by appAccountToken or transaction ID)
        ↓
Backend updates: subscription_tier, entitlement_expires_at
        ↓
iOS app refreshes profile on next launch
        ↓
User sees correct subscription status
```

---

## Files Created

- `server/apple-server-notifications.ts` — Webhook handler + signature verification
- `server/auto-migrate.ts` — (updated) Apple transactions table + migrations
- `server/routes.ts` — (updated) POST /api/apple/server-notifications endpoint
- `APP_STORE_SERVER_NOTIFICATIONS_SETUP.md` — Full documentation
- `APP_STORE_NOTIFICATIONS_QUICK_START.md` — This file

---

## What Happens Automatically

✅ JWS signature verification using Apple's certificates (x5c)
✅ Nested transaction/renewal info decoding
✅ User lookup by appAccountToken or originalTransactionId
✅ Subscription tier mapping (lite/standard, monthly/annual)
✅ Database updates (subscription_tier, entitlement_expires_at)
✅ Async processing (responds 200 immediately, does DB work async)
✅ Apple retry-safe (always responds 200 so Apple doesn't retry)

---

## What the iOS App Already Does

✅ Sets appAccountToken = userId (enables notifications to find the user)
✅ Calls Transaction.currentEntitlements at launch
✅ Listens to Transaction.updates
✅ Refreshes profile from backend on purchase
✅ No code changes needed

---

## Notification Types Handled

| Event | Action |
|-------|--------|
| User purchases | subscription_tier = lite/standard, status = active |
| Subscription renews | entitlement_expires_at = new date |
| Subscription expires | subscription_tier = NULL, status = expired |
| User gets refund | subscription_tier = NULL, status = refunded |

---

## Next Steps

1. **Go to App Store Connect** (Step 1 above)
2. **Set the webhook URLs**
3. **Test with a sandbox tester**
4. **Done!** 🎉

**Questions?** See `APP_STORE_SERVER_NOTIFICATIONS_SETUP.md` for full details and FAQ.
