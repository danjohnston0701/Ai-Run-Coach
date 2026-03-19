# Known Issues & Bugs - March 19, 2026

**Last Updated:** Mar 19, 2026  
**Severity Levels:** 🔴 Critical | 🟡 High | 🟢 Medium | 💙 Low

---

## 🔴 CRITICAL BUGS (Blocks Feature)

### 1. "Mark as Done (No GPS)" Doesn't Complete Workout
**Severity:** 🔴 Critical  
**Status:** Just Fixed (today's PR)  
**Verified:** Pending device testing

**Description:**
When user taps "Mark as Done" on a training plan workout without GPS, the workout doesn't actually mark as completed in the backend. The UI navigates back, but the plan progress stays at 0/32.

**Root Cause:**
The `onMarkComplete` callback was calling `completeWorkout()` on a ViewModel instance scoped to the wrong back stack entry. It was a separate instance from the one `TrainingPlanDashboardScreen` holds, so the update never reached the UI.

**Fix Applied:**
Changed from:
```kotlin
val trainingPlanViewModel = hiltViewModel<TrainingPlanViewModel>()  // ❌ New instance
```

To:
```kotlin
val planBackStackEntry = remember(currentEntry) {
    navController.getBackStackEntry("training_plan/{planId}")
}
val trainingPlanViewModel = hiltViewModel<TrainingPlanViewModel>(planBackStackEntry)  // ✅ Same instance
```

**File:** `app/src/main/java/live/airuncoach/airuncoach/ui/screens/MainScreen.kt`  
**Commit:** `29a7cc6`

**Testing Needed:**
- [ ] Tap "Mark as Done" on a coaching session
- [ ] Verify progress bar updates (0/32 → 1/32)
- [ ] Verify plan completion rate increases

---

### 2. Garmin Webhook User Mapping Failures (Dailies & Respiration)
**Severity:** 🔴 Critical  
**Status:** Partially Fixed (today)  
**Verified:** Pending Garmin device test

**Description:**
Backend receives Garmin dailies and respiration data for ~20% of users but fails to map them to the user account, resulting in:
```
⚠️ "Could not map dailies to user 344638ff"
⚠️ "Could not map respiration to user 344638ff"
```

**Root Cause:**
1. **Dailies handler:** If `userAccessToken` is present but stale (token was refreshed), the fallback to `resolveGarminUserId` was never attempted due to broken if/else logic.
2. **Respiration handler:** Never attempted `userAccessToken` matching at all, only `userId`→`deviceId` matching which fails when `deviceId` is NULL.

**Fix Applied:**
- Dailies: Rewrote conditional to always cascade to `resolveGarminUserId` on token miss
- Respiration: Added `userAccessToken` matching as first lookup step
- Both: Updated logging to include `hasToken` flag for debugging

**File:** `server/routes.ts` (lines 4559-4920)  
**Commits:** `940ecf8`

**Testing Needed:**
- [ ] Reconnect Garmin account
- [ ] Sync dailies/respiration
- [ ] Verify no warning logs in Replit
- [ ] Check wellness data appears in "Today" tab

**Workaround (if still failing):**
Reconnect Garmin in app → will repopulate `connected_devices.deviceId`

---

### 3. Today's Coaching Session Shows Tomorrow's Workout
**Severity:** 🔴 Critical  
**Status:** Fixed (today)  
**Verified:** Need date-based testing

**Description:**
The "Today" component in coaching plan shows the next scheduled workout even if it's tomorrow, incorrectly labeled as today. Example: Friday shows Saturday's workout.

**Root Cause:**
Backend `/api/training-plans/{planId}/today` endpoint returned next future workout with `isToday: true`, even if scheduled for tomorrow. Query was:
```sql
WHERE scheduledDate >= TODAY  -- ❌ Should be < TOMORROW
```

**Fix Applied:**
Changed query to:
```sql
WHERE scheduledDate >= TODAY AND scheduledDate < TOMORROW
-- ✅ Now only returns today's workout
```

Also added:
- `isOverdue` field for missed sessions
- "Overdue Workout" card UI in coaching plan
- Fallback to "Next Up" card if today has no workout

**Files:** 
- `server/routes.ts` (date query)
- `app/.../ui/screens/CoachingProgrammeScreen.kt` (UI)
- `app/.../network/model/TodayWorkoutResponse.kt` (data model)

**Commits:** `61b75d2`

**Testing Needed:**
- [ ] Test on date boundaries (midnight transitions)
- [ ] Verify "Overdue" card shows when session missed
- [ ] Verify "Next Up" shows when today is rest day

---

### 4. Payment System Not Implemented
**Severity:** 🔴 Critical  
**Status:** Not Started  
**Timeline to Fix:** 2-3 weeks

**Description:**
App has subscription UI but zero payment integration. Users can't upgrade to premium.

**Current State:**
- `SubscriptionScreen.kt` - has "Subscribe Now" button with TODO
- `SubscriptionViewModel.kt` - hardcoded plan list, no API calls
- Server - no billing endpoints, no payment verification
- `ApiService.kt` - no subscription check interceptor

**What's Needed:**
1. Choose payment provider (Stripe, RevenueCat, or Google Play Billing)
2. Wire SDK to app
3. Implement server-side verification
4. Add subscription tier gating
5. Implement upgrade/downgrade flow

**Recommended:** RevenueCat (fastest path, handles iOS/Android)

**Files to Create:**
- `BillingService.kt` (Android)
- `billing-service.ts` (Backend)
- `SubscriptionRepository.kt` (Data layer)

---

### 5. Password Reset Flow Missing
**Severity:** 🔴 Critical  
**Status:** Not Started  
**Timeline to Fix:** 2 days

**Description:**
If user forgets password, they have no way to reset it. They're permanently locked out.

**Current State:**
- No "Forgot Password?" link on login screen
- No password reset API endpoint
- No email sending configured

**What's Needed:**
1. Add "Forgot Password" screen
2. Create `/api/auth/forgot-password` endpoint
3. Set up email service (SendGrid/Mailgun)
4. Implement token generation + validation
5. Add `/api/auth/reset-password` endpoint

**Files to Create:**
- `ForgotPasswordScreen.kt` (Android)
- `ResetPasswordViewModel.kt`
- `auth-service.ts` (Backend email logic)
- Database: add `password_reset_token`, `password_reset_expires`

---

## 🟡 HIGH PRIORITY BUGS (Significant Friction)

### 6. No Crash Reporting (Can't Debug Production)
**Severity:** 🟡 High  
**Status:** Not Started  
**Timeline to Fix:** 1 day (Sentry)

**Description:**
If app crashes in production, you have zero visibility. No error tracking, no user impact analysis.

**Current State:**
- Extensive `Log.d()` and `console.log()` everywhere
- No Sentry, Crashlytics, or centralized error service
- Can't see crashes unless user messages you

**What's Needed:**
1. Set up Sentry account
2. Add Sentry SDK to Android + Backend
3. Set up Slack alerts for critical errors
4. Create dashboard for monitoring

**Recommendation:** Sentry is fastest + cheapest for early stage

---

### 7. FCM Notifications Not Being Received
**Severity:** 🟡 High  
**Status:** Unknown (Needs Testing)

**Description:**
Backend sends FCM notifications (push notifications, coaching reminders) but users report not receiving them, or receiving them sporadically.

**Possible Causes:**
1. FCM token not being saved on first app launch
2. Notification permissions not granted on Android 13+
3. Notification channel not configured
4. `AiRunCoachMessagingService.onNewToken()` not being called

**Files to Check:**
- `AiRunCoachMessagingService.kt` - verify `onNewToken()` saves token
- `MainActivity.kt` - verify POST_NOTIFICATIONS permission requested
- `NotificationSettingsScreen.kt` - verify app can receive notifications

**Quick Test:**
1. Install app
2. Watch logs for `[MessagingService] Token saved: fcm_...`
3. Manually trigger test notification via backend
4. Verify notification appears on device

---

### 8. Offline Sync Unreliable
**Severity:** 🟡 High  
**Status:** Partial (Basic fallback only)

**Description:**
When user loses internet during run:
- Run is saved locally
- Upload is attempted, fails
- No retry mechanism
- Run data can be lost if app crashes

**Current State:**
- `RunTrackingService.kt` ~2170+ has `uploadRun()` with single attempt
- Falls back to local ID on failure
- No WorkManager for background retry
- No Room database for sync queue

**What's Needed:**
1. Add WorkManager dependency + Worker
2. Create `SyncQueue.kt` (Room database)
3. Implement `SyncWorker.kt` (background retry)
4. Add exponential backoff
5. Show sync status in UI ("Syncing...", "Offline", etc.)

**Timeline:** 1 week

---

### 9. Training Plan "Auto-Link" Not Working Smoothly
**Severity:** 🟡 High  
**Status:** Works but requires manual linking

**Description:**
After user completes a run, coaching app should automatically link it to the planned workout if it matches (same day, similar distance/time). Currently requires manual selection.

**Current State:**
- Manual linking works (user taps "Link to Plan")
- No auto-matching logic

**What's Needed:**
1. After run completes, query planned workouts for current day
2. Auto-match if distance/time within threshold
3. If ambiguous, show dialog for user to pick
4. Update plan progress automatically

**Files:** `RunSessionViewModel.kt`, `server/routes.ts`

**Timeline:** 2 days

---

### 10. Garmin Data Gaps & Incomplete Wellness
**Severity:** 🟡 High  
**Status:** Partial (Multiple docs exist, needs implementation)

**Description:**
Some Garmin wellness data is incomplete or not being used in coaching:
- Blood pressure not fully integrated
- Stress level not used in coaching context
- Some database columns still NULL
- Respiration webhook still failing for edge cases

**Files with Details:**
- `FIX_GARMIN_BLOOD_PRESSURE_IMPLEMENTATION.md` (9.5 KB)
- `FIX_GARMIN_SCHEMA_GAPS.sql` (7.5 KB)
- `GARMIN_DATA_EXPOSURE_AND_MERGING_STRATEGY.md` (25.5 KB)

**Timeline:** 2-3 days to fully implement

---

## 🟢 MEDIUM PRIORITY BUGS

### 11. Authentication - No Refresh Token System
**Severity:** 🟢 Medium  
**Status:** Not Started

**Description:**
Users can get logged out unexpectedly if JWT token expires (usually 24h). No automatic refresh mechanism.

**What's Needed:**
1. Implement refresh token storage
2. Auto-refresh before expiry
3. Proper 401 → re-login flow
4. Session timeout warnings

**Timeline:** 2 days

---

### 12. Route Generation Error Handling
**Severity:** 🟢 Medium  
**Status:** UI exists but no error feedback

**Description:**
If route generation AI fails, user gets blank screen with no error message.

**File:** `RouteGenerationScreen.kt` line 133  
**Fix:** Add error state + user-friendly message

**Timeline:** 2 hours

---

### 13. Social Features Untested
**Severity:** 🟢 Medium  
**Status:** UI complete, feature untested

**Features that need QA:**
- [ ] Add friend
- [ ] Accept/decline friend request
- [ ] View friend activities
- [ ] Activity feed filtering
- [ ] Segment leaderboards loading

**Timeline:** 2 days (QA + bug fixes)

---

## 💙 LOW PRIORITY BUGS

### 14. Analytics Tracking Missing
**Severity:** 💙 Low  
**Status:** Not Started

**Missing:**
- Firebase Analytics events
- Funnel tracking (signup → first run → coaching)
- User segmentation
- Retention metrics

### 15. Achievements Not Earned
**Severity:** 💙 Low  
**Status:** UI only, backend missing

**Missing:**
- Achievement earning logic
- Badge distribution
- Progress tracking

### 16. Advanced Chart Placeholders
**Severity:** 💙 Low  
**Status:** UI shows placeholder data

**Examples:**
- HR efficiency heatmap
- Effort distribution zones
- Max/min heart rate tracking
- Weekly mileage calculation

---

## 🔧 QUICK FIX CHECKLIST (1-2 hours total)

These are small, high-impact fixes you can do right now:

- [ ] Verify "Mark as Done" fix works with device test
- [ ] Verify Garmin fixes with real Garmin device
- [ ] Verify "Today" date logic with manual testing
- [ ] Add 1-line logging to FCM token saving
- [ ] Update `SubscriptionScreen.kt` with "Coming Soon" message
- [ ] Add "Forgot Password" link to login screen

---

## 📋 TESTING MATRIX

| Feature | Android | iOS | Status |
|---------|---------|-----|--------|
| Run Tracking | ✅ | ❌ | Need iOS |
| Coaching (Text) | ✅ | ❌ | Need iOS |
| Coaching (Audio) | ⚠️ | ❌ | TBD iOS |
| Training Plans | ✅ | ❌ | Need iOS |
| Garmin Sync | ✅ | ❓ | Partial |
| Payments | ❌ | ❌ | Not implemented |
| Offline Mode | ⚠️ | ❌ | Weak impl |
| Push Notifs | ⚠️ | ❌ | TBD iOS |
| Social | ⚠️ | ❌ | Untested |

---

## 🎯 PRIORITY FIX ORDER

### Week 1: Critical
1. Implement payment system (3-4 days)
2. Verify all training plan bugs fixed (1 day)
3. Set up Sentry (1 day)

### Week 2: High Priority
4. Authentication refresh tokens (2 days)
5. Offline sync queue (2 days)
6. FCM token fix + testing (1 day)

### Week 3: Polish
7. Social features QA (1 day)
8. Analytics setup (1 day)
9. Performance optimization (1 day)

---

## 📞 SUPPORT IMPACT

**Issues users will complain about immediately:**
1. Can't upgrade to premium
2. Get logged out randomly
3. Notifications don't work
4. Workouts don't save when offline
5. Can't reset password

**Fix these first to avoid support load.**

