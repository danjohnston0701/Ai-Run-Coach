# Quick Release Checklist

## 🚀 Pre-Release (5 minutes)

- [ ] **Update Version**
  ```bash
  # Edit app/build.gradle.kts
  versionCode = 32  # Increment by 1
  versionName = "1.9.3"  # Update version name
  ```

- [ ] **Commit Version Change**
  ```bash
  git add app/build.gradle.kts
  git commit -m "Bump version to 1.9.3 (code 32)"
  git push
  ```

## 🔨 Build Phase (2-5 minutes)

### Option A: Interactive Build Script (Recommended)
```bash
./build-release.sh
```
Then choose your build type (AAB/APK/Both)

### Option B: Manual Build Commands

**AAB Only (Fastest for Play Store):**
```bash
./gradlew clean bundleRelease
```

**APK Only (For direct testing):**
```bash
./gradlew clean assembleRelease
```

**Both AAB and APK:**
```bash
./gradlew clean bundleRelease assembleRelease
```

## ✅ Verification (2 minutes)

- [ ] **Check Build Artifacts**
  ```bash
  # AAB location
  ls -lh app/build/outputs/bundle/release/app-release.aab
  
  # APK location (if built)
  ls -lh app/build/outputs/apk/release/app-release.apk
  ```

- [ ] **Verify Signature (APK)**
  ```bash
  jarsigner -verify -verbose app/build/outputs/apk/release/app-release.apk
  ```

- [ ] **Test on Device (Optional but Recommended)**
  ```bash
  # Test with APK first
  adb install -r app/build/outputs/apk/release/app-release.apk
  ```

## 📤 Upload to Play Store (5 minutes)

1. **Open Google Play Console**
   - Go to [play.google.com/console](https://play.google.com/console)
   - Select **AiRunCoach** app

2. **Create New Release**
   - Navigate to **Release** → **Production** (or **Internal Testing** first)
   - Click **Create New Release**

3. **Upload Build**
   - Click **Browse files** and select:
     - `app-release.aab` (recommended)
     - Or `app-release.apk` if not using AAB
   - Wait for upload to complete

4. **Review & Update Content**
   - ✅ Release notes (describe changes/fixes)
   - ✅ App screenshots (if changed)
   - ✅ App description (if changed)
   - ✅ Privacy policy URL
   - ✅ Target audience
   - ✅ Content rating

5. **Submit for Review**
   - Click **Review Release**
   - Click **Start Rollout to Production**
   - **(Recommended)** Start with 5% rollout first
   - Monitor for crashes, then increase to 100%

## 📊 Post-Release Monitoring (Ongoing)

- [ ] **Monitor Crashes**
  - Play Console → **Crashes & ANRs**
  - Firebase Crashlytics → Look for new crashes

- [ ] **Check User Ratings**
  - Play Console → **Ratings & Reviews**
  - Address critical feedback

- [ ] **Monitor Installation Rate**
  - Play Console → **Acquisition** → **Install Events**
  - Should see uptick within 1-2 hours

- [ ] **Verify Analytics**
  - Firebase Analytics → Check active user counts
  - Ensure no significant drop in engagement

## 🔧 Troubleshooting

### Build Fails: "Keystore not found"
```bash
# Verify signing credentials in local.properties
cat local.properties | grep KEYSTORE

# Fix: Check file path is correct and accessible
ls -la /path/to/your/release.keystore
```

### Build Fails: Version code already used
```bash
# Check current version code in build.gradle.kts
grep versionCode app/build.gradle.kts

# Increment it and rebuild
# versionCode = 32  (was 31)
```

### AAB Upload Fails: "This release already exists"
- The version code must be unique for every release
- Increment versionCode, rebuild, and try again

### Upload Stuck/Failing
- Try uploading from Play Console web interface directly
- Sometimes bundletool has issues; web upload is more reliable

## 📋 Version History

Keep track of releases:

| Version | Code | Date | Notes |
|---------|------|------|-------|
| 1.9.2 | 31 | Jul 18, 2026 | Previous release |
| 1.9.3 | 32 | Jul 19, 2026 | Bug fixes & improvements |

Update this table after each release.

## 🎯 Best Practices

✅ **DO:**
- Test with release APK before uploading
- Use staged rollout (5% → 25% → 100%)
- Monitor crashes for first 24 hours
- Keep detailed release notes
- Increment version code for EVERY release

❌ **DON'T:**
- Upload the same version code twice (will fail)
- Skip testing the release build
- Go 100% rollout immediately (risk if bugs)
- Forget to commit version bumps
- Delete or re-sign with different keystore

## 📞 Support

For more detailed information, see:
- **Full Build Guide**: `GOOGLE_PLAY_BUILD_GUIDE.md`
- **Play Store Help**: [support.google.com/googleplay/android-developer](https://support.google.com/googleplay/android-developer)
- **App Bundle Info**: [developer.android.com/guide/app-bundle](https://developer.android.com/guide/app-bundle)
