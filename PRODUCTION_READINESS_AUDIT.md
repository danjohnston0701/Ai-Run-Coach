# 🚀 Production Readiness Audit - March 19, 2026

**Status**: ~70% Ready | **Risk Level**: Medium-High | **Estimated Time to Launch**: 3-4 weeks

---

## 📊 Executive Summary

Your app has **strong core functionality** (running, AI coaching, Garmin integration, training plans) but is missing **critical business infrastructure** before accepting paying users. This audit identifies what's broken, incomplete, or missing.

### By Category:

| Category | Status | Risk | Timeline |
|----------|--------|------|----------|
| **Core Running Feature** | ✅ 90% | Low | 2 days |
| **AI Coaching** | ✅ 85% | Low | 3 days |
| **Training Plans** | ⚠️ 75% | Medium | 1 week |
| **Garmin Integration** | ✅ 80% | Low | 2 days |
| **Payment/Subscription** | ❌ 0% | 🔴 Critical | 2 weeks |
| **Authentication** | ⚠️ 70% | Medium | 3 days |
| **Offline/Sync** | ⚠️ 40% | Medium | 1 week |
| **Observability** | ❌ 10% | Medium | 3 days |
| **iOS Implementation** | ❌ 0% | 🔴 Critical | 6-8 weeks |

---

## 🔴 CRITICAL - Must Fix Before Launch

### 1. **Payment & Subscription System** ⚠️ MISSING ENTIRELY
**Impact:** Can't monetize or limit free users  
**Current State:** UI exists, zero backend integration

**What's Missing:**
- [ ] Stripe or Google Play Billing SDK integration
- [ ] Subscription tiers gating (free vs paid features)
- [ ] Subscription state verification on API calls
- [ ] Billing webhook handling (failed payments, cancellations)
- [ ] In-app purchase verification
- [ ] Upgrade/downgrade flow
- [ ] Billing history API

**Locations to Update:**
- `SubscriptionViewModel.kt` - currently hardcoded plans with TODO
- `server/routes.ts` - add `/api/subscriptions/*` endpoints
- `ApiService.kt` - add subscription check interceptor
- New: `BillingService.kt` (Android) + `billing-service.ts` (Backend)

**Recommended Approach:**
```
Option A: Stripe + Custom Backend
- Most control, ~2 weeks
- Handle subscriptions in database
- Verify via webhook

Option B: RevenueCat (Recommended)
- Fastest path (~3-4 days)
- Handles iOS/Android via one SDK
- No webhook complexity
```

**Timeline:** 2-3 weeks  
**Criticality:** 🔴 Cannot launch without this

---

### 2. **iOS App Implementation** ⚠️ DOESN'T EXIST
**Impact:** Only 50% of addressable market (iOS users)  
**Current State:** Android only; iOS spec document exists

**What's Missing:**
- [ ] Full iOS native app (SwiftUI)
- [ ] Training plan UI screens (6 main screens)
- [ ] AI coaching audio playback (PollyAudioManager)
- [ ] Garmin integration (if supporting watchOS)
- [ ] Push notifications (APNs setup)
- [ ] Run tracking foreground service (equivalent to Android service)
- [ ] Offline sync queue

**Blockers:**
- Requires iOS developer (or rewrite Android in React Native first)
- Brief exists (`iOS_POLLY_TTS_BRIEF.md`) but no actual implementation

**Timeline:** 6-8 weeks (if hiring iOS dev)  
**Criticality:** 🔴 Necessary for serious market traction

---

### 3. **Training Plan "Mark as Done" Broken**
**Impact:** Can't complete coaching plan sessions without GPS  
**Current State:** Button exists but doesn't actually mark as complete

**What's Broken:**
```kotlin
// MainScreen.kt line 567
onMarkComplete = { 
    // Currently just clears state + navigates back
    WorkoutHolder.clear()
    navController.popBackStack()
    // ❌ MISSING: API call to mark workout complete
}
```

**Fix Required:**
- Call `POST /api/training-plans/{planId}/workouts/{workoutId}/complete`
- Update plan progress
- Refresh UI

**Files to Update:**
- `MainScreen.kt` - workout_detail composable
- Verify backend endpoint exists in `routes.ts`

**Timeline:** 1 hour  
**Criticality:** 🔴 High (breaks core feature)

---

### 4. **Password Reset Flow Missing**
**Impact:** Users locked out forever if they forget password  
**Current State:** No reset flow implemented

**What's Missing:**
- [ ] "Forgot Password" screen
- [ ] Email verification flow
- [ ] Token generation + expiry
- [ ] Backend `/api/auth/reset-password` endpoint
- [ ] Email sending (SendGrid/Mailgun)

**Timeline:** 2 days  
**Criticality:** 🔴 High (support nightmare)

---

