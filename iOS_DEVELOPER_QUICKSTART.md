# iOS Developer Quick Start — What to Build

## 🎯 Your Mission

Sync the iOS app with 6 hours of Android development completed today.

---

## 📋 The 3 Biggest Changes

### 1. **Smart AI Coaching System**
**What it is**: Backend now expects richer data about the run (Garmin metrics + runner profile)

**What you do**:
- [ ] Add 25 new properties to `RunSession` model
- [ ] Create `ComprehensiveAnalysisRequest` (new models file)
- [ ] Update API call to send new request format
- [ ] Build request from Garmin data + user profile

**Impact**: AI analysis is now **context-aware, personalized, intelligent**

---

### 2. **Garmin Data Display UI**
**What it is**: Show users that their coaching is powered by Garmin data

**What you do**:
- [ ] Add pinned `GarminAttributionHeader` (Garmin logo + device name)
- [ ] Add `GarminDataDisclosure` messages (gold/gray badge with text)
- [ ] Add these to: AI Insights tab, Graphs tab, Data tab
- [ ] Update Connected Devices screen (feature chips + device name)

**Impact**: Users see **"Connected Device: VivoActive 4"** at top, trust the coaching

---

### 3. **Graph System (Phase 1)**
**What it is**: Beautiful visualizations of 23+ biometric metrics

**What you do**:
- [ ] Create `GraphAxisUtils.swift` (smart margin calculation)
- [ ] Build 4 graphs: HR over Time, HR over Distance, HR Zones, HR vs Elevation
- [ ] Add data extraction helpers on `RunSession`
- [ ] Display in Graphs tab

**Impact**: Users see **beautiful, professional data visualizations**

---

## 🗂️ File Structure Changes

### **Modified Files** (9 files)
1. `Models/RunSession.swift` — Add 25 new properties
2. `Core Data/RunSessionEntity+CoreDataProperties` — Add 25 attributes
3. `ViewModels/RunSummaryViewModel.swift` — Add AI coaching methods
4. `ViewModels/ConnectedDevicesViewModel.swift` — Add device tracking
5. `Services/ApiService.swift` — Update endpoint call format
6. `Screens/ConnectedDevicesScreen.swift` — Update UI, add chips
7. `Screens/RunSummaryScreen.swift` — Add header, disclosure, tabs
8. `Extensions/RunSession+GraphHelpers.swift` — Data extraction
9. `Assets.xcassets` — Add Garmin logo asset

### **New Files** (9 files)
1. `Models/ComprehensiveAnalysisRequest.swift` — API models
2. `Components/GarminAttributionHeader.swift` — Pinned header
3. `Components/GarminDataDisclosure.swift` — Disclosure badge
4. `Utilities/GraphAxisUtils.swift` — Graph utilities
5. `Graphs/HeartRateOverTimeChart.swift` — Graph #1
6. `Graphs/HeartRateOverDistanceChart.swift` — Graph #2
7. `Graphs/HeartRateZoneDistributionChart.swift` — Graph #3
8. `Graphs/HeartRateVsElevationChart.swift` — Graph #4
9. `Assets/Garmin Tag Logo` — PNG or PDF

---

## 🚀 Implementation Phases

### **Phase 1: Critical (3-4 days)**
Must complete before anything else works:
1. Update RunSession (25 new properties)
2. Update Core Data schema
3. Update API models & calls
4. Add Garmin header + disclosure messages
5. Test: App launches, no crashes, data loads

### **Phase 2: Important (3-4 days)**
Can work in parallel with Phase 1:
1. Implement 4 priority graphs
2. Add data extraction helpers
3. Update Run Summary screen
4. Test: Graphs render, data displays

### **Phase 3: Polish (2-3 days)**
Nice-to-have enhancements:
1. Implement remaining 10 graphs
2. Fine-tune styling & spacing
3. Add interactions (tap, drag)
4. Performance optimization

---

## 💾 Database Changes

### **Add These to Core Data RunSession Entity:**

```
Group: Garmin Flags
- hasGarminData (Boolean)
- garminDeviceName (String, Optional)

Group: Running Dynamics
- avgGroundContactTime (Double)
- minGroundContactTime (Double)
- maxGroundContactTime (Double)
- avgGroundContactBalance (Double)
- avgVerticalOscillation (Double)
- maxVerticalOscillation (Double)
- avgVerticalRatio (Double)
- minStrideLength (Double)
- maxStrideLength (Double)
- avgStrideLength (Double)

Group: Training Metrics
- aerobicTrainingEffect (Double)
- anaerobicTrainingEffect (Double)
- recoveryTimeMinutes (Integer 32)
- vo2MaxEstimate (Double)

Group: Environmental
- avgAmbientPressure (Double)
- avgBearing (Double)

Group: Time Series (JSON arrays stored as String)
- groundContactTimeData (String, Optional)
- groundContactBalanceData (String, Optional)
- verticalOscillationData (String, Optional)
- verticalRatioData (String, Optional)
- strideLength Data (String, Optional)
- cadenceData (String, Optional)
- altitudeData (String, Optional)
- bearingData (String, Optional)
```

---

## 🎨 UI Changes

### **Connected Devices Screen**
Replace feature chips with:
```swift
[
    ("23+ Biometric Metrics", "Ground contact, vertical oscillation, training effect, etc."),
    ("Personal HR Zones", "Based on user's actual max HR"),
    ("Form Analysis", "GCT, stride, bounce tracking"),
    ("Real-Time Coaching", "AI-powered form & pacing cues")
]
```

