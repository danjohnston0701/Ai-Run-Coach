# iOS Strava Export & Integration Brief

**Status**: Ready for Xcode Implementation  
**Scope**: Download run data file from Data tab + upload to Strava + UI integration in run summary  
**Reference**: Android implementation (complete, tested)  
**Timeline**: 2-3 days for full feature

---

## 📋 Executive Summary

Users can now **download their run data** as a `.GPX` file from the Data tab, then seamlessly **upload that file to Strava** directly from the run summary screen. The feature includes:

- ✅ **GPX file export** with complete GPS track, timestamps, elevation
- ✅ **Strava OAuth integration** (API authentication already set up on backend)
- ✅ **One-tap Strava upload** from run summary
- ✅ **Deep link to Strava activity** after successful upload
- ✅ **Download file to Files app** for backup or manual upload
- ✅ **UI controls** (Download button, Share button, Strava upload button)
- ✅ **Error handling** with helpful user feedback
- ✅ **Loading states** and progress indication

---

## 🎯 User Experience Flow

```
Run Summary Screen
  ↓
User sees three options:
  ├─ [Download] → Save GPX to Files app (for backup)
  ├─ [Share]    → iOS share sheet (Messages, Mail, etc.)
  └─ [Strava]   → Upload directly to Strava account
      ├─ If not authenticated: OAuth login popup
      ├─ If authenticated: "Uploading to Strava..." → deep link to activity
      └─ Error: Retry or Cancel
```

---

## 📱 UI Specifications

### Run Summary Screen — Data Export Section

Add a **new section** below the route map (or adjacent to existing share buttons):

```
┌─────────────────────────────────────┐
│ [🔗 Share Route Map] [📥 Download]  │  ← Existing share buttons
│                                     │
│ [↑ Upload to Strava] [↗ Open in...]│  ← NEW: Data export actions
│ "Export your run data"              │  ← Subtle subtitle
└─────────────────────────────────────┘
```

#### Button Specifications

**Download Button**
- **Icon**: Download icon (⬇)
- **Text**: "Download"
- **Style**: Secondary/outlined button
- **Action**: Save GPX to Files app Documents folder
- **Loading state**: "Downloading…" with spinner
- **Success state**: "Downloaded to Files" (toast, 3 sec)
- **Error state**: Red button, show error message

**Share Button**
- **Icon**: Share icon
- **Text**: "Share"
- **Style**: Secondary/outlined button
- **Action**: iOS native share sheet (supports Messages, Mail, AirDrop, etc.)
- **File shared**: The GPX file (auto-generated if not already cached)

**Strava Upload Button** (NEW)
- **Icon**: Strava logo (salmon/orange colour)
- **Text**: "Upload to Strava"
- **Style**: Teal/primary button with Strava branding
- **Action**: 
  - Check Strava auth token availability
  - If missing: Show OAuth login popup
  - If valid: Upload GPX to Strava API
  - On success: Open Strava activity in browser/app
- **Loading state**: "Uploading to Strava…" with spinner
- **Success state**: "Uploaded! View on Strava" → tap opens deep link
- **Error state**: "Upload failed" with retry option

**Open in Browser/App Button** (OPTIONAL)
- **Icon**: External link icon
- **Text**: "Open in…"
- **Style**: Ghost/tertiary button
- **Action**: iOS share sheet with "Open in…" options (Strava app if installed, Safari, etc.)

---

## 🏗️ Architecture

### Data Flow

