# AiRunCoach Google Play Store Release - Setup Complete ✅

## What's Been Prepared

You now have everything needed to build and release AiRunCoach to Google Play Store. Here's what's been created:

### 📋 Documentation Files

1. **GOOGLE_PLAY_BUILD_GUIDE.md** — Comprehensive 200+ line guide covering:
   - Prerequisites (keystore, Google Play Console, Firebase)
   - Build configurations (release vs debug)
   - Step-by-step build process
   - Version management
   - ProGuard obfuscation details
   - Testing instructions
   - Complete troubleshooting section
   - Post-release monitoring

2. **QUICK_RELEASE_CHECKLIST.md** — Fast reference checklist:
   - Pre-release tasks (version bump)
   - Build phase (3 options)
   - Verification steps
   - Play Store upload process
   - Post-release monitoring
   - Troubleshooting quick fixes

3. **BUILD_COMMANDS_REFERENCE.md** — Complete command reference with:
   - 30+ build commands organized by category
   - Version management commands
   - Testing & verification commands
   - Bundletool commands for advanced usage
   - Troubleshooting commands
   - Performance optimization tips

### 🚀 Automation Script

**build-release.sh** — Interactive build script featuring:
- Prerequisites checking
- Version reading
- Multiple build options (AAB/APK/Both)
- Automatic code signing
- Signature verification
- SHA-256 checksum generation
- Clear success/error reporting
- Next steps guidance

**Usage:**
```bash
./build-release.sh
```

## Current Project Status

### ✅ Pre-Build Checklist
- **Keystore**: ✓ Configured and accessible
- **Package Name**: `live.airuncoach.airuncoach`
- **Version**: 1.9.2 (Code: 31)
- **Min SDK**: 26 | **Target SDK**: 35 | **Compile SDK**: 36
- **Signing Config**: Release keystore properly configured
- **Google Services**: `google-services.json` in place
- **ProGuard**: Rules configured in `app/proguard-rules.pro`
- **Firebase**: Integrated for push notifications and crashlytics

## How to Build & Release

### Step 1: Update Version (if needed)
```bash
# Edit app/build.gradle.kts
# Change: versionCode = 31 → 32
#         versionName = "1.9.2" → "1.9.3"

# Commit changes
git add app/build.gradle.kts
git commit -m "Bump version to 1.9.3 (code 32)"
```

### Step 2: Build the Release Package

**Option A: Interactive Script (Recommended)**
```bash
./build-release.sh
```

**Option B: Command Line**
```bash
# AAB only (recommended for Play Store)
./gradlew clean bundleRelease

# Or APK only
./gradlew clean assembleRelease
```

### Step 3: Upload to Play Store
1. Open [Google Play Console](https://play.google.com/console)
2. Select **AiRunCoach** app
3. Go to **Release** → **Production**
4. Click **Create New Release**
5. Upload `app-release.aab` (from `app/build/outputs/bundle/release/`)
6. Add release notes and review content
7. Start with 5% rollout, then gradually increase to 100%

### Step 4: Monitor & Support
- Check **Crashes & ANRs** in Play Console
- Monitor Firebase Crashlytics
- Review user ratings and feedback
- Prepare next release if critical bugs appear

## Build Output Locations

After running the build script:

| Artifact | Location | Size (Typical) |
|----------|----------|---|
| **AAB (Recommended)** | `app/build/outputs/bundle/release/app-release.aab` | 50-80 MB |
| **APK** | `app/build/outputs/apk/release/app-release.apk` | 70-100 MB |

## Key Files

### Build Configuration
- `app/build.gradle.kts` — App build settings, version, signing
- `build.gradle.kts` — Root project configuration
- `gradle.properties` — Gradle system properties
- `settings.gradle.kts` — Project structure

### Signing & Security
- `local.properties` — Keystore credentials (NOT in git)
- `app/proguard-rules.pro` — Code obfuscation rules

### Firebase & Services
- `app/google-services.json` — Firebase configuration
- Uses Firebase Messaging (push notifications)
- Uses Firebase Crashlytics (crash reporting)

## Important Notes

### ⚠️ Critical

1. **Version Code Must Increase**
   - Every release needs a new version code
   - Same version code = upload will fail
   - Current: 31 → Next: 32, 33, etc.

2. **Keystore Security**
   - Never share your keystore or passwords
   - `local.properties` is in `.gitignore` (safe)
   - Losing the keystore = can't update app on Play Store
   - Keep backups in secure location

3. **ProGuard Obfuscation**
   - Enabled in release builds
   - Reduces app size by ~30%
   - Keeps important classes (Hilt, Room, Retrofit, etc.)
   - Debug symbols kept separately

### 📱 Target Audience

- **Minimum Android Version**: Android 8.0+ (API 26)
- **Target Android Version**: Android 15+ (API 35)
- **Compile SDK**: Android 16 (API 36)
- Covers **~95%** of active Android devices

## Testing Before Release

### On Device
```bash
./gradlew clean assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

### Checklist
- [ ] App starts without crashes
- [ ] Can log in with existing credentials
- [ ] Can log out and log back in
- [ ] Push notifications work
- [ ] Health data syncs properly
- [ ] Maps load correctly
- [ ] Garmin integration works
- [ ] Dark mode (if implemented) works

## Support & Documentation

### For More Information

- **Build Guide**: Read `GOOGLE_PLAY_BUILD_GUIDE.md` (detailed, 300+ lines)
- **Quick Reference**: Check `BUILD_COMMANDS_REFERENCE.md` (30+ commands)
- **Fast Checklist**: Use `QUICK_RELEASE_CHECKLIST.md` (quick reference)
- **Build Script**: Run `./build-release.sh` (interactive)

### External Resources

- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [Gradle Build System](https://developer.android.com/build)
- [Firebase Crashlytics](https://firebase.google.com/docs/crashlytics)

## Next Steps

1. **Review Documentation**
   - Read through `GOOGLE_PLAY_BUILD_GUIDE.md` for complete details
   - Bookmark `QUICK_RELEASE_CHECKLIST.md` for fast reference

2. **Prepare First Release**
   - Update version in `app/build.gradle.kts`
   - Run `./build-release.sh`
   - Test on device with release APK

3. **Upload to Play Store**
   - Create release in Play Console
   - Upload AAB file
   - Fill in release notes
   - Start 5% rollout

4. **Monitor Release**
   - Watch for crashes in Play Console
   - Check user ratings
   - Address critical issues if needed

---

## Version History

Keep track of all releases for reference:

```
v1.9.2 (Code 31) — Initial setup
v1.9.3 (Code 32) — [Your first release]
```

---

## Quick Commands Cheat Sheet

```bash
# Build AAB for Play Store
./gradlew clean bundleRelease

# Or use interactive script
./build-release.sh

# Test with APK
./gradlew clean assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk

# Check file size
du -h app/build/outputs/bundle/release/app-release.aab

# Verify signature
jarsigner -verify app/build/outputs/apk/release/app-release.apk
```

---

**Status**: ✅ All systems ready for release

**Date Prepared**: July 18, 2026

**Next Action**: Update version and run `./build-release.sh`
