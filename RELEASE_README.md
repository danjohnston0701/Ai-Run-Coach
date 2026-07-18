# AiRunCoach Google Play Store Release - Complete Package

## 🚀 Quick Start (30 seconds)

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
./build-release.sh
```

Then upload the generated `app-release.aab` to [Google Play Console](https://play.google.com/console).

---

## 📚 Documentation Overview

Everything you need to release AiRunCoach to Google Play Store is provided. Choose your path:

### For Developers / Team Leads
**Start here**: `RELEASE_SUMMARY.md` (5-minute overview)

### For First-Time Releases
1. Read: `QUICK_RELEASE_CHECKLIST.md` (2-minute checklist)
2. Run: `./build-release.sh` (interactive build script)
3. Upload: Follow the Play Store section

### For Complete Technical Details
**Read**: `GOOGLE_PLAY_BUILD_GUIDE.md` (300+ line comprehensive guide)
- Prerequisites setup
- Build configurations explained
- Step-by-step process
- Troubleshooting section
- Version management
- Post-release monitoring

### For Visual Learners
**See**: `RELEASE_WORKFLOW_DIAGRAM.md` (ASCII diagrams with flow)
- Visual workflow from start to finish
- Build output structure
- Directory layout
- Decision trees
- Time estimates

### For Command Reference
**Look up**: `BUILD_COMMANDS_REFERENCE.md` (30+ commands)
- Build commands organized by category
- Testing commands
- Version management
- Bundletool usage
- Troubleshooting commands

### For System Verification
**Check**: `RELEASE_VERIFICATION_REPORT.md` (pre-flight checks)
- Keystore verification ✓
- Build configuration status ✓
- Dependency list ✓
- Test results ✓

---

## 📋 Files Provided

| File | Purpose | Audience |
|------|---------|----------|
| **RELEASE_README.md** | This file - your starting point | Everyone |
| **RELEASE_SUMMARY.md** | Project status & quick overview | Leaders, First-time users |
| **QUICK_RELEASE_CHECKLIST.md** | Fast reference checklist | Busy developers |
| **GOOGLE_PLAY_BUILD_GUIDE.md** | Complete technical guide | Detailed explanation |
| **BUILD_COMMANDS_REFERENCE.md** | 30+ useful commands | Command-line users |
| **RELEASE_WORKFLOW_DIAGRAM.md** | Visual flow diagrams | Visual learners |
| **RELEASE_VERIFICATION_REPORT.md** | System status report | Verification |
| **build-release.sh** | Automated build script | Everyone (recommended) |

---

## 🎯 Three Ways to Build

### Method 1: Interactive Script (Recommended ✨)
```bash
./build-release.sh
```
**Best for**: Everyone, handles everything automatically
- Checks prerequisites
- Prompts for build type
- Generates checksums
- Shows next steps

### Method 2: Single Command
```bash
./gradlew clean bundleRelease
```
**Best for**: CI/CD pipelines, automation
**Output**: `app/build/outputs/bundle/release/app-release.aab`

### Method 3: Manual Commands
```bash
./gradlew clean              # Clean old builds
./gradlew bundleRelease      # Build AAB
./gradlew assembleRelease    # Build APK (optional)
```
**Best for**: Understanding each step

---

## 🔐 Pre-Release Verification

Your system is **ready for release**:

✅ **Keystore**: Configured and verified  
✅ **Build Config**: Updated for Google Play compliance  
✅ **Gradle**: All plugins loaded successfully  
✅ **Dependencies**: All critical libraries present  
✅ **Signing**: Release keystore accessible  
✅ **Firebase**: Integration active  

See `RELEASE_VERIFICATION_REPORT.md` for full verification details.

---

## 📦 Current Version Info

```
Package Name: live.airuncoach.airuncoach
Version: 1.9.2 (Code: 31)
Min SDK: 26 (Android 8.0+)
Target SDK: 35 (Android 15+)
```

**To update before release:**

Edit `app/build.gradle.kts`:
```kotlin
defaultConfig {
    versionCode = 32          // ← Increment by 1
    versionName = "1.9.3"     // ← Update version name
}
```

---

## 🚀 Release Workflow

```
1. UPDATE VERSION
   └─ Edit app/build.gradle.kts

2. BUILD
   └─ Run ./build-release.sh

3. VERIFY
   └─ Check app works on device (optional)

4. UPLOAD
   └─ Upload AAB to Play Console

5. CONFIGURE
   └─ Add release notes & metadata

6. DEPLOY
   └─ Start rollout (recommended: 5% → 25% → 100%)

7. MONITOR
   └─ Watch for crashes & user feedback
```

---

## 📊 Build Output

After running the build:

```
app/build/outputs/
├── bundle/release/
│   └── app-release.aab      ← Upload this (50-80 MB)
│
└── apk/release/
    └── app-release.apk      ← Use for testing (70-100 MB)
