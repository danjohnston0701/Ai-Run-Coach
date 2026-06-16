# Immediate Next Steps to Fix Play Store Crashes

## The Problem
Your app crashes on Google Play Store login screen but works fine in debug APK because the release build has R8 minification enabled, which obfuscates field names that Gson needs for JSON deserialization.

## What We Fixed
✅ Updated `app/proguard-rules.pro` with 150+ lines of comprehensive rules to preserve:
- All Gson model classes and `@SerializedName` annotations
- Custom TypeAdapters (critical `IsoDateLongAdapterFactory`)
- Hilt ViewModels and dependency injection
- Garmin SDK, Picovoice, Firebase, and other reflection-based libraries
- Room database entities
- SessionManager and CoachingFeaturePreferences

## Now You Need To

### Step 1: Increment Version Code
Edit `app/build.gradle.kts` line 29:

```kotlin
// Before
versionCode = 7

// After  
versionCode = 8
```

(This is required by Google Play — you can't upload the same version code twice)

---

### Step 2: Build Release Bundle
```bash
./gradlew bundleRelease
```

This will:
- Apply R8 minification with your new ProGuard rules
- Generate `app/build/outputs/bundle/release/app-release.aab`
- Create a mapping file at `app/build/outputs/mapping/release/mapping.txt`

---

### Step 3: Verify Minification Worked
Check the mapping file to ensure Gson models are NOT obfuscated:

```bash
grep "AuthResponse\|User\|UploadRunRequest" app/build/outputs/mapping/release/mapping.txt | head -10
```

**Good output** (class name is preserved):
```
live.airuncoach.airuncoach.network.model.AuthResponse -> live.airuncoach.airuncoach.network.model.AuthResponse:
```

**Bad output** (class is obfuscated — if you see this, the ProGuard rules didn't work):
```
live.airuncoach.airuncoach.network.model.AuthResponse -> a:
```

---

### Step 4: Test on Physical Device (Optional but Recommended)
Convert AAB to APK and test locally:

```bash
# Install the release APK
adb install -r app/build/outputs/apk/release/app-release.apk

# Monitor for crashes
adb logcat | grep -i "error\|exception\|gson"
```

Test these critical features:
- [ ] App launches without crash
- [ ] Login screen appears
- [ ] Login with valid credentials works
- [ ] Can see home screen after login
- [ ] Complete a test run and upload it

---

### Step 5: Upload to Google Play Console

1. **Go to Google Play Console → Your App → Internal testing (or Closed testing)**
2. **Create new release:**
   - Upload the `app-release.aab` file
   - Add release notes: "Fixed app crash on login screen by updating R8 minification rules"
   - Mark as "Ready to review"
3. **Roll out to testers:** 
   - Don't go directly to production
   - Test with internal testers first
   - Then closed testers if you have them

---

### Step 6: Monitor for Crashes
After upload, Google Play will show crash reports in:
- **Google Play Console → Your App → Crashes and ANRs**

Watch this for 24 hours. Common issues to look for:
- "Gson.toJson()" or "Gson.fromJson()" in stack trace (means ProGuard rules failed)
- "No field found" errors (same issue)
- "Hilt" or "Dagger" errors (dependency injection broke)
- "Garmin" errors (watch integration broke)

If you see crashes, the ProGuard rules may need adjustment.

---

## If You Still See Crashes After Uploading

### Option A: Debug with Logcat
Get crash logs from Play Console and match them to stack traces. The `mapping.txt` file can "deobfuscate" stack traces.

### Option B: Temporarily Disable Minification (NOT for production)
To isolate if it's a minification issue:
```kotlin
// In build.gradle.kts
release {
    isMinifyEnabled = false  // Temporarily disable
    // ... rest of config
}
```
Then rebuild and test. If the issue goes away, it's definitely a ProGuard rules problem.

### Option C: Check ProGuard Rules for Syntax Errors
```bash
# Look for any warnings during build
./gradlew bundleRelease 2>&1 | grep -i "warning\|proguard"
```

---

## Checklist Before Final Submission

- [ ] Version code incremented (7 → 8)
- [ ] `bundleRelease` completes without errors
- [ ] Mapping file shows model classes are NOT obfuscated
- [ ] Tested on physical device (login + run upload + Garmin)
- [ ] No crashes in logcat
- [ ] Uploaded to internal testing first
- [ ] Monitoring Play Console for crash reports

---

## Documentation Created for You

Two new files were created to help:

1. **PROGUARD_RULES_SUMMARY.md** — Explains what each ProGuard rule does and why
2. **PLAY_STORE_MINIFICATION_CHECKLIST.md** — Comprehensive testing checklist for all features

Read these if you encounter issues or want to understand the technical details.

---

## Common Issues & Quick Fixes

| Issue | Fix |
|-------|-----|
| Build fails with ProGuard syntax error | Check for typos in `proguard-rules.pro`. Rule syntax is strict. |
| Login still crashes on Play Store | Check mapping.txt — if AuthResponse is obfuscated, the -keep rules didn't apply. |
| Garmin watch disconnects on Play Store | Garmin SDK needs reflection — verify `com.garmin.**` rules are in place. |
| Run upload fails | UploadRunRequest fields are obfuscated — check `network.model.**` rules. |
| Training plans don't load | TrainingPlan model obfuscated — should be covered by `domain.model.**` rule. |

---

## Questions?

If something is unclear:
1. Check `PROGUARD_RULES_SUMMARY.md` for technical details
2. Check `PLAY_STORE_MINIFICATION_CHECKLIST.md` for feature testing
3. Review the ProGuard comments in `app/proguard-rules.pro`

Good luck! 🚀
