# iOS Implementation Brief: Health & Conditions Feature

## Overview
Implement the Android **Health & Injuries** feature on iOS to allow users to save, manage, and update injuries and medical conditions. This data is used to personalize AI coaching plans and avoid aggravating recovering injuries.

---

## Feature Components

### 1. **Data Model** (`Injury` + Enums)

```swift
// Swift equivalent of Android's Injury model
struct Injury: Codable {
    let id: String?
    let bodyPart: String                    // "Knee", "Ankle", "Back", etc.
    let injurySide: String?                 // "Left" or "Right" (for bilateral parts)
    let status: InjuryStatus                // RECOVERING, HEALED, CHRONIC
    let severity: InjurySeverity            // MILD, MODERATE, SEVERE
    let notes: String?                      // Detailed description
    let injuryDate: String?                 // ISO date "2026-05-08"
    let estimatedRecoveryWeeks: Int?        // Expected recovery duration
    let recoveryDate: String?               // ISO date when marked healed
    let updatedAt: TimeInterval             // Last update timestamp
    let isProstheticOrAFO: Bool             // Device-related injury?
    let prostheticType: String?             // "carbon fiber AFO", etc.
    let createdAt: TimeInterval
}

enum InjuryStatus: String {
    case recovering = "RECOVERING"
    case healed = "HEALED"
    case chronic = "CHRONIC"
}

enum InjurySeverity: String {
    case mild = "MILD"
    case moderate = "MODERATE"
    case severe = "SEVERE"
}
```

### 2. **Body Parts List**
```swift
let BODY_PARTS = [
    "Knee", "Ankle", "Shin", "Hip", "Back", "Neck / Cervical Spine",
    "Foot", "Calf", "Hamstring", "Quad", "Groin", "Shoulder",
    "Wrist", "IT Band", "Achilles", "Plantar Fascia", "Other"
]

let BILATERAL_BODY_PARTS = Set([
    "Knee", "Ankle", "Hip", "Shoulder", "Elbow", "Wrist", "Foot", "Leg", "Arm",
    "Hamstring", "Quad", "Calf", "IT Band", "Achilles", "Plantar Fascia"
])

let PROSTHETIC_TYPES = [
    "Carbon fiber AFO (ankle-foot orthotic)",
    "Plastic AFO",
    "Full prosthetic leg",
    "Partial foot prosthetic",
    "Knee brace / ortho",
    "Ankle brace / ankle support",
    "Compression sleeve",
    "Other orthotic device"
]
```

### 3. **API Integration**

#### Update User Request
Add `injuries: [Injury]` to the existing user update endpoint:

```swift
struct UpdateUserRequest: Codable {
    let name: String?
    let email: String?
    let dob: String?
    let gender: String?
    let weight: Double?
    let height: Double?
    let fitnessLevel: String?
    let distanceScale: String?
    let subscriptionTier: String?
    let subscriptionStatus: String?
    let defaultSessionType: String?
    let injuries: [Injury]?              // NEW: Array of injuries/conditions
}
```

#### Generate Training Plan Request
Add `activityType` field to plan generation (already added to Android):

```swift
struct GeneratePlanRequest: Codable {
    // ... existing fields ...
    let injuries: [InjuryRequest]        // Injury data for AI
    let activityType: String             // "run" or "walk"
}
```

The injuries are sent to OpenAI so the AI coach can:
- Design training plans that avoid high-impact work on recovering areas
- Suggest modifications for chronic conditions
- Track recovery progress and celebrate when injuries heal

---

## UI Screens

### A. **InjuryOnboardingScreen** (Part of Onboarding Flow)

**Location in Flow:**
- Appears after Personal Details → before Fitness Level
- Shows: "Health & Injuries" header
- Optional: Can skip (injuries can be added later)

**Features:**
- Empty state message: "No injuries recorded. Add one if you have any conditions the AI Coach should know about."
- **Add Injury Button** (prominent, floating or sticky)
- List of current injuries with:
  - Body part name
  - Status badge (Recovering / Healed / Chronic)
  - Severity indicator
  - Quick edit/delete actions
- **Continue Button** at bottom (always enabled, user can skip)

**Behavior:**
- Injuries are stored in `User.injuries` in profile
- User can add multiple injuries during onboarding
- Optional to add during onboarding (can be done later in profile)

---

### B. **InjuryManagementScreen** (Full Edit UI)

**Location:** Profile → Settings → "Health & Injuries" shortcut

**Features:**

#### Header Section
- Title: "Health & Injuries"
- Optional: Show injury count badge ("2 Injuries")

#### Tab Navigation
1. **Active** - Recovering + Chronic injuries
2. **Archived** - Healed injuries (greyed out, shows recovery date)
3. **Add New** - Trigger add injury flow

#### Injury Cards
Each injury shows:
```
┌─────────────────────────────────────┐
│ Knee (Left)                [Edit]   │
│ Recovering • Moderate               │
│ Started: 15 Jan 2026                │
│ Est. Recovery: 6 weeks              │
│ Notes: ACL strain from...           │
└─────────────────────────────────────┘
```

#### Edit/Delete Actions
- Swipe to delete (with confirmation)
- Tap card to edit
- Mark as healed (changes status, archives it)

---

### C. **Add/Edit Injury Dialog**

**Form Fields (in order):**

1. **Body Part** (Required)
   - Dropdown selector
   - Shows full list of BODY_PARTS
   - Type-to-search support

2. **Side** (Conditional)
   - Only shows if selected body part is in BILATERAL_BODY_PARTS
   - Radio buttons: "Left" / "Right"

3. **Status** (Required)
   - Radio buttons: "Recovering" / "Healed" / "Chronic"
   - Recovering (default) = still recovering
   - Healed = fully recovered
   - Chronic = ongoing condition (not fully healed)

