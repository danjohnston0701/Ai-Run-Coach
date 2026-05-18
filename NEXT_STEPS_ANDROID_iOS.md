# 🚀 Next Steps: Android & iOS Implementation

**Backend Status**: ✅ COMPLETE (Secrets configured)

Now implement the mobile apps. Pick your platform and follow the guide.

---

## 📱 Android Implementation (2 hours)

### What You're Adding:
- Settings screen with "Connect Strava" button
- Post-run "Share to Strava" button
- Activities list showing published runs

### Step 1: Copy Android Files
Copy these 3 files to your Android project:
```
app/src/main/java/live/airuncoach/android/strava/StravaViewModel.kt
app/src/main/java/live/airuncoach/android/strava/StravaSettingsScreen.kt
app/src/main/java/live/airuncoach/android/strava/StravaShareScreen.kt
```

(Files are already in your project at that path, ready to integrate)

### Step 2: Update AndroidManifest.xml
Find your MainActivity and add this intent filter:

```xml
<activity android:name=".MainActivity">
    <!-- Existing content -->
    
    <!-- Add this: -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="airuncoach"
            android:host="strava"
            android:pathPrefix="/auth-complete" />
    </intent-filter>
</activity>
```

### Step 3: Add Callback Handler to MainActivity
In your MainActivity.kt, add this method:

```kotlin
override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    handleStravaCallback(intent)
}

private fun handleStravaCallback(intent: Intent?) {
    val uri = intent?.data ?: return
    
    if (uri.scheme == "airuncoach" && uri.host == "strava") {
        val success = uri.getQueryParameter("success") == "true"
        val error = uri.getQueryParameter("error")
        
        if (success) {
            // Connection successful - refresh UI
            showToast("✅ Strava Connected!")
            stravaViewModel.checkStravaConnection()
        } else {
            showToast("❌ Strava connection failed: $error")
        }
    }
}

private fun showToast(message: String) {
    android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_SHORT).show()
}
```

### Step 4: Add to Your Settings Screen
In your existing Settings Compose screen, add:

```kotlin
@Composable
fun SettingsScreen() {
    val stravaViewModel: StravaViewModel = viewModel()
    
    Column {
        // ... other settings ...
        
        // Add this section:
        Text(
            text = "Connected Apps",
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(16.dp)
        )
        
        StravaSettingsScreen(
            viewModel = stravaViewModel,
            onActivityClicked = {
                // Navigate to activities screen if needed
                navController.navigate("strava_activities")
            }
        )
    }
}
```

### Step 5: Add to Your Post-Run Screen
In your post-run summary/results screen, add:

```kotlin
@Composable
fun PostRunSummaryScreen(runId: String) {
    val stravaViewModel: StravaViewModel = viewModel()
    val connectionStatus by stravaViewModel.connectionStatus.collectAsState()
    
    Column {
        // ... existing run summary UI ...
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Add this:
        StravaShareButton(
            runId = runId,
            connectionStatus = connectionStatus,
            viewModel = stravaViewModel,
            modifier = Modifier.padding(16.dp)
        )
    }
}
```

### Step 6: Test
1. Open Settings
2. Tap "Connect Strava"
3. Browser opens to Strava login
4. Log in and grant permissions
5. Returns to app with "✅ Strava Connected!"
6. Complete a test run
7. Post-run screen shows "Share to Strava" button
8. Tap it, wait 20-30 seconds
9. Activity appears in Strava with route map ✅

---

## 🍎 iOS Implementation (2 hours)

### What You're Adding:
- Settings view with "Connect Strava" button
- Post-run "Share to Strava" button
- Activities list showing published runs

### Step 1: Copy iOS Files
Copy these 2 files to your Xcode project:
```
ios/StravaViewModel.swift
ios/StravaViews.swift
```

(Files are already in your project, ready to integrate)

### Step 2: Update Info.plist
Add URL scheme support to your Info.plist. In Xcode:
1. Select your project
2. Select your target
3. Go to Info tab
4. Add URL Types (if not present)
5. Add new URL Type:
   - **Identifier**: com.airuncoach.strava
   - **URL Schemes**: airuncoach