```
1. Run Summary Screen Loads
   ↓
   GET /api/runs/:runId (if GPX not cached)
   ↓
   Returns:
   - routePoints: [{ latitude, longitude, timestamp, altitude }, ...]
   - distance (km)
   - duration (seconds)
   - completedAt (ISO date)
   - totalElevationGain (meters)
   ↓

2. Generate GPX File (in-memory or cache)
   ↓
   Format: Standard GPX 1.1 XML
   Include: waypoints, timestamps, elevations
   ↓

3. User taps "Download"
   ↓
   Save GPX to Documents folder
   ↓
   Show success toast
   ↓

4. User taps "Share"
   ↓
   iOS native share sheet with GPX file
   ↓

5. User taps "Upload to Strava"
   ↓
   Check: Is Strava token present?
   ├─ NO: Show OAuth popup → user logs in → token stored
   ├─ YES: Proceed directly to upload
   ↓
   POST /api/strava/upload
   {
     "runId": "uuid",
     "gpxData": "<gpx>...</gpx>",
     "accessToken": "stored-strava-token"
   }
   ↓
   Server receives request → Uploads to Strava API
   ↓
   Returns: { "stravaActivityId": "12345...", "stravaUrl": "https://..." }
   ↓
   Client receives response → Opens Strava activity deep link
   ↓
   User sees their activity on Strava
```

### Core Components

#### 1. GPXGenerator (Utility)

Generates a standard GPX 1.1 file from run data.

```swift
class GPXGenerator {
    func generateGPX(
        routePoints: [RoutePoint],
        distance: Double,  // km
        duration: Int,     // seconds
        completedAt: Date,
        totalElevationGain: Double
    ) -> String {
        // Returns XML string in GPX 1.1 format
        // Include: metadata, waypoints, elevation, timestamps
    }
}
```

**GPX Format (sample structure)**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AI Run Coach">
  <metadata>
    <name>Run on 2026-07-14</name>
    <time>2026-07-14T06:30:00Z</time>
    <bounds />
  </metadata>
  <trk>
    <name>Run</name>
    <trkseg>
      <trkpt lat="40.7829" lon="-73.9654">
        <ele>10.5</ele>
        <time>2026-07-14T06:30:00Z</time>
      </trkpt>
      <trkpt lat="40.7832" lon="-73.9651">
        <ele>11.2</ele>
        <time>2026-07-14T06:30:15Z</time>
      </trkpt>
      <!-- more points... -->
    </trkseg>
  </trk>
</gpx>
```

#### 2. StravaService (Network)

Handles Strava OAuth and API uploads.

```swift
class StravaService {
    // OAuth configuration
    let clientId = "YOUR_STRAVA_CLIENT_ID"
    let redirectUri = "airuncoach://strava-callback"
    
    // Check if Strava is authenticated
    func isStravaAuthenticated() -> Bool {
        return KeychainManager.getStravaAccessToken() != nil
    }
    
    // Get Strava auth token (or refresh if expired)
    func getStravaToken() async throws -> String {
        if let token = KeychainManager.getStravaAccessToken() {
            return token
        }
        throw StravaError.notAuthenticated
    }
    
    // Initiate OAuth login flow
    func startStravaOAuth() -> URL {
        let scope = "activity:write"  // Scopes needed
        let state = UUID().uuidString
        KeychainManager.saveOAuthState(state)
        
        var components = URLComponents(string: "https://www.strava.com/oauth/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "state", value: state)
        ]
        return components.url!
    }
    
    // Handle OAuth callback
    func handleOAuthCallback(url: URL) async throws {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        guard let code = components?.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw StravaError.invalidCallback
        }
        
        // Exchange code for token (via backend)
        try await exchangeCodeForToken(code: code)
    }
    
    // Exchange OAuth code for access token (backend call)
    func exchangeCodeForToken(code: String) async throws {
        let response = try await apiService.post(
            endpoint: "/api/strava/auth/token",
            body: ["code": code]
        )
        let token = response["accessToken"] as? String
        try KeychainManager.saveStravaAccessToken(token)
    }
    
    // Upload GPX to Strava
    func uploadGPXToStrava(
        gpxData: String,
        runName: String,
        distance: Double,
        duration: Int
    ) async throws -> StravaUploadResponse {
        guard let token = try? await getStravaToken() else {
            throw StravaError.notAuthenticated
        }
        
        let response = try await apiService.post(
            endpoint: "/api/strava/upload",
            body: [
                "gpxData": gpxData,
                "name": runName,
                "distance": distance,
                "duration": duration,
                "accessToken": token
            ]
        )
        
        return StravaUploadResponse(
            stravaActivityId: response["stravaActivityId"] as? String,
            stravaUrl: response["stravaUrl"] as? String
        )
    }
}

