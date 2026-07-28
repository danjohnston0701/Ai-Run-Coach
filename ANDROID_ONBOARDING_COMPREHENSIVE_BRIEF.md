# Android Onboarding — Comprehensive Technical & Design Brief

**Status**: Ready for iOS Implementation  
**Reference**: Android implementation complete (Compose-based)  
**Target**: Ensure iOS matches Android UX, visual design, and state management  
**Timeline**: 3-4 days for full iOS implementation

---

## 📋 Executive Summary

The onboarding flow is a **8-step journey** that:
1. Requests location & activity recognition permissions
2. Welcomes the user with a clear overview of what's ahead (Onboarding Intro)
3. Collects personal details (name, email, date of birth, gender, weight, height, default session type)
4. Determines fitness level (beginner/intermediate/advanced)
5. Obtains explicit AI coaching consent with transparent data privacy info
6. Allows configuration of AI coach personality (name, voice, tone, master toggle)
7. Configures in-session coaching feature toggles (pace, route nav, elevation, HR, cadence, etc.)
8. Presents subscription tiers with free trial offer

**Important**: Injury history is **NOT** part of new user onboarding. It's only available in Profile → Settings after onboarding is complete.

State is persisted at each step using secure local storage (Keychain on iOS, `SecurePreferences` on Android). Users can close the app mid-flow and resume exactly where they left off.

---

## 🎯 Complete Onboarding Flow

### User Journey (Flow Diagram)

```
Sign Up / Registration
    ↓
[Email Verification]
    ↓
LocationPermissionScreen
    ├─ Grant → Check flags (see routing below)
    └─ Deny → Show permission rationale (allow retry)
    ↓
[IF needs_profile_setup == true]
    ↓
OnboardingIntroScreen (NEW)
    ├─ Title: "Let's get you set up"
    ├─ Show 4-step overview with descriptions
    ├─ Privacy reassurance card
    └─ "Get Started" button → PersonalDetailsScreen
    ↓
PersonalDetailsScreen
    ├─ Full Name (text field)
    ├─ Email (text field)
    ├─ Date of Birth (day/month/year dropdowns + year-only toggle)
    ├─ Gender (male / female / prefer not to say)
    ├─ Weight in kg (number field)
    ├─ Height in cm (number field)
    ├─ Default Session Type (Run / Walk buttons)
    └─ Continue → saves to local storage
    ↓
FitnessLevelScreen
    ├─ Radio buttons: Beginner / Intermediate / Advanced
    └─ Continue
    ↓
AiCoachingConsentScreen (NEW)
    ├─ Title: "Your AI Running Coach"
    ├─ Feature list (4 capabilities with icons)
    ├─ Data & privacy disclosure (OpenAI, no retention, no personal IDs)
    ├─ [Enable AI Coaching] button → sets consent = true
    └─ [Continue without AI coaching] text button → sets consent = false
    ↓
CoachSettingsScreen (MODIFIED)
    ├─ Coach name (text field)
    ├─ Voice gender (toggle: Male / Female)
    ├─ Accent selection (dropdown list)
    ├─ Coaching tone (card selector: Aggressive / Balanced / Easy)
    ├─ Master AI toggle (reads from consent, can override)
    ├─ Button says "Continue" (in onboarding) or "Save" (in profile)
    └─ Continue
    ↓
CoachingPromptsSettingsScreen (NEW)
    ├─ Toggle switches for 9 feature types
    ├─ Km split interval selector (1 / 2 / 5 km)
    ├─ If AI disabled: show "AI coaching currently disabled" card
    └─ "Save & Continue" button
    ↓
[Clear onboarding flags]
    ↓
OnboardingSubscriptionScreen
    ├─ Trial countdown (14 days)
    ├─ Trial limitations banner
    ├─ Available features banner
    ├─ Monthly/Annual billing toggle
    ├─ Plan cards (Lite & Standard with feature comparison)
    ├─ "Continue with Free Trial" button
    └─ "Upgrade Now" buttons on each plan
    ↓
[Navigate to Main App]

NOTE: Injury history is NOT in new user onboarding.
It's available post-onboarding in Profile → Health & Injuries.
```

### Smart Routing Based on Onboarding Flags

