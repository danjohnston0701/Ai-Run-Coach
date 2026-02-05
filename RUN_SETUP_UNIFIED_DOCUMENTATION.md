# Run Setup Screen Unification - Complete Documentation

**Date:** February 5, 2026  
**Status:** ✅ COMPLETED AND LOCKED  
**Version:** 2.0 (Unified)

## 🎯 Overview

This document serves as the **definitive reference** for the run setup flow in AI Run Coach. All old implementations have been removed and replaced with a single, unified, modern design.

---

## ⚠️ CRITICAL: What Was Removed

### ❌ Deleted Files (DO NOT RESTORE)
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/RunSetupScreen.kt` 
  - **Reason:** Basic, outdated design with plain text fields
  - **Replaced by:** `MapMyRunSetupScreen.kt`
  - **Git deletion:** Committed on Feb 5, 2026

### ❌ Removed Routes
- `run_setup/{mode}` route in `MainScreen.kt`
  - **Reason:** Navigation to old basic screen
  - **Status:** Completely removed from navigation graph

---

## ✅ Current Implementation

### Single Source of Truth
**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MapMyRunSetupScreen.kt`

This is the **ONLY** run setup screen in the app. Do not create alternatives.

### Features
1. **Modern UI Design**
   - Card-based layout with proper spacing
   - Cyan primary color scheme (#00E5FF)
   - Circular icon badges
   - Sliders for distance selection
   - Toggle switches for options

2. **Target Distance**
   - Slider: 1-50 km range
   - Visual feedback with cyan accent
   - Real-time display of selected distance

3. **Target Time Card (Doubled Size - Feb 5, 2026)**
   - Clock icon: 50dp background, 28dp icon
   - Text sizes increased for better visibility
   - Time picker inputs: 64dp × 48dp boxes
   - Number font: 24sp
   - Toggle switch with ON/OFF states

4. **Dual Action Buttons**
   - **"GENERATE ROUTE"** (Primary cyan button)
     - Triggers AI route generation
     - Navigates to loading screen → route selection
   - **"START RUN WITHOUT ROUTE"** (Outlined button)
     - Creates RunSetupConfig
     - Navigates directly to run session
     - No route generation

5. **Navigation Support**
   - Close icon (top right) - Returns to dashboard
   - Home icon (bottom nav) - Returns to dashboard
   - Proper back stack management

6. **AI Coach Toggle (Dashboard)**
   - Size reduced by 25% (Feb 5, 2026)
   - Icon: 12dp
   - Switch scale: 0.6f
   - Text: caption style
   - Padding: xs values

---

## 📍 Navigation Flow

### Entry Points (Both use same screen)
```kotlin
// Dashboard "Map My Run" button
onNavigateToRouteGeneration = {
    navController.navigate("map_my_run_setup")
}

// Dashboard "Run Without Route" button
onNavigateToRunSession = {
    navController.navigate("map_my_run_setup")
}
```

### Route Definition
```kotlin
composable("map_my_run_setup") {
    val viewModel: RouteGenerationViewModel = hiltViewModel(...)
    
    MapMyRunSetupScreen(
        onNavigateBack = { navController.popBackStack() },
        onGenerateRoute = { /* Route generation logic */ },
        onStartRunWithoutRoute = { /* Direct run start logic */ }
    )
}
```

---

## 🔧 Component Specifications

### MapMyRunSetupScreen Parameters
```kotlin
fun MapMyRunSetupScreen(
    initialDistance: Float = 5f,
    initialTargetTimeEnabled: Boolean = false,
    initialHours: Int = 0,
    initialMinutes: Int = 0,
    initialSeconds: Int = 0,
    onNavigateBack: () -> Unit = {},
    onGenerateRoute: (
        distance: Float,
        targetTimeEnabled: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int,
        liveTrackingEnabled: Boolean,
        isGroupRun: Boolean
    ) -> Unit = { _, _, _, _, _, _, _ -> },
    onStartRunWithoutRoute: (
        distance: Float,
        targetTimeEnabled: Boolean,
        hours: Int,
        minutes: Int,
        seconds: Int
    ) -> Unit = { _, _, _, _, _ -> }
)
```

### TargetTimeCard Specifications (Feb 5, 2026 Update)
- **Card Padding:** `Spacing.lg` (increased from `Spacing.sm`)
- **Icon Background:** 50dp circle (doubled from 25dp)
- **Icon Size:** 28dp (doubled from 14dp)
- **Title Text:** `AppTextStyles.body` with bold weight
- **Subtitle Text:** 13sp (increased from 10sp)
- **Toggle Button:** 14sp text, 8dp vertical padding (doubled)
- **Time Input Boxes:** 64dp × 48dp (doubled from 32dp × 24dp)
- **Time Input Font:** 24sp (increased from 14sp)
- **Colon Separators:** `AppTextStyles.h3` with 8dp padding

### AiCoachToggle Specifications (Feb 5, 2026 Update)
- **Icon Size:** 12dp (reduced from 16dp - 25% smaller)
- **Switch Scale:** 0.6f (reduced from 0.8f - 25% smaller)
- **Text Style:** `AppTextStyles.caption` (reduced from `body`)
- **Padding Horizontal:** `Spacing.sm` (reduced from `Spacing.md`)
- **Padding Vertical:** `Spacing.xs` (reduced from `Spacing.sm`)
- **Icon-Text Spacing:** `Spacing.xs` (reduced from `Spacing.sm`)

---

## 🚫 What NOT To Do

### ❌ DON'T Create New Setup Screens
There is ONE setup screen. If you need changes, modify `MapMyRunSetupScreen.kt`.

### ❌ DON'T Restore Deleted Files
- `RunSetupScreen.kt` is permanently deleted
- It was an inferior design
- All functionality is in `MapMyRunSetupScreen.kt`

### ❌ DON'T Add `run_setup/{mode}` Route
This route has been removed. Use `map_my_run_setup` for all setup flows.

### ❌ DON'T Create Duplicate Components
- Use existing `TargetTimeCard` from `ui/components/`
- Don't create inline time pickers
- Maintain consistency

---

## ✅ Making Changes

### If You Need To Modify The Setup Screen:
1. ✅ Edit `MapMyRunSetupScreen.kt` only
2. ✅ Update this documentation
3. ✅ Test both "Generate Route" and "Start Without Route" flows
4. ✅ Ensure navigation works correctly
5. ✅ Commit with descriptive message referencing this doc

### If You Need A Different Flow:
1. ✅ Consider if it can be a parameter/option in existing screen
2. ✅ If truly different, create a NEW screen with a different name
3. ✅ Update this doc with the new flow
4. ✅ Never name it `RunSetupScreen` - that name is retired

---

## 📊 Version History

### Version 2.0 - February 5, 2026 (Current)
- ✅ Unified single setup screen for all flows
- ✅ Doubled TargetTimeCard size for better visibility
- ✅ Reduced AiCoachToggle size by 25%
- ✅ Added dual action buttons (route vs. no-route)
- ✅ Improved navigation with close and home icons
- ✅ Deleted obsolete `RunSetupScreen.kt`
- ✅ Modern card-based UI matching web app design

### Version 1.0 - Previous (DEPRECATED)
- ❌ Had separate `RunSetupScreen.kt` with basic design
- ❌ Used plain text fields instead of modern cards
- ❌ Had `run_setup/{mode}` routing complexity
- ❌ Status: **DELETED - DO NOT RESTORE**

---

## 🔍 File References

### Primary Implementation
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MapMyRunSetupScreen.kt`

### Supporting Components
- `app/src/main/java/live/airuncoach/airuncoach/ui/components/TargetTimeCard.kt`

### Navigation
- `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`
  - Route: `map_my_run_setup`
  - Lines: ~212-260

### Data Models
- `app/src/main/java/live/airuncoach/airuncoach/domain/model/RunSetupConfig.kt`
- `app/src/main/java/live/airuncoach/airuncoach/util/RunConfigHolder.kt`

### ViewModels
- `app/src/main/java/live/airuncoach/airuncoach/viewmodel/RouteGenerationViewModel.kt`
- `app/src/main/java/live/airuncoach/airuncoach/viewmodel/DashboardViewModel.kt`

---

## 🎨 Design Assets

### Icons Used
- Close: `R.drawable.icon_x_vector`
- Location/Route: `R.drawable.icon_location_vector`
- Play: `R.drawable.icon_play_vector`
- Timer: `R.drawable.icon_timer_vector`
- Mic (AI Coach): `R.drawable.icon_mic_vector`

### Color Scheme
- Primary: `Colors.primary` (#00E5FF - Cyan)
- Background: `Colors.backgroundRoot` 
- Secondary Background: `Colors.backgroundSecondary`
- Text Primary: `Colors.textPrimary`
- Text Secondary: `Colors.textSecondary`
- Text Muted: `Colors.textMuted`

---

## 📝 Testing Checklist

Before any changes to run setup:
- [ ] Both "Generate Route" and "Start Without Route" buttons work
- [ ] Close icon (top right) navigates back to dashboard
- [ ] Home icon (bottom nav) navigates back to dashboard
- [ ] Target distance slider updates correctly (1-50 km)
- [ ] Target time toggle expands/collapses time picker
- [ ] Time picker accepts valid inputs
- [ ] Route generation flow works end-to-end
- [ ] No-route flow works end-to-end
- [ ] No crashes or navigation issues
- [ ] UI looks correct on different screen sizes

---

## 🔒 Enforcement

This document is the **single source of truth** for run setup implementation.

**If you see:**
- References to `RunSetupScreen.kt` → Remove them
- `run_setup/{mode}` routes → Replace with `map_my_run_setup`
- Basic text field designs → Use modern card-based UI
- Duplicate setup screens → Consolidate into `MapMyRunSetupScreen.kt`

**Version Control:**
- This implementation is locked as of Feb 5, 2026
- Any changes must update this document
- Commits must reference this doc
- Code reviews must verify compliance

---

## 📞 Questions?

**When in doubt:**
1. Check this document first
2. Look at `MapMyRunSetupScreen.kt` implementation
3. Test both flows (with route and without route)
4. Update documentation if making changes

**Remember:** There is ONE setup screen. Keep it that way.

---

**Last Updated:** February 5, 2026  
**Maintained By:** AI Run Coach Development Team  
**Git Commit:** (See git log for commit hash)
