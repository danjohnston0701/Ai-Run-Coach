# Promo Code System — Reinstatement Guide

## Overview

The **promo code system** is **already fully implemented** in the backend and partially integrated in the Android app. This guide explains what exists, what needs to be connected, and how to manage promo codes directly in the database.

---

## ✅ What Already Exists

### Backend (Server)

**File**: `server/coupon-service.ts`

- ✅ `redeemPromoCode()` — Validates and applies promo codes
- ✅ `hasUnlimitedGrant()` — Checks if user has active unlimited grant
- ✅ `getUserActiveGrants()` — Fetches user's active promo grants

**Endpoints**:
- `POST /api/promo-codes/redeem` — Redeem a code
- `GET /api/promo-codes/active-grants` — View active grants

**Usage Service** (`server/usage-service.ts`):
- ✅ `checkAndEnforceLimit()` — Already checks for active promo grants BEFORE enforcing limits
- ✅ If user has unlimited grant → returns true (allows feature use)
- ✅ Otherwise → enforces monthly limits

**Database**:
- ✅ `coupon_codes` table — Stores promo code definitions
- ✅ `user_coupons` table — Tracks which users have redeemed which codes

### Android App

**Files**:
- ✅ `PromoCodeDialog.kt` — Beautiful dialog for entering promo codes
- ✅ `PromoCodeModels.kt` — Request/response data classes
- ✅ `ApiService.kt` — API methods for redeeming codes

**Integration Points**:
- ✅ `FeatureLimitUpsellScreen.kt` — Has `onPromoCodeClick` callback
- ✅ `MainScreen.kt` — Shows upsell screens when limits hit
- ⚠️ **ISSUE**: `onPromoCodeClick` handlers just pop the stack — they don't show the PromoCodeDialog

---

## ❌ What's Missing

The promo code dialog is **NOT being shown** when users hit a feature limit. The handlers in `MainScreen.kt` at lines 424, 766, and 839 just navigate back instead of showing the `PromoCodeDialog`.

---

## 🔧 How to Reinstate

### Step 1: Update `MainScreen.kt` to Show Promo Code Dialog

We need to add state to manage the promo code dialog and integrate it into the feature limit upsell flows.

**Changes Required**:

At line ~78, add:
```kotlin
var showPromoCodeDialog by remember { mutableStateOf(false) }
var featureNameForPromo by remember { mutableStateOf("") }
```

Then replace the three `onPromoCodeClick = { ... }` handlers:

**At line 424** (RunRouteLimitUpsellScreen legacy):
```kotlin
onPromoCodeClick = {
    featureNameForPromo = "Run Route Creation"
    showPromoCodeDialog = true
},
```

**At line 766** (AiPlanLimitUpsellScreen):
```kotlin
onPromoCodeClick = {
    featureNameForPromo = "AI Plan Generation"
    showPromoCodeDialog = true
},
```

**At line 839** (RunRouteLimitUpsellScreen active):
```kotlin
onPromoCodeClick = {
    featureNameForPromo = "Run Route Creation"
    showPromoCodeDialog = true
},
```

### Step 2: Add PromoCodeDialog at End of MainScreen

Before the `LocationPermissionDialog` (around line 1167), add:

```kotlin
// Promo Code Dialog
if (showPromoCodeDialog) {
    val context = LocalContext.current
    val apiService = remember { 
        // Get ApiService instance (you may need to inject it via ViewModel)
        // For now, this shows the pattern
    }
    var isLoading by remember { mutableStateOf(false) }
    var promoError by remember { mutableStateOf<String?>(null) }
    
    PromoCodeDialog(
        isVisible = showPromoCodeDialog,
        onDismiss = {
            showPromoCodeDialog = false
            promoError = null
        },
        onRedeem = { code ->
            isLoading = true
            promoError = null
            // Call API to redeem promo code
            // apiService.redeemPromoCode(PromoCodeRequest(code))
            // On success: show success dialog and reload feature availability
            // On error: show error message
        },
        isLoading = isLoading
    )
}
```

### Step 3: Create or Update FeatureLimitViewModel to Handle Promo Redemption

Add these methods to the ViewModel that handles feature limits:

```kotlin
suspend fun redeemPromoCode(code: String): Result<String> {
    return try {
        val response = apiService.redeemPromoCode(PromoCodeRequest(code))
        if (response.success) {
            // Refresh feature availability after redemption
            checkAiPlanAvailability()
            checkRunRouteAvailability()
            Result.success(response.message ?: "Promo code applied successfully!")
        } else {
            Result.failure(Exception(response.message ?: "Invalid promo code"))
        }
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

---

## 📊 Database: Creating Promo Codes

You manage promo codes **directly in the database** — no UI needed.

### Create a Founder/Admin Unlimited Code

```sql
INSERT INTO coupon_codes (code, type, duration_days, max_uses, is_active, expires_at)
VALUES (
  'founder_1yr',
  'unlimited_all',
  365,
  10,
  true,
  '2027-06-23'
);
```

### Parameters

| Field | Meaning | Example |
|-------|---------|---------|
| `code` | The promo code (case-insensitive) | `'FOUNDER_1YR'` |
| `type` | What features to unlock | `'unlimited_all'` |
| `duration_days` | How long access lasts | `365` (1 year) |
| `max_uses` | Limit redemptions (null = unlimited) | `10` or `NULL` |
| `is_active` | Enable/disable the code | `true` |
| `expires_at` | When the code itself expires | `'2027-06-23'` |

### Coupon Types

- **`unlimited_all`** — Unlimited Plans, Routes, Analyses
- **`unlimited_plans`** — Plans only
- **`unlimited_routes`** — Routes only
- **`unlimited_analyses`** — Post-run analysis only

### Example: Admin/Founder Codes

```sql
-- Unlimited access for 1 year, 10 uses max
INSERT INTO coupon_codes (code, type, duration_days, max_uses, is_active, expires_at)
VALUES ('FOUNDER_1YR', 'unlimited_all', 365, 10, true, '2027-06-23');

