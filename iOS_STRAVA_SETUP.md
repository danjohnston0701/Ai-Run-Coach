# 🍎 iOS Strava Integration - Setup & Implementation

## What Was Created

### Swift Files (Ready to Use)

1. **`StravaViewModel.swift`** - ViewModel with API integration and state management
2. **`StravaViews.swift`** - Complete SwiftUI screens and components

---

## Integration Steps

### Step 1: Add Files to Xcode Project

1. Drag and drop these files into your Xcode project:
   - `StravaViewModel.swift`
   - `StravaViews.swift`

2. Make sure they're added to your app target

### Step 2: Configure URL Scheme in Info.plist

Add this to your `Info.plist`:

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

Or in SwiftUI:

```swift
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
            let success = url.query?.contains("success=true") ?? false
            let error = extractQueryParameter(from: url, name: "error")
            
            if success {
                // Connection successful
                print("✅ Strava Connected!")
                stravaViewModel.checkStravaConnection()
            } else {
                // Connection failed
                print("❌ Strava connection failed: \(error ?? "")")
            }
        }
    }
    
    private func extractQueryParameter(from url: URL, name: String) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        return components.queryItems?.first(where: { $0.name == name })?.value
    }
}
```

### Step 3: Initialize StravaViewModel

In your app's main view or environment:

```swift
@main
struct AiRunCoachApp: App {
    @State private var stravaViewModel: StravaViewModel?
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    let apiService = DefaultAPIService(
                        baseURL: "https://api.airuncoach.com",
                        authToken: getUserAuthToken() // Your auth token
                    )
                    self.stravaViewModel = StravaViewModel(apiService: apiService)
                }
        }
    }
}
```

Or using a StateObject in your view:

```swift
struct SettingsView: View {
    @StateObject private var stravaViewModel = StravaViewModel(
        apiService: DefaultAPIService(
            baseURL: "https://api.airuncoach.com",
            authToken: UserDefaults.standard.string(forKey: "authToken")
        )
    )
    
    var body: some View {
        StravaSettingsView(viewModel: stravaViewModel)
    }
}
```

### Step 4: Add to Settings Screen

In your existing settings view:

```swift
struct SettingsView: View {
    @StateObject private var stravaViewModel = StravaViewModel(
        apiService: DefaultAPIService(authToken: getAuthToken())
    )
    
    var body: some View {
        Form {
            Section("Connected Apps") {
                StravaSettingsView(viewModel: stravaViewModel)
            }
            
            // ... other settings ...
        }
    }
}
```

### Step 5: Add "Share to Strava" Button to Post-Run Screen

In your post-run summary view:

```swift
struct PostRunSummaryView: View {
    let runId: String
    @ObservedObject var stravaViewModel: StravaViewModel
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // ... existing run summary UI ...
                
                Divider()
                    .padding(.vertical, 8)
                
                // Strava Share Section
                StravaShareView(
                    runId: runId,
                    connectionStatus: stravaViewModel.connectionStatus,
                    viewModel: stravaViewModel
                )
                .padding()
            }
        }
    }
}
```

### Step 6: Add Activities Navigation

In your settings navigation:

```swift
struct SettingsView: View {
    @StateObject private var stravaViewModel: StravaViewModel
    @State private var showingStravaActivities = false
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Strava") {
                    StravaSettingsView(viewModel: stravaViewModel)
                }
            }
            .navigationDestination(isPresented: $showingStravaActivities) {
                StravaActivitiesView(viewModel: stravaViewModel)
            }
        }
    }
}
```

---

## API Service Integration

### Option 1: Use Provided DefaultAPIService

The `DefaultAPIService` is ready to use:

```swift
let apiService = DefaultAPIService(
    baseURL: "https://api.airuncoach.com",
    authToken: "your_auth_token"
)
let viewModel = StravaViewModel(apiService: apiService)
```

### Option 2: Implement Custom APIService

If you have your own API service, implement the `APIService` protocol:

```swift
class YourAPIService: APIService {
    func get<T: Decodable>(_ endpoint: String, responseType: T.Type) async throws -> T {
        // Your implementation
    }
    
    func post<T: Decodable>(_ endpoint: String, body: [String: Any], responseType: T.Type) async throws -> T {
        // Your implementation
    }
}
```

