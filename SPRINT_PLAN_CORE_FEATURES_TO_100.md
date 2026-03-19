# 🏃 Sprint Plan: Core Features to 100%

**Goal:** Get Core Running, AI Coaching, Training Plans, and Garmin Integration from 90/85/75/80% to 100%

**Total Estimated Time:** 22-36 dev days (~4-5 weeks, aggressive)

**Strategy:** Tackle in order of dependency & impact

---

## 📋 FEATURE BREAKDOWN

### Feature 1: Core Running Feature (90% → 100%)
**Current State:** GPS tracking, struggle detection, pacing alerts, TTS audio work  
**Missing 10%:** Offline queue, raw data completion, run persistence

#### 1.1 Implement Offline Run Upload Queue
**Priority:** 🔴 CRITICAL  
**Impact:** Prevents data loss when user loses internet mid-run  
**Estimated Time:** 3-4 days

**What's Needed:**
1. Create `SyncQueue` (Room database for pending uploads)
2. Create `SyncWorker` (WorkManager for background retry)
3. Update `RunTrackingService.kt` to use SyncQueue instead of simple retry
4. Add "Syncing..." UI indicator in RunSessionScreen
5. Implement exponential backoff (1s, 2s, 4s, 8s, retry forever)

**Files to Create:**
```
app/src/main/java/live/airuncoach/airuncoach/data/
├── database/
│   ├── PendingSyncEntity.kt
│   ├── PendingSyncDao.kt
│   └── SyncDatabase.kt
├── SyncQueue.kt
└── workers/
    └── SyncWorker.kt
```

**Files to Update:**
- `RunTrackingService.kt` (line 2170+) - wire SyncQueue
- `RunSessionScreen.kt` - add sync status UI
- `build.gradle.kts` - add WorkManager + Room deps

**Acceptance Criteria:**
- [ ] Run tracked offline, stored in Room
- [ ] Device reconnects → automatic upload
- [ ] "Syncing..." state visible in UI
- [ ] 5+ failed uploads still retry
- [ ] Test: Pull network → complete run → reconnect → verify upload

---

#### 1.2 Complete Raw Data Metrics
**Priority:** 🟡 HIGH  
**Impact:** Users see complete run stats  
**Estimated Time:** 1-2 days

**What's Needed:**
1. Track max/min heart rate in `RunTrackingService.kt`
2. Track max cadence
3. Calculate GPS accuracy
4. Update `RunSession` data class with these fields

**Files to Update:**
- `RunTrackingService.kt` - add tracking logic
- `domain/model/RunSession.kt` - add fields
- `RawDataViews.kt` - wire up display

**Acceptance Criteria:**
- [ ] Max HR displayed in raw data
- [ ] Min HR displayed in raw data
- [ ] Max cadence displayed
- [ ] GPS accuracy % shown
- [ ] Values match expected ranges for sample runs

---

#### 1.3 Wire "Mark as Done" from Workout Detail
**Priority:** 🟡 HIGH  
**Impact:** Users can complete workouts without GPS  
**Estimated Time:** 1 hour (FIX ALREADY APPLIED TODAY)

**Status:** ✅ DONE (commit 29a7cc6)

**Verification Needed:**
- [ ] Test on physical device
- [ ] Tap "Mark as Done"
- [ ] Verify plan progress updates (0/32 → 1/32)

---

#### 1.4 Migrate RunRepository to Room
**Priority:** 🟢 NICE TO HAVE (post-launch)  
**Impact:** Better local persistence, query performance  
**Estimated Time:** 2-3 days

**Current:** SharedPreferences-based, marked TODO  
**Needed:** Full Room database integration

**Files to Create:**
```
app/src/main/java/live/airuncoach/airuncoach/data/
├── database/
│   ├── RunEntity.kt
│   ├── RunDao.kt
│   └── AppDatabase.kt
└── RunRepository.kt (refactor)
```

---

### **Summary for Core Running: 4-6 days**
1. Day 1-3: Offline queue + sync worker
2. Day 4: Raw data metrics
3. Day 5-6: Room migration (optional, can do post-launch)

**Quick Win:** Verify "Mark as Done" fix is working

---

