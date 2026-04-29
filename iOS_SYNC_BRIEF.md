# iOS App Sync Brief — Complete Changes from Last 6 Hours

## Executive Summary

Over the past 6 hours, we completed a massive overhaul of the Android app with:
1. **Elite watch UI redesign** (Garmin companion app)
2. **Sprint 1: Smart AI coaching system** (backend)
3. **Sprint 2: Graph infrastructure** (14 graph designs + utilities)
4. **Database schema expansion** (25 new biomechanical columns)
5. **UI enhancements** (Connected Devices, Run Summary screens)

**This brief details EVERY change the iOS app needs to match Android exactly.**

---

## Part 1: Watch App Integration (Garmin Companion)

### ❌ iOS Does NOT Have Equivalent Yet

The iOS app needs a **companion watch app** equivalent. However, since iOS watches use WatchKit (not Garmin), this would be a separate WatchKit project.

**For now, iOS focus**: Focus on phone-side integration that **assumes watch data will come from Garmin Connect via API** (not direct watch communication).

---

## Part 2: Sprint 1 — AI Coaching System Update

### 2.1 Backend API Models (TypeScript/Shared)

The backend now expects a **richer request** with Garmin data context.

#### **New Request Model: ComprehensiveAnalysisRequest**

**Location**: `server/types/garmin-analysis.ts` (NEW FILE created)

**iOS needs to send** (when calling AI analysis endpoint):

```swift
struct ComprehensiveAnalysisRequest: Codable {
    let runId: String
    let garminDataSummary: GarminDataSummary?  // Optional - only if hasGarminData
    let userProfileContext: UserProfileForAI?  // Optional - runner baseline
}

struct GarminDataSummary: Codable {
    let deviceName: String?
    // Heart Rate
    let avgHeartRate: Int?
    let minHeartRate: Int?
    let maxHeartRate: Int?
    // Running Dynamics
    let avgGroundContactTime: Double?
    let minGroundContactTime: Double?
    let maxGroundContactTime: Double?
    let avgGroundContactBalance: Double?
    let avgVerticalOscillation: Double?
    let maxVerticalOscillation: Double?
    let avgVerticalRatio: Double?
    let minStrideLength: Double?
    let maxStrideLength: Double?
    let avgStrideLength: Double?
    // Training Metrics
    let aerobicTrainingEffect: Double?
    let anaerobicTrainingEffect: Double?
    let recoveryTimeMinutes: Int?
    let vo2MaxEstimate: Double?
    // Environmental
    let avgAmbientPressure: Double?
    let avgBearing: Double?
    // Computed
    let estimatedFatigue: Int?  // 0-100 scale
    let terrainSummary: String?
}

struct UserProfileForAI: Codable {
    let whatIKnowAboutYou: String
    let garminInsights: String
    // 4-week baselines
    let baselineHeartRate: Int?
    let baselineGroundContactTime: Double?
    let baselineVerticalOscillation: Double?
    let baselineStrideLength: Double?
}
```

### 2.2 Update Run Session Model (Domain)

**Add these fields to RunSession model:**

```swift
struct RunSession: Codable {
    // ... existing fields ...
    
    // Garmin Data Flags
    var hasGarminData: Bool = false
    var garminDeviceName: String?
    
    // Running Dynamics (from Garmin watch)
    var avgGroundContactTime: Double?  // milliseconds
    var minGroundContactTime: Double?
    var maxGroundContactTime: Double?
    var avgGroundContactBalance: Double?  // % left/right
    var avgVerticalOscillation: Double?  // cm
    var maxVerticalOscillation: Double?
    var avgVerticalRatio: Double?  // %
    var minStrideLength: Double?  // meters
    var maxStrideLength: Double?
    var avgStrideLength: Double?
    
    // Training Effect & Recovery
    var aerobicTrainingEffect: Double?  // 0-5
    var anaerobicTrainingEffect: Double?  // 0-5
    var recoveryTimeMinutes: Int?
    var vo2MaxEstimate: Double?  // ml/kg/min
    
    // Environmental
    var avgAmbientPressure: Double?  // Pascals
    var avgBearing: Double?  // degrees
}
```

### 2.3 Update API Service

**Update the endpoint call** to send new request format:

```swift
// OLD API call
POST /api/runs/{id}/comprehensive-analysis
Body: RunSession

// NEW API call
POST /api/runs/{id}/comprehensive-analysis
Body: ComprehensiveAnalysisRequest {
    runId: String
    garminDataSummary: GarminDataSummary?
    userProfileContext: UserProfileForAI?
}
```

