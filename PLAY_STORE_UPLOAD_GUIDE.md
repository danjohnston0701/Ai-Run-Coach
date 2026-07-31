# Google Play Store Upload Guide

## 🎯 Quick Reference

| Item | Value |
|------|-------|
| **AAB File** | `app/build/outputs/bundle/release/app-release.aab` |
| **Size** | 20 MB |
| **Version Code** | 41 |
| **Version Name** | 2.0.1 |
| **SHA-256** | `d63f217a2dc54f4dfb1b4500caaac9300592f4cd52d36d4b88373476a605c9cc` |
| **Build Date** | July 29, 2026 |

---

## 📋 Step-by-Step Upload Process

### Step 1: Access Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Sign in with your developer account
3. Select the **AI Run Coach** app from your apps list

### Step 2: Create a New Release

1. In the left sidebar, click **Release** → **Production**
2. Click **Create new release** button (top right)

### Step 3: Upload the AAB

1. In the "App bundles and APKs" section, click **Upload**
2. Select `app-release.aab` from:
   ```
   /Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/build/outputs/bundle/release/app-release.aab
   ```
3. Wait for validation to complete (usually 2-5 minutes)
   - Google Play will analyze the AAB and generate optimized APKs for all device configurations
   - You'll see targeting info: arm64-v8a, armeabi-v7a, x86, x86_64

### Step 4: Review Release Notes

1. Scroll to **Release notes** section
2. Add release notes for version 2.0.0:

**English (en-US):**
```
🔧 Version 2.0.1 — Platform Stability & Walking Support

New Features:
• Added Walking activity type alongside Running
• Power Saver Mode detection — warns you when Android's battery saver throttles GPS accuracy
• Enhanced cadence charts using dedicated sensor data

Bug Fixes:
• Fixed critical scroll issue on Configure Your Run screen when Target Time or Group Run options were expanded
• Users can now fully scroll through all setup options before preparing a run
• Improved UI performance and memory efficiency
• Added live power saver monitoring during runs

Technical:
• Battery optimization exemption request for accurate GPS tracking
• Telemetry for power saver detection to help debug tracking issues
• Complete activity type labeling throughout the app
```

3. Select **English** as language (or add translations if applicable)
4. Click **Save**

### Step 5: Review App Content Rating (if needed)

1. Check **Content rating** section
2. If prompted, complete the content rating questionnaire
3. Usually pre-filled from previous releases

### Step 6: Choose Rollout Strategy

#### Option A: Staged Rollout (Recommended)

1. Under **Rollout**, select **Staged rollout**
2. Set initial percentage:
   - **5%** — First wave (monitor for 24 hours)
   - **25%** — Second wave
   - **100%** — Full rollout

#### Option B: Immediate Rollout

1. Under **Rollout**, select **Immediately rollout to all users**
2. Click **Review release**

### Step 7: Final Review & Publish

1. **Review release** page shows:
   - Version code: 41
   - Version name: 2.0.1
   - Target SDK: 36
   - Devices supported
   
2. Click **Review release**
3. Review all details one final time
4. Click **Release to production** (or staged rollout if you chose that option)

---

## ⏱️ Post-Release Monitoring

After publishing, monitor these metrics:

### In Google Play Console

1. **Crashes & ANRs**
   - Go to **Quality** → **Crashes and ANRs**
   - Watch for any spike in crash rates
   - Key areas to watch: GPS tracking, power saver detection

2. **User Reviews**
   - Go to **User feedback** → **Reviews**
   - Look for complaints about scrolling, GPS accuracy, or battery drain
   - Key phrases: "scroll", "freeze", "GPS", "battery"

3. **Ratings**
   - Monitor rating changes (aim to keep above 4.5 stars)
   - Check for 1-star reviews related to this release

4. **Performance** (beta feature)
   - Go to **Quality** → **Android Vitals**
   - Monitor:
     - Crash rate (should be < 0.5%)
     - ANR rate (should be < 0.1%)
     - Frozen frames

### Metrics to Track

```
Target Metrics:
✓ Crash rate: < 0.5%
✓ ANR rate: < 0.1%
✓ App rating: ≥ 4.5 stars
✓ 1-star reviews: < 2% of reviews
✓ GPS accuracy complaints: 0 new reports
```

### If Issues Found

**For Critical Issues (crashes):**
1. Halt rollout immediately
2. Pull analytics to identify root cause
3. Create bugfix build (Version Code 41)
4. Re-test and re-upload

**For Minor Issues (UX, performance):**
1. Continue rollout but prioritize for next release
2. Create GitHub issue or bug ticket
3. Plan fix for v2.0.1 or v2.1.0

---

## 🔍 Verification Checklist

Before uploading, verify:

- [ ] AAB file exists: `app/build/outputs/bundle/release/app-release.aab`
- [ ] AAB size is ~20 MB (reasonable for the app)
- [ ] SHA-256 checksum matches: `93bfcaafc769d8084ac6dfa229f381769fd284edb39641ef5ac038a08b13341e`
- [ ] Version code is 41
- [ ] Version name is "2.0.1"
- [ ] Signing config points to correct keystore
- [ ] Release notes are ready
- [ ] No ProGuard obfuscation issues (tested on real device if possible)

---

## 📱 Pre-Release Testing

If possible, test on a physical device before uploading:

```bash
# Build release APK for direct installation
./gradlew assembleRelease

# Install on connected device
adb install -r app/build/outputs/apk/release/app-release.apk

# Test checklist:
# - [ ] Power saver warning appears when enabled
# - [ ] Battery optimization exemption request appears
# - [ ] Configure Your Run screen scrolls smoothly when expanded
# - [ ] Group Run selection works smoothly
# - [ ] GPS tracking accuracy is good
# - [ ] No crashes after 5 minutes of running
```

---

## 🚨 Rollback Plan

If a critical issue is discovered after release:

1. **Halt staged rollout immediately**
   - In Play Console, go to **Release** → **Production**
   - Click the release and select **Halt rollout**

2. **Communicate with users** (optional)
   - Post in release notes that rollout was paused
   - Explain the issue briefly

3. **Create bugfix release**
   - Increment version code to 41
   - Fix the issue
   - Test thoroughly
   - Re-upload and re-release

4. **Review** before next release
   - Add additional QA steps
   - Consider extended staged rollout (1% → 5% → 25% → 100%)

---

## 📞 Support & Resources

- **Google Play Console Help:** https://support.google.com/googleplay/android-developer
- **App Bundle Guide:** https://developer.android.com/guide/app-bundle
- **Android Vitals:** https://developer.android.com/quality/vitals
- **Play Store Policy:** https://play.google.com/about/developer-content-policy/

---

**Last Updated:** July 29, 2026  
**Build Version:** 2.0.1 (Code 41)