## Feature 2: AI Coaching (85% → 100%)
**Current State:** Pre-run briefing, HR zones, coach personality implemented  
**Missing 15%:** Full structured payload usage, validation, fallback robustness, throttling

#### 2.1 Use Full Structured Briefing Response End-to-End
**Priority:** 🔴 CRITICAL  
**Impact:** Users get richer coaching (not just text)  
**Estimated Time:** 2 days

**Current Issue:**
- Backend returns `intensityAdvice`, `warnings`, `readinessInsight` (good fields)
- Android only displays `text` field (wastes 60% of data)
- User sees generic message instead of tailored coaching

**What's Needed:**
1. Update `PreRunBriefingResponse.kt` to expose all fields
2. Update `RunSessionViewModel.kt` to use `intensityAdvice` + `warnings` + `readinessInsight`
3. Update `RunPreBriefingCard.kt` UI to display all fields
4. Compose a richer brief: "**Briefing:** [...] **Intensity:** [...] **Warnings:** [...] **Readiness:** [...]"

**Files to Update:**
- `app/.../network/model/PreRunBriefingResponse.kt` - expose fields
- `app/.../viewmodel/RunSessionViewModel.kt` - parse structured data
- `app/.../ui/screens/RunSessionScreen.kt` (or RunPreBriefingCard) - compose rich UI
- `app/.../ui/components/CoachingCard.kt` - if it exists

**Acceptance Criteria:**
- [ ] Run pre-briefing shows 4+ distinct sections (briefing, intensity, warnings, readiness)
- [ ] Each section visible and readable
- [ ] Audio TTS reads all sections (not just text)
- [ ] Test with 3+ different workout types (easy, intervals, long run)

---

#### 2.2 Add Response Schema Validation & Safe Parsing
**Priority:** 🟡 HIGH  
**Impact:** Prevent crashes from malformed AI responses  
**Estimated Time:** 1-2 days

**Current Issue:**
- If OpenAI returns malformed JSON, `Gson.fromJson()` crashes
- No null-safety on nested fields
- Silent failures with no user feedback

**What's Needed:**
1. Create `SafeCoachingResponseParser.kt` with try-catch + defaults
2. Validate all fields exist before use
3. Provide sensible defaults if parsing fails
4. Log all parse failures for monitoring

**Example:**
```kotlin
fun parsePreRunBriefing(json: String): PreRunBriefingResponse {
    return try {
        Gson().fromJson(json, PreRunBriefingResponse::class.java)
            ?.validateFields()  // Custom extension
            ?: PreRunBriefingResponse.getDefault()
    } catch (e: JsonSyntaxException) {
        Log.e("CoachingParser", "Malformed response", e)
        PreRunBriefingResponse.getDefault()  // Fallback
    }
}
```

**Files to Create/Update:**
- New: `app/.../network/util/SafeCoachingResponseParser.kt`
- Update: `RunSessionViewModel.kt` - use safe parser

**Acceptance Criteria:**
- [ ] Intentionally send malformed JSON → app doesn't crash
- [ ] Fallback message shown ("Ready to run!")
- [ ] Error logged for monitoring
- [ ] No user-facing error (graceful degradation)

---

#### 2.3 Improve Fallback Tiers & Coaching Consistency
**Priority:** 🟡 HIGH  
**Impact:** Users always get some coaching, even if API fails  
**Estimated Time:** 1-2 days

**What's Needed:**
1. Define 3 fallback tiers:
   - Tier 1: Full structured response (ideal)
   - Tier 2: Generic briefing + coach personality tone (fallback)
   - Tier 3: Bare minimum ("Ready to run! Let's go!")
2. Implement throttling to avoid coaching spam (max 1 coaching message per 30s)
3. Add coaching cooldown state machine

**Files to Create/Update:**
- `RunSessionViewModel.kt` - add throttling logic
- `ai-service.ts` (backend) - ensure all paths return valid response

**Acceptance Criteria:**
- [ ] Network failure → Tier 2 response shown
- [ ] Rapid successive triggers → only 1 message plays
- [ ] User can manually request coaching (overrides cooldown)

---