### 2.4 Update RunSummaryViewModel

**When fetching AI analysis, build the rich request:**

```swift
private func fetchAIAnalysis() {
    let request = ComprehensiveAnalysisRequest(
        runId: run.id,
        garminDataSummary: buildGarminDataSummary(),
        userProfileContext: buildUserProfileContext()
    )
    
    apiService.getComprehensiveRunAnalysis(
        runId: run.id,
        request: request
    )
}

private func buildGarminDataSummary() -> GarminDataSummary? {
    guard run.hasGarminData else { return nil }
    
    return GarminDataSummary(
        deviceName: run.garminDeviceName,
        avgHeartRate: run.heartRate,
        minHeartRate: run.minHeartRate,
        maxHeartRate: run.maxHeartRate,
        avgGroundContactTime: run.avgGroundContactTime,
        minGroundContactTime: run.minGroundContactTime,
        maxGroundContactTime: run.maxGroundContactTime,
        avgGroundContactBalance: run.avgGroundContactBalance,
        avgVerticalOscillation: run.avgVerticalOscillation,
        maxVerticalOscillation: run.maxVerticalOscillation,
        avgVerticalRatio: run.avgVerticalRatio,
        minStrideLength: run.minStrideLength,
        maxStrideLength: run.maxStrideLength,
        avgStrideLength: run.avgStrideLength,
        aerobicTrainingEffect: run.aerobicTrainingEffect,
        anaerobicTrainingEffect: run.anaerobicTrainingEffect,
        recoveryTimeMinutes: run.recoveryTimeMinutes,
        vo2MaxEstimate: run.vo2MaxEstimate,
        avgAmbientPressure: run.avgAmbientPressure,
        avgBearing: run.avgBearing,
        estimatedFatigue: computeFatigue(),
        terrainSummary: generateTerrainSummary()
    )
}

private func buildUserProfileContext() -> UserProfileForAI? {
    // Build from userDefaults or CoreData
    return UserProfileForAI(
        whatIKnowAboutYou: getUserProfileText(),
        garminInsights: getGarminInsights(),
        baselineHeartRate: getBaseline(.heartRate),
        baselineGroundContactTime: getBaseline(.groundContactTime),
        baselineVerticalOscillation: getBaseline(.verticalOscillation),
        baselineStrideLength: getBaseline(.strideLength)
    )
}
```

---

## Part 3: Database Updates

### 3.1 Core Data Schema Updates

Add these attributes to the `RunSession` entity in Core Data:

```
Garmin Data Attributes:
- hasGarminData: Boolean
- garminDeviceName: String (Optional)

Running Dynamics:
- avgGroundContactTime: Double
- minGroundContactTime: Double
- maxGroundContactTime: Double
- avgGroundContactBalance: Double
- avgVerticalOscillation: Double
- maxVerticalOscillation: Double
- avgVerticalRatio: Double
- minStrideLength: Double
- maxStrideLength: Double
- avgStrideLength: Double

Training Metrics:
- aerobicTrainingEffect: Double
- anaerobicTrainingEffect: Double
- recoveryTimeMinutes: Integer 32
- vo2MaxEstimate: Double

Environmental:
- avgAmbientPressure: Double
- avgBearing: Double

Time-series Arrays (stored as JSON):
- groundContactTimeData: String (JSON array)
- groundContactBalanceData: String (JSON array)
- verticalOscillationData: String (JSON array)
- verticalRatioData: String (JSON array)
- strideLength Data: String (JSON array)
- cadenceData: String (JSON array)
- altitudeData: String (JSON array)
- bearingData: String (JSON array)
```

---

## Part 4: UI Updates — Connected Devices Screen

### 4.1 Update ConnectedDevicesViewModel

**Add these properties:**

```swift
@Published var garminDeviceName: String? = nil
@Published var garminConnectionStatus: String = "disconnected"

// Add device name retrieval
func checkGarminConnection() {
    // ... existing code ...
    // Extract and store device name from API
    if let deviceName = response.deviceName {
        garminDeviceName = deviceName
    }
}

func disconnectGarmin() {
    // ... existing code ...
    garminDeviceName = nil
}
```

### 4.2 Update Connected Devices Screen

**Feature chips** — Change from generic to elite:

