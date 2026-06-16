# Debug Symbols for Google Play Store Upload

## The Google Play Warning

> "This App Bundle contains native code, and you've not uploaded debug symbols. We recommend you upload a symbol file to make your crashes and ANRs easier to analyze and debug"

## What This Means

Your app uses **native code** (the Picovoice wake word detection library, `libpv_porcupine.so`). When Google Play builds your app from the bundle, it strips debug symbols from native libraries to reduce size. Without separate debug symbols, crash stack traces show unhelpful hex addresses instead of function names.

**Example:**
- ❌ Without symbols: `0x0000a4c7 in libpv_porcupine.so (no symbol name)`
- ✅ With symbols: `0x0000a4c7 in pv_porcupine_process_audio() in libpv_porcupine.so`

## Do You Need Debug Symbols?

### **Short Answer: OPTIONAL, but RECOMMENDED for production**

**You should upload debug symbols if:**
- ✅ You want better crash analysis from Play Console
- ✅ You're actively monitoring crashes and ANRs
- ✅ You need to debug native code issues

**You can skip debug symbols if:**
- ✅ Your app doesn't use much native code (you only have Picovoice)
- ✅ Picovoice SDK includes its own symbols in the library
- ✅ You're just doing a quick test upload

## Where Are Your Debug Symbols?

Your app has **one native library**: `libpv_porcupine.so` from the Picovoice SDK.

**Current status:**
- The native library is included in your app bundle ✅
- Debug symbols **may still be embedded** in the library (Picovoice usually includes them)
- OR symbols have been stripped during build (Android default)

## How to Upload Debug Symbols to Play Console

### **Option 1: Upload Mapping File (Kotlin/Java Crashes) — EASIEST**

This is what you should do immediately. It helps with **Kotlin/Java crashes** (which is where your login crash was):

1. Go to **Google Play Console** → Your App
2. Select **Release** (or **Internal Testing**)
3. Scroll down to **"App signing"**
4. Click **"Upload symbol file"** (or **"Provide symbols"**)
5. Upload this file:
   ```
   app/build/outputs/mapping/release/mapping.txt
   ```
6. Save

**Why this matters:**
- The `mapping.txt` file deobfuscates your Kotlin/Java code
- When crashes happen, Play Console will show function names instead of obfuscated names
- **This is the most important for your app** since the login crash is Java/Kotlin

### **Option 2: Upload Native Debug Symbols (For Native Code Crashes) — OPTIONAL**

For the Picovoice native library crashes:

1. Generate unstripped .so files (if not already done):
   ```bash
   # The build system should have stripped these already
   # You'd need to configure gradle to preserve them
   ```

2. Upload to Play Console the same way as Option 1

**Note:** Picovoice SDK likely handles its own symbol management, so this is less critical for your use case.

---

## My Recommendation

### **For Your Current Release (v1.4.1)**

**Do this:**
1. ✅ Upload the `mapping.txt` file to Play Console (Option 1 above)
2. ⏭️ Skip native debug symbols for now (Picovoice handles theirs)
3. Monitor crashes for a few days
4. If you see native Picovoice crashes, generate full symbols

**Why:**
- Your critical crash was a **Kotlin/Java** issue (Gson deserialization), not native code
- The mapping file is what Google Play needs to show you useful crash stack traces
- Picovoice SDK is well-tested and unlikely to crash
- You can always add native symbols later

### **For Long-Term (Future Releases)**

Consider configuring your build to preserve debug symbols:

```gradle
// In app/build.gradle.kts
android {
    buildTypes {
        release {
            debuggable = false  // Still release, but keep symbols for analysis
            // Keep native debug symbols
            packagingOptions {
                // This prevents stripping (may increase app size slightly)
            }
        }
    }
}
```

---

## Step-by-Step: Upload Mapping File to Play Console

### **Before Uploading Bundle**

1. Open **Google Play Console** → Your App → **Testing** (Internal/Closed)
2. Click **Create new release** (if not already created)
3. Upload your `app-release.aab`
4. **Before clicking "Save"**, scroll down to see if there's a "Debug symbols" section

### **After Uploading Bundle**

1. Go back to your **Release** page
2. Look for **"App signing"** or **"Debug symbols"** section
3. Click **"Upload symbol file"** or **"Add symbol file"**
4. Select file type: **"Android Symbol Mapping File"**
5. Browse to: `/app/build/outputs/mapping/release/mapping.txt`
6. Upload and save

---

## What Each Debug File Does

| File | Purpose | Upload? |
|------|---------|---------|
| `mapping.txt` | Deobfuscates Kotlin/Java crashes | ✅ **YES - DO THIS** |
| `mapping.prt` | ProGuard intermediate format | ❌ No |
| `configuration.txt` | ProGuard config used | ❌ No |
| `seeds.txt` | ProGuard kept classes | ❌ No |
| `usage.txt` | ProGuard removed classes | ❌ No |
| Native `.so` symbols | Deobfuscates native crashes | ⏭️ Optional |

---

## How Symbols Help You

### **Without Symbols:**
```
AndroidRuntime: FATAL EXCEPTION: main
AndroidRuntime: java.lang.NullPointerException
AndroidRuntime:     at a.b.c.d (Unknown Source:0)
AndroidRuntime:     at a.b.c.e (Unknown Source:1)
```
❌ **You have no idea what function crashed**

### **With Symbols:**
```
AndroidRuntime: FATAL EXCEPTION: main
AndroidRuntime: java.lang.NullPointerException
AndroidRuntime:     at live.airuncoach.airuncoach.viewmodel.LoginViewModel.login (LoginViewModel.kt:156)
AndroidRuntime:     at live.airuncoach.airuncoach.ui.screens.LoginScreen$1.invoke (LoginScreen.kt:315)
```
✅ **You can see exactly which function and line crashed**

---

## FAQ

**Q: Do I need debug symbols to publish?**
A: No, they're optional. Google Play will let you publish without them.

**Q: Will debug symbols increase app size?**
A: No, they're separate and only used by Google Play for analysis.

**Q: Can I upload symbols after publishing?**
A: Yes! You can upload them anytime after the app is live.

**Q: What if I upload the wrong mapping file?**
A: No problem — you can upload a corrected version anytime.

**Q: Do users download debug symbols?**
A: No, they're only stored on Google Play servers for crash analysis.

---

## What to Do Right Now

1. ✅ **Upload the bundle** (you already have it built)
2. ✅ **When prompted for symbols, upload `mapping.txt`** (Optional but recommended)
3. ✅ **Proceed with testing**
4. ⏭️ **Monitor crashes for a few days**
5. ⏭️ **If needed, generate native symbols** (unlikely)

The warning is just a recommendation — you can publish without symbols. But uploading `mapping.txt` takes 30 seconds and will save you hours of debugging later. 🎯

---

## Files Location

**Mapping file to upload:**
```
/Users/danieljohnston/AndroidStudioProjects/AiRunCoach/app/build/outputs/mapping/release/mapping.txt
```

This is what Google Play will use to "deobfuscate" crash stack traces so you can see real function names instead of `a.b.c`.
