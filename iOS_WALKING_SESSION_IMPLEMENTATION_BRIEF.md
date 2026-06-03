# iOS Walking Session Implementation Brief

## Overview

Implement walking session support across the iOS app to match Android/Web functionality. This includes:
1. Session type selection (Run/Walk/Interval) in onboarding and run setup
2. Activity-aware coaching with walking-specific language
3. 500m splits for walkers vs 1km for runners
4. Walking-optimized phase timing

**Timeline**: 2-3 hours  
**Complexity**: Medium  
**Breaking Changes**: None - fully backward compatible

---

## Core Requirements

### 1. Database Schema (Shared)
✅ **Already Done** - No iOS changes needed

The shared schema has been updated:
```
users.defaultSessionType: text (default: 'run')
```

---

### 2. User Profile & Onboarding

**File**: `ProfileSetupScreen.kt` (equivalent iOS screen)

**Changes Needed**:

#### A. Add Activity Type to Profile Data Model
```swift
struct UserProfile {
    // ... existing fields ...
    var defaultSessionType: String = "run"  // "run" | "walk" | "interval"
}
```

#### B. Update Onboarding UI
Add dropdown/picker after "Desired Fitness Level" screen:

```swift
Section("Preferred Activity Type") {
    Picker("Activity Type", selection: $profile.defaultSessionType) {
        Text("Running").tag("run")
        Text("Walking").tag("walk")
        Text("Interval Training").tag("interval")
    }
    .pickerStyle(.segmented)
}
```

#### C. Save to Database
When calling the profile update API, include:
```swift
{
    "name": "...",
    "dob": "...",
    // ... other fields ...
    "defaultSessionType": profile.defaultSessionType  // ← ADD THIS
}
```

---

### 3. Run Setup Screen

**File**: `MainScreen.kt` / equivalent iOS navigation controller

**Current**: `PhysicalActivityType` enum already exists with RUN and WALK values ✅

**Changes Needed**:

#### A. Default from User Profile
When initializing run setup, use user's saved preference:
```swift
let sessionType = userProfile?.defaultSessionType ?? "run"

let config = RunSetupConfig(
    activityType: sessionType == "walk" ? .WALK : .RUN,
    // ... other fields ...
)
```

#### B. Allow User Override
Add toggle/button to switch activity type before starting:
```swift
Button(action: {
    selectedActivityType = selectedActivityType == .RUN ? .WALK : .RUN
}) {
    HStack {
        Image(systemName: selectedActivityType == .RUN ? "figure.run" : "figure.walk")
        Text(selectedActivityType == .RUN ? "Running" : "Walking")
    }
}
```

---

### 4. Run Session Screen

**File**: `RunSession.tsx` (web equivalent) → iOS RunSessionViewController

**A. Split Frequency Logic**

Add function to determine split frequency:
```swift
func getSplitFrequency(sessionType: String) -> Double {
    return sessionType == "walk" ? 0.5 : 1.0  // 500m for walk, 1km for run
}
```

**B. Split Detection Update**

Currently, iOS uses `Math.floor(distance)` for km detection.

Replace with:
```swift
let splitFrequency = getSplitFrequency(sessionType: sessionMetadata.sessionType)
let currentSplitDistance = floor(distance / splitFrequency) * splitFrequency

if currentSplitDistance > lastKmAnnounced && currentSplitDistance > 0 {
    // Trigger split coaching
    lastKmAnnounced = currentSplitDistance
    
    let splitLabel = splitFrequency == 0.5 
        ? String(format: "%.1f", currentSplitDistance) + "km"
        : String(Int(currentSplitDistance)) + "km"
    
    // Display: "3.0km - 12:30 split" or "3.5km - 12:25 split"
}
```

**C. Pass sessionType to Coaching APIs**

Update both coaching API calls to include:
```swift
let payload: [String: Any] = [
    "currentPace": "...",
    "distance": distance,
    // ... existing fields ...
    "sessionType": sessionMetadata.sessionType  // ← ADD THIS
]

URLSession.shared.dataTask(with: request, completionHandler: { ... })
```

---

### 5. Coaching Statements Integration

**File**: `shared/coaching-statements.ts` (shared across platforms)

✅ **Already Done** - No iOS changes needed

The shared Kotlin code already has:
- 30+ walking-specific statements
- Activity-aware phase determination
- Walking-optimized phase thresholds

iOS Kotlin integration already handles this through `selectStatement()` function.