After LocationPermissionScreen, check stored flags:

```swift
// Pseudocode logic
func routeFromLocationPermission() {
    let flags = SessionManager.shared
    
    if flags.needsProfileSetup() {
        // New user: hasn't filled personal details yet
        navigateTo(.onboardingIntro)
    } else if flags.needsCoachSetup() {
        // User did profile but not coach setup
        navigateTo(.aiCoachingConsent)
    } else {
        // Fully onboarded, check AI consent
        if !AiConsentManager.hasSeenConsent() {
            navigateTo(.aiCoachingConsent)  // Show consent for old users who didn't see it
        } else {
            navigateTo(.main)
        }
    }
}
```

---

## 📱 Screen-by-Screen Specifications

### Screen 1: Location Permission Screen

**Route**: Already implemented, no changes needed.

**Behavior**:
- Request location + activity recognition
- On grant: Check onboarding flags (see routing above)
- On deny: Show permission rationale → retry button

---

### Screen 2: Onboarding Intro Screen (NEW)

**Route name**: `onboarding_intro`  
**Trigger**: Immediately after location permissions for new users  
**Purpose**: Set expectations before data collection begins

**Key Points**:
- No emoji, animations, or marketing copy
- Clean, professional, honest tone
- Scrollable layout for small screens
- Background: app root background colour

**Layout Structure**:

```
[Top padding: 56pt]

[72pt circle with 12% opacity primary bg]
[Graph/trending icon, primary color]

[xxxl spacing]

"Let's get you set up"
(h1, bold, centered)

"We'll ask you a few questions so your training plan 
and AI coach are built around you — not a generic template."
(body, secondary color, centered)

[xxxl spacing]

[Step Row 1]
  [1]  Personal details
       Some basic info about you to help your AI coach know you better.

[lg spacing]

[Step Row 2]
  [2]  Fitness Level
       Your current fitness level — so we can start you in the right place.

[lg spacing]

[Step Row 3]
  [3]  AI coach preferences
       Name, voice, and coaching style — your coach, your way.

[lg spacing]

[Step Row 4]
  [4]  In-run coaching
       Choose which real-time coaching features are active during your runs.

[xxxl spacing]

[Privacy Card - backgroundSecondary]
  Your data is used only to personalise your training.
  It is never sold or shared with third parties for marketing.

[xxxl spacing]

[Primary Button - Full Width - 50pt height]
  Get Started

[Bottom padding: 32pt]
```

**Step Row Component** (repeats 4 times):
- Left: 32pt circle with 15% opacity primary background
  - Centered number text (body bold, primary color)
- Right: Column with title + description
  - Title: body semibold, textPrimary
  - Description: caption, textSecondary
- 16pt gap between badge and text column
- Aligned to top

**Navigation**:
- "Get Started" → `personal_details` screen
- No back button

**Reference Implementation** (Android):
```kotlin
@Composable
fun OnboardingIntroScreen(onGetStarted: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Colors.backgroundRoot)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Spacing.xxxl)
            .navigationBarsPadding()
            .padding(top = 32.dp, bottom = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Title
        Text("Let's get you set up", ...)
        
        // Description
        Text("We'll ask you a few questions...", ...)
        
        // Step rows x4
        OnboardingStep(number = "1", title = "Personal details", ...)
        // ... etc
        
        // Privacy card
        Card(...) { Text("Your data is used only...") }
        
        // Button
        Button(onClick = onGetStarted, ...) { Text("Get Started") }
    }
}

@Composable
private fun OnboardingStep(number: String, title: String, description: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .background(
                    Colors.primary.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(BorderRadius.full)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(number, ...)
        }
        Spacer(width = Spacing.lg)
        Column {
            Text(title, ...)
            Spacer(height = 2.dp)
            Text(description, ...)
        }
    }
}
```

---

### Screen 3: Personal Details Screen

**Route name**: `personal_details`  
**Trigger**: First screen after onboarding intro  
**Purpose**: Collect user's basic profile information (used to calibrate training plans)

**Fields**:

| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| **Full Name** | Text | Min 2 chars, max 50 | Yes |
| **Email** | Email | Valid email format | Yes |
| **Date of Birth** | Day/Month/Year dropdowns | Age 13–120 | Yes* |
| **Gender** | Dropdown (Male / Female / Prefer not to say) | — | Yes |
| **Weight (kg)** | Number | 30–250 | Yes |
| **Height (cm)** | Number | 100–250 | Yes |
| **Default Session Type** | Button group (Run / Walk) | — | Yes |

*Note: Users can toggle "I only want to provide my year of birth" to skip day/month and just provide year.

**Layout**:
```
[Top bar with back button: "Personal Details"]

[Scrollable form]
  Full Name
  [text input field]
  
  Email
  [text input field]
  
  Date of Birth
  [Toggle: "I only want to provide my year of birth"]
  [If toggle ON: Year only field]
  [If toggle OFF: Day, Month, Year dropdown selectors]
  Helper text: "Used to estimate your maximum heart rate 
               and personalise training intensity."
  
  Gender
  [Dropdown selector]
    ├─ Male
    ├─ Female
    └─ Prefer not to say
  
  Weight (kg)
  [number input field]
  [Helper text: "Enter your weight in kilograms"]
  
  Height (cm)
  [number input field]
  [Helper text: "Enter your height in centimeters"]
  
  Default Session Type
  [Button group: Run | Walk]
  Label: "What's your primary activity?"

[Sticky bottom button]
  [Save Changes button - disabled until all required fields filled]
```

**Validation Rules**:
- Name: At least 2 characters
- Email: Valid email format (standard email validation)
- Age (derived from DOB): 13–120 years old
- Weight: 30–250 kg
- Height: 100–250 cm
- All fields except gender are required

**On Save**:
```swift
// Save to local storage / backend
SessionManager.shared.setUserProfile(
    name: nameField.text,
    email: emailField.text,
    dateOfBirth: dobValue,  // Format: "DDMMYYYY" or "0101YYYY" if year-only
    gender: genderSelector.selected,
    weight: Float(weightField.text),
    height: Float(heightField.text),
    defaultSessionType: sessionTypeButtons.selected  // "Run" | "Walk"
)

// Update flag
SessionManager.shared.setNeedsProfileSetup(false)

// Navigate to next screen
navigateTo(.fitnessLevel)
```

**Reference Implementation (Android)**:
- PersonalDetailsScreen.kt handles all 7 fields
- Uses Compose OutlinedTextField, dropdowns, and button groups
- Date picker uses day/month/year dropdowns with year-only toggle option
- Form persists to backend via viewModel and SessionManager

---

### Screen 4: Fitness Level Screen

**Route name**: `fitness_level`  
**Purpose**: Determine user's starting fitness level

**Layout**:
```
[Top bar: "Fitness Level"]

[Scrollable content]
  What's your current fitness level?
  
  [Radio Group]
    ○ Beginner
      New to running or returning after 6+ months off
    
    ○ Intermediate (Default selected)
      Running 2-3 times per week, comfortable pace
    
    ○ Advanced
      Running 4+ times per week, varied paces

[Sticky bottom]
  [Continue button]
```

**Selection Behavior**:
- Radio buttons (only one selected at a time)
- "Intermediate" is the default selection
- Continue button enabled immediately (field is required with default)

**On Save**:
```swift
SessionManager.shared.setFitnessLevel(
    fitnessLevel.selectedOption  // "beginner" | "intermediate" | "advanced"
)
navigateTo(.aiCoachingConsent)
```

---

### Screen 5: AI Coaching Consent Screen (NEW)

**Route name**: `ai_coaching_consent`  
**Trigger**: After fitness level screen  
**Purpose**: Introduce AI coaching and obtain explicit consent

**Key Features**:
- Transparent about what AI coaching does
- Clear data/privacy disclosure (OpenAI usage, no retention)
- Two distinct paths: consent or skip
- Consent saved to persistent store (equivalent to Android `AiConsentManager`)

