# Play Store Minification Checklist

## Problem

When you publish to Google Play Store, the release build has **R8 minification enabled** (`isMinifyEnabled = true` in `build.gradle.kts`). The debug APK has it disabled, which is why everything works locally but crashes on Play Store.

**Root Cause:** ProGuard/R8 obfuscates field names and class names. Reflection-based libraries like Gson, Hilt, Garmin SDK, Firebase, and Picovoice can't find the original names and crash.

## Solution

We've updated `app/proguard-rules.pro` with comprehensive rules to keep all necessary classes and metadata intact during minification.

---

## Features to Test After Publishing

### 1. ✅ **LOGIN / REGISTER** (CRITICAL)
**Why it can break:** `AuthResponse` deserialization uses Gson reflection. If fields are obfuscated, Gson can't match JSON fields to class properties.

**Test:**
- [ ] Launch app → see login screen (not crash on startup)
- [ ] Enter email and password
- [ ] Click "Sign In"
- [ ] Verify login succeeds and navigates to location permission screen
- [ ] Try "Sign Up" and create a new account
- [ ] Verify registration succeeds

**Models involved:**
- `AuthResponse` (login/register response)
- `User` (flattened fields in AuthResponse)
- `LoginRequest`, `RegisterRequest`

---

### 2. ✅ **RUN UPLOAD** (CRITICAL)
**Why it can break:** `UploadRunRequest` has 30+ fields. If any are obfuscated, the API receives malformed JSON.

**Test:**
- [ ] Complete a run (or use test run data)
- [ ] Finish run and view summary
- [ ] Verify run is saved locally (check database)
- [ ] Verify run syncs to backend (check API logs or run history)
- [ ] Check that extended metrics appear (HR zone, cadence, elevation)

**Models involved:**
- `UploadRunRequest` (40+ fields)
- `RunSession` (domain model)
- `UploadRunResponse`

---

### 3. ✅ **GARMIN WATCH INTEGRATION** (HIGH PRIORITY)
**Why it can break:** Garmin ConnectIQ SDK uses heavy reflection for message passing and object casting.

**Test:**
- [ ] Enable Garmin watch connection
- [ ] Verify watch app shows authentication message
- [ ] Verify watch receives auth token and can start a run
- [ ] During a run, verify watch metrics update (pace, distance, HR)
- [ ] Check for any "IQ Error" screens on the watch

**Models involved:**
- `WatchBiometricFrame` (message parsing)
- `GarminUploadRequest/Response`
- All Garmin-related ViewModels

**Known issue:** If Garmin SDK can't deserialize messages, the watch will show a blank/error screen.

---

### 4. ✅ **TRAINING PLANS & GOALS** (HIGH PRIORITY)
**Why it can break:** `TrainingPlan`, `Goal`, and related response models have complex nested structures.

**Test:**
- [ ] Generate a training plan (or load existing one)
- [ ] Verify plan displays correctly (workouts, weekly schedule)
- [ ] Create a new goal
- [ ] Verify goals load and display
- [ ] Check that plan progress tracking works

**Models involved:**
- `TrainingPlan`, `TrainingPlanDetails`, `TrainingPlanProgress`
- `Goal`, `UpdateGoalRequest`
- `GeneratePlanRequest/Response`

---

### 5. ✅ **COACHING FEATURES** (MEDIUM PRIORITY)
**Why it can break:** Coaching request/response models are complex with many optional fields.

**Test:**
- [ ] Start a run and trigger coaching (pace coaching, cadence coaching, HR coaching)
- [ ] Verify coaching messages are received from backend
- [ ] Check that coaching audio plays
- [ ] Verify post-run analysis displays (if enabled)

**Models involved:**
- `PaceUpdateResponse`, `StruggleUpdateResponse`
- `HeartRateCoachingResponse`, `ElevationCoachingResponse`
- `EliteCoachingRequest`, `ComprehensiveAnalysisRequest`

---

### 6. ✅ **ROUTE GENERATION & MANAGEMENT** (MEDIUM PRIORITY)
**Why it can break:** `GeneratedRoute`, `Route`, and related models have complex polyline and geometry data.

**Test:**
- [ ] Generate an intelligent route
- [ ] Verify route displays on map
- [ ] Save route and verify it persists
- [ ] Load previous routes and verify they display

**Models involved:**
- `GeneratedRoute`, `GenerateRouteRequest/Response`
- `Route`, `RouteTemplate`
- `LatLng`, `Segment`, `TurnInstruction`

---

### 7. ✅ **FRIEND SYSTEM & SOCIAL** (MEDIUM PRIORITY)
**Why it can break:** Friend and group run models have relational data.

