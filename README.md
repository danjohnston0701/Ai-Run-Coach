# 🏃 AI Run Coach - Android App

**Version:** 2.0  
**Status:** Production Ready (Awaiting Backend Deployment)  
**Last Updated:** February 5, 2026

---

## 📱 Overview

AI Run Coach is a cutting-edge Android fitness tracking application that combines GPS tracking, AI-powered coaching, and intelligent route generation to provide personalized running experiences.

### Key Features
- 🗺️ **AI Route Generation** - GraphHopper-powered intelligent route creation
- 🎯 **GPS Run Tracking** - Real-time location, pace, and distance tracking
- 🤖 **AI Coaching** - OpenAI-powered personalized running coach
- 📊 **Goals Management** - Create and track running goals
- 👥 **Social Features** - Friends, groups, and live tracking
- ⌚ **Garmin Integration** - Connect IQ app support
- 📈 **Analytics** - Comprehensive run history and statistics

---

## 🚀 Quick Start

### Prerequisites
- Android Studio Hedgehog (2023.1.1) or later
- Android SDK 24+ (Android 7.0+)
- JDK 17
- Node.js 18+ (for backend)

### Installation

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd AiRunCoach
   ```

2. **Open in Android Studio**
   - File → Open → Select project directory
   - Wait for Gradle sync

3. **Build APK**
   ```bash
   ./gradlew assembleDebug
   ```

4. **Install on Device**
   ```bash
   ./gradlew installDebug
   ```

---

## 🏗️ Architecture

### Tech Stack
- **Language:** Kotlin
- **UI Framework:** Jetpack Compose
- **Architecture:** MVVM with ViewModels
- **Dependency Injection:** Hilt/Dagger
- **Navigation:** Compose Navigation
- **Networking:** Retrofit + OkHttp
- **Database:** Room (local), PostgreSQL (remote)
- **Maps:** Google Maps SDK
- **Location:** Google Play Services

### Project Structure
```
app/
├── src/main/java/live/airuncoach/airuncoach/
│   ├── data/              # Data layer (SessionManager, etc.)
│   ├── di/                # Dependency injection modules
│   ├── domain/model/      # Domain models
│   ├── network/           # API services and models
│   ├── service/           # Background services
│   ├── ui/
│   │   ├── components/    # Reusable UI components
│   │   ├── screens/       # Screen composables
│   │   └── theme/         # App theming
│   ├── util/              # Utilities
│   ├── utils/             # Additional utilities
│   └── viewmodel/         # ViewModels
└── src/main/res/          # Resources (drawables, xml)
```

---

## 🔧 Configuration

### Backend Configuration

**File:** `app/src/main/java/live/airuncoach/airuncoach/network/RetrofitClient.kt`

```kotlin
// Line 98 - Toggle between local and production backend
val useLocalBackend = false // false = production, true = local

// Backend URLs
Production: https://airuncoach.live
Local (Emulator): http://10.0.2.2:3000
Local (Device): http://192.168.18.14:3000
```

### API Keys

Add to your `local.properties`:
```properties
MAPS_API_KEY=your_google_maps_api_key
```

---

## 📦 Building

### Debug Build
```bash
./gradlew assembleDebug
```
Output: `app/build/outputs/apk/debug/app-debug.apk`

### Release Build
```bash
./gradlew assembleRelease
```
Output: `app/build/outputs/apk/release/app-release.apk`

### Run on Device
```bash
./gradlew installDebug
```

---

## 🧪 Testing

### Run Tests
```bash
# Unit tests
./gradlew test

# Instrumented tests
./gradlew connectedAndroidTest
```

### Manual Testing Checklist
See: `PRODUCTION_DEPLOYMENT_GUIDE.md` for complete testing checklist

---

## 📚 Documentation

### Main Documentation Files
- **`PROJECT_STATUS.md`** - Current project status and roadmap
- **`RUN_SETUP_UNIFIED_DOCUMENTATION.md`** - Run setup implementation spec
- **`PRODUCTION_DEPLOYMENT_GUIDE.md`** - Production deployment walkthrough
- **`BACKEND_SYNC_CHECKLIST.md`** - Backend synchronization guide
- **`NEVER_DO_THIS.md`** - Prevention guidelines and best practices
- **`BACKEND_LOCATION.md`** - Backend server information

### Additional Documentation
- **`CLIENT_SERVER_ARCHITECTURE.md`** - System architecture
- **`SESSION_SUMMARY_FEB_5_2026.md`** - Latest session summary
- **`MAP_MY_RUN_REDESIGN_COMPLETE.md`** - Route generation UI
- **`GARMIN_INTEGRATION_STATUS.md`** - Garmin Connect IQ integration

---

## 🎯 Key Features

### 1. Unified Run Setup
- Single modern screen for all run types
- AI route generation or free run options
- Target distance and time configuration
- **File:** `MapMyRunSetupScreen.kt`
- **Status:** ✅ Complete

### 2. AI Route Generation
- GraphHopper-powered intelligent routes
- Circular routes (return to start)
- 3 difficulty levels (Easy, Moderate, Hard)
- Route variety with random seeding
- **Backend:** `server/intelligent-route-generation.ts`
- **Status:** ✅ Complete (synced to GitHub)

### 3. GPS Run Tracking
- Real-time location updates
- Distance, pace, duration tracking
- Route polyline visualization
- Background tracking with foreground service
- **File:** `RunSessionScreen.kt`, `RunTrackingService.kt`
- **Status:** ✅ Complete

### 4. AI Coaching
- OpenAI-powered personalized feedback
- Pace guidance
- Struggle detection and support
- Phase-based coaching
- **Backend:** OpenAI GPT-4 integration
- **Status:** ✅ Complete

### 5. Goals Management
- Create custom running goals
- Track progress
- Active, completed, and abandoned tabs
- **File:** `GoalsScreen.kt`
- **Status:** ✅ Complete

### 6. Social Features
- Friends list and search
- Group runs
- Live location sharing
- **Files:** `FriendsScreen.kt`, `GroupRunsScreen.kt`
- **Status:** ✅ Complete

---

## 🔐 Backend

### Location
```bash
/Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
```

### Tech Stack
- Node.js + TypeScript
- Express.js
- PostgreSQL (Neon.com)
- OpenAI API
- GraphHopper API

### Start Backend Locally
```bash
cd /Users/danieljohnston/Desktop/Ai-Run-Coach-IOS-and-Android
npm install
npm run server:dev
```

### Deploy to Production
See: `PRODUCTION_DEPLOYMENT_GUIDE.md`

---

## 🚨 Important Notes

### DO NOT Restore These Files
- ❌ `RunSetupScreen.kt` - Permanently deleted (replaced by `MapMyRunSetupScreen.kt`)
- ❌ Any `run_setup/{mode}` navigation routes

See `NEVER_DO_THIS.md` for complete list of deprecated patterns.

### Version Control
- All major changes are documented
- Comprehensive commit messages
- Prevention guidelines in place
- See `SESSION_SUMMARY_FEB_5_2026.md` for latest changes

---

## 📞 Common Commands

### Android App
```bash
# Build debug APK
./gradlew assembleDebug

