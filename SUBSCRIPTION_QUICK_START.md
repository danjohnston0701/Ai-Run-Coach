# Google Play Subscriptions - Quick Start Guide

## ✅ What I've Done For You

I've added complete subscription infrastructure to your AiRunCoach app:

### New Files Created:
1. **`BillingManager.kt`** - Handles all Google Play Billing logic
   - Query available subscriptions
   - Launch purchase flow
   - Handle purchases
   - Track user's active subscription

2. **`SubscriptionViewModel.kt`** - State management for subscription UI
   - Exposes subscription list
   - Manages purchase UI state
   - Checks if user is premium

3. **`SubscriptionScreen.kt`** - Beautiful Compose UI component
   - Shows available plans
   - Displays features
   - Handles purchase button
   - Shows current subscription status

4. **`build.gradle.kts`** - Updated with Google Play Billing library
   - Added: `com.android.billingclient:billing-ktx:7.0.0`

---

## 🔧 First Steps: Gradle Sync

1. **Open your project** in Android Studio
2. Click **File** → **Sync Now** 
3. Wait for Gradle to finish syncing (this resolves IDE errors)
4. You may see a prompt to install SDK updates - click **Install**

---

## 🎯 Google Play Console: Create Subscriptions

⚠️ **IMPORTANT**: You must create subscription products in Play Console BEFORE the app can sell them.

### Step 1: Create Monthly Subscription

1. Go to [Google Play Console](https://play.google.com/console) → Your App
2. **Left menu**: Products → **Subscriptions**
3. Click **Create Subscription**
4. Fill in:
   - **Product ID**: `premium_monthly` ← Must match code exactly!
   - **Title**: Premium Monthly
   - **Description**: Unlock all premium coaching features
   - **Billing period**: Monthly
   - **Default price**: Set your price (e.g., $9.99)
   - Check **Auto-renewal**
5. Click **Save**

### Step 2: Create Annual Subscription

1. **Create Subscription** again
2. Fill in:
   - **Product ID**: `premium_annual` ← Must match code exactly!
   - **Title**: Premium Annual
   - **Description**: Best value - full year of premium features
   - **Billing period**: Annual
   - **Default price**: ~20% discount of monthly ($79.99 if monthly is $9.99)
   - Check **Auto-renewal**
3. Click **Save**

✅ Now your app can show these subscriptions!

---

## 📱 Add Subscription Button to Your App

### Option A: Simple - Add to Dashboard

In `DashboardScreen.kt`, add a "Upgrade" button:

```kotlin
// In your DashboardScreen composable
Button(
    onClick = { navController.navigate("subscription_screen") },
    modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp)
) {
    Text("🚀 Go Premium")
}
```

### Option B: Add to Navigation

In your main navigation/routing file:

```kotlin
composable("subscription_screen") {
    SubscriptionScreen(onBackClick = { navController.popBackStack() })
}
```

Then navigate to it:
```kotlin
navController.navigate("subscription_screen")
```

---

## 💎 Gate Premium Features

### Check if User is Premium

```kotlin
@HiltViewModel
class YourScreenViewModel @Inject constructor(
    private val subscriptionViewModel: SubscriptionViewModel
) : ViewModel() {
    
    fun isPremiumUser(): Boolean = subscriptionViewModel.isPremiumUser()
}
```

### Hide Features Behind Paywall

```kotlin
@Composable
fun AdvancedFeature(subscriptionViewModel: SubscriptionViewModel) {
    if (subscriptionViewModel.isPremiumUser()) {
        // Show premium content
        Text("Advanced Analytics - Exclusive for Premium!")
    } else {
        // Show upgrade prompt
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("📊 Advanced Analytics Available with Premium", fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = { /* Navigate to SubscriptionScreen */ }) {
                Text("Upgrade Now")
            }
        }
    }
}
```

---

## 🧪 Test the Flow

### Test Account Setup (Recommended)

1. In Play Console: **Settings** → **License Testing**
2. Add your test Gmail account
3. Build and run your debug app on a device
4. Tap "Go Premium" → "Subscribe"
5. Complete purchase with test account (won't be charged)

### What Happens:

1. ✅ User taps "Subscribe" button
2. ✅ Google Play purchase dialog opens
3. ✅ User completes payment
4. ✅ `BillingManager.onPurchasesUpdated()` is called
5. ✅ Purchase is acknowledged automatically
6. ✅ `subscriptionViewModel.isPremiumUser()` returns `true`

---

## 🔐 Backend Verification (Important!)

After a purchase, validate it on your server:

```kotlin
// 1. Get purchase token from BillingManager
val purchaseToken = subscriptionViewModel.userPurchases.value.firstOrNull()?.purchaseToken

// 2. Send to your backend
val response = apiService.validateSubscription(
    productId = "premium_monthly",
    purchaseToken = purchaseToken
)

// 3. Backend should verify with Google Play Developer API
// See: https://developer.android.com/google/play/billing/integrate
```

---

## 📋 Checklist

- [ ] Gradle sync complete (File → Sync Now)
- [ ] Created `premium_monthly` subscription in Play Console
- [ ] Created `premium_annual` subscription in Play Console
- [ ] Added SubscriptionScreen to navigation
- [ ] Added "Go Premium" button to your UI
- [ ] Tested subscription flow with test account
- [ ] Added feature gates to premium features
- [ ] Backend purchase validation implemented
- [ ] Updated app privacy policy to mention subscriptions
- [ ] Ready to submit to Play Store! 🚀

---

## 📞 Troubleshooting

### "Unresolved reference" errors in IDE?
- Click **File** → **Sync Now** to resync Gradle
- Wait for background indexing to finish
- Invalidate cache if needed: **File** → **Invalidate Caches** → **Clear indexes and caches**

### App crashes when opening SubscriptionScreen?
- Ensure Gradle sync completed successfully
- Check that `@HiltViewModel` is properly annotated on SubscriptionViewModel
- Verify `initialize()` is called when app starts

### Subscriptions not showing?
- Check Play Console: Products → Subscriptions (should see both plans)
- Verify Product IDs match: `premium_monthly`, `premium_annual`
- Rebuild and reinstall app

### Can't purchase even with test account?
- Make sure test account is added in Play Console Settings
- Install the app build that includes the BillingManager
- Make sure user is signed in with test account on device

---

## 🎉 Next Steps

1. **Sync Gradle** (File → Sync Now)
2. **Create subscriptions** in Play Console
3. **Add UI elements** to your app
4. **Test the flow** with a test account
5. **Implement backend validation**
6. **Monitor metrics** after launch

Your app is ready for monetization! Good luck! 🚀
