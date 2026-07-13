# iOS — Onboarding Flow Restructure & Coaching Plan Architecture Brief

**Status**: Ready for Xcode Implementation  
**Scope**: Onboarding flow (4 new/modified screens), coaching plan session enrichment, bug fixes  
**Reference**: Android implementation complete — commit `1aced51` (onboarding) + `0378dc7` (enrichment)  
**Priority**: High — affects all new users and the training plan feature for paying subscribers

---

## Overview of Today's Changes

Two separate but related bodies of work:

1. **Onboarding flow restructure** — 4 new/modified screens with a cleaner, more trustworthy user journey
2. **Coaching plan enrichment architecture** — backend now sends `targetPace: null` at plan creation and enriches sessions with real user data afterwards. iOS must handle null paces gracefully and show appropriate placeholder copy.

---

## Part 1 — Onboarding Flow Restructure

### New Flow (replaces old flow)

**OLD FLOW:**
```
Location permissions → Personal Details → Injuries → Fitness Level → Coach Settings → Subscription
```

**NEW FLOW:**
```
Location permissions
  → Onboarding Intro (NEW)
  → Personal Details (unchanged)
  → Injuries (unchanged)
  → Fitness Level (unchanged)
  → AI Coaching Consent (NEW)
  → AI Coach Settings — personality only (MODIFIED)
  → Coaching Prompts Settings (NEW)
  → Subscription (unchanged)
```

---

### Screen 1 (NEW): Onboarding Intro Screen

**Route name**: `onboarding_intro`  
**Trigger**: Immediately after location permissions are granted for a new user  
**Purpose**: Set clear expectations about what onboarding involves before any data is collected

**Design principles:**
- No emoji, no animations, no marketing copy
- Clean, honest, professional
- Scrollable column layout
- Background: app background root colour

**Layout:**
```
┌──────────────────────────────────┐
│  (top padding: 56pt)             │
│                                  │
│  [72pt circle, primary/12% bg]   │
│  [trending/graph icon, primary]  │
│                                  │
│  (spacing: xxxl)                 │
│                                  │
│  Let's get you set up            │  ← h1, bold, centred
│                                  │
│  We'll ask you a few questions   │  ← body, secondary colour, centred
│  so your training plan and AI    │
│  coach are built around you —    │
│  not a generic template.         │
│                                  │
│  (spacing: xxxl)                 │
│                                  │
│  ┌──────────────────────────┐    │
│  │[1]  Personal details     │    │  ← step row (see below)
│  │     Date of birth,       │    │
│  │     weight, and weekly   │    │
│  │     availability — used  │    │
│  │     to calibrate plan.   │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │[2]  Injuries and fitness │    │
│  │     Any current injuries │    │
│  │     and fitness level.   │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │[3]  AI coach preferences │    │
│  │     Name, voice, and     │    │
│  │     coaching style.      │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │[4]  In-run coaching      │    │
│  │     Choose which real-   │    │
│  │     time coaching        │    │
│  │     features are active. │    │
│  └──────────────────────────┘    │
│                                  │
│  (spacing: xxxl)                 │
│                                  │
│  ┌─────────────────────────────┐ │
│  │ Your data is used only to   │ │  ← privacy card: backgroundSecondary
│  │ personalise your training.  │ │     caption text, textMuted colour
│  │ It is never sold or shared  │ │     centred text
│  │ with third parties.         │ │
│  └─────────────────────────────┘ │
│                                  │
│  (spacing: xxxl)                 │
│                                  │
│  [        Get Started        ]   │  ← primary button, full width, 50pt height
│                                  │
│  (bottom padding: 32pt)          │
└──────────────────────────────────┘
```

**Step Row component** (used 4 times):
- Row layout, aligned to top
- Left: 32pt circle with primary colour at 15% opacity, number text (body bold, primary colour) centred inside
- Right: title (body, semibold, textPrimary) + description (caption, textSecondary) in a column
- 16pt gap between badge and text

**Step content:**

| # | Title | Description |
|---|-------|-------------|
| 1 | Personal details | Date of birth, weight, and weekly availability — used to calibrate your plan. |
| 2 | Injuries and fitness | Any current injuries and your current fitness level — so we can start you in the right place. |
| 3 | AI coach preferences | Name, voice, and coaching style — your coach, your way. |
| 4 | In-run coaching | Choose which real-time coaching features are active during your runs. |

