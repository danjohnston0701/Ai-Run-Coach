# Google Play Store Subscription Setup Guide

This guide will help you set up subscriptions for your AiRunCoach app on Google Play Store.

## Overview

Your app now has complete subscription infrastructure with:
- ✅ `BillingManager` - Handles all Google Play Billing API interactions
- ✅ `SubscriptionViewModel` - Manages subscription UI state
- ✅ `SubscriptionScreen` - Beautiful Compose UI for subscription purchasing
- ✅ `build.gradle.kts` - Updated with Google Play Billing library

---

## Step 1: Create Subscription Products in Google Play Console

### Access Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Sign in with your Google developer account
3. Select your app (**AiRunCoach**)

### Create First Subscription (Monthly)

1. **Navigate to Products**:
   - Left menu: **Products** → **Subscriptions**
   - Click **Create Subscription**

2. **Fill in Monthly Plan Details**:
   - **Product ID**: `premium_monthly` (must match code!)
   - **Default language**:
     - **Title**: Premium Monthly
     - **Description**: Unlock all premium AI coaching features with auto-renewal
   - **Billing period**: Monthly
   - **Default price**: Set your price (e.g., $9.99)
   - **Free trial**: Optional (e.g., 7 days)
   - **Auto-renewal**: ✅ Enabled

3. Click **Save**

### Create Second Subscription (Annual)

Repeat the process with:
- **Product ID**: `premium_annual`
- **Title**: Premium Annual
- **Description**: Best value - Full year of premium features
- **Billing period**: Annual
- **Default price**: Set your price (e.g., $79.99 - typically 20-30% discount)

---

## Step 2: Integrate SubscriptionScreen in Your App

### Option A: Add to DashboardScreen Navigation

Edit your **navigation/routing logic** to add the subscription screen:

```kotlin
// In your main navigation/routing
navController.navigate("subscription_screen")

// Handle the route:
composable("subscription_screen") {
    SubscriptionScreen(onBackClick = { navController.popBackStack() })
}
```

### Option B: Add Settings Menu Option

Add a "Go Premium" or "Upgrade" button in your Dashboard or Settings:

```kotlin
Button(
    onClick = { navController.navigate("subscription_screen") },
    modifier = Modifier.fillMaxWidth()
) {
    Text("🚀 Upgrade to Premium")
}
```

---

## Step 3: Integrate Premium Features in Your Code

### Check if User Has Premium

Use `SubscriptionViewModel` in any screen:

```kotlin
@HiltViewModel
class YourScreenViewModel @Inject constructor(
    val subscriptionViewModel: SubscriptionViewModel
) : ViewModel() {
    
    fun isPremiumUser(): Boolean = subscriptionViewModel.isPremiumUser()
}
```

### Lock Features Behind Premium

```kotlin
@Composable
fun AdvancedAnalyticsCard(subscriptionViewModel: SubscriptionViewModel) {
    if (subscriptionViewModel.isPremiumUser()) {
        // Show premium analytics
        AnalyticsChart()
    } else {
        // Show upgrade prompt
        Column {
            Text("📊 Advanced Analytics")
            Button(onClick = { /* navigate to subscription */ }) {
                Text("Upgrade to Premium")
            }
        }
    }
}
```

### Example: Feature Limits

```kotlin
// In your coaching/feature logic
val maxFreeCoachingSessions = 3
val userCoachingSessions = getUserSessionCount()

if (userCoachingSessions >= maxFreeCoachingSessions && 
    !subscriptionViewModel.isPremiumUser()) {
    // Show upgrade screen
    showUpgradeDialog()
}
```

---

## Step 4: Test Subscriptions (Optional but Recommended)

### Set Up Test Accounts

1. In Play Console: **Settings** → **License Testing**
2. Add test email accounts (Gmail)
3. In your app's `build.gradle.kts`, build and install on a test device
4. Purchase will use the test account, **no real charges**

### Test Purchase Flow

1. Open your app
2. Navigate to Subscription Screen
3. Tap "Subscribe"
4. Complete purchase with test account
5. Verify purchase acknowledgement in `BillingManager.acknowledgePurchase()`

---

## Step 5: Backend Integration (Important!)

