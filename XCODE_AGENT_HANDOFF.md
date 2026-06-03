# Xcode Agent Handoff - Walking Session iOS Implementation

## Status: Ready for Implementation 🚀

The walking session feature is **fully implemented on Android/Web**. This document provides everything the Xcode agent needs to implement matching iOS functionality.

---

## What's Complete (No iOS Work Needed)

✅ **Backend**:
- API accepts `sessionType` parameter
- Endpoints support "run" and "walk" activity types
- No database migrations needed

✅ **Shared Coaching Logic**:
- 30+ walking-specific coaching statements
- Activity-aware pace context directives
- Walking-optimized phase thresholds
- Shared `coaching-statements.ts` handles everything

✅ **Android/Web Implementation**:
- Full UI for activity type selection
- 500m split logic for walkers
- 1km split logic for runners
- API integration complete
- All tests passing

---

## What iOS Needs (Implementation Guide)

### Scope: 3 Main Components

#### 1. **Onboarding UI** (30 minutes)
Add activity type selector after fitness level screen

**Location**: ProfileSetupScreen or equivalent  
**What to add**: Picker with "Running", "Walking", "Interval Training"  
**What to save**: `defaultSessionType` to user profile

#### 2. **Run Setup UI** (15 minutes)
Allow users to override default activity type

**Location**: Run setup screen  
**What to add**: Activity type toggle/selector before "Start" button  
**What to do**: Pass selected type to RunSessionConfig

#### 3. **Split Frequency Logic** (1 hour 15 minutes)
Implement 500m splits for walkers, 1km for runners

**Location**: RunSession.swift  
**What to add**:
- `getSplitFrequency()` function
- Updated split detection logic
- Pass `sessionType` to coaching APIs
- Update phase determination

---

## Implementation Roadmap

### Phase 1: UI Components (45 minutes)
```
Task                          Time      Files
─────────────────────────────────────────────
Add profile model field       5 min     UserProfile.swift
Onboarding picker UI          15 min    ProfileSetupScreen.swift
Profile API update            10 min    APIService.swift
Run setup toggle UI           10 min    RunSetupScreen.swift
Test UI flow                  5 min     Tests
```

### Phase 2: Coaching Logic (75 minutes)
```
Task                          Time      Files
─────────────────────────────────────────────
getSplitFrequency() function  10 min    RunSession.swift
Split detection update        25 min    RunSession.swift
Phase determination update    10 min    RunSession.swift
Dynamic pace coaching API     10 min    RunSession.swift
Main coaching API             10 min    RunSession.swift
Split display labels          10 min    RunSession.swift
Test split logic              10 min    Tests
```

### Phase 3: Testing & Polish (30 minutes)
```
Task                          Time      Files
─────────────────────────────────────────────
Unit tests                    15 min    Tests
Integration tests             10 min    Tests
Manual QA                     5 min     Manual
```

**Total**: ~2.5 hours

---

## Key Code Patterns

### Pattern 1: Activity-Aware Logic
```swift
func getSplitFrequency(sessionType: String) -> Double {
    return sessionType == "walk" ? 0.5 : 1.0
}

// Usage:
let frequency = getSplitFrequency(sessionType: "walk")  // Returns 0.5
```

### Pattern 2: Split Detection
```swift
let splitFrequency = getSplitFrequency(sessionType: sessionMetadata.sessionType)
let currentSplitDistance = floor(distance / splitFrequency) * splitFrequency

if currentSplitDistance > lastKmAnnounced && currentSplitDistance > 0 {
    // Trigger split coaching
    lastKmAnnounced = currentSplitDistance
}
```

### Pattern 3: API Integration
```swift
let payload = [
    "userId": userId,
    "sessionType": sessionMetadata.sessionType,  // ← Always include
    // ... other fields ...
]
```

---

## Reference Materials Provided

All in the project root:

1. **iOS_WALKING_SESSION_IMPLEMENTATION_BRIEF.md**
   - Complete implementation guide
   - API documentation
   - Testing strategy
   - Troubleshooting guide

2. **iOS_QUICK_REFERENCE.md**
   - TL;DR version
   - Copy-paste code blocks
   - Quick checklist

3. **WALKING_COACHING_EXAMPLES.md**
   - Sample user experience
   - Coaching message examples
   - Phase transition examples

4. **WALKING_SPLITS_AND_PHASES_OPTIMIZATION.md**
   - Technical details
   - Phase threshold tables
   - Frequency comparisons

5. **WALKING_FRIENDLY_STATUS.md**
   - Overall feature overview
   - Impact summary
   - User benefits

---

## Data Models (Create/Update)

### UserProfile Extension
```swift
struct UserProfile {
    // ... existing fields ...
    var defaultSessionType: String = "run"  // NEW
}
```

### RunSetupConfig Extension
```swift
struct RunSetupConfig {
    var activityType: PhysicalActivityType  // ALREADY EXISTS
    var sessionType: String {  // NEW COMPUTED
        return activityType == .WALK ? "walk" : "run"
    }
}
```

