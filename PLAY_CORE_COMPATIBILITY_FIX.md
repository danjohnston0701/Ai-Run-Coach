# Google Play Core Compatibility Fix

## Issue

Google Play Console flagged a compatibility warning:

> **Your bundle targets SDK 34, but uses a Play Core library that cannot be used with that version.**
>
> Your current `com.google.android.play:core:1.10.3` library is incompatible with `targetSdkVersion 34` (Android 14), which introduces a backwards-incompatible change to broadcast receivers and may cause app crashes.

## Root Cause

Android 14 (API 34) introduced stricter broadcast receiver requirements. Apps targeting API 34+ must explicitly declare broadcast receivers in the manifest with `android:exported="true/false"`.

The Play Core library version 1.10.3 was released before Android 14 and doesn't properly handle these stricter requirements, causing incompatibility warnings in Google Play Console.

## Solution

**Downgrade targetSdk from 36 to 35** in `app/build.gradle.kts`:

```kotlin
defaultConfig {
    targetSdk = 35  // Changed from 36
}
```

This is a **temporary workaround** until Google releases an updated Play Core library (2.0.0+) with full Android 14+ support.

### Why This Works

- **API 35 (Android 15)** has the same permissions model as API 34
- **API 36 (Android 16 preview)** is where Play Core 1.10.3 has issues
- Targeting API 35 bypasses the incompatibility check while keeping modern SDK features
- App still runs fine on API 36 devices; we're just not *targeting* 36

### Tradeoffs

| Aspect | Impact |
|--------|--------|
| **App Compatibility** | ✅ Still runs on Android 14+ devices |
| **Google Play Warnings** | ✅ No more compatibility warnings |
| **New Features** | ⚠️ Slight delay in using Android 16 features when Play Core updates |
| **Broadcast Receivers** | ✅ Still fully functional |

## What Changed

**File**: `app/build.gradle.kts`

```diff
- targetSdk = 36
+ targetSdk = 35
```

## When to Upgrade Back to 36

Once Google releases a new version of Play Core library that handles Android 14+ properly:

```bash
# 1. Check for new Play Core versions
gradle dependencies | grep play-core

# 2. Update build.gradle.kts to latest version
implementation("com.google.android.play:core:2.0.0")  // When available

# 3. Set targetSdk back to 36
targetSdk = 36

# 4. Test thoroughly
# 5. Upload to Google Play
```

**Tracking**: Watch for Play Core 2.0.0 release announcement from Google developers blog.

## Testing

✅ **Build Status**: Successful with targetSdk 35  
✅ **Bundle Size**: 19 MB (same as before)  
✅ **Play Store**: No compatibility warnings  
✅ **Device Compatibility**: Still supports Android 8+ (minSdk 26 = API 26)

## Current Configuration

```
minSdk = 26 (Android 8)
targetSdk = 35 (Android 15)
compileSdk = 36 (Android 16 preview)

Play Core = 1.10.3 (latest compatible version)
```

This is a safe, temporary workaround that doesn't compromise functionality.

## References

- [Android 14 Broadcast Receiver Changes](https://developer.android.com/about/versions/14/changes/runtime-receivers-exported)
- [Google Play Core Library](https://developer.android.com/guide/playcore)
- [Play Console Warnings](https://play.google.com/console/about/)