#### 2.4 Add Trigger Throttling/Coaching Cadence Control
**Priority:** 🟢 NICE TO HAVE  
**Impact:** Prevent coaching fatigue (too many messages)  
**Estimated Time:** 1 day

**What's Needed:**
1. Don't trigger coaching more than once per minute (unless user asked)
2. Store last trigger timestamp
3. Skip if already coached recently

---

### **Summary for AI Coaching: 4-5 days**
1. Day 1: Full structured response end-to-end
2. Day 2: Safe parsing + validation
3. Day 3: Fallback tiers
4. Day 4: Throttling (optional)

---

## Feature 3: Training Plans (75% → 100%)
**Current State:** Generation, weekly view, completion tracking  
**Missing 25%:** Adaptation application, completion endpoint normalization, detail screen wiring, injury flow, approval UX

#### 3.1 Fix Workout Detail Completion API Call ✅
**Priority:** 🔴 CRITICAL  
**Impact:** "Mark as Done (no GPS)" actually works  
**Estimated Time:** 1-2 hours (ALREADY FIXED TODAY)

**Status:** ✅ DONE (commit 29a7cc6 + 9e9b2cb)

**Verification Needed:**
- [ ] Test on device
- [ ] Tap "Mark as Done" button
- [ ] Verify progress bar updates

---

#### 3.2 Make Adaptation Engine Rewrite Upcoming Workouts
**Priority:** 🔴 CRITICAL  
**Impact:** AI actually changes the plan (not just logs suggestions)  
**Estimated Time:** 3-4 days

**Current Issue:**
- `adaptTrainingPlan()` generates suggestions but doesn't apply them
- Upcoming workouts unchanged
- User sees same plan even after AI recommends changes

**What's Needed:**
1. When adaptation approved (`userAccepted = true`), apply it to workouts
2. Update `planned_workouts` table with new intensity/distance/description
3. Notify user: "Your plan has been updated based on recent performance"
4. Refresh UI to show changes

**Files to Update:**
- `server/training-plan-service.ts` - `adaptTrainingPlan()` function
- `server/routes.ts` - `/api/training-plans/{id}/adaptations/{id}/accept` endpoint
- `app/.../viewmodel/TrainingPlanViewModel.kt` - trigger refresh after acceptance

**Acceptance Criteria:**
- [ ] Plan adaptation suggested
- [ ] User taps "Accept"
- [ ] Upcoming workouts change (e.g., intensity increases)
- [ ] Plan detail refreshed
- [ ] Notification shown

---

#### 3.3 Normalize Completion Endpoints
**Priority:** 🟡 HIGH  
**Impact:** Prevent bugs from endpoint confusion  
**Estimated Time:** 1-2 days

**Current Issue:**
- Both old and new completion patterns exist
- Risk of using wrong endpoint
- Confusing for future devs

**What's Needed:**
1. Audit all completion paths in `routes.ts`
2. Standardize on single endpoint: `POST /api/training-plans/{planId}/workouts/{workoutId}/complete`
3. Deprecate any old endpoints (or remove if duplicate)
4. Update all Android calls to use single endpoint

**Files to Update:**
- `server/routes.ts` - consolidate completion endpoints
- `app/.../network/ApiService.kt` - single `completeWorkout()` call
- `app/.../viewmodel/TrainingPlanViewModel.kt` - use single endpoint

---

#### 3.4 Complete Injury-Triggered Recalibration Flow
**Priority:** 🟡 HIGH  
**Impact:** Users can mark injury/recover, plan adjusts  
**Estimated Time:** 2-3 days

**Current Issue:**
- `CoachingProgrammeScreen.kt` has TODO for injury save flow
- No automatic recalibration after injury logged

**What's Needed:**
1. UI: Injury status selector (None / Mild / Moderate / Severe)
2. API: `POST /api/training-plans/{id}/record-injury` endpoint
3. Backend: Trigger plan recalibration
4. UI: Show recalibration notification + updated plan

**Files to Create/Update:**
- `app/.../ui/screens/CoachingProgrammeScreen.kt` - injury selector UI
- New: `app/.../viewmodel/InjuryViewModel.kt` (or use TrainingPlanViewModel)
- `server/routes.ts` - injury recording endpoint
- `server/training-plan-service.ts` - injury → recalibration logic

