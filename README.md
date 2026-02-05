# 🏃 AI Run Coach - Android App

**Version:** 2.0  
**Status:** ✅ **Production Live** - Backend deployed, ready for testing  
**Last Updated:** February 5, 2026

---

## 📱 Overview

AI Run Coach is a cutting-edge Android fitness tracking application that combines GPS tracking, AI-powered coaching, and intelligent route generation to provide personalized running experiences.

### 🎯 Key Features
- 🗺️ **AI Route Generation** - GraphHopper-powered circular routes that return to start
- 🎯 **GPS Run Tracking** - Real-time location, pace, and distance tracking
- 🤖 **AI Coaching** - OpenAI GPT-4 powered personalized running coach
- 📊 **Goals Management** - Create and track running goals with progress analytics
- 👥 **Social Features** - Friends, groups, and live run tracking (planned)
- ⌚ **Garmin Integration** - Connect IQ companion app for wearables
- 📈 **Analytics** - Comprehensive run history and performance statistics

### 🚀 Production Status
- ✅ **Backend Live:** `https://airuncoach.live`
- ✅ **APK Ready:** 24 MB debug build available
- ✅ **Garmin App Built:** Simulator tested and ready
- ⏳ **Testing:** Ready for comprehensive feature testing

---

## 🚀 Quick Start

### Prerequisites
- **Android Studio:** Hedgehog (2023.1.1) or later
- **Android SDK:** API 24+ (Android 7.0+)
- **JDK:** 17 or later
- **Node.js:** 18+ (for backend development, optional)

### Installation

#### Option 1: Install Pre-built APK (Fastest)
```bash
# APK location
app/build/outputs/apk/debug/app-debug.apk

# Install via USB
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Or copy to device and install from Files app
```

#### Option 2: Build from Source
```bash
# Clone repository
git clone <repository-url>
cd AiRunCoach

# Open in Android Studio
# File → Open → Select project directory
# Wait for Gradle sync

# Build debug APK
./gradlew assembleDebug

# Install on connected device
./gradlew installDebug
```

#### Option 3: Run from Android Studio
1. Open project in Android Studio
2. Connect Android device via USB (or use emulator)
3. Click **Run** button (green play icon) or press `Shift + F10`
4. Select your device
5. App installs and launches automatically

---

## 🏗️ Architecture

### Tech Stack
- **Language:** Kotlin 1.9
- **UI Framework:** Jetpack Compose (Material 3)
- **Architecture:** MVVM with ViewModels
- **Dependency Injection:** Hilt/Dagger
- **Navigation:** Compose Navigation
- **Networking:** Retrofit 2 + OkHttp 4
- **Async:** Coroutines + Flow
- **Database:** Room (local), PostgreSQL via API (remote)
- **Maps:** Google Maps SDK for Android
- **Location:** Google Play Services Location API
- **Background:** Foreground Services

### Backend Stack
- **Runtime:** Node.js 22
- **Framework:** Express.js
- **Database:** PostgreSQL (Neon.com)
- **AI:** OpenAI GPT-4
- **Maps:** Google Maps API, GraphHopper API
- **Auth:** JWT tokens
- **Deployment:** Replit → Google Cloud Run
- **URL:** https://airuncoach.live

