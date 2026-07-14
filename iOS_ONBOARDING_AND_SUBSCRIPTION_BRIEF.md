# iOS Onboarding & Subscription — Complete Implementation Brief

**Status**: Ready for Xcode AI Implementation  
**Scope**: New user onboarding flow, state persistence, and subscription management  
**Reference**: Android implementation complete (version 1.7+)  
**Timeline**: 3-4 days for full feature

---

## 📋 Executive Summary

**Onboarding** is a multi-step flow that:
1. Collects personal details (name, age, fitness level, injury history)
2. Sets up AI coach preferences (coaching style, intensity)
3. Shows subscription tiers and free trial offer
4. Saves progress across app sessions using local storage
5. Allows users to continue later if they close the app

**Subscription** is a tiered system with:
- **Free Trial**: 14 days with limited features
- **Lite**: $7.99/month or $79.99/year (best for casual runners)
- **Standard**: $14.99/month or $149.99/year (best for serious runners)
- Different feature quotas per tier (km coaching, route generations, training plans)

---

## 🎯 Onboarding Flow

### User Journey

```
Login/Registration
    ↓
[Check onboarding flags in Keychain]
    ↓
    ├─ Flags exist → Skip to main app
    └─ Flags don't exist → Start onboarding
        ↓
    1. Personal Details Screen
       ├─ Name (text)
       ├─ Age (number)
       ├─ Fitness level (picker: beginner/intermediate/advanced)
       └─ Continue (saves to Keychain)
        ↓
    2. Injury History Screen
       ├─ Any current injuries? (yes/no)
       ├─ If yes: select injury type (knee, shin, ankle, etc.)
       ├─ Injury details (text)
       └─ Continue
        ↓
    3. Coach Settings Screen
       ├─ Coaching style (picker: aggressive/balanced/easy)
       ├─ Target intensity (picker: high/moderate/low)
       └─ Continue
        ↓
    4. Onboarding Subscription Screen
       ├─ Welcome to 14-day free trial
       ├─ Trial limitations & benefits
       ├─ Lite plan option
       ├─ Standard plan option (recommended)
       └─ "Continue with Free Trial" button
        ↓
    [Clear onboarding flags → Navigate to main app]
```

### State Persistence Between Sessions

**Key Principle**: Save progress after every screen so users can return.

```
Screen 1: Personal Details
├─ Save: needs_profile_setup = true
├─ Save: user_details = { name, age, fitness_level }
└─ User closes app → Keychain persists

User reopens app
├─ Check: needs_profile_setup == true
├─ Check: user_details exists
├─ Load saved data → prepopulate form
└─ Continue from where they left off

Screen 2: Injury History
├─ Update: user_details.injury_history
└─ Save to Keychain

... (repeat for each screen)

Final: Subscription Screen
├─ Clear: needs_profile_setup & needs_coach_setup
├─ Save: subscription_tier = "free"
├─ Save: trial_start_date
└─ Navigate to main app
```

---

## 📱 Screen Specifications

### Screen 1: Personal Details

**Layout**:
```
┌──────────────────────────────┐
│ Welcome to AI Run Coach    X │
├──────────────────────────────┤
│                              │
│ Let's get to know you        │
│                              │
│ Full Name                    │
│ [John Doe                ]   │
│                              │
│ Age                          │
│ [35                      ]   │
│                              │
│ Fitness Level                │
│ [Intermediate         ▼]     │
│   ├─ Beginner                │
│   ├─ Intermediate            │
│   └─ Advanced                │
│                              │
│ Step 1 of 3                  │
│                              │
│         [Continue]           │
│                              │
└──────────────────────────────┘
```

**Fields**:
- **Full Name** (required) — TextInput, max 50 chars
- **Age** (required) — NumberInput, min 13, max 120
- **Fitness Level** (required) — Picker (beginner/intermediate/advanced)
- **Progress indicator** — Shows "1 of 3"
- **Continue button** — Disabled until all fields filled

**Validations**:
- Name: min 2 chars, no numbers
- Age: min 13, max 120
- Error messages inline under each field

---

### Screen 2: Injury History

**Layout**:
```
┌──────────────────────────────┐
│ Injury History             X │
├──────────────────────────────┤
│                              │
│ Do you have any current      │
│ running injuries?            │
│                              │
│ [Yes]  [No]                  │
│                              │
│ (If Yes selected:)           │
│                              │
│ Injury Type                  │
│ [Knee injury          ▼]     │
│   ├─ Knee                    │
│   ├─ Shin splints            │
���   ├─ Ankle                   │
│   ├─ IT band                 │
│   └─ Other                   │
│                              │
│ Details                      │
│ [Torn ACL, recovery in... ]  │
│                              │
│ Step 2 of 3                  │
│                              │
│         [Continue]           │
│                              │
└──────────────────────────────┘
```

