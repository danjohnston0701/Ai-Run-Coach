# 📋 iOS Strava Integration - Implementation Brief for Xcode Agent

**Status**: Ready for Implementation  
**Target**: iOS App (Swift/SwiftUI)  
**Date**: May 19, 2026  
**Reference**: Android implementation completed  
**Note**: Keep Apple Watch in Connected Devices (do NOT hide)

---

## 🎯 Overview

Replicate the complete Strava OAuth integration from Android to iOS. Follow the exact same architecture, patterns, and flows.

---

## ✅ What to Build

### **1. API Service Integration**

**Add to your APIService/NetworkManager:**

```swift
// MARK: - Strava OAuth
@available(iOS 13.0, *)
func initiateStravaAuth() async throws -> StravaAuthResponse {
    let endpoint = "/api/strava/auth/authorize"
    return try await request(endpoint, method: "POST", body: [:])
}

func checkStravaConnection() async throws -> StravaConnectionStatus {
    let endpoint = "/api/strava/connection-status"
    return try await request(endpoint, method: "GET")
}

func publishRunToStrava(runId: String) async throws -> StravaPublishResponse {
    let endpoint = "/api/runs/\(runId)/publish-strava"
    return try await request(endpoint, method: "POST", body: [:])
}

func getStravaActivities() async throws -> StravaActivitiesResponse {
    let endpoint = "/api/strava/activities"
    return try await request(endpoint, method: "GET")
}

func disconnectStrava() async throws {
    let endpoint = "/api/strava/disconnect"
    _ = try await request(endpoint, method: "POST", body: [:]) as EmptyResponse
}
```

**Add Response Models:**

```swift
struct StravaAuthResponse: Codable {
    let authUrl: String
    let state: String
}

struct StravaConnectionStatus: Codable {
    let connected: Bool
    let athleteName: String?
    let athleteId: String?
    let lastSync: String?
    let tokenExpired: Bool
}

struct StravaPublishResponse: Codable {
    let success: Bool
    let activityId: String?
    let stravaUrl: String?
    let error: String?
}

struct StravaActivitiesResponse: Codable {
    let activities: [StravaActivityData]
}

struct StravaActivityData: Codable {
    let id: String
    let name: String
    let distance: Double
    let duration: Int
    let completedAt: String
    let stravaUrl: String
    let stravaId: String
}

struct EmptyResponse: Codable {}
```

---

### **2. ViewModel Implementation**

**Create: `StravaViewModel.swift`**