**Layout**:
```
[Top padding: 56pt]

[72pt circle with 12% opacity primary bg]
[AI/brain icon, primary color]

[xxxl spacing]

"Your AI Running Coach"
(h1, bold, centered)

"Your coach listens to your pace, heart rate, and effort 
in real time — and responds the way a real coach would."
(body, textSecondary, centered)

[xxxl spacing]

[Card - backgroundSecondary]
  What your coach does
  
  [Feature Row 1]
    [icon: trending/chart]
    Real-time pace guidance
    Keeps you on target — tells you when to ease off or push harder.
  
  [Feature Row 2]
    [icon: heart]
    Heart rate and effort coaching
    Monitors your zones and warns you before you redline.
  
  [Feature Row 3]
    [icon: timer]
    Km splits and milestones
    Regular updates on your progress, pacing, and what's coming next.
  
  [Feature Row 4]
    [icon: brain/AI]
    Adaptive session plans
    Your training plan evolves based on how your runs actually go.

[xl spacing]

[Card - backgroundSecondary, smaller]
  Data & privacy
  
  Real-time coaching uses OpenAI. Your pace, heart rate, 
  and session data are shared with OpenAI to generate coaching. 
  No personal identifiers are ever included. OpenAI does 
  not retain this data after processing. You can disable 
  AI coaching at any time.

[xxxl spacing]

[Primary Button - Full Width - 50pt height]
  Enable AI Coaching

[lg spacing]

[Text Button - Centered - textMuted color]
  Continue without AI coaching

[Bottom padding: 32pt]
```

**Feature Row Component** (repeats 4 times):
- Left: 20pt icon, primary color, 2pt top padding
- Right: Column with title + description
  - Title: body semibold, textPrimary
  - Description: caption, textSecondary
- 12pt gap between icon and text

**Feature Rows**:
1. **trending/chart icon** → Real-time pace guidance → Keeps you on target...
2. **heart icon** → Heart rate and effort coaching → Monitors your zones...
3. **timer/clock icon** → Km splits and milestones → Regular updates...
4. **brain/AI icon** → Adaptive session plans → Your training plan evolves...

**State Persistence**:
```swift
struct AiConsentManager {
    static let userDefaults = UserDefaults.standard
    
    static func setConsent(granted: Bool) {
        userDefaults.set(true, forKey: "ai_consent_seen")
        userDefaults.set(granted, forKey: "ai_consent_granted")
    }
    
    static func isConsentGranted() -> Bool {
        return userDefaults.bool(forKey: "ai_consent_granted")
    }
    
    static func hasSeenConsent() -> Bool {
        return userDefaults.bool(forKey: "ai_consent_seen")
    }
}
```

**Navigation**:
- "Enable AI Coaching" → `setConsent(true)` → `coach_settings`
- "Continue without AI coaching" → `setConsent(false)` → `coach_settings`

---

### Screen 6: AI Coach Settings Screen (MODIFIED)

**Route name**: `coach_settings`  
**Change**: In-session coaching toggles REMOVED (moved to separate screen)  
**Usage**: Onboarding (isOnboarding: true) or profile settings (isOnboarding: false)

**What STAYS**:
- Coach name (text field)
- Voice gender (toggle: Male / Female)
- Accent selection (dropdown list)
- Coaching tone (card selector: Aggressive / Balanced / Easy)
- Master AI toggle (on/off)

**What was REMOVED**:
- All individual coaching feature toggles (pace, HR, elevation, cadence, etc.)

**Layout**:
```
[Top bar with back button]
"AI Coach Settings"

[Scrollable form]
  Coach Name
  [text field - e.g. "Coach Sarah"]
  
  Voice Gender
  [Toggle buttons: Male | Female]
  
  Accent
  [Dropdown selector]
    ├─ American
    ├─ British
    ├─ Australian
    └─ Generic
  
  Coaching Tone
  [Card selector - three cards]
    
    [Aggressive - outlined/selected state]
     Push hard, detailed cues
    
    [Balanced - outlined/selected state]
     Standard coaching
    
    [Easy-going - outlined/selected state]
     Gentle guidance
  
  Master AI Toggle
  [Toggle switch - labeled "Enable AI Coaching"]
  (Default: ON if user granted consent, OFF otherwise)

[Sticky bottom]
  [Button text: "Continue" in onboarding, "Save Changes" in profile]
```

**Default Master Toggle**:
```swift
// Read from AiConsentManager to set default state
let masterAiEnabled = AiConsentManager.isConsentGranted()
```

