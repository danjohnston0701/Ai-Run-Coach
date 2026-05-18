# 📱 iOS Implementation Instructions for Xcode Agent

**Status**: Ready for iOS Implementation  
**Reference**: Android already complete  
**Framework**: Swift + SwiftUI  
**Time Estimate**: 2-3 hours

---

## 🎯 Mission

Replicate the complete Strava OAuth integration from Android to iOS using Swift and SwiftUI.

---

## 📖 Start Here

**Read this first**: [`iOS_STRAVA_IMPLEMENTATION_BRIEF.md`](./iOS_STRAVA_IMPLEMENTATION_BRIEF.md)

This brief contains:
- Complete code samples
- Step-by-step implementation
- Implementation checklist
- Success criteria

---

## 📋 Implementation Order

### **Phase 1: API Service** (15 minutes)
1. Add 5 response model structs (StravaAuthResponse, StravaConnectionStatus, etc.)
2. Add 5 API methods to your APIService (initiateStravaAuth, checkStravaConnection, etc.)
3. Test compilation

**Files to modify**: `APIService.swift` or equivalent

### **Phase 2: ViewModel** (20 minutes)
1. Create new file: `StravaViewModel.swift`
2. Copy the ViewModel implementation from the brief
3. Implement all methods (initiateStravaAuth, checkStravaConnection, publishToStrava, etc.)
4. Test with mock data

**Files to create**: `StravaViewModel.swift` (200+ lines)

### **Phase 3: UI Screens** (30 minutes)
1. Create new file: `StravaOAuthView.swift`
2. Copy the UI implementation from the brief
3. Implement all views and components
4. Test layout on various device sizes

**Files to create**: `StravaOAuthView.swift` (300+ lines)

### **Phase 4: Connected Devices Integration** (15 minutes)
1. Update your Connected Devices screen/view
2. Add Strava section BEFORE "Coming Soon"
3. Add NavigationLink to StravaOAuthView
4. **IMPORTANT**: Keep Apple Watch visible in "Coming Soon" (do NOT hide)

**Files to modify**: Connected Devices view file

### **Phase 5: Deep Link Handling** (10 minutes)
1. Add `.onOpenURL` handler to your App or SceneDelegate
2. Handle `airuncoach://strava/auth-complete` deep links
3. Trigger ViewModel to check connection on success

**Files to modify**: App.swift or SceneDelegate.swift

### **Phase 6: Testing** (30 minutes)
1. Build project
2. Run on simulator
3. Complete OAuth flow
4. Verify success dialog
5. Test error scenarios

---

## 🔍 What to Match from Android

### **UI Design**
- ✅ Orange Strava branding (#FC5200)
- ✅ Strava logo box (52x52)
- ✅ Benefits section (Route Maps, All Metrics, Social Share)
- ✅ Permissions explanation
- ✅ CTA button (56pt height)
- ✅ Loading state
- ✅ Error messages
- ✅ Success dialog with athlete name

### **Functionality**
- ✅ OAuth initiation
- ✅ Browser launch
- ✅ Connection status checking
- ✅ Token management (handled by backend)
- ✅ Async/await pattern for API calls
- ✅ Error handling with user-friendly messages
- ✅ Published properties for reactive UI

### **Architecture**
- ✅ ViewModel pattern
- ✅ Separation of concerns
- ✅ Reactive state management
- ✅ Clean API service
- ✅ Testable code structure

---

## 🎨 Key Differences from Android

**SwiftUI vs Compose:**
- Use `@StateObject` instead of `ViewModel` class
- Use `@Published` instead of `StateFlow`
- Use `async/await` instead of coroutines
- Use `NavigationStack` or `NavigationLink` for navigation
- Use `.onOpenURL` instead of intent filters

**But keep the same:**
- Same API endpoints
- Same response models (just Codable structs)
- Same user experience
- Same error handling patterns
- Same branding & colors

---

## 📝 Code Snippets Reference

**All code snippets are in the brief:**
- API Service methods
- ViewModel implementation (complete)
- UI Screen (complete)
- Connected Devices integration
- Deep link handling

Copy these directly into your project.

---

## 🧪 Testing Checklist

- [ ] Project builds without errors
- [ ] StravaViewModel initializes
- [ ] API methods are callable
- [ ] StravaOAuthView displays correctly
- [ ] Orange Strava branding is visible
- [ ] "Connect with Strava" button is tappable
- [ ] OAuth browser opens
- [ ] Can authorize in Strava
- [ ] Deep link is received
- [ ] Success dialog shows athlete name
- [ ] User can tap "Done"
- [ ] Returns to Connected Devices
- [ ] Apple Watch remains in "Coming Soon"

---

## ⚠️ Important Notes

### **DO**
✅ Use SwiftUI for all UI  
✅ Use async/await for all network calls  
✅ Implement proper error handling  
✅ Keep Apple Watch visible  
✅ Follow the same UX as Android  
✅ Use @MainActor for ViewModel  

### **DON'T**
❌ Don't hide Apple Watch  
❌ Don't use deprecated URLSession patterns  
❌ Don't implement token storage in app (it's on backend)  
❌ Don't skip error handling  
❌ Don't change the OAuth flow  

