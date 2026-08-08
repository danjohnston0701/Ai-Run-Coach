# Google Play Store Build - v2.0.5

**Build Date**: Sunday, August 9, 2026 @ 07:19 UTC+12  
**Build Status**: ✅ **SUCCESSFUL**

---

## Build Details

### Version Information
- **Version Code**: 47
- **Version Name**: 2.0.5
- **Target SDK**: 36 (Android 15)
- **Min SDK**: 26 (Android 8)
- **App ID**: live.airuncoach.airuncoach

### Build Type
- **Android App Bundle (AAB)** — Recommended format for Google Play Store
- Signed with production release keystore
- Minified and optimized with R8
- Resource shrinking enabled

### Output File
- **Location**: `app/build/outputs/bundle/release/app-release.aab`
- **File Size**: 20 MB
- **Checksum (SHA-256)**: `37e75ba99ff5f6d2b28d6a90502a43b6cbd7df337b5a0a44eadd4971c9f6fc62`

---

## Build Changes Included

### iOS Closing Stages Coaching Fix (commit 281c8db)
- ✅ Pace trend analysis now gated in final 500m
- ✅ Guaranteed final_100m milestone delivery
- ✅ Guaranteed session_complete summary delivery
- ✅ Three-part post-processing enforcement

**Note**: This fix was made in backend (ai-service.ts). Android app doesn't need changes for this—it's automatically served by the API.

---

## Next Steps for Google Play Release

### 1. Upload to Google Play Console
```bash
# Use Google Play Console web interface or bundletool:
# https://developer.android.com/studio/command-line/bundletool
bundletool upload-bundle --bundle=app-release.aab --changes-note="Coaching improvements"
```

### 2. Create Release in Play Console
- Navigate to: Google Play Console > Your App > Release > Production
- Click "Create new release"
- Upload the AAB file
- Add release notes (e.g., "Improved closing stages coaching experience")
- Review app content and pricing

### 3. Start Staged Rollout (Recommended)
- Begin with **5% rollout** (monitors for crashes/issues)
- After 24-48 hours, increase to **25%** if metrics are good
- After another 24-48 hours, roll out to **100%**

### 4. Monitor Metrics
Watch for:
- Crash rate (target: <0.1%)
- ANR rate (target: <0.1%)
- User ratings (should remain stable or improve)
- Installation failures (target: <0.5%)

---

## Verification

### Integrity Check
```bash
# Verify the AAB signature
cd app/build/outputs/bundle/release/
jarsigner -verify app-release.aab
```

### Size Analysis
```bash
# Analyze APK sizes per architecture
bundletool build-apks \
  --bundle=app-release.aab \
  --output=app-release.apks \
  --ks=KEYSTORE_PATH \
  --ks-pass=pass:PASSWORD

bundletool get-size total --apks=app-release.apks
```

---

## Build Environment

| Component | Version |
|-----------|---------|
| **Gradle** | 9.1.0 |
| **Android Gradle Plugin** | 8.x |
| **Kotlin** | 2.0+ |
| **Compile SDK** | 36 |
| **Java Target** | 17 |

---

## What's New in v2.0.5

### Features
- Closing stages coaching experience improved (backend-driven)
- Fixed mandatory milestone delivery for all runs

### Improvements
- Better handling of edge cases in workout completion
- More reliable session state tracking

### Fixes
- Post-processing gates prevent unwanted coaching prompts in final 500m
- Mandatory injection ensures final_100m and session_complete always fire

---

## Archive & Record

**Build Artifact**: `app-release.aab` (20 MB)  
**SHA-256**: `37e75ba99ff5f6d2b28d6a90502a43b6cbd7df337b5a0a44eadd4971c9f6fc62`  
**Build Time**: 17 minutes 37 seconds  
**Status**: Ready for Play Store submission ✅

---

## Support

For issues or questions about this build:
1. Check Play Console crash metrics
2. Review user feedback and ratings
3. Check server logs for API errors
4. Monitor coaching event logs for trigger issues

---

**Ready to upload! 🚀**
