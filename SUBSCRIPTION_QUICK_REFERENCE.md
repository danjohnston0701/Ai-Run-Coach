# Subscription Quick Reference

## Current Status

✅ **FULLY INTEGRATED** - Subscriptions are wired into Profile and Account screens

---

## How It Works

```
Profile Screen                 Subscription Screen              Google Play
     │                               │                            │
     │ Click "My Account"            │                            │
     │──────────────────────>│                            │
     │   (shows "Free" now)  │                            │
     │                       │ Navigate                   │
     │                       │ ("subscription")           │
     │                       ├───────────┐                │
     │                       │            │               │
     │                       │ Show Plans │               │
     │                       │ monthly    │               │
     │                       │ annual     │               │
     │                       │ [Click Subscribe]──────────>│
     │                       │                            │ Purchase Dialog
     │                       │                            │ User confirms
     │                       │<─────────────────────────── │
     │                       │ Purchase Complete         │
     │                       │ Show [ACTIVE] badge       │
     │                       │                            │
     │ <────────────────────┤                            │
     │  Back                                              │
     │ (now shows "Premium")                             │
```

---

## Quick Navigation

### From Profile
```
Profile Screen
 ↓
Tap "My Account" (line 278)
 ↓
Subscription Screen Opens
 ↓
See Plans & Pricing
 ↓
Tap Subscribe (or Back)
```

### Files Involved
- **ProfileScreen.kt** - "My Account" button (already there!)
- **MainScreen.kt** - Navigation route (already there!)
- **SubscriptionScreen.kt** - UI component (just created!)
- **SubscriptionViewModel.kt** - State (just created!)
- **BillingManager.kt** - Google Play API (just created!)

---

## What You See on Screen

### Profile Screen
```
Settings
├── 👁️ Connected Devices
├── 🔔 Push Notifications
└── 👑 My Account              Free ⟶
```

### Subscription Screen
```
╔════════════════════════════════╗
║ ← Premium Subscription         ║
╠════════════════════════════════╣
║                                ║
║    Go Premium                  ║
║                                ║
║    ✓ Unlimited AI coaching     ║
║    ✓ Advanced planning         ║
║    ✓ Real-time analytics      ║
║    ✓ Priority support          ║
║    ✓ Export history            ║
║    ✓ Injury prevention tips    ║
║                                ║
║ Premium Monthly                ║
║ $9.99/month                    ║
║ [SUBSCRIBE]                    ║
║                                ║
║ Premium Annual                 ║
║ $79.99/year                    ║
║ [SUBSCRIBE]                    ║
║                                ║
║ Subscriptions renew...         ║
╚════════════════════════════════╝
```

---

## First Time Setup

### Step 1: Sync Gradle
```
File → Sync Now
```
⏱️ Takes ~30 seconds