**iOS Just Needs to Call**:
```swift
// In RunSessionViewModel or equivalent
let statement = selectStatement(
    currentPhase: phase,
    usageCounts: statementUsage,
    preferPhaseSpecific: true,
    activityType: sessionType  // ← PASS THIS
)
```

---

### 6. Phase Timing (Advanced Feature)

**File**: `shared/coaching-statements.ts` → iOS integration

The iOS app likely uses `determinePhase()` function to select coaching statements.

**Update the call**:
```swift
// Before
let phase = determinePhase(distanceKm: distance, totalDistanceKm: targetDistance)

// After
let phase = determinePhase(
    distanceKm: distance,
    totalDistanceKm: targetDistance,
    activityType: sessionMetadata.sessionType  // ← ADD THIS
)
```

This will automatically use:
- Walking phase thresholds if `sessionType = "walk"`
- Running phase thresholds if `sessionType = "run"`

---

## Implementation Checklist

### Phase 1: User Profile & Setup (30 minutes)
- [ ] Add `defaultSessionType` to UserProfile model
- [ ] Add activity type picker to onboarding screen
- [ ] Update profile API calls to include `defaultSessionType`
- [ ] Add activity type override button to run setup screen

### Phase 2: Run Session Coaching (60 minutes)
- [ ] Add `sessionType` to RunSessionMetadata/Config
- [ ] Implement `getSplitFrequency()` function
- [ ] Update split detection logic (500m for walkers)
- [ ] Update split display label
- [ ] Pass `sessionType` to both coaching APIs
- [ ] Update phase determination to use activity-aware thresholds
- [ ] Test with multiple walker paces

### Phase 3: Testing & QA (30 minutes)
- [ ] Test walker at 10:00/km: 500m splits every 5 minutes ✓
- [ ] Test walker at 12:30/km: 500m splits every 6 minutes ✓
- [ ] Test walker at 15:00/km: 500m splits every 7.5 minutes ✓
- [ ] Test runner at 6:00/km: 1km splits every 6 minutes ✓
- [ ] Verify phase transitions feel natural
- [ ] Verify walking statements are selected
- [ ] Verify running statements unchanged

---

## API Integration

### Profile Update API
```
PATCH /api/users/{id}
{
    "name": "...",
    "dob": "...",
    "defaultSessionType": "walk"  ← NEW FIELD
}
```

### Coaching API (Dynamic Pace)
```
POST /api/ai/dynamic-pace-coaching
{
    "currentPace": "...",
    "distance": 2.5,
    "sessionType": "walk"  ← NEW FIELD
}
```

### Coaching API (Main)
```
POST /api/ai/coaching
{
    "currentPace": "...",
    "distance": 2.5,
    "sessionType": "walk"  ← NEW FIELD
}
```

---

## Key Data Models

### RunSetupConfig
```swift
struct RunSetupConfig {
    var activityType: PhysicalActivityType = .RUN  // ← ALREADY EXISTS
    var sessionType: String {  // ← NEW COMPUTED PROPERTY
        activityType == .WALK ? "walk" : "run"
    }
    // ... other fields ...
}
```

### Session Metadata
```swift
struct SessionMetadata {
    var sessionType: String  // ← ADD THIS
    var targetDistance: String
    var exerciseType: String  // ← RELATED (keep existing)
    // ... other fields ...
}
```

---

## Code Patterns to Follow

### Pattern 1: Activity-Aware Logic
```swift
func getCoachingFrequency(sessionType: String) -> TimeInterval {
    return sessionType == "walk" ? 300 : 600  // 5 min vs 10 min
}
```

### Pattern 2: Conditional Behavior
```swift
if sessionMetadata.sessionType == "walk" {
    // Show 500m splits
    splitFrequency = 0.5
} else {
    // Show 1km splits
    splitFrequency = 1.0
}
```

### Pattern 3: API Integration
```swift
let body = [
    "userId": userId,
    "sessionType": sessionMetadata.sessionType,  // ← Always include
    // ... other fields ...
]
```

---

## Testing Strategy

### Unit Tests
```swift
func testSplitFrequencyWalker() {
    XCTAssertEqual(getSplitFrequency(sessionType: "walk"), 0.5)
}

func testSplitFrequencyRunner() {
    XCTAssertEqual(getSplitFrequency(sessionType: "run"), 1.0)
}

func testPhaseThresholdWalker() {
    let phase = determinePhase(
        distanceKm: 1.0,
        totalDistanceKm: 10.0,
        activityType: "walk"
    )
    XCTAssertEqual(phase, .mid)  // Walker at 10% should be in early/mid
}

func testPhaseThresholdRunner() {
    let phase = determinePhase(
        distanceKm: 1.0,
        totalDistanceKm: 10.0,
        activityType: "run"
    )
    XCTAssertEqual(phase, .early)  // Runner at 10% should be in early
}
```

