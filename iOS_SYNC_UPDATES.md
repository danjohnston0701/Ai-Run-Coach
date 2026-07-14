# iOS Sync Updates — Recent Android Changes to Replicate

This document lists all significant updates made to the Android app in the past week that the iOS team needs to replicate for feature parity.

---

## Recent Commits (Past 7 Days)

### 1. **Pass plannedWorkoutId through Garmin watch** (21cf3ca)
**Date**: Sun Jul 12, 2026  
**Status**: NEW - Not yet on iOS  
**Priority**: HIGH

**What Changed**:
- Wired planned workout DB ID from Android app through Garmin companion app
- Backend can now auto-complete `planned_workout` record when Garmin activity webhook arrives after run finishes
- Garmin companion app version bumped to 3.1.3

**Files Modified**:
- `GarminWatchManager.kt` - Added `plannedWorkoutId` param to `sendPreparedRun()`
- `RunSessionViewModel.kt` - Pass `workoutId` into `sendPreparedRun()`
- `StartView.mc` (Garmin) - Store `plannedWorkoutId` from preparedRun message
- `RunView.mc` (Garmin) - Persist `plannedWorkoutId` to App.Storage in `setCoachingMode()`
- `DataStreamer.mc` (Garmin) - Include `plannedWorkoutId` in session/start payload
- `manifest.xml` (Garmin) - Bump version to 3.1.3

**iOS Implementation Need**:
- If iOS supports planned workouts with watch integration, wire plannedWorkoutId similarly
- Ensure watch companion app (if exists) also passes this ID through payload

---

### 2. **Fix technique coaching always repeating arm swing cue** (ff462b0)
**Date**: Sun Jul 12, 2026  
**Status**: NEW - Verify if present on iOS  
**Priority**: MEDIUM

**What Changed**:
- Fixed bug where "arm swing" technique cue was repeated every rep
- Likely a logic issue in technique coaching cue generation or filtering

**Impact on iOS**:
- If iOS has technique coaching, verify arm swing cue is NOT repeating every rep
- Check coaching prompt logic for deduplication

---

### 3. **Fix: Recompute identical km splits on-the-fly from GPS track** (9f12c83)
**Date**: Sun Jul 12, 2026  
**Status**: NEW - Verify if present on iOS  
**Priority**: MEDIUM

**What Changed**:
- Previously, identical km splits weren't being computed correctly
- Now recalculates splits on-the-fly from GPS track data when segments are identical
- Affects run analysis and per-km pacing display

**Impact on iOS**:
- Verify km/mile splits are computed correctly from GPS data
- Check if identical segments are being recalculated properly
- Test on runs with flat terrain where all km splits are similar

---

### 4. **Fix: km splits identical, coaching unavailable, and subscription tier not persisting** (3553cb6)
**Date**: Sun Jul 11, 2026  
**Status**: NEW - Verify if present on iOS  
**Priority**: HIGH

**What Changed**:
- Fixed km splits not persisting when all segments are identical distance
- Fixed coaching availability flag not saving to database
- Fixed subscription tier not persisting to database

**Database Impact**:
- These are backend/database fixes, not just UI
- Ensure iOS queries for runs fetch correct `subscription_tier`, `coaching_available`, and `splits` data

**Impact on iOS**:
- Runs should display correct splits even with identical distances
- Subscription tier should persist across app sessions
- Coaching availability flag should be accurate

---

### 5. **Fix: Simplify notification icon to remove shading gradient** (5b1d047)
**Date**: Sun Jul 11, 2026  
**Status**: NEW - Android only  
**Priority**: LOW

**What Changed**:
- Notification icon simplified (Android-specific drawable change)
- Removed gradient shading for cleaner look

**Impact on iOS**:
- N/A - iOS uses different notification icon system
- iOS app might want to ensure push notification icons are also clean/simple

---

### 6. **Fix: Add Friend button crashes with NPE on Friend.copy()** (6b7e624)
**Date**: Sun Jul 11, 2026  
**Status**: NEW - HIGH PRIORITY  
**Priority**: HIGH

**What Changed**:
- Fixed NullPointerException crash when tapping "Add Friend" button
- Issue was in `Friend.copy()` data class method

**Impact on iOS**:
- If iOS has "Add Friend" functionality, test for similar crashes
- Verify `Friend` model initialization doesn't have null safety issues
- Test "Add Friend" button flow end-to-end

---

### 7. **Fix: Email verification OTP screen and Coach Settings nav bar overlap** (5446818)
**Date**: Sun Jul 10, 2026  
**Status**: RESOLVED - Email Verification Brief created  
**Priority**: MEDIUM

**What Changed**:
- Fixed layout overlap between Email Verification Screen and Coach Settings navigation
- This was a UI layout bug

**Related Brief**:
- See `iOS_EMAIL_VERIFICATION_BRIEF.md` for complete Email Verification Screen implementation
- Ensure nav bar doesn't overlap with OTP input boxes on iOS

---

### 8. **Bump version to 1.7.1 (versionCode 19)** (50e69c0)
**Date**: Sun Jul 10, 2026  
**Status**: RELEASED - Android in Play Store  
**Priority**: HIGH

**What Changed**:
- Version bump for registration flow fixes
- Release note: "fix registration flow"

