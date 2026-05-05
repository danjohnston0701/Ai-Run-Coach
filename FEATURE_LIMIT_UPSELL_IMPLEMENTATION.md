# Feature Limit Upsell Screen - Implementation Plan

## Problem Statement

**Current Experience (Poor UX):**
1. User navigates to "Create AI Plan" 
2. Goes through entire multi-step form setup
3. Enters all details (goal, duration, experience level, injuries, etc.)
4. Clicks "Generate Plan"
5. **ERROR**: "You've reached your limit for training plans"
6. User frustrated - wasted 5-10 minutes

**Desired Experience (Good UX):**
1. User clicks "Create AI Plan"
2. **Immediate check** of usage limits
3. If limit reached → **Show upgrade upsell screen** with:
   - Clear message about limit
   - When subscription renews
   - Upgrade options
4. If limit available → Show setup form as normal

## Scope

This applies to:
1. **AI Plan Generation** - Pre-check before GeneratePlanScreen
2. **Run Route Creation** - Pre-check before MapMyRunScreen
3. **Future features** - Post analysis, custom workouts, etc.

---

## Implementation Strategy

### Step 1: Create Reusable Limit Upsell Component

**File**: `app/src/main/java/live/airuncoach/airuncoach/ui/components/FeatureLimitUpsellScreen.kt`

```kotlin
@Composable
fun FeatureLimitUpsellScreen(
    featureName: String,               // "AI Plan Generation", "Run Route Creation"
    message: String,                   // Custom message
    nextRenewalDate: LocalDate?,      // When subscription renews
    nextRenewalDateLabel: String?,    // "Monthly plan renews on..."
    onUpgradeClick: () -> Unit,
    onPromoCodeClick: () -> Unit,
    onBackClick: () -> Unit
) {
    // Show:
    // 1. Feature icon/name (e.g. 📋 AI Plan Generation)
    // 2. Locked icon
    // 3. "You've reached your limit"
    // 4. Renewal info (if available)
    // 5. Two buttons:
    //    - "Upgrade Subscription" (primary)
    //    - "Have a Promo Code?" (secondary)
    // 6. Back button
}
```

**Key Features:**
- ✅ Reusable for any feature
- ✅ Shows renewal date if available
- ✅ Promo code redemption option
- ✅ Beautiful, clear messaging
- ✅ Large upgrade button (primary action)

### Step 2: Create Usage Check Service/ViewModel

**File**: `app/src/main/java/live/airuncoach/airuncoach/viewmodel/FeatureLimitViewModel.kt`

```kotlin
class FeatureLimitViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {
    
    // Check if user can generate an AI plan
    suspend fun canGenerateAiPlan(): Result<Boolean> {
        return try {
            val response = apiService.checkFeatureAvailability("trainingPlansGenerated")
            Result.success(response.isAvailable)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    // Get renewal info for a feature
    suspend fun getFeatureRenewalInfo(feature: String): FeatureRenewalInfo? {
        return try {
            apiService.getFeatureRenewalInfo(feature)
        } catch (e: Exception) {
            null
        }
    }
    
    // Check if user can create a run route
    suspend fun canCreateRunRoute(): Result<Boolean> {
        return try {
            val response = apiService.checkFeatureAvailability("routesGenerated")
            Result.success(response.isAvailable)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

### Step 3: Update MainScreen Navigation

**File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`

**Current:**
```kotlin
// When user clicks "Create AI Plan"
navController.navigate("generate_plan")
```

**Updated:**
```kotlin
// When user clicks "Create AI Plan"
// Check if they can access the feature
val canGenerate = featureLimitVM.canGenerateAiPlan()
if (canGenerate.isSuccess && canGenerate.getOrNull() == true) {
    // Feature available - show setup form
    navController.navigate("generate_plan")
} else {
    // Feature limit reached - show upsell
    navController.navigate("feature_limit/${FeatureType.AI_PLAN}")
}
```

### Step 4: Add Navigation Route

**File**: `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`

```kotlin
composable("feature_limit/{featureType}") { backStackEntry ->
    val featureType = backStackEntry.arguments?.getString("featureType") ?: "unknown"
    FeatureLimitUpsellRoute(
        featureType = featureType,
        onUpgradeClick = { navController.navigate("subscription") },
        onPromoCodeClick = { /* Show promo dialog */ },
        onBackClick = { navController.popBackStack() }
    )
}

composable("generate_plan") {
    // ... existing generate plan screen
}

composable("map_my_run") {
    // ... existing map my run screen
}
```

### Step 5: Update HomePage/Dashboard

**For "Create AI Plan" button:**
```kotlin
Button(
    onClick = {
        // Pre-check before navigating
        viewModel.checkAiPlanAvailability()
    },
    text = "Create AI Plan"
)
```

**For "Map My Run" button:**
```kotlin
Button(
    onClick = {
        // Pre-check before navigating
        viewModel.checkRunRouteAvailability()
    },
    text = "Map My Run"
)
```

### Step 6: Backend API Endpoint

**File**: `server/routes.ts`

