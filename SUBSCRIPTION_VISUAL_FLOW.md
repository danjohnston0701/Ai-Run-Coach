# Google Play Subscriptions - Visual Flow Guide

## User Flow: From Free to Premium

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER SEES "GO PREMIUM" BUTTON IN APP                     │
│                                                             │
│ Dashboard Screen                                            │
│  ┌─────────────────────────────────────────────┐           │
│  │ Welcome Back, Runner! 🏃                    │           │
│  │                                             │           │
│  │ Your Runs: 42                              │           │
│  │ Distance: 264 km                           │           │
│  │                                             │           │
│  │ [  🚀 GO PREMIUM  ] ← User taps here      │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SUBSCRIPTION SCREEN OPENS                                │
│                                                             │
│ Go Premium                                                  │
│ ═══════════════════════════════════════════════════════════│
│                                                             │
│ ✓ Unlimited AI coaching sessions                           │
│ ✓ Advanced training plan customization                    │
│ ✓ Real-time performance analytics                        │
│ ✓ Priority support                                        │
│ ✓ Export training history                                │
│ ✓ Personalized injury prevention tips                   │
│                                                             │
│ ┌──────────────────────────────────────────────┐          │
│ │ Premium Monthly                  $9.99/month │          │
│ │ Renews automatically            [ SUBSCRIBE] │          │
│ └──────────────────────────────────────────────┘          │
│                                                             │
│ ┌──────────────────────────────────────────────┐          │
│ │ Premium Annual                   $79.99/year │          │
│ │ Best value - Renews automatically [SUBSCRIBE]│          │
│ └──────────────────────────────────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   User taps SUBSCRIBE
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. GOOGLE PLAY DIALOG OPENS                                 │
│                                                             │
│  ┌─────────────────────────────────────────────┐           │
│  │ Google Play                                 │           │
│  │                                             │           │
│  │ Continue with Google Account?              │           │
│  │ user@gmail.com                            │           │
│  │                                             │           │
│  │ Premium Monthly - $9.99/month              │           │
│  │ Renews automatically                        │           │
│  │                                             │           │
│  │ By continuing, you agree to Terms...       │           │
│  │                                             │           │
│  │         [ CONTINUE ]  [ CANCEL ]           │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                            ↓
             User confirms with payment method
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. PAYMENT PROCESSED BY GOOGLE PLAY                         │
│                                                             │
│ (Google handles payment securely)                          │
│ - Charges user's payment method                            │
│ - Verifies payment                                         │
│ - Notifies app of successful purchase                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. BillingManager RECEIVES PURCHASE UPDATE                  │
│                                                             │
│ onPurchasesUpdated() called                                │
│  ├─ Verifies purchase.purchaseState == PURCHASED          │
│  ├─ Calls acknowledgePurchase()                           │
│  ├─ Updates _userPurchases state                          │
│  └─ Notifies SubscriptionViewModel                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. APP UNLOCKS PREMIUM FEATURES                             │
│                                                             │
│ isPremiumUser() now returns TRUE                           │
│                                                             │
│ Dashboard Screen                                            │
│  ┌─────────────────────────────────────────────┐           │
│  │ Welcome Back, Premium Runner! ⭐           │           │
│  │                                             │           │
│  │ Your Runs: 42                              │           │
│  │ Distance: 264 km                           │           │
│  │                                             │           │
│  │ 📊 Advanced Analytics (UNLOCKED)           │           │
│  │  Pace Trend: +5% improvement               │           │
│  │  Heart Rate Zone: Optimal                  │           │
│  │  Injury Risk: LOW ✓                        │           │
│  │                                             │           │
│  │ ✅ Subscription Active - Premium Annual   │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. BACKEND VERIFICATION (Recommended)                       │
│                                                             │
│ App sends to backend:                                      │
│  - productId: "premium_monthly"                            │
│  - purchaseToken: "abc123..."                              │
│                                                             │
│ Backend verifies with Google Play Developer API:          │
│  - Confirms purchase authenticity                          │
│  - Confirms subscription is active                         │
│  - Confirms subscription not canceled                     │
│                                                             │
│ Database Updated:                                          │
│  user_premium = true                                       │
│  premium_expiry = 2026-07-08                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Diagram