**Behaviour:**
- "Get Started" navigates to Personal Details
- No back button (this is the start of onboarding)
- Scrollable — handles small screens

---

### Screen 2 (NEW): AI Coaching Consent/Intro Screen

**Route name**: `ai_coaching_onboarding`  
**Trigger**: After Fitness Level screen (before AI Coach Settings)  
**Purpose**: Introduce AI coaching capabilities, obtain explicit consent, set `masterAiEnabled` to true by default

**Key behaviour:**
- "Enable AI Coaching" → saves consent as `granted = true` → navigates to AI Coach Settings
- "Continue without AI coaching" → saves consent as `granted = false` → navigates to AI Coach Settings
- Consent is stored in a local preferences store (equivalent to Android's `AiConsentManager` using SharedPreferences — use UserDefaults for iOS)
- The Coach Settings screen reads this stored consent to set the master AI toggle default

**Layout:**
```
┌──────────────────────────────────┐
│  (top padding: 56pt)             │
│                                  │
│  [72pt circle, primary/12% bg]   │
│  [AI/brain icon, primary]        │
│                                  │
│  (spacing: xxxl)                 │
│                                  │
│  Your AI Running Coach           │  ← h1, bold, centred
│                                  │
│  Your coach listens to your      │  ← body, textSecondary, centred
│  pace, heart rate, and effort    │
│  in real time — and responds     │
│  the way a real coach would.     │
│                                  │
│  (spacing: xxxl)                 │
│                                  │
│  ┌──────────────────────────────┐ │
│  │ What your coach does         │ │  ← card: backgroundSecondary, lg radius
│  │                              │ │
│  │ [icon] Real-time pace        │ │  ← feature row (see below)
│  │        guidance              │ │
│  │        Keeps you on target   │ │
│  │                              │ │
│  │ [icon] Heart rate and effort │ │
│  │        coaching              │ │
│  │        Monitors your zones   │ │
│  │                              │ │
│  │ [icon] Km splits and         │ │
│  │        milestones            │ │
│  │        Regular updates on    │ │
│  │        progress              │ │
│  │                              │ │
│  │ [icon] Adaptive session      │ │
│  │        plans                 │ │
│  │        Evolves based on      │ │
│  │        your actual runs      │ │
│  └──────────────────────────────┘ │
│                                  │
│  (spacing: xl)                   │
│                                  │
│  ┌──────────────────────────────┐ │
│  │ Data & privacy               │ │  ← smaller card, backgroundSecondary
│  │                              │ │     body semibold title, caption body
│  │ Real-time coaching uses      │ │
│  │ OpenAI. Your pace, heart     │ │
│  │ rate, and session data are   │ │
│  │ shared with OpenAI to        │ │
│  │ generate coaching. No        │ │
│  │ personal identifiers are     │ │
│  │ ever included. OpenAI does   │ │
│  │ not retain this data after   │ │
│  │ processing. You can disable  │ │
│  │ AI coaching at any time.     │ │
│  └──────────────────────────────┘ │
│                                  │
│  (spacing: xxxl)                 │
│                                  │
│  [    Enable AI Coaching     ]   │  ← primary button, 50pt height, full width
│                                  │
│  (spacing: lg)                   │
│                                  │
│  Continue without AI coaching    │  ← text button, textMuted colour, centred
│                                  │
│  (bottom: 32pt)                  │
└──────────────────────────────────┘
```

**Feature Row component** (used 4 times inside the card):
- Row aligned to top
- Left: 20pt icon, primary colour, 2pt top padding
- Right: title (body, semibold, textPrimary) + description (caption, textSecondary)
- 12pt gap between icon and text

**Feature rows:**

| Icon | Title | Description |
|------|-------|-------------|
| trending/chart | Real-time pace guidance | Keeps you on target — tells you when to ease off or push harder. |
| heart | Heart rate and effort coaching | Monitors your zones and warns you before you redline. |
| timer/clock | Km splits and milestones | Regular updates on your progress, pacing, and what's coming next. |
| AI/brain | Adaptive session plans | Your training plan evolves based on how your runs actually go. |

**iOS state persistence:**
```swift
// Store AI consent in UserDefaults
struct AiConsentManager {
    static let defaults = UserDefaults.standard
    
    static func setConsent(granted: Bool) {
        defaults.set(true, forKey: "ai_consent_seen")
        defaults.set(granted, forKey: "ai_consent_granted")
    }
    
    static func isConsentGranted() -> Bool {
        return defaults.bool(forKey: "ai_consent_granted")
    }
    
    static func hasSeenConsent() -> Bool {
        return defaults.bool(forKey: "ai_consent_seen")
    }
}
```

---

### Screen 3 (MODIFIED): AI Coach Settings

**Route name**: `coach_settings`  
**Change summary**: The in-session coaching feature toggles have been REMOVED from this screen and moved to the new "Coaching Prompts" screen. This screen now only handles personality settings.

**What STAYS on this screen:**
- Coach name (text field)
- Voice gender (male / female toggle buttons)
- Accent selection (scrollable list of options)
- Coaching tone (card selector)
- Master AI coaching toggle (on/off)

**What was REMOVED** (now on the next screen):
- All individual coaching feature toggles (pace, HR, elevation, cadence, etc.)

**Button label change:**
- When used in onboarding: button says **"Continue"** (not "Save Changes")
- When accessed from profile/settings post-onboarding: button still says "Save Changes"
- Pass `isOnboarding: Bool` parameter to the screen to differentiate

**Default state:**
- `masterAiEnabled` should read from `AiConsentManager.isConsentGranted()` — so if the user tapped "Enable AI Coaching" on the previous screen, this toggle will be ON by default

**TopAppBar:**
- Title: "AI Coach Settings"
- Has back button (chevron left)
- `windowInsets` set to zero (parent navigation already handles safe area — do not double-apply status bar padding)

**Navigation:**
- In onboarding: "Continue" → navigates to Coaching Prompts screen
- From profile: "Save Changes" → pops back to profile

---

### Screen 4 (NEW): Coaching Prompts Settings (In-Session Coaching)

**Route name**: `coaching_prompts_settings`  
**Trigger**: After AI Coach Settings in the onboarding flow  
**Purpose**: Let users configure which real-time coaching prompt types fire during runs

**This is the FINAL onboarding step before the subscription screen.**

**On save:**
1. Save all toggle preferences to UserDefaults
2. Clear `needs_coach_setup` flag (equivalent to Android's `SessionManager.setNeedsCoachSetup(false)`)
3. Clear onboarding flags (`clearOnboardingFlags()`)
4. Navigate to subscription screen

**Layout:**
```
┌──────────────────────────────────┐
│ ← Coaching Prompts               │  ← nav bar with back button
├──────────────────────────────────┤
│                                  │
│  Choose which real-time coaching │  ← body, textSecondary
│  prompts are active during your  │
│  runs. You can change these at   │
│  any time in your profile.       │
│                                  │
│  (if AI disabled: show card)     │
│  "AI coaching is currently       │
│  disabled. Enable it in the      │
│  previous step."                 │
│                                  │
│  (if AI enabled: show toggles)   │
│                                  │
│  ┌──────────────────────────────┐ │
│  │ Pace Coaching          [  ●]│ │  ← toggle row (see below)
│  │ Target pace guidance —      │ │
│  │ warns when too fast/slow    │ │
│  └──────────────────────────────┘ │
│                                  │
│  ... (all feature toggle rows)   │
│                                  │
├──────────────────────────────────┤
│  [      Save & Continue      ]   │  ← sticky bottom button
└──────────────────────────────────┘
```

**Feature toggles (all ON by default):**

| Toggle title | Description | Key name |
|---|---|---|
| Pace Coaching | Target pace guidance — warns when you're going too fast or slow | `pace_coaching_enabled` |
| Route Navigation | Turn-by-turn voice directions on mapped routes | `route_navigation_enabled` |
| Elevation Coaching | Hill and gradient advice — pacing tips on climbs and descents | `elevation_coaching_enabled` |
| Heart Rate Coaching | Heart rate zone guidance during your run | `heart_rate_coaching_enabled` |
| Cadence & Stride | Running form analysis — stride length and cadence coaching | `cadence_stride_enabled` |
| 500m Check-In | Initial pace assessment at 500 metres into your run | `half_km_check_in_enabled` |
| Km Split Updates | Pace and progress updates at each split interval | `km_splits_enabled` |
| Struggle Detection | Supportive coaching when your pace drops significantly | `struggle_detection_enabled` |
| Motivational Coaching | Milestones, phase changes, technique tips, and encouragement | `motivational_coaching_enabled` |

**Km Split Interval selector** (shown only when "Km Split Updates" is ON):
- Lets user pick interval: 1km, 2km, 5km
- Saved as `km_split_interval_km` (integer)

**Disabled state:**
- If `masterAiEnabled` is false (user skipped AI coaching), show a single card:
  > "AI coaching is currently disabled. Enable it in the previous step to configure these prompts."
- All toggle rows are hidden

**TopAppBar:**
- Title: "Coaching Prompts"
- Back button navigates to AI Coach Settings
- `windowInsets` set to zero

---

### Updated Navigation Flow (complete)

```swift
// After email verification / sign-up, go to location permissions
// LocationPermissionScreen on grant:

func onPermissionGranted() {
    if sessionManager.needsProfileSetup() {
        // NEW: Go to intro first
        navigate(to: "onboarding_intro", clearBackStack: true)
    } else if sessionManager.needsCoachSetup() {
        // NEW: Go to AI coaching consent (not coach settings directly)
        navigate(to: "ai_coaching_onboarding", clearBackStack: true)
    } else if !aiConsentManager.hasSeenConsent() {
        navigate(to: "ai_consent", clearBackStack: true)
    } else {
        navigate(to: "main", clearBackStack: true)
    }
}

// OnboardingIntroScreen
onGetStarted → navigate to "personal_details"

// PersonalDetailsScreen
onContinue → navigate to "injury_onboarding"

// InjuryOnboardingScreen
onContinue → navigate to "fitness_level_onboarding"

// FitnessLevelScreen
onContinue → navigate to "ai_coaching_onboarding"  // CHANGED (was coach_settings)

// AiCoachingOnboardingScreen
onEnableAndContinue → setConsent(true) → navigate to "coach_settings"
onSkip             → setConsent(false) → navigate to "coach_settings"

// CoachSettingsScreen (isOnboarding: true)
onSave → navigate to "coaching_prompts_settings"  // CHANGED (was subscription)

// CoachingPromptsSettingsScreen
onSaveAndContinue → save settings → clearOnboardingFlags() → navigate to "onboarding_subscription"

// OnboardingSubscriptionScreen
onContinue → navigate to "main"
```

---

## Part 2 — Coaching Plan Architecture (iOS Handling Required)

### What Changed on the Server

The AI coaching plan generator has been restructured with a **staggered enrichment model**:

**Before (old):** GPT generated `targetPace` (e.g. `"5:50/km"`) at plan creation for every session — these values were often inconsistent with the assigned heart rate zone because GPT was guessing.

**After (new):** 
- GPT outputs an `effortLabel` (e.g. `"easy_aerobic"`, `"lactate_threshold"`) instead of a specific pace
- `targetPace` is `null` at plan creation
- A separate enrichment service runs after plan creation and fills in real, physiologically-consistent pace and HR values derived from the user's actual run history
- Weeks 1-2 are enriched immediately (or after orientation run for new users)
- Weeks 3+ are enriched progressively as the user completes sessions

### New Fields on PlannedWorkout (API response)

Three new fields are now returned for each planned workout:

```
effortLabel: String?           // e.g. "easy_aerobic", "tempo_threshold", "race_pace" — GPT's coaching intent
isEnrichmentPending: Boolean   // true while this session is awaiting enrichment
```

And on the training plan object:

```
enrichedThroughWeek: Int?      // which week number has been enriched up to (null = not enriched/legacy)
```

### What iOS Must Handle

#### 1. Null `targetPace`

`targetPace` can now be `null`. Any UI that displays target pace must handle this gracefully.

**Do NOT show:** "null", "0:00/km", or crash
**DO show:** Nothing (simply omit the pace chip/badge) OR show the `effortLabel` in human-readable form

```swift
// Example handling
if let pace = workout.targetPace, !pace.isEmpty {
    // Show pace chip: "5:50/km"
    paceView.text = pace
    paceView.isHidden = false
} else if let effort = workout.effortLabel {
    // Optionally show effort label instead
    // e.g. "easy_aerobic" → "Easy aerobic run"
    paceView.isHidden = true  // or show effort label
} else {
    paceView.isHidden = true
}
```

#### 2. Enrichment Pending State

When `isEnrichmentPending == true`, show placeholder copy instead of session targets.

**Placeholder copy to use (matches iOS design language):**

For sessions in weeks 1-2 (pending orientation):
> "Your targets for this session will be set after your orientation run."

For sessions in future weeks:
> "Your targets for this week will be personalised based on your performance. Check back on [enrichment date]."

The `isEnrichmentPending` field tells you whether to show real data or a placeholder.

#### 3. Effort Label Display

`effortLabel` values from the server and their human-readable equivalents:

| `effortLabel` | Display text |
|---|---|
| `easy_aerobic` | Easy aerobic |
| `lactate_threshold` | Threshold |
| `tempo` | Tempo |
| `interval` | Intervals |
| `race_pace` | Race pace |
| `recovery` | Recovery |
| `long_run` | Long run |
| `orientation` | Orientation run |
| Any other value | Use as-is (capitalise first letter) |

#### 4. HR Zone BPM Values

`hrZoneMinBpm` and `hrZoneMaxBpm` are now computed via a 3-tier system:

- **Tier 1** (best): Derived from the user's actual HR+pace run history
- **Tier 2**: Tanaka formula from date of birth (computed server-side, reliable)
- **Tier 3**: GPT estimate from stated fitness level (least reliable, used for new users with no data)

These values are set correctly on the server now — iOS should display them as received. No client-side zone calculation is needed.

---

## Part 3 — Bug Fixes to Replicate

### Bug Fix 1: Average Run Distance Showing 0.0

**Location:** Training plan baseline/summary screen where `avgDistance` is displayed

**Root cause:** The server returns `avgDistance` in **kilometres** (e.g. `4.69`). The Android app was incorrectly dividing by 1000, producing `0.00469` which rounded to `0.0 km`.

**Fix:** Use the value directly from the API response — no unit conversion needed.

```swift
// WRONG (was causing 0.0km)
let displayDistance = baseline.avgDistance / 1000.0

// CORRECT
let displayDistance = baseline.avgDistance  // already in km
```

**Display format:** Round to 1 decimal place, append " km"
```swift
label.text = String(format: "%.1f km", baseline.avgDistance)
```

### Bug Fix 2: TopAppBar / NavigationBar Double Padding

**Applies to screens that are pushed as child views within a navigation controller hierarchy.**

On Android, the parent `Scaffold` in `MainScreen` already consumes status bar insets via `innerPadding`. Child `TopAppBar` widgets were re-applying status bar insets, creating extra dead space above the navigation bar title.

**iOS equivalent:** If you are using a `NavigationController` or `NavigationStack` and child views with their own `UINavigationBar` equivalent (or a custom top bar), ensure you are not double-applying `safeAreaInsets.top`. Use `.ignoresSafeArea(.all, edges: .top)` on child screens that are embedded in a nav stack where the parent already handles the safe area.

**Specifically check these screens for the fix:**
- Training Plan dashboard screen
- Personal Details settings screen

---

## Design System Reference

All screens use the same design system as documented in the existing iOS design system brief. Key values for the new screens:

### Spacing
| Name | Value |
|------|-------|
| xs | 4pt |
| sm | 8pt |
| md | 12pt |
| lg | 16pt |
| xl | 24pt |
| xxl | 32pt |
| xxxl | 40pt |
| xxxxl | 48pt |

### Border Radius
| Name | Value |
|------|-------|
| sm | 8pt |
| md | 12pt |
| lg | 16pt |
| full | 9999pt (circle) |

### Colours (same as existing system)
| Role | Value |
|------|-------|
| Primary | `#00BFFF` |
| Background root | `#0a0a0f` |
| Background secondary | `#1a1a2e` |
| Text primary | `#FFFFFF` |
| Text secondary | `#94A3B8` |
| Text muted | `#4A5568` |

### Typography
| Style | Size | Weight |
|-------|------|--------|
| h1 | 24pt | Bold |
| h2 | 20pt | Bold |
| h4 | 16pt | varies |
| body | 14pt | Regular |
| caption | 12pt | Regular |

---

## Implementation Order

### Phase 1 — Onboarding Screens (1.5 days)
1. `OnboardingIntroScreen` — purely display, no state, simplest screen
2. `AiCoachingOnboardingScreen` — display + consent persistence
3. Update `AiCoachSettingsScreen` — remove in-session toggles, add `isOnboarding` param
4. `CoachingPromptsSettingsScreen` — all feature toggles, save & clear onboarding flags
5. Wire all new routes in the navigation graph

### Phase 2 — Coaching Plan Integration (0.5 days)
1. Update all `targetPace` displays to handle `null` gracefully
2. Add `isEnrichmentPending` handling with placeholder copy
3. Add `effortLabel` display mapping
4. Fix `avgDistance` unit bug on plan summary/baseline screen

### Phase 3 — Testing (0.5 days)
1. Complete new user onboarding flow end-to-end
2. Verify consent stored correctly and flows into coach settings master toggle
3. Verify "Continue without AI coaching" flow disables toggle correctly
4. Verify null targetPace renders cleanly (no crash, no "null" text)
5. Verify isEnrichmentPending shows placeholder copy
6. Verify avgDistance shows correct value (e.g. 4.7km, not 0.0km)

---

## Testing Scenarios

### New User Onboarding Flow
1. Sign up → location permission → **Onboarding Intro** screen appears
2. "Get Started" → Personal Details
3. Fill details → Continue → Injuries → Continue → Fitness Level → Continue
4. **AI Coaching screen** appears with "What your coach does" feature list
5. Tap "Enable AI Coaching" → AI consent stored as `granted = true`
6. **AI Coach Settings** screen: master toggle is ON (reads stored consent)
7. Configure name/voice/tone → "Continue"
8. **Coaching Prompts** screen: all toggles ON by default
9. "Save & Continue" → clears onboarding flags → Subscription screen

### User Who Skips AI Coaching
1. Same as above until AI Coaching screen
2. Tap "Continue without AI coaching" → consent stored as `granted = false`
3. AI Coach Settings screen: master toggle is OFF
4. Coaching Prompts screen: shows "AI coaching disabled" card, all toggles hidden
5. "Save & Continue" → Subscription

### Training Plan with Null Pace
1. User has a coaching plan
2. Weeks 1-2, sessions not yet enriched (new user, no orientation run)
3. Session cards: no pace chip shown, placeholder copy visible
4. User completes orientation run
5. Weeks 1-2 sessions: real pace values appear, `isEnrichmentPending = false`

### Average Distance Display
1. Open a coaching plan with a baseline
2. "Avg run distance" shows e.g. "4.7 km" (not "0.0 km")

---

## Files Created/Modified on Android (for reference)

**New files:**
- `ui/screens/OnboardingIntroScreen.kt`
- `ui/screens/AiCoachingOnboardingScreen.kt`
- `ui/screens/InSessionCoachingSettingsScreen.kt`
- `server/session-enrichment-service.ts` (backend — no iOS action needed)

**Modified files:**
- `ui/screens/CoachSettingsScreen.kt` — removed in-session toggles, added `isOnboarding` param
- `ui/navigation/RootNavigationGraph.kt` — all new routes wired
- `server/training-plan-service.ts` — `targetPace` now null at generation
- `shared/schema.ts` — new fields: `effortLabel`, `isEnrichmentPending`, `enrichedThroughWeek`

**Database migration run (Neon):**
- `ADD_SESSION_ENRICHMENT_COLUMNS.sql` — already applied, no iOS action needed

---

## Summary

**Onboarding** now has a clear, trustworthy 6-step flow. New users see an intro screen that explains what they're about to fill in and why. AI coaching consent is its own dedicated screen before coach settings, with AI enabled by default. The coaching feature toggles have been split onto their own screen as the final onboarding step.

**Coaching plans** now send `targetPace: null` at generation — iOS must display placeholder copy when `isEnrichmentPending: true` and hide/handle null paces cleanly. The server enriches sessions with real data progressively as the user runs.

**Bug fix** — `avgDistance` on the plan baseline is in km, not metres. Divide by 1 (use directly), not by 1000.
