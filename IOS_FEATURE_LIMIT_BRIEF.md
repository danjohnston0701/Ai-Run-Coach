# iOS Implementation Brief: Feature Limit Upsell System

**Objective**: Replicate the Android Feature Limit Upsell system for iOS

**Status**: Backend & API ready, iOS implementation needed

---

## 🎯 Quick Overview

Users should never waste time filling out forms when they've hit their monthly limits. Instead, they see a professional upsell screen with clear upgrade paths.

### Current User Pain Point (Old Way)
```
Click "Create AI Plan" → 5-10 min form → ERROR "Limit reached" ❌
```

### Target Experience (New Way)
```
Click "Create AI Plan" → 1-2 sec check → Auto-navigate OR Show upsell ✅
```

---

## 🏗️ Architecture Overview

```
iOS App
  ├─ Dashboard / Route Setup Screen
  │  └─ User clicks "Create Plan" or "Generate Route"
  │
  ├─ FeatureLimitViewModel (iOS equivalent)
  │  └─ Call checkAiPlanAvailability() / checkRunRouteAvailability()
  │
  ├─ API Call → Backend
  │  └─ GET /api/features/{featureName}/available
  │
  └─ Navigation Based on Response
     ├─ Available → Auto-navigate to form (seamless)
     ├─ Limited → Show FeatureLimitUpsellScreen
     └─ Error → Allow access (graceful fallback)
```

---

## 🔌 Backend API (Already Ready)

### Endpoint
```
GET /api/features/{featureName}/available
```

### Authentication
Required (Bearer token in header)

### Parameters
- `featureName`: One of:
  - `trainingPlansGenerated` - AI plan creation
  - `routesGenerated` - Run route generation
  - `postRunAnalyses` - Post-run analysis
  - `aiCoachingKm` - AI coaching distance

### Response
```json
{
  "isAvailable": true,
  "remaining": 5,                        // null = unlimited
  "limit": 5,                            // null = unlimited
  "used": 0,
  "renewalDate": "2026-06-01T00:00:00.000Z",
  "isUnlimited": false,
  "message": "You have 5 of 5 plans remaining"
}
```

### Example Requests

**User Can Create Plan**:
```bash
GET /api/features/trainingPlansGenerated/available
Response: {
  "isAvailable": true,
  "remaining": 5,
  "limit": 5,
  "used": 0,
  "renewalDate": "2026-06-01T00:00:00.000Z",
  "message": "You have 5 of 5 plans remaining"
}
→ Auto-navigate to plan form
```

**User Hit Limit**:
```bash
GET /api/features/trainingPlansGenerated/available
Response: {
  "isAvailable": false,
  "remaining": 0,
  "limit": 5,
  "used": 5,
  "renewalDate": "2026-06-01T00:00:00.000Z",
  "message": "You've reached your limit of 5 plans this month"
}
→ Show upsell screen
```

---

## 📱 iOS Implementation Checklist

### 1. Create FeatureLimitViewModel (SwiftUI)
- [ ] Define data models:
  ```swift
  struct FeatureAvailability {
    let isAvailable: Bool
    let remaining: Int?
    let limit: Int?
    let used: Int
    let renewalDate: Date?
    let isUnlimited: Bool
    let message: String
  }
  ```
- [ ] ViewModel with @Published properties:
  ```swift
  @Published var aiPlanAvailability: FeatureAvailability?
  @Published var runRouteAvailability: FeatureAvailability?
  @Published var isLoading = false
  @Published var error: String?
  ```
- [ ] Methods:
  - `checkAiPlanAvailability()` - Call API for plans
  - `checkRunRouteAvailability()` - Call API for routes
  - `resetAiPlanAvailability()` - Clear state
  - `resetRunRouteAvailability()` - Clear state

### 2. Create Reusable Upsell Component
- [ ] `FeatureLimitUpsellView` SwiftUI View
- [ ] Displays:
  - Feature emoji (📋 for plans, 🗺️ for routes)
  - Lock icon badge
  - Usage progress (5 / 5 plans used)
  - Renewal date
  - Friendly message
  - Two buttons:
    - Primary: "Upgrade Subscription"
    - Secondary: "Have a Promo Code?"
