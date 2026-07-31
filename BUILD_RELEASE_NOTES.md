# AI Run Coach — Google Play Store Release Bundle

## Build Information

**Build Date:** July 29, 2026  
**Build Status:** ✅ **SUCCESS**

### Version Details
- **Version Code:** 41
- **Version Name:** 2.0.1
- **Min SDK:** 26
- **Target SDK:** 36 (Google Play requirement as of Aug 2026)
- **Namespace:** `live.airuncoach.airuncoach`

### Build Artifact
- **Type:** Android App Bundle (AAB)
- **Size:** 20 MB
- **Location:** `app/build/outputs/bundle/release/app-release.aab`
- **File Type:** Zip archive (deflate compression)

### Code Signing
- **Signing Config:** Release (Production)
- **Key Alias:** Configured in `local.properties`
- **Keystore:** `/Users/danieljohnston/ai-run-coach-release.keystore`
- **Status:** ✅ Signed and verified

### Checksums
- **SHA-256:** `d63f217a2dc54f4dfb1b4500caaac9300592f4cd52d36d4b88373476a605c9cc`

## Key Features in This Release

### New Features
- **Power Saver Mode Detection** — Detects when Android's power saver mode throttles GPS (1Hz → 0.1Hz) and shows a warning banner during runs
- **Battery Optimization Exemption Request** — Prompts users to exempt the app from battery optimizations before run start (critical for GPS accuracy)
- **Walking Activity Type Support** — Full support for walking mode alongside running, with dynamic UI labels ("CONFIGURE YOUR WALK", "START WALK", etc.)
- **Cadence Sensor Data** — Charts now prefer dedicated cadence sensor data from watches/bands over GPS-derived cadence for accuracy
- **Activity History Branding** — Updated all references from "Run History" to "Activity History" to reflect both running and walking

### Bug Fixes
- **Scroll Fix: Configure Your Run Screen** — Fixed scroll blocking when Target Time or Group Run sections were expanded, preventing users from seeing all options and the Prepare Run button
  - Changed nested `LazyColumn` (in friends list) to regular `Column` to eliminate Compose scroll conflict
  - Increased `contentPadding` from 40dp to 140dp to ensure full scroll clearance above the fixed CTA button
  - Users can now scroll past Target Time expansion and Group Run selection to see all content

### Technical Improvements
- Broadcast receiver for live power saver mode monitoring during runs
- Real-time UI updates when power saver status changes mid-run
- Telemetry flag (`powerSaverModeDetected`) logged on run upload for post-analysis
- Enhanced battery profile detection (API 21+)

## Next Steps for Play Store Upload

1. **Go to Google Play Console**
   - Navigate to AI Run Coach app
   - Select "Create new release"

2. **Upload the AAB**
   - Upload `app/build/outputs/bundle/release/app-release.aab`
   - Google Play will automatically generate optimized APKs for all device configurations

3. **Review Release Notes**
   - Version: 2.0.0 (Code 40)
   - Add release notes highlighting new features and bug fixes

4. **Test Build**
   - Use internal testing track to QA on real devices
   - Verify power saver detection works
   - Test scroll fix on smaller phones (Target Time + Group Run expanded)

5. **Staged Rollout** (Recommended)
   - 5% rollout first (5% of users)
   - Monitor crash reports and reviews
   - Expand to 25%, then 100% over 24-48 hours

## Build Configuration

### Release Build Settings
- **Code Shrinking:** Enabled (R8/ProGuard)
- **Resource Shrinking:** Enabled (removes unused resources)
- **Obfuscation:** Enabled
- **Base URL:** `https://airuncoach.live` (production backend)

### Compilation Settings
- **Java Source/Target:** JDK 17
- **Kotlin JVM Target:** 17
- **Compose:** Enabled (multi-platform support)

## Build Command Reference

```bash
# To rebuild this release
./gradlew clean bundleRelease

# To build APK instead (for direct installation)
./gradlew assembleRelease

# To verify signing
jarsigner -verify -verbose app/build/outputs/bundle/release/app-release.aab
```

## Important Notes

⚠️ **Version Code:** Incremented to 41 (40 was previously used). Each Play Store upload requires a higher version code.

⚠️ **Signing Credentials:** Credentials are stored in `local.properties` (never committed to version control). Ensure keystore is secured.

⚠️ **API Keys:** Google Maps and Picovoice Access Key must be set in `local.properties` for the release build to compile.

✅ **All Lint Warnings:** Addressed (Kotlin annotation targets, deprecated APIs, etc.)

✅ **ProGuard Rules:** Custom rules in place to preserve Hilt, Kotlin serialization, and critical libraries

---

**Built with:** Gradle 9.1.0, Android Gradle Plugin 8.x, Kotlin 2.0.0+

**For support:** Contact dev team or review Android Studio Gradle console output for detailed build logs.