**States**:
- **Default**: Yes/No buttons shown, other fields hidden
- **Yes Selected**: Injury type picker + details textarea shown
- **No Selected**: Continue button enabled immediately

**Fields** (conditional):
- **Injury Type** — Picker (knee/shin/ankle/IT band/other)
- **Details** — TextArea, max 200 chars, optional
- **Progress indicator** — Shows "2 of 3"

---

### Screen 3: Coach Settings

**Layout**:
```
┌──────────────────────────────┐
│ AI Coach Preferences       X │
├──────────────────────────────┤
│                              │
│ How should your AI coach     │
│ guide you?                   │
│                              │
│ Coaching Style               │
│ [Aggressive         ▼]       │
│   ├─ Aggressive              │
│   ├─ Balanced                │
│   └─ Easy-going              │
│                              │
│ Target Intensity             │
│ [Moderate           ▼]       │
│   ├─ High                    │
│   ├─ Moderate                │
���   └─ Low                     │
│                              │
│ Step 3 of 3                  │
│                              │
│         [Continue]           │
│                              │
└──────────────────────────────┘
```

**Fields**:
- **Coaching Style** (required) — Picker (aggressive/balanced/easy-going)
  - Aggressive: Push hard, detailed cues
  - Balanced: Standard coaching
  - Easy-going: Gentle guidance
- **Target Intensity** (required) — Picker (high/moderate/low)
- **Progress indicator** — Shows "3 of 3"
- **Continue button** — Enables navigation to subscription

---

### Screen 4: Onboarding Subscription

**Layout**:
```
┌──────────────────────────────┐
│        Your 14-Day Trial     │
│          Starts Today! 🎉    │
├──────────────────────────────┤
│                              │
│ ⏱️ Your Free Trial: 14 days  │
│    remaining                 │
│    Expires on Dec 25         │
│                              │
│ 🚫 Limited Features:         │
│    ❌ No AI route generation │
│    ❌ No coaching plans      │
│    ⚠️ Limited in-run coaching│
│                              │
│ ✅ What You Can Do:          │
│    ✓ Record runs             │
│    ✓ View basic stats        │
│    ✓ Try core coaching       │
│                              │
│ 🚀 Unlock with Paid Plans:   │
│    ✓ Unlimited AI routes     │
│    ✓ Create training plans   │
│    ✓ Full AI coaching        │
│                              │
│ Choose Your Plan             │
│                              │
│ Monthly / Annual             │
│                              │
│ ┌──────────────────────────┐ │
│ │ Lite                     │ │
│ │ $7.99/month              │ │
│ │ $6.67/mo (save $15.89)   │ │
│ │                          │ │
│ │ ✓ Unlimited AI runs      │ │
│ │ ✓ 50km AI coaching/mo    │ │
│ │ ✓ 15 summaries/mo        │ │
│ │ ✓ 10 routes/mo           │ │
│ │ ✓ 1 training plan/mo     │ │
│ │                          │ │
│ │    [Upgrade Now]         │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ Standard   ✨ RECOMMENDED │ │
│ │ $14.99/month             │ │
│ │ $12.50/mo (save $29.89)  │ │
│ │                          │ │
│ │ ✓ Unlimited AI runs      │ │
│ │ ✓ 200km AI coaching/mo   │ │
│ │ ✓ 50 summaries/mo        │ │
│ │ ✓ 30 routes/mo           │ │
│ │ ✓ 3 training plans/mo    │ │
│ │                          │ │
│ │    [Upgrade Now]         │ │
│ └──────────────────────────┘ │
│                              │
│ Continue with Free Trial     │
│                              │
│ You can upgrade anytime.     │
│ No credit card needed.       │
│                              │
└──────────────────────────────┘
```

**Key Elements**:
- **Header**: Gradient background with trial welcome
- **Limitations Banner**: Yellow warning card showing trial restrictions
- **Available Features**: Green card listing what's accessible
- **Paid Features**: Blue card highlighting premium unlock
- **Billing Period Toggle**: Monthly vs Annual (with savings badge)
- **Plan Cards**: Lite and Standard with feature lists
- **Continue Button**: Secondary button to skip and use free trial
- **Legal Text**: "No credit card needed", "Auto-renew can be cancelled"