**Top App Bar / Navigation Bar**:
- Has back button (chevron left icon)
- `windowInsets` set to zero (parent nav already handles safe area)
- Do not double-apply status bar padding

**On Save**:
```swift
let coachSettings = CoachSettings(
    name: nameField.text,
    voiceGender: voiceToggle.selectedValue,  // "male" | "female"
    accent: accentPicker.selected,
    coachingTone: toneCards.selected,        // "aggressive" | "balanced" | "easy"
    masterAiEnabled: masterToggle.isOn
)

SessionManager.shared.setCoachSettings(coachSettings)

// In onboarding, navigate to coaching prompts
if isOnboarding {
    navigateTo(.coachingPromptsSettings)
} else {
    // In profile, pop back
    dismiss()
}
```

---

### Screen 7: Coaching Prompts Settings Screen (NEW)

**Route name**: `coaching_prompts_settings`  
**Trigger**: After AI Coach Settings in onboarding flow  
**Purpose**: Configure which real-time coaching features fire during runs  
**Important**: This is the FINAL onboarding step before subscription

**Layout**:
```
[Top bar with back button]
"Coaching Prompts"

[Scrollable content]
  Choose which real-time coaching prompts are active during 
  your runs. You can change these at any time in your profile.
  
  [IF Master AI is disabled: Show this card]
  ┌─────────────────────────────────────┐
  │ AI coaching is currently disabled.  │
  │ Enable it in the previous step to   │
  │ configure these prompts.            │
  └─────────────────────────────────────┘
  
  [IF Master AI is enabled: Show toggles]
  
  [Toggle Row 1]
    [● ]  Pace Coaching
           Target pace guidance — warns when you're 
           going too fast or slow
  
  [Toggle Row 2]
    [● ]  Route Navigation
           Turn-by-turn voice directions on mapped routes
  
  [Toggle Row 3]
    [● ]  Elevation Coaching
           Hill and gradient advice — pacing tips on 
           climbs and descents
  
  [Toggle Row 4]
    [● ]  Heart Rate Coaching
           Heart rate zone guidance during your run
  
  [Toggle Row 5]
    [● ]  Cadence & Stride
           Running form analysis — stride length and 
           cadence coaching
  
  [Toggle Row 6]
    [● ]  500m Check-In
           Initial pace assessment at 500 metres into your run
  
  [Toggle Row 7]
    [● ]  Km Split Updates
           Pace and progress updates at each split interval
           
           [KM Split Interval Selector]
           1km  2km  5km
  
  [Toggle Row 8]
    [● ]  Struggle Detection
           Supportive coaching when your pace drops significantly
  
  [Toggle Row 9]
    [● ]  Motivational Coaching
           Milestones, phase changes, technique tips, 
           and encouragement

[Sticky bottom]
  [Primary Button - Full Width]
    Save & Continue
```

**Toggles** (all ON by default):
| Toggle | Key Name | Description |
|--------|----------|-------------|
| Pace Coaching | `pace_coaching_enabled` | Target pace guidance |
| Route Navigation | `route_navigation_enabled` | Turn-by-turn voice directions |
| Elevation Coaching | `elevation_coaching_enabled` | Hill/gradient advice |
| Heart Rate Coaching | `heart_rate_coaching_enabled` | HR zone guidance |
| Cadence & Stride | `cadence_stride_enabled` | Running form analysis |
| 500m Check-In | `half_km_check_in_enabled` | Initial pace assessment |
| Km Split Updates | `km_splits_enabled` | Pace/progress at splits |
| Struggle Detection | `struggle_detection_enabled` | Supportive coaching on pace drop |
| Motivational Coaching | `motivational_coaching_enabled` | Milestones & encouragement |

**Km Split Interval Selector** (shown when "Km Split Updates" is ON):
- Three segmented buttons: 1km / 2km / 5km
- Default: 1km
- Saved as `km_split_interval_km` (integer)

**Disabled State**:
If `masterAiEnabled` is false:
- Show single card: "AI coaching is currently disabled. Enable it in the previous step..."
- All toggle rows are hidden
- "Save & Continue" still works (saves disabled state)

**Top App Bar**:
- Back button → navigates to AI Coach Settings
- `windowInsets` set to zero