Add device name display:
```swift
if let deviceName = viewModel.garminDeviceName {
    HStack {
        Text("Connected: \(deviceName)")
            .foregroundColor(.green)
    }
}
```

### **Run Summary Screen**
Add above tab content:
```swift
GarminAttributionHeader(
    deviceName: run.garminDeviceName,
    hasGarminData: run.hasGarminData
)
```

Add disclosure messages in tabs:
```swift
if run.hasGarminData {
    GarminDataDisclosure(type: .insights)  // AI Insights tab
    GarminDataDisclosure(type: .chart)     // Graphs tab
    GarminDataDisclosure(type: .chart)     // Data tab
}
```

---

## 🔌 API Changes

### **Old Call:**
```swift
POST /api/runs/{id}/comprehensive-analysis
Body: RunSession
```

### **New Call:**
```swift
POST /api/runs/{id}/comprehensive-analysis
Body: {
    runId: String
    garminDataSummary: {
        deviceName, avgHeartRate, maxHeartRate, 
        avgGroundContactTime, avgVerticalOscillation,
        aerobicTrainingEffect, vo2MaxEstimate,
        estimatedFatigue, terrainSummary
    }
    userProfileContext: {
        whatIKnowAboutYou, garminInsights,
        baselineHeartRate, baselineGroundContactTime
    }
}
```

---

## 📊 The 4 Priority Graphs

### **Graph 1: Heart Rate Over Time**
- **X-axis**: Time (minutes elapsed)
- **Y-axis**: Heart rate (bpm)
- **Shows**: How effort evolved throughout run
- **Insight**: Warm-up, steady state, fatigue patterns

### **Graph 2: Heart Rate Over Distance**
- **X-axis**: Distance (km)
- **Y-axis**: Heart rate (bpm)
- **Shows**: Effort per kilometer
- **Insight**: Where you pushed, where you recovered

### **Graph 3: HR Zone Distribution**
- **Chart Type**: Pie or bar chart
- **Shows**: % time in Z1-Z5
- **Colors**: Zone colors (blue, green, amber, orange, red)
- **Insight**: Training zone discipline

### **Graph 4: Heart Rate vs Elevation**
- **X-axis**: Elevation (meters)
- **Y-axis**: Heart rate (bpm)
- **Chart Type**: Scatter plot
- **Shows**: How hills affect your effort
- **Insight**: Terrain response, efficiency

---

## ✅ Completion Checklist

### **Core Data & Models**
- [ ] Added 25 new properties to RunSession
- [ ] Created ComprehensiveAnalysisRequest models
- [ ] Updated Core Data schema with 25 new attributes
- [ ] Created migration if needed

### **API & ViewModels**
- [ ] Updated ApiService endpoint call format
- [ ] Created request building logic
- [ ] Added Garmin data summary builder
- [ ] Added user profile context builder
- [ ] Added fatigue computation
- [ ] Added terrain summary generation

### **UI — Connected Devices**
- [ ] Updated feature chips (4 new descriptions)
- [ ] Added device name display
- [ ] Added Garmin logo to card
- [ ] Updated "FEATURED" to "PREMIUM" badge

### **UI — Run Summary**
- [ ] Added GarminAttributionHeader component
- [ ] Added GarminDataDisclosure component
- [ ] Pinned header above tabs
- [ ] Added disclosure to AI Insights tab
- [ ] Added disclosure to Graphs tab
- [ ] Added disclosure to Data tab

### **Graphs (Phase 1)**
- [ ] Created GraphAxisUtils.swift
- [ ] Created RunSessionGraphHelpers extension (4 data extractors)
- [ ] Built HeartRateOverTimeChart
- [ ] Built HeartRateOverDistanceChart
- [ ] Built HeartRateZoneDistributionChart
- [ ] Built HeartRateVsElevationChart
- [ ] Integrated into Run Summary Graphs tab

### **Testing**
- [ ] App launches without crashes
- [ ] Core Data migration succeeds
- [ ] Garmin header displays correctly
- [ ] Disclosure messages appear
- [ ] 4 graphs render with sample data
- [ ] Colors match Android exactly
- [ ] Device name displays
- [ ] API request format is correct

---

## 📚 Reference Documents

You have these Android docs for reference:
- `iOS_SYNC_BRIEF.md` — Complete detailed changes (THIS FILE)
- `SPRINT_1_COMPLETE_SUMMARY.md` — AI coaching details
- `SPRINT_2_COMPLETE_GRAPH_LIBRARY.md` — All 14 graph designs
- `GARMIN_WATCH_BIOMETRICS_MIGRATION.sql` — Schema (for Core Data mapping)
- `GraphAxisUtils.kt` — Android implementation (reference for iOS)
- `RunSessionGraphHelpers.kt` — Android data extractors (reference for iOS)

---

## 🎯 Success Criteria

✅ **Phase 1 Complete**: App launches, no crashes, Garmin UI shows
✅ **Phase 2 Complete**: 4 graphs render with real data
✅ **Phase 3 Complete**: Remaining graphs, polish, optimization done

**Timeline**: 8-10 days total (3+3+2 phase breakdown)

**Estimated LOC**: 1500-2000 new lines of Swift code

---

## 🤔 Questions?

Refer to:
1. **Full details**: `iOS_SYNC_BRIEF.md`
2. **Android reference**: Files in Android project
3. **API changes**: Backend team (`server/types/garmin-analysis.ts`)
4. **Design**: See `BEFORE_AFTER_WATCH_UI.md` for visual context

---

## Let's Build! 🚀

You have everything you need. The Android app is done. Now make iOS identical and beautiful.

**Good luck!** 💪
