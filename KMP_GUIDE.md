# KMP (Kotlin Multiplatform) Usage Guide

## Project Structure

```
AiRunCoach/
├── app/                    # Android app (platform-specific)
│   └── java/.../
│       ├── ui/            # Compose screens, UI components
│       ├── viewmodel/     # ViewModels
│       ├── service/       # Android services (GPS, Bluetooth)
│       └── data/          # Android data sources
│
├── shared/                # KMP module (cross-platform)
│   └── src/commonMain/kotlin/
│       └── live/airuncoach/airuncoach/shared/
│           ├── Models.kt              # Data models
│           ├── GAPCalculator.kt       # Algorithms
│           ├── RunAnalytics.kt        # Analytics
│           ├── FitnessCalculator.kt   # Training load
│           └── CoachingPreferences.kt # Settings
│
└── server/                # Backend (Node.js)
```

## Rule: What Goes Where

### Put in `shared/` (both Android + iOS)
- ✅ Data models (RunSession, User, Goal, etc.)
- ✅ Algorithms (GAP calculations, fitness calculations)
- ✅ Analytics logic (split analysis, fatigue index)
- ✅ Business rules (coaching preferences, pace zones)
- ✅ API request/response DTOs

### Put in `app/` (Android only)
- ✅ Compose UI screens
- ✅ ViewModels
- ✅ Android services (RunTrackingService)
- ✅ Bluetooth/GPS access
- ✅ Health Connect integration
- ✅ Hilt dependency injection
- ✅ Platform-specific APIs

## How to Update

### When adding a new feature:

1. **Business logic → `shared/`**
   - If both platforms need it, add to `shared/`
   - Example: New running metric calculation

2. **Android-only → `app/`**
   - If it's platform-specific, add to `app/`
   - Example: New screen UI, Android sensor access

### Example Workflow:

```kotlin
// In shared/ - available to both platforms
// shared/src/commonMain/kotlin/.../shared/HeartRateZones.kt
fun calculateHeartRateZones(maxHR: Int): List<HeartRateZone> { ... }

// In app/ - Android only
// app/src/main/java/.../viewmodel/RunSessionViewModel.kt
import live.airuncoach.airuncoach.shared.calculateHeartRateZones
```

## For AI Agents

When working on this project, always check:
1. Is this logic needed by both platforms? → Use `shared/`
2. Is this Android-only (UI, sensors, etc.)? → Use `app/`
3. Models shared between app and backend? → Use `shared/`

## Building

```bash
# Build Android app
./gradlew :app:assemble

# Build KMP for iOS (requires macOS + Xcode)
./gradlew :shared:assemble
```