```swift
let chips = [
    ("23+ Biometric Metrics", "Ground contact, vertical oscillation, training effect, etc."),
    ("Personal HR Zones", "Based on user's actual max HR"),
    ("Form Analysis", "GCT, stride, bounce tracking"),
    ("Real-Time Coaching", "AI-powered form & pacing cues")
]
```

**Garmin card layout:**

```swift
VStack(spacing: 16) {
    // New: Garmin IQ asset logo at top (full width, 40dp height)
    Image("ic_garmin_tag")
        .resizable()
        .scaledToFit()
        .frame(height: 40)
    
    // Title
    Text("Garmin Watch App")
        .font(.headline)
    
    // Badge
    Text("★ PREMIUM")
        .font(.caption)
        .foregroundColor(.blue)
    
    // Description
    Text("Elite biomechanical coaching on your wrist")
        .font(.caption)
        .foregroundColor(.secondary)
}
```

**Device name display:**

```swift
if let deviceName = viewModel.garminDeviceName {
    HStack {
        Text("Connected: \(deviceName)")
            .font(.caption)
            .foregroundColor(.green)
    }
    .padding(.vertical, 8)
}
```

---

## Part 5: Run Summary Screen Updates

### 5.1 Add Pinned Garmin Attribution Header

**New UI Component: GarminAttributionHeader**

```swift
struct GarminAttributionHeader: View {
    let deviceName: String?
    let hasGarminData: Bool
    
    var body: some View {
        if hasGarminData, let deviceName = deviceName {
            HStack(spacing: 10) {
                // Garmin tag logo
                Image("ic_garmin_tag")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 22)
                
                // Device name
                VStack(alignment: .leading, spacing: 2) {
                    Text("Connected Device")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(deviceName)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                }
                
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color(.systemGray6))
        }
    }
}
```

**Update RunSummaryScreen structure:**

```swift
VStack(spacing: 0) {
    // Top bar (unchanged)
    TopBar(...)
    
    // NEW: Pinned Garmin header (appears above tabs)
    GarminAttributionHeader(
        deviceName: run.garminDeviceName,
        hasGarminData: run.hasGarminData
    )
    
    // Tabs and content
    TabView(selection: $selectedTab) {
        // AI Insights tab
        AIInsightsTab(...)
        
        // Summary tab
        SummaryTab(...)
        
        // Graphs tab
        GraphsTab(...)
        
        // Data tab
        DataTab(...)
    }
}
```

### 5.2 Add Garmin Data Disclosure Messages

**New Component: GarminDataDisclosure**

```swift
struct GarminDataDisclosure: View {
    enum DisclosureType {
        case chart
        case insights
    }
    
    let type: DisclosureType
    
    var body: some View {
        HStack(spacing: 8) {
            Image("ic_garmin_tag")
                .font(.caption)
            
            Text(disclosureText)
                .font(.caption)
                .italic()
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(.systemGray6))
        .cornerRadius(6)
    }
    
    private var disclosureText: String {
        switch type {
        case .chart:
            return "This chart was created using data provided by Garmin devices."
        case .insights:
            return "Insights derived in part from Garmin device-sourced data."
        }
    }
}
```

**Add to AI Insights Tab:**

```swift
// After "AI Analysis" heading
if run.hasGarminData {
    GarminDataDisclosure(type: .insights)
}
```

**Add to Graphs Tab:**

```swift
// Before heart rate charts
if run.hasGarminData && run.heartRate != nil {
    GarminDataDisclosure(type: .chart)
}
```

**Add to Data Tab:**

```swift
// Before Heart Rate Section
if run.hasGarminData && run.heartRate != nil {
    GarminDataDisclosure(type: .chart)
}

// Before Running Dynamics Section
if run.hasGarminData && run.avgGroundContactTime != nil {
    GarminDataDisclosure(type: .chart)
}

// Before Elevation Section
if run.hasGarminData && run.elevationGain != nil {
    GarminDataDisclosure(type: .chart)
}
```

---

## Part 6: Graph System Implementation

### 6.1 Add Graph Utilities

**New File: GraphAxisUtils.swift**

```swift
struct AxisConfig {
    let minValue: Double
    let maxValue: Double
    let range: Double
    let shouldUseActualMargin: Bool
    let margin: Double
    
    static func calculate(
        dataPoints: [Double],
        expectedRange: (min: Double, max: Double)
    ) -> AxisConfig {
        // Smart margin calculation to prevent visual distortion
        // (See Android implementation for full logic)
    }
}

// Helper functions
func formatPercentChange(_ change: Float) -> String {
    return String(format: "%+.1f%%", change)
}

func getHeartRateColor(bpm: Int, zoneIndex: Int) -> Color {
    // Zone-specific coloring
}
```