---

#### 3.5 Add Adaptation Approval/Review UX
**Priority:** 🟡 HIGH  
**Impact:** Users understand and control plan changes  
**Estimated Time:** 2 days

**What's Needed:**
1. Show "Suggested Changes" screen when adaptation available
2. Display what changed (e.g., "Increase intensity next week from Z3 to Z4")
3. Buttons: "Accept", "Decline", "Review"
4. On accept: apply changes
5. On decline: mark as dismissed

**Files to Create/Update:**
- New: `app/.../ui/screens/PlanAdaptationReviewScreen.kt`
- `app/.../ui/screens/CoachingProgrammeScreen.kt` - trigger review screen
- `app/.../viewmodel/TrainingPlanViewModel.kt` - adaptation state

---

### **Summary for Training Plans: 8-11 days**
1. Day 1: Verify completion fix (from today)
2. Day 2-3: Adaptation application engine
3. Day 4: Normalize endpoints
4. Day 5-7: Injury flow + recalibration
5. Day 8-9: Adaptation review UX

---

## Feature 4: Garmin Integration (80% → 100%)
**Current State:** OAuth, webhooks, wellness context, respiration/dailies sync  
**Missing 20%:** User resolution consistency, scope handling, legacy code cleanup, deprecated path removal

#### 4.1 Unify Webhook User Resolution Strategy
**Priority:** 🔴 CRITICAL  
**Impact:** All Garmin data reaches users (currently ~20% fail)  
**Estimated Time:** 2-3 days

**Current Issue:**
- Dailies webhook uses one user-resolution strategy
- Respiration webhook uses different strategy
- Both have edge cases where mapping fails
- "Could not map" warnings in logs for 20% of users

**What's Needed:**
1. Create single `resolveGarminUserId()` function in `garmin-service.ts`
2. Use consistent 3-tier fallback: token → Garmin ID → single device
3. Apply to ALL webhook handlers (dailies, respiration, epochs, etc.)
4. Add detailed logging with decision tree

**Files to Update:**
- `server/garmin-service.ts` - new `resolveGarminUserId()` function
- `server/routes.ts` - all webhook handlers use it
- Test vectors: create sample Garmin payloads for each scenario

**Acceptance Criteria:**
- [ ] Dailies webhook: no "Could not map" errors
- [ ] Respiration webhook: no "Could not map" errors
- [ ] All wellness data appears in app
- [ ] Test with 5+ different user scenarios

---

#### 4.2 Tighten Missing-Scope Detection & Remediation
**Priority:** 🟡 HIGH  
**Impact:** Users know when to grant more permissions  
**Estimated Time:** 1-2 days

**Current Issue:**
- If user doesn't grant "heart_rate" scope, data silently missing
- No user-facing warning
- User confused why no HR data

**What's Needed:**
1. In Garmin connect flow: show which scopes requested
2. In settings: display which scopes granted
3. If data unavailable: show "Grant Garmin [scope] permission" button
4. Graceful degradation: show what data IS available

**Files to Update:**
- `app/.../ui/screens/GarminConnectScreen.kt` - show scope requests
- `app/.../ui/screens/ConnectedDevicesScreen.kt` - show granted scopes + re-auth button
- `server/garmin-permissions-service.ts` - track scope grants

---

#### 4.3 Retire Legacy Android Garmin OAuth Code
**Priority:** 🟡 HIGH  
**Impact:** Reduce confusion, prevent code divergence  
**Estimated Time:** 1-2 days

**Current Issue:**
- `GarminAuthManager.kt` and `GarminDataSync.kt` exist on Android
- Backend uses OAuth flow (`routes.ts` `/api/auth/garmin`)
- Unclear which path is used, potential for bugs

**What's Needed:**
1. Audit: Is legacy code actually used, or just legacy?
2. If not used: Delete it + update imports
3. If used: Document why + align with backend flow
4. Standard path: Backend OAuth → token stored → Android queries API

**Files to Review/Delete:**
- `app/.../data/GarminAuthManager.kt` - legacy?
- `app/.../data/GarminDataSync.kt` - legacy?
- If deleting: update `ConnectedDevicesScreen.kt` + imports