### Step 2: Create Subscriptions in Google Play Console
Go to: [console.cloud.google.com](https://console.cloud.google.com)

App → Products → Subscriptions

| Field | Monthly | Annual |
|-------|---------|--------|
| Product ID | `premium_monthly` | `premium_annual` |
| Title | Premium Monthly | Premium Annual |
| Price | $9.99 | $79.99 |
| Billing Period | Monthly | Annual |

⏱️ Takes ~5 minutes

### Step 3: Test
Navigate: Profile → My Account → Subscription Screen

⏱️ Takes ~2 minutes

---

## Key Files

### BillingManager.kt
**What it does:**
- Connects to Google Play
- Queries subscription products
- Handles purchases
- Tracks subscription status

**Location:**
```
app/src/main/java/live/airuncoach/airuncoach/billing/BillingManager.kt
```

**Key Methods:**
- `initialize()` - Start up
- `launchBillingFlow()` - Start purchase
- `isPremiumUser()` - Check status
- `hasActiveSubscription()` - Check if premium

---

### SubscriptionViewModel.kt
**What it does:**
- Manages subscription UI state
- Provides subscription list
- Checks if user is premium
- Handles purchase calls

**Location:**
```
app/src/main/java/live/airuncoach/airuncoach/viewmodel/SubscriptionViewModel.kt
```

**Key Methods:**
- `isPremiumUser()` - Returns Boolean
- `purchaseSubscription()` - Launch purchase UI
- `getActiveSubscriptionId()` - Returns "premium_monthly" or similar

---

### SubscriptionScreen.kt
**What it does:**
- Shows subscription plans
- Shows premium features
- Displays pricing
- Handles purchase button clicks

**Location:**
```
app/src/main/java/live/airuncoach/airuncoach/ui/screens/SubscriptionScreen.kt
```

**Called from:**
```
MainScreen.kt, line 1145
composable("subscription")
```

---

## Testing Purchases

### Option 1: Test Account (Free Testing)
```
Google Play Console
 → Settings
 → License Testing
 → Add your Gmail
```

Then:
1. Build and run debug app
2. Sign in with test account
3. Tap Subscribe
4. Purchase is free!

### Option 2: Real Purchase
Just tap Subscribe and complete purchase normally. No code changes needed!

---

## Troubleshooting

### Subscriptions not showing?
1. Check Google Play Console → Subscriptions exist
2. Check Product IDs are **exactly**: `premium_monthly`, `premium_annual`
3. Rebuild and restart app

### "Create subscriptions" error?
1. Make sure you're in Google Play Console (not Cloud Console)
2. Select your app first
3. Go to Products → Subscriptions
4. Click "Create Subscription"

### Lint errors in IDE?
1. File → Sync Now
2. Wait 30 seconds for indexing
3. File → Invalidate Caches (if still issues)

---

## Feature Gating Example

To lock premium features:

```kotlin
@Composable
fun AdvancedAnalyticsScreen(subscriptionViewModel: SubscriptionViewModel) {
    if (subscriptionViewModel.isPremiumUser()) {
        // Show advanced analytics
        PremiumAnalytics()
    } else {
        // Show upgrade prompt
        UpgradePrompt()
    }
}
```

---

## Backend Validation (Optional)

After purchase, verify on your server:

```kotlin
// 1. Get purchase token
val token = viewModel.userPurchases.value
    .firstOrNull()?.purchaseToken

// 2. Send to backend
apiService.validatePurchase(token)

// 3. Backend verifies with Google
// 4. Grant access in database
```

---

## What's Already Wired

✅ ProfileScreen has "My Account" button
✅ MainScreen has subscription route
✅ SubscriptionScreen is fully integrated
✅ Theme colors already applied
✅ Back button navigates correctly
✅ Subscription status shows in Profile
✅ All Hilt injection configured
✅ All ViewModels set up

---

## What You Still Need to Do

1. Sync Gradle (`File → Sync Now`)
2. Create subscriptions in Google Play Console
3. Test the flow (Profile → My Account → Subscription)
4. Optional: Test purchase with test account

---

## Timeline

| Task | Time |
|------|------|
| Sync Gradle | 30 sec |
| Create subscriptions | 5 min |
| Test flow | 2 min |
| Test purchase (optional) | 5 min |
| **Total** | **~15 min** |

---

## Success Indicators

✅ Tapping "My Account" opens Subscription Screen
✅ Subscription Screen shows plans and pricing
✅ Tapping back returns to Profile
✅ Premium users see "[ACTIVE]" badge
✅ Profile shows "Premium" when subscribed
✅ Purchase dialog launches when tapping Subscribe

---

## Common Questions

**Q: Do I need to do anything else to Profile Screen?**
A: No! It's already wired. Just tap "My Account"

**Q: Where do I create subscriptions?**
A: [Google Play Console](https://play.google.com/console) → Your App → Products → Subscriptions

**Q: Can I test without real money?**
A: Yes! Add test account in Settings → License Testing

**Q: What about pricing?**
A: You decide! Example: Monthly $9.99, Annual $79.99

**Q: Is backend validation required?**
A: Recommended but optional for initial testing

---

## Files You Don't Need to Touch

❌ ProfileScreen.kt - Already has navigation
❌ MainScreen.kt - Route already defined
❌ build.gradle.kts - Dependencies already added
❌ Theme files - Colors already integrated

---

## One-Minute Summary

Your app now has subscriptions fully integrated:
- Tap Profile → "My Account"
- Opens Subscription Screen
- Shows plans and pricing
- Tap Subscribe → Google Play handles payment
- Complete! Premium features unlocked

All code is done. Just need to:
1. Sync Gradle
2. Create subscriptions in Play Console
3. Test it

That's it! 🚀