- [ ] Pre-configured variants:
  - `AiPlanLimitUpsellView`
  - `RunRouteLimitUpsellView`

### 3. Integrate with Dashboard (Plan Creation)
**File**: `DashboardView.swift` (or equivalent)

- [ ] Add FeatureLimitViewModel as observed object
- [ ] Update "Create AI Plan" button action:
  ```swift
  Button("Create AI Plan") {
    viewModel.checkAiPlanAvailability()
    navigationState = .checkPlanAvailability
  }
  ```
- [ ] Add navigation state for availability check
- [ ] Create new view/sheet for availability check:
  - Show loading spinner while checking
  - Handle 3 states:
    1. Available → Auto-navigate to plan form
    2. Limited → Show AiPlanLimitUpsellView
    3. Error → Allow access (navigate to form)

### 4. Integrate with Route Generation Screen
**File**: `RouteSetupView.swift` (or equivalent)

- [ ] Add FeatureLimitViewModel as observed object
- [ ] Store route params before checking (similar to RouteGenerationParamsHolder on Android):
  ```swift
  struct RouteGenerationParams {
    let distance: Double
    let latitude: Double
    let longitude: Double
    // ... other params
  }
  ```
- [ ] Update "Generate Route" button action:
  ```swift
  Button("Generate Route") {
    storedParams = currentParams
    viewModel.checkRunRouteAvailability()
    navigationState = .checkRouteAvailability
  }
  ```
- [ ] Create availability check view:
  - Show loading spinner
  - If available: Call route generation API and navigate to loading screen
  - If limited: Show RunRouteLimitUpsellView
  - If error: Allow access (start generation)

### 5. Wire Up Navigation
- [ ] Create navigation path that includes:
  - `check_plan_availability` → Shows availability check sheet
  - `check_route_availability` → Shows availability check sheet
  - Auto-navigate to form/generation on success
  - Pop back on upsell screen cancellation

### 6. API Integration
- [ ] Add API endpoint to network layer:
  ```swift
  func checkFeatureAvailability(_ feature: String) async throws -> FeatureAvailability
  ```
- [ ] Use existing auth headers
- [ ] Handle 400/500 errors gracefully (default to allowing access)

---

## 🎨 UI Design Specifications

### FeatureLimitUpsellView

**Layout**:
```
┌─────────────────────────────┐
│ ← Back                      │
├─────────────────────────────┤
│                             │
│         📋 [lock]           │
│   AI Plan Generation        │
│  You've reached your limit  │
│                             │
│  Usage: 5 / 5 plans         │
│  Renews: June 5, 2026       │
│                             │
├─────────────────────────────┤
│ [ UPGRADE SUBSCRIPTION ]    │
│ [ Have a Promo Code?  ]     │
└─────────────────────────────┘
```

**Colors**:
- Lock badge: Warning/accent color
- Usage bar: Progress indicator (red when full)
- Buttons: Primary (blue) and secondary (outline)

**Variants**:
- AI Plan: 📋 emoji
- Run Route: 🗺️ emoji
- Generic: Customizable emoji

---

## 🔄 Navigation Flow

### AI Plan Creation Flow
```
DashboardView
  └─ "Create AI Plan" button
     └─ checkAiPlanAvailability()
        └─ Navigation to availability check
           ├─ Loading → Show spinner
           ├─ Available → Auto-navigate to GeneratePlanView
           ├─ Limited → Show AiPlanLimitUpsellView
           └─ Error → Allow access → Auto-navigate to GeneratePlanView
```

### Run Route Generation Flow
```
RouteSetupView
  └─ "Generate Route" button
     └─ Store route params
        └─ checkRunRouteAvailability()
           └─ Navigation to availability check
              ├─ Loading → Show spinner
              ├─ Available → Start generation → Navigate to RouteGeneratingView
              ├─ Limited → Show RunRouteLimitUpsellView
              └─ Error → Allow access → Start generation → Navigate to RouteGeneratingView
```

---

## 📋 Implementation Order