```swift
import Foundation
import Combine

@MainActor
class StravaViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var connectionStatus: StravaConnectionStatus = StravaConnectionStatus(
        connected: false,
        athleteName: nil,
        athleteId: nil,
        lastSync: nil,
        tokenExpired: false
    )
    
    @Published var isLoading = false
    @Published var error: String?
    @Published var publishResult: StravaPublishResponse?
    @Published var activities: [StravaActivityData] = []
    
    // MARK: - Private Properties
    private let apiService: APIService
    
    // MARK: - Initialization
    init(apiService: APIService = .shared) {
        self.apiService = apiService
        checkStravaConnection()
    }
    
    // MARK: - Public Methods
    
    /// Check current Strava connection status
    func checkStravaConnection() {
        Task {
            isLoading = true
            defer { isLoading = false }
            
            do {
                let status = try await apiService.checkStravaConnection()
                self.connectionStatus = status
                self.error = nil
            } catch {
                self.error = "Failed to check Strava connection: \(error.localizedDescription)"
            }
        }
    }
    
    /// Initiate Strava OAuth flow
    func initiateStravaAuth() {
        Task {
            isLoading = true
            defer { isLoading = false }
            
            do {
                let response = try await apiService.initiateStravaAuth()
                
                if let url = URL(string: response.authUrl) {
                    // Open in Safari
                    DispatchQueue.main.async {
                        if #available(iOS 15.0, *) {
                            UIApplication.shared.open(url)
                        } else {
                            UIApplication.shared.open(url)
                        }
                    }
                } else {
                    self.error = "Invalid Strava OAuth URL"
                }
            } catch {
                self.error = "Failed to initiate Strava auth: \(error.localizedDescription)"
            }
        }
    }
    
    /// Disconnect Strava account
    func disconnectStrava() {
        Task {
            isLoading = true
            defer { isLoading = false }
            
            do {
                try await apiService.disconnectStrava()
                self.connectionStatus = StravaConnectionStatus(
                    connected: false,
                    athleteName: nil,
                    athleteId: nil,
                    lastSync: nil,
                    tokenExpired: false
                )
                self.activities = []
                self.error = nil
            } catch {
                self.error = "Failed to disconnect Strava: \(error.localizedDescription)"
            }
        }
    }
    
    /// Publish a run to Strava
    func publishToStrava(runId: String) {
        Task {
            isLoading = true
            defer { isLoading = false }
            
            publishResult = nil
            
            do {
                let result = try await apiService.publishRunToStrava(runId: runId)
                self.publishResult = result
                self.error = nil
                
                if result.success {
                    // Refresh activities after a delay
                    try? await Task.sleep(nanoseconds: 3_000_000_000) // 3 seconds
                    fetchStravaActivities()
                }
            } catch {
                self.publishResult = StravaPublishResponse(
                    success: false,
                    activityId: nil,
                    stravaUrl: nil,
                    error: "Failed to publish run: \(error.localizedDescription)"
                )
                self.error = "Failed to publish run: \(error.localizedDescription)"
            }
        }
    }
    
    /// Fetch list of Strava activities
    func fetchStravaActivities() {
        Task {
            isLoading = true
            defer { isLoading = false }
            
            do {
                let response = try await apiService.getStravaActivities()
                self.activities = response.activities
                self.error = nil
            } catch {
                self.error = "Failed to fetch Strava activities: \(error.localizedDescription)"
            }
        }
    }
    
    /// Clear error message
    func clearError() {
        error = nil
    }
    
    /// Clear publish result
    func clearPublishResult() {
        publishResult = nil
    }
}
```

---

### **3. UI Screens**

**Create: `StravaOAuthView.swift`**

