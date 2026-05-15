# 🚀 AI Run Coach — Google Play Store Publishing Guide

## Quick Summary of What's Been Set Up

- ✅ `build.gradle.kts` updated with `signingConfigs` block
- ✅ `versionCode = 2`, `versionName = "1.1.0"` set
- ✅ `isMinifyEnabled = true` + `isShrinkResources = true` for smaller APK
- ✅ `local.properties` has credential placeholders
- ✅ `local.properties` + `*.keystore` already in `.gitignore`

---

## Step 1: Create Your Release Keystore (ONE TIME ONLY)

Run this in Terminal. **Keep the output file and passwords safe forever.**

```bash
keytool -genkey -v \
  -keystore ~/ai-run-coach-release.keystore \
  -alias airuncoach \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You'll be asked:
- Enter keystore password: **choose a strong password, save it**
- Re-enter keystore password: confirm
- First and last name: `Daniel Johnston`
- Organisational unit: `AI Run Coach`
- Organisation: `AI Run Coach`
- City: your city
- State: your state/county
- Country code: `GB`
- Is `CN=Daniel Johnston, OU=AI Run Coach...` correct? → `yes`
- Enter key password: **same password or different — save it**

✅ This creates `~/ai-run-coach-release.keystore`

> ⚠️ **Back this file up to iCloud / password manager. Losing it means you can never update the app.**

---

## Step 2: Fill in `local.properties`

Open `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/local.properties` and replace the placeholder values:

```properties
KEYSTORE_PATH=/Users/danieljohnston/ai-run-coach-release.keystore
KEYSTORE_PASSWORD=<your_keystore_password>
KEY_ALIAS=airuncoach
KEY_PASSWORD=<your_key_password>
```

---

## Step 3: Build the Release AAB

Google Play requires an **AAB** (Android App Bundle), not an APK.

```bash
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach

./gradlew bundleRelease
```

The output will be at:
```
app/build/outputs/bundle/release/app-release.aab
```

> If you get a signing error, double-check the paths/passwords in `local.properties`.

---

## Step 4: Set Up Google Play Console (One Time)

### 4.1 Create Developer Account

1. Go to: [play.google.com/console](https://play.google.com/console)
2. Sign in with a Google account
3. Pay the **one-time $25 registration fee**
4. Fill in account details

### 4.2 Create the App

1. Click **"Create app"**
2. App name: `AI Run Coach`
3. Default language: `English (United Kingdom)`
4. App or game: `App`
5. Free or paid: your choice
6. Confirm policies → **Create app**

---

## Step 5: Fill in Play Store Listing

In Play Console → your app → **Store presence → Main store listing**

### Required Fields

| Field | Value |
|-------|-------|
| **App name** | AI Run Coach |
| **Short description** | AI-powered real-time running coach with Garmin watch support |
| **Full description** | 4000 chars max — describe features, benefits, supported devices |
| **App icon** | 512 × 512 PNG, no alpha |
| **Feature graphic** | 1024 × 500 PNG or JPG |
| **Screenshots** | Minimum 2 phone screenshots (16:9 or 9:16) |
| **Category** | Health & Fitness |
| **Contact email** | your support email |
| **Privacy policy URL** | required — link to your privacy policy page |

### Screenshots (required)
- Minimum 2, maximum 8 phone screenshots
- Recommended size: 1080 × 1920 px (portrait)
- Take them on a real device or emulator

---

## Step 6: Fill in Required Declarations

### Content Rating
1. Play Console → **Policy → App content → Content rating**
2. Start questionnaire → Category: **Utilities**
3. Answer all questions (AI Run Coach has no violence/adult content)
4. Submit → rating will be assigned (likely PEGI 3 / Everyone)

### Privacy Policy
1. Play Console → **Policy → App content → Privacy policy**
2. Enter your privacy policy URL (you have one at airuncoach.live)

### Target Audience
1. Play Console → **Policy → App content → Target audience and content**
2. Select: **18 and older** (health/fitness app)

### Permissions Declaration
The app uses:
- **Location** (GPS tracking) — required for core functionality
- **Activity Recognition** (step counting) — required for cadence
- **Body Sensors** (heart rate) — if using phone HR sensor
- **Bluetooth** (Garmin watch) — for watch connectivity

Declare these in the **Sensitive permissions** section.

### Health Connect
1. Play Console → **Policy → App content → Health Connect**
2. Declare you use Health Connect for: sleep, activity, heart rate data
3. Upload a short video or description of how it's used

---

## Step 7: Upload the AAB

1. Play Console → **Release → Testing → Internal testing** (start here first!)
2. Click **"Create new release"**
3. Click **"Upload"** → select `app/build/outputs/bundle/release/app-release.aab`
4. Add release notes (what's new in this version)
5. Click **"Save"** → **"Review release"** → **"Start rollout to Internal testing"**

### Release Notes Template
```
Version 1.1.0 — May 2026