**On Save & Continue**:
```swift
// Save all toggle preferences
let promptSettings = CoachingPromptSettings(
    paceCoachhingEnabled: toggles[0].isOn,
    routeNavigationEnabled: toggles[1].isOn,
    // ... etc for all 9 toggles
    kmSplitIntervalKm: splitIntervalSegment.selectedValue
)

SessionManager.shared.setCoachingPromptSettings(promptSettings)

// Clear onboarding flags
SessionManager.shared.setNeedsProfileSetup(false)
SessionManager.shared.setNeedsCoachSetup(false)

// Navigate to subscription
navigateTo(.onboardingSubscription)
```

---

### Screen 8: Onboarding Subscription Screen

**Route name**: `onboarding_subscription`  
**Purpose**: Present free trial offer and paid subscription tiers  
**Reference**: Already implemented, no changes needed

**Key Elements**:
- Trial countdown (14 days)
- Trial limitations banner (yellow card)
- Available features banner (green card)
- Billing period toggle (Monthly / Annual with savings)
- Plan cards (Lite & Standard with features)
- Continue with Free Trial button
- Upgrade Now buttons

**State Management**:
- Trial start date saved on first completion
- Subscription tier saved to local storage
- "Continue with Free Trial" → navigate to main app

---

## 💾 State Management & Persistence

### Local Storage Keys (Keychain on iOS)

**Onboarding Flags**:
```
"needs_profile_setup" : Bool              // true until personal details saved
"needs_coach_setup" : Bool                // true until coaching settings saved
```

**Personal Details**:
```
"user_name" : String                      // Full name
"user_email" : String                     // Email address
"user_date_of_birth" : String             // DDMMYYYY or 0101YYYY format
"user_gender" : String                    // "male" | "female" | "prefer_not_to_say"
"user_weight_kg" : Float                  // Weight in kg
"user_height_cm" : Float                  // Height in cm
"default_session_type" : String           // "Run" | "Walk"
```

**Fitness Level**:
```
"fitness_level" : String                  // "beginner" | "intermediate" | "advanced"
```

**AI Consent** (UserDefaults, not Keychain):
```
"ai_consent_seen" : Bool                  // true after screen shown
"ai_consent_granted" : Bool               // true if user chose "Enable"
```

**Coach Settings**:
```
"coach_name" : String                     // User-chosen coach name
"coach_voice_gender" : String             // "male" | "female"
"coach_accent" : String                   // "american" | "british" | "australian" | "generic"
"coach_tone" : String                     // "aggressive" | "balanced" | "easy"
"master_ai_enabled" : Bool                // Master AI toggle (default from consent)
```

**Coaching Prompts**:
```
"pace_coaching_enabled" : Bool
"route_navigation_enabled" : Bool
"elevation_coaching_enabled" : Bool
"heart_rate_coaching_enabled" : Bool
"cadence_stride_enabled" : Bool
"half_km_check_in_enabled" : Bool
"km_splits_enabled" : Bool
"struggle_detection_enabled" : Bool
"motivational_coaching_enabled" : Bool
"km_split_interval_km" : Int              // 1, 2, or 5
```

**Subscription**:
```
"subscription_tier" : String              // "free" | "lite" | "standard"
"trial_start_date" : String               // ISO-8601 timestamp
"trial_expires_at" : String?              // ISO-8601 timestamp
"subscription_expires_at" : String?       // For paid subscriptions
```

### Resume Logic on App Launch

```swift
func checkOnboardingStatus() -> NavigationTarget {
    guard let profileSetupNeeded = UserDefaults.standard.bool(forKey: "needs_profile_setup") else {
        // First launch, never completed any onboarding
        return .locationPermission
    }
    
    if profileSetupNeeded {
        // Check how far they got
        if UserDefaults.standard.string(forKey: "user_name") != nil {
            // Completed personal details, continue from next screen
            return .fitnessLevel
        } else {
            // Never started, begin from intro
            return .onboardingIntro
        }
    }
    
    if UserDefaults.standard.bool(forKey: "needs_coach_setup") {
        // Completed personal details, not coaching
        if AiConsentManager.hasSeenConsent() {
            return .coachSettings  // Consent already shown
        } else {
            return .aiCoachingConsent  // Show consent first
        }
    }
    
    // All onboarding done
    if let subTier = UserDefaults.standard.string(forKey: "subscription_tier"), subTier.isEmpty == false {
        return .main
    } else {
        return .onboardingSubscription
    }
}
```