### Project Structure
```
app/
├── src/main/java/live/airuncoach/airuncoach/
│   ├── data/              # Data layer (SessionManager, GarminAuthManager)
│   ├── di/                # Hilt modules (AppModule)
│   ├── domain/model/      # Domain models (RunSession, Goal, Route, etc.)
│   ├── network/           # API services and network models
│   │   ├── ApiService.kt
│   │   ├── RetrofitClient.kt
│   │   └── model/         # API request/response models
│   ├── service/           # Background services (RunTrackingService)
│   ├── ui/
│   │   ├── components/    # Reusable UI components
│   │   │   ├── TargetTimeCard.kt
│   │   │   ├── RunCharts.kt
│   │   │   └── RawDataViews.kt
│   │   ├── screens/       # Screen composables
│   │   │   ├── DashboardScreen.kt
│   │   │   ├── MapMyRunSetupScreen.kt  ← Unified run setup
│   │   │   ├── RouteGenerationScreen.kt
│   │   │   ├── RunSessionScreen.kt
│   │   │   ├── GoalsScreen.kt
│   │   │   └── ProfileScreen.kt
│   │   ├── navigation/    # Navigation graph
│   │   │   └── RootNavigationGraph.kt
│   │   └── theme/         # App theming (Colors, Typography, Theme)
│   ├── util/              # Utilities
│   ├── utils/             # Additional utilities (AudioPlayerHelper)
│   └── viewmodel/         # ViewModels for each screen
└── src/main/res/          # Resources (drawables, xml configs)
    ├── drawable/          # Vector icons
    ├── xml/               # Network security, file paths
    └── values/            # Strings, colors, themes

garmin-companion-app/      # Garmin Connect IQ App
├── source/                # Monkey C source code
│   ├── AiRunCoachApp.mc
│   ├── views/
│   │   ├── StartView.mc   # Pre-run screen
│   │   └── RunView.mc     # Run tracking screen
│   └── networking/
│       └── DataStreamer.mc
├── resources/             # UI resources
├── bin/AiRunCoach.prg    # Built app (107 KB)
└── manifest.xml          # App metadata
```

---

## 🔧 Configuration

### Backend Configuration

**File:** `app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt`

```kotlin
// Line 98 - Toggle between local and production backend
val useLocalBackend = false // false = production, true = local

// Backend URLs
val baseUrl = if (BuildConfig.DEBUG) {
    if (useLocalBackend) {
        // LOCAL DEV: Your Mac's IP address
        "http://192.168.18.14:5000"
    } else {
        // PRODUCTION: Live backend
        "https://airuncoach.live"
    }
} else {
    // RELEASE builds always use production
    "https://airuncoach.live"
}
```

**Current Setting:**
- ✅ `useLocalBackend = false` (points to production)
- ✅ Production URL: `https://airuncoach.live`

### Google Maps API Key

**File:** `app/src/main/AndroidManifest.xml`

```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="YOUR_GOOGLE_MAPS_API_KEY"/>
```

**To update:** Replace `YOUR_GOOGLE_MAPS_API_KEY` with your key from Google Cloud Console.

### Network Security

**File:** `app/src/main/res/xml/network_security_config.xml`

Allows both HTTPS (production) and HTTP (local development) connections.

---

## 🎮 Building & Running

### Build Commands

```bash
# Clean build
./gradlew clean

# Build debug APK
./gradlew assembleDebug

# Build release APK (requires signing config)
./gradlew assembleRelease

# Install debug build on connected device
./gradlew installDebug

# Run all tests
./gradlew test

# Run lint checks
./gradlew lint
```

### Common Issues

**"SDK location not found"**
- Create `local.properties` in project root
- Add: `sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk`

**"Gradle sync failed"**
- File → Invalidate Caches → Restart
- Or delete `.gradle` and `build` folders, then sync again

**"Cannot resolve symbol"**
- Make sure Gradle sync completed successfully
- Build → Rebuild Project

---

## 🧪 Testing

### Run Full App Test Suite
```bash
# Android app
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
./gradlew test

# Backend (separate repo)
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
npm test
```

### Test Production Backend
```bash
# Health check
curl https://airuncoach.live/api/health
# Expected: {"status":"ok"}

# Test authentication (should return 401)
curl https://airuncoach.live/api/profile
# Expected: 401 Unauthorized
```

### Feature Testing Checklist

Test these features on physical device:

**Authentication:**
- [ ] User signup
- [ ] User login
- [ ] Session persistence

**Dashboard:**
- [ ] Dashboard loads
- [ ] Quick actions visible
- [ ] Navigation works