```typescript
// Check if user can access a feature
app.get("/api/features/:featureName/available", authMiddleware, async (req, res) => {
  try {
    const { featureName } = req.params;
    const userId = req.user!.userId;
    
    // Map feature name to internal key
    const featureKeyMap: Record<string, string> = {
      "ai_plan": "trainingPlansGenerated",
      "run_route": "routesGenerated",
      "post_run_analysis": "postRunAnalyses"
    };
    
    const featureKey = featureKeyMap[featureName];
    if (!featureKey) {
      return res.status(400).json({ error: "Unknown feature" });
    }
    
    // Check if user has unlimited grant or available usage
    const hasUnlimited = await hasUnlimitedGrant(userId, featureKey);
    
    if (hasUnlimited) {
      return res.json({
        isAvailable: true,
        remaining: null,
        message: "Unlimited access"
      });
    }
    
    // Check monthly usage
    const usage = await getUserMonthlyUsage(userId, featureKey);
    const limit = getFeatureLimit(featureKey); // From subscription tier
    const remaining = Math.max(0, limit - usage);
    
    return res.json({
      isAvailable: remaining > 0,
      remaining,
      limit,
      usage,
      renewalDate: getNextRenewalDate(userId)
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to check feature availability" });
  }
});
```

---

## UI Design

### Feature Limit Upsell Screen

```
┌─────────────────────────────────────┐
│  < Back                             │
├─────────────────────────────────────┤
│                                     │
│              🔒                     │
│        (large lock icon)            │
│                                     │
│  AI Plan Generation                 │
│  (feature name)                     │
│                                     │
│  You've reached your monthly limit  │
│  for AI-powered training plans.     │
│                                     │
│  Your plan resets on:               │
│  Monday, June 5, 2026               │
│                                     │
│  📊 Monthly limit: 5 plans          │
│  ✓ Already used: 5 plans            │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  [  UPGRADE SUBSCRIPTION  ]         │
│  (primary button - prominent)       │
│                                     │
│  [  Have a Promo Code?  ]           │
│  (secondary button)                 │
│                                     │
│  ────────────────────────────────   │
│  💡 Upgrade to access unlimited     │
│  AI plans and other features        │
│                                     │
└─────────────────────────────────────┘
```

### Variations

**For Run Route Creation:**
```
AI Plan Generation    →    Run Route Creation
📋 icon              →    🗺️ icon
"training plans"     →    "run routes"
Limit: 5 plans       →    Limit: 10 routes
```

---

## Data Model

```kotlin
data class FeatureLimitState(
    val featureType: FeatureType,
    val featureName: String,
    val message: String,
    val limit: Int,
    val used: Int,
    val remaining: Int,
    val renewalDate: LocalDate?,
    val isUnlimited: Boolean = false,
    val promoCodeAvailable: Boolean = true
)

enum class FeatureType {
    AI_PLAN,
    RUN_ROUTE,
    POST_RUN_ANALYSIS,
    CUSTOM_WORKOUT
}
```

---

## Implementation Checklist

### Phase 1: Core Component (1-2 hours)
- [ ] Create FeatureLimitUpsellScreen composable
- [ ] Create reusable data models
- [ ] Add navigation route
- [ ] Style with proper colors and spacing

### Phase 2: AI Plan Integration (1 hour)
- [ ] Add pre-check to "Create AI Plan" button
- [ ] Integrate with GeneratePlanViewModel
- [ ] Test flow: Click → Check → Show upsell

### Phase 3: Run Route Integration (1 hour)
- [ ] Add pre-check to "Map My Run" button
- [ ] Test flow: Click → Check → Show upsell
- [ ] Verify text variations work

### Phase 4: Backend Endpoints (1-2 hours)
- [ ] Implement `/api/features/{feature}/available`
- [ ] Implement `/api/features/{feature}/renewal-date`
- [ ] Add proper error handling
- [ ] Test with different subscription tiers

### Phase 5: Polish & Testing (1 hour)
- [ ] Test with no remaining usage
- [ ] Test with 1 remaining
- [ ] Test with unlimited access
- [ ] Test promo code redemption flow
- [ ] Test upgrade navigation

---

## Benefits

✅ **Better UX**: No wasted form setup  
✅ **Faster**: Immediate feedback  
✅ **Clear messaging**: Users understand limits  
✅ **Revenue**: Better upgrade conversion  
✅ **Reusable**: Works for any feature  
✅ **Flexible**: Text variations for each feature  
✅ **Transparent**: Shows renewal dates  

---

## Example User Flows

### Flow 1: AI Plan with Limit Reached
```
User on Dashboard
  ↓
Clicks "Create AI Plan"
  ↓
Pre-check API call
  ↓
Response: remaining = 0
  ↓
Show FeatureLimitUpsellScreen
  ├→ "AI Plan Generation"
  ├→ "You've used all 5 of your monthly plans"
  ├→ "Your plan resets June 5, 2026"
  └→ [UPGRADE] [Have Promo?]
```

### Flow 2: Run Route with Available Usage
```
User on Dashboard
  ↓
Clicks "Map My Run"
  ↓
Pre-check API call
  ↓
Response: remaining = 2
  ↓
Show MapMyRunScreen (normal flow)
```

### Flow 3: With Promo Code
```
Limit Reached Screen
  ↓
User clicks "Have a Promo Code?"
  ↓
Promo code dialog opens
  ↓
User enters code
  ↓
Code redeems successfully
  ↓
Navigate to feature screen (AI Plan/Run Route)
```

---

## Notes

- Renewal dates come from subscription service
- API should return 0 remaining, not negative
- Consider caching the availability check (5 min)
- Show usage stats to educate users
- Make upgrade button prominent (primary color)
- Promo code redemption should immediately unlock feature

---

## Summary

This implementation:
1. **Stops users wasting time** on form setup
2. **Shows clear upgrade path** instead of error
3. **Works for all features** (reusable)
4. **Improves conversion** for subscriptions
5. **Better than error messages** - it's a feature, not a problem!

Ready to implement when approved!
