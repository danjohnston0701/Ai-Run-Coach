# App Store Server Notifications V2 Setup Guide

## Overview

The iOS app now has full support for **App Store Server Notifications V2**, which allows Apple to notify your backend whenever a user makes an in-app purchase (subscription). This enables the backend to automatically update user entitlements, handle renewals, refunds, and expirations.

**Current Status**: Backend webhook endpoint is deployed and ready to receive notifications.

---

## Backend Implementation

### Endpoint Details

- **URL**: `https://ai-run-coach.replit.app/api/apple/server-notifications`
- **Method**: `POST`
- **Authentication**: None (Apple doesn't send Bearer tokens; verification is via JWS signature)
- **Request Body**: 
  ```json
  {
    "signedPayload": "<JWS_TOKEN>"
  }
  ```
- **Response**: HTTP 200 (always, even on error — Apple retries on non-200)

### What the Endpoint Does

1. **Verifies the JWS signature** using Apple's x5c certificate chain (no external API calls)
2. **Decodes the nested transaction and renewal info** from the signed payload
3. **Maps App Store product IDs** to your tier + billing period:
   - `com.airuncoach.lite_monthly` → tier="lite", billingPeriod="monthly"
   - `com.airuncoach.lite_annual` → tier="lite", billingPeriod="annual"
   - `com.airuncoach.standard_monthly` → tier="standard", billingPeriod="monthly"
   - `com.airuncoach.standard_annual` → tier="standard", billingPeriod="annual"
4. **Updates the user's subscription state** in the database:
   - `subscription_tier` (lite, standard, free)
   - `subscription_status` (active, expired, refunded)
   - `entitlement_type` (apple_monthly, apple_annual)
   - `entitlement_expires_at` (renewal date)
5. **Records the transaction** for future lookups by `original_transaction_id`

### Supported Notification Types

| Type | Subtype | Action |
|------|---------|--------|
| `SUBSCRIBED` | – | User purchased a new subscription → mark active |
| `DID_RENEW` | – | Subscription auto-renewed → update expiry date |
| `DID_CHANGE_RENEWAL_STATUS` | – | User toggled auto-renewal → update status |
| `EXPIRED` | – | Subscription period ended → mark expired |
| `GRACE_PERIOD_EXPIRED` | – | Grace period ended after failed payment → mark expired |
| `REFUND` | – | User received refund → mark refunded |
| `REVOKE` | – | Admin revoked entitlement → mark refunded |

---

## iOS App Configuration (Already Done)

The iOS app already:
- ✅ Calls `Transaction.currentEntitlements` at launch
- ✅ Listens to `Transaction.updates` for purchase changes
- ✅ Refreshes the user profile from the backend on transaction updates
- ✅ Sets `appAccountToken = userId` so notifications can be mapped back to users

**No iOS client changes needed** — once the backend is receiving notifications, purchases reconcile automatically.

---

## App Store Connect Configuration (YOU MUST DO THIS)

### Step 1: Log in to App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Sign in with your Apple Developer account
3. Select your app (AI Run Coach)

### Step 2: Configure the Webhook URLs

1. **Navigate**: Your app → **App Information** → **App Store Server Notifications** → **Server-to-Server Notifications** (make sure it's **V2**, not legacy)
2. **Set the Production URL**:
   ```
   https://ai-run-coach.replit.app/api/apple/server-notifications
   ```
3. **Set the Sandbox URL**:
   ```
   https://ai-run-coach.replit.app/api/apple/server-notifications
   ```
   *(You can point both to the same endpoint — the decoded payload includes an `environment` field so your backend knows which one it came from)*

4. **Enable** the notifications toggle to activate
5. **Save**

### Step 3: Verify the Configuration

Once saved, App Store Connect will:
- Send a test notification to verify the endpoint is reachable
- Display a status indicator (green = success)
- If it fails, check:
  - The endpoint is publicly accessible (test with `curl`)
  - It responds with HTTP 200 (even on error)
  - The domain has a valid TLS certificate (Replit's *.replit.app is valid)

### Step 4: Monitor Notifications

After configuration:
- Apple will start sending notifications for all future purchases
- Check server logs for incoming webhooks: `[Apple Notifications] Received ...`
- If a user purchases a subscription, you'll see:
  ```
  [Apple Notifications] ✅ User <userId> subscribed to lite (monthly). Expires: 2026-08-28...
  ```

---

## Testing the Notifications

### Test in Sandbox (Before Going Live)

1. **In your iOS app's build settings**, ensure you're pointing to the **Sandbox environment** for StoreKit
2. **Use a sandbox tester account** created in App Store Connect:
   - App Store Connect → Users and Access → Sandbox Testers → Create tester
   - Use their credentials to purchase in TestFlight
3. **Purchase a test subscription** in the app
4. **Watch the server logs** for the notification

### Transition to Production

Once tested and confident:
1. Update the iOS app to point to the **Production environment**
2. Release the new version to the App Store
3. Real users' purchases will now trigger notifications

---

## Database Changes

The following migrations run automatically on server startup:

### New Table: `apple_transactions`

```sql
CREATE TABLE apple_transactions (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id),
  original_transaction_id VARCHAR NOT NULL UNIQUE,
  transaction_id VARCHAR NOT NULL,
  app_account_token VARCHAR,
  product_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### New Column: `users.apple_account_token`

Stores the app account token provided by the iOS app, enabling:
- Direct user lookup from notifications
- Tracking multiple transactions per user
- Quick identification of which user made a purchase

---

## FAQ & Troubleshooting

### Q: What if a notification fails to process?
**A**: The endpoint logs the error and responds HTTP 200 anyway. Apple retries for up to ~5 times over several hours. Check server logs for the exact error.

### Q: Can I test the endpoint locally?
**A**: Yes, but Apple can't reach your local machine. Either:
1. Use a tunneling service like `ngrok` to expose your local port
2. Deploy to Replit and test there
3. Use the Sandbox environment with a test tester account

### Q: What if a user's subscription info gets out of sync?
**A**: 
1. The iOS app calls the backend's `GET /api/subscriptions/status` endpoint on launch
2. If the DB is out of sync, the app will detect it and correct itself by calling `POST /api/subscriptions/verify-purchase`
3. As a failsafe, you can manually trigger a refresh: iOS app → Profile → Refresh entitlements

### Q: Do I need to handle grace periods?
**A**: Partially. Apple sends `GRACE_PERIOD_EXPIRED` when a renewal fails and the grace period ends. The endpoint marks it as `expired`. Your app's tier-check logic should treat `expired` as `free` tier.

### Q: What about family sharing?
**A**: Apple's Family Sharing doesn't trigger separate notifications for each family member. Only the account holder (who made the purchase) receives the subscription. This is an Apple limitation, not a backend issue.

---

## Product ID Mapping

Make sure your App Store product IDs match the mapping in `apple-server-notifications.ts`:

```typescript
function mapProductIdToTier(productId: string) {
  if (productId.includes("lite") && productId.includes("monthly")) {
    return { tier: "lite", billingPeriod: "monthly" };
  }
  // ... etc
}
```

If you use different product ID names, update the function to match.

---

## Security Notes

1. **No Bearer token needed** — Apple doesn't send one. Verification is via JWS signature.
2. **JWS verification is cryptographic** — even if someone intercepts the request, they can't forge a valid signature without Apple's private key.
3. **Never trust unsigned payloads** — the endpoint rejects any request with invalid signatures.
4. **Endpoint is public** — anyone can POST to it, but only Apple's signed payloads will be processed.

---

## Next Steps

1. **Log in to App Store Connect** and configure the webhook URLs (Step 2 above)
2. **Test in Sandbox** with a test tester account
3. **Monitor the server logs** for successful notifications
4. **Deploy to production** when confident

That's it! Once configured, the entire subscription flow is automated. 🎉