```

---

## 🎁 What You Get After Build

✓ **Android App Bundle (AAB)**
- Optimized for Play Store distribution
- Google plays stores handles device optimization
- Smaller download for users (30-50 MB)
- Recommended format

✓ **APK (Optional)**
- Direct installation on devices
- Use for testing before release
- Works on Android 8.0+

✓ **Checksums**
- SHA-256 verification
- Verify build integrity
- Saved to `checksums.txt`

---

## 📱 Testing (Optional but Recommended)

Before uploading to Play Store:

```bash
# Install APK on device
adb install -r app/build/outputs/apk/release/app-release.apk

# Or test via Play Store internal testing
# 1. Upload AAB to Internal Testing track
# 2. Share test link with team
# 3. Get feedback before production
```

---

## 🌐 Upload to Google Play Store

1. **Open Play Console**
   - [play.google.com/console](https://play.google.com/console)

2. **Select App**
   - Find "AiRunCoach"

3. **Create Release**
   - Navigate to Release → Production
   - Click "Create New Release"

4. **Upload Build**
   - Click "Browse Files"
   - Select `app-release.aab`
   - Wait for validation (1-2 minutes)

5. **Add Release Notes**
   - Describe what's new
   - List bug fixes
   - Mention improvements

6. **Review Content**
   - Screenshots (if updated)
   - Description (if updated)
   - Privacy policy URL

7. **Deploy**
   - Click "Review Release"
   - Click "Start Rollout"
   - Choose 5% initial rollout (recommended)

8. **Monitor**
   - Check crash reports daily
   - Expand to 25% after 24-48 hours
   - Expand to 100% after 3-7 days (if stable)

---

## ⚠️ Important Notes

### Version Code
- **Must increase** for every release
- Cannot reuse (Play Store rejects it)
- Current: 31 → Next: 32, 33, etc.

### Keystore Security
- Never share keystore file
- Never commit `local.properties`
- Keep backup in secure location
- Losing keystore = cannot update app

### Signing
- Release builds are automatically signed
- Uses credentials from `local.properties`
- Keystore valid until 2053 ✓

### Play Store Compliance
- Target SDK >= 35 ✓ (Google Play requirement)
- Privacy policy required ✓
- Content rating required ✓
- Permissions must be justified ✓

---

## 🆘 Troubleshooting

### Build Won't Start
```bash
# Check if local.properties exists
cat local.properties

# Verify keystore
ls -la /Users/danieljohnston/ai-run-coach-release.keystore

# Fix: See GOOGLE_PLAY_BUILD_GUIDE.md → Troubleshooting
```

### Upload Fails
- Ensure version code is new (not duplicate)
- Check app is set up in Play Console
- Verify package name matches

### App Crashes After Release
- Check Firebase Crashlytics
- Prepare hotfix (new version code)
- Pause rollout while fixing

### More Issues?
See `GOOGLE_PLAY_BUILD_GUIDE.md` → Troubleshooting section (20+ solutions)

---

## 📞 Support

### Questions?
1. Check `QUICK_RELEASE_CHECKLIST.md` for common issues
2. See `GOOGLE_PLAY_BUILD_GUIDE.md` for detailed explanations
3. Look up command in `BUILD_COMMANDS_REFERENCE.md`
4. View workflow in `RELEASE_WORKFLOW_DIAGRAM.md`

### External Resources
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [Firebase Documentation](https://firebase.google.com/docs)

---

## 🎯 Success Checklist

- [ ] Read QUICK_RELEASE_CHECKLIST.md
- [ ] Version updated in app/build.gradle.kts
- [ ] Run ./build-release.sh
- [ ] Got app-release.aab
- [ ] Tested on device (optional)
- [ ] Uploaded to Play Console
- [ ] Added release notes
- [ ] Started initial rollout (5%)
- [ ] Monitored for crashes
- [ ] Expanded to 100% (if stable)
- [ ] Celebration 🎉

---

## 📅 Release Timeline

- **Preparation**: 5-10 minutes
- **Build**: 2-5 minutes
- **Testing**: 5-10 minutes (optional)
- **Upload**: 5-10 minutes
- **Configuration**: 5 minutes
- **Deployment**: 1 minute
- **Monitoring**: Ongoing (1-7 days for full rollout)

**Total initial release**: 30-50 minutes (most is waiting)

---

## 🎊 You're All Set!

Everything is configured and ready to go. 

### Next Action
```bash
./build-release.sh
```

Follow the prompts and you'll have a production-ready build in minutes!

---

## 📝 Version History

Keep track of your releases:

| Version | Code | Date | Status |
|---------|------|------|--------|
| 1.9.2 | 31 | Jul 18, 2026 | ✓ Current |
| 1.9.3 | 32 | — | Next |

Update this table after each release.

---

**Setup Date**: July 18, 2026  
**Status**: ✅ Ready for Production  
**Maintainer**: [Your Name]

---

## Quick Links

- [Google Play Console](https://play.google.com/console)
- [Firebase Console](https://console.firebase.google.com)
- [Android Developer Docs](https://developer.android.com)
- Full Build Guide: `GOOGLE_PLAY_BUILD_GUIDE.md`
- Command Reference: `BUILD_COMMANDS_REFERENCE.md`
- Visual Workflow: `RELEASE_WORKFLOW_DIAGRAM.md`

---

## Execute

```bash
# You're ready! Run this:
./build-release.sh
```

That's it! The script handles everything else.