```
                      GOOGLE PLAY STORE
                            │
                            │ purchases.observe()
                            ↓
                    ┌───────────────────┐
                    │  BillingManager   │
                    │  (Singleton)      │
                    │                   │
                    │ - initialize()    │
                    │ - launchBilling() │
                    │ - hasActive()     │
                    └────────┬──────────┘
                             │ StateFlow
                             ↓
                    ┌────────────────────┐
                    │ SubscriptionVM     │
                    │ (HiltViewModel)    │
                    │                    │
                    │ - subscriptions    │
                    │ - userPurchases    │
                    │ - isPremiumUser()  │
                    └────────┬───────────┘
                             │ StateFlow
                             ↓
                    ┌─────────────────────┐
                    │ SubscriptionScreen  │
                    │ (Compose UI)        │
                    │                     │
                    │ - Show plans        │
                    │ - Subscribe button  │
                    │ - Purchase handling │
                    └─────────────────────┘
                             │
                             │ User clicks Subscribe
                             ↓
                    ┌─────────────────────┐
                    │ Feature Gates       │
                    │ Throughout App      │
                    │                     │
                    │ if(isPremium()) {   │
                    │  show feature       │
                    │ }                   │
                    └─────────────────────┘
```

---

## State Flow Diagram

```
                    BillingManager States
                    ═══════════════════════

          ┌─────────────────────────────────┐
          │   subscriptionList              │
          │   List<ProductDetails>          │
          │                                 │
          │  [                              │
          │    ProductDetails {             │
          │      id: "premium_monthly"      │
          │      price: "$9.99"            │
          │      name: "Premium Monthly"    │
          │    },                           │
          │    ProductDetails {             │
          │      id: "premium_annual"       │
          │      price: "$79.99"           │
          │      name: "Premium Annual"     │
          │    }                            │
          │  ]                              │
          └─────────────────────────────────┘
                         │
                         │
          ┌──────────────┴──────────────┐
          │                             │
    ┌─────▼──────────┐        ┌────────▼────────┐
    │  userPurchases │        │  billingConnected
    │  List<Purchase>│        │  Boolean        │
    │                │        │                 │
    │  (empty)       │        │  true/false     │
    │    OR          │        │                 │
    │  [Purchase {   │        │ Determines if   │
    │    productId   │        │ UI can show     │
    │    status      │        │ subscriptions   │
    │    expiry      │        │                 │
    │  }]            │        └─────────────────┘
    └────────────────┘
         │
         │ When PURCHASED:
         │ isPremiumUser() = true
         │ Features unlock!
         │
         ↓
    User gets Premium access
```

---

## Subscription Lifecycle

```
┌──────────────┐
│ PENDING      │  (User taps Subscribe)
└──────┬───────┘
       │ User completes payment
       ↓
┌──────────────┐
│ PURCHASED    │  (Active subscription)
└──────┬───────┘
       │
       ├─────────────────────────────────┐
       │ Renews automatically            │ (Auto-renewal enabled)
       │ every month/year                │
       │                                 │
       └─────────────────────────────────┘
       │
       │ User cancels anytime in
       │ Google Play Store Settings
       │
       ↓
┌──────────────┐
│ CANCELED     │  (Subscription ends)
└──────┬───────┘
       │ (Access retained until end of period)
       │
       ↓
┌──────────────┐
│ EXPIRED      │  (Subscription ends)
└──────────────┘
       │ Access revoked
       │ isPremiumUser() = false
       │
       ↓
   Features lock
```

---

## Backend Validation Flow