**Route Generation:**
- [ ] Tap "Map My Run"
- [ ] Set distance (5 km)
- [ ] Click "Generate Route"
- [ ] Wait 1-3 minutes for AI generation
- [ ] 3 routes appear
- [ ] Routes are circular (return to start)
- [ ] Routes are different each time

**Run Session:**
- [ ] Start run (with or without route)
- [ ] GPS tracking works
- [ ] Pace/distance updates in real-time
- [ ] Map shows current location
- [ ] AI coaching appears during run
- [ ] Complete run successfully
- [ ] Run saves to history

**Run History:**
- [ ] Previous runs load
- [ ] Run details display correctly
- [ ] Charts render properly

**Goals:**
- [ ] Create new goal
- [ ] View goal progress
- [ ] Edit goal
- [ ] Delete goal

**Profile:**
- [ ] View profile
- [ ] Upload profile picture
- [ ] Update settings

---

## ⌚ Garmin Integration

### Quick Start

**Launch Simulator:**
```bash
./launch-garmin-simulator.sh
```

**Manual Launch:**
```bash
# Start Connect IQ Simulator
/Users/danieljohnston/Library/Application\ Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-8.4.0-2025-12-03-5122605dc/bin/connectiq &

# Load app on Fenix 7
cd garmin-companion-app
/Users/danieljohnston/Library/Application\ Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-8.4.0-2025-12-03-5122605dc/bin/monkeydo bin/AiRunCoach.prg fenix7
```

**Simulator Controls:**
- **Center button (Enter):** Start run / Select
- **Back button (Esc):** Pause / Back
- **Menu button (M):** Show menu
- **Arrow keys:** Navigate up/down

### Garmin App Features
- Real-time heart rate display (color-coded by zone)
- GPS tracking with distance and pace
- Cadence monitoring
- AI coaching text on watch face
- Data streaming to phone app
- Activity recording to Garmin Connect

**Documentation:** See `GARMIN_SIMULATOR_GUIDE.md`

---

## 📚 Documentation

### Main Documentation Files

**Project Overview:**
- `README.md` - This file (quick start, architecture, features)
- `PROJECT_STATUS.md` - Detailed project status and roadmap

**Deployment:**
- `PRODUCTION_DEPLOYMENT_GUIDE.md` - Complete deployment guide
- `BACKEND_SYNC_CHECKLIST.md` - Backend sync verification

**Development:**
- `RUN_SETUP_UNIFIED_DOCUMENTATION.md` - Run setup screen specifications
- `NEVER_DO_THIS.md` - Prevention guidelines and code review checklist
- `SESSION_SUMMARY_FEB_5_2026.md` - Latest session summary

**Garmin:**
- `GARMIN_SIMULATOR_GUIDE.md` - Complete Garmin testing guide
- `GARMIN_COMPANION_COMPLETE.md` - Garmin feature completion
- `GARMIN_READY_TO_SUBMIT.md` - Connect IQ submission guide

**Backend:**
- `BACKEND_LOCATION.md` - Backend repository information
- `DEPLOYMENT_STATUS.md` - Deployment status tracking

**Quick Reference:**
- `DOCUMENTATION_UPDATE_FEB_5_2026.md` - Documentation index

---

## 🚀 Recent Changes (February 5, 2026)

### ✅ Production Backend Deployed
- Fixed Replit deployment (removed --env-file flag)
- Set all environment variables in Replit Secrets
- Backend live at `https://airuncoach.live`
- Health check endpoint working
- All GraphHopper fixes deployed

### ✅ Run Setup Screen Unified
- Deleted old `RunSetupScreen.kt`
- Enhanced `MapMyRunSetupScreen.kt` as single source
- Added dual action buttons (Generate Route / Start Without Route)
- Added close icon (X) and home navigation
- Doubled Target Time Card size (better touch targets)
- Reduced AI Coach Toggle size by 25%

