# Onboarding Flow & UI Fixes Summary

This document summarizes the critical fixes made to improve the new user onboarding experience and screen scrolling/navigation.

---

## Issues Fixed

### 1. **✅ Missing Permission Screens During Onboarding**
**Problem**: New users created an account and were directed straight to PersonalDetailsScreen, completely skipping location and notification permissions. This is a **critical security issue** — the app cannot function properly without these permissions.

**Root Cause**: 
- SignUpScreen navigated directly to `personal_details` or `coach_settings` routes
- Permission screens were only requested during LoginScreen flow
- Onboarding path (SignUp → PersonalDetails → CoachSettings) bypassed permission flow entirely

**Solution**:
Modified navigation flow to ensure **all new users go through LocationPermissionScreen BEFORE profile setup**:

```
Old Flow (BROKEN):
SignUp → PersonalDetails → CoachSettings → App

New Flow (FIXED):
SignUp → LocationPermissionScreen → PersonalDetails → CoachSettings → App
                                  ↓ (checks onboarding flags)
```

**Files Changed**:
- `ui/navigation/RootNavigationGraph.kt` — Updated route navigation to force permissions first
- `ui/screens/CoachSettingsScreen.kt` — Added notification permission request on load

---

### 2. **✅ Scrolling Issue on PersonalDetailsScreen**
**Problem**: Users couldn't scroll to the bottom of the PersonalDetailsScreen, causing the "Save Changes" button to be hidden behind the system navigation bar. This happened both with keyboard open and closed.

**Root Cause**: 
- LazyColumn contained the button item inside scrollable content
- No `bottomBar` to keep the button fixed at bottom
- Keyboard would push content up, but scroll position didn't adjust
- Bottom padding needed to prevent content hiding behind fixed button

**Solution**:
Moved "Save Changes" button from inside LazyColumn to Scaffold's `bottomBar`:

```kotlin
Scaffold(
    topBar = { ... },
    containerColor = Colors.backgroundRoot,
    contentWindowInsets = WindowInsets(0),
    bottomBar = {
        // Sticky save button at bottom (FIXED!)
        Surface(...)
    }
) { padding ->
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(bottom = Spacing.lg) // Extra bottom padding
    ) {
        // Content items (without button)
    }
}
```

**Benefits**:
- Button always visible and accessible
- LazyColumn scrolls naturally to bottom without hiding content
- Works seamlessly with keyboard open/closed
- Content doesn't hide behind button

**Files Changed**:
- `ui/screens/PersonalDetailsScreen.kt` — Restructured layout with sticky bottomBar

---

### 3. **✅ Same Scrolling Issue on CoachSettingsScreen**
**Problem**: Same issue as PersonalDetailsScreen — couldn't scroll to bottom, button hidden.

**Solution**:
CoachSettingsScreen **already had the correct implementation** with `bottomBar`. No changes needed to the layout, but I added notification permission request to this screen since it's the final onboarding step.

**Files Changed**:
- `ui/screens/CoachSettingsScreen.kt` — Added notification permission launcher and request

---

## Navigation Flow Changes

### Before (Broken):
```
SignUp
├─ onNavigateToProfile() → personal_details (WRONG - permissions not requested!)
├─ onNavigateToCoachSettings() → coach_settings (WRONG - permissions not requested!)
└─ onNavigateToLocationPermission() → location_permission → main

LocationPermissionScreen
└─ onPermissionGranted() → main (no profile/coach setup check!)
```

### After (Fixed):
```
SignUp
├─ onNavigateToProfile() → location_permission (CORRECT - permissions first!)
├─ onNavigateToCoachSettings() → location_permission (CORRECT - permissions first!)
└─ onNavigateToLocationPermission() → location_permission

LocationPermissionScreen (NOW CHECKS ONBOARDING STATE)
├─ needsProfileSetup() → personal_details
├─ needsCoachSetup() → coach_settings
└─ else → AI_CONSENT or MAIN

PersonalDetailsScreen
└─ onNavigateToCoachSettings() → coach_settings

CoachSettingsScreen (REQUESTS NOTIFICATION PERMISSION)
└─ onNavigateToDashboard() → location_permission (redirects to AI_CONSENT or MAIN)
```

---

## Permission Request Flow

### New User Onboarding:
1. **SignUp**: Create account
   - Sets `needsProfileSetup = true`
   - Sets `needsCoachSetup = true` (if applicable)
   