struct StravaUploadResponse: Codable {
    let stravaActivityId: String?
    let stravaUrl: String?
}

enum StravaError: Error {
    case notAuthenticated
    case invalidCallback
    case uploadFailed(String)
    case networkError(Error)
}
```

#### 3. RunDataExportViewController / Screen

Manages the UI and user interactions for data export.

```swift
class RunDataExportView: UIView {
    @IBOutlet weak var downloadButton: UIButton!
    @IBOutlet weak var shareButton: UIButton!
    @IBOutlet weak var stravaButton: UIButton!
    @IBOutlet weak var statusLabel: UILabel!
    
    var runId: String?
    var runData: RunSession?
    var gpxFileURL: URL?
    
    var stravaService = StravaService()
    var gpxGenerator = GPXGenerator()
    
    // MARK: - Lifecycle
    
    func configureForRun(_ run: RunSession) {
        self.runData = run
        self.runId = run.id
        
        // Pre-generate GPX (cached)
        generateGPXIfNeeded()
        
        // Update Strava button based on auth status
        updateStravaButtonState()
    }
    
    // MARK: - Download
    
    @IBAction func downloadTapped() {
        guard let gpxURL = gpxFileURL else {
            showError("GPX file not available")
            return
        }
        
        downloadButton.isEnabled = false
        downloadButton.setTitle("Downloading…", for: .disabled)
        
        // Save to Documents folder
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileName = "run-\(runId ?? "export")-\(Date().timeIntervalSince1970).gpx"
        let destinationURL = documentsPath.appendingPathComponent(fileName)
        
        do {
            try FileManager.default.copyItem(at: gpxURL, to: destinationURL)
            showSuccess("Downloaded to Files app")
            downloadButton.isEnabled = true
            downloadButton.setTitle("Download", for: .normal)
        } catch {
            showError("Download failed: \(error.localizedDescription)")
            downloadButton.isEnabled = true
        }
    }
    
    // MARK: - Share
    
    @IBAction func shareTapped() {
        guard let gpxURL = gpxFileURL else {
            showError("GPX file not available")
            return
        }
        
        let activityVC = UIActivityViewController(
            activityItems: [gpxURL],
            applicationActivities: nil
        )
        
        self.window?.rootViewController?.present(activityVC, animated: true)
    }
    
    // MARK: - Strava Upload
    
    @IBAction func stravaTapped() {
        Task {
            await uploadToStrava()
        }
    }
    
    private func uploadToStrava() async {
        // Check authentication
        if !stravaService.isStravaAuthenticated() {
            await showStravaOAuthFlow()
            return
        }
        
        // Proceed with upload
        guard let gpxData = try? String(contentsOf: gpxFileURL!, encoding: .utf8),
              let runData = runData else {
            showError("Unable to prepare GPX for upload")
            return
        }
        
        stravaButton.isEnabled = false
        stravaButton.setTitle("Uploading to Strava…", for: .disabled)
        
        do {
            let response = try await stravaService.uploadGPXToStrava(
                gpxData: gpxData,
                runName: "Run on \(runData.completedAt?.formatted(date: .abbreviated, time: .omitted) ?? "today")",
                distance: runData.distance / 1000,  // Convert to km
                duration: runData.duration
            )
            
            // Success — open Strava activity
            if let url = response.stravaUrl {
                UIApplication.shared.open(URL(string: url)!)
                showSuccess("Uploaded to Strava! 🎉")
            }
            
            stravaButton.isEnabled = true
            updateStravaButtonState()
            
        } catch {
            showError("Strava upload failed: \(error.localizedDescription)")
            stravaButton.isEnabled = true
        }
    }
    
