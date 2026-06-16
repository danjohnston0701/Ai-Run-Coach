# ProGuard Rules Summary

## What Was Fixed

The app crashes on Google Play Store but works in debug APK because:

1. **Debug APK**: `minifyEnabled = false` → No obfuscation → Works fine
2. **Play Store APK**: `minifyEnabled = true` → R8 obfuscates field names → Gson can't deserialize → **Crashes**

## The Solution

Updated `app/proguard-rules.pro` with 150+ lines of rules that preserve:

### 1. **Gson Models & Annotations**
- All `domain.model.*` and `network.model.*` classes kept intact
- `@SerializedName` annotations preserved so Gson can map JSON fields
- Enums kept with their static methods (`values()`, `valueOf()`)

### 2. **Custom Type Adapters**
- `IsoDateLongAdapterFactory` - Handles ISO date string conversion
- `RetrofitClient` - Network client configuration

### 3. **Dependency Injection (Hilt/Dagger)**
- All `@HiltViewModel`, `@Inject`, `@Module` annotations
- All ViewModels in `viewmodel.*` package
- Hilt-generated components

### 4. **Third-Party SDKs**
- **Garmin ConnectIQ**: Needs reflection for message passing
- **Picovoice**: Wake word detection with JNI support
- **Firebase**: Cloud messaging and crash reporting
- **Google Play Services**: Location, maps, billing
- **Room Database**: Entity and DAO reflection
- **OkHttp/Retrofit**: Network client libraries

### 5. **Critical Support Classes**
- `SessionManager` - Auth token storage
- `CoachingFeaturePreferences` - Coach settings
- All Kotlin serialization metadata

## Key Rules Explained

```proguard
# Keep ALL classes in these packages
-keep class live.airuncoach.airuncoach.domain.model.** { *; }
-keep class live.airuncoach.airuncoach.network.model.** { *; }

# Keep Gson's ability to find fields by @SerializedName
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName *;
}

# Keep custom type adapter (critical for date conversion)
-keep class live.airuncoach.airuncoach.network.IsoDateLongAdapterFactory { *; }

# Keep ViewModels (Hilt instantiates these via reflection)
-keep class live.airuncoach.airuncoach.viewmodel.** { *; }

# Preserve annotations used by Hilt and Retrofit
-keepattributes *Annotation*,Signature
```

## Critical Models That Would Break Without These Rules

| Model | Used By | Why It Matters |
|-------|---------|----------------|
| `AuthResponse`, `User` | Login/Register | Gson deserialization fails → app crashes on login |
| `UploadRunRequest` | Run upload | Malformed JSON sent to server → run doesn't sync |
| `WatchBiometricFrame` | Garmin watch | Message parsing fails → watch disconnects |
| `TrainingPlan`, `Goal` | Training features | API responses can't be parsed |
| `RunSession` | Run history/display | Charts and metrics don't load |
| `IsoDateLongAdapterFactory` | All date fields | Timestamp conversion fails → data corruption |

## How to Verify the Fix Works

### 1. Build Release APK with Minification
```bash
./gradlew assembleRelease
```

### 2. Check the Mapping File
```bash
cat app/build/outputs/mapping/release/mapping.txt | grep "AuthResponse\|User\|UploadRunRequest"
```

**Good output** (classes are kept):
```
live.airuncoach.airuncoach.network.model.AuthResponse -> live.airuncoach.airuncoach.network.model.AuthResponse:
```

**Bad output** (classes are obfuscated):
```
live.airuncoach.airuncoach.network.model.AuthResponse -> live.a.a.a.a:
```

### 3. Test on Device
```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

Then test all features listed in `PLAY_STORE_MINIFICATION_CHECKLIST.md`.

### 4. Monitor Logcat for Errors
```bash
adb logcat | grep -i "error\|exception\|gson\|proguard"
```

## What NOT to Do

❌ **Don't disable minification just to fix this** — It compromises security and increases APK size

❌ **Don't assume the mapping is correct** — Verify with `apktool` if things still break

❌ **Don't ignore Garmin/Firebase errors** — These are harder to debug in production

## Next Steps

1. **Increment version code** in `build.gradle.kts` (currently 7 → change to 8)
2. **Build release bundle**: `./gradlew bundleRelease`
3. **Test on physical device** before uploading to Play Store
4. **Upload to Google Play Console**
5. **Test via internal testing track** first
6. **Monitor crash reports** for the first few hours after release

---

## References

- [ProGuard Official Docs](https://www.guardsquare.com/proguard/manual/usage)
- [Android R8 Configuration](https://developer.android.com/build/shrink-code)
- [Gson ProGuard Rules](https://github.com/google/gson/blob/master/ProGuard.txt)
- [Hilt ProGuard Rules](https://dagger.dev/hilt/proguard)