### Prepopulating Forms After Resume

```swift
// In PersonalDetailsScreen
override func viewDidLoad() {
    super.viewDidLoad()
    
    if let savedName = UserDefaults.standard.string(forKey: "user_name") {
        nameField.text = savedName
    }
    if let savedDOB = UserDefaults.standard.string(forKey: "user_date_of_birth"),
       let date = ISO8601DateFormatter().date(from: savedDOB) {
        dobPicker.selectedDate = date
    }
    if let savedWeight = UserDefaults.standard.string(forKey: "user_weight_kg"),
       let weight = Float(savedWeight) {
        weightField.value = weight
    }
    if let savedAvailability = UserDefaults.standard.string(forKey: "user_weekly_availability_hours"),
       let hours = Int(savedAvailability) {
        availabilityField.value = hours
    }
}
```

---

## 🎨 Design System Reference

### Spacing (8pt grid system)

| Name | Value |
|------|-------|
| **xs** | 4pt |
| **sm** | 8pt |
| **md** | 12pt |
| **lg** | 16pt |
| **xl** | 24pt |
| **xxl** | 32pt |
| **xxxl** | 40pt |

### Border Radius

| Name | Value |
|------|-------|
| **sm** | 8pt |
| **md** | 12pt |
| **lg** | 16pt |
| **full** | 9999pt (circle) |

### Colors

| Role | Hex | Usage |
|------|-----|-------|
| **Primary** | #00BFFF | Buttons, highlights, primary actions |
| **Background Root** | #0a0a0f | Main background color |
| **Background Secondary** | #1a1a2e | Cards, secondary backgrounds |
| **Text Primary** | #FFFFFF | Main text |
| **Text Secondary** | #94A3B8 | Secondary text, descriptions |
| **Text Muted** | #4A5568 | Disabled text, very subtle copy |
| **Error** | #EF4444 | Validation errors |
| **Success** | #22C55E | Success states, confirmations |
| **Warning** | #FEF3C7 | Warning banners, trial limitations |

### Typography

| Style | Size | Weight | Usage |
|-------|------|--------|-------|
| **h1** | 24pt | Bold | Screen titles |
| **h2** | 20pt | Bold | Section headers |
| **h4** | 16pt | Varies | Subheaders |
| **body** | 14pt | Regular | Main text |
| **body semibold** | 14pt | Semibold | Emphasis within body |
| **caption** | 12pt | Regular | Helper text, descriptions |

### Shadows

- Elevation 4: Subtle shadow for cards
- Elevation 8: Sticky bottom buttons/bars

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Age validation (min 13, max 120)
- [ ] Name validation (min 2 chars, no numbers)
- [ ] Weight validation (30–250 kg)
- [ ] Availability validation (1–100 hours)
- [ ] Consent storage/retrieval
- [ ] Flag persistence across sessions
- [ ] Trial days remaining calculation

### Integration Tests
- [ ] Complete onboarding flow end-to-end
- [ ] Close app mid-flow → reopen → resume correctly
- [ ] Form validation shows errors inline
- [ ] Disabled state of toggles when AI is off
- [ ] Km split interval selector hidden when toggle is off
- [ ] All Keychain/UserDefaults data saves correctly

### E2E Test Scenarios

**Scenario 1: First-Time User Completes Full Onboarding**
1. [ ] Sign up → Email verification → Location permission screen
2. [ ] Grant permissions → Onboarding Intro appears
3. [ ] "Get Started" → Personal Details form
4. [ ] Fill all 7 fields (name, email, DOB, gender, weight, height, session type) → Continue → Fitness Level
5. [ ] Select "Intermediate" → Continue → AI Coaching Consent
6. [ ] Tap "Enable AI Coaching" → consent saved, navigate to Coach Settings
7. [ ] Fill coach name/voice/tone → Continue → Coaching Prompts
8. [ ] All toggles ON by default → "Save & Continue" → Subscription
9. [ ] "Continue with Free Trial" → Main app
10. [ ] Verify all saved data in Keychain/UserDefaults