---

## 💾 State Management & Persistence

### Keychain Storage

**Keys**:
```swift
// Onboarding flags
"needs_profile_setup" : Bool              // true while user needs to complete profile
"needs_coach_setup" : Bool                // true while user needs to complete coach settings

// Personal details
"user_name" : String                      // Full name (saved on registration)
"user_age" : Int                          // Age
"fitness_level" : String                  // "beginner" | "intermediate" | "advanced"

// Injury history
"has_injury" : Bool                       // true if user selected "yes"
"injury_type" : String?                   // "knee" | "shin" | "ankle" | "it_band" | "other"
"injury_details" : String?                // Text description

// Coach settings
"coaching_style" : String                 // "aggressive" | "balanced" | "easy"
"target_intensity" : String               // "high" | "moderate" | "low"

// Subscription
"subscription_tier" : String              // "free" | "lite" | "standard"
"trial_start_date" : String               // ISO-8601 timestamp
"trial_expires_at" : String?              // ISO-8601 timestamp
"subscription_expires_at" : String?       // ISO-8601 for paid subscriptions
```

### Load Progress on App Launch

```swift
func checkOnboardingStatus() -> OnboardingStatus {
    guard let profileSetupNeeded = keychain.bool(for: "needs_profile_setup") else {
        // First launch, never completed
        return .notStarted
    }
    
    if profileSetupNeeded == true {
        // Check how far they got
        if keychain.string(for: "user_name") != nil {
            // They filled out personal details, continue from injury screen
            return .resumeFromInjury
        } else {
            // Never started, begin from first screen
            return .startPersonalDetails
        }
    }
    
    if keychain.bool(for: "needs_coach_setup") == true {
        // Completed personal/injury, resume from coach settings
        return .resumeFromCoach
    }
    
    // All done, skip to subscription (or main if already purchased)
    return .showSubscription
}
```

### Prepopulate Forms

```swift
// In PersonalDetailsScreen
override func viewDidLoad() {
    super.viewDidLoad()
    
    if let savedName = keychain.string(for: "user_name") {
        nameField.text = savedName
    }
    if let savedAge = keychain.int(for: "user_age") {
        ageField.text = String(savedAge)
    }
    if let savedFitnessLevel = keychain.string(for: "fitness_level") {
        fitnessPicker.selectRow(["beginner", "intermediate", "advanced"].firstIndex(of: savedFitnessLevel) ?? 0)
    }
}
```

### Clear on Completion

```swift
func completeOnboarding() {
    keychain.set(false, for: "needs_profile_setup")
    keychain.set(false, for: "needs_coach_setup")
    
    // Save trial start date
    keychain.set(ISO8601DateFormatter().string(from: Date()), for: "trial_start_date")
    keychain.set("free", for: "subscription_tier")
    
    // Navigate to main app
    navigateToMainApp()
}
```

---

## 💳 Subscription Management

### Tier Definitions

| Feature | Free Trial | Lite | Standard |
|---------|-----------|------|----------|
| **Monthly Price** | $0 / 14 days | $7.99 | $14.99 |
| **Annual Price** | N/A | $79.99 | $149.99 |
| **Annual Savings** | — | Save $15.89 | Save $29.89 |
| **Monthly Equivalent** | — | $6.67/mo | $12.50/mo |
| **Unlimited AI runs** | ✓ | ✓ | ✓ |
| **AI coaching km/mo** | 50 (limited) | 50 | 200 |
| **Post-run summaries/mo** | 15 | 15 | 50 |
| **AI route generations/mo** | 10 | 10 | 30 |
| **AI training plans/mo** | 1 | 1 | 3 |
| **In-run coaching** | ⚠️ Limited | ✓ Full | ✓ Full |
| **Route analysis** | ⚠️ Limited | ✓ Full | ✓ Full |

### Free Trial Logic

```swift
func trialDaysRemaining() -> Int {
    guard let startDate = keychain.date(for: "trial_start_date") else {
        return 14  // Default if not set
    }
    
    let calendar = Calendar.current
    let endDate = calendar.date(byAdding: .day, value: 14, to: startDate)!
    let daysRemaining = calendar.dateComponents([.day], from: Date(), to: endDate).day ?? 0
    
    return max(0, daysRemaining)
}

func isTrialExpired() -> Bool {
    return trialDaysRemaining() <= 0
}

func getTrialExpiresAt() -> Date? {
    guard let startDate = keychain.date(for: "trial_start_date") else { return nil }
    return Calendar.current.date(byAdding: .day, value: 14, to: startDate)
}
```