• Fixed Garmin watch app authentication — watch now connects reliably
• Pace display now shows correctly when stationary
• Improved Garmin Connect IQ logo on Connected Devices screen
• Performance improvements and bug fixes
```

---

## Step 8: Test with Internal Testing First

1. Share the internal testing link with yourself and testers
2. Install via the Play Store link (not sideloading)
3. Test all core flows:
   - ✅ Login / register
   - ✅ GPS tracking
   - ✅ Run session start/pause/stop
   - ✅ Garmin watch connection
   - ✅ Run summary

---

## Step 9: Promote to Production

Once internal testing passes:

1. Play Console → **Release → Production**
2. **"Create new release"** → select the same AAB
3. Set rollout percentage: start at **10–20%** for safety
4. Add release notes → **Review** → **Rollout**

Google review typically takes **1–3 days** for new apps, less for updates.

---

## Every Future Update — Checklist

Before building a new release:

```kotlin
// In app/build.gradle.kts, always increment these:
versionCode = 3          // Must be higher than previous (Play Store rejects duplicates)
versionName = "1.2.0"   // Human-readable for users
```

Then:
```bash
./gradlew bundleRelease
# Upload app/build/outputs/bundle/release/app-release.aab to Play Console
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `KEYSTORE_PATH not found` | Check path in `local.properties` — must be absolute |
| `wrong password` error | Verify KEYSTORE_PASSWORD and KEY_PASSWORD are correct |
| `versionCode must be higher` | Increment `versionCode` in `build.gradle.kts` |
| `unsigned bundle` | Ensure `signingConfig = signingConfigs.getByName("release")` is in release block |
| `minification broke the app` | Add keep rules to `proguard-rules.pro` (see below) |

### Proguard keep rules for Retrofit/Garmin

Add to `app/proguard-rules.pro` if you see crashes after enabling minification:

```proguard
# Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keep interface retrofit2.** { *; }

# Gson
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Your data models (keep all for safety)
-keep class live.airuncoach.airuncoach.domain.model.** { *; }
-keep class live.airuncoach.airuncoach.network.model.** { *; }

# Garmin ConnectIQ
-keep class com.garmin.** { *; }
```

---

## File Locations Summary

| File | Purpose |
|------|---------|
| `~/ai-run-coach-release.keystore` | Your signing key — back this up! |
| `local.properties` | Keystore credentials — never commit |
| `app/build.gradle.kts` | Build config — signing config lives here |
| `app/build/outputs/bundle/release/app-release.aab` | Upload this to Play Store |
| `app/proguard-rules.pro` | Code shrinking rules |

---

## Status

- ✅ `build.gradle.kts` configured with signing
- ✅ `local.properties` has credential placeholders
- ⏳ **You need to**: run `keytool` to create keystore
- ⏳ **You need to**: fill passwords into `local.properties`
- ⏳ **You need to**: run `./gradlew bundleRelease`
- ⏳ **You need to**: create Play Console app listing
- ⏳ **You need to**: upload AAB and submit for review