### 6.2 Implement Priority Graphs (Phase 1)

The Android team designed 14 graphs. For iOS, implement these priority 4 first:

**1. Heart Rate Over Time Chart**
```swift
struct HeartRateOverTimeChart: View {
    let run: RunSession
    // X-axis: time (minutes)
    // Y-axis: heart rate (bpm)
    // Shows HR progression through run
}
```

**2. Heart Rate Over Distance Chart**
```swift
struct HeartRateOverDistanceChart: View {
    let run: RunSession
    // X-axis: distance (km)
    // Y-axis: heart rate (bpm)
    // Shows effort per kilometer
}
```

**3. HR Zone Distribution (Pie/Bar)**
```swift
struct HeartRateZoneDistributionChart: View {
    let run: RunSession
    // Shows % time in Z1-Z5
    // Color-coded by zone
    // Insight: discipline score
}
```

**4. Heart Rate vs Elevation**
```swift
struct HeartRateVsElevationChart: View {
    let run: RunSession
    // X-axis: elevation (meters)
    // Y-axis: heart rate (bpm)
    // Scatter plot showing terrain impact
}
```

### 6.3 Data Extraction Helpers

Create extension on RunSession:

```swift
extension RunSession {
    // Heart rate helpers
    func getHeartRateOverTime() -> [(timeSeconds: Int, bpm: Int)] {
        // Extract from heartRateData array
    }
    
    func getHeartRateOverDistance() -> [(distanceKm: Double, bpm: Int)] {
        // Correlate HR with GPS distance
    }
    
    func getHeartRateZoneDistribution() -> [Int: Double] {
        // Return % time in each zone
    }
    
    func getHeartRateVsElevation() -> [(elevationM: Double, bpm: Int)] {
        // Correlate elevation with HR
    }
    
    // Running dynamics helpers
    func getGroundContactTimeOverDistance() -> [(distanceKm: Double, gctMs: Double)] {
        // Extract from groundContactTimeData
    }
    
    func getVerticalOscillationOverDistance() -> [(distanceKm: Double, voCm: Double)] {
        // Extract from verticalOscillationData
    }
    
    // Additional helpers (14 total for all graphs)
    // ... implement remaining as designed in Android
}
```

---

## Part 7: View Model Updates

### 7.1 RunSummaryViewModel

**Add these methods:**

```swift
// Baseline computation
func getBaselineMetrics(for metric: MetricType) -> Double? {
    // Fetch from last 4 weeks of runs
    // Return average value
}

// Fatigue estimation
func computeFatigue() -> Int {
    let hrDrift = (maxHeartRate - heartRate) / Double(maxHeartRate) * 40
    let voIncrease = (avgVerticalOscillation - baseline.avgVO) / baseline.avgVO * 35
    let timePercentage = (elapsedTime / (75 * 60)) * 25
    return min(100, Int(hrDrift + voIncrease + timePercentage))
}

// Terrain summary
func generateTerrainSummary() -> String {
    if elevationGain > 500 {
        return "Hilly terrain with \(elevationGain)m elevation gain"
    } else if elevationGain > 200 {
        return "Rolling terrain with \(elevationGain)m elevation"
    } else {
        return "Flat course, minimal elevation change"
    }
}

// User profile text builder
func getUserProfileText() -> String {
    // Build from user settings + historical data
    // Example: "Prefers steady Z3 runs, typically runs 8-12 km, good running economy"
}

func getGarminInsights() -> String {
    // Extract from previous Garmin runs
    // Example: "Running with VivoActive 4, consistent GCT ~250ms, efficient stride"
}
```

### 7.2 ConnectedDevicesViewModel

**Add these methods:**

```swift
func checkGarminConnection() {
    apiService.getGarminDeviceInfo { [weak self] result in
        switch result {
        case .success(let deviceInfo):
            self?.garminDeviceName = deviceInfo.deviceName
            self?.garminConnectionStatus = "connected"
            self?.lastSyncTime = deviceInfo.lastSync
        case .failure:
            self?.garminConnectionStatus = "disconnected"
        }
    }
}

func getConnectedDeviceName() -> String? {
    return garminDeviceName
}

func disconnectGarmin() {
    apiService.disconnectGarmin { [weak self] _ in
        self?.garminDeviceName = nil
        self?.garminConnectionStatus = "disconnected"
    }
}
```

