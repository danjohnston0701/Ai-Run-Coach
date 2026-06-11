# Subscription Product IDs & Pricing

## Quick Reference Card

**Copy-paste these exact values into Google Play Console**

---

## Product 1: Lite Monthly

| Field | Value |
|-------|-------|
| Product ID | `lite_monthly` |
| Title | Lite Monthly |
| Price | $7.99 USD |
| Billing Period | Monthly |
| Auto-renewal | ✅ Enabled |
| Description | AI-powered training guidance with weekly coaching tips and performance tracking |

---

## Product 2: Lite Annual

| Field | Value |
|-------|-------|
| Product ID | `lite_annual` |
| Title | Lite Annual |
| Price | $79.99 USD |
| Billing Period | Annual |
| Auto-renewal | ✅ Enabled |
| Description | AI-powered training guidance with weekly coaching tips and performance tracking. Save 17% with annual billing! |

---

## Product 3: Standard Monthly

| Field | Value |
|-------|-------|
| Product ID | `standard_monthly` |
| Title | Standard Monthly |
| Price | $14.99 USD |
| Billing Period | Monthly |
| Auto-renewal | ✅ Enabled |
| Description | Full suite of AI coaching, advanced analytics, custom training plans, injury prevention, and priority support |

---

## Product 4: Standard Annual

| Field | Value |
|-------|-------|
| Product ID | `standard_annual` |
| Title | Standard Annual |
| Price | $149.00 USD |
| Billing Period | Annual |
| Auto-renewal | ✅ Enabled |
| Description | Full suite of AI coaching, advanced analytics, custom training plans, injury prevention, and priority support. Save 17% with annual billing! |

---

## Pricing Table

```
┌─────────────────┬──────────┬───────────┐
│ Plan            │ Monthly  │ Annual    │
├─────────────────┼──────────┼───────────┤
│ Lite            │ $7.99    │ $79.99    │
│ Standard        │ $14.99   │ $149.00   │
└─────────────────┴──────────┴───────────┘
```

---

## What Your Code Expects

Your app is configured to query these exact Product IDs:

```kotlin
const val SUBSCRIPTION_LITE_MONTHLY = "lite_monthly"
const val SUBSCRIPTION_LITE_ANNUAL = "lite_annual"
const val SUBSCRIPTION_STANDARD_MONTHLY = "standard_monthly"
const val SUBSCRIPTION_STANDARD_ANNUAL = "standard_annual"
```

**IMPORTANT**: Product IDs must match **exactly** (case-sensitive!)

---

## Creating in Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app
3. Products → Subscriptions
4. Create Subscription
5. Fill in Product ID, Title, Price, Billing Period
6. Enable Auto-renewal
7. Add description
8. Click Save

Repeat for all 4 products.

---

## Copy-Paste Product IDs

Just in case - here are the Product IDs to copy:

```
lite_monthly
lite_annual
standard_monthly
standard_annual
```

---

## Feature Breakdown

### Lite Plan Includes
- ✓ AI-powered training guidance
- ✓ Basic performance tracking
- ✓ Weekly coaching tips
- ✓ Mobile app access

### Standard Plan Includes (All of Lite + )
- ✓ Advanced training plan customization
- ✓ Real-time performance analytics
- ✓ Injury prevention recommendations
- ✓ Priority support
- ✓ Export training history
- ✓ Custom coaching sessions

---

## Checklist for Setup

- [ ] Product ID: `lite_monthly` @ $7.99/month ✓
- [ ] Product ID: `lite_annual` @ $79.99/year ✓
- [ ] Product ID: `standard_monthly` @ $14.99/month ✓
- [ ] Product ID: `standard_annual` @ $149.00/year ✓
- [ ] All auto-renewal enabled ✓
- [ ] All in USD currency ✓
- [ ] Descriptions added ✓

---

## Common Mistakes

❌ **Typo in Product ID** - Must be exactly `lite_monthly` (not `Lite_Monthly` or `lite-monthly`)

❌ **Wrong currency** - Must be USD ($)

❌ **Auto-renewal not enabled** - Required for subscriptions

❌ **Missing description** - Users need to know what they're getting

---

## Verification

After creating subscriptions, verify in your app:

1. Navigate to Profile → My Account
2. Tap to open Subscription Screen
3. Should see all 4 plans with correct prices:
   - Lite Monthly: $7.99/month
   - Lite Annual: $79.99/year
   - Standard Monthly: $14.99/month
   - Standard Annual: $149.00/year

---

That's all you need! Simple, clear, and ready to launch. 🚀