**Test:**
- [ ] Search for friends
- [ ] Send friend request
- [ ] Accept/decline friend request
- [ ] View friend's profile and run history
- [ ] Create/join group run

**Models involved:**
- `Friend`, `FriendRequestsResponse`
- `GroupRun`, `GroupRunModels`
- `SocialFeed`

---

### 8. ✅ **NOTIFICATIONS & PUSH** (MEDIUM PRIORITY)
**Why it can break:** Firebase messaging uses reflection for token management.

**Test:**
- [ ] Complete a run
- [ ] Check that push notifications are received
- [ ] Verify notification data is correct (run name, distance, etc.)
- [ ] Tap notification and verify app opens correctly

**Models involved:**
- `AiRunCoachMessagingService` (Firebase Cloud Messaging)
- All notification-related models

---

### 9. ✅ **SUBSCRIPTION / BILLING** (MEDIUM PRIORITY)
**Why it can break:** Billing models use reflection for purchase validation.

**Test:**
- [ ] Open subscription screen
- [ ] Attempt to purchase (or check billing mock if in dev)
- [ ] Verify subscription status loads correctly
- [ ] Check that feature limits are enforced

**Models involved:**
- Billing models (BillingManager)
- Subscription/usage response models

---

### 10. ✅ **USER PROFILE & SETTINGS** (LOW PRIORITY)
**Why it can break:** Profile update requests have many optional fields.

**Test:**
- [ ] Open profile screen
- [ ] Edit user details (name, fitness level, goals)
- [ ] Save changes
- [ ] Verify changes persist after app restart

**Models involved:**
- `User`
- `UpdateUserRequest`
- `UpdateCoachSettingsRequest`

---

## Quick Verification Script

Before submitting to Play Store, check the APK with `apktool`:

```bash
# Decode the release APK
apktool d app/build/outputs/bundle/release/app-release.aab

# Check that proguard-rules were applied (look for warnings or issues)
# Build and check the mapping file
cat app/build/outputs/mapping/release/mapping.txt | grep "AuthResponse\|UploadRunRequest\|User" | head -20
```

If you see fields like:
```
live.airuncoach.airuncoach.network.model.AuthResponse -> live.airuncoach.airuncoach.network.model.a:
    java.lang.String user -> a
    java.lang.String id -> b
```

This means ProGuard is still obfuscating despite our rules. Check that `proguard-rules.pro` is correct.

---

## Common Minification Issues & Fixes

| Issue | Symptoms | Fix |
|-------|----------|-----|
| **Gson field mismatch** | Login crashes with "no field found" | Ensure `-keep class` and `-keepclassmembers` for model classes |
| **Enum deserialization fails** | Crashes when trying to parse enum values | Add `-keepclassmembers enum` rules |
| **Custom TypeAdapter broken** | IsoDateLongAdapterFactory not found | Keep the class with `-keep class live.airuncoach.airuncoach.network.IsoDateLongAdapterFactory` |
| **Hilt dependency injection fails** | ViewModels don't instantiate | Keep all `@HiltViewModel` and `@Inject` annotations |
| **Garmin SDK crashes** | "IQ Error" on watch or connection fails | Keep `com.garmin.**` and custom message classes |
| **Firebase messaging fails** | No push notifications | Keep `com.google.firebase.**` |
| **Room database fails** | App crashes on startup | Keep `@Entity` and `@Dao` classes |

---

## Testing Checklist

- [ ] Build release APK: `./gradlew assembleRelease`
- [ ] Install on physical Android device (not emulator)
- [ ] Test each feature above
- [ ] Monitor logcat for exceptions: `adb logcat | grep -i "error\|exception"`
- [ ] Check for any ProGuard warnings in the build output
- [ ] Verify that no sensitive code is exposed (use `apktool d` to spot-check)

---

## Final Safety Nets

If you're still seeing crashes after applying the ProGuard rules:

1. **Enable crash reporting temporarily:**
   ```kotlin
   Firebase.crashlytics.recordException(exception)
   ```

2. **Check the mapping file:**
   The release build produces `app/build/outputs/mapping/release/mapping.txt`. This file shows what was obfuscated. If your model classes are in this file, ProGuard is still minifying them despite the keep rules.

3. **Temporarily disable minification (NOT for production):**
   ```kotlin
   // In build.gradle.kts, change to:
   isMinifyEnabled = false
   ```
   This will help you isolate if the issue is minification-related.

4. **Upload to Play Store's internal testing first:**
   This lets you test with real Play Store build process before releasing to closed testers.

---

## Notes

- The ProGuard rules are now comprehensive and should cover all the reflection-based libraries in the codebase
- Always build with `-minify Enabled = true` locally before submitting to Play Store to catch issues early
- The `mapping.txt` file is your friend — check it when things break mysteriously
