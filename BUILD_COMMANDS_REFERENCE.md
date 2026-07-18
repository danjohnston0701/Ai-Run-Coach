# Build Commands Reference

## Project Information
- **App Package Name**: `live.airuncoach.airuncoach`
- **Current Version Code**: 31
- **Current Version Name**: 1.9.2
- **Min SDK**: 26
- **Target SDK**: 35
- **Compile SDK**: 36

## Quick Commands

### 🏗️ Building

#### Build Release Bundle (Recommended)
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
./gradlew bundleRelease
```
**Output:** `app/build/outputs/bundle/release/app-release.aab`

#### Build Release APK
```bash
./gradlew assembleRelease
```
**Output:** `app/build/outputs/apk/release/app-release.apk`

#### Build Both
```bash
./gradlew clean bundleRelease assembleRelease
```

#### Using the Interactive Script
```bash
./build-release.sh
```
*Will prompt you to choose build type and handle the process*

### 🧹 Cleaning

#### Clean Build Cache
```bash
./gradlew clean
```

#### Deep Clean (Remove node_modules)
```bash
./gradlew clean
rm -rf node_modules
npm install
```

### 📦 Checking Build Size

#### AAB Size
```bash
du -h app/build/outputs/bundle/release/app-release.aab
```

#### APK Size
```bash
du -h app/build/outputs/apk/release/app-release.apk
```

#### Build Report
```bash
./gradlew bundleRelease --scan
# Opens detailed build report in browser
```

### ✅ Verification

#### Verify APK Signature
```bash
jarsigner -verify -verbose app/build/outputs/apk/release/app-release.apk
```

#### Check SHA-256 Checksum
```bash
# AAB
shasum -a 256 app/build/outputs/bundle/release/app-release.aab

# APK
shasum -a 256 app/build/outputs/apk/release/app-release.apk
```

### 📱 Installation & Testing

#### Install on Connected Device
```bash
# Install APK directly
adb install -r app/build/outputs/apk/release/app-release.apk

# Or uninstall first, then install
adb uninstall live.airuncoach.airuncoach
adb install app/build/outputs/apk/release/app-release.apk
```

#### Install on Emulator (from AAB)
```bash
# First, install bundletool
brew install bundletool

# Generate universal APK from AAB
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-release.apks \
  --mode=universal

# Install on emulator
adb install -r app-release.apks
```

#### Launch App After Install
```bash
adb shell am start -n live.airuncoach.airuncoach/.MainActivity
```

#### Check Installed App Version
```bash
adb shell dumpsys package live.airuncoach.airuncoach | grep versionName
```

### 🔧 Version Management

#### View Current Version
```bash
grep -E "versionCode|versionName" app/build.gradle.kts
```

#### Update Version Code
```bash
# Edit app/build.gradle.kts
# Find: versionCode = 31
# Change to: versionCode = 32

# Or use sed to auto-increment:
sed -i '' 's/versionCode = [0-9]*/versionCode = 32/' app/build.gradle.kts
```

#### Update Version Name
```bash
# Edit app/build.gradle.kts
# Find: versionName = "1.9.2"
# Change to: versionName = "1.9.3"

# Or use sed:
sed -i '' 's/versionName = "[^"]*"/versionName = "1.9.3"/' app/build.gradle.kts
```

### 🔍 Debugging & Logs

#### View Build Logs
```bash
# Verbose output
./gradlew bundleRelease --info

# Very verbose
./gradlew bundleRelease --debug
```

#### Check Gradle Properties
```bash
./gradlew properties | grep -E "version|compile"
```

#### View Signing Config
```bash
./gradlew signingReport
```

### 🎯 Testing Commands

#### Run Unit Tests
```bash
./gradlew test
```

#### Run Android Tests (instrumentation)
```bash
./gradlew connectedAndroidTest
```

#### Run All Tests
```bash
./gradlew test connectedAndroidTest
```

#### Build with Tests
```bash
./gradlew bundleRelease -x test  # Skip tests
./gradlew bundleRelease  # Run tests before build
```

### 🚀 Upload & Distribution

#### Using bundletool (Advanced)
```bash
# Install bundletool
brew install bundletool

# Verify AAB
bundletool validate --bundle=app/build/outputs/bundle/release/app-release.aab