---

## 🚀 Quick Reference

**Main files to create:**
1. `StravaViewModel.swift` - Full implementation in brief
2. `StravaOAuthView.swift` - Full implementation in brief

**Main files to modify:**
1. `APIService.swift` - Add 5 methods
2. Connected Devices view - Add Strava section
3. `App.swift` or `SceneDelegate.swift` - Add deep link handler

**Colors:**
- Strava Orange: `Color(red: 0.99, green: 0.32, blue: 0)`

**API Endpoints:**
- GET `/api/strava/auth/authorize`
- GET `/api/strava/connection-status`
- POST `/api/runs/{id}/publish-strava`
- GET `/api/strava/activities`
- POST `/api/strava/disconnect`

---

## 📚 Documentation

**For more details, read:**
- [`iOS_STRAVA_IMPLEMENTATION_BRIEF.md`](./iOS_STRAVA_IMPLEMENTATION_BRIEF.md) - Complete code & details
- [`STRAVA_INTEGRATION_GUIDE.md`](./STRAVA_INTEGRATION_GUIDE.md) - Backend API details
- [`README_STRAVA_INTEGRATION.md`](./README_STRAVA_INTEGRATION.md) - Overall overview

---

## ✨ Success Looks Like

When complete, you should have:

```
✅ StravaViewModel.swift (200+ lines)
✅ StravaOAuthView.swift (300+ lines)
✅ APIService with Strava methods
✅ Updated Connected Devices view
✅ Deep link handling
✅ All tests passing
✅ OAuth flow working end-to-end
```

---

## 🎁 What You're Building

A complete Strava OAuth integration that allows users to:
- Tap "Connect Strava Account" in Settings
- See beautiful Strava branding
- Complete OAuth in browser
- Get success confirmation with athlete name
- (Future) Publish runs to Strava with one tap

---

## 🏁 Time Estimate

| Phase | Time | Total |
|-------|------|-------|
| API Service | 15 min | 15 min |
| ViewModel | 20 min | 35 min |
| UI Screens | 30 min | 65 min |
| Connected Devices | 15 min | 80 min |
| Deep Links | 10 min | 90 min |
| Testing | 30 min | 120 min |
| **Total** | | **2 hours** |

---

## 📞 If You Get Stuck

1. Check the detailed code in [`iOS_STRAVA_IMPLEMENTATION_BRIEF.md`](./iOS_STRAVA_IMPLEMENTATION_BRIEF.md)
2. Compare with Android implementation for patterns
3. Check API responses in [`STRAVA_INTEGRATION_GUIDE.md`](./STRAVA_INTEGRATION_GUIDE.md)
4. Test with print() statements and breakpoints

---

## 🎯 Your Next Action

1. **Open** [`iOS_STRAVA_IMPLEMENTATION_BRIEF.md`](./iOS_STRAVA_IMPLEMENTATION_BRIEF.md)
2. **Follow** the implementation steps
3. **Copy** code from the brief
4. **Test** each phase
5. **Verify** all checklist items
6. **Done!** ✅

---

**Ready? Let's go! 🚀**

