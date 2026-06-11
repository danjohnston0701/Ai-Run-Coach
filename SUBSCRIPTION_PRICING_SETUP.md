# Subscription Pricing Setup Guide

## Pricing Structure

Your app has **two tiers** with **monthly and annual billing options**.

### Lite Tier
- **Monthly**: $7.99 USD
- **Annual**: $79.99 USD (17% savings)

### Standard Tier
- **Monthly**: $14.99 USD
- **Annual**: $149.00 USD (17% savings)

---

## Google Play Console Setup

You need to create **4 subscription products** in Google Play Console.

### Step 1: Create Lite Monthly Subscription

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app → **Products** → **Subscriptions**
3. Click **Create Subscription**

**Fill in these details:**

| Field | Value |
|-------|-------|
| **Product ID** | `lite_monthly` |
| **Default language** |  |
| Title | Lite Monthly |
| Description | AI-powered training guidance with weekly coaching tips and performance tracking |
| Billing Period | Monthly |
| Price | $7.99 USD |
| Free Trial | (Optional - leave blank) |
| Auto-renewal | ✅ Enabled |

4. Click **Save**

---

### Step 2: Create Lite Annual Subscription

Click **Create Subscription** again

**Fill in these details:**

| Field | Value |
|-------|-------|
| **Product ID** | `lite_annual` |
| **Default language** |  |
| Title | Lite Annual |
| Description | AI-powered training guidance with weekly coaching tips and performance tracking. Save 17% with annual billing! |
| Billing Period | Annual |
| Price | $79.99 USD |
| Free Trial | (Optional - leave blank) |
| Auto-renewal | ✅ Enabled |

4. Click **Save**

---

### Step 3: Create Standard Monthly Subscription

Click **Create Subscription** again

**Fill in these details:**

| Field | Value |
|-------|-------|
| **Product ID** | `standard_monthly` |
| **Default language** |  |
| Title | Standard Monthly |
| Description | Full suite of AI coaching, advanced analytics, custom training plans, injury prevention, and priority support |
| Billing Period | Monthly |
| Price | $14.99 USD |
| Free Trial | (Optional - leave blank) |
| Auto-renewal | ✅ Enabled |

4. Click **Save**

---

### Step 4: Create Standard Annual Subscription

Click **Create Subscription** again

**Fill in these details:**

| Field | Value |
|-------|-------|
| **Product ID** | `standard_annual` |
| **Default language** |  |
| Title | Standard Annual |
| Description | Full suite of AI coaching, advanced analytics, custom training plans, injury prevention, and priority support. Save 17% with annual billing! |
| Billing Period | Annual |
| Price | $149.00 USD |
| Free Trial | (Optional - leave blank) |
| Auto-renewal | ✅ Enabled |

4. Click **Save**

---

## Product IDs Reference

**IMPORTANT: Product IDs MUST match exactly (case-sensitive)**

```
lite_monthly      → $7.99/month
lite_annual       → $79.99/year
standard_monthly  → $14.99/month
standard_annual   → $149.00/year
```

The app code is already configured to query these exact product IDs.

---

## Lite Tier Features

✓ AI-powered training guidance
✓ Basic performance tracking
✓ Weekly coaching tips
✓ Mobile app access

---

## Standard Tier Features

✓ All Lite features, plus:
✓ Advanced training plan customization
✓ Real-time performance analytics
✓ Injury prevention recommendations
✓ Priority support
✓ Export training history
✓ Custom coaching sessions

---

## Display in App

### Subscription Screen Layout

```
┌─────────────────────────────────────────┐
│ Choose Your Plan                        │
│                                         │
│ What's Included                         │
│ ┌────────────────────────────────────┐ │
│ │ Lite          │ Standard           │ │
│ │ ✓ AI guidance │ ✓ All Lite + ...  │ │
│ │ ✓ Tracking    │ ✓ Advanced plans   │ │
│ │ ✓ Tips        │ ✓ Analytics        │ │
│ │ ✓ Mobile app  │ ✓ Injury prevent   │ │
│ │               │ ✓ Priority support │ │
│ │               │ ✓ Export data      │ │
│ │               │ ✓ Custom sessions  │ │
│ └────────────────────────────────────┘ │
│                                         │
│ Lite Plan                               │
│ Essential AI coaching features          │
│                                         │
│ ┌────────────────┐ ┌─────────────────┐│
│ │ Monthly        │ │ Annual          ││
│ │ $7.99/month    │ │ $79.99/year     ││
│ │ [SUBSCRIBE]    │ │ Save 33%        ││
│ │                │ │ [SUBSCRIBE]     ││
│ └────────────────┘ └─────────────────┘│
│                                         │
│ Standard Plan                           │
│ Full suite of AI coaching and analytics│
│                                         │
│ ┌────────────────┐ ┌─────────────────┐│
│ │ Monthly        │ │ Annual          ││
│ │ $14.99/month   │ │ $149.00/year    ││
│ │ [SUBSCRIBE]    │ │ Save 33%        ││
│ │                │ │ [SUBSCRIBE]     ││
│ └────────────────┘ └─────────────────┘│
│                                         │
│ Your Subscription                       │
│ lite_monthly (if purchased)             │
│                                         │
└─────────────────────────────────────────┘
```