---

## Testing

### Manual Testing Checklist

- [ ] App opens without errors
- [ ] Settings screen shows Strava section
- [ ] User taps "Connect Strava"
- [ ] Safari opens to Strava OAuth login
- [ ] User logs in and grants permissions
- [ ] Returns to app (via airuncoach:// URL scheme)
- [ ] Settings show "Connected to Strava"
- [ ] Athlete name displays correctly
- [ ] User completes a run
- [ ] Post-run screen shows "Share to Strava" button
- [ ] User taps share button
- [ ] Shows "Publishing to Strava..." message
- [ ] After 20-30 seconds, shows success
- [ ] "View on Strava" button appears
- [ ] Tapping it opens the activity in Safari
- [ ] Activity appears in Strava app with route map

### API Testing

```bash
# Test connection status
curl https://api.airuncoach.com/api/strava/connection-status \
  -H "Authorization: Bearer test_token"

# Test publish
curl -X POST https://api.airuncoach.com/api/runs/RUN_ID/publish-strava \
  -H "Authorization: Bearer test_token"

# Test activities list
curl https://api.airuncoach.com/api/strava/activities \
  -H "Authorization: Bearer test_token"
```

---

## Troubleshooting

### Issue: URL scheme not recognized
- **Cause**: Info.plist not configured or app not restarted
- **Solution**: Restart the app after adding Info.plist entries
- **Fix**: Verify Info.plist has correct URL scheme entries

### Issue: "Not Connected" message persists after OAuth
- **Cause**: Callback URL not being handled correctly
- **Solution**: Check that `onOpenURL` modifier is in place
- **Fix**: Add `handleStravaCallback` to main app view

### Issue: API call fails with 401
- **Cause**: Auth token not set or expired
- **Solution**: Pass valid auth token to APIService
- **Fix**: Ensure `authToken` is set in `DefaultAPIService()`

### Issue: No activities showing
- **Cause**: API error or no activities published yet
- **Solution**: Check Console logs for API errors
- **Fix**: Wait for Strava to process the activity (10-30 seconds)

---

## File Locations

```
iOS Project/
├── StravaViewModel.swift       ✅ Created
├── StravaViews.swift           ✅ Created
└── Info.plist                  ✅ Update with URL scheme
```

---

## Dependencies

All code uses only standard Swift and SwiftUI frameworks:
- `Foundation` - Networking, JSON decoding
- `SwiftUI` - UI framework
- `Combine` - Reactive state management

No additional CocoaPods or SPM dependencies needed!

---

## Advanced Configuration

### Custom Base URL

Change the base URL for different environments:

```swift
// Development
let apiService = DefaultAPIService(baseURL: "http://localhost:3000")

// Staging
let apiService = DefaultAPIService(baseURL: "https://staging-api.airuncoach.com")

// Production
let apiService = DefaultAPIService(baseURL: "https://api.airuncoach.com")
```

### Custom Error Handling

Modify the ViewModel to handle errors differently:

```swift
// In StravaViewModel
private func handleError(_ error: Error) {
    errorMessage = error.localizedDescription
    // Custom logging, analytics, etc.
}
```

### Custom Styling

Modify colors and styling in `StravaViews.swift`:

```swift
// Change Strava orange color
Color(red: 0.99, green: 0.32, blue: 0) // Current
Color(red: 0.7, green: 0.3, blue: 0.9) // Your color
```

---

## Summary

**What You Need to Do:**

1. ✅ Copy the 2 Swift files to your project
2. ✅ Add URL scheme to Info.plist
3. ✅ Add `onOpenURL` handler to main app
4. ✅ Create APIService or use DefaultAPIService
5. ✅ Integrate screens into your existing UI
6. ✅ Test the OAuth flow
7. ✅ Deploy!

**Time Estimate**: ~1-2 hours

---

## Next: Complete the Integration

Once you complete these steps:

1. Build and run the app
2. Test the full OAuth flow
3. Deploy to TestFlight
4. Deploy to App Store

---

**Ready to implement!** 🚀