---

## Part 8: Assets Needed

### Create/Import These Assets

1. **ic_garmin_tag.xml** (already created on Android)
   - SVG: Black rectangle with white "GARMIN." text
   - Dimensions: 100x24 (wide aspect ratio)
   - Use same design for iOS (PDF or PNG)

2. **Color Palette** (match Android exactly)
   - Zone 1: Blue (#2979FF)
   - Zone 2: Green (#00E676)
   - Zone 3: Amber (#FFD740)
   - Zone 4: Orange (#FF6D00)
   - Zone 5: Red (#F44336)
   - Coaching Golden: #FFD700

---

## Part 9: Summary of Changed/New Files

### **Modified Files:**
1. `RunSession.swift` — Add 25 new properties
2. `RunSummaryViewModel.swift` — Add AI coaching methods
3. `ConnectedDevicesViewModel.swift` — Add Garmin device methods
4. `ApiService.swift` — Update comprehensive analysis endpoint
5. `ConnectedDevicesScreen.swift` — Add feature chips, device display
6. `RunSummaryScreen.swift` — Add pinned header, disclosure messages
7. `Core Data Model** — Add 25 new attributes

### **New Files:**
1. `ComprehensiveAnalysisRequest.swift` — New API models
2. `GarminAttributionHeader.swift` — Pinned header component
3. `GarminDataDisclosure.swift` — Disclosure message component
4. `GraphAxisUtils.swift` — Graph utilities
5. `HeartRateOverTimeChart.swift` — Graph #1
6. `HeartRateOverDistanceChart.swift` — Graph #2
7. `HeartRateZoneDistributionChart.swift` — Graph #3
8. `HeartRateVsElevationChart.swift` — Graph #4
9. `RunSessionGraphHelpers.swift` — Data extraction extensions

### **Assets:**
1. `ic_garmin_tag.pdf` or `ic_garmin_tag.png` — Garmin tag logo

---

## Part 10: Implementation Priority

### **Phase 1 (Critical — Blocks other work):**
1. Update RunSession model (add 25 properties)
2. Update Core Data schema
3. Update API models and endpoint calls
4. Add Garmin attribution header
5. Add data disclosure messages

### **Phase 2 (Important — Data visualization):**
1. Implement 4 priority graphs
2. Add graph data extraction helpers
3. Update Run Summary UI to show graphs

### **Phase 3 (Enhancement — Polish):**
1. Implement remaining 10 graphs
2. Fine-tune axis margins
3. Add interactive features (tap, drag, etc.)
4. Performance optimization

---

## Part 11: Alignment with Android

### **Identical Implementations:**
- ✅ Garmin attribution header styling
- ✅ Data disclosure messages (exact text and styling)
- ✅ Zone color palette
- ✅ AI analysis request format
- ✅ Device name display format

### **Platform-Specific But Equivalent:**
- Graph implementation (SwiftUI vs Jetpack Compose)
- UI layout (match spirit, not pixel-perfect)
- Animation timing (maintain smoothness)

---

## Part 12: Testing Checklist

After implementation, verify iOS app:

- [ ] Runs load with new Garmin properties (no crashes)
- [ ] AI analysis request sends correct data format
- [ ] Garmin attribution header displays when hasGarminData = true
- [ ] Data disclosure messages appear in correct tabs
- [ ] Zone colors match Android exactly
- [ ] 4 priority graphs render correctly
- [ ] Graph data extraction works for all metrics
- [ ] Connected Devices screen shows device name
- [ ] Feature chips display updated text
- [ ] Core Data migration succeeds without data loss

---

## Summary

This brief covers **ALL changes** from the past 6 hours of Android development. The iOS agent should:

1. ✅ Add 25 new RunSession properties
2. ✅ Update API models for smart coaching
3. ✅ Add Garmin attribution UI
4. ✅ Add data disclosure messages
5. ✅ Implement 4 priority graphs
6. ✅ Update Connected Devices screen
7. ✅ Match Android design exactly

**Total scope**: Medium complexity, ~40-50 hours of work across 3 phases.

**Target**: iOS app fully synced with Android by end of week.

---

**All documentation from Android development is available in the project for reference.**