### 5. **No Crash Reporting / Analytics**
**Impact:** Can't debug production issues or measure engagement  
**Current State:** Just console.log and Log.d

**What's Missing:**
- [ ] Sentry (error tracking)
- [ ] Firebase Crashlytics
- [ ] Firebase Analytics events
- [ ] Funnel tracking (registration → first run → coaching)

**Recommended:** Add Sentry immediately (1 day)

**Timeline:** 1 day (Sentry) → 3 days (full analytics)  
**Criticality:** 🔴 High (can't operate blind)

---

## 🟡 IMPORTANT - Should Fix Before Launch

### 6. **Offline Sync & Work Queue**
**Impact:** If user goes offline, runs don't sync reliably  
**Current State:** Fallback to local ID, but no retry queue

**What's Missing:**
- [ ] WorkManager for background retry
- [ ] Local Room database queue
- [ ] Sync status in UI ("syncing...", "offline")
- [ ] Exponential backoff retry logic
- [ ] Conflict resolution for duplicate uploads

**Files Involved:**
- `RunTrackingService.kt` - needs WorkManager integration
- New: `SyncQueue.kt`, `SyncWorker.kt`
- Database: need Room schema for pending_syncs

**Timeline:** 1 week  
**Criticality:** 🟡 High (app feels broken offline)

---

### 7. **Authentication: Refresh Tokens & Session Management**
**Impact:** Users get logged out unexpectedly after token expires  
**Current State:** Single JWT, no refresh mechanism

**What's Missing:**
- [ ] Refresh token storage + rotation
- [ ] Automatic token refresh before expiry
- [ ] Proper 401 → re-login flow
- [ ] Session timeout warnings
- [ ] Multi-device session management

**Files to Update:**
- `ApiService.kt` / `RetrofitClient.kt`
- `SessionManager.kt`
- `server/auth.ts` - add refresh endpoint

**Timeline:** 2 days  
**Criticality:** 🟡 High (affects UX)

---

### 8. **Garmin Data Gaps**
**Impact:** Incomplete wellness context for coaching  
**Current State:** Some data comes through, but schema incomplete

**What's Broken:**
- [ ] Blood pressure not fully integrated (see `FIX_GARMIN_BLOOD_PRESSURE_IMPLEMENTATION.md`)
- [ ] Some Garmin columns still NULL in database
- [ ] Respiration data webhook failing (~20% of users, per logs)
- [ ] Stress level not being used in coaching context

**Files to Check:**
- `server/routes.ts` - dailies/respiration handlers (recently fixed but verify)
- `server/garmin-service.ts` - field mapping

**Timeline:** 2 days  
**Criticality:** 🟡 Medium (affects coaching quality)

---

### 9. **Training Plan Auto-Completion After Run**
**Impact:** Manual workout linking breaks UX  
**Current State:** Works but requires user to manually link

**What's Missing:**
- [ ] Auto-match completed run to planned workout
- [ ] Smart linking based on distance/time/date
- [ ] User confirmation dialog if ambiguous
- [ ] Notification when workout auto-linked

**Implementation:**
- Add post-run matching logic
- Verify `linkedWorkoutId` flows through correctly
- Update plan progress automatically

**Timeline:** 2 days  
**Criticality:** 🟡 Medium (reduces friction)

---

### 10. **Push Notifications (Android)**
**Impact:** Users don't get coaching reminders or plan alerts  
**Current State:** FCM set up, notifications send, but Android doesn't receive them

**What's Broken:**
- [ ] FCM token not being saved on app startup
- [ ] Or notification permission not granted
- [ ] Or notification channel not configured

**Files to Check:**
- `AiRunCoachMessagingService.kt`
- `MainActivity.kt` - permission request flow
- `NotificationSettingsScreen.kt` - verify works

**Timeline:** 1 day  
**Criticality:** 🟡 Medium (feature feels incomplete)

---

## 🟢 NICE TO HAVE - Post-Launch

### 11. **Route Generation AI** (works but needs polish)
- [ ] Error handling UI feedback
- [ ] Route preview before generation
- [ ] Save/bookmark routes

### 12. **Social Features** (UI exists, backend incomplete)
- [ ] Friend requests (status: implemented but needs testing)
- [ ] Activity feed (basic structure only)
- [ ] Segment leaderboards (UI only)

### 13. **Achievements System** (UI only)
- [ ] Backend achievement earning logic
- [ ] Badge distribution
- [ ] Leaderboards

### 14. **Advanced Analytics**
- [ ] HR efficiency trends
- [ ] Fatigue tracking via HRV
- [ ] Workout adaptability metrics

---

## ⚠️ SPECIFIC BUGS TO FIX

### Bug #1: Garmin Respiration Webhook Failures
**Status:** Partially fixed yesterday (see commit `940ecf8`)  
**Verification Needed:** Test with real Garmin device

**Files:**
- `server/routes.ts` line ~4855 (respiration handler)

### Bug #2: "Today" Showing Tomorrow's Workout
**Status:** Fixed yesterday (see commit `61b75d2`)  
**Verification:** Test with mock data where today has no workout

### Bug #3: Training Plan Progress Not Updating
**Status:** Fixed yesterday (multiple commits)  
**Verification:** Test "Mark as Done (no GPS)" button

### Bug #4: Coaching Logs Not Persisting
**Status:** Need to verify backend `/api/coaching-logs` endpoint works

---

## 🏗️ RECOMMENDED LAUNCH STRATEGY

### Phase 1: **Critical Fixes Only** (1 week)
1. ✅ Payment system (Stripe or RevenueCat)
2. ✅ Password reset
3. ✅ Crash reporting (Sentry)
4. ✅ "Mark as Done" fix
5. ✅ Verify iOS brief is complete

**Output:** Private beta APK

### Phase 2: **Hardening** (1 week)
6. ✅ Authentication (refresh tokens)
7. ✅ Offline sync queue
8. ✅ FCM token saving
9. ✅ Garmin data completeness

**Output:** Closed beta APK

### Phase 3: **Polish** (1 week)
10. ✅ Auto-link workouts to plan
11. ✅ Social features testing
12. ✅ Analytics dashboard setup
13. ✅ Performance optimization

**Output:** Release candidate

### Phase 4: **Launch**
- Play Store submission
- In-app payment testing
- Real user testing (100 beta users)
- Monitoring setup

---

## 📋 PRODUCTION READINESS CHECKLIST

### Security
- [ ] Password reset flow implemented
- [ ] JWT refresh tokens working
- [ ] Secrets not in code (use env vars)
- [ ] HTTPS enforced
- [ ] API rate limiting on auth endpoints
- [ ] SQL injection protection verified
- [ ] PII encrypted at rest

### Monetization
- [ ] Stripe/RevenueCat integrated
- [ ] Subscription tiers enforced
- [ ] Free trial flow working
- [ ] Upgrade path clear to users
- [ ] Billing history accessible
- [ ] Refund process defined

### Reliability
- [ ] Error boundary on all screens
- [ ] Sentry crash reporting live
- [ ] Database backups automated
- [ ] API endpoints have timeout/retry
- [ ] Offline mode tested
- [ ] Sync queue manual trigger available

### Performance
- [ ] App startup < 3 seconds
- [ ] Scroll/animation smooth (60 fps)
- [ ] APK size < 100 MB
- [ ] Network requests batched
- [ ] Image lazy loading working

### User Experience
- [ ] Onboarding flow tested
- [ ] First run completion < 5 min
- [ ] Error messages user-friendly
- [ ] Loading states visible
- [ ] Empty states helpful
- [ ] Accessibility (a11y) basics met

### Analytics
- [ ] Firebase Analytics configured
- [ ] Funnel tracking set up
- [ ] Retention metrics visible
- [ ] Crash dashboard live
- [ ] Performance monitoring on
- [ ] User segmentation ready

### Compliance
- [ ] Privacy policy posted
- [ ] Terms of service posted
- [ ] Data deletion flow available
- [ ] GDPR compliance (if EU users)
- [ ] Children's policy (COPPA) if applicable

---

## 🎯 NEXT STEPS (Immediate)

1. **This Week:**
   - [ ] Decide on payment platform (Stripe vs RevenueCat)
   - [ ] Start iOS brief review with iOS dev
   - [ ] Set up Sentry account
   - [ ] Fix "Mark as Done" button

2. **Next Week:**
   - [ ] Implement payment integration
   - [ ] Add password reset flow
   - [ ] Deploy Sentry
   - [ ] Verify all Garmin bugs fixed

3. **Week 3:**
   - [ ] Complete refresh token flow
   - [ ] Add offline sync queue
   - [ ] Run full QA pass
   - [ ] Prepare App Store submission

---

## 🚦 GO/NO-GO DECISION POINTS

### ✅ Can ship MVP when:
- Payment integration complete
- Password reset working
- Sentry live
- All training plan bugs fixed
- FCM working
- 50+ beta testers ≥ 4.0★

### 🔴 Must not ship without:
- Payment system live
- Crash reporting
- Password reset
- Auth working reliably

---

## 💡 QUICK WINS (Do These First)

These are small fixes that increase confidence:

1. **Add Sentry** (30 min) → Get immediate error visibility
2. **Fix "Mark as Done"** (1 hour) → Critical feature works
3. **Add Firebase Analytics** (2 hours) → Measure usage
4. **Test FCM on device** (1 hour) → Verify notifications work
5. **Garmin permission flow review** (1 hour) → Catch bugs before users

---

**Remember:** You're ~70% complete. The remaining 30% is _critical_ for launch. Focus on payment + reliability first, then polish.

Good luck! 🚀
