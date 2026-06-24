# Promo Code Integration Status

## ✅ Completed

### 1. **Add Injury/Condition Screen Fixes** (COMPLETE)
- ✅ Fixed scrolling when keyboard is open (changed to LazyColumn)
- ✅ Fixed buttons covered by navigation bar (moved to fixed footer)
- ✅ Replaced date text field with calendar date picker

### 2. **Health & Injuries Screen Redesign** (COMPLETE)
- ✅ Implemented tabbed interface (Recovering, Chronic, Healed)
- ✅ Added count badges on tabs
- ✅ Multiple injury support
- ✅ Matches Goals screen design pattern

### 3. **Promo Code Dialog Integrated into MainScreen** (PARTIAL)
- ✅ Added PromoCodeDialog import
- ✅ Added state management for showing/hiding dialog
- ✅ Wired up "Have a Promo Code?" buttons on:
  - AiPlanLimitUpsellScreen (line 766)
  - RunRouteLimitUpsellScreen (line 839)
- ⚠️ TODO: Implement actual redemption logic (currently just closes dialog)

---

## ⚠️ Outstanding Issue: Subscription Tier Mismatch

**Your Database**: `subscription_tier = 'lite'` ✓  
**Profile Display**: Shows "Lite" ✓  
**Account Management Usage Tab**: Shows hardcoded "Standard" (line 692) ❌  
**Feature Limits**: Still showing as "Free" tier (1 plan/month) ❌  

### Root Cause
The **Usage tab** is showing a hardcoded "Standard" tier instead of reading from your actual `subscription_tier`. This is just a UI display issue (lines 690-696 in SubscriptionScreen.kt).

The **real issue** is that `checkFeatureAvailability("/trainingPlansGenerated")` is still returning Free tier limits even though your tier is set to Lite.

### Required SQL to Verify
```sql
SELECT user_id, email, subscription_tier, subscription_status FROM users WHERE email = 'YOUR_EMAIL';
```

### How Tier Limits Work
- **Free**: 1 plan/month, 10km coaching, 5 analyses, 3 routes
- **Lite**: 3 plans/month, 50km coaching, 15 analyses, 10 routes
- **Standard**: 10 plans/month, 200km coaching, 50 analyses, 30 routes

---

## 🔐 Next Steps: Promo Code Redemption

### 1. **Add Promo Code Redemption Coroutine** (TO DO)

In `MainScreen.kt`, the `onRedeem` callback needs to:

```kotlin
onRedeem = { code ->
    promoCodeLoading = true
    viewModelScope.launch {
        try {
            val response = apiService.redeemPromoCode(
                PromoCodeRequest(code = code)
            )
            if (response.success) {
                // Success! Close dialog and refresh feature limits
                showPromoCodeDialog = false
                // TODO: Notify user of success (Toast or SnackBar)
                // TODO: Refresh feature limit checks so upsell screens update
            } else {
                // Show error message
                // TODO: Display error in dialog
            }
        } catch (e: Exception) {
            // Handle network error
            // TODO: Show error message to user
        } finally {
            promoCodeLoading = false
        }
    }
}
```

### 2. **Add Promo Codes to Database**

```sql
-- Create a founder/admin promo code
INSERT INTO coupon_codes (code, type, duration_days, max_uses, is_active, expires_at)
VALUES ('FOUNDER_1YR', 'unlimited_all', 365, 50, true, DATE_ADD(NOW(), INTERVAL 1 YEAR));

-- For yourself: INSERT INTO user_coupons (user_id, coupon_id, claimed_at)
-- This will grant you unlimited access for all features
```

### 3. **Test the Flow**

1. **Restart the app**
2. **Navigate to AI Plans → "Create Plan"**
3. **Should hit limit screen** → "Have a Promo Code?" button
4. **Click button** → PromoCodeDialog appears
5. **Enter**: `FOUNDER_1YR`
6. **Click Redeem** → Should succeed and close dialog
7. **Back to AI Plans** → Should now say "You have unlimited training plans"

---

## 📝 Files Modified

- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`
  - Added `PromoCodeDialog` import
  - Added state: `showPromoCodeDialog`, `promoCodeLoading`
  - Updated `onPromoCodeClick` callbacks to show dialog
  
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/SubscriptionScreen.kt`
  - Line 692: Hardcoded "Standard" - should be fetched from actual tier

---

## 🎯 Recommendation

**Before testing promo codes**, please:

1. **Verify your tier in database**:
   ```sql
   SELECT subscription_tier FROM users WHERE user_id = 'YOUR_USER_ID';
   ```

2. **If it's not 'lite'**, update it:
   ```sql
   UPDATE users SET subscription_tier = 'lite' WHERE user_id = 'YOUR_USER_ID';
   ```

3. **Restart the app completely** (don't just minimize/resume)

4. **Then test creating a plan** to see if it now shows "3 plans/month" instead of "1 plan/month"

If it still shows 1, we need to add logging to the `/api/features/trainingPlansGenerated/available` endpoint to see what tier it's reading from your user record.
