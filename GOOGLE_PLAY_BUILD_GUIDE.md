# Google Play Store Release Build Guide

This guide walks through the complete process of building and uploading an **AiRunCoach** release package to Google Play Store.

## Quick Start

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
./gradlew clean bundleRelease
```

The resulting AAB (Android App Bundle) will be located at:
```
app/build/outputs/bundle/release/app-release.aab
```

---

## Prerequisites

### 1. **Keystore Setup**
Ensure your release keystore is configured in `local.properties`:

```properties
# local.properties (never commit this file!)
KEYSTORE_PATH=/path/to/your/release.keystore
KEYSTORE_PASSWORD=your_keystore_password
KEY_ALIAS=your_key_alias
KEY_PASSWORD=your_key_password
```

**Generate a new keystore if needed:**
```bash
keytool -genkey -v -keystore release.keystore -keyalg RSA -keysize 2048 -validity 10000 \
  -alias airuncoach_key -storepass YOUR_STORE_PASS -keypass YOUR_KEY_PASS \
  -dname "CN=Your Name, O=Your Organization, C=US"
```

### 2. **Google Play Console Account**
- Set up at [Google Play Console](https://play.google.com/console)
- Create the app listing (if not already created)
- Ensure the **Bundle ID** matches: `live.airuncoach.airuncoach`

### 3. **Firebase & Google Services**
The `google-services.json` file is already in place:
```
app/google-services.json
```

If you need to regenerate it:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Add Android app with package `live.airuncoach.airuncoach`
4. Download the updated `google-services.json`

### 4. **Picovoice Access Key** (Optional for voice features)
If using wake word detection, add to `local.properties`:
```properties
PICOVOICE_ACCESS_KEY=your_access_key
```

---

## Build Configurations

The app currently has **two build variants**:

### **Release (Production)**
- **API Base URL**: `https://airuncoach.live`
- **Min SDK**: 26, **Target SDK**: 35
- **Code Minification**: Enabled (ProGuard)
- **Signing**: Release keystore from `local.properties`

### **Debug (Development)**
- **API Base URL**: `http://10.0.2.2:3000` (Android emulator localhost)
- **Minification**: Disabled
- **Signing**: Debug keystore

**Current Version Info:**
```
Version Code: 31
Version Name: 1.9.2
```

---

## Step-by-Step Build Process

### Step 1: Clean Build Cache
```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
./gradlew clean
```

### Step 2: Build Release Bundle (Recommended for Play Store)

**AAB (Android App Bundle)** — Smaller, optimized for Play Store:
```bash
./gradlew bundleRelease
```

**APK (Full Package)** — For direct installation or distribution:
```bash
./gradlew assembleRelease
```

**Both:**
```bash
./gradlew clean bundleRelease assembleRelease
```

### Step 3: Verify Build Artifacts

**Bundle location:**
```
app/build/outputs/bundle/release/app-release.aab
```

**APK locations:**
```
app/build/outputs/apk/release/app-release.apk
```

### Step 4: Check Build Size
```bash
# AAB file size
du -h app/build/outputs/bundle/release/app-release.aab

# APK file size
du -h app/build/outputs/apk/release/app-release.apk
```

---

## Version Management

Before building a new release, **increment the version**:

### Edit `app/build.gradle.kts`:

```kotlin
defaultConfig {
    versionCode = 32          // ← Increment by 1 for every release
    versionName = "1.9.3"     // ← Update semantic version
}
```

**Commit the version change:**
```bash
git add app/build.gradle.kts
git commit -m "Bump version to 1.9.3 (code 32)"
```

---

## Upload to Google Play Store

### Method 1: Google Play Console (Recommended)

