# AI Coaching Plans - Tier Limits Comparison

## Subscription Tier Breakdown

| Feature | Free | Lite | Standard |
|---------|------|------|----------|
| **AI Training Plans per Month** | 0 ✗ | 1 ✓ | 3 ✓ |
| **Can Access Coaching Programme** | No (Locked) | Yes | Yes |
| **Can View Existing Plans** | N/A | Yes | Yes |
| **Training Plan UI Visibility** | Full-screen placeholder | Full interface | Full interface |
| **Create Plan Button** | Hidden (FAB hidden) | Visible | Visible |
| **Tab Bar** | Hidden | Visible | Visible |

## Implementation Details

### Free Tier - Locked Placeholder
```
┌─────────────────────────────┐
│                             │
│         🔒 LOCK ICON        │
│                             │
│      Paid Feature           │
│                             │
│  AI Coaching Plans are      │
│  only available on paid     │
│  subscriptions. Upgrade     │
│  to Lite or Standard to     │
│  unlock personalized        │
│  training programs          │
│                             │
│  [Upgrade Subscription]     │
│                             │
└─────────────────────────────┘
```

### Lite Tier - Normal Interface
```
┌─────────────────────────────┐
│ ← Coaching Programme        │
│    AI-designed plans    [+] │
├─────────────────────────────┤
│  Active │Completed│Cancelled│
├─────────────────────────────┤
│                             │
│  1 AI Training Plan         │
│  generation per month       │
│                             │
│  [Plan Card]                │
│                             │
│  [Plan Card]                │
│                             │
│  Remaining: 0/1             │
│                             │
└─────────────────────────────┘
```

### Standard Tier - Normal Interface
```
┌─────────────────────────────┐
│ ← Coaching Programme        │
│    AI-designed plans    [+] │
├─────────────────────────────┤
│  Active │Completed│Cancelled│
├─────────────────────────────┤
│                             │
│  3 AI Training Plans        │
│  generation per month       │
│                             │
│  [Plan Card]                │
│  [Plan Card]                │
│  [Plan Card]                │
│                             │
│  Remaining: 1/3             │
│                             │
└─────────────────────────────┘
```

## Backend Limits

The server enforces these limits on plan creation:

### API Endpoint: `/api/check-feature-availability`
**Request**: `featureName=trainingPlansGenerated`

**Response**:
```json
{
  "isAvailable": true,
  "used": 1,
  "limit": 3,
  "remaining": 2,
  "renewalDate": "2026-07-08",
  "isUnlimited": false
}
```

- **Free users**: `limit: 0` → Always blocked by backend
- **Lite users**: `limit: 1` → Error after 1 plan/month
- **Standard users**: `limit: 3` → Error after 3 plans/month

## Code Reference

### Get User's Tier
```kotlin
val subscriptionTier = subscriptionViewModel.getSubscriptionTier()
// Returns: "free", "lite", or "standard"
```

### Get Plan Limit
```kotlin
val limit = subscriptionViewModel.getAiCoachingPlansLimit()
// Returns: 0, 1, or 3
```

### Check if Free
```kotlin
val isFreeTier = subscriptionTier == "free"
if (isFreeTier) {
    // Show locked placeholder
} else {
    // Show normal interface
}
```

## User Upgrade Path

1. Free user views Coaching Programme → Sees locked placeholder
2. Taps "Upgrade Subscription" → Navigated to Profile/Subscription screen
3. Selects Lite ($XX/month) or Standard ($XX/month)
4. Completes Google Play purchase
5. Returns to Coaching Programme → Now shows normal interface with plans

## Migration Notes for Existing Users

- **Existing Free users**: If they had saved plans from before this change, plans still exist but can't create new ones
- **Existing Lite users**: Limit changed from 3 → 1 plan/month
- **Existing Standard users**: Limit changed from 10 → 3 plans/month
- Backend will enforce new limits on next plan creation attempt

## Testing Subscription States

### Using Test Accounts in Google Play Console

1. **Test Free** (no active subscription):
   - Use regular test account without purchasing
   - Should see locked placeholder

2. **Test Lite** (lite subscription active):
   - Purchase `lite_monthly` or `lite_annual` SKU
   - Should see normal UI with 1-plan-per-month messaging

3. **Test Standard** (standard subscription active):
   - Purchase `standard_monthly` or `standard_annual` SKU
   - Should see normal UI with 3-plans-per-month messaging

## Strings for Localization

Key strings that should be added to `strings.xml`:

```xml
<!-- Subscription Tiers -->
<string name="free_tier">Free</string>
<string name="lite_tier">Lite</string>
<string name="standard_tier">Standard</string>

<!-- Feature Limits -->
<string name="free_plans_limit">✗ No AI Training Plans</string>
<string name="lite_plans_limit">1 AI Training Plan per month</string>
<string name="standard_plans_limit">3 AI Training Plans per month</string>

<!-- Locked Placeholder -->
<string name="paid_feature">Paid Feature</string>
<string name="coaching_plans_locked">AI Coaching Plans are only available on paid subscriptions. Upgrade to Lite or Standard to unlock personalized training programs designed around your goals.</string>
<string name="upgrade_subscription">Upgrade Subscription</string>
</xml>
```

## Known Limitations & Future Improvements

- [ ] Add analytics tracking for "Upgrade" button clicks from locked screen
- [ ] Consider showing "Renewal date" on Coaching Programme for paid users
- [ ] Add "Plan remaining" counter to tab bar badge
- [ ] Email notification when user is about to hit monthly limit
- [ ] In-app notification when monthly limit resets