**iOS Implementation**:
- Update iOS version to 1.7.1 to match Android
- Include same registration flow fixes listed below

---

### 9. **Fix: Use token absence to detect email verification required** (4cde54d)
**Date**: Sun Jul 10, 2026  
**Status**: CRITICAL - Registration Flow  
**Priority**: CRITICAL

**What Changed**:
- Changed logic to use token absence as the indicator that email verification is required
- Previously may have used a different flag
- Critical for registration flow

**Implementation for iOS**:
- When user registers, check if auth response is missing token
- If no token: show Email Verification Screen
- If token present: user is verified or verification not required

---

### 10. **Fix: Return user data on registration when email verification required** (4da9e70)
**Date**: Sun Jul 10, 2026  
**Status**: CRITICAL - Registration Flow  
**Priority**: CRITICAL

**What Changed**:
- Backend now returns user data even when email verification is required
- Previously may have returned incomplete data
- Allows app to show verification screen with user info

**API Impact**:
- Registration endpoint now returns user object even without token
- iOS should handle response structure with `user` object but no/empty `token`

---

### 11. **Bump version to 1.7.0** (1cba6cf)
**Date**: Sun Jul 6, 2026  
**Status**: RELEASED - Android in Play Store  
**Priority**: MEDIUM

**What Changed**:
- Major version bump for email verification feature
- Release note: "for Play Store release"

**iOS Implementation**:
- Email verification feature complete (brief provided)
- Bump iOS version to 1.7.0
- Include email verification in release notes

---

## Summary: Features & Fixes Needed on iOS

### **Critical (Must Have)**
1. ✅ **Email Verification Screen** - Brief provided in `iOS_EMAIL_VERIFICATION_BRIEF.md`
2. ✅ **Registration Flow** - Use token absence to detect email verification required
3. ✅ **Return User Data on Registration** - Handle user object returned without token
4. **Add Friend Button** - Test for crashes and null safety issues

### **High Priority (Should Have)**
5. **plannedWorkoutId Persistence** - Wire through to watch integration if applicable
6. **Database Persistence Fixes** - Ensure subscription tier, coaching availability, splits persist
7. **Version Bump to 1.7.1** - Align with Android release

### **Medium Priority (Nice to Have)**
8. **Km Split Recalculation** - Verify splits compute correctly from GPS for identical segments
9. **Technique Coaching** - Verify arm swing cue not repeating
10. **Nav Bar Layout** - Ensure no overlap with email verification screen

### **Low Priority**
11. **Notification Icon** - Ensure iOS notification icons are clean/simple

---

## Testing Checklist for iOS

- [ ] Email verification screen displays correctly
- [ ] OTP input accepts 6 digits and auto-submits
- [ ] Change email dialog works
- [ ] User data returned on registration without token
- [ ] Navigation to email verification triggered when token is missing
- [ ] Resend code countdown works (60 seconds)
- [ ] Add Friend button doesn't crash
- [ ] Subscription tier persists across app sessions
- [ ] Km splits display correctly for identical distances
- [ ] Coaching availability flag accurate
- [ ] Technique coaching doesn't repeat arm swing cue
- [ ] Version number shows 1.7.1
- [ ] Nav bar doesn't overlap with screens

---

## Integration Notes

### Registration Flow (Critical Path)
```
1. User taps "Sign Up"
2. User enters name, email, password
3. Submit registration
4. Server response:
   - No token → Show Email Verification Screen
   - Token present → Proceed to onboarding
5. On Email Verification Screen:
   - Display email that needs verification
   - Accept 6-digit OTP
   - Allow resend (60s cooldown)
   - Allow email change
6. After successful verification:
   - Save auth token
   - Save user data
   - Proceed to profile setup
```

### Data Persistence
- Auth token saved in Keychain (secure storage)
- User ID, name saved in UserDefaults or Keychain
- Subscription tier cached locally
- Coaching availability flag cached locally
- Splits data cached locally

### API Endpoints Required
See `iOS_EMAIL_VERIFICATION_BRIEF.md` for email verification endpoints:
- POST `/register` - Returns user object ± token
- POST `/verify-email` - Accepts OTP
- POST `/resend-verification` - Sends new OTP
- POST `/update-verification-email` - Changes email before verification

---

## Git Branches Reference

**Latest Android Version**: v1.7.1 (commits: 4cde54d, 50e69c0)
**Latest Android Release**: v1.7.0 (commit: 1cba6cf)
**Email Verification Feature**: Added in v1.7.0 (commits: d64573f, 00f7ea8)

---

## Next Steps

1. **Immediate**: Review `iOS_EMAIL_VERIFICATION_BRIEF.md` and begin Email Verification Screen implementation
2. **Short-term**: Implement registration flow fixes (token absence detection)
3. **Medium-term**: Wire plannedWorkoutId through watch integration
4. **Ongoing**: Test data persistence fixes and address any crashes

---

## Questions for iOS Dev Team

- Is planned workout functionality already in iOS? If yes, need watch integration updates.
- Does iOS have watch companion app? If yes, needs version bump and plannedWorkoutId payload.
- Are splits, subscription tier, and coaching availability already cached? If yes, verify persistence.
- Has "Add Friend" feature been tested on iOS? Need to verify null safety.