1. Go to [Google Play Console](https://play.google.com/console)
2. Select **AiRunCoach** app
3. Navigate to **Release** → **Internal Testing** or **Production**
4. Click **Create New Release**
5. Upload the **AAB file** (`app-release.aab`)
6. Review app details:
   - ✅ Screenshots
   - ✅ Description
   - ✅ Release notes
   - ✅ Privacy policy URL
   - ✅ Category & Content rating
7. Click **Review Release** → **Start Rollout to Production**

### Method 2: Command Line (Advanced)

```bash
# Install bundletool
brew install bundletool

# Generate APKs from AAB
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-release.apks \
  --mode=universal

# Install on connected device (for testing)
bundletool install-apks \
  --apks=app-release.apks \
  --device-id=YOUR_DEVICE_ID
```

---

## Code Signing Details

The release build automatically applies signing from `local.properties`:

```kotlin
signingConfigs {
    create("release") {
        storeFile     = file(localProp("KEYSTORE_PATH"))
        storePassword = localProp("KEYSTORE_PASSWORD")
        keyAlias      = localProp("KEY_ALIAS")
        keyPassword   = localProp("KEY_PASSWORD")
    }
}
```

**Verify signing:**
```bash
jarsigner -verify -verbose app/build/outputs/apk/release/app-release.apk
```

---

## ProGuard / R8 Obfuscation

Release builds apply code shrinking & obfuscation rules:

**Config file:** `app/proguard-rules.pro`

Rules preserve important classes (Retrofit, Hilt, Room, etc.):

```proguard
# Keep app classes
-keep class live.airuncoach.airuncoach.** { *; }

# Keep Hilt & Dagger
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }

# Keep Retrofit
-keep interface retrofit2.** { *; }
-keep class com.google.gson.** { *; }

# Keep Room Database
-keep class androidx.room.** { *; }
-keep @androidx.room.Entity class * { *; }

# Keep serializable classes
-keepclassmembers class * implements java.io.Serializable { *; }
```

---

## Troubleshooting

### Build Fails: "Keystore not found"
```bash
# Check keystore path in local.properties
cat local.properties | grep KEYSTORE_PATH

# Verify file exists
ls -la /path/to/release.keystore
```

### Build Fails: "Picovoice AccessKey not set"
Either:
1. **Add to `local.properties`:**
   ```properties
   PICOVOICE_ACCESS_KEY=your_key
   ```
2. **Or disable Picovoice dependency** (if not needed)

### AAB Upload Fails: "Version code already exists"
Increment `versionCode` in `app/build.gradle.kts` and rebuild.

### ProGuard Issues: "Class/method not found"
Add to `app/proguard-rules.pro`:
```proguard
-keep class com.example.** { *; }
```

---

## Testing the Release Build

### On Android Device:

```bash
# Install APK directly
adb install -r app/build/outputs/apk/release/app-release.apk

# Or use bundletool for AAB
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-release.apks \
  --connected-device

bundletool install-apks --apks=app-release.apks
```

### On Emulator (requires universal APK):

```bash
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-release.apks \
  --mode=universal

adb install -r app-release.apks
```

---

## Play Store Release Checklist

- [ ] Version code incremented in `app/build.gradle.kts`
- [ ] Version name updated (semantic versioning)
- [ ] `local.properties` configured with signing credentials
- [ ] `google-services.json` is up-to-date
- [ ] Build completes without errors: `./gradlew bundleRelease`
- [ ] AAB file is generated: `app/build/outputs/bundle/release/app-release.aab`
- [ ] Release notes prepared
- [ ] Screenshots & graphics updated (if needed)
- [ ] Privacy policy URL verified
- [ ] App tested on real device with release APK
- [ ] All required Play Store fields filled
- [ ] AAB uploaded to Play Console
- [ ] Release reviewed and approved
- [ ] Rollout initiated (staged rollout recommended)

---

## Post-Release

1. **Monitor Crashes:**
   - Check Google Play Console → **Crashes & ANRs**
   - Monitor Firebase Crashlytics

2. **Track User Reviews:**
   - Play Console → **Ratings**
   - Address critical issues in next release

3. **Update Documentation:**
   - Document any breaking changes
   - Update release notes for future builds

---

## Additional Resources

- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [Gradle Build System](https://developer.android.com/build)
- [ProGuard Configuration](https://developer.android.com/build/shrink-code)