Or edit Info.plist directly and add:

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

### Step 3: Add OAuth Callback Handler
In your main app view, add the URL handler:

```swift
import SwiftUI

@main
struct AiRunCoachApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    handleStravaCallback(url)
                }
        }
    }
    
    private func handleStravaCallback(_ url: URL) {
        if url.scheme == "airuncoach" && url.host == "strava" {
            let success = URLComponents(url: url, resolvingAgainstBaseURL: true)?
                .queryItems?.first(where: { $0.name == "success" })?
                .value == "true"
            
            if success {
                print("✅ Strava Connected!")
                // Refresh connection status
                // stravaViewModel.checkStravaConnection()
            } else {
                let error = URLComponents(url: url, resolvingAgainstBaseURL: true)?
                    .queryItems?.first(where: { $0.name == "error" })?
                    .value
                print("❌ Strava connection failed: \(error ?? "")")
            }
        }
    }
}
```

### Step 4: Add to Your Settings View
In your existing Settings view, add:

```swift
@StateObject private var stravaViewModel = StravaViewModel(
    apiService: DefaultAPIService(
        baseURL: "https://api.airuncoach.com",
        authToken: getUserAuthToken() // Your auth token
    )
)

var body: some View {
    Form {
        Section("Connected Apps") {
            StravaSettingsView(viewModel: stravaViewModel)
        }
        
        // ... other settings ...
    }
}
```

### Step 5: Add to Your Post-Run View
In your post-run summary view, add:

```swift
@ObservedObject var stravaViewModel: StravaViewModel

var body: some View {
    ScrollView {
        VStack(spacing: 16) {
            // ... existing run summary UI ...
            
            Divider().padding(.vertical, 8)
            
            // Add this:
            StravaShareView(
                runId: runId,
                connectionStatus: stravaViewModel.connectionStatus,
                viewModel: stravaViewModel
            )
            .padding()
        }
    }
}
```

### Step 6: Test
1. Open Settings
2. Tap "Connect Strava"
3. Safari opens to Strava login
4. Log in and grant permissions
5. Returns to app with success message
6. Settings show "Connected to Strava"
7. Complete a test run
8. Post-run view shows "Share to Strava" button
9. Tap it, wait 20-30 seconds
10. Activity appears in Strava with route map ✅

---

## ⏱️ Time Breakdown

| Task | Duration |
|------|----------|
| Android - Copy files | 10 min |
| Android - Update manifest | 10 min |
| Android - Add handlers | 15 min |
| Android - Integrate UI | 30 min |
| Android - Test | 15 min |
| **Android Total** | **1.5 hours** |
| | |
| iOS - Copy files | 5 min |
| iOS - Update Info.plist | 10 min |
| iOS - Add handler | 15 min |
| iOS - Integrate UI | 30 min |
| iOS - Test | 10 min |
| **iOS Total** | **1.5 hours** |

---

## ✅ Final Checklist

### Android
- [ ] Files copied to correct location
- [ ] AndroidManifest.xml updated
- [ ] Callback handler added to MainActivity
- [ ] Settings screen integrated
- [ ] Post-run screen integrated
- [ ] OAuth flow tested
- [ ] Publishing tested
- [ ] Activity verified in Strava

### iOS
- [ ] Files added to Xcode project
- [ ] Info.plist updated with URL scheme
- [ ] onOpenURL handler added to main app
- [ ] Settings view integrated
- [ ] Post-run view integrated
- [ ] OAuth flow tested
- [ ] Publishing tested
- [ ] Activity verified in Strava

---

## 🎯 You're Almost There!

Backend: ✅ Done
Android: ⏳ Your turn (1.5 hours)
iOS: ⏳ Your turn (1.5 hours)

Pick whichever platform you want to start with and follow the steps above.

---

## 📞 Need Help?

- **Android specifics**: See `ANDROID_STRAVA_SETUP.md`
- **iOS specifics**: See `iOS_STRAVA_SETUP.md`
- **Full reference**: See `STRAVA_INTEGRATION_GUIDE.md`

---

**Good luck!** 🚀🏃‍♂️
