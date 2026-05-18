# 🔗 Android Deep Links Setup - Next Step

## What's Done ✅
- OAuth screen created
- ViewModel integrated
- API endpoints added
- Navigation wired up
- Build passing

## What's Left (30 minutes)

### Step 1: Add Deep Link Intent Filter

**File**: `AndroidManifest.xml`

Find the MainActivity declaration and add:

```xml
<activity
    android:name=".MainActivity"
    android:exported="true">
    
    <!-- Existing intent filter -->
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
    
    <!-- ADD THIS: Strava OAuth callback -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="airuncoach"
            android:host="strava"
            android:path="/auth-complete" />
    </intent-filter>
    
</activity>
```

### Step 2: Handle Deep Link in MainActivity

**File**: `MainActivity.kt`

The app already has deep link handling in place (see `MainActivity.pendingDeepLink`), but verify it works with the Strava callback URL:

```
airuncoach://strava/auth-complete?success=true&athleteName=John%20Doe
```

### Step 3: Test

1. Build and run the app
2. Go to Connected Devices → Strava
3. Tap "Connect with Strava"
4. Complete OAuth in Strava
5. Should see success dialog
6. Verify athlete name shows in dialog

---

## Testing Points

✅ **OAuth Flow**
- [ ] Button tap opens browser
- [ ] Strava login loads
- [ ] Authorization works
- [ ] Redirect returns to app
- [ ] Success dialog appears
- [ ] Athlete name displays

✅ **Error Handling**
- [ ] Network error shows message
- [ ] Invalid state handled
- [ ] Permission denial handled
- [ ] Back button works

✅ **UI/UX**
- [ ] Screen is responsive
- [ ] Loading state visible
- [ ] Error messages clear
- [ ] Success dialog works
- [ ] Colors and branding correct

---

## Architecture

```
Strava OAuth Server
        ↓ (OAuth URL)
    Browser
        ↓ (User authorizes)
    Strava Server
        ↓ (Redirect with code)
Backend Callback Handler
        ↓ (Exchange code for token)
Backend Database
        ↓ (Deep link redirect)
    Browser
        ↓ (airuncoach://strava/auth-complete)
    MainActivity
        ↓ (Receives deep link)
    MainScreen NavHost
        ↓
    StravaOAuthScreen
        ↓ (Check connection status)
    ViewModel
        ↓ (Show success dialog)
    ConnectedDevices (return to)
```

---

## After Testing

Once deep links work:

### **Option A: Minimal Setup (MVP)**
- Add "Disconnect" button
- Show connection status
- Done! Ready for production

### **Option B: Enhanced (Recommended)**
- Add token refresh logic
- Add "Share to Strava" button in post-run screen
- Add Strava activities list
- Show published run links

---

## Time Estimates

| Task | Time |
|------|------|
| Add deep link intent filter | 5 min |
| Verify MainActivity handling | 5 min |
| Build and test app | 10 min |
| Debug any issues | 10 min |
| **Total** | **~30 min** |

---

## Files to Check

```
app/src/main/AndroidManifest.xml         ← ADD INTENT FILTER HERE
app/src/main/java/.../MainActivity.kt    ← Already has deep link handling
app/src/main/java/.../MainScreen.kt      ← Already wired up
app/src/main/java/.../StravaOAuthScreen.kt ← Complete
```

---

## Android Documentation

**Deep Links**: https://developer.android.com/training/app-links/deep-linking

**Intent Filters**: https://developer.android.com/guide/components/intents-filters

---

## Questions?

Check these files for reference:
- `ANDROID_OAUTH_IMPLEMENTATION_COMPLETE.md` - Full implementation details
- `STRAVA_INTEGRATION_GUIDE.md` - Backend OAuth details
- `StravaOAuthScreen.kt` - UI implementation

---

**Status**: 95% Complete → 99% Complete (just deep links!)