### Subscription Purchase Flow

```swift
func purchaseSubscription(productId: String) {
    // 1. Validate product exists
    guard let product = availableProducts.first(where: { $0.id == productId }) else {
        showError("Product not found")
        return
    }
    
    // 2. Request payment from StoreKit
    Task {
        do {
            // Start transaction
            let result = try await requestPayment(for: product)
            
            // 3. Verify with backend
            let verificationResult = try await verifyPurchase(
                token: result.transactionID,
                productId: productId
            )
            
            // 4. Update local state
            keychain.set(verificationResult.tier, for: "subscription_tier")
            keychain.set(verificationResult.billingPeriod, for: "subscription_period")
            if let expiresAt = verificationResult.expiresAt {
                keychain.set(expiresAt, for: "subscription_expires_at")
            }
            
            // 5. Show success & dismiss
            showSuccessBanner(tier: verificationResult.tier)
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self.dismiss(animated: true)
            }
        } catch {
            showError("Purchase failed: \(error.localizedDescription)")
        }
    }
}
```

---

## 🔗 API Integration

### Single Endpoint Required (Subscription Verification)

```
POST /api/subscriptions/verify-purchase

Headers:
  Authorization: Bearer {token}
  Content-Type: application/json

Request Body:
{
  "purchaseToken": "ios-app-receipt-token",
  "productId": "lite_monthly",  // or "standard_monthly", "lite_annual", "standard_annual"
  "bundleId": "com.airuncoach.ios"
}

Response:
{
  "success": true,
  "tier": "lite",                          // "free" | "lite" | "standard"
  "billingPeriod": "monthly",              // "monthly" | "annual"
  "subscriptionStatus": "active",          // "active" | "cancelled" | "expired"
  "expiresAt": "2026-08-12T10:30:00Z",    // ISO-8601 next renewal date
  "user": { ... full user record ... }
}
```

### App Store Configuration

**In-App Purchase Product IDs**:
- `lite_monthly` → Lite monthly subscription
- `lite_annual` → Lite annual subscription
- `standard_monthly` → Standard monthly subscription
- `standard_annual` → Standard annual subscription

**Bundle ID**: `com.airuncoach.ios`

---

## 🎨 Design System

### Colors

| Element | Color | Usage |
|---------|-------|-------|
| **Primary** | `#00BFFF` | Buttons, highlights |
| **Secondary** | `#A78BFA` | Standard plan accent |
| **Warning** | `#FEF3C7` | Trial limitations card |
| **Success** | `#22C55E` | "Save X%" badges |
| **Error** | `#EF4444` | Validation errors |
| **Background** | `#0a0a0f` | Root bg |
| **Background Secondary** | `#1a1a2e` | Cards |

### Typography

- **Title**: 24pt bold (screen titles)
- **Heading**: 18pt bold (section headers)
- **Body**: 14pt regular (main text)
- **Caption**: 12pt regular (helper text)

### Spacing

Standard unit: 8pt (multiple of 8)
- xs = 4pt
- sm = 8pt
- md = 12pt
- lg = 16pt
- xl = 24pt
- xxl = 32pt
- xxxl = 40pt

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Trial days remaining calculation
- [ ] Trial expiry detection
- [ ] Tier feature eligibility (e.g., is user allowed to generate routes?)
- [ ] Keychain read/write operations
- [ ] Form validation (name, age, injury fields)
- [ ] State persistence across app restarts

### Integration Tests
- [ ] Complete onboarding flow end-to-end
- [ ] Close app mid-onboarding → reopen → resume correctly
- [ ] Verify all Keychain data saves properly
- [ ] Purchase subscription → local state updates
- [ ] Trial expiry → restrict features (AI routes, training plans)
- [ ] Navigation between screens and state transitions

### E2E Tests

**Scenario 1: First-Time User Complete Onboarding**
1. [ ] Launch app → personal details screen
2. [ ] Fill name, age, fitness level
3. [ ] Tap "Continue" → injury screen
4. [ ] Select "No injury" → coach settings screen
5. [ ] Select coaching style and intensity
6. [ ] Tap "Continue" → subscription screen
7. [ ] Tap "Continue with Free Trial" → main app
8. [ ] Can see trial countdown in settings

**Scenario 2: Resume After App Closure**
1. [ ] Complete personal details → close app
2. [ ] Reopen app → injury history screen (with form empty)
3. [ ] Fill injury details → close app
4. [ ] Reopen app → coach settings screen (with no data)
5. [ ] Complete → subscription → main app