### Integration Tests
```swift
func testWalkerSessionSplits() {
    // Start 6km walk at 12:00/km pace
    // Verify splits trigger at: 0.5km, 1.0km, 1.5km, 2.0km, etc.
}

func testRunnerSessionSplits() {
    // Start 6km run at 6:00/km pace
    // Verify splits trigger at: 1km, 2km, 3km, 4km, 5km, 6km
}

func testWalkingCoachingStatements() {
    // Verify "walk_early_1" type statements are selected
    // Verify running statements not mixed in
}
```

---

## Troubleshooting Guide

### Issue: Splits not triggering at right distance
**Check**:
- `getSplitFrequency()` returns correct value (0.5 for walk, 1.0 for run)
- Split distance calculation: `floor(distance / splitFrequency) * splitFrequency`
- Compare with `lastKmAnnounced` to avoid duplicates

### Issue: Wrong coaching statements appearing
**Check**:
- `sessionType` is being passed to `selectStatement()`
- Walking statements have `activityType = "walk"`
- Running statements have `activityType = "run"` or nil
- Filtering logic in `getAvailableStatements()`

### Issue: Phase transitions at wrong time
**Check**:
- `determinePhase()` receives correct `activityType`
- Walking thresholds used: `WALKING_PHASE_THRESHOLDS`
- Running thresholds used: `DEFAULT_PHASE_THRESHOLDS`
- Thresholds are percentage-based for total distance

---

## Documentation to Update

After implementation, update:
- [ ] README with walking session feature
- [ ] User guide screenshots showing activity type selection
- [ ] In-app help text for activity type options
- [ ] Release notes mentioning walking support

---

## Performance Considerations

✅ **No Impact**:
- Split frequency calculation is O(1)
- No new database queries
- Existing session data reused
- Phase determination optimized

**Benchmarks**:
- Split detection: <1ms per frame
- Coaching API call: Same as current (sessionType is one new field)

---

## Backward Compatibility

✅ **Fully Compatible**:
- Existing runners continue unchanged
- `sessionType` defaults to "run" if missing
- No database migration needed
- API handles missing field gracefully

---

## Success Criteria

✅ **Implementation Complete When**:
1. Walker sessions show 500m splits ✓
2. Runner sessions show 1km splits ✓
3. Phase transitions feel natural for each activity ✓
4. Walking coaching statements appear in walks ✓
5. Running statements unchanged in runs ✓
6. All tests pass ✓
7. No linting errors ✓
8. Backward compatible with existing data ✓

---

## Additional Context

### What's Already Done (Web/Android)
- ✅ 30+ walking coaching statements
- ✅ Activity-aware pace context directives
- ✅ 500m split detection for walkers
- ✅ Walking-optimized phase thresholds
- ✅ API integration for sessionType

### What iOS Needs to Implement
- UI for activity type selection (onboarding + run setup)
- Split frequency logic
- Split detection update
- API payload changes
- Phase determination update
- Statement selection update

### Similar Code Exists
- Android: `MainScreen.kt`, `RunSession.tsx`
- Web: `RunSession.tsx`, `ProfileSetup.tsx`
- Reference these for patterns and logic

---

## Questions for Clarification

1. **Session Type Selection**: Should activity type be:
   - Sticky per user (saved in profile)?
   - Selectable per session (override each time)?
   - **Answer**: Both - default from profile, override option in run setup

2. **Display Format**: For 500m splits, show as:
   - "3.5km" (decimal)?
   - "3km 500m" (formatted)?
   - **Answer**: Decimal "3.5km" to match web/Android

3. **Push Notification Wording**: For walking splits, should say:
   - "Walking split complete"?
   - "500m complete"?
   - **Answer**: "500m split" to match runners' 1km split language

---

## Summary

**Scope**: Add walking session support to iOS app  
**Effort**: 2-3 hours (mainly UI + API integration)  
**Complexity**: Medium (logic mostly done in shared code)  
**Risk**: Low (backward compatible, proven on Android/Web)  
**Impact**: Enable premium walking experience on iOS platform

All backend, shared coaching logic, and language work is complete. iOS just needs UI and split frequency implementation.

✅ **Ready to implement** 🚀
