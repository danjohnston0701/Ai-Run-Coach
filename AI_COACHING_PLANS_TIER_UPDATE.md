# AI Coaching Plans - Subscription Tier Update

## Overview
Successfully replicated the iOS subscription tier changes to Android. Free users no longer have access to AI Coaching Plans, with limits now distributed as:
- **Free**: 0 AI Coaching Plans
- **Lite**: 1 AI Coaching Plan per month
- **Standard**: 3 AI Coaching Plans per month

## Changes Summary

### 1. BillingManager Enhancement (`app/src/main/java/live/airuncoach/airuncoach/billing/BillingManager.kt`)

Added two new utility methods to detect subscription tier and plan limits:

```kotlin
/**
 * Get the user's current subscription tier.
 * Returns: "free", "lite", "standard"
 */
fun getSubscriptionTier(): String

/**
 * Get the AI Coaching Plans limit for the user's subscription tier.
 * Returns: 0 (free), 1 (lite), or 3 (standard)
 */
fun getAiCoachingPlansLimit(): Int
```

**Logic**:
- Checks active purchases from Google Play Billing
- If no active subscription → returns "free"
- If subscription contains "lite" → returns "lite" (limit: 1)
- If subscription contains "standard" → returns "standard" (limit: 3)

### 2. SubscriptionViewModel Update (`app/src/main/java/live/airuncoach/airuncoach/viewmodel/SubscriptionViewModel.kt`)

Exposed the new BillingManager methods:

```kotlin
fun getSubscriptionTier(): String
fun getAiCoachingPlansLimit(): Int
```

### 3. SubscriptionScreen - Updated Features Comparison (`app/src/main/java/live/airuncoach/airuncoach/ui/screens/SubscriptionScreen.kt`)

Enhanced `SubscriptionFeaturesComparison()` to show all three tiers with accurate plan counts:

**Before**:
- Lite Plan: "AI-powered training guidance", "Basic performance tracking", etc.
- Standard: "All Lite features, plus: ..."

**After**:
- **Free**: "✗ No AI Training Plans"
- **Lite**: "**1** AI Training Plan per month" + other features
- **Standard**: "**3** AI Training Plans per month" + other features

UI automatically reflects to users that Free tier has no access to coaching plans.

### 4. CoachingProgrammeScreen - Free Tier Placeholder (`app/src/main/java/live/airuncoach/airuncoach/ui/screens/CoachingProgrammeScreen.kt`)

Implemented a locked placeholder for Free tier users:

#### Key Features:
1. **Automatic Detection**: Checks subscription tier on screen load
2. **Conditional Rendering**:
   - Free users → Full-screen locked placeholder
   - Paid users → Normal coaching programme interface
3. **Hidden UI Elements** (for free users):
   - Tab bar (Active/Completed/Cancelled tabs) hidden
   - FAB (+) button to create plans hidden
   - API call to load plans skipped (saves bandwidth)
4. **Locked Placeholder UI**:
   - Lock icon in gradient circle
   - "Paid Feature" heading
   - Clear explanation: "AI Coaching Plans are only available on paid subscriptions. Upgrade to Lite or Standard to unlock personalized training programs designed around your goals."
   - "Upgrade Subscription" button with crown icon
   - Button navigates to Profile (Subscription screen)

#### Code Structure:
```kotlin
@Composable
fun CoachingProgrammeScreen(
    onNavigateBack: () -> Unit,
    onCreatePlan: () -> Unit,
    onOpenPlan: (String) -> Unit,
    onNavigateToSubscription: () -> Unit = {},  // NEW
    isActiveDestination: Boolean = true
) {
    val subscriptionViewModel: SubscriptionViewModel = hiltViewModel()
    val subscriptionTier = subscriptionViewModel.getSubscriptionTier()
    val isFreeTier = subscriptionTier == "free"
    
    Scaffold(
        floatingActionButton = {
            if (!isFreeTier) {  // Hide FAB for free users
                FloatingActionButton(...) { ... }
            }
        }
    ) { padding ->
        if (isFreeTier) {
            FreeUserCoachingPlanPlaceholder(onUpgradeClick = onNavigateToSubscription)
        } else {
            // Normal UI: TabRow + Plans List
        }
    }
}
```

### 5. MainScreen Navigation Updates (`app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`)

Updated both coaching programme route handlers to pass the subscription navigation callback:

```kotlin
composable(Screen.AiPlans.route) {
    CoachingProgrammeScreen(
        ...
        onNavigateToSubscription = { navController.navigate(Screen.Profile.route) },
        ...
    )
}

composable("coaching_programme") {
    CoachingProgrammeScreen(
        ...
        onNavigateToSubscription = { navController.navigate(Screen.Profile.route) },
        ...
    )
}
```

## User Experience Flow

### Free Tier User Journey:
1. User (Free) taps "Coaching Programme" from bottom nav
2. Screen loads and detects subscription tier = "free"
3. Locked placeholder shown with lock icon + "Paid Feature" message
4. User can tap "Upgrade Subscription" button
5. Navigated to Profile screen (Subscription section)
6. User upgrades to Lite or Standard
7. On return to CoachingProgrammeScreen, now shows full interface
8. Can create/view coaching plans based on tier limit

### Paid Tier User Journey:
1. User (Lite/Standard) taps "Coaching Programme"
2. Subscription tier detected as "lite" or "standard"
3. Normal interface shown with tab bar + FAB
4. Can create new plans (limited by tier)
5. Can view active, completed, and cancelled plans

## API Integration

The backend's feature limit check (`checkFeatureAvailability("trainingPlansGenerated")`) handles the actual plan count enforcement. This Android update adds the **client-side UI gating** to prevent users from even seeing the create button if they're free tier.

### Complementary Systems:
1. **Client-side** (NEW): UI blocks feature access based on tier
2. **Server-side** (existing): API enforces limits on plan creation
3. **Billing** (existing): Google Play Billing tracks subscription status

## Testing Checklist

- [ ] Build project successfully (`./gradlew assembleRelease`)
- [ ] Test Free tier user sees locked placeholder
- [ ] Test Lite tier user sees 1 plan limit message
- [ ] Test Standard tier user sees 3 plan limit message
- [ ] Test upgrade button navigation from locked screen
- [ ] Test FAB is hidden for free users
- [ ] Test tab bar is hidden for free users
- [ ] Test plan creation still respects backend limits
- [ ] Test premium users can still create/view plans normally

## Notes

- **Backward Compatible**: Existing paid users see no changes to their experience
- **Clean Separation**: UI gating is separate from backend limit enforcement
- **Error Handling**: If billing check fails, defaults to "free" (conservative approach)
- **Performance**: Free users skip API call to load plans (saves bandwidth)
- **Localization Ready**: Strings can be extracted to strings.xml for translation

## Files Modified

1. `app/src/main/java/live/airuncoach/airuncoach/billing/BillingManager.kt` ✅
2. `app/src/main/java/live/airuncoach/airuncoach/viewmodel/SubscriptionViewModel.kt` ✅
3. `app/src/main/java/live/airuncoach/airuncoach/ui/screens/SubscriptionScreen.kt` ✅
4. `app/src/main/java/live/airuncoach/airuncoach/ui/screens/CoachingProgrammeScreen.kt` ✅
5. `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt` ✅

## Next Steps

1. Run `./gradlew assembleDebug` or `./gradlew bundleRelease` to verify compilation
2. Test on device with Free account (or test-free subscription SKU if available)
3. Deploy to internal testing track in Google Play Console
4. Get user feedback from QA team
5. Roll out to production with next version bump