-- Unlimited access for 1 year, unlimited uses (for testing)
INSERT INTO coupon_codes (code, type, duration_days, max_uses, is_active, expires_at)
VALUES ('ADMIN_TEST', 'unlimited_all', 365, NULL, true, '2027-12-31');

-- Limited-time offer: 30 days unlimited, 100 redemptions
INSERT INTO coupon_codes (code, type, duration_days, max_uses, is_active, expires_at)
VALUES ('EARLY_ACCESS', 'unlimited_all', 30, 100, true, '2026-08-23');
```

---

## 🧪 Testing the System

### 1. Create a Test Code in Database

```sql
INSERT INTO coupon_codes (code, type, duration_days, max_uses, is_active)
VALUES ('TEST123', 'unlimited_all', 30, 5, true);
```

### 2. Hit a Feature Limit in App

- Generate plans until you hit the free tier limit (1/month)
- Tap **"Have a Promo Code?"** button
- See the promo code dialog

### 3. Redeem the Code

- Enter `TEST123`
- Tap "Redeem"
- See success message: `"🎉 Promo code applied! You now have unlimited [features] until [date]."`
- Verify you can now use unlimited plans

### 4. Try Again

- Attempt to generate another plan
- Should succeed (no limit hit)

---

## 🔐 Security Notes

### Who Can Redeem?

- **Authenticated users only** — The endpoint requires a valid JWT token
- **Each code per user** — Users can't redeem the same code twice
- **Max uses enforced** — Backend prevents redemptions beyond `max_uses` limit
- **Expiration checked** — Expired codes (by `expires_at`) are rejected

### Admin-Only Management

- Only edit `coupon_codes` table in database — no UI for this
- Test codes can be created/disabled without user knowledge
- Codes are case-insensitive (entered as uppercase in dialog)

---

## 📱 User Experience Flow

```
┌─ User Hits Monthly Limit ─┐
│                            │
│ "You reached your limit    │
│  for Plans this month"     │
│                            │
│ [Upgrade Subscription]     │
│ [Have a Promo Code?] ← NEW │
│ [OK]                       │
└────────────────────────────┘
         ↓
┌─ Promo Code Dialog ────────┐
│                            │
│ "Promo Code"               │
│ [__________]  ← enters     │
│              code, eg.     │
│              FOUNDER_1YR   │
│                            │
│ [Redeem] [Cancel]          │
└────────────────────────────┘
         ↓
��─ Success! ─────────────────┐
│                            │
│ 🎉 Promo Applied!          │
│                            │
│ "You now have unlimited    │
│  training plans until      │
│  June 23, 2027"            │
│                            │
│ [Try Again] [OK]           │
└────────────────────────────┘
```

---

## 📋 Implementation Checklist

- [ ] Update `MainScreen.kt` to show `PromoCodeDialog` when `onPromoCodeClick` is tapped
- [ ] Add state variables for dialog visibility and feature name
- [ ] Integrate API call to `redeemPromoCode()` endpoint
- [ ] Add success/error handling with toast or dialog feedback
- [ ] Refresh feature availability after successful redemption
- [ ] Test with a test code in database
- [ ] Create `founder_1yr` code in production database
- [ ] Verify admin users can use unlimited features after redeeming

---

## 🎯 Expected Behavior After Implementation

**Free User Without Promo**:
- Generates 1 plan/month
- Hits limit → sees upsell screen
- No promo code → must upgrade

**Free User With `founder_1yr` Promo**:
- Generates 1 plan/month
- Hits limit → sees upsell screen
- Enters `founder_1yr` → success message
- Can now generate **unlimited plans** for 1 year

**Admin User**:
- Has `founder_1yr` code in database (max_uses: 10)
- Redeems once → unlimited access
- Other 9 users can also redeem the same code

---

## 🔗 Related Files

- Backend: `server/coupon-service.ts`
- Backend: `server/usage-service.ts` (checks grants)
- Android UI: `app/src/main/java/live/airuncoach/airuncoach/ui/components/PromoCodeDialog.kt`
- Android API: `app/src/main/java/live/airuncoach/airuncoach/network/ApiService.kt`
- Android Main: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`

---

## Status

✅ **Backend**: Fully implemented and deployed
✅ **UI Dialog**: Built and ready
✅ **Database Schema**: Ready
⚠️ **Integration**: Missing — needs to hook dialog into feature limit screens