# Clean build
./gradlew clean

# Install on connected device
./gradlew installDebug

# Check for lint errors
./gradlew lint
```

### Backend
```bash
# Install dependencies
npm install

# Start dev server
npm run server:dev

# Build for production
npm run server:build

# Run production server
npm run server:prod
```

### Git
```bash
# Check status
git status

# Commit changes
git add -A
git commit -m "message"

# Push to remote
git push origin main

# Check recent commits
git log --oneline -10
```

---

## 🐛 Troubleshooting

### App Can't Connect to Backend
1. Check `useLocalBackend` setting in `RetrofitClient.kt`
2. Verify backend is running (local or production)
3. Check device/emulator network connectivity
4. See: `PRODUCTION_DEPLOYMENT_GUIDE.md` → Troubleshooting

### Route Generation Times Out
- Normal! AI route generation takes 1-3 minutes
- Timeout set to 180 seconds (3 minutes)
- Check backend logs if consistently failing

### GPS Not Working
- Grant location permissions: Settings → Apps → AI Run Coach → Permissions
- Enable "Allow all the time" for background tracking
- Check device location services are enabled

### Build Fails
```bash
# Clean and rebuild
./gradlew clean
./gradlew assembleDebug

# Check for dependency issues
./gradlew dependencies

# Invalidate caches (Android Studio)
File → Invalidate Caches / Restart
```

---

## 🎨 UI Components

### Key Screens
- **`MapMyRunSetupScreen`** - Run configuration (UNIFIED)
- **`DashboardScreen`** - Main dashboard
- **`RunSessionScreen`** - Active run tracking
- **`RouteSelectionScreen`** - Choose AI-generated routes
- **`GoalsScreen`** - Goals management
- **`ProfileScreen`** - User profile and settings
- **`PreviousRunsScreen`** - Run history

### Shared Components
- **`TargetTimeCard`** - Time input (doubled size on Feb 5)
- **`RunCharts`** - Data visualization
- **Various cards and UI elements**

---

## 🔄 Recent Changes (Feb 5, 2026)

### 1. Run Setup Unification
- Deleted `RunSetupScreen.kt`
- Enhanced `MapMyRunSetupScreen.kt`
- Single source of truth
- **Commits:** `c507a0f`, `ee8b266`, `9155f12`

### 2. UI Size Adjustments
- Target Time Card: **DOUBLED** (better visibility)
- AI Coach Toggle: **25% SMALLER** (better proportions)

### 3. Production Configuration
- Set `useLocalBackend = false`
- Built production APK (24 MB)
- **Commit:** `cb6c308`

### 4. Backend GraphHopper Fixes
- Circular route enforcement
- Random seed generation
- Profile fix (`hike` → `foot`)
- **Commit:** `79bdc40` (backend repo)

---

## 📊 Project Stats

- **Total Files:** 100+
- **Total Lines of Code:** 30,000+
- **Features Completed:** 28
- **Documentation Files:** 76
- **APK Size:** 24 MB
- **Min Android Version:** 7.0 (API 24)
- **Target Android Version:** 14 (API 34)

---

## 🤝 Contributing

1. Read `PROJECT_STATUS.md` for current status
2. Check `NEVER_DO_THIS.md` for guidelines
3. Follow existing code patterns
4. Update documentation with changes
5. Write descriptive commit messages

---

## 📄 License

[Your License Here]

---

## 📧 Contact

[Your Contact Information]

---

## 🎉 Acknowledgments

- OpenAI for GPT-4 API
- GraphHopper for route generation
- Google Maps Platform
- Neon.com for PostgreSQL hosting
- Replit for deployment platform

---

**Ready to Deploy?** See `PRODUCTION_DEPLOYMENT_GUIDE.md` to get started! 🚀

**Need Help?** Check the documentation files in the root directory.

**Found a Bug?** See `PROJECT_STATUS.md` → Known Issues section.