**Scenario 3: Purchase Subscription**
1. [ ] On subscription screen
2. [ ] Select "Annual" billing
3. [ ] Tap "Lite" plan "Upgrade Now"
4. [ ] Confirm purchase in App Store
5. [ ] Return to app → success banner
6. [ ] Check Settings → shows "Lite annual" + renewal date
7. [ ] Can now generate unlimited routes

**Scenario 4: Trial Expiry**
1. [ ] Set trial_start_date to 14+ days ago (test data)
2. [ ] Reopen app
3. [ ] In Settings → "Trial expired, upgrade now"
4. [ ] Tap "Upgrade" → subscription screen
5. [ ] AI features restricted (show upgrade prompt)

---

## 🚀 Implementation Order

### Phase 1: Core Onboarding Screens (1 day)
1. Create PersonalDetailsScreen with form & validation
2. Create InjuryHistoryScreen with conditional UI
3. Create CoachSettingsScreen
4. Implement basic navigation between screens
5. Test form rendering and interactions

### Phase 2: State Management (1 day)
1. Create KeychainManager for secure storage
2. Implement save logic after each screen
3. Implement resume logic on app launch
4. Prepopulate forms with saved data
5. Test persistence across app restarts

### Phase 3: Subscription Screen & Tiers (1 day)
1. Create OnboardingSubscriptionScreen
2. Implement billing period toggle (monthly/annual)
3. Create plan cards with feature comparison
4. Implement StoreKit integration for purchases
5. Test purchase flow and receipt validation

### Phase 4: Integration & Polish (1/2 day)
1. Wire onboarding to app launch flow
2. Implement trial expiry checks
3. Add success/error messaging
4. UI refinement (animations, spacing)
5. Comprehensive testing

---

## ⚠�� Important Notes

### Keychain vs UserDefaults
- **Use Keychain** for: auth tokens, user IDs, sensitive data
- **Use Keychain** for: trial dates, subscription status (keep secure)
- Use UserDefaults for non-sensitive prefs (app theme, etc.)

### Trial Calculation
- Trial duration: **Always 14 days** (regardless of current day)
- Save exact start timestamp (not just "started today")
- Calculate remaining days using Calendar API
- Handle timezone changes gracefully

### Resume Logic Priority
```
1. Check needs_profile_setup flag
2. If true, check for saved name → resume at injury screen
3. If no name, resume at personal details
4. Check needs_coach_setup flag
5. If true, check for saved coaching_style → resume at subscription
6. Otherwise show main app
```

### Purchase Verification
- **Always verify with backend** — don't trust App Store receipt alone
- Verify transaction ID, product ID, and bundle ID match
- Update subscription_tier in response → trust server truth
- Handle network failures gracefully (retry with user consent)

### Error Handling
- Network errors: "Please check your connection and try again"
- Invalid purchases: "This purchase could not be verified. Please try again."
- Form validation: Show inline errors under affected field
- Trial expired: Show friendly upgrade prompt, not scary warning

---

## 📚 Reference

### Apple StoreKit Documentation
- `https://developer.apple.com/storekit/`
- `https://developer.apple.com/documentation/storekit`

### Keychain Services
- `https://developer.apple.com/documentation/security/keychain_services`
- Use `KeychainItemWrapper` or `Keychain.swift` library for convenience

### Testing with TestFlight
- Use sandbox App Store Connect account for testing
- Sandbox purchases don't charge real money
- Sandbox subscriptions auto-renew every 5 mins (for testing)

---

## Summary

**Onboarding** is a guided 4-screen flow that:
- ✅ Collects user preferences (personal details, injuries, coaching style)
- ✅ Saves progress to Keychain after every screen
- ✅ Allows resuming if user closes app mid-flow
- ✅ Presents subscription offer with clear value prop

**Subscription** is a freemium model with:
- ✅ 14-day free trial with limited features
- ✅ 2 paid tiers (Lite $7.99/mo, Standard $14.99/mo)
- ✅ Annual pricing with 17% savings
- ✅ Feature quotas per tier
- ✅ StoreKit integration for purchases
- ✅ Backend verification of receipts

**Key Implementation Focus**:
- State persistence (Keychain)
- Resume logic (check flags on app launch)
- Trial countdown (14-day calculation)
- Purchase flow (StoreKit + backend verify)

**Timeline**: 3-4 days for full implementation  
**Complexity**: Medium (multi-screen, forms, state management)  
**User Impact**: Critical (first-time experience, monetization)

Everything is ready to build! 🚀