4. **Severity** (Required)
   - Radio buttons: "Mild" / "Moderate" / "Severe"
   - Mild = minimal impact, can train with caution
   - Moderate = noticeable pain, activity restricted
   - Severe = significant pain, medical attention needed

5. **Injury Date** (Optional)
   - Date picker: "When did it happen?"
   - ISO format stored ("2026-05-08")

6. **Estimated Recovery** (Conditional)
   - Text field: Number input
   - Only shows when status = "Recovering"
   - Placeholder: "Enter weeks (e.g., 8)"

7. **Recovery Date** (Auto-filled)
   - Only shows when status = "Healed"
   - Auto-populated with today's date
   - User can edit if needed

8. **Device-Related?** (Optional Toggle)
   - Toggle: "This involves a prosthetic or orthotic device"
   - If toggled ON, show prosthetic type dropdown

9. **Prosthetic Type** (Conditional)
   - Dropdown: PROSTHETIC_TYPES list
   - Only shows if device toggle is ON

10. **Notes** (Optional)
    - Text area: Multi-line input
    - Placeholder: "Describe the injury, pain location, restrictions, etc."

**Dialog Actions:**
- **Cancel** - Dismiss without saving
- **Delete** - Remove injury (with confirmation, only on edit)
- **Save** - Create/update injury and close dialog

---

## User Profile Integration

### Profile Settings Screen
Add **"Health & Injuries"** shortcut:

```
Settings Section:
├─ Personal Details
├─ Health & Injuries          ← NEW: Navigate to InjuryManagementScreen
├─ Fitness Level
├─ Connected Devices
└─ [other settings]
```

**Icon:** Use heart icon (R.drawable.icon_heart_vector from Android)
**Badge:** Optional count of active injuries (if > 0)

---

## Data Persistence & Sync

### LocalStorage
- Store `User.injuries` in UserDefaults or CoreData
- Sync with server on every user profile update

### Server Sync Flow
1. User adds/edits/deletes injury locally
2. Call `PUT /api/users/{userId}` with updated `User` object (includes injuries array)
3. Server validates and stores
4. Cache updated user profile locally

### During Plan Generation
- Read `User.injuries` from local storage
- Transform to `InjuryRequest` objects
- Include in `GeneratePlanRequest` to OpenAI
- AI uses injury data to personalize the training plan

---

## Onboarding Flow Integration

**Current Android Flow:**
```
Personal Details 
  ↓
Health & Injuries (NEW)
  ↓
Fitness Level
  ↓
AI Coaching Consent
  ↓
Coach Settings
```

**On iOS, implement same sequence:**
1. After PersonalDetailsViewController/Screen
2. Before FitnessLevelViewController/Screen
3. Can be skipped (injuries added later in profile)

---

## AI Coaching Integration

When generating training plans, pass injuries:

```swift
let injuries: [InjuryRequest] = user.injuries?.map { injury in
    InjuryRequest(
        bodyPart: injury.bodyPart.lowercase(),
        status: injury.status.rawValue.lowercase(),
        notes: injury.notes,
        injuryDate: injury.injuryDate  // ISO date
    )
} ?? []

let request = GeneratePlanRequest(
    // ... other fields ...
    injuries: injuries,                 // Injury constraints
    activityType: user.defaultSessionType ?? "run"  // run or walk
)
```

**AI Behavior:**
- **Recovering injuries:** Avoid high-impact work; suggest low-impact alternatives
- **Chronic conditions:** Manage in training; include modifications
- **Healed injuries:** Can return to normal training
- **Severe injuries:** Flag for user review before plan generation

---

## Key Design Principles

1. **Optional but Valuable:** Users can skip injuries during onboarding; feature is always available in settings
2. **Injury-Aware AI:** OpenAI uses injury data to generate personalized, safe training plans
3. **Simple UX:** Minimal form fields, clear status flow (Recovering → Healed)
4. **Accessibility:** Easy to add, edit, delete injuries; clear visual hierarchy
5. **Consistency:** Match Android design and data model exactly

---

## Implementation Checklist

- [ ] Add `Injury` and related enums to models
- [ ] Update `User` model to include `injuries: [Injury]?`
- [ ] Update `UpdateUserRequest` to include injuries
- [ ] Update `GeneratePlanRequest` to include `activityType`
- [ ] Create `InjuryOnboardingScreen` (or `InjuryOnboardingViewController`)
- [ ] Create `InjuryManagementScreen` (or `InjuryManagementViewController`)
- [ ] Implement Add/Edit injury dialog/sheet
- [ ] Add "Health & Injuries" shortcut to Profile settings
- [ ] Wire injury data through to plan generation request
- [ ] Test injury sync to backend
- [ ] Test onboarding flow with and without injuries
- [ ] Test AI plan generation with injury constraints

---

## Questions for iOS Team

1. Should we use SwiftUI sheets/dialogs or traditional UIKit dialogs?
2. Do we need date picker integration? (for injury date and recovery date)
3. Should archived (healed) injuries be shown in a separate tab or hidden by default?
4. Should we add a confirmation dialog when marking an injury as healed?
5. Do we want to show injury count badge on the Profile settings shortcut?

---

## Reference Files (Android)

- `domain/model/Injury.kt` - Data model
- `ui/screens/InjuryOnboardingScreen.kt` - Onboarding screen
- `ui/screens/InjuryManagementScreen.kt` - Full management UI
- `ui/screens/ProfileScreen.kt` - Profile integration
- `viewmodel/ProfileViewModel.kt` - Data management
- `network/model/TrainingPlanModels.kt` - API request models
- `viewmodel/GeneratePlanViewModel.kt` - Plan generation with injury constraints