```
┌─ App Receives Purchase ──────────────────┐
│                                          │
│ BillingManager.onPurchasesUpdated()      │
│  Purchase {                              │
│    productId: "premium_monthly"          │
│    purchaseToken: "abc123xyz..."         │
│    purchaseTime: 1623235000              │
│  }                                       │
└──────────────┬──────────────────────────┘
               │
               │ Send to Backend
               ↓
┌─ Your Backend Server ────────────────────┐
│                                          │
│ POST /api/subscriptions/validate         │
│ {                                        │
│   "productId": "premium_monthly",        │
│   "purchaseToken": "abc123xyz..."        │
│ }                                        │
└──────────────┬──────────────────────────┘
               │
               │ Verify with Google Play API
               ↓
┌─ Google Play Developer API ──────────────┐
│                                          │
│ Verify purchase authenticity             │
│ Confirm subscription is active           │
│ Confirm subscription not revoked         │
│ Return subscription details              │
│  - expiry: 2026-07-08                   │
│  - auto_renewing: true                  │
└──────────────┬──────────────────────────┘
               │
               │ Backend receives validation
               ↓
┌─ Update Your Database ───────────────────┐
│                                          │
│ user.premium = true                      │
│ user.premium_expiry = 2026-07-08        │
│ user.subscription_product = "monthly"    │
│                                          │
│ Response: { success: true }              │
└──────────────┬──────────────────────────┘
               │
               │ Send back to App
               ↓
┌─ Your App ───────────────────────────────┐
│                                          │
│ Receives: { success: true }              │
│                                          │
│ Premium features unlocked! ✓             │
│ Advanced Analytics enabled               │
│ AI Coach enabled                         │
│                                          │
└──────────────────────────────────────────┘
```

---

## Subscription Cancellation Flow

```
┌─ User Cancels Subscription ──────┐
│                                  │
│ User in Google Play Store:       │
│ Account → Subscriptions →        │
│ Premium Monthly ��� Cancel         │
└──────────────┬───────────────────┘
               │
               │ Google Play notifies app
               ↓
┌─ BillingManager Receives Update ─┐
│                                  │
│ onPurchasesUpdated()             │
│ Purchase.purchaseState =         │
│   CANCELED or EXPIRED            │
└──────────────┬───────────────────┘
               │
               ↓
┌─ Update UI State ────────────────┐
│                                  │
│ userPurchases = empty            │
│ isPremiumUser() = false          │
└──────────────┬───────────────────┘
               │
               ↓
┌─ Lock Premium Features ──────────┐
│                                  │
│ Advanced Analytics → LOCKED      │
│ AI Coach → LOCKED                │
│ Training Plans → LOCKED          │
│                                  │
│ Show "Upgrade to Premium"        │
│ button in UI                     │
└──────────────────────────────────┘
```

---

## Integration Checklist Flowchart

```
START
  │
  ├─ [ ] Gradle Sync (File → Sync Now)
  │
  ├─ [ ] Go to Google Play Console
  │       ├─ [ ] Create premium_monthly subscription
  │       └─ [ ] Create premium_annual subscription
  │
  ├─ [ ] Add SubscriptionScreen to Navigation
  │       └─ [ ] composable("subscription_screen") { ... }
  │
  ├─ [ ] Add "Go Premium" Button
  │       ├─ [ ] In Dashboard
  │       ├─ [ ] In Settings
  │       └─ [ ] In Feature Lock UI
  │
  ├─ [ ] Test Purchase Flow
  │       ├─ [ ] Add test account in Play Console
  │       ├─ [ ] Install debug build
  │       ├─ [ ] Tap "Subscribe"
  │       └─ [ ] Complete test purchase
  │
  ├─ [ ] Implement Feature Gates
  │       ├─ [ ] Check isPremiumUser()
  │       ├─ [ ] Lock premium features
  │       └─ [ ] Show upgrade prompts
  │
  ├─ [ ] Backend Integration
  │       ├─ [ ] Create validation endpoint
  │       ├─ [ ] Verify purchases with Google
  │       └─ [ ] Update user premium status
  │
  ├─ [ ] Update Privacy Policy
  │       └─ [ ] Mention subscription details
  │
  └─ [ ] Deploy to Play Store
        └─ LAUNCH! 🚀

SUCCESS: App monetized with subscriptions!
```

---

This visual guide shows the complete flow from when users first see the subscription button
all the way through to unlocking premium features. Each step integrates with the code
you already have implemented!