# Generate APKs for all devices
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-release.apks \
  --ks=/path/to/release.keystore \
  --ks-pass=pass:KEYSTORE_PASSWORD \
  --ks-key-alias=KEY_ALIAS \
  --key-pass=pass:KEY_PASSWORD

# Install on connected device
bundletool install-apks --apks=app-release.apks
```

### 📊 Analytics & Monitoring

#### Check Play Store Console
```bash
# Open in browser
open https://play.google.com/console/u/0/developers
```

#### Monitor Firebase Crashlytics
```bash
# Open Firebase Console
open https://console.firebase.google.com
```

#### View Release Notes
```bash
# Show git log for release notes
git log --oneline -n 10
```

## Build Configuration Files

### Main Configuration Files
- **App Build Config**: `app/build.gradle.kts`
- **Root Build Config**: `build.gradle.kts`
- **Signing Credentials**: `local.properties` (not in git)
- **ProGuard Rules**: `app/proguard-rules.pro`
- **Google Services**: `app/google-services.json`

### Important Environment Variables
```bash
# From local.properties
export KEYSTORE_PATH="/path/to/release.keystore"
export KEYSTORE_PASSWORD="your_password"
export KEY_ALIAS="airuncoach_key"
export KEY_PASSWORD="your_key_password"
export PICOVOICE_ACCESS_KEY="your_access_key"
```

## Troubleshooting Commands

### Clear Gradle Cache
```bash
rm -rf ~/.gradle
./gradlew clean
```

### Verify Keystore Exists
```bash
ls -la $(grep KEYSTORE_PATH local.properties | cut -d'=' -f2)
```

### Check SDK Installation
```bash
# List installed SDKs
${ANDROID_HOME}/tools/bin/sdkmanager --list

# List available SDK versions
${ANDROID_HOME}/tools/bin/sdkmanager --list_installed
```

### Validate Android Environment
```bash
echo "ANDROID_HOME: $ANDROID_HOME"
echo "JAVA_HOME: $JAVA_HOME"
which java
which kotlin
which gradle
```

### Fix Common Issues

**Issue: "Gradle sync failed"**
```bash
./gradlew --refresh-dependencies
```

**Issue: "Build fails with memory error"**
```bash
# Increase Gradle heap
export GRADLE_OPTS="-Xmx2048m -Xms512m"
./gradlew bundleRelease
```

**Issue: "Cannot find symbol" after clean build**
```bash
# Clear KSP (Kotlin Symbol Processing) cache
rm -rf app/build/kspCaches
./gradlew clean bundleRelease
```

## One-Liner Quick Builds

### Build, Test, and Verify
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach && \
./gradlew clean bundleRelease && \
ls -lh app/build/outputs/bundle/release/app-release.aab && \
echo "✓ Build complete!" || echo "✗ Build failed!"
```

### Full Release Workflow (Script)
```bash
#!/bin/bash
PROJECT_DIR="/Users/danieljohnston/AndroidStudioProjects/AiRunCoach"
cd "$PROJECT_DIR"
echo "Building release..."
./gradlew clean bundleRelease
AAB="$PROJECT_DIR/app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB" ]; then
    SIZE=$(du -h "$AAB" | cut -f1)
    CHECKSUM=$(shasum -a 256 "$AAB" | awk '{print $1}')
    echo "✓ Build successful!"
    echo "  File: $AAB"
    echo "  Size: $SIZE"
    echo "  SHA-256: $CHECKSUM"
    echo ""
    echo "Ready for upload to Play Store"
else
    echo "✗ Build failed!"
    exit 1
fi
```

## Performance Tips

### Speed Up Builds
```bash
# Enable parallel compilation
./gradlew bundleRelease --parallel

# Use daemon (faster rebuilds)
./gradlew --daemon bundleRelease

# Configure gradle.properties for faster builds
echo "org.gradle.parallel=true" >> gradle.properties
echo "org.gradle.workers.max=$(nproc)" >> gradle.properties
echo "org.gradle.caching=true" >> gradle.properties
```

### Reduce APK/AAB Size
```bash
# Check what's taking space
./gradlew bundleRelease --info 2>&1 | grep -i "shrink\|minify"

# Analyze bundle
bundletool analyze-bundle --bundle=app/build/outputs/bundle/release/app-release.aab
```