    private func showStravaOAuthFlow() async {
        let oauthURL = stravaService.startStravaOAuth()
        
        // Show system browser (SFSafariViewController)
        let safariVC = SFSafariViewController(url: oauthURL)
        safariVC.delegate = self
        
        self.window?.rootViewController?.present(safariVC, animated: true)
        
        // Note: Handle OAuth callback via deep link in AppDelegate:
        // func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        //     if let url = URLContexts.first?.url, url.scheme == "airuncoach" {
        //         Task {
        //             try await StravaService().handleOAuthCallback(url: url)
        //         }
        //     }
        // }
    }
    
    // MARK: - Helpers
    
    private func generateGPXIfNeeded() {
        guard let runData = runData else { return }
        guard gpxFileURL == nil else { return }  // Already generated
        
        let gpxString = gpxGenerator.generateGPX(
            routePoints: runData.routePoints,
            distance: runData.distance / 1000,
            duration: runData.duration,
            completedAt: runData.completedAt ?? Date(),
            totalElevationGain: runData.totalElevationGain
        )
        
        // Save to temp file
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "run-\(runId ?? "temp").gpx"
        gpxFileURL = tempDir.appendingPathComponent(fileName)
        
        try? gpxString.write(to: gpxFileURL!, atomically: true, encoding: .utf8)
    }
    
    private func updateStravaButtonState() {
        let isAuthenticated = stravaService.isStravaAuthenticated()
        stravaButton.setTitle(
            isAuthenticated ? "Upload to Strava" : "Login to Strava",
            for: .normal
        )
    }
    
    private func showSuccess(_ message: String) {
        statusLabel.text = message
        statusLabel.textColor = UIColor(named: "ColorPrimary")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            self.statusLabel.text = ""
        }
    }
    
    private func showError(_ message: String) {
        statusLabel.text = message
        statusLabel.textColor = UIColor(named: "ColorError")
    }
}

extension RunDataExportView: SFSafariViewControllerDelegate {
    func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        controller.dismiss(animated: true)
    }
}
```

---

## 🔗 API Integration

### Endpoints Required

#### 1. Exchange OAuth Code for Token

```
POST /api/strava/auth/token

Request:
{
  "code": "a4b945d783....",
  "redirectUri": "airuncoach://strava-callback"
}

Response:
{
  "accessToken": "a4b945d783...",
  "refreshToken": "...",  // optional
  "expiresAt": "2026-07-21T10:30:00Z"
}
```

#### 2. Upload GPX to Strava

```
POST /api/strava/upload

Request:
{
  "runId": "uuid",
  "gpxData": "<gpx>...</gpx>",
  "name": "Run on 2026-07-14",
  "distance": 4.07,
  "duration": 1800,
  "accessToken": "a4b945d783...."
}

Response:
{
  "stravaActivityId": "7234567890",
  "stravaUrl": "https://www.strava.com/activities/7234567890"
}

Error Response:
{
  "error": "invalid_token",
  "message": "Strava token has expired. Please re-authenticate."
}
```

---

## 🔐 Keychain & Auth Storage

Store sensitive Strava credentials securely:

```swift
class KeychainManager {
    private static let stravaTokenKey = "strava_access_token"
    private static let stravaRefreshTokenKey = "strava_refresh_token"
    private static let stravaExpiresAtKey = "strava_expires_at"
    private static let oauthStateKey = "oauth_state"
    
    static func saveStravaAccessToken(_ token: String) throws {
        let data = token.data(using: .utf8)!
        try saveToKeychain(data, forKey: stravaTokenKey)
    }
    