```swift
import SwiftUI

struct StravaOAuthView: View {
    @StateObject private var viewModel: StravaViewModel
    @Environment(\.dismiss) var dismiss
    @State private var showSuccessAlert = false
    
    init(viewModel: StravaViewModel = StravaViewModel()) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 24) {
                    // Header with back button
                    HStack {
                        Button(action: { dismiss() }) {
                            HStack(spacing: 8) {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .foregroundColor(.blue)
                        }
                        Spacer()
                    }
                    .padding(.horizontal)
                    
                    // Strava Logo
                    VStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color(red: 0.99, green: 0.32, blue: 0))  // Strava Orange
                                .frame(width: 100, height: 100)
                            
                            Text("S")
                                .font(.system(size: 56, weight: .bold))
                                .foregroundColor(.white)
                        }
                        
                        Text("Connect Your Strava Account")
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        Text("Publish your runs with full GPS data and metrics")
                            .font(.body)
                            .foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.vertical, 24)
                    
                    // Benefits Section
                    VStack(spacing: 12) {
                        Text("What You'll Get")
                            .font(.headline)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        
                        benefitRow(icon: "location.fill", title: "Route Maps", description: "Beautiful GPS route visualization")
                        benefitRow(icon: "heart.fill", title: "All Metrics", description: "HR, cadence, elevation, and more")
                        benefitRow(icon: "square.and.arrow.up", title: "Social Sharing", description: "Share your runs with friends")
                    }
                    .padding(16)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(12)
                    
                    // Permissions Section
                    VStack(spacing: 8) {
                        HStack(spacing: 12) {
                            Image(systemName: "info.circle")
                                .foregroundColor(Color(red: 0.99, green: 0.32, blue: 0))
                                .font(.headline)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("What Permissions You're Granting")
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                
                                Text("• Write access: Publish your runs\n• Read access: View your activities\n• Profile data: Your name and info")
                                    .font(.caption)
                                    .lineSpacing(2)
                            }
                            Spacer()
                        }
                    }
                    .padding(12)
                    .background(Color(red: 0.99, green: 0.32, blue: 0).opacity(0.1))
                    .cornerRadius(8)
                    
                    // Error Message
                    if let error = viewModel.error {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.circle")
                                .foregroundColor(.red)
                            
                            Text(error)
                                .font(.caption)
                                .lineSpacing(2)
                            
                            Spacer()
                        }
                        .padding(12)
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(8)
                    }
                    
                    Spacer()
                    
                    // Main CTA Button
                    Button(action: { viewModel.initiateStravaAuth() }) {
                        HStack(spacing: 12) {
                            if viewModel.isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "link")
                            }
                            
                            Text(viewModel.isLoading ? "Opening Strava..." : "Connect with Strava")
                                .fontWeight(.bold)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(Color(red: 0.99, green: 0.32, blue: 0))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(viewModel.isLoading)
                    
                    // Privacy Notice
                    Text("You'll be securely redirected to Strava. Your data is never shared with anyone except Strava.")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                }
                .padding()
            }
            
            // Success Dialog
            if viewModel.connectionStatus.connected && viewModel.connectionStatus.athleteName != nil {
                successDialog
                    .onAppear {
                        showSuccessAlert = true
                    }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Connect Strava")
                    .font(.headline)
            }
        }
    }
    
    // MARK: - Helper Views
    
    private func benefitRow(icon: String, title: String, description: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundColor(Color(red: 0.99, green: 0.32, blue: 0))
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                
                Text(description)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
        }
    }
    
    private var successDialog: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 48))
                .foregroundColor(.green)
            
            Text("Connected!")
                .font(.headline)
            
            Text("Your Strava account (\(viewModel.connectionStatus.athleteName ?? "Strava")) is now connected. You can now publish your runs directly to Strava with one tap.")
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundColor(.gray)
            
            Button(action: { dismiss() }) {
                Text("Done")
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(8)
            }
        }
        .padding(24)
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .padding(40)
        .background(Color.black.opacity(0.4))
    }
}

// Preview
#if DEBUG
struct StravaOAuthView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            StravaOAuthView()
        }
    }
}
#endif
```

---

### **4. Update Connected Devices Screen**

**Modify: `ConnectedDevicesView.swift` (or similar)**

**Add to navigation options:**

```swift
// Add this to your connected devices list BEFORE "Coming Soon" section

Section(header: Text("STRAVA")) {
    NavigationLink(destination: StravaOAuthView()) {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color(red: 0.99, green: 0.32, blue: 0))
                    .frame(width: 52, height: 52)
                
                Text("S")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text("Strava Integration")
                    .font(.headline)
                
                Text("Publish runs with complete GPS data")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.gray)
        }
        .padding(.vertical, 12)
    }
}

// IMPORTANT: Keep Apple Watch section - DO NOT HIDE
Section(header: Text("COMING SOON")) {
    // Keep existing Apple Watch entry here
    HStack(spacing: 12) {
        Image(systemName: "applewatch")
            .font(.headline)
            .foregroundColor(.gray)
        
        VStack(alignment: .leading, spacing: 2) {
            Text("Apple Watch")
                .font(.headline)
            
            Text("Connect via Apple HealthKit")
                .font(.caption)
                .foregroundColor(.gray)
        }
        
        Spacer()
        
        Text("Coming Soon")
            .font(.caption)
            .foregroundColor(.gray)
    }
    .padding(.vertical, 12)
    .opacity(0.5)
}
```

---

### **5. Deep Link Handling**

**Add to your App or SceneDelegate:**

```swift
// In your App struct or SceneDelegate
.onOpenURL { url in
    if url.scheme == "airuncoach" && url.host == "strava" {
        // Handle Strava OAuth callback
        if url.path == "/auth-complete" {
            let query = URLComponents(url: url, resolvingAgainstBaseURL: true)?
                .queryItems
            
            if let success = query?.first(where: { $0.name == "success" })?.value,
               success == "true" {
                // Show success - trigger ViewModel to check connection
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    stravaViewModel.checkStravaConnection()
                }
            }
        }
    }
}
```

