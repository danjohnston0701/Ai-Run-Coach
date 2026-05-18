# 🤖 Android Strava Integration - Setup & Implementation

## What Was Created

### Kotlin Files (Ready to Use)

1. **`StravaViewModel.kt`** - ViewModel for Strava state management
2. **`StravaSettingsScreen.kt`** - Settings UI with connect/disconnect buttons
3. **`StravaShareScreen.kt`** - Post-run share screen and activity list

---

## Integration Steps

### Step 1: Add to AndroidManifest.xml

Add this intent filter to your MainActivity to handle OAuth callbacks:

```xml
<activity android:name=".MainActivity">
    <!-- Existing manifest entries -->
    
    <!-- Strava OAuth Callback Handler -->
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

### Step 2: Handle OAuth Callback in MainActivity

Add this code to your MainActivity's `onCreate` or in a separate handler:

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
            // Connection successful
            showToast("✅ Strava Connected!")
            stravaViewModel.checkStravaConnection()
        } else {
            // Connection failed
            showToast("❌ Strava connection failed: $error")
        }
    }
}
```

### Step 3: Add Strava Settings to Your Settings Screen

In your existing Settings Compose screen, add:

```kotlin
// In your SettingsScreen composable
val stravaViewModel: StravaViewModel = viewModel()

Column {
    // ... other settings ...
    
    // Strava Integration Section
    Text(
        text = "Connected Apps",
        fontSize = 16.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(16.dp)
    )
    
    StravaSettingsScreen(
        viewModel = stravaViewModel,
        onActivityClicked = {
            // Navigate to Strava activities screen
            navController.navigate("strava_activities")
        }
    )
}
```

### Step 4: Add "Share to Strava" Button to Post-Run Screen

In your post-run summary/results screen:

```kotlin
@Composable
fun PostRunSummaryScreen(
    runId: String,
    stravaViewModel: StravaViewModel
) {
    val connectionStatus by stravaViewModel.connectionStatus.collectAsState()
    
    Column {
        // ... existing run summary UI ...
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Strava Share Button
        StravaShareButton(
            runId = runId,
            connectionStatus = connectionStatus,
            viewModel = stravaViewModel,
            modifier = Modifier.padding(16.dp)
        )
        
        Spacer(modifier = Modifier.height(16.dp))
    }
}
```

### Step 5: Add Strava Activities Screen to Navigation

In your navigation graph:

```kotlin
composable("strava_activities") {
    StravaActivitiesScreen(
        viewModel = stravaViewModel
    )
}
```

Or if you're not using Navigation Compose:

```kotlin
// In your Activity/Fragment, show the screen when user taps "Activities"
if (showStravaActivities) {
    StravaActivitiesScreen(
        viewModel = stravaViewModel
    )
}
```

---

## ViewModel Setup

The `StravaViewModel` requires an `ApiService` instance:

```kotlin
// In your dependency injection setup (Hilt, Koin, etc.)
@Provides
fun provideStravaViewModel(apiService: ApiService): StravaViewModel {
    return StravaViewModel(apiService)
}
```

Or create it manually:

```kotlin
val stravaViewModel = StravaViewModel(apiService)
```

---

## API Service Extension

Make sure your `ApiService` has these methods (or add them):

```kotlin
suspend inline fun <reified T> get(endpoint: String): T {
    val response = httpClient.get(baseUrl + endpoint) {
        header("Authorization", "Bearer $token")
    }
    return response.body()
}

suspend inline fun <reified T> post(endpoint: String, body: Any): T {
    val response = httpClient.post(baseUrl + endpoint) {
        header("Authorization", "Bearer $token")
        contentType(ContentType.Application.Json)
        setBody(body)
    }
    return response.body()
}
```

---

## Testing

### Manual Testing Checklist

- [ ] User opens Settings
- [ ] User taps "Connect Strava"
- [ ] Browser opens to Strava OAuth login
- [ ] User logs in to Strava
- [ ] User grants permissions
- [ ] Redirected back to app (airuncoach://strava/auth-complete?success=true)
- [ ] Settings show "Connected to Strava"
- [ ] Athlete name displays
- [ ] User completes a run
- [ ] Post-run screen shows "Share to Strava" button
- [ ] User taps share button
- [ ] Shows "Publishing to Strava..." message
- [ ] After 20-30 seconds, shows success with Strava link
- [ ] User can tap "View on Strava" to see activity
- [ ] Activity appears in Strava with route map

### API Testing

```bash
# Test connection status
curl http://localhost:3000/api/strava/connection-status \
  -H "Authorization: Bearer test_token"

# Test publish
curl -X POST http://localhost:3000/api/runs/RUN_ID/publish-strava \
  -H "Authorization: Bearer test_token"

# Test activities list
curl http://localhost:3000/api/strava/activities \
  -H "Authorization: Bearer test_token"
```

---

## Troubleshooting

### Issue: OAuth callback not received
- **Cause**: Intent filter not in manifest
- **Solution**: Verify the intent filter is correctly added to AndroidManifest.xml
- **Fix**: Ensure scheme is "airuncoach", host is "strava", pathPrefix is "/auth-complete"

### Issue: "Strava not connected" in post-run screen
- **Cause**: User hasn't connected yet
- **Solution**: Show "Connect Strava" prompt, direct user to Settings
- **Fix**: Use `NotConnectedPrompt()` composable

### Issue: No Strava activities showing
- **Cause**: Activities may not be in Strava yet, or API error
- **Solution**: Check server logs for errors
- **Fix**: Call `fetchStravaActivities()` manually after delay

### Issue: Token expired error
- **Cause**: OAuth token older than 6 hours
- **Solution**: Auto-refresh happens on backend
- **Fix**: If manual refresh needed, call `viewModel.checkStravaConnection()`

---

## File Locations

```
app/src/main/java/live/airuncoach/android/strava/
├── StravaViewModel.kt           ✅ Created
├── StravaSettingsScreen.kt      ✅ Created
└── StravaShareScreen.kt         ✅ Created

app/src/main/AndroidManifest.xml ✅ Add intent filter

app/src/main/java/MainActivity.kt ✅ Add callback handler
```

---

## Dependencies

Make sure you have these in your `build.gradle`:

```gradle
dependencies {
    // Compose (if not already included)
    implementation "androidx.compose.ui:ui:1.5.0"
    implementation "androidx.compose.material3:material3:1.1.0"
    implementation "androidx.lifecycle:lifecycle-viewmodel-compose:2.6.0"
    
    // Networking
    implementation "io.ktor:ktor-client-android:2.3.0"
    
    // Coroutines
    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.0"
}
```

---

## Summary

**What You Need to Do:**

1. ✅ Copy the 3 Kotlin files to your project
2. ✅ Add intent filter to AndroidManifest.xml
3. ✅ Add callback handler to MainActivity
4. ✅ Integrate screens into your existing UI
5. ✅ Test the OAuth flow
6. ✅ Deploy!

**Time Estimate**: ~1-2 hours

---

## Next: iOS Implementation

See `iOS_STRAVA_SETUP.md` for the iOS implementation.

---

**Ready to implement!** 🚀