    static func getStravaAccessToken() -> String? {
        guard let data = try? retrieveFromKeychain(forKey: stravaTokenKey) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }
    
    static func saveOAuthState(_ state: String) {
        UserDefaults.standard.set(state, forKey: oauthStateKey)
    }
    
    static func getOAuthState() -> String? {
        return UserDefaults.standard.string(forKey: oauthStateKey)
    }
    
    static func clearStravaAuth() throws {
        try deleteFromKeychain(forKey: stravaTokenKey)
        try deleteFromKeychain(forKey: stravaRefreshTokenKey)
        UserDefaults.standard.removeObject(forKey: oauthExpiresAtKey)
    }
    
    // ... Helper methods: saveToKeychain, retrieveFromKeychain, deleteFromKeychain
}
```

---

## 📲 Deep Linking

### Handle Strava OAuth Callback

In `AppDelegate` or `SceneDelegate`:

```swift
func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    
    // Handle Strava OAuth callback
    if url.scheme == "airuncoach" && url.host == "strava-callback" {
        Task {
            do {
                try await StravaService().handleOAuthCallback(url: url)
                // Dismiss OAuth browser and refresh UI
                // Post notification to update ViewController
                NotificationCenter.default.post(name: NSNotification.Name("StravaAuthComplete"), object: nil)
            } catch {
                print("Strava OAuth error: \(error)")
            }
        }
    }
    
    // Handle deep link to Strava activity
    if url.scheme == "https" && url.host?.contains("strava.com") == true {
        UIApplication.shared.open(url)
    }
}
```

### Update Info.plist

Add URL scheme for OAuth callback:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>airuncoach</string>
        </array>
        <key>CFBundleURLName</key>
        <string>AI Run Coach</string>
    </dict>
</array>
```

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] GPXGenerator produces valid GPX 1.1 XML
- [ ] GPX includes all required fields: lat, lon, elevation, timestamp
- [ ] GPX file can be parsed by standard GPX readers (Strava, etc.)
- [ ] StravaService OAuth URL construction is correct
- [ ] Keychain storage/retrieval works for Strava token

### Integration Tests
- [ ] Download button saves GPX to Documents folder
- [ ] Downloaded file appears in Files app
- [ ] Share button shows iOS share sheet with GPX file
- [ ] OAuth flow initiates browser with correct scopes
- [ ] OAuth callback captures code and exchanges for token
- [ ] Token is stored securely in Keychain
- [ ] Upload GPX successfully to Strava (requires real token)
- [ ] Strava activity URL deep link opens activity in Strava app or browser

### E2E Tests

**Scenario 1: Download Run Data**
1. [ ] Open run summary
2. [ ] Tap "Download"
3. [ ] Status shows "Downloading…"
4. [ ] File saved to Documents folder
5. [ ] Status shows "Downloaded to Files"
6. [ ] Open Files app → Documents → see GPX file
7. [ ] Can open GPX in Maps or other app

**Scenario 2: Share Run Data**
1. [ ] Open run summary
2. [ ] Tap "Share"
3. [ ] iOS share sheet appears
4. [ ] Select "Messages" (or other app)
5. [ ] GPX file attaches to message
6. [ ] Recipient can download/open GPX

**Scenario 3: First-Time Strava Upload**
1. [ ] Open run summary
2. [ ] Tap "Upload to Strava"
3. [ ] Status shows "Login to Strava"
4. [ ] Browser opens Strava OAuth login
5. [ ] User logs in and grants permission
6. [ ] Browser redirects to app via `airuncoach://strava-callback`
7. [ ] App dismisses browser
8. [ ] Button now shows "Upload to Strava" (authenticated)

**Scenario 4: Upload to Strava (Authenticated)**
1. [ ] Open run summary (Strava already authenticated)
2. [ ] Tap "Upload to Strava"
3. [ ] Status shows "Uploading to Strava…"
4. [ ] Upload completes (~2-5 seconds)
5. [ ] Status shows "Uploaded to Strava! 🎉"
6. [ ] Deep link opens activity in Strava app (or browser)
7. [ ] Activity shows correct distance, time, elevation