---

### **6. Share to Strava (Future Feature)**

**Optional: Add to post-run screen**

```swift
Button(action: { 
    viewModel.publishToStrava(runId: run.id)
}) {
    HStack(spacing: 8) {
        Image(systemName: "square.and.arrow.up")
        Text("Share to Strava")
    }
    .frame(maxWidth: .infinity)
    .padding()
    .background(Color(red: 0.99, green: 0.32, blue: 0))
    .foregroundColor(.white)
    .cornerRadius(8)
}
```

---

## 📋 Implementation Checklist

### **Step 1: API Integration** (15 min)
- [ ] Add StravaAuthResponse, StravaConnectionStatus, etc. models
- [ ] Add 5 Strava API methods to APIService
- [ ] Test API calls compile

### **Step 2: ViewModel** (20 min)
- [ ] Create StravaViewModel.swift
- [ ] Implement all methods (initiate, check, publish, etc.)
- [ ] Test with mock data

### **Step 3: UI Screens** (30 min)
- [ ] Create StravaOAuthView.swift
- [ ] Implement all UI elements
- [ ] Test layout on different devices

### **Step 4: Connected Devices Integration** (15 min)
- [ ] Add Strava section to Connected Devices
- [ ] Add navigation link to StravaOAuthView
- [ ] **Keep Apple Watch section visible** (do NOT hide)

### **Step 5: Deep Link Handling** (10 min)
- [ ] Add onOpenURL handler
- [ ] Test deep link callback from backend

### **Step 6: Testing** (30 min)
- [ ] Build and run on simulator
- [ ] Test complete OAuth flow
- [ ] Verify success dialog appears
- [ ] Test error scenarios

---

## 🎨 Strava Branding

**Color**: `Color(red: 0.99, green: 0.32, blue: 0)` or hex `#FC5200`  
**Logo**: Orange circle with white "S"  
**Font**: Use system fonts (San Francisco)  
**Style**: Material Design inspired, clean & modern

---

## 🔐 Important Security Notes

1. **Deep Link Verification**: Verify `airuncoach://strava/auth-complete`
2. **Token Storage**: Tokens stored on backend, not in app
3. **HTTPS Only**: All API calls use HTTPS
4. **State Validation**: Backend validates OAuth state

---

## 📝 Notes for Implementation

- Follow the same patterns as Android implementation
- Use async/await for all network calls
- Implement proper error handling with user-friendly messages
- Keep Apple Watch in "Coming Soon" section (do NOT hide)
- Test on both iPhone and iPad
- Use SwiftUI for consistency with modern iOS apps

---

## 🔗 Reference Files

**Android Implementation (for reference)**:
- `StravaOAuthScreen.kt` - UI patterns
- `StravaViewModel.kt` - Logic patterns
- `ApiService.kt` - API structure

**Backend**:
- See `STRAVA_INTEGRATION_GUIDE.md` for API details

---

## ✅ Deliverables

When complete, you should have:
- ✅ StravaViewModel.swift (200+ lines)
- ✅ StravaOAuthView.swift (300+ lines)
- ✅ Updated ConnectedDevicesView with Strava section
- ✅ API service methods integrated
- ✅ Deep link handling configured
- ✅ All compiling without errors
- ✅ Tested OAuth flow end-to-end

---

## 🚀 Success Criteria

- [ ] Code compiles without errors
- [ ] Strava OAuth screen appears
- [ ] User can tap "Connect with Strava"
- [ ] Browser opens with OAuth URL
- [ ] Deep link callback is received
- [ ] Success dialog shows with athlete name
- [ ] User returns to Connected Devices

---

**Brief Created**: May 19, 2026  
**Target**: iOS Swift/SwiftUI Implementation  
**Status**: Ready for Implementation  
**Reference**: Android implementation complete