1. **Phase 1**: Create data models and FeatureLimitViewModel
2. **Phase 2**: Create FeatureLimitUpsellView component
3. **Phase 3**: Integrate with DashboardView (AI Plans)
4. **Phase 4**: Integrate with RouteSetupView (Routes)
5. **Phase 5**: Test all flows and edge cases

---

## 🧪 Testing Scenarios

### Scenario 1: User Has Availability
- Mock API response: `isAvailable: true, remaining: 5`
- Expected: Auto-navigate to plan/route form (invisible)
- Status: Should work seamlessly

### Scenario 2: User Hit Limit
- Mock API response: `isAvailable: false, remaining: 0, limit: 5`
- Expected: Show upsell screen with upgrade button
- Status: Show clear messaging and CTAs

### Scenario 3: User Has Unlimited
- Mock API response: `isAvailable: true, isUnlimited: true`
- Expected: Auto-navigate to form (no limit indicator shown)
- Status: User never sees limit

### Scenario 4: API Error
- Mock API error (network or 500)
- Expected: Gracefully fallback and allow access
- Status: User not blocked, continues normally

### Scenario 5: Different Features
- Test with `trainingPlansGenerated`
- Test with `routesGenerated`
- Expected: Same flow but different messaging
- Status: Component variants work correctly

---

## 💡 Key Differences from Android

**Android Used**:
- Jetpack Compose for UI
- Hilt for dependency injection
- MutableStateFlow for state management
- NavController for navigation
- RouteGenerationParamsHolder for param passing

**iOS Should Use** (Idiomatic):
- SwiftUI for UI
- Swift Concurrency (async/await)
- @Published and @StateObject for state
- NavigationStack or NavigationLink for navigation
- EnvironmentObject or closure for param passing

---

## 🔗 API Reference

### Endpoint Details
- **Base URL**: `https://api.airuncoach.com` (or your domain)
- **Auth**: Bearer token in Authorization header
- **Method**: GET
- **Path**: `/api/features/{featureName}/available`

### Error Handling
- **400**: Invalid feature name → Default to allowing access
- **401**: Unauthorized → Redirect to login
- **500**: Server error → Default to allowing access
- **Network error**: → Default to allowing access

### Graceful Fallback
```swift
// If API fails, allow access
if error != nil {
  proceed() // Navigate to form/generation
}
```

---

## 📝 Files to Create/Modify

**New Files**:
- `Models/FeatureAvailability.swift` - Data models
- `ViewModels/FeatureLimitViewModel.swift` - State management
- `Views/FeatureLimitUpsellView.swift` - Reusable component
- `Views/AiPlanLimitUpsellView.swift` - Plan variant
- `Views/RunRouteLimitUpsellView.swift` - Route variant

**Modify Existing**:
- `Views/DashboardView.swift` - Add plan availability check
- `Views/RouteSetupView.swift` - Add route availability check
- `Network/APIClient.swift` - Add feature availability endpoint
- `Navigation/NavigationPath.swift` - Add new navigation states

---

## ✅ Success Criteria

- [ ] Users can't waste time on blocked forms
- [ ] Limit check happens before form display (1-2 sec)
- [ ] Upsell screen is beautiful and professional
- [ ] Clear upgrade path with one-tap button
- [ ] Graceful error handling (always allow access on error)
- [ ] Works for both AI Plans and Run Routes
- [ ] Code is reusable for future features
- [ ] All test scenarios pass

---

## 🚀 Deployment Checklist

- [ ] Code written and reviewed
- [ ] All test scenarios pass
- [ ] Error handling comprehensive
- [ ] Documentation updated
- [ ] Beta testing complete
- [ ] Ready for App Store submission

---

## 📞 Questions?

Refer to the Android implementation for reference:
- **Component**: `FeatureLimitUpsellScreen.kt`
- **ViewModel**: `FeatureLimitViewModel.kt`
- **Integration**: MainScreen.kt (lines 284-403 for plans, 322-400 for routes)
- **Backend**: routes.ts (lines 2865-2939)

All backend functionality is ready and tested!

---

**Status**: 🟢 Ready for iOS Implementation  
**Backend**: ✅ Complete & Tested  
**Estimated iOS Time**: 6-8 hours  
**Difficulty**: Medium (straightforward navigation + API integration)
