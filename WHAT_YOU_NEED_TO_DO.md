# 📋 What You Need to Do - Simple Checklist

**Current Status**: Everything is built and ready. This is your action checklist.

---

## Phase 1: Strava API Setup (5-10 minutes) ⏱️

### 1. Create Strava Application
1. Go to: https://www.strava.com/settings/api
2. Click "Create New Application"
3. Fill in:
   - **Name**: AI Run Coach
   - **Website**: https://airuncoach.com
   - **Category**: Training
4. Accept terms and create
5. **Copy these values**:
   - Client ID
   - Client Secret

### 2. Add to Replit Secrets
In Replit:
1. Click the **"Secrets"** icon (lock) in left sidebar
2. Click **"Add new secret"** and add these two:

```
STRAVA_CLIENT_ID = [your Client ID]
STRAVA_CLIENT_SECRET = [your Client Secret]
```

That's it! The redirect URI has a default value built in, so you don't need to add it.

*(Only add STRAVA_REDIRECT_URI if you need to customize it)*

### 3. Verify Backend Works
```bash
npm run dev  # Should start without errors
```

See `STRAVA_REPLIT_SECRETS_SETUP.md` for detailed instructions.

---

## Phase 2: Android Implementation (2-3 hours) 🤖

### 1. Copy Android Files
Copy these files to your Android project:
```
app/src/main/java/live/airuncoach/android/strava/StravaViewModel.kt
app/src/main/java/live/airuncoach/android/strava/StravaSettingsScreen.kt
app/src/main/java/live/airuncoach/android/strava/StravaShareScreen.kt
```

(Files are already created in your project, ready to integrate)

### 2. Update AndroidManifest.xml
Add this intent filter to your MainActivity:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="airuncoach"
        android:host="strava"
        android:pathPrefix="/auth-complete" />
</intent-filter>
```

### 3. Add Callback Handler to MainActivity
```kotlin
override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    val uri = intent?.data ?: return
    
    if (uri.scheme == "airuncoach" && uri.host == "strava") {
        val success = uri.getQueryParameter("success") == "true"
        if (success) {
            showToast("✅ Strava Connected!")
            stravaViewModel.checkStravaConnection()
        }
    }
}
```

### 4. Integrate into Your UI
Add to Settings screen:
```kotlin
StravaSettingsScreen(viewModel = stravaViewModel)
```

Add to post-run screen:
```kotlin
StravaShareButton(
    runId = runId,
    connectionStatus = connectionStatus,
    viewModel = stravaViewModel
)
```

### 5. Test
- Open Settings
- Tap "Connect Strava"
- Log in to Strava
- Grant permissions
- Verify connection shows athlete name
- Publish a test run
- Verify activity appears in Strava

---

## Phase 3: iOS Implementation (2-3 hours) 🍎

### 1. Copy iOS Files
Copy these files to your Xcode project:
```
ios/StravaViewModel.swift
ios/StravaViews.swift
```

(Files are already created, ready to integrate)

### 2. Update Info.plist
Add URL scheme handling:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLName</key>
        <string>com.airuncoach.strava</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>airuncoach</string>
        </array>
    </dict>
</array>
```

### 3. Add OAuth Callback Handler
In your app's main view:

```swift
.onOpenURL { url in
    if url.scheme == "airuncoach" && url.host == "strava" {
        let success = url.query?.contains("success=true") ?? false
        if success {
            print("✅ Strava Connected!")
            stravaViewModel.checkStravaConnection()
        }
    }
}
```

### 4. Integrate into Your UI
Add to Settings view:
```swift
StravaSettingsView(viewModel: stravaViewModel)
```

Add to post-run view:
```swift
StravaShareView(
    runId: runId,
    connectionStatus: connectionStatus,
    viewModel: stravaViewModel
)
```

### 5. Test
- Open Settings
- Tap "Connect Strava"
- Log in to Strava
- Grant permissions
- Verify connection shows athlete name
- Publish a test run
- Verify activity appears in Strava

---

## Phase 4: Testing (1 hour) ✅

### Manual Testing Checklist

**Android:**
- [ ] OAuth flow works (Settings → Connect Strava → Browser → Back)
- [ ] Settings show connected athlete name
- [ ] Can open browser to view activities
- [ ] Post-run screen shows "Share to Strava" button
- [ ] Publishing works
- [ ] Activity appears in Strava within 30 seconds
- [ ] Route map is correct
- [ ] Metrics are correct (distance, HR, cadence, elevation)

**iOS:**
- [ ] OAuth flow works (Settings → Connect Strava → Browser → Back)
- [ ] Settings show connected athlete name
- [ ] Can open activities list
- [ ] Post-run screen shows "Share to Strava" button
- [ ] Publishing works
- [ ] Activity appears in Strava within 30 seconds
- [ ] Route map is correct
- [ ] Metrics are correct (distance, HR, cadence, elevation)

---

## Phase 5: Deployment (1-2 hours) 🚀

### Android
```bash
# Build signed APK
./gradlew assembleRelease

# Upload to Google Play Store via Google Play Console
```

### iOS
```bash
# Build and archive in Xcode
# Product → Archive

# Upload via TestFlight or directly to App Store
```

---

## ✅ Complete Checklist

### Pre-Launch
- [ ] Strava API credentials obtained
- [ ] .env file updated
- [ ] Backend build passing
- [ ] Android files copied
- [ ] iOS files copied
- [ ] All integrations complete

### Android Deployment
- [ ] Files copied to correct locations
- [ ] AndroidManifest.xml updated
- [ ] MainActivity callback handler added
- [ ] Settings screen updated
- [ ] Post-run screen updated
- [ ] Testing complete
- [ ] APK built and signed
- [ ] Uploaded to Play Store

### iOS Deployment
- [ ] Files added to Xcode project
- [ ] Info.plist updated with URL scheme
- [ ] onOpenURL handler added
- [ ] Settings view updated
- [ ] Post-run view updated
- [ ] Testing complete
- [ ] Archive created
- [ ] Submitted to App Store

### Post-Deployment
- [ ] Monitor error logs
- [ ] Monitor user feedback
- [ ] Monitor Strava API status
- [ ] Support users with questions

---

## 📚 Where to Find Help

- **Android specifics**: See `ANDROID_STRAVA_SETUP.md`
- **iOS specifics**: See `iOS_STRAVA_SETUP.md`
- **All details**: See `STRAVA_INTEGRATION_GUIDE.md`
- **Deployment**: See `STRAVA_DEPLOYMENT_GUIDE.md`
- **Overview**: See `STRAVA_README.md`

---

## ⏱️ Time Breakdown

| Task | Duration |
|------|----------|
| Strava API Setup | 10 min |
| Android Implementation | 2 hours |
| iOS Implementation | 2 hours |
| Testing | 1 hour |
| Deployment | 1-2 hours |
| **Total** | **~6-7 hours** |

---

## 🎯 Success Criteria

✅ Users can connect Strava from Settings  
✅ Users can publish runs to Strava  
✅ Activities appear in Strava with correct data  
✅ Route maps are generated  
✅ <1% error rate on publishing  
✅ No crashes or bugs

---

## 🚀 You're Ready!

Everything is written and ready to go. Just follow this checklist and you'll be done in ~6-7 hours.

**Start with Phase 1** (10 minutes), then work through phases 2-5.

---

## Questions?

- Read the relevant setup guide (Android or iOS)
- Check the troubleshooting section
- Look at the code comments for implementation details

---

**Ready to launch!** 🚀

Good luck! 🏃‍♂️