After a user purchases, you should:

### 1. Acknowledge the Purchase
- ✅ Already handled in `BillingManager.acknowledgePurchase()`
- This tells Google the app received the purchase

### 2. Verify Purchase on Your Backend

Create an endpoint to validate purchases:

```kotlin
// In your API service
suspend fun verifySubscription(purchaseToken: String): Boolean {
    return apiService.validatePurchase(
        productId = "premium_monthly",
        purchaseToken = purchaseToken
    )
}
```

### 3. Grant Access on Backend

After verification, mark user as premium in your database:

```kotlin
// Update user in your backend
api.updateUserPremiumStatus(
    userId = currentUser.id,
    isPremium = true,
    expiresAt = purchaseExpiry
)
```

### 4. Server-Side Verification (Recommended)

Use Google Play Developer API to verify:
- Purchase token authenticity
- Subscription status and expiry
- Handle subscription cancellations

See: [Google Play Billing Documentation](https://developer.android.com/google/play/billing/integrate)

---

## Step 6: Handle Subscription Cancellations

### Users Can Cancel Anytime In:
- Google Play Store app → Account → Subscriptions
- Your app settings menu (optional)

### Monitor Cancellations

Listen to purchase updates in `BillingManager`:

```kotlin
// Already implemented in onPurchasesUpdated()
// When user cancels, purchase.purchaseState changes

// Check subscription status periodically:
subscriptionViewModel.userPurchases.collect { purchases ->
    if (purchases.isEmpty()) {
        // User no longer has active subscription
        revokeAccessToPrereq()
    }
}
```

---

## Step 7: Deployment Checklist

Before submitting to Play Store:

- [ ] Created subscription products in Play Console (`premium_monthly`, `premium_annual`)
- [ ] Integrated `SubscriptionScreen` into your navigation
- [ ] Added premium feature checks in relevant screens
- [ ] Backend purchase validation implemented
- [ ] Tested with test account (optional)
- [ ] Set competitive pricing
- [ ] Updated app privacy policy to mention subscriptions
- [ ] Updated app description to highlight premium features
- [ ] Added "Go Premium" or similar CTA in your UI

---

## Step 8: Best Practices

### Pricing Strategy
- **Monthly**: Higher price ($9.99 - $14.99)
- **Annual**: 25-30% discount vs. monthly ($59.99 - $99.99)
- Research competitor pricing in health/fitness category

### Maximize Conversions
- Show value before asking to upgrade
- Use limited free tier (e.g., 3 free sessions)
- Display clear benefits in subscription screen
- Add social proof/testimonials

### User Retention
- Send value-add emails before renewal
- Show usage stats that highlight premium value
- Offer occasional discount codes
- Monitor churn and adjust pricing/features

---

## File Structure

```
app/src/main/java/live/airuncoach/airuncoach/
├── billing/
│   └── BillingManager.kt          # ✅ Google Play Billing API wrapper
├── viewmodel/
│   └── SubscriptionViewModel.kt   # ✅ Subscription state management
└── ui/screens/
    └── SubscriptionScreen.kt      # ✅ Beautiful subscription UI
```

---

## Troubleshooting

### "Your app doesn't have any subscriptions yet"
**Solution**: Go to Google Play Console → Products → Subscriptions → Create at least one subscription product

### Purchase not working in development
**Solution**: 
1. Use test account (set in License Testing)
2. Install debug build from Android Studio
3. Verify `BillingManager.initialize()` is called in your app startup

### Users see old prices
**Solution**: App fetches prices from Play Console on each app load via `querySubscriptions()`

### Subscription not showing as purchased
**Solution**: 
1. Check `BillingManager.acknowledgePurchase()` was called
2. Verify purchase token validation on your backend
3. Check user's Google Play account is the same across devices

---

## Next Steps

1. **Create subscriptions** in Google Play Console
2. **Test the subscription flow** with a test account
3. **Implement backend validation** to verify purchases
4. **Add feature limits** to encourage premium upgrades
5. **Monitor conversion rates** and adjust pricing
6. **Release to production** - subscriptions will appear in Play Store!

Good luck with your premium monetization! 🚀