### SessionMetadata Extension
```swift
struct SessionMetadata {
    var sessionType: String  // NEW
    var targetDistance: String
    var exerciseType: String  // KEEP EXISTING
    // ... other fields ...
}
```

---

## API Changes Required

**No backend changes needed** ✅

Just add `sessionType` field to existing endpoints:

```
Profile Update
POST /api/users/{id}
+ "defaultSessionType": "walk"

Dynamic Pace Coaching
POST /api/ai/dynamic-pace-coaching
+ "sessionType": "walk"

Main Coaching
POST /api/ai/coaching
+ "sessionType": "walk"
```

All endpoints already accept these fields.

---

## Testing Scenarios

### Walker Tests
```swift
func testWalkerSplitFrequency() {
    let freq = getSplitFrequency(sessionType: "walk")
    XCTAssertEqual(freq, 0.5)
}

func testWalkerSplitsAt10KmPerHour() {
    // 10km walk at 12:00/km = 120 minutes
    // Splits at: 0.5, 1.0, 1.5, 2.0, ..., 10.0
    // Frequency: Every 6 minutes
}
```

### Runner Tests
```swift
func testRunnerSplitFrequency() {
    let freq = getSplitFrequency(sessionType: "run")
    XCTAssertEqual(freq, 1.0)
}

func testRunnerSplitsAt6KmPerHour() {
    // 10km run at 6:00/km = 60 minutes
    // Splits at: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    // Frequency: Every 6 minutes
}
```

---

## Acceptance Criteria

✅ **Feature is complete when**:

**UI/UX**:
- [ ] Activity type selectable in onboarding
- [ ] Activity type overridable in run setup
- [ ] Selection persists to user profile
- [ ] UI feels native and polished

**Functionality**:
- [ ] Walker gets 500m splits (0.5, 1.0, 1.5, ...)
- [ ] Runner gets 1km splits (1, 2, 3, ...)
- [ ] Coaching frequency equivalent per hour
- [ ] Phase transitions feel natural
- [ ] Walking statements appear
- [ ] Running behavior unchanged

**Quality**:
- [ ] No linting errors
- [ ] All tests pass
- [ ] Backward compatible
- [ ] Performance impact negligible
- [ ] No breaking changes

---

## Estimated Timeline

| Phase | Task | Duration |
|-------|------|----------|
| 1 | Onboarding UI | 30 min |
| 1 | Run setup UI | 15 min |
| 2 | Split logic implementation | 75 min |
| 3 | Testing & QA | 30 min |
| **Total** | | **~2.5 hours** |

---

## Common Pitfalls to Avoid

❌ **Don't**:
- Modify running behavior
- Break existing runner sessions
- Add new database migrations
- Change API contract
- Forget `sessionType` in API calls

✅ **Do**:
- Keep runner experience identical
- Use 0.5 and 1.0 for split frequency
- Pass `sessionType` to both coaching APIs
- Update phase determination with activityType
- Test both walker and runner scenarios

---

## Success Signals

✅ **You'll know it's working when**:
1. Walker sets activity type in onboarding
2. Walker gets coaching every 6-7 minutes (500m splits)
3. Runner gets coaching every 6 minutes (1km splits)
4. Phase transitions feel natural for each activity
5. Walking coaching statements appear
6. All tests pass
7. Zero breaking changes to runners

---

## Support Resources

**For detailed information, see**:
- `iOS_WALKING_SESSION_IMPLEMENTATION_BRIEF.md` — Full guide
- `iOS_QUICK_REFERENCE.md` — Code snippets
- Android/Web code in `client/src/pages/RunSession.tsx` — Reference implementation
- `shared/coaching-statements.ts` — Shared logic (no changes needed)

**Questions to ask**:
- Is split frequency 0.5km for walkers and 1km for runners?
- Should activity type be saved to profile or per-session?
- What UI framework for pickers (UIKit, SwiftUI)?
- Any specific design guidelines for new UI?

---

## Final Notes

✅ **This is a solid implementation**:
- Proven on Android/Web
- Zero backend changes needed
- Backward compatible
- Well-documented
- Straightforward logic

✅ **Ready to go**:
- All context provided
- Code patterns clear
- Test scenarios defined
- Success criteria listed

**Handoff Status**: Complete and ready for Xcode agent 🚀

---

## Next Steps for Xcode Agent

1. **Read**: `iOS_WALKING_SESSION_IMPLEMENTATION_BRIEF.md` (full context)
2. **Reference**: `iOS_QUICK_REFERENCE.md` (quick lookup)
3. **Implement**: 3 components in order (UI, Logic, Testing)
4. **Test**: All scenarios pass
5. **Deploy**: PR ready for merge

**Estimated completion**: 2-3 hours from start to PR

Good luck! 🍀