**Scenario 5: Upload Error Handling**
1. [ ] Strava token expires
2. [ ] Attempt to upload
3. [ ] Server returns `invalid_token` error
4. [ ] User sees "Upload failed" with retry
5. [ ] Tap retry → initiates OAuth login again
6. [ ] After reauth, upload succeeds

---

## 🎨 Design Guidelines

### Colors
- **Primary buttons**: Teal (`#00BFFF`)
- **Strava button**: Salmon/Orange (`#FF5200`) with Strava logo
- **Secondary buttons**: Outlined with primary text
- **Status text**: Success (green), Error (red)

### Typography
- **Button text**: Bold, 16-18pt
- **Status label**: Regular, 14pt
- **Subtle help text**: Light grey, 12pt

### Spacing
- **Button margin**: 16pt horizontal, 8pt vertical between buttons
- **Section margin**: 24pt from other content
- **Icon size**: 20×20pt in buttons

---

## ⚠️ Important Implementation Notes

### 1. GPX File Format

**Critical fields**:
- `<trkpt lat="" lon="">` — latitude/longitude as attributes
- `<ele>` — elevation in metres
- `<time>` — ISO 8601 timestamp (required for Strava)
- `<name>` — run name in metadata

**Example valid trkpt**:
```xml
<trkpt lat="40.7829" lon="-73.9654">
  <ele>10.5</ele>
  <time>2026-07-14T06:30:00Z</time>
</trkpt>
```

### 2. Strava API Authentication

- Strava OAuth requires `activity:write` scope
- Token may expire after 6 hours — implement refresh token logic if available
- Rate limits: 200 requests per 15 minutes per token
- Always validate token before upload attempt

### 3. Keychain Best Practices

- Store tokens in **Keychain**, never in UserDefaults
- Use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` for maximum security
- On logout: **clear all Strava tokens from Keychain**

### 4. File Management

- **Temporary files**: Cleanup after upload (remove from temp directory)
- **Documents folder**: User can see these files in Files app — this is intentional for backup
- **Naming convention**: `run-{runId}-{timestamp}.gpx` (human-readable)

### 5. Deep Link Handling

- Strava OAuth callback: `airuncoach://strava-callback?code=...&state=...`
- Validate `state` parameter matches what was saved to prevent CSRF
- Handle both cases: user grants permission OR denies permission (return to app gracefully)

### 6. Network Resilience

- Implement retry logic for failed uploads (exponential backoff: 1s, 2s, 4s)
- Show user-friendly error messages ("Network error. Retry?")
- Don't upload without network connectivity — check reachability first

### 7. UI State Management

**Button states during operations:**
- Downloading: Disabled, text changes to "Downloading…"
- Uploading: Disabled, text changes to "Uploading to Strava…"
- Error: Enabled (retry), text shows error message
- Success: Show toast message, revert button after 3 seconds

### 8. A/B Testing Consideration

Track:
- How many users download GPX files
- How many authenticate with Strava
- How many successfully upload
- Dropout points in the flow

---

## 🔄 Strava Token Refresh (Optional but Recommended)

If backend returns a `refreshToken`, implement auto-refresh:

```swift
func getStravaTokenIfValid() async throws -> String {
    guard let token = KeychainManager.getStravaAccessToken() else {
        throw StravaError.notAuthenticated
    }
    
    // Check if expired
    if let expiresAt = KeychainManager.getStravaExpiresAt(),
       Date() > expiresAt {
        // Token expired, try refresh
        try await refreshStravaToken()
        return KeychainManager.getStravaAccessToken()!
    }
    
    return token
}

func refreshStravaToken() async throws {
    guard let refreshToken = KeychainManager.getStravaRefreshToken() else {
        throw StravaError.noRefreshToken
    }
    
    let response = try await apiService.post(
        endpoint: "/api/strava/auth/refresh",
        body: ["refreshToken": refreshToken]
    )
    
    let newToken = response["accessToken"] as? String
    let expiresAt = response["expiresAt"] as? String
    
    try KeychainManager.saveStravaAccessToken(newToken ?? "")
    try KeychainManager.saveStravaExpiresAt(expiresAt ?? "")
}
```