### ✅ Garmin Simulator Configured
- Created `launch-garmin-simulator.sh` launcher
- Comprehensive testing guide (`GARMIN_SIMULATOR_GUIDE.md`)
- Tested on Fenix 7 simulator
- Start View and Run View verified

### ✅ Documentation Expanded
- 8 new documentation files (60+ KB)
- Production deployment guide
- Backend sync checklist
- Garmin testing procedures
- Prevention guidelines

---

## 🔗 Important Links

**Production:**
- Backend API: https://airuncoach.live
- Health Check: https://airuncoach.live/api/health

**Repositories:**
- Android: `/Users/danieljohnston/AndroidStudioProjects/AiRunCoach`
- Backend: `/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android`
- GitHub: https://github.com/danjohnston0701/Ai-Run-Coach-IOS-and-Android

**Documentation:**
- Quick Start: This file (`README.md`)
- Full Status: `PROJECT_STATUS.md`
- Deployment: `PRODUCTION_DEPLOYMENT_GUIDE.md`
- Garmin: `GARMIN_SIMULATOR_GUIDE.md`

---

## 🐛 Troubleshooting

### App won't build
```bash
# Clean and rebuild
./gradlew clean
./gradlew assembleDebug

# If that doesn't work, invalidate caches
# Android Studio → File → Invalidate Caches → Restart
```

### Cannot connect to backend
- Check `RetrofitClient.kt` - is `useLocalBackend = false`?
- Verify production backend is live: `curl https://airuncoach.live/api/health`
- Check network security config allows HTTPS

### GPS not working
- Enable location permissions in device settings
- Test outdoors for better GPS signal
- Check Google Play Services is up to date

### Route generation timeout
- Normal! AI generation takes 1-3 minutes
- Check backend logs for errors
- Verify OpenAI and GraphHopper API keys are set

### Garmin simulator won't load
```bash
# Kill any running instances
pkill -f ConnectIQ

# Restart simulator
./launch-garmin-simulator.sh
```

---

## 📊 Project Statistics

**Code Metrics:**
- Android App: ~15,000+ lines of Kotlin
- Backend API: ~10,000+ lines of TypeScript
- Garmin App: ~1,000+ lines of Monkey C
- Documentation: 76+ markdown files (60+ KB added today)

**Features:**
- ✅ Completed: 28 features
- 🚧 In Progress: 0 features
- 📋 Planned: 30+ features

**Deployment:**
- Backend: ✅ Live in production (Replit)
- Android: ✅ APK ready for testing (24 MB)
- Garmin: ✅ Built and simulator tested (107 KB)

---

## 🎯 Next Steps

**Immediate (This Week):**
1. ⏳ Test complete run session on physical device
2. ⏳ Test route generation end-to-end (3 circular routes)
3. ⏳ Validate GPS tracking accuracy
4. ⏳ Test AI coaching during actual run
5. ⏳ Verify run history and data persistence

**Short Term (Next 2 Weeks):**
1. ⏳ Polish UI based on testing feedback
2. ⏳ Test Garmin watch app on real device
3. ⏳ Implement Garmin data sync (bidirectional)
4. ⏳ Fix any bugs discovered
5. ⏳ Prepare app store screenshots

**Medium Term (Next Month):**
1. ⏳ Submit Garmin app to Connect IQ Store
2. ⏳ Beta testing with small group
3. ⏳ Implement friends and social features
4. ⏳ Add event system
5. ⏳ Consider Railway migration (optional performance boost)

---

## 📄 License

Copyright © 2026 AI Run Coach. All rights reserved.

---

## 📞 Support

For questions or issues:
- 📧 Email: support@airuncoach.live
- 📚 Documentation: See `PROJECT_STATUS.md` for detailed information
- 🐛 Issues: Check `NEVER_DO_THIS.md` for common pitfalls

---

**Status:** 🚀 **PRODUCTION LIVE - READY FOR TESTING**

**Last Updated:** February 5, 2026  
**Build:** app-debug.apk (24 MB)  
**Backend:** https://airuncoach.live ✅