**Scenario 2: Resume After App Closure**
1. [ ] Complete Personal Details → Close app
2. [ ] Reopen app → Fitness Level screen appears (form empty)
3. [ ] Select fitness level → Close app
4. [ ] Reopen app → AI Coaching Consent screen appears
5. [ ] Select "Enable AI Coaching" → Close app
6. [ ] Reopen app → Coach Settings screen appears (form empty)
7. [ ] Complete coach settings → Coaching Prompts → Subscription → Main app
8. [ ] Verify no data loss throughout

**Scenario 3: User Skips AI Coaching**
1. [ ] Complete fitness level → AI Coaching Consent screen
2. [ ] Tap "Continue without AI coaching" → Coach Settings
3. [ ] Master toggle is OFF (reads consent = false)
4. [ ] Coaching Prompts screen → Shows "AI coaching disabled" card
5. [ ] All toggles hidden, "Save & Continue" works
6. [ ] Subscription screen appears

**Scenario 4: Form Validation Errors**
1. [ ] Personal Details → Leave name empty → Try to continue
2. [ ] Error message appears under name field: "Name is required"
3. [ ] Leave DOB incomplete → Error shown, form requires valid date
4. [ ] Leave weight as 0 → Error: "Weight must be 30–250 kg"
5. [ ] Leave email invalid → Error: "Enter a valid email address"
6. [ ] Leave height as 0 → Error: "Height must be 100–250 cm"

**Scenario 5: Navigation Consistency**
1. [ ] On any onboarding screen with back button → Back navigates to previous screen
2. [ ] Data is preserved (same form shows saved values)
3. [ ] Bottom buttons always accessible without extra scrolling

---

## 🚀 Implementation Order for iOS

### Phase 1: Core Screens (1.5 days)
1. **OnboardingIntroScreen** — Simple scrollable view, no state
2. **AiCoachingConsentScreen** — Consent persistence, two button paths
3. Update **CoachSettingsScreen** — Remove in-session toggles, read consent for default
4. **CoachingPromptsSettingsScreen** — 9 toggles, km interval selector, disabled state handling
5. Wire all screens in navigation graph

### Phase 2: Data Persistence (1 day)
1. Create `SessionManager` equivalent (flag persistence)
2. Create `AiConsentManager` (consent storage in UserDefaults)
3. Implement save logic after each screen
4. Implement resume logic on app launch
5. Test prepopulation of forms

### Phase 3: State Management & Routing (0.5 days)
1. Update LocationPermissionScreen routing logic
2. Implement smart routing based on flags
3. Test all navigation paths
4. Wire SignUpScreen → LocationPermission

### Phase 4: Testing & Polish (0.5 days)
1. E2E test all scenarios
2. UI refinements (spacing, shadows, keyboard handling)
3. Error message display and validation
4. Accessibility review (labels, tab order, contrast)

**Total Timeline**: 3–3.5 days

---

## 📝 Summary

The Android onboarding flow is an **8-step guided experience** that:
- ✅ Requests permissions upfront
- ✅ Sets clear expectations with intro screen
- ✅ Collects personal details (name, email, DOB, gender, weight, height, default session type)
- ✅ Determines fitness level
- ✅ Obtains explicit AI coaching consent
- ✅ Configures AI coach personality (name, voice, tone, master toggle)
- ✅ Sets up coaching feature toggles (9 types + km split interval)
- ✅ Presents subscription offer with free trial

**Key Features**:
- State persisted at each step (Keychain + UserDefaults)
- Resume logic so users can close app and continue later
- Form validation with inline error messages
- Smart routing based on onboarding flags
- AI consent as explicit separate screen (not just checkbox)
- Disabled states when AI is off
- Scrollable screens with sticky bottom buttons

**Design Consistency**:
- Same color palette as Android
- Same spacing/typography system
- Same layout patterns (scrollable content + sticky buttons)
- Same validation messaging
- Same component hierarchy (step badges, toggle rows, feature cards)

Everything is ready to build! The Android implementation is complete and tested. iOS should match this experience exactly. 🚀
