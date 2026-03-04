# Ai Run Coach - Kotlin Multiplatform (KMP) Module

This module contains shared business logic, data models, and algorithms that work across both Android and iOS platforms.

## What's Included

### Core Models
- `RunSession` - Main run data structure
- `LocationPoint` - GPS location data
- `KmSplit` - Per-kilometer split times
- `User`, `Goal`, `GeneratedRoute` - Domain models
- `ConnectedDevice`, `DeviceType` - Device management
- API request/response models

### Business Logic
- `GAPCalculator` - Grade Adjusted Pace calculations
- `RunAnalytics` - Run performance analytics (splits, fatigue, VO2 max)
- `FitnessCalculator` - Training load (CTL/ATL/TSB) and fitness trends

### Coaching Features
- `CoachingFeaturePreferences` - In-run AI coaching settings
- `RunSetupConfig` - Run configuration
- `PaceZones` - Standard running pace zones
- Heart rate zone calculations

## Building for iOS

### Prerequisites
1. **macOS** with Xcode installed (minimum version 16.0)
2. **Android Studio** (for managing the KMP project)
3. Xcode command line tools

### Build Steps

1. **Open in Android Studio**
   ```
   Open the AiRunCoach project in Android Studio
   Gradle will automatically sync and configure the KMP module
   ```

2. **Build iOS Framework**
   ```bash
   # Using Gradle
   ./gradlew :shared:assemble

   # Or build specific iOS targets
   ./gradlew :shared:linkDebugFrameworkIosArm64
   ```

3. **Xcode Integration**
   - The framework is generated at: `shared/build/bin/`
   - Add the framework to your Xcode project
   - Or use CocoaPods: the module is configured as a CocoaPods pod

### Using the Framework in Swift

```swift
import AiruncoachShared

// Creating a run session
let run = RunSession(
    id: UUID().uuidString,
    startTime: Date().timeIntervalSince1970 * 1000,
    duration: 1800000, // 30 minutes in ms
    distance: 5000.0, // 5km in meters
    averagePace: "6:00",
    heartRate: 145
)

// Using GAP Calculator
let gap = GAPCalculator.calculateGAP(
    distance: 5000.0,
    duration: 1800000,
    elevationGain: 50.0,
    elevationLoss: 30.0
)

// Analyzing splits
let analysis = analyzeSplits(kmSplits)
print(analysis.verdict)
```

## Module Structure

```
shared/
├── build.gradle.kts          # Gradle configuration
├── settings.gradle.kts       # Module settings
└── src/
    └── commonMain/
        └── kotlin/
            └── live/airuncoach/airuncoach/shared/
                ├── Models.kt              # Core data models
                ├── AdditionalModels.kt    # Extended models
                ├── ApiModels.kt           # API DTOs
                ├── GAPCalculator.kt       # Grade Adjusted Pace
                ├── RunAnalytics.kt        # Run analysis
                ├── FitnessCalculator.kt   # Training load
                └── CoachingPreferences.kt # Coaching settings
```

## Platform-Specific Code

For platform-specific implementations (Bluetooth, Health APIs, etc.), create:

```
shared/src/iosMain/      # iOS-specific code
shared/src/androidMain/  # Android-specific code
```

## Notes

- The shared module uses **Kotlin Serialization** for cross-platform data handling
- All models are `@Serializable` for JSON encoding/decoding
- Business logic is pure Kotlin with no platform dependencies
- The iOS framework requires macOS with Xcode to build