---

## Pricing Comparison Table

| Feature | Lite | Standard |
|---------|------|----------|
| AI Training Guidance | ✓ | ✓ |
| Performance Tracking | ✓ | ✓ |
| Weekly Coaching Tips | ✓ | ✓ |
| Mobile App Access | ✓ | ✓ |
| Advanced Plan Customization | ✗ | ✓ |
| Real-time Analytics | ✗ | ✓ |
| Injury Prevention Recommendations | ✗ | ✓ |
| Priority Support | ✗ | ✓ |
| Export Training History | ✗ | ✓ |
| Custom Coaching Sessions | ✗ | ✓ |
| **Monthly Price** | **$7.99** | **$14.99** |
| **Annual Price** | **$79.99** | **$149.00** |
| **Annual Savings** | 17% | 17% |

---

## Checklist

- [ ] Created `lite_monthly` subscription ($7.99/month)
- [ ] Created `lite_annual` subscription ($79.99/year)
- [ ] Created `standard_monthly` subscription ($14.99/month)
- [ ] Created `standard_annual` subscription ($149.00/year)
- [ ] All Product IDs match exactly (case-sensitive)
- [ ] Verified prices are in USD
- [ ] Enabled auto-renewal for all products
- [ ] Tested navigation to Subscription Screen
- [ ] Verified plans display correctly in app

---

## Testing

### With Test Account

1. In Play Console: **Settings** → **License Testing**
2. Add your test Gmail account
3. In your app:
   - Go to Profile → My Account
   - See all 4 plans
   - Tap any Subscribe button
   - Completes test purchase (FREE - no charge)
4. Verify ACTIVE badge shows on screen

### Pricing Verification in App

The app fetches real pricing from Google Play. If prices don't show:
1. Verify Product IDs match exactly
2. Rebuild and reinstall app
3. Check Google Play Console for any warnings

---

## Annual Savings Display

The app automatically shows "Save 17%" badge on annual plans because:
- Lite Annual cost: $79.99 vs Monthly × 12: $95.88
- Standard Annual cost: $149.00 vs Monthly × 12: $179.88
- Savings: ~17%

**Calculation:**
- Lite: ($95.88 - $79.99) / $95.88 = 16.6% ≈ 17%
- Standard: ($179.88 - $149.00) / $179.88 = 17.2% ≈ 17%

This is calculated and displayed automatically based on pricing.

---

## Common Mistakes to Avoid

❌ **Wrong Product IDs** - Must be exactly: `lite_monthly`, `lite_annual`, `standard_monthly`, `standard_annual`

❌ **Typos in names** - "Lite Monthly" not "lite monthly" (case matters for Product ID, not for display name)

❌ **Forgetting to enable auto-renewal** - Must be enabled for subscriptions

❌ **Wrong currency** - Make sure prices are in USD ($)

❌ **Missing descriptions** - Add clear descriptions so users understand what they're paying for

---

## If You Need to Change Pricing Later

1. Go to Google Play Console → Your Subscription → Edit
2. Click on pricing
3. Change the price
4. Click Save
5. Changes take effect in ~30 minutes

---

## Support

If you have issues:

1. **Subscriptions not showing in app** - Check Product IDs match exactly
2. **Prices showing as "Loading..."** - Give app ~30 seconds to fetch from Google Play
3. **Test purchase not working** - Verify test account is added in Settings → License Testing
4. **Can't edit pricing** - Some prices are locked during certain app states; refresh Play Console

---

## Summary

You need to create 4 subscriptions in Google Play Console:

| Product ID | Price | Billing |
|-----------|-------|---------|
| `lite_monthly` | $7.99 | Monthly |
| `lite_annual` | $79.99 | Annually |
| `standard_monthly` | $14.99 | Monthly |
| `standard_annual` | $149.00 | Annually |

Your app is already configured to display and sell these plans. Just create them in Play Console and you're ready to launch!