---

## 📚 File Locations

### Where Files are Stored

- **Temporary GPX**: `FileManager.default.temporaryDirectory/run-{runId}.gpx`
- **Downloaded GPX**: `Documents/run-{runId}-{timestamp}.gpx` (visible in Files app)
- **Auth tokens**: Keychain (encrypted)
- **OAuth state**: UserDefaults (not sensitive)

### Cleanup Strategy

```swift
// Clean up temp files on app launch or periodically
func cleanupTemporaryFiles() {
    let tempDir = FileManager.default.temporaryDirectory
    let fileManager = FileManager.default
    
    do {
        let files = try fileManager.contentsOfDirectory(at: tempDir, includingPropertiesForKeys: nil)
        let gpxFiles = files.filter { $0.pathExtension == "gpx" }
        
        for file in gpxFiles {
            try fileManager.removeItem(at: file)
        }
    } catch {
        print("Cleanup error: \(error)")
    }
}
```

---

## 🚀 Implementation Order

### Phase 1: File Management (1 day)
1. Create `GPXGenerator` class
2. Generate GPX from run data
3. Save to temp file on screen load
4. Implement "Download" button → copy to Documents

### Phase 2: Share Integration (1/2 day)
1. Implement "Share" button → iOS share sheet
2. Attach GPX file to share
3. Test with Messages, Mail, AirDrop

### Phase 3: Strava OAuth (1 day)
1. Create `StravaService` class
2. Implement OAuth flow (start browser, handle callback)
3. Store token securely in Keychain
4. Update button to show "Login to Strava" vs "Upload to Strava"

### Phase 4: Strava Upload (1 day)
1. Implement upload endpoint call
2. Handle success response (deep link to activity)
3. Handle error cases (retry, token refresh)
4. Show loading states and success/error messages

### Phase 5: Polish & Testing (1/2 day)
1. UI refinement (colours, spacing, button states)
2. Error message clarity
3. Comprehensive testing on real device
4. Handle edge cases (no internet, token expiry, etc.)

---

## Summary

**Strava Export & Integration** enables users to:
- ✅ **Download** run data as GPX (standard format supported by all fitness apps)
- ✅ **Share** run data via Messages, Mail, AirDrop, etc.
- ✅ **Upload** directly to Strava with one tap (if authenticated)
- ✅ **View activity** on Strava immediately after upload

**Technical approach**:
- **GPX generation**: In-memory XML construction (no external libraries needed)
- **OAuth**: Standard Strava OAuth 2.0 flow via SFSafariViewController
- **Upload**: Backend proxy to Strava API (keeps API key secret)
- **Storage**: Keychain for tokens, Documents folder for user-accessible backups
- **Deep linking**: iOS URL scheme + NSUserActivity for seamless Strava integration

**Timeline**: 2-3 days  
**Complexity**: Medium (OAuth flow + network requests)  
**User Impact**: High (seamless Strava integration is expected by fitness users)

---

## Questions for Implementation

1. **OAuth Client ID**: Has the backend Strava app been registered? Do we have the Client ID and secret?
2. **Deep linking**: Should we open the Strava app (if installed) or browser for activity view?
3. **Error tracking**: Should we log Strava upload errors to analytics?
4. **Token refresh**: Does Strava API return refresh tokens, or should we require re-auth after expiry?
5. **File cleanup**: Should downloaded GPX files be auto-deleted after X days, or left for user management?