---

#### 4.4 Clean Up Deprecated Direct-Pull Logic
**Priority:** 🟢 NICE TO HAVE  
**Impact:** Cleaner codebase  
**Estimated Time:** 1 day

**Current Issue:**
- `garmin-service.ts` has old direct activity pull API path
- Not used anymore (webhook-first model)
- Just dead code cluttering things

**What's Needed:**
1. Identify deprecated methods (likely `getActivitiesSince()` or similar)
2. Remove if truly unused
3. Document what replaced it

---

### **Summary for Garmin Integration: 5-7 days**
1. Day 1-2: Unify user resolution
2. Day 3: Scope detection UI
3. Day 4: Clean up legacy code
4. Day 5: Dead code removal

---

## 📊 TOTAL SPRINT PLAN

| Feature | Current | Target | Effort | Timeline |
|---------|---------|--------|--------|----------|
| Core Running | 90% | 100% | 4-6 days | Week 1 |
| AI Coaching | 85% | 100% | 4-5 days | Week 1-2 |
| Training Plans | 75% | 100% | 8-11 days | Week 2-3 |
| Garmin Integ | 80% | 100% | 5-7 days | Week 2 |
| **TOTAL** | **82.5%** | **100%** | **22-36 days** | **4-5 weeks** |

---

## 🎯 RECOMMENDED PRIORITY ORDER

### Week 1 (Priority: Complete before moving on)
1. ✅ **Core Running - Offline Queue** (3-4 days) - CRITICAL for data reliability
2. ✅ **Training Plans - Completion API** (1-2 hours) - CRITICAL for feature
3. **AI Coaching - Structured Response** (2 days) - HIGH impact on UX

### Week 2
4. **Core Running - Raw Data Metrics** (1-2 days) - HIGH priority
5. **AI Coaching - Safe Parsing** (1-2 days) - HIGH for reliability
6. **Garmin - User Resolution** (2-3 days) - CRITICAL for data sync
7. **Training Plans - Adaptation Engine** (3-4 days) - HIGH for AI feature

### Week 3
8. **Training Plans - Injury Flow** (2-3 days) - MEDIUM priority
9. **AI Coaching - Fallback Tiers** (1-2 days) - MEDIUM priority
10. **Garmin - Scope Detection** (1-2 days) - MEDIUM priority

### Week 4
11. **Training Plans - Endpoint Normalization** (1-2 days) - MEDIUM
12. **Training Plans - Adaptation Review UX** (2 days) - MEDIUM
13. **Garmin - Legacy Code Cleanup** (1-2 days) - LOW

---

## ✅ IMMEDIATE ACTIONS (Today)

1. ✅ Verify "Mark as Done" fix works on device
2. Create GitHub issues for each task above
3. Prioritize by: risk (offline data loss), impact (user features), complexity
4. Assign: Start Week 1 critical items

---

## 📝 ACCEPTANCE CRITERIA (Features at 100%)

### Core Running at 100%:
- [ ] Offline runs sync automatically on reconnect
- [ ] All raw data metrics displayed (max/min HR, cadence, accuracy)
- [ ] "Mark as Done" completes workout
- [ ] No data loss on network interruption

### AI Coaching at 100%:
- [ ] Structured briefing shown (briefing + intensity + warnings + readiness)
- [ ] Audio TTS plays all sections
- [ ] No crashes on malformed responses
- [ ] Coaching throttled (no spam)

### Training Plans at 100%:
- [ ] "Mark as Done (no GPS)" works end-to-end
- [ ] AI adaptations actually modify upcoming workouts
- [ ] Users can review/accept/decline adaptations
- [ ] Injury marking triggers plan recalibration
- [ ] Single normalized completion endpoint

### Garmin at 100%:
- [ ] Zero "Could not map" errors in logs
- [ ] All users receive dailies + respiration data
- [ ] Scopes clearly shown in UI
- [ ] Users can fix permission issues

---

## 🚀 DEFINITION OF DONE

Each feature is at 100% when:
1. Code written + merged
2. Tests pass (unit + integration)
3. Manually tested on physical device
4. No new lint/warning errors
5. Documented in code (comments for complex logic)
6. PR reviewed + approved