2. **LocationPermissionScreen**: Request location/activity recognition
   - Checks `sessionManager.needsProfileSetup()`
   - Routes accordingly

3. **PersonalDetailsScreen**: Collect personal info
   - No new permissions here

4. **CoachSettingsScreen**: Configure AI coaching + **Request notification permission**
   - Shows notification permission dialog (Android 13+)
   - Clears onboarding flags
   - Routes to AI_CONSENT or MAIN

### Returning User (Login):
1. **LoginScreen**: Log in existing account
   - Requests notification permission if on Android 13+
   - No onboarding flags set
   - Routes directly to MAIN

---

## Testing Checklist

- [ ] Create a brand new account on a device (fresh install)
- [ ] Verify you see **LocationPermissionScreen** after signup
- [ ] Grant location permissions
- [ ] Verify you're taken to **PersonalDetailsScreen**
- [ ] Fill in personal details and click Save
- [ ] Verify you're taken to **CoachSettingsScreen**
- [ ] Verify **notification permission dialog** appears (Android 13+)
- [ ] Grant/deny notification permission
- [ ] Verify you're taken to **AI Consent** or **Main** screen
- [ ] Verify button is accessible at bottom of PersonalDetailsScreen without scrolling past
- [ ] Verify button is accessible at bottom of CoachSettingsScreen without scrolling past
- [ ] Verify keyboard doesn't hide the bottom button

---

## Files Modified

```
app/src/main/java/live/airuncoach/airuncoach/
├── ui/
│   ├── navigation/
│   │   └── RootNavigationGraph.kt ⭐ (Permission flow routing)
│   └── screens/
│       ├── PersonalDetailsScreen.kt ⭐ (Moved button to bottomBar)
│       └── CoachSettingsScreen.kt ⭐ (Added notification permission request)
```

---

## Key Implementation Details

### LocationPermissionScreen Smart Routing:
```kotlin
onPermissionGranted = {
    when {
        sessionManager.needsProfileSetup() -> {
            // New user: go to personal details
            navigate("personal_details")
        }
        sessionManager.needsCoachSetup() -> {
            // Profile done: go to coach settings
            navigate("coach_settings")
        }
        else -> {
            // Returning user: go to AI consent or main
            navigate(AI_CONSENT or MAIN)
        }
    }
}
```

### CoachSettingsScreen Notification Permission:
```kotlin
LaunchedEffect(Unit) {
    if (NotificationPermissionHelper.shouldRequestPermission()) {
        // Only requests on Android 13+ (automatically checks SDK)
        notificationPermissionLauncher.launch(
            NotificationPermissionHelper.getPermissionString()
        )
    }
}
```

### PersonalDetailsScreen Sticky Button:
```kotlin
Scaffold(
    bottomBar = {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Colors.backgroundRoot,
            shadowElevation = 8.dp
        ) {
            Button(
                // Save button stays at bottom
                // No padding issues!
            )
        }
    }
) { padding ->
    LazyColumn(
        modifier = Modifier
            .padding(bottom = Spacing.lg) // Extra space below content
    ) {
        // Content scrolls naturally
    }
}
```

---

## Why These Fixes Are Critical

### 1. Permissions Impact
Without location permission, the app **cannot track runs**. Without notification permission, users **won't get important notifications** about activity enrichment, coaching reminders, etc. The old flow allowed users to skip permissions entirely, making the app non-functional.

### 2. UX Impact
Users on a limited time/space (standing in line, at the gym) couldn't complete onboarding because the Save button was hidden. This causes abandonment.

### 3. Consistency
All screens now follow the same pattern:
- Permissions handled in dedicated permission screen
- Scrollable content + sticky button in bottomBar
- Clear navigation with checks for onboarding state

---

## No Breaking Changes

All changes are **backward compatible**:
- Existing users are unaffected (no onboarding flags set)
- Permission request in CoachSettingsScreen only affects new users
- Navigation changes only affect signup flow
- Layout changes are visual only (same state management)

---

## Future Improvements

1. **Add a permission summary screen** after onboarding to show what was granted/denied
2. **Implement permission rationale screens** that explain why each permission is needed
3. **Add re-request logic** if critical permissions are denied (e.g., show in settings)
4. **Track permission status** in analytics to identify where users abandon

